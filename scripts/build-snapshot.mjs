#!/usr/bin/env node
// build-snapshot.mjs — reduce the live pricing feeds into the client snapshot.
//
// STATEFUL by contract: buildSnapshot({ previousManifest, refreshId, fetchedAt,
// feeds }) distinguishes a first omission from a third (SPEC 3.4 offer state
// machine), preserves last_success_at across failed refreshes, and NEVER
// fabricates a timestamp. OpenRouter pricing.overrides[] is preserved in full
// so the complete UTC schedule is recoverable regardless of fetch hour — a
// builder that stored only top-level keys would bake the fetch-time window in
// as the model's price forever.
//
// Payload (SPEC 9.2/9.3): manifest.json (always fetched, <= 64KB compressed)
// + ONE content-addressed catalog resource (ResourceRef inline|external union
// in v1; per-model slices later are ADDITIVE — the client resolves refs, not
// paths). Sharding is triggered by a measured ceiling breach, never intuition.
//
// Run: node scripts/build-snapshot.mjs [--samples]   (Node >= 20, no deps)
//   default: fetch live feeds;  --samples: compile the frozen test samples
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { parseJSONExact } from "../tco-calculator/exact.js";
import {
  compileLiteLLMEntry,
  compileOpenRouterModel,
  nextState,
  N_CONSECUTIVE_RETIRE,
} from "../tco-calculator/pricing.js";

const UA = "factor-io-tco-ingestion/1.0 (static-site pricing snapshot; contact admin@factor-io.com)";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_DIR = `${ROOT}tco-calculator/data/`;
const SAMPLES_DIR = `${ROOT}tco-calculator/tests/samples/`;
const MANIFEST_PATH = `${DATA_DIR}manifest.json`;

const SOURCES = {
  openrouter: { ttl_days: 3 }, // [ASSUMED — spec author; open decision O2]
  litellm: { ttl_days: 3 },
};

// ---------------------------------------------------------------- fetch layer
async function fetchJSON(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function fetchOpenRouterAll() {
  const models = [];
  let url = "https://openrouter.ai/api/v1/models";
  let totalCount = null;
  let pages = 0;
  while (url) {
    const page = await fetchJSON(url);
    if (!page || !Array.isArray(page.data)) throw new Error("openrouter: unexpected envelope shape");
    if (totalCount === null) totalCount = page.total_count;
    models.push(...page.data);
    url = page.links?.next ?? null;
    if (++pages > 100) throw new Error("openrouter: pagination runaway");
  }
  if (Number.isFinite(totalCount) && models.length !== totalCount) {
    throw new Error(`openrouter: truncated list — ${models.length} of ${totalCount}`);
  }
  return models;
}

const LITELLM_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

// --------------------------------------------------------------- snapshot core
export function buildSnapshot({ previousManifest = null, refreshId, fetchedAt, feeds }) {
  const now = fetchedAt;
  const prevSources = previousManifest?.sources ?? {};
  const prevState = new Map();
  for (const o of previousManifest?.offers_state ?? []) prevState.set(o.offer_id, o);

  const offers = {};
  const sourceRecords = {};
  const sourceOffers = { openrouter: [], litellm: [] };
  const provenance = { openrouter: { logs: [] }, litellm: { logs: [] } };

  // --- OpenRouter (values are strings; plain parse is exact)
  if (feeds.openrouter.ok) {
    for (const model of feeds.openrouter.value) {
      const offer = compileOpenRouterModel(model);
      offers[offer.offer_id] = offer;
      sourceOffers.openrouter.push(offer.offer_id);
      if (offer.provenance.logs.length) provenance.openrouter.logs.push(...offer.provenance.logs.map((l) => ({ offer: offer.offer_id, ...l })));
    }
  } else {
    provenance.openrouter.error = String(feeds.openrouter.error ?? "fetch failed");
  }

  // --- LiteLLM (numeric literals -> exact decimal text via parseJSONExact)
  if (feeds.litellm.ok) {
    for (const [key, entry] of Object.entries(feeds.litellm.value)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      if (entry.mode !== "chat" && entry.mode !== "completion") {
        provenance.litellm.logs.push({ offer: `litellm:${key}`, rule: "skipped_out_of_scope_mode", mode: entry.mode ?? null });
        continue;
      }
      const offer = compileLiteLLMEntry(key, entry);
      offers[offer.offer_id] = offer;
      sourceOffers.litellm.push(offer.offer_id);
      if (offer.provenance.logs.length) provenance.litellm.logs.push(...offer.provenance.logs.map((l) => ({ offer: offer.offer_id, ...l })));
    }
  } else {
    provenance.litellm.error = String(feeds.litellm.error ?? "fetch failed");
  }