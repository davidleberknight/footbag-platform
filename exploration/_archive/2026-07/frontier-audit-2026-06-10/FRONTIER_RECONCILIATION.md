# Frontier reconciliation: prior 36+11 vs current audit 3+5

The "previous promotion frontier" (36 promotion-ready + 11 needs-authoring = 47)
IS the observational/emerging vocabulary cohort. The current audit reclassified
the same 47 entries (one was a parser artifact, so 46 real). This table accounts
for every one. Full per-trick table: `frontier_reconciliation.csv`.

## Disposition tally (46 reconciled)

| Disposition | Count |
|---|---|
| aliased / mapped to an existing canonical | 17 |
| doctrine-blocked | 20 |
| moved to needs-authoring | 5 |
| still pending (promotion-ready) | 3 |
| removed as duplicate | 1 |
| promoted | 0 (in this cohort) |
| moved to historical review | 0 |

## Why 36 promotion-ready collapsed to 3 — and why that is correct, not a regression

The prior "36 promotion-ready" counted three different things as if they were all
ready. The audit separates them:

- **18 were already resolved, not ready** (17 aliased + 1 duplicate). The PassBack
  orphan reduction wired their folk names as aliases to existing canonicals, so
  they need nothing — they were done, not pending. These are the 18 just pruned.
- **~15 were actually doctrine-blocked, not safe** — mostly the "Double Down"
  (DOD/DDD policy) cohort plus undefined folk operators. Calling them
  promotion-ready was the optimism the audit corrects.
- **3 are genuinely still promotion-ready** (and even those need op_notation
  authored + a bracket-count==ADD check before promoting).

So 36 = 18 done + ~15 blocked + 3 real. The drop reflects real progress (18 cleared
by aliasing) and more honest doctrine accounting (~15 correctly flagged), not lost
ground. The prior "11 needs-authoring" → 5 still authoring + ~5 turned out
doctrine-blocked + 1 artifact.

## aliased / mapped (17) — folk name now an alias of an existing canonical

Big Orange→spinning-symposium-flux, Flare→symposium-whirling-mirage,
GDLO→gyro-double-leg-over, Ghost→whirling-rake,
Golden Shower→stepping-ducking-symposium-eggbeater, GYBAS→stepping-dyno,
Johnny Vodka→pixie-mobius, POD→pixie-double-over-down, Ripcurl→stepping-butterfly-swirl,
Slapdown→quantum-butterfly, Spikehammer→stepping-ducking-mirage,
Super Mario→spinning-symposium-torque, Superdeeduperfly→spinning-ducking-superfly,
Superduperfly→spinning-superfly, Swifter→stepping-swirl, Whirlwalk→whirling-whirl,
Whirlygig→stepping-symposium-whirl.

## removed as duplicate (1)

Riptide ("Stepping far Butterfly Swirl") collapses to the same canonical as Ripcurl
("Stepping near Butterfly Swirl") → both stepping-butterfly-swirl. Riptide is the
duplicate; Ripcurl carries the alias.

## doctrine-blocked (20), by blocker

- **DOD/DDD policy ("Double Down")** — Blurrier, Cold Fusion, Dimmier, Dimmiest, Id,
  Kiwi, Leviathon, Scorpion's Tail, Spanishfly, Torch-R-Rack, Your Mom, Shooting Star.
- **undefined folk operators** — Jackknife (alpine), King Koopa (alpine), Legbreaker
  (flailing), Locomotion (motion), Moby Dick (mobiusscrew/torquescrew), Mortal Kombat
  (grifter), Motion Sickness (motion), Skullsmasher (alpine/atomsmasher).

## moved to needs-authoring (5)

Irish Cream + Tobius (competing readings — pick one → promotion-ready), Monster,
Rotor, Wauxspin (no ADD claim / thin structure).

## still pending — promotion-ready (3)

Anonymous (Spinning Miraging Symposium Miraging Refraction), Green Eggs and Ham
(Stepping Ducking Swivel), Pandora's Box (Gyro Pickup — first verify gyro-pickup isn't
already canonical, in which case it's an alias, not a new promotion).

## Confidence

Every prior-frontier trick lands in exactly one disposition; the totals close
(17+20+5+3+1 = 46, +1 parser artifact = 47). The audit's low promotion-ready count
is explained, not anomalous: the frontier was never 36-deep in safe promotions —
it was 18 already-aliased, ~15 doctrine-blocked, and 3 genuinely ready.
