# OPERATIONAL_NOTATION_STYLE_GUIDE

**Project:** DICTIONARY-SYMBOLIC-CARD-1 — Task D
**Scope:** A stable style guide for operational notation rendered on the symbolic dictionary card. Normalises bracketing, casing, dex wording, spacing, sequence operators, catch notation, body modifiers, and special-case vocabulary (paradox / symposium / spin / ducking / whirl / swirl / butterfly-wing).
**Companion docs:** [`SYMBOLIC_CARD_SPEC.md`](./SYMBOLIC_CARD_SPEC.md) consumes the conventions here. [`NOTATION_LAYER_STRATEGY.md`](./NOTATION_LAYER_STRATEGY.md) defines the layer that operational notation occupies. [`NOTATION_SURFACE_AUDIT.md`](./NOTATION_SURFACE_AUDIT.md) maps the current state.
**Out of scope:** Auto-generation, parser modification, schema changes, data backfill. This document specifies the *target* style for human-authored or pipeline-generated operational notation. Existing rows in the `operational_notation` column are not retroactively rewritten by this document; they are evaluated against it for future normalisation phases.

---

## 1. Sources of authority

The conventions below derive from four sources, weighted in this order:

1. **The existing `operationalNotationRendering.ts` tokenizer.** It already accepts a defined vocabulary: 9 token roles (surface, side, direction, body_action, rotation_variant, component_flag, sequence_op, pre_state, unknown), bracketed component flags, parenthesised pre-state flags, multi-word fusions (`FRONT WHIRL` / `BACK SWIRL`), and sequence operators `>` / `>>`. This is the **authoritative grammar** any style guide must match.
2. **The James-shorthand conventions** documented in past pt-rulings and SCALE memos (e.g., `[set]>hippy in dex>op toe` style; lowercase tokens; `>` as sequence operator).
3. **PassBack notation** as captured in the PassBack glossary intake (240-row trick staging + 180-term glossary). PassBack-style examples lean toward longer prose-shaped operational strings.
4. **FootbagMoves notation** as captured in `FM_MATH_DIVERGENCES.csv` and the FootbagMoves federation track. FM-style tends to be more compact.

When sources disagree, the tokenizer's grammar wins (the system has to parse it). The style guide accommodates the tokenizer first, then aligns the other sources to it.

---

## 2. Token vocabulary (canonical)

All token vocabulary is normalised lowercase except for **bracketed component flags**, which are uppercase per the existing `operationalNotationRendering.ts` register. The card's CSS owns visual styling; the notation string itself is lowercase / uppercase consistent regardless of display casing.

### 2.1 Surfaces

Plant or landing surfaces. Render in brackets when used as the entry point; render unbracketed otherwise.

| Token | Meaning | Render |
|---|---|---|
| `[clip]` | Entry: clipper stall (plant on clipper surface) | bracketed entry |
| `[toe]` | Entry: toe stall (plant on toe surface) | bracketed entry |
| `[set]` | Entry: generic set (when entry surface is unspecified) | bracketed entry |
| `clipper`, `clip` | Landing or pass-through clipper surface | unbracketed |
| `toe` | Landing or pass-through toe surface | unbracketed |
| `inside`, `outside` | Other named delay surfaces (rare in operational notation) | unbracketed |

**Rule:** A trick's operational notation begins with exactly one bracketed entry surface in brackets: `[clip]`, `[toe]`, or `[set]`. The remainder of the notation is unbracketed surface references.

### 2.2 Sides

| Token | Meaning | Casing |
|---|---|---|
| `ss` | Same side as plant foot | lowercase |
| `op` | Opposite side from plant foot | lowercase |

**Rule:** Side flags precede the move they modify, separated by a space: `ss clipper`, `op toe`, `op in dex`.

### 2.3 Directions

| Token | Meaning |
|---|---|
| `in` | Inward arc (bag toward body) |
| `out` | Outward arc (bag away from body) |

**Rule:** Direction modifies a dex word; written before `dex`: `in dex`, `out dex`. Direction may also modify rotation tokens — see §2.6.

### 2.4 Body modifiers (single-token)

| Token | Body region | Casing |
|---|---|---|
| `spinning` | Full-body rotation | lowercase |
| `gyro` | Half-body rotation (180°) | lowercase |
| `paradox` | Hip pivot between two dexes | lowercase |
| `symposium` | No-plant support-leg | lowercase |
| `ducking` | Head dip — head toward bag, bag opposite | lowercase |
| `diving` | Head over and under bag, bag same side | lowercase |
| `weaving` | Head toward bag, bag same side | lowercase |
| `zulu` | Head over and under bag, bag opposite | lowercase |
| `stepping` | Foot relocation | lowercase |
| `pixie` | Set modifier (compressed pre-base form) | lowercase |
| `atomic` | Set modifier (atomic x-dex pre-base) | lowercase |
| `nuclear` | Compound set modifier (paradox + atomic) | lowercase |
| `quantum` | Compressed atomic set | lowercase |
| `furious` | +2 set modifier | lowercase |

**Rule:** Body modifiers are space-separated tokens. Multiple body modifiers stack left-to-right in the order they apply structurally: `spinning paradox symposium whirl` (each modifier applies before the next).

### 2.5 Body actions (operational-only)

These appear in operational notation as physical actions, not modifiers. They are emitted by the tokenizer with role `body_action`.

| Token | Meaning |
|---|---|
| `spin` | Body rotation (when describing the physical action vs the named modifier `spinning`) |
| `duck` | Head dip action |
| `dive` | Head over-and-under action |

**Rule:** Operational notation MAY use either the modifier form (`spinning`, `ducking`) or the action form (`spin`, `duck`) depending on what the notation is emphasising. The tokenizer accepts both. For consistency on cards, prefer the **modifier form** unless the surrounding context makes the action form clearer.

### 2.6 Rotation tokens and rotational variants

| Token | Meaning |
|---|---|
| `whirl` | Single-rotation dex (the whirl topology) |
| `swirl` | Mirror-rotation dex |
| `front whirl` | Forward-facing whirl (multi-word fusion) |
| `back whirl` | Backward-facing whirl (multi-word fusion) |
| `front swirl` | Forward-facing swirl (multi-word fusion) |
| `back swirl` | Backward-facing swirl (multi-word fusion) |

**Rule:** Multi-word fusions are **atomic tokens**. They MUST NOT wrap mid-fusion on the card. The tokenizer emits them as single token spans; CSS gives them `white-space: nowrap`.

### 2.7 Sequence operators

| Token | Meaning |
|---|---|
| `>` | Minor sub-step boundary (continuous flow) |
| `>>` | Major step boundary (often a no-plant break or beat change) |

**Rule:** Sequence operators sit between tokens, surrounded by single spaces: `[clip] > op in dex > butterfly wing > ss clipper`. The card CSS may visually mute them; the notation string treats them as bare characters.

### 2.8 Pre-state flags

| Token | Meaning |
|---|---|
| `(back)` | Backward direction of next body action |
| `(front)` | Forward direction of next body action |
| `(no plant while)` | Support leg does not plant during next segment |
| `(rooted)` | Held / rooted position; no plant |

**Rule:** Pre-state flags are parenthesised, lowercase, immediately precede the move they modify, and are space-separated from it. `(no plant while) spin [BOD]`.

### 2.9 Component flags (bracketed, uppercase)

| Token | Meaning |
|---|---|
| `[DEX]` | Dexterity component |
| `[DEL]` | Delay component (typically end of operational string) |
| `[BOD]` | Body-position component |
| `[XBD]` | Cross-body component |
| `[PDX]` | Paradox component (equivalent to `paradox` modifier) |
| `[XDEX]` | X-Dex component |

**Rule:** Component flags are bracketed, UPPERCASE. They follow the token they annotate, space-separated: `op clipper [DEL]`, `(back) spin [BOD]`. Multiple flags on a single token stack: `op toe [DEL] [XBD]`.

### 2.10 Dex words

A dexterity (foot circling the bag) is rendered as **`dex`** preceded by side and/or direction flags. The composition follows:

```
<side?> <direction?> dex
```

Examples:

- `op in dex` — opposite-side inward dex (Mirage's classic)
- `op out dex` — opposite-side outward dex
- `ss dex` — same-side dex (no direction; defaults expected from context)
- `dex` — unspecified side/direction (rare on canonical operational notation)

**Rule:** The bare `dex` word is the canonical dex token. The phrase `op in dex` is a 3-token sequence, not a fused token. The renderer applies single-space separation; the words remain individually tokenised.

---

## 3. Cross-source mapping (when other notation systems use different vocabulary)

The four source systems sometimes use different surface strings for the same operational move. The style guide normalises:

| Concept | James shorthand | PassBack | FM | This system (canonical) |
|---|---|---|---|---|
| Inward dex on opposite side | `op in dex` | (`hippy in` in some readings) | (varies) | `op in dex` |
| Clipper-stall entry | `[clip]` | `clip` or `clipper` | `clipper` | `[clip]` |
| Toe-stall entry | `[toe]` | `toe` | `toe` | `[toe]` |
| Generic set entry | `[set]` | `set` | (often omitted) | `[set]` |
| Paradox modifier | `paradox`, `PDX` | `paradox` | `paradox` | `paradox` (modifier) / `[PDX]` (flag) |
| Spinning | `spinning` | `spin` or `spinning` | `spinning` | `spinning` (modifier) / `spin` (action) |
| Same side | `ss` | `same`, `same side` | `ss` | `ss` |
| Opposite side | `op` | `opposite`, `op`, `far` | `op` | `op` |
| Symposium | `symposium` | `symp` (rare) | `symposium` | `symposium` |
| No-plant qualifier | `(no plant while)` | "no plant" prose | (varies) | `(no plant while)` |
| Same-direction whirl | `front whirl` | `front whirl` | `whirl` | `front whirl` |

**Rule for the data:** When transcribing or normalising operational notation from external sources, prefer the canonical form on the right. The mapping is one-way: the canonical form may render as `op` even when the source used `opposite`.

---

## 4. Worked examples (the normalisation goal)

These are the target operational-notation strings for the trick set the user named:

### 4.1 Base tricks

| Trick | ADD | Operational notation (normalised) |
|---|---|---|
| Mirage | 2 | `[set] > op in dex > op toe` |
| Whirl | 3 | `[clip] > front whirl > ss clipper` |
| Butterfly | 3 | `[clip] > butterfly wing > ss clipper` |
| Osis | 3 | `[set] > op in dex > op clipper` |
| Torque | 4 | `[clip] > ss miraging op osis` |

### 4.2 Compound tricks

| Trick | ADD | Operational notation (normalised) |
|---|---|---|
| Ripwalk | 4 | `[clip] > op in dex > butterfly wing > ss clipper` |
| Dimwalk | 4 | `[clip] > pixie > butterfly wing > ss clipper` |
| Phoenix | 5 | `[clip] > pixie > duck > butterfly wing > ss clipper` |
| Montage | 7 | `[clip] > spinning > ducking > paradox symposium whirl > ss clipper` |
| Blender | 4 | `[set] > whirling op osis` |
| Mobius | 5 | `[clip] > spinning > ss miraging op osis` |

### 4.3 Reading the examples

The compound notation reads left-to-right as a structural sentence:

```
RIPWALK
[clip]    > op in dex      > butterfly wing > ss clipper
 ^         ^                 ^                 ^
 entry     uptime dex        downtime base     catch
```

```
MONTAGE
[clip] > spinning > ducking > paradox symposium whirl > ss clipper
 ^      ^          ^          ^                          ^
 entry  body mod   body mod   compound base + modifiers   catch
```

Each `>` operator marks a structural boundary. The reader can scan the operator separators and see how many structural beats the trick has.

---

## 5. Bracket usage rules

| Bracket type | Used for | Position | Example |
|---|---|---|---|
| Square brackets `[ ]` | Entry surface (one per notation) | First token | `[clip]`, `[toe]`, `[set]` |
| Square brackets `[ ]` | Component flags (uppercase) | Trailing on the token they annotate | `[DEX]`, `[DEL]`, `[BOD]`, `[XBD]`, `[PDX]`, `[XDEX]` |
| Parentheses `( )` | Pre-state flags (lowercase) | Preceding the move they modify | `(no plant while) spin [BOD]`, `(back) spin [BOD]` |
| Curly braces `{ }` | (reserved; not used) | — | — |
| Angle brackets `< >` | (reserved; sequence operator characters are `>` not bracket pairs) | — | — |

**Rule:** The notation never combines bracket types on a single token. `[clip](rooted)` is not legal; render as `(rooted) [clip]` (which is also non-standard since clip is an entry — but the rule is: brackets are exclusive per token).

---

## 6. Casing rules

| Element | Casing | Why |
|---|---|---|
| Surfaces, modifiers, sides, directions, body actions, sequence operators, multi-word fusions | lowercase | Visual quietness; the reading is about composition, not emphasis |
| Component flags (bracketed) | UPPERCASE | Visual distinction from inline tokens; flags are *labels* on tokens, not tokens themselves |
| Trick name (when used inline as a base reference) | lowercase | Operational notation is a structural reading; the trick name in this context is a structural component (`butterfly`, `whirl`, `clipper`), not a name |

**Card-level casing:** The card title slot (trick name) is rendered display-cased per `SYMBOLIC_CARD_SPEC.md` §4 (uppercase or title-case). The operational notation slot below is lowercase per these rules. The casing difference reinforces the title-vs-notation distinction.

---

## 7. Spacing rules

- **Token separation:** single space between consecutive tokens. Never multiple spaces, never tab characters.
- **Around sequence operators (`>`, `>>`):** single space on each side. `[clip] > ...`, never `[clip]>...`.
- **Around bracketed tokens:** single space before and after. `op clipper [DEL]`, never `op clipper[DEL]`.
- **Around parenthesised tokens:** single space before and after. `(back) spin`, never `(back)spin`.
- **Inside brackets / parentheses:** no padding spaces. `[clip]`, not `[ clip ]`.
- **Inside multi-word fusions:** single space (the fusion is `front whirl`, not `front  whirl` or `frontwhirl`).
- **Trailing whitespace:** never. Notation strings end at the last token character.

---

## 8. Catch notation

The trailing token of an operational notation typically describes where the trick lands. Conventions:

| Catch pattern | Meaning |
|---|---|
| `ss clipper` | Same-side clipper-stall landing |
| `op clipper` | Opposite-side clipper-stall landing |
| `ss toe` | Same-side toe-stall landing |
| `op toe` | Opposite-side toe-stall landing |
| `ss clipper [DEL]` | Same as `ss clipper`, with explicit delay-component flag |

**Rule:** The catch is the last token block of the notation. It is NOT bracketed (the entry is the bracketed element). When emphasising the delay role explicitly, append `[DEL]`.

---

## 9. Body-modifier composition rules

When multiple body modifiers stack on a base, order them in structural application order: **set modifiers first, then body modifiers, then the base, then the catch.** Within body modifiers, the convention is typically:

```
spinning > paradox > ducking > symposium > <base>
```

This is **not** strictly enforced grammar — community notation orders modifiers in different ways. The style guide recommends the order above when authoring fresh notation but accepts existing variant orderings as valid.

### 9.1 Paradox notation

`paradox` is a body modifier (lowercase). The component flag `[PDX]` is its operational equivalent.

- When the modifier *name* appears: `paradox` (as in `paradox symposium whirl`).
- When emphasising the operational *component*: `[PDX]` (as a flag on a dex token: `op dex [PDX]`).

These are alternative renderings of the same body action.

### 9.2 Symposium notation

`symposium` is a body modifier (lowercase). No bracketed flag form is in canonical use; the modifier name suffices.

- `paradox symposium whirl` reads as: paradox + symposium applied to the whirl base, in that order.
- The pre-state qualifier `(no plant while)` may appear alongside symposium to make the no-plant nature operationally explicit, but `symposium` alone implies it.

### 9.3 Spin notation

Two forms cohabit:

- **Modifier form (`spinning`)**: appears as a body modifier in a sequence; e.g., `spinning whirl`, `[clip] > spinning > whirl > ss clipper`.
- **Action form (`spin`)**: appears as a discrete body action in operational notation, often with a pre-state qualifier; e.g., `(back) spin [BOD]` reads as "perform a backward body spin at this moment, with BOD flag."

Use the **modifier form** when the spin is integral to a compound; use the **action form** when describing a discrete operational beat.

### 9.4 Ducking notation

Ducking has both a modifier form and an action form, parallel to spinning:

- **Modifier form (`ducking`)**: `ducking butterfly`, `[clip] > ducking > butterfly wing > ss clipper`.
- **Action form (`duck`)**: `duck [BOD]` or `(front) duck [BOD]`, used when the operational notation emphasises the discrete head-dip action.

The four-way head-motion siblings (`ducking` / `weaving` / `diving` / `zulu`) all admit modifier forms; only `duck` and `dive` have widespread action-form usage.

### 9.5 Whirl / swirl special handling

- `whirl` and `swirl` are **rotation tokens**, not modifiers. They appear in operational notation as base-trick references.
- The multi-word fusions `front whirl`, `back whirl`, `front swirl`, `back swirl` are **rotation variants** — they describe the rotational direction. The tokenizer treats them as atomic.
- When `whirl` appears alone (e.g., `[clip] > spinning > whirl > ss clipper`), the direction is left implicit. The card may show either form; both are legal.

### 9.6 Butterfly-wing representation

- `butterfly wing` is a multi-word fusion describing the **wing-motion dex** that defines the butterfly base.
- It appears in operational notation as `butterfly wing` (lowercase, space-separated, atomic at render).
- The trick *name* `butterfly` (when used as a structural reference) is also valid: `[clip] > stepping > butterfly > ss clipper`. The fusion form `butterfly wing` is more operationally specific — it names the dex shape, not just the trick.
- Convention: use `butterfly wing` when the operational notation is emphasising the wing-motion mechanic; use `butterfly` when the notation refers to the butterfly base trick as a structural component.

---

## 10. Common authoring mistakes (and corrections)

| Authored (wrong) | Corrected |
|---|---|
| `[clip] >op in dex>butterfly wing>ss clipper` | `[clip] > op in dex > butterfly wing > ss clipper` (spacing) |
| `[CLIP] > op in dex > butterfly wing > SS clipper` | `[clip] > op in dex > butterfly wing > ss clipper` (lowercase) |
| `[clip] > Op In Dex > Butterfly Wing > SS Clipper` | `[clip] > op in dex > butterfly wing > ss clipper` (lowercase) |
| `[clip] > op-in-dex > butterfly-wing > ss-clipper` | `[clip] > op in dex > butterfly wing > ss clipper` (space, not hyphen) |
| `[clip]>op in dex>butterfly-wing>ss clipper` | `[clip] > op in dex > butterfly wing > ss clipper` (consistent space + space-fusion) |
| `clip > op in dex > butterfly wing > ss clipper` | `[clip] > op in dex > butterfly wing > ss clipper` (bracket the entry) |
| `[clip] > op-dex > butterfly > clipper` | `[clip] > op in dex > butterfly wing > ss clipper` (direction in dex; fusion in base; explicit catch side) |

---

## 11. Notation hygiene checklist (for curator review)

Before saving a new operational notation row, verify:

- [ ] Begins with exactly one bracketed entry surface (`[clip]`, `[toe]`, or `[set]`)
- [ ] All sequence operators (`>`, `>>`) have a single space on each side
- [ ] All multi-word fusions are lowercase and space-separated (`front whirl`, `butterfly wing`)
- [ ] All component flags are bracketed UPPERCASE (`[DEX]`, `[DEL]`, `[BOD]`, `[XBD]`, `[PDX]`, `[XDEX]`)
- [ ] All pre-state qualifiers are lowercase parenthesised (`(back)`, `(no plant while)`)
- [ ] All side flags are `ss` or `op` (never `same`, `opposite`, `near`, `far`)
- [ ] Direction flags are `in` or `out` (never `inward`, `outward`)
- [ ] Catch is the last token block; bracketed only with `[DEL]` if emphasising delay role
- [ ] No trailing whitespace; no double spaces; no tab characters
- [ ] The notation tokenizes cleanly via `operationalNotationRendering.ts` (no `unknown`-role tokens unless intentional)

---

## 12. What this guide does NOT do

- Does not auto-generate operational notation from semantic notation (future feature)
- Does not auto-rewrite existing rows in `operational_notation` (curator-led migration; later phase)
- Does not propose new component flags or token types beyond those the tokenizer already accepts
- Does not change `operationalNotationRendering.ts` tokenizer logic (the grammar is owned there; this guide aligns to it)
- Does not specify card-level visual styling (that's `SYMBOLIC_CARD_SPEC.md`)
- Does not change the parser or the semantic-notation tokenizer (`notationRendering.ts`)

---

## 13. Future evolution

- **Codify the style guide as a linter:** a small script that scans `operational_notation` rows and flags violations. Output: a CSV report identical in form to the existing alias-resolution / family-coherence audits. Not in Batch 1.
- **Curator UI for normalisation:** an admin surface that surfaces non-conformant rows and offers one-click corrections. Not in Batch 1.
- **Token-level link enrichment:** each token in a rendered notation could carry a `linkHref` to its glossary anchor or modifier-family page. The tokenizer would gain an optional `linkHref` field per token. Card consumes it (`SYMBOLIC_CARD_SPEC.md` §7). Not in Batch 1.
- **Compressed operational forms:** discussed in `NOTATION_LAYER_STRATEGY.md` §7. Out of scope here.

---

## 14. Constraints honoured

- No canonical-data mutation
- No tokenizer changes
- No parser changes
- No ADD changes
- No ontology changes
- No alias insertion
- No auto-generation
- The existing `operationalNotationRendering.ts` grammar is the authoritative source; this guide aligns to it

---

## 15. Cross-references

- `SYMBOLIC_CARD_SPEC.md` — visual realisation of the operational notation on cards (Task B)
- `NOTATION_LAYER_STRATEGY.md` — the layer that operational notation occupies (Task C)
- `NOTATION_SURFACE_AUDIT.md` — current-state surface map (Task A)
- `src/services/operationalNotationRendering.ts` — the authoritative tokenizer (Phase 6 + O1d)
- `scripts/parse_freestyle_notation.py` — the semantic parser (forever-rule §7; the operational notation here is separate)
- `feedback_parser_editorial_separation.md` — parser/editorial separation rule that this guide preserves
- `exploration/symbolic-grammar-2/symbolic_execution_patterns.csv` — movement-archetype rows that align with operational notation patterns

---

*End of OPERATIONAL_NOTATION_STYLE_GUIDE.md*
