// Peer acceptance probe (verify-ship): every op declared in lib/mcp-tools.mjs
// must reach a live REST route, and the bearer lane must audit as actor "agent".
// The pdf ops are NOT exercised here on purpose: tests/api.test.mjs:855-856
// records the convention that a unit test must not launch Chromium.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { createApp } from '../server.mjs';
import { openDb } from '../lib/db.mjs';

const script = new URL('../mcp.mjs', import.meta.url).pathname;
function client(env) {
  const child = spawn(process.execPath, [script], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let next = 0;
  createInterface({ input: child.stdout }).on('line', line => {
    const msg = JSON.parse(line);
    if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const rpc = (method, params) => new Promise(resolve => { const id = ++next; pending.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const tool = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result;
  return { child, rpc, tool };
}

test('every declared op reaches a live REST route and audits as actor agent', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'quotes-accept-'));
  const dbPath = join(dir, 'accept.db');
  const app = createApp({ QUOTES_AGENT_TOKEN: 'accept-token', QUOTES_DB_PATH: dbPath });
  const server = createServer(app.handle); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { if (!c.child.killed) c.child.kill(); await new Promise(r => server.close(r)); app.close(); rmSync(dir, { recursive: true, force: true }); });
  const c = client({ QUOTES_URL: url, QUOTES_AGENT_TOKEN: 'accept-token' });

  const seen = [];
  const run = async (tool, args) => {
    const r = await c.tool(tool, args);
    assert.equal(r.isError, false, `${tool}.${args.op} -> ${r.content[0].text}`);
    seen.push(`${tool}.${args.op}`);
    return r.structuredContent;
  };

  const auditWatermark = (() => { const d = openDb(dbPath); const m = d.prepare('SELECT COALESCE(MAX(rowid), 0) m FROM audit_log').get().m; d.close(); return m; })();

  // ---- read: context and the plain list reads
  const ctx = await run('read', { op: 'context' });
  assert.ok(Array.isArray(ctx.catalog.items), 'context carries a paged catalog');
  assert.ok(ctx.settings && ctx.templates && ctx.kinds && ctx.billing_periods);
  assert.ok(Array.isArray((await run('read', { op: 'list' })).quotations));
  assert.ok((await run('read', { op: 'settings' })).settings);
  assert.ok((await run('read', { op: 'catalog' })).items);

  // ---- draft: client and catalog upserts (create then update paths)
  const cl = (await run('draft', { op: 'client_save', name: 'Accept Client', email: 'accept@example.test' })).client;
  assert.equal(cl.name, 'Accept Client');
  const item = (await run('draft', { op: 'catalog_save', kind: 'service', name_en: 'Accept Work', unit_price: '150.00' })).item;
  assert.equal(item.unit_satang, 15000);
  const item2 = (await run('draft', { op: 'catalog_save', id: item.id, name_en: 'Accept Work v2', unit_price: '175.00' })).item;
  assert.equal(item2.unit_satang, 17500);
  assert.equal((await run('read', { op: 'clients' })).clients.length, 1);
  assert.equal((await run('read', { op: 'client', id: cl.id })).client.name, 'Accept Client');

  // ---- draft: create, update, set_sow, lines, clone, export, apply
  const starter = (ctx.starters ?? [])[0];
  const template = starter && (starter.name ?? starter.key ?? starter.code);
  const created = await run('draft', {
    op: 'create', client_id: cl.id, lang: 'en', term_months: 12, notes: 'probe',
    ...(template ? { template } : {}),
    lines: [{ kind: 'service', description_en: 'Work', qty: '2', unit_price: '100.00' }],
  });
  const qid = created.quotation.id;
  assert.equal(created.totals.netSatang, 20000);
  await run('draft', { op: 'update', id: qid, notes: 'updated', term_months: 6 });
  assert.equal((await run('read', { op: 'get', id: qid })).quotation.termMonths, 6);
  if (created.sow) {
    await run('draft', { op: 'set_sow', id: qid, sow: created.sow });
  } else {
    t.diagnostic('set_sow not exercised: no template sow available');
  }
  const a = await run('draft', { op: 'line_add', id: qid, kind: 'service', description_en: 'A', qty: '1', unit_price: '10.00' });
  const b = await run('draft', { op: 'line_add', id: qid, kind: 'service', description_en: 'B', qty: '1', unit_price: '20.00' });
  await run('draft', { op: 'line_update', id: qid, line_id: a.line.id, description_en: 'A2', qty: '3' });
  await run('draft', { op: 'reorder', id: qid, line_ids: [b.line.id, a.line.id, created.lines[0].id] });
  await run('draft', { op: 'line_remove', id: qid, line_id: b.line.id });
  const cloned = await run('draft', { op: 'clone', id: qid, notes: 'clone' });
  assert.equal(cloned.quotation.status, 'draft');
  const exported = await run('read', { op: 'draft_export', id: qid });
  assert.equal(exported.schema, 'factor-quote-draft');
  const applied = await run('draft', { op: 'draft_apply', id: qid, draft: exported, dry_run: false });
  assert.equal(applied.preview, false, 'dry_run:false must actually apply');
  await run('read', { op: 'preview', id: qid, lang: 'th' });
  assert.ok(Array.isArray((await run('read', { op: 'revisions', id: qid })).revisions));

  // ---- quotation: issue, revisions by rev, status, delete, restore
  await run('quotation', { op: 'issue', id: qid });
  const revs = await run('read', { op: 'revisions', id: qid });
  assert.ok(revs.revisions.length >= 1);
  await run('read', { op: 'revisions', id: qid, revision: revs.revisions[0].rev });
  await run('quotation', { op: 'status', id: qid, status: 'proposed' });
  await run('quotation', { op: 'status', id: qid, status: 'accepted' });

  const spare = await run('draft', { op: 'create', client_id: cl.id, lines: [{ kind: 'service', description_en: 'Spare', qty: '1', unit_price: '1.00' }] });
  const spareId = spare.quotation.id;
  await run('quotation', { op: 'delete', id: spareId, confirm: spare.quotation.number });
  const deleted = await run('read', { op: 'deleted' });
  assert.ok(deleted.deleted.some(r => r.id === spareId));
  await run('quotation', { op: 'restore', id: spareId });

  // ---- invoice: create, status, delete, issue, pay, payments, wht, payment_delete
  const cancelled = await run('invoice', { op: 'create', quotation_id: qid });
  await run('invoice', { op: 'status', id: cancelled.invoice.id, status: 'cancelled' });
  const doomed = await run('invoice', { op: 'create', quotation_id: qid });
  await run('invoice', { op: 'delete', id: doomed.invoice.id, confirm: doomed.invoice.number || String(doomed.invoice.id) });
  const inv = await run('invoice', { op: 'create', quotation_id: qid });
  const iid = inv.invoice.id;
  const issuedInv = await run('invoice', { op: 'issue', id: iid, confirm: inv.invoice.number || String(iid) });
  assert.equal(issuedInv.invoice.status, 'issued');
  const paid = await run('invoice', { op: 'pay', id: iid, amount: '100.00', method: 'transfer', reference: 'probe' });
  assert.equal(paid.payments.length, 1);
  await run('read', { op: 'payments', id: iid });
  await run('invoice', { op: 'wht', id: iid, base: '230.00', wht: '2.30', cert_number: 'C1' });
  await run('read', { op: 'invoice', id: iid });
  assert.ok((await run('read', { op: 'invoices' })).invoices.length >= 1);
  const pid = paid.payments[0].id;
  await run('invoice', { op: 'payment_delete', id: iid, payment_id: pid, confirm: issuedInv.invoice.number || String(iid) });

  // ---- settings
  await run('settings', { op: 'set', key: 'currency.code', value: 'THB', confirm: 'currency.code' });

  // ---- read: every report worksheet
  const yr = new Date().getFullYear();
  await run('read', { op: 'report', report: 'income', year: yr });
  await run('read', { op: 'report', report: 'pp30', year: yr, month: '1' });
  await run('read', { op: 'report', report: 'pipeline', year: yr });
  await run('read', { op: 'report', report: 'wht', from: `${yr}-01-01`, to: `${yr}-12-31` });
  await run('read', { op: 'report', report: 'pnd', year: yr, half: 1 });

  // ---- the promise: every write above audited as actor "agent"
  const db = openDb(dbPath);
  const after = db.prepare('SELECT actor, COUNT(*) c FROM audit_log WHERE rowid > ? GROUP BY actor').all(auditWatermark);
  db.close();
  assert.deepEqual(after.map(r => r.actor), ['agent'], `audit actors: ${JSON.stringify(after)}`);
  assert.ok(after[0].c >= 20, `expected >=20 audited writes, saw ${after[0].c}`);

  t.diagnostic(`ops exercised (${new Set(seen).size}): ${[...new Set(seen)].join(', ')}`);
});