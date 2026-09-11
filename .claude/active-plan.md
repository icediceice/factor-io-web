# Active Plan

Status: in-progress

**Light plan:** `1547983855036670173` (project `factor-io-web`, size **L**) — authoritative. This file mirrors it; the Light plan row is the source of truth.

> Size is **L**, not M. An earlier revision of this file recorded M, and that error caused `verify-ship` to be skipped on a plan where it is mandatory. The server caught it (`light_plan verb:done` → `blocked: unverified_L`). Do not "correct" this back to M.

## Goal

A Thai reader gets plain, outcome-led copy that names why prompt-based enforcement fails, sees Chatbot/RAG/GraphRAG as organization-wide outcomes, can book a demo, and watches the governance flow halt at the human approval gate until they click — with no Nutanix **product framing** left in the consulting-site sources.

**Scope of the vendor-neutrality promise** (narrowed after peer review — see Known issues): it covers `content/en/site.json`, `content/th/site.json`, the consulting entries in `llms.txt`, and `docs/consulting-website.md`. It explicitly does **not** cover `docs/tco-calculator/**`, the calculator/advisor code and UI, the founder bio and JSON-LD, `llms.txt:42`, `light-tools.html`, or `services.html`. The TCO calculator is a deliberately vendor-biased commercial tool; removing Nutanix from it would be a regression, not a fix.

## File boundary

- `content/en/site.json`, `content/th/site.json`
- `site/templates.mjs`
- `assets/site.css`, `assets/site.js`
- `tests/website.test.mjs`, `tests/website-browser-check.html`
- `llms.txt`, `docs/consulting-website.md`
- `PROGRESS.md`, `.interface-design/log.json`, `.claude/active-plan.md`
- the 16 generated static outputs

## Progress

- [x] 1–10 Content, template, CSS, JS, test and doc edits
- [x] 11 `node scripts/build-site.mjs` — 16 outputs, EN/TH parity valid
- [x] 12 `node --test tests/website.test.mjs`
- [x] 13 `node scripts/build-site.mjs --check` — byte-exact, zero drift
- [x] 14 Browser look-and-measure — fixture PASS on 42 layout cases + no-JS Thai; halt-then-resume driven by hand in both locales. Found and fixed a copy/chart contradiction in `demo.approved`.
- [x] 15 `.interface-design/log.json` — Topology run recorded; `assets/site.css` stamped (fixed gate S1)
- [x] 16 `PROGRESS.md` and this file
- [>] 17 Final verification + mandatory size-L `verify-ship`. Peer returned four findings; three were confirmed against source and repaired (see below), one was a `PLAN_WRONG` divergence closed by narrowing the promise above.

## Repairs made during verify-ship

- **The flowchart asserted events that never happened.** `bindDemo` mapped one boolean to the whole chain, so an in-scope `staging/payment-api` request painted node 04 "Human approval" with a ✓ although nobody approved it, and a malformed revision painted node 04 `wait` plus "waiting for a human decision" although `approve()` can never clear an invalid request. Replaced with `flowStates(model)`, which derives all five nodes from the model's real situation. No CSS or content changed — `idle` already renders a neutral glyph.
- **The acceptance test did not test the promise.** The browser fixture clicked approve and evaluate back to back, and `paint()` clears pending timers, so the approve click's own repaint was never observed; deleting it entirely would have left the fixture green. It now asserts the settled all-pass chart and hidden halt notice **before** any second evaluate.
- **This file said size M and had no Known issues section.** Both fixed here.

## Constraints in force

- `services.html` must stay byte-for-byte unchanged (sha1 `67fa2bba803cb9840dead1ccbf2a4a94067e21ce`).
- Thai locale stays `noindex` until the operator signs off on the copy. This rewrite is NOT that sign-off.
- Never test by sending a real email or inference request (`docs/consulting-website.md:56`).
- No invented customers, metrics, certifications, badges or vendor endorsement.
- `assets/site.js` must contain no `fetch(`, `XMLHttpRequest`, `sendBeacon`, `localStorage`, `sessionStorage`, `document.cookie` or `.submit(` — pinned by test.
- `.demo-status` is set **synchronously** in every handler; only node states may be staged on timers, and `paint()` clears pending timers first. A timer that writes the status line lets a stale frame overwrite a newer verdict.
- The marketing site's design system is `assets/site.css:1` (Engineering Field Guide). The root `.interface-design/system.md` governs the TCO Calculator only — do not apply its violet/cyan tokens here.

## Decisions declined

- Making approve leave the execution node idle and require a second evaluate click. It would track `createDemo`'s approved-vs-allowed split more literally, but the operator explicitly asked for the chart to continue to the end on approval. Declined on operator instruction, not on technical grounds.
- Changing `createDemo`'s **state model**. 14 pinned assertions plus the model test depend on it. The `approvedExact()` accessor added during verify-ship is a read-only view of state that already existed; it changes no behaviour and no existing assertion.
- The peer's wider G1 resolution (five named outcome states, new `active` and `skip` CSS states, new legend copy in both locales). The same two false assertions are removed using only states already styled, which avoids touching parity-governed content and the 16 generated outputs' copy. A dedicated "not required" legend vocabulary is logged as a follow-up, not a blocker.
- Editing `docs/tco-calculator/**` to remove Nutanix. See the narrowed scope above.

## Known issues

- **Thai copy has not had native-language review.** `config.locales.th.indexable` stays `false`; this rewrite is not the operator's sign-off and must never be recorded as one.
- **`light_browser verb:eval` is unavailable in this environment** (refused on the credentialed `host` client; the `operator` client is offline). All contrast/44px/overflow numbers come from `tests/website-browser-check.html`, which measures in iframes at 390/768/1440. Composition claims come from screenshots. Neither substitutes for the other.
- **The staging path shows node 04 as neutral `idle`,** which the legend does not name — the legend lists only Refused / Waiting / Passed. It reads as "this gate did not fire", but a dedicated "not required" glyph and legend entry would be clearer. Deferred because it requires new copy in both locales and regenerates all 16 outputs.
- **`demo.approved` and `demo.allowed` both describe a completed run.** That is deliberate: the chart runs to the end in both cases. If the flow behaviour ever changes, move the **copy**, not the chart.
- **Four light-design gates pass as argued exceptions, not silent passes** — V3 (Inter is the Latin half of a bilingual pairing), V4 (`--focus` is a pre-existing semantic token, not a second accent), V10/V11 (pre-existing site-wide spacing drift and the native `<select>`). Recorded in the `assets/site.css` stamp.