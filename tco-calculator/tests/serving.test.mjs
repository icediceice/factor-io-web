// NOTE: two regression tests live at the BOTTOM of this file, guarding defects
// that reached a real browser and that nothing here caught — both caused by the
// roofline producing FRACTIONAL capacities where the v0.2 integer constant never
// did. Search "regression:" below.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  kvBytesPerToken,
  kvBytesPerSequence,
  groupBytesPerToken,
  groupRetainedTokens,
  weightBytes,
  servingPlan,
  evidenceConfig,
  ServingRefusal,
} from "../serving.js";
import { gpusForLoad, DemandRefusal } from "../demand.js";
import { rentedGpuByProvider } from "../calculator.js";
import { formatHalfUp, Rat, Dec } from "../exact.js";

// SPEC 6.6 — serving is DERIVED from the model, never asserted as a per-GPU constant.

const DATA = JSON.parse(readFileSync(fileURLToPath(new URL("../data/serving-models.json", import.meta.url)), "utf8"));
const MODEL = (id) => DATA.models.find((m) => m.id === id);
const BF16 = "2";
const FP8 = "1";

// Serving conditions used across the throughput tests. Held in one place so a
// test that changes an input changes exactly one thing.
const H100 = { vramGb: "80", bandwidthGbS: "3350" };
const L4 = { vramGb: "24", bandwidthGbS: "300" };
const KNOBS = {
  runtimeEfficiency: "0.80",
  tpEfficiency: "0.92",
  vramOverheadFraction: "0.10",
};
const plan = (over = {}) => servingPlan({
  model: MODEL("qwen3-8b"),
  contextTokens: 8192,
  bytesPerParam: BF16,
  kvBytesPerElement: BF16,
  ...H100,
  ...KNOBS,
  perStreamFloorTokS: "30",
  ...over,
});

// ------------------------------------------------- the published KV figures
//
// These four numbers are the FALSIFIER for the whole layer-group model. Each is
// published by the cited gallery, which verified it against the model's own
// config.json. If the formula is wrong in any of the four architectures the
// buyer named, at least one of these will not land — no approximate matching,
// no tolerance, exact bytes.

test("full attention: Qwen3 8B is exactly 147,456 B/token (36 x 2 x 8 x 128 x 2)", () => {
  const got = kvBytesPerToken(MODEL("qwen3-8b").groups, BF16);
  assert.equal(formatHalfUp(got, 0), "147456");
});

test("sliding window: Gemma 4 31B is exactly 860,160 B/token — two layer classes, one with unified K=V", () => {
  // 50 sliding x 2 tensors x 16 heads x 256 dim x 2B = 819,200
  // 10 global  x 1 tensor  x  4 heads x 512 dim x 2B =  40,960
  const got = kvBytesPerToken(MODEL("gemma-4-31b").groups, BF16);
  assert.equal(formatHalfUp(got, 0), "860160");
});

test("GDN hybrid: Qwen3-Next 80B-A3B is exactly 24,576 B/token — only 12 of 48 layers grow a cache", () => {
  const got = kvBytesPerToken(MODEL("qwen3-next-80b-a3b").groups, BF16);
  assert.equal(formatHalfUp(got, 0), "24576");
});

test("MLA: DeepSeek V3 is exactly 70,272 B/token — 61 x (512 + 64) x 2, query heads drop out", () => {
  const got = kvBytesPerToken(MODEL("deepseek-v3").groups, BF16);
  assert.equal(formatHalfUp(got, 0), "70272");
});

test("every shipped preset agrees with its own published figure", () => {
  // Guards the DATA as well as the engine: a typo in a layer count or head dim
  // fails here rather than silently mis-sizing every fleet on that model.
  for (const m of DATA.models) {
    if (m.kv_bytes_per_token_bf16_expected === null) continue;
    const got = kvBytesPerToken(m.groups, BF16);
    assert.equal(formatHalfUp(got, 0), String(m.kv_bytes_per_token_bf16_expected), `${m.id} disagrees with its cited KV figure`);
  }
});

test("a GDN linear layer contributes zero per token, and is not merely small", () => {
  const linear = MODEL("qwen3-next-80b-a3b").groups.find((g) => g.kind === "linear");
  assert.equal(groupBytesPerToken(linear, Rat.from(Dec.from(BF16))).isZero(), true);
});

test("KV quantisation to FP8 exactly halves the per-token cost", () => {
  const bf = kvBytesPerToken(MODEL("qwen3-8b").groups, BF16);
  const fp = kvBytesPerToken(MODEL("qwen3-8b").groups, FP8);
  assert.equal(formatHalfUp(fp.mul(Rat.from(2n)), 0), formatHalfUp(bf, 0));
});

test("an unknown attention kind refuses rather than defaulting to full attention", () => {
  assert.throws(
    () => kvBytesPerToken([{ kind: "mamba3", layers: 4 }], BF16),
    (e) => e instanceof ServingRefusal && e.code === "unknown_attention_kind",
  );
});

// ------------------------------------------------------------- retention
//
// The distinction the sliding-window case turns on: cost per STORED token is
// unchanged, what changes is how many tokens stay stored.

test("sliding window caps retention at the window; full attention does not", () => {
  const g = MODEL("gemma-4-31b").groups;
  const sliding = g.find((x) => x.kind === "sliding");
  const global = g.find((x) => x.kind === "full");
  const ctx = Rat.from(131072n);
  assert.equal(formatHalfUp(groupRetainedTokens(sliding, ctx), 0), "1024", "sliding retains only its window");
  assert.equal(formatHalfUp(groupRetainedTokens(global, ctx), 0), "131072", "global retains the whole context");
});

test("below the window, sliding retains everything — the cap must not bite early", () => {
  const sliding = MODEL("gemma-4-31b").groups.find((x) => x.kind === "sliding");
  assert.equal(formatHalfUp(groupRetainedTokens(sliding, Rat.from(512n)), 0), "512");
});

test("at 128k context the sliding model holds far less than its per-token rate implies", () => {
  // The naive extrapolation (per-token x context) is what a flat model would do.
  const groups = MODEL("gemma-4-31b").groups;
  const perToken = kvBytesPerToken(groups, BF16);
  const naive = perToken.mul(Rat.from(131072n));
  const real = kvBytesPerSequence(groups, 131072, BF16);
  assert.equal(real.lt(naive), true, "retention must reduce the total");
  // 50 x 2 x 16 x 256 x 2 x 1024 + 10 x 1 x 4 x 512 x 2 x 131072
  //   = 838,860,800 + 5,368,709,120 = 6,207,569,920
  assert.equal(formatHalfUp(real, 0), "6207569920");
});

test("full attention scales KV linearly with context — the case that blows up", () => {
  const groups = MODEL("qwen3-8b").groups;
  const at8k = kvBytesPerSequence(groups, 8192, BF16);
  const at32k = kvBytesPerSequence(groups, 32768, BF16);
  assert.equal(formatHalfUp(at8k.mul(Rat.from(4n)), 0), formatHalfUp(at32k, 0));
});

// ---------------------------------------------------------------- the weights
//
// The MoE split. Collapsing these into one number is wrong in opposite
// directions depending on which one survives.

test("MoE holds every expert but reads only the active ones", () => {
  const w = weightBytes({ paramsB: "80", activeParamsB: "3", bytesPerParam: BF16 });
  assert.equal(formatHalfUp(w.resident, 0), "160000000000");
  assert.equal(formatHalfUp(w.read_per_step, 0), "6000000000");
  assert.equal(w.is_moe, true);
});

test("a dense model reads everything it holds", () => {
  const w = weightBytes({ paramsB: "8.2", activeParamsB: "8.2", bytesPerParam: BF16 });
  assert.equal(formatHalfUp(w.resident, 0), formatHalfUp(w.read_per_step, 0));
  assert.equal(w.is_moe, false);
});

test("weight quantisation to INT4 quarters the footprint of BF16", () => {
  const bf = weightBytes({ paramsB: "70", bytesPerParam: "2" });
  const i4 = weightBytes({ paramsB: "70", bytesPerParam: "0.5" });
  assert.equal(formatHalfUp(i4.resident.mul(Rat.from(4n)), 0), formatHalfUp(bf.resident, 0));
});

test("active parameters exceeding total is refused, not clamped", () => {
  assert.throws(
    () => weightBytes({ paramsB: "8", activeParamsB: "80", bytesPerParam: BF16 }),
    (e) => e instanceof ServingRefusal && e.code === "active_exceeds_total",
  );
});

// ------------------------------------------------------------------ the solve

test("an 8B dense model fits one H100 and clears the per-stream floor", () => {
  const p = plan();
  assert.equal(p.gpus_per_replica, 1);
  assert.equal(Number(p.batch.text) >= 1, true);
  assert.equal(Number(p.per_stream_tokens_s.text) >= 30, true, "the solved batch must honour the floor it was solved against");
});

test("raising the per-stream floor lowers the batch — the floor is a real constraint", () => {
  const slow = Number(plan({ perStreamFloorTokS: "20" }).batch.text);
  const fast = Number(plan({ perStreamFloorTokS: "60" }).batch.text);
  assert.equal(fast < slow, true, `floor 60 gave batch ${fast}, floor 20 gave ${slow}`);
});

test("longer context lowers the batch and the throughput at full attention", () => {
  const short = plan({ contextTokens: 4096 });
  const long = plan({ contextTokens: 32768 });
  assert.equal(Number(long.batch.text) < Number(short.batch.text), true);
  assert.equal(Number(long.tokens_s_per_gpu.text) < Number(short.tokens_s_per_gpu.text), true);
});

test("FP8 weights raise throughput against BF16, all else equal", () => {
  const bf = Number(plan({ bytesPerParam: "2" }).tokens_s_per_gpu.text);
  const fp = Number(plan({ bytesPerParam: "1" }).tokens_s_per_gpu.text);
  assert.equal(fp > bf, true, `fp8 ${fp} should beat bf16 ${bf}`);
});

test("the GDN MoE beats the dense model per GPU at the same context — the headline architecture claim", () => {
  const dense = servingPlan({
    model: MODEL("qwen3-8b"), contextTokens: 32768, bytesPerParam: BF16, kvBytesPerElement: BF16,
    ...H100, ...KNOBS, perStreamFloorTokS: "30",
  });
  const gdn = servingPlan({
    model: MODEL("qwen3-next-80b-a3b"), contextTokens: 32768, bytesPerParam: BF16, kvBytesPerElement: BF16,
    ...H100, ...KNOBS, perStreamFloorTokS: "30",
  });
  // 80B resident forces tensor parallelism the 8B model does not need...
  assert.equal(gdn.gpus_per_replica > dense.gpus_per_replica, true);
  // ...yet 3B active and 24 KiB/token still deliver more tokens per GPU.
  assert.equal(
    Number(gdn.tokens_s_per_gpu.text) > Number(dense.tokens_s_per_gpu.text),
    true,
    `gdn ${gdn.tokens_s_per_gpu.text} vs dense ${dense.tokens_s_per_gpu.text}`,
  );
});

test("tensor parallelism escalates until the weights fit, and reports the size", () => {
  const p = servingPlan({
    model: MODEL("deepseek-v3"), contextTokens: 8192, bytesPerParam: FP8, kvBytesPerElement: BF16,
    ...H100, ...KNOBS, perStreamFloorTokS: "30",
  });
  // 671B at 1 byte/param is 671 GB resident; 72 GB usable per H100 needs 16.
  assert.equal(p.gpus_per_replica, 16);
  assert.equal(Number(p.weights_gb_resident.text) > 600, true);
});

test("a model that fits nowhere refuses with a reason per attempted size", () => {
  try {
    servingPlan({
      model: MODEL("deepseek-v3"), contextTokens: 8192, bytesPerParam: BF16, kvBytesPerElement: BF16,
      ...L4, ...KNOBS, perStreamFloorTokS: "30",
    });
    assert.fail("expected a refusal");
  } catch (e) {
    assert.equal(e instanceof ServingRefusal, true);
    assert.equal(e.code, "no_viable_configuration");
    assert.equal(e.detail.attempts.length > 0, true, "must say what it tried");
    assert.equal(e.detail.attempts.every((a) => typeof a.reason === "string" && a.reason.length > 0), true);
  }
});

test("batch mode drops the floor and admits a larger batch than interactive", () => {
  const interactive = Number(plan({ perStreamFloorTokS: "30" }).batch.text);
  const batch = Number(plan({ perStreamFloorTokS: null }).batch.text);
  assert.equal(batch >= interactive, true);
});

test("a runtime concurrency cap binds, and the plan says so", () => {
  const p = plan({ maxBatch: 4 });
  assert.equal(p.batch.text, "4");
  assert.equal(p.batch_bound_by, "runtime concurrency cap");
});

test("every throughput figure is tagged assumed — it can never back a p95 verdict", () => {
  const p = plan();
  assert.equal(p.assumed, true);
  assert.equal(p.tokens_s_per_gpu.basis, "assumed");
  assert.equal(p.per_stream_tokens_s.basis, "assumed");
  assert.equal(p.tokens_s_per_replica.basis, "assumed");
});

test("VRAM accounting reserves the overhead fraction and never exceeds usable", () => {
  const p = plan();
  assert.equal(Number(p.vram_gb_usable_per_gpu.text), 72, "80 GB less the 10% overhead");
  assert.equal(Number(p.vram_gb_used_per_gpu.text) <= 72, true);
});

test("an overhead fraction of 1 refuses rather than dividing by nothing", () => {
  assert.throws(
    () => plan({ vramOverheadFraction: "1" }),
    (e) => e instanceof ServingRefusal && e.code === "out_of_range",
  );
});

// ------------------------------------------------- integration with gpusForLoad

test("a serving plan sizes in WHOLE replicas, never a fractional tensor-parallel group", () => {
  const p = servingPlan({
    model: MODEL("qwen3-next-80b-a3b"), contextTokens: 32768, bytesPerParam: BF16, kvBytesPerElement: BF16,
    ...H100, ...KNOBS, perStreamFloorTokS: "30",
  });
  const perReplica = Number(p.tokens_s_per_replica.text);
  // Demand just past one replica must buy a whole second replica, not one GPU.
  const sized = gpusForLoad({ peakTokensPerSecond: String(Math.ceil(perReplica) + 1), serving: p });
  assert.equal(sized.replicas.text, "2");
  assert.equal(Number(sized.gpus_required.text), p.gpus_per_replica * 2);
  assert.equal(Number(sized.gpus_required.text) % p.gpus_per_replica, 0, "GPU count must be a multiple of the TP size");
  assert.equal(sized.serving_basis, "roofline");
});

test("zero demand still stands up one replica — nothing serves on zero GPUs", () => {
  const p = plan();
  const sized = gpusForLoad({ peakTokensPerSecond: "0", serving: p });
  assert.equal(sized.replicas.text, "1");
  assert.equal(Number(sized.gpus_required.text), p.gpus_per_replica);
});

test("a measured tokens/s per GPU OUTRANKS the serving plan", () => {
  // A user's own benchmark must never be overridden by a modelled figure.
  const p = plan();
  const sized = gpusForLoad({ peakTokensPerSecond: "1000", serving: p, tokensPerSecondPerGpu: "500" });
  assert.equal(sized.tokens_s_per_gpu.text, "500.00");
  assert.equal(sized.tokens_s_per_gpu.basis, "user_override");
  assert.equal(sized.gpus_required.text, "2");
  assert.equal(sized.serving_basis, undefined, "the override path must not claim a roofline basis");
});

test("without a serving plan gpusForLoad is byte-identical to v0.2", () => {
  // The fallback path is load-bearing: 10 existing call sites and the whole
  // pre-v0.3 fixture set depend on it being untouched.
  const sized = gpusForLoad({ peakTokensPerSecond: "750", gpuId: "h100" });
  assert.equal(sized.gpus_required.text, "1");
  assert.equal(sized.tokens_s_per_gpu.text, "2500.00");
  assert.equal(sized.assumed, true);
  assert.equal(sized.replicas, undefined, "v0.2 shape carries no replica fields");
});

test("an unknown gpu id still fails loudly on the fallback path", () => {
  assert.throws(
    () => gpusForLoad({ peakTokensPerSecond: "750", gpuId: "mi300x" }),
    (e) => e instanceof DemandRefusal && e.code === "unknown_gpu",
  );
});

// ------------------------------------------------------------ evidence config

test("the evidence config names the dimensions calculator.js matches on", () => {
  const p = plan();
  const c = evidenceConfig({
    plan: p, modelId: "qwen3-8b", runtimeKey: "vllm", runtimeVersion: "0.8.0",
    quantization: "bf16", gpuId: "h100", promptTokens: 3000, outputTokens: 400, batchMode: "continuous",
  });
  assert.equal(c.hardware_topology, `${p.gpus_per_replica}x h100`);
  assert.equal(c.prompt_output_dist, "3000/400");
  assert.equal(c.concurrency, Number(p.batch.text));
  // Unmeasured dimensions stay null rather than being invented (SPEC 6.4).
  assert.equal(c.percentile_window, null);
});

// ------------------------------------------------------------- data integrity

test("every accelerator in the pricing registry has a bandwidth figure", () => {
  const pricing = JSON.parse(readFileSync(fileURLToPath(new URL("../data/gpu-pricing.json", import.meta.url)), "utf8"));
  for (const id of Object.keys(pricing.gpus ?? {})) {
    assert.ok(DATA.accelerators[id], `gpu ${id} is priced but has no bandwidth — it would size on nothing`);
    assert.match(String(DATA.accelerators[id].bandwidth_gb_s), /^\d+(\.\d+)?$/);
  }
});

test("bandwidth is carried as a decimal STRING, never a JSON float", () => {
  for (const [id, a] of Object.entries(DATA.accelerators)) {
    assert.equal(typeof a.bandwidth_gb_s, "string", `${id} bandwidth must be a string for exact parsing`);
  }
});

test("every uncited constant declares a basis and every cited one carries a source", () => {
  for (const [id, a] of Object.entries(DATA.accelerators)) {
    assert.ok(["cited", "inferred", "assumed"].includes(a.basis), `${id} has no basis`);
    if (a.basis === "cited") assert.ok(a.source_url, `${id} claims cited but carries no source`);
    else assert.ok(a.note && a.note.length > 0, `${id} is ${a.basis} and must say why`);
  }
  for (const r of Object.values(DATA.runtimes)) assert.equal(r.basis, "assumed");
  assert.equal(DATA.tensor_parallel.basis, "assumed");
  assert.equal(DATA.vram_overhead_fraction.basis, "assumed");
});

// ---------------------------------------------------------------- regressions
// Both defects below shipped past the whole suite above and only surfaced in a
// live browser, because every v0.2 sizing path produced a WHOLE tokens/s figure
// and the roofline is the first thing that does not.

// regression: a roofline capacity is fractional (e.g. 813.24 tok/s), and
// laneCMonthly takes tokensS through BigInt(). rentedGpuByProvider must round at
// that boundary; before the fix this threw
// "RangeError: The number 813.24 cannot be converted to a BigInt".
test("regression: rentedGpuByProvider survives a fractional capacity_tokens_s", () => {
  const plan = servingPlan({
    model: MODEL("qwen3-8b"),
    contextTokens: 32768,
    bytesPerParam: BF16,
    kvBytesPerElement: BF16,
    ...H100,
    ...KNOBS,
    perStreamFloorTokS: "30",
  });
  const sized = gpusForLoad({ peakTokensPerSecond: "750", serving: plan });

  // The precondition that makes this test meaningful: if capacity ever became a
  // whole number the assertion below would pass for the wrong reason.
  assert.ok(
    !Number.isInteger(Number(sized.capacity_tokens_s.text)),
    `expected a fractional capacity to exercise the BigInt boundary, got ${sized.capacity_tokens_s.text}`,
  );

  const out = rentedGpuByProvider({
    rows: [{
      provider: "acme", provider_label: "Acme", sku: "x1", gpu_id: "h100",
      gpu_label: "NVIDIA H100 80GB", gpu_hourly_usd: "2.50",
      confidence: "indicative", source_url: "https://example.invalid", observed_at: "2026-08-29",
    }],
    utilization: "0.7",
    servedTokens: 187110000,
    sizeFor: () => sized,
  });

  assert.equal(out.unservable.length, 0, JSON.stringify(out.unservable));
  assert.equal(out.priced.length, 1);

  // A total travels as a decimal OR as a reduced n/d rational — a non-terminating
  // division keeps full precision rather than collapsing to a float, and
  // app.js:moneyValue parses both forms. Here it is genuinely non-terminating.
  const totalText = out.priced[0].monthly_total;
  assert.match(totalText, /^-?\d+(\.\d+)?$|^-?\d+\/\d+$/);
  const m = /^(-?\d+)\/(\d+)$/.exec(totalText);
  const total = m ? new Rat(BigInt(m[1]), BigInt(m[2])) : Dec.from(totalText);

  // Hand-checked: 2 replicas x 423.87 tok/s -> 848 tok/s after the integer
  // boundary; 187,110,000 tokens / (848 x 0.7 x 3600) = 87.559 h; at 2 GPUs x
  // $2.50/GPU-hr = $5.00/hr that is $437.79.
  assert.equal(formatHalfUp(total, 2), "437.79");
});

// regression: a provider whose accelerator cannot hold the model must be
// REPORTED with its reason, never dropped from the table — a vanished provider
// reads as "not offered" when the truth is "not modelled".
test("regression: an accelerator that cannot serve the model is reported, not dropped", () => {
  const out = rentedGpuByProvider({
    rows: [{
      provider: "acme", provider_label: "Acme", sku: "l4", gpu_id: "l4",
      gpu_label: "NVIDIA L4 24GB", gpu_hourly_usd: "0.80",
      confidence: "indicative", source_url: "https://example.invalid", observed_at: "2026-08-29",
    }],
    utilization: "0.7",
    servedTokens: 187110000,
    // What app.js:solveServingFor does for an accelerator the model overflows.
    sizeFor: () => { throw new ServingRefusal("no_viable_configuration", "does not fit on an L4", {}); },
  });

  assert.equal(out.priced.length, 0);
  assert.equal(out.unservable.length, 1);
  assert.equal(out.unservable[0].reason, "no_viable_configuration");
  assert.equal(out.unservable[0].provider_label, "Acme");
});

// regression: option totals arrive as a Dec OR a non-terminating Rat, and
// Dec.sub(Rat) throws ("a non-terminating Rational cannot become a Decimal").
// Promoting to Rat first makes both the ranking and the difference total.
test("regression: a Dec total and a non-terminating Rat total compare and subtract", () => {
  const decTotal = Dec.from("10000.00");
  const ratTotal = new Rat(1000n, 3n); // 333.333... — non-terminating on purpose
  assert.throws(() => decTotal.sub(ratTotal), /non-terminating/);

  const a = Rat.from(decTotal);
  const b = Rat.from(ratTotal);
  assert.equal(b.lt(a), true);
  assert.equal(formatHalfUp(a.sub(b), 2), "9666.67");
});