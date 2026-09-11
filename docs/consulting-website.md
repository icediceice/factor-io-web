# Infrastructure-first consulting website

Approved brief: supplied “Governed Enterprise AI Consulting” specification, adapted by the operator's direction to lead with nearly 20 years in infrastructure and technical enablement of Thailand's leading SI partners. Marketing pages only; calculator/advisor functionality and the unlisted `services.html` deck are preserved.

## Editing and publishing

Edit explicit copy in `content/en/site.json` and `content/th/site.json`. Shared identity, contact, routes, editorial dates and locale indexing live in `site/config.mjs`; presentation lives in `site/templates.mjs` and `assets/site.css`. `assets/site.js` is progressive enhancement, never a content/translation dependency. No framework, dependencies, backend or build-service migration.

Run `node scripts/build-site.mjs`, then `node scripts/build-site.mjs --check` and `node --test tests/website.test.mjs`. Commit source and generated output together. Output is `en/index.html`, `en/<route>/index.html`, and matching Thai directories. Root is a complete English homepage canonical to `/en/`. Existing GitHub Pages serves committed bytes; `.nojekyll` selects plain static publication. Do not use the historical `scripts/patch-home.mjs` on generated HTML.

Dates are editorial source fields, never the build clock. Sitemap retains root, light-tools, calculator and privacy URLs. Root `#organization` and `#founder` JSON-LD identifiers remain stable for the calculator's cross-page references. The light-tools byline/schema must agree with config; tests pin that agreement. Missing legacy Open Graph bitmap paths are not emitted.

## Claims and language review

- “Nearly 20 years” and leading Thai SI enablement come from the operator's current prompt. Role history for Red Hat/Nutanix is inherited public site copy, not independently verified employment evidence. The old five-year duration is deliberately omitted under specification §24. No invented clients, metrics, certifications, badges or endorsement.
- Keep `Thanat Manasakool` in Latin script in both languages. An official Thai spelling has not been supplied.
- Thai copy is authored explicitly, not translated at runtime. Native-language review remains outstanding. The approved launch makes Thai publicly accessible and language-linked but `noindex`; this is not privacy. After the operator reviews/corrects all Thai copy, a separate scoped change sets `config.locales.th.indexable = true`, updates the editorial date, rebuilds and checks metadata/sitemap. Never record review as completed without the operator's sign-off.
- The old bilingual sales deck remains byte-for-byte unchanged, noindex and unlinked, with its own historical review/distribution decision intact. Historical progress entries are not rewritten to look current.

## Specification coverage

| Section | Implementation location |
| --- | --- |
| 1 Objective | Home, Services, infrastructure-led offer |
| 2 Core positioning | Home values and integration copy |
| 3 Reasoning versus execution | Platform lead, Governance |
| 4 Human-centered progression | Home and How We Work six-stage progression |
| 5 Homepage | Infrastructure hero, two CTAs, full semantic content |
| 6 Problem | Home `problem` |
| 7 Three values | Home `values` |
| 8 Four services | Services `ai-services`, plus infrastructure/SI engagements |
| 9 Continuous optimization | Services `optimization`, How We Work |
| 10 Exception-driven review | Home `exceptions`, Governance `review` |
| 11 Governance demo | Governance `demo`, shared demo copy and a local halting flowchart |
| 12 Architecture | Home topology, Platform `architecture` |
| 13 Data/reasoning philosophy | Platform `data` |
| 14 Model placement | Platform `models` |
| 15 Prompt is not enforcement | Platform `enforcement`, Home `problem` |
| 16 Engagement phases | How We Work `engagement` |
| 17 Differentiation | How We Work `operating-model`, Home values |
| 18 CTA | Shared CTA, Contact |
| 19 Navigation | Seven paired routes, always-visible language links |
| 20 Visual direction | Engineering Field Guide, native topology/flows, restrained ink/paper/teal |
| 21 Tone | Separate English/professional Thai copy, normal enterprise terminology |
| 22 Technical requirements | Static `.mjs` export, semantic HTML, progressive contact, metadata |
| 23 SEO | Per-language titles/descriptions/alternates, sitemap; Thai review hold disclosed |
| 24 Claims | Config/provenance rules above, no fabricated quantitative proof |
| 25 First impression | Infra/SI experience + integration + governed AI in hero and topology |

## Interaction contracts

The governance example is a simulation, not a deployed authority system or API. Trusted identity stays `workflow-agent-17`; staging authority permits only `restart` on the example staging target. Human simulation binds target, operation and revision; every input change invalidates it, including a change followed by a revert. Reset returns to denied production revision 182. Allowed does not claim a real action ran. Real deployments must verify/reconcile actual observed state.

The example is presented as a five-stage flowchart. An unapproved production request clears identity, is refused at the scope stage, and then HALTS at the human-approval stage: the chain does not advance to execution on its own, and a halt notice is revealed while it waits. Approving that exact revision advances the remaining stages. The chart is emphasis only — `assets/site.js` sets every `.demo-status` line synchronously inside the handler and stages only node states on timers, so a pending frame can never overwrite the verdict of a later interaction. Each stage carries its state as a glyph and a border weight as well as colour, so it survives greyscale and colour-blindness, and `prefers-reduced-motion` applies the identical end state with no staging. The chart is `aria-hidden`; `.demo-status` is the live region that announces every transition in words, and `.static-explanation` carries the whole argument with no JavaScript.

Prepare email retains a complete local, selectable/copyable draft. It does not send. A separate email-app link is available only when the entire encoded URI is at most 1800 characters; this conservative limit cannot guarantee mail-client behavior. Longer drafts are never truncated and remain copyable with a direct address. Input changes invalidate old drafts. No contact backend, persistence, analytics or background network. No-JS visitors have the direct email address. Never test by sending a real email or inference request.

## Verification

The existing Cloudflare edge obfuscates visible email addresses unless their anchors are surrounded by its documented `<!--email_off-->` / `<!--/email_off-->` comments. Keep those markers on generated, privacy and light-tools contact anchors: otherwise the direct no-JS path becomes an edge email-protection page. No hosting setting is changed. Published comparison permits only removal of these exact markers from the expected HTML; injected decoder scripts, rewritten addresses and every other byte difference still fail. Local export `--check` is always byte-exact.

`tests/website-browser-check.html` is a reproducible synthetic, public-but-noindex fixture, absent from site navigation and sitemap. It measures actual same-origin locale pages at 390/768/1440px, not reconstructed markup. Manual screenshot and keyboard/state inspection complement measurement. `node scripts/build-site.mjs --check-preview http://127.0.0.1:8781` must prove the pre-existing Python preview matches checkout bytes before browser evidence counts. Bounded node tests independently spawn and close the changed `scripts/serve.mjs` to verify directory-index and redirect semantics. After normal Pages publication, use `--check-preview https://studio.factor-io.com` and inspect both public locale homepages. Run existing `node --test tco-calculator/tests/*.test.mjs` for preserved consumer regression checks, without live inference.

Local validation on 2026-09-11: 27/27 website tests, 327/327 calculator regressions, all 42 browser layout/state cases, direct no-JS Thai governance, and the 23-route/asset preview byte comparison passed. Minimum measured text contrast was 5.46:1. EN/TH homepage screenshots were inspected and browser uncaught errors were zero. The fixture reads geometry after page/font readiness; it must not depend on requestAnimationFrame, which pauses in an inactive host tab. Publication and independent ship-review evidence belong to Light plan 1547876455281594451 and its reconciliation. Native Thai sign-off is not implied by technical tests.
