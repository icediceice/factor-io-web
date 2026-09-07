# Design System — Factor IO TCO Calculator

> **Extracted, not authored.** This page already had a committed, coherent visual
> direction before this file existed. Every token below was read out of
> `tco-calculator.html`'s `:root` block and its component CSS. Nothing here is a
> new preference. When the two disagree, the stylesheet is right and this file is
> stale.

## Design read

A decision-support **instrument** for technical and financial buyers who are
deciding whether to buy GPUs, rent them, or pay an API. The product's whole
selling point is that every displayed number is attributable to a source. The
interface therefore reads like a terminal readout or a spec sheet, not like a
marketing page and not like a consumer app.

Aesthetic family: **dark tech / instrument panel.** No library owns this; it is
native CSS.

## Dials

| Dial | Value | Why |
|---|---|---|
| `DESIGN_VARIANCE` | 3 | An instrument is legible because it is predictable. Asymmetry here would read as a rendering bug. |
| `MOTION_INTENSITY` | 2 | Motion is feedback only: the overlay sheet entering, a value committing. Nothing loops, nothing parallaxes. A calculator that moves on its own looks like it is still computing. |
| `VISUAL_DENSITY` (results) | 9 | The results column **is** the product. Cockpit density is correct there. |
| `VISUAL_DENSITY` (input rail) | 5 | Reduced from 9. The rail was ~50 labelled inputs each carrying two lines of help prose. That density is what made the screen unreadable. |

The split matters: this is not a page-wide density decision. The rail got quiet
so the results could stay loud.

## Color

One ground, two accents, three semantic states. No gradients anywhere.

```
--bg      #0A0A0F   near-black ground (never pure #000)
--panel   rgba(27,27,32,.5)      raised surface
--line    rgba(232,230,240,.1)   hairline
--ink     #E8E6F0   primary text
--dim     rgba(232,230,240,.7)   secondary text
--faint   rgba(232,230,240,.6)   tertiary / help prose

--accent  #B46EFF   violet   section headings, selected state, the best option
--cyan    #22D3EE   cyan     links, focus, provenance affordances

--ok      #34D399   exact / verified
--warn    #F59E0B   estimated / assumed
--bad     #F87171   refusal / data gap
```

**The violet is brand, not the AI-purple tell.** It predates this work and is used
with restraint: headings, one selected state, one "best" border. It never glows,
never gradients, and never appears as a button fill outside `.btn-p`.

**Color carries provenance.** Green/amber/red are not decoration here — they are
the exact/estimated/unknown contract the calculator is built to communicate.
Never reuse them for aesthetic emphasis.

**Help text is information.** The 2026-09-06 UX pass raises `--faint` from .42
to .6 alpha (the previous secondary-text level) and `--dim` to .7. Do not restore
the old low-contrast help token. The previous .6 calculation was 6.09:1 on the
ground and 5.93:1 on the sheet; these are calculated token ratios, not a new
browser measurement. Inspect composite surfaces when introducing another fill.

## Depth

**Borders only.** One hairline, `1px solid var(--line)`, plus `--panel` as a
translucent raised fill. There are no shadows on this page and none should be
added. The overlay sheet is the single exception: it is the only element that
must read as floating above the page, and it earns that with a scrim plus a cyan
border, not a drop shadow.

Do not mix strategies. Adding a shadow to a card here would make every other
bordered surface look broken.

## Shape

Radius scale, applied consistently:

- `3px` — tags, inline code
- `4px` — inputs, buttons, cards, the overlay sheet
- `5px` — result cards and verdict cards
- `999px` — chips (preset pills) only

## Typography

Two families. System sans for prose, mono for **every number**.

```
--mono  ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
sans    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial
```

`font-mono` on all numerals is a hard rule at this density — it is what lets a
column of figures be scanned rather than read.

Scale:

| Role | Size / spec |
|---|---|
| Section heading (`.sec > h2`) | 10.5px mono, `letter-spacing:.18em`, uppercase, violet |
| Card heading (`h3`) | 14px, 600 |
| Body | 15px/1.6 |
| Card body / table | 12.5px |
| Field label | 11.5px, `--dim` |
| Help prose (`.sub`) | 10.5px, `--faint` |
| Verdict figure | 20px mono |
| KPI figure | 15px mono |

**On the uppercase micro-label:** frontend-design rations these as an AI tell.
Here they are the section spine of an instrument panel, one per section, and they
predate this work. They stay. The rule they must obey is that they never
proliferate below section level — a spec line inside a section does not get one.

## Spacing

Base unit 1px with a practical scale of `3 / 5 / 6 / 8 / 9 / 12 / 18px`. The rail
runs tighter than the results column by design.

## Components

### Spec line (added by this work)

The detailed rail's atomic unit. Primary exploration fields remain inline.

```
People using it ·····················  500
```

- A real `<button>`, full-width, transparent, no border until hover.
- Label left in `--dim` at 11.5px sans; leader dots in `--line`; value right in
  mono at 12.5px `--ink`.
- The leader is a `::after` pseudo-element on the label, not a DOM node — it must
  never enter the button's accessible name. It is `flex:1 1 8px; min-width:0`, so
  a long label eats it and wraps rather than truncating.
- Unit suffix in `--dim`, never in the value's own color — the number and its
  unit are different information, but both are information, so both clear AA.
- A field left at its derived/placeholder state shows that word in `--dim`
  italic rather than an empty slot. An empty right-hand column reads as broken.
- Hover: border-color `--accent` at .55 alpha, matching `.chip:hover`.
- Focus: `--cyan` outline, matching every other focusable thing on the page.

### Overlay sheet (added by this work)

One value at a time, centered, over a scrim.

- Carries the field's **full** help prose. This is the only reason the rail can
  be quiet: the writing is not deleted, it is relocated to where there is room.
- Hosts the **real** control node, relocated in and returned on close. Never a
  copy. This calculator's contract is that a displayed number is attributable;
  two nodes holding one value is precisely the bug class that breaks it.
- `role="dialog" aria-modal="true"`, focus trapped, Esc and scrim close, Enter
  commits, focus returns to the originating spec line.
- Border `--cyan`, background `#15151C` — matching the existing `.pop` provenance
  popover, which is the same idea at a smaller scale.

### Primary exploration and comparison (2026-09-06)

- Users, sessions/day, horizon and peak concurrency keep their real text input
  visible beside a native labelled range. Rental utilization uses the same pair
  in its sheet. Sliders offer exploration bounds, not recommended values.
- Exact text entry is authoritative, including off-step and off-scale values.
  Off-scale ranges are hidden/disabled with an explicit note; syncing a range
  never writes its clamped value back. No pointer-only scrub gestures.
- `data-inline` excludes primary fields from vaulting. A shared range-blind
  selector identifies authoritative controls in harvesting, summaries and close.
- Pending edits remove stale results/export immediately; expensive derivation
  and comparison run after a 220ms pause, with chip sync after derivation.
- Headline cards rank the selected horizon's infrastructure + platform licence
  + upfront cost, using exact arithmetic and joint-tie labels. Additional
  commercial fees are stated alongside, never silently called inclusive TCO.
- Native focus outlines, 44px mobile actions, local table scrolling, a results
  jump and print stylesheet support use beyond a desktop. Narrow-viewport and
  PDF rendering still require browser measurement (not proved by unit tests).

### Decision-named rail sections (2026-09-07, v0.8)

The rail is organised by the DECISION each section settles, not by the category
of field it holds. `How much demand` · `What the work is` · `Which model you'd
run` · `What you'd compare against` · `What you assume about money` ·
`Service level & routing`, each restating its question in the `.hint` beneath.

- **One disclosure layer.** A section folds; nothing inside a section folds
  again. A `<details class="adv">` nested in a section that already folds put
  routing policy two levels down, which is what made the rail feel like it was
  hiding things. The one surviving `details.adv` is `Tokens per turn`, and it
  earns it by being a 4×4 table of raw inputs rather than a decision.
- **`.subsec`** is the replacement for a nested disclosure — a labelled band
  separated by a hairline, always visible when its section is open. Its
  `.subhead` is 11.5px sans in `--dim`, deliberately NOT an uppercase mono
  micro-label: those are rationed to one per section spine (see Typography).
- **`data-open` on the section declares the fold default.** It used to be a Set
  of heading strings inside `fields.js`, so renaming a heading silently folded
  every section with nothing to catch it. Display copy must never be a
  behavioural key.

### Other components

`.chip` preset pills, `.card`, `.vcard` verdict cards, `.kpi` grid, `.tag`
provenance tags, `.pop` provenance popover, `.banner` / `.gap` alerts.

## Theme

**Dark-locked.** `color-scheme: dark` is declared and there is no light palette.
This is deliberate for an instrument and is not a gap to fill. Any future light
mode is a separate elevation system, not an inversion.

## Never do this here

- Never add a shadow. The depth strategy is borders.
- Never put a number in a proportional font.
- Never use `--ok` / `--warn` / `--bad` for emphasis. They mean exact / estimated
  / unknown, and nothing else.
- Never let a value slot render empty. Show the derived word.
- Never proxy an input. Relocate the real node.
- Keep detailed help in the sheet. Inline primary fields may show concise units,
  slider bounds and essential context; do not expand every advanced field.