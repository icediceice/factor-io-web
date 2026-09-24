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

export function bindTelemetry(doc) {
  const bar = doc.querySelector('[data-hud-fill]');
  const pct = doc.querySelector('[data-hud-pct]');
  const sceneTag = doc.querySelector('[data-hud-scene]');
  const scenes = [...doc.querySelectorAll('[data-scene]')];
  if (!bar && !pct && !sceneTag) return;

  let ticking = false;
  const update = () => {
    const docHeight = doc.documentElement.scrollHeight - doc.documentElement.clientHeight;
    const scrolled = docHeight > 0 ? Math.min(100, Math.max(0, (globalThis.scrollY / docHeight) * 100)) : 0;
    const rounded = Math.round(scrolled);
    if (bar) bar.style.width = `${scrolled}%`;
    if (pct) pct.textContent = `${String(rounded).padStart(2, '0')}%`;

    if (sceneTag && scenes.length) {
      const scrollMid = globalThis.scrollY + (globalThis.innerHeight * 0.35);
      let currentScene = scenes[0].dataset.scene || '';
      for (const s of scenes) {
        if (s.offsetTop <= scrollMid) currentScene = s.dataset.scene || currentScene;
      }
      if (currentScene && sceneTag.textContent !== currentScene) {
        sceneTag.textContent = currentScene;
      }
    }
    ticking = false;
  };

  globalThis.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      globalThis.requestAnimationFrame(update);
    }
  }, { passive: true });
  update();
}

export function bindSceneTransitions(doc) {
  const blocks = doc.querySelectorAll('.scene-block, .items li');
  if (!blocks.length || typeof IntersectionObserver === 'undefined') return;
  if (reducedMotion()) {
    blocks.forEach(b => b.classList.add('scene-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('scene-visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  blocks.forEach(b => observer.observe(b));
}

if (typeof document !== 'undefined') {
  bindNavigation(document);
  document.querySelectorAll('[data-demo]').forEach(bindDemo);
  bindTelemetry(document);
  bindSceneTransitions(document);
}
