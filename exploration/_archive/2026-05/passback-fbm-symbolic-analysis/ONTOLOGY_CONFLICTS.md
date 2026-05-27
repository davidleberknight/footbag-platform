# Ontology Conflicts -- PassBack + FM corpus

Catalogues structural conflicts between FM/PB observed decompositions and IFPA canonical readings. Builds on the 15-row `PASSBACK_CONFLICT_MATRIX.csv` (FM federation track) and the 22-row `FM_MATH_DIVERGENCES.csv`; surfaces only the conflicts that are STRUCTURAL (decomposition shape) rather than purely numerical (ADD value).

## Conflict classes

| Class | Definition | Examples this pass surfaced |
|---|---|---|
| **decomposition divergence** | FM and IFPA disagree on which operators compose the trick | Fury, Blur, Omelette |
| **ADD-math divergence** | Decompositions agree but ADD totals differ | Nuclear-ss cohort (-1 delta); already in FM_MATH_DIVERGENCES.csv |
| **convention drift** | Same trick, different naming convention; no semantic conflict | Symp / Symp. / Symple variants |
| **polysemy** | One name carries two distinct decompositions | Slicing (FM-internal); Dragon (modifier vs surface) |
| **layer leak** | Operational notation appears where semantic was expected | ATW, Orbit, Legover, Pickup with `leggy>dex` strings |
| **dual-role overloading** | Same token plays two structural roles | `set` (positional infix vs surface suffix); `double` (quantifier vs canonical-name component) |

## Decomposition-divergence conflicts (load-bearing)

### Conflict D1 -- Fury

| Surface | Reading | ADD |
|---|---|---|
| FM | `Furious Mirage` (single-modifier) | 6 |
| IFPA pt6 | Furious + Paradox + Mirage (3 ops on base mirage) | 5 |

FM treats `Furious` as a single modifier that carries +N ADD. IFPA pt6 reads `furious` as a compound shorthand whose decomposition into Paradox + Mirage on a base accounts for the math. The conflict is not arithmetic; it is whether `furious` is a primitive operator or a sugar layer.

Blocks NF-2A entry for Furious. See NF2A queue row 'furious'.

### Conflict D2 -- Blur

| Surface | Reading | ADD |
|---|---|---|
| FM | `Blurry Mirage` (one rotational modifier on mirage) | 4 (rotational +2) |
| IFPA | Stepping Paradox Mirage (three modifiers on mirage base) | 3 (flat +1 per pt11) |

Symmetric to D1. FM's compositional grammar treats `Blurry` as a primitive operator with rotational ADD weight; IFPA pt11 ruled Blurry as flat +1 and treats Blur as decomposing through Stepping + Paradox. pt12 queue has Blurry Whirl / Blurry Torque variants exposing the same conflict on rotational bases.

### Conflict D3 -- Omelette

| Surface | Reading | ADD |
|---|---|---|
| FM | `Atomic Illusion` | 4 |
| IFPA | omelette is canonical pickup-tier; reads as Atomic + Illusion | 3 |

Single-row ADD divergence (+1). Documented in PASSBACK_CONFLICT_MATRIX C2 as MEDIUM severity. Structural agreement (both read it as Atomic + Illusion); arithmetic disagrees by 1. Could be ADD-math or decomposition divergence depending on whether the +1 is intended to be a rotational adjustment.

### Conflict D4 -- Terrage

| Surface | Reading | ADD |
|---|---|---|
| FM | `Double Pixie` | 3 |
| IFPA | terrage canonical at 4 | 4 |

FM's `Double Pixie` reads as quantifier on Pixie. IFPA's higher count suggests an additional modifier is present. pt12 queue holds this.

## Polysemy conflicts

### Conflict P1 -- Slicing (FM-internal)

FM Sets-tab shows TWO compositions for Slicing: `Gyro Rev. Swirling` AND `Blurry Quasi`. Not an IFPA problem; flagged here because IFPA cannot adopt Slicing as an alias to either reading until FM curates.

### Conflict P2 -- Dragon (cross-role)

`Dragon` appears in the corpus as:
- A modifier prefix: `Miraging Dragon` → Dragster
- A surface marker (positional): `Dragon set Stepping op Firewalk` → Flipwalk
- A base-suffix: `Furnace: Hopover Swirl Dragon`, `Firefly: Butterfly Dragon`, `Spitfire: Swirl Dragon`

Three distinct structural roles for the same orthographic token. FM-vocab; not adjudicated. Surface usage might warrant a Sui Generis glossary entry; modifier usage does not warrant NF-2A treatment.

## Layer-leak conflicts

10 rows (per Phase A summary) carry operational notation in technical_name. Most are PassBack-sourced (`leggy>dex>toe` patterns on ATW, Orbit, Legover, Pickup). Treat as scraper-coverage flag rather than as semantic-grammar evidence. Operational notation belongs in `parsed_symbol_sequence`, not `technical_name`.

## Dual-role overloading

### `set` token

- Positional infix: `Clipper set Double Mirage` (Barrage); `Toe set ss Triple Over Down` (Orpheus)
- Surface suffix: counted twice in some rows
- FM Sets-tab keyword (in extract metadata, not in trick names)

Tokenizer treats both usages as pending_red. The grammar disambiguates by position; the inventory entry covers both per OPERATOR_INVENTORY.csv P6.

### `double` token

- Quantifier on next token: `Double Mirage`, `Double Legover` (locked canonical reading)
- Part of a canonical name as a hyphenated word: `Double Down`, `Double Over Down`

These are both legitimate semantic readings; the conflict is naming convention, not grammar. Tokenizer counts `double` as a quantifier in both cases; readers should interpret context.

## Cross-references

- `FM_MATH_DIVERGENCES.csv` (22 rows) -- pure arithmetic divergences; mostly resolved post-SS ruling.
- `PASSBACK_CONFLICT_MATRIX.csv` (15 rows, C1-C14) -- federation-pipeline-scoped; this pass cites C2, C3, C4, C6, C9 as feeders.
- `RED_PT12_PACKET_DRAFT.md` -- Blurry-Whirl / Blurry-Torque conflicts; D2 above is the related family.
- pt6 ruling -- Fury decomposition; D1 references.

## What this pass does NOT propose

- No new conflict rulings.
- No reclassification of existing conflicts.
- No structural changes to how FM_MATH_DIVERGENCES is maintained.

The conflicts above are documented as INVENTORY for the next Red triage pass, not as problems to be solved in this slice.
