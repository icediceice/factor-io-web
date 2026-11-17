import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { formatHalfUp, toRat } from "../exact.js";
import { normalizeFxDocument, toTHB } from "../currency.js";
import { runComparison } from "../calculator.js?v=20260906-ux3";
import {
  normalizeSizerInput,
  computeSizer,
  encodeSizerFragment,
  decodeSizerFragment,
  encodePresetFragment,
  decodePresetFragment,
  projectSizerControls,
  buildPricingIdentity,
  SizerValidationError,
} from "../sizer-engine.js";

const ROOT = resolve(import.meta.dirname, "../..");
const readJson = async (rel) => JSON.parse(await readFile(resolve(ROOT, rel), "utf8"));

const [manifest, gpuPricing, serverPricing, servingData, powerSeed, subscriptions] = await Promise.all([
  readJson("tco-calculator/data/manifest.json"),
  readJson("tco-calculator/data/gpu-pricing.json"),
  readJson("tco-calculator/data/server-pricing.json"),
  readJson("tco-calculator/data/serving-models.json"),
  readJson("tco-calculator/data/power-seed.json"),
  readJson("tco-calculator/data/subscription-pricing.json"),
]);

// Load local catalog snapshot referenced in manifest
const catalogRel = manifest.resources?.catalog?.path
  ? `tco-calculator/data/${manifest.resources.catalog.path}`
  : "tco-calculator/data/catalog.json";
const catalog = await readJson(catalogRel);
const FIXED_FX = normalizeFxDocument({
  observed_at: "2026-09-01",
  usd_thb: "33.801",
  source_id: "test-fx",
});

const baseData = {
  manifest,
  catalog,
  fx: FIXED_FX,
  gpuPricing,
  serverPricing,
  servingData,
  powerSeed,
  subscriptions,
};

test("local-only implementation fee enters owned upfront and payback without charging Cloud API or inflating hardware capex", () => {
  const withoutFee = computeSizer({
    input: {
      workloadId: "thai_doc_line_ops",
      users: 450,
      modelId: "qwen3-8-27b",
      gpuId: "rtx_pro_6000_se",
      quoteBasis: "fleet_total",
      quoteCurrency: "THB",
      nodes: 1,
      gpusPerNode: 4,
      fleetTotalPrice: { amount: "1000000", currency: "THB" },
      localImplFee: { amount: "0", currency: "THB" },
      commonImplFee: { amount: "0", currency: "THB" },
    },
    data: baseData,
  });
  assert.equal(withoutFee.ok, true);

  const withLocalImpl = computeSizer({
    input: {
      workloadId: "thai_doc_line_ops",
      users: 450,
      modelId: "qwen3-8-27b",
      gpuId: "rtx_pro_6000_se",
      quoteBasis: "fleet_total",
      quoteCurrency: "THB",
      nodes: 1,
      gpusPerNode: 4,
      fleetTotalPrice: { amount: "1000000", currency: "THB" },
      localImplFee: { amount: "450000", currency: "THB" },
      commonImplFee: { amount: "0", currency: "THB" },
    },
    data: baseData,
  });
  assert.equal(withLocalImpl.ok, true);

  // Hardware BOM capex stays 1,000,000 THB, owned total upfront becomes 1,450,000 THB, API upfront stays 0 THB.
  assert.equal(formatHalfUp(toTHB(withLocalImpl.bom.capexUsd, FIXED_FX), 2), "1000000.00");
  assert.equal(formatHalfUp(toTHB(withLocalImpl.comparison.totals.A.one_time, FIXED_FX), 2), "1450000.00");
  assert.equal(formatHalfUp(toTHB(withLocalImpl.comparison.totals.B.one_time, FIXED_FX), 2), "0.00");

  // Payback with local-only implementation fee is strictly longer than hardware-only payback.
  assert.ok(
    withLocalImpl.comparison.payback.vs_model_api.months > withoutFee.comparison.payback.vs_model_api.months,
    `expected payback with 450k THB local impl (${withLocalImpl.comparison.payback.vs_model_api.months}) > hardware-only (${withoutFee.comparison.payback.vs_model_api.months})`,
  );

  // Shared implementation fee charges both A and B equally, leaving net payback identical to hardware-only.
  const withSharedImpl = computeSizer({
    input: {
      workloadId: "thai_doc_line_ops",
      users: 450,
      modelId: "qwen3-8-27b",
      gpuId: "rtx_pro_6000_se",
      quoteBasis: "fleet_total",
      quoteCurrency: "THB",
      nodes: 1,
      gpusPerNode: 4,
      fleetTotalPrice: { amount: "1000000", currency: "THB" },
      localImplFee: { amount: "0", currency: "THB" },
      commonImplFee: { amount: "450000", currency: "THB" },
    },
    data: baseData,
  });
  assert.equal(
    withSharedImpl.comparison.payback.vs_model_api.months,
    withoutFee.comparison.payback.vs_model_api.months,
  );
  assert.equal(formatHalfUp(toTHB(withSharedImpl.comparison.totals.B.one_time, FIXED_FX), 2), "450000.00");
});

test("currency-tagged USD hardware quote converts once at exact FX and detects FX drift on projection", () => {
  const res = computeSizer({
    input: {
      workloadId: "thai_knowledge_rag",
      users: 120,
      modelId: "qwen3-5-9b",
      gpuId: "rtx_pro_6000_se",
      quoteBasis: "fleet_total",
      quoteCurrency: "USD",
      nodes: 1,
      gpusPerNode: 1,
      fleetTotalPrice: { amount: "10000", currency: "USD" },
    },
    data: baseData,
  });
  assert.equal(res.ok, true);
  assert.equal(res.bom.capexUsd, "10000");
  assert.equal(formatHalfUp(toRat(res.bom.capexThb), 2), "338010.00");

  const capturedNorm = normalizeSizerInput({
    ...res.normalized,
    pricingIdentity: buildPricingIdentity(manifest, FIXED_FX),
  });
  const sameFxProj = projectSizerControls({
    normalized: capturedNorm,
    beforeControls: {},
    stateData: baseData,
  });
  assert.equal(sameFxProj.repriced, false);
  assert.equal(sameFxProj.controls["f-sh-capex"], "338010");

  const newerFx = normalizeFxDocument({ observed_at: "2026-09-10", usd_thb: "35.000", source_id: "live-fx" });
  const driftedProj = projectSizerControls({
    normalized: capturedNorm,
    beforeControls: {},
    stateData: { ...baseData, fx: newerFx },
  });
  assert.equal(driftedProj.repriced, true);
  // Preserves the declared $10,000 USD quote converted at the new 35.000 rate = 350,000 THB
  assert.equal(driftedProj.controls["f-sh-capex"], "350000");
});

test("hardware BOM quote bases agree on 2-node 4-GPU topology without double-counting and propagate to power and node licences", () => {
  const splitRes = computeSizer({
    input: {
      workloadId: "thai_knowledge_rag",
      users: 100,
      modelId: "qwen3-5-9b",
      gpuId: "rtx_pro_6000_se",
      quoteBasis: "component_split",
      quoteCurrency: "THB",
      nodes: 2,
      gpusPerNode: 2,
      chassisNodePrice: { amount: "50000", currency: "THB" },
      gpuUnitPrice: { amount: "20000", currency: "THB" },
    },
    data: baseData,
  });
  assert.equal(splitRes.ok, true);
  assert.equal(splitRes.bom.nodes, 2);
  assert.equal(splitRes.bom.installedGpus, 4);
  assert.equal(formatHalfUp(toRat(splitRes.bom.capexThb), 2), "180000.00");
  assert.equal(splitRes.powerPlan.gpus_provisioned, 4);

  const integratedRes = computeSizer({
    input: {
      workloadId: "thai_knowledge_rag",
      users: 100,
      modelId: "qwen3-5-9b",
      gpuId: "rtx_pro_6000_se",
      quoteBasis: "integrated_node",
      quoteCurrency: "THB",
      nodes: 2,
      gpusPerNode: 2,
      integratedNodePrice: { amount: "90000", currency: "THB" },
      gpuUnitPrice: { amount: "999999", currency: "THB" }, // ignored in integrated_node mode
    },
    data: baseData,
  });
  assert.equal(integratedRes.ok, true);
  assert.equal(formatHalfUp(toRat(integratedRes.bom.capexThb), 2), "180000.00");

  const fleetRes = computeSizer({
    input: {
      workloadId: "thai_knowledge_rag",
      users: 100,
      modelId: "qwen3-5-9b",
      gpuId: "rtx_pro_6000_se",
      quoteBasis: "fleet_total",
      quoteCurrency: "THB",
      nodes: 2,
      gpusPerNode: 2,
      fleetTotalPrice: { amount: "180000", currency: "THB" },
    },
    data: baseData,
  });
  assert.equal(fleetRes.ok, true);
  assert.equal(formatHalfUp(toRat(fleetRes.bom.capexThb), 2), "180000.00");
  assert.deepEqual(
    fleetRes.comparison.totals.A,
    splitRes.comparison.totals.A,
  );
});

test("Thai token fertility applies once on Latin reference input, stays 1x on Thai-tokenized input, and survives fragment round-trip", () => {
  const latinNorm = normalizeSizerInput({
    rawPromptTokens: 4000,
    rawOutputTokens: 500,
    rawContextTokens: 8192,
    tokenBasis: "latin_reference_1_4x",
    thaiFertilityMultiplier: "1.4",
  });
  assert.equal(latinNorm.effectivePromptTokens, 5600);

  const frag = encodeSizerFragment(latinNorm);
  const decoded = decodeSizerFragment(frag);
  assert.equal(decoded.rawPromptTokens, 4000);
  assert.equal(decoded.effectivePromptTokens, 5600); // never multiplied a second time into 7840

  const thaiAlreadyNorm = normalizeSizerInput({
    rawPromptTokens: 4000,
    rawOutputTokens: 500,
    rawContextTokens: 8192,
    tokenBasis: "thai_tokenized_1x",
    thaiFertilityMultiplier: "1.4",
  });
  assert.equal(thaiAlreadyNorm.effectivePromptTokens, 4000);
});

test("fit qualification blocks cross-node TP and marks INT4 and multi-GPU PCIe solves as conditional rather than unqualified pass", () => {
  // DeepSeek V3 (671B) cannot fit TP=1 or TP=2 on 2-GPU nodes -> requires larger TP across nodes -> refused/blocked
  const crossNode = computeSizer({
    input: {
      modelId: "deepseek-v3",
      wquant: "fp8",
      kvquant: "fp8",
      gpuId: "h200",
      quoteBasis: "integrated_node",
      nodes: 4,
      gpusPerNode: 2,
      integratedNodePrice: { amount: "4000000", currency: "THB" },
    },
    data: baseData,
  });
  assert.equal(crossNode.ok, false);
  assert.equal(crossNode.fit.qualifiedDeploymentPass, false);

  // INT4 quantization flags ideal-weight lower bound warning
  const int4Fit = computeSizer({
    input: {
      modelId: "qwen3-8-27b",
      wquant: "int4",
      kvquant: "fp8",
      gpuId: "rtx_pro_6000_se",
      quoteBasis: "catalog",
    },
    data: baseData,
  });
  assert.equal(int4Fit.ok, true);
  assert.equal(int4Fit.fit.status, "conditional_pass");
  assert.equal(int4Fit.fit.qualifiedDeploymentPass, false);
  assert.ok(int4Fit.fit.warnings.some((w) => w.code === "lower_bound_ideal_weights"));

  // Qwen3-Next 80B at BF16 on RTX PRO 6000 SE (96GB PCIe) requires TP=2 -> warns on PCIe TP assumption
  const pcieTp = computeSizer({
    input: {
      modelId: "qwen3-next-80b-a3b",
      wquant: "bf16",
      kvquant: "bf16",
      rawContextTokens: 8192,
      gpuId: "rtx_pro_6000_se",
      quoteBasis: "integrated_node",
      nodes: 1,
      gpusPerNode: 4,
      integratedNodePrice: { amount: "3200000", currency: "THB" },
    },
    data: baseData,
  });
  assert.equal(pcieTp.ok, true);
  assert.ok(Number(pcieTp.fit.serving.gpus_per_replica) > 1);
  assert.equal(pcieTp.fit.qualifiedDeploymentPass, false);
  assert.ok(pcieTp.fit.warnings.some((w) => w.code === "assumed_tp_pcie_unmodeled"));
});

test("fragment codecs reject unknown keys, malformed tokens, invalid wire types/enums, and oversized payloads", () => {
  assert.equal(decodeSizerFragment(""), null);
  assert.equal(decodeSizerFragment("#custom-page"), null);
  assert.throws(() => decodeSizerFragment("#sizer=v1.not valid base64!!"), SizerValidationError);

  const evilPayload = Buffer.from(JSON.stringify({ v: 1, evilKey: "injected" })).toString("base64url");
  assert.throws(() => decodeSizerFragment(`#sizer=v1.${evilPayload}`), /unknown key/i);

  const oversized = `#sizer=v1.${"a".repeat(8200)}`;
  assert.throws(() => decodeSizerFragment(oversized), /8 KiB/i);

  const baseCompact = JSON.parse(Buffer.from(encodeSizerFragment(normalizeSizerInput({})).split(".")[1], "base64url").toString());
  for (const [field, bad] of [
    ["dm", "not-a-mode"],
    ["u", [100]],
    ["qc", "EUR"],
    ["cn", ["not-a-connector"]],
    ["mx", { chat: "1", surprise: "1" }],
    ["pFl", { amount: "12", currency: "USD", surprise: 1 }],
  ]) {
    const tok = `#sizer=v1.${Buffer.from(JSON.stringify({ ...baseCompact, [field]: bad })).toString("base64url")}`;
    assert.throws(() => decodeSizerFragment(tok), SizerValidationError, `expected sizer decoder to reject ${field}`);
  }

  for (const badPreset of [
    { v: 1, users: -1 },
    { v: 1, users: [] },
    { v: 1, deploymentMode: "bogus" },
    { v: 1, nodes: 10001 },
    { v: 1, localImplFee: { amount: "-10", currency: "USD" } },
    { v: 1, localImplFee: { amount: "10", currency: "USD", extra: 1 } },
  ]) {
    const tok = `#preset=v1.${Buffer.from(JSON.stringify(badPreset)).toString("base64url")}`;
    assert.throws(() => decodePresetFragment(tok), SizerValidationError, `expected preset decoder to reject ${JSON.stringify(badPreset)}`);
  }

  const presetFrag = encodePresetFragment({
    workloadId: "thai_doc_line_ops",
    deploymentMode: "brownfield",
    dealTierOverride: "M",
    localImplFee: { amount: "400000", currency: "THB" },
  });
  const decodedPreset = decodePresetFragment(presetFrag);
  assert.equal(decodedPreset.deploymentMode, "brownfield");
  assert.equal(decodedPreset.localImplFee.amount, "400000");
});

test("catalog node override prices the declared node fleet, rejects conflicting slot counts, and propagates to power and subscriptions", () => {
  const withSubData = {
    ...baseData,
    subscriptions: {
      rows: [
        ...subscriptions.rows,
        { id: "fixture-node-lic", label: "Node Licence", meter: "per_node_year", price_usd: "1200", price_confidence: "indicative", applies_to: ["A"] },
      ],
    },
  };
  const tenNodes = computeSizer({
    input: {
      users: 1,
      modelId: "qwen3-5-9b",
      gpuId: "rtx_pro_6000_ws",
      quoteBasis: "catalog",
      serverId: "ws-rtx-pro-6000-1x-derived",
      nodes: 10,
      subscriptionId: "fixture-node-lic",
    },
    data: withSubData,
  });
  assert.equal(tenNodes.ok, true);
  assert.equal(tenNodes.bom.nodes, 10);
  assert.equal(tenNodes.bom.installedGpus, 10);
  assert.equal(tenNodes.powerPlan.gpus_provisioned, 10);
  assert.equal(formatHalfUp(toRat(tenNodes.comparison.totals.A.subscription_monthly), 2), "1000.00");

  const projected = projectSizerControls({
    normalized: tenNodes.normalized,
    beforeControls: {},
    stateData: withSubData,
  });
  assert.equal(projected.controls["f-sh-count"], "10");

  // Catalog server's gpu_count is authoritative even if residual custom gpusPerNode sits in draft state;
  // an explicit catalog node count below peak GPU requirement refuses cleanly.
  const residualCustomSlots = computeSizer({
    input: {
      users: 100,
      modelId: "qwen3-5-9b",
      gpuId: "rtx_pro_6000_se",
      quoteBasis: "catalog",
      nodes: 2,
      gpusPerNode: 2,
    },
    data: baseData,
  });
  assert.equal(residualCustomSlots.ok, true);
  assert.equal(residualCustomSlots.bom.nodes, 2);
  assert.equal(residualCustomSlots.bom.gpusPerNode, 4);
  assert.equal(residualCustomSlots.bom.installedGpus, 8);

  const underSizedCatalog = computeSizer({
    input: {
      users: 5000,
      modelId: "qwen3-8-27b",
      gpuId: "rtx_pro_6000_ws",
      quoteBasis: "catalog",
      serverId: "ws-rtx-pro-6000-1x-derived",
      nodes: 1,
    },
    data: baseData,
  });
  assert.equal(underSizedCatalog.ok, false);
  assert.equal(underSizedCatalog.bom.code, "insufficient_installed_gpus");

  // Selected unpublished or unknown platform subscriptions refuse instead of becoming free
  const unpublishedSub = computeSizer({
    input: {
      users: 100,
      modelId: "qwen3-5-9b",
      gpuId: "rtx_pro_6000_se",
      quoteBasis: "fleet_total",
      nodes: 1,
      gpusPerNode: 2,
      fleetTotalPrice: { amount: "100000", currency: "THB" },
      subscriptionId: "nutanix-enterprise-ai",
    },
    data: baseData,
  });
  assert.equal(unpublishedSub.ok, false);
  assert.equal(unpublishedSub.stage, "subscription");

  const unknownSub = computeSizer({
    input: {
      users: 100,
      modelId: "qwen3-5-9b",
      gpuId: "rtx_pro_6000_se",
      quoteBasis: "fleet_total",
      nodes: 1,
      gpusPerNode: 2,
      fleetTotalPrice: { amount: "100000", currency: "THB" },
      subscriptionId: "nonexistent-platform",
    },
    data: baseData,
  });
  assert.equal(unknownSub.ok, false);
  assert.equal(unknownSub.code, "unknown_subscription");
});

test("public release archive excludes private decks and public payloads omit confidential partner terms", () => {
  const gitRead = (args) => {
    const result = spawnSync("git", args, { cwd: ROOT, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(result.status, 0, String(result.stderr));
    return result.stdout;
  };
  const privatePaths = ["factor_io_dell_partnership_deck.html", "dell_partner_promo_deck.html"];
  const ignored = gitRead(["check-ignore", "--no-index", "--", ...privatePaths]).toString().trim().split("\n");
  assert.deepEqual(ignored, privatePaths);
  assert.equal(gitRead(["ls-files", "-z", "--", ...privatePaths]).length, 0, "ignored files already tracked would still publish");
  const paths = [".gitignore", ".interface-design/log.json", "local-ai-sizer.html", "privacy.html", "tco-calculator.html", "tco-calculator/app.js", "tco-calculator/sizer-engine.js", "tco-calculator/sizer-ui.js"];
  const archive = gitRead(["archive", "--format=tar", "HEAD", "--", ...paths]);
  const files = new Map();
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, "");
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, "").trim(), 8) || 0;
    if (header[156] === 0 || header[156] === 48) files.set(name, archive.subarray(offset + 512, offset + 512 + size).toString());
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  for (const path of paths) {
    assert.ok(files.has(path), `release artifact omitted ${path}`);
    if (path === ".gitignore") continue;
    assert.doesNotMatch(files.get(path), /\bDell\b|\bPowerEdge\b|\bPro\s?Max\b|dell_partner_promo_deck|factor_io_dell_partnership_deck/i, `${path} leaked confidential terms into release output`);
  }
});
