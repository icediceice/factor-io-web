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

---

## 3. OfferContract — the tariff data model

### 3.1 Design rule: no scalar normalization

A single "cost per 1M tokens" scalar cannot represent the verified upstream pricing
shapes, so the engine never collapses offers into one. Two shapes ground the design:

**OpenRouter model entry** `[VERIFIED: openrouter.ai/docs/guides/overview/models]` —
the `pricing` object carries string-valued meters `prompt`, `completion`, `request`
(fixed per-request fee), `image`, `web_search`, `internal_reasoning`,
`input_cache_read`, `input_cache_write`, plus an optional `overrides: PricingOverride[]`
array of conditional pricing overrides.

**LiteLLM model cost map** `[VERIFIED: docs.litellm.ai custom_pricing +
custom_model_cost_map + add_model_pricing]` — per-model entries carry
`input_cost_per_token` / `output_cost_per_token`, character meters
(`input_cost_per_character`, `output_cost_per_character`), threshold-suffixed
variants (pattern `_above_<N>k_tokens`, e.g. `_above_200k_tokens`; observed set spans
~30 suffixes including `_above_128k/200k/256k/272k/512k_tokens`), service-tier
suffixed variants (`_flex`, `_priority`, `_batches`), cache meters
(`cache_read_input_token_cost`, `cache_creation_input_token_cost`, including
`above_1hr` and `above_200k` variants), regional uplift multipliers
(`regional_endpoint_uplift_multiplier`, `regional_processing_uplift_multiplier_eu`,
`regional_processing_uplift_multiplier_us`), a `tiered_pricing[]` range array, and
non-token meters (`per_image`, `per_pixel`, `per_second` — audio and video, the
latter with interval thresholds — `per_query`, `per_page`, `per_session`, `dbu`).

**Normative consequence:** ingestion is FIELD-GRAMMAR driven, not an enumerated
hardcoded list — the parser recognizes the suffix/meter grammar and carries any
well-formed field, because both feeds grow fields routinely. Unknown fields follow
the per-feed lenient rules in §4.5.

### 3.2 The tariff union (finite)

Every admitted offer resolves to exactly one member of:

| Member | Unit basis | Covers |
|---|---|---|
| `TokenTariff` | per-token, per-request, per-operation meters | Chat/completion models incl. cache, reasoning, threshold, tier and uplift modifiers |
| `CharacterTariff` | per-character in/out | Character-priced models (TTS/OCR-class, per LiteLLM character meters) |
| `HourlyTariff` | per-hour × topology | Lane C GPU instances; provisioned/rented endpoints |

An offer that resolves to none of the three is `quarantined` with the reason string
preserved in snapshot provenance — never silently dropped, never coerced.

Meters inside a `TokenTariff` keep their full key structure
(`meter × threshold × service_tier × region_uplift`); threshold selection and tier
selection happen at quote time per §4.3.

### 3.3 Offer identity

```
offer_id = (seller, channel, product, region, purchase_term)
```

Where a feed provides a canonical key it MUST be used as the identity carrier:
OpenRouter's model id/canonical slug — **never the display name** (display names
collide across providers and change at will; fixture F9). Cloud SKUs synthesize
identity as `provider:serviceCode:sku:region:term`. Renaming an offer's display name
must never fork or merge identities.

### 3.4 Offer state machine

```
active ──(absent in 1 refresh)──▶ suspect_missing
suspect_missing ──(reappears)──▶ active
suspect_missing ──(absent N_CONSECUTIVE refreshes, default 3)──▶ retired
{any} ──(quarantine rule §4.5 fires)──▶ quarantined
quarantined ──(explicit re-admission after review)──▶ active
```

`suspect_missing` offers remain servable but every quote citing one is flagged
`price_stale_risk`. Every transition is recorded in snapshot provenance with the
observed refresh id and timestamp.

### 3.5 Decimal-string arithmetic

All money quantities — unit prices, multipliers, uplifts, discount rates, totals —
travel as decimal strings and are computed in exact decimal arithmetic; IEEE-754
float is prohibited on any money path. Display rounding is explicit (half-up at
declared precision, default 2 for totals, 8 for per-token unit prices). Fixture F10
pins the exactness contract. The meter grammar, not a scalar, is the contract.

---

## 4. QuoteSemantics

### 4.1 Tokenizer-independent workload definition

User demand is expressed in tokenizer-independent workload units, then converted per
model:

```
workload = {
  input_units, output_units,          // quantities
  unit_basis,                         // reference_tokens | characters
  reference_tokenizer,                // declared when unit_basis = reference_tokens
  request_count,
  shape: { prompt_len_dist, output_len_dist, cache_read_share,
           image_share, search_share, ... }
}
```

For each quoted model, a conversion factor table `conv[model.family]` maps workload
units to that model's billing units. Any quote that passes through a conversion MUST
display the factor and its provenance. A model with no known conversion factor is
quoted `no_conversion` — the engine never assumes 1:1.

### 4.2 Exact vs estimated cost-per-1M eligibility

A cost-per-1M figure is labelled `exact` only when ALL of:

1. every consumed meter has direct tariff coverage (no invented meter),
2. workload units equal the model's billing units (no conversion applied),
3. every predicate/override affecting the quote resolved cleanly (§4.3),
4. the cited offer is `active` and inside its freshness envelope (§5).

Otherwise the figure is `estimated` and carries a non-empty reason list drawn from:
`converted_units`, `extrapolated_shape`, `price_stale_risk`, `standby_share_assumed`,
`mixed_basis`. Cross-lane ratios mixing exact and estimated inputs are flagged
`mixed_basis`.

### 4.3 Evaluation at the REQUEST instant, not the fetch instant

Predicates and overrides resolve against the attributes of the request being quoted,
against tariffs as fetched:

- Threshold variants (`_above_<N>k_tokens`) resolve on the request's prompt length.
- Cache meters resolve on the request's cache read/write usage.
- Service-tier variants (`_flex`/`_priority`/`_batches`) resolve on the requested tier.
- Regional uplifts resolve on the requested region.
- OpenRouter `pricing.overrides[]`: entries whose conditions match the request
  replace the corresponding top-level meters for this quote; multiple matches on one
  meter resolve last-in-array-wins with the applied override list recorded.

Top-level OpenRouter keys are always valid under default conditions; they are the
fallback whenever no override matches. The freshness envelope (§5) bounds tariff AGE;
it never supplies request context — predicate resolution never reads fetch-time state.

### 4.4 Lenient unknown-field rules (per feed)

A blanket "unknown field quarantines the offer" rule contradicts both feeds'
documented consumer contracts and is REJECTED:

- LiteLLM `[VERIFIED: docs.litellm.ai]`: new optional fields are added regularly;
  consumers should ignore unknown fields rather than reject them
  (`additionalProperties: true`).
- OpenRouter `[VERIFIED: openrouter.ai models docs]`: consumers should skip entries
  containing condition fields they do not recognize rather than apply their prices.

Normative rules:

1. Unknown OFFER-level field → ignore; offer stays `active`; the unknown key is
   logged to ingestion provenance (fixture F3).
2. Unrecognized OVERRIDE/tiered-entry condition → skip THAT ENTRY ONLY and fall back
   to top-level pricing (fixture F2).
3. Quarantine ONLY when an unknown field bears on the SELECTED meter — e.g. an
   unknown multiplier or suffix attached to the exact meter being priced. The offer
   goes `quarantined` with reason preserved; the lane falls back or reports the gap
   (fixture F4).

This keeps routine upstream field additions from deleting usable models — a blanket
quarantine would be a self-inflicted outage on every feed schema drift.

### 4.5 Commercial overlay application order

```
1. lane cost at feed tariffs            (§2/§3 — infra cost)
2. declared volume / committed-use discounts  (explicit, itemized)
3. commercial overlay                   (§7: licensing, consulting, implementation)
```

The overlay applies LAST, always itemized, never folded into unit prices. Per-1M
outputs are infra-only unless the user toggles fully-loaded mode, and then the label
MUST read `fully_loaded_per_1M`. Infra price and commercial layer never share a
number without a label.