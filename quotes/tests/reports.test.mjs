// quotes/tests/reports.test.mjs — PP 30 worksheet, income by month, WHT
// register. Focus: month boundaries in Asia/Bangkok and satang rounding.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, setSetting } from '../lib/db.mjs';
import { markStatus } from '../lib/quote.mjs';
import {
  createInvoiceFromQuotation, issueInvoice, recordPayment,
  recordWhtCertificate, markInvoiceStatus,
} from '../lib/invoice.mjs';
import {
  pp30Monthly, incomeByMonth, whtRegister, pndSummary, pipelineSummary,
} from '../lib/reports.mjs';

function db0() {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO clients (name, tax_id) VALUES ('Acme Ltd', '0105558000000')`).run();
  return db;
}

/** Insert an invoice directly, so a report can be driven at an exact date. */
function addInvoice(db, { number, issueDate, netSatang, vatRate = '7', status = 'issued' }) {
  const vat = Math.round((netSatang * Number(vatRate) * 100) / 10000);
  const wht = Math.round((netSatang * 300) / 10000);
  db.prepare(`
    INSERT INTO invoices (number, client_id, status, issue_date, vat_rate_percent,
      wht_rate_percent, wht_mode, subtotal_satang, net_satang, vat_satang,
      grand_satang, wht_satang, payable_satang)
    VALUES (?, 1, ?, ?, ?, '3', 'memo', ?, ?, ?, ?, ?, ?)
  `).run(number, status, issueDate, vatRate, netSatang, netSatang, vat,
    netSatang + vat, wht, netSatang + vat);
  return db.prepare('SELECT id FROM invoices WHERE number = ?').get(number).id;
}

/** A quotation carried to 'accepted' so the real path can be exercised. */
function accepted(db, number, unitSatang = 10000000) {
  const { lastInsertRowid: qid } = db.prepare(
    `INSERT INTO quotations (number, client_id, lang) VALUES (?, 1, 'en')`
  ).run(number);
  db.prepare(`INSERT INTO quotation_lines
    (quotation_id, position, kind, description_en, qty_milli, unit, unit_satang, discount_satang)
    VALUES (?, 1, 'service', 'Consulting', 1000, 'day', ?, 0)`).run(qid, unitSatang);
  markStatus(db, qid, 'issued', 'a@x.io');
  markStatus(db, qid, 'proposed', 'a@x.io');
  markStatus(db, qid, 'accepted', 'a@x.io');
  return qid;
}

describe('PP 30 month boundaries (Asia/Bangkok)', () => {
  test('the last and first day of a month land in the correct period', () => {
    const db = db0();
    addInvoice(db, { number: 'A', issueDate: '2026-01-01', netSatang: 100000 });
    addInvoice(db, { number: 'B', issueDate: '2026-01-31', netSatang: 200000 });
    addInvoice(db, { number: 'C', issueDate: '2026-02-01', netSatang: 400000 });

    const jan = pp30Monthly(db, { year: 2026, month: 1 });
    const feb = pp30Monthly(db, { year: 2026, month: 2 });
    assert.equal(jan.invoiceCount, 2);
    assert.equal(jan.vatableNetSatang, 300000);
    assert.equal(feb.invoiceCount, 1);
    assert.equal(feb.vatableNetSatang, 400000);
  });

  test('December rolls the filing deadline into the next year', () => {
    const db = db0();
    const dec = pp30Monthly(db, { year: 2026, month: 12 });
    assert.equal(dec.dueOn.paper, '2027-01-15');
    assert.equal(dec.dueOn.efiling, '2027-01-23');
  });

  test('an ordinary month is due on the 15th, or the 23rd e-filing', () => {
    const db = db0();
    const sep = pp30Monthly(db, { year: 2026, month: 9 });
    assert.equal(sep.dueOn.paper, '2026-10-15');
    assert.equal(sep.dueOn.efiling, '2026-10-23');
  });

  test('an out-of-range month or year is refused, not silently coerced', () => {
    const db = db0();
    assert.throws(() => pp30Monthly(db, { year: 2026, month: 0 }), /invalid month/);
    assert.throws(() => pp30Monthly(db, { year: 2026, month: 13 }), /invalid month/);
    assert.throws(() => incomeByMonth(db, { year: 1200 }), /invalid year/);
  });
});

describe('what counts as income', () => {
  test('drafts and cancelled invoices are excluded; issued and paid are not', () => {
    const db = db0();
    addInvoice(db, { number: 'DRAFT', issueDate: '2026-03-10', netSatang: 900000, status: 'draft' });
    addInvoice(db, { number: 'CXL', issueDate: '2026-03-11', netSatang: 900000, status: 'cancelled' });
    addInvoice(db, { number: 'ISS', issueDate: '2026-03-12', netSatang: 100000, status: 'issued' });
    addInvoice(db, { number: 'PAID', issueDate: '2026-03-13', netSatang: 200000, status: 'paid' });

    const mar = pp30Monthly(db, { year: 2026, month: 3 });
    assert.equal(mar.invoiceCount, 2);
    assert.equal(mar.vatableNetSatang, 300000);
    assert.equal(incomeByMonth(db, { year: 2026 }).totalNetSatang, 300000);
  });

  test('a zero-rated invoice is separated and flagged as needing classification', () => {
    const db = db0();
    addInvoice(db, { number: 'STD', issueDate: '2026-04-02', netSatang: 100000, vatRate: '7' });
    addInvoice(db, { number: 'ZERO', issueDate: '2026-04-03', netSatang: 500000, vatRate: '0' });
    const apr = pp30Monthly(db, { year: 2026, month: 4 });
    assert.equal(apr.vatableNetSatang, 100000);
    assert.equal(apr.zeroRatedOrExemptSatang, 500000);
    assert.equal(apr.totalSalesSatang, 600000);
    assert.equal(apr.outputVatSatang, 7000);
    assert.equal(apr.unclassified, true, 'zero-rated vs exempt cannot be derived and must be flagged');
  });

  test('the input side is explicitly absent, not zero', () => {
    const db = db0();
    addInvoice(db, { number: 'X', issueDate: '2026-05-01', netSatang: 100000 });
    const may = pp30Monthly(db, { year: 2026, month: 5 });
    assert.equal(may.inputVatSatang, null, 'expenses are out of scope — must not read as zero');
    assert.equal(may.netPayableSatang, null, 'not derivable without input VAT');
  });
});

describe('satang rounding', () => {
  test('VAT rounds half-UP at the satang boundary', () => {
    const db = db0();
    // 50 satang net at 7% = 3.5 satang, which must round to 4, not 3.
    const qid = accepted(db, 'QT-R1', 50);
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, { issueDate: '2026-06-10' });
    const jun = pp30Monthly(db, { year: 2026, month: 6 });
    assert.equal(jun.vatableNetSatang, 50);
    assert.equal(jun.outputVatSatang, 4);
  });

  test('monthly totals sum stored integers exactly, with no float drift', () => {
    const db = db0();
    for (let i = 1; i <= 30; i++) {
      addInvoice(db, { number: `D${i}`, issueDate: `2026-07-${String(i).padStart(2, '0')}`, netSatang: 333333 });
    }
    const jul = pp30Monthly(db, { year: 2026, month: 7 });
    assert.equal(jul.vatableNetSatang, 333333 * 30);
    assert.equal(Number.isSafeInteger(jul.vatableNetSatang), true);
  });
});

describe('incomeByMonth', () => {
  test('always returns twelve months, zero-filled', () => {
    const db = db0();
    addInvoice(db, { number: 'A', issueDate: '2026-08-15', netSatang: 100000 });
    const y = incomeByMonth(db, { year: 2026 });
    assert.equal(y.months.length, 12);
    assert.equal(y.months[7].period, '2026-08');
    assert.equal(y.months[7].netSatang, 100000);
    assert.equal(y.months[0].netSatang, 0);
    assert.equal(y.months[0].invoiceCount, 0);
  });

  test('a different year is not counted', () => {
    const db = db0();
    addInvoice(db, { number: 'A', issueDate: '2025-08-15', netSatang: 100000 });
    assert.equal(incomeByMonth(db, { year: 2026 }).totalNetSatang, 0);
    assert.equal(incomeByMonth(db, { year: 2025 }).totalNetSatang, 100000);
  });

  test('a filed figure does not move when the VAT rate is edited later', () => {
    const db = db0();
    const qid = accepted(db, 'QT-F1');
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, { issueDate: '2026-09-15' });
    const before = incomeByMonth(db, { year: 2026 });
    setSetting(db, 'vat.rate_percent', '25', 'op@x.io');
    assert.deepEqual(incomeByMonth(db, { year: 2026 }), before);
    assert.deepEqual(pp30Monthly(db, { year: 2026, month: 9 }), pp30Monthly(db, { year: 2026, month: 9 }));
  });
});

describe('WHT register and PND summary', () => {
  test('certificates are totalled and grouped by form', () => {
    const db = db0();
    const qid = accepted(db, 'QT-W1');
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, { issueDate: '2026-09-15' });
    recordPayment(db, id, { paidOn: '2026-09-20', amountSatang: 10400000 });
    recordWhtCertificate(db, {
      invoiceId: id, certNumber: 'W-1', issuedOn: '2026-09-20', pndForm: 'PND53',
      baseSatang: 10000000, whtSatang: 300000, ratePercent: '3', payerName: 'Acme Ltd',
    });
    const reg = whtRegister(db, { from: '2026-01-01', to: '2026-12-31' });
    assert.equal(reg.count, 1);
    assert.equal(reg.totalWhtSatang, 300000);
    assert.equal(reg.byForm.PND53, 300000);
    assert.equal(reg.certificates[0].invoiceNumber, 'INV-202609-0001');
  });

  test('the date window excludes certificates outside it', () => {
    const db = db0();
    const qid = accepted(db, 'QT-W2');
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, { issueDate: '2026-09-15' });
    recordWhtCertificate(db, { invoiceId: id, issuedOn: '2026-09-20', baseSatang: 100, whtSatang: 3 });
    assert.equal(whtRegister(db, { from: '2026-10-01', to: '2026-12-31' }).count, 0);
    assert.equal(whtRegister(db, { from: '2026-09-01', to: '2026-09-30' }).count, 1);
  });

  test('PND 51 covers the first half only and credits its WHT', () => {
    const db = db0();
    addInvoice(db, { number: 'H1', issueDate: '2026-03-01', netSatang: 100000 });
    addInvoice(db, { number: 'H2', issueDate: '2026-09-01', netSatang: 700000 });
    const h1 = pndSummary(db, { year: 2026, half: 1 });
    const full = pndSummary(db, { year: 2026 });
    assert.equal(h1.form, 'PND 51 (half-year)');
    assert.equal(h1.revenueSatang, 100000);
    assert.equal(h1.periodTo, '2026-06-30');
    assert.equal(full.form, 'PND 50 (annual)');
    assert.equal(full.revenueSatang, 800000);
    assert.equal(full.taxableProfitSatang, null, 'no expenses tracked — profit must not be invented');
  });
});

describe('pipeline is never presented as income', () => {
  test('proposed and accepted value stays out of the income figure', () => {
    const db = db0();
    accepted(db, 'QT-P1');                    // sits at 'accepted'
    const q2 = accepted(db, 'QT-P2');
    const { id } = createInvoiceFromQuotation(db, q2, {});
    issueInvoice(db, id, { issueDate: '2026-09-15' });

    const s = pipelineSummary(db, { year: 2026 });
    assert.equal(s.pipeline.acceptedCount, 1, 'QT-P2 moved to invoiced, only QT-P1 is still accepted');
    assert.equal(s.recognisedIncome.invoiceCount, 1);
    assert.equal(s.recognisedIncome.netSatang, 10000000);
    assert.equal(s.outstandingReceivableSatang, 10700000);
  });

  test('a settled invoice leaves the outstanding receivable', () => {
    const db = db0();
    const qid = accepted(db, 'QT-P3');
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, { issueDate: '2026-09-15' });
    recordPayment(db, id, { amountSatang: 10700000 });
    assert.equal(pipelineSummary(db, { year: 2026 }).outstandingReceivableSatang, 0);
  });
});