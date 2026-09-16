#!/usr/bin/env node
// quotes/smoke.mjs — end-to-end smoke run against a REAL server process.
//
// Boots quotes/server.mjs on an ephemeral port with a throwaway database,
// authenticates on the AGENT BEARER LANE, creates a client + quotation +
// lines, issues it, fetches the PDF in both languages and asserts the bytes
// are a real PDF. Prints each step; exits non-zero on the first failure.

import { spawn } from 'node:child_process';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 18790;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = 'smoke-agent-token-0123456789';
const DB = join(process.env.HOME ?? tmpdir(), 'quotes-smoke-run');

let passed = 0;
let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ok  ${name}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const call = async (method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
};

const server = spawn(process.execPath, [join(HERE, 'server.mjs')], {
  env: {
    ...process.env,
    QUOTES_PORT: String(PORT),
    QUOTES_DB_PATH: join(DB, 'quotes.db'),
    QUOTES_AGENT_TOKEN: TOKEN,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

async function waitHealthy(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

try {
  await rm(DB, { recursive: true, force: true });
  await mkdir(DB, { recursive: true });
  process.stdout.write('booting server… ');
  ok('server healthy', await waitHealthy());

  // unauthenticated request is rejected...
  const anon = await fetch(`${BASE}/api/clients`);
  ok('unauthenticated API request refused', anon.status === 401, `status ${anon.status}`);
  // ...and the bearer lane is admitted
  const authed = await call('GET', '/api/clients');
  ok('agent bearer lane admitted', authed.status === 200);

  const client = await call('POST', '/api/clients', {
    name: 'Smoke Client Co.', tax_id: '0100000000000', contact: 'Smoke',
  });
  ok('client created', client.status === 201);

  const q = await call('POST', '/api/quotations', { client_id: client.json.client.id, lang: 'en' });
  ok('quotation created with allocated number', q.status === 201 && /^QT-\d{6}-\d{4}$/.test(q.json.quotation.number), q.json.quotation?.number);

  await call('POST', `/api/quotations/${q.json.quotation.id}/lines`, {
    kind: 'service', description_en: 'Smoke service line', qty: '2.5', unit_price: '12000.00',
  });
  const line2 = await call('POST', `/api/quotations/${q.json.quotation.id}/lines`, {
    kind: 'hardware', description_en: 'Smoke hardware line', qty: '1', unit_price: '99000.00',
    discount_satang: 500000,
  });
  ok('lines added', line2.status === 201);
  // 2.5 x 12,000 = 30,000 + 99,000 - 5,000 = 124,000 net; VAT 7% = 8,680; grand 132,680
  const t = line2.json.totals;
  ok('totals exact (satang)', t.netSatang === 12400000 && t.vatSatang === 868000 && t.grandSatang === 13268000,
    `net ${t.netSatang} vat ${t.vatSatang} grand ${t.grandSatang}`);

  const issue = await call('POST', `/api/quotations/${q.json.quotation.id}/issue`);
  ok('issued -> revision snapshot', issue.status === 200 && issue.json.rev === 1);

  const revs = await call('GET', `/api/quotations/${q.json.quotation.id}/revisions`);
  ok('revision listed', revs.json.revisions.length === 1);

  for (const lang of ['en', 'th']) {
    const res = await fetch(`${BASE}/api/quotations/${q.json.quotation.id}/pdf?lang=${lang}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    ok(`PDF ${lang} is a real PDF`, res.status === 200 && buf.length > 5000 && buf.subarray(0, 5).toString('latin1') === '%PDF-',
      `${buf.length} bytes`);
    if (process.env.SMOKE_KEEP) await writeFile(join(DB, `smoke-${lang}.pdf`), buf);
  }

  const audits = await call('GET', '/api/quotations');
  ok('quota of sanity: list still answers', audits.status === 200);
} catch (e) {
  failed++;
  console.error(`FAIL  unexpected: ${e.message}`);
} finally {
  // test child: no graceful-close hang on keep-alive sockets — kill outright
  server.kill('SIGKILL');
  if (failed) {
    console.error(`\nserver log tail:\n${serverLog.split('\n').slice(-12).join('\n')}`);
    console.error(`SMOKE FAILED: ${failed} failure(s), ${passed} passed`);
    process.exit(1);
  }
  console.log(`\nSMOKE PASSED: ${passed} checks`);
  await rm(DB, { recursive: true, force: true }).catch(() => {});
}