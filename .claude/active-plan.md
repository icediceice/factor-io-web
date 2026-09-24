# Active Plan

Status: completed

**Light plan:** `local:239eb3a3caded51ef48d467656b8e951` (project `factor-io-web`, size **M**) — authoritative. This file mirrors it; the Light plan row is the source of truth.

## Goal

Redo the Thai translation across content/th/site.json from English source using deep semantic understanding and natural executive-level Thai phrasing without machine-translation artifacts, preserving schema parity and compliance.

## File boundary

- `content/th/site.json`
- `PROGRESS.md`, `.claude/active-plan.md`
- the 12 generated static outputs

## Completed Steps

1. [x] Step 1: Semantic Thai translation redo from English across all sections in `content/th/site.json`, applying idiomatic native executive phrasing, eliminating translationese, and preserving 100% schema parity and legal registered particulars.
2. [x] Step 2: Built static outputs (`node scripts/build-site.mjs`), verified zero drift (`--check`), ran complete test suite (`node --test tests/website.test.mjs` — 31/31 passing), and updated progress logs.
