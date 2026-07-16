# The Dexterity Handoff State: what information crosses the join

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. An interlude between Atlas Volume II and any Volume III, conducted from the movement grammar and its notation alone: no trick names, no operator proper-names, no video, no physical-performance claims, and no repair of the grammar. It does not rewrite the frozen Volume II or its falsification erratum; it supplies the explicit handoff model that the falsification showed was missing.

The falsification established that the current grammar does not justify a free 64-point product for two-dexterity movement. It did not establish which pairings are impossible. This paper keeps those apart and addresses only the first two of three claim types: **unsupported by the current grammar**, **structurally incompatible under an explicit state model**, and **physically unrealizable**. The third is out of scope throughout.

## 1. The question

Volume II modeled the join between two dexterities as a single two-valued carriage side and found it composed freely. The falsification showed that one modeled axis is not the whole join. So the question this interlude must answer is prior to any count: **what state must pass from one dexterity to the next inside a single movement, and does the grammar carry it?**

## 2. The dexterity as a transition

Model a dexterity as a transition with an input contract and an output contract:

```
   DEX :  input_state  ->  [ dexterity event: side, direction ]  ->  output_state
```

A two-dexterity movement is composable only when `output_state(DEX1)` supplies everything `input_state(DEX2)` requires. The smallest handoff state is therefore whatever `input_state(DEX2)` actually reads. From the grammar's own definition of a dexterity as one leg circling the bag while the other supports, a dexterity's input contract reads at least:

- **where the bag is**, so the circling leg can reach it: the carriage side (and, if it matters, the vertical phase);
- **a free leg to circle and a support leg to stand on**: the support-and-free-leg parity, refined by the stance mode;
- **a frame to measure its own side against**: the reference-foot identity.

Its output contract writes an event (a side and a direction) and, at the end of the movement, a terminal (a surface and a side). The minimal structural handoff state is the intersection of what one dexterity produces and the next consumes, and Sections 3 and 4 show that intersection is not what the notation records.

## 3. The minimal handoff-state proposal, and its evidentiary status

The smallest state that makes `output(DEX1) compatible with input(DEX2)` a meaningful statement is the four-component tuple

```
   S = ( carriage_side , reference_foot_identity , support_free_leg_parity , stance_mode )
```

with the far-or-near receiver a **derived** relationship of `carriage_side` and `reference_foot_identity` (not an independent component), and the sequence-versus-layer timing a **mode selector** on the composition rather than a state carried across it. Bag vertical phase and trajectory are candidate components whose membership in the structural layer, as opposed to the physical layer, is itself unresolved; the model does not include them, because including them without deciding their layer would smuggle a physical claim into a structural model.

The evidentiary status of this proposal is the important part, and it is weak by construction: of the four components, only `carriage_side` is even derivable from the notation (and only if a per-dex transition function is assumed), `stance_mode` is sometimes encoded (posture markers appear but not on every step), and `reference_foot_identity` and `support_free_leg_parity` are absent from the notation entirely. The model is a **proposal about what the join must carry**, backed by the grammar's definition of a dexterity, not a model recovered from the tokens. Its confidence is therefore high that these components are required and low that they are recoverable from current notation. The full per-variable accounting is in `state_variable_inventory.csv`.

## 4. Test one: closure. The output language is not the input language

Compose the two contracts and the mismatch is immediate. A dexterity's **output** vocabulary, as the notation writes it, is a set of **events**: a side and a direction, plus a terminal surface and side at the movement's end. A dexterity's **input** vocabulary, as its contract requires, is a **state**: a carriage, a frame, a leg parity, a stance. These are not the same representation. The notation is an **event-sequence language**, and composability is a question about **state**. You cannot check `output(DEX1)` against `input(DEX2)` because they are written in different vocabularies, and the grammar supplies no map from the event history to the state.

This is the fundamental gap, and it is more basic than any particular missing variable. Even if every variable in Section 3 were tokenized, composition would still require a **transition function** that turns a dexterity's event, applied to an input state, into an output state. The grammar has dexterity events and it has terminal states, but it has no state-transition semantics connecting them. The join is undefined not because a coordinate is missing but because the language does not represent state at all.

## 5. Test two: transport. The side coordinate is local, not global

The reference foot is the frame against which a dexterity's side is same or opposite, and the notation never records it or its behavior across a chain. If any dexterity changes which foot sets or supports the bag, then the frame turns, and the side token of the next dexterity is measured against a foot the previous dexterity moved. The consequence is precise: **SAME and OP cannot be read globally.** They are local coordinates on each dexterity, and relating the second dexterity's side to the first's requires transporting the frame through the first dexterity's action, which the grammar does not specify. Volume II read side globally and got a flat product; read locally, the second factor is the first factor's frame acting on a cube, and the space is a bundle, not a product. The transport test does not decide whether the frame turns; it establishes that the grammar leaves it undecided, which is enough to withdraw the global reading.

## 6. Test three: composability is mostly undefined, not mostly valid or mostly invalid

Given a state language this thin, the honest classification of pairings is neither a full set of valid pairs nor a set of forbidden ones. From the **encoded** state alone, only a small class is certifiably composable (the pairs where the frame is trivially preserved and the leg the next dexterity needs is the one the previous dexterity freed), essentially nothing is certifiably **incompatible** (the encoded state is too thin to prove any pair impossible), and the large remainder is **unresolved for want of state**. Incompatibility appears only when an **explicit** state model is assumed on top of the grammar, and then it is conditional on that model, never grammar-certified. This is the discipline the falsification demanded: a pairing the notation cannot certify is not thereby impossible; it is unresolved. The full classification is in `COMPOSABILITY_CLASS_MATRIX.md`.

## 7. Scoring is a path property, kept separate from structure

The conditional far-receiver grade makes a coordinate's difficulty depend on the handoff, not on its two dexterity vertices alone. This paper records that cross-term but does not use it as evidence of structural incompatibility: a grade that couples across the join is a fact about scoring, and two dexterities can compose structurally while their combined grade is non-separable. Difficulty is treated throughout as a property of the complete path, and it is not an input to the composability classification.

## 8. The diagonal is left ambiguous

The repeated-dexterity coordinates (the two dexterities identical) admit two grammatical readings under the current grammar: an ordered pair of two independent dexterity events, or a single dexterity under a count operator. The grammar carries a count operator and it carries literal chaining, and it does not settle which production a repeated dexterity is. This interlude does not force one reading; it records that the diagonal is a category boundary, not an ordinary interior region, and that any count that treats it as plain two-dex product points is choosing one of two unsettled readings.

## 9. What this interlude replaces, and what it leaves open

It replaces the false assumption of a free join with an explicit account of what the join must carry: a four-component state the notation does not fully represent, connected by a transition function the grammar does not supply, over a frame the grammar does not fix. It leaves open, deliberately, whether the frame actually turns in practice, whether the four components are the complete structural state or a subset, and whether the vertical and trajectory candidates are structural or physical. Those are questions for validation against real two-dex notation, which is the recommended next step (`NEXT_STEP_DECISION.md`), and for the smallest grammar additions that would make two-dex cardinality exact rather than bounded (`GRAMMAR_GAP_REPORT.md`). The concise statement that should replace Volume II's withdrawn claim is in `VOLUME_II_CORRECTION.md`.
