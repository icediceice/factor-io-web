// quotes/api.mjs — the REST surface as a pure router.
//
// createApi(db) -> route(req) where req = {method, path, query, body, actor}
// and the reply is {status, headers, body}. No node:http here: server.mjs
// adapts the socket side, tests call the router directly. `actor` is the
// authenticated identity ('agent' or an email) and is stamped on every
// mutation's audit row.
//
// Money/qty cross the API boundary as strings or integers — parseSatang /
// parseMilli reject JS floats by design.

import { openDb, tx, getSettings, setSetting, audit } from './lib/db.mjs';
import { parseSatang, parseMilli, milliToDecimal, satangToDecimal } from './lib/money.mjs';
import {
  computeTotals, allocateQuoteNumber, buildQuoteDocument,
  saveRevision, markStatus, editRefusal,
} from './lib/quote.mjs';
import {
  createInvoiceFromQuotation, issueInvoice, markInvoiceStatus,
  recordPayment, recordWhtCertificate, invoiceBalance, buildInvoiceDocument,
} from './lib/invoice.mjs';
import {
  pp30Monthly, incomeByMonth, whtRegister, pndSummary, pipelineSummary,
} from './lib/reports.mjs';
import { parseKinds, isValidKind, kindCodes, normalisePeriod } from './lib/kinds.mjs';
import { createHash } from 'node:crypto';
import { validateSow, parseTemplates, sowFromTemplate } from './lib/sow.mjs';
import { canonicalDocDigest } from './lib/quote.mjs';

/**
 * Validate a line/catalog `kind` against the operator-configured vocabulary.
 *
 * This replaced three hardcoded service|hardware checks. One of them (catalog
 * PUT) did not reject an unknown kind at all — it silently coerced anything
 * unrecognised to 'service', quietly rewriting the operator's data. Rejecting
 * is the whole point, so there is no coercing path here.
 */
const kindOf = (db, body, { required = true, fallback = null } = {}) => {
  const raw = body?.kind;
  if (raw == null || raw === '') {
    if (required && fallback == null) throw bad(`kind is required — one of: ${kindCodes(getSettings(db, 'line.')).join(', ')}`);
    return fallback;
  }
  const settings = getSettings(db, 'line.');
  const code = String(raw).trim();
  if (!isValidKind(settings, code)) {
    throw bad(`kind '${code}' is not in the configured vocabulary — one of: ${kindCodes(settings).join(', ')}. Add it by editing the line.kinds setting.`);
  }
  return code;
};

/**
 * The unit to use when the caller did not name one.
 *
 * Was `kind === 'service' ? 'day' : 'unit'`, which cannot survive an open
 * vocabulary — 'software' and 'training' are neither. A recurring line is
 * billed per period, so the period names the unit; otherwise effort-shaped
 * work is quoted in days and everything else in units. The operator can always
 * override by sending `unit` explicitly; this only fills a blank.
 */
const EFFORT_KINDS = new Set(['service', 'support', 'training']);
function defaultUnitFor(kind, billingPeriod) {
  if (billingPeriod === 'monthly') return 'month';
  if (billingPeriod === 'quarterly') return 'quarter';
  if (billingPeriod === 'yearly') return 'year';
  return EFFORT_KINDS.has(kind) ? 'day' : 'unit';
}

/** Validate an optional billing_period, defaulting to 'once'. */
const periodOf = (body, fallback = 'once') => {
  if (body?.billing_period == null || body.billing_period === '') return fallback;
  const p = normalisePeriod(body.billing_period);
  if (p == null) throw bad("billing_period must be one of: once, monthly, quarterly, yearly");
  return p;
};

const json = (status, body, headers = {}) => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  body: JSON.stringify(body, null, 2) + '\n',
});

const err = (status, message) => json(status, { error: message });

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new ApiError(400, msg);
const missing = (what) => new ApiError(404, `${what} not found`);

/** API envelope for a quotation document: header, client, lines and totals
 *  are siblings so `quotation.id`, `totals.grandSatang` read flat. */
const docEnvelope = (doc, extra = {}) => ({
  quotation: doc.quotation,
  client: doc.client,
  lines: doc.lines,
  sow: doc.sow,
  totals: doc.totals,
  issuer: doc.issuer,
  bank: doc.bank,
  terms: doc.terms,
  kindLabels: doc.kindLabels,
  ...extra,
});

const needStr = (body, key, { max = 2000 } = {}) => {
  const v = body?.[key];
  if (typeof v !== 'string' || !v.trim()) throw bad(`${key} is required`);
  if (v.length > max) throw bad(`${key} exceeds ${max} chars`);
  return v.trim();
};
const optStr = (body, key, { max = 5000 } = {}) => {
  const v = body?.[key];
  if (v == null) return '';
  if (typeof v !== 'string') throw bad(`${key} must be a string`);
  if (v.length > max) throw bad(`${key} exceeds ${max} chars`);
  return v.trim();
};

/** unit price: accept exact satang int OR major decimal string; never floats */
function unitSatangOf(body) {
  const { unit_satang, unit_price } = body ?? {};
  if (unit_satang != null && unit_price != null) throw bad('send unit_satang or unit_price, not both');
  if (unit_satang != null) {
    const n = Number(unit_satang);
    if (!Number.isSafeInteger(n) || n < 0) throw bad('unit_satang must be a non-negative integer (satang)');
    return n;
  }
  if (unit_price != null) return parseSatang(unit_price); // throws on floats/junk
  throw bad('unit price required: unit_satang (integer satang) or unit_price (decimal string)');
}

function qtyMilliOf(body) {
  const { qty_milli, qty } = body ?? {};
  if (qty_milli != null && qty != null) throw bad('send qty_milli or qty, not both');
  if (qty_milli != null) {
    const n = Number(qty_milli);
    if (!Number.isSafeInteger(n) || n <= 0) throw bad('qty_milli must be a positive integer');
    return n;
  }
  if (qty != null) return parseMilli(qty);
  throw bad('quantity required: qty_milli (integer) or qty (decimal string)');
}

const quoteDigest = (doc) => createHash('sha256').update(canonicalDocDigest(doc)).digest('hex');
const hasOnly = (obj, allowed, path, errors) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { errors.push({ path, message: 'must be an object' }); return false; }
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) errors.push({ path: path ? `${path}.${k}` : k, message: 'field is not supported' });
  return true;
};
const DRAFT_KEYS = ['schema', 'version', 'quotation_id', 'base_digest', 'header', 'sow', 'lines'];
const HEADER_KEYS = ['lang', 'currency', 'issue_date', 'notes', 'term_months'];
const LINE_KEYS = ['kind', 'description_en', 'description_th', 'qty', 'unit', 'unit_price', 'discount_satang', 'billing_period', 'section', 'optional'];
function checkedLines(db, value, errors) {
  if (!Array.isArray(value) || value.length > 100) { errors.push({ path: 'lines', message: 'must be an array of at most 100 lines' }); return []; }
  return value.map((line, i) => {
    const path = `lines[${i}]`;
    if (!hasOnly(line, LINE_KEYS, path, errors)) return null;
    const out = {};
    const check = (key, fn) => { try { out[key] = fn(); } catch (e) { errors.push({ path: `${path}.${key}`, message: e.message }); } };
    check('kind', () => kindOf(db, line));
    check('billing_period', () => periodOf(line));
    check('description_en', () => needStr(line, 'description_en', { max: 1000 }));
    check('description_th', () => optStr(line, 'description_th', { max: 1000 }));
    check('qty_milli', () => parseMilli(line.qty));
    check('unit_satang', () => {
      if (line.unit_price == null) throw new Error('explicit unit_price is required before import');
      return parseSatang(line.unit_price);
    });
    check('unit', () => optStr(line, 'unit', { max: 30 }));
    check('section', () => optStr(line, 'section', { max: 100 }));
    check('discount_satang', () => {
      const n = Number(line.discount_satang ?? 0);
      if (!Number.isSafeInteger(n) || n < 0) throw new Error('must be a non-negative integer');
      return n;
    });
    check('optional', () => {
      if (line.optional != null && typeof line.optional !== 'boolean') throw new Error('must be a boolean');
      return line.optional ? 1 : 0;
    });
    return out;
  });
}
function insertCheckedLines(db, id, lines) {
  const stmt = db.prepare(`INSERT INTO quotation_lines
    (quotation_id, position, kind, description_en, description_th, qty_milli, unit, unit_satang, discount_satang, billing_period, section, optional)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  lines.forEach((line, i) => stmt.run(id, i + 1, line.kind, line.description_en, line.description_th,
    line.qty_milli, line.unit || defaultUnitFor(line.kind, line.billing_period), line.unit_satang,
    line.discount_satang, line.billing_period, line.section, line.optional));
}

export function createApi(db) {
  async function route(req) {
    try {
      return await dispatch(req);
    } catch (e) {
      if (e instanceof ApiError) return err(e.status, e.message);
      if (/invalid money|invalid quantity|invalid rate|invalid fx|invalid status/.test(e.message)) {
        return err(400, e.message);
      }
      return err(500, `internal error: ${e.message}`);
    }
  }

  async function dispatch(req) {
    const { method, path, query = {}, body = {}, actor = 'anonymous' } = req;
    const seg = path.split('/').filter(Boolean); // e.g. ['quotations','42','lines']

    if (method === 'GET' && path === '/healthz') return json(200, { ok: true });

    // ---------- settings ----------
    if (path === '/settings') {
      if (method === 'GET') return json(200, { settings: getSettings(db, '') });
      if (method === 'PUT') {
        const entries = body.settings ?? { [needStr(body, 'key')]: needStr(body, 'value', { max: 100000 }) };
        if (typeof entries !== 'object' || Array.isArray(entries)) throw bad('settings must be an object');
        const applied = tx(db, () => {
          for (const [k, v] of Object.entries(entries)) {
            if (typeof v !== 'string' && typeof v !== 'number') throw bad(`setting ${k} must be a string`);
            if (k === 'sow.templates') {
              try { parseTemplates(String(v)); } catch (e) { throw bad(e.message); }
            }
            setSetting(db, k, String(v), actor);
          }
          audit(db, actor, 'settings.update', 'settings', '', Object.keys(entries));
          return Object.keys(entries).length;
        });
        return json(200, { ok: true, updated: applied });
      }
    }

    if (path === '/sow-templates') {
      if (method === 'GET') return json(200, { templates: parseTemplates(getSettings(db, '')['sow.templates']) });
      if (method === 'PUT') {
        let templates;
        try { templates = parseTemplates(JSON.stringify(body.templates)); } catch (e) { throw bad(e.message); }
        tx(db, () => {
          setSetting(db, 'sow.templates', JSON.stringify(templates), actor);
          audit(db, actor, 'sow.templates.update', 'settings', 'sow.templates', { count: templates.length });
        });
        return json(200, { templates });
      }
    }

    // ---------- clients ----------
    if (path === '/clients') {
      if (method === 'GET') {
        return json(200, { clients: db.prepare('SELECT * FROM clients ORDER BY name').all() });
      }
      if (method === 'POST') {
        const name = needStr(body, 'name', { max: 300 });
        const row = tx(db, () => {
          const { lastInsertRowid: id } = db.prepare(
            `INSERT INTO clients (name, name_th, address, address_th, tax_id, contact, email, phone)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(name, optStr(body, 'name_th'), optStr(body, 'address'), optStr(body, 'address_th'),
            optStr(body, 'tax_id', { max: 50 }), optStr(body, 'contact'), optStr(body, 'email', { max: 300 }), optStr(body, 'phone', { max: 50 }));
          audit(db, actor, 'client.create', 'client', id, { name });
          return db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
        });
        return json(201, { client: row });
      }
    }
    if (seg[0] === 'clients' && seg[1]) {
      const id = Number(seg[1]);
      if (!Number.isInteger(id)) throw bad('bad client id');
      const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
      if (!row) throw missing('client');
      if (method === 'GET') return json(200, { client: row });
      if (method === 'PUT') {
        const next = { ...row, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v != null)) };
        tx(db, () => {
          db.prepare(
            `UPDATE clients SET name=?, name_th=?, address=?, address_th=?, tax_id=?, contact=?, email=?, phone=?,
             updated_at=datetime('now') WHERE id=?`
          ).run(String(next.name), String(next.name_th ?? ''), String(next.address ?? ''), String(next.address_th ?? ''),
            String(next.tax_id ?? ''), String(next.contact ?? ''), String(next.email ?? ''), String(next.phone ?? ''), id);
          audit(db, actor, 'client.update', 'client', id, { fields: Object.keys(body) });
        });
        return json(200, { client: db.prepare('SELECT * FROM clients WHERE id = ?').get(id) });
      }
      if (method === 'DELETE') {
        const used = db.prepare('SELECT COUNT(*) c FROM quotations WHERE client_id = ?').get(id).c;
        if (used) throw bad(`client has ${used} quotation(s); remove them first`);
        tx(db, () => {
          db.prepare('DELETE FROM clients WHERE id = ?').run(id);
          audit(db, actor, 'client.delete', 'client', id, { name: row.name });
        });
        return json(200, { ok: true });
      }
    }

    // ---------- line kinds (the configurable vocabulary) ----------
    // Read-only projection of the line.kinds setting, so the browser selects
    // and any external caller build their options from the same source the
    // server validates against, instead of shipping their own copy.
    if (path === '/line-kinds' && method === 'GET') {
      const settings = getSettings(db, '');
      return json(200, {
        kinds: parseKinds(settings),
        billing_periods: [
          { code: 'once', en: 'One-time', th: 'ครั้งเดียว' },
          { code: 'monthly', en: 'Monthly', th: 'รายเดือน' },
          { code: 'quarterly', en: 'Quarterly', th: 'รายไตรมาส' },
          { code: 'yearly', en: 'Yearly', th: 'รายปี' },
        ],
      });
    }

    // ---------- catalog ----------
    if (path === '/catalog') {
      if (method === 'GET') {
        const only = query.active === '1' || query.active === 'true';
        const items = only
          ? db.prepare('SELECT * FROM catalog_items WHERE active = 1 ORDER BY kind, name_en').all()
          : db.prepare('SELECT * FROM catalog_items ORDER BY kind, name_en').all();
        return json(200, { items });
      }
      if (method === 'POST') {
        const kind = kindOf(db, body);
        const billingPeriod = periodOf(body);
        const name = needStr(body, 'name_en', { max: 300 });
        const unitSatang = unitSatangOf(body);
        const row = tx(db, () => {
          const { lastInsertRowid: id } = db.prepare(
            `INSERT INTO catalog_items (kind, sku, name_en, name_th, description, unit, unit_satang, billing_period, section, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(kind, optStr(body, 'sku', { max: 100 }), name, optStr(body, 'name_th'),
            optStr(body, 'description'), optStr(body, 'unit', { max: 30 }) || defaultUnitFor(kind, billingPeriod), unitSatang,
            billingPeriod, optStr(body, 'section', { max: 100 }),
            body.active === false ? 0 : 1);
          audit(db, actor, 'catalog.create', 'catalog_item', id, { kind, name });
          return db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(id);
        });
        return json(201, { item: row });
      }
    }
    if (seg[0] === 'catalog' && seg[1]) {
      const id = Number(seg[1]);
      const row = db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(id);
      if (!row) throw missing('catalog item');
      if (method === 'GET') return json(200, { item: row });
      if (method === 'PUT') {
        const merged = { ...row, ...body };
        // Was: `merged.kind === 'hardware' ? 'hardware' : 'service'` — which
        // silently REWROTE any unrecognised kind to 'service' instead of
        // refusing it. kindOf rejects; the row's existing kind is the fallback
        // when the body simply does not mention kind.
        const kind = kindOf(db, body, { fallback: String(row.kind) });
        const billingPeriod = periodOf(body, String(row.billing_period ?? 'once'));
        // The price comes from the REQUEST, never from `merged`. merged spreads
        // the row first, so merged.unit_satang is ALWAYS non-null for an existing
        // item — reading it here meant unitSatangOf(body) was unreachable and a
        // PUT carrying unit_price reported success while writing the old price
        // back. Omitting both fields still keeps the stored price (a kind-only or
        // active-only toggle must not move it); sending both is still a 400,
        // because unitSatangOf is the single validator for either spelling.
        const unitSatang = (body.unit_satang != null || body.unit_price != null)
          ? unitSatangOf(body)
          : Number(row.unit_satang);
        if (!Number.isSafeInteger(unitSatang) || unitSatang < 0) throw bad('unit_satang must be a non-negative integer');
        tx(db, () => {
          db.prepare(
            `UPDATE catalog_items SET kind=?, sku=?, name_en=?, name_th=?, description=?, unit=?, unit_satang=?,
             billing_period=?, section=?, active=?,
             updated_at=datetime('now') WHERE id=?`
          ).run(kind, String(merged.sku ?? ''), String(merged.name_en ?? row.name_en), String(merged.name_th ?? ''),
            String(merged.description ?? ''), String(merged.unit ?? 'day'), unitSatang,
            billingPeriod, String(merged.section ?? ''), merged.active === false ? 0 : 1, id);
          audit(db, actor, 'catalog.update', 'catalog_item', id, { fields: Object.keys(body) });
        });
        return json(200, { item: db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(id) });
      }
      if (method === 'DELETE') {
        const used = db.prepare('SELECT COUNT(*) c FROM quotation_lines WHERE catalog_id = ?').get(id).c;
        if (used) throw bad(`catalog item is referenced by ${used} quotation line(s); deactivate it instead`);
        tx(db, () => {
          db.prepare('DELETE FROM catalog_items WHERE id = ?').run(id);
          audit(db, actor, 'catalog.delete', 'catalog_item', id, { name: row.name_en });
        });
        return json(200, { ok: true });
      }
    }

    // ---------- quotations ----------
    if (path === '/quotations' && method === 'GET') {
      const clauses = [];
      const args = [];
      if (query.status) { clauses.push('status = ?'); args.push(query.status); }
      if (query.client_id) { clauses.push('client_id = ?'); args.push(Number(query.client_id)); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = db.prepare(`SELECT * FROM quotations ${where} ORDER BY id DESC`).all(...args);
      // include=totals is OPT-IN so the plain list stays the cheap row read the
      // CLI and every existing caller already rely on. The list screen needs a
      // payable figure per row, and fetching it by building each document in a
      // separate request was one HTTP round trip per quotation — the totals
      // column filled in visibly, row by row, on every page load.
      if (String(query.include ?? '').split(',').includes('totals')) {
        return json(200, {
          quotations: rows.map((q) => {
            const doc = buildQuoteDocument(db, q.id);
            return {
              ...q,
              revision: doc.quotation.revision,
              revision_stale: doc.quotation.revisionStale,
              line_count: doc.lines.length,
              totals: {
                currency: doc.totals.currency,
                netSatang: doc.totals.netSatang,
                grandSatang: doc.totals.grandSatang,
                payableSatang: doc.totals.payableSatang,
              },
            };
          }),
        });
      }
      return json(200, { quotations: rows });
    }
    if (path === '/quotations' && method === 'POST') {
      const clientId = Number(body.client_id);
      if (!Number.isInteger(clientId)) throw bad('client_id is required');
      if (!db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId)) throw missing('client');
      const lang = body.lang === 'th' ? 'th' : 'en';
      let sow = null;
      try {
        if (body.template) sow = sowFromTemplate(getSettings(db, ''), String(body.template));
        if (body.sow !== undefined) sow = validateSow(body.sow);
      } catch (e) { throw bad(e.message); }
      const lineErrors = [];
      const initialLines = body.lines === undefined ? [] : checkedLines(db, body.lines, lineErrors);
      if (lineErrors.length) return json(400, { error: 'quotation lines need correction', errors: lineErrors });
      const doc = tx(db, () => {
        const settings = getSettings(db, '');
        const number = allocateQuoteNumber(db, settings);
        const issueDate = optStr(body, 'issue_date', { max: 10 });
        const { lastInsertRowid: id } = db.prepare(
          `INSERT INTO quotations (number, client_id, lang, currency, issue_date, fx_base, fx_rate, fx_as_of, notes, created_by, sow_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(number, clientId, lang,
          String(body.currency ?? settings['currency.code'] ?? 'THB'),
          issueDate,
          String(body.fx_base ?? settings['fx.base'] ?? ''),
          String(body.fx_rate ?? settings['fx.rate'] ?? ''),
          String(body.fx_as_of ?? settings['fx.as_of'] ?? ''),
          optStr(body, 'notes'), actor, sow ? JSON.stringify(sow) : '');
        if (initialLines.length) insertCheckedLines(db, id, initialLines);
        audit(db, actor, 'quotation.create', 'quotation', id, { number, client_id: clientId, template: body.template ?? null, lines: initialLines.length });
        return buildQuoteDocument(db, id);
      });
      return json(201, docEnvelope(doc));
    }

    if (seg[0] === 'quotations' && seg[1]) {
      const id = Number(seg[1]);
      const row = db.prepare('SELECT * FROM quotations WHERE id = ?').get(id);
      if (!row) throw missing('quotation');

      if (!seg[2]) {
        if (method === 'GET') return json(200, docEnvelope(buildQuoteDocument(db, id)));
        if (method === 'PUT') {
          const fields = ['lang', 'currency', 'notes', 'issue_date', 'fx_base', 'fx_rate', 'fx_as_of'];
          const sets = [];
          const args = [];
          for (const f of fields) if (body[f] != null) { sets.push(`${f} = ?`); args.push(String(body[f])); }
          // term_months is numeric, not a string field: it drives arithmetic.
          if (body.term_months != null) {
            const t = Number(body.term_months);
            if (!Number.isSafeInteger(t) || t < 0 || t > 600) throw bad('term_months must be an integer between 0 and 600 (0 = no term stated)');
            sets.push('term_months = ?'); args.push(t);
          }
          if (body.client_id != null) {
            const cid = Number(body.client_id);
            if (!db.prepare('SELECT id FROM clients WHERE id = ?').get(cid)) throw missing('client');
            sets.push('client_id = ?'); args.push(cid);
          }
          if (!sets.length) throw bad('no editable fields in body');
          // Was 'only draft quotations are editable' — which named a revision
          // flow nothing implemented. An issued or proposed quotation is now
          // genuinely correctable; re-issuing it snapshots the correction.
          { const why = editRefusal(row.status); if (why) throw bad(why); }
          tx(db, () => {
            db.prepare(`UPDATE quotations SET ${sets.join(', ')}, updated_at=datetime('now') WHERE id = ?`).run(...args, id);
            audit(db, actor, 'quotation.update', 'quotation', id, { fields: Object.keys(body) });
          });
          return json(200, docEnvelope(buildQuoteDocument(db, id)));
        }
        if (method === 'DELETE') {
          // Was draft-only, which left every test quotation that had ever been
          // issued permanently stuck in the list with no way to remove it.
          //
          // The ONE thing that must stay impossible is an orphaned invoice:
          // invoices.quotation_id (db.mjs) carries no ON DELETE rule, so a
          // deleted quotation would leave an invoice pointing at nothing —
          // and an invoice is a filed tax document. Everything else is the
          // operator's call.
          //
          // The cost is stated rather than hidden: quotation_revisions
          // CASCADEs, so deleting an issued quotation destroys the snapshots of
          // what was actually sent. 'cancelled' exists as the non-destructive
          // retirement path and the UI offers it alongside this.
          const inv = db.prepare(
            'SELECT number FROM invoices WHERE quotation_id = ? ORDER BY id LIMIT 1'
          ).get(id);
          if (inv) {
            throw bad(
              `quotation ${row.number} cannot be deleted because tax invoice ${inv.number} was raised from it`
              + ' (cancel the invoice first, or cancel this quotation instead of deleting it)'
            );
          }
          const revisions = db.prepare(
            'SELECT COUNT(*) c FROM quotation_revisions WHERE quotation_id = ?'
          ).get(id).c;
          tx(db, () => {
            db.prepare('DELETE FROM quotations WHERE id = ?').run(id);
            // status and revisions_destroyed are recorded because the rows that
            // would otherwise evidence them are gone with the quotation.
            audit(db, actor, 'quotation.delete', 'quotation', id, {
              number: row.number, status: String(row.status), revisions_destroyed: revisions,
            });
          });
          return json(200, { ok: true, number: String(row.number), revisions_destroyed: revisions });
        }
      }

      if (seg[2] === 'sow' && method === 'PUT') {
        const why = editRefusal(row.status);
        if (why) throw bad(why);
        let sow;
        try { sow = validateSow(body.sow); } catch (e) { throw bad(e.message); }
        tx(db, () => {
          db.prepare("UPDATE quotations SET sow_json=?, updated_at=datetime('now') WHERE id=?").run(sow ? JSON.stringify(sow) : '', id);
          audit(db, actor, 'quotation.sow', 'quotation', id, { modules: sow?.modules.length ?? 0 });
        });
        return json(200, docEnvelope(buildQuoteDocument(db, id)));
      }
      if (seg[2] === 'draft.json' && method === 'GET') {
        if (row.status !== 'draft') throw bad('AI draft export is available for draft quotations only');
        const doc = buildQuoteDocument(db, id);
        return json(200, { schema: 'factor-quote-draft', version: 1, quotation_id: id,
          base_digest: quoteDigest(doc),
          header: { lang: row.lang, currency: row.currency, issue_date: row.issue_date,
            notes: row.notes, term_months: Number(row.term_months) },
          sow: doc.sow,
          lines: doc.lines.map((line) => ({ kind: line.kind, description_en: line.descriptionEn,
            description_th: line.descriptionTh, qty: milliToDecimal(line.qtyMilli), unit: line.unit,
            unit_price: satangToDecimal(line.unitSatang), discount_satang: line.discountSatang,
            billing_period: line.billingPeriod, section: line.section, optional: line.optional })) });
      }
      if (seg[2] === 'draft' && method === 'POST') {
        if (row.status !== 'draft') throw bad('AI draft import is available for draft quotations only');
        const errors = [];
        hasOnly(body, DRAFT_KEYS, '', errors);
        if (body.schema !== 'factor-quote-draft') errors.push({ path: 'schema', message: 'must be factor-quote-draft' });
        if (body.version !== 1) errors.push({ path: 'version', message: 'must be 1' });
        if (Number(body.quotation_id) !== id) errors.push({ path: 'quotation_id', message: 'does not match this quotation' });
        const current = buildQuoteDocument(db, id);
        if (body.base_digest !== quoteDigest(current)) return json(409, { error: 'quotation changed since export; export a fresh AI draft' });
        const header = body.header;
        const headerOk = hasOnly(header, HEADER_KEYS, 'header', errors);
        if (headerOk) {
          if (!['en', 'th'].includes(header.lang)) errors.push({ path: 'header.lang', message: 'must be en or th' });
          if (typeof header.currency !== 'string' || !/^[A-Z]{3}$/.test(header.currency)) errors.push({ path: 'header.currency', message: 'must be a three-letter currency code' });
          if (typeof header.issue_date !== 'string' || (header.issue_date && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(header.issue_date))) errors.push({ path: 'header.issue_date', message: 'must be YYYY-MM-DD or blank' });
          if (typeof header.notes !== 'string' || header.notes.length > 5000) errors.push({ path: 'header.notes', message: 'must be text up to 5000 characters' });
          if (!Number.isInteger(header.term_months) || header.term_months < 0 || header.term_months > 600) errors.push({ path: 'header.term_months', message: 'must be an integer from 0 to 600' });
        }
        let sow = null;
        try { sow = validateSow(body.sow); } catch (e) { errors.push({ path: 'sow', message: e.message }); }
        const lines = checkedLines(db, body.lines, errors);
        if (!lines.length) errors.push({ path: 'lines', message: 'add at least one priced line' });
        if (errors.length) return json(400, { error: 'AI draft needs correction', errors });
        const dryRun = query.dry_run === '1';
        const PREVIEW = Symbol('preview');
        try {
          return tx(db, () => {
            db.prepare('DELETE FROM quotation_lines WHERE quotation_id=?').run(id);
            insertCheckedLines(db, id, lines);
            db.prepare(`UPDATE quotations SET lang=?, currency=?, issue_date=?, notes=?, term_months=?, sow_json=?, updated_at=datetime('now') WHERE id=?`)
              .run(header.lang, header.currency, header.issue_date, header.notes, header.term_months, sow ? JSON.stringify(sow) : '', id);
            const doc = buildQuoteDocument(db, id);
            if (dryRun) throw { marker: PREVIEW, doc };
            audit(db, actor, 'quotation.import', 'quotation', id, { lines: lines.length, base_digest: body.base_digest, source: 'ai-json' });
            return json(200, { preview: false, ...docEnvelope(doc) });
          });
        } catch (e) {
          if (e?.marker === PREVIEW) return json(200, { preview: true, ...docEnvelope(e.doc) });
          throw e;
        }
      }

      if (seg[2] === 'lines') {
        if (method === 'GET') {
          const lines = db.prepare('SELECT * FROM quotation_lines WHERE quotation_id = ? ORDER BY position, id').all(id);
          return json(200, { lines });
        }
        // READING lines is always allowed; CHANGING them is not. Until this
        // guard existed these three routes had NO status check whatsoever —
        // only ui/quote.html hid the buttons — so any CLI or agent call could
        // rewrite the lines of an issued, accepted or even invoiced quotation.
        // The PDF renders from live lines, so the customer's document could
        // change after issue with nothing recording that it had.
        { const why = editRefusal(row.status); if (why) throw bad(why); }
        if (method === 'POST') {
          const kind = kindOf(db, body);
          const billingPeriod = periodOf(body);
          const descEn = needStr(body, 'description_en', { max: 1000 });
          const qtyMilli = qtyMilliOf(body);
          const unitSatang = unitSatangOf(body);
          const discount = Number(body.discount_satang ?? 0);
          if (!Number.isSafeInteger(discount) || discount < 0) throw bad('discount_satang must be a non-negative integer');
          const optional = body.optional === true || body.optional === 1 || body.optional === '1' ? 1 : 0;
          const section = optStr(body, 'section', { max: 100 });
          const { position } = db.prepare(
            'SELECT COALESCE(MAX(position), 0) + 1 AS position FROM quotation_lines WHERE quotation_id = ?'
          ).get(id);
          const lineId = tx(db, () => {
            const { lastInsertRowid: lid } = db.prepare(
              `INSERT INTO quotation_lines
                 (quotation_id, position, kind, description_en, description_th, qty_milli, unit, unit_satang, discount_satang,
                  billing_period, section, optional, catalog_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(id, position, kind, descEn, optStr(body, 'description_th'),
              qtyMilli, optStr(body, 'unit', { max: 30 }) || defaultUnitFor(kind, billingPeriod),
              unitSatang, discount, billingPeriod, section, optional, body.catalog_id ?? null);
            audit(db, actor, 'line.add', 'quotation', id, { line_id: lid, kind, billing_period: billingPeriod, optional, qty_milli: qtyMilli, unit_satang: unitSatang });
            return lid;
          });
          return json(201, docEnvelope(buildQuoteDocument(db, id), { line: db.prepare('SELECT * FROM quotation_lines WHERE id = ?').get(lineId) }));
        }
        if (method === 'PUT' && seg[3]) {
          const lineId = Number(seg[3]);
          const line = db.prepare('SELECT * FROM quotation_lines WHERE id = ? AND quotation_id = ?').get(lineId, id);
          if (!line) throw missing('line');
          // kind was previously ABSENT from this merge, so a line's type could
          // not be corrected after creation even while the quotation was still
          // a draft — the operator had to delete the line and re-add it. With
          // an open vocabulary that matters more, so kind joins the merge.
          const merged = {
            kind: kindOf(db, body, { fallback: String(line.kind) }),
            description_en: body.description_en ?? line.description_en,
            description_th: body.description_th ?? line.description_th,
            qty_milli: body.qty_milli != null || body.qty != null ? qtyMilliOf(body) : line.qty_milli,
            unit: body.unit ?? line.unit,
            unit_satang: body.unit_satang != null || body.unit_price != null ? unitSatangOf(body) : line.unit_satang,
            discount_satang: body.discount_satang != null ? Number(body.discount_satang) : line.discount_satang,
            billing_period: periodOf(body, String(line.billing_period ?? 'once')),
            section: body.section != null ? String(body.section).trim().slice(0, 100) : line.section,
            optional: body.optional != null
              ? (body.optional === true || body.optional === 1 || body.optional === '1' ? 1 : 0)
              : line.optional,
          };
          tx(db, () => {
            db.prepare(
              `UPDATE quotation_lines SET kind=?, description_en=?, description_th=?, qty_milli=?, unit=?, unit_satang=?, discount_satang=?,
               billing_period=?, section=?, optional=?
               WHERE id = ?`
            ).run(String(merged.kind), String(merged.description_en), String(merged.description_th), merged.qty_milli,
              String(merged.unit), merged.unit_satang, Math.max(0, Math.min(merged.discount_satang, 99999999999)),
              String(merged.billing_period), String(merged.section ?? ''), merged.optional ? 1 : 0, lineId);
            audit(db, actor, 'line.update', 'quotation', id, { line_id: lineId, fields: Object.keys(body) });
          });
          return json(200, docEnvelope(buildQuoteDocument(db, id), { line: db.prepare('SELECT * FROM quotation_lines WHERE id = ?').get(lineId) }));
        }
        if (method === 'DELETE' && seg[3]) {
          const lineId = Number(seg[3]);
          const line = db.prepare('SELECT * FROM quotation_lines WHERE id = ? AND quotation_id = ?').get(lineId, id);
          if (!line) throw missing('line');
          tx(db, () => {
            db.prepare('DELETE FROM quotation_lines WHERE id = ?').run(lineId);
            audit(db, actor, 'line.remove', 'quotation', id, { line_id: lineId, description: line.description_en });
          });
          return json(200, docEnvelope(buildQuoteDocument(db, id), { ok: true }));
        }
      }

      // markStatus throws plain Errors for an invalid or illegal transition.
      // Those are CLIENT errors — without this mapping they escape as a 500,
      // which tells the caller the server broke when in fact they asked for a
      // move the state machine forbids.
      // Issue AND re-issue. A first issue moves draft -> issued and snapshots.
      // A RE-issue only snapshots: it is how a correction to an already-issued
      // quotation is recorded, and it deliberately leaves the status alone.
      //
      // It cannot be markStatus('issued') in that case, because TRANSITIONS
      // allows issued -> issued but NOT proposed -> issued (quote.mjs) — and a
      // proposed quotation, sitting with the customer, is exactly the one whose
      // bad information gets noticed. Walking it back to 'issued' would undo a
      // pipeline step that really happened, so the snapshot is taken directly
      // and the audit says 'quotation.revision', which is what actually changed.
      if (seg[2] === 'issue' && method === 'POST') {
        const count = db.prepare('SELECT COUNT(*) c FROM quotation_lines WHERE quotation_id = ?').get(id).c;
        if (!count) throw bad('cannot issue a quotation with no lines');
        if (row.status === 'draft') {
          let result;
          try { result = markStatus(db, id, 'issued', actor); } catch (e) { throw bad(e.message); }
          return json(200, docEnvelope(buildQuoteDocument(db, id), { status: result.status, rev: result.rev }));
        }
        { const why = editRefusal(row.status); if (why) throw bad(why); }
        const rev = tx(db, () => {
          const next = saveRevision(db, id, buildQuoteDocument(db, id), actor);
          audit(db, actor, 'quotation.revision', 'quotation', id, { rev: next, status: row.status });
          return next;
        });
        return json(200, docEnvelope(buildQuoteDocument(db, id), { status: String(row.status), rev }));
      }

      if (seg[2] === 'status' && method === 'POST') {
        const status = needStr(body, 'status', { max: 20 });
        let result;
        try { result = markStatus(db, id, status, actor); } catch (e) { throw bad(e.message); }
        return json(200, docEnvelope(buildQuoteDocument(db, id), { status: result.status, rev: result.rev }));
      }

      if (seg[2] === 'revisions') {
        if (method === 'GET' && !seg[3]) {
          const revs = db.prepare(
            'SELECT rev, actor, created_at FROM quotation_revisions WHERE quotation_id = ? ORDER BY rev'
          ).all(id);
          return json(200, { revisions: revs });
        }
        if (method === 'GET' && seg[3]) {
          const snap = db.prepare(
            'SELECT * FROM quotation_revisions WHERE quotation_id = ? AND rev = ?'
          ).get(id, Number(seg[3]));
          if (!snap) throw missing('revision');
          return json(200, { revision: { rev: snap.rev, actor: snap.actor, created_at: snap.created_at }, snapshot: JSON.parse(snap.snapshot_json) });
        }
      }
    }

    // ---------- invoices ----------
    // The invoice envelope keeps `totals` a TOP-LEVEL sibling, exactly like the
    // quotation one: cli.mjs reads r.totals.* flat, so nesting it breaks the CLI.
    const invEnvelope = (doc, extra = {}) => ({
      invoice: doc.invoice,
      client: doc.client,
      lines: doc.lines,
      totals: doc.totals,
      balance: doc.balance,
      payments: doc.payments,
      wht_certificates: doc.whtCertificates,
      issuer: doc.issuer,
      bank: doc.bank,
      terms: doc.terms,
      kindLabels: doc.kindLabels,
      ...extra,
    });

    if (path === '/invoices' && method === 'GET') {
      const clauses = [];
      const args = [];
      if (query.status) { clauses.push('status = ?'); args.push(query.status); }
      if (query.client_id) { clauses.push('client_id = ?'); args.push(Number(query.client_id)); }
      if (query.month) { clauses.push('issue_date LIKE ?'); args.push(`${query.month}%`); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      return json(200, { invoices: db.prepare(`SELECT * FROM invoices ${where} ORDER BY id DESC`).all(...args) });
    }
    if (path === '/invoices' && method === 'POST') {
      const quotationId = Number(body.quotation_id);
      if (!Number.isInteger(quotationId)) throw bad('quotation_id is required');
      if (!db.prepare('SELECT id FROM quotations WHERE id = ?').get(quotationId)) throw missing('quotation');
      let created;
      try {
        created = createInvoiceFromQuotation(db, quotationId, {
          actor,
          lang: optStr(body, 'lang', { max: 2 }),
          issueDate: optStr(body, 'issue_date', { max: 10 }),
          notes: optStr(body, 'notes'),
          // Optional lines are omitted by default; name the ids of the options
          // the customer actually took to bill them.
          includeOptionalLineIds: Array.isArray(body.include_optional_line_ids)
            ? body.include_optional_line_ids.map(Number).filter(Number.isInteger)
            : [],
        });
      } catch (e) { throw bad(e.message); }
      return json(201, invEnvelope(buildInvoiceDocument(db, created.id)));
    }

    if (seg[0] === 'invoices' && seg[1]) {
      const id = Number(seg[1]);
      if (!Number.isInteger(id)) throw bad('bad invoice id');
      const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (!inv) throw missing('invoice');

      if (!seg[2] && method === 'GET') return json(200, invEnvelope(buildInvoiceDocument(db, id)));

      if (!seg[2] && method === 'DELETE') {
        if (inv.status !== 'draft') throw bad('only a draft invoice can be deleted; cancel an issued one instead');
        tx(db, () => {
          db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
          audit(db, actor, 'invoice.delete', 'invoice', id, { number: inv.number });
        });
        return json(200, { ok: true });
      }

      if (seg[2] === 'issue' && method === 'POST') {
        try {
          issueInvoice(db, id, { actor, issueDate: optStr(body, 'issue_date', { max: 10 }) });
        } catch (e) { throw bad(e.message); }
        return json(200, invEnvelope(buildInvoiceDocument(db, id)));
      }

      if (seg[2] === 'status' && method === 'POST') {
        const status = needStr(body, 'status', { max: 20 });
        try { markInvoiceStatus(db, id, status, actor); } catch (e) { throw bad(e.message); }
        return json(200, invEnvelope(buildInvoiceDocument(db, id)));
      }

      if (seg[2] === 'payments') {
        if (method === 'GET') {
          return json(200, {
            payments: db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_on, id').all(id),
            balance: invoiceBalance(db, id),
          });
        }
        if (method === 'POST') {
          const amountSatang = body.amount_satang != null
            ? Number(body.amount_satang)
            : parseSatang(needStr(body, 'amount'));
          try {
            recordPayment(db, id, {
              actor,
              paidOn: optStr(body, 'paid_on', { max: 10 }),
              amountSatang,
              method: optStr(body, 'method', { max: 30 }),
              reference: optStr(body, 'reference', { max: 200 }),
              note: optStr(body, 'note'),
            });
          } catch (e) { throw bad(e.message); }
          return json(201, invEnvelope(buildInvoiceDocument(db, id)));
        }
        if (method === 'DELETE' && seg[3]) {
          const pid = Number(seg[3]);
          const p = db.prepare('SELECT * FROM payments WHERE id = ? AND invoice_id = ?').get(pid, id);
          if (!p) throw missing('payment');
          tx(db, () => {
            db.prepare('DELETE FROM payments WHERE id = ?').run(pid);
            // reversing a payment un-settles the invoice
            if (inv.status === 'paid') db.prepare("UPDATE invoices SET status='issued' WHERE id = ?").run(id);
            audit(db, actor, 'payment.delete', 'invoice', id, { payment_id: pid, amount_satang: p.amount_satang });
          });
          return json(200, invEnvelope(buildInvoiceDocument(db, id)));
        }
      }

      if (seg[2] === 'wht' && method === 'POST') {
        const baseSatang = body.base_satang != null ? Number(body.base_satang) : parseSatang(needStr(body, 'base'));
        const whtSatang = body.wht_satang != null ? Number(body.wht_satang) : parseSatang(needStr(body, 'wht'));
        try {
          recordWhtCertificate(db, {
            actor, invoiceId: id,
            certNumber: optStr(body, 'cert_number', { max: 100 }),
            issuedOn: optStr(body, 'issued_on', { max: 10 }),
            pndForm: optStr(body, 'pnd_form', { max: 10 }) || 'PND53',
            baseSatang, whtSatang,
            ratePercent: optStr(body, 'rate_percent', { max: 10 }),
            payerName: optStr(body, 'payer_name', { max: 300 }),
            payerTaxId: optStr(body, 'payer_tax_id', { max: 50 }),
            filePath: optStr(body, 'file_path', { max: 500 }),
            note: optStr(body, 'note'),
          });
        } catch (e) { throw bad(e.message); }
        return json(201, invEnvelope(buildInvoiceDocument(db, id)));
      }
    }

    // ---------- reports ----------
    // Worksheets to transcribe. Nothing here files anything with the Revenue
    // Department, and every figure is read from frozen invoice columns.
    if (seg[0] === 'reports' && method === 'GET') {
      const yearOf = () => {
        if (query.year != null) {
          const y = Number(query.year);
          if (!Number.isInteger(y)) throw bad('year must be an integer');
          return y;
        }
        return Number(new Date().getFullYear());
      };
      try {
        if (seg[1] === 'pp30') {
          const month = Number(query.month);
          if (!Number.isInteger(month)) throw bad('month is required (1-12)');
          return json(200, { report: pp30Monthly(db, { year: yearOf(), month }) });
        }
        if (seg[1] === 'income') return json(200, { report: incomeByMonth(db, { year: yearOf() }) });
        if (seg[1] === 'wht') return json(200, { report: whtRegister(db, { from: query.from, to: query.to }) });
        if (seg[1] === 'pnd') {
          const half = query.half != null ? Number(query.half) : null;
          if (half != null && half !== 1 && half !== 2) throw bad('half must be 1 or 2');
          return json(200, { report: pndSummary(db, { year: yearOf(), half }) });
        }
        if (seg[1] === 'pipeline') {
          return json(200, { report: pipelineSummary(db, { year: query.year ? Number(query.year) : null }) });
        }
      } catch (e) {
        if (e instanceof ApiError) throw e;
        throw bad(e.message);
      }
    }

    throw missing(`route ${method} ${path}`);
  }

  return route;
}