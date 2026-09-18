// Shared editorial identity and routes. Dates never depend on the build clock.
export const config = {
  origin: 'https://studio.factor-io.com', updated: '2026-09-11', name: 'Factor IO',
  legalName: 'Factor I O Co., Ltd.', email: 'admin@factor-io.com',
  // Registered particulars. The registration number doubles as the tax identification
  // number under Thai law, and the address romanisation is reproduced exactly as the
  // operator supplied it — never normalised to RTGS, for the same reason the Thai
  // registered name is not normalised (see quotes/lib/db.mjs seed-settings).
  registration: '0105562205512', phone: '+66928887155',
  address: { street: '88/57 Sethasiri Punyainthra', locality: 'Bang Chan, Klong Sam Wa', region: 'Bangkok', postalCode: '10510', country: 'TH' },
  lineId: 'icediceice', lineUrl: 'https://line.me/ti/p/~icediceice',
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
export const routes = ['home', 'services', 'about', 'profile', 'contact'];
export const routePath = (locale, page) => `/${locale}/${page === 'home' ? '' : `${page}/`}`;
export const outputPath = (locale, page) => `${routePath(locale, page).slice(1)}index.html`;
