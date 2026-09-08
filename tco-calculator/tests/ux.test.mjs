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

test("reply figures freeze request-time costs and changed controls are explicit in follow-up context", async () => {
  const h = harness(); h.get("setupPlanner()"); h.state.ready = true;
  h.get("compactLedger = () => null");
  h.state.result = { horizon_months: 60, totals: { A: { priced: true, horizon_total: "100", monthly_total: "1", one_time: "40" } }, payback: {} };
  h.node("f-users").value = "500";
  const sent = [];
  h.context.requestChatTurn = async (args) => {
    sent.push(args);
    return { user:{role:"user",content:args.userMessage}, assistantMessage:{role:"assistant",content:"Check utilization first."}, toolCall:null, prose:"Check utilization first.", model:"test" };
  };
  await h.get("sendChatMessage('Why rent?')");
  const frozen = JSON.stringify(h.get("chatState.transcript").find((row) => row.role === "assistant").figures);
  assert.match(frozen, /3,300\.00/);
  h.state.result.payback = { self_hosted_capex:"40", vs_model_api:{converges:true,months:40}, vs_rented_gpu:{converges:true,months:131} };
  const payback = h.get("conversationSnapshot().figures.payback");
  assert.match(payback, /Model API: 40 months \(within this horizon\)/);
  assert.match(payback, /Rented GPU: 131 months \(outside this horizon\)/);
  assert.doesNotMatch(payback, /self_hosted_capex/);
  h.node("f-users").value = "5000";
  h.state.result.totals.A.horizon_total = "200";
  await h.get("sendChatMessage('And now?')");
  assert.match(sent[1].systemPrompt, /"scenario_changed":true/);
  assert.match(sent[1].systemPrompt, /"f-users":"5000"/);
  assert.equal(JSON.stringify(h.get("chatState.transcript").find((row) => row.role === "assistant").figures), frozen);
  assert.match(h.node("ai-transcript").innerHTML, /Scenario changed/);
  assert.equal(sent[1].userMessage, "And now?");
});

test("cancel and calculator edits recover the question without accepting a late reply or overwriting a draft", async () => {
  for (const draft of ["", "My next question"]) {
    const h = harness(); h.get("setupPlanner()"); h.state.ready = true;
    let resolve;
    h.context.requestChatTurn = () => new Promise((done) => { resolve = done; });
    h.node("ai-message").value = "Why rent?";
    const pending = h.get("sendChatMessage()");
    h.node("ai-message").value = draft;
    h.get("onLiveInput()");
    assert.equal(h.node("ai-message").value, draft || "Why rent?");
    assert.equal(h.get("chatState.busy"), false);
    resolve({user:{role:"user",content:"Why rent?"}, assistantMessage:{role:"assistant",content:"Late answer"}, prose:"Late answer", toolCall:null});
    await pending;
    assert.doesNotMatch(h.node("ai-transcript").innerHTML, /Late answer/);
    assert.equal(h.get("chatState.history.snapshot().length"), 0);
  }
});

test("failed requests are retryable status, not fabricated assistant replies", async () => {
  const h = harness(); h.get("setupPlanner()"); h.state.ready = true;
  h.context.requestChatTurn = async () => { throw new Error("Request timed out"); };
  await h.get("sendChatMessage('Explain this')");
  assert.equal(h.node("ai-message").value, "Explain this");
  assert.equal(h.get("chatState.transcript").filter((row) => row.role === "assistant").length, 0);
  assert.match(h.node("ai-transcript").innerHTML, /data-role="status"/);
});

test("invalid optional tool preserves prose and has an inert rejection in the next complete exchange", async () => {
  const h = harness(); h.get("setupPlanner()"); h.state.ready = true;
  h.context.requestChatTurn = (args) => realRequestChatTurn({ ...args, fetchImpl:async () => ({ok:true,json:async () => ({choices:[{message:{role:"assistant",content:"Check utilization first.", tool_calls:[{id:"bad-1",type:"function",function:{name:"unknown_tool",arguments:"{}"}}]}}]})}) });
  await h.get("sendChatMessage('Why rent?')");
  assert.match(h.node("ai-transcript").innerHTML, /Check utilization first/);
  const exchange = h.get("chatState.history.snapshot()[0]");
  assert.equal(exchange.assistant.tool_calls[0].function.name, "unknown_tool");
  assert.equal(exchange.tools[0].tool_call_id, "bad-1");
  assert.match(exchange.tools[0].content, /rejected/);
  assert.equal(h.get("chatState.pendingProposal"), null);
});

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

// Inline-chat tests are migrated below to the real dedicated advisor controller,
// and to calculator-side returned-proposal expansion. Custom arithmetic, control,
// graph, initialization, export and pricing tests above remain unchanged.

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
