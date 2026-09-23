// Verify-ship acceptance tests (peer-authored) for the SOW / AI-draft release.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../lib/db.mjs';
import { createApi } from '../api.mjs';
import { createInvoiceFromQuotation } from '../lib/invoice.mjs';

function fixture() {
  const db = openDb(':memory:');
  const api = createApi(db);
  const call = async (method, path, body = {}, query = {}) => {
    const r = await api({ method, path, body, query, actor: 'verify-test' });
    return { ...JSON.parse(r.body), status: r.status };
  };
  return { db, call };
}
const line = (o = {}) => ({ kind: 'service', description_en: 'Install', qty: '1', unit: 'day',
  unit_price: '1000.00', billing_period: 'once', section: '', optional: false, ...o });

async function draft(call) {
  const client = await call('POST', '/clients', { name: 'Verify Ltd' });
  const created = await call('POST', '/quotations', { client_id: client.client.id, template: 'os-install', lines: [line()] });
  assert.equal(created.status, 201);
  return created.quotation.id;
}

test('AI import: a zero quantity is refused with a JSON-path 400, not a 500', async () => {
  const { call } = fixture();
  const id = await draft(call);
  const exported = await call('GET', `/quotations/${id}/draft.json`);
  const proposal = structuredClone(exported); delete proposal.status;
  proposal.lines[0].qty = '0';
  const res = await call('POST', `/quotations/${id}/draft`, proposal, { dry_run: '1' });
  assert.equal(res.status, 400, JSON.stringify(res));
  assert.equal(res.errors?.[0]?.path, 'lines[0].qty_milli');
});

test('create: a zero-quantity initial line is refused with a JSON-path 400 and consumes no quote number', async () => {
  const { db, call } = fixture();
  const client = await call('POST', '/clients', { name: 'Verify Ltd' });
  const res = await call('POST', '/quotations', { client_id: client.client.id, lines: [line({ qty: '0' })] });
  assert.equal(res.status, 400, JSON.stringify(res));
  assert.equal(db.prepare('SELECT COUNT(*) c FROM quotations').get().c, 0);
});

test('legacy accepted quotation whose content drifted from its revision cannot be invoiced', async () => {
  const { db, call } = fixture();
  const id = await draft(call);
  assert.equal((await call('POST', `/quotations/${id}/issue`)).status, 200);
  // Pre-guard world: edited after issue, then accepted without re-issue.
  db.prepare("UPDATE quotation_lines SET unit_satang = 999900 WHERE quotation_id = ?").run(id);
  db.prepare("UPDATE quotations SET status = 'accepted' WHERE id = ?").run(id);
  assert.throws(() => createInvoiceFromQuotation(db, id, { actor: 'verify-test', issueDate: '2026-09-23' }),
    /differs from its issued revision/);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices').get().c, 0);
});