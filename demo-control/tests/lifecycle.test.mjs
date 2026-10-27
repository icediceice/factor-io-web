// Stop pressed while the GPU is still being rented or the backend uploaded: the
// helper call in flight finishes first, then the VM is released and nothing
// further runs. Drives createDemo directly with an in-memory helper.
// (From the verify-ship pass of plan local:b6e0ec2641dcf4238cd45b6d4447a3a4.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemo } from '../lib/demo.mjs';

const settle = async () => { for (let n = 0; n < 12; n++) await new Promise((resolve) => setImmediate(resolve)); };
const clock = { now: () => 1000, setTimeout: () => 0, clearTimeout() {} };

for (const phase of ['renting', 'uploading']) test(`Stop during ${phase} waits for the helper, then releases the VM`, async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'demo-lifecycle-'));
  const calls = [];
  let resume;
  const gate = new Promise((resolve) => { resume = resolve; });
  const verb = phase === 'renting' ? 'start' : 'run';
  const replies = { start: { ok: true, endpoint: 'ep-demo' }, run: { ok: true, run_id: 'run-demo' }, stop: { ok: true, gone: true } };
  const reply = replies[verb];
  replies[verb] = () => gate;
  const demo = createDemo({
    dataDir, backendDir: '/unused-backend', clock, pollMs: { booting: 1000, ready: 1000 },
    colab: { async call(req) { calls.push(req); const r = replies[req.verb]; return typeof r === 'function' ? r(req) : r; } },
  });
  t.after(() => { demo.close(); rmSync(dataDir, { recursive: true, force: true }); });

  demo.start({}); await settle();
  assert.equal(demo.view().phase, phase);
  demo.stop();
  assert.equal(calls.filter((req) => req.verb === 'stop').length, 0, 'the helper call in flight finishes before the stop');
  resume(reply); await settle();
  assert.equal(calls.filter((req) => req.verb === 'stop').length, 1);
  assert.equal(demo.view().phase, 'stopped');
  assert.equal(demo.view().vmHeld, false);
  if (verb === 'start') assert.equal(calls.filter((req) => req.verb === 'run').length, 0, 'nothing is uploaded after Stop');
});
