import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchOpenRouterModels, compileLiveOpenRouter, replaceCatalogSource, fetchLiveFx } from "../live-pricing.js";

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => body });

test("OpenRouter pagination is complete before a live namespace can be compiled", async () => {
  const pages = new Map([
    ["https://openrouter.ai/api/v1/models", JSON.stringify({ data: [{ id: "vendor/a", name: "A", pricing: { prompt: "0.1" } }], total_count: 2, links: { next: "/api/v1/models?page=2" } })],
    ["https://openrouter.ai/api/v1/models?page=2", JSON.stringify({ data: [{ id: "vendor/b", name: "B", pricing: { prompt: "0.2" } }], total_count: 2, links: { next: null } })],
  ]);
  const result = await fetchOpenRouterModels({ fetchImpl: async (url) => response(pages.get(url)) });
  const live = compileLiveOpenRouter(result, { fetchedAt: Date.parse("2026-09-04T12:00:00Z") });
  assert.deepEqual(Object.keys(live.offers), ["openrouter:vendor/a", "openrouter:vendor/b"]);
  assert.equal(live.source.integrity, "complete-transport");
  assert.equal(live.source.record_count, 2);
});

test("truncated pagination rejects without producing a replacement", async () => {
  await assert.rejects(
    fetchOpenRouterModels({ fetchImpl: async () => response(JSON.stringify({ data: [{ id: "vendor/a" }], total_count: 2, links: { next: null } })) }),
    /partial catalog/,
  );
});

test("atomic replacement preserves every unrelated source and removes old OpenRouter rows", () => {
  const manifest = { sources: { openrouter: { status: "expired" }, litellm: { status: "fresh" } }, models: [{ id: "openrouter:old" }, { id: "litellm:keep" }] };
  const catalog = { offers: { "openrouter:old": { offer_id: "openrouter:old" }, "litellm:keep": { offer_id: "litellm:keep" } }, offers_state: [{ offer_id: "openrouter:old" }, { offer_id: "litellm:keep" }] };
  const live = compileLiveOpenRouter({ models: [{ id: "new", name: "New", pricing: { prompt: "0.1" } }], pages: 1 }, { fetchedAt: 0 });
  const replaced = replaceCatalogSource(manifest, catalog, live);
  assert.deepEqual(Object.keys(replaced.catalog.offers).sort(), ["litellm:keep", "openrouter:new"]);
  assert.equal(replaced.manifest.sources.litellm.status, "fresh");
  assert.equal(manifest.models[0].id, "openrouter:old", "input remains unchanged");
});

test("live FX keeps both ECB decimal legs instead of a rounded cross-rate", async () => {
  const fx = await fetchLiveFx({ fetchImpl: async () => response(JSON.stringify({ amount: 1, base: "EUR", date: "2026-09-04", rates: { USD: 1.1622, THB: 38.26 } })) });
  assert.equal(fx.eur_usd, "1.1622");
  assert.equal(fx.eur_thb, "38.26");
  assert.equal(fx.rate.toString(), "191300/5811");
});
