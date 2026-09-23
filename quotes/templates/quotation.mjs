// quotes/templates/quotation.mjs — bilingual EN/TH A4 quotation document.
//
// renderQuotationHtml(doc, lang) -> complete HTML string for --print-to-pdf.
// EVERY business fact comes from the document object (which the API builds
// from settings rows): issuer block, tax id, bank details, rates, terms.
// Nothing here names a company, a rate, or a currency. lang: 'en' | 'th'.

import { formatMoney, formatEnDate, formatThaiDate } from '../lib/money.mjs';
import { PERIOD_LABELS, PERIOD_LABELS_LONG } from '../lib/kinds.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const T = {
  en: {
    title: 'QUOTATION',
    number: 'Quotation No.',
    date: 'Date',
    valid: 'Valid until',
    to: 'To',
    taxId: 'Tax ID',
    at: 'Attn',
    item: 'Description',
    kind: 'Type',
    qty: 'Qty',
    unit: 'Unit',
    unitPrice: 'Unit price',
    amount: 'Amount',
    discount: 'Discount',
    subtotal: 'Subtotal',
    net: 'Net',
    vat: 'VAT',
    grand: 'Grand total',
    whtMemo: 'Withholding tax (for information — not deducted)',
    whtDeduct: 'Less withholding tax',
    payable: 'Total payable',
    thbEquiv: 'THB equivalent (rate',
    payment: 'Payment terms',
    bank: 'Bank transfer',
    account: 'Account name',
    accountNo: 'Account number',
    branch: 'Branch',
    swift: 'SWIFT',
    terms: 'Terms & conditions',
    signature: 'Authorised signature',
    page: 'Page',
    asOf: 'as of',
    period: 'Billing',
    option: 'OPTION',
    optionsNote: 'Options shown are not included in the totals below.',
    optionsTotal: 'Options (not included)',
    revision: 'Rev.',
    oneTime: 'One-time',
    recurring: 'Recurring',
    contract: 'Contract total',
    months: 'months',
    sectionTotal: 'Subtotal',
    // Fallback labels for the two kinds that predate the configurable
    // vocabulary; every other label now arrives on doc.kindLabels.
    service: 'Service',
    hardware: 'Hardware',
  },
  th: {
    title: 'ใบเสนอราคา',
    number: 'เลขที่',
    date: 'วันที่',
    valid: 'ราคานี้ใช้ได้ถึง',
    to: 'เรียน',
    taxId: 'เลขประจำตัวผู้เสียภาษี',
    at: 'ผู้ติดต่อ',
    item: 'รายการ',
    kind: 'ประเภท',
    qty: 'จำนวน',
    unit: 'หน่วย',
    unitPrice: 'ราคาต่อหน่วย',
    amount: 'จำนวนเงิน',
    discount: 'ส่วนลด',
    subtotal: 'รวมเป็นเงิน',
    net: 'ยอดสุทธิ',
    vat: 'ภาษีมูลค่าเพิ่ม',
    grand: 'ยอดรวมทั้งสิ้น',
    whtMemo: 'ภาษีหัก ณ ที่จ่าย (ข้อมูลประกอบ — ยังไม่หัก)',
    whtDeduct: 'หักภาษี ณ ที่จ่าย',
    payable: 'ยอดชำระสุทธิ',
    thbEquiv: 'มูลค่าเทียบเงินบาท (อัตรา',
    payment: 'เงื่อนไขการชำระเงิน',
    bank: 'โอนเข้าบัญชี',
    account: 'ชื่อบัญชี',
    accountNo: 'เลขที่บัญชี',
    branch: 'สาขา',
    swift: 'SWIFT',
    terms: 'ข้อกำหนดและเงื่อนไข',
    signature: 'ลงชื่อผู้มีอำนาจ',
    page: 'หน้า',
    asOf: 'ณ วันที่',
    period: 'การเรียกเก็บ',
    option: 'ทางเลือก',
    optionsNote: 'รายการทางเลือกไม่รวมอยู่ในยอดรวมด้านล่าง',
    optionsTotal: 'รายการทางเลือก (ไม่รวมในยอดรวม)',
    revision: 'ฉบับแก้ไขครั้งที่',
    oneTime: 'ชำระครั้งเดียว',
    recurring: 'ค่าบริการต่อเนื่อง',
    contract: 'มูลค่ารวมตลอดสัญญา',
    months: 'เดือน',
    sectionTotal: 'รวมหมวด',
    service: 'บริการ',
    hardware: 'ฮาร์ดแวร์',
  },
};

function fmtDate(iso, lang) {
  if (!iso) return '';
  return lang === 'th' ? formatThaiDate(iso) : formatEnDate(iso);
}

function sowSection(sow, lang) {
  if (!sow) return '';
  const text = (pair) => esc(lang === 'th' && pair?.th ? pair.th : pair?.en);
  const modules = (sow.modules ?? []).filter((m) => m.included);
  const list = (items) => items.length ? `<ul>${items.map((item) => `<li>${text(item)}</li>`).join('')}</ul>` : '';
  return `<section class="sow" aria-label="Statement of work">
    <h2>${lang === 'th' ? 'ขอบเขตงาน' : 'Statement of work'}</h2>
    <p>${text(sow.summary)}</p>
    ${modules.map((m) => `<div class="sow-module"><h3>${esc(lang === 'th' && m.titleTh ? m.titleTh : m.titleEn)}</h3>${list(m.items ?? [])}</div>`).join('')}
    ${sow.assumptions?.length ? `<h3>${lang === 'th' ? 'ข้อสมมติ' : 'Assumptions'}</h3>${list(sow.assumptions)}` : ''}
    ${sow.exclusions?.length ? `<h3>${lang === 'th' ? 'ไม่รวมในขอบเขต' : 'Exclusions'}</h3>${list(sow.exclusions)}` : ''}
  </section>`;
}

export function renderQuotationHtml(doc, lang = 'en') {
  const t = T[lang] ?? T.en;
  const { quotation: q, client, lines, totals, issuer, bank, terms } = doc;
  const cur = { symbol: lang === 'th' ? '฿' : '฿', code: totals.currency ?? 'THB' };
  const money = (s) => esc(formatMoney(s, cur));
  const lineName = (l) => esc(lang === 'th' && l.descriptionTh ? l.descriptionTh : l.descriptionEn);
  const vatLabel = `${t.vat} ${esc(totals.vatRate)}%`;
  const whtLabel = totals.whtMode === 'deduct' ? t.whtDeduct : t.whtMemo;

  // Kind labels come from the document (built from the line.kinds setting), so
  // the vocabulary is operator-editable. The T-table entries for service and
  // hardware remain as a fallback for a document built before kindLabels
  // existed, and the raw code is the last resort so an unknown kind still
  // prints something rather than an empty cell.
  const kindLabels = doc.kindLabels ?? {};
  const kindLabel = (l) => esc(kindLabels[l.kind] ?? t[l.kind] ?? l.kind);
  const periodLabels = PERIOD_LABELS[lang] ?? PERIOD_LABELS.en;
  const anyRecurring = lines.some((l) => (l.billingPeriod ?? 'once') !== 'once');
  const anyOptional = lines.some((l) => l.optional);
  const anySection = lines.some((l) => (l.section ?? '') !== '');
  // Column count for a full-width header/subtotal row: 7 normally, 8 when the
  // billing column is present.
  const cols = anyRecurring ? 8 : 7;

  const rowFor = (l) => `
      <tr${l.optional ? ' class="opt"' : ''}>
        <td class="pos">${l.optional ? '○' : l.position}</td>
        <td class="desc">
          <strong>${lineName(l)}</strong>${l.optional ? ` <span class="optflag">${esc(t.option)}</span>` : ''}
          ${l.descriptionEn && lang === 'th' && l.descriptionTh ? `<span class="alt">${esc(l.descriptionEn)}</span>` : ''}
        </td>
        <td class="kind">${kindLabel(l)}</td>
        <td class="num qty">${esc(l.qty)}</td>
        <td class="unit">${esc(l.unit)}</td>${anyRecurring ? `
        <td class="period">${esc(periodLabels[l.billingPeriod ?? 'once'] ?? '')}</td>` : ''}
        <td class="num">${money(l.unitSatang)}</td>
        <td class="num${l.optional ? ' optamt' : ''}">${money(l.subtotalSatang)}</td>
      </tr>`;

  // Grouping is applied ONLY when at least one line names a section. With no
  // sections the output is the same flat sequence of rows it has always been,
  // which is what keeps existing quotations rendering unchanged.
  let lineRows;
  if (!anySection) {
    lineRows = lines.map(rowFor).join('\n');
  } else {
    // GROSS, to match the AMOUNT column printed above it — the aggregate
    // discount appears once in the totals block, as it always has.
    const sectionGross = new Map((totals.sections ?? []).map((s) => [s.name, s.subtotalSatang ?? s.netSatang]));
    // Group by section NAME, never by contiguous run. computeTotals folds every
    // line of a section into ONE entry (quote.mjs:computeTotals), so a section
    // whose lines are not adjacent would print its header twice and the FULL
    // section subtotal under each half — a figure that looks right and is
    // double the truth. A Map iterates in insertion order, which is the same
    // first-appearance order computeTotals assigns.
    const groups = new Map();
    for (const l of lines) {
      const name = l.section ?? '';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(l);
    }
    const chunks = [];
    for (const [name, group] of groups) {
      if (name !== '') {
        chunks.push(`
      <tr class="sec"><td colspan="${cols}">${esc(name)}</td></tr>`);
      }
      for (const l of group) chunks.push(rowFor(l));
      // A section holding nothing but optional lines has no totals entry — it
      // is in no total by design — so it prints its rows and no subtotal.
      if (name !== '' && sectionGross.has(name)) {
        chunks.push(`
      <tr class="secsum"><td colspan="${cols - 1}">${esc(t.sectionTotal)} — ${esc(name)}</td><td class="num">${money(sectionGross.get(name))}</td></tr>`);
      }
    }
    lineRows = chunks.join('\n');
  }

  // The one-time / recurring split only earns its space when the proposal
  // actually mixes them; a plain one-off quote shows the totals block it
  // always showed.
  const periodLong = PERIOD_LABELS_LONG[lang] ?? PERIOD_LABELS_LONG.en;
  const splitRows = totals.hasRecurring ? [
    totals.oneTimeSatang
      ? `<tr class="memo"><td class="lbl">${esc(t.oneTime)}</td><td class="num">${money(totals.oneTimeSatang)}</td></tr>`
      : '',
    ...['monthly', 'quarterly', 'yearly']
      .filter((p) => totals.recurringSatang?.[p])
      .map((p) => `<tr class="memo"><td class="lbl">${esc(t.recurring)} ${esc(periodLong[p])}</td><td class="num">${money(totals.recurringSatang[p])}</td></tr>`),
  ].filter(Boolean).join('\n    ') : '';

  // The contract total is a MEMO: it is spend across the term, carries no VAT
  // and is never what this quotation asks to be paid now. It is rendered
  // BELOW the payable, visually separated, so the two cannot be confused.
  const contractRow = totals.contractTotalSatang != null ? `
      <tr class="contract"><td class="lbl">${esc(t.contract)} (${esc(totals.termMonths)} ${esc(t.months)})</td><td class="num">${money(totals.contractTotalSatang)}</td></tr>` : '';

  // Revision 1 prints NOTHING. A first issue is not "Rev. 1" to a customer,
  // and printing it on every quotation would change the look of every document
  // already sent. From 2 onward it is the only way the customer can tell two
  // documents bearing the SAME number apart — which is the trade that revising
  // in place accepts, so this marking is what makes it honest.
  const revisionNote = Number(q.revision) >= 2
    ? ` <span class="rev">${esc(t.revision)} ${esc(q.revision)}</span>`
    : '';

  const optionRow = totals.optionalSatang ? `
      <tr class="memo opts"><td class="lbl">${esc(t.optionsTotal)}</td><td class="num">${money(totals.optionalSatang)}</td></tr>` : '';

  const fxRow = totals.thbPayableSatang != null && q.currency !== 'THB' ? `
      <tr class="fx"><td></td><td class="lbl">${esc(t.thbEquiv)} ${esc(q.fxRate)}${q.fxAsOf ? `, ${esc(t.asOf)} ${esc(fmtDate(q.fxAsOf, lang))}` : ''})</td>
      <td class="num">${esc(formatMoney(totals.thbPayableSatang, { symbol: '฿', code: 'THB' }))}</td></tr>` : '';

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${esc(t.title)} ${esc(q.number)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm 18mm; }
  /* screen preview mirrors the print content box (A4 - margins);
     #flat = debug view at exact print geometry (no paper chrome) */
  @media screen { body { padding: 16mm 14mm; background: #e8e6de; } .doc { background: #fff; padding: 6mm; box-shadow: 0 1px 6px rgba(23,45,42,.18); }
    body.flat { padding: 0; background: #fff; width: 182mm; } body.flat .doc { padding: 0; box-shadow: none; } }
  :root { --paper:#f4f3ed; --ink:#172d2a; --muted:#4b605b; --accent:#006a57;
          --tint:#e2ede5; --line:#bdc9c1;
          --sans:${lang === 'th' ? "'Loma','Noto Sans Thai'," : ''}Inter,Tahoma,system-ui,sans-serif;
          --mono:ui-monospace,'SFMono-Regular',Consolas,${lang === 'th' ? "'Loma'," : ''}monospace; }
  * { box-sizing: border-box; }
  body { margin:0; color:var(--ink); font:9.5pt/1.55 var(--sans); }
  .doc { max-width:100%; }
  header { display:flex; justify-content:space-between; align-items:flex-start;
           border-bottom:2.5pt solid var(--accent); padding-bottom:10pt; gap:16pt; }
  .brand { font-size:15pt; font-weight:750; letter-spacing:.06em; }
  .brand .io { color:var(--accent); font-family:var(--mono); }
  .issuer { margin-top:5pt; color:var(--muted); font-size:8.5pt; line-height:1.45; }
  .issuer strong { color:var(--ink); font-size:10pt; }
  .logo { max-height:52pt; max-width:150pt; }
  h1 { font-size:14.5pt; letter-spacing:.12em; margin:0 0 6pt; font-weight:750; color:var(--accent); }
  header > div:last-child { min-width:0; }
  .meta { font-family:var(--mono); font-size:8pt; color:var(--muted); text-align:right; line-height:1.8; overflow-wrap:anywhere; }
  .meta b { color:var(--ink); }
  /* Sits beside the quotation number, because the number alone no longer
     identifies the document once a correction has been re-issued under it. */
  .meta .rev { display:inline-block; margin-left:4pt; padding:0 3pt; border:1px solid var(--line); color:var(--ink); }
  .parties { display:flex; gap:20pt; margin:11pt 0 10pt; }
  .party { flex:1; border:1px solid var(--line); background:var(--tint); padding:8pt 10pt; }
  .party .kicker { font:7.5pt/1 var(--mono); letter-spacing:.12em; text-transform:uppercase; color:var(--accent); margin-bottom:6pt; }
  .party .name { font-weight:750; font-size:11pt; }
  .party .sub { color:var(--muted); font-size:8.5pt; margin-top:3pt; line-height:1.5; }
  .sow { border-top:1.5pt solid var(--accent); margin:12pt 0; padding-top:8pt; break-inside:avoid-page; }
  .sow h2 { margin:0 0 5pt; font:8pt var(--mono); letter-spacing:.1em; color:var(--accent); text-transform:uppercase; }
  .sow h3 { margin:7pt 0 3pt; font-size:9pt; }
  .sow p { margin:0 0 5pt; white-space:pre-wrap; }
  .sow ul { margin:2pt 0 6pt; padding-inline-start:16pt; }
  .sow li { break-inside:avoid; white-space:pre-wrap; }
  .sow-module { break-inside:avoid-page; }
  table.lines { width:100%; border-collapse:collapse; margin-top:4pt; }
  table.lines th { font:7.5pt/1.4 var(--mono); letter-spacing:.08em; text-transform:uppercase;
                   text-align:left; color:var(--muted); border-bottom:1.5pt solid var(--ink); padding:5pt 6pt; }
  table.lines td { border-bottom:.5pt solid var(--line); padding:5.5pt 6pt; vertical-align:top; }
  table.lines .num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  table.lines .pos { color:var(--accent); font-family:var(--mono); font-size:8pt; width:14pt; }
  table.lines .desc strong { font-weight:600; }
  table.lines .desc .alt { display:block; color:var(--muted); font-size:8.5pt; }
  table.lines .kind { font-size:8pt; color:var(--muted); }
  table.lines .period { font-size:8pt; color:var(--muted); font-family:var(--mono); white-space:nowrap; }
  /* Section band: a quiet rule, not a heavy fill — the document already has
     enough structure and a solid bar would fight the totals block. */
  table.lines tr.sec td { background:var(--tint); border-bottom:.5pt solid var(--line);
                          font:7.5pt/1 var(--mono); letter-spacing:.12em; text-transform:uppercase;
                          color:var(--accent); padding:6pt; }
  table.lines tr.secsum td { font-size:8.5pt; color:var(--muted); padding-top:4pt; padding-bottom:6pt;
                             border-bottom:.75pt solid var(--line); }
  table.lines tr.secsum td:first-child { text-align:right; font-style:italic; }
  /* An option is priced but owed by nobody: mute it and strike the amount so
     it cannot be mistaken for part of the total. */
  table.lines tr.opt td { color:var(--muted); }
  table.lines tr.opt .pos { color:var(--muted); }
  table.lines .optflag { font:6.5pt/1 var(--mono); letter-spacing:.1em; border:.5pt solid var(--line);
                         padding:1pt 3pt; margin-left:3pt; vertical-align:1pt; }
  table.lines .optamt { font-style:italic; }
  table.totals { margin-left:auto; margin-top:10pt; border-collapse:collapse; min-width:78mm; }
  table.totals td { padding:3pt 8pt; font-size:10pt; }
  table.totals .lbl { color:var(--muted); text-align:right; }
  table.totals .num { text-align:right; font-variant-numeric:tabular-nums; min-width:26mm; }
  table.totals tr.grand td { border-top:1.5pt solid var(--ink); font-weight:750; font-size:11.5pt; padding-top:7pt; }
  table.totals tr.payable td { font-weight:750; color:var(--accent); }
  table.totals tr.memo td { color:var(--muted); font-size:8.5pt; }
  table.totals tr.fx td { font-size:8.5pt; color:var(--muted); border-top:.5pt solid var(--line); }
  /* Contract total sits below the payable behind a rule: it is a forecast of
     spend across the term, not an amount due, and must never read as one. */
  table.totals tr.contract td { border-top:.75pt solid var(--line); padding-top:6pt;
                                font-size:9.5pt; font-weight:600; }
  table.totals tr.contract .lbl { color:var(--accent); }
  table.totals tr.opts td { font-size:8.5pt; font-style:italic; }
  .optnote { margin:8pt 0 0; font-size:8pt; color:var(--muted); font-style:italic; }
  .blocks { display:flex; gap:16pt; margin-top:11pt; }
  .block { flex:1; border-top:1.5pt solid var(--accent); padding-top:7pt; }
  .block h2 { font:7.5pt/1 var(--mono); letter-spacing:.12em; text-transform:uppercase; color:var(--accent); margin:0 0 6pt; }
  .block p { margin:0; font-size:9pt; line-height:1.6; color:var(--ink); white-space:pre-wrap; }
  .block .sub { color:var(--muted); line-height:1.55; }
  ol.terms { margin:0; padding-inline-start:14pt; font-size:8.5pt; color:var(--muted); line-height:1.55; }
  ol.terms li { margin-bottom:2pt; }
  .sign { display:flex; gap:40pt; margin-top:16pt; }
  .sign div { flex:1; border-top:.75pt solid var(--line); padding-top:5pt; font-size:8.5pt; color:var(--muted); text-align:center; }
  footer { margin-top:12pt; border-top:.5pt solid var(--line); padding-top:6pt;
           font:7.5pt/1.6 var(--mono); color:var(--muted);
           display:flex; justify-content:space-between; }
</style>
</head>
<body>
<div class="doc">
  <header>
    <div>
      <div class="brand">FACTOR<span class="io"> I/O</span></div>
      <div class="issuer">
        <strong>${esc(lang === 'th' && issuer.nameTh ? issuer.nameTh : issuer.name)}</strong>
        ${lang === 'th' && issuer.nameEn && issuer.nameTh ? `<br>${esc(issuer.name)}` : ''}${esc(issuer.address) ? `<br>${esc(issuer.address)}` : ''}${esc(issuer.addressTh) && lang === 'th' ? `<br>${esc(issuer.addressTh)}` : ''}${esc(issuer.taxId) ? `<br>${esc(t.taxId)}: <b>${esc(issuer.taxId)}</b>` : ''}${esc(issuer.phone) ? `<br>${esc(issuer.phone)}` : ''}${esc(issuer.email) ? ` · ${esc(issuer.email)}` : ''}${esc(issuer.website) ? ` · ${esc(issuer.website)}` : ''}
      </div>
    </div>
    <div style="text-align:right">
      ${issuer.logoPath ? `<img class="logo" src="${esc(issuer.logoPath)}" alt="">` : ''}
      <h1>${esc(t.title)}</h1>
      <div class="meta">
        ${esc(t.number)} <b>${esc(q.number)}</b>${revisionNote}<br>
        ${esc(t.date)} <b>${esc(fmtDate(q.issueDate, lang))}</b><br>
        ${esc(t.valid)} <b>${esc(fmtDate(q.validUntil, lang))}</b>
      </div>
    </div>
  </header>

  <div class="parties">
    <div class="party">
      <div class="kicker">${esc(t.to)}</div>
      <div class="name">${esc(lang === 'th' && client?.nameTh ? client.nameTh : client?.name)}</div>
      ${client?.address ? `<div class="sub">${esc(client.address)}</div>` : ''}
      ${lang === 'th' && client?.addressTh ? `<div class="sub">${esc(client.addressTh)}</div>` : ''}
      ${client?.taxId ? `<div class="sub">${esc(t.taxId)}: ${esc(client.taxId)}</div>` : ''}
      ${client?.contact ? `<div class="sub">${esc(t.at)}: ${esc(client.contact)}</div>` : ''}
    </div>
  </div>

  ${sowSection(doc.sow, lang)}

  <table class="lines">
    <thead>
      <tr>
        <th class="pos">#</th><th>${esc(t.item)}</th><th>${esc(t.kind)}</th>
        <th class="num">${esc(t.qty)}</th><th>${esc(t.unit)}</th>${anyRecurring ? `<th>${esc(t.period)}</th>` : ''}
        <th class="num">${esc(t.unitPrice)}</th><th class="num">${esc(t.amount)}</th>
      </tr>
    </thead>
    <tbody>${lineRows}
    </tbody>
  </table>

  ${anyOptional ? `<p class="optnote">${esc(t.optionsNote)}</p>` : ''}

  <table class="totals">
    ${splitRows}
    <tr class="memo"><td class="lbl">${esc(t.subtotal)}</td><td class="num">${money(totals.subtotalSatang)}</td></tr>
    ${totals.discountSatang ? `<tr class="memo"><td class="lbl">${esc(t.discount)}</td><td class="num">−${money(totals.discountSatang)}</td></tr>` : ''}
    <tr><td class="lbl">${esc(t.net)}</td><td class="num">${money(totals.netSatang)}</td></tr>
    <tr><td class="lbl">${esc(vatLabel)}</td><td class="num">${money(totals.vatSatang)}</td></tr>
    <tr class="grand"><td class="lbl">${esc(t.grand)}</td><td class="num">${money(totals.grandSatang)}</td></tr>
    ${totals.whtSatang ? `<tr${totals.whtMode === 'deduct' ? '' : ' class="memo"'}><td class="lbl">${esc(whtLabel)} ${esc(totals.whtRate)}%</td><td class="num">${totals.whtMode === 'deduct' ? '−' : ''}${money(totals.whtSatang)}</td></tr>` : ''}
    <tr class="payable"><td class="lbl">${esc(t.payable)}</td><td class="num">${money(totals.payableSatang)}</td></tr>${fxRow}${contractRow}${optionRow}
  </table>

  <div class="blocks">
    <div class="block">
      <h2>${esc(t.payment)}</h2>
      <p>${esc(lang === 'th' && terms.paymentTh ? terms.paymentTh : terms.paymentEn)}</p>
      ${bank.accountNumber ? `
      <p class="sub" style="margin-top:8pt">
        <strong>${esc(t.bank)}</strong><br>
        ${esc(lang === 'th' && bank.nameTh ? bank.nameTh : bank.name)}<br>
        ${esc(t.account)}: ${esc(bank.accountName)}<br>
        ${esc(t.accountNo)}: ${esc(bank.accountNumber)}${bank.branch ? `<br>${esc(t.branch)}: ${esc(bank.branch)}` : ''}${bank.swift ? `<br>${esc(t.swift)}: ${esc(bank.swift)}` : ''}
      </p>` : ''}
    </div>
    ${(lang === 'th' ? terms.bodyTh : terms.bodyEn) ? `
    <div class="block">
      <h2>${esc(t.terms)}</h2>
      <ol class="terms">${(lang === 'th' ? terms.bodyTh : terms.bodyEn).split('\n').filter(Boolean).map((line) => `<li>${esc(line.replace(/^[-•*\s]+/, ''))}</li>`).join('')}
      </ol>
    </div>` : ''}
  </div>

  <div class="sign"><div>${esc(issuer.name)} — ${esc(t.signature)}</div><div>${esc(client?.name ?? '')}</div></div>

  <footer>
    <span>${esc(issuer.name)}${esc(issuer.taxId) ? ` · ${esc(t.taxId)} ${esc(issuer.taxId)}` : ''}</span>
    <span>${esc(q.number)}</span>
  </footer>
</div>
</body>
</html>
`;
}