import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compileLiteLLMEntry,
  compileOpenRouterModel,
  quoteOffer,
  nextState,
  meterKey,
  classifyLiteLLMField,
} from "../pricing.js";

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

// F1 — No scalar collapse. Threshold meter applies; both meters retained (SPEC 12.4).
test("F1: threshold meter applies at a 250k prompt; no merged scalar exists", () => {
  const offer = compileLiteLLMEntry("vendor/model-x", {
    litellm_provider: "vendor",
    mode: "chat",
    input_cost_per_token: "0.000001",
    output_cost_per_token: "0.000002",
    input_cost_per_token_above_200k_tokens: "0.000004",
    output_cost_per_token_above_200k_tokens: "0.000008",
  });
  // The IR retains BOTH meter structures — nothing collapses to one scalar.
  assert.ok(offer.prices[meterKey({ stem: "input" })]);
  assert.ok(offer.prices[meterKey({ stem: "input", threshold: 200000 })]);
  assert.equal(Object.keys(offer.prices).length, 4);
  const q = quoteOffer(offer, REQ({ prompt_tokens: 250000 }));
  assert.equal(q.servable, true);
  const input = q.meters.find((m) => m.meter === "input");
  assert.equal(input.selected_key, meterKey({ stem: "input", threshold: 200000 }));
  // output threshold key resolves on the PROMPT length too (SPEC 4.3)
  const output = q.meters.find((m) => m.meter === "output");
  assert.equal(output.selected_key, meterKey({ stem: "output", threshold: 200000 }));
  assert.equal(q.exact, true);
  // cost = 250000*4e-6 + 500*8e-6 = 1.0 + 0.004
  assert.equal(q.cost, "1.004");
  // A small prompt picks the base meters instead.
  const q2 = quoteOffer(offer, REQ());
  assert.equal(q2.meters.find((m) => m.meter === "input").selected_key, meterKey({ stem: "input" }));
});

// F2 — Unknown override skipped: entry dropped, top-level price applied, offer active.
test("F2: OpenRouter override with unrecognized condition is skipped; offer stays active", () => {
  const offer = compileOpenRouterModel({
    id: "x/y",
    canonical_slug: "x/y",
    name: "Model X",
    pricing: {
      prompt: "0.000001",
      completion: "0.000002",
      overrides: [
        { min_prompt_tokens: 1000, prompt: "0.000009", new_unknown_field: true },
        { min_prompt_tokens: 1000, prompt: "0.000005" },
      ],
    },
  });
  assert.equal(offer.state, "active");
  assert.equal(offer.overrides.length, 1); // only the clean entry survives
  assert.ok(offer.provenance.logs.some((l) => l.rule === "override_entry_skipped" && l.index === 0));
  const q = quoteOffer(offer, REQ({ prompt_tokens: 5000 }));
  assert.equal(q.meters.find((m) => m.meter === "input").unit_price, "0.000005"); // clean entry applied
  assert.equal(q.exact, true);
});

test("F2b: override price keys compose per-key; absent keys inherit the base", () => {
  const offer = compileOpenRouterModel({
    id: "x/y",
    canonical_slug: "x/y",
    pricing: {
      prompt: "0.000001",
      completion: "0.000002",
      overrides: [{ min_prompt_tokens: 100, prompt: "0.000003" }], // completion absent -> inherits
    },
  });
  const q = quoteOffer(offer, REQ({ prompt_tokens: 200 }));
  const input = q.meters.find((m) => m.meter === "input");
  const output = q.meters.find((m) => m.meter === "output");
  assert.equal(input.unit_price, "0.000003");
  assert.equal(output.unit_price, "0.000002"); // inherited
  assert.deepEqual(q.applied_overrides, [0]);
});

test("F2c: min_prompt_tokens is STRICTLY greater; later entries win per key", () => {
  const offer = compileOpenRouterModel({
    id: "x/y",
    canonical_slug: "x/y",
    pricing: {
      prompt: "0.000001",
      completion: "0.000002",
      overrides: [
        { min_prompt_tokens: 128000, prompt: "0.000004" },
        { min_prompt_tokens: 128000, prompt: "0.000006" }, // later -> wins
      ],
    },
  });
  const at = quoteOffer(offer, REQ({ prompt_tokens: 128000 })); // NOT > 128000
  assert.equal(at.meters.find((m) => m.meter === "input").unit_price, "0.000001"); // base
  const over = quoteOffer(offer, REQ({ prompt_tokens: 128001 })); // strictly greater
  assert.equal(over.meters.find((m) => m.meter === "input").unit_price, "0.000006");
});

test("F2d: utc windows are wrap-aware, start inclusive, end exclusive", () => {
  const offer = compileOpenRouterModel({
    id: "x/y",
    canonical_slug: "x/y",
    pricing: {
      prompt: "0.000001",
      completion: "0.000002",
      overrides: [{ utc_start: 100, utc_end: 400, prompt: "0.000008" }],
    },
  });
  const priceAt = (iso) => quoteOffer(offer, REQ({ quote_utc: Date.parse(iso) })).meters.find((m) => m.meter === "input").unit_price;
  assert.equal(priceAt("2026-09-01T01:00:00Z"), "0.000008"); // start inclusive
  assert.equal(priceAt("2026-09-01T03:59:00Z"), "0.000008");
  assert.equal(priceAt("2026-09-01T04:00:00Z"), "0.000001"); // end exclusive
  assert.equal(priceAt("2026-09-01T12:00:00Z"), "0.000001");
  // Wrapped window 22:00 -> 02:00
  const wrapped = compileOpenRouterModel({
    id: "x/y",
    canonical_slug: "x/y",
    pricing: {
      prompt: "0.000001",
      completion: "0.000002",
      overrides: [{ utc_start: 2200, utc_end: 200, prompt: "0.000009" }],
    },
  });
  const wpriceAt = (iso) => quoteOffer(wrapped, REQ({ quote_utc: Date.parse(iso) })).meters.find((m) => m.meter === "input").unit_price;
  assert.equal(wpriceAt("2026-09-01T23:00:00Z"), "0.000009");
  assert.equal(wpriceAt("2026-09-01T01:00:00Z"), "0.000009");
  assert.equal(wpriceAt("2026-09-01T03:00:00Z"), "0.000001");
});

// F3 — Unknown field tolerated: offer active, key ignored and logged.
test("F3: LiteLLM unknown top-level key is ignored and logged; offer stays active", () => {
  const offer = compileLiteLLMEntry("vendor/model-y", {
    litellm_provider: "vendor",
    mode: "chat",
    input_cost_per_token: "0.000001",
    output_cost_per_token: "0.000002",
    brand_new_upstream_field: "whatever",
  });
  assert.equal(offer.state, "active");
  assert.deepEqual(offer.ignored_fields, ["brand_new_upstream_field"]);
  const q = quoteOffer(offer, REQ());
  assert.equal(q.servable, true);
  assert.equal(q.exact, true);
});

// F4 — Meter-affecting unknown quarantines: unknown suffix on the selected meter.
test("F4: unknown suffix on the only meter the quote uses quarantines the quote", () => {
  const offer = compileLiteLLMEntry("vendor/model-z", {
    litellm_provider: "vendor",
    mode: "chat",
    input_cost_per_token: "0.000001",
    output_cost_per_token: "0.000002",
    input_cost_per_token_surge: "0.000099", // unrecognized modifier on input
  });
  assert.equal(offer.state, "active"); // ingestion does NOT blanket-quarantine
  assert.deepEqual(offer.unknown_meter_fields, [{ key: "input_cost_per_token_surge", stem: "input" }]);
  const q = quoteOffer(offer, REQ());
  assert.equal(q.servable, false);
  assert.match(q.gap_reason, /^quarantined:meter_affecting_unknown:input_cost_per_token_surge$/);
});

test("F4b: unknown suffix that does not bear on the selected meter does not quarantine", () => {
  const offer = compileLiteLLMEntry("vendor/model-w", {
    litellm_provider: "vendor",
    mode: "chat",
    input_cost_per_token: "0.000001",
    output_cost_per_token: "0.000002",
    input_cost_per_token_surge: "0.000099",
  });
  const cls = classifyLiteLLMField("output_cost_per_token_surge");
  assert.equal(cls.kind, "stem_unknown"); // recognized pattern class
  // The surge field bears on input only; a quote consuming input still quarantines,
  // but the classifier itself is what F4 pins — checked above. Here: no cache use,
  // no cache meters, quote unaffected when the unknown is on an unused stem.
  const offer2 = compileLiteLLMEntry("vendor/model-v", {
    litellm_provider: "vendor",
    mode: "chat",
    input_cost_per_token: "0.000001",
    output_cost_per_token: "0.000002",
    cache_read_input_token_cost_weird: "0.00005", // unknown on cache_read
  });
  const q = quoteOffer(offer2, REQ({ cache_read_tokens: 0 }));
  assert.equal(q.servable, true);
  assert.equal(q.exact, true);
});

// F9 — Identity by canonical slug: display names never fork or merge identity.
test("F9: same display name, distinct slugs -> distinct identities; rename is identity-stable", () => {
  const a = compileOpenRouterModel({ id: "a/model", canonical_slug: "a/model", name: "Fast Model", pricing: { prompt: "0.000001", completion: "0.000002" } });
  const b = compileOpenRouterModel({ id: "b/model", canonical_slug: "b/model", name: "Fast Model", pricing: { prompt: "0.000003", completion: "0.000004" } });
  assert.notEqual(a.offer_id, b.offer_id);
  const aRenamed = compileOpenRouterModel({ id: "a/model", canonical_slug: "a/model", name: "Fast Model (new)", pricing: { prompt: "0.000001", completion: "0.000002" } });
  assert.equal(aRenamed.offer_id, a.offer_id); // rename did not fork
  const la = compileLiteLLMEntry("vendor/fast-model", { litellm_provider: "vendor", mode: "chat", input_cost_per_token: "0.000001", output_cost_per_token: "0.000002", model_name: "Fast Model" });
  assert.notEqual(la.offer_id, a.offer_id); // cross-feed identities stay distinct
});

// Offer state machine (SPEC 3.4).
test("offer state machine: absence streaks to retired at N=3, reappearance revives", () => {
  assert.deepEqual(nextState("active", { present: false, missingStreak: 0 }), { state: "suspect_missing", missing_streak: 1 });
  assert.deepEqual(nextState("suspect_missing", { present: false, missingStreak: 1 }), { state: "suspect_missing", missing_streak: 2 });
  assert.deepEqual(nextState("suspect_missing", { present: false, missingStreak: 2 }), { state: "retired", missing_streak: 3 });
  assert.deepEqual(nextState("suspect_missing", { present: true, missingStreak: 1 }), { state: "active", missing_streak: 0 });
  assert.equal(nextState("retired", { present: true, missingStreak: 3 }).state, "retired"); // re-admission is explicit review, not reappearance
  assert.equal(nextState("active", { quarantined: true }).state, "quarantined");
});

test("suspect_missing offers quote but carry price_stale_risk", () => {
  const offer = compileLiteLLMEntry("vendor/m", { litellm_provider: "vendor", mode: "chat", input_cost_per_token: "0.000001", output_cost_per_token: "0.000002" });
  offer.state = "suspect_missing";
  const q = quoteOffer(offer, REQ());
  assert.equal(q.servable, true);
  assert.deepEqual(q.reasons, ["price_stale_risk"]);
  assert.equal(q.exact, false);
});

test("expiration_date retires the offer at quote time", () => {
  const offer = compileOpenRouterModel({ id: "x/old", canonical_slug: "x/old", expiration_date: "2026-08-01", pricing: { prompt: "0.000001", completion: "0.000002" } });
  const q = quoteOffer(offer, REQ({ now: Date.parse("2026-09-01T00:00:00Z") }));
  assert.equal(q.servable, false);
  assert.equal(q.gap_reason, "expired");
});

test("time-windowed overrides without a quote instant resolve inexact, never silently", () => {
  const offer = compileOpenRouterModel({
    id: "x/y",
    canonical_slug: "x/y",
    pricing: { prompt: "0.000001", completion: "0.000002", overrides: [{ utc_start: 0, utc_end: 100, prompt: "0.000008" }] },
  });
  const q = quoteOffer(offer, REQ({ quote_utc: null }));
  assert.equal(q.servable, true);
  assert.equal(q.exact, false);
  assert.ok(q.reasons.includes("extrapolated_shape"));
});

test("missing meter coverage is estimated with a reason, never invented", () => {
  const offer = compileLiteLLMEntry("vendor/no-cache", { litellm_provider: "vendor", mode: "chat", input_cost_per_token: "0.000001", output_cost_per_token: "0.000002" });
  const q = quoteOffer(offer, REQ({ cache_read_tokens: 4000 }));
  assert.equal(q.servable, true);
  assert.equal(q.exact, false);
  const cr = q.meters.find((m) => m.meter === "cache_read");
  assert.equal(cr.selected_key, null);
  assert.equal(cr.note, "no_tariff_coverage");
});