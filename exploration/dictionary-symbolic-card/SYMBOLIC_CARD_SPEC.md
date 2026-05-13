# SYMBOLIC_CARD_SPEC

**Project:** DICTIONARY-SYMBOLIC-CARD-1 — Task B
**Scope:** Define the canonical reusable dictionary trick card. Every browse mode (By ADD / By Family / By Component / By Category) renders the *same* card; only grouping changes.
**Companion docs:** [`NOTATION_LAYER_STRATEGY.md`](./NOTATION_LAYER_STRATEGY.md) defines the underlying representation-layer model. [`OPERATIONAL_NOTATION_STYLE_GUIDE.md`](./OPERATIONAL_NOTATION_STYLE_GUIDE.md) defines the operational notation conventions the card consumes.
**Out of scope:** Implementation. CSS-class names below are illustrative, not normative.

---

## 1. North-star card structure

```
RIPWALK
4 ADD
[clip] > op in dex > butterfly wing > ss clipper
aliases: stepping butterfly, blurry butterfly
```

The card has **four primary visual slots**. The operational notation is the visually central element — co-equal with the trick name, never secondary metadata.

### 1.0 Critical design rule — one card system; progressive density

**There is exactly one card renderer.** It renders sparse single-token tricks AND deep multi-layer compounds through the same template, distinguished only by which optional slots are populated. The system explicitly forbids:

- Special-case templates for any single trick or trick class
- Mobius-only / Torque-only "showcase" layouts
- A separate "showcase mode" toggled on for prominent tricks
- View-mode branching that picks among multiple card components

Progressive density is the **only** mechanism. The card receives a `TrickCardViewModel` (§11) with optional fields populated as available; the template renders each populated slot, omits each empty slot. Sparse and deep are the same shape with different populations.

Worked sparse example:

```
TOE STALL                                                    1 ADD
[toe] > toe
```

Worked deep example (same card system):

```
MOBIUS                                                       5 ADD
[clip] > spinning > ss miraging op osis

semantic:    gyro torque
expanded:    spinning ss miraging op osis

aliases: gyro torque
```

Same component. Same template. Same CSS. Same wrapping behaviour. The only difference is which slots have content. **This invariant is load-bearing for the entire dictionary architecture.** Any future card-extension proposal that requires a new template breaks the model and must be rejected.

### 1.1 Required slots

| Slot | Content | Visibility |
|---|---|---|
| **Title** | Canonical trick name (uppercase or display-cased per scheme) | Always |
| **ADD** | The ADD value as bare integer + label | Always |
| **Operational notation** | Role-tagged token sequence rendered with coloured spans | Always when populated; "notation pending" placeholder otherwise |
| **Aliases** | Common aliases only, comma-separated, prefixed `aliases:` | Conditional (omit when empty) |

### 1.2 Optional slots (progressive disclosure)

The card MUST be extensible without breaking layout when richer representations are added later. From `NOTATION_LAYER_STRATEGY.md`:

| Slot | Content | When shown |
|---|---|---|
| **Semantic notation** | Compressed semantic form (e.g., `gyro torque` for MOBIUS) | When distinct from canonical name AND from the expanded form |
| **Expanded form** | Most-decomposed semantic reading (e.g., `spinning ss miraging op osis`) | Detail page; never primary on browse cards |
| **Folk / community names** | PassBack rendering, FM rendering, Jobs-shorthand variants | Detail page; rarely on browse cards |

Browse-mode cards default to **the four required slots**. Detail pages may extend with the optional slots. The card component accepts the same shape; the renderer chooses which slots to show via a `density` prop (`browse` | `detail`).

### 1.3 Anti-requirements

The card explicitly does NOT carry:

- Prose descriptions (the description belongs on the detail page, not in browse)
- Tutorial prose / how-to text
- Family-blurb prose
- Source / provenance text (this lives in the operational notation `sourceNote`, only on detail page)
- Inline thumbnails or media (media lives in a dedicated card-adjacent slot on detail page only)
- Symbolic-group badges (those live on the detail page in the related-topology panel)
- ADD-breakdown formulas (`stepping(+1) + butterfly(3) = 4`) — diagnostic, not browse content

---

## 2. Desktop layout

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  RIPWALK                                          4 ADD     │
│                                                             │
│  [clip] > op in dex > butterfly wing > ss clipper           │
│                                                             │
│  aliases: stepping butterfly, blurry butterfly              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- **Title row**: trick name left-aligned, ADD right-aligned, baseline-aligned on the same line. Trick name carries the link to detail page (entire title row is the affordance).
- **Notation row**: full-width below the title; left-aligned. Sits on its own line(s). Vertical space above and below is the dominant visual rhythm of the card.
- **Aliases row**: full-width below notation; left-aligned; muted typographic weight; prefix `aliases:` rendered as a small label.
- **No card border by default**; faint background tint or a single subtle horizontal separator between cards is sufficient. Heavy borders compete with the operational notation's visual weight.

### 2.1 Grid placement (browse views)

- Browse views render a single column on desktop, full-bleed cards. Operational notation rarely fits well in a multi-column grid; readability of the token sequence is the priority.
- The "By Component" view groups cards under a heading (e.g., `PARADOX`) and renders each group as a vertical stack. Same single-column behavior.

---

## 3. Mobile layout

```
┌──────────────────────────────┐
│                              │
│  RIPWALK                     │
│  4 ADD                       │
│                              │
│  [clip] > op in dex          │
│       > butterfly wing       │
│       > ss clipper           │
│                              │
│  aliases:                    │
│  stepping butterfly,         │
│  blurry butterfly            │
│                              │
└──────────────────────────────┘
```

- **Title and ADD on separate lines** on narrow viewports (< 480px). ADD remains right-aligned to itself for scannability.
- **Operational notation wraps token-by-token**: each `>` sequence operator becomes a natural break point. Multi-word tokens (`butterfly wing`, `op in dex`, `front whirl`) MUST NOT break mid-word. CSS achieves this via `display: inline-block; white-space: nowrap` on each token span, with the parent allowing wrap at token boundaries.
- **Indentation on wrapped lines**: continuation lines are indented under the leading token. The `>` operator is visually carried to the new line, not orphaned at the end of the previous line. This makes the sequence read as a continuous flow rather than a paragraph.
- **Aliases wrap normally** (CSS `text-wrap: balance` if available, else default wrapping).

### 3.1 Mobile breakpoint

- ≥ 720px: title + ADD on same line; notation flows in one or two lines as space allows
- 480–720px: title row remains single-line; notation wraps freely at token boundaries
- < 480px: title/ADD stacks vertically; notation indents continuation lines under leading token

---

## 4. Typography hierarchy

Notation must visually feel like *language*, not body text. The font choice for notation is the load-bearing typographic decision.

### 4.0 The operational notation line is the visual center of gravity

The operational notation row is **the** load-bearing slot on the card. Across the entire dictionary system, that line is becoming:

- The **movement signature** — a glance at it tells the reader what the body actually does
- The **symbolic fingerprint** — the shape that identifies a trick across alternate names
- The visual element users **recognise and scan for**

The card's typography must encode this. The operational notation row is:

- **Larger than aliases** (1.05–1.1× base vs aliases at 0.85× base)
- **Typographically stronger than metadata** (monospace with role colour vs muted body type)
- **Easier to scan than prose** (token-separated rhythm vs paragraph flow)
- **Consistent in wrapping** (always wraps at sequence operators; never mid-token; hanging indent on continuation)
- **Consistent in indentation** (the hanging-indent pattern from §6 is non-negotiable)

The title row identifies *which trick*. The operational notation row says *what the trick is, mechanically*. These two are the dominant visual elements; everything else is secondary.

When a card is glanced-at-and-moved-past, the reader should retain the operational line as a visual impression. The title is the label; the notation is the *recognition*.

### 4.1 Typeface

- **Notation tokens**: monospace family (system stack: `ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace`) with a slight tabular feel. Monospace establishes "this is a notation language."
- **Title (trick name)**: site display font, weighted bold; uppercase or display-cased per site convention.
- **ADD value**: site display font, weighted bold; numeric component slightly larger than the "ADD" label.
- **Aliases**: site body font, normal weight, muted colour. NOT monospace — aliases are folk names, language not notation.

### 4.2 Size hierarchy (relative scale)

| Element | Relative size | Weight |
|---|---|---|
| Title | 1.4× base | Bold |
| ADD value | 1.4× base (matches title) | Bold |
| Operational notation tokens | 1.05–1.1× base | Regular (monospace) |
| Aliases | 0.85× base | Regular, muted colour |
| Alias label prefix | 0.75× base | Regular, uppercase, letter-spaced |

ADD value matches title size deliberately: ADD is co-equal with name in identifying the trick. Notation is *slightly larger than body text* to give it presence without competing with the title pair.

### 4.3 Colour

- **Title + ADD**: site primary text colour.
- **Notation tokens**: each role gets a role-coded colour from the existing operational palette (`op-token-surface`, `op-token-side`, `op-token-direction`, `op-token-body-action`, `op-token-rotation-variant`, `op-token-component-flag`, `op-token-sequence-op`, `op-token-pre-state`, `op-token-unknown`). The card respects whatever palette `operationalNotationRendering.ts` emits.
- **Sequence operators (`>`, `>>`)**: muted colour, lighter than the surrounding tokens. Operators are punctuation; they organize but don't carry primary semantic weight.
- **Aliases**: muted text colour (≈60% opacity of primary).
- **Background**: faint tint (≈3–5% saturation) distinguishes the card from page background without competing with token colours. NO heavy border.

### 4.4 Token styling specifics

| Token type | Visual treatment |
|---|---|
| Bracketed component flag (`[clip]`, `[DEX]`) | Brackets render as part of the token; flag-name slightly bolder than brackets |
| Multi-word fusion (`butterfly wing`, `front whirl`) | Single inline-block; never wraps mid-fusion |
| Sequence operator (`>`, `>>`) | Muted; small horizontal padding around them; right-arrow glyph (`→`) is a future option but `>` is the canonical character |
| Pre-state flag (`(no plant while)`) | Italic, slightly muted; parentheses retained |
| Unknown / unresolved | Faint underline, tooltip available; conveys "community notation may be evolving" |

---

## 5. Spacing hierarchy

- **Within the card**: title row → 16px → notation row → 12px → aliases row. Aliases sit closer to notation than notation sits to title, signalling the alias's secondary role.
- **Between cards (in a browse stack)**: 24–32px vertical rhythm. The card is the unit of attention; breathing space between cards lets each card read as a complete object.
- **Within a notation line**: token spans separated by single-space character; CSS gap on a flex container is acceptable but the rendered HTML should produce visible single-space gaps for screen-reader and copy/paste fidelity.

---

## 6. Wrapping behavior

The operational notation must wrap cleanly. Three rules:

1. **Break at sequence operators (`>`, `>>`).** These are natural sentence boundaries.
2. **Never break mid-token.** Each token span carries `white-space: nowrap`. Multi-word fusions are atomic.
3. **Continuation lines indent under the leading token,** not flush left. The reader's eye follows indentation as it follows a paragraph's left margin.

Implementation hint (CSS-only, no JavaScript):

```css
.trick-card-operational {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 0.4em;
  row-gap: 0.4em;
  text-indent: -1.5em;
  padding-inline-start: 1.5em;
}
.trick-card-operational .op-token { white-space: nowrap; }
.trick-card-operational .op-token-sequence-op {
  margin-inline-start: 0.1em;
  color: var(--token-muted);
}
```

`text-indent` + `padding-inline-start` is the hanging-indent technique: first line sits flush, continuation lines indent under the leading token.

---

## 7. Optional future token-colorisation

Phase-2 enhancements that the card structure should accommodate without restructuring:

- **Per-token tooltips**: each token's `title` attribute carries the human-readable label from `operationalNotationRendering.ts`. Already produced by the service; the card surfaces it.
- **Token-level hyperlinks**: a body modifier token (e.g., `spinning`) could link to `/freestyle/modifier/spinning`; a base trick token (e.g., `butterfly`) could link to `/freestyle/tricks/butterfly`. This requires a future enhancement to the operational tokenizer to emit `linkHref` per token. NOT in scope for Batch 1, but the card markup should leave room for it (e.g., wrap each token in an `<a>` or `<span>` depending on whether it has a link).
- **Palette toggles**: high-contrast mode swaps the warm operational palette for a monochrome-with-weight scheme. The card consumes whatever the palette produces; toggle lives at a higher level.
- **Coloured token saturation by token category**: primary roles (`surface`, `body_action`, `rotation_variant`) saturated; secondary roles (`side`, `direction`, `pre_state`) at 60% saturation; tertiary (`sequence_op`) muted. This already exists in the existing CSS palette per the audit — the card respects it.

---

## 8. Density modes (`browse` vs `detail`)

Density modes are **NOT separate templates.** They are progressive disclosure on the same template: more populated slots render in `detail` density; fewer in `browse`. The renderer never branches; it iterates the populated slot set.

The same component renders in two density modes:

### 8.1 `browse` density

Renders the four required slots only:

```
RIPWALK                                          4 ADD
[clip] > op in dex > butterfly wing > ss clipper
aliases: stepping butterfly, blurry butterfly
```

### 8.2 `detail` density

Adds optional slots from the representation-layer model (`NOTATION_LAYER_STRATEGY.md` §3):

```
RIPWALK                                          4 ADD
[clip] > op in dex > butterfly wing > ss clipper

semantic:    stepping butterfly
expanded:    stepping op butterfly
folk:        blurry butterfly (legacy)

aliases: stepping butterfly, blurry butterfly
```

Detail density never appears in browse contexts. The card component decides what to show based on the `density` prop and the populated optional fields.

### 8.3 Detail-density example for compound tricks with compressed semantic form

```
MOBIUS                                           5 ADD
[clip] > spinning > ss miraging op osis

semantic:    gyro torque
expanded:    spinning ss miraging op osis

aliases: gyro torque
```

Mobius's `semantic` and `aliases` row carry the same string (`gyro torque`) because the folk name *is* the compressed semantic form. The card renders both rows even though they overlap textually — they represent different conceptual roles. `NOTATION_LAYER_STRATEGY.md` §4 covers the equivalence handling.

For TORQUE:

```
TORQUE                                           4 ADD
[clip] > ss miraging op osis

semantic:    miraging osis
```

Torque has no folk name distinct from its components, so the alias row is omitted. The semantic compression (`miraging osis`) is what readers most often see in dictionaries; operational shows the body mechanics.

---

## 9. Behaviour invariants (across browse modes)

Every browse mode renders cards using the SAME component. Only the grouping wrapper changes.

| View | Grouping | Card slots rendered |
|---|---|---|
| By ADD | `<section>` per ADD value (`3 ADD`, `4 ADD`, …); cards sorted within | required four |
| By Family | `<section>` per family slug (`butterfly family`, …); cards sorted by ADD within | required four |
| By Component | `<section>` per component (`paradox`, `spinning`, …); cards sorted by ADD within | required four |
| By Category | `<section>` per category (`compound`, `set primitive`, …); cards sorted by ADD within | required four |

The visual contract is: a reader scrolling any browse view sees an identical card layout. Grouping headings differ; nothing else does.

---

## 10. Accessibility

- **Semantic HTML**: card is an `<article>`; title is `<h3>` (sectioning headings carry the grouping context); notation row is a `<code>` element with `aria-label="operational notation"`; aliases row is a `<p>` with `aria-label="aliases"`.
- **Keyboard navigation**: card-level link is the title row; entire card is keyboard-focusable via the title link; tab order moves card → next card.
- **Screen reader**: token spans have `title` attributes from the existing service shape; the `aria-label` on the `<code>` element gives screen readers a chance to pronounce the notation as "operational notation: open bracket clip close bracket greater than op in dex …". Future enhancement: a hidden `<span>` per token with the human-readable role label for screen readers to opt into.
- **High-contrast**: the card's faint background and muted operators must remain visible at WCAG AA contrast minimum. Token role colours similarly.

---

## 11. Implementation hint (NOT in scope this phase)

The card component (provisional name `<TrickCard>`) consumes a single view-model shape:

```ts
interface TrickCardViewModel {
  title:                 string;           // 'Ripwalk' or 'RIPWALK' — display-cased upstream
  detailHref:            string;           // '/freestyle/tricks/ripwalk'
  addValue:              string;           // '4'
  operationalNotation:   OperationalNotation | null;   // service-shaped
  semanticNotation:      string | null;    // compressed semantic form (e.g., 'gyro torque')
  expandedForm:          string | null;    // most-decomposed form
  aliases:               string[];          // common aliases only
  density:               'browse' | 'detail';
}
```

The component decides slot visibility from the populated fields and the density mode. NO branching logic in the template beyond `{{#if}}` guards on the optional slots. The service layer owns the "common aliases only" filter; the card receives whatever array it gets.

---

## 12. Constraints honoured

- No canonical-data mutation
- No ontology change
- No ADD changes
- No alias insertion
- No parser changes
- No symbolic-grammar-dataset changes
- Operational notation grammar is consumed as-is (style-guide normalisation tracked in Task D)
- Two-layer separation (semantic vs operational) preserved
- Layer attribution from `NOTATION_LAYER_STRATEGY.md` consumed; no new representation invented here

---

*End of SYMBOLIC_CARD_SPEC.md*
