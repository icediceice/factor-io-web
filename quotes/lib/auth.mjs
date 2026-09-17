// quotes/lib/auth.mjs — authentication for the quotation app.
//
// Mirrors the proven Light-CF board scheme (LightServer/auth/oauth.go):
//   - session token  = b64url(JSON{email,exp}) + "." + b64url(HMAC-SHA256(payload, secret))
//   - 7-day TTL, HttpOnly/Secure/SameSite=Lax cookie, NO Domain attribute
//     (host-only — deliberately does NOT share the board cookie, which is
//     host-only for light.factor-io.com and can never reach this host).
//   - allowlist env, case-insensitive, whitespace-trimmed; empty list = open
//     (dev behaviour) but production boot REFUSES without config.
//   - agent lane: Authorization: Bearer <QUOTES_AGENT_TOKEN> -> actor "agent".
//   - safeReturnTo: post-login redirect must be a same-origin path — the OAuth
//     state param is attacker-suppliable, so anything not starting with a
//     single "/" is dropped (open-redirect guard, same rule as the board).
//
// Own Google OAuth client on its own hostname: env prefix QUOTES_* with
// fallback to the board allowlist so the SAME accounts work without retyping.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { whoisAvailable } from './tailnet.mjs';

export const SESSION_TTL_S = 7 * 24 * 60 * 60; // 7 days
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function safeReturnTo(raw) {
  if (raw == null) return '';
  const s = String(raw);
  if (s === '' || s[0] !== '/' || s.startsWith('//') || s.includes('://')) return '';
  return s;
}

export function signSession(email, secret, ttlS = SESSION_TTL_S, nowMs = Date.now()) {
  const payload = b64url(JSON.stringify({ email, exp: Math.floor(nowMs / 1000) + ttlS }));
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(token, secret, nowMs = Date.now()) {
  if (!secret || !token || typeof token !== 'string') return '';
  const dot = token.lastIndexOf('.');
  if (dot < 0) return '';
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return '';
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return '';
  }
  if (!parsed || typeof parsed.email !== 'string' || typeof parsed.exp !== 'number') return '';
  if (parsed.exp <= Math.floor(nowMs / 1000)) return '';
  return parsed.email;
}

export function sessionCookie(token, ttlS = SESSION_TTL_S) {
  return `quotes_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${ttlS}`;
}

export function clearSessionCookie() {
  return 'quotes_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
}

/** Allowlist: QUOTES_ALLOWED_EMAILS, falling back to the board's list.
 *  Empty (unset everywhere) = open — dev behaviour, production boot refuses. */
export function allowlistFromEnv(env = process.env) {
  const raw = env.QUOTES_ALLOWED_EMAILS ?? env.LIGHT_BOARD_ALLOWED_EMAILS ?? env.LIGHT_BOARD_ALLOWED_EMAIL ?? '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function emailAllowed(email, list) {
  const want = String(email).trim().toLowerCase();
  if (list.length === 0) return true;
  return list.includes(want);
}

export function readProductionEnv(env = process.env) {
  const mode = (env.QUOTES_AUTH_MODE ?? '').trim().toLowerCase()
    || (env.NODE_ENV === 'production' ? '' : 'oauth');
  const secret = env.QUOTES_SESSION_SECRET ?? '';
  const clientId = env.QUOTES_GOOGLE_CLIENT_ID ?? '';
  const clientSecret = env.QUOTES_GOOGLE_CLIENT_SECRET ?? '';
  const agentToken = env.QUOTES_AGENT_TOKEN ?? '';
  const publicUrl = (env.QUOTES_PUBLIC_URL ?? '').replace(/\/+$/, '');
  const list = allowlistFromEnv(env);
  const hosts = (env.QUOTES_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return { mode, secret, clientId, clientSecret, agentToken, publicUrl, list, hosts };
}

/** Boot gate: in production the app must refuse to start half-configured
 *  rather than silently falling through to a dev sentinel. */
export async function assertProductionConfig(env = process.env, options = {}) {
  if (env.NODE_ENV !== 'production') return;
  const { mode, secret, clientId, clientSecret, publicUrl, list, hosts } = readProductionEnv(env);
  const missing = [];
  if (mode !== 'tailscale' && mode !== 'oauth') {
    missing.push('QUOTES_AUTH_MODE (tailscale or oauth)');
  } else if (mode === 'tailscale') {
    if (list.length === 0) missing.push('QUOTES_ALLOWED_EMAILS');
    if (hosts.length === 0) missing.push('QUOTES_ALLOWED_HOSTS');
    if (missing.length === 0 && !await (options.whoisAvailableImpl ?? whoisAvailable)()) {
      missing.push('working Tailscale whois');
    }
  } else {
    if (secret.length < 32) missing.push('QUOTES_SESSION_SECRET (>= 32 bytes)');
    if (!clientId) missing.push('QUOTES_GOOGLE_CLIENT_ID');
    if (!clientSecret) missing.push('QUOTES_GOOGLE_CLIENT_SECRET');
    if (!publicUrl) missing.push('QUOTES_PUBLIC_URL');
    if (list.length === 0) missing.push('QUOTES_ALLOWED_EMAILS');
  }
  if (missing.length) {
    throw new Error(`refusing production start, missing: ${missing.join(', ')}`);
  }
}

/** Build the Google consent URL. `state` carries the validated return_to. */
export function loginRedirectURL(cfg, returnTo = '') {
  if (!cfg.clientId) return null; // caller renders a "not configured" page
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: `${cfg.publicUrl}/auth/callback`,
    response_type: 'code',
    scope: 'openid email',
    access_type: 'online',
    prompt: 'select_account',
  });
  const rt = safeReturnTo(returnTo);
  if (rt) params.set('state', rt);
  return `${GOOGLE_AUTH_URL}?${params}`;
}

/** Exchange an OAuth code for the verified Google email. */
export async function exchangeCode(cfg, code, fetchImpl = fetch) {
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: `${cfg.publicUrl}/auth/callback`,
    grant_type: 'authorization_code',
  });
  const res = await fetchImpl(GOOGLE_TOKEN_URL, { method: 'POST', body });
  if (!res.ok) throw new Error(`token exchange failed: HTTP ${res.status}`);
  const tokenJson = await res.json();
  if (!tokenJson.access_token) throw new Error('token exchange returned no access_token');
  const userRes = await fetchImpl(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userRes.ok) throw new Error(`userinfo fetch failed: HTTP ${userRes.status}`);
  const user = await userRes.json();
  if (!user.email) throw new Error('userinfo returned no email');
  return user.email;
}

function cookieValue(cookieHeader, name) {
  if (!cookieHeader) return '';
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return '';
}

/**
 * Authenticate an incoming request.
 * Returns { email, lane } — lane 'human' (cookie) | 'agent' (bearer) | null.
 * Agents are identified as actor "agent" for the audit trail; humans carry
 * their verified email.
 */
export function authenticate(req, cfg) {
  const authHeader = req.headers.authorization ?? '';
  if (cfg.agentToken && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.length === cfg.agentToken.length && timingSafeEqual(Buffer.from(token), Buffer.from(cfg.agentToken))) {
      return { email: 'agent', lane: 'agent' };
    }
    return { email: '', lane: null };
  }
  if ((cfg.mode ?? 'oauth') !== 'oauth') return { email: '', lane: null };
  const email = verifySession(cookieValue(req.headers.cookie ?? '', 'quotes_session'), cfg.secret);
  if (email && emailAllowed(email, cfg.list)) return { email, lane: 'human' };
  return { email: '', lane: null };
}

export function makeAuth(env = process.env) {
  const cfg = readProductionEnv(env);
  return { cfg, signSession: (email) => signSession(email, cfg.secret), authenticate: (req) => authenticate(req, cfg), loginRedirectURL: (rt) => loginRedirectURL(cfg, rt), exchangeCode: (code) => exchangeCode(cfg, code) };
}