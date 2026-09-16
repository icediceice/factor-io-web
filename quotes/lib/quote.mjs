// quotes/lib/quote.mjs — totals engine, settings-driven numbering, snapshots.
//
// Contract boundary: DB rows are snake_case (SQL), the DOCUMENT object that
// this module builds is camelCase — it is the single payload consumed by the
// template renderer, the API responses, the CLI --json output and the
// immutable revision snapshots. Every business fact comes from settings via
// getSettings(db): no rate, format, company fact or currency is literal here.

import { tx, getSettings, audit } from './db.mjs';
import {
  lineSubtotal, vatOf, whtOf, fxToThb, todayBkk, addDaysBkk,
} from './money.mjs';

/** Totals for lines [{qtyMilli, unitSatang, discountSatang}] + settings. */
export function computeTotals(lines, settings) {
  let subtotalSatang = 0;
  let discountSatang = 0;
  for (const line of lines) {
    const sub = lineSubtotal(line.qtyMilli, line.unitSatang);
    const disc = Math.min(Math.max(0, Number(line.discountSatang) || 0), sub);
    subtotalSatang += sub;
    discountSatang += disc;
  }
  const netSatang = subtotalSatang - discountSatang;
  const vatRate = settings['vat.rate_percent'] ?? '0';
  const vatSatang = vatOf(netSatang, vatRate);
  const grandSatang = netSatang + vatSatang;
  const whtRate = settings['wht.rate_percent'] ?? '0';
  const whtSatang = whtOf(netSatang, whtRate);
  const whtMode = (settings['wht.apply'] ?? 'memo') === 'deduct' ? 'deduct' : 'memo';
  const payableSatang = whtMode === 'deduct' ? grandSatang - whtSatang : grandSatang;
  const currency = settings['currency.code'] ?? 'THB';
  const totals = {
    subtotalSatang, discountSatang, netSatang, vatRate, vatSatang,
    grandSatang, whtRate, whtSatang, whtMode, payableSatang, currency,
  };
  const fxRate = settings['fx.rate'] ?? '';
  if (fxRate !== '' && currency !== 'THB') {
    totals.thbPayableSatang = fxToThb(payableSatang, fxRate);
  }
  return totals;
}

/**
 * Allocate the next quote number from settings['quote.number_format'].
 * Tokens: {YYYY} {MM} {DD} {SEQ:n}. The prefix (format minus SEQ) keys a
 * monotonic counter — numbers are never reused, even if a quote is deleted.
 */
export function allocateQuoteNumber(db, settings, nowMs = Date.now()) {
  const fmt = settings['quote.number_format'] ?? 'QT-{YYYY}{MM}-{SEQ:4}';
  const seqMatch = fmt.match(/\{SEQ:(\d+)\}/);
  const seqWidth = seqMatch ? Number(seqMatch[1]) : 4;
  const iso = todayBkk(nowMs);
  const [y, m, d] = iso.split('-');
  const prefix = fmt
    .replace(/\{SEQ:\d+\}/, '')
    .replaceAll('{YYYY}', y)
    .replaceAll('{MM}', m)
    .replaceAll('{DD}', d);
  return tx(db, () => {
    db.prepare('INSERT INTO quote_counters (key, value) VALUES (?, 0) ON CONFLICT(key) DO NOTHING').run(prefix);
    db.prepare('UPDATE quote_counters SET value = value + 1 WHERE key = ?').run(prefix);
    const { value } = db.prepare('SELECT value FROM quote_counters WHERE key = ?').get(prefix);
    return prefix + String(value).padStart(seqWidth, '0');
  });
}

const num = (v) => (v == null ? 0 : Number(v));
const str = (v) => (v == null ? '' : String(v));

/** Full quotation document — camelCase, shared by template/API/CLI/snapshot. */
export function buildQuoteDocument(db, quotationId) {
  const q = db.prepare('SELECT * FROM quotations WHERE id = ?').get(quotationId);
  if (!q) throw new Error(`quotation ${quotationId} not found`);
  const clientRow = db.prepare('SELECT * FROM clients WHERE id = ?').get(q.client_id);
  const lines = db.prepare(
    'SELECT * FROM quotation_lines WHERE quotation_id = ? ORDER BY position, id'
  ).all(quotationId);
  const settings = getSettings(db, '');
  const totals = computeTotals(
    lines.map((l) => ({ qtyMilli: l.qty_milli, unitSatang: l.unit_satang, discountSatang: l.discount_satang })),
    settings,
  );
  const validityDays = Number(settings['quote.validity_days'] ?? '15');
  const issueDate = str(q.issue_date) || todayBkk();
  return {
    quotation: {
      id: q.id,
      number: str(q.number),
      status: str(q.status),
      lang: str(q.lang) || 'en',
      currency: str(q.currency) || 'THB',
      issueDate,
      validUntil: str(q.valid_until) || addDaysBkk(issueDate, validityDays),
      fxBase: str(q.fx_base),
      fxRate: str(q.fx_rate),
      fxAsOf: str(q.fx_as_of),
      notes: str(q.notes),
    },
    client: clientRow ? {
      id: clientRow.id,
      name: str(clientRow.name),
      nameTh: str(clientRow.name_th),
      address: str(clientRow.address),
      addressTh: str(clientRow.address_th),
      taxId: str(clientRow.tax_id),
      contact: str(clientRow.contact),
      email: str(clientRow.email),
      phone: str(clientRow.phone),
    } : null,
    lines: lines.map((l) => ({
      position: l.position,
      kind: str(l.kind),
      descriptionEn: str(l.description_en),
      descriptionTh: str(l.description_th),
      qtyMilli: num(l.qty_milli),
      qty: num(l.qty_milli) / 1000,
      unit: str(l.unit),
      unitSatang: num(l.unit_satang),
      discountSatang: num(l.discount_satang),
      subtotalSatang: lineSubtotal(l.qty_milli, l.unit_satang),
    })),
    totals,
    issuer: {
      name: settings['company.name'] ?? '',
      nameTh: settings['company.name_th'] ?? '',
      address: settings['company.address'] ?? '',
      addressTh: settings['company.address_th'] ?? '',
      taxId: settings['company.tax_id'] ?? '',
      phone: settings['company.phone'] ?? '',
      email: settings['company.email'] ?? '',
      website: settings['company.website'] ?? '',
      logoPath: settings['company.logo_path'] ?? '',
    },
    bank: {
      name: settings['bank.name'] ?? '',
      nameTh: settings['bank.name_th'] ?? '',
      accountName: settings['bank.account_name'] ?? '',
      accountNumber: settings['bank.account_number'] ?? '',
      branch: settings['bank.branch'] ?? '',
      swift: settings['bank.swift'] ?? '',
    },
    terms: {
      paymentEn: settings['quote.payment_terms_en'] ?? '',
      paymentTh: settings['quote.payment_terms_th'] ?? '',
      bodyEn: settings['quote.terms_en'] ?? '',
      bodyTh: settings['quote.terms_th'] ?? '',
    },
    generatedAt: new Date().toISOString(),
  };
}

/** Append an immutable revision snapshot; rev is monotonic per quotation. */
export function saveRevision(db, quotationId, doc, actor) {
  return tx(db, () => {
    const { next } = db.prepare(
      'SELECT COALESCE(MAX(rev), 0) + 1 AS next FROM quotation_revisions WHERE quotation_id = ?'
    ).get(quotationId);
    db.prepare(
      'INSERT INTO quotation_revisions (quotation_id, rev, snapshot_json, actor) VALUES (?, ?, ?, ?)'
    ).run(quotationId, next, JSON.stringify(doc), actor);
    return next;
  });
}

/** Every status the quotations table's CHECK constraint accepts. This list and
 *  the CHECK in db.mjs migration 3 are ONE fact stored twice — change both or
 *  you get a SQLITE_CONSTRAINT at runtime or a silently refused transition. */
export const QUOTATION_STATUSES = [
  'draft', 'issued', 'proposed', 'accepted', 'declined',
  'invoiced', 'paid', 'superseded', 'cancelled',
];

/** Legal moves. The pipeline runs draft -> issued -> proposed -> accepted and
 *  then hands off to the invoice side; 'invoiced' and 'paid' are driven by
 *  lib/invoice.mjs as invoices are raised and settled, never set by hand.
 *
 *  issued -> issued is DELIBERATE and load-bearing: re-issuing is how a fresh
 *  immutable revision snapshot is taken, and tests/quote.test.mjs pins that
 *  calling markStatus(issued) twice yields rev 2. Do not "tidy" it away.
 *
 *  declined -> superseded lets a refused quote be replaced by a revision.
 *  paid, superseded and cancelled are terminal. */
const TRANSITIONS = {
  draft:      ['issued', 'cancelled'],
  issued:     ['issued', 'proposed', 'accepted', 'declined', 'superseded', 'cancelled'],
  proposed:   ['accepted', 'declined', 'superseded', 'cancelled'],
  accepted:   ['invoiced', 'superseded', 'cancelled'],
  invoiced:   ['paid', 'cancelled'],
  paid:       [],
  declined:   ['superseded'],
  superseded: [],
  cancelled:  [],
};

/** Transition status with an audit row; issuing snapshots the document. */
export function markStatus(db, quotationId, status, actor) {
  if (!QUOTATION_STATUSES.includes(status)) throw new Error(`invalid status: ${status}`);
  return tx(db, () => {
    const row = db.prepare('SELECT status FROM quotations WHERE id = ?').get(quotationId);
    if (!row) throw new Error(`quotation ${quotationId} not found`);
    const from = String(row.status);
    const legal = TRANSITIONS[from] ?? [];
    if (!legal.includes(status)) {
      throw new Error(
        `illegal status transition: ${from} -> ${status}`
        + (legal.length ? ` (from ${from}, allowed: ${legal.join(', ')})` : ` (${from} is terminal)`)
      );
    }
    db.prepare("UPDATE quotations SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, quotationId);
    audit(db, actor, 'quotation.status', 'quotation', quotationId, { from, status });
    let rev = null;
    if (status === 'issued') {
      const doc = buildQuoteDocument(db, quotationId);
      rev = saveRevision(db, quotationId, doc, actor);
    }
    return { status, rev };
  });
}