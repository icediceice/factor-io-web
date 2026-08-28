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

// ------------------------------------------------------------- offer assembly
// Every admitted offer resolves to exactly one member of the tariff union
// (SPEC 3.2). v0.1 admits chat/completion entries as token tariffs; entries that
// admit but resolve to no member are quarantined with the reason preserved.
const priceString = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") throw new TypeError("pricing: numeric feed value reached the compiler — parse feeds with parseJSONExact");
  const d = Dec.from(String(v));
  return d.toString();
};

function emptyOffer(identity) {
  return {
    ...identity,
    tariff: "none",
    state: "active",
    quarantine_reason: null,
    missing_streak: 0,
    expiration_date: null,
    prices: {},
    overrides: [],
    multipliers: {},
    tiered: [],
    ignored_fields: [],
    unknown_meter_fields: [],
    provenance: { source: identity.seller_source, logs: [] },
  };
}

export function compileLiteLLMEntry(key, entry) {
  const provider = typeof entry.litellm_provider === "string" && entry.litellm_provider
    ? entry.litellm_provider
    : (key.includes("/") ? key.split("/")[0] : "unknown");
  const offer = emptyOffer({
    offer_id: `litellm:${key}`,
    seller: provider,
    seller_source: "litellm",
    channel: "api",
    product: key, // the map key is the canonical slug — never a display name
    region: "*",
    purchase_term: "on_demand",
    display_name: key,
  });
  offer.ingest_mode = typeof entry.mode === "string" ? entry.mode : null;

  for (const [k, v] of Object.entries(entry)) {
    if (k === "tiered_pricing") continue;
    const cls = classifyLiteLLMField(k);
    if (cls.kind === "meter") {
      const p = priceString(v);
      if (p !== null) offer.prices[cls.key] = p;
    } else if (cls.kind === "uplift") {
      const p = priceString(v);
      if (p !== null) offer.multipliers[cls.key] = p;
    } else if (cls.kind === "stem_unknown") {
      offer.unknown_meter_fields.push({ key: k, stem: cls.stem });
    } else {
      offer.ignored_fields.push(k); // rule 1: ignore + log, offer stays active
    }
  }

  // tiered_pricing[] — range array; each range becomes threshold meters on the
  // range LOWER bound (strictly greater, uniform with the threshold grammar).
  // An unrecognized condition inside one tier entry skips THAT ENTRY only (rule 2).
  if (Array.isArray(entry.tiered_pricing)) {
    entry.tiered_pricing.forEach((tier, i) => {
      if (!tier || typeof tier !== "object" || !Array.isArray(tier.range) || tier.range.length !== 2
        || !Number.isFinite(tier.range[0])) {
        offer.provenance.logs.push({ rule: "tier_entry_skipped", index: i, reason: "unrecognized_tier_shape" });
        return;
      }
      const lo = tier.range[0];
      for (const [k, v] of Object.entries(tier)) {
        if (k === "range") continue;
        const cls = classifyLiteLLMField(k);
        if (cls.kind === "meter") {
          const p = priceString(v);
          if (p !== null) offer.prices[meterKey({ stem: cls.stem, threshold: lo > 0 ? lo : null, tier: `range${i}` })] = p;
        } else {
          offer.provenance.logs.push({ rule: "tier_entry_skipped", index: i, reason: `unrecognized_tier_field:${k}` });
          return;
        }
      }
    });
  }

  finishAdmission(offer);
  return offer;
}

// OpenRouter recognized base pricing keys — SPEC 3.1 inventory.
const OPENROUTER_KEY_MAP = {
  prompt: { stem: "input" },
  completion: { stem: "output" },
  input_cache_read: { stem: "cache_read" },
  input_cache_write: { stem: "cache_write" },
  request: { stem: "request", per: "request" },
  internal_reasoning: { stem: "reasoning" },
  web_search: { stem: "web_search", per: "call" },
  image: { stem: "image_in" },
  image_output: { stem: "image_out" },
  audio: { stem: "audio_in" },
  audio_output: { stem: "audio_out" },
  input_cache_write_1h: { stem: "cache_write", cacheAge: "1hr" },
};
const OVERRIDE_CONDITION_KEYS = new Set(["min_prompt_tokens", "utc_days", "utc_start", "utc_end"]);

function openRouterMeterKey(stemSpec, extra = {}) {
  return meterKey({ stem: stemSpec.stem, cacheAge: stemSpec.cacheAge ?? null, tier: "std", ...extra });
}

export function compileOpenRouterModel(model) {
  const offer = emptyOffer({
    offer_id: `openrouter:${model.canonical_slug ?? model.id}`,
    seller: "openrouter",
    seller_source: "openrouter",
    channel: "api",
    product: model.canonical_slug ?? model.id, // canonical slug — never the display name (F9)
    region: "*",
    purchase_term: "on_demand",
    display_name: model.name ?? model.id,
  });
  offer.ingest_mode = "chat";
  if (typeof model.expiration_date === "string" && model.expiration_date) {
    offer.expiration_date = model.expiration_date; // direct retirement signal
  }

  const pricing = model.pricing ?? {};
  for (const [k, v] of Object.entries(pricing)) {
    if (k === "overrides") continue;
    const spec = OPENROUTER_KEY_MAP[k];
    if (!spec) { offer.ignored_fields.push(`pricing.${k}`); continue; } // rule 1
    const p = priceString(v);
    if (p !== null) offer.prices[openRouterMeterKey(spec)] = p;
  }

  // pricing.overrides[] — structured conditional entries. Unrecognized CONDITION
  // field skips THAT ENTRY ONLY, offer survives (rule 2 — the vendor consumer
  // contract); unrecognized PRICE key inside an entry is dropped from the entry
  // (that key inherits the base price) and logged.
  if (Array.isArray(pricing.overrides)) {
    pricing.overrides.forEach((entry, i) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        offer.provenance.logs.push({ rule: "override_entry_skipped", index: i, reason: "not_an_object" });
        return;
      }
      const conditions = {};
      const prices = {};
      let bad = false;
      for (const [k, v] of Object.entries(entry)) {
        if (OVERRIDE_CONDITION_KEYS.has(k)) {
          if (k === "min_prompt_tokens") {
            if (!Number.isFinite(v)) { bad = true; break; }
            conditions.min_prompt_tokens = v;
          } else if (k === "utc_days") {
            if (!Array.isArray(v) || !v.every((d) => typeof d === "string")) { bad = true; break; }
            conditions.utc_days = [...v];
          } else {
            if (!Number.isFinite(v)) { bad = true; break; }
            conditions[k] = v;
          }
        } else {
          const spec = OPENROUTER_KEY_MAP[k];
          if (!spec) {
            offer.provenance.logs.push({ rule: "override_price_key_dropped", index: i, key: k });
            continue;
          }
          const p = priceString(v);
          if (p !== null) prices[openRouterMeterKey(spec)] = p;
        }
      }
      if (bad) {
        offer.provenance.logs.push({ rule: "override_entry_skipped", index: i, reason: "unrecognized_condition_field" });
        return; // rule 2: skip the entry, keep the offer
      }
      if (Object.keys(prices).length === 0) {
        offer.provenance.logs.push({ rule: "override_entry_skipped", index: i, reason: "no_recognized_price_keys" });
        return;
      }
      offer.overrides.push({ conditions, prices });
    });
  }

  finishAdmission(offer);
  return offer;
}

// Admission: resolve the tariff union member; quarantine when none fits.
function finishAdmission(offer) {
  const hasToken = Object.keys(offer.prices).some((k) => TOKEN_STEMS.has(parseMeterKey(k).stem));
  const hasCharacter = Object.keys(offer.prices).some((k) => {
    const stem = parseMeterKey(k).stem;
    return stem === "char_in" || stem === "char_out";
  });
  if (hasToken) offer.tariff = "token";
  else if (hasCharacter) offer.tariff = "character";
  else {
    offer.tariff = "none";
    offer.state = "quarantined";
    offer.quarantine_reason = "no_tariff_resolution";
  }
}