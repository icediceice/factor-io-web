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
  assert.equal(adv.total.toString(), "10240");
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
  assert.equal(idle.routing_result.recommended_monthly_total, "10000.8"); // 0.8 B + 10000 standby
  const hot = runComparison({
    ...base,
    laneA: F7_LANE_A,
    routing: { policy: "api_first", failover: { fallback: "A", share: "10", rate: "2" } },
  });
  // B 0.8 + failover 0.8 x 10% x 2 = 0.16 + A fixed 10000 (in service, charged once)
  assert.equal(hot.routing_result.recommended_monthly_total, "10000.96");
});

test("fixed_split: pinned split computed exactly, derived optimum attached as annotation only", () => {
  const r = runComparison({
    workload: F7_WORKLOAD,
    catalog: f7Catalog(),
    laneA: F7_LANE_A,
    laneB: F7_LANE_B,
    routing: { policy: "fixed_split", pinned: { a_pct: 50, b_pct: 50 } },
  });
  assert.equal(r.routing_result.pinned.total, "5000.4"); // 5000 + 0.4
  assert.equal(r.routing_result.recommended_monthly_total, "5000.4");
  assert.ok(r.routing_result.derived_optimum_note);
  assert.equal(r.routing_result.derived_optimum_note.total, "10000");
  assert.match(r.routing_result.derived_optimum_note.note, /never silently replaced/);
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
  // Canonical decimal strings throughout — no exponent notation, no trailing zeros.
  assert.ok(!a.includes("e-") && !a.includes("E-"));
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
  const monthly = Rat.from(r.lanes.C.monthly_total);
  assert.ok(monthly.n > 0n);
  // Breakeven vs B is present and exact.
  assert.ok(r.breakeven.lane_C_vs_B.utilization);
  const beUtil = Rat.from(r.breakeven.lane_C_vs_B.utilization);
  // hourly / (tok_s x bPerToken) = 3 / (3400 x 0.00001) = 3/0.034 = 88.235... (>1, honest)
  assert.equal(formatHalfUp(beUtil, 4), "88.2353");
});