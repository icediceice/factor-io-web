#!/usr/bin/env node
// build-server-pricing.mjs — the enterprise server ACQUISITION price registry
// (SPEC §5.8). Stage 4/4 of scripts/refresh-pricing.mjs.
//
//   node scripts/build-server-pricing.mjs
//
// WHY THIS IS NOT A SCRAPER, unlike build-gpu-pricing.mjs.
// There is no free endpoint that returns an enterprise GPU-server price. AWS and
// Azure publish credential-free RENTAL price lists, which is what makes stage 1
// a genuine fetch. Nobody does the equivalent for hardware: Dell, HPE and
// Supermicro quote GPU servers through sales, and Supermicro's own store is
// configure-to-order with no public per-configuration figure. So there is no
// `first_party` tier in this registry and there cannot be one — see the seed's
// own note, which says the same thing at the point of use.
//
// WHAT THIS SCRIPT DOES INSTEAD. Every seed row carries the exact sentence its
// figure was read from. This script re-fetches each source page and proves that
// sentence is STILL THERE. That is a real, falsifiable check — it catches the
// failure that actually happens to cited prices, which is not the number going
// missing but the number quietly CHANGING while the citation keeps pointing at
// the page. A row whose quote no longer appears is emitted as citation_broken
// rather than dropped: the figure was true when observed, and deleting it would
// silently shrink the buyer's options, but shipping it unmarked would let a
// stale number wear a live citation.
//
// EXIT POLICY. Non-zero only when NO row verifies, which means the fetcher
// itself broke (network, UA block, a bad normalisation) rather than one blog
// having been edited. A single broken citation warns and still writes: making
// the whole refresh fail because one publisher reworded a sentence would train
// the operator to skip the refresh, which costs more freshness than it buys.
//
// Run: node scripts/build-server-pricing.mjs      (Node >= 20, no deps)
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const UA = "factor-io-tco-ingestion/1.0 (static-site pricing snapshot; contact admin@factor-io.com)";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_DIR = `${ROOT}tco-calculator/data/`;
const SEED_PATH = `${DATA_DIR}server-pricing-seed.json`;
const OUT_PATH = `${DATA_DIR}server-pricing.json`;
const FETCH_TIMEOUT_MS = 25000;

// ---------------------------------------------------------------- shape guard
class ShapeError extends Error {
  constructor(source, expected, observed) {
    super(`${source}: shape assertion failed — expected ${expected}; observed ${observed}`);
    this.name = "ShapeError";
    this.source = source;
  }
}
const describe = (v) => {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `array(${v.length})`;
  if (typeof v === "object") return `object keys=[${Object.keys(v).slice(0, 12).join(",")}]`;
  return `${typeof v} ${JSON.stringify(v).slice(0, 80)}`;
};
function mustShape(condition, source, expected, observed) {
  if (!condition) throw new ShapeError(source, expected, describe(observed));
}

// ------------------------------------------------------------- text normalise
// The quoted sentences live inside HTML tables, and how a table renders to text
// is not stable: the same row can serialise as "DGX H100~$290,000" (cells
// concatenated) or "DGX H100 ~$290,000" (cells space-separated) depending on the
// markup. Comparing with ALL whitespace removed makes the check independent of
// that, while still proving the label and its figure are adjacent on the page.
// Dash variants are folded too — publishers mix -, –, — and &ndash; freely, and
// a citation must not break because a CMS swapped a hyphen for an en dash.
const ENTITIES = {
  "&amp;": "&", "&nbsp;": " ", "&quot;": '"', "&#39;": "'", "&apos;": "'",
  "&lt;": "<", "&gt;": ">", "&ndash;": "-", "&mdash;": "-", "&#8211;": "-",
  "&#8212;": "-", "&#036;": "$", "&#36;": "$", "&dollar;": "$", "&#8217;": "'",
  "&rsquo;": "'", "&lsquo;": "'", "&hellip;": "...", "&#x27;": "'", "&#x2F;": "/",
};

function htmlToText(html) {
  let s = String(html);
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<[^>]+>/g, " ");
  for (const [ent, ch] of Object.entries(ENTITIES)) s = s.split(ent).join(ch);
  // Numeric entities not in the table above (e.g. &#8203; zero-width space).
  s = s.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
  });
  return s;
}

// Fold every Unicode dash/minus variant onto "-" so a hyphen and an en dash compare equal.
const foldDashes = (s) => s.replace(/[‐‑‒–—―−﹘﹣－]/g, "-");
// Zero-width and non-breaking spaces are invisible on the page but break a substring test.
const stripInvisible = (s) => s.replace(/[​‌‍⁠﻿]/g, "");
const despace = (s) => stripInvisible(foldDashes(String(s))).replace(/\s+/g, "");

async function fetchText(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: ctl.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ money guard
// Money is decimal STRINGS end to end (SPEC §3.5). A number here would put binary
// dust into a six-figure capex the moment it reached Dec.from, so the shape guard
// refuses one outright rather than coercing it.
const MONEY_RE = /^\d+(\.\d+)?$/;
function checkMoney(row, field) {
  const v = row[field];
  if (v === null || v === undefined) return; // a genuinely unpublished bound
  mustShape(typeof v === "string" && MONEY_RE.test(v), `${row.server_id}.${field}`, "a decimal money STRING (e.g. \"285000\")", v);
}

function checkBand(row) {
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const lo = num(row.usd_low), ty = num(row.usd_typical), hi = num(row.usd_high);
  mustShape(ty !== null, `${row.server_id}.usd_typical`, "a typical figure (it is what the UI pre-fills)", row.usd_typical);
  if (lo !== null) mustShape(lo <= ty, `${row.server_id}`, `usd_low <= usd_typical`, `${lo} > ${ty}`);
  if (hi !== null) mustShape(ty <= hi, `${row.server_id}`, `usd_typical <= usd_high`, `${ty} > ${hi}`);
}

async function main() {
  const seed = JSON.parse(await readFile(SEED_PATH, "utf8"));
  mustShape(Array.isArray(seed.rows) && seed.rows.length > 0, "server-pricing-seed.json", "a non-empty rows[]", seed.rows);

  for (const row of seed.rows) {
    for (const f of ["server_id", "label", "gpu_id", "form_factor", "confidence", "source_url", "quoted_text"]) {
      mustShape(typeof row[f] === "string" && row[f].length > 0, `${row.server_id ?? "<row>"}.${f}`, "a non-empty string", row[f]);
    }
    mustShape(Number.isInteger(row.gpu_count) && row.gpu_count > 0, `${row.server_id}.gpu_count`, "a positive integer GPU count", row.gpu_count);
    mustShape(row.confidence === "indicative", `${row.server_id}.confidence`, "\"indicative\" — no first_party tier exists for server hardware", row.confidence);
    for (const f of ["usd_low", "usd_typical", "usd_high"]) checkMoney(row, f);
    checkBand(row);
  }

  const ids = seed.rows.map((r) => r.server_id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  mustShape(dupes.length === 0, "server-pricing-seed.json", "unique server_id per row", `duplicates: ${[...new Set(dupes)].join(", ")}`);

  // One fetch per distinct URL, not per row: several rows cite the same guide,
  // and re-fetching it per row would be four hits on one publisher for no gain.
  const urls = [...new Set(seed.rows.map((r) => r.source_url))];
  const pages = new Map();
  for (const url of urls) {
    try {
      const html = await fetchText(url);
      pages.set(url, { ok: true, text: htmlToText(html), bytes: html.length });
      process.stdout.write(`  fetched  ${url} (${html.length} bytes)\n`);
    } catch (e) {
      pages.set(url, { ok: false, error: e.message });
      process.stdout.write(`  FAILED   ${url} — ${e.message}\n`);
    }
  }

  const checked_at = new Date().toISOString();
  const rows = seed.rows.map((row) => {
    const page = pages.get(row.source_url);
    let verification;
    if (!page.ok) {
      verification = { status: "unreachable", checked_at, detail: page.error };
    } else if (despace(page.text).includes(despace(row.quoted_text))) {
      verification = { status: "verified", checked_at, detail: null };
    } else {
      verification = {
        status: "citation_broken",
        checked_at,
        detail: `the quoted text is no longer present at ${row.source_url}; the figure was true when observed at ${row.observed_at} but its source has changed`,
      };
    }
    return { ...row, verification };
  });

  const verified = rows.filter((r) => r.verification.status === "verified");
  const broken = rows.filter((r) => r.verification.status === "citation_broken");
  const unreachable = rows.filter((r) => r.verification.status === "unreachable");

  // Group by accelerator so the client can answer "what can I buy for this GPU"
  // without walking every row. gpu_id keys match gpu-pricing.json exactly.
  const by_gpu = {};
  for (const r of rows) (by_gpu[r.gpu_id] ??= []).push(r.server_id);

  const doc = {
    schema: "factor-io.tco-server-pricing/1.0.0",
    generated_at: checked_at,
    note: seed.note,
    tiers: seed.tiers,
    disagreement_note: seed.disagreement_note,
    coverage_note: seed.coverage_note,
    verification_note: "Each row's `verification` records whether its quoted sentence was still present at source_url when this file was generated. verified = the citation holds. citation_broken = the page changed; the figure is retained with its original observed_at and MUST be rendered as unverified. unreachable = the fetch failed, which is a network fact about this run, not a judgement on the figure.",
    by_gpu,
    rows,
  };

  await writeFile(OUT_PATH, `${JSON.stringify(doc, null, 2)}\n`, "utf8");

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\n${pad("SERVER", 26)}${pad("GPU", 8)}${pad("N", 4)}${pad("TYPICAL", 12)}CITATION`);
  for (const r of rows) {
    console.log(`${pad(r.server_id, 26)}${pad(r.gpu_id, 8)}${pad(r.gpu_count, 4)}${pad(`$${r.usd_typical}`, 12)}${r.verification.status}`);
  }
  console.log(`\nserver rows   ${rows.length} across ${Object.keys(by_gpu).length} accelerators (${Object.keys(by_gpu).join(", ")})`);
  console.log(`citations     ${verified.length} verified · ${broken.length} broken · ${unreachable.length} unreachable`);
  console.log(`wrote         ${OUT_PATH}`);

  if (broken.length) {
    console.warn(`\n⚠  ${broken.length} citation(s) no longer present at source: ${broken.map((r) => r.server_id).join(", ")}. The figures are RETAINED and flagged unverified — re-read the page and update the seed's quoted_text (or the figure) rather than deleting the row.`);
  }
  if (unreachable.length) {
    console.warn(`⚠  ${unreachable.length} source(s) unreachable this run: ${unreachable.map((r) => r.server_id).join(", ")}. That is a network fact about this run, not evidence the price moved.`);
  }
  if (verified.length === 0) {
    console.error(`\n✗ NO citation verified. That is a fetcher failure, not ${rows.length} publishers editing at once — check the UA, the network, or htmlToText/despace before trusting this output.`);
    process.exit(1);
  }
  console.log("\n✓ server pricing written.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});