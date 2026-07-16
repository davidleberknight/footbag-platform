# Information-Loss Map

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. It identifies every place where movement information disappears in the mapping from a movement to its operational notation, grouped by category, measured against the 895 active movements. It describes loss; it does not criticize the notation or propose changes. Companion to `VOLUME_III.md` and `representation_catalog.csv`.

Loss here means: a distinction between two movements that the notation does not preserve. Each category below states where the loss occurs, whether it is measured or structural, and what it collapses.

## Category A: state omission (the largest structural loss)

The notation writes movement events but not the state between them, so every state coordinate is lost.

- **Reference frame.** The absolute foot the side is measured against is absent from 100% of movements. Two movements identical except for which physical foot frames them are one notation.
- **Support and free leg.** Which leg supports and which circles is absent from 100% of movements. Leg-mirror pairs are one notation.
- **Intermediate carriage.** The side the bag is carried through between two dexterities has no token; it is inferable only under a transition rule the grammar does not supply. Two movements differing only in the passed-through carriage are one notation.
- **Fine orientation phase.** Coarse facing is written in about a third of movements; continuous rotational phase between events is not. Movements differing only in spin phase collapse.

This category is systematic: it is not that some rows omit state, but that the notation has no state vocabulary at all, so the loss is total for these coordinates across the whole corpus. (Category A overlaps the compression analysis: some of this loss is intentional laterality abstraction, some is genuine.)

## Category B: measured collision (the visible floor)

Independent of any omitted coordinate, the corpus contains movements the dictionary names apart that share one byte-identical notation.

- **36 notation strings are each shared by two or more distinctly-named active movements, covering 72 movements (8% of the corpus).** These are the directly measured many-to-one collapses: for these pairs the notation preserves no distinction at all, yet the movements are named as different tricks. This is the hard evidence that the mapping is lossy at the movement layer, not merely at a hidden-state layer.

## Category C: partial-representation loss (marked minority, defaulted majority)

Some coordinates are written for the rows where they occur but default silently elsewhere, so an unmarked row loses the distinction between the default and an unstated non-default.

- **Stance.** Written in roughly a fifth of movements; the rest default. A distinct stance that is simply not marked is indistinguishable from the default.
- **Launch surface.** Named for a concrete launch; the generic set launch names none, so its entry surface is lost.
- **Orientation facing.** Written in about a third; unmarked facing defaults.

## Category D: deliberate latitude (loss the notation chooses)

Not all loss is accidental; some is a distinction the notation intentionally leaves open.

- **Ambiguous side.** 40 movements write an explicit either-side marker, so the side distinction is deliberately not preserved.
- **Repeated dexterity.** Written as two literal events, it also admits a count reading at the naming layer, so the pair-versus-count distinction is left open.

## Category E: outside the design (not loss within the notation's own goals)

- **Bag height and trajectory.** No token exists. This is physical detail the notation does not attempt to carry, so counting it as loss would judge the notation against a goal it does not hold.

## Summary of the loss

| Category | Kind | Extent | What collapses |
|---|---|---|---|
| A state omission | structural, total | 100% of rows for frame, legs, carriage; ~two-thirds for fine facing | state-differing movements |
| B measured collision | measured | 72 movements (8%) | distinctly-named movements sharing one notation |
| C partial representation | measured | stance ~19%, facing ~28% written; rest default | non-default vs unmarked-default |
| D deliberate latitude | measured | 40 ambiguous-side; 107 repeated-dex | side, and pair-vs-count |
| E outside design | n/a | total | height and trajectory |

The dominant loss is Category A, the total absence of a state vocabulary, and Category B is its visible consequence in the named corpus. Categories C and D are smaller and, for D, chosen. Category E is not loss on the notation's own terms. The map's headline is that the notation loses movement state comprehensively and loses movement identity measurably, while preserving scored events and family structure.
