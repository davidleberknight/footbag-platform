# Movement Grammar v1.0: Exploratory Generation

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. No production code, no dictionary rows, no trick names, no promotions. This is a generation experiment against a frozen grammar. It does not improve the grammar and does not resolve any open question; it runs the grammar and observes where it breaks.

Companion to the Phase I trick-universe work (`freestyle/research/trick-universe-matrix/`), the Phase II-A enumeration (`exploration/trick-universe-phase-2a/`), and the grammar-closure study (`exploration/grammar-closure/GRAMMAR_CLOSURE_STUDY.md`), which defines the frozen basis under test here.

Generator: `generate_v1.py` (read-only; writes only the two CSVs in this folder). Do not hand-edit the CSVs.

## 0. What was frozen, and what the experiment asked

Grammar v1.0 is taken exactly as the closure study left it, and is **not modified**. Its primitive basis:

- **Four firm generators:** a contact (a bag resting on a surface, launched or landed), a cross-body contact, a dexterity (the leg circles the bag, with side, direction, rotation, and far-receiver parameters), and a body step (the body moves with no new bag contact).
- **The firm scoring law:** ADD equals the count of scored generators in the word.
- **The open floor, carried unresolved:** posture (planted, no-plant, airborne), paradox (a dex done with a double-hip-pivot), pogo (a set that scores with no dex, body, or contact), the bare-surface kick, and the unpinned rotation-grade rule.

The grammar is allowed to be incomplete. Its uncertainties are already documented, and in this experiment they are the point. The question is not "how do we improve it" but "how much of the movement universe can it describe before it breaks, and where does it break." The scope is the same 0-and-1-dexterity, established-surface bound as Phase II-A. Within that bound the generator emits the grammar's raw production, including what it over-generates, and classifies every formula.

## 1. Method

The generator runs in three parts so the coverage metric stays honest.

- **Base determinate space.** The 0-and-1-dexterity cube with rotation off, paradox off, posture planted, and delay terminals: every formula whose ADD the firm scoring law determines outright. This is the coverage denominator. The generator emits the raw cross-product and classifies each row, rather than silently pruning the over-generation, because the over-generation is evidence.
- **Contamination probes.** The three open dex-parameters (rotation, paradox, posture), each applied once to every clean formula in the base 1-dex core. These are held out of the base denominator on purpose: an open dimension with more settings would otherwise inflate or deflate the coverage number by accident. Kept separate, they measure something more useful, which is how far each single unresolved concept reaches.
- **Structural probes.** Constructs the grammar carries but the 0-1 dex cube never forces (generic-`SET` launch, the `>>` simultaneity operator, a standalone cross-body contact) and the two floor primitives that cannot be written at all (pogo, and the bare-surface kick already caught in the base pass).

Every break is classified into the failure taxonomy from the brief (missing-primitive, ambiguous-primitive, unresolved-grading, unresolved-posture, unresolved-notation, unresolved-simultaneity, unresolved-composition, internal-contradiction, duplicate-generation, unexpected-redundancy, unexpected-symmetry). Failures are classified, never worked around.

## 2. What was generated, and what succeeded

The base space is **271 movement formulas**. They split cleanly:

| Outcome | Count | Share | Meaning |
|---|---|---|---|
| Clean | 169 | 62.4% | the grammar represents and grades the formula unambiguously |
| Blocked | 48 | 17.7% | the grammar correctly refuses to generate it |
| Failure | 54 | 19.9% | the grammar breaks, over-generates, or cannot grade |

Removing the correct rejections, **75.8% of the generable base space is clean.** The clean set is not scattered: it is the whole 0-dex stall and body layer, and the full plain-and-hard-landing 1-dex cube over the toe, clipper, and self launches with a plain dex. That core generates without a single ambiguity, and its ADD is fixed by the scoring law in every case. On the strength of the base pass alone, the grammar looks close to sufficient.

The 48 blocked formulas are the grammar working, not failing: every one is a cross-body launch trying to reach its own foreclosed dex-side face, which the launch-symmetry rule correctly rejects. A generator that produces zero of these is a generator that respects the rule.

## 3. Where the grammar failed

The 54 base failures fall into exactly **four classes**, and the striking thing is how few kinds there are:

| Failure class | Count | What it is |
|---|---|---|
| duplicate-generation | 24 | midline landings (head, forehead, neck, cloud) have one central target, but the terminal-side axis still generates a same-side and an opposite-side copy; the second is a duplicate the grammar does not know to suppress |
| unresolved-notation | 17 | the peak surface (sixteen cube vertices plus one stall) is unresolved as a landing surface versus a timing marker, so the grammar cannot say what contact it is |
| unexpected-redundancy | 8 | the toe self-fiber is identical to the toe-launch cube; the grammar generates the same eight coordinates twice under two descriptions |
| internal-contradiction | 5 | the bare-surface kick (sole, cloud, heel, toe, inside) scores 1 in the corpus but has no scored generator, which directly contradicts the firm ADD = scored-generator-count law |

Two of these (duplicate-generation, unexpected-redundancy) are enumeration-hygiene faults: the grammar's axes are slightly too free, so the raw cross-product contains non-distinct formulas. Two (peak notation, the bare-surface kick) are exactly the gaps the closure study already flagged. Nothing new and structural surfaced in the base pass. The grammar did not break in a surprising place.

## 4. The real result: failures are few in kind but large in reach

The base pass understates the problem, because it holds the three open dex-parameters at their determinate settings. The contamination probes lift that restriction one concept at a time, applied to the **152 clean 1-dex formulas**:

| Open concept | Variants generated | Reach across the clean 1-dex core |
|---|---|---|
| rotation (whirl / swirl) | 304 | every clean formula has two rotational variants the grammar cannot grade (grade-neutral vs grade-raising is unpinned) |
| paradox | 152 | every clean formula has a paradox variant whose ADD is one of two values (parameter +0 vs scored event +1) |
| posture (no-plant) | 152 | every clean formula has a no-plant variant whose ADD is indeterminate (scored event vs licensing parameter) |

This is the central finding, and it answers the brief's question about whether failures cluster around a small number of unresolved concepts: **they do, decisively.** There are only about six unresolved concepts in the whole grammar (rotation grade, paradox, posture, pogo, the bare-surface kick, and the peak/generic-`SET` notation gaps). But three of them (rotation, paradox, posture) are ordinary, first-class dex-parameters that attach to almost any dexterity, so each one contaminates the entire clean 1-dex core. The failures are few in kind and vast in reach. The grammar's clean 62% is clean only because the base pass keeps three common knobs turned off; turn any of them on and the ADD of a large majority of the 1-dex universe becomes indeterminate.

## 5. Grammar coverage summary

Grammar coverage only, no claim about physical realizability.

- **Base determinate 0-1 dex space:** 62.4% generated cleanly, 17.7% correctly blocked, 19.9% failed. Of the non-blocked generable space, 75.8% clean.
- **Base failures** are 100% accounted for by four classes: two enumeration-hygiene faults (duplicate-generation, redundancy) that a dedup rule removes, and the two documented gaps (peak notation, bare-surface-kick contradiction).
- **Beyond the base pass:** the clean fraction of the *full* 0-1 dex token space (letting rotation, paradox, and posture vary) is far lower, because every clean 1-dex formula acquires at least four variants the grammar cannot grade. The exact percentage depends on how many parameter settings one counts as in-scope, which is itself undefined in v1.0; the honest statement is that clean coverage of the parameterized space is a minority, gated by three concepts.
- **Ambiguous** is therefore not a fixed slice of the base pass; it is a multiplier that three unresolved parameters apply on top of the clean core.

## 6. Contradiction report

The brief asks specifically what the experiment revealed about hidden structure. Point by point:

- **Hidden duplicate primitives?** No. The symmetry finding (below) explains the apparent repetition without positing duplicate primitives. Pixie and fairy, mirage and illusion, and their kin are one dexterity generator at different vertices, exactly as the closure study concluded; the generator reproduces them from a single schema and finds no primitive doubled.
- **Unnecessary primitives?** No. Every firm generator was exercised and none proved eliminable within this scope.
- **Missing primitives?** Yes, and confirmed constructively. The generator could not emit a well-formed scored formula for pogo at all: pogo scores 1 with no dex, body, or contact token to carry the point, so there is literally no v1.0 string for it. The bare-surface kick is the same phenomenon from the other side (a scored point with no scored generator), and it shows up in the base pass as five internal contradictions against the scoring law. These are one candidate missing primitive seen twice.
- **Hidden symmetries?** Yes, a positive one. The eight-vertex toe cube is closed under the Klein-four group generated by flipping dex-side, direction, and terminal-side. The direction-flip axis alone pairs the whole cube: around-the-world with orbit, pixie with fairy, mirage with illusion, pickup with legover. The grammar is not a flat list of eight independent atoms; it is one schema with a symmetry group acting on it. This is a structure worth keeping, because it means the named vocabulary is generated by far fewer independent choices than its size suggests.
- **Places the grammar is stronger than expected?** Yes. The standalone cross-body probe generated cleanly: because the closure split made the cross-body contact its own grade-1 primitive, v1.0 represents a bare cross-body contact with no delay, a formula the delay-terminal cube never produced. The grammar reaches further than the base cube pass showed, which is a point in its favor.

## 7. What surprised me

Two things.

First, how *little* new the base pass surfaced. Every base failure was either an enumeration-hygiene fault or a gap the closure study had already named. Running the grammar did not discover a new hidden primitive beyond pogo and its kick-twin. That is reassuring: the closure study's inventory of open questions appears to be complete, not merely a first draft.

Second, how the difficulty inverted between the base pass and the parameterized space. The base pass says the grammar is 75.8% clean and looks nearly ready. The contamination probes say the opposite: three ordinary parameters, none of them exotic, put an ungradeable variant on essentially every clean formula. The grammar's weakness is not a missing corner of the movement space; it is three unresolved grading rules sitting on the most common parameters, so the weakness is everywhere at once rather than localized. The base coverage number is real but misleading on its own.

## 8. Final question: is Grammar v1.0 already useful enough to support systematic exploration?

**Partly, and the split is clean and important.**

**For the plain core, yes.** For the 0-and-1-dexterity space with plain dexes, planted posture, no paradox, and established surfaces, the grammar generates cleanly, grades every formula unambiguously, correctly blocks what the symmetry rules forbid, and even carries a genuine symmetry group. Systematic exploration of that slice is already fully supported today, with only two mechanical fixes needed first: a dedup rule that collapses the midline terminal-side axis and the toe self-fiber (removing all 32 duplicate-and-redundant formulas), and a decision to hold the peak surface out until its notation is ruled. Neither is a grammar change; both are enumeration hygiene.

**For the full movement universe, not yet.** The moment exploration includes rotation, paradox, or posture (which real tricks do constantly), the grammar cannot grade what it generates, and that gap covers essentially the entire parameterized 1-dex space, not a fringe of it. A systematic enumeration run today would produce an authoritative-looking universe in which the ADD of most rotational, paradox, and no-plant tricks is silently wrong or missing, and pogo's whole family is absent. That is precisely the premature-generation failure this line of work exists to avoid.

**The smallest change that would make it useful** (identified, not applied, and not a redesign): the generation experiment refines the closure study's recommendation in one specific way. Closure of the grammar still requires ruling pogo's status, because that decides whether the basis has four primitives or five. But *usefulness for exploration* is a lower and different bar, and the experiment shows it is gated by grading, not by the primitive count. The single highest-leverage change is therefore to attach a **provisional grade to each of the three parameters** (a provisional rotation-grade rule, a provisional paradox value, a provisional posture value), so the generator can score the whole parameterized 0-1 dex space under stated assumptions. That is three provisional numbers in a table, reversible the moment the rules expert rules, and it unblocks systematic exploration of the entire parameterized space while leaving every deep ontological question (is pogo a fifth primitive, is paradox really a parameter) open. Pogo and the bare-surface kick can stay unresolved during exploration, because between them they gate only a small fixed set of formulas, whereas the three parameters gate almost all of it.

In one line: the grammar is already useful for the plain core, and the smallest step to make it useful for the whole space is to pin three provisional parameter grades, not to close the primitive floor. Closure needs pogo ruled; exploration needs the parameter grades pinned. They are two different thresholds, and the generation experiment is what separates them.

## 9. Non-goals honored

The grammar was not modified. No primitive was added. No open question was resolved. No higher-dexterity generation was run. No trick names, no dictionary rows, no production code, no ADD asserted as a claim (every ADD here is the grammar's own arithmetic under the frozen scoring law, and where the law is indeterminate the formula is marked ambiguous rather than assigned a number). The deliverables are this paper, the two generated datasets, and the failure catalog.
