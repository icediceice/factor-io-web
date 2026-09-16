// quotes/lib/tailnet.mjs — fail-closed identity lookup through local tailscaled.
import { execFile } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 1500;
const CACHE_TTL_MS = 60_000;
const cache = new Map();

function ipv4(addr) {
  const raw = String(addr ?? '').trim().toLowerCase();
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

export function isTailnetAddr(addr) {
  const parts = ipv4(addr).split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return false;
  return octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
}

function runTailscale(args, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    execFile('tailscale', args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

async function boundedRun(run, args, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => run(args, timeoutMs)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('tailscale lookup timed out')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function loginFromWhois(raw) {
  const parsed = JSON.parse(raw);
  const login = parsed?.UserProfile?.LoginName;
  return typeof login === 'string' ? login.trim().toLowerCase() : '';
}

export async function tailnetWhois(addr, options = {}) {
  const peer = ipv4(addr);
  if (!isTailnetAddr(peer)) return '';

  const now = options.now?.() ?? Date.now();
  const cached = cache.get(peer);
  if (cached && cached.expiresAt > now) return cached.login;

  let login = '';
  try {
    const raw = await boundedRun(options.run ?? runTailscale, ['whois', '--json', peer], options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    login = loginFromWhois(raw);
  } catch {
    login = '';
  }
  cache.set(peer, { login, expiresAt: now + (options.cacheTtlMs ?? CACHE_TTL_MS) });
  return login;
}

export async function whoisAvailable(options = {}) {
  const run = options.run ?? runTailscale;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const raw = await boundedRun(run, ['status', '--json'], timeoutMs);
    const status = JSON.parse(raw);
    if (status?.BackendState !== 'Running') return false;
    const ownAddr = status?.TailscaleIPs?.find((addr) => isTailnetAddr(addr));
    if (!ownAddr) return false;
    const whoisRaw = await boundedRun(run, ['whois', '--json', ownAddr], timeoutMs);
    return Boolean(loginFromWhois(whoisRaw));
  } catch {
    return false;
  }
}

export function clearTailnetCache() {
  cache.clear();
}
