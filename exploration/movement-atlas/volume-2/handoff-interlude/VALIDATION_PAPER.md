# Two-Dex Handoff-State Validation Paper

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. This slice READ the live dictionary's operational notation read-only and wrote only under this folder; it modified nothing (not the dictionary, notation, parser, Grammar v1, Volume I, or frozen Volume II). No video, no expert judgment, no generated names, no new formulas. It tests the proposed four-part handoff state against the complete existing two-dexterity corpus, for falsification.

Generated evidence: `validate_handoff_state.py` (read-only) and `handoff_validation_rows.csv` (row-level results). Companions: the scorecard, the counterexample catalog, the transport-rule proposal, and the decision, each its own file.

## 1. The question and the corpus

The interlude proposed a four-part internal handoff state, carriage side, reference-foot identity, support-and-free-leg parity, and stance mode, and asked whether it can consistently reconstruct the internal transition of existing two-dexterity movements. This paper answers from the corpus.

The corpus is every active canonical trick whose operational notation contains exactly two dexterity events: **395 movements**, taken whole, not limited by difficulty. It spans sequential and co-articulated pairs, repeated dexterities, direction reversals, planted and no-plant cases, and rows carrying set-layer, receiver-layer, paradox, and body content. Movements with three or more dexterities were excluded from the primary corpus. The full distribution over the active dictionary is 65 zero-dex, 261 one-dex, 395 two-dex, 151 three-dex, 22 four-dex, and 1 five-dex movement.

## 2. Method

Each movement's operational notation was parsed into an ordered sequence of steps, separated by a sequence marker or an overlap marker, each step carrying a posture, a set of bracketed tokens, and its bare side and direction words. The two dexterity steps were located, the region strictly between them was read as the explicit handoff content, and the four proposed components were assigned a value and an evidence status: explicit in notation, inferred under a transition rule, default, absent, or ambiguous. Difficulty was recorded but never used to infer handoff structure; it is a check for contradiction only, applied after the structural reconstruction. No row was counted as reconstructed because the notation merely permits one convenient reading.

## 3. Result one: the model is never fully recoverable from notation

Zero of the 395 rows reconstruct fully from the encoded state, and the reason is categorical: **the reference-foot identity is absent in 100% of rows, and the support-and-free-leg parity is absent in 100% of rows.** The notation never names which foot the side is measured against, and never names which leg circles or supports. Two of the four proposed components are therefore not recoverable from the notation at all, in any movement. The carriage side is likewise never an explicit token; it is inferable in every row, but only under a transition rule the grammar does not supply. Only the stance mode is ever explicit, and only in 120 rows (30%), through posture markers; in the other 275 it is a default. This is the closure finding of the interlude, now measured: the notation is an event language, and the state the handoff requires is largely not in it.

## 4. Result two: the model is incomplete, and the corpus names the missing piece

Beyond non-recoverability, a majority of the corpus forces a state variable the four-part model has no slot for. Classifying each row by the task's own taxonomy:

- **Reconstructed only by choosing between multiple possible states: 157 rows (40%).** These are the cleanest cases, where the only gaps are the two invisible components (reference foot, leg parity), which the reader must choose. None is fully reconstructed; each requires committing to unencoded state. Of these, 48 additionally carry an explicit co-articulation (overlap) between the dexterities.
- **Missing an additional state variable: 235 rows (59%).** The four-part model cannot represent these at all. They break down as 152 rows (38.5% of the whole corpus) with an **intervening body or orientation event** between the two dexterities (a duck, a spin, a dive, or a body-modified dexterity, often co-articulated), 48 rows with a **direction beyond the binary** (a rotational or backward direction), and 35 rows with a **per-dexterity paradox modifier**.
- **Inconsistent with the model: 0 rows.** No movement contradicts the model; it under-determines or lacks a slot, but never conflicts.
- **Notation or data gap: 3 rows.** The dexterity side is written ambiguously (a same-or-opposite marker).

The dominant missing piece is unambiguous: **the join between two dexterities is, in a plurality of the corpus, mediated by a body event with an orientation** (the body drops, turns, or spins between the dexterities), and the four-part model, which carried only carriage, frame, leg, and stance, has nowhere to put it. This is the corpus's decisive correction to the interlude's proposal.

## 5. What survived

The state-transition approach is not refuted, and three of its parts held up:

- **Carriage side** survives as a necessary, always-inferable component (present in every row, under a transition rule).
- **Stance mode** survives as necessary and is explicitly encoded in a real minority (30%), so it is partially recoverable rather than invisible.
- **The repeated-dexterity diagonal** is resolved at the operational layer: 107 rows (27%) carry two identical dexterities, and every one is written as two literal dexterity events, 85 sequential and 22 co-articulated. So in the operational notation a repeated dexterity is an ordered or co-articulated pair, not a count operator; the count reading, if it exists, lives at the naming layer, not here.

## 6. Counterexamples and evidentiary limits

The counterexample catalog lists the 238 rows the four-part model cannot explain cleanly, grouped by the missing variable, with representative slugs. The evidentiary limits are as important as the results. First, the two invisible components (reference foot, leg parity) can be neither validated nor falsified from notation, because the notation never records them; their necessity is a structural argument, and their values are outside this lane's reach. Second, the carriage inference rests on a transition rule this slice proposes but cannot verify from notation, for the same reason. Third, difficulty was held out of the structural reconstruction and produced no contradiction, which is a weak confirmation only (absence of contradiction, not presence of proof).

## 7. Verdict

The four-part handoff state does not survive contact with the complete two-dexterity corpus as either a complete or a notation-recoverable account. It fails completeness (59% of rows force a fifth variable, the intervening body or orientation event) and it fails recoverability (0% of rows reconstruct from encoded state, because two components are universally absent). It survives as a partial and necessary skeleton: carriage and stance hold, the diagonal is resolved, and the failures are systematic and named rather than chaotic. The corpus does not refute the state-transition approach; it corrects the model, and it draws a sharp line between the parts the notation can carry (which can be extended and re-validated here) and the parts it cannot (which will need evidence from outside the notation). The recommended next step follows from that line and is set out in the decision file.
