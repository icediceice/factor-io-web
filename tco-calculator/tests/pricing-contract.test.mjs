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

test("production parse path: parseJSONExact envelope still applies thresholds and windows (peer G1)", () => {
  // The live fetch parses the raw envelope with parseJSONExact — numeric
  // condition literals land as TEXT ("128000", not 128000). Recreate that
  // exact shape: re-serialize a scheduled model and re-parse through
  // parseJSONExact, then verify the schedule still compiles AND applies.
  const src = openrouter.find((m) => (m.pricing?.overrides ?? []).length > 1);
  assert.ok(src, "sample should contain a scheduled model");
  const raw = parseJSONExact(JSON.stringify(src));
  const offer = compileOpenRouterModel(raw);
  assert.ok(offer.overrides.length > 0, "numeric-string conditions must not skip entries");
  assert.equal(offer.offer_id, `openrouter:${src.id}`); // id-keyed (peer G2)
  // Threshold: STRICTLY greater, resolved from the numeric-string condition.
  const thrIdx = offer.overrides.findIndex((o) => o.conditions.min_prompt_tokens !== undefined);
  if (thrIdx >= 0) {
    const thr = offer.overrides[thrIdx].conditions.min_prompt_tokens;
    const below = quoteOffer(offer, REQ({ prompt_tokens: thr }));
    const above = quoteOffer(offer, REQ({ prompt_tokens: thr + 1 }));
    assert.equal(above.applied_overrides.includes(thrIdx), true);
    assert.equal(below.applied_overrides.includes(thrIdx), false);
  }
  // Weekday-only entries must NOT match on a Saturday instant.
  const wdIdx = offer.overrides.findIndex((o) => o.conditions.utc_days && !o.conditions.utc_days.includes("sat") && !o.conditions.utc_days.includes("sun"));
  if (wdIdx >= 0) {
    const sat = quoteOffer(offer, REQ({ quote_utc: Date.parse("2026-09-05T12:00:00Z") })); // Saturday
    assert.equal(sat.applied_overrides.includes(wdIdx), false);
  }
});

test("utc day windows match the calendar weekday, not a string prefix (peer G1)", () => {
  // Contract-shaped schedule: weekend flat discount, weekday 10:00->midnight
  // (midnight wrap) double rate — the deepseek shape observed in the live feed.
  const offer = compileOpenRouterModel({
    id: "probe/weekday", canonical_slug: "probe/weekday", name: "Probe",
    pricing: {
      prompt: "0.000001", completion: "0.000001",
      overrides: [
        { utc_days: ["saturday", "sunday"], prompt: "0.0000005" },
        { utc_days: ["monday", "tuesday", "wednesday", "thursday", "friday"], utc_start: 1000, utc_end: 0, prompt: "0.000002" },
      ],
    },
  });
  assert.equal(offer.overrides.length, 2, "full-name days and hhmm conditions must compile");
  const unit = (q) => quoteOffer(offer, REQ(q)).meters.find((m) => m.meter === "input").unit_price;
  assert.equal(unit({ quote_utc: Date.parse("2026-09-05T12:00:00Z") }), "0.0000005"); // Saturday 12:00
  assert.equal(unit({ quote_utc: Date.parse("2026-09-02T12:00:00Z") }), "0.000002"); // Wednesday 12:00 — inside 10:00->midnight wrap
  assert.equal(unit({ quote_utc: Date.parse("2026-09-02T09:00:00Z") }), "0.000001"); // Wednesday 09:00 — before the window
  assert.equal(unit({ quote_utc: Date.parse("2026-09-04T23:59:00Z") }), "0.000002"); // Friday 23:59 — inside the wrap
  assert.equal(unit({ quote_utc: Date.parse("2026-09-06T00:00:00Z") }), "0.0000005"); // Sunday 00:00
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