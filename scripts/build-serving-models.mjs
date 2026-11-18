#!/usr/bin/env node
// build-serving-models.mjs — stage 3/3 of the refresh command (SPEC v0.4/v0.5 §6.6.7).
//
// Ranks open-weight language and multimodal-language repos on the Hugging Face Hub,
// compiles mandatory pinned seeds across all four buyer sizing bands first with
// stable rank-independent IDs, verifies revision coherence (`entry.sha`) across
// metadata and `config.json` reads, and derives each survivor's serving shape
// from its own `config.json` + safetensors index.
//
// Refusal invariants:
//   1. Attention shapes outside {full, sliding, linear, mla} throw Skip.
//   2. MoE models whose active parameter count cannot be established throw Skip.
//   3. Mandatory seed failure throws MandatorySeedError so serving-models.json
//      is NEVER overwritten with a partial or broken catalog.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseJSONExact } from "../tco-calculator/exact.js";
import { kvBytesPerToken, kvBytesPerSequence, weightBytes } from "../tco-calculator/serving.js";

const UA = "factor-io-tco-ingestion/1.1 (static-site pricing snapshot; contact admin@factor-io.com)";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_DIR = `${ROOT}tco-calculator/data/`;
const OUT_PATH = `${DATA_DIR}serving-models.json`;
const HUB = "https://huggingface.co";

// Mandatory popular Hugging Face seeds spanning all four sizer bands:
//   <=14B compact/edge, 20B-40B sovereign & finetune (incl. Flint 40B-A2.5B),
//   45B-120B 50B-class & mid-frontier, and 150B+ frontier Flash MoEs.
// Compiled BEFORE optional trending discovery so their IDs never drift with Hub rank
// and any failure aborts publish rather than shipping a silently degraded catalog.
export const MANDATORY_SEEDS = [
  // <=14B Compact & Edge
  { repo: "google/gemma-4-E4B-it", id: "gemma-4-e4b-it" },
  { repo: "Qwen/Qwen3.5-9B", id: "qwen3-5-9b" },
  { repo: "google/gemma-4-12B-it", id: "gemma-4-12b-it" },
  // 20B-40B Sovereign & Finetune Bases
  { repo: "openai/gpt-oss-20b", id: "gpt-oss-20b" },
  { repo: "google/gemma-4-26B-A4B-it", id: "gemma-4-26b-a4b-it" },
  { repo: "Qwen/Qwen3.8-27B", id: "qwen3-8-27b" },
  { repo: "Qwen/Qwen3-Coder-30B-A3B-Instruct", id: "qwen3-coder-30b-a3b-instruct" },
  { repo: "google/gemma-4-31B-it", id: "gemma-4-31b-it" },
  { repo: "Qwen/Qwen3-32B", id: "qwen3-32b" },
  { repo: "Qwen/Qwen3.6-35B-A3B", id: "qwen3-6-35b-a3b" },
  { repo: "RecursiveSI/flint", id: "flint" },
  // 45B-120B 50B-Class & Mid-Frontier
  { repo: "moonshotai/Kimi-Linear-48B-A3B-Instruct", id: "kimi-linear-48b-a3b-instruct" },
  { repo: "nvidia/Llama-3_3-Nemotron-Super-49B-v1_5", id: "llama-3-3-nemotron-super-49b-v1-5" },
  { repo: "openai/gpt-oss-120b", id: "gpt-oss-120b" },
  // 150B+ Frontier Flash MoE
  { repo: "Qwen/Qwen3.8-Flash-Next", id: "qwen3-8-flash-next" },
  { repo: "zai-org/GLM-5.3-Flash", id: "glm-5-3-flash" },
  { repo: "deepseek-ai/DeepSeek-V4.1-Flash-1017", id: "deepseek-v4-1-flash-1017" },
];

// ------------------------------------------------------------------- arguments
const ARGV = process.argv.slice(2);
const has = (name) => ARGV.includes(`--${name}`);
function flag(name, dflt) {
  const hit = ARGV.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.slice(name.length + 3);
}
function intFlag(name, dflt) {
  const raw = flag(name, String(dflt));
  if (!/^\d+$/.test(raw)) throw new Error(`--${name} must be a whole number, got ${JSON.stringify(raw)}`);
  return Number(raw);
}

const DRY_RUN = has("dry-run");
const SORT = flag("sort", "trendingScore");
const KEEP = intFlag("limit", 24);
const POOL = intFlag("candidates", 45);
const MIN_PARAMS_B = flag("min-params-b", "0.5");

// ---------------------------------------------------------------- shape guard
export class ShapeError extends Error {
  constructor(source, expected, observed) {
    super(`${source}: shape assertion failed — expected ${expected}; observed ${observed}`);
    this.name = "ShapeError";
    this.source = source;
  }
}

export class MandatorySeedError extends Error {
  constructor(repoId, reason, cause = null) {
    super(`mandatory seed ${repoId} failed: ${reason}`);
    this.name = "MandatorySeedError";
    this.repoId = repoId;
    this.reason = reason;
    if (cause) this.cause = cause;
  }
}

const describe = (v) => {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `array(${v.length})${v.length ? ` first=${JSON.stringify(v[0]).slice(0, 60)}` : ""}`;
  if (typeof v === "object") return `object keys=[${Object.keys(v).slice(0, 12).join(",")}]`;
  return `${typeof v} ${JSON.stringify(v).slice(0, 80)}`;
};
function mustShape(condition, source, expected, observed) {
  if (!condition) throw new ShapeError(source, expected, describe(observed));
}

export class Skip extends Error {
  constructor(reason, detail = null) {
    super(reason);
    this.name = "Skip";
    this.reason = reason;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------- fetch layer
export class HubHttpError extends Error {
  constructor(url, status) {
    super(`${url} -> HTTP ${status}`);
    this.name = "HubHttpError";
    this.url = url;
    this.status = status;
  }
}

async function defaultFetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new HubHttpError(url, res.status);
  return res.text();
}

// ------------------------------------------------------------ the originals screen
const BASE_MODEL_TAG = /^base_model:(quantized|adapter|merge|finetune):(.+)$/;
const CONVERSION_LIB = new Set(["llama.cpp", "mlx", "Model Optimizer", "peft", "gguf"]);
const ALLOWED_PIPELINE_TAGS = new Set(["text-generation", "image-text-to-text", "any-to-any"]);

const repoOrg = (id) => String(id ?? "").split("/")[0].toLowerCase();
export function derivativeBase(m) {
  const tags = Array.isArray(m?.tags) ? m.tags : [];
  for (const tag of tags) {
    const hit = BASE_MODEL_TAG.exec(tag);
    if (!hit) continue;
    const [, kind, base] = hit;
    if (kind === "finetune" && (repoOrg(m.id) === "" || repoOrg(base) === repoOrg(m.id))) continue;
    return { kind, base, tag };
  }
  return null;
}

export function screen(m) {
  if (!ALLOWED_PIPELINE_TAGS.has(m.pipeline_tag)) {
    return `pipeline_tag is ${JSON.stringify(m.pipeline_tag ?? null)}, not text-generation`;
  }
  const tags = Array.isArray(m.tags) ? m.tags : [];
  if (tags.includes("gguf")) return "GGUF container — a re-upload of another repo's weights";
  const derived = derivativeBase(m);
  if (derived) return `derivative repo (${derived.tag})`;
  if (m.library_name && CONVERSION_LIB.has(m.library_name)) {
    return `library_name ${m.library_name} marks a conversion, not an original`;
  }
  return null;
}

export async function resolveBase(entry, { fetchModel = null, maxHops = 3 } = {}) {
  if (!entry?.id) throw new Skip("base resolution needs a repository id");
  const getModel = fetchModel ?? (async (id) => parseJSONExact(await defaultFetchText(`${HUB}/api/models/${id}`)));
  const seen = new Set([entry.id]);
  const path = [entry.id];
  let current = entry;

  for (let hop = 0; hop < maxHops; hop++) {
    const ref = derivativeBase(current);
    if (!ref) {
      return path.length === 1 ? null : { entry: current, id: current.id, hops: path.length - 1, path };
    }
    if (seen.has(ref.base)) {
      throw new Skip("base_model tags form a cycle", [...path, ref.base].join(" -> "));
    }
    seen.add(ref.base);
    path.push(ref.base);
    current = await getModel(ref.base);
    if (!current || typeof current.id !== "string") {
      throw new Skip(`base repo ${ref.base} returned no model record`);
    }
  }

  return { entry: current, id: current.id, hops: path.length - 1, path, truncated: derivativeBase(current) !== null };
}

// ------------------------------------------------------------- config accessors
function languageConfig(cfg) {
  return cfg && typeof cfg.text_config === "object" && cfg.text_config !== null ? cfg.text_config : cfg;
}

function int(v, label) {
  if (v === null || v === undefined) throw new Skip(`config is missing ${label}`);
  if (typeof v === "number") {
    if (!Number.isInteger(v)) throw new Skip(`config ${label} is not a whole number`, String(v));
    return BigInt(v);
  }
  if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
  throw new Skip(`config ${label} is not a whole number`, describe(v));
}
const intOr = (v, dflt) => (v === null || v === undefined ? dflt : int(v, "value"));

// ------------------------------------------------------------------ layer groups
const KIND_OF_LAYER_TYPE = new Map([
  ["full_attention", "full"],
  ["sliding_attention", "sliding"],
  ["chunked_attention", "sliding"],
  ["linear_attention", "linear"],
  ["mamba", "linear"],
  ["recurrent", "linear"],
  ["deepseek_sparse_attention", "mla"],
  ["full_attention_mla", "mla"],
]);

function attentionShape(lc) {
  const loraRank = lc.kv_lora_rank ?? null;
  const rope = lc.qk_rope_head_dim ?? null;
  if (loraRank !== null) {
    if (rope === null) throw new Skip("kv_lora_rank without qk_rope_head_dim — latent cache width is undeterminable");
    return { mla: true, kv_lora_rank: Number(int(loraRank, "kv_lora_rank")), qk_rope_head_dim: Number(int(rope, "qk_rope_head_dim")) };
  }
  if (rope !== null) throw new Skip("qk_rope_head_dim without kv_lora_rank — not classic MLA, cache width is not derivable from this config");
  const heads = int(lc.num_key_value_heads ?? lc.num_attention_heads, "num_key_value_heads");
  const dim = lc.head_dim !== null && lc.head_dim !== undefined
    ? int(lc.head_dim, "head_dim")
    : int(lc.hidden_size, "hidden_size") / int(lc.num_attention_heads, "num_attention_heads");
  if (dim <= 0n) throw new Skip("head_dim resolves to zero");
  return { mla: false, kv_heads: Number(heads), head_dim: Number(dim) };
}

function deriveCsa2Groups(lc) {
  const totalLayers = Number(int(lc.num_hidden_layers, "num_hidden_layers"));
  const slidingWin = Number(int(lc.sliding_window, "sliding_window"));
  const kvHeads = Number(int(lc.num_key_value_heads ?? 1, "num_key_value_heads"));
  const payloadDim = Number(int(lc.head_dim, "head_dim"));
  const ropeDim = Number(intOr(lc.qk_rope_head_dim, 0n));
  if (totalLayers <= 0 || slidingWin <= 0 || payloadDim <= 0) {
    throw new Skip("CSA2 config has non-positive layer, window or head dimensions");
  }

  // Fixed per-entry metadata: uncompressed RoPE key channels (ropeDim bytes — 32 BF16 dims = 64 B)
  // plus 4-byte index/scale metadata = 68 B/entry on DeepSeek-V4.1-Flash-1017.
  const indexBytesPerEntry = ropeDim + 4;

  const ratioOrder = [];
  const ratioTally = new Map();
  for (const rawIdx of lc.kv_source_layer_ids) {
    const idx = Number(int(rawIdx, "kv_source_layer_ids[]"));
    if (idx < 0 || idx >= lc.compress_ratios.length) {
      throw new Skip(`kv_source_layer_ids index ${idx} is out of bounds for compress_ratios(${lc.compress_ratios.length})`);
    }
    const ratio = Number(int(lc.compress_ratios[idx], `compress_ratios[${idx}]`));
    if (ratio < 1) {
      throw new Skip(`kv_source_layer_ids[${idx}] references non-positive compress_ratio ${ratio}`);
    }
    if (!ratioTally.has(ratio)) {
      ratioTally.set(ratio, 0);
      ratioOrder.push(ratio);
    }
    ratioTally.set(ratio, ratioTally.get(ratio) + 1);
  }

  const groups = [
    {
      kind: "sliding",
      layers: totalLayers,
      kv_heads: kvHeads,
      head_dim: payloadDim + ropeDim,
      tensors: 1,
      window_tokens: slidingWin,
    },
  ];
  for (const ratio of ratioOrder) {
    groups.push({
      kind: "mla",
      layers: ratioTally.get(ratio),
      kv_lora_rank: payloadDim,
      qk_rope_head_dim: 0,
      compress_ratio: ratio,
      index_bytes_per_entry: indexBytesPerEntry,
    });
  }
  return groups;
}

function deriveNemotronNasGroups(lc) {
  const heads = int(lc.num_attention_heads, "num_attention_heads");
  const hidden = int(lc.hidden_size, "hidden_size");
  const headDim = lc.head_dim !== null && lc.head_dim !== undefined
    ? Number(int(lc.head_dim, "head_dim"))
    : Number(hidden / heads);
  if (headDim <= 0) throw new Skip("Nemotron-NAS head_dim resolves to zero");

  const order = [];
  const groupsByKey = new Map();
  for (const blk of lc.block_configs) {
    const attn = blk?.attention;
    if (!attn || attn.no_op === true) continue;
    if (attn.replace_with_linear === true) {
      const key = "linear";
      if (!groupsByKey.has(key)) {
        order.push(key);
        groupsByKey.set(key, { kind: "linear", layers: 0, state_bytes_per_seq: null });
      }
      groupsByKey.get(key).layers += 1;
      continue;
    }
    const inGroup = int(attn.n_heads_in_group, "block_configs.attention.n_heads_in_group");
    if (inGroup <= 0n || heads % inGroup !== 0n) {
      throw new Skip(`Nemotron-NAS n_heads_in_group (${inGroup}) does not divide num_attention_heads (${heads})`);
    }
    const kvHeads = Number(heads / inGroup);
    const win = attn.window_length !== null && attn.window_length !== undefined
      ? Number(int(attn.window_length, "block_configs.attention.window_length"))
      : null;
    const kind = win !== null ? "sliding" : "full";
    const key = `${kind}:${kvHeads}:${headDim}:${win ?? ""}`;
    if (!groupsByKey.has(key)) {
      order.push(key);
      const g = { kind, layers: 0, kv_heads: kvHeads, head_dim: headDim, tensors: 2 };
      if (win !== null) g.window_tokens = win;
      groupsByKey.set(key, g);
    }
    groupsByKey.get(key).layers += 1;
  }

  const out = order.map((k) => groupsByKey.get(k));
  if (!out.length) throw new Skip("Nemotron-NAS block_configs contains no cache-bearing or linear attention blocks");
  return out;
}

function synthesizeLinearAttnLayerTypes(lc) {
  const lac = lc?.linear_attn_config;
  if (!lac || !Array.isArray(lac.kda_layers) || !Array.isArray(lac.full_attn_layers)) return null;
  const total = Number(int(lc.num_hidden_layers, "num_hidden_layers"));
  const all = [...lac.kda_layers, ...lac.full_attn_layers].map((x) => Number(int(x, "linear_attn_config.layer")));
  if (all.length !== total) return null;
  const minIdx = Math.min(...all);
  const offset = minIdx === 1 ? 1 : 0;
  const out = new Array(total).fill(null);
  const fullType = lc.kv_lora_rank !== null && lc.kv_lora_rank !== undefined ? "full_attention_mla" : "full_attention";
  for (const idx of lac.kda_layers) out[Number(idx) - offset] = "linear_attention";
  for (const idx of lac.full_attn_layers) out[Number(idx) - offset] = fullType;
  if (out.some((v) => v === null)) {
    throw new Skip("linear_attn_config layer indices do not partition num_hidden_layers cleanly");
  }
  return out;
}

export function deriveGroups(cfg) {
  const lc = languageConfig(cfg);

  // DeepSeek-V4.1 CSA2 cross-layer compressed latent cache: explicit kv_source_layer_ids
  // + compress_ratios[] + local sliding_window. Older DeepSeek-V4 configs lacking
  // kv_source_layer_ids fall through to attentionShape() and refuse as before.
  if (
    (lc.kv_lora_rank === null || lc.kv_lora_rank === undefined)
    && Array.isArray(lc.kv_source_layer_ids)
    && lc.kv_source_layer_ids.length > 0
    && Array.isArray(lc.compress_ratios)
  ) {
    return deriveCsa2Groups(lc);
  }

  // NVIDIA Nemotron-NAS per-block attention configurations.
  if (Array.isArray(lc.block_configs) && lc.block_configs.length > 0) {
    return deriveNemotronNasGroups(lc);
  }

  const shape = attentionShape(lc);
  const rawLayerTypes = Array.isArray(lc.layer_types) ? lc.layer_types : synthesizeLinearAttnLayerTypes(lc);
  const slidingWindow = lc.sliding_window ?? null;

  const mkGroup = (kind, layers) => {
    if (kind === "linear") return { kind: "linear", layers, state_bytes_per_seq: null };
    if (kind === "mla") {
      if (!shape.mla) throw new Skip("layer_types declares an MLA layer but the config has no kv_lora_rank");
      return { kind: "mla", layers, kv_lora_rank: shape.kv_lora_rank, qk_rope_head_dim: shape.qk_rope_head_dim };
    }
    if (shape.mla) {
      throw new Skip(`layer_types mixes ${kind} attention into an MLA config — per-layer cache width is undeclared`);
    }
    const isGlobalFull = kind === "full";
    const kvHeads = isGlobalFull && lc.num_global_key_value_heads !== null && lc.num_global_key_value_heads !== undefined
      ? Number(int(lc.num_global_key_value_heads, "num_global_key_value_heads"))
      : shape.kv_heads;
    const headDim = isGlobalFull && lc.global_head_dim !== null && lc.global_head_dim !== undefined
      ? Number(int(lc.global_head_dim, "global_head_dim"))
      : shape.head_dim;
    const tensors = isGlobalFull && lc.attention_k_eq_v === true ? 1 : 2;
    const g = { kind, layers, kv_heads: kvHeads, head_dim: headDim, tensors };
    if (kind === "sliding") {
      if (slidingWindow === null) throw new Skip("sliding layers declared but sliding_window is absent");
      g.window_tokens = Number(int(slidingWindow, "sliding_window"));
    }
    return g;
  };

  if (rawLayerTypes) {
    const sharedKvLayers = Number(intOr(lc.num_kv_shared_layers, 0n));
    if (sharedKvLayers < 0 || sharedKvLayers >= rawLayerTypes.length) {
      throw new Skip(`num_kv_shared_layers (${sharedKvLayers}) is out of range for layer_types(${rawLayerTypes.length})`);
    }
    // Gemma-4 top KV-shared layers reuse an earlier layer's KV tensors without allocating new KV.
    const layerTypes = sharedKvLayers > 0
      ? rawLayerTypes.slice(0, rawLayerTypes.length - sharedKvLayers)
      : rawLayerTypes;

    const order = [];
    const tally = new Map();
    for (const t of layerTypes) {
      const kind = KIND_OF_LAYER_TYPE.get(t);
      if (!kind) throw new Skip(`unmapped layer_types value ${JSON.stringify(t)}`, `known: ${[...KIND_OF_LAYER_TYPE.keys()].join(", ")}`);
      if (!tally.has(kind)) { tally.set(kind, 0); order.push(kind); }
      tally.set(kind, tally.get(kind) + 1);
    }
    return order.map((kind) => mkGroup(kind, tally.get(kind)));
  }

  const layers = Number(int(lc.num_hidden_layers, "num_hidden_layers"));
  if (slidingWindow !== null && !shape.mla) {
    throw new Skip("sliding_window is set but no layer_types says WHICH layers slide — retention is not derivable");
  }
  return [mkGroup(shape.mla ? "mla" : "full", layers)];
}

// -------------------------------------------------------------- parameter counts
const THREE = 3n;

function estimateVisionParams(cfg) {
  const vc = cfg?.vision_config;
  if (!vc || typeof vc !== "object") return 0n;
  const vHidden = vc.hidden_size != null && Number.isInteger(vc.hidden_size) ? BigInt(vc.hidden_size) : 0n;
  const vLayers = (vc.depth ?? vc.num_hidden_layers) != null && Number.isInteger(vc.depth ?? vc.num_hidden_layers)
    ? BigInt(vc.depth ?? vc.num_hidden_layers)
    : 0n;
  const vInter = vc.intermediate_size != null && Number.isInteger(vc.intermediate_size)
    ? BigInt(vc.intermediate_size)
    : vHidden * 4n;
  if (vHidden <= 0n || vLayers <= 0n) return 0n;
  return vLayers * (4n * vHidden * vHidden + 2n * vHidden * vInter);
}

function lookupOffloadParams(lc) {
  if (Array.isArray(lc.engram_num_embeddings) && lc.engram_num_embeddings.length > 0 && lc.engram_head_dim != null) {
    let rows = 0n;
    for (const r of lc.engram_num_embeddings) rows += int(r, "engram_num_embeddings[]");
    const dim = int(lc.engram_head_dim, "engram_head_dim");
    return { params: rows * dim, kind: "engram" };
  }
  if (lc.ngram_vocab_size_base != null && lc.ple_embed_dim != null && Array.isArray(lc.ple_layer_ids) && lc.ple_layer_ids.length > 0) {
    const vocabBase = int(lc.ngram_vocab_size_base, "ngram_vocab_size_base");
    const dim = int(lc.ple_embed_dim, "ple_embed_dim");
    return { params: vocabBase * dim * BigInt(lc.ple_layer_ids.length), kind: "ple_ngram" };
  }
  return { params: 0n, kind: null };
}

export function geometryParams(cfg) {
  const lc = languageConfig(cfg);
  const hidden = int(lc.hidden_size, "hidden_size");
  const layers = int(lc.num_hidden_layers, "num_hidden_layers");
  const vocab = int(lc.vocab_size, "vocab_size");
  const heads = int(lc.num_attention_heads, "num_attention_heads");
  if (layers <= 0n) throw new Skip("num_hidden_layers is zero");

  const embed = vocab * hidden * (lc.tie_word_embeddings === true ? 1n : 2n);

  // Nemotron-NAS per-block dense geometry.
  if (Array.isArray(lc.block_configs) && lc.block_configs.length > 0) {
    const headDim = lc.head_dim != null ? int(lc.head_dim, "head_dim") : hidden / heads;
    let body = 0n;
    for (const blk of lc.block_configs) {
      const attn = blk?.attention;
      if (attn && attn.no_op !== true) {
        if (attn.replace_with_linear === true) {
          body += hidden * hidden * 2n;
        } else {
          const inGroup = int(attn.n_heads_in_group, "block_configs.attention.n_heads_in_group");
          const kvHeads = heads / inGroup;
          body += hidden * heads * headDim * 2n + hidden * kvHeads * headDim * 2n;
        }
      }
      const ffn = blk?.ffn;
      if (ffn && ffn.no_op !== true) {
        if (ffn.replace_with_linear === true) {
          body += hidden * hidden;
        } else if (typeof ffn.ffn_mult === "number" && Number.isFinite(ffn.ffn_mult)) {
          const rawInter = Math.round(Number(hidden) * ffn.ffn_mult);
          const alignedInter = BigInt(Math.ceil(rawInter / 256) * 256);
          body += THREE * hidden * alignedInter;
        }
      }
    }
    const total = embed + body;
    return { total, active: total, moe: false, offload_params: 0n, offload_kind: null };
  }

  const mtp = intOr(lc.num_nextn_predict_layers ?? lc.mtp_num_hidden_layers, 0n);

  let attnPerLayer;
  if (lc.kv_lora_rank !== null && lc.kv_lora_rank !== undefined) {
    const kvLora = int(lc.kv_lora_rank, "kv_lora_rank");
    const rope = int(lc.qk_rope_head_dim, "qk_rope_head_dim");
    const nope = intOr(lc.qk_nope_head_dim, int(lc.head_dim ?? lc.hidden_size, "head_dim") - rope);
    const vDim = intOr(lc.v_head_dim, nope);
    const qLora = lc.q_lora_rank === null || lc.q_lora_rank === undefined ? null : int(lc.q_lora_rank, "q_lora_rank");
    const qkHead = nope + rope;
    const qParams = qLora === null ? hidden * heads * qkHead : hidden * qLora + qLora * heads * qkHead;
    attnPerLayer = qParams + hidden * (kvLora + rope) + kvLora * heads * (nope + vDim) + heads * vDim * hidden;
  } else if (
    Array.isArray(lc.kv_source_layer_ids)
    && lc.q_lora_rank !== null && lc.q_lora_rank !== undefined
    && lc.o_lora_rank !== null && lc.o_lora_rank !== undefined
  ) {
    const qLora = int(lc.q_lora_rank, "q_lora_rank");
    const oLora = int(lc.o_lora_rank, "o_lora_rank");
    const headDim = int(lc.head_dim, "head_dim");
    const rope = intOr(lc.qk_rope_head_dim, 0n);
    const kvHeads = int(lc.num_key_value_heads ?? 1, "num_key_value_heads");
    attnPerLayer = hidden * qLora
      + qLora * heads * (headDim + rope)
      + hidden * kvHeads * (headDim + rope)
      + heads * headDim * oLora
      + oLora * hidden;
  } else {
    const kvHeads = int(lc.num_key_value_heads ?? lc.num_attention_heads, "num_key_value_heads");
    const headDim = lc.head_dim === null || lc.head_dim === undefined ? hidden / heads : int(lc.head_dim, "head_dim");
    attnPerLayer = hidden * heads * headDim * 2n + hidden * kvHeads * headDim * 2n;
  }

  const rawRouted = lc.enable_moe_block === false
    ? null
    : (lc.n_routed_experts ?? lc.num_experts ?? lc.num_local_experts ?? null);
  const routed = rawRouted !== null && int(rawRouted, "n_routed_experts") > 0n ? rawRouted : null;
  const denseInter = lc.intermediate_size ?? null;

  let bodyTotal = attnPerLayer * layers;
  let bodyActive = bodyTotal;
  let mtpTotal = 0n;
  let moe = false;

  if (routed === null) {
    if (denseInter === null) throw new Skip("neither an expert count nor intermediate_size — MLP width is unknown");
    const mlp = THREE * hidden * int(denseInter, "intermediate_size") * layers;
    bodyTotal += mlp;
    bodyActive += mlp;
    mtpTotal = (bodyTotal / layers) * mtp;
  } else {
    moe = true;
    const perTok = lc.num_experts_per_tok ?? lc.num_experts_per_token ?? lc.experts_per_token ?? lc.top_k_experts ?? null;
    const moeInter = lc.moe_intermediate_size ?? lc.expert_intermediate_size ?? lc.intermediate_size ?? null;
    if (perTok === null || moeInter === null) {
      throw new Skip("mixture of experts without num_experts_per_tok or moe_intermediate_size — active parameters are not derivable");
    }
    const nRouted = int(routed, "n_routed_experts");
    const nPerTok = int(perTok, "num_experts_per_tok");
    const inter = int(moeInter, "moe_intermediate_size");
    const explicitShared = lc.n_shared_experts ?? lc.num_shared_experts;
    const shared = explicitShared !== null && explicitShared !== undefined
      ? int(explicitShared, "n_shared_experts")
      : (lc.shared_expert_intermediate_size !== null && lc.shared_expert_intermediate_size !== undefined && int(lc.shared_expert_intermediate_size, "shared_expert_intermediate_size") > 0n ? 1n : 0n);
    const sharedInter = shared > 0n ? intOr(lc.shared_expert_intermediate_size, inter) : 0n;

    let denseLayers = 0n;
    if (Array.isArray(lc.mlp_layer_types)) {
      denseLayers = BigInt(lc.mlp_layer_types.filter((t) => t === "dense").length);
    } else if (Array.isArray(lc.mlp_only_layers)) {
      denseLayers = BigInt(lc.mlp_only_layers.length);
    } else if (lc.first_k_dense_replace !== null && lc.first_k_dense_replace !== undefined) {
      denseLayers = int(lc.first_k_dense_replace, "first_k_dense_replace");
    }
    if (denseLayers > layers) denseLayers = layers;
    const sparseLayers = layers - denseLayers;

    if (denseLayers > 0n) {
      if (denseInter === null) throw new Skip("a dense MLP layer is declared but intermediate_size is absent");
      const mlp = THREE * hidden * int(denseInter, "intermediate_size") * denseLayers;
      bodyTotal += mlp;
      bodyActive += mlp;
    }

    const dsparkTargets = Array.isArray(lc.dspark_target_layer_ids) && lc.dspark_n_routed_experts != null
      ? BigInt(lc.dspark_target_layer_ids.length)
      : 0n;
    const dsparkLayers = dsparkTargets <= sparseLayers ? dsparkTargets : 0n;
    const stdSparseLayers = sparseLayers - dsparkLayers;

    const sharedPerLayer = THREE * hidden * sharedInter * shared;
    const stdLayerTotal = THREE * hidden * inter * nRouted + sharedPerLayer + hidden * nRouted;
    const stdLayerActive = THREE * hidden * inter * nPerTok + sharedPerLayer + hidden * nRouted;
    bodyTotal += stdLayerTotal * stdSparseLayers;
    bodyActive += stdLayerActive * stdSparseLayers;

    if (dsparkLayers > 0n) {
      const dsRouted = int(lc.dspark_n_routed_experts, "dspark_n_routed_experts");
      const dsPerTok = int(lc.dspark_num_experts_per_tok ?? perTok, "dspark_num_experts_per_tok");
      const dsLayerTotal = THREE * hidden * inter * dsRouted + sharedPerLayer + hidden * dsRouted;
      const dsLayerActive = THREE * hidden * inter * dsPerTok + sharedPerLayer + hidden * dsRouted;
      bodyTotal += dsLayerTotal * dsparkLayers;
      bodyActive += dsLayerActive * dsparkLayers;
      // NextN MTP modules instantiate full n_routed_experts layers rather than DSpark tail layers.
      mtpTotal = (attnPerLayer + stdLayerTotal) * mtp;
    } else {
      mtpTotal = (bodyTotal / layers) * mtp;
    }
  }

  const offload = lookupOffloadParams(lc);
  const vision = estimateVisionParams(cfg);
  return {
    total: embed + bodyTotal + mtpTotal + offload.params + vision,
    active: embed + bodyActive,
    moe,
    offload_params: offload.params,
    offload_kind: offload.kind,
  };
}

function billions(n, places = 2) {
  const scale = 10n ** BigInt(9 - places);
  const scaled = (n + scale / 2n) / scale;
  const whole = scaled / 10n ** BigInt(places);
  const frac = (scaled % 10n ** BigInt(places)).toString().padStart(places, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}

const DECLARED_ACTIVE = /-a(\d+(?:\.\d+)?)b(?:[-_.]|$)/i;

export function deriveParams(repoId, cfg, safetensorsTotal) {
  const total = safetensorsTotal;
  const lc = languageConfig(cfg);
  const offload = lookupOffloadParams(lc);
  const offloadMeta = offload.params > 0n && offload.params < total
    ? {
        gpu_backbone_params_b: billions(total - offload.params, 2),
        host_offload_params_b: billions(offload.params, 2),
        host_offload_kind: offload.kind,
      }
    : {};

  // Precedence (1): vendor-declared "-A<n>B" outranks geometry derivation and short-circuits.
  const declared = DECLARED_ACTIVE.exec(repoId.split("/").pop() ?? "");
  if (declared) {
    const rawRouted = lc.enable_moe_block === false
      ? null
      : (lc.n_routed_experts ?? lc.num_experts ?? lc.num_local_experts ?? null);
    const isMoe = rawRouted !== null;
    return {
      params_b: billions(total, 2),
      active_params_b: declared[1],
      active_basis: "declared",
      is_moe: isMoe,
      fit: null,
      ...offloadMeta,
    };
  }

  const geom = geometryParams(cfg);
  const diff = geom.total > total ? geom.total - total : total - geom.total;
  const withinTolerance = diff * 100n <= total * 2n;
  const fit = {
    geometry_params: billions(geom.total, 3),
    published_params: billions(total, 3),
    within_2_percent: withinTolerance,
  };
  if (!geom.moe) {
    return {
      params_b: billions(total, 2),
      active_params_b: billions(total, 2),
      active_basis: "dense",
      is_moe: false,
      fit,
      ...offloadMeta,
    };
  }
  if (!withinTolerance) {
    throw new Skip(
      "mixture of experts whose active parameter count is not derivable — the geometry model does not reproduce the published total",
      `geometry ${fit.geometry_params}B vs published ${fit.published_params}B`,
    );
  }
  const active = (geom.active * total) / geom.total;
  return {
    params_b: billions(total, 2),
    active_params_b: billions(active, 2),
    active_basis: "derived",
    is_moe: true,
    fit,
    ...offloadMeta,
  };
}

// ---------------------------------------------------------------------- labelling
function archSummary(groups, isMoe) {
  const kinds = new Set(groups.map((g) => g.kind));
  const moe = isMoe ? ", MoE" : "";
  const hasCompressedMla = groups.some((g) => g.kind === "mla" && (Number(g.compress_ratio ?? 1) > 1 || Number(g.index_bytes_per_entry ?? 0) > 0));
  if (hasCompressedMla && kinds.has("sliding")) return `CSA2 compressed MLA + SWA${moe}`;
  if (hasCompressedMla) return `compressed MLA${moe}`;
  if (kinds.has("linear") && kinds.has("mla")) return `linear + MLA hybrid${moe}`;
  if (kinds.has("linear") && kinds.size > 1) return `linear/GDN hybrid${moe}`;
  if (kinds.has("linear")) return `linear attention${moe}`;
  if (kinds.has("mla")) return `MLA latent cache${moe}`;
  if (kinds.has("sliding") && kinds.has("full")) return `sliding-window hybrid${moe}`;
  if (kinds.has("sliding")) return `sliding window${moe}`;
  return isMoe ? "full attention, MoE" : "dense, full attention";
}

const slug = (repoId) => (repoId.split("/").pop() ?? repoId).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const shapeSignature = (m) => JSON.stringify([m.params_b, m.active_params_b, m.groups]);

// ------------------------------------------------------------------- the builder
export async function compileModel(entry, observedAt, { fetchText = defaultFetchText, pinnedId = null } = {}) {
  const repoId = entry.id;
  const fetchHubJSON = async (url) => parseJSONExact(await fetchText(url));
  const fetchConfig = async (url) => JSON.parse(await fetchText(url));

  const detailUrl = `${HUB}/api/models/${repoId}?expand[]=sha&expand[]=safetensors&expand[]=config&expand[]=downloads&expand[]=likes`;
  const detail = await fetchHubJSON(detailUrl);

  // Coherent revision check: metadata and config.json MUST come from the same commit sha.
  const detailSha = typeof detail?.sha === "string" && detail.sha.trim() ? detail.sha.trim() : null;
  if (!detailSha) {
    throw new Skip("Hub metadata returned no commit sha — revision coherence cannot be verified", detailUrl);
  }
  if (typeof entry?.sha === "string" && entry.sha.trim() && entry.sha.trim() !== detailSha) {
    throw new Skip(
      "repository ref advanced between discovery and metadata fetch — refusing mixed-revision derivation",
      `${entry.sha.trim()} -> ${detailSha}`,
    );
  }

  const totalRaw = detail?.safetensors?.total;
  if (totalRaw === null || totalRaw === undefined) {
    throw new Skip("no safetensors index — the Hub publishes no parameter count for this repo");
  }
  const total = int(totalRaw, "safetensors.total");
  const minParams = BigInt(Math.round(Number(MIN_PARAMS_B) * 1e9));
  if (total < minParams) {
    throw new Skip(`${billions(total, 3)}B parameters is below the --min-params-b floor of ${MIN_PARAMS_B}B`);
  }

  const configUrl = `${HUB}/${repoId}/resolve/${detailSha}/config.json`;
  let cfg;
  try {
    cfg = await fetchConfig(configUrl);
  } catch (e) {
    if (e instanceof HubHttpError && (e.status === 401 || e.status === 403)) {
      throw new Skip(`gated repo — config.json returned HTTP ${e.status}`, configUrl);
    }
    throw e;
  }

  const arch = Array.isArray(cfg.architectures) ? String(cfg.architectures[0] ?? "") : "";
  if (/draft|eagle|medusa/i.test(arch)) {
    throw new Skip(`${arch} is a speculative-decoding draft head, not a model that serves traffic on its own`);
  }

  const lc = languageConfig(cfg);
  const groups = deriveGroups(cfg);
  const params = deriveParams(repoId, cfg, total);

  const ctxMax = Number(intOr(lc.max_position_embeddings ?? lc.model_max_length, 32768n));
  const offloadClause = params.gpu_backbone_params_b
    ? ` Full checkpoint is ${params.params_b}B (${params.gpu_backbone_params_b}B GPU transformer backbone + ${params.host_offload_params_b}B ${params.host_offload_kind} lookup table; sized fail-closed on GPU VRAM unless an evidenced host-DRAM tier profile is supplied).`
    : "";

  const row = {
    id: pinnedId ?? slug(repoId),
    label: `${repoId.split("/").pop()} — ${archSummary(groups, params.is_moe)}`,
    family: repoId.split("/")[0].toLowerCase(),
    architecture: groups.length > 1 ? "hybrid" : groups[0].kind,
    params_b: params.params_b,
    active_params_b: params.active_params_b,
    active_params_basis: params.active_basis,
    ...(params.gpu_backbone_params_b ? {
      gpu_backbone_params_b: params.gpu_backbone_params_b,
      host_offload_params_b: params.host_offload_params_b,
      host_offload_kind: params.host_offload_kind,
    } : {}),
    context_default: Math.min(32768, ctxMax),
    context_max: ctxMax,
    kv_bytes_per_token_bf16_expected: null,
    basis: "derived",
    groups,
    note: `Derived from ${repoId}@${detailSha.slice(0, 12)} config.json on ${observedAt}: ${groups.map((g) => `${g.layers} ${g.kind}${g.compress_ratio > 1 ? `(${g.compress_ratio}:1)` : ""}`).join(" + ")} layer${groups.length > 1 || groups[0].layers > 1 ? "s" : ""}. Parameter total is the Hub's safetensors index at the same commit; active parameters are ${params.active_basis === "declared" ? "the vendor's own -A<n>B declaration" : params.active_basis === "dense" ? "equal to total (no routed experts)" : `computed from the MoE geometry, which reproduced the published total to within 2% (${params.fit.geometry_params}B vs ${params.fit.published_params}B)`}.${offloadClause} Nothing here is a benchmark and no per-token KV figure has been independently published for this row.`,
    source_url: `${HUB}/${repoId}`,
    config_url: configUrl,
    revision: detailSha,
    model_type: lc.model_type ?? cfg.model_type ?? null,
    hub_downloads: detail.downloads ?? entry.downloads ?? null,
    hub_likes: detail.likes ?? entry.likes ?? null,
    observed_at: observedAt,
  };
  return row;
}

function upgradeStaticServingTables(previous) {
  const kvQuant = {
    ...(previous.kv_quantization ?? {}),
    fp4: {
      label: "FP4 KV cache (NVFP4 / MXFP4)",
      bytes_per_element: "0.5625",
      basis: "exact",
      note: "4-bit E2M1 payload (0.5 B) plus one FP8 E4M3 block scale per 16 channels (0.0625 B) = 0.5625 bytes per cached element (9/16 B). Fixed per-entry index/RoPE metadata (index_bytes_per_entry) stays unscaled.",
    },
  };

  const runtimes = { ...(previous.runtimes ?? {}) };
  for (const [k, rt] of Object.entries(runtimes)) {
    const supportsPrefix = k === "vllm" || k === "sglang" || k === "trtllm";
    runtimes[k] = {
      ...rt,
      supports_prefix_cache: rt.supports_prefix_cache ?? supportsPrefix,
      page_block_tokens: rt.page_block_tokens !== undefined ? rt.page_block_tokens : (supportsPrefix ? 16 : null),
    };
  }

  return { kvQuant, runtimes };
}

export function validateCatalogDocument(doc) {
  mustShape(Array.isArray(doc?.models) && doc.models.length > 0, "catalog:models", "non-empty models array", doc?.models);
  const ids = new Set();
  for (const m of doc.models) {
    if (ids.has(m.id)) throw new ShapeError("catalog:models", `unique model id (${m.id})`, m.id);
    ids.add(m.id);
    kvBytesPerToken(m.groups, "2");
    kvBytesPerSequence(m.groups, m.context_default, "0.5625");
    weightBytes({ paramsB: m.params_b, activeParamsB: m.active_params_b, bytesPerParam: "2" });
  }
  for (const reqId of ["qwen3-8b", "gemma-4-31b", "qwen3-next-80b-a3b", "deepseek-v3", "custom"]) {
    if (!ids.has(reqId)) {
      throw new ShapeError("catalog:curated", `curated preset ${reqId} to survive refresh`, [...ids]);
    }
  }
}

export async function buildServingModels({
  observedAt,
  previous,
  fetchText = defaultFetchText,
  mandatorySeeds = MANDATORY_SEEDS,
  keep = KEEP,
  pool = POOL,
  sort = SORT,
} = {}) {
  const fetchHubJSON = async (url) => parseJSONExact(await fetchText(url));
  const curated = (previous.models ?? []).filter((m) => m.basis !== "derived" && m.id !== "custom");
  const custom = (previous.models ?? []).filter((m) => m.id === "custom");
  const takenIds = new Set([...curated, ...custom].map((m) => m.id));

  const kept = [];
  const skipped = [];
  const seenRepos = new Set();

  // Stage 1: Compile mandatory pinned seeds FIRST so their IDs are deterministic
  // and rank-independent, and any failure aborts before touching serving-models.json.
  for (const seed of mandatorySeeds) {
    if (takenIds.has(seed.id)) {
      throw new MandatorySeedError(seed.repo, `pinned id "${seed.id}" collides with a curated or previous mandatory row`);
    }
    try {
      const model = await compileModel({ id: seed.repo }, observedAt, { fetchText, pinnedId: seed.id });
      model.pinned = true;
      takenIds.add(model.id);
      seenRepos.add(seed.repo.toLowerCase());
      kept.push(model);
    } catch (e) {
      const reason = e instanceof Skip ? `${e.reason}${e.detail ? ` (${e.detail})` : ""}` : e.message;
      throw new MandatorySeedError(seed.repo, reason, e);
    }
  }

  // Stage 2: Optional trending discovery from Hugging Face Hub.
  const listUrl = `${HUB}/api/models?filter=text-generation&sort=${encodeURIComponent(sort)}&direction=-1&limit=${pool}`;
  const list = await fetchHubJSON(listUrl);
  mustShape(Array.isArray(list) && list.length > 0, "huggingface:list", "a non-empty array of model records", list);
  mustShape(typeof list[0]?.id === "string", "huggingface:list", "each record to carry a string id", list[0]);

  const derivatives = [];
  const candidates = new Map();
  const scoreOf = (entry) => Number(entry?.trendingScore ?? Number.NEGATIVE_INFINITY);
  const addCandidate = (entry, resolution = null) => {
    const score = resolution?.creditedScore ?? scoreOf(entry);
    const prior = candidates.get(entry.id);
    if (!prior) {
      candidates.set(entry.id, { entry: { ...entry, trendingScore: score }, creditedScore: score, resolutions: resolution ? [resolution] : [] });
      return;
    }
    if (score > prior.creditedScore) {
      prior.creditedScore = score;
      prior.entry = { ...entry, trendingScore: score };
    }
    if (resolution) prior.resolutions.push(resolution);
  };

  for (const entry of list) {
    const screened = screen(entry);
    if (!screened) {
      addCandidate(entry);
      continue;
    }
    skipped.push({ id: entry.id, reason: screened, detail: null });
    if (derivativeBase(entry)) derivatives.push(entry);
  }

  const getModel = async (id) => fetchHubJSON(`${HUB}/api/models/${id}`);
  for (const derivative of derivatives) {
    try {
      const resolved = await resolveBase(derivative, { fetchModel: getModel });
      if (!resolved) continue;
      addCandidate(resolved.entry, {
        derivative_id: derivative.id,
        creditedScore: scoreOf(derivative),
        hops: resolved.hops,
        path: resolved.path,
        truncated: !!resolved.truncated,
      });
    } catch (e) {
      if (e instanceof Skip) {
        skipped.push({ id: derivative.id, reason: `base resolution failed — ${e.reason}`, detail: e.detail });
        continue;
      }
      skipped.push({ id: derivative.id, reason: `base resolution failed — ${e.message}`, detail: e.name });
    }
  }

  const ordered = [...candidates.values()]
    .sort((a, b) => b.creditedScore - a.creditedScore || a.entry.id.localeCompare(b.entry.id));
  const resolvedBases = [];

  for (const candidate of ordered) {
    const entry = candidate.entry;
    // Credit derivative resolutions onto already-kept mandatory seeds when applicable.
    const existingMandatory = kept.find((k) => k.source_url.toLowerCase() === `${HUB}/${entry.id}`.toLowerCase());
    if (existingMandatory) {
      if (candidate.resolutions.length) {
        existingMandatory.resolved_from = candidate.resolutions.map((r) => r.derivative_id);
        existingMandatory.base_resolution = candidate.resolutions.map(({ derivative_id, hops, path, truncated }) => ({
          derivative_id, hops, path, truncated,
        }));
        resolvedBases.push({
          base_id: entry.id,
          derivative_ids: existingMandatory.resolved_from,
          credited_trending_score: candidate.creditedScore,
        });
      }
      continue;
    }

    if (kept.length >= Math.max(keep, mandatorySeeds.length)) break;
    if (seenRepos.has(entry.id.toLowerCase())) continue;

    try {
      const model = await compileModel(entry, observedAt, { fetchText });
      const twin = kept.find((k) => shapeSignature(k) === shapeSignature(model));
      if (twin) {
        skipped.push({
          id: entry.id,
          reason: `prices identically to ${twin.source_url.slice(HUB.length + 1)} — same parameter counts and same layer groups`,
          detail: "duplicate serving shape",
        });
        continue;
      }
      if (takenIds.has(model.id)) {
        let next = `${model.family}-${model.id}`;
        for (let n = 2; takenIds.has(next); n++) next = `${model.family}-${model.id}-${n}`;
        model.id = next;
      }
      takenIds.add(model.id);
      seenRepos.add(entry.id.toLowerCase());

      if (candidate.resolutions.length) {
        model.resolved_from = candidate.resolutions.map((r) => r.derivative_id);
        model.base_resolution = candidate.resolutions.map(({ derivative_id, hops, path, truncated }) => ({
          derivative_id, hops, path, truncated,
        }));
        resolvedBases.push({
          base_id: entry.id,
          derivative_ids: model.resolved_from,
          credited_trending_score: candidate.creditedScore,
        });
      }
      kept.push(model);
    } catch (e) {
      if (e instanceof Skip) {
        skipped.push({ id: entry.id, reason: e.reason, detail: e.detail });
        continue;
      }
      skipped.push({ id: entry.id, reason: `fetch or parse failed — ${e.message}`, detail: e.name });
    }
  }

  const { kvQuant, runtimes } = upgradeStaticServingTables(previous);
  const gatedRepoCount = skipped.filter((s) => s.reason.startsWith("gated repo")).length;
  const doc = {
    ...previous,
    provenance: { ...previous.provenance, observed: observedAt },
    kv_quantization: kvQuant,
    runtimes,
    model_note: `This file holds TWO classes of row and they carry different warranties. A row tagged basis:"derived" was generated from the Hugging Face Hub by scripts/build-serving-models.mjs: its layer groups and parameter counts come from that repository's own revision-pinned config.json and safetensors index, and its kv_bytes_per_token_bf16_expected is null because no independently published per-token figure exists for it. A row carrying NO basis key is hand-curated, and its numeric kv_bytes_per_token_bf16_expected is a figure published by the cited source — tests/serving.test.mjs asserts the engine's own layer-group arithmetic lands on each one exactly. Those curated rows are therefore the ONLY independent falsifiers of the engine's arithmetic: a formula error cannot ship silently while they stand, which is why a refresh preserves them verbatim. Layer groups are the general form — one flat layer count cannot express a hybrid, and the curated architectures are precisely the cases where a flat count is wrong.`,
    models: [...kept, ...curated, ...custom],
    derived_note: `The rows tagged basis:"derived" above were generated by scripts/build-serving-models.mjs from the Hugging Face Hub on ${observedAt} (mandatory pinned seeds across <=14B, 20B-40B sovereign/finetune, 45B-120B 50B-class, and 150B+ Flash MoE bands, plus top-${sort} discovery). Every derived row binds Hub safetensors metadata and config.json to the same commit sha. Third-party derivatives resolve to their named main-lab base for up to three hops. Checkpoints with declared host-lookup tables (engram / ple_ngram) carry gpu_backbone_params_b and host_offload_params_b while sizing fail-closed on full params_b unless an evidenced host-tier runtime profile is active.`,
    coverage: {
      ...(previous.coverage ?? {}),
      mandatory_seed_count: mandatorySeeds.length,
      resolved_base_count: resolvedBases.length,
      gated_repo_count: gatedRepoCount,
    },
    resolved_bases: resolvedBases,
    skipped,
    skipped_note: `Candidates the mapper could not express, listed rather than dropped silently. A skip is a REFUSAL, not an absence: serving.js throws on an attention kind outside {full, sliding, linear, mla}, and it silently prices an MoE as dense when active parameters are unknown, so a row that cannot be derived must not be written. Mandatory seed failures abort publish outright so serving-models.json is never partially overwritten.`,
  };

  validateCatalogDocument(doc);
  return doc;
}

// ------------------------------------------------------------------------- main
async function main() {
  const observedAt = new Date().toISOString().slice(0, 10);
  const previous = JSON.parse(await readFile(OUT_PATH, "utf8"));
  const doc = await buildServingModels({ observedAt, previous });

  const derived = doc.models.filter((m) => m.basis === "derived");
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`mandatory seeds ${MANDATORY_SEEDS.length} · ranked by ${SORT} · examined ${POOL} candidates · kept ${derived.length}\n`);
  console.log(`${pad("REPO", 44)}${pad("ID", 36)}${pad("PARAMS", 10)}${pad("ACTIVE", 22)}${pad("CTX", 9)}GROUPS`);
  for (const m of derived) {
    console.log(
      `${pad(m.source_url.slice(HUB.length + 1), 44)}${pad(m.id, 36)}${pad(`${m.params_b}B`, 10)}` +
      `${pad(`${m.active_params_b}B (${m.active_params_basis})`, 22)}` +
      `${pad(m.context_max, 9)}${m.groups.map((g) => `${g.layers}x${g.kind}${g.compress_ratio > 1 ? `(${g.compress_ratio}:1)` : ""}`).join(" + ")}`,
    );
  }
  if (doc.skipped.length) {
    console.log(`\nSKIPPED (${doc.skipped.length})`);
    for (const s of doc.skipped) console.log(`  ${pad(s.id, 44)}${s.reason}${s.detail ? ` [${s.detail}]` : ""}`);
  }

  if (!derived.length) {
    console.error("\n✗ no model survived the screen — serving-models.json was NOT rewritten, so the previous rows and their observed_at stand.");
    process.exit(1);
  }
  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written.");
    return;
  }
  await writeFile(OUT_PATH, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  console.log(`\n✓ wrote ${OUT_PATH} — ${derived.length} derived + ${doc.models.length - derived.length} curated.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
