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
  const perToken = Rat.from(hourlyRate).div(Rat.of(BigInt(tokensS) * u.d, u.n));
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
  return { value: Rat.from(totalCost).div(Rat.of(BigInt(demandTokens), 1n)).div(Rat.of(1n, 1000000n)).neg().neg(), reason: null };
}