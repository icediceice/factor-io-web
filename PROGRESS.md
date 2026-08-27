# Project: factor-io-web

> Initialized: 2026-03-03 15:33
> Last updated: 2026-08-27 15:55 (light-tools page + SEO/AEO/GEO crawl layer shipped)

## Current Focus

AI inference TCO calculator: normative spec v0.1 written (docs/tco-calculator/SPEC.md + shareable spec-artifact.html); implementation phases P1–P5 pending per SPEC §12.2.

## Task Queue

Upcoming work in priority order:

- [ ] Define tech stack and scaffold project source code
- [ ] Once tech stack is known: run crawl4ai to scrape docs → upload to NotebookLM → add notebook ID to nlm/SKILL.md
- [ ] TCO calculator P1: pricing ingestion workflow + snapshot format per SPEC §5 (fixtures F5, F6)
- [ ] TCO calculator P2–P5 per SPEC §12.2 (engine, client, throughput evidence, overlay); settle open decisions O1–O6

## Tier Overrides

*(Populated by escalation events. Survives compaction — do not remove.)*

## Work Log

### 2026-08-27

#### 11:36 — TCO calculator normative spec v0.1 written
- **What:** Authored `docs/tco-calculator/SPEC.md` (plan 1542478190939996174): three comparison lanes (owned local, model API, rented GPU) with hybrid replaced by routing policies (local_first derived split, api_first+failover, fixed_split); capacity-constrained math so owned fixed cost is never double-charged (F7); TokenTariff|CharacterTariff|HourlyTariff union keyed by canonical slug with offer state machine and decimal-string arithmetic; quote semantics with request-instant predicate evaluation and per-feed lenient unknown-field rules (blanket quarantine rejected); verified feed registry (AWS Bulk, Azure Retail, GCP Catalog, LiteLLM, OpenRouter) with SourceStatus freshness envelope, git-primitive publish, keepalive commit + Actions-independent staleness check against the 60-day auto-disable trap; evidence-gated throughput (required_p95_tok_s SLO vs modelled_p95_capacity, unknown-not-fabricated); commercial overlay itemized after lane math; payload byte budget; normative acceptance fixtures F1–F10. Published shareable artifact page `spec-artifact.html` (renders sibling SPEC.md, zero CDN dependencies, no confidential figures per §7.3). End-to-end verify pass caught and fixed four unlabelled shipped defaults (feed TTLs, N_CONSECUTIVE, rounding precision).
- **Files:** docs/tco-calculator/SPEC.md (new), docs/tco-calculator/spec-artifact.html (new), PROGRESS.md
- **Next:** P1 implementation (Actions ingestion + snapshot format, fixtures F5/F6); settle open decisions O1–O6 in SPEC §12.1
- **Known issues:** spec-artifact.html requires HTTP serving (fetches sibling SPEC.md — no file:// support); SPEC §5.1 TTL defaults and §6.5 seed throughput figures (11,200/3,400 tok/s) are labelled [ASSUMED] pending calibration/verification


### 2026-08-20

#### 14:24 — Generalized Privacy Statement live (Cat Countdown first)
- **What:** Added `privacy.html` — generalized Factor IO Privacy Statement covering Cat Countdown (Android + iPhone, launching soon): no advertising, no data collection, data leaves the device only when the user opts into cloud backup (Google Drive on Android, iCloud on iPhone). Footer links added in `index.html` bundle template and noscript fallback. Verified with headless Chromium render: bundle unpacks, both links present, privacy.html serves HTTP 200.
- **Files:** privacy.html (new), index.html, PROGRESS.md
- **Next:** Submit studio.factor-io.com/privacy.html to Google Play Console + App Store Connect at launch; confirm iOS backup backend (policy currently says iCloud)
- **Known issues:** iPhone statement says iCloud backup — iOS backup implementation not finalized (one-line fix if it ships as Google Drive instead); bundle content hand-edited inside JSON-encoded template (no bundler tool in this repo)

### 2026-03-03

#### 19:59 — Scaffold re-init: skill subdirectory migration
- **What:** Re-ran project-init. Migrated skills from flat files (`.claude/skills/active-plan.md`) to subdirectory structure (`.claude/skills/active-plan/SKILL.md`). Added `nlm` skill (previously missing). Created `.gitignore` with active-plan.md exclusion. All placeholders replaced.
- **Files:** .claude/skills/**/SKILL.md (6 skills), .gitignore, PROGRESS.md
- **Next:** Awaiting first task or NotebookLM setup
- **Known issues:** NotebookLM notebook ID not yet configured in nlm/SKILL.md

#### 15:33 — Workflow discipline applied (initial)
- **What:** Project initialized with EDCR scaffold. Phase files, references, and templates deployed to `.claude/`.
- **Files:** CLAUDE.md, PROGRESS.md, .geminiignore, .claude/ (references, templates, history, hooks)
- **Next:** Awaiting first task or NotebookLM setup
- **Known issues:** No known issues
