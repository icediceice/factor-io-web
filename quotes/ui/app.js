// quotes/ui/app.js — shared helpers for the quotation screens.
// Thin client over the JSON API; every screen stays readable without it
// except where a fetch is the only possible source of data.

export const api = async (method, path, body) => {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
};

export const fmtSatang = (s, code = 'THB') => {
  const neg = s < 0 ? '−' : '';
  const abs = Math.abs(Math.trunc(s));
  const major = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const minor = String(abs % 100).padStart(2, '0');
  return `${neg}${code === 'THB' ? '฿' : ''}${major}.${minor}${code === 'THB' ? '' : ` ${code}`}`;
};

export const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

export const toast = (msg, kind = 'ok') => {
  let n = document.querySelector('.toast');
  if (!n) { n = el('<div class="toast" role="status" aria-live="polite"></div>'); document.body.append(n); }
  n.textContent = msg;
  n.dataset.kind = kind;
  n.style.display = 'block';
  clearTimeout(n._t);
  n._t = setTimeout(() => { n.style.display = 'none'; }, 4000);
};

export const statusChip = (s) => `<span class="status status-${s}">${s}</span>`;

const navLinks = [
  ['/quotes', 'Quotations', 'index.html'],
  ['/quotes/invoices', 'Invoices', 'invoices.html'],
  ['/quotes/reports', 'Reports', 'reports.html'],
  ['/quotes/clients', 'Clients', 'clients.html'],
  ['/quotes/catalog', 'Catalog', 'catalog.html'],
  ['/quotes/settings', 'Settings', 'settings.html'],
];

export function renderShell(active, title, subtitle) {
  document.title = `${title} · Factor I/O Quotes`;
  const here = location.pathname.split('/').pop() || 'index.html';
  const header = el(`<header class="site-header"><div class="header-inner">
    <a class="brand" href="index.html">FACTOR<span> I/O</span></a>
    <nav id="main-nav" aria-label="Main">
      ${navLinks.map(([, label, href]) => `<a href="${href}"${href === here ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
    </nav>
    <a class="button quiet" href="/auth/logout" style="background:transparent;color:var(--muted);border-color:var(--line)">Sign out</a>
  </div></header>`);
  document.body.prepend(header);
  const main = el(`<div class="wrap"><h1>${title}</h1><p class="sub">${subtitle ?? ''}</p></div>`);
  document.body.append(main);
  return main;
}
