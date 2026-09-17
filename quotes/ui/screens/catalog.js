// quotes/ui/screens/catalog.js — the price book, as a Ledger.
//
// The table IS the job here, so there is no rail: it is one full-width grid
// with inline editing. The previous screen could add an item and toggle it
// active, and nothing else — PUT /catalog/:id and DELETE /catalog/:id both
// existed and were unreachable, so a mistyped price was permanent and a junk
// row could only ever be deactivated, never removed.

import {
  api, fmtSatang, el, esc, toast, confirmAction, withBusy,
} from '../app.js';

const FALLBACK_KINDS = [{ code: 'service', en: 'Service' }, { code: 'hardware', en: 'Hardware' }];
const FALLBACK_PERIODS = [
  { code: 'once', en: 'One-time' }, { code: 'monthly', en: 'Monthly' },
  { code: 'quarterly', en: 'Quarterly' }, { code: 'yearly', en: 'Yearly' },
];
const vocab = { kinds: FALLBACK_KINDS, billingPeriods: FALLBACK_PERIODS };

const opts = (list, sel) => list
  .map((k) => `<option value="${esc(k.code)}"${k.code === sel ? ' selected' : ''}>${esc(k.en ?? k.code)}</option>`)
  .join('');
const kindLabel = (code) => vocab.kinds.find((k) => k.code === code)?.en ?? code;
const periodLabel = (p) => (p && p !== 'once' ? `/${p.replace(/ly$/, '')}` : 'once');
const satangToPrice = (n) => (Number(n || 0) / 100).toFixed(2);

let items = [];
let editing = null;
let showInactive = true;

export async function mount(main) {
  try {
    const v = await api('GET', '/line-kinds');
    if (Array.isArray(v.kinds) && v.kinds.length) vocab.kinds = v.kinds;
    if (Array.isArray(v.billing_periods) && v.billing_periods.length) vocab.billingPeriods = v.billing_periods;
  } catch { toast('Using the built-in type list — /line-kinds is unavailable', 'error'); }

  const listCard = el(`<section class="card">
    <div class="toolbar">
      <h2>Items</h2>
      <div class="row-actions tight">
        <label class="inline"><input type="checkbox" data-toggle-inactive checked> Show inactive</label>
        <input type="search" data-q class="grow" placeholder="Search the catalog…">
      </div>
    </div>
    <div data-list><div class="empty">Loading…</div></div>
  </section>`);

  const formCard = el(`<section class="card"><h2>New item</h2>
    <form data-form="new">
      <div class="grid">
        <label>Type <select name="kind">${opts(vocab.kinds)}</select></label>
        <label>Billing <select name="billing_period">${opts(vocab.billingPeriods)}</select></label>
        <label>SKU <input name="sku" class="mono"></label>
        <label>Unit <input name="unit" placeholder="auto"><span class="hint">Blank picks one to suit the type and period.</span></label>
        <label>Unit price (THB) <input name="unit_price" required placeholder="35000.00" inputmode="decimal"></label>
        <label>Section <input name="section" placeholder="Hardware"></label>
      </div>
      <div class="grid">
        <label>Name (EN) <input name="name_en" required></label>
        <label>ชื่อ (TH) <input name="name_th"></label>
      </div>
      <label>Description <textarea name="description" rows="2"></textarea></label>
      <div class="row-actions"><button type="submit">Add item</button></div>
    </form>
  </section>`);

  main.append(listCard, formCard);

  const box = listCard.querySelector('[data-list]');
  const search = listCard.querySelector('[data-q]');

  function draw() {
    const q = search.value.trim().toLowerCase();
    const shown = items
      .filter((i) => (showInactive ? true : i.active))
      .filter((i) => !q || [i.name_en, i.name_th, i.sku, i.section].some((v) => String(v ?? '').toLowerCase().includes(q)));

    if (!items.length) {
      box.innerHTML = '<div class="empty"><strong>The catalog is empty</strong>Add the items you quote most often — they seed new quotation lines.</div>';
      return;
    }
    if (!shown.length) {
      box.innerHTML = `<div class="empty"><strong>Nothing matches</strong>Clear the search to see all ${items.length}.</div>`;
      return;
    }
    box.innerHTML = `<div class="table-scroll"><table class="list"><thead><tr>
      <th>Item</th><th>Type</th><th>Billing</th><th>Section</th><th>Unit</th>
      <th class="num">Unit price</th><th>Status</th><th></th>
    </tr></thead><tbody>
      ${shown.map((i) => (String(i.id) === String(editing) ? editRow(i) : viewRow(i))).join('')}
    </tbody></table></div>`;
  }

  function viewRow(i) {
    return `<tr${i.active ? '' : ' data-optional="true"'}>
      <td><strong>${esc(i.name_en)}</strong>${i.name_th ? `<br><span class="muted">${esc(i.name_th)}</span>` : ''}
        ${i.sku ? `<br><span class="mono muted">${esc(i.sku)}</span>` : ''}</td>
      <td>${esc(kindLabel(i.kind))}</td>
      <td class="mono">${esc(periodLabel(i.billing_period))}</td>
      <td>${esc(i.section) || '—'}</td>
      <td>${esc(i.unit)}</td>
      <td class="num mono">${fmtSatang(i.unit_satang)}</td>
      <td>${i.active ? '<span class="status status-issued">active</span>' : '<span class="status status-draft">inactive</span>'}</td>
      <td class="actions">
        <button class="quiet sm" data-edit="${esc(i.id)}">Edit</button>
        <button class="quiet sm" data-toggle="${esc(i.id)}">${i.active ? 'Deactivate' : 'Activate'}</button>
        <button class="quiet sm" data-del="${esc(i.id)}">Delete</button>
      </td>
    </tr>`;
  }

  function editRow(i) {
    return `<tr class="editing" data-item="${esc(i.id)}">
      <td>
        <input name="name_en" value="${esc(i.name_en)}" aria-label="Name (EN)" required>
        <input name="name_th" value="${esc(i.name_th ?? '')}" aria-label="Name (TH)" placeholder="ภาษาไทย">
        <input name="sku" value="${esc(i.sku ?? '')}" aria-label="SKU" placeholder="SKU" class="mono">
      </td>
      <td><select name="kind" aria-label="Type">${opts(vocab.kinds, i.kind)}</select></td>
      <td><select name="billing_period" aria-label="Billing">${opts(vocab.billingPeriods, i.billing_period)}</select></td>
      <td><input name="section" value="${esc(i.section ?? '')}" aria-label="Section"></td>
      <td><input name="unit" value="${esc(i.unit ?? '')}" aria-label="Unit"></td>
      <td><input name="unit_price" value="${satangToPrice(i.unit_satang)}" inputmode="decimal" aria-label="Unit price"></td>
      <td><label class="inline"><input type="checkbox" name="active"${i.active ? ' checked' : ''}> Active</label></td>
      <td class="actions">
        <button class="sm" data-save="${esc(i.id)}">Save</button>
        <button class="quiet sm" data-cancel-edit>Cancel</button>
      </td>
    </tr>`;
  }

  async function reload() { items = (await api('GET', '/catalog')).items ?? []; draw(); }

  const run = async (btn, fn, ok) => withBusy(btn, async () => {
    try { await fn(); if (ok) toast(ok); } catch (e) { toast(e.message, 'error'); }
  });

  search.addEventListener('input', draw);
  listCard.querySelector('[data-toggle-inactive]').addEventListener('change', (e) => {
    showInactive = e.target.checked; draw();
  });

  listCard.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.edit) { editing = btn.dataset.edit; return draw(); }
    if (btn.hasAttribute('data-cancel-edit')) { editing = null; return draw(); }

    if (btn.dataset.toggle) {
      const item = items.find((i) => String(i.id) === btn.dataset.toggle);
      return run(btn, async () => { await api('PUT', `/catalog/${btn.dataset.toggle}`, { active: !item.active }); await reload(); });
    }

    if (btn.dataset.save) {
      const tr = btn.closest('tr');
      const val = (n) => tr.querySelector(`[name="${n}"]`);
      const body = {
        name_en: val('name_en').value,
        name_th: val('name_th').value,
        sku: val('sku').value,
        kind: val('kind').value,
        billing_period: val('billing_period').value,
        section: val('section').value,
        unit: val('unit').value,
        unit_price: val('unit_price').value,
        active: val('active').checked,
      };
      return run(btn, async () => {
        await api('PUT', `/catalog/${btn.dataset.save}`, body);
        editing = null;
        await reload();
      }, 'Item updated');
    }

    if (btn.dataset.del) {
      const item = items.find((i) => String(i.id) === btn.dataset.del);
      const ok = await confirmAction({
        title: `Delete ${item?.name_en ?? 'this item'}?`,
        body: 'Catalog items only seed new quotation lines. Lines already written from this item keep their own copy of the description and price and are not touched.',
        consequences: ['The catalog entry, its price and its billing period'],
        confirmLabel: 'Delete item',
      });
      if (!ok) return;
      return run(btn, async () => {
        try { await api('DELETE', `/catalog/${btn.dataset.del}`); await reload(); toast('Item deleted'); }
        catch (err) {
          // The server refuses when a quotation line still points at the item,
          // and tells you to deactivate instead. Show that, actionably.
          await confirmAction({ title: 'Cannot delete this item', body: err.message, confirmLabel: 'OK', tone: 'warn', acknowledge: true });
        }
      });
    }
  });

  listCard.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editing) { editing = null; draw(); }
  });

  formCard.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Empty strings are dropped so the server applies its own defaults — an
    // empty unit becomes the one that suits the kind and period, not ''.
    const body = Object.fromEntries(
      [...new FormData(e.target).entries()].filter(([, v]) => String(v) !== ''),
    );
    await run(e.target.querySelector('button[type=submit]'), async () => {
      await api('POST', '/catalog', body);
      e.target.reset();
      await reload();
    }, 'Item added');
  });

  await reload();
}