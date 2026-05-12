# GRAMMAR-GLOSSARY-1 — Grammar Glossary v3

Observational glossary rebuild around symbolic-grammar primitives. Companion to `CORE_TRICK_SYMBOLIC_TABLE.csv`, `SYMBOLIC_FAMILY_REGISTRY.csv`, `SYMBOLIC_DECOMPOSITION_REGISTRY.csv`, and `GRAMMAR_AMBIGUITIES.md`.

**Status:** observational layer. **Non-authoritative.** Companion to the IFPA dictionary; NOT a replacement.

Canonical ADD values, trick structure, and modifier rules remain authoritative in the freestyle dictionary system (`freestyle_tricks`, `freestyle_trick_modifiers`). This glossary describes the observational symbolic-grammar surface — the layer that emerges from analyzing operational notation patterns across the FM/PassBack corpus.

**Constraints (hard):**
- Zero ontology mutation.
- Zero parser replacement.
- Zero ADD rewrites.
- Zero alias insertion.
- Glossary remains editorial / non-authoritative.
- 4-layer separation preserved: parser / editorial / operational / observational-symbolic.

**Date:** 2026-05-12
**Parent rebuild:** v2 = `docs/Freestyle_Footbag_Glossary.md` (run-quality + concept-level glossary). v3 = symbolic-grammar primitives at the operational + observational level.

---

## 1. Symbolic-notation shorthand (the format used in this glossary)

James-shorthand format (per the canonical example `mirage = [set]>hippy in dex>op toe`):

| Construction | Role | Notation example |
|---|---|---|
| `[pre-state]` | Pre-state in brackets — describes a body or set condition holding during the next beat | `[set]`, `[rooted]`, `[no plant while]` |
| `>` | Beat separator | `[set]>hippy in dex>op toe` |
| Token without prefix | The action or contact at that beat | `op toe`, `same clip`, `hippy in dex` |
| `(xbd)` / `(ss)` | Inline positional modifier | `op clip (xbd)`, `same toe (ss)` |
| Compound tokens | Multi-word actions | `front spin dex`, `leggy circle`, `under-foot scoop` |

The shorthand is INTENTIONALLY less detailed than FM's full operational notation (which uses parenthetical component flags DEX/DEL/BOD/XBD/PDX/XDEX). The shorthand drops flag-stacks in favor of named beats; reading order: `start contact > uptime mechanic > midtime body action > downtime dex > final contact`.

---

## 2. Contact surfaces

The fixed positions where the bag is set, plant, or recovered. All contact surfaces appear as start tokens, mid-trick stalls, or terminal delays.

### 2.1 Standard delay surfaces (foundational stalls)

| Surface | Symbolic token | Description |
|---|---|---|
| Toe | `toe` | Top of foot. Foundational 1-ADD delay surface; anchor for most operational-notation starts and finishes. |
| Clipper | `clip` (operational) / `clipper` (semantic) | Inside cross-body delay surface. Foundational 1-ADD. |
| Inside | `inside` | Inside-of-foot delay surface. Foundational 1-ADD. |
| Outside | `outside` | Outside-of-foot delay surface. Foundational 1-ADD. |
| Heel | `heel` | Heel delay surface. Foundational 1-ADD. |

### 2.2 Unusual delay surfaces (UNS family)

| Surface | Symbolic token | Description |
|---|---|---|
| Sole | `sole` | Sole-of-foot delay surface. Non-standard. |
| Knee | `knee` | Knee delay surface. Non-standard. |
| Head | `head` | Head delay surface. Non-standard. |
| Cloud | `cloud` | Back-of-shin delay surface. Non-standard. |
| Flapper | `flapper` | FM-canonical name for an unusual under-foot recovery surface. Non-standard. |
| Forehead | `forehead` | Forehead delay surface. Non-standard. |
| Shoulder | `shoulder` | Shoulder delay surface. Non-standard. |
| Neck | `neck` | Neck delay surface. Non-standard. |

**Observational note:** unusual-surface recoveries (UNS flag in FM operational notation) appear to carry an implicit +1 ADD relative to standard delay surfaces — see `GRAMMAR_AMBIGUITIES.md` §3.2.

### 2.3 Side modifier on contact

| Modifier | Symbolic token | Description |
|---|---|---|
| Same | `same X` | Contact on the same side as the supporting/plant foot. |
| Opposite | `op X` | Contact on the opposite side from the supporting/plant foot. |

---

## 3. Dex types

The how-and-where of the dex moment — the controlled-flick step where the foot interacts with the bag.

| Dex type | Symbolic token | Description | Anchor row |
|---|---|---|---|
| Hippy-in dex | `hippy in dex` | Hip-driven in-to-out dex flick. The foot reaches outside the supporting leg, the bag's path travels from inside to outside. | mirage |
| Hippy-out dex | `hippy out dex` | Hip-driven out-to-in dex flick. The foot reaches outside, the bag's path travels from outside to inside. Mirror of hippy-in. | illusion |
| Leggy pass | `leggy pass` | Leg-driven pass over the bag without completing a full circle. | legover |
| Leggy circle | `leggy circle` | Leg-driven full circle around the bag. | ATW (around-the-world) |
| Under-foot scoop | `under-foot scoop` | Foot reaches under the bag and lifts it from below. | pickup |
| Op-out dex | `op out dex` | Opposite-side outside dex flick. Wing-motion dex variant (butterfly canonical). | butterfly |
| Same-out dex | `same out dex` | Same-side outside dex flick. | barfly (double-loop with two same-out dexes) |
| Op-in dex | `op in dex` | Opposite-side inside dex flick. | atom-smasher (second dex moment) |
| Same-in dex | `same in dex` | Same-side inside dex flick. | barrage (mid-sequence dex) |
| Front spin dex | `front spin dex` | Rotational dex with body spinning forward. | whirl |
| Back spin dex | `back spin dex` | Rotational dex with body spinning backward. | swirl |
| Front whirl dex | `front whirl dex` | Whirl variant with forward direction. Carries implicit +1 ADD over base dex per observational analysis. | (compound; see Blaze) |
| Back swirl dex | `back swirl dex` | Swirl variant with backward direction. Carries implicit +1 ADD over base dex. | (compound; see Furnace) |
| Hippy-in osis dex | `hippy in osis dex` | Hippy-in dex variant extended into the osis pattern. | osis |

**Observational note:** `Front Whirl` / `Back Whirl` / `Front Swirl` / `Back Swirl` qualifiers on a dex flag appear to add +1 ADD beyond the bare DEX contribution — see `GRAMMAR_AMBIGUITIES.md` §1.4.

---

## 4. Uptime mechanics

The pre-peak phase of the trick: how the bag is set and how the kicking foot positions for the first dex.

| Mechanic | Symbolic token | Description |
|---|---|---|
| Set | `[set]` | Generic set surface (bracketed pre-state). Used when the operational notation does not specify the set's contact surface. |
| Toe set | `toe` (as leading token) | Set executed on a toe-stall plant. Most common in operational notation. |
| Clipper set | `clip` (as leading token) | Set executed on a clipper-stall plant. Second-most common. |
| Same-side uptime | `[set]>same X` | First post-set beat on the same side as the supporting foot. Often appears with `(no plant while)` in symposium-style rows. |
| Opposite-side uptime | `[set]>op X` | First post-set beat on the opposite side. Standard direction-cross pattern. |

### 4.1 Uptime dex slots

The CORE_TRICK_SYMBOLIC_TABLE classifies uptime dex slots as `uptime_dex_1` + `uptime_dex_2`. The first uptime dex is the initial bag-foot interaction post-set; the second (when present) chains directly without a body action between them.

---

## 5. Midtime mechanics (body actions)

The peak / hangtime phase: body actions executed at or near the apex of the bag's path.

| Body action | Symbolic token | Description | Anchor cohort |
|---|---|---|---|
| Spin | `spin` | Body rotation in place. Most common midtime action. | spin-family (115 rows in FM corpus) |
| Duck | `duck` | Duck body action (compress under the bag's path). | duck-family (39 rows) |
| Dive | `dive` | Forward-downward dive action. | dive-family (10 rows) |
| Back spin | `[back] spin` | Spin with backward directional orientation. | back-spin compounds |
| Front spin | `[front] spin` | Spin with forward directional orientation. | front-spin compounds |
| No plant while X | `[no plant while] X` | Pre-state: support leg held off-ground during the next beat. Maps loosely to IFPA symposium modifier. | symposium-family pilots |
| Rooted X | `[rooted] X` | Pre-state: held position; no support-leg plant. Per pt8 Red ruling, rooted = 0 ADD set modifier. | rooted-pre-state cohort (3 rows) |

---

## 6. Downtime mechanics

The post-peak / recovery phase: any dex flicks immediately preceding the final contact, plus the terminal delay itself.

| Mechanic | Symbolic token | Description |
|---|---|---|
| Downtime dex | `op X dex` / `same X dex` | A dex flick that occurs after the midtime body action (when one is present). Distinguished from uptime dex by position. |
| Terminal contact | `op toe` / `same clip` / `op flapper (uns)` / etc. | The final beat. Marks the trick's recovery; carries the implicit DEL marker in FM operational notation. |
| Cross-body recovery | `op clip (xbd)` / `same clip (xbd)` | Terminal contact on the opposite side from the plant, with cross-body flag. |

**Observational note:** uptime vs downtime dex classification is heuristic — the symbolic-grammar parser splits dex beats by body-action position (any dex before the first body-action beat = uptime; any dex after the last body-action beat = downtime; in rows with no body action, dex beats split evenly).

---

## 7. Positional operators

Operators that modify a beat's spatial position relative to the body.

| Operator | Symbolic token | Description |
|---|---|---|
| Same | `same` | Same-side execution of the qualified beat. |
| Op (opposite) | `op` | Opposite-side execution of the qualified beat. |
| In | `in` | Inward arc direction (toward the body). |
| Out | `out` | Outward arc direction (away from the body). |
| Front | `front` | Forward direction (used with whirl/swirl variants). |
| Back | `back` | Backward direction (used with whirl/swirl variants). |
| Cross-body (xbd) | `(xbd)` | Cross-body recovery: terminal contact on the opposite side from the plant. |
| Same-side (ss) | `(ss)` | Same-side execution direction. Per pt12 Red ruling 2026-05-11, ss = +0 universally. |
| Reverse (rev) | `rev` / `reverse` | Reverse-direction variant. Per direction-is-structural canonical rule, rev variants are canonical rows distinct from their natural-direction siblings. |

---

## 8. Temporal operators

Operators that mark the temporal relationship between beats (state-during-execution rather than spatial position).

| Operator | Symbolic token | Description |
|---|---|---|
| `[set]` | Pre-state | The trick begins with a set on the indicated surface. Always the first beat. |
| `[back]` | Pre-state | The next beat is oriented backward. Used with rotational variants (`[back] spin`). |
| `[front]` | Pre-state | The next beat is oriented forward. Used with rotational variants (`[front] spin`). |
| `[no plant while]` | Pre-state | The supporting leg does NOT plant during the next beat. Symposium-style mechanic. |
| `[rooted]` | Pre-state | The trick is executed from a held position (no support-leg plant; pt8 rooted set). |
| `>` | Sequence: continuous flow | Next beat continues directly from the previous beat. |
| `>>` | Sequence: gap / boundary | Major sequence boundary; often separates set-source from the trick body. Implies a temporal gap or a beat-grouping change. |

---

## 9. Recursive compositional operators

Operators that govern how compounds nest. The symbolic-grammar layer surfaces these as observational patterns; the parser currently does not dispatch into nested sub-parsing.

### 9.1 Recursive set-name pattern

A canonical trick name appears at the leading position of another trick's notation, functioning as the set-source for the continuing sequence.

| Pattern | Symbolic form | Examples |
|---|---|---|
| Dragon-prefix | `Dragon>(continuation)` | Dragonstein (FM operational notation begins with `Dragon`) |
| Frigidosis-prefix | `Frigidosis>(continuation)` | Arcwalk (`Frigidosis > Same In (DEX) >> Op Out (DEX) > Op Clip (XBD)(DEL)`) |

**Inheritance rule (proposed; observational):** the substructure trick's mechanics + ADDs are inherited implicitly; the body of the continuing notation adds further mechanics on top. **Not yet operationalized in the parser.**

### 9.2 Modifier-stacking composition

The symbolic compound = base mechanic + N modifiers (where each modifier is a body or set action). Examples from the equivalence-family registry:

| Pattern | Members |
|---|---|
| `modifier + butterfly` | ripwalk (stepping), dimwalk (pixie), parkwalk (pixie+ss), bigwalk (multi-mod), tripwalk (quantum), matador (nuclear), phoenix (pixie+ducking), arcwalk (recursive-set Frigidosis) |
| `modifier + legover` | eggbeater (atomic), pigbeater (pixie+atomic), scrambled-eggbeater (atomic+pickup), flurry (barraging) |
| `modifier + mirage` | smear (pixie), atom-smasher (atomic+XDEX), sumo (nuclear+XDEX), blur (stepping+paradox) |
| `modifier + osis` | torque (miraging), barraging-osis (deferred), spinning-osis, ducking-osis |
| `modifier + whirl` | spinning-whirl, paradox-whirl, hatchet (diving), surreal (paradox+spinning+stepping) |
| `modifier + pickup` | paste (pixie), legeater (quantum), omelette (illusioning-pending) |

See `SYMBOLIC_DECOMPOSITION_REGISTRY.csv` for full equivalence-family clustering.

### 9.3 Direction-variant composition

A canonical row + its reverse-direction sibling form a 2-row equivalence pair. Same kick mechanics, opposite directional travel, same ADD value, distinct dictionary identity.

| Pair | Members |
|---|---|
| drifter / reverse-drifter | (3 ADD each) |
| whirl / rev-whirl | (3 ADD each) |
| ATW / orbit (observational; orbit not in dictionary) | (2 ADD ATW; orbit ADD undefined) |

### 9.4 Multiplicity-doubling composition

Per pt8 §10 productive-multiplicity rule, `double X` is canonical only for community-stabilized exceptions.

| Stabilized doubling | Anchor + double |
|---|---|
| `legover / double-leg-over` | 2 ADD / 3 ADD |
| `around-the-world / double-around-the-world` | 2 ADD / 3 ADD |
| `spin / double-spin` | 1 ADD / 2 ADD |

### 9.5 §3.2 stated-ADD-without-stated-structure composition

Per CANONICALIZATION_POLICY §3.2, certain rows carry their asserted ADD at the row level rather than via modifier+base arithmetic.

| Member | Asserted ADD | Row-level disposition |
|---|--:|---|
| nemesis | 6 | Row-specific furious-rotational accounting on barfly. |
| jani-walker | 5 | Row-specific barraging-butterfly accounting (records sort_name reveals). |
| bullwhip | 5 | Row-asserted; canonical decomposition not in public dictionary. |

---

## 10. Cross-references

- `CORE_TRICK_SYMBOLIC_TABLE.csv` — 12-row canonical symbolic notation table
- `SYMBOLIC_FAMILY_REGISTRY.csv` — 40 symbolic families across 6 classification axes
- `SYMBOLIC_DECOMPOSITION_REGISTRY.csv` — equivalence-family clustering (modifier + base topologies)
- `GRAMMAR_AMBIGUITIES.md` — open questions, unresolved operators, implicit ADD signals, recursive set-inheritance
- `docs/Freestyle_Footbag_Glossary.md` — v2 run-quality + concept-level glossary (canonical, James-owned)
- `exploration/freestyle-notation-grammar/UX1_GLOSSARY_TOKEN_MATRIX.csv` — 83-row token inventory (semantic + operational layers)
- `exploration/footbagmoves-federation/OPERATIONAL_NOTATION_GRAMMAR.md` — F0 reconnaissance grammar; token-inventory source
- `exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv` — 679-row observational symbolic spreadsheet
- `exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_ANALYSIS.md` — SYMBOLIC-GRAMMAR-1 analysis with §10 IFPA correlation placeholder

---

## 11. Constraint check

| Constraint | Status |
|---|---|
| Zero ontology mutation | ✓ (no DB writes; no `freestyle_tricks` access; no modifier-table changes) |
| Zero parser replacement | ✓ (existing parser unchanged; observations catalogued in `GRAMMAR_AMBIGUITIES.md`) |
| Zero ADD rewrites | ✓ (all ADD values cited from existing dictionary data) |
| Zero alias insertion | ✓ (no `freestyle_trick_aliases` changes) |
| Glossary remains editorial / non-authoritative | ✓ (v3 lives in `exploration/`, NOT in `docs/`) |
| 4-layer separation preserved | ✓ (parser / editorial / operational / observational-symbolic) |
| No IFPA correlation executed | ✓ (only observational classification; no symbolic_family ↔ IFPA `trick_family` mapping performed; that work is deferred under SYMBOLIC-GRAMMAR-2 per `legacy_data/IMPLEMENTATION_PLAN.md` deferred section) |
