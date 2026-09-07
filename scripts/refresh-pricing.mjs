#!/usr/bin/env node
// refresh-pricing.mjs — THE refresh command (SPEC v0.2 §12.2 P1).
//
//   node scripts/refresh-pricing.mjs
//
// Repopulates all five source groups the calculator prices or converts from:
//   1. rented-GPU rates       -> tco-calculator/data/gpu-pricing.json
//   2. model names + tariffs  -> tco-calculator/data/manifest.json + catalog-*.json
//   3. serving-model presets  -> tco-calculator/data/serving-models.json
//   4. server acquisition     -> tco-calculator/data/server-pricing.json
//   5. EUR/USD + EUR/THB FX   -> tco-calculator/data/fx.json + manifest pin
//
// Stage 3 is what keeps the SELF-HOSTED side from going stale. Stages 1 and 2
// price the rented and API lanes and were always refreshable; the serving presets
// were hand-curated, so the calculator's own model list aged silently while
// everything around it stayed current.
//
// Stage 4 is NOT a scraper and cannot be one: no server vendor publishes a list
// price for a GPU node — Dell, HPE and Supermicro all quote through sales. It
// re-fetches each cited page and asserts the quoted sentence is still there, so
// the failure it catches is the real one: a published figure quietly changing
// under a citation the calculator still displays.
//
// WHY THIS IS NOT A SCHEDULED GITHUB ACTION. That was the v0.1 plan and it was
// declined, on two grounds that still hold and were re-confirmed in v0.8: GitHub
// silently disables scheduled workflows after 60 days of default-branch
// inactivity (this repo has already sat 137 days once), and schedule runs are
// dropped or delayed under load. Do not revive it.
//
// THE CONSTRAINT THAT OUTLIVED THAT DECISION, and the one that actually matters:
// a green CI tab is an unreliable freshness signal, and a freshness signal you
// cannot trust is worse than none, because it is believed. The client's own
// SourceStatus envelope (SPEC §5.2/§5.5) remains the ONLY authority on staleness:
// it reads observed_at out of the data it actually loaded and banners when that
// expires, regardless of what any scheduler did or claims to have done. No page
// may ever display "last refreshed by <the scheduler>".
//
// SINCE v0.8 this command is ALSO run unattended, by the factor-tco-refresh
// systemd user timer on light-worker (scripts/refresh-and-publish.sh, units in
// scripts/deploy/). That is not a reversal of the above: a systemd timer sidesteps
// both premises rather than rebutting them — it cannot disable itself for
// inactivity, and Persistent=true catches up a run missed while the host was off.
// It is still not evidence of anything. If it dies, the envelope banners, exactly
// as it does when nobody runs this by hand.
//
// Exit code is non-zero if either half fails, so a wrapper can trust it.
import { spawn } from "node:child_process";
import { readFile, readdir, unlink } from "node:fs/promises";
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
  console.log(banner("1/5  Rented-GPU rates  (AWS + Azure first-party, aggregator indicative)"));
  const gpu = await run("build-gpu-pricing.mjs");
  process.stdout.write(gpu.out);
  if (gpu.code !== 0) {
    process.stderr.write(gpu.err);
    console.error(`\n✗ GPU pricing refresh FAILED (exit ${gpu.code}) after ${gpu.ms}ms — data/gpu-pricing.json was NOT rewritten, so the previous rates and their observed_at stand.`);
    process.exit(1);
  }

  console.log(banner("2/5  Model names + tariffs  (LiteLLM + OpenRouter)"));
  const snap = await run("build-snapshot.mjs");
  process.stdout.write(snap.out);
  if (snap.code !== 0) {
    process.stderr.write(snap.err);
    console.error(`\n✗ Model snapshot refresh FAILED (exit ${snap.code}) after ${snap.ms}ms.`);
    process.exit(1);
  }

  console.log(banner("3/5  Serving-model presets  (Hugging Face Hub, ranked by trendingScore)"));
  const serving = await run("build-serving-models.mjs");
  process.stdout.write(serving.out);
  if (serving.code !== 0) {
    process.stderr.write(serving.err);
    console.error(`\n✗ Serving-model refresh FAILED (exit ${serving.code}) after ${serving.ms}ms — data/serving-models.json was NOT rewritten, so the previous presets and their observed_at stand.`);
    process.exit(1);
  }

  console.log(banner("4/5  Server acquisition prices  (cited bands, citations re-verified)"));
  const servers = await run("build-server-pricing.mjs");
  process.stdout.write(servers.out);
  if (servers.code !== 0) {
    process.stderr.write(servers.err);
    // The builder exits non-zero only when NO citation verified, which means the
    // run itself was broken (offline, or every publisher moved at once) rather
    // than one figure going stale. Individual broken citations are reported as
    // coverage below and the rows survive, flagged unverified.
    console.error(`\n✗ Server-pricing refresh FAILED (exit ${servers.code}) after ${servers.ms}ms — data/server-pricing.json was NOT rewritten, so the previous bands and their observed_at stand.`);
    process.exit(1);
  }

  console.log(banner("5/5  USD→THB FX  (official ECB EUR reference-rate cross)"));
  const fx = await run("build-fx.mjs");
  process.stdout.write(fx.out);
  if (fx.code !== 0) {
    process.stderr.write(fx.err);
    console.error(`\n✗ FX refresh FAILED (exit ${fx.code}) after ${fx.ms}ms — data/fx.json and its manifest pin were NOT rewritten, so the previous rate and observed_at stand.`);
    process.exit(1);
  }

  // Coverage summary — the operator's actual question is "did the providers I
  // care about come back", which neither sub-script can answer alone.
  let summary = null;
  try {
    const doc = JSON.parse(await readFile(`${DATA_DIR}gpu-pricing.json`, "utf8"));
    const manifest = JSON.parse(await readFile(`${DATA_DIR}manifest.json`, "utf8"));
    const servingDoc = JSON.parse(await readFile(`${DATA_DIR}serving-models.json`, "utf8"));
    const serverDoc = JSON.parse(await readFile(`${DATA_DIR}server-pricing.json`, "utf8"));
    const fxDoc = JSON.parse(await readFile(`${DATA_DIR}fx.json`, "utf8"));
    summary = { doc, manifest, servingDoc, serverDoc, fxDoc };
  } catch (e) {
    console.error(`\n✗ refreshed, but the written files could not be re-read: ${e.message}`);
    process.exit(1);
  }

  const { doc, manifest, servingDoc, serverDoc, fxDoc } = summary;
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

  const derived = (servingDoc.models ?? []).filter((m) => m.basis === "derived");
  const curatedCount = (servingDoc.models ?? []).length - derived.length;
  console.log(`serving       ${derived.length} derived from the Hub + ${curatedCount} hand-curated · ${servingDoc.coverage?.resolved_base_count ?? 0} resolved bases · ${servingDoc.coverage?.gated_repo_count ?? 0} gated repos · newest preset ${derived[0]?.id ?? "NONE"}`);
  if (servingDoc.skipped?.length) {
    // Skips are the honest half of this stage: a model the mapper cannot express
    // must be VISIBLE, or its absence reads as "the Hub had nothing newer".
    const byReason = new Map();
    for (const s of servingDoc.skipped) {
      const key = s.reason.split("—")[0].trim();
      byReason.set(key, (byReason.get(key) ?? 0) + 1);
    }
    console.log(`serving skips ${servingDoc.skipped.length} — ${[...byReason].map(([r, n]) => `${n} ${r}`).join("; ")}`);
  }
  // Server bands: the number that matters is how many citations still hold, not
  // how many rows exist — a row whose source page has been reworded is still
  // rendered, but it is rendered as unverified, and the operator needs to know
  // that count without opening the file.
  const srvRows = serverDoc.rows ?? [];
  const srvVerified = srvRows.filter((r) => r.verification?.status === "verified").length;
  const srvBroken = srvRows.filter((r) => r.verification?.status === "citation_broken").length;
  const srvUnreachable = srvRows.filter((r) => r.verification?.status === "unreachable").length;
  console.log(`server rows   ${srvRows.length} across ${Object.keys(serverDoc.by_gpu ?? {}).length} accelerators (${Object.keys(serverDoc.by_gpu ?? {}).join(", ")})`);
  console.log(`server cites  ${srvVerified} verified · ${srvBroken} broken · ${srvUnreachable} unreachable`);
  console.log(`fx             EUR/USD ${fxDoc.eur_usd} · EUR/THB ${fxDoc.eur_thb} · observed ${fxDoc.observed_at}`);

  console.log(`observed_at   ${doc.generated_at}`);

  if (missing.length) {
    console.warn(`\n⚠  expected provider(s) absent: ${missing.join(", ")} — rows for them will not render. This is a coverage warning, not a crash: the registry that WAS written is internally consistent.`);
  }
  if (!chinese.length) {
    console.warn("⚠  no Chinese cloud rates this run — the aggregator's markup may have moved for those rows specifically.");
  }
  if (srvBroken || srvUnreachable) {
    console.warn(`⚠  ${srvBroken + srvUnreachable} server citation(s) did not re-verify — those rows still render, tagged unverified, at their ORIGINAL observed_at. Re-check them by hand before quoting the figure.`);
  }
  // An accelerator the rented registry prices but the server registry does not
  // is the gap a user meets as "enter the hardware cost yourself". Naming it
  // here is the difference between a known coverage hole and a silent one.
  const srvGpus = new Set(Object.keys(serverDoc.by_gpu ?? {}));
  const uncovered = [...new Set(doc.rows.map((r) => r.gpu_id))].filter((g) => !srvGpus.has(g));
  if (uncovered.length) {
    console.warn(`⚠  no server band for: ${uncovered.join(", ")} — the calculator will ask the user to enter capex for those accelerators.`);
  }
  // Each run writes a NEW content-addressed catalog, and nothing used to remove
  // the one it replaced — five superseded 2.4-2.7MB files had accumulated in a
  // repo that GitHub Pages serves wholesale. They cannot simply be gitignored:
  // the live catalog is named by manifest.resources.catalog.path and MUST stay
  // tracked, so pruning is the only correct fix. Only the catalog this run just
  // pinned survives.
  const live = manifest.resources?.catalog?.path;
  if (live) {
    const stale = (await readdir(DATA_DIR))
      .filter((f) => /^catalog-[0-9a-f]+\.json$/.test(f) && f !== live);
    for (const file of stale) await unlink(`${DATA_DIR}${file}`);
    if (stale.length) console.log(`pruned        ${stale.length} superseded catalog(s), kept ${live}`);
  }

  console.log("\n✓ refresh complete.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});