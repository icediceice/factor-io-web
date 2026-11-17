// Post-implementation acceptance cases for plan local:c59963d5a0142f470583c008522c23df.
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as sizer from '../tco-calculator/sizer-engine.js';
import * as exact from '../tco-calculator/exact.js';
import * as currency from '../tco-calculator/currency.js';

const json = name => JSON.parse(readFileSync(new URL(`../tco-calculator/data/${name}.json`, import.meta.url), 'utf8'));
const manifest = json('manifest');
const data = {
  manifest,
  catalog: json(manifest.resources.catalog.path.replace(/\.json$/, '')),
  fx: currency.normalizeFxDocument({ observed_at: '2026-09-01', usd_thb: '33', source_id: 'fixture' }),
  gpuPricing: json('gpu-pricing'), serverPricing: json('server-pricing'),
  servingData: json('serving-models'), powerSeed: json('power-seed'), subscriptions: json('subscription-pricing'),
};
const uiSource = readFileSync(new URL('../tco-calculator/sizer-ui.js', import.meta.url), 'utf8');
function uiHarness() {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      id, value: '', innerHTML: '', textContent: '', attrs: {}, hidden: false,
      setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
    });
    return nodes.get(id);
  };
  const context = vm.createContext({
    ...sizer, ...exact, ...currency, TextEncoder, TextDecoder, AbortController, DOMException,
    structuredClone, setTimeout, clearTimeout, URL, console,
    document: { getElementById: id => id === 'main-workspace' ? null : node(id) },
  });
  vm.runInContext(uiSource.replace(/^import[\s\S]*?;\s*$/gm, '').replace(/^export\s+/gm, ''), context);
  const get = code => vm.runInContext(code, context);
  const state = get('appState');
  state.data = data; state.ready = true; state.lang = 'en'; state.displayCurrency = 'USD';
  return { node, get, state, context };
}

for (const displayCurrency of ['USD', 'THB']) {
  test(`G1 ledger upfront charges hardware once and implementation label excludes hardware (${displayCurrency})`, () => {
    const computed = sizer.computeSizer({ input: {
      users: 100, modelId: 'qwen3-5-9b', gpuId: 'rtx_pro_6000_se', quoteBasis: 'fleet_total',
      quoteCurrency: 'USD', nodes: 1, gpusPerNode: 2,
      fleetTotalPrice: { amount: '10000', currency: 'USD' },
      localImplFee: { amount: '500', currency: 'USD' },
    }, data });
    expect(computed.ok).toBe(true);
    // The engine contract already includes capex in one_time.
    expect(exact.ratStr(exact.toRat(computed.comparison.totals.A.one_time))).toBe('10500');
    const h = uiHarness(); h.state.computed = computed; h.state.displayCurrency = displayCurrency;
    h.get('renderLedgerAndSummaryRail()');
    const row = h.node('ledger-60m-tbody').innerHTML.match(/<tr>([\s\S]*?)<\/tr>/)[1];
    const upfront = row.match(/<td class="col-num">([^<]+)<\/td>/)[1];
    const expectedUpfront = h.get("fmtMoneyUsd('10500')");
    const expectedFee = h.get("fmtMoneyUsd('500')");
    expect.soft(upfront).toBe(expectedUpfront);
    const rail = h.node('summary-kv').innerHTML;
    const implementation = rail.match(/<dt>Local integration \(one-time\)<\/dt><dd>([^<]+)<\/dd>/)[1];
    expect(implementation).toBe(expectedFee);
  });
}

test('G2 a valid catalog active-only override survives share, handoff, and save codecs', () => {
  const result = sizer.computeSizer({ input: {
    users: 100, modelId: 'qwen3-8-27b', gpuId: 'rtx_pro_6000_se', customActiveParamsB: '5',
  }, data });
  expect(result.ok).toBe(true);
  expect(result.fit.resolvedModel.params_b).toBe('27');
  expect(result.fit.resolvedModel.active_params_b).toBe('5');
  const fragment = sizer.encodeSizerFragment(result.normalized);
  const decoded = sizer.decodeSizerFragment(fragment);
  expect(decoded.customActiveParamsB).toBe('5');
  expect(sizer.resolveSizerModel({ normalized: decoded, servingData: data.servingData }).model.params_b).toBe('27');
  const saved = sizer.encodeSizerSaveEnvelope([{ id: 'active-only', name: 'Active-only sensitivity', savedAt: '2026-11-17T12:00:00Z', fragment }]);
  expect(sizer.decodeSizerSaveEnvelope(saved).scenarios[0].normalized.customActiveParamsB).toBe('5');
});

test('valid custom BF16 and INT8 KV specs round-trip with the requested precision', () => {
  for (const kvquant of ['bf16', 'int8']) {
    const n = sizer.normalizeSizerInput({ users: 100, modelId: 'custom', customParamsB: '70', customActiveParamsB: '70', customKvBytesBf16: 327680, customContextMax: 131072, kvquant, gpuId: 'h100' });
    const decoded = sizer.decodeSizerFragment(sizer.encodeSizerFragment(n));
    const resolved = sizer.resolveSizerModel({ normalized: decoded, servingData: data.servingData });
    expect(resolved.model.selected_kv_bytes_per_token).toBe(kvquant === 'bf16' ? '327680' : '163840');
  }
});

test('a stale asynchronous file import leaves the newer draft intact', async () => {
  const h = uiHarness();
  h.get('renderAll = () => {}; renderSavedScenariosList = () => {}');
  let resolveText;
  h.context.pendingFile = { size: 1000, text: () => new Promise(resolve => { resolveText = resolve; }) };
  const pending = h.get('handleImportJsonFile(pendingFile)');
  h.get("handleFieldMutation('users', '777')");
  const fragment = sizer.encodeSizerFragment(sizer.normalizeSizerInput({ users: 100 }));
  resolveText(sizer.encodeSizerSaveEnvelope([{ id: 'old', name: 'Old file', savedAt: '2026-11-17T12:00:00Z', fragment }]));
  await pending;
  expect(h.state.draft.users).toBe('777');
});