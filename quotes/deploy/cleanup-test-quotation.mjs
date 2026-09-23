// One-time cleanup for the named platform test records. Requires an explicit DB.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tx } from '../lib/db.mjs';
import { deleteQuotation } from '../lib/quote.mjs';

const expected = {
  id: 4,
  number: 'QT-202609-0004',
  status: 'cancelled',
  invoices: [{ id: 1, number: 'INV-202609-0001', status: 'cancelled' }],
};

export function cleanupTestQuotation(db, { apply = false } = {}) {
  if (db.prepare('PRAGMA user_version').get().user_version !== 8) {
    throw new Error('cleanup requires schema version 8; deploy and restart first');
  }
  return tx(db, () => {
    const quote = db.prepare('SELECT id, number, status FROM quotations WHERE number = ?').get(expected.number);
    const invoices = quote ? db.prepare(
      'SELECT id, number, status FROM invoices WHERE quotation_id = ? ORDER BY id'
    ).all(quote.id) : [];
    const actual = quote ? { ...quote, invoices } : null;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`cleanup identity mismatch: ${JSON.stringify(actual)}`);
    }
    const invoiceId = expected.invoices[0].id;
    const payments = db.prepare('SELECT COUNT(*) c FROM payments WHERE invoice_id = ?').get(invoiceId).c;
    const certificates = db.prepare('SELECT COUNT(*) c FROM wht_certificates WHERE invoice_id = ?').get(invoiceId).c;
    if (payments || certificates) {
      throw new Error(`cleanup refused: invoice has ${payments} payments and ${certificates} WHT certificates`);
    }
    const report = { quotation: quote, invoices, payments, certificates };
    if (apply) report.deleted = deleteQuotation(db, quote.id, { actor: 'test-cleanup', expect: expected });
    return report;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== '--db' || !['--dry-run', '--apply'].includes(args[2])) {
    throw new Error('usage: node deploy/cleanup-test-quotation.mjs --db ABSOLUTE_PATH --dry-run|--apply');
  }
  if (!isAbsolute(args[1]) || !existsSync(args[1])) throw new Error(`database missing or path is not absolute: ${args[1]}`);
  const path = realpathSync(args[1]);
  console.log(`Database: ${path}`);
  const db = new DatabaseSync(path, { readOnly: args[2] === '--dry-run' });
  try {
    db.exec('PRAGMA foreign_keys = ON;');
    console.log(JSON.stringify(cleanupTestQuotation(db, { apply: args[2] === '--apply' }), null, 2));
  } finally {
    db.close();
  }
}