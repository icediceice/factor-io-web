# SPEC — AI Inference TCO Calculator

| | |
|---|---|
| Status | Normative draft for implementation |
| Spec revision | v0.3 — 2026-08-29 (supersedes v0.2 — 2026-08-29, v0.1 — 2026-08-27) |
| Plan thread | 1543165562891538537 (factor-io-web); v0.2 was 1543101965414703186, v0.1 was 1542478190939996174 |
| Delivery | Static client-side calculator on GitHub Pages + an operator-run pricing refresh command |

**What v0.2 changes, and why.** v0.1 asked the user to assert a monthly token
number and compared three "lanes". Both were wrong at the point of use: the token
number is the one figure a buyer cannot supply, and the lane vocabulary named the
options after engine internals rather than after the things being bought.

| v0.1 | v0.2 | Reason |
|---|---|---|
| Demand entered as tokens/month | Demand **derived** from users × sessions/user/day × turns/session × per-workload token shape (§2.4) | A buyer knows their headcount, not their token count |
| Lane A / Lane B / Lane C | **Self-hosted / Rented GPU / Model API** | Named after what is purchased; "lane" is engine vocabulary and never reaches a user |
| Single workload shape | Workload **mix**: RAG, Graph RAG, Agentic, Chat, each with a share (§2.4) | The token shapes differ by an order of magnitude between them |
| Breakeven as a token volume, in prose | **Payback in whole months**, or `does_not_converge` with its reason (§2.5) | "How many months" is the question actually asked |
| Demand ceilings in tokens/month | **Peak tokens/second** with a per-stream speed floor (§6.2) | A monthly total cannot tell you whether serving feels slow |
| GPU rates hand-entered, conflicting sources | Refreshed by one command; per-provider, `first_party` vs `indicative` (§5.7) | Rates were `[ASSUMED]` with an unresolved 55.04-vs-98.32 conflict |

**What v0.3 changes, and why.** v0.2 sized every fleet from one throughput constant
per accelerator. That constant is a property of the MODEL, not of the card, and the
error it introduces is larger than the differences between the three options being
compared — so the comparison stopped meaning anything as soon as the user's model
was not the one the constant was calibrated on.

| v0.2 | v0.3 | Reason |
|---|---|---|
| `tokens_s_per_gpu` a per-accelerator constant | **Derived from the model** by a decode bandwidth roofline (§6.6) | A dense 8B and a GDN-hybrid MoE differ ~5.8× on the same H100 at the same context |
| Model size, context, architecture and quantisation not modelled at all | First-class inputs: params, active params, context, attention kind, weight and KV precision (§6.6) | These are what decide GPU count; the user was previously unable to state them |
| Concurrency implicit | **Batch is SOLVED** against VRAM, the per-stream floor and any runtime cap, and the binding constraint is reported (§6.6.3) | "Buy a bigger card" and "accept a slower answer" are opposite remedies |
| Rented providers sized on a flat constant | Sized on their OWN accelerator **and** the selected model (§8) | Otherwise providers rank by sticker rate, not delivered capacity |
| Four-screen wizard S1→S2→S3⇄S4 | **One screen**, live recompute (§8) | Context and architecture drive GPU count; splitting cause from effect across screens hides the tool's whole point |

The v0.2 constant path REMAINS as the documented fallback for accelerators with no
published bandwidth figure, so no provider drops out of the comparison.

Sections 3, 4, 5.1–5.6, 7, 9, 10 and the F1–F10 fixtures of §12.4 are **unchanged
and remain normative** — the tariff model, quote semantics, freshness envelope and
decimal-exact arithmetic all survive v0.2 intact. The engine keeps its internal
`A`/`B`/`C` keys so those fixtures keep binding; the rename is a presentation-layer
contract (§8), applied at render and export.

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
| Founder/CTO choosing a serving strategy | Option comparison, payback month, sensitivity, honest feasibility | Screens S1–S4 (§8) |
| Consultant pricing a client engagement | Commercial overlay (licensing, consulting, implementation) itemized on top of option math | §7 overlay toggle, quote export |
| FinOps/finance reviewer | Provenance of every number; decimal-exact arithmetic; audit of feed freshness | Provenance popovers, SourceStatus panel (§5) |

### 1.3 Scope

**In scope:** the pricing/offer data model (§3), quote semantics (§4), feed registry
and freshness protocol (§5), throughput evidence semantics (§6), commercial overlay
(§7), client UX and payload contracts (§8–§9), acceptance fixtures (§12.4).

**Out of scope (consumed or deferred):** benchmark collection (the calculator
*consumes* evidence rows, it does not produce them — §6), invoice ingestion,
purchase execution, cluster scheduling, multi-currency conversion (USD only in v0.1).

### 1.4 Output contract (summary)

Every comparison run emits: **peak tokens/second** and the per-stream speed floor
(§6.2); monthly cost per option; **payback in whole months** or `does_not_converge`
with its reason (§2.5); TCO curve over the horizon; cost per 1M tokens per option;
**p95 throughput feasibility** (user SLO `required_p95_tok_s` vs
`modelled_p95_capacity` per §6 — the calculator never prints the word "guarantee"
for a modelled number); and a sensitivity table over declared input ranges.

---

## 2. Comparison options, demand model, and routing policies

### 2.1 Three options — there is no fourth "hybrid" option

Named after what is being purchased. The engine's internal keys remain `A`/`B`/`C`
so the §12.4 fixtures keep binding; those keys are mapped to the names below at
render and export (§8) and **never reach a user**.

| Option | Engine key | Cost shape | Capacity | Priced from |
|---|---|---|---|---|
| **Self-hosted** | `A` | One-time **capex** + monthly opex (power, ops, colo); marginal cost ≈ 0 up to capacity | Hard ceiling: tokens/s and tokens/month | User-entered capex + opex, sized from §6.2 |
| **Model API** | `B` | Pure usage-based per-meter tariffs (§3); no capex | Rate-limited, effectively unbounded | OpenRouter, LiteLLM cost map (§5) |
| **Rented GPU** | `C` | Hourly instance tariffs × utilization, **per named provider** | Per node topology; user-declared topology | AWS, Azure, GCP, Alibaba, Tencent, Huawei, neoclouds (§5.7) |

Hybrid deployments exist, but **hybrid is a routing policy across the three, not a
fourth option.** A fourth hybrid option duplicates an engine path that already
composes them, and can only produce misleading numbers — see fixture F7 (§12.4): a
user-set 70/30 local/API blend over 100M tokens/mo local capacity against 80M demand
emits $10,240 where local-first serves all 80M for $10,000. Routing percentages are
derived quantities, not exogenous inputs.

The commercial layer (enterprise licensing, AI consulting, implementation — §7) is
an **overlay** applied after lane math, itemized, never folded into unit prices.

### 2.2 Routing policies

Exactly three policies are modelled. Every multi-lane run declares one.

**`local_first`.** Serve `min(demand, local_capacity)` on Self-hosted; overflow
routes to the declared secondary option (Model API or Rented GPU). The split is
**derived**, never user-set:

```
local_share = min(demand_tokens, local_capacity_tokens) / demand_tokens
```

A user-set blend percentage is accepted only as an *advisory* input. When the
derived split dominates the advisory blend (as in F7), the calculator computes the
derived split, shows the advisory number, and flags it `dominated` with the delta —
it never emits the dominated blend as the optimum.

**`api_first` + failover.** Serve from Model API; a declared fallback option
(Self-hosted or Rented GPU) carries outage traffic. Fallback cost is charged at
`failover_rate × assumed failover share`; a pure-standby fallback (share = 0) still
surfaces the standby's fixed cost if it is Self-hosted or Rented GPU, labelled
`standby_fixed`.

**`fixed_split`.** An explicit user-pinned split (contractual, regulatory, or
residency reasons). The calculator computes exactly the pinned split and — as a
non-substituting comparison annotation — also prints the `local_first` derived split
and its total, labelled `derived_optimum_note`. The pinned split is never silently
replaced.

### 2.3 Capacity-constrained math — owned fixed cost is never double-charged

Self-hosted's fixed cost is incurred **once** whenever Self-hosted is in service,
independent of how many tokens (up to capacity) traverse it. Engine rules:

1. If Self-hosted serves ≥ 1 token in a period, its full fixed cost for that period
   is charged exactly once.
2. Tokens served within capacity add no per-token Self-hosted charge (a user-entered
   power/ops marginal may be added, itemized separately).
3. Overflow tokens are priced only at the secondary option's marginal tariffs.
4. No run may simultaneously charge the full fixed cost **and** a per-token blend
   that implicitly re-prices in-capacity tokens — that is the F7 defect.

**Worked anchor (fixture F7):** Self-hosted capacity 100M tok/mo at $10,000/mo fixed;
demand 80M tok/mo. `local_first` serves 80M locally → total **$10,000**. Advisory
blend 70/30 (local/API) → $10,000 + 24M × $0.01/1M overflow = **$10,240** — flagged
`dominated`, never emitted as the recommendation.

### 2.4 Demand model — derived from users, never asserted as a token count

v0.1 required `demand_tokens_mo` as a direct input. That is the one number a buyer
cannot supply, so v0.2 derives it. A **session** is the unit of work; the workload
**mix** carries the token shape, because RAG and Agentic differ by roughly an order
of magnitude per turn and a single averaged shape hides that.

```
sessions_mo   = users × sessions_per_user_day × working_days_mo
turns_mo(w)   = sessions_mo × mix_share(w) × turns_per_session(w)
tokens_mo     = Σ_w turns_mo(w) × (in_tokens(w) + out_tokens(w) + cached_tokens(w))
```

Workload types are `rag`, `graph_rag`, `agentic`, `chat`. Mix shares are fractions
summing to 1; a mix that does not sum to 1 is a **refusal**, not a silent
renormalization — a mis-entered share otherwise changes the answer invisibly.

Every derived quantity carries a **basis** — `input`, `derived`, `assumed` or
`user_override` — and `buildDemand` / `peakTokensPerSecond` accept an override for
each one. An override is retained, labelled `user_override`, and never silently
recomputed from the inputs that produced it. Derived-vs-overridden is visible at
the point of use, per the §8 UX rules.

**What v0.2 actually surfaces, stated plainly.** The override *controls* in the
shipped client are the sizing ones: GPU count, tokens/s per GPU, and the monthly
token budget. The demand-side slots — `sessions_mo`, `turns_mo`, `tokens_mo`,
`concurrent_peak`, `peak_tokens_s` — exist in the module API and are honoured by
the engine, but have no control yet, so those figures always render `derived`.
This is a declared gap rather than an implied capability: every input *above* them
(users, sessions/user/day, working days, mix shares, per-turn token shapes) is
editable, and that is the customization the session model is built around.

### 2.5 Payback — a whole number of months, or an honest refusal

v0.1 emitted breakeven as a token volume in prose. The decision question is *when*,
so v0.2 emits months. Self-hosted carries a one-time `capex` and a `monthly_opex`;
the comparison target is any other option's monthly total:

```
payback_months = ceil( capex / (target_monthly − monthly_opex) )    when target_monthly > monthly_opex
               = does_not_converge                                   otherwise
```

`does_not_converge` is returned **with its reason** (`opex_exceeds_target` or
`zero_capex`) and is never rendered as a large number, an infinity, or a dash. A
payback beyond the declared horizon is returned as the true month with a
`beyond_horizon` flag — truncating it to the horizon would misreport a real answer
as an impossible one.

**v0.5 — one-time cost belongs to EVERY option, and payback compares the net.**
Through v0.4 only the self-hosted option could carry a one-time cost, so a rented
option's onboarding fee and an API option's integration work read as zero whether
or not they existed. v0.5 rolls a one-time figure up per option:

```
one_time[k] = (k == A ? laneA.capex : 0) + declared_one_time[k] + subscription_one_time_if_applies[k]
horizon_total[k] = monthly_total[k] × horizon_months + one_time[k]
```

The `capex` term in the payback formula above becomes the **net** one-time
difference, `one_time[A] − one_time[target]`, and both monthly figures carry the
platform licence wherever §7.4 says it applies. The target option's own upfront
cost delays the crossing by exactly as much as the self-hosted capex brings it
forward, so charging only one side would systematically flatter self-hosting.
With no subscription and no declared one-time this reduces to `capex − 0` and the
v0.4 monthlies, which is why the F1–F10 fixtures are unmoved by the change.

A cost the UI describes as applying to *every* option must reach `one_time[k]` for
every option, not the §7.2 commercial overlay. The overlay annotates the per-1M
basis and never enters the curve, the horizon total or payback, so a one-time
amount parked there is invisible in exactly the three places a one-time cost is
read. Implementation cost is therefore a declared one-time on A, B and C — where,
being equal across the options, it cancels out of the net payback difference while
still showing in each option's own total.

`monthly_total` and `horizon_total` are reported **beside** the infrastructure
line, never folded into it: `lanes[k].monthly_total` stays the cost of serving
the tokens, exactly as §4.5 keeps the commercial overlay separable. Any surface
that shows a monthly next to a cumulative total must state both on the same
basis — a licence-inclusive total beside an infra-only monthly invites the reader
to subtract one from the other and reach a figure that is in neither.

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
| `HourlyTariff` | per-hour × topology | Rented-GPU instances (§5.7); provisioned/rented endpoints |

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
observed refresh id and timestamp. The `N_CONSECUTIVE` default of 3 is
`[ASSUMED — spec author; open decision O3]`.

### 3.5 Decimal-string arithmetic

All money quantities — unit prices, multipliers, uplifts, discount rates, totals —
travel as decimal strings and are computed in exact decimal arithmetic; IEEE-754
float is prohibited on any money path. Display rounding is explicit (half-up at
declared precision, default 2 for totals, 8 for per-token unit prices `[ASSUMED —
spec author]`). Fixture F10
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

---

## 5. Pricing feed registry and freshness protocol

### 5.1 Feed registry (verified endpoints)

| # | Source | Endpoint | Auth | Consumed content |
|---|---|---|---|---|
| 1 | AWS Price List Bulk API | `pricing.us-east-1.amazonaws.com` (public offer files under `/offers/...`) | none `[VERIFIED: docs.aws.amazon.com Price List Bulk API]` | GPU-instance offer files for in-scope service codes (per-service JSON/CSV) |
| 2 | Azure Retail Prices API | `prices.azure.com/api/retail/prices` | none — unauthenticated by design `[VERIFIED: learn.microsoft.com retail-prices]` | `$filter` + `$skip` pages for GPU VM meters |
| 3 | GCP Cloud Billing Catalog | `cloudbilling.googleapis.com` (`services` / `services.skus`) | API key `[VERIFIED: plan grounding]` | GPU SKUs + pricing info; key confined to Actions secrets (§5.6) |
| 4 | LiteLLM model cost map | LiteLLM GitHub raw `model_prices` JSON | none `[VERIFIED: docs.litellm.ai]` | Full model cost map (§3.1 LiteLLM field inventory) |
| 5 | OpenRouter models API | `openrouter.ai/api/v1/models` | none `[VERIFIED: openrouter.ai docs]` | Model list incl. pricing object + overrides (§3.1 OpenRouter inventory) |

The registry table itself is config data in the ingestion pipeline; adding a feed is
a config change, not an engine change, provided its normalization maps into the §3
tariff union.

Default per-feed TTLs for the freshness envelope (§5.2): cloud price lists
(AWS/Azure/GCP) 7 days; model tariff feeds (LiteLLM/OpenRouter) 3 days `[ASSUMED —
spec author; calibrated at first ingestion per open decision O2]`.

### 5.2 SourceStatus freshness envelope

Every source carries one envelope, persisted into the snapshot:

```
source_status = {
  source_id,
  status,          // fresh | stale | expired | error
  observed_at,     // when THIS data was fetched (data age anchor)
  last_success_at, // last refresh that completed and parsed
  expires_at,      // observed_at + per-source TTL (config)
  digest,          // content hash of the ingested slice
  record_count
}
```

Freshness is derived ONLY from per-source data age (`observed_at` vs now vs
`expires_at`). Commit timestamps and cron timestamps are never freshness evidence
(§5.4). A digest mismatch between manifest and slice is treated as `error` and the
slice is unservable.

### 5.3 Ingestion and publish protocol — GIT primitives only

Ingestion runs as a GitHub Actions scheduled workflow:

1. fetch every registered feed; normalize into the §3 union; validate record counts;
2. write versioned `snapshot.json` (prices + models + provenance + per-source
   `fetched_at`) plus digest-addressed slice files;
3. publish = ONE atomic commit updating the manifest pointer + changed slices;
4. rollback = `git revert` of the publish commit; the client pins the manifest
   version it loaded.

No external store, no database, no server: the repo IS the publication channel and
GitHub Pages the delivery surface.

### 5.4 GitHub Actions pathologies (and why cron is never evidence)

Two VERIFIED platform behaviours drive the design:

1. `[VERIFIED: GitHub docs / community discussion #185355]` The `schedule` event can
   be delayed during periods of high load, and "if the load is sufficiently high
   enough, some queued jobs may be dropped." A cron timestamp therefore is NEVER
   evidence of a completed refresh.
2. `[VERIFIED: GitHub docs]` GitHub automatically disables scheduled workflows after
   60 consecutive days of no repository activity. `[VERIFIED: this repo's git log]`
   shows exactly this risk profile — a 137-day default-branch gap (2026-03-03 →
   2026-07-18).

Compounding failure: the ingestion workflow commits only when prices CHANGE. A
stable-price stretch produces no commits → the 60-day inactivity counter keeps
running → the trigger is silently disabled → the snapshot freezes while appearing
"published."

Mitigations, both NORMATIVE:

- **Keepalive commit:** an unconditional scheduled heartbeat commit to the default
  branch (timestamp marker file) at an interval safely below 60 days, independent of
  whether prices changed.
- **Actions-independent staleness check:** freshness is judged from the envelope
  INSIDE the snapshot (§5.2), rendered client-side as a staleness banner once
  `expires_at` passes. This check must function even if Actions never runs again —
  a frozen feed must fail loudly, never silently.

### 5.5 Client-side freshness rendering

The calculator refuses to hide age: every result screen shows the newest
`observed_at` across the feeds it consumed; any consumed source past `expires_at`
renders the result under a `STALE PRICING` banner with the offending sources listed;
`error` sources remove their lane/offer from servability and the gap is shown.

### 5.6 Secret handling

The GCP Cloud Billing API key lives ONLY in GitHub Actions secrets. It never appears
in snapshots, slice files, client payloads, or logs. Feeds requiring credentials the
pipeline cannot hold are excluded from the registry rather than half-supported.

### 5.7 GPU pricing registry — provider coverage and confidence tiers

Rented-GPU rates in v0.1 were hand-entered `[ASSUMED]` values carrying an unresolved
conflict ($55.04 vs $98.32 for the same 8×H100 node). v0.2 replaces them with a
generated registry, refreshed by `node scripts/refresh-pricing.mjs`, in which every
row declares which of two confidence tiers it belongs to.

**Verified at the endpoint on 2026-08-29** — these are `[VERIFIED]`, not assumed:

| Provider | Endpoint | Auth | Tier |
|---|---|---|---|
| AWS | Price List Bulk API (`pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/…`) | none | `first_party` |
| Azure | Retail Prices API (`prices.azure.com/api/retail/prices`) | none | `first_party` |
| GCP | Cloud Billing Catalog API | **API key required** — returns `403 Method doesn't allow unregistered callers` unauthenticated | `indicative` |
| Alibaba, Tencent, Huawei | signed AccessKey APIs | credentials required | `indicative` |
| Neoclouds (RunPod, Lambda, Vast, CoreWeave) | varies | varies | `indicative` |

- **`first_party`** — fetched from the vendor's own price list with no credential.
  Carries `observed_at` and the endpoint URL.
- **`indicative`** — read from a public aggregator because the vendor's own API is
  credential-gated. Carries `observed_at`, the aggregator URL, and renders with an
  `indicative` tag at every point of use. It is a planning figure accurate to the
  order of magnitude, and the UI says so rather than implying vendor authority.

**No third tier, and no silent promotion.** An aggregator number never renders as
`first_party` because it happens to agree with one. If a parse fails its shape
assertion the refresh **throws** — a silently empty provider list would ship a
calculator with no GPU prices at all, which is worse than a loud failure.

Adding GCP to `first_party` requires only a key in the §5.6 secret store; the
registry is structured so that promotion changes the tier field and nothing else.

### 5.8 Server acquisition registry — why there is no `first_party` tier here

The self-hosted option needs a hardware capex, and through v0.4 the field shipped
`value="0"`. That was not a neutral default: `paybackMonths` returned `zero_capex`
on the default scenario, so the payback block — the one answer this calculator
exists to produce — was dead out of the box. v0.5 derives the capex from a chosen
server configuration and the fleet the demand model already sized.

**No vendor publishes a list price for a GPU server.** Dell, HPE, Supermicro and
NVIDIA's own DGX line all quote an 8-GPU node through sales; Supermicro's store is
configure-to-order and returns no comparable figure. There is therefore **no
`first_party` tier for this registry at all**, and there will not be one until a
vendor publishes a credential-free price list. Every row is `indicative`, sourced
from a named published integrator or analyst figure, and carries `quoted_text`,
`source_url` and `observed_at`.

**The builder verifies citations, not prices.** `scripts/build-server-pricing.mjs`
is stage 4/4 of the refresh and is deliberately **not a scraper**. It re-fetches
each row's `source_url` and asserts the row's `quoted_text` still appears on the
page, writing a per-row `verification` of `verified` / `citation_broken` /
`unreachable`. This catches the failure that actually happens — a published figure
quietly changing under a citation the calculator still displays — rather than
pretending to read a price out of a sales page. A broken citation does **not**
delete the row: the figure was true when observed, so it survives at its original
`observed_at`, rendered unverified. The stage exits non-zero only when **no** row
verifies, because that means the run was broken, not that a number went stale.

**The three statuses are three different claims, and the UI must keep them apart.**
`verified` says the quoted sentence is still at the source; `citation_broken` says
it is not; `unreachable` says the fetch failed on that run and makes **no** claim
about the figure at all. Collapsing unreachable into the broken branch turns a
failure on our side into an accusation about the source — the one thing a provenance
tier must never invent.

**Bands, not point estimates, and disagreement is carried not averaged.** Each row
publishes `usd_low` / `usd_typical` / `usd_high`; the UI offers those three as a
price basis and pre-fills the typical. Where two sources disagree — they currently
differ by ~22% on an 8×H100 node — both ship as **separate rows** with their own
citations. Averaging them would manufacture a figure no source states, and the
disagreement is itself the honest signal about how firm these numbers are.

**Whole nodes, and the waste is shown.** A fleet is covered in whole units of ONE
selected configuration: `nodes = ceil(gpus_required / gpu_count)`, `capex = nodes ×
unit_price`. A part-full node still costs a full node, and the surplus accelerators
are reported (`gpus_overprovisioned`) rather than prorated away — §2.3's rule
against fractionally discounting a fixed asset applies to the hardware exactly as
it applies to a lane's fixed monthly. Mixed-configuration fleets are **not** solved:
registry rows are citations, not SKUs, so a combination could "buy" the same node
twice at two different published prices, and `serving.js` solves tensor-parallel
size against a uniform accelerator anyway.

The derived figure follows the §2.4 basis contract — an entered capex outranks it,
and the quote records which of the two applied (`capex_basis`). Coverage is
partial by construction: accelerators with no published node figure (currently
a100_40, a100_80, a10g, a10, l4, l40s, a800) have no rows, and the refresh names
them so the gap is known rather than silent. The UI asks the user for a figure
instead of inventing one.

---

## 6. Throughput and utilization

### 6.1 The two throughput quantities

| Name | Direction | Definition |
|---|---|---|
| `required_p95_tok_s` | USER SLO INPUT | The p95 per-request generation rate the workload needs. The user owns this number. |
| `modelled_p95_capacity` | DERIVED OUTPUT | What the calculator models a configuration can sustain at p95, derived strictly from evidence (§6.3). |

Feasibility is the comparison `required_p95_tok_s ≤ modelled_p95_capacity`, emitted
per lane configuration with one of three verdicts: `feasible` (evidence-backed),
`infeasible` (evidence-backed), or `unknown` (§6.4). The calculator NEVER prints the
word "guarantee" — a guarantee is a contract a human signs, not a number a model
emits.

### 6.2 Option capacity, per-second demand, and utilization math

**Demand binds per second, not per month.** A monthly token total cannot tell you
whether serving feels slow: the same 1.2B tokens/month is comfortable spread evenly
and unservable at a 9am peak. Sizing is therefore driven by two quantities:

```
peak_tokens_s   = concurrent_sessions_peak × tokens_s_per_stream
concurrent_peak = users × peak_concurrency_fraction
```

- **`tokens_s_per_stream`** is the per-stream speed floor — the output rate one user
  actually sees. Below roughly 20 tok/s an interactive answer reads as slow, so the
  floor is an input with a stated default, not a derived quantity.
- **Sizing must satisfy the floor at peak, not merely the monthly total.** An option
  whose aggregate throughput clears `tokens_mo` but misses `peak_tokens_s` is
  reported as **under-provisioned at peak**, never as sufficient.
- **`gpus_required = ceil(peak_tokens_s / tokens_s_per_gpu)`**, where
  `tokens_s_per_gpu` is `[ASSUMED]`, editable, and carries the assumed tag at every
  point of use (§6.5). It is a planning placeholder, never a benchmark, and never
  backs a `modelled_p95_capacity` verdict.

Per-option economics:

- **Self-hosted:** user-declared `tokens/s` ceiling and monthly token budget;
  utilization = demand/capacity; TCO is flat up to capacity (per §2.3) so unit cost
  falls with utilization — this is what creates the payback against Model API.
- **Rented GPU:** hourly cost amortized over `tokens/s × utilization × seconds`
  (seconds, not hours — the ×3600 factor is dimensional, see G5); unit cost is
  hyperbolic in utilization; breakeven vs Model API is the utilization where
  `hourly/(throughput×util)` crosses the API per-token price.
- **Model API:** no utilization economics; unit cost is the tariff itself (§3/§4).

### 6.3 Evidence rows and matching dimensions

`modelled_p95_capacity` is backed ONLY by evidence rows, each carrying the full
condition set it was measured under:

```
evidence_row = {
  model_revision,          // exact weights revision, not family
  runtime, runtime_version,// e.g. vLLM 0.x / TRT-LLM n.x
  quantization,
  hardware_topology,       // GPU model × count × interconnect
  prompt_output_dist,      // e.g. 128/128, 8000/1000
  concurrency,
  batch_mode,              // continuous/static/none
  percentile_window,       // the window the p95 was computed over
  value_tok_s, provenance  // source citation
}
```

Matching rule: an evidence row supports a configuration ONLY on every dimension.
There is no interpolation, no "close enough," no scaling between rows: 11,200 tok/s
measured at concurrency 256 with 128/128 prompt/output says NOTHING about
concurrency 8 at 8000/1000 — different dimension, different answer.

### 6.4 Unknown, not fabricated

No row matches all dimensions → `modelled_p95_capacity = unknown` and the verdict is
`unknown`. A partial match may be SHOWN as an annotation with the mismatched
dimensions listed, but it never becomes the number. Fixture F8 pins this.

### 6.5 Provenance of shipped defaults

Every default shipped with the calculator is labelled `measured` (with source) or
`assumed` (with owner + date + re-verification date). Two seed numbers require
disclosure: **11,200 tok/s and 3,400 tok/s** figures carried in planning material
are operator packet inputs — `[ASSUMED — operator-supplied, externally UNVERIFIED;
owner: spec author; re-verify before first public release]`. They MUST NOT ship as
evidence rows without a real benchmark citation; they may ship only as clearly
labelled placeholder defaults.

### 6.6 The serving model — throughput is DERIVED from the model, never a per-GPU constant

v0.2 sized every fleet from one number per accelerator (`TOKENS_S_PER_GPU_ASSUMED`,
e.g. `h100: 2500`). That is wrong in kind, not in degree: tokens/s per GPU is a
function of the MODEL — its size, its context, its attention architecture and its
quantisation — and the spread across those is larger than the differences between
the three options the calculator exists to compare. A dense 8B and a GDN-hybrid MoE
on the SAME H100 at the SAME 32,768-token context differ by ~5.8x
(423.87 vs 2,474.72 tok/s/GPU, worked below). A constant cannot express that, so a
constant makes the comparison meaningless whenever the user's model is not the one
the constant was calibrated on.

v0.3 replaces it with a memory-bandwidth roofline for the DECODE phase. Implemented
in `tco-calculator/serving.js`; data in `tco-calculator/data/serving-models.json`.

**6.6.1 KV cache per token — one layer-group form covers all four architectures.**
A model declares `groups[]`; each group is a run of layers sharing a shape. Per
token, per group:

```
group_bytes_per_token = layers x tensors x kv_heads x head_dim x bytes_per_element
```

`tensors` is 2 for a normal K+V cache and 1 where K and V are a single shared
tensor. The four architectures are then just group kinds, not four formulas:

| kind | Meaning | Retention at context C |
|---|---|---|
| `full` | full attention | every token: `C` |
| `sliding` | sliding-window | capped at the window: `min(C, window)` |
| `linear` | GDN / DeltaNet | **0 bytes per token** — no growing cache |
| `mla` | compressed latent | `layers x (kv_lora_rank + qk_rope_head_dim) x bytes` |

`kv_bytes_per_sequence = Σ over groups (group_bytes_per_token x retained_tokens)`.
A `linear` group contributes zero, which is the whole point of a GDN hybrid: only
its few full-attention layers grow with context.

The form is falsifiable and IS falsified in `tests/serving.test.mjs` against four
independently published figures at BF16: Qwen3 8B **147,456** B/token,
Gemma 4 31B **860,160**, Qwen3-Next 80B-A3B **24,576**, DeepSeek V3 **70,272**.
Each of those four hand-curated presets carries `kv_bytes_per_token_bf16_expected`
and a test asserts it reproduces its own figure, so a bad edit to a layer table
fails the suite rather than silently re-pricing a fleet. They are the ONLY presets
that do: the Hub-derived rows of §6.6.8 carry a null expectation and are not
falsifiers, since they are generated from each repository's own config rather than
from an independently published per-token figure. That is precisely why a refresh
preserves these four verbatim.

**6.6.2 Weights: resident vs read-per-step.** These are DIFFERENT quantities and
conflating them mis-sizes every mixture-of-experts model:

```
resident      = total_params  x bytes_per_param   (must FIT in VRAM)
read_per_step = active_params x bytes_per_param   (bandwidth cost per token)
```

For Qwen3-Next 80B-A3B at BF16 that is 160 GB resident but only 6 GB read per step.
A model that is enormous in memory can still decode fast; a sizing model that knows
only one of these numbers gets MoE wrong in one direction or the other.

**6.6.3 The roofline and the batch solve.** Decode is bandwidth-bound, so:

```
t_step      = (read_per_step + batch x kv_per_sequence) / (n_gpu x bandwidth x efficiency)
per_stream  = 1 / t_step                      tokens/s ONE user sees
aggregate   = batch / t_step                  tokens/s the replica delivers
per_gpu     = aggregate / n_gpu
```

`batch` is SOLVED, not entered — it is the largest batch satisfying both bounds:

```
batch_mem   = floor((n_gpu x vram_usable - resident) / kv_per_sequence)
batch_speed = floor((aggregate_bandwidth / per_stream_floor - read_per_step) / kv_per_sequence)
batch       = min(batch_mem, batch_speed, runtime_cap)
```

The per-stream floor the UI already collects for demand sizing (§6.2) therefore does
double duty as a SUPPLY-side constraint. In `batch` mode there is no floor to hold,
so only memory and the runtime cap bind — the throughput-vs-latency trade, made
explicit rather than assumed. The bound that actually applied is reported
(`batch_bound_by`), because "buy a bigger card" and "accept a slower answer" are
opposite remedies and the user must be told which one is theirs. A pure-`linear`
model has `kv_per_sequence = 0`; that is unbounded, not a division by zero, and it
takes the cap instead.

**6.6.4 Tensor parallelism.** Candidate sizes `[1,2,4,8,16]` are tried in ascending
order and the SMALLEST that admits `batch >= 1` wins. Aggregate bandwidth is
discounted for collective overhead as `n x bandwidth x tp_efficiency^(n-1)`. A TP
group is indivisible, so the fleet is sized in WHOLE replicas:
`gpus = gpus_per_replica x ceil(peak / tokens_s_per_replica)`. If no size fits, the
result is a refusal listing WHY per attempted size — never a silent fallback.

**6.6.5 Every constant, labelled.** Owner: spec author. Re-verify before
**2026-12-01**. None of these is a benchmark:

| Constant | Value | Basis |
|---|---|---|
| Accelerator memory bandwidth | per-GPU, `serving-models.json` | `measured` — vendor datasheet, each with `source_url` |
| A800 bandwidth | 2039 GB/s | **`inferred`** — export-compliant A100 80GB; NVLink capped, HBM2e unchanged. No independent citation found; `source_url` is null rather than invented |
| Runtime bandwidth efficiency | vLLM/SGLang 0.80, TRT-LLM 0.85, llama.cpp 0.60 | `assumed` |
| Tensor-parallel efficiency | 0.92 per extra GPU | `assumed` |
| VRAM overhead fraction | 0.10 | `assumed` |
| Weight/KV bytes per element | BF16 2, FP8 1, INT8 1, INT4 0.5 | `assumed` — INT4 understates real VRAM (scales/zero-points not modelled) |

VRAM capacity is NOT duplicated in `serving-models.json`: `gpu-pricing.json` remains
the single source of truth for it, and the serving table adds bandwidth only.

**How provenance is carried — normative.** `serving-models.json` holds ONE file-level
`provenance` object (`owner`, `observed`, `re_verify_before`) that every row inherits;
a row whose expiry genuinely differs overrides it explicitly. On top of that, each row
carries the provenance that is actually its own: a `cited` or `inferred` accelerator or
model row carries `source_url` and `observed_at`, while an `exact` or `assumed`
constant carries `basis` and an explanatory `note`. Per-row `source_url` on a
definitional constant is deliberately absent — "two bytes per parameter" has no
citation, and manufacturing one to satisfy a uniform schema would breach the
provenance mandate this table exists to enforce. `inferred` rows keep
`"source_url": null` for the same reason: `unknown` beats invented.

**6.6.6 What is NOT modelled — normative.** Every throughput figure derived here is
tagged `assumed` and MUST NOT satisfy a `modelled_p95_capacity` verdict (§6.3–§6.5).
It rests on stated efficiency constants, not measurement. Specifically excluded:

- **Prefill.** This is a decode-only model; a long-prompt workload runs slower.
- **The GDN recurrent state.** Declared `state_bytes_per_seq: null` — UNMODELLED, not zero.
- Speculative decoding, chunked prefill, prefix-cache reuse, and PagedAttention
  fragmentation.

An entered `Measured tok/s per GPU` outranks the roofline, and the roofline outranks
the v0.2 constant. The v0.2 path REMAINS as the fallback for an accelerator with no
published bandwidth figure, so such a provider keeps its row in the cross-provider
table instead of vanishing from the comparison.

**The fallback is scoped to MISSING DATA, never to a refusal — normative.** The two
outcomes are not interchangeable and MUST NOT be collapsed:

| Outcome | Meaning | What the calculator does |
|---|---|---|
| no bandwidth published for the accelerator | the DATA is absent | falls back to the v0.2 constant, labelled `a per-accelerator planning constant, not this model` |
| `ServingRefusal` from `servingPlan` | the model does not physically FIT | the self-hosted option is NOT sized and NOT priced; results and verdict are cleared and the per-size refusal is shown |

Pricing a refused configuration from the v0.2 constant would put a monthly cost — and
potentially a "lowest" verdict — on hardware that cannot hold the model, which is the
single most damaging error this calculator can make. The ONE exception is an entered
`Measured tok/s per GPU`: it outranks the roofline by the rule above, so a user who
has benchmarked the configuration may proceed past the refusal. The fit panel is then
tagged `did not size the fleet`, because the roofline's own figures no longer describe
what was costed.

**6.6.7 Worked example (regression anchor).** Qwen3 8B, BF16, H100 80GB
(3350 GB/s, 0.80 efficiency, 10% overhead), 32,768 context, 30 tok/s floor:

```
resident = read_per_step = 8.2 x 2                     = 16.4 GB
kv_per_sequence = 147,456 x 32,768                     =  4.832 GB
batch    = floor((80 x 0.9 - 16.4) / 4.832)            = 11        (VRAM-bound)
per_stream = (1 x 3350 x 0.80) / (16.4 + 11 x 4.832)   = 38.53 tok/s
per_gpu    = 38.53 x 11                                = 423.87 tok/s
```

At 4,096 context the same model yields KV 0.604 GB, batch 92, and
**3,426.06** tok/s/GPU — an 8x swing from context alone, which the v0.2 constant
erased entirely.

**6.6.8 Where the presets come from — DERIVED rows, normative (v0.4).** The v0.3
preset list was hand-curated and therefore aged silently: it kept rendering, and
kept answering, while its newest entry fell a model generation behind. Stage 3/3 of
the refresh command (`scripts/build-serving-models.mjs`, run by
`node scripts/refresh-pricing.mjs`) regenerates it from the Hugging Face Hub.

Ranking is by `trendingScore`, NOT by downloads. Cumulative downloads is a lifetime
integral and therefore ranks by repository age: the live downloads top-10 is `gpt2`
(2022), `facebook/opt-125m` (2022), three Qwen2.5 checkpoints (2024) and a
`trl-internal-testing` CI fixture. Sorting a "latest models" refresh by downloads
would make the list OLDER, which is the failure it exists to fix. `--sort` overrides.

Each surviving repository's serving shape is read from its OWN files — never from
its name, and never from a benchmark:

| Field | Source |
|---|---|
| `groups[]` | `config.json` `layer_types[]`, tallied per kind (`text_config` unwrapped first for multimodal wrappers) |
| `kv_heads`, `head_dim` | `num_key_value_heads`, `head_dim` (or `hidden_size / num_attention_heads`) |
| `kv_lora_rank`, `qk_rope_head_dim` | the same config keys, for latent-cache models |
| `params_b` | the Hub's `safetensors.total` — the index of the actual tensor headers |
| `active_params_b` | a vendor-declared `-A<n>B` suffix, else computed from the MoE geometry |

The layer-kind table is EXPLICIT and has no default: `full_attention`→`full`,
`sliding_attention`/`chunked_attention`→`sliding`, `linear_attention`/`mamba`/
`recurrent`→`linear`, `deepseek_sparse_attention`/`full_attention_mla`→`mla`. DSA
maps to `mla` because it stores the same compressed latent and only READS a top-k
subset; the sparse read is a compute effect, which §6.6.6 already excludes.

**A row that cannot be expressed is SKIPPED, never approximated — normative.** Both
failures below are invisible downstream, which is why neither may fall through:

| Condition | Why a default would be wrong |
|---|---|
| a `layer_types` value outside the table | `serving.js` throws `unknown_attention_kind`, so the row would refuse in the user's browser; guessing `full` overstates KV for a linear layer without bound |
| `qk_rope_head_dim` without `kv_lora_rank` | not classic MLA — DeepSeek-V4 carries `q_lora_rank`/`o_lora_rank` and a per-layer `compress_ratios[]` this model has no term for |
| `sliding_window` with no per-layer pattern | treating every layer as sliding understates KV, treating none overstates it, and neither announces itself |
| an MoE whose active parameters are underivable | `weightBytes` treats a null `activeParamsB` as EQUAL to total, pricing an MoE as dense and overstating `read_per_step` by the expert ratio |
| a speculative-decoding draft head | it never serves traffic alone; its cost belongs to the model it drafts for |
| a repository that prices identically to one already kept | a dtype sibling (`-BF16` beside an FP8 original) carries no `quantized` tag, so only the derived shape can catch it |

Every skip is written to `skipped[]` in the data file WITH its reason. A silent drop
would read as "the Hub had nothing newer", which is precisely the misreading that
made this stage necessary.

**The derived active-parameter count carries its own falsifier — normative.** Where
no vendor figure is declared, the geometry model must reproduce the PUBLISHED
`safetensors.total` to within 2% before its UNPUBLISHED active count is accepted;
otherwise the model is skipped and both figures are reported. Arithmetic that cannot
reproduce a number that is known has not earned the right to emit one that is not.
Multi-token-prediction heads (`num_nextn_predict_layers`, `mtp_num_hidden_layers`)
count toward the total — they sit in the checkpoint — but never toward active
parameters, since they do not run during ordinary decode.

**Derived rows are NOT verified rows, and the UI says so.** A derived row carries
`basis: "derived"`, a `config_url`, an `active_params_basis` of
`declared` | `derived` | `dense`, and `kv_bytes_per_token_bf16_expected: null` — it
claims no published per-token figure, because none exists for it. The four
hand-curated presets keep theirs and remain the engine's falsifiers under §6.6.1;
`tests/serving.test.mjs` asserts each is still present after every regeneration, so a
refresh cannot quietly delete the only independent check on the layer-group
arithmetic. The model `<select>` groups the two classes under separate `<optgroup>`
labels and the provenance line distinguishes `config-derived` from `verified`.

**Freshness remains the client's call, not CI's.** This is a COMMAND, not a cron, for
the reason recorded in `refresh-pricing.mjs`: GitHub disables scheduled workflows
after 60 days of default-branch inactivity, so a green Actions tab is a freshness
signal that cannot be trusted — and one that cannot be trusted is worse than none,
because it is believed. The `SourceStatus` envelope reading `provenance.observed`
(§5.2/§5.5) stays the only authority on staleness.

---

## 7. Commercial layer (overlay)

### 7.1 Components

| Component | Shape | Input basis |
|---|---|---|
| Enterprise licensing | recurring | per-seat / per-node / per-token royalty, as declared |
| AI consulting | recurring or SOW | hourly rate or fixed statement-of-work |
| Implementation | one-time | integration fee, phased if declared |

### 7.2 Application rules

The overlay applies per §4.5 order — LAST, itemized, never folded into unit prices.
Each component carries its own provenance (`measured`/`assumed` per §6.5) and its
own `exact|estimated` label. TCO curves render in two modes: infra-only and
fully-loaded (`fully_loaded` label mandatory). Consultant-facing quote export lists
overlay line items separately so margins and client-specific rates stay out of the
engine entirely.

### 7.3 Publication boundary

The hosted artifact of this spec and any public calculator page carry NO client
rates, margins, or named engagements: commercial defaults shipped publicly are
generic placeholders labelled `assumed`. Client-specific figures exist only in
private quote exports.

### 7.4 AI-platform subscription — a cost layer, and its split provenance

The software you licence to run inference — Nutanix Enterprise AI, NVIDIA AI
Enterprise, Red Hat AI Inference Server — is not one of the three options. §2.1
fixes those three and admits no fourth. It is a **layer charged on top of the
options it covers**, exactly as the §7.2 overlay is, and it is applied before the
overlay so the overlay stays last.

**The meter is the first-class field, not the price.** These vendors count
fundamentally different things, and the meter is what decides the bill:

| Meter | Example | Billable quantity is derived from |
|---|---|---|
| `per_gpu_ram_gb_year` | Nutanix Enterprise AI | GPU count × the accelerator's `vram_gb` |
| `per_gpu_year`, `per_gpu_hour` | NVIDIA AI Enterprise (subscription / marketplace) | fleet GPU count; rented GPU-hours for the hourly meter |
| `per_accelerator_year` | Red Hat AI Inference Server | fleet accelerator count |
| `per_node_year` | node-metered platforms | the §5.8 capex plan's node count |
| `per_vcpu_year`, `per_user_month`, `flat_month` | worker-node and seat licensing | entered; the calculator models no vCPU count |

The quantity is **derived from the fleet this calculator already sized**, so the
licence re-prices when the fleet moves. An unknown meter is a refusal
(`unknown_meter`), never a guess; a meter whose input the calculator does not model
refuses by naming the missing field (`missing_quantity_input`).

**The quantity is derived PER OPTION, because the options do not run the same
fleet.** A row that applies to both the owned and the rented option is metered twice
over: the owned option against the GPUs its nodes carry, the rented option against
the accelerator it actually rents, in the count that accelerator needs, for its own
metered hours. Charging one option's quantity to the other is a wrong number that
looks right — the rented column silently inherits the owned fleet's bill — so the
per-option amounts travel in `by_option`, and **where that map is present it is
authoritative: an option missing from it is charged nothing rather than falling back
to a flat figure.** An option this run does not price at all has no fleet to meter
and is skipped, not guessed.

**GPU meters count the GPUs INSTALLED, not the ones the model needs.** Both
first-party meter quotations in the registry say so verbatim — "a software license
is required for every GPU installed on the server", "quantified across all GPUs in a
cluster". You buy whole nodes (§5.8), so a 9-GPU requirement bought as three 4-GPU
nodes is licensed for 12. Metering the required count instead understates the
licence by exactly the overprovision the hardware line already reports, and the UI
states the installed basis at the point the figure is read.

**Provenance is per FIELD, not per row.** A vendor routinely documents its meter in
public while quoting the amount only through sales. Collapsing those into one row
tier would either present an analyst's estimate as a vendor list price or discard a
genuinely first-party fact. So each row carries `meter_confidence` /
`meter_source_url` **separately** from `price_confidence` / `price_source_url`, and
the UI tags them separately: *meter: vendor-documented* beside *price: indicative*
or *price: your quote*.

**A null price refuses; it never renders as free.** Nutanix and Red Hat publish a
meter and no list price. Those rows carry `price_usd: null` and raise
`price_unpublished`, which asks for the user's quoted figure while still showing the
documented meter quotation. Defaulting to zero would report the licence as free —
the single most misleading answer this layer could give.

**`applies_to` is explicit, and non-coverage is named.** A row states which options
it is charged to. The Model API option is not excluded by silence: it is reported
as `not_applicable` by name, because "you do not run a platform here" and "the
platform is free here" are materially different claims and an omitted row renders
as the second. A row's `bundled_exemptions` records where a licence is already
included in the hardware or instance price (DGX systems, H100 PCIe) so it is not
double-counted, and `bundled_server_ids` is that fact in machine-actionable form:
selecting an exempt server raises a visible warning on the licence line. The warning
does **not** silently zero the charge — the bundle is a fixed multi-year entitlement
while the row is an annual subscription, so the honest act is to show the overlap and
let the buyer price it. Matching is by `server_id` and never by `gpu_id`: the H100
PCIe card carries the entitlement and the H100 SXM in an HGX node does not, and both
are `gpu_id: "h100"`.

Term handling is exact: `annual` divides by 12 into a monthly figure that is
frequently non-terminating and therefore travels as a reduced rational per §3.5;
`monthly` and `hourly` are already the month's cost and are never divided again;
`perpetual` becomes a one-time cost and enters the §2.5 roll-up.

---

## 8. UX — ONE screen, no wizard

```
┌─ inputs (sticky left rail) ─┬─ answers (right column, live) ─────────────┐
│ Start here (preset chips)   │ verdict cards · fit & speed · demand       │
│ Who uses it                 │ recommendation · payback · per-option      │
│ What they do (mix)          │ cross-provider table · feasibility · curve │
│ The model you'd run         │ sensitivity · provenance · export          │
│ Hardware & prices           │                                            │
│ Money                       │                                            │
└─────────────────────────────┴────────────────────────────────────────────┘
```

v0.2's four-screen wizard (S1→S2→S3⇄S4) is REMOVED. It hid the causal link the tool
exists to show: context length and model architecture drive GPU count, and a user
who must navigate between screens to change one and read the other cannot see that
they are the same fact. Everything is on one screen and the right column recomputes
as you type (debounced ~220 ms); the Recalculate button remains only for an explicit
re-pull of live prices, never as the thing that makes the answer correct.

**It is a calculator, not an essay.** Attribution is not narrative: every number
keeps its click-through provenance popover, and the tags (`exact`, `estimated`,
`assumed`, `first_party`, `indicative`, `unknown`) stay. What goes is the prose
*around* the numbers.

**Usable without expertise (normative).** The audience includes people who do not
know what a KV head is. Therefore:

- The page LANDS on a complete worked example — a selected preset, a real model, a
  real accelerator — never an empty form. A blank form asks the user to supply the
  expertise they came to borrow.
- Every control carries a plain-language line saying what it does in the user's
  terms ("What must sit in memory", "How much history each request carries",
  "Halving this roughly doubles how many requests fit"). Section-level hints cover
  self-evident fields; jargon controls each carry their own.
- Engine vocabulary is translated at the render boundary. Routing keys render as
  sentences ("send your own GPUs first", not `local_first`); refusal codes render as
  causes ("this model does not fit on that accelerator", not
  `no_viable_configuration`). The raw keys survive in the provenance popover and the
  exported quote, which are the technical record.
- Expert controls stay reachable but DEMOTED into collapsed `Architecture detail`
  and `Service level, routing & overlay` sections. Demoted, never removed: the raw
  architecture is editable per LAYER GROUP — attention kind (full / sliding / linear
  / MLA), layer count, KV heads, head dim, tensors per layer, plus the window for a
  sliding group and the latent rank and RoPE dim for an MLA one — with a
  KV-bytes-per-token override as a separate expert shortcut.
- **The architecture editor is GENERATED from the selected preset's own groups, one
  block each — normative.** A single architecture dropdown would flatten a hybrid
  into whichever kind was picked, and a hybrid is exactly the case a flat model gets
  wrong (§6.6.1). A blank or unparseable field falls back to that group's preset
  value rather than propagating a refusal, because since §6.6.4 a refusal legitimately
  stops the comparison and a half-typed number must not.
- A mix that does not sum to 1 is refused (§2.4), so the refusal comes with a
  one-click remedy that says where the remainder went, rather than leaving the user
  to do the arithmetic they came here to avoid.

**Left rail (inputs).** *Start here* preset chips → *Who uses it* (user count,
sessions/user/day, working days, peak concurrency, per-stream speed floor §6.2) →
*What they do* (mix shares + per-turn token shapes) → **The model you'd run**
(§6.6: model, size, active size, context, weight precision, serving stack, serving
mode; collapsed: KV precision, concurrency cap, the per-group architecture editor,
KV-bytes override) → *Hardware &
prices* (owned accelerator, GPU count, measured tok/s override, rented provider +
accelerator + utilization, API price feed + model) → *Money* (capex, monthly opex;
collapsed: token budget, `required_p95_tok_s`, quote instant, routing policy,
overlay).

**Right column (answers), in order of what a buyer asks:**

1. **Verdict cards** — monthly total per option, cheapest marked, others showing the
   difference. Ranking compares EXACT values, never formatted strings.
2. **Fit & speed** (§6.6) — does it fit, and how fast: GPUs per replica, VRAM used
   vs usable, solved batch, per-stream tok/s, tokens/s per GPU, KV per request, and
   `batch_bound_by`. Every figure carries the roofline formula in its popover and the
   `assumed` tag. A configuration that does not serve renders its REASON and what to
   change, never a blank panel.
3. **Demand** — sessions, turns, tokens per month, peak tok/s, and the sized fleet
   with the basis it was solved from. **The stated basis and topology MUST name the
   input that actually sized the fleet, not the most detailed one available** — only
   the roofline path solves replicas, so a fleet sized from a measured figure or the
   v0.2 constant is stated as a flat count and labelled as such. Reporting replica
   topology for a fleet that was never solved in replicas is a provenance error at
   the exact point where a buyer decides which number to trust.
4. **Recommendation and payback** (§2.5), then per-option cost/month, cost-per-1M
   with `exact|estimated`, the **rented-GPU cross-provider table** — every provider
   priced for this load at its cheapest holding SKU, sized on its OWN accelerator AND
   the selected model so providers rank by delivered capacity rather than sticker
   rate, a provider that cannot be priced listed with its reason instead of dropped —
   p95 feasibility verdicts (`feasible|infeasible|unknown`, never "guarantee"), the
   TCO curve, the sensitivity table, and the quote export.

The freshness banner (§5.5) and any data gap sit at the top of the right column,
above the verdict, so a stale or unverifiable input is visible before the number it
affects is read.

**Naming contract (normative).** The strings `Lane`, `Lane A`, `Lane B` and `Lane C`
MUST NOT appear in any rendered surface or in the exported quote. The engine's
internal `A`/`B`/`C` keys are mapped to `self_hosted` / `model_api` / `rented_gpu`
at render and at export. §12.4's fixtures continue to address the engine keys
directly; that is the boundary, and it is one-directional.

UX rules: no number without a provenance popover; no estimate without its reason
list; stale or quarantined inputs are visible at the point of use, never hidden.

---

## 9. Client data contracts and payload budget

### 9.1 Objects

- `manifest.json` — always fetched: schema version, snapshot digest, per-source
  `SourceStatus` envelopes (§5.2), model index (identity §3.3, admitted meters,
  slice pointers), lane definition summaries.
- `slices/<digest>.json` — content-addressed, fetched LAZILY: per-feed/per-lane
  offer data; the client fetches only the slices its selected lanes/models need.

### 9.2 Byte budget (normative)

| Object | Ceiling (compressed) |
|---|---|
| `manifest.json` | ≤ 64 KB |
| one model slice | ≤ 8 KB |
| one feed slice | ≤ 256 KB |
| first-load total for the default lane view | ≤ 512 KB |

Rationale `[VERIFIED sizes at plan grounding]`: the LiteLLM cost map alone is
~1.8 MB and AWS per-service offer files reach hundreds of MB — so raw feeds are
NEVER shipped to the client. The pipeline pre-reduces them to in-scope SKUs/meters
and content-addresses the result; the budget above is the admission test for any
new feed or field set.

### 9.3 Versioning

Contracts are semver'd; an incompatible change bumps MAJOR; the client pins the
manifest version it loaded and refuses a mismatched major. A reverted publish (§5.3)
re-serves the prior digest with zero extra state.

---

## 10. Non-functional requirements

1. **Determinism:** identical workload + identical snapshot digest → byte-identical
   result JSON (canonical key order, decimal-string money math §3.5).
2. **Offline-capable:** once slices load, recomputation needs no network.
3. **Static delivery:** GitHub Pages only; no server-side computation; no third-party
   runtime CDN dependencies (repo convention: self-contained assets).
4. **Privacy:** no analytics, no tracking; nothing leaves the page.
5. **Performance:** first interactive ≤ 2 s on a mid-range device within the §9
   budget; recomputation ≤ 100 ms.
6. **Accessibility:** WCAG 2.1 AA baseline; keyboard-navigable; provenance popovers
   reachable and announced.
7. **Currency:** USD only in v0.1; non-USD feeds normalized at ingestion with the
   rate recorded in provenance.

---

## 11. Risk register

| # | Risk | Mitigation (normative ref) |
|---|---|---|
| R1 | Feed schema drift breaks pricing | Lenient rules §4.4; quarantine only meter-affecting unknowns; unknown keys logged |
| R2 | Actions schedule delay/drop/60-day disable freezes snapshot | Data-age freshness §5.2; keepalive §5.4; Actions-independent staleness check |
| R3 | Commit-on-change-only compounds R2 | Unconditional heartbeat commit §5.4 |
| R4 | Evidence sparsity leaves feasibility `unknown` | Honest `unknown` §6.4; partial matches as annotations only |
| R5 | GPU instance price volatility | Short feed TTLs (§5.1); STALE banner §5.5 |
| R6 | Payload bloat degrades the client | §9 byte budget as admission test; content-addressed slices |
| R7 | Client rates/margins leak into public surfaces | Publication boundary §7.3 |
| R8 | Dominated blend misleads the user | `dominated` flag with delta §2.2; never emitted as optimum |
| R9 | Tokenizer conversion drift silently corrupts estimates | `no_conversion` instead of 1:1 §4.1; factor provenance displayed |
| R10 | GCP API key exposure | Actions-secrets-only §5.6; absence of credentials in all artifacts |

---

## 12. Open decisions, roadmap, acceptance fixtures

### 12.1 Open decisions

- **O1.** Source and owner for `conv[]` tokenizer conversion factors (§4.1).
- **O2.** Per-feed TTL calibration — §5.1 defaults are `[ASSUMED]` until first
  ingestion measures drift.
- **O3.** Retire threshold `N_CONSECUTIVE` (default 3 `[ASSUMED]`, §3.4).
- **O4.** Evidence-row curation process — hand-curated in v0.1; pipeline deferred.
- **O5.** Public commercial-overlay placeholder rate card (generic, `assumed`).
- **O6.** ~~Lane C topology presets for v0.1~~ — **SETTLED in v0.2** by the §5.7
  generated registry; topology presets are no longer hand-maintained.
- **O7.** GCP `first_party` promotion — needs a Cloud Billing API key in the §5.6
  secret store; `indicative` until then (§5.7).
- **O8.** `tokens_s_per_gpu` defaults remain `[ASSUMED]` (§6.2) and still block a
  real `modelled_p95_capacity` verdict — same blocker as O4, now load-bearing for
  sizing as well as feasibility.

### 12.2 Phased roadmap

1. **P1 Ingestion:** ~~Actions workflow~~, snapshot format, SourceStatus envelopes,
   keepalive + staleness check (fixtures F5, F6). **v0.2:** the scheduled workflow
   was declined by the operator in favour of an operator-run refresh command, which
   also sidesteps the 60-day scheduled-workflow disable trap (§5.4) entirely.
2. **P2 Engine:** offer normalization (§3), quote semantics (§4), option math (§2)
   (fixtures F1–F4, F7, F9, F10). — **shipped**
3. **P3 Client:** manifest + slices + screens S1–S4 inside the §9 budget. — **shipped**
4. **P4 Throughput:** evidence store, `modelled_p95_capacity` (fixture F8). — open (O4/O8)
5. **P5 Overlay & polish:** §7 overlay, quote export, accessibility audit. — **shipped**
6. **P6 v0.2 rework:** session demand model (§2.4), payback in months (§2.5),
   per-second sizing (§6.2), GPU pricing registry (§5.7), naming contract (§8).
7. **P7 v0.3 serving model:** decode bandwidth roofline replacing the per-GPU
   constant, layer-group KV across four architectures, single-screen live
   recompute (§6.6, §8). — **shipped**
8. **P8 v0.4 preset ingestion:** `serving-models.json` regenerated from the Hugging
   Face Hub as stage 3/3 of `node scripts/refresh-pricing.mjs`, with an explicit
   layer-kind table, skip-rather-than-approximate refusals, and a 2% falsifier on
   every derived active-parameter count (§6.6.8). — **shipped.** The hand-curated
   list it replaces is the reason this phase exists: it aged silently while still
   rendering, which is the one failure mode a freshness banner cannot catch, because
   the banner reports when the FILE was written and not whether its CONTENTS are
   still the models anyone runs.

### 12.3 Verification rule

Every auto-update claim in this spec names a §5.1 endpoint verified at grounding;
every shipped default is labelled `measured` or `assumed`. Implementation phases may
not close while any acceptance fixture below fails.

### 12.4 Acceptance fixtures F1–F10 (NORMATIVE)

Each fixture is a test case the implementation MUST pass. Setup → action → expected.

- **F1 — No scalar collapse.** Setup: LiteLLM entry with `input_cost_per_token` and
  `input_cost_per_token_above_128k_tokens`. Action: quote a 200k-prompt request.
  Expected: both meters retained; the threshold meter applies; no merged scalar
  exists anywhere in the pipeline.
- **F2 — Unknown override skipped.** Setup: OpenRouter offer whose `pricing.overrides[]`
  contains one entry with an unrecognized condition field. Action: quote a default
  request. Expected: that entry skipped, top-level price applied, offer `active`,
  skip logged to provenance.
- **F3 — Unknown field tolerated.** Setup: LiteLLM entry with a new unknown
  top-level key. Action: ingest. Expected: offer `active`; key ignored and logged.
- **F4 — Meter-affecting unknown quarantines.** Setup: unknown suffix modifier
  attached to the only meter the quote would use. Action: ingest + quote. Expected:
  offer `quarantined` with reason preserved; lane reports the gap.
- **F5 — Stale envelope surfaces.** Setup: snapshot with a consumed source past
  `expires_at`. Action: render results. Expected: results shown under `STALE
  PRICING` banner listing the source.
- **F6 — Commit time is not freshness.** Setup: snapshot whose `observed_at` is
  expired but whose commit timestamp is recent. Action: freshness check. Expected:
  stale verdict — data age wins over commit time.
- **F7 — Capacity-constrained local_first.** Setup: §2.3 anchor (100M cap,
  $10,000/mo, 80M demand, advisory 70/30 blend). Action: compare. Expected: total
  $10,000 at the derived 100% local split; advisory blend flagged `dominated` with
  the $240 delta; the dominated blend is never emitted as the optimum.
- **F8 — Evidence mismatch yields unknown.** Setup: evidence rows only at
  concurrency 256, 128/128. Action: query concurrency 8, 8000/1000. Expected:
  `modelled_p95_capacity = unknown`, verdict `unknown`; the partial match appears,
  if at all, only as an annotation with mismatched dimensions listed.
- **F9 — Identity by canonical slug.** Setup: two offers sharing a display name but
  with distinct canonical slugs (and a display-name rename of one). Action: ingest.
  Expected: identities stay distinct; no merge, no fork.
- **F10 — Decimal exactness.** Setup: canonical money arithmetic battery (0.1+0.2
  class sums; token-count × per-token unit multiplications at scale). Action:
  compute. Expected: exact decimal equality; zero IEEE-754 artifacts.

An implementation passing F1–F10 honors this spec; one failing any fixture does not.