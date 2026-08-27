# SPEC — AI Inference TCO Calculator

| | |
|---|---|
| Status | Normative draft for implementation |
| Spec revision | v0.1 — 2026-08-27 |
| Plan thread | 1542478190939996174 (factor-io-web) |
| Delivery | Static client-side calculator on GitHub Pages + GitHub Actions pricing ingestion |

**Provenance discipline.** Every upstream claim in this document carries one of:
`[VERIFIED]` — checked at the named source during plan grounding; `[MEASURED]` —
benchmark evidence with a citation of its full conditions; `[ASSUMED]` — unverified
input that names its owner and a re-verification date. Numbers without such a tag
are a spec defect. Section 12.4 encodes this discipline as acceptance fixtures
F1–F10, which are normative test cases the implementation must pass.

---

## 1. Purpose, personas, scope

### 1.1 Purpose

A decision-support calculator that answers, for a stated inference workload:

1. What does each deployment lane cost over a stated horizon (TCO curve)?
2. What is the effective cost per 1M tokens in each lane at this workload?
3. At what utilization do owned/rented compute lanes break even against the API lane?
4. Is the required p95 throughput (a user SLO) feasible in each lane, and on what
   evidence does that answer rest?
5. How sensitive are all of the above to the inputs (demand, prices, utilization)?

It is a forward-looking comparison model. It is **not** a billing reconciliation
tool, a benchmark harness, a procurement system, or a cluster orchestrator.

### 1.2 Personas

| Persona | Needs | Primary surfaces |
|---|---|---|
| Founder/CTO choosing a serving strategy | Lane comparison, breakeven, sensitivity, honest feasibility | Screens S1–S4 (§8) |
| Consultant pricing a client engagement | Commercial overlay (licensing, consulting, implementation) itemized on top of lane math | §7 overlay toggle, quote export |
| FinOps/finance reviewer | Provenance of every number; decimal-exact arithmetic; audit of feed freshness | Provenance popovers, SourceStatus panel (§5) |

### 1.3 Scope

**In scope:** the pricing/offer data model (§3), quote semantics (§4), feed registry
and freshness protocol (§5), throughput evidence semantics (§6), commercial overlay
(§7), client UX and payload contracts (§8–§9), acceptance fixtures (§12.4).

**Out of scope (consumed or deferred):** benchmark collection (the calculator
*consumes* evidence rows, it does not produce them — §6), invoice ingestion,
purchase execution, cluster scheduling, multi-currency conversion (USD only in v0.1).

### 1.4 Output contract (summary)

Every comparison run emits: TCO curve over the horizon; cost per 1M tokens per lane;
breakeven utilization; **p95 throughput feasibility** (user SLO `required_p95_tok_s`
vs `modelled_p95_capacity` per §6 — the calculator never prints the word
"guarantee" for a modelled number); and a sensitivity table over declared input
ranges.

---

## 2. Comparison lanes and routing policies

### 2.1 Three lanes — there is no fourth "hybrid" lane

| Lane | Cost shape | Capacity | Priced from |
|---|---|---|---|
| **A — Owned local stack** | Fixed monthly (amortized hardware/lease + power + ops); marginal cost ≈ 0 up to capacity | Hard ceiling: tokens/s and tokens/month | User-entered capex/lease |
| **B — Cloud model API** | Pure usage-based per-meter tariffs (§3); no capex | Rate-limited, effectively unbounded | OpenRouter, LiteLLM cost map, provider catalogs (§5) |
| **C — Rented cloud GPU node** | Hourly instance tariffs × utilization | Per node topology; user-declared topology | AWS/Azure/GCP price lists (§5) |

Hybrid deployments exist, but **hybrid is a routing policy across A/B/C, not a cost
lane.** A fourth hybrid lane duplicates an engine path that already composes lanes,
and can only produce misleading numbers — see fixture F7 (§12.4): a user-set 70/30
local/API blend over 100M tokens/mo local capacity against 80M demand emits $10,240
where local-first serves all 80M for $10,000. Routing percentages are derived
quantities, not exogenous inputs.

The commercial layer (enterprise licensing, AI consulting, implementation — §7) is
an **overlay** applied after lane math, itemized, never folded into unit prices.

### 2.2 Routing policies

Exactly three policies are modelled. Every multi-lane run declares one.

**`local_first`.** Serve `min(demand, local_capacity)` on Lane A; overflow routes to
the declared secondary lane (B or C). The split is **derived**, never user-set:

```
local_share = min(demand_tokens, local_capacity_tokens) / demand_tokens
```

A user-set blend percentage is accepted only as an *advisory* input. When the
derived split dominates the advisory blend (as in F7), the calculator computes the
derived split, shows the advisory number, and flags it `dominated` with the delta —
it never emits the dominated blend as the optimum.

**`api_first` + failover.** Serve from Lane B; a declared fallback lane (A or C)
carries outage traffic. Fallback cost is charged at `failover_rate × assumed
failover share`; a pure-standby fallback (share = 0) still surfaces the standby's
fixed cost if it is Lane A or C, labelled `standby_fixed`.

**`fixed_split`.** An explicit user-pinned split (contractual, regulatory, or
residency reasons). The calculator computes exactly the pinned split and — as a
non-substituting comparison annotation — also prints the `local_first` derived split
and its total, labelled `derived_optimum_note`. The pinned split is never silently
replaced.

### 2.3 Capacity-constrained math — owned fixed cost is never double-charged

Lane A's fixed cost is incurred **once** whenever Lane A is in service, independent
of how many tokens (up to capacity) traverse it. Engine rules:

1. If Lane A serves ≥ 1 token in a period, its full fixed cost for that period is
   charged exactly once.
2. Tokens served within capacity add no per-token Lane-A charge (a user-entered
   power/ops marginal may be added, itemized separately).
3. Overflow tokens are priced only at the secondary lane's marginal tariffs.
4. No run may simultaneously charge the full fixed cost **and** a per-token blend
   that implicitly re-prices in-capacity tokens — that is the F7 defect.

**Worked anchor (fixture F7):** Lane A capacity 100M tok/mo at $10,000/mo fixed;
demand 80M tok/mo. `local_first` serves 80M locally → total **$10,000**. Advisory
blend 70/30 (local/API) → $10,000 + 24M × $0.01/1M overflow = **$10,240** — flagged
`dominated`, never emitted as the recommendation.