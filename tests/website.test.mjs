import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { config, routes, routePath, outputPath } from '../site/config.mjs';
import { esc, renderPage } from '../site/templates.mjs';
import { ROOT, generate, loadContent, assertParity, samePreviewBytes } from '../scripts/build-site.mjs';
import { createDemo, flowStates } from '../assets/site.js';

const read = path => readFile(resolve(ROOT, path), 'utf8');
const content = await loadContent(), output = await generate();
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const schema = html => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];

test('direct email links opt out of edge obfuscation so the no-JS fallback survives publication', async () => {
  for (const html of [...output.values(), await read('light-tools.html'), await read('privacy.html')]) {
    for (const match of html.matchAll(/<a\b[^>]*href="mailto:[^"]*"[^>]*>[\s\S]*?<\/a>/g)) {
      assert.equal(html.slice(match.index - 16, match.index), '<!--email_off-->');
      assert.equal(html.slice(match.index + match[0].length, match.index + match[0].length + 17), '<!--/email_off-->');
    }
  }
});

test('published comparison allows only removal of exact opt-out comments, not obfuscation or injected code', () => {
  const expected = Buffer.from('<!--email_off--><a href="mailto:admin@factor-io.com">admin@factor-io.com</a><!--/email_off-->');
  const plain = Buffer.from('<a href="mailto:admin@factor-io.com">admin@factor-io.com</a>');
  assert.equal(samePreviewBytes('/en/', expected, expected), true);
  assert.equal(samePreviewBytes('/en/', expected, plain), true);
  assert.equal(samePreviewBytes('/site.css', expected, plain), false);
  assert.equal(samePreviewBytes('/en/', expected, Buffer.from(plain + '<script src="/cdn-cgi/email-decode.min.js"></script>')), false);
  assert.equal(samePreviewBytes('/en/', expected, Buffer.from(plain.toString().replace('mailto:', '/cdn-cgi/l/email-protection#'))), false);
  assert.equal(samePreviewBytes('/en/', expected, Buffer.from(plain + ' ')), false);
});

test('all committed output matches deterministic generation with no wall-clock dependency', async () => {
  assert.equal(output.size, 10);
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

test('flowchart stages never claim an approval or a human wait that did not happen', () => {
  const d = createDemo();
  // Unapproved production: refused at scope, parked on the human gate, execution untouched.
  assert.deepEqual(flowStates(d), ['pass', 'pass', 'deny', 'wait', 'idle']);
  // A real human decision is the only thing that may tick the human-approval stage.
  assert.equal(d.approve(), true);
  assert.deepEqual(flowStates(d), ['pass', 'pass', 'pass', 'pass', 'pass']);
  // In the agent's own scope the request is allowed with no approval at all, so the
  // human-approval stage must stay neutral rather than earning the same tick.
  d.reset(); d.update({ target: 'staging/payment-api' });
  assert.equal(d.evaluate(), true); assert.equal(d.approvedExact(), false);
  assert.deepEqual(flowStates(d), ['pass', 'pass', 'pass', 'idle', 'pass']);
  // Approving that in-scope request IS a genuine human decision, so it may tick.
  assert.equal(d.approve(), true);
  assert.deepEqual(flowStates(d), ['pass', 'pass', 'pass', 'pass', 'pass']);
  // A malformed request is refused at the request stage and never waits on a person.
  for (const revision of [NaN, 0, -1, 1.5, 1000000]) {
    d.reset(); d.update({ revision });
    assert.equal(d.approve(), false);
    assert.deepEqual(flowStates(d), ['deny', 'idle', 'idle', 'idle', 'idle']);
  }
  // A change after approval revokes it, returning the chain to the human gate.
  d.reset(); d.approve(); d.update({ revision: 183 });
  assert.equal(d.approvedExact(), false);
  assert.deepEqual(flowStates(d), ['pass', 'pass', 'deny', 'wait', 'idle']);
});

// The approval illustration moved from the retired /governance/ route onto the services
// page, where AI governance is one of the four services rather than a product of its own.
test('governance flowchart renders one node per declared stage, in both locales', () => {
  for (const locale of ['en', 'th']) {
    const html = output.get(outputPath(locale, 'services')), d = content[locale].demo;
    assert.equal(d.stages.length, 5);
    assert.equal((html.match(/class="flow-node"/g) || []).length, d.stages.length);
    for (const label of d.stages) assert.ok(html.includes(esc(label)), `${locale}: missing stage ${label}`);
    // The halt notice ships hidden; only the script may reveal it.
    assert.match(html, /<p class="flow-halt" data-halt hidden/);
    assert.ok(html.includes(esc(d.halt)));
    // The no-JS argument must survive with the exact revision still named.
    assert.ok(html.includes(esc(d.static)) && d.static.includes('182'));
  }
});

test('vendor product framing is gone while the founder employment history is preserved', async () => {
  for (const locale of ['en', 'th']) {
    const json = await read(`content/${locale}/site.json`);
    assert.doesNotMatch(json, /Nutanix Enterprise AI|Nutanix Ready|Nutanix AI/);
    assert.match(json, /Ecosystem Solutions Architect/);
    assert.doesNotMatch(json, /nutanix"/);
  }
  assert.match(await read('llms.txt'), /Ecosystem Solutions Architect/);
  assert.doesNotMatch(await read('llms.txt'), /Nutanix inference|optional Nutanix/);
  // The founder schema description is a cross-page contract; it must not drift.
  assert.match(config.founderDescription, /Red Hat and Nutanix/);
});

test('both contact pages lead with LINE: the profile link, the QR with a cache-busting hash, and the LINE id', () => {
  for (const locale of ['en', 'th']) {
    const html = output.get(`${locale}/contact/index.html`);
    assert.ok(html.includes(`href="${config.lineUrl}"`), `${locale} contact is missing the LINE profile link`);
    const img = html.match(/<img src="\/assets\/line-qr\.jpg\?v=([0-9a-f]{12})"[^>]*>/);
    assert.ok(img, `${locale} contact is missing the QR image with a content hash`);
    assert.match(img[0], /alt="[^"]+"/);
    assert.ok(html.includes(config.lineId), `${locale} contact is missing the LINE id`);
  }
});

test('the email address survives as the secondary channel, wrapped in its edge opt-out markers', () => {
  for (const locale of ['en', 'th']) {
    const html = output.get(`${locale}/contact/index.html`);
    assert.ok(html.includes(`<!--email_off--><a href="mailto:${config.email}">${config.email}</a><!--/email_off-->`));
  }
});

test('the deleted draft form leaves nothing behind: no form, no draft panel, no mailto composition', async () => {
  // Contact carried the only form on the site; the services demo keeps its own
  // revision input, which this change never touched. Scope the form assertion to
  // the contact pages and the dead wiring assertion to every page.
  for (const locale of ['en', 'th']) {
    assert.doesNotMatch(output.get(`${locale}/contact/index.html`), /<form|<textarea|<input\b/);
  }
  for (const html of output.values()) {
    assert.doesNotMatch(html, /draft-panel|form-status|data-contact|email-draft|data-copy-draft|data-mail/);
  }
  const script = await read('assets/site.js');
  assert.doesNotMatch(script, /prepareMailDraft|copyDraft|MAILTO_LIMIT|bindContact/);
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|\.submit\(/);
  const css = await read('assets/site.css');
  assert.doesNotMatch(css, /\.field-row|\.draft-panel|\.email-draft|\.form-status|\.hint\{/);
});

test('the LINE url is built from the configured id, so the QR and the link can never name different accounts', () => {
  assert.equal(config.lineUrl, `https://line.me/ti/p/~${config.lineId}`);
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
  const redirect = await fetch(`${base}/th/services?test=1`, { redirect: 'manual' }); assert.equal(redirect.status, 301); assert.equal(redirect.headers.get('location'), '/th/services/?test=1');
  // Retired routes are hand-written stubs, not generated output: they must still resolve rather than 404.
  for (const path of ['/en/platform/', '/en/governance/', '/en/how-we-work/', '/th/platform/', '/th/governance/', '/th/how-we-work/']) {
    const stub = await fetch(base + path); assert.equal(stub.status, 200, path);
    const body = await stub.text();
    assert.match(body, /<meta http-equiv="refresh"/, path);
    assert.match(body, /content="noindex, follow"/, path);
  }
  const head = await fetch(`${base}/en/`, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  assert.equal((await fetch(`${base}/not-a-route/`)).status, 404);
  assert.equal((await fetch(`${base}/en/`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/..%2f..%2fetc/passwd`)).status, 404);
});
