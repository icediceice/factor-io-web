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
    lib/invoice.mjs       tax invoices: frozen rates, payments, WHT certs
    lib/reports.mjs       PP 30 / income / WHT / PND worksheets (read-only)
    lib/pdf.mjs           headless Chromium renderer
    templates/quotation.mjs  bilingual A4 document template
    templates/invoice.mjs    bilingual A4 TAX INVOICE template
    ui/                   human screens (quotations, editor, invoices,
                          invoice, reports, clients, catalog, settings)
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
   VAT/WHT rates, bank details, terms). Every business fact is a settings
   row — no code edits, ever.

## Environment

| Key | Required | Meaning |
|---|---|---|
| `QUOTES_DB_PATH` | no | SQLite file (default `<app>/data/quotes.db`) |
| `QUOTES_PORT` | no | Listen port (default 8787, loopback only) |
| `NODE_ENV` | prod | `production` enables the boot gate |
| `QUOTES_SESSION_SECRET` | prod | ≥32 bytes; HMAC-signs session cookies |
| `QUOTES_GOOGLE_CLIENT_ID` | prod | Own OAuth client (NOT the board's) |
| `QUOTES_GOOGLE_CLIENT_SECRET` | prod | Pair of the above |
| `QUOTES_PUBLIC_URL` | prod | e.g. `https://quotes.factor-io.com` (redirect URI base) |
| `QUOTES_ALLOWED_EMAILS` | prod | Comma-separated allowlist; falls back to the board's `LIGHT_BOARD_ALLOWED_EMAIL(S)` so the same accounts work |
| `QUOTES_AGENT_TOKEN` | agent | Bearer token for the CLI/agent lane (actor "agent" in the audit log) |
| `QUOTES_TMPDIR` | no | PDF scratch dir (default `$HOME/quotes-tmp` — snap Chromium cannot write /tmp or hidden dirs) |
| `QUOTES_CHROMIUM` | no | Chromium binary (auto-probes chromium-browser, chromium, google-chrome) |

## Agent usage (terminal)

    export QUOTES_URL=https://quotes.factor-io.com QUOTES_AGENT_TOKEN=...
    node quotes/cli.mjs list
    node quotes/cli.mjs client-add --name "Acme" --tax-id 0105558000000
    node quotes/cli.mjs new --client 1 --lang th
    node quotes/cli.mjs line-add 1 --kind service --desc "Workshop" --qty 0.5 --price 35000.00
    node quotes/cli.mjs issue 1
    node quotes/cli.mjs pdf 1 --lang th -o quote.pdf
    node quotes/cli.mjs set vat.rate_percent 8

Every command accepts `--json` for the raw API envelope. Money crosses the
boundary as decimal STRINGS; quantities as decimal strings ("0.5" = half a
day). Issued quotations are frozen — corrections mean a new draft or a
superseding quote.

## Design notes

- **Money is integer satang everywhere**; rounding happens once per derived
  number, half-up, at the satang boundary. Tests pin the boundaries.
- **Every issued quotation writes an immutable revision snapshot**; every
  mutation writes an audit row naming the actor (email or "agent").
- **Sessions deliberately do NOT share the board cookie** — own OAuth client,
  own host-only cookie (`quotes_session`), own allowlist (board fallback).
- Thai PDFs need a Thai font on the host: `fonts-tlwg-*` (Loma) is present on
  light-worker; the deploy box must have it or TH renders fallback glyphs.
