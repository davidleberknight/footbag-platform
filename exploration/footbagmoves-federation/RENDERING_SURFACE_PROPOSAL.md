# Phase O1 — operational notation rendering surface

**Status:** Presentation-layer design. Planning only. **No code changes; no parser integration; no ingestion; no DB schema changes; no ontology mutation.**

**Scope:** add a first-class operational-notation display block to `/freestyle/tricks/:slug`, positioned alongside (not replacing) the existing semantic-notation block, with token highlighting, glossary hooks, fallback handling, and sparse-data behavior.

**Architectural separation (forever-rule, preserved):**

> **Operational notation** = execution mechanics (how the body performs the trick — plant, dex, body, delays, in sequence)
> **Semantic notation** = ontology (what the trick is named and what it composes from — Jobs notation)
> **Parser decomposition** = diagnostic / editorial truth (what the structural-grammar parser derives from canonical_name + base_trick + modifier_links)

These are **complementary, not competing.** None overrides the others; none is the source of truth for the others.

**Cross-references:**
- `OPERATIONAL_NOTATION_GRAMMAR.md` — token inventory + grammar analysis (sibling planning artifact)
- `src/services/notationRendering.ts` — existing semantic-notation rendering pipeline; this proposal mirrors its restraint-first patterns
- `src/views/freestyle/trick.hbs` — current trick-detail template (Phase 4 + Phase 5a + Phase 6 surfaces)
- `feedback_parser_editorial_separation.md` (memory) — three-layer rule

---

## 1. Surface placement on the trick-detail page

Current section order on `/freestyle/tricks/:slug` (after Phase 6):

```
[ hero (name + ADD + family badge) ]
[ About this trick (description, alias-line, family note) ]
[ Notation ]                              ← semantic, role-coloured tokens
[ Editorial decomposition ]               ← Phase 5a
[ Notation grammar diagnostic ]           ← Phase 4 / structural_parse_json
[ What you can do (Learn / Watch / Family pathways) ]
[ Related tricks / Previous / Next / Family ladder ]
[ Reference Media (Tutorials / Demonstrations) ]
[ Passback Records ]
[ Next Tricks ]
```

**Proposed insertion point:** new section `[ Set notation (operational) ]` placed **immediately after** the existing `[ Notation ]` section and **before** `[ Editorial decomposition ]`. This puts the two notation layers visually adjacent (curator-natural reading order: semantic → operational → editorial decomposition → parser diagnostic).

```
[ Notation ]                              ← semantic (Jobs notation; ALL CAPS + colour spans)
[ Set notation (operational) ]            ← NEW — operational (FM-derived; ALL CAPS + brackets)
[ Editorial decomposition ]               ← curator-asserted lineage
[ Notation grammar diagnostic ]           ← parser-derived; behind <details>
```

The new section is **conditionally rendered** — present only when operational notation has been authored for the trick. Sparse-data handling per §7.

**Heading text:** `Set notation (operational)` — mirrors the existing `/freestyle/moves` page title naming. Avoids conflating with `Notation` (semantic) by making the qualifier explicit.

**Section-intro line:** `Execution mechanics — how the body performs the trick. Independent of the semantic notation above. Cite source if curator-authored from external evidence.`

---

## 2. Layout — minimal viable

The operational notation is a single-line monospace string. The minimal viable rendering preserves that flat structure:

```html
<section class="content-section operational-notation-display">
  <div class="section-heading">
    <h2>Set notation (operational)</h2>
    <p class="section-intro">Execution mechanics — how the body performs the trick.</p>
  </div>
  <code class="operational-notation-tokens">
    <!-- tokenized spans go here; see §3 -->
  </code>
  {{#if operational_source_note}}
  <p class="operational-source-note">{{operational_source_note}}</p>
  {{/if}}
</section>
```

The `<code>` element keeps the monospace font (matches semantic notation's `.notation-display-tokens`). Token spans inside carry role classes for highlighting.

**Source citation line** (when present): `Source: FootbagMoves.com (curator-reviewed)` or `Authored 2026-MM-DD per IFPA editorial`. Italic + small. Below the token line.

## Layout — advanced (deferred, O2)

When more than ~6 segments separated by `>>`, advanced layout breaks each beat group onto its own line:

```
CLIP
  >> (back) SPIN [BOD]  >  DUCK [BOD]
  >> (no plant while) OP FRONT WHIRL [BOD] [DEX] [PDX]
   > OP CLIP [DEL] [XBD]
```

This makes the structural beat groups visually scannable. Defer to O2; minimum viable is one line.

---

## 3. Token highlighting + colour taxonomy

The semantic notation surface uses a **restraint-first palette** (4 saturated primary roles + muted secondary). Operational notation follows the same restraint principle but with a **distinct colour family** to signal "different layer."

### 3.1 Colour family choice

| Surface | Primary colour family | Reason |
|---|---|---|
| Semantic notation (existing) | **Cool** — blue / teal / green saturation on primary roles (core_family / set / rotation / modifier) | "Identity" connotations; aligns with the role-classification feel |
| **Operational notation** (proposed) | **Warm** — amber / orange / brown saturation on primary roles | Distinct from semantic; "execution / motion / kinesthetic" connotations; lets a reader scanning the page identify the two layers at a glance without reading headings |

A reader who scrolls past both notation blocks sees: cool-tone block (semantic) then warm-tone block (operational). The visual pairing is unambiguous.

### 3.2 Operational token role taxonomy

Eight role groups, parallel to semantic's NotationRole enum but with operational-specific token sets:

| Role | Tokens | Treatment | CSS class |
|---|---|---|---|
| **surface** | `CLIP` `TOE` | Primary saturated (warm: amber 600) | `.op-token--surface` |
| **body-action** | `SPIN` `DUCK` `DIVE` | Primary saturated (warm: orange 600) | `.op-token--body-action` |
| **rotation-variant** | `FRONT WHIRL` `BACK WHIRL` `FRONT SWIRL` `BACK SWIRL` | Primary saturated (rotational accent: teal 700 — reused from semantic rotation role) | `.op-token--rotation-variant` |
| **side** | `SAME` `OP` | Muted secondary (gray 600) | `.op-token--side` |
| **direction** | `IN` `OUT` `FRONT` `BACK` | Muted secondary (gray 600) | `.op-token--direction` |
| **component-flag** | `[DEX]` `[DEL]` `[BOD]` `[XBD]` `[PDX]` `[XDEX]` | Muted, smaller font (gray 500); each flag class can have a distinguishing micro-colour border for the highest-frequency 3 (DEX/BOD/PDX) | `.op-token--component-flag .op-token--component-flag--<dex|del|bod|xbd|pdx|xdex>` |
| **pre-state** | `(back)` `(front)` `(no plant while)` `(rooted)` | Italic, muted (gray 500), no background fill | `.op-token--pre-state` |
| **sequence-op** | `>` `>>` | Neutral, subtle weight differentiation (`>` thin, `>>` bolder) | `.op-token--sequence-op .op-token--sequence-op--minor / --major` |

**Restraint check:** four "primary saturated" treatments (surface / body-action / rotation-variant) pull the eye to the load-bearing tokens. Everything else (sides, directions, component flags, pre-state, operators) renders in muted gray, so the page is dominated by the saturated primaries — same visual rhythm as semantic notation but warmer.

### 3.3 Token-class precedence rules

When a token could match multiple classes (rare but possible — e.g., `FRONT` as a direction vs `FRONT WHIRL` as a rotation-variant), the **most-specific class wins**. The classifier walks from most-specific (rotation-variant) to most-generic (direction) on a per-segment basis.

This mirrors the semantic notation's role-classification precedence in `notationRendering.ts:classifyToken`.

---

## 4. Typography + bracket convention

### 4.1 Casing

**ALL CAPS** for all structural tokens (`CLIP > OP IN [DEX]`). Matches:
- Semantic notation's existing convention
- IFPA `NOTATION_STYLE_GUIDE §2.2` recommendation
- One observed FootbagMoves entry already in this style (Stepping Ducking PS Whirl)

The L2 normalization layer (per F1 plan) converts FM's default Title-Case + parens form to ALL-CAPS + square brackets at extraction time.

**Lowercase** preserved only for pre-state flags `(back)`, `(front)`, `(no plant while)`, `(rooted)` — these are deliberately styled as inline annotation language, not structural tokens. Italics + lowercase visually signals "this is a state qualifier on the next token, not a token in its own right."

### 4.2 Brackets

**Square brackets** for component flags: `[DEX]`, `[BOD]`, `[XBD]`, `[DEL]`, `[PDX]`, `[XDEX]`. Matches IFPA's notation-style-guide recommendation. Distinct from the parens used in pre-state flags — visually clear separation between "qualifier on the next token" (parens, lowercase) vs "structural component of the previous token" (brackets, uppercase).

### 4.3 Spacing

Single space between tokens. Single space between a move name and its component flags. No collapsing or normalization beyond that.

### 4.4 Font

Monospace, same as semantic. Reuse `font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` from the existing `.notation-display-tokens` rule.

---

## 5. Glossary integration — three layers

### 5.1 Layer 1 (minimal viable): hover tooltips via `title` attribute

Each token span carries a `title` attribute with a short educational explanation:

```html
<span class="op-token op-token--surface" title="Surface: clipper-stall (plant on the inside of the support foot)">CLIP</span>
```

Browser-native tooltip; no JavaScript dependency; accessibility-friendly.

### 5.2 Layer 2 (incremental): role-keyed glossary anchor links

A new `/freestyle/glossary#operational-notation` section carries:

- Definitions of each component flag (DEX / DEL / BOD / XBD / PDX / XDEX) with diagrams
- Definitions of each pre-state flag (back / front / no plant while / rooted)
- Sequence-operator semantics (`>` vs `>>`)
- Cross-link to `/freestyle/moves` (the existing operational set-notation reference)
- Worked example (one mid-complexity row, e.g. Gauntlet) with each token annotated

Each token span gets a click-target attribute (`data-glossary-anchor="op-flag-dex"`) so a future enhancement could open the glossary at the relevant section. The minimal viable build doesn't yet wire that up — just adds the attribute.

### 5.3 Layer 3 (advanced, deferred): inline disclosure

Click on a token expands an inline panel below the notation line with the full definition + an example trick using the same flag. Defers indefinitely; only worth building if usage data shows the simple tooltip is insufficient.

---

## 6. Glossary section content (proposed)

New section to add to `/freestyle/glossary` (or extend the existing notation section):

```markdown
## Operational notation legend

### Component flags

| Flag | Meaning |
|---|---|
| [DEX] | Dexterity component — bag-foot interaction |
| [DEL] | Delay component — landing on a stall surface |
| [BOD] | Body-position component — pose / spin / duck / dive |
| [XBD] | Cross-body component — delay on the opposite-side surface |
| [PDX] | Paradox component — paradox-direction dex |
| [XDEX] | X-Dex component — full-circle dex variant |

### Pre-state flags

| Flag | Meaning |
|---|---|
| (back) | Backward-direction body action |
| (front) | Forward-direction body action |
| (no plant while) | Support leg in motion during this segment (no plant) |
| (rooted) | Held / rooted position; no plant |

### Sequence operators

| Operator | Meaning |
|---|---|
| > | Sub-step (continuous flow within a beat group) |
| >> | Major step boundary (often a no-plant break or beat change) |

### Surfaces and side prefixes

| Token | Meaning |
|---|---|
| CLIP, TOE | Plant or landing surface |
| SAME, OP | Same-side or opposite-side relative to plant foot |
| IN, OUT | Inward or outward arc |
| FRONT, BACK | Forward / backward direction (used with whirl/swirl) |
```

Keep the existing semantic-notation glossary section separate (the role-coloured tokens are explained in their own subsection). Two parallel legends; each labeled clearly.

---

## 7. Fallback + sparse-data handling

**Today's reality:** of 146 active tricks, fewer than ~10 will have operational notation authored at any near-term horizon. The rendering surface must handle sparse data gracefully.

### 7.1 When `operational_notation` is empty

**Default:** the section is **omitted entirely.** No placeholder. No empty box.

This matches the existing pattern for `editorialDecomposition` and `notationGrammar` panels (both null-render-omitted on the current trick page).

### 7.2 Curator-flagged "pending" rows (optional opt-in)

Tricks the curator wants to highlight as "operational notation deliberately authored next" can carry an opt-in flag. Renders a small placeholder:

```
Set notation (operational) — pending authoring
```

Subtle gray italic. No interactive elements. Curator opts in via `operational_notation_status = pending-priority`. **Most rows do NOT opt in;** opt-in is reserved for the ~10–20 tricks that are F2 priority.

### 7.3 When `operational_notation` is authored from FM evidence

The source-citation line (per §2 layout) makes the provenance explicit:
- `Source: FootbagMoves.com (curator-reviewed YYYY-MM-DD)` — curator has reviewed the FM-derived form and accepts it as IFPA's operational reading.
- `Source: IFPA-authored YYYY-MM-DD` — curator authored the operational notation from scratch (not derived from external).
- `Source: FootbagMoves.com (alternative reading)` — curator displays the FM operational as one community reading; IFPA may have an alternative authored.

These three states cover the realistic provenance space.

### 7.4 When operational disagrees with semantic decomposition

Special case: the Blur scenario from `OPERATIONAL_NOTATION_GRAMMAR.md §5.1`. FM names Blur "Blurry Mirage" but IFPA pt10 names it "Stepping Paradox Mirage." Two different decompositions, same ADD.

When the curator chooses to display the FM-derived operational notation alongside the IFPA semantic decomposition, the source line carries a hint:

```
Set notation (operational) — alternative reading
CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]
Source: FootbagMoves.com. Note: FM names this Blurry Mirage; IFPA Stepping Paradox Mirage. Both reach ADD=4 via different decompositions; see Editorial decomposition below.
```

Non-blocking; non-confrontational; surfaces the disagreement transparently. Curator-authored on a per-trick basis when the conflict is known.

---

## 8. Worked mockups

Each mockup uses ASCII to show the rendered HTML semantics. Real CSS treatment per §3.

### 8.1 Whirl (sparse case — operational not authored)

```
┌─ Notation ─────────────────────────────────────────────────────────┐
│ WHIRL                                                              │
│ (single-token semantic; core_family role; saturated cool palette)  │
└────────────────────────────────────────────────────────────────────┘
                                                                      ← operational section OMITTED ENTIRELY
┌─ Editorial decomposition ──────────────────────────────────────────┐
│ base_trick: whirl (self) — atom row; modifier coverage absent      │
└────────────────────────────────────────────────────────────────────┘
```

The trick-detail page renders cleanly without the operational block. Future authoring fills the gap; today's lack is invisible to the reader.

### 8.2 Barfly

```
┌─ Notation ─────────────────────────────────────────────────────────┐
│ BARFLY                                                             │
│ (self-atom name-form per §5.7; saturated)                          │
└────────────────────────────────────────────────────────────────────┘
┌─ Set notation (operational) ───────────────────────────────────────┐
│ CLIP  >>  SAME OUT [DEX]  >  SAME OUT [DEX]  >  OP CLIP [DEL][XBD] │
│  ▲     ▲    ▲    ▲   ▲                              ▲   ▲    ▲    │
│  surf  op   side dir flag                           surf flag flag │
│                                                                    │
│  Source: FootbagMoves.com (curator-reviewed 2026-MM-DD).           │
│  FM names this trick "Far Double Over Down."                       │
└────────────────────────────────────────────────────────────────────┘
┌─ Editorial decomposition ──────────────────────────────────────────┐
│ base_trick: infinity — broken upstream link (infinity not in dict) │
│ pt10 disposition: answered_b (named compound, not a true base)     │
└────────────────────────────────────────────────────────────────────┘
```

Operational notation here teaches the structural signature of Barfly: two same-side outward dex moves before the cross-body landing. The curator note exposes the FM canonical name so users can find references on FM if they search by that name.

### 8.3 Blur (ontology-conflict case)

```
┌─ Notation ─────────────────────────────────────────────────────────┐
│ STEPPING PARADOX MIRAGE                                            │
│ (per pt10 adjudication; modifier modifier core_family)             │
└────────────────────────────────────────────────────────────────────┘
┌─ Set notation (operational) — alternative reading ─────────────────┐
│ CLIP  >  OP IN [DEX]  >>  OP IN [DEX][PDX]  >  OP TOE [DEL]        │
│                                                                    │
│  Source: FootbagMoves.com (alternative reading).                   │
│  Note: FM names this trick "Blurry Mirage" (= +2-rotational        │
│  reading) while IFPA names it "Stepping Paradox Mirage" (= flat    │
│  +1 reading per pt10). Both decompositions reach ADD=4. The        │
│  operational notation's two distinct dex segments with PDX on      │
│  segment 2 is consistent with the IFPA reading.                    │
└────────────────────────────────────────────────────────────────────┘
┌─ Editorial decomposition ──────────────────────────────────────────┐
│ base_trick: mirage; modifier_links: stepping, paradox              │
│ Composed: stepping(+1) + paradox(+1) + mirage(2) = 4 ✓             │
└────────────────────────────────────────────────────────────────────┘
```

The transparent acknowledgment of the dual reading is the right shape — it teaches users that ontology disagreements exist in the community, surfaces both, and explains why IFPA's decomposition stands. The conflict is on the workbook's `needs_red` queue; the public page reflects the post-Red resolution.

### 8.4 Montage

```
┌─ Notation ─────────────────────────────────────────────────────────┐
│ SPINNING DUCKING PARADOX SYMPOSIUM WHIRL  (when authored)          │
│ (5-token semantic; if not yet in IFPA dict, this section omits)    │
└────────────────────────────────────────────────────────────────────┘
┌─ Set notation (operational) ───────────────────────────────────────┐
│ CLIP  >>  (back) SPIN [BOD]  >  DUCK [BOD]  >>                     │
│   (no plant while)  OP FRONT WHIRL [BOD][DEX][PDX]                 │
│   >  OP CLIP [DEL][XBD]                                            │
│                                                                    │
│  Source: FootbagMoves.com (curator-reviewed 2026-MM-DD).           │
└────────────────────────────────────────────────────────────────────┘
```

For high-complexity tricks like Montage, the **advanced** layout (per §2) breaks `>>`-separated beat groups onto their own lines. Wraps don't lose semantics. The 5-token semantic notation harmonizes adjacent. Each operational beat group reads as a discrete sub-action.

### 8.5 Stepping Ducking PS Whirl (ALL-CAPS+brackets convention demo)

```
┌─ Notation ─────────────────────────────────────────────────────────┐
│ STEPPING DUCKING PARADOX SYMPOSIUM WHIRL                           │
│ (5-token semantic; if authored)                                    │
└────────────────────────────────────────────────────────────────────┘
┌─ Set notation (operational) ───────────────────────────────────────┐
│ CLIP  >  OP IN [DEX]  >  DUCK [BOD]  >                             │
│   (no plant while)  OP IN [PDX][BOD][DEX]  >  OP CLIP [XBD][DEL]   │
│                                                                    │
│  Source: FootbagMoves.com (curator-reviewed 2026-MM-DD).           │
│  FM canonical name uses "PS" abbreviation; expanded here.          │
└────────────────────────────────────────────────────────────────────┘
```

This is the row already in the source corpus using the IFPA-style ALL-CAPS+brackets convention. Renders identically to other rows post-normalization (per §4 typography rules). The curator note explains the FM source uses an abbreviation expanded in IFPA's authoring.

---

## 9. CSS class structure (proposed)

Mirrors the existing `.notation-display-tokens` + `.notation-token` patterns from semantic notation. New classes only; no modification to existing semantic styles.

```css
/* ─── Operational notation surface ─────────────────────────── */

/* Container */
.operational-notation-display { /* mirrors .content-section spacing */ }

/* Token rendering line */
.operational-notation-tokens {
  display: inline-block;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 1.05em;
  letter-spacing: 0.03em;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 4px;
  line-height: 1.8;
  /* Optional advanced layout: white-space: pre-wrap to preserve >> linebreaks */
}

/* ─── Token base ────────────────────────────────────────────── */
.op-token {
  /* base monospace token; class-specific colour overrides */
  font-weight: 500;
}

/* ─── Primary saturated roles (warm palette) ───────────────── */
.op-token--surface {
  color: #b45309;          /* amber-700 */
  font-weight: 600;
}
.op-token--body-action {
  color: #c2410c;          /* orange-700 */
  font-weight: 600;
}
.op-token--rotation-variant {
  color: #0f766e;          /* teal-700 — reused from semantic rotation */
  font-weight: 600;
}

/* ─── Secondary muted roles ────────────────────────────────── */
.op-token--side,
.op-token--direction {
  color: #525252;          /* neutral-600 */
}

.op-token--component-flag {
  color: #737373;          /* neutral-500 */
  font-size: 0.85em;
  letter-spacing: 0;
}
/* Optional micro-distinguishers for the high-frequency 3 flags */
.op-token--component-flag--dex { border-bottom: 1px dotted #16a34a; }  /* green */
.op-token--component-flag--bod { border-bottom: 1px dotted #ea580c; }  /* orange */
.op-token--component-flag--pdx { border-bottom: 1px dotted #7c3aed; }  /* violet */

.op-token--pre-state {
  color: #737373;          /* neutral-500 */
  font-style: italic;
  font-weight: 400;
}

/* ─── Sequence operators ───────────────────────────────────── */
.op-token--sequence-op {
  color: #a3a3a3;          /* neutral-400 */
  margin: 0 0.4em;
  font-weight: 400;
}
.op-token--sequence-op--major {
  font-weight: 600;
  color: #525252;          /* neutral-600 — slightly bolder for >> */
}

/* ─── Source-citation note ─────────────────────────────────── */
.operational-source-note {
  margin-top: 8px;
  font-size: 0.85em;
  color: #525252;
  font-style: italic;
}
```

**No JS dependencies.** All token styling is pure CSS. Tooltips work via native `title` attributes; no popper.js or similar.

**Total CSS additions:** ~80 lines. Self-contained block in `src/public/css/style.css`.

---

## 10. Rollout sequencing

| Phase | Scope | Code estimate | Gates |
|---|---|---|---|
| **O1a — Minimal viable** | Service-layer field + template-layer block. Operational notation rendered as plain monospace text (no token highlighting yet). Source-citation note rendered when present. Conditional on `operational_notation` being non-empty. | ~30 lines TS + 10 lines hbs + 20 lines CSS | Curator authors operational_notation for ~5 tricks via red_corrections (new field type — see §11). Verify rendering on those 5 tricks; rest of corpus unaffected. |
| **O1b — Token highlighting** | Service-layer tokenizer (parser-mirror style; mirrors the existing notationRendering.ts pattern but with operational role taxonomy from §3.2). Template renders `<span class="op-token op-token--<role>">` per token. CSS palette per §3+§9. Native `title` tooltips per §5.1. | ~150 lines TS + 30 lines hbs + 80 lines CSS | Tests covering each role classification; visual QA on all curator-authored rows. |
| **O1c — Glossary integration** | New `/freestyle/glossary#operational-notation` section per §6. Each token span gains `data-glossary-anchor`. Cross-link to `/freestyle/moves`. | ~30 lines hbs + 20 lines TS for glossary-page service shaping | Glossary section reads correctly; tooltip → glossary link path verified for at least 3 token classes. |
| **O1d — Source-provenance refinement** | Source-citation line renders three states (FM-curator-reviewed / IFPA-authored / FM-alternative-reading) per §7.3. Conflict cases (per §7.4) render the explanatory note. | ~20 lines TS + small hbs branches | Verified on Blur (alternative-reading), Barfly (FM-curator-reviewed), and one IFPA-authored trick. |
| **O2 — Advanced layout** (deferred) | Visual segmentation: each `>>`-separated beat group on its own line. Indentation. Optional segment-numbering. | ~50 lines TS + 30 lines CSS | Deferred until O1 has shipped and curator has 20+ rows authored to evaluate the advanced layout's value. |
| **O3 — Cross-link operational tokens to set-notation reference** (deferred) | Each surface/side/direction/whirl-variant token in operational notation links to the corresponding row in `/freestyle/moves`. Quasi-glossary inline. | ~40 lines TS | Deferred indefinitely; only worth building when curator data shows users navigate from operational tokens. |

**Critical path:** O1a → O1b → O1c → O1d. Each is a separately-mergeable commit.

**No deliverable in this turn.** Awaiting your approval before any code work begins.

---

## 11. Workbook + authoring-channel integration

The workbook already reserves the surface columns (R1 schema):

| Field | Used by | Status |
|---|---|---|
| `Tricks` sheet → `operational_notation` | Trick-detail page (proposed O1a render target) | Currently empty for all rows |
| `Tricks` sheet → `operational_notation_status` | Trick-detail rendering decision (whether to show "pending" placeholder per §7.2) | Currently `not-applicable` for all rows |
| External Reconciliation sheet → `fm_operational_raw` | Audit trail; pre-normalization form from FootbagMoves | Reserved (R4) |

**Authoring channel (proposal):** extend the existing `red_corrections_2026_04_20.csv` per-field correction format with a new `field` value: `operational_notation`. Mirrors how `notation` is authored today. Source note carries the provenance (FM citation, curator review date, alternative-reading note, etc.).

Example correction row:
```
barfly,operational_notation,,CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD],Phase O1a 2026-MM-DD: FM-curator-reviewed; FM canonical "Far Double Over Down"
```

Loader 19 already supports per-field updates; only addition is recognizing `operational_notation` as a valid field name (1-line whitelist extension).

**No schema change required for O1a–O1d.** The `operational_notation` column already exists on `freestyle_tricks` (per Phase 0 reservation) — same as `notation`, just a different field. The trick-detail service reads it and passes through.

---

## 12. Layered authority — preserved boundary

The proposal explicitly maintains the three-layer separation enshrined in `feedback_parser_editorial_separation.md`:

| Layer | Source | Role on trick page |
|---|---|---|
| **Semantic notation** (`notation`, role-coloured) | IFPA editorial / Tier 1 authoring | "Notation" section. Authoritative public-facing form. |
| **Operational notation** (`operational_notation`, NEW) | Curator-authored or FM-derived + curator-reviewed | "Set notation (operational)" section. Sibling, not replacement. |
| **Editorial decomposition** | base_trick + freestyle_trick_modifier_links | "Editorial decomposition" section. Lineage truth. |
| **Parser decomposition** | parser-derived from canonical_name | "Notation grammar diagnostic" section. Diagnostic only. |

**Critical rule:** the operational notation does NOT inform the parser, the editorial decomposition, or the asserted ADD value. It's a presentation surface that consumes a curator-authored field and renders it. **No parser hook. No ontology mutation. No auto-derivation in either direction.**

A future iteration COULD add cross-checks (e.g., flag a trick where operational notation has 4 dex segments but the editorial decomposition only counts 3 modifiers + base) — but those cross-checks are diagnostic, surfaced in the workbook only, not on the public page.

---

## 13. Constraints honored

- ✓ **No code changes** in this turn (planning + design only)
- ✓ **No parser integration** — operational notation is opaque text for rendering purposes
- ✓ **No ingestion** — relies on curator-authored `operational_notation` field
- ✓ **No DB schema changes** — `operational_notation` column already exists on `freestyle_tricks`
- ✓ **No ontology mutation** — the operational notation NEVER modifies semantic, editorial, or parser layers
- ✓ **No alias auto-import** — name-handling is out of this proposal's scope
- ✓ **No FootbagMoves bulk scraping** — the few curator-authored operational notations come from F2 foundational extraction (separately approved)
- ✓ **Three-layer separation preserved** — explicit in §12
- ✓ **Restraint-first palette principle** — primary tokens get saturation; secondary tokens muted; mirrors semantic notation discipline

## 14. Decisions I need before any code work

1. **Insertion point** — confirm `[ Set notation (operational) ]` between `[ Notation ]` and `[ Editorial decomposition ]`, or prefer a different placement (e.g. inside a single `<details>` "Notation" container)?
2. **Colour family** — confirm warm palette (amber/orange) for operational, vs the existing cool palette (blue/teal/green) for semantic? Or alternative?
3. **Heading text** — "Set notation (operational)" vs "Operational notation" vs "Execution notation"? My preference: "Set notation (operational)" — matches the existing `/freestyle/moves` page naming.
4. **Sparse-data behavior** — confirm "omit entirely when empty" (default), with `operational_notation_status = pending-priority` opt-in for visible placeholder?
5. **Authoring channel** — confirm extending `red_corrections_2026_04_20.csv` with a new `field` value `operational_notation` (vs creating a separate authoring file)?
6. **Token-class precedence** — confirm rotation-variant matches FIRST (so "FRONT WHIRL" classes as `op-token--rotation-variant` not as `op-token--direction` + `op-token--?`)?
7. **F2 priority** — do you want me to enumerate the ~5 trick rows that should land first under O1a? Likely candidates: Barfly + Blur + a TT-canonical-tutorial trick (Whirl, Mirage, Pixie) + one high-difficulty showcase (Gauntlet) + one mid-difficulty (Spinning Symposium Whirl).

Awaiting answers. No code, scrapes, or DB changes pending. The proposal is ready to be staged + committed as a planning artifact regardless of whether O1a code work lands now or later.
