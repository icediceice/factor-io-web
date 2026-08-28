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
import { Dec, Rat, ZERO, cmpMoney, minMoney } from "./exact.js";
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