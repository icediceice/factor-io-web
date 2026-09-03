// power.js — recurring electricity cost for the installed self-hosted fleet.
//
// Board power is published evidence. PUE, tariff and non-GPU node overhead are
// scenario assumptions. Keeping those terms separate is what lets the UI cite
// the wattage without presenting the user's facility assumptions as vendor data.

import { Dec } from "./exact.js";

const HOURS_PER_MONTH = 730n;
let rowsByGpu = new Map();

export class PowerRefusal extends RangeError {
  constructor(code, message, detail) {
    super(message);
    this.name = "PowerRefusal";
    this.code = code;
    this.detail = detail;
  }
}

export function configurePowerSeed(seed) {
  const rows = Array.isArray(seed?.rows) ? seed.rows : [];
  rowsByGpu = new Map(rows.map((row) => [row.gpu_id, Object.freeze({ ...row })]));
}

const nonNegative = (value, field) => {
  const d = Dec.from(String(value));
  if (d.sign() < 0) throw new PowerRefusal("bad_power_input", `${field} must not be negative`, { field, value });
  return d;
};

export function runningCost({ gpuId, gpusProvisioned, pue, usdPerKwh, nodeOverheadFraction }) {
  const row = rowsByGpu.get(gpuId);
  if (!row) {
    throw new PowerRefusal(
      "missing_tdp",
      `no cited board-power row for ${gpuId} — enter the monthly running cost manually`,
      { gpu_id: gpuId },
    );
  }
  if (!Number.isInteger(gpusProvisioned) || gpusProvisioned < 0) {
    throw new PowerRefusal(
      "bad_gpu_count",
      "the powered fleet must be a whole, non-negative number of installed GPUs",
      { gpus_provisioned: gpusProvisioned },
    );
  }

  const pueDec = nonNegative(pue, "pue");
  if (pueDec.lt("1")) {
    throw new PowerRefusal("bad_pue", "PUE must be at least 1", { pue });
  }
  const rate = nonNegative(usdPerKwh, "usd_per_kwh");
  const overhead = nonNegative(nodeOverheadFraction, "node_overhead_fraction");
  const gpuKw = Dec.from(String(row.tdp_w)).mul(BigInt(gpusProvisioned)).mul("0.001");
  const overheadKw = gpuKw.mul(overhead);
  const itKw = gpuKw.add(overheadKw);
  const facilityKw = itKw.mul(pueDec);
  const energyKwh = facilityKw.mul(HOURS_PER_MONTH);
  const monthly = energyKwh.mul(rate);

  return {
    monthly_usd: monthly.toString(),
    gpu_id: gpuId,
    gpus_provisioned: gpusProvisioned,
    terms: {
      board_tdp_w: {
        value: String(row.tdp_w),
        basis: "published",
        quoted_text: row.quoted_text,
        source_url: row.source_url,
        observed_at: row.observed_at,
      },
      gpu_load_kw: { value: gpuKw.toString(), basis: `${gpusProvisioned} installed GPUs × rated board power` },
      node_overhead_fraction: { value: overhead.toString(), basis: "assumed" },
      it_load_kw: { value: itKw.toString(), basis: "GPU load plus non-GPU node overhead" },
      pue: { value: pueDec.toString(), basis: "assumed" },
      facility_load_kw: { value: facilityKw.toString(), basis: "IT load × PUE" },
      hours_per_month: { value: HOURS_PER_MONTH.toString(), basis: "planning month" },
      energy_kwh: { value: energyKwh.toString(), basis: "facility load × hours" },
      usd_per_kwh: { value: rate.toString(), basis: "assumed" },
      monthly_usd: { value: monthly.toString(), basis: "energy × tariff" }
    }
  };
}