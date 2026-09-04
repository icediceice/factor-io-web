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

// --------------------------------------------------------------- derived rows
// A `derived_component` row is not read off a page — it is CONSTRUCTED from a
// cited card price and a cited GPU cost-share. That makes it the only row shape
// in this registry whose number can be checked by arithmetic rather than by
// reading, so it IS checked: the seeded band must reproduce from the row's own
// stated inputs. A derived band that no longer reproduces is worse than a
// missing one, because its `derivation` block reads as an audit trail while
// pointing at a figure it does not actually produce.
const TIERS = ["indicative", "derived_component"];

// Half-up rounding to whole dollars on exact integers. Money never touches a JS
// float here (SPEC §3.5) — 5252000/70 is non-terminating in decimal, so the
// rounding rule has to be stated and applied identically on both sides of the
// assertion, not left to whatever the seeder happened to type.
const divRoundHalfUp = (num, den) => (2n * num + den) / (2n * den);

const SHARES = [
  ["usd_low", "gpu_share_high_pct"],   // a HIGH GPU share means a SMALL rest-of-build
  ["usd_typical", "gpu_share_typical_pct"],
  ["usd_high", "gpu_share_low_pct"],
];

function checkDerivation(row) {
  const d = row.derivation;
  mustShape(d && typeof d === "object", `${row.server_id}.derivation`, "a derivation block on every derived_component row", d);
  mustShape(d.method === "card_price_over_gpu_cost_share", `${row.server_id}.derivation.method`, "\"card_price_over_gpu_cost_share\" — the only method this builder can re-derive", d.method);
  mustShape(d.rounding === "half_up_whole_usd", `${row.server_id}.derivation.rounding`, "\"half_up_whole_usd\"", d.rounding);
  mustShape(MONEY_RE.test(String(d.card_usd)), `${row.server_id}.derivation.card_usd`, "a decimal money STRING", d.card_usd);
  mustShape(Number.isInteger(d.gpu_count) && d.gpu_count > 0, `${row.server_id}.derivation.gpu_count`, "a positive integer", d.gpu_count);
  mustShape(d.gpu_count === row.gpu_count, `${row.server_id}.derivation.gpu_count`, `the row's own gpu_count (${row.gpu_count})`, d.gpu_count);

  // Whole dollars only: a fractional card price would make the BigInt path below
  // silently wrong, and every card price this tier has seen is a whole figure.
  mustShape(/^\d+$/.test(String(d.card_usd)), `${row.server_id}.derivation.card_usd`, "whole dollars (no cents)", d.card_usd);
  const cards = BigInt(d.card_usd) * BigInt(d.gpu_count);
  mustShape(String(cards) === String(d.cards_usd), `${row.server_id}.derivation.cards_usd`, `card_usd × gpu_count = ${cards}`, d.cards_usd);

  for (const [field, shareKey] of SHARES) {
    const pct = d[shareKey];
    mustShape(Number.isInteger(pct) && pct > 0 && pct <= 100, `${row.server_id}.derivation.${shareKey}`, "an integer percentage in 1..100", pct);
    const expected = divRoundHalfUp(cards * 100n, BigInt(pct));
    mustShape(
      String(expected) === String(row[field]),
      `${row.server_id}.${field}`,
      `${cards} × 100 / ${pct} rounded half-up = ${expected}`,
      row[field],
    );
  }

  mustShape(
    d.gpu_share_low_pct <= d.gpu_share_typical_pct && d.gpu_share_typical_pct <= d.gpu_share_high_pct,
    `${row.server_id}.derivation`,
    "gpu_share_low_pct <= gpu_share_typical_pct <= gpu_share_high_pct",
    `${d.gpu_share_low_pct}/${d.gpu_share_typical_pct}/${d.gpu_share_high_pct}`,
  );

  // Every input the arithmetic above consumed must be citable, or the row is a
  // calculation wearing a citation. Two roles are mandatory because two figures
  // went in; a row citing only its card price hides the weaker of its inputs.
  const from = row.derived_from;
  mustShape(Array.isArray(from) && from.length >= 2, `${row.server_id}.derived_from`, "one citation per derivation input (>= 2)", from);
  for (const [i, c] of from.entries()) {
    for (const f of ["role", "source_url", "quoted_text", "observed_at"]) {
      mustShape(typeof c[f] === "string" && c[f].length > 0, `${row.server_id}.derived_from[${i}].${f}`, "a non-empty string", c[f]);
    }
  }
  const roles = from.map((c) => c.role);
  for (const required of ["card_price", "gpu_cost_share"]) {
    mustShape(roles.includes(required), `${row.server_id}.derived_from`, `a citation with role "${required}"`, roles.join(", "));
  }
}

/** Every URL a row's citations depend on — one for a published row, several for a derived one. */
const citationsOf = (row) => [
  { source_url: row.source_url, quoted_text: row.quoted_text, role: "primary" },
  ...(Array.isArray(row.derived_from) ? row.derived_from : []),
];

async function main() {
  const seed = JSON.parse(await readFile(SEED_PATH, "utf8"));
  mustShape(Array.isArray(seed.rows) && seed.rows.length > 0, "server-pricing-seed.json", "a non-empty rows[]", seed.rows);

  for (const row of seed.rows) {
    for (const f of ["server_id", "label", "gpu_id", "form_factor", "confidence", "source_url", "quoted_text"]) {
      mustShape(typeof row[f] === "string" && row[f].length > 0, `${row.server_id ?? "<row>"}.${f}`, "a non-empty string", row[f]);
    }
    mustShape(Number.isInteger(row.gpu_count) && row.gpu_count > 0, `${row.server_id}.gpu_count`, "a positive integer GPU count", row.gpu_count);
    mustShape(TIERS.includes(row.confidence), `${row.server_id}.confidence`, `one of ${TIERS.join(" | ")} — there is no first_party tier for server hardware`, row.confidence);
    for (const f of ["usd_low", "usd_typical", "usd_high"]) checkMoney(row, f);
    checkBand(row);
    if (row.confidence === "derived_component") checkDerivation(row);
  }

  const ids = seed.rows.map((r) => r.server_id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  mustShape(dupes.length === 0, "server-pricing-seed.json", "unique server_id per row", `duplicates: ${[...new Set(dupes)].join(", ")}`);

  // One fetch per distinct URL, not per row: several rows cite the same guide,
  // and re-fetching it per row would be four hits on one publisher for no gain.
  // A derived row depends on SEVERAL urls, so the sweep walks every citation a
  // row carries rather than its primary source_url alone — miss that and the
  // cost-share page is never fetched, and the weaker half of a derived band
  // silently never gets checked at all.
  const urls = [...new Set(seed.rows.flatMap((r) => citationsOf(r).map((c) => c.source_url)))];
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

  // Check ONE citation against the page it names.
  const checkCitation = (c, observedAt) => {
    const page = pages.get(c.source_url);
    if (!page.ok) return { role: c.role, source_url: c.source_url, status: "unreachable", detail: page.error };
    if (despace(page.text).includes(despace(c.quoted_text))) {
      return { role: c.role, source_url: c.source_url, status: "verified", detail: null };
    }
    return {
      role: c.role,
      source_url: c.source_url,
      status: "citation_broken",
      detail: `the quoted text is no longer present at ${c.source_url}; the figure was true when observed at ${observedAt} but its source has changed`,
    };
  };

  // A row is only as good as its WEAKEST citation. A derived band whose card
  // price still verifies but whose cost-share page has been rewritten is not a
  // verified row — half its arithmetic now rests on a sentence nobody can find.
  // citation_broken outranks unreachable because it is a claim about the SOURCE,
  // while unreachable is only a fact about this run.
  const RANK = { verified: 0, unreachable: 1, citation_broken: 2 };
  const weakest = (a, b) => (RANK[b.status] > RANK[a.status] ? b : a);

  const checked_at = new Date().toISOString();
  const rows = seed.rows.map((row) => {
    const citations = citationsOf(row).map((c) => checkCitation(c, row.observed_at));
    const worst = citations.reduce(weakest);
    const verification = {
      status: worst.status,
      checked_at,
      detail: worst.detail,
      // Per-citation results ship for derived rows so a reader can see WHICH
      // input broke. A single-citation row keeps the original flat shape.
      ...(citations.length > 1 ? { citations } : {}),
    };
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
    derived_component_note: seed.derived_component_note,
    coverage_note: seed.coverage_note,
    verification_note: "Each row's `verification` records whether its quoted sentence was still present at source_url when this file was generated. verified = the citation holds. citation_broken = the page changed; the figure is retained with its original observed_at and MUST be rendered as unverified. unreachable = the fetch failed, which is a network fact about this run, not a judgement on the figure. A `derived_component` row is checked against EVERY citation it carries and takes the WEAKEST result, with the per-input outcomes in `verification.citations` — so a row whose card price still verifies but whose cost-share sentence has moved reports broken, not verified. Those rows are ALSO re-derived at build time: the seeded band must reproduce from the row's own `derivation` inputs or the build fails outright, which is a stronger check than any citation test and the reason the tier is admissible at all.",
    by_gpu,
    rows,
  };

  await writeFile(OUT_PATH, `${JSON.stringify(doc, null, 2)}\n`, "utf8");

  const pad = (s, n) => String(s).padEnd(n);
  // Widths sized to the longest id actually in the registry — a derived row's
  // server_id and gpu_id are both far longer than an HGX row's, and the fixed
  // 26/8 columns ran them together into an unreadable table.
  const w = (f, min) => Math.max(min, ...rows.map((r) => String(r[f]).length)) + 2;
  const [wId, wGpu] = [w("server_id", 6), w("gpu_id", 3)];
  console.log(`\n${pad("SERVER", wId)}${pad("GPU", wGpu)}${pad("N", 4)}${pad("TYPICAL", 12)}CITATION`);
  for (const r of rows) {
    console.log(`${pad(r.server_id, wId)}${pad(r.gpu_id, wGpu)}${pad(r.gpu_count, 4)}${pad(`$${r.usd_typical}`, 12)}${r.verification.status}`);
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