// giveaway/lib/d1.mjs — the Worker's D1 database, reached through the Cloudflare
// REST API (POST /accounts/{account}/d1/database/{id}/query, body {sql, params}).
//
// A reply counts as success only when the HTTP status, the envelope's `success` AND
// every per-statement `success` all say so. D1 binds at most 100 parameters per
// query, so bulk inserts are chunked by placeholder count.

export const MAX_PARAMS = 100;
const API = 'https://api.cloudflare.com/client/v4';

export class D1Error extends Error {}

export function createD1({ accountId, databaseId, apiToken, fetchImpl = (...a) => fetch(...a) }) {
  const url = `${API}/accounts/${accountId}/d1/database/${databaseId}/query`;

  async function query(sql, params = []) {
    if (params.length > MAX_PARAMS) throw new D1Error(`query binds ${params.length} parameters (max ${MAX_PARAMS})`);
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sql, params }),
      });
    } catch (e) {
      throw new D1Error(`D1 unreachable: ${e.message}`);
    }
    let body;
    try {
      body = await res.json();
    } catch {
      throw new D1Error(`D1 HTTP ${res.status}: not JSON`);
    }
    const errors = (body?.errors ?? []).map((e) => e.message ?? String(e)).join('; ');
    if (!res.ok || body?.success !== true) throw new D1Error(`D1 HTTP ${res.status}: ${errors || 'request failed'}`);
    const results = body.result;
    if (!Array.isArray(results) || results.length === 0 || results.some((r) => r?.success !== true)) {
      throw new D1Error(`D1 statement failed: ${errors || JSON.stringify(results?.find((r) => r?.success !== true) ?? null)}`);
    }
    return results[results.length - 1];
  }

  return {
    async all(sql, params) {
      return (await query(sql, params)).results ?? [];
    },
    async first(sql, params) {
      return (await query(sql, params)).results?.[0] ?? null;
    },
    async run(sql, params) {
      return (await query(sql, params)).meta ?? {};
    },
  };
}

/** Rows per statement so that rows * paramsPerRow <= MAX_PARAMS. */
export function chunkRows(rows, paramsPerRow) {
  const size = Math.max(1, Math.floor(MAX_PARAMS / paramsPerRow));
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}