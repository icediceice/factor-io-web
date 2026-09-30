import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { config, routes, routePath, outputPath } from '../site/config.mjs';
import { esc, renderPage } from '../site/templates.mjs';
import { ROOT, generate, loadContent, assertParity, samePreviewBytes, checkPreview, publishedMedia } from '../scripts/build-site.mjs';
import { createDemo, flowStates, bindFilm } from '../assets/site.js';
import { chapterTag } from '../scripts/films/kit.js';
import { films, filmFile, filmPoster, work, workFile } from '../site/media.mjs';

const read = path => readFile(resolve(ROOT, path), 'utf8');
const content = await loadContent(), output = await generate();
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const schema = html => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];

test('direct email links opt out of edge obfuscation so the no-JS fallback survives publication', async () => {
  for (const html of [...output.values(), await read('light-tools.html'), await read('privacy.html'), await read('terms.html')]) {
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
  assert.equal(output.size, 14);
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
  for (const path of ['/', '/light-tools.html', '/tco-calculator.html', '/privacy.html', '/terms.html']) assert.ok(xml.includes(`<loc>${config.origin}${path}</loc>`));
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

// The site had drifted off its own research spec: docs/service-offer-spec.md:102 argues the
// platform LEADS ("every AI conversation in an enterprise eventually becomes a Kubernetes
// conversation") while every page led with Enterprise AI. The ordering is the argument, so
// pin it — the ledger numerals come from array position in templates.mjs, which means a
// reordered items array silently renumbers the page with nothing else to notice.
test('the platform leads: Kubernetes heads both ledgers, the focus statement ships, and no hero names AI first', () => {
  for (const locale of ['en', 'th']) {
    const c = content[locale];
    for (const [page, id] of [['home', 'services'], ['services', 'offer']]) {
      const ledger = c.pages[page].sections.find(s => s.id === id);
      assert.ok(ledger, `${locale}/${page}: no ${id} ledger`);
      assert.equal(ledger.items.length, 4, `${locale}/${page}: ${id} is no longer four services`);
      assert.match(ledger.items[0].title, /Kubernetes/, `${locale}/${page}: ${id} does not lead with Kubernetes`);
    }
    const focus = c.pages.home.sections[0];
    assert.equal(focus.id, 'focus', `${locale}: the focus statement is not the first home section`);
    assert.equal(focus.kind, 'statement', `${locale}: focus must stay a statement — it carries no item list`);
    assert.equal(focus.items.length, 0);
    const html = output.get(outputPath(locale, 'home'));
    assert.ok(html.includes('id="focus"'), `${locale}: focus section missing from the rendered home page`);
    assert.ok(html.includes(esc(focus.title)), `${locale}: focus title missing from the rendered home page`);
    // Kubernetes must be named before AI in the hero, in both locales.
    const hero = `${c.pages.home.headline} ${c.pages.home.lede}`;
    assert.ok(hero.includes('Kubernetes'), `${locale}: the hero never names Kubernetes`);
    assert.ok(hero.indexOf('Kubernetes') < hero.indexOf('AI'), `${locale}: the hero names AI before Kubernetes`);
  }
});

// The company profile is the page a client's procurement or vendor-registration process is
// sent to, so the particulars on it are compliance values rather than copy. Two of them are
// load-bearing in a way nothing else in the repo records: the registration number doubles as
// the tax ID under Thai law, and the registered Thai name differs from the old seed by a
// CONSONANT (แฟคเคอร์, not แฟกเตอร์/แฟคเตอร์) — quotes/lib/db.mjs seed-settings calls that a
// Revenue Code s.86/4 mandatory particular and says do not normalise it back. A copy edit
// that "tidies" either one produces a profile that fails vendor registration, silently.
test('the company profile carries the registered particulars verbatim, in both locales and in the schema', () => {
  const registration = '0105562205512', registeredThaiName = 'แฟคเคอร์ ไอ โอ จำกัด';
  assert.ok(routes.includes('profile'), 'profile is not a route');
  for (const locale of ['en', 'th']) {
    const facts = content[locale].pages.profile.sections.find(s => s.id === 'registration');
    assert.ok(facts, `${locale}: the profile has no registration section`);
    assert.equal(facts.kind, 'exceptions', `${locale}: registration must stay an existing section kind`);
    const html = output.get(outputPath(locale, 'profile'));
    for (const value of [registration, registeredThaiName, '88/57', '10510', '+66 92 888 7155', config.email, config.lineId]) {
      assert.ok(facts.items.some(i => i.body.includes(value)), `${locale}: the registration section omits ${value}`);
      assert.ok(html.includes(esc(value)), `${locale}: the rendered profile omits ${value}`);
    }
    // The superseded spellings must never reappear on the page or in the source.
    for (const wrong of ['แฟกเตอร์', 'แฟคเตอร์']) assert.ok(!html.includes(wrong), `${locale}: profile uses the superseded legal name ${wrong}`);
    // Deliberately absent: the operator excluded both from publication.
    assert.doesNotMatch(html, /registered capital|ทุนจดทะเบียน|date of incorporation|วันที่จดทะเบียน/i);
  }
  // No page anywhere may carry a Thai legal name that contradicts the registered one.
  for (const [path, html] of output) for (const wrong of ['แฟกเตอร์', 'แฟคเตอร์']) {
    assert.ok(!html.includes(wrong), `${path}: superseded Thai legal name ${wrong}`);
  }
  // The same particulars are the Organization's structured identity on every page.
  const org = schema(output.get('index.html')).find(n => n['@type'] === 'Organization');
  assert.equal(org.taxID, registration);
  assert.equal(org.telephone, config.phone);
  assert.equal(org.address['@type'], 'PostalAddress');
  assert.equal(org.address.postalCode, '10510');
  assert.equal(org.address.addressCountry, 'TH');
  assert.equal(org.address.addressLocality, config.address.locality);
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

test('the LINE url is built from the configured id, so the link and the displayed id can never name different accounts', () => {
  // This binds the URL to the ID and nothing more. line-qr.jpg is an opaque
  // operator asset -- nothing here decodes it, so a replaced QR stays green
  // even if it encodes a different account. That check is manual by design.
  assert.equal(config.lineUrl, `https://line.me/ti/p/~${config.lineId}`);
});

test('contact leads with LINE: the primary action precedes the email fallback in both locales', () => {
  // At <=760px .contact-layout is one column, so DOM order is reading and focus
  // order. Email coming first would invert the point of the page on the exact
  // device where tapping the LINE link actually opens the app.
  for (const locale of ['en', 'th']) {
    const html = output.get(`${locale}/contact/index.html`);
    const action = html.indexOf('class="button line-action"');
    const fallback = html.indexOf('class="contact-direct"');
    assert.ok(action > -1, `${locale} contact is missing the LINE action`);
    assert.ok(fallback > -1, `${locale} contact is missing the email fallback`);
    assert.ok(action < fallback, `${locale} contact puts the email fallback before the LINE action`);
  }
});

test('the llms.txt contact route describes LINE, not the deleted email draft', async () => {
  // The channel change updated the Optional links but left this primary route
  // summary selling a workflow that no longer exists.
  const bullet = (await read('llms.txt')).split('\n').find(l => l.startsWith('- [Contact]('));
  assert.ok(bullet, 'llms.txt has no Contact route bullet');
  assert.ok(bullet.includes(config.lineUrl), 'the Contact bullet does not name the LINE url');
  assert.doesNotMatch(bullet, /draft/i);
});

// The films carry the argument the old deck carried in text, so a missing render or a
// chapter bar that drifted from site/media.mjs would leave the story half told.
test('the three films ship in both locales with their poster, media-timed chapters and a transcript', async () => {
  for (const locale of ['en', 'th']) {
    const home = output.get(outputPath(locale, 'home'));
    for (const id of Object.keys(films)) {
      assert.ok((await stat(resolve(ROOT, filmFile(id, locale).slice(1)))).size > 100000, `${id}-${locale}.mp4 is missing or empty`);
      assert.ok((await stat(resolve(ROOT, filmPoster(id, locale).slice(1)))).isFile(), `${id}-${locale}.jpg is missing`);
      assert.ok(home.includes(`data-film="${id}"`), `${locale}: home does not carry the ${id} film`);
      for (const start of films[id].chapters) assert.ok(home.includes(`data-start="${start}"`), `${locale}: ${id} has no chapter at ${start}s`);
      assert.ok(home.includes(`id="film-${id}-transcript"`), `${locale}: ${id} has no transcript`);
    }
  }
});

// Apps and tools are output of the studio, not its pitch: the home strip is the last
// section, leads with the web tools, plays no video, and every tile has a full entry.
test('studio work stays secondary on home and every tile resolves to a full entry with real media', async () => {
  for (const locale of ['en', 'th']) {
    const strip = content[locale].pages.home.sections.at(-1);
    assert.equal(strip.kind, 'work'); assert.equal(strip.variant, 'strip');
    const frames = strip.items.map(item => work[item.id].frame);
    assert.equal(frames[0], 'browser', `${locale}: the web tools no longer lead the strip`);
    assert.ok(frames.includes('phone') && frames.includes('icon'), `${locale}: the strip lost its Android output`);
    const home = output.get(outputPath(locale, 'home')), full = output.get(outputPath(locale, 'mobile-apps'));
    assert.ok(!home.includes('frame-promo') && !home.includes('cat-countdown-promo'), `${locale}: the app promo belongs on the studio-work page`);
    for (const item of strip.items) {
      assert.ok(home.includes(`href="${routePath(locale, 'mobile-apps')}#${item.id}"`), `${locale}: ${item.id} tile does not link to its entry`);
      assert.ok(full.includes(`id="${item.id}"`), `${locale}: studio work has no ${item.id} entry`);
      for (const shot of work[item.id].shots) assert.ok((await stat(resolve(ROOT, 'assets/work', shot.file))).isFile(), shot.file);
    }
  }
  // Blink is shown by its icon only, by decision: no interface capture ships.
  assert.equal(work.blink.frame, 'icon'); assert.equal(work.blink.shots.length, 1);
});

test('the redesign leaves no deck, HUD or terminal markup behind, and content carries no em or en dash', async () => {
  for (const [path, html] of output) assert.doesNotMatch(html, /class="[^"]*\b(?:deck|hud|cyber|scene|terminal)-|\bkicker\b/, path);
  for (const locale of ['en', 'th']) assert.doesNotMatch(await read(`content/${locale}/site.json`), /[–—]/, locale);
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
  // Video seeks by byte range; a server that answers 200 to a Range request leaves the films unseekable.
  const film = await fetch(`${base}${filmFile('story', 'en')}`, { headers: { range: 'bytes=0-99' } });
  assert.equal(film.status, 206); assert.equal(film.headers.get('content-type'), 'video/mp4'); assert.equal(film.headers.get('accept-ranges'), 'bytes');
  assert.match(film.headers.get('content-range'), /^bytes 0-99\/\d+$/); assert.equal((await film.arrayBuffer()).byteLength, 100);
});

// bindFilm and chapterTag read browser globals. Each case installs its own and puts back
// whatever Node had, so the server test above keeps the real fetch and navigator.
class FakeNode extends EventTarget {
  constructor() { super(); this.dataset = {}; this.attrs = new Map(); this.children = []; this.style = { setProperty: (name, value) => { this.style[name] = value; } }; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  removeAttribute(name) { this.attrs.delete(name); }
  toggleAttribute(name, on) { if (on) this.setAttribute(name, ''); else this.removeAttribute(name); }
  appendChild(child) { this.children.push(child); return child; }
  click() { this.dispatchEvent(new Event('click')); }
}
let observed;
const browser = ({ reduce = false, saveData = false } = {}) => ({
  matchMedia: () => ({ matches: reduce }),
  navigator: { connection: { saveData } },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  IntersectionObserver: class { constructor(callback, options) { observed = { callback, options }; } observe() {} },
  document: { createElement: () => new FakeNode() },
});
async function withGlobals(values, fn) {
  const saved = Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  try { return await fn(); } finally {
    for (const [key, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
}
function mountFilm(spec = films.expertise) {
  const video = new FakeNode(); video.paused = true; video.currentTime = 0;
  video.play = () => { video.paused = false; video.dispatchEvent(new Event('play')); return Promise.resolve(); };
  video.pause = () => { video.paused = true; video.dispatchEvent(new Event('pause')); };
  const toggle = Object.assign(new FakeNode(), { dataset: { play: 'Play film', pause: 'Pause film' } });
  const chapters = spec.chapters.map(start => Object.assign(new FakeNode(), { dataset: { start: String(start) } }));
  const rows = chapters.map(() => new FakeNode()), seeks = chapters.map((_, i) => Object.assign(new FakeNode(), { dataset: { seek: String(i) } }));
  const figure = Object.assign(new FakeNode(), {
    dataset: { duration: String(spec.duration) },
    querySelector: selector => selector === 'video' ? video : selector === '[data-film-toggle]' ? toggle : new FakeNode(),
    querySelectorAll: () => chapters,
    closest: () => ({ querySelectorAll: selector => selector === '[data-row]' ? rows : seeks }),
  });
  bindFilm(figure);
  return {
    video, toggle, rows, seeks,
    view: ratio => observed.callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]),
    at: t => { video.currentTime = t; video.dispatchEvent(new Event('seeked')); },
    chapter: () => chapters.findIndex(button => button.getAttribute('aria-current') === 'step'),
  };
}

test('a film plays only while at least half of it is on screen, and a pause the visitor chose survives scrolling', () => withGlobals(browser(), () => {
  const film = mountFilm();
  assert.equal(observed.options.threshold, 0.5);
  film.view(0.1); assert.equal(film.video.paused, true, 'a sliver on first observe must not start it');
  film.view(0.5); assert.equal(film.video.paused, false); assert.equal(film.toggle.getAttribute('aria-label'), 'Pause film');
  film.view(0.49); assert.equal(film.video.paused, true, 'dropping under half must pause'); assert.equal(film.toggle.getAttribute('aria-label'), 'Play film');
  film.view(1); film.toggle.click(); film.view(0); film.view(1);
  assert.equal(film.video.paused, true, 'an explicit pause survives leaving and coming back');
}));

test('reduced motion and Save-Data hold every film until the visitor presses play', async () => {
  await withGlobals(browser({ reduce: true }), () => {
    const film = mountFilm(); film.view(1); assert.equal(film.video.paused, true);
    film.toggle.click(); assert.equal(film.video.paused, false);
  });
  await withGlobals(browser({ saveData: true }), () => { const film = mountFilm(); film.view(1); assert.equal(film.video.paused, true); });
});

test('the active chapter and ledger row change exactly at each chapter start, seeks land there, and the loop wraps to the first', () => withGlobals(browser(), () => {
  const film = mountFilm(), { chapters, duration } = films.expertise;
  chapters.forEach((start, i) => {
    film.at(start); assert.equal(film.chapter(), i); assert.equal(film.rows[i].attrs.has('data-active'), true);
    if (i) { film.at(start - 0.01); assert.equal(film.chapter(), i - 1); }
    film.seeks[i].click(); assert.equal(film.video.currentTime, start); assert.equal(film.video.paused, false);
  });
  film.at(duration - 0.01); assert.equal(film.chapter(), chapters.length - 1);
  film.at(0); assert.equal(film.chapter(), 0); assert.deepEqual(film.rows.map(row => row.attrs.has('data-active')), chapters.map((_, i) => i === 0));
}));

// The burned-in chapter name starts fading in 0.2s before its chapter, in the beat where the
// previous chapter's copy has already left; the page switches on the start itself. That lead
// is deliberate and bounded here, so the two can never drift further apart.
test('each film names a chapter at most 0.2s before the page marks it, and never after', () => withGlobals(browser(), () => {
  for (const [id, spec] of Object.entries(films)) {
    const film = mountFilm(spec), stage = new FakeNode(), names = spec.chapters.map((_, i) => `chapter-${i}`);
    const tag = chapterTag(stage, id, names, spec.chapters), label = stage.children[0].children[1];
    for (const start of spec.chapters) for (const t of [Math.max(0, start - 0.21), start]) {
      tag.render(t); film.at(t);
      assert.equal(label.textContent, names[film.chapter()], `${id} at ${t}s`);
    }
  }
}));

test('the live check fetches every film, poster, studio visual and font, and fails when one is missing', async () => {
  const media = await publishedMedia(), css = await read('assets/site.css');
  for (const id of Object.keys(films)) for (const locale of Object.keys(config.locales)) assert.ok(media.includes(filmFile(id, locale)) && media.includes(filmPoster(id, locale)), `${id}-${locale}`);
  for (const [id, m] of Object.entries(work)) for (const file of [...m.shots.map(shot => shot.file), ...(m.promo ? [m.promo.file, m.promo.poster] : [])]) assert.ok(media.includes(workFile(file)), `${id}: ${file}`);
  assert.equal(media.filter(path => path.startsWith('/assets/fonts/')).length, css.match(/@font-face/g).length);
  const served = missing => async url => {
    if (url.pathname === missing) return { ok: false, status: 404 };
    const bytes = await readFile(resolve(ROOT, `.${url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname}`));
    return { ok: true, status: 200, arrayBuffer: async () => bytes };
  };
  await withGlobals({ fetch: served(null) }, () => checkPreview('https://verification.invalid/', output));
  await withGlobals({ fetch: served(filmFile('expertise', 'th')) }, () => assert.rejects(checkPreview('https://verification.invalid/', output), /\/assets\/films\/expertise-th\.mp4: HTTP 404/));
});
