// refresh-and-publish.sh is the only thing in this repo that commits and pushes
// with no human watching, so its REFUSALS are the whole safety story. Every
// case below stops before `git fetch`, which is what keeps this test offline.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "refresh-and-publish.sh");

// A throwaway clone with no remote: the guards under test all fire before any
// network call, and the absence of a remote proves it if one ever stops doing so.
function clone(branch = "main") {
  const dir = mkdtempSync(join(tmpdir(), "factor-tco-refresh-"));
  const git = (...args) => execFileSync("git", [
    "-c", "user.email=test@example.invalid",
    "-c", "user.name=test",
    "-c", "commit.gpgsign=false",
    "-c", "core.hooksPath=/dev/null",
    ...args,
  ], { cwd: dir, stdio: "pipe" });
  git("init", "-q");
  git("checkout", "-q", "-b", branch);
  mkdirSync(join(dir, "tco-calculator", "data"), { recursive: true });
  writeFileSync(join(dir, "tco-calculator", "data", "manifest.json"), "{}\n");
  git("add", "-A");
  git("commit", "-qm", "seed");
  return dir;
}

function run(dir) {
  return spawnSync("bash", [SCRIPT], {
    cwd: dir,
    env: { ...process.env, FACTOR_TCO_CLONE: dir, FACTOR_TCO_BRANCH: "main" },
    encoding: "utf8",
    timeout: 30000,
  });
}

function withClone(branch, body) {
  const dir = clone(branch);
  try { body(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("an untracked file under data/ is refused, not published", () => {
  withClone("main", (dir) => {
    // Precisely what a crashed earlier run leaves behind: refresh-pricing.mjs
    // writes the content-addressed catalog before the manifest pins it. `git
    // diff` cannot see this file, and `git add -A -- tco-calculator/data` would
    // have staged it, while the outside-surface check excludes that directory.
    writeFileSync(join(dir, "tco-calculator", "data", "catalog-deadbeef00000000.json"), "{}\n");
    const r = run(dir);
    assert.equal(r.status, 3, `expected refusal, got ${r.status}\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /working tree is dirty/);
    assert.match(r.stdout, /catalog-deadbeef00000000\.json/, "the refusal names what it found");
  });
});

test("an untracked file outside data/ is refused too", () => {
  withClone("main", (dir) => {
    writeFileSync(join(dir, "scratch.txt"), "left behind\n");
    const r = run(dir);
    assert.equal(r.status, 3, `expected refusal, got ${r.status}\n${r.stdout}${r.stderr}`);
  });
});

test("a modified tracked file is refused", () => {
  withClone("main", (dir) => {
    writeFileSync(join(dir, "tco-calculator", "data", "manifest.json"), '{"edited":true}\n');
    const r = run(dir);
    assert.equal(r.status, 3, `expected refusal, got ${r.status}\n${r.stdout}${r.stderr}`);
  });
});

test("a clone on the wrong branch is refused before anything else", () => {
  withClone("scratch", (dir) => {
    const r = run(dir);
    assert.equal(r.status, 2, `expected branch refusal, got ${r.status}\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /not 'main'/);
  });
});

// The other half of the guard, and the reason it is written as one porcelain
// check rather than a pile of them: a false refusal would silently stop the
// snapshot refreshing, and the page would just quietly start bannering.
test("a clean clone is not refused as dirty", () => {
  withClone("main", (dir) => {
    const r = run(dir);
    assert.notEqual(r.status, 3, `a clean tree must not be refused as dirty\n${r.stdout}${r.stderr}`);
    assert.notEqual(r.status, 2);
    assert.doesNotMatch(r.stdout, /working tree is dirty/);
    // It gets as far as the fetch and dies there, because this clone has no
    // remote. That is the guard passing, which is all this asserts.
  });
});