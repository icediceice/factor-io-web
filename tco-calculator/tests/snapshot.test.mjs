import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { parseJSONExact } from "../exact.js";
import { sourceVerdict, staleBanner, newestObservedAt } from "../pricing.js";
import { buildSnapshot } from "../../scripts/build-snapshot.mjs";

const T0 = Date.parse("2026-09-01T09:00:00Z");
const DAY = 86400000;

const feed = (ids, extra = {}) => ({
  ok: true,
  value: {
    "vendor/alpha": { litellm_provider: "vendor", mode: "chat", input_cost_per_token: "0.000001", output_cost_per_token: "0.000002", ...extra },
    ...ids,
  },
});
const okFeeds = () => ({ openrouter: { ok: true, value: [] }, litellm: { ok: true, value: {
  "vendor/alpha": { litellm_provider: "vendor", mode: "chat", input_cost_per_token: "0.000001", output_cost_per_token: "0.000002" },
  "vendor/beta": { litellm_provider: "vendor", mode: "chat", input_cost_per_token: "0.000003", output_cost_per_token: "0.000004" },
} } });

// F5 — stale envelope surfaces: consumed source past expires_at -> banner payload.
test("F5: source past expires_at renders a STALE PRICING banner payload naming the source", () => {
  const sources = {
    litellm: { source_id: "litellm", status: "fresh", observed_at: new Date(T0 - 10 * DAY).toISOString(), expires_at: new Date(T0 - 7 * DAY).toISOString() },
    openrouter: { source_id: "openrouter", status: "fresh", observed_at: new Date(T0 - 0.1 * DAY).toISOString(), expires_at: new Date(T0 + 2.9 * DAY).toISOString() },
  };
  const banner = staleBanner(sources, T0);
  assert.ok(banner);
  assert.equal(banner.level, "STALE PRICING");
  assert.deepEqual(banner.sources.map((s) => s.source_id), ["litellm"]);
  assert.equal(newestObservedAt(sources, T0), new Date(T0 - 0.1 * DAY).toISOString());
  // Everything inside its envelope -> no banner.
  assert.equal(staleBanner({ openrouter: sources.openrouter }, T0), null);
});

// F6 — commit time is not freshness: data age wins over a recent commit.
test("F6: recent commit_at with expired observed_at still reads expired", () => {
  const source = {
    source_id: "litellm",
    status: "fresh",
    observed_at: new Date(T0 - 30 * DAY).toISOString(),
    expires_at: new Date(T0 - 27 * DAY).toISOString(),
    commit_at: new Date(T0 - 3600 * 1000).toISOString(), // commit one hour ago — NOT evidence
  };
  assert.equal(sourceVerdict(source, T0), "expired");
  // A fresh-age source is fresh regardless of an old commit timestamp.
  const youngData = { ...source, observed_at: new Date(T0 - 0.1 * DAY).toISOString(), expires_at: new Date(T0 + 2.9 * DAY).toISOString(), commit_at: new Date(T0 - 90 * DAY).toISOString() };
  assert.equal(sourceVerdict(youngData, T0), "fresh");
  // Error sources are errors; malformed envelopes are errors too (fail loudly).
  assert.equal(sourceVerdict({ ...source, status: "error" }, T0), "error");
  assert.equal(sourceVerdict({ source_id: "x" }, T0), "error");
});

// Stateful builder contract (peer review fix #3).
test("builder distinguishes first omission from third via previousManifest", () => {
  const r1 = buildSnapshot({ refreshId: "r1", fetchedAt: T0, feeds: okFeeds() });
  const ids1 = Object.fromEntries(r1.catalog.offers_state.map((o) => [o.offer_id, o]));
  assert.equal(ids1["litellm:vendor/alpha"].state, "active");

  // Second refresh: vendor/beta vanished -> suspect_missing, streak 1.
  const feeds2 = okFeeds();
  delete feeds2.litellm.value["vendor/beta"];
  const r2 = buildSnapshot({ previousManifest: r1.manifest, previousCatalog: r1.catalog, refreshId: "r2", fetchedAt: T0 + DAY, feeds: feeds2 });
  const ids2 = Object.fromEntries(r2.catalog.offers_state.map((o) => [o.offer_id, o]));
  assert.equal(ids2["litellm:vendor/beta"].state, "suspect_missing");
  assert.equal(ids2["litellm:vendor/beta"].missing_streak, 1);
  assert.equal(ids2["litellm:vendor/alpha"].state, "active");

  // Fourth refresh: beta absent three consecutive times -> retired.
  const r3 = buildSnapshot({ previousManifest: r2.manifest, previousCatalog: r2.catalog, refreshId: "r3", fetchedAt: T0 + 2 * DAY, feeds: feeds2 });
  const r4 = buildSnapshot({ previousManifest: r3.manifest, previousCatalog: r3.catalog, refreshId: "r4", fetchedAt: T0 + 3 * DAY, feeds: feeds2 });
  const ids4 = Object.fromEntries(r4.catalog.offers_state.map((o) => [o.offer_id, o]));
  assert.equal(ids4["litellm:vendor/beta"].state, "retired");
  assert.equal(ids4["litellm:vendor/beta"].missing_streak, 3);

  // Reappearance after suspect_missing revives to active; retired does NOT self-revive.
  const r5 = buildSnapshot({ previousManifest: r4.manifest, previousCatalog: r4.catalog, refreshId: "r5", fetchedAt: T0 + 4 * DAY, feeds: okFeeds() });
  const ids5 = Object.fromEntries(r5.catalog.offers_state.map((o) => [o.offer_id, o]));
  assert.equal(ids5["litellm:vendor/beta"].state, "retired"); // retired requires explicit re-admission
});

test("failed source reuses last good resource, preserves last_success_at, fabricates nothing", () => {
  const r1 = buildSnapshot({ refreshId: "r1", fetchedAt: T0, feeds: okFeeds() });
  const feeds2 = { openrouter: okFeeds().openrouter, litellm: { ok: false, error: new Error("HTTP 503") } };
  const r2 = buildSnapshot({ previousManifest: r1.manifest, previousCatalog: r1.catalog, refreshId: "r2", fetchedAt: T0 + DAY, feeds: feeds2 });
  const s1 = r1.manifest.sources.litellm;
  const s2 = r2.manifest.sources.litellm;
  assert.equal(s2.status, "error");
  assert.equal(s2.observed_at, s1.observed_at, "observed_at must not advance on failure");
  assert.equal(s2.last_success_at, s1.last_success_at, "last_success_at preserved");
  assert.equal(s2.root_digest, s1.root_digest, "last good resource digest preserved");
  assert.equal(s2.record_count, s1.record_count);
  assert.equal(s2.missing_streak, 1);
  // The failed source's offers still carried over from the previous snapshot state.
  assert.ok(r2.catalog.offers_state.some((o) => o.offer_id === "litellm:vendor/alpha" && o.state === "suspect_missing"));
});

test("expiration_date retires an offer directly at build time", () => {
  const feeds = okFeeds();
  feeds.litellm.value["vendor/old"] = { litellm_provider: "vendor", mode: "chat", input_cost_per_token: "0.000001", output_cost_per_token: "0.000002" };
  // OpenRouter carries expiration_date; emulate via an OpenRouter model entry.
  feeds.openrouter = { ok: true, value: [{ id: "x/sunset", canonical_slug: "x/sunset", name: "Sunset", expiration_date: "2026-08-01", pricing: { prompt: "0.000001", completion: "0.000002" } }] };
  const r = buildSnapshot({ refreshId: "r", fetchedAt: T0, feeds });
  const ids = Object.fromEntries(r.catalog.offers_state.map((o) => [o.offer_id, o]));
  assert.equal(ids["openrouter:x/sunset"].state, "retired");
});

test("manifest ResourceRef points at content-addressed catalog; bytes verify", () => {
  const r = buildSnapshot({ refreshId: "r", fetchedAt: T0, feeds: okFeeds() });
  const ref = r.manifest.resources.catalog;
  assert.equal(ref.kind, "external");
  assert.match(ref.path, /^catalog-[0-9a-f]{16}\.json$/);
  assert.equal(createHash("sha256").update(r.catalogBytes).digest("hex").slice(0, 16), ref.digest);
  assert.equal(ref.bytes, r.catalogBytes.length);
  // Model index is canonically sorted (SPEC 10.1 determinism).
  const ids = r.manifest.models.map((m) => m.id);
  assert.deepEqual([...ids].sort(), ids);
});

test("determinism: same feeds + same previous + same instant -> byte-identical output", () => {
  const a = buildSnapshot({ refreshId: "r", fetchedAt: T0, feeds: okFeeds() });
  const b = buildSnapshot({ refreshId: "r", fetchedAt: T0, feeds: okFeeds() });
  assert.equal(JSON.stringify(a.manifest), JSON.stringify(b.manifest));
  assert.equal(Buffer.compare(a.catalogBytes, b.catalogBytes), 0);
  // A different fetch instant changes generated_at — outputs differ.
  const c = buildSnapshot({ refreshId: "r", fetchedAt: T0 + 1, feeds: okFeeds() });
  assert.notEqual(JSON.stringify(a.manifest), JSON.stringify(c.manifest));
});

// Byte budget (SPEC 9.2) against the REAL frozen feeds.
test("real-feeds snapshot fits the payload budget: manifest <= 64KB compressed", () => {
  const SAMPLES = fileURLToPath(new URL("./samples/", import.meta.url));
  const feeds = {
    openrouter: { ok: true, value: JSON.parse(readFileSync(`${SAMPLES}openrouter-models.json`, "utf8")) },
    litellm: { ok: true, value: parseJSONExact(readFileSync(`${SAMPLES}litellm-cost-map.json`, "utf8")) },
  };
  const r = buildSnapshot({ refreshId: "budget", fetchedAt: T0, feeds });
  const manifestGz = gzipSync(Buffer.from(JSON.stringify(r.manifest))).length;
  const catalogGz = gzipSync(r.catalogBytes).length;
  assert.ok(manifestGz <= 65536, `manifest gzip ${manifestGz} exceeds 64KB`);
  assert.ok(catalogGz <= 262144, `catalog gzip ${catalogGz} exceeds 256KB (sharding trigger)`);
  const chatOffers = Object.values(r.catalog.offers).filter((o) => o.tariff === "token").length;
  assert.ok(chatOffers > 300, `expected a real catalog, got ${chatOffers}`);
});