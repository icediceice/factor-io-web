# Infrastructure-first consulting website

Approved brief: supplied “Governed Enterprise AI Consulting” specification, adapted by the operator's direction to lead with nearly 20 years in infrastructure and technical enablement of Thailand's leading SI partners. Marketing pages only; calculator/advisor functionality and the unlisted `services.html` deck are preserved.

**Repositioned 2026-09-18 — platform-first, AI as the named specialisation.** The site previously argued "Enterprise AI built for production" and listed Enterprise AI as service 01, which contradicted its own research input: `docs/service-offer-spec.md` §2.1 says the platform line LEADS, because "every AI conversation in an enterprise eventually becomes a Kubernetes conversation". On the operator's direction the practice is now stated as Kubernetes plus the infrastructure under it — a platform built to carry any enterprise workload, including ones not yet chosen — with AI named explicitly as the workload at the forefront today and the specialisation on top of it. Both halves are load-bearing and must stay distinguishable: the platform is the durability claim, AI is the specialisation claim, and collapsing either into the other undoes the change. This is a copy and ordering change only — no template, CSS or route was touched.

Three things carry it, and `tests/website.test.mjs` pins all three in both locales: the home hero (`Kubernetes, infrastructure, and the AI that runs on it.`), a `focus` statement section that is the FIRST home section and says the thing outright, and "Kubernetes and infrastructure" as item 0 of the four-service ledger on both Home and Services. **The ledger numerals 01–04 come from array position at `site/templates.mjs:102`, not from a field** — reordering the items IS the renumber, and nothing else in the file records the intended order, which is exactly why the invariant is now a test. The `focus` block is a `statement` kind deliberately: `site/templates.mjs:100` gates the item list on `s.items.length`, so a statement with `"items": []` renders as kicker + heading + body with no new template or CSS, and it stays off the shared `.ledger`/`.exceptions` index skeleton that a third kind would break.

Left alone on purpose: `site/config.mjs` `organizationDescription` already opens "Infrastructure engineering" and is byte-asserted against the JSON-LD in `light-tools.html` and `tco-calculator.html` by `tests/website.test.mjs`, so editing it for tone would pull two unrelated files into scope for no gain. `services.html` stays SHA-frozen. No route was renamed, so the six redirect stubs are untouched.

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

Four routes carry the whole specification: Home, Services, About, Contact. The ids below are the literal `sections[].id` values in `content/{en,th}/site.json` — read them there before assuming a location, because this table is prose and the JSON is the contract.

| Section | Implementation location |
| --- | --- |
| 1 Objective | Home hero; Services `offer` |
| 2 Core positioning | Home hero lede; Home `services` |
| 3 Reasoning versus execution | Services `architecture`, Services `governance` |
| 4 Human-centered progression | Home `process` |
| 5 Homepage | Home hero with the topology figure, two CTAs, full semantic content |
| 6 Problem | Home `production` (the opening question board) |
| 7 Three values | About `approach`; Home `services` |
| 8 Four services | Services `offer`; summarised on Home `services` |
| 9 Continuous optimization | Services `ongoing` |
| 10 Exception-driven review | Services `escalation` |
| 11 Governance demo | Services `governance`, shared demo copy and a local halting flowchart |
| 12 Architecture | Home hero topology; Services `architecture` |
| 13 Data/reasoning philosophy | Services `architecture`; the topology note; Knowledge systems in Services `offer` |
| 14 Model placement | Services `architecture` — model choice held separate from authority |
| 15 Prompt is not enforcement | Services `governance`; Home `production` |
| 16 Engagement phases | Home `engagement` (the two engagement routes); Home `process` |
| 17 Differentiation | Home `engagement`; About `independence` |
| 18 CTA | Shared CTA band, Contact `enquiry` |
| 19 Navigation | Four paired routes, always-visible language links |
| 20 Visual direction | Engineering Field Guide; the engagement split; native topology/flow figures; restrained ink/paper/teal |
| 21 Tone | Separate English/professional Thai copy, normal enterprise terminology |
| 22 Technical requirements | Static `.mjs` export, semantic HTML, progressive contact, metadata |
| 23 SEO | Per-language titles/descriptions/alternates, sitemap; Thai review hold disclosed |
| 24 Claims | Config/provenance rules above, no fabricated quantitative proof |
| 25 First impression | Home hero: infra/SI experience, integration and governed AI, with the topology figure |

### Retired routes

`/platform/`, `/governance/` and `/how-we-work/` were retired on 2026-09-17. Both language copies of each are kept as redirect stubs — `{en,th}/{platform,governance,how-we-work}/index.html` — carrying `noindex, follow`, a `rel=canonical` to the replacement, a zero-delay `meta http-equiv="refresh"`, and a visible link for anyone whose browser ignores it. Platform redirects to Services, Governance to `/services/#governance`, How We Work to Home.

These six files are **hand-written and are not generated by `scripts/build-site.mjs`**. No generator invariant covers them: `--check` compares only the 10 generated outputs and will not notice if a stub rots, so a route rename has to update them by hand. Do not delete them either — GitHub Pages serves committed bytes and offers no server-side redirect, so deleting a stub turns every existing inbound link into a 404.

## Interaction contracts

The approval illustration lives on Services at `#governance`; the retired `/governance/` route redirects to that exact anchor. The topology figure appears twice — in the Home hero, and again on Services at `#architecture` — from the single shared `topology` object in `content/{en,th}/site.json`, so editing it changes both.

The governance example is a simulation, not a deployed authority system or API. Trusted identity stays `workflow-agent-17`; staging authority permits only `restart` on the example staging target. Human simulation binds target, operation and revision; every input change invalidates it, including a change followed by a revert. Reset returns to denied production revision 182. Allowed does not claim a real action ran. Real deployments must verify/reconcile actual observed state.

The example is presented as a five-stage flowchart. An unapproved production request clears identity, is refused at the scope stage, and then HALTS at the human-approval stage: the chain does not advance to execution on its own, and a halt notice is revealed while it waits. Approving that exact revision advances the remaining stages. Every painted stage must describe something that actually happened, so the chain is derived from the model's real situation rather than from a single allow/deny bit: a request already inside the agent's authorized scope needs no human decision and leaves the human-approval stage neutral instead of ticking it, a malformed revision is refused at the request stage and never shows a human wait because no approval can clear it, and the human-approval stage is ticked only when a person actually approved that exact request. The chart is emphasis only — `assets/site.js` sets every `.demo-status` line synchronously inside the handler and stages only node states on timers, so a pending frame can never overwrite the verdict of a later interaction. Each stage carries its state as a glyph and a border weight as well as colour, so it survives greyscale and colour-blindness, and `prefers-reduced-motion` applies the identical end state with no staging. The chart is `aria-hidden`; `.demo-status` is the live region that announces every transition in words, and `.static-explanation` carries the whole argument with no JavaScript.

Contact is a LINE conversation, not a form. The contact page renders a QR figure plus a tappable `config.lineUrl` link, the LINE id as text, and the direct email address as a secondary channel inside its `<!--email_off-->` markers. A test asserts `config.lineUrl === https://line.me/ti/p/~${config.lineId}`, so the link and the displayed ID can never name different accounts. **That assertion does not extend to the QR image.** `line-qr.jpg` is an opaque operator-supplied asset and nothing in the suite decodes it, so whoever replaces that file must verify by eye that it encodes the same account — the tests will stay green either way. The QR lives in `assetNames` so it is content-hashed like the stylesheet: a replaced QR busts caches, because a stale one points at the wrong account. `contact()` receives the `asset()` helper threaded down from `renderPage` through `section()`, which is the only reason that parameter exists.

The contact layout emits three siblings in this DOM order: `.contact-aside` (heading and intro), `.line-card` (the LINE action, QR and id), then `.contact-fallback` (email and the privacy link). That order is the contract — the primary action must precede the secondary channel in reading and focus order, which is what a visitor on a phone meets first. The two-column desktop composition comes from named `grid-template-areas` on `.contact-layout`, never from reordering, so DOM order and visual order agree at every width. Do not reach for CSS `order` to rearrange this block: it would move the paint without moving focus.

The email-draft form was deleted on 2026-09-18, and with it `prepareMailDraft`, `copyDraft`, `MAILTO_LIMIT` and `bindContact` in `assets/site.js`, plus the five tests that covered draft encoding, the 1800-character URI fallback and clipboard denial. There is no contact backend, persistence, analytics or background network, and the contact page needs no JavaScript at all. `privacy.html#website-enquiries` must keep saying plainly that LINE is a third party carrying the message, which the old on-device draft deliberately avoided — that disclosure is the reason the section exists, not decoration.

## Verification

The existing Cloudflare edge obfuscates visible email addresses unless their anchors are surrounded by its documented `<!--email_off-->` / `<!--/email_off-->` comments. Keep those markers on generated, privacy and light-tools contact anchors: otherwise the direct no-JS path becomes an edge email-protection page. No hosting setting is changed. Published comparison permits only removal of these exact markers from the expected HTML; injected decoder scripts, rewritten addresses and every other byte difference still fail. Local export `--check` is always byte-exact.

`tests/website-browser-check.html` is a reproducible synthetic, public-but-noindex fixture, absent from site navigation and sitemap. It measures actual same-origin locale pages at 390/768/1440px, not reconstructed markup. Manual screenshot and keyboard/state inspection complement measurement. `node scripts/build-site.mjs --check-preview http://127.0.0.1:8781` must prove the pre-existing Python preview matches checkout bytes before browser evidence counts. Bounded node tests independently spawn and close the changed `scripts/serve.mjs` to verify directory-index and redirect semantics. After normal Pages publication, use `--check-preview https://studio.factor-io.com` and inspect both public locale homepages. Run existing `node --test tco-calculator/tests/*.test.mjs` for preserved consumer regression checks, without live inference.

Local validation on 2026-09-17, for the four-route rewrite: `node scripts/build-site.mjs` generated 10 static outputs with EN/TH parity valid; `node scripts/build-site.mjs --check` verified all 10 byte-identical to deterministic generation; `node --test tests/website.test.mjs` passed 26/26; the browser fixture passed all 24 layout/state cases at 390/768/1440 with minimum measured text contrast 5.46:1, no overflow and the direct no-JS Thai path intact. Not re-run in that session and therefore not evidence for the current tree: the 327 calculator regressions and the `--check-preview` byte comparison. The English homepage was inspected by screenshot; the Thai homepage was not. `light_browser verb:screenshot` succeeds only on the tab that is `active:true` on the Xvfb client, and three attempts against a background tab timed out at 30s, 30s and 45s, so every Thai claim here is a measurement and none of it is a look. The fixture reads geometry after page/font readiness; it must not depend on requestAnimationFrame, which pauses in an inactive host tab. Publication and independent ship-review evidence for the earlier seven-route site belong to Light plan 1547876455281594451 and its reconciliation; the four-route rewrite belongs to plan local:2723908ddd7331fb69c347ada73b1b63. Native Thai sign-off is not implied by technical tests.
