// capex-subscription.test.mjs — whole-node acquisition cost (SPEC §5.8) and the
// platform-licence cost layer (SPEC §7.4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Rat, formatHalfUp, toRat } from "../exact.js";
import { nodesForFleet, cheapestConfigFor, serversForGpu, CapexRefusal } from "../capex.js";
import { billableQuantity, subscriptionCost, appliesTo, METERS, SubscriptionRefusal } from "../subscription.js";
import { runComparison } from "../calculator.js";
import { compileLiteLLMEntry } from "../pricing.js";

const DATA = fileURLToPath(new URL("../data/", import.meta.url));
const servers = JSON.parse(await readFile(`${DATA}server-pricing.json`, "utf8"));
const subs = JSON.parse(await readFile(`${DATA}subscription-pricing.json`, "utf8"));
const gpuPricing = JSON.parse(await readFile(`${DATA}gpu-pricing.json`, "utf8"));

const rowById = (id) => servers.rows.find((r) => r.server_id === id);
const subById = (id) => subs.rows.find((r) => r.id === id);
// toRat, not Rat.from: money crosses this boundary in EITHER form — a decimal
// string when it terminates, a reduced n/d when it does not — and a test helper
// that only understands one of them fails on arithmetic that is perfectly correct.
const money = (v) => formatHalfUp(toRat(v), 2);

// ─────────────────────────────────────────────────────────── capex: whole nodes

test("a partial node is charged as a WHOLE node and the waste is reported", () => {
  const r = nodesForFleet({ gpusRequired: 3, server: rowById("hgx-h100-8x-mercatus") });
  assert.equal(r.nodes, 1);
  assert.equal(r.gpus_provisioned, 8);
  assert.equal(r.gpus_overprovisioned, 5);
  // The full node price, NOT 3/8 of it: prorating a fixed asset is the error
  // SPEC §2.3 forbids on the monthly side, and it is no more valid on capex.
  assert.equal(money(r.capex), "285000.00");
});

test("crossing a node boundary buys the next whole node", () => {
  const s = rowById("hgx-h100-8x-mercatus");
  assert.equal(nodesForFleet({ gpusRequired: 8, server: s }).nodes, 1);
  const nine = nodesForFleet({ gpusRequired: 9, server: s });
  assert.equal(nine.nodes, 2);
  assert.equal(money(nine.capex), "570000.00");
  assert.equal(nine.gpus_overprovisioned, 7);
});

test("zero demand buys nothing — no phantom node on an empty scenario", () => {
  const r = nodesForFleet({ gpusRequired: 0, server: rowById("hgx-h100-8x-mercatus") });
  assert.equal(r.nodes, 0);
  assert.equal(money(r.capex), "0.00");
  assert.equal(r.gpus_overprovisioned, 0);
});

test("an unpublished band bound REFUSES rather than borrowing a neighbouring spread", () => {
  // hgx-h200-8x-mercatus publishes a typical only; usd_low is null by design.
  const s = rowById("hgx-h200-8x-mercatus");
  assert.equal(s.usd_low, null);
  assert.equal(money(nodesForFleet({ gpusRequired: 8, server: s, priceBasis: "usd_typical" }).capex), "370000.00");
  assert.throws(
    () => nodesForFleet({ gpusRequired: 8, server: s, priceBasis: "usd_low" }),
    (e) => e instanceof CapexRefusal && e.code === "band_bound_unpublished",
  );
});

test("no server config for this accelerator refuses instead of inventing a price", () => {
  assert.equal(serversForGpu("l40s", servers.rows).length, 0);
  assert.throws(
    () => nodesForFleet({ gpusRequired: 4, server: null }),
    (e) => e instanceof CapexRefusal && e.code === "no_server_config",
  );
});

test("cheapest config is decided on TOTAL capex, so node size beats unit price", () => {
  // 4 GPUs: one 4x PCIe node ($165k) beats one 8x SXM node ($285k).
  const small = cheapestConfigFor({ gpuId: "h100", servers: servers.rows, gpusRequired: 4 });
  assert.equal(small.best.server_id, "pcie-h100-4x-gpufm");
  assert.equal(money(small.best.capex), "165000.00");

  // 8 GPUs: two 4x PCIe nodes ($330k) now LOSE to one 8x SXM node ($285k).
  const big = cheapestConfigFor({ gpuId: "h100", servers: servers.rows, gpusRequired: 8 });
  assert.equal(big.best.server_id, "hgx-h100-8x-mercatus");
  assert.equal(money(big.best.capex), "285000.00");
});

test("a config whose price bound is unpublished is SKIPPED with a reason, never treated as free", () => {
  const r = cheapestConfigFor({ gpuId: "h200", servers: servers.rows, gpusRequired: 8, priceBasis: "usd_low" });
  assert.ok(r.skipped.some((s) => s.server_id === "hgx-h200-8x-mercatus" && s.reason === "band_bound_unpublished"));
  // The one row that DOES publish a low bound is still priced.
  assert.equal(r.best.server_id, "hgx-h200-8x-gpufm");
  assert.equal(money(r.best.capex), "370000.00");
});

test("every shipped server row carries a verification verdict and an indicative tier", () => {
  assert.ok(servers.rows.length > 0);
  for (const r of servers.rows) {
    assert.equal(r.confidence, "indicative", `${r.server_id} must be indicative — no vendor list price exists for server hardware`);
    assert.ok(["verified", "citation_broken", "unreachable"].includes(r.verification.status), `${r.server_id} verification`);
  }
});

// ──────────────────────────────────────────────── subscription: meters and cost

test("aggregate GPU RAM is DERIVED from the fleet, per Nutanix's documented meter", () => {
  // 8 x H100 80GB = 640 GB of entitlement.
  const q = billableQuantity({ meter: "per_gpu_ram_gb_year", gpus: 8, gpuVramGb: gpuPricing.gpus.h100.vram_gb });
  assert.equal(formatHalfUp(q, 0), "640");
});

test("the same GPU COUNT on a bigger card owes more — which is why the meter matters", () => {
  const h100 = billableQuantity({ meter: "per_gpu_ram_gb_year", gpus: 8, gpuVramGb: gpuPricing.gpus.h100.vram_gb });
  const b200 = billableQuantity({ meter: "per_gpu_ram_gb_year", gpus: 8, gpuVramGb: gpuPricing.gpus.b200.vram_gb });
  assert.equal(formatHalfUp(h100, 0), "640");
  assert.equal(formatHalfUp(b200, 0), "1440");
  assert.ok(b200.gt(h100), "a per-GB meter must move with card memory, not just GPU count");
});

test("per-GPU and per-accelerator meters count the fleet, not its memory", () => {
  assert.equal(formatHalfUp(billableQuantity({ meter: "per_gpu_year", gpus: 6 }), 0), "6");
  assert.equal(formatHalfUp(billableQuantity({ meter: "per_accelerator_year", gpus: 6 }), 0), "6");
});

test("a seat meter counts users; a flat meter counts one", () => {
  assert.equal(formatHalfUp(billableQuantity({ meter: "per_user_month", users: 2500 }), 0), "2500");
  assert.equal(formatHalfUp(billableQuantity({ meter: "flat_month" }), 0), "1");
});

test("an unknown meter REFUSES — it never falls back to a plausible neighbour", () => {
  assert.throws(
    () => billableQuantity({ meter: "per_socket_fortnight", gpus: 8 }),
    (e) => e instanceof SubscriptionRefusal && e.code === "unknown_meter",
  );
});

test("a meter missing its derived input refuses by FIELD, rather than counting zero", () => {
  assert.throws(
    () => billableQuantity({ meter: "per_gpu_ram_gb_year", gpus: 8 }),
    (e) => e instanceof SubscriptionRefusal && e.code === "missing_quantity_input" && e.detail.field === "the accelerator's memory in GB",
  );
});

test("every meter in METERS is handled — adding one to the table without code fails loudly", () => {
  for (const meter of Object.keys(METERS)) {
    const inputs = { gpus: 8, gpuVramGb: 80, gpuHours: "730", users: 100, vcpus: 64, nodes: 1 };
    assert.doesNotThrow(() => billableQuantity({ meter, ...inputs }), `meter ${meter} is declared but not handled`);
  }
});

test("an annual licence amortises to a month; the arithmetic is exact", () => {
  // 8 GPUs x $4,500/GPU/yr = $36,000/yr = $3,000/mo.
  const c = subscriptionCost({
    row: subById("nvidia-ai-enterprise-subscription"),
    quantityInputs: { gpus: 8 },
  });
  assert.equal(c.meter, "per_gpu_year");
  assert.equal(c.quantity, "8");
  assert.equal(money(c.monthly), "3000.00");
  assert.equal(money(c.one_time), "0.00");
  assert.equal(c.price_basis, "indicative");
});

test("a perpetual term lands entirely in one_time, never in the monthly line", () => {
  const c = subscriptionCost({
    row: subById("nvidia-ai-enterprise-subscription"),
    quantityInputs: { gpus: 8 },
    term: "perpetual",
  });
  assert.equal(money(c.monthly), "0.00");
  assert.equal(money(c.one_time), "36000.00");
});

test("an hourly marketplace meter is NOT divided again — its quantity is already the month", () => {
  const c = subscriptionCost({
    row: subById("nvidia-ai-enterprise-marketplace"),
    quantityInputs: { gpuHours: "1460" }, // 2 GPUs x 730 h
  });
  assert.equal(c.term, "hourly");
  assert.equal(money(c.monthly), "1460.00");
});

test("an unpublished list price REFUSES — reporting a licence as free is the worst answer here", () => {
  const nai = subById("nutanix-enterprise-ai");
  assert.equal(nai.price_usd, null);
  assert.throws(
    () => subscriptionCost({ row: nai, quantityInputs: { gpus: 8, gpuVramGb: 80 } }),
    (e) => e instanceof SubscriptionRefusal && e.code === "price_unpublished",
  );
});

test("a user's own quote prices the documented meter and is labelled as an override", () => {
  // The meter is first-party; only the amount was missing. Supplying it must
  // produce a number whose BASIS is visibly different from a cited figure.
  const c = subscriptionCost({
    row: subById("nutanix-enterprise-ai"),
    quantityInputs: { gpus: 8, gpuVramGb: 80 },
    priceOverride: "12",
  });
  assert.equal(c.quantity, "640");           // 8 x 80 GB
  assert.equal(money(c.monthly), "640.00");  // 640 GB x $12/yr / 12
  assert.equal(c.price_basis, "user_override");
  assert.equal(c.meter_confidence, "first_party");
});

test("a platform licence does not apply to the Model API option", () => {
  const nai = subById("nutanix-enterprise-ai");
  assert.equal(appliesTo(nai, "A"), true);
  assert.equal(appliesTo(nai, "C"), true);
  assert.equal(appliesTo(nai, "B"), false, "you run no platform on a hosted API — this must be not-applicable, not zero");
});

test("every subscription row declares a meter this module handles", () => {
  for (const r of subs.rows) {
    assert.ok(METERS[r.meter], `row ${r.id} declares meter ${r.meter} which subscription.js cannot price`);
    assert.ok(Array.isArray(r.applies_to), `row ${r.id} must declare applies_to`);
  }
});

test("a first-party meter never lends its authority to the price", () => {
  for (const r of subs.rows) {
    if (r.meter_confidence !== "first_party") continue;
    assert.ok(r.meter_source_url, `${r.id} claims a first_party meter and must cite it`);
    assert.notEqual(r.price_confidence, "first_party", `${r.id}: no vendor here publishes a list price, so the AMOUNT must never be first_party`);
  }
});

// ─────────────────────────────────────── engine: the layer reaching the totals

const WORKLOAD = {
  demand_tokens_mo: 80000000,
  request_count_mo: 80000,
  prompt_tokens: 1000,
  output_tokens: 0,
  horizon_months: 12,
  time_buckets: null,
  required_p95_tok_s: null,
  quote_utc: Date.parse("2026-09-01T12:00:00Z"),
};
function apiCatalog() {
  const offer = compileLiteLLMEntry("api/overflow", {
    // $500 per 1M. Deliberately dearer than the owned option's $10,000/mo, so
    // payback CONVERGES and the tests below can assert which way it moves. At the
    // F7 anchor's $10/1M the API is cheaper than self-hosting outright, payback
    // correctly returns opex_exceeds_target, and every months comparison is
    // null-vs-null — a fixture that proves nothing about the code under test.
    input_cost_per_token: "0.0005",
    output_cost_per_token: "0.0005",
  });
  return { offers: { [offer.offer_id]: offer } };
}
// 80,000 requests x 1,000 prompt tokens x $0.0005 = $40,000/mo for the API option,
// against $10,000/mo self-hosted: $30,000/mo of savings to earn a capex back with.
const LANE_A = { enabled: true, fixed_monthly: "10000", monthly_token_budget: 100000000, tokens_s_ceiling: null };
const LANE_B = { enabled: true, offer_ids: ["litellm:api/overflow"] };
const base = (extra = {}) => runComparison({
  workload: WORKLOAD,
  catalog: apiCatalog(),
  laneA: LANE_A,
  laneB: LANE_B,
  routing: { policy: "local_first" },
  ...extra,
});

test("with no subscription and no oneTime, the infra lanes are untouched", () => {
  const r = base();
  assert.equal(r.subscription, null);
  // lanes.* stays INFRASTRUCTURE ONLY — this is what the F1–F10 fixtures bind.
  assert.equal(r.lanes.A.monthly_total, "10000");
  assert.equal(r.totals.A.monthly_total, "10000");
  assert.equal(r.totals.A.subscription_monthly, "0");
  assert.equal(r.one_time.A, "0");
  assert.equal(r.one_time.B, "0");
});

test("server capex reaches the horizon total and the curve, not just payback", () => {
  const r = base({ laneA: { ...LANE_A, capex: "285000" } });
  assert.equal(r.one_time.A, "285000");
  // 12 months x $10,000 + $285,000 one-time.
  assert.equal(money(r.totals.A.horizon_total), "405000.00");
  // The curve's final month carries the capex; month 1 already includes it.
  assert.equal(money(r.curve[0].A), "295000.00");
  assert.equal(money(r.curve[11].A), "405000.00");
});

test("a one-time cost on the API option brings the crossover FORWARD instead of reading as zero", () => {
  // $285,000 capex against $30,000/mo of savings: 10 months bare, 9 once the API
  // option carries a $20,000 upfront of its own (net capex $265,000).
  const withoutIt = base({ laneA: { ...LANE_A, capex: "285000" } });
  const withIt = base({ laneA: { ...LANE_A, capex: "285000" }, oneTime: { B: "20000" } });
  assert.equal(withoutIt.one_time.B, "0");
  assert.equal(withIt.one_time.B, "20000");
  // Payback's capex is A's one-time MINUS B's, because the crossing is between
  // two cumulative lines: an upfront the API option also pays is not something
  // self-hosting has to earn back, so it shortens the payback rather than
  // lengthening it. Before v0.5 only A's capex existed and B's read as zero.
  assert.equal(withoutIt.payback.vs_model_api.months, 10); // ceil(285000 / 30000)
  assert.equal(withIt.payback.vs_model_api.months, 9);     // ceil(265000 / 30000)
  assert.ok(withIt.payback.vs_model_api.months < withoutIt.payback.vs_model_api.months);
  // The curve difference is EXACTLY the one-time, checked on exact rationals —
  // a float subtraction here would be the very error this codebase avoids.
  const delta = toRat(withIt.curve[0].B).sub(toRat(withoutIt.curve[0].B));
  assert.equal(formatHalfUp(delta, 2), "20000.00");
});

test("a platform licence is charged ONLY to the options its row declares", () => {
  const cost = subscriptionCost({
    row: subById("nvidia-ai-enterprise-subscription"),
    quantityInputs: { gpus: 8 },
  });
  const r = base({ subscription: cost });
  assert.deepEqual(r.subscription.applied_to, ["A", "C"]);
  // The Model API option runs no platform. This must be a NAMED exclusion, not
  // a silent zero — "free here" and "not applicable here" are different claims.
  assert.deepEqual(r.subscription.not_applicable, ["B"]);
  assert.equal(r.totals.A.subscription_applies, true);
  assert.equal(r.totals.B.subscription_applies, false);
  // $3,000/mo licence lands on the owned option and nowhere else.
  assert.equal(money(r.totals.A.subscription_monthly), "3000.00");
  assert.equal(money(r.totals.A.monthly_total), "13000.00");
  assert.equal(money(r.totals.B.subscription_monthly), "0.00");
  assert.equal(r.totals.B.monthly_total, r.lanes.B.monthly_total);
});

test("the licence moves payback, because it is charged to one side of the comparison", () => {
  const capexed = { ...LANE_A, capex: "285000" };
  const bare = base({ laneA: capexed });
  const licensed = base({
    laneA: capexed,
    subscription: subscriptionCost({ row: subById("nvidia-ai-enterprise-subscription"), quantityInputs: { gpus: 8 } }),
  });
  // $3,000/mo of licence eats into the $30,000/mo of savings: ceil(285000/30000)
  // = 10 months becomes ceil(285000/27000) = 11.
  assert.equal(bare.payback.vs_model_api.months, 10);
  assert.equal(licensed.payback.vs_model_api.months, 11);
  assert.ok(licensed.payback.vs_model_api.months > bare.payback.vs_model_api.months,
    "a licence charged to self-hosting but not to the API must lengthen the payback");
  assert.equal(licensed.payback.self_hosted_one_time_total, "285000");
});

test("a perpetual licence lands in one_time and rides the curve from month 1", () => {
  const perpetual = subscriptionCost({
    row: subById("nvidia-ai-enterprise-subscription"),
    quantityInputs: { gpus: 8 },
    term: "perpetual",
  });
  const r = base({ subscription: perpetual });
  assert.equal(money(r.totals.A.subscription_monthly), "0.00");
  assert.equal(money(r.one_time.A), "36000.00");
  assert.equal(money(r.one_time.B), "0.00", "a perpetual licence still only lands on the options it applies to");
});

test("an unpriced option reports its one-time without inventing a horizon total", () => {
  const r = runComparison({
    workload: WORKLOAD,
    catalog: { offers: {} }, // no API offer -> option B is not costed
    laneA: { ...LANE_A, capex: "285000" },
    laneB: { enabled: true, offer_ids: [] },
    routing: { policy: "local_first" },
  });
  assert.equal(r.totals.B.priced, false);
  assert.equal(r.totals.B.monthly_total, null);
  assert.equal(r.totals.B.horizon_total, null, "an unpriced option must not report a horizon total it cannot compute");
});

// A rented option dear enough for payback to CONVERGE against it, so the tests
// below can assert which way a one-time moves the crossover instead of comparing
// null to null.
const LANE_C = { enabled: true, tokens_s: 100, hourly_rate: "60", utilization: "0.7" };

test("a declared one-time on the SELF-HOSTED option adds to the hardware capex and lengthens payback", () => {
  const bare = base({ laneA: { ...LANE_A, capex: "285000" } });
  const r = base({ laneA: { ...LANE_A, capex: "285000" }, oneTime: { A: "60000" } });
  // The declared figure is ADDED to the capex, never a replacement for it: server
  // hardware and an implementation fee are both genuinely one-time and both belong.
  assert.equal(r.one_time.A, "345000");
  assert.equal(money(r.totals.A.horizon_total), "465000.00"); // 12 x 10,000 + 345,000
  assert.equal(money(r.curve[0].A), "355000.00");
  assert.equal(money(r.curve[11].A), "465000.00");
  // ceil(285000/30000) = 10 becomes ceil(345000/30000) = 12: more to earn back.
  assert.equal(bare.payback.vs_model_api.months, 10);
  assert.equal(r.payback.vs_model_api.months, 12);
});

test("a declared one-time on the RENTED option reaches its curve, its horizon total and the payback", () => {
  const withOut = base({ laneA: { ...LANE_A, capex: "285000" }, laneC: LANE_C });
  const withIt = base({ laneA: { ...LANE_A, capex: "285000" }, laneC: LANE_C, oneTime: { C: "45000" } });
  assert.equal(withOut.one_time.C, "0");
  assert.equal(withIt.one_time.C, "45000");
  assert.ok(withOut.totals.C.priced, "the rented option must be priced for this assertion to mean anything");
  // Exact rationals throughout: the rented lane's monthly is frequently a
  // non-terminating quotient, so a float delta here would drift by design.
  const d = (a, b) => formatHalfUp(toRat(a).sub(toRat(b)), 2);
  assert.equal(d(withIt.totals.C.horizon_total, withOut.totals.C.horizon_total), "45000.00");
  // A one-time is paid at month 1 and still sits in the last month's cumulative.
  assert.equal(d(withIt.curve[0].C, withOut.curve[0].C), "45000.00");
  assert.equal(d(withIt.curve[11].C, withOut.curve[11].C), "45000.00");
  // Payback nets the two one-times: the rented option's own upfront is not
  // something self-hosting has to earn back, so it SHORTENS the payback.
  assert.equal(withOut.payback.vs_rented_gpu.capex, "285000");
  assert.equal(withIt.payback.vs_rented_gpu.capex, "240000");
  assert.ok(withIt.payback.vs_rented_gpu.months < withOut.payback.vs_rented_gpu.months,
    "an upfront the rented option also pays must bring the crossover forward");
});

test("a licence is metered PER OPTION, so the rented option is not charged the owned fleet's quantity", () => {
  const row = subById("nvidia-ai-enterprise-subscription"); // per_gpu_year, applies to A and C
  const owned = subscriptionCost({ row, quantityInputs: { gpus: 8 } });  // 8 GPUs installed in the nodes bought
  const rented = subscriptionCost({ row, quantityInputs: { gpus: 2 } }); // 2 GPUs actually rented
  const r = base({
    laneC: LANE_C,
    subscription: {
      ...owned,
      by_option: {
        A: { quantity: owned.quantity, monthly: owned.monthly, one_time: owned.one_time },
        C: { quantity: rented.quantity, monthly: rented.monthly, one_time: rented.one_time },
      },
    },
  });
  assert.equal(money(r.totals.A.subscription_monthly), "3000.00"); // 8 x 4500 / 12
  assert.equal(money(r.totals.C.subscription_monthly), "750.00");  // 2 x 4500 / 12
  assert.notEqual(r.totals.A.subscription_monthly, r.totals.C.subscription_monthly,
    "two fleets of different sizes must not produce one licence figure");
});

test("an option absent from by_option is charged NOTHING rather than borrowing another option's figure", () => {
  const row = subById("nvidia-ai-enterprise-subscription");
  const owned = subscriptionCost({ row, quantityInputs: { gpus: 8 } });
  // The rented option could not be sized this run — no rented row, or the model
  // does not fit that accelerator. Falling back to the flat figure would charge it
  // the owned fleet's bill, which is exactly the silent borrowing this guards.
  const r = base({
    laneC: LANE_C,
    subscription: { ...owned, by_option: { A: { monthly: owned.monthly, one_time: owned.one_time } } },
  });
  assert.equal(money(r.totals.A.subscription_monthly), "3000.00");
  assert.equal(money(r.totals.C.subscription_monthly), "0.00");
  // applies_to is unchanged — C is still an option this licence covers, it just
  // has no fleet to meter, and that is reported rather than priced.
  assert.deepEqual(r.subscription.applied_to, ["A", "C"]);
});

test("a flat subscription with no by_option keeps the pre-v0.5 behaviour exactly", () => {
  const row = subById("nvidia-ai-enterprise-subscription");
  const flat = subscriptionCost({ row, quantityInputs: { gpus: 8 } });
  assert.equal(flat.by_option, undefined);
  const r = base({ laneC: LANE_C, subscription: flat });
  assert.equal(money(r.totals.A.subscription_monthly), "3000.00");
  assert.equal(money(r.totals.C.subscription_monthly), "3000.00");
});

test("every bundled exemption names a server_id that exists in the registry", () => {
  for (const r of subs.rows) {
    for (const [serverId, reason] of Object.entries(r.bundled_server_ids ?? {})) {
      assert.ok(rowById(serverId), `${r.id} claims a bundled exemption for ${serverId}, which is not a server row`);
      assert.ok(typeof reason === "string" && reason.length > 0, `${r.id}: ${serverId} must carry the vendor's stated reason`);
    }
  }
});

test("determinism holds with the v0.5 layer attached", () => {
  const mk = () => base({
    laneA: { ...LANE_A, capex: "285000" },
    oneTime: { C: "1500" },
    subscription: subscriptionCost({ row: subById("nvidia-ai-enterprise-subscription"), quantityInputs: { gpus: 8 } }),
  });
  assert.equal(JSON.stringify(mk()), JSON.stringify(mk()));
  assert.ok(!/"-?\d+(\.\d+)?[eE][+-]?\d+"/.test(JSON.stringify(mk())), "money values must stay plain decimal strings");
});