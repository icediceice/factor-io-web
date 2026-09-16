// quotes/lib/reports.mjs — income and VAT reporting for the Co., Ltd.
//
// EVERY figure here is read from stored invoice columns. Nothing recomputes
// from settings, because a report is what gets transcribed onto a filed return
// and a filed number must not move when the operator edits a rate later.
// lib/invoice.mjs freezes those columns at issue; this module only reads them.
//
// WHAT COUNTS AS INCOME: an invoice with status 'issued' or 'paid', dated by
// its issue_date. That is the accrual basis the operator chose, and it matches
// the Revenue Code tax point for services — "the earliest of: the time a
// payment is made; or tax invoice is issued; or service is utilized"
// (rd.go.th/english/6043.html section 5.2.1). Drafts are not income.
// Cancelled invoices are not income.
//
// THESE ARE WORKSHEETS, NOT FILINGS. Nothing here submits anything to the
// Revenue Department; the output is meant to be read and transcribed.

const num = (v) => (v == null ? 0 : Number(v));
const pad2 = (n) => String(n).padStart(2, '0');

// Only these two statuses are reportable income.
const INCOME_STATUSES = "('issued','paid')";

/**
 * Month keys are a pure STRING PREFIX match on issue_date, deliberately.
 *
 * issue_date is written by lib/money.mjs:todayBkk, which already resolves the
 * calendar date in Asia/Bangkok. The timezone decision is therefore made once,
 * at write time, and reporting never re-derives it. An invoice issued at
 * 23:30 on 31 January Bangkok time is stored as '2026-01-31' and lands in
 * January — no UTC drift, no off-by-one at the month edge.
 */
function monthPrefix(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || y < 2000 || y > 2999) throw new Error(`invalid year: ${year}`);
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error(`invalid month: ${month}`);
  return `${y}-${pad2(m)}`;
}

/** PP 30 is filed by the 15th of the following month (23rd when e-filing). */
function pp30DueDate(year, month) {
  const y = Number(month) === 12 ? Number(year) + 1 : Number(year);
  const m = Number(month) === 12 ? 1 : Number(month) + 1;
  return { paper: `${y}-${pad2(m)}-15`, efiling: `${y}-${pad2(m)}-23` };
}

/**
 * Monthly PP 30 worksheet — OUTPUT side only.
 *
 * The input side (purchases, input VAT) is deliberately absent: expenses are
 * out of scope for this system, so input VAT is not knowable here and is left
 * for the operator to fill in. netPayableSatang is therefore NOT the amount to
 * remit — it is output VAT before any input credit.
 */
export function pp30Monthly(db, { year, month }) {
  const prefix = monthPrefix(year, month);
  const rows = db.prepare(`
    SELECT id, number, issue_date, client_id, vat_rate_percent,
           net_satang, vat_satang, grand_satang, status
    FROM invoices
    WHERE status IN ${INCOME_STATUSES} AND issue_date LIKE ?
    ORDER BY issue_date, id
  `).all(prefix + '%');

  let vatableNetSatang = 0;
  let outputVatSatang = 0;
  let zeroRatedOrExemptSatang = 0;
  for (const r of rows) {
    const rate = String(r.vat_rate_percent ?? '0').trim();
    const isZero = rate === '' || Number(rate) === 0;
    if (isZero) zeroRatedOrExemptSatang += num(r.net_satang);
    else {
      vatableNetSatang += num(r.net_satang);
      outputVatSatang += num(r.vat_satang);
    }
  }

  return {
    period: prefix,
    year: Number(year),
    month: Number(month),
    dueOn: pp30DueDate(year, month),
    invoiceCount: rows.length,
    totalSalesSatang: vatableNetSatang + zeroRatedOrExemptSatang,
    vatableNetSatang,
    outputVatSatang,
    zeroRatedOrExemptSatang,
    // Honest gap: this system has no per-invoice tax classification, so a 0%
    // invoice cannot be split into zero-rated vs exempt — the two occupy
    // different boxes on the PP 30 form. Classify these by hand before filing.
    unclassified: zeroRatedOrExemptSatang > 0,
    inputVatSatang: null,   // out of scope: expenses are not tracked
    netPayableSatang: null, // requires input VAT; not derivable here
    invoices: rows.map((r) => ({
      id: r.id,
      number: String(r.number),
      issueDate: String(r.issue_date),
      status: String(r.status),
      vatRate: String(r.vat_rate_percent),
      netSatang: num(r.net_satang),
      vatSatang: num(r.vat_satang),
      grandSatang: num(r.grand_satang),
    })),
  };
}

/** Income recognised per month across a year, on the tax-invoice date. */
export function incomeByMonth(db, { year }) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2000 || y > 2999) throw new Error(`invalid year: ${year}`);
  const rows = db.prepare(`
    SELECT substr(issue_date, 1, 7) AS period,
           COUNT(*)                 AS invoice_count,
           SUM(net_satang)          AS net_satang,
           SUM(vat_satang)          AS vat_satang,
           SUM(grand_satang)        AS grand_satang,
           SUM(wht_satang)          AS wht_satang
    FROM invoices
    WHERE status IN ${INCOME_STATUSES} AND issue_date LIKE ?
    GROUP BY period ORDER BY period
  `).all(`${y}-%`);

  const byPeriod = new Map(rows.map((r) => [r.period, r]));
  const months = [];
  let totalNet = 0;
  let totalVat = 0;
  let totalWht = 0;
  for (let m = 1; m <= 12; m++) {
    const key = `${y}-${pad2(m)}`;
    const r = byPeriod.get(key);
    const net = num(r?.net_satang);
    const vat = num(r?.vat_satang);
    const wht = num(r?.wht_satang);
    totalNet += net; totalVat += vat; totalWht += wht;
    months.push({
      period: key, month: m,
      invoiceCount: num(r?.invoice_count),
      netSatang: net, vatSatang: vat,
      grandSatang: num(r?.grand_satang),
      whtSatang: wht,
    });
  }
  return {
    year: y, months,
    totalNetSatang: totalNet,
    totalVatSatang: totalVat,
    totalWhtSatang: totalWht,
    basis: 'accrual on tax-invoice date',
  };
}

/**
 * Withholding-tax certificates RECEIVED, i.e. tax already paid on our behalf.
 * These are a CREDIT against PND 50/51, never a liability.
 */
export function whtRegister(db, { from, to } = {}) {
  const lo = from || '0000-01-01';
  const hi = to || '9999-12-31';
  const rows = db.prepare(`
    SELECT w.*, i.number AS invoice_number
    FROM wht_certificates w
    LEFT JOIN invoices i ON i.id = w.invoice_id
    WHERE w.issued_on >= ? AND w.issued_on <= ?
    ORDER BY w.issued_on, w.id
  `).all(lo, hi);

  const totalWhtSatang = rows.reduce((a, r) => a + num(r.wht_satang), 0);
  const byForm = {};
  for (const r of rows) {
    const f = String(r.pnd_form || 'other');
    byForm[f] = (byForm[f] ?? 0) + num(r.wht_satang);
  }
  return {
    from: lo, to: hi,
    count: rows.length,
    totalWhtSatang,
    totalBaseSatang: rows.reduce((a, r) => a + num(r.base_satang), 0),
    byForm,
    certificates: rows.map((r) => ({
      id: r.id,
      certNumber: String(r.cert_number ?? ''),
      issuedOn: String(r.issued_on),
      pndForm: String(r.pnd_form),
      invoiceId: r.invoice_id ?? null,
      invoiceNumber: r.invoice_number ? String(r.invoice_number) : '',
      baseSatang: num(r.base_satang),
      whtSatang: num(r.wht_satang),
      ratePercent: String(r.rate_percent ?? ''),
      payerName: String(r.payer_name ?? ''),
      payerTaxId: String(r.payer_tax_id ?? ''),
    })),
  };
}

/**
 * Annual summary for PND 50 (and the half-year PND 51 when half is given).
 * Revenue only — this system tracks no expenses, so it cannot compute taxable
 * profit. creditableWhtSatang is what the WHT certificates are worth against
 * the final liability.
 */
export function pndSummary(db, { year, half = null }) {
  const y = Number(year);
  const income = incomeByMonth(db, { year: y });
  const inHalf = (m) => (half === 1 ? m <= 6 : half === 2 ? m > 6 : true);
  const months = income.months.filter((m) => inHalf(m.month));
  const revenueSatang = months.reduce((a, m) => a + m.netSatang, 0);
  const from = half === 2 ? `${y}-07-01` : `${y}-01-01`;
  const to = half === 1 ? `${y}-06-30` : `${y}-12-31`;
  const wht = whtRegister(db, { from, to });
  return {
    year: y,
    half,
    form: half ? 'PND 51 (half-year)' : 'PND 50 (annual)',
    periodFrom: from,
    periodTo: to,
    revenueSatang,
    invoiceCount: months.reduce((a, m) => a + m.invoiceCount, 0),
    creditableWhtSatang: wht.totalWhtSatang,
    expensesSatang: null,     // out of scope
    taxableProfitSatang: null, // needs expenses
    basis: 'accrual on tax-invoice date',
  };
}

/**
 * Pipeline vs recognised income — the dashboard's headline split.
 * Proposed and accepted quotations are FORECAST. Presenting them as income is
 * precisely the mistake this whole model exists to prevent, so they are
 * returned in their own fields and never summed with the income figure.
 */
export function pipelineSummary(db, { year } = {}) {
  const yearFilter = year ? ` AND issue_date LIKE '${Number(year)}-%'` : '';
  const stage = (status) => db.prepare(`
    SELECT COUNT(*) AS n FROM quotations WHERE status = ?
  `).get(status).n;

  const recognised = db.prepare(`
    SELECT COALESCE(SUM(net_satang), 0) AS net, COUNT(*) AS n
    FROM invoices WHERE status IN ${INCOME_STATUSES}${yearFilter}
  `).get();
  // Outstanding is summed from invoiceBalance PER INVOICE, not as
  // SUM(payable_satang). A partially-paid invoice is still 'issued', so
  // summing the payable column would report the full face value of an invoice
  // that is half collected and overstate the receivable. invoiceBalance is
  // also the single place that knows a withholding certificate settles in
  // 'memo' mode but not in 'deduct' — duplicating that rule here is exactly
  // how it gets it wrong in one of the two places.
  const openIds = db.prepare(`
    SELECT id FROM invoices WHERE status = 'issued'${yearFilter}
  `).all();
  const outstanding = {
    payable: openIds.reduce((a, r) => a + invoiceBalance(db, r.id).outstandingSatang, 0),
  };

  return {
    pipeline: {
      proposedCount: stage('proposed'),
      acceptedCount: stage('accepted'),
      declinedCount: stage('declined'),
      note: 'forecast only — never income',
    },
    recognisedIncome: {
      netSatang: num(recognised.net),
      invoiceCount: num(recognised.n),
      basis: 'accrual on tax-invoice date',
    },
    outstandingReceivableSatang: num(outstanding.payable),
  };
}