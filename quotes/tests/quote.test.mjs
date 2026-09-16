// quotes/tests/quote.test.mjs — totals engine, numbering, snapshots.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, getSettings } from '../lib/db.mjs';
import {
  computeTotals, allocateQuoteNumber, buildQuoteDocument,
  saveRevision, markStatus,
} from '../lib/quote.mjs';

function seedDb() {
  const db = openDb(':memory:');
  const { lastInsertRowid: clientId } = db.prepare(
    `INSERT INTO clients (name, address, tax_id, contact, email) VALUES (?,?,?,?,?)`
  ).run('Acme Ltd', '1 Test Road, Bangkok', '0105558000000', 'Buyer', 'buyer@acme.example');
  const { lastInsertRowid: qid } = db.prepare(
    `INSERT INTO quotations (number, client_id, lang) VALUES (?, ?, 'en')`
  ).run('QT-202609-0001', clientId);
  const addLine = db.prepare(
    `INSERT INTO quotation_lines
       (quotation_id, position, kind, description_en, qty_milli, unit, unit_satang, discount_satang)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  addLine.run(qid, 1, 'service', 'Architecture consulting', 5000, 'day', 3500000, 0);
  addLine.run(qid, 2, 'service', 'Half-day review', 500, 'day', 3500000, 0);
  addLine.run(qid, 3, 'hardware', 'Edge server', 2000, 'unit', 12500000, 1000000);
  return { db, clientId, qid };
}

const LINES = [
  { qtyMilli: 5000, unitSatang: 3500000, discountSatang: 0 },
  { qtyMilli: 500, unitSatang: 3500000, discountSatang: 0 },
  { qtyMilli: 2000, unitSatang: 12500000, discountSatang: 1000000 },
];

describe('computeTotals', () => {
  const db = openDb(':memory:');
  const settings = getSettings(db, '');

  test('multi-line service+hardware mix with a per-line discount', () => {
    const t = computeTotals(LINES, settings);
    // 35,000 + 17,500 + 250,000 - 10,000 THB discount = 292,500 THB? no:
    // subtotal 17500+1750+2500 = 442,500 THB; net 432,500 THB
    assert.equal(t.subtotalSatang, 44250000);
    assert.equal(t.discountSatang, 1000000);
    assert.equal(t.netSatang, 43250000);
    assert.equal(t.vatSatang, 3027500);     // 7%
    assert.equal(t.grandSatang, 46277500);
  });

  test('WHT is a memo by default: payable equals grand', () => {
    const t = computeTotals(LINES, settings);
    assert.equal(t.whtSatang, 1297500);     // 3% of NET (pre-VAT)
    assert.equal(t.whtMode, 'memo');
    assert.equal(t.payableSatang, t.grandSatang);
  });

  test('settings flip WHT to deduct and payable drops', () => {
    const s2 = { ...settings, 'wht.apply': 'deduct' };
    const t = computeTotals(LINES, s2);
    assert.equal(t.whtMode, 'deduct');
    assert.equal(t.payableSatang, 46277500 - 1297500);
  });

  test('a settings change moves the totals — no code edit', () => {
    const t0 = computeTotals(LINES, settings);
    const t1 = computeTotals(LINES, { ...settings, 'vat.rate_percent': '0' });
    assert.equal(t1.vatSatang, 0);
    assert.equal(t1.grandSatang, t1.netSatang);
    assert.notEqual(t0.grandSatang, t1.grandSatang);
    const t2 = computeTotals(LINES, { ...settings, 'wht.rate_percent': '1' });
    assert.equal(t2.whtSatang, 432500);
  });
});

describe('allocateQuoteNumber', () => {
  test('renders format tokens and pads the sequence', () => {
    const { db } = seedDb();
    const s = getSettings(db, '');
    assert.equal(allocateQuoteNumber(db, s, Date.UTC(2026, 8, 16)), 'QT-202609-0001');
    assert.equal(allocateQuoteNumber(db, s, Date.UTC(2026, 8, 20)), 'QT-202609-0002');
    assert.equal(allocateQuoteNumber(db, s, Date.UTC(2026, 9, 1)), 'QT-202610-0001'); // new month
  });

  test('numbers never repeat after a quotation is deleted', () => {
    const { db } = seedDb();
    const s = getSettings(db, '');
    const n1 = allocateQuoteNumber(db, s);
    db.prepare('DELETE FROM quotations WHERE id = (SELECT MAX(id) FROM quotations)').run();
    const n2 = allocateQuoteNumber(db, s);
    assert.notEqual(n1, n2);
  });
});

describe('documents and revisions', () => {
  test('buildQuoteDocument embeds client, lines, totals, issuer, bank, terms', () => {
    const { db, qid } = seedDb();
    const doc = buildQuoteDocument(db, qid);
    assert.equal(doc.client.name, 'Acme Ltd');
    assert.equal(doc.lines.length, 3);
    assert.equal(doc.lines[1].qtyMilli, 500);
    assert.equal(doc.totals.grandSatang, 46277500);
    assert.equal(doc.issuer.taxId, '');            // seeded placeholder, settings-owned
    assert.equal(typeof doc.terms.paymentEn, 'string');
    assert.ok(doc.quotation.validUntil > doc.quotation.issueDate);
  });

  test('markStatus(issued) writes an immutable snapshot + audit row', () => {
    const { db, qid } = seedDb();
    const before = JSON.stringify(buildQuoteDocument(db, qid));
    const { rev } = markStatus(db, qid, 'issued', 'op@factor-io.com');
    assert.equal(rev, 1);
    const snap = db.prepare('SELECT snapshot_json FROM quotation_revisions WHERE quotation_id=? AND rev=1').get(qid);
    assert.deepEqual(JSON.parse(snap.snapshot_json), JSON.parse(before));
    db.prepare("UPDATE quotation_lines SET unit_satang = 999 WHERE quotation_id = ?").run(qid);
    const afterMutation = JSON.stringify(buildQuoteDocument(db, qid));
    assert.notEqual(afterMutation, before);              // live doc follows the rows
    const row = db.prepare('SELECT snapshot_json FROM quotation_revisions WHERE quotation_id=? AND rev=1').get(qid);
    assert.equal(row.snapshot_json, snap.snapshot_json); // snapshot immutable
    assert.deepEqual(JSON.parse(row.snapshot_json), JSON.parse(before));
    const audits = db.prepare("SELECT * FROM audit_log WHERE entity='quotation' AND entity_id=?").all(String(qid));
    assert.equal(audits.length, 1);
    assert.equal(audits[0].actor, 'op@factor-io.com');
  });

  test('second issue snapshot bumps rev; invalid status refuses', () => {
    const { db, qid } = seedDb();
    markStatus(db, qid, 'issued', 'a@x.io');
    markStatus(db, qid, 'issued', 'a@x.io');
    assert.equal(db.prepare('SELECT MAX(rev) r FROM quotation_revisions WHERE quotation_id=?').get(qid).r, 2);
    assert.throws(() => markStatus(db, qid, 'published', 'a@x.io'), /invalid status/);
  });

  test('saveRevision stores exact JSON with the actor', () => {
    const { db, qid } = seedDb();
    const doc = buildQuoteDocument(db, qid);
    saveRevision(db, qid, doc, 'agent');
    const row = db.prepare('SELECT rev, actor FROM quotation_revisions WHERE quotation_id=?').get(qid);
    assert.equal(row.rev, 1);
    assert.equal(row.actor, 'agent');
  });
});