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
const money = (x) => "$" + formatHalfUp(x instanceof Dec || x instanceof Rat ? x : Dec.from(String(x)), 2);
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
    const where = String(e.stack ?? "").split("\n").slice(1, 6).join(" | ");
    showGap(`the comparison could not run: ${escapeHtml(e.message)} <br><code>${escapeHtml(where)}</code>`);
  }
}

const srcTag = (quote) => quote && quote.exact
  ? `<span class="tag tag-exact">exact</span>`
  : `<span class="tag tag-est">estimated</span>`;

function numProv(valueHtml, rows) {
  return `<span ${prov(rows)}>${valueHtml}</span>`;
}

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

function renderResults(r) {
  const B = r.lanes.B;
  const q = B.primary_offer ? B.quotes[B.primary_offer] : null;
  const rows = [`<tr><td>Lane B — API <code>${escapeHtml(B.primary_offer ?? "none")}</code>${srcTag(q)}</td>` +
    `<td class="n">${B.monthly_total === null ? "—" : numProv(money(B.monthly_total), quoteRows(B.primary_offer, q))}</td>` +
    `<td class="n">${B.per_1m.value === null ? `— (${B.per_1m.reason})` : numProv(fmtPer1M(B.per_1m.value), quoteRows(B.primary_offer, q))}</td>` +
    `<td class="n">${numProv(money(r.curve[0].B), quoteRows(B.primary_offer, q))}</td></tr>`];
  if (r.lanes.C.enabled) {
    // NOTE: prov rows are extracted — a template literal nested inside an array
    // inside a template literal breaks module-goal parsing (found in browser).
    const cRows = [
      ["snapshot digest", state.manifest.snapshot_digest],
      ["hourly rate", r.lanes.C.hourly_rate + " (assumed preset)"],
      ["hours", String(r.lanes.C.hours)],
      ["utilization", String(r.lanes.C.utilization)],
    ];
    const cDigest = [["snapshot digest", state.manifest.snapshot_digest]];
    const per1mC = r.lanes.C.per_1m.value === null
      ? "— (" + (r.lanes.C.per_1m_reason ?? "unknown") + ")"
      : numProv(fmtPer1M(r.lanes.C.per_1m.value), cRows);
    rows.push("<tr><td>Lane C — rented GPU <span class=\"tag tag-est\">assumed rates</span></td>"
      + "<td class=\"n\">" + numProv(money(r.lanes.C.monthly_total), cRows) + "</td>"
      + "<td class=\"n\">" + per1mC + "</td>"
      + "<td class=\"n\">" + numProv(money(r.curve[0].C), cDigest) + "</td></tr>");
  }

  const adv = r.routing_result.advisory
    ? `<p class="muted">Advisory blend ${money(r.routing_result.advisory.total)} — <strong>${escapeHtml(r.routing_result.advisory.status)}</strong>${r.routing_result.advisory.delta ? ` (delta ${money(r.routing_result.advisory.delta)})` : ""}. ${escapeHtml(r.routing_result.advisory.note)}</p>`
    : "";
  const don = r.routing_result.derived_optimum_note
    ? `<p class="muted">Derived optimum for comparison: ${money(r.routing_result.derived_optimum_note.total)} — ${escapeHtml(r.routing_result.derived_optimum_note.note)}</p>`
    : "";

  const beA = r.breakeven.lane_A_vs_B ? `<li>Lane A breakeven vs API: ${numProv(`${formatHalfUp(r.breakeven.lane_A_vs_B.demand_tokens, 0)} tokens/mo`, [["basis", "fixed / API per-token"]])}${r.breakeven.lane_A_vs_B.utilization ? ` (${formatHalfUp(r.breakeven.lane_A_vs_B.utilization, 4)} of capacity)` : ` (${r.breakeven.lane_A_vs_B.utilization_reason})`}</li>` : "";
  const beC = r.breakeven.lane_C_vs_B && r.breakeven.lane_C_vs_B.utilization ? `<li>Lane C breakeven utilization vs API: ${numProv(formatHalfUp(r.breakeven.lane_C_vs_B.utilization, 4), [["basis", "hourly / (tok/s x API per-token)"]])}</li>` : (r.breakeven.lane_C_vs_B ? `<li>Lane C breakeven: ${r.breakeven.lane_C_vs_B.reason}</li>` : "");

  const verdictLi = (label, v) => v === null ? "" : `<li>${label}: <strong>${v.verdict}</strong>${v.verdict === "unknown" ? ` <span class="tag tag-unknown">no evidence row matches all dimensions</span>` : ` @ ${v.modelled_p95_capacity} tok/s`}${v.annotation ? ` <span class="muted">partial: ${v.annotation.mismatched_dimensions.join(", ")} differ</span>` : ""}</li>`;

  const failover = r.routing_result.failover
    ? `<p class="muted">Failover: fallback lane ${escapeHtml(r.routing_result.failover.fallback)} at share ${escapeHtml(r.routing_result.failover.share)} x rate ${escapeHtml(r.routing_result.failover.rate)}.</p>`
    : "";
  const pinned = r.routing_result.pinned
    ? `<p class="muted">Pinned split honored: ${r.routing_result.pinned.lines.map((l) => `${l.lane} ${l.pct}% = ${money(l.amount)}`).join(" · ")} — total ${money(r.routing_result.pinned.total)}.</p>`
    : "";

  $("results").innerHTML = `
    <div class="card">
      <table>
        <thead><tr><th>Lane · policy ${escapeHtml(r.policy)}</th><th class="n">TCO / month</th><th class="n">${r.overlay ? r.overlay.label.replaceAll("_", " ") : "infra per 1M"}</th><th class="n">1 month TCO</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
      ${r.overlay && r.overlay.itemized.length ? `<p class="muted">Overlay itemized last: ${r.overlay.itemized.map((i) => `${escapeHtml(i.name)} ${money(i.extended)} (${i.basis}, ${i.provenance})`).join(" · ")} — total ${money(r.overlay.overlay_total)} · ${escapeHtml(r.overlay.note)}</p>` : ""}
      ${adv}${don}${failover}${pinned}
      ${r.reasons.length ? `<div class="gap"><strong>Honest caveats:</strong> ${r.reasons.map(escapeHtml).join("; ")}</div>` : ""}
      ${B.gaps.map((g) => `<div class="gap"><strong>${escapeHtml(g.offer_id)}</strong>: ${escapeHtml(g.gap_reason ?? "unservable")} — the lane falls back or reports the gap.</div>`).join("")}
      ${q && q.meters ? `<p class="muted">Meter resolution: ${q.meters.map((m) => `${m.meter} &rarr; ${m.selected_key ?? m.note}`).join(" · ")}</p>` : ""}
    </div>
    <div class="card">
      <h3>Breakeven &amp; feasibility</h3>
      <ul style="color:rgba(232,230,240,.72)">${beA}${beC}${verdictLi("Lane A p95 vs SLO", r.throughput.verdicts.lane_A)}${verdictLi("Lane C p95 vs SLO", r.throughput.verdicts.lane_C)}</ul>
      <p class="muted">Feasibility verdicts are evidence-gated: unknown beats invented. The shipped evidence store is empty by mandate (SPEC 6.5).</p>
    </div>
    <div class="card">
      <h3>TCO curve</h3>
      ${renderCurve(r.curve)}
    </div>
    <p><button class="btn btn-s" id="export">Export quote (JSON)</button> <span class="muted">every input, the snapshot digest, and per-meter provenance.</span></p>
  `;
  $("export").addEventListener("click", () => exportQuote(r));
  renderSensitivity();
}

const fmtPer1M = (ratStr) => {
  const m = /^(-?\d+)\/(\d+)$/.exec(String(ratStr));
  const v = m ? new Rat(BigInt(m[1]), BigInt(m[2])) : Dec.from(String(ratStr));
  return formatHalfUp(v, 6);
};

function renderCurve(curve) {
  const w = 900, h = 220, pad = 34;
  const lanes = ["A", "B", "C"];
  const colors = { A: "#B46EFF", B: "#22D3EE", C: "#34D399" };
  const maxV = Math.max(...curve.flatMap((p) => lanes.map((l) => Number(p[l]) || 0)), 1);
  const x = (m) => pad + ((m - 1) / Math.max(1, curve.length - 1)) * (w - pad * 2);
  const y = (v) => h - pad - (v / maxV) * (h - pad * 2);
  const paths = lanes.map((l) => {
    const pts = curve.map((p) => `${x(p.month).toFixed(1)},${y(Number(p[l]) || 0).toFixed(1)}`).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${colors[l]}" stroke-width="2" />`;
  }).join("");
  const labels = lanes.map((l, i) => `<text x="${pad + i * 130}" y="18" fill="${colors[l]}" font-size="12" font-family="monospace">Lane ${l}</text>`).join("");
  const axis = `<text x="${pad}" y="${h - 8}" fill="rgba(232,230,240,.4)" font-size="11" font-family="monospace">mo 1</text><text x="${w - pad - 30}" y="${h - 8}" fill="rgba(232,230,240,.4)" font-size="11" font-family="monospace">mo ${curve.length}</text>`;
  return `<svg class="curve" viewBox="0 0 ${w} ${h}" role="img" aria-label="TCO curve over the horizon">${labels}${paths}${axis}</svg>`;
}

function renderSensitivity() {
  const r = state.result;
  if (!r || r.lanes.B.per_1m.value === null) return;
  const base = Number(fmtPer1M(r.lanes.B.per_1m.value));
  const demandMultipliers = [0.5, 0.75, 1, 1.5, 2];
  const priceMultipliers = [0.8, 1, 1.25];
  const head = `<tr><th>demand \ price</th>${priceMultipliers.map((p) => `<th class="n">x${p}</th>`).join("")}</tr>`;
  const body = demandMultipliers.map((dm) => {
    const cells = priceMultipliers.map((pm) => {
      const cls = dm === 1 && pm === 1 ? `style="color:#E8E6F0"` : "";
      return `<td class="n" ${cls}>${(base * dm * pm).toFixed(6)}</td>`;
    }).join("");
    return `<tr><td>x${dm}</td>${cells}</tr>`;
  }).join("");
  $("sensitivity").innerHTML = `<div class="card"><h3>API lane per-1M sensitivity</h3><table><thead>${head}</thead><tbody>${body}</tbody></table><p class="muted">Lane B unit economics are linear in demand and tariff. Lane A per-unit cost FALLS with utilization (see breakeven); Lane C is hyperbolic in utilization — those nonlinearities are the decision-relevant sensitivities.</p></div>`;
}

function exportQuote(r) {
  const payload = {
    generated_at: new Date().toISOString(),
    snapshot: { digest: state.manifest.snapshot_digest, generated_at: state.manifest.generated_at, schema: state.manifest.schema },
    result: r,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tco-quote-${state.manifest.snapshot_digest}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

init();