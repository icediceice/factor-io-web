// quotes/lib/pdf.mjs — HTML -> A4 PDF through headless Chromium.
//
// Snap-confinement constraint (probed on light-worker, see plan notes): the
// snap Chromium build cannot write into /tmp — its sandbox silently redirects
// the write into a private namespace, so the file never appears. Every temp
// file therefore lives under a tmpdir under $HOME (or QUOTES_TMPDIR), which
// the snap's home plug can write.
//
// Failure modes are explicit, never silent: a missing binary names the env
// var and the paths probed; a chromium failure carries its stderr; a success
// is verified to actually start with %PDF.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, createReadStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderQuotationHtml } from '../templates/quotation.mjs';

const CANDIDATES = [
  process.env.QUOTES_CHROMIUM,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].filter(Boolean);

export function findChromium() {
  for (const candidate of CANDIDATES) {
    try {
      const r = spawnSync(candidate, ['--version'], { timeout: 10_000, encoding: 'utf8' });
      if (r.status === 0) return { bin: candidate, version: r.stdout.trim() };
    } catch { /* try next */ }
  }
  throw new Error(
    `no Chromium binary found. Set QUOTES_CHROMIUM to a Chrome/Chromium that supports --print-to-pdf. Probed: ${CANDIDATES.join(', ')}`
  );
}

/** Snap-safe temp root: QUOTES_TMPDIR, else $HOME/.cache, else the project
 *  tmpdir. NEVER /tmp — snap Chromium cannot write there (see header). */
function tempRoot() {
  // NOTE: snap Chromium's home plug denies HIDDEN directories (.cache etc.)
  // and denies everything outside $HOME, so the only reliable default is a
  // visible folder in the user's home.
  return process.env.QUOTES_TMPDIR
    ?? (process.env.HOME ? join(process.env.HOME, 'quotes-tmp') : null)
    ?? join(process.cwd(), 'tmp');
}

/** Render one HTML string to PDF. Returns { buffer, chromium, pages? }.
 *  options: { printBackground = true, format = 'A4' } (format fixed A4 here). */
export async function htmlToPdf(html, { timeoutMs = 45_000 } = {}) {
  const { bin, version } = findChromium();
  const root = tempRoot();
  await mkdir(root, { recursive: true });
  const dir = mkdtempSync(join(root, 'pdf-'));
  const htmlPath = join(dir, 'doc.html');
  const pdfPath = join(dir, 'doc.pdf');
  try {
    await writeFile(htmlPath, html, 'utf8');
    const args = [
      '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--run-all-compositor-stages-before-draw', '--virtual-time-budget=10000',
      `--print-to-pdf=${pdfPath}`, '--no-pdf-header-footer',
      `file://${resolve(htmlPath)}`,
    ];
    const res = spawnSync(bin, args, { timeout: timeoutMs, encoding: 'utf8' });
    if (res.error) throw new Error(`chromium failed to run (${version}): ${res.error.message}`);
    if (res.status !== 0) {
      throw new Error(`chromium exited ${res.status}: ${(res.stderr || res.stdout || '').split('\n').filter(Boolean).slice(-6).join(' | ')}`);
    }
    const stat = await readFile(pdfPath).catch(() => null);
    if (!stat) throw new Error(`chromium reported success but wrote no PDF at ${pdfPath} (stderr: ${(res.stderr || '').slice(-300)})`);
    if (stat.length < 512 || stat.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new Error(`output at ${pdfPath} is not a PDF (${stat.length} bytes)`);
    }
    return { buffer: stat, chromium: version };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Build + render the quotation document in one call. doc = buildQuoteDocument output. */
export async function renderQuotationPdf(doc, lang = doc.quotation.lang ?? 'en') {
  const html = renderQuotationHtml(doc, lang);
  const { buffer, chromium } = await htmlToPdf(html);
  const filename = `${doc.quotation.number}-${lang.toUpperCase()}.pdf`;
  return { buffer, chromium, filename, lang };
}