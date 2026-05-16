# Compact Symbolic Object — Visual Refinement Plan

Batch 4 of the IA realignment. Generated 2026-05-14. Pre-implementation planning artifact; no code shipped from this slice. Implementation gated on maintainer approval.

Companion to `FREESTYLE_IA_REALIGNMENT_PLAN.md` (parent IA plan) and `GLOSSARY_PEDAGOGY_REALIGNMENT_PLAN.md` (Batch 3 pedagogy plan). Where Batch 2 established the symbolic-object pattern and Batch 3 stabilized the glossary, Batch 4 owns its **typography, spacing, and visual rhythm** — pure visual refinement, zero ontology / content / behavior change.

---

## TL;DR

Three surfaces currently render symbolic objects with subtly inconsistent visual language (landing Core Tricks, glossary compression-flow, dictionary browse). One real hierarchy bug (ADD outweighs `#slug` in font size on landing cards). One opportunity to lighten the heaviest decorative element (`.glossary-thesis` background panel).

Proposed changes:
1. **Fix the hierarchy bug**: shrink ADD, grow `#slug`, render ADD as a compact badge rather than a large bold number.
2. **Differentiate the equivalence layer**: serif italic (vs monospace + italic mix today) — gives `≡ readings` their own typographic voice.
3. **Lighten card containment**: drop the 2px left border on `.core-trick-object`; rely on whitespace + typography for object identity.
4. **Unify dictionary browse cards** with the landing/glossary symbolic-object pattern via a shared base class.
5. **Polish glossary flow arrows + thesis box**: smaller, less infographic-y, more typographic.
6. **Mobile rhythm**: hanging-indent wrap for long notation strings; ADD badge stays inline at narrow widths.

Out of scope (explicit): no ontology, no new operators, no new glossary prose, no decomposition depth changes, no animation, no Jobs notation reframing, no dashboard UI vocabulary.

---

## PART 1 — Typography hierarchy proposal

### The current hierarchy is inverted by accident

Current measured values (Batch 2 CSS, `style.css:5269–5306`):

| Layer | Class | Size | Weight | Family | Color |
|---|---|---:|---:|---|---|
| PRIMARY — `#slug` | `.core-trick-slug` | **1.05rem** | 700 | monospace | `--secondary` (teal) |
| SECONDARY — `≡` | `.core-trick-equivalence` | 0.93rem | 400 | system + italic | `--text` |
| TERTIARY — notation | `.core-trick-notation` | 0.86rem | 400 | monospace | `--text-muted` |
| QUATERNARY — ADD | `.core-trick-add-value` | **1.15rem** | 700 | monospace | `--primary` (green) |

The ADD value is **9% larger and equally bold as the slug identity**. Visually, the green ADD number is the heaviest element on each card — the opposite of the intended `identity → structure → notation → weight` reading order.

### Proposed hierarchy

| Layer | Size | Weight | Family | Color | Treatment |
|---|---:|---:|---|---|---|
| PRIMARY — `#slug` | **1.20rem** | 700 | ui-monospace stack | `--secondary` | Slight letter-spacing (0.01em); the visual anchor |
| SECONDARY — `≡ reading` | **0.96rem** | 400 | **serif italic** (Georgia, 'Iowan Old Style', serif) | `--text` | Italic carries the compositional-language voice — semantic identity |
| TERTIARY — notation | **0.82rem** | 400 | ui-monospace stack | `--text-subtle` *(new token: ~#8a8a8a)* | Letter-spacing 0.02em; technical character, clearly subordinate to equivalence |
| QUATERNARY — ADD | 0.78rem | 600 | ui-monospace stack | `--primary` | Rendered as a compact badge (see PART 1B), not a freestanding number |

Net effect: `#slug` becomes the largest, ADD becomes a small numeric chip, equivalence gets its own type family (semantic identity), notation reads as clearly subordinate technical detail.

### 1A-bis — Equivalence-over-notation weight relationship (maintainer guidance 2026-05-14)

The conceptual ordering is **equivalence > notation**. Equivalence is semantic identity (what the trick IS, compositionally); notation is implementation detail (how it executes). The visual ordering must reinforce this:

| | Equivalence layer | Notation layer | Differential |
|---|---|---|---|
| Size | 0.96rem | 0.82rem | 17% larger |
| Color | `--text` (#333) | `--text-subtle` (~#8a8a8a, new token) | Equivalence at full body strength; notation distinctly dimmer |
| Family | Serif italic (Georgia) | Monospace | Different families — linguistic vs technical voice |
| Weight | 400 | 400 | (same weight; differentiation via size + color + family) |

The contrast must be unmistakable on first glance: equivalence reads as compositional language, notation reads as subordinate technical annotation. Implementer: if either layer drifts visually toward the other (e.g., notation color creeps toward `--text`, or equivalence size shrinks toward 0.85rem), the hierarchy is broken.

**New token**. Add to `:root` (`style.css:40–54`):

```css
--text-subtle: #8a8a8a;   /* between --text-muted (#666) and a wash;
                             reserved for clearly subordinate technical
                             content (notation lines, lineage attributions). */
```

### 1B — ADD as compact badge

Current ADD is a bold green number occupying its own line. Proposed treatment:

```css
.core-trick-add-value {
  display: inline-block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--primary);
  background: transparent;
  border: 1px solid var(--primary);
  border-radius: 3px;
  padding: 1px 7px;
  letter-spacing: 0.02em;
}
```

A small outlined chip — readable but not gamified. Sits at the bottom of the card (existing position) but visually recedes vs the slug.

Pending state (orbit) stays as a muted italic `—` with no chip border, so the visual asymmetry signals "pending" without footnote noise.

### 1C — Family-count cap

Two type families maximum across the symbolic-object surface: **ui-monospace stack** (identity, notation, ADD chip) and **serif italic** (equivalence readings). No sans-serif intrusion inside symbolic objects; no third family introduced.

---

## PART 2 — Symbolic-object spacing system

### Current spacing (measured)

`.core-trick-object`: `padding: 16px 18px 14px 18px`, `gap: 6px`, `min-height: 110px`, `border-left: 2px solid var(--secondary)`.

`.freestyle-core-trick-grid`: `gap: 18px 22px`, `auto-fit minmax(200px, 1fr)`.

### Issues

- `min-height: 110px` forces atom cards (2-line content) to match the height of compound cards (4-line content). Creates artificial whitespace. Database-row vibe.
- 18px outer card padding on a 200px minimum-width card consumes ~18% of horizontal real estate to padding. Tight cards feel cramped.
- `gap: 6px` between lines is generous for the dense visual rhythm the user wants.

### Proposed system

| Variable | Current | Proposed | Rationale |
|---|---|---|---|
| Card inner padding | 16/18/14/18 | **12px 14px 10px 14px** | Slightly tighter; lets the slug breathe without consuming card area |
| Inter-line gap | 6px | **4px** | Tighter rhythm reinforces the cards as compositional objects, not text blocks |
| Card min-height | 110px | **none** (remove) | Cards size to content; visual asymmetry between atom and compound is intentional |
| Grid gap | 18px / 22px | **20px / 22px** | Slightly more horizontal breathing room between cards in the grid |
| Card border-left | 2px solid teal | **none** (remove) | Eliminates the per-card vertical rule; typography carries object identity |
| Card border-bottom (NEW) | — | **1px solid rgba(text, 0.06)** | Optional whisper-thin separator; visual rhythm without container vibe. Maintainer-decidable. |
| Grid column minmax | 200px | **210px** | One extra column-width unit absorbs the larger slug |

### 2B — Whitespace as the structural cue

After removing the left-border accent, **the whitespace between cards is what tells the eye each card is its own object**. The grid gap (20–22px) is wider than the inner card padding (14px), which is the visual rule: cards are separated by air, not by lines.

### 2C — Layered multi-equivalence spacing (maintainer guidance 2026-05-14)

Cards with two or more consecutive `≡` lines (mobius is the canonical example) must render the stack as **tightly layered**, not as a bullet list. Generic 4px inter-line gap is correct for slug → equivalence → notation → ADD transitions, but successive `≡` lines need a tighter rule.

**Target visual**:

```
#mobius                                   ← slug
≡ spinning ss torque                      ← equivalence 1
≡ spinning ss miraging osis               ← equivalence 2  (very tight to ≡ 1)
[5]                                       ← ADD chip
```

Successive equivalence lines should feel **layered, compressed, semantic** — not like bullet points with separate visual weight each.

**CSS implementation** (adjacent-sibling rule; zero HTML restructuring):

```css
.core-trick-equivalence + .core-trick-equivalence {
  margin-top: -2px;
}
```

The card's natural `gap: 4px` between flex children produces a 4px gap by default; the negative top-margin on a successive equivalence collapses that to ~2px. The two `≡` lines visually adjoin without merging — distinct but tightly stacked.

**No layout container needed.** This works because both equivalence lines share the same parent (`.core-trick-object` flex column) and the adjacent-sibling selector matches only consecutive `≡` rows. A trailing notation line that follows the last equivalence retains the natural 4px gap (since the notation is `.core-trick-notation`, not `.core-trick-equivalence`).

**Edge case — three or more equivalences.** The rule cascades naturally: each successive `≡` after the first stacks tightly against its predecessor. No tricks should need more than two `≡` lines in current canon (mobius is the limit), but the rule degrades gracefully if a future ruling adds a third reading.

---

## PART 3 — Border / shadow / minimalism guidance

### Drop these (all currently present)

| Element | Current | Replace with |
|---|---|---|
| `.core-trick-object` left border | 2px solid teal | nothing — let typography + whitespace do the work |
| `.glossary-thesis` background fill | `var(--bg-light)` | transparent |
| `.glossary-thesis` border-radius | `0 var(--radius-sm) var(--radius-sm) 0` | none |
| `.glossary-thesis` left border | 3px solid primary | 2px solid primary, no fill |
| `.dict-card` left border | 4px solid (varies) | 1px solid `--border` (whisper-thin) or none after the unification in PART 7 |

### Keep these

| Element | Reason |
|---|---|
| `.core-trick-add-value` outline (when added per PART 1B) | The badge IS the visual anchor for the ADD value; an outline is the smallest possible chip treatment |
| `.glossary-section-bridge` dashed top border | Functional — signals "this paragraph is a meta-note, not body content" |
| `.freestyle-component-card` left border (Basic Components) | Different surface, different intent — Basic Components are conceptual primitives, not symbolic objects. The 3px primary left border there reads as "component card", which is correct. |

### What we absolutely don't add

- Box shadows on any symbolic object
- Hover transforms (no scale, no shadow-on-hover, no translate-Y)
- Background fills on cards
- Rounded corners on symbolic objects (kills the language-token feel)
- Animation of any kind

### Forbidden vocabulary

The CSS for symbolic objects must not borrow patterns from elsewhere in the codebase that suggest different semantic intent:

- `.card-tile`, `.format-card`, `.card-grid` styles (these are content-card patterns; symbolic objects are not content cards)
- `.dashboard-*`, `.stats-strip` styles (data-product UI; symbolic objects are language tokens)
- `.btn-*` (interactive primitives; symbolic objects are read-only)

---

## PART 4 — Browse density strategy

### Goal

The user should subconsciously begin recognizing:
- repeated operators (`spinning` across many tricks)
- repeated bases (`whirl` appearing in dozens of trick names)
- compositional patterns (`spinning ss <X>` family)
- equivalence-chain compression

through visual repetition. The browse layer must reward fast scanning.

### Density levers

| Lever | Current | Proposed | Effect |
|---|---|---|---|
| Grid column count | auto-fit minmax(200, 1fr) → ~3-4 cols at 1024px | auto-fit minmax(210, 1fr) → still 3-4 cols | Slight increase from larger slug; net same density |
| Vertical card spacing | 18px gap | 20px gap | More breathing room makes pattern recognition easier |
| Card height | min-height: 110px forced | natural | Atom cards become shorter; compound cards stay tall; the visual asymmetry signals complexity at a glance |
| Slug rendering | 1.05rem mono | 1.20rem mono | The slug is what scanners track; making it larger speeds family recognition |

### 4A — Prose creep prevention

Reaffirming from Batch 3: **no educational summaries inside browse cards**. The card surface holds only the four symbolic layers (slug / equivalences / notation / ADD). Any explanatory text belongs on:
- the trick-detail page (per-trick narrative)
- the glossary (concept definitions)
- the educational-pathways page (curriculum)

The CSS for symbolic objects must not provide a slot for prose. If a future surface tries to inject a `<p class="description">` inside a `.core-trick-object`, the cascade should make it visually wrong (no defined styling → falls back to base body styling → too large and prosaic to fit the rhythm).

---

## PART 5 — Mobile rhythm strategy

### Current mobile state (`@media (max-width: 480px)`)

```css
.freestyle-basic-components-grid,
.freestyle-core-trick-grid,
.freestyle-demonstrations-grid {
  grid-template-columns: 1fr;
  gap: 14px;
}
.core-trick-object { padding: 14px 14px 12px 14px; }
.core-trick-add-value,
.core-trick-add-pending { font-size: 1.05rem; }
```

### Issues at narrow widths

1. **Long notation strings** (e.g., `CLIP > OP IN [DEX] > SAME IN [DEX]`) wrap awkwardly or push card width.
2. **ADD chip placement** isn't optimized for narrow width — on a single-column card the ADD slot still consumes a full row.
3. **Equivalence stack** for cards with two `≡` readings (mobius) gets visually crowded.

### Proposed mobile rules

```css
@media (max-width: 480px) {
  /* Existing column collapse + gap kept */

  .core-trick-object {
    padding: 10px 12px 8px 12px;     /* tighter */
  }

  .core-trick-slug {
    font-size: 1.10rem;              /* down from 1.20rem to fit narrow column */
  }

  .core-trick-notation {
    text-indent: -1em;               /* hanging indent for wrap */
    padding-inline-start: 1em;
    overflow-wrap: anywhere;          /* prevent overflow on very long tokens */
  }

  .core-trick-add-value {
    font-size: 0.74rem;
    padding: 0 6px;
  }

  .glossary-compression-flow {
    max-width: 100%;
    gap: 4px;
  }
  .glossary-compression-arrow {
    font-size: 1.1rem;
  }
}
```

### Tablet (480–768px)

No special handling — the desktop grid (`auto-fit minmax(210, 1fr)`) naturally reflows to 2 columns at this width.

---

## PART 6 — Torque/Mobius flow polish

### Current state

`.glossary-compression-flow`: centered vertical stack, `max-width: 480px`, arrows are `1.4rem var(--primary)` color, gap 6px between elements.

### Diagnoses

- Arrows are visually loud at 1.4rem + primary green. They draw the eye away from the cards themselves.
- The cards are wrapped in `.glossary-compression-card` which has `width: 100%; max-width: 360px;` — fine, but inheriting `border-left: 2px solid var(--secondary)` from `.core-trick-object` means each card in the flow has a visible left rule. That visually competes with the vertical-flow direction.

### Proposed polish

| Element | Current | Proposed |
|---|---|---|
| Arrow `↓` glyph | 1.4rem primary | **0.95rem `--text-muted`** with `letter-spacing: 0.3em` (lifts vertical air) |
| Card left border (within flow) | inherited 2px solid teal | **removed** (per PART 3 global lift) |
| Card max-width inside flow | 360px | 380px |
| Flow gap | 6px | 4px (tighter — emphasizes progression) |
| Note paragraph | 0.95rem text default | 0.92rem `--text-muted`; sits centered below |

The flow then reads as:

```
   #osis                  ← slug 1.20rem mono teal
   ⓘ ADD chip             ← small primary outline chip

        ↓                  ← muted, small, typographic

   #torque                ← same
   ≡ miraging osis        ← serif italic 0.96rem
   ⓘ ADD chip

        ↓

   #mobius                ← same
   ≡ spinning ss torque   ← serif italic
   ≡ spinning ss miraging osis
   ⓘ ADD chip
```

No box around any card. The cards are objects in vertical airspace, separated by quiet arrows. Symbolic, instructional, NOT infographic.

### 6B — Thesis box polish

Current `.glossary-thesis`:

```css
.glossary-thesis {
  font-size: 1.08rem;
  font-style: italic;
  color: var(--secondary);
  border-left: 3px solid var(--primary);
  padding: 8px 14px;
  margin: 0 0 16px 0;
  background: var(--bg-light);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
```

Proposed:

```css
.glossary-thesis {
  font-size: 1.10rem;
  font-style: italic;
  font-family: Georgia, 'Iowan Old Style', serif;   /* match equivalence-layer family */
  color: var(--secondary);
  border-left: 2px solid var(--primary);
  padding: 4px 0 4px 16px;
  margin: 0 0 18px 0;
  /* background + border-radius dropped — typography carries the emphasis */
}
```

Lighter. The thesis sentence stands out via italic serif + thin primary rule, not background fill.

---

## PART 7 — Landing / dictionary visual consistency

### Current divergence

The three surfaces render symbolic-like content with three different visual treatments:

| Surface | Class root | Slug treatment | Equivalence | Notation | ADD |
|---|---|---|---|---|---|
| Landing Core Tricks | `.core-trick-object` | mono teal 1.05rem | italic 0.93rem | mono muted 0.86rem | mono primary 1.15rem |
| Glossary compression-flow | `.core-trick-object` (inherits) | (same as landing) | (same) | (same) | (same) |
| Dictionary browse cards | `.dict-card` | sans dark 1.1rem **link** | (not used) | mono 0.98rem | sans 0.95rem |

The dictionary browse cards predate the symbolic-object pattern. They use sans-serif for the trick title (which functions as the slug), a different ADD treatment, and don't render `≡` readings.

### Proposal: a shared base class

Introduce a `.symbolic-object` base + surface modifiers:

```
.symbolic-object              ← shared base (typography, spacing, layout)
.symbolic-object--landing     ← landing Core Tricks tweaks
.symbolic-object--flow        ← glossary compression-flow tweaks
.symbolic-object--dict        ← dictionary browse tweaks
```

The base class owns:
- Card padding, gap, layout
- Slug, equivalence, notation, ADD-chip typography
- All four hierarchy levels (PART 1)

Modifiers handle:
- `--landing` — flex layout, ADD pushed to card bottom
- `--flow` — slightly wider max-width, no implicit border-bottom
- `--dict` — link on slug (`<a>` wrapper for the slug line), additional rows for aliases/family-chip (preserved from dict-card)

### Migration approach for dictionary cards

This is the bigger lift. Two implementation options:

**Option A — Refactor `.dict-card` to use the new base.** Renames classes in `tricks.hbs` to inherit from `.symbolic-object--dict`. Breaks no contract; CSS class names change but the rendered HTML structure can stay similar. Tests that assert specific dict-card classes (e.g., `.dict-card-title`, `.dict-card-add`) need updating in lockstep.

**Option B — Add `.symbolic-object` as a parallel class** alongside existing `.dict-card-*` classes, applied to the same elements. Less invasive but technical-debt-creating: two class names per element is messy and the old `.dict-card-*` styling needs to be deleted later.

**Recommendation: Option A.** Single-pass refactor, clean CSS, smallest long-term footprint. Test impact is mechanical — each `.dict-card-X` assertion becomes `.symbolic-object--dict-X` or, better, a structural assertion (e.g., the `≡` glyph renders inside each row) instead of a class-name assertion.

### Cross-surface visual proof

After the unification, the maintainer should be able to screenshot the same trick (e.g., torque) on three surfaces and the symbolic-object representation looks identical:

| Surface | Card content |
|---|---|
| Landing Core Tricks grid | (torque isn't there — landing surfaces only the 11 atoms; this is a hypothetical) |
| Glossary compression-flow | `#torque / ≡ miraging osis / [chip: 4]` |
| Dictionary browse on `/freestyle/tricks` | `#torque / ≡ miraging osis / [op-notation if authored] / [chip: 4] / [optional alias/family chip below in dict-modifier]` |

The "core" symbolic representation (slug + ≡ + notation + ADD chip) is byte-for-byte the same. Only the dictionary's extra metadata rows (aliases, family chip, media-coverage chip) appear in `--dict` modifier.

---

## PART 8 — Before / after mockups

### 8.1 — Atom card (landing Core Tricks)

**Before (current):**

```
┌── 2px teal left border, 16/18 padding ──┐
│                                          │
│ #clipper       ← mono 1.05rem bold teal  │
│                                          │
│ 1              ← MONO 1.15rem BOLD GREEN │   ← visually heaviest!
│                                          │
└──────────────────────────────────────────┘
```

**After:**

```
   #clipper                ← mono 1.20rem bold teal, no border
   [1]                     ← compact outlined primary chip 0.78rem
```

(No box drawn. The card occupies its grid cell; whitespace separates it from neighbors.)

### 8.2 — Compound card with equivalence (orbit)

**Before:**

```
┌── 2px teal left border ──┐
│ #orbit                    │
│ ≡ reverse around-the-world  ← italic 0.93rem
│ —                          ← muted italic 1.15rem
└───────────────────────────┘
```

**After:**

```
   #orbit                            ← mono 1.20rem bold teal
   ≡ reverse around-the-world        ← Georgia italic 0.96rem
   [—]                               ← chip outline muted, italic dash
```

### 8.3 — Mobius card (two-equivalence)

**Before:**

```
┌── 2px teal left border ──┐
│ #mobius                   │
│ ≡ spinning ss torque              ← italic 0.93rem each line
│ ≡ spinning ss miraging osis       
│ 5                                 ← BOLD GREEN 1.15rem
└───────────────────────────┘
```

**After:**

```
   #mobius                            ← mono 1.20rem bold teal
   ≡ spinning ss torque               ← Georgia italic 0.96rem
   ≡ spinning ss miraging osis        ←   (-2px above; tightly layered)
   [5]                                ← compact primary chip
```

The two `≡` lines hug each other visually — the eye reads them as one layered semantic stack, not two bulleted items. See PART 2C for the adjacent-sibling CSS rule.

### 8.4 — Glossary compression-flow

**Before:**

```
┌── 2px teal left border ──┐
│ #osis                     │
│ 3                          ← bold green dominates
└───────────────────────────┘
       ↓                     ← bright primary 1.4rem
┌──────────────────────────────┐
│ #torque                       │
│ ≡ miraging osis               │
│ 4                              │
└──────────────────────────────┘
       ↓
┌─────────────────────────────────┐
│ #mobius                          │
│ ≡ spinning ss torque             │
│ ≡ spinning ss miraging osis      │
│ 5                                 │
└─────────────────────────────────┘
```

**After:**

```
        #osis
        [3]

           ↓                      ← muted 0.95rem, letter-spaced

        #torque
        ≡ miraging osis
        [4]

           ↓

        #mobius
        ≡ spinning ss torque
        ≡ spinning ss miraging osis
        [5]
```

No boxes. Cards float in the column. Arrows whisper the progression. The eye traces identity → structure → weight per card; the column reads top-to-bottom as compositional growth.

### 8.5 — Dictionary browse row (post-unification)

**Before (`.dict-card`):**

```
┌── 4px tier-color left border ──┐
│ Torque              4-ADD      │  ← sans bold dark + sans-serif ADD text
│ Miraging > op out [dex] > clip │  ← mono 0.98rem
│ aliases: torque                │
│ family: torque · category: ... │
└────────────────────────────────┘
```

**After (`.symbolic-object--dict`):**

```
   #torque                                   ← mono 1.20rem bold teal
   ≡ miraging osis                           ← Georgia italic
   miraging > op out [dex] > clip            ← mono 0.85rem muted (notation)
   [4]                                       ← compact primary chip
   ─────────                                 ← thin separator
   torque  ·  rotational                     ← family/category chips below, smaller
```

Dictionary cards still render alias/family/media chips below the four symbolic layers — but the **identity** of each row is unmistakably the same as the landing and glossary cards.

### 8.6 — Mobile (≤480px) atom card

**After:**

```
#mirage             ← 1.10rem mono (down from 1.20)
[2]                 ← chip 0.74rem
```

(Full width, single column, tight 10–12px padding, no border.)

---

## PART 9 — Risks of over-minimalism

The user's spec explicitly warns against both over-minimalism AND over-design. Honest cataloging of where each risk lives in this plan:

### Over-minimalism risks

| Risk | What it would look like | Mitigation in this plan |
|---|---|---|
| **Cards bleed into each other** without left-border accent, the eye loses the "this is one object" cue | Grid cells with no visual containment merge into one big block | Generous grid `gap` (20–22px) PLUS the symbolic-object's typographic hierarchy (large slug → smaller layers → chip) creates implicit edges through whitespace and shape |
| **Hierarchy collapse** if slug + equivalence + notation + ADD all read at similar weight, the visual hierarchy fails | Cards look like 4-line poetry, not language objects | Strict family-and-size differentiation per PART 1: slug 1.20 mono teal vs equivalence 0.96 serif italic vs notation 0.85 mono muted vs ADD 0.78 chip primary — no two layers share both family and color |
| **Object identity loss** if removing the left border feels too drastic | The card becomes a content block, not a token | Conditional rescue: introduce a single 1px `--border` bottom rule on cards (whispered, almost-invisible) IF testing shows scanning rhythm degrades. Maintainer-decidable at implementation. |
| **Family recognition fails on mobile** if mobile slug drops too far and notation wraps awkwardly | Mobile cards stop reading as compositional objects | Mobile slug stays at 1.10rem (within 8% of desktop); hanging indent for notation wrap; ADD chip stays inline (not pushed to its own line) |

### Over-design risks

| Risk | What it would look like | Mitigation |
|---|---|---|
| **Too many type families** if serif italic creep extends beyond `≡` readings | Cards become typographic showcases | Hard cap at 2 families per object (ui-monospace + serif italic); no third family. Sans-serif body type stays OUT of the symbolic object. |
| **Animation creep** if hover transforms, micro-interactions sneak in | Cards feel like product UI | This plan explicitly forbids animation, hover-scale, shadow-on-hover, translate-Y. Negative test guard: a CSS lint rule (or manual review) catches `transition` declarations on `.symbolic-object*`. |
| **ADD-as-badge becomes oversized chip with shadow/gradient** if it tries to be a "nice button" | Gamification creep | Specified treatment: 1px solid outline, transparent fill, 1px padding-block, 7px padding-inline, no border-radius beyond 3px. Anything more decorative is over-design. |
| **Browse cards grow extra metadata** as the dictionary surfaces more fields (review status, media chip, alias chip, etc.) | The "compact" promise breaks under feature pressure | The `--dict` modifier is the only surface allowed to add metadata rows; landing and flow stay pure (4 layers max). Any new dict metadata uses the existing chip/badge primitives, not new typography. |

### Tie-breaker rule when minimalism vs design tension shows up

When in doubt during implementation: **typography over containers**. Make a layer's role clearer through font choice, size, color, weight, or spacing — never by adding a box, a shadow, an animation, or a border.

---

## PART 10 — Implementation notes (when approved)

Suggested batching (smallest first):

- **C-4-A**: ADD-as-chip refactor. Smallest mechanical CSS change with high visual payoff. Updates `.core-trick-add-value` and `.core-trick-add-pending`. Test impact: assertions on `core-trick-add-pending` stay; one mobile test confirms chip stays inline.
- **C-4-B**: Slug hierarchy fix. Bump `.core-trick-slug` size and weight to surpass ADD. Single CSS change.
- **C-4-C**: Equivalence layer serif-italic. Add the serif-italic family to `.core-trick-equivalence` + `.glossary-thesis`. Tests: existing assertions check for italic class/glyph presence — no change.
- **C-4-D**: Card containment lift. Drop `.core-trick-object` left border + `min-height`; trim padding. Most visible change; recommend mobile + desktop screenshot review.
- **C-4-E**: Glossary flow arrow + thesis polish. Lighter arrows, thesis box demoted to italic + thin rule.
- **C-4-F**: Mobile rhythm rules. Hanging-indent notation; chip-stays-inline; tightened padding.
- **C-4-G**: Dictionary unification (largest change). Refactor `.dict-card-*` to `.symbolic-object--dict` derivatives. Mechanical class rename in template + lockstep test updates.
- **C-4-H**: Tests + doc-sync VIEW_CATALOG (note the shared `.symbolic-object` base class on landing + glossary + dictionary entries) + stage.

Each unit ships in a single PR-equivalent diff; rejection-per-unit allowed.

### Verification approach

- `npm run build` clean
- `npm test` — all existing tests pass; visual contract is preserved (class-name-based assertions migrate cleanly)
- Manual screenshot review on three viewports (320px, 768px, 1280px) for landing + glossary + dictionary surfaces
- Cross-surface visual check: torque/mobius/orbit cards render identically on the three surfaces (when present)
- Re-bloat guard from Batch 3 still passes (rendered body <120 KB)

---

## Cross-references

- `FREESTYLE_IA_REALIGNMENT_PLAN.md` PART H-pre — compact symbolic-object rendering rule (this plan refines its typographic implementation)
- `GLOSSARY_PEDAGOGY_REALIGNMENT_PLAN.md` PART 2 + PART 9.2 — torque/mobius flow (PART 6 of this plan refines its visual polish)
- Batch 2 CSS at `style.css:5253–5316` — `.core-trick-object` family being refined
- Batch 3 CSS at `style.css:5368–5478` — compression-flow + thesis + execution-mechanics styles
- Existing dictionary CSS at `style.css:4877–4990` — `.dict-card-*` family being unified
- [[feedback_modifier_public_visibility]] — Modifier Reference dl is render-disabled; Batch 4 does not touch visibility logic
- [[feedback_phased_scope_control]] — tabular reports, approval-by-artifact-path; this plan structured accordingly

---

## Maintainer decisions (resolved 2026-05-14)

Both open questions resolved by the maintainer prior to implementation:

1. **Subtle bottom-border on cards: NO.** Whitespace + typography + rhythm carry object identity. If scanning degrades after deploy, the fix is more spacing, not separators. The bottom-border path risks sliding toward feed-card / dashboard UI vocabulary. Confirmed.

2. **Dictionary unification: FULL refactor in Batch 4.** The three surfaces (landing Core Tricks, glossary compression-flow, dictionary browse) must converge on the same `.symbolic-object` base. The symbolic object becomes a recognizable universal language token across all freestyle surfaces — not three similar-but-different UI systems. Confirmed.

Additional maintainer guidance (2026-05-14):

- **Equivalence > notation weight relationship** — equivalence is semantic identity (compositionally what the trick IS); notation is implementation detail (how it executes). The visual hierarchy must reinforce this. Encoded in PART 1 + new PART 1A-bis (notation drops to 0.82rem at the new `--text-subtle` ~#8a8a8a token; equivalence stays at 0.96rem `--text` serif italic). Differential = 17% size + distinctly dimmer color + different type family.
- **Layered multi-equivalence spacing** — successive `≡` lines render tightly stacked (mobius pattern), feeling layered/compressed/semantic, not bullet-list-like. Encoded in PART 2C (adjacent-sibling rule: `.core-trick-equivalence + .core-trick-equivalence { margin-top: -2px; }`). No HTML restructuring.

Implementation may proceed C-4-A → C-4-H per the order in PART 10.
