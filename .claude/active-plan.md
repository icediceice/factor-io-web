# Active Plan: Create dedicated Cat Countdown landing page and catcountdown.factor-io.com launch preparation

Status: completed

**Light plan:** `local:118228f5a501034d7bce4d83fe33e58f` (project `factor-io-web`, size **M**) — authoritative. This file mirrors it; the Light plan row is the source of truth.

## Goal

Create a dedicated Cat Countdown landing page (`cat-countdown.html`) prepared for `catcountdown.factor-io.com` with a live Android release link (`https://play.google.com/store/apps/details?id=com.catcountdown.cat_countdown`), an iPhone release stub (`<button type="button" data-store="ios" data-stub="true" disabled>`), a `/catcountdown/` redirect stub, and non-live deployment configuration files under `catcountdown/deploy/`.

## File boundary

- `cat-countdown.html`
- `catcountdown/index.html`
- `catcountdown/deploy/nginx-catcountdown.conf`
- `catcountdown/deploy/cloudflared-catcountdown.yml`
- `catcountdown/deploy/README.md`
- `.interface-design/log.json`
- `tests/website.test.mjs`
- `PROGRESS.md`
- `.claude/active-plan.md`

## Completed Steps

1. [x] Step 1: Author standalone `cat-countdown.html`, redirect stub `catcountdown/index.html`, and record design entry in `.interface-design/log.json`
2. [x] Step 2: Create non-live deployment preparation files (`catcountdown/deploy/nginx-catcountdown.conf`, `catcountdown/deploy/cloudflared-catcountdown.yml`, `catcountdown/deploy/README.md`)
3. [x] Step 3: Verify rendered page in `light_browser` across desktop (`1919px`) and mobile (`390px`) in light and dark modes (`overflow: []`, `typeScale` <= 5 steps, `hierarchyRatio >= 1.42`, `brokenImages: []`, `iosDisabled: true`)
4. [x] Step 4: Extend `tests/website.test.mjs` and run `node --test tests/website.test.mjs` (43/43 passed) and `node scripts/build-site.mjs --check`
5. [x] Step 5: Complete cleanup sweep, update `PROGRESS.md` and `.claude/active-plan.md`, commit, push, KB write, and mark plan done
