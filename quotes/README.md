# Factor I/O Quotation System

A self-contained Node service for authoring and issuing Factor I/O
quotations: a Google-authenticated web app for the human, a Chromium-rendered
bilingual (EN/TH) A4 PDF as the end product, and a REST API + CLI for the
agent. **Zero runtime dependencies** — node:sqlite, node:http, headless
Chromium.

Layout:

    server.mjs            HTTP adapter (OAuth lanes, static UI, PDF endpoint)
    api.mjs               pure REST router (settings, clients, catalog,
                          quotations, lines, revisions)
    cli.mjs               agent terminal driver (--json everywhere)
    smoke.mjs             end-to-end smoke run against a real server process
    lib/db.mjs            SQLite storage, forward-only migrations, audit log
    lib/auth.mjs          HMAC sessions + Google OAuth + agent bearer lane
    lib/money.mjs         satang integer arithmetic (no floats, ever)
    lib/quote.mjs         totals engine, settings-driven numbering, snapshots
    lib/pdf.mjs           headless Chromium renderer
    templates/quotation.mjs  bilingual A4 document template
    ui/                   human screens (quotations, editor, clients,
                          catalog, settings)
    tests/                node --test suite
    deploy/               systemd user unit, nginx vhost, cloudflared ingress

## Run locally (dev)

    cd quotes
    node server.mjs                 # listens on 127.0.0.1:8787
    # with no QUOTES_* env set, a loopback DEV lane is admitted so you can
    # click through the UI; the moment any credential env is set, that lane
    # closes and only real sessions/bearer tokens work.

    node smoke.mjs                  # boots its own server, 12 end-to-end checks
    node --test tests/*.test.mjs    # unit/integration suite

## Operator install (light-worker, production)

1. **Create the Google OAuth client** (console action, operator only):
   type "Web application", authorised redirect URI
   `https://quotes.factor-io.com/auth/callback`.
2. **Generate a session secret**: `openssl rand -base64 48`.
3. **Choose an agent token**: `openssl rand -hex 32` — this is what the CLI
   sends as `QUOTES_AGENT_TOKEN`.
4. **Deploy the code**: rsync `quotes/` to `/home/ice/.factor-quotes/`
   (exclude `data/`, `node_modules/`; it has none).
5. **Create `/home/ice/.factor-quotes/.env` (0600)** — see "Environment"
   below. `NODE_ENV=production` makes the boot gate REFUSE to start
   half-configured instead of falling into the dev lane.
6. **Install the service** (see deploy/factor-quotes.service header):
   daemon-reload, `systemctl --user enable --now factor-quotes`.
7. **Install the nginx vhost** (deploy/nginx-quotes.conf) and the
   **cloudflared ingress** (deploy/cloudflared-quotes.yml), then reload both.
8. **First sign-in**: open https://quotes.factor-io.com, sign in with an
   allowlisted Google account, and fill in Settings (company block, tax IDs,
   VAT/WHT, bank details, terms). Every business fact is a settings row —
   no code edits, ever.