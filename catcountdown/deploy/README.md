# Cat Countdown Subdomain (`catcountdown.factor-io.com`)

**Current status:** Live at `https://catcountdown.factor-io.com/`, served by the Cloudflare Worker `catcountdown-site` (`catcountdown/worker/`). The Worker answers at the edge, so the printed QR code keeps working when light-worker or its uplink is down. The page is authored at `/Git/factor-io-web/cat-countdown.html`, with a query/hash-preserving directory redirect at `/Git/factor-io-web/catcountdown/index.html`. It uses document-relative `assets/...` URLs, so it renders identically under:

1. Local verification (`node scripts/serve.mjs` at `/cat-countdown.html` and `/catcountdown/`, or `file:///Git/factor-io-web/cat-countdown.html`)
2. GitHub Pages (`https://studio.factor-io.com/cat-countdown.html` and `https://studio.factor-io.com/catcountdown/`)
3. Subdomain root (`https://catcountdown.factor-io.com/` and `https://catcountdown.factor-io.com/catcountdown/`)

## Architecture

```
browser --> Cloudflare edge --> Worker catcountdown-site (route catcountdown.factor-io.com/*)
                                  |-- /robots.txt, /sitemap.xml --> answered by the Worker (src/seo.js)
                                  |-- /app (any device)  --> the page, never a store redirect; /app/ --> 302 /app
                                  |-- Android, no outside Referer --> 302 Google Play
                                  |-- iPhone, no outside Referer, /iphone --> coming-soon page (302 App Store once APP_STORE_URL is set)
                                  |-- /free/<campaign>   --> giveaway claim page (Google sign-in), POST /free/<campaign>/claim
                                  '-- desktop, crawlers, phones from a search result --> proxy https://studio.factor-io.com/cat-countdown.html + /assets/*
```

- The Worker is attached by a **route**, not a custom domain. The proxied `catcountdown` DNS record (a CNAME to tunnel `7f569c27`) stays as it is, and the Worker answers before that origin is reached.
- Routing mirrors the old nginx site: `/` and `/cat-countdown.html` serve the page, `/catcountdown` and `/catcountdown/` 302 to `/cat-countdown.html` with the query kept, `/assets/*` is proxied, and everything else returns `404`, so the consulting pages are never exposed on the app subdomain.
- **`/app` is the marketing link.** It always serves the page, on every device, and the page script does not bounce it either. Use it wherever people should read about the app first: the Play listing's Website field, the studio site's Cat Countdown button, social posts. Links from the Play app and in-app browsers usually send no Referer, so `/` would send them straight back to the store. `/` stays the QR target. The page's assets are document-relative, so `/app/` redirects to `/app` (query kept) instead of loading `/app/assets/...`.
- `?noredirect=1` always shows the full page. Crawlers always get the full page. The Worker's `BOT_RE` is a byte copy of the one in `#scanner-controller`, and a test checks that both sort the same user agents the same way. It has no `\b` before `bot`, so Googlebot and bingbot match, and it names Google-InspectionTool and GoogleOther. Before that, Search Console's live test was redirected to Play.
- **Referrer rule.** A phone is sent to a store only when the request has no Referer or a Referer from this host, as with a QR scan, a typed URL or a same-site click. A phone that arrives from Google or any other site came to read about the app, so it gets the page. The page script applies the same rule to `document.referrer`.
- `/robots.txt` disallows nothing; the `/free/` and `/iphone` pages carry their own `noindex`. `/sitemap.xml` lists the landing page with its share image, capture posters, cat stills and every scene. Bump `LASTMOD` in `src/seo.js` when the page or its assets change. Search Console property: `sc-domain:factor-io.com`.
- Device-dependent responses carry `Vary: User-Agent, Referer` and `Cache-Control: private, no-store`.
- iPadOS Safari sends a desktop Mac UA that the Worker cannot classify. The page's inline `#scanner-controller` detects it (`Macintosh` with `maxTouchPoints > 1`) and, only on `catcountdown.factor-io.com`, replaces the location with `/iphone`.
- The full page comes from GitHub Pages, so a page change goes live on the subdomain once it is pushed to `main`.

## Giveaway

`/free/<campaign>` hands out free copies as store promo codes, one per Google account. Code: `catcountdown/worker/src/giveaway.js`. Schema: `catcountdown/worker/migrations/`. Data: D1 database `catcountdown-giveaway` (binding `GIVEAWAY_DB`). Campaigns and codes are managed from the tailnet-only admin in [`giveaway/`](../../giveaway/README.md), never through the Worker.

- **Sign-in.** The page loads Google Identity Services with the public client id `GOOGLE_CLIENT_ID` from `wrangler.toml`. It posts the ID token as JSON to `/free/<campaign>/claim`.
  - The Worker accepts the post only with `Origin: https://catcountdown.factor-io.com`.
  - It checks the token itself: RS256 against Google's JWKS, issuer, audience, expiry, and `email_verified === true`.
  - It keeps the Google `sub`, email, campaign, time and code. `privacy.html#giveaway` discloses this.
- **Allocation.** Allocation is one guarded `UPDATE … RETURNING`. It checks, at the moment of the write:
  - the pool and code expiry,
  - the campaign's status, store and cap,
  - and that the account has no code yet.
  A unique index on `codes(claimant)` is the backstop. A repeat sign-in returns the original code, even after the campaign closes.
- **Not configured.** If `GOOGLE_CLIENT_ID` is empty or the binding is missing, `/free/*` answers "not open yet" and every other route is unaffected.
- **Schema changes.** Add a new numbered file in `migrations/`, then `npx wrangler@4 d1 migrations apply catcountdown-giveaway --remote --config /Git/factor-io-web/catcountdown/worker/wrangler.toml`.
- **Deletion on request.** The privacy page promises this. Replace the identity but keep the code issued:
  `npx wrangler@4 d1 execute catcountdown-giveaway --remote --config … --command "UPDATE codes SET claimant = 'deleted-' || id, email = NULL WHERE email = '<address>'"`.
- **Google Cloud.** The OAuth consent screen is External with scopes `openid email`. One Web client has the Authorized JavaScript origin `https://catcountdown.factor-io.com`. The client id is public and lives in `wrangler.toml`; there is no client secret.

## Page assets

`assets/cat-countdown/` is generated by the script below and committed. It holds the art read from the app repo `/Git/cat_countdown_flutter`, which the script never writes to, and the simulator captures. Raw `.mov` recordings are never committed.

```bash
~/.venv-rembg/bin/python3 -I scripts/cat-countdown-assets.py --clips <dir of .mov captures>   # everything
~/.venv-rembg/bin/python3 -I scripts/cat-countdown-assets.py --only clips --clips <dir>      # re-encode captures only
~/.venv-rembg/bin/python3 -I scripts/cat-countdown-assets.py --only clips --clips <dir> --clip bg-   # only the bg-* set, keeps the rest
```

The eight `bg-*` background clips each feature a different cat (named under each swatch on the page). For each one, the nearest countdown in the seeded data was set to five days out with that cat, and Settings > Background was set to that scene alone. Starlight, fireflies and embers were recorded with Appearance set to Dark.

The captures were recorded on mac-mini with the iPhone 17 Pro simulator, using `xcrun simctl io <udid> recordVideo --codec=h264` on seeded demo data. The animated cats take most of the roughly 18-minute full run. Only the 700 weight of Baloo 2 ships, as a TTF, because fontTools is not installed for subsetting it to woff2.

## Deploy

Credentials come from the light-worker vault (`cf-apitoken`, `cf-accountid`) through `env_refs`; `wrangler login` is never used.

```bash
npx wrangler@4 deploy --config /Git/factor-io-web/catcountdown/worker/wrangler.toml
```

## Releasing on the App Store

Set `APP_STORE_URL` under `[vars]` in `catcountdown/worker/wrangler.toml` to the App Store listing URL and redeploy. iPhone scanners are then sent straight to the App Store. Also update the iPhone stub button and notice in `cat-countdown.html`.

## Rollback

`npx wrangler@4 delete --config /Git/factor-io-web/catcountdown/worker/wrangler.toml` removes the Worker and its route. Requests then fall through to the legacy path below, which is still installed on light-worker.

## Legacy origin (light-worker)

Before the Worker, the subdomain was served as `browser --> cloudflared --> nginx :80 --> /Git/factor-io-web/cat-countdown.html`, using the files in this directory:

- `nginx-catcountdown.conf`, installed at `/etc/nginx/sites-enabled/factor-catcountdown`.
- `cloudflared-catcountdown.yml`, an ingress fragment in `/etc/cloudflared/config.yml` above `- service: http_status:404` (pre-launch backup at `/etc/cloudflared/config.yml.bak.v10-precatcountdown`).

Both are left in place as the rollback target. Do not delete the DNS record: the Worker route needs a proxied record to attach to.
