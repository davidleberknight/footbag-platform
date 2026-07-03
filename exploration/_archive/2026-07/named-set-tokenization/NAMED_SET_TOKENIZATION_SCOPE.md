# Named-Set Tokenization - Cohort Scope

Read-only scope. Defines the tokenization and verification model for the resolved-but-deferred named-set cohort before any notation is written. No red_corrections, tests, notation, or doctrine changes. One cohort-wide decision; railing, surfing, and furious are not solved separately.

## 1. The named-set operators
railing, surfing, furious. Each is a *set primitive* whose ADD comes from a named set definition, not from visible bracket tokens.

## 2-3. ADD contribution and source of truth
| set | ADD | composition | source of truth |
|---|---|---|---|
| railing | **2** | rooted sailing (sailing carries two) | Set Encyclopedia entry "Railing (rooted sailing)" / "Sailing carries two, so Railing contributes 2"; Holden compilation (2003); corroborated by additions `adds` + resolved-formulas derivation |
| surfing | **3** | fairy + no-plant symposium + swirling | trick descriptions ("surfing set: fairy, no-plant symposium, swirling") + expanded resolved-formulas notation; **no formal Set Encyclopedia entry yet (gap)** |
| furious | **2** (rotational) / 1 (non-rotational) | composite-derived | the furious set primitive's own description ("+1 ADD non-rotational / +2 ADD rotational"); additions provenance ("furious(2)"); all 6 cohort tricks read at +2 |

Source-of-truth order: **Set Encyclopedia (content layer) is authoritative**, corroborated by the explicit additions `adds` value, the resolved-formulas derivation, and provenance notes. Red corrections do not hold these (notation deferred).

## 4. Notation form
The content layer already uses the `(X set) >>` shorthand for 7 of the 10 (dorshanatrix, flying-fish, rail-warrior, clown-face, genesis, nebula, rage) and a spelled-out expanded form for the other two (big-papa-smurf, fury). Evaluated:
- `(railing set) >> <base>` - readable, links the Set Encyclopedia, but the `(railing set)` token carries no brackets, so it breaks `bracket_count == ADD`. **Already the dominant content-layer form.**
- `RAILING [SET] >> <base>` - a single bracket token for the set. Restores a bracket but a `[SET]` token is not ADD-bearing in the existing vocabulary, and one `[SET]` cannot encode railing=2 vs surfing=3.
- `RAILING [BOD/SET?] >> <base>` - overloads `[BOD]`; conflates a body element with a set primitive; rejected.
- **Expanded**: spell the set out as its real bracket tokens (the Set Encyclopedia composition). `bracket_count == ADD` holds with no special token. **Already used for big-papa-smurf and fury.**

## 5-6. Bracket-counting / verification model
| option | model | readability | parser safety | ADD verification | encyclopedia consistency | one-off path |
|---|---|---|---|---|---|---|
| A | external: `named_set_value + bracket_count == ADD` | high (shorthand) | needs parser to recognize `(X set)` | needs a per-set value lookup table | high | **yes - a special verifier** |
| B | expanded brackets only: `bracket_count == ADD` | low (long, set spelled out every time) | high | standard invariant | medium (composition implicit) | no |
| C (hybrid) | shorthand for display + expanded for verification | high | high | standard invariant on the expanded form | high | **no** |

**Recommended: C (hybrid).** Each cohort trick carries two notations: `operationalNotation` = `(X set) >> <base>` (display, Set-Encyclopedia-linked) and `expandedNotation` = the set spelled out as brackets + the base (verification). Verification runs the **existing** `bracket_count(expandedNotation) == ADD` invariant - no new verification class - and the named-set value is only a cross-check. This is already precedented in the content layer (redwetter carries both `operationalNotation: (shooting set) >>` and `expandedNotation`).

## 7. Ten-row inventory
ADD frame: railing=2, surfing=3, furious=2. base ADDs in parentheses.

| slug | ADD | set | base | notation status | shorthand (display) | verification (expanded `bracket==ADD`) | risk |
|---|---|---|---|---|---|---|---|
| dorshanatrix | 5 | railing | mirage(2) | content shorthand; dict empty | `(railing set) >> SET > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]` | railing(2)+symposium(1)+mirage(2)=5 | LOW |
| flying-fish | 5 | railing | mirage(2) | content shorthand; dict empty | `(railing set) >> CLIP > DUCK [BOD] > OP IN [DEX] > OP TOE [DEL]` | railing(2)+ducking(1)+mirage(2)=5 | LOW |
| rail-warrior | 6 | railing | butterfly(3) | content shorthand; dict empty | `(railing set) >> CLIP > DUCK [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL]` | railing(2)+ducking(1)+butterfly(3)=6 | LOW |
| big-papa-smurf | 7 | surfing | blender(4) | content **expanded** only; dict empty | (derive `(surfing set) >>` shorthand) | surfing(3)+blender(4)=7; expanded already bracket-counts to 7 | MED (surfing encyclopedia gap) |
| clown-face | 5 | furious | eggbeater(3) | content shorthand; dict empty; **link gap** | `(furious set) >> TOE >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]` | furious(2)+eggbeater(3)=5 | MED (link gap + furious +1/+2) |
| furious | 2 | furious | furious(2) | the set primitive itself; no compound notation | n/a - this row IS the set definition | furious set = 2 (rotational) | SPECIAL |
| fury | 5 | furious | mirage(2) | content **expanded**; brackets=4 != 5 | `(furious set) >> CLIP > OP IN [PDX] [DEX] > OP TOE [DEL]` | furious(2)+paradox(1)+mirage(2)=5; **existing expanded under-counts (4) - reconcile** | MED (notation reconcile) |
| genesis | 5 | furious | whirl(3) | content shorthand; dict empty; **link gap** | `(furious set) >> SET > OP IN [DEX] > OP CLIP [XBD] [DEL]` | furious(2)+whirl(3)=5 | MED (link gap) |
| nebula | 5 | furious | double-leg-over(3) | content shorthand; dict empty; **link gap** | `(furious set) >> SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]` | furious(2)+dlo(3)=5 | MED (link gap) |
| rage | 5 | furious | mirage(2) | content shorthand; dict empty; **link gap** | `(furious set) >> SET > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]` | furious(2)+symposium(1)+mirage(2)=5 | MED (link gap) |

## 8. Link / data fixes (separate from notation)
- **furious modifier-link gap (already filed, DATA_FIX_modifier_link_gaps.md Fix 2):** 5 of 6 furious tricks (clown-face, furious, genesis, nebula, rage) carry "furious" in name/aliases but no `furious` link. `fury` has it.
- **railing / surfing:** confirmed **no analogous link gap** - all 4 link cleanly.
- **alias/name:** the furious cohort names/aliases are consistent ("furious X"); the link table is the only inconsistency. `furious` (the trick) is the set primitive, not a compound - it should not be auto-given a compound notation.

## 9. Recommendation

### Recommended notation model
**Hybrid (C):** `operationalNotation = (X set) >> <base>` for display + Set-Encyclopedia linkage; `expandedNotation` = the set's bracket composition + the base for verification.

### Recommended ADD verification model
Reuse the existing invariant on the expanded form: **`bracket_count(expandedNotation) == ADD`**. Cross-check (not the primary gate): `named_set_value[set] + bracket_count(base) == ADD`. No standalone verification path for the cohort; no per-operator special-casing.

### Smallest safe implementation sequence
1. **Formalize the set definitions** in the Set Encyclopedia: confirm railing=2 (exists), add surfing=3 (fairy+symposium+swirling), add furious=2-rotational and resolve the +1/+2 rule.
2. **Resolve the furious +1/+2 context question** (curator): confirm all 6 cohort tricks are rotational (+2).
3. **Apply the furious 5-link fix** (DATA_FIX Fix 2), reload-gated - independent of notation.
4. **Confirm the hybrid storage model** (operationalNotation + expandedNotation) for the dictionary, matching the redwetter precedent.
5. **Write all 10 in one pass** (both forms each), never one operator alone.
6. **One cohort test** (see below).

### Tests required
A single `named-set-cohort.test.ts`: for all 10, assert (a) `operationalNotation` opens with `(<set> set) >>` (except the `furious` set-primitive row), (b) `bracket_count(expandedNotation) == ADD`, (c) `named_set_value[set] + bracket_count(base) == ADD` as a cross-check. One test file, standard bracket invariant, no one-off path.

### Risks / unresolved curator questions
- **furious +1/+2 context-dependence** - the set primitive defines both; the model needs a rule for when each applies. All 6 cohort tricks currently read +2.
- **surfing lacks a formal Set Encyclopedia entry** - ADD=3 is inferred from descriptions and the expanded notation; formalize before publishing.
- **Content-layer inconsistency** - 7 shorthand vs 2 expanded; `fury`'s expanded form bracket-counts to 4 not 5. Reconcile to the hybrid model.
- **`furious` (the trick) is the set primitive** - decide whether it carries a notation at all or is encyclopedia-only.
- **Single-source (FootbagMoves), structure uncorroborated** across the whole cohort - publication is soft until corroborated.
- **All 10 are reload-gated** and notation-deferred until steps 1-4 are confirmed.
