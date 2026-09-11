# Active Plan

Status: in-progress

**Light plan:** `1547983855036670173` (project `factor-io-web`, size M) — authoritative. This file mirrors it; the Light plan row is the source of truth.

## Goal

A Thai reader gets plain, outcome-led copy that names why prompt-based enforcement fails, sees Chatbot/RAG/GraphRAG as organization-wide outcomes, can book a demo, and watches the governance flow halt at the human approval gate until they click — with no Nutanix product framing left in `content/`, `llms.txt` or `docs/`.

## File boundary

- `content/en/site.json`, `content/th/site.json`
- `site/templates.mjs`
- `assets/site.css`, `assets/site.js`
- `tests/website.test.mjs`, `tests/website-browser-check.html`
- `llms.txt`, `docs/consulting-website.md`
- `PROGRESS.md`, `.interface-design/log.json`, `.claude/active-plan.md`

## Progress

- [x] 1–10 Content, template, CSS, JS, test and doc edits
- [x] 11 `node scripts/build-site.mjs` — 16 outputs, EN/TH parity valid
- [x] 12 `node --test tests/website.test.mjs` — 31/31 pass
- [x] 13 `node scripts/build-site.mjs --check` — byte-exact, zero drift
- [x] 14 Browser look-and-measure — fixture PASS on 42 layout cases + no-JS Thai; halt-then-resume driven by hand and confirmed in markup and screenshot. Found and fixed a copy/chart contradiction in `demo.approved` (both locales), then re-ran 11–13 green.
- [x] 15 `.interface-design/log.json` — Topology run recorded; `assets/site.css` stamped (this fixed gate S1)
- [>] 16 `PROGRESS.md` and this file
- [ ] 17 Final outcome verification, then `light_plan verb:done` → `Skill("commit-and-log")`

## Constraints in force

- `services.html` must stay byte-for-byte unchanged (sha1 `67fa2bba803cb9840dead1ccbf2a4a94067e21ce`).
- Thai locale stays `noindex` until the operator signs off on the copy. This rewrite is NOT that sign-off.
- Never test by sending a real email or inference request (`docs/consulting-website.md:54`).
- No invented customers, metrics, certifications, badges or vendor endorsement.
- `assets/site.js` must contain no `fetch(`, `XMLHttpRequest`, `sendBeacon`, `localStorage`, `sessionStorage`, `document.cookie` or `.submit(` — pinned by test.
- The marketing site's design system is `assets/site.css:1` (Engineering Field Guide). The root `.interface-design/system.md` governs the TCO Calculator only — do not apply its violet/cyan tokens here.

## Decisions declined

- Making approve leave the execution node idle and require a second evaluate click. It would track `createDemo`'s approved-vs-allowed split more literally, but the operator explicitly asked for the chart to continue to the end on approval. Declined on operator instruction, not on technical grounds.
- Editing `createDemo`. Its state model is correct and 14 pinned assertions plus test 23 depend on it; only human-readable status copy was changed.