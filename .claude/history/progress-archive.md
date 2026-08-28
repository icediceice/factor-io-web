# Progress Archive

*Older session entries are stored here. This file is NOT auto-loaded.*
*Read only when explicitly asked: "show session history" or "what happened last week".*
*Entries are appended newest-at-bottom during PROGRESS.md compaction.*

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

### 2026-08-27

#### 15:55 — light-tools page live + site-wide SEO/AEO/GEO crawl layer
- **What:** Root-caused the real discoverability problem first: `index.html` is a self-unpacking bundler export, so the entire page *and every SEO tag* lived JSON-encoded inside `__bundler/template` and materialized only after JS ran. Non-JS AI crawlers (GPTBot, ClaudeBot, Claude-SearchBot, OAI-SearchBot, PerplexityBot) were seeing a `<title>` and a 4-sentence `<noscript>` stub — near-zero AEO/GEO surface. Fixes: (1) new `robots.txt` explicitly allowing the named OpenAI/Anthropic/Google/Perplexity/Apple/Meta bots + `Sitemap:`; (2) `sitemap.xml`; (3) `llms.txt` as a cheap hedge (grounded: AI crawlers overwhelmingly skip it, ~10% adoption, no provider commitment — shipped because Lighthouse 13.3 audits it, not as strategy); (4) new `light-tools.html`, a static zero-JS page built to a two-reading-depths contract — hero hook for humans, a self-contained What-it-is / Who-it-for / When-NOT-to-use block for LLM extraction — with SoftwareApplication + SoftwareSourceCode + FAQPage(11 Q) + BreadcrumbList JSON-LD; (5) `index.html` outer head now carries description/canonical/viewport/robots/og/twitter + Organization+WebSite+Person+SoftwareApplication JSON-LD, and the invalid `<div>`-inside-`<noscript>`-in-`<head>` was replaced by a real crawlable content block in `<body>`; (6) founder named site-wide — Thanat Manasakool, Founder & Principal Engineer — wired as `Organization.founder` and as `author` on the light-tools source, with LinkedIn + GitHub `sameAs`.
- **Files:** robots.txt (new), sitemap.xml (new), llms.txt (new), light-tools.html (new), index.html, privacy.html, PROGRESS.md
- **How the template was edited:** hand-escaping `/` and `\"` into the 1MB single-line JSON string failed three times; the reliable route is a Node parse → plain-string replace → `JSON.stringify` pass, then re-escaping the `/` of every closing tag as its JSON unicode escape (U+002F, written as a backslash-u sequence) before writing it back, so the template stores a nested closing script tag slash-escaped. That escape is load-bearing — see the actual bytes on `index.html:491`, the only line in the file that carries them — without it a nested `</script>` closes the outer script tag early and blanks the homepage. Each replacement must assert its anchor occurs exactly once, and the encode step must prove the JSON round-trip before writing. The patch and validation scripts were session-temporary under `/tmp` and are **not** retained in this repo — rebuild them from this description if you edit the template again.
- **Verified:** all four `__bundler/*` blocks still `JSON.parse`; every ld+json block on every page parses; all internal links resolve; sitemap locs all exist; homepage renders with the new nav item and light-tools card; section 04 shows the founder bio — ALL CHECKS PASSED under the throwaway checker described above. Live re-fetch with a `ClaudeBot` user-agent confirmed the homepage serves a 12,869-byte crawlable head region with all 14 expected markers and zero JSON-LD parse failures.
- **Peer verification (size-L verify-ship):** returned BLOCKED with 3 findings; all 3 confirmed against source and fixed in `3c664ed..0740dad`. (1) The hero stat strip split "84% ... lower bound" from a bare "319K tool calls measured", and the 6.7 GB / 12.0× sentence inherited its caveat from the preceding paragraph — both violate this plan's numbers-weld-to-caveats contract, since retrieval pulls chunks and would quote the figure without the limit. The 84% and 319K pills are now one self-contained pill carrying the 36.8%/15.2% instrumentation limits. (2) The promised human path to the npm package existed only as the non-visible JSON-LD `downloadUrl`, so `npm` in the install section is now a real anchor. (3) This log itself pointed at two `scratchpad/` scripts that live under `/tmp` and are not in the repo, and recorded the closing-tag escape as a no-op — both corrected above. Live re-fetch confirms all three shipped (13,371 B, was 13,152).
- **Next:** submit sitemap to Google Search Console + Bing Webmaster Tools; TCO calculator P1 per SPEC §12.2
- **Known issues:** `og-image.png` and `logo.png` are referenced by the bundle template's og:image and Organization.logo but do not exist in the repo — both 404 (pre-existing, logged as a todo, deliberately not fixed here as it needs image generation). The new pages omit `og:image` rather than point at a 404, so link previews will be text-only until those assets exist. Founder name "Thanat Manasakool" was derived from the LinkedIn profile slug, not confirmed against the profile itself (LinkedIn blocks anonymous fetches) — verify spelling.

#### 11:36 — TCO calculator normative spec v0.1 written
- **What:** Authored `docs/tco-calculator/SPEC.md` (plan 1542478190939996174): three comparison lanes (owned local, model API, rented GPU) with hybrid replaced by routing policies (local_first derived split, api_first+failover, fixed_split); capacity-constrained math so owned fixed cost is never double-charged (F7); TokenTariff|CharacterTariff|HourlyTariff union keyed by canonical slug with offer state machine and decimal-string arithmetic; quote semantics with request-instant predicate evaluation and per-feed lenient unknown-field rules (blanket quarantine rejected); verified feed registry (AWS Bulk, Azure Retail, GCP Catalog, LiteLLM, OpenRouter) with SourceStatus freshness envelope, git-primitive publish, keepalive commit + Actions-independent staleness check against the 60-day auto-disable trap; evidence-gated throughput (required_p95_tok_s SLO vs modelled_p95_capacity, unknown-not-fabricated); commercial overlay itemized after lane math; payload byte budget; normative acceptance fixtures F1–F10. Published shareable artifact page `spec-artifact.html` (renders sibling SPEC.md, zero CDN dependencies, no confidential figures per §7.3). End-to-end verify pass caught and fixed four unlabelled shipped defaults (feed TTLs, N_CONSECUTIVE, rounding precision).
- **Files:** docs/tco-calculator/SPEC.md (new), docs/tco-calculator/spec-artifact.html (new), PROGRESS.md
- **Next:** P1 implementation (Actions ingestion + snapshot format, fixtures F5/F6); settle open decisions O1–O6 in SPEC §12.1
- **Known issues:** spec-artifact.html requires HTTP serving (fetches sibling SPEC.md — no file:// support); SPEC §5.1 TTL defaults and §6.5 seed throughput figures (11,200/3,400 tok/s) are labelled [ASSUMED] pending calibration/verification
