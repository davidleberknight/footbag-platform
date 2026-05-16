# SCALE-5 Candidate Batch — Operator-Bridge Expansion

Fifth scalable enrichment wave. Selected from `FLAGSHIP_PROMOTION_SHORTLIST.csv`
filtered to **LOW-risk rows with no Red-dependency or conflict status**, so the
batch can proceed in parallel with pending Red questions (Q1 Atomic-on-Illusion,
Q2 Double-Pixie, Q3 positional operators class).

## Filtering applied

| filter | excludes |
|---|---|
| Risk = MEDIUM-HIGH or HIGH | atomic-illusion (Red Q1), blurry-whirl (pt12), food-processor (pt12 item 5b) |
| Risk = MEDIUM | plasma (FM decomposition unverified) |
| Not in IFPA dictionary | marius (FM alias chain needs verification) |

**16 candidates pass.** All exist in the DB, all have LOW risk, none blocked
on Red or pt12.

## Pool inventory (16 stable candidates)

Sorted by family for visual coherence:

| slug | ADD | family | bridge | mod_links | records |
|---|---|---|---|---|---|
| **ducking-clipper** | 3 | clipper-stall | ducking | 1 | 1 |
| **drifter** | 3 | clipper-stall | miraging + clipper | 0 (base) | 3 |
| **ducking-butterfly** | 4 | butterfly | ducking | 1 | 1 |
| **spinning-butterfly** | 4 | butterfly | spinning | 1 | 1 |
| **atomic-butterfly** | 4 | butterfly | atomic | 1 | 0 |
| **ripwalk** | 4 | butterfly | stepping | 1 | 1 |
| **ducking-osis** | 4 | osis | ducking | 1 | 1 |
| **paradox-mirage** | 3 | mirage | paradox | 1 | 0 |
| **symposium-mirage** | 3 | mirage | symposium | 1 | 1 |
| **smear** | 3 | mirage | pixie | 1 | 1 |
| **atom-smasher** | 4 | mirage | atomic | 0 (named compound) | 1 |
| **magellan** | 3 | legover | pixie | 1 | 1 |
| **paradox-drifter** | 4 | drifter | paradox | 1 | 2 |
| **tombstone** | 4 | drifter | stepping cross-family | 1 | 1 |
| **paradox-torque** | 5 | torque | paradox | 1 | 2 |
| **spinning-torque** | 5 | torque | spinning | 1 | 0 |

## Recommended primary batch (10 rows)

Cross-bridge coverage with strong foundation rows and pedagogical anchors:

| # | slug | ADD | family | bridge | role |
|---|---|---|---|---|---|
| 1 | drifter | 3 | clipper-stall | miraging + clipper | base — anchors drifter family tree (paradox-drifter, smoke, tombstone, vortex) |
| 2 | ducking-clipper | 3 | clipper-stall | ducking | foundation — simplest ducking compound; pairs with ducking-whirl pilot |
| 3 | paradox-mirage | 3 | mirage | paradox | anchor — paradox on simplest rotational base; referenced in spinal-tap pilot |
| 4 | smear | 3 | mirage | pixie | completes pixie bridge to 6 rows (mirage family enters) |
| 5 | ducking-butterfly | 4 | butterfly | ducking | cross-family ducking; pairs with hatchet (whirl diving) |
| 6 | ducking-osis | 4 | osis | ducking | cross-family ducking on rotational stall |
| 7 | ripwalk | 4 | butterfly | stepping | pt11 reference: ripwalk = Stepping Butterfly |
| 8 | spinning-butterfly | 4 | butterfly | spinning | spinning on non-rotational base; pairs with spinning-whirl |
| 9 | paradox-drifter | 4 | drifter | paradox | paradox cross-family; completes drifter line further |
| 10 | spinning-torque | 5 | torque | spinning | spinning on rotational base; demonstrates pt10 no-double-stack rule |

**Coverage after primary batch lands** (pilot tier 25 → 35 of 160 = 21.9%):

| modifier bridge | before SCALE-5 | after primary batch | new family bases |
|---|---|---|---|
| pixie | 5 | **6** | + mirage (smear) |
| ducking | 5 | **8** | + clipper-stall, butterfly, osis |
| spinning | 4 | **6** | + butterfly, torque |
| paradox | 8 | **10** | + mirage, drifter |
| stepping | 1 | **2** | + butterfly (ripwalk) |

Drifter family: 1 → 3 pilot (drifter base + paradox-drifter + smoke pilot from
SCALE-4).

## SCALE-5b extension batch (6 additional stable rows)

These are also LOW-risk, no Red dependency, and would complete additional
bridges. Available as a SCALE-5b mini-batch if you want to push further now:

| # | slug | ADD | family | bridge | role |
|---|---|---|---|---|---|
| 11 | magellan | 3 | legover | pixie | + legover base; demonstrates `near` positional |
| 12 | symposium-mirage | 3 | mirage | symposium | + mirage symposium foundation |
| 13 | atomic-butterfly | 4 | butterfly | atomic | + butterfly atomic; aliased FM "Legbeater" |
| 14 | atom-smasher | 4 | mirage | atomic | + mirage atomic-rotational (pt10 +2 rotational rule) |
| 15 | tombstone | 4 | drifter | stepping cross-family | + drifter stepping |
| 16 | paradox-torque | 5 | torque | paradox | + torque paradox |

If SCALE-5b lands too, pilot tier reaches 25 → 41 of 160 (25.6%); pixie bridge
extends to 7 rows, atomic bridge from 1 to 4, symposium bridge extends to 6.

## Cadence-design preview (for SCALE-5a authoring)

Following the SCALE-2-validated pre-write discipline. Each row's draft will
be mapped before authoring across:

| axis | distinct values needed (for 10-row batch) |
|---|---|
| opening cadence | foundation-led / imperative / mechanic-first / contrast / pairing-led / body-line-led / sequence-led / dual-feature / modifier-led / cross-family-rhythm-led |
| coaching emphasis | base-mechanic / synchronization / direction / dual-axis / posture / timing / integration / energy / priority / progression |
| failure mode | base-incompletion / late-modifier / direction-drift / merging / collapse / early-step / priority-confusion / one-eating-other / consumption / cascading |
| family-vocabulary preserved | family base name + rotation/stall mechanic + body-modifier terminology — acceptable repetition |

10 distinct positions on each axis. SCALE-2 produced zero post-load rewrites
under this discipline; the discipline applied again here should keep the
pattern.

## Apply pipeline (planned for SCALE-5c)

Identical to SCALE-1c / SCALE-2c / SCALE-3-blender-c / SCALE-4-bridge-c:

1. Read-only diagnostic — confirm all 10 rows have empty pilot prose columns.
2. Audit CSV — pre-load NULL state.
3. Rollback SQL — restores NULL.
4. Transaction-wrapped UPDATE — 10 rows, four columns each.
5. Re-capture HTML + render verification + forbidden-term audit.
6. Cadence audit on the post-load state.
7. Memory close (SCALE-5e).

## Deferrals carried into SCALE-6+

**Red-blocked** (await Q1/Q2/Q3 outcome):
- atomic-illusion (Q1 Atomic-on-Illusion)
- terrage (Q2 Double-Pixie semantics)
- magellan (Q3 positional `near` ratification — currently grouped with the
  Q3 class question; can promote in primary batch since LOW risk; remains a
  Q3 reference example)

**pt12-blocked**:
- blurry-whirl, food-processor, whirlygig, blurry-torque (Q5 pt12 Blurry-class)

**Federation-blocked**:
- barfly (federation pending; FM canonical name divergence)
- blur (ontology pending; pt10 shift; FM "Blurry Mirage" two-reading)

**Q4-blocked**:
- Casket, Flaming Homer, Glaucoma, Park Avenue (fairy)
- Leaning Jowler, Phase, Down Double Down, Arch Nemesis, Bill & Ted's,
  Compound Fracture (other FM-vocab modifier-blocked)

**Modifier-bridge gap candidates** (low priority; not in this shortlist):
- tapping-whirl (deferred from SCALE-2)
- surreal, rev-whirl, rev-up (deferred from SCALE-2)
- The 100+ non-pilot non-op-notation IFPA rows beyond the bridge cohort

## Files produced

- `exploration/freestyle-notation-grammar/SCALE5_CANDIDATE_BATCH.md` (this report)
- `exploration/freestyle-notation-grammar/SCALE5_ACTION_MATRIX.csv` (21-row matrix; SCALE-5 disposition column)

No DB writes. No alias inserts. No ontology mutation. No prose authored yet
(SCALE-5a is the next phase — say "begin SCALE-5a" to start authoring drafts
for the primary 10 with cadence-design discipline).

## Decision points for the user

1. **Primary batch (10 rows) vs combined batch (16 rows)?** Primary is the
   recommendation for cadence-design quality (proven at SCALE-2 sample
   size); combined is viable but larger.
2. **Magellan inclusion**: included in primary batch since LOW risk, even
   though it sits adjacent to the Q3 `near` operator question. Q3 ratifies
   the rule the row already obeys (math agrees under `near` = +0); the row
   doesn't depend on Q3 outcome for prose validity.
