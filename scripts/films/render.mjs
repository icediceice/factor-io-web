#!/usr/bin/env node
// render.mjs: renders the site films frame by frame. Each frame is window.__seek(t)
// on scripts/films/stage.html in headless Chromium, captured over CDP and piped into
// ffmpeg, so a film is a deterministic function of its scene code and content copy.
//
//   node scripts/films/render.mjs all                  every film, every locale, mp4 + poster
//   node scripts/films/render.mjs story en             one film, one locale
//   node scripts/films/render.mjs story en --stills 3,9.5,17 --out <dir>   review frames as PNG
import { spawn } from 'node:child_process';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { films, filmSize } from '../../site/media.mjs';
import { ROOT, launch, openPage, serve } from './cdp.mjs';

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i === -1 ? null : args.splice(i, 2)[1]; };
const stills = flag('--stills'), outDir = flag('--out');
const [which = 'all', lang = 'all'] = args;
const ids = which === 'all' ? Object.keys(films) : [which];
const locales = lang === 'all' ? ['en', 'th'] : [lang];
for (const id of ids) if (!films[id]) throw new Error(`Unknown film ${id}`);

function encoder(file) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(filmSize.fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', file],
  { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, fail) => ff.on('exit', code => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code} for ${file}`)))));
  return {
    write: bytes => new Promise(ok => (ff.stdin.write(bytes) ? ok() : ff.stdin.once('drain', ok))),
    end: () => { ff.stdin.end(); return done; },
  };
}

const server = await serve();
const browser = await launch();
browser.conn.listeners.add(msg => {
  if (msg.method === 'Runtime.exceptionThrown') console.error('page error:', msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
});
try {
  for (const id of ids) for (const locale of locales) {
    const spec = films[id];
    const page = await openPage(browser, { width: filmSize.width, height: filmSize.height });
    await page.goto(`${server.origin}/scripts/films/stage.html?film=${id}&lang=${locale}`);
    for (let i = 0; !(await page.evaluate('window.__ready === true')); i++) {
      if (i > 150) throw new Error(`${id}/${locale}: stage never became ready`);
      await new Promise(r => setTimeout(r, 100));
    }
    const seek = t => page.evaluate(`window.__seek(${t})`);
    if (stills) {
      const dir = resolve(outDir ?? ROOT);
      await mkdir(dir, { recursive: true });
      for (const t of stills.split(',').map(Number)) {
        await seek(t);
        await writeFile(resolve(dir, `${id}-${locale}-${t}.png`), await page.screenshot());
      }
      console.log(`${id}/${locale}: ${stills.split(',').length} stills in ${dir}`);
    } else {
      const dir = resolve(ROOT, 'assets/films');
      await mkdir(dir, { recursive: true });
      const file = resolve(dir, `${id}-${locale}.mp4`), frames = Math.round(spec.duration * filmSize.fps);
      const enc = encoder(file), started = Date.now();
      for (let n = 0; n < frames; n++) {
        await seek(n / filmSize.fps);
        await enc.write(await page.screenshot({ format: 'jpeg', quality: 94 }));
      }
      await enc.end();
      // Poster at two thirds scale: shown before play, and to reduced-motion visitors instead of play.
      await seek(spec.poster);
      const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: filmSize.width, height: filmSize.height, scale: 2 / 3 } });
      await writeFile(resolve(dir, `${id}-${locale}.jpg`), Buffer.from(data, 'base64'));
      console.log(`${id}/${locale}: ${frames} frames, ${((await stat(file)).size / 1e6).toFixed(2)} MB, ${((Date.now() - started) / 1000).toFixed(0)} s`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}