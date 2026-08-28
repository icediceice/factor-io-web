#!/usr/bin/env node
// Freeze the real pricing-feed bytes the contract tests compile against.
// Contract tests run on these PINNED bytes so feed schema drift fails here,
// before any engine module is trusted — never against whatever is live today.
//
// Run: node scripts/fetch-samples.mjs
// Node >= 20 (global fetch). No dependencies.
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const UA = "factor-io-tco-ingestion/1.0 (static-site pricing snapshot; contact admin@factor-io.com)";
const OUT = new URL("../tco-calculator/tests/samples/", import.meta.url);

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// OpenRouter paginates: `limit` defaults to 500 and `links.next` carries the rest.
// An unpaginated fetch silently truncates the catalog (>400 models).
async function fetchOpenRouterAll() {
  const models = [];
  let url = "https://openrouter.ai/api/v1/models";
  let pages = 0;
  let firstPageEnvelope = null;
  while (url) {
    const page = await fetchJSON(url);
    if (!page || !Array.isArray(page.data)) throw new Error("openrouter: unexpected envelope shape");
    if (firstPageEnvelope === null) firstPageEnvelope = page;
    models.push(...page.data);
    url = page.links?.next ?? null;
    if (++pages > 100) throw new Error("openrouter: pagination runaway (>100 pages)");
  }
  const total = firstPageEnvelope.total_count;
  if (Number.isFinite(total) && models.length !== total) {
    throw new Error(`openrouter: truncated list — fetched ${models.length} of total_count ${total}`);
  }
  return { models, firstPageEnvelope, pages };
}

const LITELLM_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const litellm = await fetchJSON(LITELLM_URL);
if (!litellm || typeof litellm !== "object" || Array.isArray(litellm)) {
  throw new Error("litellm: expected a top-level object keyed by model id");
}
const { models: openrouter, firstPageEnvelope, pages } = await fetchOpenRouterAll();

await mkdir(OUT, { recursive: true });

const litBytes = Buffer.from(JSON.stringify(litellm));
await writeFile(new URL("litellm-cost-map.json", OUT), litBytes);

const orBytes = Buffer.from(JSON.stringify(openrouter));
await writeFile(new URL("openrouter-models.json", OUT), orBytes);

const page1Bytes = Buffer.from(JSON.stringify(firstPageEnvelope));
await writeFile(new URL("openrouter-page1-envelope.json", OUT), page1Bytes);

const sha = (b) => createHash("sha256").update(b).digest("hex").slice(0, 16);
console.log(
  JSON.stringify(
    {
      litellm: { models: Object.keys(litellm).length, bytes: litBytes.length, sha: sha(litBytes) },
      openrouter: { models: openrouter.length, bytes: orBytes.length, pages, sha: sha(orBytes) },
      openrouter_page1_envelope: { bytes: page1Bytes.length },
    },
    null,
    2,
  ),
);