import { config, routes, routePath } from './config.mjs';
import { films, filmFile, filmPoster, work, workFile } from './media.mjs';

export const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
// Preserve the direct no-JS contact path through Cloudflare's HTML edge filter, which
// rewrites a mailto link or a bare address in text into a script-decoded "[email protected]".
const optOut = html => `<!--email_off-->${html}<!--/email_off-->`;
const hasAddress = text => /[\w.+-]+@[\w-]+\.[\w.-]+/.test(text);
const link = (href, label, cls = 'text-link') => {
  const anchor = `<a class="${cls}" href="${esc(href)}">${esc(label)}</a>`;
  return href.startsWith('mailto:') ? optOut(anchor) : anchor;
};

export function renderJsonLd(page = 'home', locale = 'en') {
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${config.origin}/#organization`,
      name: config.name,
      legalName: config.legalName,
      url: `${config.origin}/`,
      email: config.email,
      telephone: config.phone,
      taxID: config.registration,
      address: {
        '@type': 'PostalAddress',
        streetAddress: config.address.street,
        addressLocality: config.address.locality,
        addressRegion: config.address.region,
        postalCode: config.address.postalCode,
        addressCountry: config.address.country,
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 13.8282,
        longitude: 100.7077,
      },
      description: config.organizationDescription,
      founder: { '@id': `${config.origin}/#founder` },
      areaServed: [
        { '@type': 'Country', name: 'Thailand' },
        { '@type': 'City', name: 'Bangkok' },
        { '@type': 'Place', name: 'Southeast Asia' },
      ],
      knowsAbout: [
        'Kubernetes Platform Engineering',
        'Enterprise AI Governance',
        'Private AI & GPU Infrastructure',
        'Enterprise Infrastructure Architecture',
        'vSphere to KVM / Nutanix / Kubevirt Migration',
        'Red Hat OpenShift',
        'Ceph Distributed Storage',
        'Deterministic Human-in-the-Loop Controls',
      ],
      priceRange: '$$$$',
      currenciesAccepted: 'THB',
      sameAs: [config.linkedin, config.github],
    },
    {
      '@type': 'Person',
      '@id': `${config.origin}/#founder`,
      name: config.founder,
      jobTitle: config.role,
      description: config.founderDescription,
      worksFor: { '@id': `${config.origin}/#organization` },
      sameAs: [config.linkedin, config.github],
      knowsAbout: [
        'Kubernetes Platform Engineering',
        'Enterprise Infrastructure Architecture',
        'Red Hat OpenShift',
        'Nutanix Enterprise Cloud',
        'Private AI & LLM Inference',
        'Systems Integrator Technical Enablement',
      ],
      alumniOf: [
        { '@type': 'Organization', name: 'Red Hat' },
        { '@type': 'Organization', name: 'Nutanix' },
      ],
    },
    {
      '@type': 'WebSite',
      '@id': `${config.origin}/#website`,
      url: `${config.origin}/`,
      name: 'Factor IO',
      publisher: { '@id': `${config.origin}/#organization` },
      inLanguage: ['en-US', 'th-TH'],
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: `${config.origin}/`,
        },
        ...(page !== 'home' ? [{
          '@type': 'ListItem',
          position: 2,
          name: page.charAt(0).toUpperCase() + page.slice(1),
          item: `${config.origin}${routePath(locale, page)}`,
        }] : []),
      ],
    },
    {
      '@type': 'Service',
      '@id': `${config.origin}/#service-k8s`,
      name: 'Kubernetes Platform Engineering',
      provider: { '@id': `${config.origin}/#organization` },
      areaServed: { '@type': 'Country', name: 'Thailand' },
      description: 'Production container platforms, bare-metal clusters, GitOps pipelines and automated multi-tenant infrastructure operations.',
      category: 'Cloud Infrastructure & Platform Engineering',
    },
    {
      '@type': 'Service',
      '@id': `${config.origin}/#service-migration`,
      name: 'Enterprise Cloud Migration & Modernization',
      provider: { '@id': `${config.origin}/#organization` },
      areaServed: { '@type': 'Country', name: 'Thailand' },
      description: 'Workload migration from legacy hypervisors (vSphere) to open cloud-native virtualization (Nutanix AHV, KubeVirt, KVM) and software-defined storage.',
      category: 'Cloud Migration',
    },
    {
      '@type': 'Service',
      '@id': `${config.origin}/#service-ai`,
      name: 'Private AI & Inference Infrastructure',
      provider: { '@id': `${config.origin}/#organization` },
      areaServed: { '@type': 'Country', name: 'Thailand' },
      description: 'On-premises LLM inference clusters, vLLM / Triton model deployment, GPU hardware acceleration and private enterprise data pipelines.',
      category: 'Artificial Intelligence Infrastructure',
    },
    {
      '@type': 'Service',
      '@id': `${config.origin}/#service-governance`,
      name: 'Governed AI Execution & Runtime Control',
      provider: { '@id': `${config.origin}/#organization` },
      areaServed: { '@type': 'Country', name: 'Thailand' },
      description: 'Deterministic human-in-the-loop gates, immutable audit trails, and strict policy engines governing autonomous AI agent actions in production.',
      category: 'AI Governance',
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What services does Factor IO specialize in within Thailand?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Factor IO delivers enterprise Kubernetes platform engineering, legacy virtualization migration (vSphere to KVM/Nutanix/KubeVirt), private GPU AI inference clusters, and runtime AI governance systems for Thai enterprises and systems integrators.',
          },
        },
        {
          '@type': 'Question',
          name: 'Why must enterprise AI run on governed Kubernetes infrastructure?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Enterprise AI workloads demand elastic GPU scheduling, secure containerized isolation, deterministic human authorization gates, and strict access controls—all foundational capabilities of governed Kubernetes platforms.',
          },
        },
        {
          '@type': 'Question',
          name: 'Who provides technical leadership at Factor IO?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Factor IO is led by Thanat Manasakool, Principal Engineer with nearly 20 years in enterprise infrastructure and former Ecosystem Solutions Architect for Red Hat and Nutanix.',
          },
        },
      ],
    },
  ];
  return `<script type="application/ld+json">${json({ '@context': 'https://schema.org', '@graph': graph })}</script>`;
}

// Film copy marks the accent with '*word*' and a line break with '\n'; the transcript drops both.
const plain = text => text.replace(/\*/g, '').replace(/\s*\n\s*/g, ' ');
const index = i => `<span class="index" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>`;

// A rendered film with its chapter bar and a transcript. Without JavaScript the video keeps
// its native controls; site.js swaps them for the pause button and chapter seeking.
function film(c, id) {
  const f = c.films[id], spec = films[id], u = c.films, tid = `film-${id}-transcript`;
  return `<figure class="film" data-film="${id}" data-duration="${spec.duration}">
    <div class="film-frame"><video class="film-video" controls muted playsinline loop preload="none" width="1920" height="1080" poster="${filmPoster(id, c.locale)}" aria-label="${esc(f.title)}" aria-describedby="${tid}"><source src="${filmFile(id, c.locale)}" type="video/mp4"></video>
    <button type="button" class="film-toggle" data-film-toggle data-play="${esc(u.play)}" data-pause="${esc(u.pause)}" aria-label="${esc(u.play)}" hidden><span aria-hidden="true"></span></button></div>
    <figcaption class="film-bar"><p class="film-caption"><strong>${esc(f.title)}</strong> ${esc(f.caption)}</p>
    <ol class="film-chapters" aria-label="${esc(u.chapters)}">${f.chapters.map((ch, i) => `<li><button type="button" data-chapter="${i}" data-start="${spec.chapters[i]}"><span class="film-meter" aria-hidden="true"><i></i></span><span class="film-chapter">${esc(ch.title)}</span></button></li>`).join('')}</ol>
    <details class="film-transcript" id="${tid}"><summary>${esc(u.transcript)}</summary>${f.chapters.map(ch => `<p><strong>${esc(ch.title)}.</strong> ${esc(plain(ch.line))} ${esc(ch.sub)}</p>`).join('')}${f.closing ? `<p>${esc(plain(f.closing))}</p>` : ''}</details></figcaption>
  </figure>`;
}

function topology(c) {
  const t = c.topology;
  return `<figure class="topology" aria-label="${esc(t.title)}">
    <p class="topology-title">${esc(t.title)}</p>
    <div class="topology-models">${t.models.map(m => `<span>${esc(m)}</span>`).join('')}</div>
    <div class="topology-agent">${esc(t.agent)}</div>
    <div class="topology-boundary"><strong>${esc(t.boundary)}</strong><ul>${t.fields.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
    <div class="topology-systems">${esc(t.systems)}</div>
    <p class="topology-note">${esc(t.note)}</p><figcaption>${esc(t.caption)}</figcaption>
  </figure>`;
}

function demo(c) {
  const d = c.demo;
  const stages = d.stages.map((label, i) => `<li class="flow-node" data-stage="${i}" data-state="idle"><span class="flow-label">${esc(label)}</span></li>`).join('');
  return `<div class="demo" data-demo data-copy="${esc(JSON.stringify(d))}">
    <div class="demo-head"><h3>${esc(d.title)}</h3><p>${esc(d.intro)}</p></div>
    <dl class="identity-row"><div><dt>${esc(d.identity)}</dt><dd><code>workflow-agent-17</code></dd></div><div><dt>${esc(d.scope)}</dt><dd><code>staging/*</code></dd></div></dl>
    <ol class="flowchart" data-flow aria-hidden="true">${stages}</ol>
    <p class="flow-halt" data-halt hidden aria-hidden="true">${esc(d.halt)}</p>
    <p class="flow-legend" aria-hidden="true">${esc(d.legend)}</p>
    <div class="demo-interactive" hidden>
      <div class="demo-fields"><label>${esc(d.target)}<select name="target"><option>production/payment-api</option><option>staging/payment-api</option><option>production/reporting-api</option></select></label>
      <label>${esc(d.revision)}<input name="revision" type="number" min="1" max="999999" value="182" required></label></div>
      <p class="operation">${esc(d.operation)}: <code>restart</code></p>
      <p id="approval-label">${esc(d.approvalLabel)}</p>
      <div class="actions"><button type="button" class="button" data-evaluate>${esc(d.request)}</button><button type="button" class="button button-quiet" data-approve aria-describedby="approval-label">${esc(d.approve)}</button><button type="button" class="button button-text" data-reset>${esc(d.reset)}</button></div>
    </div>
    <p class="demo-status" role="status" aria-live="polite" data-status data-state="denied">${esc(d.initial)}</p>
    <p class="demo-evidence">${esc(d.evidence)}</p><p class="static-explanation">${esc(d.static)}</p>
  </div>`;
}

function contact(c, asset = name => `/assets/${name}`) {
  const d = c.contact;
  return `<div class="contact-layout"><div class="contact-aside"><h3>${esc(d.title)}</h3><p>${esc(d.intro)}</p></div>
    <div class="line-card">
    <a class="button line-action" href="${config.lineUrl}" rel="noopener">${esc(d.lineAction)}</a>
    <figure class="line-qr"><img src="${asset('line-qr.jpg')}" width="663" height="663" alt="${esc(d.qrAlt)}" loading="lazy" decoding="async">
    <figcaption>${esc(d.qrCaption)}</figcaption></figure>
    <p class="line-id">${esc(d.lineIdLabel)} <code>${esc(config.lineId)}</code></p>
    </div>
    <div class="contact-fallback"><p class="contact-direct">${esc(d.fallback)}<br><!--email_off--><a href="mailto:${config.email}">${config.email}</a><!--/email_off--></p>
    ${link('/privacy.html#website-enquiries', d.privacy)}</div></div>`;
}

// Studio output. The home strip is deliberately small: one real visual per item and a link
// to the studio-work page, where the full variant carries every screenshot and the promo.
const shot = (s, alt) => `<img src="${workFile(s.file)}" width="${s.width}" height="${s.height}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
function frames(item, count) {
  const m = work[item.id], shots = m.shots.slice(0, count);
  if (m.frame === 'browser') return `<div class="frame-browser"><span class="frame-bar" aria-hidden="true"><i></i><i></i><i></i></span>${shot(shots[0], item.shots[0])}</div>`;
  if (m.frame === 'icon') return `<div class="frame-icon">${shot(shots[0], item.shots[0])}</div>`;
  return shots.map((s, i) => `<div class="frame-phone">${shot(s, item.shots[i])}</div>`).join('');
}

function studioWork(c, s) {
  const page = routePath(c.locale, 'mobile-apps');
  if (s.variant === 'strip') {
    return `<ul class="tiles">${s.items.map(item => `<li class="tile tile-${work[item.id].frame}"><div class="tile-media">${frames(item, 1)}</div>
      <h3><a href="${page}#${item.id}">${esc(item.title)}</a></h3><p class="tile-meta">${esc(item.meta)}</p><p>${esc(item.body)}</p></li>`).join('')}</ul>
    <p class="section-link">${link(page, c.ui.workLink)}</p>`;
  }
  return `<div class="work-list">${s.items.map(item => {
    const m = work[item.id];
    const promo = m.promo ? `<figure class="frame-promo"><video controls muted playsinline preload="none" width="${m.promo.width}" height="${m.promo.height}" poster="${workFile(m.promo.poster)}" aria-label="${esc(item.promo)}"><source src="${workFile(m.promo.file)}" type="video/mp4"></video><figcaption>${esc(item.promo)}</figcaption></figure>` : '';
    return `<article class="work-item work-${m.frame}" id="${item.id}" aria-labelledby="${item.id}-title">
      <div class="work-media">${promo}${frames(item, m.shots.length)}</div>
      <div class="work-text"><p class="work-meta">${esc(item.meta)}</p><h3 id="${item.id}-title">${esc(item.title)}</h3><p>${esc(item.body)}</p>
      <p class="work-status">${esc(item.status)}</p>${m.href && item.action ? link(m.href, item.action, 'button button-quiet') : ''}</div>
    </article>`;
  }).join('')}</div>`;
}

function list(c, s) {
  if (s.kind === 'ledger') return `<ol class="ledger">${s.items.map((item, i) => `<li${s.film ? ` data-row="${i}"` : ''}>${index(i)}<div><h3>${s.film ? `<button type="button" class="ledger-seek" data-seek="${i}">${esc(item.title)}</button>` : esc(item.title)}</h3><p>${esc(item.body)}</p></div></li>`).join('')}</ol>`;
  if (s.kind === 'process') return `<ol class="process">${s.items.map((item, i) => `<li>${index(i)}<h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></li>`).join('')}</ol>`;
  if (s.kind === 'routes') return `<ul class="routes">${s.items.map(item => `<li><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p><p class="route-mark"><span>${esc(c.ui.routeMark)}</span> ${esc(item.mark)}</p></li>`).join('')}</ul>`;
  if (s.kind === 'exceptions') return `<dl class="facts">${s.items.map(item => `<div><dt>${esc(item.title)}</dt><dd>${hasAddress(item.body) ? optOut(esc(item.body)) : esc(item.body)}</dd></div>`).join('')}</dl>`;
  if (s.kind === 'cards') return `<ul class="cards">${s.items.map(item => `<li><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></li>`).join('')}</ul>`;
  return '';
}

function section(c, s, page, asset, extra = '') {
  const head = `<div class="section-head"><h2 id="${s.id}-title">${esc(s.title)}</h2><p>${esc(s.body)}</p></div>`;
  let body;
  if (s.kind === 'statement' && s.film) body = `<div class="split">${head}${film(c, s.film)}</div>`;
  else if (s.film) body = `${head}<div class="film-group" data-film-group>${film(c, s.film)}${list(c, s)}</div>`;
  else if (s.kind === 'architecture') body = `<div class="split">${head}${topology(c)}</div>`;
  else if (s.kind === 'demo') body = `${head}${demo(c)}`;
  else if (s.kind === 'contact') body = `${head}${contact(c, asset)}`;
  else if (s.kind === 'work') body = `${head}${studioWork(c, s)}`;
  else if (s.kind === 'founder') body = `<div class="split">${head}<div class="founder-links">${link(config.linkedin, 'LinkedIn ↗')}${link(config.github, 'GitHub ↗')}${page === 'about' ? '' : link(routePath(c.locale, 'about'), c.pages.about.nav)}</div></div>`;
  else if (s.kind === 'exceptions' || s.kind === 'statement') body = `<div class="split">${head}${list(c, s)}</div>`;
  else body = `${head}${list(c, s)}`;
  return `<section id="${s.id}" class="section section-${s.kind}${s.variant ? ` section-${s.variant}` : ''}" aria-labelledby="${s.id}-title">${body}${extra}</section>`;
}

export function renderPage(c, page, assets = {}) {
  const p = c.pages[page], locale = c.locale, u = c.ui;
  const canonical = config.origin + routePath(locale, page);
  const asset = name => `/assets/${name}${assets[name] ? `?v=${assets[name]}` : ''}`;
  // Contact is the header's button; the brand is the way home.
  const nav = ['services', 'about', 'profile', 'mobile-apps'].map(r => `<a href="${routePath(locale, r)}"${r === page ? ' aria-current="page"' : ''}>${esc(c.pages[r].nav)}</a>`).join('');
  const language = Object.entries(config.locales).map(([lang, meta]) => `<a href="${routePath(lang, page)}" lang="${lang}" hreflang="${lang}"${lang === locale ? ' aria-current="true"' : ''}>${meta.label}</a>`).join('');
  const actions = page === 'contact' ? '' : `<div class="actions">${link(routePath(locale, 'contact'), u.primary, 'button')}${page === 'home' ? link('#engagement', u.secondary, 'button button-quiet') : ''}</div>`;
  const brand = `<a class="brand" href="${routePath(locale, 'home')}" aria-label="${esc(u.home)}">Factor <span>IO</span></a>`;
  const hero = p.film
    ? `<section class="hero hero-film" aria-labelledby="page-title"><div class="hero-copy"><p class="eyebrow">${esc(p.eyebrow)}</p><h1 id="page-title">${esc(p.headline)}</h1><div class="hero-side"><p class="lede">${esc(p.lede)}</p>${actions}</div></div>${film(c, p.film)}</section>`
    : `<section class="hero" aria-labelledby="page-title"><p class="eyebrow">${esc(p.eyebrow)}</p><h1 id="page-title">${esc(p.headline)}</h1><p class="lede">${esc(p.lede)}</p>${actions}</section>`;

  return `<!DOCTYPE html>
<!-- Generated by scripts/build-site.mjs; edit content and templates, not this file. -->
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)} | Factor IO</title><meta name="description" content="${esc(p.description)}">
<meta name="robots" content="${config.locales[locale].indexable ? 'index, follow' : 'noindex, follow'}"><link rel="canonical" href="${canonical}">
${Object.keys(config.locales).map(lang => `<link rel="alternate" hreflang="${lang}" href="${config.origin}${routePath(lang, page)}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${config.origin}${routePath('en', page)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Factor IO"><meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.description)}"><meta property="og:url" content="${canonical}"><meta property="og:locale" content="${config.locales[locale].og}"><meta name="twitter:card" content="summary">
<meta name="theme-color" content="#F3F4F2" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0E0F11" media="(prefers-color-scheme: dark)"><meta name="color-scheme" content="light dark">
<meta name="geo.region" content="TH-10"><meta name="geo.placename" content="Bangkok, Thailand"><meta name="geo.position" content="13.8282;100.7077"><meta name="ICBM" content="13.8282, 100.7077">
<link rel="preload" href="/assets/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="${asset('favicon.svg')}" type="image/svg+xml"><link rel="stylesheet" href="${asset('site.css')}">
${renderJsonLd(page, locale)}<script type="module" src="${asset('site.js')}"></script></head>
<body id="top" class="page-${page}">
<a class="skip" href="#main">${esc(u.skip)}</a>
<header class="site-header"><div class="wrap header-inner">${brand}
<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-nav" hidden>${esc(u.menu)}</button>
<div class="header-nav" id="main-nav"><nav aria-label="${esc(u.nav)}">${nav}</nav><a class="button button-small" href="${routePath(locale, 'contact')}"${page === 'contact' ? ' aria-current="page"' : ''}>${esc(c.pages.contact.nav)}</a></div>
<nav class="language" aria-label="${esc(u.language)}">${language}</nav></div></header>
<main id="main"><div class="wrap">${hero}
${p.sections.map(s => section(c, s, page, asset, page === 'home' && s.id === 'services' ? `<p class="section-link">${link(routePath(locale, 'services'), u.learn)}</p>` : '')).join('\n')}
${page !== 'contact' ? `<section class="cta" aria-labelledby="cta-title"><div><h2 id="cta-title">${esc(u.ctaTitle)}</h2><p>${esc(u.ctaBody)}</p></div>${link(routePath(locale, 'contact'), u.ctaLink, 'button')}</section>` : ''}
</div></main>
<footer class="site-footer"><div class="wrap footer-grid"><div class="footer-brand">${brand}<p>${esc(u.footer)}</p></div>
<div><h2>${esc(u.resources)}</h2>${link('/tco-calculator.html', u.calculator)}${link('/light-tools.html', u.tools)}${link(routePath(locale, 'mobile-apps'), c.pages['mobile-apps'].nav)}</div>
<div><h2>${esc(u.company)}</h2>${link(`mailto:${config.email}`, config.email)}${link('/privacy.html', u.privacy)}${link('#top', u.backTop)}</div>
<p class="legal">© ${c.updated.slice(0, 4)} ${esc(config.legalName)}</p></div></footer></body></html>
`;
}
