// subscription.js — AI-platform software licensing as a cost LAYER (SPEC §7.4).
//
// This is not a fourth comparison option. SPEC §2.1 fixes the comparison at three
// options and says there is no fourth; a platform licence is a cost carried BY
// options, declared per row in `applies_to`. The Model API option runs no platform,
// so a platform row does not apply to it — and that must be a stated exclusion, not
// a zero, because a zero reads as "free here" rather than "not applicable here".
//
// THE METER IS THE POINT. Vendors in this market do not count the same thing:
//
//   Nutanix Enterprise AI  -> aggregate GPU RAM in GB, across every GPU in the cluster
//   NVIDIA AI Enterprise   -> per physical GPU (or per GPU-hour on marketplaces)
//   Red Hat AI Inference   -> per physical accelerator; CPU cores do not count
//
// Those are quoted from vendor documentation in subscription-pricing.json. The
// consequence for this module is that the BILLABLE QUANTITY must be derived from
// the fleet rather than entered: aggregate GPU RAM is the fleet's GPU count times
// each card's vram_gb, both of which the calculator already knows. So the licence
// re-prices when the fleet moves, which is exactly what a blind entered figure
// fails to do — and on a per-GB meter the difference is not small. Eight H100s is
// 640 GB of entitlement; eight B200s is 1,536 GB for the identical GPU count.
//
// AN UNKNOWN METER REFUSES. It never falls back to a plausible neighbour, for the
// same reason serving.js:groupBytesPerToken refuses an unknown attention kind: a
// guessed meter prices silently wrong, and silently wrong is the one failure this
// calculator is built to not have.

import { Dec, Rat, formatHalfUp, ratStr } from "./exact.js";

export class SubscriptionRefusal extends RangeError {
  constructor(code, message, detail) {
    super(message);
    this.name = "SubscriptionRefusal";
    this.code = code;
    this.detail = detail;
  }
}

const MONTHS_PER_YEAR = Rat.of(12n, 1n);

// meter -> { term, needs } . `needs` names the input the quantity is derived from,
// so a missing one refuses with the field name instead of quietly becoming zero.
export const METERS = {
  per_gpu_ram_gb_year: { term: "annual", needs: "fleet+vram" },
  per_gpu_year: { term: "annual", needs: "fleet" },
  per_accelerator_year: { term: "annual", needs: "fleet" },
  per_vcpu_year: { term: "annual", needs: "vcpus" },
  per_node_year: { term: "annual", needs: "nodes" },
  per_gpu_hour: { term: "hourly", needs: "gpu_hours" },
  per_user_month: { term: "monthly", needs: "users" },
  flat_month: { term: "monthly", needs: null },
};

function need(value, field, meter) {
  if (value === null || value === undefined || value === "") {
    throw new SubscriptionRefusal(
      "missing_quantity_input",
      `the ${meter} meter needs ${field}, which is not available`,
      { meter, field },
    );
  }
  return value;
}

function asWhole(v, field, meter) {
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  if (!Number.isInteger(n) || n < 0) {
    throw new SubscriptionRefusal("bad_quantity_input", `${field} must be a whole, non-negative number for the ${meter} meter`, { meter, field, got: String(v) });
  }
  return BigInt(n);
}

/**
 * The number of entitlements owed under `meter`, as an exact Rat.
 *
 * gpus       - fleet size from demand.js:gpusForLoad
 * gpuVramGb  - per-GPU memory from gpu-pricing.json:gpus[id].vram_gb
 * gpuHours   - GPU-hours consumed in the month (rented option); hourly meters only
 * users      - headcount from the demand model
 * vcpus, nodes - entered, since the calculator models neither
 */
export function billableQuantity({ meter, gpus = null, gpuVramGb = null, gpuHours = null, users = null, vcpus = null, nodes = null }) {
  const spec = METERS[meter];
  if (!spec) {
    throw new SubscriptionRefusal(
      "unknown_meter",
      `unknown licensing meter ${JSON.stringify(meter)} — a meter is how a vendor counts what you owe, and guessing one prices the whole licence wrong`,
      { meter, known: Object.keys(METERS) },
    );
  }
  switch (meter) {
    case "per_gpu_ram_gb_year": {
      const g = asWhole(need(gpus, "the fleet GPU count", meter), "gpus", meter);
      const v = asWhole(need(gpuVramGb, "the accelerator's memory in GB", meter), "gpuVramGb", meter);
      // Entitlements are whole GB (the vendor states 1 GB increments), and GPU
      // count x whole GB is already whole, so no rounding is introduced here.
      return Rat.from(g * v);
    }
    case "per_gpu_year":
    case "per_accelerator_year":
      return Rat.from(asWhole(need(gpus, "the fleet GPU count", meter), "gpus", meter));
    case "per_gpu_hour":
      return Rat.from(Dec.from(String(need(gpuHours, "GPU-hours for the month", meter))));
    case "per_user_month":
      return Rat.from(asWhole(need(users, "the user count", meter), "users", meter));
    case "per_vcpu_year":
      return Rat.from(asWhole(need(vcpus, "the worker-node vCPU count", meter), "vcpus", meter));
    case "per_node_year":
      return Rat.from(asWhole(need(nodes, "the node count", meter), "nodes", meter));
    case "flat_month":
      return Rat.of(1n, 1n);
    default:
      // Unreachable while METERS and this switch agree; kept so that adding a
      // meter to the table without handling it here FAILS rather than returns 0.
      throw new SubscriptionRefusal("unhandled_meter", `meter ${meter} is declared in METERS but not handled`, { meter });
  }
}

/**
 * Monthly and one-time cost for a subscription row.
 *
 * TERM HANDLING. An annual entitlement is amortised to a month by dividing by 12
 * — it is a recurring commitment, and putting a full year into month 1 would make
 * the payback curve step in a way the cash flow does not. A `perpetual` term is
 * the genuine one-time case and lands entirely in one_time. The distinction is the
 * row's, not a guess: NVIDIA documents both a subscription and a perpetual licence
 * for the same product.
 *
 * `priceOverride` wins over the row's shipped price, and the result says which was
 * used — a user's quote is a different KIND of number from a cited secondary
 * figure, and the two must stay distinguishable (SPEC §2.4 basis contract).
 */
export function subscriptionCost({ row, quantity = null, priceOverride = null, term = null, oneTimeExtra = null, quantityInputs = null }) {
  if (!row) throw new SubscriptionRefusal("no_row", "no subscription row selected", {});
  const meter = row.meter;
  const spec = METERS[meter];
  if (!spec) {
    throw new SubscriptionRefusal("unknown_meter", `subscription row ${row.id} declares unknown meter ${JSON.stringify(meter)}`, { id: row.id, meter, known: Object.keys(METERS) });
  }

  const qty = quantity !== null && quantity !== undefined
    ? Rat.from(typeof quantity === "string" ? Dec.from(quantity) : quantity)
    : billableQuantity({ meter, ...(quantityInputs ?? {}) });

  const rawPrice = priceOverride !== null && priceOverride !== undefined && priceOverride !== ""
    ? String(priceOverride)
    : row.price_usd;
  const priceBasis = priceOverride !== null && priceOverride !== undefined && priceOverride !== ""
    ? "user_override"
    : (row.price_confidence ?? "unpublished");

  // A null price is the DOCUMENTED shape for rows whose vendor publishes a meter
  // but no list price (Nutanix, Red Hat). It refuses rather than defaulting to
  // zero: a zero would silently report the licence as free, which is the single
  // most misleading answer this layer could give.
  if (rawPrice === null || rawPrice === undefined || rawPrice === "") {
    throw new SubscriptionRefusal(
      "price_unpublished",
      `${row.label ?? row.id} publishes no list price — enter your quoted ${meter.replace(/_/g, " ")} figure`,
      { id: row.id, meter, meter_source_url: row.meter_source_url ?? null },
    );
  }

  const unit = Rat.from(Dec.from(String(rawPrice)));
  const extended = unit.mul(qty);
  const effectiveTerm = term ?? spec.term;

  let monthly = Rat.of(0n, 1n);
  let oneTime = Rat.of(0n, 1n);
  switch (effectiveTerm) {
    case "annual":
      monthly = extended.div(MONTHS_PER_YEAR);
      break;
    case "monthly":
    case "hourly":
      // An hourly meter's quantity is already the month's GPU-hours, so the
      // extended figure IS the month's cost — dividing again would double-count.
      monthly = extended;
      break;
    case "perpetual":
      oneTime = extended;
      break;
    default:
      throw new SubscriptionRefusal("unknown_term", `unknown subscription term ${JSON.stringify(effectiveTerm)}`, { id: row.id, term: effectiveTerm });
  }

  if (oneTimeExtra !== null && oneTimeExtra !== undefined && oneTimeExtra !== "") {
    oneTime = oneTime.add(Rat.from(Dec.from(String(oneTimeExtra))));
  }

  return {
    id: row.id,
    label: row.label ?? row.id,
    vendor: row.vendor ?? null,
    meter,
    term: effectiveTerm,
    quantity: formatHalfUp(qty, 0),
    quantity_exact: qty.toString(),
    unit_price: ratStr(unit),
    price_basis: priceBasis,
    // ratStr, not Rat.toString: an annual licence divided by 12 is frequently
    // non-terminating ($100/GPU/yr is 8.333.../mo), so the money contract's dual
    // form applies here exactly as it does to the rented option's amortization.
    monthly: ratStr(monthly),
    one_time: ratStr(oneTime),
    applies_to: row.applies_to ?? [],
    // Provenance for the two halves travels separately, because they have
    // different authorities and collapsing them is the error this file guards.
    meter_confidence: row.meter_confidence ?? null,
    meter_source_url: row.meter_source_url ?? null,
    price_confidence: priceBasis,
    price_source_url: row.price_source_url ?? null,
  };
}

/** Does this subscription row apply to the given engine option key (A/B/C)? */
export function appliesTo(row, optionKey) {
  return Array.isArray(row?.applies_to) && row.applies_to.includes(optionKey);
}