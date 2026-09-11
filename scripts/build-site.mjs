#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, routes, routePath, outputPath } from '../site/config.mjs';
import { renderPage, esc } from '../site/templates.mjs';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
export const assetNames = ['site.css', 'site.js', 'favicon.svg'];

export function assertParity(a, b, path = 'content') {
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) throw new Error(`Translation array mismatch: ${path}`);
    a.forEach((v, i) => assertParity(v, b[i], `${path}[${i}]`));
  } else if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object' || JSON.stringify(Object.keys(a).sort()) !== JSON.stringify(Object.keys(b).sort())) throw new Error(`Translation keys mismatch: ${path}`);
    Object.keys(a).forEach(k => assertParity(a[k], b[k], `${path}.${k}`));
  } else if (typeof a !== 'string' || typeof b !== 'string' || !a.trim() || !b.trim()) {
    throw new Error(`Missing translated text: ${path}`);
  } else if (/\.(id|kind)$/.test(path) && a !== b) throw new Error(`Translation structural mismatch: ${path}`);
}

export async function loadContent() {
  const content = {};
  for (const locale of Object.keys(config.locales)) {
    const c = JSON.parse(await readFile(resolve(ROOT, `content/${locale}/site.json`), 'utf8'));
    if (c.locale !== locale || !/^\d{4}-\d{2}-\d{2}$/.test(c.updated)) throw new Error(`Invalid locale/date: ${locale}`);
    if (JSON.stringify(Object.keys(c.pages)) !== JSON.stringify(routes)) throw new Error(`Route mismatch: ${locale}`);
    for (const page of Object.values(c.pages)) {
      const ids = page.sections.map(s => s.id);
      if (new Set(ids).size !== ids.length || ids.some(id => !/^[a-z][a-z0-9-]*$/.test(id))) throw new Error('Invalid section ids');
      for (const s of page.sections) if (!['statement', 'cards', 'ledger', 'exceptions', 'founder', 'architecture', 'flow', 'demo', 'contact'].includes(s.kind)) throw new Error(`Unknown section kind ${s.kind}`);
    }
    content[locale] = c;
  }
  assertParity(content.en, content.th);
  return content;
}

export function renderSitemap(content) {
  const entries = config.legacyUrls.map(row => ({ ...row }));
  for (const [locale, meta] of Object.entries(config.locales)) {
    if (meta.indexable) for (const page of routes) entries.push({ path: routePath(locale, page), updated: content[locale].updated });
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(row => `  <url><loc>${esc(config.origin + row.path)}</loc><lastmod>${row.updated}</lastmod></url>`).join('\n')}\n</urlset>\n`;
}

export async function generate() {
  const content = await loadContent(), assets = {};
  for (const name of assetNames) assets[name] = hash(await readFile(resolve(ROOT, 'assets', name))).slice(0, 12);
  const output = new Map();
  output.set('index.html', renderPage(content.en, 'home', assets));
  for (const locale of Object.keys(config.locales)) for (const page of routes) output.set(outputPath(locale, page), renderPage(content[locale], page, assets));
  output.set('sitemap.xml', renderSitemap(content));
  return output;
}

export async function checkPreview(origin, output) {
  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('Preview must be a plain HTTP(S) origin');
  const expected = new Map([...output].map(([path, text]) => [path.endsWith('index.html') ? `/${path.slice(0, -10)}` : `/${path}`, Buffer.from(text)]));
  for (const name of assetNames) expected.set(`/assets/${name}`, await readFile(resolve(ROOT, 'assets', name)));
  for (const path of ['light-tools.html', 'privacy.html', 'tco-calculator.html', 'tco-assistant.html']) expected.set(`/${path}`, await readFile(resolve(ROOT, path)));
  const results = await Promise.all([...expected].map(async ([path, bytes]) => {
    try {
      const response = await fetch(new URL(`${path}?rev=${hash(bytes).slice(0, 12)}`, base), { signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (!response.ok) return `${path}: HTTP ${response.status}`;
      const received = Buffer.from(await response.arrayBuffer());
      return bytes.equals(received) ? null : `${path}: byte mismatch`;
    } catch (error) { return `${path}: ${error.message}`; }
  }));
  const failures = results.filter(Boolean);
  if (failures.length) throw new Error(`Preview does not match checkout:\n${failures.join('\n')}`);
  console.log(`Preview byte match: ${expected.size} routes/assets at ${base.origin}`);
}

async function main(args) {
  const output = await generate();
  if (args[0] === '--check-preview' && args.length === 2) return checkPreview(args[1], output);
  if (args.length && !(args.length === 1 && args[0] === '--check')) throw new Error('Usage: node scripts/build-site.mjs [--check | --check-preview <origin>]');
  for (const [path, text] of output) {
    const destination = resolve(ROOT, path);
    if (args[0] === '--check') {
      const current = await readFile(destination, 'utf8').catch(() => null);
      if (current !== text) throw new Error(`Generated output drift: ${path}; run node scripts/build-site.mjs`);
    } else {
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, text);
    }
  }
  console.log(`${args[0] === '--check' ? 'Verified' : 'Generated'} ${output.size} static outputs; EN/TH parity valid.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
