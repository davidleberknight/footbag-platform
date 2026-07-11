# Grammar-Gap Report: the smallest missing state vocabulary

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. It identifies the smallest additions the grammar would need before two-dexterity cardinality can be treated as more than an upper bound. It **identifies** the gap; it does not fill it. Repairing the grammar is explicitly out of scope for this interlude.

## The gap, in one sentence

The grammar can describe a dexterity **event** but cannot describe the **state** between two dexterities, so it cannot say when one dexterity composes with the next; the smallest fix is a handoff-state vocabulary plus a transition function over it.

## What is missing, smallest first

The additions below are ordered by how little each adds. Each is stated as a requirement, not a design.

1. **A handoff-state record.** A representation of the state carried between two dexterities, minimally the four components the handoff paper identifies: carriage side, reference-foot identity, support-and-free-leg parity, and stance mode. Today only carriage side is even derivable, stance mode is sporadic, and the other two are absent. This is the single largest gap: without a state record there is nothing for a composability rule to read.

2. **A reference-foot transport rule.** A statement of whether, and how, each dexterity changes the reference foot. This is what decides whether the side coordinate is global (a flat product) or local (a bundle). It is small (a per-dexterity map on one binary), but it is load-bearing: the entire product-versus-bundle question turns on it.

3. **A transition function.** A rule that takes a dexterity event applied to an input handoff-state and yields the output handoff-state. Even a fully tokenized state does not give composability without this map, because composability is `output(DEX1)` supplying `input(DEX2)`, and that comparison needs the map from event history to state. This is the deepest gap: it is what turns an event-sequence language into a state-transition language.

4. **A stance-mode obligation.** A rule that the stance mode is recorded at every handoff, not sporadically, so the leg-availability precondition of the next dexterity is always decidable rather than sometimes decidable.

5. **A ruling on the diagonal.** A statement of whether a repeated dexterity is an ordered pair or a count-operator expression, so the eight diagonal coordinates per fiber have one category rather than two.

## What is NOT in the gap

Two candidate additions are deliberately excluded, to keep the gap minimal and honest:

- **Bag vertical phase and trajectory.** These are absent from the grammar, but whether they are structural state or physical-performance variables is itself unsettled. Adding them would risk importing a physical claim into the grammar. They stay out of the minimal gap until their layer is decided.

- **A scoring change.** The far-receiver grade cross-term is a fact about difficulty, not about composability. Making grade a declared path-property is a scoring clarification, not part of the minimal structural gap, and it is listed separately so it is not conflated with the state vocabulary.

## The consequence of the gap

Until at least items 1 through 3 exist, two-dexterity cardinality is an upper bound of 64 per fiber and no less, because the grammar cannot resolve the pairings the composability matrix marks unresolved: it can neither identify addresses that are secretly one movement (which would lower the count) nor certify pairings as incompatible under a state model (which would also lower it). Closing items 1 through 3 is the minimum that would let a later volume state an exact two-dex count; closing 4 and 5 would make that count clean rather than caveated.

## Boundary

This report names the smallest missing vocabulary. It does not propose tokens, does not choose a transition semantics, and does not touch the frozen grammar or any frozen volume. Filling the gap is a grammar-research act that, per the atlas workflow, would be realized as a new volume built on the revised grammar, never as an edit to this one.
