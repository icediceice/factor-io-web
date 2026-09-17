#!/usr/bin/env node
// quotes/cli.mjs — the agent's terminal driver for the quotation system.
//
// Talks to the running server on the agent bearer lane (QUOTES_AGENT_TOKEN).
// Every command accepts --json for raw API output. Money crosses as decimal
// strings ("35000.00"), quantities as decimal strings ("0.5") — the server
// rejects floats by design.
//
//   quotes list
//   quotes new --client 1 [--lang th] [--notes "..."] [--date 2026-09-20] [--term 36]
//   quotes show 12
//   quotes kinds                          # the live --kind / --period vocabulary
//   quotes line-add 12 --kind software --desc "Platform licence" --qty 1 \
//                     --price 480000.00 [--unit year] [--desc-th "..."] [--discount 0] \
//                     [--period once|monthly|quarterly|yearly] [--section Software] [--optional]
//   quotes line-rm 12 3
//
// --kind takes ANY code in the line.kinds setting (service, hardware, software,
// license, subscription, support, training, cloud, expense out of the box) —
// run `quotes kinds` for the live list rather than assuming a fixed pair.
// --optional prices a line on the document but excludes it from every total.
// --term sets the contract length that extends recurring lines into a contract
// total; that total is a memo and carries no VAT.
//   quotes issue 12                       # first issue = rev 1; run it AGAIN on an
//                                         # issued or proposed quotation to record a
//                                         # correction as the next revision
//   quotes revisions 12                   # what went out, when, and on whose authority
//   quotes status 12 cancelled
//   quotes clients | client-add "Acme" --tax-id ...
//   quotes settings                       # all settings
//   quotes set vat.rate_percent 8         # one setting
//   quotes pdf 12 --lang th -o quote.pdf
//
//   # sales pipeline (forecast — never income)
//   quotes propose 12 | quotes accept 12 | quotes decline 12
//
//   # invoices: income is recognised on the tax-invoice date
//   quotes invoice 12 [--date 2026-09-20] [--lang th]   # draft from a quotation
//   quotes inv-issue 5 [--date 2026-09-20]              # FREEZES the tax rates
//   quotes inv-show 5
//   quotes pay 5 --amount 10400.00 [--date 2026-09-25] [--ref TRF-9912]
//   quotes wht-add 5 --base 10000.00 --wht 300.00 --form PND53 [--cert W-1]
//   quotes inv-pdf 5 --lang th -o invoice.pdf
//
//   # reports — worksheets to transcribe, NOT a filing channel
//   quotes report pp30 --year 2026 --month 9
//   quotes report income --year 2026
//   quotes report wht --from 2026-01-01 --to 2026-12-31
//   quotes report pnd --year 2026 [--half 1]
//   quotes report pipeline
//
// Env: QUOTES_URL (default http://127.0.0.1:8787), QUOTES_AGENT_TOKEN (required
// unless the server runs unconfigured on loopback, where its dev lane admits).

const URL_BASE = (process.env.QUOTES_URL ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');
const TOKEN = process.env.QUOTES_AGENT_TOKEN ?? '';

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') { flags.json = true; continue; }
    if (a.startsWith('--')) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => '_' + c); // --tax-id -> tax_id
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else { flags[key] = next; i++; }
    } else positional.push(a);
  }
  return { positional, flags };
}

async function call(method, path, body) {
  const sendsJson = method === 'POST' || method === 'PUT';
  const res = await fetch(URL_BASE + path, {
    method,
    headers: {
      ...(sendsJson ? { 'content-type': 'application/json' } : {}),
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return json;
}

const need = (flags, key, label) => {
  const v = flags[key];
  if (v === undefined || v === true) {
    console.error(`missing required flag --${key}${label ? ` (${label})` : ''}`);
    process.exit(1);
  }
  return String(v);
};
const needId = (positional, index, label) => {
  const v = positional[index];
  if (!v || !/^\d+$/.test(v)) {
    console.error(`missing or invalid ${label} argument`);
    process.exit(1);
  }
  return Number(v);
};

const money = (s) => {
  const neg = s < 0 ? '−' : '';
  const abs = Math.abs(Math.trunc(s));
  return `${neg}฿${Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${String(abs % 100).padStart(2, '0')}`;
};

async function main() {
  let [cmd, ...rest] = process.argv.slice(2);
  // global flags may sit before the subcommand: `quotes --json list`
  while (cmd && cmd.startsWith('--')) { rest.push(cmd); cmd = rest.shift(); }
  const { positional, flags } = parseArgs(rest);
  const asJson = (v) => { console.log(JSON.stringify(v, null, 2)); };

  switch (cmd) {
    case 'list': {
      const { quotations } = await call('GET', '/api/quotations');
      if (flags.json) return asJson({ quotations });
      if (!quotations.length) return console.log('no quotations');
      for (const q of [...quotations].reverse()) {
        process.stdout.write(`${q.id}  ${q.number}  ${q.status.padEnd(10)} ${q.issue_date ?? ''}  `);
        try {
          const d = await call('GET', `/api/quotations/${q.id}`);
          process.stdout.write(money(d.totals.payableSatang));
        } catch { process.stdout.write('?'); }
        process.stdout.write('\n');
      }
      return;
    }
    case 'new': {
      const body = { client_id: Number(need(flags, 'client', 'client id')) };
      if (flags.lang) body.lang = flags.lang;
      if (flags.notes) body.notes = flags.notes;
      if (flags.date) body.issue_date = flags.date;
      // term_months is not accepted by the create route — it is an edit on the
      // draft — so --term is applied as a follow-up PUT. Validate FIRST: a bad
      // value must not leave an orphan draft behind that the PUT then refuses.
      const hasTerm = flags.term !== undefined && flags.term !== true;
      const term = hasTerm ? Number(flags.term) : 0;
      if (hasTerm && (!Number.isSafeInteger(term) || term < 0 || term > 600)) {
        console.error('--term must be a whole number of months between 0 and 600 (0 = no term stated)');
        process.exit(1);
      }
      let { quotation } = await call('POST', '/api/quotations', body);
      if (hasTerm) {
        // Keep the PUT's document as the final state. Printing the POST copy
        // reported termMonths 0 while the server had stored the term — --json
        // is meant to be what the server holds, not what it held a call ago.
        ({ quotation } = await call('PUT', `/api/quotations/${quotation.id}`, { term_months: term }));
      }
      if (flags.json) return asJson({ quotation });
      const termNote = quotation.termMonths ? `, term ${quotation.termMonths}m` : '';
      console.log(`created ${quotation.number} (id ${quotation.id}, ${quotation.status}${termNote})`);
      return;
    }
    case 'show': {
      const id = needId(positional, 0, 'quotation id');
      const doc = await call('GET', `/api/quotations/${id}`);
      if (flags.json) return asJson(doc);
      const q = doc.quotation;
      console.log(`${q.number} [${q.status}]  ${q.issueDate} -> ${q.validUntil}  (${q.lang}, ${q.currency})`);
      console.log(`client: ${doc.client?.name ?? '—'}`);
      // A quotation corrected in place KEEPS its number, so the revision — and
      // whether the document has drifted from it — is the only way to tell from
      // a terminal what the client is actually holding.
      if (q.revision) {
        console.log(`revision: ${q.revision}${q.revisionStale
          ? `  EDITED SINCE — run \`quotes issue ${q.id}\` to record it as revision ${q.revision + 1} (the PDF is refused until then)`
          : ''}`);
      }
      if (q.termMonths) console.log(`term: ${q.termMonths} months`);
      let section = null;
      for (const l of doc.lines) {
        if ((l.section ?? '') !== section) {
          section = l.section ?? '';
          if (section) console.log(`  -- ${section} --`);
        }
        const period = l.billingPeriod && l.billingPeriod !== 'once' ? ` ${l.billingPeriod}` : '';
        const marker = l.optional ? 'o.' : `${l.position}.`;
        console.log(`  ${marker} [${l.kind}${period}] ${l.descriptionEn}${l.descriptionTh ? ` / ${l.descriptionTh}` : ''}${l.optional ? '  (OPTION)' : ''}`);
        console.log(`     ${l.qty} ${l.unit} x ${money(l.unitSatang)}${l.discountSatang ? ` - ${money(l.discountSatang)}` : ''} = ${money(l.subtotalSatang)}`);
      }
      const t = doc.totals;
      // The split only earns a line when the quotation actually mixes one-time
      // and recurring charges; a plain one-off quote prints what it always did.
      if (t.hasRecurring) {
        if (t.oneTimeSatang) console.log(`  one-time ${money(t.oneTimeSatang)}`);
        for (const p of ['monthly', 'quarterly', 'yearly']) {
          if (t.recurringSatang?.[p]) console.log(`  recurring ${p} ${money(t.recurringSatang[p])}`);
        }
      }
      console.log(`  subtotal ${money(t.subtotalSatang)}  discount -${money(t.discountSatang)}  net ${money(t.netSatang)}`);
      console.log(`  VAT ${t.vatRate}% ${money(t.vatSatang)}  grand ${money(t.grandSatang)}  WHT ${t.whtRate}% (${t.whtMode}) ${money(t.whtSatang)}`);
      console.log(`  PAYABLE ${money(t.payableSatang)}`);
      // A MEMO, never a payable: spend across the term, carrying no VAT.
      if (t.contractTotalSatang != null) {
        console.log(`  contract total (${t.termMonths} months, memo, no VAT) ${money(t.contractTotalSatang)}`);
      }
      if (t.optionalSatang) console.log(`  options (not included) ${money(t.optionalSatang)}`);
      return;
    }
    case 'line-add': {
      const id = needId(positional, 0, 'quotation id');
      const body = {
        // The vocabulary is operator-editable, so the CLI does not carry a copy
        // of it: `quotes kinds` prints the live list and the server rejects
        // anything not on it. Naming a closed pair here would teach the old
        // constraint back.
        kind: need(flags, 'kind', 'line type — run `quotes kinds` for the list'),
        description_en: need(flags, 'desc', 'english description'),
        qty: need(flags, 'qty', 'decimal quantity'),
        unit_price: need(flags, 'price', 'decimal THB price'),
      };
      // parseArgs normalises --desc-th to desc_th, so the old flags['desc-th']
      // lookup never matched and every CLI Thai description was silently
      // dropped. Both spellings are accepted now.
      const descTh = flags.desc_th ?? flags['desc-th'];
      if (descTh && descTh !== true) body.description_th = String(descTh);
      if (flags.unit) body.unit = flags.unit;
      if (flags.period) body.billing_period = flags.period;
      if (flags.section) body.section = flags.section;
      if (flags.optional) body.optional = true;
      if (flags.discount !== undefined) body.discount_satang = Number(flags.discount);
      const r = await call('POST', `/api/quotations/${id}/lines`, body);
      if (flags.json) return asJson(r);
      const opt = r.line.optional ? ' [OPTION — excluded from totals]' : '';
      console.log(`line ${r.line.id} added${opt}; payable now ${money(r.totals.payableSatang)}`);
      return;
    }
    case 'kinds': {
      // Prints the live vocabulary the server validates against, so an operator
      // never has to guess what --kind accepts.
      const v = await call('GET', '/api/line-kinds');
      if (flags.json) return asJson(v);
      console.log('line types (--kind):');
      for (const k of v.kinds) console.log(`  ${String(k.code).padEnd(14)} ${k.en}${k.th ? ` / ${k.th}` : ''}`);
      console.log('billing periods (--period):');
      for (const p of v.billing_periods) console.log(`  ${String(p.code).padEnd(14)} ${p.en}${p.th ? ` / ${p.th}` : ''}`);
      return;
    }
    case 'line-rm': {
      const id = needId(positional, 0, 'quotation id');
      const lineId = needId(positional, 1, 'line id');
      const r = await call('DELETE', `/api/quotations/${id}/lines/${lineId}`);
      if (flags.json) return asJson(r);
      console.log(`line ${lineId} removed; payable now ${money(r.totals.payableSatang)}`);
      return;
    }
    case 'issue': {
      const id = needId(positional, 0, 'quotation id');
      const r = await call('POST', `/api/quotations/${id}/issue`);
      if (flags.json) return asJson(r);
      console.log(`issued ${r.quotation.number}: revision ${r.rev}, payable ${money(r.totals.payableSatang)}`);
      return;
    }
    case 'status': {
      const id = needId(positional, 0, 'quotation id');
      const status = need({ status: positional[1] }, 'status', 'draft|issued|superseded|cancelled');
      const r = await call('POST', `/api/quotations/${id}/status`, { status });
      if (flags.json) return asJson(r);
      console.log(`${r.quotation.number} -> ${r.status}${r.rev ? ` (rev ${r.rev})` : ''}`);
      return;
    }
    case 'revisions': {
      const id = needId(positional, 0, 'quotation id');
      const r = await call('GET', `/api/quotations/${id}/revisions`);
      if (flags.json) return asJson(r);
      if (!r.revisions.length) { console.log('no revisions — this quotation has not been issued'); return; }
      // created_at is stored as UTC datetime('now'); print it as stored rather
      // than guessing a local zone the server never recorded.
      for (const v of r.revisions) console.log(`rev ${String(v.rev).padStart(2)}  ${v.created_at} UTC  ${v.actor}`);
      return;
    }
    case 'clients': {
      const { clients } = await call('GET', '/api/clients');
      if (flags.json) return asJson({ clients });
      for (const c of clients) console.log(`${c.id}  ${c.name}${c.name_th ? ` / ${c.name_th}` : ''}${c.tax_id ? `  (tax ${c.tax_id})` : ''}`);
      return;
    }
    case 'client-add': {
      const body = { name: need(flags, 'name', 'client name') };
      for (const k of ['name_th', 'tax_id', 'contact', 'email', 'phone', 'address', 'address_th']) {
        if (flags[k]) body[k] = flags[k];
      }
      const { client } = await call('POST', '/api/clients', body);
      if (flags.json) return asJson({ client });
      console.log(`client ${client.id}: ${client.name}`);
      return;
    }
    case 'settings': {
      return asJson(await call('GET', '/api/settings'));
    }
    case 'set': {
      const key = need({ key: positional[0] }, 'key', 'settings key');
      const value = need({ value: positional[1] }, 'value', 'new value');
      const r = await call('PUT', '/api/settings', { settings: { [key]: value } });
      if (flags.json) return asJson(r);
      console.log(`${key} = ${value}`);
      return;
    }
    case 'pdf': {
      const id = needId(positional, 0, 'quotation id');
      const lang = flags.lang === 'th' ? 'th' : 'en';
      const res = await fetch(`${URL_BASE}/api/quotations/${id}/pdf?lang=${lang}`, {
        headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : {},
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const out = flags.o ?? `${id}-${lang}.pdf`;
      const { writeFile } = await import('node:fs/promises');
      await writeFile(out, buf);
      if (flags.json) return asJson({ file: out, bytes: buf.length });
      console.log(`${out} written (${buf.length} bytes)`);
      return;
    }
    // ---- pipeline shortcuts -------------------------------------------
    case 'propose':
    case 'accept':
    case 'decline': {
      const id = needId(positional, 0, 'quotation id');
      const target = { propose: 'proposed', accept: 'accepted', decline: 'declined' }[cmd];
      const r = await call('POST', `/api/quotations/${id}/status`, { status: target });
      if (flags.json) return asJson(r);
      console.log(`${r.quotation.number} -> ${r.status}`);
      return;
    }

    // ---- invoices ------------------------------------------------------
    case 'invoice': {
      const qid = needId(positional, 0, 'quotation id');
      const body = { quotation_id: qid };
      if (flags.lang) body.lang = flags.lang;
      if (flags.date) body.issue_date = flags.date;
      if (flags.notes) body.notes = flags.notes;
      const r = await call('POST', '/api/invoices', body);
      if (flags.json) return asJson(r);
      console.log(`draft invoice ${r.invoice.number} (id ${r.invoice.id}) from ${r.invoice.quotationNumber}`);
      console.log(`  payable ${money(r.totals.payableSatang)} — rates are frozen when you run: quotes inv-issue ${r.invoice.id}`);
      return;
    }
    case 'invoices': {
      const qs = [];
      if (flags.status) qs.push(`status=${encodeURIComponent(flags.status)}`);
      if (flags.month) qs.push(`month=${encodeURIComponent(flags.month)}`);
      const { invoices } = await call('GET', `/api/invoices${qs.length ? `?${qs.join('&')}` : ''}`);
      if (flags.json) return asJson({ invoices });
      if (!invoices.length) return console.log('no invoices');
      for (const i of [...invoices].reverse()) {
        console.log(`${i.id}  ${i.number}  ${String(i.status).padEnd(10)} ${i.issue_date || '(unissued)'}  ${money(i.payable_satang)}`);
      }
      return;
    }
    case 'inv-show': {
      const id = needId(positional, 0, 'invoice id');
      const doc = await call('GET', `/api/invoices/${id}`);
      if (flags.json) return asJson(doc);
      const i = doc.invoice;
      console.log(`${i.number} [${i.status}]  issued ${i.issueDate || '—'}  due ${i.dueDate || '—'}  (${i.lang}, ${i.currency})`);
      if (i.quotationNumber) console.log(`from quotation: ${i.quotationNumber}`);
      console.log(`client: ${doc.client?.name ?? '—'}${doc.client?.taxId ? `  (tax ${doc.client.taxId})` : ''}`);
      for (const l of doc.lines) {
        console.log(`  ${l.position}. [${l.kind}] ${l.descriptionEn}`);
        console.log(`     ${l.qty} ${l.unit} x ${money(l.unitSatang)}${l.discountSatang ? ` - ${money(l.discountSatang)}` : ''} = ${money(l.subtotalSatang)}`);
      }
      const t = doc.totals;
      console.log(`  net ${money(t.netSatang)}  VAT ${t.vatRate}% ${money(t.vatSatang)}  grand ${money(t.grandSatang)}`);
      console.log(`  WHT ${t.whtRate}% (${t.whtMode}) ${money(t.whtSatang)}   PAYABLE ${money(t.payableSatang)}`);
      const b = doc.balance;
      console.log(`  settled ${money(b.settledSatang)} of ${money(b.payableSatang)} (cash ${money(b.paidSatang)} + withheld ${money(b.withheldSatang)}) — outstanding ${money(b.outstandingSatang)}`);
      for (const p of doc.payments) console.log(`   paid  ${p.paidOn}  ${money(p.amountSatang)}  ${p.method}${p.reference ? ` ref ${p.reference}` : ''}`);
      for (const w of doc.wht_certificates) console.log(`   wht   ${w.issuedOn}  ${money(w.whtSatang)}  ${w.pndForm}${w.certNumber ? ` #${w.certNumber}` : ''}`);
      return;
    }
    case 'inv-issue': {
      const id = needId(positional, 0, 'invoice id');
      const body = {};
      if (flags.date) body.issue_date = flags.date;
      const r = await call('POST', `/api/invoices/${id}/issue`, body);
      if (flags.json) return asJson(r);
      console.log(`issued ${r.invoice.number} — tax point ${r.invoice.issueDate}, due ${r.invoice.dueDate}`);
      console.log(`  FROZEN: VAT ${r.totals.vatRate}% = ${money(r.totals.vatSatang)}, WHT ${r.totals.whtRate}% = ${money(r.totals.whtSatang)}`);
      console.log(`  payable ${money(r.totals.payableSatang)}`);
      return;
    }
    case 'inv-status': {
      const id = needId(positional, 0, 'invoice id');
      const status = need({ status: positional[1] }, 'status', 'draft|issued|paid|cancelled');
      const r = await call('POST', `/api/invoices/${id}/status`, { status });
      if (flags.json) return asJson(r);
      console.log(`${r.invoice.number} -> ${r.invoice.status}`);
      return;
    }
    case 'pay': {
      const id = needId(positional, 0, 'invoice id');
      const body = { amount: need(flags, 'amount', 'decimal THB amount') };
      if (flags.date) body.paid_on = flags.date;
      if (flags.method) body.method = flags.method;
      if (flags.ref) body.reference = flags.ref;
      if (flags.note) body.note = flags.note;
      const r = await call('POST', `/api/invoices/${id}/payments`, body);
      if (flags.json) return asJson(r);
      const b = r.balance;
      console.log(`${r.invoice.number}: payment recorded — cash ${money(b.paidSatang)}, withheld ${money(b.withheldSatang)}`);
      console.log(`  outstanding ${money(b.outstandingSatang)}${b.settled ? ' — SETTLED' : ''}  [${r.invoice.status}]`);
      return;
    }
    case 'wht-add': {
      const id = needId(positional, 0, 'invoice id');
      const body = {
        base: need(flags, 'base', 'NET (pre-VAT) amount withheld on'),
        wht: need(flags, 'wht', 'withheld amount'),
      };
      if (flags.cert) body.cert_number = flags.cert;
      if (flags.date) body.issued_on = flags.date;
      if (flags.form) body.pnd_form = flags.form;
      if (flags.rate) body.rate_percent = flags.rate;
      if (flags.payer) body.payer_name = flags.payer;
      if (flags.payer_tax_id) body.payer_tax_id = flags.payer_tax_id;
      const r = await call('POST', `/api/invoices/${id}/wht`, body);
      if (flags.json) return asJson(r);
      const b = r.balance;
      console.log(`${r.invoice.number}: certificate recorded — withheld total ${money(b.withheldSatang)}`);
      console.log(`  outstanding ${money(b.outstandingSatang)}${b.settled ? ' — SETTLED' : ''}  [${r.invoice.status}]`);
      return;
    }
    case 'inv-pdf': {
      const id = needId(positional, 0, 'invoice id');
      const lang = flags.lang === 'th' ? 'th' : 'en';
      const res = await fetch(`${URL_BASE}/api/invoices/${id}/pdf?lang=${lang}`, {
        headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : {},
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const out = flags.o ?? `invoice-${id}-${lang}.pdf`;
      const { writeFile } = await import('node:fs/promises');
      await writeFile(out, buf);
      if (flags.json) return asJson({ file: out, bytes: buf.length });
      console.log(`${out} written (${buf.length} bytes)`);
      return;
    }

    // ---- reports (worksheets to transcribe, never a filing) -------------
    case 'report': {
      const kind = positional[0];
      const year = flags.year ?? String(new Date().getFullYear());
      if (kind === 'pp30') {
        const month = need(flags, 'month', '1-12');
        const { report: r } = await call('GET', `/api/reports/pp30?year=${year}&month=${month}`);
        if (flags.json) return asJson(r);
        console.log(`PP 30 output worksheet — ${r.period}  (${r.invoiceCount} invoice(s))`);
        console.log(`  file by ${r.dueOn.paper} on paper, ${r.dueOn.efiling} e-filing`);
        console.log(`  VAT-able sales   ${money(r.vatableNetSatang)}`);
        console.log(`  OUTPUT VAT       ${money(r.outputVatSatang)}`);
        if (r.zeroRatedOrExemptSatang) {
          console.log(`  zero-rated/exempt ${money(r.zeroRatedOrExemptSatang)}  ** classify by hand: these occupy different PP 30 boxes **`);
        }
        console.log(`  total sales      ${money(r.totalSalesSatang)}`);
        console.log('  input VAT: not tracked — expenses are out of scope, so this is NOT the amount to remit');
        return;
      }
      if (kind === 'income') {
        const { report: r } = await call('GET', `/api/reports/income?year=${year}`);
        if (flags.json) return asJson(r);
        console.log(`Income ${r.year} (${r.basis})`);
        for (const m of r.months) {
          if (!m.invoiceCount) continue;
          console.log(`  ${m.period}  ${String(m.invoiceCount).padStart(3)} inv   net ${money(m.netSatang).padStart(16)}   VAT ${money(m.vatSatang)}`);
        }
        console.log(`  TOTAL net ${money(r.totalNetSatang)}   VAT ${money(r.totalVatSatang)}   WHT noted ${money(r.totalWhtSatang)}`);
        return;
      }
      if (kind === 'wht') {
        const qs = [];
        if (flags.from) qs.push(`from=${flags.from}`);
        if (flags.to) qs.push(`to=${flags.to}`);
        const { report: r } = await call('GET', `/api/reports/wht${qs.length ? `?${qs.join('&')}` : ''}`);
        if (flags.json) return asJson(r);
        console.log(`WHT certificates received ${r.from} .. ${r.to}  (${r.count})`);
        for (const c of r.certificates) {
          console.log(`  ${c.issuedOn}  ${c.pndForm.padEnd(6)} ${money(c.whtSatang).padStart(14)}  on ${money(c.baseSatang)}  ${c.invoiceNumber}${c.payerName ? `  ${c.payerName}` : ''}`);
        }
        console.log(`  TOTAL creditable ${money(r.totalWhtSatang)}`);
        return;
      }
      if (kind === 'pnd') {
        const half = flags.half ? `&half=${flags.half}` : '';
        const { report: r } = await call('GET', `/api/reports/pnd?year=${year}${half}`);
        if (flags.json) return asJson(r);
        console.log(`${r.form} — ${r.periodFrom} .. ${r.periodTo}`);
        console.log(`  revenue           ${money(r.revenueSatang)}  (${r.invoiceCount} invoices, ${r.basis})`);
        console.log(`  creditable WHT    ${money(r.creditableWhtSatang)}`);
        console.log('  expenses / taxable profit: not tracked — this is a revenue summary, not a return');
        return;
      }
      if (kind === 'pipeline') {
        const { report: r } = await call('GET', `/api/reports/pipeline${flags.year ? `?year=${flags.year}` : ''}`);
        if (flags.json) return asJson(r);
        console.log('PIPELINE (forecast — never income)');
        console.log(`  proposed ${r.pipeline.proposedCount}   accepted ${r.pipeline.acceptedCount}   declined ${r.pipeline.declinedCount}`);
        console.log('RECOGNISED INCOME');
        console.log(`  ${money(r.recognisedIncome.netSatang)} net across ${r.recognisedIncome.invoiceCount} invoice(s) — ${r.recognisedIncome.basis}`);
        console.log(`  outstanding receivable ${money(r.outstandingReceivableSatang)}`);
        return;
      }
      console.error('report kinds: pp30 --month N | income | wht [--from --to] | pnd [--half 1|2] | pipeline');
      process.exit(1);
      return;
    }

    default:
      console.error(`unknown command: ${cmd ?? '(none)'}`);
      console.error('quotations: list new show line-add line-rm issue status propose accept decline revisions');
      console.error('invoices:   invoice invoices inv-show inv-issue inv-status pay wht-add inv-pdf');
      console.error('reports:    report pp30 --month N | report income | report wht | report pnd | report pipeline');
      console.error('other:      clients client-add settings set pdf');
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(`error: ${e.message}`);
  process.exit(1);
});