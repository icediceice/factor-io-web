// quotes/ui/screens/quotations.js — the quotation Workbench.
//
// index.html and quote.html both mount this module. index.html opens it with
// nothing selected; quote.html?id=N opens it with that quotation selected, so
// every link and bookmark the previous build handed out still resolves.

import {
  api, fmtSatang, el, esc, toast, statusChip, confirmAction, withBusy,
} from '../app.js';
import { mountWorkbench } from '../workbench.js';
import { mountSmartQuote } from './smart-quote.js';

/* ------------------------------------------------------------ vocabulary -- */

// The line vocabulary is operator-editable (the line.kinds setting), so the
// form asks the server for it instead of shipping its own copy. The fallback is
// the pair that existed before the vocabulary opened up: a settings or network
// fault degrades the form to service|hardware rather than an empty select.
const FALLBACK_KINDS = [{ code: 'service', en: 'Service' }, { code: 'hardware', en: 'Hardware' }];
const FALLBACK_PERIODS = [
  { code: 'once', en: 'One-time' }, { code: 'monthly', en: 'Monthly' },
  { code: 'quarterly', en: 'Quarterly' }, { code: 'yearly', en: 'Yearly' },
];
const vocab = { kinds: FALLBACK_KINDS, billingPeriods: FALLBACK_PERIODS };

const opts = (list, sel) => list
  .map((k) => `<option value="${esc(k.code)}"${k.code === sel ? ' selected' : ''}>${esc(k.en ?? k.code)}</option>`)
  .join('');

// The statuses in which the server will accept a change — quote.mjs
// EDITABLE_STATUSES. A mismatch degrades safely: the server is the authority
// and refuses anything this list wrongly allows.
const EDITABLE = ['draft', 'issued', 'proposed'];

// Only the moves the state machine actually allows (quote.mjs TRANSITIONS), so
// the UI can never offer a button the server will refuse. 'cancelled' is here
// on every open state because it is the NON-DESTRUCTIVE way to retire a
// quotation — delete throws away the revision snapshots, cancel keeps them.
const MOVES = {
  issued: [['proposed', 'Mark proposed'], ['accepted', 'Accept'], ['declined', 'Decline'], ['cancelled', 'Cancel']],
  proposed: [['accepted', 'Accept'], ['declined', 'Decline'], ['cancelled', 'Cancel']],
  accepted: [['cancelled', 'Cancel']],
  declined: [['superseded', 'Mark superseded']],
  draft: [['cancelled', 'Cancel']],
  invoiced: [['cancelled', 'Cancel']],
};

const periodLabel = (code) => (code && code !== 'once' ? `/${code.replace(/ly$/, '')}` : 'once');
const satangToPrice = (n) => (Number(n || 0) / 100).toFixed(2);

let clients = [];
let catalog = [];
const clientName = (id) => clients.find((c) => c.id === id)?.name ?? `client #${id}`;

/* ------------------------------------------------------------------ boot -- */

export async function mount(main) {
  try {
    const v = await api('GET', '/line-kinds');
    if (Array.isArray(v.kinds) && v.kinds.length) vocab.kinds = v.kinds;
    if (Array.isArray(v.billing_periods) && v.billing_periods.length) vocab.billingPeriods = v.billing_periods;
  } catch { toast('Using the built-in type list — /line-kinds is unavailable', 'error'); }

  // A STRIP, not a card deck. These three figures were three full-height
  // bordered cards under an <h2>, which measured 396px of chrome before the
  // first quotation — past the 359px fold bar for a dense operator screen, so
  // the rail the operator actually came for started below the fold. The
  // numbers are real (/reports/pipeline) and they stay; the packaging goes.
  const statsCard = el(`<section aria-label="Position">
    <div id="stats" class="stat-row posbar"><div class="empty">Loading…</div></div>
  </section>`);
  main.append(statsCard);
  const wizard = mountSmartQuote(main, () => wbApi, () => clients, vocab);

  const wbApi = mountWorkbench(main, {
    noun: 'quotation',
    load: async () => {
      // One request for the whole list INCLUDING its totals. The previous build
      // fetched every quotation again, one at a time, to fill the amount column.
      const [{ quotations }, { clients: cs }] = await Promise.all([
        api('GET', '/quotations?include=totals'),
        api('GET', '/clients'),
      ]);
      clients = cs;
      return quotations;
    },
    rowOf: (q) => ({
      id: q.id,
      status: q.status,
      number: q.number,
      name: clientName(q.client_id),
      meta: `${q.status}${q.issue_date ? ` · ${q.issue_date}` : ''}${q.revision ? ` · Rev. ${q.revision}` : ''}`,
      amount: q.totals ? fmtSatang(q.totals.payableSatang, q.totals.currency) : '',
    }),
    matches: (q, needle) =>
      String(q.number).toLowerCase().includes(needle)
      || clientName(q.client_id).toLowerCase().includes(needle)
      || String(q.status).includes(needle),
    filters: [{
      name: 'status',
      label: 'Status',
      options: [
        ['', 'All statuses'], ['draft', 'Draft'], ['issued', 'Issued'], ['proposed', 'Proposed'],
        ['accepted', 'Accepted'], ['invoiced', 'Invoiced'], ['paid', 'Paid'],
        ['declined', 'Declined'], ['cancelled', 'Cancelled'], ['superseded', 'Superseded'],
      ],
    }],
    emptyHtml: '<div class="empty"><strong>No quotations yet</strong>Create the first one below.</div>',
    detailOf: (id, host) => renderQuote(id, host, () => wbApi.reloadList(), () => loadStats(statsCard)),
    onLoad: () => wizard.refreshClients(),
  });

  await wbApi.refresh();
  loadStats(statsCard);
}

async function loadStats(card) {
  try {
    const { report: r } = await api('GET', '/reports/pipeline');
    // Two numbers that are easy to conflate and must never share a weight:
    // pipeline is a FORECAST with no tax consequence; recognised income is what
    // has actually been invoiced and is what the Revenue Department cares about.
    card.querySelector('#stats').innerHTML = `
      <div class="stat lead">
        <div class="label">Recognised income</div>
        <div class="value">${fmtSatang(r.recognisedIncome.netSatang)}</div>
        <div class="note">${esc(String(r.recognisedIncome.invoiceCount))} invoice(s) · ${esc(r.recognisedIncome.basis)}</div>
      </div>
      <div class="stat">
        <div class="label">Outstanding receivable</div>
        <div class="value">${fmtSatang(r.outstandingReceivableSatang)}</div>
        <div class="note">issued invoices, still unpaid</div>
      </div>
      <div class="stat">
        <div class="label">Pipeline</div>
        <div class="value">${esc(String(r.pipeline.proposedCount))} / ${esc(String(r.pipeline.acceptedCount))}</div>
        <div class="note">proposed / accepted — ${esc(r.pipeline.note)}</div>
      </div>`;
  } catch (e) {
    card.querySelector('#stats').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* ---------------------------------------------------------------- detail -- */

async function renderQuote(id, host, reloadList, reloadStats) {
  let doc = await api('GET', `/quotations/${id}`);
  let revisions = [];
  // Advisory: a failed revisions read must not take the record down with it.
  try { revisions = (await api('GET', `/quotations/${id}/revisions`)).revisions ?? []; }
  catch { revisions = []; }
  if (!catalog.length) {
    try { catalog = (await api('GET', '/catalog?active=1')).items ?? []; } catch { catalog = []; }
  }

  // An issued quotation is editable but NOT edited by accident: the fields stay
  // locked behind an explicit Revise click. Reset whenever the record is
  // re-opened, so unlocking never outlives the visit.
  let revising = false;
  let editingLine = null;

  const kindLabel = (code) => doc.kindLabels?.[code] ?? code;

  async function refresh({ list = false } = {}) {
    doc = await api('GET', `/quotations/${id}`);
    try { revisions = (await api('GET', `/quotations/${id}/revisions`)).revisions ?? []; }
    catch { revisions = []; }
    draw();
    if (list) { await reloadList(); await reloadStats(); }
  }

  const run = async (btn, fn, okMsg) => withBusy(btn, async () => {
    try { await fn(); if (okMsg) toast(okMsg); }
    catch (e) { toast(e.message, 'error'); }
  });

  function draw() {
    const q = doc.quotation;
    const editable = EDITABLE.includes(q.status);
    const unlocked = q.status === 'draft' || revising;
    const stale = !!q.revisionStale;
    const nextRev = (q.revision || 0) + 1;
    // The server refuses the PDF of an issued or proposed quotation that no
    // longer matches its snapshot, so the link is not offered as though it
    // would work — the operator is pointed at the re-issue that fixes it.
    const pdfBlocked = stale && editable && q.status !== 'draft';

    host.innerHTML = '';

    /* ---- header ---- */
    const head = el(`<section class="card">
      <div class="toolbar">
        <h2>
          <span class="mono">${esc(q.number)}</span> ${statusChip(q.status)}
          ${q.revision >= 2 ? `<span class="mono muted">Rev. ${q.revision}</span>` : ''}
        </h2>
        <div class="row-actions tight">
          ${q.status === 'draft' ? '<button data-act="issue">Issue</button>' : ''}
          ${editable && q.status !== 'draft' && !revising ? '<button class="secondary" data-act="revise">Revise</button>' : ''}
          ${q.status !== 'draft' && revising ? '<button class="quiet" data-act="lock">Done editing</button>' : ''}
          ${stale && editable ? `<button data-act="reissue">Re-issue as Rev. ${nextRev}</button>` : ''}
          ${pdfBlocked
            ? '<span class="meta">PDF available after re-issue</span>'
            : `<a class="button secondary" href="/api/quotations/${q.id}/pdf?lang=en" target="_blank" rel="noopener">PDF EN</a>
               <a class="button secondary" href="/api/quotations/${q.id}/pdf?lang=th" target="_blank" rel="noopener">PDF ไทย</a>`}
          ${(() => {
            // Exactly one primary per screen: the natural FORWARD move for this
            // status — Mark proposed on an issued quote, Accept on a proposed
            // one. Everything else is secondary, and retiring moves are
            // destructive-styled. With every move rendered 'secondary' the row
            // had no focal point at all; with the PDF links wrongly filled it
            // had two. A retiring move is NEVER promoted to primary, so a
            // status whose only move is Cancel simply has no primary here
            // (a draft's primary is its Issue button).
            const moves = MOVES[q.status] ?? [];
            const retiring = (s) => s === 'cancelled' || s === 'declined';
            const lead = moves.find(([s]) => !retiring(s))?.[0];
            return moves.map(([s, label]) => {
              const cls = retiring(s) ? 'danger' : (s === lead ? '' : 'secondary');
              return `<button${cls ? ` class="${cls}"` : ''} data-move="${s}">${esc(label)}</button>`;
            }).join('');
          })()}
          ${q.status === 'accepted' ? '<a class="button quiet" href="invoices.html">Raise invoice</a>' : ''}
          <button class="danger" data-act="delete">Delete</button>
        </div>
      </div>
      ${stale ? `<div class="banner" data-tone="warn">
        Edited since <strong>Rev. ${q.revision}</strong>. Re-issue to record the correction as Rev. ${nextRev} —
        until then this quotation does not match any stored revision and its PDF is unavailable.
      </div>` : ''}
      <dl class="kv" data-kv></dl>
    </section>`);
    head.querySelector('[data-kv]').innerHTML = headerFields(q, unlocked);
    host.append(head);

    /* ---- lines, THEN totals ---- */
    // Totals used to come first, which read backwards — a grand total above
    // the lines it is computed from — and left a wide empty gulf beside the
    // right-aligned totals block in a full-width pane. Lines first fills that
    // width with the thing being edited and puts the figure where the eye
    // already expects it: under the rows, like the PDF this screen produces.
    host.append(linesCard(unlocked, editable, kindLabel));
    host.append(totalsCard());

    /* ---- revisions ---- */
    host.append(revisionsCard());

    bind(head);
  }

  function headerFields(q, unlocked) {
    const row = (dt, dd) => `<dt>${dt}</dt><dd>${dd}</dd>`;
    if (!unlocked) {
      return [
        row('Client', esc(doc.client?.name ?? '—')),
        row('Language / currency', `${esc(q.lang)} · ${esc(q.currency)}${q.fxRate ? ` (1 ${esc(q.fxBase || 'USD')} = ${esc(q.fxRate)} THB)` : ''}`),
        row('Issue date', `<span class="mono">${esc(q.issueDate)}</span>`),
        row('Valid until', `<span class="mono">${esc(q.validUntil)}</span>`),
        row('Revision', q.revision
          ? `Rev. ${q.revision}${q.revisionStale ? ' <span class="muted">— edited since</span>' : ''}`
          : '<span class="muted">not issued yet</span>'),
        row('Contract term', q.termMonths ? `${q.termMonths} months` : '<span class="muted">not stated</span>'),
        q.notes ? row('Notes', esc(q.notes)) : '',
      ].join('');
    }
    // Everything PUT /quotations/:id accepts is offered. The previous build
    // exposed term_months alone, so a quotation raised against the wrong client
    // or the wrong date could not be corrected from the UI at all.
    return `<dt>Details</dt><dd>
      <form data-form="header">
        <div class="grid">
          <label>Client
            <select name="client_id">${clients.map((c) =>
              `<option value="${esc(c.id)}"${c.id === doc.client?.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
          </label>
          <label>Issue date <input name="issue_date" type="date" value="${esc(q.issueDate)}"></label>
          <label>Language
            <select name="lang">
              <option value="en"${q.lang === 'en' ? ' selected' : ''}>English</option>
              <option value="th"${q.lang === 'th' ? ' selected' : ''}>ไทย</option>
            </select>
          </label>
          <label>Currency <input name="currency" value="${esc(q.currency)}" class="mono"></label>
          <label>Contract term
            <input name="term_months" value="${esc(String(q.termMonths ?? 0))}" inputmode="numeric">
            <span class="hint">Months. Extends recurring lines into a contract total; 0 = none stated.</span>
          </label>
        </div>
        <label>Notes <textarea name="notes" rows="2">${esc(q.notes ?? '')}</textarea></label>
        <div class="row-actions tight"><button type="submit" class="secondary">Save details</button>
          <span class="meta">Valid until ${esc(q.validUntil)} · ${q.revision ? `Rev. ${q.revision}` : 'not issued'}</span></div>
      </form>
    </dd>`;
  }

  function totalsCard() {
    const t = doc.totals;
    // The split, the contract total and the options line each appear only when
    // they carry a figure, so a plain one-off quotation shows the totals block
    // it has always shown.
    const split = t.hasRecurring ? [
      t.oneTimeSatang ? `<tr class="memo"><td class="lbl">One-time</td><td class="num">${fmtSatang(t.oneTimeSatang)}</td></tr>` : '',
      ...['monthly', 'quarterly', 'yearly']
        .filter((p) => t.recurringSatang?.[p])
        .map((p) => `<tr class="memo"><td class="lbl">Recurring ${p}</td><td class="num">${fmtSatang(t.recurringSatang[p])}</td></tr>`),
    ].filter(Boolean).join('') : '';
    return el(`<section class="card"><h2>Totals</h2><table class="totals">
      ${split}
      <tr class="memo"><td class="lbl">Subtotal</td><td class="num">${fmtSatang(t.subtotalSatang)}</td></tr>
      ${t.discountSatang ? `<tr class="memo"><td class="lbl">Discount</td><td class="num">−${fmtSatang(t.discountSatang)}</td></tr>` : ''}
      <tr><td class="lbl">Net</td><td class="num">${fmtSatang(t.netSatang)}</td></tr>
      <tr><td class="lbl">VAT ${esc(String(t.vatRate))}%</td><td class="num">${fmtSatang(t.vatSatang)}</td></tr>
      <tr class="grand"><td class="lbl">Grand total</td><td class="num">${fmtSatang(t.grandSatang)}</td></tr>
      ${t.whtSatang ? `<tr${t.whtMode === 'deduct' ? '' : ' class="memo"'}><td class="lbl">WHT ${esc(String(t.whtRate))}% (${esc(t.whtMode)})</td><td class="num">${t.whtMode === 'deduct' ? '−' : ''}${fmtSatang(t.whtSatang)}</td></tr>` : ''}
      <tr class="payable"><td class="lbl">Total payable</td><td class="num">${fmtSatang(t.payableSatang)}</td></tr>
      ${t.contractTotalSatang != null ? `<tr class="payable"><td class="lbl">Contract total (${esc(String(t.termMonths))} months)</td><td class="num">${fmtSatang(t.contractTotalSatang)}</td></tr>` : ''}
      ${t.optionalSatang ? `<tr class="memo"><td class="lbl">Options (not included)</td><td class="num">${fmtSatang(t.optionalSatang)}</td></tr>` : ''}
    </table></section>`);
  }

  function linesCard(unlocked, editable, kindLabel) {
    const note = !editable
      ? '<span class="muted">(final — this quotation can no longer be edited)</span>'
      : (!unlocked ? '<span class="muted">(issued — press Revise to correct)</span>' : '');

    const body = doc.lines.length
      ? `<div class="table-scroll"><table class="list"><thead><tr>
          <th>#</th><th>Description</th><th>Type</th><th>Billing</th><th>Section</th>
          <th class="num">Qty</th><th>Unit</th><th class="num">Unit price</th>
          <th class="num">Discount</th><th class="num">Subtotal</th><th></th>
        </tr></thead><tbody>
          ${doc.lines.map((l) => (String(l.id) === String(editingLine) && unlocked
            ? lineEditRow(l)
            : lineRow(l, unlocked, kindLabel))).join('')}
        </tbody></table></div>`
      : '<div class="empty"><strong>No lines yet</strong>A quotation cannot be issued until it has at least one.</div>';

    const card = el(`<section class="card">
      <h2>Lines ${note}</h2>
      ${body}
      ${unlocked ? addLineForm() : ''}
    </section>`);
    return card;
  }

  function lineRow(l, unlocked, kindLabel) {
    return `<tr data-optional="${l.optional ? 'true' : 'false'}">
      <td class="mono">${l.optional ? '○' : esc(String(l.position))}</td>
      <td><strong>${esc(l.descriptionEn)}</strong>${l.optional ? ' <span class="mono">[OPTION]</span>' : ''}
        ${l.descriptionTh ? `<br><span class="muted">${esc(l.descriptionTh)}</span>` : ''}</td>
      <td>${esc(kindLabel(l.kind))}</td>
      <td class="mono">${esc(periodLabel(l.billingPeriod))}</td>
      <td>${esc(l.section) || '—'}</td>
      <td class="num mono">${esc(String(l.qty))}</td>
      <td>${esc(l.unit)}</td>
      <td class="num mono">${fmtSatang(l.unitSatang)}</td>
      <td class="num mono">${l.discountSatang ? `−${fmtSatang(l.discountSatang)}` : '—'}</td>
      <td class="num mono">${fmtSatang(l.subtotalSatang)}</td>
      <td class="actions">${unlocked
        ? `<button class="quiet sm" data-edit="${esc(l.id)}">Edit</button>
           <button class="quiet sm" data-del="${esc(l.id)}">Remove</button>`
        : ''}</td>
    </tr>`;
  }

  // The row becomes a form IN PLACE and keeps its columns, so the table does
  // not reflow while a correction is being typed.
  function lineEditRow(l) {
    return `<tr class="editing" data-line="${esc(l.id)}">
      <td class="mono">${esc(String(l.position))}</td>
      <td>
        <input name="description_en" value="${esc(l.descriptionEn)}" aria-label="Description (EN)" required>
        <input name="description_th" value="${esc(l.descriptionTh)}" aria-label="Description (TH)" placeholder="ภาษาไทย">
      </td>
      <td><select name="kind" aria-label="Type">${opts(vocab.kinds, l.kind)}</select></td>
      <td><select name="billing_period" aria-label="Billing">${opts(vocab.billingPeriods, l.billingPeriod)}</select></td>
      <td><input name="section" value="${esc(l.section)}" aria-label="Section"></td>
      <td><input name="qty" value="${esc(String(l.qty))}" inputmode="decimal" aria-label="Quantity"></td>
      <td><input name="unit" value="${esc(l.unit)}" aria-label="Unit"></td>
      <td><input name="unit_price" value="${satangToPrice(l.unitSatang)}" inputmode="decimal" aria-label="Unit price"></td>
      <td><input name="discount_satang" value="${esc(String(l.discountSatang))}" inputmode="numeric" aria-label="Discount in satang"></td>
      <td><label class="inline"><input type="checkbox" name="optional"${l.optional ? ' checked' : ''}> Option</label></td>
      <td class="actions">
        <button class="sm" data-save="${esc(l.id)}">Save</button>
        <button class="quiet sm" data-cancel-edit>Cancel</button>
      </td>
    </tr>`;
  }

  function addLineForm() {
    // The catalog is a price book that the previous build never once consulted:
    // every line was retyped by hand even when the item already existed.
    const picker = catalog.length ? `
      <label>Start from the catalog
        <select name="catalog_pick">
          <option value="">— blank line —</option>
          ${catalog.map((i) => `<option value="${esc(i.id)}">${esc(i.name_en)} · ${fmtSatang(i.unit_satang)}${i.sku ? ` · ${esc(i.sku)}` : ''}</option>`).join('')}
        </select>
        <span class="hint">Fills the fields below. Every value stays editable per quote.</span>
      </label>` : '';
    return `<form data-form="addLine">
      <p class="section-label">Add a line</p>
      ${picker}
      <div class="grid">
        <label>Type <select name="kind">${opts(vocab.kinds)}</select></label>
        <label>Billing <select name="billing_period">${opts(vocab.billingPeriods)}</select></label>
        <label>Quantity <input name="qty" required placeholder="0.5" inputmode="decimal"></label>
        <label>Unit <input name="unit" placeholder="auto"></label>
        <label>Unit price (THB) <input name="unit_price" required placeholder="35000.00" inputmode="decimal"></label>
        <label>Discount (satang) <input name="discount_satang" value="0" inputmode="numeric"></label>
        <label>Section <input name="section" placeholder="Hardware"></label>
      </div>
      <label>Description (EN) <input name="description_en" required></label>
      <label>Description (TH) <input name="description_th" placeholder="คำอธิบายภาษาไทย (ถ้ามี)"></label>
      <label class="inline"><input type="checkbox" name="optional" value="1"> Optional — priced, excluded from totals</label>
      <div class="row-actions"><button type="submit">Add line</button></div>
    </form>`;
  }

  function revisionsCard() {
    // The revision history IS the audit trail for a quotation corrected in
    // place: the number never changes, so this list is the only record of what
    // went out, when, and on whose authority.
    const rows = revisions.length
      ? `<div class="table-scroll"><table class="list"><thead><tr><th>Rev</th><th>Recorded</th><th>By</th><th></th></tr></thead><tbody>
        ${revisions.map((r) => `<tr>
          <td class="mono">${esc(String(r.rev))}</td>
          <td class="mono">${esc(r.created_at)} <span class="muted">UTC</span></td>
          <td>${esc(r.actor)}</td>
          <td class="actions"><a href="/api/quotations/${id}/revisions/${r.rev}" target="_blank" rel="noopener">snapshot</a></td>
        </tr>`).join('')}
      </tbody></table></div>`
      : '<div class="empty">Not issued yet — issuing writes Rev. 1.</div>';
    return el(`<section class="card"><h2>Revisions</h2>${rows}</section>`);
  }

  /* ---- events ---- */

  function bind(head) {
    head.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const q = doc.quotation;

      if (btn.dataset.act === 'issue') {
        return run(btn, async () => { await api('POST', `/quotations/${id}/issue`); await refresh({ list: true }); },
          'Issued — revision snapshot written');
      }
      if (btn.dataset.act === 'reissue') {
        return run(btn, async () => {
          await api('POST', `/quotations/${id}/issue`);
          revising = false;
          await refresh({ list: true });
          toast(`Re-issued — revision ${doc.quotation.revision} recorded`);
        });
      }
      // Revise and Done editing only move this page's lock. Nothing is sent:
      // the status does not change because the quotation is being corrected.
      if (btn.dataset.act === 'revise') {
        revising = true; draw();
        return toast('Editing unlocked — re-issue when the correction is done');
      }
      if (btn.dataset.act === 'lock') { revising = false; editingLine = null; return draw(); }

      if (btn.dataset.move) {
        const to = btn.dataset.move;
        if (to === 'cancelled' || to === 'declined') {
          const ok = await confirmAction({
            title: `${to === 'cancelled' ? 'Cancel' : 'Decline'} ${q.number}?`,
            body: to === 'cancelled'
              ? 'The quotation is retired but kept, with every revision snapshot intact. This is the non-destructive alternative to deleting it.'
              : 'Records that the customer refused this quotation. It can still be superseded by a replacement afterwards.',
            confirmLabel: to === 'cancelled' ? 'Cancel quotation' : 'Decline',
            tone: 'warn',
          });
          if (!ok) return;
        }
        return run(btn, async () => { await api('POST', `/quotations/${id}/status`, { status: to }); await refresh({ list: true }); },
          `Marked ${to}`);
      }

      if (btn.dataset.act === 'delete') {
        // Deleting is genuinely destructive here: quotation_revisions CASCADEs,
        // so the record of what the customer was sent goes with it. Say so, by
        // name and by count, and offer cancelling instead.
        const consequences = [
          `Quotation ${q.number} and all ${doc.lines.length} of its lines`,
          revisions.length
            ? `${revisions.length} revision snapshot${revisions.length === 1 ? '' : 's'} — the only record of what was sent to ${doc.client?.name ?? 'the client'}`
            : 'No revision snapshots exist yet — nothing has been issued',
        ];
        const ok = await confirmAction({
          title: `Delete ${q.number}?`,
          body: q.status === 'draft'
            ? 'This draft was never issued, so nothing has left the building.'
            : `This quotation reached "${q.status}". If you only want it out of the way, Cancel keeps the audit trail.`,
          consequences,
          confirmLabel: `Delete ${q.number}`,
        });
        if (!ok) return;
        return run(btn, async () => {
          const res = await api('DELETE', `/quotations/${id}`);
          toast(`Deleted ${res.number}${res.revisions_destroyed ? ` and ${res.revisions_destroyed} revision snapshot(s)` : ''}`);
          reloadStats();
          await reloadList();
        });
      }
    });

    head.addEventListener('submit', async (e) => {
      if (e.target.dataset.form !== 'header') return;
      e.preventDefault();
      const f = new FormData(e.target);
      const body = {
        client_id: Number(f.get('client_id')),
        issue_date: f.get('issue_date'),
        lang: f.get('lang'),
        currency: f.get('currency'),
        notes: f.get('notes'),
        term_months: Number(f.get('term_months') || 0),
      };
      await run(e.target.querySelector('button[type=submit]'), async () => {
        await api('PUT', `/quotations/${id}`, body);
        await refresh({ list: true });
      }, 'Details saved');
    });
  }

  // Line actions live on the host because linesCard is rebuilt on every draw.
  host.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.edit) { editingLine = btn.dataset.edit; return draw(); }
    if (btn.hasAttribute('data-cancel-edit')) { editingLine = null; return draw(); }

    if (btn.dataset.del) {
      const line = doc.lines.find((l) => String(l.id) === String(btn.dataset.del));
      const ok = await confirmAction({
        title: 'Remove this line?',
        body: line ? `“${line.descriptionEn}” — ${fmtSatang(line.subtotalSatang)}` : '',
        confirmLabel: 'Remove line',
      });
      if (!ok) return;
      return run(btn, async () => { await api('DELETE', `/quotations/${id}/lines/${btn.dataset.del}`); await refresh({ list: true }); },
        'Line removed');
    }

    if (btn.dataset.save) {
      const tr = btn.closest('tr');
      const val = (n) => tr.querySelector(`[name="${n}"]`);
      const body = {
        description_en: val('description_en').value,
        description_th: val('description_th').value,
        kind: val('kind').value,
        billing_period: val('billing_period').value,
        section: val('section').value,
        qty: val('qty').value,
        unit: val('unit').value,
        unit_price: val('unit_price').value,
        discount_satang: Number(val('discount_satang').value || 0),
        optional: val('optional').checked,
      };
      return run(btn, async () => {
        await api('PUT', `/quotations/${id}/lines/${btn.dataset.save}`, body);
        editingLine = null;
        await refresh({ list: true });
      }, 'Line updated');
    }
  });

  host.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editingLine) { editingLine = null; draw(); }
  });

  host.addEventListener('change', (e) => {
    if (e.target.name !== 'catalog_pick') return;
    const item = catalog.find((i) => String(i.id) === e.target.value);
    const form = e.target.closest('form');
    if (!item) return;
    const set = (n, v) => { const f = form.querySelector(`[name="${n}"]`); if (f) f.value = v; };
    set('kind', item.kind);
    set('billing_period', item.billing_period ?? 'once');
    set('unit', item.unit ?? '');
    set('unit_price', satangToPrice(item.unit_satang));
    set('section', item.section ?? '');
    set('description_en', item.name_en ?? '');
    set('description_th', item.name_th ?? '');
    if (!form.querySelector('[name=qty]').value) set('qty', '1');
    form.dataset.catalogId = item.id;
  });

  host.addEventListener('submit', async (e) => {
    if (e.target.dataset.form !== 'addLine') return;
    e.preventDefault();
    const form = e.target;
    const f = new FormData(form);
    const body = {
      kind: f.get('kind'),
      billing_period: f.get('billing_period'),
      description_en: f.get('description_en'),
      description_th: f.get('description_th'),
      qty: f.get('qty'),
      unit_price: f.get('unit_price'),
      discount_satang: Number(f.get('discount_satang') || 0),
      optional: f.get('optional') === '1',
    };
    if (f.get('unit')) body.unit = f.get('unit');
    if (f.get('section')) body.section = f.get('section');
    if (form.dataset.catalogId) body.catalog_id = Number(form.dataset.catalogId);
    await run(form.querySelector('button[type=submit]'), async () => {
      await api('POST', `/quotations/${id}/lines`, body);
      await refresh({ list: true });
    }, 'Line added');
  });

  draw();
}