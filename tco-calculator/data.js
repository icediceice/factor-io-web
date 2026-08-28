// data.js — client-side snapshot loader and selection state (SPEC §9).
//
// Kept separate from the pure engine on purpose: async + digest consistency
// fail differently from math. Two contracts live here:
//
// 1. ResourceRef inline|external union — the client resolves refs, never paths,
//    so adding per-model slices later is ADDITIVE without a MAJOR bump.
// 2. The selection race guard: beginSelection() issues a monotonic generation
//    and an AbortController; ONLY the current generation may commit state.
//    Selecting model A then model B can never render A's numbers under B's
//    selection — a stale substitution on a sales-facing tool is the worst
//    defect class this UI has. Digest mismatch or 404 gets a bounded retry,
//    then a VISIBLE gap — never a silent fallback to stale data.
import { staleBanner, newestObservedAt, sourceVerdict } from "./pricing.js";

const RETRIES = 2;
let generation = 0;
let currentAbort = null;

export function beginSelection() {
  generation += 1;
  if (currentAbort) currentAbort.abort();
  currentAbort = new AbortController();
  return { generation, signal: currentAbort.signal };
}

export function currentGeneration() {
  return generation;
}

export async function loadManifest(signal) {
  const res = await fetch("./tco-calculator/data/manifest.json", { signal });
  if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
  const manifest = await res.json();
  // SPEC 9.3: the client pins the manifest version it loaded and refuses a
  // mismatched major.
  const major = String(manifest.schema ?? "").split(".")[0];
  if (major !== "1") throw new Error(`unsupported manifest schema major: ${manifest.schema}`);
  return manifest;
}

// Resolve a ResourceRef to its JSON. external -> fetch + digest verify;
// inline -> data is already trusted (it shipped inside the digest-pinned manifest).
export async function resolveResource(manifest, key, signal) {
  const ref = manifest.resources?.[key];
  if (!ref) throw new Error(`unknown resource: ${key}`);
  if (ref.kind === "inline") return ref.data;
  if (ref.kind !== "external") throw new Error(`unknown ResourceRef kind: ${ref.kind}`);
  let lastError = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(`./tco-calculator/data/${ref.path}`, { signal });
      if (!res.ok) throw new Error(`resource HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const digestHex = await sha256Hex(buf);
      if (digestHex !== ref.digest) {
        throw new Error(`digest mismatch: expected ${ref.digest}, got ${digestHex}`);
      }
      return JSON.parse(new TextDecoder().decode(buf));
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }
  throw lastError;
}

async function sha256Hex(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// Freshness view for the current manifest (SPEC 5.5): newest observed_at across
// consumed sources, banner payload for expired ones, gap list for error ones.
export function freshnessView(manifest, now) {
  return {
    newest_observed_at: newestObservedAt(manifest.sources, now),
    banner: staleBanner(manifest.sources, now),
    errors: Object.values(manifest.sources ?? {}).filter((s) => sourceVerdict(s, now) === "error").map((s) => s.source_id),
    per_source: Object.fromEntries(Object.entries(manifest.sources ?? {}).map(([k, s]) => [k, { verdict: sourceVerdict(s, now), observed_at: s.observed_at, expires_at: s.expires_at }])),
  };
}