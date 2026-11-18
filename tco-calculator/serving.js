// serving.js — the v0.3/v0.5 serving model (SPEC §6.6).
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
//   t_step = (weights_read + B x kv_per_seq_active) / (n_gpu x bandwidth x efficiency)
//
// and produces exactly B tokens, so
//
//   per_stream_tok_s = 1 / t_step          aggregate_tok_s = B / t_step
//
// Every dimension the buyer asked about enters that one formula:
//   model size    -> weights_read (and fail-closed resident checkpoint weights)
//   quantisation  -> bytes per weight, and separately bytes per cached element (BF16/FP8/INT8/FP4)
//   context       -> kv_per_seq = Σ groupSequenceBytes(group, context_tokens)
//   architecture  -> per-layer-group retention (full, sliding window, linear/GDN, MLA & compressed MLA)
//   prefix cache  -> peak-bounded PagedAttention VRAM B*bytes(peak) - (B-1)*shareableBytes(peak)
//                    ONLY on runtimes with proven page-block prefix sharing; decode bandwidth
//                    stays charged per sequence.
//
// WHAT IS NOT MODELLED, stated rather than approximated (SPEC §6.4):
//   - PREFILL. This is a decode model. Prompt processing is compute-bound and has
//     entirely different scaling; a RAG turn with 20k+ of input does work this file
//     does not count. Throughput here is DECODE throughput.
//   - The DeltaNet/Mamba recurrent state (constant per sequence, nonzero).
//   - Speculative decoding, chunked prefill, unverified host-DRAM tiering.
// Each of these moves the answer in a KNOWN direction, named at the point of use.
// None is silently approximated, because a fabricated correction is worse than a
// declared omission.

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

// NVFP4 / MXFP4 KV element footprint: 4-bit E2M1 payload (0.5 B) + 1-byte E4M3
// block scale per 16 channels (0.0625 B) = 9/16 = 0.5625 bytes per element.
export const FP4_KV_BYTES_PER_ELEMENT = "0.5625";

export const TP_CANDIDATES = [1, 2, 4, 8, 16];

// ------------------------------------------------------------------ value slots
function slot(rat, basis, places = 0) {
  return { rat, basis, text: formatHalfUp(rat, places), places };
}

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
const maxRat = (a, b) => (a.gt(b) ? a : b);
const ratPow = (base, e) => { let r = ONE; for (let i = 0; i < e; i++) r = r.mul(base); return r; };

// floor/ceil of a non-negative rational. d is positive by Rat's construction invariant.
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
// Layer-group forms:
//   standard K+V   : layers x 2 x kv_heads x head_dim x bytes_per_element
//   unified K=V    : layers x 1 x kv_heads x head_dim x bytes_per_element
//   classic MLA    : layers x (kv_lora_rank + qk_rope_head_dim) x bytes_per_element
//   compressed MLA : layers x ((kv_lora_rank + qk_rope_head_dim) x bytes_per_element + index_bytes_per_entry)
//                    with ceil(context / compress_ratio) retained entries per sequence
//   linear/GDN     : 0 per token (constant recurrent state, tracked outside growth)

function mlaGroupSpec(g) {
  const layers = Rat.from(count(g.layers, "group.layers"));
  const lora = count(g.kv_lora_rank, "group.kv_lora_rank");
  const rope = count(g.qk_rope_head_dim, "group.qk_rope_head_dim");
  const compressRatio = g.compress_ratio === undefined || g.compress_ratio === null
    ? 1n
    : count(g.compress_ratio, "group.compress_ratio");
  if (compressRatio < 1n) {
    throw new ServingRefusal("out_of_range", "group.compress_ratio must be at least 1", { field: "group.compress_ratio", got: String(compressRatio) });
  }
  const indexBytes = g.index_bytes_per_entry === undefined || g.index_bytes_per_entry === null
    ? 0n
    : count(g.index_bytes_per_entry, "group.index_bytes_per_entry");
  return { layers, lora, rope, compressRatio, indexBytes };
}

function mlaEntryBytes(spec, bytesPerElement) {
  return Rat.from(spec.lora + spec.rope).mul(bytesPerElement).add(Rat.from(spec.indexBytes));
}

export function groupBytesPerToken(g, bytesPerElement) {
  const b = bytesPerElement;
  const kind = g?.kind;
  if (kind === "linear") return ZERO;
  if (kind === "mla") {
    const spec = mlaGroupSpec(g);
    return spec.layers.mul(mlaEntryBytes(spec, b)).div(Rat.from(spec.compressRatio));
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
 * Asymptotic bytes one retained token adds across cache-growing layers.
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

/** Tokens (or entries for compressed MLA) a given group retains at this context length. */
export function groupRetainedTokens(g, contextTokens) {
  if (g?.kind === "linear") return ZERO;
  if (g?.kind === "mla") {
    const spec = mlaGroupSpec(g);
    if (spec.compressRatio === 1n) return contextTokens;
    return Rat.from(ceilRat(contextTokens.div(Rat.from(spec.compressRatio))));
  }
  if (g?.kind === "sliding" && g.window_tokens !== undefined && g.window_tokens !== null) {
    return minRat(contextTokens, Rat.from(count(g.window_tokens, "group.window_tokens")));
  }
  return contextTokens;
}

/**
 * Exact KV bytes held by ONE layer group for one sequence at contextTokens.
 *
 * Uses discrete ceiling entry retention for compressed MLA (`ceil(ctx / compress_ratio)`)
 * and fixed `index_bytes_per_entry` alongside quantized payload elements.
 */
export function groupSequenceBytes(g, contextTokens, bytesPerElement) {
  const b = bytesPerElement instanceof Rat ? bytesPerElement : num(bytesPerElement, "kv bytes per element", { min: 0, allowZero: false });
  const ctx = contextTokens instanceof Rat ? contextTokens : num(contextTokens, "context tokens", { min: 0 });
  if (ctx.isZero()) {
    // Still validate group kind/fields even at zero context.
    groupBytesPerToken(g, b);
    return ZERO;
  }
  if (g?.kind === "linear") return ZERO;
  if (g?.kind === "mla") {
    const spec = mlaGroupSpec(g);
    const entries = Rat.from(ceilRat(ctx.div(Rat.from(spec.compressRatio))));
    return spec.layers.mul(mlaEntryBytes(spec, b)).mul(entries);
  }
  return groupBytesPerToken(g, b).mul(groupRetainedTokens(g, ctx));
}

/**
 * KV bytes held for ONE sequence at this context length.
 */
export function kvBytesPerSequence(groups, contextTokens, bytesPerElement) {
  const b = num(bytesPerElement, "kv bytes per element", { min: 0, allowZero: false });
  const ctx = num(contextTokens, "context tokens", { min: 0 });
  let total = ZERO;
  for (const g of groups ?? []) {
    total = total.add(groupSequenceBytes(g, ctx, b));
  }
  return total;
}

/**
 * Bytes in ONE layer group that are provably resident AND block-shareable across
 * concurrent sequences at peakContextTokens under PagedAttention.
 *
 * Rules:
 *   - Only complete aligned blocks of `pageBlockTokens` (K >= 1) inside `[0, min(peakCtx, sharedPrefix))`
 *     are credited. A partially filled trailing prefix block mixes user-specific tokens and cannot share.
 *   - For sliding-window layers (`window_tokens = W`), retention keeps ONLY the tail logical interval
 *     `[peakCtx - min(peakCtx, W), peakCtx)`. Only complete blocks inside the intersection of that
 *     retained tail and the shared prefix `[0, min(peakCtx, sharedPrefix))` are shareable.
 *   - For compressed MLA (`compress_ratio = r`), each entry spans `r` tokens and pages group `K`
 *     entries (`r * K` tokens per complete block).
 */
export function groupShareableBytes(g, peakContextTokens, sharedPrefixTokens, bytesPerElement, pageBlockTokens = 16n) {
  const b = bytesPerElement instanceof Rat ? bytesPerElement : num(bytesPerElement, "kv bytes per element", { min: 0, allowZero: false });
  const peakCtx = peakContextTokens instanceof Rat ? peakContextTokens : num(peakContextTokens, "peak context tokens", { min: 0 });
  const shared = sharedPrefixTokens instanceof Rat ? sharedPrefixTokens : num(sharedPrefixTokens, "shared prefix tokens", { min: 0 });
  const blockK = typeof pageBlockTokens === "bigint" ? pageBlockTokens : count(pageBlockTokens, "page block tokens");
  if (blockK < 1n) {
    throw new ServingRefusal("out_of_range", "page block tokens must be at least 1", { field: "page_block_tokens" });
  }
  if (peakCtx.isZero() || shared.isZero() || g?.kind === "linear") {
    if (g?.kind !== "linear") groupBytesPerToken(g, b);
    return ZERO;
  }

  const clampedShared = minRat(peakCtx, shared);
  const blockKRat = Rat.from(blockK);

  if (g?.kind === "mla") {
    const spec = mlaGroupSpec(g);
    const fullPrefixEntries = floorRat(clampedShared.div(Rat.from(spec.compressRatio)));
    const alignedEntries = (fullPrefixEntries / blockK) * blockK;
    if (alignedEntries <= 0n) return ZERO;
    return spec.layers.mul(mlaEntryBytes(spec, b)).mul(Rat.from(alignedEntries));
  }

  const perTok = groupBytesPerToken(g, b);
  if (g?.kind === "sliding" && g.window_tokens !== undefined && g.window_tokens !== null) {
    const win = Rat.from(count(g.window_tokens, "group.window_tokens"));
    const tailStart = maxRat(ZERO, peakCtx.sub(minRat(peakCtx, win)));
    // Only complete blocks lying wholly inside [tailStart, clampedShared) are guaranteed
    // resident and identical across sequences.
    const alignedStart = ceilRat(tailStart.div(blockKRat)) * blockK;
    const alignedEnd = floorRat(clampedShared.div(blockKRat)) * blockK;
    if (alignedEnd <= alignedStart) return ZERO;
    return perTok.mul(Rat.from(alignedEnd - alignedStart));
  }

  const alignedTokens = floorRat(clampedShared.div(blockKRat)) * blockK;
  if (alignedTokens <= 0n) return ZERO;
  return perTok.mul(Rat.from(alignedTokens));
}

export function kvShareableBytes(groups, peakContextTokens, sharedPrefixTokens, bytesPerElement, pageBlockTokens = 16) {
  const b = num(bytesPerElement, "kv bytes per element", { min: 0, allowZero: false });
  const peakCtx = num(peakContextTokens, "peak context tokens", { min: 0 });
  const shared = num(sharedPrefixTokens, "shared prefix tokens", { min: 0 });
  const blockK = count(pageBlockTokens, "page block tokens");
  if (blockK < 1n) {
    throw new ServingRefusal("out_of_range", "page block tokens must be at least 1", { field: "page_block_tokens" });
  }
  let total = ZERO;
  for (const g of groups ?? []) {
    total = total.add(groupShareableBytes(g, peakCtx, shared, b, blockK));
  }
  return total;
}

// ------------------------------------------------------------------- the weights
//
// Fail-closed residency: `params_b` is always the full checkpoint parameter count,
// and GPU VRAM must hold ALL of `params_b` unless an explicit, evidenced
// `hostTierProfile` proves host-DRAM placement for declared lookup tables
// (`gpu_backbone_params_b` + `host_offload_params_b` + `host_offload_kind`).

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
    resident: total.mul(BYTES_PER_GB).mul(bpp),
    read_per_step: active.mul(BYTES_PER_GB).mul(bpp),
    is_moe: active.lt(total),
  };
}

export function resolveModelResidency({ model, bytesPerParam, runtimeKey = null, hostTierProfile = null }) {
  const bpp = num(bytesPerParam, "bytes per parameter", { min: 0, allowZero: false });
  const full = weightBytes({
    paramsB: model?.params_b,
    activeParamsB: model?.active_params_b,
    bytesPerParam: bpp,
  });

  const hasSplit = model?.gpu_backbone_params_b !== undefined
    && model?.gpu_backbone_params_b !== null
    && model?.host_offload_params_b !== undefined
    && model?.host_offload_params_b !== null;

  if (!hasSplit || !hostTierProfile || hostTierProfile.allowHostTierOffload !== true) {
    return {
      ...full,
      checkpoint_resident: full.resident,
      host_offload_bytes: ZERO,
      host_offload_active: false,
      host_offload_reason: hasSplit ? "host_tier_profile_absent" : null,
    };
  }

  if (Array.isArray(hostTierProfile.supportedRuntimes) && !hostTierProfile.supportedRuntimes.includes(runtimeKey)) {
    return {
      ...full,
      checkpoint_resident: full.resident,
      host_offload_bytes: ZERO,
      host_offload_active: false,
      host_offload_reason: "runtime_does_not_support_host_offload",
    };
  }

  if (Array.isArray(hostTierProfile.supportedOffloadKinds) && !hostTierProfile.supportedOffloadKinds.includes(model.host_offload_kind)) {
    return {
      ...full,
      checkpoint_resident: full.resident,
      host_offload_bytes: ZERO,
      host_offload_active: false,
      host_offload_reason: "offload_kind_unsupported",
    };
  }

  const gpuBackboneB = num(model.gpu_backbone_params_b, "GPU backbone parameters (billions)", { min: 0, allowZero: false });
  const hostOffloadB = num(model.host_offload_params_b, "host offload parameters (billions)", { min: 0 });
  const hostOffloadBytes = hostOffloadB.mul(BYTES_PER_GB).mul(bpp);

  if (hostTierProfile.hostDramGb === undefined || hostTierProfile.hostDramGb === null || hostTierProfile.hostDramGb === "") {
    return {
      ...full,
      checkpoint_resident: full.resident,
      host_offload_bytes: ZERO,
      host_offload_active: false,
      host_offload_reason: "host_dram_unspecified",
    };
  }

  const hostDramBytes = num(hostTierProfile.hostDramGb, "host DRAM (GB)", { min: 0 }).mul(BYTES_PER_GB);
  if (hostDramBytes.lt(hostOffloadBytes)) {
    return {
      ...full,
      checkpoint_resident: full.resident,
      host_offload_bytes: ZERO,
      host_offload_active: false,
      host_offload_reason: "insufficient_host_dram",
    };
  }

  return {
    resident: gpuBackboneB.mul(BYTES_PER_GB).mul(bpp),
    checkpoint_resident: full.resident,
    read_per_step: full.read_per_step,
    is_moe: full.is_moe,
    host_offload_bytes: hostOffloadBytes,
    host_offload_active: true,
    host_offload_reason: null,
  };
}

// ------------------------------------------------------------------ the solve

/**
 * Solve the serving configuration for one model on one accelerator.
 */
export function servingPlan({
  model,
  contextTokens,
  peakContextTokens = null,
  sharedPrefixTokens = 0,
  supportsPrefixCache = false,
  pageBlockTokens = 16,
  runtimeKey = null,
  hostTierProfile = null,
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
  const peakCtxRaw = peakContextTokens === null || peakContextTokens === undefined || peakContextTokens === ""
    ? ctx
    : num(peakContextTokens, "peak context tokens", { min: 1 });
  const peakCtx = maxRat(ctx, peakCtxRaw);
  const sharedPrefix = sharedPrefixTokens === null || sharedPrefixTokens === undefined || sharedPrefixTokens === ""
    ? ZERO
    : num(sharedPrefixTokens, "shared prefix tokens", { min: 0 });

  const eff = num(runtimeEfficiency, "runtime efficiency", { min: 0, allowZero: false });
  const tpEff = num(tpEfficiency, "tensor-parallel efficiency", { min: 0, allowZero: false });
  const overhead = num(vramOverheadFraction, "VRAM overhead fraction", { min: 0 });
  if (overhead.ge(ONE)) {
    throw new ServingRefusal("out_of_range", "VRAM overhead fraction must be below 1 — at 1 there is no memory left for the model", { field: "vram_overhead_fraction" });
  }
  const vramPerGpu = num(vramGb, "GPU VRAM (GB)", { min: 0, allowZero: false }).mul(BYTES_PER_GB).mul(ONE.sub(overhead));
  const bwPerGpu = num(bandwidthGbS, "GPU memory bandwidth (GB/s)", { min: 0, allowZero: false }).mul(BYTES_PER_GB).mul(eff);

  const w = resolveModelResidency({ model, bytesPerParam, runtimeKey, hostTierProfile });
  const kvPerToken = kvBytesPerToken(model?.groups, kvBytesPerElement);
  const kvPerSeqActive = kvBytesPerSequence(model?.groups, ctx, kvBytesPerElement);
  const kvPerSeqPeak = peakCtx.eq(ctx) ? kvPerSeqActive : kvBytesPerSequence(model?.groups, peakCtx, kvBytesPerElement);

  // Flat byte overrides carry no layer/page structure and get zero sharing credit.
  // Runtimes without proven prefix-block sharing (e.g. llama.cpp or unknown) also get zero credit.
  const canSharePrefix = Boolean(supportsPrefixCache) && !model?.kv_override && sharedPrefix.gt(ZERO);
  const blockTokens = canSharePrefix ? count(pageBlockTokens ?? 16, "page block tokens") : 1n;
  if (canSharePrefix && blockTokens < 1n) {
    throw new ServingRefusal("out_of_range", "page block tokens must be at least 1", { field: "page_block_tokens" });
  }
  const kvShareablePeak = canSharePrefix
    ? kvShareableBytes(model?.groups, peakCtx, sharedPrefix, kvBytesPerElement, blockTokens)
    : ZERO;
  const kvUnsharedTail = maxRat(ZERO, kvPerSeqPeak.sub(kvShareablePeak));

  const floor = perStreamFloorTokS === null || perStreamFloorTokS === undefined || perStreamFloorTokS === ""
    ? null
    : num(perStreamFloorTokS, "per-stream tokens/s floor", { min: 0, allowZero: false });
  const capBatch = maxBatch === null || maxBatch === undefined || maxBatch === "" ? null : count(maxBatch, "max batch");

  const attempts = [];
  for (const tp of tpCandidates) {
    const n = count(tp, "tensor-parallel size");
    if (n < 1n) continue;
    const nR = Rat.from(n);
    const aggBw = nR.mul(bwPerGpu).mul(ratPow(tpEff, Number(n) - 1));
    const vramTotal = nR.mul(vramPerGpu);

    if (vramTotal.le(w.resident)) {
      attempts.push({ tp: Number(n), reason: "weights_exceed_vram", detail: `${formatHalfUp(w.resident.div(BYTES_PER_GB), 1)} GB of weights against ${formatHalfUp(vramTotal.div(BYTES_PER_GB), 1)} GB usable` });
      continue;
    }

    // Batch under the peak-turn memory ceiling:
    //   VRAM_kv(B) = B * kvPerSeqPeak - (B - 1) * kvShareablePeak
    //              = kvPerSeqPeak + (B - 1) * kvUnsharedTail  <= memRoom.
    // The single-sequence guard (memRoom >= kvPerSeqPeak) always holds first.
    const memRoom = vramTotal.sub(w.resident);
    let batchMem = null;
    if (!kvPerSeqPeak.isZero()) {
      if (memRoom.lt(kvPerSeqPeak)) {
        batchMem = 0n;
      } else if (kvUnsharedTail.isZero()) {
        batchMem = null;
      } else {
        batchMem = 1n + floorRat(memRoom.sub(kvPerSeqPeak).div(kvUnsharedTail));
      }
    }

    // Decode bandwidth stays charged per sequence at active context (no unverified HBM read sharing).
    let batchSpeed = null;
    if (floor !== null) {
      const byteBudget = aggBw.div(floor);
      if (byteBudget.le(w.read_per_step)) {
        attempts.push({ tp: Number(n), reason: "floor_unreachable", detail: `reading ${formatHalfUp(w.read_per_step.div(BYTES_PER_GB), 2)} GB of weights per step already costs more than ${formatHalfUp(floor, 1)} tok/s allows at this bandwidth` });
        continue;
      }
      batchSpeed = kvPerSeqActive.isZero() ? null : floorRat(byteBudget.sub(w.read_per_step).div(kvPerSeqActive));
    }

    let batch = null;
    for (const c of [batchMem, batchSpeed, capBatch]) {
      if (c === null) continue;
      batch = batch === null ? c : (c < batch ? c : batch);
    }
    if (batch === null) batch = 1n;

    if (batch < 1n) {
      const why = batchSpeed !== null && batchSpeed < 1n ? "floor_admits_no_batch" : "vram_admits_no_batch";
      attempts.push({
        tp: Number(n),
        reason: why,
        detail: why === "floor_admits_no_batch"
          ? `holding ${formatHalfUp(floor, 1)} tok/s per stream leaves room for no concurrent sequence at ${formatHalfUp(ctx, 0)} tokens of context`
          : `${formatHalfUp(kvPerSeqPeak.div(BYTES_PER_GB), 2)} GB of peak KV per sequence does not fit in the ${formatHalfUp(memRoom.div(BYTES_PER_GB), 1)} GB left after weights`,
      });
      continue;
    }

    const batchR = Rat.from(batch);
    const bytesPerStep = w.read_per_step.add(batchR.mul(kvPerSeqActive));
    const perStream = aggBw.div(bytesPerStep);
    const aggregate = perStream.mul(batchR);
    const perGpu = aggregate.div(nR);
    const kvBatchBytes = batchR.mul(kvPerSeqPeak).sub(Rat.from(batch - 1n).mul(kvShareablePeak));
    const vramUsed = w.resident.add(kvBatchBytes);

    const bound = batchSpeed !== null && batchSpeed === batch ? "per-stream speed floor"
      : capBatch !== null && capBatch === batch ? "runtime concurrency cap"
      : batchMem !== null && batchMem === batch ? "VRAM"
      : "unconstrained";

    return {
      ok: true,
      tensor_parallel: slot(Rat.from(n), "derived"),
      gpus_per_replica: Number(n),
      batch: slot(batchR, "derived"),
      batch_bound_by: bound,
      per_stream_tokens_s: slot(perStream, "assumed", 2),
      tokens_s_per_replica: slot(aggregate, "assumed", 2),
      tokens_s_per_gpu: slot(perGpu, "assumed", 2),
      kv_bytes_per_token: slot(kvPerToken, "derived"),
      kv_gb_per_sequence: slot(kvPerSeqActive.div(BYTES_PER_GB), "derived", 3),
      kv_gb_per_sequence_peak: slot(kvPerSeqPeak.div(BYTES_PER_GB), "derived", 3),
      kv_gb_shared_prefix: slot(kvShareablePeak.div(BYTES_PER_GB), "derived", 3),
      weights_gb_resident: slot(w.resident.div(BYTES_PER_GB), "derived", 2),
      weights_gb_read_per_step: slot(w.read_per_step.div(BYTES_PER_GB), "derived", 2),
      weights_gb_host_offload: slot(w.host_offload_bytes.div(BYTES_PER_GB), "derived", 2),
      host_offload_active: w.host_offload_active,
      is_moe: w.is_moe,
      vram_gb_used_per_gpu: slot(vramUsed.div(nR).div(BYTES_PER_GB), "derived", 2),
      vram_gb_usable_per_gpu: slot(vramPerGpu.div(BYTES_PER_GB), "derived", 2),
      context_tokens: slot(ctx, "input"),
      peak_context_tokens: slot(peakCtx, "input"),
      shared_prefix_tokens: slot(sharedPrefix, "input"),
      prefix_cache_applied: kvShareablePeak.gt(ZERO) && batch > 1n,
      assumed: true,
      rejected_smaller: attempts,
    };
  }

  throw new ServingRefusal(
    "no_viable_configuration",
    `this model does not serve on ${String(model?.label ?? "the selected accelerator")} at any tensor-parallel size up to ${tpCandidates[tpCandidates.length - 1]}: ${attempts.map((a) => `${a.tp}x — ${a.detail}`).join("; ")}`,
    { attempts },
  );
}

/**
 * The evidence-store view of a solved configuration (SPEC §6.3).
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
