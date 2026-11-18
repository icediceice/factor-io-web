import test from "node:test";
import assert from "node:assert/strict";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { formatHalfUp, toRat } from "../exact.js";
import { normalizeFxDocument, toTHB } from "../currency.js";
import { runComparison } from "../calculator.js?v=20260906-ux3";
import {
  LOCAL_AI_WORKLOADS,
  normalizeSizerInput,
  resolveSizerModel,
  computeSizer,
  evaluateGpuCandidates,
  groupCatalogModels,
  filterApiOffers,
  pickComparableApiOffer,
  describePricingRefresh,
  encodeSizerFragment,
  decodeSizerFragment,
  encodePresetFragment,
  decodePresetFragment,
  encodeSizerSaveEnvelope,
  decodeSizerSaveEnvelope,
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
  const feeFixtureBase = {
    workloadId: "thai_doc_line_ops",
    users: 450,
    rawPromptTokens: 2400,
    rawOutputTokens: 380,
    rawContextTokens: 16384,
    modelId: "qwen3-8-27b",
    gpuId: "rtx_pro_6000_se",
    quoteBasis: "fleet_total",
    quoteCurrency: "THB",
    nodes: 1,
    gpusPerNode: 4,
    fleetTotalPrice: { amount: "1000000", currency: "THB" },
  };
  const withoutFee = computeSizer({
    input: {
      ...feeFixtureBase,
      localImplFee: { amount: "0", currency: "THB" },
      commonImplFee: { amount: "0", currency: "THB" },
    },
    data: baseData,
  });
  assert.equal(withoutFee.ok, true);

  const withLocalImpl = computeSizer({
    input: {
      ...feeFixtureBase,
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
      ...feeFixtureBase,
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
    const forbidden = /\bDell\b|\bPowerEdge\b|\bPro\s?Max\b|dell_partner_promo_deck|factor_io_dell_partnership_deck/i;
    assert.doesNotMatch(files.get(path), forbidden, `${path} leaked confidential terms into release output`);
    // Verify the actual release artifact above; reading source text again adds no behavioral coverage.
  }
});

test("realistic Thai enterprise workloads carry >=10.5k prompt budgets, auto-size cleanly, and refuse 32k-max models on 36k prompts without clamping", () => {
  assert.ok(LOCAL_AI_WORKLOADS.length >= 8);
  for (const w of LOCAL_AI_WORKLOADS) {
    assert.ok(w.rawPromptTokens >= 10500, `expected ${w.id} rawPromptTokens >= 10500, got ${w.rawPromptTokens}`);
    const res = computeSizer({ input: { workloadId: w.id }, data: baseData });
    assert.equal(res.ok, true, `expected workload ${w.id} to auto-size cleanly, got ${res.reason}`);
    assert.ok(res.bom.installedGpus >= res.sizing.gpusRequired);
  }

  // Switching from an 80B/262k model at 36,000 raw prompt (50,400+ effective at 1.4x) to qwen3-8b (32,768 max context) refuses cleanly without clipping tokens
  const ctxRefused = computeSizer({
    input: {
      workloadId: "thai_legal_tor_procurement",
      rawPromptTokens: 36000,
      rawOutputTokens: 500,
      rawContextTokens: 65536,
      modelId: "qwen3-8b",
      gpuId: "rtx_pro_6000_se",
    },
    data: baseData,
  });
  assert.equal(ctxRefused.ok, false);
  assert.equal(ctxRefused.fit.code, "exceeds_model_context_max");
  assert.equal(ctxRefused.normalized.rawPromptTokens, 36000);
  assert.equal(ctxRefused.comparison, null);
});

test("resolveSizerModel requires explicit KV/context for new custom models, sizes complete custom 70B specs consistently, and preserves 44-key legacy v1 tokens", () => {
  // Parameter-only custom entry (70B without KV/context) refuses fleet sizing while reporting weight memory
  const incomplete70b = computeSizer({
    input: {
      modelId: "custom",
      customParamsB: "70",
      wquant: "fp8",
      kvquant: "fp8",
      gpuId: "h100",
    },
    data: baseData,
  });
  assert.equal(incomplete70b.ok, false);
  assert.equal(incomplete70b.code, "incomplete_custom_model");
  assert.equal(incomplete70b.fit.weightMemoryGb, "70.00");
  assert.equal(incomplete70b.comparison, null);

  // Complete 70B custom model (80 layers x 2 tensors x 8 KV heads x 128 dim x 2B BF16 = 327,680 B/tok BF16 -> 163,840 B/tok FP8 -> ~5.37 GB/seq at 32,768)
  const complete70b = computeSizer({
    input: {
      users: 120,
      rawPromptTokens: 12000,
      rawOutputTokens: 600,
      rawContextTokens: 32768,
      tokenBasis: "thai_tokenized_1x",
      modelId: "custom",
      customParamsB: "70",
      customActiveParamsB: "70",
      customKvBytesBf16: 327680,
      customContextMax: 65536,
      wquant: "fp8",
      kvquant: "fp8",
      gpuId: "h100",
    },
    data: baseData,
  });
  assert.equal(complete70b.ok, true);
  assert.equal(complete70b.fit.resolvedModel.kv_override, true);
  assert.equal(complete70b.fit.resolvedModel.selected_kv_bytes_per_token, "163840");
  assert.ok(complete70b.fit.warnings.some((w) => w.code === "assumed_flat_custom_kv"));

  const projected = projectSizerControls({
    normalized: complete70b.normalized,
    beforeControls: {},
    stateData: baseData,
  });
  assert.equal(projected.controls["f-sv-params"], "70");
  assert.equal(projected.controls["f-sv-active"], "70");
  assert.equal(projected.controls["f-sv-kvbytes"], "163840");

  // Extended custom fragment round-trips cleanly, whereas standard catalog fragments emit ONLY the 44 legacy keys
  const customFrag = encodeSizerFragment(complete70b.normalized);
  const decodedCustom = decodeSizerFragment(customFrag);
  assert.equal(decodedCustom.customParamsB, "70");
  assert.equal(decodedCustom.customKvBytesBf16, 327680);
  assert.equal(decodedCustom.customContextMax, 65536);

  const stdPayload = JSON.parse(Buffer.from(encodeSizerFragment(normalizeSizerInput({})).split(".")[1], "base64url").toString());
  assert.equal(Object.keys(stdPayload).length, 44);
  assert.equal("cp" in stdPayload, false);

  // Legacy custom v1 payload without cp/ca/ck/cm decodes and flags assumed legacy geometry
  const legacyCustomPayload = { ...stdPayload, m: "custom" };
  const legacyCustomTok = `#sizer=v1.${Buffer.from(JSON.stringify(legacyCustomPayload)).toString("base64url")}`;
  const legacyNorm = decodeSizerFragment(legacyCustomTok);
  const legacyResolved = resolveSizerModel({ normalized: legacyNorm, servingData });
  assert.equal(legacyResolved.ok, true);
  assert.ok(legacyResolved.warnings.some((w) => w.code === "assumed_legacy_custom_shape"));
});

test("per-server topology auto-sizing selects feasible 2-GPU server when 1-GPU server row precedes it, without overriding manual pins", () => {
  // rtx_pro_6000_ws has ws-rtx-pro-6000-1x-derived (1 GPU) BEFORE ws-rtx-pro-6000-2x-derived (2 GPUs).
  // qwen3-next-80b-a3b at BF16 weights (160 GB) requires TP=2 on 96 GB cards.
  const autoWs = computeSizer({
    input: {
      users: 80,
      rawPromptTokens: 8000,
      rawOutputTokens: 500,
      rawContextTokens: 16384,
      modelId: "qwen3-next-80b-a3b",
      wquant: "bf16",
      kvquant: "fp8",
      gpuId: "rtx_pro_6000_ws",
      quoteBasis: "catalog",
      serverId: "",
    },
    data: baseData,
  });
  assert.equal(autoWs.ok, true);
  assert.equal(Number(autoWs.fit.serving.gpus_per_replica), 2);
  assert.equal(autoWs.bom.serverId, "ws-rtx-pro-6000-2x-derived");
  assert.equal(autoWs.bom.gpusPerNode, 2);

  // Explicitly pinning the 1-GPU workstation row still refuses cross-node TP cleanly
  const pinned1x = computeSizer({
    input: {
      users: 80,
      rawPromptTokens: 8000,
      rawOutputTokens: 500,
      rawContextTokens: 16384,
      modelId: "qwen3-next-80b-a3b",
      wquant: "bf16",
      kvquant: "fp8",
      gpuId: "rtx_pro_6000_ws",
      quoteBasis: "catalog",
      serverId: "ws-rtx-pro-6000-1x-derived",
    },
    data: baseData,
  });
  assert.equal(pinned1x.ok, false);
  assert.equal(pinned1x.code, "unsupported_cross_node_tp");

  // evaluateGpuCandidates evaluates cross-GPU matrix without leaking custom per-node quotes onto other GPUs
  const matrix = evaluateGpuCandidates({
    input: {
      users: 100,
      rawPromptTokens: 10500,
      rawOutputTokens: 500,
      rawContextTokens: 32768,
      modelId: "qwen3-5-9b",
      gpuId: "rtx_pro_6000_se",
      quoteBasis: "integrated_node",
      nodes: 5,
      gpusPerNode: 4,
      integratedNodePrice: { amount: "9999999", currency: "THB" },
    },
    data: baseData,
  });
  const h100Row = matrix.find((r) => r.gpuId === "h100");
  assert.ok(h100Row && h100Row.feasible && h1000Check(h100Row));
  const l40sRow = matrix.find((r) => r.gpuId === "l40s");
  assert.ok(l40sRow && l40sRow.feasible && l40sRow.status === "memory_fit_unpriced" && l40sRow.priced === false);
});

function h1000Check(row) {
  return row.priced === true && row.nodes === 1 && row.serverId.length > 0;
}

test("explicit missing API offer refuses identically in computeSizer and projectSizerControls, while filterApiOffers separates feed vs vendor and preserves :batch", () => {
  const missingApi = computeSizer({
    input: {
      users: 100,
      modelId: "qwen3-5-9b",
      gpuId: "rtx_pro_6000_se",
      apiOfferId: "openrouter:removed-vendor/nonexistent-model",
    },
    data: baseData,
  });
  assert.equal(missingApi.ok, false);
  assert.equal(missingApi.code, "unknown_api_offer");
  assert.equal(missingApi.comparison, null);
  assert.throws(
    () => projectSizerControls({ normalized: missingApi.normalized, beforeControls: {}, stateData: baseData }),
    /unavailable in the current catalog/i,
  );

  // Fixture catalog with OpenRouter OpenAI, Anthropic paid + :batch, Google, and LiteLLM OpenAI
  const fixtureManifest = {
    models: [
      { id: "openrouter:openai/gpt-4o", name: "OpenAI: GPT-4o", state: "active" },
      { id: "openrouter:anthropic/claude-sonnet-4", name: "Anthropic: Claude Sonnet 4", state: "active" },
      { id: "openrouter:anthropic/claude-sonnet-4:batch", name: "Anthropic: Claude Sonnet 4 (Batch)", state: "active" },
      { id: "openrouter:google/gemini-2.5-pro", name: "Google: Gemini 2.5 Pro", state: "active" },
      { id: "litellm:gpt-4o", name: "gpt-4o", state: "active" },
    ],
  };
  const mkOffer = (id, src, seller, product, inp, out) => ({
    offer_id: id,
    seller,
    seller_source: src,
    channel: "api",
    product,
    display_name: product,
    ingest_mode: "chat",
    prices: { "input|std": inp, "output|std": out },
  });
  const fixtureCatalog = {
    offers: {
      "openrouter:openai/gpt-4o": mkOffer("openrouter:openai/gpt-4o", "openrouter", "openrouter", "openai/gpt-4o", "0.0000025", "0.00001"),
      "openrouter:anthropic/claude-sonnet-4": mkOffer("openrouter:anthropic/claude-sonnet-4", "openrouter", "openrouter", "anthropic/claude-sonnet-4", "0.000003", "0.000015"),
      "openrouter:anthropic/claude-sonnet-4:batch": mkOffer("openrouter:anthropic/claude-sonnet-4:batch", "openrouter", "openrouter", "anthropic/claude-sonnet-4:batch", "0.0000015", "0.0000075"),
      "openrouter:google/gemini-2.5-pro": mkOffer("openrouter:google/gemini-2.5-pro", "openrouter", "openrouter", "google/gemini-2.5-pro", "0.00000125", "0.00001"),
      "litellm:gpt-4o": mkOffer("litellm:gpt-4o", "litellm", "openai", "gpt-4o", "0.0000025", "0.00001"),
    },
  };

  // feed=openrouter + vendor=openai matches OpenRouter's openai/gpt-4o even though offer.seller is "openrouter"
  const orOpenAi = filterApiOffers({ catalog: fixtureCatalog, manifest: fixtureManifest, feed: "openrouter", vendor: "openai" });
  assert.deepEqual(orOpenAi.offers.map((o) => o.id), ["openrouter:openai/gpt-4o"]);
  assert.equal(orOpenAi.offers[0].inputPer1MUsd, "2.5");
  assert.equal(orOpenAi.offers[0].outputPer1MUsd, "10");

  // Paid and :batch variants coexist with distinct IDs; interactive default never picks :batch
  const anthropicOnlyCatalog = {
    offers: {
      "openrouter:anthropic/claude-sonnet-4:batch": fixtureCatalog.offers["openrouter:anthropic/claude-sonnet-4:batch"],
      "openrouter:anthropic/claude-sonnet-4": fixtureCatalog.offers["openrouter:anthropic/claude-sonnet-4"],
    },
  };
  const anthropicManifest = {
    models: [
      { id: "openrouter:anthropic/claude-sonnet-4:batch", name: "Batch", state: "active" },
      { id: "openrouter:anthropic/claude-sonnet-4", name: "Interactive", state: "active" },
    ],
  };
  assert.equal(pickComparableApiOffer(anthropicOnlyCatalog, anthropicManifest, ""), "openrouter:anthropic/claude-sonnet-4");

  // Empty search still retains an explicitly selected offer outside active filters without mutating it
  const pinnedOutside = filterApiOffers({
    catalog: fixtureCatalog,
    manifest: fixtureManifest,
    feed: "litellm",
    search: "no-such-model-xyz",
    selectedOfferId: "openrouter:google/gemini-2.5-pro",
  });
  assert.equal(pinnedOutside.totalMatching, 0);
  assert.equal(pinnedOutside.offers.length, 1);
  assert.equal(pinnedOutside.offers[0].id, "openrouter:google/gemini-2.5-pro");
  assert.equal(pinnedOutside.offers[0].outsideFilter, true);
});

test("describePricingRefresh formats human-readable source updates without leaking raw digests, and save/import codecs fail closed atomically", () => {
  const oldId = "7cd23cceb6fef29f|fx:snapshot@2026-11-16T00:00:00.000Z:digest-pinned,litellm:snapshot@2026-11-17T06:15:18.280Z:declared,openrouter:snapshot@2026-11-17T06:15:18.280Z:declared|2026-11-16|33.889595";
  const newId = "7cd23cceb6fef29f|fx:live@2026-11-17T00:00:00.000Z:complete-transport,litellm:snapshot@2026-11-17T06:15:18.280Z:declared,openrouter:live@2026-11-17T16:01:50.041Z:complete-transport|2026-11-17|33.840204";
  const prose = describePricingRefresh(oldId, newId, "en");
  assert.match(prose, /OpenRouter \(live feed 2026-11-17\)/);
  assert.match(prose, /33\.89 -> 33\.84 THB\/USD/);
  assert.doesNotMatch(prose, /7cd23cceb6fef29f|digest-pinned|complete-transport|\|fx:/);

  // Timestamp-only refresh does not claim FX rate changed numerically
  const sameRateNewDate = "7cd23cceb6fef29f|fx:live@2026-11-17T00:00:00.000Z:complete-transport|2026-11-17|33.889595";
  const sameRateProse = describePricingRefresh(oldId, sameRateNewDate, "en");
  assert.doesNotMatch(sameRateProse, /->/);

  // Save/import round-trip and atomic 25th-record rejection
  const validFrag = encodeSizerFragment(normalizeSizerInput({ workloadId: "bfsi_kyc_claims", users: 380 }));
  const records25 = Array.from({ length: 25 }, (_, i) => ({
    id: `rec-${i + 1}`,
    name: `Scenario ${i + 1}`,
    savedAt: "2026-11-17T10:00:00Z",
    fragment: validFrag,
  }));
  const encoded25 = encodeSizerSaveEnvelope(records25, { exportedAt: "2026-11-17T10:00:00Z" });
  const decoded25 = decodeSizerSaveEnvelope(encoded25);
  assert.equal(decoded25.scenarios.length, 25);
  assert.equal(decoded25.scenarios[0].normalized.workloadId, "bfsi_kyc_claims");

  // Corrupting record #25 rejects the entire import with zero partial records returned
  const bad25 = JSON.parse(encoded25);
  bad25.scenarios[24].fragment = "sizer=v1.corrupted_payload!";
  assert.throws(() => decodeSizerSaveEnvelope(JSON.stringify(bad25)), SizerValidationError);

  // Unknown schema and >64 KiB byte cap rejected before mutation
  assert.throws(
    () => decodeSizerSaveEnvelope(JSON.stringify({ schema: "wrong/9.9", exportedAt: "2026-11-17T10:00:00Z", scenarios: [records25[0]] })),
    /Unsupported save schema/i,
  );
  assert.throws(() => decodeSizerSaveEnvelope("x".repeat(66000)), /64 KiB/i);
});

test("catalog active-only override round-trips without freezing total params, refuses active > catalog total, and new empty custom cannot masquerade as legacy", () => {
  // Active-only sensitivity override on catalog qwen3-8-27b preserves null customParamsB across fragment + save codecs
  const activeOnly = computeSizer({
    input: {
      users: 100,
      modelId: "qwen3-8-27b",
      gpuId: "rtx_pro_6000_se",
      customActiveParamsB: "5",
    },
    data: baseData,
  });
  assert.equal(activeOnly.ok, true);
  assert.equal(activeOnly.normalized.customParamsB, null);
  assert.equal(activeOnly.normalized.customActiveParamsB, "5");
  const activeFrag = encodeSizerFragment(activeOnly.normalized);
  const activeDecoded = decodeSizerFragment(activeFrag);
  assert.equal(activeDecoded.customParamsB, null);
  assert.equal(activeDecoded.customActiveParamsB, "5");
  const activeProjected = projectSizerControls({
    normalized: activeDecoded,
    beforeControls: {},
    stateData: baseData,
  });
  assert.equal(activeProjected.controls["f-sv-active"], "5");
  assert.equal(activeProjected.controls["f-sv-params"], String(servingData.models.find((m) => m.id === "qwen3-8-27b").params_b));

  // Active parameter override exceeding catalog total params refuses cleanly on sizing and handoff projection
  const activeOverCatalog = decodeSizerFragment(encodeSizerFragment(normalizeSizerInput({
    users: 100,
    modelId: "qwen3-8-27b",
    gpuId: "rtx_pro_6000_se",
    customActiveParamsB: "80",
  })));
  const refusedOver = computeSizer({ input: activeOverCatalog, data: baseData });
  assert.equal(refusedOver.ok, false);
  assert.equal(refusedOver.code, "bad_custom_params");
  assert.throws(
    () => projectSizerControls({ normalized: activeOverCatalog, beforeControls: {}, stateData: baseData }),
    (err) => err instanceof SizerValidationError && err.code === "bad_custom_params",
  );

  // Newly authored empty custom input (without legacy wire provenance) refuses sizing and refuses minting a 44-key legacy token
  const newEmptyCustom = normalizeSizerInput({ modelId: "custom" });
  assert.equal(newEmptyCustom.legacyCustomAssumed, false);
  const newEmptyRes = computeSizer({ input: newEmptyCustom, data: baseData });
  assert.equal(newEmptyRes.ok, false);
  assert.equal(newEmptyRes.code, "incomplete_custom_model");
  assert.throws(
    () => encodeSizerFragment(newEmptyCustom),
    (err) => err instanceof SizerValidationError && err.code === "incomplete_custom_model",
  );

  // Unchanged legacy 44-key custom link retains legacyCustomAssumed and can still be saved/re-encoded unchanged
  const stdPayload = JSON.parse(Buffer.from(encodeSizerFragment(normalizeSizerInput({})).split(".")[1], "base64url").toString());
  const legacyTok = `#sizer=v1.${Buffer.from(JSON.stringify({ ...stdPayload, m: "custom" })).toString("base64url")}`;
  const legacyDecoded = decodeSizerFragment(legacyTok);
  assert.equal(legacyDecoded.legacyCustomAssumed, true);
  const reEncodedLegacy = encodeSizerFragment(legacyDecoded);
  const savedLegacy = encodeSizerSaveEnvelope([{ id: "leg-1", name: "Legacy Custom", savedAt: "2026-11-17T12:00:00Z", fragment: reEncodedLegacy }]);
  assert.equal(decodeSizerSaveEnvelope(savedLegacy).scenarios[0].normalized.legacyCustomAssumed, true);
});

test("stacked 20k+ agent sessions preserve odd-sum prompt totals, cold Turn-1 fertility scaling, 4-band model grouping, and Flint airgapped sovereign default", () => {
  // 1. Airgap sovereign preset defaults to 40B-class Flint on single-node rtx_pro_6000_se (no oversized 80B + H200 requirement)

  const airgapSized = computeSizer({
    input: {
      workloadId: "airgap_sec_audit",
      sessionStackingActive: true,
    },
    data: baseData,
  });
  assert.equal(airgapSized.ok, true);
  assert.equal(airgapSized.normalized.modelId, "flint");
  assert.equal(airgapSized.normalized.gpuId, "rtx_pro_6000_se");
  assert.equal(airgapSized.bom.nodes, 1);

  // 2. 4-band catalog grouping populates <=14B, 20B-40B Sovereign/Finetune, 45B-120B (50B class), and 150B+ Frontier Flash MoEs
  const grouped = groupCatalogModels(servingData);
  assert.equal(grouped.groups.length, 4);
  const band2Ids = grouped.groups[1].models.map((m) => m.id);
  for (const id of ["flint", "qwen3-8-27b", "qwen3-32b", "qwen3-6-35b-a3b", "gemma-4-31b"]) {
    assert.ok(band2Ids.includes(id), `expected ${id} in 20B-40B sovereign/finetune band`);
  }
  const band3Ids = grouped.groups[2].models.map((m) => m.id);
  for (const id of ["kimi-linear-48b-a3b-instruct", "llama-3-3-nemotron-super-49b-v1-5", "gpt-oss-120b"]) {
    assert.ok(band3Ids.includes(id), `expected ${id} in 50B-class / mid-frontier band`);
  }
  const band4Ids = grouped.groups[3].models.map((m) => m.id);
  for (const id of ["qwen3-8-flash-next", "glm-5-3-flash", "deepseek-v4-1-flash-1017", "deepseek-v3"]) {
    assert.ok(band4Ids.includes(id), `expected ${id} in 150B+ frontier Flash MoE band`);
  }

  // 3. Peer Case 3: Odd-sum prompt precision (S=20,000, user=1,001, out=500, T=2, h=0, 1 session/mo, thai_tokenized_1x)
  // Turn 1 = 21,001; Turn 2 = 22,502 -> exact monthly input = 43,503 (never 43,504 from rounded average 21,752 * 2!)
  const oddSession = computeSizer({
    input: {
      users: 1,
      sessionsPerUserDay: "1",
      workingDaysMo: 1,
      tokenBasis: "thai_tokenized_1x",
      rawSystemPromptTokens: 20000,
      rawPromptTokens: 1001,
      rawOutputTokens: 500,
      turnsPerSession: 2,
      kvCacheHitRate: "0",
      rawContextTokens: 32768,
      modelId: "flint",
      gpuId: "rtx_pro_6000_se",
    },
    data: baseData,
  });
  assert.equal(oddSession.ok, true);
  assert.equal(oddSession.demand.in_tokens_mo.text, "43503");
  assert.equal(oddSession.demand.cached_tokens_mo.text, "0");
  assert.equal(oddSession.demand.out_tokens_mo.text, "1000");
  assert.equal(oddSession.demand.tokens_mo.text, "44503");

  // 4. Peer Case 8: Single-turn (T=1) cold session + 1.4x Thai fertility applied ONCE even when kvCacheHitRate="1"
  // S=20,000 -> 28,000; user=1,000 -> 1,400; out=500 -> 500; Turn 1 uncached = 29,400, cached = 0, day = 29,900, 22d mo = 657,800
  const t1Thai = computeSizer({
    input: {
      users: 10,
      sessionsPerUserDay: "1",
      workingDaysMo: 22,
      tokenBasis: "latin_reference_1_4x",
      thaiFertilityMultiplier: "1.4",
      rawSystemPromptTokens: 20000,
      rawPromptTokens: 1000,
      rawOutputTokens: 500,
      turnsPerSession: 1,
      kvCacheHitRate: "1",
      rawContextTokens: 32768,
      modelId: "flint",
      kvquant: "fp4",
      gpuId: "rtx_pro_6000_se",
    },
    data: baseData,
  });
  assert.equal(t1Thai.ok, true);
  assert.equal(t1Thai.personTokenSummary.uncachedInPerPersonDay, "29400");
  assert.equal(t1Thai.personTokenSummary.cachedReadPerPersonDay, "0");
  assert.equal(t1Thai.personTokenSummary.tokensPerPersonDay, "29900");
  assert.equal(t1Thai.personTokenSummary.tokensPerPersonMo, "657800");

  // Optional sp/tp/kh + fp4 round-trip cleanly via #sizer=v1, while 44-key legacy #sizer=v1 stays flat
  const t1Frag = encodeSizerFragment(t1Thai.normalized);
  const t1Decoded = decodeSizerFragment(t1Frag);
  assert.equal(t1Decoded.sessionStackingActive, true);
  assert.equal(t1Decoded.rawSystemPromptTokens, 20000);
  assert.equal(t1Decoded.turnsPerSession, 1);
  assert.equal(t1Decoded.kvCacheHitRate, "1");
  assert.equal(t1Decoded.kvquant, "fp4");

  const legacyFlat = decodeSizerFragment(encodeSizerFragment(normalizeSizerInput({ users: 50 })));
  assert.equal(legacyFlat.sessionStackingActive, false);

  // G1: Probabilistic 50% kvCacheHitRate applies to API cohorts ONLY and never credits peak batch VRAM unless batch sharing is guaranteed.
  // 10,000 B weights + 40,000 B free VRAM (50,000 B total, 0% overhead); S=20,000, U=1,000, O=500, T=2 -> 23,000 B/seq peak.
  // Two concurrent misses require 46,000 B > 40,000 B, so batch MUST stay 1 unless sharedPrefixGuaranteed is true.
  const tightVramData = {
    ...baseData,
    gpuPricing: {
      ...baseData.gpuPricing,
      gpus: {
        ...baseData.gpuPricing.gpus,
        tight_50kb: { label: "Tight 50KB Test GPU", vram_gb: 0.00005 },
      },
    },
    serverPricing: {
      ...baseData.serverPricing,
      rows: [
        ...baseData.serverPricing.rows,
        { server_id: "srv-tight-1x", label: "1x Tight Test", gpu_id: "tight_50kb", gpu_count: 1, form_factor: "1U", usd_typical: "10000" },
      ],
    },
    powerSeed: {
      ...baseData.powerSeed,
      gpus: {
        ...baseData.powerSeed.gpus,
        tight_50kb: { board_tdp_w: 300, typical_load_fraction: "0.7" },
      },
    },
    servingData: {
      ...baseData.servingData,
      vram_overhead_fraction: { value: "0" },
      accelerators: {
        ...baseData.servingData.accelerators,
        tight_50kb: { bandwidth_gb_s: "1000" },
      },
      models: [
        ...baseData.servingData.models,
        {
          id: "unit-1byte-kv",
          label: "Unit 1B/tok Model",
          params_b: "0.00001",
          active_params_b: "0.00001",
          context_default: 23000,
          context_max: 65536,
          basis: "cited",
          groups: [{ kind: "full", layers: 1, kv_heads: 1, head_dim: 1, tensors: 1 }],
        },
      ],
    },
  };

  const prob50 = computeSizer({
    input: {
      users: 1,
      sessionsPerUserDay: "1",
      workingDaysMo: 1,
      tokenBasis: "thai_tokenized_1x",
      rawSystemPromptTokens: 20000,
      rawPromptTokens: 1000,
      rawOutputTokens: 500,
      turnsPerSession: 2,
      kvCacheHitRate: "0.50",
      rawContextTokens: 23000,
      tokensPerSecondPerStream: "1",
      modelId: "unit-1byte-kv",
      wquant: "fp8",
      kvquant: "fp8",
      runtime: "vllm",
      gpuId: "tight_50kb",
    },
    data: tightVramData,
  });
  assert.equal(prob50.ok, true);
  assert.equal(prob50.sessionProjection.sharedPrefixTokens, 0);
  assert.equal(prob50.sessionProjection.potentialSharedPrefixTokens, 10000);
  assert.equal(prob50.fit.serving.batch.text, "1");
  // API cohort pricing still credits 50% cache hit on Turn 2 (0.5 * 21,500 = 10,750 cached tokens/mo)
  assert.equal(prob50.demand.cached_tokens_mo.text, "10750");

  // Positive counterpart: when batch-wide shared resident prefix IS explicitly guaranteed, PagedAttention admits batch > 1
  const guaranteed20k = computeSizer({
    input: {
      users: 1,
      sessionsPerUserDay: "1",
      workingDaysMo: 1,
      tokenBasis: "thai_tokenized_1x",
      rawSystemPromptTokens: 20000,
      rawPromptTokens: 1000,
      rawOutputTokens: 500,
      turnsPerSession: 2,
      kvCacheHitRate: "1",
      sharedPrefixGuaranteed: true,
      guaranteedSharedPrefixTokens: 20000,
      rawContextTokens: 23000,
      tokensPerSecondPerStream: "1",
      modelId: "unit-1byte-kv",
      wquant: "fp8",
      kvquant: "fp8",
      runtime: "vllm",
      gpuId: "tight_50kb",
    },
    data: tightVramData,
  });
  assert.equal(guaranteed20k.ok, true);
  assert.equal(guaranteed20k.sessionProjection.sharedPrefixTokens, 20000);
  assert.equal(guaranteed20k.fit.serving.batch.text, "6");
});
