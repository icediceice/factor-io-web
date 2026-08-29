#!/usr/bin/env node
// refresh-pricing.mjs — THE refresh command (SPEC v0.2 §12.2 P1).
//
//   node scripts/refresh-pricing.mjs
//
// Repopulates BOTH halves of what the calculator prices from:
//   1. rented-GPU rates      -> tco-calculator/data/gpu-pricing.json
//   2. model names + tariffs -> tco-calculator/data/manifest.json + catalog-*.json
//
// WHY THIS IS A COMMAND AND NOT A CRON. A scheduled GitHub Action was the v0.1
// plan and was declined: GitHub silently disables scheduled workflows after 60
// days of default-branch inactivity (this repo has already sat 137 days once),
// and schedule runs are dropped under load. That makes a green Actions tab an
// unreliable freshness signal — and a freshness signal you cannot trust is worse
// than none, because it is believed. The client's own SourceStatus envelope
// (SPEC §5.2/§5.5) remains the ONLY authority on staleness: it reads observed_at
// out of the data and banners when it expires, regardless of what any CI said.
//
// Exit code is non-zero if either half fails, so a wrapper can trust it.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_DIR = `${ROOT}tco-calculator/data/`;

function run(script) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [`${ROOT}scripts/${script}`], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => resolve({ script, code, out, err, ms: Date.now() - started }));
  });
}

const banner = (s) => `\n${"─".repeat(72)}\n${s}\n${"─".repeat(72)}`;

async function main() {
  console.log(banner("1/2  Rented-GPU rates  (AWS + Azure first-party, aggregator indicative)"));
  const gpu = await run("build-gpu-pricing.mjs");
  process.stdout.write(gpu.out);
  if (gpu.code !== 0) {
    process.stderr.write(gpu.err);
    console.error(`\n✗ GPU pricing refresh FAILED (exit ${gpu.code}) after ${gpu.ms}ms — data/gpu-pricing.json was NOT rewritten, so the previous rates and their observed_at stand.`);
    process.exit(1);
  }

  console.log(banner("2/2  Model names + tariffs  (LiteLLM + OpenRouter)"));
  const snap = await run("build-snapshot.mjs");
  process.stdout.write(snap.out);
  if (snap.code !== 0) {
    process.stderr.write(snap.err);
    console.error(`\n✗ Model snapshot refresh FAILED (exit ${snap.code}) after ${snap.ms}ms.`);
    process.exit(1);
  }

  // Coverage summary — the operator's actual question is "did the providers I
  // care about come back", which neither sub-script can answer alone.
  let summary = null;
  try {
    const doc = JSON.parse(await readFile(`${DATA_DIR}gpu-pricing.json`, "utf8"));
    const manifest = JSON.parse(await readFile(`${DATA_DIR}manifest.json`, "utf8"));
    summary = { doc, manifest };
  } catch (e) {
    console.error(`\n✗ refreshed, but the written files could not be re-read: ${e.message}`);
    process.exit(1);
  }

  const { doc, manifest } = summary;
  console.log(banner("Coverage"));
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad("PROVIDER", 18)}${pad("TIER", 14)}${pad("ROWS", 6)}GPUS`);
  for (const [key, p] of Object.entries(doc.providers)) {
    console.log(`${pad(p.label, 18)}${pad(p.confidence, 14)}${pad(p.rows, 6)}${p.gpus.join(", ")}`);
  }

  const expected = ["aws", "azure", "gcp"];
  const missing = expected.filter((k) => !doc.providers[k]);
  const chinese = ["alibaba", "tencent", "huawei", "volcengine"].filter((k) => doc.providers[k]);

  console.log(`\nmodels        ${manifest.models.length} selectable · snapshot ${manifest.snapshot_digest}`);
  console.log(`gpu rows      ${doc.rows.length} (${doc.rows.filter((r) => r.confidence === "first_party").length} first-party, ${doc.rows.filter((r) => r.confidence === "indicative").length} indicative)`);
  console.log(`chinese cloud ${chinese.length ? chinese.join(", ") : "NONE — the aggregator returned no Chinese provider this run"}`);
  console.log(`observed_at   ${doc.generated_at}`);

  if (missing.length) {
    console.warn(`\n⚠  expected provider(s) absent: ${missing.join(", ")} — rows for them will not render. This is a coverage warning, not a crash: the registry that WAS written is internally consistent.`);
  }
  if (!chinese.length) {
    console.warn("⚠  no Chinese cloud rates this run — the aggregator's markup may have moved for those rows specifically.");
  }
  console.log("\n✓ refresh complete.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});