// Transactional browser controller for local-ai-sizer.html (Single-Page Model-First Workbench + Sticky TCO Rail).
// Separates editable draft, pricing/model source data, derived sizing/TCO results, and API view filters.

import { formatHalfUp, toRat } from "./exact.js";
import { loadManifest, loadFx, resolveResource } from "./data.js";
import { normalizeFxDocument, toTHB } from "./currency.js";
import { serversForGpu } from "./capex.js?v=20260906-ux3";
import {
  fetchOpenRouterModels,
  compileLiveOpenRouter,
  replaceCatalogSource,
  fetchLiveFx,
} from "./live-pricing.js";
import { kvBytesPerToken, kvBytesPerSequence, kvShareableBytes } from "./serving.js";
import {
  DEAL_TIERS,
  PIPELINE_CONNECTORS,
  PROMPT_SCALE_PRESETS,
  LOCAL_AI_WORKLOADS,
  MAX_SAVE_BYTES,
  MAX_SAVED_SCENARIOS,
  normalizeSizerInput,
  resolveSizerModel,
  estimateModelWeightGb,
  computeSizer,
  evaluateGpuCandidates,
  groupCatalogModels,
  filterApiOffers,
  classifyApiOffer,
  encodeSizerFragment,
  decodeSizerFragment,
  decodePresetFragment,
  encodeSizerSaveEnvelope,
  decodeSizerSaveEnvelope,
  SizerValidationError,
} from "./sizer-engine.js?v=20261118-wb2";

export const SIZER_LEGACY_STORAGE_KEY = "factor-io.sizer-saves.v1";
export const SIZER_STORAGE_KEY = "factor-io.sizer-saves.v2";

export function createSizerStorageAdapter(storageGetter = () => globalThis.localStorage) {
  function getStore() {
    try {
      const store = storageGetter();
      if (!store || typeof store.getItem !== "function" || typeof store.setItem !== "function") {
        return { ok: false, error: "Browser localStorage is unavailable in this environment." };
      }
      return { ok: true, store };
    } catch (err) {
      return { ok: false, error: err?.message || "Browser blocked localStorage access." };
    }
  }

  function readSavedScenarios() {
    const access = getStore();
    if (!access.ok) {
      return { ok: false, available: false, scenarios: [], error: access.error };
    }
    let rawV2 = null;
    let rawV1 = null;
    try {
      rawV2 = access.store.getItem(SIZER_STORAGE_KEY);
      rawV1 = access.store.getItem(SIZER_LEGACY_STORAGE_KEY);
    } catch (err) {
      return { ok: false, available: false, scenarios: [], error: err?.message || "Unable to read localStorage." };
    }
    if (rawV2) {
      try {
        const decoded = decodeSizerSaveEnvelope(rawV2, { allowEmpty: true });
        return { ok: true, available: true, scenarios: decoded.scenarios, error: null };
      } catch (err) {
        return {
          ok: false,
          available: true,
          corrupted: true,
          scenarios: [],
          error: `Existing browser save data could not be validated: ${err.message}`,
        };
      }
    }
    if (!rawV1) {
      return { ok: true, available: true, scenarios: [], error: null };
    }
    // Read-only migration from v1 storage key so rolling back assets leaves v1 saves intact.
    try {
      const decodedV1 = decodeSizerSaveEnvelope(rawV1, { allowEmpty: true });
      return { ok: true, available: true, migratedFromV1: true, scenarios: decodedV1.scenarios, error: null };
    } catch (err) {
      return {
        ok: false,
        available: true,
        corrupted: true,
        scenarios: [],
        error: `Existing legacy v1 browser save data could not be validated: ${err.message}`,
      };
    }
  }

  function saveScenario({ id, name, savedAt, fragment }) {
    const access = getStore();
    if (!access.ok) {
      return { ok: false, code: "storage_unavailable", error: access.error };
    }
    // Refresh from storage before writing (never overwrite corrupted unparsed data silently, and never mutate v1).
    const current = readSavedScenarios();
    if (!current.ok && current.corrupted) {
      return { ok: false, code: "storage_corrupted", error: current.error };
    }
    const existing = current.ok ? current.scenarios : [];
    const filtered = existing
      .filter((item) => item.id !== id)
      .map(({ id: eid, name: ename, savedAt: esaved, fragment: efrag }) => ({ id: eid, name: ename, savedAt: esaved, fragment: efrag }));
    const nextRecord = { id, name, savedAt, fragment };
    if (filtered.length >= MAX_SAVED_SCENARIOS) {
      return {
        ok: false,
        code: "max_scenarios_reached",
        error: `Browser save limit (${MAX_SAVED_SCENARIOS} scenarios) reached. Delete an older saved scenario or download a .json file.`,
      };
    }
    const candidateList = [nextRecord, ...filtered];
    let encoded;
    try {
      encoded = encodeSizerSaveEnvelope(candidateList, { exportedAt: savedAt, allowEmpty: false, version: 2 });
    } catch (err) {
      return { ok: false, code: err.code || "validation_failed", error: err.message };
    }
    try {
      access.store.setItem(SIZER_STORAGE_KEY, encoded);
    } catch (err) {
      return {
        ok: false,
        code: "storage_write_failed",
        error: err?.message || "Browser rejected localStorage write (quota exceeded or private mode). Download .json instead.",
      };
    }
    const verified = decodeSizerSaveEnvelope(encoded, { allowEmpty: false });
    return { ok: true, scenarios: verified.scenarios };
  }

  function deleteScenario(id) {
    const access = getStore();
    if (!access.ok) {
      return { ok: false, code: "storage_unavailable", error: access.error };
    }
    const current = readSavedScenarios();
    if (!current.ok) {
      return { ok: false, code: "storage_read_failed", error: current.error };
    }
    const nextList = current.scenarios
      .filter((item) => item.id !== id)
      .map(({ id: eid, name: ename, savedAt: esaved, fragment: efrag }) => ({ id: eid, name: ename, savedAt: esaved, fragment: efrag }));
    try {
      const hasLegacyV1 = Boolean(access.store.getItem(SIZER_LEGACY_STORAGE_KEY));
      if (nextList.length === 0 && !hasLegacyV1 && typeof access.store.removeItem === "function") {
        access.store.removeItem(SIZER_STORAGE_KEY);
        return { ok: true, scenarios: [] };
      }
      const nowIso = new Date().toISOString();
      const encoded = encodeSizerSaveEnvelope(nextList, { exportedAt: nowIso, allowEmpty: true, version: 2 });
      access.store.setItem(SIZER_STORAGE_KEY, encoded);
      const verified = decodeSizerSaveEnvelope(encoded, { allowEmpty: true });
      return { ok: true, scenarios: verified.scenarios };
    } catch (err) {
      return { ok: false, code: "storage_write_failed", error: err?.message || "Failed to update browser storage." };
    }
  }

  return {
    readSavedScenarios,
    saveScenario,
    deleteScenario,
  };
}

export async function refreshLiveSourcesTransaction({
  manifest,
  catalog,
  fx,
  fetchImpl = globalThis.fetch,
  timeoutMs = 4000,
  nowFn = Date.now,
} = {}) {
  let nextManifest = manifest;
  let nextCatalog = catalog;
  let nextFx = fx;
  let openrouterLive = false;
  let fxLive = false;
  const errors = {};

  if (typeof fetchImpl !== "function") {
    return { manifest: nextManifest, catalog: nextCatalog, fx: nextFx, openrouterLive, fxLive, errors: { fetch: "unavailable" } };
  }

  const parentAbort = new AbortController();
  const deadlineTimer = setTimeout(() => {
    parentAbort.abort(new DOMException("Live pricing deadline exceeded", "AbortError"));
  }, timeoutMs);

  try {
    const [orOutcome, fxOutcome] = await Promise.allSettled([
      (async () => {
        const fetched = await fetchOpenRouterModels({
          fetchImpl,
          signal: parentAbort.signal,
          timeoutMs,
        });
        const compiled = compileLiveOpenRouter(fetched, { fetchedAt: nowFn() });
        return replaceCatalogSource(nextManifest, nextCatalog, compiled, "openrouter");
      })(),
      (async () => fetchLiveFx({
        fetchImpl,
        signal: parentAbort.signal,
        timeoutMs,
      }))(),
    ]);

    if (orOutcome.status === "fulfilled" && orOutcome.value) {
      nextManifest = orOutcome.value.manifest;
      nextCatalog = orOutcome.value.catalog;
      openrouterLive = true;
    } else if (orOutcome.status === "rejected") {
      errors.openrouter = orOutcome.reason?.message || String(orOutcome.reason);
    }

    if (fxOutcome.status === "fulfilled" && fxOutcome.value) {
      nextFx = fxOutcome.value;
      nextManifest = {
        ...nextManifest,
        sources: {
          ...(nextManifest?.sources ?? {}),
          fx: {
            source_id: "fx",
            status: "fresh",
            observed_at: `${nextFx.observed_at}T00:00:00.000Z`,
            last_success_at: new Date(nowFn()).toISOString(),
            expires_at: nextFx.expires_at,
            record_count: 1,
            origin: "live",
            integrity: nextFx.integrity,
          },
        },
      };
      fxLive = true;
    } else if (fxOutcome.status === "rejected") {
      errors.fx = fxOutcome.reason?.message || String(fxOutcome.reason);
    }
  } finally {
    clearTimeout(deadlineTimer);
  }

  return {
    manifest: nextManifest,
    catalog: nextCatalog,
    fx: nextFx,
    openrouterLive,
    fxLive,
    errors,
  };
}

const I18N = {
  th: {
    backTco: "หน้าคำนวณ\u00A0TCO\u00A0หลัก",
    taskbarTitle: "Local\u00A0AI\u00A0Model\u00A0&\u00A0GPU\u00A0Sizer",
    nav1: "1.\u00A0งานและขนาด\u00A0Prompt",
    nav2: "2.\u00A0เลือกโมเดล\u00A0&\u00A0คำนวณ\u00A0GPU",
    nav3: "3.\u00A0กรองราคา\u00A0Cloud\u00A0API",
    nav4: "4.\u00A0ใบเสนอราคา\u00A0&\u00A0บันทึกไฟล์",
    stageHeading: "ประเมินขนาดโมเดล\u00A0และคำนวณจำนวน\u00A0GPU\u00A0อัตโนมัติสำหรับองค์กรไทย",
    stageSub: "เลือกรูปแบบงานจริงของบริษัทไทย\u00A0เลือกโมเดลที่ต้องการใช้\u00A0และเลือกรุ่น\u00A0GPU\u00A0ระบบจะคำนวณจำนวนการ์ด\u00A0เซิร์ฟเวอร์\u00A0และจุดคุ้มทุนเทียบ\u00A0Cloud\u00A0API\u00A0ในหน้าเดียวทันที",
    hWorkload: "1.\u00A0เลือกรูปแบบงานองค์กรไทยและขนาด\u00A0Prompt\u00A0ตามการใช้งานจริง",
    dWorkload: "ค่าเริ่มต้นจำลองงาน\u00A0Agent\u00A0ยุคปัจจุบันที่เริ่มด้วย\u00A0System\u00A0Prompt\u00A020,000+\u00A0โทเคน\u00A0สะสมหลายรอบ\u00A0(Turns)\u00A0และคำนวณส่วนลด\u00A0KV/Prefix\u00A0Cache\u00A0ให้อัตโนมัติ",
    promptPresets: "ปรับขนาด\u00A0Fresh\u00A0Input\u00A0ต่อรอบด่วน\u00A0(เนื้อหา\u00A0RAG/Tool\u00A0ที่เพิ่มต่อคำสั่ง):",
    users: "จำนวนผู้ใช้งานจริง\u00A0(คน)",
    sysPrompt: "System\u00A0Prompt\u00A0เริ่มต้นของ\u00A0Agent\u00A0(โทเคน)",
    rawPrompt: "ข้อมูลใหม่ต่อรอบ\u00A0(RAG/User\u00A0โทเคน)",
    turnsSession: "จำนวนรอบคุยต่อเซสชัน\u00A0(Turns)",
    rawOut: "คำตอบต่อรอบ\u00A0(Output\u00A0โทเคน)",
    kvHitPct: "อัตราใช้ซ้ำ\u00A0KV / Prefix\u00A0Cache\u00A0(%)",
    rawCtx: "ความยาว\u00A0Context\u00A0เป้าหมาย\u00A0(ตั้งต้น)",
    sumTraffic: "ตั้งค่าความถี่การใช้งานและสัดส่วนโทเคนภาษาไทย\u00A0(Sessions,\u00A0Concurrency,\u00A0Thai\u00A01.4x)",
    sessionsDay: "จำนวนเซสชันต่อคน\u00A0/\u00A0วัน",
    daysMo: "วันทำงานต่อเดือน",
    peakPct: "ผู้ใช้พร้อมกันสูงสุด\u00A0(%)",
    tokenBasis: "เกณฑ์นับจำนวนโทเคนภาษาไทย",
    basisLatin: "อ้างอิงอังกฤษ\u00A0x\u00A0ตัวคูณภาษาไทย\u00A01.4x",
    basisThai: "วัดจาก\u00A0Tokenizer\u00A0ภาษาไทยแล้ว\u00A0(1.0x)",
    hModelGpu: "2.\u00A0เลือกโมเดล\u00A0AI\u00A0และรุ่นการ์ด\u00A0GPU\u00A0เพื่อคำนวณจำนวนเครื่องอัตโนมัติ",
    dModelGpu: "โมเดลที่คุณเลือกคือตัวกำหนดหลัก\u00A0ระบบจะคำนวณ\u00A0VRAM,\u00A0Tensor\u00A0Parallel\u00A0และจำนวนการ์ด/เซิร์ฟเวอร์ที่ต้องใช้ให้อัตโนมัติ",
    modelSelect: "โมเดล\u00A0Open-Weight\u00A0ที่ต้องการรันในองค์กร",
    gpuSelect: "รุ่นการ์ด\u00A0GPU\u00A0ที่ต้องการใช้",
    wquant: "ความละเอียดน้ำหนักโมเดล\u00A0(Weights)",
    kvquant: "ความละเอียด\u00A0KV\u00A0Cache",
    runtime: "ซอฟต์แวร์รันโมเดล\u00A0(Serving\u00A0Engine)",
    sumCustomModel: "กำหนดขนาดโมเดลเอง\u00A0/\u00A0ทดสอบความไวพารามิเตอร์\u00A0(Custom\u00A0B,\u00A0Active\u00A0B,\u00A0KV\u00A0bytes/tok)",
    hintCustomContract: "กรณีเลือก\u00A0Custom\u00A0Model\u00A0ต้องระบุพารามิเตอร์รวม,\u00A0Active\u00A0B,\u00A0อัตรา\u00A0BF16\u00A0KV\u00A0bytes/token\u00A0และ\u00A0Max\u00A0Context\u00A0ให้ครบก่อนคำนวณจำนวน\u00A0GPU",
    customParams: "พารามิเตอร์รวม\u00A0(พันล้าน\u00A0B)",
    customActive: "พารามิเตอร์ทำงานจริง\u00A0Active\u00A0(B)",
    customKv: "อัตรา\u00A0BF16\u00A0KV\u00A0Cache\u00A0(bytes\u00A0/\u00A0token)",
    customCtx: "Context\u00A0สูงสุดของโมเดล\u00A0(โทเคน)",
    clearCustomModel: "กลับไปใช้ค่ามาตรฐานของโมเดลในแคตตาล็อก",
    hGpuMatrix: "ตารางเปรียบเทียบจำนวน\u00A0GPU\u00A0และเซิร์ฟเวอร์อัตโนมัติในแต่ละรุ่น",
    hintGpuMatrix: "คลิกปุ่มเลือกในตารางเพื่อสลับรุ่น\u00A0GPU\u00A0ได้ทันที",
    hApi: "3.\u00A0เลือกและกรองราคา\u00A0Cloud\u00A0Model\u00A0API\u00A0ที่นำมาเปรียบเทียบ",
    dApi: "ดึงราคาสดจาก\u00A0OpenRouter\u00A0ควบคู่ข้อมูลอ้างอิง\u00A0LiteLLM\u00A0กรองตามผู้พัฒนาโมเดล\u00A0แหล่งข้อมูล\u00A0หรือพิมพ์ค้นหาชื่อโมเดลได้ทันที",
    filterFeed: "แหล่งข้อมูลราคา\u00A0API\u00A0(Feed)",
    filterVendor: "ค่ายผู้พัฒนาโมเดล\u00A0(Model\u00A0Vendor)",
    filterSearch: "ค้นหาชื่อโมเดล\u00A0หรือรหัส\u00A0Slug",
    apiOffer: "ตัวเลือกราคา\u00A0Cloud\u00A0API\u00A0ที่ใช้เปรียบเทียบ",
    apiRates: "อัตราค่าโทเคนที่เลือก\u00A0(USD\u00A0ต่อ\u00A01\u00A0ล้านโทเคน)",
    apiAutoBtn: "ใช้โมเดลพาณิชย์แนะนำอัตโนมัติ",
    apiClearFilterBtn: "ล้างตัวกรอง\u00A0API",
    hBomSave: "4.\u00A0ปรับใบเสนอราคาฮาร์ดแวร์\u00A0เชื่อมระบบข้อมูล\u00A0และบันทึก/นำเข้าไฟล์",
    sumBom: "ปรับราคาเซิร์ฟเวอร์\u00A0ค่าติดตั้ง\u00A0ค่าไฟ\u00A0และเลือกการเชื่อมต่อข้อมูลภายใน\u00A0(Optional\u00A0BOM\u00A0&\u00A0Pipelines)",
    quoteBasis: "รูปแบบการระบุราคาฮาร์ดแวร์",
    qbCatalog: "อ้างอิงราคาเซิร์ฟเวอร์ในแคตตาล็อก",
    qbIntegrated: "ระบุราคาต่อเครื่องเซิร์ฟเวอร์\u00A0(รวมการ์ด\u00A0GPU)",
    qbSplit: "แยกราคาเครื่องเปล่า\u00A0+\u00A0ราคาต่อการ์ด\u00A0GPU",
    qbFleet: "ระบุราคารวมทั้งโครงการก้อนเดียว",
    quoteCurrency: "สกุลเงินของใบเสนอราคาที่กรอก",
    serverConfig: "รุ่นเซิร์ฟเวอร์มาตรฐาน",
    nodes: "กำหนดจำนวนโหนดเอง\u00A0(เว้นว่าง=อัตโนมัติ)",
    gpusPerNode: "จำนวน\u00A0GPU\u00A0ต่อโหนด\u00A0(โหมดกำหนดราคาเอง)",
    integratedPrice: "ราคาต่อโหนดเซิร์ฟเวอร์\u00A0(รวม\u00A0GPU)",
    chassisPrice: "ราคาเครื่องเปล่าต่อโหนด",
    gpuCardPrice: "ราคาต่อการ์ด\u00A0GPU\u00A01\u00A0ใบ",
    fleetPrice: "ราคารวมฮาร์ดแวร์ทั้งหมด",
    localImpl: "ค่าติดตั้งระบบ\u00A0Local\u00A0AI\u00A0ครั้งเดียว",
    annualOps: "ค่าดูแลรักษาระบบรายปี\u00A0(ถ้ามี)",
    elecRate: "ค่าไฟฟ้าดาต้าเซ็นเตอร์\u00A0(บาท\u00A0/\u00A0kWh)",
    deploymentMode: "รูปแบบการส่งมอบระบบ",
    dmGf: "Greenfield\u00A0(ติดตั้งครบวงจร\u00A0L1-L4)",
    dmBf: "Brownfield\u00A0(ติดตั้ง\u00A0L3-L4\u00A0บนคลัสเตอร์เดิม)",
    tierOverride: "ขนาดขอบเขตงานเชื่อมต่อระบบ",
    tierAuto: "แนะนำอัตโนมัติตามจำนวนผู้ใช้",
    hConnectors: "เชื่อมต่อระบบฐานข้อมูลและช่องทางภายในองค์กร",
    hSaveImport: "บันทึกข้อมูลไว้ใช้งานภายหลัง\u00A0หรือนำเข้าไฟล์ที่บันทึกไว้\u00A0(.json)",
    dSaveImport: "บันทึกไว้ในเบราว์เซอร์เครื่องนี้\u00A0(สูงสุด\u00A025\u00A0รายการ)\u00A0ดาวน์โหลดไฟล์\u00A0.json\u00A0เก็บไว้เปิดนำเสนอภายหลัง\u00A0หรือนำเข้าไฟล์\u00A0.json\u00A0ได้ทันที",
    saveName: "ตั้งชื่อชุดข้อมูล\u00A0(Scenario\u00A0Name)",
    saveActions: "การบันทึกและนำเข้าข้อมูล",
    saveBrowserBtn: "บันทึกไว้ในเบราว์เซอร์",
    exportJsonBtn: "ดาวน์โหลดไฟล์\u00A0.json",
    importJsonBtn: "นำเข้าไฟล์\u00A0.json",
    hLedger60m: "ตารางเปรียบเทียบต้นทุนรวม\u00A060\u00A0เดือน\u00A0(Local\u00A0AI\u00A0vs\u00A0Cloud\u00A0API\u00A0vs\u00A0เช่า\u00A0GPU)",
    copyLinkBtn: "คัดลอกลิงก์แชร์ชุดตัวเลขนี้",
    copiedLinkBtn: "คัดลอกลิงก์เรียบร้อยแล้ว",
    printBtn: "พิมพ์ใบสรุป\u00A01\u00A0หน้า",
    resetBtn: "ล้างค่ากลับเป็นค่าเริ่มต้น",
    resetAsk: "ต้องการล้างค่าที่ปรับไว้ทั้งหมดกลับเป็นค่าเริ่มต้นหรือไม่?",
    resetConfirmBtn: "ยืนยันล้างค่า",
    resetCancelBtn: "ยกเลิก",
    summaryHeading: "สรุปจำนวน\u00A0GPU\u00A0และจุดคุ้มทุน",
    paybackLabel: "ระยะเวลาคืนทุนเทียบ\u00A0Cloud\u00A0Model\u00A0API",
    paybackSub: "คำนวณตลอดอายุโครงการ\u00A060\u00A0เดือน\u00A0(รวมค่าเครื่องและค่าติดตั้ง)",
    openTcoRail: "เปิดกราฟ\u00A0TCO\u00A0เต็มรูปแบบ\u00A0→",
    loadBtn: "โหลดข้อมูล",
    deleteBtn: "ลบ",
    selectBtn: "เลือกใช้",
    selectedBtn: "กำลังเลือก",
    allVendors: "ทุกค่ายโมเดล\u00A0(All\u00A0Vendors)",
    autoServerOpt: "เลือกเซิร์ฟเวอร์ที่คุ้มค่าที่สุดอัตโนมัติ",
    kv: {
      model: "โมเดลที่เลือก",
      fleet: "จำนวน\u00A0GPU\u00A0/\u00A0โหนดที่ต้องใช้",
      tp: "การแบ่งโมเดล\u00A0(TP)\u00A0/\u00A0ความเร็วต่อใบ",
      effPrompt: "Prompt\u00A0ปรับค่าภาษาไทย\u00A0/\u00A0Context",
      personDayTok: "เฉลี่ยโทเคน\u00A0/\u00A0คน\u00A0/\u00A0วัน",
      personMoTok: "เฉลี่ยโทเคน\u00A0/\u00A0คน\u00A0/\u00A0เดือน",
      kvPerSeq: "KV\u00A0Cache\u00A0สูงสุดต่อเซสชัน",
      monthlyTok: "ปริมาณโทเคนรวมต่อเดือน",
      peakTok: "ความเร็วถอดรหัสสูงสุด\u00A0(Peak)",
      hwCapex: "งบฮาร์ดแวร์\u00A0(BOM\u00A0Capex)",
      implOnce: "ค่าติดตั้ง\u00A0Local\u00A0AI\u00A0ครั้งเดียว",
      localMo: "ค่าไฟ\u00A0+\u00A0ดูแลรายเดือน\u00A0(Local)",
      apiMo: "ค่า\u00A0Cloud\u00A0API\u00A0รายเดือน",
      total60Local: "รวม\u00A060\u00A0เดือน\u00A0(Local\u00A0AI)",
      total60Api: "รวม\u00A060\u00A0เดือน\u00A0(Cloud\u00A0API)",
      dealTier: "ระดับโครงการที่แนะนำ",
    },
  },
  en: {
    backTco: "Main TCO Calculator",
    taskbarTitle: "Local AI Model & GPU Sizer",
    nav1: "1. Workload & Prompt Scale",
    nav2: "2. Model & Auto GPU Sizing",
    nav3: "3. Cloud API Provider Filter",
    nav4: "4. BOM Quotes & Save / Import",
    stageHeading: "Model-First Local AI & GPU Fleet Sizer for Thai Enterprises",
    stageSub: "Pick an authentic Thai corporate workload, choose your target open-weight model and GPU family, and get instant server node counts, live Cloud API tariff filtering, and 60-month TCO payback on one screen.",
    hWorkload: "1. Select Realistic Enterprise Workload & Prompt Token Budget",
    dWorkload: "Models ~20,000+ starting agent system prompts stacked across multi-turn sessions (P_t = S + t*user + (t-1)*out) with KV/prefix cache reuse.",
    promptPresets: "1-click fresh per-turn input presets (retrieved RAG/tool context added per turn):",
    users: "Active users (headcount)",
    sysPrompt: "Agent system prompt (tokens)",
    rawPrompt: "Fresh input / turn (RAG & user)",
    turnsSession: "Turns / session (stacked)",
    rawOut: "Output tokens / turn",
    kvHitPct: "KV / prefix cache hit (%)",
    rawCtx: "Target context window (raw)",
    sumTraffic: "Session cadence, peak concurrency & Thai token fertility (1.4x vs 1.0x)",
    sessionsDay: "Sessions / user / day",
    daysMo: "Working days / month",
    peakPct: "Peak concurrent users (%)",
    tokenBasis: "Thai token counting basis",
    basisLatin: "English reference x 1.4x Thai fertility",
    basisThai: "Already measured with Thai tokenizer (1.0x)",
    hModelGpu: "2. Choose Target Model & GPU Model to Auto-Configure Fleet Size",
    dModelGpu: "Your chosen model and context window drive VRAM and decode bandwidth; the sizer automatically solves required Tensor Parallelism, GPU count, and server nodes.",
    modelSelect: "Target open-weight model",
    gpuSelect: "Preferred GPU accelerator",
    wquant: "Weight quantization",
    kvquant: "KV cache precision",
    runtime: "Serving runtime",
    sumCustomModel: "Custom model architecture / parameter-sensitivity override (Total B, Active B, BF16 KV bytes/tok)",
    hintCustomContract: "Arbitrary Custom models require total B, active B, full-retention BF16 KV bytes/token, and max context before sizing a fleet.",
    customParams: "Total parameters (B)",
    customActive: "Active parameters (B)",
    customKv: "BF16 KV cache (bytes / token)",
    customCtx: "Model max context tokens",
    clearCustomModel: "Reset to catalog model architecture",
    hGpuMatrix: "Live Cross-GPU Auto-Sizing Matrix",
    hintGpuMatrix: "Click any row button to switch GPU family immediately",
    hApi: "3. Filter & Select Comparable Cloud Model API Provider",
    dApi: "Refreshes live OpenRouter tariffs alongside LiteLLM provider references. Filter by feed, model vendor/family, or search model names.",
    filterFeed: "Tariff source feed",
    filterVendor: "Model vendor / family",
    filterSearch: "Search model name or slug",
    apiOffer: "Selected Cloud API tariff",
    apiRates: "Selected API token rate (USD / 1M tokens)",
    apiAutoBtn: "Use suggested commercial baseline",
    apiClearFilterBtn: "Clear API filters",
    hBomSave: "4. Hardware Quote Overrides, Data Pipelines & Save / Import",
    sumBom: "Override server hardware quotes, implementation fees, electricity, and internal data pipelines (Optional)",
    quoteBasis: "Hardware quote basis",
    qbCatalog: "Published catalog server reference",
    qbIntegrated: "Custom per-server quote (GPUs included)",
    qbSplit: "Separate bare chassis + per-GPU card quote",
    qbFleet: "Single total fleet hardware quote",
    quoteCurrency: "Entered quote currency",
    serverConfig: "Catalog server chassis",
    nodes: "Server node override (blank = auto)",
    gpusPerNode: "GPUs / node (custom quote)",
    integratedPrice: "Per-server quote (GPUs included)",
    chassisPrice: "Bare chassis / node",
    gpuCardPrice: "Per-GPU card price",
    fleetPrice: "Total hardware fleet quote",
    localImpl: "Local integration fee (one-time)",
    annualOps: "Annual ops / support fee",
    elecRate: "Electricity tariff (THB / kWh)",
    deploymentMode: "Delivery structure",
    dmGf: "Greenfield (Turnkey L1-L4 Stack)",
    dmBf: "Brownfield (Existing K8s Cluster L3-L4)",
    tierOverride: "Integration scope tier",
    tierAuto: "Auto-recommend from scale",
    hConnectors: "Internal enterprise data pipelines",
    hSaveImport: "Save Scenario for Later or Import Saved .json File",
    dSaveImport: "Save scenarios in this browser (up to 25), download a portable .json file for presentations, or import a saved .json file anytime.",
    saveName: "Scenario label",
    saveActions: "Save, export, or import",
    saveBrowserBtn: "Save in browser",
    exportJsonBtn: "Download .json",
    importJsonBtn: "Import .json",
    hLedger60m: "60-Month Total Cost Comparison (Local AI vs Cloud API vs Rented GPU)",
    copyLinkBtn: "Copy share link",
    copiedLinkBtn: "Copied share link",
    printBtn: "Print 1-page summary",
    resetBtn: "Reset defaults",
    resetAsk: "Reset all workload, model, and BOM inputs back to defaults?",
    resetConfirmBtn: "Confirm reset",
    resetCancelBtn: "Cancel",
    summaryHeading: "Live GPU Sizing & 60M Payback",
    paybackLabel: "Payback vs Cloud Model API",
    paybackSub: "Evaluated across 60 months (hardware + integration + power)",
    openTcoRail: "Open Full TCO Calculator →",
    loadBtn: "Load",
    deleteBtn: "Delete",
    selectBtn: "Select",
    selectedBtn: "Selected",
    allVendors: "All model vendors",
    autoServerOpt: "Auto-pick lowest-cost feasible server",
    kv: {
      model: "Selected model",
      fleet: "Auto / configured GPU fleet",
      tp: "Replica TP & per-GPU speed",
      effPrompt: "Thai-adjusted prompt / context",
      personDayTok: "Avg tokens / person / day",
      personMoTok: "Avg tokens / person / month",
      kvPerSeq: "Peak KV cache / session",
      monthlyTok: "Modelled tokens / month",
      peakTok: "Required peak decode",
      hwCapex: "Hardware BOM capex",
      implOnce: "Local integration (one-time)",
      localMo: "Local power + ops / mo",
      apiMo: "Cloud Model API / mo",
      total60Local: "60-month total (Local AI)",
      total60Api: "60-month total (Cloud API)",
      dealTier: "Recommended scope tier",
    },
  },
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function defaultDraft() {
  const w = LOCAL_AI_WORKLOADS[0];
  return {
    workloadId: w.id,
    deploymentMode: "greenfield",
    connectors: [...w.defaultConnectors],
    dealTierOverride: null,
    users: String(w.users),
    sessionsPerUserDay: w.sessionsPerUserDay,
    workingDaysMo: String(w.workingDaysMo),
    peakConcurrencyFraction: w.peakConcurrencyFraction,
    tokensPerSecondPerStream: w.tokensPerSecondPerStream,
    mix: { ...w.mix },
    tokenBasis: "latin_reference_1_4x",
    thaiFertilityMultiplier: "1.4",
    rawPromptTokens: String(w.rawPromptTokens),
    rawOutputTokens: String(w.rawOutputTokens),
    rawContextTokens: String(w.rawContextTokens),
    modelId: w.recommendedModelId,
    customParamsB: "",
    customActiveParamsB: "",
    customKvBytesBf16: "",
    customContextMax: "",
    legacyCustomAssumed: false,
    wquant: "fp8",
    kvquant: "fp8",
    runtime: "vllm",
    gpuId: w.recommendedGpuId ?? "rtx_pro_6000_se",
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

const storageAdapter = createSizerStorageAdapter();

const appState = {
  ready: false,
  loadError: null,
  lang: "th",
  displayCurrency: "THB",
  confirmingReset: false,
  presetBanner: null,
  liveRefreshStatus: "loading", // loading | live | partial | fallback
  mutationSeq: 0,
  fieldErrors: {},
  saveStatus: null, // { state: 'ok'|'warn'|'error', text: string }
  savedScenarios: [],
  storageAvailable: true,
  viewFilters: {
    apiFeed: "all",
    apiVendor: "all",
    apiSearch: "",
  },
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
  gpuCandidates: [],
};

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
    customParamsB: n.customParamsB ?? "",
    customActiveParamsB: n.customActiveParamsB ?? "",
    customKvBytesBf16: n.customKvBytesBf16 !== null ? String(n.customKvBytesBf16) : "",
    customContextMax: n.customContextMax !== null ? String(n.customContextMax) : "",
    legacyCustomAssumed: Boolean(n.legacyCustomAssumed),
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
  appState.draft.workingDaysMo = String(w.workingDaysMo);
  appState.draft.peakConcurrencyFraction = w.peakConcurrencyFraction;
  appState.draft.tokensPerSecondPerStream = w.tokensPerSecondPerStream;
  appState.draft.mix = { ...w.mix };
  appState.draft.rawPromptTokens = String(w.rawPromptTokens);
  appState.draft.rawOutputTokens = String(w.rawOutputTokens);
  appState.draft.rawContextTokens = String(w.rawContextTokens);
  appState.draft.modelId = w.recommendedModelId;
  appState.draft.customParamsB = "";
  appState.draft.customActiveParamsB = "";
  appState.draft.customKvBytesBf16 = "";
  appState.draft.customContextMax = "";
  appState.draft.legacyCustomAssumed = false;
  if (w.recommendedGpuId) appState.draft.gpuId = w.recommendedGpuId;
  appState.draft.serverId = "";
  appState.draft.nodes = "";
  appState.draft.gpusPerNode = "";
  appState.draft.connectors = [...w.defaultConnectors];
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
    if (preset.modelId) {
      appState.draft.modelId = String(preset.modelId);
      appState.draft.legacyCustomAssumed = appState.draft.modelId === "custom";
    }
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

function applyUrlStateOnBoot() {
  const url = new URL(window.location.href);
  const qLang = url.searchParams.get("lang");
  if (qLang === "en" || qLang === "th") appState.lang = qLang;
  const qCur = url.searchParams.get("cur");
  if (qCur === "USD" || qCur === "THB") appState.displayCurrency = qCur;

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

function recompute() {
  appState.fieldErrors = {};
  if (!appState.ready) return;
  try {
    const normalized = normalizeSizerInput(appState.draft);
    appState.computed = computeSizer({
      input: normalized,
      data: appState.data,
    });
    appState.gpuCandidates = evaluateGpuCandidates({
      input: normalized,
      data: appState.data,
    });
  } catch (err) {
    appState.computed = null;
    appState.gpuCandidates = [];
    appState.fieldErrors._form = err instanceof SizerValidationError ? err.message : String(err.message ?? err);
  }
}

function buildCurrentFragment() {
  if (!appState.computed?.normalized) {
    const normalized = normalizeSizerInput(appState.draft);
    return encodeSizerFragment(normalized);
  }
  return encodeSizerFragment(appState.computed.normalized, {
    pricingIdentity: appState.computed.pricingIdentity,
    resolvedApiOfferId: appState.computed.resolvedApiOfferId || appState.computed.normalized.apiOfferId,
  });
}

function buildHandoffHref() {
  if (!appState.computed?.ok) return "tco-calculator.html#custom-page";
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
  url.searchParams.delete("step");
  if (appState.computed?.normalized) {
    try {
      const frag = encodeSizerFragment(appState.computed.normalized, {
        pricingIdentity: appState.computed.pricingIdentity,
        resolvedApiOfferId: appState.computed.resolvedApiOfferId || appState.computed.normalized.apiOfferId,
      });
      url.hash = frag;
    } catch {
      // Keep existing hash if fragment cannot be encoded
    }
  }
  window.history.replaceState(null, "", url.toString());
}

function setControlValue(el, nextValue, force = false) {
  if (!el || (!force && document.activeElement === el)) return;
  const str = String(nextValue ?? "");
  if (el.value !== str) el.value = str;
}

function renderStaticLabels() {
  const t = I18N[appState.lang];
  document.documentElement.lang = appState.lang;
  $("lang-th").setAttribute("aria-pressed", String(appState.lang === "th"));
  $("lang-en").setAttribute("aria-pressed", String(appState.lang === "en"));
  $("cur-thb").setAttribute("aria-pressed", String(appState.displayCurrency === "THB"));
  $("cur-usd").setAttribute("aria-pressed", String(appState.displayCurrency === "USD"));

  $("lbl-back-tco").textContent = t.backTco;
  $("taskbar-title").textContent = t.taskbarTitle;
  $("nav-sec-1").textContent = t.nav1;
  $("nav-sec-2").textContent = t.nav2;
  $("nav-sec-3").textContent = t.nav3;
  $("nav-sec-4").textContent = t.nav4;

  $("stage-heading").textContent = t.stageHeading;
  $("stage-subtitle").textContent = t.stageSub;

  $("h-sec-workload").textContent = t.hWorkload;
  $("d-sec-workload").textContent = t.dWorkload;
  $("lbl-prompt-presets").textContent = t.promptPresets;
  $("lbl-users").textContent = t.users;
  $("lbl-raw-prompt").textContent = t.rawPrompt;
  $("lbl-raw-output").textContent = t.rawOut;
  $("lbl-raw-ctx").textContent = t.rawCtx;
  $("sum-traffic").textContent = t.sumTraffic;
  $("lbl-sessions-day").textContent = t.sessionsDay;
  $("lbl-days-mo").textContent = t.daysMo;
  $("lbl-peak-pct").textContent = t.peakPct;
  $("lbl-token-basis").textContent = t.tokenBasis;
  $("opt-basis-latin").textContent = t.basisLatin;
  $("opt-basis-thai").textContent = t.basisThai;

  $("h-sec-model-gpu").textContent = t.hModelGpu;
  $("d-sec-model-gpu").textContent = t.dModelGpu;
  $("lbl-model-id").textContent = t.modelSelect;
  $("lbl-gpu-id").textContent = t.gpuSelect;
  $("lbl-wquant").textContent = t.wquant;
  $("lbl-kvquant").textContent = t.kvquant;
  $("lbl-runtime").textContent = t.runtime;
  $("sum-custom-model").textContent = t.sumCustomModel;
  $("hint-custom-contract").textContent = t.hintCustomContract;
  $("lbl-custom-params").textContent = t.customParams;
  $("lbl-custom-active").textContent = t.customActive;
  $("lbl-custom-kv-bf16").textContent = t.customKv;
  $("lbl-custom-ctx-max").textContent = t.customCtx;
  $("btn-clear-custom-model").textContent = t.clearCustomModel;
  $("h-gpu-matrix").textContent = t.hGpuMatrix;
  $("hint-gpu-matrix").textContent = t.hintGpuMatrix;

  $("h-sec-api").textContent = t.hApi;
  $("d-sec-api").textContent = t.dApi;
  $("lbl-filter-feed").textContent = t.filterFeed;
  $("lbl-filter-vendor").textContent = t.filterVendor;
  $("lbl-filter-search").textContent = t.filterSearch;
  $("lbl-api-offer").textContent = t.apiOffer;
  $("lbl-api-rates").textContent = t.apiRates;
  $("btn-api-auto").textContent = t.apiAutoBtn;
  $("btn-api-clear-filters").textContent = t.apiClearFilterBtn;

  $("h-sec-bom-save").textContent = t.hBomSave;
  $("sum-bom").textContent = t.sumBom;
  $("lbl-quote-basis").textContent = t.quoteBasis;
  $("opt-qb-catalog").textContent = t.qbCatalog;
  $("opt-qb-integrated").textContent = t.qbIntegrated;
  $("opt-qb-split").textContent = t.qbSplit;
  $("opt-qb-fleet").textContent = t.qbFleet;
  $("lbl-quote-currency").textContent = t.quoteCurrency;
  $("lbl-server-id").textContent = t.serverConfig;
  $("lbl-nodes").textContent = t.nodes;
  $("lbl-gpus-per-node").textContent = t.gpusPerNode;
  $("lbl-integrated-price").textContent = t.integratedPrice;
  $("lbl-chassis-price").textContent = t.chassisPrice;
  $("lbl-gpu-card-price").textContent = t.gpuCardPrice;
  $("lbl-fleet-price").textContent = t.fleetPrice;
  $("lbl-local-impl").textContent = t.localImpl;
  $("lbl-annual-ops").textContent = t.annualOps;
  $("lbl-elec-rate").textContent = t.elecRate;
  $("lbl-deployment-mode").textContent = t.deploymentMode;
  $("opt-dm-gf").textContent = t.dmGf;
  $("opt-dm-bf").textContent = t.dmBf;
  $("lbl-tier-override").textContent = t.tierOverride;
  $("opt-tier-auto").textContent = t.tierAuto;
  $("h-connectors").textContent = t.hConnectors;

  $("h-save-import").textContent = t.hSaveImport;
  $("d-save-import").textContent = t.dSaveImport;
  $("lbl-save-name").textContent = t.saveName;
  $("lbl-save-actions").textContent = t.saveActions;
  $("btn-save-browser").textContent = t.saveBrowserBtn;
  $("btn-export-json").textContent = t.exportJsonBtn;
  $("btn-import-json").textContent = t.importJsonBtn;

  $("h-ledger-60m").textContent = t.hLedger60m;
  $("btn-copy-link").textContent = t.copyLinkBtn;
  $("btn-print").textContent = t.printBtn;
  $("btn-reset").textContent = t.resetBtn;

  $("summary-heading").textContent = t.summaryHeading;
  $("summary-payback-label").textContent = t.paybackLabel;
  $("summary-payback-sub").textContent = t.paybackSub;
  $("rail-open-tco").textContent = t.openTcoRail;
}

function renderWorkloadCardsAndPills() {
  const isTh = appState.lang === "th";
  const cardsEl = $("workload-cards");
  cardsEl.innerHTML = LOCAL_AI_WORKLOADS.map((w) => {
    const loc = w[appState.lang];
    const selected = appState.draft.workloadId === w.id;
    const recModel = (appState.data.servingData?.models ?? []).find((m) => m.id === w.recommendedModelId);
    const modelShort = recModel ? `${recModel.params_b}B` : w.recommendedModelId;
    return `
      <button type="button" class="choice-btn" data-workload-id="${esc(w.id)}" aria-pressed="${selected}">
        <div class="choice-top">
          <span class="badge badge-cyan">${esc(loc.sectorTag || w.sector)}</span>
          <span class="choice-meta">${fmtInt(w.users)} ${isTh ? "ผู้ใช้" : "users"} · ${fmtInt(w.rawPromptTokens)} tok · ${esc(modelShort)}</span>
        </div>
        <div class="choice-title">${esc(loc.title)}</div>
        <div class="choice-desc">${esc(loc.whyLocal)}</div>
      </button>
    `;
  }).join("");

  const pillsEl = $("prompt-scale-pills");
  const curPrompt = Number(appState.draft.rawPromptTokens);
  pillsEl.innerHTML = PROMPT_SCALE_PRESETS.map((p) => {
    const active = curPrompt === p.rawPromptTokens;
    return `<button type="button" class="pill-btn" data-prompt-preset="${esc(p.id)}" aria-pressed="${active}">${esc(p[appState.lang])}</button>`;
  }).join("");
}

function renderModelAndGpuSelectors() {
  if (!appState.data.servingData) return;
  const isTh = appState.lang === "th";
  const modelSelect = $("in-model-id");
  const grouped = groupCatalogModels(appState.data.servingData);
  const wqBytes = Number(appState.data.servingData.weight_quantization?.[appState.draft.wquant]?.bytes_per_param ?? 1);

  const knownIds = new Set(appState.data.servingData.models.map((m) => m.id));
  const selectedId = appState.draft.modelId;
  let html = "";
  if (selectedId && !knownIds.has(selectedId)) {
    html += `<option value="${esc(selectedId)}" selected>${esc(selectedId)} (${isTh ? "ไม่พบในแคตตาล็อก - โปรดเลือกใหม่" : "unavailable - reselect"})</option>`;
  }
  for (const grp of grouped.groups) {
    const label = isTh ? grp.thLabel : grp.enLabel;
    html += `<optgroup label="${esc(label)}">`;
    for (const m of grp.models) {
      const approxWtGb = Math.ceil(Number(m.params_b) * wqBytes);
      const activeText = String(m.active_params_b) !== String(m.params_b) ? ` / ${m.active_params_b}B active` : "";
      const ctxK = Math.round(Number(m.context_max ?? 0) / 1024);
      html += `<option value="${esc(m.id)}" ${m.id === selectedId ? "selected" : ""}>${esc(m.label)} (${m.params_b}B${activeText} · ~${approxWtGb}GB wt · max ${ctxK}k ctx)</option>`;
    }
    html += `</optgroup>`;
  }
  if (grouped.customModel) {
    html += `<optgroup label="${esc(isTh ? "กำหนดสถาปัตยกรรมโมเดลเอง" : "Custom Model Specification")}">`;
    html += `<option value="custom" ${selectedId === "custom" ? "selected" : ""}>${esc(isTh ? "Custom - ระบุพารามิเตอร์และ KV Cache เอง" : "Custom - enter parameters, KV rate & context")}</option>`;
    html += `</optgroup>`;
  }
  if (document.activeElement !== modelSelect) {
    modelSelect.innerHTML = html;
    modelSelect.value = selectedId;
  }

  const gpuSelect = $("in-gpu-id");
  const gpuMap = appState.data.gpuPricing?.gpus ?? {};
  const accMap = appState.data.servingData?.accelerators ?? {};
  const candidateIds = appState.gpuCandidates.length
    ? appState.gpuCandidates.map((c) => c.gpuId)
    : Object.keys(accMap).filter((id) => gpuMap[id]);
  const selectedGpu = appState.draft.gpuId;
  let gpuHtml = "";
  if (selectedGpu && !candidateIds.includes(selectedGpu)) {
    gpuHtml += `<option value="${esc(selectedGpu)}" selected>${esc(selectedGpu)} (${isTh ? "ไม่พบข้อมูล - โปรดเลือกใหม่" : "unavailable - reselect"})</option>`;
  }
  for (const id of candidateIds) {
    const g = gpuMap[id] ?? {};
    const a = accMap[id] ?? {};
    gpuHtml += `<option value="${esc(id)}" ${id === selectedGpu ? "selected" : ""}>${esc(g.label ?? id)} (${g.vram_gb ?? "?"} GB · ${a.bandwidth_gb_s ?? "?"} GB/s)</option>`;
  }
  if (document.activeElement !== gpuSelect) {
    gpuSelect.innerHTML = gpuHtml;
    gpuSelect.value = selectedGpu;
  }

  const srvSelect = $("in-server-id");
  const srvRows = serversForGpu(selectedGpu, appState.data.serverPricing?.rows ?? []);
  const t = I18N[appState.lang];
  let srvHtml = `<option value="">${esc(t.autoServerOpt)}</option>`;
  for (const r of srvRows) {
    srvHtml += `<option value="${esc(r.server_id)}" ${r.server_id === appState.draft.serverId ? "selected" : ""}>${esc(r.label)} (${r.gpu_count}x GPU)</option>`;
  }
  if (document.activeElement !== srvSelect) {
    srvSelect.innerHTML = srvHtml;
    srvSelect.value = appState.draft.serverId;
  }
}

function renderApiControls() {
  if (!appState.data.catalog || !appState.data.manifest) return;
  const isTh = appState.lang === "th";
  const t = I18N[appState.lang];
  const effectiveSelectedId = appState.draft.apiOfferId || appState.computed?.resolvedApiOfferId || "";

  const view = filterApiOffers({
    catalog: appState.data.catalog,
    manifest: appState.data.manifest,
    feed: appState.viewFilters.apiFeed,
    vendor: appState.viewFilters.apiVendor,
    search: appState.viewFilters.apiSearch,
    selectedOfferId: effectiveSelectedId,
    limit: 120,
  });

  const vendorSelect = $("filter-api-vendor");
  if (document.activeElement !== vendorSelect) {
    let vHtml = `<option value="all">${esc(t.allVendors)}</option>`;
    for (const v of view.vendors) {
      vHtml += `<option value="${esc(v.id)}" ${v.id === appState.viewFilters.apiVendor ? "selected" : ""}>${esc(v.label)} (${v.count})</option>`;
    }
    vendorSelect.innerHTML = vHtml;
    vendorSelect.value = appState.viewFilters.apiVendor;
  }
  setControlValue($("filter-api-feed"), appState.viewFilters.apiFeed, false);
  setControlValue($("filter-api-search"), appState.viewFilters.apiSearch, false);

  const offerSelect = $("in-api-offer");
  if (document.activeElement !== offerSelect) {
    offerSelect.innerHTML = view.offers.map((info) => {
      if (info.missingFromCatalog) {
        return `<option value="${esc(info.id)}" selected>${esc(info.id)} (${isTh ? "ไม่พบในแคตตาล็อกปัจจุบัน - โปรดเลือกใหม่" : "unavailable in catalog - reselect"})</option>`;
      }
      const tags = [info.feed];
      if (info.isBatch) tags.push("batch");
      if (info.hasConditionalRates) tags.push("tiered");
      if (info.outsideFilter) tags.push(isTh ? "นอกตัวกรอง" : "pinned");
      const ratePart = info.inputPer1MUsd !== null && info.outputPer1MUsd !== null
        ? `$${info.inputPer1MUsd} / $${info.outputPer1MUsd} per 1M`
        : "custom tariff";
      return `<option value="${esc(info.id)}" ${info.id === effectiveSelectedId ? "selected" : ""}>${esc(info.vendorLabel)} · ${esc(info.displayName)} [${tags.join(", ")}] (${ratePart})</option>`;
    }).join("");
    if (effectiveSelectedId) offerSelect.value = effectiveSelectedId;
  }

  $("hint-api-match-count").textContent = isTh
    ? `พบ ${fmtInt(view.totalMatching)} รายการ จากทั้งหมด ${fmtInt(view.totalEligible)} โมเดลที่มีราคาโทเคนพร้อมใช้งาน`
    : `Showing ${fmtInt(Math.min(view.offers.length, view.totalMatching))} of ${fmtInt(view.totalMatching)} matching tariffs (${fmtInt(view.totalEligible)} eligible total)`;

  const rateBox = $("api-rate-summary");
  const chosenOffer = appState.data.catalog.offers?.[effectiveSelectedId];
  if (!chosenOffer) {
    rateBox.dataset.state = "error";
    rateBox.textContent = isTh
      ? `ไม่พบราคาของ "${effectiveSelectedId || "N/A"}" ในแคตตาล็อกปัจจุบัน กรุณาเลือกโมเดล API ใหม่`
      : `Selected API offer "${effectiveSelectedId || "N/A"}" is unavailable in the current catalog; reselect an active tariff.`;
    return;
  }
  const info = classifyApiOffer(effectiveSelectedId, chosenOffer, null);
  rateBox.dataset.state = "ok";
  const extraNote = info.hasConditionalRates
    ? (isTh ? " · มีขั้นบันได/มิเตอร์เสริมตามเงื่อนไข" : " · includes conditional/extra meters")
    : "";
  rateBox.innerHTML = `<span class="num">In: $${esc(info.inputPer1MUsd ?? "N/A")}/1M · Out: $${esc(info.outputPer1MUsd ?? "N/A")}/1M</span><span>${esc(info.feed.toUpperCase())}${info.isBatch ? " · BATCH" : ""}${esc(extraNote)}</span>`;
}

function renderConnectorsList() {
  const ul = $("connector-list");
  const selected = new Set(appState.draft.connectors);
  ul.innerHTML = PIPELINE_CONNECTORS.map((conn) => {
    const loc = conn[appState.lang];
    const checked = selected.has(conn.id);
    return `
      <li class="connector-item">
        <label class="connector-label">
          <input type="checkbox" data-connector-id="${esc(conn.id)}" ${checked ? "checked" : ""}>
          <span>
            <span class="connector-name">${esc(loc.label)}</span>
            <span class="connector-detail">${esc(loc.detail)}</span>
          </span>
          <span class="badge">${esc(conn.pillar)}</span>
        </label>
      </li>
    `;
  }).join("");
}

function syncInputsFromDraft({ force = false } = {}) {
  const d = appState.draft;
  setControlValue($("in-users"), d.users, force);
  setControlValue($("in-raw-prompt"), d.rawPromptTokens, force);
  setControlValue($("in-raw-output"), d.rawOutputTokens, force);
  setControlValue($("in-raw-ctx"), d.rawContextTokens, force);
  setControlValue($("in-sessions-day"), d.sessionsPerUserDay, force);
  setControlValue($("in-days-mo"), d.workingDaysMo, force);
  const peakPct = (() => {
    const n = Number(d.peakConcurrencyFraction);
    return Number.isFinite(n) ? String(Math.round(n * 10000) / 100) : d.peakConcurrencyFraction;
  })();
  setControlValue($("in-peak-pct"), peakPct, force);
  setControlValue($("in-token-basis"), d.tokenBasis, force);
  setControlValue($("in-wquant"), d.wquant, force);
  setControlValue($("in-kvquant"), d.kvquant, force);
  setControlValue($("in-runtime"), d.runtime, force);
  setControlValue($("in-custom-params"), d.customParamsB, force);
  setControlValue($("in-custom-active"), d.customActiveParamsB, force);
  setControlValue($("in-custom-kv-bf16"), d.customKvBytesBf16, force);
  setControlValue($("in-custom-ctx-max"), d.customContextMax, force);
  setControlValue($("in-quote-basis"), d.quoteBasis, force);
  setControlValue($("in-quote-currency"), d.quoteCurrency, force);
  setControlValue($("in-nodes"), d.nodes, force);
  setControlValue($("in-gpus-per-node"), d.gpusPerNode, force);
  setControlValue($("in-integrated-price"), d.integratedNodePrice.amount, force);
  setControlValue($("in-chassis-price"), d.chassisNodePrice.amount, force);
  setControlValue($("in-gpu-card-price"), d.gpuUnitPrice.amount, force);
  setControlValue($("in-fleet-price"), d.fleetTotalPrice.amount, force);
  setControlValue($("in-local-impl-fee"), d.localImplFee.amount, force);
  setControlValue($("in-annual-ops-fee"), d.annualOpsFee.amount, force);
  setControlValue($("in-elec-rate"), d.electricityThbPerKwh, force);
  setControlValue($("in-deployment-mode"), d.deploymentMode, force);
  setControlValue($("in-tier-override"), d.dealTierOverride ?? "", force);

  const qb = d.quoteBasis;
  $("wrap-server-id").hidden = qb !== "catalog";
  $("in-gpus-per-node").disabled = qb === "catalog";
  $("wrap-integrated-price").hidden = qb !== "integrated_node";
  $("wrap-chassis-price").hidden = qb !== "component_split";
  $("wrap-gpu-card-price").hidden = qb !== "component_split";
  $("wrap-fleet-price").hidden = qb !== "fleet_total";

  if (d.modelId === "custom") {
    $("details-custom-model").open = true;
  }
  const hasCustomOverride = Boolean(d.customParamsB || d.customActiveParamsB || d.customKvBytesBf16 || d.customContextMax || d.modelId === "custom");
  $("badge-custom-model").textContent = hasCustomOverride ? "Custom Override" : "Catalog";
  $("badge-custom-model").className = hasCustomOverride ? "badge badge-warn" : "badge";

  $("badge-traffic").textContent = `${d.sessionsPerUserDay}/d · ${peakPct}% peak · ${d.tokenBasis === "latin_reference_1_4x" ? "1.4x TH" : "1.0x TH"}`;
  $("badge-bom").textContent = `${qb} · ${d.quoteCurrency} · ${d.connectors.length} pipelines`;
}

function renderAutoGpuAndMatrix() {
  const isTh = appState.lang === "th";
  const t = I18N[appState.lang];
  const c = appState.computed;
  const callout = $("auto-gpu-callout");

  if (c?.normalized) {
    const n = c.normalized;
    $("hint-eff-prompt").textContent = isTh
      ? `คิดเป็น ${fmtInt(n.effectivePromptTokens)} โทเคนจริงหลังคูณสัดส่วนภาษาไทย`
      : `Thai-adjusted: ${fmtInt(n.effectivePromptTokens)} effective prompt tokens`;
    $("hint-eff-ctx").textContent = isTh
      ? `Context จริงที่ใช้จอง KV: ${fmtInt(n.effectiveContextTokens)} โทเคน`
      : `Effective KV context: ${fmtInt(n.effectiveContextTokens)} tokens`;
    $("hint-users").textContent = c.demand
      ? (isTh ? `${fmtInt(Number(c.demand.turns_mo.text))} คำสั่ง/เดือน` : `${fmtInt(Number(c.demand.turns_mo.text))} turns/mo`)
      : "";
    $("hint-output").textContent = c.peak
      ? `Peak: ${c.peak.peak_tokens_s.text} tok/s`
      : "";
  }

  const prof = c?.fit?.thaiProfile;
  $("hint-model-profile").textContent = prof
    ? `${isTh ? prof.thTier : prof.enTier} · ${isTh ? prof.thNote : prof.enNote}`
    : "";
  const gMeta = appState.data.gpuPricing?.gpus?.[appState.draft.gpuId];
  const aMeta = appState.data.servingData?.accelerators?.[appState.draft.gpuId];
  $("hint-gpu-spec").textContent = gMeta && aMeta
    ? `${gMeta.vram_gb} GB VRAM · ${aMeta.bandwidth_gb_s} GB/s memory bandwidth`
    : "";

  if (!c) {
    callout.dataset.status = "refused";
    callout.innerHTML = `<div class="auto-headline">${esc(isTh ? "ข้อมูลนำเข้ายังไม่สมบูรณ์" : "Invalid input value")}</div><div class="auto-detail">${esc(appState.fieldErrors._form || "")}</div>`;
  } else if (c.ok) {
    callout.dataset.status = c.fit.status;
    const srvText = c.bom.serverRow?.label ?? `${c.bom.nodes}x custom node (${c.bom.gpusPerNode} GPU/node)`;
    const headline = isTh
      ? `แนะนำอัตโนมัติ: ใช้ ${c.bom.installedGpus} การ์ด GPU (${c.bom.nodes} เครื่อง × ${c.bom.gpusPerNode} GPU/เครื่อง)`
      : `Auto-configured fleet: ${c.bom.installedGpus}x GPUs (${c.bom.nodes} node${c.bom.nodes === 1 ? "" : "s"} × ${c.bom.gpusPerNode} GPUs/node)`;
    const detail = isTh
      ? `ความต้องการขั้นต่ำจากโหลดจริง ${c.sizing.gpusRequired} ใบ · TP=${c.fit.serving.gpus_per_replica} ต่อชุดโมเดล · ${c.sizing.tokens_s_per_gpu.text} tok/s/GPU · โครงสร้าง: ${srvText}`
      : `Load minimum ${c.sizing.gpusRequired} GPU(s) · TP=${c.fit.serving.gpus_per_replica} per replica · ${c.sizing.tokens_s_per_gpu.text} tok/s/GPU · Topology: ${srvText}`;
    const warnHtml = (c.fit.warnings ?? []).map((w) => {
      const msg = typeof w === "string" ? w : (isTh ? w.th : w.en);
      return `<div class="field-hint" style="color:var(--warn)">• ${esc(msg)}</div>`;
    }).join("");
    callout.innerHTML = `<div class="auto-headline">${esc(headline)}</div><div class="auto-detail">${esc(detail)}</div>${warnHtml}`;
  } else if (c.stage === "hardware_bom" && c.bom?.code === "no_catalog_server" && c.sizing && c.fit?.serving) {
    callout.dataset.status = "memory_fit_unpriced";
    const headline = isTh
      ? `คำนวณจำนวนการ์ดได้: ต้องใช้ ${c.sizing.gpusRequired} การ์ด GPU (TP=${c.fit.serving.gpus_per_replica}) แต่ยังไม่มีราคากลางเซิร์ฟเวอร์`
      : `Auto-sized: ${c.sizing.gpusRequired}x GPUs required (TP=${c.fit.serving.gpus_per_replica}), custom hardware quote needed`;
    callout.innerHTML = `<div class="auto-headline">${esc(headline)}</div><div class="auto-detail">${esc(c.bom.reason)}</div>`;
  } else {
    callout.dataset.status = "refused";
    const reason = c.reason ?? c.fit?.reason ?? c.bom?.reason ?? "Selected configuration cannot serve this workload.";
    const headline = isTh
      ? "ไม่สามารถจัดชุด GPU/โมเดลตามเงื่อนไขนี้ได้"
      : "Configuration refused (cannot size fleet / TCO)";
    callout.innerHTML = `<div class="auto-headline">${esc(headline)}</div><div class="auto-detail">${esc(reason)}</div>`;
  }

  const thead = $("gpu-matrix-thead-row");
  thead.innerHTML = isTh
    ? `<th>รุ่นการ์ด GPU</th><th class="col-num">TP/ชุด</th><th class="col-num">จำนวน GPU</th><th>เซิร์ฟเวอร์อัตโนมัติ</th><th class="col-num">งบฮาร์ดแวร์</th><th class="col-num">คืนทุน</th><th>เลือก</th>`
    : `<th>GPU Accelerator</th><th class="col-num">TP</th><th class="col-num">Auto GPUs</th><th>Auto Server Topology</th><th class="col-num">Hardware BOM</th><th class="col-num">Payback</th><th>Action</th>`;

  const tbody = $("gpu-matrix-tbody");
  tbody.innerHTML = appState.gpuCandidates.map((row) => {
    const badgeCls = !row.feasible
      ? "badge-bad"
      : (row.priced ? (row.status === "qualified_pass" ? "badge-ok" : "badge-warn") : "badge-warn");
    const tpCell = row.tpDegree !== null ? `TP=${row.tpDegree}` : "N/A";
    const gpuCountCell = row.feasible
      ? (row.priced ? `${row.installedGpus} (${row.gpusRequired} req)` : `${row.gpusRequired} req`)
      : "N/A";
    const topoCell = row.feasible
      ? (row.priced
        ? `${row.nodes}x (${row.gpusPerNode} GPU/node)`
        : (isTh ? "ต้องกรอกใบเสนอราคาเอง" : "Custom quote required"))
      : (row.code === "exceeds_model_context_max"
        ? (isTh ? "เกิน Context สูงสุดของโมเดล" : "Exceeds model max context")
        : (row.code === "unsupported_cross_node_tp"
          ? (isTh ? "TP เกินสล็อตต่อเครื่อง" : "TP exceeds node slots")
          : (isTh ? "VRAM ไม่พอ / ต้องกรอก KV" : "Insufficient VRAM / spec")));
    const bomCell = row.priced && row.capexUsd !== null ? fmtMoneyUsd(row.capexUsd) : "N/A";
    const pbCell = row.priced && row.paybackMonths !== null
      ? (isTh ? `${formatHalfUp(toRat(String(row.paybackMonths)), 1)} ด.` : `${formatHalfUp(toRat(String(row.paybackMonths)), 1)} mo`)
      : (row.priced ? (isTh ? ">60 ด." : ">60 mo") : "N/A");
    return `
      <tr data-selected="${row.isSelected}">
        <td><span class="badge ${badgeCls}">${esc(row.vramGb ?? "?")}G</span> ${esc(row.label)}</td>
        <td class="col-num">${esc(tpCell)}</td>
        <td class="col-num">${esc(gpuCountCell)}</td>
        <td>${esc(topoCell)}</td>
        <td class="col-num">${esc(bomCell)}</td>
        <td class="col-num">${esc(pbCell)}</td>
        <td>
          <button type="button" class="row-select-btn" data-pick-gpu="${esc(row.gpuId)}" aria-pressed="${row.isSelected}">
            ${esc(row.isSelected ? t.selectedBtn : t.selectBtn)}
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderLedgerAndSummaryRail() {
  const isTh = appState.lang === "th";
  const t = I18N[appState.lang];
  const c = appState.computed;

  $("ledger-60m-thead").innerHTML = isTh
    ? `<th>ทางเลือก</th><th class="col-num">ลงทุนเริ่มต้น</th><th class="col-num">รายเดือนเฉลี่ย</th><th class="col-num">รวม 60 เดือน</th>`
    : `<th>Option</th><th class="col-num">Upfront</th><th class="col-num">Monthly Run-Rate</th><th class="col-num">60-Month Total</th>`;

  const ledgerBody = $("ledger-60m-tbody");
  if (!c?.ok || !c.comparison) {
    ledgerBody.innerHTML = `<tr><td colspan="4">${esc(isTh ? "แก้ไขเงื่อนไขด้านบนเพื่อแสดงตารางเปรียบเทียบต้นทุน 60 เดือน" : "Resolve configuration refusal above to compute 60-month TCO totals.")}</td></tr>`;
    $("summary-payback-value").textContent = "N/A";
    $("summary-kv").innerHTML = `
      <div class="kv-row"><dt>${esc(t.kv.model)}</dt><dd>${esc(appState.draft.modelId)}</dd></div>
      <div class="kv-row"><dt>${esc(t.kv.effPrompt)}</dt><dd>${c?.normalized ? `${fmtInt(c.normalized.effectivePromptTokens)} / ${fmtInt(c.normalized.effectiveContextTokens)}` : "N/A"}</dd></div>
      <div class="kv-row"><dt>${esc(isTh ? "สาเหตุที่หยุดคำนวณ" : "Refusal reason")}</dt><dd style="color:var(--bad)">${esc(c?.reason || c?.fit?.reason || c?.bom?.reason || appState.fieldErrors._form || "Invalid")}</dd></div>
    `;
    const openBtn = $("rail-open-tco");
    openBtn.href = "tco-calculator.html#custom-page";
    openBtn.setAttribute("aria-disabled", "true");
    $("rail-handoff-hint").textContent = isTh
      ? "โปรดปรับขนาดโมเดล/Context/ราคาให้ผ่านเกณฑ์ก่อนส่งต่อไปยังหน้ากราฟ TCO เต็มรูปแบบ"
      : "Select a valid model, GPU topology, and active API offer before opening the Full TCO Calculator.";
    return;
  }

  const tot = c.comparison.totals;
  const rows = [
    {
      name: isTh ? `A. Local AI (${c.bom.installedGpus}x GPU)` : `A. Owned Local AI (${c.bom.installedGpus}x GPU)`,
      upfrontRat: toRat(tot.A.one_time ?? "0"),
      monthly: tot.A.monthly_total,
      horizon: tot.A.horizon_total,
    },
    {
      name: isTh ? "B. Cloud Model API" : "B. Cloud Model API",
      upfrontRat: toRat(tot.B.one_time ?? "0"),
      monthly: tot.B.monthly_total,
      horizon: tot.B.horizon_total,
    },
    {
      name: isTh ? "C. เช่า Cloud GPU รายชั่วโมง" : "C. Rented Cloud GPU",
      upfrontRat: toRat(tot.C.one_time ?? "0"),
      monthly: tot.C.monthly_total,
      horizon: tot.C.horizon_total,
    },
  ];

  ledgerBody.innerHTML = rows.map((r) => `
    <tr>
      <td>${esc(r.name)}</td>
      <td class="col-num">${esc(r.horizon !== null ? fmtMoneyUsd(r.upfrontRat) : "N/A")}</td>
      <td class="col-num">${esc(r.monthly !== null ? fmtMoneyUsd(r.monthly) : "N/A")}</td>
      <td class="col-num">${esc(r.horizon !== null ? fmtMoneyUsd(r.horizon) : "N/A")}</td>
    </tr>
  `).join("");

  const pbMonths = c.comparison.payback?.vs_model_api?.months;
  if (pbMonths !== null && pbMonths !== undefined) {
    const mStr = formatHalfUp(toRat(String(pbMonths)), 1);
    $("summary-payback-value").textContent = isTh ? `${mStr} เดือน` : `${mStr} months`;
  } else {
    $("summary-payback-value").textContent = isTh ? "เกิน 60 เดือน" : "> 60 months";
  }

  const modelLabel = c.fit.resolvedModel?.label ?? c.normalized.modelId;
  const kvRows = [
    [t.kv.model, `${modelLabel} (${c.normalized.wquant.toUpperCase()})`],
    [t.kv.fleet, `${c.bom.installedGpus} GPUs · ${c.bom.nodes}x (${c.bom.gpusPerNode}/node)`],
    [t.kv.tp, `TP=${c.fit.serving.gpus_per_replica} · ${c.sizing.tokens_s_per_gpu.text} tok/s/GPU`],
    [t.kv.effPrompt, `${fmtInt(c.normalized.effectivePromptTokens)} / ${fmtInt(c.normalized.effectiveContextTokens)} tok`],
    [t.kv.monthlyTok, `${fmtInt(Number(c.demand.tokens_mo.text))} tok/mo`],
    [t.kv.peakTok, `${c.peak.peak_tokens_s.text} tok/s`],
    [t.kv.hwCapex, fmtMoneyUsd(c.bom.capexUsd)],
    [t.kv.implOnce, fmtMoneyUsd(c.scenarioInputs?.oneTime?.A ?? "0")],
    [t.kv.localMo, fmtMoneyUsd(tot.A.monthly_total)],
    [t.kv.apiMo, fmtMoneyUsd(tot.B.monthly_total)],
    [t.kv.total60Local, fmtMoneyUsd(tot.A.horizon_total)],
    [t.kv.total60Api, fmtMoneyUsd(tot.B.horizon_total)],
    [t.kv.dealTier, `Size ${c.dealTier}`],
  ];
  $("summary-kv").innerHTML = kvRows.map(([k, v]) => `<div class="kv-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");

  const openBtn = $("rail-open-tco");
  openBtn.href = buildHandoffHref();
  openBtn.removeAttribute("aria-disabled");
  $("rail-handoff-hint").textContent = isTh
    ? "ส่งค่าทั้งหมดไปยังหน้ากราฟ TCO เต็มรูปแบบ พร้อมปุ่มย้อนกลับมาแก้ไขหน้านี้ได้ทันที"
    : "Transfers exact workload, model architecture, BOM, and API tariff into the Full TCO Calculator with one-click return.";
}

function renderSavedScenariosList() {
  const isTh = appState.lang === "th";
  const t = I18N[appState.lang];
  const statusEl = $("save-status");
  if (appState.saveStatus) {
    statusEl.hidden = false;
    statusEl.dataset.state = appState.saveStatus.state;
    statusEl.textContent = appState.saveStatus.text;
  } else {
    statusEl.hidden = true;
    statusEl.textContent = "";
  }

  $("btn-save-browser").disabled = !appState.storageAvailable;

  const ul = $("saved-scenarios-list");
  if (!appState.savedScenarios.length) {
    ul.innerHTML = `<li class="saved-item"><span class="field-hint">${esc(isTh ? "ยังไม่มีรายการที่บันทึกไว้ในเบราว์เซอร์ (สามารถกดบันทึกหรือนำเข้าไฟล์ .json ได้ทันที)" : "No scenarios saved in this browser yet. Save above or import a .json file.")}</span></li>`;
    return;
  }
  ul.innerHTML = appState.savedScenarios.map((item) => {
    const n = item.normalized;
    const summary = n ? `${n.modelId} · ${n.gpuId} · ${fmtInt(n.users)} users · ${fmtInt(n.rawPromptTokens)} tok` : "";
    return `
      <li class="saved-item">
        <div class="saved-meta">
          <span class="saved-title">${esc(item.name)}</span>
          <span class="saved-sub">${esc(summary)} · ${esc(fmtIsoDate(item.savedAt))}</span>
        </div>
        <div class="btn-row">
          <button type="button" class="btn" data-load-save="${esc(item.id)}">${esc(t.loadBtn)}</button>
          <button type="button" class="btn btn-danger" data-delete-save="${esc(item.id)}">${esc(t.deleteBtn)}</button>
        </div>
      </li>
    `;
  }).join("");
}

function renderStatusAndSources() {
  const isTh = appState.lang === "th";
  const bar = $("live-announcer");
  const badge = $("source-badge");

  if (appState.loadError) {
    bar.dataset.state = "error";
    bar.textContent = appState.loadError;
    badge.className = "badge badge-bad";
    badge.textContent = "Load Error";
    return;
  }

  const orSrc = appState.data.manifest?.sources?.openrouter;
  const fxDoc = appState.data.fx;
  const orOrigin = orSrc?.origin === "live" ? "Live" : "Snapshot";
  const fxOrigin = fxDoc?.integrity === "complete-transport" ? "Live" : "Snapshot";

  if (appState.liveRefreshStatus === "loading") {
    badge.className = "badge badge-cyan";
    badge.textContent = isTh ? "กำลังอัปเดตราคาสด…" : "Refreshing live rates…";
  } else if (orOrigin === "Live" || fxOrigin === "Live") {
    badge.className = "badge badge-ok";
    badge.textContent = `OpenRouter ${orOrigin} · FX ${fxOrigin}`;
  } else {
    badge.className = "badge";
    badge.textContent = isTh ? "ข้อมูลอ้างอิงตามรอบบันทึก" : "Dated local snapshot";
  }

  if (appState.fieldErrors._global || appState.fieldErrors._form) {
    bar.dataset.state = "error";
    bar.textContent = appState.fieldErrors._global || appState.fieldErrors._form;
  } else if (appState.computed && !appState.computed.ok) {
    bar.dataset.state = "error";
    bar.textContent = appState.computed.reason || appState.computed.fit?.reason || appState.computed.bom?.reason || "Configuration refused.";
  } else if (appState.presetBanner === "sizer_restored") {
    bar.dataset.state = "ok";
    bar.textContent = isTh
      ? "โหลดชุดข้อมูลที่ตั้งค่าไว้กลับมาเรียบร้อยแล้ว สามารถแก้ไขเพิ่มเติมได้ทันที"
      : "Restored saved/shared Local AI Sizer scenario. Adjust any control below.";
  } else if (appState.presetBanner === "preset_applied") {
    bar.dataset.state = "ok";
    bar.textContent = isTh
      ? "โหลดชุดค่าเริ่มต้นโครงการเรียบร้อยแล้ว"
      : "Applied preset parameters.";
  } else {
    bar.dataset.state = "";
    const rateStr = fxDoc ? formatHalfUp(fxDoc.rate, 2) : "N/A";
    bar.textContent = isTh
      ? `พร้อมคำนวณ: อัตราแลกเปลี่ยน ${rateStr} บาท/USD (${fmtIsoDate(fxDoc?.observed_at)}) · ราคา OpenRouter (${orOrigin} ${fmtIsoDate(orSrc?.observed_at)})`
      : `Ready: ECB FX ${rateStr} THB/USD (${fmtIsoDate(fxDoc?.observed_at)}) · OpenRouter tariffs (${orOrigin} ${fmtIsoDate(orSrc?.observed_at)})`;
  }

  $("source-footnote").textContent = isTh
    ? `แหล่งข้อมูล: โมเดลจาก serving-models.json · ราคาเซิร์ฟเวอร์จาก server-pricing.json · ราคา API จาก OpenRouter (${orOrigin}) และ LiteLLM · อัตราแลกเปลี่ยน ECB/Frankfurter (${fxOrigin})`
    : `Sources: architectures from serving-models.json · server bands from server-pricing.json · API tariffs from OpenRouter (${orOrigin}) & LiteLLM · FX from ECB/Frankfurter (${fxOrigin}).`;

  const resetBar = $("reset-confirm");
  if (appState.confirmingReset) {
    const t = I18N[appState.lang];
    resetBar.hidden = false;
    resetBar.innerHTML = `
      <span>${esc(t.resetAsk)}</span>
      <div class="btn-row">
        <button type="button" class="btn btn-danger" id="btn-confirm-reset">${esc(t.resetConfirmBtn)}</button>
        <button type="button" class="btn" id="btn-cancel-reset">${esc(t.resetCancelBtn)}</button>
      </div>
    `;
  } else {
    resetBar.hidden = true;
    resetBar.innerHTML = "";
  }
}

function renderAll({ preserveFocus = false } = {}) {
  recompute();
  renderStaticLabels();
  renderWorkloadCardsAndPills();
  renderModelAndGpuSelectors();
  renderApiControls();
  renderConnectorsList();
  syncInputsFromDraft({ force: !preserveFocus });
  renderAutoGpuAndMatrix();
  renderLedgerAndSummaryRail();
  renderSavedScenariosList();
  renderStatusAndSources();
  syncAddressBar();
}

function handleFieldMutation(name, value) {
  appState.mutationSeq += 1;
  appState.presetBanner = null;
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
  if (name === "modelId") {
    d.modelId = value;
    d.legacyCustomAssumed = false;
    if (value === "custom") {
      if (!d.customParamsB) d.customParamsB = "70";
      if (!d.customActiveParamsB) d.customActiveParamsB = d.customParamsB;
      $("details-custom-model").open = true;
    }
    return;
  }
  if (name === "customParamsB" || name === "customActiveParamsB" || name === "customKvBytesBf16" || name === "customContextMax") {
    d[name] = value;
    d.legacyCustomAssumed = false;
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

function defaultScenarioName() {
  const w = LOCAL_AI_WORKLOADS.find((x) => x.id === appState.draft.workloadId);
  const title = w ? w[appState.lang].sectorTag : appState.draft.workloadId;
  return `${title} · ${appState.draft.modelId} · ${appState.draft.gpuId} (${appState.draft.users}u)`.slice(0, 80);
}

function handleSaveBrowser() {
  const isTh = appState.lang === "th";
  let frag;
  try {
    frag = buildCurrentFragment();
  } catch (err) {
    appState.saveStatus = { state: "error", text: err.message };
    renderSavedScenariosList();
    return;
  }
  const rawName = $("save-name-input").value.trim() || defaultScenarioName();
  const id = `scn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const savedAt = new Date().toISOString();
  const res = storageAdapter.saveScenario({ id, name: rawName, savedAt, fragment: frag });
  if (!res.ok) {
    appState.saveStatus = { state: "error", text: res.error };
    if (res.code === "storage_unavailable") appState.storageAvailable = false;
    renderSavedScenariosList();
    return;
  }
  appState.savedScenarios = res.scenarios;
  $("save-name-input").value = "";
  appState.saveStatus = {
    state: "ok",
    text: isTh ? `บันทึก "${rawName}" ไว้ในเบราว์เซอร์แล้ว` : `Saved "${rawName}" in browser storage.`,
  };
  renderSavedScenariosList();
}

function handleExportJson() {
  const isTh = appState.lang === "th";
  let frag;
  try {
    frag = buildCurrentFragment();
  } catch (err) {
    appState.saveStatus = { state: "error", text: err.message };
    renderSavedScenariosList();
    return;
  }
  const nowIso = new Date().toISOString();
  const rawName = $("save-name-input").value.trim() || defaultScenarioName();
  const currentRecord = {
    id: `export-${Date.now().toString(36)}`,
    name: rawName,
    savedAt: nowIso,
    fragment: frag,
  };
  let jsonText;
  try {
    jsonText = encodeSizerSaveEnvelope([currentRecord], { exportedAt: nowIso, allowEmpty: false });
  } catch (err) {
    appState.saveStatus = { state: "error", text: err.message };
    renderSavedScenariosList();
    return;
  }
  const blob = new Blob([jsonText], { type: "application/json" });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "scenario";
  a.download = `local-ai-sizer-${slug.slice(0, 36)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  appState.saveStatus = {
    state: "ok",
    text: isTh ? "ดาวน์โหลดไฟล์ .json เรียบร้อยแล้ว" : "Downloaded scenario .json file.",
  };
  renderSavedScenariosList();
}

async function handleImportJsonFile(file) {
  if (!file) return;
  const isTh = appState.lang === "th";
  const importOpSeq = ++appState.mutationSeq;

  if (file.size > MAX_SAVE_BYTES) {
    appState.saveStatus = {
      state: "error",
      text: isTh
        ? `ไฟล์มีขนาดใหญ่เกินกำหนด 64 KiB (${file.size} bytes)`
        : `Import rejected: file exceeds the 64 KiB safety limit (${file.size} bytes).`,
    };
    renderSavedScenariosList();
    return;
  }

  let text;
  try {
    text = await file.text();
  } catch (err) {
    if (importOpSeq !== appState.mutationSeq) return;
    appState.saveStatus = { state: "error", text: `Unable to read file: ${err.message}` };
    renderSavedScenariosList();
    return;
  }

  // Abandon stale async file read if user edited inputs or started a newer import meanwhile.
  if (importOpSeq !== appState.mutationSeq) return;

  let decoded;
  try {
    decoded = decodeSizerSaveEnvelope(text, { allowEmpty: false });
  } catch (err) {
    appState.saveStatus = {
      state: "error",
      text: isTh ? `นำเข้าไฟล์ไม่สำเร็จ: ${err.message}` : `Import rejected: ${err.message}`,
    };
    renderSavedScenariosList();
    return;
  }

  const primary = decoded.scenarios[0];
  hydrateDraftFromNormalized(primary.normalized);
  appState.displayCurrency = primary.normalized.quoteCurrency;
  appState.presetBanner = "sizer_restored";
  $("save-name-input").value = primary.name;
  appState.saveStatus = {
    state: "ok",
    text: isTh
      ? `นำเข้า "${primary.name}" เรียบร้อยแล้ว (${decoded.scenarios.length} รายการในไฟล์)`
      : `Imported "${primary.name}" (${decoded.scenarios.length} scenario${decoded.scenarios.length === 1 ? "" : "s"} validated).`,
  };
  renderAll();
}

function wireEvents() {
  document.addEventListener("click", async (ev) => {
    const target = ev.target.closest("button, a");
    if (!target) return;

    if (target.id === "lang-th" || target.id === "lang-en") {
      appState.lang = target.id === "lang-th" ? "th" : "en";
      renderAll();
      return;
    }
    if (target.id === "cur-thb" || target.id === "cur-usd") {
      appState.displayCurrency = target.id === "cur-thb" ? "THB" : "USD";
      renderAll();
      return;
    }

    const wlBtn = ev.target.closest("[data-workload-id]");
    if (wlBtn) {
      appState.mutationSeq += 1;
      appState.presetBanner = null;
      selectWorkloadPreset(wlBtn.dataset.workloadId);
      renderAll();
      return;
    }

    const promptBtn = ev.target.closest("[data-prompt-preset]");
    if (promptBtn) {
      const p = PROMPT_SCALE_PRESETS.find((x) => x.id === promptBtn.dataset.promptPreset);
      if (p) {
        appState.mutationSeq += 1;
        appState.presetBanner = null;
        appState.draft.rawPromptTokens = String(p.rawPromptTokens);
        appState.draft.rawOutputTokens = String(p.rawOutputTokens);
        if (Number(appState.draft.rawContextTokens) < p.rawContextTokens) {
          appState.draft.rawContextTokens = String(p.rawContextTokens);
        }
        renderAll();
      }
      return;
    }

    const pickGpuBtn = ev.target.closest("[data-pick-gpu]");
    if (pickGpuBtn) {
      appState.mutationSeq += 1;
      appState.presetBanner = null;
      appState.draft.gpuId = pickGpuBtn.dataset.pickGpu;
      appState.draft.serverId = "";
      renderAll();
      return;
    }

    if (target.id === "btn-clear-custom-model") {
      appState.mutationSeq += 1;
      if (appState.draft.modelId === "custom") {
        const w = LOCAL_AI_WORKLOADS.find((x) => x.id === appState.draft.workloadId) ?? LOCAL_AI_WORKLOADS[0];
        appState.draft.modelId = w.recommendedModelId;
      }
      appState.draft.customParamsB = "";
      appState.draft.customActiveParamsB = "";
      appState.draft.customKvBytesBf16 = "";
      appState.draft.customContextMax = "";
      appState.draft.legacyCustomAssumed = false;
      renderAll();
      return;
    }

    if (target.id === "btn-api-auto") {
      appState.mutationSeq += 1;
      appState.draft.apiOfferId = "";
      renderAll();
      return;
    }

    if (target.id === "btn-api-clear-filters") {
      appState.viewFilters.apiFeed = "all";
      appState.viewFilters.apiVendor = "all";
      appState.viewFilters.apiSearch = "";
      renderApiControls();
      return;
    }

    if (target.id === "btn-save-browser") {
      handleSaveBrowser();
      return;
    }
    if (target.id === "btn-export-json") {
      handleExportJson();
      return;
    }
    if (target.id === "btn-import-json") {
      const inp = $("file-import-json");
      inp.value = "";
      inp.click();
      return;
    }

    const loadBtn = ev.target.closest("[data-load-save]");
    if (loadBtn) {
      const rec = appState.savedScenarios.find((x) => x.id === loadBtn.dataset.loadSave);
      if (rec?.normalized) {
        appState.mutationSeq += 1;
        hydrateDraftFromNormalized(rec.normalized);
        appState.displayCurrency = rec.normalized.quoteCurrency;
        appState.presetBanner = "sizer_restored";
        appState.saveStatus = {
          state: "ok",
          text: appState.lang === "th" ? `โหลด "${rec.name}" แล้ว` : `Loaded "${rec.name}".`,
        };
        renderAll();
      }
      return;
    }

    const delBtn = ev.target.closest("[data-delete-save]");
    if (delBtn) {
      const res = storageAdapter.deleteScenario(delBtn.dataset.deleteSave);
      if (res.ok) {
        appState.savedScenarios = res.scenarios;
        appState.saveStatus = {
          state: "ok",
          text: appState.lang === "th" ? "ลบรายการที่บันทึกไว้แล้ว" : "Deleted saved scenario.",
        };
      } else {
        appState.saveStatus = { state: "error", text: res.error };
      }
      renderSavedScenariosList();
      return;
    }

    if (target.id === "btn-copy-link") {
      try {
        const frag = buildCurrentFragment();
        const shareUrl = new URL(window.location.href);
        shareUrl.hash = frag;
        await navigator.clipboard?.writeText(shareUrl.toString());
        target.textContent = I18N[appState.lang].copiedLinkBtn;
        setTimeout(() => { target.textContent = I18N[appState.lang].copyLinkBtn; }, 1800);
      } catch (err) {
        if (err instanceof SizerValidationError) {
          appState.saveStatus = { state: "error", text: err.message };
          renderSavedScenariosList();
        }
      }
      return;
    }

    if (target.id === "btn-print") {
      window.print();
      return;
    }

    if (target.id === "btn-reset") {
      appState.confirmingReset = true;
      renderStatusAndSources();
      return;
    }
    if (target.id === "btn-cancel-reset") {
      appState.confirmingReset = false;
      renderStatusAndSources();
      return;
    }
    if (target.id === "btn-confirm-reset") {
      appState.mutationSeq += 1;
      appState.confirmingReset = false;
      appState.presetBanner = null;
      appState.fieldErrors = {};
      appState.draft = defaultDraft();
      renderAll();
    }
  });

  document.addEventListener("change", (ev) => {
    const el = ev.target;
    if (el.id === "file-import-json") {
      const file = el.files?.[0];
      if (file) handleImportJsonFile(file);
      return;
    }
    if (el.id === "filter-api-feed") {
      appState.viewFilters.apiFeed = el.value;
      renderApiControls();
      return;
    }
    if (el.id === "filter-api-vendor") {
      appState.viewFilters.apiVendor = el.value;
      renderApiControls();
      return;
    }
    if (el.dataset?.connectorId) {
      appState.mutationSeq += 1;
      const cid = el.dataset.connectorId;
      const set = new Set(appState.draft.connectors);
      if (el.checked) set.add(cid);
      else set.delete(cid);
      appState.draft.connectors = [...set];
      renderAll();
      return;
    }
    if (el.dataset?.field) {
      handleFieldMutation(el.dataset.field, el.value);
      renderAll();
    }
  });

  document.addEventListener("input", (ev) => {
    const el = ev.target;
    if (el.id === "filter-api-search") {
      appState.viewFilters.apiSearch = el.value;
      renderApiControls();
      return;
    }
    if (el.tagName === "INPUT" && el.dataset?.field) {
      handleFieldMutation(el.dataset.field, el.value);
      recompute();
      renderWorkloadCardsAndPills();
      renderModelAndGpuSelectors();
      renderApiControls();
      syncInputsFromDraft();
      renderAutoGpuAndMatrix();
      renderLedgerAndSummaryRail();
      renderStatusAndSources();
      syncAddressBar();
    }
  });
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
  const smallPrimaryTargets = [];
  const spills = [];
  const sizes = new Map();
  const textBoxes = new Set();

  for (const el of document.querySelectorAll("body *")) {
    if (!shown(el) || el.id === "auditReport" || el.closest("#auditReport")) continue;
    const cs = getComputedStyle(el);
    const isControl = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|hidden|file)$/.test(el.type);
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

  for (const el of document.querySelectorAll('a[href],button,input,select,summary,[tabindex]:not([tabindex="-1"])')) {
    if (!shown(el) || el.type === "checkbox" || el.type === "file") continue;
    const r = el.getBoundingClientRect();
    const inLedger = Boolean(el.closest(".ledger-table"));
    if (r.width < 24 || r.height < 24) {
      smallTargets.push({ sel: nameOf(el), w: Math.round(r.width), h: Math.round(r.height) });
    }
    if (!inLedger && (r.width < 44 || r.height < 44)) {
      smallPrimaryTargets.push({ sel: nameOf(el), w: Math.round(r.width), h: Math.round(r.height) });
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
    macrostructure: "Workbench",
    docOverflowX,
    typeScale: scale,
    hierarchyRatio: scale.length > 1 ? Math.round((scale[0] / scale[1]) * 100) / 100 : 1,
    contrastFails,
    smallText,
    smallTargets,
    smallPrimaryTargets,
    spills,
    ledgerRowOver48,
    ledgerPadOver24,
    computedOk: Boolean(appState.computed?.ok),
    workloadCount: document.querySelectorAll("[data-workload-id]").length,
    gpuCandidateCount: appState.gpuCandidates.length,
  };

  const out = $("auditReport");
  out.hidden = false;
  out.textContent = JSON.stringify(report, null, 2);
}

async function init() {
  applyUrlStateOnBoot();
  const initialSaved = storageAdapter.readSavedScenarios();
  appState.storageAvailable = initialSaved.available;
  if (initialSaved.ok) {
    appState.savedScenarios = initialSaved.scenarios;
  } else if (initialSaved.corrupted) {
    appState.saveStatus = { state: "warn", text: initialSaved.error };
  }

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

    // Bounded 4s overall live OpenRouter + Frankfurter FX refresh; updates source data only, never draft inputs.
    refreshLiveSourcesTransaction({
      manifest: appState.data.manifest,
      catalog: appState.data.catalog,
      fx: appState.data.fx,
      timeoutMs: 4000,
    }).then(async (liveRes) => {
      appState.data.manifest = liveRes.manifest;
      appState.data.catalog = liveRes.catalog;
      appState.data.fx = liveRes.fx;
      appState.liveRefreshStatus = (liveRes.openrouterLive && liveRes.fxLive)
        ? "live"
        : ((liveRes.openrouterLive || liveRes.fxLive) ? "partial" : "fallback");
      renderAll({ preserveFocus: true });
      await runDomAuditIfRequested();
    });

    await runDomAuditIfRequested();
  } catch (err) {
    appState.loadError = `Failed to load local snapshots: ${err.message}`;
    $("main-workspace").setAttribute("aria-busy", "false");
    renderStatusAndSources();
  }
}

if (typeof document !== "undefined" && document.getElementById("main-workspace")) {
  init();
}