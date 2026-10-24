import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import vm from 'node:vm';
import worker, { classify } from '../catcountdown/worker/src/index.js';

const PLAY = 'https://play.google.com/store/apps/details?id=com.catcountdown.cat_countdown';
const APP_STORE = 'https://apps.apple.com/app/id0000000000';
const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  desktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36',
  applebot: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1 (Applebot/0.1; +http://www.apple.com/go/applebot)',
  googlebot: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  inspectionTool: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0;)',
  googleOther: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 (compatible; GoogleOther)',
  bingbot: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.1938.76 Mobile Safari/537.36 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
};

// The Worker's only upstream is the GitHub Pages copy; record what it asks for.
const upstream = [];
globalThis.fetch = async (url, init = {}) => {
  upstream.push({ url: String(url), method: init.method || 'GET' });
  return new Response(`<html>studio copy of ${new URL(url).pathname}</html>`, { status: 200, headers: { 'content-type': 'text/html' } });
};

const visit = async (path, ua = UA.desktop, { env = {}, method = 'GET', headers = {} } = {}) => {
  upstream.length = 0;
  const res = await worker.fetch(new Request(`https://catcountdown.factor-io.com${path}`, { method, headers: { 'user-agent': ua, ...headers } }), env);
  return { res, body: method === 'HEAD' ? '' : await res.text(), upstream: [...upstream] };
};

test('an Android phone scanning the QR code goes straight to Google Play without reaching any origin', async () => {
  const { res, upstream } = await visit('/', UA.android);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), PLAY);
  assert.deepEqual(upstream, []);
});

test('an iPhone scanning the QR code sees only the App Store release status, not the landing page', async () => {
  for (const path of ['/', '/cat-countdown.html', '/iphone']) {
    const { res, body, upstream } = await visit(path, UA.iphone);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(body, /Coming soon to the App Store/);
    assert.match(body, /in App Store review/);
    assert.doesNotMatch(body, /studio copy/, path);
    assert.deepEqual(upstream, [], path);
  }
});

test('once APP_STORE_URL is configured, iPhone scanners are sent to the App Store', async () => {
  for (const path of ['/', '/iphone']) {
    const { res } = await visit(path, UA.iphone, { env: { APP_STORE_URL: APP_STORE } });
    assert.equal(res.status, 302, path);
    assert.equal(res.headers.get('location'), APP_STORE, path);
  }
});

test('desktop visitors and crawlers get the full landing page from GitHub Pages', async () => {
  for (const ua of [UA.desktop, UA.applebot, UA.googlebot, UA.inspectionTool, UA.googleOther, UA.bingbot]) {
    const { res, body, upstream } = await visit('/', ua);
    assert.equal(res.status, 200);
    assert.equal(body, '<html>studio copy of /cat-countdown.html</html>');
    assert.deepEqual(upstream, [{ url: 'https://studio.factor-io.com/cat-countdown.html', method: 'GET' }]);
  }
});

test('?noredirect=1 shows phones the full landing page', async () => {
  for (const ua of [UA.android, UA.iphone]) {
    const { res, body } = await visit('/cat-countdown.html?noredirect=1', ua);
    assert.equal(res.status, 200);
    assert.equal(body, '<html>studio copy of /cat-countdown.html</html>');
  }
});

test('/app always shows the landing page, so store listings and social links can sell the app', async () => {
  for (const ua of [UA.android, UA.iphone, UA.desktop]) {
    const { res, body, upstream } = await visit('/app', ua);
    assert.equal(res.status, 200, ua);
    assert.equal(body, '<html>studio copy of /cat-countdown.html</html>');
    assert.deepEqual(upstream, [{ url: 'https://studio.factor-io.com/cat-countdown.html', method: 'GET' }]);
    assert.match(res.headers.get('cache-control'), /no-store/);
  }
  const slash = await visit('/app/?utm_source=play', UA.android);
  assert.equal(slash.res.status, 302);
  assert.equal(slash.res.headers.get('location'), '/app?utm_source=play');
  const scan = await visit('/', UA.android);
  assert.equal(scan.res.headers.get('location'), PLAY);
});

test('a phone that followed a search result reads the landing page; a QR scan or same-site click still goes to the store', async () => {
  for (const method of ['GET', 'HEAD']) for (const ua of [UA.android, UA.iphone]) {
    for (const referer of ['https://www.google.com/', 'https://t.co/link', 'https://studio.factor-io.com/cat-countdown.html']) {
      const { res, body, upstream } = await visit('/', ua, { method, headers: { referer } });
      assert.equal(res.status, 200, `${method} ${referer} ${ua}`);
      assert.equal(body, method === 'HEAD' ? '' : '<html>studio copy of /cat-countdown.html</html>');
      assert.deepEqual(upstream, [{ url: 'https://studio.factor-io.com/cat-countdown.html', method }]);
    }
    for (const referer of ['https://catcountdown.factor-io.com/iphone', 'http://catcountdown.factor-io.com/', 'https://CATCOUNTDOWN.factor-io.com:8443/', 'not a url']) {
      const { res, body, upstream } = await visit('/', ua, { method, headers: { referer } });
      assert.deepEqual(upstream, [], `${method} ${referer}`);
      if (ua === UA.android) {
        assert.equal(res.status, 302, referer);
        assert.equal(res.headers.get('location'), PLAY);
      } else {
        assert.equal(res.status, 200, referer);
        assert.equal(res.headers.get('location'), null);
        if (method === 'GET') assert.match(body, /Coming soon to the App Store/);
      }
    }
  }
});

test('responses that depend on the device or referrer are never shared through a cache', async () => {
  for (const ua of [UA.android, UA.iphone, UA.desktop]) {
    const { res } = await visit('/', ua);
    assert.deepEqual(res.headers.get('vary').split(/,\s*/).sort(), ['Referer', 'User-Agent']);
    assert.match(res.headers.get('cache-control'), /no-store/);
  }
});

test('crawlers find a robots.txt that points at a sitemap of the landing page and its published images', async () => {
  const robots = await visit('/robots.txt', UA.googlebot);
  assert.equal(robots.res.status, 200);
  assert.match(robots.res.headers.get('content-type'), /^text\/plain/);
  assert.doesNotMatch(robots.body, /Disallow: \/\S/);
  assert.match(robots.body, /^Sitemap: https:\/\/catcountdown\.factor-io\.com\/sitemap\.xml$/m);
  assert.deepEqual(robots.upstream, []);

  const sitemap = await visit('/sitemap.xml', UA.bingbot);
  assert.equal(sitemap.res.status, 200);
  assert.match(sitemap.res.headers.get('content-type'), /^application\/xml/);
  assert.deepEqual([...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]), ['https://catcountdown.factor-io.com/']);
  const images = [...sitemap.body.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map(m => m[1]);
  assert.ok(images.length >= 100 && images.length <= 1000, `image count ${images.length}`);
  for (const url of images) {
    assert.match(url, /^https:\/\/catcountdown\.factor-io\.com\/assets\//, url);
    const info = await stat(new URL(`../${url.slice('https://catcountdown.factor-io.com/'.length)}`, import.meta.url)).catch(() => null);
    assert.ok(info && info.size > 0, `sitemap lists a missing image: ${url}`);
  }

  const head = await visit('/sitemap.xml', UA.googlebot, { method: 'HEAD' });
  assert.equal(head.res.status, 200);
  assert.equal(head.res.body, null);
});

test('the edge Worker and the page script sort every visitor the same way', async () => {
  const html = await readFile(new URL('../cat-countdown.html', import.meta.url), 'utf8');
  const controller = html.match(/<script id="scanner-controller">([\s\S]*?)<\/script>/)[1];
  const pageScanner = userAgent => {
    let scanner;
    vm.runInNewContext(controller, {
      navigator: { userAgent, platform: '', maxTouchPoints: 0 },
      location: { search: '?noredirect=1', hostname: 'catcountdown.factor-io.com', replace() {} },
      document: { documentElement: { setAttribute: (k, v) => { scanner = v; } } },
      URLSearchParams,
    });
    return scanner;
  };
  const agents = [...Object.values(UA),
    'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36 Lighthouse',
  ];
  for (const ua of agents) assert.equal(classify(ua), pageScanner(ua), ua);
  assert.equal(classify(UA.android), 'android');
  assert.equal(classify(UA.iphone), 'ios');
});

test('page assets load from GitHub Pages and the old /catcountdown/ alias still lands on the page', async () => {
  const asset = await visit('/assets/favicon.svg');
  assert.equal(asset.res.status, 200);
  assert.deepEqual(asset.upstream, [{ url: 'https://studio.factor-io.com/assets/favicon.svg', method: 'GET' }]);

  for (const path of ['/catcountdown', '/catcountdown/']) {
    const { res } = await visit(`${path}?utm_source=qr`);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/cat-countdown.html?utm_source=qr');
  }
});

test('the landing-page film can be seeked through the Worker with byte ranges', async () => {
  const film = Uint8Array.from({ length: 1024 }, (_, i) => i % 256);
  const stub = globalThis.fetch;
  // An origin that honours Range, and If-Range only while the ETag still matches.
  globalThis.fetch = async (url, init = {}) => {
    const headers = new Headers(init.headers);
    const range = headers.get('range');
    const ifRange = headers.get('if-range');
    if (range === 'bytes=100-199' && (ifRange === null || ifRange === '"v1"')) {
      return new Response(film.slice(100, 200), { status: 206, headers: { 'content-range': 'bytes 100-199/1024', etag: '"v1"' } });
    }
    return new Response(film, { status: 200, headers: { etag: '"v1"' } });
  };
  const get = (headers) => worker.fetch(new Request('https://catcountdown.factor-io.com/assets/work/cat-countdown-promo.mp4', { headers }), {});
  try {
    for (const headers of [{ range: 'bytes=100-199' }, { range: 'bytes=100-199', 'if-range': '"v1"' }]) {
      const res = await get(headers);
      assert.equal(res.status, 206);
      assert.equal(res.headers.get('content-range'), 'bytes 100-199/1024');
      assert.deepEqual(new Uint8Array(await res.arrayBuffer()), film.slice(100, 200));
    }
    const stale = await get({ range: 'bytes=100-199', 'if-range': '"v0"' });
    assert.equal(stale.status, 200);
    assert.equal((await stale.arrayBuffer()).byteLength, 1024);
  } finally {
    globalThis.fetch = stub;
  }
});

test('the studio consulting pages are not exposed on the app subdomain', async () => {
  for (const path of ['/index.html', '/en/', '/privacy.html', '/PROGRESS.md']) {
    const { res, upstream } = await visit(path);
    assert.equal(res.status, 404, path);
    assert.deepEqual(upstream, [], path);
  }
});

test('HEAD requests are answered without a body and other methods are refused', async () => {
  const head = await visit('/', UA.iphone, { method: 'HEAD' });
  assert.equal(head.res.status, 200);
  assert.equal(head.res.body, null);
  const post = await visit('/', UA.desktop, { method: 'POST' });
  assert.equal(post.res.status, 405);
});

test('only the exact giveaway paths answer POST; every other path still refuses it', async () => {
  for (const path of ['/assets/favicon.svg', '/iphone', '/free/', '/free/Showcase/claim', '/free/a/b/claim', '/free/showcase/claim/']) {
    const { res, upstream } = await visit(path, UA.desktop, { method: 'POST' });
    assert.equal(res.status, 405, path);
    assert.deepEqual(upstream, [], path);
  }
});

test('malformed giveaway paths are plain 404s that touch no database', async () => {
  for (const path of ['/free', '/free/', '/free/UPPER', '/free/a/b', '/free/x/claim/extra']) {
    const { res, upstream } = await visit(path);
    assert.equal(res.status, 404, path);
    assert.deepEqual(upstream, [], path);
  }
});