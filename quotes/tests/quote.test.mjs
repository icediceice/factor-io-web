// quotes/tests/quote.test.mjs — totals engine, numbering, snapshots.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openDb, getSettings, migrate, MIGRATIONS } from '../lib/db.mjs';
import {
  computeTotals, allocateQuoteNumber, buildQuoteDocument,
  saveRevision, markStatus,
} from '../lib/quote.mjs';
import { renderQuotationHtml } from '../templates/quotation.mjs';
import { formatMoney } from '../lib/money.mjs';

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

  // -------------------------------------------------------------------------
  // THE REGRESSION THAT MATTERS: lines carrying none of the new fields must
  // produce exactly the figures they produced before those fields existed.
  // Every assertion above this point is that proof for the legacy shape; these
  // add the shape where the new fields are present but neutral.
  // -------------------------------------------------------------------------
  test('new fields at their defaults change no existing figure', () => {
    const before = computeTotals(LINES, settings);
    const after = computeTotals(
      LINES.map((l) => ({ ...l, billingPeriod: 'once', section: '', optional: false })),
      settings,
      0,
    );
    for (const k of ['subtotalSatang', 'discountSatang', 'netSatang', 'vatSatang',
      'grandSatang', 'whtSatang', 'payableSatang']) {
      assert.equal(after[k], before[k], `${k} drifted`);
    }
    assert.equal(after.contractTotalSatang, null);
    assert.equal(after.optionalSatang, 0);
    assert.equal(after.hasRecurring, false);
  });

  test('an optional line is priced but excluded from everything payable', () => {
    const withOption = computeTotals(
      [...LINES, { qtyMilli: 2000, unitSatang: 4500000, discountSatang: 0, optional: true }],
      settings,
    );
    const plain = computeTotals(LINES, settings);
    assert.equal(withOption.netSatang, plain.netSatang);
    assert.equal(withOption.vatSatang, plain.vatSatang);
    assert.equal(withOption.payableSatang, plain.payableSatang);
    assert.equal(withOption.subtotalSatang, plain.subtotalSatang);
    // ...but it is still quoted to the customer.
    assert.equal(withOption.optionalSatang, 9000000);
  });

  test('a quotation of nothing but options owes nothing', () => {
    const t = computeTotals(
      [{ qtyMilli: 1000, unitSatang: 5000000, discountSatang: 0, optional: true }], settings, 12);
    assert.equal(t.netSatang, 0);
    assert.equal(t.vatSatang, 0);
    assert.equal(t.payableSatang, 0);
    assert.equal(t.optionalSatang, 5000000);
  });

  test('recurring lines bucket by period and the term extends them', () => {
    // 2,670,000 once + 482,000/yr + 85,000/mo over 36 months.
    const t = computeTotals([
      { qtyMilli: 3000, unitSatang: 89000000, discountSatang: 0, billingPeriod: 'once', section: 'Hardware' },
      { qtyMilli: 3000, unitSatang: 5400000, discountSatang: 0, billingPeriod: 'yearly', section: 'Software' },
      { qtyMilli: 1000, unitSatang: 32000000, discountSatang: 0, billingPeriod: 'yearly', section: 'Software' },
      { qtyMilli: 1000, unitSatang: 8500000, discountSatang: 0, billingPeriod: 'monthly', section: 'Services' },
    ], settings, 36);

    assert.equal(t.oneTimeSatang, 267000000);
    assert.equal(t.recurringSatang.yearly, 48200000);
    assert.equal(t.recurringSatang.monthly, 8500000);
    assert.equal(t.recurringSatang.quarterly, 0);
    assert.equal(t.hasRecurring, true);
    assert.equal(t.termMonths, 36);
    // 2,670,000 + 482,000*3 + 85,000*36 = 2,670,000 + 1,446,000 + 3,060,000
    assert.equal(t.contractTotalSatang, 717600000);

    // The payable is ONE cycle, not the contract — this is the invariant that
    // keeps VAT correct and stops a 36-month figure reaching an invoice.
    assert.equal(t.netSatang, 267000000 + 48200000 + 8500000);
    assert.ok(t.contractTotalSatang > t.grandSatang);
    assert.equal(t.vatSatang, Math.round(t.netSatang * 7 / 100));
  });

  test('a term with nothing recurring yields no contract total', () => {
    const t = computeTotals(
      [{ qtyMilli: 1000, unitSatang: 5000000, discountSatang: 0, billingPeriod: 'once' }], settings, 36);
    assert.equal(t.contractTotalSatang, null);
  });

  test('a term that does not divide the period stays exact in satang', () => {
    // 10,000/yr over 18 months = 15,000 exactly, and never a float.
    const t = computeTotals(
      [{ qtyMilli: 1000, unitSatang: 1000000, discountSatang: 0, billingPeriod: 'yearly' }], settings, 18);
    assert.equal(t.contractTotalSatang, 1500000);
    assert.ok(Number.isSafeInteger(t.contractTotalSatang));
    // 100,000/quarter over 7 months is 233,333.33 — must land on an integer.
    const q = computeTotals(
      [{ qtyMilli: 1000, unitSatang: 10000000, discountSatang: 0, billingPeriod: 'quarterly' }], settings, 7);
    assert.ok(Number.isSafeInteger(q.contractTotalSatang));
  });

  test('sections keep first-appearance order and sum to net', () => {
    const t = computeTotals([
      { qtyMilli: 1000, unitSatang: 1000000, discountSatang: 0, section: 'Zulu' },
      { qtyMilli: 1000, unitSatang: 2000000, discountSatang: 0, section: 'Alpha' },
      { qtyMilli: 1000, unitSatang: 3000000, discountSatang: 0, section: 'Zulu' },
    ], settings);
    // NOT sorted: the operator's line order is the running order of the proposal.
    assert.deepEqual(t.sections.map((s) => s.name), ['Zulu', 'Alpha']);
    assert.equal(t.sections[0].netSatang, 4000000);
    assert.equal(t.sections[1].netSatang, 2000000);
    assert.equal(t.sections.reduce((a, s) => a + s.netSatang, 0), t.netSatang);
  });

  test('a section subtotal matches the gross AMOUNT column a reader adds up', () => {
    // The printed AMOUNT column is GROSS (per-line discount is aggregated once
    // in the totals block, not shown per line). A section subtotal printed
    // under that column must therefore be gross too — printing the net figure
    // made the visible arithmetic wrong by exactly the discount, which is the
    // kind of error a customer notices before we do.
    const t = computeTotals([
      { qtyMilli: 3000, unitSatang: 89000000, discountSatang: 0, section: 'Hardware' },
      { qtyMilli: 1000, unitSatang: 24000000, discountSatang: 400000, section: 'Hardware' },
    ], settings);
    const s = t.sections[0];
    assert.equal(s.subtotalSatang, 267000000 + 24000000, 'gross must equal the column sum');
    assert.equal(s.netSatang, s.subtotalSatang - 400000);
    assert.equal(t.sections.reduce((a, x) => a + x.subtotalSatang, 0), t.subtotalSatang);
    assert.equal(t.sections.reduce((a, x) => a + x.netSatang, 0), t.netSatang);
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
  test('a fresh database lands on user_version 5', () => {
    const db = openDb(':memory:');
    assert.equal(db.prepare('PRAGMA user_version;').get().user_version, 5);
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

  test('a POPULATED v2 database upgrades to 5 with every row and status intact', () => {
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

    assert.equal(db.prepare('PRAGMA user_version;').get().user_version, 5);
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
    assert.equal(db.prepare('PRAGMA user_version;').get().user_version, 5);
  });

  // -------------------------------------------------------------------------
  // Migration 5 rebuilds THREE tables to drop a CHECK. The risk is not that it
  // fails loudly — migrate() would roll back — but that it succeeds while
  // quietly losing a row, a foreign key, a created_at or an index.
  // -------------------------------------------------------------------------
  test('migration 5 opens the kind vocabulary without losing data', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    for (const m of MIGRATIONS.filter((m) => m.version <= 4)) {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version};`);
    }

    db.prepare(`INSERT INTO clients (name) VALUES ('Acme')`).run();
    db.prepare(`INSERT INTO catalog_items (kind, sku, name_en, unit, unit_satang)
                VALUES ('hardware', 'NX-3170', 'Node', 'unit', 89000000)`).run();
    db.prepare(`INSERT INTO quotations (number, client_id, status) VALUES ('QT-A', 1, 'accepted')`).run();
    db.prepare(`INSERT INTO quotation_lines
                  (quotation_id, position, kind, description_en, qty_milli, unit, unit_satang, discount_satang, catalog_id)
                VALUES (1, 1, 'hardware', 'Node', 3000, 'unit', 89000000, 500000, 1)`).run();
    db.prepare(`INSERT INTO invoices (number, quotation_id, client_id, status, issue_date, net_satang)
                VALUES ('INV-A', 1, 1, 'issued', '2026-09-17', 26700000)`).run();
    db.prepare(`INSERT INTO invoice_lines
                  (invoice_id, position, kind, description_en, qty_milli, unit, unit_satang, discount_satang)
                VALUES (1, 1, 'hardware', 'Node', 3000, 'unit', 89000000, 500000)`).run();
    const createdAtBefore = db.prepare('SELECT created_at FROM quotation_lines WHERE id = 1').get().created_at;

    migrate(db);

    assert.equal(db.prepare('PRAGMA user_version;').get().user_version, 5);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check;').all(), []);

    const line = db.prepare('SELECT * FROM quotation_lines WHERE id = 1').get();
    assert.equal(line.unit_satang, 89000000);
    assert.equal(line.discount_satang, 500000);
    // The FK that pointed at the table we dropped and recreated.
    assert.equal(line.catalog_id, 1);
    // A rebuild that let the column default fire would stamp 'now' instead.
    assert.equal(line.created_at, createdAtBefore);
    // New columns arrive with the defaults that preserve existing behaviour.
    assert.equal(line.billing_period, 'once');
    assert.equal(line.section, '');
    assert.equal(line.optional, 0);
    assert.equal(db.prepare('SELECT term_months FROM quotations WHERE id = 1').get().term_months, 0);

    // An invoice line is never optional, so that column must NOT exist.
    const invLine = db.prepare('SELECT * FROM invoice_lines WHERE id = 1').get();
    assert.ok(!('optional' in invLine), 'invoice_lines must not carry an optional column');
    assert.equal(invLine.billing_period, 'once');

    // Indexes are dropped with their table — prove both were recreated.
    const idx = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_lines_quotation','idx_invoice_lines')`
    ).all();
    assert.equal(idx.length, 2);

    // THE POINT OF THE WHOLE MIGRATION: a kind that was previously impossible.
    db.prepare(`INSERT INTO quotation_lines
                  (quotation_id, position, kind, description_en, qty_milli, unit, unit_satang, billing_period, section)
                VALUES (1, 2, 'software', 'NCI Ultimate', 3000, 'node', 5400000, 'yearly', 'Software')`).run();
    assert.equal(db.prepare(`SELECT kind FROM quotation_lines WHERE position = 2`).get().kind, 'software');

    // billing_period stays CLOSED on purpose — the totals math branches on it.
    assert.throws(() => db.prepare(`INSERT INTO quotation_lines
                  (quotation_id, position, kind, description_en, qty_milli, unit, unit_satang, billing_period)
                VALUES (1, 3, 'software', 'Bad', 1000, 'unit', 100, 'fortnightly')`).run());

    // The vocabulary itself is a settings row, not code.
    const kinds = JSON.parse(getSettings(db, '')['line.kinds']);
    assert.ok(Array.isArray(kinds) && kinds.length >= 9);
    assert.ok(kinds.some((k) => k.code === 'software' && k.th === 'ซอฟต์แวร์'));
  });
});

// The backward-compatibility assertion the whole migration rests on. Every
// quotation written before migration 5 has billing_period 'once', a blank
// section, optional 0 and term_months 0 — those defaults must be INVISIBLE on
// the rendered document, or migrating silently redesigned every quote already
// sent to a customer.
describe('a pre-migration-5 quotation renders exactly as it always did', () => {
  const money = (s) => formatMoney(s, { symbol: '฿', code: 'THB' });

  test('no section anywhere: a flat table, no grouping or billing furniture', () => {
    const { db, qid } = seedDb();
    const html = renderQuotationHtml(buildQuoteDocument(db, qid), 'en');

    // None of the new furniture may appear.
    assert.equal(html.includes('<tr class="sec">'), false);
    assert.equal(html.includes('class="secsum"'), false);
    assert.equal(html.includes('class="period"'), false);
    assert.equal(html.includes('class="opt"'), false);
    assert.equal(html.includes('class="memo"'), false);

    // Rows stay in position order, one per line.
    assert.equal((html.match(/<td class="pos">/g) ?? []).length, 3);
    assert.ok(html.indexOf('Architecture consulting') < html.indexOf('Half-day review'));
    assert.ok(html.indexOf('Half-day review') < html.indexOf('Edge server'));

    // And the legacy figures are untouched: gross 442,500.00, discount
    // 10,000.00, net 432,500.00 — the same arithmetic as before migration 5.
    assert.ok(html.includes(money(44250000)));
    assert.ok(html.includes(money(1000000)));
    assert.ok(html.includes(money(43250000)));
  });

  test('the migration-5 defaults do not reach the document object either', () => {
    const { db, qid } = seedDb();
    const doc = buildQuoteDocument(db, qid);
    assert.equal(doc.quotation.termMonths, 0);
    assert.equal(doc.totals.contractTotalSatang, null);
    assert.equal(doc.totals.optionalSatang, 0);
    assert.equal(doc.totals.hasRecurring, false);
    assert.equal(doc.totals.oneTimeSatang, doc.totals.netSatang);
    for (const l of doc.lines) {
      assert.equal(l.billingPeriod, 'once');
      assert.equal(l.section, '');
      assert.equal(l.optional, false);
    }
  });
});

// computeTotals folds every line of a section into ONE entry, so the template
// must group by section NAME. Rendering contiguous runs instead printed the
// header twice and the FULL section subtotal under each half — a figure that
// adds up to nothing on the page and is double the truth.
describe('section subtotals when a section name repeats out of order', () => {
  const money = (s) => formatMoney(s, { symbol: '฿', code: 'THB' });

  function seedInterleaved() {
    const db = openDb(':memory:');
    db.prepare(`INSERT INTO clients (name) VALUES ('Acme Ltd')`).run();
    db.prepare(`INSERT INTO quotations (number, client_id, lang) VALUES ('QT-202609-0009', 1, 'en')`).run();
    const add = db.prepare(
      `INSERT INTO quotation_lines
         (quotation_id, position, kind, description_en, qty_milli, unit, unit_satang, billing_period, section, optional)
       VALUES (1, ?, ?, ?, 1000, 'unit', ?, ?, ?, ?)`
    );
    add.run(1, 'software', 'Platform licence', 40000000, 'yearly', 'Software', 0);
    add.run(2, 'service', 'Installation', 15000000, 'once', 'Services', 0);
    add.run(3, 'software', 'Analytics module', 25000000, 'yearly', 'Software', 0);
    add.run(4, 'training', 'Operator course', 9000000, 'once', 'Options', 1);
    return db;
  }

  test('each section prints one header and one subtotal equal to ITS gross', () => {
    const html = renderQuotationHtml(buildQuoteDocument(seedInterleaved(), 1), 'en');

    assert.equal((html.match(/<tr class="sec"><td colspan="\d+">Software<\/td><\/tr>/g) ?? []).length, 1);
    assert.equal((html.match(/<tr class="sec"><td colspan="\d+">Services<\/td><\/tr>/g) ?? []).length, 1);
    assert.equal((html.match(/class="secsum"/g) ?? []).length, 2);

    // 400,000 + 250,000 in one Software subtotal — NOT 650,000 printed twice.
    assert.ok(html.includes(money(65000000)));
    assert.ok(html.includes(money(15000000)));

    // Both Software lines sit above their single subtotal, and the whole
    // Software group precedes the Services header.
    const softwareSubtotal = html.indexOf('— Software');
    assert.ok(html.indexOf('Platform licence') < softwareSubtotal);
    assert.ok(html.indexOf('Analytics module') < softwareSubtotal);
    assert.ok(softwareSubtotal < html.indexOf('>Services<'));
  });

  test('an all-optional section shows its rows and no subtotal', () => {
    const doc = buildQuoteDocument(seedInterleaved(), 1);
    // computeTotals never saw the optional line, so Options has no entry...
    assert.equal(doc.totals.sections.some((s) => s.name === 'Options'), false);
    assert.equal(doc.totals.optionalSatang, 9000000);
    // ...and the page prints the header and the row, but no subtotal for it.
    const html = renderQuotationHtml(doc, 'en');
    assert.ok(html.includes('Operator course'));
    assert.equal(html.includes('— Options'), false);
    // The option is in no payable figure.
    assert.equal(doc.totals.subtotalSatang, 80000000);
  });
});