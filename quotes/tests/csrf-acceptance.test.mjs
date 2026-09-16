// PEER ACCEPTANCE TEST (slave_peer, verify-ship) — not master-authored.
// Proves the tailscale lane is ambient (IP-only) and therefore accepts
// cross-site browser writes. Delete or fold into api.test.mjs once fixed.
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../server.mjs';

function fakeReq({ method = 'GET', url = '/', headers = {}, remote = '127.0.0.1', body = {} } = {}) {
  return { method, url, headers, body, socket: { remoteAddress: remote } };
}
function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.writeHead = (code, h) => { res.statusCode = code; Object.assign(res.headers, h ?? {}); return res; };
  res.end = (chunk) => { res.body += chunk ?? ''; return res; };
  return res;
}

const tailEnv = {
  QUOTES_DB_PATH: ':memory:',
  QUOTES_AUTH_MODE: 'tailscale',
  QUOTES_ALLOWED_EMAILS: 'real@factor-io.com',
};
const whois = { tailnetWhoisImpl: async () => 'real@factor-io.com' };

describe('tailscale mode cross-site writes', () => {
  test('a cross-site POST from an allowlisted tailnet browser must NOT mutate', async () => {
    const app = createApp(tailEnv, whois);
    try {
      const res = fakeRes();
      await app.handle(fakeReq({
        method: 'POST', url: '/api/clients', remote: '100.83.80.43',
        headers: { 'sec-fetch-site': 'cross-site', 'content-type': 'text/plain;charset=UTF-8' },
        body: { name: 'CSRF Client' },
      }), res);
      assert.equal(res.statusCode, 403, `expected 403, got ${res.statusCode}: ${res.body}`);
    } finally { app.close(); }
  });

  test('the same-origin POST from the app itself still succeeds', async () => {
    const app = createApp(tailEnv, whois);
    try {
      const res = fakeRes();
      await app.handle(fakeReq({
        method: 'POST', url: '/api/clients', remote: '100.83.80.43',
        headers: { 'sec-fetch-site': 'same-origin' },
        body: { name: 'Legit Client' },
      }), res);
      assert.equal(res.statusCode, 201, `expected 201, got ${res.statusCode}: ${res.body}`);
    } finally { app.close(); }
  });
});