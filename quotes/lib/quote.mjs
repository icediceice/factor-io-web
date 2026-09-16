// quotes/lib/quote.mjs — totals engine, settings-driven numbering, snapshots.
//
// Every business fact comes from the settings table via getSettings(db, ''):
// VAT rate, WHT rate and application mode, currency, FX, number format.
// Nothing here names a rate, a company, or a format literal.

import { tx, getSettings, audit } from './db.mjs';
import {
  lineSubtotal, vatOf, whtOf, fxToThb, todayBkk, addDaysBkk,
} from './money.mjs';

/**
 * Compute document totals from lines [{qtyMilli, unitSatang, discountSatang}]
 * and the settings map. All values are satang integers.
 */
export function computeTotals(lines, settings) {
  let subtotal = 0;
  let discountTotal = 0;
  for (const line of lines) {
    const sub = lineSubtotal(line.qtyMilli, line.unitSatang);
    const discount = Math.min(Math.max(0, line.discountSatang | 0), sub);
    subtotal += sub;
    discountTotal += discount;
  }
  const net = subtotal - discountTotal;
  const vatRate = settings['vat.rate_percent'] ?? '0';
  const vat = vatOf(net, vatRate);
  const grand = net + vat;
  const whtRate = settings['wht.rate_percent'] ?? '0';
  const wht = whtOf(net, whtRate);
  const whtMode = (settings['wht.apply'] ?? 'memo') === 'deduct' ? 'deduct' : 'memo';
  const payable = whtMode === 'deduct' ? grand - wht : grand;
  const currency = settings['currency.code'] ?? 'THB';
  const totals = { subtotal, discountTotal, net, vatRate, vat, grand, whtRate, wht, whtMode, payable, currency };
  if ((settings['fx.rate'] ?? '') !== '' && currency !== 'THB') {
    totals.thb = fxToThb(payable, settings['fx.rate']);
  }
  return totals;
}

/**
 * Allocate the next quote number from settings['quote.number_format'].
 * Supported tokens: {YYYY} {MM} {DD} {SEQ:n}. The prefix (format minus the
 * SEQ token) keys a monotonic counter, so numbers are never reused even if a
 * draft is deleted. Allocation happens in its own transaction.
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

/** Full document: the single payload the template, snapshot and API share. */
export function buildQuoteDocument(db, quotationId) {
  const quotation = db.prepare('SELECT * FROM quotations WHERE id = ?').get(quotationId);
  if (!quotation) throw new Error(`quotation ${quotationId} not found`);
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(quotation.client_id);
  const lines = db.prepare(
    'SELECT * FROM quotation_lines WHERE quotation_id = ? ORDER BY position, id'
  ).all(quotationId);
  const settings = getSettings(db, '');
  const totals = computeTotals(
    lines.map((l) => ({ qtyMilli: l.qty_milli, unitSatang: l.unit_satang, discountSatang: l.discount_satang })),
    settings,
  );
  const validityDays = Number(settings['quote.validity_days'] ?? '15');
  const issueDate = quotation.issue_date || todayBkk();
  return {
    quotation: {
      id: quotation.id,
      number: quotation.number,
      status: quotation.status,
      lang: quotation.lang,
      issue_date: issueDate,
      valid_until: quotation.valid_until || addDaysBkk(issueDate, validityDays),
      currency: quotation.currency,
      fx_base: quotation.fx_base,
      fx_rate: quotation.fx_rate,
      fx_as_of: quotation.fx_as_of,
      notes: quotation.notes,
    },
    client,
    lines: lines.map((l) => ({
      position: l.position,
      kind: l.kind,
      description_en: l.description_en,
      description_th: l.description_th,
      qty: l.qty_milli / 1000,
      unit: l.unit,
      unit_satang: l.unit_satang,
      discount_satang: l.discount_satang,
      subtotal_satang: lineSubtotal(l.qty_milli, l.unit_satang),
    })),
    totals,
    issuer: {
      name: settings['company.name'] ?? '',
      name_th: settings['company.name_th'] ?? '',
      address: settings['company.address'] ?? '',
      address_th: settings['company.address_th'] ?? '',
      tax_id: settings['company.tax_id'] ?? '',
      phone: settings['company.phone'] ?? '',
      email: settings['company.email'] ?? '',
      website: settings['company.website'] ?? '',
      logo_path: settings['company.logo_path'] ?? '',
    },
    bank: {
      name: settings['bank.name'] ?? '',
      name_th: settings['bank.name_th'] ?? '',
      account_name: settings['bank.account_name'] ?? '',
      account_number: settings['bank.account_number'] ?? '',
      branch: settings['bank.branch'] ?? '',
      swift: settings['bank.swift'] ?? '',
    },
    terms: {
      payment_en: settings['quote.payment_terms_en'] ?? '',
      payment_th: settings['quote.payment_terms_th'] ?? '',
      body_en: settings['quote.terms_en'] ?? '',
      body_th: settings['quote.terms_th'] ?? '',
    },
    generated_at: new Date().toISOString(),
  };
}

/** Append an immutable revision snapshot. rev is monotonic per quotation. */
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

/** Set status with an audit row; issued quotes snapshot at the same instant. */
export function markStatus(db, quotationId, status, actor) {
  const allowed = ['draft', 'issued', 'superseded', 'cancelled'];
  if (!allowed.includes(status)) throw new Error(`invalid status: ${status}`);
  return tx(db, () => {
    db.prepare("UPDATE quotations SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, quotationId);
    audit(db, actor, 'quotation.status', 'quotation', quotationId, { status });
    let rev = null;
    if (status === 'issued') {
      const doc = buildQuoteDocument(db, quotationId);
      rev = saveRevision(db, quotationId, doc, actor);
    }
    return { status, rev };
  });
}