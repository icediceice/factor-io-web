// pricing.js — OfferContract IR, feed compilers, quote resolution (SPEC §3, §4).
//
// Two feed grammars, ONE intermediate representation:
//   LiteLLM    — suffix grammar on flat keys: <stem>_above_<N>k_tokens[_<tier>],
//                _flex/_priority/_batches tiers, _above_1hr cache age, regional
//                uplift multipliers, tiered_pricing[] ranges.
//   OpenRouter — structured pricing.overrides[] entries keyed on min_prompt_tokens
//                (STRICTLY greater), utc_days, utc_start/utc_end (wrap-aware,
//                start inclusive, end exclusive); later entries win PER KEY; keys
//                absent from an entry inherit the base price.
//
// Money enters as decimal strings ONLY (the builder uses parseJSONExact so
// numeric feed literals never detour through IEEE-754).
import { Dec, Rat, ZERO } from "./exact.js";

export const N_CONSECUTIVE_RETIRE = 3; // [ASSUMED — spec author; open decision O3]

// ---------------------------------------------------------------- meter keys
// Meter identity keeps its full structure (SPEC 3.2): stem × threshold ×
// cache-age × service tier × region. Canonical text form is the serialized key.
export function meterKey({ stem, threshold = null, cacheAge = null, tier = "std", region = "*" }) {
  let k = stem;
  if (threshold !== null) k += `|>${threshold}`;
  if (cacheAge) k += `|age=${cacheAge}`;
  if (tier && tier !== "std") k += `|tier=${tier}`;
  if (region && region !== "*") k += `|reg=${region}`;
  return k;
}

export function parseMeterKey(k) {
  const [stem, ...mods] = k.split("|");
  const m = { stem, threshold: null, cacheAge: null, tier: "std", region: "*" };
  for (const mod of mods) {
    if (mod.startsWith(">")) m.threshold = Number(mod.slice(1));
    else if (mod.startsWith("age=")) m.cacheAge = mod.slice(4);
    else if (mod.startsWith("tier=")) m.tier = mod.slice(5);
    else if (mod.startsWith("reg=")) m.region = mod.slice(4);
  }
  return m;
}

// Stems the v0.1 token workload consumes; everything else is carried for provenance.
export const TOKEN_STEMS = new Set(["input", "output", "cache_read", "cache_write", "request"]);

// ------------------------------------------------------- LiteLLM field grammar
// Modifier suffixes strip from the END, repeatedly, in any observed stacking
// order (live inventory: <stem>_above_1hr_above_200k_tokens, ..._above_272k_tokens_priority).
const LITELLM_TIERS = { _flex: "flex", _priority: "priority", _batches: "batches" };
const LITELLM_STEMS = [
  [/^(input)_cost_per_token$/, "input"],
  [/^(output)_cost_per_token$/, "output"],
  [/^cache_read_input_token_cost$/, "cache_read"],
  [/^cache_creation_input_token_cost$/, "cache_write"],
  [/^(input)_cost_per_character$/, "char_in"],
  [/^(output)_cost_per_character$/, "char_out"],
  [/^(input)_cost_per_image$/, "image_in"],
  [/^(output)_cost_per_image$/, "image_out"],
  [/^(input)_cost_per_image_token$/, "image_in_tok"],
  [/^(output)_cost_per_image_token$/, "image_out_tok"],
  [/^(input)_cost_per_audio_token$/, "audio_in_tok"],
  [/^(output)_cost_per_audio_token$/, "audio_out_tok"],
  [/^cache_read_input_audio_token_cost$/, "cache_read_audio"],
  [/^cache_creation_input_audio_token_cost$/, "cache_write_audio"],
  [/^(input)_cost_per_second$/, "op_in_second"],
  [/^(output)_cost_per_second$/, "op_out_second"],
  [/^(input)_cost_per_video_per_second$/, "op_video_second"],
  [/^(input)_cost_per_audio_per_second$/, "op_audio_second"],
  [/^(input)_cost_per_query$/, "op_query"],
  [/^search_context_cost_per_query$/, "op_query"],
  [/^ocr_cost_per_page$/, "op_page"],
  [/^code_interpreter_cost_per_session$/, "op_session"],
  [/^(input)_dbu_cost_per_token$/, "op_dbu_in"],
  [/^(output)_dbu_cost_per_token$/, "op_dbu_out"],
];
const LITELLM_UPLIFT_STEMS = [
  [/^regional_endpoint_uplift_multiplier$/, "endpoint"],
  [/^regional_processing_uplift_multiplier$/, "processing"],
];

function stemOf(rest) {
  for (const [re, stem] of LITELLM_STEMS) if (re.test(rest)) return stem;
  for (const [re, stem] of LITELLM_UPLIFT_STEMS) if (re.test(rest)) return stem;
  return null;
}

// Classify one LiteLLM key through the field grammar.
//   meter       — fully recognized: stem + known modifiers
//   uplift      — recognized regional multiplier (multiplies the priced meters)
//   stem_unknown— a known stem carrying an UNRECOGNIZED modifier: rule-3
//                 candidate; quarantines a quote only when it bears on the
//                 selected meter
//   ignored     — unknown offer-level field: rule-1 ignore+log, offer stays active
export function classifyLiteLLMField(key) {
  let rest = key;
  const mods = { threshold: null, cacheAge: null, tier: "std", region: "*" };
  let changed = true;
  while (changed) {
    changed = false;
    for (const [suffix, tier] of Object.entries(LITELLM_TIERS)) {
      if (rest.endsWith(suffix)) { rest = rest.slice(0, -suffix.length); mods.tier = tier; changed = true; break; }
    }
    if (!changed) {
      const m = /_above_(\d+)k_tokens$/.exec(rest);
      if (m) { rest = rest.slice(0, -m[0].length); mods.threshold = Number(m[1]) * 1000; changed = true; }
    }
    if (!changed && rest.endsWith("_above_1hr")) { rest = rest.slice(0, -"_above_1hr".length); mods.cacheAge = "1hr"; changed = true; }
    if (!changed && (rest.endsWith("_eu") || rest.endsWith("_us"))) {
      const region = rest.endsWith("_eu") ? "eu" : "us";
      const cut = rest.slice(0, -3);
      for (const [re] of LITELLM_UPLIFT_STEMS) {
        if (re.test(cut)) { rest = cut; mods.region = region; changed = true; break; }
      }
    }
  }
  const stem = stemOf(rest);
  if (stem) {
    if (LITELLM_UPLIFT_STEMS.some(([, s]) => s === stem)) {
      return { kind: "uplift", stem, key: meterKey({ stem, region: mods.region }) };
    }
    return { kind: "meter", stem, key: meterKey({ stem, ...mods }) };
  }
  // One trailing _chunk of an otherwise-known stem = unrecognized modifier.
  const cut = rest.lastIndexOf("_");
  if (cut > 0) {
    const head = rest.slice(0, cut);
    const headStem = stemOf(head);
    if (headStem) return { kind: "stem_unknown", stem: headStem, key };
  }
  return { kind: "ignored" };
}