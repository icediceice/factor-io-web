// currency.js — exact USD engine / THB presentation boundary.
//
// Source tariffs remain verbatim USD. User-entered THB is divided by the exact
// rate once on entry; engine results are multiplied once when rendered/exported.
// No quotient is rounded before the final formatHalfUp display boundary.
import { Dec, Rat, formatHalfUp, toRat } from "./exact.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function positiveDecimal(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a decimal string`);
  const parsed = Dec.from(value.trim());
  if (!parsed.gt(Dec.from("0"))) throw new RangeError(`${label} must be greater than zero`);
  return parsed;
}

export function normalizeFxDocument(input, { integrity = null } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("FX document must be an object");
  const observed = String(input.observed_at ?? input.date ?? "").slice(0, 10);
  if (!ISO_DATE.test(observed)) throw new TypeError("FX document needs an ISO observed date");
  const direct = input.usd_thb == null ? null : positiveDecimal(String(input.usd_thb), "usd_thb");
  const eurUsd = input.eur_usd == null ? null : positiveDecimal(String(input.eur_usd), "eur_usd");
  const eurThb = input.eur_thb == null ? null : positiveDecimal(String(input.eur_thb), "eur_thb");
  if (!direct && (!eurUsd || !eurThb)) throw new TypeError("FX document needs usd_thb or both eur_usd and eur_thb");
  const rate = direct ? Rat.from(direct) : Rat.from(eurThb).div(Rat.from(eurUsd));
  if (rate.lt(Rat.from("10")) || rate.gt(Rat.from("100"))) throw new RangeError("USD→THB rate is outside the accepted 10–100 sanity range");
  return Object.freeze({
    schema: String(input.schema ?? "factor-io.fx/1.0.0"),
    source_id: String(input.source_id ?? "unknown-fx"),
    source_url: String(input.source_url ?? ""),
    retrieved_via: input.retrieved_via ? String(input.retrieved_via) : null,
    observed_at: observed,
    expires_at: String(input.expires_at ?? `${observed}T23:59:59.999Z`),
    integrity: String(integrity ?? input.integrity ?? "transport-live"),
    usd_thb: direct?.toString() ?? null,
    eur_usd: eurUsd?.toString() ?? null,
    eur_thb: eurThb?.toString() ?? null,
    rate,
  });
}

export function fxRate(fx) {
  return fx?.rate instanceof Rat ? fx.rate : normalizeFxDocument(fx).rate;
}

export function toTHB(usd, fx) {
  return toRat(usd).mul(fxRate(fx));
}

export function toUSD(thb, fx) {
  return toRat(thb).div(fxRate(fx));
}

export function formatTHB(usd, fx, places = 2) {
  return `฿${formatHalfUp(toTHB(usd, fx), places)}`;
}

export function fxProvenance(fx) {
  const doc = fx?.rate instanceof Rat ? fx : normalizeFxDocument(fx);
  return {
    source_id: doc.source_id,
    source_url: doc.source_url,
    retrieved_via: doc.retrieved_via,
    observed_at: doc.observed_at,
    expires_at: doc.expires_at,
    integrity: doc.integrity,
    formula: doc.usd_thb ? "THB = USD × usd_thb" : "THB = USD × (eur_thb ÷ eur_usd)",
    rate_exact: doc.rate.toString(),
    source_legs: doc.usd_thb
      ? { usd_thb: doc.usd_thb }
      : { eur_usd: doc.eur_usd, eur_thb: doc.eur_thb },
  };
}
