# HIGH-confidence base polarity registry (PROPOSAL, 2026-06-23)

Read-only proposal. Inclusion bar: the base's canonical operational_notation leads with an UNAMBIGUOUS `SAME` or `OP` dexterity marker. No LOW-confidence corpus inference, no `SAME/OP`-ambiguous notation, no doctrine-only entries.

Reproduce: `python3 exploration/positional-evidence-audit-2026-06-23/registry.py`

Reading the registry:

- OP default -> a `far-X` name is an **alias** of X; `X-same-side` is the **distinct** variant.
- SAME default -> a `X-same-side` name is an **alias** of X; `far-X` is the **distinct** variant.
- "distinct/alias variant" lists the corpus-attested spelling(s) where they exist; otherwise the proposed form (slug normalization is frozen, so spellings are descriptive).

## Counts

- HIGH-confidence registry bases (every scored dex agrees on a side): **72** (OP 57, SAME 15)
- All 72 carry at least one corpus-attested positional spelling.
- Held out (positional family exists, but notation dex markers are NOT unanimous, so the targeted element's side is not notation-certain): **75** — these are NOT in the registry and need per-trick adjudication.

## Registry

| base | default | evidence (leading dex) | distinct variant(s) | alias variant(s) | base active |
|---|:--:|---|---|---|:--:|
| `atomic-blender` | OP | `all 2 dex marker(s) OP` | atomic-blender-same-side (proposed; not yet attested) | Atomic far Blender | Y |
| `atomic-butterfly` | OP | `all 2 dex marker(s) OP` | Atomic near Butterfly | Atomic far Butterfly | Y |
| `atomic-ducking-torque` | OP | `all 2 dex marker(s) OP` | atomic-ducking-torque-same-side (proposed; not yet attested) | Atomic Ducking far Torque | Y |
| `atomic-eggbeater` | OP | `all 3 dex marker(s) OP` | atomic-eggbeater-same-side (proposed; not yet attested) | Atomic far Eggbeater | Y |
| `atomic-illusion` | OP | `all 2 dex marker(s) OP` | Atomic Illusion (same side) | far-atomic-illusion / atomic-illusion-op (would be alias of atomic-illusion) | Y |
| `atomic-osis` | OP | `all 1 dex marker(s) OP` | Atomic ss Osis | far-atomic-osis / atomic-osis-op (would be alias of atomic-osis) |  |
| `blender` | OP | `all 1 dex marker(s) OP` | Blender (same side) | far-blender / blender-op (would be alias of blender) | Y |
| `clipper-diving-whirl` | OP | `all 1 dex marker(s) OP` | Clipper Diving near Whirl | far-clipper-diving-whirl / clipper-diving-whirl-op (would be alias of clipper-diving-whirl) | Y |
| `clipper-ducking-blender` | OP | `all 1 dex marker(s) OP` | clipper-ducking-blender-same-side (proposed; not yet attested) | Clipper Ducking far Blender | Y |
| `clipper-ducking-drifter` | OP | `all 1 dex marker(s) OP` | clipper-ducking-drifter-same-side (proposed; not yet attested) | Clipper Ducking far Drifter | Y |
| `clipper-ducking-whirl` | OP | `all 1 dex marker(s) OP` | clipper-ducking-whirl-same-side (proposed; not yet attested) | Clipper Ducking far Whirl | Y |
| `double-over-down` | OP | `all 2 dex marker(s) OP` | double-over-down-same-side (proposed; not yet attested) | Far Double Over Down | Y |
| `drifter` | OP | `all 1 dex marker(s) OP` | Drifter (same-side) | far-drifter / drifter-op (would be alias of drifter) | Y |
| `ducking-legover` | OP | `all 1 dex marker(s) OP` | ducking-legover-same-side (proposed; not yet attested) | Ducking Far Legover | Y |
| `ducking-pickup` | OP | `all 1 dex marker(s) OP` | ducking-pickup-same-side (proposed; not yet attested) | Ducking Far Pickup | Y |
| `ducking-symposium-reverse-whirl` | OP | `all 1 dex marker(s) OP` | ducking-symposium-reverse-whirl-same-side (proposed; not yet attested) | Ducking Far Symposium Reverse Whirl | Y |
| `dyno` | OP | `all 1 dex marker(s) OP` | Dyno (same side) | Dyno (far); Far Dyno | Y |
| `guay` | OP | `all 1 dex marker(s) OP` | guay-same-side (proposed; not yet attested) | Far Guay | Y |
| `inspinning-illusion` | OP | `all 1 dex marker(s) OP` | Inspinning Same Side Illusion | far-inspinning-illusion / inspinning-illusion-op (would be alias of inspinning-illusion) | Y |
| `inspinning-mirage` | OP | `all 1 dex marker(s) OP` | Inspinning Same Side Mirage | far-inspinning-mirage / inspinning-mirage-op (would be alias of inspinning-mirage) | Y |
| `legover` | OP | `all 1 dex marker(s) OP` | legover-same-side (proposed; not yet attested) | Far Legover | Y |
| `miraging-clipper` | OP | `all 1 dex marker(s) OP` | miraging-clipper-same-side (proposed; not yet attested) | Miraging far Clipper |  |
| `miraging-osis` | OP | `all 1 dex marker(s) OP` | miraging-osis-same-side (proposed; not yet attested) | Miraging far Osis |  |
| `pickup` | OP | `all 1 dex marker(s) OP` | pickup-same-side (proposed; not yet attested) | Far Pickup | Y |
| `pogo-pickup` | OP | `all 2 dex marker(s) OP` | Pogo ss Pickup | far-pogo-pickup / pogo-pickup-op (would be alias of pogo-pickup) | Y |
| `quantum-illusion` | OP | `all 2 dex marker(s) OP` | Quantum Illusion (same side) | far-quantum-illusion / quantum-illusion-op (would be alias of quantum-illusion) | Y |
| `quantum-legover` | OP | `all 2 dex marker(s) OP` | Quantum Legover (same side) | far-quantum-legover / quantum-legover-op (would be alias of quantum-legover) | Y |
| `quantum-mirage` | OP | `all 2 dex marker(s) OP` | Quantum Mirage (same side) | Quantum far Mirage | Y |
| `quantum-torque` | OP | `all 2 dex marker(s) OP` | quantum-torque-same-side (proposed; not yet attested) | Quantum far Torque | Y |
| `shooting-clipper` | OP | `all 2 dex marker(s) OP` | Shooting ss Clipper | far-shooting-clipper / shooting-clipper-op (would be alias of shooting-clipper) | Y |
| `shooting-illusion` | OP | `all 3 dex marker(s) OP` | Shooting ss Illusion | far-shooting-illusion / shooting-illusion-op (would be alias of shooting-illusion) | Y |
| `shooting-legover` | OP | `all 3 dex marker(s) OP` | Shooting ss Legover | far-shooting-legover / shooting-legover-op (would be alias of shooting-legover) | Y |
| `shooting-mirage` | OP | `all 3 dex marker(s) OP` | Shooting ss Mirage | far-shooting-mirage / shooting-mirage-op (would be alias of shooting-mirage) | Y |
| `shooting-pickup` | OP | `all 3 dex marker(s) OP` | Shooting ss Pickup | far-shooting-pickup / shooting-pickup-op (would be alias of shooting-pickup) | Y |
| `spinning-blender` | OP | `all 1 dex marker(s) OP` | spinning-blender-same-side (proposed; not yet attested) | Spinning far Blender | Y |
| `spinning-drifter` | OP | `all 1 dex marker(s) OP` | Spinning near Drifter | Spinning far Drifter | Y |
| `spinning-ducking-blender` | OP | `all 1 dex marker(s) OP` | spinning-ducking-blender-same-side (proposed; not yet attested) | Spinning Ducking far Blender | Y |
| `spinning-ducking-drifter` | OP | `all 1 dex marker(s) OP` | spinning-ducking-drifter-same-side (proposed; not yet attested) | Spinning Ducking far Drifter | Y |
| `spinning-ducking-whirl` | OP | `all 1 dex marker(s) OP` | spinning-ducking-whirl-same-side (proposed; not yet attested) | Spinning Ducking far Whirl | Y |
| `spinning-eggbeater` | OP | `all 2 dex marker(s) OP` | Spinning near Eggbeater | far-spinning-eggbeater / spinning-eggbeater-op (would be alias of spinning-eggbeater) | Y |
| `stepping-blender` | OP | `all 2 dex marker(s) OP` | stepping-blender-same-side (proposed; not yet attested) | Stepping far Blender | Y |
| `stepping-clipper` | OP | `all 1 dex marker(s) OP` | stepping-clipper-same-side (proposed; not yet attested) | Stepping far Clipper | Y |
| `stepping-dyno` | OP | `all 2 dex marker(s) OP` | stepping-dyno-same-side (proposed; not yet attested) | Stepping Far Dyno | Y |
| `stepping-illusion` | OP | `all 2 dex marker(s) OP` | stepping-illusion-same-side (proposed; not yet attested) | Stepping far Illusion |  |
| `stepping-legover` | OP | `all 2 dex marker(s) OP` | Stepping near Legover | far-stepping-legover / stepping-legover-op (would be alias of stepping-legover) |  |
| `stepping-mirage` | OP | `all 2 dex marker(s) OP` | stepping-mirage-same-side (proposed; not yet attested) | Stepping far Mirage | Y |
| `stepping-osis` | OP | `all 1 dex marker(s) OP` | Stepping Osis (same side) | far-stepping-osis / stepping-osis-op (would be alias of stepping-osis) | Y |
| `stepping-pickup` | OP | `all 2 dex marker(s) OP` | Stepping Pickup (same side) | far-stepping-pickup / stepping-pickup-op (would be alias of stepping-pickup) | Y |
| `surging-ducking-blender` | OP | `all 2 dex marker(s) OP` | surging-ducking-blender-same-side (proposed; not yet attested) | Surging Ducking far Blender | Y |
| `surging-osis` | OP | `all 1 dex marker(s) OP` | Surging ss Osis | far-surging-osis / surging-osis-op (would be alias of surging-osis) | Y |
| `symposium-reverse-whirl` | OP | `all 1 dex marker(s) OP` | symposium-reverse-whirl-same-side (proposed; not yet attested) | Far Symposium Reverse Whirl | Y |
| `toe-spinning-torque` | OP | `all 1 dex marker(s) OP` | Toe Spinning near Torque | far-toe-spinning-torque / toe-spinning-torque-op (would be alias of toe-spinning-torque) | Y |
| `torque` | OP | `all 1 dex marker(s) OP` | Torque (same side) | far-torque / torque-op (would be alias of torque) | Y |
| `whirl` | OP | `all 1 dex marker(s) OP` | Whirl (same side) | far-whirl / whirl-op (would be alias of whirl) | Y |
| `whirling-mirage` | OP | `all 2 dex marker(s) OP` | Whirling ss Mirage | Whirling far Mirage |  |
| `whirling-pickup` | OP | `all 2 dex marker(s) OP` | Whirling ss Pickup | far-whirling-pickup / whirling-pickup-op (would be alias of whirling-pickup) | Y |
| `whirling-whirl` | OP | `all 2 dex marker(s) OP` | whirling-whirl-same-side (proposed; not yet attested) | Whirling far Whirl | Y |
| `fairy-barrage` | SAME | `all 3 dex marker(s) SAME` | far-fairy-barrage (proposed; not yet attested) | Fairy ss Barrage | Y |
| `fairy-clipper` | SAME | `all 1 dex marker(s) SAME` | far-fairy-clipper (proposed; not yet attested) | Fairy ss Clipper | Y |
| `fairy-osis` | SAME | `all 1 dex marker(s) SAME` | far-fairy-osis (proposed; not yet attested) | Fairy ss Osis | Y |
| `fairy-reverse-guay` | SAME | `all 2 dex marker(s) SAME` | far-fairy-reverse-guay (proposed; not yet attested) | Fairy ss Reverse Guay | Y |
| `fairy-reverse-whirl` | SAME | `all 2 dex marker(s) SAME` | far-fairy-reverse-whirl (proposed; not yet attested) | Fairy ss Reverse Whirl | Y |
| `fairy-swirl` | SAME | `all 2 dex marker(s) SAME` | far-fairy-swirl (proposed; not yet attested) | Fairy ss Swirl | Y |
| `fairy-swirling-swirl` | SAME | `all 3 dex marker(s) SAME` | far-fairy-swirling-swirl (proposed; not yet attested) | Fairy near Swirling near Swirl | Y |
| `inspinning-butterfly` | SAME | `all 1 dex marker(s) SAME` | far-inspinning-butterfly (proposed; not yet attested) | Inspinning Same Side Butterfly | Y |
| `pixie-clipper` | SAME | `all 1 dex marker(s) SAME` | Pixie Opposite Clipper | Pixie Same Clipper; Pixie ss Clipper | Y |
| `pixie-double-over-down` | SAME | `all 3 dex marker(s) SAME` | far-pixie-double-over-down (proposed; not yet attested) | Pixie ss Double Over Down | Y |
| `pixie-osis` | SAME | `all 1 dex marker(s) SAME` | far-pixie-osis (proposed; not yet attested) | Pixie ss Osis | Y |
| `pixie-reverse-guay` | SAME | `all 2 dex marker(s) SAME` | far-pixie-reverse-guay (proposed; not yet attested) | Pixie ss Reverse Guay | Y |
| `pixie-reverse-whirl` | SAME | `all 2 dex marker(s) SAME` | far-pixie-reverse-whirl (proposed; not yet attested) | Pixie ss Reverse Whirl | Y |
| `swirl` | SAME | `all 1 dex marker(s) SAME` | Far Swirl | swirl-same-side / swirl-ss (would be alias of swirl) | Y |
| `swirling-swirl` | SAME | `all 2 dex marker(s) SAME` | far-swirling-swirl (proposed; not yet attested) | Swirling near Swirl | Y |

## Held out — non-unanimous dex markers (75)

Positional families whose base notation has dexes on different sides, so the side qualifier's target (and thus the default polarity) is not determinable from notation alone. Excluded from the HIGH-confidence registry pending per-trick adjudication.

| base | reason |
|---|---|
| `barraging-butterfly` | dex markers not unanimous: ['OP', 'SAME', 'AMBIG'] |
| `barraging-eggbeater` | dex markers not unanimous: ['OP', 'SAME', 'OP', 'OP'] |
| `barraging-illusion` | dex markers not unanimous: ['OP', 'SAME', 'OP'] |
| `barraging-legover` | dex markers not unanimous: ['OP', 'SAME', 'OP'] |
| `barraging-mirage` | dex markers not unanimous: ['OP', 'SAME', 'OP'] |
| `barraging-osis` | dex markers not unanimous: ['OP', 'SAME'] |
| `barraging-whirl` | dex markers not unanimous: ['OP', 'SAME', 'OP'] |
| `butterfly` | dex markers not unanimous: ['AMBIG'] |
| `butterfly-swirl` | dex markers not unanimous: ['AMBIG', 'OP'] |
| `clipper` | no scored dex in notation |
| `ducking-osis` | no scored dex in notation |
| `fairy-blender` | dex markers not unanimous: ['SAME', 'OP'] |
| `fairy-butterfly` | dex markers not unanimous: ['SAME', 'AMBIG'] |
| `fairy-double-pickup` | dex markers not unanimous: ['SAME', 'OP', 'SAME'] |
| `fairy-drifter` | dex markers not unanimous: ['SAME', 'OP'] |
| `fairy-dyno` | dex markers not unanimous: ['SAME', 'OP'] |
| `fairy-eggbeater` | dex markers not unanimous: ['SAME', 'OP', 'OP'] |
| `fairy-guay` | dex markers not unanimous: ['SAME', 'OP'] |
| `fairy-illusion` | dex markers not unanimous: ['SAME', 'OP'] |
| `fairy-legover` | dex markers not unanimous: ['SAME', 'OP'] |
| `fairy-mirage` | dex markers not unanimous: ['SAME', 'OP'] |
| `fairy-pickup` | dex markers not unanimous: ['SAME', 'OP'] |
| `fairy-reverse-swirl` | dex markers not unanimous: ['SAME', 'OP'] |
| `fairy-symposium-mirage` | dex markers not unanimous: ['SAME', 'OP'] |
| `fairy-symposium-whirl` | dex markers not unanimous: ['SAME', 'OP'] |
| `fairy-torque` | dex markers not unanimous: ['SAME', 'OP'] |
| `fairy-whirl` | dex markers not unanimous: ['SAME', 'OP'] |
| `nuclear-dyno` | dex markers not unanimous: ['SAME', 'OP'] |
| `nuclear-guay` | dex markers not unanimous: ['SAME', 'OP'] |
| `nuclear-illusion` | dex markers not unanimous: ['SAME', 'OP'] |
| `nuclear-legover` | dex markers not unanimous: ['SAME', 'OP'] |
| `nuclear-pickup` | dex markers not unanimous: ['SAME', 'OP'] |
| `nuclear-whirl` | dex markers not unanimous: ['SAME', 'OP'] |
| `osis` | no scored dex in notation |
| `pixie-barrage` | dex markers not unanimous: ['SAME', 'OP', 'SAME'] |
| `pixie-blender` | dex markers not unanimous: ['SAME', 'OP'] |
| `pixie-diving-butterfly` | dex markers not unanimous: ['SAME', 'AMBIG'] |
| `pixie-ducking-mirage` | dex markers not unanimous: ['SAME', 'OP'] |
| `pixie-dyno` | dex markers not unanimous: ['SAME', 'OP'] |
| `pixie-eggbeater` | dex markers not unanimous: ['SAME', 'OP', 'OP'] |
| `pixie-flail` | dex markers not unanimous: ['SAME', 'OP'] |
| `pixie-guay` | dex markers not unanimous: ['SAME', 'OP'] |
| `pixie-legover` | dex markers not unanimous: ['SAME', 'OP'] |
| `pixie-mirage` | dex markers not unanimous: ['SAME', 'OP'] |
| `pixie-pickup` | dex markers not unanimous: ['SAME', 'OP'] |
| `pixie-reverse-swirl` | dex markers not unanimous: ['SAME', 'OP'] |
| `pixie-swirl` | dex markers not unanimous: ['SAME', 'AMBIG'] |
| `pixie-symposium-eggbeater` | dex markers not unanimous: ['SAME', 'OP', 'OP'] |
| `pixie-symposium-illusion` | dex markers not unanimous: ['SAME', 'OP'] |
| `pixie-symposium-mirage` | dex markers not unanimous: ['SAME', 'OP'] |
| `pixie-symposium-reverse-whirl` | dex markers not unanimous: ['SAME', 'OP'] |
| `pixie-torque` | dex markers not unanimous: ['SAME', 'OP'] |
| `pixie-whirl` | dex markers not unanimous: ['SAME', 'OP'] |
| `quantum-butterfly` | dex markers not unanimous: ['OP', 'SAME'] |
| `sailing-butterfly` | dex markers not unanimous: ['SAME', 'OP', 'AMBIG'] |
| `sailing-legover` | dex markers not unanimous: ['SAME', 'OP', 'OP'] |
| `sailing-mirage` | dex markers not unanimous: ['SAME', 'OP', 'OP'] |
| `sailing-pickup` | dex markers not unanimous: ['SAME', 'OP', 'OP'] |
| `stepping-barrage` | dex markers not unanimous: ['OP', 'SAME', 'SAME'] |
| `stepping-butterfly` | dex markers not unanimous: ['OP', 'AMBIG'] |
| `stepping-butterfly-swirl` | dex markers not unanimous: ['OP', 'AMBIG', 'OP'] |
| `stepping-diving-butterfly` | dex markers not unanimous: ['OP', 'SAME'] |
| `stepping-ducking-butterfly` | dex markers not unanimous: ['OP', 'SAME'] |
| `stepping-ducking-butterfly-swirl` | dex markers not unanimous: ['OP', 'SAME', 'OP'] |
| `stepping-ducking-double-pickup` | dex markers not unanimous: ['OP', 'OP', 'SAME'] |
| `stepping-ducking-drifter` | dex markers not unanimous: ['OP', 'SAME'] |
| `stepping-eggbeater` | dex markers not unanimous: ['OP', 'SAME', 'OP'] |
| `stepping-reaper` | dex markers not unanimous: ['OP', 'SAME', 'SAME'] |
| `stepping-reverse-whirl` | dex markers not unanimous: ['OP', 'SAME'] |
| `stepping-swirl` | dex markers not unanimous: ['OP', 'SAME'] |
| `surging-mirage` | dex markers not unanimous: ['OP', 'SAME'] |
| `surging-whirl` | dex markers not unanimous: ['OP', 'SAME'] |
| `swirling-mirage` | dex markers not unanimous: ['SAME', 'OP'] |
| `toe-flurry` | dex markers not unanimous: ['OP', 'SAME', 'OP'] |
| `whirling-butterfly` | dex markers not unanimous: ['OP', 'AMBIG'] |

## Full operational_notation for each registry base (audit trail)

- `atomic-blender` (OP): `TOE > OP OUT [DEX] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]`
- `atomic-butterfly` (OP): `TOE > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]`
- `atomic-ducking-torque` (OP): `TOE > OP OUT [DEX] > DUCK [BOD] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]`
- `atomic-eggbeater` (OP): `TOE > OP OUT [DEX] > OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]`
- `atomic-illusion` (OP): `TOE > OP OUT [DEX] > OP OUT [DEX] > OP TOE [DEL]`
- `atomic-osis` (OP): `TOE > OP OUT [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]`
- `blender` (OP): `SET > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]`
- `clipper-diving-whirl` (OP): `CLIP > DIVE [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]`
- `clipper-ducking-blender` (OP): `CLIP > DUCK [BOD] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]`
- `clipper-ducking-drifter` (OP): `CLIP > DUCK [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL]`
- `clipper-ducking-whirl` (OP): `CLIP > DUCK [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]`
- `double-over-down` (OP): `TOE > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]`
- `drifter` (OP): `SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]`
- `ducking-legover` (OP): `TOE > DUCK [BOD] > OP OUT [DEX] > SAME TOE [DEL]`
- `ducking-pickup` (OP): `TOE > DUCK [BOD] > OP IN [DEX] > SAME TOE [DEL]`
- `ducking-symposium-reverse-whirl` (OP): `SET > DUCK [BOD] > (no plant while) OP OUT [BOD] [DEX] > OP CLIP [XBD] [DEL]`
- `dyno` (OP): `SET > OP OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]`
- `guay` (OP): `SET > OP IN [DEX] > SAME INSIDE [DEL]`
- `inspinning-illusion` (OP): `TOE > (front) SPIN [BOD] > OP OUT [DEX] > OP TOE [DEL]`
- `inspinning-mirage` (OP): `TOE > (front) SPIN [BOD] > OP IN [DEX] > OP TOE [DEL]`
- `legover` (OP): `SET > OP OUT [DEX] > SAME TOE [DEL]`
- `miraging-clipper` (OP): `SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]`
- `miraging-osis` (OP): `SET > OP IN [DEX] > (back or front) SPIN [BOD] > SAME/OP CLIP [XBD] [DEL]`
- `pickup` (OP): `SET > OP IN [DEX] > SAME TOE [DEL]`
- `pogo-pickup` (OP): `CLIP > (no plant while) OP IN [DEX] > OP IN [DEX] > SAME TOE [DEL]`
- `quantum-illusion` (OP): `TOE > OP IN [DEX] > OP OUT [DEX] > OP TOE [DEL]`
- `quantum-legover` (OP): `TOE > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]`
- `quantum-mirage` (OP): `TOE > OP IN [DEX] > OP IN [DEX] > OP TOE [DEL]`
- `quantum-torque` (OP): `TOE > OP IN [DEX] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]`
- `shooting-clipper` (OP): `CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] > OP CLIP [XBD] [DEL]`
- `shooting-illusion` (OP): `CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] > OP OUT [DEX] > OP TOE [DEL]`
- `shooting-legover` (OP): `CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] > OP OUT [DEX] > SAME TOE [DEL]`
- `shooting-mirage` (OP): `CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] > OP IN [DEX] > OP TOE [DEL]`
- `shooting-pickup` (OP): `CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] > OP IN [DEX] > SAME TOE [DEL]`
- `spinning-blender` (OP): `CLIP > (back) SPIN [BOD] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]`
- `spinning-drifter` (OP): `CLIP > (back) SPIN [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL]`
- `spinning-ducking-blender` (OP): `CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]`
- `spinning-ducking-drifter` (OP): `TOE > (back) SPIN [BOD] > DUCK [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL]`
- `spinning-ducking-whirl` (OP): `CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]`
- `spinning-eggbeater` (OP): `TOE > (back) SPIN [BOD] > OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]`
- `stepping-blender` (OP): `CLIP > OP IN [DEX] >> OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]`
- `stepping-clipper` (OP): `CLIP > OP IN [DEX] > SAME CLIP [XBD] [DEL]`
- `stepping-dyno` (OP): `CLIP > OP IN [DEX] > OP OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]`
- `stepping-illusion` (OP): `CLIP > OP IN [DEX] >> OP OUT [DEX] > OP TOE [DEL]`
- `stepping-legover` (OP): `CLIP > OP IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL]`
- `stepping-mirage` (OP): `CLIP > OP IN [DEX] >> OP IN [DEX] > OP TOE [DEL]`
- `stepping-osis` (OP): `CLIP > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]`
- `stepping-pickup` (OP): `CLIP > OP IN [DEX] > OP IN [DEX] > SAME TOE [DEL]`
- `surging-ducking-blender` (OP): `CLIP > OP IN [DEX] >> (back) SPIN [BOD] >> DUCK [BOD] >> OP IN [DEX] > (front) SPIN [BOD] > SAME CLIP [XBD] [DEL]`
- `surging-osis` (OP): `CLIP > OP IN [DEX] >> (back) SPIN [BOD] > (front) SPIN [BOD] > SAME CLIP [XBD] [DEL]`
- `symposium-reverse-whirl` (OP): `SET > (no plant while) OP OUT [BOD] [DEX] > OP CLIP [XBD] [DEL]`
- `toe-spinning-torque` (OP): `TOE > (back) SPIN [BOD] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]`
- `torque` (OP): `SET > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]`
- `whirl` (OP): `SET > OP IN [DEX] > OP CLIP [XBD] [DEL]`
- `whirling-mirage` (OP): `SET > OP FRONT WHIRL [DEX] > OP IN [DEX] > OP TOE [DEL]`
- `whirling-pickup` (OP): `SET > OP FRONT WHIRL [DEX] > OP IN [DEX] > SAME TOE [DEL]`
- `whirling-whirl` (OP): `SET > OP FRONT WHIRL [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]`
- `fairy-barrage` (SAME): `TOE > SAME OUT [DEX] > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]`
- `fairy-clipper` (SAME): `TOE > SAME OUT [DEX] > SAME CLIP [XBD] [DEL]`
- `fairy-osis` (SAME): `TOE > SAME OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]`
- `fairy-reverse-guay` (SAME): `TOE > SAME OUT [DEX] >> SAME IN [DEX] > OP INSIDE [DEL]`
- `fairy-reverse-whirl` (SAME): `TOE > SAME OUT [DEX] >> SAME IN [DEX] > SAME CLIP [XBD] [DEL]`
- `fairy-swirl` (SAME): `TOE > SAME OUT [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]`
- `fairy-swirling-swirl` (SAME): `TOE > SAME OUT [DEX] > SAME BACK SWIRL [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]`
- `inspinning-butterfly` (SAME): `CLIP > (front) SPIN [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]`
- `pixie-clipper` (SAME): `TOE > SAME IN [DEX] > SAME/OP CLIP [XBD] [DEL]`
- `pixie-double-over-down` (SAME): `TOE > SAME IN [DEX] (plant) > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]`
- `pixie-osis` (SAME): `TOE > SAME IN [DEX] >> (front) SPIN [BOD] > OP CLIP [XBD] [DEL]`
- `pixie-reverse-guay` (SAME): `TOE > SAME IN [DEX] >> SAME IN [DEX] > OP INSIDE [DEL]`
- `pixie-reverse-whirl` (SAME): `TOE > SAME IN [DEX] >> SAME IN [DEX] > SAME CLIP [XBD] [DEL]`
- `swirl` (SAME): `CLIP > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]`
- `swirling-swirl` (SAME): `CLIP > SAME BACK SWIRL [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]`
