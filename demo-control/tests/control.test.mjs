// Behaviour tests for the demo control app: real HTTP server, real helper
// spawning, and tests/fake_helper.py standing in for Light's Colab helper.
// Time is a manual clock, so the 6 h cap is tested without waiting 6 hours.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(HERE, '..', '..', 'demo', 'chat', 'backend');
const HOST = 'demo.test';
const HOUR = 3600_000;
const POLL = { booting: 1000, ready: 1000 };
const LINK = 'https://studio.factor-io.com/demo/chat/?api=https://abc.trycloudflare.com';

const RUNNING_HB = { ok: true, hb: { state: 'running', run_id: 'run-1', log_tail: 'Downloading the model\n' } };
const BOOTING_VM = { content: { state: 'downloading', message: 'Downloading the model' } };
const READY_VM = { content: { state: 'ready', link: LINK, tunnel: 'https://abc.trycloudflare.com', gpu: 'NVIDIA RTX PRO 6000', size: 'NVFP4' } };
const HAPPY = {
  start: { ok: true, endpoint: 'gpu-g4-abc', balance_cu: 120.5, rate_cu_per_hr: 4.2 },
  run: { ok: true, run_id: 'run-1' },
  status: RUNNING_HB,
  pull: [BOOTING_VM, READY_VM],
  stop: { ok: true, gone: true },
};

function manualClock(start = Date.UTC(2026, 9, 27, 9)) {
  let now = start;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) { timers.set(++seq, { at: now + ms, fn }); return seq; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      now += ms;
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) return;
        timers.delete(due[0]);
        due[1].fn();
      }
    },
  };
}

/** A data dir, a request log and a scripted helper, shared by app restarts. */
function fixture(t, scenario) {
  const dir = mkdtempSync(join(tmpdir(), 'demo-control-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // fake_helper.py finds helper.jsonl and scenario.json next to the request's cli path.
  const fix = { dir, log: join(dir, 'helper.jsonl'), cli: join(dir, 'colab') };
  writeFileSync(fix.log, '');
  writeFileSync(join(dir, 'scenario.json'), JSON.stringify(scenario));
  return fix;
}

function calls(fix, verb) {
  const all = readFileSync(fix.log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return verb ? all.filter((c) => c.verb === verb) : all;
}

async function serve(t, fix, clock) {
  const app = createApp({
    DEMO_ALLOWED_HOSTS: HOST,
    DEMO_COLAB_PYTHON: 'python3',
    DEMO_COLAB_HELPER: join(HERE, 'fake_helper.py'),
    DEMO_COLAB_CLI: fix.cli,
    DEMO_BACKEND: BACKEND,
    DEMO_DATA: join(fix.dir, 'data'),
  }, { clock, pollMs: POLL, log: () => {} });
  const server = createServer((req, res) => app.handle(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  // Waits for a flow still talking to the helper, so a restarted app never
  // overlaps it and the fixture is not removed under it.
  const stop = async () => { server.close(); await app.close(); };
  t.after(stop);
  return { port: server.address().port, close: stop };
}

function request(port, method, path, { host = HOST, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers: { host, ...headers } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data, json: () => JSON.parse(data) }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

// What the control page's own fetch() sends.
const post = (port, path, payload = {}, headers = {}) => request(port, 'POST', path, {
  headers: { 'content-type': 'application/json', origin: `http://${HOST}`, 'sec-fetch-site': 'same-origin', ...headers },
  body: JSON.stringify(payload),
});

async function waitFor(port, pred, what) {
  const until = Date.now() + 10_000;
  let last;
  while (Date.now() < until) {
    last = (await request(port, 'GET', '/api/state')).json();
    if (pred(last)) return last;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail(`timed out waiting for ${what}; last state: ${JSON.stringify(last)}`);
}

// After clock.advance(), the flow that timer started has finished once the
// state carries the new time.
const caughtUp = (port, clock, what) => waitFor(port, (s) => s.updatedAt === clock.now(), what);

async function startToBooting(port, settings = {}) {
  const res = await post(port, '/api/start', settings);
  assert.equal(res.status, 202, res.body);
  return waitFor(port, (s) => s.phase === 'booting', 'booting');
}

test('Start rents a G4 capped at 6 h, runs the backend under timeout 6h, and shows the link once ready', async (t) => {
  const fix = fixture(t, HAPPY);
  const clock = manualClock();
  const { port } = await serve(t, fix, clock);

  const booting = await startToBooting(port, { model: 'nvfp4', context: '128k', parallel: 3 });
  assert.equal(booting.stopAt, booting.startedAt + 6 * HOUR);

  const [start] = calls(fix, 'start');
  assert.equal(start.gpu, 'G4');
  assert.equal(start.max_hours, 6);
  assert.equal(start.session, booting.session);
  const [run] = calls(fix, 'run');
  assert.equal(run.session, booting.session);
  assert.equal(run.local_path, BACKEND);
  assert.equal(run.command, 'MODEL=nvfp4 CONTEXT=128k PARALLEL=3 KEEPALIVE=1 timeout 6h bash colab_start.sh');

  clock.advance(POLL.booting);
  await waitFor(port, (s) => s.vmState === 'downloading', 'the VM progress');
  clock.advance(POLL.booting);
  const ready = await waitFor(port, (s) => s.phase === 'ready', 'ready');
  assert.equal(ready.link, LINK);
  assert.match(ready.logTail, /Downloading the model/);
  assert.equal(calls(fix, 'stop').length, 0, 'a healthy demo is not stopped');
});

test('only one demo runs at a time', async (t) => {
  const fix = fixture(t, HAPPY);
  const { port } = await serve(t, fix, manualClock());
  await startToBooting(port);
  const second = await post(port, '/api/start');
  assert.equal(second.status, 409);
  assert.equal(calls(fix, 'start').length, 1);
});

test('Stop releases the VM and ends the demo', async (t) => {
  const fix = fixture(t, HAPPY);
  const clock = manualClock();
  const { port } = await serve(t, fix, clock);
  const { session } = await startToBooting(port);

  assert.equal((await post(port, '/api/stop')).status, 202);
  const stopped = await waitFor(port, (s) => s.phase === 'stopped', 'stopped');
  assert.deepEqual(calls(fix, 'stop').map((c) => c.session), [session]);
  assert.equal(stopped.vmHeld, false);
  assert.equal(stopped.link, '');

  // The demo can be started again afterwards.
  assert.equal((await post(port, '/api/start')).status, 202);
});

test('a Colab stop that is not confirmed keeps the demo blocked and Stop retries it', async (t) => {
  const fix = fixture(t, { ...HAPPY, stop: [{ ok: false, error: 'timeout', message: 'proxy timed out' }, { ok: true, gone: true }] });
  const { port } = await serve(t, fix, manualClock());
  await startToBooting(port);

  await post(port, '/api/stop');
  const held = await waitFor(port, (s) => s.phase === 'failed', 'failed');
  assert.equal(held.vmHeld, true);
  assert.match(held.message, /may still be billing/);
  assert.equal((await post(port, '/api/start')).status, 409, 'no second VM while one may be billing');

  await post(port, '/api/stop');
  await waitFor(port, (s) => s.phase === 'stopped' && s.vmHeld === false, 'stopped');
  assert.equal(calls(fix, 'stop').length, 2);
});

test('a stop Colab does not confirm is retried by itself, and again first thing after a restart past 6 h', async (t) => {
  const unconfirmed = { ok: false, error: 'stop_unconfirmed' };
  const fix = fixture(t, { ...HAPPY, stop: [unconfirmed, unconfirmed, { ok: true, gone: true }] });
  const clock = manualClock();
  const first = await serve(t, fix, clock);
  const { session } = await startToBooting(first.port);

  await post(first.port, '/api/stop');
  await waitFor(first.port, (s) => s.phase === 'failed' && s.vmHeld, 'held');
  clock.advance(POLL.ready);
  const held = await waitFor(first.port, (s) => s.phase === 'failed' && s.updatedAt === clock.now(), 'the automatic retry');
  assert.equal(calls(fix, 'stop').length, 2, 'retried without anyone pressing Stop');
  assert.equal(held.vmHeld, true);
  await first.close();

  clock.advance(6 * HOUR);
  const second = await serve(t, fix, clock);
  const stopped = await waitFor(second.port, (s) => s.phase === 'stopped', 'released on resume');
  assert.equal(stopped.vmHeld, false);
  assert.deepEqual(calls(fix, 'stop').map((c) => c.session), [session, session, session]);
});

test('a GPU rented but not attributed keeps Start blocked until Colab no longer lists it', async (t) => {
  // The helper's stop answers not_found for a session it could not attribute,
  // which says nothing about whether Colab still bills it.
  const fix = fixture(t, {
    ...HAPPY,
    start: { ok: false, error: 'unattributed', message: 'colab new succeeded but its endpoint could not be identified' },
    stop: { ok: false, error: 'not_found', message: 'no live or journaled session' },
    sessions: [{ ok: true, raw: 'NAME  ENDPOINT\n$SESSION  gpu-g4-zzz\n' }, { ok: true, raw: 'NAME  ENDPOINT\n' }],
  });
  const clock = manualClock();
  const { port } = await serve(t, fix, clock);
  await post(port, '/api/start');
  const held = await waitFor(port, (s) => s.phase === 'failed', 'failed');
  assert.equal(held.vmHeld, true);
  assert.match(held.message, /may still be billing/);
  assert.equal((await post(port, '/api/start')).status, 409);
  assert.equal(calls(fix, 'run').length, 0);

  clock.advance(POLL.ready);
  const released = await waitFor(port, (s) => s.phase === 'failed' && s.vmHeld === false, 'released');
  assert.match(released.message, /endpoint could not be identified/);
  assert.equal((await post(port, '/api/start')).status, 202);
});

test('three helper crashes in a row while watching the VM end the demo and release it; fewer do not', async (t) => {
  const crash = { crash: true };
  const fix = fixture(t, { ...HAPPY, status: [crash, RUNNING_HB, RUNNING_HB, crash, crash, crash], pull: [crash, BOOTING_VM] });
  const clock = manualClock();
  const { port } = await serve(t, fix, clock);
  await startToBooting(port);

  for (let i = 1; i <= 2; i++) {
    clock.advance(POLL.booting);
    const warned = await caughtUp(port, clock, `crash ${i}`);
    assert.match(warned.warning, /no result/, 'a crash is shown, not hidden');
  }
  clock.advance(POLL.booting);
  const healthy = await caughtUp(port, clock, 'a clean poll');
  assert.equal(healthy.warning, '');
  assert.equal(calls(fix, 'stop').length, 0, 'two crashes with a clean poll after them keep the demo');

  for (let i = 0; i < 3; i++) {
    clock.advance(POLL.booting);
    await caughtUp(port, clock, 'the next poll');
  }
  const failed = await waitFor(port, (s) => s.phase === 'failed', 'failed');
  assert.match(failed.message, /failed 3 times in a row/);
  assert.equal(failed.vmHeld, false);
  assert.equal(calls(fix, 'stop').length, 1);
});

test('the demo stops by itself 6 hours after Start', async (t) => {
  const fix = fixture(t, HAPPY);
  const clock = manualClock();
  const { port } = await serve(t, fix, clock);
  await startToBooting(port);

  clock.advance(6 * HOUR - 1);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(calls(fix, 'stop').length, 0, 'not before the 6 h mark');

  clock.advance(1);
  const stopped = await waitFor(port, (s) => s.phase === 'stopped', 'the 6 h auto-stop');
  assert.match(stopped.message, /after 6 hours/);
  assert.equal(calls(fix, 'stop').length, 1);
});

test('the 6 h cap survives a restart of the control app', async (t) => {
  const fix = fixture(t, HAPPY);
  const clock = manualClock();
  const first = await serve(t, fix, clock);
  await startToBooting(first.port);
  await first.close();

  // Back up within the window: the demo keeps running, and still stops at 6 h.
  clock.advance(HOUR);
  const second = await serve(t, fix, clock);
  const resumed = await waitFor(second.port, (s) => s.phase === 'booting' || s.phase === 'ready', 'resume');
  assert.equal(calls(fix, 'stop').length, 0);
  await second.close();

  // Down across the deadline: the first thing the app does is stop the VM.
  clock.advance(5 * HOUR);
  const third = await serve(t, fix, clock);
  const stopped = await waitFor(third.port, (s) => s.phase === 'stopped', 'stop on resume');
  assert.match(stopped.message, /after 6 hours/);
  assert.deepEqual(calls(fix, 'stop').map((c) => c.session), [resumed.session]);
});

test('a Colab balance under the floor fails the start without running anything', async (t) => {
  const fix = fixture(t, { ...HAPPY, start: { ok: false, error: 'under_floor', message: 'balance 4 CU is under the floor of 10 CU' } });
  const { port } = await serve(t, fix, manualClock());
  await post(port, '/api/start');
  const failed = await waitFor(port, (s) => s.phase === 'failed', 'failed');
  assert.match(failed.message, /under the floor/);
  assert.equal(failed.vmHeld, false);
  assert.equal(calls(fix, 'run').length, 0);
  assert.equal((await post(port, '/api/start')).status, 202, 'Start is offered again');
});

test('a start script that reports failed ends the demo and releases the VM', async (t) => {
  const fix = fixture(t, { ...HAPPY, pull: { content: { state: 'failed', message: 'the model did not fit in GPU memory' } } });
  const clock = manualClock();
  const { port } = await serve(t, fix, clock);
  await startToBooting(port);
  clock.advance(POLL.booting);
  const failed = await waitFor(port, (s) => s.phase === 'failed', 'failed');
  assert.match(failed.message, /did not fit in GPU memory/);
  assert.equal(failed.vmHeld, false);
  assert.equal(calls(fix, 'stop').length, 1, JSON.stringify(calls(fix)));
});

test('a start script that exits before the demo is ready ends the demo and releases the VM', async (t) => {
  const fix = fixture(t, { ...HAPPY, status: { ok: true, hb: { state: 'exited', exit_code: 124, log_tail: 'timeout\n' } }, pull: BOOTING_VM });
  const clock = manualClock();
  const { port } = await serve(t, fix, clock);
  await startToBooting(port);
  clock.advance(POLL.booting);
  const failed = await waitFor(port, (s) => s.phase === 'failed', 'failed');
  assert.match(failed.message, /exit code 124/);
  assert.equal(calls(fix, 'stop').length, 1);
});

test('a VM Google took back marks the demo failed without a stop call', async (t) => {
  const fix = fixture(t, { ...HAPPY, status: { ok: true, live: false, ended: 'vanished' } });
  const clock = manualClock();
  const { port } = await serve(t, fix, clock);
  await startToBooting(port);
  clock.advance(POLL.booting);
  const failed = await waitFor(port, (s) => s.phase === 'failed', 'failed');
  assert.match(failed.message, /released the Colab VM/);
  assert.equal(failed.vmHeld, false);
  assert.equal((await post(port, '/api/start')).status, 202);
});

test('requests that could come from another site never reach Colab', async (t) => {
  const fix = fixture(t, HAPPY);
  const { port } = await serve(t, fix, manualClock());

  assert.equal((await request(port, 'GET', '/api/state', { host: 'evil.example' })).status, 403, 'unlisted Host (DNS rebinding)');
  assert.equal((await request(port, 'POST', '/api/start', { host: 'evil.example', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await request(port, 'POST', '/api/start', { headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415, 'form-style POST');
  assert.equal((await post(port, '/api/start', {}, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await post(port, '/api/start', {}, { 'sec-fetch-site': 'same-site' })).status, 403);
  assert.equal((await post(port, '/api/start', {}, { 'sec-fetch-site': '', origin: 'https://evil.example' })).status, 403);
  assert.equal((await request(port, 'GET', '/api/start')).status, 405);
  assert.equal(calls(fix).length, 0);
});

test('settings outside the offered choices are refused before anything is rented', async (t) => {
  const fix = fixture(t, HAPPY);
  const { port } = await serve(t, fix, manualClock());
  for (const bad of [{ model: 'auto; rm -rf /' }, { context: '1m' }, { parallel: 9 }]) {
    const res = await post(port, '/api/start', bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  assert.equal(calls(fix).length, 0);
  assert.equal((await request(port, 'GET', '/api/state')).json().phase, 'idle');
});

test('the control page is served with a same-origin-only CSP', async (t) => {
  const fix = fixture(t, HAPPY);
  const { port } = await serve(t, fix, manualClock());
  const page = await request(port, 'GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.body, /<meta name="robots" content="noindex/);
  assert.match(page.headers['content-security-policy'], /default-src 'self'/);
  assert.equal((await request(port, 'GET', '/app.js')).status, 200);
  assert.equal((await request(port, 'GET', '/../server.mjs')).status, 404);
});