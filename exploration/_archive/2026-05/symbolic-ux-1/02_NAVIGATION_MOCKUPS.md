# SUX-1 Task B — Symbolic Navigation Mockups

Five navigation-query mockups demonstrating browse surfaces driven by symbolic-grammar groups. **Spec + ASCII wireframes only.** No production routes added.

**Date:** 2026-05-12

---

## Nav 1 — "show all spinning tricks"

**URL pattern (proposed):** `/freestyle/modifier/spinning`
**Symbolic source:** `symbolic_modifier_groups.csv` (`spinning-family`) + `symbolic_group_membership.csv`.

```
┌────────────────────────────────────────────────────────────────┐
│ Spinning modifier — 13+ pilot tricks                            │
│ /freestyle/modifier/spinning                                    │
├────────────────────────────────────────────────────────────────┤
│ The spinning modifier adds +1 ADD (flat per pt10 Red ruling;   │
│ was +2 on rotational base; flattened in pt10).                  │
│                                                                │
│ Filters:   [ all ]  by base: [ whirl ] [ osis ] [ torque ]      │
│            by ADD:  [ 4 ] [ 5 ] [ 6 ] [ 7 ]                    │
│                                                                │
│ on whirl base                              ADD                  │
│   spinning-whirl                            4                  │
│   spinning-paradox-whirl                    5                  │
│   spinning-symposium-whirl                  5                  │
│   spinning-ducking-whirl                    5                  │
│   paradox-symposium-whirl (PS Whirl)        5                  │
│   mullet (paradox+symposium+ducking)        6                  │
│   montage (5-modifier flagship)             7                  │
│                                                                │
│ on osis base                                                   │
│   spinning-osis                             4                  │
│                                                                │
│ on torque base                                                 │
│   spinning-torque (mobius canonical)        5                  │
│                                                                │
│ on clipper base                                                │
│   spinning-clipper                          4                  │
│                                                                │
│ Multi-base compounds                                           │
│   spender (paradox + spinning + blender)    6                  │
│   surge (spinning + stepping)               5                  │
│   surgery (rev-whirl + paradox + spinning)  6                  │
│   surreal (paradox+spinning+stepping+whirl) 6                  │
│                                                                │
│ Footer: observational symbolic-grammar layer; no IFPA family   │
│ changes. Modifier-stub rows hidden.                            │
└────────────────────────────────────────────────────────────────┘
```

---

## Nav 2 — "show all butterfly-wing tricks"

**URL pattern (proposed):** `/freestyle/topology/butterfly-wing-topology`
**Symbolic source:** `symbolic_topology_groups.csv` + `symbolic_group_membership.csv`.

```
┌────────────────────────────────────────────────────────────────┐
│ Butterfly-wing topology — 12 pilot members                      │
│ /freestyle/topology/butterfly-wing-topology                     │
├────────────────────────────────────────────────────────────────┤
│ Tricks sharing butterfly's outside-wing motion + cross-body    │
│ clipper recovery. Coherence with IFPA family=butterfly: 100%.  │
│                                                                │
│ Anchor                                       ADD                │
│   butterfly                                   3                │
│                                                                │
│ Walking-family (foot-plant variants)                           │
│   ripwalk (stepping op)                       4                │
│   sidewalk (stepping ss)                      4                │
│   dimwalk (pixie op)                          4                │
│   parkwalk (pixie ss)                         4                │
│   bigwalk (multi-modifier)                    5                │
│   tripwalk (quantum)                          4                │
│                                                                │
│ Modifier-compound members                                      │
│   matador (nuclear)                           5                │
│   phoenix (pixie + ducking)                   5                │
│                                                                │
│ Self-atom variants                                             │
│   dada-curve (no-foot-plant)                  4                │
│                                                                │
│ Pt12-pending / non-pilot members                               │
│   atomic-butterfly = legbeater                4                │
│   (additional non-pilot rows omitted)                          │
│                                                                │
│ See also: walking-family-complete equivalence cluster (5/5    │
│ pilot at SCALE-11 close).                                      │
└────────────────────────────────────────────────────────────────┘
```

---

## Nav 3 — "show all paradox tricks"

**URL pattern (proposed):** `/freestyle/modifier/paradox`
**Symbolic source:** `symbolic_modifier_groups.csv` (`paradox-family`) + `freestyle_trick_modifier_links`.

```
┌────────────────────────────────────────────────────────────────┐
│ Paradox modifier — 15+ pilot tricks                             │
│ /freestyle/modifier/paradox                                     │
├────────────────────────────────────────────────────────────────┤
│ Paradox (pdx) is a +1-universal body modifier; structurally    │
│ an in-then-out dex pair from a Clipper set. Cross-cuts most    │
│ IFPA families.                                                 │
│                                                                │
│ on mirage base                              ADD                 │
│   paradox-mirage (BOP — guiltless trio)       3               │
│                                                                │
│ on whirl base                                                  │
│   paradox-whirl (PWF reference — Fearless)    4               │
│   paradox-symposium-whirl (PS Whirl)          5               │
│   spinning-paradox-whirl                      5               │
│                                                                │
│ on torque base                                                 │
│   paradox-torque                              5               │
│                                                                │
│ on blender base                                                │
│   paradox-blender                             5               │
│                                                                │
│ on drifter base                                                │
│   paradox-drifter (royale)                    4               │
│                                                                │
│ Multi-modifier flagship compounds                              │
│   mullet (paradox + symposium + ducking)      6               │
│   montage (5-modifier; paradox + 4 others)    7               │
│   surreal (paradox + spinning + stepping)     6               │
│   spender (paradox + spinning)                6 (on blender)   │
│                                                                │
│ Related concepts (glossary cross-link):                        │
│   X-Dex (toe-set analog; pt1 narrow scope)                     │
│   PS Whirl (Paradox Symposium Whirl shorthand)                 │
│   PWF (Pdx-Whirl-Free; Fearless/Beastly subcategory)           │
└────────────────────────────────────────────────────────────────┘
```

---

## Nav 4 — "show all unusual surface tricks"

**URL pattern (proposed):** `/freestyle/topology/unusual-surface`
**Symbolic source:** `symbolic_topology_groups.csv` (`unusual-surface-topology`).

```
┌────────────────────────────────────────────────────────────────┐
│ Unusual-surface topology — 3 FM corpus members                  │
│ /freestyle/topology/unusual-surface                             │
├────────────────────────────────────────────────────────────────┤
│ Tricks whose final contact lands on a non-standard surface:    │
│ flapper / sole / cloud / knee / head. UNS flag in operational  │
│ notation. Per FM source ADD rulings: UNS appears to add +1     │
│ implicit ADD over standard delays (see GRAMMAR_AMBIGUITIES).   │
│                                                                │
│ FM corpus members                            ADD                │
│   Buttersole (Butterfly + Flapper)            4               │
│   Ricochet (...)                              4               │
│   Singularity (...)                           5               │
│                                                                │
│ IFPA dictionary members                                        │
│   (no native IFPA members; UNS topology is FM-corpus-only       │
│    surfaced via observational layer)                           │
│                                                                │
│ Related glossary concepts:                                     │
│   Cloud (calf stall surface)                                   │
│   Flapper (xbd sole)                                           │
│   Dragon (xbd outside)                                         │
│   Knee bump / Head stall                                       │
│                                                                │
│ Footer: this surface lives entirely in the observational       │
│ symbolic-grammar layer; UNS tricks aren't currently IFPA-      │
│ canonical. Curator review pending.                             │
└────────────────────────────────────────────────────────────────┘
```

---

## Nav 5 — "show all uptime-dex → clipper-end tricks"

**URL pattern (proposed):** `/freestyle/archetype/uptime-dex-clipper-end`
**Symbolic source:** `movement_archetype_registry.csv` (multi-archetype query).

This is a **compositional query** — combines an execution-pattern start (uptime-dex) with a contact-finish (clipper-ending). Returns the intersection.

```
┌────────────────────────────────────────────────────────────────┐
│ Uptime-dex → Clipper-ending archetype query                     │
│ /freestyle/archetype/uptime-dex-clipper-end                     │
├────────────────────────────────────────────────────────────────┤
│ Tricks whose primary uptime mechanic is a dex flick AND whose  │
│ recovery is a clipper stall (XBD cross-body).                  │
│                                                                │
│ Largest cohort: butterfly-wing-topology (12 pilot members)     │
│                                                                │
│ Anchor                                       ADD                │
│   butterfly                                   3               │
│                                                                │
│ Walking-family                                                 │
│   ripwalk / sidewalk / dimwalk / parkwalk     4-5             │
│                                                                │
│ Multi-modifier                                                 │
│   matador / phoenix / bigwalk / tripwalk      4-5             │
│                                                                │
│ Filter-narrowed cohorts:                                       │
│   • Spinning-clipper / ducking-clipper (clip→clip variants)   │
│     where uptime is dex; ADD 4                                 │
│   • Smaller cohorts where clipper-ending is via XBD            │
│                                                                │
│ Filter chips: [ butterfly-base ] [ multi-mod ] [ XBD-only ]    │
│               [ ADD 3-4 ]  [ ADD 5-7 ]                         │
│                                                                │
│ Why this query: useful for learners who finished butterfly    │
│ and want to extend to cross-body recoveries on other bases.   │
└────────────────────────────────────────────────────────────────┘
```

---

## Navigation rendering rules (all 5 routes)

1. **Server-rendered.** No client-side JS required for MVP; filters can be query-string driven.
2. **Pilot-row preference.** Pilot tier (populated prose) renders first; non-pilot rows render as name-only.
3. **ADD-bucket grouping.** Within each section, sort by ADD value ascending, then alphabetical.
4. **Modifier-stub filtering.** The 18 modifier-stub rows (barraging / blazing / ducking / gyro / paradox / spinning / stepping / symposium / tapping / pogo / rooted / atomic / fairy / furious / pixie / quantum / shooting / terraging) are filtered per `feedback_modifier_public_visibility.md`.
5. **Footer attribution.** Every nav surface carries a footer noting observational/symbolic-grammar status + non-IFPA-mutating disclaimer.
6. **Empty-state handling.** If a query returns zero results, render a sentence explaining why (e.g., "No IFPA pilot members yet; this topology exists in the FM corpus only").

## Cross-references

- SG-2 nav-prototype `02_all_spinning_tricks.md` — Nav 1 implementation spec
- SG-2 nav-prototype `01_related_topology_tricks.md` — Nav 2 + 4 implementation pattern
- SG-2 `symbolic_topology_groups.csv` + `symbolic_modifier_groups.csv` — data source
- `EVALUATION_AND_RECOMMENDATION.md` — per-navigation usefulness assessment
