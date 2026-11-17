test('live API tariff replacement triggers repricing even when FX stays on the dated fallback', () => {
  const n=sizer.normalizeSizerInput({users:100,modelId:'qwen3-5-9b',gpuId:'rtx_pro_6000_se',quoteBasis:'fleet_total',nodes:1,gpusPerNode:2,fleetTotalPrice:{amount:'100000',currency:'THB'}});
  const original=sizer.computeSizer({input:n,data});
  const id=original.resolvedApiOfferId;
  const old=data.catalog.offers[id];
  const live={source:{source_id:'openrouter',observed_at:'2026-11-17T00:00:00Z',origin:'live'},models:[{id,name:'Live quote',state:'active'}],offers:{[id]:{...old, prices:{...old.prices,input:'0.001',output:'0.002'}}}};
  const replaced=replaceCatalogSource(data.manifest,data.catalog,live);
  const captured=sizer.normalizeSizerInput({...n,apiOfferId:id,pricingIdentity:original.pricingIdentity});
  const projected=sizer.projectSizerControls({normalized:captured,beforeControls:{},stateData:{...data,...replaced}});
  expect(projected.result.comparison.totals.B.monthly_total).not.toBe(original.comparison.totals.B.monthly_total);
  expect(projected.repriced).toBe(true);
});
test('an explicitly selected unpublished platform subscription cannot silently become free', () => {
  const result=sizer.computeSizer({input:{users:100,modelId:'qwen3-5-9b',gpuId:'rtx_pro_6000_se',quoteBasis:'fleet_total',nodes:1,gpusPerNode:2,fleetTotalPrice:{amount:'100000',currency:'THB'},subscriptionId:'nutanix-enterprise-ai'},data});
  expect(result.ok).toBe(false);
});
// Quarantined acceptance cases for plan local:f375941d546baaa90771ad611b3f195d.
import { replaceCatalogSource } from '../tco-calculator/live-pricing.js';
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as exact from '../tco-calculator/exact.js';
import * as currency from '../tco-calculator/currency.js';
import * as sizer from '../tco-calculator/sizer-engine.js';
import * as assistant from '../tco-calculator/assistant.js';
import * as session from '../tco-calculator/assistant-session.js';
import * as planner from '../tco-calculator/planner.js';
import * as chat from '../tco-calculator/chat.js';
import * as demand from '../tco-calculator/demand.js';
import * as serving from '../tco-calculator/serving.js';
import * as capex from '../tco-calculator/capex.js?v=20260906-ux3';
import * as subscription from '../tco-calculator/subscription.js';
import * as power from '../tco-calculator/power.js';
import * as calculator from '../tco-calculator/calculator.js?v=20260906-ux3';
import assert from 'node:assert/strict';
const json = name => JSON.parse(readFileSync(new URL(`../tco-calculator/data/${name}.json`, import.meta.url), 'utf8'));
const manifest = json('manifest');
const data = { manifest, catalog: json(manifest.resources.catalog.path.replace(/\.json$/, '')), fx: currency.normalizeFxDocument({observed_at:'2026-09-01', usd_thb:'33', source_id:'fixture'}), gpuPricing:json('gpu-pricing'), serverPricing:json('server-pricing'), servingData:json('serving-models'), powerSeed:json('power-seed'), subscriptions:json('subscription-pricing') };
const token = (prefix, value) => `#${prefix}=v1.${Buffer.from(JSON.stringify(value)).toString('base64url')}`;
const compact = JSON.parse(Buffer.from(sizer.encodeSizerFragment(sizer.normalizeSizerInput({})).split('.')[1], 'base64url').toString());
for (const [field, bad] of [['dm','not-a-mode'], ['u',[100]], ['qc','EUR'], ['cn',['not-a-connector']], ['mx',{chat:'1', surprise:'1'}], ['pFl',{amount:'12',currency:'USD',surprise:1}]]) {
  test(`sizer decoder rejects invalid wire ${field}`, () => expect(() => sizer.decodeSizerFragment(token('sizer', {...compact,[field]:bad}))).toThrow());
}
for (const bad of [{v:1,users:-1},{v:1,users:[]},{v:1,deploymentMode:'bogus'},{v:1,nodes:10001},{v:1,localImplFee:{amount:'-10',currency:'USD'}}]) {
  test(`preset decoder rejects ${JSON.stringify(bad)}`, () => expect(() => sizer.decodePresetFragment(token('preset',bad))).toThrow());
}
test('catalog node override buys the explicit node fleet when GPUs per node is derived', () => {
  const result = sizer.computeSizer({input:{users:1,modelId:'qwen3-5-9b',gpuId:'rtx_pro_6000_ws',quoteBasis:'catalog',nodes:10},data});
  expect(result.ok).toBe(true);
  expect(result.bom.nodes).toBe(10);
});
// Reuse the existing DOM boundary, but restore real arithmetic for the parity test.
const uxUrl = new URL('../tco-calculator/tests/ux.test.mjs', import.meta.url);
const ux = readFileSync(uxUrl,'utf8');
const preamble = ux.slice(ux.indexOf('const app ='), ux.indexOf('test("graph keeps'));
const helper = ux.slice(ux.indexOf('function sizerReceiverHarness()'), ux.indexOf('test("processSizerReturn applies'));
const bindings = {...assistant,...session,...planner,...chat,...exact,...currency,...sizer,assert,vm,readFileSync,realRequestChatTurn:chat.requestChatTurn};
const makeHarness = new Function(...Object.keys(bindings), `${preamble}\n${helper}\nreturn sizerReceiverHarness;`.replaceAll('import.meta.url', JSON.stringify(uxUrl.href)))(...Object.values(bindings));
function realArithmeticHarness(n, scenarioData = data) {
  const h = makeHarness();
  Object.assign(h.context, demand, serving, capex, subscription, power, calculator);
  Object.assign(h.state, scenarioData);
  power.configurePowerSeed(scenarioData.powerSeed);
  const p = sizer.projectSizerControls({normalized:n,beforeControls:h.get('captureControls()'),stateData:scenarioData});
  h.context.applyControls(p.controls);
  const model = scenarioData.servingData.models.find(m=>m.id===n.modelId);
  h.context.realGroups=model.groups;
  h.get('readArchGroups = () => realGroups');
  return {h,p};
}
test('real app scenario preserves custom hardware, node licence, one-time fee and running cost', () => {
  const n=sizer.normalizeSizerInput({users:100,modelId:'qwen3-5-9b',gpuId:'rtx_pro_6000_se',quoteBasis:'integrated_node',nodes:2,gpusPerNode:2,integratedNodePrice:{amount:'90000',currency:'THB'},localImplFee:{amount:'25000',currency:'THB'}});
  const {h,p}=realArithmeticHarness(n);
  const actual=calculator.runComparison(h.get('buildScenario()').inputs);
  for(const field of ['one_time','monthly_total','horizon_total']) expect(exact.formatHalfUp(exact.toRat(actual.totals.A[field]),8)).toBe(exact.formatHalfUp(exact.toRat(p.result.comparison.totals.A[field]),8));
});
test('real receiver validates changed API feeds against projected options', () => {
  const h=makeHarness();
  // A valid offer from a feed not selected at startup is absent from the old DOM options.
  h.state.manifest.models.push({id:'other:valid',name:'Valid',state:'active'});
  h.state.catalog.offers['other:valid']={...h.state.catalog.offers['openrouter:gpt-4o'],offer_id:'other:valid'};
  h.node('fb-feed').options.push({value:'other'});
  const n=sizer.normalizeSizerInput({users:100,modelId:'qwen3-5-9b',gpuId:'rtx_pro_6000_se',quoteBasis:'fleet_total',nodes:1,gpusPerNode:2,fleetTotalPrice:{amount:'100000',currency:'THB'},apiOfferId:'other:valid'});
  h.context.location.href=`https://studio.factor-io.com/tco-calculator.html#${sizer.encodeSizerFragment(n)}`;
  expect(h.get('processSizerReturn()')).toBe(true);
  expect(h.node('fb-model').value).toBe('other:valid');
});