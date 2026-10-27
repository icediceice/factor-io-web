// demo-control/server.mjs — tailnet-only control panel for the chat demo.
//
// One click rents a Colab G4, uploads demo/chat/backend and runs colab_start.sh;
// the page then shows the customer link (lib/demo.mjs). Listens on loopback and
// light-worker's Tailscale address only, like giveaway/ and quotes/, and is also
// served as https://demo.factor-io.com by the tailnet-only caddy-worker.
//
// There is no login (operator's choice): being on the tailnet is the gate. With
// no credential to steal, the risk is a page on another site making the
// operator's browser start a billed VM, so every request needs an allowlisted
// Host (DNS rebinding), every POST must be application/json (a cross-site one
// then needs a CORS preflight, which this server never grants), and a browser
// POST must not be cross-site and must come from an allowlisted Origin.

import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createColab } from './lib/colab.mjs';
import { createDemo, DemoError } from './lib/demo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI_ROOT = join(HERE, 'ui');
const BODY_LIMIT = 16 * 1024;
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
const BACKEND_FILES = ['colab_start.sh', 'gateway.py', 'rag.py', 'requirements.txt'];

const csv = (raw) => String(raw ?? '').split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);

export function readConfig(env = process.env) {
  const home = homedir();
  return {
    production: env.NODE_ENV === 'production',
    hosts: csv(env.DEMO_ALLOWED_HOSTS),
    python: env.DEMO_COLAB_PYTHON || join(home, '.local/share/uv/tools/google-colab-cli/bin/python'),
    helper: env.DEMO_COLAB_HELPER || '/Git/Light-CF/LightServer/mcptools/colab_helper.py',
    cli: env.DEMO_COLAB_CLI || join(home, '.local/bin/colab'),
    backend: env.DEMO_BACKEND || join(HERE, 'backend'),
    data: env.DEMO_DATA || join(HERE, 'data'),
    floor: Number(env.DEMO_CU_FLOOR ?? 10),
  };
}

/** Production refuses to boot half-configured instead of failing on the first click. */
export function assertProductionConfig(env = process.env) {
  const cfg = readConfig(env);
  if (!cfg.production) return;
  const missing = [];
  if (cfg.hosts.length === 0) missing.push('DEMO_ALLOWED_HOSTS');
  for (const [name, path] of [['DEMO_COLAB_PYTHON', cfg.python], ['DEMO_COLAB_HELPER', cfg.helper], ['DEMO_COLAB_CLI', cfg.cli]]) {
    if (!existsSync(path)) missing.push(`${name} (${path})`);
  }
  for (const f of BACKEND_FILES) if (!existsSync(join(cfg.backend, f))) missing.push(`backend file ${join(cfg.backend, f)}`);
  if (missing.length) throw new Error(`refusing production start, missing: ${missing.join(', ')}`);
}

export function hostAllowed(cfg, host) {
  return cfg.hosts.length === 0 ? !cfg.production : cfg.hosts.includes(String(host ?? '').toLowerCase());
}

// A browser mutation must be same-origin: Sec-Fetch-Site where the browser sends
// it, else the Origin header (OWASP CSRF cheat sheet, "Fetch Metadata headers").
function crossSite(cfg, req) {
  const site = String(req.headers['sec-fetch-site'] ?? '').toLowerCase();
  if (site && site !== 'same-origin' && site !== 'none') return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return !hostAllowed(cfg, new URL(origin).host);
  } catch {
    return true;
  }
}

export function createApp(env = process.env, options = {}) {
  const cfg = readConfig(env);
  const colab = options.colab ?? createColab({ python: cfg.python, helper: cfg.helper, cli: cfg.cli });
  const demo = createDemo({
    colab, backendDir: cfg.backend, dataDir: cfg.data, floor: cfg.floor,
    clock: options.clock, pollMs: options.pollMs, log: options.log ?? console.error,
  });

  async function handle(req, res) {
    try {
      // The Host gate comes first, before health, UI or API (DNS-rebinding guard).
      if (!hostAllowed(cfg, req.headers.host)) return sendJson(res, 403, { error: 'forbidden' });
      const path = new URL(req.url, 'http://localhost').pathname;
      const method = String(req.method ?? 'GET').toUpperCase();
      if (path === '/healthz') return sendJson(res, 200, { ok: true });

      if (path.startsWith('/api/')) {
        if (method === 'GET' && path === '/api/state') return sendJson(res, 200, demo.view());
        if (method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
        const type = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
        if (type !== 'application/json') return sendJson(res, 415, { error: 'content-type must be application/json' });
        if (crossSite(cfg, req)) return sendJson(res, 403, { error: 'cross-site request refused' });
        const body = await readBody(req);
        if (path === '/api/start') return sendJson(res, 202, demo.start(body));
        if (path === '/api/stop') return sendJson(res, 202, demo.stop());
        return sendJson(res, 404, { error: 'not found' });
      }
      if (method !== 'GET' && method !== 'HEAD') return sendJson(res, 405, { error: 'GET only' });
      return serveStatic(res, path);
    } catch (e) {
      const status = e instanceof DemoError || e.statusCode ? e.statusCode : 500;
      return sendJson(res, status, { error: status === 500 ? `internal error: ${e.message}` : e.message });
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

  return { handle, close: demo.close };
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body) + '\n');
}

function readBody(req) {
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

function isTailnetAddr(addr) {
  const parts = String(addr).split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return false;
  const [a, b] = parts.map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

export function bindAddresses(raw = '127.0.0.1') {
  const addresses = [...new Set(String(raw).split(',').map((p) => p.trim()).filter(Boolean))];
  if (addresses.length === 0) throw new Error('DEMO_BIND must name at least one address');
  for (const addr of addresses) {
    if (addr !== '127.0.0.1' && addr !== '::1' && !isTailnetAddr(addr)) {
      throw new Error(`DEMO_BIND address is neither loopback nor tailnet: ${addr}`);
    }
  }
  return addresses;
}

// ---- entry point ----
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { assertProductionConfig(); } catch (e) { console.error(e.message); process.exit(1); }
  const port = Number(process.env.DEMO_PORT ?? 8789);
  const app = createApp();
  const servers = [];
  try {
    for (const bind of bindAddresses(process.env.DEMO_BIND)) {
      const server = createServer((req, res) => app.handle(req, res));
      await new Promise((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(port, bind, () => { server.removeListener('error', rejectListen); resolveListen(); });
      });
      servers.push(server);
      console.log(`demo control listening on http://${bind}:${server.address().port}`);
    }
  } catch (e) {
    console.error(`failed to bind demo control: ${e.message}`);
    for (const server of servers) server.close();
    process.exit(1);
  }
  const shutdown = () => {
    app.close();
    let remaining = servers.length;
    for (const server of servers) server.close(() => { if (--remaining === 0) process.exit(0); });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}