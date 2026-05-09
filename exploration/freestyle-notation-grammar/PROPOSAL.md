# Freestyle Notation Grammar — Structural-Semantic Decomposition Proposal

**Status:** Design proposal. Pre-implementation. **Architectural decisions ratified 2026-05-09 (see §13 decision log).**
**Date:** 2026-05-09
**Scope:** Evolves the freestyle dictionary from a flat catalog into a machine-understandable semantic grammar system, layered over (not replacing) the existing canonical/family/modifier ontology and the raw Jobs notation evidence.

---

## 1. Core philosophy

1. **Raw notation is inviolable evidence.** Jobs notation as documented by Red, footbag.org, and TT lessons is historical record. The system never mutates it.
2. **Structured representation is parallel, not replacement.** A second layer decomposes notation into a machine-readable parse tree. Both layers coexist on every row; the raw layer is canonical for human reading, the structured layer is canonical for filtering, ADD derivation, lineage graphs, and visualization.
3. **Tolerance over coverage.** Some notation rows are incomplete, historically inconsistent, or use undocumented tokens. The parser preserves what it can resolve and flags the rest, rather than rejecting the row.
4. **Policy-aware ADD derivation.** Some modifiers (quantum, nuclear, backside, shooting, the down-family) have unresolved or contested ADD weights. The system distinguishes `exact`, `approximate`, `unresolved`, and `policy_dependent` formula states so downstream UIs can render honestly.
5. **Differentiation via grammar, not volume.** What separates IFPA from Footbag.org and FootbagMoves is not "more tricks" but a structurally-coherent ontology that supports filtering, related-trick generation, lineage navigation, and editorial QC. The notation grammar is the lever.

---

## 2. Structural semantic schema

A trick's structured parse is a JSON document with **semantic-role buckets**. Each bucket is an ordered list of normalized tokens. Absent buckets mean "this role does not apply to this trick." Every token includes a span pointer back into the raw notation for highlighting (see §6).

### 2.1 Canonical role buckets

| Role | Description | Examples |
|---|---|---|
| `core_family` | The structural anchor — the trick's family base. Required (every parsed trick has exactly one). | whirl, butterfly, osis, torque, drifter, mirage, illusion, eggbeater, legover, atw, swirl, blur |
| `set` | Bag-launch primitive that precedes the trick. | atomic, pixie, fairy, quantum, nuclear, pogo, rooted |
| `rotation` | Body-rotational modifier. Stackable (spinning + ducking is rotation + modifier). | spinning, inspinning, swirling, whirling, gyro |
| `modifier` | Body-positional modifiers (non-rotational). | ducking, stepping, symposium, paradox, tapping, blazing, weaving, barraging, miraging, diving |
| `dex_structure` | Dex-chain shape: count + direction. | `count: double`, `count: triple`, `direction: in_to_out`, `direction: out_to_in`, `direction: same` |
| `delay_surface` | Final stall surface where the trick lands. | clipper, toe, inside, heel, outside, cross_body_sole |
| `directionality` | Foot-side and cross-body relationships. | `same_foot`, `opposite_foot`, `cross_body` |
| `unusual_surface` | Non-standard delay or contact surfaces. | sole, knee, head, neck, shoulder, forehead, cloud |
| `additive_flags` | Notation markers altering execution. | `plant` (down), `back` (reverse spin direction), `no_plant_while`, `dex_within_body_motion` |
| `special_cases` | Policy-dependent or contested modifiers requiring expert/Red adjudication. | quantum (set vs rotational), nuclear (+2 weight), backside, shooting, down-family |
| `unresolved_tokens` | Tokens the parser could not classify. Surfaced for review. | (anything that didn't match) |

### 2.2 Examples

```jsonc
// "Spinning Whirl"
{
  "core_family": [{"token": "whirl", "span": [13, 18]}],
  "rotation":    [{"token": "spinning", "span": [0, 8]}],
  "parse_confidence": "exact"
}

// "Quantum Butterfly"
{
  "core_family": [{"token": "butterfly", "span": [8, 17]}],
  "set":         [{"token": "quantum", "span": [0, 7]}],
  "special_cases": ["quantum"],   // flagged: quantum's ADD weight is policy-dependent
  "parse_confidence": "approximate"
}

// "Atomic Ducking Whirl"
{
  "core_family": [{"token": "whirl", "span": [15, 20]}],
  "set":         [{"token": "atomic", "span": [0, 6]}],
  "modifier":    [{"token": "ducking", "span": [7, 14]}],
  "parse_confidence": "exact"
}

// "Surging Mirage" (skill §2 rule: surging = spinning + stepping)
{
  "core_family": [{"token": "mirage", "span": [8, 14]}],
  "rotation":    [{"token": "spinning", "expanded_from": "surging"}],
  "modifier":    [{"token": "stepping", "expanded_from": "surging"}],
  "additive_flags": ["virtual_modifier_expanded"],
  "parse_confidence": "exact"
}

// "Down Diver" (down-family policy unresolved)
{
  "core_family": [{"token": "diver", "span": [5, 10]}],
  "special_cases": ["down_family_unresolved"],
  "unresolved_tokens": [{"token": "down", "span": [0, 4], "reason": "down-family policy not yet ratified"}],
  "parse_confidence": "policy_dependent"
}
```

### 2.3 Top-level metadata fields

In addition to the role buckets, the parse JSON carries:

- `parser_version`: schema version (e.g. `"1.0"`) — bumped on grammar changes
- `parse_confidence`: `exact | approximate | partial | unresolved | policy_dependent`
- `raw_token_count`: count of distinct tokens in the canonical name
- `resolved_token_count`: count placed into role buckets
- `parsed_at`: ISO timestamp
- `parse_source`: `"name_decomposition" | "notation_decomposition" | "manual"` — where the parse originated

---

## 3. Parser strategy

The parser is a three-stage pipeline. Each stage is independently testable; failures in one stage degrade gracefully into lower-confidence outputs.

### 3.1 Stage A — Tokenizer

**Input:** `canonical_name` (primary) + `notation` (secondary disambiguator).

**Steps:**
1. Lowercase + Unicode-NFKC normalize.
2. Split on whitespace and hyphens; preserve span offsets back into the raw string for highlighting.
3. Normalize plurals/gerunds via a small alias table (e.g., `miraging` → `miraging_modifier`, distinct from `mirage_canonical`).
4. Resolve multi-word atoms: `cross body` → `cross_body`, `double leg over` → `double_leg_over_canonical_atom`.
5. Emit a list of `{token, span_start, span_end, source}`.

The notation pass is secondary because Jobs notation tokens (`OP IN [DEX]`, `SAME CLIP [XBD] [DEL]`, etc.) describe the mechanical execution but don't always include the modifier names that appear in the canonical name. Cross-checking the two confirms the parse and surfaces inconsistencies.

### 3.2 Stage B — Semantic mapper

A registry of canonical token sets per role. Lookup is exact-match first, then prefix-match, then alias-table fallback.

```python
SET_TOKENS         = {"atomic", "pixie", "fairy", "quantum", "nuclear", "pogo", "rooted"}
ROTATION_TOKENS    = {"spinning", "inspinning", "swirling", "whirling", "gyro"}
MODIFIER_TOKENS    = {"ducking", "stepping", "symposium", "paradox", "tapping",
                      "blazing", "weaving", "barraging", "miraging", "diving",
                      "blurry", "shooting", "terraging"}
CORE_FAMILY_TOKENS = {"whirl", "butterfly", "osis", "torque", "drifter", "mirage",
                      "illusion", "eggbeater", "legover", "around-the-world", "swirl",
                      "blur", "barfly", "barrage", "blender", "pickup", "smear",
                      ... # full list curated from freestyle_tricks where category != 'modifier'
                     }
DELAY_SURFACE_TOKENS = {"clipper", "toe", "inside", "heel", "outside", "cross_body_sole"}
UNUSUAL_SURFACE_TOKENS = {"sole", "knee", "head", "neck", "shoulder", "forehead", "cloud"}
SPECIAL_CASE_TOKENS  = {"quantum", "nuclear", "backside", "shooting", "down"}

VIRTUAL_MODIFIER_EXPANSIONS = {
    # skill §2 rule: surging = spinning + stepping
    "surging": [("rotation", "spinning"), ("modifier", "stepping")],
}
```

The `freestyle_trick_modifiers` and `freestyle_tricks` DB tables are the **authoritative sources** for these registries. The mapper reads them at startup and adds any DB-only modifiers/canonicals to the in-memory sets, so adding a Red-endorsed modifier to the DB automatically updates the parser without code change.

**Algorithm:**

```
parse(name):
  tokens = tokenize(name)
  parse = {role: [] for role in ROLES}
  unresolved = []
  for tok in tokens:
    if tok in VIRTUAL_MODIFIER_EXPANSIONS:
      for role, expanded in VIRTUAL_MODIFIER_EXPANSIONS[tok]:
        parse[role].append({"token": expanded, "expanded_from": tok, "span": tok.span})
      continue
    classified = False
    for role, registry in [
        (set, SET_TOKENS),
        (rotation, ROTATION_TOKENS),
        (modifier, MODIFIER_TOKENS),
        (core_family, CORE_FAMILY_TOKENS),
        (delay_surface, DELAY_SURFACE_TOKENS),
        (unusual_surface, UNUSUAL_SURFACE_TOKENS),
    ]:
      if tok.normalized in registry:
        parse[role].append({"token": tok.normalized, "span": tok.span})
        if tok.normalized in SPECIAL_CASE_TOKENS:
          parse.setdefault("special_cases", []).append(tok.normalized)
        classified = True
        break
    if not classified:
      unresolved.append({"token": tok.normalized, "span": tok.span,
                         "reason": "not in any registry"})
  parse["unresolved_tokens"] = unresolved
  parse["parse_confidence"] = compute_confidence(parse)
  return parse
```

### 3.3 Stage C — Ambiguity + unresolved handling

**Ambiguity rules (heuristic):**

- **Canonical-slug-first preference.** If a multi-token name is itself a registered canonical (e.g. `double-leg-over`), treat it as a single atom rather than decomposing into `double` + `leg-over`. This honors named-identity per CANONICALIZATION_POLICY §10.
- **Set-before-rotation-before-modifier ordering.** Tokens placed left-to-right in the name are typically ordered set → rotation → modifier → family-core. Out-of-order tokens get classified by registry membership regardless of position, but the parser logs a warning.
- **Multi-token atoms.** `cross-body sole stall` → `[cross_body, sole, stall]` after tokenization, but `unusual_surface=[sole], delay_surface=[cross_body_sole]` after multi-token-atom resolution.
- **Direction-is-structural exception.** Per the freestyle dictionary skill: `inspinning ≠ spinning` semantically. The parser treats them as distinct `rotation` tokens, never collapses them.

**Unresolved-token handling:**

- Unrecognized tokens go into `unresolved_tokens` with a `reason` string.
- The row's `parse_confidence` downgrades to `partial` if any tokens are unresolved.
- A parse-coverage QC report (§7) lists every row with unresolved tokens for editorial review — these are the candidates for new modifier registrations.
- A row with a `core_family` token resolved + ≤25% unresolved tokens is still considered usable for filtering/lineage; the `unresolved_tokens` are surfaced editorially but don't break grouping.

**Provenance preservation:**

- Every parse output includes `parser_version`, `parsed_at`, and `parse_source`.
- The raw notation is read from `jobs_notation_raw`, which is never mutated. The structured output goes to a separate column.
- When the parser is upgraded (new grammar rules), historical parses are re-runnable from raw on demand.

---

## 4. DB / storage proposal

### 4.1 New columns on `freestyle_tricks`

| Column | Type | Description |
|---|---|---|
| `jobs_notation_raw` | TEXT | The original Jobs notation as documented. **Never mutated.** Renames the existing `notation` column. |
| `jobs_notation_normalized` | TEXT | Whitespace-collapsed, case-standardized form for diff/QC tooling. Derived; can be regenerated from `jobs_notation_raw`. |
| `structural_parse_json` | TEXT | The schema-§2 JSON document. Derived from `canonical_name` + `jobs_notation_raw`. |
| `computed_add_formula` | TEXT | Human-readable ADD formula derived from the parse, e.g. `"spinning(+1 rot) + whirl(3) = 4"`. Null when not derivable. |
| `computed_adds` | INTEGER | Numeric ADD count when derivable. Null when not. |
| `add_formula_status` | TEXT | One of: `exact`, `approximate`, `unresolved`, `policy_dependent`. Drives downstream UI and QC. |

### 4.2 Migration plan

1. **Add columns** without backfilling. New rows write the structured fields; existing rows leave them `NULL`.
2. **Backfill in passes.** A separate batch script walks active canonicals and runs the parser:
   - Pass 1: structurally clean rows where `name → parse → exact ADD math`. ~70-80% of dictionary expected.
   - Pass 2: `approximate` and `partial` rows. Editorial review.
   - Pass 3: `policy_dependent` rows (down-family, quantum, etc.). Defer until policy ratifies.
3. **Re-parse on grammar upgrade.** When the grammar changes, a regeneration script re-parses every row from `jobs_notation_raw` + `canonical_name`. The raw layer is the source of truth.

### 4.3 What we do NOT do

- **Do not mutate `notation` / `jobs_notation_raw`.** Any normalization happens in `jobs_notation_normalized` or in the parse output.
- **Do not let the parse override the asserted `adds` field.** When `computed_adds != adds`, both are kept and the discrepancy lights `add_formula_status='approximate'` for QC.
- **Do not introduce a separate `freestyle_trick_components` join table.** The structured parse is a JSON blob on the trick row. Join-table modeling is premature optimization until we have a query pattern that can't be served by the JSON.
- **Do not store derived ADD as authoritative.** The asserted `adds` (from Red / curated CSV) remains the editorial truth. `computed_adds` is for QC and for rendering the formula.

### 4.4 Indexes

- `idx_freestyle_tricks_add_formula_status` — supports "show me all `policy_dependent` rows" QC queries.
- A JSON1 generated column on `structural_parse_json`.`core_family[0].token` — supports cheap "all whirl-family tricks" queries without scanning the JSON.
- Consider deferring richer indexing until query patterns prove out.

---

## 5. Semantic highlighting design

The notation rendering wraps each token in a `<span>` carrying a CSS class derived from its semantic role. The `structural_parse_json` provides the spans.

### 5.1 Color/role mapping (proposal)

| Role | CSS class | Color guideline |
|---|---|---|
| `core_family` | `.notation-core-family` | green, bold — the structural anchor |
| `set` | `.notation-set` | blue — bag-launch primitive |
| `rotation` | `.notation-rotation` | orange — body-spin |
| `modifier` | `.notation-modifier` | yellow — body-positional |
| `dex_structure` | `.notation-dex-structure` | gray — counts + directions |
| `delay_surface` | `.notation-delay-surface` | purple — landing surface |
| `directionality` | `.notation-directionality` | muted, italic — same/op/xbd |
| `unusual_surface` | `.notation-unusual-surface` | pink — non-standard surfaces |
| `additive_flags` | `.notation-additive-flag` | dark-italic — plant/back/etc. |
| `unresolved` | `.notation-unresolved` | red dotted underline — flag for editorial review |
| `special_cases` | `.notation-special-case` | amber, with a `?` superscript — policy-pending |

Colors above are placeholders; final palette should respect the existing site CSS tokens and pass WCAG AA contrast.

### 5.2 Rendering

- The trick-detail page renders the canonical_name and the raw notation as two side-by-side blocks. Both use the same span/class scheme so a reader can visually correlate "the spinning token" in the name with "the SPIN [BOD] token" in the notation.
- A small legend (sticky in the corner or inline once-per-page) explains the color coding.
- Hover on any colored span shows a tooltip with the role + a short definition.
- Disclosure-toggle integration: in Simple mode, only `core_family` and `set` highlights show; in Deep Dive, all roles render.

### 5.3 Accessibility

- Color is not the only signal. Each span carries `data-role="<role>"` and (for screen readers) a visually-hidden role label.
- Underlines/dotted decorations on `unresolved` and `special_cases` are visible without color.

---

## 6. Family-core architecture

### 6.1 Core-family anchors

The dictionary's structural ontology centers on a small set of **core-family anchors** that act as canonical roots for related-trick generation, family pages, lineage graphs, and structural navigation.

**Confirmed core-family anchors (James-ratified 2026-05-09):**

| Family | Notes |
|---|---|
| `whirl` | Largest family. 14 active members. Anchor for spinning/paradox/symposium families. |
| `butterfly` | 9 members. Anchor for atomic/spinning/ducking/dimwalk/parkwalk/ripwalk/sidewalk progression. |
| `mirage` | 9 members. Pairs with illusion (direction-reversed). |
| `illusion` | 3 members. Direction-reversed mirage; structurally distinct per skill rule. |
| `osis` | 7 members. Cross-body landing family. |
| `torque` | 7 members. Includes mobius (gyro torque). |
| `drifter` | 4 members. Tombstone/vortex sub-family. |
| `barrage` | Anchor; barraging modifier propagates a family lineage. |
| `legover` | 6 members. Includes double-leg-over progression. |

**Candidates pending Red review** — currently treated as families in `trick_family` but their core-anchor status is uncertain. They may turn out to be compound-derived (a layered child of one of the confirmed anchors) rather than independent cores. Defer ratification:

| Candidate | Compound-derivation hypothesis to investigate |
|---|---|
| `blur` | possibly a Quantum-set variant of mirage; structurally a modifier-stack rather than an anchor |
| `blender` | possibly a Whirling derivative ("Whirling Blender, two dexes and an Osis" per Red pt3 productive-multiplicity reading) |
| `barfly` | possibly an Infinity-family compound rather than a core |
| `ripwalk` | possibly a Blurry-Butterfly compound rather than a core |
| `stepping-*` set | the stepping modifier propagates across many families; may not warrant its own core-family card |

These five remain in `trick_family` for now (no data change), but lineage-graph rendering and "core family" semantic in the parse should be cautious about treating them as anchors until Red rules. The parser can still classify them via the canonical-slug-first rule (§3.3); the open question is whether they sit at the same hierarchical level as `whirl` and `butterfly`.

**Smaller families and solo canonicals** (not core-anchor candidates; render normally on family-card grids without lineage trees):

`clipper-stall`, `swirl`, `pickup`, `eggbeater`, `pendulum`, `dada-curve`, `flying-clipper`, `flying-inside`, `flying-outside`, `hop-over`, `walk-over`, `spyro`, `double-spin`, `dyno`, `paradon`, `bigwalk`.

### 6.2 Lineage graph

Each core-family anchor seeds a tree:

```
butterfly (3 ADD)
├── atomic-butterfly (4 ADD)        — set: atomic
├── spinning-butterfly (4 ADD)      — rotation: spinning
├── ducking-butterfly (4 ADD)       — modifier: ducking
├── dimwalk (4 ADD)                 — community-named
├── parkwalk (4 ADD)
├── ripwalk (4 ADD)
├── sidewalk (4 ADD)
├── bigwalk (5 ADD, alias: spinning-stepping-butterfly)  — productive multiplicity (Red)
└── ...
```

The graph is derivable from `freestyle_tricks.trick_family` + `freestyle_trick_modifier_links` + the new `structural_parse_json.core_family + modifier + rotation` fields. No new schema is needed for the graph — it's a projection over existing data.

### 6.3 Cross-family lenses

The structural parse enables queries that cut across families:

- "All `rotation: [spinning]` tricks" → the spinning progression across whirl, butterfly, osis, torque, mirage, etc.
- "All `set: [atomic]` tricks" → the atomic set across all families.
- "All `modifier: [ducking]` tricks" → the ducking modifier corpus.
- "All `delay_surface: [clipper]` tricks" → cross-body-clipper-landing tricks.

These queries are the "set view" / "by modifier" view in `/freestyle/tricks?view=sets` made fully filter-driven instead of constrained to a single modifier at a time.

### 6.4 Multi-family membership

Per the dictionary skill: a trick has **one** primary `core_family` (data) plus **modifier associations** (informational). The parse honors this — exactly one `core_family` per trick. A trick like `mobius` (gyro torque) has `core_family: [torque]` and `modifier: [gyro]`; mobius is NOT a member of a "gyro family" because no such canonical family exists.

If two valid decompositions exist (e.g., a row that could read as "gyro torque" or "torque-with-gyro-modifier-applied"), the parser picks the one anchored on a registered canonical and surfaces the alternative in `additive_flags: [structural_alias_present]` for editorial review.

---

## 7. ADD derivation support

### 7.1 Formula evaluation

For each parse:

1. Look up `core_family` token's `adds` from `freestyle_tricks`. (Required; if not found, status = `unresolved`.)
2. Look up each `set` / `rotation` / `modifier` token's bonus from `freestyle_trick_modifiers`. Use `add_bonus_rotational` if the core family is in the rotational-base set (whirl, mirage, torque, swirl); else use `add_bonus`.
3. Compute `computed_adds = sum(bonuses) + base.adds`.
4. Compose `computed_add_formula` as a human-readable string (e.g., `"spinning(+1 rot) + paradox(+1) + whirl(3) = 5"`).
5. Compare against the asserted `freestyle_tricks.adds`:
   - **Match** → `add_formula_status = exact`.
   - **Mismatch** → `add_formula_status = approximate`. Both values surface; QC report flags.
   - **Any token in `special_cases`** → `add_formula_status = policy_dependent`. Formula is computed but flagged as needing policy ratification before being trusted.
   - **Any unresolved tokens** OR **base ADD missing** → `add_formula_status = unresolved`.

### 7.2 The four formula states (locked-in 2026-05-09)

The four states are semantically distinct and **must not collapse**. `policy_dependent` in particular is not a parser failure — it's an ontology / Red-policy question that the parser correctly identifies but cannot resolve.

| State | Meaning | UI rendering |
|---|---|---|
| `exact` | Parse complete; computed equals asserted. | Show formula as confirmation of structural integrity. |
| `approximate` | Parse complete; computed differs from asserted. | Show both values + a "structural ADD doesn't match asserted" badge. |
| `policy_dependent` | Parse complete but contains tokens with unresolved policy weights (quantum, nuclear, backside, shooting, down-family). | Show formula prefixed with "?" and a "policy-pending" badge linking to the relevant Red-followup doc. |
| `unresolved` | Parse incomplete OR base canonical missing. | Hide formula; surface `unresolved_tokens` list editorially. |

**Why all four are necessary:**

- `unresolved` says "the parser couldn't decompose this row" — a parser-coverage problem, fixable by adding modifiers/grammar.
- `policy_dependent` says "the parser decomposed it cleanly but the ontology hasn't decided what one of its tokens *weighs*" — an editorial/Red problem, fixable only by ratifying policy. Examples: nuclear (+1 vs +2), quantum (set vs rotational), backside (direction vs modifier), shooting (set vs body), down-family (modifier vs canonical compound).

A 3-state collapse would conflate parser-coverage gaps with policy-decision gaps and obscure what's actionable where.

### 7.3 QC tooling

Three scheduled reports, generated by re-running the parser:

- **`add_conflict_report.md`** — every row with `add_formula_status = approximate`. The first iteration probably surfaces 7 known ADD-conflict rows (atom smasher, clipper, cross-body sole stall, heel stall, osis, quantum, terrage from the existing reconciliation workbook) plus structurally-detected ones.
- **`parser_coverage_report.md`** — every row with `unresolved_tokens` or `parse_confidence != exact`. Editorial worklist for adding modifiers / refining grammar.
- **`policy_dependent_queue.md`** — every row with `add_formula_status = policy_dependent`. Drives the Red-followup queue (down-family, quantum, etc.).

### 7.4 What ADD derivation does NOT do

- **Does not become editorial truth.** The asserted `adds` from Red / curated CSV remains canonical. The computed value is a QC signal.
- **Does not auto-promote.** A parse with `exact` math doesn't trigger any DB write; it just confirms the row is structurally clean.
- **Does not over-index on math.** Several Red-endorsed canonicals have `approximate` math by design (Jani Walker — Red said 5 ADD; structural says 4 from "Barraging Butterfly"). The structure-deferred policy from CANONICALIZATION_POLICY §3 is preserved.

---

## 8. UI / UX concepts

These are concept proposals; each could be implemented incrementally or deferred indefinitely. None require schema beyond §4.

### 8.1 Trick detail page — semantic highlighting

```
canonical_name:  Spinning Paradox Whirl
                 ────────  ───────  ─────
                 rotation  modifier core_family
                 (orange)  (yellow) (green-bold)

jobs_notation_raw:
  CLIP > (back) SPIN [BOD] > OP IN [PDX] [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]
         ─────  ─────                ─────                              ─────
         add.   rotation              modifier                           delay
         flag                         (yellow)                           surface
                                                                         (purple)

structural_parse:
  core_family:  whirl
  rotation:     spinning
  modifier:     paradox
  (computed)    spinning(+1 rot) + paradox(+1) + whirl(3) = 5  [exact]
```

### 8.2 Family page — lineage graph

A vertical or radial tree visualization keyed to the `core_family` of the trick under view. Each node is a clickable trick; edges represent the modifier relationship (rotation, set, modifier).

A learner's mental model: "if you know whirl, then spinning-whirl is whirl plus a body-spin; paradox-whirl is whirl plus a paradox modifier; combine both for spinning-paradox-whirl."

### 8.3 Faceted browse — "by modifier"

Existing `?view=sets` becomes more powerful:

- Pick a `set` (atomic), get all `set: [atomic]` tricks across families.
- Pick a `rotation` (spinning), same lens for rotation.
- Pick a combination (atomic + spinning), get the intersection.
- Pick a `delay_surface` (clipper), get all clipper-landing tricks.

These are filter chips on the existing dictionary index; the structural parse makes them cheap to compute.

### 8.4 Comparison view

Two-trick side-by-side parse diff. "How is `paradox-whirl` different from `paradox-mirage`?" → renders both parses in parallel with the differing fields highlighted. Pedagogical for learners who want to see the structural delta between similar tricks.

### 8.5 Modifier layering visualization

For trick-detail pages, render modifiers as stacked bars or nested boxes:

```
┌────────────────────────────────┐
│  set: atomic                   │  +1 (rotational base) / +2 (non-rot)
│  ┌──────────────────────────┐  │
│  │  rotation: spinning      │  │  +1 (rot)
│  │  ┌────────────────────┐  │  │
│  │  │ modifier: paradox  │  │  │  +1
│  │  │  ┌──────────────┐  │  │  │
│  │  │  │ core: whirl  │  │  │  │  3 ADD
│  │  │  └──────────────┘  │  │  │
│  │  └────────────────────┘  │  │
│  └──────────────────────────┘  │
└────────────────────────────────┘
                                  =  6 ADD
```

This is one ASCII rendering; a CSS implementation would use nested boxes with the role-color palette.

### 8.6 Search

Full-text search currently matches against `canonical_name` and `aliases`. The structured parse adds:

- Search by role-token: `rotation:spinning` → all spinning tricks.
- Combine role-tokens: `rotation:spinning core:whirl` → spinning-whirl and its modifier-layered descendants.
- Fuzzy + structural: typing "spinning whirl" matches `core_family:whirl + rotation:spinning` even on rows where the canonical name is "PS Whirl" (paradox + symposium + whirl), because the parse exposes the components.

---

## 9. Differentiation from Footbag.org / FootbagMoves

The strategic point of this proposal: **what we offer that the source corpora do not is structural intelligence.**

| Surface | Footbag.org | FootbagMoves | IFPA (post-grammar) |
|---|---|---|---|
| Trick list | ~256 named tricks | ~569 named tricks | 144 active canonicals + parsed components |
| Notation | Stored as opaque text | Stored as opaque text | Raw + structured parse |
| Family grouping | Implicit (via name patterns) | Implicit | Explicit `core_family` + lineage graphs |
| Modifier composition | Hand-curated alt-name strings | Mostly absent | Derived from structural parse |
| ADD derivation | None | None | Computed + statused |
| Cross-family lenses | None | None | Faceted by role (set, rotation, modifier, surface) |
| QC tooling | None | None | Parser-coverage, ADD-conflict, policy-pending reports |
| Visual semantic highlighting | None | None | Token-span CSS roles |

The 144-canonical IFPA dictionary is intentionally smaller, but it's structurally richer. Adding FootbagMoves' 569 tricks via the reconciliation pipeline (which already has provisional candidate routing) lets us absorb the volume *without losing* the structural lens — every imported row gets parsed on ingestion.

---

## 10. Sequencing — proposed implementation phases

This is a multi-phase initiative; not a single sprint. Suggested ordering:

| Phase | Scope | Risk |
|---|---|---|
| **0. Schema migration** | Add the §4 columns to `freestyle_tricks`. Default NULL. No behavior change. | Low |
| **1. Parser MVP** | Implement §3 stages A–B against name-only input. Backfill `structural_parse_json` for rows with `category != 'modifier'`. No UI change yet. | Low |
| **2. ADD derivation + QC** | Implement §7. Generate the three QC reports. No UI change. | Low. Findings inform editorial work. |
| **3. Notation highlighting MVP** | Implement §5 on the trick-detail page. Disclosure-toggle gated. | Medium — CSS palette + accessibility review. |
| **4. Family-core lineage graph** | Implement §6.2 + §8.2. Family pages get a tree. | Medium — visualization design work. |
| **5. Faceted browse** | Implement §8.3 — role-token filters on `/freestyle/tricks?view=sets`. | Medium. |
| **6. Comparison + modifier layering** | §8.4–§8.5. Niche but pedagogically powerful. | Low priority; defer until the foundation lands. |
| **7. Re-parse on grammar upgrade** | Tooling for grammar-version-bump regenerations. Becomes important when the parser graduates beyond MVP. | Low priority initially. |

Phases 0–2 are foundational and unblock everything else. Phases 3+ are UI and can sequence independently based on editorial priority.

---

## 11. Risks + open questions

1. **Parser coverage on legacy rows.** Some canonical names are idiosyncratic (`bullwhip`, `nemesis`, `flog`) and won't decompose cleanly. Expected outcome: ~10-15% of rows will have `parse_confidence != exact`. Editorially acceptable; the parser doesn't gate any other behavior.
2. **Notation inconsistencies.** Jobs notation across sources varies in capitalization, bracket placement, abbreviations (`SAME` vs `S`). The `jobs_notation_normalized` column is the place to handle this without touching `jobs_notation_raw`.
3. **Policy-dependent ADD weights.** Quantum, nuclear, backside, shooting, down-family — the `policy_dependent` status keeps these honest in the UI without forcing premature ratification. As Red rules on each, the bonus values get filled in and the affected rows automatically promote from `policy_dependent` to `exact`.
4. **Parser-grammar drift.** When the grammar evolves (new modifier, new role bucket), how do existing parses get re-evaluated? Solution: every parse carries `parser_version`; a regeneration script re-parses any row whose stored version is stale. The raw notation is the source of truth; parses are derived.
5. **JSON storage vs relational.** A future query pattern might want to enumerate "show me every distinct `modifier` token across the dictionary" — efficient via JSON1 in SQLite or via a derived `freestyle_trick_components` view. Defer the join-table modeling until the query proves out.
6. **Footbagmoves expansion.** ~569 tricks coming. With the parser in place, every imported row is structurally classified at ingest time. Without the parser, ingestion is a manual review burden.

---

## 12. What this proposal does not change

- **Existing canonical / alias / modifier tables.** Untouched.
- **CANONICALIZATION_POLICY.** Still authoritative for editorial decisions. The grammar is a representation layer, not a decision layer.
- **The reconciliation workbook.** Continues as the human review surface; the structural parse is a per-row attribute, not a separate workflow.
- **Adjudication workflow.** James's adjudication CSV → import script pipeline is unaffected. Newly-added canonicals get parsed on first DB-load just like existing ones.
- **Red's authority.** Every `policy_dependent` parse explicitly defers to Red. The grammar never "decides" what Red hasn't ratified.

---

## 13. Decision log (ratified 2026-05-09)

The five architectural decisions raised in the original proposal are resolved. Implementation can begin against this baseline.

### 13.1 Schema additions — APPROVED

Six new columns on `freestyle_tricks` (§4) approved. Foundational columns explicitly noted:

- `jobs_notation_raw` — historical/source evidence; never mutated
- `structural_parse_json` — the parse blob
- `computed_add_formula` — human-readable derivation
- `add_formula_status` — the four-state vocabulary

JSON-first storage approved at this stage, **explicitly deferring any join-table modeling**. The grammar is not yet stable enough to commit to relational decomposition; JSON1 indexes can serve early query patterns, and a `freestyle_trick_components` view can be added later if a query proves it out.

### 13.2 Phase ordering — APPROVED

Schema → parser MVP → QC tooling **before any UI work** (highlighting, lineage visualization, faceted browsing). Reasoning: building UI around unstable semantics is the inverse of what we want; the parse JSON must shape and stabilize before colors, trees, and filter chips depend on it.

### 13.3 Color palette — DEFERRED

Defer to phase 3 (highlighting MVP). Semantic stability matters more than visual polish at this stage. The placeholder palette in §5.1 is a starting point only; final colors will pass the CSS-token + accessibility review when phase 3 lands.

### 13.4 Core-family anchor list — PARTIAL

Confirmed anchors (9): `whirl`, `butterfly`, `mirage`, `illusion`, `osis`, `torque`, `drifter`, `barrage`, `legover`. See §6.1 for the table.

Pending Red review (5): `blur`, `blender`, `barfly`, `ripwalk`, and the stepping-* family. These currently sit in `trick_family` but their core-anchor status is uncertain — they may prove to be compound-derived rather than independent cores. Lineage-graph rendering and "core family" parser semantic should be cautious about treating them as anchors until Red rules.

This is the most philosophically important unresolved area because it determines: lineage trees, structural inheritance, parser grouping, related-trick generation, and the meaning of "family" across the dictionary. A future Red-followup packet should request the rulings.

### 13.5 Four-state ADD formula vocabulary — LOCKED

`exact` / `approximate` / `unresolved` / `policy_dependent` — all four kept distinct (§7.2). Do not collapse. Rationale recorded in §7.2: `policy_dependent` is semantically not a parser failure — it's a Red/ontology question, fundamentally different from a parser-coverage gap. Conflating them would obscure what's actionable where.

---

**Implementation now unblocked for Phase 0** (schema migration) and **Phase 1** (parser MVP). Phase 2 (ADD derivation + QC) follows. UI phases (3–6) wait until the structured layer stabilizes. The pending core-family ratifications (§13.4) do not block Phase 0–2; the parser can run with the 9 confirmed anchors and the 5 candidates flagged in `additive_flags: [core_family_candidate_pending_red]` for re-evaluation later.

---

**Cross-references:**

- `legacy_data/inputs/curated/tricks/CANONICALIZATION_POLICY.md` — editorial authority on canonical/alias/modifier rules.
- `.claude/skills/footbag-freestyle-dictionary/SKILL.md` — domain rules: stall ontology, surging modeling, direction-as-structural.
- `.claude/skills/freestyle-dictionary-surface/SKILL.md` — disclosure model, alias 5-category taxonomy, "ontology is the joint model".
- `legacy_data/reports/freestyle_dict_coverage_diff.csv` — the reconciliation lens this grammar enriches.
- `legacy_data/scripts/build_structural_alias_adjudication.py` — adjudicator that the parser eventually subsumes.
