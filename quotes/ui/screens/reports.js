// quotes/ui/screens/reports.js — the tax worksheets, as Stacked Sections.
//
// Four independent worksheets. They are not a dashboard and must never become
// one: each is transcribed onto a different government form, on a different
// deadline, and collapsing them into tiles would imply a relationship between
// figures that do not belong on the same return.
//
// The worksheets themselves are unchanged from the previous build — the numbers
// and their careful refusals ("input VAT: not tracked" rather than a false
// zero) were already right. What changes is that four long cards stacked with
// no way to reach one now carry an anchored section nav.

import { api, fmtSatang, el, esc, toast } from '../app.js';

const money = (s, c = 'THB') => (s == null ? '<span class="muted">—</span>' : fmtSatang(s, c));
const now = new Date();
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function mount(main) {
  const sections = [
    { id: 'pp30', nav: 'PP 30 — VAT', build: pp30 },
    { id: 'income', nav: 'Income by month', build: income },
    { id: 'pnd', nav: 'PND 50 / 51', build: pnd },
    { id: 'wht', nav: 'WHT register', build: wht },
  ];

  const stack = el(`<div class="stack">
    <nav class="snav" aria-label="Worksheets">
      ${sections.map((s, n) => `<a href="#${s.id}"${n === 0 ? ' aria-current="true"' : ''}>${esc(s.nav)}</a>`).join('')}
    </nav>
    <div class="stack-body"></div>
  </div>`);
  main.append(stack);
  const body = stack.querySelector('.stack-body');

  for (const s of sections) {
    const card = s.build();
    card.id = s.id;
    body.append(card);
    wire(card, card._load);
  }

  // Scroll spy: the nav says which worksheet you are actually looking at.
  if ('IntersectionObserver' in window) {
    const links = [...stack.querySelectorAll('.snav a')];
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        for (const a of links) a.toggleAttribute('aria-current', a.hash === `#${e.target.id}`);
      }
    }, { rootMargin: '-84px 0px -70% 0px' });
    for (const s of sections) obs.observe(document.getElementById(s.id));
  }
}

const wire = (card, fn) => {
  card.querySelector('form')?.addEventListener('change', () => fn().catch((e) => toast(e.message, 'error')));
  return fn().catch((e) => {
    card.querySelector('div[data-out]').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    toast(e.message, 'error');
  });
};

/* ---------------------------------------------------------------- PP 30 -- */

function pp30() {
  const card = el(`<section class="card">
    <h2>PP 30 — monthly VAT (output side)</h2>
    <p class="meta">Output VAT only. This system does not track purchases, so input VAT and the net payable are left blank on purpose rather than shown as zero — a zero there would be a false statement on a return.</p>
    <form class="grid" style="max-width:520px">
      <label>Period<input name="month" type="month" value="${thisMonth}"></label>
    </form>
    <div data-out><div class="empty">Loading…</div></div>
  </section>`);
  card._load = async () => {
    const v = card.querySelector('input[name=month]').value || thisMonth;
    const [year, month] = v.split('-').map(Number);
    const { report: r } = await api('GET', `/reports/pp30?year=${year}&month=${month}`);
    card.querySelector('[data-out]').innerHTML = `
      <dl class="kv" style="margin-bottom:18px">
        <dt>Period</dt><dd class="mono">${esc(r.period)}</dd>
        <dt>Filing deadline</dt><dd class="mono">${esc(r.dueOn.paper)} on paper · ${esc(r.dueOn.efiling)} by e-filing</dd>
        <dt>Invoices in period</dt><dd>${esc(String(r.invoiceCount))}</dd>
      </dl>
      <table class="totals" style="margin:0 0 18px 0">
        <tr><td class="lbl">Total sales (net)</td><td class="num">${money(r.totalSalesSatang)}</td></tr>
        <tr><td class="lbl">Sales subject to VAT</td><td class="num">${money(r.vatableNetSatang)}</td></tr>
        <tr class="payable"><td class="lbl">Output VAT</td><td class="num">${money(r.outputVatSatang)}</td></tr>
        ${r.zeroRatedOrExemptSatang ? `<tr class="memo"><td class="lbl">Zero-rated or exempt sales</td><td class="num">${money(r.zeroRatedOrExemptSatang)}</td></tr>` : ''}
        <tr class="memo"><td class="lbl">Input VAT</td><td class="num">not tracked</td></tr>
        <tr class="memo"><td class="lbl">Net VAT payable</td><td class="num">needs input VAT</td></tr>
      </table>
      ${r.unclassified ? `<div class="banner" data-tone="warn">
        This period contains 0% sales. Zero-rated and exempt sales go in <strong>different boxes</strong> on the PP 30 and this system cannot tell them apart — classify them by hand before filing.</div>` : ''}
      ${r.invoices.length ? `<div class="table-scroll"><table class="list"><thead><tr>
          <th>Invoice</th><th>Tax point</th><th>Status</th><th class="num">Net</th><th class="num">VAT</th><th class="num">Total</th>
        </tr></thead><tbody>
        ${r.invoices.map((i) => `<tr>
          <td class="mono"><a href="invoice.html?id=${i.id}">${esc(i.number)}</a></td>
          <td class="mono">${esc(i.issueDate)}</td>
          <td class="muted">${esc(i.status)}</td>
          <td class="num mono">${money(i.netSatang)}</td>
          <td class="num mono">${money(i.vatSatang)}<span class="muted mono"> ${esc(i.vatRate)}%</span></td>
          <td class="num mono">${money(i.grandSatang)}</td>
        </tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">No invoices with a tax point in this period.</div>'}`;
  };
  return card;
}

/* --------------------------------------------------------------- income -- */

function income() {
  const card = el(`<section class="card">
    <h2>Income by month</h2>
    <p class="meta">Accrual basis: income is recognised on the tax-invoice date, not when the cash arrives.</p>
    <form class="grid" style="max-width:520px">
      <label>Year<input name="year" type="number" min="2000" max="2999" value="${now.getFullYear()}"></label>
    </form>
    <div data-out><div class="empty">Loading…</div></div>
  </section>`);
  card._load = async () => {
    const year = card.querySelector('input[name=year]').value || now.getFullYear();
    const { report: r } = await api('GET', `/reports/income?year=${year}`);
    card.querySelector('[data-out]').innerHTML = `
      <div class="table-scroll"><table class="list"><thead><tr>
        <th>Month</th><th class="num">Invoices</th><th class="num">Net income</th><th class="num">VAT</th><th class="num">Withheld</th>
      </tr></thead><tbody>
        ${r.months.map((m) => `<tr${m.invoiceCount ? '' : ' data-optional="true"'}>
          <td class="mono">${esc(m.period)} <span class="muted">${MONTHS[m.month - 1]}</span></td>
          <td class="num mono">${m.invoiceCount || ''}</td>
          <td class="num mono">${m.netSatang ? money(m.netSatang) : '<span class="muted">—</span>'}</td>
          <td class="num mono">${m.vatSatang ? money(m.vatSatang) : '<span class="muted">—</span>'}</td>
          <td class="num mono">${m.whtSatang ? money(m.whtSatang) : '<span class="muted">—</span>'}</td>
        </tr>`).join('')}
      </tbody></table></div>
      <table class="totals">
        <tr class="grand"><td class="lbl">Net income ${esc(r.year)}</td><td class="num">${money(r.totalNetSatang)}</td></tr>
        <tr class="memo"><td class="lbl">Output VAT collected</td><td class="num">${money(r.totalVatSatang)}</td></tr>
        <tr class="memo"><td class="lbl">Withholding on that income</td><td class="num">${money(r.totalWhtSatang)}</td></tr>
        <tr class="memo"><td class="lbl">Basis</td><td class="num">${esc(r.basis)}</td></tr>
      </table>`;
  };
  return card;
}

/* ------------------------------------------------------------------ PND -- */

function pnd() {
  const card = el(`<section class="card">
    <h2>PND 50 / 51 — corporate income tax</h2>
    <p class="meta">Revenue and creditable withholding only. Expenses are out of scope, so taxable profit cannot be computed here.</p>
    <form class="grid" style="max-width:520px">
      <label>Year<input name="year" type="number" min="2000" max="2999" value="${now.getFullYear()}"></label>
      <label>Period
        <select name="half">
          <option value="">Full year — PND 50</option>
          <option value="1">First half — PND 51</option>
          <option value="2">Second half</option>
        </select>
      </label>
    </form>
    <div data-out><div class="empty">Loading…</div></div>
  </section>`);
  card._load = async () => {
    const f = new FormData(card.querySelector('form'));
    const half = f.get('half') ? `&half=${f.get('half')}` : '';
    const { report: r } = await api('GET', `/reports/pnd?year=${f.get('year')}${half}`);
    card.querySelector('[data-out]').innerHTML = `
      <dl class="kv" style="margin-bottom:18px">
        <dt>Form</dt><dd>${esc(r.form)}</dd>
        <dt>Period</dt><dd class="mono">${esc(r.periodFrom)} → ${esc(r.periodTo)}</dd>
        <dt>Invoices</dt><dd>${esc(String(r.invoiceCount))}</dd>
      </dl>
      <table class="totals">
        <tr class="grand"><td class="lbl">Revenue (net of VAT)</td><td class="num">${money(r.revenueSatang)}</td></tr>
        <tr class="payable"><td class="lbl">Creditable withholding tax</td><td class="num">${money(r.creditableWhtSatang)}</td></tr>
        <tr class="memo"><td class="lbl">Expenses</td><td class="num">not tracked</td></tr>
        <tr class="memo"><td class="lbl">Taxable profit</td><td class="num">needs expenses</td></tr>
      </table>`;
  };
  return card;
}

/* ------------------------------------------------------------------ WHT -- */

function wht() {
  const card = el(`<section class="card">
    <h2>Withholding tax credit register</h2>
    <p class="meta">Certificates received from customers. Each one is tax already paid on the company's behalf — a credit against the PND liability, never a cost.</p>
    <form class="grid" style="max-width:520px">
      <label>From<input name="from" type="date" value="${now.getFullYear()}-01-01"></label>
      <label>To<input name="to" type="date" value="${now.getFullYear()}-12-31"></label>
    </form>
    <div data-out><div class="empty">Loading…</div></div>
  </section>`);
  card._load = async () => {
    const f = new FormData(card.querySelector('form'));
    const { report: r } = await api('GET', `/reports/wht?from=${f.get('from')}&to=${f.get('to')}`);
    const forms = Object.entries(r.byForm);
    card.querySelector('[data-out]').innerHTML = `
      <table class="totals" style="margin:0 0 18px 0">
        <tr class="grand"><td class="lbl">Total creditable</td><td class="num">${money(r.totalWhtSatang)}</td></tr>
        <tr class="memo"><td class="lbl">On a base of</td><td class="num">${money(r.totalBaseSatang)}</td></tr>
        ${forms.map(([k, v]) => `<tr class="memo"><td class="lbl">${esc(k)}</td><td class="num">${money(v)}</td></tr>`).join('')}
      </table>
      ${r.certificates.length ? `<div class="table-scroll"><table class="list"><thead><tr>
          <th>Cert no.</th><th>Issued</th><th>Form</th><th>Invoice</th><th>Payer</th><th class="num">Base</th><th class="num">Withheld</th>
        </tr></thead><tbody>
        ${r.certificates.map((w) => `<tr>
          <td class="mono">${esc(w.certNumber) || '—'}</td>
          <td class="mono">${esc(w.issuedOn)}</td>
          <td class="mono">${esc(w.pndForm)}</td>
          <td class="mono">${w.invoiceId ? `<a href="invoice.html?id=${w.invoiceId}">${esc(w.invoiceNumber)}</a>` : '—'}</td>
          <td>${esc(w.payerName) || '—'}</td>
          <td class="num mono">${money(w.baseSatang)}</td>
          <td class="num mono">${money(w.whtSatang)}</td>
        </tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">No certificates in this range.</div>'}`;
  };
  return card;
}