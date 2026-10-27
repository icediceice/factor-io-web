// demo-control/ui/app.js — drives the one control card from GET /api/state.
// Every string from the server (log tail, messages, link) goes in through
// textContent or .value, never innerHTML: the log tail is VM output.

const POLL_MS = 5000;
const $ = (id) => document.getElementById(id);
const el = {
  chip: $('phase-chip'), headline: $('headline'), detail: $('detail'), alert: $('alert'),
  steps: $('steps'), ready: $('ready'), link: $('link'), copy: $('copy'), open: $('open'),
  form: $('start-form'), model: $('model'), context: $('context'), parallel: $('parallel'), start: $('start'),
  stopRow: $('stop-row'), stop: $('stop'), stopNote: $('stop-note'), facts: $('facts'),
  logBox: $('log-box'), log: $('log'),
};

const PHASE = {
  idle: { chip: 'Not running', headline: 'No demo running' },
  renting: { chip: 'Starting', headline: 'Starting the demo' },
  uploading: { chip: 'Starting', headline: 'Starting the demo' },
  booting: { chip: 'Starting', headline: 'Starting the demo' },
  ready: { chip: 'Ready', headline: 'The demo is ready' },
  stopping: { chip: 'Stopping', headline: 'Stopping the demo' },
  stopped: { chip: 'Stopped', headline: 'No demo running' },
  failed: { chip: 'Failed', headline: 'The demo did not start' },
};
// colab_start.sh states in logs/status.json, mapped onto the four listed steps.
const VM_STEP = { checking: 2, installing: 2, downloading: 2, loading: 2, starting_gateway: 3, starting_tunnel: 3 };
const MODEL_LABEL = { auto: 'auto', nvfp4: 'NVFP4', iq3_s: 'IQ3_S', q2_0: 'Q2_0' };

let state = null;
let skew = 0; // server clock minus browser clock, so countdowns use server time
let busy = false;
let timer = null;
let postError = ''; // a refused Start/Stop stays visible until the next click
let stopArmed = null; // timer while Stop waits for its confirming second click

const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
function fmtSpan(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

function fillSelect(select, values, current, label = (v) => String(v)) {
  if (select.options.length) return;
  for (const v of values) {
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = label(v);
    select.append(o);
  }
  select.value = String(current);
}

function currentStep(s) {
  if (s.phase === 'renting') return 0;
  if (s.phase === 'uploading') return 1;
  if (s.phase === 'booting') return VM_STEP[s.vmState] ?? 2;
  if (s.phase === 'ready') return 4;
  return -1;
}

function renderSteps(s) {
  const at = currentStep(s);
  for (const li of el.steps.querySelectorAll('li')) {
    const n = Number(li.dataset.step);
    li.dataset.state = n < at ? 'done' : n === at ? 'current' : 'todo';
    if (n === at) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  }
}

function renderFacts(s, now) {
  const rows = [];
  if (s.settings) {
    rows.push(['Model', `${MODEL_LABEL[s.settings.model] ?? s.settings.model}${s.size ? ` · ${s.size}` : ''}`]);
    rows.push(['Context · answers at once', `${s.settings.context} · ${s.settings.parallel}`]);
  }
  if (s.gpu) rows.push(['GPU', s.gpu]);
  if (s.session) rows.push(['Colab session', s.session]);
  if (s.startedAt) rows.push(['Started', `${fmtTime(s.startedAt)} (${fmtSpan(now - s.startedAt)} ago)`]);
  if (s.readyAt && s.startedAt) rows.push(['Ready after', fmtSpan(s.readyAt - s.startedAt)]);
  if (s.endedAt && !['renting', 'uploading', 'booting', 'ready'].includes(s.phase)) rows.push(['Ended', fmtTime(s.endedAt)]);
  if (s.balanceCu != null) {
    rows.push(['Colab balance at start', `${Math.round(s.balanceCu)} CU${s.rateCuPerHr ? ` · ${s.rateCuPerHr} CU/h` : ''}`]);
  }
  el.facts.replaceChildren();
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = k;
    dd.textContent = v;
    el.facts.append(dt, dd);
  }
  el.facts.hidden = rows.length === 0;
}

function render(s) {
  const now = Date.now() + skew;
  const phase = PHASE[s.phase] ? s.phase : 'idle';
  const starting = ['renting', 'uploading', 'booting'].includes(phase);
  const running = starting || phase === 'ready';

  el.chip.dataset.phase = phase;
  el.chip.textContent = PHASE[phase].chip;
  el.headline.textContent = PHASE[phase].headline;

  let detail = '';
  if (starting) detail = `${s.message || 'Starting'} · ${fmtSpan(now - s.startedAt)} so far, usually about 15 min.`;
  else if (phase === 'ready') detail = s.message && s.message !== 'Ready' ? s.message : 'Share the link below.';
  else if (phase === 'stopping') detail = s.message || 'Releasing the GPU…';
  else if (phase === 'stopped') detail = s.message || 'Stopped.';
  else if (phase === 'idle') detail = 'Start one when the customer is about to join.';
  el.detail.textContent = detail;
  el.alert.textContent = postError || (phase === 'failed' ? (s.message || 'The demo failed.') : (s.warning || ''));

  el.steps.hidden = !starting;
  if (starting) renderSteps(s);

  const link = phase === 'ready' ? s.link || '' : '';
  el.ready.hidden = !link;
  if (link) {
    if (el.link.value !== link) el.link.value = link;
    el.open.href = link;
  }

  const canStart = !running && phase !== 'stopping' && !s.vmHeld;
  el.form.hidden = !canStart;
  if (canStart && s.choices) {
    const last = s.settings || {};
    fillSelect(el.model, s.choices.model, last.model ?? 'auto', (v) => MODEL_LABEL[v] ?? v);
    fillSelect(el.context, s.choices.context, last.context ?? '64k');
    fillSelect(el.parallel, s.choices.parallel, last.parallel ?? 2);
  }

  const canStop = running || (phase === 'failed' && s.vmHeld);
  el.stopRow.hidden = !(canStop || phase === 'stopping');
  el.stop.disabled = !canStop || busy;
  if (!stopArmed) el.stop.textContent = phase === 'failed' ? 'Stop the GPU' : 'Stop demo';
  el.stopNote.textContent = running && s.stopAt
    ? `Stops by itself at ${fmtTime(s.stopAt)} (in ${fmtSpan(s.stopAt - now)}).`
    : phase === 'stopping' ? 'Releasing the GPU…' : '';

  renderFacts(s, now);

  const tail = s.logTail || '';
  el.logBox.hidden = !tail;
  if (el.log.textContent !== tail) {
    const atBottom = el.log.scrollTop + el.log.clientHeight >= el.log.scrollHeight - 8;
    el.log.textContent = tail;
    if (atBottom) el.log.scrollTop = el.log.scrollHeight;
  }
}

async function refresh() {
  clearTimeout(timer);
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (!r.ok) throw new Error(`state request failed (${r.status})`);
    state = await r.json();
    skew = (state.now ?? Date.now()) - Date.now();
    render(state);
  } catch (e) {
    el.alert.textContent = `Lost contact with the control app: ${e.message}. Retrying…`;
  } finally {
    timer = setTimeout(refresh, POLL_MS);
  }
}

async function post(path, body, button) {
  busy = true;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  postError = '';
  try {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `request failed (${r.status})`);
    state = data;
  } catch (e) {
    postError = e.message;
  } finally {
    busy = false;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
  // render() owns the buttons' visibility and the Stop button's disabled state.
  if (state) render(state);
  refresh();
}

el.form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  post('/api/start', {
    model: el.model.value,
    context: el.context.value,
    parallel: Number(el.parallel.value),
  }, el.start);
});

// Stop takes a second click within 4 s instead of window.confirm(), which
// freezes the page (and its status polling) while the dialog is open.
el.stop.addEventListener('click', () => {
  if (!stopArmed) {
    el.stop.textContent = state?.phase === 'ready' ? 'Click again: the link stops working' : 'Click again to stop';
    stopArmed = setTimeout(() => {
      stopArmed = null;
      if (state) render(state);
    }, 4000);
    return;
  }
  clearTimeout(stopArmed);
  stopArmed = null;
  post('/api/stop', {}, el.stop);
});

// navigator.clipboard needs a secure context; plain http://…:8789 falls back
// to selecting the readonly input and execCommand.
el.copy.addEventListener('click', async () => {
  const done = (text) => {
    el.copy.textContent = text;
    setTimeout(() => { el.copy.textContent = 'Copy link'; }, 2000);
  };
  try {
    if (!navigator.clipboard) throw new Error('no clipboard API');
    await navigator.clipboard.writeText(el.link.value);
    done('Copied');
  } catch {
    el.link.focus();
    el.link.select();
    done(document.execCommand('copy') ? 'Copied' : 'Press Ctrl+C');
  }
});

document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
refresh();