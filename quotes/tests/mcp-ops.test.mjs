// Peer acceptance probe: prove every op declared in lib/mcp-tools.mjs reaches a
// live REST route, and that the audit trail records the bearer lane as "agent".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

test('every declared op maps to a live REST route and audits as actor agent', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'quotes-ops-'));
  const dbPath = join(dir, 'ops.db');
  const app = createApp({ QUOTES_AGENT_TOKEN: 'ops-token', QUOTES_DB_PATH: dbPath });
  const server = createServer(app.handle); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { app.close(); rmSync(dir, { recursive: true, force: true }); });
  const c = client({ QUOTES_URL: url, QUOTES_AGENT_TOKEN: 'ops-token', QUOTES_MCP_OUT: join(dir, 'pdfs') });
  t.after(async () => { if (!c.child.killed) c.child.kill(); await new Promise(r => server.close(r)); });

  const seen = [];
  const run = async (tool, args) => {
    const r = await c.tool(tool, args);
    assert.equal(r.isError, false, `${tool}.${args.op} -> ${r.content[0].text}`);
    seen.push(`${tool}.${args.op}`);
    return r.structuredContent;
  };

  const ctx = await run('read', { op: 'context' });
  assert.ok(Array.isArray(ctx.catalog.items), 'context carries a paged catalog');
  assert.ok(ctx.settings && ctx.templates && ctx.kinds && ctx.billing_periods);
  assert.ok(Array.isArray((await run('read', { op: 'list' })).quotations));
  assert.ok((await run('read', { op: 'settings' })).settings);
  const cl = (await run('draft', { op: 'client_save', name: 'Ops Client', email: 'ops@example.test' })).client;
  assert.equal(cl.name, 'Ops Client');
  const item = (await run('draft', { op: 'catalog_save', kind: 'service', name_en: 'Ops Work', unit_price: '150.00' })).item;
  assert.equal(item.unit_satang, 15000);
  const item2 = (await run('draft', { op: 'catalog_save', id: item.id, name_en: 'Ops Work v2', unit_price: '175.00' })).item;
  assert.equal(item2.unit_satang, 17500);
  assert.equal((await run('read', { op: 'clients' })).clients.length, 1);
  assert.equal((await run('read', { op: 'client', id: cl.id })).client.name, 'Ops Client');
  assert.ok((await run('read', { op: 'catalog' })).items.length >= 1);

  const sow = { version: 1, summary: { en: 'Ops scope', th: '' }, modules: [{ code: 'ops', titleEn: 'Ops', included: true, items: [] }], assumptions: [], exclusions: [] };
  const created = await run('draft', {
    op: 'create', client_id: cl.id, lang: 'en', term_months: 12, notes: 'probe', sow,
    lines: [{ kind: 'service', description_en: 'Work', qty: '2', unit_price: '150.00' }],
  });
  const qid = created.quotation.id;
  assert.equal(created.totals.netSatang, 30000);
  await run('draft', { op: 'update', id: qid, notes: 'updated', term_months: 6 });
  const afterUpdate = await run('read', { op: 'get', id: qid });
  assert.equal(afterUpdate.quotation.termMonths, 6);
  await run('draft', { op: 'set_sow', id: qid, sow });
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

  await run('quotation', { op: 'issue', id: qid });
  const revs = await run('read', { op: 'revisions', id: qid });
  assert.ok(revs.revisions.length >= 1);
  await run('read', { op: 'revisions', id: qid, revision: revs.revisions[0].rev });
  await run('quotation', { op: 'status', id: qid, status: 'accepted' });
  const issued = (await run('read', { op: 'get', id: qid })).quotation;
  await run('quotation', { op: 'delete', id: qid, confirm: issued.number });
  const deleted = await run('read', { op: 'deleted' });
  assert.ok(deleted.deleted.some(r => r.id === qid));
  await run('quotation', { op: 'restore', id: qid });

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
  await run('invoice', { op: 'wht', id: iid, base: '300.00', wht: '3.00', cert_number: 'C1' });
  await run('read', { op: 'invoice', id: iid });
  assert.ok((await run('read', { op: 'invoices' })).invoices.length >= 1);
  const pid = paid.payments[0].id;
  await run('invoice', { op: 'payment_delete', id: iid, payment_id: pid, confirm: issuedInv.invoice.number || String(iid) });

  const pdf = await run('pdf', { op: 'quotation', id: qid, lang: 'en' });
  assert.match(pdf.path, /[\\/]quotation-\\d+-en-[0-9a-f-]{36}\\.pdf$/, `pdf path: ${pdf.path}`);
  assert.ok(pdf.bytes > 1000, `pdf bytes: ${pdf.bytes}`);
  assert.equal(createHash('sha256').update(readFileSync(pdf.path)).digest('hex'), pdf.sha256);
  assert.equal(statSync(pdf.path).mode & 0o777, 0o600);
  const invPdf = await run('pdf', { op: 'invoice', id: iid, lang: 'th' });
  assert.match(invPdf.path, /[\\/]invoice-\\d+-th-[0-9a-f-]{36}\\.pdf$/);
  assert.equal((await c.tool('pdf', { op: 'quotation', id: qid, lang: 'de' })).isError, true);

  await run('settings', { op: 'set', key: 'currency.code', value: 'THB', confirm: 'currency.code' });

  const yr = new Date().getFullYear();
  await run('read', { op: 'report', report: 'income', year: yr });
  await run('read', { op: 'report', report: 'pp30', year: yr, month: '1' });
  await run('read', { op: 'report', report: 'pipeline', year: yr });
  await run('read', { op: 'report', report: 'wht', from: `${yr}-01-01`, to: `${yr}-12-31` });
  await run('read', { op: 'report', report: 'pnd', year: yr, half: 1 });

  const db = openDb(dbPath);
  const actors = db.prepare('SELECT DISTINCT actor FROM audit_log').all().map(r => r.actor);
  db.close();
  assert.deepEqual(actors, ['agent'], `audit actors: ${JSON.stringify(actors)}`);

  t.diagnostic(`ops exercised: ${seen.length} -> ${seen.join(', ')}`);
});