# Packet 1 — Promotion Ready Retriage (refreshed)

Review packet. Supersedes the original 36-row triage. Reflects the current observational universe
after: the 2 already-published rows were gated out, the 6 Class-A nuclear/quantum doctrine rows were
promoted, and **3 Class-C alias-wires were applied** (this slice).

## Current state — 31 rows (was 36)

The "Promotion Ready" card now shows **31** distinct slugs. Re-classifying against current doctrine,
chassis availability, and governance:

| bucket | count | meaning |
|---|---:|---|
| **A — promotable now** | **0** | none clear the bar |
| **B — ruling / chassis pending** | **30** | blocked on a curator/Red ruling, an operator chassis, or a not-yet-canonical base |
| **C — alias to folk canonical** | **0** | 3 wired this slice; 2 reclassified to B (below) |
| **D — already published** | **0** | the 2 (atomic-blender, atomic-ducking-torque) were gated out by the regen |
| **E — reject (malformed)** | **1** | atomic-eggbeater (atomic-atomic-legover self-reference) |

**The original A=18 was wrong.** Three findings collapsed it to 0: `blazing` has **no op_notation
chassis exemplar** (not mechanically derivable, same as furious); the deep multi-operator stacks need
**parity rulings**; the `reverse-*` rows have **no canonical reverse base**. So nothing in the bucket
is publishable now.

## Class B — what's actually blocking (30)

| blocker | count | rows |
|---|---:|---|
| blazing chassis undefined | 8 | blazing-illusion/-legover/-mirage/-butterfly/-drifter/-symposium-mirage/-paradox-whirl/-torque |
| atomic-on-rotational X-Dex Q3 | 7 | atomic-ducking-mirage/-reverse-swirl/-swirl/-whirl/-ducking-blender/-symposium-whirl/-gyro-torque |
| deep multi-operator parity | 6 | pixie-miraging-symposium-miraging-legover, reverse-swirling-paradox-symposium-whirl, spinning-miraging-symposium-miraging-refraction, surging-ducking-blender, surging-ducking-torque, surging-ducking-paradox-symposium-whirling-rake |
| terraging +3 weight | 3 | terraging-illusion/-legover/-mirage |
| reverse base not canonical | 3 | atomic-reverse-guay, diving-reverse-guay, tapping-reverse-guay |
| atomic-vs-quantum equivalence | 1 | atomic-guay (vs the promoted quantum-guay) |
| **Q1 omelette conflict** | 1 | atomic-pickup — omelette is canonically *illusioning*-pickup; atomic≡omelette is the open Q1 |
| **S9 slot governance** | 1 | atomic-symposium-mirage — witchdoctor's "atomic symposium mirage" reading is curator-assigned to S9 (EQUIVALENCE_TOPOLOGY); S3 aliases must not duplicate it |

## E — reject (1)
`atomic-eggbeater` — "atomic atomic-legover"; does not compose. Drop from the frontier (do not promote).

## Actioned this slice (Class-C alias-wires)
| structural slug | → folk canonical | mechanism |
|---|---|---|
| atomic-legover | eggbeater | trick_aliases.csv (curated-v1) |
| atomic-mirage | atom-smasher | trick_aliases.csv (curated-v1) |
| atomic-ducking-whirl | ego | red_additions aliases (loader 19) |

The other 2 originally listed as C (`atomic-pickup → omelette`, `atomic-symposium-mirage → witchdoctor`)
were **withheld** — both carry an explicit doctrine/governance block (see Class B) and are not safe
to wire as aliases.

## Final public label proposal

With A=0, a two-card "Authoring-Ready / Decision-Pending" split no longer applies — the entire bucket
is ruling-gated. Recommendation: **rename the "Promotion Ready" stat to "Awaiting Ruling" (30)**,
hint *"structurally understood; blocked on a curator/Red ruling, an operator chassis, or a missing
base"*, and **drop `atomic-eggbeater` (E)** from the frontier. "Promotion Ready" should not survive —
it implies a one-click publishability that zero rows have. (Label change is a `freestyleService.ts`
statBlocks edit; proposed here, not yet applied.)

The single biggest unlock remains the **blazing chassis** (8 rows) and the **atomic-rotational Q3**
ruling (7 rows) — together two rulings clear half the bucket.
