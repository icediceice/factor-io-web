// Verify-ship acceptance tests for the SOW / AI-draft release.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openDb, MIGRATIONS, migrate } from '../lib/db.mjs';
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

test('AI import: an overflowing line amount is refused with a JSON-path 400', async () => {
  const { call } = fixture();
  const id = await draft(call);
  const exported = await call('GET', `/quotations/${id}/draft.json`);
  const proposal = structuredClone(exported); delete proposal.status;
  proposal.lines[0].qty = '999999';
  proposal.lines[0].unit_price = '999999999999999.99';
  const res = await call('POST', `/quotations/${id}/draft`, proposal, { dry_run: '1' });
  assert.equal(res.status, 400, JSON.stringify(res));
  assert.equal(res.errors?.[0]?.path, 'lines[0].unit_price');
});

test('create: a zero-quantity initial line is refused with a JSON-path 400 and consumes no quote number', async () => {
  const { db, call } = fixture();
  const client = await call('POST', '/clients', { name: 'Verify Ltd' });
  const res = await call('POST', '/quotations', { client_id: client.client.id, lines: [line({ qty: '0' })] });
  assert.equal(res.status, 400, JSON.stringify(res));
  assert.equal(db.prepare('SELECT COUNT(*) c FROM quotations').get().c, 0);
});

test('an unchanged quotation issued with a blank issue date can still be accepted on a later day', async () => {
  const { db, call } = fixture();
  const realNow = Date.now;
  try {
    Date.now = () => Date.parse('2026-09-22T00:00:00Z');
    const id = await draft(call);
    assert.equal(db.prepare('SELECT issue_date FROM quotations WHERE id=?').get(id).issue_date, '');
    assert.equal((await call('POST', `/quotations/${id}/issue`)).status, 200);
    const issuedDate = db.prepare('SELECT issue_date FROM quotations WHERE id=?').get(id).issue_date;
    assert.equal(issuedDate, '2026-09-22');
    const row = db.prepare('SELECT snapshot_json FROM quotation_revisions WHERE quotation_id=?').get(id);
    assert.equal(JSON.parse(row.snapshot_json).quotation.issueDate, issuedDate);
    Date.now = () => Date.parse('2026-09-24T00:00:00Z');
    const accepted = await call('POST', `/quotations/${id}/status`, { status: 'accepted' });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.error));
  } finally {
    Date.now = realNow;
  }
});

test('migration 7 backfills the latest valid issued date without overwriting explicit dates', () => {
  const db = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS.filter((m) => m.version <= 6)) {
    db.exec(m.sql);
    db.exec(`PRAGMA user_version = ${m.version}`);
  }
  db.prepare("INSERT INTO clients (name) VALUES ('Verify Ltd')").run();
  const insertQuote = db.prepare("INSERT INTO quotations (number, client_id, status, issue_date) VALUES (?, 1, 'issued', ?)");
  const insertRev = db.prepare("INSERT INTO quotation_revisions (quotation_id, rev, snapshot_json, actor) VALUES (?, ?, ?, 'verify-test')");
  const blank = Number(insertQuote.run('QT-BLANK', '').lastInsertRowid);
  insertRev.run(blank, 1, JSON.stringify({ quotation: { issueDate: '2026-09-20' } }));
  insertRev.run(blank, 2, JSON.stringify({ quotation: { issueDate: '2026-09-22' } }));
  const explicit = Number(insertQuote.run('QT-EXPLICIT', '2026-09-21').lastInsertRowid);
  insertRev.run(explicit, 1, JSON.stringify({ quotation: { issueDate: '2026-09-20' } }));
  const invalid = Number(insertQuote.run('QT-INVALID', '').lastInsertRowid);
  insertRev.run(invalid, 1, '{bad json');
  migrate(db);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8);
  assert.equal(db.prepare('SELECT issue_date FROM quotations WHERE id=?').get(blank).issue_date, '2026-09-22');
  assert.equal(db.prepare('SELECT issue_date FROM quotations WHERE id=?').get(explicit).issue_date, '2026-09-21');
  assert.equal(db.prepare('SELECT issue_date FROM quotations WHERE id=?').get(invalid).issue_date, '');
});

test('legacy accepted quotation whose content drifted from its revision cannot be invoiced', async () => {
  const { db, call } = fixture();
  const id = await draft(call);
  assert.equal((await call('POST', `/quotations/${id}/issue`)).status, 200);
  db.prepare("UPDATE quotation_lines SET unit_satang = 999900 WHERE quotation_id = ?").run(id);
  db.prepare("UPDATE quotations SET status = 'accepted' WHERE id = ?").run(id);
  assert.throws(() => createInvoiceFromQuotation(db, id, { actor: 'verify-test', issueDate: '2026-09-23' }),
    /differs from its issued revision/);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices').get().c, 0);
});
