# Implied alias/distinct verdicts vs the live system (2026-06-23)

Read-only. The 72-base polarity registry is FROZEN to `polarity_registry_frozen.csv`. Verdicts: for a base of default OP, `far-X` is an ALIAS and `X-same-side` is DISTINCT; for default SAME, the reverse.

Reproduce: `python3 exploration/positional-evidence-audit-2026-06-23/compare.py`

## Frozen registry counts

- Bases: **72** (OP 57, SAME 15). Frozen CSV: `polarity_registry_frozen.csv`.

## Mismatch counts (system decision != registry verdict)

| mismatch | meaning | count |
|---|---|---:|
| DISTINCT-as-ALIAS | a distinct variant was collapsed into an alias (lost trick) | **0** |
| ALIAS-as-CANONICAL | a redundant default-side form exists as its own active canonical | **1** |

## Agreement counts (system already matches the registry)

- ALIAS form correctly recorded as an alias: **2**
- DISTINCT form correctly an active canonical: **1**
- Registry-covered positional rows present but undecided (not active, not alias): **2**

## MISMATCH 1 — DISTINCT variant wrongly recorded as an alias

_none_

## MISMATCH 2 — ALIAS form wrongly an active canonical

| canonical slug | base | asserts | base default |
|---|---|:--:|:--:|
| `pixie-same-clipper` | `pixie-clipper` | same | SAME |

## Implied alias/distinct table (frozen registry, all 72)

| base | default | alias forms | distinct forms | evidence |
|---|:--:|---|---|---|
| `atomic-blender` | OP | far-atomic-blender / atomic-blender-op -> alias of atomic-blender | atomic-blender-same-side / atomic-blender-ss -> distinct | all 2 dex OP |
| `atomic-butterfly` | OP | far-atomic-butterfly / atomic-butterfly-op -> alias of atomic-butterfly | atomic-butterfly-same-side / atomic-butterfly-ss -> distinct | all 2 dex OP |
| `atomic-ducking-torque` | OP | far-atomic-ducking-torque / atomic-ducking-torque-op -> alias of atomic-ducking-torque | atomic-ducking-torque-same-side / atomic-ducking-torque-ss -> distinct | all 2 dex OP |
| `atomic-eggbeater` | OP | far-atomic-eggbeater / atomic-eggbeater-op -> alias of atomic-eggbeater | atomic-eggbeater-same-side / atomic-eggbeater-ss -> distinct | all 3 dex OP |
| `atomic-illusion` | OP | far-atomic-illusion / atomic-illusion-op -> alias of atomic-illusion | atomic-illusion-same-side / atomic-illusion-ss -> distinct | all 2 dex OP |
| `atomic-osis` | OP | far-atomic-osis / atomic-osis-op -> alias of atomic-osis | atomic-osis-same-side / atomic-osis-ss -> distinct | all 1 dex OP |
| `blender` | OP | far-blender / blender-op -> alias of blender | blender-same-side / blender-ss -> distinct | all 1 dex OP |
| `clipper-diving-whirl` | OP | far-clipper-diving-whirl / clipper-diving-whirl-op -> alias of clipper-diving-whirl | clipper-diving-whirl-same-side / clipper-diving-whirl-ss -> distinct | all 1 dex OP |
| `clipper-ducking-blender` | OP | far-clipper-ducking-blender / clipper-ducking-blender-op -> alias of clipper-ducking-blender | clipper-ducking-blender-same-side / clipper-ducking-blender-ss -> distinct | all 1 dex OP |
| `clipper-ducking-drifter` | OP | far-clipper-ducking-drifter / clipper-ducking-drifter-op -> alias of clipper-ducking-drifter | clipper-ducking-drifter-same-side / clipper-ducking-drifter-ss -> distinct | all 1 dex OP |
| `clipper-ducking-whirl` | OP | far-clipper-ducking-whirl / clipper-ducking-whirl-op -> alias of clipper-ducking-whirl | clipper-ducking-whirl-same-side / clipper-ducking-whirl-ss -> distinct | all 1 dex OP |
| `double-over-down` | OP | far-double-over-down / double-over-down-op -> alias of double-over-down | double-over-down-same-side / double-over-down-ss -> distinct | all 2 dex OP |
| `drifter` | OP | far-drifter / drifter-op -> alias of drifter | drifter-same-side / drifter-ss -> distinct | all 1 dex OP |
| `ducking-legover` | OP | far-ducking-legover / ducking-legover-op -> alias of ducking-legover | ducking-legover-same-side / ducking-legover-ss -> distinct | all 1 dex OP |
| `ducking-pickup` | OP | far-ducking-pickup / ducking-pickup-op -> alias of ducking-pickup | ducking-pickup-same-side / ducking-pickup-ss -> distinct | all 1 dex OP |
| `ducking-symposium-reverse-whirl` | OP | far-ducking-symposium-reverse-whirl / ducking-symposium-reverse-whirl-op -> alias of ducking-symposium-reverse-whirl | ducking-symposium-reverse-whirl-same-side / ducking-symposium-reverse-whirl-ss -> distinct | all 1 dex OP |
| `dyno` | OP | far-dyno / dyno-op -> alias of dyno | dyno-same-side / dyno-ss -> distinct | all 1 dex OP |
| `fairy-barrage` | SAME | fairy-barrage-same-side / fairy-barrage-ss -> alias of fairy-barrage | far-fairy-barrage / fairy-barrage-op -> distinct | all 3 dex SAME |
| `fairy-clipper` | SAME | fairy-clipper-same-side / fairy-clipper-ss -> alias of fairy-clipper | far-fairy-clipper / fairy-clipper-op -> distinct | all 1 dex SAME |
| `fairy-osis` | SAME | fairy-osis-same-side / fairy-osis-ss -> alias of fairy-osis | far-fairy-osis / fairy-osis-op -> distinct | all 1 dex SAME |
| `fairy-reverse-guay` | SAME | fairy-reverse-guay-same-side / fairy-reverse-guay-ss -> alias of fairy-reverse-guay | far-fairy-reverse-guay / fairy-reverse-guay-op -> distinct | all 2 dex SAME |
| `fairy-reverse-whirl` | SAME | fairy-reverse-whirl-same-side / fairy-reverse-whirl-ss -> alias of fairy-reverse-whirl | far-fairy-reverse-whirl / fairy-reverse-whirl-op -> distinct | all 2 dex SAME |
| `fairy-swirl` | SAME | fairy-swirl-same-side / fairy-swirl-ss -> alias of fairy-swirl | far-fairy-swirl / fairy-swirl-op -> distinct | all 2 dex SAME |
| `fairy-swirling-swirl` | SAME | fairy-swirling-swirl-same-side / fairy-swirling-swirl-ss -> alias of fairy-swirling-swirl | far-fairy-swirling-swirl / fairy-swirling-swirl-op -> distinct | all 3 dex SAME |
| `guay` | OP | far-guay / guay-op -> alias of guay | guay-same-side / guay-ss -> distinct | all 1 dex OP |
| `inspinning-butterfly` | SAME | inspinning-butterfly-same-side / inspinning-butterfly-ss -> alias of inspinning-butterfly | far-inspinning-butterfly / inspinning-butterfly-op -> distinct | all 1 dex SAME |
| `inspinning-illusion` | OP | far-inspinning-illusion / inspinning-illusion-op -> alias of inspinning-illusion | inspinning-illusion-same-side / inspinning-illusion-ss -> distinct | all 1 dex OP |
| `inspinning-mirage` | OP | far-inspinning-mirage / inspinning-mirage-op -> alias of inspinning-mirage | inspinning-mirage-same-side / inspinning-mirage-ss -> distinct | all 1 dex OP |
| `legover` | OP | far-legover / legover-op -> alias of legover | legover-same-side / legover-ss -> distinct | all 1 dex OP |
| `miraging-clipper` | OP | far-miraging-clipper / miraging-clipper-op -> alias of miraging-clipper | miraging-clipper-same-side / miraging-clipper-ss -> distinct | all 1 dex OP |
| `miraging-osis` | OP | far-miraging-osis / miraging-osis-op -> alias of miraging-osis | miraging-osis-same-side / miraging-osis-ss -> distinct | all 1 dex OP |
| `pickup` | OP | far-pickup / pickup-op -> alias of pickup | pickup-same-side / pickup-ss -> distinct | all 1 dex OP |
| `pixie-clipper` | SAME | pixie-clipper-same-side / pixie-clipper-ss -> alias of pixie-clipper | far-pixie-clipper / pixie-clipper-op -> distinct | all 1 dex SAME |
| `pixie-double-over-down` | SAME | pixie-double-over-down-same-side / pixie-double-over-down-ss -> alias of pixie-double-over-down | far-pixie-double-over-down / pixie-double-over-down-op -> distinct | all 3 dex SAME |
| `pixie-osis` | SAME | pixie-osis-same-side / pixie-osis-ss -> alias of pixie-osis | far-pixie-osis / pixie-osis-op -> distinct | all 1 dex SAME |
| `pixie-reverse-guay` | SAME | pixie-reverse-guay-same-side / pixie-reverse-guay-ss -> alias of pixie-reverse-guay | far-pixie-reverse-guay / pixie-reverse-guay-op -> distinct | all 2 dex SAME |
| `pixie-reverse-whirl` | SAME | pixie-reverse-whirl-same-side / pixie-reverse-whirl-ss -> alias of pixie-reverse-whirl | far-pixie-reverse-whirl / pixie-reverse-whirl-op -> distinct | all 2 dex SAME |
| `pogo-pickup` | OP | far-pogo-pickup / pogo-pickup-op -> alias of pogo-pickup | pogo-pickup-same-side / pogo-pickup-ss -> distinct | all 2 dex OP |
| `quantum-illusion` | OP | far-quantum-illusion / quantum-illusion-op -> alias of quantum-illusion | quantum-illusion-same-side / quantum-illusion-ss -> distinct | all 2 dex OP |
| `quantum-legover` | OP | far-quantum-legover / quantum-legover-op -> alias of quantum-legover | quantum-legover-same-side / quantum-legover-ss -> distinct | all 2 dex OP |
| `quantum-mirage` | OP | far-quantum-mirage / quantum-mirage-op -> alias of quantum-mirage | quantum-mirage-same-side / quantum-mirage-ss -> distinct | all 2 dex OP |
| `quantum-torque` | OP | far-quantum-torque / quantum-torque-op -> alias of quantum-torque | quantum-torque-same-side / quantum-torque-ss -> distinct | all 2 dex OP |
| `shooting-clipper` | OP | far-shooting-clipper / shooting-clipper-op -> alias of shooting-clipper | shooting-clipper-same-side / shooting-clipper-ss -> distinct | all 2 dex OP |
| `shooting-illusion` | OP | far-shooting-illusion / shooting-illusion-op -> alias of shooting-illusion | shooting-illusion-same-side / shooting-illusion-ss -> distinct | all 3 dex OP |
| `shooting-legover` | OP | far-shooting-legover / shooting-legover-op -> alias of shooting-legover | shooting-legover-same-side / shooting-legover-ss -> distinct | all 3 dex OP |
| `shooting-mirage` | OP | far-shooting-mirage / shooting-mirage-op -> alias of shooting-mirage | shooting-mirage-same-side / shooting-mirage-ss -> distinct | all 3 dex OP |
| `shooting-pickup` | OP | far-shooting-pickup / shooting-pickup-op -> alias of shooting-pickup | shooting-pickup-same-side / shooting-pickup-ss -> distinct | all 3 dex OP |
| `spinning-blender` | OP | far-spinning-blender / spinning-blender-op -> alias of spinning-blender | spinning-blender-same-side / spinning-blender-ss -> distinct | all 1 dex OP |
| `spinning-drifter` | OP | far-spinning-drifter / spinning-drifter-op -> alias of spinning-drifter | spinning-drifter-same-side / spinning-drifter-ss -> distinct | all 1 dex OP |
| `spinning-ducking-blender` | OP | far-spinning-ducking-blender / spinning-ducking-blender-op -> alias of spinning-ducking-blender | spinning-ducking-blender-same-side / spinning-ducking-blender-ss -> distinct | all 1 dex OP |
| `spinning-ducking-drifter` | OP | far-spinning-ducking-drifter / spinning-ducking-drifter-op -> alias of spinning-ducking-drifter | spinning-ducking-drifter-same-side / spinning-ducking-drifter-ss -> distinct | all 1 dex OP |
| `spinning-ducking-whirl` | OP | far-spinning-ducking-whirl / spinning-ducking-whirl-op -> alias of spinning-ducking-whirl | spinning-ducking-whirl-same-side / spinning-ducking-whirl-ss -> distinct | all 1 dex OP |
| `spinning-eggbeater` | OP | far-spinning-eggbeater / spinning-eggbeater-op -> alias of spinning-eggbeater | spinning-eggbeater-same-side / spinning-eggbeater-ss -> distinct | all 2 dex OP |
| `stepping-blender` | OP | far-stepping-blender / stepping-blender-op -> alias of stepping-blender | stepping-blender-same-side / stepping-blender-ss -> distinct | all 2 dex OP |
| `stepping-clipper` | OP | far-stepping-clipper / stepping-clipper-op -> alias of stepping-clipper | stepping-clipper-same-side / stepping-clipper-ss -> distinct | all 1 dex OP |
| `stepping-dyno` | OP | far-stepping-dyno / stepping-dyno-op -> alias of stepping-dyno | stepping-dyno-same-side / stepping-dyno-ss -> distinct | all 2 dex OP |
| `stepping-illusion` | OP | far-stepping-illusion / stepping-illusion-op -> alias of stepping-illusion | stepping-illusion-same-side / stepping-illusion-ss -> distinct | all 2 dex OP |
| `stepping-legover` | OP | far-stepping-legover / stepping-legover-op -> alias of stepping-legover | stepping-legover-same-side / stepping-legover-ss -> distinct | all 2 dex OP |
| `stepping-mirage` | OP | far-stepping-mirage / stepping-mirage-op -> alias of stepping-mirage | stepping-mirage-same-side / stepping-mirage-ss -> distinct | all 2 dex OP |
| `stepping-osis` | OP | far-stepping-osis / stepping-osis-op -> alias of stepping-osis | stepping-osis-same-side / stepping-osis-ss -> distinct | all 1 dex OP |
| `stepping-pickup` | OP | far-stepping-pickup / stepping-pickup-op -> alias of stepping-pickup | stepping-pickup-same-side / stepping-pickup-ss -> distinct | all 2 dex OP |
| `surging-ducking-blender` | OP | far-surging-ducking-blender / surging-ducking-blender-op -> alias of surging-ducking-blender | surging-ducking-blender-same-side / surging-ducking-blender-ss -> distinct | all 2 dex OP |
| `surging-osis` | OP | far-surging-osis / surging-osis-op -> alias of surging-osis | surging-osis-same-side / surging-osis-ss -> distinct | all 1 dex OP |
| `swirl` | SAME | swirl-same-side / swirl-ss -> alias of swirl | far-swirl / swirl-op -> distinct | all 1 dex SAME |
| `swirling-swirl` | SAME | swirling-swirl-same-side / swirling-swirl-ss -> alias of swirling-swirl | far-swirling-swirl / swirling-swirl-op -> distinct | all 2 dex SAME |
| `symposium-reverse-whirl` | OP | far-symposium-reverse-whirl / symposium-reverse-whirl-op -> alias of symposium-reverse-whirl | symposium-reverse-whirl-same-side / symposium-reverse-whirl-ss -> distinct | all 1 dex OP |
| `toe-spinning-torque` | OP | far-toe-spinning-torque / toe-spinning-torque-op -> alias of toe-spinning-torque | toe-spinning-torque-same-side / toe-spinning-torque-ss -> distinct | all 1 dex OP |
| `torque` | OP | far-torque / torque-op -> alias of torque | torque-same-side / torque-ss -> distinct | all 1 dex OP |
| `whirl` | OP | far-whirl / whirl-op -> alias of whirl | whirl-same-side / whirl-ss -> distinct | all 1 dex OP |
| `whirling-mirage` | OP | far-whirling-mirage / whirling-mirage-op -> alias of whirling-mirage | whirling-mirage-same-side / whirling-mirage-ss -> distinct | all 2 dex OP |
| `whirling-pickup` | OP | far-whirling-pickup / whirling-pickup-op -> alias of whirling-pickup | whirling-pickup-same-side / whirling-pickup-ss -> distinct | all 2 dex OP |
| `whirling-whirl` | OP | far-whirling-whirl / whirling-whirl-op -> alias of whirling-whirl | whirling-whirl-same-side / whirling-whirl-ss -> distinct | all 2 dex OP |
