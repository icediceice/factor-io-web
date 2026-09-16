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

const MIGRATIONS = [
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
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.exec('BEGIN;');
    try {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version};`);
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw new Error(`migration ${m.version} (${m.name}) failed: ${err.message}`);
    }
  }
}

/** Run fn inside a transaction; rolls back on throw. Returns fn's result. */
export function tx(db, fn) {
  db.exec('BEGIN;');
  try {
    const out = fn();
    db.exec('COMMIT;');
    return out;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
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