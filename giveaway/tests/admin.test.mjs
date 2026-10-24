import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp, bindAddresses } from '../server.mjs';
import { assertProductionConfig } from '../lib/auth.mjs';
import { migratedSqlite } from '../../tests/support/d1-sqlite.mjs';

const TOKEN = 'a'.repeat(40);
const OPERATOR = 'ops@factor-io.com';
const TAILNET_PEER = '100.101.102.103';
const HOST = 'giveaway.factor-io.com:8788';
const ENV = {
  NODE_ENV: 'production',
  GIVEAWAY_ALLOWED_EMAILS: OPERATOR,
  GIVEAWAY_ALLOWED_HOSTS: `${HOST},127.0.0.1:8788`,
  GIVEAWAY_AGENT_TOKEN: TOKEN,
  GIVEAWAY_CF_API_TOKEN: 'cf-token',
  GIVEAWAY_CF_ACCOUNT_ID: 'acct',
  GIVEAWAY_D1_DATABASE_ID: 'db',
};

// The Cloudflare D1 REST API, answered by node:sqlite with the Worker's real migration.
function fakeCloudflare({ failOnCall } = {}) {
  const db = migratedSqlite();
  const calls = [];
  const fetchImpl = async (url, init) => {
    assert.match(String(url), /\/accounts\/acct\/d1\/database\/db\/query$/);
    assert.equal(init.headers.authorization, 'Bearer cf-token');
    const { sql, params } = JSON.parse(init.body);
    calls.push({ sql, params });
    if (calls.length === failOnCall) {
      return Response.json({ success: true, errors: [], result: [{ success: false, results: [], meta: {} }] });
    }
    try {
      const results = db.prepare(sql).all(...params).map((r) => ({ ...r }));
      const changes = Number(db.prepare('SELECT changes() AS n').get().n);
      return Response.json({ success: true, errors: [], messages: [], result: [{ success: true, results, meta: { changes } }] });
    } catch (e) {
      return Response.json({ success: false, errors: [{ code: 7500, message: e.message }], result: [] }, { status: 400 });
    }
  };
  return { db, calls, fetchImpl };
}

function harness({ env = ENV, cloudflare = fakeCloudflare(), whois = async (addr) => (addr === TAILNET_PEER ? OPERATOR : '') } = {}) {
  const app = createApp(env, { fetchImpl: cloudflare.fetchImpl, whois, log: () => {} });
  async function request(method, url, { addr = TAILNET_PEER, host = HOST, headers = {}, body } = {}) {
    const req = { method, url, headers: { host, ...headers }, socket: { remoteAddress: addr }, body };
    if (body !== undefined && !('content-type' in headers)) req.headers['content-type'] = 'application/json';
    let status;
    let resHeaders = {};
    const text = await new Promise((resolve) => {
      app.handle(req, { writeHead(s, h = {}) { status = s; resHeaders = h; }, end(b = '') { resolve(String(b)); } });
    });
    let json = null;
    try { json = JSON.parse(text); } catch { /* csv or html */ }
    return { status, headers: resHeaders, text, json };
  }
  return { request, cloudflare, db: cloudflare.db };
}

const agent = { addr: '127.0.0.1', host: '127.0.0.1:8788', headers: { authorization: `Bearer ${TOKEN}` } };

// ------------------------------------------------------------------ access --

test('an allowlisted operator on the tailnet can use the admin', async () => {
  const { request } = harness();
  const res = await request('GET', '/api/campaigns');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, []);
  assert.equal((await request('GET', '/')).status, 200);
});

test('requests from outside the tailnet are refused, even with a forged identity header', async () => {
  const { request } = harness();
  for (const addr of ['203.0.113.7', '192.168.1.20', '::ffff:8.8.8.8']) {
    const res = await request('GET', '/api/campaigns', { addr, headers: { 'tailscale-user-login': OPERATOR } });
    assert.equal(res.status, 403, addr);
  }
});

test('a tailnet peer whose login is not allowlisted, or whose whois lookup fails, is refused', async () => {
  const stranger = harness({ whois: async () => 'stranger@example.com' });
  assert.equal((await stranger.request('GET', '/api/campaigns', { headers: { 'tailscale-user-login': OPERATOR } })).status, 403);
  const broken = harness({ whois: async () => '' });
  assert.equal((await broken.request('GET', '/api/campaigns')).status, 403);
});

test('every path, health check included, refuses a Host that is not allowlisted', async () => {
  const { request } = harness();
  for (const path of ['/healthz', '/', '/api/campaigns']) {
    assert.equal((await request('GET', path, { host: 'evil.example.com' })).status, 403, path);
  }
  assert.equal((await request('GET', '/healthz')).status, 200);
});

test('a browser on another site cannot make the operator change anything', async () => {
  const { request, db } = harness();
  const body = { id: 'x' };
  assert.equal((await request('POST', '/api/campaigns', { body, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await request('POST', '/api/campaigns', { body, headers: { origin: 'http://evil.example.com' } })).status, 403);
  assert.equal((await request('POST', '/api/campaigns', { body, headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM campaigns').get().n, 0);
  assert.equal((await request('POST', '/api/campaigns', { body, headers: { origin: `http://${HOST}` } })).status, 201);
});

test('the agent token works only from light-worker itself, never from another tailnet device', async () => {
  const { request } = harness();
  assert.equal((await request('GET', '/api/stats', agent)).status, 200);
  assert.equal((await request('GET', '/api/stats', { ...agent, headers: { authorization: 'Bearer wrong' } })).status, 401);
  const fromPeer = await request('GET', '/api/stats', { addr: TAILNET_PEER, headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal(fromPeer.status, 403);
});

test('production refuses to start half-configured', async () => {
  const whoisUp = async () => true;
  await assert.doesNotReject(assertProductionConfig(ENV, { whoisAvailableImpl: whoisUp }));
  for (const key of ['GIVEAWAY_ALLOWED_EMAILS', 'GIVEAWAY_ALLOWED_HOSTS', 'GIVEAWAY_AGENT_TOKEN', 'GIVEAWAY_CF_API_TOKEN', 'GIVEAWAY_D1_DATABASE_ID']) {
    await assert.rejects(assertProductionConfig({ ...ENV, [key]: '' }, { whoisAvailableImpl: whoisUp }), new RegExp(key), key);
  }
  await assert.rejects(assertProductionConfig(ENV, { whoisAvailableImpl: async () => false }), /Tailscale whois/);
});

test('the admin binds only to loopback and tailnet addresses', () => {
  assert.deepEqual(bindAddresses('127.0.0.1,100.111.93.20'), ['127.0.0.1', '100.111.93.20']);
  for (const bad of ['0.0.0.0', '::', '203.0.113.7', '127.0.0.1,0.0.0.0', '']) {
    assert.throws(() => bindAddresses(bad), undefined, bad);
  }
});

test('lib/tailnet.mjs stays byte-identical to the quotes copy it was taken from', () => {
  assert.equal(readFileSync(new URL('../lib/tailnet.mjs', import.meta.url), 'utf8'), readFileSync(new URL('../../quotes/lib/tailnet.mjs', import.meta.url), 'utf8'));
});

// --------------------------------------------------------------- campaigns --

test('a new campaign gets its public /free link, and can be capped, paused and ended', async () => {
  const { request } = harness();
  const created = await request('POST', '/api/campaigns', { body: { id: 'showcase', name: 'App showcase', source: 'forum', platforms: ['android'], max_claims: '50' } });
  assert.equal(created.status, 201);
  assert.equal(created.json.link, 'https://catcountdown.factor-io.com/free/showcase');
  assert.equal(created.json.max_claims, 50);
  assert.equal(created.json.status, 'active');
  assert.equal((await request('POST', '/api/campaigns', { body: { id: 'showcase' } })).status, 409);
  for (const id of ['Show Case', 'a/b', '', 'x'.repeat(65)]) {
    assert.equal((await request('POST', '/api/campaigns', { body: { id } })).status, 400, id);
  }
  const paused = await request('PATCH', '/api/campaigns/showcase', { body: { status: 'paused', max_claims: '' } });
  assert.equal(paused.json.status, 'paused');
  assert.equal(paused.json.max_claims, null);
  assert.equal((await request('PATCH', '/api/campaigns/showcase', { body: { status: 'deleted' } })).status, 400);
  assert.equal((await request('PATCH', '/api/campaigns/nope', { body: { status: 'ended' } })).status, 404);
});

// ---------------------------------------------------------------- the pool --

test('importing codes respects the 100-parameter D1 limit, skips duplicates and reports them', async () => {
  const { request, cloudflare } = harness();
  const codes = Array.from({ length: 41 }, (_, i) => `PLAY-${String(i).padStart(3, '0')}`);
  const paste = [...codes, 'PLAY-000', 'PLAY-001'].join('\n');
  const first = await request('POST', '/api/codes/import', { body: { platform: 'android', batch: 'oct', codes: paste } });
  assert.equal(first.status, 200);
  assert.deepEqual([first.json.submitted, first.json.inserted, first.json.duplicates], [43, 41, 2]);
  assert.ok(cloudflare.calls.every((c) => c.params.length <= 100));

  const again = await request('POST', '/api/codes/import', { body: { platform: 'android', codes: ['PLAY-000', 'PLAY-NEW'] } });
  assert.deepEqual([again.json.inserted, again.json.duplicates], [1, 1]);
  const stats = await request('GET', '/api/stats');
  assert.deepEqual(stats.json.find((s) => s.platform === 'android'), { platform: 'android', available: 42, issued: 0, revoked: 0, expired: 0, total: 42 });
});

test('re-importing or revoking a code someone already claimed never frees it', async () => {
  const { request, db } = harness();
  await request('POST', '/api/campaigns', { body: { id: 'showcase' } });
  await request('POST', '/api/codes/import', { body: { platform: 'android', codes: 'TAKEN\nFREE' } });
  db.prepare("UPDATE codes SET claimant = 'sub-1', email = 'a@example.com', campaign_id = 'showcase', claimed_at = 1 WHERE code = 'TAKEN'").run();

  await request('POST', '/api/codes/import', { body: { platform: 'android', batch: 'again', codes: 'TAKEN' } });
  const revoked = await request('POST', '/api/codes/revoke', { body: { platform: 'android', codes: ['TAKEN', 'FREE', 'UNKNOWN'] } });
  assert.deepEqual([revoked.json.submitted, revoked.json.revoked], [3, 2]);
  const taken = db.prepare("SELECT claimant, campaign_id, batch, revoked FROM codes WHERE code = 'TAKEN'").get();
  assert.deepEqual({ ...taken }, { claimant: 'sub-1', campaign_id: 'showcase', batch: '', revoked: 1 });
  const stats = (await request('GET', '/api/stats')).json.find((s) => s.platform === 'android');
  assert.deepEqual([stats.available, stats.issued, stats.revoked], [0, 1, 1]);
});

test('invalid imports are refused before anything is stored', async () => {
  const { request, db } = harness();
  for (const body of [{ platform: 'windows', codes: 'A' }, { platform: 'android', codes: '' }, { platform: 'android', codes: 'HAS SPACE\tTAB' + '\u0007' }, { platform: 'android', codes: 'A', expires_at: 'soon' }]) {
    assert.equal((await request('POST', '/api/codes/import', { body })).status, 400, JSON.stringify(body));
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM codes').get().n, 0);
});

test('a statement D1 reports as failed is an error, and a partial import says how far it got', async () => {
  const cloudflare = fakeCloudflare({ failOnCall: 2 });
  const { request } = harness({ cloudflare });
  const codes = Array.from({ length: 45 }, (_, i) => `C${i}`); // 20 rows per 100 parameters -> 3 statements
  const res = await request('POST', '/api/codes/import', { body: { platform: 'android', codes } });
  assert.equal(res.status, 502);
  assert.equal(res.json.inserted, 20);
  assert.equal(res.json.processed, 20);
  assert.match(res.json.error, /safe to import the same list again/);

  const retry = await harness({ cloudflare: { ...cloudflare, fetchImpl: fakeCloudflareOver(cloudflare.db) } }).request('POST', '/api/codes/import', { body: { platform: 'android', codes } });
  assert.deepEqual([retry.json.inserted, retry.json.duplicates], [25, 20]);
});

function fakeCloudflareOver(db) {
  return async (_url, init) => {
    const { sql, params } = JSON.parse(init.body);
    const results = db.prepare(sql).all(...params).map((r) => ({ ...r }));
    return Response.json({ success: true, errors: [], result: [{ success: true, results, meta: { changes: Number(db.prepare('SELECT changes() AS n').get().n) } }] });
  };
}

test('an HTTP or envelope failure from Cloudflare is shown as an error, never as success', async () => {
  for (const reply of [
    () => new Response('bad gateway', { status: 502 }),
    () => Response.json({ success: false, errors: [{ message: 'Authentication error' }], result: null }, { status: 403 }),
  ]) {
    const { request } = harness({ cloudflare: { db: migratedSqlite(), fetchImpl: async () => reply() } });
    const res = await request('GET', '/api/stats');
    assert.equal(res.status, 502);
    assert.ok(res.json.error);
  }
});

// ------------------------------------------------------------------ claims --

test('claims can be listed per campaign and downloaded as a spreadsheet-safe CSV', async () => {
  const { request, db } = harness();
  await request('POST', '/api/campaigns', { body: { id: 'showcase' } });
  await request('POST', '/api/campaigns', { body: { id: 'reddit' } });
  await request('POST', '/api/codes/import', { body: { platform: 'android', codes: 'A1\nA2' } });
  db.prepare("UPDATE codes SET claimant = 's1', email = '=HYPERLINK(\"http://x\")@evil.example', campaign_id = 'showcase', claimed_at = 1792800000 WHERE code = 'A1'").run();
  db.prepare("UPDATE codes SET claimant = 's2', email = 'b@example.com', campaign_id = 'reddit', claimed_at = 1792800100 WHERE code = 'A2'").run();

  const showcase = await request('GET', '/api/claims?campaign=showcase');
  assert.deepEqual(showcase.json.map((c) => c.code), ['A1']);
  assert.equal((await request('GET', '/api/campaigns')).json.find((c) => c.id === 'showcase').claims, 1);

  const csv = await request('GET', '/api/claims.csv');
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.headers['content-disposition'], /attachment; filename="giveaway-claims-all\.csv"/);
  const lines = csv.text.trim().split('\r\n');
  assert.equal(lines[0], '"campaign","platform","code","email","google_account","claimed"');
  assert.equal(lines.length, 3);
  assert.ok(lines.some((l) => l.includes('"\'=HYPERLINK(""http://x"")@evil.example"')), 'formula neutralised and quotes doubled');
});