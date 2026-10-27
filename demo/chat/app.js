// Factor IO document chat demo: the page half. The other half (gateway.py +
// Strata) runs on the operator's Colab VM and is reached through a tunnel
// whose address and access key arrive in this page's URL fragment:
//   /demo/chat/#api=https://xyz.trycloudflare.com&key=...
// A fragment is never sent to any server, and it is stripped from the address
// bar as soon as it is read.

const $ = (id) => document.getElementById(id);
const CONN_KEY = 'factor-chat.connection';
const SESSION_KEY = 'factor-chat.session';

const state = {
  api: '', key: '', session: '',
  phase: 'unset',           // unset | checking | loading | ready | error
  health: null, problem: '',
  docs: [],                 // {id?, name, tokens?, chunks?, state: ready|uploading|reading|error, error?, progress?}
  history: [],              // [{role, content}] sent back for follow-up questions
  busy: false, abort: null, timer: 0,
};

class HttpError extends Error {
  constructor(status, detail) { super(detail); this.status = status; }
}

// ------------------------------------------------------------ storage (best effort)

const store = {
  get(area, k) { try { return JSON.parse(area.getItem(k)); } catch { return null; } },
  set(area, k, v) { try { v == null ? area.removeItem(k) : area.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

function normaliseUrl(u) {
  u = (u || '').trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

function readLinkFragment() {
  const p = new URLSearchParams(location.hash.slice(1));
  const api = p.get('api'), key = p.get('key');
  if (!api && !key) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return { api: normaliseUrl(api), key: (key || '').trim() };
}

// ------------------------------------------------------------------- http

async function call(path, { method = 'GET', json, body, signal, auth = true } = {}) {
  const headers = {};
  if (auth) headers.Authorization = `Bearer ${state.key}`;
  if (auth && state.session) headers['X-Session'] = state.session;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  return fetch(state.api + path, { method, headers, body, signal, cache: 'no-store' });
}

async function callJson(path, opts) {
  const r = await call(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(r.status, typeof data.detail === 'string' ? data.detail : `HTTP ${r.status}`);
  return data;
}

async function* readSse(stream) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = 'message', data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) { try { yield [event, JSON.parse(data)]; } catch { /* keep-alive or partial */ } }
    }
  }
}

// ------------------------------------------------------------- connection

// Runs the checks in order and reports each one; returns true when ready.
async function connect(report = () => {}) {
  clearTimeout(state.timer);
  if (!state.api || !state.key) { setPhase('unset'); return false; }
  setPhase('checking');
  try {
    const ping = await fetch(state.api + '/api/ping', { cache: 'no-store' });
    if (!ping.ok) throw new Error();
    report('Backend reachable', true);
  } catch {
    report('Backend not reachable. The demo may be stopped, or the link is from an earlier run.', false);
    return fail('The demo backend is not answering. It runs only while the operator has it switched on; ask for a fresh link.');
  }
  try {
    state.health = await callJson('/api/health');
    report('Access key accepted', true);
  } catch (e) {
    if (e.status === 401) {
      report('Access key not accepted', false);
      return fail('Use the full link you were sent, or paste the key in Connection.', 'Access key not accepted');
    }
    report(`Health check failed (${e.message})`, false);
    return fail('The backend answered, but its status check failed.', 'Backend status unknown');
  }
  if (!state.health.model.ready) {
    report(`Model not ready yet: ${state.health.model.detail || 'loading'}`, false);
    setPhase('loading');
    schedule(10000);
    return false;
  }
  report(`${state.health.model.label} is ready`, true);
  try {
    await ensureSession();
  } catch (e) {
    report(`Could not start a session (${e.message})`, false);
    return fail('The backend is up but would not start a session for this page.', 'Could not start a session');
  }
  setPhase('ready');
  schedule(20000);
  return true;
}

function fail(problem, title = 'Demo backend offline') {
  Object.assign(state, { problem, problemTitle: title });
  setPhase('error');
  schedule(20000);
  return false;
}

function schedule(ms) {
  clearTimeout(state.timer);
  state.timer = setTimeout(refresh, ms);
}

// Background re-check: keeps the headline honest (queue, model state) and
// recovers on its own when a stopped backend comes back.
async function refresh() {
  if (state.busy) return schedule(5000);
  if (state.phase === 'ready') {
    try {
      state.health = await callJson('/api/health');
      if (!state.health.model.ready) { setPhase('loading'); return schedule(10000); }
      render();
      return schedule(20000);
    } catch {
      return fail('Lost the demo backend. It may have been stopped; this page keeps checking.');
    }
  }
  if (state.phase === 'loading' || state.phase === 'error') connect();
}

async function ensureSession() {
  const saved = store.get(sessionStorage, SESSION_KEY);
  if (saved && saved.api === state.api && saved.session) {
    state.session = saved.session;
    try {
      const d = await callJson('/api/docs');
      state.docs = d.docs.map((doc) => ({ ...doc, state: 'ready' }));
      return;
    } catch { /* expired: fall through to a new one */ }
  }
  await newSession();
}

async function newSession() {
  state.session = '';
  const s = await callJson('/api/session', { method: 'POST' });
  state.session = s.session;
  state.docs = state.docs.filter((d) => d.state === 'error');
  store.set(sessionStorage, SESSION_KEY, { api: state.api, session: state.session });
}

async function sessionLost() {
  announce('Your session on the demo server expired, so its files are gone. Please add them again.');
  state.docs = [];
  await newSession();
  render();
}

// ------------------------------------------------------------------ files

async function addFiles(list) {
  const files = [...list];
  if (!files.length) return;
  if (state.phase !== 'ready') { openDialog(); return; }
  const rows = files.map((f) => ({ name: f.name, state: 'uploading', progress: 0, size: f.size }));
  state.docs.push(...rows);
  renderDocs();
  for (let i = 0; i < files.length; i++) await uploadOne(files[i], rows[i]);
  const ok = rows.filter((r) => r.state === 'ready').length;
  announce(`${ok} of ${rows.length} file${rows.length > 1 ? 's' : ''} added.`);
  render();
}

function uploadOne(file, row) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', state.api + '/api/ingest');
    xhr.setRequestHeader('Authorization', `Bearer ${state.key}`);
    xhr.setRequestHeader('X-Session', state.session);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) { row.progress = e.loaded / e.total; renderDocs(); } };
    xhr.upload.onload = () => { row.state = 'reading'; renderDocs(); };
    xhr.onload = async () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* handled below */ }
      if (xhr.status === 404) {
        state.docs.splice(state.docs.indexOf(row), 1);
        await sessionLost();
        return resolve();
      }
      const res = data && data.results && data.results[0];
      if (xhr.status === 200 && res && res.ok) Object.assign(row, res.doc, { state: 'ready' });
      else Object.assign(row, { state: 'error', error: (res && res.error) || `Upload failed (HTTP ${xhr.status}).` });
      renderDocs();
      resolve();
    };
    xhr.onerror = () => {
      Object.assign(row, { state: 'error', error: 'Upload failed: the backend did not answer.' });
      renderDocs();
      resolve();
    };
    const fd = new FormData();
    fd.append('files', file, file.name);
    xhr.send(fd);
  });
}

async function removeDoc(doc) {
  if (doc.state === 'error' || !doc.id) {
    state.docs.splice(state.docs.indexOf(doc), 1);
    return render();
  }
  try {
    await callJson(`/api/docs/${encodeURIComponent(doc.id)}`, { method: 'DELETE' });
    state.docs.splice(state.docs.indexOf(doc), 1);
    announce(`Removed ${doc.name}.`);
  } catch (e) {
    if (e.status === 404 && /session/i.test(e.message)) return sessionLost();
    announce(`Could not remove ${doc.name}: ${e.message}`);
  }
  render();
}

// ------------------------------------------------------------------- chat

async function ask(text) {
  text = text.trim();
  if (!text || state.busy || state.phase !== 'ready') return;
  $('starters').hidden = true;
  const view = appendExchange(text);
  const ctrl = new AbortController();
  Object.assign(state, { busy: true, abort: ctrl });
  renderControls();

  let answer = '', reasoning = '', citations = [], mode = '', done = null, error = '', stopped = false;
  try {
    const r = await call('/api/chat', {
      method: 'POST', signal: ctrl.signal,
      json: { message: text, history: state.history.slice(-12), thinking: currentMode() },
    });
    if (r.status === 404) {
      await sessionLost();
      throw new Error('Your session had expired. Add your files again, then ask once more.');
    }
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(typeof d.detail === 'string' ? d.detail : `The backend refused the question (HTTP ${r.status}).`);
    }
    for await (const [event, data] of readSse(r.body)) {
      if (event === 'citations') { citations = data.items; mode = data.mode; }
      else if (event === 'status') view.status(statusText(data));
      else if (event === 'reasoning') { reasoning += data.t; view.reasoning(reasoning); view.status('Thinking…'); }
      else if (event === 'token') { answer += data.t; view.status(''); view.answer(answer, citations); }
      else if (event === 'done') done = data;
      else if (event === 'error') error = data.message;
    }
    if (!done && !error) error = 'The answer was cut off: the connection to the demo backend closed early.';
  } catch (e) {
    if (e.name === 'AbortError') stopped = true;
    else error = e instanceof TypeError ? 'Lost the connection to the demo backend.' : e.message;
  }
  view.finish({ answer, citations, mode, done, error, stopped });
  if (answer && !error) state.history.push({ role: 'user', content: text }, { role: 'assistant', content: answer });
  Object.assign(state, { busy: false, abort: null });
  renderControls();
  announce(error ? 'The answer failed.' : stopped ? 'Stopped.' : 'Answer ready.');
  if (error && /connection|backend/i.test(error)) refresh();
}

function statusText(d) {
  if (d.state === 'queued') {
    const others = Math.max(0, (d.waiting || 1) - 1);
    return `Waiting for the model: it is answering ${d.running > 1 ? 'other people' : 'someone else'}${others ? ` (${others} also waiting)` : ''}…`;
  }
  if (d.state === 'reading') return d.sources ? `Reading ${d.sources} passage${d.sources > 1 ? 's' : ''} from your documents…` : 'Thinking…';
  return '';
}

function currentMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

// ---------------------------------------------------------- answer markup

function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Escape first, then add the few marks a model uses. [n] becomes a button only
// when source n exists, so the model cannot cite a passage it was never given.
function inline(s, maxN) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(\d{1,3})\]/g, (m, n) => (+n >= 1 && +n <= maxN
      ? `<button type="button" class="cite" data-n="${n}" aria-expanded="false" aria-label="Show source ${n}">${n}</button>`
      : m));
}

function renderMarkdown(md, maxN) {
  const lines = md.split('\n');
  const out = [];
  const isBlockStart = (l) => /^(```|#{1,4}\s|\s*[-*•]\s+|\s*\d+[.)]\s+|\s*\|)/.test(l);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const buf = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) buf.push(lines[i]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
    } else if (/^#{1,4}\s/.test(line)) {
      out.push(`<h4>${inline(line.replace(/^#+\s*/, ''), maxN)}</h4>`);
      i++;
    } else if (/^\s*\|/.test(line)) {
      const rows = [];
      for (; i < lines.length && /^\s*\|/.test(lines[i]); i++) {
        if (/^\s*\|?\s*:?-{2,}/.test(lines[i])) continue;
        rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim(), maxN)));
      }
      const [head, ...body] = rows;
      out.push(`<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${
        body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    } else if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items = [];
      for (; i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i]); i++) {
        items.push(`<li>${inline(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''), maxN)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
    } else {
      const buf = [];
      for (; i < lines.length && lines[i].trim() && !(buf.length && isBlockStart(lines[i])); i++) buf.push(inline(lines[i], maxN));
      out.push(`<p>${buf.join('<br>')}</p>`);
    }
  }
  return out.join('');
}

// ------------------------------------------------------------------- views

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function appendExchange(question) {
  const list = $('messages');
  list.append(el('li', 'msg-user', question));
  const li = el('li', 'msg-bot');
  const status = el('p', 'msg-status', 'Sending…');
  const reasoningBox = el('details', 'reasoning');
  reasoningBox.hidden = true;
  reasoningBox.append(el('summary', null, 'How the model reasoned'), el('p'));
  const answer = el('div', 'answer');
  const sources = el('div', 'sources');
  const meta = el('p', 'meta');
  li.append(status, reasoningBox, answer, sources, meta);
  list.append(li);
  li.setAttribute('aria-busy', 'true');
  status.scrollIntoView({ block: 'nearest' });

  let frame = 0, latest = null;
  const paint = () => {
    frame = 0;
    // Follow the stream only if the reader is already at the bottom; never yank them back up or down.
    const following = innerHeight + scrollY >= document.documentElement.scrollHeight - 160;
    answer.innerHTML = renderMarkdown(latest.text, latest.citations.length);
    wireCitations(answer, sources, latest.citations);
    if (following) scrollTo({ top: document.documentElement.scrollHeight });
  };
  return {
    status(t) { status.textContent = t; },
    reasoning(t) { reasoningBox.hidden = false; reasoningBox.lastChild.textContent = t; },
    answer(text, citations) {
      latest = { text, citations };
      if (!frame) frame = requestAnimationFrame(paint);
    },
    finish({ answer: text, citations, mode, done, error, stopped }) {
      if (frame) cancelAnimationFrame(frame);
      status.textContent = '';
      li.removeAttribute('aria-busy');
      if (text) { latest = { text, citations }; paint(); }
      if (stopped) answer.dataset.stopped = 'true';
      if (error) li.append(el('p', 'msg-error', error));
      const bits = [];
      if (citations.length) bits.push(`${citations.length} source${citations.length > 1 ? 's' : ''} · ${mode === 'full' ? 'whole documents' : 'best-matching passages'}`);
      else if (!error) bits.push('no documents used');
      if (done) {
        bits.push(`${done.elapsed_s} s`);
        if (done.tok_s) bits.push(`~${done.tok_s} tokens/s`);
      }
      meta.replaceChildren(...bits.map((b) => el('span', null, b)));
    },
  };
}

function wireCitations(answer, sources, citations) {
  answer.querySelectorAll('.cite').forEach((btn) => {
    const n = +btn.dataset.n;
    const open = sources.querySelector(`[data-n="${n}"]`);
    btn.setAttribute('aria-expanded', String(!!open));
    btn.onclick = () => toggleSource(answer, sources, citations[n - 1], n);
  });
}

function toggleSource(answer, sources, c, n) {
  const existing = sources.querySelector(`[data-n="${n}"]`);
  if (existing) existing.remove();
  else {
    const box = el('div', 'source');
    box.dataset.n = n;
    const head = el('p', 'source-head');
    head.append(el('span', null, `[${n}]`), el('b', null, c.doc), el('span', null, c.ref || ''));
    box.append(head, el('p', 'source-text', c.text));
    const after = [...sources.children].find((s) => +s.dataset.n > n);
    sources.insertBefore(box, after || null);
    box.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  answer.querySelectorAll(`.cite[data-n="${n}"]`).forEach((b) => b.setAttribute('aria-expanded', String(!existing)));
}

function renderDocs() {
  const list = $('docs');
  list.replaceChildren(...state.docs.map((d) => {
    const li = el('li', 'doc');
    li.dataset.state = d.state;
    li.append(el('span', 'doc-name', d.name));
    li.lastChild.title = d.name;
    let meta;
    if (d.state === 'uploading') meta = `uploading ${Math.round((d.progress || 0) * 100)}%`;
    else if (d.state === 'reading') meta = 'reading…';
    else if (d.state === 'error') meta = d.error;
    else meta = `~${(d.tokens || 0).toLocaleString('en-US')} tokens`;
    li.append(el('span', 'doc-meta', meta));
    const rm = el('button', 'icon-button', '×');
    rm.type = 'button';
    rm.setAttribute('aria-label', `Remove ${d.name}`);
    rm.disabled = d.state === 'uploading' || d.state === 'reading' || state.busy;
    rm.onclick = () => removeDoc(d);
    li.append(rm);
    if (d.state === 'uploading') {
      const bar = el('div', 'doc-bar');
      const fill = el('span');
      fill.style.width = `${Math.round((d.progress || 0) * 100)}%`;
      bar.append(fill);
      li.append(bar);
    }
    return li;
  }));
  const ready = state.docs.filter((d) => d.state === 'ready');
  $('shelf-total').textContent = ready.length
    ? `${ready.length} file${ready.length > 1 ? 's' : ''} · ~${ready.reduce((s, d) => s + (d.tokens || 0), 0).toLocaleString('en-US')} tokens`
    : '';
  $('shelf-empty').hidden = state.docs.length > 0;
  $('starters').hidden = !(ready.length && !$('messages').children.length && !state.busy);
}

function setPhase(phase) {
  state.phase = phase;
  render();
}

function render() {
  const { phase, health } = state;
  const title = $('state-title'), detail = $('state-detail'), actions = $('state-actions');
  document.querySelector('.state').dataset.state = phase;
  $('conn-pill').dataset.state = phase;
  actions.replaceChildren();
  const button = (label, onClick, quiet) => {
    const b = el('button', `button button-small${quiet ? ' button-quiet' : ''}`, label);
    b.type = 'button';
    b.onclick = onClick;
    actions.append(b);
  };

  if (phase === 'unset') {
    title.textContent = 'Not connected';
    detail.textContent = 'Open the link you were sent, or set up the connection.';
    $('conn-pill-text').textContent = 'Not connected';
    button('Set up connection', openDialog);
  } else if (phase === 'checking') {
    title.textContent = 'Connecting…';
    detail.textContent = `Checking ${hostOf(state.api)}.`;
    $('conn-pill-text').textContent = 'Connecting…';
  } else if (phase === 'loading') {
    title.textContent = 'Model is loading';
    detail.textContent = `${health.model.label} is still starting on the GPU (${health.model.detail || 'loading'}). This page checks again every 10 seconds.`;
    $('conn-pill-text').textContent = 'Model loading';
  } else if (phase === 'error') {
    title.textContent = 'Demo backend offline';
    detail.textContent = `${state.problem} Checking again every 20 seconds.`;
    $('conn-pill-text').textContent = 'Offline';
    button('Retry now', () => connect());
    button('Connection settings', openDialog, true);
  } else if (phase === 'ready') {
    const h = health.host || {};
    title.replaceChildren(document.createTextNode('Ready '), el('span', 'quiet', `· ${health.model.label}`));
    const parts = [];
    if (h.gpu) parts.push(`on ${h.gpu}${h.vram_gb ? ` (${h.vram_gb} GB)` : ''}`);
    parts.push(`answers ${health.queue.parallel} question${health.queue.parallel > 1 ? 's' : ''} at a time`);
    if (health.queue.waiting) parts.push(`${health.queue.waiting} waiting now`);
    detail.textContent = parts.join(' · ');
    $('conn-pill-text').textContent = health.model.label;
  }
  renderDocs();
  renderControls();
}

function renderControls() {
  const ready = state.phase === 'ready';
  const input = $('composer-input');
  input.disabled = !ready;
  input.placeholder = ready ? 'Ask about your documents…' : 'Connect to the demo backend first';
  $('send').disabled = !ready || state.busy || !input.value.trim();
  $('send').hidden = state.busy;
  $('stop').hidden = !state.busy;
  $('add-files').setAttribute('aria-disabled', String(!ready));
  $('file-input').disabled = !ready;
  document.querySelectorAll('input[name="mode"]').forEach((r) => { r.disabled = state.busy; });
  document.querySelectorAll('.starter').forEach((b) => { b.disabled = state.busy || !ready; });
  document.querySelectorAll('.doc .icon-button').forEach((b, i) => {
    const d = state.docs[i];
    b.disabled = state.busy || !d || d.state === 'uploading' || d.state === 'reading';
  });
}

function hostOf(u) {
  try { return new URL(u).host; } catch { return u; }
}

function announce(text) {
  $('live').textContent = '';
  requestAnimationFrame(() => { $('live').textContent = text; });
}

// ------------------------------------------------------------------ dialog

function openDialog() {
  $('conn-url').value = state.api;
  $('conn-key').value = state.key;
  $('conn-checks').replaceChildren();
  $('conn-dialog').showModal();
  (state.api ? $('conn-key') : $('conn-url')).focus();
}

async function saveDialog(e) {
  e.preventDefault();
  const url = normaliseUrl($('conn-url').value), key = $('conn-key').value.trim();
  $('conn-url').setAttribute('aria-invalid', String(!url));
  $('conn-key').setAttribute('aria-invalid', String(!key));
  if (!url || !key) return;
  if (url !== state.api) { state.session = ''; state.docs = []; state.history = []; }
  Object.assign(state, { api: url, key });
  store.set(localStorage, CONN_KEY, { api: url, key });
  const checks = $('conn-checks');
  checks.replaceChildren();
  const save = $('conn-save');
  save.disabled = true;
  save.textContent = 'Testing…';
  const ok = await connect((label, good) => {
    const li = el('li', null, label);
    li.dataset.ok = String(good);
    checks.append(li);
  });
  save.disabled = false;
  save.textContent = 'Test and connect';
  if (ok) $('conn-dialog').close();
}

function forget() {
  store.set(localStorage, CONN_KEY, null);
  store.set(sessionStorage, SESSION_KEY, null);
  clearTimeout(state.timer);
  Object.assign(state, { api: '', key: '', session: '', health: null, docs: [], history: [] });
  $('conn-url').value = '';
  $('conn-key').value = '';
  $('conn-checks').replaceChildren();
  setPhase('unset');
}

// ------------------------------------------------------------------- wiring

function wire() {
  $('conn-pill').onclick = openDialog;
  $('state-connect').onclick = openDialog;
  $('conn-form').addEventListener('submit', saveDialog);
  $('conn-cancel').onclick = () => $('conn-dialog').close();
  $('conn-forget').onclick = forget;
  $('conn-key-show').onclick = (e) => {
    const show = $('conn-key').type === 'password';
    $('conn-key').type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? 'Hide' : 'Show';
    e.currentTarget.setAttribute('aria-pressed', String(show));
  };

  $('file-input').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });

  const input = $('composer-input');
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, innerHeight * 0.4)}px`; };
  input.addEventListener('input', () => { grow(); renderControls(); });
  input.addEventListener('keydown', (e) => {
    // isComposing: Thai and CJK input methods use Enter to commit a character.
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('composer').requestSubmit(); }
  });
  $('composer').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value;
    if (!text.trim() || state.busy) return;
    input.value = '';
    grow();
    ask(text);
  });
  $('stop').onclick = () => state.abort && state.abort.abort();
  document.querySelectorAll('.starter').forEach((b) => { b.onclick = () => ask(b.textContent); });

  // Drop files anywhere on the page.
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  addEventListener('dragenter', (e) => { if (hasFiles(e)) { depth++; $('drop-veil').hidden = false; } });
  addEventListener('dragleave', (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; $('drop-veil').hidden = true; } });
  addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    $('drop-veil').hidden = true;
    addFiles(e.dataTransfer.files);
  });
}

function start() {
  wire();
  const fromLink = readLinkFragment();
  const saved = store.get(localStorage, CONN_KEY);
  const conn = fromLink || saved;
  if (conn) {
    state.api = normaliseUrl(conn.api);
    state.key = conn.key || '';
    if (fromLink) store.set(localStorage, CONN_KEY, { api: state.api, key: state.key });
  }
  if (state.api && state.key) connect();
  else render();
}

start();