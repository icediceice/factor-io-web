# Design System — Factor IO Quotes (product UI)

> **This file governs `quotes/ui/`, and nothing else.**
>
> The `.interface-design/system.md` at the repository root governs the **TCO
> calculator** — a dark violet/cyan instrument panel. Applying those tokens here
> is a known trap: `log.json`'s 2026-09-11 entry records it being checked and
> refused once already for the marketing site. The quotes app inherits the
> **Engineering Field Guide** tokens declared at `assets/site.css:17`, the same
> ones `ui/app.css` has always carried.

## Design read

A back-office for one operator issuing quotations and tax invoices for a Thai
company. It is used in short, concentrated sessions — write a quotation, get a
PDF out, walk it to accepted, raise an invoice — not monitored all day.

Two things make it unusual and both drive the design:

1. **Every figure is legally consequential.** A tax invoice is a filed document.
   The interface must never make it ambiguous which number is a forecast
   (pipeline) and which is recognised income, or whether a document on screen
   still matches the revision that was sent.
2. **It is bilingual EN/TH**, and Thai has no uppercase and taller ascenders.
   Nothing may depend on `text-transform:uppercase` to carry meaning, and line
   heights must clear Thai diacritics.

Genre: **admin**. Aesthetic family: paper ledger, not SaaS dashboard.

## Dials

| Dial | Value | Why |
|---|---|---|
| `VISUAL_DENSITY` | 7 — dense-balanced | The lists are short (tens, not thousands). Cockpit density would be cosplay; airy consumer spacing would mean scrolling to compare two quotations. |
| `MOTION_INTENSITY` | 1 | Feedback only: a toast, a dialog, a row committing. Nothing loops, nothing slides in on load. |
| `DESIGN_VARIANCE` | 3 | An accounting tool is trusted because it is predictable. Surprise here reads as a bug. |

## Macrostructures

Picked per screen, recorded here so the next revision has to argue with a
decision rather than invent one. The log's previous five entries — Topology,
Focus Rail, Comparison Canvas, Decision Ledger, Spec-Sheet Ledger — all govern
the marketing site and the calculator. This is the first product UI in the log.

| Screens | Shape | Argument |
|---|---|---|
| Quotations, Clients, Invoices | **Workbench** (rail → detail) | The job is triage: scan what is open, pick one, work it. Splitting list and detail across two pages with no list in sight was the single largest usability defect of the previous build. |
| Quotation lines, invoice lines, Catalog | **Ledger** (nested in the detail pane) | The table *is* the job. |
| Reports, Settings | **Stacked Sections** | Independent worksheets and grouped facts; an anchored section nav, no rail. |

Within a selected quotation, a narrow **section rail** exposes Overview, Scope of
work, Pricing and lines, History, and AI exchange. Only one section shows at a
time. Detail and SOW edits open native dialogs so the quotation remains short;
the scope editor groups modules as disclosures and keeps the JSON form under an
Advanced disclosure. The rail repeats the Workbench pattern deliberately: the
operator is still working one selected record, now choosing one part of it.

**Not Command Deck.** There is a small stat row on the quotations screen, but it
is three figures that exist to keep *forecast* and *recognised income* apart —
it is not the shape of the screen, and it never becomes four equal KPI cards
with a chart.

## Colour

Two hues on paper. Teal is the system; orange is attention and destruction.

```
--paper   #f4f3ed   page ground
--white   #fff      raised surface (cards, rail, inputs)
--ink     #172d2a   primary text
--muted   #4b605b   secondary text AND control boundaries (6.8:1 on white)
--line    #bdc9c1   decorative hairline ONLY — never a control boundary (1.7:1)
--tint    #e2ede5   selected row, hover, table zebra
--accent  #006a57   teal — primary action, links, selection, money-bearing state
--focus   #a64b00   focus ring, and the "needs attention" status family
--danger  #8c3b00   destructive actions and refusals (7.7:1 on white)
```

`--line` and `--muted` are **not interchangeable**. A 1px `--line` between table
rows is decoration and may sit at 1.7:1; the border of an input, select or
outlined button is a control boundary and must be `--muted` to clear the 3:1
that WCAG 1.4.11 requires. Getting this backwards is the most likely way this
system silently degrades.

**Status never rides on colour alone.** Every status chip carries a colour *and*
a border style (solid / dashed / filled), so `proposed` cannot be mistaken for
`paid` in greyscale or by a colour-blind reader. Pipeline states are dashed —
provisional; money-bearing states are filled.

## Depth

**Borders only.** One hairline everywhere; no shadow on any card, row, header or
button. The single exception is the confirm dialog, which must read as floating
above the page and earns it with a scrim plus a 2px `--accent` border — the same
move the calculator's overlay sheet makes, for the same reason.

Do not add a shadow to a card here. Every other bordered surface would
immediately look broken.

## Shape

- `2px` — inputs, selects, textareas
- `3px` — buttons, chips, cards, dialog
- `0` — table cells, rail rows (they are ruled, not boxed)
- No pill radii. There are no pills in this app.

## Typography

```
--font  Inter, "Noto Sans Thai", "Loma", Tahoma, system-ui, sans-serif
--mono  ui-monospace, SFMono-Regular, Consolas, "Noto Sans Thai", "Loma", monospace
```

**Mono carries every figure that is checked against another document**: document
numbers, dates, tax IDs, money, revision numbers, percentages. That is what lets
a column be scanned instead of read, and what makes a transposed digit visible.
Prose is never mono.

| Role | Spec |
|---|---|
| Page title | `clamp(1.35rem, 2.4vw, 1.75rem)`, 600, `-.02em` |
| Card heading | 15px, 600 |
| Body / table cell | 14px / 1.55 |
| Rail row title | 14px, 600 |
| Field label | 13px, 600 |
| Micro-label (column head, section spine) | 11px mono, `.08em`, uppercase |
| Money | mono, `font-variant-numeric: tabular-nums` |
| Grand total | 17px mono, 700 |

**On uppercase micro-labels:** rationed to table column heads and section
spines. Thai text never receives `text-transform`, because it has no case and
the rule would only add letter-spacing damage.

## Spacing

Scale `4 / 8 / 12 / 16 / 20 / 28 / 40px`. Table cells `9px 12px`. Rail rows
`10px 14px`. Cards `18px 20px`.

## The eight states

Every interactive element ships all eight. This is a hard gate, not an aspiration.

| State | How it reads |
|---|---|
| default | as specified above |
| hover | background shifts to `--tint`, or fill darkens to `--ink` |
| `:focus-visible` | `3px solid var(--focus)`, `outline-offset:2px` — never removed, never replaced by a colour change |
| active | `translateY(1px)`; no shadow to remove |
| disabled | `opacity:.55`, `cursor:not-allowed`, and an explanation nearby — a disabled control with no reason given is a dead end |
| loading | `[aria-busy]` — control keeps its size, label replaced by a progress glyph, pointer events off |
| error | `--danger` border, message in text under the field, `aria-invalid` |
| success | a toast, plus the value visibly settled in place |

`:focus-visible` rather than `:focus` so a mouse click does not paint a ring,
but every keyboard path does. Minimum target 44px on anything a finger hits.

## Components

### Rail row (Workbench)

The atomic unit of every list. A real `<a>`, full width, ruled not boxed.

- Left edge carries a 3px status bar: colour + style encode state.
- Line 1: document number in mono, then the client name in sans.
- Line 2: `--muted`, 12.5px — date, status word, and the payable figure right-aligned in mono.
- Selected: `--tint` background and a 3px `--accent` left bar, plus `aria-current="true"`.
- The row never truncates the document number. If space is short, the client
  name wraps — the number is the identity.

### Confirm dialog

A native `<dialog>`. Destructive actions never fire on a single click.

- States what will be destroyed **by name and by count** — "Delete QT-202609-0004 and its 2 revision snapshots" — not "Are you sure?".
- The destructive button is `--danger` filled; Cancel is the default focus.
- A refusal (the server said no) renders in the same dialog as an explanation
  with the way forward, never as a bare toast.

### Inline edit row

A table row that becomes a form in place, keeping its column alignment. Save and
Cancel sit in the row's own action cell. Escape cancels. The row keeps its height
so the table does not jump.

### Money cell

`class="num mono"`, `tabular-nums`, right-aligned, never wraps. A negative is a
true minus `−`, never a hyphen. Zero renders as `—` only when it means *not
applicable*; a real zero renders as a zero.

## Refusals

- No icon library. Status is words plus a bar; a glyph that needs a legend is worse than a word.
- No card grid of equal tiles.
- No invented figures — every number on screen came from the API or is a visibly labelled fixture.
- No colour-only status.
- No shadow.
- No `text-transform` on Thai.