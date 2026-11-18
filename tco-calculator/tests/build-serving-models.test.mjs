// Tests for the Hugging Face ingestion mapper (scripts/build-serving-models.mjs).
//
// The fixtures below are FROZEN shapes captured verbatim from real config.json
// files on 2026-08-29. They are not fetched: a test that hits the Hub fails when
// the Hub is down and changes its own expectations when trending moves, which
// makes it a weather report rather than a test.
//
// What these guard is the seam where a plausible-looking derivation would ship a
// wrong number silently — every case here is one the first dry run got wrong or
// nearly got wrong.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveGroups,
  geometryParams,
  deriveParams,
  screen,
  derivativeBase,
  resolveBase,
  compileModel,
  buildServingModels,
  MandatorySeedError,
  HubHttpError,
  Skip,
} from "../../scripts/build-serving-models.mjs";
import { kvBytesPerToken, kvBytesPerSequence, ServingRefusal } from "../serving.js";
import { formatHalfUp } from "../exact.js";

// ─────────────────────────────────────────────────────────── frozen fixtures

// ornith-ai/Ornith-1.5-35B-A3B — a MULTIMODAL wrapper: the language model is
// nested under text_config and a vision tower sits at the top level. Reading the
// top level yields the vision tower's dimensions, which are wrong in a way that
// still produces a number.
const ORNITH = {
  architectures: ["Qwen3_5MoeForConditionalGeneration"],
  hidden_size: 2048,
  model_type: "qwen3_5_moe",
  text_config: {
    full_attention_interval: 4,
    head_dim: 256,
    hidden_size: 2048,
    // Verified 4:1 interleave — every fourth layer is full attention.
    layer_types: Array.from({ length: 40 }, (_, i) => (i % 4 === 3 ? "full_attention" : "linear_attention")),
    max_position_embeddings: 262144,
    moe_intermediate_size: 512,
    mtp_num_hidden_layers: 1,
    num_attention_heads: 16,
    num_experts: 256,
    num_experts_per_tok: 8,
    num_hidden_layers: 40,
    num_key_value_heads: 2,
    shared_expert_intermediate_size: 512,
    tie_word_embeddings: false,
    vocab_size: 248320,
  },
  vision_config: { depth: 27, hidden_size: 1152, num_heads: 16 },
};

// tencent/Hy4-preview — MLA cache read sparsely (DeepSeek Sparse Attention),
// plus a dense first MLP layer among 77 sparse ones and an MTP head.
const HY4 = {
  architectures: ["HYV4ForCausalLM"],
  head_dim: 64,
  hidden_size: 6144,
  intermediate_size: 18432,
  kv_lora_rank: 512,
  layer_types: Array(78).fill("deepseek_sparse_attention"),
  max_position_embeddings: 1048576,
  mlp_layer_types: ["dense", ...Array(77).fill("sparse")],
  model_type: "hy_v4",
  moe_intermediate_size: 2048,
  n_routed_experts: 256,
  n_shared_experts: 1,
  num_attention_heads: 64,
  num_experts_per_tok: 8,
  num_hidden_layers: 78,
  num_key_value_heads: 8,
  num_nextn_predict_layers: 1,
  q_lora_rank: 2048,
  qk_nope_head_dim: 192,
  qk_rope_head_dim: 64,
  tie_word_embeddings: false,
  use_mla: true,
  v_head_dim: 256,
  vocab_size: 120832,
};

// ibm-granite/granite-4.2-30b — a plain dense stack with NO layer_types and no
// head_dim. This is the case the "uniform full attention" fallback exists for,
// and the case that proves the fallback is not just a convenient default.
const GRANITE = {
  architectures: ["GraniteForCausalLM"],
  hidden_size: 4096,
  intermediate_size: 32768,
  max_position_embeddings: 131072,
  model_type: "granite",
  num_attention_heads: 32,
  num_hidden_layers: 64,
  num_key_value_heads: 8,
  tie_word_embeddings: false,
  vocab_size: 100352,
};

// deepseek-ai/DeepSeek-V4-Flash-0731 — qk_rope_head_dim WITHOUT kv_lora_rank,
// a bare sliding_window with no pattern, and a per-layer compress_ratios[] this
// model has no term for. It must refuse.
const DEEPSEEK_V4 = {
  architectures: ["DeepseekV4ForCausalLM"],
  compress_ratios: [0, 0, 4, 128, 4, 128],
  head_dim: 512,
  hidden_size: 4096,
  intermediate_size: 18432,
  model_type: "deepseek_v4",
  moe_intermediate_size: 2048,
  n_routed_experts: 256,
  n_shared_experts: 1,
  num_attention_heads: 64,
  num_experts_per_tok: 6,
  num_hidden_layers: 43,
  num_key_value_heads: 1,
  o_lora_rank: 1024,
  q_lora_rank: 1024,
  qk_rope_head_dim: 64,
  sliding_window: 128,
  tie_word_embeddings: false,
  vocab_size: 129280,
};

// zai-org/GLM-5.3-Flash — the row the calculator DEFAULTS to, and the only shape
// that mixes linear layers with a latent (MLA) cache. Captured from the repo's
// config.json on 2026-08-29: the language model is nested under text_config
// beside a vision tower, and its 45 layers run a 4-cycle of three
// linear_attention layers to one deepseek_sparse_attention layer.
const GLM_5_3_FLASH = {
  architectures: ["Glm5NextForConditionalGeneration"],
  model_type: "glm5_next",
  text_config: {
    first_k_dense_replace: 3,
    head_dim: 0,
    hidden_size: 4096,
    intermediate_size: 12288,
    kv_lora_rank: 512,
    // Verified against the config's own linear_attn_config.full_attn_layers:
    // [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43] — eleven of forty-five.
    layer_types: Array.from({ length: 45 }, (_, i) => (i % 4 === 3 ? "deepseek_sparse_attention" : "linear_attention")),
    max_position_embeddings: 1048576,
    mlp_layer_types: [...Array(3).fill("dense"), ...Array(42).fill("sparse")],
    model_type: "glm5_next_text",
    moe_intermediate_size: 2048,
    n_routed_experts: 288,
    n_shared_experts: 1,
    num_attention_heads: 64,
    num_experts_per_tok: 8,
    num_hidden_layers: 45,
    num_key_value_heads: 64,
    num_nextn_predict_layers: 1,
    q_lora_rank: 1536,
    qk_nope_head_dim: 256,
    qk_rope_head_dim: 0,
    tie_word_embeddings: false,
    v_head_dim: 256,
    vocab_size: 154880,
  },
  vision_config: { depth: 24, hidden_size: 1024, num_heads: 16 },
};

// ───────────────────────────────────────────────────────── the layer mapping

test("a multimodal wrapper is unwrapped: Ornith's 4:1 interleave becomes 30 linear + 10 full", () => {
  const groups = deriveGroups(ORNITH);
  assert.deepEqual(groups, [
    { kind: "linear", layers: 30, state_bytes_per_seq: null },
    { kind: "full", layers: 10, kv_heads: 2, head_dim: 256, tensors: 2 },
  ]);
});

test("interleaved runs and merged groups price IDENTICALLY — the coalescing is arithmetic, not a simplification", () => {
  // The mapper merges Ornith's twenty alternating runs into two groups. That is
  // only legitimate if the engine's own sum is unchanged by it, because the
  // engine computes Σ bytes_per_token(g) x retained_tokens(g) PER GROUP.
  const merged = deriveGroups(ORNITH);
  const interleaved = [];
  for (let i = 0; i < 40; i++) {
    interleaved.push(i % 4 === 3
      ? { kind: "full", layers: 1, kv_heads: 2, head_dim: 256, tensors: 2 }
      : { kind: "linear", layers: 1, state_bytes_per_seq: null });
  }
  assert.equal(
    formatHalfUp(kvBytesPerToken(merged, "2"), 0),
    formatHalfUp(kvBytesPerToken(interleaved, "2"), 0),
  );
  assert.equal(
    formatHalfUp(kvBytesPerSequence(merged, 131072, "2"), 0),
    formatHalfUp(kvBytesPerSequence(interleaved, 131072, "2"), 0),
  );
  // And the linear layers really do contribute nothing: 10 full layers only.
  assert.equal(formatHalfUp(kvBytesPerToken(merged, "2"), 0), String(10 * 2 * 2 * 256 * 2));
});

test("DeepSeek Sparse Attention maps to the MLA cache it actually stores", () => {
  assert.deepEqual(deriveGroups(HY4), [
    { kind: "mla", layers: 78, kv_lora_rank: 512, qk_rope_head_dim: 64 },
  ]);
  // 78 x (512 + 64) x 2 bytes.
  assert.equal(formatHalfUp(kvBytesPerToken(deriveGroups(HY4), "2"), 0), "89856");
});

test("a config with no layer_types and no head_dim falls back to a uniform full stack", () => {
  assert.deepEqual(deriveGroups(GRANITE), [
    // head_dim is hidden_size / num_attention_heads = 4096 / 32.
    { kind: "full", layers: 64, kv_heads: 8, head_dim: 128, tensors: 2 },
  ]);
});

test("GLM-5.3-Flash: nested text_config, and linear layers coexisting with a latent cache", () => {
  // The shipped default row, and the only fixture exercising both at once: the
  // language model is nested beside a VISION tower (reading the top level yields
  // the tower's dimensions), and linear layers sit alongside MLA ones. mkGroup
  // returns the linear group BEFORE the "mixes plain attention into an MLA
  // config" refusal can fire — correct precisely because a linear layer holds no
  // KV cache and so has no width to disagree about.
  assert.deepEqual(deriveGroups(GLM_5_3_FLASH), [
    { kind: "linear", layers: 34, state_bytes_per_seq: null },
    { kind: "mla", layers: 11, kv_lora_rank: 512, qk_rope_head_dim: 0 },
  ]);
  // 11 x (512 + 0) x 2 bytes. The 34 linear layers contribute nothing, which is
  // the entire reason this model holds a megatoken context on one node.
  assert.equal(formatHalfUp(kvBytesPerToken(deriveGroups(GLM_5_3_FLASH), "2"), 0), "11264");
});

test("the linear exemption is NARROW: plain attention beside a latent cache still refuses", () => {
  // Swap GLM's linear layers for full ones and the config declares two different
  // cache widths while saying nowhere which layers use which. Skipping is the
  // only honest answer; picking one silently misprices every fleet sized on it.
  const mixed = {
    ...GLM_5_3_FLASH,
    text_config: {
      ...GLM_5_3_FLASH.text_config,
      layer_types: GLM_5_3_FLASH.text_config.layer_types.map((t) => (t === "linear_attention" ? "full_attention" : t)),
    },
  };
  assert.throws(
    () => deriveGroups(mixed),
    (e) => e instanceof Skip && /per-layer cache width is undeclared/.test(e.reason),
  );
});

// ─────────────────────────────────────────────── the refusals, one per trap

test("qk_rope_head_dim without kv_lora_rank refuses — it is not classic MLA", () => {
  assert.throws(() => deriveGroups(DEEPSEEK_V4), (e) => e instanceof Skip && /not classic MLA/.test(e.reason));
});

test("an unmapped layer_types value refuses rather than defaulting to full attention", () => {
  const lfm = { ...GRANITE, layer_types: ["conv", "full_attention", "conv"] };
  assert.throws(() => deriveGroups(lfm), (e) => e instanceof Skip && /unmapped layer_types value "conv"/.test(e.reason));
});

test("a bare sliding_window with no per-layer pattern refuses — retention is undeterminable", () => {
  // Treating every layer as sliding understates KV; treating none as sliding
  // overstates it. Both are wrong and neither announces itself.
  const bare = { ...GRANITE, sliding_window: 4096 };
  assert.throws(() => deriveGroups(bare), (e) => e instanceof Skip && /WHICH layers slide/.test(e.reason));
});

test("every group shape the mapper emits is priceable by the engine", () => {
  for (const cfg of [ORNITH, HY4, GRANITE]) {
    const groups = deriveGroups(cfg);
    assert.doesNotThrow(() => kvBytesPerToken(groups, "2"));
    assert.doesNotThrow(() => kvBytesPerSequence(groups, 32768, "1"));
  }
});

// ──────────────────────────────────────────────────────── parameter counting

test("the geometry model reproduces a dense model's published total exactly", () => {
  const g = geometryParams(GRANITE);
  // 100352x4096x2 embeddings + 64 x (4096x32x128x2 + 4096x8x128x2) attention
  // + 3x4096x32768x64 MLP. The Hub publishes 29.28B for this repo.
  assert.equal(g.total, 29276241920n);
  assert.equal(g.active, g.total, "a dense model reads every parameter it holds");
  assert.equal(g.moe, false);
});

test("MTP heads count toward the total but never toward active parameters", () => {
  const withMtp = geometryParams(HY4);
  const withoutMtp = geometryParams({ ...HY4, num_nextn_predict_layers: 0 });
  assert.ok(withMtp.total > withoutMtp.total, "an MTP head is resident weight");
  assert.equal(withMtp.active, withoutMtp.active, "an MTP head does not run in ordinary decode");
  // Skipping this is what put Hy4-preview 2.3% under its published total and
  // caused the first dry run to discard it.
  assert.ok(withMtp.total - withoutMtp.total > 9_000_000_000n);
});

test("a vendor-declared -A<n>B suffix outranks the derivation", () => {
  const p = deriveParams("ornith-ai/Ornith-1.5-35B-A3B", ORNITH, 35_952_000_000n);
  assert.equal(p.active_params_b, "3");
  assert.equal(p.active_basis, "declared");
  assert.equal(p.params_b, "35.95", "params come from the safetensors index, never the name");
});

test("a vendor-declared active count does not depend on the derivation it OUTRANKS", () => {
  // The precedence is only real if it short-circuits. geometryParams needs
  // fields nothing but the DERIVATION uses — vocab_size here — so calling it
  // first made a PUBLISHED figure hostage to an unpublished one and skipped a
  // model whose active count was never in doubt.
  const { vocab_size, ...noVocab } = ORNITH.text_config;
  const cfg = { ...ORNITH, text_config: noVocab };
  assert.throws(
    () => geometryParams(cfg),
    (e) => e instanceof Skip && /missing vocab_size/.test(e.reason),
    "the derivation genuinely cannot run on this config — otherwise this proves nothing",
  );

  const p = deriveParams("ornith-ai/Ornith-1.5-35B-A3B", cfg, 35_952_000_000n);
  assert.equal(p.active_params_b, "3", "the vendor's own figure, unreachable by derivation here");
  assert.equal(p.active_basis, "declared");
  assert.equal(p.params_b, "35.95", "still the safetensors index, never the name");
  assert.equal(p.is_moe, true, "an expert count is a direct config read, not a geometry result");
  assert.equal(p.fit, null, "nothing was derived, so there is no fit to report");
});

test("an MoE whose geometry cannot reproduce the published total is REFUSED, not priced as dense", () => {
  // serving.js:weightBytes treats a null active count as equal to total, which
  // prices an MoE as dense and overstates bandwidth cost by the expert ratio. So
  // a geometry model that does not fit must refuse rather than fall back.
  assert.throws(
    () => deriveParams("someorg/Unnamed-MoE", ORNITH, 999_000_000_000n),
    (e) => e instanceof Skip && /does not reproduce the published total/.test(e.reason),
  );
});

test("a dense model needs no declaration and no falsifier", () => {
  const p = deriveParams("ibm-granite/granite-4.2-30b", GRANITE, 29_283_000_000n);
  assert.equal(p.active_basis, "dense");
  assert.equal(p.active_params_b, p.params_b);
});

// ──────────────────────────────────────────────────────── the originals screen

test("the screen keeps instruct tunes and drops containers", () => {
  const keep = {
    pipeline_tag: "text-generation",
    library_name: "transformers",
    tags: ["transformers", "safetensors", "text-generation", "base_model:finetune:Qwen/Qwen3-8B-Base"],
  };
  assert.equal(screen(keep), null, "base_model:finetune: marks an instruct tune — the thing people serve");

  assert.match(
    screen({ pipeline_tag: "text-generation", tags: ["gguf", "text-generation"] }) ?? "",
    /GGUF container/,
  );
  assert.match(
    screen({ pipeline_tag: "text-generation", tags: ["base_model:quantized:Qwen/Qwen3.8-27B"] }) ?? "",
    /derivative repo/,
  );
  assert.match(
    // Breeze-TTS-2 carries a text-generation TAG while its pipeline_tag is
    // text-to-speech. The Hub's own classification outranks the tag list.
    screen({ pipeline_tag: "text-to-speech", tags: ["text-generation"] }) ?? "",
    /not text-generation/,
  );
});

test("same-lab finetunes stay first-party while cross-lab finetunes resolve", () => {
  const same = {
    id: "Qwen/Qwen3.8-27B-Instruct",
    pipeline_tag: "text-generation",
    tags: ["base_model:finetune:Qwen/Qwen3.8-27B-Base"],
  };
  const cross = {
    id: "SomeBuilder/Qwen3.8-27B-s1-mini",
    pipeline_tag: "text-generation",
    tags: ["base_model:finetune:Qwen/Qwen3.8-27B"],
  };
  assert.equal(screen(same), null);
  assert.match(screen(cross) ?? "", /derivative repo/);
  assert.deepEqual(derivativeBase(cross), {
    kind: "finetune",
    base: "Qwen/Qwen3.8-27B",
    tag: "base_model:finetune:Qwen/Qwen3.8-27B",
  });
});

test("base resolution follows a frozen two-hop chain to the main lab", async () => {
  const rows = new Map([
    ["Middle/Quantized", {
      id: "Middle/Quantized",
      tags: ["base_model:adapter:MainLab/Base"],
    }],
    ["MainLab/Base", {
      id: "MainLab/Base",
      tags: [],
    }],
  ]);
  const resolved = await resolveBase({
    id: "ThirdParty/Upload",
    tags: ["base_model:quantized:Middle/Quantized"],
  }, {
    fetchModel: async (id) => rows.get(id),
  });
  assert.equal(resolved.id, "MainLab/Base");
  assert.equal(resolved.hops, 2);
  assert.deepEqual(resolved.path, ["ThirdParty/Upload", "Middle/Quantized", "MainLab/Base"]);
});

// ─────────────────────────────────────── the engine refuses what we refuse

test("the engine and the mapper agree on what is unrepresentable", () => {
  // If these two ever diverge, the builder ships a row that refuses in the user's
  // browser — which is why the mapper's kind table is not allowed a default.
  assert.throws(
    () => kvBytesPerToken([{ kind: "conv", layers: 4 }], "2"),
    (e) => e instanceof ServingRefusal && e.code === "unknown_attention_kind",
  );
});

// ─────────────────────────────────────── late-2026 HF shapes & mandatory seeds

const DEEPSEEK_V4_1_FLASH_CFG = {
  architectures: ["DeepseekV4ForCausalLM"],
  model_type: "deepseek_v4",
  hidden_size: 4096,
  vocab_size: 129280,
  num_hidden_layers: 40,
  first_k_dense_replace: 2,
  intermediate_size: 16384,
  moe_intermediate_size: 1536,
  n_routed_experts: 384,
  num_experts_per_tok: 8,
  n_shared_experts: 1,
  num_nextn_predict_layers: 3,
  max_position_embeddings: 1048576,
  num_attention_heads: 64,
  num_key_value_heads: 1,
  head_dim: 512,
  q_lora_rank: 1536,
  qk_nope_head_dim: 128,
  qk_rope_head_dim: 64,
  v_head_dim: 128,
  sliding_window: 128,
  kv_source_layer_ids: [13, 25, 37, 39],
  compress_ratios: Array.from({ length: 40 }, (_, i) => (i === 39 ? 1 : 2)),
  engram_num_embeddings: [15193600, 12928000],
  engram_head_dim: 3500,
};

// Compiler inputs and safetensors total from RecursiveSI/flint at this Hub revision.
const FLINT_SHA = "2a247be0c0aec895ccb0ac7ca92229ec6df37288";
const FLINT_SAFETENSORS_TOTAL = 39_785_287_456n;
const FLINT_FULL_LAYERS = new Set([0, 1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 48]);
const FLINT_CFG = {
  architectures: ["FlintForCausalLM"],
  model_type: "flint",
  hidden_size: 2048,
  vocab_size: 150144,
  num_hidden_layers: 49,
  mlp_only_layers: [0, 1],
  intermediate_size: 6144,
  moe_intermediate_size: 512,
  num_experts: 256,
  num_experts_per_tok: 6,
  shared_expert_intermediate_size: 1024,
  max_position_embeddings: 262144,
  num_attention_heads: 32,
  num_key_value_heads: 4,
  head_dim: 128,
  sliding_window: 513,
  tie_word_embeddings: false,
  layer_types: Array.from({ length: 49 }, (_, i) =>
    FLINT_FULL_LAYERS.has(i) ? "full_attention" : "sliding_attention"),
};

const KIMI_LINEAR_48B_CFG = {
  architectures: ["KimiLinearForCausalLM"],
  model_type: "kimi_linear",
  hidden_size: 2304,
  vocab_size: 163840,
  num_hidden_layers: 27,
  first_k_dense_replace: 1,
  intermediate_size: 9216,
  moe_intermediate_size: 1024,
  num_experts: 256,
  num_experts_per_token: 8,
  num_shared_experts: 1,
  max_position_embeddings: 1048576,
  num_attention_heads: 32,
  kv_lora_rank: 512,
  qk_nope_head_dim: 128,
  qk_rope_head_dim: 0,
  v_head_dim: 128,
  mla_use_nope: true,
  linear_attn_config: {
    kda_layers: Array.from({ length: 27 }, (_, i) => i + 1).filter((l) => ![4, 8, 12, 16, 20, 24, 27].includes(l)),
    full_attn_layers: [4, 8, 12, 16, 20, 24, 27],
    head_dim: 128,
    num_heads: 32,
  },
};

const GEMMA_4_31B_IT_CFG = {
  architectures: ["Gemma4ForConditionalGeneration"],
  model_type: "gemma4",
  text_config: {
    hidden_size: 5376,
    vocab_size: 262144,
    num_hidden_layers: 60,
    num_kv_shared_layers: 20,
    intermediate_size: 21504,
    max_position_embeddings: 262144,
    num_attention_heads: 32,
    num_key_value_heads: 8,
    num_global_key_value_heads: 4,
    head_dim: 256,
    global_head_dim: 512,
    attention_k_eq_v: true,
    sliding_window: 1024,
    layer_types: Array.from({ length: 60 }, (_, i) => ((i + 1) % 6 === 0 ? "full_attention" : "sliding_attention")),
  },
};

const NEMOTRON_NAS_CFG = {
  architectures: ["DeciLMForCausalLM"],
  model_type: "nemotron-nas",
  hidden_size: 8192,
  vocab_size: 128256,
  num_hidden_layers: 4,
  num_attention_heads: 64,
  max_position_embeddings: 131072,
  block_configs: [
    { attention: { n_heads_in_group: 8 }, ffn: { ffn_mult: 1.5 } },
    { attention: { no_op: true }, ffn: { ffn_mult: 2.0 } },
    { attention: { n_heads_in_group: 16 }, ffn: { no_op: true } },
    { attention: { n_heads_in_group: 8 }, ffn: { ffn_mult: 1.5 } },
  ],
};

test("late-2026 HF shapes (DeepSeek-V4.1-Flash CSA2, Flint, Kimi-Linear, Gemma-4 KV-sharing K=V, Nemotron-NAS) derive exact groups and parameters", () => {
  // 1. DeepSeek-V4.1-Flash CSA2: 40 SWA + 3 compressed MLA (ratio 2, 68B index) + 1 uncompressed MLA (68B index)
  const dsGroups = deriveGroups(DEEPSEEK_V4_1_FLASH_CFG);
  assert.deepEqual(dsGroups, [
    { kind: "sliding", layers: 40, kv_heads: 1, head_dim: 576, tensors: 1, window_tokens: 128 },
    { kind: "mla", layers: 3, kv_lora_rank: 512, qk_rope_head_dim: 0, compress_ratio: 2, index_bytes_per_entry: 68 },
    { kind: "mla", layers: 1, kv_lora_rank: 512, qk_rope_head_dim: 0, compress_ratio: 1, index_bytes_per_entry: 68 },
  ]);
  // Global CSA2 groups (groups[1..2]) at FP4 (0.5625 B/el) grow at exactly 890 B/tok:
  // 3 * ((512 * 0.5625 + 68) / 2) + 1 * (512 * 0.5625 + 68) = 534 + 356 = 890 B/tok.
  assert.equal(formatHalfUp(kvBytesPerToken(dsGroups.slice(1), "0.5625"), 0), "890");
  // Unverified DeepSeek-V4 (without dspark_csa2) still skips cleanly.
  assert.throws(() => deriveGroups(DEEPSEEK_V4), (e) => e instanceof Skip);

  const dsGeom = geometryParams(DEEPSEEK_V4_1_FLASH_CFG);
  assert.equal(dsGeom.offload_kind, "engram");
  assert.ok(dsGeom.offload_params > 90_000_000_000n);
  const dsParams = deriveParams("deepseek-ai/DeepSeek-V4.1-Flash-1017", DEEPSEEK_V4_1_FLASH_CFG, dsGeom.total);
  assert.ok(Number(dsParams.gpu_backbone_params_b) < Number(dsParams.params_b));
  assert.equal(dsParams.host_offload_kind, "engram");

  const flintGroups = deriveGroups(FLINT_CFG);
  assert.deepEqual(flintGroups, [
    { kind: "full", layers: 14, kv_heads: 4, head_dim: 128, tensors: 2 },
    { kind: "sliding", layers: 35, kv_heads: 4, head_dim: 128, tensors: 2, window_tokens: 513 },
  ]);
  const flintParams = deriveParams("RecursiveSI/flint", FLINT_CFG, FLINT_SAFETENSORS_TOTAL);
  assert.equal(flintParams.params_b, "39.79");
  assert.equal(flintParams.active_params_b, "2.82");
  assert.throws(
    () => deriveParams("RecursiveSI/flint", { ...FLINT_CFG, num_experts: 128 }, FLINT_SAFETENSORS_TOTAL),
    (err) => err instanceof Skip && /does not reproduce the published total/.test(err.reason),
  );

  // 3. Kimi-Linear: synthesizes 20 linear + 7 MLA (nope -> rope=0) from 1-based full_attn_layers
  const kimiGroups = deriveGroups(KIMI_LINEAR_48B_CFG);
  assert.deepEqual(kimiGroups, [
    { kind: "linear", layers: 20, state_bytes_per_seq: null },
    { kind: "mla", layers: 7, kv_lora_rank: 512, qk_rope_head_dim: 0 },
  ]);

  // 4. Gemma-4-31B-it: image-text-to-text text_config, drops last 20 KV-shared layers -> 34 SWA + 6 full Unified K=V (tensors=1, dim=512, kv_heads=4)
  assert.equal(screen({ id: "google/gemma-4-31B-it", pipeline_tag: "image-text-to-text", tags: ["safetensors"] }), null);
  const gemmaGroups = deriveGroups(GEMMA_4_31B_IT_CFG);
  assert.deepEqual(gemmaGroups, [
    { kind: "sliding", layers: 34, kv_heads: 8, head_dim: 256, tensors: 2, window_tokens: 1024 },
    { kind: "full", layers: 6, kv_heads: 4, head_dim: 512, tensors: 1 },
  ]);

  // 5. Nemotron-NAS: skips no_op attention block, groups 2x 8kv + 1x 4kv
  const nasGroups = deriveGroups(NEMOTRON_NAS_CFG);
  assert.deepEqual(nasGroups, [
    { kind: "full", layers: 2, kv_heads: 8, head_dim: 128, tensors: 2 },
    { kind: "full", layers: 1, kv_heads: 4, head_dim: 128, tensors: 2 },
  ]);
});

test("mandatory seeds fail closed on HTTP 503 or revision race, and preserve exact pinned IDs regardless of trending rank or twin dedup", async () => {
  const basePrevious = {
    models: [
      { id: "qwen3-8b", label: "Qwen3 8B", params_b: "8.2", active_params_b: "8.2", context_default: 32768, context_max: 131072, basis: "cited", groups: [{ kind: "full", layers: 36, kv_heads: 8, head_dim: 128, tensors: 2 }] },
      { id: "gemma-4-31b", label: "Gemma 4 31B", params_b: "31", active_params_b: "31", context_default: 32768, context_max: 262144, basis: "cited", groups: [{ kind: "full", layers: 10, kv_heads: 4, head_dim: 512, tensors: 1 }] },
      { id: "qwen3-next-80b-a3b", label: "Qwen3 Next 80B", params_b: "80", active_params_b: "3", context_default: 32768, context_max: 262144, basis: "cited", groups: [{ kind: "full", layers: 12, kv_heads: 2, head_dim: 256, tensors: 2 }] },
      { id: "deepseek-v3", label: "DeepSeek V3", params_b: "671", active_params_b: "37", context_default: 32768, context_max: 163840, basis: "cited", groups: [{ kind: "mla", layers: 61, kv_lora_rank: 512, qk_rope_head_dim: 64 }] },
      { id: "custom", label: "Custom", params_b: "70", active_params_b: "70", context_default: 8192, context_max: null, basis: "assumed", groups: [{ kind: "full", layers: 80, kv_heads: 8, head_dim: 128, tensors: 2 }] },
    ],
    accelerators: { h100: { bandwidth_gb_s: "3350" } },
    weight_quantization: { fp8: { bytes_per_param: "1" } },
    kv_quantization: { fp8: { bytes_per_element: "1" }, fp4: { bytes_per_element: "0.5625" } },
    runtimes: { vllm: { bandwidth_efficiency: "0.65" } },
    tensor_parallel: { efficiency_per_extra_gpu: "0.92" },
    vram_overhead_fraction: { value: "0.1" },
  };

  const flintSha = FLINT_SHA;

  // Case 9a: RecursiveSI/flint returning HTTP 503 throws MandatorySeedError before any output can publish
  await assert.rejects(
    () => buildServingModels({
      observedAt: "2026-11-18",
      previous: basePrevious,
      mandatorySeeds: [{ repo: "RecursiveSI/flint", id: "flint" }],
      fetchText: async (url) => {
        if (url.includes("RecursiveSI/flint")) throw new HubHttpError(url, 503);
        throw new Error(`Unexpected URL ${url}`);
      },
    }),
    (err) => err instanceof MandatorySeedError && err.repoId === "RecursiveSI/flint" && /503/.test(err.message),
  );

  // Case 9b: Revision advancement mismatch between list entry sha and detail sha refuses cleanly
  await assert.rejects(
    () => compileModel(
      { id: "RecursiveSI/flint", sha: "old_sha_11111111111111111111111111111111" },
      "2026-11-18",
      {
        pinnedId: "flint",
        fetchText: async (url) => {
          if (url.includes("/api/models/RecursiveSI/flint")) {
            return JSON.stringify({
              id: "RecursiveSI/flint",
              sha: flintSha,
              gated: false,
              safetensors: { total: String(flintGeom.total) },
            });
          }
          throw new Error(`Unexpected URL ${url}`);
        },
      },
    ),
    (err) => err instanceof Skip && /repository ref advanced between discovery and metadata fetch/.test(err.reason),
  );

  // Case 9c: Mandatory seed keeps exact pinned ID "flint" even when absent from trending and when a higher-ranked trending twin shares identical architecture
  const built = await buildServingModels({
    observedAt: "2026-11-18",
    previous: basePrevious,
    mandatorySeeds: [{ repo: "RecursiveSI/flint", id: "flint" }],
    keep: 5,
    pool: 5,
    fetchText: async (url) => {
      if (url.includes("/api/models?")) {
        return JSON.stringify([
          { id: "TwinOrg/Flint-Clone", pipeline_tag: "text-generation", tags: ["safetensors"], trendingScore: 9999, sha: flintSha },
        ]);
      }
      if (url.includes("/api/models/RecursiveSI/flint")) {
        return JSON.stringify({
          id: "RecursiveSI/flint",
          sha: flintSha,
          gated: false,
          downloads: 42000,
          likes: 500,
          safetensors: { total: String(flintGeom.total) },
        });
      }
      if (url.includes(`/RecursiveSI/flint/resolve/${flintSha}/config.json`)) {
        return JSON.stringify(FLINT_CFG);
      }
      if (url.includes("/api/models/TwinOrg/Flint-Clone")) {
        return JSON.stringify({
          id: "TwinOrg/Flint-Clone",
          sha: flintSha,
          gated: false,
          downloads: 999999,
          likes: 9999,
          safetensors: { total: String(flintGeom.total) },
        });
      }
      if (url.includes(`/TwinOrg/Flint-Clone/resolve/${flintSha}/config.json`)) {
        return JSON.stringify(FLINT_CFG);
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  });
  const flintRow = built.models.find((m) => m.id === "flint");
  assert.ok(flintRow, "pinned mandatory seed id 'flint' must survive regardless of trending rank or twin dedup");
  assert.equal(flintRow.revision, flintSha);
  assert.ok(built.skipped.some((s) => s.id === "TwinOrg/Flint-Clone" && /RecursiveSI\/flint/.test(s.reason)));
});