#!/usr/bin/env node
// build-gpu-pricing.mjs — the rented-GPU price registry (SPEC v0.2 §5.7).
//
// v0.1 hand-entered three GPU rates carrying an unresolved conflict ($55.04 vs
// $98.32 for the same 8xH100 node) and shipped them [ASSUMED]. This builder
// replaces that with a generated registry in which every row declares WHERE it
// came from and HOW MUCH AUTHORITY it has. Two tiers, and nothing in between:
//
//   first_party — the vendor's own price list, no credential required.
//                 VERIFIED at the endpoint 2026-08-29.
//   indicative  — a public aggregator, because the vendor's own API is
//                 credential-gated. Order-of-magnitude planning figure. Says so.
//
// An aggregator number is NEVER promoted to first_party because it happens to
// agree with one. Promotion changes the tier field only, and only when the row
// is actually re-fetched from the vendor.
//
// WHY GCP IS NOT first_party: cloudbilling.googleapis.com/v1/services returns
//   403 "Method doesn't allow unregistered callers (callers without established
//   identity). Please use API Key or other form of API consumer identity."
// checked 2026-08-29. Alibaba/Tencent/Huawei require signed AccessKey auth.
// Putting them in the first_party lane would be a lie about provenance, so they
// ride the aggregator with their tier stated at every point of use.
//
// Run: node scripts/build-gpu-pricing.mjs      (Node >= 20, no deps)
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseJSONExact } from "../tco-calculator/exact.js";

const UA = "factor-io-tco-ingestion/1.0 (static-site pricing snapshot; contact admin@factor-io.com)";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_DIR = `${ROOT}tco-calculator/data/`;
const OUT_PATH = `${DATA_DIR}gpu-pricing.json`;

// ---------------------------------------------------------------- shape guard
// A silently-empty provider list ships a calculator with no GPU prices, which is
// strictly worse than a loud failure: the page still renders, still computes,
// and every rented-GPU number is quietly wrong. So every parse asserts its shape
// and throws WITH WHAT IT ACTUALLY SAW — a bare "assertion failed" would send the
// next maintainer back to a browser to rediscover the feed by hand.
class ShapeError extends Error {
  constructor(source, expected, observed) {
    super(`${source}: shape assertion failed — expected ${expected}; observed ${observed}`);
    this.name = "ShapeError";
    this.source = source;
  }
}
const describe = (v) => {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `array(${v.length})${v.length ? ` first-keys=[${Object.keys(v[0] ?? {}).slice(0, 12).join(",")}]` : ""}`;
  if (typeof v === "object") return `object keys=[${Object.keys(v).slice(0, 12).join(",")}]`;
  return `${typeof v} ${JSON.stringify(v).slice(0, 80)}`;
};
function mustShape(condition, source, expected, observed) {
  if (!condition) throw new ShapeError(source, expected, describe(observed));
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json,text/html" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

// ------------------------------------------------------------- GPU identity
// One canonical id per accelerator so AWS "p5.48xlarge", Azure "ND96isr_H100_v5"
// and an aggregator's "Nvidia H100" all reduce to the same comparable row.
// vram_gb is the sizing-relevant figure; it is spec, not a price, so it is fixed.
const GPU = {
  h100: { id: "h100", label: "NVIDIA H100 80GB", vram_gb: 80 },
  h200: { id: "h200", label: "NVIDIA H200 141GB", vram_gb: 141 },
  b200: { id: "b200", label: "NVIDIA B200 180GB", vram_gb: 180 },
  a100_80: { id: "a100_80", label: "NVIDIA A100 80GB", vram_gb: 80 },
  a100_40: { id: "a100_40", label: "NVIDIA A100 40GB", vram_gb: 40 },
  l40s: { id: "l40s", label: "NVIDIA L40S 48GB", vram_gb: 48 },
  l4: { id: "l4", label: "NVIDIA L4 24GB", vram_gb: 24 },
  a10g: { id: "a10g", label: "NVIDIA A10G 24GB", vram_gb: 24 },
  h20: { id: "h20", label: "NVIDIA H20 96GB", vram_gb: 96 },
  a800: { id: "a800", label: "NVIDIA A800 80GB", vram_gb: 80 },
};

// SKU -> accelerator mapping. Hand-maintained because no feed states it: the
// price lists say "p5.48xlarge", never "8x H100". Wrong entries here misprice a
// whole provider, so each carries the GPU COUNT it is divided by.
const AWS_SKUS = {
  "p5.48xlarge": { gpu: GPU.h100, count: 8 },
  "p5e.48xlarge": { gpu: GPU.h200, count: 8 },
  "p5en.48xlarge": { gpu: GPU.h200, count: 8 },
  "p6-b200.48xlarge": { gpu: GPU.b200, count: 8 },
  "p4d.24xlarge": { gpu: GPU.a100_40, count: 8 },
  "p4de.24xlarge": { gpu: GPU.a100_80, count: 8 },
  "g6e.48xlarge": { gpu: GPU.l40s, count: 8 },
  "g6e.12xlarge": { gpu: GPU.l40s, count: 4 },
  "g6e.xlarge": { gpu: GPU.l40s, count: 1 },
  "g6.xlarge": { gpu: GPU.l4, count: 1 },
  "g5.48xlarge": { gpu: GPU.a10g, count: 8 },
  "g5.xlarge": { gpu: GPU.a10g, count: 1 },
};

const AZURE_SKUS = {
  ND96isr_H100_v5: { gpu: GPU.h100, count: 8 },
  ND96isr_H200_v5: { gpu: GPU.h200, count: 8 },
  ND96is_H200_v5: { gpu: GPU.h200, count: 8 },
  ND96asr_v4: { gpu: GPU.a100_40, count: 8 },
  ND96amsr_A100_v4: { gpu: GPU.a100_80, count: 8 },
  NC24ads_A100_v4: { gpu: GPU.a100_80, count: 1 },
  NC96ads_A100_v4: { gpu: GPU.a100_80, count: 4 },
  NV36ads_A10_v5: { gpu: GPU.a10g, count: 1 },
};

// ------------------------------------------------------- AWS (first_party)
// NOT the bulk Price List API: offers/v1.0/aws/AmazonEC2/current/<region>/
// index.json is multi-GB per region, which no refresh command can sanely pull.
// This is the metered-unit map the AWS pricing CALCULATOR itself reads — same
// vendor, same rates, 682KB. Verified returning live JSON 2026-08-29.
const AWS_REGIONS = {
  "us-east-1": "US East (N. Virginia)",
  "eu-west-1": "EU (Ireland)",
};
const awsUrl = (regionLabel) =>
  `https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/ec2-ondemand-without-sec-sel/${encodeURIComponent(regionLabel)}/Linux/index.json`;

async function fetchAWS(observedAt) {
  const rows = [];
  for (const [regionId, regionLabel] of Object.entries(AWS_REGIONS)) {
    const doc = parseJSONExact(await fetchText(awsUrl(regionLabel)));
    mustShape(doc && typeof doc === "object", "aws", "a JSON object", doc);
    mustShape(doc.regions && typeof doc.regions === "object", "aws", "doc.regions object", doc);

    // The map is keyed by the human region label, but AWS has changed that label
    // before ("EU (Ireland)" vs "Europe (Ireland)"), so take the sole entry
    // rather than trusting our own key to match theirs.
    const regionKeys = Object.keys(doc.regions);
    mustShape(regionKeys.length >= 1, "aws", "at least one region entry", doc.regions);
    const skuMap = doc.regions[regionKeys[0]];
    mustShape(skuMap && typeof skuMap === "object", "aws", "region -> sku map", skuMap);

    const sample = Object.values(skuMap)[0];
    mustShape(sample && typeof sample === "object", "aws", "sku entries as objects", sample);
    mustShape("price" in sample, "aws", "each sku entry to carry a price field", sample);

    let matched = 0;
    for (const entry of Object.values(skuMap)) {
      const instance = entry["Instance Type"] ?? entry.instanceType ?? null;
      if (!instance || !AWS_SKUS[instance]) continue;
      const { gpu, count } = AWS_SKUS[instance];
      const hourly = Number(entry.price);
      if (!Number.isFinite(hourly) || hourly <= 0) continue;
      matched++;
      rows.push({
        provider: "aws",
        provider_label: "AWS",
        region: regionId,
        sku: instance,
        gpu_id: gpu.id,
        gpu_label: gpu.label,
        gpu_count: count,
        vram_gb: gpu.vram_gb,
        node_hourly_usd: round6(hourly),
        gpu_hourly_usd: round6(hourly / count),
        billing: "on_demand",
        confidence: "first_party",
        source_url: awsUrl(regionLabel),
        observed_at: observedAt,
      });
    }
    mustShape(matched > 0, "aws", `at least one of the ${Object.keys(AWS_SKUS).length} mapped GPU instance types in ${regionId}`, `0 matches across ${Object.keys(skuMap).length} skus`);
  }
  return rows;
}

// ----------------------------------------------------- Azure (first_party)
// Retail Prices API. Public, unauthenticated, OData-filtered, paginated via
// NextPageLink. Verified returning live JSON 2026-08-29.
const AZURE_BASE = "https://prices.azure.com/api/retail/prices";
const AZURE_REGIONS = ["eastus", "westeurope"];

async function fetchAzure(observedAt) {
  const rows = [];
  for (const region of AZURE_REGIONS) {
    const filter = `serviceName eq 'Virtual Machines' and armRegionName eq '${region}' and priceType eq 'Consumption'`;
    let url = `${AZURE_BASE}?$filter=${encodeURIComponent(filter)}`;
    let pages = 0;
    let matched = 0;
    let scanned = 0;
    while (url) {
      const page = parseJSONExact(await fetchText(url));
      mustShape(page && Array.isArray(page.Items), "azure", "page.Items array", page);
      if (pages === 0) {
        const sample = page.Items[0];
        mustShape(sample && "armSkuName" in sample && "retailPrice" in sample, "azure", "Items[] carrying armSkuName and retailPrice", sample);
      }
      for (const item of page.Items) {
        scanned++;
        const sku = String(item.armSkuName ?? "").replace(/^Standard_/, "");
        if (!AZURE_SKUS[sku]) continue;
        // Spot and low-priority meters are separate products under the same
        // armSkuName; they are a different purchase, not a discount on this one.
        const name = String(item.skuName ?? "");
        if (/Spot|Low Priority/i.test(name)) continue;
        const hourly = Number(item.retailPrice);
        if (!Number.isFinite(hourly) || hourly <= 0) continue;
        const { gpu, count } = AZURE_SKUS[sku];
        matched++;
        rows.push({
          provider: "azure",
          provider_label: "Microsoft Azure",
          region,
          sku,
          gpu_id: gpu.id,
          gpu_label: gpu.label,
          gpu_count: count,
          vram_gb: gpu.vram_gb,
          node_hourly_usd: round6(hourly),
          gpu_hourly_usd: round6(hourly / count),
          billing: "on_demand",
          confidence: "first_party",
          source_url: `${AZURE_BASE}?$filter=${encodeURIComponent(filter)}`,
          observed_at: observedAt,
        });
      }
      url = page.NextPageLink ?? null;
      if (++pages > 40) throw new Error("azure: pagination runaway (>40 pages)");
    }
    mustShape(matched > 0, "azure", `at least one of the ${Object.keys(AZURE_SKUS).length} mapped GPU SKUs in ${region}`, `0 matches across ${scanned} scanned meters`);
  }
  return rows;
}

// ------------------------------------------------- aggregator (indicative)
// getdeploying.com publishes a per-GPU cross-provider table (73 providers, 99
// GPU models). We read the providers whose OWN API we cannot reach without a
// credential. Every row lands tagged `indicative` with this URL attached, so the
// page can say where the number came from instead of implying vendor authority.
//
// Regex over HTML is brittle BY NATURE. That is precisely why the shape
// assertion below is unconditional: when the markup moves, this throws rather
// than silently returning an empty provider list.
// PROVIDER pages, not per-GPU pages. The first cut of this read
// getdeploying.com/gpus/<model> and returned gcp/coreweave/lambda/runpod/vast
// but ZERO Chinese clouds — those pages only rank the providers stocking that
// specific accelerator, and no Chinese cloud publishes an H100/H200 rate there
// (US export controls put H20/A800-class parts in that market instead). Reading
// each PROVIDER's own page inverts that: it yields whatever catalogue the
// provider actually has, which is the only route to Alibaba.
const AGGREGATOR_PROVIDERS = [
  { key: "gcp", label: "Google Cloud", slug: "google-cloud" },
  { key: "alibaba", label: "Alibaba Cloud", slug: "alibaba-cloud" },
  { key: "runpod", label: "RunPod", slug: "runpod" },
  { key: "lambda", label: "Lambda Labs", slug: "lambda-labs" },
  { key: "vast", label: "Vast.ai", slug: "vast-ai" },
  { key: "coreweave", label: "CoreWeave", slug: "coreweave" },
];

// Aggregator GPU label -> our canonical id. Anything unlisted is SKIPPED, not
// guessed: an unrecognised accelerator priced against the wrong vram_gb would
// silently mis-size every deployment built on it.
const AGGREGATOR_GPU_ALIASES = {
  "h100": GPU.h100, "h200": GPU.h200, "b200": GPU.b200,
  "a100": GPU.a100_80, "l40s": GPU.l40s, "l4": GPU.l4,
  "a10": GPU.a10g, "a10g": GPU.a10g, "h20": GPU.h20, "a800": GPU.a800,
};

const stripTags = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");

// "Nvidia A10 24GB · 26 configs · 1x-8x On-Demand from $1.27 Reserved from $0.71"
// The 140-char bound between the model name and its rate is deliberate: a looser
// window walks into the NEXT accelerator's block and misattributes its price.
const AGG_ROW = /(?:Nvidia|NVIDIA|AMD)\s+([A-Za-z0-9]+(?:\s+[A-Za-z0-9]+)?)\s+(\d+)\s?GB[^$]{0,140}?On-Demand\s+from\s+\$\s?([0-9]+(?:\.[0-9]+)?)/g;

// Per-GPU pages, the SECOND lane. Kept alongside the provider lane because the
// two have complementary blind spots and neither alone is sufficient: measured
// 2026-08-29, provider pages yielded Alibaba but missed GCP entirely, while
// per-GPU pages yielded GCP + the neoclouds but no Chinese cloud at all. Running
// one and dropping the other trades a known gap for a different known gap.
const AGGREGATOR_GPU_PAGES = [
  { slug: "nvidia-h100", gpu: GPU.h100 },
  { slug: "nvidia-h200", gpu: GPU.h200 },
  { slug: "nvidia-a100", gpu: GPU.a100_80 },
  { slug: "nvidia-l40s", gpu: GPU.l40s },
  { slug: "nvidia-b200", gpu: GPU.b200 },
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Lower bounds on a plausible ON-DEMAND per-GPU-hour rate, in USD. These are not
// market estimates — they sit far below any real on-demand rate and exist ONLY to
// catch a misparse. A scraper that grabs the wrong dollar figure does not fail; it
// returns a confident, well-formed, wrong number, and $0.04/hr for an H100 would
// make renting look free against self-hosting. Anything under the floor is REJECTED
// and recorded in findings, never silently dropped and never rounded up.
const MIN_PLAUSIBLE_USD = {
  b200: 2.0, h200: 1.5, h100: 1.0, h20: 0.5,
  a100_80: 0.4, a100_40: 0.3, a800: 0.4,
  l40s: 0.3, l4: 0.1, a10g: 0.1,
};

function acceptRate(perGpu, gpu) {
  if (!Number.isFinite(perGpu) || perGpu <= 0 || perGpu > 200) return false;
  const floor = MIN_PLAUSIBLE_USD[gpu.id];
  return floor === undefined ? true : perGpu >= floor;
}

function mkRow({ prov, gpu, perGpu, url, observedAt }) {
  return {
    provider: prov.key,
    provider_label: prov.label,
    region: "unspecified",
    sku: `${prov.label} ${gpu.label}`,
    gpu_id: gpu.id,
    gpu_label: gpu.label,
    gpu_count: 1,
    vram_gb: gpu.vram_gb,
    node_hourly_usd: round6(perGpu),
    gpu_hourly_usd: round6(perGpu),
    billing: "on_demand",
    confidence: "indicative",
    source_url: url,
    observed_at: observedAt,
  };
}

async function fetchAggregator(observedAt) {
  const rows = [];
  const findings = { provider_pages: [], gpu_pages: [], rejected: [] };
  const seen = new Set(); // `${provider}:${gpu_id}` — first lane to land a pair wins
  let anyPageParsed = false;

  // --- lane 1: provider pages (reaches Alibaba)
  for (const prov of AGGREGATOR_PROVIDERS) {
    const url = `https://getdeploying.com/${prov.slug}`;
    let text;
    try {
      text = stripTags(await fetchText(url));
    } catch (e) {
      findings.provider_pages.push({ provider: prov.key, error: String(e.message ?? e), gpus: 0 });
      continue;
    }
    anyPageParsed = true;
    let found = 0;
    let m;
    AGG_ROW.lastIndex = 0;
    while ((m = AGG_ROW.exec(text)) !== null) {
      const gpu = AGGREGATOR_GPU_ALIASES[m[1].trim().toLowerCase().replace(/\s+/g, "")];
      if (!gpu) continue;
      const key = `${prov.key}:${gpu.id}`;
      if (seen.has(key)) continue;
      const perGpu = Number(m[3]);
      if (!acceptRate(perGpu, gpu)) {
        findings.rejected.push({ provider: prov.key, gpu: gpu.id, rate: perGpu, page: prov.slug });
        continue;
      }
      seen.add(key);
      found++;
      rows.push(mkRow({ prov, gpu, perGpu, url, observedAt }));
    }
    findings.provider_pages.push({ provider: prov.key, gpus: found });
  }

  // --- lane 2: per-GPU pages (reaches GCP + the neoclouds)
  // Anchor on the literal "On-Demand from $N" that follows a provider's heading.
  // Verified against the live page 2026-08-29: Vast.ai's H100 block reads
  // "On-Demand from $1.74 Reserved from $1.90 Spot from $0.35". An earlier
  // first-dollar-after-the-name window returned $0.04 for that same row, so the
  // "On-Demand from" literal is load-bearing rather than decoration — without it
  // the parser reports a spot or unrelated figure as an on-demand rate, and does
  // so with a perfectly well-formed number that no downstream check would catch.
  const RATE_RE = /On-Demand\s+from\s+\$\s?([0-9]+(?:\.[0-9]+)?)/i;
  for (const { slug, gpu } of AGGREGATOR_GPU_PAGES) {
    const url = `https://getdeploying.com/gpus/${slug}`;
    let text;
    try {
      text = stripTags(await fetchText(url));
    } catch (e) {
      findings.gpu_pages.push({ slug, error: String(e.message ?? e), providers: 0 });
      continue;
    }
    anyPageParsed = true;
    let found = 0;
    for (const prov of AGGREGATOR_PROVIDERS) {
      const key = `${prov.key}:${gpu.id}`;
      if (seen.has(key)) continue;
      // The provider's name also appears in the page nav and in the "which clouds
      // offer X" list, where no rate follows. Walk EVERY occurrence and keep the
      // first whose On-Demand rate falls inside that heading's own short window;
      // a window wide enough to skip a miss would reach the NEXT provider's block.
      const nameRe = new RegExp(escapeRe(prov.label), "gi");
      let perGpu = null;
      let hit;
      while ((hit = nameRe.exec(text)) !== null) {
        const m = RATE_RE.exec(text.slice(hit.index, hit.index + 220));
        if (!m) continue;
        perGpu = Number(m[1]);
        break;
      }
      if (perGpu === null) continue;
      if (!acceptRate(perGpu, gpu)) {
        findings.rejected.push({ provider: prov.key, gpu: gpu.id, rate: perGpu, page: slug });
        continue;
      }
      seen.add(key);
      found++;
      rows.push(mkRow({ prov, gpu, perGpu, url, observedAt }));
    }
    findings.gpu_pages.push({ slug, providers: found });
  }

  mustShape(anyPageParsed, "aggregator", "at least one aggregator page to fetch", JSON.stringify(findings));
  mustShape(rows.length > 0, "aggregator", "at least one GPU rate across both aggregator lanes", JSON.stringify(findings));
  return { rows, findings };
}

// --------------------------------------- Chinese clouds (indicative, seeded)
// Tencent, Huawei and Volcengine publish GPU pricing only behind signed-AccessKey
// APIs and in CNY on their China-facing consoles; no Western aggregator carries
// them (computecomparison.com/provider/tencent-cloud and /huawei-cloud both
// return empty stubs, checked 2026-08-29). Rather than drop the market the
// operator explicitly asked for, these ride a SEED file: cited, dated, and
// carrying their own re-verify date so the client can age them out.
//
// A seed row is NOT a live row and never claims to be — it renders `indicative`
// like any aggregator row, but additionally carries seeded:true and the citation
// it came from, so the UI can say "cited 2026-08-29" rather than implying a fetch.
async function loadSeed() {
  const { readFile } = await import("node:fs/promises");
  try {
    const doc = JSON.parse(await readFile(`${DATA_DIR}gpu-pricing-seed.json`, "utf8"));
    mustShape(Array.isArray(doc.rows), "seed", "rows array", doc);
    return doc.rows.map((r) => ({ ...r, confidence: "indicative", seeded: true }));
  } catch (e) {
    if (e instanceof ShapeError) throw e;
    return []; // absent seed is legitimate — the live lanes still stand alone
  }
}

// Round to 6dp as a NUMBER only at the boundary. The engine re-parses these as
// exact decimal strings (exact.js); this is presentation of the fetched value,
// not arithmetic on it.
function round6(n) {
  return Number(n.toFixed(6));
}

// ------------------------------------------------------------------- build
export async function buildGpuPricing({ observedAt, sources }) {
  const rows = [...sources.aws, ...sources.azure, ...sources.aggregator, ...(sources.seed ?? [])];
  rows.sort((a, b) =>
    a.provider < b.provider ? -1 : a.provider > b.provider ? 1
      : a.gpu_id < b.gpu_id ? -1 : a.gpu_id > b.gpu_id ? 1
        : a.region < b.region ? -1 : a.region > b.region ? 1 : 0);

  const byProvider = {};
  for (const r of rows) {
    byProvider[r.provider] ??= { label: r.provider_label, confidence: r.confidence, seeded: !!r.seeded, rows: 0, gpus: new Set() };
    byProvider[r.provider].rows++;
    byProvider[r.provider].gpus.add(r.gpu_id);
  }

  return {
    schema: "factor-io.tco-gpu-pricing/1.0.0",
    generated_at: observedAt,
    note:
      "Rented-GPU rates per SPEC v0.2 5.7. confidence=first_party rows come from the vendor's own price list with no credential. confidence=indicative rows come from a public aggregator because the vendor's own API is credential-gated (GCP Cloud Billing returns 403 unauthenticated; Alibaba/Tencent/Huawei require signed AccessKey auth) — they are order-of-magnitude planning figures and every surface that renders one says so. No row is promoted between tiers without being re-fetched from the vendor.",
    tiers: {
      first_party: "Vendor's own price list, fetched without credentials.",
      indicative: "Public aggregator; vendor API is credential-gated. Planning figure, not a quote.",
    },
    gpus: Object.fromEntries(Object.values(GPU).map((g) => [g.id, g])),
    providers: Object.fromEntries(
      Object.entries(byProvider).map(([k, v]) => [k, { label: v.label, confidence: v.confidence, seeded: v.seeded, rows: v.rows, gpus: [...v.gpus].sort() }]),
    ),
    rows,
  };
}

async function main() {
  const observedAt = new Date().toISOString();
  const settled = await Promise.allSettled([fetchAWS(observedAt), fetchAzure(observedAt), fetchAggregator(observedAt)]);
  const [aws, azure, agg] = settled;

  // A first_party source failing is FATAL: those two are the only rows carrying
  // vendor authority, and shipping the registry without them would silently
  // demote the whole calculator to aggregator figures.
  const fatal = [];
  if (aws.status === "rejected") fatal.push(`aws: ${aws.reason?.message ?? aws.reason}`);
  if (azure.status === "rejected") fatal.push(`azure: ${azure.reason?.message ?? azure.reason}`);
  if (fatal.length) {
    throw new Error(`first-party GPU price fetch failed — refusing to write a registry without vendor rates:\n  ${fatal.join("\n  ")}`);
  }
  if (agg.status === "rejected") {
    throw new Error(`aggregator GPU price fetch failed: ${agg.reason?.message ?? agg.reason}`);
  }

  const seed = await loadSeed();
  const doc = await buildGpuPricing({
    observedAt,
    sources: { aws: aws.value, azure: azure.value, aggregator: agg.value.rows, seed },
  });

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(doc, null, 2));

  console.log(JSON.stringify({
    generated_at: doc.generated_at,
    total_rows: doc.rows.length,
    first_party_rows: doc.rows.filter((r) => r.confidence === "first_party").length,
    indicative_live_rows: doc.rows.filter((r) => r.confidence === "indicative" && !r.seeded).length,
    indicative_seeded_rows: doc.rows.filter((r) => r.seeded).length,
    providers: Object.fromEntries(Object.entries(doc.providers).map(([k, v]) => [k, `${v.rows} rows (${v.confidence}${v.seeded ? ", seeded" : ""})`])),
    aggregator_findings: agg.value.findings,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof ShapeError ? `\nSHAPE DRIFT — the feed moved and this build refuses to guess:\n${e.message}\n` : e);
    process.exit(1);
  });
}