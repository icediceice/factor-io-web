// Edge router for catcountdown.factor-io.com.
//
// Mirrors catcountdown/deploy/nginx-catcountdown.conf, but answers at the Cloudflare
// edge so the printed QR code keeps working when light-worker or its uplink is down.
// The full landing page is proxied from the GitHub Pages copy on studio.factor-io.com.

import { handleGiveaway, matchGiveaway } from "./giveaway.js";
import { robotsTxt, sitemapXml } from "./seo.js";

export const PLAY_URL = "https://play.google.com/store/apps/details?id=com.catcountdown.cat_countdown";
export const ORIGIN = "https://studio.factor-io.com";
// Copied byte-for-byte from cat-countdown.html:#scanner-controller; a test checks both
// classify the same user agents the same way. No \b before "bot": Googlebot and bingbot
// end in it, and Google-InspectionTool / GoogleOther have to be named.
export const BOT_RE = /(?:bot|crawler|spider)\b|\b(?:slurp|mediapartners|google-inspectiontool|googleother|google-read-aloud|feedfetcher|bingpreview|facebookexternalhit|whatsapp|vkshare|embedly|ia_archiver|headlesschrome|lighthouse)\b/i;

// Every response here depends on the User-Agent and Referer, so no shared cache may keep one.
const NO_STORE = { "cache-control": "private, no-store", vary: "User-Agent, Referer" };
const CRAWLABLE = { "cache-control": "public, max-age=3600" };

// A QR scan or typed URL carries no Referer; a phone that followed a search result or a
// link from another site came to read about the app, so it gets the page, not the store.
function fromElsewhere(request, url) {
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).hostname.toLowerCase() !== url.hostname.toLowerCase();
  } catch {
    return false;
  }
}

function text(body, type, request) {
  return new Response(request.method === "HEAD" ? null : body, { headers: { "content-type": type, ...CRAWLABLE } });
}

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

// The landing-page film needs byte ranges (Safari will not play a <video> without 206s);
// forward only those headers, since the origin is fixed and needs no cookies or Host.
const FORWARDED = ["range", "if-range"];

async function proxy(path, request) {
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const upstream = await fetch(ORIGIN + path, { method: request.method, headers });
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const path = url.pathname;
    // Only the exact /free/<campaign> and /free/<campaign>/claim paths; it answers its
    // own methods. Everything else keeps the GET/HEAD-only rule below.
    const giveaway = matchGiveaway(path);
    if (giveaway) return handleGiveaway(request, env, giveaway);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }
    const appStoreUrl = String(env.APP_STORE_URL || "");

    if (path === "/robots.txt") return text(robotsTxt(), "text/plain; charset=utf-8", request);
    if (path === "/sitemap.xml") return text(sitemapXml(), "application/xml; charset=utf-8", request);
    if (path === "/" || path === "/cat-countdown.html") {
      const stay = url.searchParams.get("noredirect") === "1" || fromElsewhere(request, url);
      const scanner = stay ? "other" : classify(request.headers.get("user-agent"));
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