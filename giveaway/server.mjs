// giveaway/server.mjs — tailnet-only admin for the Cat Countdown free-copy giveaway.
//
// Listens on loopback and light-worker's Tailscale address only (never 0.0.0.0), with
// no TLS, no Cloudflare proxy and no public route, like quotes.factor-io.com. It edits
// the Worker's D1 database (catcountdown/worker/migrations) over the Cloudflare REST
// API. Auth: lib/auth.mjs.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertProductionConfig, hostAllowed, makeActorFor, readConfig } from './lib/auth.mjs';
import { createD1 } from './lib/d1.mjs';
import { createApi } from './api.mjs';
import { isTailnetAddr } from './lib/tailnet.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI_ROOT = join(HERE, 'ui');
const BODY_LIMIT = 2 * 1024 * 1024; // a paste of tens of thousands of codes
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const UI_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export function createApp(env = process.env, options = {}) {
  const cfg = readConfig(env);
  const db = options.d1 ?? createD1({ ...cfg.cf, fetchImpl: options.fetchImpl });
  const api = createApi(db, { log: options.log });
  const actorFor = makeActorFor(cfg, { whois: options.whois });

  async function handle(req, res) {
    try {
      // The Host gate comes first, before health, UI or API (DNS-rebinding guard).
      if (!hostAllowed(cfg, req.headers.host)) return sendJson(res, 403, { error: 'forbidden' });
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      if (path === '/healthz') return sendJson(res, 200, { ok: true });

      const identity = await actorFor(req);
      if (!identity.lane) return sendJson(res, identity.status ?? 403, { error: 'forbidden' });

      if (path.startsWith('/api/')) {
        const method = String(req.method ?? 'GET').toUpperCase();
        if (method === 'POST' || method === 'PATCH') {
          const type = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
          if (type !== 'application/json') return sendJson(res, 415, { error: 'content-type must be application/json' });
        }
        const body = await readBody(req);
        const reply = await api({ method, path: path.slice(4), query: Object.fromEntries(url.searchParams), body, actor: identity.actor });
        res.writeHead(reply.status, { 'cache-control': 'no-store', ...reply.headers });
        return res.end(reply.body);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'GET only' });
      return serveStatic(res, path);
    } catch (e) {
      return sendJson(res, e.statusCode ?? 500, { error: e.statusCode ? e.message : `internal error: ${e.message}` });
    }
  }

  async function serveStatic(res, path) {
    const rel = normalize(path === '/' ? '/index.html' : path).replace(/^(\.\.[/\\])+/, '');
    const file = join(UI_ROOT, rel);
    if (!file.startsWith(UI_ROOT + '/') || !MIME[extname(file)]) return sendJson(res, 404, { error: 'not found' });
    try {
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)], 'content-length': data.length, ...UI_HEADERS });
      return res.end(data);
    } catch {
      return sendJson(res, 404, { error: 'not found' });
    }
  }

  return { handle };
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body) + '\n');
}

function readBody(req) {
  if (typeof req.on !== 'function') return Promise.resolve(req.body ?? {});
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) { reject(Object.assign(new Error('body too large'), { statusCode: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolveBody({});
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('invalid JSON body'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

export function bindAddresses(raw = '127.0.0.1') {
  const addresses = [...new Set(String(raw).split(',').map((part) => part.trim()).filter(Boolean))];
  if (addresses.length === 0) throw new Error('GIVEAWAY_BIND must name at least one address');
  for (const addr of addresses) {
    const loopback = addr === '127.0.0.1' || addr === '::1';
    if (!loopback && !isTailnetAddr(addr)) {
      throw new Error(`GIVEAWAY_BIND address is neither loopback nor tailnet: ${addr}`);
    }
  }
  return addresses;
}

// ---- entry point ----
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { await assertProductionConfig(); } catch (e) { console.error(e.message); process.exit(1); }
  const port = Number(process.env.GIVEAWAY_PORT ?? 8788);
  const app = createApp();
  const servers = [];
  try {
    for (const bind of bindAddresses(process.env.GIVEAWAY_BIND)) {
      const server = createServer((req, res) => app.handle(req, res));
      await new Promise((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(port, bind, () => { server.removeListener('error', rejectListen); resolveListen(); });
      });
      servers.push(server);
      console.log(`giveaway admin listening on http://${bind}:${server.address().port}`);
    }
  } catch (e) {
    console.error(`failed to bind giveaway admin: ${e.message}`);
    for (const server of servers) server.close();
    process.exit(1);
  }
  const shutdown = () => {
    let remaining = servers.length;
    for (const server of servers) server.close(() => { if (--remaining === 0) process.exit(0); });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}