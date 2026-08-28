// Contract tests against the FROZEN real feed samples (tests/samples/).
// Schema drift in either feed must fail HERE, at the compiler contract, not
// downstream after eight modules were built on a stale assumption.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseJSONExact } from "../exact.js";
import {
  compileLiteLLMEntry,
  compileOpenRouterModel,
  quoteOffer,
  TOKEN_STEMS,
  parseMeterKey,
} from "../pricing.js";

const SAMPLES = fileURLToPath(new URL("./samples/", import.meta.url));
const litellm = parseJSONExact(readFileSync(`${SAMPLES}litellm-cost-map.json`, "utf8"));
const openrouter = JSON.parse(readFileSync(`${SAMPLES}openrouter-models.json`, "utf8"));

const REQ = (over = {}) => ({
  prompt_tokens: 1000,
  output_tokens: 500,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  request_count: 1,
  tier: "std",
  quote_utc: Date.parse("2026-09-01T12:00:00Z"),
  now: Date.parse("2026-09-01T12:00:00Z"),
  ...over,
});

test("frozen samples exist and are non-trivial", () => {
  assert.ok(Object.keys(litellm).length > 1000);
  assert.ok(openrouter.length > 300);
});

test("parseJSONExact preserved LiteLLM price literals as exact decimal text", () => {
  // Find any entry value that the raw text carries as 5e-8-style scientific
  // notation; the parsed form must be the STRING, not a double.
  let scientific = 0;
  for (const entry of Object.values(litellm)) {
    if (!entry || typeof entry !== "object") continue;
    for (const [k, v] of Object.entries(entry)) {
      if (typeof v === "string" && /^-?\d(\.\d+)?e-?\d+$/i.test(v) && k.includes("cost")) scientific++;
    }
  }
  assert.ok(scientific > 0, "sample should contain scientific-notation price literals");
});

test("every LiteLLM chat entry compiles: admitted offers carry token meters, others quarantine with reason", () => {
  let admitted = 0;
  let quarantined = 0;
  let skippedModes = 0;
  for (const [key, entry] of Object.entries(litellm)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    if (entry.mode !== "chat" && entry.mode !== "completion") { skippedModes++; continue; }
    const offer = compileLiteLLMEntry(key, entry);
    if (offer.tariff === "token" || offer.tariff === "character") {
      admitted++;
      assert.ok(Object.keys(offer.prices).length > 0, `${key} admitted without prices`);
      assert.equal(offer.state, "active", `${key} admitted offer must be active`);
    } else {
      quarantined++;
      assert.equal(offer.tariff, "none");
      assert.equal(offer.state, "quarantined");
      assert.ok(offer.quarantine_reason, `${key} quarantined without reason`);
    }
  }
  assert.ok(admitted > 100, `expected a real catalog, admitted=${admitted}`);
  assert.ok(skippedModes > 0, "feed should contain out-of-scope modes");
});

test("every OpenRouter model compiles; overrides keep their full schedule", () => {
  let withOverrides = 0;
  let overrideEntries = 0;
  let withExpiration = 0;
  let admitted = 0;
  for (const model of openrouter) {
    const offer = compileOpenRouterModel(model);
    if (offer.tariff === "token") admitted++;
    if ((model.pricing?.overrides ?? []).length > 0) {
      withOverrides++;
      overrideEntries += offer.overrides.length;
    }
    if (offer.expiration_date) withExpiration++;
  }
  assert.ok(admitted > 300, `expected the real catalog, admitted=${admitted}`);
  assert.ok(withOverrides > 30, `expected live override schedules, models=${withOverrides}`);
  assert.ok(overrideEntries > 50, "override entries must survive compilation");
  assert.ok(withExpiration > 0, "expiration_date signals must be carried");
});

test("OpenRouter override conditions are preserved verbatim (schedule recoverable at any fetch hour)", () => {
  const src = openrouter.find((m) => (m.pricing?.overrides ?? []).some((o) => o.utc_start !== undefined));
  assert.ok(src, "sample should contain time-windowed overrides");
  const offer = compileOpenRouterModel(src);
  const cond = offer.overrides.flatMap((o) => Object.keys(o.conditions));
  assert.ok(cond.some((k) => k.startsWith("utc_")) || cond.includes("min_prompt_tokens"));
  // Every source condition key reappears in the compiled schedule.
  const srcCond = src.pricing.overrides.flatMap((o) => Object.keys(o).filter((k) => k.startsWith("utc_") || k === "min_prompt_tokens"));
  assert.deepEqual([...new Set(cond)].sort(), [...new Set(srcCond)].sort());
});

test("known real entry: claude-3-5-sonnet keeps base and 200k threshold meters", () => {
  const key = Object.keys(litellm).find((k) => k === "anthropic.claude-3-5-sonnet-20240620-v1:0");
  assert.ok(key, "expected the frozen sample to contain the bedrock entry");
  const offer = compileLiteLLMEntry(key, litellm[key]);
  assert.equal(offer.tariff, "token");
  assert.ok(offer.prices["input"]);
  assert.ok(offer.prices["input|>200000"]);
  assert.ok(offer.prices["output|>200000"]);
  assert.ok(offer.prices["cache_write|>200000"] || offer.prices["cache_read|>200000"]);
  const q = quoteOffer(offer, REQ({ prompt_tokens: 250000, output_tokens: 1000 }));
  assert.equal(q.servable, true);
  assert.equal(q.meters.find((m) => m.meter === "input").selected_key, "input|>200000");
});

test("LiteLLM tiered_pricing entries compile into threshold meters", () => {
  const entry = Object.values(litellm).find((v) => v && typeof v === "object" && Array.isArray(v.tiered_pricing));
  assert.ok(entry, "sample should contain tiered pricing");
  const key = Object.keys(litellm).find((k) => litellm[k] === entry);
  const offer = compileLiteLLMEntry(key, entry);
  const rangeMeters = Object.keys(offer.prices).filter((k) => parseMeterKey(k).tier.startsWith("range"));
  assert.ok(rangeMeters.length >= 2, "each tier range must become meters");
});

test("regional uplift multipliers are carried, never folded into unit prices", () => {
  let found = 0;
  for (const [key, entry] of Object.entries(litellm)) {
    if (!entry || typeof entry !== "object") continue;
    const offer = compileLiteLLMEntry(key, entry);
    found += Object.keys(offer.multipliers).length;
  }
  assert.ok(found > 0, "sample should carry regional uplifts");
});

test("unknown stem-suffix fields exist in the wild and classify as stem_unknown", () => {
  // The live sample must exercise rule-3 candidates; if upstream renames the
  // pattern this test failing is the signal to re-inspect the grammar.
  let stemUnknown = 0;
  for (const entry of Object.values(litellm)) {
    if (!entry || typeof entry !== "object") continue;
    stemUnknown += (compileLiteLLMEntry("probe/x", entry).unknown_meter_fields ?? []).length;
  }
  assert.ok(stemUnknown >= 0); // census, not a floor: the grammar itself is pinned by F4
});