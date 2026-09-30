// cdp.mjs: the smallest Chrome DevTools Protocol client the film renderer and the
// screenshot runner need. It drives Playwright's downloaded Chromium directly, so
// the repo gains no npm dependency. Never point CHROME_BIN at /snap/bin/chromium:
// AppArmor denies the snap build writes outside its own profile directory.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const CHROME = process.env.CHROME_BIN ?? join(homedir(), '.cache/ms-playwright/chromium-1228/chrome-linux64/chrome');

const waitForLine = (stream, pattern, what, ms = 15000) => new Promise((resolve, reject) => {
  let log = '';
  const timer = setTimeout(() => reject(new Error(`${what} did not start: ${log.slice(-400)}`)), ms);
  stream.on('data', bytes => {
    log += bytes;
    const match = log.match(pattern);
    if (match) { clearTimeout(timer); resolve(match[1]); }
  });
});

// Starts scripts/serve.mjs on a free port; returns { origin, close }. The server inherits
// stderr, so an orphan would hold the caller's pipe open forever: it dies with this process.
export async function serve() {
  const child = spawn(process.execPath, ['scripts/serve.mjs', '0'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
  const stop = () => child.kill('SIGTERM');
  process.once('exit', stop);
  const origin = await waitForLine(child.stdout, /(http:\/\/127\.0\.0\.1:\d+)/, 'serve.mjs');
  return { origin, close: () => { process.off('exit', stop); stop(); } };
}

class Connection {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Set();
    ws.addEventListener('message', ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, method } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`)); else resolve(msg.result);
      } else if (msg.method) for (const fn of this.listeners) fn(msg);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
  }
  once(method, sessionId) {
    return new Promise(resolve => {
      const fn = msg => { if (msg.method === method && msg.sessionId === sessionId) { this.listeners.delete(fn); resolve(msg.params); } };
      this.listeners.add(fn);
    });
  }
}

export async function launch() {
  const profile = await mkdtemp(join(process.env.FILM_TMP ?? tmpdir(), 'fio-chrome-'));
  const child = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-sandbox',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--force-color-profile=srgb', '--font-render-hinting=none', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await waitForLine(child.stderr, /DevTools listening on (ws:\/\/\S+)/, 'Chromium');
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  const conn = new Connection(ws);
  return {
    conn,
    // Chromium's helper processes can still be writing into the profile after the main
    // process exits (ENOTEMPTY), so retry, and never let a leftover temp dir fail a render.
    async close() {
      ws.close(); child.kill('SIGTERM'); await new Promise(r => child.once('exit', r));
      await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(error => console.warn(`left ${profile}: ${error.code}`));
    },
  };
}

// Opens a tab at a fixed CSS viewport. colorScheme and reducedMotion emulate media features.
export async function openPage(browser, { width, height, dpr = 1, colorScheme = 'light', reducedMotion = 'no-preference' }) {
  const { conn } = browser;
  const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => conn.send(method, params, sessionId);
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: width < 700 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: colorScheme }, { name: 'prefers-reduced-motion', value: reducedMotion }] });
  const page = {
    send,
    async goto(url) {
      const loaded = conn.once('Page.loadEventFired', sessionId);
      const { errorText } = await send('Page.navigate', { url });
      if (errorText) throw new Error(`navigate ${url}: ${errorText}`);
      await loaded;
      await page.evaluate('document.fonts.ready.then(() => true)');
    },
    async evaluate(expression) {
      const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) throw new Error(`evaluate: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
      return result.value;
    },
    async screenshot({ format = 'png', quality, fullPage = false } = {}) {
      const params = { format, ...(quality ? { quality } : {}), captureBeyondViewport: fullPage };
      if (fullPage) {
        const { cssContentSize } = await send('Page.getLayoutMetrics');
        params.clip = { x: 0, y: 0, width, height: Math.ceil(cssContentSize.height), scale: 1 };
      }
      const { data } = await send('Page.captureScreenshot', params);
      return Buffer.from(data, 'base64');
    },
    close: () => conn.send('Target.closeTarget', { targetId }),
  };
  return page;
}