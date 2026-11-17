// Browser controller for local-ai-sizer.html (5-step Wizard + nested Step 5 Ledger).
// Reads only same-origin dated snapshots under ./tco-calculator/data/*.json,
// stores zero sessionStorage/localStorage, and hands off via #sizer=v1.<base64url>.

import { formatHalfUp, toRat, ratStr } from "./exact.js";
import { loadManifest, loadFx, resolveResource } from "./data.js";
import { normalizeFxDocument, toTHB } from "./currency.js";
import { serversForGpu } from "./capex.js?v=20260906-ux3";
import {
  DEAL_TIERS,
  PIPELINE_CONNECTORS,
  LOCAL_AI_WORKLOADS,
  THAI_MODEL_PROFILES,
  normalizeSizerInput,
  computeSizer,
  encodeSizerFragment,
  decodeSizerFragment,
  decodePresetFragment,
  SizerValidationError,
} from "./sizer-engine.js";

const I18N = {
  th: {
    backTco: "กลับหน้า\u00A0TCO\u00A0Calculator",
    taskbarTitle: "เครื่องมือประเมินขนาด\u00A0Local\u00A0AI\u00A0และชุดโซลูชัน\u2060ระดับองค์กร",
    summaryHeading: "สรุปผลการคำนวณ\u2060แบบเรียลไทม์",
    paybackLabel: "จุดคุ้มทุนเทียบ\u00A0Cloud\u00A0Model\u00A0API",
    paybackHorizonSub: "คำนวณตลอดอายุโครงการ\u00A060\u00A0เดือน\u00A0(รวมค่าฮาร์ดแวร์และค่าติดตั้ง)",
    openTcoRail: "เปิดกราฟ\u00A0TCO\u00A0เต็มรูปแบบ\u00A0→",
    openTcoMain: "ส่งต่อไปยัง\u00A0TCO\u00A0Calculator\u00A0เต็มรูปแบบ\u00A0→",
    printSheet: "พิมพ์ใบสรุปดีล\u00A0(1\u00A0หน้า)",
    copyLink: "คัดลอกลิงก์ชุดตัวเลขนี้",
    copiedLink: "คัดลอกลิงก์เรียบร้อยแล้ว",
    exportJson: "ดาวน์โหลดไฟล์\u00A0JSON",
    resetBtn: "ล้างค่าเริ่มต้นใหม่",
    resetPrompt: "ต้องการล้างตัวเลขที่กรอกทั้งหมดกลับเป็นค่าตั้งต้นหรือไม่?",
    resetConfirm: "ยืนยันการล้างค่า",
    resetCancel: "ยกเลิก",
    prevStep: "←\u00A0ย้อนกลับ",
    steps: [
      { short: "รูปแบบงานและผู้ใช้", next: "ถัดไป:\u00A0ระบบข้อมูล\u00A0→", title: "1.\u00A0เลือกรูปแบบงานที่เหมาะกับ\u00A0Local\u00A0AI\u00A0และจำนวนผู้ใช้งาน", sub: "เริ่มจากกลุ่มงานจริงที่ข้อมูลต้องอยู่ในองค์กรหรือมีปริมาณโทเคนต่อเนื่อง แล้วปรับจำนวนผู้ใช้ตามหน้างานลูกค้า" },
      { short: "ระบบข้อมูล\u00A0API/DB", next: "ถัดไป:\u00A0เลือกโมเดลไทย\u00A0→", title: "2.\u00A0เลือกโครงสร้างพื้นฐานและการเชื่อมต่อ\u00A0Data\u00A0Pipeline\u00A0เดิมของลูกค้า", sub: "ระบุว่าเป็นคลัสเตอร์ใหม่\u00A0(Greenfield)\u00A0หรือต่อยอดคลัสเตอร์เดิม\u00A0(Brownfield)\u00A0พร้อมเลือกฐานข้อมูลและ\u00A0API\u00A0ที่ต้องเชื่อมครบวงจร" },
      { short: "โมเดลไทยและ\u00A0VRAM", next: "ถัดไป:\u00A0ราคาเซิร์ฟเวอร์\u00A0→", title: "3.\u00A0เลือกโมเดลภาษาไทยและตรวจสอบความจุ\u00A0VRAM\u00A0ตามสัดส่วนโทเคนไทย", sub: "ภาษาไทยใช้จำนวนโทเคนต่อประโยคสูงกว่าภาษาอังกฤษ\u00A0ระบบจึงคำนวณ\u00A0KV\u00A0Cache\u00A0และ\u00A0VRAM\u00A0ให้เห็นชัดเจนก่อนเลือกการ์ด" },
      { short: "จำนวน\u00A0GPU\u00A0และราคา", next: "ถัดไป:\u00A0ตารางสรุปดีล\u00A0→", title: "4.\u00A0ระบุรุ่นการ์ด\u00A0จำนวนเซิร์ฟเวอร์\u00A0และกรอกราคาฮาร์ดแวร์ได้เองทันที", sub: "ฝ่ายขายและ\u00A0Presales\u00A0สามารถเลือกใช้ราคากลางอ้างอิง\u00A0หรือกรอกราคาเครื่องพร้อม\u00A0GPU\u00A0ตามใบเสนอราคาจริงได้ทั้ง\u00A0THB\u00A0และ\u00A0USD" },
      { short: "ตารางสรุปดีลและ\u00A0TCO", next: "", title: "5.\u00A0ตารางเปรียบเทียบต้นทุนรวม\u00A060\u00A0เดือน\u00A0และส่งต่อเข้า\u00A0TCO\u00A0Calculator", sub: "ตรวจสอบยอดลงทุนเริ่มต้น\u00A0ค่าไฟรายเดือน\u00A0จุดตัดคุ้มทุนเทียบ\u00A0Cloud\u00A0API\u00A0และกดเปิดหน้าวิเคราะห์\u00A0TCO\u00A0เชิงลึกได้ในคลิกเดียว" },
    ],
    labels: {
      users: "จำนวนผู้ใช้งานจริง\u00A0(คน)",
      sessionsDay: "จำนวนครั้งใช้งานต่อคนต่อวัน",
      daysMo: "จำนวนวันทำงานต่อเดือน",
      peakPct: "สัดส่วนใช้งานพร้อมกันช่วงพีค\u00A0(%)",
      gfTitle: "Greenfield\u00A0(ติดตั้งใหม่ครบชุด\u00A0L1\u2013L4)",
      gfDesc: "รวมตั้งค่า\u00A0Kubernetes, GPU\u00A0Operator, ระบบมอนิเตอร์\u00A0vLLM, Thai\u00A0OCR/RAG\u00A0และเชื่อม\u00A0Data\u00A0Pipeline",
      bfTitle: "Brownfield\u00A0(ต่อยอดคลัสเตอร์เดิม\u00A0L3\u2013L4)",
      bfDesc: "ลูกค้ามี\u00A0OpenShift / NKP / K8s\u00A0พร้อม\u00A0GPU\u00A0แล้ว\u00A0ติดตั้งเฉพาะชั้นโมเดล\u00A0RAG/OCR\u00A0และเชื่อม\u00A0API/DB",
      connectorsHeading: "เลือกระบบข้อมูลเดิมของลูกค้าที่ต้องเชื่อมเข้ากับโซลูชัน\u00A0(ไม่ใช่แค่หน้าแชตครอบโมเดล)",
      tierSelect: "ขนาดชุดโครงการ\u00A0(ระบบแนะนำอัตโนมัติหรือเลือกเอง)",
      tierAuto: "แนะนำอัตโนมัติตามจำนวนผู้ใช้และ\u00A0Pipeline",
      modelSelect: "โมเดล\u00A0Local\u00A0LLM\u00A0ที่ต้องการรันในองค์กร",
      wquant: "ความละเอียดน้ำหนักโมเดล\u00A0(Weight\u00A0Quantization)",
      kvquant: "ความละเอียด\u00A0KV\u00A0Cache",
      tokenBasis: "ฐานการนับจำนวนโทเคนของเอกสาร",
      basisLatin: "อ้างอิงเอกสารอังกฤษ\u00A0คูณตัวคูณภาษาไทย\u00A0(แนะนำ)",
      basisThai: "นับด้วย\u00A0Tokenizer\u00A0ภาษาไทยมาแล้ว\u00A0(คูณ\u00A01.0)",
      thaiMult: "ตัวคูณสัดส่วนโทเคนภาษาไทย\u00A0(สมมติฐานวางแผน)",
      rawPrompt: "โทเคนขาเข้าเฉลี่ยต่อคำถาม\u00A0(ก่อนคูณ)",
      rawOut: "โทเคนขาออกเฉลี่ยต่อคำตอบ",
      rawCtx: "ความยาว\u00A0Context\u00A0สูงสุดต่อรอบสนทนา\u00A0(ก่อนคูณ)",
      gpuSelect: "รุ่นการ์ด\u00A0GPU\u00A0สำหรับติดตั้งในองค์กร",
      quoteBasis: "รูปแบบการกรอกราคาเซิร์ฟเวอร์และ\u00A0GPU",
      qbCatalog: "ใช้ราคากลางอ้างอิงจากฐานข้อมูล\u00A0(Catalog)",
      qbIntegrated: "กรอกราคาต่อเครื่อง\u00A0(รวมการ์ด\u00A0GPU\u00A0ในเครื่องแล้ว)",
      qbSplit: "แยกกรอกราคาโครงเครื่องเปล่า\u00A0+\u00A0ราคาต่อการ์ด\u00A0GPU",
      qbFleet: "กรอกราคารวมฮาร์ดแวร์ทั้งโครงการก้อนเดียว",
      quoteCurrency: "สกุลเงินของใบเสนอราคาที่กรอก",
      serverConfig: "รุ่นโครงเซิร์ฟเวอร์อ้างอิง",
      nodes: "จำนวนเครื่องเซิร์ฟเวอร์\u00A0(Nodes)",
      gpusPerNode: "จำนวนการ์ด\u00A0GPU\u00A0ต่อ\u00A01\u00A0เครื่อง",
      integratedPrice: "ราคาต่อเครื่องเซิร์ฟเวอร์รวม\u00A0GPU",
      chassisPrice: "ราคาโครงเซิร์ฟเวอร์เปล่าต่อเครื่อง\u00A0(ไม่รวม\u00A0GPU)",
      gpuCardPrice: "ราคาการ์ด\u00A0GPU\u00A0ต่อ\u00A01\u00A0ใบ",
      fleetPrice: "ราคารวมฮาร์ดแวร์ทั้งหมดของดีลนี้",
      localImplFee: "ค่าบริการติดตั้งระบบและเชื่อม\u00A0Data\u00A0Pipeline\u00A0(ครั้งเดียว)",
      annualOpsFee: "ค่าดูแลรักษาระบบรายปี\u00A0Managed\u00A0Ops\u00A0(ถ้ามี)",
      apiOffer: "บริการ\u00A0Cloud\u00A0Model\u00A0API\u00A0ที่ใช้เปรียบเทียบความคุ้มทุน",
      elecRate: "ค่าไฟฟ้าต่อหน่วย\u00A0(บาท/kWh)",
    },
    kv: {
      dealTier: "ขนาดชุดโซลูชัน",
      mode: "รูปแบบการติดตั้ง",
      monthlyTokens: "ปริมาณโทเคนต่อเดือน",
      peakTokS: "ความเร็วช่วงพีคที่ต้องรองรับ",
      effCtx: "Context\u00A0หลังคิดสัดส่วนภาษาไทย",
      fitStatus: "ผลการตรวจความจุ\u00A0VRAM",
      fleet: "จำนวน\u00A0GPU\u00A0ใช้งานจริง\u00A0/\u00A0ขั้นต่ำ",
      hwCapex: "งบฮาร์ดแวร์\u00A0(Capex)",
      implOnce: "งบติดตั้งและเชื่อม\u00A0Pipeline",
      localMo: "ค่าไฟและดูแลรายเดือน\u00A0(Local)",
      apiMo: "ค่า\u00A0Cloud\u00A0API\u00A0รายเดือนเทียบเท่า",
      horizonLocal: "ต้นทุนรวม\u00A060\u00A0เดือน\u00A0(Local\u00A0AI)",
      horizonApi: "ต้นทุนรวม\u00A060\u00A0เดือน\u00A0(Cloud\u00A0API)",
    },
  },
  en: {
    backTco: "Back to TCO Calculator",
    taskbarTitle: "Enterprise Local AI Deal & Model Sizer",
    summaryHeading: "Live Sizing Readout",
    paybackLabel: "Payback vs. Cloud Model API",
    paybackHorizonSub: "60-month cumulative comparison (hardware + local integration included)",
    openTcoRail: "Open Full TCO Curve →",
    openTcoMain: "Open in Full 60-Month TCO Calculator →",
    printSheet: "Print 1-Page Deal Sheet",
    copyLink: "Copy Shareable Sizer Link",
    copiedLink: "Sizer link copied",
    exportJson: "Export Scenario JSON",
    resetBtn: "Reset Inputs",
    resetPrompt: "Reset all custom workload, model, and hardware quote fields back to defaults?",
    resetConfirm: "Confirm Reset",
    resetCancel: "Cancel",
    prevStep: "← Previous",
    steps: [
      { short: "Workload & Scale", next: "Next: Data Pipelines →", title: "1. Select a Local-AI Workload & Active User Scale", sub: "Start from an enterprise workload where data sovereignty or steady daily token volume favors owned GPUs, then tune headcount." },
      { short: "API / DB Pipelines", next: "Next: Thai Model Pass →", title: "2. Choose Greenfield vs. Brownfield & Existing Data Pipelines", sub: "Specify cluster readiness and select the live SQL databases, ERPs, APIs, and document streams integrated end-to-end." },
      { short: "Thai Model & VRAM", next: "Next: GPU & Server Price →", title: "3. Select Local Model & Verify Thai Token-Fertility VRAM Fit", sub: "Thai script uses higher subword density per clause than English; inspect structural Thai tiers and exact weight + KV memory fit." },
      { short: "GPU & Server BOM", next: "Next: Deal Ledger →", title: "4. Configure GPU Count, Server Nodes & Custom Hardware Quote", sub: "Pick a published server reference or enter your own per-server, chassis + GPU card, or total fleet quote in THB or USD." },
      { short: "Deal Ledger & TCO", next: "", title: "5. Review 60-Month Deal Ledger & Transfer to Full TCO Calculator", sub: "Verify hardware BOM, local integration fee, monthly electricity opex, and 60-month crossover before opening the full calculator." },
    ],
    labels: {
      users: "Active users (headcount)",
      sessionsDay: "Sessions per user / day",
      daysMo: "Working days / month",
      peakPct: "Peak concurrent users (%)",
      gfTitle: "Greenfield (Turnkey L1\u2013L4 Stack)",
      gfDesc: "Includes Kubernetes/OpenShift/NKP setup, GPU Operator, DCGM/vLLM telemetry, Thai OCR/RAG, and live data pipelines.",
      bfTitle: "Brownfield (Existing Cluster L3\u2013L4)",
      bfDesc: "Customer already operates a GPU-ready K8s cluster; delivers L3 Thai OCR/RAG + vLLM serving and L4 API/DB pipelines.",
      connectorsHeading: "Connect existing enterprise data pipelines (end-to-end system integration, not a chat wrapper)",
      tierSelect: "Deal scope tier (auto-recommended or pinned)",
      tierAuto: "Auto-recommend from user scale & pipelines",
      modelSelect: "Local open-weight model",
      wquant: "Weight quantization",
      kvquant: "KV cache precision",
      tokenBasis: "Prompt token count basis",
      basisLatin: "English reference prompt x Thai fertility multiplier (recommended)",
      basisThai: "Already measured with Thai tokenizer (1.0x)",
      thaiMult: "Thai token fertility multiplier (planning assumption)",
      rawPrompt: "Average prompt tokens / turn (raw)",
      rawOut: "Average output tokens / turn",
      rawCtx: "Target context window tokens (raw)",
      gpuSelect: "Self-hosted GPU accelerator",
      quoteBasis: "Hardware quote entry mode",
      qbCatalog: "Published catalog server reference",
      qbIntegrated: "Custom per-server quote (GPUs included)",
      qbSplit: "Separate bare chassis + per-GPU card quote",
      qbFleet: "Single total fleet hardware quote",
      quoteCurrency: "Entered quote currency",
      serverConfig: "Catalog server configuration",
      nodes: "Server node count",
      gpusPerNode: "Installed GPUs per server node",
      integratedPrice: "Per-server quote (GPUs included)",
      chassisPrice: "Bare server chassis price / node (excl. GPUs)",
      gpuCardPrice: "Per-GPU card price",
      fleetPrice: "Total hardware fleet quote",
      localImplFee: "Local AI & pipeline integration fee (one-time)",
      annualOpsFee: "Annual managed operations / support fee (optional)",
      apiOffer: "Comparable Cloud Model API offer",
      elecRate: "Facility electricity tariff (THB / kWh)",
    },
    kv: {
      dealTier: "Deal scope tier",
      mode: "Delivery structure",
      monthlyTokens: "Modelled tokens / month",
      peakTokS: "Required peak throughput",
      effCtx: "Thai-adjusted context",
      fitStatus: "VRAM & topology fit",
      fleet: "Installed / required GPUs",
      hwCapex: "Hardware BOM capex",
      implOnce: "Local integration (one-time)",
      localMo: "Local power + ops / mo",
      apiMo: "Cloud Model API / mo",
      horizonLocal: "60-month total (Local AI)",
      horizonApi: "60-month total (Cloud API)",
    },
  },
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const appState = {
  ready: false,
  loadError: null,
  lang: "th",
  displayCurrency: "THB",
  step: 0,
  confirmingReset: false,
  presetBanner: null,
  fieldErrors: {},
  data: {
    manifest: null,
    catalog: null,
    fx: null,
    gpuPricing: null,
    serverPricing: null,
    servingData: null,
    powerSeed: null,
    subscriptions: null,
  },
  draft: defaultDraft(),
  computed: null,
};

function defaultDraft() {
  const w = LOCAL_AI_WORKLOADS[0];
  return {
    workloadId: w.id,
    deploymentMode: "greenfield",
    connectors: [...w.defaultConnectors],
    dealTierOverride: null,
    users: String(w.users),
    sessionsPerUserDay: w.sessionsPerUserDay,
    workingDaysMo: w.workingDaysMo,
    peakConcurrencyFraction: w.peakConcurrencyFraction,
    tokensPerSecondPerStream: w.tokensPerSecondPerStream,
    mix: { ...w.mix },
    tokenBasis: "latin_reference_1_4x",
    thaiFertilityMultiplier: "1.4",
    rawPromptTokens: String(w.rawPromptTokens),
    rawOutputTokens: String(w.rawOutputTokens),
    rawContextTokens: String(w.rawContextTokens),
    modelId: w.recommendedModelId,
    wquant: "fp8",
    kvquant: "fp8",
    runtime: "vllm",
    gpuId: w.recommendedGpuId ?? "rtx_pro_6000_ws",
    quoteBasis: "catalog",
    quoteCurrency: "THB",
    serverId: "",
    serverPriceBasis: "usd_typical",
    nodes: "",
    gpusPerNode: "",
    integratedNodePrice: { amount: "1800000", currency: "THB" },
    chassisNodePrice: { amount: "450000", currency: "THB" },
    gpuUnitPrice: { amount: "340000", currency: "THB" },
    fleetTotalPrice: { amount: "1800000", currency: "THB" },
    localImplFee: { amount: "0", currency: "THB" },
    apiImplFee: { amount: "0", currency: "THB" },
    commonImplFee: { amount: "0", currency: "THB" },
    annualOpsFee: { amount: "0", currency: "THB" },
    electricityThbPerKwh: "4",
    pue: "1.4",
    nodeOverheadFraction: "0.2",
    horizonMonths: "60",
    apiOfferId: "",
    subscriptionId: "none",
    subscriptionTerm: "",
  };
}

function fmtInt(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "N/A";
  return new Intl.NumberFormat(appState.lang === "th" ? "th-TH" : "en-US", { maximumFractionDigits: 0 }).format(Math.round(num));
}

function fmtMoneyUsd(usdExact, places = 0) {
  if (usdExact === null || usdExact === undefined || !appState.data.fx) return "N/A";
  const r = toRat(usdExact);
  if (appState.displayCurrency === "USD") {
    const val = Number(formatHalfUp(r, places));
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: places, maximumFractionDigits: places }).format(val);
  }
  const thbRat = toTHB(r, appState.data.fx);
  const val = Number(formatHalfUp(thbRat, places));
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: places, maximumFractionDigits: places }).format(val);
}

function fmtIsoDate(iso) {
  if (!iso) return "N/A";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return new Intl.DateTimeFormat(appState.lang === "th" ? "th-TH" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return res.json();
}

function applyUrlStateOnBoot() {
  const url = new URL(window.location.href);
  const qLang = url.searchParams.get("lang");
  if (qLang === "en" || qLang === "th") appState.lang = qLang;
  const qCur = url.searchParams.get("cur");
  if (qCur === "USD" || qCur === "THB") appState.displayCurrency = qCur;
  const qStep = Number(url.searchParams.get("step"));
  if (Number.isInteger(qStep) && qStep >= 1 && qStep <= 5) appState.step = qStep - 1;

  const rawHash = url.hash.replace(/^#/, "");
  if (!rawHash) return;
  try {
    if (rawHash.startsWith("preset=v1.")) {
      const preset = decodePresetFragment(rawHash);
      if (preset) {
        applyPresetToDraft(preset);
        appState.presetBanner = "preset_applied";
      }
    } else if (rawHash.startsWith("sizer=v1.")) {
      const restored = decodeSizerFragment(rawHash);
      if (restored) {
        hydrateDraftFromNormalized(restored);
        appState.presetBanner = "sizer_restored";
      }
    }
  } catch (err) {
    appState.fieldErrors._global = err.message;
  }
}

function applyPresetToDraft(preset) {
  const snapshotDraft = structuredClone(appState.draft);
  const snapshotCurrency = appState.displayCurrency;
  try {
    if (preset.workloadId) selectWorkloadPreset(preset.workloadId);
    if (preset.deploymentMode === "greenfield" || preset.deploymentMode === "brownfield") {
      appState.draft.deploymentMode = preset.deploymentMode;
    }
    if ("dealTierOverride" in preset) {
      appState.draft.dealTierOverride = preset.dealTierOverride && DEAL_TIERS[preset.dealTierOverride]
        ? preset.dealTierOverride
        : null;
    }
    if (Array.isArray(preset.connectors)) appState.draft.connectors = [...preset.connectors];
    if (preset.users != null) appState.draft.users = String(preset.users);
    if (preset.modelId) appState.draft.modelId = String(preset.modelId);
    if (preset.gpuId) appState.draft.gpuId = String(preset.gpuId);
    if (preset.quoteBasis) appState.draft.quoteBasis = String(preset.quoteBasis);
    if (preset.quoteCurrency === "USD" || preset.quoteCurrency === "THB") {
      appState.draft.quoteCurrency = preset.quoteCurrency;
      appState.displayCurrency = preset.quoteCurrency;
    }
    if ("nodes" in preset) appState.draft.nodes = preset.nodes != null ? String(preset.nodes) : "";
    if ("gpusPerNode" in preset) appState.draft.gpusPerNode = preset.gpusPerNode != null ? String(preset.gpusPerNode) : "";
    if (preset.integratedNodePrice) appState.draft.integratedNodePrice = preset.integratedNodePrice;
    if (preset.fleetTotalPrice) appState.draft.fleetTotalPrice = preset.fleetTotalPrice;
    if (preset.localImplFee) appState.draft.localImplFee = preset.localImplFee;
    if (preset.annualOpsFee) appState.draft.annualOpsFee = preset.annualOpsFee;
    normalizeSizerInput(appState.draft);
  } catch (err) {
    appState.draft = snapshotDraft;
    appState.displayCurrency = snapshotCurrency;
    throw err;
  }
}

function hydrateDraftFromNormalized(n) {
  appState.draft = {
    ...appState.draft,
    workloadId: n.workloadId,
    deploymentMode: n.deploymentMode,
    connectors: [...n.connectors],
    dealTierOverride: n.dealTierOverride,
    users: String(n.users),
    sessionsPerUserDay: n.sessionsPerUserDay,
    workingDaysMo: String(n.workingDaysMo),
    peakConcurrencyFraction: n.peakConcurrencyFraction,
    tokensPerSecondPerStream: n.tokensPerSecondPerStream,
    mix: { ...n.mix },
    tokenBasis: n.tokenBasis,
    thaiFertilityMultiplier: n.thaiFertilityMultiplier,
    rawPromptTokens: String(n.rawPromptTokens),
    rawOutputTokens: String(n.rawOutputTokens),
    rawContextTokens: String(n.rawContextTokens),
    modelId: n.modelId,
    wquant: n.wquant,
    kvquant: n.kvquant,
    runtime: n.runtime,
    gpuId: n.gpuId,
    quoteBasis: n.quoteBasis,
    quoteCurrency: n.quoteCurrency,
    serverId: n.serverId,
    serverPriceBasis: n.serverPriceBasis,
    nodes: n.nodes ? String(n.nodes) : "",
    gpusPerNode: n.gpusPerNode ? String(n.gpusPerNode) : "",
    integratedNodePrice: { ...n.integratedNodePrice },
    chassisNodePrice: { ...n.chassisNodePrice },
    gpuUnitPrice: { ...n.gpuUnitPrice },
    fleetTotalPrice: { ...n.fleetTotalPrice },
    localImplFee: { ...n.localImplFee },
    apiImplFee: { ...n.apiImplFee },
    commonImplFee: { ...n.commonImplFee },
    annualOpsFee: { ...n.annualOpsFee },
    electricityThbPerKwh: n.electricityThbPerKwh,
    pue: n.pue,
    nodeOverheadFraction: n.nodeOverheadFraction,
    horizonMonths: String(n.horizonMonths),
    apiOfferId: n.apiOfferId,
    subscriptionId: n.subscriptionId,
    subscriptionTerm: n.subscriptionTerm,
  };
}

function selectWorkloadPreset(workloadId) {
  const w = LOCAL_AI_WORKLOADS.find((item) => item.id === workloadId);
  if (!w) return;
  appState.draft.workloadId = w.id;
  appState.draft.users = String(w.users);
  appState.draft.sessionsPerUserDay = w.sessionsPerUserDay;
  appState.draft.workingDaysMo = w.workingDaysMo;
  appState.draft.peakConcurrencyFraction = w.peakConcurrencyFraction;
  appState.draft.tokensPerSecondPerStream = w.tokensPerSecondPerStream;
  appState.draft.mix = { ...w.mix };
  appState.draft.rawPromptTokens = String(w.rawPromptTokens);
  appState.draft.rawOutputTokens = String(w.rawOutputTokens);
  appState.draft.rawContextTokens = String(w.rawContextTokens);
  appState.draft.modelId = w.recommendedModelId;
  if (w.recommendedGpuId) appState.draft.gpuId = w.recommendedGpuId;
  appState.draft.connectors = [...w.defaultConnectors];
}

function recompute() {
  appState.fieldErrors = {};
  try {
    const normalized = normalizeSizerInput(appState.draft);
    appState.computed = computeSizer({
      input: normalized,
      data: appState.data,
    });
  } catch (err) {
    appState.computed = null;
    appState.fieldErrors._form = err instanceof SizerValidationError ? err.message : String(err.message ?? err);
  }
}

function buildHandoffHref() {
  if (!appState.computed?.normalized) return "tco-calculator.html#custom-page";
  try {
    const frag = encodeSizerFragment(appState.computed.normalized, {
      pricingIdentity: appState.computed.pricingIdentity,
      resolvedApiOfferId: appState.computed.resolvedApiOfferId,
    });
    return `tco-calculator.html#${frag}`;
  } catch {
    return "tco-calculator.html#custom-page";
  }
}

function syncAddressBar() {
  if (!window.history?.replaceState || !appState.ready) return;
  const url = new URL(window.location.href);
  url.searchParams.set("lang", appState.lang);
  url.searchParams.set("cur", appState.displayCurrency);
  url.searchParams.set("step", String(appState.step + 1));
  if (appState.computed?.normalized) {
    try {
      const frag = encodeSizerFragment(appState.computed.normalized, {
        pricingIdentity: appState.computed.pricingIdentity,
        resolvedApiOfferId: appState.computed.resolvedApiOfferId,
      });
      url.hash = frag;
    } catch {
      // Keep existing hash if oversized
    }
  }
  window.history.replaceState(null, "", url.toString());
}

function renderChrome() {
  const t = I18N[appState.lang];
  document.documentElement.lang = appState.lang;
  $("lang-th").setAttribute("aria-pressed", String(appState.lang === "th"));
  $("lang-en").setAttribute("aria-pressed", String(appState.lang === "en"));
  $("cur-thb").setAttribute("aria-pressed", String(appState.displayCurrency === "THB"));
  $("cur-usd").setAttribute("aria-pressed", String(appState.displayCurrency === "USD"));

  document.querySelector('[data-i18n="backTco"]').textContent = t.backTco;
  $("taskbar-title").textContent = t.taskbarTitle;
  $("summary-heading").textContent = t.summaryHeading;
  $("summary-payback-label").textContent = t.paybackLabel;
  $("summary-payback-sub").textContent = t.paybackHorizonSub;

  const stepperHtml = t.steps.map((s, idx) => {
    const current = idx === appState.step ? ' aria-current="step"' : "";
    const complete = idx < appState.step ? ' data-complete="true"' : "";
    return `<li><button type="button" class="step-btn" data-goto="${idx}"${current}${complete}><span class="step-idx">${idx + 1}/5</span><span class="step-label">${esc(s.short)}</span></button></li>`;
  }).join("");
  $("wizard-stepper").innerHTML = stepperHtml;

  const stepMeta = t.steps[appState.step];
  $("stage-heading").textContent = stepMeta.title;
  $("stage-subtitle").textContent = stepMeta.sub;

  $("btn-prev").disabled = appState.step === 0;
  $("btn-prev").textContent = t.prevStep;
  $("btn-reset").textContent = t.resetBtn;

  const handoffHref = buildHandoffHref();
  const canTransfer = Boolean(appState.computed?.ok);
  const railLink = $("rail-open-tco");
  railLink.textContent = t.openTcoRail;
  railLink.href = handoffHref;
  if (canTransfer) railLink.removeAttribute("aria-disabled");
  else railLink.setAttribute("aria-disabled", "true");

  if (appState.step < 4) {
    $("footer-primary-actions").innerHTML = `<button type="button" class="btn btn-primary" id="btn-next">${esc(stepMeta.next)}</button>`;
  } else {
    $("footer-primary-actions").innerHTML = `
      <button type="button" class="btn no-print" id="btn-copy-link">${esc(t.copyLink)}</button>
      <button type="button" class="btn no-print" id="btn-export-json">${esc(t.exportJson)}</button>
      <button type="button" class="btn no-print" id="btn-print">${esc(t.printSheet)}</button>
      <a class="btn btn-primary" id="open-tco-cta" href="${esc(handoffHref)}"${canTransfer ? "" : ' aria-disabled="true"'}>${esc(t.openTcoMain)}</a>
    `;
  }

  const fxObs = fmtIsoDate(appState.data.fx?.observed_at);
  const fxVal = appState.data.fx ? formatHalfUp(appState.data.fx.rate, 3) : "N/A";
  const svObs = fmtIsoDate(appState.data.servingData?.provenance?.observed);
  $("source-footnote").textContent = appState.lang === "th"
    ? `แหล่งข้อมูลอ้างอิงภายในเว็บ: โมเดลอัปเดต ${svObs} · อัตราแลกเปลี่ยนอ้างอิง 1 USD = ${fxVal} THB (${fxObs}) · ประมวลผลในหน่วยความจำของแท็บนี้โดยไม่ส่งข้อมูลออกภายนอก`
    : `Dated local snapshots: serving models ${svObs} · reference FX 1 USD = ${fxVal} THB (${fxObs}) · evaluated in-memory with zero browser storage or external inference calls.`;
}

function renderStatusBanner() {
  const bar = $("live-announcer");
  if (appState.loadError) {
    bar.dataset.state = "error";
    bar.textContent = appState.loadError;
    return;
  }
  if (appState.fieldErrors._form) {
    bar.dataset.state = "error";
    bar.textContent = appState.lang === "th"
      ? `ข้อมูลยังไม่ครบถ้วน: ${appState.fieldErrors._form} กรุณาแก้ไขช่องที่ระบุเพื่อคำนวณต่อ`
      : `Input validation required: ${appState.fieldErrors._form}. Adjust the highlighted value to continue.`;
    return;
  }
  const c = appState.computed;
  if (!c) {
    bar.dataset.state = "warn";
    bar.textContent = appState.lang === "th" ? "กรุณาตรวจสอบตัวเลขที่กรอก" : "Review input parameters.";
    return;
  }
  if (!c.ok) {
    bar.dataset.state = "error";
    const reason = c.fit?.reason ?? c.bom?.reason ?? "Configuration refused.";
    bar.textContent = appState.lang === "th"
      ? `[ไม่ผ่านเกณฑ์ทางเทคนิค] ${reason} (แนะนำ: เพิ่มจำนวน GPU ต่อเครื่อง ลด Context หรือเลือกโมเดลขนาดเล็กลง)`
      : `[Configuration Refused] ${reason} (Next step: select a higher-VRAM GPU, add GPUs per node, or choose a compact model).`;
    return;
  }
  if (c.fit.warnings.length > 0) {
    bar.dataset.state = "warn";
    const wText = appState.lang === "th" ? c.fit.warnings[0].th : c.fit.warnings[0].en;
    bar.textContent = `[CONDITIONAL FIT] ${wText}`;
    return;
  }
  bar.dataset.state = "ok";
  bar.textContent = appState.lang === "th"
    ? `[PASS] โมเดลและฮาร์ดแวร์ผ่านเกณฑ์ความจุ VRAM และสัดส่วนโทเคนภาษาไทย (${c.bom.installedGpus}x ${c.normalized.gpuId} บน ${c.bom.nodes} เครื่อง)`
    : `[PASS] Qualified VRAM & node-local TP fit (${c.bom.installedGpus}x ${c.normalized.gpuId} across ${c.bom.nodes} node${c.bom.nodes === 1 ? "" : "s"}).`;
}

function renderSummaryRail() {
  const t = I18N[appState.lang];
  const c = appState.computed;
  const pbVal = $("summary-payback-value");

  if (!c || !c.ok || !c.comparison) {
    pbVal.textContent = appState.lang === "th" ? "รอปรับสเปก" : "Refused / Pending";
    $("summary-kv").innerHTML = `<div class="kv-row"><dt>${esc(t.kv.fitStatus)}</dt><dd><span class="badge badge-bad">REFUSED</span></dd></div>`;
    return;
  }

  const pb = c.comparison.payback?.vs_model_api;
  if (pb?.months !== null && pb?.months !== undefined) {
    pbVal.textContent = appState.lang === "th"
      ? `${fmtInt(pb.months)}\u00A0เดือน`
      : `${fmtInt(pb.months)} mo`;
  } else if (pb?.reason === "zero_capex") {
    pbVal.textContent = appState.lang === "th" ? "คืนทุนทันที" : "0 mo";
  } else {
    pbVal.textContent = appState.lang === "th" ? ">\u00A060\u00A0เดือน" : "> 60 mo";
  }

  const totA = c.comparison.totals?.A;
  const totB = c.comparison.totals?.B;
  const fitBadge = c.fit.qualifiedDeploymentPass
    ? `<span class="badge badge-ok">PASS TP=${c.fit.serving.gpus_per_replica}</span>`
    : `<span class="badge badge-warn">CONDITIONAL TP=${c.fit.serving.gpus_per_replica}</span>`;

  const rows = [
    [t.kv.dealTier, `<span class="badge badge-accent">Size ${esc(c.dealTier)}</span>`],
    [t.kv.mode, esc(c.normalized.deploymentMode === "greenfield" ? "Greenfield (L1\u2013L4)" : "Brownfield (L3\u2013L4)")],
    [t.kv.monthlyTokens, `${fmtInt(c.demand.tokens_mo.text)} tok`],
    [t.kv.peakTokS, `${formatHalfUp(toRat(c.peak.peak_tokens_s.text), 1)} tok/s`],
    [t.kv.effCtx, `${fmtInt(c.normalized.effectiveContextTokens)} tok`],
    [t.kv.fitStatus, fitBadge],
    [t.kv.fleet, `${c.bom.installedGpus} / ${c.sizing.gpusRequired} GPU (${c.bom.nodes}n)`],
    [t.kv.hwCapex, esc(fmtMoneyUsd(c.bom.capexUsd))],
    [t.kv.implOnce, esc(fmtMoneyUsd(c.scenarioInputs.oneTime.A))],
    [t.kv.localMo, esc(totA?.priced ? fmtMoneyUsd(totA.monthly_total) : "N/A")],
    [t.kv.apiMo, esc(totB?.priced ? fmtMoneyUsd(totB.monthly_total) : "N/A")],
    [t.kv.horizonLocal, esc(totA?.priced ? fmtMoneyUsd(totA.horizon_total) : "N/A")],
    [t.kv.horizonApi, esc(totB?.priced ? fmtMoneyUsd(totB.horizon_total) : "N/A")],
  ];

  $("summary-kv").innerHTML = rows
    .map(([k, v]) => `<div class="kv-row"><dt>${esc(k)}</dt><dd>${v}</dd></div>`)
    .join("");
}

function renderStep1() {
  const t = I18N[appState.lang];
  const d = appState.draft;
  const pctDisplay = formatHalfUp(toRat(d.peakConcurrencyFraction).mul(toRat("100")), 1).replace(/\.0$/, "");

  const cards = LOCAL_AI_WORKLOADS.map((w) => {
    const loc = w[appState.lang];
    const pressed = d.workloadId === w.id ? "true" : "false";
    return `
      <button type="button" class="choice-btn" data-workload="${esc(w.id)}" aria-pressed="${pressed}">
        <div class="choice-top">
          <span class="choice-title">${esc(loc.title)}</span>
          <span class="badge">${esc(w.recommendedTier)} · ${fmtInt(w.users)}u</span>
        </div>
        <span class="choice-desc">${esc(loc.whyLocal)}</span>
        <span class="choice-meta">Prompt ${fmtInt(w.rawPromptTokens)} tok · Out ${fmtInt(w.rawOutputTokens)} tok · Model ${esc(w.recommendedModelId)}</span>
      </button>`;
  }).join("");

  return `
    <div class="choice-grid" role="group" aria-label="Workload presets">${cards}</div>
    <div class="field-grid">
      <div class="field">
        <label for="in-users">${esc(t.labels.users)}</label>
        <input id="in-users" name="users" class="num-input" type="text" inputmode="numeric" autocomplete="off" value="${esc(d.users)}">
      </div>
      <div class="field">
        <label for="in-sessions">${esc(t.labels.sessionsDay)}</label>
        <input id="in-sessions" name="sessionsPerUserDay" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${esc(d.sessionsPerUserDay)}">
      </div>
      <div class="field">
        <label for="in-days">${esc(t.labels.daysMo)}</label>
        <input id="in-days" name="workingDaysMo" class="num-input" type="text" inputmode="numeric" autocomplete="off" value="${esc(d.workingDaysMo)}">
      </div>
      <div class="field">
        <label for="in-peak">${esc(t.labels.peakPct)}</label>
        <input id="in-peak" name="peakPct" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${esc(pctDisplay)}">
      </div>
    </div>
  `;
}

function renderStep2() {
  const t = I18N[appState.lang];
  const d = appState.draft;
  const activeTierId = appState.computed?.dealTier ?? "M";
  const tierObj = DEAL_TIERS[activeTierId];
  const tierLoc = tierObj[appState.lang];

  const connItems = PIPELINE_CONNECTORS.map((conn) => {
    const loc = conn[appState.lang];
    const checked = d.connectors.includes(conn.id) ? " checked" : "";
    return `
      <li class="connector-item">
        <label class="connector-label" for="conn-${esc(conn.id)}">
          <input type="checkbox" id="conn-${esc(conn.id)}" name="connector" value="${esc(conn.id)}"${checked}>
          <span class="connector-text">
            <span class="connector-name">${esc(loc.label)}</span>
            <span class="connector-detail">${esc(loc.detail)}</span>
          </span>
          <span class="badge">${esc(conn.pillar)}</span>
        </label>
      </li>`;
  }).join("");

  return `
    <div class="choice-grid" role="group" aria-label="Deployment structure">
      <button type="button" class="choice-btn" data-mode="greenfield" aria-pressed="${d.deploymentMode === "greenfield"}">
        <div class="choice-top">
          <span class="choice-title">${esc(t.labels.gfTitle)}</span>
          <span class="badge badge-accent">L1\u2013L4</span>
        </div>
        <span class="choice-desc">${esc(t.labels.gfDesc)}</span>
      </button>
      <button type="button" class="choice-btn" data-mode="brownfield" aria-pressed="${d.deploymentMode === "brownfield"}">
        <div class="choice-top">
          <span class="choice-title">${esc(t.labels.bfTitle)}</span>
          <span class="badge">L3\u2013L4</span>
        </div>
        <span class="choice-desc">${esc(t.labels.bfDesc)}</span>
      </button>
    </div>

    <div>
      <h3>${esc(t.labels.connectorsHeading)}</h3>
      <ul class="connector-list">${connItems}</ul>
    </div>

    <div class="field-grid two">
      <div class="field">
        <label for="in-tier-override">${esc(t.labels.tierSelect)}</label>
        <select id="in-tier-override" name="dealTierOverride">
          <option value=""${!d.dealTierOverride ? " selected" : ""}>${esc(t.labels.tierAuto)} (→ Size ${esc(activeTierId)})</option>
          ${Object.keys(DEAL_TIERS).map((k) => `<option value="${k}"${d.dealTierOverride === k ? " selected" : ""}>Size ${k} (${esc(DEAL_TIERS[k].usersBand)} users · ${DEAL_TIERS[k].connectorsIncluded} pipelines)</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <span class="field-hint">${esc(tierLoc.name)} (${esc(tierObj.durationWeeks)} wks)</span>
        <p class="stage-sub" style="font-size:12px">${esc(d.deploymentMode === "greenfield" ? tierLoc.gfScope : tierLoc.bfScope)}</p>
      </div>
    </div>
  `;
}

function renderStep3() {
  const t = I18N[appState.lang];
  const d = appState.draft;
  const models = (appState.data.servingData?.models ?? []).filter((m) => m.id !== "custom");
  const wqOpts = Object.entries(appState.data.servingData?.weight_quantization ?? {});
  const kqOpts = Object.entries(appState.data.servingData?.kv_quantization ?? {});

  const profile = THAI_MODEL_PROFILES[d.modelId];
  const tierText = profile ? (appState.lang === "th" ? profile.thTier : profile.enTier) : "General Multilingual Model";
  const noteText = profile ? (appState.lang === "th" ? profile.thNote : profile.enNote) : "";
  const fit = appState.computed?.fit;
  const sv = fit?.serving;

  return `
    <div class="field-grid two">
      <div class="field">
        <label for="in-model">${esc(t.labels.modelSelect)}</label>
        <select id="in-model" name="modelId">
          ${models.map((m) => `<option value="${esc(m.id)}"${m.id === d.modelId ? " selected" : ""}>${esc(m.label)} (${esc(m.params_b)}B)</option>`).join("")}
        </select>
        <span class="field-hint">${esc(tierText)}</span>
      </div>
      <div class="field">
        <label for="in-token-basis">${esc(t.labels.tokenBasis)}</label>
        <select id="in-token-basis" name="tokenBasis">
          <option value="latin_reference_1_4x"${d.tokenBasis === "latin_reference_1_4x" ? " selected" : ""}>${esc(t.labels.basisLatin)}</option>
          <option value="thai_tokenized_1x"${d.tokenBasis === "thai_tokenized_1x" ? " selected" : ""}>${esc(t.labels.basisThai)}</option>
        </select>
        <span class="field-hint">${esc(noteText)}</span>
      </div>
    </div>

    <div class="field-grid">
      <div class="field">
        <label for="in-wquant">${esc(t.labels.wquant)}</label>
        <select id="in-wquant" name="wquant">
          ${wqOpts.map(([k, v]) => `<option value="${esc(k)}"${k === d.wquant ? " selected" : ""}>${esc(v.label ?? k)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="in-kvquant">${esc(t.labels.kvquant)}</label>
        <select id="in-kvquant" name="kvquant">
          ${kqOpts.map(([k, v]) => `<option value="${esc(k)}"${k === d.kvquant ? " selected" : ""}>${esc(v.label ?? k)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="in-thai-mult">${esc(t.labels.thaiMult)}</label>
        <input id="in-thai-mult" name="thaiFertilityMultiplier" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${esc(d.thaiFertilityMultiplier)}"${d.tokenBasis === "thai_tokenized_1x" ? " disabled" : ""}>
      </div>
      <div class="field">
        <label for="in-raw-prompt">${esc(t.labels.rawPrompt)}</label>
        <input id="in-raw-prompt" name="rawPromptTokens" class="num-input" type="text" inputmode="numeric" autocomplete="off" value="${esc(d.rawPromptTokens)}">
      </div>
      <div class="field">
        <label for="in-raw-out">${esc(t.labels.rawOut)}</label>
        <input id="in-raw-out" name="rawOutputTokens" class="num-input" type="text" inputmode="numeric" autocomplete="off" value="${esc(d.rawOutputTokens)}">
      </div>
      <div class="field">
        <label for="in-raw-ctx">${esc(t.labels.rawCtx)}</label>
        <input id="in-raw-ctx" name="rawContextTokens" class="num-input" type="text" inputmode="numeric" autocomplete="off" value="${esc(d.rawContextTokens)}">
      </div>
    </div>

    <div class="table-scroll">
      <table class="ledger-table">
        <thead>
          <tr>
            <th>${appState.lang === "th" ? "รายการตรวจความจุ\u00A0VRAM\u00A0และภาษาไทย" : "Thai Token & VRAM Qualification Check"}</th>
            <th>${appState.lang === "th" ? "รายละเอียด" : "Basis"}</th>
            <th class="col-num">${appState.lang === "th" ? "ค่าที่คำนวณได้" : "Calculated Value"}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${appState.lang === "th" ? "โทเคนขาเข้าและ\u00A0Context\u00A0สุทธิ" : "Effective Prompt / Context"}</td>
            <td><span class="cell-truncate" title="${esc(d.tokenBasis)}">${esc(d.tokenBasis === "latin_reference_1_4x" ? `Raw x ${d.thaiFertilityMultiplier} (applied once)` : "Thai tokenized 1.0x")}</span></td>
            <td class="col-num">${appState.computed ? `${fmtInt(appState.computed.normalized.effectivePromptTokens)} / ${fmtInt(appState.computed.normalized.effectiveContextTokens)} tok` : "N/A"}</td>
          </tr>
          <tr>
            <td>${appState.lang === "th" ? "ขนาดน้ำหนักโมเดล\u00A0(Weights)" : "Resident Model Weights"}</td>
            <td>${esc(d.wquant.toUpperCase())}</td>
            <td class="col-num">${sv ? `${esc(sv.weights_gb_resident.text)} GB` : "N/A"}</td>
          </tr>
          <tr>
            <td>${appState.lang === "th" ? "หน่วยความจำ\u00A0KV\u00A0Cache\u00A0ต่อคำขอ" : "KV Cache per Active Sequence"}</td>
            <td>${esc(d.kvquant.toUpperCase())} @ ${appState.computed ? fmtInt(appState.computed.normalized.effectiveContextTokens) : "0"} tok</td>
            <td class="col-num">${sv ? `${esc(sv.kv_gb_per_sequence.text)} GB` : "N/A"}</td>
          </tr>
          <tr>
            <td>${appState.lang === "th" ? "รูปแบบ\u00A0Tensor\u00A0Parallel\u00A0และความเร็วต่อรีพลิกา" : "Replica Tensor Parallel & Roofline"}</td>
            <td>${esc(d.gpuId)}</td>
            <td class="col-num">${sv ? `TP=${sv.gpus_per_replica} · ${esc(sv.tokens_s_per_replica.text)} tok/s` : "Refused"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderStep4() {
  const t = I18N[appState.lang];
  const d = appState.draft;
  const gpusObj = appState.data.gpuPricing?.gpus ?? {};
  const offerableGpus = [...new Set([
    ...(appState.data.gpuPricing?.rows ?? []).map((r) => r.gpu_id),
    ...(appState.data.serverPricing?.rows ?? []).map((r) => r.gpu_id),
  ])].filter((id) => appState.data.servingData?.accelerators?.[id]);

  const srvRows = serversForGpu(d.gpuId, appState.data.serverPricing?.rows ?? []);
  const allActiveOffers = (appState.data.manifest?.models ?? [])
    .filter((m) => !["retired", "quarantined"].includes(m.state) && appState.data.catalog?.offers?.[m.id]);
  const selectedApi = appState.computed?.resolvedApiOfferId || d.apiOfferId;
  const baseSlice = allActiveOffers.slice(0, 60);
  const selectedObj = allActiveOffers.find((m) => m.id === selectedApi)
    ?? (selectedApi && appState.data.catalog?.offers?.[selectedApi]
      ? { id: selectedApi, name: appState.data.catalog.offers[selectedApi].display_name ?? selectedApi }
      : null);
  const activeOffers = selectedObj && !baseSlice.some((m) => m.id === selectedObj.id)
    ? [selectedObj, ...baseSlice]
    : baseSlice;
  const curSym = d.quoteCurrency === "USD" ? "USD ($)" : "THB (฿)";

  let priceFieldsHtml = "";
  if (d.quoteBasis === "catalog") {
    priceFieldsHtml = `
      <div class="field">
        <label for="in-server-id">${esc(t.labels.serverConfig)}</label>
        <select id="in-server-id" name="serverId">
          ${srvRows.length
            ? srvRows.map((r) => `<option value="${esc(r.server_id)}"${r.server_id === (appState.computed?.bom?.serverId || d.serverId) ? " selected" : ""}>${r.gpu_count}x ${esc(r.form_factor)} (${esc(fmtMoneyUsd(String(r.usd_typical)))})</option>`).join("")
            : `<option value="">No catalog server (switch to custom quote)</option>`}
        </select>
      </div>`;
  } else if (d.quoteBasis === "integrated_node") {
    priceFieldsHtml = `
      <div class="field">
        <label for="in-int-price">${esc(t.labels.integratedPrice)} (${curSym})</label>
        <input id="in-int-price" name="integratedNodePrice" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${esc(d.integratedNodePrice.amount)}">
      </div>`;
  } else if (d.quoteBasis === "component_split") {
    priceFieldsHtml = `
      <div class="field">
        <label for="in-chassis-price">${esc(t.labels.chassisPrice)} (${curSym})</label>
        <input id="in-chassis-price" name="chassisNodePrice" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${esc(d.chassisNodePrice.amount)}">
      </div>
      <div class="field">
        <label for="in-gpu-price">${esc(t.labels.gpuCardPrice)} (${curSym})</label>
        <input id="in-gpu-price" name="gpuUnitPrice" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${esc(d.gpuUnitPrice.amount)}">
      </div>`;
  } else {
    priceFieldsHtml = `
      <div class="field">
        <label for="in-fleet-price">${esc(t.labels.fleetPrice)} (${curSym})</label>
        <input id="in-fleet-price" name="fleetTotalPrice" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${esc(d.fleetTotalPrice.amount)}">
      </div>`;
  }

  const effNodes = d.nodes || (appState.computed?.bom?.nodes ? String(appState.computed.bom.nodes) : "1");
  const effGpn = d.gpusPerNode || (appState.computed?.bom?.gpusPerNode ? String(appState.computed.bom.gpusPerNode) : "2");

  return `
    <div class="field-grid">
      <div class="field">
        <label for="in-gpu">${esc(t.labels.gpuSelect)}</label>
        <select id="in-gpu" name="gpuId">
          ${offerableGpus.map((id) => `<option value="${esc(id)}"${id === d.gpuId ? " selected" : ""}>${esc(gpusObj[id]?.label ?? id)} (${gpusObj[id]?.vram_gb ?? "?"} GB)</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="in-quote-basis">${esc(t.labels.quoteBasis)}</label>
        <select id="in-quote-basis" name="quoteBasis">
          <option value="catalog"${d.quoteBasis === "catalog" ? " selected" : ""}>${esc(t.labels.qbCatalog)}</option>
          <option value="integrated_node"${d.quoteBasis === "integrated_node" ? " selected" : ""}>${esc(t.labels.qbIntegrated)}</option>
          <option value="component_split"${d.quoteBasis === "component_split" ? " selected" : ""}>${esc(t.labels.qbSplit)}</option>
          <option value="fleet_total"${d.quoteBasis === "fleet_total" ? " selected" : ""}>${esc(t.labels.qbFleet)}</option>
        </select>
      </div>
      <div class="field">
        <label for="in-quote-cur">${esc(t.labels.quoteCurrency)}</label>
        <select id="in-quote-cur" name="quoteCurrency">
          <option value="THB"${d.quoteCurrency === "THB" ? " selected" : ""}>THB (฿)</option>
          <option value="USD"${d.quoteCurrency === "USD" ? " selected" : ""}>USD ($)</option>
        </select>
      </div>
    </div>

    <div class="field-grid">
      <div class="field">
        <label for="in-nodes">${esc(t.labels.nodes)}</label>
        <input id="in-nodes" name="nodes" class="num-input" type="text" inputmode="numeric" autocomplete="off" value="${esc(d.quoteBasis === "catalog" && !d.nodes ? "" : effNodes)}" placeholder="${esc(effNodes)}">
      </div>
      <div class="field">
        <label for="in-gpn">${esc(t.labels.gpusPerNode)}</label>
        <input id="in-gpn" name="gpusPerNode" class="num-input" type="text" inputmode="numeric" autocomplete="off" value="${esc(d.quoteBasis === "catalog" && !d.gpusPerNode ? "" : effGpn)}" placeholder="${esc(effGpn)}"${d.quoteBasis === "catalog" ? " disabled" : ""}>
      </div>
      ${priceFieldsHtml}
    </div>

    <div class="field-grid">
      <div class="field">
        <label for="in-local-impl">${esc(t.labels.localImplFee)} (${curSym})</label>
        <input id="in-local-impl" name="localImplFee" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${esc(d.localImplFee.amount)}">
      </div>
      <div class="field">
        <label for="in-annual-ops">${esc(t.labels.annualOpsFee)} (${curSym})</label>
        <input id="in-annual-ops" name="annualOpsFee" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${esc(d.annualOpsFee.amount)}">
      </div>
      <div class="field">
        <label for="in-elec">${esc(t.labels.elecRate)}</label>
        <input id="in-elec" name="electricityThbPerKwh" class="num-input" type="text" inputmode="decimal" autocomplete="off" value="${esc(d.electricityThbPerKwh)}">
      </div>
    </div>

    <div class="field-grid two">
      <div class="field">
        <label for="in-api-offer">${esc(t.labels.apiOffer)}</label>
        <select id="in-api-offer" name="apiOfferId">
          ${activeOffers.map((m) => `<option value="${esc(m.id)}"${m.id === selectedApi ? " selected" : ""}>${esc(m.name)} [${esc(m.id)}]</option>`).join("")}
        </select>
      </div>
    </div>
  `;
}

function renderMiniCurveSvg(curve) {
  if (!Array.isArray(curve) || curve.length < 2) return "";
  const w = 680;
  const h = 210;
  const padL = 72;
  const padR = 20;
  const padT = 16;
  const padB = 28;
  let maxRat = toRat("1");
  const toNum = (val) => {
    if (val === null || val === undefined) return 0;
    const r = toRat(String(val));
    if (r.gt(maxRat)) maxRat = r;
    return Number(formatHalfUp(r, 2));
  };
  const ptsA = curve.map((p) => toNum(p.A));
  const ptsB = curve.map((p) => toNum(p.B));
  const maxY = Math.max(1, Number(formatHalfUp(maxRat, 2)));
  const xAt = (i) => padL + (i / (curve.length - 1)) * (w - padL - padR);
  const yAt = (v) => padT + (1 - v / maxY) * (h - padT - padB);
  const pathFor = (arr) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");

  const maxLabel = fmtMoneyUsd(ratStr(maxRat));
  return `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="210" role="img" aria-label="60-month cumulative cost curve: Self-hosted Local AI vs Cloud Model API" style="display:block;border:1px solid var(--line);border-radius:4px;background:var(--surface-1)">
      <line x1="${padL}" y1="${padT}" x2="${w - padR}" y2="${padT}" stroke="#262638" stroke-dasharray="3 3"/>
      <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="#3A3A54"/>
      <text x="${padL - 8}" y="${padT + 10}" fill="#9490AB" font-size="11" font-family="Geist Mono, monospace" text-anchor="end">${esc(maxLabel)}</text>
      <text x="${padL - 8}" y="${h - padB}" fill="#9490AB" font-size="11" font-family="Geist Mono, monospace" text-anchor="end">0</text>
      <text x="${padL}" y="${h - 8}" fill="#9490AB" font-size="11" font-family="Geist Mono, monospace">M0</text>
      <text x="${w - padR}" y="${h - 8}" fill="#9490AB" font-size="11" font-family="Geist Mono, monospace" text-anchor="end">M${curve.length - 1}</text>
      <path d="${pathFor(ptsB)}" fill="none" stroke="#9490AB" stroke-width="2" stroke-dasharray="5 4"/>
      <path d="${pathFor(ptsA)}" fill="none" stroke="#B46EFF" stroke-width="2.5"/>
    </svg>
  `;
}

function renderStep5() {
  const c = appState.computed;
  if (!c || !c.ok || !c.comparison) {
    return `<p class="stage-sub">${appState.lang === "th" ? "กรุณาแก้ไขสเปกในขั้นตอนก่อนหน้าเพื่อให้ได้ตารางเปรียบเทียบที่สมบูรณ์" : "Resolve the sizing refusal in Steps 3\u20134 to generate the 60-month deal ledger."}</p>`;
  }

  const totA = c.comparison.totals.A;
  const totB = c.comparison.totals.B;
  const totC = c.comparison.totals.C;
  const connNames = c.normalized.connectors
    .map((id) => PIPELINE_CONNECTORS.find((p) => p.id === id)?.[appState.lang]?.label ?? id)
    .join(", ") || "None";

  const pb = c.comparison.payback?.vs_model_api;
  const pbText = pb?.months != null
    ? (appState.lang === "th" ? `คืนทุนในเดือนที่ ${pb.months}` : `Month ${pb.months} crossover`)
    : (appState.lang === "th" ? `ไม่ตัดกันภายใน ${c.normalized.horizonMonths} เดือน` : `Beyond ${c.normalized.horizonMonths} months`);

  return `
    ${renderMiniCurveSvg(c.comparison.curve)}
    <div class="table-scroll">
      <table class="ledger-table">
        <thead>
          <tr>
            <th>${appState.lang === "th" ? "รายการองค์ประกอบดีล\u00A0/\u00A0ทางเลือก" : "Deal Component / Option"}</th>
            <th>${appState.lang === "th" ? "รายละเอียดทางเทคนิค\u00A0(พร้อมระบบข้อมูลที่เชื่อม)" : "Technical Basis & Pipeline Scope"}</th>
            <th class="col-num">${appState.lang === "th" ? "ลงทุนครั้งเดียว" : "Upfront (One-Time)"}</th>
            <th class="col-num">${appState.lang === "th" ? "รายเดือน" : "Monthly Run"}</th>
            <th class="col-num">${appState.lang === "th" ? "รวม\u00A060\u00A0เดือน" : "60-Month Total"}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Local AI (Owned)</strong></td>
            <td><span class="cell-truncate" title="${esc(`${c.bom.installedGpus}x ${c.normalized.gpuId} (${c.bom.nodes}n) · Size ${c.dealTier} ${c.normalized.deploymentMode} · Pipelines: ${connNames}`)}">${esc(`${c.bom.installedGpus}x ${c.normalized.gpuId} (${c.bom.nodes}n) · Size ${c.dealTier} · ${connNames}`)}</span></td>
            <td class="col-num">${esc(fmtMoneyUsd(totA.one_time))}</td>
            <td class="col-num">${esc(fmtMoneyUsd(totA.monthly_total))}</td>
            <td class="col-num"><strong>${esc(fmtMoneyUsd(totA.horizon_total))}</strong></td>
          </tr>
          <tr>
            <td>Hardware BOM Only</td>
            <td><span class="cell-truncate" title="${esc(`Quote basis: ${c.bom.quoteBasis}`)}">${esc(`Basis: ${c.bom.quoteBasis} (${c.bom.nodes} node x ${c.bom.gpusPerNode} GPU)`)}</span></td>
            <td class="col-num">${esc(fmtMoneyUsd(c.bom.capexUsd))}</td>
            <td class="col-num">${esc(c.powerPlan ? fmtMoneyUsd(c.powerPlan.monthly_usd) : "N/A")}</td>
            <td class="col-num">${esc(fmtMoneyUsd(c.bom.capexUsd))}</td>
          </tr>
          <tr>
            <td>Local Pipeline &amp; Stack Integration</td>
            <td><span class="cell-truncate" title="${esc(connNames)}">${esc(`Size ${c.dealTier} (${c.normalized.deploymentMode}): ${connNames}`)}</span></td>
            <td class="col-num">${esc(fmtMoneyUsd(c.scenarioInputs.oneTime.A))}</td>
            <td class="col-num">${esc(fmtMoneyUsd(c.monthlyOpsUsd))}</td>
            <td class="col-num">${esc(pbText)}</td>
          </tr>
          <tr>
            <td>Cloud Model API</td>
            <td><span class="cell-truncate" title="${esc(c.resolvedApiOfferId)}">${esc(c.resolvedApiOfferId || "Unselected")}</span></td>
            <td class="col-num">${esc(fmtMoneyUsd(totB.one_time))}</td>
            <td class="col-num">${esc(totB.priced ? fmtMoneyUsd(totB.monthly_total) : "N/A")}</td>
            <td class="col-num">${esc(totB.priced ? fmtMoneyUsd(totB.horizon_total) : "N/A")}</td>
          </tr>
          <tr>
            <td>Rented Cloud GPU</td>
            <td><span class="cell-truncate" title="${esc(c.scenarioInputs.laneC.hardware_topology ?? "N/A")}">${esc(c.scenarioInputs.laneC.hardware_topology ?? "Unavailable")}</span></td>
            <td class="col-num">${esc(fmtMoneyUsd(totC.one_time))}</td>
            <td class="col-num">${esc(totC.priced ? fmtMoneyUsd(totC.monthly_total) : "N/A")}</td>
            <td class="col-num">${esc(totC.priced ? fmtMoneyUsd(totC.horizon_total) : "N/A")}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderResetConfirmation() {
  const box = $("reset-confirm");
  if (!appState.confirmingReset) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const t = I18N[appState.lang];
  box.hidden = false;
  box.innerHTML = `
    <span>${esc(t.resetPrompt)}</span>
    <div class="btn-row">
      <button type="button" class="btn btn-danger" id="btn-confirm-reset">${esc(t.resetConfirm)}</button>
      <button type="button" class="btn" id="btn-cancel-reset">${esc(t.resetCancel)}</button>
    </div>
  `;
}

function renderAll({ preserveStepDom = false } = {}) {
  recompute();
  renderChrome();
  renderStatusBanner();
  renderSummaryRail();
  renderResetConfirmation();
  if (!preserveStepDom) {
    const renderers = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5];
    $("step-body").innerHTML = renderers[appState.step]();
  }
  syncAddressBar();
}

function wireEvents() {
  $("lang-th").addEventListener("click", () => { appState.lang = "th"; renderAll(); });
  $("lang-en").addEventListener("click", () => { appState.lang = "en"; renderAll(); });
  $("cur-thb").addEventListener("click", () => { appState.displayCurrency = "THB"; renderAll(); });
  $("cur-usd").addEventListener("click", () => { appState.displayCurrency = "USD"; renderAll(); });

  $("wizard-stepper").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-goto]");
    if (!btn) return;
    appState.step = Number(btn.dataset.goto);
    renderAll();
  });

  $("btn-prev").addEventListener("click", () => {
    if (appState.step > 0) {
      appState.step -= 1;
      renderAll();
    }
  });

  $("btn-reset").addEventListener("click", () => {
    appState.confirmingReset = true;
    renderResetConfirmation();
    $("btn-confirm-reset")?.focus();
  });

  $("reset-confirm").addEventListener("click", (e) => {
    if (e.target.id === "btn-confirm-reset") {
      appState.confirmingReset = false;
      appState.draft = defaultDraft();
      appState.step = 0;
      renderAll();
    } else if (e.target.id === "btn-cancel-reset") {
      appState.confirmingReset = false;
      renderResetConfirmation();
      $("btn-reset").focus();
    }
  });

  $("footer-primary-actions").addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.id === "btn-next" && appState.step < 4) {
      appState.step += 1;
      renderAll();
    } else if (btn.id === "btn-print") {
      window.print();
    } else if (btn.id === "btn-copy-link") {
      try {
        await navigator.clipboard.writeText(window.location.href);
        btn.textContent = I18N[appState.lang].copiedLink;
      } catch {
        // Clipboard unavailable on insecure origin
      }
    } else if (btn.id === "btn-export-json" && appState.computed?.normalized) {
      const blob = new Blob([JSON.stringify(appState.computed.normalized, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "local-ai-sizer-scenario.json";
      a.click();
      URL.revokeObjectURL(a.href);
    }
  });

  $("step-body").addEventListener("click", (e) => {
    const wlBtn = e.target.closest("[data-workload]");
    if (wlBtn) {
      selectWorkloadPreset(wlBtn.dataset.workload);
      renderAll();
      return;
    }
    const modeBtn = e.target.closest("[data-mode]");
    if (modeBtn) {
      appState.draft.deploymentMode = modeBtn.dataset.mode;
      renderAll();
    }
  });

  $("step-body").addEventListener("change", (e) => {
    const el = e.target;
    if (el.name === "connector") {
      const checked = [...document.querySelectorAll('input[name="connector"]:checked')].map((n) => n.value);
      appState.draft.connectors = checked;
      renderAll();
      return;
    }
    if (el.tagName === "SELECT") {
      handleFieldChange(el.name, el.value);
      renderAll();
    }
  });

  $("step-body").addEventListener("input", (e) => {
    const el = e.target;
    if (el.tagName !== "INPUT" || el.type === "checkbox") return;
    handleFieldChange(el.name, el.value);
    renderAll({ preserveStepDom: true });
    el.setAttribute("aria-invalid", String(Boolean(appState.fieldErrors._form)));
  });
}

function handleFieldChange(name, value) {
  const d = appState.draft;
  if (name === "peakPct") {
    const num = Number(String(value).trim());
    d.peakConcurrencyFraction = Number.isFinite(num) && num > 0 ? String(num / 100) : value;
    return;
  }
  if (name === "dealTierOverride") {
    d.dealTierOverride = value || null;
    return;
  }
  if (name === "quoteCurrency") {
    d.quoteCurrency = value;
    d.integratedNodePrice.currency = value;
    d.chassisNodePrice.currency = value;
    d.gpuUnitPrice.currency = value;
    d.fleetTotalPrice.currency = value;
    d.localImplFee.currency = value;
    d.annualOpsFee.currency = value;
    appState.displayCurrency = value;
    return;
  }
  if (name === "gpuId") {
    d.gpuId = value;
    d.serverId = "";
    return;
  }
  if (["integratedNodePrice", "chassisNodePrice", "gpuUnitPrice", "fleetTotalPrice", "localImplFee", "annualOpsFee"].includes(name)) {
    d[name] = { amount: value, currency: d.quoteCurrency };
    return;
  }
  if (name in d) {
    d[name] = value;
  }
}

async function runDomAuditIfRequested() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("audit") !== "1") return;
  await document.fonts?.ready;

  const px = (v) => parseFloat(v) || 0;
  const lum = (c) => {
    const s = c.map((v) => {
      const n = v / 255;
      return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  };
  const rgb = (str) => {
    const m = String(str).match(/[0-9.]+/g);
    return m ? m.slice(0, 3).map(Number) : null;
  };
  const alphaOf = (str) => {
    const p = String(str).match(/[0-9.]+/g);
    return p && p.length > 3 ? Number(p[3]) : 1;
  };
  const bgOf = (el) => {
    let n = el;
    while (n) {
      const b = getComputedStyle(n).backgroundColor;
      if (b && alphaOf(b) > 0 && rgb(b)) return rgb(b);
      n = n.parentElement;
    }
    return [10, 10, 15];
  };
  const ratio = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const nameOf = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "");

  const contrastFails = [];
  const smallText = [];
  const smallTargets = [];
  const spills = [];
  const sizes = new Map();
  const textBoxes = new Set();

  for (const el of document.querySelectorAll("body *")) {
    if (!shown(el) || el.id === "auditReport" || el.closest("#auditReport")) continue;
    const cs = getComputedStyle(el);
    const isControl = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|hidden)$/.test(el.type);
    const direct = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!isControl && !direct) continue;
    const fs = px(cs.fontSize);
    if (fs < 11) smallText.push({ sel: nameOf(el), fontPx: fs });
    if (direct) {
      sizes.set(fs, (sizes.get(fs) || 0) + 1);
      const fg = rgb(cs.color);
      if (fg && !el.disabled && el.getAttribute("aria-disabled") !== "true") {
        const cr = ratio(fg, bgOf(el));
        const bold = px(cs.fontWeight) >= 700;
        const need = fs >= 24 || (fs >= 18.66 && bold) ? 3.0 : 4.5;
        if (cr < need) contrastFails.push({ sel: nameOf(el), ratio: Math.round(cr * 100) / 100, need });
      }
      let box = el;
      while (box.parentElement && getComputedStyle(box.parentElement).display === "inline") box = box.parentElement;
      textBoxes.add(box);
    }
  }

  for (const box of textBoxes) {
    const cs = getComputedStyle(box);
    const dx = box.scrollWidth - box.clientWidth;
    const dy = box.scrollHeight - box.clientHeight;
    if (dx <= 1 && dy <= 4) continue;
    const axis = dx > 1 ? "x" : "y";
    const ov = axis === "x" ? cs.overflowX : cs.overflowY;
    if (ov === "auto" || ov === "scroll") continue;
    const handled = cs.textOverflow === "ellipsis" || (cs.webkitLineClamp && cs.webkitLineClamp !== "none");
    if (ov === "visible" || !handled) {
      spills.push({ sel: nameOf(box), axis, by: Math.round(axis === "x" ? dx : dy) });
    }
  }

  for (const el of document.querySelectorAll('a[href],button,input,select,[tabindex]:not([tabindex="-1"])')) {
    if (!shown(el) || el.type === "checkbox") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) {
      smallTargets.push({ sel: nameOf(el), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }

  const ledgerRowOver48 = [];
  const ledgerPadOver24 = [];
  for (const tr of document.querySelectorAll(".ledger-table tbody tr")) {
    if (!shown(tr)) continue;
    const r = tr.getBoundingClientRect();
    if (r.height > 48) ledgerRowOver48.push(Math.round(r.height));
  }
  for (const cell of document.querySelectorAll(".ledger-table th, .ledger-table td")) {
    if (!shown(cell)) continue;
    const cs = getComputedStyle(cell);
    const maxPad = Math.max(px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft));
    if (maxPad >= 24) ledgerPadOver24.push(maxPad);
  }

  const docOverflowX = Math.max(0, Math.round(document.documentElement.scrollWidth - window.innerWidth));
  if (docOverflowX > 1) spills.push({ sel: "html", axis: "x", by: docOverflowX });

  const scale = Array.from(sizes.keys()).sort((x, y) => y - x);
  const report = {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    lang: appState.lang,
    step: appState.step + 1,
    docOverflowX,
    typeScale: scale,
    hierarchyRatio: scale.length > 1 ? Math.round((scale[0] / scale[1]) * 100) / 100 : 1,
    contrastFails,
    smallText,
    smallTargets,
    spills,
    ledgerRowOver48,
    ledgerPadOver24,
    computedOk: Boolean(appState.computed?.ok),
  };

  const out = $("auditReport");
  out.hidden = false;
  out.textContent = JSON.stringify(report, null, 2);
}

async function init() {
  applyUrlStateOnBoot();
  wireEvents();
  try {
    const manifest = await loadManifest();
    const [catalog, fxRaw, gpuPricing, serverPricing, servingData, powerSeed, subscriptions] = await Promise.all([
      resolveResource(manifest, "catalog"),
      loadFx(manifest),
      fetchJson("./tco-calculator/data/gpu-pricing.json"),
      fetchJson("./tco-calculator/data/server-pricing.json"),
      fetchJson("./tco-calculator/data/serving-models.json"),
      fetchJson("./tco-calculator/data/power-seed.json"),
      fetchJson("./tco-calculator/data/subscription-pricing.json"),
    ]);
    appState.data = {
      manifest,
      catalog,
      fx: normalizeFxDocument(fxRaw, { integrity: "digest-pinned" }),
      gpuPricing,
      serverPricing,
      servingData,
      powerSeed,
      subscriptions,
    };
    appState.ready = true;
    $("main-workspace").setAttribute("aria-busy", "false");
    renderAll();
    await runDomAuditIfRequested();
  } catch (err) {
    appState.loadError = `Failed to load local snapshots: ${err.message}`;
    $("main-workspace").setAttribute("aria-busy", "false");
    renderStatusBanner();
  }
}

init();
