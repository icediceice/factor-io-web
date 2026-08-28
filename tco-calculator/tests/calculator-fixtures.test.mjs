import { test } from "node:test";
import assert from "node:assert/strict";
import { Dec, Rat, formatHalfUp } from "../exact.js";
import { compileLiteLLMEntry } from "../pricing.js";
import {
  runComparison,
  routeDemandBuckets,
  per1M,
  utilizationOf,
  laneCPerToken,
  matchEvidence,
  applyOverlay,
  advisoryBlendCost,
  ratStr,
} from "../calculator.js";

// The F7 anchor (SPEC 2.3): Lane A 100M tok/mo capacity at $10,000/mo fixed,
// demand 80M tok/mo, advisory 70/30 blend. NOTE: SPEC 2.3 prose says the
// overflow price is "$0.01/1M" but its own normative total ($10,240, delta
// $240 over 24M overflow tokens) implies $10/1M — the total and delta are the
// normative anchors (fixture F7), so the B tariff here is $10 per 1M tokens.
const F7_WORKLOAD = {
  demand_tokens_mo: 80000000,
  request_count_mo: 80000,
  prompt_tokens: 1000,
  output_tokens: 0,
  horizon_months: 1,
  time_buckets: null,
  required_p95_tok_s: null,
  quote_utc: Date.parse("2026-09-01T12:00:00Z"),
};

function f7Catalog() {
  const offer = compileLiteLLMEntry("api/overflow", {
    litellm_provider: "api",
    mode: "chat",
    input_cost_per_token: "0.00001", // $10 per 1M — see note above
    output_cost_per_token: "0.00001",
  });
  return { offers: { [offer.offer_id]: offer } };
}

const F7_LANE_A = { enabled: true, fixed_monthly: "10000", monthly_token_budget: 100000000, tokens_s_ceiling: null };
const F7_LANE_B = { enabled: true, offer_ids: ["litellm:api/overflow"] };

// F7 — capacity-constrained local_first: derived split serves all 80M locally
// for $10,000; the advisory 70/30 blend emits $10,240 flagged dominated.
test("F7: derived local_first emits $10,000; advisory 70/30 is dominated with the $240 delta", () => {
  const r = runComparison({
    workload: F7_WORKLOAD,
    catalog: f7Catalog(),
    laneA: F7_LANE_A,
    laneB: F7_LANE_B,
    routing: { policy: "local_first", advisory_blend: { local_pct: 70 } },
  });
  assert.equal(r.routing_result.derived_split.local_tokens, 80000000);
  assert.equal(r.routing_result.derived_split.overflow_tokens, 0);
  assert.equal(r.routing_result.recommended_monthly_total, "10000"); // the optimum — not the blend
  assert.equal(r.routing_result.advisory.status, "dominated");
  assert.equal(r.routing_result.advisory.total, "10240"); // 10000 + 24M x $10/1M
  assert.equal(r.routing_result.advisory.delta, "240"); // the SPEC normative delta
  assert.equal(r.lanes.A.monthly_total, "10000");
  // Lane A fixed charged exactly once; no per-token re-pricing of in-capacity tokens.
  assert.ok(r.lanes.A.lines.some((l) => l.item === "lane_a_fixed" && l.amount === "10000"));
  assert.ok(!r.lanes.A.lines.some((l) => l.item === "overflow_secondary"));
});

test("F7 arithmetic check: advisory blend cost function directly", () => {
  const adv = advisoryBlendCost({
    demandTokens: 80000000,
    blendLocalPct: 70,
    overflowUnitCost: "0.00001",
    laneAFixed: "10000",
    aMonthlyCapacity: 100000000,
    marginalPerToken: null,
  });
  assert.equal(adv.local_tokens, 56000000);
  assert.equal(adv.overflow_tokens, 24000000);
  assert.equal(ratStr(adv.total), "10240"); // lane totals are exact money (Rat-capable), serialized canonically
  const delta = adv.total.sub(Dec.from("10000"));
  assert.equal(formatHalfUp(delta, 2), "240.00");
});

test("rate ceiling binds through buckets: 80M over 4 days at 100 tok/s overflows at 45.44M", () => {
  const r = routeDemandBuckets({
    demandTokens: 80000000,
    monthlyBudget: 100000000,
    rateCeiling: 100,
    buckets: [{ hours: 96, tokens: 80000000 }],
  });
  assert.equal(r.temporal_known, true);
  assert.equal(r.binding, "rate_and_monthly");
  assert.equal(r.local, 34560000); // 100 x 96h x 3600s
  assert.equal(r.overflow, 45440000);
  // Under-run through the engine: the overflow must be visible on lane A.
  const run = runComparison({
    workload: { ...F7_WORKLOAD, time_buckets: [{ hours: 96, tokens: 80000000 }] },
    catalog: f7Catalog(),
    laneA: { ...F7_LANE_A, tokens_s_ceiling: 100 },
    laneB: F7_LANE_B,
    routing: { policy: "local_first" },
  });
  assert.equal(run.lanes.A.served_tokens, 34560000);
  assert.equal(run.lanes.A.overflow_tokens, 45440000);
  assert.equal(run.lanes.A.rate_ceiling_binding, "rate_and_monthly");
  assert.ok(run.lanes.A.lines.some((l) => l.item === "overflow_secondary" && l.amount === "454.4")); // 45.44M x $10/1M
});

test("absent temporal data yields capacity_temporal_unknown, never a silent aggregate", () => {
  const run = runComparison({
    workload: F7_WORKLOAD, // no time_buckets, no histogram
    catalog: f7Catalog(),
    laneA: { ...F7_LANE_A, tokens_s_ceiling: 100 }, // rate ceiling declared but unevaluable
    laneB: F7_LANE_B,
    routing: { policy: "local_first" },
  });
  assert.ok(run.reasons.includes("capacity_temporal_unknown"));
  assert.equal(run.lanes.A.rate_ceiling_known, false);
  assert.equal(run.lanes.A.served_tokens, 80000000); // monthly ceiling routed all-local
});

test("zero-domain guards: the two real division sites are guarded, 0-demand utilization is 0", () => {
  const zd = per1M(Dec.from("100"), 0);
  assert.equal(zd.value, null);
  assert.equal(zd.reason, "zero_demand");
  const zc = utilizationOf(50, 0);
  assert.equal(zc.value, null);
  assert.equal(zc.reason, "zero_capacity");
  const zeroDemand = utilizationOf(0, 100000000);
  assert.equal(zeroDemand.value.toString(), "0/1"); // well-defined zero
  const cu = laneCPerToken({ hourlyRate: "3", tokensS: 3400, utilization: "0" });
  assert.equal(cu.value, null);
  assert.equal(cu.reason, "zero_utilization");
});

// F8 — evidence mismatch yields unknown; partial match only as annotation.
test("F8: rows at concurrency 256/128-128 say nothing about concurrency 8 at 8000/1000", () => {
  const rows = [{
    model_revision: "llama-3-70b-instruct",
    runtime: "vllm", runtime_version: "0.6", quantization: "fp8",
    hardware_topology: "8xH100- nvlink",
    prompt_output_dist: "128/128", concurrency: 256, batch_mode: "continuous",
    percentile_window: "p95", value_tok_s: 11200, provenance: "test-row",
  }];
  const config = {
    model_revision: "llama-3-70b-instruct", runtime: "vllm", runtime_version: "0.6",
    quantization: "fp8", hardware_topology: "8xH100- nvlink",
    prompt_output_dist: "8000/1000", concurrency: 8, batch_mode: "continuous",
    percentile_window: "p95",
  };
  const m = matchEvidence(rows, config, 3400);
  assert.equal(m.verdict, "unknown");
  assert.equal(m.modelled_p95_capacity, null);
  assert.ok(m.annotation);
  assert.ok(m.annotation.mismatched_dimensions.includes("concurrency"));
  assert.ok(m.annotation.mismatched_dimensions.includes("prompt_output_dist"));
  // Exact match flips to evidence-backed feasibility.
  const ok = matchEvidence(rows, { ...config, prompt_output_dist: "128/128", concurrency: 256 }, 3400);
  assert.equal(ok.verdict, "feasible");
  assert.equal(ok.modelled_p95_capacity, 11200);
  const tooSlow = matchEvidence(rows, { ...config, prompt_output_dist: "128/128", concurrency: 256 }, 20000);
  assert.equal(tooSlow.verdict, "infeasible");
  // The shipped store is EMPTY: unknown, no annotation (SPEC 6.5).
  const empty = matchEvidence([], config, 3400);
  assert.equal(empty.verdict, "unknown");
  assert.equal(empty.annotation, null);
});

test("api_first: failover traffic prices at rate x share; standby fixed surfaces when idle", () => {
  const base = { workload: F7_WORKLOAD, catalog: f7Catalog(), laneB: F7_LANE_B };
  const idle = runComparison({
    ...base,
    laneA: F7_LANE_A,
    routing: { policy: "api_first", failover: { fallback: "A", share: "0", rate: "2" } },
  });
  assert.equal(idle.routing_result.recommended_monthly_total, "10800"); // 800 B + 10000 standby
  const hot = runComparison({
    ...base,
    laneA: F7_LANE_A,
    routing: { policy: "api_first", failover: { fallback: "A", share: "0.1", rate: "2" } }, // share is a FRACTION of demand
  });
  // B 800 + failover 800 x 10% x 2 = 160 + A fixed 10000 (in service, charged once)
  assert.equal(hot.routing_result.recommended_monthly_total, "10960");
});

test("fixed_split: per-allocation evaluation charges Lane A's fixed exactly once (peer G4)", () => {
  const r = runComparison({
    workload: F7_WORKLOAD,
    catalog: f7Catalog(),
    laneA: F7_LANE_A,
    laneB: F7_LANE_B,
    routing: { policy: "fixed_split", pinned: { a_pct: 50, b_pct: 50 } },
  });
  // A serves its 40M allocation (< 100M capacity) -> full $10,000 fixed ONCE;
  // B serves the other 40M = 40,000 requests x $0.01 = $400. Prorating the
  // full lane totals (50% x 10000 + 50% x 800 = 5400) was the F7 defect under
  // a policy label — a pinned share may not fractionally discount a fixed asset.
  assert.equal(r.routing_result.pinned.total, "10400");
  assert.equal(r.routing_result.recommended_monthly_total, "10400");
  assert.equal(r.routing_result.pinned.allocations.a_tokens, 40000000);
  assert.equal(r.routing_result.pinned.allocations.b_tokens, 40000000);
  assert.equal(r.routing_result.pinned.allocations.b_requests, 40000);
  assert.ok(r.routing_result.pinned.lines.some((l) => l.lane === "A" && l.item === "lane_a_fixed" && l.amount === "10000"));
  assert.ok(r.routing_result.pinned.lines.some((l) => l.lane === "B" && l.item === "lane_b_allocated" && l.amount === "400"));
  assert.ok(r.routing_result.derived_optimum_note);
  assert.equal(r.routing_result.derived_optimum_note.total, "10000");
  assert.match(r.routing_result.derived_optimum_note.note, /never silently replaced/);
});

 test("no buckets: the monthly budget still binds; an undeclared rate ceiling stays known (peer G6)", () => {
  const r = routeDemandBuckets({ demandTokens: 80000000, monthlyBudget: 50000000, rateCeiling: null, buckets: null });
  assert.equal(r.local, 50000000);
  assert.equal(r.overflow, 30000000);
  assert.equal(r.temporal_known, true); // nothing temporal was declared
  const run = runComparison({
    workload: F7_WORKLOAD,
    catalog: f7Catalog(),
    laneA: { ...F7_LANE_A, monthly_token_budget: 50000000 },
    laneB: F7_LANE_B,
    routing: { policy: "local_first" },
  });
  assert.equal(run.lanes.A.served_tokens, 50000000);
  assert.equal(run.lanes.A.overflow_tokens, 30000000);
  assert.ok(!run.reasons.includes("capacity_temporal_unknown")); // no rate ceiling declared
  assert.ok(run.lanes.A.lines.some((l) => l.item === "overflow_secondary" && l.amount === "300")); // 30M x $10/1M
  // F7 regression guard: capacity 100M >= demand -> all local, unchanged total.
  const f7 = runComparison({ workload: F7_WORKLOAD, catalog: f7Catalog(), laneA: F7_LANE_A, laneB: F7_LANE_B, routing: { policy: "local_first" } });
  assert.equal(f7.lanes.A.monthly_total, "10000");
});

test("non-terminating overflow marginal stays exact money — never null, never dropped (peer G7)", () => {
  // bMonthly = 3 x 1000 x 0.00001 = 0.03; bPerToken = 0.03 / 81M = 1/2.7e9.
  // 2.7e9 = 3^3 x 2^8 x 5^8 — the 3^3 makes the per-token quotient
  // non-terminating, the exact case where Dec.from(null) used to crash.
  const run = runComparison({
    workload: { ...F7_WORKLOAD, demand_tokens_mo: 81000000, request_count_mo: 3 },
    catalog: f7Catalog(),
    laneA: { ...F7_LANE_A, monthly_token_budget: 30000000 },
    laneB: F7_LANE_B,
    routing: { policy: "local_first", advisory_blend: { local_pct: 70 } },
  });
  assert.equal(run.lanes.A.served_tokens, 30000000);
  assert.equal(run.lanes.A.overflow_tokens, 51000000);
  assert.ok(!run.reasons.includes("secondary_lane_unpriced"));
  // overflow = 51M x 1/2.7e9 = 51/2700 = 17/900; total = 10000 + 17/900.
  assert.equal(run.lanes.A.monthly_total, "9000017/900");
});

 test("Lane C dimensional check: tok/s means per SECOND — hours and per-1M carry the 3600 (peer G5)", () => {
  const r = runComparison({
    workload: F7_WORKLOAD,
    catalog: f7Catalog(),
    laneB: F7_LANE_B,
    laneC: { enabled: true, tokens_s: 3400, hourly_rate: "3.00", utilization: "0.5" },
    routing: { policy: "api_first", failover: { fallback: "C", share: "0", rate: "1" } },
  });
  assert.equal(r.lanes.C.hours, "2000/153"); // 80M / (3400 x 0.5 x 3600) seconds -> ~13.07 hours
  assert.equal(r.lanes.C.monthly_total, "2000/51"); // $3 x 2000/153 h
  assert.equal(r.lanes.C.per_1m.value, "25/51"); // per-token 1/2040000 x 1M
  const [bn, bd] = r.breakeven.lane_C_vs_B.utilization.split("/");
  // util* = 3 / (3400 x 0.00001 x 3600) = 5/204 = 0.0245098... (>0, <1, honest)
  assert.equal(formatHalfUp(new Rat(BigInt(bn), BigInt(bd)), 4), "0.0245");
});

test("overlay applies LAST, itemized, with mandatory fully-loaded labelling", () => {
  const r = runComparison({
    workload: { ...F7_WORKLOAD, horizon_months: 3 },
    catalog: f7Catalog(),
    laneA: F7_LANE_A,
    laneB: F7_LANE_B,
    routing: { policy: "local_first" },
    overlay: {
      fully_loaded: true,
      components: [
        { name: "enterprise-licensing", basis: "monthly", amount: "500", provenance: "assumed" },
        { name: "implementation", basis: "one_time", amount: "1000", provenance: "assumed" },
      ],
    },
  });
  assert.equal(r.overlay.overlay_total, "2500"); // 500 x 3 + 1000
  assert.equal(r.overlay.itemized.length, 2);
  assert.equal(r.overlay.label, "fully_loaded_per_1M");
  assert.equal(r.overlay.totals.A.infra_total, "10000");
  assert.equal(r.overlay.totals.A.fully_loaded_total, "12500");
  assert.ok(!JSON.stringify(r).includes("guarantee")); // the word never appears
});

test("determinism: identical workload + snapshot -> byte-identical result JSON", () => {
  const mk = () => runComparison({
    workload: { ...F7_WORKLOAD, time_buckets: [{ hours: 96, tokens: 80000000 }] },
    catalog: f7Catalog(),
    laneA: { ...F7_LANE_A, tokens_s_ceiling: 100 },
    laneB: F7_LANE_B,
    routing: { policy: "local_first", advisory_blend: { local_pct: 70 } },
    overlay: { fully_loaded: false, components: [{ name: "consulting", basis: "monthly", amount: "250" }] },
  });
  const a = JSON.stringify(mk());
  const b = JSON.stringify(mk());
  assert.equal(a, b);
  // Canonical decimal strings throughout: no money value may appear as an
  // exponent-notation literal in the result JSON.
  assert.ok(!/"-?\d+(\.\d+)?[eE][+-]?\d+"/.test(a), "money values must be plain decimal strings");
});

test("Lane C monthly amortization is exact: 80M served at 3400 tok/s x 50% util", () => {
  const r = runComparison({
    workload: F7_WORKLOAD,
    catalog: f7Catalog(),
    laneB: F7_LANE_B,
    laneC: { enabled: true, tokens_s: 3400, hourly_rate: "3.00", utilization: "0.5" },
    routing: { policy: "api_first", failover: { fallback: "C", share: "0", rate: "1" } },
  });
  // hours = 80e6 / (3400 x 0.5) = 47058.8235... = 800000/17 reduced; exact Rat.
  assert.equal(r.lanes.C.hours, "800000/17");
  const [mn, md] = r.lanes.C.monthly_total.split("/");
  const monthly = new Rat(BigInt(mn), BigInt(md));
  assert.ok(monthly.n > 0n);
  // Breakeven vs B is present and exact.
  assert.ok(r.breakeven.lane_C_vs_B.utilization);
  const [bn, bd] = r.breakeven.lane_C_vs_B.utilization.split("/");
  const beUtil = new Rat(BigInt(bn), BigInt(bd));
  // hourly / (tok_s x bPerToken) = 3 / (3400 x 0.00001) = 3/0.034 = 88.235... (>1, honest)
  assert.equal(formatHalfUp(beUtil, 4), "88.2353");
});