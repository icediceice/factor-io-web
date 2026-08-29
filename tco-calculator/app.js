// app.js — demand entry, option comparison, results, sensitivity & provenance.
//
// UX rules are normative (SPEC 8): no number without provenance, no estimate
// without its reason list, stale/quarantined inputs visible at the point of
// use, and the word g-u-a-r-a-n-t-e-e never appears — a guarantee is a
// contract a human signs, not a number a model emits.
//
// NAMING CONTRACT (SPEC 8, normative): the strings "Lane", "Lane A", "Lane B"
// and "Lane C" MUST NOT appear in any rendered surface or in the exported quote.
// The engine keeps its internal A/B/C keys — 14 fixture call sites bind them to
// the F1–F10 acceptance anchors — so the rename happens HERE, at the render and
// export boundary, through OPTION. Renaming the engine instead would rewrite
// those fixtures, and they are the regression net for the ×3600 dimensional bug.
import { Dec, Rat, formatHalfUp } from "./exact.js";
import { runComparison, matchEvidence, ratToDecExact, rentedGpuByProvider } from "./calculator.js";
import { loadManifest, resolveResource, beginSelection, currentGeneration, freshnessView } from "./data.js";
import { buildDemand, peakTokensPerSecond, gpusForLoad, validateMix, DemandRefusal, WORKLOAD_TYPES } from "./demand.js";

// The single place the engine's internal keys become user-facing names.
const OPTION = {
  A: { key: "self_hosted", label: "Self-hosted", color: "#B46EFF" },
  B: { key: "model_api", label: "Model API", color: "#22D3EE" },
  C: { key: "rented_gpu", label: "Rented GPU", color: "#34D399" },
};
const OPTION_KEYS = ["A", "B", "C"];

// Mix/shape field ids use `graphrag`; the engine's workload type is `graph_rag`.
const MIX_FIELD = { chat: "chat", rag: "rag", graph_rag: "graphrag", agentic: "agentic" };

const $ = (id) => document.getElementById(id);
const state = {
  manifest: null,
  catalog: null,
  catalogGeneration: -1,
  gpuPricing: null,
  workloadPresets: null,
  result: null,
  demand: null,
};

const money = (x) => {
  if (x === null || x === undefined) return "—";
  if (x instanceof Dec || x instanceof Rat) return "$" + formatHalfUp(x, 2);
  const s = String(x);
  const m = /^(-?\d+)\/(\d+)$/.exec(s); // non-terminating totals travel as reduced n/d
  if (m) return "$" + formatHalfUp(new Rat(BigInt(m[1]), BigInt(m[2])), 2);
  return "$" + formatHalfUp(Dec.from(s), 2);
};
const intInput = (id) => { const v = $(id).value.trim().replace(/[ _,]/g, ""); return v === "" ? null : Number(v); };
const decInput = (id) => { const v = $(id).value.trim(); return v === "" ? null : v; };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const groupInt = (s) => { const n = Number(s); return Number.isFinite(n) ? n.toLocaleString("en-US") : String(s); };

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
function numProv(valueHtml, rows) { return `<span ${prov(rows)}>${valueHtml}</span>`; }

function showGap(msg) { $("gapbox").innerHTML = `<div class="gap"><strong>Data gap:</strong> ${msg}</div>`; }
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
    await loadGpuPricing();
    wireInputs();
    await loadWorkloadPresets();
  } catch (e) {
    showGap(`the pricing snapshot could not be loaded (${escapeHtml(e.message)}). The calculator shows no numbers without its cited data.`);
    throw e;
  }
}

// ------------------------------------------------------- GPU pricing registry
// Populates BOTH the self-hosted accelerator picker (which needs the hardware
// identity) and the rented-GPU provider/accelerator pickers (which need the
// rate). Every rented rate renders its confidence tier at the point of use —
// an indicative aggregator figure is never displayed as if it were a vendor quote.
async function loadGpuPricing() {
  const res = await fetch("./tco-calculator/data/gpu-pricing.json");
  if (!res.ok) throw new Error(`gpu-pricing.json ${res.status}`);
  state.gpuPricing = await res.json();

  const gpus = state.gpuPricing.gpus ?? {};
  const seen = [...new Set(state.gpuPricing.rows.map((r) => r.gpu_id))].sort();
  $("f-sh-gpu").innerHTML = seen
    .map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(gpus[id]?.label ?? id)}</option>`)
    .join("");
  $("f-sh-gpu").value = seen.includes("h100") ? "h100" : seen[0];

  const provs = Object.entries(state.gpuPricing.providers ?? {})
    .sort((a, b) => (a[1].confidence === b[1].confidence ? a[1].label.localeCompare(b[1].label) : a[1].confidence === "first_party" ? -1 : 1));
  $("f-rent-provider").innerHTML = provs
    .map(([k, v]) => `<option value="${escapeHtml(k)}">${escapeHtml(v.label)} — ${escapeHtml(v.confidence)}</option>`)
    .join("");
  $("f-rent-provider").value = provs.find(([, v]) => v.confidence === "first_party")?.[0] ?? provs[0]?.[0];

  $("f-rent-provider").addEventListener("change", fillRentGpus);
  $("f-rent-gpu").addEventListener("change", renderRentNote);
  $("f-sh-gpu").addEventListener("change", refreshDerived);
  fillRentGpus();
}

// Option values are the registry ROW INDEX, never the gpu id. A provider
// routinely lists the same accelerator at several rates — different regions or
// instance families — and keying the option on gpu_id alone made every one of
// them resolve to the FIRST matching row: the user picked a $1.006 rate and was
// quoted $2.272791, silently. The sku is shown so the duplicates are tellable apart.
function fillRentGpus() {
  const p = $("f-rent-provider").value;
  const gpus = state.gpuPricing.gpus ?? {};
  const opts = state.gpuPricing.rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.provider === p);
  $("f-rent-gpu").innerHTML = opts
    .map(({ r, i }) => `<option value="${i}">${escapeHtml(gpus[r.gpu_id]?.label ?? r.gpu_id)} — $${r.gpu_hourly_usd}/GPU-hr · ${escapeHtml(r.sku)}</option>`)
    .join("");
  if (opts.length) $("f-rent-gpu").value = String(opts[0].i);
  renderRentNote();
}

function currentRentRow() {
  const v = $("f-rent-gpu").value;
  if (v === "") return null;
  const i = Number(v);
  const rows = state.gpuPricing?.rows ?? [];
  return Number.isInteger(i) && i >= 0 && i < rows.length ? rows[i] : null;
}

function renderRentNote() {
  const row = currentRentRow();
  if (!row) { $("f-rent-note").textContent = "no rate for this pairing"; return; }
  const tier = row.confidence === "first_party"
    ? `<span class="tag tag-exact">first-party</span> the vendor's own price list, fetched without credentials`
    : `<span class="tag tag-est">indicative</span> public aggregator — the vendor's own API is credential-gated, so this is an order-of-magnitude planning figure, not a quote`;
  const seeded = row.seeded ? " This row is <strong>seeded</strong> from a cited secondary source rather than fetched live." : "";
  const basis = row.source_basis ? ` ${escapeHtml(row.source_basis)}` : "";
  $("f-rent-note").innerHTML = `${escapeHtml(row.sku)} · $${row.gpu_hourly_usd}/GPU-hr · ${tier}.${seeded}${basis} Observed ${escapeHtml(String(row.observed_at).slice(0, 10))}.`;
}

// ------------------------------------------------- level 0: workload presets
// Presets are PLANNING ASSUMPTIONS, never measurements. Selecting one fills
// exactly the inputs a user would otherwise type; every field stays editable.
async function loadWorkloadPresets() {
  const res = await fetch("./tco-calculator/data/workload-presets.json");
  state.workloadPresets = await res.json();
  const wrap = $("preset-cards");
  wrap.innerHTML = state.workloadPresets.presets.map((p) => {
    const cls = p.assumption_label === "assumed" ? "tag-est" : "tag-unknown";
    return `<button type="button" class="preset" role="radio" aria-checked="false" data-preset="${escapeHtml(p.id)}">`
      + `<span class="p-name">${escapeHtml(p.label)}</span>`
      + `<span class="p-vol">${escapeHtml(p.fields["f-users"])} users<span class="tag ${cls}">${escapeHtml(p.assumption_label)}</span></span>`
      + `<span class="p-sum">${escapeHtml(p.summary)}</span></button>`;
  }).join("");
  for (const b of wrap.querySelectorAll(".preset")) {
    b.addEventListener("click", () => applyWorkloadPreset(b.dataset.preset));
  }
  applyWorkloadPreset(state.workloadPresets.presets[0].id);
}

function applyWorkloadPreset(id) {
  const p = state.workloadPresets.presets.find((x) => x.id === id);
  if (!p) return;
  for (const btn of $("preset-cards").querySelectorAll(".preset")) {
    btn.setAttribute("aria-checked", String(btn.dataset.preset === id));
  }
  // Per-workload token shapes come from the store's `defaults`, so a preset
  // changes WHO uses the system and in what mix, not what a turn costs.
  const shapes = state.workloadPresets.defaults?.shapes ?? {};
  for (const [type, field] of Object.entries(MIX_FIELD)) {
    const s = shapes[type];
    if (!s) continue;
    const set = (suffix, v) => { const el = $(`f-${field}-${suffix}`); if (el && v !== undefined) el.value = v; };
    set("turns", s.turns_per_session);
    set("in", s.in_tokens);
    set("out", s.out_tokens);
    set("cached", s.cached_tokens);
  }
  for (const [field, value] of Object.entries(p.fields ?? {})) {
    const el = $(field);
    if (el) el.value = value;
  }

  const pv = state.workloadPresets.provenance ?? {};
  const dated = pv.observed ? ` &middot; set ${escapeHtml(pv.observed)}, re-verify before ${escapeHtml(pv.re_verify_before)}` : "";
  $("preset-note").innerHTML = `<strong>${escapeHtml(p.label)}</strong> &mdash; every field is `
    + `<span class="tag ${p.assumption_label === "assumed" ? "tag-est" : "tag-unknown"}">${escapeHtml(p.assumption_label)}</span> `
    + `${escapeHtml(p.assumption_note)}${dated}. Change any number below.`;
  refreshDerived();
}

// ------------------------------------------------------------ input plumbing
function wireInputs() {
  $("fb-feed").addEventListener("change", () => fillModels(beginSelection()));
  $("run").addEventListener("click", run);
  const live = [
    "f-users", "f-sessions-day", "f-days",
    "f-mix-chat", "f-mix-rag", "f-mix-graphrag", "f-mix-agentic",
    "f-peak-frac", "f-tps-stream", "f-sh-tps-gpu",
    ...Object.values(MIX_FIELD).flatMap((f) => [`f-${f}-turns`, `f-${f}-in`, `f-${f}-out`, `f-${f}-cached`]),
  ];
  for (const id of live) $(id)?.addEventListener("input", refreshDerived);
  fillModels(beginSelection());
}

function readMix() {
  const mix = {};
  for (const [type, field] of Object.entries(MIX_FIELD)) mix[type] = decInput(`f-mix-${field}`) ?? "0";
  return mix;
}

function readShapes() {
  const shapes = {};
  for (const [type, field] of Object.entries(MIX_FIELD)) {
    shapes[type] = {
      turns_per_session: decInput(`f-${field}-turns`) ?? "0",
      in_tokens: decInput(`f-${field}-in`) ?? "0",
      out_tokens: decInput(`f-${field}-out`) ?? "0",
      cached_tokens: decInput(`f-${field}-cached`) ?? "0",
    };
  }
  return shapes;
}

// Build the demand model from the DOM. Throws DemandRefusal on bad input —
// callers render the refusal rather than substituting a guess.
// `usersOverride` lets a what-if scenario (the sensitivity grid) re-derive the
// WHOLE model at a different headcount rather than scaling the monthly total and
// leaving the fleet at its base size — see buildScenario.
function computeDemand(usersOverride = null) {
  const users = usersOverride ?? decInput("f-users");
  const demand = buildDemand({
    users,
    sessionsPerUserDay: decInput("f-sessions-day"),
    workingDaysMo: decInput("f-days"),
    mix: readMix(),
    shapes: readShapes(),
  });
  const peak = peakTokensPerSecond({
    users,
    peakConcurrencyFraction: decInput("f-peak-frac"),
    tokensPerSecondPerStream: decInput("f-tps-stream"),
  });
  const gpuId = $("f-sh-gpu").value;
  const sizing = gpusForLoad({
    peakTokensPerSecond: peak.peak_tokens_s.text,
    gpuId,
    tokensPerSecondPerGpu: decInput("f-sh-tps-gpu"),
  });
  return { demand, peak, sizing, gpuId };
}

// The live readout under the demand inputs. It must never show a number derived
// from an invalid mix — a refusal is displayed instead, in full.
function refreshDerived() {
  const mixCheck = validateMix(readMix());
  const sumEl = $("mix-sum");
  if (mixCheck.ok) {
    sumEl.innerHTML = `<span class="tag tag-exact">sums to 1</span>`;
  } else if (mixCheck.code === "mix_does_not_sum_to_one") {
    sumEl.innerHTML = `<span class="tag tag-est">sums to ${escapeHtml(mixCheck.sum_text)}</span>`;
  } else {
    sumEl.innerHTML = `<span class="tag tag-unknown">invalid</span>`;
  }

  try {
    const { demand, peak, sizing } = computeDemand();
    state.demand = { demand, peak, sizing };
    if (!$("f-sh-tps-gpu").value.trim()) $("f-sh-tps-gpu").placeholder = `${sizing.tokens_s_per_gpu.text} (assumed)`;
    $("f-sh-count-hint").textContent = `— ${sizing.gpus_required.text} needed at peak`;
    if (!$("f-sh-count").value.trim()) $("f-sh-count").placeholder = `${sizing.gpus_required.text} (derived)`;

    const perStreamWarn = peak.below_interactive_floor
      ? ` <span class="tag tag-est">below ${peak.interactive_floor_tokens_s.text} tok/s</span> at this per-stream rate an interactive answer reads as slow`
      : "";
    $("derived").innerHTML = `
      <div class="grid">
        <div><label>Sessions / month</label><div class="num">${groupInt(demand.sessions_mo.text)}</div></div>
        <div><label>Turns / month</label><div class="num">${groupInt(demand.turns_mo.text)}</div></div>
        <div><label>Tokens / month</label><div class="num">${groupInt(demand.tokens_mo.text)}</div></div>
        <div><label>Peak tokens / s</label><div class="num">${peak.peak_tokens_s.text}${perStreamWarn}</div></div>
      </div>
      <p class="muted" style="margin:14px 0 0">
        ${groupInt(peak.concurrent_peak.text)} concurrent sessions at peak &middot;
        in ${groupInt(demand.in_tokens_mo.text)} / out ${groupInt(demand.out_tokens_mo.text)} / cached ${groupInt(demand.cached_tokens_mo.text)} tokens per month &middot;
        <strong>${sizing.gpus_required.text}</strong> &times; ${escapeHtml($("f-sh-gpu").selectedOptions[0]?.textContent ?? "")}
        to hold the peak at ${sizing.tokens_s_per_gpu.text} tok/s per GPU
        <span class="tag ${sizing.assumed ? "tag-est" : "tag-exact"}">${sizing.assumed ? "assumed" : "your figure"}</span>
      </p>`;
  } catch (e) {
    state.demand = null;
    const why = e instanceof DemandRefusal ? e.message : `input problem — ${e.message}`;
    $("derived").innerHTML = `<div class="gap"><strong>Demand not computed:</strong> ${escapeHtml(why)}</div>`;
  }
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
  const models = state.manifest.models.filter((m) => m.id.startsWith(`${feed}:`) && m.state !== "quarantined" && m.state !== "retired");
  const byName = [...models].sort((a, b) => a.name.localeCompare(b.name));
  $("fb-model").innerHTML = byName.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join("");
  const cur = byName.find((m) => /gpt-4o/.test(m.id)) ?? byName.find((m) => /claude/.test(m.id)) ?? byName[0];
  if (cur) $("fb-model").value = cur.id;
  $("fb-model-note").textContent = `${models.length} models · snapshot ${state.manifest.snapshot_digest} · generated ${state.manifest.generated_at}`;
}

// --------------------------------------------------------------------- run()
// One scenario builder for the headline AND for every sensitivity cell, so a
// what-if can never disagree with the main result about how much hardware the
// demand needs. Scaling the user count re-derives sessions, tokens, the peak
// second AND the fleet; scaling only the monthly token total — which is what the
// pre-v0.2 demand axis did — holds the fleet at its base size and understates a
// scaled scenario. An EXPLICITLY entered GPU count or token budget is the user's
// declared fleet and stays fixed on purpose: that is the "my current hardware
// under more load" question, and it is theirs to ask.
function buildScenario(usersOverride = null) {
  const { demand, peak, sizing, gpuId } = computeDemand(usersOverride);

  // The engine consumes whole tokens and whole requests. The demand model is
  // exact, so rounding happens ONCE, here, at the boundary into the engine.
  const demandTokens = Math.round(Number(demand.tokens_mo.text));
  const requestCount = Math.round(Number(demand.turns_mo.text));
  const inTok = Number(demand.in_tokens_mo.text);
  const cachedTok = Number(demand.cached_tokens_mo.text);
  const outTok = Number(demand.out_tokens_mo.text);

  const workload = {
    demand_tokens_mo: demandTokens,
    request_count_mo: requestCount,
    // Per-request shape is the monthly total divided by turns: the engine
    // quotes ONE request and multiplies, so a blended average is correct here
    // precisely because the mix has already been applied upstream.
    prompt_tokens: requestCount > 0 ? Math.round(inTok / requestCount) : 0,
    output_tokens: requestCount > 0 ? Math.round(outTok / requestCount) : 0,
    cache_read_tokens_per_req: requestCount > 0 ? Math.round(cachedTok / requestCount) : 0,
    horizon_months: intInput("f-horizon") ?? 1,
    required_p95_tok_s: intInput("f-p95"),
    quote_utc: Date.parse($("f-utc").value),
    now: Date.now(),
    time_buckets: null,
  };
  if (demandTokens > 0) {
    workload.time_buckets = [{ hours: 730, tokens: demandTokens }];
  }

  // Self-hosted capacity: the sized fleet's aggregate throughput over the
  // month. Derived, and overridable — an entered budget wins.
  const gpuCount = intInput("f-sh-count") ?? Number(sizing.gpus_required.text);
  const fleetTokensS = gpuCount * Number(sizing.tokens_s_per_gpu.text);
  const derivedBudget = Math.round(fleetTokensS * 3600 * 730);
  const laneA = {
    enabled: true,
    fixed_monthly: decInput("f-sh-fixed") ?? "0",
    capex: decInput("f-sh-capex") ?? "0",
    monthly_token_budget: intInput("f-sh-budget") ?? derivedBudget,
    tokens_s_ceiling: Math.round(fleetTokensS),
    hardware_topology: `${gpuCount}x ${gpuId}`,
  };
  const laneB = { enabled: true, offer_ids: [$("fb-model").value].filter(Boolean) };

  // The rented option is sized on the accelerator being RENTED, never on the
  // self-hosted pick: an L40S does not deliver H100 throughput, and charging one
  // accelerator's rate at another's capacity makes a provider look cheap for a
  // reason that has nothing to do with its price. An accelerator with no
  // throughput assumption is reported as a gap rather than silently borrowing
  // the self-hosted figure.
  const rentRow = currentRentRow();
  let rentSizing = null;
  let rentGap = null;
  if (rentRow) {
    try {
      rentSizing = gpusForLoad({ peakTokensPerSecond: peak.peak_tokens_s.text, gpuId: rentRow.gpu_id });
    } catch (e) {
      rentGap = e instanceof DemandRefusal ? e.message : String(e);
    }
  }
  const rentGpus = rentSizing ? Math.max(1, Number(rentSizing.gpus_required.text)) : 0;
  const laneC = {
    enabled: !!rentSizing,
    tokens_s: rentSizing ? Math.round(rentGpus * Number(rentSizing.tokens_s_per_gpu.text)) : 0,
    // The registry quotes PER GPU; the option rents the fleet size this
    // accelerator needs to hold the peak, so the hourly rate is scaled by that
    // count — exactly, because a float multiply would put binary dust in a
    // dollar figure.
    hourly_rate: rentSizing ? Dec.from(String(rentRow.gpu_hourly_usd)).mul(BigInt(rentGpus)).toString() : "0",
    utilization: decInput("f-rent-util") ?? "0.7",
    hardware_topology: rentSizing ? `${rentGpus}x ${rentRow.gpu_label} @ ${rentRow.provider_label}` : null,
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

  return {
    demand, peak, sizing, gpuId, rentRow, rentGap,
    inputs: { workload, catalog: state.catalog ?? { offers: {} }, laneA, laneB, laneC, routing, overlay },
  };
}

// A headcount is a whole number of people — demand.js refuses a fractional one —
// so a scaled sensitivity cell rounds to a real person rather than becoming a
// refusal, and never falls below the single user the model needs to mean anything.
function scaleUsers(baseUsers, multiplier) {
  const n = Math.round(Number(baseUsers) * multiplier);
  return String(Number.isFinite(n) && n > 1 ? n : 1);
}

function run() {
  clearGap();
  try {
    const s = buildScenario();
    state.demand = { demand: s.demand, peak: s.peak, sizing: s.sizing };
    state.inputs = s.inputs;
    state.rentRow = s.rentRow;
    state.rentGap = s.rentGap;
    state.result = runComparison({ ...state.inputs, evidenceRows: [] });
    renderResults(state.result);
  } catch (e) {
    if (e instanceof DemandRefusal) {
      showGap(`${escapeHtml(e.message)}`);
      return;
    }
    const where = String(e.stack ?? "").split("\n").slice(1, 6).join(" | ");
    showGap(`the comparison could not run: ${escapeHtml(e.message)} <br><code>${escapeHtml(where)}</code>`);
  }
}

const srcTag = (quote) => quote && quote.exact
  ? `<span class="tag tag-exact">exact</span>`
  : `<span class="tag tag-est">estimated</span>`;

function quoteRows(offerId, quote) {
  return [
    ["snapshot digest", state.manifest.snapshot_digest],
    ["offer", offerId ?? "none"],
    ["exact", quote ? String(quote.exact) : "false"],
    ["reasons", quote && quote.reasons.length ? quote.reasons.join(", ") : "none"],
    ["applied overrides", quote ? JSON.stringify(quote.applied_overrides) : "[]"],
    ["meters", quote ? quote.meters.map((m) => `${m.meter}=${m.selected_key ?? "none"}x${m.quantity}`).join("; ") : "—"],
    ["sources", Object.entries(state.manifest.sources).map(([k, v]) => `${k}@${String(v.observed_at).slice(0, 10)}`).join("; ")],
    ["snapshot generated", state.manifest.generated_at],
  ];
}

// ---------------------------------------------------------------- payback UI
// A non-converging payback is rendered with its REASON in words — never as a
// dash, an infinity, or a large number that reads like an answer (SPEC 2.5).
const PAYBACK_REASON = {
  opex_exceeds_target: "self-hosting costs more every month than this option, so it never catches up — no horizon changes that",
  zero_capex: "no up-front cost was entered, so there is nothing to pay back",
  negative_capex: "capex is negative, which the model does not interpret",
};

function paybackCard(r) {
  const p = r.payback ?? {};
  const targets = [["vs_model_api", OPTION.B.label], ["vs_rented_gpu", OPTION.C.label]].filter(([k]) => p[k]);
  if (!targets.length) return "";
  const rows = targets.map(([k, label]) => {
    const v = p[k];
    const rowsProv = [
      ["capex", money(v.capex)],
      ["self-hosted monthly", money(v.monthly_opex)],
      [`${label} monthly`, money(v.target_monthly)],
      ["monthly saving", money(v.monthly_savings)],
      ["formula", "ceil(capex / (target monthly − self-hosted monthly))"],
    ];
    if (!v.converges) {
      return `<tr><td>vs ${escapeHtml(label)}</td><td class="n"><strong>does not converge</strong></td>`
        + `<td>${numProv(escapeHtml(PAYBACK_REASON[v.reason] ?? v.reason), rowsProv)}</td></tr>`;
    }
    const beyond = v.beyond_horizon
      ? ` <span class="tag tag-est">beyond the ${escapeHtml(String(v.horizon_months))}-month horizon</span>`
      : "";
    return `<tr><td>vs ${escapeHtml(label)}</td>`
      + `<td class="n"><strong>${numProv(`${v.months} month${v.months === 1 ? "" : "s"}`, rowsProv)}</strong>${beyond}</td>`
      + `<td>saving ${money(v.monthly_savings)} / month against ${escapeHtml(label)}</td></tr>`;
  }).join("");
  return `<div class="card">
    <h3 style="margin-bottom:10px">Payback on the self-hosted capex</h3>
    <table><thead><tr><th>Compared with</th><th class="n">Pays back in</th><th>Basis</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted">Capex ${money(p.self_hosted_capex)} one-time, ${money(p.self_hosted_monthly_opex)} per month running. A payback past the horizon is shown as the true month, never truncated — reporting "slow" as "never" is the more damaging error.</p>
  </div>`;
}

function sizingCard() {
  const d = state.demand;
  if (!d) return "";
  const { demand, peak, sizing } = d;
  const under = state.result && state.result.lanes.A.enabled
    && Number(state.inputs.laneA.tokens_s_ceiling) < Number(peak.peak_tokens_s.text);
  return `<div class="card">
    <h3 style="margin-bottom:10px">Demand and sizing</h3>
    <table>
      <tbody>
        <tr><td>Users</td><td class="n">${groupInt(demand.users.text)}</td><td class="muted">${escapeHtml(demand.users.basis)}</td></tr>
        <tr><td>Sessions / month</td><td class="n">${groupInt(demand.sessions_mo.text)}</td><td class="muted">${escapeHtml(demand.sessions_mo.basis)}</td></tr>
        <tr><td>Tokens / month</td><td class="n">${groupInt(demand.tokens_mo.text)}</td><td class="muted">${escapeHtml(demand.tokens_mo.basis)}</td></tr>
        <tr><td>Peak tokens / s</td><td class="n">${peak.peak_tokens_s.text}</td><td class="muted">${groupInt(peak.concurrent_peak.text)} concurrent &times; ${peak.tokens_s_per_stream.text} tok/s per stream</td></tr>
        <tr><td>GPUs to hold the peak</td><td class="n">${sizing.gpus_required.text}</td><td class="muted">${sizing.tokens_s_per_gpu.text} tok/s per GPU <span class="tag ${sizing.assumed ? "tag-est" : "tag-exact"}">${sizing.assumed ? "assumed" : "your figure"}</span></td></tr>
      </tbody>
    </table>
    ${under ? `<div class="gap"><strong>Under-provisioned at peak:</strong> the self-hosted fleet clears the monthly total but not ${peak.peak_tokens_s.text} tok/s at peak. Monthly capacity is not a substitute for peak capacity.</div>` : ""}
    <p class="muted">Per-workload rows appear in the exported quote. Every figure is derived unless marked <code>user_override</code>.</p>
  </div>`;
}

// Every provider in the registry, priced for THIS load. The picker answers one
// provider at a time, which is not the question a buyer comparing AWS against
// Azure against a Chinese cloud is actually asking — and asking it one selection
// at a time makes the comparison the buyer's clerical work rather than the
// calculator's output. Sets state.rentByProvider for the quote export.
function providerCard() {
  const d = state.demand;
  const inp = state.inputs;
  if (!d || !inp) { state.rentByProvider = null; return ""; }

  const cmp = rentedGpuByProvider({
    rows: state.gpuPricing?.rows ?? [],
    utilization: inp.laneC.utilization,
    servedTokens: inp.workload.demand_tokens_mo,
    // Sized on ITS OWN accelerator against the same peak second — never on the
    // self-hosted pick, which would price an L4 fleet as if it were H100s.
    sizeFor: (gpuId) => gpusForLoad({ peakTokensPerSecond: d.peak.peak_tokens_s.text, gpuId }),
  });
  state.rentByProvider = cmp;

  if (!cmp.priced.length) {
    return `<div class="card"><h3>${OPTION.C.label} — every provider</h3><p class="muted">No provider could be priced for this load${cmp.reason ? ` (${escapeHtml(cmp.reason)})` : ""}.</p></div>`;
  }

  // Marked only when the provider AND the accelerator match: this table picks a
  // provider's cheapest holding SKU, which is often not the one selected above,
  // and marking on provider alone would label a different number as "yours".
  const selected = state.rentRow?.provider ?? null;
  const selectedGpu = state.rentRow?.gpu_id ?? null;
  const body = cmp.priced.map((p) => {
    const tier = p.confidence === "first_party" ? "tag-exact" : "tag-est";
    const word = p.confidence === "first_party" ? "first-party" : "indicative";
    const provRows = [
      ["sku", String(p.sku)],
      ["fleet", `${p.gpus_required} x ${p.gpu_label ?? p.gpu_id}`],
      ["per-GPU hourly", `$${p.gpu_hourly_usd}`],
      ["fleet hourly", `$${p.fleet_hourly_usd}`],
      ["GPU-hours / month", p.hours],
      ["confidence", p.confidence],
      ["source", String(p.source_url)],
      ["observed", String(p.observed_at).slice(0, 10)],
      ["snapshot digest", state.manifest.snapshot_digest],
    ];
    const mark = p.provider === selected && p.gpu_id === selectedGpu ? ` <span class="muted">your selection</span>` : "";
    return `<tr><td>${escapeHtml(p.provider_label)} <span class="tag ${tier}">${word}</span>${mark}</td>`
      + `<td>${escapeHtml(p.gpu_label ?? p.gpu_id)}</td>`
      + `<td class="n">${p.gpus_required}</td>`
      + `<td class="n">$${escapeHtml(p.gpu_hourly_usd)}</td>`
      + `<td class="n">${numProv(money(p.monthly_total), provRows)}</td></tr>`;
  }).join("");

  // The picker's own pairing could not be sized — say so here rather than let the
  // Rented GPU option quietly vanish from the results table with no explanation.
  const pickGap = state.rentGap
    ? `<div class="gap"><strong>Your selected pairing is not priced:</strong> ${escapeHtml(state.rentGap)} The comparison below still stands; the option row above is omitted rather than guessed.</div>`
    : "";

  const missing = cmp.unservable.length
    ? `<p class="muted">Not priced: ${[...new Set(cmp.unservable.map((u) => `${u.provider_label} (${u.gpu_id} — ${u.reason})`))].map(escapeHtml).join(", ")}. An unpriceable provider is reported rather than dropped — vanishing from the table would read as "not offered" when the truth is "not modelled".</p>`
    : "";

  return `<div class="card">
    <h3>${OPTION.C.label} — every provider in the registry, priced for this load</h3>
    <table>
      <thead><tr><th>Provider</th><th>Accelerator</th><th class="n">GPUs</th><th class="n">$/GPU-hr</th><th class="n">Cost / month</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    ${pickGap}
    <p class="muted">The cheapest SKU per provider that holds ${d.peak.peak_tokens_s.text} tok/s at peak, each sized on its own accelerator — so providers rank by delivered capacity, not by sticker rate. <span class="tag tag-exact">first-party</span> is the vendor's own published price list; <span class="tag tag-est">indicative</span> is a public aggregator, an order-of-magnitude planning figure rather than a quote.</p>
    ${missing}
  </div>`;
}

function renderResults(r) {
  const B = r.lanes.B;
  const q = B.primary_offer ? B.quotes[B.primary_offer] : null;
  const digest = [["snapshot digest", state.manifest.snapshot_digest]];

  const rows = [`<tr><td>${OPTION.B.label} — <code>${escapeHtml(B.primary_offer ?? "none")}</code>${srcTag(q)}</td>` +
    `<td class="n">${B.monthly_total === null ? "—" : numProv(money(B.monthly_total), quoteRows(B.primary_offer, q))}</td>` +
    `<td class="n">${B.per_1m.value === null ? `— (${B.per_1m.reason})` : numProv(fmtPer1M(B.per_1m.value), quoteRows(B.primary_offer, q))}</td>` +
    `<td class="n">${numProv(money(r.curve[0].B), quoteRows(B.primary_offer, q))}</td></tr>`];

  if (r.lanes.A.enabled) {
    const A = r.lanes.A;
    const aRows = [
      ...digest,
      ["fixed monthly", money(A.lines.find((l) => l.item === "lane_a_fixed")?.amount ?? "0") + " — charged once"],
      ["capex (one-time)", money(r.payback?.self_hosted_capex ?? "0")],
      ["served / overflow tokens", `${A.served_tokens} / ${A.overflow_tokens}`],
      ["utilization", A.utilization === null ? (A.utilization_reason ?? "—") : String(A.utilization)],
      ["fleet", state.inputs.laneA.hardware_topology],
    ];
    const per1mA = A.per_1m && A.per_1m.value !== null ? numProv(fmtPer1M(A.per_1m.value), aRows) : `— (${A.per_1m?.reason ?? "n/a"})`;
    rows.push(`<tr><td>${OPTION.A.label}</td>`
      + `<td class="n">${numProv(money(A.monthly_total), aRows)}</td>`
      + `<td class="n">${per1mA}</td>`
      + `<td class="n">${numProv(money(r.curve[0].A), aRows)}</td></tr>`);
  }

  if (r.lanes.C.enabled) {
    const C = r.lanes.C;
    const row = state.rentRow;
    const tier = row?.confidence === "first_party" ? "tag-exact" : "tag-est";
    const tierWord = row?.confidence === "first_party" ? "first-party" : "indicative";
    const cRows = [
      ...digest,
      ["provider", row ? row.provider_label : "—"],
      ["sku", row ? row.sku : "—"],
      ["per-GPU hourly", row ? `$${row.gpu_hourly_usd}` : "—"],
      ["confidence", row ? row.confidence : "unknown"],
      ["source", row ? row.source_url : "—"],
      ["observed", row ? String(row.observed_at).slice(0, 10) : "—"],
      ["hours", String(C.hours)],
      ["utilization", String(C.utilization)],
    ];
    const cPer1m = C.per_1m ?? { value: null, reason: C.per_1m_reason };
    const per1mC = cPer1m.value === null || cPer1m.value === undefined
      ? `— (${cPer1m.reason ?? "unknown"})`
      : numProv(fmtPer1M(cPer1m.value), cRows);
    rows.push(`<tr><td>${OPTION.C.label}${row ? ` — ${escapeHtml(row.provider_label)}` : ""} <span class="tag ${tier}">${tierWord}</span></td>`
      + `<td class="n">${numProv(money(C.monthly_total), cRows)}</td>`
      + `<td class="n">${per1mC}</td>`
      + `<td class="n">${numProv(money(r.curve[0].C), cRows)}</td></tr>`);
  }

  const rec = (r.routing_result.recommended_monthly_total === null || r.routing_result.recommended_monthly_total === undefined) ? "" :
    `<div class="card" style="margin-bottom:14px"><h3 style="margin:0 0 6px">Recommended — ${escapeHtml(r.policy)}</h3><div style="font-size:1.6rem;font-weight:700">${numProv(money(r.routing_result.recommended_monthly_total), [["policy", r.policy], ["basis", "engine-derived result under the declared routing policy"], ...digest])}<span class="muted" style="font-size:.85rem"> / month at the entered demand</span></div></div>`;

  const adv = r.routing_result.advisory
    ? `<p class="muted">Advisory blend ${money(r.routing_result.advisory.total)} — <strong>${escapeHtml(r.routing_result.advisory.status)}</strong>${r.routing_result.advisory.delta ? ` (delta ${money(r.routing_result.advisory.delta)})` : ""}. ${escapeHtml(r.routing_result.advisory.note)}</p>`
    : "";
  const don = r.routing_result.derived_optimum_note
    ? `<p class="muted">Derived optimum for comparison: ${money(r.routing_result.derived_optimum_note.total)} — ${escapeHtml(r.routing_result.derived_optimum_note.note)}</p>`
    : "";
  const failover = r.routing_result.failover
    ? `<p class="muted">Failover: fallback option ${escapeHtml(OPTION[r.routing_result.failover.fallback]?.label ?? r.routing_result.failover.fallback)} at share ${escapeHtml(r.routing_result.failover.share)} &times; rate ${escapeHtml(r.routing_result.failover.rate)}.</p>`
    : "";
  const pinned = r.routing_result.pinned
    ? `<p class="muted">Pinned split honored: ${r.routing_result.pinned.lines.map((l) => `${escapeHtml(OPTION[l.lane]?.label ?? l.lane)} ${money(l.amount)}`).join(" · ")} — total ${money(r.routing_result.pinned.total)}.</p>`
    : "";

  const verdictLi = (label, v) => v === null ? "" : `<li>${label}: <strong>${v.verdict}</strong>${v.verdict === "unknown" ? ` <span class="tag tag-unknown">no evidence row matches all dimensions</span>` : ` @ ${v.modelled_p95_capacity} tok/s`}${v.annotation ? ` <span class="muted">partial: ${v.annotation.mismatched_dimensions.join(", ")} differ</span>` : ""}</li>`;

  $("results").innerHTML = `
    ${rec}
    ${paybackCard(r)}
    <div class="card">
      <table>
        <thead><tr><th>Option · policy ${escapeHtml(r.policy)}</th><th class="n">Cost / month</th><th class="n">${r.overlay ? r.overlay.label.replaceAll("_", " ") : "infra per 1M"}</th><th class="n">1 month total</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
      ${r.overlay && r.overlay.itemized.length ? `<p class="muted">Overlay itemized last: ${r.overlay.itemized.map((i) => `${escapeHtml(i.name)} ${money(i.extended)} (${i.basis}, ${i.provenance})`).join(" · ")} — total ${money(r.overlay.overlay_total)} · ${escapeHtml(r.overlay.note)}</p>` : ""}
      ${adv}${don}${failover}${pinned}
      ${r.reasons.length ? `<div class="gap"><strong>Honest caveats:</strong> ${r.reasons.map(escapeHtml).join("; ")}</div>` : ""}
      ${B.gaps.map((g) => `<div class="gap"><strong>${escapeHtml(g.offer_id)}</strong>: ${escapeHtml(g.gap_reason ?? "unservable")} — the option falls back or reports the gap.</div>`).join("")}
    </div>
    ${sizingCard()}
    ${providerCard()}
    <div class="card">
      <h3>Feasibility</h3>
      <ul style="color:rgba(232,230,240,.72)">${verdictLi(`${OPTION.A.label} p95 vs SLO`, r.throughput.verdicts.lane_A)}${verdictLi(`${OPTION.C.label} p95 vs SLO`, r.throughput.verdicts.lane_C)}</ul>
      <p class="muted">Feasibility verdicts are evidence-gated: unknown beats invented. The shipped evidence store is empty by mandate (SPEC 6.5).</p>
    </div>
    <div class="card">
      <h3>Cumulative cost over ${r.horizon_months} months</h3>
      ${renderCurve(r.curve)}
      <p class="muted">Self-hosted starts at its capex and grows by its monthly cost; where its line crosses another is the payback month above.</p>
    </div>
    <p><button class="btn btn-s" id="export">Export quote (JSON)</button> <span class="muted">every input, the snapshot digest, and per-meter provenance.</span></p>
  `;
  $("export").addEventListener("click", () => exportQuote(r));
  renderOptionTotals(r);
  renderSensitivity();
}

function renderOptionTotals(r) {
  const put = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
  put("opt-self-total", r.lanes.A.enabled && r.lanes.A.monthly_total != null ? money(r.lanes.A.monthly_total) : "&mdash;");
  put("opt-api-total", r.lanes.B.monthly_total != null ? money(r.lanes.B.monthly_total) : "&mdash;");
  put("opt-rent-total", r.lanes.C.enabled && r.lanes.C.monthly_total != null ? money(r.lanes.C.monthly_total) : "&mdash;");
}

const coerce = (v) => {
  if (v instanceof Dec || v instanceof Rat) return v;
  const s = String(v);
  const m = /^(-?\d+)\/(\d+)$/.exec(s);
  return m ? new Rat(BigInt(m[1]), BigInt(m[2])) : Dec.from(s);
};
const fmt = (v, places) => (v === null || v === undefined ? "—" : formatHalfUp(coerce(v), places));

const fmtPer1M = (v) => {
  if (v === null || v === undefined) return "—";
  if (v instanceof Rat || v instanceof Dec) return formatHalfUp(v, 6);
  const s = String(v);
  const m = /^(-?\d+)\/(\d+)$/.exec(s);
  if (m) return formatHalfUp(new Rat(BigInt(m[1]), BigInt(m[2])), 6);
  return formatHalfUp(Dec.from(s), 6);
};

function renderCurve(curve) {
  const w = 900, h = 220, pad = 34;
  const maxV = Math.max(...curve.flatMap((p) => OPTION_KEYS.map((l) => Number(p[l]) || 0)), 1);
  const x = (m) => pad + ((m - 1) / Math.max(1, curve.length - 1)) * (w - pad * 2);
  const y = (v) => h - pad - (v / maxV) * (h - pad * 2);
  const paths = OPTION_KEYS.map((l) => {
    const pts = curve.map((p) => `${x(p.month).toFixed(1)},${y(Number(p[l]) || 0).toFixed(1)}`).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${OPTION[l].color}" stroke-width="2" />`;
  }).join("");
  const labels = OPTION_KEYS.map((l, i) => `<text x="${pad + i * 150}" y="18" fill="${OPTION[l].color}" font-size="12" font-family="monospace">${OPTION[l].label}</text>`).join("");
  const axis = `<text x="${pad}" y="${h - 8}" fill="rgba(232,230,240,.4)" font-size="11" font-family="monospace">mo 1</text><text x="${w - pad - 30}" y="${h - 8}" fill="rgba(232,230,240,.4)" font-size="11" font-family="monospace">mo ${curve.length}</text>`;
  return `<svg class="curve" viewBox="0 0 ${w} ${h}" role="img" aria-label="cumulative cost over the horizon">${labels}${paths}${axis}</svg>`;
}

// Scale one offer's prices by an exact rational factor — the sensitivity's
// price axis re-quotes a scaled TARIFF through the engine; it never rescales a
// displayed number with floating-point math (peer G9).
function scaleOfferPrices(offer, pm) {
  const scale = (s) => {
    const p = Rat.from(Dec.from(s)).mul(Rat.from(Dec.from(String(pm))));
    const d = ratToDecExact(p);
    return d === null ? null : d.toString();
  };
  const clone = JSON.parse(JSON.stringify(offer));
  for (const k of Object.keys(clone.prices ?? {})) {
    const v = scale(clone.prices[k]);
    if (v === null) return null;
    clone.prices[k] = v;
  }
  for (const o of clone.overrides ?? []) {
    for (const k of Object.keys(o.prices ?? {})) {
      const v = scale(o.prices[k]);
      if (v === null) return null;
      o.prices[k] = v;
    }
  }
  return clone;
}

function renderSensitivity() {
  const r = state.result;
  const inp = state.inputs;
  const primary = inp?.laneB?.offer_ids?.[0] ?? null;
  if (!r || !inp || !primary || !state.catalog?.offers?.[primary]) {
    $("sensitivity").innerHTML = `<div class="card"><h3>Sensitivity</h3><p class="muted">Select a priced API model — the user/price grid reruns the full comparison per cell and needs a priced offer.</p></div>`;
    return;
  }
  const baseUsers = decInput("f-users");
  const userMultipliers = [0.5, 0.75, 1, 1.5, 2];
  const priceMultipliers = [0.8, 1, 1.25];
  const head = `<tr><th>users \\ API price</th>${priceMultipliers.map((p) => `<th class="n">&times;${p}</th>`).join("")}</tr>`;
  const body = userMultipliers.map((um) => {
    const users = scaleUsers(baseUsers, um);
    // Each row is a WHOLE scenario at that headcount: sessions, tokens, the peak
    // second and the fleet are re-derived together, so a row that crosses a GPU
    // boundary is priced on the bigger fleet instead of silently reusing the base one.
    let scen;
    try {
      scen = buildScenario(users);
    } catch {
      return `<tr><td>${groupInt(users)} <span class="muted">&times;${um}</span></td>${priceMultipliers.map(() => `<td class="n muted">n/d</td>`).join("")}</tr>`;
    }
    const fleet = `${scen.sizing.gpus_required.text} &times; ${escapeHtml(scen.gpuId)}`;
    const cells = priceMultipliers.map((pm) => {
      let catalog = scen.inputs.catalog;
      if (pm !== 1) {
        const scaled = scaleOfferPrices(state.catalog.offers[primary], pm);
        if (scaled === null) return `<td class="n muted">n/d</td>`;
        catalog = { offers: { [primary]: scaled } };
      }
      const res = runComparison({ ...scen.inputs, catalog, evidenceRows: [] });
      const tco = res.routing_result.recommended_monthly_total;
      const cls = um === 1 && pm === 1 ? `style="color:#E8E6F0"` : "";
      return `<td class="n" ${cls}>${tco === null || tco === undefined ? "—" : numProv(money(tco), [
        ["scenario", `${groupInt(users)} users, API price x${pm}`],
        ["peak", `${scen.peak.peak_tokens_s.text} tok/s`],
        ["fleet at this scale", `${scen.sizing.gpus_required.text} x ${scen.gpuId}`],
        ["basis", "full engine rerun — demand, peak second and fleet all re-derived"],
        ["snapshot digest", state.manifest.snapshot_digest],
      ])}</td>`;
    }).join("");
    return `<tr><td>${groupInt(users)} <span class="muted">&times;${um} &middot; ${fleet}</span></td>${cells}</tr>`;
  }).join("");
  $("sensitivity").innerHTML = `<div class="card"><h3>Recommended cost sensitivity — full engine rerun per cell</h3><table><thead>${head}</thead><tbody>${body}</tbody></table><p class="muted">Each cell is a fresh comparison at that headcount: the user axis re-derives sessions, tokens, the peak second and the GPU count together, so the fleet grows with the load instead of staying pinned to the base scenario. An explicitly entered GPU count or token budget is your declared fleet and stays fixed. The price axis re-quotes a tariff scaled exactly. ${OPTION.A.label} per-unit cost FALLS with utilization; ${OPTION.C.label} is hyperbolic — those nonlinearities are the decision-relevant sensitivities.</p></div>`;
}

// The exported quote carries the OPTION names, never the engine's internal
// A/B/C keys — the naming contract binds the export surface too (SPEC 8).
function exportQuote(r) {
  const named = {};
  for (const k of OPTION_KEYS) named[OPTION[k].key] = r.lanes[k];
  const d = state.demand;
  const payload = {
    generated_at: new Date().toISOString(),
    snapshot: { digest: state.manifest.snapshot_digest, generated_at: state.manifest.generated_at, schema: state.manifest.schema },
    demand: d ? {
      users: d.demand.users.text,
      sessions_mo: { value: d.demand.sessions_mo.text, basis: d.demand.sessions_mo.basis },
      turns_mo: { value: d.demand.turns_mo.text, basis: d.demand.turns_mo.basis },
      tokens_mo: { value: d.demand.tokens_mo.text, basis: d.demand.tokens_mo.basis },
      in_tokens_mo: d.demand.in_tokens_mo.text,
      out_tokens_mo: d.demand.out_tokens_mo.text,
      cached_tokens_mo: d.demand.cached_tokens_mo.text,
      per_workload: d.demand.workloads.map((w) => ({
        type: w.type,
        share: w.share.text,
        turns_mo: { value: w.turns_mo.text, basis: w.turns_mo.basis },
        tokens_mo: w.tokens_mo.text,
      })),
      peak: {
        concurrent_sessions: d.peak.concurrent_peak.text,
        tokens_s_per_stream: d.peak.tokens_s_per_stream.text,
        peak_tokens_s: d.peak.peak_tokens_s.text,
        below_interactive_floor: d.peak.below_interactive_floor,
      },
      sizing: {
        gpus_required: d.sizing.gpus_required.text,
        tokens_s_per_gpu: { value: d.sizing.tokens_s_per_gpu.text, basis: d.sizing.tokens_s_per_gpu.basis },
        assumed: d.sizing.assumed,
      },
    } : null,
    rented_gpu_source: state.rentRow ? {
      provider: state.rentRow.provider_label,
      sku: state.rentRow.sku,
      gpu_hourly_usd: state.rentRow.gpu_hourly_usd,
      confidence: state.rentRow.confidence,
      source_url: state.rentRow.source_url,
      observed_at: state.rentRow.observed_at,
    } : null,
    // The cross-provider comparison travels with the quote: whoever receives this
    // file needs the alternatives that were rejected, not only the one selected.
    rented_gpu_by_provider: state.rentByProvider
      ? { priced: state.rentByProvider.priced, unservable: state.rentByProvider.unservable }
      : null,
    result: {
      policy: r.policy,
      options: named,
      routing_result: r.routing_result,
      payback: r.payback,
      breakeven: r.breakeven,
      throughput: r.throughput,
      overlay: r.overlay,
      curve: r.curve.map((p) => ({
        month: p.month,
        [OPTION.A.key]: p.A,
        [OPTION.B.key]: p.B,
        [OPTION.C.key]: p.C,
      })),
      horizon_months: r.horizon_months,
      reasons: r.reasons,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tco-quote-${state.manifest.snapshot_digest}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

init();