# FM-GRAMMAR-1 — Observational Grammar Extraction (Phase 1)

Pass-1 observational survey of the transformation-language used in
PassBack/FootbagMoves technical-name and Sets entries. Strictly observational:
no ontology mutation, no parser changes, no canonicalization, no adoption of
FM semantics, no Red review.

## Scope

This document inventories the *operators* FM uses to compose trick names. An
operator is any token in an FM technical_name or Sets-description that takes a
trick or modifier on its left/right and yields a different trick or modifier.
The Phase-1 output is descriptive: pattern names + frequency + role
classification. Phase-2 (not in this pass) would decide which patterns map to
IFPA semantic content and which stay as folk-language.

## Inputs surveyed

| Source | Rows / coverage |
|---|---|
| `legacy_data/inputs/curated/tricks/fm_alias_terminology_extract.csv` | 29 curated alias→technical pairs |
| `legacy_data/out/footbagmoves_inventory.csv` | full authoritative inventory (~600 rows with technical_name populated) |
| `legacy_data/out/footbagmoves_inventory_same_side.csv` | 54-row `(same side)` display-suffix cohort |
| `legacy_data/inputs/curated/tricks/Screenshot_passsback_sets.png` | PassBack Sets tab — recursive set definitions |
| `legacy_data/inputs/curated/tricks/passback-alias{1..9}.png` | 9 alias-table screenshots |

The screenshots and the scraped inventory diverge on certain operators
(temporal qualifiers `(downtime)/(uptime)/(midtime)` are visible in the
screenshots but absent from the scraped inventory's technical_name column,
suggesting the scraper stripped them). Both surfaces are surveyed.

## High-level findings

1. FM names compose by **modifier-stacking with optional positional infix**.
2. Positional operators (`far`, `near`, `ss`, `op`, `os`, `set`) are syntactic
   — they alter the trick's geometric relationship to the body or the bag's
   trajectory, not its ADD weight.
3. Temporal qualifiers (`uptime`/`downtime`/`midtime`) and pre-state flags
   (`rooted`) appear as parenthesized prefixes describing the entry state.
4. The Sets tab exposes a **recursive layer**: many names that act as
   modifiers (Pixie, Atomic, Sailing, Phasing, …) are themselves defined as
   compositions of other modifiers via the same grammar. This means FM names
   are not a flat token vocabulary — they form a layered hierarchy.
5. **SS resolution applied**: per Red's 2026-05-11 ruling, `ss` carries
   no ADD weight in canonical IFPA decomposition. This grammar pass classifies
   `ss` as positional/descriptive accordingly. See `SS_RESOLUTION_IMPACT.md`.

## Section 1 — Operator families

### 1.1 Positional operators (geometric / spatial role)

These operators alter the spatial relationship of the kick/set to the body or
between consecutive kicks. They carry no ADD weight (confirmed for `ss`;
inferred for the others by analogy, but **not adjudicated** in this pass).

| operator | corpus count | observed form | example (display | technical) |
|---|---|---|---|
| `ss` | 38 | infix between modifier and base | Barfry \| Nuclear ss Butterfly |
| `far` (capitalized "Far") | 14 | infix; also leading position | Ripwalk \| Stepping Far Butterfly; Barfly \| Far Double Over Down |
| `set` | 8 | suffix on surface ("Clipper set", "Toe set", "Dragon set") | Barrage \| Clipper set Double Mirage |
| `os` | 3 | infix (same slot as `ss`/`op`) | Paradon \| Toe set os Double Over Down |
| `op` | 2 | infix | Flipwalk \| Dragon set Stepping op Firewalk |
| `near` | 0 in scraped inventory; present in screenshots | infix | Magellan \| Pixie near Legover (per screenshot, not scraped) |

Pattern inferred: `ss`, `op`, `os`, `near`, `far`, `set` occupy a single
syntactic slot that specifies the geometric relationship between the
modifier's effect and the base trick. The vocabulary appears to be at least
6 distinct values.

### 1.2 Temporal pre-state qualifiers

Parenthesized prefixes at the start of a technical name. Visible in
screenshots; stripped from the scraped inventory's technical_name column.

| operator | observed form | example |
|---|---|---|
| `(downtime)` | parenthesized prefix | Dada Curve \| (downtime) Miraging far Symp. Butterfly |
| `(uptime)` | parenthesized prefix | Enterrage \| (uptime) Toe near Flurry |
| `(midtime)` | parenthesized prefix | Pixie (archaic) \| Midtime Toe near Mirage |

Inferred semantics: temporal markers describe the body's vertical state at
trick entry (bag rising / mid-flight / falling). Purely descriptive (no ADD
weight expected). Distinct from operational notation's `(no plant while)` /
`(rooted)` body-state flags which appear in operational_notation (not in
technical_name).

### 1.3 Recursive set-aliases (from Sets tab)

Many FM "modifier" names are themselves compositions per the Sets tab.
Sampling from `Screenshot_passsback_sets.png` and screenshots:

| set name | FM Sets definition | structural class |
|---|---|---|
| Atomic | Toe Illusioning | compositional |
| Pixie | leg passes under bag opposite direction | descriptive (atomic semantics) |
| Pixie (archaic) | Midtime Toe near Mirage | compositional |
| Spinning | Back Spin | compositional (body-spin direction) |
| Inspinning | Front Spin | compositional |
| Quantum | Toe Miraging | compositional |
| Sailing | Pixie Atomic | compositional |
| Frantic | Pixie Quantum | compositional |
| Phasing | Fairy ss Spinning | compositional (recursive — references `ss`) |
| Leaning | Stepping Inspinning | compositional |
| Hyper | Rooted Pixie | compositional (references pre-state flag) |
| Pogo | Uptime ATW | compositional (references temporal flag) |
| Riffing | Symp Blurriest | compositional |
| Quasi | Clipper far Miraging | compositional (references `far`) |
| Slaying | Symp Sailing | compositional (references the recursive Sailing) |
| Slicing | Gyro Rev. Swirling / Blurry Quasi | **two distinct compositions** |
| Splicing | Slap | descriptive (unresolved) |
| Surfing | Pixie Sliding (or similar) | partial |
| Smiling | Swirling ss Stepping | compositional |
| Twinspinning | (twin-spin variant; needs screenshot review) | partial |

**Observation**: the Sets layer is a directed graph of compositions. Some
sets resolve to bottom-out tokens (Pixie, Stepping, Ducking, Paradox,
Atomic, Quantum, Symposium, Spinning), and some resolve to other sets
(Sailing → Pixie + Atomic; Frantic → Pixie + Quantum; Slaying → Symp + Sailing
→ Symp + Pixie + Atomic). The grammar is recursive.

### 1.4 Body modifiers (compositional, ADD-bearing)

These are the IFPA-recognized body modifiers (already in IFPA's modifier
table). FM uses the same vocabulary:

| operator | IFPA add_bonus | FM usage |
|---|---|---|
| Ducking | +1 | Ducking <base> |
| Paradox | +1 | Paradox <base>; Paradox <set> <base> |
| Spinning | +1 | Spinning <base>; Spinning <set> <base> |
| Stepping | +1 | Stepping <base>; Stepping <set> <base> |
| Symposium / Symp / Symple | +1 | Symp Whirl, Symple Butterfly |
| Tapping | +1 | Tapping Whirl |

Compositional shorthand: `Symp.` / `Symple` are FM abbreviations for
Symposium. IFPA's canonical name remains "symposium".

### 1.5 Set modifiers (compositional, ADD-bearing)

| operator | IFPA add_bonus | FM usage |
|---|---|---|
| Pixie | +1 | Pixie <base>; "behind the leg" set |
| Atomic | +1 non-rotational / +2 rotational | per pt10; FM uses "Atomic <base>" + recursive Atomic alts |
| Quantum | +1 | Quantum <base>; Toe Miraging in Sets def |
| Nuclear | +2 (Paradox Atomic) | per pt10; Nuclear ss X = federation_math_divergence per SS ruling |
| Blurry | +1 | per pt11; some compounds carry deeper decompositions (Blur, Ripwalk) |

### 1.6 FM-vocabulary modifiers (no IFPA semantics yet — Q4 class)

These are present in FM technical_names and Sets definitions but have no
established IFPA add_bonus weight. Some appear as both operator and operand.

| operator | example usage | composition (if available from Sets) |
|---|---|---|
| Fairy | Fairy Butterfly; Fairy ss Drifter | (descriptive; Q4 unresolved) |
| Gyro | Gyro Drifter; Gyro Mirage | (per Sets: alt for "Spinning ss") |
| Blazing | Blaze \| Blazing Mirage | (Q4 unresolved) |
| Surging | Surging ss Osis | (Q4 unresolved) |
| Furious | (root of Furious Whirl = Genesis per pt12 queue) | (Q4 unresolved) |
| Barraging | Flurry \| Barraging Legover | (Q4 unresolved) |
| Railing | Compound Fracture \| Railing ss Double Legover | (Q4 unresolved) |
| Flailing | Bill & Ted's Bogus Journey \| Flailing ss Symp Double Legover | per FM extract: "Flailing = Symposium Atomic" |
| Phasing | Phase \| Phasing ss Mirage | per Sets: "Phasing = Fairy ss Spinning" |
| Leaning | Leaning Jowler \| Leaning ss Mirage | per Sets: "Leaning = Stepping Inspinning" |
| Sailing | Sailing ss Double Legover | per FM extract: "Sailing = Pixie Atomic" |
| Slicing | (Set entry) | per Sets: two definitions — "Gyro Rev. Swirling" / "Blurry Quasi" |
| Splicing | Splicing ss Blender | (Sets entry incomplete) |
| Surfing | Surfing ss Blender | (Sets entry partial) |
| Twinspinning | Twinspinning ss Mirage | (Sets entry partial) |
| Jolimont | Jolimont ss Mirage | (unresolved) |
| Whirling | Blender = Whirling Osis (per pt11) | compositional (canonical IFPA usage) |
| Miraging | Torque = Miraging Osis (per pt11) | compositional (canonical IFPA usage) |
| Terraging | Enterrage \| Terraging Legover | (pt12 queue; ADD off-by-one vs IFPA) |
| Reverse | Reverse Whirl; Reverse Torque (Flux) | direction operator |
| Dragon | Dragon set Stepping op Firewalk (Flipwalk) | (positional or set; unresolved) |
| Spyro | Spyro Symple Drifter | (FM-vocab) |
| Bubba | Bubba Legover (Bubba Beater) | (FM-vocab) |
| Neutron | (used as operator and operand) | (FM-vocab) |

## Section 2 — Role classifications

Per the user's role taxonomy (`directional`, `positional`, `compositional`,
`additive`, `purely descriptive`), here is the observed role assignment:

| operator | role(s) | grounded in |
|---|---|---|
| `ss` | **positional + purely descriptive** | Red 2026-05-11 ruling (+0 ADD) |
| `far` | **positional** (presumed descriptive, ADD-neutral; not adjudicated) | observed syntactic slot |
| `near` | **positional** (screenshots; not in scraped inventory) | screenshot evidence |
| `op` | **directional + positional** (opposite-side variant) | observed contrast with `ss` |
| `os` | **directional + positional** (variant of `op` or distinct) | 3 occurrences; semantic unclear |
| `set` | **positional + compositional** (surface-marker) | "Clipper set"/"Toe set" pattern |
| `(downtime)` / `(uptime)` / `(midtime)` | **temporal + purely descriptive** | parenthesized state-marker grammar |
| `(rooted)` | **pre-state + purely descriptive** | per pt8: rooted = 0-ADD set |
| Ducking / Paradox / Spinning / Stepping / Symposium / Tapping | **compositional + additive (+1)** | IFPA modifier table |
| Pixie / Quantum | **compositional + additive (+1)** | IFPA modifier table |
| Atomic | **compositional + additive (+1 flat / +2 rotational)** | pt10 |
| Nuclear | **compositional + additive (+2)** | pt10 |
| Blurry | **compositional + additive (+1)** | pt11 |
| Fairy / Gyro / Blazing / Furious / Barraging / Railing / Flailing / Phasing / Leaning / Sailing / Slicing / Splicing / Surfing / Twinspinning / Jolimont / Terraging / Bubba / Spyro / Neutron | **compositional (unresolved additive weight)** — Q4 class | FM-vocab, no IFPA ruling |
| Whirling / Miraging | **compositional (recursive expansion of base names)** | pt11 |
| Reverse | **directional** (reverses rotation direction) | observed in Reverse Whirl, Reverse Torque |
| Dragon | **positional + compositional?** (used as set-marker like Clipper/Toe) | unresolved |

## Section 3 — Separation: observational / inferred / unresolved

### 3.1 Observational (visible in corpus, role syntactically clear)

- `ss` is positional and infix; appears 38 times. Confirmed +0 ADD.
- `far` is positional and infix (and leading word in some); appears 14 times.
- `set` is a surface-positional shorthand (`<surface> set`); appears 8 times.
- Modifier-stacking is left-to-right (`Spinning Ducking far Symp. Whirl` =
  Montage stacks Spinning + Ducking onto Symp Whirl).
- Sets are recursive — many "modifier" names in FM are compositions.
- Some sets have multiple equivalent compositions (Slicing has two).

### 3.2 Inferred (likely role based on syntactic pattern, but not adjudicated)

- `near`, `op`, `os` are inferred to share the positional slot with `ss`/`far`.
  Their specific geometric semantics are inferred but not formally documented.
- Temporal qualifiers `(uptime)/(downtime)/(midtime)` are inferred to be
  body-vertical-state markers, no ADD weight, no canonical-decomposition
  consequence.
- `Reverse` likely flips rotational direction (Reverse Whirl, Reverse Torque).
- `Dragon` is inferred to be a set-position variant analogous to
  `Toe`/`Clipper`, but Dragon set's geometric meaning is undocumented.

### 3.3 Unresolved (ambiguity that prevents classification)

- FM-vocab modifiers without IFPA add_bonus (Fairy, Gyro, Blazing, etc.) — see
  Q4 in the Red packet. These rows in the corpus cannot be IFPA-additively
  validated.
- Some Sets entries are abbreviated/truncated (Splicing, Surfing,
  Twinspinning); the screenshot capture may be partial.
- Slicing has two distinct compositions in the Sets tab — possible FM
  data inconsistency or genuine polysemy.
- The relationship between `op`/`os` is unclear: both occupy the positional
  slot; one may be a typo of the other, or they may carry distinct semantics.
- Some technical names skip the positional slot entirely (e.g., `Pixie
  Butterfly` for Dimwalk — no `far`/`near`/`ss` between modifier and base).
  Whether the missing positional implies a default position or a distinct
  semantic is unresolved.

## Section 4 — Worked transformation patterns (sampled)

### Pattern P1: simple modifier-base
- `<mod> <base>` → trick
- Examples: `Pixie Butterfly` = Dimwalk; `Atomic Mirage` = Atom-Smasher
- Role: compositional + additive (IFPA modifiers); descriptive (FM-vocab modifiers)

### Pattern P2: positional infix
- `<mod> <positional> <base>` → trick
- Examples: `Stepping Far Butterfly` = Ripwalk; `Nuclear ss Butterfly` = Barfry
- Role: compositional + positional (positional carries no ADD)

### Pattern P3: SS-as-alternate-name
- `<set> ss` reads as alternate name for a different set
- Examples (from Sets tab): `Spinning ss` = Gyro (alt); `Quantum ss` = Slapping (alt); `Atomic ss` = Tapping (alt)
- Role: descriptive/positional + compositional alias

### Pattern P4: Nuclear-ss (federation math divergence)
- `Nuclear ss <base>` carries FM-ADD that diverges from IFPA additive by -1
- Examples: Barfry, Hurl, Godzilla — all -1 delta
- Role: federation_math_divergence per SS resolution

### Pattern P5: temporal-prefix
- `(<temporal>) <technical-name>` → trick
- Examples: `(downtime) Miraging far Symp. Butterfly` = Dada Curve; `(uptime) Toe near Flurry` = Enterrage
- Role: temporal + purely descriptive

### Pattern P6: set-surface positional
- `<surface> set <rest>` — surface-positional shorthand
- Examples: `Clipper set Double Mirage` = Barrage; `Toe set ss Triple Over Down` = Orpheus; `Dragon set Stepping op Firewalk` = Flipwalk
- Role: positional + compositional (surface is the trick's starting position)

### Pattern P7: multi-modifier stack
- `<mod1> <mod2> [positional] <base>` — modifier stacking
- Examples: `Spinning Ducking far Symp. Whirl` = Montage; `Stepping Ducking Far Butterfly Swirl` = Cyborg
- Role: compositional + additive

### Pattern P8: recursive set-alias
- A Sets-tab entry expands to a composition of other operators
- Examples: Sailing = Pixie Atomic; Frantic = Pixie Quantum; Phasing = Fairy ss Spinning; Hyper = Rooted Pixie
- Role: compositional alias; recursion depth varies

### Pattern P9: shorthand-symposium
- `Symp.` or `Symple` substitutes for "Symposium"
- Examples: `Symp Whirl`, `Symple Butterfly`, `Symp Sailing`
- Role: purely descriptive (orthographic shorthand)

### Pattern P10: same-side display suffix
- Display name suffix `(same side)` or `(same-side)` — distinct from technical-name `ss` infix
- 54 rows in `legacy_data/out/footbagmoves_inventory_same_side.csv`
- Role: positional + purely descriptive (per SS ruling: no ADD)

### Pattern P11: reverse-direction
- `Reverse <base>` flips rotational direction
- Examples: `Reverse Whirl` = Rev Whirl; `Reverse Torque` = Flux
- Role: directional + purely descriptive (no ADD inferred; not adjudicated)

### Pattern P12: temporal-as-set-name
- A temporal flag appears as the leading word of a recursive set definition
- Examples (from Sets tab): Pogo = Uptime ATW; Pixie (archaic) = Midtime Toe near Mirage
- Role: temporal + compositional (when used inside a Sets-tab definition)

## Section 5 — Notable structural observations

1. **No formal precedence is documented**: FM modifier-stacking is left-to-right
   in display order, but whether `Spinning Ducking` means `Spinning(Ducking(base))`
   or `(Spinning + Ducking)(base)` is an interpretation question (additive vs
   functional). IFPA's additive math sidesteps this by treating all modifier
   contributions as commutative.

2. **Positional vs additive separation is implicit**: positional operators
   (`ss`/`far`/`near`/`op`/`os`/`set`) never carry ADD weight in any case
   surveyed; all ADD-bearing operators are compositional (named modifiers).
   The SS ruling formalizes this for `ss`; other positionals are not yet
   adjudicated but the same pattern holds across the corpus.

3. **Recursive composition is the dominant complexity source**: FM Sets like
   Slaying (= Symp Sailing = Symp Pixie Atomic) are 3-deep compositions.
   Some have ambiguous depth (Slicing's two definitions). IFPA's modifier
   table is currently flat (one-level vocabulary); adopting any FM recursion
   would require a structural extension that is not currently being proposed.

4. **The display name ↔ technical name relationship is not one-to-one**:
   - One display name can have multiple technical names (Dyno far / Dyno same side both = Reverse Blender)
   - One technical name can have multiple display names (Whirling Osis = Blender, also "Blender (same side)")
   - Alternate names blur the line further (Sailing = Pixie Atomic in FM extract; per Sets tab, Sailing has its own row)

5. **Federation evidence is highest-confidence at the OPERATOR LEVEL**: even
   when specific FM ADD values disagree with IFPA additive math (the SS
   divergences), the operator-vocabulary itself (which modifiers compose
   with which bases) is broadly consistent with IFPA's modifier table.
   The divergences are concentrated at the math layer, not the structural
   layer.

## What this document does NOT do

- Does not propose any ontology mutation, modifier-table change, or parser change.
- Does not adopt FM math values where they diverge from IFPA additive.
- Does not classify FM-vocab modifiers (Fairy, Gyro, Blazing, etc.) — those
  remain Q4 questions for a separate Red packet (not in scope here).
- Does not resolve the `op`/`os` distinction.
- Does not formalize precedence/associativity of FM modifier-stacking.
- Does not ask Red for further rulings. The SS ruling is the only Red input
  applied here; everything else is observational.
- Does not propose adding any of the inferred semantics to the IFPA educational
  surface (trick-detail prose, modifier reference, etc.). That decision is
  Phase 2, downstream of this phase.

## Files produced

- `exploration/footbagmoves-federation/FM_GRAMMAR_PHASE1.md` (this doc)
- `exploration/footbagmoves-federation/OPERATOR_INVENTORY.csv` (machine-readable operator table)
- `exploration/footbagmoves-federation/TRANSFORMATION_PATTERNS.csv` (machine-readable pattern table)

## Recommended follow-up (not in scope here)

- **Phase 2 question** (when ready to ask): which subset of FM operators
  belongs in the IFPA educational layer (modifier reference, glossary)? The
  positional operators (`ss`/`far`/`near`/`op`/`os`) are strong candidates
  for "purely descriptive" educational mention since they carry no ADD weight
  and are widely used in FM display names. The temporal qualifiers
  (`uptime`/`downtime`/`midtime`) are similarly descriptive.
- **Phase 2 question**: should the recursive Sets layer be exposed as
  educational content (e.g., on a modifier reference page) or kept as
  internal federation-reconciliation evidence?
- **Curation review**: the curated `fm_alias_terminology_extract.csv`
  disagrees with the authoritative inventory on operator strings for some
  rows (e.g., Barfry: "Nuclear far Butterfly" curated vs "Nuclear ss
  Butterfly" authoritative). A reconciliation pass on the curated extract is
  a separate task.
