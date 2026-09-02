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
import { servingPlan, kvBytesPerToken, ServingRefusal } from "./serving.js";
import { nodesForFleet, cheapestConfigFor, serversForGpu, CapexRefusal } from "./capex.js";
import { subscriptionCost, billableQuantity, METERS, SubscriptionRefusal } from "./subscription.js";

// The single place the engine's internal keys become user-facing names.
const OPTION = {
  A: { key: "self_hosted", label: "Self-hosted", color: "#B46EFF" },
  B: { key: "model_api", label: "Model API", color: "#22D3EE" },
  C: { key: "rented_gpu", label: "Rented GPU", color: "#34D399" },
};
const OPTION_KEYS = ["A", "B", "C"];

// The engine's routing keys are vocabulary, not English. Rendered surfaces get
// the sentence; the raw key stays in the provenance rows and the exported quote,
// which are the technical record and must keep the engine's own term.
const POLICY_WORDS = {
  local_first: "your own GPUs first",
  api_first: "the API first, falling back to your own GPUs",
  fixed_split: "a fixed split between the options",
};
const policyWords = (p) => POLICY_WORDS[p] ?? String(p);

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
  // v0.3 serving model: the tables in serving-models.json, and the solved plan
  // for the current selection. servingGap holds the REASON a plan could not be
  // solved, so the fit panel can say what to change instead of going blank.
  servingData: null,
  serving: null,
  servingGap: null,
  // v0.5: the server-acquisition registry and the platform-licence registry, plus
  // the derived capex/licence for the current selection. capexGap and subGap hold
  // the REASON one could not be derived, so the note says what to change rather
  // than going blank — the same contract servingGap follows.
  serverPricing: null,
  subscriptions: null,
  capexPlan: null,
  capexGap: null,
  subPlan: null,
  subGap: null,
  // Live recompute must not fire mid-init: the catalog is not loaded yet and a
  // comparison over an empty catalog renders a gap the user never caused.
  ready: false,
};

// A total travels as a Dec, a Rat, or a reduced "n/d" string — a non-terminating
// division keeps full precision instead of collapsing to a float. ONE parser, so
// what gets displayed and what gets RANKED can never disagree about a price.
const moneyValue = (x) => {
  if (x === null || x === undefined) return null;
  if (x instanceof Dec || x instanceof Rat) return x;
  const s = String(x);
  const m = /^(-?\d+)\/(\d+)$/.exec(s);
  return m ? new Rat(BigInt(m[1]), BigInt(m[2])) : Dec.from(s);
};
const money = (x) => {
  const v = moneyValue(x);
  return v === null ? "—" : "$" + formatHalfUp(v, 2);
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
    await loadServingModels();
    await loadServerPricing();
    await loadSubscriptions();
    wireInputs();
    await loadWorkloadPresets();
    // Land on an answer, not an empty column. The default preset is a complete,
    // labelled scenario, so the first thing the screen shows is a worked example
    // the user edits — not a form they must fill before anything happens.
    state.ready = true;
    run();
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

// ─────────────────────────────────────────── v0.5 server capex + licence layer

// Server configurations are keyed to the SAME gpu ids as gpu-pricing.json, so the
// picker re-fills whenever the accelerator changes. An accelerator with no
// published node price yields an empty list and a stated gap — never a borrowed
// price from a neighbouring card.
async function loadServerPricing() {
  const res = await fetch("./tco-calculator/data/server-pricing.json");
  if (!res.ok) throw new Error(`server-pricing.json ${res.status}`);
  state.serverPricing = await res.json();
  $("f-srv-config").addEventListener("change", onLiveInput);
  $("f-srv-basis").addEventListener("change", onLiveInput);
  // The server list is keyed to the accelerator, so it must re-fill when the
  // accelerator changes — otherwise an H100 node stays selected against a B200
  // fleet and prices the wrong hardware.
  $("f-sh-gpu").addEventListener("change", () => { fillServerConfigs(); });
  fillServerConfigs();
}

function fillServerConfigs() {
  const gpuId = $("f-sh-gpu").value;
  const rows = serversForGpu(gpuId, state.serverPricing?.rows ?? []);
  const sel = $("f-srv-config");
  const previous = sel.value;
  sel.innerHTML = [`<option value="">— none (enter the hardware cost yourself) —</option>`]
    .concat(rows.map((r) => {
      const n = `${r.gpu_count}&times;`;
      const flag = r.verification?.status === "verified" ? "" : " ⚠";
      return `<option value="${escapeHtml(r.server_id)}">${n} ${escapeHtml(r.form_factor)} — $${groupInt(r.usd_typical)}${flag}</option>`;
    }))
    .join("");
  // Keep the user's pick across an accelerator change when it still exists;
  // otherwise default to the cheapest config that holds the CURRENT fleet.
  if (previous && rows.some((r) => r.server_id === previous)) {
    sel.value = previous;
  } else if (rows.length) {
    const gpus = state.demand ? Number(state.demand.sizing.gpus_required.text) : rows[0].gpu_count;
    let pick = rows[0].server_id;
    try {
      const c = cheapestConfigFor({ gpuId, servers: state.serverPricing.rows, gpusRequired: Math.max(1, gpus), priceBasis: $("f-srv-basis").value });
      if (c.best) pick = c.best.server_id;
    } catch { /* fall through to the first row */ }
    sel.value = pick;
  } else {
    sel.value = "";
  }
}

const currentServerRow = () => (state.serverPricing?.rows ?? []).find((r) => r.server_id === $("f-srv-config").value) ?? null;

// The derived hardware capex for the sized fleet. An entered value in f-sh-capex
// OUTRANKS it — same basis contract as every other derived quantity (SPEC §2.4) —
// and the note says which of the two produced the number on screen.
// `publish` is FALSE for the sensitivity sweep. That grid reruns the whole
// pipeline at five other headcounts, so before this flag the LAST sweep row
// (x2 users) left ITS fleet in state — and the capex and licence notes then
// described a scenario the buyer never asked for while the totals directly
// below them priced the base one. The shared state belongs to the base
// scenario by definition; a sweep row only ever answers for itself.
function buildCapexPlan(gpusRequired, publish = true) {
  let plan = null;
  let gap = null;
  const server = currentServerRow();
  if (!server) {
    gap = serversForGpu($("f-sh-gpu").value, state.serverPricing?.rows ?? []).length === 0
      ? `no published integrated-node price for "${$("f-sh-gpu").value}" — enter the hardware cost yourself.`
      : `no server selected — enter the hardware cost yourself.`;
  } else {
    try {
      plan = nodesForFleet({ gpusRequired, server, priceBasis: $("f-srv-basis").value });
    } catch (e) {
      gap = e instanceof CapexRefusal ? e.message : String(e);
    }
  }
  if (publish) {
    state.capexPlan = plan;
    state.capexGap = gap;
  }
  return plan;
}

async function loadSubscriptions() {
  const res = await fetch("./tco-calculator/data/subscription-pricing.json");
  if (!res.ok) throw new Error(`subscription-pricing.json ${res.status}`);
  state.subscriptions = await res.json();
  $("f-sub-row").innerHTML = state.subscriptions.rows
    .map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.label)}</option>`)
    .join("");
  $("f-sub-row").value = "none";
  for (const id of ["f-sub-row", "f-sub-term"]) $(id).addEventListener("change", onLiveInput);
  $("f-sub-price").addEventListener("input", onLiveInput);
}

const currentSubRow = () => (state.subscriptions?.rows ?? []).find((r) => r.id === $("f-sub-row").value) ?? null;

// Both notes render the SAME two-part honesty the data files encode: what the
// number is, and how much authority it carries. A server price is never a vendor
// quote here, and a licence's meter is documented where its amount is not.
function renderServerNote() {
  const el = $("f-srv-note");
  if (!el) return;
  if (state.capexGap) { el.innerHTML = escapeHtml(state.capexGap); return; }
  const p = state.capexPlan;
  if (!p) { el.textContent = ""; return; }
  const entered = decInput("f-sh-capex") !== null;
  const waste = p.gpus_overprovisioned > 0
    ? ` You need ${p.gpus_required} GPU${p.gpus_required === 1 ? "" : "s"} and this buys ${p.gpus_provisioned}, so <strong>${p.gpus_overprovisioned}</strong> ${p.gpus_overprovisioned === 1 ? "is" : "are"} spare &mdash; a smaller node may fit better.`
    : "";
  const cite = p.verification?.status === "verified"
    ? `<span class="tag tag-est">indicative</span> published integrator figure, citation re-checked at source`
    : `<span class="tag tag-est">unverified</span> the quoted figure is no longer at its source &mdash; treat with care`;
  const src = p.source_url ? ` &middot; <a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">source</a>` : "";
  const basis = entered
    ? `Your entered figure is in use; the derived one below is shown for comparison.`
    : `Derived, and overridable &mdash; type a figure to use your own quote.`;
  el.innerHTML = `${basis} <strong>${p.nodes} &times; ${escapeHtml(p.label)}</strong> at ${money(p.unit_price)} each = <strong>${money(p.capex)}</strong>.${waste} ${cite}${src}. No vendor publishes a list price for GPU servers, so this is a planning band, never a quote.`;
}

function renderSubNote() {
  const el = $("f-sub-note");
  if (!el) return;
  const row = currentSubRow();
  if (!row || row.id === "none") { el.textContent = ""; return; }
  if (state.subGap) {
    const meterCite = row.meter_source_url
      ? ` The meter itself IS documented: <a href="${escapeHtml(row.meter_source_url)}" target="_blank" rel="noopener">${escapeHtml(row.vendor ?? "vendor")} states</a> &ldquo;${escapeHtml(String(row.meter_quote ?? "").slice(0, 180))}&rdquo;`
      : "";
    el.innerHTML = `${escapeHtml(state.subGap)}${meterCite}`;
    return;
  }
  const p = state.subPlan;
  if (!p) { el.textContent = ""; return; }
  const unitWord = {
    per_gpu_ram_gb_year: "GB of GPU memory across the fleet",
    per_gpu_year: "GPU", per_accelerator_year: "accelerator", per_gpu_hour: "GPU-hour",
    per_user_month: "user", per_vcpu_year: "vCPU", per_node_year: "node", flat_month: "month",
  }[p.meter] ?? p.meter;
  const meterTag = p.meter_confidence === "first_party"
    ? `<span class="tag tag-exact">meter: vendor-documented</span>`
    : `<span class="tag tag-est">meter: by definition</span>`;
  const priceTag = p.price_basis === "user_override"
    ? `<span class="tag tag-exact">price: your quote</span>`
    : `<span class="tag tag-est">price: indicative, not a vendor list price</span>`;
  const link = p.meter_source_url ? ` <a href="${escapeHtml(p.meter_source_url)}" target="_blank" rel="noopener">meter source</a>` : "";
  const applies = (p.applies_to ?? []).map((k) => OPTION[k]?.label ?? k).join(" and ");
  const once = moneyValue(p.one_time).sign() > 0 ? ` plus ${money(p.one_time)} once` : "";
  el.innerHTML = `<strong>${groupInt(p.quantity)}</strong> &times; ${escapeHtml(unitWord)} at ${money(p.unit_price)} &rarr; <strong>${money(p.monthly)}/mo</strong>${once}, charged to ${escapeHtml(applies || "no option")}. ${meterTag} ${priceTag}${link}`;
}

// Price the selected licence against the fleet. The quantity is DERIVED wherever
// the meter allows it — aggregate GPU RAM and per-GPU counts both come from the
// fleet this calculator already sized, so the licence re-prices when the fleet
// moves. Meters the calculator cannot model (vCPU, node, seat) take what they can
// from the demand model and are labelled as entered.
// `publish` follows the same rule as buildCapexPlan: only the base scenario
// owns the state the on-screen note is drawn from.
function buildSubPlan({ gpusRequired, gpuId, users, gpuHours, nodes }, publish = true) {
  let plan = null;
  let gap = null;
  const row = currentSubRow();
  if (row && row.id !== "none") {
    const vramGb = state.gpuPricing?.gpus?.[gpuId]?.vram_gb ?? null;
    try {
      plan = subscriptionCost({
        row,
        priceOverride: decInput("f-sub-price"),
        term: $("f-sub-term").value || null,
        quantityInputs: {
          gpus: gpusRequired,
          gpuVramGb: vramGb,
          gpuHours: gpuHours === null || gpuHours === undefined ? null : String(gpuHours),
          users,
          // The calculator models neither vCPUs nor node counts for licensing, so
          // these are the honest best available: the node count comes from the
          // capex plan when a server is selected, and vCPU has no source at all.
          nodes: nodes ?? null,
          vcpus: null,
        },
      });
    } catch (e) {
      gap = e instanceof SubscriptionRefusal ? e.message : String(e);
    }
  }
  if (publish) {
    state.subPlan = plan;
    state.subGap = gap;
  }
  return plan;
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

// ═════════════════════════════════════════ v0.3: the model being served
// The v0.2 calculator sized every fleet from one constant per accelerator,
// pinned at an ~8B-class model. What a GPU actually delivers is a function of
// the model on it — size, context, attention architecture, quantisation — so
// these controls are not a detail panel, they are the sizing input. See
// serving.js for the roofline and SPEC §6.6 for the formulas.

async function loadServingModels() {
  const res = await fetch("./tco-calculator/data/serving-models.json");
  if (!res.ok) throw new Error(`serving-models.json ${res.status}`);
  state.servingData = await res.json();
  const d = state.servingData;

  // Two provenance classes, and the difference is worth showing in the list
  // itself. A DERIVED row was read out of the model's own config.json by the
  // refresh command and has never been checked by a human; a CURATED row
  // reproduces a per-token KV figure published independently, which the test
  // suite asserts against exactly. Same engine and same arithmetic either way —
  // what differs is how much independent confirmation stands behind the inputs.
  const opt = (m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.label)}</option>`;
  const grp = (label, rows) => (rows.length
    ? `<optgroup label="${escapeHtml(label)}">${rows.map(opt).join("")}</optgroup>` : "");
  const derivedRows = d.models.filter((m) => m.basis === "derived");
  const customRows = d.models.filter((m) => m.id === "custom");
  const curatedRows = d.models.filter((m) => m.basis !== "derived" && m.id !== "custom");
  $("f-sv-model").innerHTML =
    grp(`Current — from Hugging Face, ${d.provenance?.observed ?? "undated"}`, derivedRows) +
    grp("Verified against a published KV figure", curatedRows) +
    grp("Your own configuration", customRows);
  const optsFor = (obj, labelKey) => Object.entries(obj)
    .map(([k, v]) => `<option value="${escapeHtml(k)}">${escapeHtml(v.label ?? k)}</option>`).join("");
  $("f-sv-wquant").innerHTML = optsFor(d.weight_quantization);
  $("f-sv-kvquant").innerHTML = optsFor(d.kv_quantization);
  $("f-sv-runtime").innerHTML = optsFor(d.runtimes);
  $("f-sv-wquant").value = "bf16";
  $("f-sv-kvquant").value = "bf16";
  $("f-sv-runtime").value = "vllm";

  $("f-sv-model").addEventListener("change", () => { applyModelPreset($("f-sv-model").value); });
  applyModelPreset(d.models[0].id);
}

// The four architectures the buyer named are a per-LAYER-GROUP property, and a real
// model can mix them: Gemma runs sliding and full layers together, Qwen3-Next runs
// GDN and full. So the editor is GENERATED from the chosen preset's own groups —
// one block each — rather than offering a single architecture dropdown that would
// silently flatten a hybrid into whichever kind happened to be picked. That
// flattening is the exact error the layer-group model exists to prevent.
const GROUP_KINDS = [
  ["full", "Full attention — every token retained"],
  ["sliding", "Sliding window — retains only its span"],
  ["linear", "Linear / GDN — no growing cache"],
  ["mla", "MLA — compressed latent cache"],
];

const gf = (i, k) => `f-g${i}-${k}`;

function groupFieldsHtml(i, g) {
  const num = (k, label, val, sub) => `
    <div class="f">
      <label for="${gf(i, k)}">${label}</label>
      <input id="${gf(i, k)}" type="text" inputmode="numeric" value="${escapeHtml(String(val ?? ""))}">
      <span class="sub">${sub}</span>
    </div>`;
  if (g.kind === "linear") {
    return `<p class="muted" style="margin:0">These layers carry a constant recurrent state, so they add <strong>0 bytes per token</strong> however long the context runs. That state itself is <span class="tag tag-unknown">unmodelled</span>, not assumed to be zero.</p>
      ${`<div class="row one">${num("layers", "Layers", g.layers, "How many layers in this group.")}</div>`}`;
  }
  if (g.kind === "mla") {
    return `<div class="row three">
      ${num("layers", "Layers", g.layers, "Layers in this group.")}
      ${num("lora", "KV latent rank", g.kv_lora_rank, "The compressed dimension actually stored.")}
      ${num("rope", "RoPE head dim", g.qk_rope_head_dim, "Carried uncompressed alongside it.")}
    </div>`;
  }
  return `<div class="row three">
      ${num("layers", "Layers", g.layers, "Layers in this group.")}
      ${num("heads", "KV heads", g.kv_heads, "Grouped-query models share these across attention heads.")}
      ${num("dim", "Head dim", g.head_dim, "Width of one head.")}
    </div>
    <div class="row${g.kind === "sliding" ? "" : " one"}">
      ${num("tensors", "Tensors per layer", g.tensors ?? 2, "2 for separate K and V; 1 when the layer unifies them.")}
      ${g.kind === "sliding" ? num("window", "Window (tokens)", g.window_tokens, "Past this span an old token leaves as a new one arrives, so these layers stop growing.") : ""}
    </div>`;
}

function renderArchGroups(groups) {
  state.archGroups = groups ?? [];
  const box = $("sv-groups");
  if (!box) return;
  box.innerHTML = state.archGroups.map((g, i) => `
    <div class="grp">
      <div class="glabel">Group ${i + 1}${state.archGroups.length > 1 ? ` of ${state.archGroups.length}` : ""}</div>
      <div class="row one">
        <div class="f">
          <label for="${gf(i, "kind")}">Attention type</label>
          <select id="${gf(i, "kind")}">${GROUP_KINDS.map(([k, l]) =>
            `<option value="${k}"${g.kind === k ? " selected" : ""}>${escapeHtml(l)}</option>`).join("")}</select>
        </div>
      </div>
      ${groupFieldsHtml(i, g)}
    </div>`).join("");

  // Changing the KIND changes WHICH fields exist, so that one re-renders the block
  // from the edited values before recomputing; everything else just recomputes.
  for (let i = 0; i < state.archGroups.length; i++) {
    $(gf(i, "kind"))?.addEventListener("change", () => {
      const next = readArchGroups() ?? state.archGroups;
      renderArchGroups(next);
      onLiveInput();
    });
    for (const k of ["layers", "heads", "dim", "tensors", "window", "lora", "rope"]) {
      $(gf(i, k))?.addEventListener("input", onLiveInput);
    }
  }
}

/**
 * Read the editor back into engine group shape.
 *
 * A blank or unparseable field falls back to the PRESET's value for that field
 * rather than propagating as a refusal: mid-typing states would otherwise blank the
 * whole comparison, and since v0.3 a refusal legitimately stops the sizing (§6.6.4).
 */
function readArchGroups() {
  const base = state.archGroups;
  if (!Array.isArray(base) || base.length === 0) return null;
  if (!$(gf(0, "kind"))) return null;
  return base.map((b, i) => {
    const n = (k, fallback) => {
      const v = intInput(gf(i, k));
      return v === null || !Number.isFinite(v) || v <= 0 ? fallback : v;
    };
    const kind = $(gf(i, "kind"))?.value ?? b.kind;
    const g = { kind, layers: n("layers", b.layers) };
    if (kind === "linear") return g;
    if (kind === "mla") {
      // Switching kind can ask for a field the preset group never had; the
      // engine's own count() would refuse, so a neutral 1 keeps the edit alive
      // and visible instead of blanking the screen mid-experiment.
      g.kv_lora_rank = n("lora", b.kv_lora_rank ?? 1);
      g.qk_rope_head_dim = n("rope", b.qk_rope_head_dim ?? 1);
      return g;
    }
    g.kv_heads = n("heads", b.kv_heads ?? 1);
    g.head_dim = n("dim", b.head_dim ?? 1);
    g.tensors = n("tensors", b.tensors ?? 2);
    if (kind === "sliding") g.window_tokens = n("window", b.window_tokens ?? null);
    return g;
  });
}

// Selecting a model fills the fields a user would otherwise have to look up in a
// config.json. Every one stays editable — the preset is a starting point, not a lock.
function applyModelPreset(id) {
  const m = state.servingData?.models.find((x) => x.id === id);
  if (!m) return;
  $("f-sv-params").value = m.params_b;
  $("f-sv-active").value = m.active_params_b;
  $("f-sv-ctx").value = String(m.context_default);
  $("f-sv-kvbytes").value = "";
  renderArchGroups(m.groups);
  onLiveInput();
}

// Which sentence describes this stack. Order matters: a hybrid is named by the
// property that changes the answer most, and "no growing cache at all" outranks
// "some layers slide", which outranks "everything is retained".
function archKeyOf(spec, preset) {
  if (spec?.kv_override) return preset?.architecture;
  const kinds = new Set((spec?.groups ?? []).map((g) => g.kind));
  if (kinds.has("linear")) return "gdn";
  if (kinds.has("mla")) return "mla";
  if (kinds.has("sliding")) return "sliding";
  if (kinds.has("full")) return "full";
  return preset?.architecture;
}

const ARCH_WORDS = {
  full: "Full attention — every layer keeps every token, so memory grows straight up with context.",
  sliding: "Sliding window — most layers only remember the last stretch of tokens, so long context stays affordable.",
  gdn: "Gated DeltaNet hybrid — most layers keep no growing cache at all, only the few full-attention ones do.",
  mla: "Latent attention — the cache is compressed before it is stored, so it stays small at long context.",
};

// The model spec actually handed to the engine: the preset's layer structure,
// with the user's own numbers on top.
function currentModelSpec() {
  const m = state.servingData?.models.find((x) => x.id === $("f-sv-model").value);
  if (!m) return null;
  const spec = {
    ...m,
    params_b: decInput("f-sv-params") ?? m.params_b,
    active_params_b: decInput("f-sv-active") ?? m.active_params_b,
  };
  // The architecture editor is authoritative over the preset when it is hydrated,
  // so an edited kind, layer count, window or MLA dimension reaches the engine.
  const edited = readArchGroups();
  if (edited) spec.groups = edited;
  const kvOverride = decInput("f-sv-kvbytes");
  if (kvOverride !== null) {
    // A flat bytes-per-token figure carries NO layer structure, so it cannot
    // express retention: a sliding window stops applying the moment you override.
    // Taken at the KV precision already selected, which is why the element size
    // passed alongside it is 1 — the user's number is the whole per-token cost.
    spec.groups = [{ kind: "full", layers: 1, tensors: 1, kv_heads: 1, head_dim: kvOverride }];
    spec.kv_override = true;
  }
  return spec;
}

// Solve the roofline for an ARBITRARY accelerator against the current model
// selection. Two distinct outcomes, and the difference matters downstream:
//   null  -> this accelerator has no published bandwidth, so the caller should
//            fall back to the v0.2 per-accelerator constant. Returning null
//            rather than throwing keeps such a provider IN the rented table.
//   throw -> ServingRefusal: the model genuinely does not fit at any TP size.
//            rentedGpuByProvider catches this and reports the provider as
//            unpriceable WITH the reason, which is the honest answer.
function solveServingFor(gpuId) {
  const d = state.servingData;
  if (!d) return null;
  const acc = d.accelerators?.[gpuId];
  const vramGb = state.gpuPricing?.gpus?.[gpuId]?.vram_gb;
  if (!acc || vramGb === undefined) return null;
  const model = currentModelSpec();
  if (!model) return null;

  const wq = d.weight_quantization[$("f-sv-wquant").value];
  const kq = d.kv_quantization[$("f-sv-kvquant").value];
  const rt = d.runtimes[$("f-sv-runtime").value];
  const interactive = $("f-sv-mode").value === "interactive";

  return servingPlan({
    model,
    contextTokens: decInput("f-sv-ctx") ?? model.context_default,
    bytesPerParam: wq.bytes_per_param,
    // An override is already the whole per-token cost (see currentModelSpec).
    kvBytesPerElement: model.kv_override ? "1" : kq.bytes_per_element,
    vramGb: String(vramGb),
    bandwidthGbS: acc.bandwidth_gb_s,
    runtimeEfficiency: rt.bandwidth_efficiency,
    tpEfficiency: d.tensor_parallel.efficiency_per_extra_gpu,
    vramOverheadFraction: d.vram_overhead_fraction.value,
    // In batch mode there is no floor to hold, so batch is bounded only by
    // memory — the classic throughput-vs-latency trade, made explicit.
    perStreamFloorTokS: interactive ? (decInput("f-tps-stream") ?? "30") : null,
    maxBatch: intInput("f-sv-maxbatch"),
  });
}

// The plan for the SELECTED self-hosted accelerator. Records the REASON on
// state.servingGap rather than throwing, because a model that does not fit is a
// normal answer the fit panel must render, not a crash.
function buildServingPlan() {
  state.serving = null;
  state.servingGap = null;
  state.servingRefusal = null;
  if (!state.servingData) return null;
  const gpuId = $("f-sh-gpu").value;
  try {
    const p = solveServingFor(gpuId);
    if (!p) {
      state.servingGap = `no memory-bandwidth figure is published here for "${gpuId}", so the fleet falls back to the per-accelerator planning constant instead of this model.`;
      return null;
    }
    state.serving = p;
    return p;
  } catch (e) {
    // The two outcomes are NOT interchangeable, and collapsing them was a real
    // defect: a null above means the DATA is missing, which SPEC §6.6.6 says the
    // v0.2 constant legitimately covers; a ServingRefusal means the model does not
    // physically fit, which §6.6.4 says is "never a silent fallback". The refusal
    // is recorded here and re-raised by computeDemand, so an impossible fleet is
    // not priced — only a measured figure, which outranks the roofline, may pass it.
    if (e instanceof ServingRefusal) {
      state.servingGap = e.message;
      state.servingRefusal = e;
      return null;
    }
    state.servingGap = `serving model error — ${e.message}`;
    return null;
  }
}

function renderServingNote() {
  const d = state.servingData;
  const m = d?.models.find((x) => x.id === $("f-sv-model").value);
  if (!m) return;
  const spec = currentModelSpec();
  let kvText = "—";
  try {
    const kq = d.kv_quantization[$("f-sv-kvquant").value];
    const bytes = kvBytesPerToken(spec.groups, spec.kv_override ? "1" : kq.bytes_per_element);
    kvText = `${groupInt(formatHalfUp(bytes, 0))} B/token`;
  } catch { kvText = "not computable from this configuration"; }

  const moe = spec && Number(spec.active_params_b) < Number(spec.params_b)
    ? ` Mixture-of-experts: all ${escapeHtml(String(spec.params_b))}B sit in memory, only ${escapeHtml(String(spec.active_params_b))}B are read per token.` : "";
  // Described from the groups ACTUALLY in play, not from the preset's label — an
  // edited architecture that still read "full attention" would be a lie on screen.
  $("sv-note").innerHTML = `${escapeHtml(ARCH_WORDS[archKeyOf(spec, m)] ?? "")} <strong>${escapeHtml(kvText)}</strong> of cache per token.${moe}`;

  // The claim on screen must match the provenance the row actually has. A derived
  // row was read by a script minutes ago and checked by nobody; saying it was
  // "verified" would be the kind of borrowed confidence this calculator exists to
  // refuse, and it is exactly the sentence a buyer would quote back.
  let cite;
  if (m.basis === "derived") {
    const activeWords = m.active_params_basis === "declared"
      ? `Active parameters are the vendor's own figure from the model name.`
      : m.active_params_basis === "derived"
        ? `Active parameters are <span class="tag tag-est">computed</span> from the config's expert geometry — no vendor figure was published, and the computation was accepted only because it reproduced the Hub's total parameter count to within 2%.`
        : `Every parameter is read each step; this model has no routed experts.`;
    cite = `<span class="tag tag-est">config-derived</span> Layer structure read automatically from <a href="${escapeHtml(m.config_url ?? m.source_url)}" rel="nofollow noopener">the model's own config.json</a> on ${escapeHtml(String(m.observed_at ?? "an unrecorded date"))}, and parameter counts from <a href="${escapeHtml(m.source_url)}" rel="nofollow noopener">its safetensors index</a>. No independently published per-token KV figure exists for this model, so unlike the verified presets nothing cross-checks the arithmetic below against an outside source. ${activeWords}`;
  } else if (m.source_url) {
    cite = `<span class="tag tag-exact">verified</span> Layer structure cited from <a href="${escapeHtml(m.source_url)}" rel="nofollow noopener">the published architecture</a>, verified against the model's own config, and its published per-token KV figure is asserted exactly by the test suite.`;
  } else {
    cite = `Nothing in this preset is cited — it is a starting shape for your own numbers.`;
  }
  const ovr = spec?.kv_override
    ? ` <span class="tag tag-est">override active</span> Your bytes-per-token figure replaces the layer structure, so window-based retention no longer applies and the figure is taken at the precision you already chose.`
    : "";
  $("sv-arch-note").innerHTML = `${cite}${ovr} ${escapeHtml(m.note ?? "")}`;
}

// The fit panel — the answer to "will this even run, and how fast".
function renderFitPanel() {
  const p = state.serving;
  const box = $("fit");
  if (!p) {
    // What happens NEXT differs by which of the two outcomes this is, so the panel
    // must not promise a fallback comparison that a refusal now correctly stops.
    const overridden = state.sizingBasis === "user_override";
    const after = state.servingRefusal
      ? overridden
        ? "Your measured tok/s per GPU outranks the model, so the comparison below still runs on it. Clear that field and the comparison stops rather than pricing a fleet that cannot hold the model."
        : "The comparison below does not run: sizing a fleet that cannot hold this model would put a price on a configuration you cannot buy."
      : "The comparison below still runs on the per-accelerator planning constant.";
    box.innerHTML = state.servingGap
      ? `<div class="card"><h3>Fit &amp; speed</h3><div class="gap"><strong>This configuration does not serve:</strong> ${escapeHtml(state.servingGap)}</div>
         <p class="muted">Try a smaller model, a lower precision, a shorter context, or a bigger accelerator. ${escapeHtml(after)}</p></div>`
      : "";
    return;
  }
  const gpuLabel = $("f-sh-gpu").selectedOptions[0]?.textContent ?? "";
  const d = state.servingData;
  const rtKey = $("f-sv-runtime").value;
  const rows = [
    ["formula", "t_step = (weights_read + batch x kv_per_seq) / (gpus x bandwidth x efficiency)"],
    ["weights read per step", `${p.weights_gb_read_per_step.text} GB`],
    ["weights resident", `${p.weights_gb_resident.text} GB`],
    ["KV per sequence", `${p.kv_gb_per_sequence.text} GB`],
    ["KV per token", `${groupInt(p.kv_bytes_per_token.text)} B`],
    ["bandwidth", `${d.accelerators[$("f-sh-gpu").value]?.bandwidth_gb_s ?? "—"} GB/s x ${d.runtimes[rtKey].bandwidth_efficiency} efficiency`],
    ["tensor parallel", `${p.gpus_per_replica}`],
    ["batch limited by", p.batch_bound_by],
    ["basis", "modelled from a bandwidth roofline — decode only, prefill not counted"],
  ];
  const tight = Number(p.batch.text) <= 2;
  return void (box.innerHTML = `<div class="card">
    <h3>Fit &amp; speed <span class="tag tag-est">modelled</span>${
      state.sizingBasis === "user_override"
        ? ` <span class="tag tag-unknown">did not size the fleet</span>`
        : ""}</h3>${
      state.sizingBasis === "user_override"
        ? `<p class="muted" style="margin:0 0 9px">Your measured tok/s per GPU outranks the model, so the numbers below describe what the roofline predicts &mdash; the fleet and the costs were sized from your figure.</p>`
        : ""}
    <div class="kpi">
      <div><label>Fits on</label><div class="v">${numProv(`${p.gpus_per_replica} &times; ${escapeHtml(gpuLabel)}`, rows)}</div></div>
      <div><label>VRAM used / usable</label><div class="v">${p.vram_gb_used_per_gpu.text} / ${p.vram_gb_usable_per_gpu.text} GB</div></div>
      <div><label>Requests at once</label><div class="v">${numProv(p.batch.text, rows)}</div></div>
      <div><label>Speed per user</label><div class="v">${p.per_stream_tokens_s.text} <span class="muted">tok/s</span></div></div>
      <div><label>Tokens/s per GPU</label><div class="v">${numProv(p.tokens_s_per_gpu.text, rows)}</div></div>
      <div><label>KV per request</label><div class="v">${p.kv_gb_per_sequence.text} <span class="muted">GB</span></div></div>
    </div>
    ${tight ? `<div class="gap"><strong>Only ${p.batch.text} request${p.batch.text === "1" ? "" : "s"} at a time.</strong> At this size and context there is almost no room left for concurrency, so throughput per GPU collapses. Shorter context or lower precision buys the most back.</div>` : ""}
    <p class="muted">Limited by <strong>${escapeHtml(p.batch_bound_by)}</strong>. Throughput is <span class="tag tag-est">assumed</span> — it rests on a stated bandwidth-efficiency figure, not a benchmark, and never backs a p95 verdict. Prefill is not modelled, so a long-prompt workload will run slower than this.</p>
  </div>`);
}

// ------------------------------------------------- level 0: workload presets
// Presets are PLANNING ASSUMPTIONS, never measurements. Selecting one fills
// exactly the inputs a user would otherwise type; every field stays editable.
async function loadWorkloadPresets() {
  const res = await fetch("./tco-calculator/data/workload-presets.json");
  state.workloadPresets = await res.json();
  const wrap = $("preset-cards");
  wrap.innerHTML = state.workloadPresets.presets.map((p) =>
    `<button type="button" class="chip" role="radio" aria-checked="false" data-preset="${escapeHtml(p.id)}">${escapeHtml(p.label)}</button>`
  ).join("");
  for (const b of wrap.querySelectorAll(".chip")) {
    b.addEventListener("click", () => applyWorkloadPreset(b.dataset.preset));
  }
  applyWorkloadPreset(state.workloadPresets.presets[0].id);
}

function applyWorkloadPreset(id) {
  const p = state.workloadPresets.presets.find((x) => x.id === id);
  if (!p) return;
  for (const btn of $("preset-cards").querySelectorAll(".chip")) {
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
  onLiveInput();
}

// ------------------------------------------------------------ input plumbing
function wireInputs() {
  $("fb-feed").addEventListener("change", () => fillModels(beginSelection()));
  $("run").addEventListener("click", run);
  $("mix-balance").addEventListener("click", balanceMix);
  const live = [
    "f-users", "f-sessions-day", "f-days",
    "f-mix-chat", "f-mix-rag", "f-mix-graphrag", "f-mix-agentic",
    "f-peak-frac", "f-tps-stream", "f-sh-tps-gpu", "f-sh-count",
    // v0.3: the model IS a sizing input, not a detail. Editing its size, context
    // or precision moves the fleet, so each one drives the same recompute.
    "f-sv-params", "f-sv-active", "f-sv-ctx", "f-sv-maxbatch", "f-sv-kvbytes",
    ...Object.values(MIX_FIELD).flatMap((f) => [`f-${f}-turns`, `f-${f}-in`, `f-${f}-out`, `f-${f}-cached`]),
  ];
  for (const id of live) $(id)?.addEventListener("input", onLiveInput);
  // Selects fire `change`, not `input`. f-sh-gpu belongs here because the
  // accelerator decides bandwidth and VRAM, which decides the whole plan.
  for (const id of ["f-sv-wquant", "f-sv-kvquant", "f-sv-runtime", "f-sv-mode", "f-sh-gpu"]) {
    $(id)?.addEventListener("change", onLiveInput);
  }
  fillModels(beginSelection());
}

// The headline recomputes as you type. A calculator with a button you must
// remember to press gets read wrong by somebody eventually — they change a
// number, see a stale total, and quote it. The button stays, for an explicit
// re-pull, but it is no longer what makes the answer correct.
let liveTimer = null;
function onLiveInput() {
  refreshDerived();
  if (!state.ready) return; // init is still wiring; the catalog may not be loaded
  clearTimeout(liveTimer);
  liveTimer = setTimeout(run, 220);
}

// Mixes that do not sum to 1 are the single most common way this screen gets
// stuck, and the arithmetic to fix it is exactly the arithmetic the user came
// here to avoid doing. One button, and it says where the remainder went.
function balanceMix() {
  const check = validateMix(readMix());
  if (check.ok) return;
  const others = ["rag", "graphrag", "agentic"].reduce(
    (acc, f) => acc.add(Dec.from(decInput(`f-mix-${f}`) ?? "0")), Dec.from("0"));
  const rest = Dec.from("1").sub(others);
  $("f-mix-chat").value = rest.sign() < 0 ? "0" : formatHalfUp(rest, 4).replace(/0+$/, "").replace(/\.$/, "");
  onLiveInput();
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
  // v0.3: solve what this accelerator actually delivers for THIS model before
  // sizing the fleet. A null plan is not a failure — it is the v0.2 fallback,
  // and gpusForLoad keeps the per-accelerator constant path for exactly that.
  const serving = buildServingPlan();
  const override = decInput("f-sh-tps-gpu");
  // A configuration the roofline REFUSED is not priced from the v0.2 constant.
  // That fallback exists for an accelerator with no published bandwidth (§6.6.6),
  // not for a model that cannot fit (§6.6.4). A measured figure outranks the
  // roofline, so it — and only it — may proceed past a refusal.
  if (state.servingRefusal && override === null) throw state.servingRefusal;
  const sizing = gpusForLoad({
    peakTokensPerSecond: peak.peak_tokens_s.text,
    gpuId,
    tokensPerSecondPerGpu: override,
    serving,
  });
  // Which input ACTUALLY sized the fleet. gpusForLoad gives the override
  // precedence, so branching on `serving` being truthy would credit the roofline
  // for a fleet the user's own benchmark sized — and print replica topology the
  // override path never produced.
  const sizingBasis = override !== null ? "user_override"
    : sizing.serving_basis === "roofline" ? "roofline"
    : "assumed";
  state.sizingBasis = sizingBasis;
  return { demand, peak, sizing, gpuId, serving, sizingBasis };
}

// The live readout under the demand inputs. It must never show a number derived
// from an invalid mix — a refusal is displayed instead, in full.
function refreshDerived() {
  const mixCheck = validateMix(readMix());
  const sumEl = $("mix-sum");
  const balanceBtn = $("mix-balance");
  if (mixCheck.ok) {
    sumEl.innerHTML = `<span class="tag tag-exact">sums to 1</span>`;
    if (balanceBtn) balanceBtn.hidden = true;
  } else if (mixCheck.code === "mix_does_not_sum_to_one") {
    sumEl.innerHTML = `<span class="tag tag-est">sums to ${escapeHtml(mixCheck.sum_text)}</span>`;
    if (balanceBtn) balanceBtn.hidden = false;
  } else {
    sumEl.innerHTML = `<span class="tag tag-unknown">invalid</span>`;
    if (balanceBtn) balanceBtn.hidden = true;
  }

  renderServingNote();

  try {
    const { demand, peak, sizing, serving, sizingBasis } = computeDemand();
    state.demand = { demand, peak, sizing };
    if (!$("f-sh-tps-gpu").value.trim()) $("f-sh-tps-gpu").placeholder = `${sizing.tokens_s_per_gpu.text} (${serving ? "from the model" : "assumed"})`;
    $("f-sh-count-hint").textContent = `— ${sizing.gpus_required.text} needed at peak`;
    if (!$("f-sh-count").value.trim()) $("f-sh-count").placeholder = `${sizing.gpus_required.text} (derived)`;

    const perStreamWarn = peak.below_interactive_floor
      ? ` <span class="tag tag-est">below ${peak.interactive_floor_tokens_s.text} tok/s</span> at this per-stream rate an interactive answer reads as slow`
      : "";
    // Where tokens/s per GPU CAME FROM is the number the whole comparison turns
    // on, so it carries its basis inline rather than only inside a popover.
    const gpuBasis = sizingBasis === "roofline"
      ? `solved from ${escapeHtml($("f-sv-model").selectedOptions[0]?.textContent ?? "the model")} at ${groupInt(serving.context_tokens.text)} tokens of context`
      : sizingBasis === "user_override" ? "your measured figure, which outranks the model"
      : "a per-accelerator planning constant, not this model";
    const card = `<strong>${sizing.gpus_required.text}</strong> &times; ${escapeHtml($("f-sh-gpu").selectedOptions[0]?.textContent ?? "")}`;
    // Replica topology exists ONLY on the roofline path — gpusForLoad's override
    // and constant paths size a flat count and return no replicas, so printing
    // "? copies" there was the renderer inventing a structure that was never solved.
    const fleet = sizingBasis === "roofline"
      ? `${card} &mdash; ${sizing.replicas.text} cop${sizing.replicas.text === "1" ? "y" : "ies"} of the model, ${serving.gpus_per_replica} GPU${serving.gpus_per_replica === 1 ? "" : "s"} each`
      : card;

    $("derived").innerHTML = `
      <div class="kpi">
        <div><label>Sessions / month</label><div class="v">${groupInt(demand.sessions_mo.text)}</div></div>
        <div><label>Turns / month</label><div class="v">${groupInt(demand.turns_mo.text)}</div></div>
        <div><label>Tokens / month</label><div class="v">${groupInt(demand.tokens_mo.text)}</div></div>
        <div><label>Peak tokens / s</label><div class="v">${peak.peak_tokens_s.text}${perStreamWarn}</div></div>
      </div>
      <p class="muted" style="margin:14px 0 0">
        ${groupInt(peak.concurrent_peak.text)} concurrent sessions at peak &middot;
        in ${groupInt(demand.in_tokens_mo.text)} / out ${groupInt(demand.out_tokens_mo.text)} / cached ${groupInt(demand.cached_tokens_mo.text)} tokens per month &middot;
        ${fleet}
        to hold the peak at ${sizing.tokens_s_per_gpu.text} tok/s per GPU
        <span class="tag ${sizing.assumed ? "tag-est" : "tag-exact"}">${escapeHtml(gpuBasis)}</span>
      </p>`;
  } catch (e) {
    state.demand = null;
    state.sizingBasis = null;
    // A ServingRefusal here is the model not fitting, which is an ANSWER, not a
    // crash — it must read like one rather than as "input problem — ...".
    const why = (e instanceof DemandRefusal || e instanceof ServingRefusal)
      ? e.message : `input problem — ${e.message}`;
    const what = e instanceof ServingRefusal ? "This configuration cannot be served" : "Demand not computed";
    $("derived").innerHTML = `<div class="gap"><strong>${what}:</strong> ${escapeHtml(why)}</div>`;
  }

  renderFitPanel();
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

  // v0.5: hardware capex is DERIVED from the sized fleet and the chosen server,
  // and an entered figure outranks it. Before this the field shipped value="0",
  // so paybackMonths returned zero_capex on the DEFAULT scenario and the payback
  // block — the one this calculator exists to produce — was dead out of the box.
  // Only the base scenario publishes to state — the sensitivity grid's reruns
  // must not repaint the notes that describe THIS one.
  const capexPlan = buildCapexPlan(gpuCount, usersOverride === null);
  const capexEntered = decInput("f-sh-capex");
  const capex = capexEntered ?? (capexPlan ? capexPlan.capex : "0");

  const laneA = {
    enabled: true,
    fixed_monthly: decInput("f-sh-fixed") ?? "0",
    capex,
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
      rentSizing = gpusForLoad({
        peakTokensPerSecond: peak.peak_tokens_s.text,
        gpuId: rentRow.gpu_id,
        serving: solveServingFor(rentRow.gpu_id),
      });
    } catch (e) {
      // A ServingRefusal is the model not fitting on the RENTED accelerator —
      // as legitimate an answer as a demand refusal, and its message already
      // says which constraint bound, so it must not degrade to "[object Error]".
      rentGap = (e instanceof DemandRefusal || e instanceof ServingRefusal) ? e.message : String(e);
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

  // The licence is priced against the fleet that was just sized. GPU-hours come
  // from the RENTED option's own utilization, because the only hourly meter here
  // is a cloud-marketplace one that applies to that option alone.
  const rentedHours = rentSizing ? rentGpus * 730 * Number(decInput("f-rent-util") ?? "0.7") : null;
  const subPlan = buildSubPlan({
    gpusRequired: gpuCount,
    gpuId,
    users: Math.round(Number(demand.users.text)),
    gpuHours: rentedHours === null ? null : Math.round(rentedHours),
    nodes: capexPlan ? capexPlan.nodes : null,
  }, usersOverride === null);

  // One-time per option. A is the hardware capex (already on laneA.capex, so it
  // is NOT repeated here — the engine adds it). B and C carry their own upfronts,
  // which before v0.5 had nowhere to go and silently read as zero.
  const oneTime = {
    B: decInput("f-onetime-b") ?? "0",
    C: decInput("f-onetime-c") ?? "0",
  };

  return {
    demand, peak, sizing, gpuId, rentRow, rentGap, capexPlan, subPlan,
    inputs: {
      workload,
      catalog: state.catalog ?? { offers: {} },
      laneA, laneB, laneC, routing, overlay,
      subscription: subPlan,
      oneTime,
    },
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
    renderServerNote();
    renderSubNote();
  } catch (e) {
    if (e instanceof DemandRefusal || e instanceof ServingRefusal) {
      // Clear both output surfaces. Leaving the previous run's totals and verdict
      // standing under a refusal is how an impossible configuration keeps a price
      // tag — and the verdict is exactly the number a buyer reads first.
      state.result = null;
      $("results").innerHTML = "";
      $("verdict").innerHTML = "";
      showGap(escapeHtml(e.message));
      return;
    }
    // The visible gap can be overwritten by a later async load, so the stack also
    // goes to the console — a comparison that fails silently is the worst outcome.
    console.error("comparison failed", e);
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
    // v0.3: and on the SAME model, so a provider's rank reflects what this model
    // actually costs to serve there. A refusal propagates — rentedGpuByProvider
    // turns it into an explained "not priced" row rather than a silent drop.
    sizeFor: (gpuId) => gpusForLoad({
      peakTokensPerSecond: d.peak.peak_tokens_s.text,
      gpuId,
      serving: solveServingFor(gpuId),
    }),
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

  // Reason codes are engine vocabulary; on a sales-facing surface they have to
  // read as English. Unmapped codes pass through rather than being swallowed.
  const WHY = {
    no_viable_configuration: "this model does not fit on that accelerator",
    unknown_gpu: "no throughput assumption for that accelerator",
    zero_capacity: "no GPUs required at this load",
    zero_throughput: "the plan delivers no tokens/s",
    sizing_failed: "could not be sized",
  };
  const missing = cmp.unservable.length
    ? `<p class="muted">Not priced: ${[...new Set(cmp.unservable.map((u) => `${u.provider_label} (${u.gpu_id} — ${WHY[u.reason] ?? u.reason})`))].map(escapeHtml).join(", ")}. An unpriceable provider is reported rather than dropped — vanishing from the table would read as "not offered" when the truth is "not modelled".</p>`
    : "";

  return `<div class="card">
    <h3>${OPTION.C.label} — every provider in the registry, priced for this load</h3>
    <table>
      <thead><tr><th>Provider</th><th>Accelerator</th><th class="n">GPUs</th><th class="n">$/GPU-hr</th><th class="n">Cost / month</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    ${pickGap}
    <p class="muted">The cheapest SKU per provider that holds ${d.peak.peak_tokens_s.text} tok/s at peak, each sized on its own accelerator${state.serving ? " running the model you selected" : ""} — so providers rank by delivered capacity, not by sticker rate. <span class="tag tag-exact">first-party</span> is the vendor's own published price list; <span class="tag tag-est">indicative</span> is a public aggregator, an order-of-magnitude planning figure rather than a quote.</p>
    ${missing}
  </div>`;
}

function renderResults(r) {
  const B = r.lanes.B;
  const q = B.primary_offer ? B.quotes[B.primary_offer] : null;
  const digest = [["snapshot digest", state.manifest.snapshot_digest]];

  // v0.5: the monthly column carries the licence wherever it applies, because
  // the cumulative column beside it does. An infra-only monthly sitting next to
  // a licence-inclusive total invites the reader to subtract one from the other
  // and arrive at a figure that is in neither — so both columns are stated on
  // the same basis, and the hover decomposes it into infrastructure + licence.
  const monthlyCell = (k, fallback) => {
    const row = r.totals?.[k];
    return row && row.priced ? row.monthly_total : fallback;
  };
  const monthlyProv = (k) => {
    const row = r.totals?.[k];
    if (!row || !row.priced) return [];
    const licAmount = row.subscription_applies ? moneyValue(row.subscription_monthly) : null;
    const lic = licAmount !== null && licAmount !== undefined && licAmount.sign() > 0
      ? [["platform licence", `${money(row.subscription_monthly)} / month`]]
      : (r.subscription ? [["platform licence", "not applicable to this option"]] : []);
    return [["infrastructure", `${money(row.infra_monthly)} / month`], ...lic];
  };

  const rows = [`<tr><td>${OPTION.B.label} — <code>${escapeHtml(B.primary_offer ?? "none")}</code>${srcTag(q)}</td>` +
    `<td class="n">${B.monthly_total === null ? "—" : numProv(money(monthlyCell("B", B.monthly_total)), [...quoteRows(B.primary_offer, q), ...monthlyProv("B")])}</td>` +
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
      + `<td class="n">${numProv(money(monthlyCell("A", A.monthly_total)), [...aRows, ...monthlyProv("A")])}</td>`
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
      + `<td class="n">${numProv(money(monthlyCell("C", C.monthly_total)), [...cRows, ...monthlyProv("C")])}</td>`
      + `<td class="n">${per1mC}</td>`
      + `<td class="n">${numProv(money(r.curve[0].C), cRows)}</td></tr>`);
  }

  const rec = (r.routing_result.recommended_monthly_total === null || r.routing_result.recommended_monthly_total === undefined) ? "" :
    `<div class="card" style="margin-bottom:14px"><h3 style="margin:0 0 6px">Recommended — send ${escapeHtml(policyWords(r.policy))}</h3><div style="font-size:1.6rem;font-weight:700">${numProv(money(r.routing_result.recommended_monthly_total), [["policy", r.policy], ["basis", "engine-derived result under the declared routing policy"], ...digest])}<span class="muted" style="font-size:.85rem"> / month at the entered demand</span></div></div>`;

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
        <thead><tr><th>Option · sending ${escapeHtml(policyWords(r.policy))}</th><th class="n">Cost / month</th><th class="n">${r.overlay ? r.overlay.label.replaceAll("_", " ") : "infra per 1M"}</th><th class="n">1 month total</th></tr></thead>
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
  const box = $("verdict");
  if (!box) return;

  const cards = OPTION_KEYS.map((k) => {
    const lane = r.lanes[k];
    const on = lane.enabled && lane.monthly_total != null;
    // Promote to Rat up front. A total can arrive as a Dec OR as a
    // non-terminating Rat, and Dec.sub(Rat) throws outright ("a non-terminating
    // Rational cannot become a Decimal"). Every Dec converts to a Rat losslessly
    // but not the reverse, so normalising once here makes both the comparison
    // and the difference below total, whatever the two lanes happen to be.
    // Rank on the v0.5 combined monthly (infra + licence where it applies), not
    // on the infra line: with a licence charged to two of the three options, an
    // infra-only ranking would print "lowest" on a card whose own displayed
    // monthly is higher than a rival's. The engine's totals block is the same
    // number the card renders, so the badge and the figure cannot disagree.
    const combined = r.totals?.[k]?.priced ? r.totals[k].monthly_total : lane.monthly_total;
    return { k, label: OPTION[k].label, color: OPTION[k].color, on, value: on ? Rat.from(moneyValue(combined)) : null };
  });

  // Cheapest is decided on the EXACT values, never on the formatted strings —
  // "$9.90" sorts above "$10.00" as text, and that is a wrong answer in dollars.
  let best = null;
  for (const c of cards) {
    if (!c.on) continue;
    if (best === null || c.value.lt(best.value)) best = c;
  }

  // The horizon total is the figure a buyer actually signs for: everything
  // recurring across the horizon PLUS everything paid once. Ranking on monthly
  // alone hides a six-figure capex behind a cheaper-looking monthly, which is
  // precisely why one-time costs had to reach the totals in v0.5. Both are shown;
  // "lowest" still refers to the monthly, and the card says so.
  const t = r.totals ?? {};
  const months = r.horizon_months ?? 1;
  box.innerHTML = cards.map((c) => {
    const win = best && c.k === best.k;
    const dot = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${c.color};margin-right:6px;vertical-align:1px"></span>`;
    const sub = !c.on
      ? `not costed &mdash; see the note above`
      : win ? `lowest monthly of the modelled options` : `${money(c.value.sub(best.value))} more per month`;
    const row = t[c.k];
    const once = row && row.one_time !== null && moneyValue(row.one_time) !== null && moneyValue(row.one_time).sign() > 0
      ? `<div class="s">+ ${money(row.one_time)} one-time</div>` : "";
    const lic = row && row.priced && row.subscription_applies && moneyValue(row.subscription_monthly).sign() > 0
      ? `<div class="s">includes ${money(row.subscription_monthly)}/mo licence</div>`
      : (r.subscription && row && row.priced && !row.subscription_applies
        ? `<div class="s" style="opacity:.6">no platform licence &mdash; not applicable here</div>` : "");
    const horizon = row && row.horizon_total !== null && row.horizon_total !== undefined
      ? `<div class="s" style="margin-top:4px;border-top:1px solid rgba(232,230,240,.12);padding-top:4px">${money(row.horizon_total)} over ${months} month${months === 1 ? "" : "s"}</div>`
      : "";
    return `<div class="vcard${win ? " best" : ""}">
      <h4>${dot}${escapeHtml(c.label)}${win ? ` <span class="tag tag-exact">lowest</span>` : ""}</h4>
      <div class="n">${c.on ? money(row && row.priced ? row.monthly_total : c.value) : "&mdash;"}</div>
      <div class="s">${sub}</div>
      ${lic}${once}${horizon}
    </div>`;
  }).join("");
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
    // v0.5: the hardware the capex was derived from travels with the quote. A
    // price band with no citation is not reviewable, so the row's source and
    // its verification status ship beside the number.
    server_config: state.capexPlan
      ? {
          server_id: state.capexPlan.server_id,
          label: state.capexPlan.label,
          gpu_id: state.capexPlan.gpu_id,
          price_basis: state.capexPlan.price_basis,
          unit_price: state.capexPlan.unit_price,
          nodes: state.capexPlan.nodes,
          gpus_required: state.capexPlan.gpus_required,
          gpus_provisioned: state.capexPlan.gpus_provisioned,
          gpus_overprovisioned: state.capexPlan.gpus_overprovisioned,
          capex: state.capexPlan.capex,
          confidence: state.capexPlan.confidence,
          source_url: state.capexPlan.source_url,
          observed_at: state.capexPlan.observed_at,
          verification: state.capexPlan.verification,
        }
      : { unavailable: state.capexGap },
    // Which of the two the engine actually charged. An entered figure outranks
    // the derived one, and a quote that does not say which was used cannot be
    // audited against the registry it cites.
    capex_basis: $("f-sh-capex").value.trim() === "" ? "derived" : "user_override",
    // The licence's meter and its amount have different authorities, so both
    // provenance fields travel — collapsing them would present an aggregator's
    // estimate as a vendor list price.
    subscription_source: state.subPlan ? { ...state.subPlan } : { unavailable: state.subGap },
    result: {
      policy: r.policy,
      options: named,
      routing_result: r.routing_result,
      payback: r.payback,
      breakeven: r.breakeven,
      throughput: r.throughput,
      overlay: r.overlay,
      // The three v0.5 additions: the licence as applied (with the options it
      // was and was NOT charged to), the one-time roll-up per option, and the
      // combined totals the verdict cards rank on. lanes[] stays infra-only, so
      // without these a reader of the quote could not reproduce the ranking.
      subscription: r.subscription,
      one_time: r.one_time,
      totals: r.totals,
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