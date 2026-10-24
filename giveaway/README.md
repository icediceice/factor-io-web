# Cat Countdown giveaway admin

Hands out free copies of Cat Countdown as store promo codes, one per Google account,
through campaign links you post in communities.

```
visitor ──▶ https://catcountdown.factor-io.com/free/<campaign>   (Cloudflare Worker, public)
             Google sign-in ─▶ Worker verifies the ID token ─▶ D1: issue one code
operator ─▶ http://giveaway.factor-io.com:8788                   (this app, tailnet only)
             web UI / cli.mjs ─▶ Cloudflare D1 REST API ─▶ same D1 database
```

- **Public side:** `catcountdown/worker/src/giveaway.js`, schema in
  `catcountdown/worker/migrations/`. It keeps working when light-worker is down.
- **Admin:** this directory. It is a Node service on light-worker, bound to
  `127.0.0.1` and `100.111.93.20` only. There is no TLS, no Cloudflare proxy and no
  public route, the same as `quotes/`.

## Rules the code keeps

- **One code per Google account,** across every campaign and platform. Someone with two
  Google accounts can claim twice; Google sign-in cannot tell people apart.
- **Signing in again returns the same code.** This still works after the campaign is
  paused, ended or full: closing a link stops *new* claims only.
- **An issued code is never handed out again.** Revoking marks a code unusable, and
  re-importing it changes nothing.
- **A campaign's claim cap counts codes issued through that link.**

## Using it

Open `http://giveaway.factor-io.com:8788` from a tailnet device signed in as an
allowlisted account. On light-worker, use the CLI instead:

```sh
cd ~/.factor-giveaway
node cli.mjs campaign-create showcase --name "App showcase community" --source "showcase forum" --cap 50
node cli.mjs import --platform android --batch 2026-10 codes.txt     # one code per line
node cli.mjs stats
node cli.mjs campaign-update showcase --status paused
node cli.mjs claims --campaign showcase --csv > showcase.csv
node cli.mjs revoke --platform android BADCODE1 BADCODE2
```

Post `https://catcountdown.factor-io.com/free/<campaign-id>`. Each place you post gets
its own campaign, so claims show where people came from.

**iPhone codes.** Import them with `--platform ios`, then set the campaign's platforms
to `android,ios`. A campaign with both stores asks the visitor which phone they have.
The App Store redeem link (`PLATFORMS.ios` in the Worker) is unverified: check it with
the first real iOS code.

## Access

| Who | How | Allowed when |
|---|---|---|
| Operator (browser) | tailnet address → `tailscale whois` → `GIVEAWAY_ALLOWED_EMAILS` | login is on the list |
| CLI / agents | `Authorization: Bearer $GIVEAWAY_AGENT_TOKEN` | **loopback socket only** |

Two more checks apply to every request:

- **Host:** every request, `/healthz` included, must carry a `Host` in
  `GIVEAWAY_ALLOWED_HOSTS`.
- **Mutations:** a browser mutation from another origin is refused.

In production the server refuses to start if any setting is missing or if
`tailscale whois` does not work.

## Deploy (light-worker)

```sh
rsync -a --delete --exclude data --exclude .env --exclude tests giveaway/ ~/.factor-giveaway/
GIVEAWAY_CF_API_TOKEN=… GIVEAWAY_CF_ACCOUNT_ID=… node giveaway/deploy/write-env.mjs ~/.factor-giveaway/.env
install -m 0644 giveaway/deploy/factor-giveaway.service ~/.config/systemd/user/factor-giveaway.service
systemctl --user daemon-reload && systemctl --user enable --now factor-giveaway
CF_API_TOKEN=… node giveaway/deploy/dns-record.mjs giveaway.factor-io.com 100.111.93.20
```

- **`write-env.mjs`** keeps the existing agent token; pass `--rotate` for a new one.
  It reads the D1 id from `catcountdown/worker/wrangler.toml`, and the allowlist from
  `GIVEAWAY_ALLOWED_EMAILS` or else the quotes app's `QUOTES_ALLOWED_EMAILS`.
- **The Cloudflare token** in `.env` is currently the broad `cf-apitoken`. Replace it
  with a token limited to Account › D1 › Edit; a todo tracks this.
- **Rollback:** `systemctl --user disable --now factor-giveaway`. Stopping the admin does
  not affect the public claim page.

## Tests

```sh
node --test giveaway/tests/*.test.mjs
```