import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, getSettings } from '../lib/db.mjs';
import { createApi } from '../api.mjs';
import { renderQuotationHtml } from '../templates/quotation.mjs';
import { buildQuoteDocument } from '../lib/quote.mjs';

function fixture() {
  const db = openDb(':memory:');
  const api = createApi(db);
  const call = async (method, path, body = {}, query = {}) => {
    const r = await api({ method, path, body, query, actor: 'sow-test' });
    return { ...JSON.parse(r.body), status: r.status };
  };
  return { db, call };
}
const line = (overrides = {}) => ({ kind: 'service', description_en: 'Install cluster', description_th: 'ติดตั้งคลัสเตอร์',
  qty: '2.5', unit: 'day', unit_price: '35000.00', billing_period: 'once', section: 'Implementation', optional: false, ...overrides });

async function draft(call) {
  const client = await call('POST', '/clients', { name: 'Scope Test Ltd' });
  const templates = await call('GET', '/sow-templates');
  const created = await call('POST', '/quotations', { client_id: client.client.id, template: 'nkp',
    sow: templates.templates.find((t) => t.code === 'nkp').sow, lines: [line()] });
  assert.equal(created.status, 201);
  return created.quotation.id;
}

test('SOW templates are editable data and optional Kubernetes services start excluded', async () => {
  const { db, call } = fixture();
  const response = await call('GET', '/sow-templates');
  assert.equal(response.status, 200);
  assert.deepEqual(response.templates.map((t) => t.code), ['os-install', 'openshift', 'nkp', 'vanilla-kube']);
  for (const t of response.templates) {
    assert.equal(t.sow.modules[0].included, true);
    assert.ok(t.sow.modules.slice(1).every((m) => !m.included));
  }
  assert.match(response.templates[2].sow.assumptions[0].en, /storage and load balancing/);
  const changed = structuredClone(response.templates);
  changed[0].sow.summary.en = 'Custom OS delivery';
  assert.equal((await call('PUT', '/sow-templates', { templates: changed })).status, 200);
  assert.equal(JSON.parse(getSettings(db, '')['sow.templates'])[0].sow.summary.en, 'Custom OS delivery');
  const invalid = await call('PUT', '/sow-templates', { templates: [{ ...changed[0], code: 'bad code' }] });
  assert.equal(invalid.status, 400);
});

test('SOW is part of the revision, stale issued content cannot be accepted, and legacy snapshots stay current', async () => {
  const { db, call } = fixture();
  const id = await draft(call);
  const issued = await call('POST', `/quotations/${id}/issue`);
  assert.equal(issued.status, 200);
  assert.equal(issued.quotation.revisionStale, false);
  const snapshot = db.prepare('SELECT snapshot_json FROM quotation_revisions WHERE quotation_id=?').get(id);
  const old = JSON.parse(snapshot.snapshot_json); delete old.sow;
  // A pre-SOW issued quotation has no SOW key in its saved snapshot.
  db.prepare("UPDATE quotations SET sow_json='' WHERE id=?").run(id);
  db.prepare('UPDATE quotation_revisions SET snapshot_json=? WHERE quotation_id=?').run(JSON.stringify({ ...old, sow: undefined }), id);
  assert.equal(buildQuoteDocument(db, id).quotation.revisionStale, false);
  // Restore the issued SOW before the edited-content check.
  db.prepare('UPDATE quotation_revisions SET snapshot_json=? WHERE quotation_id=?').run(snapshot.snapshot_json, id);
  const sow = issued.sow;
  sow.summary.en = 'Changed after issue';
  assert.equal((await call('PUT', `/quotations/${id}/sow`, { sow })).status, 200);
  const refused = await call('POST', `/quotations/${id}/status`, { status: 'accepted' });
  assert.equal(refused.status, 400);
  assert.match(refused.error, /re-issue/);
  assert.equal((await call('POST', `/quotations/${id}/issue`)).status, 200);
  assert.equal((await call('POST', `/quotations/${id}/status`, { status: 'accepted' })).status, 200);
  const invoice = await call('POST', '/invoices', { quotation_id: id, issue_date: '2026-09-23' });
  assert.equal(invoice.status, 201);
});

test('AI preview rolls back, rejects unsupported keys and missing prices, and applies only to its unchanged draft', async () => {
  const { db, call } = fixture();
  const id = await draft(call);
  const exported = await call('GET', `/quotations/${id}/draft.json`);
  assert.equal(exported.status, 200);
  assert.equal(exported.lines[0].qty, '2.5');
  assert.equal(exported.lines[0].unit_price, '35000.00');
  const before = db.prepare('SELECT COUNT(*) c FROM quotation_lines WHERE quotation_id=?').get(id).c;
  const proposal = structuredClone(exported);
  proposal.lines.push(line({ description_en: 'Validation', qty: '1', unit_price: '12000.00' }));
  const preview = await call('POST', `/quotations/${id}/draft`, proposal, { dry_run: '1' });
  assert.equal(preview.status, 200, JSON.stringify(preview));
  assert.equal(preview.preview, true);
  assert.equal(preview.lines.length, 2);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM quotation_lines WHERE quotation_id=?').get(id).c, before);
  const missingPrice = structuredClone(proposal); missingPrice.lines[1].unit_price = null;
  const invalid = await call('POST', `/quotations/${id}/draft`, missingPrice);
  assert.equal(invalid.status, 400);
  assert.equal(invalid.errors[0].path, 'lines[1].unit_satang');
  const forbidden = await call('POST', `/quotations/${id}/draft`, { ...proposal, status: 'accepted' });
  assert.equal(forbidden.status, 400);
  assert.equal(forbidden.errors[0].path, 'status');
  const numberQty = structuredClone(proposal); numberQty.lines[1].qty = 2.5;
  const qtyRefusal = await call('POST', `/quotations/${id}/draft`, numberQty);
  assert.equal(qtyRefusal.status, 400);
  assert.equal(qtyRefusal.errors[0].path, 'lines[1].qty_milli');
  assert.equal((await call('POST', `/quotations/${id}/draft`, proposal)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM quotation_lines WHERE quotation_id=?').get(id).c, 2);
  assert.equal((await call('POST', `/quotations/${id}/draft`, proposal)).status, 409);
  const otherId = await draft(call);
  const cross = await call('POST', `/quotations/${otherId}/draft`, proposal);
  assert.equal(cross.status, 400);
});

test('SOW text is escaped in HTML and omitted for old documents', async () => {
  const { call } = fixture();
  const id = await draft(call);
  const got = await call('GET', `/quotations/${id}`);
  const sow = got.sow;
  sow.summary.en = '<script>alert(1)</script>';
  sow.modules[0].items[0].en = '<img src=file:///etc/passwd>';
  const updated = await call('PUT', `/quotations/${id}/sow`, { sow });
  assert.equal(updated.status, 200);
  const html = renderQuotationHtml(updated, 'en');
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=file:\/\/\/etc\/passwd&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(renderQuotationHtml({ ...updated, sow: null }, 'en'), /Statement of work/);
});
