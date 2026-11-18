// Shared pure sizing, BOM, fit-qualification, and URL-fragment transfer kernel
// for local-ai-sizer.html and tco-calculator.html.
//
// Zero DOM, storage, network, wall-clock-at-import, or private campaign tables.
// Both surfaces run calculator.js:runComparison over the same normalized scenario.

import { Dec, Rat, formatHalfUp, toRat, ratStr } from "./exact.js";
import { normalizeFxDocument, toTHB, toUSD, fxRate } from "./currency.js";
import { buildDemand, peakTokensPerSecond, gpusForLoad, validateMix, DemandRefusal, WORKLOAD_TYPES } from "./demand.js";
import { servingPlan, resolveModelResidency, kvBytesPerToken, kvBytesPerSequence, ServingRefusal } from "./serving.js";
import { nodesForFleet, cheapestConfigFor, serversForGpu, CapexRefusal } from "./capex.js?v=20260906-ux3";
import { subscriptionCost, SubscriptionRefusal } from "./subscription.js";
import { configurePowerSeed, runningCost, PowerRefusal } from "./power.js";
import { runComparison } from "./calculator.js?v=20260906-ux3";

export const SIZER_SCHEMA = "factor-io.sizer/1.0.0";
export const SIZER_SAVE_SCHEMA = "factor-io.sizer-save/1.0.0";
export const SIZER_FRAGMENT_PREFIX = "sizer=v1.";
export const PRESET_FRAGMENT_PREFIX = "preset=v1.";
export const MAX_FRAGMENT_CHARS = 8192;
export const MAX_SAVE_BYTES = 65536;
export const MAX_SAVED_SCENARIOS = 25;

export const PCIE_ONLY_GPUS = new Set([
  "rtx_pro_6000_ws",
  "rtx_pro_6000_se",
  "l40s",
  "l4",
  "a10",
  "a10g",
]);

export const QUOTE_BASES = new Set([
  "catalog",
  "integrated_node",
  "component_split",
  "fleet_total",
]);

export const TOKEN_BASES = new Set([
  "latin_reference_1_4x",
  "thai_tokenized_1x",
]);

export const CURRENCIES = new Set(["THB", "USD"]);

export class SizerValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SizerValidationError";
    this.code = code;
  }
}

// Brand-neutral technical scope tiers (zero confidential promo prices in public code).
export const DEAL_TIERS = Object.freeze({
  S: Object.freeze({
    id: "S",
    usersBand: "50\u2013150",
    connectorsIncluded: 1,
    RecommendedGpus: "1\u20132 GPUs",
    durationWeeks: "3\u20134",
    en: {
      name: "Size S: Department Pilot & Sovereign Knowledge",
      summary: "Single-team private AI stack with Thai OCR/RAG and 1 governed internal data connector.",
      gfScope: "Greenfield: L1\u2013L2 K8s + GPU Operator + DCGM telemetry, L3 Thai OCR/RAG + vLLM, L4 1 live DB/API connector + SSO.",
      bfScope: "Brownfield: Deploy L3 Thai OCR/RAG + vLLM and L4 live connector onto existing K8s/GPU cluster.",
    },
    th: {
      name: "ขนาด\u00A0S: ระบบนำร่องระดับแผนกและคลังความรู้ภายใน\u2060องค์กร",
      summary: "ระบบ\u00A0Local\u00A0AI สำหรับทีมงานเฉพาะทาง พร้อม\u00A0Thai\u00A0OCR/RAG และเชื่อมต่อระบบข้อมูลภายใน\u00A01\u00A0ช่องทาง",
      gfScope: "Greenfield: ติดตั้ง\u00A0L1\u2013L2\u00A0K8s + GPU\u00A0Operator + Telemetry, L3\u00A0Thai\u00A0OCR/RAG + vLLM และ\u00A0L4\u00A0เชื่อม\u00A0API/DB\u00A01\u00A0ระบบ",
      bfScope: "Brownfield: ติดตั้งเฉพาะ\u00A0L3\u00A0Thai\u00A0OCR/RAG + vLLM และ\u00A0L4\u00A0เชื่อม\u00A0API/DB บนคลัสเตอร์เดิมของลูกค้า",
    },
  }),
  M: Object.freeze({
    id: "M",
    usersBand: "150\u2013500",
    connectorsIncluded: 2,
    RecommendedGpus: "2\u20134 GPUs",
    durationWeeks: "5\u20136",
    en: {
      name: "Size M: Multi-Team Production & Live Data Pipelines",
      summary: "HA serving with Thai fiscal/document OCR, hybrid vector search, and 2 live SQL/API/LINE pipelines.",
      gfScope: "Greenfield: HA K8s/OpenShift/NKP + MIG/GPU Operator, L3 hybrid RAG + Thai layout OCR, L4 2 live SQL/REST/LINE pipelines + AD RBAC.",
      bfScope: "Brownfield: Layer L3 hybrid RAG/OCR + vLLM HA and L4 2 live SQL/REST/LINE pipelines onto existing platform.",
    },
    th: {
      name: "ขนาด\u00A0M: ระบบใช้งานจริงหลายแผนกพร้อมเชื่อม\u00A0Data\u00A0Pipeline\u00A0สด",
      summary: "รองรับงาน\u00A0HA พร้อม\u00A0Thai\u00A0Layout\u00A0OCR ค้นหาเอกสารแม่นยำ และเชื่อม\u00A0SQL/API/LINE\u00A0สด\u00A02\u00A0ช่องทาง",
      gfScope: "Greenfield: ติดตั้ง\u00A0HA\u00A0K8s + GPU\u00A0Operator, L3\u00A0Hybrid\u00A0RAG/OCR และ\u00A0L4\u00A0เชื่อม\u00A0SQL/REST/LINE\u00A02\u00A0ระบบ\u00A0พร้อม\u00A0AD\u00A0RBAC",
      bfScope: "Brownfield: ติดตั้ง\u00A0L3\u00A0Hybrid\u00A0RAG/OCR + vLLM\u00A0HA และ\u00A0L4\u00A0เชื่อมข้อมูลสด\u00A02\u00A0ระบบบนโครงสร้างเดิม",
    },
  }),
  L: Object.freeze({
    id: "L",
    usersBand: "500\u20131,500",
    connectorsIncluded: 4,
    RecommendedGpus: "4\u20138 GPUs",
    durationWeeks: "7\u201310",
    en: {
      name: "Size L: Enterprise Business-Unit Hub & ERP/CDC Integration",
      summary: "Multi-model routing, continuous SharePoint/S3 CDC, SAP/ERP validation workflows, and MCP policy gates.",
      gfScope: "Greenfield: Multi-node GPU cluster + quota governance, L3 multi-model vLLM + CDC ingestion, L4 4 live ERP/SQL/API/CDC pipelines + audit ledger.",
      bfScope: "Brownfield: Integrate L3 multi-model vLLM + CDC ingestion and L4 4 live ERP/SQL/API/CDC pipelines on existing cluster.",
    },
    th: {
      name: "ขนาด\u00A0L: ศูนย์กลางระดับสายธุรกิจเชื่อมต่อ\u00A0ERP\u00A0และ\u00A0CDC\u00A0ครบวงจร",
      summary: "แยกโมเดลตามงาน ซิงก์เอกสาร\u00A0SharePoint/S3\u00A0อัตโนมัติ ตรวจสอบข้อมูล\u00A0SAP/ERP และคุมสิทธิ์ด้วย\u00A0MCP\u00A0Gate",
      gfScope: "Greenfield: คลัสเตอร์หลายโหนดพร้อมระบบโควตา, L3\u00A0Multi-model\u00A0vLLM + CDC และ\u00A0L4\u00A0เชื่อม\u00A0ERP/SQL/API\u00A04\u00A0ระบบ",
      bfScope: "Brownfield: ติดตั้ง\u00A0L3\u00A0Multi-model\u00A0vLLM + CDC และ\u00A0L4\u00A0เชื่อม\u00A0ERP/SQL/API\u00A04\u00A0ระบบบนคลัสเตอร์เดิม",
    },
  }),
  XL: Object.freeze({
    id: "XL",
    usersBand: "1,500+",
    connectorsIncluded: 6,
    RecommendedGpus: "8+ GPUs",
    durationWeeks: "10\u201314",
    en: {
      name: "Size XL: Sovereign Regulated AI Factory & Air-Gapped Governance",
      summary: "Multi-cluster/DR topology, air-gapped registry, full enterprise data mesh connectors, and compliance audit.",
      gfScope: "Greenfield: Multi-rack/DR GPU fabric + air-gapped supply chain, L3 high-throughput model pool, L4 custom enterprise ERP/DB/API/SIEM suite.",
      bfScope: "Brownfield: Deploy sovereign L3 model pool, air-gapped artifacts, and L4 custom enterprise ERP/DB/API/SIEM suite onto existing fabric.",
    },
    th: {
      name: "ขนาด\u00A0XL: ระบบ\u00A0AI\u00A0ระดับองค์กรกำกับดูแลเข้มงวดและ\u00A0Air-Gapped",
      summary: "รองรับหลายคลัสเตอร์/DR คลังซอฟต์แวร์แบบปิด เชื่อมต่อระบบข้อมูลหลักครบทุกสายงานพร้อมบันทึกตรวจสอบ",
      gfScope: "Greenfield: ระบบหลายตู้แร็ค/DR แบบ\u00A0Air-Gapped, L3\u00A0พูลโมเดลความเร็วสูง และ\u00A0L4\u00A0เชื่อม\u00A0ERP/DB/API/SIEM\u00A0ครบชุด",
      bfScope: "Brownfield: ติดตั้งพูลโมเดล\u00A0L3 แบบ\u00A0Air-Gapped และเชื่อม\u00A0L4\u00A0ERP/DB/API/SIEM\u00A0ครบชุดบนระบบเดิม",
    },
  }),
});

export const PIPELINE_CONNECTORS = Object.freeze([
  Object.freeze({
    id: "sql_db",
    pillar: "L4",
    en: { label: "SQL & Relational Databases", detail: "Read-governed PostgreSQL, SQL Server, Oracle, MySQL query & schema guardrails" },
    th: { label: "ฐานข้อมูล\u00A0SQL\u00A0และระบบฐานข้อมูลหลัก", detail: "เชื่อมต่อ\u00A0PostgreSQL, SQL\u00A0Server, Oracle, MySQL แบบจำกัดสิทธิ์อ่านและตรวจสอบคำสั่ง" },
  }),
  Object.freeze({
    id: "rest_graphql",
    pillar: "L4",
    en: { label: "Internal REST / GraphQL & Webhook APIs", detail: "Typed microservice tool calls with schema validation and timeout circuit breakers" },
    th: { label: "ระบบ\u00A0REST / GraphQL\u00A0API\u00A0ภายในองค์กร", detail: "เชื่อมต่อเซอร์วิสภายในพร้อมตรวจรูปแบบข้อมูลและตัดวงจรเมื่อปลายทางช้า" },
  }),
  Object.freeze({
    id: "erp_crm",
    pillar: "L4",
    en: { label: "SAP / ERP / CRM Transaction Sync", detail: "PO, tax invoice (ภ.พ.20), inventory, and customer case verification with human approval gates" },
    th: { label: "ระบบ\u00A0SAP / ERP / CRM\u00A0และเอกสารบัญชี", detail: "ตรวจใบสั่งซื้อ ใบกำกับภาษี\u00A0ภ.พ.20 และข้อมูลลูกค้าพร้อมขั้นตอนอนุมัติโดยเจ้าหน้าที่" },
  }),
  Object.freeze({
    id: "doc_cdc",
    pillar: "L3",
    en: { label: "SharePoint / S3 / NAS Continuous Document CDC", detail: "Thai/EN layout OCR, table extraction, and permission-aware vector re-indexing" },
    th: { label: "ซิงก์เอกสาร\u00A0SharePoint / S3 / NAS\u00A0อัตโนมัติ", detail: "สกัดตารางด้วย\u00A0Thai/EN\u00A0OCR และอัปเดตดัชนีค้นหาตามสิทธิ์การเข้าถึงเอกสารจริง" },
  }),
  Object.freeze({
    id: "line_oa",
    pillar: "L4",
    en: { label: "LINE OA & Service Desk Omnichannel", detail: "Signature-verified LINE webhook, image/slip intake, and agent handoff queue" },
    th: { label: "ช่องทาง\u00A0LINE\u00A0OA\u00A0และระบบรับแจ้งงาน", detail: "รับข้อความและรูปเอกสารผ่าน\u00A0Webhook\u00A0นิรภัย พร้อมส่งต่องานให้เจ้าหน้าที่ทันที" },
  }),
  Object.freeze({
    id: "sso_mcp",
    pillar: "L4",
    en: { label: "AD / OIDC SSO & MCP Policy Gate", detail: "Row-level identity propagation and deterministic tool-execution audit trail" },
    th: { label: "ยืนยันตัวตน\u00A0AD / OIDC\u00A0และ\u00A0MCP\u00A0Policy\u00A0Gate", detail: "ผูกสิทธิ์ผู้ใช้งานรายบุคคลและบันทึกประวัติการเรียกใช้เครื่องมือทุกขั้นตอน" },
  }),
]);

export const PROMPT_SCALE_PRESETS = Object.freeze([
  Object.freeze({
    id: "8k",
    rawPromptTokens: 8192,
    rawOutputTokens: 600,
    rawContextTokens: 32768,
    en: "8k prompt (system + short RAG)",
    th: "8k\u00A0โทเคน\u00A0(System + RAG\u00A0สั้น)",
  }),
  Object.freeze({
    id: "16k",
    rawPromptTokens: 16384,
    rawOutputTokens: 800,
    rawContextTokens: 65536,
    en: "16k prompt (multi-doc RAG + tools)",
    th: "16k\u00A0โทเคน\u00A0(ค้นหลายเอกสาร + Tool)",
  }),
  Object.freeze({
    id: "32k",
    rawPromptTokens: 32768,
    rawOutputTokens: 1200,
    rawContextTokens: 65536,
    en: "32k prompt (full dossier / TOR)",
    th: "32k\u00A0โทเคน\u00A0(แฟ้มสัญญา / TOR\u00A0เต็มชุด)",
  }),
  Object.freeze({
    id: "64k",
    rawPromptTokens: 65536,
    rawOutputTokens: 1600,
    rawContextTokens: 90000,
    en: "64k+ prompt (deep codebase / audit)",
    th: "64k+\u00A0โทเคน\u00A0(ตรวจสอบโค้ด / Log\u00A0ขนาดใหญ่)",
  }),
]);

export const LOCAL_AI_WORKLOADS = Object.freeze([
  Object.freeze({
    id: "thai_knowledge_rag",
    sector: "enterprise",
    recommendedModelId: "qwen3-8-27b",
    recommendedGpuId: "rtx_pro_6000_se",
    recommendedTier: "M",
    defaultConnectors: ["doc_cdc", "sso_mcp"],
    users: 320,
    sessionsPerUserDay: "5",
    workingDaysMo: "22",
    peakConcurrencyFraction: "0.10",
    tokensPerSecondPerStream: "30",
    mix: { chat: "0.15", rag: "0.75", graph_rag: "0.10", agentic: "0" },
    rawPromptTokens: 14000,
    rawOutputTokens: 700,
    rawContextTokens: 65536,
    defaultSystemPromptTokens: 20000,
    defaultTurnPromptTokens: 2500,
    defaultTurnsPerSession: 4,
    defaultKvCacheHitRate: "0.75",
    en: {
      sectorTag: "Corporate HR / SOP",
      title: "Thai Enterprise Knowledge & Policy RAG Copilot",
      whyLocal: "Multi-chunk HR, board policy, and engineering PDF retrieval plus 20k+ agent system instructions stay inside corporate network with fixed monthly cost.",
    },
    th: {
      sectorTag: "องค์กรทั่วไป / HR & SOP",
      title: "ระบบค้นหาความรู้และระเบียบปฏิบัติภาษาไทย\u2060ภายในองค์กร",
      whyLocal: "ป้อน\u00A0System\u00A0Prompt\u00A0พร้อมเนื้อหาเอกสาร\u00A0PDF\u00A0หลายหน้าโดยข้อมูลไม่ออกนอกองค์กร และคุมงบคงที่ได้",
    },
  }),
  Object.freeze({
    id: "thai_doc_line_ops",
    sector: "commerce_ops",
    recommendedModelId: "qwen3-8-27b",
    recommendedGpuId: "rtx_pro_6000_se",
    recommendedTier: "M",
    defaultConnectors: ["line_oa", "erp_crm", "doc_cdc"],
    users: 400,
    sessionsPerUserDay: "6",
    workingDaysMo: "30",
    peakConcurrencyFraction: "0.10",
    tokensPerSecondPerStream: "30",
    mix: { chat: "0.25", rag: "0.50", graph_rag: "0", agentic: "0.25" },
    rawPromptTokens: 10500,
    rawOutputTokens: 550,
    rawContextTokens: 65536,
    defaultSystemPromptTokens: 20000,
    defaultTurnPromptTokens: 1800,
    defaultTurnsPerSession: 4,
    defaultKvCacheHitRate: "0.80",
    en: {
      sectorTag: "Retail / Omnichannel",
      title: "24/7 LINE OA, Slip & Thai Fiscal OCR Intake",
      whyLocal: "Continuous Thai tax invoice (ภ.พ.20), payment slip OCR JSON, and customer case history triage where cloud token bills compound nonstop.",
    },
    th: {
      sectorTag: "ค้าปลีก / บริการลูกค้า",
      title: "ระบบรับเอกสารภาษี\u00A0สลิป\u00A0และดูแลลูกค้าผ่าน\u00A0LINE\u00A0OA\u00A024\u00A0ชม.",
      whyLocal: "รวมผล\u00A0OCR\u00A0ใบกำกับภาษี\u00A0ประวัติแชต\u00A0และกฎการตรวจสอบในคำสั่งเดียว ลดค่า\u00A0API\u00A0รายโทเคนที่บานปลาย",
    },
  }),
  Object.freeze({
    id: "sql_erp_copilot",
    sector: "erp_data",
    recommendedModelId: "qwen3-6-35b-a3b",
    recommendedGpuId: "rtx_pro_6000_se",
    recommendedTier: "L",
    defaultConnectors: ["sql_db", "rest_graphql", "erp_crm", "sso_mcp"],
    users: 500,
    sessionsPerUserDay: "5",
    workingDaysMo: "22",
    peakConcurrencyFraction: "0.12",
    tokensPerSecondPerStream: "30",
    mix: { chat: "0.15", rag: "0.40", graph_rag: "0.15", agentic: "0.30" },
    rawPromptTokens: 18000,
    rawOutputTokens: 800,
    rawContextTokens: 65536,
    defaultSystemPromptTokens: 22000,
    defaultTurnPromptTokens: 3200,
    defaultTurnsPerSession: 5,
    defaultKvCacheHitRate: "0.75",
    en: {
      sectorTag: "SAP / ERP & BI",
      title: "Connected SQL, SAP/ERP & Internal API Copilot",
      whyLocal: "Carries full SQL DDL schemas, MCP tool definitions, and multi-row query results next to private databases with zero external schema exposure.",
    },
    th: {
      sectorTag: "การเงิน / SAP & BI",
      title: "ผู้ช่วยวิเคราะห์ข้อมูลเชื่อม\u00A0SQL, SAP/ERP\u00A0และ\u00A0API\u00A0ภายใน",
      whyLocal: "แนบโครงสร้างตาราง\u00A0SQL\u00A0คำนิยาม\u00A0Tool\u00A0และผลลัพธ์ข้อมูลจริงได้เต็มที่โดยไม่ต้องส่งออกนอกดาต้าเซ็นเตอร์",
    },
  }),
  Object.freeze({
    id: "bfsi_kyc_claims",
    sector: "bfsi",
    recommendedModelId: "gemma-4-31b",
    recommendedGpuId: "rtx_pro_6000_se",
    recommendedTier: "L",
    defaultConnectors: ["doc_cdc", "erp_crm", "sql_db", "sso_mcp"],
    users: 380,
    sessionsPerUserDay: "6",
    workingDaysMo: "24",
    peakConcurrencyFraction: "0.12",
    tokensPerSecondPerStream: "30",
    mix: { chat: "0.10", rag: "0.60", graph_rag: "0.10", agentic: "0.20" },
    rawPromptTokens: 24000,
    rawOutputTokens: 900,
    rawContextTokens: 65536,
    defaultSystemPromptTokens: 22000,
    defaultTurnPromptTokens: 4000,
    defaultTurnsPerSession: 5,
    defaultKvCacheHitRate: "0.75",
    en: {
      sectorTag: "Banking & Insurance",
      title: "BFSI KYC, Loan Underwriting & Claims Dossier Review",
      whyLocal: "Processes multi-page Thai KYC forms, bank statements, hospital claim bundles, and policy schedules under BoT and OIC residency controls.",
    },
    th: {
      sectorTag: "ธนาคารและประกันภัย",
      title: "ระบบวิเคราะห์สินเชื่อ\u00A0KYC\u00A0และตรวจแฟ้มเคลมประกันภัย",
      whyLocal: "ตรวจเอกสารคำขอสินเชื่อ\u00A0ใบแจ้งหนี้ค่ารักษา\u00A0และเงื่อนไขกรมธรรม์หลายสิบหน้าภายใต้เกณฑ์\u00A0ธปท.\u00A0และ\u00A0คปภ.",
    },
  }),
  Object.freeze({
    id: "mfg_qms_sop",
    sector: "manufacturing",
    recommendedModelId: "qwen3-8-27b",
    recommendedGpuId: "rtx_pro_6000_ws",
    recommendedTier: "M",
    defaultConnectors: ["doc_cdc", "sql_db", "line_oa"],
    users: 260,
    sessionsPerUserDay: "5",
    workingDaysMo: "26",
    peakConcurrencyFraction: "0.10",
    tokensPerSecondPerStream: "30",
    mix: { chat: "0.20", rag: "0.65", graph_rag: "0", agentic: "0.15" },
    rawPromptTokens: 12500,
    rawOutputTokens: 600,
    rawContextTokens: 65536,
    defaultSystemPromptTokens: 20000,
    defaultTurnPromptTokens: 2200,
    defaultTurnsPerSession: 4,
    defaultKvCacheHitRate: "0.75",
    en: {
      sectorTag: "Manufacturing / EEC",
      title: "Factory QMS, ISO/IATF SOP & Maintenance Copilot",
      whyLocal: "Runs inside plant networks across EEC industrial estates for TH/EN/JP work instructions, MES fault logs, and 8D quality reports.",
    },
    th: {
      sectorTag: "โรงงานอุตสาหกรรม / EEC",
      title: "ผู้ช่วยวิศวกรรมโรงงาน\u00A0QMS/ISO\u00A0และซ่อมบำรุงเครื่องจักร",
      whyLocal: "ค้นคู่มือการผลิตหลายภาษา\u00A0(ไทย-อังกฤษ-ญี่ปุ่น)\u00A0บันทึกเครื่องจักร\u00A0และรายงาน\u00A08D\u00A0ภายในเครือข่ายโรงงานโดยตรง",
    },
  }),
  Object.freeze({
    id: "hospital_his_clinical",
    sector: "healthcare",
    recommendedModelId: "gemma-4-31b",
    recommendedGpuId: "rtx_pro_6000_se",
    recommendedTier: "L",
    defaultConnectors: ["sql_db", "rest_graphql", "sso_mcp"],
    users: 450,
    sessionsPerUserDay: "8",
    workingDaysMo: "30",
    peakConcurrencyFraction: "0.12",
    tokensPerSecondPerStream: "30",
    mix: { chat: "0.15", rag: "0.65", graph_rag: "0", agentic: "0.20" },
    rawPromptTokens: 16000,
    rawOutputTokens: 750,
    rawContextTokens: 65536,
    defaultSystemPromptTokens: 20000,
    defaultTurnPromptTokens: 2800,
    defaultTurnsPerSession: 4,
    defaultKvCacheHitRate: "0.80",
    en: {
      sectorTag: "Healthcare / HIS",
      title: "Hospital HIS Clinical Summary & ICD-10 Coding Assistant",
      whyLocal: "Keeps sensitive patient OPD/IPD chart histories, bilingual physician notes, and lab timelines on hospital premises under PDPA Section 26.",
    },
    th: {
      sectorTag: "โรงพยาบาลและการแพทย์",
      title: "ผู้ช่วยสรุปเวชระเบียน\u00A0HIS\u00A0และรหัสโรค\u00A0ICD-10\u00A0ในโรงพยาบาล",
      whyLocal: "ประมวลผลประวัติการรักษา\u00A0ผลแล็บ\u00A0และใบสรุปจำหน่ายผู้ป่วยภายในโรงพยาบาลตามมาตรฐานข้อมูลอ่อนไหว\u00A0PDPA",
    },
  }),
  Object.freeze({
    id: "thai_legal_tor_procurement",
    sector: "legal_procurement",
    recommendedModelId: "kimi-linear-48b-a3b-instruct",
    recommendedGpuId: "rtx_pro_6000_se",
    recommendedTier: "L",
    defaultConnectors: ["doc_cdc", "erp_crm", "sso_mcp"],
    users: 180,
    sessionsPerUserDay: "5",
    workingDaysMo: "22",
    peakConcurrencyFraction: "0.12",
    tokensPerSecondPerStream: "30",
    mix: { chat: "0.10", rag: "0.55", graph_rag: "0.15", agentic: "0.20" },
    rawPromptTokens: 36000,
    rawOutputTokens: 1400,
    rawContextTokens: 98304,
    defaultSystemPromptTokens: 24000,
    defaultTurnPromptTokens: 6000,
    defaultTurnsPerSession: 4,
    defaultKvCacheHitRate: "0.75",
    en: {
      sectorTag: "Legal & TOR Bidding",
      title: "Thai Legal Contract, TOR & BOQ Procurement Review",
      whyLocal: "Compares full 40 to 80 page Thai TOR terms, vendor BOQ tables, and penalty clauses in a single context without leaking bid pricing.",
    },
    th: {
      sectorTag: "กฎหมายและจัดซื้อ\u00A0TOR",
      title: "ระบบตรวจร่างสัญญาภาษาไทย\u00A0เอกสาร\u00A0TOR\u00A0และเทียบใบเสนอราคา",
      whyLocal: "อ่านเอกสาร\u00A0TOR\u00A0ตาราง\u00A0BOQ\u00A0และเงื่อนไขค่าปรับทั้งฉบับในครั้งเดียวโดยไม่เสี่ยงข้อมูลราคาประมูลรั่วไหล",
    },
  }),
  Object.freeze({
    id: "airgap_sec_audit",
    sector: "regulated_sec",
    recommendedModelId: "flint",
    recommendedGpuId: "rtx_pro_6000_se",
    recommendedTier: "L",
    defaultConnectors: ["sql_db", "rest_graphql", "doc_cdc", "sso_mcp"],
    users: 220,
    sessionsPerUserDay: "6",
    workingDaysMo: "22",
    peakConcurrencyFraction: "0.15",
    tokensPerSecondPerStream: "30",
    mix: { chat: "0.10", rag: "0.35", graph_rag: "0.20", agentic: "0.35" },
    rawPromptTokens: 32000,
    rawOutputTokens: 1200,
    rawContextTokens: 98304,
    defaultSystemPromptTokens: 24000,
    defaultTurnPromptTokens: 4500,
    defaultTurnsPerSession: 6,
    defaultKvCacheHitRate: "0.75",
    en: {
      sectorTag: "Air-Gapped Security",
      title: "Regulated PDPA / BoT Compliance, Code & SIEM Log Audit",
      whyLocal: "Right-sized for 30B-40B sovereign finetunes (Flint 40B-A2.5B) on a single air-gapped server node where repositories and SIEM logs never leave premises.",
    },
    th: {
      sectorTag: "ความมั่นคงปลอดภัย\u00A0Air-Gapped",
      title: "งานกำกับดูแล\u00A0PDPA\u00A0ตรวจสอบซอร์สโค้ดและ\u00A0SIEM\u00A0Log\u00A0(Air-Gapped)",
      whyLocal: "ใช้โมเดลระดับ\u00A030B-40B\u00A0สำหรับงาน\u00A0Sovereign\u00A0Finetune\u00A0(Flint\u00A040B-A2.5B)\u00A0บนเครื่องเซิร์ฟเวอร์เดี่ยวโดยไม่ส่งข้อมูลออกนอกเครือข่าย",
    },
  }),
]);

// Structural Thai capability guidance (architecture & multilingual tokenizer family only; zero invented benchmark scores).
export const THAI_MODEL_PROFILES = Object.freeze({
  "qwen3-5-0-8b": {
    tierId: "compact_edge",
    thaiSupport: "strong_multilingual_tokenizer",
    enTier: "Tier 1: Ultra-Light Classifier & Guardrail Router (0.87B)",
    thTier: "ระดับ\u00A01: โมเดลขนาดเล็กพิเศษสำหรับคัดแยกหมวดหมู่และกรองคำถาม\u00A0(0.87B)",
    enNote: "Sub-1B multilingual model for high-concurrency intent classification and PII pre-filtering.",
    thNote: "ใช้หน่วยความจำต่ำมาก เหมาะสำหรับคัดกรองคำถามเบื้องต้นและตรวจจับข้อมูลส่วนบุคคลความเร็วสูง",
  },
  "raon-1-nano": {
    tierId: "compact_edge",
    thaiSupport: "verify_tokenizer",
    enTier: "Tier 1: Compact Edge Assistant (3.53B)",
    thTier: "ระดับ\u00A01: โมเดลขนาดกะทัดรัดสำหรับงานเฉพาะจุด\u00A0(3.53B)",
    enNote: "Compact 3.5B footprint; verify Thai script tokenization and domain terminology before production use.",
    thNote: "ขนาด\u00A03.5B\u00A0ประหยัด\u00A0VRAM\u00A0ควรทดสอบคลังคำภาษาไทยกับเอกสารจริงก่อนใช้งานหลัก",
  },
  "qwen3-5-4b": {
    tierId: "compact_edge",
    thaiSupport: "strong_multilingual_tokenizer",
    enTier: "Tier 1: Compact Thai Classification & Triage",
    thTier: "ระดับ\u00A01: งานคัดแยกหมวดหมู่และสรุปข้อความสั้นภาษาไทย",
    enNote: "Dense 4B multilingual vocabulary; suited for fast routing, PII masking, and short Thai FAQ.",
    thNote: "โมเดล\u00A04B\u00A0คลังคำหลายภาษา เหมาะกับงานคัดกรองคำถาม\u00A0ปิดบังข้อมูลส่วนบุคคล\u00A0และตอบคำถามสั้น",
  },
  "qwen3-5-9b": {
    tierId: "compact_edge",
    thaiSupport: "strong_multilingual_tokenizer",
    enTier: "Tier 1: Departmental Thai Chat & Standard RAG",
    thTier: "ระดับ\u00A01: แชตภายในแผนกและค้นหาเอกสารภาษาไทยทั่วไป",
    enNote: "9B hybrid attention keeps long-context KV cache small on a single workstation or server GPU.",
    thNote: "สถาปัตยกรรม\u00A09B\u00A0ประหยัด\u00A0KV\u00A0Cache\u00A0เมื่ออ่านเอกสารยาว รันบนการ์ดเดี่ยวได้คุ้มค่า",
  },
  "qwen3-8b": {
    tierId: "compact_edge",
    thaiSupport: "strong_multilingual_tokenizer",
    enTier: "Tier 1: Curated KV Baseline for Thai/EN RAG",
    thTier: "ระดับ\u00A01: โมเดลมาตรฐานสำหรับ\u00A0RAG\u00A0ภาษาไทยและอังกฤษ",
    enNote: "8.2B full GQA model with independently verified KV footprint for predictable single-GPU sizing.",
    thNote: "โมเดล\u00A08.2B\u00A0ที่คำนวณ\u00A0KV\u00A0Cache\u00A0แม่นยำ เหมาะสำหรับเริ่มต้นใช้งานบน\u00A0GPU\u00A01\u00A0ใบ",
  },
  "gemma-4-e4b-it": {
    tierId: "compact_edge",
    thaiSupport: "broad_multilingual_tokenizer",
    enTier: "Tier 1: Sliding-Window Thai Summarization",
    thTier: "ระดับ\u00A01: สรุปเอกสารภาษาไทยด้วย\u00A0Sliding-Window",
    enNote: "8B total / 4.5B active sliding-window design caps KV growth across long Thai documents.",
    thNote: "โครงสร้าง\u00A0Sliding-Window\u00A0ช่วยจำกัดการใช้หน่วยความจำเมื่อป้อนเอกสารภาษาไทยขนาดยาว",
  },
  "qwen3-8-27b": {
    tierId: "enterprise_workhorse",
    thaiSupport: "strong_multilingual_tokenizer",
    enTier: "Tier 2: Production Thai RAG, Fiscal OCR Check & SQL Tooling",
    thTier: "ระดับ\u00A02: งาน\u00A0RAG\u00A0เอกสารธุรกิจไทย\u00A0ตรวจ\u00A0OCR\u00A0และเรียก\u00A0SQL/API",
    enNote: "27B dense capacity improves Thai legal/financial register fidelity and structured JSON/SQL tool calls.",
    thNote: "ขนาด\u00A027B\u00A0เข้าใจบริบทภาษาไทยทางการ\u00A0กฎหมาย\u00A0บัญชี\u00A0และสร้างคำสั่ง\u00A0JSON/SQL\u00A0ได้แม่นยำ",
  },
  "gemma-4-31b": {
    tierId: "enterprise_workhorse",
    thaiSupport: "broad_multilingual_tokenizer",
    enTier: "Tier 2: Long-Context Bilingual Document Analysis",
    thTier: "ระดับ\u00A02: วิเคราะห์เอกสารสองภาษาความยาวสูง",
    enNote: "30.7B hybrid sliding+full attention balances bilingual synthesis with bounded KV memory.",
    thNote: "ขนาด\u00A030.7B\u00A0ผสาน\u00A0Sliding+Full\u00A0Attention\u00A0รองรับการอ่านเอกสารไทย-อังกฤษหลายหน้าพร้อมกัน",
  },
  "qwen3-6-35b-a3b": {
    tierId: "enterprise_workhorse",
    thaiSupport: "strong_multilingual_tokenizer",
    enTier: "Tier 2: High-Throughput MoE for Thai ERP & API Agents",
    thTier: "ระดับ\u00A02: โมเดล\u00A0MoE\u00A0ความเร็วสูงสำหรับเชื่อม\u00A0ERP\u00A0และ\u00A0API",
    enNote: "35B total / 3B active MoE delivers fast interactive token/s while retaining 35B Thai/EN knowledge.",
    thNote: "สถาปัตยกรรม\u00A0MoE\u00A0(35B/3B\u00A0Active)\u00A0ให้ความเร็วตอบสนองสูงสำหรับผู้ใช้พร้อมกันจำนวนมาก",
  },
  "qwen3-next-80b-a3b": {
    tierId: "frontier_reasoning",
    thaiSupport: "strong_multilingual_tokenizer",
    enTier: "Tier 3: Enterprise Multi-Step Thai Audit & Agentic Synthesis",
    thTier: "ระดับ\u00A03: งานวิเคราะห์หลายขั้นตอนและตรวจสอบการกำกับดูแล",
    enNote: "80B total / 3B active GDN+GQA MoE handles complex multi-connector synthesis on multi-GPU nodes.",
    thNote: "โมเดล\u00A080B\u00A0MoE\u00A0รองรับการให้เหตุผลซับซ้อนข้ามหลายฐานข้อมูลบนคลัสเตอร์หลาย\u00A0GPU",
  },
  "granite-4-2-8b": {
    tierId: "compact_edge",
    thaiSupport: "verify_tokenizer",
    enTier: "Tier 1: Hybrid Attention Enterprise Assistant (8.79B)",
    thTier: "ระดับ\u00A01: โมเดล\u00A0Hybrid\u00A0สำหรับงานเอกสารและระบบภายใน\u00A0(8.79B)",
    enNote: "8.8B hybrid stack keeps KV growth compact; verify Thai domain phrasing on enterprise documents.",
    thNote: "โครงสร้าง\u00A0Hybrid\u00A0ช่วยประหยัด\u00A0KV\u00A0Cache\u00A0โปรดทดสอบสำนวนภาษาไทยกับงานจริงก่อนใช้งาน",
  },
  "maxwell-v1-flash": {
    tierId: "enterprise_workhorse",
    thaiSupport: "verify_tokenizer",
    enTier: "Tier 2: High-Speed Sparse MoE Assistant (36.8B / 3B Active)",
    thTier: "ระดับ\u00A02: โมเดล\u00A0MoE\u00A0ตอบสนองไวสำหรับผู้ใช้พร้อมกันสูง\u00A0(36.8B)",
    enNote: "36.8B MoE reads ~3B active parameters per step for fast decode; verify Thai vocabulary coverage.",
    thNote: "สถาปัตยกรรม\u00A0MoE\u00A0อ่านพารามิเตอร์เพียงบางส่วนต่อก้าว โปรดตรวจสอบคลังคำภาษาไทยก่อนใช้งานหลัก",
  },
  "deepseek-v3": {
    tierId: "frontier_reasoning",
    thaiSupport: "broad_multilingual_tokenizer",
    enTier: "Tier 3: Multi-Node Sovereign Reasoning Factory (671B MLA)",
    thTier: "ระดับ\u00A03: โมเดลขนาดใหญ่พิเศษระดับดาต้าเซ็นเตอร์\u00A0(671B\u00A0MLA)",
    enNote: "Requires multi-GPU high-bandwidth fabric; suited only for XL data-center deployments.",
    thNote: "ต้องการคลัสเตอร์ความเร็วสูงหลายโหนด เหมาะสำหรับโครงการระดับ\u00A0XL\u00A0เท่านั้น",
  },
  "glm-5-3": {
    tierId: "frontier_reasoning",
    thaiSupport: "broad_multilingual_tokenizer",
    enTier: "Tier 3: Frontier MoE Data-Center Pool (753B)",
    thTier: "ระดับ\u00A03: โมเดลระดับศูนย์ข้อมูลขนาดใหญ่พิเศษ\u00A0(753B\u00A0MoE)",
    enNote: "753B frontier MoE requiring multi-GPU high-memory HGX/DGX nodes.",
    thNote: "โมเดล\u00A0753B\u00A0สำหรับคลัสเตอร์\u00A0HGX/DGX\u00A0หน่วยความจำสูงระดับศูนย์ข้อมูล",
  },
  "gemma-4-12b-it": {
    tierId: "compact_edge",
    thaiSupport: "broad_multilingual_tokenizer",
    enTier: "Tier 1: Single-GPU Multimodal & Bilingual RAG (12B)",
    thTier: "ระดับ\u00A01: โมเดล\u00A012B\u00A0ประหยัดหน่วยความจำสำหรับการ์ดเดี่ยว",
    enNote: "40 sliding + 8 unified-K=V global layers hold long Thai/EN documents comfortably on one GPU.",
    thNote: "ผสาน\u00A0Sliding-Window\u00A0และ\u00A0Unified\u00A0K=V\u00A0ประหยัด\u00A0KV\u00A0Cache\u00A0บน\u00A0GPU\u00A01\u00A0ใบ",
  },
  "gpt-oss-20b": {
    tierId: "enterprise_workhorse",
    thaiSupport: "verify_tokenizer",
    enTier: "Tier 2: High-Speed 21B-A4B Sparse MoE Assistant",
    thTier: "ระดับ\u00A02: โมเดล\u00A021B\u00A0MoE\u00A0ความเร็วสูงสำหรับการ์ดเดี่ยว",
    enNote: "20.9B total / 4.2B active hybrid sliding+full MoE; verify Thai phrasing on domain prompts.",
    thNote: "โมเดล\u00A0MoE\u00A0อ่านพารามิเตอร์เพียง\u00A04.2B\u00A0ต่อโทเคน\u00A0ควรทดสอบสำนวนภาษาไทยเฉพาะทาง",
  },
  "gemma-4-26b-a4b-it": {
    tierId: "enterprise_workhorse",
    thaiSupport: "broad_multilingual_tokenizer",
    enTier: "Tier 2: Sovereign 26B-A4B MoE with Unified K=V Cache",
    thTier: "ระดับ\u00A02: โมเดล\u00A026B-A4B\u00A0MoE\u00A0พร้อม\u00A0Unified\u00A0K=V\u00A0Cache",
    enNote: "25.8B total / 4B active MoE with 5:1 sliding-to-global unified K=V attention for fast single-GPU serving.",
    thNote: "ขนาด\u00A025.8B\u00A0(4B\u00A0Active)\u00A0ให้ความเร็วตอบสนองสูงและประหยัด\u00A0KV\u00A0Cache\u00A0บนการ์ดเดี่ยว",
  },
  "qwen3-coder-30b-a3b-instruct": {
    tierId: "enterprise_workhorse",
    thaiSupport: "strong_multilingual_tokenizer",
    enTier: "Tier 2: Sovereign Code, SQL & Security Patch MoE (30B-A3B)",
    thTier: "ระดับ\u00A02: โมเดล\u00A030B-A3B\u00A0สำหรับตรวจสอบโค้ด\u00A0SQL\u00A0และ\u00A0Agent",
    enNote: "30.5B total / 3B active coding & tool-use MoE ideal for internal repo and SQL automation.",
    thNote: "ขนาด\u00A030.5B\u00A0(3B\u00A0Active)\u00A0เหมาะสำหรับตรวจซอร์สโค้ด\u00A0สร้างคำสั่ง\u00A0SQL\u00A0และงาน\u00A0Agent\u00A0ภายใน",
  },
  "gemma-4-31b-it": {
    tierId: "enterprise_workhorse",
    thaiSupport: "broad_multilingual_tokenizer",
    enTier: "Tier 2: 31B Dense Sovereign Base with Unified K=V",
    thTier: "ระดับ\u00A02: โมเดล\u00A031B\u00A0Dense\u00A0สำหรับ\u00A0Finetune\u00A0และวิเคราะห์เอกสารยาว",
    enNote: "31.3B dense checkpoint with 50 sliding + 10 unified-K=V layers; strong 30B-class finetune base.",
    thNote: "โมเดล\u00A031.3B\u00A0Dense\u00A0ยอดนิยมสำหรับการทำ\u00A0Domain\u00A0Finetune\u00A0และสรุปเอกสารยาวสองภาษา",
  },
  "qwen3-32b": {
    tierId: "enterprise_workhorse",
    thaiSupport: "strong_multilingual_tokenizer",
    enTier: "Tier 2: 32B Dense Sovereign Finetune Standard",
    thTier: "ระดับ\u00A02: โมเดล\u00A032B\u00A0Dense\u00A0มาตรฐานสำหรับ\u00A0Sovereign\u00A0Finetune",
    enNote: "32.8B dense full-GQA backbone widely used for regulated Thai/EN LoRA and full finetunes.",
    thNote: "โมเดล\u00A032.8B\u00A0Dense\u00A0มาตรฐานหลักสำหรับฝึกสอนเฉพาะทาง\u00A0(LoRA/Finetune)\u00A0ในองค์กรกำกับดูแล",
  },
  "flint": {
    tierId: "enterprise_workhorse",
    thaiSupport: "broad_multilingual_tokenizer",
    enTier: "Tier 2: Sovereign 40B-A2.8B Hybrid MoE (Air-Gapped Recommended)",
    thTier: "ระดับ\u00A02: โมเดล\u00A0Flint\u00A040B-A2.8B\u00A0MoE\u00A0(แนะนำสำหรับ\u00A0Air-Gapped)",
    enNote: "39.8B total / 2.8B active hybrid (35 sliding + 14 full) fits one 96 GB GPU at FP8 with fast multi-turn agent throughput.",
    thNote: "ขนาด\u00A039.8B\u00A0แต่อ่านเพียง\u00A02.8B\u00A0ต่อโทเคน\u00A0รันบน\u00A0GPU\u00A096GB\u00A0ใบเดียวได้พร้อมรองรับ\u00A0Agent\u00A0หลายรอบ",
  },
  "kimi-linear-48b-a3b-instruct": {
    tierId: "frontier_reasoning",
    thaiSupport: "broad_multilingual_tokenizer",
    enTier: "Tier 3: 50B-Class KDA Linear + MLA Hybrid MoE (49B-A3B, 1M Ctx)",
    thTier: "ระดับ\u00A03: โมเดลกลุ่ม\u00A050B\u00A0(Kimi-Linear\u00A049B-A3B)\u00A0รองรับ\u00A01M\u00A0Context",
    enNote: "49.1B total / 3B active with 20 KDA linear + 7 MLA layers keeps 1M-context KV tiny on a single 96 GB GPU at FP8.",
    thNote: "ผสาน\u00A020\u00A0Linear\u00A0+\u00A07\u00A0MLA\u00A0ทำให้\u00A0KV\u00A0Cache\u00A0เล็กมากแม้ป้อนเอกสารหลายแสนโทเคน",
  },
  "llama-3-3-nemotron-super-49b-v1-5": {
    tierId: "frontier_reasoning",
    thaiSupport: "broad_multilingual_tokenizer",
    enTier: "Tier 3: 50B-Class Dense NAS Reasoning Model (49.9B)",
    thTier: "ระดับ\u00A03: โมเดลกลุ่ม\u00A050B\u00A0Dense\u00A0NAS\u00A0สำหรับงานวิเคราะห์เข้มข้น\u00A0(49.9B)",
    enNote: "49.9B NAS-optimized dense checkpoint fitting a single 96 GB GPU at FP8 for high-accuracy enterprise reasoning.",
    thNote: "โมเดล\u00A049.9B\u00A0Dense\u00A0ปรับแต่งด้วย\u00A0NAS\u00A0ให้รันบน\u00A0GPU\u00A096GB\u00A0ที่\u00A0FP8\u00A0ได้ในเครื่องเดียว",
  },
  "gpt-oss-120b": {
    tierId: "frontier_reasoning",
    thaiSupport: "verify_tokenizer",
    enTier: "Tier 3: 117B-A5.7B Hybrid Reasoning MoE",
    thTier: "ระดับ\u00A03: โมเดล\u00A0117B-A5.7B\u00A0MoE\u00A0สำหรับงานให้เหตุผลหลายขั้นตอน",
    enNote: "116.8B total / 5.7B active MoE with 18 sliding + 18 full layers; verify Thai domain terminology.",
    thNote: "ขนาด\u00A0116.8B\u00A0(5.7B\u00A0Active)\u00A0สำหรับคลัสเตอร์\u00A02\u00A0GPU\u00A0ขึ้นไป\u00A0โปรดตรวจสอบคลังคำภาษาไทย",
  },
  "qwen3-8-flash-next": {
    tierId: "frontier_reasoning",
    thaiSupport: "strong_multilingual_tokenizer",
    enTier: "Tier 3: Qwen 3.8 Flash-Next 180B-A5.6B Hybrid MoE",
    thTier: "ระดับ\u00A03: โมเดล\u00A0Qwen3.8-Flash-Next\u00A0180B-A5.6B\u00A0ความเร็วสูง",
    enNote: "180B checkpoint (129B GPU backbone + 51B PLE n-gram table, 5.6B active) with 36 linear + 12 full QSA layers.",
    thNote: "สถาปัตยกรรม\u00A0Qwen\u00A03.8\u00A0รุ่นใหม่\u00A0(36\u00A0Linear\u00A0+\u00A012\u00A0Full)\u00A0อ่านเพียง\u00A05.6B\u00A0ต่อโทเคน",
  },
  "glm-5-3-flash": {
    tierId: "frontier_reasoning",
    thaiSupport: "broad_multilingual_tokenizer",
    enTier: "Tier 3: GLM 5.3 Flash 321B-A16.7B Linear + MLA MoE (1M Ctx)",
    thTier: "ระดับ\u00A03: โมเดล\u00A0GLM-5.3-Flash\u00A0321B-A16.7B\u00A0รองรับ\u00A01M\u00A0Context",
    enNote: "321B total / 16.7B active with 34 linear + 11 MLA layers (only 11.3 KB/tok BF16 KV) for megatoken multi-GPU pools.",
    thNote: "ผสาน\u00A034\u00A0Linear\u00A0+\u00A011\u00A0MLA\u00A0ใช้\u00A0KV\u00A0เพียง\u00A011.3\u00A0KB/โทเคน\u00A0เหมาะสำหรับพูลหลาย\u00A0GPU",
  },
  "deepseek-v4-1-flash-1017": {
    tierId: "frontier_reasoning",
    thaiSupport: "broad_multilingual_tokenizer",
    enTier: "Tier 3: DeepSeek V4.1 Flash CSA2 Compressed-MLA Pool (1M Ctx)",
    thTier: "ระดับ\u00A03: โมเดล\u00A0DeepSeek-V4.1-Flash\u00A0บีบอัด\u00A0CSA2\u00A0KV\u00A0ระดับดาต้าเซ็นเตอร์",
    enNote: "763B checkpoint (567B GPU backbone + 197B Engram lookup, 14.9B active) with 890 B/tok FP4 global CSA2 KV cache.",
    thNote: "เทคโนโลยี\u00A0CSA2\u00A0บีบอัด\u00A0Global\u00A0KV\u00A0เหลือเพียง\u00A0890\u00A0ไบต์/โทเคน\u00A0(FP4)\u00A0สำหรับคลัสเตอร์ระดับศูนย์ข้อมูล",
  },
});

export function recommendDealTier({ users = 250, connectors = [], gpusRequired = 1 }) {
  const nConn = Array.isArray(connectors) ? connectors.length : 0;
  if (users > 1500 || nConn >= 5 || gpusRequired >= 8) return "XL";
  if (users > 500 || nConn >= 3 || gpusRequired >= 4) return "L";
  if (users > 150 || nConn >= 2 || gpusRequired >= 2) return "M";
  return "S";
}

function isPlainObject(val) {
  if (!val || typeof val !== "object" || Array.isArray(val) || Object.prototype.toString.call(val) !== "[object Object]") {
    return false;
  }
  const proto = Object.getPrototypeOf(val);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

function cleanMoneyEntry(entry, fieldName, defaultCurrency = "THB") {
  if (entry === null || entry === undefined || entry === "") {
    return { amount: "0", currency: defaultCurrency };
  }
  let rawAmount;
  let rawCurrency = defaultCurrency;
  if (typeof entry === "object") {
    if (!isPlainObject(entry)) {
      throw new SizerValidationError("bad_money", `${fieldName} must be a plain money object or decimal amount`);
    }
    for (const k of Object.keys(entry)) {
      if (k !== "amount" && k !== "currency") {
        throw new SizerValidationError("unknown_money_key", `${fieldName}: unexpected key "${k}"`);
      }
    }
    if (entry.amount !== undefined && entry.amount !== null && typeof entry.amount !== "string" && typeof entry.amount !== "number") {
      throw new SizerValidationError("bad_money", `${fieldName}.amount must be a string or number`);
    }
    if (entry.currency !== undefined && typeof entry.currency !== "string") {
      throw new SizerValidationError("bad_currency", `${fieldName}.currency must be a string`);
    }
    rawAmount = entry.amount ?? "0";
    rawCurrency = entry.currency ?? defaultCurrency;
  } else if (typeof entry === "string" || typeof entry === "number") {
    rawAmount = entry;
  } else {
    throw new SizerValidationError("bad_money", `${fieldName} must be a string, number, or money object`);
  }
  const currency = String(rawCurrency).toUpperCase();
  if (!CURRENCIES.has(currency)) {
    throw new SizerValidationError("bad_currency", `${fieldName}: unsupported currency "${currency}"`);
  }
  const raw = String(rawAmount).trim().replace(/[,_ ]/g, "");
  if (raw === "") return { amount: "0", currency };
  let dec;
  try {
    dec = Dec.from(raw);
  } catch {
    throw new SizerValidationError("bad_money", `${fieldName}: "${rawAmount}" is not a valid decimal amount`);
  }
  if (dec.sign() < 0) {
    throw new SizerValidationError("negative_money", `${fieldName} cannot be negative`);
  }
  return { amount: dec.toString(), currency };
}

export function moneyToUsdExact(entry, fx) {
  const clean = cleanMoneyEntry(entry, "money");
  const r = toRat(clean.amount);
  if (r.isZero()) return "0";
  return clean.currency === "USD" ? ratStr(r) : ratStr(toUSD(r, fx));
}

export function moneyToThbExact(entry, fx) {
  const clean = cleanMoneyEntry(entry, "money");
  const r = toRat(clean.amount);
  if (r.isZero()) return "0";
  return clean.currency === "THB" ? ratStr(r) : ratStr(toTHB(r, fx));
}

export function formatMoneyDisplay(usdExactStr, displayCurrency, fx, places = 0) {
  if (usdExactStr === null || usdExactStr === undefined) return "\u2014";
  const usdRat = toRat(usdExactStr);
  if (displayCurrency === "USD") {
    return `$${formatHalfUp(usdRat, places)}`;
  }
  return `\u0E3F${formatHalfUp(toTHB(usdRat, fx), places)}`;
}

function posInt(val, fieldName, { min = 1, max = 10000000, allowNull = false } = {}) {
  if (allowNull && (val === null || val === undefined || val === "")) return null;
  if (typeof val !== "number" && typeof val !== "string") {
    throw new SizerValidationError("bad_integer", `${fieldName} must be a whole number`);
  }
  if (typeof val === "number" && (!Number.isInteger(val) || !Number.isSafeInteger(val))) {
    throw new SizerValidationError("bad_integer", `${fieldName} must be a whole number`);
  }
  const s = String(val).trim().replace(/[,_ ]/g, "");
  if (!/^\d+$/.test(s)) {
    throw new SizerValidationError("bad_integer", `${fieldName} must be a whole number`);
  }
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new SizerValidationError("out_of_range", `${fieldName} must be between ${min} and ${max}`);
  }
  return n;
}

function decStr(val, fieldName, { min = "0", max = "1000000", allowZero = true } = {}) {
  if (typeof val !== "number" && typeof val !== "string") {
    throw new SizerValidationError("bad_decimal", `${fieldName} must be a valid decimal number`);
  }
  if (typeof val === "number" && !Number.isFinite(val)) {
    throw new SizerValidationError("bad_decimal", `${fieldName} must be a valid decimal number`);
  }
  const s = String(val).trim().replace(/[,_ ]/g, "");
  let d;
  try {
    d = Dec.from(s);
  } catch {
    throw new SizerValidationError("bad_decimal", `${fieldName} must be a valid decimal number`);
  }
  const minD = Dec.from(min);
  const maxD = Dec.from(max);
  if ((!allowZero && d.sign() === 0) || d.lt(minD) || d.gt(maxD)) {
    throw new SizerValidationError("out_of_range", `${fieldName} must be between ${min} and ${max}`);
  }
  return d.toString();
}

const VENDOR_PRIORITY = Object.freeze([
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "qwen",
  "meta-llama",
  "mistralai",
  "x-ai",
  "cohere",
]);

export const API_VENDOR_LABELS = Object.freeze({
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
  google: "Google Gemini",
  deepseek: "DeepSeek",
  qwen: "Qwen (Alibaba)",
  "meta-llama": "Meta Llama",
  mistralai: "Mistral AI",
  "x-ai": "xAI Grok",
  cohere: "Cohere",
  amazon: "Amazon Bedrock / Nova",
  microsoft: "Microsoft / Azure",
});

function normalizeApiVendor(feed, seller, product) {
  const prod = String(product ?? "").trim().toLowerCase();
  const sel = String(seller ?? "").trim().toLowerCase();
  const prefix = prod.includes("/") ? prod.split("/")[0] : "";
  const token = feed === "openrouter" ? (prefix || sel) : (prefix || sel);
  if (token === "openai" || /^gpt-|^o[134]-|^chatgpt-/.test(prod)) return "openai";
  if (token === "anthropic" || prod.includes("claude")) return "anthropic";
  if (token === "google" || token.startsWith("vertex_ai") || token === "gemini" || prod.includes("gemini")) return "google";
  if (token === "deepseek" || prod.includes("deepseek")) return "deepseek";
  if (token === "qwen" || token === "dashscope" || prod.includes("qwen")) return "qwen";
  if (token === "meta-llama" || token === "meta" || prod.includes("llama")) return "meta-llama";
  if (token === "mistralai" || token === "mistral" || prod.includes("mistral")) return "mistralai";
  if (token === "x-ai" || token === "xai" || prod.includes("grok")) return "x-ai";
  if (token === "cohere" || prod.includes("command-r")) return "cohere";
  if (token === "amazon" || token === "bedrock" || prod.includes("nova")) return "amazon";
  if (token === "microsoft" || token === "azure") return "microsoft";
  return token || "other";
}

function perMillionUsdText(perTokenStr) {
  if (perTokenStr === null || perTokenStr === undefined || perTokenStr === "") return null;
  try {
    const r = toRat(String(perTokenStr)).mul(Rat.from(1000000n));
    return trimDecimalZeros(formatHalfUp(r, 4));
  } catch {
    return null;
  }
}

export function classifyApiOffer(offerId, offer, modelMeta = null) {
  const id = String(offerId ?? "");
  const feed = String(offer?.seller_source || id.split(":")[0] || "other").toLowerCase();
  const product = String(offer?.product || id.replace(/^[^:]+:/, ""));
  const seller = String(offer?.seller || feed);
  const vendor = normalizeApiVendor(feed, seller, product);
  const displayName = String(offer?.display_name || modelMeta?.name || product || id);
  const prices = offer?.prices ?? {};
  const baseIn = prices["input|std"] ?? prices.input ?? null;
  const baseOut = prices["output|std"] ?? prices.output ?? null;
  const inputPer1MUsd = perMillionUsdText(baseIn);
  const outputPer1MUsd = perMillionUsdText(baseOut);
  const isBatch = /:batch$/i.test(id) || /:batch$/i.test(product);
  const isFree = /:free$/i.test(id) || /:free$/i.test(product);
  const nonChatMode = new Set([
    "embedding",
    "image_generation",
    "audio_transcription",
    "audio_speech",
    "moderation",
    "rerank",
  ]).has(String(offer?.ingest_mode ?? "").toLowerCase());
  const retired = ["retired", "quarantined"].includes(String(modelMeta?.state ?? ""));
  const tokenEligible = Boolean(offer && !retired && !nonChatMode && inputPer1MUsd !== null && outputPer1MUsd !== null);
  const hasConditionalRates = Object.keys(prices).some((k) => (
    k !== "input"
    && k !== "output"
    && k !== "input|std"
    && k !== "output|std"
    && !k.startsWith("cache_read|std")
    && !k.startsWith("cache_write|std")
    && k !== "cache_read"
    && k !== "cache_write"
  ));
  return {
    id,
    feed,
    seller,
    vendor,
    vendorLabel: API_VENDOR_LABELS[vendor] ?? vendor,
    product,
    displayName,
    inputPer1MUsd,
    outputPer1MUsd,
    isBatch,
    isFree,
    tokenEligible,
    hasConditionalRates,
    missingFromCatalog: !offer,
    outsideFilter: false,
  };
}

function rankApiOfferInfo(a, b) {
  if (a.isFree !== b.isFree) return a.isFree ? 1 : -1;
  if (a.isBatch !== b.isBatch) return a.isBatch ? 1 : -1;
  if (a.feed !== b.feed) {
    if (a.feed === "openrouter") return -1;
    if (b.feed === "openrouter") return 1;
  }
  const va = VENDOR_PRIORITY.indexOf(a.vendor);
  const vb = VENDOR_PRIORITY.indexOf(b.vendor);
  const pa = va === -1 ? 999 : va;
  const pb = vb === -1 ? 999 : vb;
  if (pa !== pb) return pa - pb;
  return a.displayName.localeCompare(b.displayName, "en");
}

export function filterApiOffers({
  catalog,
  manifest,
  feed = "all",
  vendor = "all",
  search = "",
  selectedOfferId = "",
  limit = 120,
} = {}) {
  const offers = catalog?.offers ?? {};
  const modelMap = new Map((manifest?.models ?? []).map((m) => [m.id, m]));
  const candidateIds = modelMap.size > 0 ? [...modelMap.keys()] : Object.keys(offers);
  const eligible = [];
  const feedSet = new Set();
  const vendorCounts = new Map();

  for (const id of candidateIds) {
    const offer = offers[id];
    if (!offer) continue;
    const info = classifyApiOffer(id, offer, modelMap.get(id) ?? null);
    if (!info.tokenEligible) continue;
    eligible.push(info);
    feedSet.add(info.feed);
    vendorCounts.set(info.vendor, (vendorCounts.get(info.vendor) ?? 0) + 1);
  }

  eligible.sort(rankApiOfferInfo);

  const normFeed = String(feed || "all").toLowerCase();
  const normVendor = String(vendor || "all").toLowerCase();
  const q = String(search ?? "").trim().toLowerCase();

  const matching = eligible.filter((info) => {
    if (normFeed !== "all" && info.feed !== normFeed) return false;
    if (normVendor !== "all" && info.vendor !== normVendor) return false;
    if (q) {
      const hay = `${info.id} ${info.displayName} ${info.product} ${info.vendor} ${info.vendorLabel}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sliced = matching.slice(0, Math.max(1, limit));
  const sel = String(selectedOfferId ?? "").trim();
  let unresolvedSelectedId = null;

  if (sel) {
    const alreadyInSlice = sliced.some((x) => x.id === sel);
    if (!alreadyInSlice) {
      const existingOffer = offers[sel];
      if (!existingOffer) {
        unresolvedSelectedId = sel;
        sliced.unshift({
          ...classifyApiOffer(sel, null, null),
          outsideFilter: true,
          missingFromCatalog: true,
        });
      } else {
        const selInfo = classifyApiOffer(sel, existingOffer, modelMap.get(sel) ?? null);
        const matchedAll = matching.some((x) => x.id === sel);
        sliced.unshift({
          ...selInfo,
          outsideFilter: !matchedAll,
          missingFromCatalog: false,
        });
      }
    }
  }

  const feeds = ["openrouter", "litellm", ...[...feedSet].filter((f) => f !== "openrouter" && f !== "litellm").sort()]
    .filter((f) => feedSet.has(f));
  const vendors = [...vendorCounts.keys()].sort((a, b) => {
    const ia = VENDOR_PRIORITY.indexOf(a);
    const ib = VENDOR_PRIORITY.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.localeCompare(b, "en");
  }).map((v) => ({
    id: v,
    label: API_VENDOR_LABELS[v] ?? v,
    count: vendorCounts.get(v) ?? 0,
  }));

  return {
    offers: sliced,
    totalEligible: eligible.length,
    totalMatching: matching.length,
    feeds,
    vendors,
    unresolvedSelectedId,
  };
}

export function pickComparableApiOffer(catalog, manifest, preferredOfferId = null) {
  const offers = catalog?.offers ?? {};
  const pref = typeof preferredOfferId === "string" ? preferredOfferId.trim() : "";
  if (pref) {
    return offers[pref] ? pref : "";
  }
  const models = manifest?.models ?? [];
  const activeIds = models
    .filter((m) => !["retired", "quarantined"].includes(m.state) && offers[m.id])
    .map((m) => m.id);
  const pool = activeIds.length ? activeIds : Object.keys(offers);
  const nonBatchTokenPool = pool.filter((id) => {
    const info = classifyApiOffer(id, offers[id], null);
    return info.tokenEligible && !info.isBatch && !info.isFree;
  });
  const searchPool = nonBatchTokenPool.length ? nonBatchTokenPool : pool;
  return (
    searchPool.find((id) => id === "openrouter:openai/gpt-4o" || id === "litellm:gpt-4o")
    ?? searchPool.find((id) => /^openrouter:openai\/gpt-4o(?!-mini)(?!.*:batch)/.test(id))
    ?? searchPool.find((id) => /^openrouter:anthropic\/claude-sonnet-4(?!.*:batch)/.test(id))
    ?? searchPool.find((id) => /^openrouter:google\/gemini-2\.5-(?:pro|flash)(?!.*:batch)/.test(id))
    ?? searchPool.find((id) => /^openrouter:deepseek\/deepseek-(?:chat|v3)(?!.*:batch)/.test(id))
    ?? searchPool[0]
    ?? ""
  );
}

export function groupCatalogModels(servingData) {
  const all = Array.isArray(servingData?.models) ? servingData.models : [];
  const real = all
    .filter((m) => m && m.id && m.id !== "custom")
    .slice()
    .sort((a, b) => Number(a.params_b) - Number(b.params_b));
  const groups = [
    {
      id: "compact",
      enLabel: "Compact & Single-GPU Edge (<= 14B)",
      thLabel: "ขนาดกะทัดรัดสำหรับการ์ดเดี่ยว\u00A0(<= 14B)",
      models: real.filter((m) => Number(m.params_b) <= 14),
    },
    {
      id: "sovereign_finetune",
      enLabel: "20B-40B Sovereign & Finetune (Flint, Qwen3.8, Gemma-4)",
      thLabel: "กลุ่ม\u00A020B-40B\u00A0Sovereign & Finetune\u00A0(Flint, Qwen3.8, Gemma-4)",
      models: real.filter((m) => Number(m.params_b) > 14 && Number(m.params_b) <= 42),
    },
    {
      id: "fifty_b_mid",
      enLabel: "45B-120B 50B-Class & Mid-Frontier (Kimi-Linear, Nemotron-49B)",
      thLabel: "กลุ่ม\u00A045B-120B\u00A0และ\u00A050B-Class\u00A0(Kimi-Linear, Nemotron-49B)",
      models: real.filter((m) => Number(m.params_b) > 42 && Number(m.params_b) <= 130),
    },
    {
      id: "frontier_flash",
      enLabel: "150B+ Frontier Flash MoE (Qwen3.8-Next, GLM-5.3, DeepSeek-V4.1)",
      thLabel: "กลุ่ม\u00A0150B+\u00A0Frontier\u00A0Flash\u00A0MoE\u00A0(Qwen3.8-Next, GLM-5.3, DeepSeek-V4.1)",
      models: real.filter((m) => Number(m.params_b) > 130),
    },
  ].filter((g) => g.models.length > 0);
  const customModel = all.find((m) => m?.id === "custom") ?? null;
  return { groups, realModels: real, customModel };
}

export function buildSessionProjectionFromConfig({
  effectiveSystemPromptTokens = 0,
  effectivePromptTokens,
  effectiveOutputTokens,
  turnsPerSession,
  kvCacheHitRate = "0",
  users,
  sessionsPerUserDay,
  workingDaysMo,
}) {
  const S = BigInt(Math.max(0, Math.trunc(Number(effectiveSystemPromptTokens))));
  const U = BigInt(Math.max(1, Math.trunc(Number(effectivePromptTokens))));
  const O = BigInt(Math.max(1, Math.trunc(Number(effectiveOutputTokens))));
  const T = Math.max(1, Math.trunc(Number(turnsPerSession)));
  const hitRat = toRat(String(kvCacheHitRate));
  const missRat = Rat.from(1n).sub(hitRat);

  const usersRat = toRat(String(users));
  const sessionsDayRat = toRat(String(sessionsPerUserDay));
  const daysMoRat = toRat(String(workingDaysMo));
  const sessionsMoRat = usersRat.mul(sessionsDayRat).mul(daysMoRat);
  const turnsMoRat = sessionsMoRat.mul(Rat.from(BigInt(T)));

  const cohorts = [];
  let sumCtxAfterTurnBig = 0n;
  let sessionTokensBig = 0n;
  let sessionUncachedInRat = Rat.from(0n);
  let sessionCachedReadRat = Rat.from(0n);
  const sessionOutBig = BigInt(T) * O;

  for (let t = 1; t <= T; t += 1) {
    const tBig = BigInt(t);
    const promptFullBig = S + tBig * U + (tBig - 1n) * O;
    const ctxAfterTurnBig = promptFullBig + O;
    const carriedBig = t === 1 ? 0n : S + (tBig - 1n) * (U + O);
    sumCtxAfterTurnBig += ctxAfterTurnBig;
    sessionTokensBig += ctxAfterTurnBig;

    if (t === 1) {
      // First turn in a session has zero carried conversation turns and is cold.
      sessionUncachedInRat = sessionUncachedInRat.add(Rat.from(promptFullBig));
      cohorts.push({
        turn: 1,
        cohort: "cold",
        prompt_tokens: Number(promptFullBig),
        output_tokens: Number(O),
        cache_read_tokens: 0,
        threshold_prompt_tokens: Number(promptFullBig),
        allow_cache_fallback_to_input: true,
        occurrences_per_session: "1",
        requests_mo: sessionsMoRat,
      });
    } else {
      sessionUncachedInRat = sessionUncachedInRat.add(
        hitRat.mul(Rat.from(U)).add(missRat.mul(Rat.from(promptFullBig))),
      );
      sessionCachedReadRat = sessionCachedReadRat.add(hitRat.mul(Rat.from(carriedBig)));

      if (!hitRat.isZero()) {
        cohorts.push({
          turn: t,
          cohort: "hit",
          prompt_tokens: Number(U),
          output_tokens: Number(O),
          cache_read_tokens: Number(carriedBig),
          threshold_prompt_tokens: Number(promptFullBig),
          allow_cache_fallback_to_input: true,
          occurrences_per_session: ratStr(hitRat),
          requests_mo: sessionsMoRat.mul(hitRat),
        });
      }
      if (!missRat.isZero()) {
        cohorts.push({
          turn: t,
          cohort: "miss",
          prompt_tokens: Number(promptFullBig),
          output_tokens: Number(O),
          cache_read_tokens: 0,
          threshold_prompt_tokens: Number(promptFullBig),
          allow_cache_fallback_to_input: true,
          occurrences_per_session: ratStr(missRat),
          requests_mo: sessionsMoRat.mul(missRat),
        });
      }
    }
  }

  const peakTurnContextTokens = Number(S + BigInt(T) * (U + O));
  const avgTurnContextTokens = Number((sumCtxAfterTurnBig + BigInt(T) - 1n) / BigInt(T));
  const sharedPrefixTokens = hitRat.isZero() ? 0 : Number((S * hitRat.n) / hitRat.d);

  const tokensMoRat = Rat.from(sessionTokensBig).mul(sessionsMoRat);
  const inTokensMoRat = sessionUncachedInRat.mul(sessionsMoRat);
  const cachedTokensMoRat = sessionCachedReadRat.mul(sessionsMoRat);
  const outTokensMoRat = Rat.from(sessionOutBig).mul(sessionsMoRat);

  const tokensPerPersonDayRat = Rat.from(sessionTokensBig).mul(sessionsDayRat);
  const tokensPerPersonMoRat = tokensPerPersonDayRat.mul(daysMoRat);
  const uncachedInPerPersonDayRat = sessionUncachedInRat.mul(sessionsDayRat);
  const cachedReadPerPersonDayRat = sessionCachedReadRat.mul(sessionsDayRat);
  const outputPerPersonDayRat = Rat.from(sessionOutBig).mul(sessionsDayRat);

  const compatAvgUncachedInPerTurn = Math.round(Number(formatHalfUp(sessionUncachedInRat.div(Rat.from(BigInt(T))), 6)));
  const compatAvgCachedReadPerTurn = Math.round(Number(formatHalfUp(sessionCachedReadRat.div(Rat.from(BigInt(T))), 6)));

  return {
    effectiveSystemPromptTokens: Number(S),
    effectivePromptTokens: Number(U),
    effectiveOutputTokens: Number(O),
    turnsPerSession: T,
    kvCacheHitRate: String(kvCacheHitRate),
    peakTurnContextTokens,
    avgTurnContextTokens,
    sharedPrefixTokens,
    tokensPerSession: Number(sessionTokensBig),
    cohorts,
    sessionsMoRat,
    turnsMoRat,
    tokensMoRat,
    inTokensMoRat,
    cachedTokensMoRat,
    outTokensMoRat,
    compatAvgUncachedInPerTurn,
    compatAvgCachedReadPerTurn,
    personTokenSummary: {
      sessionStackingActive: true,
      tokensPerSession: String(sessionTokensBig),
      tokensPerPersonDay: formatHalfUp(tokensPerPersonDayRat, 0),
      tokensPerPersonMo: formatHalfUp(tokensPerPersonMoRat, 0),
      uncachedInPerPersonDay: formatHalfUp(uncachedInPerPersonDayRat, 0),
      cachedReadPerPersonDay: formatHalfUp(cachedReadPerPersonDayRat, 0),
      outputPerPersonDay: formatHalfUp(outputPerPersonDayRat, 0),
      turn1ColdPromptTokens: Number(S + U),
      finalTurnPromptTokens: Number(S + BigInt(T) * U + BigInt(T - 1) * O),
      peakTurnContextTokens,
      avgTurnContextTokens,
      sharedPrefixTokens,
    },
  };
}

export function estimateModelWeightGb(model, bytesPerParam, { runtimeKey = null, hostTierProfile = null } = {}) {
  if (!model?.params_b || !bytesPerParam) return null;
  try {
    const res = resolveModelResidency({ model, bytesPerParam, runtimeKey, hostTierProfile });
    return formatHalfUp(res.resident.div(Rat.from(1000000000n)), 2);
  } catch {
    return null;
  }
}

function optDecStr(val, fieldName, opts = {}) {
  if (val === null || val === undefined || val === "") return null;
  return decStr(val, fieldName, opts);
}

// Normalizes raw user/preset input ONCE. Toggling UI language or currency never
// re-runs token multiplication over already-multiplied figures.
export function normalizeSizerInput(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SizerValidationError("bad_input", "Sizer input must be an object");
  }
  const workloadPreset = LOCAL_AI_WORKLOADS.find((w) => w.id === raw.workloadId) ?? LOCAL_AI_WORKLOADS[0];
  const tokenBasis = String(raw.tokenBasis ?? "latin_reference_1_4x");
  if (!TOKEN_BASES.has(tokenBasis)) {
    throw new SizerValidationError("bad_token_basis", `Unsupported token basis "${tokenBasis}"`);
  }
  const thaiFertilityMultiplier = decStr(raw.thaiFertilityMultiplier ?? "1.4", "Thai token fertility multiplier", {
    min: "1.0",
    max: "3.0",
    allowZero: false,
  });
  const hasExplicitSessionFields = (
    raw.sessionStackingActive === true
    || (
      raw.sessionStackingActive !== false
      && (
        raw.rawSystemPromptTokens !== undefined
        || raw.turnsPerSession !== undefined
        || raw.kvCacheHitRate !== undefined
      )
    )
  );

  const rawSystemPromptTokens = hasExplicitSessionFields
    ? posInt(raw.rawSystemPromptTokens ?? workloadPreset.defaultSystemPromptTokens ?? 20000, "rawSystemPromptTokens", { min: 0, max: 2000000 })
    : 0;
  const turnsPerSession = hasExplicitSessionFields
    ? posInt(raw.turnsPerSession ?? workloadPreset.defaultTurnsPerSession ?? 5, "turnsPerSession", { min: 1, max: 100 })
    : null;
  const kvCacheHitRate = hasExplicitSessionFields
    ? decStr(raw.kvCacheHitRate ?? workloadPreset.defaultKvCacheHitRate ?? "0.75", "kvCacheHitRate", { min: "0", max: "1" })
    : "0";

  const defaultRawPrompt = hasExplicitSessionFields
    ? (workloadPreset.defaultTurnPromptTokens ?? workloadPreset.rawPromptTokens)
    : workloadPreset.rawPromptTokens;
  const rawPromptTokens = posInt(raw.rawPromptTokens ?? defaultRawPrompt, "rawPromptTokens", { min: 1, max: 2000000 });
  const rawOutputTokens = posInt(raw.rawOutputTokens ?? workloadPreset.rawOutputTokens, "rawOutputTokens", { min: 1, max: 500000 });
  const rawContextTokens = posInt(raw.rawContextTokens ?? workloadPreset.rawContextTokens, "rawContextTokens", { min: 128, max: 10000000 });

  const multRat = tokenBasis === "latin_reference_1_4x" ? toRat(thaiFertilityMultiplier) : Rat.from(1n);
  const ceilMul = (n) => {
    if (n <= 0) return 0;
    const prod = Rat.from(BigInt(n)).mul(multRat);
    const q = prod.n / prod.d;
    const rem = prod.n % prod.d;
    return Number(rem > 0n ? q + 1n : q);
  };

  const effectiveSystemPromptTokens = ceilMul(rawSystemPromptTokens);
  const effectivePromptTokens = ceilMul(rawPromptTokens);
  const effectiveOutputTokens = rawOutputTokens;
  const scaledContext = ceilMul(rawContextTokens);
  const peakSessionTokens = hasExplicitSessionFields
    ? effectiveSystemPromptTokens + turnsPerSession * (effectivePromptTokens + effectiveOutputTokens)
    : effectivePromptTokens + effectiveOutputTokens;
  const effectiveContextTokens = Math.max(scaledContext, peakSessionTokens);

  const users = posInt(raw.users ?? workloadPreset.users, "users", { min: 1, max: 10000000 });
  const sessionsPerUserDay = decStr(raw.sessionsPerUserDay ?? workloadPreset.sessionsPerUserDay, "sessionsPerUserDay", { min: "0.01", max: "100000", allowZero: false });
  const workingDaysMo = posInt(raw.workingDaysMo ?? workloadPreset.workingDaysMo, "workingDaysMo", { min: 1, max: 31 });
  const peakConcurrencyFraction = decStr(raw.peakConcurrencyFraction ?? workloadPreset.peakConcurrencyFraction, "peakConcurrencyFraction", { min: "0.001", max: "1", allowZero: false });
  const tokensPerSecondPerStream = decStr(raw.tokensPerSecondPerStream ?? workloadPreset.tokensPerSecondPerStream, "tokensPerSecondPerStream", { min: "1", max: "10000", allowZero: false });

  const rawMix = raw.mix ?? workloadPreset.mix;
  const mix = {};
  for (const wt of WORKLOAD_TYPES) {
    mix[wt] = decStr(rawMix?.[wt] ?? "0", `mix.${wt}`, { min: "0", max: "1" });
  }
  const mixCheck = validateMix(mix);
  if (!mixCheck.ok) {
    throw new SizerValidationError("bad_mix", `Workload mix must sum to 1 (got ${mixCheck.sum_text})`);
  }

  const deploymentMode = raw.deploymentMode === "brownfield" ? "brownfield" : "greenfield";
  const validConnectorIds = new Set(PIPELINE_CONNECTORS.map((c) => c.id));
  const connectors = Array.isArray(raw.connectors)
    ? [...new Set(raw.connectors.map(String).filter((id) => validConnectorIds.has(id)))]
    : [...workloadPreset.defaultConnectors];

  const modelId = String(raw.modelId ?? workloadPreset.recommendedModelId).trim();
  const customParamsB = optDecStr(raw.customParamsB, "customParamsB", { min: "0.1", max: "10000", allowZero: false });
  const rawActiveParamsB = optDecStr(raw.customActiveParamsB, "customActiveParamsB", { min: "0.1", max: "10000", allowZero: false });
  const customActiveParamsB = rawActiveParamsB ?? customParamsB;
  if (customParamsB !== null && customActiveParamsB !== null && Dec.from(customActiveParamsB).gt(Dec.from(customParamsB))) {
    throw new SizerValidationError("bad_custom_params", `Active parameters (${customActiveParamsB}B) cannot exceed total parameters (${customParamsB}B)`);
  }
  const customKvBytesBf16 = posInt(raw.customKvBytesBf16, "customKvBytesBf16", { min: 2, max: 100000000, allowNull: true });
  const customContextMax = posInt(raw.customContextMax, "customContextMax", { min: 128, max: 10000000, allowNull: true });
  const legacyCustomAssumed = (
    raw.legacyCustomAssumed === true
    && modelId === "custom"
    && customParamsB === null
    && customActiveParamsB === null
    && customKvBytesBf16 === null
    && customContextMax === null
  );

  const wquant = String(raw.wquant ?? "fp8").trim();
  const kvquant = String(raw.kvquant ?? "fp8").trim();
  const runtime = String(raw.runtime ?? "vllm").trim();
  const gpuId = String(raw.gpuId ?? workloadPreset.recommendedGpuId ?? "rtx_pro_6000_se").trim();

  const quoteBasis = String(raw.quoteBasis ?? "catalog").trim();
  if (!QUOTE_BASES.has(quoteBasis)) {
    throw new SizerValidationError("bad_quote_basis", `Unsupported quote basis "${quoteBasis}"`);
  }
  const serverId = raw.serverId ? String(raw.serverId).trim() : "";
  const serverPriceBasis = String(raw.serverPriceBasis ?? "usd_typical").trim();
  const nodes = posInt(raw.nodes, "nodes", { min: 1, max: 10000, allowNull: true });
  const gpusPerNode = posInt(raw.gpusPerNode, "gpusPerNode", { min: 1, max: 64, allowNull: true });

  const defaultCurrency = CURRENCIES.has(String(raw.quoteCurrency ?? "THB").toUpperCase())
    ? String(raw.quoteCurrency ?? "THB").toUpperCase()
    : "THB";

  const integratedNodePrice = cleanMoneyEntry(raw.integratedNodePrice, "integratedNodePrice", defaultCurrency);
  const chassisNodePrice = cleanMoneyEntry(raw.chassisNodePrice, "chassisNodePrice", defaultCurrency);
  const gpuUnitPrice = cleanMoneyEntry(raw.gpuUnitPrice, "gpuUnitPrice", defaultCurrency);
  const fleetTotalPrice = cleanMoneyEntry(raw.fleetTotalPrice, "fleetTotalPrice", defaultCurrency);

  const localImplFee = cleanMoneyEntry(raw.localImplFee, "localImplFee", defaultCurrency);
  const apiImplFee = cleanMoneyEntry(raw.apiImplFee, "apiImplFee", defaultCurrency);
  const commonImplFee = cleanMoneyEntry(raw.commonImplFee, "commonImplFee", defaultCurrency);
  const annualOpsFee = cleanMoneyEntry(raw.annualOpsFee, "annualOpsFee", defaultCurrency);

  const electricityThbPerKwh = decStr(raw.electricityThbPerKwh ?? "4", "electricityThbPerKwh", { min: "0", max: "100" });
  const pue = decStr(raw.pue ?? "1.4", "pue", { min: "1.0", max: "5.0", allowZero: false });
  const nodeOverheadFraction = decStr(raw.nodeOverheadFraction ?? "0.2", "nodeOverheadFraction", { min: "0", max: "2" });

  const horizonMonths = posInt(raw.horizonMonths ?? 60, "horizonMonths", { min: 1, max: 120 });
  const apiOfferId = raw.apiOfferId ? String(raw.apiOfferId).trim() : "";
  const subscriptionId = String(raw.subscriptionId ?? "none").trim();
  const subscriptionTerm = raw.subscriptionTerm ? String(raw.subscriptionTerm).trim() : "";
  const dealTierOverride = raw.dealTierOverride && DEAL_TIERS[raw.dealTierOverride] ? raw.dealTierOverride : null;
  const quoteUtc = typeof raw.quoteUtc === "string" && /^\d{4}-\d\d-\d\dT\d\d:00:00Z$/.test(raw.quoteUtc)
    ? raw.quoteUtc
    : "2026-09-01T00:00:00Z";
  const pricingIdentity = raw.pricingIdentity ? String(raw.pricingIdentity) : null;

  return Object.freeze({
    schema: SIZER_SCHEMA,
    workloadId: workloadPreset.id,
    deploymentMode,
    connectors,
    dealTierOverride,
    users,
    sessionsPerUserDay,
    workingDaysMo,
    peakConcurrencyFraction,
    tokensPerSecondPerStream,
    mix,
    tokenBasis,
    thaiFertilityMultiplier,
    sessionStackingActive: hasExplicitSessionFields,
    rawSystemPromptTokens,
    turnsPerSession,
    kvCacheHitRate,
    rawPromptTokens,
    rawOutputTokens,
    rawContextTokens,
    effectiveSystemPromptTokens,
    effectivePromptTokens,
    effectiveOutputTokens,
    effectiveContextTokens,
    modelId,
    customParamsB,
    customActiveParamsB,
    customKvBytesBf16,
    customContextMax,
    legacyCustomAssumed,
    wquant,
    kvquant,
    runtime,
    gpuId,
    quoteBasis,
    quoteCurrency: defaultCurrency,
    serverId,
    serverPriceBasis,
    nodes,
    gpusPerNode,
    integratedNodePrice,
    chassisNodePrice,
    gpuUnitPrice,
    fleetTotalPrice,
    localImplFee,
    apiImplFee,
    commonImplFee,
    annualOpsFee,
    electricityThbPerKwh,
    pue,
    nodeOverheadFraction,
    horizonMonths,
    apiOfferId,
    subscriptionId,
    subscriptionTerm,
    quoteUtc,
    pricingIdentity,
  });
}

export function resolveSizerModel({ normalized, servingData }) {
  const baseModel = (servingData?.models ?? []).find((m) => m.id === normalized.modelId);
  if (!baseModel) {
    return {
      ok: false,
      code: "unknown_model",
      reason: `Model "${normalized.modelId}" is not in serving-models.json.`,
      model: null,
      warnings: [],
      weightMemoryGb: null,
    };
  }
  const wq = servingData?.weight_quantization?.[normalized.wquant];
  const kq = servingData?.kv_quantization?.[normalized.kvquant];
  const calcWeightGb = (paramsStr, modelObj = null) => {
    if (!paramsStr || !wq?.bytes_per_param) return null;
    return estimateModelWeightGb(
      modelObj ? { ...modelObj, params_b: paramsStr } : { params_b: paramsStr, active_params_b: paramsStr },
      wq.bytes_per_param,
      { runtimeKey: normalized.runtime },
    );
  };
  const deriveSelectedKvBytes = (bf16Bytes) => {
    const elemRat = toRat(String(kq?.bytes_per_element ?? "1"));
    const prod = Rat.from(BigInt(bf16Bytes)).mul(elemRat).div(Rat.from(2n));
    const q = prod.n / prod.d;
    const rem = prod.n % prod.d;
    return Number(rem > 0n ? q + 1n : q);
  };

  const hasAnyCustomField = (
    normalized.customParamsB !== null
    || normalized.customActiveParamsB !== null
    || normalized.customKvBytesBf16 !== null
    || normalized.customContextMax !== null
  );

  if (normalized.modelId === "custom") {
    if (normalized.legacyCustomAssumed && !hasAnyCustomField) {
      return {
        ok: true,
        code: "ok",
        reason: null,
        model: { ...baseModel, kv_override: false, selected_kv_bytes_per_token: "" },
        weightMemoryGb: calcWeightGb(baseModel.params_b),
        warnings: [{
          code: "assumed_legacy_custom_shape",
          en: "Legacy custom preset uses an assumed 8B (32-layer, 8 KV-head) starting geometry. Supply total/active B, BF16 KV bytes/token, and context limit for your actual checkpoint.",
          th: "ใช้ค่าเริ่มต้นสมมติฐาน\u00A08B\u00A0(32\u00A0เลเยอร์)\u00A0โปรดระบุพารามิเตอร์\u00A0ค่า\u00A0KV\u00A0ต่อโทเค็น\u00A0และ\u00A0Context\u00A0สูงสุดของโมเดลจริง",
        }],
      };
    }
    const weightMemoryGb = calcWeightGb(normalized.customParamsB);
    if (
      normalized.customParamsB === null
      || normalized.customActiveParamsB === null
      || normalized.customKvBytesBf16 === null
      || normalized.customContextMax === null
    ) {
      return {
        ok: false,
        code: "incomplete_custom_model",
        reason: `Custom model (${normalized.customParamsB ? `${normalized.customParamsB}B` : "unspecified"} weights${weightMemoryGb ? `, ~${weightMemoryGb} GB weight memory` : ""}) requires total parameters (B), active parameters (B), full-retention BF16 KV cache bytes/token, and max context window before sizing a GPU fleet.`,
        model: null,
        warnings: [],
        weightMemoryGb,
      };
    }
    if (Dec.from(normalized.customActiveParamsB).gt(Dec.from(normalized.customParamsB))) {
      return {
        ok: false,
        code: "bad_custom_params",
        reason: `Active parameters (${normalized.customActiveParamsB}B) cannot exceed total parameters (${normalized.customParamsB}B).`,
        model: null,
        warnings: [],
        weightMemoryGb,
      };
    }
    const selectedKvBytes = Math.max(1, deriveSelectedKvBytes(normalized.customKvBytesBf16));
    return {
      ok: true,
      code: "ok",
      reason: null,
      weightMemoryGb,
      model: {
        ...baseModel,
        label: `Custom (${normalized.customParamsB}B / ${normalized.customActiveParamsB}B active)`,
        params_b: normalized.customParamsB,
        active_params_b: normalized.customActiveParamsB,
        context_max: normalized.customContextMax,
        context_default: Math.min(normalized.effectiveContextTokens, normalized.customContextMax),
        kv_override: true,
        selected_kv_bytes_per_token: String(selectedKvBytes),
        groups: [{ kind: "full", layers: 1, tensors: 1, kv_heads: 1, head_dim: selectedKvBytes }],
      },
      warnings: [{
        code: "assumed_flat_custom_kv",
        en: "Custom model uses user-supplied full-retention KV bytes/token (planning approximation; sliding/hybrid window retention and recurrent state are not modeled).",
        th: "คำนวณ\u00A0KV\u00A0Cache\u00A0จากค่าต่อโทเคนที่ผู้ใช้ระบุแบบเก็บเต็มความยาว\u00A0(ประมาณการสำหรับการวางแผน\u00A0ไม่รวม\u00A0Sliding/Hybrid)",
      }],
    };
  }

  // Real catalog model with optional parameter-sensitivity / KV overrides
  const resolvedParamsB = normalized.customParamsB ?? String(baseModel.params_b);
  const resolvedActiveB = normalized.customActiveParamsB
    ?? (normalized.customParamsB !== null ? normalized.customParamsB : String(baseModel.active_params_b));
  if (Dec.from(resolvedActiveB).gt(Dec.from(resolvedParamsB))) {
    return {
      ok: false,
      code: "bad_custom_params",
      reason: `Active parameters (${resolvedActiveB}B) cannot exceed total parameters (${resolvedParamsB}B).`,
      model: null,
      warnings: [],
      weightMemoryGb: calcWeightGb(resolvedParamsB),
    };
  }
  const modelWarnings = [];
  let groups = baseModel.groups;
  let kvOverride = false;
  let selectedKvStr = "";
  if (normalized.customKvBytesBf16 !== null) {
    const selectedKvBytes = Math.max(1, deriveSelectedKvBytes(normalized.customKvBytesBf16));
    kvOverride = true;
    selectedKvStr = String(selectedKvBytes);
    groups = [{ kind: "full", layers: 1, tensors: 1, kv_heads: 1, head_dim: selectedKvBytes }];
    modelWarnings.push({
      code: "assumed_flat_custom_kv",
      en: "KV cache overridden with a flat full-retention rate (planning approximation).",
      th: "แทนที่ค่า\u00A0KV\u00A0Cache\u00A0ด้วยอัตราคงที่ต่อโทเคนตามที่ผู้ใช้กำหนด",
    });
  } else if (normalized.customParamsB !== null || normalized.customActiveParamsB !== null) {
    modelWarnings.push({
      code: "assumed_template_param_override",
      en: `Parameter-sensitivity override (${resolvedParamsB}B / ${resolvedActiveB}B active) retains ${baseModel.label}'s KV layer geometry as an assumption, not a verified checkpoint architecture.`,
      th: `การจำลองขนาดพารามิเตอร์\u00A0(${resolvedParamsB}B)\u00A0ยังคงใช้โครงสร้าง\u00A0KV\u00A0Cache\u00A0ของ\u00A0${baseModel.label}\u00A0เป็นสมมติฐาน`,
    });
  }

  return {
    ok: true,
    code: "ok",
    reason: null,
    weightMemoryGb: calcWeightGb(resolvedParamsB),
    model: {
      ...baseModel,
      params_b: resolvedParamsB,
      active_params_b: resolvedActiveB,
      context_max: normalized.customContextMax ?? baseModel.context_max,
      kv_override: kvOverride,
      selected_kv_bytes_per_token: selectedKvStr,
      groups,
    },
    warnings: modelWarnings,
  };
}

export function evaluateModelFit({ normalized, servingData, gpuPricing, effectiveGpusPerNode = null }) {
  const resolved = resolveSizerModel({ normalized, servingData });
  if (!resolved.ok) {
    return {
      status: "refused",
      arithmeticFit: false,
      qualifiedDeploymentPass: false,
      code: resolved.code,
      reason: resolved.reason,
      warnings: [],
      serving: null,
      resolvedModel: null,
      weightMemoryGb: resolved.weightMemoryGb,
      thaiProfile: THAI_MODEL_PROFILES[normalized.modelId] ?? null,
    };
  }
  const model = resolved.model;
  const maxCtx = Number(model.context_max ?? 0);
  if (maxCtx > 0 && normalized.effectiveContextTokens > maxCtx) {
    return {
      status: "refused",
      arithmeticFit: false,
      qualifiedDeploymentPass: false,
      code: "exceeds_model_context_max",
      reason: `Thai-adjusted context (${normalized.effectiveContextTokens.toLocaleString("en-US")} tokens) exceeds ${model.label}'s maximum context (${maxCtx.toLocaleString("en-US")} tokens).`,
      warnings: [],
      serving: null,
      resolvedModel: model,
      weightMemoryGb: resolved.weightMemoryGb,
      thaiProfile: THAI_MODEL_PROFILES[model.id] ?? null,
    };
  }
  if (normalized.effectivePromptTokens + normalized.effectiveOutputTokens > normalized.effectiveContextTokens) {
    return {
      status: "refused",
      arithmeticFit: false,
      qualifiedDeploymentPass: false,
      code: "prompt_plus_output_exceeds_context",
      reason: `Effective prompt (${normalized.effectivePromptTokens}) + output (${normalized.effectiveOutputTokens}) exceeds configured context (${normalized.effectiveContextTokens}).`,
      warnings: [],
      serving: null,
      resolvedModel: model,
      weightMemoryGb: resolved.weightMemoryGb,
      thaiProfile: THAI_MODEL_PROFILES[model.id] ?? null,
    };
  }

  const acc = servingData?.accelerators?.[normalized.gpuId];
  const vramGb = gpuPricing?.gpus?.[normalized.gpuId]?.vram_gb;
  const wq = servingData?.weight_quantization?.[normalized.wquant];
  const kq = servingData?.kv_quantization?.[normalized.kvquant];
  const rt = servingData?.runtimes?.[normalized.runtime];
  if (!acc || vramGb === undefined || !wq || !kq || !rt) {
    return {
      status: "refused",
      arithmeticFit: false,
      qualifiedDeploymentPass: false,
      code: "missing_accelerator_or_quant",
      reason: `Missing bandwidth/VRAM or quantization metadata for GPU "${normalized.gpuId}".`,
      warnings: [],
      serving: null,
      resolvedModel: model,
      weightMemoryGb: resolved.weightMemoryGb,
      thaiProfile: THAI_MODEL_PROFILES[model.id] ?? null,
    };
  }

  const sessionMeta = normalized.sessionStackingActive
    ? buildSessionProjectionFromConfig({
        effectiveSystemPromptTokens: normalized.effectiveSystemPromptTokens,
        effectivePromptTokens: normalized.effectivePromptTokens,
        effectiveOutputTokens: normalized.effectiveOutputTokens,
        turnsPerSession: normalized.turnsPerSession,
        kvCacheHitRate: normalized.kvCacheHitRate,
        users: normalized.users,
        sessionsPerUserDay: normalized.sessionsPerUserDay,
        workingDaysMo: normalized.workingDaysMo,
      })
    : null;

  let serving;
  try {
    serving = servingPlan({
      model,
      contextTokens: String(sessionMeta ? Math.max(normalized.effectiveContextTokens - (sessionMeta.peakTurnContextTokens - sessionMeta.avgTurnContextTokens), sessionMeta.avgTurnContextTokens) : normalized.effectiveContextTokens),
      peakContextTokens: String(normalized.effectiveContextTokens),
      sharedPrefixTokens: sessionMeta ? sessionMeta.sharedPrefixTokens : 0,
      supportsPrefixCache: Boolean(rt.supports_prefix_cache),
      pageBlockTokens: rt.page_block_tokens ?? 16,
      runtimeKey: normalized.runtime,
      bytesPerParam: wq.bytes_per_param,
      kvBytesPerElement: model.kv_override ? "1" : kq.bytes_per_element,
      vramGb: String(vramGb),
      bandwidthGbS: acc.bandwidth_gb_s,
      runtimeEfficiency: rt.bandwidth_efficiency,
      tpEfficiency: servingData.tensor_parallel.efficiency_per_extra_gpu,
      vramOverheadFraction: servingData.vram_overhead_fraction.value,
      perStreamFloorTokS: normalized.tokensPerSecondPerStream,
      maxBatch: null,
    });
  } catch (err) {
    return {
      status: "refused",
      arithmeticFit: false,
      qualifiedDeploymentPass: false,
      code: err instanceof ServingRefusal ? err.code : "serving_error",
      reason: err.message,
      warnings: [],
      serving: null,
      resolvedModel: model,
      weightMemoryGb: resolved.weightMemoryGb,
      thaiProfile: THAI_MODEL_PROFILES[model.id] ?? null,
    };
  }

  const tpDegree = Number(serving.gpus_per_replica);
  if (effectiveGpusPerNode !== null && tpDegree > effectiveGpusPerNode) {
    return {
      status: "unsupported_cross_node_tp",
      arithmeticFit: true,
      qualifiedDeploymentPass: false,
      code: "unsupported_cross_node_tp",
      reason: `Model requires TP=${tpDegree} per replica, but each server node holds only ${effectiveGpusPerNode} GPU(s). Cross-node tensor parallelism without verified RDMA/NVLink fabric is not supported as a deployment pass.`,
      warnings: ["cross_node_tp_blocked"],
      serving,
      resolvedModel: model,
      weightMemoryGb: resolved.weightMemoryGb,
      thaiProfile: THAI_MODEL_PROFILES[model.id] ?? null,
    };
  }

  const warnings = [...resolved.warnings];
  if (normalized.wquant === "int4") {
    warnings.push({
      code: "lower_bound_ideal_weights",
      en: "INT4 weight memory uses ideal params x 0.5B lower bound (quantization group scales/metadata add overhead; verify actual checkpoint size before final BOM).",
      th: "หน่วยความจำ\u00A0INT4\u00A0คำนวณจากค่าขั้นต่ำทางทฤษฎี\u00A0(Params\u00A0x\u00A00.5B) ควรตรวจสอบขนาดไฟล์โมเดลจริงก่อนสรุปใบเสนอราคา",
    });
  }
  if (tpDegree > 1 && PCIE_ONLY_GPUS.has(normalized.gpuId)) {
    warnings.push({
      code: "assumed_tp_pcie_unmodeled",
      en: `TP=${tpDegree} on PCIe accelerator (${normalized.gpuId}) uses a scalar 0.92 TP assumption; PCIe all-reduce latency penalty is unmodeled.`,
      th: `การรัน\u00A0TP=${tpDegree}\u00A0บนการ์ด\u00A0PCIe\u00A0ใช้ค่าประมาณการสเกล\u00A00.92\u00A0ยังไม่ได้หักลดความหน่วงของการเชื่อมต่อผ่าน\u00A0PCIe`,
    });
  }

  const qualifiedDeploymentPass = warnings.length === 0;
  return {
    status: qualifiedDeploymentPass ? "qualified_pass" : "conditional_pass",
    arithmeticFit: true,
    qualifiedDeploymentPass,
    code: qualifiedDeploymentPass ? "ok" : warnings[0].code,
    reason: null,
    warnings,
    serving,
    resolvedModel: model,
    weightMemoryGb: resolved.weightMemoryGb,
    thaiProfile: THAI_MODEL_PROFILES[model.id] ?? {
      tierId: "custom_tier",
      thaiSupport: "verify_tokenizer",
      enTier: "Custom / General Model Selection",
      thTier: "โมเดลกำหนดเอง\u00A0(โปรดตรวจสอบคลังคำภาษาไทย)",
      enNote: "Verify Thai tokenizer fertility and instruction tuning on representative enterprise prompts.",
      thNote: "โปรดทดสอบการตัดคำและความแม่นยำภาษาไทยด้วยชุดข้อมูลจริงขององค์กร",
    },
  };
}

export function buildShapesFromNormalized(normalized) {
  if (normalized.sessionStackingActive) {
    const proj = buildSessionProjectionFromConfig({
      effectiveSystemPromptTokens: normalized.effectiveSystemPromptTokens,
      effectivePromptTokens: normalized.effectivePromptTokens,
      effectiveOutputTokens: normalized.effectiveOutputTokens,
      turnsPerSession: normalized.turnsPerSession,
      kvCacheHitRate: normalized.kvCacheHitRate,
      users: normalized.users,
      sessionsPerUserDay: normalized.sessionsPerUserDay,
      workingDaysMo: normalized.workingDaysMo,
    });
    const tStr = String(normalized.turnsPerSession);
    const inStr = String(proj.compatAvgUncachedInPerTurn);
    const outStr = String(normalized.effectiveOutputTokens);
    const cachedStr = String(proj.compatAvgCachedReadPerTurn);
    return {
      chat: { turns_per_session: tStr, in_tokens: inStr, out_tokens: outStr, cached_tokens: cachedStr },
      rag: { turns_per_session: tStr, in_tokens: inStr, out_tokens: outStr, cached_tokens: cachedStr },
      graph_rag: { turns_per_session: tStr, in_tokens: inStr, out_tokens: outStr, cached_tokens: cachedStr },
      agentic: { turns_per_session: tStr, in_tokens: inStr, out_tokens: outStr, cached_tokens: cachedStr },
    };
  }
  const baseIn = String(normalized.effectivePromptTokens);
  const baseOut = String(normalized.effectiveOutputTokens);
  return {
    chat: { turns_per_session: "4", in_tokens: baseIn, out_tokens: baseOut, cached_tokens: "0" },
    rag: { turns_per_session: "3", in_tokens: baseIn, out_tokens: baseOut, cached_tokens: "0" },
    graph_rag: { turns_per_session: "2", in_tokens: baseIn, out_tokens: baseOut, cached_tokens: "0" },
    agentic: { turns_per_session: "5", in_tokens: baseIn, out_tokens: baseOut, cached_tokens: "0" },
  };
}

export function computeHardwareBom({ normalized, gpusRequired, tpDegree = 1, serverPricing, fx }) {
  const rows = serversForGpu(normalized.gpuId, serverPricing?.rows ?? []);
  if (normalized.quoteBasis === "catalog") {
    let chosen = null;
    if (normalized.serverId) {
      chosen = rows.find((r) => r.server_id === normalized.serverId) ?? null;
      if (!chosen) {
        return {
          ok: false,
          code: "unknown_server",
          reason: `Selected server "${normalized.serverId}" is not available for GPU "${normalized.gpuId}".`,
        };
      }
      if (tpDegree > chosen.gpu_count) {
        return {
          ok: false,
          code: "unsupported_cross_node_tp",
          reason: `Model requires TP=${tpDegree} per replica, which exceeds ${chosen.gpu_count} GPU(s) on selected server "${chosen.label ?? chosen.server_id}".`,
        };
      }
    } else {
      if (!rows.length) {
        return {
          ok: false,
          code: "no_catalog_server",
          reason: `No published integrated server price for "${normalized.gpuId}". Choose a custom hardware quote basis.`,
        };
      }
      const eligibleRows = rows.filter((r) => r.gpu_count >= tpDegree);
      if (!eligibleRows.length) {
        const maxSlots = Math.max(...rows.map((r) => r.gpu_count));
        return {
          ok: false,
          code: "unsupported_cross_node_tp",
          reason: `Model requires TP=${tpDegree} per replica, exceeding the maximum ${maxSlots} GPU slot(s) per server node for "${normalized.gpuId}".`,
        };
      }
      try {
        const c = cheapestConfigFor({
          gpuId: normalized.gpuId,
          servers: eligibleRows,
          gpusRequired: Math.max(1, gpusRequired),
          priceBasis: normalized.serverPriceBasis,
        });
        chosen = eligibleRows.find((r) => r.server_id === c.best?.server_id) ?? eligibleRows[0];
      } catch {
        chosen = eligibleRows[0];
      }
    }
    try {
      // In catalog mode, the selected server row's gpu_count is authoritative (gpusPerNode is disabled in UI).
      const targetGpus = normalized.nodes !== null
        ? normalized.nodes * chosen.gpu_count
        : Math.max(1, gpusRequired);
      if (targetGpus < gpusRequired) {
        return {
          ok: false,
          code: "insufficient_installed_gpus",
          reason: `Configured fleet (${targetGpus} GPUs) is below workload requirement (${gpusRequired} GPUs).`,
        };
      }
      const plan = nodesForFleet({
        gpusRequired: targetGpus,
        server: chosen,
        priceBasis: normalized.serverPriceBasis,
      });
      return {
        ok: true,
        quoteBasis: "catalog",
        serverRow: chosen,
        serverId: chosen.server_id,
        nodes: plan.nodes,
        gpusPerNode: chosen.gpu_count,
        installedGpus: plan.gpus_provisioned,
        capexUsd: plan.capex,
        capexThb: ratStr(toTHB(plan.capex, fx)),
        capexPlan: plan,
      };
    } catch (err) {
      return {
        ok: false,
        code: err instanceof CapexRefusal ? err.code : "capex_error",
        reason: err.message,
      };
    }
  }

  // Custom topology bases: integrated_node, component_split, fleet_total
  if (normalized.gpusPerNode !== null && tpDegree > normalized.gpusPerNode) {
    return {
      ok: false,
      code: "unsupported_cross_node_tp",
      reason: `Model requires TP=${tpDegree} per replica, which exceeds configured ${normalized.gpusPerNode} GPU(s) per custom node.`,
    };
  }
  const autoCustomSlots = rows.find((r) => r.gpu_count >= tpDegree)?.gpu_count
    ?? Math.max(tpDegree, rows[0]?.gpu_count ?? Math.min(8, Math.max(1, gpusRequired)));
  const gpusPerNode = normalized.gpusPerNode ?? autoCustomSlots;
  const minNodes = Math.max(1, Math.ceil(gpusRequired / gpusPerNode));
  const nodes = normalized.nodes ?? minNodes;
  const installedGpus = nodes * gpusPerNode;

  if (installedGpus < gpusRequired) {
    return {
      ok: false,
      code: "insufficient_installed_gpus",
      reason: `Configured custom topology (${nodes} node(s) x ${gpusPerNode} GPU/node = ${installedGpus} GPUs) is below the ${gpusRequired} GPU(s) required for peak load.`,
    };
  }

  let capexUsdRat;
  if (normalized.quoteBasis === "integrated_node") {
    const perNodeUsd = toRat(moneyToUsdExact(normalized.integratedNodePrice, fx));
    if (perNodeUsd.sign() <= 0) {
      return { ok: false, code: "zero_custom_quote", reason: "Enter a positive per-node hardware price (GPUs included)." };
    }
    capexUsdRat = perNodeUsd.mul(Rat.from(BigInt(nodes)));
  } else if (normalized.quoteBasis === "component_split") {
    const chassisUsd = toRat(moneyToUsdExact(normalized.chassisNodePrice, fx));
    const cardUsd = toRat(moneyToUsdExact(normalized.gpuUnitPrice, fx));
    if (chassisUsd.sign() <= 0 && cardUsd.sign() <= 0) {
      return { ok: false, code: "zero_custom_quote", reason: "Enter chassis per-node and/or per-GPU card prices." };
    }
    capexUsdRat = chassisUsd.mul(Rat.from(BigInt(nodes))).add(cardUsd.mul(Rat.from(BigInt(installedGpus))));
  } else {
    const totalUsd = toRat(moneyToUsdExact(normalized.fleetTotalPrice, fx));
    if (totalUsd.sign() <= 0) {
      return { ok: false, code: "zero_custom_quote", reason: "Enter a positive total fleet hardware quote." };
    }
    capexUsdRat = totalUsd;
  }

  return {
    ok: true,
    quoteBasis: normalized.quoteBasis,
    serverRow: null,
    serverId: "",
    nodes,
    gpusPerNode,
    installedGpus,
    capexUsd: ratStr(capexUsdRat),
    capexThb: ratStr(toTHB(capexUsdRat, fx)),
    capexPlan: {
      nodes,
      gpus_per_node: gpusPerNode,
      gpus_provisioned: installedGpus,
      capex: ratStr(capexUsdRat),
      custom_quote_basis: normalized.quoteBasis,
    },
  };
}

export function buildPricingIdentity(manifest, fx) {
  const fxDoc = fx?.rate ? fx : normalizeFxDocument(fx);
  const rateText = formatHalfUp(fxDoc.rate, 6);
  const sources = manifest?.sources && typeof manifest.sources === "object"
    ? Object.keys(manifest.sources)
      .sort()
      .map((sid) => {
        const s = manifest.sources[sid] ?? {};
        return `${sid}:${s.origin ?? "snapshot"}@${s.observed_at ?? ""}:${s.integrity ?? "declared"}`;
      })
      .join(",")
    : "";
  return `${manifest?.snapshot_digest ?? "local"}${sources ? `|${sources}` : ""}|${fxDoc.observed_at}|${rateText}`;
}

function parsePricingIdentityParts(identity) {
  const parts = String(identity ?? "").split("|");
  if (parts.length < 3) return null;
  const fxRateText = parts[parts.length - 1] ?? "";
  const fxDate = parts[parts.length - 2] ?? "";
  const sourceSegment = parts.length >= 4 ? parts.slice(1, parts.length - 2).join("|") : "";
  const sources = {};
  for (const item of sourceSegment.split(",").filter(Boolean)) {
    const m = /^([^:]+):([^@]+)@([^:]*):(.+)$/.exec(item);
    if (m) {
      sources[m[1]] = {
        origin: m[2],
        date: m[3] ? m[3].slice(0, 10) : "",
      };
    }
  }
  return {
    fxDate: fxDate.slice(0, 10),
    fxRateText,
    sources,
  };
}

export function describePricingRefresh(capturedIdentity, currentIdentity, lang = "en") {
  const prev = parsePricingIdentityParts(capturedIdentity);
  const curr = parsePricingIdentityParts(currentIdentity);
  const isTh = lang === "th";
  if (!prev || !curr) {
    return isTh
      ? "อัปเดตข้อมูลราคา\u00A0API\u00A0หรืออัตราแลกเปลี่ยนล่าสุดแล้ว ตัวเลขด้านล่างคำนวณใหม่ตามแหล่งข้อมูลปัจจุบัน"
      : "Pricing source metadata was updated since this scenario was captured; totals below reflect current catalog sources.";
  }

  const notes = [];
  const orCurr = curr.sources.openrouter;
  const orPrev = prev.sources.openrouter;
  if (orCurr && (!orPrev || orCurr.origin !== orPrev.origin || orCurr.date !== orPrev.date)) {
    const modeEn = orCurr.origin === "live" ? "live feed" : "dated snapshot";
    const modeTh = orCurr.origin === "live" ? "ข้อมูลสด" : "ข้อมูลตามรอบ";
    notes.push(isTh
      ? `OpenRouter (${modeTh}${orCurr.date ? ` ${orCurr.date}` : ""})`
      : `OpenRouter (${modeEn}${orCurr.date ? ` ${orCurr.date}` : ""})`);
  }

  const llCurr = curr.sources.litellm;
  const llPrev = prev.sources.litellm;
  if (llCurr && (!llPrev || llCurr.origin !== llPrev.origin || llCurr.date !== llPrev.date)) {
    notes.push(isTh
      ? `LiteLLM (${llCurr.date || "ล่าสุด"})`
      : `LiteLLM (${llCurr.date || "updated"})`);
  }

  const prevRateFmt = (() => {
    try { return formatHalfUp(toRat(prev.fxRateText), 2); } catch { return prev.fxRateText; }
  })();
  const currRateFmt = (() => {
    try { return formatHalfUp(toRat(curr.fxRateText), 2); } catch { return curr.fxRateText; }
  })();

  if (prev.fxRateText !== curr.fxRateText) {
    notes.push(isTh
      ? `อัตราแลกเปลี่ยน\u00A0USD/THB\u00A0${prevRateFmt}\u00A0\u2192\u00A0${currRateFmt}${curr.fxDate ? ` (${curr.fxDate})` : ""}`
      : `ECB FX ${prevRateFmt} -> ${currRateFmt} THB/USD${curr.fxDate ? ` (${curr.fxDate})` : ""}`);
  } else if (prev.fxDate !== curr.fxDate && curr.fxDate) {
    notes.push(isTh
      ? `ตรวจอัตราแลกเปลี่ยนล่าสุด\u00A0(${currRateFmt}\u00A0THB/USD, ${curr.fxDate})`
      : `ECB FX checked ${curr.fxDate} (${currRateFmt} THB/USD)`);
  }

  if (notes.length === 0) {
    return isTh
      ? "ตรวจสอบความสดของแหล่งข้อมูลราคา\u00A0API\u00A0และอัตราแลกเปลี่ยนล่าสุดแล้ว ตัวเลขด้านล่างอ้างอิงชุดข้อมูลปัจจุบัน"
      : "Pricing source timestamps were refreshed since this scenario was captured; totals below use current catalog metadata.";
  }

  return isTh
    ? `อัปเดตแหล่งข้อมูลราคาล่าสุดตั้งแต่สร้างลิงก์นี้\u00A0(${notes.join(" · ")}) ตัวเลขด้านล่างคำนวณตามชุดข้อมูลปัจจุบัน`
    : `Pricing sources updated since this scenario was captured (${notes.join(" · ")}); totals below reflect current catalog data.`;
}

// Shared scenario assembly + calculator.js:runComparison execution.
export function computeSizer({
  input,
  data: { manifest, catalog, fx: rawFx, gpuPricing, serverPricing, servingData, powerSeed, subscriptions },
  nowMs = 1788220800000,
}) {
  const fx = rawFx?.rate ? rawFx : normalizeFxDocument(rawFx, { integrity: "digest-pinned" });
  if (powerSeed) configurePowerSeed(powerSeed);

  const normalized = input?.schema === SIZER_SCHEMA ? input : normalizeSizerInput(input);
  const shapes = buildShapesFromNormalized(normalized);
  const sessionProj = normalized.sessionStackingActive
    ? buildSessionProjectionFromConfig({
        effectiveSystemPromptTokens: normalized.effectiveSystemPromptTokens,
        effectivePromptTokens: normalized.effectivePromptTokens,
        effectiveOutputTokens: normalized.effectiveOutputTokens,
        turnsPerSession: normalized.turnsPerSession,
        kvCacheHitRate: normalized.kvCacheHitRate,
        users: normalized.users,
        sessionsPerUserDay: normalized.sessionsPerUserDay,
        workingDaysMo: normalized.workingDaysMo,
      })
    : null;

  const baseDemand = buildDemand({
    users: String(normalized.users),
    sessionsPerUserDay: normalized.sessionsPerUserDay,
    workingDaysMo: String(normalized.workingDaysMo),
    mix: normalized.mix,
    shapes,
  });
  const mkSlot = (rat) => ({ rat, basis: "derived", text: formatHalfUp(rat, 0), places: 0 });
  const demand = sessionProj
    ? {
        ...baseDemand,
        turns_mo: mkSlot(sessionProj.turnsMoRat),
        in_tokens_mo: mkSlot(sessionProj.inTokensMoRat),
        cached_tokens_mo: mkSlot(sessionProj.cachedTokensMoRat),
        out_tokens_mo: mkSlot(sessionProj.outTokensMoRat),
        tokens_mo: mkSlot(sessionProj.tokensMoRat),
      }
    : baseDemand;

  const personTokenSummary = sessionProj
    ? sessionProj.personTokenSummary
    : (() => {
        const uRat = Rat.from(BigInt(normalized.users));
        const dRat = Rat.from(BigInt(normalized.workingDaysMo));
        const perPersonMo = demand.tokens_mo.rat.div(uRat);
        const perPersonDay = perPersonMo.div(dRat);
        return {
          sessionStackingActive: false,
          tokensPerSession: formatHalfUp(demand.tokens_mo.rat.div(demand.sessions_mo.rat.isZero() ? Rat.from(1n) : demand.sessions_mo.rat), 0),
          tokensPerPersonDay: formatHalfUp(perPersonDay, 0),
          tokensPerPersonMo: formatHalfUp(perPersonMo, 0),
          uncachedInPerPersonDay: formatHalfUp(demand.in_tokens_mo.rat.div(uRat).div(dRat), 0),
          cachedReadPerPersonDay: formatHalfUp(demand.cached_tokens_mo.rat.div(uRat).div(dRat), 0),
          outputPerPersonDay: formatHalfUp(demand.out_tokens_mo.rat.div(uRat).div(dRat), 0),
          turn1ColdPromptTokens: normalized.effectivePromptTokens,
          finalTurnPromptTokens: normalized.effectivePromptTokens,
          peakTurnContextTokens: normalized.effectiveContextTokens,
          avgTurnContextTokens: normalized.effectiveContextTokens,
          sharedPrefixTokens: 0,
        };
      })();

  const peak = peakTokensPerSecond({
    users: String(normalized.users),
    peakConcurrencyFraction: normalized.peakConcurrencyFraction,
    tokensPerSecondPerStream: normalized.tokensPerSecondPerStream,
  });

  const catalogRows = serversForGpu(normalized.gpuId, serverPricing?.rows ?? []);
  const pinnedCatalogServer = normalized.quoteBasis === "catalog" && normalized.serverId
    ? (catalogRows.find((r) => r.server_id === normalized.serverId) ?? null)
    : null;
  const explicitSlots = normalized.quoteBasis === "catalog"
    ? (pinnedCatalogServer ? pinnedCatalogServer.gpu_count : null)
    : normalized.gpusPerNode;

  const fit = evaluateModelFit({
    normalized,
    servingData,
    gpuPricing,
    effectiveGpusPerNode: explicitSlots,
  });

  if (!fit.arithmeticFit || fit.status === "unsupported_cross_node_tp") {
    return {
      ok: false,
      stage: "model_fit",
      code: fit.code,
      reason: fit.reason,
      normalized,
      demand,
      peak,
      fit,
      bom: null,
      comparison: null,
      dealTier: normalized.dealTierOverride ?? recommendDealTier({ users: normalized.users, connectors: normalized.connectors, gpusRequired: 1 }),
      pricingIdentity: buildPricingIdentity(manifest, fx),
    };
  }

  const sizing = gpusForLoad({
    peakTokensPerSecond: peak.peak_tokens_s.text,
    gpuId: normalized.gpuId,
    serving: fit.serving,
  });
  const gpusRequired = Math.max(1, Number(sizing.gpus_required.text));
  const tpDegree = Number(fit.serving.gpus_per_replica);

  const bom = computeHardwareBom({
    normalized,
    gpusRequired,
    tpDegree,
    serverPricing,
    fx,
  });

  const dealTierId = normalized.dealTierOverride ?? recommendDealTier({
    users: normalized.users,
    connectors: normalized.connectors,
    gpusRequired,
  });

  if (!bom.ok && bom.code === "unsupported_cross_node_tp") {
    return {
      ok: false,
      stage: "topology_tp",
      code: "unsupported_cross_node_tp",
      reason: bom.reason,
      normalized,
      demand,
      peak,
      sizing: { ...sizing, gpusRequired },
      fit: {
        ...fit,
        status: "unsupported_cross_node_tp",
        qualifiedDeploymentPass: false,
        code: "unsupported_cross_node_tp",
        reason: bom.reason,
      },
      bom,
      comparison: null,
      dealTier: dealTierId,
      pricingIdentity: buildPricingIdentity(manifest, fx),
    };
  }

  // Re-verify cross-node TP against actual resolved server slots
  if (bom.ok && tpDegree > bom.gpusPerNode) {
    const tpReason = `Model requires TP=${tpDegree}, which exceeds ${bom.gpusPerNode} GPU(s) per chosen server node.`;
    return {
      ok: false,
      stage: "topology_tp",
      code: "unsupported_cross_node_tp",
      reason: tpReason,
      normalized,
      demand,
      peak,
      sizing: { ...sizing, gpusRequired },
      fit: {
        ...fit,
        status: "unsupported_cross_node_tp",
        qualifiedDeploymentPass: false,
        code: "unsupported_cross_node_tp",
        reason: tpReason,
      },
      bom,
      comparison: null,
      dealTier: dealTierId,
      pricingIdentity: buildPricingIdentity(manifest, fx),
    };
  }

  if (!bom.ok) {
    return {
      ok: false,
      stage: "hardware_bom",
      code: bom.code,
      reason: bom.reason,
      normalized,
      demand,
      peak,
      sizing: { ...sizing, gpusRequired },
      fit,
      bom,
      comparison: null,
      dealTier: dealTierId,
      pricingIdentity: buildPricingIdentity(manifest, fx),
    };
  }

  if (normalized.apiOfferId && !catalog?.offers?.[normalized.apiOfferId]) {
    return {
      ok: false,
      stage: "api_offer",
      code: "unknown_api_offer",
      reason: `Selected Model API offer "${normalized.apiOfferId}" is unavailable in the current catalog. Reselect an active API model.`,
      unresolvedApiOfferId: normalized.apiOfferId,
      normalized,
      demand,
      peak,
      sizing: { ...sizing, gpusRequired },
      fit,
      bom,
      comparison: null,
      dealTier: dealTierId,
      pricingIdentity: buildPricingIdentity(manifest, fx),
    };
  }

  const usdPerKwh = ratStr(toUSD(normalized.electricityThbPerKwh, fx));
  let powerPlan = null;
  let powerGap = null;
  try {
    powerPlan = runningCost({
      gpuId: normalized.gpuId,
      gpusProvisioned: bom.installedGpus,
      pue: normalized.pue,
      usdPerKwh,
      nodeOverheadFraction: normalized.nodeOverheadFraction,
    });
  } catch (err) {
    if (!(err instanceof PowerRefusal)) throw err;
    powerGap = err.message;
  }

  // Annual LightOps / support fee converted into monthly self-hosted opex only if explicitly entered
  const annualOpsUsd = toRat(moneyToUsdExact(normalized.annualOpsFee, fx));
  const monthlyOpsUsd = annualOpsUsd.div(Rat.from(12n));
  const powerMonthlyUsd = powerPlan ? toRat(powerPlan.monthly_usd) : null;
  const totalFixedMonthlyUsd = powerMonthlyUsd !== null ? ratStr(powerMonthlyUsd.add(monthlyOpsUsd)) : null;

  const demandTokens = Math.round(Number(demand.tokens_mo.text));
  const requestCount = Math.round(Number(demand.turns_mo.text));
  const inTok = Number(demand.in_tokens_mo.text);
  const cachedTok = Number(demand.cached_tokens_mo.text);
  const outTok = Number(demand.out_tokens_mo.text);

  const fleetTokensS = bom.installedGpus * Number(sizing.tokens_s_per_gpu.text);
  const derivedBudget = Math.round(fleetTokensS * 3600 * 730);

  const resolvedApiOfferId = pickComparableApiOffer(catalog, manifest, normalized.apiOfferId);

  // Rented GPU baseline from first-party provider row if available, using the identical resolved model spec
  const rentRows = gpuPricing?.rows ?? [];
  const rentIndex = Math.max(0, rentRows.findIndex((r) => r.confidence === "first_party"));
  const rentRow = rentRows[rentIndex] ?? rentRows[0] ?? null;
  const resolvedModel = fit.resolvedModel;
  let rentSizing = null;
  if (rentRow && resolvedModel) {
    try {
      const rAcc = servingData?.accelerators?.[rentRow.gpu_id];
      const rVram = gpuPricing?.gpus?.[rentRow.gpu_id]?.vram_gb;
      const rServing = (rAcc && rVram !== undefined)
        ? servingPlan({
          model: resolvedModel,
          contextTokens: String(normalized.effectiveContextTokens),
          bytesPerParam: servingData.weight_quantization[normalized.wquant].bytes_per_param,
          kvBytesPerElement: resolvedModel.kv_override
            ? "1"
            : servingData.kv_quantization[normalized.kvquant].bytes_per_element,
          vramGb: String(rVram),
          bandwidthGbS: rAcc.bandwidth_gb_s,
          runtimeEfficiency: servingData.runtimes[normalized.runtime].bandwidth_efficiency,
          tpEfficiency: servingData.tensor_parallel.efficiency_per_extra_gpu,
          vramOverheadFraction: servingData.vram_overhead_fraction.value,
          perStreamFloorTokS: normalized.tokensPerSecondPerStream,
        })
        : null;
      rentSizing = gpusForLoad({
        peakTokensPerSecond: peak.peak_tokens_s.text,
        gpuId: rentRow.gpu_id,
        serving: rServing,
      });
    } catch {
      rentSizing = null;
    }
  }
  const rentGpus = rentSizing ? Math.max(1, Number(rentSizing.gpus_required.text)) : 0;
  const rentedHours = rentSizing ? Dec.from("0.7").mul(BigInt(rentGpus * 730)).toString() : null;

  // Optional platform subscription — fail closed if an explicitly selected subscription cannot be priced
  let subPlan = null;
  if (normalized.subscriptionId && normalized.subscriptionId !== "none") {
    const subRow = (subscriptions?.rows ?? []).find((r) => r.id === normalized.subscriptionId);
    if (!subRow) {
      return {
        ok: false,
        stage: "subscription",
        code: "unknown_subscription",
        reason: `Platform subscription "${normalized.subscriptionId}" is unavailable in subscription-pricing.json.`,
        normalized,
        demand,
        peak,
        sizing: { ...sizing, gpusRequired },
        fit,
        bom,
        comparison: null,
        dealTier: dealTierId,
        pricingIdentity: buildPricingIdentity(manifest, fx),
      };
    }
    const ownedQty = {
      gpus: bom.installedGpus,
      gpuVramGb: gpuPricing?.gpus?.[normalized.gpuId]?.vram_gb ?? null,
      nodes: bom.nodes,
    };
    const rentedQty = rentSizing
      ? { gpus: rentGpus, gpuVramGb: gpuPricing?.gpus?.[rentRow.gpu_id]?.vram_gb ?? null, gpuHours: rentedHours }
      : null;
    const perOption = { A: ownedQty, B: {}, C: rentedQty };
    const byOption = {};
    let primary = null;
    try {
      for (const k of Array.isArray(subRow.applies_to) ? subRow.applies_to : []) {
        if (!perOption[k]) continue;
        const c = subscriptionCost({
          row: subRow,
          priceOverride: null,
          term: normalized.subscriptionTerm || (subRow.default_term ?? null),
          quantityInputs: { gpuHours: null, nodes: null, vcpus: null, ...perOption[k], users: normalized.users },
        });
        byOption[k] = { quantity: c.quantity, quantity_exact: c.quantity_exact, monthly: c.monthly, one_time: c.one_time };
        if (!primary) primary = c;
      }
    } catch (err) {
      if (!(err instanceof SubscriptionRefusal)) throw err;
      return {
        ok: false,
        stage: "subscription",
        code: err.code ?? "unpriced_subscription",
        reason: `Platform licence is not priced: ${err.message}`,
        normalized,
        demand,
        peak,
        sizing: { ...sizing, gpusRequired },
        fit,
        bom,
        comparison: null,
        dealTier: dealTierId,
        pricingIdentity: buildPricingIdentity(manifest, fx),
      };
    }
    if (!primary) {
      return {
        ok: false,
        stage: "subscription",
        code: "subscription_no_applicable_option",
        reason: `Platform licence "${subRow.label ?? subRow.id}" applies to no priced option in this comparison.`,
        normalized,
        demand,
        peak,
        sizing: { ...sizing, gpusRequired },
        fit,
        bom,
        comparison: null,
        dealTier: dealTierId,
        pricingIdentity: buildPricingIdentity(manifest, fx),
      };
    }
    subPlan = { ...primary, by_option: byOption };
  }

  // Separate hardware capex from one-time fees:
  // A gets commonImpl + localImpl; B gets commonImpl + apiImpl; C gets commonImpl.
  const commonUsd = toRat(moneyToUsdExact(normalized.commonImplFee, fx));
  const localImplUsd = toRat(moneyToUsdExact(normalized.localImplFee, fx));
  const apiImplUsd = toRat(moneyToUsdExact(normalized.apiImplFee, fx));

  const oneTime = {
    A: ratStr(commonUsd.add(localImplUsd)),
    B: ratStr(commonUsd.add(apiImplUsd)),
    C: ratStr(commonUsd),
  };

  const scenarioInputs = {
    workload: {
      demand_tokens_mo: demandTokens,
      request_count_mo: requestCount,
      prompt_tokens: requestCount > 0 ? Math.round(inTok / requestCount) : 0,
      output_tokens: requestCount > 0 ? Math.round(outTok / requestCount) : 0,
      cache_read_tokens_per_req: requestCount > 0 ? Math.round(cachedTok / requestCount) : 0,
      horizon_months: normalized.horizonMonths,
      required_p95_tok_s: null,
      quote_utc: Date.parse(normalized.quoteUtc),
      now: nowMs,
      time_buckets: demandTokens > 0 ? [{ hours: 730, tokens: demandTokens }] : null,
    },
    catalog: catalog ?? { offers: {} },
    laneA: {
      enabled: totalFixedMonthlyUsd !== null,
      fixed_monthly: totalFixedMonthlyUsd ?? "0",
      capex: bom.capexUsd,
      monthly_token_budget: derivedBudget,
      tokens_s_ceiling: Math.round(fleetTokensS),
      hardware_topology: `${bom.installedGpus}x ${normalized.gpuId} (${bom.nodes} node${bom.nodes === 1 ? "" : "s"})`,
    },
    laneB: {
      enabled: Boolean(resolvedApiOfferId),
      offer_ids: resolvedApiOfferId ? [resolvedApiOfferId] : [],
    },
    laneC: {
      enabled: Boolean(rentSizing),
      tokens_s: rentSizing ? Math.round(rentGpus * Number(rentSizing.tokens_s_per_gpu.text)) : 0,
      hourly_rate: rentSizing ? Dec.from(String(rentRow.gpu_hourly_usd)).mul(BigInt(rentGpus)).toString() : "0",
      utilization: "0.7",
      hardware_topology: rentSizing ? `${rentGpus}x ${rentRow.gpu_label} @ ${rentRow.provider_label}` : null,
    },
    routing: {
      policy: "local_first",
      advisory_blend: { local_pct: 70 },
      failover: { share: "0", rate_multiplier: "2" },
    },
    overlay: { fully_loaded: false, components: [] },
    subscription: subPlan,
    oneTime,
  };

  const comparison = runComparison(scenarioInputs);

  return {
    ok: true,
    stage: "complete",
    normalized,
    demand,
    peak,
    sizing: {
      ...sizing,
      gpusRequired,
    },
    fit,
    bom,
    powerPlan,
    powerGap,
    monthlyOpsUsd: ratStr(monthlyOpsUsd),
    resolvedApiOfferId,
    rentIndex,
    rentRow,
    scenarioInputs,
    comparison,
    dealTier: dealTierId,
    dealTierMeta: DEAL_TIERS[dealTierId],
    pricingIdentity: buildPricingIdentity(manifest, fx),
    fx,
  };
}

const PREFERRED_ENTERPRISE_GPUS = Object.freeze([
  "rtx_pro_6000_ws",
  "rtx_pro_6000_se",
  "l40s",
  "h100",
  "h200",
  "b200",
]);

export function evaluateGpuCandidates({ input, data, nowMs = 1788220800000 }) {
  const normalized = input?.schema === SIZER_SCHEMA ? input : normalizeSizerInput(input);
  const accMap = data?.servingData?.accelerators ?? {};
  const gpuMap = data?.gpuPricing?.gpus ?? {};
  const serverRows = data?.serverPricing?.rows ?? [];
  const serverGpuSet = new Set(serverRows.map((r) => r.gpu_id));

  const orderedIds = [
    ...PREFERRED_ENTERPRISE_GPUS.filter((id) => accMap[id] && gpuMap[id]),
    ...Object.keys(accMap).filter((id) => !PREFERRED_ENTERPRISE_GPUS.includes(id) && gpuMap[id] && serverGpuSet.has(id)),
  ];

  return orderedIds.map((gpuId) => {
    const gpuMeta = gpuMap[gpuId] ?? {};
    const accMeta = accMap[gpuId] ?? {};
    // Evaluate each candidate in automatic catalog topology without copying manual node pins or custom quotes from another GPU.
    const candidateInput = normalizeSizerInput({
      ...normalized,
      gpuId,
      quoteBasis: "catalog",
      serverId: "",
      nodes: null,
      gpusPerNode: null,
      integratedNodePrice: { amount: "0", currency: normalized.quoteCurrency },
      chassisNodePrice: { amount: "0", currency: normalized.quoteCurrency },
      gpuUnitPrice: { amount: "0", currency: normalized.quoteCurrency },
      fleetTotalPrice: { amount: "0", currency: normalized.quoteCurrency },
    });
    const res = computeSizer({ input: candidateInput, data, nowMs });
    if (res.ok) {
      return {
        gpuId,
        label: gpuMeta.label ?? gpuId,
        vramGb: gpuMeta.vram_gb ?? null,
        bandwidthGbS: accMeta.bandwidth_gb_s ?? null,
        isSelected: gpuId === normalized.gpuId,
        feasible: true,
        priced: true,
        status: res.fit.status,
        tpDegree: Number(res.fit.serving.gpus_per_replica),
        gpusRequired: res.sizing.gpusRequired,
        installedGpus: res.bom.installedGpus,
        nodes: res.bom.nodes,
        gpusPerNode: res.bom.gpusPerNode,
        serverId: res.bom.serverId,
        serverLabel: res.bom.serverRow?.label ?? res.bom.serverId,
        tokensPerSecPerGpu: res.sizing.tokens_s_per_gpu.text,
        capexUsd: res.bom.capexUsd,
        capexThb: res.bom.capexThb,
        paybackMonths: res.comparison?.payback?.vs_model_api?.months ?? null,
        warnings: res.fit.warnings ?? [],
        reason: null,
      };
    }
    if (res.stage === "hardware_bom" && res.bom?.code === "no_catalog_server" && res.fit?.serving && res.sizing) {
      return {
        gpuId,
        label: gpuMeta.label ?? gpuId,
        vramGb: gpuMeta.vram_gb ?? null,
        bandwidthGbS: accMeta.bandwidth_gb_s ?? null,
        isSelected: gpuId === normalized.gpuId,
        feasible: true,
        priced: false,
        status: "memory_fit_unpriced",
        tpDegree: Number(res.fit.serving.gpus_per_replica),
        gpusRequired: res.sizing.gpusRequired,
        installedGpus: res.sizing.gpusRequired,
        nodes: null,
        gpusPerNode: null,
        serverId: "",
        serverLabel: null,
        tokensPerSecPerGpu: res.sizing.tokens_s_per_gpu.text,
        capexUsd: null,
        capexThb: null,
        paybackMonths: null,
        warnings: res.fit.warnings ?? [],
        reason: res.bom.reason,
      };
    }
    return {
      gpuId,
      label: gpuMeta.label ?? gpuId,
      vramGb: gpuMeta.vram_gb ?? null,
      bandwidthGbS: accMeta.bandwidth_gb_s ?? null,
      isSelected: gpuId === normalized.gpuId,
      feasible: false,
      priced: false,
      status: res.fit?.status ?? "refused",
      code: res.code ?? res.fit?.code ?? res.bom?.code ?? "unavailable",
      tpDegree: res.fit?.serving ? Number(res.fit.serving.gpus_per_replica) : null,
      gpusRequired: res.sizing?.gpusRequired ?? null,
      installedGpus: null,
      nodes: null,
      gpusPerNode: null,
      serverId: "",
      serverLabel: null,
      tokensPerSecPerGpu: null,
      capexUsd: null,
      capexThb: null,
      paybackMonths: null,
      warnings: res.fit?.warnings ?? [],
      reason: res.reason ?? res.fit?.reason ?? res.bom?.reason ?? "Unavailable for this model/workload.",
    };
  });
}

// UTF-8 safe base64url helpers for browser + Node ESM.
function toBase64Url(jsonText) {
  const bytes = new TextEncoder().encode(jsonText);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === "function"
    ? btoa(binary)
    : globalThis.Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(encoded) {
  if (typeof encoded !== "string" || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new SizerValidationError("bad_base64url", "Malformed base64url transfer token");
  }
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((encoded.length + 3) % 4);
  let bytes;
  try {
    if (typeof atob === "function") {
      const binary = atob(padded);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    } else {
      bytes = new Uint8Array(globalThis.Buffer.from(padded, "base64"));
    }
  } catch {
    throw new SizerValidationError("bad_base64url", "Unable to decode base64url transfer token");
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

// Exact 44 legacy v1 required keys — never expand unconditionally so existing #sizer=v1 tokens remain valid.
const COMPACT_RECORD_KEYS = new Set([
  "v", "w", "dm", "cn", "dt", "u", "sd", "wd", "pf", "ts", "mx",
  "tb", "tf", "rp", "ro", "rc", "m", "wq", "kq", "rt", "g",
  "qb", "qc", "sv", "sb", "nd", "gn",
  "pIn", "pCh", "pGp", "pFl", "fLo", "fAp", "fCm", "fOp",
  "ek", "pu", "no", "hz", "ao", "sub", "st", "qu", "pi",
]);

// Optional v1 extension keys for custom model parameter/cache/context overrides.
// Forward compatibility of newly extended custom tokens on older deployments is not promised.
const COMPACT_OPTIONAL_KEYS = new Set(["cp", "ca", "ck", "cm"]);

export function encodeSizerFragment(normalized, { pricingIdentity = null, resolvedApiOfferId = null } = {}) {
  const n = normalized?.schema === SIZER_SCHEMA ? normalized : normalizeSizerInput(normalized);
  if (
    n.modelId === "custom"
    && !n.legacyCustomAssumed
    && (
      n.customParamsB === null
      || n.customActiveParamsB === null
      || n.customKvBytesBf16 === null
      || n.customContextMax === null
    )
  ) {
    throw new SizerValidationError(
      "incomplete_custom_model",
      "Custom model requires total parameters (B), active parameters (B), BF16 KV bytes/token, and max context window before sharing or saving.",
    );
  }
  const compact = {
    v: 1,
    w: n.workloadId,
    dm: n.deploymentMode,
    cn: n.connectors,
    dt: n.dealTierOverride,
    u: n.users,
    sd: n.sessionsPerUserDay,
    wd: n.workingDaysMo,
    pf: n.peakConcurrencyFraction,
    ts: n.tokensPerSecondPerStream,
    mx: n.mix,
    tb: n.tokenBasis,
    tf: n.thaiFertilityMultiplier,
    rp: n.rawPromptTokens,
    ro: n.rawOutputTokens,
    rc: n.rawContextTokens,
    m: n.modelId,
    wq: n.wquant,
    kq: n.kvquant,
    rt: n.runtime,
    g: n.gpuId,
    qb: n.quoteBasis,
    qc: n.quoteCurrency,
    sv: n.serverId,
    sb: n.serverPriceBasis,
    nd: n.nodes,
    gn: n.gpusPerNode,
    pIn: n.integratedNodePrice,
    pCh: n.chassisNodePrice,
    pGp: n.gpuUnitPrice,
    pFl: n.fleetTotalPrice,
    fLo: n.localImplFee,
    fAp: n.apiImplFee,
    fCm: n.commonImplFee,
    fOp: n.annualOpsFee,
    ek: n.electricityThbPerKwh,
    pu: n.pue,
    no: n.nodeOverheadFraction,
    hz: n.horizonMonths,
    ao: resolvedApiOfferId || n.apiOfferId,
    sub: n.subscriptionId,
    st: n.subscriptionTerm,
    qu: n.quoteUtc,
    pi: pricingIdentity ?? n.pricingIdentity,
  };
  if (
    n.customParamsB !== null
    || n.customActiveParamsB !== null
    || n.customKvBytesBf16 !== null
    || n.customContextMax !== null
  ) {
    compact.cp = n.customParamsB;
    compact.ca = n.customActiveParamsB;
    compact.ck = n.customKvBytesBf16;
    compact.cm = n.customContextMax;
  }
  const token = toBase64Url(JSON.stringify(compact));
  const fragment = `${SIZER_FRAGMENT_PREFIX}${token}`;
  if (fragment.length > MAX_FRAGMENT_CHARS) {
    throw new SizerValidationError("fragment_too_large", "Encoded scenario exceeds the 8 KiB URL fragment budget; export JSON instead.");
  }
  return fragment;
}

const VALID_WQUANTS = new Set(["bf16", "fp8", "int8", "int4"]);
const VALID_KVQUANTS = new Set(["bf16", "fp8", "int8"]);
const VALID_RUNTIMES = new Set(["vllm", "sglang", "trtllm", "llamacpp"]);
const VALID_SERVER_BASES = new Set(["usd_low", "usd_typical", "usd_high"]);

function requireNonEmptyWireString(val, fieldName) {
  if (typeof val !== "string" || val.trim().length === 0 || val !== val.trim()) {
    throw new SizerValidationError("bad_string", `${fieldName} must be a non-empty trimmed string`);
  }
  return val;
}

function validateWireMoneyObject(entry, fieldName) {
  if (!isPlainObject(entry)) {
    throw new SizerValidationError("bad_money", `${fieldName} must be a plain {amount, currency} object`);
  }
  const keys = Object.keys(entry);
  if (keys.length !== 2 || !("amount" in entry) || !("currency" in entry)) {
    throw new SizerValidationError("bad_money", `${fieldName} must contain only amount and currency`);
  }
  if (typeof entry.amount !== "string" || !/^\d+(?:\.\d+)?$/.test(entry.amount)) {
    throw new SizerValidationError("bad_money", `${fieldName}.amount must be a non-negative decimal string`);
  }
  if (typeof entry.currency !== "string" || !CURRENCIES.has(entry.currency)) {
    throw new SizerValidationError("bad_currency", `${fieldName}.currency must be THB or USD`);
  }
  cleanMoneyEntry(entry, fieldName, entry.currency);
}

function validateSizerWirePayload(parsed) {
  for (const reqKey of COMPACT_RECORD_KEYS) {
    if (!(reqKey in parsed)) {
      throw new SizerValidationError("missing_key", `Missing required key "${reqKey}" in sizer transfer payload.`);
    }
  }
  const validWorkloadIds = new Set(LOCAL_AI_WORKLOADS.map((w) => w.id));
  const validConnectorIds = new Set(PIPELINE_CONNECTORS.map((c) => c.id));
  const validWorkloadTypes = new Set(WORKLOAD_TYPES);

  if (typeof parsed.w !== "string" || !validWorkloadIds.has(parsed.w)) {
    throw new SizerValidationError("bad_workload", `Unsupported workload "${parsed.w}"`);
  }
  if (parsed.dm !== "greenfield" && parsed.dm !== "brownfield") {
    throw new SizerValidationError("bad_deployment_mode", `Unsupported deployment mode "${parsed.dm}"`);
  }
  if (!Array.isArray(parsed.cn) || !parsed.cn.every((id) => typeof id === "string" && validConnectorIds.has(id))) {
    throw new SizerValidationError("bad_connectors", "connectors must be an array of supported pipeline connector IDs");
  }
  if (parsed.dt !== null && (typeof parsed.dt !== "string" || !Object.hasOwn(DEAL_TIERS, parsed.dt))) {
    throw new SizerValidationError("bad_deal_tier", `Unsupported deal tier "${parsed.dt}"`);
  }

  if (typeof parsed.u !== "number") throw new SizerValidationError("bad_integer", "users must be a number");
  posInt(parsed.u, "users", { min: 1, max: 10000000 });
  if (typeof parsed.wd !== "number") throw new SizerValidationError("bad_integer", "workingDaysMo must be a number");
  posInt(parsed.wd, "workingDaysMo", { min: 1, max: 31 });
  if (typeof parsed.rp !== "number") throw new SizerValidationError("bad_integer", "rawPromptTokens must be a number");
  posInt(parsed.rp, "rawPromptTokens", { min: 16, max: 2000000 });
  if (typeof parsed.ro !== "number") throw new SizerValidationError("bad_integer", "rawOutputTokens must be a number");
  posInt(parsed.ro, "rawOutputTokens", { min: 1, max: 500000 });
  if (typeof parsed.rc !== "number") throw new SizerValidationError("bad_integer", "rawContextTokens must be a number");
  posInt(parsed.rc, "rawContextTokens", { min: 128, max: 10000000 });
  if (typeof parsed.hz !== "number") throw new SizerValidationError("bad_integer", "horizonMonths must be a number");
  posInt(parsed.hz, "horizonMonths", { min: 1, max: 120 });

  if (parsed.nd !== null) {
    if (typeof parsed.nd !== "number") throw new SizerValidationError("bad_integer", "nodes must be null or a number");
    posInt(parsed.nd, "nodes", { min: 1, max: 10000 });
  }
  if (parsed.gn !== null) {
    if (typeof parsed.gn !== "number") throw new SizerValidationError("bad_integer", "gpusPerNode must be null or a number");
    posInt(parsed.gn, "gpusPerNode", { min: 1, max: 64 });
  }

  for (const [k, label, opts] of [
    ["sd", "sessionsPerUserDay", { min: "0.01", max: "100000", allowZero: false }],
    ["pf", "peakConcurrencyFraction", { min: "0.001", max: "1", allowZero: false }],
    ["ts", "tokensPerSecondPerStream", { min: "1", max: "10000", allowZero: false }],
    ["tf", "thaiFertilityMultiplier", { min: "1.0", max: "3.0", allowZero: false }],
    ["ek", "electricityThbPerKwh", { min: "0", max: "100" }],
    ["pu", "pue", { min: "1.0", max: "5.0", allowZero: false }],
    ["no", "nodeOverheadFraction", { min: "0", max: "2" }],
  ]) {
    if (typeof parsed[k] !== "string") throw new SizerValidationError("bad_decimal", `${label} must be a decimal string`);
    decStr(parsed[k], label, opts);
  }

  if (!isPlainObject(parsed.mx)) {
    throw new SizerValidationError("bad_mix", "mix must be a plain object");
  }
  const mxKeys = Object.keys(parsed.mx);
  if (mxKeys.length !== WORKLOAD_TYPES.length || !mxKeys.every((k) => validWorkloadTypes.has(k) && typeof parsed.mx[k] === "string")) {
    throw new SizerValidationError("bad_mix", "mix must contain exact workload keys with decimal string values");
  }

  if (typeof parsed.tb !== "string" || !TOKEN_BASES.has(parsed.tb)) {
    throw new SizerValidationError("bad_token_basis", `Unsupported token basis "${parsed.tb}"`);
  }
  requireNonEmptyWireString(parsed.m, "modelId");
  requireNonEmptyWireString(parsed.g, "gpuId");

  // Validate optional custom model extensions when present
  let cpStr = null;
  let caStr = null;
  let ckNum = null;
  let cmNum = null;
  if ("cp" in parsed && parsed.cp !== null) {
    if (typeof parsed.cp !== "string") throw new SizerValidationError("bad_decimal", "cp (customParamsB) must be null or a decimal string");
    cpStr = decStr(parsed.cp, "customParamsB", { min: "0.1", max: "10000", allowZero: false });
  }
  if ("ca" in parsed && parsed.ca !== null) {
    if (typeof parsed.ca !== "string") throw new SizerValidationError("bad_decimal", "ca (customActiveParamsB) must be null or a decimal string");
    caStr = decStr(parsed.ca, "customActiveParamsB", { min: "0.1", max: "10000", allowZero: false });
  }
  if ("ck" in parsed && parsed.ck !== null) {
    if (typeof parsed.ck !== "number") throw new SizerValidationError("bad_integer", "ck (customKvBytesBf16) must be null or an integer");
    ckNum = posInt(parsed.ck, "customKvBytesBf16", { min: 2, max: 100000000 });
  }
  if ("cm" in parsed && parsed.cm !== null) {
    if (typeof parsed.cm !== "number") throw new SizerValidationError("bad_integer", "cm (customContextMax) must be null or an integer");
    cmNum = posInt(parsed.cm, "customContextMax", { min: 128, max: 10000000 });
  }
  if (cpStr !== null && caStr !== null && Dec.from(caStr).gt(Dec.from(cpStr))) {
    throw new SizerValidationError("bad_custom_params", "customActiveParamsB cannot exceed customParamsB");
  }
  const hasCustomWireKey = ("cp" in parsed) || ("ca" in parsed) || ("ck" in parsed) || ("cm" in parsed);
  if (parsed.m === "custom" && hasCustomWireKey) {
    if (cpStr === null || caStr === null || ckNum === null || cmNum === null) {
      throw new SizerValidationError("incomplete_custom_model", "Custom model wire payload requires complete cp, ca, ck, and cm fields.");
    }
  }

  if (typeof parsed.wq !== "string" || !VALID_WQUANTS.has(parsed.wq)) {
    throw new SizerValidationError("bad_wquant", `Unsupported weight quantization "${parsed.wq}"`);
  }
  if (typeof parsed.kq !== "string" || !VALID_KVQUANTS.has(parsed.kq)) {
    throw new SizerValidationError("bad_kvquant", `Unsupported KV quantization "${parsed.kq}"`);
  }
  if (typeof parsed.rt !== "string" || !VALID_RUNTIMES.has(parsed.rt)) {
    throw new SizerValidationError("bad_runtime", `Unsupported runtime "${parsed.rt}"`);
  }
  if (typeof parsed.qb !== "string" || !QUOTE_BASES.has(parsed.qb)) {
    throw new SizerValidationError("bad_quote_basis", `Unsupported quote basis "${parsed.qb}"`);
  }
  if (typeof parsed.qc !== "string" || !CURRENCIES.has(parsed.qc)) {
    throw new SizerValidationError("bad_currency", `Unsupported quote currency "${parsed.qc}"`);
  }
  if (typeof parsed.sv !== "string") throw new SizerValidationError("bad_string", "serverId must be a string");
  if (typeof parsed.sb !== "string" || !VALID_SERVER_BASES.has(parsed.sb)) {
    throw new SizerValidationError("bad_server_basis", `Unsupported server price basis "${parsed.sb}"`);
  }
  if (typeof parsed.ao !== "string") throw new SizerValidationError("bad_string", "apiOfferId must be a string");
  requireNonEmptyWireString(parsed.sub, "subscriptionId");
  if (typeof parsed.st !== "string") throw new SizerValidationError("bad_string", "subscriptionTerm must be a string");
  if (typeof parsed.qu !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:00:00Z$/.test(parsed.qu)) {
    throw new SizerValidationError("bad_quote_utc", `Invalid quoteUtc "${parsed.qu}"`);
  }
  if (parsed.pi !== null && (typeof parsed.pi !== "string" || parsed.pi.length === 0 || parsed.pi.length > 512)) {
    throw new SizerValidationError("bad_pricing_identity", "Invalid pricingIdentity");
  }

  for (const mk of ["pIn", "pCh", "pGp", "pFl", "fLo", "fAp", "fCm", "fOp"]) {
    validateWireMoneyObject(parsed[mk], mk);
  }
}

export function decodeSizerFragment(hashOrFragment) {
  const rawHash = String(hashOrFragment ?? "").replace(/^#/, "");
  if (!rawHash.startsWith(SIZER_FRAGMENT_PREFIX)) return null;
  if (rawHash.length > MAX_FRAGMENT_CHARS) {
    throw new SizerValidationError("fragment_too_large", "Sizer URL fragment exceeds the 8 KiB safety limit.");
  }
  const encoded = rawHash.slice(SIZER_FRAGMENT_PREFIX.length);
  let parsed;
  try {
    parsed = JSON.parse(fromBase64Url(encoded));
  } catch (err) {
    if (err instanceof SizerValidationError) throw err;
    throw new SizerValidationError("bad_json", "Sizer URL fragment is not valid JSON.");
  }
  if (!isPlainObject(parsed)) {
    throw new SizerValidationError("bad_payload", "Sizer transfer payload must be a plain object.");
  }
  if (parsed.v !== 1) {
    throw new SizerValidationError("unsupported_version", `Unsupported sizer payload version "${parsed.v}".`);
  }
  for (const key of Object.keys(parsed)) {
    if (!COMPACT_RECORD_KEYS.has(key) && !COMPACT_OPTIONAL_KEYS.has(key)) {
      throw new SizerValidationError("unknown_key", `Rejected unknown key "${key}" in sizer transfer payload.`);
    }
  }
  validateSizerWirePayload(parsed);
  return normalizeSizerInput({
    workloadId: parsed.w,
    deploymentMode: parsed.dm,
    connectors: parsed.cn,
    dealTierOverride: parsed.dt,
    users: parsed.u,
    sessionsPerUserDay: parsed.sd,
    workingDaysMo: parsed.wd,
    peakConcurrencyFraction: parsed.pf,
    tokensPerSecondPerStream: parsed.ts,
    mix: parsed.mx,
    tokenBasis: parsed.tb,
    thaiFertilityMultiplier: parsed.tf,
    rawPromptTokens: parsed.rp,
    rawOutputTokens: parsed.ro,
    rawContextTokens: parsed.rc,
    modelId: parsed.m,
    customParamsB: parsed.cp ?? null,
    customActiveParamsB: parsed.ca ?? null,
    customKvBytesBf16: parsed.ck ?? null,
    customContextMax: parsed.cm ?? null,
    legacyCustomAssumed: parsed.m === "custom" && !("cp" in parsed) && !("ca" in parsed) && !("ck" in parsed) && !("cm" in parsed),
    wquant: parsed.wq,
    kvquant: parsed.kq,
    runtime: parsed.rt,
    gpuId: parsed.g,
    quoteBasis: parsed.qb,
    quoteCurrency: parsed.qc,
    serverId: parsed.sv,
    serverPriceBasis: parsed.sb,
    nodes: parsed.nd,
    gpusPerNode: parsed.gn,
    integratedNodePrice: parsed.pIn,
    chassisNodePrice: parsed.pCh,
    gpuUnitPrice: parsed.pGp,
    fleetTotalPrice: parsed.pFl,
    localImplFee: parsed.fLo,
    apiImplFee: parsed.fAp,
    commonImplFee: parsed.fCm,
    annualOpsFee: parsed.fOp,
    electricityThbPerKwh: parsed.ek,
    pue: parsed.pu,
    nodeOverheadFraction: parsed.no,
    horizonMonths: parsed.hz,
    apiOfferId: parsed.ao,
    subscriptionId: parsed.sub,
    subscriptionTerm: parsed.st,
    quoteUtc: parsed.qu,
    pricingIdentity: parsed.pi,
  });
}

// Strict JSON / optional localStorage scenario envelope codec (stores canonical scenarios + display metadata only).
const SAVE_ENVELOPE_KEYS = new Set(["schema", "exportedAt", "scenarios"]);
const SAVE_RECORD_KEYS = new Set(["id", "name", "savedAt", "fragment"]);

function validateSaveTimestamp(val, fieldName) {
  if (typeof val !== "string" || val.length < 10 || val.length > 40 || Number.isNaN(Date.parse(val))) {
    throw new SizerValidationError("bad_save_timestamp", `${fieldName} must be an ISO-8601 timestamp string`);
  }
  return val;
}

function validateSavedScenarioRecord(entry, index) {
  if (!isPlainObject(entry)) {
    throw new SizerValidationError("bad_save_record", `Saved scenario #${index + 1} must be a plain object.`);
  }
  for (const k of Object.keys(entry)) {
    if (!SAVE_RECORD_KEYS.has(k)) {
      throw new SizerValidationError("unknown_save_key", `Rejected unknown key "${k}" in saved scenario #${index + 1}.`);
    }
  }
  for (const req of SAVE_RECORD_KEYS) {
    if (!(req in entry)) {
      throw new SizerValidationError("missing_save_key", `Missing required key "${req}" in saved scenario #${index + 1}.`);
    }
  }
  if (typeof entry.id !== "string" || !/^[A-Za-z0-9_.:-]{1,64}$/.test(entry.id)) {
    throw new SizerValidationError("bad_save_id", `Invalid id in saved scenario #${index + 1}.`);
  }
  const trimmedName = typeof entry.name === "string" ? entry.name.trim() : "";
  if (!trimmedName || trimmedName.length > 80) {
    throw new SizerValidationError("bad_save_name", `Scenario name in #${index + 1} must be 1 to 80 characters.`);
  }
  const savedAt = validateSaveTimestamp(entry.savedAt, `scenarios[${index}].savedAt`);
  if (typeof entry.fragment !== "string") {
    throw new SizerValidationError("bad_save_fragment", `Scenario #${index + 1} fragment must be a string.`);
  }
  const rawFrag = entry.fragment.replace(/^#/, "");
  const normalized = decodeSizerFragment(rawFrag);
  if (!normalized) {
    throw new SizerValidationError("bad_save_fragment", `Scenario #${index + 1} does not contain a valid sizer=v1 fragment.`);
  }
  return {
    id: entry.id,
    name: trimmedName,
    savedAt,
    fragment: rawFrag,
    normalized,
  };
}

export function encodeSizerSaveEnvelope(entries, { exportedAt = "2026-11-17T00:00:00Z", allowEmpty = false } = {}) {
  if (!Array.isArray(entries)) {
    throw new SizerValidationError("bad_save_list", "scenarios must be an array");
  }
  if ((!allowEmpty && entries.length === 0) || entries.length > MAX_SAVED_SCENARIOS) {
    throw new SizerValidationError(
      "save_count_out_of_range",
      `Saved scenario count must be between ${allowEmpty ? 0 : 1} and ${MAX_SAVED_SCENARIOS}.`,
    );
  }
  const validExportedAt = validateSaveTimestamp(exportedAt, "exportedAt");
  const seenIds = new Set();
  const cleanRecords = entries.map((entry, idx) => {
    const valid = validateSavedScenarioRecord(entry, idx);
    if (seenIds.has(valid.id)) {
      throw new SizerValidationError("duplicate_save_id", `Duplicate scenario id "${valid.id}" in save envelope.`);
    }
    seenIds.add(valid.id);
    return {
      id: valid.id,
      name: valid.name,
      savedAt: valid.savedAt,
      fragment: valid.fragment,
    };
  });
  const jsonText = JSON.stringify({
    schema: SIZER_SAVE_SCHEMA,
    exportedAt: validExportedAt,
    scenarios: cleanRecords,
  }, null, 2);
  const byteLength = new TextEncoder().encode(jsonText).byteLength;
  if (byteLength > MAX_SAVE_BYTES) {
    throw new SizerValidationError("save_too_large", `Saved scenarios exceed the 64 KiB budget (${byteLength} bytes).`);
  }
  return jsonText;
}

export function decodeSizerSaveEnvelope(jsonText, { allowEmpty = false } = {}) {
  if (typeof jsonText !== "string") {
    throw new SizerValidationError("bad_save_json", "Save payload must be a UTF-8 JSON string.");
  }
  const byteLength = new TextEncoder().encode(jsonText).byteLength;
  if (byteLength > MAX_SAVE_BYTES) {
    throw new SizerValidationError("save_too_large", `Save file exceeds the 64 KiB safety limit (${byteLength} bytes).`);
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new SizerValidationError("bad_save_json", "Save file is not valid JSON.");
  }
  if (!isPlainObject(parsed)) {
    throw new SizerValidationError("bad_save_envelope", "Save file root must be a plain JSON object.");
  }
  if (parsed.schema !== SIZER_SAVE_SCHEMA) {
    throw new SizerValidationError("unsupported_save_schema", `Unsupported save schema "${parsed.schema}". Expected "${SIZER_SAVE_SCHEMA}".`);
  }
  for (const k of Object.keys(parsed)) {
    if (!SAVE_ENVELOPE_KEYS.has(k)) {
      throw new SizerValidationError("unknown_save_key", `Rejected unknown envelope key "${k}".`);
    }
  }
  for (const req of SAVE_ENVELOPE_KEYS) {
    if (!(req in parsed)) {
      throw new SizerValidationError("missing_save_key", `Missing required envelope key "${req}".`);
    }
  }
  const exportedAt = validateSaveTimestamp(parsed.exportedAt, "exportedAt");
  if (!Array.isArray(parsed.scenarios)) {
    throw new SizerValidationError("bad_save_list", "scenarios must be an array.");
  }
  if ((!allowEmpty && parsed.scenarios.length === 0) || parsed.scenarios.length > MAX_SAVED_SCENARIOS) {
    throw new SizerValidationError(
      "save_count_out_of_range",
      `Save file must contain ${allowEmpty ? 0 : 1} to ${MAX_SAVED_SCENARIOS} scenarios.`,
    );
  }
  // Validate every record before returning anything so a bad record #25 leaves zero partial state.
  const seenIds = new Set();
  const scenarios = parsed.scenarios.map((entry, idx) => {
    const valid = validateSavedScenarioRecord(entry, idx);
    if (seenIds.has(valid.id)) {
      throw new SizerValidationError("duplicate_save_id", `Duplicate scenario id "${valid.id}".`);
    }
    seenIds.add(valid.id);
    return valid;
  });
  return {
    schema: SIZER_SAVE_SCHEMA,
    exportedAt,
    scenarios,
  };
}

// Bounded preset fragment used by campaign links to pre-fill numeric inputs on local-ai-sizer.html.
const PRESET_ALLOWED_KEYS = new Set([
  "v", "workloadId", "deploymentMode", "dealTierOverride", "connectors",
  "users", "modelId", "gpuId", "quoteBasis", "quoteCurrency",
  "nodes", "gpusPerNode", "integratedNodePrice", "fleetTotalPrice",
  "localImplFee", "annualOpsFee",
]);

function validatePresetPayload(rest) {
  const validWorkloadIds = new Set(LOCAL_AI_WORKLOADS.map((w) => w.id));
  const validConnectorIds = new Set(PIPELINE_CONNECTORS.map((c) => c.id));
  const out = {};

  if ("workloadId" in rest) {
    if (typeof rest.workloadId !== "string" || !validWorkloadIds.has(rest.workloadId)) {
      throw new SizerValidationError("bad_workload", `Unsupported preset workloadId "${rest.workloadId}"`);
    }
    out.workloadId = rest.workloadId;
  }
  if ("deploymentMode" in rest) {
    if (rest.deploymentMode !== "greenfield" && rest.deploymentMode !== "brownfield") {
      throw new SizerValidationError("bad_deployment_mode", `Unsupported preset deploymentMode "${rest.deploymentMode}"`);
    }
    out.deploymentMode = rest.deploymentMode;
  }
  if ("dealTierOverride" in rest) {
    if (rest.dealTierOverride !== null && (typeof rest.dealTierOverride !== "string" || !Object.hasOwn(DEAL_TIERS, rest.dealTierOverride))) {
      throw new SizerValidationError("bad_deal_tier", `Unsupported preset dealTierOverride "${rest.dealTierOverride}"`);
    }
    out.dealTierOverride = rest.dealTierOverride;
  }
  if ("connectors" in rest) {
    if (!Array.isArray(rest.connectors) || !rest.connectors.every((id) => typeof id === "string" && validConnectorIds.has(id))) {
      throw new SizerValidationError("bad_connectors", "Preset connectors must be an array of valid connector IDs");
    }
    out.connectors = [...rest.connectors];
  }
  if ("users" in rest) {
    out.users = posInt(rest.users, "users", { min: 1, max: 10000000 });
  }
  if ("modelId" in rest) {
    out.modelId = requireNonEmptyWireString(rest.modelId, "modelId");
  }
  if ("gpuId" in rest) {
    out.gpuId = requireNonEmptyWireString(rest.gpuId, "gpuId");
  }
  if ("quoteBasis" in rest) {
    if (typeof rest.quoteBasis !== "string" || !QUOTE_BASES.has(rest.quoteBasis)) {
      throw new SizerValidationError("bad_quote_basis", `Unsupported preset quoteBasis "${rest.quoteBasis}"`);
    }
    out.quoteBasis = rest.quoteBasis;
  }
  let defaultCur = "THB";
  if ("quoteCurrency" in rest) {
    if (typeof rest.quoteCurrency !== "string" || !CURRENCIES.has(rest.quoteCurrency)) {
      throw new SizerValidationError("bad_currency", `Unsupported preset quoteCurrency "${rest.quoteCurrency}"`);
    }
    out.quoteCurrency = rest.quoteCurrency;
    defaultCur = rest.quoteCurrency;
  }
  if ("nodes" in rest) {
    out.nodes = rest.nodes === null ? null : posInt(rest.nodes, "nodes", { min: 1, max: 10000 });
  }
  if ("gpusPerNode" in rest) {
    out.gpusPerNode = rest.gpusPerNode === null ? null : posInt(rest.gpusPerNode, "gpusPerNode", { min: 1, max: 64 });
  }
  for (const mk of ["integratedNodePrice", "fleetTotalPrice", "localImplFee", "annualOpsFee"]) {
    if (mk in rest) {
      if (rest[mk] === null || rest[mk] === undefined || rest[mk] === "") {
        throw new SizerValidationError("bad_money", `Preset ${mk} cannot be empty`);
      }
      if (typeof rest[mk] === "object") {
        validateWireMoneyObject(rest[mk], mk);
        out[mk] = { ...rest[mk] };
      } else {
        out[mk] = cleanMoneyEntry(rest[mk], mk, defaultCur);
      }
    }
  }
  return out;
}

export function encodePresetFragment(presetObj) {
  if (!isPlainObject(presetObj)) {
    throw new SizerValidationError("bad_preset", "Preset payload must be a plain object");
  }
  const payload = { v: 1, ...presetObj };
  for (const k of Object.keys(payload)) {
    if (!PRESET_ALLOWED_KEYS.has(k)) {
      throw new SizerValidationError("unknown_preset_key", `Unknown preset key "${k}"`);
    }
  }
  const { v: _v, ...rest } = payload;
  validatePresetPayload(rest);
  const frag = `${PRESET_FRAGMENT_PREFIX}${toBase64Url(JSON.stringify(payload))}`;
  if (frag.length > MAX_FRAGMENT_CHARS) {
    throw new SizerValidationError("fragment_too_large", "Preset fragment exceeds 8 KiB");
  }
  return frag;
}

export function decodePresetFragment(hashOrFragment) {
  const rawHash = String(hashOrFragment ?? "").replace(/^#/, "");
  if (!rawHash.startsWith(PRESET_FRAGMENT_PREFIX)) return null;
  if (rawHash.length > MAX_FRAGMENT_CHARS) {
    throw new SizerValidationError("fragment_too_large", "Preset fragment exceeds 8 KiB");
  }
  let parsed;
  try {
    parsed = JSON.parse(fromBase64Url(rawHash.slice(PRESET_FRAGMENT_PREFIX.length)));
  } catch (err) {
    if (err instanceof SizerValidationError) throw err;
    throw new SizerValidationError("bad_json", "Preset URL fragment is not valid JSON.");
  }
  if (!isPlainObject(parsed) || parsed.v !== 1) {
    throw new SizerValidationError("bad_preset", "Unsupported preset fragment");
  }
  for (const k of Object.keys(parsed)) {
    if (!PRESET_ALLOWED_KEYS.has(k)) {
      throw new SizerValidationError("unknown_preset_key", `Unknown preset key "${k}"`);
    }
  }
  const { v: _v, ...rest } = parsed;
  return validatePresetPayload(rest);
}

// Projects a validated normalized sizer record onto tco-calculator.html control values.
export function projectSizerControls({
  normalized,
  beforeControls,
  stateData: { manifest, catalog, fx, gpuPricing, serverPricing, servingData, powerSeed, subscriptions },
}) {
  const result = computeSizer({
    input: normalized,
    data: { manifest, catalog, fx, gpuPricing, serverPricing, servingData, powerSeed, subscriptions },
  });
  if (!result.ok) {
    const detail = result.reason ?? result.fit?.reason ?? result.bom?.reason ?? "Scenario cannot be sized on selected hardware.";
    throw new SizerValidationError(result.code ?? "scenario_not_sizable", detail);
  }

  const model = result.fit?.resolvedModel ?? (servingData?.models ?? []).find((m) => m.id === normalized.modelId);
  if (!model) throw new SizerValidationError("unknown_model", `Local model "${normalized.modelId}" is unavailable.`);

  const offerableGpus = new Set([
    ...(gpuPricing?.rows ?? []).map((r) => r.gpu_id),
    ...(serverPricing?.rows ?? []).map((r) => r.gpu_id),
  ]);
  if (!offerableGpus.has(normalized.gpuId)) {
    throw new SizerValidationError("unknown_gpu", `Accelerator "${normalized.gpuId}" is unavailable.`);
  }

  if (normalized.apiOfferId && !catalog?.offers?.[normalized.apiOfferId]) {
    throw new SizerValidationError("unknown_api_offer", `Selected Model API offer "${normalized.apiOfferId}" is unavailable in the current catalog.`);
  }
  const activeOfferId = result.resolvedApiOfferId;
  if (!activeOfferId || !catalog?.offers?.[activeOfferId]) {
    throw new SizerValidationError("unknown_api_offer", "Selected Model API offer is unavailable in the current catalog.");
  }
  const feedPrefix = activeOfferId.split(":")[0];

  const values = { ...beforeControls };
  for (const id of Object.keys(values)) {
    if (/^f-g\d+-/.test(id)) delete values[id];
  }
  (model.groups ?? []).forEach((g, i) => {
    const fields = { kind: g.kind, layers: g.layers };
    if (g.kind === "mla") Object.assign(fields, { lora: g.kv_lora_rank, rope: g.qk_rope_head_dim });
    else if (g.kind !== "linear") Object.assign(fields, { heads: g.kv_heads, dim: g.head_dim, tensors: g.tensors ?? 2, ...(g.kind === "sliding" ? { window: g.window_tokens } : {}) });
    for (const [k, v] of Object.entries(fields)) values[`f-g${i}-${k}`] = String(v ?? "");
  });

  const pct = (dec) => trimDecimalZeros(formatHalfUp(toRat(dec).mul(Rat.from(100n)), 4));

  Object.assign(values, {
    "f-users": String(normalized.users),
    "f-sessions-day": normalized.sessionsPerUserDay,
    "f-days": String(normalized.workingDaysMo),
    "f-horizon": String(normalized.horizonMonths),
    "f-peak-frac": pct(normalized.peakConcurrencyFraction),
    "f-tps-stream": normalized.tokensPerSecondPerStream,
    "f-p95": "",
    "f-utc": normalized.quoteUtc,
    "f-mix-chat": pct(normalized.mix.chat),
    "f-mix-rag": pct(normalized.mix.rag),
    "f-mix-graphrag": pct(normalized.mix.graph_rag),
    "f-mix-agentic": pct(normalized.mix.agentic),
  });

  const shapes = buildShapesFromNormalized(normalized);
  const mixField = { chat: "chat", rag: "rag", graph_rag: "graphrag", agentic: "agentic" };
  for (const [wt, prefix] of Object.entries(mixField)) {
    values[`f-${prefix}-turns`] = shapes[wt].turns_per_session;
    values[`f-${prefix}-in`] = shapes[wt].in_tokens;
    values[`f-${prefix}-out`] = shapes[wt].out_tokens;
    values[`f-${prefix}-cached`] = shapes[wt].cached_tokens;
  }

  Object.assign(values, {
    "f-sv-model": model.id,
    "f-sv-params": String(model.params_b),
    "f-sv-active": String(model.active_params_b),
    "f-sv-ctx": String(normalized.effectiveContextTokens),
    "f-sv-kvbytes": model.kv_override ? String(model.selected_kv_bytes_per_token) : "",
    "f-sv-wquant": normalized.wquant,
    "f-sv-kvquant": normalized.kvquant,
    "f-sv-runtime": normalized.runtime,
    "f-sv-mode": "interactive",
    "f-sv-maxbatch": "",
    "f-sh-tps-gpu": "",
    "f-sh-gpu": normalized.gpuId,
    "f-srv-basis": normalized.serverPriceBasis,
  });

  if (result.bom.quoteBasis === "catalog") {
    values["f-srv-config"] = result.bom.serverId;
    values["f-sh-count"] = (normalized.nodes !== null || result.bom.installedGpus !== result.sizing.gpusRequired)
      ? String(result.bom.installedGpus)
      : "";
    values["f-sh-nodes"] = "";
    values["f-sh-capex"] = "";
  } else {
    values["f-srv-config"] = "";
    values["f-sh-count"] = String(result.bom.installedGpus);
    values["f-sh-nodes"] = String(result.bom.nodes);
    values["f-sh-capex"] = trimDecimalZeros(formatHalfUp(toRat(result.bom.capexThb), 12));
  }

  // Monthly running cost override only when annual ops/support fee is explicitly included
  const annualOpsThb = toRat(moneyToThbExact(normalized.annualOpsFee, result.fx));
  if (annualOpsThb.sign() > 0 && result.powerPlan) {
    const powerThb = toTHB(result.powerPlan.monthly_usd, result.fx);
    const fixedThb = powerThb.add(annualOpsThb.div(Rat.from(12n)));
    values["f-sh-fixed"] = trimDecimalZeros(formatHalfUp(fixedThb, 12));
  } else {
    values["f-sh-fixed"] = "";
  }

  values["f-sh-budget"] = "";
  values["f-power-pue"] = normalized.pue;
  values["f-power-rate"] = normalized.electricityThbPerKwh;
  values["f-power-overhead"] = pct(normalized.nodeOverheadFraction);

  if (result.rentRow) {
    values["f-rent-provider"] = result.rentRow.provider;
    values["f-rent-gpu"] = String(result.rentIndex);
  }
  values["f-rent-util"] = "70";

  values["fb-feed"] = feedPrefix;
  values["fb-model"] = activeOfferId;
  values["fr-policy"] = "local_first";
  values["fr-blend"] = "70";
  values["fr-failshare"] = "0";
  values["fr-failrate"] = "2";
  values["fo-license"] = "0";
  values["fo-consult"] = "0";

  const toThbField = (entry) => {
    const exactThb = toRat(moneyToThbExact(entry, result.fx));
    return exactThb.isZero() ? "0" : trimDecimalZeros(formatHalfUp(exactThb, 12));
  };
  values["f-onetime-a"] = toThbField(normalized.localImplFee);
  values["f-onetime-b"] = toThbField(normalized.apiImplFee);
  values["f-onetime-c"] = "0";
  values["fo-impl"] = toThbField(normalized.commonImplFee);

  values["f-sub-row"] = normalized.subscriptionId;
  if ("f-sub-term" in values) values["f-sub-term"] = normalized.subscriptionTerm;
  if ("f-sub-price" in values) values["f-sub-price"] = "";

  const currentIdentity = buildPricingIdentity(manifest, result.fx);
  const repriced = Boolean(normalized.pricingIdentity && normalized.pricingIdentity !== currentIdentity);
  const refreshSummary = repriced ? describePricingRefresh(normalized.pricingIdentity, currentIdentity, "en") : null;

  return {
    controls: values,
    groups: model.groups,
    result,
    repriced,
    refreshSummary,
    capturedIdentity: normalized.pricingIdentity,
    currentIdentity,
  };
}

function trimDecimalZeros(str) {
  return String(str).includes(".") ? String(str).replace(/\.?0+$/, "") : String(str);
}
