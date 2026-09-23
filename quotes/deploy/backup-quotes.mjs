// Online, consistent SQLite backup before a production migration.
// Run from the deployed directory with the same QUOTES_DB_PATH as the service.
import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(process.env.QUOTES_DB_PATH ?? join(app, 'data', 'quotes.db'));
if (!existsSync(sourcePath)) throw new Error(`database missing: ${sourcePath}`);
const destDir = join(dirname(sourcePath), 'backups');
mkdirSync(destDir, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replaceAll(':', '-');
const destPath = join(destDir, `quotes-${stamp}.db`);
if (existsSync(destPath)) throw new Error(`backup already exists: ${destPath}`);
const db = new DatabaseSync(sourcePath, { readOnly: true });
try {
  await backup(db, destPath);
} finally {
  db.close();
}
chmodSync(destPath, 0o600);
const copy = new DatabaseSync(destPath, { readOnly: true });
try {
  const check = copy.prepare('PRAGMA integrity_check').get();
  if (check.integrity_check !== 'ok') throw new Error(`backup integrity check failed: ${check.integrity_check}`);
  console.log(`SQLite backup verified: ${destPath}`);
  console.log(`Schema version: ${copy.prepare('PRAGMA user_version').get().user_version}`);
} finally {
  copy.close();
}
