// Local progressive enhancement only. No fetch, persistence, inference or submission.
const targets = new Set(['production/payment-api', 'staging/payment-api', 'production/reporting-api']);
const validRequest = r => targets.has(r.target) && r.operation === 'restart' && Number.isSafeInteger(r.revision) && r.revision >= 1 && r.revision <= 999999;
const sameRequest = (a, b) => !!a && a.target === b.target && a.operation === b.operation && a.revision === b.revision;

export function createDemo() {
  let request = { target: 'production/payment-api', operation: 'restart', revision: 182 };
  let approval = null;
  return {
    snapshot: () => ({ ...request }),
    update(values) {
      const next = { ...request };
      for (const key of ['target', 'operation', 'revision']) if (Object.hasOwn(values, key)) next[key] = values[key];
      if (!sameRequest(request, next)) approval = null;
      request = next;
    },
    approve() { approval = validRequest(request) ? { ...request } : null; return !!approval; },
    approvedExact: () => sameRequest(approval, request),
    evaluate() { return validRequest(request) && (request.target === 'staging/payment-api' || sameRequest(approval, request)); },
    reset() { request = { target: 'production/payment-api', operation: 'restart', revision: 182 }; approval = null; },
  };
}

const reducedMotion = () => typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FLOW_IDLE = ['idle', 'idle', 'idle', 'idle', 'idle'];
const FLOW_PASS = ['pass', 'pass', 'pass', 'pass', 'pass'];
const FLOW_HALT = ['pass', 'pass', 'deny', 'wait', 'idle'];
const FLOW_SCOPED = ['pass', 'pass', 'pass', 'idle', 'pass'];
const FLOW_MALFORMED = ['deny', 'idle', 'idle', 'idle', 'idle'];

export function flowStates(model) {
  if (!validRequest(model.snapshot())) return FLOW_MALFORMED;
  if (model.approvedExact()) return FLOW_PASS;
  return model.evaluate() ? FLOW_SCOPED : FLOW_HALT;
}

export function bindDemo(root) {
  const copy = JSON.parse(root.dataset.copy), model = createDemo();
  const target = root.querySelector('[name=target]'), revision = root.querySelector('[name=revision]');
  const status = root.querySelector('[data-status]'), halt = root.querySelector('[data-halt]');
  const nodes = [...root.querySelectorAll('.flow-node')];
  let timers = [];
  const paint = states => {
    for (const timer of timers) clearTimeout(timer);
    timers = [];
    const step = reducedMotion() ? 0 : 260, waiting = states.includes('wait');
    states.forEach((state, i) => {
      if (!nodes[i]) return;
      if (step) timers.push(setTimeout(() => {
        nodes[i].dataset.state = state;
        nodes[i].classList.remove('pulse-trigger');
        void nodes[i].offsetWidth;
        nodes[i].classList.add('pulse-trigger');
      }, i * step));
      else nodes[i].dataset.state = state;
    });
    if (!halt) return;
    if (step) timers.push(setTimeout(() => { halt.hidden = !waiting; }, states.length * step));
    else halt.hidden = !waiting;
  };
  const show = (key, state = 'denied') => { status.textContent = copy[key]; status.dataset.state = state; };
  const sync = () => {
    model.update({ target: target.value, revision: revision.value === '' ? NaN : Number(revision.value) });
  };
  for (const input of [target, revision]) input.addEventListener('input', () => { sync(); show('invalidated'); paint(FLOW_IDLE); });
  root.querySelector('[data-evaluate]').addEventListener('click', () => { sync(); const allowed = model.evaluate(); show(allowed ? 'allowed' : 'denied', allowed ? 'allowed' : 'denied'); paint(flowStates(model)); });
  root.querySelector('[data-approve]').addEventListener('click', () => { sync(); const bound = model.approve(); show(bound ? 'approved' : 'denied', bound ? 'approval' : 'denied'); paint(flowStates(model)); });
  root.querySelector('[data-reset]').addEventListener('click', () => { model.reset(); target.value = 'production/payment-api'; revision.value = '182'; show('initial'); paint(FLOW_IDLE); });
  root.querySelector('.demo-interactive').hidden = false;
  return model;
}

export function bindNavigation(doc) {
  const toggle = doc.querySelector('.menu-toggle'), nav = doc.querySelector('#main-nav');
  if (!toggle || !nav) return;
  const set = open => { doc.body.classList.toggle('menu-open', open); toggle.setAttribute('aria-expanded', String(open)); };
  toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
  doc.addEventListener('keydown', event => { if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { set(false); toggle.focus(); } });
  doc.addEventListener('click', event => { if (toggle.getAttribute('aria-expanded') === 'true' && !event.target.closest('.site-header')) set(false); });
  nav.addEventListener('click', event => { if (event.target.closest('a')) set(false); });
  doc.body.classList.add('menu-ready'); toggle.hidden = false;
}

const saveData = () => !!globalThis.navigator?.connection?.saveData;

// A film plays muted while at least half of it is on screen, unless the visitor asked for
// reduced motion, is saving data, or paused it. Chapters (and ledger rows in the same
// [data-film-group]) seek; the chapter meters and the active row follow the playhead.
export function bindFilm(figure) {
  const video = figure.querySelector('video'), toggle = figure.querySelector('[data-film-toggle]');
  const chapters = [...figure.querySelectorAll('[data-chapter]')], starts = chapters.map(b => Number(b.dataset.start));
  const group = figure.closest('[data-film-group]');
  const rows = group ? [...group.querySelectorAll('[data-row]')] : [];
  const end = Number(figure.dataset.duration);
  let held = reducedMotion() || saveData(), visible = false, frame = 0, active = -1;
  video.controls = false;
  toggle.hidden = false;
  const label = () => {
    figure.dataset.state = video.paused ? 'paused' : 'playing';
    toggle.setAttribute('aria-label', video.paused ? toggle.dataset.play : toggle.dataset.pause);
  };
  const paint = () => {
    const t = video.currentTime;
    let current = 0;
    starts.forEach((s, i) => { if (t >= s) current = i; });
    chapters.forEach((button, i) => {
      const to = starts[i + 1] ?? end, p = Math.min(1, Math.max(0, (t - starts[i]) / (to - starts[i])));
      button.style.setProperty('--p', String(i < current ? 1 : i === current ? p : 0));
      if (i === current) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    });
    if (current !== active) { active = current; rows.forEach((row, i) => row.toggleAttribute('data-active', i === current)); }
  };
  const tick = () => { paint(); frame = video.paused ? 0 : requestAnimationFrame(tick); };
  const play = () => { const started = video.play(); if (started) started.catch(label); };
  const seek = i => { video.currentTime = starts[i]; held = false; paint(); play(); };
  video.addEventListener('play', () => { label(); cancelAnimationFrame(frame); frame = requestAnimationFrame(tick); });
  video.addEventListener('pause', () => { label(); paint(); });
  video.addEventListener('seeked', paint);
  video.addEventListener('click', () => toggle.click());
  toggle.addEventListener('click', () => { if (video.paused) { held = false; play(); } else { held = true; video.pause(); } });
  chapters.forEach((button, i) => button.addEventListener('click', () => seek(i)));
  if (group) group.querySelectorAll('[data-seek]').forEach(button => button.addEventListener('click', () => seek(Number(button.dataset.seek))));
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !held && video.paused) play();
      else if (!visible && !video.paused) video.pause();
    }, { threshold: 0.5 }).observe(figure.querySelector('.film-frame'));
  }
  label(); paint();
}

// Sections below the fold fade up once as they arrive. Nothing already on screen moves.
export function bindReveal(doc) {
  if (reducedMotion() || typeof IntersectionObserver !== 'function') return;
  const nodes = [...doc.querySelectorAll('.section-head, .section .film, .ledger > li, .cards > li, .routes > li, .process > li, .tile, .work-item, .demo, .cta')];
  const io = new IntersectionObserver(entries => entries.forEach(({ isIntersecting, target }) => {
    if (!isIntersecting) return;
    target.classList.replace('reveal-pending', 'reveal-in');
    io.unobserve(target);
  }), { rootMargin: '0px 0px -8% 0px' });
  for (const node of nodes) {
    if (node.getBoundingClientRect().top < globalThis.innerHeight) continue;
    const siblings = node.parentElement ? [...node.parentElement.children] : [];
    node.style.transitionDelay = `${(Math.max(0, siblings.indexOf(node)) % 4) * 70}ms`;
    node.classList.add('reveal-pending');
    io.observe(node);
  }
}

if (typeof document !== 'undefined') {
  bindNavigation(document);
  document.querySelectorAll('[data-demo]').forEach(bindDemo);
  document.querySelectorAll('.film').forEach(bindFilm);
  bindReveal(document);
}
