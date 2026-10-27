// demo-control/lib/demo.mjs — one chat demo at a time on a Colab G4.
//
//   idle | stopped | failed ─start─▶ renting ─▶ uploading ─▶ booting ─▶ ready
//                     any of those ─stop / 6 h / failure─▶ stopping ─▶ stopped | failed
//
// The 6 h cap has three layers. This module stops the VM at startedAt + 6 h, and
// that deadline survives an app restart. The VM job runs under `timeout 6h`. The
// session is claimed with max_hours 6 / idle_minutes 15, so Light's reaper stops
// the VM once that job has ended; it never stops a RUNNING job before its 24 h cap.
// colab_start.sh detaches Strata, the gateway and the tunnel, so the timeout ends
// only the script: the first layer is the one that stops the demo on time.

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const CAP_MS = 6 * 3600_000;
export const CHOICES = {
  model: ['auto', 'nvfp4', 'iq3_s', 'q2_0'],
  context: ['32k', '64k', '128k'],
  parallel: [1, 2, 3, 4],
};
const REMOTE_DIR = '/content/factor-chat';
const ACTIVE = new Set(['renting', 'uploading', 'booting', 'ready', 'stopping']);
const STARTING = new Set(['renting', 'uploading']);
const RUNNING = new Set(['booting', 'ready']);
const REAL_CLOCK = { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (t) => clearTimeout(t) };

export class DemoError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Values reach a shell command on the VM, so only listed ones pass.
export function settingsFrom(body = {}) {
  const s = { model: body.model ?? 'auto', context: body.context ?? '64k', parallel: Number(body.parallel ?? 2) };
  for (const [k, allowed] of Object.entries(CHOICES)) {
    if (!allowed.includes(s[k])) throw new DemoError(400, `${k} must be one of ${allowed.join(', ')}`);
  }
  return s;
}

export function startCommand({ model, context, parallel }) {
  return `MODEL=${model} CONTEXT=${context} PARALLEL=${parallel} KEEPALIVE=1 timeout 6h bash colab_start.sh`;
}

export function createDemo({ colab, backendDir, dataDir, floor = 10, clock = REAL_CLOCK,
  pollMs = { booting: 20_000, ready: 60_000 }, random = (n) => randomBytes(n).toString('hex'), log = () => {} }) {
  const stateFile = join(dataDir, 'state.json');
  const vmStatusFile = join(dataDir, 'vm-status.json');
  let s = load();
  let pollTimer = null;
  let deadlineTimer = null;
  let work = Promise.resolve();

  function load() {
    try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return { phase: 'idle' }; }
  }

  function update(fields) {
    s = { ...s, ...fields, updatedAt: clock.now() };
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(stateFile + '.tmp', JSON.stringify(s, null, 2));
    renameSync(stateFile + '.tmp', stateFile);
  }

  // Start, poll and stop flows run one after another, never interleaved.
  function enqueue(flow) {
    work = work.then(flow).catch((e) => log(`demo flow failed: ${e.stack || e.message}`));
    return work;
  }

  function clearTimers() {
    clock.clearTimeout(pollTimer);
    clock.clearTimeout(deadlineTimer);
    pollTimer = deadlineTimer = null;
  }

  function armDeadline() {
    clock.clearTimeout(deadlineTimer);
    deadlineTimer = clock.setTimeout(() => stop('Stopped automatically after 6 hours.'), Math.max(0, s.stopAt - clock.now()));
  }

  function schedulePoll() {
    clock.clearTimeout(pollTimer);
    pollTimer = RUNNING.has(s.phase) ? clock.setTimeout(() => enqueue(poll), pollMs[s.phase]) : null;
  }

  async function call(req) {
    try {
      return await colab.call(req);
    } catch (e) {
      return { ok: false, error: 'helper_failed', message: e.message };
    }
  }

  // Releases the VM and ends in `endPhase`. A stop Colab does not confirm leaves
  // the demo failed with the VM still held, so Start stays blocked and Stop retries.
  async function release(message, endPhase = 'stopped') {
    clearTimers();
    update({ phase: 'stopping', message: endPhase === 'failed' ? `${message} Releasing the GPU…` : 'Releasing the GPU…' });
    const r = await call({ verb: 'stop', session: s.session });
    if ((r.ok && r.gone) || r.error === 'not_found') {
      return update({ phase: endPhase, vmHeld: false, link: '', endedAt: clock.now(), message, stopRequested: false });
    }
    update({
      phase: 'failed', vmHeld: true, stopRequested: false,
      message: `${message} The GPU may still be billing: Colab did not confirm the stop (${r.message || r.error || r.detail}). `
        + `Press Stop again, or run light_colab stop session:${s.session}.`,
    });
  }

  async function boot() {
    const r = await call({ verb: 'start', session: s.session, gpu: 'G4', max_hours: 6, idle_minutes: 15, floor, max_sessions: 2 });
    if (!r.ok) {
      if (r.error === 'helper_failed' || r.error === 'unattributed') {
        return release(`Could not rent a G4: ${r.message || r.error}.`, 'failed');
      }
      return update({ phase: 'failed', vmHeld: false, endedAt: clock.now(), message: `Could not rent a G4: ${r.message || r.error}.` });
    }
    update({ vmHeld: true, endpoint: r.endpoint, balanceCu: r.balance_cu ?? null, rateCuPerHr: r.rate_cu_per_hr ?? null });
    if (s.stopRequested) return release(s.stopMessage);
    update({ phase: 'uploading', message: 'Uploading the demo backend' });
    const run = await call({
      verb: 'run', session: s.session, local_path: backendDir, remote_dir: REMOTE_DIR,
      command: startCommand(s.settings), outputs: [], stop_on_exit: true,
    });
    if (!run.ok) return release(`Could not start the demo on the VM: ${run.message || run.error}.`, 'failed');
    if (s.stopRequested) return release(s.stopMessage);
    update({ phase: 'booting', runId: run.run_id, message: 'Starting the model, the gateway and the tunnel' });
    schedulePoll();
  }

  async function readVmStatus() {
    const r = await call({ verb: 'pull', session: s.session, remote_path: `${REMOTE_DIR}/logs/status.json`, local_path: vmStatusFile });
    if (!r.ok) return null;
    try { return JSON.parse(readFileSync(vmStatusFile, 'utf8')); } catch { return null; }
  }

  async function poll() {
    if (!RUNNING.has(s.phase)) return;
    const st = await call({ verb: 'status', session: s.session });
    if (!RUNNING.has(s.phase)) return;
    if (st.live === false || st.error === 'not_found') {
      clearTimers();
      return update({
        phase: 'failed', vmHeld: false, link: '', endedAt: clock.now(),
        message: st.ended === 'vanished'
          ? 'Google released the Colab VM without notice, so the demo link no longer works. Start again.'
          : 'The Colab VM is gone, so the demo link no longer works.',
      });
    }
    if (!st.ok) {
      update({ warning: `Could not check the VM (${st.message || st.error}); retrying.` });
      return schedulePoll();
    }
    const hb = st.hb || null;
    const vm = await readVmStatus();
    if (!RUNNING.has(s.phase)) return;
    update({ warning: '', logTail: hb?.log_tail ? String(hb.log_tail).slice(-4000) : s.logTail ?? '' });
    if (vm?.state === 'failed') return release(`The demo failed to start: ${vm.message || 'see the log'}.`, 'failed');
    if (hb?.state === 'exited') return release(`The demo's start script ended (exit code ${hb.exit_code ?? 'unknown'}).`, 'failed');
    if (vm?.state === 'ready' && vm.link) {
      update({ phase: 'ready', link: vm.link, tunnel: vm.tunnel || '', gpu: vm.gpu || '', size: vm.size || '',
        message: 'Ready', readyAt: s.readyAt ?? clock.now() });
    } else if (vm?.state === 'degraded') {
      update({ message: `Running, but ${vm.message}` });
    } else if (vm && s.phase === 'booting') {
      update({ vmState: vm.state || '', message: vm.message || s.message, gpu: vm.gpu || s.gpu || '' });
    }
    schedulePoll();
  }

  function start(body) {
    const settings = settingsFrom(body);
    if (ACTIVE.has(s.phase) || s.vmHeld) throw new DemoError(409, 'A demo is already running. Stop it first.');
    const t = clock.now();
    s = { phase: 'renting', session: `factor-demo-${random(3)}`, settings, startedAt: t, stopAt: t + CAP_MS };
    update({ message: 'Renting a G4 GPU on Colab', vmHeld: false });
    armDeadline();
    enqueue(boot);
    return view();
  }

  function stop(message = 'Stopped.') {
    if (STARTING.has(s.phase)) {
      // The start flow owns the helper right now; it releases the VM at its next step.
      update({ stopRequested: true, stopMessage: message, phase: 'stopping', message: 'Stopping as soon as the GPU is assigned…' });
    } else if (RUNNING.has(s.phase) || (s.phase === 'failed' && s.vmHeld)) {
      clearTimers();
      enqueue(() => release(message));
    }
    return view();
  }

  function view() {
    const { stopRequested, stopMessage, ...rest } = s;
    return { ...rest, capHours: CAP_MS / 3600_000, now: clock.now(), choices: CHOICES };
  }

  // Resume after an app restart: the 6 h deadline still holds.
  if (STARTING.has(s.phase) || (s.phase === 'stopping' && !s.runId)) {
    enqueue(() => release('The control app restarted while the demo was starting, so the GPU was released. Start again.', 'failed'));
  } else if (s.phase === 'stopping') {
    enqueue(() => release(s.stopMessage || 'Stopped.'));
  } else if (RUNNING.has(s.phase)) {
    if (clock.now() >= s.stopAt) enqueue(() => release('Stopped automatically after 6 hours.'));
    else {
      armDeadline();
      enqueue(poll);
    }
  }

  return { start, stop, view, close: clearTimers };
}