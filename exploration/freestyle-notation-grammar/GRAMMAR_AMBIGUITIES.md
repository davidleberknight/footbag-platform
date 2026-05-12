# GRAMMAR-GLOSSARY-1 — Grammar Ambiguities

Observational catalog of grammar ambiguities, unresolved operators, implicit ADD-bearing signals, and recursive set-inheritance patterns surfaced during the symbolic-grammar layer build (SYMBOLIC-GRAMMAR-1) + the core-trick symbolic-table authoring (GRAMMAR-GLOSSARY-1). No IFPA correlation; no parser change; no dictionary mutation.

**Date:** 2026-05-12
**Status:** observational; companion to `GRAMMAR_GLOSSARY_V3.md` + the three CSV registries.

---

## 1. Grammar ambiguities

Ambiguities in the symbolic notation system where the same surface form can be read as multiple distinct mechanical actions, or where adjacent tokens lack a clear precedence rule.

### 1.1 `Same or Op Out` (early bracketed-style notation)

Surface form: `SET > SAME or OP OUT [DEX] > OP CLIP [XBD] [DEL]` (Butterfly's bracketed notation form).

The `Same or Op` construction implies the trick can be executed on either side; canonical execution is implementation-dependent. Parser currently treats the post-`or` branch as primary and flags the pre-`or` branch as `alt-side:` metadata. No structural rule distinguishes which side is canonical for the row's identity.

**Open question:** does the `or` connector imply (a) the trick has two canonical execution forms with identical ADD value, (b) one form is canonical and the other is a non-distinguished variant, or (c) the `or` is shorthand for "the execution can mirror either side without changing the trick"?

### 1.2 `XDEX` flag scope

Per pt1 Red ruling, XDEX is narrow ("specific tricks only"; named exemplar = Atomsmasher). FM operational notation applies XDEX broadly (83 occurrences across the corpus). The XDEX flag's semantic content varies by reading:

- **IFPA narrow reading:** XDEX is a named exception that applies to a small list of compounds (atom-smasher canonical) and contributes +1 ADD only in those contexts.
- **FM broad reading:** XDEX marks any full-circle dex variant; appears widely across the corpus.

The symbolic-grammar additive heuristic treats XDEX as +1 universally (matching FM's broad reading); this produces 9 source-vs-derived ADD `-1` deltas relative to IFPA's narrow reading.

**No resolution available without Red pt-batch revisiting XDEX scope.**

### 1.3 `PDX` (paradox) independence test

Per task brief §4: "PDX = +1 only when clearly independent in the notation."

The "clearly independent" condition is undefined. PDX flag can appear:

- **Standalone on a beat:** `Op In (DEX)(PDX) > Op Toe (DEL)` — PDX as a distinct modifier on the dex moment.
- **Stacked with other flags:** `Op In (DEX)(XDEX)(PDX)(BOD)` — PDX inside a multi-flag stack where its independence is unclear.
- **On a body-action beat:** `(back) Spin (BOD)(PDX)` — PDX modifying a body action rather than a dex.

The symbolic-grammar additive heuristic treats PDX as +1 universally regardless of position; some rows surface as `-1` ADD deltas where source treats PDX as non-independent.

**Open question:** what observable test distinguishes "independent PDX" from "non-independent PDX"? Without an operational test, the heuristic over-counts.

### 1.4 `Front Whirl` / `Back Whirl` implicit ADD

The qualifier `Front Whirl` / `Back Whirl` / `Front Swirl` / `Back Swirl` appears alongside a DEX flag (e.g., `Op Front Whirl (DEX)`). Source-ADD math suggests the qualifier carries an implicit +1 not captured by the component flags alone:

- **Blaze** (`Clip > Op Front Whirl (DEX) >> Op In (DEX) > Op Toe (DEL)`): source ADD = 4, additive-heuristic = 3. The Front Whirl qualifier appears to add +1.
- **Furnace** (`Inside > Jump (BOD >> Same Back Swirl (DEX) > Same Dragon (XBD)(DEL)`): source ADD = 4, additive-heuristic = 3 (with the malformed `(BOD` paren causing extra noise).

**Open question:** is `Front/Back Whirl` a separate dex variant that contributes +1, or is the +1 carried by the rotational direction marker in some other structural way?

### 1.5 `UNS` (unusual surface) implicit ADD

Per task brief §4: "UNS = 0 (non-ADD per heuristic)."

But three observed UNS rows surface as `+1` source-vs-derived deltas (Buttersole, Ricochet, Singularity all read source=4 / heuristic=3). The unusual-surface delay surface appears to contribute +1 ADD in source ADDs despite being suppressed in the heuristic.

**Open question:** does an unusual-surface recovery (flapper / sole / cloud / head / knee) carry an implicit +1 ADD bonus relative to the standard toe/clipper recovery? Or is the +1 inherited from the more complex execution required for the non-standard surface?

### 1.6 Recursive set-name precedence

When a notation begins with a named canonical trick rather than a contact token (e.g., `Frigidosis > Same In (DEX) >> Op Out (DEX) > Op Clip (XBD)(DEL)` for Arcwalk), the leading token functions as the set-source for the continuing sequence. The parser currently flags such leading tokens as unresolved.

**Open question:** does the recursive set-name contribute its own ADD to the compound, or is its ADD already absorbed into the continuing notation? The observed examples (Dragon 8x, Frigidosis 3x) do not produce clear delta signals because the body-trick portion carries enough flags to cover the asserted ADD without the recursive prefix.

---

## 2. Unresolved operators

Operators that appear in operational notation but lack a fully-documented semantic.

### 2.1 `(rooted)` pre-state

Per pt8 Red ruling, `rooted` = 0-ADD set modifier. The operational notation `(rooted)` pre-state flag marks the trick as executed without a supporting-leg plant.

**Railwalk anomaly:** `Toe > (rooted) Same In (DEX)(BOD) > Op Out (DEX)` — source ADD = 6, additive-heuristic = 3. Largest single-row delta in the SYMBOLIC corpus (+3). Possibilities:

- The `(rooted)` pre-state carries far more implicit ADDs than pt8 0-ADD ruling would suggest.
- The notation is truncated (no final DEL / XBD); the asserted 6 includes implicit components beyond the visible flags.
- Source error on the asserted ADD.

**No resolution available without Red review of the rooted modifier's ADD contribution in multi-modifier contexts.**

### 2.2 `(no plant while)` semantics

Pre-state flag marking that the supporting leg does not plant during the next beat. Maps loosely to the IFPA `symposium` modifier (no-plant body frame).

**Open question:** is `(no plant while)` an operational-only annotation (FM-specific), or does it represent an IFPA-canonical modifier action that just doesn't appear in the IFPA modifier table under that name?

### 2.3 `OP` flag (when capitalized, in component-flag position)

Some bracketed-style notation rows show `[OP]` as a component flag (e.g., bracket variants of Butterfly). The parser currently treats it as a positional flag but its semantic is unclear.

**Open question:** does `OP` in the bracketed-style notation mean "operational" (i.e., the flag-stack is the operational-mechanics list rather than the structural-decomposition list), or is it a distinct semantic flag?

### 2.4 `Cross-body rake` / `XBD Rake`

Surface form: `Op XBD Rake (XBD)(DEL)(DEX)` (Sasquatch / Warlock). The `Rake` token combined with XBD prefix produces a contact action that the parser treats as unresolved.

**Open question:** is `Rake` an unusual-surface variant (rake foot surface), a body-action verb, or a recovery-surface descriptor?

### 2.5 `dragon` / `frigidosis` as substructure markers

Per §1.6 above. The recursive set-name pattern uses canonical trick names as substructure positions. The current parser does not dispatch into nested sub-parsing.

**Open question:** are these recursive references intended to be substituted with the referenced trick's full operational notation, or do they function as opaque named-component markers?

---

## 3. Implicit ADD-bearing signals

Mechanical or notational features that appear to contribute ADD value without being marked by an explicit component flag (DEX/DEL/BOD/XBD/PDX/XDEX).

### 3.1 Surface qualifier on dex (`Front Whirl` / `Back Swirl`)

Per §1.4. The whirl/swirl qualifier on a dex moment appears to carry an implicit +1. Not captured by additive heuristic.

### 3.2 Unusual surface recovery (UNS)

Per §1.5. Apparent +1 contribution on non-standard delay surfaces.

### 3.3 Pre-state escalation

Some pre-states (`(rooted)`, `(no plant while)`) may carry implicit ADDs beyond the +0 ruling for `rooted` or the structural mapping for `(no plant while)` to symposium. Railwalk's +3 delta is the load-bearing example.

### 3.4 Same-side execution direction (ss)

Per pt12 Red ruling 2026-05-11, ss = +0 universally. The observational symbolic-grammar layer respects this rule. However, 22 rows in `FM_MATH_DIVERGENCES.csv` carry `Nuclear ss X` / `Pixie ss X` patterns where FM's ADD math differs from IFPA's by ±1-2. The divergences are NOT due to ss contribution (Red confirmed ss=0); they are due to FM treating the modifier-on-modifier-compound as having different additivity than IFPA's modifier-table arithmetic.

**Already documented in `FM_MATH_DIVERGENCES.csv`; no new ambiguity surfaced here.**

### 3.5 Component-flag stacking precedence

When DEX + PDX + BOD + XDEX all stack on one beat, the order in which they fire (and whether all contribute additively) is not specified by any source. The symbolic-grammar additive heuristic treats each as independent +1. IFPA's modifier table applies bonuses by base-rotational-classification; the two readings can diverge on dense multi-flag beats.

---

## 4. Recursive set-inheritance patterns

Patterns where a canonical trick name appears as a substructure of another trick's notation. The body of the compound inherits the substructure trick's mechanics + ADDs implicitly.

### 4.1 Dragon-prefix family (8 rows)

Observed leading token: `Dragon` or `Same Dragon`. Examples include Dragonstein, several -dragon compounds. The `Dragon` substructure functions as the set-source: the rest of the notation continues from where Dragon's recovery would land.

**Open inheritance question:** does the body of the compound add to Dragon's ADD, or does the body replace Dragon's recovery beat?

### 4.2 Frigidosis-prefix family (3 rows)

Observed leading token: `Frigidosis`. The `Frigidosis` substructure functions as set + first-segment; the body continues from Frigidosis's natural continuation point.

**Open inheritance question:** Frigidosis itself is a non-pilot, Red-deferred trick (per pt11 deferral). Its decomposition is unresolved; using it as a substructure prefix is unresolved-on-unresolved.

### 4.3 Potential future patterns

The recursive-set-name pattern may extend to other named substructures (smoke-prefix, paste-prefix, etc.) as the FM corpus grows. The current parser treatment (flagging the leading token as `unresolved`) is conservative; a future parser revision could dispatch into nested sub-parsing if the inheritance contract is documented.

**No resolution available without curator definition of the inheritance contract.**

---

## 5. Cross-references

- `CORE_TRICK_SYMBOLIC_TABLE.csv` — 12-row canonical symbolic-notation table (James's shorthand style)
- `SYMBOLIC_FAMILY_REGISTRY.csv` — symbolic-family classification (40 families across 6 axes)
- `SYMBOLIC_DECOMPOSITION_REGISTRY.csv` — equivalence-family clustering
- `GRAMMAR_GLOSSARY_V3.md` — companion glossary rebuild
- `exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_ANALYSIS.md` — parser-pass insights driving these ambiguities (XDEX, UNS, Whirl/Swirl qualifier deltas)
- `exploration/footbagmoves-federation/OPERATIONAL_NOTATION_GRAMMAR.md` — F0 reconnaissance grammar; token inventory source
- `exploration/footbagmoves-federation/FM_MATH_DIVERGENCES.csv` — 22 rows of federation_math_divergence entries (FM-IFPA ADD-math disagreements; ss-related cases pt12-resolved)
- `feedback_parser_editorial_separation.md` — three-layer separation forever-rule (extended to four with observational-symbolic layer)
- `feedback_public_facing_prose.md` — prose hygiene (this document is observational/non-public; rule does not apply)

---

## 6. Constraint check

| Constraint | Status |
|---|---|
| Zero ontology mutation | ✓ (no DB writes; no dictionary changes) |
| Zero parser replacement | ✓ (existing parser unchanged; new ambiguities catalogued, not fixed) |
| Zero ADD rewrites | ✓ (all ADD values cited from existing data) |
| Zero alias insertion | ✓ (no alias-row changes) |
| Glossary remains editorial / non-authoritative | ✓ (this file + GLOSSARY_V3 are observational) |
| 4-layer separation preserved | ✓ (parser / editorial / operational / observational-symbolic) |
