// Local progressive enhancement only. No fetch, persistence, inference or submission.
export const MAILTO_LIMIT = 1800;
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
    evaluate() { return validRequest(request) && (request.target === 'staging/payment-api' || sameRequest(approval, request)); },
    reset() { request = { target: 'production/payment-api', operation: 'restart', revision: 182 }; approval = null; },
  };
}

export function prepareMailDraft(values, copy, recipient) {
  const bounds = { name: 100, email: 254, company: 160, workflow: 4000 };
  for (const [key, max] of Object.entries(bounds)) {
    if (typeof values[key] !== 'string' || values[key].length > max || (key !== 'company' && !values[key].trim())) return { error: key };
  }
  const email = values.email.trim();
  const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  if (!emailPattern.test(email)) return { error: 'email' };
  if (!emailPattern.test(recipient) || /[?&#]/.test(recipient)) return { error: 'recipient' };
  // Keep every supplied workflow character. Never trim or shorten a long draft.
  const body = `${copy.name}: ${values.name}\n${copy.email}: ${email}\n${copy.company}: ${values.company}\n\n${copy.workflow}:\n${values.workflow}`;
  let uri;
  try { uri = `mailto:${recipient}?subject=${encodeURIComponent(copy.subject)}&body=${encodeURIComponent(body)}`; }
  catch { return { error: 'workflow' }; }
  return { body, text: `To: ${recipient}\nSubject: ${copy.subject}\n\n${body}`, mailto: uri.length <= MAILTO_LIMIT ? uri : null, encodedLength: uri.length };
}

export async function copyDraft(textarea, clipboard) {
  try {
    if (!clipboard?.writeText) throw new Error('clipboard unavailable');
    await clipboard.writeText(textarea.value);
    return true;
  } catch {
    textarea.focus(); textarea.select();
    return false;
  }
}

// The chart is emphasis, never the argument: every status line is set SYNCHRONOUSLY
// in the handler, and only node states are staged. Nothing on a timer may touch
// .demo-status, or a pending frame from a previous click could overwrite the verdict
// of the current one. Reduced motion applies the identical end state with no staging.
const reducedMotion = () => typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FLOW_IDLE = ['idle', 'idle', 'idle', 'idle', 'idle'];
const FLOW_PASS = ['pass', 'pass', 'pass', 'pass', 'pass'];
// Outside staging and unapproved: identity clears, scope refuses, and the chain
// STOPS at the human gate rather than running on.
const FLOW_HALT = ['pass', 'pass', 'deny', 'wait', 'idle'];
const FLOW_INVALID = ['pass', 'pass', 'deny', 'idle', 'idle'];

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
      if (step) timers.push(setTimeout(() => { nodes[i].dataset.state = state; }, i * step));
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
  root.querySelector('[data-evaluate]').addEventListener('click', () => { sync(); const allowed = model.evaluate(); show(allowed ? 'allowed' : 'denied', allowed ? 'allowed' : 'denied'); paint(allowed ? FLOW_PASS : FLOW_HALT); });
  root.querySelector('[data-approve]').addEventListener('click', () => { sync(); const bound = model.approve(); show(bound ? 'approved' : 'denied', bound ? 'approval' : 'denied'); paint(bound ? FLOW_PASS : FLOW_INVALID); });
  root.querySelector('[data-reset]').addEventListener('click', () => { model.reset(); target.value = 'production/payment-api'; revision.value = '182'; show('initial'); paint(FLOW_IDLE); });
  root.querySelector('.demo-interactive').hidden = false;
  return model;
}

export function bindContact(root) {
  const copy = JSON.parse(root.dataset.copy), form = root.querySelector('form');
  const status = root.querySelector('.form-status'), panel = root.querySelector('.draft-panel');
  const textarea = root.querySelector('.email-draft'), mail = root.querySelector('[data-mail]');
  let version = 0;
  form.addEventListener('input', () => {
    version++;
    for (const field of form.elements) if (field.setCustomValidity) field.setCustomValidity('');
    const hadDraft = !panel.hidden;
    panel.hidden = true; mail.hidden = true; mail.removeAttribute('href'); textarea.value = '';
    status.textContent = hadDraft ? copy.changed : '';
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(['name', 'email', 'company', 'workflow'].map(key => [key, form.elements.namedItem(key).value]));
    const result = prepareMailDraft(values, copy, root.dataset.recipient);
    version++;
    if (result.error) {
      panel.hidden = true; mail.hidden = true; mail.removeAttribute('href'); textarea.value = '';
      status.textContent = copy.invalid;
      const field = form.elements.namedItem(result.error);
      if (field) { field.setCustomValidity(copy.invalid); field.reportValidity(); }
      return;
    }
    textarea.value = result.text; panel.hidden = false;
    mail.hidden = !result.mailto;
    if (result.mailto) mail.href = result.mailto; else mail.removeAttribute('href');
    status.textContent = result.mailto ? copy.prepared : copy.long;
    textarea.focus();
  });
  root.querySelector('[data-copy-draft]').addEventListener('click', async () => {
    const snapshot = version;
    const copied = await copyDraft(textarea, globalThis.navigator?.clipboard);
    if (snapshot === version) status.textContent = copied ? copy.copied : copy.copyFailed;
  });
  // Form is not exposed until its preventDefault handler is installed.
  form.hidden = false;
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

if (typeof document !== 'undefined') {
  bindNavigation(document);
  document.querySelectorAll('[data-demo]').forEach(bindDemo);
  document.querySelectorAll('[data-contact]').forEach(bindContact);
}
