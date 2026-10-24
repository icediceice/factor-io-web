// Giveaway admin UI. Talks only to this server's /api (same origin, tailnet whois
// identity). Every value from the API is written with textContent, never innerHTML:
// claim rows carry visitor-supplied emails.

const $ = (sel, root = document) => root.querySelector(sel);
const STORES = { android: 'Google Play', ios: 'App Store' };
let campaigns = [];
const CLAIM_ROWS = 500; // beyond this the CSV is the full record
const RETRY = ' Check that factor-giveaway is running on light-worker, then press Refresh all.';

// ---------------------------------------------------------------- helpers --
async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c !== null && c !== undefined) node.append(c);
  return node;
}

const when = (iso) => (iso ? iso.replace('T', ' ').slice(0, 16) : '');
const storeNames = (csv) => String(csv).split(',').map((p) => STORES[p] ?? p).join(' + ');

let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

async function busy(button, fn) {
  button.setAttribute('aria-busy', 'true');
  button.disabled = true;
  try { return await fn(); } finally { button.removeAttribute('aria-busy'); button.disabled = false; }
}

function confirmAction(title, text, okLabel) {
  const dialog = $('#confirm');
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  $('#confirm-ok').textContent = okLabel;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }));
}

function emptyRow(cols, text) {
  return el('tr', { class: 'empty' }, el('td', { colspan: String(cols), text }));
}

// Copy over plain HTTP: navigator.clipboard needs a secure context, so select the
// readonly input and fall back to execCommand.
async function copyLink(input) {
  input.select();
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(input.value);
    else if (!document.execCommand('copy')) throw new Error('copy refused');
    toast(`Copied ${input.value}`);
  } catch {
    toast('Link selected — press Ctrl/Cmd+C to copy');
  }
}

// -------------------------------------------------------------- campaigns --
function campaignStatus(c) {
  if (c.status === 'active' && c.max_claims !== null && c.claims >= c.max_claims) return ['full', 'full'];
  return [c.status, c.status];
}

function campaignRow(c) {
  const link = el('input', { type: 'text', readonly: true, value: c.link, 'aria-label': `Public link for ${c.id}` });
  const [chipClass, chipText] = campaignStatus(c);
  const actions = el('div', { class: 'row-actions' },
    el('button', { type: 'button', class: 'btn small', text: 'Edit', onclick: () => editCampaign(c) }));
  if (c.status === 'active') actions.append(el('button', { type: 'button', class: 'btn small', text: 'Pause', onclick: (e) => setStatus(e.currentTarget, c, 'paused') }));
  if (c.status === 'paused') actions.append(el('button', { type: 'button', class: 'btn small', text: 'Resume', onclick: (e) => setStatus(e.currentTarget, c, 'active') }));
  if (c.status !== 'ended') actions.append(el('button', { type: 'button', class: 'btn small danger', text: 'End…', onclick: (e) => endCampaign(e.currentTarget, c) }));
  return el('tr', { 'data-id': c.id },
    el('td', {}, el('div', { class: 'link-cell' }, link, el('button', { type: 'button', class: 'btn small', text: 'Copy', onclick: () => copyLink(link) }))),
    el('td', {}, el('span', { class: 'campaign-name', text: c.name }), c.source ? el('span', { class: 'campaign-source', text: c.source }) : null),
    el('td', { text: storeNames(c.platforms) }),
    el('td', {}, el('span', { class: `chip ${chipClass}`, text: chipText })),
    el('td', { class: 'num', text: c.max_claims === null ? `${c.claims}` : `${c.claims} / ${c.max_claims}` }),
    el('td', {}, actions));
}

function renderCampaigns() {
  const rows = $('#campaign-rows');
  rows.replaceChildren(...(campaigns.length ? campaigns.map(campaignRow) : [emptyRow(6, 'No campaigns yet. Create one for each place you post the link.')]));
  $('#campaign-count').textContent = String(campaigns.length);
  const filter = $('#claim-filter');
  const chosen = filter.value;
  filter.replaceChildren(el('option', { value: '', text: 'All campaigns' }), ...campaigns.map((c) => el('option', { value: c.id, text: c.id })));
  filter.value = campaigns.some((c) => c.id === chosen) ? chosen : '';
}

async function loadCampaigns() {
  const wrap = $('#campaign-table-wrap');
  wrap.setAttribute('aria-busy', 'true');
  $('#campaign-error').textContent = '';
  try {
    campaigns = await api('GET', '/campaigns');
    renderCampaigns();
  } catch (e) {
    $('#campaign-error').textContent = `Could not load campaigns: ${e.message}.${RETRY}`;
  } finally {
    wrap.setAttribute('aria-busy', 'false');
  }
}

async function setStatus(button, c, status) {
  await busy(button, async () => {
    try {
      await api('PATCH', `/campaigns/${c.id}`, { status });
      toast(`${c.id} is now ${status}`);
      await loadCampaigns();
    } catch (e) {
      $('#campaign-error').textContent = `Could not change ${c.id}: ${e.message}`;
    }
  });
}

async function endCampaign(button, c) {
  const ok = await confirmAction(`End ${c.id}?`,
    `${c.link} will stop issuing codes for good. Its ${c.claims} claimant(s) can still sign in to see their code. You can set it back to active from Edit.`,
    `End ${c.id}`);
  if (ok) await setStatus(button, c, 'ended');
}

function editCampaign(c) {
  const row = $(`#campaign-rows tr[data-id="${c.id}"]`);
  if (!row || row.nextElementSibling?.classList.contains('edit-row')) return;
  const form = el('form', { novalidate: true },
    el('div', { class: 'form-grid' },
      el('label', { class: 'field' }, el('span', { text: 'Name' }), el('input', { type: 'text', name: 'name', value: c.name, maxlength: '200' })),
      el('label', { class: 'field' }, el('span', { text: 'Source' }), el('input', { type: 'text', name: 'source', value: c.source, maxlength: '200' })),
      el('fieldset', { class: 'field' }, el('legend', { text: 'Stores' }),
        el('div', { class: 'checks' }, ...Object.entries(STORES).map(([p, label]) => el('label', {},
          el('input', { type: 'checkbox', name: 'platforms', value: p, checked: c.platforms.split(',').includes(p) }), ` ${label}`)))),
      el('label', { class: 'field' }, el('span', { text: 'Claim cap' }), el('input', { type: 'number', name: 'max_claims', min: '0', step: '1', value: c.max_claims ?? '' }), el('small', { text: 'Empty = no cap' })),
      el('label', { class: 'field' }, el('span', { text: 'Status' }),
        el('select', { name: 'status' }, ...['active', 'paused', 'ended'].map((s) => el('option', { value: s, text: s, selected: s === c.status }))))),
    el('div', { class: 'form-actions' },
      el('button', { type: 'submit', class: 'btn primary', text: `Save ${c.id}` }),
      el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => editRow.remove() })),
    el('p', { class: 'alert', role: 'alert', 'data-error': true }));
  const editRow = el('tr', { class: 'edit-row' }, el('td', { colspan: '6' }, form));
  row.after(editRow);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = { name: fd.get('name'), source: fd.get('source'), platforms: fd.getAll('platforms'), max_claims: fd.get('max_claims'), status: fd.get('status') };
    await busy(e.submitter ?? $('button[type=submit]', form), async () => {
      try {
        await api('PATCH', `/campaigns/${c.id}`, body);
        toast(`Saved ${c.id}`);
        await loadCampaigns();
      } catch (err) {
        $('[data-error]', form).textContent = err.message;
      }
    });
  });
  $('input', form).focus();
}

function wireNewCampaign() {
  const toggle = $('#new-campaign-toggle');
  const form = $('#new-campaign');
  const show = (open) => {
    form.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) $('input[name=id]', form).focus();
  };
  toggle.addEventListener('click', () => show(form.hidden));
  $('[data-cancel]', form).addEventListener('click', () => { form.reset(); show(false); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idInput = $('input[name=id]', form);
    const fd = new FormData(form);
    const error = $('[data-error]', form);
    error.textContent = '';
    idInput.removeAttribute('aria-invalid');
    if (!/^[a-z0-9-]{1,64}$/.test(fd.get('id'))) {
      idInput.setAttribute('aria-invalid', 'true');
      error.textContent = 'Id must be 1-64 characters of a-z, 0-9 and -.';
      return idInput.focus();
    }
    if (!fd.getAll('platforms').length) { error.textContent = 'Choose at least one store.'; return; }
    await busy(e.submitter, async () => {
      try {
        const created = await api('POST', '/campaigns', {
          id: fd.get('id'), name: fd.get('name'), source: fd.get('source'), platforms: fd.getAll('platforms'), max_claims: fd.get('max_claims'),
        });
        form.reset();
        show(false);
        toast(`Created ${created.link}`);
        await loadCampaigns();
      } catch (err) {
        error.textContent = err.message;
      }
    });
  });
}

// ------------------------------------------------------------------- pool --
async function loadPool() {
  const wrap = $('#pool-table-wrap');
  wrap.setAttribute('aria-busy', 'true');
  $('#pool-error').textContent = '';
  try {
    const stats = await api('GET', '/stats');
    // Only campaigns that can still issue a code: active and below their cap.
    const live = campaigns.filter((c) => c.status === 'active' && (c.max_claims == null || c.claims < c.max_claims));
    const offered = new Set(live.flatMap((c) => c.platforms.split(',')));
    $('#pool-rows').replaceChildren(...stats.map((s) => el('tr', {},
      el('th', { scope: 'row', text: STORES[s.platform] ?? s.platform }),
      // Colour plus words: an active campaign offering an empty store turns visitors away.
      el('td', { class: `num${s.available === 0 && offered.has(s.platform) ? ' warn' : ''}`,
        text: s.available === 0 && offered.has(s.platform) ? '0 · empty, campaign live' : String(s.available) }),
      el('td', { class: 'num', text: String(s.issued) }),
      el('td', { class: 'num', text: String(s.revoked) }),
      el('td', { class: 'num', text: String(s.expired) }),
      el('td', { class: 'num', text: String(s.total) }))));
    if (stats.every((s) => s.total === 0)) $('#pool-error').textContent = 'The pool is empty: import codes below before posting a link.';
  } catch (e) {
    $('#pool-error').textContent = `Could not load the pool: ${e.message}.${RETRY}`;
  } finally {
    wrap.setAttribute('aria-busy', 'false');
  }
}

// ---------------------------------------------------------- import/revoke --
function wireCodeForms() {
  const importForm = $('#import-form');
  importForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(importForm);
    const codes = $('textarea', importForm);
    const [result, error] = [$('[data-result]', importForm), $('[data-error]', importForm)];
    result.textContent = error.textContent = '';
    codes.removeAttribute('aria-invalid');
    if (!String(fd.get('codes')).trim()) { codes.setAttribute('aria-invalid', 'true'); error.textContent = 'Paste at least one code.'; return codes.focus(); }
    await busy(e.submitter, async () => {
      try {
        const r = await api('POST', '/codes/import', { platform: fd.get('platform'), batch: fd.get('batch'), expires_at: fd.get('expires_at'), codes: fd.get('codes') });
        result.textContent = `${STORES[r.platform]}: ${r.inserted} new code(s) stored, ${r.duplicates} already stored or repeated.`;
        codes.value = '';
        toast(`Imported ${r.inserted} code(s)`);
        await loadPool();
      } catch (err) {
        error.textContent = err.message;
        await loadPool();
      }
    });
  });

  const revokeForm = $('#revoke-form');
  revokeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(revokeForm);
    const list = String(fd.get('codes')).split(/[\s,]+/).filter(Boolean);
    const [result, error] = [$('[data-result]', revokeForm), $('[data-error]', revokeForm)];
    result.textContent = error.textContent = '';
    if (!list.length) { error.textContent = 'Paste at least one code.'; return; }
    const button = e.submitter;
    const ok = await confirmAction(`Revoke ${list.length} ${STORES[fd.get('platform')]} code(s)?`,
      `They will never be handed out. Anyone who already claimed one keeps it, marked withdrawn. This cannot be undone from here.`,
      `Revoke ${list.length}`);
    if (!ok) return;
    await busy(button, async () => {
      try {
        const r = await api('POST', '/codes/revoke', { platform: fd.get('platform'), codes: list });
        result.textContent = `${r.revoked} of ${r.submitted} code(s) revoked (others were unknown or already revoked).`;
        $('textarea', revokeForm).value = '';
        await loadPool();
      } catch (err) {
        error.textContent = err.message;
      }
    });
  });
}

// ----------------------------------------------------------------- claims --
async function loadClaims() {
  const wrap = $('#claim-table-wrap');
  const campaign = $('#claim-filter').value;
  const q = campaign ? `?campaign=${encodeURIComponent(campaign)}` : '';
  $('#claims-csv').href = `/api/claims.csv${q}`;
  wrap.setAttribute('aria-busy', 'true');
  $('#claim-error').textContent = '';
  try {
    const claims = await api('GET', `/claims${q}`);
    $('#claim-count').textContent = String(claims.length);
    const shown = claims.slice(0, CLAIM_ROWS);
    const more = claims.length > CLAIM_ROWS
      ? [emptyRow(5, `Showing the newest ${CLAIM_ROWS} of ${claims.length} claims. Download the CSV for all of them.`)]
      : [];
    $('#claim-rows').replaceChildren(...(claims.length ? [...shown.map((c) => el('tr', {},
      el('td', { class: 'mono', text: when(c.claimed) }),
      el('td', { class: 'mono', text: c.campaign }),
      el('td', { text: STORES[c.platform] ?? c.platform }),
      el('td', { class: 'code', text: c.code }),
      el('td', { text: c.email }))), ...more] : [emptyRow(5, campaign ? `Nobody has claimed through ${campaign} yet.` : 'No claims yet.')]));
  } catch (e) {
    $('#claim-error').textContent = `Could not load claims: ${e.message}.${RETRY}`;
  } finally {
    wrap.setAttribute('aria-busy', 'false');
  }
}

// ------------------------------------------------------------ chrome/boot --
function wireTheme() {
  const button = $('#theme-toggle');
  const order = ['auto', 'light', 'dark'];
  let theme = 'auto';
  try { theme = localStorage.getItem('factor-giveaway-theme') || 'auto'; } catch { /* storage blocked */ }
  const apply = () => {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    button.textContent = `Theme: ${theme}`;
  };
  apply();
  button.addEventListener('click', () => {
    theme = order[(order.indexOf(theme) + 1) % order.length];
    try { localStorage.setItem('factor-giveaway-theme', theme); } catch { /* storage blocked */ }
    apply();
  });
}

function wireSectionNav() {
  const links = [...document.querySelectorAll('.section-nav a')];
  // Current = the last section whose top has passed 40% of the viewport, the first one at the
  // very top and the last one at the very bottom. Recomputed from the scroll position, so a
  // restored scroll on reload is right too.
  const update = () => {
    const line = window.innerHeight * 0.4;
    let current = links[0];
    for (const a of links) if ($(a.hash).getBoundingClientRect().top <= line) current = a;
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = links.at(-1);
    for (const a of links) a.setAttribute('aria-current', String(a === current));
  };
  let queued = false;
  window.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; update(); });
  }, { passive: true });
  window.addEventListener('resize', update);
  window.addEventListener('load', update);
  update();
}

async function refreshAll() {
  await loadCampaigns();
  await Promise.all([loadPool(), loadClaims()]);
}

document.addEventListener('DOMContentLoaded', () => {
  wireTheme();
  wireSectionNav();
  wireNewCampaign();
  wireCodeForms();
  $('#claim-filter').addEventListener('change', loadClaims);
  $('#refresh').addEventListener('click', (e) => busy(e.currentTarget, refreshAll));
  refreshAll();
});