// quotes/lib/kinds.mjs — the line-type vocabulary and the billing periods.
//
// `kind` answers "what sort of thing is this line" — service, hardware,
// software, licence, subscription, support, training. It is OPEN: the list
// lives in the settings row 'line.kinds', so the operator adds a product type
// by editing a setting rather than by shipping a release. Nothing in the
// pricing arithmetic branches on it; it only ever selects a display label.
//
// `billing_period` answers "how often is this charged" and is CLOSED, because
// computeTotals branches on it. A period this module does not know would fall
// out of every recurring bucket and silently understate a multi-year contract,
// so an unknown one is rejected at the door instead.
//
// Everything here reads settings and never hardcodes a business fact — the
// FALLBACK below is the single exception, and it exists only so that a
// malformed settings edit degrades to the pre-existing behaviour instead of
// taking the whole application down.

/** Billing periods, and how many of each fall in one month. Closed on purpose. */
export const BILLING_PERIODS = ['once', 'monthly', 'quarterly', 'yearly'];

/** Months in one billing cycle — drives the contract-term arithmetic. */
export const PERIOD_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };

/** What the vocabulary was before it became operator-editable. */
const FALLBACK = [
  { code: 'service', en: 'Service', th: 'บริการ' },
  { code: 'hardware', en: 'Hardware', th: 'ฮาร์ดแวร์' },
];

/**
 * Parse settings['line.kinds'] into [{code, en, th}].
 *
 * Deliberately total: a missing, empty, malformed or non-array value returns
 * FALLBACK rather than throwing. This function is called on the render path of
 * every quotation and invoice, so a bad settings edit must not be able to make
 * documents un-renderable — it should only make the type labels sparse.
 */
export function parseKinds(settings) {
  const raw = settings?.['line.kinds'];
  if (typeof raw !== 'string' || !raw.trim()) return FALLBACK;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return FALLBACK; }
  if (!Array.isArray(parsed)) return FALLBACK;
  const seen = new Set();
  const kinds = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const code = String(entry.code ?? '').trim();
    // A code must be a safe slug: it reaches HTML attributes, CLI flags and
    // query strings, and an unconstrained string would have to be escaped
    // correctly in all three. Rejecting here is cheaper than trusting there.
    if (!code || !/^[a-z0-9][a-z0-9_-]{0,30}$/.test(code)) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    kinds.push({
      code,
      en: String(entry.en ?? '').trim() || code,
      th: String(entry.th ?? '').trim() || String(entry.en ?? '').trim() || code,
    });
  }
  return kinds.length ? kinds : FALLBACK;
}

/** True when `code` is in the configured vocabulary. */
export function isValidKind(settings, code) {
  if (typeof code !== 'string' || !code) return false;
  return parseKinds(settings).some((k) => k.code === code);
}

/** The codes only — for building an error message the caller can act on. */
export function kindCodes(settings) {
  return parseKinds(settings).map((k) => k.code);
}

/**
 * Display label for a kind in `lang`, falling back to the code itself.
 * Returning the raw code for an unknown kind (rather than empty) preserves the
 * existing template behaviour: a line whose type was removed from the
 * vocabulary after it was quoted still prints something meaningful.
 */
export function labelFor(settings, code, lang = 'en') {
  const found = parseKinds(settings).find((k) => k.code === code);
  if (!found) return String(code ?? '');
  return (lang === 'th' ? found.th : found.en) || found.code;
}

/** A {code: label} map for one language — what the templates want. */
export function labelMap(settings, lang = 'en') {
  return Object.fromEntries(
    parseKinds(settings).map((k) => [k.code, (lang === 'th' ? k.th : k.en) || k.code]),
  );
}

/** True when `period` is one this system can price. */
export function isValidPeriod(period) {
  return BILLING_PERIODS.includes(period);
}

/**
 * Normalise a billing period, defaulting to 'once'.
 * Returns null for a value that is present but unrecognised, so the caller can
 * tell "not supplied" (-> 'once') from "supplied wrong" (-> reject).
 */
export function normalisePeriod(period) {
  if (period == null || period === '') return 'once';
  const p = String(period).trim().toLowerCase();
  return isValidPeriod(p) ? p : null;
}

/** Per-language period labels for the rendered documents. */
export const PERIOD_LABELS = {
  en: { once: 'once', monthly: '/month', quarterly: '/quarter', yearly: '/year' },
  th: { once: 'ครั้งเดียว', monthly: '/เดือน', quarterly: '/ไตรมาส', yearly: '/ปี' },
};

/** Long-form period labels, for a totals block rather than a table cell. */
export const PERIOD_LABELS_LONG = {
  en: { monthly: 'per month', quarterly: 'per quarter', yearly: 'per year' },
  th: { monthly: 'ต่อเดือน', quarterly: 'ต่อไตรมาส', yearly: 'ต่อปี' },
};