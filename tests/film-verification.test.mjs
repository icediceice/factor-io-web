// Peer acceptance tests for promised film behavior; no generated-output writes.
// Run with npx vitest run tests/film-verification.test.mjs --globals --maxWorkers=1
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { bindFilm } from '../assets/site.js';
import { chapterTag } from '../scripts/films/kit.js';
import { films } from '../site/media.mjs';
import { ROOT, generate, checkPreview } from '../scripts/build-site.mjs';

class Element extends EventTarget {
  constructor() {
    super(); this.dataset = {}; this.attrs = new Map(); this.children = [];
    this.style = { setProperty: (name, value) => { this.style[name] = value; } };
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  removeAttribute(name) { this.attrs.delete(name); }
  toggleAttribute(name, on) { if (on) this.setAttribute(name, ''); else this.removeAttribute(name); }
  appendChild(child) { this.children.push(child); return child; }
  click() { this.dispatchEvent(new Event('click')); }
}

let observer;
beforeEach(() => {
  observer = null;
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('navigator', { connection: { saveData: false } });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback, options) { observer = { callback, options }; }
    observe() {}
  });
});
afterEach(() => vi.unstubAllGlobals());

function fixture(spec = films.expertise) {
  const video = new Element(); video.paused = true; video.currentTime = 0;
  video.play = () => { video.paused = false; video.dispatchEvent(new Event('play')); return Promise.resolve(); };
  video.pause = () => { video.paused = true; video.dispatchEvent(new Event('pause')); };
  const toggle = new Element(); toggle.dataset = { play: 'Play film', pause: 'Pause film' };
  const chapters = spec.chapters.map((start, i) => {
    const node = new Element(); node.dataset = { start: String(start), chapter: String(i) }; return node;
  });
  const rows = chapters.map((_, i) => { const node = new Element(); node.dataset.row = String(i); return node; });
  const seeks = chapters.map((_, i) => { const node = new Element(); node.dataset.seek = String(i); return node; });
  const group = { querySelectorAll: selector => selector === '[data-row]' ? rows : seeks };
  const figure = new Element(); figure.dataset.duration = String(spec.duration);
  figure.querySelector = selector => selector === 'video' ? video : selector === '[data-film-toggle]' ? toggle : new Element();
  figure.querySelectorAll = () => chapters;
  figure.closest = () => group;
  bindFilm(figure);
  return {
    video, toggle, chapters, rows, seeks, figure,
    intersect(ratio) { observer.callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]); },
    time(t) { video.currentTime = t; video.dispatchEvent(new Event('seeked')); },
  };
}

describe('film viewport contract', () => {
  it('does not autoplay when initially only 10% visible', () => {
    const f = fixture(); f.intersect(0.1);
    assert.equal(f.video.paused, true, 'less than half visible must remain paused');
  });
  it('pauses when scrolling from 60% visible to 49% visible', () => {
    const f = fixture(); f.intersect(0.6); assert.equal(f.video.paused, false);
    f.intersect(0.49);
    assert.equal(f.video.paused, true, 'dropping below the threshold must pause');
  });
  it('plays at exactly 50% and reports observer-driven pause accurately', () => {
    const f = fixture(); f.intersect(0.5);
    assert.equal(f.video.paused, false); assert.equal(f.toggle.getAttribute('aria-label'), 'Pause film');
    f.intersect(0);
    assert.equal(f.video.paused, true); assert.equal(f.toggle.getAttribute('aria-label'), 'Play film');
  });
  it('preserves explicit pause across viewport exit and re-entry', () => {
    const f = fixture(); f.intersect(1); f.toggle.click(); f.intersect(0); f.intersect(1);
    assert.equal(f.video.paused, true);
  });
  it('holds under reduced motion and allows explicit play', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const f = fixture(); f.intersect(1); assert.equal(f.video.paused, true);
    f.toggle.click(); assert.equal(f.video.paused, false);
  });
  it('holds under Save-Data', () => {
    vi.stubGlobal('navigator', { connection: { saveData: true } });
    const f = fixture(); f.intersect(1); assert.equal(f.video.paused, true);
  });
});

describe('chapter synchronization', () => {
  it('updates ledger at exact chapter starts, on seek, and on loop wrap', () => {
    const f = fixture();
    for (const [i, start] of films.expertise.chapters.entries()) {
      f.time(start);
      assert.equal(f.chapters[i].getAttribute('aria-current'), 'step');
      assert.equal(f.rows[i].attrs.has('data-active'), true);
      if (i) { f.time(start - 0.01); assert.equal(f.chapters[i - 1].getAttribute('aria-current'), 'step'); }
      f.seeks[i].click();
      assert.equal(f.video.currentTime, start); assert.equal(f.video.paused, false);
    }
    f.time(films.expertise.duration - 0.01); assert.equal(f.rows[3].attrs.has('data-active'), true);
    f.time(0); assert.equal(f.rows[0].attrs.has('data-active'), true);
    assert.equal(f.rows[3].attrs.has('data-active'), false);
  });
  for (const [id, spec] of Object.entries(films)) {
    it(`${id}: burned-in chapter tag agrees with page throughout each boundary`, () => {
      const f = fixture(spec);
      vi.stubGlobal('document', { createElement: () => new Element() });
      const stage = new Element(), names = spec.chapters.map((_, i) => `chapter-${i}`);
      const tag = chapterTag(stage, id, names, spec.chapters), label = stage.children[0].children[1];
      for (const [i, start] of spec.chapters.entries()) {
        if (!i) continue;
        const before = start - 0.1;
        tag.render(before); f.time(before);
        const pageChapter = f.chapters.findIndex(b => b.getAttribute('aria-current') === 'step');
        assert.equal(label.textContent, names[pageChapter], `film and page disagree at ${before}s`);
        tag.render(start); f.time(start); assert.equal(label.textContent, names[i]);
      }
    });
  }
});

it('live byte verification fails if a deployed Thai expertise film is missing', async () => {
  const output = await generate();
  vi.stubGlobal('fetch', async url => {
    if (url.pathname === '/assets/films/expertise-th.mp4') return { ok: false, status: 404 };
    const pathname = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
    const bytes = await readFile(resolve(ROOT, `.${pathname}`));
    return { ok: true, status: 200, arrayBuffer: async () => bytes };
  });
  await assert.rejects(() => checkPreview('https://verification.invalid/', output), /assets\/films\/expertise-th\.mp4: HTTP 404/);
});