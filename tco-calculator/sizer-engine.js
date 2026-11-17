// Shared pure sizing, BOM, fit-qualification, and URL-fragment transfer kernel
// for local-ai-sizer.html and tco-calculator.html.
//
// Zero DOM, storage, network, wall-clock-at-import, or private campaign tables.
// Both surfaces run calculator.js:runComparison over the same normalized scenario.

import { Dec, Rat, formatHalfUp, toRat, ratStr } from "./exact.js";
import { normalizeFxDocument, toTHB, toUSD, fxRate } from "./currency.js";
import { buildDemand, peakTokensPerSecond, gpusForLoad, validateMix, DemandRefusal, WORKLOAD_TYPES } from "./demand.js";
import { servingPlan, ServingRefusal } from "./serving.js";
import { nodesForFleet, cheapestConfigFor, serversForGpu, CapexRefusal } from "./capex.js?v=20260906-ux3";
import { subscriptionCost, SubscriptionRefusal } from "./subscription.js";
import { configurePowerSeed, runningCost, PowerRefusal } from "./power.js";
import { runComparison } from "./calculator.js?v=20260906-ux3";

export const SIZER_SCHEMA = "factor-io.sizer/1.0.0";
export const SIZER_FRAGMENT_PREFIX = "sizer=v1.";
export const PRESET_FRAGMENT_PREFIX = "preset=v1.";
export const MAX_FRAGMENT_CHARS = 8192;

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

export const LOCAL_AI_WORKLOADS = Object.freeze([
  Object.freeze({
    id: "thai_knowledge_rag",
    recommendedModelId: "qwen3-8-27b",
    recommendedGpuId: "rtx_pro_6000_ws",
    recommendedTier: "M",
    defaultConnectors: ["doc_cdc", "sso_mcp"],
    users: 320,
    sessionsPerUserDay: "5",
    workingDaysMo: "22",
    peakConcurrencyFraction: "0.10",
    tokensPerSecondPerStream: "30",
    mix: { chat: "0.20", rag: "0.70", graph_rag: "0.10", agentic: "0" },
    rawPromptTokens: 3600,
    rawOutputTokens: 500,
    rawContextTokens: 16384,
    en: {
      title: "Thai Enterprise Knowledge & Policy Copilot",
      whyLocal: "Keeps confidential HR, legal, SOP, and engineering PDFs inside corporate network with predictable monthly cost.",
    },
    th: {
      title: "ระบบค้นหาความรู้และระเบียบปฏิบัติภาษาไทย\u2060ภายในองค์กร",
      whyLocal: "ข้อมูลสัญญา\u00A0HR\u00A0และคู่มือวิศวกรรมไม่ออกนอกองค์กร พร้อมควบคุมงบรายเดือนคงที่",
    },
  }),
  Object.freeze({
    id: "thai_doc_line_ops",
    recommendedModelId: "qwen3-8-27b",
    recommendedTier: "M",
    defaultConnectors: ["line_oa", "erp_crm", "doc_cdc"],
    users: 400,
    sessionsPerUserDay: "6",
    workingDaysMo: "30",
    peakConcurrencyFraction: "0.10",
    tokensPerSecondPerStream: "30",
    mix: { chat: "0.35", rag: "0.45", graph_rag: "0", agentic: "0.20" },
    rawPromptTokens: 2400,
    rawOutputTokens: 380,
    rawContextTokens: 16384,
    en: {
      title: "24/7 LINE OA & Thai Fiscal Document Intake",
      whyLocal: "Continuous high-volume Thai tax invoice, slip, and customer ticket triage where per-token cloud bills compound rapidly.",
    },
    th: {
      title: "ระบบรับเอกสารภาษีและดูแลลูกค้าผ่าน\u00A0LINE\u00A0OA\u00A0ตลอด\u00A024\u00A0ชม.",
      whyLocal: "งานตรวจใบกำกับภาษีและตอบลูกค้าต่อเนื่องปริมาณสูง ช่วยลดค่า\u00A0API\u00A0รายโทเคนที่บานปลาย",
    },
  }),
  Object.freeze({
    id: "sql_erp_copilot",
    recommendedModelId: "qwen3-6-35b-a3b",
    recommendedTier: "L",
    defaultConnectors: ["sql_db", "rest_graphql", "erp_crm", "sso_mcp"],
    users: 500,
    sessionsPerUserDay: "5",
    workingDaysMo: "22",
    peakConcurrencyFraction: "0.12",
    tokensPerSecondPerStream: "30",
    mix: { chat: "0.20", rag: "0.45", graph_rag: "0.15", agentic: "0.20" },
    rawPromptTokens: 3200,
    rawOutputTokens: 520,
    rawContextTokens: 32768,
    en: {
      title: "Connected SQL, ERP & Internal API Copilot",
      whyLocal: "Co-locates LLM inference next to private SQL/SAP databases for low-latency tool calls and zero external schema exposure.",
    },
    th: {
      title: "ผู้ช่วยวิเคราะห์ข้อมูลเชื่อม\u00A0SQL, ERP\u00A0และ\u00A0API\u00A0ภายใน",
      whyLocal: "วางโมเดลติดกับฐานข้อมูลภายใน ลดความหน่วงเวลาเรียก\u00A0Tool\u00A0และไม่ต้องส่งโครงสร้าง\u00A0DB\u00A0ออกภายนอก",
    },
  }),
  Object.freeze({
    id: "airgap_sec_audit",
    recommendedModelId: "qwen3-next-80b-a3b",
    recommendedTier: "XL",
    defaultConnectors: ["sql_db", "rest_graphql", "doc_cdc", "sso_mcp"],
    users: 220,
    sessionsPerUserDay: "6",
    workingDaysMo: "22",
    peakConcurrencyFraction: "0.15",
    tokensPerSecondPerStream: "30",
    mix: { chat: "0.15", rag: "0.35", graph_rag: "0.20", agentic: "0.30" },
    rawPromptTokens: 4200,
    rawOutputTokens: 650,
    rawContextTokens: 32768,
    en: {
      title: "Regulated PDPA / BoT Compliance, Code & Log Audit",
      whyLocal: "Meets strict air-gapped or sovereign audit rules where regulated customer logs and source code cannot traverse third-party APIs.",
    },
    th: {
      title: "งานกำกับดูแล\u00A0PDPA\u00A0ตรวจสอบโค้ดและบันทึกความปลอดภัย\u00A0(Air-Gapped)",
      whyLocal: "รองรับเกณฑ์กำกับดูแลที่ห้ามส่งข้อมูลลูกค้า\u00A0Log\u00A0และซอร์สโค้ดออกไปยัง\u00A0Cloud\u00A0API\u00A0ภายนอก",
    },
  }),
]);

// Structural Thai capability guidance (architecture & multilingual tokenizer family only; zero invented benchmark scores).
export const THAI_MODEL_PROFILES = Object.freeze({
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
  "deepseek-v3": {
    tierId: "frontier_reasoning",
    thaiSupport: "broad_multilingual_tokenizer",
    enTier: "Tier 3: Multi-Node Sovereign Reasoning Factory (671B MLA)",
    thTier: "ระดับ\u00A03: โมเดลขนาดใหญ่พิเศษระดับดาต้าเซ็นเตอร์\u00A0(671B\u00A0MLA)",
    enNote: "Requires multi-GPU high-bandwidth fabric; suited only for XL data-center deployments.",
    thNote: "ต้องการคลัสเตอร์ความเร็วสูงหลายโหนด เหมาะสำหรับโครงการระดับ\u00A0XL\u00A0เท่านั้น",
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
  return Boolean(val && typeof val === "object" && !Array.isArray(val) && Object.getPrototypeOf(val) === Object.prototype);
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

export function pickComparableApiOffer(catalog, manifest, preferredOfferId = null) {
  const offers = catalog?.offers ?? {};
  const models = manifest?.models ?? [];
  if (preferredOfferId && offers[preferredOfferId]) return preferredOfferId;
  const activeIds = models
    .filter((m) => !["retired", "quarantined"].includes(m.state) && offers[m.id])
    .map((m) => m.id);
  const pool = activeIds.length ? activeIds : Object.keys(offers);
  return (
    pool.find((id) => id === "openrouter:openai/gpt-4o" || id === "litellm:gpt-4o")
    ?? pool.find((id) => /^openrouter:openai\/gpt-4o(?!-mini)/.test(id))
    ?? pool.find((id) => /^openrouter:anthropic\/claude-sonnet-4(?!.*:batch)/.test(id))
    ?? pool[0]
    ?? ""
  );
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
  const rawPromptTokens = posInt(raw.rawPromptTokens ?? workloadPreset.rawPromptTokens, "rawPromptTokens", { min: 16, max: 2000000 });
  const rawOutputTokens = posInt(raw.rawOutputTokens ?? workloadPreset.rawOutputTokens, "rawOutputTokens", { min: 1, max: 500000 });
  const rawContextTokens = posInt(raw.rawContextTokens ?? workloadPreset.rawContextTokens, "rawContextTokens", { min: 128, max: 10000000 });

  const multRat = tokenBasis === "latin_reference_1_4x" ? toRat(thaiFertilityMultiplier) : Rat.from(1n);
  const ceilMul = (n) => {
    const prod = Rat.from(BigInt(n)).mul(multRat);
    const q = prod.n / prod.d;
    const rem = prod.n % prod.d;
    return Number(rem > 0n ? q + 1n : q);
  };

  const effectivePromptTokens = ceilMul(rawPromptTokens);
  const effectiveOutputTokens = rawOutputTokens;
  const scaledContext = ceilMul(rawContextTokens);
  const effectiveContextTokens = Math.max(scaledContext, effectivePromptTokens + effectiveOutputTokens);

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
  const wquant = String(raw.wquant ?? "fp8").trim();
  const kvquant = String(raw.kvquant ?? "fp8").trim();
  const runtime = String(raw.runtime ?? "vllm").trim();
  const gpuId = String(raw.gpuId ?? "rtx_pro_6000_se").trim();

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
    rawPromptTokens,
    rawOutputTokens,
    rawContextTokens,
    effectivePromptTokens,
    effectiveOutputTokens,
    effectiveContextTokens,
    modelId,
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

export function evaluateModelFit({ normalized, servingData, gpuPricing, effectiveGpusPerNode = null }) {
  const model = (servingData?.models ?? []).find((m) => m.id === normalized.modelId);
  if (!model) {
    return {
      status: "refused",
      arithmeticFit: false,
      qualifiedDeploymentPass: false,
      code: "unknown_model",
      reason: `Model "${normalized.modelId}" is not in serving-models.json.`,
      warnings: [],
      serving: null,
      thaiProfile: null,
    };
  }
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
      thaiProfile: THAI_MODEL_PROFILES[model.id] ?? null,
    };
  }

  let serving;
  try {
    serving = servingPlan({
      model,
      contextTokens: normalized.effectiveContextTokens,
      bytesPerParam: wq.bytes_per_param,
      kvBytesPerElement: kq.bytes_per_element,
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
      thaiProfile: THAI_MODEL_PROFILES[model.id] ?? null,
    };
  }

  const warnings = [];
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
  const baseIn = String(normalized.effectivePromptTokens);
  const baseOut = String(normalized.effectiveOutputTokens);
  return {
    chat: { turns_per_session: "4", in_tokens: baseIn, out_tokens: baseOut, cached_tokens: "0" },
    rag: { turns_per_session: "3", in_tokens: baseIn, out_tokens: baseOut, cached_tokens: "0" },
    graph_rag: { turns_per_session: "2", in_tokens: baseIn, out_tokens: baseOut, cached_tokens: "0" },
    agentic: { turns_per_session: "5", in_tokens: baseIn, out_tokens: baseOut, cached_tokens: "0" },
  };
}

export function computeHardwareBom({ normalized, gpusRequired, serverPricing, fx }) {
  const rows = serversForGpu(normalized.gpuId, serverPricing?.rows ?? []);
  if (normalized.quoteBasis === "catalog") {
    let chosen = rows.find((r) => r.server_id === normalized.serverId) ?? null;
    if (!chosen && rows.length && normalized.gpusPerNode !== null) {
      chosen = rows.find((r) => r.gpu_count === normalized.gpusPerNode) ?? null;
    }
    if (!chosen && rows.length) {
      try {
        const c = cheapestConfigFor({
          gpuId: normalized.gpuId,
          servers: serverPricing?.rows ?? [],
          gpusRequired: Math.max(1, gpusRequired),
          priceBasis: normalized.serverPriceBasis,
        });
        chosen = rows.find((r) => r.server_id === c.best?.server_id) ?? rows[0];
      } catch {
        chosen = rows[0];
      }
    }
    if (!chosen) {
      return {
        ok: false,
        code: "no_catalog_server",
        reason: `No published integrated server price for "${normalized.gpuId}". Choose a custom hardware quote basis.`,
      };
    }
    if (normalized.gpusPerNode !== null && normalized.gpusPerNode !== chosen.gpu_count) {
      return {
        ok: false,
        code: "conflicting_catalog_slots",
        reason: `Catalog server "${chosen.server_id}" installs ${chosen.gpu_count} GPU(s) per node, conflicting with requested ${normalized.gpusPerNode} GPU(s) per node.`,
      };
    }
    try {
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
  const gpusPerNode = normalized.gpusPerNode ?? (rows[0]?.gpu_count ?? Math.min(8, Math.max(1, gpusRequired)));
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
  return `${manifest?.snapshot_digest ?? "local"}|${fxDoc.observed_at}|${rateText}`;
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

  const demand = buildDemand({
    users: String(normalized.users),
    sessionsPerUserDay: normalized.sessionsPerUserDay,
    workingDaysMo: String(normalized.workingDaysMo),
    mix: normalized.mix,
    shapes,
  });

  const peak = peakTokensPerSecond({
    users: String(normalized.users),
    peakConcurrencyFraction: normalized.peakConcurrencyFraction,
    tokensPerSecondPerStream: normalized.tokensPerSecondPerStream,
  });

  const catalogRows = serversForGpu(normalized.gpuId, serverPricing?.rows ?? []);
  const tentativeSlots = normalized.quoteBasis === "catalog"
    ? (catalogRows.find((r) => r.server_id === normalized.serverId)?.gpu_count ?? catalogRows[0]?.gpu_count ?? null)
    : (normalized.gpusPerNode ?? catalogRows[0]?.gpu_count ?? null);

  const fit = evaluateModelFit({
    normalized,
    servingData,
    gpuPricing,
    effectiveGpusPerNode: tentativeSlots,
  });

  if (!fit.arithmeticFit || fit.status === "unsupported_cross_node_tp") {
    return {
      ok: false,
      stage: "model_fit",
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

  const bom = computeHardwareBom({
    normalized,
    gpusRequired,
    serverPricing,
    fx,
  });

  // Re-verify cross-node TP against actual resolved server slots when catalog picked a smaller box
  if (bom.ok && Number(fit.serving.gpus_per_replica) > bom.gpusPerNode) {
    return {
      ok: false,
      stage: "topology_tp",
      normalized,
      demand,
      peak,
      sizing,
      fit: {
        ...fit,
        status: "unsupported_cross_node_tp",
        qualifiedDeploymentPass: false,
        code: "unsupported_cross_node_tp",
        reason: `Model requires TP=${fit.serving.gpus_per_replica}, which exceeds ${bom.gpusPerNode} GPU(s) per chosen server node.`,
      },
      bom,
      comparison: null,
      dealTier: normalized.dealTierOverride ?? recommendDealTier({ users: normalized.users, connectors: normalized.connectors, gpusRequired }),
      pricingIdentity: buildPricingIdentity(manifest, fx),
    };
  }

  const dealTierId = normalized.dealTierOverride ?? recommendDealTier({
    users: normalized.users,
    connectors: normalized.connectors,
    gpusRequired,
  });

  if (!bom.ok) {
    return {
      ok: false,
      stage: "hardware_bom",
      normalized,
      demand,
      peak,
      sizing,
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

  // Rented GPU baseline from first-party provider row if available
  const rentRows = gpuPricing?.rows ?? [];
  const rentIndex = Math.max(0, rentRows.findIndex((r) => r.confidence === "first_party"));
  const rentRow = rentRows[rentIndex] ?? rentRows[0] ?? null;
  let rentSizing = null;
  if (rentRow) {
    try {
      const rAcc = servingData?.accelerators?.[rentRow.gpu_id];
      const rVram = gpuPricing?.gpus?.[rentRow.gpu_id]?.vram_gb;
      const rModel = (servingData?.models ?? []).find((m) => m.id === normalized.modelId);
      const rServing = (rAcc && rVram !== undefined && rModel)
        ? servingPlan({
          model: rModel,
          contextTokens: normalized.effectiveContextTokens,
          bytesPerParam: servingData.weight_quantization[normalized.wquant].bytes_per_param,
          kvBytesPerElement: servingData.kv_quantization[normalized.kvquant].bytes_per_element,
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

  // Optional platform subscription
  let subPlan = null;
  const subRow = (subscriptions?.rows ?? []).find((r) => r.id === normalized.subscriptionId);
  if (subRow && subRow.id !== "none") {
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
    for (const k of subRow.applies_to ?? []) {
      if (!perOption[k]) continue;
      try {
        const c = subscriptionCost({
          row: subRow,
          priceOverride: null,
          term: normalized.subscriptionTerm || (subRow.default_term ?? null),
          quantityInputs: { gpuHours: null, nodes: null, vcpus: null, ...perOption[k], users: normalized.users },
        });
        byOption[k] = { quantity: c.quantity, quantity_exact: c.quantity_exact, monthly: c.monthly, one_time: c.one_time };
        if (!primary) primary = c;
      } catch (err) {
        if (!(err instanceof SubscriptionRefusal)) throw err;
      }
    }
    if (primary) subPlan = { ...primary, by_option: byOption };
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

const COMPACT_RECORD_KEYS = new Set([
  "v", "w", "dm", "cn", "dt", "u", "sd", "wd", "pf", "ts", "mx",
  "tb", "tf", "rp", "ro", "rc", "m", "wq", "kq", "rt", "g",
  "qb", "qc", "sv", "sb", "nd", "gn",
  "pIn", "pCh", "pGp", "pFl", "fLo", "fAp", "fCm", "fOp",
  "ek", "pu", "no", "hz", "ao", "sub", "st", "qu", "pi",
]);

export function encodeSizerFragment(normalized, { pricingIdentity = null, resolvedApiOfferId = null } = {}) {
  const n = normalized?.schema === SIZER_SCHEMA ? normalized : normalizeSizerInput(normalized);
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
  const token = toBase64Url(JSON.stringify(compact));
  const fragment = `${SIZER_FRAGMENT_PREFIX}${token}`;
  if (fragment.length > MAX_FRAGMENT_CHARS) {
    throw new SizerValidationError("fragment_too_large", "Encoded scenario exceeds the 8 KiB URL fragment budget; export JSON instead.");
  }
  return fragment;
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
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype) {
    throw new SizerValidationError("bad_payload", "Sizer transfer payload must be a plain object.");
  }
  if (parsed.v !== 1) {
    throw new SizerValidationError("unsupported_version", `Unsupported sizer payload version "${parsed.v}".`);
  }
  for (const key of Object.keys(parsed)) {
    if (!COMPACT_RECORD_KEYS.has(key)) {
      throw new SizerValidationError("unknown_key", `Rejected unknown key "${key}" in sizer transfer payload.`);
    }
  }
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

// Bounded preset fragment used by campaign links to pre-fill numeric inputs on local-ai-sizer.html.
const PRESET_ALLOWED_KEYS = new Set([
  "v", "workloadId", "deploymentMode", "dealTierOverride", "connectors",
  "users", "modelId", "gpuId", "quoteBasis", "quoteCurrency",
  "nodes", "gpusPerNode", "integratedNodePrice", "fleetTotalPrice",
  "localImplFee", "annualOpsFee",
]);

export function encodePresetFragment(presetObj) {
  const payload = { v: 1, ...presetObj };
  for (const k of Object.keys(payload)) {
    if (!PRESET_ALLOWED_KEYS.has(k)) {
      throw new SizerValidationError("unknown_preset_key", `Unknown preset key "${k}"`);
    }
  }
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
  const parsed = JSON.parse(fromBase64Url(rawHash.slice(PRESET_FRAGMENT_PREFIX.length)));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.v !== 1) {
    throw new SizerValidationError("bad_preset", "Unsupported preset fragment");
  }
  for (const k of Object.keys(parsed)) {
    if (!PRESET_ALLOWED_KEYS.has(k)) {
      throw new SizerValidationError("unknown_preset_key", `Unknown preset key "${k}"`);
    }
  }
  const { v: _v, ...rest } = parsed;
  return rest;
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
    const detail = result.fit?.reason ?? result.bom?.reason ?? "Scenario cannot be sized on selected hardware.";
    throw new SizerValidationError("scenario_not_sizable", detail);
  }

  const model = (servingData?.models ?? []).find((m) => m.id === normalized.modelId);
  if (!model) throw new SizerValidationError("unknown_model", `Local model "${normalized.modelId}" is unavailable.`);

  const offerableGpus = new Set([
    ...(gpuPricing?.rows ?? []).map((r) => r.gpu_id),
    ...(serverPricing?.rows ?? []).map((r) => r.gpu_id),
  ]);
  if (!offerableGpus.has(normalized.gpuId)) {
    throw new SizerValidationError("unknown_gpu", `Accelerator "${normalized.gpuId}" is unavailable.`);
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
    "f-sv-kvbytes": "",
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
    values["f-sh-count"] = result.bom.installedGpus === result.sizing.gpusRequired ? "" : String(result.bom.installedGpus);
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

  return {
    controls: values,
    groups: model.groups,
    result,
    repriced,
    capturedIdentity: normalized.pricingIdentity,
    currentIdentity,
  };
}

function trimDecimalZeros(str) {
  return String(str).includes(".") ? String(str).replace(/\.?0+$/, "") : String(str);
}
