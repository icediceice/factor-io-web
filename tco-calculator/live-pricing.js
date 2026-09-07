// live-pricing.js — browser-safe, all-or-nothing live source refresh.
// A source is compiled in isolation and becomes visible only after pagination,
// schema, duplicate and count checks pass. The caller keeps its snapshot on any
// thrown error; this module never mutates the supplied manifest or catalog.
import { parseJSONExact } from "./exact.js";
import { compileOpenRouterModel } from "./pricing.js";
import { normalizeFxDocument } from "./currency.js";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
export const FRANKFURTER_FX_URL = "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD%2CTHB";

function fxExpiry(date, days = 7) {
  const expires = new Date(`${date}T23:59:59.999Z`);
  if (!Number.isFinite(expires.getTime())) return "";
  expires.setUTCDate(expires.getUTCDate() + days);
  return expires.toISOString();
}

function safeCount(value) {
  const candidate = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : null;
}

function linkAbort(parent, controller) {
  if (!parent) return () => {};
  if (parent.aborted) controller.abort(parent.reason);
  const abort = () => controller.abort(parent.reason);
  parent.addEventListener?.("abort", abort, { once: true });
  return () => parent.removeEventListener?.("abort", abort);
}

async function fetchText(url, { fetchImpl, signal, timeoutMs, headers = {} }) {
  const controller = new AbortController();
  const unlink = linkAbort(signal, controller);
  const timeout = setTimeout(() => controller.abort(new DOMException("Timed out", "AbortError")), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers });
    if (!response?.ok) throw new Error(`${new URL(url).hostname} HTTP ${response?.status ?? "unknown"}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
    unlink();
  }
}

export async function fetchOpenRouterModels({
  fetchImpl = globalThis.fetch,
  signal = null,
  timeoutMs = 10000,
  maxPages = 100,
  maxModels = 10000,
  startUrl = OPENROUTER_MODELS_URL,
  headers = { accept: "application/json" },
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
  const root = new URL(startUrl);
  const models = [];
  let expected = null;
  let url = root.toString();
  let pages = 0;
  while (url) {
    if (++pages > maxPages) throw new Error(`openrouter pagination exceeded ${maxPages} pages`);
    const pageUrl = new URL(url);
    if (pageUrl.origin !== root.origin) throw new Error("openrouter pagination changed origin");
    const page = parseJSONExact(await fetchText(pageUrl.toString(), { fetchImpl, signal, timeoutMs, headers }));
    if (!page || !Array.isArray(page.data)) throw new Error("openrouter returned an unexpected envelope");
    if (expected === null) expected = safeCount(page.total_count);
    models.push(...page.data);
    if (models.length > maxModels) throw new Error(`openrouter catalog exceeded ${maxModels} models`);
    url = page.links?.next ? new URL(String(page.links.next), pageUrl).toString() : null;
  }
  if (expected !== null && models.length !== expected) {
    throw new Error(`openrouter returned a partial catalog (${models.length} of ${expected})`);
  }
  return { models, pages, total_count: expected ?? models.length };
}

export function compileLiveOpenRouter(result, { fetchedAt = Date.now() } = {}) {
  if (!result || !Array.isArray(result.models)) throw new TypeError("A complete OpenRouter result is required");
  const offers = {};
  const models = [];
  for (const model of result.models) {
    if (!model || typeof model !== "object" || Array.isArray(model) || typeof model.id !== "string" || !model.id) {
      throw new Error("openrouter model is missing a stable id");
    }
    if (model.alias_target) continue;
    const offer = compileOpenRouterModel(model);
    if (offers[offer.offer_id]) throw new Error(`openrouter duplicate offer ${offer.offer_id}`);
    offer.state = "active";
    offer.missing_streak = 0;
    offers[offer.offer_id] = offer;
    if (offer.tariff !== "none") {
      models.push({ id: offer.offer_id, name: offer.display_name, tariff: offer.tariff, state: "active", meters: Object.keys(offer.prices) });
    }
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  const observed = new Date(fetchedAt).toISOString();
  return Object.freeze({
    offers,
    models,
    source: Object.freeze({
      source_id: "openrouter",
      status: "fresh",
      observed_at: observed,
      last_success_at: observed,
      expires_at: new Date(fetchedAt + 3 * 86400000).toISOString(),
      record_count: models.length,
      origin: "live",
      integrity: "complete-transport",
      pages: result.pages,
    }),
  });
}

export function replaceCatalogSource(manifest, catalog, live, sourceId = "openrouter") {
  if (!manifest || !catalog || !live?.source || live.source.source_id !== sourceId) throw new TypeError("A matching complete live source is required");
  const prefix = `${sourceId}:`;
  const keptOffers = Object.fromEntries(Object.entries(catalog.offers ?? {}).filter(([id]) => !id.startsWith(prefix)));
  const keptState = (catalog.offers_state ?? []).filter((row) => !String(row.offer_id).startsWith(prefix));
  const liveState = Object.keys(live.offers).map((offer_id) => ({ offer_id, state: "active", missing_streak: 0 }));
  return {
    manifest: {
      ...manifest,
      sources: { ...(manifest.sources ?? {}), [sourceId]: live.source },
      models: [...(manifest.models ?? []).filter((row) => !String(row.id).startsWith(prefix)), ...live.models]
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
    },
    catalog: { ...catalog, offers: { ...keptOffers, ...live.offers }, offers_state: [...keptState, ...liveState] },
  };
}

export async function fetchLiveFx({ fetchImpl = globalThis.fetch, signal = null, timeoutMs = 6000, url = FRANKFURTER_FX_URL } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
  const payload = parseJSONExact(await fetchText(url, { fetchImpl, signal, timeoutMs, headers: { accept: "application/json" } }));
  if (payload?.base !== "EUR" || !payload?.rates || payload.rates.USD == null || payload.rates.THB == null) {
    throw new Error("FX source returned an unexpected EUR/USD/THB envelope");
  }
  const date = String(payload.date ?? "");
  return normalizeFxDocument({
    schema: "factor-io.fx/1.0.0",
    source_id: "ecb",
    source_url: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/",
    retrieved_via: new URL(url).origin,
    observed_at: date,
    expires_at: fxExpiry(date),
    eur_usd: String(payload.rates.USD),
    eur_thb: String(payload.rates.THB),
    integrity: "complete-transport",
  });
}
