// quotes/tests/ui-harness-server.mjs — a LOCAL, UNAUTHENTICATED harness for
// looking at and measuring the UI. Test scaffolding; never deployed.
//
// WHY IT EXISTS. server.mjs redirects every un-cookied UI request to
// /auth/login, so the real app cannot be opened headlessly. And the screens are
// ES modules, which Chrome refuses to import from a file:// origin (opaque
// origin, CORS-blocked) — so serving the files off disk is not an option
// either. This serves the real ui/ directory and the real createApi() over a
// seeded in-memory database, on loopback, with no auth.
//
// It is NOT a way into the real app: it opens its own throwaway :memory: DB,
// binds 127.0.0.1 only, and refuses to start with NODE_ENV=production.
//
//   node tests/ui-harness-server.mjs [port]

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../lib/db.mjs';
import { createApi } from '../api.mjs';
import { seedFixture, FIXTURE_NOTE } from './ui-fixture.mjs';

// D-gate (data honesty). Every screen this harness serves is showing SEEDED
// records — plausible Thai company names and eight-figure hardware prices that
// are not anyone's real ledger. A screenshot travels without its caption, so
// the label has to be IN the pixels: it is injected server-side into every
// page, it cannot be forgotten on one screen, and it cannot leak into the real
// app because this file is never deployed. Its own styles are inline here for
// the same reason — the strip must survive even if app.css is what broke.
const FIXTURE_LABEL = `<style>
/* Static, not sticky: the app's own header is sticky at top:0, and a second
   sticky strip would either cover it or shift every sticky offset below it —
   changing the very geometry the harness exists to measure. Screens are
   captured from the top, so a strip in the flow is in every screenshot. */
[data-fixture-label]{margin:0;padding:6px 16px;
  text-align:center;font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;
  letter-spacing:.06em;background:#a64b00;color:#fff}
</style>
<p data-fixture-label>${FIXTURE_NOTE}</p>`;

if (process.env.NODE_ENV === 'production') {
  throw new Error('ui-harness-server is test scaffolding and must never run in production');
}

const HERE = dirname(fileURLToPath(import.meta.url));
const UI_ROOT = normalize(join(HERE, '..', 'ui'));
const TEST_ROOT = normalize(HERE);
const PORT = Number(process.argv[2] ?? 8799);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const db = openDb(':memory:');
const api = createApi(db);

// The fixture talks to the API exactly as the browser does, and a failed seed
// must be loud: a harness that half-seeded would be measured as if the screens
// were empty by design.
async function call(method, path, body = {}, query = {}) {
  const reply = await api({ method, path, body, query, actor: 'harness@factor-io.local' });
  const parsed = JSON.parse(reply.body);
  if (reply.status >= 400) {
    throw new Error(`fixture seed failed: ${method} ${path} -> ${reply.status} ${parsed.error}`);
  }
  return parsed;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = url.pathname;

    if (path === '/healthz') {
      res.writeHead(200, { 'content-type': MIME['.json'] });
      return res.end(JSON.stringify({ ok: true, authMode: 'harness' }));
    }

    if (path.startsWith('/api/')) {
      let body = {};
      if (req.method === 'POST' || req.method === 'PUT') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        if (chunks.length) {
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { body = {}; }
        }
      }
      const reply = await api({
        method: req.method,
        path: path.slice('/api'.length) || '/',
        query: Object.fromEntries(url.searchParams),
        body,
        actor: 'harness@factor-io.local',
      });
      res.writeHead(reply.status, reply.headers);
      return res.end(reply.body);
    }

    // Static: /tests/* from tests/, everything else from ui/.
    const underTests = path.startsWith('/tests/');
    const root = underTests ? TEST_ROOT : UI_ROOT;
    let rel = underTests ? path.slice('/tests'.length) : path;
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = normalize(join(root, rel));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
    const data = await readFile(file);
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    // Screens get the fixture label; /tests/* (the measurement page itself)
    // does not, or it would measure the harness's own chrome.
    if (extname(file) === '.html' && !underTests) {
      const html = data.toString('utf8').replace(/<body[^>]*>/i, (m) => m + FIXTURE_LABEL);
      res.writeHead(200, { 'content-type': type });
      return res.end(html);
    }
    res.writeHead(200, { 'content-type': type });
    return res.end(data);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(String(e.message));
  }
});

const seeded = await seedFixture(call);
server.listen(PORT, '127.0.0.1', () => {
  const at = `http://127.0.0.1:${PORT}`;
  console.log(`ui harness listening on ${at}`);
  console.log(`  screens     ${at}/index.html`);
  console.log(`  measurement ${at}/tests/ui-harness.html`);
  console.log(`  seeded      ${seeded.clients.length} clients, ${Object.keys(seeded.quotations).length} quotations, 2 invoices`);
});