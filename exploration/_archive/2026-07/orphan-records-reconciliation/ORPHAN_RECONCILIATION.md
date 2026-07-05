# Orphan record-names reconcile

## Summary

Every distinct `freestyle_records` trick-name resolved against the canonical dictionary
(`freestyle_tricks` slug + canonical_name, then `freestyle_trick_aliases`), trying the
record `trick_name` first and the structured `sort_name` as a fallback. Reproduce with
`python3 exploration/orphan-records-reconciliation/reconcile_all.py`.

| Status | Distinct names | Records |
|---|---|---|
| canonical | 137 | 162 |
| alias | 13 | 17 |
| scoring-category (Unique Fearless/Beastly/3-Dex) | 3 | 8 |
| **orphan** | **13** | **17** |

This refines the IP estimate of "~48 orphans": that figure was a looser, trick-name-only
count over video-carrying records. Resolving against the structured `sort_name` and the
alias table as well, only **13 record names** truly resolve to nothing. Full per-name
classification in `orphan_records.csv`.

## The 13 orphans, by recommended action

The structured `sort_name` is the curator's decomposition and is the strongest hint.

### Resolved (staged)

| Record name | sort_name | Action |
|---|---|---|
| Merlin | Miraging Symp Mirage (op) | Aliased **Merlin -> miraging-symposium-mirage** (slug existed). |
| Frantic Legover | Pixie Quantum Legover (op) | Authored **pixie-quantum-legover** (4 ADD, mirrors pixie-quantum-butterfly + quantum-legover) and aliased Frantic Legover to it. Note: the universe records `Frantic` = the `pixie-quantum` operator pair. |
| Fracture | Sailing DLO (ss) | Defined the **sailing chassis** (`TOE > SAME IN [DEX] > OP OUT [DEX]`, +2; extracted from the documented Railing Set = rooted sailing, sailing = a pixie illusion), backfilled sailing's op_notation, authored **sailing-double-leg-over** (5 ADD), aliased Fracture to it. Unblocks the whole sailing-X family. |

### Verified-blocked (each structured target was checked; none is a clean promote)

| Record name | sort_name | Why blocked |
|---|---|---|
| Spanishfly | Ducking Double Down (op) | No `double-down` base exists; only `double-over-down` and `down-double-down` (latter notation-empty). "Double Down" reading is the DOD/DDD doctrine question (Red Wave 2). |
| Blink | Swirling Toe (op) (rev) | Derivable from the reverse-swirling chassis + toe-stall, but a borderline-trivial swirl-into-toe; curator call on whether it is canonical vocabulary. |

### Abbreviation-blocked (needs the DDD/DSO/PLO expansion ruling)

| Record name | sort_name | Note |
|---|---|---|
| Pixie DSO | Pixie DSO (op) | DSO abbreviation unexpanded; part of the standing DDD/DSO/PLO cleanup. |
| Pixie DSO (ss) | Pixie DSO (ss) | same; positional variant. |

### Undefined-token-blocked (folk name / undefined operator, needs a curator definition)

| Record name | sort_name | Note |
|---|---|---|
| Motion | Motion (op) | "motion" is a curator-undefined operator token; no decomposition. |
| Locomotion | Stepping Motion (far) | resolves to "stepping motion", but motion is undefined. |
| Grifter | Grifter (ss) | folk name, no structured decomposition. |
| Gyro Toe | Gyro Toe (op) | "gyro toe" reads as a primitive; confirm whether it is a defined trick. |
| Toe Spinning Toe | Toe Spinning Toe (op) | same; primitive-looking, no decomposition. |
| Solestice | Osis Flapper | "flapper" is an undefined token. |

## Next step

The one zero-risk win is **Merlin -> miraging-symposium-mirage** (wire as a record alias
on the existing canonical row, gauntlet pattern). The four promote-then-alias rows are
small curator authoring decisions. The remaining six wait on the DDD/DSO/PLO abbreviation
ruling and the undefined-operator definitions (motion / flapper / grifter), which already
sit on the frontier-operator backlog.
