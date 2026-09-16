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

    node smoke.mjs                  # boots its own server, 32 end-to-end checks
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

## Accounting: quotation → tax invoice → settlement

The lifecycle, and the only legal moves between states:

    draft → issued → proposed → accepted → invoiced → paid
                  ↘ declined      ↘ cancelled / superseded

`issued → proposed` is the "we have put this in front of the customer" step;
`accepted` is what unlocks invoicing. Illegal jumps (`draft → paid`, going
backwards) are refused by `lib/quote.mjs` and surface as HTTP 400, not 500.

### The tax point is the invoice issue date

Income is recognised on **accrual**, dated by the tax invoice's `issue_date` —
not when the cash lands. That date is also the VAT tax point, so it decides
which PP 30 period the output VAT falls into. The Revenue Code tax point for
services is the earliest of: payment made, tax invoice issued, or service
utilised; issuing the invoice is the event this system records.

`issue_date` is written in Asia/Bangkok at write time (`lib/money.mjs:todayBkk`),
and reports match months by plain string prefix. The timezone decision is made
once, on write. An invoice issued at 23:30 on 31 January Bangkok time is stored
as `2026-01-31` and lands in January — there is no UTC drift at a month edge.

### Rates are FROZEN onto the invoice

A quotation recomputes its totals from live settings on every read. An invoice
must not: a figure already transcribed onto a filed PP 30 cannot be allowed to
move because someone edited `vat.rate_percent` months later.

So `issueInvoice()` is the single place that reads rates from settings. It
copies `vat_rate_percent`, `wht_rate_percent`, `wht_mode` and every satang
total onto the invoice row, once, and every report and PDF reads only those
stored columns. Editing a rate afterwards changes nothing that was already
issued. This is pinned by tests at three levels — unit, report, and smoke.

Raising an invoice also **snapshots the lines**, so editing the source
quotation afterwards cannot move an invoiced figure.

### Withholding tax: `memo` vs `deduct`

WHT is computed on the **net, pre-VAT base**, never on the VAT-inclusive total.
The `wht.apply` setting decides how it appears, and the two modes settle
differently:

| Mode | Invoice face | Customer transfers | Does the certificate settle? |
|---|---|---|---|
| `memo` | full grand total | grand − WHT | **Yes** — it closes the gap |
| `deduct` | grand − WHT | the invoice face | **No** — already deducted |

Worked example at 7% VAT / 3% WHT on a net of 10,000.00: VAT 700.00, grand
10,700.00, WHT 300.00, so the customer transfers 10,400.00. In `memo` mode the
invoice says 10,700.00 and the certificate for 300.00 settles the remainder; in
`deduct` mode the invoice says 10,400.00 and only cash can settle it. Counting
the certificate in `deduct` mode would mark an invoice paid while cash is still
owed.

### Reports are worksheets, never a filing channel

Nothing in this system submits anything to the Revenue Department. The reports
produce figures to **read and transcribe** onto a return, and they are
deliberately honest about what they cannot know:

- **PP 30** (monthly VAT, due the 15th on paper / 23rd by e-filing): output
  side only. `inputVatSatang` and `netPayableSatang` return `null`, never `0` —
  a zero there would be a false statement on a return. Expenses are out of
  scope, so input VAT is yours to add by hand.
- A 0% invoice sets `unclassified: true`. Zero-rated and exempt sales occupy
  **different boxes** on the PP 30 and this system has no per-invoice tax
  classification, so it refuses to guess. Classify those by hand.
- **PND 50 / 51**: revenue and creditable withholding only. `expensesSatang`
  and `taxableProfitSatang` are `null` for the same reason.
- **WHT register**: certificates received are a **credit** against the
  company's own income tax, never a cost.
- Only `issued` and `paid` invoices are income. Drafts and cancelled invoices
  are not.

### Settings keys this adds

| Key | Default | Meaning |
|---|---|---|
| `invoice.number_format` | `INV-{YYYY}{MM}-{SEQ:4}` | Own counter; never collides with quote numbers |
| `invoice.payment_terms_days` | `30` | Drives `due_date` from the issue date |
| `invoice.terms_en` / `invoice.terms_th` | — | Printed on the tax invoice |
| `tax.entity_type` | `company` | Co., Ltd. — PP 30 / PND 50 / 51 |
| `tax.vat_registered` | `1` | |
| `tax.branch_code` | `00000` | Head office; frozen onto each invoice |
| `tax.fiscal_year_end` | `12-31` | |
| `company.branch_th` / `company.branch_en` | สำนักงานใหญ่ / Head Office | Printed on the document |

Existing `vat.rate_percent`, `wht.rate_percent` and `wht.apply` keep their
meaning — they are simply *copied* onto an invoice at issue instead of being
read live.

### Tax invoice document

`templates/invoice.mjs` carries the mandatory particulars from the Revenue
Department's VAT page (rd.go.th/english/6043.html §6): the words "Tax invoice"
prominently, the issuer's name/address/TIN, the purchaser's name and address,
the serial number, the description/value/quantity, the VAT amount as its own
figure, and the date of issuance.

**Per-line discounts render as their own visible column, and must stay that
way.** Under §3.1 a discount leaves the VAT base *only if* it is clearly shown
on the tax invoice — a discount folded into a unit price is not deductible.

A draft invoice is still renderable so it can be proofed, but it is watermarked
"NOT A VALID TAX INVOICE" and its filename carries `-DRAFT`: an unissued
document has no tax point.

### Agent usage

    node cli.mjs propose 1                 # issued  → proposed
    node cli.mjs accept 1                  # proposed → accepted
    node cli.mjs invoice 1                 # raise a draft invoice
    node cli.mjs inv-issue 1               # FREEZES the rates; sets the tax point
    node cli.mjs pay 1 --amount 10400.00 --method transfer
    node cli.mjs wht-add 1 --base 10000.00 --wht 300.00 --form PND53
    node cli.mjs inv-pdf 1 --lang th -o invoice.pdf
    node cli.mjs report pp30 --year 2026 --month 9
    node cli.mjs report income --year 2026

## Design notes

- **Money is integer satang everywhere**; rounding happens once per derived
  number, half-up, at the satang boundary. Tests pin the boundaries.
- **Every issued quotation writes an immutable revision snapshot**; every
  mutation writes an audit row naming the actor (email or "agent").
- **Sessions deliberately do NOT share the board cookie** — own OAuth client,
  own host-only cookie (`quotes_session`), own allowlist (board fallback).
- Thai PDFs need a Thai font on the host: `fonts-tlwg-*` (Loma) is present on
  light-worker; the deploy box must have it or TH renders fallback glyphs.
