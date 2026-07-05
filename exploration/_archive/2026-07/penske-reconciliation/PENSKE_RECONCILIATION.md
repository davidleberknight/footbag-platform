# Jim Penske record reconciliation

## Why this exists

The Insights page idea of counting a player's "Unique Fearless" / "Unique Beastly"
tricks rests on a misreading of the data. In `freestyle_records`, **Unique Fearless**
and **Unique Beastly** are not tricks: they are run-quality record tiers (every trick
in the run at 5+ ADD = fearless, 6+ ADD = beastly), stored with
`record_type = trick_consecutive_dex`. They are not unique-trick buckets and cannot be
classified as innovations.

What *is* real and useful: Jim Penske has 21 documented trick-consecutive record names.
Several do not resolve to the canonical dictionary. Reconciling them is a worked example
of the broader orphan-record-names cleanup (the ~48 record trick-names that link to no
canonical trick or alias).

Reproduce with `python3 exploration/penske-reconciliation/reconcile.py`. Resolution uses
exact slug + canonical-name match, then alias match, the same resolution a trick-detail
page uses to link records.

## Classification (21 record names)

`canonical = 14  ·  alias = 2  ·  scoring-category = 2  ·  orphan = 3`

| Record name | Status | Canonical target |
|---|---|---|
| Blazing Butterfly | canonical | blazing-butterfly |
| Drifter | canonical | drifter |
| Dyno (op) | canonical | dyno |
| Food Processor | canonical | food-processor |
| Jani Walker | canonical | jani-walker |
| Paradox Blender | canonical | paradox-blender |
| Paradox Drifter | canonical | paradox-drifter |
| Paradox Symposium Whirl | canonical | paradox-symposium-whirl |
| Scorpion's Tail | canonical | scorpions-tail |
| Spinning Whirl | canonical | spinning-whirl |
| Swirl | canonical | swirl |
| Symposium Swirl (op) | canonical | symposium-swirl |
| Symposium Whirling Swirl | canonical | symposium-whirling-swirl |
| Torque | canonical | torque |
| Swifter | **alias** | stepping-swirl |
| Whirr | **alias** | double-whirl |
| Unique Fearless | scoring-category | run-quality tier, not a trick |
| Unique Beastly | scoring-category | run-quality tier, not a trick |
| Backside Magellan | **orphan** | (none) |
| Locomotion | **orphan** | (none) |
| Motion | **orphan** | (none) |

## Red packet — orphan names

These three record names resolve to neither a canonical trick nor an alias. For each,
the questions for review:

1. Is it a genuine trick not yet in the dictionary (promote)?
2. Is it a folk / older name for an existing canonical trick (wire as an alias)?
3. Is it a modern renaming, or a personal naming variant?
4. If none of the above, should the record name be normalized at the source?

| Trick | Status | Notes for review |
|---|---|---|
| Backside Magellan | review | Folk name. Likely a named compound; needs a structural reading to confirm canonical equivalent or promotion. |
| Locomotion | review | Folk name. Candidate alias of an existing whirl/swirl-family compound, or a promote. |
| Motion | review | "motion" is a curator-undefined operator token elsewhere in the dictionary; resolve whether the record refers to a defined trick or the undefined operator before aliasing. |

Already settled, no Red question needed:

- **Unique Fearless / Unique Beastly** stay as run-quality record tiers. Do not model
  them as tricks anywhere. (This retires the original "unique fearless tricks" idea.)
- **Swifter -> stepping-swirl**, **Whirr -> double-whirl**: alias links exist; the records
  link correctly. No action.

## Cross-reference

Folds into the legacy-data IP item "Records with non-canonical trick_names (~48 orphans)".
Penske's three orphans (Backside Magellan, Locomotion, Motion) are part of that set; the
same reconcile pass can be run over all record names to drive that cleanup.
