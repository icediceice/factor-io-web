// quotes/ui/screens/settings.js — every business fact, as Stacked Sections.
//
// The previous screen labelled each field with its raw storage key —
// `company.name_th`, `wht.apply` — and offered one Save All button at the
// bottom of thirty inputs. The key is still shown, because it is what the CLI
// and the API use and you need it to script anything, but it is now secondary
// to a human label, and each group saves on its own so a typo in the bank
// details cannot be committed along with a VAT change you were sure about.

import { api, el, esc, toast, withBusy } from '../app.js';

// [key, label, hint]
const GROUPS = [
  ['company', 'Company', 'Printed in the header of every quotation and tax invoice.', [
    ['company.name', 'Company name (EN)', ''],
    ['company.name_th', 'ชื่อบริษัท (TH)', 'Used when the document language is Thai.'],
    ['company.address', 'Address (EN)', ''],
    ['company.address_th', 'ที่อยู่ (TH)', ''],
    ['company.tax_id', 'Tax ID', '13 digits. Appears on every tax invoice — a wrong digit invalidates the document.'],
    ['company.phone', 'Phone', ''],
    ['company.email', 'Email', ''],
    ['company.website', 'Website', ''],
    ['company.logo_path', 'Logo', 'Optional file:// or https:// URL for the PDF header.'],
  ]],
  ['tax', 'Tax', 'Rates applied to NEW documents. An invoice freezes its rates when issued, so changing these never moves a figure already filed.', [
    ['vat.rate_percent', 'VAT rate %', 'e.g. 7 or 7.5 — applied to the net (post-discount) amount.'],
    ['wht.rate_percent', 'Withholding rate %', 'e.g. 3 — calculated on net, pre-VAT.'],
    ['wht.apply', 'Withholding treatment', '"memo" shows it for information; "deduct" subtracts it from the payable total.'],
  ]],
  ['quotation', 'Quotation', 'Numbering and the standing terms printed at the foot of the document.', [
    ['quote.number_format', 'Number format', 'Tokens: {YYYY} {MM} {DD} {SEQ:n} — e.g. QT-{YYYY}{MM}-{SEQ:4}. Numbers are never reused.'],
    ['quote.validity_days', 'Validity (days)', 'How long a quotation stays valid after its issue date.'],
    ['quote.payment_terms_en', 'Payment terms (EN)', ''],
    ['quote.payment_terms_th', 'เงื่อนไขการชำระเงิน (TH)', ''],
    ['quote.terms_en', 'Terms & conditions (EN)', ''],
    ['quote.terms_th', 'ข้อกำหนดและเงื่อนไข (TH)', ''],
  ]],
  ['currency', 'Currency & FX', 'The default currency of a new quotation, and the rate used for its THB-equivalent line.', [
    ['currency.code', 'Currency code', 'e.g. THB'],
    ['currency.symbol', 'Symbol', 'e.g. ฿'],
    ['fx.base', 'FX base currency', 'e.g. USD'],
    ['fx.rate', 'FX rate', 'THB per 1 base unit, e.g. 36.50.'],
    ['fx.as_of', 'Rate as of', 'The date this rate was taken — printed beside the converted figure.'],
  ]],
  ['bank', 'Bank', 'Printed on the tax invoice so the customer can pay it.', [
    ['bank.name', 'Bank name (EN)', ''],
    ['bank.name_th', 'ชื่อธนาคาร (TH)', ''],
    ['bank.account_name', 'Account name', ''],
    ['bank.account_number', 'Account number', ''],
    ['bank.branch', 'Branch', ''],
    ['bank.swift', 'SWIFT / BIC', 'Needed only for payment from abroad.'],
  ]],
];

const LONG = new Set([
  'company.address', 'company.address_th',
  'quote.payment_terms_en', 'quote.payment_terms_th', 'quote.terms_en', 'quote.terms_th',
]);
const MONO = new Set([
  'company.tax_id', 'vat.rate_percent', 'wht.rate_percent', 'quote.number_format',
  'quote.validity_days', 'currency.code', 'fx.base', 'fx.rate', 'fx.as_of',
  'bank.account_number', 'bank.swift',
]);

export async function mount(main) {
  const stack = el(`<div class="stack">
    <nav class="snav" aria-label="Settings groups">
      ${GROUPS.map(([id, label], n) => `<a href="#${id}"${n === 0 ? ' aria-current="true"' : ''}>${esc(label)}</a>`).join('')}
    </nav>
    <div class="stack-body"></div>
  </div>`);
  main.append(stack);
  const body = stack.querySelector('.stack-body');

  const inputs = {};

  for (const [id, label, blurb, keys] of GROUPS) {
    const card = el(`<section class="card" id="${id}">
      <h2>${esc(label)}</h2>
      <p class="meta">${esc(blurb)}</p>
      <form data-group="${id}">
        <div class="grid">
          ${keys.map(([key, human, hint]) => `<label>
            ${esc(human)}
            ${LONG.has(key)
              ? `<textarea data-key="${esc(key)}" rows="3"></textarea>`
              : `<input data-key="${esc(key)}"${MONO.has(key) ? ' class="mono"' : ''}>`}
            ${hint ? `<span class="hint">${esc(hint)}</span>` : ''}
            <span class="hint mono">${esc(key)}</span>
          </label>`).join('')}
        </div>
        <div class="row-actions">
          <button type="submit" class="secondary">Save ${esc(label.toLowerCase())}</button>
        </div>
      </form>
    </section>`);
    for (const [key] of keys) inputs[key] = card.querySelector(`[data-key="${key}"]`);
    body.append(card);

    card.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = Object.fromEntries(keys.map(([k]) => [k, inputs[k].value]));
      await withBusy(e.target.querySelector('button[type=submit]'), async () => {
        try {
          await api('PUT', '/settings', { settings: values });
          toast(`${label} saved — new documents use these immediately`);
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  const sowEditor = el(`<section class="card" id="sow-templates"><h2>SOW engagement templates</h2>
    <p class="meta">Define reusable starting scopes for OS installation, OpenShift, NKP and Kubernetes. Optional modules stay excluded until selected in a quotation.</p>
    <form data-sow-templates><label>Template definitions (JSON)<textarea name="templates" class="mono" rows="18" spellcheck="false"></textarea></label>
      <div class="row-actions"><button type="submit" class="secondary">Save SOW templates</button></div></form></section>`);
  body.append(sowEditor);
  stack.querySelector('.snav').insertAdjacentHTML('beforeend', '<a href="#sow-templates">SOW templates</a>');
  try {
    const { templates } = await api('GET', '/sow-templates');
    sowEditor.querySelector('textarea').value = JSON.stringify(templates, null, 2);
  } catch (e) { toast(e.message, 'error'); }
  sowEditor.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let templates;
    try { templates = JSON.parse(e.target.querySelector('textarea[name="templates"]').value); }
    catch { return toast('Template JSON is invalid', 'error'); }
    await withBusy(e.target.querySelector('button[type="submit"]'), async () => {
      try { await api('PUT', '/sow-templates', { templates }); toast('SOW templates saved'); }
      catch (e) { toast(e.message, 'error'); }
    });
  });

  if ('IntersectionObserver' in window) {
    const links = [...stack.querySelectorAll('.snav a')];
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        for (const a of links) {
          if (a.hash === `#${e.target.id}`) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        }
      }
    }, { rootMargin: '-84px 0px -70% 0px' });
    for (const [id] of GROUPS) obs.observe(document.getElementById(id));
  }

  const { settings } = await api('GET', '/settings');
  for (const [k, input] of Object.entries(inputs)) input.value = settings[k] ?? '';
}