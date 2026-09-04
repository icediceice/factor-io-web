import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { configurePowerSeed, runningCost, PowerRefusal } from "../power.js";

const seed = JSON.parse(await readFile(new URL("../data/power-seed.json", import.meta.url), "utf8"));
configurePowerSeed(seed);

const scenario = (gpusProvisioned) => runningCost({
  gpuId: "h100",
  gpusProvisioned,
  pue: "1.4",
  usdPerKwh: "0.12",
  nodeOverheadFraction: "0.2",
});

test("running cost derives the fleet electricity bill with exact decimal arithmetic", () => {
  const cost = scenario(8);
  assert.equal(cost.monthly_usd, "824.1408");
  assert.equal(cost.terms.gpu_load_kw.value, "5.6");
  assert.equal(cost.terms.it_load_kw.value, "6.72");
  assert.equal(cost.terms.facility_load_kw.value, "9.408");
  assert.equal(cost.terms.energy_kwh.value, "6867.84");
});

test("running cost meters GPUs installed, not only GPUs required by the workload", () => {
  const installed = scenario(8);
  const requiredOnly = scenario(3);
  assert.equal(installed.gpus_provisioned, 8);
  assert.equal(installed.monthly_usd, "824.1408");
  assert.equal(requiredOnly.monthly_usd, "309.0528");
  assert.equal(installed.terms.gpu_load_kw.basis, "8 installed GPUs × rated board power");
});

// The two RTX PRO 6000 editions are separate accelerators BECAUSE their decode
// bandwidth differs (1792 vs 1597 GB/s), not because their power does. Board
// power is identically 600 W on both, each from its own citation, so the split
// must NOT leak into the electricity bill — if these two figures ever diverge,
// a TDP was invented for one edition rather than cited.
test("both RTX PRO 6000 editions resolve a cited 600 W board power, and the split does not reach the power model", () => {
  const opts = { gpusProvisioned: 8, pue: "1.4", usdPerKwh: "0.12", nodeOverheadFraction: "0.2" };
  const ws = runningCost({ gpuId: "rtx_pro_6000_ws", ...opts });
  const se = runningCost({ gpuId: "rtx_pro_6000_se", ...opts });
  assert.equal(ws.terms.gpu_load_kw.value, "4.8"); // 8 × 600 W
  assert.equal(ws.monthly_usd, "706.4064");
  assert.equal(se.monthly_usd, ws.monthly_usd);
  assert.equal(se.terms.gpu_load_kw.value, ws.terms.gpu_load_kw.value);
});

test("a selectable accelerator without a cited TDP refuses instead of borrowing a default", () => {
  assert.throws(
    () => runningCost({
      gpuId: "a800",
      gpusProvisioned: 8,
      pue: "1.4",
      usdPerKwh: "0.12",
      nodeOverheadFraction: "0.2",
    }),
    (e) => e instanceof PowerRefusal && e.name === "PowerRefusal" && e.code === "missing_tdp",
  );
});