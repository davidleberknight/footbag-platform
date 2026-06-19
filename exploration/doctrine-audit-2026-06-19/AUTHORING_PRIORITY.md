# Authoring Priority Audit

Ranks the reclassified no-Red work (A=765 + B=222 = **987**) by **promotions per hour**, not
novelty. No authoring performed — this is the execution-ordering plan. Buckets are mutually
exclusive (each entry lands in exactly one) and computed from the live frontier
(`wave1-triage` names, current-DB dedup, reclassified operator set).

Effort = throughput estimate per item (mirror-and-verify, not first-authoring). Reduction =
share of the **1435-entry live frontier** each bucket clears.

| # | Bucket | Count | Est. hours | Yield (promo/hr) | Frontier reduction |
|---|---|---|---|---|---|
| 1 | **Immediate mechanical** | **386** | ~51h | **7.5/hr** | **27%** |
| 2 | Family-completion | 112 | ~34h | 3.3/hr | 8% |
| 3 | Alias-resolution | 10 | ~1h | 12/hr* | <1% |
| 4 | Identification-dependent | 258 | ~64h | 4.0/hr | 18% |
| 5 | Frontier authoring | 221 | ~129h | 1.7/hr | 15% |
| | **Total A/B** | **987** | **~279h** | | **69%** |

\*Bucket 3's raw rate is highest but the volume is tiny and the user-facing value is near-zero
(aliases, not new browse rows); several entries are notation-noise (`Whirl/swirl`,
`Rooting/Rooted`). Not a strategic lead.

---

## Bucket 1 — Immediate mechanical (386, ~51h, 7.5/hr)
Single settled operator (or bare-atom quantity compound) on a settled base, depth ≤2, an exact
same-operator sibling already notated → pure mirror, near-zero curator risk.
**Examples:** Double Dyno, Gyro Toe, Far Reverse Whirl, Inspinning Same Side Mirage, Inspinning
Same Side Illusion, Stepping far Clipper, Terraging Opposite/Same Clipper, Toe Spinning Toe,
Double Spinning Rake, Backside Symposium Toe Blizzard.
**Method:** mirror the existing `<operator>-*` resolvedFormula; bracket-count==ADD gate; no
family override needed for single-operator-on-own-family bases.
**Reduction:** 386 / 1435 = **27% of the live frontier in one bucket.**

## Bucket 2 — Family-completion (112, ~34h, 3.3/hr)
Two settled operators stacked on a **public-family** base (osis/whirl/legover/mirage/butterfly/
illusion/swirl/pickup/blender/torque/drifter/eggbeater) — fills visible holes in the family
browse grid. Higher browse value, slightly more work (pick the right sibling chassis + the
loader-19 `trick_family` override when base_trick is a different family).
**Examples:** Atomic Ducking Mirage, Nuclear Ducking Mirage, Atomic Symposium Whirl, Spyro
Symposium Mirage, Flailing Symposium Mirage, Railing Ducking Legover, Sailing Gyro Pickup,
Shooting Gyro Mirage, Stepping Diving Double Legover.
**Reduction:** 8%; disproportionate *browse* value (family-view completeness).

## Bucket 3 — Alias-resolution (10, ~1h, 12/hr)
Names that fold to an **alias** of an existing canonical row (alt-name slash, folk synonym) —
clears parser uncertainty, adds no new browse entry.
**Examples:** High Plains Drifter / Barrifter, Superduperfly / Poisonous Toe, Fairy Legover /
Toe ss Eggbeater, PLO (Pixie Legover) / Toe ss DLO. (Plus noise: Whirl/swirl, Rooting/Rooted.)
**Reduction:** <1%. Do opportunistically alongside Bucket 1, not as a campaign.

## Bucket 4 — Identification-dependent (258, ~64h, 4.0/hr)
Structure is probably inferable but the **folk lead-name** needs mapping/curator confirmation
before promotion (otherwise risks fabricating identity). Throughput is gated by the human
glance, not the keyboard.
**Examples:** Zulu Legover/Osis/Pickup/Whirl, Bubba Butterfly/Legover, Arctic Butterfly,
Nemesis Swirl, Scorpions Toe Nail, Frootie Mirage/Illusion/Legover, Fyro Mirage/Torque, Symple
Reverse Swirl. (`Symple`=symposium and `Fyro`=likely gyro are near-mechanical once the prefix
glossary is confirmed — a ~30-name sub-batch could shift to Bucket 1 after one curator pass on
the folk-prefix list.)
**Reduction:** 18%, but only after name-mapping; do NOT promote blind.

## Bucket 5 — Frontier authoring (221, ~129h, 1.7/hr)
Settled doctrine but **no exact sibling to mirror** — deep stacks (≥3 operators) or
not-yet-built base cascades requiring new chassis authoring.
**Examples:** Atomic Ducking Double Legover, Far Whirling Bent Symposium Swirling Osis, Gyro
Torquescrew, Stepping Ducking Far Double Pickup, Flailing ss Symposium Double Legover, the 7
composite-set chassis (railing/sailing/splicing/surfing/floating/shooting/warping) whose
authoring also closes notation on dozens of *already-active* compounds.
**Reduction:** 15%, lowest rate; sequence last (or build base layers first so its items
cascade down into Bucket 1 on a later pass).

---

## Recommendation — execute Bucket 1 first

**Bucket 1 is the single highest-yield batch: 386 promotions at ~7.5/hr (~51h), 27% of the live
frontier, near-zero curator risk.** It dominates on every axis that matters for promotions-per-
hour: largest absolute reduction, lowest risk, no curator dependency, no new chassis writing.
Bucket 3's rate is nominally higher but clears <1% and carries no browse value.

**Within Bucket 1, lead with the settled-operator families that already have a notated exemplar
to mirror** — `furious-*`, `atomic-*`, `nuclear-*`, `spyro-*` (=gyro), `terraging-*`,
`inspinning-same-side-*` on the big-family bases (osis/whirl/mirage/illusion/butterfly). That
sub-batch is the fastest, most uniform mirror work and the cleanest first slice.

**Second pass:** a single curator glance at the **folk-prefix glossary** (Symple→symposium,
Fyro→gyro, Bubba/Frootie/Zulu/Arctic identity) would migrate ~30-60 entries from Bucket 4 into
mechanical Bucket-1-style work — a high-leverage ~1h curator ask that unlocks ~4-8 promotion
hours. That is the best *next* lever after Bucket 1.

**Do not start with Bucket 5** (1.7/hr) — and where a Bucket-5 base layer (e.g. a composite-set
chassis) would let several Bucket-1 items mirror it, build that base first so the dependents
collapse into the cheap bucket.
