#!/usr/bin/env node
// build-serving-models.mjs — stage 3/3 of the refresh command (SPEC v0.4 §6.6.7).
//
// WHY THIS EXISTS. The v0.3 serving presets were hand-curated on 2026-08-29 and
// went stale the way every hand-curated list goes stale: silently, while still
// rendering perfectly. A calculator whose newest preset is a generation behind
// does not look broken — it looks confident and answers the wrong question, which
// is the failure mode this whole codebase is built to avoid.
//
// WHAT IT DOES. Ranks open-weight text-generation repos on the Hugging Face Hub,
// screens out the re-uploads, and DERIVES each survivor's serving shape from its
// own config.json: the layer groups, the KV geometry, and the parameter counts.
// Nothing here is a benchmark and nothing is hand-entered.
//
// WHY NOT A CRON. Same reason refresh-pricing.mjs is a command: GitHub silently
// disables scheduled workflows after 60 days of default-branch inactivity, so a
// green Actions tab is a freshness signal you cannot trust — and a freshness
// signal you cannot trust is worse than none, because it is believed. The
// client's SourceStatus envelope reading `provenance.observed` stays the only
// authority on staleness.
//
// THE TWO REFUSALS THAT MATTER. This builder skips loudly rather than emitting a
// plausible row, in exactly two places, because both failures would be INVISIBLE
// downstream:
//
//   1. An attention shape outside {full, sliding, linear, mla}. serving.js
//      throws ServingRefusal('unknown_attention_kind') on those, so a row that
//      cannot map would ship a preset that refuses in the user's browser.
//   2. A mixture-of-experts model whose ACTIVE parameter count cannot be
//      established. serving.js:weightBytes treats a null activeParamsB as EQUAL
//      TO total, which prices an MoE as dense and overstates read_per_step by the
//      expert ratio — roughly 10x on a 35B-A3B, with nothing on screen saying so.
//
// Every skip lands in the output's `skipped[]` with its reason, because a silent
// drop reads as "the Hub had nothing newer" — the precise misreading that made
// this script necessary.
//
// Run: node scripts/build-serving-models.mjs [--dry-run] [--sort=trendingScore]
//      [--limit=10] [--candidates=40] [--min-params-b=0.5]   (Node >= 20, no deps)
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseJSONExact } from "../tco-calculator/exact.js";

const UA = "factor-io-tco-ingestion/1.0 (static-site pricing snapshot; contact admin@factor-io.com)";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_DIR = `${ROOT}tco-calculator/data/`;
const OUT_PATH = `${DATA_DIR}serving-models.json`;
const HUB = "https://huggingface.co";

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
// trendingScore, NOT downloads. Cumulative downloads is a LIFETIME INTEGRAL, so
// it ranks by how long a repo has existed: the live downloads top-10 is gpt2
// (2022), facebook/opt-125m (2022), three Qwen2.5 checkpoints (2024) and a
// trl-internal-testing CI fixture. Sorting a "latest models" refresh by downloads
// would make the preset list OLDER, which is the opposite of the point.
const SORT = flag("sort", "trendingScore");
const KEEP = intFlag("limit", 10); // number of models KEPT, not candidates examined
const POOL = intFlag("candidates", 40);
const MIN_PARAMS_B = flag("min-params-b", "0.5");

// ---------------------------------------------------------------- shape guard
// Matching build-gpu-pricing.mjs: a silently-empty result ships a calculator that
// still renders and still computes while every model row is quietly absent. Every
// parse asserts its shape and throws WITH WHAT IT ACTUALLY SAW, so the next
// maintainer does not have to rediscover the feed in a browser.
class ShapeError extends Error {
  constructor(source, expected, observed) {
    super(`${source}: shape assertion failed — expected ${expected}; observed ${observed}`);
    this.name = "ShapeError";
    this.source = source;
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

// A per-model refusal. Distinct from ShapeError: a Skip means THIS repo cannot be
// expressed, not that the feed is broken. One repo skipping never fails the run.
export class Skip extends Error {
  constructor(reason, detail = null) {
    super(reason);
    this.name = "Skip";
    this.reason = reason;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------- fetch layer
async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

// The Hub's own envelopes, where safetensors.total feeds exact arithmetic below.
const fetchHubJSON = async (url) => parseJSONExact(await fetchText(url));

// A model's config.json is THIRD-PARTY JSON and is parsed with plain JSON.parse,
// deliberately differing from the parseJSONExact house style. Every field read
// from it is a small integer or a string — layer counts, head dims, expert counts,
// vocab size — all exactly representable in IEEE-754 and all converted to BigInt
// before any arithmetic. Meanwhile a config carries unrelated float literals we
// never read (rms_norm_eps, routed_scaling_factor, rope factors), and
// parseJSONExact THROWS on a malformed literal — so using it here would let a
// stray number in a field we ignore drop an otherwise-fine model.
async function fetchConfig(url) {
  return JSON.parse(await fetchText(url));
}

// ------------------------------------------------------------ the originals screen
//
// A ranked Hub list is not a list of models; it is a list of REPOSITORIES, and
// several of the top entries are the same model re-uploaded in another container.
// Pricing those separately would show a buyer four rows that are one decision.
const DERIVATIVE_TAG = /^base_model:(quantized|adapter|merge):/;
const CONVERSION_LIB = new Set(["llama.cpp", "mlx", "Model Optimizer", "peft", "gguf"]);

export function screen(m) {
  // pipeline_tag is the Hub's OWN classification and outranks the tag list: a
  // text-to-speech model can carry a "text-generation" tag and does.
  if (m.pipeline_tag !== "text-generation") {
    return `pipeline_tag is ${JSON.stringify(m.pipeline_tag ?? null)}, not text-generation`;
  }
  const tags = Array.isArray(m.tags) ? m.tags : [];
  if (tags.includes("gguf")) return "GGUF container — a re-upload of another repo's weights";
  const derived = tags.find((t) => DERIVATIVE_TAG.test(t));
  if (derived) return `derivative repo (${derived})`;
  if (m.library_name && CONVERSION_LIB.has(m.library_name)) {
    return `library_name ${m.library_name} marks a conversion, not an original`;
  }
  // base_model:finetune: is deliberately NOT screened. An instruct tune IS the
  // thing people serve — Qwen/Qwen3-8B and Qwen/Qwen2.5-7B-Instruct both carry
  // that tag, and dropping it would drop nearly every model worth pricing.
  return null;
}

// ------------------------------------------------------------- config accessors
// Multimodal repos nest the language model under text_config and leave a vision
// tower at the top level. Reading the top level gets you the vision tower's
// dimensions, which are wrong in a way that still produces a number.
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
//
// The mapping is an EXPLICIT table, never a default. A kind this table does not
// name is a kind whose cache behaviour we do not know, and guessing "full" for it
// would overstate VRAM for a linear layer and understate it for nothing — a bias
// with no upper bound and no label at the point of use.
const KIND_OF_LAYER_TYPE = new Map([
  ["full_attention", "full"],
  ["sliding_attention", "sliding"],
  ["chunked_attention", "sliding"],
  ["linear_attention", "linear"],
  ["mamba", "linear"],
  ["recurrent", "linear"],
  // DeepSeek Sparse Attention stores the SAME compressed latent cache as MLA and
  // only reads a top-k subset of it. This model prices cache SIZE, so mla is the
  // correct mapping; the sparse read affects compute, which a decode-bandwidth
  // roofline does not count and says so (SPEC §6.6.6).
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
  // q_lora_rank / o_lora_rank compress the QUERY and OUTPUT projections and say
  // nothing about the KV cache. DeepSeek-V4-Flash carries both plus
  // qk_rope_head_dim and NO kv_lora_rank, and its cache width is set by a
  // per-layer compress_ratios[] this model has no term for.
  if (rope !== null) throw new Skip("qk_rope_head_dim without kv_lora_rank — not classic MLA, cache width is not derivable from this config");
  const heads = int(lc.num_key_value_heads ?? lc.num_attention_heads, "num_key_value_heads");
  const dim = lc.head_dim !== null && lc.head_dim !== undefined
    ? int(lc.head_dim, "head_dim")
    : int(lc.hidden_size, "hidden_size") / int(lc.num_attention_heads, "num_attention_heads");
  if (dim <= 0n) throw new Skip("head_dim resolves to zero");
  return { mla: false, kv_heads: Number(heads), head_dim: Number(dim) };
}

/**
 * Layer groups: ONE group per kind, ordered by each kind's FIRST appearance in
 * layer_types[].
 *
 * Non-consecutive runs of a kind are coalesced rather than preserved. That is
 * legitimate only because the engine sums Σ bytes_per_token(g) x retained(g)
 * over groups, so N interleaved runs and one merged group are arithmetically
 * identical — the test "interleaved runs and merged groups price IDENTICALLY"
 * is that proof, and it is what licenses this shape. It is also the form the
 * hand-curated rows use and the only form the per-group editor can render.
 *
 * The engine's group form is per-LAYER-GROUP precisely because a real model mixes
 * kinds; layer_types[] is that same information as the vendor publishes it, so
 * the mapping is a tally rather than an interpretation.
 */
export function deriveGroups(cfg) {
  const lc = languageConfig(cfg);
  const shape = attentionShape(lc);
  const layerTypes = Array.isArray(lc.layer_types) ? lc.layer_types : null;
  const slidingWindow = lc.sliding_window ?? null;

  const mkGroup = (kind, layers) => {
    if (kind === "linear") return { kind: "linear", layers, state_bytes_per_seq: null };
    if (kind === "mla") {
      if (!shape.mla) throw new Skip("layer_types declares an MLA layer but the config has no kv_lora_rank");
      return { kind: "mla", layers, kv_lora_rank: shape.kv_lora_rank, qk_rope_head_dim: shape.qk_rope_head_dim };
    }
    if (shape.mla) {
      // A latent-cache model whose layer_types also names plain attention layers
      // would need two different cache widths; the config does not say which
      // layers use which, so it is not expressible.
      throw new Skip(`layer_types mixes ${kind} attention into an MLA config — per-layer cache width is undeclared`);
    }
    const g = { kind, layers, kv_heads: shape.kv_heads, head_dim: shape.head_dim, tensors: 2 };
    if (kind === "sliding") {
      if (slidingWindow === null) throw new Skip("sliding layers declared but sliding_window is absent");
      g.window_tokens = Number(int(slidingWindow, "sliding_window"));
    }
    return g;
  };

  if (layerTypes) {
    // Layers of one kind share one shape in this derivation, so N interleaved runs
    // and ONE merged group per kind are arithmetically identical: the engine sums
    // Σ bytes_per_token(g) x retained_tokens(g) over groups, and both forms give
    // (l1 + l2) x shape x retained. Merged is also the form the hand-curated rows
    // use — Gemma is "50 sliding + 10 full", not ten alternating pairs — and the
    // form the per-group editor can render, since Ornith's 4:1 interleave would
    // otherwise generate twenty editor blocks describing two shapes.
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

  // No layer_types: the stack is uniform, and the ONLY safe uniform reading is
  // "every layer behaves the same". A bare sliding_window with no per-layer
  // declaration is the trap — it means SOME layers slide, and treating all of
  // them as sliding understates KV while treating none as sliding overstates it.
  const layers = Number(int(lc.num_hidden_layers, "num_hidden_layers"));
  if (slidingWindow !== null && !shape.mla) {
    throw new Skip("sliding_window is set but no layer_types says WHICH layers slide — retention is not derivable");
  }
  return [mkGroup(shape.mla ? "mla" : "full", layers)];
}

// -------------------------------------------------------------- parameter counts
//
// params_b comes from safetensors.total, which the Hub computes from the actual
// tensor headers — authoritative, and the reason this script never reads a size
// off the repo name. active_params_b has no such published figure, so it is
// DERIVED, and the derivation must earn its trust: the same geometry model has to
// reproduce the published total before its unpublished active count is believed.
const THREE = 3n; // gate, up and down projections of a SwiGLU expert

export function geometryParams(cfg) {
  const lc = languageConfig(cfg);
  const hidden = int(lc.hidden_size, "hidden_size");
  const layers = int(lc.num_hidden_layers, "num_hidden_layers");
  const vocab = int(lc.vocab_size, "vocab_size");
  const heads = int(lc.num_attention_heads, "num_attention_heads");
  if (layers <= 0n) throw new Skip("num_hidden_layers is zero");

  // Multi-token-prediction heads are extra transformer layers that SIT IN THE
  // CHECKPOINT — so they count toward the published total — but do not run during
  // ordinary autoregressive decode, so they are not active parameters. Omitting
  // them is what put GLM-5.3-Flash 2.7% and Hy4-preview 2.3% under their published
  // totals; the fix is to count them, never to widen the falsifier around them.
  const mtp = intOr(lc.num_nextn_predict_layers ?? lc.mtp_num_hidden_layers, 0n);

  const embed = vocab * hidden * (lc.tie_word_embeddings === true ? 1n : 2n);

  // Attention. MLA factorises the projections, so its parameter count is a
  // different shape rather than a variant of the same one.
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
  } else {
    const kvHeads = int(lc.num_key_value_heads ?? lc.num_attention_heads, "num_key_value_heads");
    const headDim = lc.head_dim === null || lc.head_dim === undefined ? hidden / heads : int(lc.head_dim, "head_dim");
    attnPerLayer = hidden * heads * headDim * 2n + hidden * kvHeads * headDim * 2n;
  }

  const routed = lc.n_routed_experts ?? lc.num_experts ?? lc.num_local_experts ?? null;
  const denseInter = lc.intermediate_size ?? null;

  let bodyTotal = attnPerLayer * layers;
  let bodyActive = bodyTotal;
  let moe = false;

  if (routed === null) {
    if (denseInter === null) throw new Skip("neither an expert count nor intermediate_size — MLP width is unknown");
    const mlp = THREE * hidden * int(denseInter, "intermediate_size") * layers;
    bodyTotal += mlp;
    bodyActive += mlp;
  } else {
    moe = true;
    const perTok = lc.num_experts_per_tok ?? null;
    const moeInter = lc.moe_intermediate_size ?? null;
    if (perTok === null || moeInter === null) {
      throw new Skip("mixture of experts without num_experts_per_tok or moe_intermediate_size — active parameters are not derivable");
    }
    const nRouted = int(routed, "n_routed_experts");
    const nPerTok = int(perTok, "num_experts_per_tok");
    const inter = int(moeInter, "moe_intermediate_size");
    const shared = intOr(lc.n_shared_experts ?? lc.num_shared_experts, 0n);
    const sharedInter = shared > 0n ? intOr(lc.shared_expert_intermediate_size, inter) : 0n;

    // mlp_layer_types names the dense/sparse split when a model has one; without
    // it, a routed-expert count means every layer is sparse.
    const mlpTypes = Array.isArray(lc.mlp_layer_types) ? lc.mlp_layer_types : null;
    const sparseLayers = mlpTypes ? BigInt(mlpTypes.filter((t) => t !== "dense").length) : layers;
    const denseLayers = layers - sparseLayers;
    if (denseLayers > 0n) {
      if (denseInter === null) throw new Skip("a dense MLP layer is declared but intermediate_size is absent");
      const mlp = THREE * hidden * int(denseInter, "intermediate_size") * denseLayers;
      bodyTotal += mlp;
      bodyActive += mlp;
    }
    const sharedParams = THREE * hidden * sharedInter * shared * sparseLayers;
    const router = hidden * nRouted * sparseLayers;
    bodyTotal += THREE * hidden * inter * nRouted * sparseLayers + sharedParams + router;
    bodyActive += THREE * hidden * inter * nPerTok * sparseLayers + sharedParams + router;
  }

  // An MTP head is a copy of an ordinary layer, so it is counted as the average
  // one — resident, therefore in the total; not read during ordinary decode,
  // therefore absent from active.
  return { total: embed + bodyTotal + (bodyTotal / layers) * mtp, active: embed + bodyActive, moe };
}

// A decimal string of billions, exact — n/1e9 rendered by integer division so a
// 304,180,418,494-parameter model does not detour through a float on its way to
// becoming "304.18".
function billions(n, places = 2) {
  const scale = 10n ** BigInt(9 - places);
  const scaled = (n + scale / 2n) / scale; // half-up at the last kept place
  const whole = scaled / 10n ** BigInt(places);
  const frac = (scaled % 10n ** BigInt(places)).toString().padStart(places, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}

const DECLARED_ACTIVE = /-a(\d+(?:\.\d+)?)b(?:[-_.]|$)/i;

export function deriveParams(repoId, cfg, safetensorsTotal) {
  const total = safetensorsTotal;

  // Precedence (1): a vendor-declared "-A3B" outranks any derivation — it is the
  // model author's own statement of the figure, and it is what the model is
  // marketed as. So it has to SHORT-CIRCUIT, before geometryParams is called at
  // all. geometryParams throws Skip when a config omits a field only the
  // DERIVATION needs (vocab_size, an MLP width, an expert width), which made a
  // PUBLISHED active count hostage to the very derivation it outranks and
  // skipped models whose active count was never in doubt.
  const declared = DECLARED_ACTIVE.exec(repoId.split("/").pop() ?? "");
  if (declared) {
    // Routed experts are what make a model MoE — a direct config read that needs
    // none of the geometry model. It only labels the row (archSummary); no
    // figure is computed from it.
    const lc = languageConfig(cfg);
    const isMoe = (lc.n_routed_experts ?? lc.num_experts ?? lc.num_local_experts ?? null) !== null;
    // fit is null because nothing was derived: there is no claim here to falsify.
    return { params_b: billions(total, 2), active_params_b: declared[1], active_basis: "declared", is_moe: isMoe, fit: null };
  }

  const geom = geometryParams(cfg);

  // The falsifier. If the geometry model cannot reproduce a PUBLISHED total to
  // within 2%, it does not fit this architecture, and a model that does not fit
  // has not earned the right to emit an UNPUBLISHED active count. 2% absorbs the
  // norms, biases and tied-embedding details this count deliberately omits.
  const diff = geom.total > total ? geom.total - total : total - geom.total;
  const withinTolerance = diff * 100n <= total * 2n;
  const fit = {
    geometry_params: billions(geom.total, 3),
    published_params: billions(total, 3),
    within_2_percent: withinTolerance,
  };
  if (!geom.moe) {
    return { params_b: billions(total, 2), active_params_b: billions(total, 2), active_basis: "dense", is_moe: false, fit };
  }
  if (!withinTolerance) {
    throw new Skip(
      "mixture of experts whose active parameter count is not derivable — the geometry model does not reproduce the published total",
      `geometry ${fit.geometry_params}B vs published ${fit.published_params}B`,
    );
  }
  // Scale the derived active count by the same factor that reconciles the derived
  // total to the published one, so the ratio the roofline actually uses
  // (active/total) is carried on the authoritative denominator.
  const active = (geom.active * total) / geom.total;
  return { params_b: billions(total, 2), active_params_b: billions(active, 2), active_basis: "derived", is_moe: true, fit };
}

// ---------------------------------------------------------------------- labelling
function archSummary(groups, isMoe) {
  const kinds = new Set(groups.map((g) => g.kind));
  const moe = isMoe ? ", MoE" : "";
  if (kinds.has("linear") && kinds.size > 1) return `linear/GDN hybrid${moe}`;
  if (kinds.has("linear")) return `linear attention${moe}`;
  if (kinds.has("mla")) return `MLA latent cache${moe}`;
  if (kinds.has("sliding") && kinds.has("full")) return `sliding-window hybrid${moe}`;
  if (kinds.has("sliding")) return `sliding window${moe}`;
  return isMoe ? "full attention, MoE" : "dense, full attention";
}

const slug = (repoId) => (repoId.split("/").pop() ?? repoId).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// What this calculator can actually tell two rows apart by. Everything the
// roofline reads is in here, so an identical signature means an identical price.
const shapeSignature = (m) => JSON.stringify([m.params_b, m.active_params_b, m.groups]);

// ------------------------------------------------------------------- the builder
async function compileModel(entry, observedAt) {
  const repoId = entry.id;
  const detail = await fetchHubJSON(`${HUB}/api/models/${repoId}?expand[]=safetensors&expand[]=config`);
  const totalRaw = detail?.safetensors?.total;
  if (totalRaw === null || totalRaw === undefined) {
    throw new Skip("no safetensors index — the Hub publishes no parameter count for this repo");
  }
  const total = int(totalRaw, "safetensors.total");
  const minParams = BigInt(Math.round(Number(MIN_PARAMS_B) * 1e9));
  if (total < minParams) {
    throw new Skip(`${billions(total, 3)}B parameters is below the --min-params-b floor of ${MIN_PARAMS_B}B`);
  }

  const configUrl = `${HUB}/${repoId}/resolve/main/config.json`;
  const cfg = await fetchConfig(configUrl);

  // A speculative-decoding draft head is a real repository holding real weights,
  // but it never serves traffic on its own — it proposes tokens a larger model
  // verifies, and its cost belongs to that model's deployment, not its own. The
  // trending list carries several (z-lab/Qwen3.8-27B-DFlash2 and
  // incoai/GLM-5.3-Flash-DFlash2 both declare DFlash2DraftModel), and each would
  // otherwise render as a 1-2B "model" a buyer could size a fleet against.
  const arch = Array.isArray(cfg.architectures) ? String(cfg.architectures[0] ?? "") : "";
  if (/draft|eagle|medusa/i.test(arch)) {
    throw new Skip(`${arch} is a speculative-decoding draft head, not a model that serves traffic on its own`);
  }

  const lc = languageConfig(cfg);
  const groups = deriveGroups(cfg);
  const params = deriveParams(repoId, cfg, total);

  const ctxMax = Number(intOr(lc.max_position_embeddings, 32768n));
  return {
    id: slug(repoId),
    label: `${repoId.split("/").pop()} — ${archSummary(groups, params.is_moe)}`,
    family: repoId.split("/")[0].toLowerCase(),
    architecture: groups.length > 1 ? "hybrid" : groups[0].kind,
    params_b: params.params_b,
    active_params_b: params.active_params_b,
    active_params_basis: params.active_basis,
    context_default: Math.min(32768, ctxMax),
    context_max: ctxMax,
    // No published per-token KV figure exists for a row nobody has hand-verified.
    // null is the honest value; the curated presets below keep theirs, and the
    // test suite falsifies the engine's arithmetic against those.
    kv_bytes_per_token_bf16_expected: null,
    basis: "derived",
    groups,
    note: `Derived from the repository's own config.json on ${observedAt}: ${groups.map((g) => `${g.layers} ${g.kind}`).join(" + ")} layer${groups.length > 1 || groups[0].layers > 1 ? "s" : ""}. Parameter total is the Hub's safetensors index; active parameters are ${params.active_basis === "declared" ? "the vendor's own -A<n>B declaration" : params.active_basis === "dense" ? "equal to total (no routed experts)" : `computed from the MoE geometry, which reproduced the published total to within 2% (${params.fit.geometry_params}B vs ${params.fit.published_params}B)`}. Nothing here is a benchmark and no per-token KV figure has been independently published for this row.`,
    source_url: `${HUB}/${repoId}`,
    config_url: configUrl,
    model_type: lc.model_type ?? cfg.model_type ?? null,
    hub_downloads: detail.downloads ?? entry.downloads ?? null,
    hub_likes: detail.likes ?? entry.likes ?? null,
    observed_at: observedAt,
  };
}

export async function buildServingModels({ observedAt, previous }) {
  const listUrl = `${HUB}/api/models?filter=text-generation&sort=${encodeURIComponent(SORT)}&direction=-1&limit=${POOL}`;
  const list = await fetchHubJSON(listUrl);
  mustShape(Array.isArray(list) && list.length > 0, "huggingface:list", "a non-empty array of model records", list);
  mustShape(typeof list[0]?.id === "string", "huggingface:list", "each record to carry a string id", list[0]);

  const kept = [];
  const skipped = [];
  for (const entry of list) {
    if (kept.length >= KEEP) break;
    const screened = screen(entry);
    if (screened) {
      skipped.push({ id: entry.id, reason: screened, detail: null });
      continue;
    }
    try {
      const model = await compileModel(entry, observedAt);
      // A dtype sibling carries no base_model:quantized: tag — zai-org publishes
      // GLM-5.3-Flash (FP8) and GLM-5.3-Flash-BF16 as separate repos — so the tag
      // screen cannot catch it. The shape can: two rows with the same parameter
      // counts and the same layer groups produce byte-identical VRAM, throughput
      // and cost, which makes them one row in a calculator and two rows of noise
      // in a dropdown. The higher-ranked repo wins and the twin is recorded.
      const twin = kept.find((k) => shapeSignature(k) === shapeSignature(model));
      if (twin) {
        skipped.push({
          id: entry.id,
          reason: `prices identically to ${twin.source_url.slice(HUB.length + 1)} — same parameter counts and same layer groups`,
          detail: "duplicate serving shape",
        });
        continue;
      }
      kept.push(model);
    } catch (e) {
      if (e instanceof Skip) {
        skipped.push({ id: entry.id, reason: e.reason, detail: e.detail });
        continue;
      }
      // A network or shape failure on ONE repo is still only one repo. It is
      // recorded as a skip rather than failing the run, because a Hub hiccup on
      // the eighth model should not discard the seven that resolved.
      skipped.push({ id: entry.id, reason: `fetch or parse failed — ${e.message}`, detail: e.name });
    }
  }

  // Everything the previous file held that this builder did NOT generate is
  // preserved verbatim, identified by the ABSENCE of basis:"derived" rather than
  // by a hardcoded id list that would drift out of step with the data. Those rows
  // are the engine's falsifiers (each carries a published kv_bytes_per_token
  // figure the test suite asserts against) plus the custom starting shape.
  const curated = (previous.models ?? []).filter((m) => m.basis !== "derived" && m.id !== "custom");
  const custom = (previous.models ?? []).filter((m) => m.id === "custom");
  // Every id must be unique across the WHOLE list: it is the <option> value and
  // the key tests/serving.test.mjs looks a falsifier up by. Two derived repos can
  // slug alike — Qwen3.8-27B-DFlash2 is published by more than one org, and the
  // first dry run emitted that row twice — and a derived slug can also shadow a
  // curated id. Both cases resolve here, org first and then a numeric suffix, so
  // an id is never silently doubled and a row is never dropped for a name clash.
  const taken = new Set([...curated, ...custom].map((m) => m.id));
  for (const m of kept) {
    if (!taken.has(m.id)) { taken.add(m.id); continue; }
    let next = `${m.family}-${m.id}`;
    for (let n = 2; taken.has(next); n++) next = `${m.family}-${m.id}-${n}`;
    m.id = next;
    taken.add(next);
  }

  return {
    ...previous,
    provenance: { ...previous.provenance, observed: observedAt },
    // The pre-v0.4 note claimed "every preset below reproduces a PUBLISHED
    // per-token KV figure". That was true of a file holding four hand-verified
    // rows and is FALSE the moment a derived row is prepended — and `...previous`
    // would carry the stale claim into every future refresh, so the note is
    // rewritten here rather than inherited from whatever the last file said.
    model_note: `This file holds TWO classes of row and they carry different warranties. A row tagged basis:"derived" was generated from the Hugging Face Hub by scripts/build-serving-models.mjs: its layer groups and parameter counts come from that repository's own config.json and safetensors index, and its kv_bytes_per_token_bf16_expected is null because no independently published per-token figure exists for it. A row carrying NO basis key is hand-curated, and its numeric kv_bytes_per_token_bf16_expected is a figure published by the cited source — tests/serving.test.mjs asserts the engine's own layer-group arithmetic lands on each one exactly. Those curated rows are therefore the ONLY independent falsifiers of the engine's arithmetic: a formula error cannot ship silently while they stand, which is why a refresh preserves them verbatim. Layer groups are the general form — one flat layer count cannot express a hybrid, and the curated architectures are precisely the cases where a flat count is wrong.`,
    models: [...kept, ...curated, ...custom],
    derived_note: `The rows tagged basis:"derived" above were generated by scripts/build-serving-models.mjs from the Hugging Face Hub on ${observedAt}, ranked by ${SORT}. Their layer groups and parameter counts come from each repository's own config.json and safetensors index — NOT from a benchmark and NOT from the model name. They carry no kv_bytes_per_token_bf16_expected because no independently published per-token figure exists for them; the hand-curated rows that follow keep theirs, and the test suite falsifies the engine's layer-group arithmetic against those four.`,
    skipped,
    skipped_note: `Candidates the mapper could not express, listed rather than dropped silently. A skip is a REFUSAL, not an absence: serving.js throws on an attention kind outside {full, sliding, linear, mla}, and it silently prices an MoE as dense when active parameters are unknown, so a row that cannot be derived must not be written. Hand-curate any row here that matters.`,
  };
}

// ------------------------------------------------------------------------- main
async function main() {
  const observedAt = new Date().toISOString().slice(0, 10);
  const previous = JSON.parse(await readFile(OUT_PATH, "utf8"));
  const doc = await buildServingModels({ observedAt, previous });

  const derived = doc.models.filter((m) => m.basis === "derived");
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`ranked by ${SORT} · examined ${POOL} candidates · kept ${derived.length}/${KEEP}\n`);
  console.log(`${pad("REPO", 42)}${pad("ID", 26)}${pad("PARAMS", 10)}${pad("ACTIVE", 22)}${pad("CTX", 9)}GROUPS`);
  for (const m of derived) {
    console.log(
      `${pad(m.source_url.slice(HUB.length + 1), 42)}${pad(m.id, 26)}${pad(`${m.params_b}B`, 10)}` +
      `${pad(`${m.active_params_b}B (${m.active_params_basis})`, 22)}` +
      `${pad(m.context_max, 9)}${m.groups.map((g) => `${g.layers}x${g.kind}`).join(" + ")}`,
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