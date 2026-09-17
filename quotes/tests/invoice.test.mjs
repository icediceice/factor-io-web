// quotes/tests/invoice.test.mjs — invoice lifecycle, frozen tax rates,
// settlement by cash AND by withholding certificate.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, setSetting, getSettings } from '../lib/db.mjs';
import { markStatus } from '../lib/quote.mjs';
import {
  computeInvoiceTotals, allocateInvoiceNumber, createInvoiceFromQuotation,
  issueInvoice, markInvoiceStatus, recordPayment, recordWhtCertificate,
  invoiceBalance, buildInvoiceDocument,
} from '../lib/invoice.mjs';

/** A quotation carried all the way to 'accepted', ready to invoice. */
function seedAccepted({ lines } = {}) {
  const db = openDb(':memory:');
  const { lastInsertRowid: clientId } = db.prepare(
    `INSERT INTO clients (name, address, tax_id) VALUES (?,?,?)`
  ).run('Acme Ltd', '1 Test Road, Bangkok', '0105558000000');
  const { lastInsertRowid: qid } = db.prepare(
    `INSERT INTO quotations (number, client_id, lang) VALUES (?, ?, 'en')`
  ).run('QT-202609-0001', clientId);
  const addLine = db.prepare(
    `INSERT INTO quotation_lines
       (quotation_id, position, kind, description_en, qty_milli, unit, unit_satang, discount_satang)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  // Default: one 100,000.00 THB service line => net 10,000,000 satang, which
  // makes the grounded worked example exact: +7% VAT, less 3% WHT on the net.
  for (const l of (lines ?? [{ kind: 'service', desc: 'Consulting', qty: 1000, unit: 10000000, disc: 0 }])) {
    addLine.run(qid, 1, l.kind, l.desc, l.qty, 'day', l.unit, l.disc);
  }
  markStatus(db, qid, 'issued', 'op@x.io');
  markStatus(db, qid, 'proposed', 'op@x.io');
  markStatus(db, qid, 'accepted', 'op@x.io');
  return { db, qid, clientId };
}

describe('quotation lifecycle', () => {
  test('the full pipeline runs draft -> issued -> proposed -> accepted', () => {
    const { db, qid } = seedAccepted();
    assert.equal(db.prepare('SELECT status s FROM quotations WHERE id=?').get(qid).s, 'accepted');
  });

  test('backwards and skipped transitions are refused', () => {
    const db = openDb(':memory:');
    db.prepare(`INSERT INTO clients (name) VALUES ('C')`).run();
    db.prepare(`INSERT INTO quotations (number, client_id) VALUES ('Q1', 1)`).run();
    assert.throws(() => markStatus(db, 1, 'paid', 'a@x.io'), /illegal status transition: draft -> paid/);
    markStatus(db, 1, 'issued', 'a@x.io');
    markStatus(db, 1, 'proposed', 'a@x.io');
    assert.throws(() => markStatus(db, 1, 'draft', 'a@x.io'), /illegal status transition: proposed -> draft/);
    markStatus(db, 1, 'declined', 'a@x.io');
    assert.throws(() => markStatus(db, 1, 'accepted', 'a@x.io'), /illegal status transition: declined -> accepted/);
  });

  test('an unknown status is still rejected by name', () => {
    const { db, qid } = seedAccepted();
    assert.throws(() => markStatus(db, qid, 'published', 'a@x.io'), /invalid status/);
  });
});

describe('invoice creation and the tax point', () => {
  test('only an accepted quotation can be invoiced', () => {
    const db = openDb(':memory:');
    db.prepare(`INSERT INTO clients (name) VALUES ('C')`).run();
    db.prepare(`INSERT INTO quotations (number, client_id) VALUES ('Q1', 1)`).run();
    assert.throws(() => createInvoiceFromQuotation(db, 1, {}), /only an accepted quotation can be invoiced/);
  });

  test('lines are SNAPSHOTTED — editing the quotation cannot move the invoice', () => {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, { actor: 'op@x.io' });
    issueInvoice(db, id, { actor: 'op@x.io', issueDate: '2026-09-15' });
    const before = buildInvoiceDocument(db, id);
    db.prepare('UPDATE quotation_lines SET unit_satang = 1, description_en = ? WHERE quotation_id = ?')
      .run('MUTATED', qid);
    const after = buildInvoiceDocument(db, id);
    assert.deepEqual(after.lines, before.lines);
    assert.equal(after.totals.netSatang, 10000000);
    assert.notEqual(after.lines[0].descriptionEn, 'MUTATED');
  });

  test('snapshotted lines are numbered from 1 — a tax invoice never shows line 0', () => {
    const { db, qid } = seedAccepted({ lines: [
      { kind: 'service', desc: 'A', qty: 1000, unit: 100000, disc: 0 },
      { kind: 'service', desc: 'B', qty: 1000, unit: 200000, disc: 0 },
      { kind: 'hardware', desc: 'C', qty: 1000, unit: 300000, disc: 0 },
    ] });
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, {});
    const positions = buildInvoiceDocument(db, id).lines.map((l) => l.position);
    assert.deepEqual(positions, [1, 2, 3]);
  });

  test('issue_date is the tax point and drives the due date from settings', () => {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, { issueDate: '2026-09-15' });
    const doc = buildInvoiceDocument(db, id);
    assert.equal(doc.invoice.issueDate, '2026-09-15');
    assert.equal(doc.invoice.dueDate, '2026-10-15'); // invoice.payment_terms_days = 30
  });

  test('issuing the invoice moves the quotation to invoiced', () => {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, {});
    assert.equal(db.prepare('SELECT status s FROM quotations WHERE id=?').get(qid).s, 'invoiced');
  });

  test('an issued invoice is frozen against re-issue', () => {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, {});
    assert.throws(() => issueInvoice(db, id, {}), /already 'issued'/);
  });

  test('invoice numbers are monotonic and never collide with quote numbers', () => {
    const { db } = seedAccepted();
    const s = getSettings(db, '');
    const a = allocateInvoiceNumber(db, s, Date.parse('2026-09-16T05:00:00Z'));
    const b = allocateInvoiceNumber(db, s, Date.parse('2026-09-16T05:00:00Z'));
    assert.match(a, /^INV-202609-0001$/);
    assert.match(b, /^INV-202609-0002$/);
  });
});

describe('FROZEN RATES — the reason invoices exist as their own entity', () => {
  test('changing vat.rate_percent AFTER issue does not move a single filed figure', () => {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, { issueDate: '2026-09-15' });

    const filed = buildInvoiceDocument(db, id).totals;
    // net 10,000,000 satang; VAT 7% = 700,000; WHT 3% of net = 300,000
    assert.equal(filed.netSatang, 10000000);
    assert.equal(filed.vatRate, '7');
    assert.equal(filed.vatSatang, 700000);
    assert.equal(filed.grandSatang, 10700000);
    assert.equal(filed.whtSatang, 300000);

    // The operator edits the rates a month later, as they are entitled to.
    setSetting(db, 'vat.rate_percent', '10', 'op@x.io');
    setSetting(db, 'wht.rate_percent', '5', 'op@x.io');

    const reread = buildInvoiceDocument(db, id).totals;
    assert.deepEqual(reread, filed, 'a filed invoice moved after a settings edit');
    const row = db.prepare('SELECT vat_rate_percent, vat_satang, wht_satang FROM invoices WHERE id=?').get(id);
    assert.equal(row.vat_rate_percent, '7');
    assert.equal(row.vat_satang, 700000);
    assert.equal(row.wht_satang, 300000);
  });

  test('a NEW invoice issued after the change uses the NEW rate', () => {
    const { db, qid } = seedAccepted();
    const first = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, first.id, {});
    setSetting(db, 'vat.rate_percent', '10', 'op@x.io');

    // a second quotation, accepted, invoiced after the rate change
    db.prepare(`INSERT INTO quotations (number, client_id, lang) VALUES ('QT-2', 1, 'en')`).run();
    const q2 = db.prepare("SELECT id FROM quotations WHERE number='QT-2'").get().id;
    db.prepare(`INSERT INTO quotation_lines (quotation_id, position, kind, description_en, qty_milli, unit, unit_satang, discount_satang)
                VALUES (?, 1, 'service', 'Consulting', 1000, 'day', 10000000, 0)`).run(q2);
    markStatus(db, q2, 'issued', 'a@x.io');
    markStatus(db, q2, 'proposed', 'a@x.io');
    markStatus(db, q2, 'accepted', 'a@x.io');
    const second = createInvoiceFromQuotation(db, q2, {});
    issueInvoice(db, second.id, {});

    assert.equal(buildInvoiceDocument(db, first.id).totals.vatSatang, 700000);   // 7%
    assert.equal(buildInvoiceDocument(db, second.id).totals.vatSatang, 1000000); // 10%
  });

  test('computeInvoiceTotals refuses to guess — rates are explicit arguments', () => {
    const t = computeInvoiceTotals(
      [{ qtyMilli: 1000, unitSatang: 10000000, discountSatang: 0 }],
      { vatRate: '7', whtRate: '3', whtMode: 'memo', currency: 'THB' },
    );
    assert.equal(t.netSatang, 10000000);
    assert.equal(t.vatSatang, 700000);
    assert.equal(t.grandSatang, 10700000);
    assert.equal(t.whtSatang, 300000);
    assert.equal(t.payableSatang, 10700000); // memo: customer is invoiced the full amount
  });

  test('wht.apply=deduct subtracts the withholding from what is payable', () => {
    const t = computeInvoiceTotals(
      [{ qtyMilli: 1000, unitSatang: 10000000, discountSatang: 0 }],
      { vatRate: '7', whtRate: '3', whtMode: 'deduct', currency: 'THB' },
    );
    // the grounded worked example: 10,000 + 7% = 10,700, less 300 = 10,400
    assert.equal(t.payableSatang, 10400000);
  });
});

describe('settlement by cash and by withholding certificate', () => {
  test('a draft invoice cannot take a payment', () => {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    assert.throws(() => recordPayment(db, id, { amountSatang: 100 }), /still a draft/);
  });

  test('overpayment is refused and names what is outstanding', () => {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, {});
    assert.throws(
      () => recordPayment(db, id, { amountSatang: 10700001 }),
      /exceeds the 10700000 satang outstanding/,
    );
  });

  test('cash alone settles an invoice and flips it to paid', () => {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, {});
    recordPayment(db, id, { paidOn: '2026-09-20', amountSatang: 10700000 });
    const b = invoiceBalance(db, id);
    assert.equal(b.outstandingSatang, 0);
    assert.equal(b.settled, true);
    assert.equal(db.prepare('SELECT status s FROM invoices WHERE id=?').get(id).s, 'paid');
  });

  test('THE MEMO CASE: cash short by the WHT still settles once the certificate arrives', () => {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, {});
    // wht.apply is 'memo', so we invoiced 10,700,000 but the customer lawfully
    // transfers 10,400,000 and hands over a certificate for the 300,000.
    recordPayment(db, id, { paidOn: '2026-09-20', amountSatang: 10400000 });
    let b = invoiceBalance(db, id);
    assert.equal(b.outstandingSatang, 300000, 'should still be short by exactly the WHT');
    assert.equal(db.prepare('SELECT status s FROM invoices WHERE id=?').get(id).s, 'issued');

    recordWhtCertificate(db, {
      invoiceId: id, certNumber: 'WHT-001', issuedOn: '2026-09-20',
      pndForm: 'PND53', baseSatang: 10000000, whtSatang: 300000, ratePercent: '3',
      payerName: 'Acme Ltd', payerTaxId: '0105558000000',
    });
    b = invoiceBalance(db, id);
    assert.equal(b.withheldSatang, 300000);
    assert.equal(b.outstandingSatang, 0);
    assert.equal(b.settled, true);
    assert.equal(db.prepare('SELECT status s FROM invoices WHERE id=?').get(id).s, 'paid');
  });

  test('THE DEDUCT CASE: the certificate must NOT settle again what was already deducted', () => {
    const { db, qid } = seedAccepted();
    setSetting(db, 'wht.apply', 'deduct', 'op@x.io');
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, {});
    // deduct mode: the invoice face is already 10,700,000 - 300,000 = 10,400,000.
    assert.equal(db.prepare('SELECT payable_satang p FROM invoices WHERE id=?').get(id).p, 10400000);

    // The customer underpays by exactly the WHT and sends the certificate. The
    // certificate is a tax credit, NOT a second settlement — the 300,000 of
    // cash is genuinely still owed and the invoice must stay open.
    recordPayment(db, id, { paidOn: '2026-09-20', amountSatang: 10100000 });
    recordWhtCertificate(db, {
      invoiceId: id, certNumber: 'WHT-002', issuedOn: '2026-09-20',
      pndForm: 'PND53', baseSatang: 10000000, whtSatang: 300000, ratePercent: '3',
      payerName: 'Acme Ltd', payerTaxId: '0105558000000',
    });

    const b = invoiceBalance(db, id);
    assert.equal(b.whtMode, 'deduct');
    assert.equal(b.withheldSatang, 300000, 'still REPORTED — it is a real PND credit');
    assert.equal(b.settledSatang, 10100000, 'but it must not count toward settlement');
    assert.equal(b.outstandingSatang, 300000);
    assert.equal(b.settled, false);
    assert.equal(db.prepare('SELECT status s FROM invoices WHERE id=?').get(id).s, 'issued');

    // Only the real cash closes it.
    recordPayment(db, id, { paidOn: '2026-09-25', amountSatang: 300000 });
    assert.equal(invoiceBalance(db, id).settled, true);
    assert.equal(db.prepare('SELECT status s FROM invoices WHERE id=?').get(id).s, 'paid');
  });

  test('a WHT amount larger than its base is refused', () => {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, {});
    assert.throws(
      () => recordWhtCertificate(db, { invoiceId: id, issuedOn: '2026-09-20', baseSatang: 100, whtSatang: 101 }),
      /exceeds its base/,
    );
  });

  test('partial payments accumulate exactly, with no float drift', () => {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, {});
    for (let i = 0; i < 7; i++) recordPayment(db, id, { amountSatang: 1000000 });
    assert.equal(invoiceBalance(db, id).outstandingSatang, 3700000);
    recordPayment(db, id, { amountSatang: 3700000 });
    assert.equal(invoiceBalance(db, id).settled, true);
  });

  test('a cancelled invoice refuses further payment', () => {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, {});
    markInvoiceStatus(db, id, 'cancelled', 'op@x.io');
    assert.throws(() => recordPayment(db, id, { amountSatang: 100 }), /cancelled/);
  });
});

describe('invoice document envelope', () => {
  test('totals stay a TOP-LEVEL sibling so the CLI can read them flat', () => {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, {});
    const doc = buildInvoiceDocument(db, id);
    assert.equal(typeof doc.totals.payableSatang, 'number');
    assert.equal(doc.invoice.quotationNumber, 'QT-202609-0001');
    assert.equal(doc.client.taxId, '0105558000000');
    assert.equal(doc.issuer.branchEn, 'Head Office');
    assert.ok(Array.isArray(doc.payments));
    assert.ok(Array.isArray(doc.whtCertificates));
  });
});

describe('withholding certificates cannot exceed the invoice', () => {
  // Worked example throughout: net 10,000,000 satang (100,000.00 THB),
  // VAT 7% = 700,000, WHT 3% of the NET = 300,000.
  function issued() {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    issueInvoice(db, id, {});
    return { db, id };
  }

  test('THE DUPLICATE: the same certificate entered twice is refused', () => {
    const { db, id } = issued();
    recordWhtCertificate(db, { invoiceId: id, baseSatang: 10000000, whtSatang: 300000 });
    // An API retry or a second form submit posts the identical figures again.
    assert.throws(
      () => recordWhtCertificate(db, { invoiceId: id, baseSatang: 10000000, whtSatang: 300000 }),
      /exceeds the 0 satang remaining/,
    );
    // The PND credit register must still show exactly one certificate's worth.
    const total = db.prepare('SELECT SUM(wht_satang) t FROM wht_certificates WHERE invoice_id = ?').get(id).t;
    assert.equal(total, 300000);
  });

  test('PARTIAL certificates are still legal and sum to the frozen figure', () => {
    const { db, id } = issued();
    recordWhtCertificate(db, { invoiceId: id, baseSatang: 6000000, whtSatang: 180000 });
    recordWhtCertificate(db, { invoiceId: id, baseSatang: 4000000, whtSatang: 120000 });
    assert.equal(invoiceBalance(db, id).withheldSatang, 300000);
    // ...and the next satang over the frozen total is refused.
    assert.throws(
      () => recordWhtCertificate(db, { invoiceId: id, baseSatang: 1, whtSatang: 1 }),
      /exceeds the 0 satang remaining/,
    );
  });

  test('withholding computed on the VAT-INCLUSIVE amount is refused, not credited', () => {
    const { db, id } = issued();
    // 3% of the grand 10,700,000 = 321,000 — a common customer-side error.
    assert.throws(
      () => recordWhtCertificate(db, { invoiceId: id, baseSatang: 10700000, whtSatang: 321000 }),
      /WHT base 10700000 satang exceeds the 10000000 satang remaining/,
    );
    assert.equal(db.prepare('SELECT COUNT(*) c FROM wht_certificates').get().c, 0);
  });

  test('a duplicate cannot silently settle a memo-mode invoice', () => {
    const { db, id } = issued();
    assert.equal(invoiceBalance(db, id).payableSatang, 10700000);   // memo: full grand total
    recordWhtCertificate(db, { invoiceId: id, baseSatang: 10000000, whtSatang: 300000 });
    assert.throws(() => recordWhtCertificate(db, { invoiceId: id, baseSatang: 10000000, whtSatang: 300000 }), /remaining/);
    // Outstanding is still the real cash the customer owes: 10,700,000 - 300,000.
    assert.equal(invoiceBalance(db, id).outstandingSatang, 10400000);
    assert.equal(db.prepare('SELECT status s FROM invoices WHERE id=?').get(id).s, 'issued');
  });

  test('a cancelled invoice accrues no certificates', () => {
    const { db, id } = issued();
    markInvoiceStatus(db, id, 'cancelled', 'op@x.io');
    assert.throws(() => recordWhtCertificate(db, { invoiceId: id, baseSatang: 100, whtSatang: 3 }), /cancelled/);
  });

  test("a certificate cannot be linked to a payment that is not this invoice's", () => {
    const { db, id } = issued();
    const pay = recordPayment(db, id, { amountSatang: 100000 });
    assert.equal(typeof pay.id, 'number');
    assert.throws(
      () => recordWhtCertificate(db, { invoiceId: id, paymentId: 9999, baseSatang: 100, whtSatang: 3 }),
      /payment 9999 not found/,
    );
    // The invoice's own payment is accepted as the link.
    const ok = recordWhtCertificate(db, { invoiceId: id, paymentId: pay.id, baseSatang: 100, whtSatang: 3 });
    assert.equal(typeof ok.id, 'number');
  });

  test('a STANDALONE certificate (no invoice) is still accepted uncapped', () => {
    const { db } = issued();
    const r = recordWhtCertificate(db, { baseSatang: 50000000, whtSatang: 1500000, payerName: 'Other Customer' });
    assert.equal(typeof r.id, 'number');
    assert.equal(r.balance, null);
  });
});

describe('accounting dates must be real calendar days', () => {
  test('an impossible day is refused at creation, not normalised into the file', () => {
    const { db, qid } = seedAccepted();
    assert.throws(
      () => createInvoiceFromQuotation(db, qid, { issueDate: '2026-02-31' }),
      /issue_date '2026-02-31' is not a real calendar date/,
    );
    assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices').get().c, 0);
  });

  test('a real leap day passes and its due date is computed from it', () => {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, { issueDate: '2028-02-29' });
    const row = db.prepare('SELECT issue_date, due_date FROM invoices WHERE id = ?').get(id);
    assert.equal(row.issue_date, '2028-02-29');
    assert.equal(row.due_date, '2028-03-30');   // +30 days, terms default
  });

  test('a non-leap 29 February is refused', () => {
    const { db, qid } = seedAccepted();
    assert.throws(() => createInvoiceFromQuotation(db, qid, { issueDate: '2026-02-29' }), /not a real calendar date/);
  });

  test('a malformed date is refused by shape', () => {
    const { db, qid } = seedAccepted();
    assert.throws(() => createInvoiceFromQuotation(db, qid, { issueDate: '16/09/2026' }), /must be a YYYY-MM-DD date/);
    assert.throws(() => createInvoiceFromQuotation(db, qid, { issueDate: '2026-9-16' }), /must be a YYYY-MM-DD date/);
  });

  test('issuing, paying and certifying all refuse an impossible date', () => {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    assert.throws(() => issueInvoice(db, id, { issueDate: '2026-13-01' }), /not a real calendar date/);
    issueInvoice(db, id, {});
    assert.throws(() => recordPayment(db, id, { paidOn: '2026-04-31', amountSatang: 100 }), /paid_on .* not a real calendar date/);
    assert.throws(
      () => recordWhtCertificate(db, { invoiceId: id, issuedOn: '2026-06-31', baseSatang: 100, whtSatang: 3 }),
      /issued_on .* not a real calendar date/,
    );
  });

  test('a blank date still means today in Bangkok', () => {
    const { db, qid } = seedAccepted();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    assert.match(db.prepare('SELECT issue_date d FROM invoices WHERE id=?').get(id).d, /^\d{4}-\d{2}-\d{2}$/);
  });
});

// An optional line is a PROPOSAL, not a sale. It must be visible and priced on
// the quotation, absent from everything payable, and absent from the invoice
// unless the customer actually took it — at which point it is billed as an
// ordinary line, because a billed option is no longer optional.
describe('optional lines and the widened vocabulary reaching invoices', () => {
  /** An accepted quotation mixing kinds, periods, sections and options. */
  function seedMixed() {
    const db = openDb(':memory:');
    db.prepare(`INSERT INTO clients (name) VALUES ('Acme Ltd')`).run();
    const { lastInsertRowid: qid } = db.prepare(
      `INSERT INTO quotations (number, client_id, lang, term_months) VALUES (?, 1, 'en', 36)`
    ).run('QT-202609-0009');
    const add = db.prepare(
      `INSERT INTO quotation_lines
         (quotation_id, position, kind, description_en, qty_milli, unit, unit_satang, discount_satang,
          billing_period, section, optional)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    );
    add.run(qid, 1, 'hardware', 'Appliance', 1000, 'unit', 200000000, 'once', 'Hardware', 0);
    add.run(qid, 2, 'software', 'Platform licence', 1000, 'year', 48000000, 'yearly', 'Software', 0);
    add.run(qid, 3, 'support', 'On-call', 1000, 'month', 8500000, 'monthly', 'Services', 0);
    add.run(qid, 4, 'training', 'Workshop', 2000, 'day', 4500000, 'once', 'Services', 1);
    add.run(qid, 5, 'cloud', 'DR capacity', 1000, 'month', 1800000, 'monthly', 'Services', 1);
    markStatus(db, qid, 'issued', 'op@x.io');
    markStatus(db, qid, 'proposed', 'op@x.io');
    markStatus(db, qid, 'accepted', 'op@x.io');
    return { db, qid };
  }

  test('kinds outside the original service|hardware pair survive the whole path', () => {
    const { db, qid } = seedMixed();
    const { id } = createInvoiceFromQuotation(db, qid, { actor: 'op@x.io' });
    issueInvoice(db, id, { actor: 'op@x.io', issueDate: '2026-09-15' });
    const kinds = buildInvoiceDocument(db, id).lines.map((l) => l.kind);
    assert.deepEqual(kinds, ['hardware', 'software', 'support']);
  });

  test('billing period and section are snapshotted onto the invoice line', () => {
    const { db, qid } = seedMixed();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    const lines = buildInvoiceDocument(db, id).lines;
    assert.deepEqual(lines.map((l) => l.billingPeriod), ['once', 'yearly', 'monthly']);
    assert.deepEqual(lines.map((l) => l.section), ['Hardware', 'Software', 'Services']);
  });

  test('an untaken option never reaches the invoice', () => {
    const { db, qid } = seedMixed();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    const descs = buildInvoiceDocument(db, id).lines.map((l) => l.descriptionEn);
    assert.ok(!descs.includes('Workshop'));
    assert.ok(!descs.includes('DR capacity'));
  });

  test('the invoice bills ONE cycle — the 36-month term never multiplies a figure', () => {
    const { db, qid } = seedMixed();
    const { id } = createInvoiceFromQuotation(db, qid, {});
    const t = buildInvoiceDocument(db, id).totals;
    // 2,000,000.00 + 480,000.00 + 85,000.00 = 2,565,000.00 THB, options excluded.
    assert.equal(t.subtotalSatang, 256500000);
    assert.equal(t.netSatang, 256500000);
    // Nothing on an invoice may carry a contract or recurring projection.
    assert.equal(t.contractTotalSatang, undefined);
    assert.equal(t.recurringSatang, undefined);
  });

  test('a taken option is billed as an ordinary line, in position order', () => {
    const { db, qid } = seedMixed();
    const optionId = db.prepare(
      `SELECT id FROM quotation_lines WHERE quotation_id = ? AND description_en = 'Workshop'`
    ).get(qid).id;
    const { id } = createInvoiceFromQuotation(db, qid, { includeOptionalLineIds: [optionId] });
    const doc = buildInvoiceDocument(db, id);
    assert.deepEqual(doc.lines.map((l) => l.descriptionEn),
      ['Appliance', 'Platform licence', 'On-call', 'Workshop']);
    // 2,565,000.00 + (2 x 45,000.00) = 2,655,000.00
    assert.equal(doc.totals.netSatang, 265500000);
    // invoice_lines deliberately has no `optional` column: a billed line is not
    // optional, so nothing downstream can exclude it from a filed total.
    const cols = db.prepare('PRAGMA table_info(invoice_lines)').all().map((c) => c.name);
    assert.ok(!cols.includes('optional'));
  });

  test('selecting a line that is not optional, or not on the quotation, is refused', () => {
    const { db, qid } = seedMixed();
    const billed = db.prepare(
      `SELECT id FROM quotation_lines WHERE quotation_id = ? AND description_en = 'Appliance'`
    ).get(qid).id;
    assert.throws(() => createInvoiceFromQuotation(db, qid, { includeOptionalLineIds: [billed] }),
      /is not optional; it is billed already/);
    assert.throws(() => createInvoiceFromQuotation(db, qid, { includeOptionalLineIds: [999999] }),
      /is not on quotation/);
  });

  test('a quotation of nothing but untaken options is refused, not silently zero', () => {
    const db = openDb(':memory:');
    db.prepare(`INSERT INTO clients (name) VALUES ('C')`).run();
    const { lastInsertRowid: qid } = db.prepare(
      `INSERT INTO quotations (number, client_id) VALUES ('QT-OPT', 1)`
    ).run();
    db.prepare(
      `INSERT INTO quotation_lines
         (quotation_id, position, kind, description_en, qty_milli, unit, unit_satang, optional)
       VALUES (?, 1, 'training', 'Workshop', 1000, 'day', 4500000, 1)`
    ).run(qid);
    markStatus(db, qid, 'issued', 'op@x.io');
    markStatus(db, qid, 'proposed', 'op@x.io');
    markStatus(db, qid, 'accepted', 'op@x.io');
    assert.throws(() => createInvoiceFromQuotation(db, qid, {}),
      /every line is optional and none were selected/);
  });
});