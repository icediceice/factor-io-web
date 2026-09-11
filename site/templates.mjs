import { config, routes, routePath } from './config.mjs';

export const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const link = (href, label, cls = 'text-link') => `<a class="${cls}" href="${esc(href)}">${esc(label)}</a>`;

export function renderJsonLd() {
  return `<script type="application/ld+json">${json({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': `${config.origin}/#organization`, name: config.name, legalName: config.legalName, url: `${config.origin}/`, email: config.email, description: config.organizationDescription, founder: { '@id': `${config.origin}/#founder` } },
    { '@type': 'Person', '@id': `${config.origin}/#founder`, name: config.founder, jobTitle: config.role, description: config.founderDescription, worksFor: { '@id': `${config.origin}/#organization` }, sameAs: [config.linkedin, config.github] },
  ] })}</script>`;
}

function topology(c) {
  const t = c.topology;
  return `<figure class="topology" aria-label="${esc(t.title)}">
    <div class="figure-heading"><span class="signal" aria-hidden="true"></span>${esc(t.title)}</div>
    <div class="model-row">${t.models.map(m => `<span>${esc(m)}</span>`).join('')}</div>
    <div class="connector" aria-hidden="true">↓</div><div class="agent-node">${esc(t.agent)}</div>
    <div class="connector" aria-hidden="true">↓</div><div class="boundary"><strong>${esc(t.boundary)}</strong>
    <ul>${t.fields.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
    <div class="connector" aria-hidden="true">↓</div><div class="systems-node">${esc(t.systems)}</div>
    <p class="figure-note">${esc(t.note)}</p><figcaption>${esc(t.caption)}</figcaption>
  </figure>`;
}

function progression(c) {
  const p = c.progression;
  return `<section class="progress-section" aria-labelledby="progress-title"><div class="section-heading"><h2 id="progress-title">${esc(p.title)}</h2><p>${esc(p.body)}</p></div>
    <ol class="progression">${p.steps.map((s, i) => `<li${i === 3 ? ' class="human-step"' : ''}><span aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>${esc(s)}</li>`).join('')}</ol></section>`;
}

function demo(c) {
  const d = c.demo;
  return `<div class="demo" data-demo data-copy="${esc(JSON.stringify(d))}">
    <h3>${esc(d.title)}</h3><p>${esc(d.intro)}</p>
    <dl class="identity-row"><div><dt>${esc(d.identity)}</dt><dd><code>workflow-agent-17</code></dd></div><div><dt>${esc(d.scope)}</dt><dd><code>staging/*</code></dd></div></dl>
    <div class="demo-interactive" hidden>
      <div class="field-row"><label>${esc(d.target)}<select name="target"><option>production/payment-api</option><option>staging/payment-api</option><option>production/reporting-api</option></select></label>
      <label>${esc(d.revision)}<input name="revision" type="number" min="1" max="999999" value="182" required></label></div>
      <p class="operation">${esc(d.operation)}: <code>restart</code></p>
      <p id="approval-label">${esc(d.approvalLabel)}</p>
      <div class="actions"><button type="button" data-evaluate>${esc(d.request)}</button><button type="button" class="secondary" data-approve aria-describedby="approval-label">${esc(d.approve)}</button><button type="button" class="quiet" data-reset>${esc(d.reset)}</button></div>
    </div>
    <p class="demo-status" role="status" aria-live="polite" data-status data-state="denied">${esc(d.initial)}</p>
    <p class="demo-evidence">${esc(d.evidence)}</p><p class="static-explanation">${esc(d.static)}</p>
  </div>`;
}

function contact(c) {
  const d = c.contact;
  return `<div class="contact-layout"><div class="contact-aside"><h3>${esc(d.title)}</h3><p>${esc(d.intro)}</p><p>${esc(c.ui.contactNote)}</p>
    <p>${esc(d.fallback)}<br>${link(`mailto:${config.email}`, config.email)}</p>${link('/privacy.html#website-enquiries', d.privacy)}<noscript><p>${esc(d.nojs)}</p></noscript></div>
    <div data-contact data-copy="${esc(JSON.stringify(d))}" data-recipient="${esc(config.email)}">
    <form hidden>
      <div class="field-row"><label>${esc(d.name)} <span aria-hidden="true">*</span><input name="name" autocomplete="name" maxlength="100" required></label>
      <label>${esc(d.email)} <span aria-hidden="true">*</span><input name="email" type="email" autocomplete="email" maxlength="254" required></label></div>
      <label>${esc(d.company)}<input name="company" autocomplete="organization" maxlength="160"></label>
      <label>${esc(d.workflow)} <span aria-hidden="true">*</span><textarea name="workflow" rows="6" maxlength="4000" required aria-describedby="workflow-hint"></textarea></label>
      <p id="workflow-hint" class="hint">${esc(d.hint)}</p><button type="submit">${esc(d.prepare)}</button>
    </form>
    <p class="form-status" role="status" aria-live="polite"></p>
    <div class="draft-panel" hidden><label>${esc(d.draft)}<textarea class="email-draft" rows="12" readonly></textarea></label>
    <div class="actions"><a class="button" data-mail hidden>${esc(d.open)}</a><button class="secondary" type="button" data-copy-draft>${esc(d.copy)}</button></div></div>
    </div></div>`;
}

function section(c, s) {
  let detail = '';
  if (s.kind === 'architecture') detail = topology(c);
  else if (s.kind === 'demo') detail = demo(c);
  else if (s.kind === 'contact') detail = contact(c);
  else if (s.kind === 'founder') detail = `<div class="founder-links">${link(config.linkedin, 'LinkedIn ↗')}${link(config.github, 'GitHub ↗')}${link(routePath(c.locale, 'about'), c.pages.about.nav)}</div>`;
  else if (s.items.length) {
    const tag = ['flow', 'ledger'].includes(s.kind) ? 'ol' : 'ul';
    detail = `<${tag} class="items ${s.kind}">${s.items.map((item, i) => `<li><span class="item-index" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></div></li>`).join('')}</${tag}>`;
  }
  return `<section id="${s.id}" class="content-section section-${s.kind}" aria-labelledby="${s.id}-title"><div class="section-heading"><p class="kicker">${esc(s.kicker)}</p><h2 id="${s.id}-title">${esc(s.title)}</h2><p>${esc(s.body)}</p></div>${detail}</section>`;
}

export function renderPage(c, page, assets = {}) {
  const p = c.pages[page], locale = c.locale, u = c.ui;
  const canonical = config.origin + routePath(locale, page);
  const asset = name => `/assets/${name}${assets[name] ? `?v=${assets[name]}` : ''}`;
  const nav = routes.map(r => `<a href="${routePath(locale, r)}"${r === page ? ' aria-current="page"' : ''}>${esc(c.pages[r].nav)}</a>`).join('');
  const language = Object.entries(config.locales).map(([lang, meta]) => `<a href="${routePath(lang, page)}" lang="${lang}" hreflang="${lang}"${lang === locale ? ' aria-current="true"' : ''}>${meta.label}</a>`).join('');
  return `<!DOCTYPE html>
<!-- Generated by scripts/build-site.mjs; edit content and templates, not this file. -->
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)} | Factor IO</title><meta name="description" content="${esc(p.description)}">
<meta name="robots" content="${config.locales[locale].indexable ? 'index, follow' : 'noindex, follow'}"><link rel="canonical" href="${canonical}">
${Object.keys(config.locales).map(lang => `<link rel="alternate" hreflang="${lang}" href="${config.origin}${routePath(lang, page)}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${config.origin}${routePath('en', page)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Factor IO"><meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.description)}"><meta property="og:url" content="${canonical}"><meta property="og:locale" content="${config.locales[locale].og}"><meta name="twitter:card" content="summary">
<meta name="theme-color" content="#f4f3ed"><link rel="icon" href="${asset('favicon.svg')}" type="image/svg+xml"><link rel="stylesheet" href="${asset('site.css')}">
${renderJsonLd()}<script type="module" src="${asset('site.js')}"></script></head>
<body id="top" class="page-${page}"><a class="skip" href="#main">${esc(u.skip)}</a>
<header class="site-header"><div class="header-inner"><a class="brand" href="${routePath(locale, 'home')}" aria-label="${esc(u.home)}">FACTOR <span>I/O</span></a>
<button class="menu-toggle quiet" type="button" aria-expanded="false" aria-controls="main-nav" hidden>${esc(u.menu)} <span aria-hidden="true">≡</span></button>
<nav id="main-nav" aria-label="${esc(u.nav)}">${nav}</nav><nav class="language" aria-label="${esc(u.language)}">${language}</nav></div></header>
<main id="main"><div class="wrap"><section class="hero ${page === 'home' ? 'hero-home' : ''}" aria-labelledby="page-title"><div class="hero-copy"><p class="kicker">${esc(p.eyebrow)}</p><h1 id="page-title">${esc(p.headline)}</h1><p class="lede">${esc(p.lede)}</p>
${page !== 'contact' ? `<div class="actions">${link(routePath(locale, 'contact'), u.primary, 'button')}${page === 'home' ? link(routePath(locale, 'governance'), u.secondary, 'text-link') : ''}</div>` : ''}</div>${page === 'home' ? topology(c) : '<div class="page-rule" aria-hidden="true"><span>F / IO</span></div>'}</section>
${p.sections.map((s, i) => `${section(c, s)}${page === 'home' && i === 2 ? `<p class="service-link">${link(routePath(locale, 'services'), u.learn)}</p>${progression(c)}` : ''}`).join('\n')}
${page === 'how-we-work' ? progression(c) : ''}
${page === 'home' ? `<section class="governance-teaser"><p>${esc(c.topology.note)}</p>${link(routePath(locale, 'governance'), u.secondary, 'button secondary')}</section>` : ''}
${page !== 'contact' ? `<section class="cta"><div><h2>${esc(u.ctaTitle)}</h2><p>${esc(u.ctaBody)}</p></div>${link(routePath(locale, 'contact'), u.ctaLink, 'button')}</section>` : ''}
</div></main><footer class="site-footer"><div class="wrap footer-grid"><div><a class="brand" href="${routePath(locale, 'home')}">FACTOR <span>I/O</span></a><p>${esc(u.footer)}</p><p class="legal">© ${c.updated.slice(0, 4)} ${esc(config.legalName)}</p></div><div><h2>${esc(u.resources)}</h2>${link('/tco-calculator.html', u.calculator)}${link('/light-tools.html', u.tools)}</div><div>${link(`mailto:${config.email}`, config.email)}${link('/privacy.html', u.privacy)}${link('#top', u.backTop)}</div></div></footer></body></html>
`;
}
