import { test } from "node:test";
import assert from "node:assert/strict";
import { formatHalfUp } from "../exact.js";
import { normalizeFxDocument, fxRate, toTHB, toUSD, fxProvenance } from "../currency.js";
import { parseEcbDailyXml, pinFxInManifest } from "../../scripts/build-fx.mjs";

const ECB = {
  source_id: "ecb",
  observed_at: "2026-09-04",
  expires_at: "2026-09-11T23:59:59.999Z",
  eur_usd: "1.1622",
  eur_thb: "38.26",
};

test("ECB cross rate remains an exact rational and reproduces a round trip", () => {
  const fx = normalizeFxDocument(ECB, { integrity: "digest-pinned" });
  assert.equal(fxRate(fx).toString(), "191300/5811");
  assert.equal(toUSD(toTHB("123.456", fx), fx).toString(), "15432/125");
  assert.equal(formatHalfUp(toTHB("100", fx), 2), "3292.03");
});

test("direct live rate is exact and provenance publishes a reproducible formula", () => {
  const fx = normalizeFxDocument({ source_id: "mirror", observed_at: "2026-09-04", usd_thb: "32.92" });
  assert.equal(fxRate(fx).toString(), "823/25");
  assert.deepEqual(fxProvenance(fx).source_legs, { usd_thb: "32.92" });
  assert.equal(fxProvenance(fx).formula, "THB = USD × usd_thb");
});

test("invalid and implausible FX values are rejected before they touch money", () => {
  assert.throws(() => normalizeFxDocument({ observed_at: "not-a-date", usd_thb: "32" }), /ISO/);
  assert.throws(() => normalizeFxDocument({ observed_at: "2026-09-04", usd_thb: "3.2" }), /sanity/);
  assert.throws(() => normalizeFxDocument({ observed_at: "2026-09-04", eur_usd: "1.1" }), /both/);
});

test("ECB builder preserves source decimals and pins the exact file bytes", () => {
  const xml = `<Envelope><Cube><Cube time='2026-09-04'><Cube currency='USD' rate='1.1622'/><Cube currency='THB' rate='38.26'/></Cube></Cube></Envelope>`;
  const fx = parseEcbDailyXml(xml);
  const text = `${JSON.stringify(fx, null, 2)}\n`;
  const manifest = pinFxInManifest({ resources: {}, sources: {} }, text, fx);
  assert.equal(fx.eur_usd, "1.1622");
  assert.equal(fx.eur_thb, "38.26");
  assert.equal(manifest.resources.fx.path, "fx.json");
  assert.match(manifest.resources.fx.digest, /^[0-9a-f]{16}$/);
  assert.equal(manifest.sources.fx.integrity, "digest-pinned");
});
