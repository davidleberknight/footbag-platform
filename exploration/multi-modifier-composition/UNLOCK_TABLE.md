# Multi-Modifier Composition - Unlock Table

Read-only. Every notation-less trick with 2+ stacked modifiers, classified under the composition grammar with the safety rule (ADD equality necessary, not sufficient).

Composition path notation: roles in apply order. entry=set-replacing (pixie/stepping/tapping/fairy); body=prepend-after-set (spinning/ducking/diving/gyro); timing=symposium no-plant on target dex; paradox=PDX tag on target dex; operator=miraging/barraging/whirling/swirling.

## A. Safe now (8)
| slug | ADD | modifiers | base | composition path | ruling / risk |
|---|---|---|---|---|---|
| pixie-symposium-rev-whirl | 5 | pixie+symposium | rev-whirl | entry(pixie) > timing | none |
| spinning-ducking-superfly | 7 | spinning+ducking | superfly | body(spinning) > body(ducking) | none |
| spinning-miraging-symposium-torque | 7 | spinning+miraging | symposium-torque | body(spinning) > op(miraging) | none |
| spinning-symposium-flux | 6 | spinning+symposium | flux | body(spinning) > timing | none |
| stepping-diving-butterfly | 5 | stepping+diving | butterfly | entry(stepping) > body(diving) | none |
| stepping-diving-mirage | 4 | stepping+diving | mirage | entry(stepping) > body(diving) | none |
| stepping-ducking-drifter | 5 | stepping+ducking | drifter | entry(stepping) > body(ducking) | none |
| stepping-paradox-torque | 6 | stepping+paradox | torque | entry(stepping) > paradox | none |

## B. Safe after one ruling (13)
| slug | ADD | modifiers | base | composition path | ruling / risk |
|---|---|---|---|---|---|
| bigwalk | 5 | spinning+stepping | butterfly | body(spinning) > entry(stepping) | composition-order |
| dorshanatrix | 5 | railing+symposium | mirage | UNRAT(railing) > timing | operator:railing |
| fairy-gyro-torque | 6 | fairy+gyro | torque | entry(fairy) > body(gyro) | fairy-separator |
| fairy-swirling-swirl | 5 | fairy+swirling | swirl | entry(fairy) > op(swirling) | fairy-separator |
| flying-fish | 5 | railing+ducking | mirage | UNRAT(railing) > body(ducking) | operator:railing |
| fury | 5 | furious+paradox | mirage | UNRAT(furious) > paradox | operator:furious |
| genuphobia | 7 | fairy+symposium | torque | entry(fairy) > timing | fairy-separator |
| margaritaville | 7 | spinning+stepping+paradox | blender | body(spinning) > entry(stepping) > paradox | composition-order |
| pixie-symposium-whirling-swirl | 6 | pixie+symposium | whirling-swirl | entry(pixie) > timing | target-selection |
| rail-warrior | 6 | railing+ducking | butterfly | UNRAT(railing) > body(ducking) | operator:railing |
| spinning-symposium-whirling-swirl | 6 | spinning+symposium | whirling-swirl | body(spinning) > timing | target-selection |
| stepping-ducking-paradox-illusion | 5 | stepping+ducking+paradox | illusion | entry(stepping) > body(ducking) > paradox | composition-order |
| witchdoctor | 5 | atomic+symposium | mirage | UNRAT(atomic) > timing | operator:atomic |

## C. Unsafe / source-dependent (4)
| slug | ADD | modifiers | base | composition path | ruling / risk |
|---|---|---|---|---|---|
| big-apple-sauce | 8 | spinning+paradox+miraging+symposium | torque | body(spinning) > paradox > op(miraging) > timing | composition-order [depth4] |
| stepping-ducking-symposium-eggbeater | 6 | stepping+ducking+symposium | eggbeater | entry(stepping) > body(ducking) > timing | target-selection;composition-order |
| surging-ducking-paradox-torque | 8 | spinning+stepping+ducking+paradox | torque | body(spinning) > entry(stepping) > body(ducking) > paradox | composition-order [depth4] |
| swirlwind | 7 | spinning+paradox+symposium+whirling | swirl | body(spinning) > paradox > timing > op(whirling) | composition-order [depth4] |

