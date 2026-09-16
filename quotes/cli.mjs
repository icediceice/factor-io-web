#!/usr/bin/env node
// quotes/cli.mjs — the agent's terminal driver for the quotation system.
//
// Talks to the running server on the agent bearer lane (QUOTES_AGENT_TOKEN).
// Every command accepts --json for raw API output. Money crosses as decimal
// strings ("35000.00"), quantities as decimal strings ("0.5") — the server
// rejects floats by design.
//
//   quotes list
//   quotes new --client 1 [--lang th] [--notes "..."] [--date 2026-09-20]
//   quotes show 12
//   quotes line-add 12 --kind service --desc "Workshop" --qty 0.5 \
//                     --price 35000.00 [--unit day] [--desc-th "..."] [--discount 0]
//   quotes line-rm 12 3
//   quotes issue 12
//   quotes status 12 cancelled
//   quotes clients | client-add "Acme" --tax-id ...
//   quotes settings                       # all settings
//   quotes set vat.rate_percent 8         # one setting
//   quotes pdf 12 --lang th -o quote.pdf
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
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else { flags[key] = next; i++; }
    } else positional.push(a);
  }
  return { positional, flags };
}

async function call(method, path, body) {
  const res = await fetch(URL_BASE + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
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
  const [cmd, ...rest] = process.argv.slice(2);
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
      const { quotation } = await call('POST', '/api/quotations', body);
      if (flags.json) return asJson({ quotation });
      console.log(`created ${quotation.number} (id ${quotation.id}, ${quotation.status})`);
      return;
    }
    case 'show': {
      const id = needId(positional, 0, 'quotation id');
      const doc = await call('GET', `/api/quotations/${id}`);
      if (flags.json) return asJson(doc);
      const q = doc.quotation;
      console.log(`${q.number} [${q.status}]  ${q.issueDate} -> ${q.validUntil}  (${q.lang}, ${q.currency})`);
      console.log(`client: ${doc.client?.name ?? '—'}`);
      for (const l of doc.lines) {
        console.log(`  ${l.position}. [${l.kind}] ${l.descriptionEn}${l.descriptionTh ? ` / ${l.descriptionTh}` : ''}`);
        console.log(`     ${l.qty} ${l.unit} x ${money(l.unitSatang)}${l.discountSatang ? ` - ${money(l.discountSatang)}` : ''} = ${money(l.subtotalSatang)}`);
      }
      const t = doc.totals;
      console.log(`  subtotal ${money(t.subtotalSatang)}  discount -${money(t.discountSatang)}  net ${money(t.netSatang)}`);
      console.log(`  VAT ${t.vatRate}% ${money(t.vatSatang)}  grand ${money(t.grandSatang)}  WHT ${t.whtRate}% (${t.whtMode}) ${money(t.whtSatang)}`);
      console.log(`  PAYABLE ${money(t.payableSatang)}`);
      return;
    }
    case 'line-add': {
      const id = needId(positional, 0, 'quotation id');
      const body = {
        kind: need(flags, 'kind', 'service|hardware'),
        description_en: need(flags, 'desc', 'english description'),
        qty: need(flags, 'qty', 'decimal quantity'),
        unit_price: need(flags, 'price', 'decimal THB price'),
      };
      if (flags['desc-th']) body.description_th = flags['desc-th'];
      if (flags.unit) body.unit = flags.unit;
      if (flags.discount !== undefined) body.discount_satang = Number(flags.discount);
      const { line, quotation } = await call('POST', `/api/quotations/${id}/lines`, body);
      if (flags.json) return asJson({ line, quotation });
      console.log(`line ${line.id} added; payable now ${money(quotation.totals.payableSatang)}`);
      return;
    }
    case 'line-rm': {
      const id = needId(positional, 0, 'quotation id');
      const lineId = needId(positional, 1, 'line id');
      const doc = await call('DELETE', `/api/quotations/${id}/lines/${lineId}`);
      if (flags.json) return asJson(doc);
      console.log(`line ${lineId} removed; payable now ${money(doc.totals.payableSatang)}`);
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
      return asJson(await call('GET', `/api/quotations/${id}/revisions`));
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
    default:
      console.error(`unknown command: ${cmd ?? '(none)'}`);
      console.error('commands: list new show line-add line-rm issue status revisions clients client-add settings set pdf');
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(`error: ${e.message}`);
  process.exit(1);
});