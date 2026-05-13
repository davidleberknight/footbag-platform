# NOTATION_SURFACE_AUDIT

**Project:** DICTIONARY-SYMBOLIC-CARD-1 — Task A
**Scope:** Read-only audit of every place a freestyle trick's notation appears in the public UI, plus the service layer that builds the notation view-models.
**Date:** 2026-05-13
**Out of scope:** Mutating canonical data, redesigning surfaces, proposing fixes. This is a faithful map of the present state so Tasks B–H can be designed against it.

---

## 1. Where notation appears (surface-by-surface)

The site has roughly four notation contexts: trick-detail, browse-modes, glossary references, and educational/symbolic surfaces. Coverage is uneven across all four.

### 1.1 Trick-detail page (the strongest notation surface)

| Partial | File | Notation type | Rendering | Data source |
|---|---|---|---|---|
| `trick-notation.hbs` | `src/views/partials/` | **Semantic only** | Role-coloured token spans (cool palette: greens / cyans); fenced code block | `notationDisplay` view-model |
| `trick-operational.hbs` | `src/views/partials/` | **Operational only** | Role-coloured token spans (warm palette: amber / orange / teal); fenced code block; optional `sourceNote` provenance line | `operationalNotation` view-model |
| `trick-modifier-layering.hbs` | `src/views/partials/` | Neither — nested-box visualization of modifier stacking | DOM-only diagram | `modifierLayering` shape |
| `trick-structural.hbs` | `src/views/partials/` | Parser diagnostic — descriptive roles, ADD-contributing roles, editorial decomposition, formula, policy tokens | Plain tables | Parser output via `structural_parse_json` |

Order within `trick-shell.hbs` (top → bottom):

1. `trick-hero` (short description)
2. `trick-about` (description + ADD composition + aliases + family note)
3. **`trick-notation`** ← semantic notation (coloured tokens)
4. **`trick-operational`** ← operational notation (coloured tokens)
5. `trick-modifier-layering` (when ≥3 modifier links)
6. Execution / Learning / Prerequisites prose
7. Family ladder, related, parallels, substitutions, media
8. Pathways, prev/next, records, progression
9. `trick-structural` (collapsed; parser-layer diagnostic)

Both notation partials link out to `/freestyle/glossary#notation` (semantic) and `/freestyle/glossary#operational-notation` (operational). Notation surfaces here are **service-shaped**, role-aware, and fully token-coloured.

### 1.2 Browse modes (`/freestyle/tricks` — the weakest notation surface)

| View | Notation type | Rendering | Service-shaped? | Notes |
|---|---|---|---|---|
| **By ADD** (default) | Semantic | `<pre><code>` raw-string block | **No** — `notation` column rendered directly | Falls back to "Notation pending" when null |
| **By Family** | none | — | — | Card shows only name + ADD + family link |
| **By Category** | Semantic | Table cell `<code>` | **No** | Legacy spreadsheet row: Trick \| ADD \| Description \| Notation \| Aliases |
| **By Sets** | none | — | — | Card shows name + ADD + family chip + media chip |

**Implication:** Notation on browse cards is plain text. Token roles are not visible. Three of the four browse views either omit notation or show it as a spreadsheet-style raw string. There is no shared "trick card" component across views — each view authors its own row/card shape.

### 1.3 Glossary references

| Section | File | Notation type | Rendering |
|---|---|---|---|
| **§8 — Jobs Notation** | `glossary.hbs` lines 223–276 | Semantic | **Three inline examples with role-coloured tokens** (whirl / paradox-whirl / gauntlet); pre-shaped in service via three `shapeNotationDisplay` calls |
| **§9 — Operational Notation** | `glossary.hbs` lines 279–371 | Operational | **Prose reference only** — no inline coloured examples. Token definitions in `<dl>` form: `[DEX]`, `[DEL]`, `[BOD]`, `[XBD]`, `[PDX]`, `[XDEX]`; sides; directions; sequence operators; pre-state flags |
| **§13 — Connective panels** | `glossary.hbs` lines 426–472 | none | Panels carry trick lists + symbolic groups + notation hints as prose; no rendered token spans |

§8 is the strongest "this is how to read a notation" surface; §9 is comparatively dry by contrast — it documents the operational vocabulary but never shows it laid out as a trick.

### 1.4 Educational / symbolic surfaces (no notation)

| Surface | Notation rendered? | What's rendered instead |
|---|---|---|
| `/freestyle/learn` | none | Index list of titles + blurbs + shipped/planned chips |
| `/freestyle/progression/walking-family` | none | Step cards: canonical name + ADD + modifier-added label + rationale prose + glossary cross-links |
| `/freestyle/modifier/{spinning\|paradox\|ducking}` | none | Six teaching sections; progression + cross-base examples carry canonical names only |

These surfaces talk *about* the symbolic structure but never *display* the operational notation that encodes it.

### 1.5 Set-notation reference (`/freestyle/moves`)

Operational set notation appears here as primitive vocabulary (Pixie, Fairy, Atomic, Quantum, etc.). Rendering is plain `<code>` in table cells / span tags. `notation` field is raw-string and frequently null for variant tags. No role colouring.

---

## 2. Semantic vs operational — where each layer lives today

The codebase already maintains a clean two-layer architecture in the service code:

| Layer | Builder | Output shape | Detail-page partial | Glossary section |
|---|---|---|---|---|
| **Semantic** ("Stepping Butterfly") | `notationRendering.ts` → `shapeNotationDisplay()` | `NotationDisplay { raw, tokens[] }` with 12-precedence-level role classification | `trick-notation.hbs` | §8 (with inline examples) |
| **Operational** ("[clip] > op in dex > butterfly wing > ss clipper") | `operationalNotationRendering.ts` → `shapeOperationalNotationDisplay()` | `OperationalNotation { raw, tokens[], sourceNote? }` with 9 role types and multi-word-token fusion | `trick-operational.hbs` | §9 (reference only, no inline examples) |

**Key invariant (already enforced in code):** the two builders are independent modules. Semantic tokenizes by whitespace; operational tokenizes character-by-character to handle embedded spaces in pre-state flags like `(no plant while)` and multi-word fusions like `FRONT WHIRL`. Token roles are completely disjoint between the two layers.

CSS palettes are also disjoint by intent:
- **Semantic** uses cool palette: `notation-core-family`, `notation-set`, `notation-rotation`, `notation-modifier`, `notation-delay-surface`, etc.
- **Operational** uses warm palette: `op-token-surface`, `op-token-side`, `op-token-direction`, `op-token-body-action`, `op-token-rotation-variant`, `op-token-component-flag-{slug}`, etc.

Detail-page sequencing renders **semantic first, operational second**, with both labelled by section header. That's the current convention.

---

## 3. Inconsistencies — by category

### 3.1 Notation-rendering style is non-uniform

Three rendering styles for the *same* notation language across the site:

| Style | Where |
|---|---|
| **Role-coloured token spans (service-shaped)** | trick-notation.hbs, trick-operational.hbs, glossary §8 inline examples |
| **Plain `<code>` / `<pre>` raw-string block (raw column)** | browse-mode "By ADD", browse-mode "By Category" cell, moves.hbs set-notation tables |
| **Prose only (no rendered tokens)** | glossary §9, all symbolic surfaces |

A learner who lands on a browse card first, then opens the trick detail, sees the same notation rendered in two visually different ways. There is no shared component for "render this notation as a coloured token row."

### 3.2 Browse cards are not cards

The "By ADD" and "By Category" views are spreadsheet-style. By Category in particular renders a four-column table (Trick / ADD / Description / Notation / Aliases) — a flat data grid, not a teachable card. "By Family" and "By Sets" don't carry notation at all; their cards omit the notation field entirely.

There is no shared `<TrickCard>` partial. Each view inlines its own markup.

### 3.3 Operational notation is missing from browse views

Operational notation appears on the trick-detail page (when populated) and as a reference dictionary in glossary §9. It does **not** appear in any browse view. A user cannot scan operational notation across tricks without clicking into each detail page.

### 3.4 Operational notation coverage is sparse

`operational_notation` column is populated only for tricks covered in the O1b / O1d phases. Unknown how many rows have non-null `operational_notation`; `operational_notation_source` (curator-authored provenance) is sparser still. Browse-mode notation cannot rely on operational notation being present.

### 3.5 Aliases render four different ways

| Surface | Alias rendering |
|---|---|
| Trick-detail | `trick-about.hbs` "Also known as" `<dl>` list |
| Browse By ADD | `trick-aliases` div, comma-separated plain list |
| Browse By Category | Table cell, comma-separated plain list |
| Browse By Family / By Sets | Aliases not rendered |

The North-star card format specifies `aliases:` as the third line of every card, common aliases only. Currently there is no consistent canonical pattern; the alias list is not even visible in two of four browse views.

### 3.6 §9 operational notation lacks inline examples

§8 (semantic) shows three worked notation examples with coloured tokens. §9 (operational) documents the token vocabulary but never lays out a complete operational notation string with coloured tokens to demonstrate the language. The educational asymmetry is visible.

### 3.7 Symbolic surfaces don't surface notation

Walking-progression, modifier-family, and learn pages all rely on canonical-name prose. The symbolic-grammar layer is rich on those pages — topology, archetypes, mechanical lead, cross-base examples — but the operational *language* itself never appears. A learner sees the topology described in English but never sees what the topology looks like as a notation string.

---

## 4. Prose-heavy areas (where prose is doing notation's job)

- **Trick-detail "About" section** — `trick-about.hbs` carries a prose description of the trick before notation appears. The notation could be the lead; instead the lead is prose.
- **Modifier-family pages** — Six teaching sections, all prose. Progression and cross-base example cards carry canonical-name + ADD only. The same compound rendered with operational notation would make the modifier composition visually obvious.
- **Walking-progression steps** — Per-step rationale + symbolic note + glossary cross-links, all prose. Step notation would let a learner read the structural delta between steps (e.g., +stepping moves "butterfly" → "stepping op butterfly") without parsing English.
- **Glossary §9** — Token vocabulary in `<dl>` form, no rendered example. Prose carries the entire pedagogical weight.

---

## 5. Spreadsheet / table remnants

- **`/freestyle/tricks` "By Category" view** — Full data-grid: Trick / ADD / Description / Notation / Aliases columns. Reads as a worksheet, not a dictionary.
- **`/freestyle/moves`** — Basic Sets section is a four-column table (Token / Surface / Tone / Notes). Variant-tag and component-tag sections are tag lists. None are card-form.
- **Browse By ADD / By Family / By Sets** — These render as cards visually but the *content* on the cards is heterogeneous: By ADD shows notation; By Family hides it; By Sets shows family + media chips instead. The cards are inconsistent in what they reveal.

---

## 6. Notation formatting inconsistencies

- **Semantic notation casing:** The display tokens in the service shape preserve source casing. Tokens in §8 examples render lowercase ("whirl", "paradox whirl"). Browse cards render whatever is in the `notation` column directly — casing varies row-by-row.
- **Operational notation bracketing:** `[DEX]`, `[DEL]`, `[BOD]`, `[XBD]` flags appear consistently bracketed and uppercased in §9 reference, but the *bracket character* is part of the rendered token text, not a CSS affordance. A row missing brackets would render flush-text without visual distinction.
- **Sequence operators:** `>` and `>>` are token roles. They render as plain characters; no special typographic treatment. North-star cards likely want them visually weighted or muted depending on density.
- **Spacing around sequence operators:** Operational notation in the service tokenizes spaces as part of token boundaries. The rendered output preserves single-space separators between tokens. Wrapping behavior is not currently controlled at the CSS layer — long operational strings will wrap mid-token on narrow viewports.
- **Multi-word tokens (e.g., `FRONT WHIRL`):** These fuse into a single token in `operationalNotationRendering.ts` but the rendered text contains a space. Wrapping CSS must respect the fusion (e.g., `white-space: nowrap` on `op-token-rotation-variant` spans).

---

## 7. Missing notation (gaps)

| Where | What's missing |
|---|---|
| Browse By Family | Notation field entirely absent from the card |
| Browse By Sets | Notation field entirely absent from the card |
| `/freestyle/learn` | No notation — index page only lists surfaces |
| `/freestyle/progression/walking-family` | No notation in step cards |
| `/freestyle/modifier/{spinning\|paradox\|ducking}` | No notation in progression or cross-base example items |
| Glossary §9 | No worked inline examples (cf. §8 has three) |
| `/freestyle/moves` set-notation tables | No role colouring on the operational set-notation tokens |
| **Operational notation column** | Unknown population — many trick rows likely have `operational_notation = NULL` |

---

## 8. Alias inconsistencies

- **Detail page** shows "Also known as: X, Y, Z" in `<dl>` form via `trick-about.hbs`.
- **Browse By ADD** shows comma-separated aliases in a `trick-aliases` div under the card.
- **Browse By Category** shows aliases in a table cell.
- **Browse By Family / By Sets** don't show aliases.
- **§13 connective panels** show *trick lists*, not aliases.

There is no canonical "common aliases only" filter; the alias list is whatever the alias service returns. The North-star card spec requires "common aliases only" — that's a service-layer decision the audit can flag but cannot specify here.

---

## 9. Cross-cutting observations

- **The architecture is ready, but the surfaces aren't.** The service layer (`notationRendering.ts`, `operationalNotationRendering.ts`) already produces token arrays with role classification + tooltips. The detail page consumes them. Browse modes do not.
- **A shared `<TrickCard>` partial does not exist.** Each browse view inlines its own markup; the trick-card concept lives across `tricks.hbs` views inconsistently. The North-star "same card everywhere" goal will require introducing one.
- **Semantic and operational are already cleanly separated** at the service/CSS layer. The audit confirms the two-layer architecture is intact; nothing in Task C requires breaking it.
- **§9 is the most opportunity-rich glossary surface.** Adding three worked inline operational examples (mirroring §8) would close the largest pedagogical asymmetry on the glossary.

---

## 10. Summary table — current notation coverage

| Surface | Semantic | Operational | Role-coloured? | Service-shaped? | Card-form? |
|---|---|---|---|---|---|
| Trick detail — notation partial | ✓ | — | ✓ | ✓ | n/a (full page) |
| Trick detail — operational partial | — | ✓ | ✓ | ✓ | n/a (full page) |
| Browse By ADD | ✓ (raw) | — | ✗ | ✗ | card-ish |
| Browse By Family | — | — | — | — | card-ish |
| Browse By Category | ✓ (raw) | — | ✗ | ✗ | spreadsheet row |
| Browse By Sets | — | — | — | — | card-ish |
| Glossary §8 (Jobs) | ✓ | — | ✓ | ✓ | n/a |
| Glossary §9 (operational) | — | reference-only | ✗ | ✗ | n/a |
| Glossary §13 connective panels | — | — | — | — | panel |
| Moves — set-notation reference | — | ✓ (raw) | ✗ | ✗ | table |
| Walking progression | — | — | — | — | step-card |
| Modifier-family pages | — | — | — | — | step-card / list |
| Learn index | — | — | — | — | index card |

---

## 11. Implications for Tasks B–H

This audit informs the design tasks:

- **Task B (canonical card):** No shared `<TrickCard>` partial exists. Designing the card spec is the prerequisite for unifying browse modes.
- **Task C (semantic vs operational strategy):** The two layers are already cleanly separated; Task C is documenting + reinforcing that, not creating it.
- **Task D (operational style guide):** The current operational notation already follows conventions (uppercased component flags in brackets; space-separated tokens; `>` / `>>` sequence operators), but the conventions are implicit in `operationalNotationRendering.ts` rather than written down. The style guide formalizes what the tokenizer already accepts.
- **Task E (component view redesign):** "By Sets" already exists but renders no notation and isn't grouped by modifier. The redesign repurposes the route + adds notation rendering via the shared card.
- **Task F (Family + ADD unification):** Both views already exist as separate inline markup; unifying behind one card means a refactor with no canonical-data changes.
- **Task G (glossary boundary):** §13 already carries connective panels with deep-link strategy. The boundary question is mostly about NOT moving trick browsing into the glossary — current state already keeps tricks out of the glossary except as panel-cross-link lists.
- **Task H (future capabilities):** The service-layer infrastructure (symbolic-group memberships, topology groups, equivalence clusters, archetypes) is already in place via the symbolic-grammar-2 CSV layer. Future capabilities are mostly UI work over existing data.

---

## 12. Constraints honoured

- Read-only survey
- No canonical-data mutation
- No ontology change
- No schema or parser change
- No UI redesign in this document — that's Tasks B–H

---

*End of NOTATION_SURFACE_AUDIT.md*
