# Nav Prototype 5 — Symbolic Decomposition

**Spec only.** No template changes.

## Purpose

Show a trick's multiple equivalent decompositions across symbolic-grammar layers. Educational discovery: "Mobius — how does it decompose? What other readings exist?"

The four-layer separation surfaces directly: parser / editorial / operational / observational-symbolic.

## UX sketch

Embedded on `/freestyle/tricks/:slug`, replacing or extending the existing "Notation (semantic)" + "Set notation (operational)" sections:

```
┌─────────────────────────────────────────────────────────┐
│ Decomposition — Mobius                                  │
├─────────────────────────────────────────────────────────┤
│ Asserted ADD: 5  (editorial truth)                      │
│                                                         │
│ Canonical IFPA reading (pt11):                          │
│   spinning + torque                                     │
│   = spinning + miraging + osis (transitive via torque)  │
│                                                         │
│ Symbolic-grammar reading:                               │
│   start = [set]                                         │
│   uptime = front spin dex (rotational)                  │
│   midtime = miraging body intensity                     │
│   downtime = osis hippy-in extended arc                 │
│   finish = op toe                                       │
│                                                         │
│ Operational notation (FM):                              │
│   Toe > [spinning] Front Whirl (DEX) >> ...             │
│                                                         │
│ Observational equivalence cluster: rotational-on-torque │
│   (this trick + spinning-torque + atomic-torque + ...)  │
│                                                         │
│ Folk/PassBack reading:                                  │
│   "Gyro Torque" (Sets-tab alternate naming)             │
│                                                         │
│ Equivalent decompositions at different recursion depth: │
│ Layer 1: gyro torque (folk shorthand)                   │
│ Layer 2: spinning ss torque (Sets-tab; pt12 SS = +0)    │
│ Layer 3: spinning ss miraging op osis (deep structural) │
└─────────────────────────────────────────────────────────┘
```

## Data sources

- `freestyle_tricks` — adds, notation (Jobs), operational_notation, structural_parse_json
- `symbolic_equivalence_clusters.csv` — equivalence cluster identification
- `CORE_TRICK_SYMBOLIC_TABLE.csv` — James-shorthand symbolic notation (12 anchor rows; extended via service for others)
- `freestyle_trick_aliases` — folk / cross-source naming
- `glossary_crosslinks.csv` — cross-layer equivalence links

## URL pattern

- No new URL; replaces/extends the decomposition section on existing trick-detail pages
- Optional: `/freestyle/tricks/:slug/decomposition` for a full-page deep-dive view

## Filter behavior

- Layer 1: anchor reading (canonical IFPA per Red rulings)
- Layer 2-N: transitive expansions (mobius pattern: torque = miraging-osis; further unrolled)
- Folk readings labeled "PassBack reading" / "FM folk" with source attribution
- Equivalence cluster membership at the bottom (cross-link to nav-prototype-1)

## Edge cases

- Tricks without operational notation: show only IFPA reading + symbolic reading
- Tricks in §3.2 policy class (nemesis/jani-walker/bullwhip): show "stated ADD; row-asserted" disposition prose
- Pt12-blocked tricks (blur, blurry-whirl, etc.): show Red-pending placeholder
- Recursive-set-name tricks (Dragonstein, Arcwalk if added to IFPA): show substructure-prefix pattern

## Educational angle

This is the central educational integration point. Surfaces the four-layer separation as a navigation feature: readers can see how the canonical IFPA reading differs from the folk / operational / symbolic readings without confusion about authoritativeness. The PassBack glossary's "technical name vs nickname vs Jobs notation" framing extends naturally to this view.

## Effort estimate

- Service method extension: `getTrickDecomposition(slug)` — ~80 lines (synthesizes 4 layers)
- Template extension: ~100 lines on existing trick-shell.hbs
- Tests: 12-18 route + service tests (each layer + edge case)
- Total: ~1.5-2 days for a developer

## Constraint check

- No DB schema change
- No canonical mutation
- Reuses existing operational_notation, notation, adds fields
- Layer-separation forever-rule enforced in service (clear visual + label separation between canonical / editorial / operational / observational-symbolic)
