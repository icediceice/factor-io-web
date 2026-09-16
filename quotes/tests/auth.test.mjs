// quotes/tests/auth.test.mjs — auth scheme tests (mirrors board semantics).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  signSession, verifySession, safeReturnTo, allowlistFromEnv, emailAllowed,
  authenticate, assertProductionConfig, sessionCookie, clearSessionCookie,
} from '../lib/auth.mjs';

const SECRET = 'unit-test-secret-0123456789abcdef0123456789abcdef';
const now = 1_700_000_000_000;

describe('session token', () => {
  test('sign/verify round-trip returns the email', () => {
    const token = signSession('op@factor-io.com', SECRET, 3600, now);
    assert.equal(verifySession(token, SECRET, now + 1000), 'op@factor-io.com');
  });

  test('expired token verifies to empty string', () => {
    const token = signSession('op@factor-io.com', SECRET, 100, now);
    assert.equal(verifySession(token, SECRET, now + 101_000), '');
  });

  test('wrong secret refuses the token', () => {
    const token = signSession('op@factor-io.com', SECRET, 3600, now);
    assert.equal(verifySession(token, 'another-secret-0123456789abcdef0123456789', now + 1000), '');
  });

  test('tampered payload refuses', () => {
    const token = signSession('op@factor-io.com', SECRET, 3600, now);
    const [payload] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ email: 'attacker@evil.example', exp: 9_000_000_000 })).toString('base64url');
    assert.equal(verifySession(`${forged}.${token.split('.')[1]}`, SECRET, now + 1000), '');
    // payload untouched, signature flipped
    assert.equal(verifySession(`${payload}.AAAA${token.split('.')[1].slice(4)}`, SECRET, now + 1000), '');
  });

  test('garbage tokens refuse without throwing', () => {
    assert.equal(verifySession('', SECRET), '');
    assert.equal(verifySession('nodot', SECRET), '');
    assert.equal(verifySession('a.b', ''), '');
    assert.equal(verifySession('@@@.$$$', SECRET), '');
    assert.equal(verifySession('x.y', SECRET, now), '');
  });
});

describe('cookies', () => {
  test('session cookie is HttpOnly Secure SameSite=Lax host-only with TTL', () => {
    const c = sessionCookie('tok', 604800);
    assert.match(c, /^quotes_session=tok;/);
    assert.match(c, /HttpOnly/);
    assert.match(c, /Secure/);
    assert.match(c, /SameSite=Lax/);
    assert.match(c, /Max-Age=604800/);
    assert.doesNotMatch(c, /Domain=/); // host-only: never widened to .factor-io.com
  });
  test('clear cookie zeroes Max-Age', () => {
    assert.match(clearSessionCookie(), /Max-Age=0/);
  });
});

describe('return-to guard', () => {
  test('same-origin paths pass', () => {
    assert.equal(safeReturnTo('/quotes/42'), '/quotes/42');
    assert.equal(safeReturnTo('/'), '/');
  });
  test('absolute, protocol-relative, and scheme URLs are dropped', () => {
    assert.equal(safeReturnTo('https://evil.example'), '');
    assert.equal(safeReturnTo('//evil.example'), '');
    assert.equal(safeReturnTo('javascript:alert(1)'), '');
    assert.equal(safeReturnTo(''), '');
    assert.equal(safeReturnTo(undefined), '');
  });
});

describe('allowlist', () => {
  test('QUOTES_ALLOWED_EMAILS wins; board list is the fallback; legacy single last', () => {
    assert.deepEqual(allowlistFromEnv({ QUOTES_ALLOWED_EMAILS: ' A@x.io ,b@y.io ' }), ['a@x.io', 'b@y.io']);
    assert.deepEqual(allowlistFromEnv({ LIGHT_BOARD_ALLOWED_EMAILS: 'board@z.io' }), ['board@z.io']);
    assert.deepEqual(allowlistFromEnv({ LIGHT_BOARD_ALLOWED_EMAIL: 'one@w.io' }), ['one@w.io']);
    assert.deepEqual(allowlistFromEnv({}), []);
  });
  test('matching is case-insensitive; empty list = open (dev behaviour)', () => {
    const list = allowlistFromEnv({ QUOTES_ALLOWED_EMAILS: 'op@factor-io.com' });
    assert.equal(emailAllowed('OP@FACTOR-IO.COM', list), true);
    assert.equal(emailAllowed('other@factor-io.com', list), false);
    assert.equal(emailAllowed('anyone@else.example', []), true);
  });
});

describe('request authentication lanes', () => {
  const cfg = {
    secret: SECRET,
    clientId: 'cid',
    clientSecret: 'csecret',
    agentToken: 'agent-token-123',
    publicUrl: 'https://quotes.factor-io.com',
    list: ['op@factor-io.com'],
  };
  const req = (headers) => ({ headers });

  test('valid cookie authenticates the human lane with the email', () => {
    // real-clock token: authenticate() verifies against Date.now() internally
    const token = signSession('op@factor-io.com', SECRET, 3600);
    const r = authenticate(req({ cookie: `quotes_session=${token}` }), cfg);
    assert.deepEqual(r, { email: 'op@factor-io.com', lane: 'human' });
  });

  test('agent bearer token authenticates the agent lane as actor "agent"', () => {
    const r = authenticate(req({ authorization: 'Bearer agent-token-123' }), cfg);
    assert.deepEqual(r, { email: 'agent', lane: 'agent' });
  });

  test('wrong bearer token is refused (falls through, no cookie)', () => {
    const r = authenticate(req({ authorization: 'Bearer nope' }), cfg);
    assert.deepEqual(r, { email: '', lane: null });
  });

  test('allowlisted-out email with a VALID signature is still refused', () => {
    const token = signSession('outsider@evil.example', SECRET, 3600, now);
    const r = authenticate(req({ cookie: `quotes_session=${token}` }), cfg);
    assert.deepEqual(r, { email: '', lane: null });
  });

  test('no credentials at all is refused', () => {
    const r = authenticate(req({}), cfg);
    assert.deepEqual(r, { email: '', lane: null });
  });
});

describe('production boot gate', () => {
  const base = {
    NODE_ENV: 'production',
    QUOTES_SESSION_SECRET: 'p'.repeat(48),
    QUOTES_GOOGLE_CLIENT_ID: 'cid',
    QUOTES_GOOGLE_CLIENT_SECRET: 'csecret',
    QUOTES_PUBLIC_URL: 'https://quotes.factor-io.com',
    QUOTES_ALLOWED_EMAILS: 'op@factor-io.com',
  };

  test('fully configured production env passes', () => {
    assert.doesNotThrow(() => assertProductionConfig({ ...base }));
  });

  test('missing pieces REFUSE with the named list — never a dev sentinel', () => {
    for (const drop of ['QUOTES_SESSION_SECRET', 'QUOTES_GOOGLE_CLIENT_ID', 'QUOTES_GOOGLE_CLIENT_SECRET', 'QUOTES_PUBLIC_URL', 'QUOTES_ALLOWED_EMAILS']) {
      const env = { ...base };
      delete env[drop];
      assert.throws(() => assertProductionConfig(env), (err) => {
        assert.match(err.message, /refusing production start/);
        assert.match(err.message, new RegExp(drop));
        return true;
      }, `expected refusal when ${drop} is missing`);
    }
  });

  test('short secret refuses', () => {
    assert.throws(() => assertProductionConfig({ ...base, QUOTES_SESSION_SECRET: 'short' }), /QUOTES_SESSION_SECRET/);
  });

  test('dev mode (no NODE_ENV=production) never throws', () => {
    assert.doesNotThrow(() => assertProductionConfig({}));
  });
});