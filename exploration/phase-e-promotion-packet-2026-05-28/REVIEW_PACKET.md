# Phase E — Promotion Review Packet

**Read-only.** No promotions, alias merges, parser/DB/route changes. This packet answers: *what can we safely promote next, in what order, and why?*

Candidate universe: **1701** unresolved observational names (A0 pass).

## Buckets

| # | Bucket | Count | Goes to |
|---|---|---:|---|
| 1 | Clean mechanical promotions | 243 | `promotion_candidates_clean.csv` |
| 2 | High-confidence, curator-confirm | 29 | `promotion_candidates_curator_confirm.csv` |
| 3 | Parser-derived / A0 extrapolated | 2 | `promotion_candidates_curator_confirm.csv` |
| 4 | Doctrine-sensitive exclusions | 266 | `promotion_candidates_deferred.csv` |
| 5 | Alias-collapse candidates | 415 | `promotion_candidates_deferred.csv` |
| 6 | Junk / observational-only | 746 | `promotion_candidates_deferred.csv` |

## Per-ecosystem matrix (promotable vs deferred)

| Ecosystem | clean | confirm | deferred |
|---|---:|---:|---:|
| pixie | 29 | 1 | 100 |
| fairy | 31 | 0 | 67 |
| stepping | 25 | 2 | 48 |
| quantum | 0 | 0 | 14 |
| atomic | 28 | 1 | 39 |
| ducking | 14 | 0 | 48 |
| spinning/gyro | 23 | 3 | 101 |
| symposium/paradox | 24 | 5 | 114 |
| whirl/osis/other | 30 | 8 | 203 |
| blurry/furious | 0 | 0 | 58 |
| weaving | 0 | 0 | 15 |
| pogo | 0 | 0 | 20 |
| shooting | 0 | 0 | 14 |
| (unclassified) | 39 | 11 | 586 |

## Per-field contract (every candidate row carries)

name · source(s) · proposed canonical slug · proposed **semantic** JOB (name uppercased; operational bracket notation deferred to promotion) · proposed ADD + accounting · decomposition · parser_confidence · doctrine_confidence · parent-family/ecosystem · promotion tier · reason it is safe / needs confirm.

## Clean-bucket examples by ecosystem (full lists in the CSV)

### pixie — 29 clean

| name | ADD | accounting |
|---|---:|---|
| Pixie Guay | 3 | `pixie(+1) + guay(2) = 3` |
| Pixie Reverse Guay | 3 | `pixie(+1) + guay(2) = 3` |
| Pixie Same Side Illusion | 3 | `pixie(+1) + illusion(2) = 3` |
| Pixie ss Guay | 3 | `pixie(+1) + guay(2) = 3` |
| Pixie ss Illusion | 3 | `pixie(+1) + illusion(2) = 3` |
| Pixie ss Mirage | 3 | `pixie(+1) + mirage(2) = 3` |
| Pixie ss Reverse Guay | 3 | `pixie(+1) + guay(2) = 3` |
| Pixie Ducking far Mirage | 4 | `pixie(+1) + ducking(+1) + mirage(2) = 4` |
| … +21 more | | |

### fairy — 31 clean

| name | ADD | accounting |
|---|---:|---|
| Fairy far Illusion | 3 | `fairy(+1) + illusion(2) = 3` |
| Fairy Guay | 3 | `fairy(+1) + guay(2) = 3` |
| Fairy Illusion (same side) | 3 | `fairy(+1) + illusion(2) = 3` |
| Fairy Reverse Guay | 3 | `fairy(+1) + guay(2) = 3` |
| Fairy ss Guay | 3 | `fairy(+1) + guay(2) = 3` |
| Fairy ss Illusion | 3 | `fairy(+1) + illusion(2) = 3` |
| Fairy ss Reverse Guay | 3 | `fairy(+1) + guay(2) = 3` |
| Fairy Butterfly | 4 | `fairy(+1) + butterfly(3) = 4` |
| … +23 more | | |

### stepping — 25 clean

| name | ADD | accounting |
|---|---:|---|
| Stepping far Illusion | 3 | `stepping(+1) + illusion(2) = 3` |
| Stepping far Mirage | 3 | `stepping(+1) + mirage(2) = 3` |
| Stepping Guay | 3 | `stepping(+1) + guay(2) = 3` |
| Stepping Legover (same side) | 3 | `stepping(+1) + legover(2) = 3` |
| Stepping near Legover | 3 | `stepping(+1) + legover(2) = 3` |
| Stepping Reverse Guay | 3 | `stepping(+1) + guay(2) = 3` |
| Stepping Butterfly (same side) | 4 | `stepping(+1) + butterfly(3) = 4` |
| Stepping Diving Mirage | 4 | `stepping(+1) + diving(+1) + mirage(2) = 4` |
| … +17 more | | |

### atomic — 28 clean

| name | ADD | accounting |
|---|---:|---|
| Atomic Guay | 3 | `atomic(+1) + guay(2) = 3` |
| Atomic Legover (same side) | 3 | `atomic(+1) + legover(2) = 3` |
| Atomic Pickup (same side) | 3 | `atomic(+1) + pickup(2) = 3` |
| Atomic Reverse Guay | 3 | `atomic(+1) + guay(2) = 3` |
| Atomic Eggbeater | 4 | `atomic(+1) + eggbeater(3) = 4` |
| Atomic far Eggbeater | 4 | `atomic(+1) + eggbeater(3) = 4` |
| Atomic far Mirage | 4 | `atomic(+2 rot) + mirage(2) = 4` |
| Atomic Mirage | 4 | `atomic(+2 rot) + mirage(2) = 4` |
| … +20 more | | |

### ducking — 14 clean

| name | ADD | accounting |
|---|---:|---|
| Ducking Reverse Guay | 3 | `ducking(+1) + guay(2) = 3` |
| Toe Ducking Legover | 3 | `ducking(+1) + legover(2) = 3` |
| Clipper Ducking far Drifter | 4 | `ducking(+1) + drifter(3) = 4` |
| Clipper Ducking far Whirl | 4 | `ducking(+1) + whirl(3) = 4` |
| Clipper Ducking far Blender | 5 | `ducking(+1) + blender(4) = 5` |
| Clipper Ducking far Symp. Whirl | 5 | `ducking(+1) + symposium(+1) + whirl(3) = 5` |
| Ducking Far Symposium Reverse Whirl | 5 | `ducking(+1) + symposium(+1) + whirl(3) = 5` |
| Spinning Ducking far Drifter | 5 | `spinning(+1) + ducking(+1) + drifter(3) = 5` |
| … +6 more | | |

### spinning/gyro — 23 clean

| name | ADD | accounting |
|---|---:|---|
| Gyro Reverse Guay | 3 | `gyro(+1) + guay(2) = 3` |
| Spinning Reverse Guay | 3 | `spinning(+1) + guay(2) = 3` |
| Toe Gyro Mirage | 3 | `gyro(+1) + mirage(2) = 3` |
| Butterfly Gyro Toe | 4 | `gyro(+1) + butterfly(3) = 4` |
| Spinning near Eggbeater | 4 | `spinning(+1) + eggbeater(3) = 4` |
| Spinning Reverse Swirl | 4 | `spinning(+1) + swirl(3) = 4` |
| Spinning Reverse Whirl | 4 | `spinning(+1) + whirl(3) = 4` |
| Whirling Gyro Mirage | 4 | `whirling(+1) + gyro(+1) + mirage(2) = 4` |
| … +15 more | | |

### symposium/paradox — 24 clean

| name | ADD | accounting |
|---|---:|---|
| Symp. Illusion | 3 | `symposium(+1) + illusion(2) = 3` |
| Symposium Bubba | 3 | `symposium(+1) + bubba(2) = 3` |
| Blazing Symposium Mirage | 4 | `blazing(+1) + symposium(+1) + mirage(2) = 4` |
| Diving Symposium Mirage | 4 | `diving(+1) + symposium(+1) + mirage(2) = 4` |
| Miraging Symp. Illusion | 4 | `miraging(+1) + symposium(+1) + illusion(2) = 4` |
| Reverse Swirling Symposium Mirage | 4 | `swirling(+1) + symposium(+1) + mirage(2) = 4` |
| Swirling Paradox Mirage | 4 | `swirling(+1) + paradox(+1) + mirage(2) = 4` |
| Symp. Miraging far Mirage | 4 | `symposium(+1) + miraging(+1) + mirage(2) = 4` |
| … +16 more | | |

### whirl/osis/other — 30 clean

| name | ADD | accounting |
|---|---:|---|
| Reverse Swirling Pickup | 3 | `swirling(+1) + pickup(2) = 3` |
| Swirling ss Mirage | 3 | `swirling(+1) + mirage(2) = 3` |
| Whirling far Mirage | 3 | `whirling(+1) + mirage(2) = 3` |
| Whirling ss Mirage | 3 | `whirling(+1) + mirage(2) = 3` |
| Whirling ss Pickup | 3 | `whirling(+1) + pickup(2) = 3` |
| Clipper Diving near Whirl | 4 | `diving(+1) + whirl(3) = 4` |
| Clipper far Symp Whirl | 4 | `symposium(+1) + whirl(3) = 4` |
| Diving Eclipse | 4 | `diving(+1) + eclipse(3) = 4` |
| … +22 more | | |

## Notation + family discipline

- **JOB:** only the semantic JOB (uppercased canonical name) is proposed — the documented mechanical convention. Operational bracket notation is authored at promotion via chassis substitution; not fabricated here.
- **Family skeleton respected:** `parent_family` resolves children to the 8 canonical parents; retired route-out families are never regenerated.
- **ADD:** provisional, parser-derived; corroborated against source claims where a source ADD exists. Divergences route to curator-confirm, never silently overwritten.
