import { config, routes, routePath } from './config.mjs';

export const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const link = (href, label, cls = 'text-link') => {
  const anchor = `<a class="${cls}" href="${esc(href)}">${esc(label)}</a>`;
  // Preserve the direct no-JS contact path through Cloudflare's HTML edge filter.
  return href.startsWith('mailto:') ? `<!--email_off-->${anchor}<!--/email_off-->` : anchor;
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

function topology(c) {
  const t = c.topology;
  return `<figure class="topology scene-block" aria-label="${esc(t.title)}">
    <div class="figure-heading"><span class="signal" aria-hidden="true"></span>${esc(t.title)} <span class="hud-mini-chip">SYS//ARCH_01</span></div>
    <div class="topology-art-frame"><img src="/assets/hero-future.png" alt="Futuristic Enterprise Kubernetes & AI Platform" class="future-art hero-future-art" width="1024" height="682" loading="eager"></div>
    <div class="model-row">${t.models.map(m => `<span>${esc(m)}</span>`).join('')}</div>
    <div class="connector" aria-hidden="true">↓</div><div class="agent-node">${esc(t.agent)}</div>
    <div class="connector" aria-hidden="true">↓</div><div class="boundary"><strong>${esc(t.boundary)}</strong>
    <ul>${t.fields.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
    <div class="connector" aria-hidden="true">↓</div><div class="systems-node">${esc(t.systems)}</div>
    <p class="figure-note">${esc(t.note)}</p><figcaption>${esc(t.caption)}</figcaption>
  </figure>`;
}

function questions(c, s) {
  return `<ol class="items questions">${s.items.map(item => `<li><span class="question-mark" aria-hidden="true">?</span>
    <div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></div></li>`).join('')}</ol>`;
}

function routeSplit(c, s) {
  return `<ul class="items routes">${s.items.map(item => `<li><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p>
    <p class="route-mark"><span>${esc(c.ui.routeMark)}</span>${esc(item.mark)}</p></li>`).join('')}</ul>`;
}

function processSteps(c, s) {
  return `<ol class="items process">${s.items.map((item, i) => `<li><span class="item-index" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
    <div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></div></li>`).join('')}</ol>`;
}

function demo(c) {
  const d = c.demo;
  const stages = d.stages.map((label, i) => `<li class="flow-node" data-stage="${i}" data-state="idle">
      <span class="flow-index">${String(i + 1).padStart(2, '0')}</span><span class="flow-label">${esc(label)}</span></li>`).join('');
  return `<div class="demo scene-block" data-demo data-copy="${esc(JSON.stringify(d))}">
    <div class="demo-shield-banner"><img src="/assets/governance-shield.png" alt="Futuristic AI Governance & Execution Shield" class="future-art shield-future-art" width="1024" height="682" loading="lazy"></div>
    <div class="demo-header-tag"><span class="hud-status-led"></span>SECURE RUNTIME INTERLOCK</div>
    <h3>${esc(d.title)}</h3><p>${esc(d.intro)}</p>
    <dl class="identity-row"><div><dt>${esc(d.identity)}</dt><dd><code>workflow-agent-17</code></dd></div><div><dt>${esc(d.scope)}</dt><dd><code>staging/*</code></dd></div></dl>
    <ol class="flowchart" data-flow aria-hidden="true">${stages}</ol>
    <p class="flow-halt" data-halt hidden aria-hidden="true">${esc(d.halt)}</p>
    <p class="flow-legend" aria-hidden="true">${esc(d.legend)}</p>
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

function contact(c, asset = () => '') {
  const d = c.contact;
  return `<div class="contact-layout"><div class="contact-aside"><h3>${esc(d.title)}</h3><p>${esc(d.intro)}</p></div>
    <div class="line-card">
    <div class="line-card-header"><span class="hud-chip">SECURE UPLINK</span></div>
    <a class="button line-action" href="${config.lineUrl}" rel="noopener">${esc(d.lineAction)}</a>
    <figure class="line-qr"><img src="${asset('line-qr.jpg')}" width="663" height="663" alt="${esc(d.qrAlt)}" loading="lazy" decoding="async">
    <figcaption>${esc(d.qrCaption)}</figcaption></figure>
    <p class="line-id">${esc(d.lineIdLabel)} <code>${esc(config.lineId)}</code></p>
    </div>
    <div class="contact-fallback"><p class="contact-direct">${esc(d.fallback)}<br><!--email_off--><a href="mailto:${config.email}">${config.email}</a><!--/email_off--></p>
    ${link('/privacy.html#website-enquiries', d.privacy)}</div></div>`;
}

function section(c, s, asset, index = 0) {
  let detail = '';
  if (s.kind === 'architecture') detail = topology(c);
  else if (s.kind === 'demo') detail = demo(c);
  else if (s.kind === 'contact') detail = contact(c, asset);
  else if (s.kind === 'questions') detail = questions(c, s);
  else if (s.kind === 'routes') detail = routeSplit(c, s);
  else if (s.kind === 'process') detail = processSteps(c, s);
  else if (s.kind === 'founder') detail = `<div class="founder-links">${link(config.linkedin, 'LinkedIn ↗')}${link(config.github, 'GitHub ↗')}${link(routePath(c.locale, 'about'), c.pages.about.nav)}</div>`;
  else if (s.items.length) {
    const tag = s.kind === 'ledger' ? 'ol' : 'ul';
    detail = `<${tag} class="items ${s.kind}">${s.items.map((item, i) => `<li><span class="item-index" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></div></li>`).join('')}</${tag}>`;
  }
  const sceneNum = String(index + 1).padStart(2, '0');
  return `<section id="${s.id}" class="content-section section-${s.kind} scene-block" data-scene="SCENE // ${sceneNum} ${s.id.toUpperCase()}" aria-labelledby="${s.id}-title"><div class="scene-marker" aria-hidden="true"><span class="scene-num">${sceneNum}</span><span class="scene-label">// ${s.id.toUpperCase()}</span><span class="scene-track"></span></div><div class="section-heading"><p class="kicker">${esc(s.kicker)}</p><h2 id="${s.id}-title">${esc(s.title)}</h2><p>${esc(s.body)}</p></div>${detail}</section>`;
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
<meta name="theme-color" content="#080a0f"><meta name="color-scheme" content="dark">
<meta name="geo.region" content="TH-10"><meta name="geo.placename" content="Bangkok, Thailand"><meta name="geo.position" content="13.8282;100.7077"><meta name="ICBM" content="13.8282, 100.7077">
<link rel="icon" href="${asset('favicon.svg')}" type="image/svg+xml"><link rel="stylesheet" href="${asset('site.css')}">
${renderJsonLd(page, locale)}<script type="module" src="${asset('site.js')}"></script></head>
<body id="top" class="page-${page}">
<div class="hud-telemetry" aria-hidden="true"><div class="hud-telemetry-inner"><div class="hud-left"><span class="hud-brand-tag">FACTOR//IO</span><span class="hud-slash">/</span><span class="hud-scene-name" data-hud-scene>[SCENE // 01 HERO]</span></div><div class="hud-right"><span class="hud-status"><span class="hud-pulse"></span>SYS.ONLINE</span><span class="hud-pct" data-hud-pct>0%</span></div></div><div class="hud-progress-line"><div class="hud-progress-fill" data-hud-fill></div></div></div>
<div class="cyber-bg" aria-hidden="true"><div class="cyber-grid"></div><div class="cyber-ambient ambient-top"></div><div class="cyber-ambient ambient-bottom"></div><div class="cyber-scanline"></div></div>
<a class="skip" href="#main">${esc(u.skip)}</a>
<header class="site-header"><div class="header-inner"><a class="brand" href="${routePath(locale, 'home')}" aria-label="${esc(u.home)}">FACTOR <span>I/O</span></a>
<button class="menu-toggle quiet" type="button" aria-expanded="false" aria-controls="main-nav" hidden>${esc(u.menu)} <span aria-hidden="true">≡</span></button>
<nav id="main-nav" aria-label="${esc(u.nav)}">${nav}</nav><nav class="language" aria-label="${esc(u.language)}">${language}</nav></div></header>
<main id="main"><div class="wrap"><section class="hero ${page === 'home' ? 'hero-home' : ''} scene-block" data-scene="SCENE // 01 HERO" aria-labelledby="page-title"><div class="hero-copy"><p class="kicker">${esc(p.eyebrow)}</p><h1 id="page-title">${esc(p.headline)}</h1><p class="lede">${esc(p.lede)}</p>
${page !== 'contact' ? `<div class="actions">${link(routePath(locale, 'contact'), u.primary, 'button')}${page === 'home' ? link('#engagement', u.secondary, 'text-link') : ''}</div>` : ''}</div>${page === 'home' ? topology(c) : '<div class="page-rule" aria-hidden="true"><span>F / IO</span></div>'}</section>
${p.sections.map((s, idx) => `${section(c, s, asset, idx + 1)}${page === 'home' && s.id === 'services' ? `<p class="service-link">${link(routePath(locale, 'services'), u.learn)}</p>` : ''}`).join('\n')}
${page !== 'contact' ? `<section class="cta scene-block" data-scene="SCENE // CONTACT_CALL"><div><h2>${esc(u.ctaTitle)}</h2><p>${esc(u.ctaBody)}</p></div>${link(routePath(locale, 'contact'), u.ctaLink, 'button')}</section>` : ''}
</div></main><footer class="site-footer"><div class="wrap footer-grid"><div><a class="brand" href="${routePath(locale, 'home')}">FACTOR <span>I/O</span></a><p>${esc(u.footer)}</p><p class="legal">© ${c.updated.slice(0, 4)} ${esc(config.legalName)}</p></div><div><h2>${esc(u.resources)}</h2>${link('/tco-calculator.html', u.calculator)}${link('/light-tools.html', u.tools)}</div><div>${link(`mailto:${config.email}`, config.email)}${link('/privacy.html', u.privacy)}${link('#top', u.backTop)}</div></div></footer></body></html>
`;
}
