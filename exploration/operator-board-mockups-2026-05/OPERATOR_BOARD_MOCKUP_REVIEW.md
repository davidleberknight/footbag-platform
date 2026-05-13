# Operator Board — Mockup Comparison Review

**Date:** 2026-05-13
**Slice:** Phase 2 design exploration (operator/set mini-board)
**Status:** Exploration only — no service-layer or template work
**Companion files:** `mockup_a_museum_placard.html`, `mockup_b_technical_notation.html`, `mockup_c_movement_language_primer.html`

---

## §A. Locked-in design constraints (per curator direction)

1. **Text-first symbolic notation.** The notation IS the iconography. No invented icon language.
2. **PassBack/glossary-aligned abbreviations as the primary visual language** — PIX, AT, Q, BL, FAIRY, STEP, SPIN, GY, DUCK, PDX, SYMP, XDEX, SAME, OP.
3. **No decorative SVGs in v1.** Optional reinforcement-only glyphs later (rotation tick near SPIN, etc.), never replacement.
4. **14 operators across 3 tiers.** Sets (6) + Body (5) + Structural (3). Not 6. Not the full glossary.
5. **Per-operator unit:** short definition + 1 example trick + symbolic composition example (`A + B → TRICK`).
6. **Reusable partial.** Not landing-page-only. Targets: landing, glossary §3, /freestyle/learn, future notation primer, future onboarding.
7. **Editorial signal target:** "these are the primitive movement operators of freestyle" — not "here are some categories."

## §B. Locked operator inventory (Tier-1)

Captions below are **sketch-level** — curator review required before canonical lock. The visual treatment is what's under review here, not the prose accuracy of each cell.

### Set operators (6) — what sends the bag into the air

| Glyph | Name | One-line action | Composition example |
|---|---|---|---|
| `PIX` | Pixie | Compressed uptime set, leg compresses through the set | `PIX + BUTTERFLY → DIMWALK` |
| `AT` | Atomic | Set wrapped with full-body rotation in the air | `AT + OSIS → FLUX` |
| `Q` | Quantum | Set with an added rotation through uptime | `Q + MIRAGE → TOE BLUR` |
| `BL` | Blender | Set with low-orbit pre-set sweep *[curator confirm]* | `BL + BUTTERFLY → BLENDER BUTTERFLY` |
| `FAIRY` | Fairy | Set carrying an extra revolution through uptime *[curator confirm]* | `FAIRY + BLUR → DOUBLE FAIRY` |
| `STEP` | Stepping | Foot relocates between set and catch | `STEP + BUTTERFLY → RIPWALK` |

### Body operators (5) — what the body does while the bag is up

| Glyph | Name | One-line action | Composition example |
|---|---|---|---|
| `SPIN` | Spinning | Full-body rotation around the vertical axis | `SPIN + TORQUE → MOBIUS` |
| `GY` | Gyro | Body rotation variant (partial / inverted plane) | `GY + BUTTERFLY → GYRO BUTTERFLY` |
| `DUCK` | Ducking | Drop the body under the bag mid-dex | `PIX + DUCK + BUTTERFLY → PHOENIX` |
| `PDX` | Paradox | Hip pivot inserted between two dexes | `PDX + LEG-OVER → PARADOX LEG-OVER` |
| `SYMP` | Symposium | Illusion combined with body rotation *[curator confirm]* | `SYMP + ILLUSION → FLAIL` |

### Structural concepts (3) — relationships across the trick

| Glyph | Name | One-line action | Composition example |
|---|---|---|---|
| `XDEX` | Cross-dex | Leg circles the bag on the opposite side of the body | `XDEX + INSIDE → CLIPPER` *[curator confirm]* |
| `SAME` | Same-foot | Set foot and catch foot are the same | `SAME + BUTTERFLY → SAME-FOOT BUTTERFLY` |
| `OP` | Opposite | Set foot and catch foot are different (default convention) | `OP + BUTTERFLY → BUTTERFLY` |

---

## §C. Mockup A — Museum Placard

**Editorial signal:** "these operators are artifacts of a living tradition."

**Visual signature:**
- Serif body type, sans display
- Large left-column glyph (140px gutter), prose caption right
- Generous vertical rhythm (~2rem between placards)
- Italic "wall text" intro per tier
- Burnt-amber accent color (`#b87333`)
- Single-column flow; reads like a gallery walk

**ASCII silhouette:**

```
THE OPERATORS OF FREESTYLE
                                                 [page title — serif display]
A small set of body actions, combined according
to a small set of rules, produces the entire
vocabulary of named freestyle tricks…
                                                 [italic wall text intro]
─────────────────────────────────────────────
  SET OPERATORS                                  [tier dek — small caps italic]
─────────────────────────────────────────────

  PIX        Pixie
             A compressed uptime set in which
             the supporting leg drives the bag
             upward through a tight orbit.
             PIX + BUTTERFLY → DIMWALK
                                                 [generous whitespace below]
  AT         Atomic
             A set wrapped with full-body
             rotation while the bag is in the air.
             AT + OSIS → FLUX
                                                 [continues; airy, calm pace]
```

**Strengths:**
- Communicates "this is a curated reference," not a control panel
- Most editorial — invites slow reading
- Strongest at conveying "movement *language*" feel
- Captions can carry more prose without crowding

**Weaknesses:**
- Information density too low for /freestyle/learn or glossary §3 reuse contexts
- Vertical real-estate cost on landing page is high (~3000px for 14 operators)
- Risks feeling "precious" — museum aesthetic can read as detached
- Hard to scan all 14 operators at once

**Best fit for:** standalone primer page (e.g. a future /freestyle/operators page or notation primer). Less ideal as a landing-page strip.

---

## §D. Mockup B — Technical Notation Board

**Editorial signal:** "these operators form a formal system."

**Visual signature:**
- Compact data table: Glyph / Name / Action / Composition
- Tier as a left-rail column or section divider
- Monospace for glyphs and compositions
- Sans-serif everywhere else, ~14px base
- Cool-blue accent (`#0066cc`)
- High density (~700px for all 14)

**ASCII silhouette:**

```
FREESTYLE OPERATORS — REFERENCE                 [terse heading]

╔═════════╤═══════════╤══════════════════════════════╤═════════════════════════╗
║ GLYPH   │ NAME      │ ACTION                       │ EXAMPLE                 ║
╠═════════╪═══════════╪══════════════════════════════╪═════════════════════════╣
║ SET                                                                          ║
║ PIX     │ Pixie     │ Compressed uptime set        │ PIX + BUTTERFLY → DIMWALK
║ AT      │ Atomic    │ Set + full-body rotation     │ AT + OSIS → FLUX
║ Q       │ Quantum   │ Set + added rotation         │ Q + MIRAGE → TOE BLUR
║ BL      │ Blender   │ Set + pre-set sweep          │ BL + BUTTERFLY → …
║ FAIRY   │ Fairy     │ Set + extra revolution       │ FAIRY + BLUR → DOUBLE FAIRY
║ STEP    │ Stepping  │ Foot relocates set→catch     │ STEP + BUTTERFLY → RIPWALK
╠═════════╪═══════════╪══════════════════════════════╪═════════════════════════╣
║ BODY                                                                         ║
║ SPIN    │ Spinning  │ Full-body rotation           │ SPIN + TORQUE → MOBIUS
║ GY      │ Gyro      │ Body rotation variant        │ GY + BUTTERFLY → GYRO BUTTERFLY
║ …                                                                            ║
╚═════════╧═══════════╧══════════════════════════════╧═════════════════════════╝
```

**Strengths:**
- Highest information density — all 14 operators visible without scrolling
- Strongest reference-card utility
- Cleanest reuse: drops into any context without dominating the page
- Encourages the reader to read across rows (find patterns)

**Weaknesses:**
- Editorial tone is "API documentation," not "movement language"
- Loses the symbolic-richness signal — operators look like SQL keywords
- "These are body actions" reads as flat data
- Risk: too cold for landing page; great for /freestyle/moves but redundant there

**Best fit for:** glossary §3 reference card or a /freestyle/moves quick-ref panel. Probably wrong tonally for landing.

---

## §E. Mockup C — Movement-Language Primer

**Editorial signal:** "these are primitives of a language you can learn."

**Visual signature:**
- 3-column responsive grid of operator cards (collapses to 2 then 1)
- Each card: large glyph header, italic name dek, action line, example block
- Left-border accent stripe (color encodes tier: amber / blue / slate)
- Tier headings as section dividers with one-sentence connective prose
- Sans body, monospace for glyphs + compositions only
- Symbol-forward but with breathing room between cards
- Medium density (~1400px for all 14)

**ASCII silhouette:**

```
THE OPERATORS OF FREESTYLE
Freestyle footbag is a compositional movement language. These fourteen
operators are its primitives — combine them and you get every named
trick in the dictionary.

SET OPERATORS
What sends the bag into the air.

┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│ ┃ PIX               │  │ ┃ AT                │  │ ┃ Q                 │
│ ┃ Pixie             │  │ ┃ Atomic            │  │ ┃ Quantum           │
│ ┃                   │  │ ┃                   │  │ ┃                   │
│ ┃ Compressed uptime │  │ ┃ Set with full-    │  │ ┃ Set with added    │
│ ┃ set.              │  │ ┃ body rotation.    │  │ ┃ rotation thru     │
│ ┃                   │  │ ┃                   │  │ ┃ uptime.           │
│ ┃ ┌───────────────┐ │  │ ┃ ┌───────────────┐ │  │ ┃ ┌───────────────┐ │
│ ┃ │PIX + BUTTERFLY│ │  │ ┃ │AT + OSIS      │ │  │ ┃ │Q + MIRAGE     │ │
│ ┃ │→ DIMWALK      │ │  │ ┃ │→ FLUX         │ │  │ ┃ │→ TOE BLUR     │ │
│ ┃ └───────────────┘ │  │ ┃ └───────────────┘ │  │ ┃ └───────────────┘ │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
   (amber rail)             (amber rail)             (amber rail)

[…BL, FAIRY, STEP follow in the same grid…]

BODY OPERATORS
What the body does while the bag is up.
   (cards continue with blue rail…)

STRUCTURAL CONCEPTS
Relationships across the trick.
   (cards continue with slate rail…)
```

**Strengths:**
- Best balance of density and pedagogical legibility
- Grid pattern is visually rhythmic — operators feel like a family, not a list
- Symbol-forward (each card opens with the glyph at 1.4rem)
- Reads in any direction: scan glyphs vertically, learn compositions horizontally
- Tier color-coding teaches the structure without prose
- Card unit is reusable as a partial across all 5 target contexts
- Medium density works on landing AND glossary AND /freestyle/learn
- Composition example in its own bordered block makes the "→" feel like a result, not a phrase

**Weaknesses:**
- More visual chrome than A or B
- Tier rail colors are a design commitment that must be tasteful across all contexts
- 3-column grid needs careful breakpoints (cards must not pop out of order on collapse)
- Slightly verbose vertically — full board uses more page than B

**Best fit for:** the partial. Lands as the operator-board pattern across landing, glossary §3, /freestyle/learn.

---

## §F. Comparison across the six editorial axes

| Axis | A — Museum Placard | B — Notation Board | C — Movement-Language Primer |
|---|---|---|---|
| **Dense vs airy** | Airy | Dense | Medium |
| **Museum vs technical** | Museum | Technical | Halfway |
| **Cards vs table** | Single-col placards | Table | Grid of cards |
| **Symbolic-first vs prose-first** | Prose-leaning | Symbol-flat | Symbol-forward |
| **Editorial tone** | Curated tradition | API reference | Language primer |
| **Visual hierarchy** | Glyph + caption | Row scan | Card-internal hierarchy |
| **Reuse fitness (landing)** | Weak (too tall) | Medium (too cold) | Strong |
| **Reuse fitness (glossary §3)** | Weak (too airy) | Strong | Strong |
| **Reuse fitness (/learn)** | Medium | Medium | Strong |
| **Reuse fitness (future primer page)** | Strong | Weak | Strong |
| **"This is a language" signal** | Strong | Weak | Strong |
| **"This is reference data" signal** | Weak | Strong | Medium |

---

## §G. Recommendation

**Build Mockup C — the Movement-Language Primer — as the canonical operator board partial.**

It is the only direction that satisfies all five reuse contexts (landing, glossary §3, /freestyle/learn, future notation primer, future onboarding) without forcing a context-specific variant. The card-grid pattern carries the symbolic-richness signal of A while keeping the information density needed to live on the landing page (where vertical real-estate is constrained by the cards and competition-format sections above and below).

The curator prediction — "halfway between museum placard and notation primer, restrained, editorial, symbol-forward, low-noise, educational" — describes C precisely.

**Editorial controls to dial in during implementation:**

- **Tier rail color palette.** Current draft uses amber (set) / blue (body) / slate (structural). Alternative: monochrome with weight variation. Decide before building.
- **Connective prose length.** Each tier currently gets one sentence ("What sends the bag into the air"). Could expand to two for landing-page version and shorten to zero for glossary §3 variant.
- **Composition-example styling.** Current draft uses a bordered inner block. Alternative: a single line with a soft background tint, or inline with the action prose. The bordered block reads as "here is the result" most clearly; recommend keeping.
- **Card hover/focus treatment.** Cards could link to glossary entries on click. Decide later — v1 can ship without links.

---

## §H. Open questions for curator before implementation

1. **Operator captions — accuracy pass.** Three cells in §B carry *[curator confirm]* flags (BL, FAIRY, SYMP semantics; XDEX→CLIPPER as canonical example). The mockup work proceeds with sketch captions; before service-layer build, the curator pass locks each operator's one-line definition and example.
2. **`OP` operator — keep or drop?** "Opposite-foot" reads as the default convention rather than a distinctive operator. Reasonable arguments either way: dropping leaves a 13-operator tidy board; keeping makes the structural-concepts tier feel less sparse. Curator call.
3. **Tier rail colors.** Amber/blue/slate is a sketch palette. The platform's existing CSS variables (`--accent-color`, `--brand-color`, etc.) may dictate a different choice. Worth a quick CSS-token audit before committing.
4. **Glossary-link policy.** Each operator card *could* link to a glossary entry (PIX → /freestyle/glossary#pixie). Defer to a Phase 2.1 slice? Or ship with links from v1? My lean: ship without links in v1, add in a small follow-up — it lets us measure whether the board is sufficient on its own, and it keeps v1 scope tight.
5. **Partial location.** Recommend `src/views/partials/freestyle/operator-board.hbs` (new subdirectory under `partials/`) with companion `operator-board.css` import; data shape sourced from a new `getOperatorBoard()` helper on `freestyleService` (or a standalone `operatorService.ts` if it grows). Curator preference?

---

## §I. If approved — implementation slice plan

Naming: **OP-BOARD-1** (Operator Board v1).

1. **OP-BOARD-1A** — Confirm the 14-operator caption table. Curator review pass over §B; locks the one-line definitions and example tricks.
2. **OP-BOARD-1B** — Build the data shape: `OperatorBoardEntry { glyph, name, tier, action, exampleA, exampleOp, exampleResult }`. Source initially as inline TypeScript constant in `freestyleService.ts` (or a CSV under `inputs/curated/freestyle/operator_board.csv` if the curator prefers CSV-owned). Read-only on canonical data; observational-symbolic-grammar layer separation preserved.
3. **OP-BOARD-1C** — Build the partial `partials/freestyle/operator-board.hbs` + CSS. Render the 3-tier card grid. Static markup; no interactivity.
4. **OP-BOARD-1D** — Wire into landing.hbs above "The Freestyle Reference" section. The board grounds the next section by introducing the vocabulary it cites.
5. **OP-BOARD-1E** — Wire into glossary §3 (`/freestyle/glossary`) and /freestyle/learn. Same partial, possibly with a `compact=true` flag for tighter spacing in glossary.
6. **OP-BOARD-1F** — Tests: integration test rendering each context, asserts all 14 glyphs present, tier headings rendered in order, no missing data fields. Adversarial: empty operator list → empty board (no crash), single-operator → renders, glyph with HTML-escapable chars → escaped.
7. **OP-BOARD-1G** — Optional follow-up: glossary linking (each card → glossary entry).

Estimated scope: ~6 small commits, ~1 working session.

---

## §J. Decision

Awaiting curator selection: A, B, C, or hybrid direction. My recommendation stands at C. If hybrid, name the elements of A or B to fold in and I'll produce a revised sketch before any implementation work.
