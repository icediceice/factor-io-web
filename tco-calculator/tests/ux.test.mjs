import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
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

test("main composer sends the customer's exact question as a general conversation", () => {
  const h = harness();
  h.get("setupPlanner")();
  h.context.sent = null;
  h.get("sendChatMessage = (text, options) => { sent = { text, options }; }");
  h.node("ai-message").value = "Why is renting cheaper for this scenario?";
  h.node("ai-composer").requestSubmit();
  assert.equal(h.context.sent.text, "Why is renting cheaper for this scenario?");
  assert.notEqual(h.context.sent.options?.intent, "assist");
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

test("changed UI modules use matching versioned URLs across HTML and module import", () => {
  const version = html.match(/app\.js\?v=([^\"]+)/)?.[1];
  assert.ok(version);
  // Unchanged field/planner modules keep their existing cache identity.
  assert.match(app, /\.\/fields\.js\?v=/);
  assert.match(app, /\.\/planner\.js\?v=/);
  assert.ok(app.includes(`./chat.js?v=${version}`));
});

test("authored horizons default to 60 months in HTML and every workload preset", () => {
  const presets = JSON.parse(readFileSync(new URL("../data/workload-presets.json", import.meta.url), "utf8"));
  assert.match(html, /id="f-horizon"[^>]*value="60"/);
  assert.equal(presets.defaults.horizon_months, "60");
  assert.ok(presets.presets.length > 0);
  assert.ok(presets.presets.every((preset) => preset.fields["f-horizon"] === "60"));
});

test("deterministic engine modules cannot import the THB presentation boundary", () => {
  for (const name of ENGINE_MODULES) {
    const source = readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /(?:from\s+|import\s*\()["']\.\/currency\.js(?:\?[^"']*)?["']/, name);
  }
});

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

test("field harvesting and close use a shared range-blind control selector", () => {
  assert.match(fields, /const CONTROL = "input:not\(\[type=range\]\), select"/);
  assert.doesNotMatch(fields, /querySelector(?:All)?\("input, select"\)/);
  assert.match(fields, /f\.dataset\.inline/);
  assert.match(fields, /releaseFields/);
  // Which sections arrive open is declared in the markup, not by matching
  // heading strings in here. The old title allow-list meant renaming a heading
  // silently folded every section, with nothing to catch it — and the v0.8 rail
  // renamed all six. (This replaces an h2.cloneNode assertion that guarded the
  // stripping of live spans out of a title that is no longer read at all.)
  assert.doesNotMatch(fields, /OPEN_SECTIONS/);
  assert.match(fields, /"open" in sec\.dataset/);
  const railSections = html.slice(html.indexOf('<aside class="rail">'), html.indexOf("</aside>"));
  assert.equal((railSections.match(/<div\b[^>]*class="sec"[^>]*data-open[^>]*>/g) ?? []).length, 3);
  // One disclosure layer in the rail. A details.adv nested inside a section
  // that itself folds is what buried routing policy two levels deep.
  assert.doesNotMatch(railSections, /<summary>Service level|<summary>Architecture detail/);
});

test("the guided interview renders without contacting MiniMax, and an assist turn refuses a non-assist tool", async () => {
  const h = harness();
  h.get("setupPlanner()");
  assert.equal(h.fetchCalls.length, 0, "rendering the interview must not contact the model");
  assert.match(h.node("ai-interview").innerHTML, /What should AI help people do\?/);
  assert.match(h.node("ai-interview").innerHTML, /Question 1 of 8/);
  assert.match(h.node("ai-answers").innerHTML, /No answers yet/);
  assert.equal(h.node("ai-progress").textContent, "0 OF 8");

  h.state.ready = true;
  h.node("ai-message").value = "most of our documents are HR records";
  h.get("requestQuestionHelp()");
  // The question the visitor is on is what gets asked about — nothing else.
  assert.equal(h.get("plannerState.helpQuestionId"), "use_case");
  assert.match(h.get("chatState.offlineArtifact.copyText"), /What should AI help people do/);
  assert.equal(h.node("ai-message").value, "most of our documents are HR records", "Not sure does not erase an unrelated draft");
  assert.equal(h.node("ai-copy-request").disabled, false);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.fetchCalls.length, 1, "asking for help sends exactly one request");
  const [, init] = h.fetchCalls[0];
  // The page holds no credential, so it has none to send.
  assert.equal(Object.keys(init.headers).some((k) => k.toLowerCase() === "authorization"), false);
  assert.doesNotMatch(h.get("chatState.offlineArtifact.copyText"), /Bearer\s+\S/);
  // The fixture answers with ask_user, which an assist turn does not allow.
  assert.equal(h.get("plannerState.help"), null);
  assert.match(h.node("ai-model-status").textContent, /incompatible suggestion/);
  assert.equal(h.get("chatState.history.snapshot().length"), 0, "a refused tool call is never kept as history");
});

test("an answer reaches the calculator only through Apply, and MiniMax advice never selects one", () => {
  const h = harness();
  h.get("setupPlanner()");
  h.state.workloadPresets = {
    defaults: { shapes: {} },
    presets: [{ id: "internal_kb", label: "Knowledge", assumption_label: "assumed", assumption_note: "test", fields: { "f-users": "500", "f-horizon": "36" } }],
  };
  // fr-policy is an enum contract, so the real page's option list is the fixture.
  h.node("fr-policy").tagName = "SELECT";
  h.node("fr-policy").options = [{ value: "local_first" }, { value: "api_first" }, { value: "fixed_split" }];
  h.context.recomputes = 0;
  h.get("onLiveInput = () => { recomputes++; }");

  // Answering every question changes no control.
  h.get("plannerState.answers = { use_case:'knowledge', scale:'company', intensity:'routine', substrate:'nutanix', data_boundary:'internal', interaction:'assistant', overflow:'local_only', horizon:'y5' }");
  h.get("renderInterview()");
  assert.equal(h.node("f-users").value, "", "answers must not write a control before Apply");
  assert.match(h.node("ai-answers").innerHTML, /The whole company/);
  assert.equal(h.node("ai-progress").textContent, "8 OF 8");
  assert.equal(h.node("ai-apply-guided").disabled, true, "Apply stays locked until the calculator data is ready");

  // Advice marks an option and nothing more.
  h.state.ready = true;
  h.get("plannerState.help = { question_id:'substrate', recommended_option:'kubernetes', answer:'Either works.', why:'You already run clusters.', caveats:[] }");
  h.get("plannerState.questionIndex = 3");
  h.get("renderInterview()");
  assert.match(h.node("ai-interview").innerHTML, /Suggested by the assistant/);
  assert.match(h.node("ai-interview").innerHTML, /is-recommended/);
  assert.equal(h.get("plannerState.answers.substrate"), "nutanix", "advice must never change the answer");
  assert.equal(h.node("ai-apply-guided").disabled, false);

  // Apply is the only path into the controls.
  h.get("applyGuidedAnswers()");
  assert.equal(h.node("f-users").value, "1000", "the answer overrides the preset it sits on");
  assert.equal(h.node("f-sessions-day").value, "6");
  assert.equal(h.node("f-horizon").value, "60");
  assert.equal(h.node("fr-policy").value, "local_first");
  assert.equal(h.node("fr-failshare").value, "0");
  assert.equal(h.get("plannerState.applied"), true);
  assert.equal(h.context.recomputes, 1, "Apply recomputes exactly once");
});

test("a typed answer is bounds-checked against the real control contract before Apply", () => {
  const h = harness();
  h.get("setupPlanner()");
  h.state.ready = true;
  h.state.workloadPresets = { defaults: { shapes: {} }, presets: [{ id: "internal_kb", label: "K", assumption_label: "assumed", assumption_note: "t", fields: {} }] };
  h.node("fr-policy").tagName = "SELECT";
  h.node("fr-policy").options = [{ value: "local_first" }];
  h.get("onLiveInput = () => {}");
  h.get("plannerState.answers = { use_case:'knowledge', scale:{id:'custom',value:'99999999999'}, intensity:'routine', substrate:'nutanix', data_boundary:'internal', interaction:'assistant', overflow:'local_only', horizon:'y5' }");
  h.get("applyGuidedAnswers()");
  assert.equal(h.node("f-users").value, "", "an out-of-range headcount never reaches the control");
  assert.equal(h.get("plannerState.applied"), false);
  assert.match(h.node("ai-ready-note").textContent, /f-users/);
});

test("a single guided answer can be revised after Apply, and re-applying stays on the validated path", () => {
  const h = harness();
  h.get("setupPlanner()");
  h.state.ready = true;
  h.state.workloadPresets = {
    defaults: { shapes: {} },
    presets: [{ id: "internal_kb", label: "Knowledge", assumption_label: "assumed", assumption_note: "test", fields: { "f-users": "500", "f-horizon": "36" } }],
  };
  h.node("fr-policy").tagName = "SELECT";
  h.node("fr-policy").options = [{ value: "local_first" }, { value: "api_first" }, { value: "fixed_split" }];
  h.context.recomputes = 0;
  h.get("onLiveInput = () => { recomputes++; }");
  const click = (id, selector) => h.node(id).events.click({ target: { closest: (s) => (s === selector ? {} : null) } });

  h.get("plannerState.answers = { use_case:'knowledge', scale:'company', intensity:'routine', substrate:'nutanix', data_boundary:'internal', interaction:'assistant', overflow:'local_only', horizon:'y5' }");
  h.get("applyGuidedAnswers()");
  assert.equal(h.node("f-users").value, "1000");
  assert.equal(h.node("ai-revision").hidden, true, "nothing has drifted the moment the answers were applied");
  assert.doesNotMatch(h.node("ai-answers").innerHTML, /data-changed/);

  // Revise ONE answer. The preview is inert: no control moves, nothing recomputes.
  h.get("plannerState.answers.scale = 'department'");
  h.get("renderInterview()");
  assert.equal(h.node("f-users").value, "1000", "a revised answer must not reach the control on its own");
  assert.equal(h.context.recomputes, 1, "previewing a revision recomputes nothing");
  assert.equal(h.node("ai-revision").hidden, false);
  assert.match(h.node("ai-revision").innerHTML, /You changed one answer after applying/);
  assert.match(h.node("ai-revision").innerHTML, /Nothing has changed yet/);
  assert.match(h.node("ai-revision").innerHTML, /<td>f-users<\/td><td>1000<\/td><td>200<\/td>/, "the preview names the control and both values");
  assert.match(h.node("ai-answers").innerHTML, /data-changed="true"/, "the edited answer chip is marked");

  // Re-apply is the SAME call the first Apply made, so it writes and recomputes once.
  click("ai-revision", "#ai-reapply");
  assert.equal(h.node("f-users").value, "200");
  assert.equal(h.context.recomputes, 2);
  assert.equal(h.node("ai-revision").hidden, true, "the drift is gone once it is applied");
  assert.match(h.node("ai-state").textContent, /^Re-applied/);

  // A revision is bounds-checked exactly as the first Apply was.
  h.get("plannerState.answers.scale = { id:'custom', value:'99999999999' }");
  h.get("renderInterview()");
  click("ai-revision", "#ai-reapply");
  assert.equal(h.node("f-users").value, "200", "a revision cannot write a value the control contract refuses");
  assert.equal(h.context.recomputes, 2, "a refused revision recomputes nothing");
  assert.match(h.node("ai-ready-note").textContent, /f-users/);

  // Undo restores the answers the calculator was actually built from.
  click("ai-revision", "#ai-revert-answer");
  assert.equal(h.get("plannerState.answers.scale"), "department");
  assert.equal(h.node("ai-revision").hidden, true);
  assert.equal(h.node("f-users").value, "200", "undo touches no control");
});

// Also found on the deployed page: the first real answer the model gave — a
// placement recommendation mentioning a node range — was discarded whole, and
// the visitor got the sanitizer's message instead. Re-asking the identical
// question with "do not write any digits" returned three paragraphs of ordinary
// prose, which isolates the guard as the cause. The price rule is untouched; the
// minus sign is the only thing that changed, because it is also how a range is
// written.
test("the claim guard rejects a price without rejecting the way a colleague writes", async () => {
  const h = harness();
  h.get("setupPlanner()");
  h.state.ready = true;
  // The thread renders only on the question it belongs to, so the visitor must
  // actually be standing on that question for a reply to appear.
  h.get("plannerState.helpQuestionId = 'substrate'");
  h.get(`plannerState.questionIndex = ${INTERVIEW_QUESTIONS.findIndex((q) => q.id === "substrate")}`);

  const prose = (text) => async () => ({
    user: { role: "user", content: "q" },
    assistantMessage: { role: "assistant", content: text, tool_calls: [] },
    toolCall: null,
    prose: (await import("../chat.js")).validateAssistantProse({ role: "assistant", content: text }, { optional: false }),
    model: "MiniMax-M3", usage: null,
  });

  // Still refused: a price in the model's own voice, and arithmetic that states a result.
  for (const claim of ["Running this yourself lands around ฿120000 a month.", "So 1200 + 300 = 1500 per month.", "That is 24000 - 3000 once the licence lapses."]) {
    h.context.requestChatTurn = prose(claim);
    await h.get("sendChatMessage('what does it cost?', {intent:'assist'})");
    assert.match(h.node("ai-transcript").innerHTML, /Unverified figure omitted/, claim);
    assert.doesNotMatch(h.node("ai-transcript").innerHTML, /120000|1200 \+ 300|24000 - 3000/);
  }

  // Allowed: ranges and dated snapshots, which assert no price at all.
  for (const ok of [
    "With a small platform team, 2-3 nodes is the usual shape.",
    "A 24-48 GB card covers this comfortably.",
    "The 2026-09 snapshot is what the ledger cites.",
  ]) {
    h.context.requestChatTurn = prose(ok);
    await h.get("sendChatMessage('how many nodes?', {intent:'assist'})");
    assert.match(h.node("ai-transcript").innerHTML, new RegExp(ok.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), ok);
  }
});

// Found on the deployed page, not by this suite: with a real ledger and a real
// blueprint loaded, the assembled prompt ran past chat.js's cap and requestChatTurn
// refused the whole turn — "system prompt is longer than 12000 characters", no
// request ever sent. The old code budgeted the JSON alone, checked once, and
// ignored ~1.5k of instructions sitting in front of it.
test("the system prompt is budgeted whole, so a heavy page state cannot kill the assist turn", () => {
  const h = harness();
  h.get("setupPlanner()");
  h.get("plannerState.helpQuestionId = 'substrate'");
  h.get("plannerState.blueprint = { text: 'x'.repeat(40000) }");
  h.get("state.manifest = { sources: { huge: 'y'.repeat(40000) } }");

  const prompt = h.get("chatSystemPrompt('assist')");
  assert.ok(
    prompt.length <= CHAT_LIMITS.maxSystemChars,
    `the prompt must fit the contract chat.js enforces, was ${prompt.length} of ${CHAT_LIMITS.maxSystemChars}`,
  );
  // Shrinking is only correct if it never sacrifices the thing the turn is about.
  assert.match(prompt, /explicit Not sure request/);
  assert.match(prompt, /current_scenario/);
  assert.match(prompt, /pending_or_invalid/);
  assert.match(prompt, /"id":"substrate"/, "the question being asked about is never what gets dropped");
  assert.match(prompt, /"request_mode":"assist"/);
  // And it must still fit the caller that actually enforces the cap.
  assert.doesNotThrow(() => buildOfflineRequest({
    model: "MiniMax-M3", endpoint: "https://ai.factor-io.com/v1", systemPrompt: prompt,
    userMessage: "which placement fits?", pageUrl: "https://studio.factor-io.com/tco-calculator.html", assist: true,
  }));

  // An ordinary page state keeps the full context — the shrink must not fire early.
  const light = harness();
  light.get("setupPlanner()");
  light.get("plannerState.helpQuestionId = 'substrate'");
  assert.match(light.get("chatSystemPrompt('assist')"), /"source_envelopes"/);
});

test("an assist turn is bound to the one question it was asked about", async () => {
  const h = harness();
  h.get("setupPlanner()");
  h.state.ready = true;
  h.get("plannerState.helpQuestionId = 'use_case'");

  // chatSystemPrompt already hands the model exactly one question; the assist
  // validation context must be scoped to the SAME one, or the binding is advice.
  assert.deepEqual(Object.keys(h.get("chatValidationContext({ assist: true })").questions), ["use_case"]);
  assert.equal(Object.keys(h.get("chatValidationContext()").questions).length, 8);

  const answerFor = (questionId, option) => (args) => realRequestChatTurn({
    ...args,
    timeoutMs: 1000,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({
      model: "MiniMax-M3",
      choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call-assist", type: "function", function: {
        name: "answer_question",
        arguments: JSON.stringify({
          question_id: questionId,
          recommended_option: option,
          answer: "Keep regulated records inside your own boundary.",
          why: "You said the documents are HR records.",
        }),
      } }] } }],
    }) }),
  });

  // A well-formed answer to a DIFFERENT question is refused: it never becomes
  // help, never reaches history, and never badges an option the visitor is not
  // even looking at.
  h.context.requestChatTurn = answerFor("data_boundary", "restricted");
  await h.get("sendChatMessage('I am not sure', {intent:'assist'})");
  assert.equal(h.get("plannerState.help"), null, "advice about another question is never retained");
  assert.match(h.node("ai-model-status").textContent, /data_boundary is not one of the guided planning questions/);
  assert.equal(h.get("chatState.history.snapshot().length"), 0);

  // The same answer, for the question actually asked, is accepted.
  h.get("plannerState.helpQuestionId = 'data_boundary'");
  h.get("plannerState.questionIndex = 4");
  await h.get("sendChatMessage('I am not sure', {intent:'assist'})");
  assert.equal(h.get("plannerState.help.question_id"), "data_boundary");
  assert.match(h.node("ai-interview").innerHTML, /Suggested by the assistant/);
  assert.equal(h.get("plannerState.answers.data_boundary"), undefined, "accepted advice still selects nothing");
});

test("an assist turn asks the model a question instead of filling in a form", async () => {
  const h = harness();
  h.get("setupPlanner()");
  h.state.ready = true;
  h.get("plannerState.helpQuestionId = 'use_case'; plannerState.questionIndex = 0;");

  let sent = null;
  h.context.requestChatTurn = (args) => realRequestChatTurn({
    ...args,
    timeoutMs: 1000,
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({
        model: "MiniMax-M3",
        choices: [{ message: { role: "assistant", content: "It depends on who reads the answers.\n\nIf that is your own staff, an internal assistant is the honest starting point." } }],
      }) };
    },
  });
  await h.get("sendChatMessage('who is this for?', {intent:'assist'})");

  // The mechanical cause of every reply reading the same: a forced tool call at
  // an extraction temperature. An assist turn must send neither.
  assert.equal(sent.tool_choice, "auto");
  assert.ok(sent.temperature > 0.2, "assist turns loosen wording");

  const thread = h.get("chatState.transcript");
  assert.equal(thread.length, 2);
  assert.equal(thread[1].role, "assistant");
  assert.match(h.node("ai-transcript").innerHTML, /who reads the answers/);
  // Prose alone badges nothing and selects nothing — the visitor still decides.
  assert.equal(h.get("plannerState.help"), null);
  assert.equal(h.get("plannerState.answers.use_case"), undefined);
  // It is still a real retained exchange; there is simply no tool result to keep.
  assert.equal(h.get("chatState.history.snapshot().length"), 1);
  assert.equal(h.get("chatState.history.snapshot()[0].tools.length"), 0);
});

test("free prose may not assert a price or smuggle markup onto the page", async () => {
  const h = harness();
  h.get("setupPlanner()");
  h.state.ready = true;
  h.get("plannerState.helpQuestionId = 'use_case'; plannerState.questionIndex = 0;");
  const prose = (content) => (args) => realRequestChatTurn({
    ...args,
    timeoutMs: 1000,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({
      model: "MiniMax-M3", choices: [{ message: { role: "assistant", content } }],
    }) }),
  });

  // Loosening the template must not loosen this. Only the deterministic ledger
  // states a number, so a price in the model's own voice is refused outright —
  // that guard is what makes free prose safe to render at all.
  h.context.requestChatTurn = prose("Running this yourself lands around ฿120000 a month.");
  await h.get("sendChatMessage('what does it cost?', {intent:'assist'})");
  assert.match(h.node("ai-transcript").innerHTML, /Unverified figure omitted/);
  assert.doesNotMatch(h.node("ai-transcript").innerHTML, /120000/);
  assert.equal(h.get("chatState.history.snapshot().length"), 1, "raw provider response is retained, not rendered");

  h.context.requestChatTurn = prose("Use an <img src=x onerror=alert(1)> internal assistant.");
  await h.get("sendChatMessage('which one?', {intent:'assist'})");
  assert.match(h.node("ai-model-status").textContent, /plain text, not HTML/);
  assert.doesNotMatch(h.node("ai-transcript").innerHTML, /onerror/);

  // Prose that is merely punctuated awkwardly is allowed through — and escaped.
  h.context.requestChatTurn = prose('Ask yourself: is it 5 > 3, or "internal" only?');
  await h.get("sendChatMessage('clarify', {intent:'assist'})");
  assert.match(h.node("ai-transcript").innerHTML, /5 &gt; 3/);
  assert.doesNotMatch(h.node("ai-transcript").innerHTML, /5 > 3/);
  assert.match(h.node("ai-transcript").innerHTML, /&quot;internal&quot;/);
});

test("general and guided turns share the visible conversation across topic changes", async () => {
  const h = harness();
  h.get("setupPlanner()");
  h.state.ready = true;
  const asked = [];
  h.context.requestChatTurn = (args) => {
    // Snapshotted AT DISPATCH, because this is what the model actually receives.
    // Scoping the VISIBLE thread to one question is not the same promise.
    asked.push({ ...args, sentHistory: args.history.snapshot() });
    return realRequestChatTurn({
      ...args,
      timeoutMs: 1000,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({
        model: "MiniMax-M3", choices: [{ message: { role: "assistant", content: "That depends on who is reading it." } }],
      }) }),
    });
  };

  h.node("ai-message").value = "who is this for?";
  await h.get("sendChatMessage()");
  const opened = h.get("chatState.transcript");
  assert.equal(opened.length, 2);
  assert.equal(opened[0].role, "user");
  assert.equal(asked[0].userMessage, "who is this for?");
  assert.equal(asked[0].assist, true);
  assert.deepEqual(asked[0].sentHistory, [], "an opening turn carries no prior exchange");

  h.get("goToQuestion(3)");
  await h.get("requestQuestionHelp()");
  assert.equal(h.get("chatState.transcript").filter((row) => row.role !== "status").length, 4);
  // A follow-up is sent as asked. Re-quoting the question every time is what
  // made the exchange read like repeated form submissions.
  assert.match(asked[1].userMessage, /I am not sure how to answer/);
  assert.deepEqual(Object.keys(asked[1].validationContext.questions), [h.get("plannerState.helpQuestionId")]);
  assert.equal(asked[1].sentHistory.length, 1, "a follow-up carries the exchange it is following up on");

  h.get("goToQuestion(4)");
  assert.match(h.node("ai-transcript").innerHTML, /who is this for/);
  h.node("ai-message").value = "what if half of them are contractors?";
  await h.get("sendChatMessage()");
  assert.equal(asked[2].userMessage, "what if half of them are contractors?");
  assert.equal(asked[2].sentHistory.length, 2);
  assert.equal(h.get("chatState.history.snapshot().length"), 3);
  assert.equal(h.get("chatState.transcript").filter((row) => row.role === "assistant").length, 3);
});

test("a general conversation answers without a forced tool call", async () => {
  const h = harness();
  h.get("setupPlanner()");
  h.state.ready = true;
  h.context.requestChatTurn = (args) => realRequestChatTurn({
    ...args,
    timeoutMs: 1000,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({
      model: "MiniMax-M3", choices: [{ message: { role: "assistant", content: "Sure, here is roughly what I would do." } }],
    }) }),
  });
  await h.get("sendChatMessage('help me plan')");
  assert.match(h.node("ai-transcript").innerHTML, /roughly what I would do/);
  assert.equal(h.get("chatState.history.snapshot().length"), 1);
});

test("the calculator UI offers LLM assistance without naming the vendor behind it", () => {
  // Two different obligations, deliberately kept apart. privacy.html and
  // llms.txt MUST name the downstream processor — that is a disclosure, and
  // removing it would be a false privacy statement. The product surface is
  // where the brand does not belong: a visitor is offered LLM assistance.
  const stripLineComments = (source) => source.replace(/^\s*\/\/.*$/gm, "");
  const visibleHtml = html.replace(/<!--[\s\S]*?-->/g, "");
  assert.doesNotMatch(visibleHtml, /MiniMax/i, "no visitor-visible markup names the vendor");
  // MINIMAX_DEFAULTS is the imported endpoint/model config, not copy.
  assert.doesNotMatch(stripLineComments(app).replace(/MINIMAX_DEFAULTS/g, ""), /MiniMax/i);
  const chatSource = readFileSync(new URL("../chat.js", import.meta.url), "utf8");
  assert.doesNotMatch(stripLineComments(chatSource), /MiniMax/i, "no error string shown to a visitor names the vendor");
  assert.match(visibleHtml, /AI assistant/);
  // The disclosure surfaces still name it, and must keep doing so.
  assert.match(privacy, /MiniMax/i);
  assert.match(llms, /MiniMax/i);
});

test("chat modes reject crossed tool responses and a specification cannot send before Apply", async () => {
  const h = harness();
  h.get("setupPlanner()");
  h.state.ready = true;
  h.node("ai-endpoint").value = MINIMAX_DEFAULTS.endpoint;
  h.node("ai-model").value = MINIMAX_DEFAULTS.model;
  await h.get("sendChatMessage('Explain the plan now', {intent:'spec'})");
  assert.equal(h.fetchCalls.length, 0, "post-Apply specification is locked until an exact applied result exists");

  h.context.requestChatTurn = async () => ({
    user: { role: "user", content: "Help me plan" },
    assistantMessage: { role: "assistant", tool_calls: [{ id: "call-x", type: "function", function: { name: "present_local_llm_spec", arguments: "{}" } }] },
    toolCall: { id: "call-x", name: "present_local_llm_spec", arguments: {} },
    model: "MiniMax-M3",
  });
  await h.get("sendChatMessage('Help me plan')");
  assert.equal(h.get("chatState.history.snapshot().length"), 0);
  assert.equal(h.get("plannerState.refinement"), null);
  assert.match(h.node("ai-transcript").innerHTML, /nothing was applied/);
});

test("validated proposal is previewed before Apply and reaches real controls with one recompute", () => {
  const h = harness();
  h.state.workloadPresets = {
    defaults: { shapes: {} }, provenance: {},
    presets: [{ id: "support_desk", label: "Support", assumption_label: "assumed", assumption_note: "test", fields: { "f-users": "500", "f-horizon": "60" } }],
  };
  h.state.servingData = { models: [{ id: "known-model", params_b: "8", active_params_b: "8", context_default: 8192, groups: [] }] };
  h.node("f-sv-model").tagName = "SELECT";
  h.node("f-sv-model").options = [{ value: "known-model", textContent: "Known model" }];
  h.node("f-users").value = "77";
  h.context.recomputes = 0;
  h.get("onLiveInput = () => { recomputes++; }");
  const proposal = {
    summary: "A reviewable local-first support starting point.",
    planning_profile: { use_case: "support", substrate: "nutanix", data_boundary: "internal", interaction: "assistant", overflow: "burst" },
    changes: [
      { field: "f-users", value: "2000", reason: "Matches the stated staff population." },
      { field: "f-horizon", value: "60", reason: "Uses the standard comparison horizon." },
      { field: "f-sv-model", value: "known-model", reason: "Evaluation candidate from the loaded catalog." },
    ],
    suggested_replies: [],
  };
  h.get("renderProposal")(proposal);
  assert.equal(h.node("f-users").value, "77", "preview must be inert");
  assert.equal(h.node("ai-proposal").hidden, false);
  assert.match(h.node("ai-proposal-rows").innerHTML, /2000/);
  h.get("applyPlannerAnswers()");
  assert.equal(h.node("f-users").value, "77", "Apply is locked before calculator readiness");
  assert.equal(h.context.recomputes, 0);

  h.state.ready = true;
  h.get("applyPlannerAnswers()");
  assert.equal(h.node("f-users").value, "2000");
  assert.equal(h.node("f-horizon").value, "60");
  assert.equal(h.node("f-sv-model").value, "known-model");
  assert.equal(h.node("fr-policy").value, "local_first");
  assert.equal(h.node("fr-failshare").value, "0.15");
  assert.equal(h.context.recomputes, 1);
  assert.equal(h.node("ai-proposal").hidden, true);
  assert.equal(h.get("plannerState.applied"), true);
});

test("manual calculator edits retain the structured specification and mark it stale", () => {
  const h = harness(); h.state.ready = true;
  h.get(`plannerState.plan = buildPlannerPlan({use_case:'support',substrate:'nutanix',data_boundary:'internal',interaction:'assistant',overflow:'local_only'});
    plannerState.applied = true;
    plannerState.refinement = {text:'retain this specification',model:'MiniMax-M3',stale:false};`);
  h.get("onLiveInput()");
  assert.equal(h.get("plannerState.refinement.text"), "retain this specification");
  assert.equal(h.get("plannerState.refinement.stale"), true);
  assert.equal(h.node("ai-refinement").hidden, false);
  assert.equal(h.node("ai-refinement").dataset.stale, "true");
  assert.equal(h.node("ai-copy-refinement").disabled, false);
  assert.match(h.node("ai-workspace-status").textContent, /stale/);
});

test("no credential field exists on the page and model prose stays out of cost collection", () => {
  const rail = html.slice(html.indexOf('<aside class="rail">'), html.indexOf("</aside>"));
  // The whole point of v0.7: there is nothing on the page to paste a key into.
  assert.doesNotMatch(rail, /id="ai-token"/);
  assert.doesNotMatch(html, /id="ai-token"|id="ai-endpoint"|type="password"/);
  assert.doesNotMatch(app, /ai-token|ai-endpoint/);
  // And no credential is baked into the shipped source either.
  assert.doesNotMatch(app, /Bearer\s+[A-Za-z0-9._-]{16,}/);
  assert.match(rail, /<details class="ai-assist screen-only">/);
  assert.match(html, /id="ai-refinement" class="ai-refinement screen-only"/);
  assert.match(html.slice(html.indexOf("@media print")), /\.screen-only \{ display:none !important; \}/);
  const h = harness();
  h.node("f-users").value = "500";
  h.context.document.querySelectorAll = () => [h.node("ai-message"), h.node("f-users")];
  assert.equal(h.get("enteredControls().map((el) => el.id).join(',')"), "f-users");
});

test("copy falls back when the async clipboard is unavailable", async () => {
  const h = harness();
  h.context.navigator.clipboard.writeText = async () => { throw new Error("denied"); };
  h.context.document.execCommand = (command) => command === "copy";
  await assert.doesNotReject(h.get("copyText('portable prompt')"));
});

test("the page states the Nutanix price boundary and the surfaces agree that Factor IO now proxies", () => {
  assert.match(app, /Nutanix Enterprise AI has no public list price|blueprint\.warnings/);
  assert.match(html, /Reset whole page/);
  assert.match(html, /id="ai-transcript"[^>]*role="log"[^>]*aria-live="polite"/);
  // No surface may still promise that Factor IO does not proxy: v0.7 reversed
  // that, and a stale claim here is a false privacy statement, not a typo.
  for (const surface of [privacy, llms]) {
    assert.doesNotMatch(surface, /never receives, stores or proxies|does not receive, store, or proxy the backup, AI request/i);
  }
  assert.match(privacy, /automatic public GET requests at startup/i);
  assert.match(privacy, /Factor IO now proxies calculator AI requests/i);
  assert.match(privacy, /ai\.factor-io\.com/);
  assert.match(privacy, /credential is held on a Factor IO server/i);
  assert.match(privacy, /Factor IO does not receive, store, or proxy the backup/i);
  assert.match(privacy, /credential-free version of it/i);
  assert.match(llms, /automatically GETs public OpenRouter pricing and Frankfurter FX/i);
  assert.match(llms, /Factor I O DOES proxy calculator AI requests/i);
  assert.match(llms, /no API-key field/i);

  // The whole document has to agree, not just the section that was updated. Any
  // surviving "we do not receive/proxy" claim must say it is about the BACKUP —
  // an unqualified one is now a false privacy statement, not a stale sentence.
  for (const [name, surface] of [["privacy.html", privacy], ["llms.txt", llms]]) {
    for (const [claim] of surface.matchAll(/[^.<>]*\b(?:does not|do not|never)\s+[^.<>]*\b(?:receive|receives|proxy|proxies)\b[^.<>]*/gi)) {
      assert.match(claim, /backup/i, `${name} still denies receiving something that is not the backup: "${claim.trim()}"`);
    }
  }
  assert.match(privacy, /pressing Ask in the calculator sends your message to a Factor IO server/i);
  assert.match(privacy, /single exception to the <em>transmit<\/em> half/i);
  assert.doesNotMatch(privacy, /Nothing is ever transmitted to us by any user of any age/i);
  assert.match(llms, /Factor I O DOES receive and proxy calculator AI requests/i);
  assert.doesNotMatch(llms, /directly to the endpoint they configured/i);
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
