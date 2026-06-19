# Parser-Uncertainty Burn-Down Audit

Re-classifies the parser-uncertain freestyle frontier by **unlockability** (A-E), to find
how many can leave the uncertainty bucket *without a new Red ruling*.

## Method & corpus

Source: `exploration/wave1-triage-2026-05-27/triage_classified.csv` (the full parser-classified
corpus, 2154 rows, with `signal_trace` carrying `stack_depth`, `modifiers`, `doctrine_tokens`,
`directionals`). Filtered to the **1728 non-active names** (the frontier). Each re-classified by:

- **A — settled doctrine, decomposable today:** all recognized operators are settled
  (registered + defined, incl. nuclear/furious/shooting/illusioning/sailing/railing) AND a
  known terminal atom is present AND stack depth <= 2. Mirror-authorable now.
- **B — settled doctrine, needs notation authoring:** settled operators but the base layer
  isn't built yet (cascade) or stack depth >= 3. No Red, but real authoring/analysis.
- **C — blocked by a specific unresolved cluster:** carries an unsettled doctrine token
  (blurry-A3, weaving, pogo, blazing, terraging-chassis), an undefined folk movement-verb
  (motion/flailing/frantic/twisting/zulu/slapping/alpine/...), or the DOD signal (`double`
  directional + `down`).
- **D — folk-name identification problem:** no parseable structure (depth 0, no recognized
  operator or atom) — needs identifying *which trick it is*.
- **E — genuinely unknown:** parser leaks / non-trick rows.

## LIVE counts (re-run 2026-06-17 against current loader output)

Same May-27 corpus, but dedup is now rigorous: each name is normalized against the **current**
active set + aliases with the slug-normalization rules (`Pdx`→paradox, `PS`→paradox-symposium,
`Symp`/`Symple`→symposium, `DLO`→double-leg-over, `DOD`→double-over-down, `ss`/`op`/`far`/`near`
qualifier-strip). This folds out **293 names** that are abbreviation-variants of already-canonical
tricks (vs only 77 the crude slugify caught in May). **Live frontier = 1435** (was 1728).

Two passes shown: **live** (rigorous dedup only) and **reclassified** (after CLUSTER_VALIDATION.md
moved 6 stale clusters — spyro/terraging/flailing/frantic out as settled operators; alpine/
folk-op/swivel/motion/twisting/zulu/slapping out as identification).

| Class | Reclass | Live | May-27 | Meaning |
|---|---|---|---|---|
| **A** | **765** | 673 | 826 | decomposable today, no Red |
| **B** | **222** | 101 | 141 | settled, needs notation authoring, no Red |
| **C** | **151** | 302 | 349 | blocked by a *truly-open* cluster (Red) |
| **D** | **293** | 355 | 408 | folk-name identification |
| **E** | **4** | 4 | 4 | unknown / parser leak |

**Reclassified A + B = 987 unlockable with no Red ruling (~69% of the live frontier).** The big
mover is **C 302 → 151**: validating each cluster against the latest rulings showed ~151 entries
were never actually Red-gated (resolved by terraging pt8, grifter pt6, flailing/frantic/mobius
wiring, spyro=gyro, alpine=ducking, swivel=symposium-twirl). They moved to A/B (settled
operators) or D (folk identification). Class A is genuine net-new (abbreviation-twins are in the
293 dedup hits).

For the PACKET's specifically-labelled **"~368 unresolved-structure (no open doctrine)"** subset:
this audit confirms they are all A/B — the no-doctrine compounds mirror an existing same-operator
exemplar. **They need authoring, not a Red decision.** The reclassified A+B (987) exceeds 368 because it
also counts the deeper cascade tail (class B) and settled-operator compounds beyond the PACKET's
shallow-structure cut.

### May-27 baseline (superseded — kept for the delta)

A=826, B=141, C=349, D=408, E=4; A+B=967. That pass under-deduped (simple slugify only), so its
class-A "760 net-new" was inflated by ~216 abbreviation-variants now correctly folded out.

## C — doctrine dependency (151 after reclassification — only truly-open clusters)

After CLUSTER_VALIDATION.md, C holds **only the 5 clusters that still need a Red ruling**:

| Cluster | Count | Open question |
|---|---|---|
| Blurry-A3 | 69* | +1 vs +2 rotational (pt12 follow-up); *69 = token-presence, ~7 direct |
| Weaving | 30 | operator +N |
| DOD (`double down`) | 26 | DOD≡DDD + down arithmetic |
| Pogo | 24 | +0 vs +1 |
| Blazing | 2 | one-sentence token ruling (gates 8 op_notation rows) |

**Reclassified OUT of C (151), per CLUSTER_VALIDATION.md:** Movement-verb 93 (flailing=symposium
illusioning, frantic=pixie quantum → A/B; motion/twisting/zulu/slapping → D identification);
Alpine 17 → D (=ducking, pt6); Folk-op 13 → D (grifter=reverse-drifter, royale=pdx-grifter,
mobius=gyro-torque); Spyro 11 → A (=gyro); Swivel 10 → D (=symposium-twirl); Terraging 8 → B
(pt8 settled +3). These became settled-operator compounds (A/B) or folk-identification (D).

> **Superseded by CLUSTER_VALIDATION.md (blocker-validation audit).** Validating each cluster
> against the latest rulings shows **~152 of these 302 were stale** — already resolved by a
> later ruling (terraging pt8 = +3; grifter pt6 = reverse-drifter; royale pt5), a wired
> equivalence (flailing = symposium illusioning; frantic = pixie quantum; mobius = gyro-torque),
> or a settled structure (spyro = gyro; alpine = ducking; swivel = symposium-twirl). The
> **truly-Red-gated frontier is 5 clusters** — DOD (25), Weaving (30), Pogo (24), Blurry (~7
> direct), Blazing (2) — **~88 direct (≤150 token-presence), not 302.** Spyro→B(naming),
> Alpine/Folk-op/Swivel/Movement-verbs→C(identification), Terraging→D(authoring) move toward the
> no-Red pool. See CLUSTER_VALIDATION.md for the per-cluster question/evidence/ruling table.

## Top-50 easiest no-Red promotions (live class A — abbreviation-twins now excluded)

Backside Symposium Toe Blizzard, Double Dyno, Double Spinning Rake, Far Dyno, Far Reverse Whirl,
Gyro Toe, Inspinning Same Side Illusion, Inspinning Same Side Mirage, Nemesis Swirl, Scorpions
Toe Nail, Stepping far Clipper, Symple Reverse Swirl (far), Toe Spinning Toe, Whirling far
Butterfly, Arctic Butterfly, Atomic Double Legover, Atomic Ducking Mirage, Atomic Symposium
Whirl, Atomic Whirl, Barrage (toe set), Bubba Butterfly, Bubba Legover, Bubba Paradox Symposium
Eggbeater, Butterfly Dragon, Butterfly Flapper, Butterflying Symposium Reverse Swirling Toe,
Clipper set Double Mirage, Clipper set ss Double Over Down, Double Drifter, Double Over Downing
Osis, Double Reverse Swirl, Double Swirl Dragon, Double Torque, Drifter Swirl, Ducking Double
Legover, Fairy Crossbody Rake, Flaring Butterfly, Flurry (toe set), Frootie Illusion, Frootie
Legover, Frootie Mirage, Frozen Butterfly, Furious Illusion, Furious Mirage, Fusing Mirage, Fyro
Double Legover, Fyro Mirage, Fyro Torque, High Plains Drifter / Barrifter, Hopover Swirl Dragon.

Each is a settled operator (atomic / paradox / symposium / ducking / spinning / inspinning /
whirling / furious / gyro) or a bare atom-compound on an already-built base — mirror-derive the
op_notation, no ruling. (`Bubba`, `Frootie`, `Fyro`, `Dragon`, `Flapper` are folk modifiers that
read as bare prefixes on a known atom; confirm intent at authoring time but they don't open a
doctrine question.)

## Estimated promotion yield (live)

- **No-Red ceiling: 765 class-A + 222 class-B = 987** entries removable from parser uncertainty
  without any Red ruling (after CLUSTER_VALIDATION reclassification) — gated purely by authoring
  throughput, not doctrine. (Pre-reclassification: 673 + 101 = 774.)
- **Burndown since May-27: 293 names** already resolved (active or abbreviation-variant of a
  canonical trick) — the dedup hits below.
- **Realistic near-term:** class-A *settled-operator-on-already-built-base* compounds are
  immediate (the bucket-2 mirror method); the class-B cascade tail (101) needs base layers built
  first. Class A is now genuinely net-new — the inflation from abbreviation-twins is gone.

## Alias / dedup hits already resolved since May-27 (293)

The normalizer folded these out of the frontier — they map to an active slug. Sample:

`Atomic DLO`→atomic-double-leg-over, `Atomic Legover (same side)`→atomic-legover, `Atomic Osis`→
atomic-osis, `Ducking Pdx Illusion`→ducking-paradox-illusion, `Ducking PS Mirage`→
ducking-paradox-symposium-mirage, `Fairy DLO (ss)`→fairy-double-leg-over, `Gyro DLO`→
gyro-double-leg-over, `DDD`→down-double-down, `Double Switchover (far)`→double-switchover, plus
~180 more Pdx/PS/Symp/ss/op abbreviation-variants and ~50 already-promoted canonical names
(Fission, Fracture, Frankenstein, Godzilla, Grifter, Dominatrix, ...).

## Caveats

1. **Corpus vintage.** wave1-triage is still 2026-05-27; this re-run updates the *dedup filter*
   to the current DB, not the source name-list. A genuinely new external corpus (if Steve's news
   dump or a fresh scrape lands) would add names; this measures the existing corpus against live
   canon.
2. **C is token-presence, not deduplicated residual.** Movement-verb=93 is every name touching
   one of those tokens (often a secondary folk reading); the actionable residual is ~11. The
   DOD/weaving/pogo counts are clean (they ARE the cluster).
3. **A/B boundary is heuristic** (depth + base-built). The combined A+B "no-Red" number (774) is
   the reliable figure; the split is approximate.
