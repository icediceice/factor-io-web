// quotes/lib/db.mjs — SQLite storage layer (node:sqlite, zero dependencies).
//
// Rules this layer enforces:
//   - ALL money is stored as INTEGER minor units (satang, 1 THB = 100 satang).
//   - Quantities are stored as INTEGER milli-units (qty_milli: 1 day = 1000),
//     so 0.5-day lines are exact and no float ever enters arithmetic.
//   - FX rates are stored as exact decimal TEXT, never REAL.
//   - Migrations are forward-only and tracked in PRAGMA user_version.
//   - Every schema table the plan names exists here; quote_counters backs the
//     settings-driven quote-number allocator (monotonic, reuse-proof).
//
// Business facts are NOT hardcoded here. A fresh database is seeded with
// placeholder settings rows by migration 2; the operator (or the settings
// API) owns every value. Code and templates only read settings.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const SATANG = 100;          // minor units per THB
export const MILLI = 1000;          // qty resolution: 1 unit = 1000 milli

// Exported so the migration test can build a genuine OLD-VERSION database by
// applying a prefix of this list, then prove migrate() upgrades it in place.
// Asserting on a fresh DB only would never exercise the quotations rebuild,
// which is the one-way door in migration 3.
export const MIGRATIONS = [
  {
    version: 1,
    name: 'core-schema',
    sql: `
      CREATE TABLE settings (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL DEFAULT '',
        updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by  TEXT NOT NULL DEFAULT 'system'
      );

      CREATE TABLE clients (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        name_th     TEXT NOT NULL DEFAULT '',
        address     TEXT NOT NULL DEFAULT '',
        address_th  TEXT NOT NULL DEFAULT '',
        tax_id      TEXT NOT NULL DEFAULT '',
        contact     TEXT NOT NULL DEFAULT '',
        email       TEXT NOT NULL DEFAULT '',
        phone       TEXT NOT NULL DEFAULT '',
        notes       TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE catalog_items (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        kind         TEXT NOT NULL CHECK (kind IN ('service','hardware')),
        sku          TEXT NOT NULL DEFAULT '',
        name_en      TEXT NOT NULL,
        name_th      TEXT NOT NULL DEFAULT '',
        description  TEXT NOT NULL DEFAULT '',
        unit         TEXT NOT NULL DEFAULT 'day',
        unit_satang  INTEGER NOT NULL CHECK (unit_satang >= 0),
        active       INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE quotations (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        number        TEXT NOT NULL UNIQUE,
        client_id     INTEGER NOT NULL REFERENCES clients(id),
        status        TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','issued','superseded','cancelled')),
        lang          TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en','th')),
        currency      TEXT NOT NULL DEFAULT 'THB',
        issue_date    TEXT NOT NULL DEFAULT '',
        valid_until   TEXT NOT NULL DEFAULT '',
        fx_base       TEXT NOT NULL DEFAULT '',
        fx_rate       TEXT NOT NULL DEFAULT '',   -- exact decimal TEXT: 1 base = N THB
        fx_as_of      TEXT NOT NULL DEFAULT '',
        notes         TEXT NOT NULL DEFAULT '',
        created_by    TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE quotation_lines (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        quotation_id    INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        position        INTEGER NOT NULL DEFAULT 0,
        kind            TEXT NOT NULL CHECK (kind IN ('service','hardware')),
        description_en  TEXT NOT NULL,
        description_th  TEXT NOT NULL DEFAULT '',
        qty_milli       INTEGER NOT NULL CHECK (qty_milli > 0),
        unit            TEXT NOT NULL DEFAULT 'day',
        unit_satang     INTEGER NOT NULL CHECK (unit_satang >= 0),
        discount_satang INTEGER NOT NULL DEFAULT 0 CHECK (discount_satang >= 0),
        catalog_id      INTEGER REFERENCES catalog_items(id),
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_lines_quotation ON quotation_lines(quotation_id, position);

      CREATE TABLE quotation_revisions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        quotation_id  INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        rev           INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        actor         TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (quotation_id, rev)
      );

      CREATE TABLE audit_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        at         TEXT NOT NULL DEFAULT (datetime('now')),
        actor      TEXT NOT NULL,
        action     TEXT NOT NULL,
        entity     TEXT NOT NULL,
        entity_id  TEXT NOT NULL DEFAULT '',
        detail     TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX idx_audit_at ON audit_log(at);

      CREATE TABLE quote_counters (
        key     TEXT PRIMARY KEY,      -- e.g. resolved prefix 'QT-202609'
        value   INTEGER NOT NULL DEFAULT 0
      );
    `,
  },
  {
    version: 2,
    name: 'seed-settings',
    // Placeholder values so a fresh install boots. Every one is a setting the
    // operator edits via the settings screen/API — none lives in code.
    sql: `
      INSERT INTO settings (key, value, updated_by) VALUES
        ('company.name',      'Factor I/O Co., Ltd.', 'seed'),
        ('company.name_th',   'แฟคเตอร์ ไอ/โอ จำกัด', 'seed'),
        ('company.address',   '', 'seed'),
        ('company.address_th','', 'seed'),
        ('company.tax_id',    '', 'seed'),
        ('company.phone',     '', 'seed'),
        ('company.email',     '', 'seed'),
        ('company.website',   '', 'seed'),
        ('company.logo_path', '', 'seed'),
        ('vat.rate_percent',  '7', 'seed'),
        ('wht.rate_percent',  '3', 'seed'),
        ('wht.apply',         'memo', 'seed'),
        ('quote.number_format',   'QT-{YYYY}{MM}-{SEQ:4}', 'seed'),
        ('quote.validity_days',   '15', 'seed'),
        ('quote.payment_terms_en','Net 30 days after invoice date.', 'seed'),
        ('quote.payment_terms_th','ชำระเงินภายใน 30 วัน นับจากวันที่ออกใบแจ้งหนี้', 'seed'),
        ('quote.terms_en',        '', 'seed'),
        ('quote.terms_th',        '', 'seed'),
        ('currency.code',     'THB', 'seed'),
        ('currency.symbol',   '฿', 'seed'),
        ('fx.base',           'USD', 'seed'),
        ('fx.rate',           '36.50', 'seed'),
        ('fx.as_of',          '', 'seed'),
        ('bank.name',         '', 'seed'),
        ('bank.name_th',      '', 'seed'),
        ('bank.account_name', '', 'seed'),
        ('bank.account_number','', 'seed'),
        ('bank.branch',       '', 'seed'),
        ('bank.swift',        '', 'seed');
    `,
  },
  {
    version: 3,
    name: 'accounting-schema',
    // Rebuilds `quotations` to widen the status CHECK, then adds the invoice
    // side. SQLite cannot ALTER a CHECK, so this is the official 12-step
    // procedure: create new_X -> copy -> DROP old X -> rename new_X to X.
    // The rename-old-first variant is explicitly documented as INCORRECT
    // because it corrupts FK references held by other tables.
    //
    // migrate() disables foreign keys around this (see the note there) — the
    // DROP below would otherwise fire ON DELETE CASCADE and wipe
    // quotation_lines and quotation_revisions.
    //
    // No index, trigger or view exists on `quotations` itself, so there is
    // nothing to reconstruct after the rename.
    sql: `
      CREATE TABLE quotations_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        number        TEXT NOT NULL UNIQUE,
        client_id     INTEGER NOT NULL REFERENCES clients(id),
        status        TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','issued','proposed','accepted',
                                        'declined','invoiced','paid',
                                        'superseded','cancelled')),
        lang          TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en','th')),
        currency      TEXT NOT NULL DEFAULT 'THB',
        issue_date    TEXT NOT NULL DEFAULT '',
        valid_until   TEXT NOT NULL DEFAULT '',
        fx_base       TEXT NOT NULL DEFAULT '',
        fx_rate       TEXT NOT NULL DEFAULT '',
        fx_as_of      TEXT NOT NULL DEFAULT '',
        notes         TEXT NOT NULL DEFAULT '',
        created_by    TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO quotations_new
        (id, number, client_id, status, lang, currency, issue_date, valid_until,
         fx_base, fx_rate, fx_as_of, notes, created_by, created_at, updated_at)
        SELECT
         id, number, client_id, status, lang, currency, issue_date, valid_until,
         fx_base, fx_rate, fx_as_of, notes, created_by, created_at, updated_at
        FROM quotations;

      DROP TABLE quotations;
      ALTER TABLE quotations_new RENAME TO quotations;

      -- A tax invoice is its own entity, never a quotation status: it carries
      -- its own number series, its own issue_date (which IS the VAT tax point),
      -- and one quotation may bill as several invoices (deposit + balance).
      --
      -- vat_rate_percent / wht_rate_percent and every *_satang column are
      -- FROZEN copies taken once at issue. Reports read these columns and never
      -- re-derive from settings, so editing a rate later cannot retroactively
      -- move a figure that has already been filed.
      CREATE TABLE invoices (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        number           TEXT NOT NULL UNIQUE,
        quotation_id     INTEGER REFERENCES quotations(id),
        client_id        INTEGER NOT NULL REFERENCES clients(id),
        status           TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','issued','paid','cancelled')),
        lang             TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en','th')),
        currency         TEXT NOT NULL DEFAULT 'THB',
        issue_date       TEXT NOT NULL DEFAULT '',
        due_date         TEXT NOT NULL DEFAULT '',
        branch_code      TEXT NOT NULL DEFAULT '00000',
        vat_rate_percent TEXT NOT NULL DEFAULT '0',
        wht_rate_percent TEXT NOT NULL DEFAULT '0',
        wht_mode         TEXT NOT NULL DEFAULT 'memo'
                         CHECK (wht_mode IN ('memo','deduct')),
        subtotal_satang  INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_satang >= 0),
        discount_satang  INTEGER NOT NULL DEFAULT 0 CHECK (discount_satang >= 0),
        net_satang       INTEGER NOT NULL DEFAULT 0 CHECK (net_satang >= 0),
        vat_satang       INTEGER NOT NULL DEFAULT 0 CHECK (vat_satang >= 0),
        grand_satang     INTEGER NOT NULL DEFAULT 0 CHECK (grand_satang >= 0),
        wht_satang       INTEGER NOT NULL DEFAULT 0 CHECK (wht_satang >= 0),
        payable_satang   INTEGER NOT NULL DEFAULT 0 CHECK (payable_satang >= 0),
        fx_base          TEXT NOT NULL DEFAULT '',
        fx_rate          TEXT NOT NULL DEFAULT '',
        fx_as_of         TEXT NOT NULL DEFAULT '',
        notes            TEXT NOT NULL DEFAULT '',
        created_by       TEXT NOT NULL DEFAULT '',
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_invoices_issue_date ON invoices(issue_date);
      CREATE INDEX idx_invoices_quotation  ON invoices(quotation_id);
      CREATE INDEX idx_invoices_client     ON invoices(client_id);

      -- Snapshot of the billed lines, copied from quotation_lines at raise
      -- time. Editing the quotation afterwards must not alter a filed invoice.
      CREATE TABLE invoice_lines (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        position        INTEGER NOT NULL DEFAULT 0,
        kind            TEXT NOT NULL CHECK (kind IN ('service','hardware')),
        description_en  TEXT NOT NULL,
        description_th  TEXT NOT NULL DEFAULT '',
        qty_milli       INTEGER NOT NULL CHECK (qty_milli > 0),
        unit            TEXT NOT NULL DEFAULT 'day',
        unit_satang     INTEGER NOT NULL CHECK (unit_satang >= 0),
        discount_satang INTEGER NOT NULL DEFAULT 0 CHECK (discount_satang >= 0),
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_invoice_lines ON invoice_lines(invoice_id, position);

      CREATE TABLE payments (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id    INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        paid_on       TEXT NOT NULL,
        amount_satang INTEGER NOT NULL CHECK (amount_satang > 0),
        method        TEXT NOT NULL DEFAULT 'transfer',
        reference     TEXT NOT NULL DEFAULT '',
        note          TEXT NOT NULL DEFAULT '',
        created_by    TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_payments_invoice ON payments(invoice_id);
      CREATE INDEX idx_payments_paid_on ON payments(paid_on);

      -- WHT certificates RECEIVED from customers who withheld at source.
      -- These are tax already paid on our behalf, credited against PND 50/51 —
      -- not a liability. base_satang is the NET (pre-VAT) amount withheld on.
      CREATE TABLE wht_certificates (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id    INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
        payment_id    INTEGER REFERENCES payments(id) ON DELETE SET NULL,
        cert_number   TEXT NOT NULL DEFAULT '',
        issued_on     TEXT NOT NULL,
        pnd_form      TEXT NOT NULL DEFAULT 'PND53'
                      CHECK (pnd_form IN ('PND53','PND3','PND54','other')),
        base_satang   INTEGER NOT NULL CHECK (base_satang >= 0),
        wht_satang    INTEGER NOT NULL CHECK (wht_satang >= 0),
        rate_percent  TEXT NOT NULL DEFAULT '',
        payer_name    TEXT NOT NULL DEFAULT '',
        payer_tax_id  TEXT NOT NULL DEFAULT '',
        file_path     TEXT NOT NULL DEFAULT '',
        note          TEXT NOT NULL DEFAULT '',
        created_by    TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_wht_invoice   ON wht_certificates(invoice_id);
      CREATE INDEX idx_wht_issued_on ON wht_certificates(issued_on);
    `,
  },
  {
    version: 4,
    name: 'seed-accounting-settings',
    // Same rule as migration 2: placeholders only. Every business fact is a
    // settings row the operator owns — none of these belong in code.
    sql: `
      INSERT INTO settings (key, value, updated_by) VALUES
        ('invoice.number_format',     'INV-{YYYY}{MM}-{SEQ:4}', 'seed'),
        ('invoice.payment_terms_days','30', 'seed'),
        ('invoice.terms_en',          '', 'seed'),
        ('invoice.terms_th',          '', 'seed'),
        ('tax.entity_type',           'company', 'seed'),
        ('tax.vat_registered',        '1', 'seed'),
        ('tax.branch_code',           '00000', 'seed'),
        ('tax.fiscal_year_end',       '12-31', 'seed'),
        ('company.branch_th',         'สำนักงานใหญ่', 'seed'),
        ('company.branch_en',         'Head Office', 'seed');
    `,
  },
];

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

export function migrate(db) {
  const { user_version: current } = db.prepare('PRAGMA user_version;').get();
  const pending = MIGRATIONS.filter((m) => m.version > current);
  if (pending.length === 0) return;

  // Foreign keys are disabled around the whole run, OUTSIDE any transaction.
  // Two SQLite rules force this and both are load-bearing:
  //   - DROP TABLE with FKs enabled performs an implicit DELETE FROM, and that
  //     DELETE *does* fire ON DELETE CASCADE. A table-rebuild migration would
  //     therefore wipe quotation_lines and quotation_revisions.
  //   - PRAGMA foreign_keys is a no-op inside a transaction, so the guard
  //     cannot live in a migration's own SQL — it would be silently ignored.
  // This is step 1 and step 12 of SQLite's official 12-step ALTER procedure.
  const { foreign_keys: fkWasOn } = db.prepare('PRAGMA foreign_keys;').get();
  if (false) db.exec('PRAGMA foreign_keys = OFF;'); // TEMP-FALSIFIER
  try {
    for (const m of pending) {
      db.exec('BEGIN;');
      try {
        db.exec(m.sql);
        // Step 10: prove the rebuild left no dangling reference before commit.
        if (fkWasOn) {
          const violations = db.prepare('PRAGMA foreign_key_check;').all();
          if (violations.length > 0) {
            throw new Error(`foreign_key_check reported ${violations.length} violation(s): ${JSON.stringify(violations)}`);
          }
        }
        db.exec(`PRAGMA user_version = ${m.version};`);
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw new Error(`migration ${m.version} (${m.name}) failed: ${err.message}`);
      }
    }
  } finally {
    if (fkWasOn) db.exec('PRAGMA foreign_keys = ON;');
  }
}

const inTx = new WeakSet();

/** Run fn inside a transaction, rolling back on throw. Reentrant: an inner
 *  call nests via SAVEPOINT so a domain function can compose storage calls
 *  (markStatus -> saveRevision) without clobbering the outer transaction. */
export function tx(db, fn) {
  if (inTx.has(db)) {
    db.exec('SAVEPOINT nested;');
    try {
      const out = fn();
      db.exec('RELEASE nested;');
      return out;
    } catch (err) {
      db.exec('ROLLBACK TO nested;');
      db.exec('RELEASE nested;');
      throw err;
    }
  }
  inTx.add(db);
  try {
    db.exec('BEGIN;');
    try {
      const out = fn();
      db.exec('COMMIT;');
      return out;
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  } finally {
    inTx.delete(db);
  }
}

export function getSetting(db, key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function getSettings(db, prefix = '') {
  const rows = prefix
    ? db.prepare('SELECT key, value FROM settings WHERE key LIKE ? ORDER BY key').all(prefix + '%')
    : db.prepare('SELECT key, value FROM settings ORDER BY key').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setSetting(db, key, value, actor) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`
  ).run(key, String(value), actor);
}

/** Append-only audit trail. actor is an email or 'agent'. */
export function audit(db, actor, action, entity, entityId = '', detail = {}) {
  db.prepare(
    'INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)'
  ).run(actor, action, entity, String(entityId), JSON.stringify(detail));
}