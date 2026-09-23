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
  let step = 0;
  let state = {};
  const steps = ['Engagement', 'Scope', 'Pricing', 'Review'];
  const chosen = () => templates.find((t) => t.code === state.template);
  const selectedClient = () => getClients().find((c) => String(c.id) === String(state.client_id));
  const money = (line) => {
    const qty = Number(line.qty);
    const price = Number(line.unit_price);
    return fmtSatang(Math.round(qty * price * 100));
  };
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
    let body = '';
    if (step === 0) body = `<form data-basics class="studio-fields"><label>Client<select name="client_id" required><option value="">Choose a client…</option>${clientOptions}</select></label>
      <label>Engagement<select name="template" required><option value="">Choose an engagement…</option>${engagementOptions}</select></label>
      <div class="studio-pair"><label>Language<select name="lang"><option value="en"${state.lang === 'en' ? ' selected' : ''}>English</option><option value="th"${state.lang === 'th' ? ' selected' : ''}>ไทย</option></select></label><label>Issue date<input type="date" name="issue_date" value="${esc(state.issue_date)}"></label></div>
      <label>Internal notes<textarea name="notes" rows="3">${esc(state.notes)}</textarea></label></form>`;
    if (step === 1) body = state.sow ? `<div class="studio-fields"><label>Scope summary (EN)<textarea data-summary rows="2">${esc(state.sow.summary.en)}</textarea></label>
      <p class="meta">Select only the modules this engagement will deliver. Everything else stays outside the stated scope.</p>
      <div class="studio-modules">${state.sow.modules.map((m, i) => `<label class="studio-module"><input type="checkbox" data-module="${i}"${m.included ? ' checked' : ''}><span><strong>${esc(m.titleEn)}</strong><small>${esc(m.items.map((x) => x.en).join(' · '))}</small></span></label>`).join('')}</div></div>` : '<p class="empty">Choose an engagement first.</p>';
    if (step === 2) body = `<div class="studio-fields"><p class="meta">Each price is explicit. The guide will never invent a price.</p>
      <div class="studio-lines">${state.lines.length ? state.lines.map((l, i) => `<div class="studio-line"><span><strong>${esc(l.description_en)}</strong><small>${esc(l.qty)} ${esc(l.unit)} × ${esc(l.unit_price)} · ${esc(l.billing_period)}</small></span><b>${esc(money(l))}</b><button type="button" class="secondary sm" data-remove-line="${i}">Remove</button></div>`).join('') : '<div class="empty">No priced lines yet.</div>'}</div>
      <form data-add-line class="studio-price-form"><div class="studio-pair"><label>Description (EN)<input name="description_en" required maxlength="1000" placeholder="Implementation and validation"></label><label>Type<select name="kind">${vocab.kinds.map((k) => `<option value="${esc(k.code)}">${esc(k.en)}</option>`).join('')}</select></label></div>
      <div class="studio-price-grid"><label>Quantity<input name="qty" required inputmode="decimal" value="1"></label><label>Unit<input name="unit" required value="day"></label><label>Unit price<input name="unit_price" required inputmode="decimal" placeholder="35000.00"></label><label>Billing<select name="billing_period">${vocab.billingPeriods.map((p) => `<option value="${esc(p.code)}">${esc(p.en)}</option>`).join('')}</select></label></div>
      <label>Section<input name="section" value="Implementation"></label><div class="row-actions"><button type="submit" class="secondary">Add priced line</button></div></form></div>`;
    if (step === 3) body = `<div class="studio-review"><dl><dt>Client</dt><dd>${esc(selectedClient()?.name ?? '—')}</dd><dt>Engagement</dt><dd>${esc(chosen()?.titleEn ?? '—')}</dd><dt>Included modules</dt><dd>${esc(String(state.sow?.modules.filter((m) => m.included).length ?? 0))}</dd><dt>Priced lines</dt><dd>${esc(String(state.lines.length))}</dd></dl>
      <p class="studio-total">Estimated line total <strong>${fmtSatang(state.lines.reduce((s, l) => s + Math.round(Number(l.qty) * Number(l.unit_price) * 100), 0))}</strong></p><p class="meta">Tax and discounts are calculated by the quotation after creation. Review the resulting draft before issue.</p></div>`;
    dialog.innerHTML = `<div class="studio-head"><span class="section-label">SMART QUOTATION · ${step + 1} OF 4</span><button type="button" class="secondary sm" data-close aria-label="Close guide">Close</button><h2>New SOW + quotation</h2><nav class="studio-steps" aria-label="Creation steps">${steps.map((s, i) => `<span${i === step ? ' aria-current="step"' : ''}>${i + 1} ${s}</span>`).join('')}</nav></div>${body}<div class="studio-actions"><button type="button" class="secondary" data-back${step === 0 ? ' hidden' : ''}>Back</button><button type="button" data-next>${step === 3 ? 'Create draft' : 'Continue'}</button></div>`;
  }
  launch.addEventListener('click', async () => {
    try { templates = (await api('GET', '/sow-templates')).templates ?? []; fresh(); dialog.showModal(); }
    catch (e) { toast(e.message, 'error'); }
  });
  dialog.addEventListener('input', (e) => {
    if (e.target.matches('[data-summary]') && state.sow) state.sow.summary.en = e.target.value;
  });
  dialog.addEventListener('change', (e) => {
    if (e.target.matches('[data-module]') && state.sow) state.sow.modules[Number(e.target.dataset.module)].included = e.target.checked;
  });
  dialog.addEventListener('submit', (e) => {
    if (!e.target.matches('[data-add-line]')) return;
    e.preventDefault();
    const d = new FormData(e.target);
    const qty = String(d.get('qty')).trim(), price = String(d.get('unit_price')).trim();
    if (!/^[0-9]{1,6}(\.[0-9]{1,3})?$/.test(qty) || Number(qty) <= 0) return toast('Quantity must be a positive decimal with up to 3 places', 'error');
    if (!/^[0-9]{1,10}(\.[0-9]{1,2})?$/.test(price)) return toast('Enter an explicit price with up to 2 places', 'error');
    state.lines.push({ kind: String(d.get('kind')), description_en: String(d.get('description_en')).trim(), description_th: '', qty,
      unit: String(d.get('unit')).trim(), unit_price: price, billing_period: String(d.get('billing_period')),
      section: String(d.get('section')).trim(), optional: false, discount_satang: 0 });
    render();
  });
  dialog.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.hasAttribute('data-close')) return dialog.close();
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
