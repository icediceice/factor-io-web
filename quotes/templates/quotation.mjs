// quotes/templates/quotation.mjs — bilingual EN/TH A4 quotation document.
//
// renderQuotationHtml(doc, lang) -> complete HTML string for --print-to-pdf.
// EVERY business fact comes from the document object (which the API builds
// from settings rows): issuer block, tax id, bank details, rates, terms.
// Nothing here names a company, a rate, or a currency. lang: 'en' | 'th'.

import { formatMoney, formatEnDate, formatThaiDate } from '../lib/money.mjs';

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
    service: 'บริการ',
    hardware: 'ฮาร์ดแวร์',
  },
};

function fmtDate(iso, lang) {
  if (!iso) return '';
  return lang === 'th' ? formatThaiDate(iso) : formatEnDate(iso);
}

export function renderQuotationHtml(doc, lang = 'en') {
  const t = T[lang] ?? T.en;
  const { quotation: q, client, lines, totals, issuer, bank, terms } = doc;
  const cur = { symbol: lang === 'th' ? '฿' : '฿', code: totals.currency ?? 'THB' };
  const money = (s) => esc(formatMoney(s, cur));
  const lineName = (l) => esc(lang === 'th' && l.descriptionTh ? l.descriptionTh : l.descriptionEn);
  const vatLabel = `${t.vat} ${esc(totals.vatRate)}%`;
  const whtLabel = totals.whtMode === 'deduct' ? t.whtDeduct : t.whtMemo;

  const lineRows = lines.map((l) => `
      <tr>
        <td class="pos">${l.position}</td>
        <td class="desc">
          <strong>${lineName(l)}</strong>
          ${l.descriptionEn && lang === 'th' && l.descriptionTh ? `<span class="alt">${esc(l.descriptionEn)}</span>` : ''}
        </td>
        <td class="kind">${t[l.kind] ?? esc(l.kind)}</td>
        <td class="num qty">${esc(l.qty)}</td>
        <td class="unit">${esc(l.unit)}</td>
        <td class="num">${money(l.unitSatang)}</td>
        <td class="num">${money(l.subtotalSatang)}</td>
      </tr>`).join('\n');

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
  /* screen preview mirrors the print content box (A4 - margins) */
  @media screen { body { padding: 16mm 14mm; background: #e8e6de; } .doc { background: #fff; padding: 6mm; box-shadow: 0 1px 6px rgba(23,45,42,.18); } }
  :root { --paper:#f4f3ed; --ink:#172d2a; --muted:#4b605b; --accent:#006a57;
          --tint:#e2ede5; --line:#bdc9c1;
          --sans:${lang === 'th' ? "'Loma','Noto Sans Thai'," : ''}Inter,Tahoma,system-ui,sans-serif;
          --mono:ui-monospace,'SFMono-Regular',Consolas,${lang === 'th' ? "'Loma'," : ''}monospace; }
  * { box-sizing: border-box; }
  body { margin:0; color:var(--ink); font:10.5pt/1.65 var(--sans); }
  .doc { max-width:100%; }
  header { display:flex; justify-content:space-between; align-items:flex-start;
           border-bottom:2.5pt solid var(--accent); padding-bottom:14pt; gap:16pt; }
  .brand { font-size:15pt; font-weight:750; letter-spacing:.06em; }
  .brand .io { color:var(--accent); font-family:var(--mono); }
  .issuer { margin-top:6pt; color:var(--muted); font-size:8.5pt; line-height:1.55; }
  .issuer strong { color:var(--ink); font-size:10pt; }
  .logo { max-height:52pt; max-width:150pt; }
  h1 { font-size:14.5pt; letter-spacing:.12em; margin:0 0 6pt; font-weight:750; color:var(--accent); }
  header > div:last-child { min-width:0; }
  .meta { font-family:var(--mono); font-size:8pt; color:var(--muted); text-align:right; line-height:1.8; overflow-wrap:anywhere; }
  .meta b { color:var(--ink); }
  .parties { display:flex; gap:20pt; margin:16pt 0 14pt; }
  .party { flex:1; border:1px solid var(--line); background:var(--tint); padding:10pt 12pt; }
  .party .kicker { font:7.5pt/1 var(--mono); letter-spacing:.12em; text-transform:uppercase; color:var(--accent); margin-bottom:6pt; }
  .party .name { font-weight:750; font-size:11pt; }
  .party .sub { color:var(--muted); font-size:8.5pt; margin-top:3pt; line-height:1.6; }
  table.lines { width:100%; border-collapse:collapse; margin-top:4pt; }
  table.lines th { font:7.5pt/1.4 var(--mono); letter-spacing:.08em; text-transform:uppercase;
                   text-align:left; color:var(--muted); border-bottom:1.5pt solid var(--ink); padding:5pt 6pt; }
  table.lines td { border-bottom:.5pt solid var(--line); padding:7pt 6pt; vertical-align:top; }
  table.lines .num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  table.lines .pos { color:var(--accent); font-family:var(--mono); font-size:8pt; width:14pt; }
  table.lines .desc strong { font-weight:600; }
  table.lines .desc .alt { display:block; color:var(--muted); font-size:8.5pt; }
  table.lines .kind { font-size:8pt; color:var(--muted); }
  table.totals { margin-left:auto; margin-top:10pt; border-collapse:collapse; min-width:78mm; }
  table.totals td { padding:4pt 8pt; font-size:10pt; }
  table.totals .lbl { color:var(--muted); text-align:right; }
  table.totals .num { text-align:right; font-variant-numeric:tabular-nums; min-width:26mm; }
  table.totals tr.grand td { border-top:1.5pt solid var(--ink); font-weight:750; font-size:11.5pt; padding-top:7pt; }
  table.totals tr.payable td { font-weight:750; color:var(--accent); }
  table.totals tr.memo td { color:var(--muted); font-size:8.5pt; }
  table.totals tr.fx td { font-size:8.5pt; color:var(--muted); border-top:.5pt solid var(--line); }
  .blocks { display:flex; gap:16pt; margin-top:16pt; }
  .block { flex:1; border-top:1.5pt solid var(--accent); padding-top:7pt; }
  .block h2 { font:7.5pt/1 var(--mono); letter-spacing:.12em; text-transform:uppercase; color:var(--accent); margin:0 0 6pt; }
  .block p { margin:0; font-size:9pt; line-height:1.7; color:var(--ink); white-space:pre-wrap; }
  .block .sub { color:var(--muted); }
  ol.terms { margin:0; padding-inline-start:14pt; font-size:8.5pt; color:var(--muted); line-height:1.7; }
  ol.terms li { margin-bottom:3pt; }
  .sign { display:flex; gap:40pt; margin-top:26pt; }
  .sign div { flex:1; border-top:.75pt solid var(--line); padding-top:6pt; font-size:8.5pt; color:var(--muted); text-align:center; }
  footer { margin-top:20pt; border-top:.5pt solid var(--line); padding-top:7pt;
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
        ${esc(t.number)} <b>${esc(q.number)}</b><br>
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

  <table class="lines">
    <thead>
      <tr>
        <th class="pos">#</th><th>${esc(t.item)}</th><th>${esc(t.kind)}</th>
        <th class="num">${esc(t.qty)}</th><th>${esc(t.unit)}</th>
        <th class="num">${esc(t.unitPrice)}</th><th class="num">${esc(t.amount)}</th>
      </tr>
    </thead>
    <tbody>${lineRows}
    </tbody>
  </table>

  <table class="totals">
    <tr class="memo"><td class="lbl">${esc(t.subtotal)}</td><td class="num">${money(totals.subtotalSatang)}</td></tr>
    ${totals.discountSatang ? `<tr class="memo"><td class="lbl">${esc(t.discount)}</td><td class="num">−${money(totals.discountSatang)}</td></tr>` : ''}
    <tr><td class="lbl">${esc(t.net)}</td><td class="num">${money(totals.netSatang)}</td></tr>
    <tr><td class="lbl">${esc(vatLabel)}</td><td class="num">${money(totals.vatSatang)}</td></tr>
    <tr class="grand"><td class="lbl">${esc(t.grand)}</td><td class="num">${money(totals.grandSatang)}</td></tr>
    ${totals.whtSatang ? `<tr${totals.whtMode === 'deduct' ? '' : ' class="memo"'}><td class="lbl">${esc(whtLabel)} ${esc(totals.whtRate)}%</td><td class="num">${totals.whtMode === 'deduct' ? '−' : ''}${money(totals.whtSatang)}</td></tr>` : ''}
    <tr class="payable"><td class="lbl">${esc(t.payable)}</td><td class="num">${money(totals.payableSatang)}</td></tr>${fxRow}
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