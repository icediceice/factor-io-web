import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDemand,
  peakTokensPerSecond,
  gpusForLoad,
  validateMix,
  DemandRefusal,
  WORKLOAD_TYPES,
  TOKENS_S_PER_GPU_ASSUMED,
} from "../demand.js";
import { paybackMonths, tcoCurve, rentedGpuByProvider } from "../calculator.js";
import { Dec } from "../exact.js";
import { readFile } from "node:fs/promises";

// SPEC 2.4 — demand is DERIVED from users, never asserted as a token count.

const SHAPES = {
  chat: { turns_per_session: "6", in_tokens: "300", out_tokens: "250", cached_tokens: "0" },
  rag: { turns_per_session: "5", in_tokens: "3000", out_tokens: "400", cached_tokens: "1000" },
  graph_rag: { turns_per_session: "4", in_tokens: "6000", out_tokens: "500", cached_tokens: "2000" },
  agentic: { turns_per_session: "12", in_tokens: "9000", out_tokens: "1200", cached_tokens: "4000" },
};

const BASE = {
  users: 500,
  sessionsPerUserDay: "2",
  workingDaysMo: "21",
  shapes: SHAPES,
};

// ------------------------------------------------------------------ the mix

test("mix: 0.3+0.3+0.3+0.1 sums to one — the case IEEE-754 gets wrong", () => {
  // In floats this sums to 0.9999999999999999, so a naive implementation would
  // REFUSE a mix the user entered correctly. This test is the whole reason the
  // mix is carried as an exact rational rather than as numbers.
  assert.equal(0.3 + 0.3 + 0.3 + 0.1 === 1, false, "precondition: floats do get this wrong");
  const v = validateMix({ chat: "0.3", rag: "0.3", graph_rag: "0.3", agentic: "0.1" });
  assert.equal(v.ok, true);
  assert.equal(v.sum_text, "1.000000");
});

test("mix: the float verdict depends on SUMMATION ORDER; the exact one does not", () => {
  // 0.1+0.2+0.7 is exactly 1 in floats but 0.7+0.2+0.1 is 0.9999999999999999.
  // A float implementation would therefore accept or refuse the SAME mix based on
  // which workload happened to hold which share — a bug with no visible cause.
  assert.equal(0.1 + 0.2 + 0.7 === 1, true);
  assert.equal(0.7 + 0.2 + 0.1 === 1, false);
  assert.equal(validateMix({ rag: "0.1", graph_rag: "0.2", agentic: "0.7" }).ok, true);
  assert.equal(validateMix({ rag: "0.7", graph_rag: "0.2", agentic: "0.1" }).ok, true);
});

test("mix: thirds sum to one exactly", () => {
  const v = validateMix({ rag: "0.5", graph_rag: "0.25", agentic: "0.25" });
  assert.equal(v.ok, true);
});

test("mix: a mix that misses one is REFUSED, never renormalized", () => {
  const v = validateMix({ chat: "0.5", rag: "0.4" });
  assert.equal(v.ok, false);
  assert.equal(v.code, "mix_does_not_sum_to_one");
  assert.equal(v.sum_text, "0.900000");
});

test("mix: buildDemand throws a coded refusal, and the shares are NOT rescaled", () => {
  assert.throws(
    () => buildDemand({ ...BASE, mix: { chat: "0.5", rag: "0.4" } }),
    (e) => {
      assert.ok(e instanceof DemandRefusal);
      assert.equal(e.code, "mix_does_not_sum_to_one");
      assert.equal(e.detail.sum, "0.900000");
      return true;
    },
  );
});

test("mix: an unknown workload type is refused rather than ignored", () => {
  assert.throws(
    () => buildDemand({ ...BASE, mix: { chat: "0.5", finetuning: "0.5" } }),
    (e) => e.code === "unknown_workload",
  );
});

test("mix: a workload with share but no shape is refused, not defaulted", () => {
  assert.throws(
    () => buildDemand({ ...BASE, shapes: { chat: SHAPES.chat }, mix: { chat: "0.5", agentic: "0.5" } }),
    (e) => e.code === "missing_shape" && e.detail.workload === "agentic",
  );
});

// --------------------------------------------------------------- the arithmetic

test("demand: sessions_mo = users x sessions/user/day x working days", () => {
  const d = buildDemand({ ...BASE, mix: { chat: "1" } });
  // 500 x 2 x 21
  assert.equal(d.sessions_mo.text, "21000");
  assert.equal(d.sessions_mo.basis, "derived");
});

test("demand: token totals are exact at scale, split in/out/cached", () => {
  const d = buildDemand({ ...BASE, mix: { rag: "1" } });
  // turns = 21000 x 1 x 5 = 105000
  assert.equal(d.turns_mo.text, "105000");
  assert.equal(d.in_tokens_mo.text, "315000000"); // 105000 x 3000
  assert.equal(d.out_tokens_mo.text, "42000000"); //  105000 x 400
  assert.equal(d.cached_tokens_mo.text, "105000000"); // 105000 x 1000
  assert.equal(d.tokens_mo.text, "462000000");
});

test("demand: a fractional share yields a fractional turn count, not a rounded one", () => {
  // 0.3 of 21000 sessions x 5 turns = 31500 exactly; the point is that the share
  // is applied to the exact session count rather than to a pre-rounded integer.
  const d = buildDemand({ ...BASE, mix: { chat: "0.7", rag: "0.3" } });
  const rag = d.workloads.find((w) => w.type === "rag");
  assert.equal(rag.turns_mo.text, "31500");
});

test("demand: the workload mix genuinely separates RAG from Agentic", () => {
  // The reason the mix exists: these differ by roughly an order of magnitude per
  // turn, and one averaged shape would hide that.
  const ragOnly = buildDemand({ ...BASE, mix: { rag: "1" } });
  const agenticOnly = buildDemand({ ...BASE, mix: { agentic: "1" } });
  // Measured against the shipped shapes: agentic is 170,400 tok/session against
  // RAG's 22,000, i.e. 7.7x. The assertion guards the SEPARATION, not a tuned
  // figure — moving the shapes to hit a rounder number would be fitting the data
  // to the test.
  const ratio = Number(agenticOnly.tokens_mo.text) / Number(ragOnly.tokens_mo.text);
  assert.ok(ratio > 5, `agentic should dwarf rag, got ${ratio}x`);
});

test("demand: every workload type has a shipped shape and resolves", () => {
  for (const w of WORKLOAD_TYPES) {
    const d = buildDemand({ ...BASE, mix: { [w]: "1" } });
    assert.ok(Number(d.tokens_mo.text) > 0, `${w} produced no tokens`);
  }
});

// ----------------------------------------------------------------- overrides

test("override: a supplied sessions_mo is RETAINED and labelled, not recomputed", () => {
  const d = buildDemand({ ...BASE, mix: { chat: "1" }, overrides: { sessions_mo: "9999" } });
  assert.equal(d.sessions_mo.text, "9999");
  assert.equal(d.sessions_mo.basis, "user_override");
  // and it propagates: turns are derived FROM the override, not from users
  assert.equal(d.turns_mo.text, "59994"); // 9999 x 6
});

test("override: tokens_mo overrides the derived total and says so", () => {
  const d = buildDemand({ ...BASE, mix: { chat: "1" }, overrides: { tokens_mo: "1000000" } });
  assert.equal(d.tokens_mo.text, "1000000");
  assert.equal(d.tokens_mo.basis, "user_override");
});

test("override: a per-workload turns override applies to that workload only", () => {
  const d = buildDemand({ ...BASE, mix: { chat: "0.5", rag: "0.5" }, overrides: { turns_mo: { rag: "100" } } });
  const rag = d.workloads.find((w) => w.type === "rag");
  const chat = d.workloads.find((w) => w.type === "chat");
  assert.equal(rag.turns_mo.text, "100");
  assert.equal(rag.turns_mo.basis, "user_override");
  assert.equal(chat.turns_mo.basis, "derived");
});

// ------------------------------------------------------------- the peak second

test("peak: peak_tokens_s = users x concurrency fraction x per-stream rate", () => {
  const p = peakTokensPerSecond({ users: 500, peakConcurrencyFraction: "0.05", tokensPerSecondPerStream: "30" });
  assert.equal(p.concurrent_peak.text, "25.00"); // 500 x 0.05
  assert.equal(p.peak_tokens_s.text, "750.00");
  assert.equal(p.below_interactive_floor, false);
});

test("peak: a per-stream rate below the interactive floor is FLAGGED, not clamped", () => {
  // The floor is a UX judgement about perceived speed, not a fact about the
  // deployment — so the number must stand and merely carry the flag.
  const p = peakTokensPerSecond({ users: 100, peakConcurrencyFraction: "0.1", tokensPerSecondPerStream: "8" });
  assert.equal(p.below_interactive_floor, true);
  assert.equal(p.peak_tokens_s.text, "80.00");
});

test("peak: a concurrency fraction above 1 is refused", () => {
  assert.throws(
    () => peakTokensPerSecond({ users: 10, peakConcurrencyFraction: "1.5", tokensPerSecondPerStream: "30" }),
    (e) => e.code === "out_of_range",
  );
});

test("peak: 0.05 of 500 users is exactly 25 — no float residue", () => {
  const p = peakTokensPerSecond({ users: 500, peakConcurrencyFraction: "0.05", tokensPerSecondPerStream: "1" });
  assert.equal(p.concurrent_peak.rat.n, 25n);
  assert.equal(p.concurrent_peak.rat.d, 1n);
});

// -------------------------------------------------------------- GPU sizing

test("gpus: sizing CEILS — a partial GPU cannot serve the peak", () => {
  // 2600 tok/s at 2500 tok/s per H100 is 1.04 GPUs, which must round UP to 2.
  const g = gpusForLoad({ peakTokensPerSecond: "2600", gpuId: "h100" });
  assert.equal(g.gpus_required.text, "2");
  assert.equal(g.gpus_exact.text, "1.040");
  assert.equal(g.capacity_tokens_s.text, "5000.00");
  assert.equal(g.headroom_tokens_s.text, "2400.00");
});

test("gpus: an exact fit needs no extra GPU and reports zero headroom", () => {
  const g = gpusForLoad({ peakTokensPerSecond: "5000", gpuId: "h100" });
  assert.equal(g.gpus_required.text, "2");
  assert.equal(g.headroom_tokens_s.text, "0.00");
});

test("gpus: the throughput assumption is tagged assumed at the point of use", () => {
  const g = gpusForLoad({ peakTokensPerSecond: "1000", gpuId: "h100" });
  assert.equal(g.assumed, true);
  assert.equal(g.tokens_s_per_gpu.basis, "assumed");
  assert.equal(g.gpus_required.basis, "assumed");
});

test("gpus: an explicit measurement overrides the assumption and drops the tag", () => {
  const g = gpusForLoad({ peakTokensPerSecond: "1000", gpuId: "h100", tokensPerSecondPerGpu: "500" });
  assert.equal(g.gpus_required.text, "2");
  assert.equal(g.assumed, false);
  assert.equal(g.tokens_s_per_gpu.basis, "user_override");
});

test("gpus: an unknown gpu id FAILS LOUDLY rather than defaulting", () => {
  // A silent default would mis-size every deployment on that accelerator and the
  // provider would vanish from the comparison with nothing indicating a gap.
  assert.throws(
    () => gpusForLoad({ peakTokensPerSecond: "1000", gpuId: "mi300x" }),
    (e) => e.code === "unknown_gpu" && Array.isArray(e.detail.known),
  );
});

test("gpus: A10 and A10G are separate ids with different throughput", () => {
  // A10G is the AWS G5-exclusive 300W part; A10 is the 150W PCIe part Azure and
  // Alibaba sell. Folding them applies one card's throughput to the other.
  assert.notEqual(TOKENS_S_PER_GPU_ASSUMED.a10, TOKENS_S_PER_GPU_ASSUMED.a10g);
  assert.ok(TOKENS_S_PER_GPU_ASSUMED.a10 !== undefined);
  assert.ok(TOKENS_S_PER_GPU_ASSUMED.a10g !== undefined);
});

test("gpus: zero peak needs zero GPUs", () => {
  const g = gpusForLoad({ peakTokensPerSecond: "0", gpuId: "h100" });
  assert.equal(g.gpus_required.text, "0");
});

// --------------------------------------------------------------- payback months

test("payback: converges to a whole number of months, rounding UP", () => {
  // 100000 capex, saving 12000/mo => 8.33 months => 9
  const p = paybackMonths({ capex: "100000", monthlyOpex: "8000", targetMonthly: "20000", horizonMonths: 36 });
  assert.equal(p.converges, true);
  assert.equal(p.months, 9);
  assert.equal(p.monthly_savings, "12000");
  assert.equal(p.beyond_horizon, false);
});

test("payback: an exact division does not gain a spurious extra month", () => {
  const p = paybackMonths({ capex: "120000", monthlyOpex: "8000", targetMonthly: "20000", horizonMonths: 36 });
  assert.equal(p.months, 10);
  assert.equal(p.exact_months, "10");
});

test("payback: opex above the target NEVER converges, with a reason", () => {
  const p = paybackMonths({ capex: "100000", monthlyOpex: "25000", targetMonthly: "20000", horizonMonths: 36 });
  assert.equal(p.converges, false);
  assert.equal(p.reason, "opex_exceeds_target");
  assert.equal(p.months, null);
});

test("payback: equal opex and target never converges — no division by zero", () => {
  const p = paybackMonths({ capex: "100000", monthlyOpex: "20000", targetMonthly: "20000" });
  assert.equal(p.converges, false);
  assert.equal(p.reason, "opex_exceeds_target");
});

test("payback: zero capex is a refusal with its own reason, not zero months", () => {
  const p = paybackMonths({ capex: "0", monthlyOpex: "8000", targetMonthly: "20000" });
  assert.equal(p.converges, false);
  assert.equal(p.reason, "zero_capex");
  assert.equal(p.months, null);
});

test("payback: past the horizon returns the TRUE month with a flag, never truncated", () => {
  // Truncating a real 50-month payback to the 12-month horizon would report
  // "slow" as "never" — the more damaging of the two errors.
  const p = paybackMonths({ capex: "500000", monthlyOpex: "8000", targetMonthly: "18000", horizonMonths: 12 });
  assert.equal(p.converges, true);
  assert.equal(p.months, 50);
  assert.equal(p.beyond_horizon, true);
});

test("payback: months are exact on a non-terminating quotient", () => {
  // 10000 / 3000 = 3.333... — the ceiling must come from the exact rational.
  const p = paybackMonths({ capex: "10000", monthlyOpex: "0", targetMonthly: "3000" });
  assert.equal(p.months, 4);
});

// ------------------------------------------------------- curve / payback agreement

test("curve: capex is added ONCE, at every month, not per month", () => {
  const pts = tcoCurve({ A: "1000" }, 3, { A: "5000" });
  assert.deepEqual(pts.map((p) => p.A), ["6000", "7000", "8000"]);
});

test("curve: an unpriced option stays null instead of drawing a zero-cost line", () => {
  const pts = tcoCurve({ A: "1000", B: null }, 2, { A: "5000", B: "9000" });
  assert.deepEqual(pts.map((p) => p.B), [null, null]);
});

test("curve: a priced lane keeps the exact cumulative values", () => {
  const pts = tcoCurve({ A: "1000.5" }, 3, { A: "5000" });
  assert.deepEqual(pts.map((p) => p.A), ["6000.5", "7001", "8001.5"]);
});

test("curve: omitting the one-time map is byte-identical to the old two-arg call", () => {
  assert.deepEqual(tcoCurve({ A: "1000", B: "2500.5" }, 3), tcoCurve({ A: "1000", B: "2500.5" }, 3, {}));
});

test("curve and paybackMonths agree on the crossover month", () => {
  // The two must never disagree in the same UI: the first month where the
  // self-hosted cumulative drops below the API cumulative IS the payback month.
  const capex = "100000";
  const aMonthly = "8000";
  const bMonthly = "20000";
  const p = paybackMonths({ capex, monthlyOpex: aMonthly, targetMonthly: bMonthly, horizonMonths: 24 });
  const pts = tcoCurve({ A: aMonthly, B: bMonthly }, 24, { A: capex });
  const crossover = pts.find((pt) => Number(pt.A) <= Number(pt.B)).month;
  assert.equal(crossover, p.months);
});

// -------------------------------------------- scaling users vs scaling demand
// Verify-ship G1: the sensitivity grid used to scale the monthly token total and
// reuse the base fleet under an axis labelled "users". These pin the difference
// the label was claiming — the fleet is a STEP function of the peak second, and
// no amount of linear demand scaling reveals where the step is.

test("sizing: scaling users crosses a GPU boundary that scaling monthly demand never shows", () => {
  const MIX = { chat: "0.25", rag: "0.25", graph_rag: "0.25", agentic: "0.25" };
  const peakAt = (users) => peakTokensPerSecond({ users, peakConcurrencyFraction: "0.05", tokensPerSecondPerStream: "30" });
  const gpusAt = (users) => gpusForLoad({ peakTokensPerSecond: peakAt(users).peak_tokens_s.text, gpuId: "h100" });
  const tokensAt = (users) => Number(buildDemand({ ...BASE, users, mix: MIX }).tokens_mo.text);

  // 500 people at a 5% peak is 25 concurrent streams at 30 tok/s: one H100 holds it.
  assert.equal(peakAt(500).peak_tokens_s.text, "750.00");
  assert.equal(gpusAt(500).gpus_required.text, "1");

  // 4x the people is 4x the peak second, and 3000 tok/s no longer fits on one.
  assert.equal(peakAt(2000).peak_tokens_s.text, "3000.00");
  assert.equal(gpusAt(2000).gpus_required.text, "2");

  // Monthly demand meanwhile scales perfectly linearly — which is exactly why a
  // grid that scales only the monthly total keeps reporting the base fleet's cost.
  assert.equal(tokensAt(2000), 4 * tokensAt(500));
});

// ------------------------------------------------ rented GPU, every provider
// Verify-ship G3: the buyer's question is "who is cheapest for MY load", which a
// one-provider-at-a-time picker cannot answer.

const REGISTRY = [
  { provider: "aws", provider_label: "AWS", sku: "p5.48xlarge", gpu_id: "h100", gpu_label: "H100 80GB", gpu_hourly_usd: 12.29, confidence: "first_party", source_url: "https://aws.example/pricing", observed_at: "2026-08-01T00:00:00Z" },
  { provider: "aws", provider_label: "AWS", sku: "g5.xlarge", gpu_id: "a10g", gpu_label: "A10G", gpu_hourly_usd: 1.006, confidence: "first_party", source_url: "https://aws.example/pricing", observed_at: "2026-08-01T00:00:00Z" },
  { provider: "azure", provider_label: "Azure", sku: "ND-H100-v5", gpu_id: "h100", gpu_label: "H100 80GB", gpu_hourly_usd: 9.8, confidence: "first_party", source_url: "https://azure.example/retail", observed_at: "2026-08-01T00:00:00Z" },
  { provider: "gcp", provider_label: "Google Cloud", sku: "a3-highgpu-8g", gpu_id: "h100", gpu_label: "H100 80GB", gpu_hourly_usd: 11.06, confidence: "indicative", source_url: "https://agg.example/gcp", observed_at: "2026-08-01T00:00:00Z" },
  { provider: "alibaba", provider_label: "Alibaba Cloud", sku: "ecs.gn7e", gpu_id: "a100_80", gpu_label: "A100 80GB", gpu_hourly_usd: 2.4, confidence: "indicative", source_url: "https://agg.example/alibaba", observed_at: "2026-08-01T00:00:00Z" },
  { provider: "tencent", provider_label: "Tencent Cloud", sku: "GN10Xp", gpu_id: "a800", gpu_label: "A800", gpu_hourly_usd: 3.1, confidence: "indicative", source_url: "https://agg.example/tencent", observed_at: "2026-08-01T00:00:00Z" },
  { provider: "huawei", provider_label: "Huawei Cloud", sku: "ai1s.ascend", gpu_id: "ascend_910b", gpu_label: "Ascend 910B", gpu_hourly_usd: 4.2, confidence: "indicative", source_url: "https://agg.example/huawei", observed_at: "2026-08-01T00:00:00Z" },
];

const sizeAt3000 = (gpuId) => gpusForLoad({ peakTokensPerSecond: "3000", gpuId });

test("providers: every provider in the registry appears exactly once, priced or explicitly not", () => {
  const res = rentedGpuByProvider({ rows: REGISTRY, utilization: "0.7", servedTokens: 187110000, sizeFor: sizeAt3000 });

  const seen = [...res.priced.map((p) => p.provider), ...new Set(res.unservable.map((u) => u.provider))].sort();
  assert.deepEqual(seen, ["alibaba", "aws", "azure", "gcp", "huawei", "tencent"]);
  assert.equal(res.priced.length, 5, "five providers priced");
});

test("providers: an accelerator with no throughput assumption is reported, never dropped", () => {
  // A provider VANISHING from a comparison reads as "not offered" when the truth
  // is "not modelled" — the whole reason gpusForLoad refuses instead of defaulting.
  const res = rentedGpuByProvider({ rows: REGISTRY, utilization: "0.7", servedTokens: 187110000, sizeFor: sizeAt3000 });
  const huawei = res.unservable.find((u) => u.provider === "huawei");
  assert.ok(huawei, "huawei is reported as unpriceable");
  assert.equal(huawei.reason, "unknown_gpu");
  assert.equal(res.priced.some((p) => p.provider === "huawei"), false);
});

test("providers: one row per provider, chosen on computed cost rather than on the lowest rate", () => {
  const res = rentedGpuByProvider({ rows: REGISTRY, utilization: "0.7", servedTokens: 187110000, sizeFor: sizeAt3000 });
  const aws = res.priced.filter((p) => p.provider === "aws");
  assert.equal(aws.length, 1, "AWS is listed once, not once per SKU it sells");

  // AWS offers both: 2x H100 at $12.29 (5000 tok/s of capacity) and 10x A10G at
  // $1.006 (3000 tok/s). The winner is whichever costs less to serve the month —
  // NOT the one needing fewer GPUs, and not the one with the lower hourly rate.
  assert.equal(aws[0].gpu_id, "a10g");
  assert.equal(aws[0].gpus_required, 10);

  const totals = res.priced.map((p) => Number(p.monthly_total));
  assert.deepEqual(totals, [...totals].sort((a, b) => a - b), "cheapest first");
});

test("providers: the fleet hourly rate is exact money, not a float product", () => {
  // 3 x $2.40 is 7.199999999999999 in IEEE-754. A dollar figure carrying binary
  // dust is the failure the Dec money path exists to prevent (SPEC 3.5).
  assert.notEqual(String(2.4 * 3), "7.2", "precondition: floats do get this wrong");
  const res = rentedGpuByProvider({ rows: REGISTRY, utilization: "0.7", servedTokens: 187110000, sizeFor: sizeAt3000 });
  const alibaba = res.priced.find((p) => p.provider === "alibaba");
  assert.equal(alibaba.gpus_required, 3, "3 x A100-80 holds 3000 tok/s at 1400 each");
  assert.equal(alibaba.fleet_hourly_usd, "7.2");
});

test("providers: zero demand is refused with a reason, never priced as free", () => {
  const res = rentedGpuByProvider({ rows: REGISTRY, utilization: "0.7", servedTokens: 0, sizeFor: sizeAt3000 });
  assert.deepEqual(res.priced, []);
  assert.equal(res.reason, "zero_demand");
});

// ----------------------------------------------- the percent/fraction boundary
//
// The screen collects shares as PERCENTAGES; this engine still requires a mix
// summing to exactly 1 and refuses anything else (validateMix, SPEC 2.4). That
// contract is deliberately unchanged — app.js:pctInput is the single conversion
// point between the two, and these tests pin the boundary it sits on, because
// nothing in the browser layer is reachable from a unit test.
const toFraction = (pct) => Dec.from(pct).mul(Dec.from("0.01")).toString();

test("a percent share converts to its exact fraction, with no float dust", () => {
  assert.equal(toFraction("70"), "0.7");
  assert.equal(toFraction("30"), "0.3");
  assert.equal(toFraction("5"), "0.05");
  assert.equal(toFraction("12.5"), "0.125");
  assert.equal(toFraction("0"), "0");
  assert.equal(toFraction("100"), "1");
});

// Guards the reason pctInput multiplies instead of dividing. Dec.div truncates
// in BigInt (`q = n / d.c`) BEFORE rescaling, so it succeeds only when the
// numerator already divides the denominator — 70/100 computes q = 0, fails its
// own exactness check and throws. Anyone "simplifying" the conversion back to
// .div(Dec.from("100")) silently converts nothing and hands the engine a
// percentage as if it were a fraction, multiplying the modelled load by 100.
test("dividing a percent by 100 throws, which is why the conversion multiplies", () => {
  assert.throws(() => Dec.from("70").div(Dec.from("100")), RangeError);
  assert.throws(() => Dec.from("5").div(Dec.from("100")), RangeError);
});

// The preset store writes its values straight into the inputs by field id
// (app.js:applyWorkloadPreset), so it must be stored in the units the SCREEN
// uses. If a preset is ever re-entered as a fraction it will still look
// plausible in the JSON — and quietly model a hundredth of the intended load.
test("every workload preset is stored in percent and converts to a mix the engine accepts", async () => {
  const store = JSON.parse(await readFile(new URL("../data/workload-presets.json", import.meta.url), "utf8"));
  const FIELD = { chat: "chat", rag: "rag", graph_rag: "graphrag", agentic: "agentic" };
  assert.ok(store.presets.length > 0);
  for (const p of store.presets) {
    const pct = WORKLOAD_TYPES.reduce(
      (acc, w) => acc.add(Dec.from(p.fields[`f-mix-${FIELD[w]}`])), Dec.from("0"));
    assert.equal(pct.toString(), "100", `${p.id} mix must be stored in percent and add to 100`);
    const mix = Object.fromEntries(
      WORKLOAD_TYPES.map((w) => [w, toFraction(p.fields[`f-mix-${FIELD[w]}`])]));
    assert.equal(validateMix(mix).ok, true, `${p.id} must convert to a mix summing to exactly 1`);
    // A busiest-moment share below 1 is the signature of a fraction left behind.
    assert.ok(Dec.from(p.fields["f-peak-frac"]).ge(Dec.from("1")), `${p.id} f-peak-frac must be a percent`);
  }
});