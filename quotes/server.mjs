// quotes/server.mjs — HTTP adapter: node:http sockets around the pure API
// router, the Google OAuth lanes, static UI files and the PDF endpoint.
//
// Auth mirrors the Light-CF board: HMAC cookie for humans, Bearer token for
// agents, dev sentinel ONLY for loopback when unconfigured — production boot
// refuses half-configured via assertProductionConfig().

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './lib/db.mjs';
import {
  assertProductionConfig, makeAuth, emailAllowed, safeReturnTo,
  sessionCookie, clearSessionCookie, exchangeCode,
} from './lib/auth.mjs';
import { createApi } from './api.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI_ROOT = join(HERE, 'ui');
const PORT = Number(process.env.QUOTES_PORT ?? 8787);
const DB_PATH = process.env.QUOTES_DB_PATH ?? join(HERE, 'data', 'quotes.db');
const BODY_LIMIT = 1024 * 1024;

export function createApp(env = process.env) {
  const db = openDb(env.QUOTES_DB_PATH ?? DB_PATH);
  const api = createApi(db);
  const auth = makeAuth(env);
  const configured = Boolean(auth.cfg.secret && auth.cfg.clientId && auth.cfg.publicUrl);

  function actorFor(req) {
    const r = auth.authenticate(req);
    if (r.lane) return r;
    // dev sentinel: unconfigured + loopback client + non-cross-site origin,
    // exactly the board's local/ dev lane. Never in production (boot refuses).
    const addr = req.socket?.remoteAddress ?? '';
    const loopback = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
    const site = (req.headers['sec-fetch-site'] ?? '').toLowerCase();
    if (!configured && loopback && site !== 'cross-site') return { email: 'dev', lane: 'human' };
    return { email: '', lane: null };
  }

  async function handle(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
      const path = url.pathname;

      if (path.startsWith('/auth/')) return authRoutes(req, res, url);
      if (path === '/healthz') {
        return sendJson(res, 200, { ok: true });
      }
      if (path.startsWith('/api/')) {
        const identity = actorFor(req);
        if (!identity.lane) return sendJson(res, 401, { error: 'unauthorized' });
        const body = await readBody(req);
        const reply = await api({
          method: req.method,
          path: path.slice(4) || '/',
          query: Object.fromEntries(url.searchParams),
          body,
          actor: identity.email,
        });
        for (const [k, v] of Object.entries(reply.headers)) res.setHeader(k, v);
        res.statusCode = reply.status;
        return res.end(reply.body);
      }

      // human UI
      const identity = actorFor(req);
      if (!identity.lane) {
        const dest = `/auth/login?return_to=${encodeURIComponent(path + url.search)}`;
        res.writeHead(302, { Location: dest });
        return res.end();
      }
      return serveStatic(res, path);
    } catch (e) {
      sendJson(res, 500, { error: `internal error: ${e.message}` });
    }
  }

  function authRoutes(req, res, url) {
    const path = url.pathname;
    if (path === '/auth/login') {
      if (!configured) {
        res.writeHead(503, { 'content-type': 'text/html; charset=utf-8' });
        return res.end('<!doctype html><meta charset="utf-8"><title>Quotes</title><h1>Sign-in is not configured</h1><p>Set QUOTES_GOOGLE_CLIENT_ID / QUOTES_GOOGLE_CLIENT_SECRET / QUOTES_PUBLIC_URL. See quotes/README.md.</p>');
      }
      const target = auth.loginRedirectURL(safeReturnTo(url.searchParams.get('return_to') ?? ''));
      res.writeHead(302, { Location: target });
      return res.end();
    }
    if (path === '/auth/callback') {
      const code = url.searchParams.get('code');
      if (!code || url.searchParams.get('error')) {
        res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' });
        return res.end('<!doctype html><meta charset="utf-8"><title>Quotes</title><h1>Sign-in failed or was cancelled</h1>');
      }
      return exchangeCode(auth.cfg, code).then((email) => {
        if (!emailAllowed(email, auth.cfg.list)) {
          res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' });
          return res.end(`<!doctype html><meta charset="utf-8"><title>Quotes</title><h1>${escapeHtml(email)} is not authorised for this system.</h1>`);
        }
        const token = auth.signSession(email);
        const dest = safeReturnTo(url.searchParams.get('state') ?? '') || '/quotes';
        res.writeHead(302, { Location: dest, 'Set-Cookie': sessionCookie(token) });
        return res.end();
      }).catch((e) => {
        sendJson(res, 502, { error: `sign-in failed: ${e.message}` });
      });
    }
    if (path === '/auth/logout') {
      res.writeHead(302, { Location: '/auth/login', 'Set-Cookie': clearSessionCookie() });
      return res.end();
    }
    res.writeHead(404).end();
  }

  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
  };

  async function serveStatic(res, path) {
    let rel = path === '/' || path === '/quotes' || path === '/quotes/'
      ? '/index.html'
      : path.replace(/^\/quotes\/?/, '/');
    rel = normalize(rel).replace(/^(\.\.[/\\])+/, '');
    const file = join(UI_ROOT, rel);
    if (!file.startsWith(UI_ROOT)) return sendJson(res, 403, { error: 'forbidden' });
    try {
      const st = await stat(file);
      if (!st.isFile()) throw new Error('not a file');
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'content-length': data.length });
      return res.end(data);
    } catch {
      return sendJson(res, 404, { error: 'not found' });
    }
  }

  return { handle, close: () => db.close() };

  function sendJson(res, status, body) {
    const data = JSON.stringify(body, null, 2) + '\n';
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(data);
  }
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- entry point ----
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { assertProductionConfig(); } catch (e) { console.error(e.message); process.exit(1); }
  const app = createApp();
  const server = createServer((req, res) => app.handle(req, res));
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`quotes server listening on http://127.0.0.1:${PORT} (db: ${process.env.QUOTES_DB_PATH ?? DB_PATH})`);
  });
  const shutdown = () => { server.close(() => { app.close(); process.exit(0); }); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}