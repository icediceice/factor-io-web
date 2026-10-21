// Guided SOW + quotation creation. All choices stay in browser memory until
// the final submit, so abandoning the guide does not consume a quote number.
import { api, el, esc, toast, withBusy, fmtSatang } from '../app.js';
import { mountSowEditor } from '../sow-editor.js';

export function mountSmartQuote(main, getWorkbench, getClients, vocab) {
  const launch = el('<button type="button" class="quote-launch" data-start>Create SOW + quotation</button>');
  const dialog = el('<dialog class="quote-wizard" aria-label="New SOW and quotation"></dialog>');
  main.querySelector('[data-page-actions]').append(launch);
  main.append(dialog);
  let templates = [];
  let catalogItems = [];
  let step = 0;
  let state = {};
  const steps = ['Engagement', 'Scope', 'Pricing', 'Review'];
  const chosen = () => templates.find((t) => t.code === state.template);
  const selectedClient = () => getClients().find((c) => String(c.id) === String(state.client_id));
  const satangToPrice = (n) => (Number(n || 0) / 100).toFixed(2);
  const lineSatang = (line) => {
    const qty = Number(line.qty);
    const price = Number(line.unit_price);
    const disc = Number(line.discount_satang || 0);
    return Math.max(0, Math.round(qty * price * 100) - disc);
  };
  const money = (line) => fmtSatang(lineSatang(line));
  function fresh() {
    step = 0;
    state = { client_id: '', template: '', lang: 'en', issue_date: '', notes: '', sow: null, lines: [] };
    render();
  }
  function setTemplate(code) {
    state.template = code;
    state.sow = chosen() ? structuredClone(chosen().sow) : null;
  }
  function gatherBasics() {
    const form = dialog.querySelector('[data-basics]');
    if (!form) return;
    const data = new FormData(form);
    state.client_id = String(data.get('client_id') ?? '');
    state.lang = String(data.get('lang') ?? 'en');
    state.issue_date = String(data.get('issue_date') ?? '');
    state.notes = String(data.get('notes') ?? '');
    const template = String(data.get('template') ?? '');
    if (template !== state.template) setTemplate(template);
  }
  function render() {
    const clientOptions = getClients().map((c) => `<option value="${esc(c.id)}"${String(c.id) === state.client_id ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
    const engagementOptions = templates.map((t) => `<option value="${esc(t.code)}"${t.code === state.template ? ' selected' : ''}>${esc(t.titleEn)}${t.titleTh ? ` · ${esc(t.titleTh)}` : ''}</option>`).join('');
    const catalogPicker = catalogItems.length ? `<label>Start from catalog
      <select name="catalog_pick"><option value="">— blank line —</option>
        ${catalogItems.map((i) => `<option value="${esc(i.id)}">${esc(i.name_en)} · ${fmtSatang(i.unit_satang)}${i.sku ? ` · ${esc(i.sku)}` : ''}</option>`).join('')}
      </select></label>` : '';
    let body = '';
    if (step === 0) body = `<form data-basics class="studio-fields"><label>Client<select name="client_id" required><option value="">Choose a client…</option>${clientOptions}</select></label>
      <label>Engagement<select name="template" required><option value="">Choose an engagement…</option>${engagementOptions}</select></label>
      <div class="studio-pair"><label>Language<select name="lang"><option value="en"${state.lang === 'en' ? ' selected' : ''}>English</option><option value="th"${state.lang === 'th' ? ' selected' : ''}>ไทย</option></select></label><label>Issue date<input type="date" name="issue_date" value="${esc(state.issue_date)}"></label></div>
      <label>Internal notes<textarea name="notes" rows="3">${esc(state.notes)}</textarea></label></form>`;
    if (step === 1) body = state.sow ? '<div class="studio-fields"><p class="meta">Tailor each activity and choose the modules this engagement will deliver.</p><div data-sow-editor></div></div>' : '<p class="empty">Choose an engagement first.</p>';
    if (step === 2) body = `<div class="studio-fields"><p class="meta">Each price is explicit. Pick from the catalog or enter a custom line; nothing is invented.</p>
      <div class="studio-lines">${state.lines.length ? state.lines.map((l, i) => `<div class="studio-line">
        <span><strong>${esc(l.description_en)}${l.optional ? ' <span class="mono">[OPTION]</span>' : ''}</strong>
          ${l.description_th ? `<small>${esc(l.description_th)}</small>` : ''}
          <small>${esc(l.qty)} ${esc(l.unit)} × ${esc(l.unit_price)} · ${esc(l.billing_period)}${l.discount_satang ? ` · −${fmtSatang(l.discount_satang)} disc.` : ''}</small></span>
        <b>${esc(money(l))}</b>
        ${state.lines.length > 1 ? `<span class="line-order-btns">
          <button type="button" class="quiet sm" data-move-wizard-line="up" data-line-index="${i}"${i === 0 ? ' disabled' : ''} aria-label="Move line up">↑</button>
          <button type="button" class="quiet sm" data-move-wizard-line="down" data-line-index="${i}"${i === state.lines.length - 1 ? ' disabled' : ''} aria-label="Move line down">↓</button>
        </span>` : ''}
        <button type="button" class="secondary sm" data-remove-line="${i}">Remove</button></div>`).join('') : '<div class="empty">No priced lines yet.</div>'}</div>
      <form data-add-line class="studio-price-form">
        ${catalogPicker}
        <div class="studio-pair"><label>Description (EN)<input name="description_en" required maxlength="1000" placeholder="Implementation and validation"></label><label>Description (TH)<input name="description_th" maxlength="1000" placeholder="คำอธิบายภาษาไทย (ถ้ามี)"></label></div>
        <div class="studio-price-grid"><label>Type<select name="kind">${vocab.kinds.map((k) => `<option value="${esc(k.code)}">${esc(k.en)}</option>`).join('')}</select></label><label>Billing<select name="billing_period">${vocab.billingPeriods.map((p) => `<option value="${esc(p.code)}">${esc(p.en)}</option>`).join('')}</select></label><label>Quantity<input name="qty" required inputmode="decimal" value="1"></label><label>Unit<input name="unit" required value="day"></label></div>
        <div class="studio-pair"><label>Unit price<input name="unit_price" required inputmode="decimal" placeholder="35000.00"></label><label>Discount (satang)<input name="discount_satang" inputmode="numeric" value="0"></label></div>
        <label>Section<input name="section" value="Implementation"></label>
        <label class="inline"><input type="checkbox" name="optional" value="1"> Optional — priced on document, excluded from firm totals</label>
        <div class="row-actions"><button type="submit" class="secondary">Add priced line</button></div></form></div>`;
    if (step === 3) {
      const firmTotal = state.lines.filter((l) => !l.optional).reduce((s, l) => s + lineSatang(l), 0);
      const optTotal = state.lines.filter((l) => l.optional).reduce((s, l) => s + lineSatang(l), 0);
      body = `<div class="studio-review"><dl><dt>Client</dt><dd>${esc(selectedClient()?.name ?? '—')}</dd><dt>Engagement</dt><dd>${esc(chosen()?.titleEn ?? '—')}</dd><dt>Included modules</dt><dd>${esc(String(state.sow?.modules.filter((m) => m.included).length ?? 0))}</dd><dt>Priced lines</dt><dd>${esc(String(state.lines.length))}</dd></dl>
      <p class="studio-total">Estimated line total <strong>${fmtSatang(firmTotal)}</strong></p>
      ${optTotal ? `<p class="meta">Optional lines (excluded from total): <span class="mono">${fmtSatang(optTotal)}</span></p>` : ''}
      <p class="meta">Tax and discounts are calculated by the quotation after creation. Review the resulting draft before issue.</p></div>`;
    }
    dialog.innerHTML = `<div class="studio-head"><span class="section-label">SMART QUOTATION · ${step + 1} OF 4</span><button type="button" class="secondary sm" data-close aria-label="Close guide">Close</button><h2>New SOW + quotation</h2><nav class="studio-steps" aria-label="Creation steps">${steps.map((s, i) => `<span${i === step ? ' aria-current="step"' : ''}>${i + 1} ${s}</span>`).join('')}</nav></div>${body}<div class="studio-actions"><button type="button" class="secondary" data-back${step === 0 ? ' hidden' : ''}>Back</button><button type="button" data-next>${step === 3 ? 'Create draft' : 'Continue'}</button></div>`;
    if (step === 1 && state.sow) mountSowEditor(dialog.querySelector('[data-sow-editor]'), state.sow);
  }
  launch.addEventListener('click', async () => {
    try {
      const [tplRes, catRes] = await Promise.all([
        api('GET', '/sow-templates'),
        api('GET', '/catalog?active=1').catch(() => ({ items: [] })),
      ]);
      templates = tplRes.templates ?? [];
      catalogItems = catRes.items ?? [];
      fresh();
      dialog.showModal();
    } catch (e) { toast(e.message, 'error'); }
  });

  dialog.addEventListener('change', (e) => {
    if (e.target.name !== 'catalog_pick') return;
    const item = catalogItems.find((i) => String(i.id) === e.target.value);
    const form = e.target.closest('form');
    if (!item || !form) return;
    const set = (n, v) => { const f = form.querySelector(`[name="${n}"]`); if (f) f.value = v; };
    set('kind', item.kind);
    set('billing_period', item.billing_period ?? 'once');
    set('unit', item.unit ?? 'day');
    set('unit_price', satangToPrice(item.unit_satang));
    set('section', item.section || 'Implementation');
    set('description_en', item.name_en ?? '');
    set('description_th', item.name_th ?? '');
  });

  dialog.addEventListener('submit', (e) => {
    if (!e.target.matches('[data-add-line]')) return;
    e.preventDefault();
    const d = new FormData(e.target);
    const qty = String(d.get('qty')).trim(), price = String(d.get('unit_price')).trim();
    const discountSatang = Number(d.get('discount_satang') || 0);
    if (!/^[0-9]{1,6}(\.[0-9]{1,3})?$/.test(qty) || Number(qty) <= 0) return toast('Quantity must be a positive decimal with up to 3 places', 'error');
    if (!/^[0-9]{1,10}(\.[0-9]{1,2})?$/.test(price)) return toast('Enter an explicit price with up to 2 places', 'error');
    if (!Number.isSafeInteger(discountSatang) || discountSatang < 0) return toast('Discount must be a non-negative integer in satang', 'error');
    state.lines.push({
      kind: String(d.get('kind')),
      description_en: String(d.get('description_en')).trim(),
      description_th: String(d.get('description_th') ?? '').trim(),
      qty,
      unit: String(d.get('unit')).trim(),
      unit_price: price,
      billing_period: String(d.get('billing_period')),
      section: String(d.get('section')).trim(),
      optional: d.get('optional') === '1',
      discount_satang: discountSatang,
    });
    render();
  });
  dialog.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.hasAttribute('data-close')) return dialog.close();
    if (btn.dataset.moveWizardLine) {
      const idx = Number(btn.dataset.lineIndex);
      const target = idx + (btn.dataset.moveWizardLine === 'up' ? -1 : 1);
      if (idx >= 0 && target >= 0 && target < state.lines.length) {
        [state.lines[idx], state.lines[target]] = [state.lines[target], state.lines[idx]];
        render();
      }
      return;
    }
    if (btn.dataset.removeLine !== undefined) { state.lines.splice(Number(btn.dataset.removeLine), 1); return render(); }
    if (btn.hasAttribute('data-back')) { if (step === 1) gatherBasics(); step = Math.max(0, step - 1); return render(); }
    if (!btn.hasAttribute('data-next')) return;
    if (step === 0) {
      gatherBasics();
      if (!state.client_id || !state.template || !state.sow) return toast('Choose a client and an engagement', 'error');
    }
    if (step === 2 && !state.lines.length) return toast('Add at least one priced line', 'error');
    if (step < 3) { step++; return render(); }
    await withBusy(btn, async () => {
      try {
        const { quotation } = await api('POST', '/quotations', { client_id: Number(state.client_id), template: state.template,
          sow: state.sow, lang: state.lang, issue_date: state.issue_date, notes: state.notes, lines: state.lines });
        dialog.close();
        toast(`Created draft ${quotation.number}`);
        const wb = getWorkbench();
        await wb.reloadAll();
        wb.select(quotation.id);
      } catch (err) { toast(err.message, 'error'); }
    });
  });
  return { refreshClients: () => { if (dialog.open && step === 0) { gatherBasics(); render(); } } };
}
