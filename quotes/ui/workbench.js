// quotes/ui/workbench.js — the list-rail/detail shell shared by the quotation,
// client and invoice screens.
//
// WHY THIS EXISTS. The previous build put the list on one page and the record
// on another, with no way back except the browser button and no sense of what
// else was open. Every comparison ("is this the quote I sent them, or the
// other one?") meant a round trip. The rail keeps the list in view while a
// record is being worked.
//
// Selection is a REAL LINK (?id=N). Clicking it is intercepted and pushState'd
// so the detail swaps without a reload, but middle-click, copy-link and
// bookmarking all still behave, and every URL the old build handed out keeps
// resolving to the same record.

import { el, esc, announce } from './app.js';

/**
 * @param {Element} main        the container returned by renderShell
 * @param {object}  spec
 * @param {Function} spec.load      async () => item[]  — the full list
 * @param {Function} spec.rowOf     (item) => {id, status, number, name, meta, amount}
 * @param {Function} spec.detailOf  async (id, host) => void — renders into host
 * @param {Function} [spec.matches] (item, query) => boolean — search predicate
 * @param {Array}   [spec.filters]  [{name, label, options:[[value,label]]}]
 * @param {string}  [spec.emptyHtml]
 * @param {string}  [spec.noun]     'quotation' — used in counts and empty states
 * @param {Element} [spec.aside]    node appended under the rail (e.g. a New form)
 */
export function mountWorkbench(main, spec) {
  const noun = spec.noun ?? 'record';
  const filters = spec.filters ?? [];

  const wb = el(`<div class="wb">
    <div class="wb-rail">
      <div class="rail-head">
        <label class="sr-only" for="wb-q">Search ${esc(noun)}s</label>
        <input id="wb-q" type="search" placeholder="Search ${esc(noun)}s…" autocomplete="off">
        ${filters.length ? `<div class="filters">${filters.map((f) => `
          <label>${esc(f.label)}
            <select name="${esc(f.name)}">${f.options.map(([v, l]) =>
              `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>
          </label>`).join('')}</div>` : ''}
      </div>
      <div class="rail-count" data-count><span>Loading…</span></div>
      <div class="wb-list" data-list role="list"></div>
      <div class="rail-foot" data-aside hidden></div>
    </div>
    <div class="wb-detail" data-detail>
      <div class="empty">Loading…</div>
    </div>
  </div>`);
  main.append(wb);

  const listBox = wb.querySelector('[data-list]');
  const countBox = wb.querySelector('[data-count]');
  let detailBox = wb.querySelector('[data-detail]');
  const search = wb.querySelector('#wb-q');
  if (spec.aside) {
    const host = wb.querySelector('[data-aside]');
    host.hidden = false;
    host.append(spec.aside);
  }

  let items = [];
  let selected = new URLSearchParams(location.search).get('id');

  const filterValues = () => Object.fromEntries(
    filters.map((f) => [f.name, wb.querySelector(`select[name="${f.name}"]`).value]),
  );

  function visible() {
    const q = search.value.trim().toLowerCase();
    const vals = filterValues();
    return items.filter((it) => {
      for (const f of filters) {
        const want = vals[f.name];
        // `pick`, never `valueOf` — EVERY object inherits Object.prototype
        // .valueOf, so a `f.valueOf ? …` test is always true and would compare
        // against the filter object itself rather than the item's field.
        if (want && String((f.pick ? f.pick(it) : it[f.name]) ?? '') !== want) return false;
      }
      if (!q) return true;
      return spec.matches ? spec.matches(it, q) : true;
    });
  }

  function renderRail() {
    const shown = visible();
    countBox.innerHTML = `<span>${shown.length} of ${items.length} ${esc(noun)}${items.length === 1 ? '' : 's'}</span>`;
    if (!items.length) {
      listBox.innerHTML = spec.emptyHtml ?? `<div class="empty"><strong>No ${esc(noun)}s yet</strong></div>`;
      return;
    }
    if (!shown.length) {
      listBox.innerHTML = `<div class="empty"><strong>Nothing matches</strong>Clear the search or the filters to see all ${items.length}.</div>`;
      return;
    }
    listBox.innerHTML = shown.map((it) => {
      const r = spec.rowOf(it);
      const isSel = String(r.id) === String(selected);
      // title carries the full name, because .r-name ellipsises to one line to
      // keep the rail at its density floor.
      return `<a class="rail-item" role="listitem" href="?id=${encodeURIComponent(r.id)}"
        data-id="${esc(r.id)}" data-status="${esc(r.status ?? '')}"${isSel ? ' aria-current="true"' : ''}>
        <span class="r1">
          <span class="r-no mono">${esc(r.number ?? '')}</span>
          <span class="r-name" title="${esc(r.name ?? '')}">${esc(r.name ?? '')}</span>
        </span>
        <span class="r2">
          <span>${esc(r.meta ?? '')}</span>
          <span class="r-amt">${esc(r.amount ?? '')}</span>
        </span>
      </a>`;
    }).join('');
  }

  async function renderDetail() {
    wb.dataset.selected = selected ? 'true' : 'false';
    if (!selected) {
      detailBox.innerHTML = `<div class="empty"><strong>Nothing selected</strong>Pick a ${esc(noun)} from the list to work on it.</div>`;
      return;
    }
    detailBox.innerHTML = '<div class="empty">Loading…</div>';
    try {
      await spec.detailOf(selected, detailBox);
      // On a phone the rail is hidden once something is selected, so the way
      // back has to be on the record itself.
      const back = el('<button type="button" class="secondary sm back-to-list">← All ' + esc(noun) + 's</button>');
      back.addEventListener('click', () => select(null));
      detailBox.prepend(back);
    } catch (e) {
      detailBox.innerHTML = `<div class="empty"><strong>Could not open this ${esc(noun)}</strong>${esc(e.message)}</div>`;
    }
  }

  function select(id, { push = true } = {}) {
    selected = id == null ? null : String(id);
    if (push) {
      const url = selected ? `?id=${encodeURIComponent(selected)}` : location.pathname;
      history.pushState({ id: selected }, '', url);
    }
    renderRail();
    renderDetail();
    if (selected) detailBox.scrollIntoView({ block: 'nearest' });
  }

  listBox.addEventListener('click', (e) => {
    const a = e.target.closest('a.rail-item');
    // Let the browser handle every deliberate "open elsewhere" gesture.
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    select(a.dataset.id);
  });

  // Up/Down move through the rail without leaving the keyboard.
  listBox.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = [...listBox.querySelectorAll('a.rail-item')];
    const i = rows.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next) next.focus();
  });

  addEventListener('popstate', () => {
    selected = new URLSearchParams(location.search).get('id');
    renderRail();
    renderDetail();
  });

  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      renderRail();
      announce(`${visible().length} of ${items.length} ${noun}s shown`);
    }, 120);
  });
  for (const f of filters) {
    wb.querySelector(`select[name="${f.name}"]`).addEventListener('change', () => {
      renderRail();
      announce(`${visible().length} of ${items.length} ${noun}s shown`);
    });
  }

  async function refresh({ keepSelection = true } = {}) {
    items = await spec.load();
    if (!keepSelection) selected = null;
    // A record that has just been deleted must not leave the detail pane
    // showing a ghost.
    if (selected && !items.some((it) => String(spec.rowOf(it).id) === String(selected))) {
      selected = null;
      history.replaceState({}, '', location.pathname);
    }
    renderRail();
    await renderDetail();
  }

  return {
    refresh,
    select,
    /** Re-render only the open record — after an edit that did not change the list. */
    reloadDetail: renderDetail,
    /** Re-read the list and re-render both panes, keeping the open record. */
    reloadAll: () => refresh({ keepSelection: true }),
    get selectedId() { return selected; },
  };
}