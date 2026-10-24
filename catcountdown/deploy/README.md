# Cat Countdown Subdomain (`catcountdown.factor-io.com`)

**Current status:** Live at `https://catcountdown.factor-io.com/`, served by the Cloudflare Worker `catcountdown-site` (`catcountdown/worker/`). The Worker answers at the edge, so the printed QR code keeps working when light-worker or its uplink is down. The page is authored at `/Git/factor-io-web/cat-countdown.html`, with a query/hash-preserving directory redirect at `/Git/factor-io-web/catcountdown/index.html`. It uses document-relative `assets/...` URLs, so it renders identically under:

1. Local verification (`node scripts/serve.mjs` at `/cat-countdown.html` and `/catcountdown/`, or `file:///Git/factor-io-web/cat-countdown.html`)
2. GitHub Pages (`https://studio.factor-io.com/cat-countdown.html` and `https://studio.factor-io.com/catcountdown/`)
3. Subdomain root (`https://catcountdown.factor-io.com/` and `https://catcountdown.factor-io.com/catcountdown/`)

## Architecture

```
browser --> Cloudflare edge --> Worker catcountdown-site (route catcountdown.factor-io.com/*)
                                  |-- Android            --> 302 Google Play
                                  |-- iPhone, /iphone    --> coming-soon page (302 App Store once APP_STORE_URL is set)
                                  |-- /free/<campaign>   --> giveaway claim page (Google sign-in), POST /free/<campaign>/claim
                                  '-- desktop, crawlers  --> proxy https://studio.factor-io.com/cat-countdown.html + /assets/*
```

- The Worker is attached by a **route**, not a custom domain. The proxied `catcountdown` DNS record (a CNAME to tunnel `7f569c27`) stays as it is, and the Worker answers before that origin is reached.
- Routing mirrors the old nginx site: `/` and `/cat-countdown.html` serve the page, `/catcountdown` and `/catcountdown/` 302 to `/cat-countdown.html` with the query kept, `/assets/*` is proxied, and everything else returns `404`, so the consulting pages are never exposed on the app subdomain.
- `?noredirect=1` always shows the full page. Crawlers (the same bot list as `#scanner-controller`) always get the full page.
- Device-dependent responses carry `Vary: User-Agent` and `Cache-Control: private, no-store`.
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
