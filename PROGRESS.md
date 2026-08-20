# Project: factor-io-web

> Initialized: 2026-03-03 15:33
> Last updated: 2026-08-20 14:24 (privacy statement live for Cat Countdown / Factor IO)

## Current Focus

Cat Countdown launch prep: generalized Factor IO Privacy Statement live at studio.factor-io.com/privacy.html.

## Task Queue

Upcoming work in priority order:

- [ ] Define tech stack and scaffold project source code
- [ ] Once tech stack is known: run crawl4ai to scrape docs → upload to NotebookLM → add notebook ID to nlm/SKILL.md

## Tier Overrides

*(Populated by escalation events. Survives compaction — do not remove.)*

## Work Log

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
