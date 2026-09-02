// capex.js — one-time server ACQUISITION cost for the self-hosted option (SPEC §5.8).
//
// The fleet is sized in GPUs (demand.js:gpusForLoad), but nobody sells GPUs by the
// unit at this tier: you buy a NODE. This module turns a GPU count into a whole
// number of nodes of ONE chosen server configuration, and reports what that
// rounding overprovisions.
//
// WHY ONE CONFIG AND NOT A CHEAPEST-COMBINATION SEARCH. Two reasons, both fatal to
// the mixed answer:
//
//   1. The registry rows are CITATIONS, not SKUs. hgx-h100-8x-mercatus and
//      hgx-h100-8x-gpufm are the same 8xH100 hardware read off two publishers who
//      disagree ($285,000 vs $340,000). A combination search would happily "buy"
//      that node once at each price and call the result an optimum.
//   2. A mixed buy is heterogeneous. Covering 10 GPUs with one 8xSXM node plus one
//      4xPCIe node is cheaper on paper, but serving.js solves tensor-parallel size
//      against a SINGLE uniform accelerator, so the calculator could not stand
//      behind the throughput it would then quote for that fleet.
//
// Choosing the configuration is the buyer's decision. This module prices the
// choice exactly and shows the overprovision rather than optimising across rows
// that cannot legitimately be summed.
//
// WHY THE OVERPROVISION IS RETURNED, NOT AMORTISED. A 3-GPU fleet on an 8-GPU node
// buys 5 GPUs it does not need. Charging 3/8 of the node price would be the
// fractional-fixed-asset error SPEC §2.3 already forbids on the monthly side — it
// makes a node look divisible when it is not. The full node is charged and the
// waste is stated, because the remedy ("pick the 4x PCIe config instead") is only
// visible once the waste is.

import { Dec, Rat, formatHalfUp } from "./exact.js";

// A refusal is a user-facing input/data problem, not a programmer error. Same
// contract as demand.js:DemandRefusal and serving.js:ServingRefusal — a machine
// readable `code` so the UI renders a specific sentence and tests assert the
// reason rather than the wording.
export class CapexRefusal extends RangeError {
  constructor(code, message, detail) {
    super(message);
    this.name = "CapexRefusal";
    this.code = code;
    this.detail = detail;
  }
}

export const PRICE_BASES = ["usd_low", "usd_typical", "usd_high"];

/** Rows in the registry that describe a given accelerator, in registry order. */
export function serversForGpu(gpuId, servers) {
  if (!gpuId) return [];
  return (servers ?? []).filter((s) => s && s.gpu_id === gpuId);
}

/**
 * Whole-node capex for covering `gpusRequired` GPUs with `server`.
 *
 * Returns exact money as a decimal STRING (SPEC §3.5) — never a JS number, which
 * would put binary dust into a six-figure figure the moment it was formatted.
 */
export function nodesForFleet({ gpusRequired, server, priceBasis = "usd_typical" }) {
  if (!server) {
    throw new CapexRefusal(
      "no_server_config",
      "no server configuration selected — this accelerator has no published integrated-node price in the registry",
      { gpus_required: gpusRequired },
    );
  }
  if (!PRICE_BASES.includes(priceBasis)) {
    throw new CapexRefusal("unknown_price_basis", `price basis must be one of ${PRICE_BASES.join(", ")}, got ${JSON.stringify(priceBasis)}`, { priceBasis });
  }
  if (!Number.isInteger(gpusRequired) || gpusRequired < 0) {
    throw new CapexRefusal("bad_gpu_count", "the fleet size must be a whole, non-negative number of GPUs", { gpus_required: gpusRequired });
  }
  const perNode = server.gpu_count;
  if (!Number.isInteger(perNode) || perNode <= 0) {
    throw new CapexRefusal("bad_node_size", `server ${server.server_id} declares a non-positive GPU count`, { server_id: server.server_id, gpu_count: perNode });
  }

  const priceStr = server[priceBasis];
  // usd_low and usd_high are legitimately null on rows whose source published a
  // TYPICAL but no band (see the seed's hgx-h200-8x-mercatus note). Refusing is
  // correct: widening a null bound to the typical would invent a band the source
  // never stated, and widening it to a NEIGHBOURING row's spread would attribute
  // one publisher's range to another's figure.
  if (priceStr === null || priceStr === undefined) {
    throw new CapexRefusal(
      "band_bound_unpublished",
      `${server.server_id} publishes no ${priceBasis.replace("usd_", "")} bound — its source states a typical figure only`,
      { server_id: server.server_id, price_basis: priceBasis, source_url: server.source_url ?? null },
    );
  }

  const nodes = gpusRequired === 0 ? 0 : Math.ceil(gpusRequired / perNode);
  const unit = Dec.from(String(priceStr));
  const capex = unit.mul(BigInt(nodes));
  const provisioned = nodes * perNode;

  return {
    server_id: server.server_id,
    label: server.label ?? server.server_id,
    gpu_id: server.gpu_id,
    price_basis: priceBasis,
    unit_price: unit.toString(),
    nodes,
    gpus_required: gpusRequired,
    gpus_provisioned: provisioned,
    gpus_overprovisioned: provisioned - gpusRequired,
    capex: capex.toString(),
    // Provenance travels with the number so no render site has to re-look it up,
    // and so a citation_broken row cannot be displayed as if it were verified.
    confidence: server.confidence ?? null,
    source_url: server.source_url ?? null,
    observed_at: server.observed_at ?? null,
    verification: server.verification ?? null,
  };
}

/**
 * The cheapest single configuration for this accelerator at this fleet size.
 *
 * Compared on TOTAL capex, not on unit price: a 4x PCIe node at $165,000 beats an
 * 8x SXM node at $340,000 for a 4-GPU fleet, and loses to it at 8. Rows whose
 * chosen price bound is unpublished are skipped with their reason rather than
 * treated as free — a missing price sorting first as $0 would silently become the
 * recommended purchase.
 */
export function cheapestConfigFor({ gpuId, servers, gpusRequired, priceBasis = "usd_typical" }) {
  const candidates = serversForGpu(gpuId, servers);
  const priced = [];
  const skipped = [];
  for (const s of candidates) {
    try {
      priced.push(nodesForFleet({ gpusRequired, server: s, priceBasis }));
    } catch (e) {
      if (e instanceof CapexRefusal) skipped.push({ server_id: s.server_id, reason: e.code, message: e.message });
      else throw e;
    }
  }
  if (priced.length === 0) return { best: null, priced, skipped };
  // Exact comparison on Rat, never on the formatted strings: "$9.90" sorts above
  // "$10.00" as text, and that is a wrong answer in dollars (same rule as
  // app.js:renderOptionTotals).
  let best = priced[0];
  for (const p of priced.slice(1)) {
    const cmp = Rat.from(p.capex).cmp(Rat.from(best.capex));
    // Ties keep the EARLIER registry row so the choice is deterministic across
    // runs rather than depending on iteration order.
    if (cmp < 0) best = p;
  }
  return { best, priced, skipped };
}

/** Display helper: whole dollars, half-up, exact. */
export const formatCapex = (v) => formatHalfUp(Rat.from(v), 0);