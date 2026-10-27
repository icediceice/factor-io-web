// Quarantined verify-ship acceptance cases for local:b6e0ec2641dcf4238cd45b6d4447a3a4.
// No Colab subprocess or network is used; only createDemo's observable lifecycle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemo, CAP_MS } from '../../lib/demo.mjs';

const settle = async () => { for (let n = 0; n < 12; n++) await new Promise(resolve => setImmediate(resolve)); };
function clock() {
  let now = 1000, next = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) { timers.set(++next, { at: now + ms, fn }); return next; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      now += ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]); due[1].fn();
      }
    },
  };
}
function fixture(t, overrides = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'demo-verify-'));
  const calls = [];
  const time = clock();
  const replies = {
    start: { ok: true, endpoint: 'ep-demo' },
    run: { ok: true, run_id: 'run-demo' },
    status: { ok: true, hb: { state: 'running' } },
    pull: { ok: false, error: 'download_failed' },
    stop: { ok: true, gone: true },
    ...overrides,
  };
  const options = {
    dataDir, backendDir: '/unused-backend', clock: time, pollMs: { booting: 1000, ready: 1000 },
    colab: { async call(req) { calls.push(req); const reply = replies[req.verb]; return typeof reply === 'function' ? reply(req) : reply; } },
  };
  let demo = createDemo(options);
  t.after(() => { demo.close(); rmSync(dataDir, { recursive: true, force: true }); });
  return {
    get demo() { return demo; }, calls, time,
    async boot() { demo.start({}); await settle(); assert.equal(demo.view().phase, 'booting'); },
    restart() { demo.close(); demo = createDemo(options); },
  };
}

test('G1: an unconfirmed early stop retains enforcement of the original six-hour deadline', async t => {
  let attempts = 0;
  const f = fixture(t, { stop: () => ++attempts === 1 ? { ok: false, error: 'stop_unconfirmed' } : { ok: true, gone: true } });
  await f.boot();
  f.demo.stop(); await settle();
  assert.equal(f.demo.view().phase, 'failed');
  assert.equal(f.demo.view().vmHeld, true);
  f.time.advance(CAP_MS); await settle();
  assert.equal(f.calls.filter(req => req.verb === 'stop').length, 2, 'the deadline must retry release while the VM may still be held');
  assert.equal(f.demo.view().vmHeld, false);
});

test('G1: failed/vmHeld state is recovered when restarting across the deadline', async t => {
  let attempts = 0;
  const f = fixture(t, { stop: () => ++attempts === 1 ? { ok: false, error: 'stop_unconfirmed' } : { ok: true, gone: true } });
  await f.boot();
  f.demo.stop(); await settle();
  assert.equal(f.demo.view().vmHeld, true);
  f.demo.close(); f.time.advance(CAP_MS);
  f.restart(); await settle();
  assert.equal(f.calls.filter(req => req.verb === 'stop').length, 2, 'startup must enforce a persisted overdue VM obligation in failed phase');
  assert.equal(f.demo.view().vmHeld, false);
});

test('G2: an unattributed allocation plus stop/not_found keeps a possible billing VM blocked', async t => {
  const f = fixture(t, {
    start: { ok: false, error: 'unattributed', message: 'new succeeded but its endpoint could not be identified; stop did not confirm' },
    stop: { ok: false, error: 'not_found', message: 'no live or journaled session' },
  });
  f.demo.start({}); await settle();
  assert.equal(f.calls.filter(req => req.verb === 'stop').length, 1, 'the uncertain allocation was sent to cleanup');
  assert.equal(f.demo.view().phase, 'failed');
  assert.equal(f.demo.view().vmHeld, true, 'missing attribution is not confirmation of VM disappearance');
  assert.throws(() => f.demo.start({}), error => error.statusCode === 409);
});

test('G3: a helper crash during status releases a rented VM instead of continuing it', async t => {
  const f = fixture(t, { status: () => { throw new Error('helper process crashed without a LIGHTCOLAB result'); } });
  await f.boot();
  f.time.advance(1000); await settle();
  assert.equal(f.calls.filter(req => req.verb === 'stop').length, 1, 'promise 7 requires release after a post-rental helper crash');
  assert.equal(f.demo.view().phase, 'failed');
  assert.equal(f.demo.view().vmHeld, false);
});