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
import { buildQuoteDocument } from './lib/quote.mjs';
import { buildInvoiceDocument } from './lib/invoice.mjs';
import { renderQuotationPdf, htmlToPdf } from './lib/pdf.mjs';
import { renderInvoiceHtml } from './templates/invoice.mjs';
import {
  assertProductionConfig, makeAuth, emailAllowed, safeReturnTo,
  sessionCookie, clearSessionCookie, exchangeCode,
} from './lib/auth.mjs';
import { createApi } from './api.mjs';
import { isTailnetAddr, tailnetWhois } from './lib/tailnet.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI_ROOT = join(HERE, 'ui');
const PORT = Number(process.env.QUOTES_PORT ?? 8787);
const DB_PATH = process.env.QUOTES_DB_PATH ?? join(HERE, 'data', 'quotes.db');
const BODY_LIMIT = 1024 * 1024;

export function createApp(env = process.env, options = {}) {
  const db = openDb(env.QUOTES_DB_PATH ?? DB_PATH);
  const api = createApi(db);
  const auth = makeAuth(env);
  const configured = auth.cfg.mode === 'tailscale'
    || Boolean(auth.cfg.secret && auth.cfg.clientId && auth.cfg.publicUrl);
  const lookupTailnetLogin = options.tailnetWhoisImpl ?? tailnetWhois;

  async function actorFor(req) {
    const r = auth.authenticate(req);
    if (r.lane) return r;
    // dev sentinel: unconfigured + loopback client + non-cross-site origin,
    // exactly the board's local/ dev lane. Never in production (boot refuses).
    const addr = req.socket?.remoteAddress ?? '';
    const loopback = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
    if (auth.cfg.mode === 'tailscale') {
      if (!isTailnetAddr(addr)) return { email: '', lane: null, status: 403 };
      const method = (req.method ?? 'GET').toUpperCase();
      const stateChanging = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
      if (stateChanging) {
        const site = String(req.headers['sec-fetch-site'] ?? '').toLowerCase();
        if (site === 'cross-site') return { email: '', lane: null, status: 403 };
        const origin = String(req.headers.origin ?? '');
        // Tailnet mode is deliberately HTTP-only. Missing browser provenance is
        // admitted for direct tailnet tools; a browser-supplied origin must be
        // this request's own origin.
        if (origin && origin !== `http://${req.headers.host ?? ''}`) {
          return { email: '', lane: null, status: 403 };
        }
      }
      const email = await lookupTailnetLogin(addr);
      if (!email || !emailAllowed(email, auth.cfg.list)) return { email: '', lane: null, status: 403 };
      return { email, lane: 'human' };
    }
    const site = (req.headers['sec-fetch-site'] ?? '').toLowerCase();
    // Dev lane exists ONLY in the zero-config case: the moment the operator
    // sets ANY credential (agent token or session secret), unauthenticated
    // requests are refused even on loopback.
    const anyAuth = Boolean(auth.cfg.agentToken || auth.cfg.secret || auth.cfg.clientId);
    if (!configured && !anyAuth && loopback && site !== 'cross-site') return { email: 'dev', lane: 'human' };
    return { email: '', lane: null };
  }

  async function handle(req, res) {
    try {
      if (auth.cfg.mode === 'tailscale' && auth.cfg.hosts.length
          && !auth.cfg.hosts.includes(String(req.headers.host ?? '').toLowerCase())) {
        return sendJson(res, 403, { error: 'forbidden' });
      }
      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
      const path = url.pathname;

      if (path.startsWith('/auth/')) return authRoutes(req, res, url);
      if (path === '/healthz') {
        return sendJson(res, 200, { ok: true, authMode: auth.cfg.mode });
      }
      if (path.startsWith('/api/')) {
        const identity = await actorFor(req);
        if (!identity.lane) return sendJson(res, identity.status ?? 401, { error: 'unauthorized' });
        // binary route: the rendered quotation PDF (GET only, no body)
        const pdfMatch = path.match(/^\/api\/quotations\/(\d+)\/pdf$/);
        if (pdfMatch) {
          if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' });
          return pdfRoute(res, Number(pdfMatch[1]), url.searchParams.get('lang'));
        }
        // ...and the rendered TAX INVOICE. Intercepted here, before readBody
        // and before the JSON api(), for the same reason as the quotation:
        // this route answers with binary, not an envelope.
        const invPdfMatch = path.match(/^\/api\/invoices\/(\d+)\/pdf$/);
        if (invPdfMatch) {
          if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' });
          return invoicePdfRoute(res, Number(invPdfMatch[1]), url.searchParams.get('lang'));
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          const contentType = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
          if (contentType !== 'application/json') {
            return sendJson(res, 415, { error: 'content-type must be application/json' });
          }
        }
        const body = await readBody(req);
        const reply = await api({
          method: req.method,
          path: path.slice(4) || '/',
          query: Object.fromEntries(url.searchParams),
          body,
          actor: identity.email,
        });
        res.writeHead(reply.status, reply.headers);
        return res.end(reply.body);
      }

      // human UI
      const identity = await actorFor(req);
      if (!identity.lane) {
        if (auth.cfg.mode === 'tailscale') return sendJson(res, identity.status ?? 403, { error: 'forbidden' });
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
    if (auth.cfg.mode === 'tailscale') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Authentication is handled by the tailnet.\n');
    }
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

  async function pdfRoute(res, quotationId, lang) {
    try {
      const doc = buildQuoteDocument(db, quotationId);
      // A PDF the operator can hand a customer must correspond to a stored
      // revision, or the revision number on it means nothing. Refused ONLY
      // where re-issuing is possible: a draft has no snapshot to disagree
      // with, and an accepted-or-later quotation can no longer be
      // re-snapshotted, so refusing that one would strand any quotation that
      // drifted while the line routes were still unguarded.
      const q = doc.quotation;
      if (q.revisionStale && (q.status === 'issued' || q.status === 'proposed')) {
        return sendJson(res, 409, {
          error: `this quotation has been edited since revision ${q.revision}`
            + ' — re-issue it to record the correction as a new revision, then download the PDF',
        });
      }
      const { buffer, filename, chromium } = await renderQuotationPdf(doc, lang === 'th' ? 'th' : 'en');
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${filename}"`,
        'x-rendered-by': chromium,
      });
      return res.end(buffer);
    } catch (e) {
      return sendJson(res, e.message.includes('no Chromium') ? 503 : 500, { error: e.message });
    }
  }

  // The tax invoice renders from the FROZEN invoice row — buildInvoiceDocument
  // reads the stored satang totals and rate strings and never recomputes, so a
  // PDF re-rendered years later still shows the figures that were filed.
  //
  // A draft is deliberately still renderable: the operator needs to proof it
  // before issuing. The template stamps it "NOT A VALID TAX INVOICE" and the
  // filename says draft, because an unissued document has no tax point.
  async function invoicePdfRoute(res, invoiceId, lang) {
    try {
      const doc = buildInvoiceDocument(db, invoiceId);
      const useLang = lang === 'th' || lang === 'en' ? lang : (doc.invoice.lang || 'en');
      const html = renderInvoiceHtml(doc, useLang);
      const { buffer, chromium } = await htmlToPdf(html);
      const suffix = doc.invoice.status === 'draft' ? '-DRAFT' : '';
      const filename = `${doc.invoice.number}${suffix}-${useLang.toUpperCase()}.pdf`;
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${filename}"`,
        'x-rendered-by': chromium,
      });
      return res.end(buffer);
    } catch (e) {
      const status = e.message.includes('no Chromium') ? 503
        : e.message.includes('not found') ? 404 : 500;
      return sendJson(res, status, { error: e.message });
    }
  }

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
  // plain-object requests (tests, internal calls) carry the parsed body
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- entry point ----
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { await assertProductionConfig(); } catch (e) { console.error(e.message); process.exit(1); }
  const app = createApp();
  const servers = [];
  try {
    for (const bind of bindAddresses(process.env.QUOTES_BIND)) {
      const server = createServer((req, res) => app.handle(req, res));
      await new Promise((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(PORT, bind, () => {
          server.removeListener('error', rejectListen);
          resolveListen();
        });
      });
      servers.push(server);
      const actual = server.address().port; // PORT may be 0 (ephemeral, used by smoke)
      console.log(`quotes server listening on http://${bind}:${actual} (db: ${process.env.QUOTES_DB_PATH ?? DB_PATH})`);
    }
  } catch (e) {
    console.error(`failed to bind quotes server: ${e.message}`);
    for (const server of servers) server.close();
    app.close();
    process.exit(1);
  }
  const shutdown = () => {
    let remaining = servers.length;
    for (const server of servers) server.close(() => {
      if (--remaining === 0) { app.close(); process.exit(0); }
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export function bindAddresses(raw = '127.0.0.1') {
  const addresses = [...new Set(String(raw).split(',').map((part) => part.trim()).filter(Boolean))];
  if (addresses.length === 0) throw new Error('QUOTES_BIND must name at least one address');
  for (const addr of addresses) {
    const loopback = addr === '127.0.0.1' || addr === '::1';
    if (!loopback && !isTailnetAddr(addr)) {
      throw new Error(`QUOTES_BIND address is neither loopback nor tailnet: ${addr}`);
    }
  }
  return addresses;
}