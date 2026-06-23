# EV positional frontier — gated re-run (variability doctrine, 2026-06-23)

## FROZEN DOCTRINE

> A positional qualifier is meaningful only when the notation contains at least two **independently variable** side-bearing components (dexes and/or catches). If all side-bearing components are fixed to a single relationship, the qualifier cannot create a distinct variant.

Reproduce: `python3 exploration/positional-evidence-audit-2026-06-23/ev_rerun.py`. Per-name CSV: `ev_rerun_gated.csv`.

## Doctrine validation (named cases + consequences)

| case | base | verdict | reason |
|---|---|:--:|---|
| `pixie-same-clipper` | `pixie-clipper` | OK | 1 dex+catch; ambiguous slot |
| `pixie-opposite-clipper` | `pixie-clipper` | OK | 1 dex+catch; ambiguous slot |
| `whirl-same-side` | `whirl` | not | 1 dex+catch; all slots fixed |
| `torque-same-side` | `torque` | not | 1 dex+catch; all slots fixed |
| `butterfly-same-side` | `butterfly` | OK | 1 dex+catch; ambiguous slot |
| `osis-same-side` | `osis` | not | 0 dex+catch; ambiguous slot |

## Buckets (gateable rows: base notation known)

| bucket | meaning | count |
|---|---|---:|
| **A** | well-formed, unique target | **114** |
| **B** | well-formed, ambiguous target (>=2 candidates) | **42** |
| **C** | fixed relationship, non-distinct | **43** |
| D | pending (base notation not authored) | 244 |

## Bucket A — well-formed, unique target (114)

| name | base | detail |
|---|---|---|
| Atomic Ducking far Torque | `atomic-ducking-torque` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Atomic far Blender | `atomic-blender` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Atomic far Butterfly | `atomic-butterfly` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Atomic far Eggbeater | `atomic-eggbeater` | well-formed, redundant (qualifier already satisfied) (3 dex+catch; >=2 dexes) |
| Barraging far Eggbeater | `barraging-eggbeater` | well-formed, unique target (4 dex+catch; >=2 dexes) |
| Barraging far Illusion | `barraging-illusion` | well-formed, unique target (3 dex+catch; >=2 dexes) |
| Barraging far Legover | `barraging-legover` | well-formed, unique target (3 dex+catch; >=2 dexes) |
| Barraging far Mirage | `barraging-mirage` | well-formed, unique target (3 dex+catch; >=2 dexes) |
| Barraging far Osis | `barraging-osis` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Barraging far Whirl | `barraging-whirl` | well-formed, unique target (3 dex+catch; >=2 dexes) |
| Butterfly (same side) | `butterfly` | well-formed, unique target (1 dex+catch; ambiguous slot) |
| Fairy Illusion (same side) | `fairy-illusion` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy Legover (same side) | `fairy-legover` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy Mirage (same side) | `fairy-mirage` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy Pickup (same side) | `fairy-pickup` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy Same Side Mirage | `fairy-mirage` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy Same Side Whirl | `fairy-whirl` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy Symposium Mirage (same side) | `fairy-symposium-mirage` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy Torque (same side) | `fairy-torque` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy Whirl (same side) | `fairy-whirl` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy far Illusion | `fairy-illusion` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy far Mirage | `fairy-mirage` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy near Pickup | `fairy-pickup` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy near Swirling near Swirl | `fairy-swirling-swirl` | well-formed, redundant (qualifier already satisfied) (3 dex+catch; >=2 dexes) |
| Fairy ss Barrage | `fairy-barrage` | well-formed, redundant (qualifier already satisfied) (3 dex+catch; >=2 dexes) |
| Fairy ss Blender | `fairy-blender` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy ss Butterfly | `fairy-butterfly` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy ss Double Pickup | `fairy-double-pickup` | well-formed, unique target (3 dex+catch; >=2 dexes) |
| Fairy ss Drifter | `fairy-drifter` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy ss Dyno | `fairy-dyno` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy ss Guay | `fairy-guay` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy ss Illusion | `fairy-illusion` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy ss Legover | `fairy-legover` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy ss Mirage | `fairy-mirage` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy ss Reverse Guay | `fairy-reverse-guay` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Fairy ss Reverse Swirl | `fairy-reverse-swirl` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy ss Reverse Whirl | `fairy-reverse-whirl` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Fairy ss Swirl | `fairy-swirl` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Fairy ss Symposium Mirage | `fairy-symposium-mirage` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy ss Symposium Whirl | `fairy-symposium-whirl` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy ss Torque | `fairy-torque` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Fairy ss Whirl | `fairy-whirl` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Far Double Over Down | `double-over-down` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Miraging far Osis | `miraging-osis` | well-formed, unique target (1 dex+catch; ambiguous slot) |
| Nuclear Illusion (same side) | `nuclear-illusion` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Nuclear Legover (same side) | `nuclear-legover` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Nuclear Pickup (same side) | `nuclear-pickup` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Nuclear ss Dyno | `nuclear-dyno` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Nuclear ss Guay | `nuclear-guay` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Nuclear ss Illusion | `nuclear-illusion` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Nuclear ss Legover | `nuclear-legover` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Nuclear ss Pickup | `nuclear-pickup` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Nuclear ss Whirl | `nuclear-whirl` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie Diving near Butterfly | `pixie-diving-butterfly` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie Double Pickup (ss) | `pixie-double-pickup` | well-formed, unique target (3 dex+catch; >=2 dexes) |
| Pixie Ducking far Mirage | `pixie-ducking-mirage` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie Legover (same side) | `pixie-legover` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie Mirage (same side) | `pixie-mirage` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie Opposite Clipper | `pixie-clipper` | well-formed, unique target (1 dex+catch; ambiguous slot) |
| Pixie Pickup (same side) | `pixie-pickup` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie Same Clipper | `pixie-clipper` | well-formed, unique target (1 dex+catch; ambiguous slot) |
| Pixie Symposium Illusion (same side) | `pixie-symposium-illusion` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie Symposium Mirage (same side) | `pixie-symposium-mirage` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie Torque (same side) | `pixie-torque` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie Whirl (same side) | `pixie-whirl` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie far Eggbeater | `pixie-eggbeater` | well-formed, unique target (3 dex+catch; >=2 dexes) |
| Pixie far Legover | `pixie-legover` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie far Pickup | `pixie-pickup` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie near Legover | `pixie-legover` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie ss Barrage | `pixie-barrage` | well-formed, unique target (3 dex+catch; >=2 dexes) |
| Pixie ss Blender | `pixie-blender` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie ss Clipper | `pixie-clipper` | well-formed, unique target (1 dex+catch; ambiguous slot) |
| Pixie ss Double Over Down | `pixie-double-over-down` | well-formed, redundant (qualifier already satisfied) (3 dex+catch; >=2 dexes) |
| Pixie ss Dyno | `pixie-dyno` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie ss Flail | `pixie-flail` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie ss Guay | `pixie-guay` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie ss Mirage | `pixie-mirage` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie ss Pickup | `pixie-pickup` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie ss Reverse Guay | `pixie-reverse-guay` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Pixie ss Reverse Swirl | `pixie-reverse-swirl` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie ss Reverse Whirl | `pixie-reverse-whirl` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Pixie ss Swirl | `pixie-swirl` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie ss Symposium Mirage | `pixie-symposium-mirage` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie ss Symposium Reverse Whirl | `pixie-symposium-reverse-whirl` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie ss Torque | `pixie-torque` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Pixie ss Whirl | `pixie-whirl` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Quantum Butterfly (same side) | `quantum-butterfly` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Quantum far Butterfly | `quantum-butterfly` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Quantum far Mirage | `quantum-mirage` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Quantum far Torque | `quantum-torque` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Quantum near Butterfly | `quantum-butterfly` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Stepping Diving ss Butterfly | `stepping-diving-butterfly` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Stepping Ducking Butterfly (same side) | `stepping-ducking-butterfly` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Stepping Ducking Far Butterfly | `stepping-ducking-butterfly` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Stepping Ducking Far Butterfly Swirl | `stepping-ducking-butterfly-swirl` | well-formed, unique target (3 dex+catch; >=2 dexes) |
| Stepping Ducking Far Double Pickup | `stepping-ducking-double-pickup` | well-formed, unique target (3 dex+catch; >=2 dexes) |
| Stepping Ducking far Drifter | `stepping-ducking-drifter` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Stepping Far Butterfly | `stepping-butterfly` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Stepping Far Butterfly Swirl | `stepping-butterfly-swirl` | well-formed, unique target (3 dex+catch; >=2 dexes) |
| Stepping Far Dyno | `stepping-dyno` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Stepping Opposite Side Reverse Whirl | `stepping-reverse-whirl` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Stepping far Blender | `stepping-blender` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Stepping far Eggbeater | `stepping-eggbeater` | well-formed, unique target (3 dex+catch; >=2 dexes) |
| Stepping far Illusion | `stepping-illusion` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Stepping far Mirage | `stepping-mirage` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Stepping far Swirl | `stepping-swirl` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Surging Ducking far Blender | `surging-ducking-blender` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Surging far Mirage | `surging-mirage` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Surging far Whirl | `surging-whirl` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Swirling near Swirl | `swirling-swirl` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Swirling ss Mirage | `swirling-mirage` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Whirling far Butterfly | `whirling-butterfly` | well-formed, unique target (2 dex+catch; >=2 dexes) |
| Whirling far Mirage | `whirling-mirage` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |
| Whirling far Whirl | `whirling-whirl` | well-formed, redundant (qualifier already satisfied) (2 dex+catch; >=2 dexes) |

## Bucket B — well-formed, ambiguous target (42)

| name | base | detail |
|---|---|---|
| Atomic Butterfly (same side) | `atomic-butterfly` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Atomic Illusion (same side) | `atomic-illusion` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Atomic Pickup (same side) | `atomic-pickup` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Atomic near Butterfly | `atomic-butterfly` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Barraging Butterfly (same side) | `barraging-butterfly` | well-formed, 2 candidate targets (3 dex+catch; >=2 dexes) |
| Barraging far Butterfly | `barraging-butterfly` | well-formed, 2 candidate targets (3 dex+catch; >=2 dexes) |
| Barraging near Butterfly | `barraging-butterfly` | well-formed, 2 candidate targets (3 dex+catch; >=2 dexes) |
| Butterfly Swirl (same side) | `butterfly-swirl` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Fairy far Butterfly | `fairy-butterfly` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Fairy ss Eggbeater | `fairy-eggbeater` | well-formed, 2 candidate targets (3 dex+catch; >=2 dexes) |
| Pixie ss Eggbeater | `pixie-eggbeater` | well-formed, 2 candidate targets (3 dex+catch; >=2 dexes) |
| Pixie ss Symposium Eggbeater | `pixie-symposium-eggbeater` | well-formed, 2 candidate targets (3 dex+catch; >=2 dexes) |
| Pogo ss Pickup | `pogo-pickup` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Quantum Illusion (same side) | `quantum-illusion` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Quantum Legover (same side) | `quantum-legover` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Quantum Mirage (same side) | `quantum-mirage` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Quantum Pickup (same side) | `quantum-pickup` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Sailing ss Butterfly | `sailing-butterfly` | well-formed, 2 candidate targets (3 dex+catch; >=2 dexes) |
| Sailing ss Legover | `sailing-legover` | well-formed, 2 candidate targets (3 dex+catch; >=2 dexes) |
| Sailing ss Mirage | `sailing-mirage` | well-formed, 2 candidate targets (3 dex+catch; >=2 dexes) |
| Sailing ss Pickup | `sailing-pickup` | well-formed, 2 candidate targets (3 dex+catch; >=2 dexes) |
| Shooting ss Clipper | `shooting-clipper` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Shooting ss Illusion | `shooting-illusion` | well-formed, 3 candidate targets (3 dex+catch; >=2 dexes) |
| Shooting ss Legover | `shooting-legover` | well-formed, 3 candidate targets (3 dex+catch; >=2 dexes) |
| Shooting ss Mirage | `shooting-mirage` | well-formed, 3 candidate targets (3 dex+catch; >=2 dexes) |
| Shooting ss Pickup | `shooting-pickup` | well-formed, 3 candidate targets (3 dex+catch; >=2 dexes) |
| Spinning near Eggbeater | `spinning-eggbeater` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Stepping Blender (same side) | `stepping-blender` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Stepping Butterfly (same side) | `stepping-butterfly` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Stepping Eggbeater (same side) | `stepping-eggbeater` | well-formed, 2 candidate targets (3 dex+catch; >=2 dexes) |
| Stepping Illusion (same side) | `stepping-illusion` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Stepping Legover (same side) | `stepping-legover` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Stepping Mirage (same side) | `stepping-mirage` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Stepping Opposite Reaper | `stepping-reaper` | well-formed, 2 candidate targets (3 dex+catch; >=2 dexes) |
| Stepping Pickup (same side) | `stepping-pickup` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Stepping far Barrage | `stepping-barrage` | well-formed, 2 candidate targets (3 dex+catch; >=2 dexes) |
| Stepping near Butterfly | `stepping-butterfly` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Stepping near Butterfly Swirl | `stepping-butterfly-swirl` | well-formed, 3 candidate targets (3 dex+catch; >=2 dexes) |
| Stepping near Legover | `stepping-legover` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Toe near Flurry | `toe-flurry` | well-formed, 2 candidate targets (3 dex+catch; >=2 dexes) |
| Whirling ss Mirage | `whirling-mirage` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |
| Whirling ss Pickup | `whirling-pickup` | well-formed, 2 candidate targets (2 dex+catch; >=2 dexes) |

## Bucket C — fixed relationship, non-distinct (43)

| name | base | detail |
|---|---|---|
| Atomic ss Osis | `atomic-osis` | fixed relationship (1 dex+catch; all slots fixed) |
| Blender (same side) | `blender` | fixed relationship (1 dex+catch; all slots fixed) |
| Clipper Diving near Whirl | `clipper-diving-whirl` | fixed relationship (1 dex+catch; all slots fixed) |
| Clipper Ducking far Blender | `clipper-ducking-blender` | fixed relationship (1 dex+catch; all slots fixed) |
| Clipper Ducking far Drifter | `clipper-ducking-drifter` | fixed relationship (1 dex+catch; all slots fixed) |
| Clipper Ducking far Whirl | `clipper-ducking-whirl` | fixed relationship (1 dex+catch; all slots fixed) |
| Drifter (same-side) | `drifter` | fixed relationship (1 dex+catch; all slots fixed) |
| Ducking Far Legover | `ducking-legover` | fixed relationship (1 dex+catch; all slots fixed) |
| Ducking Far Osis | `ducking-osis` | fixed relationship (0 dex+catch; ambiguous slot) |
| Ducking Far Pickup | `ducking-pickup` | fixed relationship (1 dex+catch; all slots fixed) |
| Ducking Far Symposium Reverse Whirl | `ducking-symposium-reverse-whirl` | fixed relationship (1 dex+catch; all slots fixed) |
| Dyno (far) | `dyno` | fixed relationship (1 dex+catch; all slots fixed) |
| Dyno (same side) | `dyno` | fixed relationship (1 dex+catch; all slots fixed) |
| Fairy ss Clipper | `fairy-clipper` | fixed relationship (1 dex+catch; all slots fixed) |
| Fairy ss Osis | `fairy-osis` | fixed relationship (1 dex+catch; all slots fixed) |
| Far Clipper | `clipper` | fixed relationship (0 dex; all slots fixed) |
| Far Dyno | `dyno` | fixed relationship (1 dex+catch; all slots fixed) |
| Far Guay | `guay` | fixed relationship (1 dex+catch; all slots fixed) |
| Far Legover | `legover` | fixed relationship (1 dex+catch; all slots fixed) |
| Far Osis | `osis` | fixed relationship (0 dex+catch; ambiguous slot) |
| Far Pickup | `pickup` | fixed relationship (1 dex+catch; all slots fixed) |
| Far Swirl | `swirl` | fixed relationship (1 dex+catch; all slots fixed) |
| Far Symposium Reverse Whirl | `symposium-reverse-whirl` | fixed relationship (1 dex+catch; all slots fixed) |
| Inspinning Same Side Butterfly | `inspinning-butterfly` | fixed relationship (1 dex+catch; all slots fixed) |
| Inspinning Same Side Illusion | `inspinning-illusion` | fixed relationship (1 dex+catch; all slots fixed) |
| Inspinning Same Side Mirage | `inspinning-mirage` | fixed relationship (1 dex+catch; all slots fixed) |
| Miraging far Clipper | `miraging-clipper` | fixed relationship (1 dex+catch; all slots fixed) |
| Osis (far) | `osis` | fixed relationship (0 dex+catch; ambiguous slot) |
| Osis (same side) | `osis` | fixed relationship (0 dex+catch; ambiguous slot) |
| Pixie ss Osis | `pixie-osis` | fixed relationship (1 dex+catch; all slots fixed) |
| Spinning Ducking far Blender | `spinning-ducking-blender` | fixed relationship (1 dex+catch; all slots fixed) |
| Spinning Ducking far Drifter | `spinning-ducking-drifter` | fixed relationship (1 dex+catch; all slots fixed) |
| Spinning Ducking far Whirl | `spinning-ducking-whirl` | fixed relationship (1 dex+catch; all slots fixed) |
| Spinning far Blender | `spinning-blender` | fixed relationship (1 dex+catch; all slots fixed) |
| Spinning far Drifter | `spinning-drifter` | fixed relationship (1 dex+catch; all slots fixed) |
| Spinning near Drifter | `spinning-drifter` | fixed relationship (1 dex+catch; all slots fixed) |
| Stepping Clipper (same side) | `stepping-clipper` | fixed relationship (1 dex+catch; all slots fixed) |
| Stepping Osis (same side) | `stepping-osis` | fixed relationship (1 dex+catch; all slots fixed) |
| Stepping far Clipper | `stepping-clipper` | fixed relationship (1 dex+catch; all slots fixed) |
| Surging ss Osis | `surging-osis` | fixed relationship (1 dex+catch; all slots fixed) |
| Toe Spinning near Torque | `toe-spinning-torque` | fixed relationship (1 dex+catch; all slots fixed) |
| Torque (same side) | `torque` | fixed relationship (1 dex+catch; all slots fixed) |
| Whirl (same side) | `whirl` | fixed relationship (1 dex+catch; all slots fixed) |

