// Media that the pages and the film renderer share. Times are seconds and live here,
// not in content/*/site.json, because assertParity requires every content leaf to be
// a translated string; the words for each chapter live in site.json under films.*.
// scripts/films/render.mjs reads the same numbers, so a chapter button on the page and
// the frame the film cuts on can never drift apart.
export const films = {
  story: { duration: 28, chapters: [0, 7, 14, 21], poster: 17.5 },
  thesis: { duration: 26, chapters: [0, 6.5, 13, 19.5], poster: 22 },
  expertise: { duration: 32, chapters: [0, 7.5, 15, 22.5], poster: 27.2 },
};
export const filmSize = { width: 1920, height: 1080, fps: 30 };
export const filmFile = (id, locale) => `/assets/films/${id}-${locale}.mp4`;
export const filmPoster = (id, locale) => `/assets/films/${id}-${locale}.jpg`;

// Real captures only: device screenshots from the app's own store kit, and headless
// captures of the live web tools. Blink ships no interface capture on purpose.
export const work = {
  'tco-calculator': { frame: 'browser', href: '/tco-calculator.html', shots: [{ file: 'tco-calculator.webp', width: 1440, height: 900 }] },
  'light-tools': { frame: 'browser', href: '/light-tools.html', shots: [{ file: 'light-tools.webp', width: 1440, height: 900 }] },
  'cat-countdown': {
    frame: 'phone',
    shots: [
      { file: 'cat-countdown-home.webp', width: 540, height: 1212 },
      { file: 'cat-countdown-detail.webp', width: 540, height: 1212 },
      { file: 'cat-countdown-notes.webp', width: 540, height: 1212 },
      { file: 'cat-countdown-tasks.webp', width: 540, height: 1212 },
    ],
    promo: { file: 'cat-countdown-promo.mp4', poster: 'cat-countdown-promo.jpg', width: 540, height: 960 },
  },
  blink: { frame: 'icon', href: 'https://blink.factor-io.com/', shots: [{ file: 'blink-icon.webp', width: 256, height: 256 }] },
};
export const workFile = name => `/assets/work/${name}`;