# Factor IO Quotation System

A self-contained Node service for authoring and issuing Factor IO
quotations: a tailnet-authenticated web app for the human, a Chromium-rendered
bilingual (EN/TH) A4 PDF as the end product, and a REST API + CLI for the
agent. **Zero runtime dependencies** — node:sqlite, node:http, headless
Chromium.

Layout:

    server.mjs            HTTP adapter (tailnet/OAuth lanes, UI, PDF endpoint)
    api.mjs               pure REST router (settings, clients, catalog,
                          quotations, lines, revisions)
    cli.mjs               agent terminal driver (--json everywhere)
    smoke.mjs             end-to-end smoke run against a real server process
    lib/db.mjs            SQLite storage, forward-only migrations, audit log
    lib/auth.mjs          auth modes, OAuth sessions + agent bearer lane
    lib/tailnet.mjs       fail-closed Tailscale whois identity adapter
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
    deploy/               systemd user unit and tailnet access runbook

## Run locally (dev)

    cd quotes
    node server.mjs                 # listens on 127.0.0.1:8787
    # with no QUOTES_* env set, a loopback DEV lane is admitted so you can
    # click through the UI; the moment any credential env is set, that lane
    # closes and only real sessions/bearer tokens work.

    node smoke.mjs                  # boots its own server, 32 end-to-end checks
    node --test tests/*.test.mjs    # unit/integration suite

## Operator install (light-worker, production)

1. **Create a DNS-only A record**: `quotes.factor-io.com` →
   `100.111.93.20`. It must be grey-cloud/unproxied: Cloudflare proxying would
   reintroduce a public path.
2. **Choose an agent token**: `openssl rand -hex 32` — this is what the CLI
   sends as `QUOTES_AGENT_TOKEN`.
3. **Deploy the code**: rsync `quotes/` to `/home/ice/.factor-quotes/`
   (exclude `data/`, `node_modules/`; it has none).
4. **Create `/home/ice/.factor-quotes/.env` (0600)** — set
   `QUOTES_AUTH_MODE=tailscale`,
   `QUOTES_BIND=127.0.0.1,100.111.93.20`, the email and Host allowlists, and
   agent token. See
   "Environment" below. `NODE_ENV=production` makes the boot gate refuse when
   tailscaled whois or the allowlist is unavailable.
5. **Install the service** (see deploy/factor-quotes.service header):
   daemon-reload, `systemctl --user enable --now factor-quotes`.
6. **First use**: from an allowlisted tailnet device open
   `http://quotes.factor-io.com:8787` and fill in Settings (company block, tax IDs,
   VAT/WHT rates, bank details, terms). Every business fact is a settings row.
   There is intentionally no TLS: the Tailscale WireGuard path is encrypted,
   at the accepted cost of no browser padlock or secure-context APIs.

Full boundary checks and rollback are in `deploy/tailnet-access.md`.

### If this service ever goes public

Set `QUOTES_AUTH_MODE=oauth` and provide `QUOTES_SESSION_SECRET` (at least 32
bytes), `QUOTES_GOOGLE_CLIENT_ID`, `QUOTES_GOOGLE_CLIENT_SECRET`,
`QUOTES_PUBLIC_URL` and `QUOTES_ALLOWED_EMAILS`. A public listener, TLS and
ingress would require a new reviewed deployment design; none are shipped here.

## Environment

| Key | Required | Meaning |
|---|---|---|
| `QUOTES_DB_PATH` | no | SQLite file (default `<app>/data/quotes.db`) |
| `QUOTES_PORT` | no | Listen port (default 8787) |
| `QUOTES_BIND` | no | Comma-separated loopback/tailnet addresses (default `127.0.0.1`; wildcard and LAN binds refuse) |
| `NODE_ENV` | prod | `production` enables the boot gate |
| `QUOTES_AUTH_MODE` | prod | Explicitly `tailscale` or `oauth`; no production default |
| `QUOTES_ALLOWED_HOSTS` | tailscale | Comma-separated exact Host headers, including port; production refuses an empty list |
| `QUOTES_SESSION_SECRET` | oauth | ≥32 bytes; HMAC-signs session cookies |
| `QUOTES_GOOGLE_CLIENT_ID` | oauth | Own OAuth client (NOT the board's) |
| `QUOTES_GOOGLE_CLIENT_SECRET` | oauth | Pair of the above |
| `QUOTES_PUBLIC_URL` | oauth | Redirect URI base for public OAuth mode |
| `QUOTES_ALLOWED_EMAILS` | prod | Comma-separated allowlist; required in both modes |
| `QUOTES_AGENT_TOKEN` | agent | Bearer token for the CLI/agent lane (actor "agent" in the audit log) |
| `QUOTES_TMPDIR` | no | PDF scratch dir (default `$HOME/quotes-tmp` — snap Chromium cannot write /tmp or hidden dirs) |
| `QUOTES_CHROMIUM` | **yes, under systemd** | Chromium binary (auto-probes chromium-browser, chromium, google-chrome). **A snap Chromium cannot run under the systemd unit at all** — `NoNewPrivileges=yes` makes snap-confine fail on `cap_dac_override`, and `PrivateTmp=yes`+`ProtectSystem=full` make it refuse as "not confined". If `/usr/bin/chromium-browser` is a snap wrapper, every PDF route answers 503 "no Chromium binary found"; point this at a real Chrome/Chromium binary instead. |

## Agent usage (terminal)

    export QUOTES_URL=http://127.0.0.1:8787 QUOTES_AGENT_TOKEN=...
    node quotes/cli.mjs list
    node quotes/cli.mjs client-add --name "Acme" --tax-id 0105558000000
    node quotes/cli.mjs new --client 1 --lang th
    node quotes/cli.mjs line-add 1 --kind service --desc "Workshop" --qty 0.5 --price 35000.00
    node quotes/cli.mjs issue 1
    node quotes/cli.mjs pdf 1 --lang th -o quote.pdf
    node quotes/cli.mjs set vat.rate_percent 8

Every command accepts `--json` for the raw API envelope. Money crosses the
boundary as decimal STRINGS; quantities as decimal strings ("0.5" = half a
day).

## Correcting a quotation that has already gone out

Information is sometimes wrong only once the document is in front of someone.
An issued quotation is therefore **correctable in place**: it keeps its number,
and each issue writes the next revision.

    node quotes/cli.mjs show 1             # revision: 1
    node quotes/cli.mjs line-rm 1 3        # fix whatever was wrong
    node quotes/cli.mjs show 1             # revision: 1  EDITED SINCE ...
    node quotes/cli.mjs issue 1            # re-issued QT-...: revision 2
    node quotes/cli.mjs revisions 1        # the audit trail

The rules, all enforced server-side in `lib/quote.mjs:editRefusal`:

- **Editable while `draft`, `issued` or `proposed`.** From `accepted` onwards
  the quotation is what an invoice is raised from, so every edit route refuses
  with a reason naming that status. `declined`, `superseded` and `cancelled`
  refuse too.
- **Editing does not change the status.** A correction is not a new sales
  stage, and `proposed` has no transition back to `issued` — so re-issuing a
  proposed quotation snapshots it *without* moving it.
- **An edited quotation is stale until it is re-issued**, and while it is stale
  its **PDF is refused with 409**. A revision number printed on a document
  nobody can reproduce is worse than no revision number. `revisionStale` on the
  quotation envelope is what the UI banner, the CLI and that guard all read.
- **Drift means what the operator wrote** — lines, client, dates, notes, term,
  FX. A settings change (a VAT rate, the company address) moves the totals but
  is deliberately NOT drift: counting it would strand every open quotation
  behind a re-issue. The cost is that a rate changed after issue is not
  flagged.
- **The number never moves.** The revision list (`GET
  /quotations/:id/revisions`, `quotes revisions <id>`, and the Revisions card
  in the UI) is the audit trail: each row is rev, timestamp and actor, and each
  stored snapshot is stamped with its own revision number.
- Revision 2 and up prints beside the number on the PDF — `Rev. 2` in English,
  `ฉบับแก้ไขครั้งที่ 2` in Thai.

A superseding quotation with a NEW number is still the right move when the
scope itself changed; revising is for correcting the same offer.

## Proposing anything: line types, billing periods, sections and options

A quotation is not limited to services and hardware. **The line-type vocabulary
is a settings row, not code.**

### The `line.kinds` setting

`line.kinds` holds a JSON array of `{code, en, th}`. It ships with nine types —
`service`, `hardware`, `software`, `license`, `subscription`, `support`,
`training`, `cloud`, `expense` — and `GET /api/line-kinds` publishes the live
list alongside the billing periods, so the browser selects, the CLI and any
agent all build their options from the same source the server validates
against. Run `node quotes/cli.mjs kinds` to see it.

**Adding a type is a settings edit, not a deploy.** A `code` must match
`^[a-z0-9][a-z0-9_-]{0,30}$`, because it reaches HTML attributes, CLI flags and
query strings:

    node quotes/cli.mjs settings          # read line.kinds, add an entry
    node quotes/cli.mjs set line.kinds '[{"code":"service","en":"Service","th":"บริการ"}, ...]'

An unknown kind is **refused**, never coerced. A code with no label still
renders — the raw code is the fallback — so a half-finished settings edit
degrades the label rather than emptying the document.

### Billing period and the contract total

Each line carries `billing_period`: `once`, `monthly`, `quarterly` or `yearly`.
Unlike `kind` this stays a closed set, because the totals engine branches on it;
a new cadence needs a migration, not a settings edit. Set the quotation's
`term_months` and a mixed proposal reads:

    One-time                  ฿3,534,000.00
    Recurring per year          ฿482,000.00
    Recurring per month          ฿85,000.00
    ...
    Total payable             ฿4,388,070.00
    Contract total (36 months) ฿8,040,000.00

**The invariant that matters:** `subtotal`, `discount`, `net`, `vat`, `wht` and
`payable` mean exactly what they always meant — **one cycle, non-optional lines
only.** The contract total is a MEMO printed below the payable and visually
separated from it. It carries **no VAT**, it is never what the quotation asks to
be paid now, and it never reaches an invoice. It is `null` rather than `0` when
there is no term or nothing recurring, so a plain one-off quotation renders
exactly as it did before any of this existed.

The arithmetic is integer-exact: the satang figure is multiplied by the month
count *first* and divided last, so no per-line float ever accumulates.

### Sections

Give lines a `section` and the document groups them under a heading with a
subtotal. Grouping is by **first appearance, never sorted** — the operator
controls the running order of a proposal through line position, and re-sorting
would silently override that. With no line carrying a section, the output is
the same flat table it has always been.

A section subtotal matches the **gross** AMOUNT column above it, not the net,
because the aggregate discount appears once in the totals block. A subtotal a
reader cannot add up by hand makes the whole document look like it cannot do
arithmetic.

### Optional lines

`--optional` prices a line on the document and excludes it from **everything
payable** — subtotal, VAT, WHT, the payable and the contract total. Options
print with an `[OPTION]` marker instead of a line number, and their combined
value is reported on its own row under a note saying it is not included.

When the customer takes one, it is billed as an **ordinary** line:

    node quotes/cli.mjs invoice 12          # options are dropped
    # via the API, to take one:
    POST /api/invoices { "quotation_id": 12, "include_optional_line_ids": [47] }

`invoice_lines` deliberately has **no `optional` column**. A billed line is not
optional, so nothing downstream can exclude it from a filed total. Selecting a
line that is not optional, or not on that quotation, is refused; so is invoicing
a quotation whose every line is an untaken option — that is an error, not a
zero.

### CLI

    node quotes/cli.mjs kinds
    node quotes/cli.mjs new --client 1 --term 36
    node quotes/cli.mjs line-add 1 --kind software --desc "Platform licence" \
        --qty 1 --price 480000.00 --period yearly --section Software
    node quotes/cli.mjs line-add 1 --kind training --desc "Workshop" \
        --qty 2 --price 45000.00 --section Services --optional

## Accounting: quotation → tax invoice → settlement

The lifecycle, and the only legal moves between states:

    draft → issued → proposed → accepted → invoiced → paid
                  ↘ declined      ↘ cancelled / superseded

`issued → proposed` is the "we have put this in front of the customer" step;
`accepted` is what unlocks invoicing. Illegal jumps (`draft → paid`, going
backwards) are refused by `lib/quote.mjs` and surface as HTTP 400, not 500.

`issued → issued` is deliberate and is how a correction is recorded: it takes
another snapshot without moving the state. Editing is allowed up to and
including `proposed` — see "Correcting a quotation that has already gone out".

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

A certificate recorded **against an invoice** is capped by that invoice's own
frozen figures: the bases of all its certificates cannot exceed `net_satang`,
and the withheld amounts cannot exceed `wht_satang`. Several partial
certificates are fine — only the total is capped. Two consequences worth
knowing before the error message surprises you:

- Entering the same certificate twice is **refused**, not summed. Without that
  cap a retried API call or a double form submit would claim twice the tax
  credit on the PND, and in `memo` mode would quietly shrink the outstanding
  balance on an invoice that still has cash owed against it.
- A customer who withholds 3% of the **VAT-inclusive** total (321.00 on the
  example above instead of 300.00) is refused too. That is their arithmetic
  error to correct; crediting it would overstate the claim.

A certificate with no invoice attached is uncapped — it represents withholding
on income this system did not invoice.

Every stored accounting date — invoice issue date, payment date, certificate
date — must be a real calendar day. `2026-02-31` is rejected rather than
normalised, because the issue date **is** the VAT tax point: it is printed on
the tax invoice, it drives the due date, and it is the key the PP 30 worksheet
groups by. A blank date still means today in Bangkok.

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
- **Tailnet mode has no browser session** — identity comes from tailscaled
  whois of the socket peer. OAuth remains available only as an explicit mode.
- **Filed figures must never move.** Quotations read settings live; invoices
  copy them once at issue. Any new report reads stored invoice columns — if
  you find yourself importing settings into `lib/reports.mjs`, stop.
- **Nulls are not zeros** in the reports. Anything this system cannot know
  (input VAT, expenses, taxable profit, zero-rated vs exempt) is `null` or an
  explicit flag. Filling those with `0` would put a false number on a return.
- Thai PDFs need a Thai font on the host: `fonts-tlwg-*` (Loma). Verified on
  light-worker — `Loma.otf` is installed and Chromium embeds it (plus
  `Loma-Bold`) in the TH PDF. Note that **`Noto Sans Thai` is NOT installed**
  there, so `'Loma'` being first in the template font stack is load-bearing,
  not decorative. Without a Thai font the document renders fallback glyphs.
  (To check which fonts a produced PDF really embeds, inflate its streams
  first — a raw `/BaseFont` byte scan under-reports, because Chromium puts
  font dictionaries inside compressed object streams.)
