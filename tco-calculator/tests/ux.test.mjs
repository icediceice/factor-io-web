import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createAdvisor, advisorPrompt, advisorValidation } from "../assistant.js";
import { controlIdentity, controlDiff, validateControlRecord, saveHandoff, readHandoff, consumeHandoff } from "../assistant-session.js";
import { DEAL_TIERS, PIPELINE_CONNECTORS, LOCAL_AI_WORKLOADS, decodePresetFragment, decodeSizerFragment, decodeSizerSaveEnvelope, encodeSizerFragment, normalizeSizerInput, buildSessionProjectionFromConfig, resolveSizerModel, estimateModelWeightGb, groupCatalogModels, projectSizerControls, buildPricingIdentity, computeSizer, encodeSizerSaveEnvelope, SizerValidationError } from "../sizer-engine.js";
import { replaceCatalogSource } from "../live-pricing.js";
import { setupStarters as realSetupStarters } from "../starter-ui.js";
import { createSizerStorageAdapter, refreshLiveSourcesTransaction, SIZER_LEGACY_STORAGE_KEY, SIZER_STORAGE_KEY } from "../sizer-ui.js";
import * as demandMod from "../demand.js";
import * as servingMod from "../serving.js";
import * as capexMod from "../capex.js?v=20260906-ux3";
import * as subscriptionMod from "../subscription.js";
import * as powerMod from "../power.js";
import * as calculatorMod from "../calculator.js?v=20260906-ux3";
import { Dec, Rat, formatHalfUp, ratStr, toRat } from "../exact.js";
import { fxProvenance, normalizeFxDocument, toTHB, toUSD } from "../currency.js";
import {
  INTERVIEW_QUESTIONS,
  MINIMAX_DEFAULTS,
  answerFields,
  buildBlueprint,
  buildPlannerPlan,
  buildPrompt,
  createRequestFence,
  isInterviewComplete,
} from "../planner.js";
import {
  CHAT_LIMITS,
  buildOfflineRequest,
  createChatHistory,
  requestChatTurn as realRequestChatTurn,
  toolResultMessage,
  validateCalculatorProposal,
  validateFieldValue,
} from "../chat.js";

// Execute the real UI functions with a deliberately small DOM boundary and
// controlled timers/fetches. These are behavioral unit tests, not browser tests.
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../../tco-calculator.html", import.meta.url), "utf8");
const privacy = readFileSync(new URL("../../privacy.html", import.meta.url), "utf8");
const llms = readFileSync(new URL("../../llms.txt", import.meta.url), "utf8");
const fields = readFileSync(new URL("../fields.js", import.meta.url), "utf8");
const advisorHtml = readFileSync(new URL("../../tco-assistant.html", import.meta.url), "utf8");
const advisorSource = readFileSync(new URL("../assistant.js", import.meta.url), "utf8");
const ENGINE_MODULES = ["calculator.js", "power.js", "subscription.js", "demand.js", "serving.js", "capex.js"];
const TEST_FX_DOCUMENT = {
  source_id: "test-fx",
  source_url: "https://example.test/fx",
  observed_at: "2026-09-04",
  expires_at: "2026-09-05T23:59:59.999Z",
  usd_thb: "33",
};
const TEST_FX = normalizeFxDocument(TEST_FX_DOCUMENT, { integrity: "test-fixture" });
function harness() {
  const nodes = new Map();
  const listeners = new Map();
  const timers = new Map();
  let nextTimer = 0;
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      id, value: "", defaultValue: "", innerHTML: "", textContent: "", dataset: {},
      tagName: "INPUT", type: "text", options: [], hidden: false, disabled: false,
      attrs: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} },
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(k, f) { this.events ??= {}; this.events[k] = f; },
      requestSubmit() { this.events?.submit?.({ preventDefault() {} }); },
      appendChild(o) { this.options.push(o); },
      append(...items) { this.options.push(...items); },
      querySelector(selector) { return selector === ".ai-option" ? node(`${this.id}-first-option`) : null; },
      querySelectorAll() { return []; },
      focus() { this.focused = true; },
      select() { this.selected = true; },
      remove() { this.removed = true; },
      click() { this.clicked = true; },
    });
    return nodes.get(id);
  }
  const fetchCalls = [];
  const fetchSpy = async (...args) => {
    fetchCalls.push(args);
    return { ok: true, status: 200, json: async () => ({
      model: "MiniMax-M3",
      choices: [{ message: {
        role: "assistant",
        content: null,
        tool_calls: [{ id: `call-${fetchCalls.length}`, type: "function", function: {
          name: "ask_user",
          arguments: JSON.stringify({ question: "Where must the data stay?", suggested_replies: ["Inside Nutanix"] }),
        } }],
      } }],
    }) };
  };
  const context = vm.createContext({
    Dec, Rat, formatHalfUp, ratStr, toRat, fxProvenance, normalizeFxDocument, toTHB, toUSD,
    console: { error() {}, warn() {} }, Event,
    DemandRefusal: class DemandRefusal extends Error {},
    ServingRefusal: class ServingRefusal extends Error {},
    document: {
      getElementById: node,
      addEventListener: (type, f) => listeners.set(type, f),
      querySelectorAll: () => [], querySelector: () => node("rail"),
      createElement: (tag) => ({
        tagName: String(tag).toUpperCase(), value: "", textContent: "", style: {}, options: [], attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; }, appendChild(o) { this.options.push(o); },
        addEventListener() {}, select() { this.selected = true; }, remove() { this.removed = true; }, click() { this.clicked = true; },
      }),
      body: { appendChild(el) { el.appended = true; } },
      execCommand: () => true,
    },
    setTimeout: (fn) => { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
    location: { href: "https://studio.factor-io.com/tco-calculator.html", reload() {} },
    fetch: fetchSpy, AbortController, URL, Blob,
    navigator: { clipboard: { writeText: async () => {} } },
    INTERVIEW_QUESTIONS, MINIMAX_DEFAULTS, answerFields, buildBlueprint, buildPlannerPlan, buildPrompt,
    createRequestFence, isInterviewComplete, CHAT_LIMITS, buildOfflineRequest, createChatHistory,
    toolResultMessage, validateCalculatorProposal, validateFieldValue,
    requestChatTurn: (args) => realRequestChatTurn({ ...args, fetchImpl: fetchSpy, timeoutMs: 1000 }),
    resolveResource: async () => ({ offers: {} }),
    loadFx: async () => TEST_FX_DOCUMENT,
    fetchOpenRouterModels: async () => { throw new Error("offline test fixture"); },
    fetchLiveFx: async () => { throw new Error("offline test fixture"); },
    syncChips() {}, enhanceRail() {}, releaseFields() {},
    controlIdentity, controlDiff, validateControlRecord, readHandoff, consumeHandoff,
    decodeSizerFragment, projectSizerControls, buildSessionProjectionFromConfig, groupCatalogModels,
    setupStarters: () => ({ refresh() {}, snapshot: () => ({ mode: "starter" }), restore() {}, setMode() {} }),
  });
  const executable = app.replace(/^\s*import[\s\S]*?;\s*$/gm, "").replace(/\ninit\(\);\s*$/, "");
  assert.doesNotMatch(executable, /^\s*import\b/m, "the VM harness must strip multiline module imports");
  vm.runInContext(executable, context);
  const get = (expression) => vm.runInContext(expression, context);
  get("state").fx = TEST_FX;
  return { context, node, nodes, get, listeners, timers, state: get("state"),
    fetchCalls,
    tick() { const work = [...timers.values()]; timers.clear(); work.forEach((f) => f()); } };
}


test("graph keeps marked last-valid geometry while pending and clears on invalid computation", () => {
  const h = harness(); h.state.ready = true;
  h.node("curve").innerHTML = "previous plot";
  h.get("invalidateResults('Updating')");
  assert.equal(h.node("curve").innerHTML, "previous plot");
  assert.equal(h.node("curve").dataset.stale, "true");
  assert.equal(h.state.result, null);
  h.get("refreshDerived = () => { throw new Error('invalid'); }");
  h.get("run()");
  assert.equal(h.node("curve").innerHTML, "");
  assert.match(h.node("curve-status").textContent, /unavailable/);
});

test("responsive graph uses requested geometry and draws single points with HTML legends", () => {
  const h = harness();
  const graph = h.get("renderCurve")([{month:1,A:"10",B:"10",C:null}], {}, {width:320,height:340});
  assert.match(graph, /viewBox="0 0 320 340"/);
  assert.match(graph, /<circle/);
  assert.match(graph, /class="plot-label"/);
  assert.match(graph, /class="curve-legend"/);
  assert.match(graph, /not costed/);
  assert.doesNotMatch(graph, /NaN|Infinity/);
});


test("all authored cost inputs and newly created architecture inputs are live without an id list", () => {
  const h = harness();
  const controls = [...html.matchAll(/<(input|select)\b[^>]*\bid="((?:f-|fb-|fo-|fr-)[^"]+)"[^>]*>/g)];
  assert.ok(controls.length > 60);
  for (const [, tag, id] of controls) {
    assert.equal(h.get("isCostControl")({ id, tagName: tag.toUpperCase(), type: "text" }), true, id);
  }
  for (const id of ["f-g0-kind", "f-g2-heads", "f-future-cost"]) {
    assert.equal(h.get("isCostControl")({ id, tagName: "INPUT", type: "text" }), true);
  }
  assert.equal(h.get("isCostControl")({ id: "f-users", tagName: "INPUT", type: "range" }), false);
  assert.equal(h.get("isCostControl")({ id: "unrelated", tagName: "INPUT", type: "text" }), false);
  for (const id of [...html.matchAll(/\bid="(ai-[^"]+)"/g)].map((match) => match[1])) {
    assert.equal(h.get("isCostControl")({ id, tagName: "INPUT", type: id === "ai-token" ? "password" : "text" }), false, id);
  }
});

test("provider, server and architecture transforms finish before the one recompute", () => {
  const h = harness(); h.state.ready = true;
  h.context.log = [];
  h.get(`fillRentGpus = () => log.push('rent'); fillServerConfigs = () => log.push('server');
    renderRentNote = () => log.push('note'); readArchGroups = () => [];
    renderArchGroups = () => log.push('groups'); onLiveInput = () => log.push('live');`);
  const send = (id, type = "change", tagName = "SELECT") => h.get("handleControlEdit")({ type, target: { id, tagName, type: "text" } });
  send("f-rent-provider"); assert.deepEqual([...h.context.log], ["rent", "live"]);
  h.context.log.length = 0;
  send("f-sh-gpu"); assert.deepEqual([...h.context.log], ["server", "live"]);
  h.context.log.length = 0;
  send("f-g0-kind"); assert.deepEqual([...h.context.log], ["groups", "live"]);
  h.context.log.length = 0;
  send("fb-model", "input"); assert.deepEqual([...h.context.log], []);
  send("fb-model"); assert.deepEqual([...h.context.log], ["live"]);
});

test("a burst gives immediate pending feedback, removes export and coalesces expensive work", () => {
  const h = harness(); h.state.ready = true; h.state.result = {};
  h.node("results").innerHTML = '<button id="export">old quote</button>';
  h.node("sensitivity").innerHTML = "old grid";
  h.context.runs = 0; h.get("run = () => { runs++; }");
  for (let i = 0; i < 120; i++) h.get("onLiveInput() ");
  assert.equal(h.state.result, null);
  assert.equal(h.node("results").innerHTML, "");
  assert.equal(h.node("sensitivity").innerHTML, "");
  assert.match(h.node("calculation-status").textContent, /Updating/);
  assert.equal(h.context.runs, 0); assert.equal(h.timers.size, 1);
  h.tick(); assert.equal(h.context.runs, 1);
  h.get("onLiveInput(); flushLiveInput()"); h.tick();
  assert.equal(h.context.runs, 2, "explicit Run flush cancels pending timer");
});

test("slider sync preserves exact off-scale, formatted and off-step manual values", () => {
  const h = harness();
  for (const value of ["250000", "250,000", "", "bad", "-1"]) {
    h.node("f-users").value = value;
    h.get("syncSliders()");
    assert.equal(h.node("f-users").value, value);
    assert.equal(h.node("slider-f-users").disabled, true);
    assert.match(h.node("slider-f-users-note").textContent, /exact entry/);
  }
  h.node("f-users").value = "500"; h.node("f-sessions-day").value = "2.125";
  h.get("syncSliders()");
  assert.equal(h.node("slider-f-users").disabled, false);
  assert.equal(h.node("f-sessions-day").value, "2.125");
});

function result(totals) {
  return { horizon_months: 36, lanes: { A: { enabled: true }, B: { enabled: true }, C: { enabled: true } },
    totals: Object.fromEntries(Object.entries(totals).map(([k, value]) => [k, {
      priced: value !== null, horizon_total: value, monthly_total: "10", one_time: "0", subscription_monthly: "0",
    }])) };
}
test("horizon ranking uses exact fractions, joint ties and no unpriced fallback", () => {
  const h = harness(); const rank = h.get("horizonComparison");
  assert.equal(rank(result({ A: "179834.53", B: "27237.91", C: "20396.41" })).best.k, "C");
  const tie = rank(result({ A: "1/3", B: "2/6", C: "1" }));
  assert.equal(tie.tied, true); assert.equal(tie.cards.filter((c) => c.win).length, 2);
  assert.equal(rank(result({ A: null, B: "2", C: "3" })).best.k, "B");
  assert.equal(rank(result({ A: null, B: null, C: null })).best, null);
  assert.equal(rank(result({ A: "1.00001", B: "1.00002", C: "2" })).best.k, "A");
});

test("consulting overlay is visibly additional and cannot silently relabel unit prices", () => {
  const h = harness();
  const r = result({ A: "432000", B: "500000", C: null });
  r.overlay = { overlay_total: "360000", itemized: [{ name: "ai-consulting", amount: "10000", extended: "360000", basis: "monthly" }] };
  h.get("renderOptionTotals")(r);
  assert.match(h.node("comparison-scope").innerHTML, /Additional commercial fees: ฿11,880,000.00/);
  assert.match(h.node("comparison-scope").innerHTML, /excluded from the comparison, curve and payback/);
  assert.match(h.node("verdict").innerHTML, /฿14,256,000.00/);
  assert.doesNotMatch(html, /id="fo-loaded"/);
  assert.doesNotMatch(app, /r\.overlay\.label/);
});

test("a generic calculation failure clears every stale output, then valid input recovers", () => {
  const h = harness(); h.state.ready = true;
  h.context.log = [];
  h.get(`refreshDerived = () => log.push('derive'); syncChips = () => log.push('chips');
    syncSliders = () => {}; buildScenario = () => { throw new Error('bad amount'); };`);
  h.get("run()");
  assert.deepEqual([...h.context.log], ["derive", "chips"]);
  assert.equal(h.state.result, null);
  for (const id of ["verdict", "results", "sensitivity", "comparison-scope"]) assert.equal(h.node(id).innerHTML, "");
  assert.match(h.node("gapbox").innerHTML, /bad amount/);
  assert.doesNotMatch(h.node("gapbox").innerHTML, /<code>/);
  h.get(`buildScenario = () => ({ inputs: {} }); runComparison = () => ({ horizon_months: 12 });
    renderResults = () => {}; renderServerNote = () => {}; renderPowerNote = () => {}; renderSubNote = () => {};`);
  h.get("run()");
  assert.equal(h.state.result.horizon_months, 12);
  assert.match(h.node("calculation-status").textContent, /12 months/);
  assert.equal(h.node("comparison").attrs["aria-busy"], "false");
});

test("catalog failure remains visible; stale completion cannot overwrite a newer selection", async () => {
  const h = harness(); h.state.ready = true;
  h.state.manifest = { models: [{ id: "litellm:gpt-4o", name: "GPT-4o" }] };
  h.node("fb-feed").value = "litellm";
  h.context.generation = 1;
  h.get("currentGeneration = () => generation; resolveResource = async () => { throw new Error('offline'); }");
  await h.get("fillModels({generation:1})");
  assert.match(h.state.catalogError, /offline/);
  h.get("run()");
  assert.match(h.node("gapbox").innerHTML, /offline/); assert.equal(h.state.result, null);
  let resolveOld;
  h.context.resolveResource = () => new Promise((resolve) => { resolveOld = resolve; });
  const older = h.get("fillModels({generation:1})");
  h.context.generation = 2;
  h.context.resolveResource = async () => ({ offers: { newer: {} } });
  await h.get("fillModels({generation:2})");
  resolveOld({ offers: { stale: {} } }); await older;
  assert.ok(h.state.catalog.offers.newer); assert.equal(h.state.catalog.offers.stale, undefined);
  assert.equal(h.state.catalogError, null); assert.equal(h.state.selecting, false);
  assert.equal(h.timers.size, 1, "current completed selection schedules a comparison");
});

test("initialization restores static defaults and sizes the fleet before choosing the default server", async () => {
  const h = harness();
  const input = h.node("f-users"); input.value = "250000"; input.defaultValue = "500";
  h.context.document.querySelectorAll = () => [input];
  h.context.order = [];
  h.get(`setupSliders = () => {}; loadManifest = async () => ({}); renderBanner = () => {};
    freshnessView = () => ({}); loadGpuPricing = async () => {}; loadPowerData = async () => {};
    loadServingModels = async () => {}; loadServerPricing = async () => {};
    loadSubscriptions = async () => {}; wireInputs = async () => order.push('catalog');
    loadWorkloadPresets = async () => order.push('preset');
    computeDemand = () => { order.push('size'); return { sizing: {gpus_required:{text:'1'}} }; };
    fillServerConfigs = () => { if (!state.demand?.sizing) throw new Error('unsized'); order.push('server'); };
    flushLiveInput = () => order.push('calculate');`);
  await h.get("init()");
  assert.equal(input.value, "500"); assert.equal(h.state.ready, true);
  assert.deepEqual([...h.context.order], ["catalog", "preset", "size", "server", "calculate"]);
  assert.equal(h.node("rail").inert, false);
});

test("initialization gives the complete live lane one deadline before releasing the local snapshot", async () => {
  const h = harness();
  const signals = [];
  const waitForAbort = ({ signal }) => {
    signals.push(signal);
    return new Promise((resolve, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  };
  h.context.fetchOpenRouterModels = waitForAbort;
  h.context.fetchLiveFx = waitForAbort;
  h.get(`setupSliders = () => {}; loadManifest = async () => ({}); renderBanner = () => {};
    freshnessView = () => ({}); loadGpuPricing = async () => {}; loadPowerData = async () => {};
    loadServingModels = async () => {}; loadServerPricing = async () => {};
    loadSubscriptions = async () => {}; wireInputs = async () => {}; loadWorkloadPresets = async () => {};
    computeDemand = () => { throw new DemandRefusal('fixture deliberately skips sizing'); };
    fillServerConfigs = () => {}; flushLiveInput = () => {};`);

  const initialization = h.get("init()");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(signals.length, 2);
  assert.equal(signals[0], signals[1], "both live sources share the aggregate deadline");
  assert.equal(h.node("rail").inert, true);
  h.tick();
  await initialization;

  assert.equal(signals[0].aborted, true);
  assert.equal(h.state.ready, true, "the digest-pinned local snapshot remains usable after live timeout");
  assert.equal(h.node("rail").inert, false);
  assert.match(h.state.liveFailures.openrouter, /4 seconds/);
  assert.match(h.state.liveFailures.fx, /4 seconds/);
});

test("stale export closures cannot write a quote", () => {
  const h = harness();
  assert.doesNotThrow(() => h.get("exportQuote")({}));
  assert.doesNotThrow(() => h.get("exportQuote")(null));
});

test("default sizing refusals remain editable and recover without reloading snapshots", async () => {
  for (const kind of ["DemandRefusal", "ServingRefusal"]) {
    const h = harness();
    h.get(`setupSliders = () => {}; loadManifest = async () => ({}); renderBanner = () => {};
      freshnessView = () => ({}); loadGpuPricing = async () => {}; loadPowerData = async () => {};
      loadServingModels = async () => {}; loadServerPricing = async () => {};
      loadSubscriptions = async () => {}; wireInputs = async () => {}; loadWorkloadPresets = async () => {};
      computeDemand = () => { throw new ${kind}('example does not fit'); };
      refreshDerived = () => computeDemand();
      fillServerConfigs = () => { if (state.demand !== null) throw new Error('expected fallback'); };`);
    await h.get("init()");
    assert.equal(h.state.ready, true, kind);
    assert.equal(h.node("rail").inert, false);
    assert.match(h.node("gapbox").innerHTML, /example does not fit/);
    assert.doesNotMatch(h.node("calculation-status").textContent, /reload/);
    h.get(`refreshDerived = () => {}; syncSliders = () => {};
      buildScenario = () => ({ inputs: {} }); runComparison = () => ({ horizon_months: 36 });
      renderResults = () => {}; renderServerNote = () => {}; renderPowerNote = () => {}; renderSubNote = () => {};`);
    h.get("handleControlEdit")({ type: "input", target: h.node("f-users") });
    assert.equal(h.timers.size, 1);
    h.tick();
    assert.equal(h.state.result.horizon_months, 36);
  }
});

test("print appendix snapshots all authoritative inputs with labels, exact values and escaped text", () => {
  const h = harness(); h.state.manifest = { snapshot_digest: "digest-123" };
  const users = h.node("f-users"); users.value = "250000"; users.labels = [{ textContent: "Users" }];
  const horizon = h.node("f-horizon"); horizon.value = "36";
  const model = h.node("fb-model"); model.tagName = "SELECT"; model.value = "model-id";
  model.selectedOptions = [{ textContent: "Model <name>" }];
  const dynamic = h.node("f-g2-heads"); dynamic.value = "17";
  const blank = h.node("f-sh-capex"); blank.placeholder = "165000 (derived)";
  const range = h.node("slider-f-users"); range.type = "range";
  h.context.document.querySelectorAll = () => [users, horizon, model, dynamic, blank, range];
  const printed = h.get("printInputsAppendix()");
  for (const text of ["Users", "250000", "f-horizon", "36", "f-g2-heads", "17", "165000 (derived)", "digest-123", "Model &lt;name&gt;"]) assert.ok(printed.includes(text), text);
  assert.doesNotMatch(printed, /slider-f-users|Model <name>/);
  users.value = "1";
  assert.ok(printed.includes("250000"), "appendix is a result-time snapshot, not a print-time reread");
  assert.match(app, /\$\{printInputsAppendix\(\)\}/);
  assert.match(app, /entered_inputs: Object\.fromEntries\(enteredControls\(\)/);
});

test("print exclusions are outside closed details and use the same prose as the screen", () => {
  const h = harness(); h.get("renderOptionTotals")(result({ A: "1", B: "2", C: "3" }));
  const scope = h.node("comparison-scope").innerHTML;
  const prose = h.get("COMPARISON_EXCLUSIONS");
  assert.equal(scope.split(prose).length - 1, 2);
  assert.ok(scope.indexOf('<div class="print-only">') > scope.indexOf("</details>"));
  assert.match(prose, /electricity only/);
  assert.match(prose, /Taxes, financing/);
  assert.match(html, /\.print-only \{ display:none; \}/);
  assert.match(html.slice(html.indexOf("@media print")), /\.print-only \{ display:block; \}/);
  assert.match(html, /\.screen-only \{ display:none !important; \}/);
});

test("a selected but unavailable platform price is never treated as zero", () => {
  const check = harness().get("requireSubscriptionPrice");
  assert.throws(() => check({ id: "enterprise" }, null, "price required"), /price required/);
  assert.doesNotThrow(() => check({ id: "none" }, null));
  assert.doesNotThrow(() => check({ id: "enterprise" }, { monthly: "0" }));
});

test("mix refusals describe percentages and the corrective action", () => {
  const h = harness(); h.state.ready = true;
  h.get(`refreshDerived = () => { const e = new DemandRefusal('bad mix');
    e.code = 'mix_does_not_sum_to_one'; e.detail = {sum:'1.100000'}; throw e; };`);
  h.get("run()");
  assert.match(h.node("gapbox").innerHTML, /110%/);
  assert.match(h.node("gapbox").innerHTML, /Put the remainder in Chat/);
});

// Module version spelling is not a runtime contract: the initialization and
// browser tests below load the actual import graph and exercise its behavior.

async function liveTcoPage(t) {
  const { launch, openPage, serve } = await import("../../scripts/films/cdp.mjs");
  const server = await serve(); t.after(() => server.close());
  const browser = await launch(); t.after(() => browser.close());
  const page = await openPage(browser, { width: 1440, height: 1000, reducedMotion: "reduce" });
  await page.send("Network.enable");
  await page.send("Network.setBlockedURLs", { urls: ["https://*"] });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__testErrors=[];addEventListener('error',e=>__testErrors.push(e.message));addEventListener('unhandledrejection',e=>__testErrors.push(String(e.reason)));" });
  await page.goto(server.origin + "/tco-calculator.html");
  await page.evaluate(`new Promise((resolve, reject) => {
    const until = performance.now() + 12000;
    const probe = () => {
      if (document.querySelector('.rail')?.inert === false && document.querySelector('.spec[data-for="f-onetime-a"]')) return resolve(true);
      if (performance.now() > until) return reject(new Error('calculator did not initialize: ' + JSON.stringify({ errors: window.__testErrors, gap: document.getElementById('gapbox')?.textContent, rail: document.querySelector('.rail')?.inert, specs: document.querySelectorAll('.spec').length })));
      setTimeout(probe, 40);
    }; probe();
  })`);
  return page;
}
test("loaded calculator and each applied workload preset default to 60 months", { timeout: 20000 }, async t => {
  const page = await liveTcoPage(t);
  const result = await page.evaluate(`(async () => {
    const presets = await (await fetch('./tco-calculator/data/workload-presets.json')).json();
    const horizons = [document.getElementById('f-horizon').value];
    for (const preset of presets.presets) {
      document.querySelector('[data-preset="' + preset.id + '"]').click();
      horizons.push(document.getElementById('f-horizon').value);
    }
    return horizons;
  })()`);
  assert.ok(result.length > 1);
  assert.ok(result.every(value => value === "60"));
});

// USD/THB behavior is asserted against real outputs in exportMoneyRecord,
// exportMoneyTree, and the sizer parity acceptance matrix, independently of imports.

test("exported money preserves exact engine USD and converts once to exact THB", () => {
  const h = harness();
  const record = JSON.parse(JSON.stringify(h.get("exportMoneyRecord")("1/3")));
  assert.deepEqual(record, {
    engine_currency: "USD",
    engine_exact: "1/3",
    presentation_currency: "THB",
    presentation_exact: "11",
    presentation_rounded: "11.00",
  });
  const tree = JSON.parse(JSON.stringify(h.get("exportMoneyTree")({
    monthly_total: "10",
    curve: [{ month: 1, A: "20" }],
    per_1m: { value: "2", reason: null },
    terms: { usd_per_kwh: { value: "4/33", basis: "assumed" } },
    utilization: "0.5",
  })));
  assert.equal(tree.monthly_total.presentation_exact, "330");
  assert.equal(tree.curve[0].A.presentation_exact, "660");
  assert.equal(tree.per_1m.value.presentation_exact, "66");
  assert.deepEqual(tree.terms.usd_per_kwh.value, {
    engine_currency: "USD",
    engine_exact: "4/33",
    presentation_currency: "THB",
    presentation_exact: "4",
    presentation_rounded: "4.00",
  });
  assert.equal(tree.utilization, "0.5", "dimensionless fields must not be currency-converted");
});

test("deterministic component ledger covers cost components, formulas and source freshness", () => {
  const h = harness();
  h.state.manifest = { sources: { openrouter: { origin: "live", status: "fresh", observed_at: "2026-09-04T00:00:00Z", integrity: "transport-live", record_count: 100 } } };
  h.state.powerPlan = {
    monthly_usd: "30",
    terms: { usd_per_kwh: { value: "4/33", basis: "assumed" } },
  };
  const totals = {
    A: { priced: true, infra_monthly: "10", subscription_monthly: "2", monthly_total: "12", one_time: "100", horizon_total: "820" },
    B: { priced: false, infra_monthly: null, subscription_monthly: null, monthly_total: null, one_time: "0", horizon_total: null },
    C: { priced: false, infra_monthly: null, subscription_monthly: null, monthly_total: null, one_time: "0", horizon_total: null },
  };
  const ledger = JSON.parse(JSON.stringify(h.get("buildComponentLedger")({ totals, routing_result: { recommended_monthly_total: "12" }, overlay: null })));
  assert.equal(ledger.schema, "factor-io.tco-component-ledger/1.0.0");
  assert.equal(ledger.recurring.self_hosted.horizon_total.presentation_exact, "27060");
  assert.equal(ledger.routing.recommended_monthly_total.presentation_exact, "396");
  assert.equal(ledger.power.terms.usd_per_kwh.value.engine_exact, "4/33");
  assert.equal(ledger.power.terms.usd_per_kwh.value.presentation_exact, "4");
  assert.equal(ledger.freshness.sources.openrouter.origin, "live");
  assert.ok(ledger.formulas.some((formula) => formula.includes("Horizon total")));
  for (const key of ["demand", "sizing", "recurring", "capex", "power", "subscription", "routing", "exclusions", "freshness", "formulas"]) assert.ok(key in ledger, key);
});

test("real field sheet moves the authoritative input, preserves edits and ignores range controls", { timeout: 20000 }, async t => {
  const page = await liveTcoPage(t);
  const result = await page.evaluate(`(() => {
    document.getElementById('starter-custom').click();
    const original = document.getElementById('f-onetime-a');
    const spec = document.querySelector('.spec[data-for="f-onetime-a"]');
    spec.click();
    const inSheet = document.querySelector('#sheet-root #f-onetime-a') === original;
    original.value = '4321';
    original.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#sheet-root [data-done]').click();
    return { inSheet, sameNode: document.getElementById('f-onetime-a') === original,
      preserved: original.value, chip: spec.textContent,
      rangeSpecs: [...document.querySelectorAll('.spec')].filter(s => document.getElementById(s.dataset.for)?.type === 'range').length,
      foldedCorrectly: [...document.querySelectorAll('.rail .sec[data-folding]')].every(s => s.classList.contains('folded') === !('open' in s.dataset)) };
  })()`);
  assert.equal(result.inSheet, true);
  assert.equal(result.sameNode, true);
  assert.equal(result.preserved, "4321");
  assert.match(result.chip, /4321/);
  assert.equal(result.rangeSpecs, 0);
  assert.equal(result.foldedCorrectly, true);
});

// Inline-chat tests are migrated below to the real dedicated advisor controller,
// and to calculator-side returned-proposal expansion. Custom arithmetic, control,
// graph, initialization, export and pricing tests above remain unchanged.

const profile = { use_case: "support", substrate: "nutanix", data_boundary: "internal", interaction: "assistant", overflow: "burst" };
const guidedAnswers = { ...profile, scale: "department", intensity: "routine", horizon: "y5" };
function returnHarness() {
  const h = harness(); const stored = new Map(); let mode = "starter"; let computations = 0;
  const storage = { get length() { return stored.size; }, key: n => [...stored.keys()][n], getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
  h.context.sessionStorage = storage;
  h.state.ready = true;
  h.state.manifest = { snapshot_digest: "current", models: [{ id: "openrouter:test", name: "Test" }, { id: "other:claude-test", name: "Claude test" }] };
  h.state.gpuPricing = { rows: [{ provider: "first", gpu_id: "gpu" }, { provider: "second", gpu_id: "gpu2" }] };
  h.state.serverPricing = { rows: [] }; h.state.servingData = { models: [] };
  h.state.workloadPresets = { defaults: { shapes: Object.fromEntries(["chat", "rag", "graph_rag", "agentic"].map(key => [key, { turns_per_session: 2, in_tokens: 100, out_tokens: 50, cached_tokens: 0 }])) }, presets: [{ id: "support_desk", fields: { "f-mix-chat": "100", "f-mix-rag": "0", "f-mix-graphrag": "0", "f-mix-agentic": "0" } }] };
  const before = { ...buildPlannerPlan(guidedAnswers).controlledFields, "f-users": "20", "f-sv-maxbatch": "", "f-sub-term": "", "f-rent-provider": "first", "f-rent-gpu": "0", "fb-feed": "openrouter", "fb-model": "openrouter:test", "f-utc": "2026-09-08T00:00:00Z" };
  for (const [id, value] of Object.entries(before)) h.node(id).value = value;
  for (const id of ["fr-policy", "f-rent-provider", "f-rent-gpu", "fb-feed", "fb-model", "f-sub-term"]) {
    h.node(id).tagName = "SELECT";
    h.node(id).options = [...new Set([before[id], "local_first", "first", "second", "0", "1", "openrouter", "other", "openrouter:test", "other:claude-test", "annual"])].map(value => ({ value, textContent: value }));
  }
  h.context.document.querySelectorAll = () => [...h.nodes.values()].filter(n => /^(f-|fb-|fo-|fr-)/.test(n.id) && n.value !== undefined && (n.id in before || n.value !== ""));
  h.get("readArchGroups = () => []");
  h.context.applyControls = values => { for (const [id, value] of Object.entries(values)) h.node(id).value = value; };
  h.get("writeReturnedControls = values => applyControls(values)");
  h.context.recompute = () => { computations++; h.state.result = { computed: true }; };
  h.get("flushLiveInput = () => recompute()");
  const starter = { snapshot: () => ({ mode }), setMode: value => { mode = value; if (mode === "custom") h.context.recompute(); }, restore: value => { mode = value.mode; } };
  h.context.starter = starter; h.get("starterUI = starter");
  const id = "00000000-0000-4000-8000-000000000099";
  const record = { controls: h.get("captureControls()"), groups: [], identity: h.get("currentControlIdentity()"), starter: starter.snapshot(), pricing_identity: "captured", proposal: { kind: "guided", answers: guidedAnswers } };
  saveHandoff(storage, record, { id }); h.context.location.href += `?advisor=${id}`;
  return { ...h, storage, id, record, computations: () => computations };
}
test("return accepts real optional blanks and refuses removed options and malformed batches", () => {
  const h = returnHarness();
  assert.doesNotThrow(() => h.get("validateReturnedControls")(h.record.controls, []));
  assert.throws(() => h.get("validateReturnedControls")({ ...h.record.controls, "f-sub-term": "retired" }, []), /Unavailable option/);
  assert.throws(() => h.get("validateReturnedControls")({ ...h.record.controls, "f-sv-maxbatch": "abc" }, []), /integer/);
  h.context.document.getElementById = id => id === "f-users" ? null : h.node(id);
  assert.throws(() => h.get("validateReturnedControls")(h.record.controls, []), /Removed control/);
});
test("return preview expands preset and guided side effects without mutating inputs", () => {
  const h = returnHarness(); h.get("processAdvisorReturn(false)");
  assert.equal(h.node("f-users").value, "20"); assert.equal(h.computations(), 0);
  const pending = h.get("pendingReview");
  assert.equal(pending.prepared.controls["f-users"], "200");
  assert.equal(pending.prepared.controls["f-chat-in"], "100");
  assert.match(h.node("return-review").innerHTML, /Prices refreshed/);
  assert.match(h.node("return-review").innerHTML, /20 → 200/);
});
test("return expands dependent provider and API defaults into the reviewed control set", () => {
  const h = returnHarness();
  const result = h.get("expandAdvisorProposal")({ kind: "proposal", value: { summary: "Change providers", planning_profile: profile, changes: [{ field: "f-rent-provider", value: "second", reason: "Example" }, { field: "fb-feed", value: "other", reason: "Example" }], suggested_replies: [] } }, h.record.controls, []);
  assert.equal(result.controls["f-rent-gpu"], "1"); assert.equal(result.controls["fb-model"], "other:claude-test");
  assert.equal(h.node("f-rent-gpu").value, "0");
});
test("Apply rechecks identity, consumes once, enters custom and computes exactly once", () => {
  const h = returnHarness(); h.get("processAdvisorReturn(false)"); h.get("applyReturnedProposal()");
  assert.equal(h.node("f-users").value, "200"); assert.equal(h.computations(), 1);
  assert.equal(readHandoff(h.storage, h.id).consumed, true);
  assert.equal(h.get("plannerState.applied"), true);
  h.get("applyReturnedProposal()"); h.get("processAdvisorReturn(true)");
  assert.equal(h.computations(), 1);
});
test("manual edits before return or after preview survive without application", () => {
  for (const afterPreview of [false, true]) {
    const h = returnHarness(); if (afterPreview) h.get("processAdvisorReturn(false)");
    h.node("f-users").value = "99";
    if (afterPreview) h.get("applyReturnedProposal()"); else h.get("processAdvisorReturn(false)");
    assert.equal(h.node("f-users").value, "99"); assert.equal(h.computations(), 0);
    assert.equal(readHandoff(h.storage, h.id).consumed, false);
  }
});
test("fresh return restores once, but a locally edited initialization is never overwritten", () => {
  const h = returnHarness(); h.node("f-users").value = "50"; h.get("processAdvisorReturn(true)");
  assert.equal(h.node("f-users").value, "20"); assert.equal(h.computations(), 1);
  h.node("f-users").value = "99"; h.get("processAdvisorReturn(true)");
  assert.equal(h.node("f-users").value, "99"); assert.equal(h.computations(), 1);
  const edited = returnHarness(); edited.node("f-users").value = "88"; edited.get("manualRevision++"); edited.get("processAdvisorReturn(true)");
  assert.equal(edited.node("f-users").value, "88"); assert.equal(edited.computations(), 0);
  assert.match(app, /addEventListener\?\.\("pageshow"/);
});
test("storage consumption failure rolls all reviewed controls back", () => {
  const h = returnHarness(); h.get("processAdvisorReturn(false)");
  h.storage.setItem = () => { throw new Error("Storage blocked"); }; h.get("applyReturnedProposal()");
  assert.equal(h.node("f-users").value, "20"); assert.equal(h.computations(), 0);
  assert.match(h.node("return-status").textContent, /Storage blocked/);
  assert.equal(h.get("plannerState.applied"), false);
});

function sizerReceiverHarness() {
  const h = harness();
  let mode = "starter";
  let computations = 0;
  let replacedUrl = null;
  h.context.history = { replaceState: (_s, _t, url) => { replacedUrl = url; } };
  h.state.ready = true;
  h.state.manifest = {
    snapshot_digest: "snap-1",
    models: [{ id: "openrouter:gpt-4o", name: "GPT-4o", state: "active" }],
  };
  h.state.catalog = {
    offers: {
      "openrouter:gpt-4o": {
        offer_id: "openrouter:gpt-4o",
        seller: "openrouter",
        seller_source: "openrouter",
        channel: "api",
        product: "openai/gpt-4o",
        region: "*",
        purchase_term: "on_demand",
        display_name: "GPT-4o",
        tariff: "token",
        state: "active",
        quarantine_reason: null,
        missing_streak: 0,
        expiration_date: null,
        prices: {
          input: "0.0000025",
          output: "0.00001",
          cache_read: "0.00000125",
        },
        overrides: [],
        multipliers: {},
        tiered: [],
        ignored_fields: [],
        unknown_meter_fields: [],
        provenance: { source: "openrouter", logs: [] },
      },
    },
  };
  h.state.gpuPricing = {
    gpus: {
      h100: { label: "NVIDIA H100 80GB", vram_gb: 80 },
      rtx_pro_6000_se: { label: "RTX PRO 6000 SE 96GB", vram_gb: 96 },
    },
    rows: [{ provider: "first", provider_label: "First Cloud", gpu_id: "h100", gpu_label: "H100", sku: "h100-1x", gpu_hourly_usd: "2.50", confidence: "first_party" }],
  };
  h.state.serverPricing = {
    rows: [{ server_id: "srv-rtx-2x", gpu_id: "rtx_pro_6000_se", gpu_count: 2, form_factor: "2U", usd_typical: "53333" }],
  };
  h.state.servingData = JSON.parse(readFileSync(new URL("../data/serving-models.json", import.meta.url), "utf8"));
  h.state.powerSeed = JSON.parse(readFileSync(new URL("../data/power-seed.json", import.meta.url), "utf8"));
  h.state.subscriptions = { rows: [{ id: "none", label: "None", applies_to: [] }] };

  const defaults = {
    "f-users": "20", "f-sessions-day": "2", "f-days": "22", "f-horizon": "60",
    "f-peak-frac": "10", "f-tps-stream": "30", "f-p95": "", "f-utc": "2026-09-01T00:00:00Z",
    "f-mix-chat": "100", "f-mix-rag": "0", "f-mix-graphrag": "0", "f-mix-agentic": "0",
    "f-chat-turns": "2", "f-chat-in": "100", "f-chat-out": "50", "f-chat-cached": "0",
    "f-rag-turns": "2", "f-rag-in": "100", "f-rag-out": "50", "f-rag-cached": "0",
    "f-graphrag-turns": "2", "f-graphrag-in": "100", "f-graphrag-out": "50", "f-graphrag-cached": "0",
    "f-agentic-turns": "2", "f-agentic-in": "100", "f-agentic-out": "50", "f-agentic-cached": "0",
    "f-sv-model": "qwen3-5-9b", "f-sv-params": "9", "f-sv-active": "9", "f-sv-ctx": "8192", "f-sv-kvbytes": "",
    "f-sv-wquant": "fp8", "f-sv-kvquant": "fp8", "f-sv-runtime": "vllm", "f-sv-mode": "interactive", "f-sv-maxbatch": "",
    "f-sh-tps-gpu": "", "f-sh-gpu": "h100", "f-srv-basis": "usd_typical", "f-srv-config": "",
    "f-sh-count": "", "f-sh-nodes": "", "f-sh-capex": "", "f-sh-fixed": "", "f-sh-budget": "",
    "f-power-pue": "1.4", "f-power-rate": "4", "f-power-overhead": "20",
    "f-rent-provider": "first", "f-rent-gpu": "0", "f-rent-util": "70",
    "fb-feed": "openrouter", "fb-model": "openrouter:gpt-4o",
    "fr-policy": "local_first", "fr-blend": "70", "fr-failshare": "0", "fr-failrate": "2",
    "fo-license": "0", "fo-consult": "0", "f-onetime-a": "0", "f-onetime-b": "0", "f-onetime-c": "0", "fo-impl": "0",
    "f-sub-row": "none", "f-sub-term": "", "f-sub-price": "",
  };
  for (const [id, val] of Object.entries(defaults)) h.node(id).value = val;
  const selectOptions = {
    "f-sv-wquant": ["fp8", "bf16", "int8", "int4"],
    "f-sv-kvquant": ["fp8", "bf16", "int8", "fp4"],
    "f-sv-runtime": ["vllm"],
    "f-sv-mode": ["interactive", "batch"],
    "f-sh-gpu": ["h100", "rtx_pro_6000_se"],
    "f-srv-basis": ["usd_low", "usd_typical", "usd_high"],
    "f-rent-provider": ["first"],
    "f-rent-gpu": ["0"],
    "fb-feed": ["openrouter"],
    "fb-model": ["openrouter:gpt-4o"],
    "fr-policy": ["local_first"],
    "f-sub-row": ["none"],
  };
  for (const [id, opts] of Object.entries(selectOptions)) {
    h.node(id).tagName = "SELECT";
    h.node(id).options = opts.map((value) => ({ value, textContent: value }));
  }
  h.context.document.querySelectorAll = () => [...h.nodes.values()].filter((n) => /^(f-|fb-|fo-|fr-)/.test(n.id));
  h.get("readArchGroups = () => []");
  h.context.applyControls = (values) => { for (const [id, value] of Object.entries(values)) h.node(id).value = value; };
  h.get("writeReturnedControls = (values) => applyControls(values)");
  h.context.recompute = () => { computations += 1; h.state.result = { computed: true }; };
  h.get("flushLiveInput = () => recompute()");
  const starter = {
    snapshot: () => ({ mode }),
    setMode: (next) => { mode = next; if (mode === "custom") h.context.recompute(); },
    restore: (snap) => { mode = snap.mode; },
  };
  h.context.starter = starter;
  h.get("starterUI = starter");
  return { ...h, mode: () => mode, computations: () => computations, replacedUrl: () => replacedUrl };
}

test("processSizerReturn applies #sizer=v1 custom topology and owned-only fee once, warns on FX or live catalog refresh, and rolls back invalid or conflicting URLs", () => {
  const h = sizerReceiverHarness();
  const norm = normalizeSizerInput({
    workloadId: "thai_doc_line_ops",
    users: 320,
    modelId: "qwen3-8-27b",
    gpuId: "rtx_pro_6000_se",
    quoteBasis: "integrated_node",
    quoteCurrency: "THB",
    nodes: 2,
    gpusPerNode: 2,
    integratedNodePrice: { amount: "925000", currency: "THB" },
    localImplFee: { amount: "750000", currency: "THB" },
    apiOfferId: "openrouter:gpt-4o",
    pricingIdentity: "snap-0|2026-09-01|33.801000",
  });
  const frag = encodeSizerFragment(norm, { pricingIdentity: norm.pricingIdentity, resolvedApiOfferId: "openrouter:gpt-4o" });
  h.context.location.href = `https://studio.factor-io.com/tco-calculator.html#${frag}`;

  assert.equal(h.get("processSizerReturn()"), true);
  assert.equal(h.mode(), "custom");
  assert.equal(h.computations(), 1);
  assert.equal(h.node("f-sh-gpu").value, "rtx_pro_6000_se");
  assert.equal(h.node("f-sh-count").value, "4");
  assert.equal(h.node("f-sh-nodes").value, "2");
  assert.equal(h.node("f-sh-capex").value, "1850000");
  assert.equal(h.node("f-onetime-a").value, "750000");
  assert.match(h.node("return-review").innerHTML, /Pricing sources|Pricing source/);
  assert.doesNotMatch(h.node("return-review").innerHTML, /snap-0\||snap-1\||digest-pinned|complete-transport/);
  assert.equal(h.replacedUrl(), "/tco-calculator.html#custom-page");

  // Live API catalog refresh with unchanged FX triggers clean human-readable repricing notice (zero raw pipe/digest strings)
  const liveH = sizerReceiverHarness();
  const initialIdentity = buildPricingIdentity(liveH.state.manifest, liveH.state.fx);
  const liveNorm = normalizeSizerInput({
    ...norm,
    pricingIdentity: initialIdentity,
  });
  const liveFrag = encodeSizerFragment(liveNorm, { pricingIdentity: initialIdentity, resolvedApiOfferId: "openrouter:gpt-4o" });
  const oldOffer = liveH.state.catalog.offers["openrouter:gpt-4o"];
  const replaced = replaceCatalogSource(liveH.state.manifest, liveH.state.catalog, {
    source: { source_id: "openrouter", observed_at: "2026-11-17T12:00:00Z", origin: "live", integrity: "complete-transport" },
    models: [{ id: "openrouter:gpt-4o", name: "GPT-4o Live", state: "active" }],
    offers: { "openrouter:gpt-4o": { ...oldOffer, prices: { ...oldOffer.prices, input: "0.001", output: "0.002" } } },
  });
  liveH.state.manifest = replaced.manifest;
  liveH.state.catalog = replaced.catalog;
  liveH.context.location.href = `https://studio.factor-io.com/tco-calculator.html#${liveFrag}`;
  assert.equal(liveH.get("processSizerReturn()"), true);
  assert.match(liveH.node("return-review").innerHTML, /OpenRouter \(live feed 2026-11-17\)/);
  assert.doesNotMatch(liveH.node("return-review").innerHTML, /\|openrouter:|digest-pinned|complete-transport/);

  // Malformed or conflicting URLs fail closed with zero control mutation across the entire snapshot
  const snapControls = (inst) => JSON.parse(JSON.stringify(inst.get("captureControls()")));
  const bad = sizerReceiverHarness();
  const beforeBadControls = snapControls(bad);
  bad.context.location.href = "https://studio.factor-io.com/tco-calculator.html#sizer=v1.corrupted_token!";
  assert.equal(bad.get("processSizerReturn()"), false);
  assert.equal(bad.mode(), "starter");
  assert.equal(bad.computations(), 0);
  assert.deepEqual(snapControls(bad), beforeBadControls);
  assert.match(bad.node("return-review").innerHTML, /role="alert"/);

  const conflict = sizerReceiverHarness();
  const beforeConflictControls = snapControls(conflict);
  conflict.context.location.href = `https://studio.factor-io.com/tco-calculator.html?advisor=00000000-0000-4000-8000-000000000099#${frag}`;
  assert.equal(conflict.get("processSizerReturn()"), false);
  assert.equal(conflict.mode(), "starter");
  assert.equal(conflict.computations(), 0);
  assert.deepEqual(snapControls(conflict), beforeConflictControls);
});
const advisorRecord = () => ({ saved_at: Date.now(), controls: { "f-users": "20" }, contracts: { "f-users": { kind: "integer", min: 1, max: 10000000 } }, context: { mode: "custom", label: "test scenario", figures: { monthly: "฿3,300.00" }, sources: { api: { status: "stale", observed_at: "2026-01-01" } } }, answers: {} });
function advisorHarness({ record = advisorRecord(), transport = null } = {}) {
  const h = harness(); const calls = []; const returned = [];
  let request = transport ?? (async args => ({ user: { role: "user", content: args.userMessage }, assistantMessage: { role: "assistant", content: "Check the assumptions first." }, toolCall: null, prose: "Check the assumptions first." }));
  const advisor = createAdvisor({ document: h.context.document, record, onReturn: value => returned.push(value), requestTurn: args => { calls.push({ ...args, sentHistory: args.history.snapshot() }); return request(args); } });
  return { ...h, advisor, calls, returned, setRequest: value => { request = value; } };
}
const realReply = message => args => realRequestChatTurn({ ...args, timeoutMs: 1000, fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message }] }) }) });
const toolReply = (name, args, content = null) => realReply({ role: "assistant", content, tool_calls: [{ id: "tool-1", type: "function", function: { name, arguments: JSON.stringify(args) } }] });

test("dedicated advisor opens without inference; calculator contains no composer", () => {
  const h = advisorHarness();
  assert.equal(h.calls.length, 0);
  assert.match(h.node("ai-interview").innerHTML, /Question 1 of 8/);
  assert.doesNotMatch(html, /id="ai-transcript"|id="ai-composer"|id="ai-workspace"/);
  assert.match(advisorHtml, /id="ai-transcript"[^>]*role="log"[^>]*aria-live="polite"/);
  assert.match(html, /id="starter-page"[\s\S]*id="custom-page" hidden/);
  assert.doesNotMatch(advisorSource, /from ["']\.\/app\.js/);
});
test("local request preparation copies without inference, and empty copy gives guidance", async () => {
  const h = advisorHarness();
  h.node("ai-copy-request").events.click();
  assert.match(h.node("ai-model-status").textContent, /Nothing is ready/);
  h.node("ai-message").value = "Explain this locally";
  h.node("ai-copy-request").events.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.length, 0);
  assert.match(h.advisor.state.offline.copyText, /Explain this locally/);
  assert.equal(h.node("ai-message").value, "Explain this locally");
  assert.equal(h.node("ai-model-status").textContent, "Copied.");
});
test("composer sends the exact general question; plain prose does not force a tool", async () => {
  const h = advisorHarness(); h.node("ai-message").value = "Why is renting cheaper for this scenario?";
  h.node("ai-composer").requestSubmit(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls[0].userMessage, "Why is renting cheaper for this scenario?");
  assert.deepEqual(h.calls[0].toolNames, ["ask_user", "propose_calculator_changes"]);
  assert.equal(h.calls[0].assist, true);
  assert.equal(h.advisor.history.snapshot().length, 1);
});
test("captured figures are immutable and clearly described as reference evidence", async () => {
  const record = advisorRecord(); const h = advisorHarness({ record });
  record.context.figures.monthly = "changed";
  await h.advisor.send("Explain this");
  assert.equal(h.advisor.state.transcript[1].figures.monthly, "฿3,300.00");
  assert.match(h.calls[0].systemPrompt, /CAPTURED calculator evidence, not a live quote/);
  assert.match(h.node("ai-transcript").innerHTML, /Captured calculator figures/);
});
test("cancel and navigation fencing recover the question, ignore late replies and preserve drafts", async () => {
  for (const draft of ["", "My next question"]) {
    let resolve; const h = advisorHarness({ transport: () => new Promise(done => { resolve = done; }) });
    const request = h.advisor.send("Why rent?"); h.node("ai-message").value = draft;
    h.advisor.cancel("Navigation cancelled this request.");
    assert.equal(h.node("ai-message").value, draft || "Why rent?");
    assert.equal(h.calls[0].signal.aborted, true);
    resolve({ user: { role: "user", content: "Why rent?" }, assistantMessage: { role: "assistant", content: "Late answer" }, prose: "Late answer", toolCall: null });
    await request;
    assert.doesNotMatch(h.node("ai-transcript").innerHTML, /Late answer/);
    assert.equal(h.advisor.history.snapshot().length, 0);
  }
  assert.match(advisorSource, /addEventListener\("pagehide"/);
});
test("request failure is retryable status, not a fabricated assistant reply", async () => {
  const h = advisorHarness({ transport: async () => { throw new Error("Request timed out"); } });
  await h.advisor.send("Explain this");
  assert.equal(h.node("ai-message").value, "Explain this");
  assert.equal(h.advisor.state.transcript.filter(row => row.role === "assistant").length, 0);
  assert.match(h.node("ai-transcript").innerHTML, /data-role="status"/);
});
test("optional invalid tool retains safe prose and a rejected result in complete history", async () => {
  const h = advisorHarness({ transport: toolReply("unknown_tool", {}, "Check utilization first.") });
  await h.advisor.send("Why rent?");
  assert.match(h.node("ai-transcript").innerHTML, /Check utilization first/);
  const exchange = h.advisor.history.snapshot()[0];
  assert.equal(exchange.assistant.tool_calls[0].function.name, "unknown_tool");
  assert.match(exchange.tools[0].content, /rejected/);
  assert.equal(h.advisor.state.proposal, null);
});
test("guided Ask preserves an unrelated draft and uses only its question contract", async () => {
  const h = advisorHarness(); h.node("ai-message").value = "My own draft";
  h.node("ai-interview").events.click({ target: { closest: s => s === "[data-question-ask]" ? {} : null } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.node("ai-message").value, "My own draft");
  assert.deepEqual(Object.keys(h.calls[0].validationContext.questions), ["use_case"]);
  assert.match(h.calls[0].systemPrompt, /"id":"use_case"/);
});
test("general and guided turns retain one visible conversation and one bounded history", async () => {
  const h = advisorHarness();
  await h.advisor.send("Who is this for?");
  await h.advisor.send("Help me decide", { intent: "assist", questionId: "substrate" });
  await h.advisor.send("What about contractors?");
  assert.deepEqual(h.calls.map(c => c.sentHistory.length), [0, 1, 2]);
  assert.equal(h.advisor.state.transcript.filter(row => row.role === "assistant").length, 3);
  for (let i = 0; i < 10; i++) await h.advisor.send(`Follow-up ${i}`);
  assert.equal(h.advisor.history.snapshot().length, 8);
  assert.match(h.node("ai-transcript").innerHTML, /Who is this for/);
});
test("whole-system-prompt cap preserves guided question and captured context", () => {
  const record = advisorRecord(); record.blueprint = { text: "x".repeat(40000) }; record.ledger = { huge: "y".repeat(40000) };
  const prompt = advisorPrompt(record, { intent: "assist", questionId: "substrate" });
  assert.ok(prompt.length <= CHAT_LIMITS.maxSystemChars);
  assert.match(prompt, /"id":"substrate"/); assert.match(prompt, /"status":"stale"/);
  assert.doesNotThrow(() => buildOfflineRequest({ ...MINIMAX_DEFAULTS, systemPrompt: prompt, userMessage: "Which placement?", pageUrl: "https://studio.factor-io.com/tco-assistant.html", assist: true }));
});
test("wrong-question advice is rejected and accepted advice never selects an answer", async () => {
  const advice = { question_id: "data_boundary", recommended_option: "restricted", answer: "Keep records inside.", why: "They are private." };
  const h = advisorHarness({ transport: toolReply("answer_question", advice) });
  await h.advisor.send("Not sure", { intent: "assist", questionId: "use_case" });
  assert.equal(h.advisor.state.advice, null); assert.equal(h.advisor.history.snapshot().length, 0);
  h.advisor.state.questionIndex = 4;
  await h.advisor.send("Not sure", { intent: "assist", questionId: "data_boundary" });
  assert.equal(h.advisor.state.advice.question_id, "data_boundary");
  assert.equal(h.advisor.state.answers.data_boundary, undefined);
  assert.match(h.node("ai-interview").innerHTML, /AI suggestion \(not selected\)/);
  assert.deepEqual(Object.keys(advisorValidation(advisorRecord(), "data_boundary").questions), ["data_boundary"]);
});
test("claim guard still redacts money, accepts ranges and escapes prose", async () => {
  const h = advisorHarness();
  for (const text of ["It costs ฿120000 monthly.", "So 1200 + 300 = 1500 per month."]) {
    h.setRequest(realReply({ role: "assistant", content: text })); await h.advisor.send("Cost?");
    assert.match(h.node("ai-transcript").innerHTML, /Unverified figure omitted/);
    assert.doesNotMatch(h.node("ai-transcript").innerHTML, /120000|1200 \+ 300/);
  }
  h.setRequest(realReply({ role: "assistant", content: 'A 24-48 GB range, dated 2026-09. Is 5 > 3 or "internal"?' })); await h.advisor.send("Clarify");
  assert.match(h.node("ai-transcript").innerHTML, /24-48 GB/); assert.match(h.node("ai-transcript").innerHTML, /5 &gt; 3/);
  h.setRequest(realReply({ role: "assistant", content: "Use <img src=x onerror=alert(1)>" })); await h.advisor.send("Which?");
  assert.doesNotMatch(h.node("ai-transcript").innerHTML, /onerror/);
  assert.match(h.node("ai-model-status").textContent, /plain text, not HTML/);
});
test("direct advisor entry works but cannot propose changes or request a grounded spec", async () => {
  const h = advisorHarness({ record: null });
  assert.match(h.node("advisor-context").innerHTML, /No current calculator context/);
  await h.advisor.send("General advice"); assert.deepEqual(h.calls[0].toolNames, ["ask_user"]);
  await h.advisor.send("A spec", { intent: "spec" }); assert.equal(h.calls.length, 1);
  assert.equal(h.node("ai-guided-review").disabled, true);
});
test("specification requires an applied recomputed snapshot and unchanged guided answers", async () => {
  const record = { ...advisorRecord(), applied: true, blueprint: { text: "A portable deployment blueprint" }, ledger: { schema: "test" } };
  const h = advisorHarness({ record });
  assert.equal(h.node("ai-request-spec").disabled, false);
  h.advisor.state.answers = guidedAnswers; h.advisor.renderInterview();
  assert.equal(h.node("ai-request-spec").disabled, true);
  await h.advisor.send("Spec", { intent: "spec" }); assert.equal(h.calls.length, 0);
  assert.match(h.node("ai-model-status").textContent, /recomputed result/);
});
test("proposal preview is inert and only Review returns it to calculator", async () => {
  const proposal = { summary: "Review this starting point.", planning_profile: profile, changes: [{ field: "f-users", value: "200", reason: "Given team size." }], suggested_replies: [] };
  const h = advisorHarness({ transport: toolReply("propose_calculator_changes", proposal) });
  await h.advisor.send("Suggest a setup");
  assert.equal(h.returned.length, 0); assert.equal(h.node("ai-proposal").hidden, false);
  h.node("ai-review").events.click(); assert.equal(h.returned.length, 1);
  assert.equal(h.returned[0].kind, "proposal"); assert.equal(h.returned[0].value.changes[0].value, "200");
});
test("guided answers can be revised before review without touching calculator controls", () => {
  const h = advisorHarness(); h.advisor.state.answers = { ...guidedAnswers }; h.advisor.renderInterview();
  assert.equal(h.node("ai-guided-review").disabled, false);
  h.advisor.state.answers.scale = "company"; h.advisor.renderInterview();
  assert.equal(h.node("f-users").value, ""); assert.equal(h.returned.length, 0);
  h.node("ai-guided-review").events.click();
  assert.equal(h.returned[0].answers.scale, "company");
  assert.equal(h.returned[0].kind, "guided");
});
test("manual calculator edits invalidate the applied blueprint authority", () => {
  const h = harness(); h.state.ready = true; h.get("plannerState.applied = true"); h.get("onLiveInput()");
  assert.equal(h.get("plannerState.applied"), false);
  assert.doesNotMatch(html, /id="ai-refinement"/);
});
test("AI has no credential controls, and prose is outside calculator input harvesting", () => {
  for (const surface of [html, advisorHtml]) assert.doesNotMatch(surface, /id="ai-token"|id="ai-endpoint"|type="password"/);
  assert.doesNotMatch(advisorHtml, /MiniMax/i); assert.match(privacy, /MiniMax/i); assert.match(llms, /MiniMax/i);
  const h = harness(); h.context.document.querySelectorAll = () => [h.node("ai-message"), h.node("f-users")];
  assert.equal(h.get("enteredControls().map(el => el.id).join(',')"), "f-users");
});
test("Nutanix blueprint keeps licensing boundary and privacy surfaces disclose proxy", () => {
  assert.match(buildBlueprint(buildPlannerPlan(profile), {}).text, /no public list price/i);
  assert.match(privacy, /Factor IO now proxies calculator AI requests/i);
  assert.match(llms, /Factor I O DOES proxy calculator AI requests/i);
  assert.match(privacy, /credential is held on a Factor IO server/i);
  assert.match(privacy, /automatic public GET requests at startup/i);
  assert.match(llms, /automatically GETs public OpenRouter pricing and Frankfurter FX/i);
});

test("the staleness banner says how old the prices are, not which envelope lapsed", () => {
  const h = harness();
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

  h.get("renderBanner")({ banner: { level: "STALE PRICING", sources: [
    { source_id: "openrouter", observed_at: daysAgo(3) },
    { source_id: "litellm", observed_at: daysAgo(5) },
  ] } });
  const html = h.node("banner").innerHTML;
  // Age comes from the OLDEST stale source, so the line never understates it.
  assert.match(html, /These prices are 5 days old/);
  assert.match(html, /model API prices may have moved since/);
  assert.match(html, /still holds/);
  // The precise feed dates survive, just not as the headline.
  assert.match(html, /Last checked: openrouter \d{4}-\d{2}-\d{2}, litellm \d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(html, /freshness envelope/);

  // Duplicate sources collapse to one human label rather than repeating it.
  h.get("renderBanner")({ banner: { level: "STALE PRICING", sources: [
    { source_id: "openrouter", observed_at: daysAgo(1) },
    { source_id: "litellm", observed_at: daysAgo(1) },
  ] } });
  assert.match(h.node("banner").innerHTML, /These prices are a day old/);
  assert.equal(h.node("banner").innerHTML.match(/model API prices/g).length, 1);

  h.get("renderBanner")({ banner: null });
});

test("custom 70B flat-KV and parameter-override projections match real buildScenario -> runComparison across owned, API, and rented GPU lanes", () => {
  const fullData = {
    manifest: JSON.parse(readFileSync(new URL("../data/manifest.json", import.meta.url), "utf8")),
    fx: normalizeFxDocument({ observed_at: "2026-09-01", usd_thb: "33.801", source_id: "fixture" }),
    gpuPricing: JSON.parse(readFileSync(new URL("../data/gpu-pricing.json", import.meta.url), "utf8")),
    serverPricing: JSON.parse(readFileSync(new URL("../data/server-pricing.json", import.meta.url), "utf8")),
    servingData: JSON.parse(readFileSync(new URL("../data/serving-models.json", import.meta.url), "utf8")),
    powerSeed: JSON.parse(readFileSync(new URL("../data/power-seed.json", import.meta.url), "utf8")),
    subscriptions: JSON.parse(readFileSync(new URL("../data/subscription-pricing.json", import.meta.url), "utf8")),
  };
  fullData.catalog = JSON.parse(
    readFileSync(new URL(`../data/${fullData.manifest.resources.catalog.path}`, import.meta.url), "utf8"),
  );

  for (const rawScenario of [
    {
      users: 120,
      rawPromptTokens: 12000,
      rawOutputTokens: 600,
      rawContextTokens: 32768,
      tokenBasis: "thai_tokenized_1x",
      modelId: "custom",
      customParamsB: "70",
      customActiveParamsB: "70",
      customKvBytesBf16: 327680,
      customContextMax: 65536,
      wquant: "fp8",
      kvquant: "fp8",
      gpuId: "h100",
      quoteBasis: "catalog",
    },
    {
      users: 180,
      rawPromptTokens: 10500,
      rawOutputTokens: 500,
      rawContextTokens: 32768,
      modelId: "qwen3-8-27b",
      customParamsB: "34",
      customActiveParamsB: "34",
      wquant: "fp8",
      kvquant: "fp8",
      gpuId: "rtx_pro_6000_se",
      quoteBasis: "catalog",
    },
  ]) {
    const normalized = normalizeSizerInput(rawScenario);
    const h = sizerReceiverHarness();
    Object.assign(h.context, demandMod, servingMod, capexMod, subscriptionMod, powerMod, calculatorMod);
    Object.assign(h.state, fullData);
    powerMod.configurePowerSeed(fullData.powerSeed);

    const projected = projectSizerControls({
      normalized,
      beforeControls: h.get("captureControls()"),
      stateData: fullData,
    });
    h.context.applyControls(projected.controls);
    h.context.realGroups = projected.groups;
    h.get("readArchGroups = () => realGroups");

    const actual = calculatorMod.runComparison(h.get("buildScenario()").inputs);
    for (const lane of ["A", "B", "C"]) {
      for (const field of ["one_time", "monthly_total", "horizon_total"]) {
        if (actual.totals[lane][field] === null) {
          assert.equal(projected.result.comparison.totals[lane][field], null);
        } else {
          assert.equal(
            formatHalfUp(toRat(actual.totals[lane][field]), 8),
            formatHalfUp(toRat(projected.result.comparison.totals[lane][field]), 8),
            `mismatch on lane ${lane}.${field} for model ${rawScenario.modelId}`,
          );
        }
      }
    }
  }
});

test("real setupStarters + processSizerReturn wire #starter-back and #topbar-sizer-link to sizer origin, flag calculator edits, preserve advisor roundtrips, and keep direct starter fallback", () => {
  const makeRealOriginHarness = () => {
    const h = sizerReceiverHarness();
    const navigated = [];
    const domDoc = {
      getElementById: (id) => h.node(id),
    };
    const prevDoc = globalThis.document;
    globalThis.document = domDoc;
    let realStarter;
    try {
      realStarter = realSetupStarters({
        getData: () => ({ ...h.state, ready: false, fx: h.state.fx }),
        onAdvisor: () => {},
        onCustom: () => { h.get("void 0"); },
        onBackFromCustom: (dest) => { navigated.push(dest); },
        validateReturnOrigin: (cand) => h.context.validateSizerReturnOrigin(cand),
      });
    } finally {
      globalThis.document = prevDoc;
    }
    h.context.realStarter = realStarter;
    h.get("starterUI = realStarter");
    return { h, realStarter, navigated, runWithDom: (fn) => {
      const prev = globalThis.document;
      globalThis.document = domDoc;
      try { return fn(); } finally { globalThis.document = prev; }
    } };
  };

  // 1. Direct calculator visitor: entering custom mode and clicking #starter-back returns to starter-page, never sizer
  const direct = makeRealOriginHarness();
  direct.runWithDom(() => {
    direct.realStarter.setMode("custom");
    assert.equal(direct.h.node("starter-back").textContent, "← Back to single-server examples");
    direct.h.node("starter-back").events.click();
    assert.equal(direct.realStarter.snapshot().mode, "starter");
    assert.equal(direct.navigated.length, 0);
  });

  // 2. Valid #sizer=v1 arrival: installs returnOrigin, updates #starter-back and #topbar-sizer-link, and navigates back to sizer without switching to starter
  const sizerVisit = makeRealOriginHarness();
  const norm = normalizeSizerInput({
    workloadId: "thai_knowledge_rag",
    users: 200,
    rawPromptTokens: 12000,
    rawOutputTokens: 500,
    rawContextTokens: 32768,
    modelId: "qwen3-5-9b",
    gpuId: "rtx_pro_6000_se",
    quoteBasis: "integrated_node",
    nodes: 1,
    gpusPerNode: 2,
    integratedNodePrice: { amount: "900000", currency: "THB" },
    apiOfferId: "openrouter:gpt-4o",
  });
  const frag = encodeSizerFragment(norm, { resolvedApiOfferId: "openrouter:gpt-4o" });
  sizerVisit.h.context.location.href = `https://studio.factor-io.com/tco-calculator.html#${frag}`;

  sizerVisit.runWithDom(() => {
    assert.equal(sizerVisit.h.get("processSizerReturn()"), true);
    assert.equal(sizerVisit.realStarter.snapshot().mode, "custom");
    assert.equal(sizerVisit.h.node("starter-back").textContent, "← Back to Guided Local AI Sizer");
    assert.equal(sizerVisit.h.node("topbar-sizer-link").href, `local-ai-sizer.html#${frag}`);

    // Editing f-onetime-a on custom-page visibly labels that calculator edits are not included in original sizer return
    sizerVisit.h.node("f-onetime-a").value = "999999";
    sizerVisit.h.get("onLiveInput()");
    assert.match(sizerVisit.h.node("starter-back").textContent, /calculator edits not included/);

    sizerVisit.h.node("starter-back").events.click();
    assert.deepEqual(sizerVisit.navigated, [`local-ai-sizer.html#${frag}`]);
    assert.equal(sizerVisit.realStarter.snapshot().mode, "custom");

    // Snapshot -> restore (openAdvisor roundtrip) preserves valid returnOrigin and rejects tampered fragments
    const savedSnap = sizerVisit.realStarter.snapshot();
    assert.equal(savedSnap.returnOrigin.fragment, frag);

    const restoredVisit = makeRealOriginHarness();
    restoredVisit.runWithDom(() => {
      restoredVisit.realStarter.restore(savedSnap);
      assert.equal(restoredVisit.realStarter.getReturnOrigin().fragment, frag);
      assert.equal(restoredVisit.h.node("topbar-sizer-link").href, `local-ai-sizer.html#${frag}`);

      // Forged/corrupted fragment in restore is rejected cleanly
      restoredVisit.realStarter.restore({ ...savedSnap, returnOrigin: { kind: "sizer", fragment: "sizer=v1.bad_token!" } });
      assert.equal(restoredVisit.realStarter.getReturnOrigin(), null);
      assert.equal(restoredVisit.h.node("topbar-sizer-link").href, "local-ai-sizer.html");
    });

    // Reset clears returnOrigin
    sizerVisit.realStarter.setReturnOrigin(null);
    assert.equal(sizerVisit.realStarter.getReturnOrigin(), null);
    assert.equal(sizerVisit.h.node("starter-back").textContent, "← Back to single-server examples");
  });

  // 3. Simultaneous conflicting ?advisor=...#sizer=... leaves both controls and returnOrigin untouched
  const conflictVisit = makeRealOriginHarness();
  conflictVisit.h.context.location.href = `https://studio.factor-io.com/tco-calculator.html?advisor=00000000-0000-4000-8000-000000000099#${frag}`;
  conflictVisit.runWithDom(() => {
    assert.equal(conflictVisit.h.get("processSizerReturn()"), false);
    assert.equal(conflictVisit.realStarter.getReturnOrigin(), null);
    assert.equal(conflictVisit.realStarter.snapshot().mode, "starter");
  });
});

test("createSizerStorageAdapter handles SecurityError, QuotaExceededError, corrupted storage, and 25-record caps without losing prior saves", () => {
  // 1. Storage getter throws SecurityError
  const denied = createSizerStorageAdapter(() => {
    throw new Error("SecurityError: storage disabled");
  });
  const deniedRead = denied.readSavedScenarios();
  assert.equal(deniedRead.ok, false);
  assert.equal(deniedRead.available, false);
  assert.equal(denied.saveScenario({ id: "s1", name: "Test", savedAt: "2026-11-17T00:00:00Z", fragment: encodeSizerFragment(normalizeSizerInput({})) }).ok, false);

  // 2. QuotaExceededError on write preserves existing saved records untouched
  const map = new Map();
  let failWrites = false;
  const mockStore = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (failWrites) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k) => map.delete(k),
  };
  const adapter = createSizerStorageAdapter(() => mockStore);
  const frag1 = encodeSizerFragment(normalizeSizerInput({ workloadId: "mfg_qms_sop", users: 260 }));
  const saved1 = adapter.saveScenario({ id: "save-1", name: "Factory QMS", savedAt: "2026-11-17T08:00:00Z", fragment: frag1 });
  assert.equal(saved1.ok, true);
  assert.equal(saved1.scenarios.length, 1);

  failWrites = true;
  const quotaFail = adapter.saveScenario({ id: "save-2", name: "Will Fail", savedAt: "2026-11-17T09:00:00Z", fragment: frag1 });
  assert.equal(quotaFail.ok, false);
  assert.equal(quotaFail.code, "storage_write_failed");
  const afterFail = adapter.readSavedScenarios();
  assert.equal(afterFail.ok, true);
  assert.deepEqual(afterFail.scenarios.map((s) => s.id), ["save-1"]);

  // 3. Corrupted storage payload refuses overwrite instead of silently wiping data
  failWrites = false;
  map.set(SIZER_STORAGE_KEY, "{corrupted-json");
  const corruptRead = adapter.readSavedScenarios();
  assert.equal(corruptRead.ok, false);
  assert.equal(corruptRead.corrupted, true);
  assert.equal(adapter.saveScenario({ id: "save-3", name: "Blocked", savedAt: "2026-11-17T09:00:00Z", fragment: frag1 }).code, "storage_corrupted");

  // 4. Cap at 25 saved scenarios refuses the 26th without overwriting prior 25
  const entries25 = Array.from({ length: 25 }, (_, i) => ({
    id: `id-${i + 1}`,
    name: `Saved ${i + 1}`,
    savedAt: "2026-11-17T10:00:00Z",
    fragment: frag1,
  }));
  map.set(SIZER_STORAGE_KEY, encodeSizerSaveEnvelope(entries25, { exportedAt: "2026-11-17T10:00:00Z" }));
  const capRes = adapter.saveScenario({ id: "id-26", name: "26th", savedAt: "2026-11-17T11:00:00Z", fragment: frag1 });
  assert.equal(capRes.ok, false);
  assert.equal(capRes.code, "max_scenarios_reached");
  assert.equal(adapter.readSavedScenarios().scenarios.length, 25);
});

test("refreshLiveSourcesTransaction enforces overall deadline, isolates duplicate-ID OpenRouter compile errors, and aligns live pricingIdentity", async () => {
  const baseManifest = {
    snapshot_digest: "snap-abc",
    sources: {
      fx: { origin: "snapshot", observed_at: "2026-11-16T00:00:00.000Z", integrity: "digest-pinned" },
      litellm: { origin: "snapshot", observed_at: "2026-11-17T06:00:00.000Z", integrity: "declared" },
      openrouter: { origin: "snapshot", observed_at: "2026-11-17T06:00:00.000Z", integrity: "declared" },
    },
    models: [{ id: "openrouter:openai/gpt-4o", name: "Snapshot GPT-4o", state: "active" }],
  };
  const baseCatalog = {
    offers: {
      "openrouter:openai/gpt-4o": {
        offer_id: "openrouter:openai/gpt-4o",
        seller: "openrouter",
        seller_source: "openrouter",
        product: "openai/gpt-4o",
        prices: { "input|std": "0.0000025", "output|std": "0.00001" },
      },
    },
    offers_state: [{ offer_id: "openrouter:openai/gpt-4o", state: "active", missing_streak: 0 }],
  };
  const baseFx = normalizeFxDocument({ observed_at: "2026-11-16", usd_thb: "33.889595", source_id: "ecb", integrity: "digest-pinned" });

  // 1. Slow/hanging network aborts within the overall deadline and preserves snapshot
  const t0 = Date.now();
  const hung = await refreshLiveSourcesTransaction({
    manifest: baseManifest,
    catalog: baseCatalog,
    fx: baseFx,
    timeoutMs: 80,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  });
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(hung.openrouterLive, false);
  assert.equal(hung.fxLive, false);
  assert.equal(hung.manifest, baseManifest);
  assert.equal(hung.fx, baseFx);

  // 2. Duplicate model IDs in HTTP 200 OpenRouter response fail only OpenRouter compilation while live FX still succeeds
  const dup = await refreshLiveSourcesTransaction({
    manifest: baseManifest,
    catalog: baseCatalog,
    fx: baseFx,
    timeoutMs: 1000,
    nowFn: () => Date.parse("2026-11-17T16:00:00.000Z"),
    fetchImpl: async (url) => {
      if (String(url).includes("openrouter")) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            data: [
              { id: "openai/gpt-4o", name: "GPT-4o", pricing: { prompt: "0.0000025", completion: "0.00001" } },
              { id: "openai/gpt-4o", name: "Duplicate GPT-4o", pricing: { prompt: "0.0000025", completion: "0.00001" } },
            ],
          }),
        };
      }
      return {
        ok: true,
        text: async () => JSON.stringify({ base: "EUR", date: "2026-11-17", rates: { USD: 1.05, THB: 35.5322 } }),
      };
    },
  });
  assert.equal(dup.openrouterLive, false);
  assert.match(dup.errors.openrouter, /duplicate offer/i);
  assert.equal(dup.fxLive, true);
  assert.equal(dup.catalog, baseCatalog);
  assert.equal(dup.manifest.sources.fx.origin, "live");

  // 3. Valid live OpenRouter + live FX updates both sources cleanly with complete-transport identity
  const cleanLive = await refreshLiveSourcesTransaction({
    manifest: baseManifest,
    catalog: baseCatalog,
    fx: baseFx,
    timeoutMs: 1000,
    nowFn: () => Date.parse("2026-11-17T16:00:00.000Z"),
    fetchImpl: async (url) => {
      if (String(url).includes("openrouter")) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            data: [{ id: "openai/gpt-4o", name: "GPT-4o Live", pricing: { prompt: "0.0000025", completion: "0.00001" } }],
          }),
        };
      }
      return {
        ok: true,
        text: async () => JSON.stringify({ base: "EUR", date: "2026-11-17", rates: { USD: 1.05, THB: 35.5322 } }),
      };
    },
  });
  assert.equal(cleanLive.openrouterLive, true);
  assert.equal(cleanLive.fxLive, true);
  assert.match(buildPricingIdentity(cleanLive.manifest, cleanLive.fx), /fx:live@2026-11-17T00:00:00\.000Z:complete-transport.*openrouter:live@2026-11-17T16:00:00\.000Z:complete-transport/);
});

test("processSizerReturn accepts active-only catalog overrides, and editing then clearing a hydrated legacy custom draft clears legacy provenance", () => {
  // 1. Receiver roundtrip for active-only catalog override
  const h = sizerReceiverHarness();
  const activeFrag = encodeSizerFragment(normalizeSizerInput({
    users: 120,
    modelId: "qwen3-8-27b",
    gpuId: "rtx_pro_6000_se",
    customActiveParamsB: "5",
  }));
  h.context.location.href = `https://studio.factor-io.com/tco-calculator.html#${activeFrag}`;
  assert.equal(h.get("processSizerReturn()"), true);
  assert.equal(h.node("f-sv-active").value, "5");

  // 2. UI draft: hydrating a 44-key legacy custom link preserves assumed shape until edited, then clearing refuses
  const uiSrc = readFileSync(new URL("../sizer-ui.js", import.meta.url), "utf8");
  const uiNodes = new Map();
  const uiNode = (id) => {
    if (!uiNodes.has(id)) {
      uiNodes.set(id, {
        id,
        value: "",
        innerHTML: "",
        textContent: "",
        attrs: {},
        hidden: false,
        open: false,
        setAttribute(k, v) { this.attrs[k] = v; },
        removeAttribute(k) { delete this.attrs[k]; },
      });
    }
    return uiNodes.get(id);
  };
  const uiCtx = vm.createContext({
    DEAL_TIERS,
    PIPELINE_CONNECTORS,
    PROMPT_SCALE_PRESETS: [],
    LOCAL_AI_WORKLOADS,
    MAX_SAVE_BYTES: 65536,
    MAX_SAVED_SCENARIOS: 25,
    normalizeSizerInput,
    buildSessionProjectionFromConfig,
    resolveSizerModel,
    estimateModelWeightGb,
    computeSizer,
    evaluateGpuCandidates: () => [],
    groupCatalogModels: () => [],
    filterApiOffers: () => ({ offers: [], totalMatching: 0, totalAvailable: 0, vendors: [] }),
    classifyApiOffer: () => ({ feed: "openrouter", vendor: "openai" }),
    encodeSizerFragment,
    decodeSizerFragment,
    decodePresetFragment,
    encodeSizerSaveEnvelope,
    decodeSizerSaveEnvelope,
    SizerValidationError,
    formatHalfUp,
    toRat,
    normalizeFxDocument,
    toTHB,
    serversForGpu: () => [],
    fetchOpenRouterModels: async () => [],
    compileLiveOpenRouter: () => ({}),
    replaceCatalogSource: () => ({}),
    fetchLiveFx: async () => ({}),
    loadManifest: async () => ({}),
    loadFx: async () => ({}),
    resolveResource: async () => ({}),
    TextEncoder,
    TextDecoder,
    AbortController,
    DOMException,
    structuredClone,
    setTimeout,
    clearTimeout,
    URL,
    console,
    document: { getElementById: (id) => (id === "main-workspace" ? null : uiNode(id)) },
  });
  vm.runInContext(uiSrc.replace(/^import[\s\S]*?;\s*$/gm, "").replace(/^export\s+/gm, ""), uiCtx);
  const st = vm.runInContext("appState", uiCtx);
  st.data = h.state;
  st.ready = true;
  st.lang = "en";
  st.displayCurrency = "USD";

  const stdCompact = JSON.parse(Buffer.from(encodeSizerFragment(normalizeSizerInput({})).split(".")[1], "base64url").toString());
  const legacyTok = `#sizer=v1.${Buffer.from(JSON.stringify({ ...stdCompact, m: "custom" })).toString("base64url")}`;
  uiCtx.legacyDecoded = decodeSizerFragment(legacyTok);
  vm.runInContext("hydrateDraftFromNormalized(legacyDecoded); recompute();", uiCtx);
  assert.equal(st.computed.ok, true);
  assert.ok(st.computed.fit.warnings.some((w) => w.code === "assumed_legacy_custom_shape"));
  // Unchanged hydrated legacy draft still encodes cleanly for save/share
  assert.match(vm.runInContext("buildCurrentFragment()", uiCtx), /^sizer=v1\./);

  // Editing any custom field then clearing it revokes legacy provenance -> incomplete_custom_model
  vm.runInContext("handleFieldMutation('customParamsB', '70'); handleFieldMutation('customParamsB', ''); recompute();", uiCtx);
  assert.equal(st.computed.ok, false);
  assert.equal(st.computed.code, "incomplete_custom_model");
  assert.throws(() => vm.runInContext("buildCurrentFragment()", uiCtx), /Custom model requires/i);
});

test("real app.js readArchGroups preserves catalog CSA2 compressed-MLA descriptors and rope=0, and drops hidden compression when geometry is edited", () => {
  const h = sizerReceiverHarness();
  // Restore the real app.js renderArchGroups + readArchGroups over DOM group nodes
  const realApp = harness();
  realApp.state.servingData = h.state.servingData;
  realApp.node("sv-groups");
  const wireGroupControls = (groups) => {
    groups.forEach((g, i) => {
      realApp.node(`f-g${i}-kind`).value = g.kind;
      realApp.node(`f-g${i}-layers`).value = String(g.layers);
      if (g.kind === "mla") {
        realApp.node(`f-g${i}-lora`).value = String(g.kv_lora_rank);
        realApp.node(`f-g${i}-rope`).value = String(g.qk_rope_head_dim);
      } else if (g.kind !== "linear") {
        realApp.node(`f-g${i}-heads`).value = String(g.kv_heads);
        realApp.node(`f-g${i}-dim`).value = String(g.head_dim);
        realApp.node(`f-g${i}-tensors`).value = String(g.tensors ?? 2);
        if (g.kind === "sliding") realApp.node(`f-g${i}-window`).value = String(g.window_tokens ?? "");
      }
    });
  };

  // 1. DeepSeek-V4.1-Flash-1017: preserves compress_ratio=2, index_bytes_per_entry=68, and rope=0 (890 B/tok global FP4)
  const ds = h.state.servingData.models.find((m) => m.id === "deepseek-v4-1-flash-1017");
  realApp.state.archGroups = ds.groups;
  wireGroupControls(ds.groups);
  const readDs = realApp.get("readArchGroups()");
  assert.equal(readDs[1].qk_rope_head_dim, 0);
  assert.equal(readDs[1].compress_ratio, 2);
  assert.equal(readDs[1].index_bytes_per_entry, 68);
  assert.equal(formatHalfUp(servingMod.kvBytesPerToken(readDs.slice(1), "0.5625"), 0), "890");

  // Manually changing lora rank drops hidden catalog compress_ratio/index_bytes_per_entry
  realApp.node("f-g1-lora").value = "256";
  const editedDs = realApp.get("readArchGroups()");
  assert.equal(editedDs[1].kv_lora_rank, 256);
  assert.equal(editedDs[1].compress_ratio, undefined);
  assert.equal(editedDs[1].index_bytes_per_entry, undefined);
});

test("processSizerReturn preserves 8-decimal stacked session parity across offer switches (including no-cache fallback) and transitions cleanly on flat-shape edits", () => {
  const h = harness();
  Object.assign(h.context, demandMod, servingMod, capexMod, subscriptionMod, powerMod, calculatorMod);
  h.state.ready = true;
  h.state.servingData = JSON.parse(readFileSync(new URL("../data/serving-models.json", import.meta.url), "utf8"));
  h.state.powerSeed = JSON.parse(readFileSync(new URL("../data/power-seed.json", import.meta.url), "utf8"));
  powerMod.configurePowerSeed(h.state.powerSeed);
  h.state.fx = normalizeFxDocument({ source_id: "fixture-fx", observed_at: "2026-09-01", usd_thb: "33.801000" });
  h.state.gpuPricing = {
    gpus: {
      h100: { label: "NVIDIA H100 80GB", vram_gb: 80 },
      rtx_pro_6000_se: { label: "RTX PRO 6000 SE 96GB", vram_gb: 96 },
    },
    rows: [{ provider: "first", provider_label: "First Cloud", gpu_id: "h100", gpu_label: "H100", sku: "h100-1x", gpu_hourly_usd: "2.50", confidence: "first_party" }],
  };
  h.state.serverPricing = {
    rows: [{ server_id: "srv-rtx-2x", label: "2x RTX Server", gpu_id: "rtx_pro_6000_se", gpu_count: 2, form_factor: "2U", usd_typical: "53333" }],
  };
  h.state.subscriptions = { rows: [{ id: "none", label: "None", applies_to: [] }] };
  h.state.manifest = {
    snapshot_digest: "snap-parity",
    generated_at: "2026-11-18T00:00:00Z",
    sources: { openrouter: { origin: "snapshot", observed_at: "2026-11-18T00:00:00Z", integrity: "declared" } },
    models: [
      { id: "openrouter:vendor/tiered-cached", name: "Tiered Cached", state: "active" },
      { id: "openrouter:vendor/no-cache-1usd", name: "No Cache 1USD", state: "active" },
    ],
  };
  h.state.catalog = {
    offers: {
      "openrouter:vendor/tiered-cached": {
        offer_id: "openrouter:vendor/tiered-cached",
        seller: "openrouter",
        seller_source: "openrouter",
        channel: "api",
        product: "vendor/tiered-cached",
        display_name: "Tiered Cached",
        tariff: "token",
        ingest_mode: "chat",
        state: "active",
        quarantine_reason: null,
        missing_streak: 0,
        expiration_date: null,
        prices: { "input|std": "0.000001", "output|std": "0", "cache_read|std": "0.0000002" },
        overrides: [{ conditions: { min_prompt_tokens: 22000 }, prices: { "input|std": "0.000003" } }],
        multipliers: {},
        tiered: [],
        ignored_fields: [],
        unknown_meter_fields: [],
        provenance: { source: "openrouter", logs: [] },
      },
      "openrouter:vendor/no-cache-1usd": {
        offer_id: "openrouter:vendor/no-cache-1usd",
        seller: "openrouter",
        seller_source: "openrouter",
        channel: "api",
        product: "vendor/no-cache-1usd",
        display_name: "No Cache 1USD",
        tariff: "token",
        ingest_mode: "chat",
        state: "active",
        quarantine_reason: null,
        missing_streak: 0,
        expiration_date: null,
        prices: { "input|std": "0.000001", "output|std": "0" },
        overrides: [],
        multipliers: {},
        tiered: [],
        ignored_fields: [],
        unknown_meter_fields: [],
        provenance: { source: "openrouter", logs: [] },
      },
    },
  };

  // Seed minimal calculator controls required by captureControls + validateReturnedControls
  const baseDefaults = {
    "f-users": "1", "f-sessions-day": "1", "f-days": "1", "f-horizon": "60",
    "f-peak-frac": "10", "f-tps-stream": "30", "f-p95": "", "f-utc": "2026-09-01T00:00:00Z",
    "f-mix-chat": "100", "f-mix-rag": "0", "f-mix-graphrag": "0", "f-mix-agentic": "0",
    "f-chat-turns": "1", "f-chat-in": "100", "f-chat-out": "50", "f-chat-cached": "0",
    "f-rag-turns": "1", "f-rag-in": "100", "f-rag-out": "50", "f-rag-cached": "0",
    "f-graphrag-turns": "1", "f-graphrag-in": "100", "f-graphrag-out": "50", "f-graphrag-cached": "0",
    "f-agentic-turns": "1", "f-agentic-in": "100", "f-agentic-out": "50", "f-agentic-cached": "0",
    "f-sv-model": "flint", "f-sv-params": "39.79", "f-sv-active": "2.82", "f-sv-ctx": "32768", "f-sv-kvbytes": "",
    "f-sv-wquant": "fp8", "f-sv-kvquant": "fp4", "f-sv-runtime": "vllm", "f-sv-mode": "interactive", "f-sv-maxbatch": "",
    "f-sh-tps-gpu": "", "f-sh-gpu": "rtx_pro_6000_se", "f-srv-basis": "usd_typical", "f-srv-config": "srv-rtx-2x",
    "f-sh-count": "", "f-sh-nodes": "", "f-sh-capex": "", "f-sh-fixed": "", "f-sh-budget": "",
    "f-power-pue": "1.4", "f-power-rate": "4", "f-power-overhead": "20",
    "f-rent-provider": "first", "f-rent-gpu": "0", "f-rent-util": "70",
    "fb-feed": "openrouter", "fb-model": "openrouter:vendor/tiered-cached",
    "fr-policy": "local_first", "fr-blend": "70", "fr-failshare": "0", "fr-failrate": "2",
    "fo-license": "0", "fo-consult": "0", "f-onetime-a": "0", "f-onetime-b": "0", "f-onetime-c": "0", "fo-impl": "0",
    "f-sub-row": "none", "f-sub-term": "", "f-sub-price": "",
  };
  for (const [id, val] of Object.entries(baseDefaults)) h.node(id).value = val;
  const selectMap = {
    "f-sv-model": h.state.servingData.models.map((m) => m.id),
    "f-sv-wquant": ["fp8", "bf16", "int8", "int4"],
    "f-sv-kvquant": ["fp8", "bf16", "int8", "fp4"],
    "f-sv-runtime": ["vllm", "sglang", "trtllm", "llamacpp"],
    "f-sv-mode": ["interactive", "batch"],
    "f-sh-gpu": ["h100", "rtx_pro_6000_se"],
    "f-srv-basis": ["usd_low", "usd_typical", "usd_high"],
    "f-srv-config": ["", "srv-rtx-2x"],
    "f-rent-provider": ["first"],
    "f-rent-gpu": ["0"],
    "fb-feed": ["openrouter"],
    "fb-model": ["openrouter:vendor/tiered-cached", "openrouter:vendor/no-cache-1usd"],
    "fr-policy": ["local_first"],
    "f-sub-row": ["none"],
    "f-utc": ["2026-09-01T00:00:00Z"],
  };
  for (const [id, opts] of Object.entries(selectMap)) {
    h.node(id).tagName = "SELECT";
    h.node(id).options = opts.map((value) => ({ value, textContent: value }));
    h.node(id).selectedOptions = h.node(id).options.slice(0, 1);
    h.node(id).appendChild = (opt) => h.node(id).options.push(opt);
  }
  h.context.document.querySelectorAll = () => [...h.nodes.values()].filter((n) => /^(f-|fb-|fo-|fr-)/.test(n.id));
  // Keep group DOM nodes in sync when renderArchGroups runs and wire real run() into starter/live recompute
  const realReadArchGroups = h.get("readArchGroups");
  h.get(`renderArchGroups = (groups) => {
    state.archGroups = groups ?? [];
    groups.forEach((g, i) => {
      const mk = (s, v) => { const el = $('f-g' + i + '-' + s); el.value = String(v ?? ''); };
      mk('kind', g.kind); mk('layers', g.layers);
      if (g.kind === 'mla') { mk('lora', g.kv_lora_rank); mk('rope', g.qk_rope_head_dim); }
      else if (g.kind !== 'linear') { mk('heads', g.kv_heads); mk('dim', g.head_dim); mk('tensors', g.tensors ?? 2); if (g.kind === 'sliding') mk('window', g.window_tokens ?? ''); }
    });
  }`);
  h.context.realReadArchGroups = realReadArchGroups;
  h.get("readArchGroups = realReadArchGroups");
  h.context.applyControls = (values) => { for (const [id, value] of Object.entries(values)) h.node(id).value = value; };
  h.get("writeReturnedControls = (values, groups) => { renderArchGroups(groups); applyControls(values); }");
  h.get("renderServingNote = () => {}; renderResults = () => {}; renderServerNote = () => {}; renderPowerNote = () => {}; renderSubNote = () => {};");
  h.get("starterUI = { snapshot: () => ({ mode: 'starter' }), setMode: () => run(), restore: () => {} }");

  const sizerRes = computeSizer({
    input: {
      users: 1,
      sessionsPerUserDay: "1",
      workingDaysMo: 1,
      tokenBasis: "thai_tokenized_1x",
      rawSystemPromptTokens: 20000,
      rawPromptTokens: 1000,
      rawOutputTokens: 500,
      turnsPerSession: 2,
      kvCacheHitRate: "1",
      rawContextTokens: 32768,
      modelId: "flint",
      wquant: "fp8",
      kvquant: "fp4",
      gpuId: "rtx_pro_6000_se",
      apiOfferId: "openrouter:vendor/tiered-cached",
      quoteUtc: "2026-09-01T00:00:00Z",
    },
    data: {
      manifest: h.state.manifest,
      catalog: h.state.catalog,
      fx: h.state.fx,
      gpuPricing: h.state.gpuPricing,
      serverPricing: h.state.serverPricing,
      servingData: h.state.servingData,
      powerSeed: h.state.powerSeed,
      subscriptions: h.state.subscriptions,
    },
    nowMs: Date.parse("2026-09-01T00:00:00Z"),
  });
  assert.equal(sizerRes.ok, true);
  assert.equal(formatHalfUp(toRat(sizerRes.comparison.totals.B.monthly_total), 8), "0.02830000");

  const frag = encodeSizerFragment(sizerRes.normalized, {
    pricingIdentity: sizerRes.pricingIdentity,
    resolvedApiOfferId: "openrouter:vendor/tiered-cached",
  });
  h.context.location.href = `https://studio.factor-io.com/tco-calculator.html#${frag}`;
  assert.equal(h.get("processSizerReturn()"), true);

  // Exact 8-decimal parity across Owned Local AI (A), Cloud Model API (B), and Rented GPU (C)
  for (const opt of ["A", "B", "C"]) {
    assert.equal(
      formatHalfUp(toRat(h.state.result.totals[opt].monthly_total), 8),
      formatHalfUp(toRat(sizerRes.comparison.totals[opt].monthly_total), 8),
      `8-decimal monthly parity mismatch on option ${opt}`,
    );
    assert.equal(
      formatHalfUp(toRat(h.state.result.totals[opt].horizon_total), 8),
      formatHalfUp(toRat(sizerRes.comparison.totals[opt].horizon_total), 8),
      `8-decimal horizon parity mismatch on option ${opt}`,
    );
  }

  // Peer Case 2 on receiver: switching fb-model to no-cache offer preserves sessionProjection and bills carried prefix at $1/M ($0.04350000)
  h.node("fb-model").value = "openrouter:vendor/no-cache-1usd";
  h.get("handleControlEdit({ target: $('fb-model'), type: 'change' })");
  h.tick();
  assert.ok(h.state.sessionProjection, "offer switch must preserve state.sessionProjection");
  assert.equal(formatHalfUp(toRat(h.state.result.totals.B.monthly_total), 8), "0.04350000");
  assert.equal(h.state.result.lanes.B.cache_fallback_used, true);

  // Switching fb-model back to tiered-cached restores $0.02830000
  h.node("fb-model").value = "openrouter:vendor/tiered-cached";
  h.get("handleControlEdit({ target: $('fb-model'), type: 'change' })");
  h.tick();
  assert.equal(formatHalfUp(toRat(h.state.result.totals.B.monthly_total), 8), "0.02830000");

  // Editing a projected flat workload-average input clears state.sessionProjection with a visible status notice
  h.node("f-rag-in").value = "4096";
  h.get("handleControlEdit({ target: $('f-rag-in'), type: 'input' })");
  h.tick();
  assert.equal(h.state.sessionProjection, null);
  assert.match(h.node("return-review").innerHTML, /Switched from stacked session projection/i);
});

test("v2 browser saves migrate legacy v1 scenarios read-only, leave v1 untouched for rollback, and prevent zombie resurrection on delete", () => {
  // Peer Case 10: Legacy save in factor-io.sizer-saves.v1 + new fp4/sp/tp/kh save in factor-io.sizer-saves.v2
  const legacyFrag = encodeSizerFragment(normalizeSizerInput({ workloadId: "thai_knowledge_rag", users: 200 }));
  const legacyRawJson = encodeSizerSaveEnvelope([
    { id: "v1-leg", name: "Legacy V1 Scenario", savedAt: "2026-11-16T08:00:00Z", fragment: legacyFrag },
  ], { exportedAt: "2026-11-16T08:00:00Z" });

  const storeMap = new Map([[SIZER_LEGACY_STORAGE_KEY, legacyRawJson]]);
  const mockStore = {
    getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
    setItem: (k, v) => storeMap.set(k, v),
    removeItem: (k) => storeMap.delete(k),
  };
  const adapter = createSizerStorageAdapter(() => mockStore);

  // Initial read migrates v1 in memory without mutating v1 key
  const read1 = adapter.readSavedScenarios();
  assert.equal(read1.ok, true);
  assert.deepEqual(read1.scenarios.map((s) => s.id), ["v1-leg"]);
  assert.equal(storeMap.has(SIZER_STORAGE_KEY), false);

  // Saving a new fp4 + stacked 20k session writes ONLY to factor-io.sizer-saves.v2
  const v2Frag = encodeSizerFragment(normalizeSizerInput({
    workloadId: "airgap_sec_audit",
    rawSystemPromptTokens: 24000,
    turnsPerSession: 4,
    kvCacheHitRate: "0.80",
    kvquant: "fp4",
    modelId: "flint",
  }));
  const saveRes = adapter.saveScenario({
    id: "v2-flint-fp4",
    name: "Flint FP4 Stacked",
    savedAt: "2026-11-18T04:00:00Z",
    fragment: v2Frag,
  });
  assert.equal(saveRes.ok, true);
  assert.deepEqual(saveRes.scenarios.map((s) => s.id), ["v2-flint-fp4", "v1-leg"]);

  // Rollback guarantee: factor-io.sizer-saves.v1 is byte-for-byte identical to before v2 ran!
  assert.equal(storeMap.get(SIZER_LEGACY_STORAGE_KEY), legacyRawJson);
  const rolledBackV1 = decodeSizerSaveEnvelope(storeMap.get(SIZER_LEGACY_STORAGE_KEY));
  assert.deepEqual(rolledBackV1.scenarios.map((s) => s.id), ["v1-leg"]);

  // Deleting v1-leg from v2 persists an explicit v2 envelope (even when empty) so v1-leg never resurrects on reload
  assert.equal(adapter.deleteScenario("v2-flint-fp4").ok, true);
  const delLegacy = adapter.deleteScenario("v1-leg");
  assert.equal(delLegacy.ok, true);
  assert.equal(delLegacy.scenarios.length, 0);
  assert.equal(adapter.readSavedScenarios().scenarios.length, 0);
  // And v1 is STILL untouched for rollback!
  assert.equal(storeMap.get(SIZER_LEGACY_STORAGE_KEY), legacyRawJson);
});

test("calculator receiver clears stale sessionProjection on preset click, refuses smaller-context model switch against 81k stacked peak, and matches unshared peak batch sizing", () => {
  const h = harness();
  Object.assign(h.context, demandMod, servingMod, capexMod, subscriptionMod, powerMod, calculatorMod);
  h.state.ready = true;
  h.state.servingData = JSON.parse(readFileSync(new URL("../data/serving-models.json", import.meta.url), "utf8"));
  h.state.powerSeed = JSON.parse(readFileSync(new URL("../data/power-seed.json", import.meta.url), "utf8"));
  powerMod.configurePowerSeed(h.state.powerSeed);
  h.state.fx = normalizeFxDocument({ source_id: "fixture-fx", observed_at: "2026-09-01", usd_thb: "33.801000" });
  h.state.gpuPricing = {
    gpus: {
      h100: { label: "NVIDIA H100 80GB", vram_gb: 80 },
      rtx_pro_6000_se: { label: "RTX PRO 6000 SE 96GB", vram_gb: 96 },
    },
    rows: [{ provider: "first", provider_label: "First Cloud", gpu_id: "h100", gpu_label: "H100", sku: "h100-1x", gpu_hourly_usd: "2.50", confidence: "first_party" }],
  };
  h.state.serverPricing = {
    rows: [{ server_id: "srv-rtx-2x", label: "2x RTX Server", gpu_id: "rtx_pro_6000_se", gpu_count: 2, form_factor: "2U", usd_typical: "53333" }],
  };
  h.state.subscriptions = { rows: [{ id: "none", label: "None", applies_to: [] }] };
  h.state.workloadPresets = JSON.parse(readFileSync(new URL("../data/workload-presets.json", import.meta.url), "utf8"));
  h.node("preset-cards").querySelectorAll = () => [];
  h.state.manifest = {
    snapshot_digest: "snap-g3",
    generated_at: "2026-11-18T00:00:00Z",
    sources: { openrouter: { origin: "snapshot", observed_at: "2026-11-18T00:00:00Z", integrity: "declared" } },
    models: [{ id: "openrouter:vendor/flat", name: "Flat 1USD", state: "active" }],
  };
  h.state.catalog = {
    offers: {
      "openrouter:vendor/flat": {
        offer_id: "openrouter:vendor/flat",
        seller: "openrouter",
        seller_source: "openrouter",
        channel: "api",
        product: "vendor/flat",
        display_name: "Flat 1USD",
        tariff: "token",
        ingest_mode: "chat",
        state: "active",
        quarantine_reason: null,
        missing_streak: 0,
        expiration_date: null,
        prices: { "input|std": "0.000001", "output|std": "0.000001", "cache_read|std": "0.0000002" },
        overrides: [],
        multipliers: {},
        tiered: [],
        ignored_fields: [],
        unknown_meter_fields: [],
        provenance: { source: "openrouter", logs: [] },
      },
    },
  };
  h.node("fb-feed").value = "openrouter";
  h.node("fb-model").value = "openrouter:vendor/flat";
  h.node("fb-model").options = [{ value: "openrouter:vendor/flat", textContent: "Flat 1USD" }];
  h.node("f-sh-gpu").options = [
    { value: "h100", textContent: "H100" },
    { value: "rtx_pro_6000_se", textContent: "RTX PRO 6000" },
  ];
  h.node("f-sv-model").options = h.state.servingData.models.map((m) => ({ value: m.id, textContent: m.label }));
  h.node("f-sv-kvquant").options = ["bf16", "fp8", "int8", "fp4"].map((v) => ({ value: v, textContent: v }));

  // 81,000-token stacked peak (S=61,000, U=4,000, O=1,000, T=4 -> 61,000 + 4 * 5,000 = 81,000) on Flint (262k max)
  const sizer81k = computeSizer({
    input: {
      users: 10,
      sessionsPerUserDay: "1",
      workingDaysMo: 20,
      tokenBasis: "thai_tokenized_1x",
      rawSystemPromptTokens: 61000,
      rawPromptTokens: 4000,
      rawOutputTokens: 1000,
      turnsPerSession: 4,
      kvCacheHitRate: "0.50",
      rawContextTokens: 81920,
      modelId: "flint",
      wquant: "fp8",
      kvquant: "fp4",
      gpuId: "rtx_pro_6000_se",
      apiOfferId: "openrouter:vendor/flat",
      quoteUtc: "2026-09-01T00:00:00Z",
    },
    data: {
      manifest: h.state.manifest,
      catalog: h.state.catalog,
      fx: h.state.fx,
      gpuPricing: h.state.gpuPricing,
      serverPricing: h.state.serverPricing,
      servingData: h.state.servingData,
      powerSeed: h.state.powerSeed,
      subscriptions: h.state.subscriptions,
    },
    nowMs: Date.parse("2026-09-01T00:00:00Z"),
  });
  assert.equal(sizer81k.ok, true);
  assert.equal(sizer81k.sessionProjection.peakTurnContextTokens, 81000);
  assert.equal(sizer81k.sessionProjection.sharedPrefixTokens, 0);

  const frag81k = encodeSizerFragment(sizer81k.normalized, {
    pricingIdentity: sizer81k.pricingIdentity,
    resolvedApiOfferId: "openrouter:vendor/flat",
  });
  h.context.location.href = `https://studio.factor-io.com/tco-calculator.html#${frag81k}`;
  assert.equal(h.get("processSizerReturn()"), true);
  assert.equal(h.state.sessionProjection.peakTurnContextTokens, 81000);
  assert.equal(h.state.serving.kv_gb_shared_prefix.text, "0.000");

  // Switching f-sv-model to qwen3-32b (context_max 40,960, default 32,768) MUST refuse because carried 81,000 peak > 40,960
  h.node("f-sv-model").value = "qwen3-32b";
  h.get("handleControlEdit({ target: $('f-sv-model'), type: 'change' })");
  h.tick();
  assert.equal(h.state.serving, null);
  assert.equal(h.state.servingRefusal?.code, "context_exceeds_model_max");

  // Clicking a workload preset card clears state.sessionProjection so preset demand/serving shapes take effect cleanly
  const firstPresetId = h.state.workloadPresets.presets[0].id;
  h.context.presetToClick = firstPresetId;
  h.get("applyWorkloadPreset(presetToClick)");
  h.tick();
  assert.equal(h.state.sessionProjection, null);
  assert.match(h.node("return-review").innerHTML, /Switched from stacked session projection/i);
});

test("sizer-ui renders distinct active vs peak KV context in EN/TH (including fit refusal) and fails closed on pre-FP4 catalog skew without touching v1 saves", () => {
  const uiSrc = readFileSync(new URL("../sizer-ui.js", import.meta.url), "utf8");
  const baseFullData = {
    manifest: JSON.parse(readFileSync(new URL("../data/manifest.json", import.meta.url), "utf8")),
    fx: normalizeFxDocument({ observed_at: "2026-09-01", usd_thb: "33.801", source_id: "fixture" }),
    gpuPricing: JSON.parse(readFileSync(new URL("../data/gpu-pricing.json", import.meta.url), "utf8")),
    serverPricing: JSON.parse(readFileSync(new URL("../data/server-pricing.json", import.meta.url), "utf8")),
    servingData: JSON.parse(readFileSync(new URL("../data/serving-models.json", import.meta.url), "utf8")),
    powerSeed: JSON.parse(readFileSync(new URL("../data/power-seed.json", import.meta.url), "utf8")),
    subscriptions: JSON.parse(readFileSync(new URL("../data/subscription-pricing.json", import.meta.url), "utf8")),
  };
  baseFullData.catalog = JSON.parse(
    readFileSync(new URL(`../data/${baseFullData.manifest.resources.catalog.path}`, import.meta.url), "utf8"),
  );

  const makeSizerUiVm = (customData, storeMap = new Map()) => {
    const nodes = new Map();
    const node = (id) => {
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          value: "",
          innerHTML: "",
          textContent: "",
          attrs: {},
          hidden: false,
          disabled: false,
          setAttribute(k, v) { this.attrs[k] = String(v); },
          removeAttribute(k) { delete this.attrs[k]; },
        });
      }
      return nodes.get(id);
    };
    const mockLocalStorage = {
      getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
      setItem: (k, v) => storeMap.set(k, String(v)),
      removeItem: (k) => storeMap.delete(k),
    };
    const ctx = vm.createContext({
      DEAL_TIERS, PIPELINE_CONNECTORS, LOCAL_AI_WORKLOADS,
      decodePresetFragment, decodeSizerFragment, decodeSizerSaveEnvelope, encodeSizerFragment,
      normalizeSizerInput, buildSessionProjectionFromConfig, resolveSizerModel, estimateModelWeightGb,
      groupCatalogModels, projectSizerControls, buildPricingIdentity, computeSizer, encodeSizerSaveEnvelope,
      SizerValidationError,
      ...servingMod,
      ...capexMod,
      Dec, Rat, formatHalfUp, ratStr, toRat,
      fxProvenance, normalizeFxDocument, toTHB, toUSD,
      replaceCatalogSource,
      localStorage: mockLocalStorage,
      TextEncoder, TextDecoder, AbortController, DOMException, structuredClone, setTimeout, clearTimeout, URL, console,
      document: { getElementById: (id) => (id === "main-workspace" ? null : node(id)) },
    });
    vm.runInContext(uiSrc.replace(/^import[\s\S]*?;\s*$/gm, "").replace(/^export\s+/gm, ""), ctx);
    const get = (code) => vm.runInContext(code, ctx);
    const st = get("appState");
    st.data = customData;
    st.ready = true;
    return { node, get, state: st, context: ctx };
  };

  // G5: S=20,000, U=1,000, O=500, T=2, rawContextTokens=23,000 -> activeCtx=22,250 vs peakCtx=23,000 in both solved and fit-refusal states (EN & TH)
  for (const lang of ["en", "th"]) {
    const ui = makeSizerUiVm(structuredClone(baseFullData));
    ui.state.lang = lang;
    Object.assign(ui.state.draft, {
      tokenBasis: "thai_tokenized_1x",
      rawSystemPromptTokens: "20000",
      rawPromptTokens: "1000",
      rawOutputTokens: "500",
      turnsPerSession: "2",
      kvHitPct: "50",
      rawContextTokens: "23000",
      modelId: "qwen3-32b",
      wquant: "fp8",
      kvquant: "bf16",
      gpuId: "h100",
    });
    ui.get("recompute()");
    ui.get("renderAutoGpuAndMatrix()");
    assert.match(ui.node("hint-turns-session").textContent, /23,000 tok/);
    assert.doesNotMatch(ui.node("hint-turns-session").textContent, /NaN|undefined/);
    const solvedKvHtml = ui.node("kv-telemetry-bar").innerHTML;
    assert.match(solvedKvHtml, /@ 22,250 ctx/);
    const solvedPeak = solvedKvHtml.match(/Peak ([0-9.]+) GB/)?.[1];
    const solvedActive = solvedKvHtml.match(/Active ([0-9.]+) GB @ 22,250 ctx/)?.[1];
    assert.ok(solvedPeak && solvedActive && Number(solvedActive) < Number(solvedPeak), `expected Active (${solvedActive}) < Peak (${solvedPeak}) in solved ${lang}`);

    // Fit-refusal state (glm-5-3 753B exceeds single-node VRAM so fit.serving === null) still distinguishes Active @ 22,250 ctx from Peak @ 23,000 ctx
    ui.state.draft.modelId = "qwen3-8b";
    ui.state.data.gpuPricing.gpus.h100.vram_gb = 4; // force VRAM refusal on qwen3-8b
    ui.get("recompute()");
    assert.equal(ui.state.computed.fit.serving, null);
    ui.get("renderAutoGpuAndMatrix()");
    const refusedKvHtml = ui.node("kv-telemetry-bar").innerHTML;
    assert.match(refusedKvHtml, /@ 22,250 ctx/);
    const refPeak = refusedKvHtml.match(/Peak ([0-9.]+) GB/)?.[1];
    const refActive = refusedKvHtml.match(/Active ([0-9.]+) GB @ 22,250 ctx/)?.[1];
    assert.ok(refPeak && refActive && Number(refActive) < Number(refPeak), `expected Active (${refActive}) < Peak (${refPeak}) on refusal in ${lang}`);
  }

  // G6: Boot against pre-FP4 serving-models.json + load a saved v2 fp4 scenario -> marks fp4 unavailable, refuses KV telemetry cleanly, keeps v1 untouched
  const preFp4Data = structuredClone(baseFullData);
  delete preFp4Data.servingData.kv_quantization.fp4;
  const legacyV1Raw = encodeSizerSaveEnvelope([
    { id: "v1-keep", name: "V1 Keep", savedAt: "2026-11-15T00:00:00Z", fragment: encodeSizerFragment(normalizeSizerInput({ users: 40 })) },
  ]);
  const v2Fp4Raw = encodeSizerSaveEnvelope([
    { id: "v2-fp4", name: "V2 FP4", savedAt: "2026-11-18T00:00:00Z", fragment: encodeSizerFragment(normalizeSizerInput({ modelId: "flint", kvquant: "fp4" })) },
  ]);
  const skewStore = new Map([
    [SIZER_LEGACY_STORAGE_KEY, legacyV1Raw],
    [SIZER_STORAGE_KEY, v2Fp4Raw],
  ]);
  const skewUi = makeSizerUiVm(preFp4Data, skewStore);
  skewUi.state.lang = "en";
  const loadedScenarios = skewUi.get("storageAdapter.readSavedScenarios()");
  skewUi.context.savedNorm = loadedScenarios.scenarios[0].normalized;
  skewUi.get("applyNormalizedToDraft(savedNorm)");
  skewUi.get("recompute()");
  skewUi.get("renderModelAndGpuSelectors()");
  skewUi.get("renderAutoGpuAndMatrix()");

  assert.equal(skewUi.state.computed.ok, false);
  assert.equal(skewUi.state.computed.code, "missing_accelerator_or_quant");
  assert.match(skewUi.node("in-kvquant").innerHTML, /fp4 \(unavailable in catalog - reselect\)/);
  assert.equal(skewUi.node("kv-telemetry-bar").attrs["data-status"], "refused");
  assert.match(skewUi.node("kv-telemetry-bar").innerHTML, /unavailable in the loaded catalog/i);
  assert.doesNotMatch(skewUi.node("kv-telemetry-bar").innerHTML, /@ FP4/);
  assert.equal(skewStore.get(SIZER_LEGACY_STORAGE_KEY), legacyV1Raw);
});
