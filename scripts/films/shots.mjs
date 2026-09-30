#!/usr/bin/env node
// shots.mjs: headless screenshots over the same CDP client the film renderer uses.
//
//   node scripts/films/shots.mjs                     the web-tool captures in assets/work/
//   node scripts/films/shots.mjs pages --out <dir>   review shots + a measurement report
//        [--routes /en/,/th/] [--widths 390,768,1440] [--schemes light,dark]
//
// The pages report measures what a screenshot cannot prove: horizontal overflow,
// text contrast against its effective background, the type scale, the h1 count and
// the header height. Look at the PNGs as well; the numbers do not judge composition.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { work } from '../../site/media.mjs';
import { ROOT, launch, openPage, serve } from './cdp.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i === -1 ? fallback : args.splice(i, 2)[1]; };
const outDir = flag('--out', null);
const routes = flag('--routes', '/en/,/th/,/en/mobile-apps/,/th/mobile-apps/,/en/services/,/th/services/,/en/contact/').split(',');
const widths = flag('--widths', '390,768,1440').split(',').map(Number);
const schemes = flag('--schemes', 'light,dark').split(',');
const mode = args[0] ?? 'work';

const settle = ms => new Promise(r => setTimeout(r, ms));

// Scroll the page once so reveal-on-view sections are in their shown state, then return to the top.
// 'instant' matters: site.css sets smooth scrolling, and a smooth scrollTo every 60ms never gets past the hero.
const REVEAL = `(async () => {
  const step = innerHeight * 0.8;
  for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => setTimeout(r, 60)); }
  scrollTo({ top: 0, behavior: 'instant' }); await new Promise(r => setTimeout(r, 900)); return document.querySelectorAll('.reveal-pending').length;
})()`;

const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const px = v => parseFloat(v) || 0;
  const lum = c => { const s = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]; };
  const rgb = str => { const m = String(str).match(/[0-9.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
  const alphaOf = str => { const p = String(str).match(/[0-9.]+/g); return p && p.length > 3 ? Number(p[3]) : 1; };
  const bgOf = el => { let n = el; while (n) { const b = getComputedStyle(n).backgroundColor; if (b && alphaOf(b) > 0.5 && rgb(b)) return rgb(b); n = n.parentElement; } return rgb(getComputedStyle(document.body).backgroundColor) || [255, 255, 255]; };
  const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
  const name = el => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
  const shown = el => { for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || px(cs.opacity) === 0) return false; } return true; };
  const overflow = [], contrast = [], sizes = new Map();
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1 || !shown(el)) continue;
    if (r.right > vw + 1 || r.left < -1) overflow.push({ sel: name(el), left: Math.round(r.left), right: Math.round(r.right) });
    if (!Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el), fs = px(cs.fontSize);
    sizes.set(fs, (sizes.get(fs) || 0) + 1);
    const fg = rgb(cs.color);
    if (!fg) continue;
    const cr = ratio(fg, bgOf(el)), need = fs >= 24 || (fs >= 18.66 && px(cs.fontWeight) >= 700) ? 3 : 4.5;
    if (cr < need) contrast.push({ sel: name(el), text: el.textContent.trim().slice(0, 40), ratio: Math.round(cr * 100) / 100, need, fontPx: fs });
  }
  const scale = Array.from(sizes.keys()).sort((a, b) => b - a);
  const header = document.querySelector('header');
  return {
    scheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    scrollWidth: document.documentElement.scrollWidth, viewport: vw,
    h1: document.querySelectorAll('h1').length,
    headerHeight: header ? Math.round(header.getBoundingClientRect().height) : null,
    smallestFont: scale.at(-1), typeScale: scale, hierarchyRatio: scale.length > 1 ? Math.round((scale[0] / scale[1]) * 100) / 100 : null,
    overflow: overflow.slice(0, 12), contrast: contrast.slice(0, 20),
  };
})()`;

const server = await serve();
const browser = await launch();
try {
  if (mode === 'work') {
    const dir = resolve(ROOT, 'assets/work');
    await mkdir(dir, { recursive: true });
    for (const [id, item] of Object.entries(work)) {
      if (item.frame !== 'browser') continue;
      const [shot] = item.shots;
      const page = await openPage(browser, { width: shot.width, height: shot.height });
      await page.goto(`${server.origin}${item.href}`);
      await settle(800);
      await writeFile(resolve(dir, shot.file), await page.screenshot({ format: 'webp', quality: 84 }));
      console.log(`${id}: assets/work/${shot.file}`);
      await page.close();
    }
  } else if (mode === 'pages') {
    const dir = resolve(outDir ?? resolve(ROOT, '.shots'));
    await mkdir(dir, { recursive: true });
    const report = [];
    for (const route of routes) for (const width of widths) for (const scheme of schemes) {
      const page = await openPage(browser, { width, height: width < 700 ? 844 : 900, colorScheme: scheme });
      await page.goto(`${server.origin}${route}`);
      const unrevealed = await page.evaluate(REVEAL);
      const m = await page.evaluate(MEASURE);
      const file = `${route.replace(/^\/|\/$/g, '').replace(/[/.]/g, '_') || 'root'}-${width}-${scheme}.png`;
      await writeFile(resolve(dir, file), await page.screenshot({ fullPage: true }));
      report.push({ route, width, file, unrevealed, ...m });
      const flags = [unrevealed && `unrevealed ${unrevealed}`, m.scrollWidth > m.viewport && `h-scroll ${m.scrollWidth}`, m.h1 !== 1 && `h1=${m.h1}`, m.overflow.length && `overflow ${m.overflow.length}`, m.contrast.length && `contrast ${m.contrast.length}`].filter(Boolean);
      console.log(`${route} ${width} ${scheme}: ${flags.length ? flags.join(', ') : 'clean'} · header ${m.headerHeight}px · type ${m.typeScale.join('/')}`);
      await page.close();
    }
    await writeFile(resolve(dir, 'report.json'), JSON.stringify(report, null, 2));
  } else throw new Error(`Unknown mode ${mode}`);
} finally {
  await browser.close();
  server.close();
}