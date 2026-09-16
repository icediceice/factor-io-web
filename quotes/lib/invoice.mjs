// quotes/lib/invoice.mjs — tax invoices, payments and received WHT certificates.
//
// An invoice is a FIRST-CLASS entity, not a quotation status. It carries its
// own number series and its own issue_date, which IS the VAT tax point for the
// income this system reports. A quotation status could express neither.
//
// SCOPE, stated so nobody reads a promise into the schema: this bills ONE
// invoice per accepted quotation, for the whole quotation. invoice_lines is a
// snapshot, not an allocation — it records no source quotation_line_id and no
// billed-so-far quantity, and issueInvoice moves the quotation to 'invoiced',
// after which createInvoiceFromQuotation refuses it. Deposit + balance billing
// therefore is NOT supported; adding it means a real allocation model (source
// line ids, remaining-quantity arithmetic, a cap across non-cancelled
// invoices), not a relaxed status check. Relaxing the check alone would let a
// second invoice duplicate the full quotation value in silence.
//
// THE RULE THIS MODULE EXISTS TO ENFORCE: an issued invoice is FROZEN. Its
// vat_rate_percent, wht_rate_percent and every *_satang column are copied out
// of settings exactly once, at issue, and never recomputed. lib/quote.mjs's
// computeTotals reads settings LIVE on every call, which is correct for a
// quotation (a live working document) and catastrophic for a filed figure —
// editing vat.rate_percent would retroactively move a number already written
// onto a PP 30. Reports read these frozen columns, never settings.
//
// Contract boundary matches lib/quote.mjs: DB rows are snake_case, the
// document object is camelCase, and `totals` stays a TOP-LEVEL sibling in the
// envelope because cli.mjs reads r.totals.* flat.

import { tx, getSettings, audit } from './db.mjs';
import { lineSubtotal, vatOf, whtOf, fxToThb, todayBkk, addDaysBkk } from './money.mjs';
import { markStatus } from './quote.mjs';

export const INVOICE_STATUSES = ['draft', 'issued', 'paid', 'cancelled'];

const INVOICE_TRANSITIONS = {
  draft:     ['issued', 'cancelled'],
  issued:    ['paid', 'cancelled'],
  paid:      [],
  cancelled: [],
};

const num = (v) => (v == null ? 0 : Number(v));
const str = (v) => (v == null ? '' : String(v));

/**
 * A stored accounting date must be a REAL calendar day.
 *
 * This guard lives at the accounting boundary rather than in lib/money.mjs
 * because it is the accounting side that cannot tolerate a phantom date: a
 * quotation's valid_until being a day off is cosmetic, while an invoice's
 * issue_date IS the VAT tax point printed on a legal document and the key the
 * PP 30 worksheet groups by.
 *
 * The round-trip is the whole test. A plain regex accepts '2026-02-31', which
 * then rots in three directions at once: the PDF prints "31 February 2026",
 * addDaysBkk() feeds it to Date.UTC() which silently rolls it forward so the
 * due date is computed off a day that never existed, and pp30Monthly groups it
 * into 2026-02 by string prefix. Comparing the parts back out of the Date is
 * what catches the roll-over.
 */
export function assertAccountingDate(value, field) {
  const s = str(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`${field} must be a YYYY-MM-DD date, got '${s}'`);
  }
  const [y, m, d] = s.split('-').map(Number);
  if (y < 1900 || y > 2999) throw new Error(`${field} year ${y} is out of range`);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error(`${field} '${s}' is not a real calendar date`);
  }
  return s;
}

/** Blank means "today in Bangkok"; anything else must be a real date. */
const accountingDate = (value, field) => (str(value) ? assertAccountingDate(value, field) : todayBkk());

/**
 * Totals from snapshotted lines + EXPLICIT rates.
 *
 * Deliberately does NOT take a settings object: the caller must have already
 * decided which rates apply and be able to persist them alongside the result.
 * That signature is the guard rail — it makes "recompute from live settings"
 * something you have to do on purpose rather than by accident.
 */
export function computeInvoiceTotals(lines, { vatRate, whtRate, whtMode, currency, fxRate }) {
  let subtotalSatang = 0;
  let discountSatang = 0;
  for (const line of lines) {
    const sub = lineSubtotal(line.qtyMilli, line.unitSatang);
    const disc = Math.min(Math.max(0, Number(line.discountSatang) || 0), sub);
    subtotalSatang += sub;
    discountSatang += disc;
  }
  const netSatang = subtotalSatang - discountSatang;
  const vatSatang = vatOf(netSatang, vatRate ?? '0');
  const grandSatang = netSatang + vatSatang;
  // WHT is withheld on the NET (pre-VAT) base: 10,000 + 7% VAT = 10,700, less
  // 3% of 10,000 = 300, so the customer transfers 10,400.
  const whtSatang = whtOf(netSatang, whtRate ?? '0');
  const mode = whtMode === 'deduct' ? 'deduct' : 'memo';
  const payableSatang = mode === 'deduct' ? grandSatang - whtSatang : grandSatang;
  const totals = {
    subtotalSatang, discountSatang, netSatang,
    vatRate: str(vatRate ?? '0'), vatSatang,
    grandSatang,
    whtRate: str(whtRate ?? '0'), whtSatang, whtMode: mode,
    payableSatang,
    currency: currency ?? 'THB',
  };
  if (fxRate && currency && currency !== 'THB') {
    totals.thbPayableSatang = fxToThb(payableSatang, fxRate);
  }
  return totals;
}

/**
 * Allocate the next invoice number from settings['invoice.number_format'].
 * Same tokens and the same monotonic, reuse-proof counter table as quotations
 * — the prefix keys the row, so INV- and QT- series never collide.
 */
export function allocateInvoiceNumber(db, settings, nowMs = Date.now()) {
  const fmt = settings['invoice.number_format'] ?? 'INV-{YYYY}{MM}-{SEQ:4}';
  const seqMatch = fmt.match(/\{SEQ:(\d+)\}/);
  const seqWidth = seqMatch ? Number(seqMatch[1]) : 4;
  const [y, m, d] = todayBkk(nowMs).split('-');
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

/**
 * Raise a DRAFT invoice from an accepted quotation, snapshotting its lines.
 *
 * The snapshot is the point: editing the quotation afterwards must not move a
 * figure on an invoice. Totals stored here are PROVISIONAL — issueInvoice()
 * recomputes and freezes them, because the tax point is the issue date and the
 * rate that applies is the rate on that date, not on the date of drafting.
 */
export function createInvoiceFromQuotation(db, quotationId, { actor = 'agent', lang, issueDate, notes = '' } = {}) {
  return tx(db, () => {
    const q = db.prepare('SELECT * FROM quotations WHERE id = ?').get(quotationId);
    if (!q) throw new Error(`quotation ${quotationId} not found`);
    if (q.status !== 'accepted') {
      throw new Error(`quotation ${q.number} is '${q.status}' — only an accepted quotation can be invoiced`);
    }
    const srcLines = db.prepare(
      'SELECT * FROM quotation_lines WHERE quotation_id = ? ORDER BY position, id'
    ).all(quotationId);
    if (srcLines.length === 0) throw new Error(`quotation ${q.number} has no lines to invoice`);

    const settings = getSettings(db, '');
    const number = allocateInvoiceNumber(db, settings);
    const issue = accountingDate(issueDate, 'issue_date');
    const termsDays = Number(settings['invoice.payment_terms_days'] ?? '30');
    const totals = computeInvoiceTotals(
      srcLines.map((l) => ({ qtyMilli: l.qty_milli, unitSatang: l.unit_satang, discountSatang: l.discount_satang })),
      {
        vatRate: settings['vat.rate_percent'] ?? '0',
        whtRate: settings['wht.rate_percent'] ?? '0',
        whtMode: settings['wht.apply'] ?? 'memo',
        currency: q.currency || 'THB',
        fxRate: q.fx_rate,
      },
    );

    const info = db.prepare(`
      INSERT INTO invoices (
        number, quotation_id, client_id, status, lang, currency,
        issue_date, due_date, branch_code,
        vat_rate_percent, wht_rate_percent, wht_mode,
        subtotal_satang, discount_satang, net_satang, vat_satang,
        grand_satang, wht_satang, payable_satang,
        fx_base, fx_rate, fx_as_of, notes, created_by
      ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      number, quotationId, q.client_id, str(lang) || q.lang || 'en', q.currency || 'THB',
      issue, addDaysBkk(issue, termsDays), settings['tax.branch_code'] ?? '00000',
      totals.vatRate, totals.whtRate, totals.whtMode,
      totals.subtotalSatang, totals.discountSatang, totals.netSatang, totals.vatSatang,
      totals.grandSatang, totals.whtSatang, totals.payableSatang,
      str(q.fx_base), str(q.fx_rate), str(q.fx_as_of), str(notes), actor,
    );
    const invoiceId = Number(info.lastInsertRowid);

    const insLine = db.prepare(`
      INSERT INTO invoice_lines (
        invoice_id, position, kind, description_en, description_th,
        qty_milli, unit, unit_satang, discount_satang
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // Positions are renumbered 1..n rather than copied: the source quotation
    // may have gaps after line edits, and this is a customer-facing legal
    // document where the first line must read 1, not 0 and not 7.
    for (const [i, l] of srcLines.entries()) {
      insLine.run(invoiceId, i + 1, l.kind, l.description_en, l.description_th,
        l.qty_milli, l.unit, l.unit_satang, l.discount_satang);
    }

    audit(db, actor, 'invoice.create', 'invoice', invoiceId, { number, quotationId, lines: srcLines.length });
    return { id: invoiceId, number, status: 'draft', totals };
  });
}

/**
 * Issue the invoice: stamp the tax point and FREEZE the tax figures.
 *
 * This is the only place rates are read from settings for an invoice, and
 * after it runs nothing recomputes them. Everything downstream — PP 30, the
 * income report, the PDF — reads the stored columns.
 */
export function issueInvoice(db, invoiceId, { actor = 'agent', issueDate } = {}) {
  return tx(db, () => {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    if (!inv) throw new Error(`invoice ${invoiceId} not found`);
    if (inv.status !== 'draft') {
      throw new Error(`invoice ${inv.number} is already '${inv.status}' — an issued invoice is frozen; cancel it and raise a new one`);
    }
    const lines = db.prepare(
      'SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY position, id'
    ).all(invoiceId);
    if (lines.length === 0) throw new Error(`invoice ${inv.number} has no lines`);

    const settings = getSettings(db, '');
    // Re-stamping the tax point at issue is legitimate (the draft may be days
    // old); it is still a date that gets printed and filed, so it is checked.
    const issue = str(issueDate)
      ? assertAccountingDate(issueDate, 'issue_date')
      : (str(inv.issue_date) || todayBkk());
    const termsDays = Number(settings['invoice.payment_terms_days'] ?? '30');
    const totals = computeInvoiceTotals(
      lines.map((l) => ({ qtyMilli: l.qty_milli, unitSatang: l.unit_satang, discountSatang: l.discount_satang })),
      {
        vatRate: settings['vat.rate_percent'] ?? '0',
        whtRate: settings['wht.rate_percent'] ?? '0',
        whtMode: settings['wht.apply'] ?? 'memo',
        currency: inv.currency || 'THB',
        fxRate: inv.fx_rate,
      },
    );

    db.prepare(`
      UPDATE invoices SET
        status = 'issued', issue_date = ?, due_date = ?, branch_code = ?,
        vat_rate_percent = ?, wht_rate_percent = ?, wht_mode = ?,
        subtotal_satang = ?, discount_satang = ?, net_satang = ?, vat_satang = ?,
        grand_satang = ?, wht_satang = ?, payable_satang = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      issue, addDaysBkk(issue, termsDays), settings['tax.branch_code'] ?? '00000',
      totals.vatRate, totals.whtRate, totals.whtMode,
      totals.subtotalSatang, totals.discountSatang, totals.netSatang, totals.vatSatang,
      totals.grandSatang, totals.whtSatang, totals.payableSatang,
      invoiceId,
    );

    // The quotation follows its invoice into the billed state.
    if (inv.quotation_id) {
      const q = db.prepare('SELECT status FROM quotations WHERE id = ?').get(inv.quotation_id);
      if (q && q.status === 'accepted') markStatus(db, inv.quotation_id, 'invoiced', actor);
    }
    audit(db, actor, 'invoice.issue', 'invoice', invoiceId, { number: inv.number, issueDate: issue, taxPoint: issue });
    return { id: invoiceId, number: str(inv.number), status: 'issued', issueDate: issue, totals };
  });
}

/** Transition an invoice with an audit row, guarding illegal moves. */
export function markInvoiceStatus(db, invoiceId, status, actor = 'agent') {
  if (!INVOICE_STATUSES.includes(status)) throw new Error(`invalid invoice status: ${status}`);
  return tx(db, () => {
    const inv = db.prepare('SELECT status, number FROM invoices WHERE id = ?').get(invoiceId);
    if (!inv) throw new Error(`invoice ${invoiceId} not found`);
    const from = str(inv.status);
    const legal = INVOICE_TRANSITIONS[from] ?? [];
    if (!legal.includes(status)) {
      throw new Error(`illegal invoice transition: ${from} -> ${status}`
        + (legal.length ? ` (allowed: ${legal.join(', ')})` : ` (${from} is terminal)`));
    }
    db.prepare("UPDATE invoices SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, invoiceId);
    audit(db, actor, 'invoice.status', 'invoice', invoiceId, { from, status });
    return { status };
  });
}

/**
 * What is still outstanding on an invoice.
 *
 * NON-OBVIOUS AND LOAD-BEARING: an invoice is settled by cash AND by tax
 * withheld at source. When wht.apply is 'memo' we invoice the full VAT-
 * inclusive amount, but the customer lawfully transfers less and hands over a
 * withholding certificate for the difference. Counting only bank payments
 * would leave every such invoice permanently short by the WHT amount and it
 * would never reach 'paid'. A certificate is tax already paid on our behalf,
 * so it settles the invoice exactly as cash does.
 */
export function invoiceBalance(db, invoiceId) {
  const inv = db.prepare('SELECT payable_satang, wht_mode FROM invoices WHERE id = ?').get(invoiceId);
  if (!inv) throw new Error(`invoice ${invoiceId} not found`);
  const { paid = 0 } = db.prepare(
    'SELECT COALESCE(SUM(amount_satang), 0) AS paid FROM payments WHERE invoice_id = ?'
  ).get(invoiceId);
  const { withheld = 0 } = db.prepare(
    'SELECT COALESCE(SUM(wht_satang), 0) AS withheld FROM wht_certificates WHERE invoice_id = ?'
  ).get(invoiceId);
  const payableSatang = num(inv.payable_satang);
  const paidSatang = num(paid);
  const withheldSatang = num(withheld);

  // Whether a withholding certificate SETTLES anything depends entirely on the
  // mode the invoice was frozen with, and getting this wrong under-reports
  // receivables in silence:
  //   memo   — payable is the FULL grand total. The customer lawfully transfers
  //            grand - wht and hands over the certificate for the difference,
  //            so the certificate is what closes the gap. Count it.
  //   deduct — payable ALREADY equals grand - wht. The withholding was removed
  //            from the invoice face, so counting the certificate again pays
  //            the same 3% twice and can flip an invoice to 'paid' while real
  //            cash is still outstanding. Do NOT count it.
  // withheldSatang stays reported in both modes: it is a genuine PND credit,
  // and reports.whtRegister reads wht_certificates directly regardless.
  const creditsSettlement = str(inv.wht_mode) !== 'deduct';
  const settledSatang = paidSatang + (creditsSettlement ? withheldSatang : 0);

  return {
    payableSatang,
    paidSatang,
    withheldSatang,
    whtMode: str(inv.wht_mode),
    settledSatang,
    outstandingSatang: Math.max(0, payableSatang - settledSatang),
    settled: settledSatang >= payableSatang,
  };
}

/** Record a bank payment against an issued invoice. */
export function recordPayment(db, invoiceId, { paidOn, amountSatang, method = 'transfer', reference = '', note = '', actor = 'agent' }) {
  return tx(db, () => {
    const inv = db.prepare('SELECT status, number FROM invoices WHERE id = ?').get(invoiceId);
    if (!inv) throw new Error(`invoice ${invoiceId} not found`);
    if (inv.status === 'draft') throw new Error(`invoice ${inv.number} is still a draft — issue it before recording payment`);
    if (inv.status === 'cancelled') throw new Error(`invoice ${inv.number} is cancelled`);
    const amount = Number(amountSatang);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(`invalid payment amount: ${amountSatang}`);

    const before = invoiceBalance(db, invoiceId);
    if (amount > before.outstandingSatang) {
      throw new Error(
        `payment of ${amount} satang exceeds the ${before.outstandingSatang} satang outstanding on ${inv.number} `
        + `(payable ${before.payableSatang}, already settled ${before.settledSatang})`
      );
    }
    const info = db.prepare(`
      INSERT INTO payments (invoice_id, paid_on, amount_satang, method, reference, note, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(invoiceId, accountingDate(paidOn, 'paid_on'), amount, str(method) || 'transfer', str(reference), str(note), actor);

    const after = invoiceBalance(db, invoiceId);
    if (after.settled && inv.status === 'issued') markInvoiceStatus(db, invoiceId, 'paid', actor);
    audit(db, actor, 'payment.record', 'invoice', invoiceId, { amountSatang: amount, outstanding: after.outstandingSatang });
    return { id: Number(info.lastInsertRowid), balance: after };
  });
}

/**
 * Record a withholding-tax certificate RECEIVED from a customer.
 *
 * This is tax already remitted to the Revenue Department on our behalf — an
 * asset, credited against PND 50/51, never a liability. base_satang is the NET
 * (pre-VAT) amount the customer withheld on.
 */
export function recordWhtCertificate(db, { invoiceId = null, paymentId = null, certNumber = '', issuedOn, pndForm = 'PND53', baseSatang, whtSatang, ratePercent = '', payerName = '', payerTaxId = '', filePath = '', note = '', actor = 'agent' }) {
  return tx(db, () => {
    const base = Number(baseSatang);
    const wht = Number(whtSatang);
    if (!Number.isSafeInteger(base) || base < 0) throw new Error(`invalid WHT base: ${baseSatang}`);
    if (!Number.isSafeInteger(wht) || wht < 0) throw new Error(`invalid WHT amount: ${whtSatang}`);
    if (wht > base) throw new Error(`WHT ${wht} exceeds its base ${base} — the base is the NET, pre-VAT amount`);

    if (invoiceId != null) {
      const inv = db.prepare(
        'SELECT status, number, net_satang, wht_satang FROM invoices WHERE id = ?'
      ).get(invoiceId);
      if (!inv) throw new Error(`invoice ${invoiceId} not found`);
      if (inv.status === 'draft') throw new Error(`invoice ${inv.number} is still a draft`);
      if (inv.status === 'cancelled') throw new Error(`invoice ${inv.number} is cancelled`);
      if (paymentId != null) {
        const pay = db.prepare('SELECT invoice_id FROM payments WHERE id = ?').get(paymentId);
        if (!pay) throw new Error(`payment ${paymentId} not found`);
        if (Number(pay.invoice_id) !== Number(invoiceId)) {
          throw new Error(`payment ${paymentId} belongs to another invoice`);
        }
      }

      // AN INVOICE-BOUND CERTIFICATE CANNOT EXCEED WHAT THE INVOICE SUPPORTS.
      // Per-row validation alone (wht <= base) lets the SAME certificate be
      // entered twice — an API retry, a double form submit, one entry from the
      // CLI and one from the UI. Nothing downstream can tell the copies apart:
      // reports.whtRegister sums these rows straight into the PND credit, so a
      // duplicated 300.00 certificate claims 600.00 of tax paid on our behalf
      // that no issued invoice backs. In memo mode invoiceBalance also counts
      // certificates as settlement, so the same duplicate quietly shrinks the
      // outstanding balance and can close an invoice with real cash still owed.
      //
      // The caps are the invoice's own FROZEN figures, so they cannot drift
      // when settings change. Several PARTIAL certificates remain legal — they
      // are summed, and only the total is capped. A certificate withheld on the
      // VAT-inclusive amount by mistake (3% of grand, not of net) exceeds the
      // cap and is refused on purpose: that is the customer's error to fix, and
      // silently crediting it would overstate the PND claim.
      const sums = db.prepare(`
        SELECT COALESCE(SUM(base_satang), 0) AS base_so_far,
               COALESCE(SUM(wht_satang), 0)  AS wht_so_far
        FROM wht_certificates WHERE invoice_id = ?
      `).get(invoiceId);
      const baseSoFar = num(sums.base_so_far);
      const whtSoFar = num(sums.wht_so_far);
      const baseCap = num(inv.net_satang);
      const whtCap = num(inv.wht_satang);
      if (baseSoFar + base > baseCap) {
        throw new Error(
          `WHT base ${base} satang exceeds the ${Math.max(0, baseCap - baseSoFar)} satang remaining on ${inv.number} `
          + `(invoice net ${baseCap}, already certified ${baseSoFar})`
        );
      }
      if (whtSoFar + wht > whtCap) {
        throw new Error(
          `WHT ${wht} satang exceeds the ${Math.max(0, whtCap - whtSoFar)} satang remaining on ${inv.number} `
          + `(invoice withholding ${whtCap}, already certified ${whtSoFar})`
        );
      }
    }

    const info = db.prepare(`
      INSERT INTO wht_certificates (
        invoice_id, payment_id, cert_number, issued_on, pnd_form,
        base_satang, wht_satang, rate_percent, payer_name, payer_tax_id,
        file_path, note, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(invoiceId, paymentId, str(certNumber), accountingDate(issuedOn, 'issued_on'), str(pndForm) || 'PND53',
      base, wht, str(ratePercent), str(payerName), str(payerTaxId), str(filePath), str(note), actor);

    let balance = null;
    if (invoiceId != null) {
      balance = invoiceBalance(db, invoiceId);
      const inv = db.prepare('SELECT status FROM invoices WHERE id = ?').get(invoiceId);
      if (balance.settled && inv.status === 'issued') markInvoiceStatus(db, invoiceId, 'paid', actor);
    }
    audit(db, actor, 'wht.record', 'invoice', invoiceId ?? '', { whtSatang: wht, baseSatang: base, pndForm });
    return { id: Number(info.lastInsertRowid), balance };
  });
}

/** Full invoice document — camelCase, shared by template/API/CLI. */
export function buildInvoiceDocument(db, invoiceId) {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!inv) throw new Error(`invoice ${invoiceId} not found`);
  const clientRow = db.prepare('SELECT * FROM clients WHERE id = ?').get(inv.client_id);
  const lines = db.prepare(
    'SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY position, id'
  ).all(invoiceId);
  const settings = getSettings(db, '');
  const quotation = inv.quotation_id
    ? db.prepare('SELECT number FROM quotations WHERE id = ?').get(inv.quotation_id)
    : null;

  // Totals are READ, never recomputed — these are the frozen filed figures.
  const totals = {
    subtotalSatang: num(inv.subtotal_satang),
    discountSatang: num(inv.discount_satang),
    netSatang: num(inv.net_satang),
    vatRate: str(inv.vat_rate_percent),
    vatSatang: num(inv.vat_satang),
    grandSatang: num(inv.grand_satang),
    whtRate: str(inv.wht_rate_percent),
    whtSatang: num(inv.wht_satang),
    whtMode: str(inv.wht_mode),
    payableSatang: num(inv.payable_satang),
    currency: str(inv.currency) || 'THB',
  };
  if (inv.fx_rate && totals.currency !== 'THB') {
    totals.thbPayableSatang = fxToThb(totals.payableSatang, inv.fx_rate);
  }

  return {
    invoice: {
      id: inv.id,
      number: str(inv.number),
      status: str(inv.status),
      lang: str(inv.lang) || 'en',
      currency: totals.currency,
      issueDate: str(inv.issue_date),
      dueDate: str(inv.due_date),
      branchCode: str(inv.branch_code),
      quotationId: inv.quotation_id ?? null,
      quotationNumber: quotation ? str(quotation.number) : '',
      fxBase: str(inv.fx_base),
      fxRate: str(inv.fx_rate),
      fxAsOf: str(inv.fx_as_of),
      notes: str(inv.notes),
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
    balance: invoiceBalance(db, invoiceId),
    payments: db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_on, id').all(invoiceId).map((p) => ({
      id: p.id,
      paidOn: str(p.paid_on),
      amountSatang: num(p.amount_satang),
      method: str(p.method),
      reference: str(p.reference),
      note: str(p.note),
    })),
    whtCertificates: db.prepare('SELECT * FROM wht_certificates WHERE invoice_id = ? ORDER BY issued_on, id').all(invoiceId).map((w) => ({
      id: w.id,
      certNumber: str(w.cert_number),
      issuedOn: str(w.issued_on),
      pndForm: str(w.pnd_form),
      baseSatang: num(w.base_satang),
      whtSatang: num(w.wht_satang),
      ratePercent: str(w.rate_percent),
      payerName: str(w.payer_name),
      payerTaxId: str(w.payer_tax_id),
    })),
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
      branchEn: settings['company.branch_en'] ?? 'Head Office',
      branchTh: settings['company.branch_th'] ?? '',
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
      bodyEn: settings['invoice.terms_en'] ?? '',
      bodyTh: settings['invoice.terms_th'] ?? '',
      paymentEn: settings['quote.payment_terms_en'] ?? '',
      paymentTh: settings['quote.payment_terms_th'] ?? '',
    },
    generatedAt: new Date().toISOString(),
  };
}