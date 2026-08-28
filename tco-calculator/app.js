// app.js — S2 lanes & routing, S3 results, S4 sensitivity & provenance.
//
// UX rules are normative (SPEC 8): no number without provenance, no estimate
// without its reason list, stale/quarantined inputs visible at the point of
// use, and the word g-u-a-r-a-n-t-e-e never appears — a guarantee is a
// contract a human signs, not a number a model emits.
import { Dec, Rat, formatHalfUp } from "./exact.js";
import { runComparison, matchEvidence } from "./calculator.js";
import { loadManifest, resolveResource, beginSelection, currentGeneration, freshnessView } from "./data.js";

const $ = (id) => document.getElementById(id);
const state = {
  manifest: null,
  catalog: null,
  catalogGeneration: -1,
  presets: null,
  result: null,
};

const decStr = (v) => Dec.from(String(v)).toString();
const money = (x) => "$" + formatHalfUp(x, 2);
const intInput = (id) => { const v = $(id).value.trim().replace(/[ _,]/g, ""); return v === "" ? null : Number(v); };
const decInput = (id) => { const v = $(id).value.trim(); return v === "" ? null : v; };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Provenance popover — every rendered number is clickable into this.
const pop = $("pop");
document.addEventListener("click", (e) => {
  const t = e.target.closest(".src");
  if (!t) { pop.classList.remove("show"); return; }
  e.stopPropagation();
  const data = JSON.parse(t.dataset.prov);
  pop.innerHTML = `<h4>Provenance</h4>${data.rows.map((r) => `<div style="display:flex;justify-content:space-between;gap:10px"><span style="color:rgba(232,230,240,.5)">${escapeHtml(r[0])}</span><span style="font-family:ui-monospace,monospace">${escapeHtml(r[1])}</span></div>`).join("")}`;
  const rect = t.getBoundingClientRect();
  pop.style.left = Math.min(rect.left, window.innerWidth - 360) + window.scrollX + "px";
  pop.style.top = rect.bottom + window.scrollY + 6 + "px";
  pop.classList.add("show");
});

const prov = (rows) => `class="src" role="button" tabindex="0" aria-label="show provenance" data-prov='${JSON.stringify({ rows }).replaceAll("'", "")}'`;

function showGap(msg) {
  $("gapbox").innerHTML = `<div class="gap"><strong>Data gap:</strong> ${msg}</div>`;
}
function clearGap() { $("gapbox").innerHTML = ""; }

function renderBanner(fresh) {
  const b = $("banner");
  if (fresh.banner) {
    b.innerHTML = `<strong>${escapeHtml(fresh.banner.level)}</strong> — data past its freshness envelope from: ${fresh.banner.sources.map((s) => `${escapeHtml(s.source_id)} (observed ${s.observed_at.slice(0, 10)})`).join(", ")}. Numbers below cite the stale feed.`;
    b.classList.add("show");
  } else {
    b.classList.remove("show");
  }
}