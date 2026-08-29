// demand.js — the v0.2 demand model (SPEC §2.4, §6.2).
//
// v0.1 asked the buyer for `demand_tokens_mo` directly. That is the one number a
// buyer cannot supply, so v0.2 DERIVES it from people and behaviour:
//
//   sessions_mo   = users × sessions_per_user_day × working_days_mo
//   turns_mo(w)   = sessions_mo × mix_share(w) × turns_per_session(w)
//   tokens_mo     = Σ_w turns_mo(w) × (in(w) + out(w) + cached(w))
//
// and sizes against the PEAK SECOND rather than the month, because a monthly total
// cannot tell you whether serving feels slow — the same 1.2B tokens/month is
// comfortable spread evenly and unservable at a 9am peak (SPEC §6.2).
//
// WHY Rat AND NOT number, specifically here: the spec makes a mix that does not sum
// to 1 a REFUSAL rather than a silent renormalization. In IEEE-754 the perfectly
// valid mix 0.4 + 0.4 + 0.1 + 0.1 sums to 0.9999999999999999, so a float
// implementation would reject mixes the user entered correctly — and, worse, accept
// others only by luck of representation. Exact rationals make "sums to 1" mean what
// it says. Quantities are parsed from the DECIMAL STRING the user typed, never from
// a binary float, so the arithmetic operates on the number they meant.

import { Dec, Rat, formatHalfUp } from "./exact.js";

// A refusal is a user-facing input problem, distinct from a programmer error. It
// carries a machine-readable `code` so the UI can render a specific message instead
// of a stack trace, and so tests can assert the reason rather than the wording.
export class DemandRefusal extends RangeError {
  constructor(code, message, detail) {
    super(message);
    this.name = "DemandRefusal";
    this.code = code;
    this.detail = detail;
  }
}

export const WORKLOAD_TYPES = ["chat", "rag", "graph_rag", "agentic"];

export const WORKLOAD_LABELS = {
  chat: "Chat",
  rag: "RAG",
  graph_rag: "Graph RAG",
  agentic: "Agentic",
};

const ONE = Rat.from(1n);
const ZERO = Rat.from(0n);

// Per-GPU decode throughput, tokens/second, at an ~8B-class model with batching.
//
// [ASSUMED] — every value here is a planning placeholder, NOT a benchmark. It is
// keyed by the same gpu ids the pricing registry emits (scripts/build-gpu-pricing.mjs
// `GPU`), and per SPEC §6.5 it must carry the assumed tag at every point of use and
// must never back a modelled_p95_capacity verdict. Real throughput moves with model
// size, quantisation, batch size, context length and serving stack — often by more
// than an order of magnitude — so this table sets the SHAPE of the answer, and the
// user is expected to override it with their own measurement.
//
// a10 and a10g are deliberately separate: A10G is the AWS G5-exclusive 300W variant,
// A10 the 150W PCIe part Azure and Alibaba sell. Same 24GB, different throughput.
export const TOKENS_S_PER_GPU_ASSUMED = {
  b200: "4500",
  h200: "3000",
  h100: "2500",
  a100_80: "1400",
  a800: "1200",
  a100_40: "1100",
  h20: "900",
  l40s: "800",
  a10g: "300",
  a10: "280",
  l4: "250",
};

// ------------------------------------------------------------------ value slots
// Every derived quantity is overridable, and an override is RETAINED and labelled
// rather than silently recomputed from the inputs that produced it (SPEC §2.4).
// The basis travels with the value so the UI can mark it at the point of use.

function slot(rat, basis, places = 0) {
  return { rat, basis, text: formatHalfUp(rat, places), places };
}

// Parse a quantity the user supplied. Money never comes through here (SPEC §3.5
// keeps money on Dec/Rat entry points that reject numbers outright); these are
// counts and rates, which the spec does allow to arrive as numbers. A JS number is
// converted via its decimal STRING so 0.1 means one tenth, not its binary neighbour.
function q(v, label, { min = null, integer = false } = {}) {
  if (v === null || v === undefined || v === "") {
    throw new DemandRefusal("missing_input", `${label} is required`, { field: label });
  }
  let r;
  if (typeof v === "bigint") r = Rat.from(v);
  else if (v instanceof Rat) r = v;
  else if (v instanceof Dec) r = Rat.from(v);
  else if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new DemandRefusal("not_a_number", `${label} must be a finite number`, { field: label, got: String(v) });
    r = Rat.from(Dec.from(String(v)));
  } else {
    const t = String(v).trim();
    try {
      r = Rat.from(Dec.from(t));
    } catch {
      throw new DemandRefusal("not_a_number", `${label} must be a number, got ${JSON.stringify(t)}`, { field: label, got: t });
    }
  }
  if (min !== null && r.lt(Rat.from(BigInt(min)))) {
    throw new DemandRefusal("out_of_range", `${label} must be at least ${min}`, { field: label, got: formatHalfUp(r, 4) });
  }
  if (integer && r.d !== 1n) {
    throw new DemandRefusal("not_an_integer", `${label} must be a whole number`, { field: label, got: formatHalfUp(r, 4) });
  }
  return r;
}

// Resolve derived-vs-override once, in one place, so no call site can forget the tag.
function resolve(derivedRat, overrideValue, label, places = 0) {
  if (overrideValue === null || overrideValue === undefined || overrideValue === "") {
    return slot(derivedRat, "derived", places);
  }
  return slot(q(overrideValue, label, { min: 0 }), "user_override", places);
}

// ---------------------------------------------------------------------- the mix

// A mix that does not sum to exactly 1 is refused, never renormalized: a
// mis-entered share would otherwise change the answer invisibly (SPEC §2.4).
export function validateMix(mix) {
  const shares = {};
  let sum = ZERO;
  const unknown = Object.keys(mix ?? {}).filter((k) => !WORKLOAD_TYPES.includes(k));
  if (unknown.length) {
    return { ok: false, code: "unknown_workload", detail: { unknown }, sum_text: null };
  }
  for (const w of WORKLOAD_TYPES) {
    const raw = mix?.[w];
    const r = raw === undefined || raw === null || raw === "" ? ZERO : q(raw, `mix.${w}`, { min: 0 });
    shares[w] = r;
    sum = sum.add(r);
  }
  if (!sum.eq(ONE)) {
    return {
      ok: false,
      code: "mix_does_not_sum_to_one",
      detail: { sum: formatHalfUp(sum, 6), shares: Object.fromEntries(WORKLOAD_TYPES.map((w) => [w, formatHalfUp(shares[w], 6)])) },
      sum_text: formatHalfUp(sum, 6),
    };
  }
  return { ok: true, shares, sum_text: "1.000000" };
}

// ------------------------------------------------------------------ monthly demand

/**
 * Derive monthly demand from people and behaviour.
 *
 * @param {object}  a
 * @param {number|string} a.users                  headcount actually using the system
 * @param {number|string} a.sessionsPerUserDay     sessions one user starts per working day
 * @param {number|string} a.workingDaysMo          working days in a month
 * @param {object}  a.mix                          share per workload type; MUST sum to exactly 1
 * @param {object}  a.shapes                       per-workload token shape, see below
 * @param {object} [a.overrides]                   {sessions_mo, turns_mo, tokens_mo} — retained, not recomputed
 *
 * shapes[w] = { turns_per_session, in_tokens, out_tokens, cached_tokens }
 * A workload with a zero share is skipped entirely, so its shape may be absent.
 */
export function buildDemand({ users, sessionsPerUserDay, workingDaysMo, mix, shapes, overrides = {} }) {
  const usersR = q(users, "users", { min: 1, integer: true });
  const spud = q(sessionsPerUserDay, "sessions per user per day", { min: 0 });
  const days = q(workingDaysMo, "working days per month", { min: 0 });

  const m = validateMix(mix);
  if (!m.ok) {
    throw new DemandRefusal(
      m.code,
      m.code === "mix_does_not_sum_to_one"
        ? `workload mix must sum to exactly 1, got ${m.sum_text} — shares are not renormalized, because a mis-entered share would change the answer invisibly`
        : `unknown workload type(s): ${m.detail.unknown.join(", ")}`,
      m.detail,
    );
  }

  const sessionsDerived = usersR.mul(spud).mul(days);
  const sessions = resolve(sessionsDerived, overrides.sessions_mo, "sessions per month");

  const workloads = [];
  let turnsTotal = ZERO;
  let inTotal = ZERO;
  let outTotal = ZERO;
  let cachedTotal = ZERO;

  for (const w of WORKLOAD_TYPES) {
    const share = m.shares[w];
    if (share.isZero()) continue;

    const shape = shapes?.[w];
    if (!shape) {
      throw new DemandRefusal("missing_shape", `workload "${w}" has a ${formatHalfUp(share, 4)} share but no token shape`, { workload: w });
    }

    const tps = q(shape.turns_per_session, `${w}.turns_per_session`, { min: 0 });
    const inTok = q(shape.in_tokens, `${w}.in_tokens`, { min: 0 });
    const outTok = q(shape.out_tokens, `${w}.out_tokens`, { min: 0 });
    // Cached input is optional: absent means none, which is different from zero
    // being wrong. It is tracked separately because it is tariffed separately.
    const cachedTok = shape.cached_tokens === undefined || shape.cached_tokens === null || shape.cached_tokens === ""
      ? ZERO
      : q(shape.cached_tokens, `${w}.cached_tokens`, { min: 0 });

    const turnsDerived = sessions.rat.mul(share).mul(tps);
    const turns = resolve(turnsDerived, overrides.turns_mo?.[w], `${w} turns per month`);

    const inMo = turns.rat.mul(inTok);
    const outMo = turns.rat.mul(outTok);
    const cachedMo = turns.rat.mul(cachedTok);

    turnsTotal = turnsTotal.add(turns.rat);
    inTotal = inTotal.add(inMo);
    outTotal = outTotal.add(outMo);
    cachedTotal = cachedTotal.add(cachedMo);

    workloads.push({
      type: w,
      label: WORKLOAD_LABELS[w],
      share: slot(share, "input", 4),
      turns_per_session: slot(tps, "input", 2),
      turns_mo: turns,
      in_tokens_mo: slot(inMo, turns.basis),
      out_tokens_mo: slot(outMo, turns.basis),
      cached_tokens_mo: slot(cachedMo, turns.basis),
      tokens_mo: slot(inMo.add(outMo).add(cachedMo), turns.basis),
    });
  }

  const tokensDerived = inTotal.add(outTotal).add(cachedTotal);
  const tokens = resolve(tokensDerived, overrides.tokens_mo, "tokens per month");

  return {
    users: slot(usersR, "input"),
    sessions_mo: sessions,
    turns_mo: slot(turnsTotal, "derived"),
    in_tokens_mo: slot(inTotal, "derived"),
    out_tokens_mo: slot(outTotal, "derived"),
    cached_tokens_mo: slot(cachedTotal, "derived"),
    tokens_mo: tokens,
    workloads,
  };
}

// -------------------------------------------------------------- the peak second

/**
 * Peak aggregate token rate, and the per-stream floor it must not violate.
 *
 * peak_tokens_s   = concurrent_sessions_peak × tokens_s_per_stream
 * concurrent_peak = users × peak_concurrency_fraction
 *
 * `tokens_s_per_stream` is the OUTPUT RATE ONE USER SEES. Below roughly 20 tok/s an
 * interactive answer reads as slow, so it is an input with a stated default rather
 * than something derived from the monthly total — which is exactly the quantity a
 * monthly average cannot express (SPEC §6.2).
 */
export function peakTokensPerSecond({ users, peakConcurrencyFraction, tokensPerSecondPerStream, overrides = {} }) {
  const usersR = q(users, "users", { min: 1, integer: true });
  const frac = q(peakConcurrencyFraction, "peak concurrency fraction", { min: 0 });
  if (frac.gt(ONE)) {
    throw new DemandRefusal("out_of_range", `peak concurrency fraction must be between 0 and 1, got ${formatHalfUp(frac, 4)}`, { field: "peak_concurrency_fraction" });
  }
  const perStream = q(tokensPerSecondPerStream, "tokens/s per stream", { min: 0 });

  const concurrentDerived = usersR.mul(frac);
  const concurrent = resolve(concurrentDerived, overrides.concurrent_peak, "peak concurrent sessions", 2);
  const peak = resolve(concurrent.rat.mul(perStream), overrides.peak_tokens_s, "peak tokens/s", 2);

  // Advisory only — the number stands either way. A floor is a UX judgement about
  // perceived speed, not a fact about the deployment, so it is reported, not enforced.
  const INTERACTIVE_FLOOR = Rat.from(20n);

  return {
    concurrent_peak: concurrent,
    tokens_s_per_stream: slot(perStream, "input", 2),
    peak_tokens_s: peak,
    below_interactive_floor: perStream.lt(INTERACTIVE_FLOOR),
    interactive_floor_tokens_s: slot(INTERACTIVE_FLOOR, "assumed"),
  };
}

// ------------------------------------------------------------------ GPU sizing

function ceilRat(r) {
  // r.d is positive by Rat's construction invariant.
  if (r.n <= 0n) return 0n;
  return (r.n + r.d - 1n) / r.d;
}

/**
 * GPUs needed to hold the peak second: ceil(peak_tokens_s / tokens_s_per_gpu).
 *
 * Sizing must satisfy the PEAK, not merely the monthly total: an option whose
 * aggregate throughput clears tokens_mo but misses peak_tokens_s is under-provisioned
 * at peak, and reporting it as sufficient is the failure this function exists to
 * prevent (SPEC §6.2).
 *
 * `tokensPerSecondPerGpu` is [ASSUMED] and editable. When it is omitted it is looked
 * up from TOKENS_S_PER_GPU_ASSUMED by gpu id, and an unknown id is a LOUD FAILURE
 * rather than a silent default — a defaulted throughput would quietly mis-size every
 * deployment on that accelerator, and a provider would vanish from the comparison
 * with no indication that anything was missing.
 */
export function gpusForLoad({ peakTokensPerSecond: peak, gpuId, tokensPerSecondPerGpu }) {
  const peakR = q(peak, "peak tokens/s", { min: 0 });

  let perGpu;
  let basis;
  if (tokensPerSecondPerGpu !== undefined && tokensPerSecondPerGpu !== null && tokensPerSecondPerGpu !== "") {
    perGpu = q(tokensPerSecondPerGpu, "tokens/s per GPU", { min: 0 });
    basis = "user_override";
  } else {
    if (!gpuId) {
      throw new DemandRefusal("missing_input", "gpusForLoad needs either a gpuId or an explicit tokens/s per GPU", { field: "gpuId" });
    }
    const table = TOKENS_S_PER_GPU_ASSUMED[gpuId];
    if (table === undefined) {
      throw new DemandRefusal(
        "unknown_gpu",
        `no throughput assumption for gpu id "${gpuId}" — add it to TOKENS_S_PER_GPU_ASSUMED rather than defaulting, or this accelerator silently mis-sizes`,
        { gpu_id: gpuId, known: Object.keys(TOKENS_S_PER_GPU_ASSUMED) },
      );
    }
    perGpu = q(table, `tokens/s per GPU (${gpuId})`, { min: 0 });
    basis = "assumed";
  }

  if (perGpu.isZero()) {
    throw new DemandRefusal("zero_throughput", "tokens/s per GPU must be greater than zero", { field: "tokens_s_per_gpu" });
  }

  const exact = peakR.div(perGpu);
  const count = ceilRat(exact);
  const capacity = Rat.from(count).mul(perGpu);

  return {
    gpus_required: slot(Rat.from(count), basis === "assumed" ? "assumed" : "derived"),
    gpus_exact: slot(exact, basis === "assumed" ? "assumed" : "derived", 3),
    tokens_s_per_gpu: slot(perGpu, basis, 2),
    capacity_tokens_s: slot(capacity, basis === "assumed" ? "assumed" : "derived", 2),
    // Spare headroom at the sized count. Negative is impossible by construction
    // (ceil never under-provisions), so a zero here means an exact fit, not a miss.
    headroom_tokens_s: slot(capacity.sub(peakR), basis === "assumed" ? "assumed" : "derived", 2),
    assumed: basis === "assumed",
  };
}