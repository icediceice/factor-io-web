import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { createApp } from '../server.mjs';

const script = new URL('../mcp.mjs', import.meta.url).pathname;
function client(env) {
  const child = spawn(process.execPath, [script], { env: { ...process.env, ...env }, stdio: ['pipe','pipe','pipe'] });
  const pending = new Map(); let next = 0; const lines = [];
  createInterface({ input: child.stdout }).on('line', line => {
    const msg = JSON.parse(line); lines.push(msg);
    if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const rpc = (method, params) => new Promise(resolve => { const id = ++next; pending.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc:'2.0', id, method, params }) + '\n'); });
  const tool = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result;
  return { child, rpc, tool, lines };
}

test('MCP protocol and quotation lifecycle through authenticated HTTP', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'quotes-mcp-test-'));
  const app = createApp({ QUOTES_AGENT_TOKEN: 'test-token', QUOTES_DB_PATH: join(dir, 'test.db') });
  const server = createServer(app.handle); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); app.close(); rmSync(dir, { recursive:true, force:true }); });
  const c = client({ QUOTES_URL: url, QUOTES_AGENT_TOKEN:'test-token' });
  t.after(() => { if (!c.child.killed) c.child.kill(); });
  assert.equal((await c.rpc('server/discover')).error.code, -32601);
  assert.equal((await c.rpc('unknown')).error.code, -32601);
  assert.equal((await c.rpc('initialize', { protocolVersion:'2025-06-18' })).result.protocolVersion, '2025-06-18');
  c.child.stdin.write(JSON.stringify({ jsonrpc:'2.0', method:'notifications/initialized' }) + '\n');
  const tools = (await c.rpc('tools/list')).result.tools;
  assert.equal(tools.length, 6);
  assert.ok(tools.every(x => x.inputSchema.type === 'object' && !JSON.stringify(x.inputSchema).includes('oneOf')));
  assert.equal(c.lines.length, 4);
  const run = async (name, args) => { const result = await c.tool(name, args); assert.equal(result.isError, false, result.content[0].text); return result.structuredContent; };
  const settings = (await run('read', { op:'settings' })).settings;
  const key = Object.keys(settings)[0];
  await run('settings', { op:'set', key, value:'test value', confirm:key });
  assert.equal((await run('read', { op:'settings' })).settings[key], 'test value');
  assert.equal((await c.tool('settings', { op:'set', key:'currency.cod', value:'oops', confirm:'currency.cod' })).isError, true);
  assert.equal(Object.hasOwn((await run('read', { op:'settings' })).settings, 'currency.cod'), false);
  const clientRow = (await run('draft', { op:'client_save', name:'MCP Test' })).client;
  const q = (await run('draft', { op:'create', client_id:clientRow.id, term_months:12 })).quotation;
  const first = await run('draft', { op:'line_add', id:q.id, kind:'service', description_en:'Work', qty:'2', unit_price:'100.00' });
  const second = await run('draft', { op:'line_add', id:q.id, kind:'service', description_en:'More', qty:'1', unit_price:'10.00' });
  await run('draft', { op:'reorder', id:q.id, line_ids:[second.line.id, first.line.id] });
  const doc = await run('read', { op:'get', id:q.id });
  assert.equal(doc.lines[0].descriptionEn, 'More');
  assert.equal(doc.totals.netSatang, 21000);
  const exported = await run('read', { op:'draft_export', id:q.id });
  assert.equal((await run('draft', { op:'draft_apply', id:q.id, draft:exported })).preview, true);
  assert.equal((await c.tool('draft', { op:'line_add', id:q.id, qty:1.5 })).isError, true);
  assert.equal((await c.tool('quotation', { op:'delete', id:q.id })).isError, true);
  assert.equal((await c.tool('quotation', { op:'delete', id:q.id, confirm:'wrong' })).isError, true);
  await run('quotation', { op:'issue', id:q.id });
  await run('quotation', { op:'status', id:q.id, status:'proposed' });
  await run('quotation', { op:'status', id:q.id, status:'accepted' });
  const invoice = await run('invoice', { op:'create', quotation_id:q.id });
  assert.equal(invoice.invoice.status, 'draft');
  assert.equal((await c.tool('invoice', { op:'delete', id:invoice.invoice.id, confirm:'wrong' })).isError, true);
  await run('invoice', { op:'delete', id:invoice.invoice.id, confirm:invoice.invoice.number || String(invoice.invoice.id) });
  await run('quotation', { op:'delete', id:q.id, confirm:q.number });
  const exited = once(c.child, 'exit'); c.child.stdin.end(); assert.equal((await exited)[0], 0);
  const envFile = join(dir, '.env'); writeFileSync(envFile, 'QUOTES_AGENT_TOKEN=test-token\n');
  const fallback = client({ QUOTES_URL:url, QUOTES_AGENT_TOKEN:'', QUOTES_ENV_FILE:envFile });
  assert.equal((await fallback.tool('read', { op:'settings' })).isError, false);
  const ended = once(fallback.child, 'exit'); fallback.child.stdin.end(); await ended;
  const bad = client({ QUOTES_URL:url, QUOTES_AGENT_TOKEN:'bad' });
  assert.equal((await bad.tool('read', { op:'settings' })).isError, true);
  const badEnded = once(bad.child, 'exit'); bad.child.stdin.end(); await badEnded;
  const halfClosed = client({ QUOTES_URL:url, QUOTES_AGENT_TOKEN:'test-token' });
  const response = halfClosed.tool('read', { op:'settings' });
  const halfClosedExit = once(halfClosed.child, 'exit');
  halfClosed.child.stdin.end();
  assert.equal((await response).isError, false);
  assert.equal((await halfClosedExit)[0], 0);
  // Spawn asynchronously: the HTTP server runs in this process and must service the request.
  for (const [credential, expected] of [['test-token', 0], ['bad', 1]]) {
    const proc = spawn(process.execPath, [script, '--selftest'], { env:{ ...process.env, QUOTES_URL:url, QUOTES_AGENT_TOKEN:credential } });
    let out = ''; proc.stdout.on('data', chunk => { out += chunk; });
    const [code] = await once(proc, 'exit'); assert.equal(code, expected); assert.match(out, expected ? /selftest failed 401/ : /selftest ok 200/);
  }
});