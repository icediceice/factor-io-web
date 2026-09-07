#!/usr/bin/env node
// Fetch the official ECB daily XML and write the exact EUR/USD + EUR/THB legs.
// The cross-rate is intentionally not precomputed or rounded.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FX_PATH = `${ROOT}tco-calculator/data/fx.json`;
const MANIFEST_PATH = `${ROOT}tco-calculator/data/manifest.json`;
const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

function attr(text, name) {
  return new RegExp(`${name}=['\"]([^'\"]+)['\"]`).exec(text)?.[1] ?? null;
}

export function parseEcbDailyXml(xml, { ttlDays = 7 } = {}) {
  const day = /<Cube\s+time=['\"][^'\"]+['\"][^>]*>([\s\S]*?)<\/Cube>/.exec(String(xml));
  if (!day) throw new Error("ECB daily XML has no dated rate block");
  const observed = attr(day[0], "time");
  const rates = {};
  for (const match of day[1].matchAll(/<Cube\s+currency=['\"]([A-Z]{3})['\"]\s+rate=['\"]([^'\"]+)['\"]\s*\/>/g)) rates[match[1]] = match[2];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observed ?? "") || !rates.USD || !rates.THB) throw new Error("ECB daily XML is missing USD or THB");
  const expires = new Date(`${observed}T23:59:59.999Z`);
  expires.setUTCDate(expires.getUTCDate() + ttlDays);
  return {
    schema: "factor-io.fx/1.0.0",
    source_id: "ecb",
    source_url: ECB_URL,
    retrieved_via: ECB_URL,
    observed_at: observed,
    expires_at: expires.toISOString(),
    eur_usd: rates.USD,
    eur_thb: rates.THB,
    integrity: "digest-pinned",
  };
}

export function pinFxInManifest(manifest, fxText, fx) {
  const digest = createHash("sha256").update(fxText).digest("hex").slice(0, 16);
  return {
    ...manifest,
    resources: { ...(manifest.resources ?? {}), fx: { kind: "external", path: "fx.json", digest, bytes: Buffer.byteLength(fxText) } },
    sources: {
      ...(manifest.sources ?? {}),
      fx: {
        source_id: "fx",
        status: "fresh",
        observed_at: `${fx.observed_at}T00:00:00.000Z`,
        last_success_at: new Date().toISOString(),
        expires_at: fx.expires_at,
        root_digest: digest,
        record_count: 1,
        origin: "snapshot",
        integrity: "digest-pinned",
      },
    },
  };
}

async function main() {
  const response = await fetch(ECB_URL, { headers: { accept: "application/xml" } });
  if (!response.ok) throw new Error(`ECB FX HTTP ${response.status}`);
  const fx = parseEcbDailyXml(await response.text());
  const fxText = `${JSON.stringify(fx, null, 2)}\n`;
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const nextManifest = pinFxInManifest(manifest, fxText, fx);
  await writeFile(FX_PATH, fxText);
  await writeFile(MANIFEST_PATH, `${JSON.stringify(nextManifest, null, 2)}\n`);
  console.log(JSON.stringify({ observed_at: fx.observed_at, eur_usd: fx.eur_usd, eur_thb: fx.eur_thb, digest: nextManifest.resources.fx.digest }));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error); process.exit(1); });
