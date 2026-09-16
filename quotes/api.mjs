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
import { parseSatang, parseMilli, milliToDecimal } from './lib/money.mjs';
import {
  computeTotals, allocateQuoteNumber, buildQuoteDocument,
  saveRevision, markStatus,
} from './lib/quote.mjs';

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
  totals: doc.totals,
  issuer: doc.issuer,
  bank: doc.bank,
  terms: doc.terms,
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
            setSetting(db, k, String(v), actor);
          }
          audit(db, actor, 'settings.update', 'settings', '', Object.keys(entries));
          return Object.keys(entries).length;
        });
        return json(200, { ok: true, updated: applied });
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
        const kind = body.kind === 'hardware' ? 'hardware' : body.kind === 'service' ? 'service' : null;
        if (!kind) throw bad('kind must be "service" or "hardware"');
        const name = needStr(body, 'name_en', { max: 300 });
        const unitSatang = unitSatangOf(body);
        const row = tx(db, () => {
          const { lastInsertRowid: id } = db.prepare(
            `INSERT INTO catalog_items (kind, sku, name_en, name_th, description, unit, unit_satang, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(kind, optStr(body, 'sku', { max: 100 }), name, optStr(body, 'name_th'),
            optStr(body, 'description'), optStr(body, 'unit', { max: 30 }) || 'day', unitSatang,
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
        const kind = merged.kind === 'hardware' ? 'hardware' : 'service';
        const unitSatang = merged.unit_satang != null ? Number(merged.unit_satang) : unitSatangOf(body);
        if (!Number.isSafeInteger(unitSatang) || unitSatang < 0) throw bad('unit_satang must be a non-negative integer');
        tx(db, () => {
          db.prepare(
            `UPDATE catalog_items SET kind=?, sku=?, name_en=?, name_th=?, description=?, unit=?, unit_satang=?, active=?,
             updated_at=datetime('now') WHERE id=?`
          ).run(kind, String(merged.sku ?? ''), String(merged.name_en ?? row.name_en), String(merged.name_th ?? ''),
            String(merged.description ?? ''), String(merged.unit ?? 'day'), unitSatang, merged.active === false ? 0 : 1, id);
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
      return json(200, { quotations: rows });
    }
    if (path === '/quotations' && method === 'POST') {
      const clientId = Number(body.client_id);
      if (!Number.isInteger(clientId)) throw bad('client_id is required');
      if (!db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId)) throw missing('client');
      const lang = body.lang === 'th' ? 'th' : 'en';
      const doc = tx(db, () => {
        const settings = getSettings(db, '');
        const number = allocateQuoteNumber(db, settings);
        const issueDate = optStr(body, 'issue_date', { max: 10 });
        const { lastInsertRowid: id } = db.prepare(
          `INSERT INTO quotations (number, client_id, lang, currency, issue_date, fx_base, fx_rate, fx_as_of, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(number, clientId, lang,
          String(body.currency ?? settings['currency.code'] ?? 'THB'),
          issueDate,
          String(body.fx_base ?? settings['fx.base'] ?? ''),
          String(body.fx_rate ?? settings['fx.rate'] ?? ''),
          String(body.fx_as_of ?? settings['fx.as_of'] ?? ''),
          optStr(body, 'notes'), actor);
        audit(db, actor, 'quotation.create', 'quotation', id, { number, client_id: clientId });
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
          if (body.client_id != null) {
            const cid = Number(body.client_id);
            if (!db.prepare('SELECT id FROM clients WHERE id = ?').get(cid)) throw missing('client');
            sets.push('client_id = ?'); args.push(cid);
          }
          if (!sets.length) throw bad('no editable fields in body');
          if (row.status !== 'draft') throw bad('only draft quotations are editable; issue a revision instead');
          tx(db, () => {
            db.prepare(`UPDATE quotations SET ${sets.join(', ')}, updated_at=datetime('now') WHERE id = ?`).run(...args, id);
            audit(db, actor, 'quotation.update', 'quotation', id, { fields: Object.keys(body) });
          });
          return json(200, docEnvelope(buildQuoteDocument(db, id)));
        }
        if (method === 'DELETE') {
          if (row.status !== 'draft') throw bad('only draft quotations can be deleted');
          tx(db, () => {
            db.prepare('DELETE FROM quotations WHERE id = ?').run(id);
            audit(db, actor, 'quotation.delete', 'quotation', id, { number: row.number });
          });
          return json(200, { ok: true });
        }
      }

      if (seg[2] === 'lines') {
        if (method === 'GET') {
          const lines = db.prepare('SELECT * FROM quotation_lines WHERE quotation_id = ? ORDER BY position, id').all(id);
          return json(200, { lines });
        }
        if (method === 'POST') {
          const kind = body.kind === 'hardware' ? 'hardware' : body.kind === 'service' ? 'service' : null;
          if (!kind) throw bad('kind must be "service" or "hardware"');
          const descEn = needStr(body, 'description_en', { max: 1000 });
          const qtyMilli = qtyMilliOf(body);
          const unitSatang = unitSatangOf(body);
          const discount = Number(body.discount_satang ?? 0);
          if (!Number.isSafeInteger(discount) || discount < 0) throw bad('discount_satang must be a non-negative integer');
          const { position } = db.prepare(
            'SELECT COALESCE(MAX(position), 0) + 1 AS position FROM quotation_lines WHERE quotation_id = ?'
          ).get(id);
          const lineId = tx(db, () => {
            const { lastInsertRowid: lid } = db.prepare(
              `INSERT INTO quotation_lines
                 (quotation_id, position, kind, description_en, description_th, qty_milli, unit, unit_satang, discount_satang, catalog_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(id, position, kind, descEn, optStr(body, 'description_th'),
              qtyMilli, optStr(body, 'unit', { max: 30 }) || (kind === 'service' ? 'day' : 'unit'),
              unitSatang, discount, body.catalog_id ?? null);
            audit(db, actor, 'line.add', 'quotation', id, { line_id: lid, kind, qty_milli: qtyMilli, unit_satang: unitSatang });
            return lid;
          });
          return json(201, docEnvelope(buildQuoteDocument(db, id), { line: db.prepare('SELECT * FROM quotation_lines WHERE id = ?').get(lineId) }));
        }
        if (method === 'PUT' && seg[3]) {
          const lineId = Number(seg[3]);
          const line = db.prepare('SELECT * FROM quotation_lines WHERE id = ? AND quotation_id = ?').get(lineId, id);
          if (!line) throw missing('line');
          const merged = {
            description_en: body.description_en ?? line.description_en,
            description_th: body.description_th ?? line.description_th,
            qty_milli: body.qty_milli != null || body.qty != null ? qtyMilliOf(body) : line.qty_milli,
            unit: body.unit ?? line.unit,
            unit_satang: body.unit_satang != null || body.unit_price != null ? unitSatangOf(body) : line.unit_satang,
            discount_satang: body.discount_satang != null ? Number(body.discount_satang) : line.discount_satang,
          };
          tx(db, () => {
            db.prepare(
              `UPDATE quotation_lines SET description_en=?, description_th=?, qty_milli=?, unit=?, unit_satang=?, discount_satang=?
               WHERE id = ?`
            ).run(String(merged.description_en), String(merged.description_th), merged.qty_milli,
              String(merged.unit), merged.unit_satang, Math.max(0, Math.min(merged.discount_satang, 99999999999)), lineId);
            audit(db, actor, 'line.update', 'quotation', id, { line_id: lineId, fields: Object.keys(body) });
          });
          return json(200, { line: db.prepare('SELECT * FROM quotation_lines WHERE id = ?').get(lineId), quotation: buildQuoteDocument(db, id) });
        }
        if (method === 'DELETE' && seg[3]) {
          const lineId = Number(seg[3]);
          const line = db.prepare('SELECT * FROM quotation_lines WHERE id = ? AND quotation_id = ?').get(lineId, id);
          if (!line) throw missing('line');
          tx(db, () => {
            db.prepare('DELETE FROM quotation_lines WHERE id = ?').run(lineId);
            audit(db, actor, 'line.remove', 'quotation', id, { line_id: lineId, description: line.description_en });
          });
          return json(200, { ok: true, quotation: buildQuoteDocument(db, id) });
        }
      }

      if (seg[2] === 'issue' && method === 'POST') {
        const count = db.prepare('SELECT COUNT(*) c FROM quotation_lines WHERE quotation_id = ?').get(id).c;
        if (!count) throw bad('cannot issue a quotation with no lines');
        const { status, rev } = markStatus(db, id, 'issued', actor);
        return json(200, { status, rev, quotation: buildQuoteDocument(db, id) });
      }

      if (seg[2] === 'status' && method === 'POST') {
        const status = needStr(body, 'status', { max: 20 });
        const { status: s, rev } = markStatus(db, id, status, actor);
        return json(200, { status: s, rev, quotation: buildQuoteDocument(db, id) });
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

    throw missing(`route ${method} ${path}`);
  }

  return route;
}