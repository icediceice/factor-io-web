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
// Fetch TEXT and parse with parseJSONExact — never res.json(), which would
// detour every numeric price literal through IEEE-754 before we see it.
async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

async function fetchOpenRouterAllText() {
  const models = [];
  let url = "https://openrouter.ai/api/v1/models";
  let totalCount = null;
  let pages = 0;
  while (url) {
    const page = parseJSONExact(await fetchText(url));
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
export function buildSnapshot({ previousManifest = null, previousCatalog = null, refreshId, fetchedAt, feeds }) {
  const now = fetchedAt;
  const prevSources = previousManifest?.sources ?? {};
  // Offer state lives in the CATALOG (the manifest is the pointer); the publish
  // protocol commits the manifest + changed catalog together (SPEC 5.3).
  const prevState = new Map();
  for (const o of previousCatalog?.offers_state ?? []) prevState.set(o.offer_id, o);

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

  // --- Per-source SourceStatus envelopes FIRST (the state machine consults them).
  for (const [sourceId, cfg] of Object.entries(SOURCES)) {
    const prev = prevSources[sourceId] ?? null;
    const ok = feeds[sourceId]?.ok === true;
    const observed = ok ? new Date(now).toISOString() : prev?.observed_at ?? null; // never fabricated
    const lastSuccess = ok ? new Date(now).toISOString() : prev?.last_success_at ?? null;
    const missingStreak = ok ? 0 : (prev?.missing_streak ?? 0) + 1;
    sourceRecords[sourceId] = {
      source_id: sourceId,
      status: ok ? "fresh" : "error",
      observed_at: observed,
      last_success_at: lastSuccess,
      expires_at: observed ? new Date(Date.parse(observed) + cfg.ttl_days * 86400000).toISOString() : null,
      root_digest: ok ? digest(JSON.stringify(sourceOffers[sourceId])) : prev?.root_digest ?? null,
      record_count: ok ? sourceOffers[sourceId].length : prev?.record_count ?? 0,
      missing_streak: missingStreak,
    };
  }

  // --- Offer state machine against the previous refresh (SPEC 3.4).
  const offersState = [];
  for (const [offerId, offer] of Object.entries(offers)) {
    const prev = prevState.get(offerId);
    const next = nextState(prev?.state ?? "active", { present: true, missingStreak: prev?.missing_streak ?? 0 });
    // expiration_date is a DIRECT retirement signal — cheaper and more accurate
    // than inferring retirement from absences.
    if (offer.expiration_date && Date.parse(offer.expiration_date) <= now) {
      next.state = "retired";
    }
    offer.state = next.state;
    offer.missing_streak = next.missing_streak;
    offersState.push({ offer_id: offerId, state: offer.state, missing_streak: offer.missing_streak });
  }
  // Absent offers streak toward retired — EXCEPT when their source errored:
  // an absence is only evidence when the source itself refreshed successfully.
  for (const [offerId, prev] of prevState) {
    if (offers[offerId]) continue;
    const prefix = offerId.split(":")[0];
    if (sourceRecords[prefix]?.status === "error") {
      offersState.push({ offer_id: offerId, state: prev.state, missing_streak: prev.missing_streak ?? 0 });
      continue;
    }
    const next = nextState(prev.state, { present: false, missingStreak: prev.missing_streak ?? 0 });
    offersState.push({ offer_id: offerId, state: next.state, missing_streak: next.missing_streak });
  }

  // --- Catalog resource + manifest index.
  const catalog = { offers, offers_state: offersState };
  const catalogBytes = Buffer.from(JSON.stringify(catalog));
  const snapshotDigest = digest(catalogBytes);
  const catalogPath = `catalog-${snapshotDigest}.json`;

  const manifest = {
    schema: "factor-io.tco-manifest/1.0.0",
    refresh_id: refreshId,
    generated_at: new Date(now).toISOString(),
    snapshot_digest: snapshotDigest,
    resources: {
      catalog: { kind: "external", path: catalogPath, digest: snapshotDigest, bytes: catalogBytes.length },
    },
    sources: sourceRecords,
    models: buildModelIndex(offers),
    provenance: {
      logs: [...provenance.openrouter.logs, ...provenance.litellm.logs],
      source_errors: { openrouter: provenance.openrouter.error ?? null, litellm: provenance.litellm.error ?? null },
      retired_threshold: N_CONSECUTIVE_RETIRE,
    },
  };
  return { manifest, catalog, catalogBytes };
}

function digest(input) {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

// The always-fetched index: identity (canonical slug), admitted meters, display
// name. Lean enough for the 64KB compressed ceiling.
function buildModelIndex(offers) {
  const models = [];
  for (const offer of Object.values(offers)) {
    if (offer.tariff === "none") continue; // quarantined offers stay in the catalog + provenance, not the index
    models.push({
      id: offer.offer_id,
      name: offer.display_name,
      tariff: offer.tariff,
      state: offer.state,
      meters: Object.keys(offer.prices),
    });
  }
  models.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // canonical order — determinism
  return models;
}

// ----------------------------------------------------------------------- main
async function main() {
  const useSamples = process.argv.includes("--samples");
  const fetchedAt = Date.now();
  const refreshId = `refresh-${fetchedAt}`;

  let previousManifest = null;
  try {
    previousManifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  } catch {
    // first run — no previous manifest
  }

  let feeds;
  if (useSamples) {
    feeds = {
      openrouter: { ok: true, value: JSON.parse(await readFile(`${SAMPLES_DIR}openrouter-models.json`, "utf8")) },
      litellm: { ok: true, value: parseJSONExact(await readFile(`${SAMPLES_DIR}litellm-cost-map.json`, "utf8")) },
    };
  } else {
    const orPromise = fetchOpenRouterAllText();
    const llPromise = fetchText(LITELLM_URL);
    const settled = await Promise.allSettled([orPromise, llPromise]);
    feeds = {
      openrouter: settled[0].status === "fulfilled" ? { ok: true, value: settled[0].value } : { ok: false, error: settled[0].reason },
      litellm: settled[1].status === "fulfilled" ? { ok: true, value: parseJSONExact(settled[1].value) } : { ok: false, error: settled[1].reason },
    };
  }

  const { manifest, catalogBytes, catalog } = buildSnapshot({ previousManifest, refreshId, fetchedAt, feeds });

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(`${DATA_DIR}${manifest.resources.catalog.path}`, catalogBytes);
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const manifestGz = gzipSync(manifestBytes).length;
  const catalogGz = gzipSync(catalogBytes).length;
  const models = manifest.models.length;
  const quarantined = Object.values(catalog.offers).filter((o) => o.state === "quarantined").length;
  console.log(JSON.stringify({
    refresh_id: manifest.refresh_id,
    models,
    quarantined,
    manifest_bytes: manifestBytes.length,
    manifest_gzip: manifestGz,
    manifest_budget_64kb: manifestGz <= 65536,
    catalog_bytes: catalogBytes.length,
    catalog_gzip: catalogGz,
    catalog_budget_256kb: catalogGz <= 262144,
    sources: Object.fromEntries(Object.entries(manifest.sources).map(([k, v]) => [k, { status: v.status, records: v.record_count }])),
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}