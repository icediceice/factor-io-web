import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { config, routes, routePath, outputPath } from '../site/config.mjs';
import { esc, renderPage } from '../site/templates.mjs';
import { lightContent, DEFAULT_WORKLOAD, WORKLOAD_PRESETS, calculateEconomics, bindPresentation, renderLight } from '../site/light-presentation.mjs';
import { lightSalesContent, bindSalesDeck, renderLightSales } from '../site/light-sales-deck.mjs';
import { ROOT, generate, loadContent, assertParity, samePreviewBytes, checkPreview, publishedMedia } from '../scripts/build-site.mjs';
import { createDemo, flowStates, bindFilm } from '../assets/site.js';
import { chapterTag } from '../scripts/films/kit.js';
import { films, filmFile, filmPoster, work, workFile } from '../site/media.mjs';

const read = path => readFile(resolve(ROOT, path), 'utf8');
const content = await loadContent(), output = await generate();
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const schema = html => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];

test('direct email links opt out of edge obfuscation so the no-JS fallback survives publication', async () => {
  for (const html of [...output.values(), await read('light-tools.html'), await read('privacy.html'), await read('terms.html'), await read('cat-countdown.html')]) {
    for (const match of html.matchAll(/<a\b[^>]*href="mailto:[^"]*"[^>]*>[\s\S]*?<\/a>/g)) {
      assert.equal(html.slice(match.index - 16, match.index), '<!--email_off-->');
      assert.equal(html.slice(match.index + match[0].length, match.index + match[0].length + 17), '<!--/email_off-->');
    }
  }
});

// Cloudflare also rewrites a bare address in page text into a script-decoded "[email protected]"
// link, which is what the live check caught on both profile pages.
test('no generated page leaves a bare address in its text for the edge to rewrite', async () => {
  for (const [path, html] of [...output, ['cat-countdown.html', await read('cat-countdown.html')], ['catcountdown/index.html', await read('catcountdown/index.html')]]) {
    const exposed = html.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<!--email_off-->[\s\S]*?<!--\/email_off-->/g, '');
    assert.doesNotMatch(exposed, /[\w.+-]+@[\w-]+\.[\w.-]+/, path);
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
  assert.equal(output.size, 15);
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
  assert.match(html, /<meta name="robots" content="index, follow">/);
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

test('sitemap offers search engines every page in both languages, keeps every original URL, and leaves out the fixture and old deck', () => {
  const xml = output.get('sitemap.xml');
  for (const path of ['/', '/light-tools.html', '/tco-calculator.html', '/privacy.html', '/terms.html']) assert.ok(xml.includes(`<loc>${config.origin}${path}</loc>`));
  assert.ok(xml.includes('<lastmod>2026-08-28</lastmod>'));
  assert.doesNotMatch(xml, /\/tests\/|services\.html/);
  for (const locale of ['en', 'th']) for (const route of routes) assert.ok(xml.includes(`<loc>${config.origin}${routePath(locale, route)}</loc>`), `${locale}/${route}`);
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

// Cat Countdown has its own selling page; the studio sends readers there with a filled
// button, to /app, which never bounces a phone to the store.
test('home and studio work send readers to the Cat Countdown page with a filled button', async () => {
  for (const locale of ['en', 'th']) {
    for (const page of ['home', 'mobile-apps']) {
      const html = output.get(outputPath(locale, page));
      assert.match(html, /<a class="button" href="https:\/\/catcountdown\.factor-io\.com\/app">[^<]+<\/a>/, `${locale} ${page}`);
    }
    assert.doesNotMatch(output.get(outputPath(locale, 'mobile-apps')), /Not yet released|ยังไม่เปิดตัว/, locale);
  }
});

test('the redesign leaves no deck, HUD or terminal markup behind, and content carries no em or en dash', async () => {
  for (const [path, html] of [...output, ['cat-countdown.html', await read('cat-countdown.html')], ['catcountdown/index.html', await read('catcountdown/index.html')]]) {
    assert.doesNotMatch(html, /class="[^"]*\b(?:deck|hud|cyber|scene|terminal)-|\bkicker\b/, path);
  }
  for (const locale of ['en', 'th']) assert.doesNotMatch(await read(`content/${locale}/site.json`), /[–—]/, locale);
  assert.doesNotMatch(await read('cat-countdown.html'), /[–—]/);
  assert.doesNotMatch(await read('catcountdown/index.html'), /[–—]/);
});

test('standalone Cat Countdown landing page prepares catcountdown.factor-io.com with live Android link and iPhone stub', async () => {
  const html = await read('cat-countdown.html');
  const stub = await read('catcountdown/index.html');
  assert.match(html, /<link rel="canonical" href="https:\/\/catcountdown\.factor-io\.com\/">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/catcountdown\.factor-io\.com\/">/);

  const graph = schema(html);
  const org = graph.find(node => node['@type'] === 'Organization');
  const founder = graph.find(node => node['@type'] === 'Person');
  const app = graph.find(node => node['@type'] === 'SoftwareApplication');
  assert.equal(org.url, `${config.origin}/`);
  assert.equal(founder.name, config.founder);
  assert.equal(app.name, 'Cat Countdown');
  assert.equal(app.url, 'https://catcountdown.factor-io.com/');
  assert.equal(app.downloadUrl, 'https://play.google.com/store/apps/details?id=com.catcountdown.cat_countdown');
  assert.equal(app.offers.price, '199');
  assert.equal(app.offers.priceCurrency, 'THB');

  const androidLink = html.match(/<a\b[^>]*data-store="android"[^>]*>[\s\S]*?<\/a>/);
  assert.ok(androidLink, 'expected <a data-store="android">');
  assert.match(androidLink[0], /\bhref="https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.catcountdown\.cat_countdown"/);
  assert.match(androidLink[0], /\brel="noopener\b/);
  const iosBtn = html.match(/<button\b[^>]*data-store="ios"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(iosBtn, 'expected native <button data-store="ios">');
  assert.match(iosBtn[0], /\btype="button"/);
  assert.match(iosBtn[0], /\bdata-stub="true"/);
  assert.match(iosBtn[0], /\bdisabled\b/);
  assert.doesNotMatch(iosBtn[0], /\bhref=/);
  assert.doesNotMatch(html, /apps\.apple\.com/i);

  const refs = [...html.matchAll(/(?:src|poster)="([^"]+)"|url\(['"]?(assets\/[^'")]+)['"]?\)/g)].map(m => m[1] || m[2]);
  assert.ok(refs.length >= 8);
  for (const ref of refs) {
    assert.match(ref, /^assets\//, `expected document-relative asset path, got ${ref}`);
    const info = await stat(resolve(ROOT, ref));
    assert.ok(info.size > 0, ref);
  }

  assert.match(html, /id="iphone-status"[^>]*>Coming soon &middot; Waiting for App Store review<\/p>/);
  assert.match(html, /id="iphone-review-notice"[\s\S]*?Coming soon to the App Store\./);

  assert.match(stub, /<meta name="robots" content="noindex, follow">/);
  assert.match(stub, /<meta http-equiv="refresh" content="0; url=\.\.\/cat-countdown\.html">/);
  assert.match(stub, /<link rel="canonical" href="https:\/\/catcountdown\.factor-io\.com\/">/);

  const controllerMatch = html.match(/<script id="scanner-controller">([\s\S]*?)<\/script>/);
  assert.ok(controllerMatch, 'expected inline #scanner-controller script in cat-countdown.html');
  const runScanner = ({ userAgent, platform = '', maxTouchPoints = 0, search = '', hostname = 'studio.factor-io.com', pathname = '/cat-countdown.html', referrer }) => {
    let replaced = null;
    const attrs = new Map();
    vm.runInNewContext(controllerMatch[1], {
      navigator: { userAgent, platform, maxTouchPoints },
      location: { search, hostname, pathname, replace: url => { replaced = url; } },
      document: { referrer, documentElement: { setAttribute: (k, v) => attrs.set(k, String(v)) } },
      URLSearchParams,
    });
    return { scanner: attrs.get('data-scanner'), replaced };
  };

  assert.deepEqual(
    runScanner({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36' }),
    { scanner: 'android', replaced: 'https://play.google.com/store/apps/details?id=com.catcountdown.cat_countdown' }
  );
  assert.deepEqual(
    runScanner({ userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B; wv) AppleWebKit/537.36 Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36', search: '?noredirect=0' }),
    { scanner: 'android', replaced: 'https://play.google.com/store/apps/details?id=com.catcountdown.cat_countdown' }
  );
  assert.deepEqual(
    runScanner({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36', search: '?noredirect=1' }),
    { scanner: 'android', replaced: null }
  );
  assert.deepEqual(
    runScanner({ userAgent: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }),
    { scanner: 'other', replaced: null }
  );
  assert.deepEqual(
    runScanner({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 }),
    { scanner: 'ios', replaced: null }
  );
  assert.deepEqual(
    runScanner({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 }),
    { scanner: 'ios', replaced: null }
  );
  assert.deepEqual(
    runScanner({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36', platform: 'MacIntel', maxTouchPoints: 0 }),
    { scanner: 'other', replaced: null }
  );
  // On the app subdomain an iPad (desktop Mac UA, which the edge Worker cannot classify)
  // is sent to the release-status page; the studio.factor-io.com copy keeps the full page.
  const ipad = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 };
  assert.deepEqual(runScanner({ ...ipad, hostname: 'catcountdown.factor-io.com', search: '?utm_source=qr' }), { scanner: 'ios', replaced: '/iphone?utm_source=qr' });
  assert.deepEqual(runScanner({ ...ipad, hostname: 'catcountdown.factor-io.com', search: '?noredirect=1' }), { scanner: 'ios', replaced: null });
  assert.deepEqual(runScanner({ ...ipad, hostname: 'studio.factor-io.com' }), { scanner: 'ios', replaced: null });
  assert.deepEqual(
    runScanner({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36', platform: 'MacIntel', maxTouchPoints: 0, hostname: 'catcountdown.factor-io.com' }),
    { scanner: 'other', replaced: null }
  );
  // A phone that arrives from a search result came to read about the app and keeps the page;
  // a QR scan (no referrer) or a click from the page's own host still goes to the store.
  const pixel = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36';
  const play = 'https://play.google.com/store/apps/details?id=com.catcountdown.cat_countdown';
  assert.deepEqual(runScanner({ userAgent: pixel, hostname: 'catcountdown.factor-io.com', referrer: 'https://www.google.com/' }), { scanner: 'android', replaced: null });
  assert.deepEqual(runScanner({ userAgent: pixel, hostname: 'catcountdown.factor-io.com', referrer: '' }), { scanner: 'android', replaced: play });
  assert.deepEqual(runScanner({ userAgent: pixel, hostname: 'catcountdown.factor-io.com', referrer: 'https://catcountdown.factor-io.com/iphone' }), { scanner: 'android', replaced: play });
  assert.deepEqual(runScanner({ ...ipad, hostname: 'catcountdown.factor-io.com', referrer: 'https://www.bing.com/' }), { scanner: 'ios', replaced: null });
  // A phone opening /app from the Play listing or a social bio has no referrer but keeps the page.
  assert.deepEqual(runScanner({ userAgent: pixel, hostname: 'catcountdown.factor-io.com', pathname: '/app', referrer: '' }), { scanner: 'android', replaced: null });
  assert.deepEqual(runScanner({ ...ipad, hostname: 'catcountdown.factor-io.com', pathname: '/app', referrer: '' }), { scanner: 'ios', replaced: null });
  assert.deepEqual(runScanner({ userAgent: pixel, hostname: 'catcountdown.factor-io.com', pathname: '/', referrer: '' }), { scanner: 'android', replaced: play });
  // Search Console's live test and Bing's mobile crawler send Android UAs without a word-bounded "bot".
  for (const userAgent of [
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0;)',
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 (compatible; GoogleOther)',
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.1938.76 Mobile Safari/537.36 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  ]) {
    assert.deepEqual(runScanner({ userAgent, hostname: 'catcountdown.factor-io.com' }), { scanner: 'other', replaced: null }, userAgent);
  }

  const aliasMatch = stub.match(/<script id="alias-redirect">([\s\S]*?)<\/script>/);
  assert.ok(aliasMatch, 'expected inline #alias-redirect script in catcountdown/index.html');
  let aliasReplaced = null;
  vm.runInNewContext(aliasMatch[1], {
    location: {
      href: 'https://catcountdown.factor-io.com/catcountdown/?noredirect=1#screens',
      search: '?noredirect=1',
      hash: '#screens',
      replace: url => { aliasReplaced = url; },
    },
    URL,
  });
  assert.equal(aliasReplaced, 'https://catcountdown.factor-io.com/cat-countdown.html?noredirect=1#screens');

  const nginxConf = await read('catcountdown/deploy/nginx-catcountdown.conf');
  assert.match(nginxConf, /location = \/catcountdown \{\s*return 302 \/cat-countdown\.html\$is_args\$args;\s*\}/);
  assert.match(nginxConf, /location = \/catcountdown\/ \{\s*return 302 \/cat-countdown\.html\$is_args\$args;\s*\}/);

  const qrSvg = await read('assets/work/cat-countdown-qr.svg');
  const parseQrModules = svgSource => {
    const grid = Array.from({ length: 29 }, () => Array(29).fill(0));
    const pathMatch = svgSource.match(/<path fill="#000000" d="([^"]+)"\/>/);
    assert.ok(pathMatch, 'expected #000000 module path in QR SVG');
    for (const m of pathMatch[1].matchAll(/M(\d+),(\d+)h(\d+)v1h-\d+z/g)) {
      const mx0 = Number(m[1]) - 4;
      const my = Number(m[2]) - 4;
      const runLen = Number(m[3]);
      for (let k = 0; k < runLen; k++) {
        const mx = mx0 + k;
        assert.ok(mx >= 0 && mx < 29 && my >= 0 && my < 29, `module (${mx},${my}) out of Version 3 bounds`);
        grid[my][mx] = 1;
      }
    }
    return grid;
  };
  const decodeQrV3M = grid => {
    let fmtA = 0;
    for (let i = 0; i <= 5; i++) fmtA |= grid[i][8] << i;
    fmtA |= grid[7][8] << 6;
    fmtA |= grid[8][8] << 7;
    fmtA |= grid[8][7] << 8;
    for (let i = 9; i < 15; i++) fmtA |= grid[8][14 - i] << i;
    let fmtB = 0;
    for (let i = 0; i < 8; i++) fmtB |= grid[8][28 - i] << i;
    for (let i = 8; i < 15; i++) fmtB |= grid[14 + i][8] << i;
    assert.equal(fmtA, fmtB, 'both 15-bit format information copies must match');
    assert.equal(grid[21][8], 1, 'dark module at (8, 21) must be 1');
    const rawFmt = fmtA ^ 0x5412;
    const ecl = (rawFmt >> 13) & 0b11;
    const mask = (rawFmt >> 10) & 0b111;
    assert.equal(ecl, 0b00, 'expected Medium (M) error correction level');

    const isFunc = Array.from({ length: 29 }, () => Array(29).fill(false));
    const markBox = (r0, c0, h, w) => {
      for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) isFunc[r][c] = true;
    };
    markBox(0, 0, 9, 9);
    markBox(0, 21, 9, 8);
    markBox(21, 0, 8, 9);
    markBox(20, 20, 5, 5);
    for (let i = 0; i < 29; i++) { isFunc[6][i] = true; isFunc[i][6] = true; }

    const bits = [];
    let up = true;
    for (let right = 28; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < 29; vert++) {
        const r = up ? 28 - vert : vert;
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          if (!isFunc[r][c]) {
            const maskBit = mask === 2 ? (c % 3 === 0) : false;
            bits.push(grid[r][c] ^ (maskBit ? 1 : 0));
          }
        }
      }
      up = !up;
    }
    const codewords = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      let byte = 0;
      for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i + b];
      codewords.push(byte);
    }
    assert.equal(codewords.length, 70, 'Version 3-M has 70 total codewords (44 data + 26 EC)');
    const dataBits = [];
    for (let i = 0; i < 44; i++) {
      for (let b = 7; b >= 0; b--) dataBits.push((codewords[i] >> b) & 1);
    }
    const readBits = (offset, len) => {
      let val = 0;
      for (let i = 0; i < len; i++) val = (val << 1) | dataBits[offset + i];
      return val;
    };
    assert.equal(readBits(0, 4), 0b0100, 'expected byte mode indicator (0100)');
    const len = readBits(4, 8);
    const bytes = [];
    for (let i = 0; i < len; i++) bytes.push(readBits(12 + i * 8, 8));
    return Buffer.from(bytes).toString('utf8');
  };

  const svgGrid = parseQrModules(qrSvg);
  const inlineSvgMatch = html.match(/<svg id="cat-countdown-qr-svg"[\s\S]*?<\/svg>/);
  assert.ok(inlineSvgMatch, 'expected inline #cat-countdown-qr-svg in cat-countdown.html');
  const inlineGrid = parseQrModules(inlineSvgMatch[0]);
  assert.deepEqual(inlineGrid, svgGrid, 'inline SVG QR matrix must match assets/work/cat-countdown-qr.svg');
  assert.equal(decodeQrV3M(svgGrid), 'https://catcountdown.factor-io.com/');

  const scale = 32, totalModules = 37, imgSize = totalModules * scale;
  const rawScanlines = Buffer.alloc(imgSize * (1 + imgSize * 3), 255);
  for (let y = 0; y < imgSize; y++) {
    const rowStart = y * (1 + imgSize * 3);
    rawScanlines[rowStart] = 0;
    const my = Math.floor(y / scale) - 4;
    if (my >= 0 && my < 29) {
      for (let x = 0; x < imgSize; x++) {
        const mx = Math.floor(x / scale) - 4;
        if (mx >= 0 && mx < 29 && svgGrid[my][mx] === 1) {
          const px = rowStart + 1 + x * 3;
          rawScanlines[px] = 0;
          rawScanlines[px + 1] = 0;
          rawScanlines[px + 2] = 0;
        }
      }
    }
  }
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  const crc32 = buf => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const pngChunk = (type, data) => {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([lenBuf, typeAndData, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(imgSize, 0);
  ihdr.writeUInt32BE(imgSize, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const pngBytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rawScanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  const pngPath = resolve(ROOT, 'assets/work/cat-countdown-qr.png');
  const existingPng = await readFile(pngPath).catch(() => null);
  if (!existingPng || !existingPng.equals(pngBytes)) {
    await writeFile(pngPath, pngBytes);
  }
});

test('Cat Countdown only autoplays visible captures and swaps chapters while playing', { timeout: 15000 }, async t => {
  const { catPage, eventually } = await import('./support/cat-countdown-browser.mjs');
  const { page } = await catPage(t, { reducedMotion: 'no-preference' });
  await page.evaluate(`document.getElementById('demo-video').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await eventually(page, `!document.getElementById('demo-video').paused && document.getElementById('demo-video').currentTime > 0`);
  await page.evaluate(`document.querySelector('#demo button[data-video$="tour.mp4"]').click()`);
  await eventually(page, `document.getElementById('demo-video').currentSrc.endsWith('/tour.mp4') && !document.getElementById('demo-video').paused`);
  await page.evaluate(`window.scrollTo({ top: 0, behavior: 'instant' })`);
  await eventually(page, `document.getElementById('demo-video').paused`);
});

test('Cat Countdown keeps manual playback and still cats under reduced motion or Save-Data', { timeout: 15000 }, async t => {
  const { catPage } = await import('./support/cat-countdown-browser.mjs');
  for (const options of [{ reducedMotion: 'reduce' }, { reducedMotion: 'no-preference', saveData: true }]) {
    const { page } = await catPage(t, options);
    const result = await page.evaluate(`new Promise(resolve => {
      document.getElementById('demo-video').scrollIntoView({ block: 'center', behavior: 'instant' });
      document.querySelector('#demo button[data-video$="tour.mp4"]').click();
      document.querySelector('.roster button[data-cat="yuki"]').click();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve({
        manual: [...document.querySelectorAll('video[data-auto]')].every(v => v.paused && v.controls),
        still: document.getElementById('cat-stage-img').getAttribute('src'),
      })));
    })`);
    assert.equal(result.manual, true, JSON.stringify(options));
    assert.equal(result.still, 'assets/cat-countdown/cats/yuki-still.webp');
  }
});

test('Cat Countdown opens on its live backgrounds, each visit on a background and a cat that agree with what is shown', { timeout: 60000 }, async t => {
  const { catPage, eventually } = await import('./support/cat-countdown-browser.mjs');
  const read = page => page.evaluate(`(() => {
    const sections = [...document.querySelectorAll('main > section')];
    const swatch = document.querySelector('#backdrops .swatch[aria-pressed="true"]');
    const cat = document.querySelector('.roster button[aria-pressed="true"]');
    return {
      afterRelease: sections[sections.findIndex(s => s.classList.contains('release')) + 1].id,
      pressedSwatches: document.querySelectorAll('#backdrops .swatch[aria-pressed="true"]').length,
      swatchVideo: swatch.dataset.video,
      shownVideo: document.getElementById('backdrop-video').getAttribute('src'),
      cat: cat.dataset.name,
      stageName: document.getElementById('cat-stage-name').textContent,
      stageImg: document.getElementById('cat-stage-img').getAttribute('src'),
      featured: [...document.querySelectorAll('#backdrops .swatch small')].map(s => s.textContent),
      galleryMoreVisible: document.getElementById('gallery-more').getClientRects().length > 0,
      shownScenes: [...document.querySelectorAll('#art-grid > li')].filter(li => li.getClientRects().length > 0).length,
    };
  })()`);
  const plain = await read((await catPage(t, { scripts: false })).page);
  assert.equal(plain.afterRelease, 'backdrops', 'the backgrounds come straight after the release strip');
  assert.equal(plain.swatchVideo, 'assets/cat-countdown/captures/bg-weather.mp4', 'without scripts the section shows the weather');
  assert.equal(plain.shownVideo, plain.swatchVideo);
  assert.equal(plain.cat, 'Sakura');
  assert.equal(plain.stageName, 'Sakura');
  assert.equal(plain.stageImg, 'assets/cat-countdown/cats/sakura-still.webp');
  assert.equal(plain.galleryMoreVisible, false, 'no-JS visitors need no inactive gallery control');
  assert.equal(plain.shownScenes, 117, 'no-JS visitors can see every scene');
  assert.equal(new Set(plain.featured).size, plain.featured.length, 'every background features a different cat');
  assert.ok(!plain.featured.some(f => /Sakura/.test(f)), 'the backgrounds are not all Sakura');

  // Both ends of the random range must change the actual selection. Merely checking
  // that the labels and images agree would also pass with initialization removed.
  for (const reducedMotion of ['reduce', 'no-preference']) {
    for (const [randomValue, background, cat] of [[0, 'weather', 'Sakura'], [0.999999, 'ember', 'Yuki']]) {
      const { page } = await catPage(t, { reducedMotion, randomValue });
      await page.evaluate(`document.getElementById('cat-stage-img').scrollIntoView({ block: 'center', behavior: 'instant' })`);
      const expectedImage = `assets/cat-countdown/cats/${cat.toLowerCase()}-${reducedMotion === 'reduce' ? 'still' : 'alarm'}.webp`;
      await eventually(page, `document.getElementById('cat-stage-name').textContent === ${JSON.stringify(cat)} && document.getElementById('cat-stage-img').getAttribute('src') === ${JSON.stringify(expectedImage)}`);
      const live = await read(page);
      assert.equal(live.pressedSwatches, 1);
      assert.equal(live.swatchVideo, `assets/cat-countdown/captures/bg-${background}.mp4`);
      assert.equal(live.shownVideo, live.swatchVideo, 'the randomly chosen background is the one shown');
      assert.equal(live.cat, cat);
      assert.equal(live.stageName, cat, 'the cat on stage is the randomly chosen cat');
      assert.equal(live.stageImg, expectedImage);
      assert.equal(live.galleryMoreVisible, true);
      assert.equal(live.shownScenes, 24, 'scripts collapse the gallery only while its expansion control works');
      const expanded = await page.evaluate(`(() => {
        const more = document.getElementById('gallery-more');
        const label = more.innerText;
        more.click();
        return { label, visible: more.getClientRects().length > 0,
          scenes: [...document.querySelectorAll('#art-grid > li')].filter(li => li.getClientRects().length > 0).length };
      })()`);
      assert.deepEqual(expanded, { label: 'Show all 117 scenes', visible: false, scenes: 117 });
    }
  }
});

test('Cat Countdown promises only what the app does: attachments, History, renaming but no custom cats', { timeout: 15000 }, async t => {
  const { catPage } = await import('./support/cat-countdown-browser.mjs');
  const { page } = await catPage(t);
  const copy = await page.evaluate(`(() => {
    const details = [...document.querySelectorAll('#faq details')];
    details.forEach(d => d.querySelector('summary').click());
    const graph = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'];
    return { text: document.body.innerText,
      answers: details.map(d => [d.querySelector('summary').innerText, d.querySelector('p').innerText]),
      schemaAnswers: graph.find(n => n['@type'] === 'FAQPage').mainEntity.map(q => [q.name, q.acceptedAnswer.text]),
      features: graph.find(n => n['@type'] === 'SoftwareApplication').featureList };
  })()`);
  const history = copy.answers.find(([question]) => question === 'What happens when the day arrives?');
  assert.deepEqual(history, ['What happens when the day arrives?', 'The countdown is not deleted. It moves to History, so you can look back on every day you counted down to.']);
  assert.deepEqual(copy.answers, copy.schemaAnswers, 'the answers visitors can open agree with rich-result answers');
  assert.match(copy.text, /Attach photos to (?:a note|your notes)/);
  assert.match(copy.text, /clipboard for the day:[\s\S]*concert ticket[\s\S]*hotel reservation[\s\S]*boarding pass/);
  assert.doesNotMatch(copy.text, /create (?:a cat of )?your own|add my own/i);
  assert.doesNotMatch(JSON.stringify([copy.schemaAnswers, copy.features]), /create (?:a cat of )?your own|add my own/i);
});

test('Cat Countdown renders its FAQ and serves the media selected by real page interactions', { timeout: 60000 }, async t => {
  const { catPage } = await import('./support/cat-countdown-browser.mjs');
  const { page, origin } = await catPage(t);
  const initial = await page.evaluate(`(() => {
    const graph = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'];
    const faq = graph.find(n => n['@type'] === 'FAQPage');
    const details = [...document.querySelectorAll('#faq details')];
    details.forEach(d => d.querySelector('summary').click());
    return {
      visible: details.map(d => [d.querySelector('summary').innerText, d.querySelector('p').innerText]),
      declared: faq.mainEntity.map(q => [q.name, q.acceptedAnswer.text]),
      answersShown: details.every(d => d.open && d.querySelector('p').getClientRects().length > 0),
      graph,
      assets: [...document.querySelectorAll('img, video')].flatMap(el => [el.getAttribute('src'), el.getAttribute('poster')]).filter(Boolean),
      share: document.querySelector('meta[property="og:image"]').content,
    };
  })()`);
  assert.ok(initial.answersShown, 'FAQ summaries open their visible answers');
  assert.deepEqual(initial.visible, initial.declared, 'rendered answers equal the structured data');
  assert.equal(initial.share, 'https://catcountdown.factor-io.com/assets/cat-countdown/og.jpg');
  const requested = new Set(initial.assets);
  const videos = initial.graph.filter(n => n['@type'] === 'VideoObject');
  const app = initial.graph.find(n => n['@type'] === 'SoftwareApplication');
  for (const url of [app.image, ...app.screenshot, ...videos.flatMap(v => [v.contentUrl, v.thumbnailUrl])]) {
    assert.equal(new URL(url).origin, 'https://catcountdown.factor-io.com');
    requested.add(new URL(url).pathname);
  }

  const chapters = await page.evaluate(`(() => {
    const selected = [];
    document.querySelectorAll('[data-picker]').forEach(group => {
      const video = document.getElementById(group.dataset.picker);
      group.querySelectorAll('button[data-video]').forEach(button => {
        button.click();
        if (video.getAttribute('src') !== button.dataset.video || video.getAttribute('poster') !== button.dataset.poster || button.getAttribute('aria-pressed') !== 'true') throw new Error('chapter did not select its media');
        selected.push(video.getAttribute('src'), video.getAttribute('poster'));
      });
    });
    return selected;
  })()`);
  chapters.forEach(src => requested.add(src));
  for (const kind of ['tour', 'wizard', 'notes', 'tasks', 'alarm']) {
    assert.ok(chapters.includes(`assets/cat-countdown/captures/${kind}.mp4`), `missing promised ${kind} chapter`);
  }
  const capturePaths = new Set([...initial.assets, ...chapters].filter(src => src.endsWith('.mp4')).map(src => new URL(src, origin + '/').pathname));
  assert.deepEqual(new Set(videos.map(v => new URL(v.contentUrl).pathname)), capturePaths, 'each playable capture has exactly one corresponding VideoObject URL');
  assert.ok(app.screenshot.includes('https://catcountdown.factor-io.com/assets/cat-countdown/captures/tour.jpg'), 'the app schema includes an actual app screenshot');

  const scenes = await page.evaluate(`(() => {
    const click = (kind, value) => document.querySelector('.chips[data-filter="' + kind + '"] button[data-value="' + value + '"]').click();
    click('cat', 'yuki'); click('cg', 'trip');
    const shown = [...document.querySelectorAll('#art-grid > li')].filter(li => li.getClientRects().length);
    const result = shown.map(li => [li.dataset.cat, li.dataset.cg]);
    click('cat', ''); click('cg', '');
    const values = kind => [...document.querySelectorAll('.chips[data-filter="' + kind + '"] button[data-value]')].map(b => b.dataset.value).filter(Boolean);
    for (const cat of values('cat')) for (const cg of values('cg')) {
      if (!document.querySelector('#art-grid > li[data-cat="' + cat + '"][data-cg="' + cg + '"]')) throw new Error('missing scene for ' + cat + '/' + cg);
    }
    const media = [];
    document.querySelectorAll('#art-grid .art-tile').forEach(tile => {
      tile.click();
      const dialog = document.getElementById('art-dialog');
      if (!dialog.open) throw new Error('scene preview did not open');
      dialog.querySelectorAll('#art-dialog-looks button').forEach(button => {
        button.click();
        if (button.getAttribute('aria-pressed') !== 'true') throw new Error('look not selected');
        const src = document.getElementById('art-dialog-img').getAttribute('src');
        if (src !== button.querySelector('img').getAttribute('src')) throw new Error('look did not update scene');
        media.push(src);
      });
      dialog.querySelector('[data-close]').click();
      if (dialog.open) throw new Error('scene preview did not close');
    });
    return { result, media };
  })()`);
  assert.deepEqual(scenes.result, [['yuki', 'trip']], 'both gallery filters affect what the visitor sees');
  scenes.media.forEach(src => requested.add(src));
  const cats = await page.evaluate(`(() => {
    const media = [];
    document.querySelectorAll('.roster button').forEach(button => {
      button.click();
      const image = document.getElementById('cat-stage-img');
      if (!image.getAttribute('src').endsWith('/' + button.dataset.cat + '-still.webp')) throw new Error('reduced-motion cat did not select a still');
      if (document.getElementById('cat-stage-name').textContent !== button.dataset.name) throw new Error('cat name did not change');
      media.push(image.getAttribute('src'), ...[...document.querySelectorAll('#cat-poses img')].map(img => img.getAttribute('src')));
    });
    return media;
  })()`);
  cats.forEach(src => requested.add(src));
  for (const src of requested) {
    const response = await fetch(new URL(src, origin + '/cat-countdown.html'));
    assert.equal(response.status, 200, src);
    assert.match(response.headers.get('content-type'), /^(image\/|video\/)/, src);
    assert.ok((await response.arrayBuffer()).byteLength > 0, src);
  }
  const durations = await page.evaluate(`Promise.all(${JSON.stringify(videos.map(v => new URL(v.contentUrl).pathname))}.map(src => new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const timer = setTimeout(() => reject(new Error('metadata timeout: ' + src)), 5000);
    video.onloadedmetadata = () => { clearTimeout(timer); resolve(video.duration); video.removeAttribute('src'); video.load(); };
    video.onerror = () => { clearTimeout(timer); reject(new Error('unplayable media: ' + src)); };
    video.preload = 'metadata'; video.src = src; video.load();
  })))`);
  for (let i = 0; i < videos.length; i++) {
    const expected = Number(/^PT([\d.]+)S$/.exec(videos[i].duration)?.[1]);
    // JSON-LD expresses whole seconds; compare at that published precision.
    assert.equal(Math.round(durations[i]), expected, `${videos[i].contentUrl}: ${durations[i]} seconds vs ${videos[i].duration}`);
  }
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
  const catLanding = await fetch(`${base}/cat-countdown.html`); assert.equal(catLanding.status, 200); assert.equal(await catLanding.text(), await read('cat-countdown.html'));
  const catDirRedirect = await fetch(`${base}/catcountdown`, { redirect: 'manual' }); assert.equal(catDirRedirect.status, 301); assert.equal(catDirRedirect.headers.get('location'), '/catcountdown/');
  // Retired routes and /catcountdown/ are hand-written stubs, not generated output: they must still resolve rather than 404.
  for (const path of ['/en/platform/', '/en/governance/', '/en/how-we-work/', '/th/platform/', '/th/governance/', '/th/how-we-work/', '/catcountdown/']) {
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
  const catPromo = await fetch(`${base}/assets/work/cat-countdown-promo.mp4`, { headers: { range: 'bytes=0-99' } });
  assert.equal(catPromo.status, 206); assert.equal(catPromo.headers.get('content-type'), 'video/mp4'); assert.equal(catPromo.headers.get('accept-ranges'), 'bytes');
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

test('Light presentation maintains EN/TH parity, claim-register qualifiers, schema identity, and cross-site navigation', async () => {
  assertParity(lightContent.en, lightContent.th);
  const html = output.get('light.html');
  assert.ok(html, 'light.html must be in generated output');
  assert.equal(html, renderLight());
  assert.doesNotMatch(html, /[–—]/, 'light.html must not contain en-dash or em-dash');
  assert.doesNotMatch(JSON.stringify(lightContent), /[–—]/, 'lightContent must not contain en-dash or em-dash');

  // Two-sentence enforcement boundary (marketing/10182024/README.md:28-33)
  assert.ok(html.includes('Light governs the actions routed through it; native-tool restrictions ship as launch configuration, and actions taken outside Light are not covered.'));
  assert.ok(html.includes('seven harness specifications and six product families: Claude Code, Codex, Antigravity, ZCode, Muse and Pi) and no operational-history claim is made for any integration.'));

  // Reference-deployment attribution (U-1..U-3) and E-6 qualifier
  assert.match(html, /reference deployment/i);
  assert.match(html, /including aborted plans/i);
  assert.match(html, /97\.5%/);
  assert.match(html, /tool-return token/i);
  assert.match(html, /capability-to-control mapping for security review, not a legal compliance certification/i);

  // Paired two-track lifecycle: 4-state Session FSM (L-02) + 5-stage Work Lifecycle (L-10)
  for (const stateName of ['boot_locked', 'booted', 'grounded', 'executing']) {
    assert.ok(html.includes(stateName), `missing Session FSM state ${stateName}`);
  }
  for (const stageName of ['proposed', 'approved', 'executing', 'verified', 'closed']) {
    assert.ok(html.includes(stageName), `missing Work Lifecycle stage ${stageName}`);
  }

  // Six chapter anchors present
  for (const id of ['problem', 'architecture', 'velocity', 'economics', 'evidence', 'pilot']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing chapter #${id}`);
  }

  // Structured data matches registered Organization and Person particulars
  const graph = schema(html);
  const org = graph.find(n => n['@type'] === 'Organization');
  const person = graph.find(n => n['@type'] === 'Person');
  const software = graph.find(n => n['@type'] === 'SoftwareApplication');
  assert.equal(org.taxID, config.registration);
  assert.equal(person.name, config.founder);
  assert.equal(software.url, `${config.origin}/light.html`);

  // Cross-site discoverability
  assert.match(output.get('sitemap.xml'), /https:\/\/studio\.factor-io\.com\/light\.html/);
  assert.match(await read('llms.txt'), /https:\/\/studio\.factor-io\.com\/light\.html/);
  assert.match(await read('offerings.html'), /\/light\.html\?lang=en/);
  assert.match(await read('lightops-ai.html'), /\/light\.html\?lang=en/);
  for (const locale of ['en', 'th']) {
    assert.match(output.get(outputPath(locale, 'home')), new RegExp(`/light\\.html\\?lang=${locale}`));
    assert.match(output.get(outputPath(locale, 'services')), new RegExp(`/light\\.html\\?lang=${locale}`));
  }
});

test('calculateEconomics enforces flat-rate vs metered E-6 rules, zero denominators, negative net outcomes, and input bounds', () => {
  const flat = calculateEconomics({ ...DEFAULT_WORKLOAD, billingMode: 'flat-rate' });
  assert.equal(flat.valid, true);
  assert.equal(flat.line1ContextMonthly, 0, 'E-6: flat-rate seats must report $0 direct token cash savings');
  assert.equal(flat.breakEvenMinutesPerSeatMonth, 30);
  assert.ok(flat.grossMonthlyValue > 0);
  assert.ok(flat.netAnnualValue > 0);

  const metered = calculateEconomics({
    ...DEFAULT_WORKLOAD,
    billingMode: 'metered',
    seats: 50,
    meteredTokenSpendPerSeatMonth: 200,
    tokenReturnSharePct: 50,
  });
  assert.equal(metered.valid, true);
  assert.equal(metered.line1ContextMonthly, Math.round(50 * 200 * 0.5 * 0.975));
  assert.ok(metered.grossMonthlyValue > flat.grossMonthlyValue);

  // Zero denominators must never produce NaN or Infinity
  const zeroDenom = calculateEconomics({
    ...DEFAULT_WORKLOAD,
    seats: 0,
    hourlyRate: 0,
    subscriptionCostPerSeatMonth: 0,
    sreSeats: 0,
  });
  assert.equal(zeroDenom.valid, true);
  assert.equal(zeroDenom.breakEvenMinutesPerSeatMonth, null);
  assert.equal(zeroDenom.paybackMultiple, null);
  assert.equal(zeroDenom.hoursSavedPerSeatMonth, 0);

  // Negative net outcome when savings are zero and subscription cost is positive
  const negativeNet = calculateEconomics({
    ...DEFAULT_WORKLOAD,
    billingMode: 'flat-rate',
    seats: 20,
    reviewHoursPerWeek: 0,
    incidentsPerYear: 0,
    releaseHoursPerWeek: 0,
    sreSeats: 0,
    subscriptionCostPerSeatMonth: 100,
  });
  assert.equal(negativeNet.valid, true);
  assert.equal(negativeNet.grossMonthlyValue, 0);
  assert.equal(negativeNet.subscriptionMonthlyCost, 2000);
  assert.equal(negativeNet.netMonthlyValue, -2000);
  assert.equal(negativeNet.netAnnualValue, -24000);

  // Invalid / out-of-range inputs fail cleanly with errorCode OUT_OF_RANGE
  for (const bad of [
    { seats: -1 },
    { reviewReductionPct: 105 },
    { hourlyRate: Number.NaN },
    { incidentCost: '' },
  ]) {
    const res = calculateEconomics({ ...DEFAULT_WORKLOAD, ...bad });
    assert.equal(res.valid, false);
    assert.equal(res.errorCode, 'OUT_OF_RANGE');
    assert.ok(res.invalidFields.length >= 1);
  }
});

test('bindPresentation switches EN/TH, toggles presentation mode, steps chapters, and ignores arrow keys on interactive inputs', () => {
  const makeEl = (tag = 'DIV', attrs = {}) => {
    const node = new FakeNode();
    node.tagName = tag;
    node.textContent = '';
    node.value = '';
    node.hidden = false;
    node.disabled = false;
    const classes = new Set();
    node.classList = {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      toggle: (c, force) => {
        const on = force === undefined ? !classes.has(c) : Boolean(force);
        if (on) classes.add(c); else classes.delete(c);
        return on;
      },
      contains: c => classes.has(c),
    };
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  const heroTitle = makeEl('H1', { 'data-i18n': 'heroTitle' });
  const indicator = makeEl('SPAN', { 'data-chapter-indicator': '' });
  const contactLink = makeEl('A', { 'data-locale-route': 'contact', href: '/en/contact/' });
  const prevBtn = makeEl('BUTTON', { 'data-chapter-step': 'prev' });
  const nextBtn = makeEl('BUTTON', { 'data-chapter-step': 'next' });
  const chapters = Array.from({ length: 6 }, (_, i) => makeEl('SECTION', { 'data-chapter-index': String(i) }));
  const compRowDoc = makeEl('TR', { 'data-comp-row': 'all documented-hook' });
  const compRowGap = makeEl('TR', { 'data-comp-row': 'all gate-gap' });
  const compEmpty = makeEl('DIV', { 'data-comp-empty': '' });
  const breakEvenOut = makeEl('P', { 'data-econ-out': 'breakEven' });
  const line1Out = makeEl('TD', { 'data-econ-out': 'line1' });
  const errBanner = makeEl('DIV', { 'data-econ-error': '' });

  const root = makeEl('HTML');
  const selectorMap = {
    '[data-i18n]': [heroTitle],
    '[data-locale-route]': [contactLink],
    '.presentation-chapter': chapters,
    '[data-comp-row]': [compRowDoc, compRowGap],
    '[data-econ-field]': [],
    '[data-billing-mode]': [],
    '[data-lang-btn]': [],
    '[data-mode-btn]': [],
    '[data-chapter-nav]': [],
    '[data-econ-preset]': [],
    '[data-comp-filter]': [],
    '[data-comp-reset]': [],
    '[data-persona-filter]': [],
    '[data-persona-group]': [],
  };
  const singleMap = {
    '[data-chapter-indicator]': indicator,
    '[data-chapter-step="prev"]': prevBtn,
    '[data-chapter-step="next"]': nextBtn,
    '[data-comp-empty]': compEmpty,
    '[data-econ-out="breakEven"]': breakEvenOut,
    '[data-econ-out="line1"]': line1Out,
    '[data-econ-error]': errBanner,
  };
  root.querySelectorAll = sel => selectorMap[sel] || [];
  root.querySelector = sel => singleMap[sel] || null;

  const ctrl = bindPresentation(root, { window: { location: { search: '?lang=en' }, addEventListener: () => {} } });
  assert.equal(ctrl.state.lang, 'en');
  assert.equal(heroTitle.textContent, lightContent.en.heroTitle);

  ctrl.setLang('th');
  assert.equal(ctrl.state.lang, 'th');
  assert.equal(heroTitle.textContent, lightContent.th.heroTitle);
  assert.equal(contactLink.getAttribute('href'), '/th/contact/');

  ctrl.setMode('presentation');
  assert.equal(root.getAttribute('data-presentation-mode'), 'presentation');
  assert.equal(ctrl.state.activeChapter, 0);

  // ArrowRight on document body advances chapter in presentation mode
  assert.equal(ctrl.onKeyDown({ key: 'ArrowRight', target: { tagName: 'BODY' }, preventDefault() {} }), true);
  assert.equal(ctrl.state.activeChapter, 1);
  assert.equal(chapters[1].classList.contains('is-active-chapter'), true);

  // ArrowRight inside an <input> is ignored so calculator editing never jumps slides
  assert.equal(ctrl.onKeyDown({ key: 'ArrowRight', target: { tagName: 'INPUT' }, preventDefault() {} }), false);
  assert.equal(ctrl.state.activeChapter, 1);

  // Escape exits presentation mode back to reading mode
  assert.equal(ctrl.onKeyDown({ key: 'Escape', target: { tagName: 'BODY' } }), true);
  assert.equal(ctrl.state.mode, 'reading');

  // Filter empty state and reset
  assert.equal(ctrl.setCompFilter('nonexistent-tag'), 0);
  assert.equal(compEmpty.hidden, false);
  assert.equal(ctrl.setCompFilter('all'), 2);
  assert.equal(compEmpty.hidden, true);

  // Workload update switches flat-rate ($0) vs metered (>$0) and surfaces validation error on invalid input
  ctrl.updateWorkload({ billingMode: 'metered', seats: 50, meteredTokenSpendPerSeatMonth: 200, tokenReturnSharePct: 50 });
  assert.equal(line1Out.textContent, '$4,875');
  ctrl.updateWorkload({ seats: -10 });
  assert.equal(errBanner.hidden, false);
  ctrl.applyPreset('enterprise');
  assert.equal(errBanner.hidden, true);
  assert.equal(ctrl.state.workload.seats, WORKLOAD_PRESETS.enterprise.seats);
});
