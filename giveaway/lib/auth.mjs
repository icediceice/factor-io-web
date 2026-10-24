// giveaway/lib/auth.mjs — who may use the tailnet-only giveaway admin.
//
// Same scheme as quotes.factor-io.com in tailscale mode (quotes/server.mjs:actorFor),
// with one deliberate difference: the agent bearer is accepted ONLY from a loopback
// socket. quotes/lib/auth.mjs:authenticate accepts its bearer from any address, so a
// leaked token would work from any tailnet peer there; here it works only on
// light-worker itself (the CLI).
//
//   human: tailnet source address -> `tailscale whois` login -> email allowlist
//   agent: loopback socket + Authorization: Bearer <GIVEAWAY_AGENT_TOKEN>
//   dev:   NODE_ENV != production, loopback, no agent token configured

import { timingSafeEqual } from 'node:crypto';
import { isTailnetAddr, tailnetWhois, whoisAvailable } from './tailnet.mjs';

const csv = (raw) => String(raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

export function readConfig(env = process.env) {
  return {
    production: env.NODE_ENV === 'production',
    list: csv(env.GIVEAWAY_ALLOWED_EMAILS),
    hosts: csv(env.GIVEAWAY_ALLOWED_HOSTS),
    agentToken: env.GIVEAWAY_AGENT_TOKEN ?? '',
    cf: {
      apiToken: env.GIVEAWAY_CF_API_TOKEN ?? '',
      accountId: env.GIVEAWAY_CF_ACCOUNT_ID ?? '',
      databaseId: env.GIVEAWAY_D1_DATABASE_ID ?? '',
    },
  };
}

/** Production refuses to boot half-configured instead of falling open. */
export async function assertProductionConfig(env = process.env, options = {}) {
  if (env.NODE_ENV !== 'production') return;
  const cfg = readConfig(env);
  const missing = [];
  if (cfg.list.length === 0) missing.push('GIVEAWAY_ALLOWED_EMAILS');
  if (cfg.hosts.length === 0) missing.push('GIVEAWAY_ALLOWED_HOSTS');
  if (cfg.agentToken.length < 32) missing.push('GIVEAWAY_AGENT_TOKEN (>= 32 chars)');
  if (!cfg.cf.apiToken) missing.push('GIVEAWAY_CF_API_TOKEN');
  if (!cfg.cf.accountId) missing.push('GIVEAWAY_CF_ACCOUNT_ID');
  if (!cfg.cf.databaseId) missing.push('GIVEAWAY_D1_DATABASE_ID');
  if (missing.length === 0 && !await (options.whoisAvailableImpl ?? whoisAvailable)()) {
    missing.push('working Tailscale whois');
  }
  if (missing.length) throw new Error(`refusing production start, missing: ${missing.join(', ')}`);
}

export function isLoopback(addr) {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function tokenMatches(given, expected) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hostAllowed(cfg, host) {
  return cfg.hosts.length === 0 ? !cfg.production : cfg.hosts.includes(String(host ?? '').toLowerCase());
}

const deny = (status) => ({ actor: '', lane: null, status });

export function makeActorFor(cfg, { whois = tailnetWhois } = {}) {
  return async function actorFor(req) {
    const addr = req.socket?.remoteAddress ?? '';
    const authHeader = String(req.headers.authorization ?? '');
    if (authHeader.startsWith('Bearer ')) {
      if (!isLoopback(addr) || !cfg.agentToken) return deny(403);
      return tokenMatches(authHeader.slice(7).trim(), cfg.agentToken) ? { actor: 'agent', lane: 'agent' } : deny(401);
    }
    if (!isTailnetAddr(addr)) {
      if (!cfg.production && !cfg.agentToken && isLoopback(addr)) return { actor: 'dev', lane: 'human' };
      return deny(403);
    }
    const method = String(req.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      if (String(req.headers['sec-fetch-site'] ?? '').toLowerCase() === 'cross-site') return deny(403);
      const origin = String(req.headers.origin ?? '');
      // HTTP-only on the tailnet, like quotes: a browser origin must be this host.
      if (origin && origin !== `http://${req.headers.host ?? ''}`) return deny(403);
    }
    const email = await whois(addr);
    if (!email || !cfg.list.includes(email)) return deny(403);
    return { actor: email, lane: 'human' };
  };
}