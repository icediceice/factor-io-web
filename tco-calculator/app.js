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

// ---------------------------------------------------------- snapshot loading
async function init() {
  // UTC hour selector: the quote instant is a DECLARED input (determinism),
  // never silently wall-clock.
  const sel = $("f-utc");
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  for (let h = 0; h < 24; h++) {
    const opt = document.createElement("option");
    const iso = `${today}T${String(h).padStart(2, "0")}:00:00Z`;
    opt.value = iso;
    opt.textContent = `${String(h).padStart(2, "0")}:00 UTC${h === now.getUTCHours() ? " (now)" : ""}`;
    sel.appendChild(opt);
  }
  sel.value = `${today}T${String(now.getUTCHours()).padStart(2, "0")}:00:00Z`;

  try {
    state.manifest = await loadManifest();
    renderBanner(freshnessView(state.manifest, Date.now()));
    await loadPresets();
    wireS2();
  } catch (e) {
    showGap(`the pricing snapshot could not be loaded (${escapeHtml(e.message)}). The calculator shows no numbers without its cited data.`);
    throw e;
  }
}

async function loadPresets() {
  const res = await fetch("./tco-calculator/data/lane-c-presets.json");
  state.presets = await res.json();
  const sel = $("fc-preset");
  sel.innerHTML = "";
  for (const p of state.presets.presets) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.label} — ${money(p.hourly_rate)}/hr (${p.rate_label})`;
    sel.appendChild(opt);
  }
  applyPreset();
  sel.addEventListener("change", applyPreset);
}

function applyPreset() {
  const p = state.presets.presets.find((x) => x.id === $("fc-preset").value);
  if (!p) return;
  $("fc-hourly").value = p.hourly_rate;
  $("fc-toks").value = p.assumed_tok_s_ceiling;
  $("fc-note").innerHTML = `rate <strong>${p.rate_label}</strong>: ${escapeHtml(p.rate_note)} · tok/s <strong>${p.tok_s_label}</strong> planning placeholder — <strong>not a benchmark</strong>; the throughput verdict stays unknown without real evidence.`;
}

// Lazy catalog fetch driven by lane/model selection — generation-guarded.
function wireS2() {
  $("fb-feed").addEventListener("change", () => fillModels(beginSelection()));
  $("run").addEventListener("click", run);
  fillModels(beginSelection());
}

async function fillModels(sel) {
  const g = sel.generation;
  $("fb-model").innerHTML = `<option value="">loading snapshot…</option>`;
  try {
    if (!state.catalog) {
      const cat = await resolveResource(state.manifest, "catalog", sel.signal);
      if (g !== currentGeneration()) return; // a newer selection superseded this fetch
      state.catalog = cat;
      state.catalogGeneration = g;
    }
  } catch (e) {
    if (g !== currentGeneration()) return;
    $("fb-model").innerHTML = `<option value="">unavailable</option>`;
    showGap(`model pricing could not be loaded after a bounded retry (${escapeHtml(e.message)}). Showing a gap, never stale prices.`);
    return;
  }
  const feed = $("fb-feed").value;
  const models = state.manifest.models.filter((m) => m.id.startsWith(`${feed}:`) && m.state !== "quarantined");
  const byName = [...models].sort((a, b) => a.name.localeCompare(b.name));
  $("fb-model").innerHTML = byName.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join("");
  const cur = byName.find((m) => /gpt-4o/.test(m.id)) ?? byName.find((m) => /claude/.test(m.id)) ?? byName[0];
  if (cur) $("fb-model").value = cur.id;
  $("fb-model-note").textContent = `${models.length} models · snapshot ${state.manifest.snapshot_digest} · generated ${state.manifest.generated_at}`;
}

// --------------------------------------------------------------------- run()
function run() {
  clearGap();
  try {
    const workload = {
      demand_tokens_mo: intInput("f-demand") ?? 0,
      request_count_mo: intInput("f-requests") ?? 0,
      prompt_tokens: intInput("f-prompt") ?? 0,
      output_tokens: intInput("f-output") ?? 0,
      cache_read_tokens_per_req: intInput("f-cache") ?? 0,
      horizon_months: intInput("f-horizon") ?? 1,
      required_p95_tok_s: intInput("f-p95"),
      quote_utc: Date.parse($("f-utc").value),
      now: Date.now(),
      time_buckets: null,
    };
    const days = intInput("fa-days");
    if (days && workload.demand_tokens_mo > 0) {
      workload.time_buckets = [{ hours: days * 24, tokens: workload.demand_tokens_mo }];
    }

    const laneA = {
      enabled: true,
      fixed_monthly: decInput("fa-fixed") ?? "0",
      monthly_token_budget: intInput("fa-budget"),
      tokens_s_ceiling: intInput("fa-rate"),
    };
    const laneB = { enabled: true, offer_ids: [$("fb-model").value].filter(Boolean) };
    const laneC = {
      enabled: true,
      tokens_s: intInput("fc-toks"),
      hourly_rate: decInput("fc-hourly") ?? "0",
      utilization: decInput("fc-util") ?? "0.7",
      hardware_topology: $("fc-preset").selectedOptions[0]?.textContent ?? null,
    };
    const routing = {
      policy: $("fr-policy").value,
      advisory_blend: { local_pct: intInput("fr-blend") ?? 70 },
      failover: { fallback: "A", share: decInput("fr-failshare") ?? "0", rate: decInput("fr-failrate") ?? "2" },
      pinned: { a_pct: 50, b_pct: 50 },
    };
    const overlay = {
      fully_loaded: $("fo-loaded").value === "loaded",
      components: [
        { name: "enterprise-licensing", basis: "monthly", amount: decInput("fo-license") ?? "0" },
        { name: "ai-consulting", basis: "monthly", amount: decInput("fo-consult") ?? "0" },
        { name: "implementation", basis: "one_time", amount: decInput("fo-impl") ?? "0" },
      ].filter((c) => Dec.from(c.amount).sign() > 0),
    };

    state.result = runComparison({ workload, catalog: state.catalog ?? { offers: {} }, laneA, laneB, laneC, routing, overlay, evidenceRows: [] });
    renderResults(state.result);
  } catch (e) {
    showGap(`the comparison could not run: ${escapeHtml(e.message)}`);
  }
}

const srcTag = (quote) => quote && quote.exact
  ? `<span class="tag tag-exact">exact</span>`
  : `<span class="tag tag-est">estimated</span>`;

function numProv(valueHtml, rows) {
  return `<span ${prov(rows)}>${valueHtml}</span>`;
}