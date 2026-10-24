import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../catcountdown/worker/src/index.js';
import { createGoogleVerifier, GOOGLE_JWKS_URL, KeyServiceError, SignInError } from '../catcountdown/worker/src/giveaway.js';
import { d1Binding } from './support/d1-sqlite.mjs';

const SITE = 'https://catcountdown.factor-io.com';
const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const ALG = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

const google = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
const impostor = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
const jwk = async (pair, kid) => ({ ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'RS256', use: 'sig' });
const GOOGLE_KEYS = { keys: [await jwk(google, 'g1')] };

// Google's JWKS endpoint is the Worker's only upstream on these paths.
globalThis.fetch = async (url) => {
  assert.equal(String(url), GOOGLE_JWKS_URL);
  return Response.json(GOOGLE_KEYS, { headers: { 'cache-control': 'public, max-age=3600' } });
};

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
async function idToken(overrides = {}, { key = google.privateKey, kid = 'g1', alg = 'RS256' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'sub-alice', email: 'alice@example.com', email_verified: true, iat: now, exp: now + 600, ...overrides };
  const head = b64({ alg, kid, typ: 'JWT' });
  const body = b64(claims);
  const sig = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, Buffer.from(`${head}.${body}`))).toString('base64url');
  return `${head}.${body}.${sig}`;
}

const DAY = 86400;
const nowS = () => Math.floor(Date.now() / 1000);

function pool({ campaigns = [{ id: 'showcase' }], codes = ['PLAY-1', 'PLAY-2', 'PLAY-3'] } = {}) {
  const db = d1Binding();
  for (const c of campaigns) {
    db.raw.prepare('INSERT INTO campaigns (id, name, source, platforms, status, max_claims, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(c.id, c.name ?? `Campaign ${c.id}`, c.source ?? '', c.platforms ?? 'android', c.status ?? 'active', c.max_claims ?? null, nowS());
  }
  for (const entry of codes) {
    const c = typeof entry === 'string' ? { code: entry } : entry;
    db.raw.prepare('INSERT INTO codes (platform, code, batch, expires_at, revoked, added_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(c.platform ?? 'android', c.code, 'test', c.expires_at ?? null, c.revoked ?? 0, nowS());
  }
  return { GIVEAWAY_DB: db, GOOGLE_CLIENT_ID: CLIENT_ID };
}

const issuedRows = (env) => env.GIVEAWAY_DB.raw.prepare('SELECT code, claimant, campaign_id FROM codes WHERE claimant IS NOT NULL ORDER BY code').all().map((r) => ({ ...r }));

async function claim(env, campaign, { token, platform, origin = SITE, contentType = 'application/json', body } = {}) {
  const headers = { 'content-type': contentType };
  if (origin !== null) headers.origin = origin;
  const payload = body ?? JSON.stringify({ credential: token ?? (await idToken()), platform });
  const res = await worker.fetch(new Request(`${SITE}/free/${campaign}/claim`, { method: 'POST', headers, body: payload }), env);
  return { status: res.status, body: await res.json(), res };
}

const asUser = (sub, extra = {}) => idToken({ sub, email: `${sub}@example.com`, ...extra });

test('a visitor who signs in with Google receives one Play code with a redeem link, attributed to the campaign link', async () => {
  const env = pool();
  const { status, body, res } = await claim(env, 'showcase');
  assert.equal(status, 200);
  assert.equal(body.status, 'claimed');
  assert.equal(body.code, 'PLAY-1');
  assert.equal(body.store, 'Google Play');
  assert.equal(body.redeem_url, 'https://play.google.com/redeem?code=PLAY-1');
  assert.match(res.headers.get('cache-control'), /no-store/);
  assert.deepEqual(issuedRows(env), [{ code: 'PLAY-1', claimant: 'sub-alice', campaign_id: 'showcase' }]);
});

test('one code per Google account: signing in again, through any campaign, returns the original code and attribution', async () => {
  const env = pool({ campaigns: [{ id: 'showcase' }, { id: 'reddit' }] });
  const first = await claim(env, 'showcase');
  const again = await claim(env, 'showcase');
  const elsewhere = await claim(env, 'reddit');
  for (const r of [again, elsewhere]) {
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'existing');
    assert.equal(r.body.code, first.body.code);
    assert.equal(r.body.campaign, 'showcase');
  }
  assert.equal(issuedRows(env).length, 1);
});

test('distinct Google accounts get distinct codes', async () => {
  const env = pool();
  const codes = [];
  for (const sub of ['a', 'b', 'c']) codes.push((await claim(env, 'showcase', { token: await asUser(sub) })).body.code);
  assert.deepEqual(codes.sort(), ['PLAY-1', 'PLAY-2', 'PLAY-3']);
});

test('the same account signing in twice at once with spare codes still gets a single code', async () => {
  const env = pool();
  const token = await idToken();
  const [x, y] = await Promise.all([claim(env, 'showcase', { token }), claim(env, 'showcase', { token })]);
  assert.equal(x.status, 200);
  assert.equal(y.status, 200);
  assert.equal(x.body.code, y.body.code);
  assert.equal(issuedRows(env).length, 1);
});

test('two accounts racing for the last code: one gets it, the other is told the pool is empty', async () => {
  const env = pool({ codes: ['ONLY'] });
  const results = await Promise.all([claim(env, 'showcase', { token: await asUser('a') }), claim(env, 'showcase', { token: await asUser('b') })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(results.find((r) => r.status === 409).body.error, 'empty');
  assert.equal(issuedRows(env).length, 1);
});

test('a claim cap is never exceeded, even by concurrent sign-ins', async () => {
  const env = pool({ campaigns: [{ id: 'showcase', max_claims: 1 }] });
  const results = await Promise.all(['a', 'b', 'c'].map(async (s) => claim(env, 'showcase', { token: await asUser(s) })));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.ok(results.filter((r) => r.status === 409).every((r) => r.body.error === 'capped'));
  assert.equal(issuedRows(env).length, 1);
});

test('after a campaign closes or fills, earlier claimants can still sign in and see their code; nobody new is issued one', async () => {
  for (const close of [{ max_claims: 1 }, { status: 'paused' }, { status: 'ended' }]) {
    const env = pool();
    const mine = await claim(env, 'showcase', { token: await asUser('early') });
    env.GIVEAWAY_DB.raw.prepare('UPDATE campaigns SET status = ?, max_claims = ?').run(close.status ?? 'active', close.max_claims ?? null);
    const back = await claim(env, 'showcase', { token: await asUser('early') });
    assert.equal(back.status, 200, JSON.stringify(close));
    assert.equal(back.body.code, mine.body.code);
    const late = await claim(env, 'showcase', { token: await asUser('late') });
    assert.equal(late.status, 409);
    assert.equal(late.body.error, close.status ?? 'capped');
    assert.equal(issuedRows(env).length, 1);
  }
});

test('unknown campaigns and an empty pool allocate nothing', async () => {
  const env = pool({ codes: [] });
  assert.equal((await claim(env, 'nope')).status, 404);
  const empty = await claim(env, 'showcase');
  assert.equal(empty.status, 409);
  assert.equal(empty.body.error, 'empty');
});

test('revoked and expired codes are never issued; codes that expire soonest go first', async () => {
  const env = pool({
    codes: [
      { code: 'NO-EXPIRY' },
      { code: 'REVOKED', revoked: 1, expires_at: nowS() + DAY },
      { code: 'EXPIRED', expires_at: nowS() - 60 },
      { code: 'LATER', expires_at: nowS() + 30 * DAY },
      { code: 'SOON', expires_at: nowS() + DAY },
    ],
  });
  const order = [];
  for (const sub of ['a', 'b', 'c', 'd']) {
    const r = await claim(env, 'showcase', { token: await asUser(sub) });
    order.push(r.status === 200 ? r.body.code : r.body.error);
  }
  assert.deepEqual(order, ['SOON', 'LATER', 'NO-EXPIRY', 'empty']);
});

test('a campaign offering both stores asks which one, issues from that store, and never swaps an issued code', async () => {
  const env = pool({ campaigns: [{ id: 'both', platforms: 'android,ios' }, { id: 'android-only' }], codes: ['PLAY-1', { code: 'APPLE-1', platform: 'ios' }] });
  const unchosen = await claim(env, 'both', { token: await asUser('a') });
  assert.equal(unchosen.status, 400);
  assert.equal(unchosen.body.error, 'choose_platform');
  assert.equal(issuedRows(env).length, 0);

  const ios = await claim(env, 'both', { token: await asUser('a'), platform: 'ios' });
  assert.equal(ios.body.code, 'APPLE-1');
  assert.equal(ios.body.store, 'App Store');
  assert.equal(ios.body.redeem_url, 'https://apps.apple.com/redeem?code=APPLE-1');

  const swap = await claim(env, 'both', { token: await asUser('a'), platform: 'android' });
  assert.equal(swap.body.code, 'APPLE-1');

  const wrongStore = await claim(env, 'android-only', { token: await asUser('b'), platform: 'ios' });
  assert.equal(wrongStore.status, 400);
  assert.equal(wrongStore.body.error, 'platform_not_offered');
  assert.equal(issuedRows(env).length, 1);
});

test('tokens Google did not issue for this site are refused with 401 and allocate nothing', async () => {
  const env = pool();
  const now = nowS();
  const bad = {
    'forged signature': await idToken({}, { key: impostor.privateKey }),
    'other audience': await idToken({ aud: 'someone-else.apps.googleusercontent.com' }),
    expired: await idToken({ exp: now - 1 }),
    'other issuer': await idToken({ iss: 'https://evil.example.com' }),
    'unverified email': await idToken({ email_verified: false }),
    'string email_verified': await idToken({ email_verified: 'true' }),
    'no subject': await idToken({ sub: '' }),
    'unknown key': await idToken({}, { kid: 'not-a-google-key', key: impostor.privateKey }),
    'not RS256': await idToken({}, { alg: 'HS256' }),
    garbage: 'not.a.jwt',
  };
  for (const [name, token] of Object.entries(bad)) {
    const r = await claim(env, 'showcase', { token });
    assert.equal(r.status, 401, name);
    assert.equal(r.body.error, 'sign_in_failed', name);
  }
  assert.equal(issuedRows(env).length, 0);
});

test('both issuer spellings Google uses are accepted', async () => {
  const env = pool();
  assert.equal((await claim(env, 'showcase', { token: await asUser('a', { iss: 'accounts.google.com' }) })).status, 200);
  assert.equal((await claim(env, 'showcase', { token: await asUser('b', { iss: 'https://accounts.google.com' }) })).status, 200);
});

test('claims from other sites, without an Origin, or not sent as JSON are refused before anything is allocated', async () => {
  const env = pool();
  assert.equal((await claim(env, 'showcase', { origin: 'https://evil.example.com' })).status, 403);
  assert.equal((await claim(env, 'showcase', { origin: null })).status, 403);
  assert.equal((await claim(env, 'showcase', { origin: 'null' })).status, 403);
  assert.equal((await claim(env, 'showcase', { contentType: 'text/plain' })).status, 415);
  assert.equal((await claim(env, 'showcase', { body: '{not json' })).status, 400);
  assert.equal(issuedRows(env).length, 0);
});

test('until the Google client id is configured, giveaway links say so and allocate nothing', async () => {
  const env = { ...pool(), GOOGLE_CLIENT_ID: '' };
  const page = await worker.fetch(new Request(`${SITE}/free/showcase`), env);
  assert.equal(page.status, 503);
  assert.match(await page.text(), /not open yet/);
  assert.equal((await claim(env, 'showcase')).status, 503);
  assert.equal(issuedRows(env).length, 0);
});

const getPage = async (env, path, method = 'GET') => {
  const res = await worker.fetch(new Request(`${SITE}${path}`, { method }), env);
  return { res, body: method === 'HEAD' ? '' : await res.text() };
};

test('an open campaign page offers Google sign-in, escapes the campaign name and is never cached', async () => {
  const env = pool({ campaigns: [{ id: 'showcase', name: 'App <script>alert(1)</script> Showcase' }] });
  const { res, body } = await getPage(env, '/free/showcase');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /no-store/);
  assert.match(body, /https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.match(body, /One code per Google account/);
  assert.match(body, /App &lt;script&gt;alert\(1\)&lt;\/script&gt; Showcase/);
  assert.doesNotMatch(body, /<script>alert/);
  assert.match(res.headers.get('content-security-policy'), /script-src 'nonce-/);
});

test('a page for a campaign with both stores in stock asks the visitor to choose', async () => {
  const env = pool({ campaigns: [{ id: 'both', platforms: 'android,ios' }], codes: ['PLAY-1', { code: 'APPLE-1', platform: 'ios' }] });
  const { body } = await getPage(env, '/free/both');
  assert.match(body, /value="android"/);
  assert.match(body, /value="ios"/);
});

test('closed, full and empty campaign pages say no new claims, but still let earlier claimants sign in', async () => {
  const cases = [
    [{ campaigns: [{ id: 'showcase', status: 'paused' }] }, /paused/],
    [{ campaigns: [{ id: 'showcase', status: 'ended' }] }, /has ended/],
    [{ campaigns: [{ id: 'showcase', max_claims: 0 }] }, /has been claimed/],
    [{ codes: [] }, /has been claimed/],
  ];
  for (const [setup, message] of cases) {
    const { res, body } = await getPage(pool(setup), '/free/showcase');
    assert.equal(res.status, 200);
    assert.match(body, message);
    assert.match(body, /Already claimed a code\? Sign in/);
    assert.match(body, /accounts\.google\.com\/gsi\/client/);
  }
  assert.equal((await getPage(pool(), '/free/unknown')).res.status, 404);
});

test('HEAD on a campaign page has no body and the page allows only GET and HEAD', async () => {
  const env = pool();
  const head = await getPage(env, '/free/showcase', 'HEAD');
  assert.equal(head.res.status, 200);
  assert.equal(head.res.body, null);
  const post = await worker.fetch(new Request(`${SITE}/free/showcase`, { method: 'POST' }), env);
  assert.equal(post.status, 405);
  const getClaim = await worker.fetch(new Request(`${SITE}/free/showcase/claim`), env);
  assert.equal(getClaim.status, 405);
});

// Key rotation, with a controllable clock and JWKS endpoint.
function keyServer(initial) {
  const served = { keys: initial, calls: 0, fail: false };
  served.fetchImpl = async () => {
    served.calls++;
    if (served.fail) throw new Error('offline');
    return Response.json({ keys: served.keys }, { headers: { 'cache-control': 'max-age=3600' } });
  };
  return served;
}

test('a token signed with a key Google rotated in before our cache expired is accepted after one refresh', async () => {
  const rotated = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  const server = keyServer([await jwk(google, 'g1')]);
  let clock = Date.now();
  const verify = createGoogleVerifier({ fetchImpl: server.fetchImpl, now: () => clock });
  assert.equal((await verify(await idToken(), CLIENT_ID)).sub, 'sub-alice');
  assert.equal(server.calls, 1);

  server.keys = [await jwk(google, 'g1'), await jwk(rotated, 'g2')];
  clock += 60_000;
  assert.equal((await verify(await idToken({ sub: 'bob' }, { key: rotated.privateKey, kid: 'g2' }), CLIENT_ID)).sub, 'bob');
  assert.equal(server.calls, 2);

  // A kid Google never published is refused, without another fetch inside the cooldown.
  await assert.rejects(verify(await idToken({}, { key: impostor.privateKey, kid: 'g3' }), CLIENT_ID), SignInError);
  await assert.rejects(verify(await idToken({}, { key: impostor.privateKey, kid: 'g4' }), CLIENT_ID), SignInError);
  assert.equal(server.calls, 3);
});

test('when Google keys cannot be fetched and none are cached, sign-in is a retryable failure, not a rejection', async () => {
  const server = keyServer([await jwk(google, 'g1')]);
  server.fail = true;
  const verify = createGoogleVerifier({ fetchImpl: server.fetchImpl });
  await assert.rejects(verify(await idToken(), CLIENT_ID), KeyServiceError);
});