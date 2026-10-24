// A Cloudflare D1 binding backed by node:sqlite, with the real migrations applied, so
// tests run the Worker's actual SQL. Like D1, every call is async and errors throw;
// unlike D1 it is in-process, so it proves SQL semantics, not D1 transport behaviour.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const MIGRATIONS = new URL('../../catcountdown/worker/migrations/', import.meta.url).pathname;

export function migratedSqlite(dir = MIGRATIONS) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, name), 'utf8'));
  }
  return db;
}

const plain = (row) => (row ? { ...row } : row);

function statement(db, sql, params) {
  return {
    bind: (...values) => statement(db, sql, values),
    async first(column) {
      const row = db.prepare(sql).get(...params);
      if (!row) return null;
      return column === undefined ? plain(row) : row[column];
    },
    async all() {
      return { success: true, results: db.prepare(sql).all(...params).map(plain), meta: {} };
    },
    async run() {
      const info = db.prepare(sql).run(...params);
      return { success: true, results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
    },
  };
}

export function d1Binding(db = migratedSqlite()) {
  return { raw: db, prepare: (sql) => statement(db, sql, []) };
}