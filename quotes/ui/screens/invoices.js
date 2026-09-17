// quotes/ui/screens/invoices.js — the tax-invoice Workbench.
//
// Same shape as the quotation screen, deliberately: these two objects sit at
// either end of one pipeline and an operator should not have to learn the
// screen twice. The invoice DETAIL behaviour is ported unchanged from the
// previous invoice.html — issue, cancel, delete-draft, payments and WHT
// certificates all worked. What changes is that the record now sits beside the
// list, and the three native confirm() calls become real dialogs that say what
// they are about to do.

import {
  api, fmtSatang, el, esc, toast, statusChip, confirmAction, withBusy,
} from '../app.js';
import { mountWorkbench } from '../workbench.js';

let clients = [];
const clientName = (id) => clients.find((c) => c.id === id)?.name ?? `client #${id}`;

export async function mount(main) {
  const wbApi = mountWorkbench(main, {
    noun: 'invoice',
    load: async () => {
      const [{ invoices }, { clients: cs }] = await Promise.all([
        api('GET', '/invoices'),
        api('GET', '/clients'),
      ]);
      clients = cs;
      return invoices;
    },
    rowOf: (i) => ({
      id: i.id,
      status: i.status,
      number: i.number,
      name: clientName(i.client_id),
      meta: `${i.status}${i.issue_date ? ` · ${i.issue_date}` : ' · not issued'}`,
      amount: fmtSatang(i.payable_satang, i.currency),
    }),
    matches: (i, needle) =>
      String(i.number).toLowerCase().includes(needle)
      || clientName(i.client_id).toLowerCase().includes(needle)
      || String(i.issue_date ?? '').includes(needle),
    filters: [
      {
        name: 'status',
        label: 'Status',
        options: [['', 'All statuses'], ['draft', 'Draft'], ['issued', 'Issued'], ['paid', 'Paid'], ['cancelled', 'Cancelled']],
      },
      {
        name: 'month',
        label: 'Tax point',
        // Built from the invoices themselves, so the filter can only ever offer
        // a month that actually has something in it.
        options: [['', 'Any month']],
        pick: (i) => String(i.issue_date ?? '').slice(0, 7),
      },
    ],
    emptyHtml: '<div class="empty"><strong>No invoices yet</strong>Raise one from an accepted quotation below.</div>',
    detailOf: (id, host) => renderInvoice(id, host, () => wbApi.reloadAll()),
    aside: raiseForm(() => wbApi),
  });

  await wbApi.refresh();
  populateMonths(main);
}

/** Fill the tax-point filter from the months that actually exist. */
function populateMonths(main) {
  const sel = main.querySelector('select[name=month]');
  if (!sel) return;
  api('GET', '/invoices').then(({ invoices }) => {
    const months = [...new Set(invoices.map((i) => String(i.issue_date ?? '').slice(0, 7)).filter(Boolean))].sort().reverse();
    sel.innerHTML = `<option value="">Any month</option>${months.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}`;
  }).catch(() => {});
}

/* ----------------------------------------------------------------- raise -- */

function raiseForm(getWb) {
  const form = el(`<form>
    <p class="section-label">Raise an invoice</p>
    <p class="meta">Only an <strong>accepted</strong> quotation can be invoiced. The lines are snapshotted, so editing the quotation afterwards cannot move a figure on the invoice.</p>
    <label>Accepted quotation
      <select name="quotation_id" required><option value="">Loading…</option></select>
    </label>
    <label>Language
      <select name="lang"><option value="">Same as quotation</option><option value="en">English</option><option value="th">ไทย</option></select>
    </label>
    <label>Issue date
      <input name="issue_date" type="date">
      <span class="hint">Blank = set on issue. This date is the tax point.</span>
    </label>
    <label>Notes <textarea name="notes" rows="2" placeholder="Reference, PO number…"></textarea></label>
    <div class="row-actions"><button type="submit">Create draft invoice</button></div>
  </form>`);

  const select = form.querySelector('select[name=quotation_id]');
  api('GET', '/quotations?status=accepted&include=totals').then(({ quotations }) => {
    select.innerHTML = quotations.length
      ? quotations.map((q) => `<option value="${esc(q.id)}">${esc(q.number)} — ${esc(clientName(q.client_id))}</option>`).join('')
      : '<option value="">— no accepted quotation waiting —</option>';
  }).catch((e) => toast(e.message, 'error'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    if (!f.get('quotation_id')) return toast('Pick an accepted quotation first', 'error');
    await withBusy(form.querySelector('button[type=submit]'), async () => {
      try {
        const body = { quotation_id: Number(f.get('quotation_id')), notes: f.get('notes') };
        if (f.get('lang')) body.lang = f.get('lang');
        if (f.get('issue_date')) body.issue_date = f.get('issue_date');
        const { invoice } = await api('POST', '/invoices', body);
        toast(`Created ${invoice.number} as a draft`);
        form.reset();
        const wb = getWb();
        await wb.reloadAll();
        wb.select(invoice.id);
      } catch (err) { toast(err.message, 'error'); }
    });
  });
  return form;
}

/* ---------------------------------------------------------------- detail -- */

async function renderInvoice(id, host, reloadList) {
  let doc = await api('GET', `/invoices/${id}`);

  const kindLabel = (code) => doc?.kindLabels?.[code] ?? code;
  // A tax invoice bills ONE cycle, so this column states the cadence the line
  // was sold on — it is never multiplied into the amounts on this page.
  const periodLabel = (code) => (code && code !== 'once' ? `/${String(code).replace(/ly$/, '')}` : 'once');

  const run = async (btn, fn, ok) => withBusy(btn, async () => {
    try { await fn(); if (ok) toast(ok); } catch (e) { toast(e.message, 'error'); }
  });
  async function refresh({ list = false } = {}) {
    doc = await api('GET', `/invoices/${id}`);
    draw();
    if (list) await reloadList();
  }

  function draw() {
    const { invoice: i, client, totals, balance: b, payments } = doc;
    const cur = totals.currency;
    const isDraft = i.status === 'draft';
    host.innerHTML = '';

    host.append(el(`<section class="card">
      <div class="toolbar">
        <h2><span class="mono">${esc(i.number)}</span> ${statusChip(i.status)}</h2>
        <div class="row-actions tight">
          ${isDraft ? '<button data-act="issue">Issue this invoice</button>' : ''}
          <a class="button secondary" href="/api/invoices/${id}/pdf?lang=en" target="_blank" rel="noopener">PDF EN</a>
          <a class="button secondary" href="/api/invoices/${id}/pdf?lang=th" target="_blank" rel="noopener">PDF ไทย</a>
          ${i.status !== 'cancelled' && i.status !== 'paid' ? '<button class="danger" data-act="cancel">Cancel invoice</button>' : ''}
          ${isDraft ? '<button class="danger" data-act="delete">Delete draft</button>' : ''}
        </div>
      </div>
      <div class="banner" data-tone="${isDraft ? 'warn' : 'info'}">${isDraft
        ? 'This invoice is still a <strong>draft</strong>. Its rates are provisional — they freeze the moment you issue it, and the issue date becomes the tax point.'
        : `Issued ${esc(i.issueDate)}. The rates below are <strong>frozen</strong> onto this invoice: changing them in Settings will not move these figures.`}</div>
      <div class="grid">
        <dl class="kv">
          <dt>Client</dt><dd>${esc(client?.name ?? '—')}</dd>
          <dt>Tax ID</dt><dd class="mono">${esc(client?.taxId) || '<span class="muted">none on file</span>'}</dd>
          <dt>From quotation</dt><dd>${i.quotationId
            ? `<a class="mono" href="quote.html?id=${i.quotationId}">${esc(i.quotationNumber)}</a>`
            : '<span class="muted">none</span>'}</dd>
        </dl>
        <dl class="kv">
          <dt>Tax point (issued)</dt><dd class="mono">${esc(i.issueDate) || '<span class="muted">not issued yet</span>'}</dd>
          <dt>Due</dt><dd class="mono">${esc(i.dueDate) || '—'}</dd>
          <dt>Branch</dt><dd class="mono">${esc(i.branchCode) || '—'}</dd>
          <dt>VAT rate</dt><dd class="mono">${esc(totals.vatRate)}% <span class="muted">(${isDraft ? 'provisional' : 'frozen'})</span></dd>
          <dt>Withholding</dt><dd class="mono">${esc(totals.whtRate)}% — ${esc(totals.whtMode)}</dd>
        </dl>
      </div>
      ${isDraft ? `<label class="w-field mt-3">Issue date
        <input data-issue-date type="date"><span class="hint">Blank = today.</span></label>` : ''}
    </section>`));

    host.append(el(`<section class="card">
      <h2>Lines <span class="muted">snapshotted from the quotation</span></h2>
      <div class="table-scroll"><table class="list"><thead><tr>
        <th>#</th><th>Description</th><th>Type</th><th>Billing</th><th>Section</th><th class="num">Qty</th>
        <th>Unit</th><th class="num">Unit price</th><th class="num">Discount</th><th class="num">Amount</th>
      </tr></thead><tbody>
        ${doc.lines.map((l) => `<tr>
          <td class="mono muted">${esc(String(l.position))}</td>
          <td>${esc(l.descriptionEn)}${l.descriptionTh ? `<br><span class="muted">${esc(l.descriptionTh)}</span>` : ''}</td>
          <td class="muted">${esc(kindLabel(l.kind))}</td>
          <td class="muted mono">${esc(periodLabel(l.billingPeriod))}</td>
          <td class="muted">${esc(l.section) || '—'}</td>
          <td class="num mono">${esc(String(l.qty))}</td>
          <td class="muted">${esc(l.unit)}</td>
          <td class="num mono">${fmtSatang(l.unitSatang, cur)}</td>
          <td class="num mono muted">${l.discountSatang ? `−${fmtSatang(l.discountSatang, cur)}` : '—'}</td>
          <td class="num mono">${fmtSatang(l.subtotalSatang - (l.discountSatang || 0), cur)}</td>
        </tr>`).join('')}
      </tbody></table></div>
      <table class="totals">
        <tr class="memo"><td class="lbl">Subtotal</td><td class="num">${fmtSatang(totals.subtotalSatang, cur)}</td></tr>
        ${totals.discountSatang ? `<tr class="memo"><td class="lbl">Total discount</td><td class="num">−${fmtSatang(totals.discountSatang, cur)}</td></tr>` : ''}
        <tr><td class="lbl">Net (VAT base)</td><td class="num">${fmtSatang(totals.netSatang, cur)}</td></tr>
        <tr><td class="lbl">VAT ${esc(totals.vatRate)}%</td><td class="num">${fmtSatang(totals.vatSatang, cur)}</td></tr>
        <tr class="grand"><td class="lbl">Grand total</td><td class="num">${fmtSatang(totals.grandSatang, cur)}</td></tr>
        ${totals.whtSatang ? `<tr class="memo"><td class="lbl">Withholding ${esc(totals.whtRate)}% (${esc(totals.whtMode)})</td><td class="num">${totals.whtMode === 'deduct' ? '−' : ''}${fmtSatang(totals.whtSatang, cur)}</td></tr>` : ''}
        <tr class="payable"><td class="lbl">Total payable</td><td class="num">${fmtSatang(totals.payableSatang, cur)}</td></tr>
      </table>
    </section>`));

    // In 'memo' mode the customer transfers less and hands over a certificate,
    // so the certificate closes the gap. In 'deduct' mode the withholding was
    // already taken off the invoice face, so only cash can settle it.
    const certCounts = b.whtMode !== 'deduct';
    host.append(el(`<section class="card">
      <h2>Settlement</h2>
      <table class="totals m0 mb-5">
        <tr><td class="lbl">Payable</td><td class="num">${fmtSatang(b.payableSatang, cur)}</td></tr>
        <tr><td class="lbl">Cash received</td><td class="num">${fmtSatang(b.paidSatang, cur)}</td></tr>
        ${b.withheldSatang ? `<tr class="memo"><td class="lbl">Withheld at source${certCounts ? '' : ' (already deducted — not a settlement)'}</td><td class="num">${fmtSatang(b.withheldSatang, cur)}</td></tr>` : ''}
        <tr class="${b.settled ? 'payable' : 'grand'}"><td class="lbl">${b.settled ? 'Settled in full' : 'Outstanding'}</td><td class="num">${b.settled ? '—' : fmtSatang(b.outstandingSatang, cur)}</td></tr>
      </table>
      ${payments.length ? `<div class="table-scroll"><table class="list"><thead><tr>
          <th>Paid on</th><th class="num">Amount</th><th>Method</th><th>Reference</th><th></th>
        </tr></thead><tbody>
        ${payments.map((p) => `<tr>
          <td class="mono">${esc(p.paidOn)}</td>
          <td class="num mono">${fmtSatang(p.amountSatang, cur)}</td>
          <td class="muted">${esc(p.method) || '—'}</td>
          <td class="muted">${esc(p.reference) || ''}</td>
          <td class="actions"><button class="quiet sm" data-del-pay="${esc(p.id)}">Reverse</button></td>
        </tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">No payments recorded.</div>'}
      ${i.status === 'draft'
        ? '<p class="meta mt-4">A draft cannot take a payment — issue it first.</p>'
        : `<form data-form="pay" class="mt-5">
        <p class="section-label">Record a payment</p>
        <div class="grid">
          <label>Amount (${esc(cur)})<input name="amount" required inputmode="decimal" pattern="\\d+(\\.\\d{1,2})?" placeholder="10400.00"></label>
          <label>Paid on<input name="paid_on" type="date"></label>
          <label>Method<input name="method" placeholder="transfer"></label>
          <label>Reference<input name="reference" placeholder="bank ref"></label>
        </div>
        <div class="row-actions"><button type="submit">Record payment</button></div>
      </form>`}
    </section>`));

    const certs = doc.wht_certificates ?? [];
    host.append(el(`<section class="card">
      <h2>Withholding tax certificates received</h2>
      <p class="meta">Each certificate the customer hands over is a tax credit you claim against the company's own income tax. Withholding is calculated on the <strong>net</strong> (pre-VAT) base, never on the VAT-inclusive total.</p>
      ${certs.length ? `<div class="table-scroll"><table class="list"><thead><tr>
          <th>Cert no.</th><th>Issued</th><th>Form</th><th class="num">Base</th><th class="num">Withheld</th><th>Payer</th>
        </tr></thead><tbody>
        ${certs.map((w) => `<tr>
          <td class="mono">${esc(w.certNumber) || '—'}</td>
          <td class="mono">${esc(w.issuedOn)}</td>
          <td class="mono">${esc(w.pndForm)}</td>
          <td class="num mono">${fmtSatang(w.baseSatang, cur)}</td>
          <td class="num mono">${fmtSatang(w.whtSatang, cur)}<span class="muted mono"> ${esc(w.ratePercent)}%</span></td>
          <td>${esc(w.payerName) || '—'}<br><span class="muted mono">${esc(w.payerTaxId) || ''}</span></td>
        </tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">No certificates recorded against this invoice.</div>'}
      <form data-form="wht" style="margin-top:18px">
        <p class="section-label">Record a certificate</p>
        <div class="grid">
          <label>Certificate no.<input name="cert_number" placeholder="WHT-0001" class="mono"></label>
          <label>Issued on<input name="issued_on" type="date"></label>
          <label>PND form
            <select name="pnd_form">
              <option value="PND53">PND 53 (paid by a company)</option>
              <option value="PND3">PND 3 (paid by an individual)</option>
              <option value="PND54">PND 54 (paid from abroad)</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>Base amount, pre-VAT (${esc(cur)})<input name="base" required inputmode="decimal" pattern="\\d+(\\.\\d{1,2})?" placeholder="10000.00"></label>
          <label>Amount withheld (${esc(cur)})<input name="wht" required inputmode="decimal" pattern="\\d+(\\.\\d{1,2})?" placeholder="300.00"></label>
          <label>Rate %<input name="rate_percent" inputmode="decimal" placeholder="3"></label>
          <label>Payer name<input name="payer_name"></label>
          <label>Payer tax ID<input name="payer_tax_id" inputmode="numeric" class="mono"></label>
        </div>
        <div class="row-actions"><button type="submit">Record certificate</button></div>
      </form>
    </section>`));
  }

  host.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const i = doc.invoice;

    if (btn.dataset.act === 'issue') {
      const d = host.querySelector('[data-issue-date]')?.value;
      return run(btn, async () => { await api('POST', `/invoices/${id}/issue`, d ? { issue_date: d } : {}); await refresh({ list: true }); },
        'Issued — rates and totals are now frozen');
    }
    if (btn.dataset.act === 'cancel') {
      const ok = await confirmAction({
        title: `Cancel ${i.number}?`,
        body: 'The number is kept so the series has no gap, but the document is void.',
        consequences: ['The invoice becomes void and can no longer be paid'],
        confirmLabel: 'Cancel invoice',
        tone: 'warn',
      });
      if (!ok) return;
      return run(btn, async () => { await api('POST', `/invoices/${id}/status`, { status: 'cancelled' }); await refresh({ list: true }); },
        'Invoice cancelled');
    }
    if (btn.dataset.act === 'delete') {
      const ok = await confirmAction({
        title: `Delete draft ${i.number}?`,
        body: 'This invoice was never issued, so it has no tax point and no filed figures.',
        consequences: [`Draft invoice ${i.number} and its ${doc.lines.length} snapshotted line(s)`],
        confirmLabel: 'Delete draft',
      });
      if (!ok) return;
      return run(btn, async () => { await api('DELETE', `/invoices/${id}`); toast('Draft deleted'); await reloadList(); });
    }
    if (btn.dataset.delPay) {
      const ok = await confirmAction({
        title: 'Reverse this payment?',
        body: 'The invoice goes back to outstanding by that amount.',
        confirmLabel: 'Reverse payment',
      });
      if (!ok) return;
      return run(btn, async () => { await api('DELETE', `/invoices/${id}/payments/${btn.dataset.delPay}`); await refresh({ list: true }); },
        'Payment reversed');
    }
  });

  host.addEventListener('submit', async (e) => {
    const kind = e.target.dataset.form;
    if (kind !== 'pay' && kind !== 'wht') return;
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector('button[type=submit]');
    if (kind === 'pay') {
      return run(btn, async () => {
        await api('POST', `/invoices/${id}/payments`, {
          amount: f.get('amount'),
          paid_on: f.get('paid_on') || undefined,
          method: f.get('method') || undefined,
          reference: f.get('reference') || undefined,
        });
        await refresh({ list: true });
      }, 'Payment recorded');
    }
    const body = {};
    for (const [k, v] of f.entries()) if (String(v).trim()) body[k] = v;
    return run(btn, async () => { await api('POST', `/invoices/${id}/wht`, body); await refresh({ list: true }); },
      'Certificate recorded');
  });

  draw();
}