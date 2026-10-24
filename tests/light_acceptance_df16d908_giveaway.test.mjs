// Quarantined verify-ship regressions for plan df16d908. Expected red until repaired.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../catcountdown/worker/src/index.js';
import { createGoogleVerifier, GOOGLE_JWKS_URL } from '../catcountdown/worker/src/giveaway.js';
import { d1Binding } from './support/d1-sqlite.mjs';

const SITE = 'https://catcountdown.factor-io.com';
const CLIENT = 'verify.apps.googleusercontent.com';
const key = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', key.publicKey), kid: 'verify-g1', alg: 'RS256' };
globalThis.fetch = async (url) => {
  assert.equal(String(url), GOOGLE_JWKS_URL);
  return Response.json({ keys: [jwk] }, { headers: { 'cache-control': 'max-age=3600' } });
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
async function credential(kid = jwk.kid) {
  const input = `${b64({ alg: 'RS256', kid })}.${b64({ iss: 'https://accounts.google.com', aud: CLIENT, sub: 'same-account', email: 'a@example.com', email_verified: true, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return input + '.' + Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, Buffer.from(input))).toString('base64url');
}
function fixture() {
  const db = d1Binding();
  db.raw.prepare("INSERT INTO campaigns (id,name,platforms,status,max_claims,created_at) VALUES ('cap','Cap','android','active',1,1)").run();
  db.raw.prepare("INSERT INTO codes (platform,code,added_at) VALUES ('android','FIRST',1),('android','SPARE',1)").run();
  return { GOOGLE_CLIENT_ID: CLIENT, GIVEAWAY_DB: db };
}
function post(env, body) {
  return worker.fetch(new Request(`${SITE}/free/cap/claim`, { method: 'POST', headers: { origin: SITE, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env);
}

test('same account racing its own cap slot receives its issuance after an earlier empty read', async () => {
  const env = fixture();
  const base = env.GIVEAWAY_DB;
  const token = await credential();
  let winner;
  let injected = false;
  // Preserve the result of the losing request's first issuance read, then let a
  // second HTTP request commit before the losing request checks the campaign cap.
  const wrap = (sql, statement) => ({
    bind: (...params) => wrap(sql, statement.bind(...params)),
    all: (...args) => statement.all(...args),
    run: (...args) => statement.run(...args),
    first: async (...args) => {
      const row = await statement.first(...args);
      if (!injected && /SELECT code, platform, campaign_id, expires_at, revoked FROM codes WHERE claimant/.test(sql)) {
        injected = true;
        winner = await post({ ...env, GIVEAWAY_DB: base }, { credential: token });
        assert.equal(winner.status, 200, 'the other request took the account and cap slot');
      }
      return row;
    },
  });
  const loser = await post({ ...env, GIVEAWAY_DB: { prepare: (sql) => wrap(sql, base.prepare(sql)) } }, { credential: token });
  assert.equal(loser.status, 200, 'an already-issued account must get its code, not capped');
  assert.equal((await loser.json()).code, (await winner.json()).code);
  assert.equal(base.raw.prepare('SELECT COUNT(*) AS n FROM codes WHERE claimant IS NOT NULL').get().n, 1);
});

test('the 8192-byte claim-body limit rejects multibyte JSON without allocation', async () => {
  const env = fixture();
  const body = JSON.stringify({ credential: await credential(), padding: '界'.repeat(3000) });
  assert.ok(body.length < 8192);
  assert.ok(Buffer.byteLength(body) > 8192);
  const response = await post(env, body);
  assert.ok([400, 413].includes(response.status), `oversize UTF-8 body returned ${response.status}`);
  assert.equal(env.GIVEAWAY_DB.raw.prepare('SELECT COUNT(*) AS n FROM codes WHERE claimant IS NOT NULL').get().n, 0);
});

test('a JSON-null JWT header is invalid input and yields 401 instead of an uncaught exception', async () => {
  const env = fixture();
  const response = await post(env, { credential: `${b64(null)}.${b64({})}.AA` });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'sign_in_failed');
  assert.equal(env.GIVEAWAY_DB.raw.prepare('SELECT COUNT(*) AS n FROM codes WHERE claimant IS NOT NULL').get().n, 0);
});

test('concurrent tokens with a newly published kid all await the one forced JWKS refresh', async () => {
  let calls = 0;
  let release;
  let started;
  const refreshing = new Promise((resolve) => { started = resolve; });
  const verify = createGoogleVerifier({ fetchImpl: async () => {
    calls++;
    if (calls === 1) return Response.json({ keys: [jwk] }, { headers: { 'cache-control': 'max-age=3600' } });
    started();
    return new Promise((resolve) => { release = () => resolve(Response.json({ keys: [jwk, { ...jwk, kid: 'verify-g2' }] }, { headers: { 'cache-control': 'max-age=3600' } })); });
  } });
  assert.equal((await verify(await credential(), CLIENT)).sub, 'same-account');
  const token = await credential('verify-g2');
  const first = verify(token, CLIENT);
  await refreshing;
  const second = verify(token, CLIENT);
  const outcomes = Promise.allSettled([first, second]);
  release();
  const results = await outcomes;
  assert.deepEqual(results.map((r) => r.status), ['fulfilled', 'fulfilled'], results.map((r) => r.reason?.message).join(', '));
  assert.equal(calls, 2, 'one initial fetch and one coalesced rotation refresh');
});