// Edge router for catcountdown.factor-io.com.
//
// Mirrors catcountdown/deploy/nginx-catcountdown.conf, but answers at the Cloudflare
// edge so the printed QR code keeps working when light-worker or its uplink is down.
// The full landing page is proxied from the GitHub Pages copy on studio.factor-io.com.

export const PLAY_URL = "https://play.google.com/store/apps/details?id=com.catcountdown.cat_countdown";
export const ORIGIN = "https://studio.factor-io.com";
// Copied byte-for-byte from cat-countdown.html:#scanner-controller; a test keeps them equal.
export const BOT_RE = /\b(?:bot|crawler|spider|slurp|mediapartners|adsbot|bingpreview|facebookexternalhit|whatsapp|twitterbot|slackbot|discordbot|telegrambot|applebot|headlesschrome|lighthouse)\b/i;

// Every response here depends on the User-Agent, so no shared cache may keep one.
const NO_STORE = { "cache-control": "private, no-store", vary: "User-Agent" };

// iPadOS Safari sends a Mac desktop UA by default, so it lands on the full page and
// the page's own #scanner-controller sends it to /iphone from the client side.
export function classify(userAgent) {
  const ua = String(userAgent || "");
  if (BOT_RE.test(ua)) return "other";
  if (/\b(?:iPhone|iPad|iPod)\b/i.test(ua)) return "ios";
  if (/\bAndroid\b/i.test(ua)) return "android";
  return "other";
}

export function comingSoonPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cat Countdown for iPhone | Coming soon</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="https://catcountdown.factor-io.com/">
<meta name="theme-color" content="#FAF6F0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#141216" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<style>
  @font-face { font-family: 'Geist'; src: url(/assets/fonts/geist-latin.woff2) format('woff2'); font-weight: 300 700; font-display: swap; }
  :root { --bg: #FAF6F0; --surface: #FFFFFF; --ink: #1C1714; --muted: #574C45; --line: #DCCFC0; --accent: #B43E1C; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #141216; --surface: #1E1B22; --ink: #F5EFE8; --muted: #BDB3A8; --line: #352F3D; --accent: #FF8E6E; }
  }
  * { box-sizing: border-box; margin: 0; }
  body { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; background: var(--bg); color: var(--ink); font-family: 'Geist', system-ui, -apple-system, sans-serif; line-height: 1.5; }
  main { width: 100%; max-width: 420px; padding: 32px 24px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); text-align: center; }
  .meta { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
  h1 { margin-top: 8px; font-size: 28px; line-height: 1.2; }
  p { margin-top: 12px; font-size: 16px; color: var(--muted); }
  a { display: inline-block; margin-top: 24px; font-size: 15px; color: var(--accent); }
</style>
</head>
<body>
<main>
  <p class="meta">Cat Countdown for iPhone</p>
  <h1>Coming soon to the App Store</h1>
  <p>Cat Countdown for iPhone is in App Store review. This page will open the App Store as soon as it is released.</p>
  <a href="/cat-countdown.html?noredirect=1">See the full page</a>
</main>
</body>
</html>
`;
}

function redirect(location) {
  return new Response(null, { status: 302, headers: { location, ...NO_STORE } });
}

function iphone(request, appStoreUrl) {
  if (appStoreUrl) return redirect(appStoreUrl);
  return new Response(request.method === "HEAD" ? null : comingSoonPage(), {
    headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE },
  });
}

async function proxy(path, request) {
  const upstream = await fetch(ORIGIN + path, { method: request.method });
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}

export default {
  async fetch(request, env = {}) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }
    const url = new URL(request.url);
    const path = url.pathname;
    const appStoreUrl = String(env.APP_STORE_URL || "");

    if (path === "/" || path === "/cat-countdown.html") {
      const scanner = url.searchParams.get("noredirect") === "1" ? "other" : classify(request.headers.get("user-agent"));
      if (scanner === "android") return redirect(PLAY_URL);
      if (scanner === "ios") return iphone(request, appStoreUrl);
      const page = await proxy("/cat-countdown.html", request);
      for (const [name, value] of Object.entries(NO_STORE)) page.headers.set(name, value);
      return page;
    }
    if (path === "/iphone") return iphone(request, appStoreUrl);
    if (path === "/catcountdown" || path === "/catcountdown/") return redirect("/cat-countdown.html" + url.search);
    if (path.startsWith("/assets/")) return proxy(path, request);
    return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};