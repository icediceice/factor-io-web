// Shared editorial identity and routes. Dates never depend on the build clock.
export const config = {
  origin: 'https://studio.factor-io.com', updated: '2026-09-11', name: 'Factor IO',
  legalName: 'Factor I O Co., Ltd.', email: 'admin@factor-io.com',
  founder: 'Thanat Manasakool', role: 'Founder & Principal Engineer',
  linkedin: 'https://www.linkedin.com/in/thanat-manasakool-3101905a/', github: 'https://github.com/icediceice',
  founderDescription: "Nearly 20 years in enterprise infrastructure, with experience as an Ecosystem Solutions Architect for Red Hat and Nutanix, delivering architecture guidance and technical enablement to Thailand's leading SI partners.",
  organizationDescription: 'Infrastructure engineering and governed enterprise AI consulting in Thailand. Architecture, migration, private AI and technical enablement for systems integrators.',
  locales: { en: { label: 'EN', indexable: true, og: 'en_US' }, th: { label: 'ไทย', indexable: false, og: 'th_TH' } },
  legacyUrls: [
    { path: '/', updated: '2026-09-11' },
    { path: '/light-tools.html', updated: '2026-09-11' },
    { path: '/tco-calculator.html', updated: '2026-08-28' },
    { path: '/privacy.html', updated: '2026-09-11' },
  ],
};
export const routes = ['home', 'services', 'platform', 'governance', 'how-we-work', 'about', 'contact'];
export const routePath = (locale, page) => `/${locale}/${page === 'home' ? '' : `${page}/`}`;
export const outputPath = (locale, page) => `${routePath(locale, page).slice(1)}index.html`;
