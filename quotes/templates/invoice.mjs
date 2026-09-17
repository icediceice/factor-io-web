// quotes/templates/invoice.mjs — bilingual EN/TH A4 TAX INVOICE.
//
// renderInvoiceHtml(doc, lang) -> complete HTML string for --print-to-pdf.
// Same contract as templates/quotation.mjs: every business fact arrives on the
// document object (built from settings rows). Nothing here names a company, a
// rate or a currency.
//
// COMPLIANCE — the seven mandatory particulars from the Revenue Department's
// own VAT page (rd.go.th/english/6043.html section 6). Each is marked [N] at
// its render site below; removing any one makes the document invalid as a tax
// invoice, which breaks the CUSTOMER's input-tax claim, not just ours:
//   [1] the words "Tax invoice" in a prominent place
//   [2] name, address and tax ID of the ISSUER
//   [3] name and address of the PURCHASER
//   [4] serial number of the tax invoice
//   [5] description, value and quantity of goods or services
//   [6] amount of VAT chargeable
//   [7] date of issuance
//
// AND section 3.1: the tax base excludes discounts "only if discounts or
// allowances are CLEARLY SHOWN IN THE TAX INVOICES". A discount folded into a
// unit price is therefore not deductible from the VAT base — so every line
// carries its own visible discount figure. Do not collapse that column.

import { formatMoney, formatEnDate, formatThaiDate } from '../lib/money.mjs';
import { PERIOD_LABELS } from '../lib/kinds.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const T = {
  en: {
    title: 'TAX INVOICE',
    subtitle: 'Original',
    number: 'Invoice No.',
    date: 'Date of issue',
    due: 'Due date',
    ref: 'Quotation ref.',
    branch: 'Branch',
    to: 'To',
    from: 'From',
    taxId: 'Tax ID',
    at: 'Attn',
    item: 'Description',
    kind: 'Type',
    period: 'Billing',
    qty: 'Qty',
    unit: 'Unit',
    unitPrice: 'Unit price',
    lineDiscount: 'Discount',
    amount: 'Amount',
    subtotal: 'Subtotal',
    discount: 'Total discount',
    net: 'Net (VAT base)',
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
    branchLabel: 'Branch',
    swift: 'SWIFT',
    terms: 'Terms & conditions',
    signature: 'Authorised signature',
    received: 'Received by',
    asOf: 'as of',
    service: 'Service',
    hardware: 'Hardware',
    settlement: 'Settlement',
    paid: 'Paid',
    withheld: 'Withheld at source',
    outstanding: 'Outstanding',
    settled: 'SETTLED IN FULL',
    cancelled: 'CANCELLED',
    draft: 'DRAFT — NOT A VALID TAX INVOICE',
  },
  th: {
    title: 'ใบกำกับภาษี',
    subtitle: 'ต้นฉบับ',
    number: 'เลขที่',
    date: 'วันที่ออก',
    due: 'ครบกำหนดชำระ',
    ref: 'อ้างอิงใบเสนอราคา',
    branch: 'สาขา',
    to: 'ลูกค้า',
    from: 'ผู้ขาย',
    taxId: 'เลขประจำตัวผู้เสียภาษี',
    at: 'ผู้ติดต่อ',
    item: 'รายการ',
    kind: 'ประเภท',
    period: 'การเรียกเก็บ',
    qty: 'จำนวน',
    unit: 'หน่วย',
    unitPrice: 'ราคาต่อหน่วย',
    lineDiscount: 'ส่วนลด',
    amount: 'จำนวนเงิน',
    subtotal: 'รวมเป็นเงิน',
    discount: 'รวมส่วนลด',
    net: 'ยอดสุทธิ (ฐานภาษี)',
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
    branchLabel: 'สาขา',
    swift: 'SWIFT',
    terms: 'ข้อกำหนดและเงื่อนไข',
    signature: 'ลงชื่อผู้มีอำนาจ',
    received: 'ผู้รับเงิน',
    asOf: 'ณ วันที่',
    service: 'บริการ',
    hardware: 'ฮาร์ดแวร์',
    settlement: 'การชำระเงิน',
    paid: 'ชำระแล้ว',
    withheld: 'ถูกหัก ณ ที่จ่าย',
    outstanding: 'คงค้าง',
    settled: 'ชำระครบถ้วนแล้ว',
    cancelled: 'ยกเลิก',
    draft: 'ฉบับร่าง — ยังไม่ใช่ใบกำกับภาษี',
  },
};

function fmtDate(iso, lang) {
  if (!iso) return '';
  return lang === 'th' ? formatThaiDate(iso) : formatEnDate(iso);
}

export function renderInvoiceHtml(doc, lang = 'en') {
  const t = T[lang] ?? T.en;
  const { invoice: inv, client, lines, totals, issuer, bank, terms, balance } = doc;
  const cur = { symbol: '฿', code: totals.currency ?? 'THB' };
  const money = (s) => esc(formatMoney(s, cur));
  const lineName = (l) => esc(lang === 'th' && l.descriptionTh ? l.descriptionTh : l.descriptionEn);
  const vatLabel = `${t.vat} ${esc(totals.vatRate)}%`;
  const whtLabel = totals.whtMode === 'deduct' ? t.whtDeduct : t.whtMemo;
  const branchName = lang === 'th' ? (issuer.branchTh || issuer.branchEn) : (issuer.branchEn || issuer.branchTh);

  // A draft carries no tax point, so it must not be mistaken for the real
  // thing. A cancelled invoice keeps its number (the series must not gap) but
  // says so across the face of the document.
  const watermark = inv.status === 'draft' ? t.draft : inv.status === 'cancelled' ? t.cancelled : '';

  // [5] description, value AND quantity — plus the separately-shown discount
  // that section 3.1 requires for it to leave the VAT base.
  // Type labels come from the invoice document, which resolved them from the
  // vocabulary AT RAISE TIME — an invoice must keep reading the way it read
  // when it was filed, even if the setting changes afterwards.
  const kindLabels = doc.kindLabels ?? {};
  const kindLabel = (l) => esc(kindLabels[l.kind] ?? t[l.kind] ?? l.kind);
  const periodLabels = PERIOD_LABELS[lang] ?? PERIOD_LABELS.en;
  const anyRecurring = lines.some((l) => (l.billingPeriod ?? 'once') !== 'once');
  const anySection = lines.some((l) => (l.section ?? '') !== '');
  const cols = anyRecurring ? 9 : 8;

  // NOTE: no contract total and no recurring split anywhere on this document.
  // A tax invoice states what is being billed NOW; the term-extended figure is
  // a quotation memo and putting it here would misstate the VAT base.
  const rowFor = (l) => `
      <tr>
        <td class="pos">${l.position}</td>
        <td class="desc">
          <strong>${lineName(l)}</strong>
          ${l.descriptionEn && lang === 'th' && l.descriptionTh ? `<span class="alt">${esc(l.descriptionEn)}</span>` : ''}
        </td>
        <td class="kind">${kindLabel(l)}</td>
        <td class="num qty">${esc(l.qty)}</td>
        <td class="unit">${esc(l.unit)}</td>${anyRecurring ? `
        <td class="period">${esc(periodLabels[l.billingPeriod ?? 'once'] ?? '')}</td>` : ''}
        <td class="num">${money(l.unitSatang)}</td>
        <td class="num disc">${l.discountSatang ? `−${money(l.discountSatang)}` : '—'}</td>
        <td class="num">${money(l.subtotalSatang - (l.discountSatang || 0))}</td>
      </tr>`;

  let lineRows;
  if (!anySection) {
    lineRows = lines.map(rowFor).join('\n');
  } else {
    const chunks = [];
    let current = null;
    for (const l of lines) {
      const name = l.section ?? '';
      if (name !== current) {
        current = name;
        if (name !== '') {
          chunks.push(`
      <tr class="sec"><td colspan="${cols}">${esc(name)}</td></tr>`);
        }
      }
      chunks.push(rowFor(l));
    }
    lineRows = chunks.join('\n');
  }

  const fxRow = totals.thbPayableSatang != null && inv.currency !== 'THB' ? `
      <tr class="fx"><td class="lbl">${esc(t.thbEquiv)} ${esc(inv.fxRate)}${inv.fxAsOf ? `, ${esc(t.asOf)} ${esc(fmtDate(inv.fxAsOf, lang))}` : ''})</td>
      <td class="num">${esc(formatMoney(totals.thbPayableSatang, { symbol: '฿', code: 'THB' }))}</td></tr>` : '';

  const settlementBlock = balance && (balance.paidSatang || balance.withheldSatang) ? `
    <div class="block">
      <h2>${esc(t.settlement)}</h2>
      <table class="settle">
        <tr><td>${esc(t.paid)}</td><td class="num">${money(balance.paidSatang)}</td></tr>
        ${balance.withheldSatang ? `<tr><td>${esc(t.withheld)}</td><td class="num">${money(balance.withheldSatang)}</td></tr>` : ''}
        <tr class="out"><td>${esc(balance.settled ? t.settled : t.outstanding)}</td><td class="num">${balance.settled ? '' : money(balance.outstandingSatang)}</td></tr>
      </table>
    </div>` : '';

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${esc(t.title)} ${esc(inv.number)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm 18mm; }
  @media screen { body { padding: 16mm 14mm; background: #e8e6de; } .doc { background: #fff; padding: 6mm; box-shadow: 0 1px 6px rgba(23,45,42,.18); }
    body.flat { padding: 0; background: #fff; width: 182mm; } body.flat .doc { padding: 0; box-shadow: none; } }
  :root { --paper:#f4f3ed; --ink:#172d2a; --muted:#4b605b; --accent:#006a57;
          --tint:#e2ede5; --line:#bdc9c1; --warn:#9a3412;
          --sans:${lang === 'th' ? "'Loma','Noto Sans Thai'," : ''}Inter,Tahoma,system-ui,sans-serif;
          --mono:ui-monospace,'SFMono-Regular',Consolas,${lang === 'th' ? "'Loma'," : ''}monospace; }
  * { box-sizing: border-box; }
  body { margin:0; color:var(--ink); font:9.5pt/1.55 var(--sans); }
  .doc { max-width:100%; position:relative; }
  header { display:flex; justify-content:space-between; align-items:flex-start;
           border-bottom:2.5pt solid var(--accent); padding-bottom:10pt; gap:16pt; }
  .brand { font-size:15pt; font-weight:750; letter-spacing:.06em; }
  .brand .io { color:var(--accent); font-family:var(--mono); }
  .issuer { margin-top:5pt; color:var(--muted); font-size:8.5pt; line-height:1.45; }
  .issuer strong { color:var(--ink); font-size:10pt; }
  .logo { max-height:52pt; max-width:150pt; }
  /* [1] the words "Tax invoice" in a PROMINENT place — largest text on the page */
  h1 { font-size:17pt; letter-spacing:.1em; margin:0 0 2pt; font-weight:800; color:var(--accent); }
  .subtitle { font:7.5pt/1 var(--mono); letter-spacing:.14em; text-transform:uppercase; color:var(--muted); margin-bottom:6pt; }
  header > div:last-child { min-width:0; }
  .meta { font-family:var(--mono); font-size:8pt; color:var(--muted); text-align:right; line-height:1.8; overflow-wrap:anywhere; }
  .meta b { color:var(--ink); }
  .parties { display:flex; gap:20pt; margin:11pt 0 10pt; }
  .party { flex:1; border:1px solid var(--line); background:var(--tint); padding:8pt 10pt; }
  .party .kicker { font:7.5pt/1 var(--mono); letter-spacing:.12em; text-transform:uppercase; color:var(--accent); margin-bottom:6pt; }
  .party .name { font-weight:750; font-size:11pt; }
  .party .sub { color:var(--muted); font-size:8.5pt; margin-top:3pt; line-height:1.5; }
  table.lines { width:100%; border-collapse:collapse; margin-top:4pt; }
  table.lines th { font:7.5pt/1.4 var(--mono); letter-spacing:.08em; text-transform:uppercase;
                   text-align:left; color:var(--muted); border-bottom:1.5pt solid var(--ink); padding:5pt 6pt; }
  table.lines td { border-bottom:.5pt solid var(--line); padding:5.5pt 6pt; vertical-align:top; }
  table.lines .num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  table.lines .pos { color:var(--accent); font-family:var(--mono); font-size:8pt; width:14pt; }
  table.lines .desc strong { font-weight:600; }
  table.lines .desc .alt { display:block; color:var(--muted); font-size:8.5pt; }
  table.lines .kind { font-size:8pt; color:var(--muted); }
  table.lines .disc { color:var(--muted); font-size:8.5pt; }
  table.lines .period { font-size:8pt; color:var(--muted); font-family:var(--mono); white-space:nowrap; }
  table.lines tr.sec td { background:var(--tint); border-bottom:.5pt solid var(--line);
                          font:7.5pt/1 var(--mono); letter-spacing:.12em; text-transform:uppercase;
                          color:var(--accent); padding:6pt; }
  table.totals { margin-left:auto; margin-top:10pt; border-collapse:collapse; min-width:82mm; }
  table.totals td { padding:3pt 8pt; font-size:10pt; }
  table.totals .lbl { color:var(--muted); text-align:right; }
  table.totals .num { text-align:right; font-variant-numeric:tabular-nums; min-width:26mm; }
  /* [6] the VAT amount gets its own emphasised row — never folded into a total */
  table.totals tr.vat td { font-weight:700; background:var(--tint); }
  table.totals tr.grand td { border-top:1.5pt solid var(--ink); font-weight:750; font-size:11.5pt; padding-top:7pt; }
  table.totals tr.payable td { font-weight:750; color:var(--accent); }
  table.totals tr.memo td { color:var(--muted); font-size:8.5pt; }
  table.totals tr.fx td { font-size:8.5pt; color:var(--muted); border-top:.5pt solid var(--line); }
  .blocks { display:flex; gap:16pt; margin-top:11pt; }
  .block { flex:1; border-top:1.5pt solid var(--accent); padding-top:7pt; }
  .block h2 { font:7.5pt/1 var(--mono); letter-spacing:.12em; text-transform:uppercase; color:var(--accent); margin:0 0 6pt; }
  .block p { margin:0; font-size:9pt; line-height:1.6; color:var(--ink); white-space:pre-wrap; }
  .block .sub { color:var(--muted); line-height:1.55; }
  table.settle { width:100%; border-collapse:collapse; font-size:9pt; }
  table.settle td { padding:2.5pt 0; }
  table.settle .num { text-align:right; font-variant-numeric:tabular-nums; }
  table.settle tr.out td { border-top:.75pt solid var(--line); font-weight:700; color:var(--accent); padding-top:4pt; }
  ol.terms { margin:0; padding-inline-start:14pt; font-size:8.5pt; color:var(--muted); line-height:1.55; }
  ol.terms li { margin-bottom:2pt; }
  .sign { display:flex; gap:40pt; margin-top:16pt; }
  .sign div { flex:1; border-top:.75pt solid var(--line); padding-top:5pt; font-size:8.5pt; color:var(--muted); text-align:center; }
  .watermark { position:absolute; top:42%; left:0; right:0; text-align:center;
               font:28pt/1 var(--mono); letter-spacing:.18em; color:var(--warn);
               opacity:.16; transform:rotate(-14deg); pointer-events:none; }
  footer { margin-top:12pt; border-top:.5pt solid var(--line); padding-top:6pt;
           font:7.5pt/1.6 var(--mono); color:var(--muted);
           display:flex; justify-content:space-between; }
</style>
</head>
<body>
<div class="doc">
  ${watermark ? `<div class="watermark">${esc(watermark)}</div>` : ''}
  <header>
    <div>
      <div class="brand">FACTOR<span class="io"> I/O</span></div>
      <!-- [2] issuer name, address and tax ID -->
      <div class="issuer">
        <strong>${esc(lang === 'th' && issuer.nameTh ? issuer.nameTh : issuer.name)}</strong>
        ${esc(issuer.address) ? `<br>${esc(issuer.address)}` : ''}${esc(issuer.addressTh) && lang === 'th' ? `<br>${esc(issuer.addressTh)}` : ''}${esc(issuer.taxId) ? `<br>${esc(t.taxId)}: <b>${esc(issuer.taxId)}</b>` : ''}${branchName ? `<br>${esc(t.branch)}: <b>${esc(branchName)}</b>${inv.branchCode ? ` (${esc(inv.branchCode)})` : ''}` : ''}${esc(issuer.phone) ? `<br>${esc(issuer.phone)}` : ''}${esc(issuer.email) ? ` · ${esc(issuer.email)}` : ''}
      </div>
    </div>
    <div style="text-align:right">
      ${issuer.logoPath ? `<img class="logo" src="${esc(issuer.logoPath)}" alt="">` : ''}
      <h1>${esc(t.title)}</h1>
      <div class="subtitle">${esc(t.subtitle)}</div>
      <!-- [4] serial number · [7] date of issuance -->
      <div class="meta">
        ${esc(t.number)} <b>${esc(inv.number)}</b><br>
        ${esc(t.date)} <b>${esc(fmtDate(inv.issueDate, lang))}</b><br>
        ${inv.dueDate ? `${esc(t.due)} <b>${esc(fmtDate(inv.dueDate, lang))}</b><br>` : ''}
        ${inv.quotationNumber ? `${esc(t.ref)} <b>${esc(inv.quotationNumber)}</b>` : ''}
      </div>
    </div>
  </header>

  <div class="parties">
    <!-- [3] purchaser name and address -->
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
        <th class="num">${esc(t.qty)}</th><th>${esc(t.unit)}</th>${anyRecurring ? `<th>${esc(t.period)}</th>` : ''}
        <th class="num">${esc(t.unitPrice)}</th>
        <th class="num">${esc(t.lineDiscount)}</th>
        <th class="num">${esc(t.amount)}</th>
      </tr>
    </thead>
    <tbody>${lineRows}
    </tbody>
  </table>

  <table class="totals">
    <tr class="memo"><td class="lbl">${esc(t.subtotal)}</td><td class="num">${money(totals.subtotalSatang)}</td></tr>
    ${totals.discountSatang ? `<tr class="memo"><td class="lbl">${esc(t.discount)}</td><td class="num">−${money(totals.discountSatang)}</td></tr>` : ''}
    <tr><td class="lbl">${esc(t.net)}</td><td class="num">${money(totals.netSatang)}</td></tr>
    <tr class="vat"><td class="lbl">${esc(vatLabel)}</td><td class="num">${money(totals.vatSatang)}</td></tr>
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
        ${esc(t.accountNo)}: ${esc(bank.accountNumber)}${bank.branch ? `<br>${esc(t.branchLabel)}: ${esc(bank.branch)}` : ''}${bank.swift ? `<br>${esc(t.swift)}: ${esc(bank.swift)}` : ''}
      </p>` : ''}
    </div>
    ${settlementBlock}
    ${(lang === 'th' ? terms.bodyTh : terms.bodyEn) ? `
    <div class="block">
      <h2>${esc(t.terms)}</h2>
      <ol class="terms">${(lang === 'th' ? terms.bodyTh : terms.bodyEn).split('\n').filter(Boolean).map((line) => `<li>${esc(line.replace(/^[-•*\s]+/, ''))}</li>`).join('')}
      </ol>
    </div>` : ''}
  </div>

  <div class="sign"><div>${esc(issuer.name)} — ${esc(t.signature)}</div><div>${esc(t.received)}</div></div>

  <footer>
    <span>${esc(issuer.name)}${esc(issuer.taxId) ? ` · ${esc(t.taxId)} ${esc(issuer.taxId)}` : ''}</span>
    <span>${esc(t.title)} ${esc(inv.number)}</span>
  </footer>
</div>
</body>
</html>
`;
}