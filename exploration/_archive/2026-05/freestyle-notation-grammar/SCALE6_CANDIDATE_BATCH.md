# SCALE-6 Candidate Batch — Foundation Pass

Sixth scalable enrichment wave. Strategic pivot from operator-bridge
expansion (SCALE-4 / SCALE-5 / SCALE-5b) to **foundation-row promotion**:
promoting the base trick rows that pilot compounds reference but that
themselves render as sparse, prose-free pages.

## Strategic context

After SCALE-1 through SCALE-5b, pilot tier reached 43/160 with 7 modifier
bridges. But cross-reference analysis surfaces a structural gap: pilot
compound pages reference foundation base rows extensively in their prereqs
sections, yet those foundation rows themselves carry no prose.

| foundation row | compounds rooted here | pilot prereqs that reference it |
|---|---:|---:|
| butterfly | 11 | **23** |
| mirage | 10 | **17** |
| eggbeater | 1 | 6 |
| torque | 8 | 5 |
| osis | 6 | 5 |
| legover | 5 | 1 |
| clipper-stall | 5 | 1 |
| around-the-world | 2 | 0 |
| swirl | 1 | 0 |
| eclipse | 0 | 0 |

**58 pilot-page references** to these 10 rows currently land on sparse pages.
A learner reading mind-bender's prose sees "Blender (4 ADD)" referenced; they
click through and land on a richly-authored blender page (SCALE-3 pilot). But
that same learner clicking "Butterfly (3 ADD)" from any of 23 different
pilot pages lands on a near-empty butterfly page. This batch closes that gap.

## Filtering applied

Starting from 117 non-pilot active rows:

| filter | pool after filter |
|---|---|
| Active non-pilot rows | 117 |
| Subtract Red-blocked (Q1/Q2: omelette/terrage/atomic-illusion) | 114 |
| Subtract pt12-blocked (blurry-whirl/blurry-torque/food-processor/**barraging-osis**) | 110 |
| Subtract federation/ontology-blocked (barfly/blur) | 108 |
| Subtract SCALE-2-deferred (tapping-whirl/surreal/rev-whirl/rev-up) | 104 |
| Subtract parser-unconfirmed (no parse data; not in 150-row corpus) | **94** |
| Of those: foundation-role candidates with high cross-reference traffic | **10 (this batch)** |
| Available for SCALE-7+ | **84** |

Note: `barraging-osis` newly added to pt12 deferral per the parser diagnostic
audit (asserted=5 vs computed=4; same expanded-decomposition class as blurry-whirl + blurry-torque).

## Primary batch (10 rows)

Sorted by ADD ascending:

| # | slug | ADD | family | compounds rooted | pilot refs | records | role |
|---|---|---|---|---|---|---|---|
| 1 | around-the-world | 2 | atw | 2 | 0 | 1 | standalone-with-records |
| 2 | clipper-stall | 2 | clipper-stall | 5 | 1 | 1 | foundation_base (anchors drifter + ducking-clipper pilots) |
| 3 | legover | 2 | legover | 5 | 1 | 1 | foundation_base (anchors magellan + pigbeater pilots) |
| 4 | mirage | 2 | mirage | 10 | 17 | 1 | foundation_base (anchors 5 mirage-family pilot compounds + 12 cross-family refs) |
| 5 | butterfly | 3 | butterfly | 11 | 23 | 1 | foundation_base (highest pilot-reference count in dictionary) |
| 6 | eclipse | 3 | eclipse | 0 | 0 | 2 | standalone-with-records |
| 7 | eggbeater | 3 | legover | 1 | 6 | 2 | foundation_compound (direct parent of pigbeater pilot) |
| 8 | osis | 3 | osis | 6 | 5 | 1 | foundation_base (anchors blender = Whirling Osis + torque = Miraging Osis) |
| 9 | swirl | 3 | swirl | 1 | 0 | 2 | standalone-with-records |
| 10 | torque | 4 | osis | 8 | 5 | 2 | foundation_base (anchors paradox-torque + spinning-torque + spinal-tap pilots) |

**Coverage after primary batch lands** (pilot tier 43 → 53 of 160 = 33.1%):

- Every major family tree gains a pilot root row
- 58 pilot-page prereq references now resolve to authored prose pages
- Foundation network: butterfly + mirage + osis + torque + legover + clipper-stall + eggbeater all pilot — entire scaffolding of the dictionary's rotational, dex, and stall families becomes navigable in authored form
- 3 independent record-holders also enriched: around-the-world, eclipse, swirl

## Cadence design (pre-authoring)

This is a different rhetorical challenge from SCALE-1 through SCALE-5b. Those
batches enriched COMPOUNDS with prose like "X's mechanic on Y's base". SCALE-6
enriches BASE rows — they have no modifier to discuss; instead, the prose
must:
- Describe the base trick's own mechanic
- Frame the trick as foundation: list compounds that build on it
- Avoid claiming the base "is the foundation" templated phrase (SCALE-5 templated tell)

| row | opening cadence | structural framing |
|---|---|---|
| around-the-world | rotational-pattern-led | base trick mechanic; family root for double-around-the-world variants |
| clipper-stall | cross-body-delay-led | foundation surface for ducking-clipper, drifter, etc. |
| legover | leg-passing-led | leg-over dexterity; foundation for eggbeater, magellan, pigbeater |
| mirage | in-to-out-dex-led | rotational dex; foundation for paradox-mirage, smear, tap, symposium-mirage, atom-smasher (5 pilot compounds + 5 deferred) |
| butterfly | wing-pattern-led | compound-dex with wing motion; foundation for dimwalk, ripwalk, tripwalk, matador, phoenix, atomic-butterfly, spinning-butterfly, ducking-butterfly (+ more) |
| eclipse | standalone-record-led | independent family; record holder |
| eggbeater | legover-compound-led | illusion-modified legover; parent of pigbeater pilot |
| osis | inside-to-outside-led | foundational rotational-stall combination; transitively the base of blender (Whirling Osis) and torque (Miraging Osis) |
| swirl | independent-family-led | rotational variant family |
| torque | miraging-osis-led | rotational base; anchors paradox-torque, spinning-torque, spinal-tap pilots |

**Templated tells to avoid** (SCALE-5 lessons):
- `Practitioners with clean X tend to…`
- `tend to` verb spam (cap ≤ 2-3x)
- `is the foundation` (use qualified variants: "anchors", "carries", "provides the geometry")
- `is the limiter`
- `most misses come from`
- `From a toe set` opener (SCALE-1 tell)
- `The body` opener (max 3x as in SCALE-5)

## Apply pipeline

Same as SCALE-5c:
1. Read-only diagnostic — confirm all 10 rows have empty pilot prose columns
2. Audit CSV — pre-load NULL state
3. Rollback SQL — restore-NULL for the 10 slugs
4. Transaction-wrapped UPDATE
5. Re-capture HTML; verify pilot sections render
6. Forbidden-term audit + cadence audit (full 6-axis given 10-row size)
7. Memory close (SCALE-6e)

## Deferrals carried into SCALE-7+

**84 stable candidates remain** for future SCALE batches. Top opportunities:

| modifier bridge gap | available stable rows | examples |
|---|---:|---|
| stepping (currently 3 pilot) | 10 | haze (stepping + DLO), sidewalk, stepping-osis, bigwalk, fog |
| spinning (currently 6 pilot) | 7 (excl. spinning-torque) | merkon, spinning-clipper, spinning-osis, surge |
| paradox (currently 11 pilot) | 5 | royale, fury (FM delta), gauntlet |
| pixie (currently 7 pilot) | 2 | smudge, smog |
| symposium (currently 6 pilot) | 4 | flail, witchdoctor, superfly |
| atomic (currently 3 pilot) | 2 | witchdoctor, atomic-torque |

Plus 30+ independent rows (records-rich): dyno, ripstein, jani-walker, etc.

**Blocked** (carry forward unchanged):
- pt12 expanded-decomp class: blurry-whirl, blurry-torque, food-processor, barraging-osis (newly added)
- Red Q1/Q2 blocked: omelette, terrage, atomic-illusion
- Federation/ontology: barfly, blur
- SCALE-2 deferred: tapping-whirl, surreal, rev-whirl, rev-up

## Files produced

- `exploration/freestyle-notation-grammar/SCALE6_CANDIDATE_BATCH.md` (this report)
- `exploration/freestyle-notation-grammar/SCALE6_ACTION_MATRIX.csv` (115 rows: 10 batch + 93 available + 12 blocked)

No DB writes. Say "begin SCALE-6a" to author drafts for the 10 foundation rows with cadence-design discipline, or call out an alternative batch composition.
