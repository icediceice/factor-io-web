import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openDb } from '../lib/db.mjs';
import { buildQuoteDocument } from '../lib/quote.mjs';
import { renderQuotationHtml } from '../templates/quotation.mjs';

test('quotation PDF groups repeated section names once in first-appearance order', () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO clients (name) VALUES ('Acme')").run();
  db.prepare("INSERT INTO quotations (number, client_id) VALUES ('QT-SECTIONS', 1)").run();
  const add = db.prepare(`
    INSERT INTO quotation_lines
      (quotation_id, position, kind, description_en, qty_milli, unit, unit_satang, section)
    VALUES (1, ?, 'service', ?, 1000, 'unit', ?, ?)
  `);
  add.run(1, 'Software A', 10000, 'Software');
  add.run(2, 'Services', 20000, 'Services');
  add.run(3, 'Software B', 30000, 'Software');

  const html = renderQuotationHtml(buildQuoteDocument(db, 1), 'en');
  assert.equal(html.match(/<tr class="sec"><td colspan="7">Software<\/td><\/tr>/g)?.length, 1);
  assert.equal(html.match(/Subtotal — Software/g)?.length, 1);
  assert.ok(html.indexOf('Software A') < html.indexOf('Software B'));
  assert.ok(html.indexOf('Software B') < html.indexOf('Subtotal — Software'));
  assert.ok(html.indexOf('Subtotal — Software') < html.indexOf('Services'));
});
