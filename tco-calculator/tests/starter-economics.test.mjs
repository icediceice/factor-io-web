import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STARTER_CASES } from "../starter-cases.js";
import { computeStarterCase, priceStarterRequests } from "../starter-economics.js";
import { configurePowerSeed } from "../power.js";
import { quoteOffer } from "../pricing.js";
import { toRat, ratStr } from "../exact.js";
const json = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
configurePowerSeed(json("power-seed"));
const offerId = STARTER_CASES[0].premium_offer_id;
// Pinned tariff fixture: independent of live price refreshes, not a vendor claim.
const offer = { state: "active", tariff: "token", prices: { input: "0.000005", output: "0.000025", cache_read: "0.0000005", cache_write: "0.00000625" }, overrides: [], unknown_meter_fields: [] };
const data = { catalog: { offers: { [offerId]: offer } }, serverPricing: json("server-pricing"), servingData: json("serving-models"), gpuPricing: json("gpu-pricing"), usdPerKwh: "0.1216", quoteUtc: Date.parse("2026-09-08T00:00:00Z"), now: Date.parse("2026-09-08T00:00:00Z") };
const options = { catalog: data.catalog, offerId, horizonMonths: 60, quoteUtc: data.quoteUtc, now: data.now };

test("starter API-only composition equals exact independently quoted request totals", () => {
  const shape = { prompt_tokens: 9000, output_tokens: 1200, cache_read_tokens: 4000, cache_write_tokens: 100 };
  const q = quoteOffer(offer, { ...shape, request_count: 1, quote_utc: data.quoteUtc, now: data.now });
  assert.equal(priceStarterRequests(shape, 20160, options).monthly, ratStr(toRat(q.cost).mul(toRat("20160"))));
});
test("authored outcomes are checked within horizon, not merely eventual convergence", () => {
  for (const row of STARTER_CASES) {
    const result = computeStarterCase(row, data);
    assert.equal(result.available, true, result.reason);
    assert.equal(result.hardware.nodes, 1);
    assert.equal(result.payback.converges && !result.payback.beyond_horizon, row.expect_payback_within_horizon, row.id);
  }
});
test("idle and zero eligible work still pay the whole server and running cost", () => {
  for (const overrides of [{ tasksMo: 0 }, { eligiblePct: 0 }, { failurePct: 100 }]) {
    const r = computeStarterCase(STARTER_CASES[0], data, overrides);
    assert.equal(r.available, true, r.reason);
    assert.equal(r.capex, "26667");
    assert.equal(r.api_reduction, "0");
    assert.ok(toRat(r.net_monthly).sign() < 0);
    assert.equal(r.payback.converges, false);
  }
});
test("overflow and failed work are disjoint and never scale the server", () => {
  const r = computeStarterCase(STARTER_CASES[0], data, { tasksMo: 1000000 });
  assert.equal(r.available, true, r.reason);
  const c = r.counts;
  assert.equal(c.tasks, c.successful + c.failed + c.bypass + c.overflow);
  assert.ok(c.overflow > 0);
  assert.equal(r.hardware.nodes, 1);
  assert.equal(r.capex, "26667");
});
test("missing consumed tariff and absent offer never become partial zero costs", () => {
  const broken = structuredClone(data);
  delete broken.catalog.offers[offerId].prices.output;
  assert.match(computeStarterCase(STARTER_CASES[0], broken).reason, /output/);
  delete broken.catalog.offers[offerId];
  assert.match(computeStarterCase(STARTER_CASES[0], broken).reason, /not_in_catalog/);
});
test("each shape independently resolves prompt-length overrides and request fees", () => {
  const changed = structuredClone(data.catalog);
  changed.offers[offerId].prices.request = "0.01";
  changed.offers[offerId].overrides = [{ conditions: { min_prompt_tokens: 128000 }, prices: { input: "0.00001", output: "0.00005" } }];
  for (const prompt_tokens of [150000, 15000]) {
    const shape = { prompt_tokens, output_tokens: 2000 };
    const q = quoteOffer(changed.offers[offerId], { ...shape, request_count: 1 });
    assert.equal(priceStarterRequests(shape, 10, { ...options, catalog: changed }).monthly, ratStr(toRat(q.cost).mul(toRat("10"))));
  }
});
test("short chat and low cadence do not inherit the code-reading payback claim", () => {
  const row = { ...STARTER_CASES[0], baseline: { prompt_tokens: 300, output_tokens: 250 }, residual: { prompt_tokens: 30, output_tokens: 250 } };
  const r = computeStarterCase(row, data);
  assert.equal(r.available, true, r.reason);
  assert.equal(r.payback.converges && !r.payback.beyond_horizon, false);
  assert.equal(computeStarterCase(STARTER_CASES[0], data, { tasksMo: 10 }).payback.converges, false);
});
test("unsupported context refuses the setup instead of pretending a fit", () => {
  const row = structuredClone(STARTER_CASES[0]);
  row.local.context_tokens = 1000000;
  assert.match(computeStarterCase(row, data).reason, /context/);
});
