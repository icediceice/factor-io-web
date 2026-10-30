import { mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

const string = { type: 'string' };
const number = { type: 'integer' };
const boolean = { type: 'boolean' };
const decimal = { type: 'string', pattern: '^-?\\d+(\\.\\d+)?$' };
const object = { type: 'object' };
const array = { type: 'array' };
const props = {
  id: number, line_id: number, payment_id: number, client_id: number, quotation_id: number,
  revision: number, limit: number, offset: number, year: number, month: string, half: number,
  status: string, from: string, to: string, report: string, lang: string, confirm: string,
  name: string, name_en: string, name_th: string, address: string, address_th: string, tax_id: string,
  contact: string, email: string, phone: string, kind: string, sku: string, description: string,
  description_en: string, description_th: string, unit: string, qty: decimal, unit_price: decimal,
  amount: decimal, base: decimal, wht: decimal, discount_satang: number, billing_period: string,
  section: string, optional: boolean, active: boolean, catalog_id: number, line_ids: array,
  currency: string, notes: string, issue_date: string, fx_base: string, fx_rate: string, fx_as_of: string,
  term_months: number, template: string, sow: object, lines: array, draft: object, dry_run: boolean,
  include_optional_line_ids: array, paid_on: string, method: string, reference: string, note: string,
  cert_number: string, issued_on: string, pnd_form: string, rate_percent: string, payer_name: string,
  payer_tax_id: string, file_path: string, key: string, value: string,
};
const ops = {
  read: ['context','list','get','revisions','preview','deleted','clients','client','catalog','settings','invoices','invoice','payments','report','draft_export'],
  draft: ['create','update','set_sow','line_add','line_update','line_remove','reorder','draft_apply','clone','client_save','catalog_save'],
  quotation: ['issue','status','delete','restore'],
  invoice: ['create','issue','status','pay','payment_delete','wht','delete'],
  settings: ['set'], pdf: ['quotation','invoice'],
};
const fields = {
  read: 'id revision limit offset status client_id month year half from to report lang',
  draft: 'id line_id client_id lang currency notes issue_date fx_base fx_rate fx_as_of term_months template sow lines draft dry_run line_ids name name_th address address_th tax_id contact email phone kind sku name_en description unit qty unit_price discount_satang billing_period section optional active catalog_id description_en description_th',
  quotation: 'id status confirm',
  invoice: 'id quotation_id payment_id lang issue_date notes include_optional_line_ids status amount paid_on method reference note base wht cert_number issued_on pnd_form rate_percent payer_name payer_tax_id file_path confirm',
  settings: 'key value confirm', pdf: 'id lang',
};
export const TOOLS = Object.entries(ops).map(([name, values]) => ({
  name, title: `Quotes ${name}`, description: `Factor IO ${name} operations: ${values.join(', ')}.`,
  inputSchema: { type: 'object', properties: { op: { type: 'string', enum: values }, ...Object.fromEntries(fields[name].split(' ').map(k => [k, props[k]])) }, required: ['op'], additionalProperties: false },
  annotations: name === 'read' ? { readOnlyHint: true } : { destructiveHint: name !== 'pdf' },
}));
const pick = (a, names) => Object.fromEntries(names.split(' ').filter(k => a[k] !== undefined).map(k => [k, a[k]]));
function id(a, key = 'id') {
  const v = a[key];
  if (!Number.isSafeInteger(v) || v < 1) throw new Error(`${key} must be a positive integer`);
  return v;
}
function query(a, keys) {
  const p = new URLSearchParams();
  for (const k of keys.split(' ')) if (a[k] !== undefined && a[k] !== '') p.set(k, String(a[k]));
  return p.size ? `?${p}` : '';
}
function page(data, key, a) {
  const offset = a.offset ?? 0, limit = a.limit ?? 25;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('offset must be non-negative and limit must be 1..100');
  const all = data[key], end = offset + limit;
  return { ...data, [key]: all.slice(offset, end), truncated: end < all.length, next: end < all.length ? end : null };
}
function validate(name, a) {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool || !a || typeof a !== 'object' || Array.isArray(a) || !ops[name].includes(a.op)) throw new Error('unknown tool or operation');
  for (const [k,v] of Object.entries(a)) {
    const p = tool.inputSchema.properties[k];
    if (!p) throw new Error(`unexpected argument: ${k}`);
    if (p.type === 'integer' ? !Number.isSafeInteger(v) : p.type === 'array' ? !Array.isArray(v) : p.type === 'object' ? !v || typeof v !== 'object' || Array.isArray(v) : typeof v !== p.type) throw new Error(`${k} must be ${p.type}`);
    if (p.pattern && !new RegExp(p.pattern).test(v)) throw new Error(`${k} must be a decimal string`);
  }
}
async function confirm(call, a, type) {
  const doc = await call('GET', `/api/${type}/${id(a)}`);
  const record = doc[type === 'quotations' ? 'quotation' : 'invoice'];
  const expected = String(record.number || record.id);
  if (a.confirm !== expected) throw new Error(`confirmation required: confirm must equal ${expected}`);
}
export async function callTool(call, name, a = {}) {
  validate(name, a);
  const op = a.op;
  const get = path => call('GET', path);
  if (name === 'read') {
    if (op === 'context') {
      const [settings, templates, kinds, catalog] = await Promise.all([get('/api/settings'), get('/api/sow-templates'), get('/api/line-kinds'), get('/api/catalog')]);
      return { ...settings, ...templates, ...kinds, catalog: page(catalog, 'items', a) };
    }
    const listPaths = { list: ['/api/quotations', 'quotations'], deleted: ['/api/quotations/deleted', 'deleted'], clients: ['/api/clients', 'clients'], catalog: ['/api/catalog', 'items'], invoices: ['/api/invoices', 'invoices'] };
    if (listPaths[op]) { const [path,key] = listPaths[op]; return page(await get(path + query(a, op === 'list' ? 'status client_id' : op === 'invoices' ? 'status client_id month' : '')), key, a); }
    if (op === 'settings') return get('/api/settings');
    if (op === 'client') return get(`/api/clients/${id(a)}`);
    if (op === 'invoice') return get(`/api/invoices/${id(a)}`);
    if (op === 'payments') return page(await get(`/api/invoices/${id(a)}/payments`), 'payments', a);
    if (op === 'report') {
      if (!['pp30','income','wht','pnd','pipeline'].includes(a.report)) throw new Error('report must be pp30, income, wht, pnd or pipeline');
      return get(`/api/reports/${a.report}${query(a, 'year month half from to')}`);
    }
    const path = `/api/quotations/${id(a)}`;
    if (op === 'get') return get(path);
    if (op === 'draft_export') return get(`${path}/draft.json`);
    if (op === 'preview') return get(`${path}/preview${query(a, 'lang')}`);
    if (op === 'revisions') { const result = await get(`${path}/revisions${a.revision === undefined ? '' : `/${id(a, 'revision')}`}`); return a.revision === undefined ? page(result, 'revisions', a) : result; }
  }
  if (name === 'draft') {
    const header = 'client_id lang currency notes issue_date fx_base fx_rate fx_as_of';
    const line = 'kind description_en description_th qty unit_price discount_satang unit billing_period section optional catalog_id';
    if (op === 'create') {
      if (a.term_months !== undefined && (a.term_months < 0 || a.term_months > 600)) throw new Error('term_months must be 0..600');
      let result = await call('POST', '/api/quotations', pick(a, `${header} template sow lines`));
      if (a.term_months !== undefined) {
        const createdId = result.quotation.id;
        try { result = await call('PUT', `/api/quotations/${createdId}`, { term_months: a.term_months }); }
        catch (error) { throw new Error(`quotation ${createdId} was created, but updating term_months failed: ${error.message}`, { cause: error }); }
      }
      return result;
    }
    if (op === 'client_save' || op === 'catalog_save') {
      const endpoint = op === 'client_save' ? 'clients' : 'catalog';
      const keys = op === 'client_save' ? 'name name_th address address_th tax_id contact email phone' : 'kind sku name_en name_th description unit unit_price billing_period section active';
      return call(a.id === undefined ? 'POST' : 'PUT', `/api/${endpoint}${a.id === undefined ? '' : `/${id(a)}`}`, pick(a, keys));
    }
    const path = `/api/quotations/${id(a)}`;
    if (op === 'update') return call('PUT', path, pick(a, `${header} term_months`));
    if (op === 'set_sow') return call('PUT', `${path}/sow`, pick(a, 'sow'));
    if (op === 'clone') return call('POST', `${path}/clone`, pick(a, 'client_id lang issue_date notes'));
    if (op === 'line_add') return call('POST', `${path}/lines`, pick(a, line));
    if (op === 'line_update') return call('PUT', `${path}/lines/${id(a, 'line_id')}`, pick(a, line));
    if (op === 'line_remove') return call('DELETE', `${path}/lines/${id(a, 'line_id')}`);
    if (op === 'reorder') return call('POST', `${path}/lines/reorder`, pick(a, 'line_ids'));
    if (op === 'draft_apply') {
      if (!a.draft) throw new Error('draft is required');
      const draft = pick(a.draft, 'schema version quotation_id base_digest header sow lines');
      return call('POST', `${path}/draft?dry_run=${a.dry_run === false ? '0' : '1'}`, draft);
    }
  }
  if (name === 'quotation') {
    const path = `/api/quotations/${id(a)}`;
    if (op === 'delete') { await confirm(call, a, 'quotations'); return call('DELETE', path); }
    return call('POST', `${path}/${op}`, op === 'status' ? pick(a, 'status') : {});
  }
  if (name === 'invoice') {
    if (op === 'create') return call('POST', '/api/invoices', pick(a, 'quotation_id lang issue_date notes include_optional_line_ids'));
    const path = `/api/invoices/${id(a)}`;
    if (['issue','delete','payment_delete'].includes(op)) await confirm(call, a, 'invoices');
    if (op === 'delete') return call('DELETE', path);
    if (op === 'payment_delete') return call('DELETE', `${path}/payments/${id(a, 'payment_id')}`);
    if (op === 'issue') return call('POST', `${path}/issue`, pick(a, 'issue_date'));
    if (op === 'status') return call('POST', `${path}/status`, pick(a, 'status'));
    if (op === 'pay') return call('POST', `${path}/payments`, pick(a, 'amount paid_on method reference note'));
    if (op === 'wht') return call('POST', `${path}/wht`, pick(a, 'base wht cert_number issued_on pnd_form rate_percent payer_name payer_tax_id file_path note'));
  }
  if (name === 'settings') {
    if (typeof a.key !== 'string' || !a.key || a.confirm !== a.key) throw new Error('confirmation required: confirm must equal the settings key');
    const { settings } = await get('/api/settings');
    if (!Object.hasOwn(settings, a.key)) throw new Error(`unknown settings key: ${a.key}`);
    return call('PUT', '/api/settings', pick(a, 'key value'));
  }
  if (name === 'pdf') {
    const lang = a.lang ?? 'en'; if (!['en','th'].includes(lang)) throw new Error('lang must be en or th');
    const buf = await call('GET', `/api/${op === 'quotation' ? 'quotations' : 'invoices'}/${id(a)}/pdf?lang=${lang}`, undefined, { raw: true });
    const dir = resolve(process.env.QUOTES_MCP_OUT || '/tmp/quotes-mcp'); await mkdir(dir, { recursive: true, mode: 0o700 });
    const path = join(dir, `${op}-${a.id}-${lang}-${randomUUID()}.pdf`); await writeFile(path, buf, { mode: 0o600 });
    return { path, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
  }
  throw new Error('unknown operation');
}