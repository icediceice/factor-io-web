// quotes/tests/ui-harness-server.mjs — a LOCAL, UNAUTHENTICATED harness for
// looking at and measuring the UI. Test scaffolding; never deployed.
//
// WHY IT EXISTS. server.mjs redirects every un-cookied UI request to
// /auth/login, so the real app cannot be opened headlessly. And the screens are
// ES modules, which Chrome refuses to import from a file:// origin (opaque
// origin, CORS-blocked) — so a static file path is not an option either. This
// serves the real ui/ directory and the real createApi() over a seeded
// in-memory database, on loopback, with no auth.
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
const call = (method, path, body = {}, query = {}) => api({ method, path, body, query, actor: 'harness@factor-io.com' });
const parse = async (p) => JSON.parse((await p).body);

/* -------------------------------------------------------------- fixture -- */
// Every figure below is FIXTURE DATA authored here, not a real Factor IO
// document. The harness page says so on screen, in a banner that cannot be
// scrolled away, so a screenshot of it can never be mistaken for the real app.

async function seed() {
  await call('PUT', '/settings', {
    settings: {
      'company.name': 'Factor IO Co., Ltd.',
      'company.tax_id': '0105566000000',
      'vat.rate_percent': '7',
      'wht.rate_percent': '3',
      'quote.validity_days': '15',
    },
  });

  const clients = [];
  for (const c of [
    { name: 'Siam Digital Infrastructure Co., Ltd.', name_th: 'บริษัท สยาม ดิจิทัล อินฟราสตรัคเจอร์ จำกัด', tax_id: '0105551000111', contact: 'Somchai P.', email: 'somchai@example.co.th', phone: '02-000-1111', address: '1 Sathorn Road, Bangkok 10120' },
    { name: 'Northern Data Works', tax_id: '0505562000222', contact: 'Ratana K.', email: 'ratana@example.co.th' },
    { name: 'Andaman Cloud Services Public Company Limited', tax_id: '0835560000333', contact: 'Preecha S.' },
    { name: 'Mekong Analytics', tax_id: '0105559000444' },
  ]) clients.push((await parse(call('POST', '/clients', c))).client);

  for (const item of [
    { kind: 'service', name_en: 'Architecture consulting', name_th: 'ที่ปรึกษาด้านสถาปัตยกรรม', sku: 'SVC-ARCH', unit_price: '35000.00', unit: 'day', billing_period: 'once', section: 'Services' },
    { kind: 'service', name_en: 'Managed platform support', sku: 'SVC-SUP', unit_price: '85000.00', billing_period: 'monthly', section: 'Services' },
    { kind: 'hardware', name_en: 'GPU node — 8× accelerator chassis', sku: 'HW-GPU8', unit_price: '2450000.00', unit: 'unit', billing_period: 'once', section: 'Hardware' },
    { kind: 'hardware', name_en: 'Top-of-rack switch, 100GbE', sku: 'HW-SW100', unit_price: '310000.00', unit: 'unit', billing_period: 'once', section: 'Hardware' },
    { kind: 'service', name_en: 'Knowledge transfer workshop', unit_price: '48000.00', unit: 'day', billing_period: 'once', section: 'Services', active: false },
  ]) await call('POST', '/catalog', item);

  const mk = async (clientId, lines, opts = {}) => {
    const q = (await parse(call('POST', '/quotations', { client_id: clientId, notes: opts.notes ?? '' }))).quotation;
    for (const l of lines) await call('POST', `/quotations/${q.id}/lines`, l);
    if (opts.term) await call('PUT', `/quotations/${q.id}`, { term_months: opts.term });
    if (opts.issue) await call('POST', `/quotations/${q.id}/issue`);
    for (const s of opts.moves ?? []) await call('POST', `/quotations/${q.id}/status`, { status: s });
    return q;
  };

  const L = {
    arch: { kind: 'service', description_en: 'Architecture consulting', description_th: 'ที่ปรึกษาด้านสถาปัตยกรรม', qty: '12', unit: 'day', unit_price: '35000.00', section: 'Services' },
    gpu: { kind: 'hardware', description_en: 'GPU node — 8× accelerator chassis', qty: '2', unit: 'unit', unit_price: '2450000.00', section: 'Hardware' },
    sw: { kind: 'hardware', description_en: 'Top-of-rack switch, 100GbE', qty: '4', unit: 'unit', unit_price: '310000.00', section: 'Hardware', discount_satang: 2000000 },
    sup: { kind: 'service', description_en: 'Managed platform support', qty: '1', unit: 'month', unit_price: '85000.00', billing_period: 'monthly', section: 'Services' },
    opt: { kind: 'service', description_en: 'Knowledge transfer workshop (optional)', qty: '3', unit: 'day', unit_price: '48000.00', section: 'Services', optional: true },
  };

  await mk(clients[0].id, [L.gpu, L.sw, L.arch, L.sup, L.opt], { issue: true, term: 36, notes: 'Phase 1 build-out, Sathorn DC.' });
  await mk(clients[1].id, [L.arch, L.sup], { issue: true, moves: ['proposed'], term: 12 });
  const accepted = await mk(clients[2].id, [L.arch], { issue: true, moves: ['proposed', 'accepted'] });
  await mk(clients[3].id, [L.sw], {});
  await mk(clients[1].id, [L.gpu], { issue: true, moves: ['declined'] });
  await mk(clients[0].id, [L.arch], { issue: true, moves: ['cancelled'] });

  const inv = (await parse(call('POST', '/invoices', { quotation_id: accepted.id }))).invoice;
  await call('POST', `/invoices/${inv.id}/issue`, { issue_date: '2026-09-10' });
  await call('POST', `/invoices/${inv.id}/payments`, { amount: '200000.00', paid_on: '2026-09-15', method: 'transfer', reference: 'TT-99812' });
  await call('POST', `/invoices/${inv.id}/wht`, { cert_number: 'WHT-0042', issued_on: '2026-09-15', pnd_form: 'PND53', base: '420000.00', wht: '12600.00', rate_percent: '3', payer_name: 'Andaman Cloud Services Public Company Limited' });

  const draftInv = (await parse(call('POST', '/invoices', { quotation_id: accepted.id }))).invoice;
  return { clients, inv, draftInv };
}

/* --------------------------------------------------------------- server -- */

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
        if (chunks.length) { try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { body = {}; } }
      }
      const reply = await api({
        method: req.method,
        path: path.slice(4) || '/',
        query: Object.fromEntries(url.searchParams),
        body,
        actor: 'harness@factor-io.com',
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
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    return res.end(data);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain' });
    res.end(String(e.message));
  }
});

await seed();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`ui harness on http://127.0.0.1:${PORT}/  (screens) and /tests/ui-harness.html (measurement)`);
});