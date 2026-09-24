# Active Plan

Status: completed

**Light plan:** `local:8250a3def84414c4bb3527b7627c2055` (project `factor-io-web`, size **M**) — authoritative. This file mirrors it; the Light plan row is the source of truth.

## Goal

Transform factor-io-web into a full-viewport, slide-by-slide typographic presentation deck that clearly offers the complete enterprise bundle (Platform + Knowledge Governance + Private Local AI) with typographic discipline (no AI graphic slop), subtle ambient background texture, and an engagement-scoped quotation CTA.

## File boundary

- `assets/site.css`
- `assets/site.js`
- `assets/bg-ambient.png`
- `site/templates.mjs`
- `content/en/site.json`
- `content/th/site.json`
- `PROGRESS.md`, `.claude/active-plan.md`
- the 12 generated static outputs

## Completed Steps

1. [x] Step 1: Implement full-viewport slide-by-slide deck presentation and typographic UI in assets/site.css and assets/site.js (snap navigation, keyboard/touch/wheel control, typography-first layout, zero AI-slop graphics, ambient background texture)
2. [x] Step 2: Reword English content in content/en/site.json to emphasize the complete sovereign bundle (Platform + Knowledge/Governance + Local AI implementation) and engagement archetypes with engineer quotation CTA
3. [x] Step 3: Translate Thai content in content/th/site.json with strict structural parity to content/en/site.json
4. [x] Step 4: Execute build via scripts/build-site.mjs, verify all 12 generated static outputs, and run website test suite to ensure 100% pass (31/31 passed)
