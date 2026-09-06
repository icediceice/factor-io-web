import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { Dec, Rat, formatHalfUp } from "../exact.js";

// Execute the real UI functions with a deliberately small DOM boundary and
// controlled timers/fetches. These are behavioral unit tests, not browser tests.
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../../tco-calculator.html", import.meta.url), "utf8");
const fields = readFileSync(new URL("../fields.js", import.meta.url), "utf8");
function harness() {
  const nodes = new Map();
  const listeners = new Map();
  const timers = new Map();
  let nextTimer = 0;
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      id, value: "", defaultValue: "", innerHTML: "", textContent: "", dataset: {},
      tagName: "INPUT", type: "text", options: [], hidden: false, disabled: false,
      attrs: {}, classList: { add() {}, remove() {}, toggle() {} },
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(k, f) { this.events ??= {}; this.events[k] = f; },
      appendChild(o) { this.options.push(o); },
    });
    return nodes.get(id);
  }
  const context = vm.createContext({
    Dec, Rat, formatHalfUp, console: { error() {} }, Event,
    DemandRefusal: class DemandRefusal extends Error {},
    ServingRefusal: class ServingRefusal extends Error {},
    document: {
      getElementById: node,
      addEventListener: (type, f) => listeners.set(type, f),
      querySelectorAll: () => [], querySelector: () => node("rail"),
      createElement: () => ({ value: "", textContent: "" }),
    },
    setTimeout: (fn) => { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
    location: { reload() {} },
    syncChips() {}, enhanceRail() {}, releaseFields() {},
  });
  vm.runInContext(app.replace(/^import .*;\n/gm, "").replace(/\ninit\(\);\s*$/, ""), context);
  const get = (expression) => vm.runInContext(expression, context);
  return { context, node, nodes, get, listeners, timers, state: get("state"),
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
  assert.match(h.node("comparison-scope").innerHTML, /Additional commercial fees: \$360000.00/);
  assert.match(h.node("comparison-scope").innerHTML, /excluded from the comparison, curve and payback/);
  assert.match(h.node("verdict").innerHTML, /\$432000.00/);
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

test("field harvesting and close use a shared range-blind control selector", () => {
  assert.match(fields, /const CONTROL = "input:not\(\[type=range\]\), select"/);
  assert.doesNotMatch(fields, /querySelector(?:All)?\("input, select"\)/);
  assert.match(fields, /f\.dataset\.inline/);
  assert.match(fields, /h2\.cloneNode\(true\)/);
  assert.match(fields, /releaseFields/);
});
