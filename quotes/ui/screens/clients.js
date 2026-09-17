// quotes/ui/screens/clients.js — the client Workbench.
//
// WHAT WAS WRONG. The previous screen could create a client and delete one, and
// nothing else. PUT /clients/:id has existed the whole time and was unreachable
// from any screen, so a wrong tax ID — which prints on the PDF — could only be
// fixed by deleting the client, which the server refuses once they have a
// quotation. Delete fired on a single click with no confirmation at all, and
// its refusal arrived as a bare error string with no way to act on it.

import {
  api, fmtSatang, el, esc, toast, statusChip, confirmAction, withBusy,
} from '../app.js';
import { mountWorkbench } from '../workbench.js';

const FIELDS = [
  ['name', 'Name (EN)', 'text', true],
  ['name_th', 'ชื่อ (TH)', 'text', false],
  ['tax_id', 'Tax ID', 'numeric', false],
  ['contact', 'Contact person', 'text', false],
  ['email', 'Email', 'email', false],
  ['phone', 'Phone', 'text', false],
];

export async function mount(main) {
  const wbApi = mountWorkbench(main, {
    noun: 'client',
    load: async () => {
      // The quotation and invoice counts are what make the list useful: they
      // say at a glance who is active and who can safely be removed.
      const [{ clients }, { quotations }, { invoices }] = await Promise.all([
        api('GET', '/clients'),
        api('GET', '/quotations'),
        api('GET', '/invoices'),
      ]);
      return clients.map((c) => ({
        ...c,
        quotationCount: quotations.filter((q) => q.client_id === c.id).length,
        invoiceCount: invoices.filter((i) => i.client_id === c.id).length,
      }));
    },
    rowOf: (c) => ({
      id: c.id,
      status: c.quotationCount ? 'issued' : 'draft',
      number: c.tax_id || '—',
      name: c.name,
      meta: c.contact || c.email || '',
      amount: c.quotationCount ? `${c.quotationCount} quote${c.quotationCount === 1 ? '' : 's'}` : 'none',
    }),
    matches: (c, needle) => [c.name, c.name_th, c.tax_id, c.contact, c.email, c.phone]
      .some((v) => String(v ?? '').toLowerCase().includes(needle)),
    emptyHtml: '<div class="empty"><strong>No clients yet</strong>Add the first one below.</div>',
    detailOf: (id, host) => renderClient(id, host, () => wbApi.reloadAll()),
    aside: newClientForm(() => wbApi),
  });

  await wbApi.refresh();
}

/* ------------------------------------------------------------------ new -- */

function newClientForm(getWb) {
  const form = el(`<form>
    <p class="section-label">New client</p>
    ${FIELDS.map(([n, l, t, req]) => `<label>${esc(l)}
      <input name="${n}"${t === 'email' ? ' type="email"' : ''}${t === 'numeric' ? ' inputmode="numeric"' : ''}${req ? ' required' : ''}>
    </label>`).join('')}
    <label>Address (EN) <textarea name="address" rows="2"></textarea></label>
    <label>ที่อยู่ (TH) <textarea name="address_th" rows="2"></textarea></label>
    <div class="row-actions"><button type="submit">Add client</button></div>
  </form>`);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form).entries());
    await withBusy(form.querySelector('button[type=submit]'), async () => {
      try {
        const { client } = await api('POST', '/clients', body);
        toast(`Added ${client.name}`);
        form.reset();
        const wb = getWb();
        await wb.reloadAll();
        wb.select(client.id);
      } catch (err) { toast(err.message, 'error'); }
    });
  });
  return form;
}

/* --------------------------------------------------------------- detail -- */

async function renderClient(id, host, reloadList) {
  const [{ client }, { quotations }, { invoices }] = await Promise.all([
    api('GET', `/clients/${id}`),
    api('GET', `/quotations?client_id=${id}&include=totals`),
    api('GET', `/invoices?client_id=${id}`),
  ]);

  const blocked = quotations.length > 0;

  host.innerHTML = '';

  /* ---- identity + edit ---- */
  const card = el(`<section class="card">
    <div class="toolbar">
      <h2 style="margin:0">${esc(client.name)}${client.name_th ? ` <span class="muted">${esc(client.name_th)}</span>` : ''}</h2>
      <div class="row-actions tight">
        <button class="danger" data-act="delete"${blocked ? ' aria-disabled="true" disabled' : ''}>Delete client</button>
      </div>
    </div>
    ${blocked ? `<div class="banner" data-tone="info">
      This client cannot be deleted while ${quotations.length} quotation${quotations.length === 1 ? '' : 's'}
      reference${quotations.length === 1 ? 's' : ''} them — a quotation must always belong to someone.
      Delete or reassign those first; they are listed below.
    </div>` : ''}
    <form data-form="edit">
      <div class="grid">
        ${FIELDS.map(([n, l, t, req]) => `<label>${esc(l)}
          <input name="${n}" value="${esc(client[n] ?? '')}"${t === 'email' ? ' type="email"' : ''}${t === 'numeric' ? ' inputmode="numeric" class="mono"' : ''}${req ? ' required' : ''}>
          ${n === 'tax_id' ? '<span class="hint">Prints on the quotation and the tax invoice — a wrong digit here is a wrong document.</span>' : ''}
        </label>`).join('')}
      </div>
      <div class="grid">
        <label>Address (EN) <textarea name="address" rows="3">${esc(client.address ?? '')}</textarea></label>
        <label>ที่อยู่ (TH) <textarea name="address_th" rows="3">${esc(client.address_th ?? '')}</textarea></label>
      </div>
      <div class="row-actions"><button type="submit" class="secondary">Save changes</button></div>
    </form>
  </section>`);
  host.append(card);

  /* ---- their quotations ---- */
  host.append(el(`<section class="card">
    <h2>Quotations <span class="muted">${quotations.length}</span></h2>
    ${quotations.length ? `<div class="table-scroll"><table class="list">
      <thead><tr><th>No.</th><th>Status</th><th>Issued</th><th class="num">Payable</th><th></th></tr></thead>
      <tbody>${quotations.map((q) => `<tr>
        <td class="mono"><a href="quote.html?id=${q.id}">${esc(q.number)}</a></td>
        <td>${statusChip(q.status)}</td>
        <td class="mono">${esc(q.issue_date ?? '')}</td>
        <td class="num mono">${q.totals ? fmtSatang(q.totals.payableSatang, q.totals.currency) : ''}</td>
        <td class="actions"><a class="button quiet sm" href="quote.html?id=${q.id}">Open</a></td>
      </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">None yet.</div>'}
  </section>`));

  /* ---- their invoices ---- */
  host.append(el(`<section class="card">
    <h2>Tax invoices <span class="muted">${invoices.length}</span></h2>
    ${invoices.length ? `<div class="table-scroll"><table class="list">
      <thead><tr><th>No.</th><th>Status</th><th>Tax point</th><th class="num">Payable</th><th></th></tr></thead>
      <tbody>${invoices.map((i) => `<tr>
        <td class="mono"><a href="invoice.html?id=${i.id}">${esc(i.number)}</a></td>
        <td>${statusChip(i.status)}</td>
        <td class="mono">${esc(i.issue_date ?? '')}</td>
        <td class="num mono">${fmtSatang(i.payable_satang, i.currency)}</td>
        <td class="actions"><a class="button quiet sm" href="invoice.html?id=${i.id}">Open</a></td>
      </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">None yet.</div>'}
  </section>`));

  /* ---- events ---- */
  card.addEventListener('submit', async (e) => {
    if (e.target.dataset.form !== 'edit') return;
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    await withBusy(e.target.querySelector('button[type=submit]'), async () => {
      try {
        await api('PUT', `/clients/${id}`, body);
        toast('Client saved');
        await reloadList();
      } catch (err) { toast(err.message, 'error'); }
    });
  });

  card.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act=delete]');
    if (!btn || btn.disabled) return;
    const ok = await confirmAction({
      title: `Delete ${client.name}?`,
      body: 'They have no quotations, so nothing points at this record.',
      consequences: ['The client record, including their tax ID and addresses'],
      confirmLabel: 'Delete client',
    });
    if (!ok) return;
    await withBusy(btn, async () => {
      try {
        await api('DELETE', `/clients/${id}`);
        toast(`Deleted ${client.name}`);
        await reloadList();
      } catch (err) {
        // The server is the authority. If it refuses, show the sentence it
        // wrote — it names what is in the way — rather than a bare toast.
        await confirmAction({
          title: 'Cannot delete this client',
          body: err.message,
          confirmLabel: 'OK',
          tone: 'warn',
          acknowledge: true,
        });
      }
    });
  });
}