// giveaway/api.mjs — the admin's JSON API, transport-free: ({method, path, query,
// body, actor}) -> {status, headers, body}. Both the web UI and cli.mjs use it.
//
// Rules the Worker relies on (catcountdown/worker/src/giveaway.js):
//   - an issued code is never freed: nothing here clears claimant/claimed_at or
//     deletes a code; revoke only marks it unusable;
//   - re-importing a code that already exists changes nothing (ON CONFLICT DO NOTHING).

import { chunkRows } from './lib/d1.mjs';

export const PUBLIC_BASE = 'https://catcountdown.factor-io.com/free/';
const PLATFORMS = ['android', 'ios'];
const STATUSES = ['active', 'paused', 'ended'];
const SLUG_RE = /^[a-z0-9-]{1,64}$/;
const CODE_RE = /^[\x21-\x7e]{1,128}$/; // printable ASCII, no spaces

export class ApiError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

function text(value, field, max = 200) {
  const s = String(value ?? '').trim();
  if (s.length > max) throw new ApiError(400, `${field} is longer than ${max} characters`);
  return s;
}

function platformsValue(raw) {
  const list = (Array.isArray(raw) ? raw : String(raw ?? '').split(','))
    .map((p) => String(p).trim().toLowerCase()).filter(Boolean);
  if (list.length === 0 || list.some((p) => !PLATFORMS.includes(p))) {
    throw new ApiError(400, `platforms must be one or more of ${PLATFORMS.join(', ')}`);
  }
  return PLATFORMS.filter((p) => list.includes(p)).join(',');
}

function capValue(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new ApiError(400, 'max_claims must be a whole number >= 0, or empty for no cap');
  return n;
}

function expiryValue(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const ms = typeof raw === 'number' ? raw * 1000 : Date.parse(String(raw));
  if (!Number.isFinite(ms)) throw new ApiError(400, 'expires_at must be a date (YYYY-MM-DD) or Unix seconds');
  return Math.floor(ms / 1000);
}

function platformValue(raw) {
  const p = String(raw ?? '').trim().toLowerCase();
  if (!PLATFORMS.includes(p)) throw new ApiError(400, `platform must be one of ${PLATFORMS.join(', ')}`);
  return p;
}

/** Codes from a paste or a list: one per line (commas and whitespace also split). */
export function parseCodes(raw) {
  const items = Array.isArray(raw) ? raw.map(String) : String(raw ?? '').split(/[\s,]+/);
  const codes = items.map((c) => c.trim()).filter(Boolean);
  const bad = codes.filter((c) => !CODE_RE.test(c));
  if (bad.length) throw new ApiError(400, `invalid code(s): ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? ', …' : ''}`);
  return codes;
}

// Spreadsheet apps execute cells starting with these; claim rows carry visitor emails.
const FORMULA = /^[=+\-@\t\r]/;
export function toCsv(rows, columns) {
  const cell = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (FORMULA.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [columns.map(cell).join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}

const iso = (s) => (s === null || s === undefined ? null : new Date(s * 1000).toISOString());

export function createApi(db, { log = console.log } = {}) {
  const ok = (body, status = 200) => ({ status, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body, null, 2) + '\n' });

  async function listCampaigns() {
    const rows = await db.all(`SELECT c.*, (SELECT COUNT(*) FROM codes x WHERE x.campaign_id = c.id) AS claims
      FROM campaigns c ORDER BY c.created_at DESC, c.id`);
    return rows.map((c) => ({ ...c, link: PUBLIC_BASE + c.id, created: iso(c.created_at) }));
  }

  async function createCampaign(body, actor) {
    const id = String(body.id ?? '').trim().toLowerCase();
    if (!SLUG_RE.test(id)) throw new ApiError(400, 'id must be 1-64 characters of a-z, 0-9 and -');
    const name = text(body.name, 'name') || id;
    const row = [id, name, text(body.source, 'source'), platformsValue(body.platforms ?? 'android'), capValue(body.max_claims), nowSeconds()];
    const exists = await db.first('SELECT id FROM campaigns WHERE id = ?', [id]);
    if (exists) throw new ApiError(409, `campaign ${id} already exists`);
    await db.run('INSERT INTO campaigns (id, name, source, platforms, status, max_claims, created_at) VALUES (?, ?, ?, ?, \'active\', ?, ?)', row);
    log(`${actor} created campaign ${id}`);
    return (await listCampaigns()).find((c) => c.id === id);
  }

  async function updateCampaign(id, body, actor) {
    const sets = [];
    const params = [];
    if ('name' in body) { sets.push('name = ?'); params.push(text(body.name, 'name') || id); }
    if ('source' in body) { sets.push('source = ?'); params.push(text(body.source, 'source')); }
    if ('platforms' in body) { sets.push('platforms = ?'); params.push(platformsValue(body.platforms)); }
    if ('max_claims' in body) { sets.push('max_claims = ?'); params.push(capValue(body.max_claims)); }
    if ('status' in body) {
      if (!STATUSES.includes(body.status)) throw new ApiError(400, `status must be one of ${STATUSES.join(', ')}`);
      sets.push('status = ?');
      params.push(body.status);
    }
    if (!sets.length) throw new ApiError(400, 'nothing to update');
    const meta = await db.run(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    if (!meta.changes) throw new ApiError(404, `no campaign ${id}`);
    log(`${actor} updated campaign ${id}: ${Object.keys(body).join(', ')}`);
    return (await listCampaigns()).find((c) => c.id === id);
  }

  async function stats() {
    const now = nowSeconds();
    const rows = await db.all(`SELECT platform,
        SUM(claimant IS NULL AND revoked = 0 AND (expires_at IS NULL OR expires_at > ?)) AS available,
        SUM(claimant IS NOT NULL) AS issued,
        SUM(claimant IS NULL AND revoked = 1) AS revoked,
        SUM(claimant IS NULL AND revoked = 0 AND expires_at IS NOT NULL AND expires_at <= ?) AS expired,
        COUNT(*) AS total
      FROM codes GROUP BY platform`, [now, now]);
    return PLATFORMS.map((p) => {
      const r = rows.find((x) => x.platform === p) ?? {};
      return { platform: p, available: r.available ?? 0, issued: r.issued ?? 0, revoked: r.revoked ?? 0, expired: r.expired ?? 0, total: r.total ?? 0 };
    });
  }

  async function importCodes(body, actor) {
    const platform = platformValue(body.platform);
    const batch = text(body.batch, 'batch', 64);
    const expiresAt = expiryValue(body.expires_at);
    const submitted = parseCodes(body.codes);
    const unique = [...new Set(submitted)];
    if (!unique.length) throw new ApiError(400, 'no codes given');
    const addedAt = nowSeconds();
    let inserted = 0;
    let done = 0;
    for (const chunk of chunkRows(unique, 5)) {
      const values = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const params = chunk.flatMap((code) => [platform, code, batch, expiresAt, addedAt]);
      try {
        const rows = await db.all(`INSERT INTO codes (platform, code, batch, expires_at, added_at) VALUES ${values}
          ON CONFLICT (platform, code) DO NOTHING RETURNING id`, params);
        inserted += rows.length;
      } catch (e) {
        log(`${actor} import stopped after ${done} of ${unique.length} ${platform} codes: ${e.message}`);
        throw new ApiError(502, `import stopped after ${done} of ${unique.length} codes (${inserted} new). `
          + 'Codes already stored are skipped, so it is safe to import the same list again.', { inserted, processed: done, error: e.message });
      }
      done += chunk.length;
    }
    const result = { platform, batch, submitted: submitted.length, inserted, duplicates: submitted.length - inserted };
    log(`${actor} imported ${inserted} ${platform} codes (batch ${batch || '-'}, ${result.duplicates} duplicates)`);
    return result;
  }

  async function revokeCodes(body, actor) {
    const platform = platformValue(body.platform);
    const codes = [...new Set(parseCodes(body.codes))];
    if (!codes.length) throw new ApiError(400, 'no codes given');
    let revoked = 0;
    for (const chunk of chunkRows(codes, 1).length ? chunkRows(codes, 1) : []) {
      const meta = await db.run(`UPDATE codes SET revoked = 1 WHERE revoked = 0 AND platform = ? AND code IN (${chunk.map(() => '?').join(', ')})`,
        [platform, ...chunk].slice(0, 100));
      revoked += meta.changes ?? 0;
    }
    log(`${actor} revoked ${revoked} ${platform} codes`);
    return { platform, submitted: codes.length, revoked };
  }

  async function claims(query) {
    const campaign = query.campaign ? String(query.campaign) : null;
    const rows = await db.all(`SELECT campaign_id AS campaign, platform, code, email, claimant AS google_account, claimed_at
      FROM codes WHERE claimant IS NOT NULL ${campaign ? 'AND campaign_id = ?' : ''} ORDER BY claimed_at DESC, id DESC`,
    campaign ? [campaign] : []);
    return rows.map((r) => ({ ...r, claimed: iso(r.claimed_at) }));
  }

  const CLAIM_COLUMNS = ['campaign', 'platform', 'code', 'email', 'google_account', 'claimed'];

  return async function api({ method, path, query = {}, body = {}, actor = '' }) {
    try {
      const campaignMatch = path.match(/^\/campaigns\/([a-z0-9-]{1,64})$/);
      if (path === '/campaigns' && method === 'GET') return ok(await listCampaigns());
      if (path === '/campaigns' && method === 'POST') return ok(await createCampaign(body, actor), 201);
      if (campaignMatch && method === 'PATCH') return ok(await updateCampaign(campaignMatch[1], body, actor));
      if (path === '/stats' && method === 'GET') return ok(await stats());
      if (path === '/codes/import' && method === 'POST') return ok(await importCodes(body, actor));
      if (path === '/codes/revoke' && method === 'POST') return ok(await revokeCodes(body, actor));
      if (path === '/claims' && method === 'GET') return ok(await claims(query));
      if (path === '/claims.csv' && method === 'GET') {
        const name = `giveaway-claims-${query.campaign ? String(query.campaign).replace(/[^a-z0-9-]/g, '') : 'all'}.csv`;
        return {
          status: 200,
          headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"` },
          body: toCsv(await claims(query), CLAIM_COLUMNS),
        };
      }
      return ok({ error: 'not found' }, 404);
    } catch (e) {
      if (e instanceof ApiError) return ok({ error: e.message, ...e.extra }, e.status);
      return ok({ error: e.message }, 502);
    }
  };
}