// quotes/tests/api.test.mjs — REST surface against an in-memory database:
// both auth lanes, the audit trail on every mutation, unauthenticated rejects.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../lib/db.mjs';
import { createApi } from '../api.mjs';
import { bindAddresses, createApp } from '../server.mjs';

function boot() {
  const db = openDb(':memory:');
  const route = createApi(db);
  const call = (method, path, { body = {}, actor = 'op@factor-io.com', query = {} } = {}) =>
    route({ method, path, body, actor, query });
  return { db, call };
}

describe('settings API', () => {
  test('PUT updates a rate and GET reflects it; audit row names the actor', async () => {
    const { db, call } = boot();
    const r = await call('PUT', '/settings', { body: { settings: { 'vat.rate_percent': '8' } } });
    assert.equal(r.status, 200);
    const g = await call('GET', '/settings');
    assert.equal(JSON.parse(g.body).settings['vat.rate_percent'], '8');
    const row = db.prepare("SELECT actor, action FROM audit_log WHERE entity='settings' ORDER BY id DESC").get();
    assert.equal(row.actor, 'op@factor-io.com');
    assert.equal(row.action, 'settings.update');
  });

  test('settings PUT refuses non-string values and logs nothing', async () => {
    const { db, call } = boot();
    const r = await call('PUT', '/settings', { body: { settings: { 'vat.rate_percent': { pct: 7 } } } });
    assert.equal(r.status, 400);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM audit_log').get().c, 0);
  });
});

describe('clients + catalog', () => {
  test('client lifecycle: create, read, update, delete', async () => {
    const { call } = boot();
    const c = await call('POST', '/clients', { body: { name: 'Acme Ltd', tax_id: '0105558000000' } });
    assert.equal(c.status, 201);
    const id = JSON.parse(c.body).client.id;
    assert.equal((await call('GET', `/clients/${id}`)).status, 200);
    const u = await call('PUT', `/clients/${id}`, { body: { name: 'Acme Corporation' } });
    assert.equal(JSON.parse(u.body).client.name, 'Acme Corporation');
    assert.equal((await call('DELETE', `/clients/${id}`)).status, 200);
    assert.equal((await call('GET', `/clients/${id}`)).status, 404);
  });

  test('catalog accepts satang int or price string, refuses floats and duals', async () => {
    const { call } = boot();
    const a = await call('POST', '/catalog', { body: { kind: 'service', name_en: 'Advisory', unit: 'day', unit_price: '35000.00' } });
    assert.equal(JSON.parse(a.body).item.unit_satang, 3500000);
    const b = await call('POST', '/catalog', { body: { kind: 'hardware', name_en: 'Server', unit: 'unit', unit_satang: 12500000 } });
    assert.equal(JSON.parse(b.body).item.unit_satang, 12500000);
    const f = await call('POST', '/catalog', { body: { kind: 'service', name_en: 'x', unit_price: 35000.5 } });
    assert.equal(f.status, 400);
    const d = await call('POST', '/catalog', { body: { kind: 'service', name_en: 'x', unit_price: '1', unit_satang: 100 } });
    assert.equal(d.status, 400);
  });
});

describe('quotation flow', () => {
  test('create -> add lines -> totals -> issue snapshots; audit rows on every mutation', async () => {
    const { db, call } = boot();
    const client = JSON.parse((await call('POST', '/clients', { body: { name: 'Acme' } })).body).client;
    const q = JSON.parse((await call('POST', '/quotations', { body: { client_id: client.id } })).body).quotation;
    assert.match(q.number, /^QT-\d{6}-\d{4}$/);
    assert.equal(q.status, 'draft');

    await call('POST', `/quotations/${q.id}/lines`, { body: { kind: 'service', description_en: 'Discovery', qty: '3', unit_price: '35000.00' } });
    const withHalf = await call('POST', `/quotations/${q.id}/lines`, {
      body: { kind: 'service', description_en: 'Workshop', qty: '0.5', unit_price: '35000.00' },
    });
    assert.equal(withHalf.status, 201);
    const doc = JSON.parse(withHalf.body); // envelope: quotation / totals / lines
    assert.equal(doc.totals.subtotalSatang, 12250000);  // 105000 + 17500 THB
    assert.equal(doc.totals.vatSatang, 857500);         // 7%
    assert.equal(doc.totals.grandSatang, 13107500);
    assert.equal(doc.lines.length, 2);
    assert.equal(doc.lines[1].qtyMilli, 500);           // 0.5-day half-day line

    const issue = await call('POST', `/quotations/${q.id}/issue`);
    assert.equal(issue.status, 200);
    assert.equal(JSON.parse(issue.body).rev, 1);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM quotation_revisions').get().c, 1);

    const audits = db.prepare("SELECT actor, action FROM audit_log WHERE entity='quotation' ORDER BY id").all();
    assert.deepEqual(audits.map((a) => a.action), ['quotation.create', 'line.add', 'line.add', 'quotation.status']);
    assert.ok(audits.every((a) => a.actor === 'op@factor-io.com'));

    // An issued quotation is CORRECTABLE — this assertion used to require a
    // 400 here, back when the only answer to bad information on an issued
    // quotation was "you cannot fix it". Editing one is now the supported
    // flow; what replaces the old guarantee is that the edit makes the
    // document stale until it is re-issued, and that accepted-onwards is
    // genuinely final (both covered in the revise-in-place suite below).
    const corrected = await call('PUT', `/quotations/${q.id}`, { body: { notes: 'corrected after issue' } });
    assert.equal(corrected.status, 200);
    assert.equal(JSON.parse(corrected.body).quotation.revisionStale, true);
  });

  test('line update recalculates; discount is clamped to the line subtotal', async () => {
    const { call } = boot();
    const client = JSON.parse((await call('POST', '/clients', { body: { name: 'A' } })).body).client;
    const q = JSON.parse((await call('POST', '/quotations', { body: { client_id: client.id } })).body).quotation;
    await call('POST', `/quotations/${q.id}/lines`, { body: { kind: 'hardware', description_en: 'Box', qty: '1', unit_price: '10000.00' } });
    const u = await call('PUT', `/quotations/${q.id}/lines/1`, { body: { discount_satang: 99999999 } });
    const upd = JSON.parse(u.body); // envelope: totals at the top level
    assert.equal(upd.totals.discountSatang, 1000000); // clamped to subtotal
    assert.equal(upd.totals.netSatang, 0);
  });

  test('agent lane drives the same flow (actor "agent" in audit)', async () => {
    const { db, call } = boot();
    const client = JSON.parse((await call('POST', '/clients', { body: { name: 'A' }, actor: 'agent' })).body).client;
    const q = JSON.parse((await call('POST', '/quotations', { body: { client_id: client.id }, actor: 'agent' })).body).quotation;
    await call('POST', `/quotations/${q.id}/issue`, { actor: 'agent' });
    const audits = db.prepare('SELECT DISTINCT actor FROM audit_log').all().map((r) => ({ ...r }));
    assert.deepEqual(audits, [{ actor: 'agent' }]);
  });

  test('draft deletion removes quote + lines but never a number', async () => {
    const { db, call } = boot();
    const client = JSON.parse((await call('POST', '/clients', { body: { name: 'A' } })).body).client;
    const q = JSON.parse((await call('POST', '/quotations', { body: { client_id: client.id } })).body).quotation;
    const id = q.id;
    await call('DELETE', `/quotations/${id}`);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM quotations').get().c, 0);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM quotation_lines').get().c, 0);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM quotation_revisions').get().c, 0);
    const q2 = JSON.parse((await call('POST', '/quotations', { body: { client_id: client.id } })).body).quotation;
    assert.notEqual(q2.number, q.number); // counters never reuse a number
  });
});

describe('http auth boundary (createApp actorFor lanes)', () => {
  const env = {
    QUOTES_DB_PATH: ':memory:',
    QUOTES_AUTH_MODE: 'oauth',
    QUOTES_SESSION_SECRET: 't'.repeat(48),
    QUOTES_GOOGLE_CLIENT_ID: 'cid',
    QUOTES_GOOGLE_CLIENT_SECRET: 'cs',
    QUOTES_PUBLIC_URL: 'https://quotes.factor-io.com',
    QUOTES_ALLOWED_EMAILS: 'op@factor-io.com',
    QUOTES_AGENT_TOKEN: 'agent-secret-token',
  };

  function fakeReq({ method = 'GET', url = '/', headers = {}, remote = '10.0.0.9', body = {} } = {}) {
    return { method, url, headers, body, socket: { remoteAddress: remote } };
  }
  const fakeRes = () => {
    const res = { statusCode: 0, headers: {}, body: '' };
    res.writeHead = (s, h) => { res.statusCode = s; Object.assign(res.headers, h ?? {}); };
    res.end = (b) => { res.body = b ?? ''; return res; };
    return res;
  };

  test('api path without credentials -> 401 JSON', async () => {
    const app = createApp(env);
    try {
      const res = fakeRes();
      await app.handle(fakeReq({ url: '/api/clients' }), res);
      assert.equal(res.statusCode, 401);
      assert.match(res.body, /unauthorized/);
    } finally { app.close(); }
  });

  test('api path with the agent bearer -> 200, actor "agent"', async () => {
    const app = createApp(env);
    try {
      const res = fakeRes();
      await app.handle(fakeReq({ url: '/api/healthz', headers: { authorization: 'Bearer agent-secret-token' } }), res);
      assert.equal(res.statusCode, 200);
      assert.match(res.body, /"ok": true/);
    } finally { app.close(); }
  });

  test('human cookie lane authenticates and serves the api', async () => {
    const app = createApp(env);
    try {
      const { signSession } = await import('../lib/auth.mjs');
      const token = signSession('op@factor-io.com', env.QUOTES_SESSION_SECRET, 3600);
      const res = fakeRes();
      await app.handle(fakeReq({ url: '/api/clients', headers: { cookie: `quotes_session=${token}` } }), res);
      assert.equal(res.statusCode, 200);
      assert.match(res.body, /"clients": \[\]/);
    } finally { app.close(); }
  });

  test('an allowlisted-out email with a valid cookie is still 401', async () => {
    const app = createApp(env);
    try {
      const { signSession } = await import('../lib/auth.mjs');
      const token = signSession('outsider@evil.example', env.QUOTES_SESSION_SECRET, 3600);
      const res = fakeRes();
      await app.handle(fakeReq({ url: '/api/clients', headers: { cookie: `quotes_session=${token}` } }), res);
      assert.equal(res.statusCode, 401);
    } finally { app.close(); }
  });

  test('ui path without a session redirects to /auth/login with return_to', async () => {
    const app = createApp(env);
    try {
      const res = fakeRes();
      await app.handle(fakeReq({ url: '/quotes' }), res);
      assert.equal(res.statusCode, 302);
      assert.match(res.headers.Location, /^\/auth\/login\?return_to=%2Fquotes$/);
    } finally { app.close(); }
  });

  test('tailscale mode trusts whois, not a client-supplied identity header', async () => {
    const app = createApp({
      QUOTES_DB_PATH: ':memory:', QUOTES_AUTH_MODE: 'tailscale',
      QUOTES_ALLOWED_EMAILS: 'real@factor-io.com',
    }, { tailnetWhoisImpl: async () => 'outsider@evil.example' });
    try {
      const res = fakeRes();
      await app.handle(fakeReq({
        url: '/api/clients', remote: '100.83.80.43',
        headers: { 'tailscale-user-login': 'real@factor-io.com' },
      }), res);
      assert.equal(res.statusCode, 403);
    } finally { app.close(); }
  });

  test('allowlisted tailnet whois identity is admitted and becomes the audit actor', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'quotes-tailnet-test-'));
    const dbPath = join(dir, 'quotes.db');
    const app = createApp({
      QUOTES_DB_PATH: dbPath, QUOTES_AUTH_MODE: 'tailscale',
      QUOTES_ALLOWED_EMAILS: 'real@factor-io.com',
    }, { tailnetWhoisImpl: async () => 'real@factor-io.com' });
    try {
      const res = fakeRes();
      await app.handle(fakeReq({
        method: 'POST', url: '/api/clients', remote: '100.83.80.43',
        headers: {
          'content-type': 'application/json',
          'tailscale-user-login': 'forged@evil.example',
        },
        body: { name: 'Tailnet Client' },
      }), res);
      assert.equal(res.statusCode, 201);
    } finally {
      app.close();
    }
    const check = openDb(dbPath);
    try {
      assert.equal(check.prepare('SELECT actor FROM audit_log ORDER BY id DESC LIMIT 1').get().actor, 'real@factor-io.com');
    } finally {
      check.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('tailscale mode rejects cross-site and foreign-origin writes', async () => {
    const tailEnv = {
      QUOTES_DB_PATH: ':memory:', QUOTES_AUTH_MODE: 'tailscale',
      QUOTES_ALLOWED_EMAILS: 'real@factor-io.com',
    };
    let lookups = 0;
    const app = createApp(tailEnv, { tailnetWhoisImpl: async () => { lookups++; return 'real@factor-io.com'; } });
    try {
      for (const headers of [
        { 'sec-fetch-site': 'cross-site', 'content-type': 'text/plain;charset=UTF-8' },
        {
          'sec-fetch-site': 'same-origin',
          origin: 'http://attacker.example',
          host: 'quotes.factor-io.com',
          'content-type': 'application/json',
        },
      ]) {
        const res = fakeRes();
        await app.handle(fakeReq({
          method: 'POST', url: '/api/clients', remote: '100.83.80.43',
          headers, body: { name: 'CSRF Client' },
        }), res);
        assert.equal(res.statusCode, 403);
      }
      assert.equal(lookups, 0);
    } finally { app.close(); }
  });

  test('tailscale mode admits same-origin JSON writes', async () => {
    const app = createApp({
      QUOTES_DB_PATH: ':memory:', QUOTES_AUTH_MODE: 'tailscale',
      QUOTES_ALLOWED_EMAILS: 'real@factor-io.com',
    }, { tailnetWhoisImpl: async () => 'real@factor-io.com' });
    try {
      const res = fakeRes();
      await app.handle(fakeReq({
        method: 'POST', url: '/api/clients', remote: '100.83.80.43',
        headers: {
          'sec-fetch-site': 'same-origin',
          origin: 'http://quotes.factor-io.com',
          host: 'quotes.factor-io.com',
          'content-type': 'application/json',
        },
        body: { name: 'Same-origin Client' },
      }), res);
      assert.equal(res.statusCode, 201);
    } finally { app.close(); }
  });

  test('API POST and PUT require JSON content type', async () => {
    const app = createApp({
      QUOTES_DB_PATH: ':memory:', QUOTES_AUTH_MODE: 'tailscale',
      QUOTES_ALLOWED_EMAILS: 'real@factor-io.com',
    }, { tailnetWhoisImpl: async () => 'real@factor-io.com' });
    try {
      const res = fakeRes();
      await app.handle(fakeReq({
        method: 'POST', url: '/api/clients', remote: '100.83.80.43',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        body: { name: 'Simple Request Client' },
      }), res);
      assert.equal(res.statusCode, 415);
      assert.match(res.body, /application\/json/);
    } finally { app.close(); }
  });

  test('agent bearer bypasses browser provenance checks in tailscale mode', async () => {
    const app = createApp({
      QUOTES_DB_PATH: ':memory:', QUOTES_AUTH_MODE: 'tailscale',
      QUOTES_ALLOWED_EMAILS: 'real@factor-io.com', QUOTES_AGENT_TOKEN: 'agent-secret-token',
    }, { tailnetWhoisImpl: async () => { throw new Error('bearer request must not call whois'); } });
    try {
      const res = fakeRes();
      await app.handle(fakeReq({
        method: 'POST', url: '/api/clients', remote: '127.0.0.1',
        headers: {
          authorization: 'Bearer agent-secret-token',
          'sec-fetch-site': 'cross-site',
          origin: 'http://attacker.example',
          'content-type': 'application/json',
        },
        body: { name: 'Agent Client' },
      }), res);
      assert.equal(res.statusCode, 201);
    } finally { app.close(); }
  });

  test('non-tailnet peers and failed whois are refused with 403', async () => {
    const tailEnv = {
      QUOTES_DB_PATH: ':memory:', QUOTES_AUTH_MODE: 'tailscale',
      QUOTES_ALLOWED_EMAILS: 'real@factor-io.com',
    };
    for (const [remote, lookup] of [['10.0.0.9', async () => 'real@factor-io.com'], ['100.83.80.43', async () => '']]) {
      const app = createApp(tailEnv, { tailnetWhoisImpl: lookup });
      try {
        const res = fakeRes();
        await app.handle(fakeReq({ url: '/api/clients', remote }), res);
        assert.equal(res.statusCode, 403);
      } finally { app.close(); }
    }
  });

  test('tailscale mode disables OAuth routes and reports auth mode on health', async () => {
    const app = createApp({
      QUOTES_DB_PATH: ':memory:', QUOTES_AUTH_MODE: 'tailscale',
      QUOTES_ALLOWED_EMAILS: 'real@factor-io.com',
    });
    try {
      for (const url of ['/auth/login', '/auth/callback', '/auth/logout']) {
        const res = fakeRes();
        await app.handle(fakeReq({ url, remote: '100.83.80.43' }), res);
        assert.equal(res.statusCode, 404);
        assert.match(res.body, /handled by the tailnet/);
      }
      const health = fakeRes();
      await app.handle(fakeReq({ url: '/healthz' }), health);
      assert.equal(JSON.parse(health.body).authMode, 'tailscale');
    } finally { app.close(); }
  });

  test('listener binds accept only loopback and tailnet addresses', () => {
    assert.deepEqual(bindAddresses('127.0.0.1, 100.111.93.20,127.0.0.1'), ['127.0.0.1', '100.111.93.20']);
    assert.throws(() => bindAddresses('0.0.0.0'), /neither loopback nor tailnet/);
    assert.throws(() => bindAddresses('192.168.1.100'), /neither loopback nor tailnet/);
  });
});

describe('the line vocabulary is data, not code', () => {
  test('GET /line-kinds publishes the list the server validates against', async () => {
    const { call } = boot();
    const r = await call('GET', '/line-kinds');
    assert.equal(r.status, 200);
    const v = JSON.parse(r.body);
    const codes = v.kinds.map((k) => k.code);
    // The seeded vocabulary keeps the original pair and adds the rest.
    for (const c of ['service', 'hardware', 'software', 'license', 'subscription',
                     'support', 'training', 'cloud', 'expense']) {
      assert.ok(codes.includes(c), `missing kind ${c}`);
    }
    // Every entry must be usable as a label in both languages.
    for (const k of v.kinds) { assert.equal(typeof k.en, 'string'); assert.equal(typeof k.th, 'string'); }
    assert.deepEqual(v.billing_periods.map((p) => p.code), ['once', 'monthly', 'quarterly', 'yearly']);
  });

  test('a kind added to the setting is accepted WITHOUT a code change', async () => {
    const { call } = boot();
    const current = JSON.parse(JSON.parse((await call('GET', '/settings')).body).settings['line.kinds']);
    current.push({ code: 'datacenter', en: 'Datacenter', th: 'ศูนย์ข้อมูล' });
    await call('PUT', '/settings', { body: { settings: { 'line.kinds': JSON.stringify(current) } } });
    const r = await call('POST', '/catalog', { body: { kind: 'datacenter', name_en: 'Rack space', unit_price: '9000.00' } });
    assert.equal(r.status, 201);
    assert.equal(JSON.parse(r.body).item.kind, 'datacenter');
  });

  test('an unknown kind is REFUSED, never coerced to service', async () => {
    const { call } = boot();
    // This silently rewrote the kind to 'service' before the vocabulary opened
    // up, which corrupted the row without any error reaching the operator.
    const r = await call('POST', '/catalog', { body: { kind: 'nonsense', name_en: 'x', unit_price: '1.00' } });
    assert.equal(r.status, 400);
    const c = await call('POST', '/catalog', { body: { kind: 'service', name_en: 'y', unit_price: '1.00' } });
    const id = JSON.parse(c.body).item.id;
    const u = await call('PUT', `/catalog/${id}`, { body: { kind: 'nonsense' } });
    assert.equal(u.status, 400);
    assert.equal(JSON.parse((await call('GET', `/catalog/${id}`)).body).item.kind, 'service');
  });

  test('the default unit follows the kind and the period instead of always being a day', async () => {
    const { call } = boot();
    const seen = {};
    for (const [kind, period] of [['service', 'once'], ['hardware', 'once'], ['support', 'monthly'], ['software', 'yearly']]) {
      const r = await call('POST', '/catalog', { body: { kind, billing_period: period, name_en: `${kind}-${period}`, unit_price: '1.00' } });
      seen[`${kind}/${period}`] = JSON.parse(r.body).item.unit;
    }
    assert.deepEqual(seen, {
      'service/once': 'day',       // effort is still sold by the day
      'hardware/once': 'unit',     // ...but a box is not
      'support/monthly': 'month',
      'software/yearly': 'year',
    });
  });
});

describe('billing period, section, optional and term on the API', () => {
  /** A draft quotation with a client, ready for lines. */
  async function draft(call) {
    const c = await call('POST', '/clients', { body: { name: 'Acme Ltd' } });
    const clientId = JSON.parse(c.body).client.id;
    const q = await call('POST', '/quotations', { body: { client_id: clientId } });
    return JSON.parse(q.body).quotation.id;
  }

  test('a line round-trips its period, section and optional flag', async () => {
    const { call } = boot();
    const id = await draft(call);
    const r = await call('POST', `/quotations/${id}/lines`, { body: {
      kind: 'software', billing_period: 'yearly', section: 'Software', optional: true,
      description_en: 'Platform licence', qty: '1', unit_price: '480000.00',
    } });
    assert.equal(r.status, 201);
    const line = JSON.parse(r.body).line;
    assert.equal(line.kind, 'software');
    assert.equal(line.billing_period, 'yearly');
    assert.equal(line.section, 'Software');
    assert.equal(line.optional, 1);
    assert.equal(line.unit, 'year');
  });

  test('an unknown billing period is refused', async () => {
    const { call } = boot();
    const id = await draft(call);
    const r = await call('POST', `/quotations/${id}/lines`, { body: {
      kind: 'service', billing_period: 'fortnightly',
      description_en: 'x', qty: '1', unit_price: '1.00',
    } });
    assert.equal(r.status, 400);
  });

  test("a line's kind can now be corrected on PUT instead of delete-and-re-add", async () => {
    const { call } = boot();
    const id = await draft(call);
    const a = await call('POST', `/quotations/${id}/lines`, { body: {
      kind: 'service', description_en: 'Licence, mis-typed', qty: '1', unit_price: '100.00',
    } });
    const lineId = JSON.parse(a.body).line.id;
    const u = await call('PUT', `/quotations/${id}/lines/${lineId}`, { body: { kind: 'license', optional: true } });
    assert.equal(u.status, 200);
    const line = JSON.parse(u.body).line;
    assert.equal(line.kind, 'license');
    assert.equal(line.optional, 1);
    // Untouched fields survive the merge.
    assert.equal(line.description_en, 'Licence, mis-typed');
  });

  test('term_months is validated as an integer in 0..600 and drives the contract total', async () => {
    const { call } = boot();
    const id = await draft(call);
    await call('POST', `/quotations/${id}/lines`, { body: {
      kind: 'support', billing_period: 'monthly', description_en: 'On-call', qty: '1', unit_price: '85000.00',
    } });
    assert.equal((await call('PUT', `/quotations/${id}`, { body: { term_months: 601 } })).status, 400);
    assert.equal((await call('PUT', `/quotations/${id}`, { body: { term_months: -1 } })).status, 400);
    assert.equal((await call('PUT', `/quotations/${id}`, { body: { term_months: 1.5 } })).status, 400);
    const ok = await call('PUT', `/quotations/${id}`, { body: { term_months: 36 } });
    assert.equal(ok.status, 200);
    const t = JSON.parse(ok.body).totals;
    assert.equal(t.termMonths, 36);
    assert.equal(t.recurringSatang.monthly, 8500000);
    assert.equal(t.contractTotalSatang, 8500000 * 36);
    // The payable is still ONE cycle — the term never inflates what is owed now.
    assert.equal(t.netSatang, 8500000);
  });

  test('an optional line is priced on the document but excluded from the payable', async () => {
    const { call } = boot();
    const id = await draft(call);
    await call('POST', `/quotations/${id}/lines`, { body: {
      kind: 'hardware', description_en: 'Appliance', qty: '1', unit_price: '100000.00',
    } });
    const r = await call('POST', `/quotations/${id}/lines`, { body: {
      kind: 'training', optional: true, description_en: 'Workshop', qty: '2', unit_price: '45000.00',
    } });
    const t = JSON.parse(r.body).totals;
    assert.equal(t.netSatang, 10000000);        // the appliance only
    assert.equal(t.optionalSatang, 9000000);    // 2 x 45,000.00, reported separately
    assert.equal(t.vatSatang, 700000);          // VAT never touches an option
  });

  test('the document envelope carries the labels the renderer needs', async () => {
    const { call } = boot();
    const id = await draft(call);
    await call('POST', `/quotations/${id}/lines`, { body: {
      kind: 'cloud', description_en: 'DR capacity', qty: '1', unit_price: '18000.00',
    } });
    const doc = JSON.parse((await call('GET', `/quotations/${id}`)).body);
    assert.equal(doc.kindLabels.cloud, 'Cloud');
    assert.equal(doc.lines[0].billingPeriod, 'once');
  });
});