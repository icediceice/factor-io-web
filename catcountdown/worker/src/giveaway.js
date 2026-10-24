// Free-copy giveaway for catcountdown.factor-io.com/free/<campaign>.
//
// A visitor signs in with Google; the Worker verifies the ID token and hands that
// Google account exactly one promo code from the D1 pool (migrations/0001_giveaway.sql),
// attributed to the campaign link it came through. The operator manages campaigns and
// codes from the tailnet-only admin in ../../giveaway, never through this Worker.
//
// Invariant: one issued code per Google account ("sub"), across every campaign and
// platform. A repeat sign-in returns the original code; a closed or full campaign
// stops NEW issuance only.

export const SITE_ORIGIN = "https://catcountdown.factor-io.com";
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

// Adding a store is a registry entry plus an import; campaigns opt in via platforms.
// The App Store redeem URL is unverified until the first iOS codes are imported.
export const PLATFORMS = {
  android: { store: "Google Play", redeemUrl: (code) => "https://play.google.com/redeem?code=" + encodeURIComponent(code) },
  ios: { store: "App Store", redeemUrl: (code) => "https://apps.apple.com/redeem?code=" + encodeURIComponent(code) },
};

const SLUG = "[a-z0-9-]{1,64}";
const PAGE_RE = new RegExp(`^/free/(${SLUG})$`);
const CLAIM_RE = new RegExp(`^/free/(${SLUG})/claim$`);
const PRIVATE = { "cache-control": "private, no-store" };
const MAX_BODY = 8192;

// Returns null for any path that is not a giveaway route, so index.js keeps its own
// method and routing rules for everything else.
export function matchGiveaway(path) {
  let m = PAGE_RE.exec(path);
  if (m) return { kind: "page", slug: m[1] };
  m = CLAIM_RE.exec(path);
  if (m) return { kind: "claim", slug: m[1] };
  return null;
}

export async function handleGiveaway(request, env, route) {
  if (route.kind === "page") {
    if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed("GET, HEAD");
    return page(request, env, route.slug);
  }
  if (request.method !== "POST") return methodNotAllowed("POST");
  return claim(request, env, route.slug);
}

function methodNotAllowed(allow) {
  return new Response("Method Not Allowed", { status: 405, headers: { allow, ...PRIVATE } });
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...PRIVATE } });
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

function configured(env) {
  return Boolean(env.GIVEAWAY_DB && String(env.GOOGLE_CLIENT_ID || ""));
}

function offeredPlatforms(campaign) {
  return String(campaign.platforms).split(",").filter((p) => Object.hasOwn(PLATFORMS, p));
}

// ---------------------------------------------------------------------------
// Google ID token verification

export class SignInError extends Error {}
export class KeyServiceError extends Error {}

function b64urlBytes(part) {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(part) {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(part)));
}

function maxAgeMs(cacheControl) {
  const m = /max-age=(\d+)/.exec(String(cacheControl || ""));
  const seconds = m ? Number(m[1]) : 3600;
  return Math.min(Math.max(seconds, 60), 86400) * 1000;
}

// Keys are cached for the JWKS response's max-age. A token signed with a key we have
// not seen forces one refresh (Google rotates keys before the cache expires), at most
// once per missCooldownMs so garbage kids cannot hammer Google.
export function createGoogleVerifier({ fetchImpl = (url) => fetch(url), now = () => Date.now(), missCooldownMs = 30_000 } = {}) {
  let keys = new Map();
  let expiresAt = 0;
  let lastMissRefresh = -Infinity;
  let inflight = null;

  function refresh() {
    inflight ??= (async () => {
      let res;
      try {
        res = await fetchImpl(GOOGLE_JWKS_URL);
      } catch {
        throw new KeyServiceError("Google keys unreachable");
      }
      if (!res.ok) throw new KeyServiceError(`Google keys HTTP ${res.status}`);
      const body = await res.json();
      const next = new Map();
      for (const jwk of body.keys || []) {
        if (jwk.kty !== "RSA" || !jwk.kid || (jwk.alg && jwk.alg !== "RS256")) continue;
        const key = await crypto.subtle.importKey(
          "jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
        );
        next.set(jwk.kid, key);
      }
      keys = next;
      expiresAt = now() + maxAgeMs(res.headers.get("cache-control"));
    })().finally(() => { inflight = null; });
    return inflight;
  }

  async function keyFor(kid) {
    if (now() >= expiresAt) {
      try {
        await refresh();
      } catch (err) {
        if (!keys.size) throw err; // stale keys beat no keys while Google is unreachable
      }
    }
    if (!keys.has(kid) && now() - lastMissRefresh >= missCooldownMs) {
      lastMissRefresh = now();
      await refresh();
    }
    return keys.get(kid);
  }

  return async function verifyGoogleIdToken(token, audience) {
    if (typeof token !== "string" || token.length > 4096) throw new SignInError("malformed");
    const parts = token.split(".");
    if (parts.length !== 3) throw new SignInError("malformed");
    let header, claims, signature;
    try {
      header = b64urlJson(parts[0]);
      claims = b64urlJson(parts[1]);
      signature = b64urlBytes(parts[2]);
    } catch {
      throw new SignInError("malformed");
    }
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw new SignInError("algorithm");
    const key = await keyFor(header.kid);
    if (!key) throw new SignInError("unknown key");
    const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed))) throw new SignInError("signature");
    if (!GOOGLE_ISSUERS.has(claims.iss)) throw new SignInError("issuer");
    if (!audience || claims.aud !== audience) throw new SignInError("audience");
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= now()) throw new SignInError("expired");
    if (typeof claims.sub !== "string" || !claims.sub) throw new SignInError("subject");
    if (claims.email_verified !== true) throw new SignInError("email not verified");
    return { sub: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
  };
}

const verifyGoogleIdToken = createGoogleVerifier();

// ---------------------------------------------------------------------------
// Claim

function issuanceFor(db, sub) {
  return db.prepare("SELECT code, platform, campaign_id, expires_at, revoked FROM codes WHERE claimant = ?1").bind(sub).first();
}

function issued(row, status, now) {
  const state = row.revoked ? "revoked" : row.expires_at !== null && row.expires_at <= now ? "expired" : "ok";
  const platform = PLATFORMS[row.platform];
  return {
    status,
    state,
    code: row.code,
    platform: row.platform,
    store: platform.store,
    redeem_url: state === "ok" ? platform.redeemUrl(row.code) : null,
    campaign: row.campaign_id,
  };
}

// One statement picks and issues a code, so D1's single writer decides every race:
// the pool, the campaign's status and cap, and the account's one-code limit are all
// checked at the moment of the write. codes_one_per_claimant is the backstop.
const ALLOCATE = `
UPDATE codes SET claimant = ?1, email = ?2, campaign_id = ?3, claimed_at = ?4
WHERE id = (SELECT id FROM codes
            WHERE platform = ?5 AND claimant IS NULL AND revoked = 0
              AND (expires_at IS NULL OR expires_at > ?4)
            ORDER BY expires_at IS NULL, expires_at, id LIMIT 1)
  AND EXISTS (SELECT 1 FROM campaigns c
              WHERE c.id = ?3 AND c.status = 'active'
                AND (',' || c.platforms || ',') LIKE ('%,' || ?5 || ',%')
                AND (c.max_claims IS NULL
                     OR (SELECT COUNT(*) FROM codes x WHERE x.campaign_id = c.id) < c.max_claims))
  AND NOT EXISTS (SELECT 1 FROM codes y WHERE y.claimant = ?1)
RETURNING code`;

async function readJsonBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try {
    const body = JSON.parse(text);
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

async function claim(request, env, slug) {
  // The page posts with fetch(); browsers always send Origin on a POST. No CORS.
  if (request.headers.get("origin") !== SITE_ORIGIN) return json(403, { error: "forbidden" });
  if (!/^application\/json\b/i.test(request.headers.get("content-type") || "")) return json(415, { error: "json_required" });
  if (!configured(env)) return json(503, { error: "unavailable" });
  const body = await readJsonBody(request);
  if (!body) return json(400, { error: "bad_request" });

  const db = env.GIVEAWAY_DB;
  const campaign = await db.prepare("SELECT * FROM campaigns WHERE id = ?1").bind(slug).first();
  if (!campaign) return json(404, { error: "not_found" });

  let who;
  try {
    who = await verifyGoogleIdToken(body.credential, String(env.GOOGLE_CLIENT_ID));
  } catch (err) {
    if (err instanceof KeyServiceError) return json(503, { error: "try_again" });
    if (err instanceof SignInError) return json(401, { error: "sign_in_failed" });
    throw err;
  }

  const now = nowSeconds();
  const existing = await issuanceFor(db, who.sub);
  if (existing) return json(200, issued(existing, "existing", now));
  // Closed links say so before asking anything else; ALLOCATE re-checks at write time.
  if (campaign.status !== "active" || (await atCap(db, campaign))) {
    return json(409, { error: await closedReason(db, campaign, null, now) });
  }

  const offered = offeredPlatforms(campaign);
  let platform = body.platform;
  if (platform === undefined || platform === null || platform === "") {
    if (offered.length !== 1) return json(400, { error: "choose_platform", platforms: offered });
    platform = offered[0];
  }
  if (!offered.includes(platform)) return json(400, { error: "platform_not_offered", platforms: offered });

  let allocated = false;
  try {
    const { results } = await db.prepare(ALLOCATE).bind(who.sub, who.email, slug, now, platform).all();
    allocated = results.length > 0;
  } catch (err) {
    // A concurrent sign-in by the same account won the race; its code is returned below.
    if (!/UNIQUE|SQLITE_CONSTRAINT/i.test(String(err?.message ?? err))) throw err;
  }
  const mine = await issuanceFor(db, who.sub);
  if (mine) return json(200, issued(mine, allocated ? "claimed" : "existing", now));

  return json(409, { error: await closedReason(db, campaign, platform, now) });
}

async function closedReason(db, campaign, platform, now) {
  const fresh = (await db.prepare("SELECT * FROM campaigns WHERE id = ?1").bind(campaign.id).first()) ?? campaign;
  if (fresh.status !== "active") return fresh.status;
  if (await atCap(db, fresh)) return "capped";
  if (platform && !offeredPlatforms(fresh).includes(platform)) return "platform_not_offered";
  return "empty";
}

async function atCap(db, campaign) {
  if (campaign.max_claims === null) return false;
  const row = await db.prepare("SELECT COUNT(*) AS n FROM codes WHERE campaign_id = ?1").bind(campaign.id).first();
  return row.n >= campaign.max_claims;
}

async function availablePlatforms(db, campaign, now) {
  const { results } = await db.prepare(
    "SELECT DISTINCT platform FROM codes WHERE claimant IS NULL AND revoked = 0 AND (expires_at IS NULL OR expires_at > ?1)",
  ).bind(now).all();
  const stocked = new Set(results.map((r) => r.platform));
  return offeredPlatforms(campaign).filter((p) => stocked.has(p));
}

// ---------------------------------------------------------------------------
// Page

const CLOSED_TEXT = {
  paused: "New claims are paused for this link.",
  ended: "This giveaway has ended.",
  capped: "Every free copy for this link has been claimed.",
  empty: "Every free copy for this link has been claimed.",
};

async function page(request, env, slug) {
  if (!configured(env)) return html(request, 503, messagePage("Not available right now", "The giveaway is not open yet. Please check back later."));
  const db = env.GIVEAWAY_DB;
  const campaign = await db.prepare("SELECT * FROM campaigns WHERE id = ?1").bind(slug).first();
  if (!campaign) return html(request, 404, messagePage("Link not found", "This giveaway link is not valid. Check the link you followed."));

  const now = nowSeconds();
  let closed = null;
  let platforms = [];
  if (campaign.status !== "active") closed = campaign.status;
  else if (await atCap(db, campaign)) closed = "capped";
  else {
    platforms = await availablePlatforms(db, campaign, now);
    if (!platforms.length) closed = "empty";
  }
  const nonce = crypto.randomUUID().replace(/-/g, "");
  return html(request, 200, claimPage({ campaign, closed, platforms, clientId: String(env.GOOGLE_CLIENT_ID), nonce }), {
    "content-security-policy": [
      "default-src 'self'",
      `script-src 'nonce-${nonce}' https://accounts.google.com/gsi/client`,
      "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
      "frame-src https://accounts.google.com/gsi/",
      "connect-src 'self' https://accounts.google.com/gsi/",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; "),
    "cross-origin-opener-policy": "same-origin-allow-popups",
  });
}

function html(request, status, body, extra = {}) {
  return new Response(request.method === "HEAD" ? null : body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...PRIVATE, ...extra },
  });
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const STYLE = `
  @font-face { font-family: 'Geist'; src: url(/assets/fonts/geist-latin.woff2) format('woff2'); font-weight: 300 700; font-display: swap; }
  :root { --bg: #FAF6F0; --surface: #FFFFFF; --ink: #1C1714; --muted: #574C45; --line: #DCCFC0; --accent: #B43E1C; --code-bg: #F3ECE3; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #141216; --surface: #1E1B22; --ink: #F5EFE8; --muted: #BDB3A8; --line: #352F3D; --accent: #FF8E6E; --code-bg: #2A2530; }
  }
  * { box-sizing: border-box; margin: 0; }
  body { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; background: var(--bg); color: var(--ink); font-family: 'Geist', system-ui, -apple-system, sans-serif; line-height: 1.5; }
  main { width: 100%; max-width: 440px; padding: 32px 24px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); text-align: center; }
  .meta { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
  h1 { margin-top: 8px; font-size: 26px; line-height: 1.2; }
  p { margin-top: 12px; font-size: 16px; color: var(--muted); }
  .small { font-size: 13px; }
  fieldset { margin-top: 20px; border: 0; padding: 0; display: flex; gap: 12px; justify-content: center; }
  label { display: flex; gap: 6px; align-items: center; padding: 8px 14px; border: 1px solid var(--line); border-radius: 999px; cursor: pointer; font-size: 15px; }
  #signin { margin-top: 24px; display: flex; justify-content: center; min-height: 44px; }
  #result { margin-top: 20px; }
  .code { margin-top: 12px; padding: 14px; border-radius: 12px; background: var(--code-bg); font: 600 20px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.06em; word-break: break-all; color: var(--ink); }
  .button { display: inline-block; margin-top: 16px; padding: 12px 20px; border-radius: 999px; background: var(--accent); color: #fff; font-weight: 600; text-decoration: none; }
  .error { color: var(--accent); }
  a { color: var(--accent); }
`;

function shell(title, inner) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<style>${STYLE}</style>
</head>
<body>
<main>
${inner}
</main>
</body>
</html>
`;
}

export function messagePage(heading, text) {
  return shell(`Cat Countdown | ${heading}`, `  <p class="meta">Cat Countdown free copy</p>
  <h1>${escapeHtml(heading)}</h1>
  <p>${escapeHtml(text)}</p>`);
}

const CLIENT_SCRIPT = `
const cfg = JSON.parse(document.getElementById("cfg").textContent);
const result = document.getElementById("result");
const MESSAGES = {
  choose_platform: "Choose your phone first, then sign in again.",
  platform_not_offered: "That store is not part of this giveaway.",
  sign_in_failed: "Google sign-in could not be confirmed. Please try again.",
  try_again: "Sign-in is busy right now. Please try again in a minute.",
  paused: "New claims are paused for this link.",
  ended: "This giveaway has ended.",
  capped: "Every free copy for this link has been claimed.",
  empty: "Every free copy for this link has been claimed.",
  not_found: "This giveaway link is not valid.",
  unavailable: "The giveaway is not open right now.",
};
function line(text, cls) {
  const p = document.createElement("p");
  p.textContent = text;
  if (cls) p.className = cls;
  return p;
}
function show(...nodes) { result.replaceChildren(...nodes); }
function chosenPlatform() {
  const r = document.querySelector('input[name="platform"]:checked');
  if (r) return r.value;
  return cfg.platforms.length === 1 ? cfg.platforms[0] : null;
}
function showCode(c) {
  const nodes = [];
  nodes.push(line(c.status === "claimed" ? "Here is your free copy:" : "You already claimed a free copy with this Google account. Here it is:"));
  const code = document.createElement("div");
  code.className = "code";
  code.textContent = c.code;
  nodes.push(code);
  if (c.state === "ok" && /^https:\\/\\//.test(c.redeem_url || "")) {
    const a = document.createElement("a");
    a.className = "button";
    a.href = c.redeem_url;
    a.rel = "noopener";
    a.textContent = "Redeem on " + c.store;
    nodes.push(a);
    nodes.push(line("Or open " + c.store + " and redeem the code yourself. One code per Google account.", "small"));
  } else {
    nodes.push(line(c.state === "expired" ? "This code has expired. Contact admin@factor-io.com." : "This code was withdrawn. Contact admin@factor-io.com.", "error"));
  }
  show(...nodes);
}
async function onCredential(response) {
  show(line("Checking…"));
  let res, body;
  try {
    res = await fetch(cfg.claimUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential: response.credential, platform: chosenPlatform() }),
    });
    body = await res.json();
  } catch {
    return show(line("Network problem. Please try again.", "error"));
  }
  if (body && body.code) return showCode(body);
  show(line(MESSAGES[body && body.error] || "Something went wrong. Please try again.", "error"));
}
window.onGoogleLibraryLoad = () => {
  google.accounts.id.initialize({ client_id: cfg.clientId, callback: onCredential, auto_select: false });
  google.accounts.id.renderButton(document.getElementById("signin"), {
    theme: "outline", size: "large", shape: "pill", text: cfg.open ? "continue_with" : "signin_with",
  });
};
`;

export function claimPage({ campaign, closed, platforms, clientId, nonce }) {
  const open = !closed;
  const cfg = JSON.stringify({ clientId, claimUrl: `/free/${campaign.id}/claim`, open, platforms }).replace(/</g, "\\u003c");
  const chooser = open && platforms.length > 1
    ? `  <fieldset aria-label="Your phone">
${platforms.map((p) => `    <label><input type="radio" name="platform" value="${p}"> ${escapeHtml(PLATFORMS[p].store)}</label>`).join("\n")}
  </fieldset>
`
    : "";
  const intro = open
    ? `  <h1>Get Cat Countdown free</h1>
  <p>Sign in with Google to receive a free ${escapeHtml(platforms.map((p) => PLATFORMS[p].store).join(" or "))} code. One code per Google account.</p>
${chooser}`
    : `  <h1>${escapeHtml(CLOSED_TEXT[closed] ?? CLOSED_TEXT.ended)}</h1>
  <p>Already claimed a code? Sign in with the same Google account to see it again.</p>
`;
  return shell("Cat Countdown | Free copy", `  <p class="meta">${escapeHtml(campaign.name)}</p>
${intro}  <div id="signin"></div>
  <div id="result" aria-live="polite"></div>
  <p class="small">We keep your Google account id and email to give one code per account. <a href="https://studio.factor-io.com/privacy.html#giveaway">Privacy</a></p>
  <script type="application/json" id="cfg">${cfg}</script>
  <script nonce="${nonce}">${CLIENT_SCRIPT}</script>
  <script nonce="${nonce}" src="https://accounts.google.com/gsi/client" async></script>`);
}