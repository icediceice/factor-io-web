// quotes/tests/quote.test.mjs — totals engine, numbering, snapshots.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openDb, getSettings, migrate, MIGRATIONS } from '../lib/db.mjs';
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
    const { rev } = markStatus(db, qid, 'issued', 'op@factor-io.com');
    assert.equal(rev, 1);
    const snap = db.prepare('SELECT snapshot_json FROM quotation_revisions WHERE quotation_id=? AND rev=1').get(qid);
    const snapshot = JSON.parse(snap.snapshot_json);
    // the snapshot records the state AT ISSUE, including the new status
    assert.equal(snapshot.quotation.status, 'issued');
    // totals in the snapshot equal an independent computation from the rows
    const lines = db.prepare('SELECT * FROM quotation_lines WHERE quotation_id=? ORDER BY position').all(qid);
    const expected = computeTotals(
      lines.map((l) => ({ qtyMilli: l.qty_milli, unitSatang: l.unit_satang, discountSatang: l.discount_satang })),
      getSettings(db, ''),
    );
    assert.deepEqual(snapshot.totals, expected);
    assert.equal(snapshot.client.name, 'Acme Ltd');
    // live document follows row changes; the stored snapshot does not move
    db.prepare('UPDATE quotation_lines SET unit_satang = 999 WHERE quotation_id = ?').run(qid);
    const afterMutation = JSON.stringify(buildQuoteDocument(db, qid));
    assert.notEqual(afterMutation, snap.snapshot_json);
    const row = db.prepare('SELECT snapshot_json FROM quotation_revisions WHERE quotation_id=? AND rev=1').get(qid);
    assert.equal(row.snapshot_json, snap.snapshot_json); // byte-identical
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

// ---------------------------------------------------------------------------
// Migration proof. Plan step 5 promised BOTH installation paths, and only one
// of them is interesting: a fresh DB never exercises migration 3's quotations
// rebuild. That rebuild is a one-way door — DROP TABLE with foreign keys ON
// performs an implicit DELETE that FIRES ON DELETE CASCADE, which would take
// quotation_lines and quotation_revisions with it. Nothing but a populated
// v2 upgrade can catch that regression, so it is committed here rather than
// checked by hand once.
// ---------------------------------------------------------------------------

/** A genuine schema-v2 database: migrations 1-2 applied, user_version = 2. */
function openV2Db() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');   // as openDb() does — this is what makes DROP cascade
  for (const m of MIGRATIONS.filter((m) => m.version <= 2)) {
    db.exec(m.sql);
    db.exec(`PRAGMA user_version = ${m.version};`);
  }
  return db;
}

describe('migrations', () => {
  test('a fresh database lands on user_version 4', () => {
    const db = openDb(':memory:');
    assert.equal(db.prepare('PRAGMA user_version;').get().user_version, 4);
    // Migration 4's seeds are present and are the accounting keys, not stubs.
    const s = getSettings(db, '');
    assert.equal(s['invoice.number_format'], 'INV-{YYYY}{MM}-{SEQ:4}');
    assert.equal(s['invoice.payment_terms_days'], '30');
    assert.equal(s['tax.branch_code'], '00000');
    // The widened CHECK actually took: a v3-only status must be storable.
    db.prepare(`INSERT INTO clients (name) VALUES ('X')`).run();
    db.prepare(`INSERT INTO quotations (number, client_id, status) VALUES ('QT-X', 1, 'proposed')`).run();
    assert.equal(db.prepare(`SELECT status FROM quotations WHERE number='QT-X'`).get().status, 'proposed');
  });

  test('a POPULATED v2 database upgrades to 4 with every row and status intact', () => {
    const db = openV2Db();
    assert.equal(db.prepare('PRAGMA user_version;').get().user_version, 2);

    const { lastInsertRowid: clientId } = db.prepare(
      `INSERT INTO clients (name, tax_id) VALUES (?, ?)`
    ).run('Legacy Client Ltd', '0105558000000');
    // Every status the v2 CHECK allowed — each one must survive the rebuild.
    const v2Statuses = ['draft', 'issued', 'superseded', 'cancelled'];
    const before = [];
    for (const [i, status] of v2Statuses.entries()) {
      const { lastInsertRowid: qid } = db.prepare(
        `INSERT INTO quotations (number, client_id, status, lang, issue_date, notes)
         VALUES (?, ?, ?, 'th', '2026-01-0' || ?, ?)`
      ).run(`QT-202601-000${i + 1}`, clientId, status, i + 1, `legacy ${status}`);
      db.prepare(
        `INSERT INTO quotation_lines
           (quotation_id, position, kind, description_en, qty_milli, unit, unit_satang, discount_satang)
         VALUES (?, 1, 'service', ?, 1000, 'day', 3500000, 0)`
      ).run(qid, `line for ${status}`);
      db.prepare(
        `INSERT INTO quotation_revisions (quotation_id, rev, snapshot_json, actor)
         VALUES (?, 1, ?, 'legacy')`
      ).run(qid, JSON.stringify({ status }));
      before.push({ id: Number(qid), number: `QT-202601-000${i + 1}`, status });
    }
    db.prepare(`INSERT INTO quote_counters (key, value) VALUES ('QT-202601', 4)`).run();

    migrate(db);

    assert.equal(db.prepare('PRAGMA user_version;').get().user_version, 4);
    // Ids, numbers and statuses all preserved — a rebuild that renumbered rows
    // would silently detach every child row and every stored revision.
    const after = db.prepare('SELECT id, number, status, lang, notes FROM quotations ORDER BY id').all();
    assert.equal(after.length, before.length);
    for (const [i, row] of after.entries()) {
      assert.equal(Number(row.id), before[i].id);
      assert.equal(row.number, before[i].number);
      assert.equal(row.status, before[i].status);
      assert.equal(row.lang, 'th');
      assert.equal(row.notes, `legacy ${before[i].status}`);
    }
    // THE CASCADE CHECK: children still attached, not deleted by the DROP.
    assert.equal(db.prepare('SELECT COUNT(*) c FROM quotation_lines').get().c, before.length);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM quotation_revisions').get().c, before.length);
    for (const q of before) {
      assert.equal(db.prepare('SELECT COUNT(*) c FROM quotation_lines WHERE quotation_id = ?').get(q.id).c, 1);
      assert.equal(db.prepare('SELECT COUNT(*) c FROM quotation_revisions WHERE quotation_id = ?').get(q.id).c, 1);
    }
    // No dangling references anywhere after the rebuild.
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check;').all(), []);
    // The counter table is untouched, so numbering cannot restart and collide.
    assert.equal(db.prepare(`SELECT value FROM quote_counters WHERE key='QT-202601'`).get().value, 4);
    // And the new tables exist with the widened status CHECK live.
    db.prepare(`UPDATE quotations SET status = 'invoiced' WHERE id = ?`).run(before[0].id);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices').get().c, 0);
    assert.equal(getSettings(db, '')['invoice.number_format'], 'INV-{YYYY}{MM}-{SEQ:4}');
  });

  test('migrating an already-current database is a no-op', () => {
    const db = openDb(':memory:');
    migrate(db);
    assert.equal(db.prepare('PRAGMA user_version;').get().user_version, 4);
  });
});