// quotes/ui/app.js — shared shell and helpers for the quotation screens.
// Thin client over the JSON API; every screen stays readable without it except
// where a fetch is the only possible source of data.

/* ------------------------------------------------------------ transport -- */

export const api = async (method, path, body) => {
  const sendsJson = method === 'POST' || method === 'PUT';
  const res = await fetch(`/api${path}`, {
    method,
    headers: sendsJson ? { 'content-type': 'application/json' } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // The server's refusals are written FOR the operator — they name the
    // document that blocks the move and what to do instead. Carrying the
    // status lets a caller render a 404 differently from a refusal.
    const err = new Error(json.error ?? `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
};

/* ------------------------------------------------------------ formatting -- */

export const fmtSatang = (s, code = 'THB') => {
  const neg = s < 0 ? '−' : ''; // a true minus, never a hyphen
  const abs = Math.abs(Math.trunc(s));
  const major = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const minor = String(abs % 100).padStart(2, '0');
  return `${neg}${code === 'THB' ? '฿' : ''}${major}.${minor}${code === 'THB' ? '' : ` ${code}`}`;
};

/** HTML-escape. Every screen builds markup from strings, so this is the only
 *  thing standing between a client named `Smith & Sons <Ltd>` and a broken
 *  page. It lives here because three screens had grown their own copy and the
 *  rest simply interpolated raw values. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

/* -------------------------------------------------------------- feedback -- */

export const toast = (msg, kind = 'ok') => {
  let n = document.querySelector('.toast');
  if (!n) { n = el('<div class="toast" role="status" aria-live="polite"></div>'); document.body.append(n); }
  n.textContent = msg;
  n.dataset.kind = kind;
  n.style.display = 'block';
  clearTimeout(n._t);
  n._t = setTimeout(() => { n.style.display = 'none'; }, 5000);
};

/** Announce something to a screen reader without showing a toast — used when
 *  a list re-filters, where a sighted user sees the count change and a screen
 *  reader user would otherwise get nothing. */
export const announce = (msg) => {
  let n = document.querySelector('#live-region');
  if (!n) {
    n = el('<div id="live-region" class="sr-only" role="status" aria-live="polite"></div>');
    document.body.append(n);
  }
  n.textContent = msg;
};

export const statusChip = (s) => `<span class="status status-${esc(s)}">${esc(s)}</span>`;

/* --------------------------------------------------------------- confirm -- */

/**
 * A real confirmation dialog for destructive actions.
 *
 * The previous build deleted a client on a single unguarded click, and offered
 * no way at all to remove a quotation. Both are destructive and both now come
 * through here.
 *
 * It states what will be destroyed BY NAME and BY COUNT rather than asking
 * "are you sure?", because the only question worth answering is whether the
 * operator understands the consequence. Cancel takes focus, so Enter is safe.
 *
 * @returns {Promise<boolean>} true when the operator confirmed.
 */
export function confirmAction({
  title, body = '', consequences = [], confirmLabel = 'Delete', tone = 'danger',
  // An acknowledgement has nothing to cancel: it reports a refusal the server
  // already made. It gets one button, and never claims anything is permanent.
  acknowledge = false,
}) {
  return new Promise((resolve) => {
    const dlg = el(`<dialog class="confirm" data-tone="${esc(tone)}">
      <form method="dialog" class="dlg-body">
        <h2>${esc(title)}</h2>
        ${body ? `<p>${esc(body)}</p>` : ''}
        ${consequences.length
          ? `<ul>${consequences.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
          : ''}
        ${tone === 'danger' && !acknowledge ? '<p class="consequence">This cannot be undone.</p>' : ''}
      </form>
      <div class="dlg-actions">
        ${acknowledge ? '' : '<button type="button" class="secondary" data-act="cancel">Cancel</button>'}
        <button type="button" class="${tone === 'danger' ? 'danger-solid' : 'secondary'}" data-act="ok">${esc(confirmLabel)}</button>
      </div>
    </dialog>`);
    document.body.append(dlg);
    const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    const cancelBtn = dlg.querySelector('[data-act=cancel]');
    if (cancelBtn) cancelBtn.addEventListener('click', () => done(false));
    dlg.querySelector('[data-act=ok]').addEventListener('click', () => done(true));
    // Escape and the backdrop both mean no. A destructive dialog must never
    // resolve true by accident.
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    dlg.showModal();
    // Cancel takes focus, so Enter is safe on a destructive dialog.
    (cancelBtn ?? dlg.querySelector('[data-act=ok]')).focus();
  });
}

/** Report a server refusal in the same place the action was taken, with the
 *  server's own sentence — those sentences name the blocking document. */
export function refusal(message) {
  return confirmAction({
    title: 'Not allowed',
    body: message,
    consequences: [],
    confirmLabel: 'OK',
    tone: 'warn',
  });
}

/** Run an async action with the button showing its loading state, so a slow
 *  call cannot be double-submitted and the operator can see it is working. */
export async function withBusy(btn, fn) {
  if (!btn) return fn();
  const label = btn.textContent;
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;
  try { return await fn(); }
  finally {
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
    btn.textContent = label;
  }
}

/* ----------------------------------------------------------------- shell -- */

const navLinks = [
  ['Quotations', 'index.html'],
  ['Invoices', 'invoices.html'],
  ['Reports', 'reports.html'],
  ['Clients', 'clients.html'],
  ['Catalog', 'catalog.html'],
  ['Settings', 'settings.html'],
];

export function renderShell(active, title, subtitle, actions = '') {
  document.title = `${title} · Factor IO Quotes`;
  // `active` wins over the URL so a detail page can light up its section:
  // invoice.html asks for 'invoices.html', quote.html for 'index.html'.
  const here = active || location.pathname.split('/').pop() || 'index.html';
  document.body.prepend(el('<a class="skip" href="#main">Skip to content</a>'));
  const header = el(`<header class="site-header"><div class="header-inner">
    <a class="brand" href="index.html">FACTOR<span> I/O</span></a>
    <nav id="main-nav" aria-label="Main">
      ${navLinks.map(([label, href]) => `<a href="${href}"${href === here ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
    </nav>
    <span data-auth-actions></span>
  </div></header>`);
  document.body.append(header);
  fetch('/healthz').then((res) => res.ok ? res.json() : null).then((health) => {
    if (health?.authMode !== 'oauth') return;
    const link = el('<a class="button quiet" href="/auth/logout">Sign out</a>');
    header.querySelector('[data-auth-actions]').append(link);
  }).catch(() => {});
  const main = el(`<main class="wrap" id="main">
    <div class="page-head">
      <div>
        <h1>${esc(title)}</h1>
        ${subtitle ? `<p class="sub">${subtitle}</p>` : ''}
      </div>
      <div class="row-actions tight" data-page-actions>${actions}</div>
    </div>
  </main>`);
  document.body.append(main);
  return main;
}