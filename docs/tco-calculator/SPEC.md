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

### 6.2 Lane capacity and utilization math

- Lane A: user-declared `tokens/s` ceiling and monthly token budget; utilization =
  demand/capacity; TCO is flat up to capacity (per §2.3) so unit cost falls with
  utilization — this is what creates the breakeven against Lane B.
- Lane C: hourly cost amortized over `tokens/s × utilization × seconds`; unit cost
  is hyperbolic in utilization; breakeven vs Lane B is the utilization where
  `hourly/(throughput×util)` crosses the API per-token price.
- Lane B: no utilization economics; unit cost is the tariff itself (§3/§4).

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

---

## 8. UX and screen flow

```
S1 Workload  →  S2 Lanes & routing  →  S3 Results  ⇄  S4 Sensitivity & provenance
```

- **S1 Workload:** demand (tokens/mo, request count), shape distributions, unit
  basis + reference tokenizer (§4.1), `required_p95_tok_s` SLO.
- **S2 Lanes & routing:** Lane A fixed cost + capacity; routing policy selection
  (§2.2 — advisory blend input with `dominated` flag rendered inline); Lane C
  topology; Lane B model set. Changing the lane selection triggers slice fetches
  under the §9 budget.
- **S3 Results:** TCO curve over horizon; cost-per-1M per lane with `exact|estimated`
  labels; breakeven utilization; p95 feasibility verdicts (`feasible|infeasible|
  unknown`) — never the word "guarantee"; freshness banner (§5.5).
- **S4 Sensitivity & provenance:** sensitivity table over declared ranges; every
  number clickable into a provenance popover (source feed, `observed_at`, digest,
  exact/estimated reasons, evidence row if any); overlay toggle (infra-only /
  fully-loaded); quote export for consultants.

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
- **O3.** Retire threshold `N_CONSECUTIVE` (default 3, §3.4).
- **O4.** Evidence-row curation process — hand-curated in v0.1; pipeline deferred.
- **O5.** Public commercial-overlay placeholder rate card (generic, `assumed`).
- **O6.** Lane C topology presets for v0.1 (which GPU instances to pre-reduce).

### 12.2 Phased roadmap

1. **P1 Ingestion:** Actions workflow, snapshot format, SourceStatus envelopes,
   keepalive + staleness check (fixtures F5, F6).
2. **P2 Engine:** offer normalization (§3), quote semantics (§4), lane math (§2)
   (fixtures F1–F4, F7, F9, F10).
3. **P3 Client:** manifest + slices + screens S1–S4 inside the §9 budget.
4. **P4 Throughput:** evidence store, `modelled_p95_capacity` (fixture F8).
5. **P5 Overlay & polish:** §7 overlay, quote export, accessibility audit.

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