import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { Dec, Rat, formatHalfUp, ratStr, toRat } from "../exact.js";
import { fxProvenance, normalizeFxDocument, toTHB, toUSD } from "../currency.js";
import {
  INTERVIEW_QUESTIONS,
  MINIMAX_DEFAULTS,
  buildBlueprint,
  buildPlannerPlan,
  buildPrompt,
  createRequestFence,
  isInterviewComplete,
} from "../planner.js";
import {
  buildOfflineRequest,
  createChatHistory,
  requestChatTurn as realRequestChatTurn,
  toolResultMessage,
  validateCalculatorProposal,
} from "../chat.js";

// Execute the real UI functions with a deliberately small DOM boundary and
// controlled timers/fetches. These are behavioral unit tests, not browser tests.
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../../tco-calculator.html", import.meta.url), "utf8");
const privacy = readFileSync(new URL("../../privacy.html", import.meta.url), "utf8");
const llms = readFileSync(new URL("../../llms.txt", import.meta.url), "utf8");
const fields = readFileSync(new URL("../fields.js", import.meta.url), "utf8");
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
    return { ok: true, status: 200, json: async () => ({ model: "stub", choices: [{ message: { content: "stub response" } }] }) };
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
    INTERVIEW_QUESTIONS, MINIMAX_DEFAULTS, buildBlueprint, buildPlannerPlan, buildPrompt,
    createRequestFence, isInterviewComplete,
    requestRefinement: (args) => realRequestRefinement({ ...args, fetchImpl: fetchSpy }),
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
  assert.ok(app.includes(`./fields.js?v=${version}`));
  assert.ok(app.includes(`./planner.js?v=${version}`));
});

test("authored horizons default to 60 months in HTML and every workload preset", () => {
  const presets = JSON.parse(readFileSync(new URL("../data/workload-presets.json", import.meta.url), "utf8"));
  assert.match(html, /id="f-horizon"[^>]*value="60"/);
  assert.equal(presets.defaults.horizon_months, "60");
  assert.ok(presets.presets.length > 0);
  assert.ok(presets.presets.every((preset) => preset.fields["f-horizon"] === "60"));
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
    utilization: "0.5",
  })));
  assert.equal(tree.monthly_total.presentation_exact, "330");
  assert.equal(tree.curve[0].A.presentation_exact, "660");
  assert.equal(tree.per_1m.value.presentation_exact, "66");
  assert.equal(tree.utilization, "0.5", "dimensionless fields must not be currency-converted");
});

test("deterministic component ledger covers cost components, formulas and source freshness", () => {
  const h = harness();
  h.state.manifest = { sources: { openrouter: { origin: "live", status: "fresh", observed_at: "2026-09-04T00:00:00Z", integrity: "transport-live", record_count: 100 } } };
  const totals = {
    A: { priced: true, infra_monthly: "10", subscription_monthly: "2", monthly_total: "12", one_time: "100", horizon_total: "820" },
    B: { priced: false, infra_monthly: null, subscription_monthly: null, monthly_total: null, one_time: "0", horizon_total: null },
    C: { priced: false, infra_monthly: null, subscription_monthly: null, monthly_total: null, one_time: "0", horizon_total: null },
  };
  const ledger = JSON.parse(JSON.stringify(h.get("buildComponentLedger")({ totals, routing_result: { recommended_monthly_total: "12" }, overlay: null })));
  assert.equal(ledger.schema, "factor-io.tco-component-ledger/1.0.0");
  assert.equal(ledger.recurring.self_hosted.horizon_total.presentation_exact, "27060");
  assert.equal(ledger.routing.recommended_monthly_total.presentation_exact, "396");
  assert.equal(ledger.freshness.sources.openrouter.origin, "live");
  assert.ok(ledger.formulas.some((formula) => formula.includes("Horizon total")));
  for (const key of ["demand", "sizing", "recurring", "capex", "power", "subscription", "routing", "exclusions", "freshness", "formulas"]) assert.ok(key in ledger, key);
});

test("field harvesting and close use a shared range-blind control selector", () => {
  assert.match(fields, /const CONTROL = "input:not\(\[type=range\]\), select"/);
  assert.doesNotMatch(fields, /querySelector(?:All)?\("input, select"\)/);
  assert.match(fields, /f\.dataset\.inline/);
  assert.match(fields, /h2\.cloneNode\(true\)/);
  assert.match(fields, /releaseFields/);
});

test("the AI interview cannot mutate calculator fields before readiness and Apply is total", () => {
  const h = harness();
  h.state.workloadPresets = {
    defaults: { shapes: {} },
    provenance: {},
    presets: [
      { id: "support_desk", label: "Support", assumption_label: "assumed", assumption_note: "test", fields: { "f-users": "500" } },
      { id: "agent_platform", label: "Agents", assumption_label: "assumed", assumption_note: "test", fields: { "f-users": "200" } },
    ],
  };
  h.node("f-users").value = "77";
  h.context.recomputes = 0;
  h.get(`onLiveInput = () => { recomputes++; };
    plannerState.answers = {use_case:'support',substrate:'nutanix',data_boundary:'internal',interaction:'assistant',overflow:'burst'};`);
  h.get("applyPlannerAnswers()");
  assert.equal(h.node("f-users").value, "77");
  assert.equal(h.context.recomputes, 0);

  h.state.ready = true;
  h.get("applyPlannerAnswers()");
  assert.equal(h.node("f-users").value, "500");
  assert.equal(h.node("fr-policy").value, "local_first");
  assert.equal(h.node("fr-blend").value, "100");
  assert.equal(h.node("fr-failshare").value, "0.15");
  assert.equal(h.node("fr-failrate").value, "2");
  assert.equal(h.context.recomputes, 1);

  h.get("plannerState.answers = {...plannerState.answers,use_case:'automation',overflow:'local_only'}; applyPlannerAnswers()");
  assert.equal(h.node("f-users").value, "200");
  assert.equal(h.node("fr-policy").value, "local_first");
  assert.equal(h.node("fr-blend").value, "100");
  assert.equal(h.node("fr-failshare").value, "0");
  assert.equal(h.node("fr-failrate").value, "2");
  assert.equal(h.context.recomputes, 2);
});

test("planner setup makes no request; Generate is the only fetch trigger", async () => {
  const h = harness();
  h.get("setupPlanner()");
  assert.equal(h.fetchCalls.length, 0);
  h.state.ready = true;
  h.node("ai-endpoint").value = MINIMAX_DEFAULTS.endpoint;
  h.node("ai-model").value = MINIMAX_DEFAULTS.model;
  h.node("ai-token").value = "memory-only";
  h.get("plannerState.prompt = 'safe prompt'; plannerState.blueprint = {text:'local blueprint'}");
  await h.get("generatePlannerRefinement()");
  assert.equal(h.fetchCalls.length, 1);
  assert.equal(h.node("ai-refinement-text").textContent, "stub response");
  assert.equal(h.node("ai-refinement").hidden, false);
  assert.equal(h.get("plannerState.refinement.text"), "stub response");
  assert.equal(h.node("ai-copy-refinement").disabled, false);
});

test("calculator recompute retains a prior model refinement and marks it stale", () => {
  const h = harness(); h.state.ready = true;
  h.get(`plannerState.plan = buildPlannerPlan({use_case:'support',substrate:'nutanix',data_boundary:'internal',interaction:'assistant',overflow:'local_only'});
    plannerState.applied = true; plannerState.modelAttempted = true;
    plannerState.refinement = {text:'retain this specification',model:'MiniMax-M3',truncated:false,stale:false};`);
  h.node("ai-refinement-text").textContent = "retain this specification";
  h.get("invalidateResults('Updating comparison…'); renderPlannerBlueprint()");
  assert.equal(h.node("ai-refinement-text").textContent, "retain this specification");
  assert.equal(h.node("ai-refinement").hidden, false);
  assert.equal(h.node("ai-refinement").dataset.stale, "true");
  assert.equal(h.node("ai-copy-refinement").disabled, false);
  assert.match(h.node("ai-model-status").textContent, /previous scenario/);
  assert.doesNotMatch(h.node("ai-model-status").textContent, /No model request has been made/);
});

test("user-driven interview rerenders move focus to the next action", () => {
  const h = harness(); h.state.ready = true;
  h.get("setupPlanner()");
  assert.notEqual(h.node("ai-options-first-option").focused, true, "initial render must not steal focus");
  h.get("choosePlannerAnswer('support')");
  assert.equal(h.node("ai-options-first-option").focused, true);

  h.node("ai-options-first-option").focused = false;
  h.get(`plannerState.answers = {use_case:'support',substrate:'nutanix',data_boundary:'internal',interaction:'assistant'};
    plannerState.questionIndex = 4; choosePlannerAnswer('local_only')`);
  assert.equal(h.node("ai-apply").focused, true);

  h.node("ai-options-first-option").focused = false;
  h.node("ai-back").events.click();
  assert.equal(h.node("ai-options-first-option").focused, true);

  h.node("ai-options-first-option").focused = false;
  h.node("ai-summary").events.click({ target: { closest: () => ({ dataset: { aiEdit: "2" } }) } });
  assert.equal(h.node("ai-options-first-option").focused, true);
});

test("an older model completion cannot overwrite newer untrusted text", async () => {
  const h = harness();
  const pending = [];
  h.context.requestRefinement = () => new Promise((resolve) => pending.push(resolve));
  h.state.ready = true;
  h.node("ai-endpoint").value = MINIMAX_DEFAULTS.endpoint;
  h.node("ai-model").value = MINIMAX_DEFAULTS.model;
  h.get("plannerState.prompt = 'prompt'; plannerState.blueprint = {text:'blueprint'}");
  const older = h.get("generatePlannerRefinement()");
  const newer = h.get("generatePlannerRefinement()");
  pending[1]({ text: "<script>alert(1)</script> $12,400 invented", model: "newer", truncated: false });
  await newer;
  pending[0]({ text: "stale response", model: "older", truncated: false });
  await older;
  assert.equal(h.node("ai-refinement-text").textContent, "<script>alert(1)</script> $12,400 invented");
  assert.equal(h.node("ai-refinement-text").innerHTML, "", "model output is assigned as text, never HTML");
  assert.match(h.node("ai-model-status").textContent, /Unverified prose/);
  assert.doesNotMatch(h.node("ai-model-status").textContent, /older/);
});

test("provider secrets and model prose are screen-only and absent from cost collection", () => {
  const rail = html.slice(html.indexOf('<aside class="rail">'), html.indexOf("</aside>"));
  assert.doesNotMatch(rail, /id="ai-token"/);
  assert.match(html, /<details class="ai-refine screen-only">[\s\S]*id="ai-token"[\s\S]*id="ai-refinement-text"[\s\S]*<\/details>/);
  assert.match(html.slice(html.indexOf("@media print")), /\.screen-only \{ display:none !important; \}/);
  const h = harness();
  h.node("ai-token").value = "never-export-me";
  h.node("f-users").value = "500";
  h.context.document.querySelectorAll = () => [h.node("ai-token"), h.node("f-users")];
  assert.equal(h.get("enteredControls().map((el) => el.id).join(',')"), "f-users");
});

test("copy falls back when the async clipboard is unavailable", async () => {
  const h = harness();
  h.context.navigator.clipboard.writeText = async () => { throw new Error("denied"); };
  h.context.document.execCommand = (command) => command === "copy";
  await assert.doesNotReject(h.get("copyText('portable prompt')"));
});

test("the page explains HTTPS localhost limits and Nutanix price boundaries", () => {
  assert.match(html, /browsers block direct calls to <code>http:\/\/localhost<\/code>/);
  assert.match(app, /Nutanix Enterprise AI has no public list price|blueprint\.warnings/);
  assert.match(html, /Reset whole page/);
  assert.match(html, /AI sends only after your explicit Generate/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  for (const publishedPrivacySurface of [privacy, llms]) {
    if (/data leaves (?:your|the) device only/i.test(publishedPrivacySurface)) {
      assert.match(publishedPrivacySurface, /Generate/i);
    }
  }
  assert.match(privacy, /does not receive, store, or proxy the backup, prompt, token, or model response/i);
});
