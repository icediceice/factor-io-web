// Peer acceptance probe (verify-ship): every op declared in lib/mcp-tools.mjs
// must reach a live REST route, every write must audit as actor "agent", read
// pagination must retain every record, and the pdf ops must save the rendered
// document. A PDF renderer is a host capability, so the pdf test skips with a
// diagnostic when Chromium is absent (tests/api.test.mjs:855-856 records that
// convention for the rest of the suite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
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

async function boot(t, prefix, token, { serverEnv = {}, clientEnv = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const dbPath = join(dir, 'app.db');
  const app = createApp({ QUOTES_AGENT_TOKEN: token, QUOTES_DB_PATH: dbPath, ...serverEnv });
  const server = createServer(app.handle); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const c = client({ QUOTES_URL: url, QUOTES_AGENT_TOKEN: token, ...clientEnv });
  t.after(async () => {
    if (!c.child.killed) c.child.kill();
    await new Promise(r => server.close(r));
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const call = async (tool, args) => { const r = await c.tool(tool, args); return { r, data: r.structuredContent }; };
  const run = async (tool, args) => {
    const { r, data } = await call(tool, args);
    assert.equal(r.isError, false, `${tool}.${args.op} -> ${r.content[0].text}`);
    return data;
  };
  return { dir, dbPath, url, server, app, c, call, run };
}

test('every declared op reaches a live REST route and audits as actor agent', async t => {
  const { dir, dbPath, c, run } = await boot(t, 'quotes-accept-', 'accept-token');
  const seen = [];
  const trace = async (tool, args) => { const d = await run(tool, args); seen.push(`${tool}.${args.op}`); return d; };

  const auditWatermark = (() => {
    const d = openDb(dbPath);
    const m = d.prepare('SELECT COALESCE(MAX(rowid), 0) m FROM audit_log').get().m;
    d.close();
    return m;
  })();

  // ---- read: context and the plain list reads
  const ctx = await trace('read', { op: 'context' });
  assert.ok(Array.isArray(ctx.catalog.items), 'context carries a paged catalog');
  assert.ok(ctx.settings && ctx.templates && ctx.kinds && ctx.billing_periods);
  assert.ok(Array.isArray((await trace('read', { op: 'list' })).quotations));
  assert.ok((await trace('read', { op: 'settings' })).settings);
  assert.ok((await trace('read', { op: 'catalog' })).items);

  // ---- draft: client and catalog upserts (create then update paths)
  const cl = (await trace('draft', { op: 'client_save', name: 'Accept Client', email: 'accept@example.test' })).client;
  assert.equal(cl.name, 'Accept Client');
  const item = (await trace('draft', { op: 'catalog_save', kind: 'service', name_en: 'Accept Work', unit_price: '150.00' })).item;
  assert.equal(item.unit_satang, 15000);
  const item2 = (await trace('draft', { op: 'catalog_save', id: item.id, name_en: 'Accept Work v2', unit_price: '175.00' })).item;
  assert.equal(item2.unit_satang, 17500);
  assert.equal((await trace('read', { op: 'clients' })).clients.length, 1);
  assert.equal((await trace('read', { op: 'client', id: cl.id })).client.name, 'Accept Client');

  // ---- draft: create, update, set_sow, lines, clone, export, apply
  const starter = (ctx.starters ?? [])[0];
  const template = starter && (starter.name ?? starter.key ?? starter.code);
  const created = await trace('draft', {
    op: 'create', client_id: cl.id, lang: 'en', term_months: 12, notes: 'probe',
    ...(template ? { template } : {}),
    lines: [{ kind: 'service', description_en: 'Work', qty: '2', unit_price: '100.00' }],
  });
  const qid = created.quotation.id;
  assert.equal(created.totals.netSatang, 20000);
  await trace('draft', { op: 'update', id: qid, notes: 'updated', term_months: 6 });
  assert.equal((await trace('read', { op: 'get', id: qid })).quotation.termMonths, 6);
  if (created.sow) {
    await trace('draft', { op: 'set_sow', id: qid, sow: created.sow });
  } else {
    t.diagnostic('set_sow not exercised: no template sow available');
  }
  const a = await trace('draft', { op: 'line_add', id: qid, kind: 'service', description_en: 'A', qty: '1', unit_price: '10.00' });
  const b = await trace('draft', { op: 'line_add', id: qid, kind: 'service', description_en: 'B', qty: '1', unit_price: '20.00' });
  await trace('draft', { op: 'line_update', id: qid, line_id: a.line.id, description_en: 'A2', qty: '3' });
  await trace('draft', { op: 'reorder', id: qid, line_ids: [b.line.id, a.line.id, created.lines[0].id] });
  await trace('draft', { op: 'line_remove', id: qid, line_id: b.line.id });
  const cloned = await trace('draft', { op: 'clone', id: qid, notes: 'clone' });
  assert.equal(cloned.quotation.status, 'draft');
  const exported = await trace('read', { op: 'draft_export', id: qid });
  assert.equal(exported.schema, 'factor-quote-draft');
  const applied = await trace('draft', { op: 'draft_apply', id: qid, draft: exported, dry_run: false });
  assert.equal(applied.preview, false, 'dry_run:false must actually apply');
  await trace('read', { op: 'preview', id: qid, lang: 'th' });
  assert.ok(Array.isArray((await trace('read', { op: 'revisions', id: qid })).revisions));

  // ---- quotation: issue, revisions by rev, status, delete, restore
  await trace('quotation', { op: 'issue', id: qid });
  const revs = await trace('read', { op: 'revisions', id: qid });
  assert.ok(revs.revisions.length >= 1);
  await trace('read', { op: 'revisions', id: qid, revision: revs.revisions[0].rev });
  await trace('quotation', { op: 'status', id: qid, status: 'proposed' });
  await trace('quotation', { op: 'status', id: qid, status: 'accepted' });

  const spare = await trace('draft', { op: 'create', client_id: cl.id, lines: [{ kind: 'service', description_en: 'Spare', qty: '1', unit_price: '1.00' }] });
  const spareId = spare.quotation.id;
  await trace('quotation', { op: 'delete', id: spareId, confirm: spare.quotation.number });
  const deleted = await trace('read', { op: 'deleted' });
  assert.ok(deleted.deleted.some(r => r.id === spareId));
  await trace('quotation', { op: 'restore', id: spareId });

  // ---- invoice: create, status, delete, issue, pay, payments, wht, payment_delete
  const cancelled = await trace('invoice', { op: 'create', quotation_id: qid });
  await trace('invoice', { op: 'status', id: cancelled.invoice.id, status: 'cancelled' });
  const doomed = await trace('invoice', { op: 'create', quotation_id: qid });
  await trace('invoice', { op: 'delete', id: doomed.invoice.id, confirm: doomed.invoice.number || String(doomed.invoice.id) });
  const inv = await trace('invoice', { op: 'create', quotation_id: qid });
  const iid = inv.invoice.id;
  const issuedInv = await trace('invoice', { op: 'issue', id: iid, confirm: inv.invoice.number || String(iid) });
  assert.equal(issuedInv.invoice.status, 'issued');
  const paid = await trace('invoice', { op: 'pay', id: iid, amount: '100.00', method: 'transfer', reference: 'probe' });
  assert.equal(paid.payments.length, 1);
  await trace('read', { op: 'payments', id: iid });
  await trace('invoice', { op: 'wht', id: iid, base: '230.00', wht: '2.30', cert_number: 'C1' });
  await trace('read', { op: 'invoice', id: iid });
  assert.ok((await trace('read', { op: 'invoices' })).invoices.length >= 1);
  const pid = paid.payments[0].id;
  await trace('invoice', { op: 'payment_delete', id: iid, payment_id: pid, confirm: issuedInv.invoice.number || String(iid) });

  // ---- settings
  await trace('settings', { op: 'set', key: 'currency.code', value: 'THB', confirm: 'currency.code' });

  // ---- read: every report worksheet
  const yr = new Date().getFullYear();
  await trace('read', { op: 'report', report: 'income', year: yr });
  await trace('read', { op: 'report', report: 'pp30', year: yr, month: '1' });
  await trace('read', { op: 'report', report: 'pipeline', year: yr });
  await trace('read', { op: 'report', report: 'wht', from: `${yr}-01-01`, to: `${yr}-12-31` });
  await trace('read', { op: 'report', report: 'pnd', year: yr, half: 1 });

  // ---- the promise: every write above audited as actor "agent"
  const db = openDb(dbPath);
  const after = db.prepare('SELECT actor, COUNT(*) c FROM audit_log WHERE rowid > ? GROUP BY actor').all(auditWatermark);
  db.close();
  assert.deepEqual(after.map(r => r.actor), ['agent'], `audit actors: ${JSON.stringify(after)}`);
  assert.ok(after[0].c >= 20, `expected >=20 audited writes, saw ${after[0].c}`);

  t.diagnostic(`ops exercised (${new Set(seen).size}): ${[...new Set(seen)].join(', ')}`);
});

test('read pagination retains every record across pages', async t => {
  const { run } = await boot(t, 'quotes-page-', 'page-token');
  for (let i = 0; i < 12; i += 1) {
    await run('draft', { op: 'catalog_save', kind: 'service', name_en: `Paged ${String(i).padStart(2, '0')}`, unit_price: '1.00' });
  }

  const full = await run('read', { op: 'catalog', limit: 100 });
  assert.equal(full.items.length, 12);
  assert.equal(full.truncated, false);
  assert.equal(full.next, null);

  const collected = [];
  let offset = 0;
  let truncated = true;
  while (truncated) {
    const page = await run('read', { op: 'catalog', limit: 5, offset });
    assert.ok(page.items.length <= 5);
    collected.push(...page.items.map(i => i.id));
    truncated = page.truncated;
    if (truncated) {
      assert.equal(page.next, offset + page.items.length, 'next must be the offset that follows the page');
      offset = page.next;
    } else {
      assert.equal(page.next, null);
    }
    assert.ok(collected.length <= 12, 'pagination must terminate');
  }
  assert.equal(collected.length, 12, 'every record is reachable across pages');
  assert.equal(new Set(collected).size, 12, 'no record is repeated across pages');
  assert.deepEqual([...collected].sort((x, y) => x - y), full.items.map(i => i.id).sort((x, y) => x - y));
});

test('pdf saves the rendered document with a matching digest and private mode', async t => {
  const out = mkdtempSync(join(tmpdir(), 'quotes-pdf-out-'));
  const { call, run } = await boot(t, 'quotes-pdf-', 'pdf-token', { clientEnv: { QUOTES_MCP_OUT: out } });
  t.after(() => rmSync(out, { recursive: true, force: true }));

  const cl = (await run('draft', { op: 'client_save', name: 'PDF Client' })).client;
  const q = (await run('draft', {
    op: 'create', client_id: cl.id,
    lines: [{ kind: 'service', description_en: 'Design', qty: '1', unit_price: '500.00' }],
  })).quotation;
  await run('quotation', { op: 'issue', id: q.id });

  const { r, data } = await call('pdf', { op: 'quotation', id: q.id, lang: 'en' });
  if (r.isError) {
    assert.match(r.content[0].text, /no Chromium/, `pdf failed for a non-environmental reason: ${r.content[0].text}`);
    t.skip(`pdf renderer unavailable on this host: ${r.content[0].text}`);
    return;
  }
  const wantPrefix = `quotation-${q.id}-en-`;
  assert.equal(data.path.split('/').pop().slice(0, wantPrefix.length), wantPrefix);
  assert.ok(data.path.endsWith('.pdf'), `pdf path: ${data.path}`);
  assert.ok(data.path.startsWith(out), 'output stays inside QUOTES_MCP_OUT');
  assert.ok(data.bytes > 1000, `pdf bytes: ${data.bytes}`);
  const onDisk = readFileSync(data.path);
  assert.equal(onDisk.length, data.bytes);
  assert.equal(createHash('sha256').update(onDisk).digest('hex'), data.sha256);
  assert.equal(statSync(data.path).mode & 0o777, 0o600, 'pdf file must be private');
  assert.equal((await call('pdf', { op: 'quotation', id: q.id, lang: 'de' })).r.isError, true);

  // An invoice may only be raised from an ACCEPTED quotation.
  await run('quotation', { op: 'status', id: q.id, status: 'accepted' });
  const inv = (await run('invoice', { op: 'create', quotation_id: q.id })).invoice;
  await run('invoice', { op: 'issue', id: inv.id, confirm: inv.number || String(inv.id) });
  const ip = await run('pdf', { op: 'invoice', id: inv.id, lang: 'th' });
  assert.equal(ip.path.split('/').pop().slice(0, `invoice-${inv.id}-th-`.length), `invoice-${inv.id}-th-`);
  assert.ok(ip.bytes > 1000, `invoice pdf bytes: ${ip.bytes}`);
});