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
// port 0 = ephemeral: concurrent smoke runs never collide (EADDRINUSE lesson)
let BASE = null; // resolved from the server's own "listening on" line
const TOKEN = 'smoke-agent-token-0123456789';
const DB = join(process.env.HOME ?? tmpdir(), 'quotes-smoke-run');

let passed = 0;
let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ok  ${name}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const call = async (method, path, body) => {
  const sendsJson = method === 'POST' || method === 'PUT';
  const res = await fetch(BASE + path, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      ...(sendsJson ? { 'content-type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
};

const server = spawn(process.execPath, [join(HERE, 'server.mjs')], {
  env: {
    ...process.env,
    QUOTES_PORT: '0',
    QUOTES_DB_PATH: join(DB, 'quotes.db'),
    QUOTES_AGENT_TOKEN: TOKEN,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

async function waitHealthy(tries = 60) {
  // the server binds port 0, so learn the assigned port from its own log line
  for (let i = 0; i < tries && !BASE; i++) {
    const m = serverLog.match(/listening on (http:\/\/[^\s)]+)/);
    if (m) BASE = m[1];
    else await new Promise((r) => setTimeout(r, 250));
  }
  if (!BASE) return false;
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

  // ---- a MIXED proposal: hardware + software + support, sections, an option
  // and a contract term. Kept as its own quotation so the accounting chain
  // below keeps asserting the same frozen figures it always has.
  const kinds = await call('GET', '/api/line-kinds');
  ok('line vocabulary is published for clients to build selects from',
    kinds.status === 200 && ['software', 'support', 'training', 'cloud']
      .every((c) => kinds.json.kinds.some((k) => k.code === c)),
    (kinds.json.kinds ?? []).map((k) => k.code).join(','));

  const mix = await call('POST', '/api/quotations', { client_id: client.json.client.id, lang: 'en' });
  const mixId = mix.json.quotation.id;
  const mixLines = [
    { kind: 'hardware', billing_period: 'once', section: 'Hardware', description_en: 'Appliance', qty: '1', unit_price: '2000000.00' },
    { kind: 'software', billing_period: 'yearly', section: 'Software', description_en: 'Platform licence', qty: '1', unit_price: '480000.00' },
    { kind: 'support', billing_period: 'monthly', section: 'Services', description_en: 'Managed operations', qty: '1', unit_price: '85000.00' },
    { kind: 'training', billing_period: 'once', section: 'Services', description_en: 'Workshop', qty: '2', unit_price: '45000.00', optional: true },
  ];
  let mixLast;
  for (const body of mixLines) mixLast = await call('POST', `/api/quotations/${mixId}/lines`, body);
  ok('mixed-type lines accepted (software, support, training)', mixLast.status === 201, mixLast.json?.error);

  const termed = await call('PUT', `/api/quotations/${mixId}`, { term_months: 36 });
  const mt = termed.json.totals;
  // one-time 2,000,000.00 | yearly 480,000.00 | monthly 85,000.00
  // net for ONE cycle = 2,565,000.00 -> VAT 7% = 179,550.00 -> grand 2,744,550.00
  ok('one-time and recurring are split by period',
    mt.oneTimeSatang === 200000000 && mt.recurringSatang.yearly === 48000000 && mt.recurringSatang.monthly === 8500000,
    `once ${mt.oneTimeSatang} yearly ${mt.recurringSatang?.yearly} monthly ${mt.recurringSatang?.monthly}`);
  ok('the payable is ONE cycle and excludes the option',
    mt.netSatang === 256500000 && mt.vatSatang === 17955000 && mt.grandSatang === 274455000,
    `net ${mt.netSatang} vat ${mt.vatSatang} grand ${mt.grandSatang}`);
  // 200,000,000 + (8,500,000 x 36) + (48,000,000 x 36 / 12) = 650,000,000
  ok('contract total extends recurring across the term, exact in satang',
    mt.contractTotalSatang === 650000000, `contract ${mt.contractTotalSatang}`);
  ok('the option is priced separately and never enters a total',
    mt.optionalSatang === 9000000, `options ${mt.optionalSatang}`);
  ok('sections carry the GROSS figure a reader adds up from the amount column',
    mt.sections.map((s) => `${s.name}=${s.subtotalSatang}`).join(' ')
      === 'Hardware=200000000 Software=48000000 Services=8500000',
    mt.sections.map((s) => `${s.name}=${s.subtotalSatang}`).join(' '));

  // ...and the option must not survive into a tax invoice.
  for (const s of ['issued', 'proposed', 'accepted']) await call('POST', `/api/quotations/${mixId}/status`, { status: s });
  const mixInv = await call('POST', '/api/invoices', { quotation_id: mixId, issue_date: '2026-09-15' });
  const mixInvLines = mixInv.json.lines.map((l) => l.descriptionEn);
  ok('the untaken option is absent from the invoice',
    mixInv.status === 201 && !mixInvLines.includes('Workshop') && mixInvLines.length === 3,
    mixInvLines.join(' | '));
  ok('the invoice bills one cycle — the 36-month term never multiplies it',
    mixInv.json.totals.netSatang === 256500000, `net ${mixInv.json.totals.netSatang}`);
  ok('billing period and section are snapshotted onto the invoice lines',
    mixInv.json.lines.map((l) => `${l.billingPeriod}/${l.section}`).join(' ')
      === 'once/Hardware yearly/Software monthly/Services',
    mixInv.json.lines.map((l) => `${l.billingPeriod}/${l.section}`).join(' '));

  // ---- accounting: pipeline -> invoice -> settlement -> PP 30 ----------
  const qid = q.json.quotation.id;
  const proposed = await call('POST', `/api/quotations/${qid}/status`, { status: 'proposed' });
  ok('quotation -> proposed', proposed.status === 200 && proposed.json.status === 'proposed');
  const accepted = await call('POST', `/api/quotations/${qid}/status`, { status: 'accepted' });
  ok('quotation -> accepted', accepted.status === 200 && accepted.json.status === 'accepted');

  const badJump = await call('POST', `/api/quotations/${qid}/status`, { status: 'draft' });
  ok('backwards transition refused', badJump.status === 400, badJump.json?.error);

  const inv = await call('POST', '/api/invoices', { quotation_id: qid, issue_date: '2026-09-15' });
  ok('draft invoice raised from the quotation',
    inv.status === 201 && /^INV-\d{6}-\d{4}$/.test(inv.json.invoice.number), inv.json.invoice?.number);
  const invId = inv.json.invoice.id;

  const noPay = await call('POST', `/api/invoices/${invId}/payments`, { amount: '1.00' });
  ok('a draft invoice refuses payment', noPay.status === 400, noPay.json?.error);

  const issued = await call('POST', `/api/invoices/${invId}/issue`, { issue_date: '2026-09-15' });
  ok('invoice issued — tax point stamped',
    issued.status === 200 && issued.json.invoice.issueDate === '2026-09-15', issued.json.invoice?.issueDate);
  // same figures as the quotation: net 12,400,000; VAT 7% 868,000; WHT 3% 372,000
  const it = issued.json.totals;
  ok('invoice totals frozen exact (satang)',
    it.netSatang === 12400000 && it.vatSatang === 868000 && it.grandSatang === 13268000 && it.whtSatang === 372000,
    `net ${it.netSatang} vat ${it.vatSatang} wht ${it.whtSatang}`);
  ok('issuing the invoice moved the quotation to invoiced',
    (await call('GET', `/api/quotations/${qid}`)).json.quotation.status === 'invoiced');

  const reIssue = await call('POST', `/api/invoices/${invId}/issue`, {});
  ok('an issued invoice refuses re-issue (frozen)', reIssue.status === 400, reIssue.json?.error);

  const over = await call('POST', `/api/invoices/${invId}/payments`, { amount_satang: 99999999 });
  ok('overpayment refused', over.status === 400, over.json?.error);

  // memo WHT: customer transfers grand - wht, then hands over the certificate
  const pay = await call('POST', `/api/invoices/${invId}/payments`, {
    amount_satang: 12896000, paid_on: '2026-09-25', reference: 'TRF-SMOKE',
  });
  ok('payment recorded, still short by exactly the WHT',
    pay.status === 201 && pay.json.balance.outstandingSatang === 372000,
    `outstanding ${pay.json?.balance?.outstandingSatang}`);

  const wht = await call('POST', `/api/invoices/${invId}/wht`, {
    base_satang: 12400000, wht_satang: 372000, pnd_form: 'PND53',
    cert_number: 'WHT-SMOKE-1', issued_on: '2026-09-25', rate_percent: '3',
  });
  ok('WHT certificate settles the invoice',
    wht.status === 201 && wht.json.balance.settled === true && wht.json.invoice.status === 'paid',
    `outstanding ${wht.json?.balance?.outstandingSatang}, status ${wht.json?.invoice?.status}`);

  const pp30 = await call('GET', '/api/reports/pp30?year=2026&month=9');
  ok('PP 30 worksheet reports the output VAT',
    pp30.status === 200 && pp30.json.report.outputVatSatang === 868000 && pp30.json.report.vatableNetSatang === 12400000,
    `output VAT ${pp30.json?.report?.outputVatSatang}`);
  ok('PP 30 names its filing deadline',
    pp30.json.report.dueOn.paper === '2026-10-15' && pp30.json.report.dueOn.efiling === '2026-10-23');
  ok('PP 30 leaves the input side explicitly absent, not zero',
    pp30.json.report.inputVatSatang === null && pp30.json.report.netPayableSatang === null);

  const octPp30 = await call('GET', '/api/reports/pp30?year=2026&month=10');
  ok('a September invoice does not leak into October', octPp30.json.report.invoiceCount === 0);

  // THE INVARIANT: editing the rate must not move an already-filed figure.
  await call('PUT', '/api/settings', { settings: { 'vat.rate_percent': '25' } });
  const pp30After = await call('GET', '/api/reports/pp30?year=2026&month=9');
  ok('FILED FIGURES DO NOT MOVE when vat.rate_percent is edited',
    pp30After.json.report.outputVatSatang === 868000,
    `after edit: ${pp30After.json?.report?.outputVatSatang} (was 868000)`);
  await call('PUT', '/api/settings', { settings: { 'vat.rate_percent': '7' } });

  const whtReg = await call('GET', '/api/reports/wht?from=2026-01-01&to=2026-12-31');
  ok('WHT register credits the certificate',
    whtReg.json.report.totalWhtSatang === 372000 && whtReg.json.report.byForm.PND53 === 372000);

  const pipeline = await call('GET', '/api/reports/pipeline?year=2026');
  ok('pipeline is separated from recognised income',
    pipeline.json.report.recognisedIncome.netSatang === 12400000
    && pipeline.json.report.outstandingReceivableSatang === 0);

  const income = await call('GET', '/api/reports/income?year=2026');
  ok('income lands in September on the tax-invoice date',
    income.json.report.months[8].netSatang === 12400000 && income.json.report.totalNetSatang === 12400000);

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