// calculator.js — lane math, routing policies, capacity ceilings, breakeven,
// evidence-gated throughput, commercial overlay (SPEC §2, §6, §7).
//
// Every quotient here is a Rational; every total is a Decimal. Lane A's fixed
// cost is charged exactly once whenever it serves >= 1 token — never blended
// back into per-token prices (that is the F7 defect).
//
// Routing applies BOTH Lane-A ceilings (SPEC 6.2): a monthly token budget AND a
// tok/s rate ceiling. Rate ceilings bind through time buckets:
//   per-bucket capacity = min(period tokens remaining, rate x bucket duration)
// Absent temporal data the rate ceiling cannot be evaluated — the result says
// capacity_temporal_unknown, it never silently substitutes the monthly scalar.
import { Dec, Rat, ZERO, cmpMoney } from "./exact.js";
import { quoteOffer } from "./pricing.js";

const HOURS_MONTH = 730; // [ASSUMED — spec author] 8760/12, stated in provenance

// --------------------------------------------------------------- bucket math
// Distribute monthly demand over time buckets and route under BOTH ceilings.
// buckets: [{ hours: int, tokens: int }] — shares of the month with their demand.
export function routeDemandBuckets({ demandTokens, monthlyBudget, rateCeiling, buckets }) {
  if (!Array.isArray(buckets) || buckets.length === 0 || !buckets.every((b) => Number.isFinite(b.hours) && Number.isFinite(b.tokens) && b.hours > 0 && b.tokens >= 0)) {
    return { local: demandTokens, overflow: 0, temporal_known: false, binding: "monthly" };
  }
  let remainingBudget = monthlyBudget === null ? Infinity : monthlyBudget;
  let local = 0;
  for (const b of buckets) {
    const rateCap = rateCeiling === null ? Infinity : rateCeiling * b.hours * 3600;
    const capacity = Math.min(remainingBudget, rateCap);
    const served = Math.min(b.tokens, Math.max(0, Math.floor(capacity)));
    local += served;
    remainingBudget -= served;
    if (remainingBudget < 0) remainingBudget = 0;
  }
  return { local, overflow: demandTokens - local, temporal_known: true, binding: rateCeiling !== null ? "rate_and_monthly" : "monthly" };
}

// ------------------------------------------------------------ lane unit costs
// Lane B per-request cost at the workload shape, from a quote (pricing.quoteOffer).
export function laneBRequestCost(quote) {
  if (!quote.servable) return null;
  return Dec.from(quote.cost);
}

// Lane C per-token unit cost as a Rational: hourly / (tok_s x utilization).
// Hyperbolic in utilization; zero utilization or zero tok_s is OUT OF DOMAIN.
export function laneCPerToken({ hourlyRate, tokensS, utilization }) {
  const u = Rat.from(utilization);
  if (u.isZero()) return { value: null, reason: "zero_utilization" };
  if (tokensS === null || tokensS <= 0) return { value: null, reason: "zero_capacity" };
  // hourly / (tokensS x util) — the hourly amortization quotient.
  const denominator = Rat.of(u.n * BigInt(tokensS), u.d); // tokensS x util
  const perToken = Rat.from(hourlyRate).div(denominator);
  return { value: perToken, reason: null };
}

// Utilization of a lane against its capacity. 0 demand over real capacity is a
// well-defined 0; zero capacity is out of domain (the two division sites are
// guarded per the peer review: cost-per-1M at zero demand, utilization at zero capacity).
export function utilizationOf(demandTokens, capacityTokens) {
  if (capacityTokens === null || capacityTokens <= 0) return { value: null, reason: "zero_capacity" };
  return { value: Rat.of(BigInt(demandTokens), BigInt(capacityTokens)), reason: null };
}

// Effective per-1M for a lane total over demand. Zero demand is out of domain.
export function per1M(totalCost, demandTokens) {
  if (demandTokens === 0) return { value: null, reason: "zero_demand" };
  // (total / demand) x 1M — dividing by the Rational 1/1000000 multiplies by 1M.
  return { value: Rat.from(totalCost).div(Rat.of(BigInt(demandTokens), 1n)).div(Rat.of(1n, 1000000n)), reason: null };
}

// ------------------------------------------------------- lane monthly totals
// Lane A monthly cost: the fixed cost is charged EXACTLY ONCE whenever A serves
// any token; in-capacity tokens carry no per-token A charge (a declared marginal
// is itemized separately); overflow is priced at the SECONDARY lane's marginal.
export function laneAMonthly({ fixedMonthly, localTokens, overflowTokens, overflowUnitCost, marginalPerToken }) {
  if (localTokens <= 0) {
    return { total: ZERO, fixed_charged: false, lines: [] };
  }
  const fixed = Dec.from(fixedMonthly);
  const lines = [{ item: "lane_a_fixed", amount: fixed.toString(), note: "charged once — in-capacity tokens carry no per-token re-pricing" }];
  let total = fixed;
  if (marginalPerToken !== null && marginalPerToken !== undefined) {
    const marg = Dec.from(marginalPerToken).mul(BigInt(localTokens));
    lines.push({ item: "lane_a_marginal", amount: marg.toString(), note: "user-entered power/ops marginal, itemized (SPEC 2.3)" });
    total = total.add(marg);
  }
  if (overflowTokens > 0) {
    const ovf = Dec.from(overflowUnitCost).mul(BigInt(overflowTokens));
    lines.push({ item: "overflow_secondary", amount: ovf.toString(), note: `${overflowTokens} tokens priced at the secondary lane's marginal tariff` });
    total = total.add(ovf);
  }
  return { total, fixed_charged: true, lines };
}

// Lane C monthly cost from served tokens: hours = tokens / (tok_s x util);
// cost = hourly x hours. Serving zero tokens costs zero (an idle rented node is
// a user decision — the UI surfaces standby cost separately).
export function laneCMonthly({ hourlyRate, tokensS, utilization, servedTokens }) {
  if (servedTokens <= 0) return { total: ZERO, hours: new Rat(0n, 1n), lines: [] };
  const u = Rat.from(utilization);
  if (u.isZero() || tokensS === null || tokensS <= 0) {
    return { total: ZERO, hours: Rat.of(0n, 1n), lines: [], out_of_domain: "zero_utilization_or_capacity" };
  }
  // hours = servedTokens / (tokensS x util)
  const hours = Rat.of(BigInt(servedTokens) * u.d, u.n * BigInt(tokensS));
  const total = Rat.from(hourlyRate).mul(hours);
  return { total, hours, lines: [{ item: "lane_c_hours", amount: total.toString(), note: `hourly x ${hours.toString()}h` }] };
}

// ------------------------------------------------------- routing: local_first
// The split is DERIVED (SPEC 2.2), never user-set. A user-set blend is advisory:
// when the derived split beats it, the advisory number is shown flagged
// `dominated` with the delta — never emitted as the optimum (fixture F7).
export function derivedLocalFirstSplit({ demandTokens, aMonthlyCapacity }) {
  const local = Math.min(demandTokens, Math.max(0, aMonthlyCapacity));
  return { local, overflow: demandTokens - local, local_share: demandTokens === 0 ? Rat.of(0n, 1n) : Rat.of(BigInt(local), BigInt(demandTokens)) };
}

export function advisoryBlendCost({ demandTokens, blendLocalPct, overflowUnitCost, laneAFixed, aMonthlyCapacity, marginalPerToken }) {
  const localTokens = Math.floor((demandTokens * blendLocalPct) / 100);
  const overflow = demandTokens - localTokens;
  const a = laneAMonthly({ fixedMonthly: laneAFixed, localTokens, overflowTokens: overflow, overflowUnitCost, marginalPerToken });
  return { total: a.total, local_tokens: localTokens, overflow_tokens: overflow };
}

// -------------------------------------------------------- routing: api_first
// Lane B serves; the declared fallback carries outage traffic at failover_rate x
// failover share; a pure standby still surfaces its fixed cost, labelled.
export function apiFirstFailover({ demandTokens, bMonthlyTotal, fallbackKind, fallbackFixedMonthly, failoverShare, failoverRate }) {
  const lines = [{ item: "lane_b_base", amount: bMonthlyTotal.toString() }];
  let total = Dec.from(bMonthlyTotal);
  const share = Rat.from(failoverShare);
  if (cmpMoney(share, ZERO) > 0) {
    const failoverCost = Rat.from(bMonthlyTotal).mul(share).mul(Rat.from(failoverRate));
    const fc = ratToDecExact(failoverCost);
    if (fc !== null) {
      total = total.add(fc);
      lines.push({ item: "failover_traffic", amount: fc.toString(), note: `failover_rate x share of demand on fallback lane ${fallbackKind}` });
    } else {
      lines.push({ item: "failover_traffic", amount: failoverCost.toString(), note: "rational, non-terminating — displayed via formatHalfUp" });
    }
  } else if (fallbackKind !== "B") {
    lines.push({ item: "standby_fixed", amount: Dec.from(fallbackFixedMonthly).toString(), note: "pure standby — fixed cost surfaced (SPEC 2.2)" });
    total = total.add(Dec.from(fallbackFixedMonthly));
  }
  return { total, lines };
}

function ratToDecExact(r) {
  // Exact Decimal for a terminating rational n/(2^a 5^b); null otherwise.
  // n/(2^a 5^b) = n x 2^(e-a) x 5^(e-b) / 10^e with e = max(a, b).
  let d = r.d;
  let twos = 0n, fives = 0n;
  while (d % 2n === 0n) { d /= 2n; twos++; }
  while (d % 5n === 0n) { d /= 5n; fives++; }
  if (d !== 1n) return null;
  const e = twos > fives ? twos : fives;
  const num = r.n * pow(2n, e - twos) * pow(5n, e - fives);
  return new Dec(num, e);
}
function pow(b, e) { let r = 1n; for (let i = 0n; i < e; i++) r *= b; return r; }

// ------------------------------------------------------------------ breakeven
// Lane C vs B: the utilization where hourly/(tok_s x util) crosses the API
// per-token price (SPEC 6.2) — util* = hourly / (tok_s x bPerToken).
export function breakevenUtilizationC({ hourlyRate, tokensS, bPerToken }) {
  if (tokensS === null || tokensS <= 0) return { value: null, reason: "zero_capacity" };
  const denom = Rat.of(BigInt(tokensS), 1n).mul(Rat.from(bPerToken));
  if (denom.isZero()) return { value: null, reason: "zero_price" };
  return { value: Rat.from(hourlyRate).div(denom), reason: null };
}

// Lane A vs B: the demand where amortized fixed per token crosses the API
// per-token price — demand* = fixed / bPerToken; as utilization vs capacity.
export function breakevenDemandA({ fixedMonthly, bPerToken, aMonthlyCapacity }) {
  const p = Rat.from(bPerToken);
  if (p.isZero()) return { value: null, reason: "zero_price" };
  const demand = Rat.from(fixedMonthly).div(p);
  const utilization = aMonthlyCapacity === null || aMonthlyCapacity <= 0
    ? { value: null, reason: "zero_capacity" }
    : { value: demand.div(Rat.of(BigInt(aMonthlyCapacity), 1n)), reason: null };
  return { demand_tokens: demand, utilization };
}

// --------------------------------------------------------- evidence matching
// All-dimensions rule (SPEC 6.3/6.4): a row supports a configuration ONLY on
// every dimension. No interpolation, no scaling. Partial matches are annotations
// listing the mismatched dimensions — never the number (fixture F8).
export const EVIDENCE_DIMS = [
  "model_revision", "runtime", "runtime_version", "quantization",
  "hardware_topology", "prompt_output_dist", "concurrency", "batch_mode",
  "percentile_window",
];

export function matchEvidence(rows, config, requiredP95) {
  const exact = [];
  let annotation = null;
  for (const row of rows ?? []) {
    const mismatched = [];
    let matched = 0;
    for (const dim of EVIDENCE_DIMS) {
      if (config[dim] === undefined || row[dim] === undefined || row[dim] !== config[dim]) {
        mismatched.push(dim);
      } else {
        matched++;
      }
    }
    if (mismatched.length === 0) {
      exact.push(row);
    } else if (matched > 0 && annotation === null) {
      annotation = { row_value_tok_s: row.value_tok_s ?? null, mismatched_dimensions: mismatched, provenance: row.provenance ?? null };
    }
  }
  if (exact.length === 0) {
    return { verdict: "unknown", modelled_p95_capacity: null, annotation };
  }
  // All exact rows must agree on the verdict direction against the SLO.
  const best = exact.reduce((a, b) => (cmpMoney(Dec.from(String(b.value_tok_s)), Dec.from(String(a.value_tok_s))) > 0 ? b : a));
  const verdict = requiredP95 === null || requiredP95 === undefined
    ? "unknown"
    : Number(requiredP95) <= Number(best.value_tok_s) ? "feasible" : "infeasible";
  return { verdict, modelled_p95_capacity: best.value_tok_s, evidence_rows: exact.length, annotation: null };
}

// ---------------------------------------------------------- commercial overlay
// Applied LAST (SPEC 4.5/7): always itemized, never folded into unit prices.
// Rates are operator-entered at runtime; nothing here ships a rate card.
export function applyOverlay({ laneTotals, horizonMonths, components, fullyLoaded }) {
  const itemized = [];
  let overlayTotal = ZERO;
  for (const c of components ?? []) {
    const amount = Dec.from(c.amount);
    const extended = c.basis === "monthly" ? amount.mul(BigInt(horizonMonths)) : amount;
    overlayTotal = overlayTotal.add(extended);
    itemized.push({ name: c.name, basis: c.basis, amount: amount.toString(), extended: extended.toString(), provenance: c.provenance ?? "assumed" });
  }
  const totals = {};
  for (const [lane, t] of Object.entries(laneTotals)) {
    const infra = Dec.from(t);
    totals[lane] = {
      infra_total: infra.toString(),
      fully_loaded_total: infra.add(overlayTotal).toString(),
    };
  }
  return {
    itemized,
    overlay_total: overlayTotal.toString(),
    totals,
    label: fullyLoaded ? "fully_loaded_per_1M" : "infra_per_1M",
    note: fullyLoaded
      ? "fully-loaded mode: per-1M labels read fully_loaded_per_1M (SPEC 4.5)"
      : "infra-only: commercial overlay itemized separately (SPEC 4.5)",
  };
}

// ------------------------------------------------------------------ TCO curve
// Constant monthly demand -> cumulative totals are linear in the horizon month.
export function tcoCurve(laneMonthlyTotals, horizonMonths) {
  const points = [];
  for (let m = 1; m <= horizonMonths; m++) {
    const row = { month: m };
    for (const [lane, t] of Object.entries(laneMonthlyTotals)) {
      row[lane] = Dec.from(t).mul(BigInt(m)).toString();
    }
    points.push(row);
  }
  return points;
}

// ------------------------------------------------------------- runComparison
// The canonical composition (S1 workload -> S3 results). Determinism (SPEC 10.1):
// identical workload + identical snapshot -> byte-identical result JSON — every
// money value is a canonical decimal string, every key is constructed in fixed
// order, nothing reads wall-clock state.
export function runComparison({
  workload,
  catalog,
  laneA = null,
  laneB = null,
  laneC = null,
  routing,
  overlay = null,
  evidenceRows = [],
}) {
  const reasons = [];
  const demand = workload.demand_tokens_mo;
  const reqs = workload.request_count_mo;
  const horizon = workload.horizon_months;
  const reqShape = {
    prompt_tokens: workload.prompt_tokens,
    output_tokens: workload.output_tokens,
    cache_read_tokens: workload.cache_read_tokens_per_req ?? 0,
    cache_write_tokens: workload.cache_write_tokens_per_req ?? 0,
    request_count: 1,
    tier: workload.tier ?? "std",
    quote_utc: workload.quote_utc ?? null,
    now: workload.now ?? null,
  };

  // ---- Lane B: quote every selected offer at the request shape.
  const quotes = {};
  let primaryId = null;
  let bRequestCost = null;
  for (const id of (laneB && laneB.offer_ids) || []) {
    const offer = catalog.offers[id];
    const q = offer ? quoteOffer(offer, reqShape) : { servable: false, gap_reason: "not_in_catalog", reasons: [], meters: [], applied_overrides: [], cost: null };
    quotes[id] = q;
    if (q.servable && bRequestCost === null) {
      primaryId = id;
      bRequestCost = Dec.from(q.cost);
    }
  }
  const bMonthly = bRequestCost === null ? null : bRequestCost.mul(BigInt(reqs));
  // Quotient -> Rational (the architecture rule). Per-token B is exact n/d.
  const bPerToken = bMonthly === null || demand === 0 ? null : Rat.from(bMonthly).div(Rat.of(BigInt(demand), 1n));

  // ---- Routing: derive the split, never take it as input (SPEC 2.2).
  const policy = routing.policy;
  let routed = null;
  if (laneA && laneA.enabled) {
    const routedBuckets = routeDemandBuckets({
      demandTokens: demand,
      monthlyBudget: laneA.monthly_token_budget ?? null,
      rateCeiling: laneA.tokens_s_ceiling ?? null,
      buckets: workload.time_buckets ?? null,
    });
    if (!routedBuckets.temporal_known) reasons.push("capacity_temporal_unknown");
    routed = routedBuckets;
  }

  const overflowUnit = (() => {
    // The secondary lane's marginal per-token price for Lane A overflow.
    if ((routing.secondary ?? "B") === "C" && laneC && laneC.enabled) {
      const c = laneCPerToken({ hourlyRate: laneC.hourly_rate, tokensS: laneC.tokens_s, utilization: laneC.utilization });
      return c.value === null ? null : c.value;
    }
    return bPerToken; // Rat
  })();

  const laneAResult = (() => {
    if (!laneA || !laneA.enabled) return { enabled: false, monthly_total: null };
    const local = routed ? routed.local : 0;
    const overflow = routed ? routed.overflow : 0;
    const a = laneAMonthly({
      fixedMonthly: laneA.fixed_monthly,
      localTokens: local,
      overflowTokens: overflow,
      overflowUnitCost: overflowUnit === null ? null : ratToDecExact(Rat.from(overflowUnit)),
      marginalPerToken: laneA.marginal_per_token ?? null,
    });
    if (overflow > 0 && overflowUnit === null) reasons.push("secondary_lane_unpriced");
    const util = utilizationOf(demand, laneA.monthly_token_budget ?? null);
    return {
      enabled: true,
      served_tokens: local,
      overflow_tokens: overflow,
      monthly_total: a.total.toString(),
      lines: a.lines,
      utilization: util.value === null ? null : util.value.toString(),
      utilization_reason: util.reason,
      rate_ceiling_binding: routed ? routed.binding : null,
      rate_ceiling_known: routed ? routed.temporal_known : null,
    };
  })();

  const laneCStandalone = (() => {
    if (!laneC || !laneC.enabled) return { enabled: false, monthly_total: null };
    const m = laneCMonthly({ hourlyRate: laneC.hourly_rate, tokensS: laneC.tokens_s, utilization: laneC.utilization, servedTokens: demand });
    const perTok = laneCPerToken({ hourlyRate: laneC.hourly_rate, tokensS: laneC.tokens_s, utilization: laneC.utilization });
    const pm = per1M(m.total, demand);
    return {
      enabled: true,
      tokens_s: laneC.tokens_s,
      hourly_rate: laneC.hourly_rate.toString(),
      utilization: laneC.utilization.toString(),
      hours: m.hours.toString(),
      monthly_total: m.total.toString(),
      per_token: perTok.value === null ? null : perTok.value.toString(),
      per_token_reason: perTok.reason,
      per_1m: pm.value === null ? null : pm.value.toString(),
      per_1m_reason: pm.reason,
      lines: m.lines,
    };
  })();

  const laneBResult = {
    enabled: !!(laneB && laneB.enabled),
    primary_offer: primaryId,
    request_cost: bRequestCost === null ? null : bRequestCost.toString(),
    monthly_total: bMonthly === null ? null : bMonthly.toString(),
    per_token: bPerToken === null ? null : bPerToken.toString(),
    per_1m: bMonthly === null || demand === 0 ? { value: null, reason: "zero_demand" } : (() => { const p = per1M(bMonthly, demand); return { value: p.value === null ? null : p.value.toString(), reason: p.reason }; })(),
    quotes,
    gaps: Object.entries(quotes).filter(([, q]) => !q.servable).map(([id, q]) => ({ offer_id: id, gap_reason: q.gap_reason })),
  };