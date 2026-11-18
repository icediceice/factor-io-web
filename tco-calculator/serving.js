// serving.js — the v0.3 serving model (SPEC §6.6).
//
// WHY THIS EXISTS. v0.2 sized fleets from TOKENS_S_PER_GPU_ASSUMED, one constant
// per accelerator, pinned at "an ~8B-class model". That table's own comment named
// the problem: real throughput moves with model size, quantisation, batch size,
// context length and serving stack, "often by more than an order of magnitude".
// A constant cannot express that, so every GPU count, payback month and provider
// ranking downstream inherited an error larger than the differences being compared.
//
// THE MODEL. Autoregressive decode is MEMORY-BANDWIDTH BOUND, not compute bound:
// each step must read the weights it uses plus the KV cache of every sequence in
// flight, and the arithmetic on those bytes is trivial by comparison. One step of
// a batch of B sequences therefore costs
//
//   t_step = (weights_read + B x kv_per_seq) / (n_gpu x bandwidth x efficiency)
//
// and produces exactly B tokens, so
//
//   per_stream_tok_s = 1 / t_step          aggregate_tok_s = B / t_step
//
// Every dimension the buyer asked about enters that one formula:
//   model size    -> weights_read
//   quantisation  -> bytes per weight, and separately bytes per cached element
//   context       -> kv_per_seq = kv_bytes_per_token x retained_tokens
//   architecture  -> kv_bytes_per_token AND how many tokens each layer retains
//
// THE SOLVE, and why the per-stream floor is the interesting input. The UI already
// collects tokens_s_per_stream — the rate one user sees — and v0.2 used it only to
// size DEMAND. Here it becomes a CONSTRAINT that solves supply: the largest batch
// whose per-stream rate still clears the floor. Batch is then min(that, what VRAM
// holds), and tensor parallelism grows until a batch of at least 1 is admissible.
// That is the actual sizing question, and it is why this file reports a batch size
// rather than accepting one.
//
// WHAT IS NOT MODELLED, stated rather than approximated (SPEC §6.4):
//   - PREFILL. This is a decode model. Prompt processing is compute-bound and has
//     entirely different scaling; a RAG turn with 6k of input does work this file
//     does not count. Throughput here is DECODE throughput.
//   - The DeltaNet/Mamba recurrent state (constant per sequence, nonzero).
//   - Speculative decoding, chunked prefill, prefix-cache hits across sessions.
// Each of these moves the answer in a KNOWN direction, named at the point of use.
// None is silently approximated, because a fabricated correction is worse than a
// declared omission.
//
// Exact arithmetic throughout, for the same reason demand.js uses it: a batch size
// is a floor() of a quotient, and a float quotient lands on the wrong side of an
// integer boundary often enough to change a GPU count.

import { Dec, Rat, formatHalfUp } from "./exact.js";

// A refusal is a user-facing configuration problem, distinct from a programmer
// error, and carries a machine-readable code so the UI renders a specific message.
// Mirrors demand.js:DemandRefusal deliberately — app.js catches both the same way.
export class ServingRefusal extends RangeError {
  constructor(code, message, detail) {
    super(message);
    this.name = "ServingRefusal";
    this.code = code;
    this.detail = detail;
  }
}

const ZERO = Rat.from(0n);
const ONE = Rat.from(1n);
const BYTES_PER_GB = Rat.from(1000000000n);

// Capacity and bandwidth are both read as DECIMAL GB (10^9 bytes), matching how
// vendors quote bandwidth. HBM capacity is often really GiB, so a "80GB" card
// holds ~7% more bytes than this assumes. That bias is absorbed by
// vram_overhead_fraction and declared here rather than silently corrected: the
// two conventions cannot both be right, and picking one loudly beats mixing them.

export const TP_CANDIDATES = [1, 2, 4, 8, 16];

// ------------------------------------------------------------------ value slots
// Same shape demand.js emits, so app.js renders a serving number and a demand
// number through identical code paths and neither can lose its basis tag.
function slot(rat, basis, places = 0) {
  return { rat, basis, text: formatHalfUp(rat, places), places };
}

// A whole count out of JSON. JSON.parse hands back a JS number for `36`, which is
// exact for every layer count that will ever appear, but Rat.from rejects numbers
// outright — so the conversion is explicit and integrality is checked, never assumed.
function count(v, label) {
  if (v === null || v === undefined || v === "") {
    throw new ServingRefusal("missing_input", `${label} is required`, { field: label });
  }
  if (typeof v === "bigint") return v;
  if (typeof v === "number") {
    if (!Number.isInteger(v)) throw new ServingRefusal("not_an_integer", `${label} must be a whole number, got ${v}`, { field: label, got: String(v) });
    return BigInt(v);
  }
  const t = String(v).trim();
  if (!/^\d+$/.test(t)) throw new ServingRefusal("not_an_integer", `${label} must be a whole number, got ${JSON.stringify(t)}`, { field: label, got: t });
  return BigInt(t);
}

// A ratio or measure out of JSON/DOM. Parsed from the DECIMAL STRING so "0.1"
// means one tenth rather than its binary neighbour (the demand.js:q rationale).
function num(v, label, { min = null, allowZero = true } = {}) {
  if (v === null || v === undefined || v === "") {
    throw new ServingRefusal("missing_input", `${label} is required`, { field: label });
  }
  let r;
  if (v instanceof Rat) r = v;
  else if (v instanceof Dec) r = Rat.from(v);
  else if (typeof v === "bigint") r = Rat.from(v);
  else if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new ServingRefusal("not_a_number", `${label} must be finite`, { field: label });
    r = Rat.from(Dec.from(String(v)));
  } else {
    try { r = Rat.from(Dec.from(String(v).trim())); }
    catch { throw new ServingRefusal("not_a_number", `${label} must be a number, got ${JSON.stringify(String(v))}`, { field: label, got: String(v) }); }
  }
  if (!allowZero && r.isZero()) throw new ServingRefusal("out_of_range", `${label} must be greater than zero`, { field: label });
  if (min !== null && r.lt(Rat.from(Dec.from(String(min))))) {
    throw new ServingRefusal("out_of_range", `${label} must be at least ${min}`, { field: label, got: formatHalfUp(r, 6) });
  }
  return r;
}

const minRat = (a, b) => (a.lt(b) ? a : b);
const ratPow = (base, e) => { let r = ONE; for (let i = 0; i < e; i++) r = r.mul(base); return r; };

// floor of a non-negative rational. d is positive by Rat's construction invariant.
function floorRat(r) {
  if (r.n <= 0n) return 0n;
  return r.n / r.d;
}
function ceilRat(r) {
  if (r.n <= 0n) return 0n;
  return (r.n + r.d - 1n) / r.d;
}

// ---------------------------------------------------------------- the KV cache
//
// One general form covers all four architectures, because the thing that actually
// varies is per-LAYER-GROUP, not per-model. Published formulas (Raschka, LLM
// architecture gallery, cited in serving-models.json):
//
//   standard K+V : layers x 2 x kv_heads x head_dim x bytes_per_element
//   unified K=V  : layers x 1 x kv_heads x head_dim x bytes_per_element
//   MLA          : layers x (kv_lora_rank + qk_rope_head_dim) x bytes_per_element
//   linear/GDN   : 0 per token (constant recurrent state, tracked outside growth)
//
// A single flat layer count CANNOT express a hybrid, which is exactly why the four
// cases the buyer named are the four cases a flat count gets wrong.

export function groupBytesPerToken(g, bytesPerElement) {
  const b = bytesPerElement;
  const kind = g?.kind;
  if (kind === "linear") return ZERO;
  if (kind === "mla") {
    const layers = Rat.from(count(g.layers, "group.layers"));
    const lora = count(g.kv_lora_rank, "group.kv_lora_rank");
    const rope = count(g.qk_rope_head_dim, "group.qk_rope_head_dim");
    return layers.mul(Rat.from(lora + rope)).mul(b);
  }
  if (kind === "full" || kind === "sliding") {
    const layers = Rat.from(count(g.layers, "group.layers"));
    // tensors defaults to 2 (a key and a value). Unified K=V layers declare 1.
    const tensors = Rat.from(g.tensors === undefined || g.tensors === null ? 2n : count(g.tensors, "group.tensors"));
    const heads = Rat.from(count(g.kv_heads, "group.kv_heads"));
    const dim = Rat.from(count(g.head_dim, "group.head_dim"));
    return layers.mul(tensors).mul(heads).mul(dim).mul(b);
  }
  throw new ServingRefusal("unknown_attention_kind", `unknown attention group kind ${JSON.stringify(kind)} — expected full, sliding, gdn-linear or mla`, { kind, known: ["full", "sliding", "linear", "mla"] });
}

/**
 * Bytes one retained token adds, summed over every cache-GROWING layer.
 *
 * This is the architecture-comparison figure the cited gallery publishes, and it
 * deliberately ignores retention: a sliding-window layer costs the same per stored
 * token as a full-attention one. Retention is a separate question, answered by
 * kvBytesPerSequence below. Conflating the two is the standard way to get sliding
 * window wrong in both directions at once.
 */
export function kvBytesPerToken(groups, bytesPerElement) {
  const b = num(bytesPerElement, "kv bytes per element", { min: 0, allowZero: false });
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new ServingRefusal("missing_input", "the model has no attention layer groups", { field: "groups" });
  }
  let total = ZERO;
  for (const g of groups) total = total.add(groupBytesPerToken(g, b));
  return total;
}

/** Tokens a given group actually retains at this context length. */
export function groupRetainedTokens(g, contextTokens) {
  if (g?.kind === "linear") return ZERO;
  if (g?.kind === "sliding" && g.window_tokens !== undefined && g.window_tokens !== null) {
    return minRat(contextTokens, Rat.from(count(g.window_tokens, "group.window_tokens")));
  }
  return contextTokens;
}

/**
 * KV bytes held for ONE sequence at this context length.
 *
 * Mixed stacks require the layer-wise form, because different layers retain
 * different numbers of tokens:
 *
 *   total = sum over groups of  bytes_per_token(group) x retained_tokens(group)
 *
 * This is where sliding window earns its keep: past the window those layers stop
 * growing entirely, so a 128k-context Gemma holds far less than a linear
 * extrapolation of its per-token figure would suggest.
 */
export function kvBytesPerSequence(groups, contextTokens, bytesPerElement) {
  const b = num(bytesPerElement, "kv bytes per element", { min: 0, allowZero: false });
  const ctx = num(contextTokens, "context tokens", { min: 0 });
  let total = ZERO;
  for (const g of groups ?? []) {
    total = total.add(groupBytesPerToken(g, b).mul(groupRetainedTokens(g, ctx)));
  }
  return total;
}

// ------------------------------------------------------------------- the weights
//
// The MoE split, and why it is two numbers rather than one. A mixture-of-experts
// model keeps EVERY expert resident in VRAM but reads only the ACTIVE ones each
// step. Collapsing that into one figure gets the answer wrong in opposite
// directions depending on which figure you keep: total params overstates the
// bandwidth cost, active params understates the memory cost. Qwen3-Next 80B-A3B
// is 80B resident and 3B read — a 27x difference, and the entire reason its
// per-GPU throughput does not resemble a dense 80B.

export function weightBytes({ paramsB, activeParamsB, bytesPerParam }) {
  const bpp = num(bytesPerParam, "bytes per parameter", { min: 0, allowZero: false });
  const total = num(paramsB, "model parameters (billions)", { min: 0, allowZero: false });
  const active = activeParamsB === undefined || activeParamsB === null || activeParamsB === ""
    ? total
    : num(activeParamsB, "active parameters (billions)", { min: 0, allowZero: false });
  if (active.gt(total)) {
    throw new ServingRefusal("active_exceeds_total", `active parameters (${formatHalfUp(active, 3)}B) cannot exceed total parameters (${formatHalfUp(total, 3)}B)`, { active: formatHalfUp(active, 3), total: formatHalfUp(total, 3) });
  }
  return {
    resident: total.mul(BYTES_PER_GB).mul(bpp), // every expert, held in VRAM
    read_per_step: active.mul(BYTES_PER_GB).mul(bpp), // only the active experts, read per token
    is_moe: active.lt(total),
  };
}

// ------------------------------------------------------------------ the solve

/**
 * Solve the serving configuration for one model on one accelerator.
 *
 * Returns the tensor-parallel size, the batch that fits under BOTH the VRAM
 * ceiling and the per-stream speed floor, and the throughput that follows.
 *
 * @param {object} a
 * @param {object} a.model            {params_b, active_params_b, groups}
 * @param {number|string} a.contextTokens
 * @param {string} a.bytesPerParam    weight quantisation, bytes per parameter
 * @param {string} a.kvBytesPerElement KV quantisation, bytes per cached element
 * @param {string} a.vramGb           per-GPU capacity (from gpu-pricing.json)
 * @param {string} a.bandwidthGbS     per-GPU memory bandwidth
 * @param {string} a.runtimeEfficiency fraction of peak bandwidth achieved [ASSUMED]
 * @param {string} a.tpEfficiency     per-extra-GPU scaling factor [ASSUMED]
 * @param {string} a.vramOverheadFraction reserved for activations/fragmentation [ASSUMED]
 * @param {string} [a.perStreamFloorTokS] interactive floor; null in batch mode
 * @param {number} [a.maxBatch]       runtime concurrency cap, null = uncapped
 * @param {number[]} [a.tpCandidates] tensor-parallel sizes to try
 */
export function servingPlan({
  model,
  contextTokens,
  bytesPerParam,
  kvBytesPerElement,
  vramGb,
  bandwidthGbS,
  runtimeEfficiency,
  tpEfficiency,
  vramOverheadFraction,
  perStreamFloorTokS = null,
  maxBatch = null,
  tpCandidates = TP_CANDIDATES,
}) {
  const ctx = num(contextTokens, "context tokens", { min: 1 });
  const eff = num(runtimeEfficiency, "runtime efficiency", { min: 0, allowZero: false });
  const tpEff = num(tpEfficiency, "tensor-parallel efficiency", { min: 0, allowZero: false });
  const overhead = num(vramOverheadFraction, "VRAM overhead fraction", { min: 0 });
  if (overhead.ge(ONE)) {
    throw new ServingRefusal("out_of_range", "VRAM overhead fraction must be below 1 — at 1 there is no memory left for the model", { field: "vram_overhead_fraction" });
  }
  const vramPerGpu = num(vramGb, "GPU VRAM (GB)", { min: 0, allowZero: false }).mul(BYTES_PER_GB).mul(ONE.sub(overhead));
  const bwPerGpu = num(bandwidthGbS, "GPU memory bandwidth (GB/s)", { min: 0, allowZero: false }).mul(BYTES_PER_GB).mul(eff);

  const w = weightBytes({ paramsB: model?.params_b, activeParamsB: model?.active_params_b, bytesPerParam });
  const kvPerToken = kvBytesPerToken(model?.groups, kvBytesPerElement);
  const kvPerSeq = kvBytesPerSequence(model?.groups, ctx, kvBytesPerElement);

  const floor = perStreamFloorTokS === null || perStreamFloorTokS === undefined || perStreamFloorTokS === ""
    ? null
    : num(perStreamFloorTokS, "per-stream tokens/s floor", { min: 0, allowZero: false });
  const capBatch = maxBatch === null || maxBatch === undefined || maxBatch === "" ? null : count(maxBatch, "max batch");

  const attempts = [];
  for (const tp of tpCandidates) {
    const n = count(tp, "tensor-parallel size");
    if (n < 1n) continue;
    const nR = Rat.from(n);
    // Aggregate bandwidth across the group, discounted for collective overhead.
    // Weights and KV are both sharded, so the whole group reads the whole model
    // once per step in parallel — the discount is what stops this being free.
    const aggBw = nR.mul(bwPerGpu).mul(ratPow(tpEff, Number(n) - 1));
    const vramTotal = nR.mul(vramPerGpu);

    if (vramTotal.le(w.resident)) {
      attempts.push({ tp: Number(n), reason: "weights_exceed_vram", detail: `${formatHalfUp(w.resident.div(BYTES_PER_GB), 1)} GB of weights against ${formatHalfUp(vramTotal.div(BYTES_PER_GB), 1)} GB usable` });
      continue;
    }

    // Batch under the memory ceiling. A model with no cache-growing layers is
    // unbounded here rather than a division by zero — that is a real architecture
    // (pure linear attention), not an error, so it takes the cap instead.
    const memRoom = vramTotal.sub(w.resident);
    const batchMem = kvPerSeq.isZero() ? null : floorRat(memRoom.div(kvPerSeq));

    // Batch under the per-stream floor: per_stream = aggBw / (w_read + B*kv) >= floor.
    let batchSpeed = null;
    if (floor !== null) {
      const byteBudget = aggBw.div(floor);
      if (byteBudget.le(w.read_per_step)) {
        attempts.push({ tp: Number(n), reason: "floor_unreachable", detail: `reading ${formatHalfUp(w.read_per_step.div(BYTES_PER_GB), 2)} GB of weights per step already costs more than ${formatHalfUp(floor, 1)} tok/s allows at this bandwidth` });
        continue;
      }
      batchSpeed = kvPerSeq.isZero() ? null : floorRat(byteBudget.sub(w.read_per_step).div(kvPerSeq));
    }

    let batch = null;
    for (const c of [batchMem, batchSpeed, capBatch]) {
      if (c === null) continue;
      batch = batch === null ? c : (c < batch ? c : batch);
    }
    // Every constraint came back unbounded (no KV growth, no floor, no cap).
    if (batch === null) batch = 1n;

    if (batch < 1n) {
      const why = batchSpeed !== null && batchSpeed < 1n ? "floor_admits_no_batch" : "vram_admits_no_batch";
      attempts.push({ tp: Number(n), reason: why, detail: why === "floor_admits_no_batch" ? `holding ${formatHalfUp(floor, 1)} tok/s per stream leaves room for no concurrent sequence at ${formatHalfUp(ctx, 0)} tokens of context` : `${formatHalfUp(kvPerSeq.div(BYTES_PER_GB), 2)} GB of KV per sequence does not fit in the ${formatHalfUp(memRoom.div(BYTES_PER_GB), 1)} GB left after weights` });
      continue;
    }

    const bytesPerStep = w.read_per_step.add(Rat.from(batch).mul(kvPerSeq));
    const perStream = aggBw.div(bytesPerStep); // tokens/s one user sees
    const aggregate = perStream.mul(Rat.from(batch)); // tokens/s the replica delivers
    const perGpu = aggregate.div(nR);
    const vramUsed = w.resident.add(Rat.from(batch).mul(kvPerSeq));

    const bound = batchSpeed !== null && batchSpeed === batch ? "per-stream speed floor"
      : capBatch !== null && capBatch === batch ? "runtime concurrency cap"
      : batchMem !== null && batchMem === batch ? "VRAM"
      : "unconstrained";

    return {
      ok: true,
      tensor_parallel: slot(Rat.from(n), "derived"),
      gpus_per_replica: Number(n),
      batch: slot(Rat.from(batch), "derived"),
      batch_bound_by: bound,
      per_stream_tokens_s: slot(perStream, "assumed", 2),
      tokens_s_per_replica: slot(aggregate, "assumed", 2),
      tokens_s_per_gpu: slot(perGpu, "assumed", 2),
      kv_bytes_per_token: slot(kvPerToken, "derived"),
      kv_gb_per_sequence: slot(kvPerSeq.div(BYTES_PER_GB), "derived", 3),
      weights_gb_resident: slot(w.resident.div(BYTES_PER_GB), "derived", 2),
      weights_gb_read_per_step: slot(w.read_per_step.div(BYTES_PER_GB), "derived", 2),
      is_moe: w.is_moe,
      vram_gb_used_per_gpu: slot(vramUsed.div(nR).div(BYTES_PER_GB), "derived", 2),
      vram_gb_usable_per_gpu: slot(vramPerGpu.div(BYTES_PER_GB), "derived", 2),
      context_tokens: slot(ctx, "input"),
      // Every throughput figure above rests on [ASSUMED] efficiency constants and
      // a decode-only model, so it can never back a modelled_p95_capacity verdict
      // (SPEC §6.5). The tag rides on the value; this flag lets callers assert it.
      assumed: true,
      rejected_smaller: attempts,
    };
  }

  // Nothing fit. Report WHY, per attempted size — a bare "does not fit" sends the
  // user to guess at which knob to turn, and the two failure modes want opposite moves.
  throw new ServingRefusal(
    "no_viable_configuration",
    `this model does not serve on ${String(model?.label ?? "the selected accelerator")} at any tensor-parallel size up to ${tpCandidates[tpCandidates.length - 1]}: ${attempts.map((a) => `${a.tp}x — ${a.detail}`).join("; ")}`,
    { attempts },
  );
}

/**
 * The evidence-store view of a solved configuration (SPEC §6.3).
 *
 * The dimensions are the ones calculator.js:EVIDENCE_DIMS already matches on, so
 * when measured rows do land the config asked about is derived from the same
 * inputs rather than assembled a second time with different names. Nothing here
 * asserts a measurement — it names the configuration a measurement WOULD have to
 * match, which is exactly what the all-dimensions rule requires.
 */
export function evidenceConfig({ plan, modelId, runtimeKey, runtimeVersion, quantization, gpuId, promptTokens, outputTokens, batchMode }) {
  return {
    model_revision: modelId ?? null,
    runtime: runtimeKey ?? null,
    runtime_version: runtimeVersion ?? null,
    quantization: quantization ?? null,
    hardware_topology: plan && gpuId ? `${plan.gpus_per_replica}x ${gpuId}` : null,
    prompt_output_dist: promptTokens != null && outputTokens != null ? `${promptTokens}/${outputTokens}` : null,
    concurrency: plan ? Number(plan.batch.text) : null,
    batch_mode: batchMode ?? null,
    percentile_window: null,
  };
}

export { floorRat, ceilRat };