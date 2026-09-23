// Shared structured editor for the existing validateSow contract.
import { esc } from './app.js';

export function mountSowEditor(container, sow, { onChange = () => {}, readOnly = false } = {}) {
  container._sowEditorAbort?.abort();
  const controller = new AbortController();
  container._sowEditorAbort = controller;
  const changed = () => {
    const json = container.querySelector('[data-json]');
    if (json && document.activeElement !== json) json.value = JSON.stringify(sow, null, 2);
    onChange(sow);
  };
  const pairRow = (pair, kind, index) => `<div class="sow-text-row">
    <label>English<textarea rows="2" data-kind="${kind}" data-index="${index}" data-lang="en">${esc(pair.en)}</textarea></label>
    <label>ไทย<textarea rows="2" data-kind="${kind}" data-index="${index}" data-lang="th">${esc(pair.th ?? '')}</textarea></label>
    <button type="button" class="quiet sm" data-action="remove-pair" data-kind="${kind}" data-index="${index}">Remove</button>
  </div>`;
  const uniqueCode = () => {
    const used = new Set(sow.modules.map((module) => module.code));
    let n = 1;
    while (used.has(`m${n}`)) n++;
    return `m${n}`;
  };
  function render() {
    container.classList.add('structured-sow');
    container.innerHTML = `<label>Scope summary (EN)<textarea rows="3" data-summary="en">${esc(sow.summary.en)}</textarea></label>
      <label>สรุปขอบเขตงาน (TH)<textarea rows="3" data-summary="th">${esc(sow.summary.th ?? '')}</textarea></label>
      <div class="toolbar"><h3>Work modules</h3><button type="button" class="secondary sm" data-action="add-module">Add module</button></div>
      <div class="sow-work-modules">${sow.modules.map((module, index) => `<details class="sow-work-module"${module.included ? ' open' : ''}>
        <summary><input type="checkbox" data-included="${index}"${module.included ? ' checked' : ''} aria-label="Include ${esc(module.titleEn)}"> <strong>${esc(module.titleEn || 'New module')}</strong> <span class="meta">${module.items.length} activities</span></summary>
        <div class="sow-work-body"><div class="studio-pair"><label>Module title (EN)<input data-module="${index}" data-field="titleEn" value="${esc(module.titleEn)}"></label>
        <label>ชื่อหมวดงาน (TH)<input data-module="${index}" data-field="titleTh" value="${esc(module.titleTh ?? '')}"></label></div>
        <div class="toolbar"><h4>Activities and deliverables</h4><button type="button" class="secondary sm" data-action="add-item" data-module="${index}">Add activity</button></div>
        ${module.items.map((pair, item) => `<div class="sow-text-row">
          <label>English<textarea rows="2" data-module="${index}" data-item="${item}" data-lang="en">${esc(pair.en)}</textarea></label>
          <label>ไทย<textarea rows="2" data-module="${index}" data-item="${item}" data-lang="th">${esc(pair.th ?? '')}</textarea></label>
          <div class="row-actions tight"><button type="button" class="quiet sm" data-action="up-item" data-module="${index}" data-item="${item}"${item === 0 ? ' disabled' : ''}>↑</button>
          <button type="button" class="quiet sm" data-action="down-item" data-module="${index}" data-item="${item}"${item === module.items.length - 1 ? ' disabled' : ''}>↓</button>
          <button type="button" class="quiet sm" data-action="remove-item" data-module="${index}" data-item="${item}">Remove</button></div></div>`).join('')}
        <div class="row-actions tight"><button type="button" class="quiet sm" data-action="up-module" data-module="${index}"${index === 0 ? ' disabled' : ''}>Move up</button>
        <button type="button" class="quiet sm" data-action="down-module" data-module="${index}"${index === sow.modules.length - 1 ? ' disabled' : ''}>Move down</button>
        <button type="button" class="danger sm" data-action="remove-module" data-module="${index}">Remove module</button></div></div></details>`).join('')}</div>
      ${['assumptions', 'exclusions'].map((kind) => `<section class="sow-pairs"><div class="toolbar"><h3>${kind === 'assumptions' ? 'Assumptions' : 'Out of scope'}</h3><button type="button" class="secondary sm" data-action="add-pair" data-kind="${kind}">Add ${kind === 'assumptions' ? 'assumption' : 'exclusion'}</button></div>
      ${sow[kind].map((pair, index) => pairRow(pair, kind, index)).join('')}</section>`).join('')}
      <details class="sow-advanced"><summary>Advanced JSON</summary><p class="meta">Use the same SOW schema for model generated text. Prices belong to quotation lines.</p>
      <textarea data-json class="mono" rows="10" spellcheck="false">${esc(JSON.stringify(sow, null, 2))}</textarea>
      <button type="button" class="secondary sm" data-action="apply-json">Apply JSON</button></details>`;
    if (readOnly) container.querySelectorAll('input,textarea,button').forEach((field) => { field.disabled = true; });
  }
  container.addEventListener('input', (event) => {
    const field = event.target;
    if (field.dataset.summary) sow.summary[field.dataset.summary] = field.value;
    else if (field.dataset.item !== undefined) sow.modules[Number(field.dataset.module)].items[Number(field.dataset.item)][field.dataset.lang] = field.value;
    else if (field.dataset.kind && field.dataset.index !== undefined) sow[field.dataset.kind][Number(field.dataset.index)][field.dataset.lang] = field.value;
    else if (field.dataset.field) sow.modules[Number(field.dataset.module)][field.dataset.field] = field.value;
    else return;
    changed();
  });
  container.addEventListener('change', (event) => {
    if (event.target.dataset.included === undefined) return;
    sow.modules[Number(event.target.dataset.included)].included = event.target.checked;
    changed();
  });
  container.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || readOnly) return;
    const action = button.dataset.action;
    const moduleIndex = Number(button.dataset.module);
    const itemIndex = Number(button.dataset.item);
    const kind = button.dataset.kind;
    const pairIndex = Number(button.dataset.index);
    if (action === 'apply-json') {
      try {
        const value = JSON.parse(container.querySelector('[data-json]').value);
        if (value.version !== 1 || !Array.isArray(value.modules) || !Array.isArray(value.assumptions) || !Array.isArray(value.exclusions)) throw Error('JSON must be a SOW object');
        Object.assign(sow, value);
      } catch (error) { window.alert(`Invalid SOW JSON: ${error.message}`); return; }
    } else if (action === 'add-module') sow.modules.push({ code: uniqueCode(), titleEn: 'New module', titleTh: '', included: true, items: [{ en: '', th: '' }] });
    else if (action === 'remove-module') sow.modules.splice(moduleIndex, 1);
    else if (action === 'up-module' && moduleIndex > 0) [sow.modules[moduleIndex - 1], sow.modules[moduleIndex]] = [sow.modules[moduleIndex], sow.modules[moduleIndex - 1]];
    else if (action === 'down-module' && moduleIndex < sow.modules.length - 1) [sow.modules[moduleIndex + 1], sow.modules[moduleIndex]] = [sow.modules[moduleIndex], sow.modules[moduleIndex + 1]];
    else if (action === 'add-item') sow.modules[moduleIndex].items.push({ en: '', th: '' });
    else if (action === 'remove-item') sow.modules[moduleIndex].items.splice(itemIndex, 1);
    else if (action === 'up-item' && itemIndex > 0) {
      const items = sow.modules[moduleIndex].items;
      [items[itemIndex - 1], items[itemIndex]] = [items[itemIndex], items[itemIndex - 1]];
    } else if (action === 'down-item' && itemIndex < sow.modules[moduleIndex].items.length - 1) {
      const items = sow.modules[moduleIndex].items;
      [items[itemIndex + 1], items[itemIndex]] = [items[itemIndex], items[itemIndex + 1]];
    } else if (action === 'add-pair') sow[kind].push({ en: '', th: '' });
    else if (action === 'remove-pair') sow[kind].splice(pairIndex, 1);
    else return;
    changed();
    render();
  });
  render();
  return { render };
}
