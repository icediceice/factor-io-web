// quotes/tests/rebind-acceptance.test.mjs — ACCEPTANCE TEST authored by the
// verify-ship peer to pin the one promise the tailnet perimeter does not yet
// keep: Host-header provenance.
//
// The shipped guard in server.mjs:actorFor compares Origin against
// `http://${req.headers.host}`. Both halves of that comparison come from the
// same attacker-controlled request, so it is a self-consistency check, not an
// identity check. A DNS-rebinding page (served from http://evil.example:8787,
// whose name then re-resolves to light-worker's 100.x address) sends a
// CONSISTENT Origin/Host pair, is same-origin by the browser's own reckoning,
// and can set application/json without a preflight — so every shipped gate
// admits it while the socket peer is still the operator's real tailnet address.
//
// CASE 1 is expected RED until a Host allowlist lands. CASE 2 pins the
// legitimate hosts so the fix cannot be over-tight.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';

const TAIL_ENV = {
  QUOTES_DB_PATH: ':memory:',
  QUOTES_AUTH_MODE: 'tailscale',
  QUOTES_ALLOWED_EMAILS: 'real@factor-io.com',
  QUOTES_ALLOWED_HOSTS: 'quotes.factor-io.com:8787,100.111.93.20:8787,127.0.0.1:8787',
};

function fakeReq({ method = 'POST', url = '/api/clients', headers = {}, remote = '100.83.80.43', body = {} } = {}) {
  return { method, url, headers, body, socket: { remoteAddress: remote } };
}

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.writeHead = (status, headers) => { res.statusCode = status; Object.assign(res.headers, headers ?? {}); return res; };
  res.end = (data) => { res.body = String(data ?? ''); return res; };
  return res;
}

// A write that is same-origin and JSON by the browser's own reckoning, from the
// operator's real tailnet socket — the only thing wrong with it is the NAME the
// browser was pointed at.
function rebindWrite(host) {
  return fakeReq({
    headers: {
      'sec-fetch-site': 'same-origin',
      origin: `http://${host}`,
      host,
      'content-type': 'application/json',
    },
    body: { name: 'Rebound Client' },
  });
}

describe('tailnet perimeter — Host provenance', () => {
  test('CASE 1 rejects a rebound foreign hostname whose Origin agrees with its Host', async () => {
    const app = createApp(TAIL_ENV, { tailnetWhoisImpl: async () => 'real@factor-io.com' });
    try {
      const res = fakeRes();
      await app.handle(rebindWrite('evil.example:8787'), res);
      assert.equal(res.statusCode, 403, 'a rebound hostname must not reach the API as the operator');
    } finally { app.close(); }
  });

  test('CASE 2 still admits the documented tailnet hostname and bind addresses', async () => {
    for (const host of ['quotes.factor-io.com:8787', '100.111.93.20:8787']) {
      const app = createApp(TAIL_ENV, { tailnetWhoisImpl: async () => 'real@factor-io.com' });
      try {
        const res = fakeRes();
        await app.handle(rebindWrite(host), res);
        assert.equal(res.statusCode, 201, `${host} is a legitimate perimeter host and must still work`);
      } finally { app.close(); }
    }
  });
});