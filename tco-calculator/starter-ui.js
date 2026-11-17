import { STARTER_CASES, STARTER_EXCLUSIONS, SPOTIFY_REFERENCE } from "./starter-cases.js";
import { computeStarterCase } from "./starter-economics.js";
import { toTHB, toUSD } from "./currency.js";
import { formatHalfUp, toRat } from "./exact.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function setupStarters({ getData, onAdvisor, onCustom }) {
  const $ = id => document.getElementById(id);
  let selected = STARTER_CASES[0];
  let result = null;
  let mode = "starter";
  const edits = new Map();
  const money = amount => `฿${formatHalfUp(toTHB(toRat(amount), getData().fx), 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  const shape = s => `${s.prompt_tokens.toLocaleString()} input + ${(s.cache_read_tokens ?? 0).toLocaleString()} cached input + ${(s.cache_write_tokens ?? 0).toLocaleString()} cache write + ${s.output_tokens.toLocaleString()} output tokens`;
  function refresh() {
    const data = getData();
    result = null;
    if (data.ready) result = computeStarterCase(selected, { ...data,
      usdPerKwh: toUSD(toRat("4"), data.fx).toString(), quoteUtc: data.quoteUtc, now: Date.now(),
    }, edits.get(selected.id) ?? {});
    $("starter-result").setAttribute("aria-busy", String(!data.ready));
    if (!data.ready) {
      $("starter-result").innerHTML = `<h2>${data.loadError ? "Prices unavailable" : "Pricing this single-server example…"}</h2><p>${esc(data.loadError ?? "The setup is ready. Loading cited hardware, API prices and exchange rates; no demand entry is needed.")}</p>${data.loadError ? '<button class="btn" data-starter-retry>Reload prices</button>' : ""}`;
    } else if (!result.available) {
      $("starter-result").innerHTML = `<h2>This setup cannot be priced</h2><p role="alert">${esc(result.reason)}</p><p>Choose another example or inspect custom sizing. No partial savings total is shown.</p>`;
    } else {
      const r = result;
      const positive = toRat(r.net_monthly).sign() > 0;
      const payback = !r.payback.converges ? "No payback at this usage" : `${r.payback.months} months${r.payback.beyond_horizon ? " — outside this horizon" : ""}`;
      const caveats = Object.values(r.quotes).flatMap(q => q.quote?.reasons ?? []);
      $("starter-result").innerHTML = `<p class="starter-eyebrow">Illustrative result · full server cost included</p>
        <h2>${positive ? `${money(r.net_monthly)} less per month` : `${money(toRat(r.net_monthly).neg().toString())} more per month`}</h2>
        <p class="starter-result-note">Recurring cost ${positive ? "reduction" : "increase"}, before recovering the hardware purchase.<br><strong>${money(r.capex)} upfront for one server · Payback: ${esc(payback)}.</strong></p>
        <dl class="starter-ledger">
          <div><dt>Premium API only</dt><dd>${money(r.baseline_api)} / mo</dd></div>
          <div><dt>API after local work <small>Includes bypass, failed tasks and capacity overflow</small></dt><dd>${money(r.residual_api)} / mo</dd></div>
          <div><dt>API bill reduction <small>Not the same as net savings</small></dt><dd>${r.api_reduction_pct === null ? "No baseline spend" : `${formatHalfUp(toRat(r.api_reduction_pct), 1)}%`} · ${money(r.api_reduction)} / mo</dd></div>
          <div><dt>Full local electricity <small>฿4 / kWh · rated power for 730 hours, overhead and cooling included</small></dt><dd>${money(r.running_cost)} / mo</dd></div>
          <div><dt>Buy one server <small>Derived component estimate, not a vendor quote</small></dt><dd>${money(r.capex)} upfront</dd></div>
          <div><dt>Net saving over ${r.horizon_months} months <small>After the entire hardware purchase</small></dt><dd>${money(r.horizon_savings)}</dd></div>
        </dl>
        <p class="muted">${r.counts.successful.toLocaleString()} of ${r.counts.tasks.toLocaleString()} tasks finish the local step successfully; ${(r.counts.bypass + r.counts.failed + r.counts.overflow).toLocaleString()} use the original premium request. Capacity overflow: ${r.counts.overflow.toLocaleString()}. This box never scales itself.</p>
        <p class="muted">API prices observed ${esc(String(data.manifest?.sources?.openrouter?.observed_at ?? "unknown").slice(0, 10))}; hardware estimate ${esc(r.hardware.observed_at ?? "undated")}; exchange rate ${esc(data.fx?.observed_at ?? "undated")}. ${esc(data.liveFailures?.openrouter ? "Live API pricing unavailable; using the dated fallback." : "")}</p>
        ${caveats.length ? `<p class="starter-warning">API pricing caveats: ${esc([...new Set(caveats)].join(", "))}</p>` : ""}
        <div class="starter-actions screen-only"><button class="btn" data-starter-export>Export this example</button><button class="btn" data-starter-print>Print this example</button></div>`;
    }
    $("starter-advisor").disabled = !result?.available;
  }
  function select(id) {
    selected = STARTER_CASES.find(row => row.id === id) ?? STARTER_CASES[0];
    $("starter-cases").innerHTML = STARTER_CASES.map(row => `<button class="starter-case" type="button" data-case="${row.id}" aria-pressed="${row.id === selected.id}">${esc(row.label)}<span>${esc(row.kicker)}</span></button>`).join("");
    $("starter-setup").innerHTML = `<h2>${esc(selected.label)}</h2><p>${esc(selected.description)}</p>
      <p class="starter-machine"><strong>One tower workstation · one 96 GB GPU</strong><br>RTX PRO 6000 Blackwell Workstation Edition · ${esc(selected.local.model_label)} · BF16 weights and KV · vLLM</p>
      <dl class="starter-roles"><div><dt>Runs locally</dt><dd>${esc(selected.local_job)}</dd></div><div><dt>Stays on the premium API</dt><dd>${esc(selected.premium_job)}</dd></div></dl>
      <p class="muted">${esc(selected.cadence)} These are example assumptions, not customer telemetry.</p>`;
    const override = edits.get(selected.id) ?? {};
    $("starter-tasks").value = override.tasksMo ?? selected.tasks_day * selected.working_days;
    $("starter-horizon").value = override.horizonMonths ?? selected.horizon_months;
    $("starter-assumptions").innerHTML = `<p>${esc(selected.caution)}</p><dl class="starter-roles">
      <div><dt>Premium offer</dt><dd>${esc(selected.premium_offer_id)}</dd></div>
      <div><dt>Before local work, per task</dt><dd>${esc(shape(selected.baseline))}</dd></div>
      <div><dt>After successful local work</dt><dd>${selected.residual_requests_per_success ? esc(shape(selected.residual)) : "No premium request"}</dd></div>
      <div><dt>Local acceptance assumptions</dt><dd>${selected.eligible_pct}% eligible; ${selected.failure_pct}% of attempted tasks fail and use the full API request.</dd></div>
      <div><dt>One-box capacity assumptions</dt><dd>${selected.local.context_tokens.toLocaleString()} context tokens; at most ${selected.local.concurrency} concurrent sequences; ${selected.local.scheduled_hours_day} task hours/day × ${selected.working_days} days/month; ${selected.local.peak_factor}× peak headroom. Decode roofline plus assumed prefill time, not measured throughput.</dd></div>
    </dl><ul>${STARTER_EXCLUSIONS.map(text => `<li>${esc(text)}</li>`).join("")}</ul>
    <p><a href="${SPOTIFY_REFERENCE.url}" target="_blank" rel="noopener">What Spotify actually measured ↗</a><br>${esc(SPOTIFY_REFERENCE.text)}</p>
    <p>Hardware estimate: <a href="https://www.thundercompute.com/blog/nvidia-rtx-pro-6000-pricing">card-price source</a> and <a href="https://vrlatech.com/how-much-does-a-custom-ai-workstation-cost/">GPU cost-share assumption</a>. Exact source dates and derivation travel with the exported result.</p>`;
    refresh();
  }
  function setMode(next, { notify = true } = {}) {
    mode = next;
    $("starter-page").hidden = mode !== "starter";
    $("custom-page").hidden = mode !== "custom";
    $("starter-back").hidden = mode !== "custom";
    if (mode === "custom" && notify) onCustom?.();
  }
  function snapshot() {
    return { mode, case_id: selected.id, overrides: edits.get(selected.id) ?? {},
      setup: selected, result: result?.available ? result : null, exclusions: STARTER_EXCLUSIONS };
  }
  $("starter-cases").addEventListener("click", event => { const button = event.target.closest("[data-case]"); if (button) select(button.dataset.case); });
  for (const id of ["starter-tasks", "starter-horizon"]) $(id).addEventListener("input", () => {
    edits.set(selected.id, { tasksMo: Number($("starter-tasks").value || "NaN"), horizonMonths: Number($("starter-horizon").value || "NaN") });
    refresh();
  });
  $("starter-custom").addEventListener("click", () => { setMode("custom"); $("comparison").focus(); });
  $("starter-back").addEventListener("click", () => { setMode("starter"); $("starter-title").focus(); });
  $("starter-advisor").addEventListener("click", () => onAdvisor(snapshot()));
  $("starter-result").addEventListener("click", event => {
    if (event.target.closest("[data-starter-retry]")) location.reload();
    if (!result?.available) return;
    if (event.target.closest("[data-starter-print]")) window.print();
    if (event.target.closest("[data-starter-export]")) {
      const payload = { ...snapshot(), exported_at: new Date().toISOString(), currency: "USD exact; screen converted to THB using result.fx" };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, (_, v) => typeof v === "bigint" ? v.toString() : v, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `factor-io-${selected.id}.json`; link.click(); URL.revokeObjectURL(url);
    }
  });
  select(selected.id);
  return { refresh, snapshot, setMode, restore(value) { if (value?.overrides) edits.set(value.case_id, value.overrides); select(value?.case_id); setMode(value?.mode === "custom" ? "custom" : "starter", { notify: false }); } };
}
