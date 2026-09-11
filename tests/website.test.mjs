import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { config, routes, routePath, outputPath } from '../site/config.mjs';
import { esc, renderPage } from '../site/templates.mjs';
import { ROOT, generate, loadContent, assertParity } from '../scripts/build-site.mjs';
import { createDemo, prepareMailDraft, copyDraft, MAILTO_LIMIT } from '../assets/site.js';

const read = path => readFile(resolve(ROOT, path), 'utf8');
const content = await loadContent(), output = await generate();
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const schema = html => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];

test('all committed output matches deterministic generation with no wall-clock dependency', async () => {
  assert.equal(output.size, 16);
  for (const [path, bytes] of output) assert.equal(await read(path), bytes, path);
  const OldDate = globalThis.Date;
  try {
    globalThis.Date = class extends OldDate { constructor(...args) { super(...(args.length ? args : ['2040-01-01T00:00:00Z'])); } static now() { return 2208988800000; } };
    assert.deepEqual(await generate(), output);
  } finally { globalThis.Date = OldDate; }
});

for (const locale of ['en', 'th']) for (const page of routes) test(`${locale}/${page}: complete direct HTML, metadata, paired navigation and links`, async () => {
  const html = output.get(outputPath(locale, page)), p = content[locale].pages[page];
  assert.match(html, new RegExp(`<html lang="${locale}">`));
  assert.ok(html.includes(esc(p.headline)));
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.ok(html.includes(`<meta name="description" content="${esc(p.description)}">`));
  assert.ok(html.includes(`<link rel="canonical" href="${config.origin}${routePath(locale, page)}">`));
  for (const lang of ['en', 'th', 'x-default']) assert.ok(html.includes(`hreflang="${lang}"`));
  assert.ok(html.includes(`href="${routePath(locale === 'en' ? 'th' : 'en', page)}" lang=`));
  for (const r of routes) assert.ok(html.includes(`href="${routePath(locale, r)}"`));
  assert.match(html, locale === 'th' ? /content="noindex, follow"/ : /content="index, follow"/);
  if (locale === 'th') assert.ok((html.match(/[ก-๙]/g) || []).length > 300);
  assert.doesNotMatch(html, /__bundler\/template|og-image\.png|logo\.png|Twenty-plus|20\+ years|five years/);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = new URL(decode(match[1]), config.origin + routePath(locale, page));
    if (url.origin !== config.origin) continue;
    let path = url.pathname.slice(1);
    if (url.pathname.endsWith('/')) path += 'index.html';
    assert.ok((await stat(resolve(ROOT, path))).isFile(), `${page}: missing ${path}`);
    if (url.hash) {
      const target = output.get(path) ?? await read(path);
      assert.ok(target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `${page}: missing anchor ${url.href}`);
    }
  }
});

test('schema parity rejects missing keys, sections and translated text', () => {
  const th = structuredClone(content.th);
  delete th.ui.menu;
  assert.throws(() => assertParity(content.en, th), /keys mismatch/);
  const shortened = structuredClone(content.th); shortened.pages.home.sections.pop();
  assert.throws(() => assertParity(content.en, shortened), /array mismatch/);
  const blank = structuredClone(content.th); blank.pages.about.lede = '';
  assert.throws(() => assertParity(content.en, blank), /Missing translated/);
});

test('root and resource JSON-LD retain consistent cross-page identities and founder prose', async () => {
  const root = schema(output.get('index.html')), toolsHtml = await read('light-tools.html'), tools = schema(toolsHtml);
  for (const [type, suffix, description] of [['Organization', 'organization', config.organizationDescription], ['Person', 'founder', config.founderDescription]]) {
    for (const graph of [root, tools]) {
      const node = graph.find(n => n['@type'] === type);
      assert.equal(node['@id'], `${config.origin}/#${suffix}`); assert.equal(node.description, description);
    }
  }
  assert.ok(toolsHtml.replace(/\s+/g, ' ').includes(config.founderDescription));
  const calculator = await read('tco-calculator.html');
  assert.ok(calculator.includes(`${config.origin}/#founder`)); assert.ok(calculator.includes(`${config.origin}/#organization`));
});

test('sitemap retains every original URL, omits noindex Thai and fixture, and uses explicit dates', () => {
  const xml = output.get('sitemap.xml');
  for (const path of ['/', '/light-tools.html', '/tco-calculator.html', '/privacy.html']) assert.ok(xml.includes(`<loc>${config.origin}${path}</loc>`));
  assert.ok(xml.includes('<lastmod>2026-08-28</lastmod>'));
  assert.doesNotMatch(xml, /\/th\/|\/tests\/|services\.html/);
  for (const route of routes) assert.ok(xml.includes(routePath('en', route)));
});

test('historical services deck stays byte-for-byte unchanged', async () => {
  const bytes = await readFile(resolve(ROOT, 'services.html'));
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(blob, '67fa2bba803cb9840dead1ccbf2a4a94067e21ce');
});

test('authored content is escaped in text, attributes and embedded data', () => {
  const hostile = structuredClone(content.en);
  hostile.pages.home.headline = '<img src=x onerror=alert(1)>';
  hostile.pages.home.description = '" onload="bad';
  const html = renderPage(hostile, 'home');
  assert.ok(html.includes('&lt;img')); assert.ok(html.includes('&quot; onload=&quot;bad'));
  assert.doesNotMatch(html, /<img src=x/);
});

test('demo denies production until exact approval and invalidates changes, reverts and reset', () => {
  const d = createDemo(); assert.equal(d.evaluate(), false);
  assert.equal(d.approve(), true); assert.equal(d.evaluate(), true);
  d.update({ target: 'production/reporting-api' }); assert.equal(d.evaluate(), false);
  d.update({ target: 'production/payment-api' }); assert.equal(d.evaluate(), false);
  d.approve(); d.update({ revision: 183 }); assert.equal(d.evaluate(), false);
  d.update({ revision: 182 }); assert.equal(d.evaluate(), false);
  d.approve(); d.update({ operation: 'delete' }); assert.equal(d.evaluate(), false); assert.equal(d.approve(), false);
  d.reset(); assert.deepEqual(d.snapshot(), { target: 'production/payment-api', operation: 'restart', revision: 182 }); assert.equal(d.evaluate(), false);
  d.update({ identity: 'administrator', authority: '*', target: 'production/payment-api' }); assert.equal(d.evaluate(), false);
  const snapshot = d.snapshot(); snapshot.target = 'staging/payment-api'; assert.equal(d.evaluate(), false);
  d.update({ target: 'staging/payment-api' }); assert.equal(d.evaluate(), true);
  d.update({ target: 'staging/../production/payment-api' }); assert.equal(d.evaluate(), false);
  for (const revision of [NaN, 0, -1, 1.5, 1000000]) { d.update({ target: 'production/payment-api', revision }); assert.equal(d.approve(), false); assert.equal(d.evaluate(), false); }
});

const values = { name: 'Test Engineer', email: 'test@example.com', company: 'Example', workflow: 'A staging migration.' };
test('short contact draft safely encodes subject/body; preparation never means delivery', () => {
  const result = prepareMailDraft({ ...values, workflow: 'A & B? #1\n<unsafe> + = 100%' }, content.en.contact, config.email);
  assert.ok(result.mailto); const url = new URL(result.mailto);
  assert.equal(url.searchParams.get('subject'), content.en.contact.subject);
  assert.equal(url.searchParams.get('body'), result.body);
  assert.ok(result.text.includes('<unsafe>'));
  assert.equal(result.encodedLength, result.mailto.length);
});

test('Thai, emoji and long drafts retain all text and use fallback over the complete URI budget', () => {
  const workflow = 'ตรวจสอบระบบก่อนไปใช้งานจริง 🚦\n'.repeat(40);
  const result = prepareMailDraft({ ...values, workflow }, content.th.contact, config.email);
  assert.equal(result.mailto, null); assert.ok(result.encodedLength > MAILTO_LIMIT); assert.ok(result.text.endsWith(workflow));
  const base = prepareMailDraft({ ...values, workflow: 'x' }, content.en.contact, config.email);
  const exact = prepareMailDraft({ ...values, workflow: 'x'.repeat(MAILTO_LIMIT - base.encodedLength + 1) }, content.en.contact, config.email);
  assert.equal(exact.encodedLength, MAILTO_LIMIT); assert.ok(exact.mailto);
  const over = prepareMailDraft({ ...values, workflow: 'x'.repeat(MAILTO_LIMIT - base.encodedLength + 2) }, content.en.contact, config.email);
  assert.equal(over.encodedLength, MAILTO_LIMIT + 1); assert.equal(over.mailto, null);
});

test('contact rejects missing, invalid, oversized and malformed inputs without silently shortening', () => {
  for (const patch of [{ name: ' ' }, { email: 'bad' }, { email: 'a@b.com\nBcc:x@y.com' }, { workflow: '' }, { workflow: 'x'.repeat(4001) }, { company: 'x'.repeat(161) }, { workflow: '\ud800' }]) assert.ok(prepareMailDraft({ ...values, ...patch }, content.en.contact, config.email).error);
});

test('clipboard denial preserves selectable full draft', async () => {
  const textarea = { value: 'งาน Infrastructure', focus() { this.focused = true; }, select() { this.selected = true; } };
  assert.equal(await copyDraft(textarea, { writeText: async () => { throw new Error('denied'); } }), false);
  assert.equal(textarea.focused, true); assert.equal(textarea.selected, true); assert.equal(textarea.value, 'งาน Infrastructure');
  let received; assert.equal(await copyDraft(textarea, { writeText: async text => { received = text; } }), true); assert.equal(received, textarea.value);
});

test('no-JS contact has a direct address and form stays hidden until handlers attach; no background network/storage', async () => {
  const html = output.get('th/contact/index.html'); assert.match(html, /<form hidden>/); assert.ok(html.includes(`mailto:${config.email}`)); assert.match(html, /<noscript>/);
  const script = await read('assets/site.js');
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|\.submit\(/);
  assert.ok(script.indexOf("form.addEventListener('submit'") < script.indexOf('form.hidden = false'));
});

test('real static server handles locale directories, redirects, HEAD, missing paths and method refusal', { timeout: 15000 }, async t => {
  const child = spawn(process.execPath, ['scripts/serve.mjs', '0'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } });
  const base = await new Promise((resolveReady, reject) => {
    let log = ''; const timer = setTimeout(() => reject(new Error('server readiness timeout')), 5000);
    child.on('error', reject); child.stderr.on('data', bytes => { clearTimeout(timer); reject(new Error(String(bytes))); });
    child.stdout.on('data', bytes => { log += bytes; const match = log.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolveReady(match[0]); } });
  });
  for (const locale of ['en', 'th']) for (const page of routes) {
    const response = await fetch(base + routePath(locale, page)); assert.equal(response.status, 200); assert.equal(await response.text(), output.get(outputPath(locale, page)));
  }
  const redirect = await fetch(`${base}/th/governance?test=1`, { redirect: 'manual' }); assert.equal(redirect.status, 301); assert.equal(redirect.headers.get('location'), '/th/governance/?test=1');
  const head = await fetch(`${base}/en/`, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  assert.equal((await fetch(`${base}/not-a-route/`)).status, 404);
  assert.equal((await fetch(`${base}/en/`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/..%2f..%2fetc/passwd`)).status, 404);
});
