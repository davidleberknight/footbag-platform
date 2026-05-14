# Compression-Pattern Taxonomy -- PassBack + FM corpus

Extends the FM Phase 1 transformation taxonomy (P1-P15 in `TRANSFORMATION_PATTERNS.csv`) with PassBack-side evidence and adds three structural-compression classes the FM pass did not formalize.

This is a structural inventory. The pedagogical question of WHICH compressions the community prefers (and which are cognitively counterproductive) lives in `PEDAGOGICAL_COMPRESSION_PATTERNS.md`.

## Existing FM patterns (reuse as-is)

`TRANSFORMATION_PATTERNS.csv` rows P1-P15 remain authoritative for the structural-shape patterns they cover. The new pass observed all 15 patterns in the combined corpus; counts below confirm but do not re-derive them.

| FM ID | Pattern | Corpus support (motifs) |
|---|---|---|
| P1 | `<mod> <base>` | 191 rows: `locked → base_or_unknown` (motif row 1) |
| P2 | `<mod> <positional> <base>` | 18 rows: `locked → pending_red → base_or_unknown` |
| P7 | multi-modifier stack | 24 rows: `locked → quantifier → base_or_unknown` and adjacent |
| P8 | recursive-set | 7 rows under `sailing` (FM Sets def: Pixie Atomic); cascades through Slaying, Slicing |
| P10 | display-name `(same side)` suffix | excluded from technical_name string parsing; 54-row cohort per SS_RESOLUTION_IMPACT |
| P14 | modifier-stack without positional | covered by P1 with depth>=2 |

## New patterns surfaced by this pass

### C1 -- FM-vocab compression

`<q4_blocked> <base>` (62 rows, motif row 2): an FM-vocab modifier with no IFPA add_bonus row sits directly in front of a base trick. Top instances:

- `Bubba Legover` (Bubba Beater)
- `Blazing Mirage` (Blaze)
- `Terraging Legover` (Enterrage)
- `Furious Whirl` (Genesis)
- `Surging Butterfly`

Structurally identical to P1, but the leading modifier carries no canonical ADD ruling. The compression is mechanical (one modifier slot); the legitimacy question is unresolved. 62 rows is high recurrence; per the frequency-is-not-authority rule, count alone is not a promotion signal. See NF-2A candidates for per-operator scoring.

### C2 -- Bare-base canonical-name

Single-token technical_name (58 rows, motif row 3) such as `Arctic Butterfly` (Arcwalk), `Butterfly Flapper` (Buttersole), `Diving Whirl` (Hatchet). Folk name compresses what is already a primitive composition; the canonical name reads as the technical_name. Reverse pattern: the FOLK name is the compressed form, the technical name is the SAME compositional surface.

This is the structural inverse of P1: no modifier is being added; the folk-name is functioning as a memorable alias for the base composition itself.

### C3 -- Operational-notation leakage

10 rows (per Phase A summary) where `technical_name` carries operational-notation tokens (`leggy`, `dex`, `in`, `out`, `>`, `›`). Examples:

- `ATW`: `toe>ss leggy in dex>ss toe`
- `Orbit`: `toe>ss leggy out dex>ss toe`
- `Legover`: `(downtime) leggy out dex>ss toe`
- `Pickup`: `(downtime) leggy in dex>ss toe`

This is a corpus-quality artifact: the technical_name field was supposed to carry semantic decomposition but instead carries operational notation. PassBack source data drives most of these (the 4 PB rows above). Treat as parser-coverage flag, not as compression pattern.

### C4 -- Mid-stack temporal flag

7 rows with `temporal → ...` motif. Examples:

- `Pixie (archaic)`: `Midtime Toe near Mirage`
- `Dada Curve`: `(downtime) Miraging far Symp. Butterfly`
- `Blender`: `(downtime) Whirling Osis`

Parenthesized temporal token appears as a prefix on what is otherwise a P2 or P7 stack. Per OPERATOR_INVENTORY, temporals are descriptive (ADD-neutral). The compression is light: the temporal is purely structural framing, not a semantic operator.

## What the taxonomy does NOT cover

- Pattern P10 `(same side)` display-suffix (54-row cohort) is filtered out before tokenization. See SS_RESOLUTION_IMPACT for the resolved disposition.
- Slug-level abbreviations (ATW, BS, DLO, PLO, BSOS) are alias-layer compressions, not technical-name compressions. They belong in the PassBack glossary intake, not here.
- Symp / Symp. / Symple orthographic compression is recognized at tokenization (all three normalize to symposium-class). The taxonomy treats this as orthographic noise, not as a distinct compression pattern.

## Reader caveat

Compression patterns describe structural shape. They do NOT imply that any pattern is correct, pedagogically sound, or canonically adoptable. Some patterns (C1 especially) recur heavily but rest on operators that may not belong in IFPA canon at all. See `PEDAGOGICAL_COMPRESSION_PATTERNS.md` for the use-case axis and `NF2A_CANDIDATE_QUEUE.csv` for per-operator scoring.
