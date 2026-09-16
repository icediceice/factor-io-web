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