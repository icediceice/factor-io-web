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
--dim     rgba(232,230,240,.6)   secondary text
--faint   rgba(232,230,240,.42)  tertiary / help prose

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

**`--faint` does not clear AA and is not a text token.** Computed against this
ground it is 3.50:1, and 3.88:1 on the sheet's `#15151C` — under the 4.5:1 floor
for normal-size text. `--dim` is 6.09:1 and 5.93:1 respectively. Anything that
states a value, a unit, a context or a keystroke is information and takes
`--dim`; `--faint` is only for text that carries none. It remains on the
page-wide `.sub` help prose, which predates this work and is logged as a defect
rather than endorsed here.

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

The rail's atomic unit. Replaces the label-above-input block.

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

### Existing components (unchanged)

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
- Never re-add per-field help prose to the rail. That is the defect this system
  exists to have fixed.