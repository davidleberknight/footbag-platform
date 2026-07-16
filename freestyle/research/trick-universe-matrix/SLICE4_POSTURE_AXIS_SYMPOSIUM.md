# Isolating the Posture Axis: a Study of the Symposium Sector

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. The prior audit named four axes the cube/fiber algebra lacks and recommended isolating them one at a time on their minimal cases. This note takes the first: support-leg posture, studied through the symposium sector alone. The test is falsification: does adding a single posture coordinate to the existing cube regenerate the symposium family, or does symposium carry structure a lone posture bit cannot capture. Companion file: `symposium_posture_sector.csv`. Grounded in the operational notation of the live dictionary.

Working axioms carried forward: a trick is a movement formula, names are annotations, the kick is worth one ADD less than its stall counterpart, the dictionary is one observed subset of a larger universe.

---

## 1. The sector

The suspension sector is large: 174 active tricks carry a "(no plant while)" pre-state, 109 have a symposium name, and 10 use an alternate "SYMP" dex token. The base symposium forms are the eight cube atoms performed with the support leg lifted: symposium mirage `SET > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]`, flail (the folk name for symposium illusion) `SET > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]`, symposium pixie, symposium bubba, and the cross-body-landing forms symposium whirl, butterfly, swirl, and reverse whirl. From there symposium stacks with every body and set operator (atomic, fairy, gyro, inspinning, quantum, spinning, ducking, diving, paradox) to build the deep compounds the audit flagged.

## 2. Four tests, and what each returned

**Test A: is posture a real, independently annotated feature. Confirmed.** The notation carries both an explicit planted marker "(plant)" and an explicit suspended marker "(no plant while)", and spyro even opens `(plant) > (back) SPIN [BOD]`. Posture is written down, on its own, as a state of the support leg. It is not a side effect of some other coordinate.

**Test B: is posture per-step, and can it change within a trick. Confirmed, and this is the strongest evidence it is a genuine axis.** Paradox symposium illusion is `CLIP (plant) > (no plant while) SAME OUT [PDX] [BOD] [DEX] > OP TOE [DEL]`: the clipper entry is planted, then the very next step lifts the leg. Posture is a property of each step, and a single trick can be planted at entry and suspended at the dex. A coordinate that varies step by step, and that the notation marks explicitly on each step, is a real per-step axis in exactly the way side and direction are.

**Test C: is posture structural, meaning does it distinguish otherwise-identical tricks. Confirmed.** Fairy same-side mirage is `TOE > SAME OUT [DEX] (plant) > SAME IN [DEX] > OP TOE [DEL]`: the "(plant)" between the two dexes, marking that the support foot re-plants rather than staying lifted, is what separates this trick from its no-plant sibling. Two movements with the identical dex sequence but different posture are different tricks. Posture behaves like direction: it is structural, not lexical, so it cannot be normalized away.

**Test D: can posture be isolated from the rest of the movement. Refuted.** This is the falsification. Two facts break the clean-axis hope.

First, there is no bare symposium. A query for any no-plant trick with zero dexterities returns nothing. Symposium never stands alone as a posture; it always co-articulates with a dexterity, producing the fused `[BOD] [DEX]` on one step. Posture in this sector cannot be separated from simultaneity: the lifted leg and the dex happen at the same instant, in the same step, by construction. So "add a posture bit to the cube" does not regenerate symposium, because symposium is not the cube plus a bit, it is the cube's dex performed simultaneously with a scored suspension event. The posture axis and the simultaneity axis are entangled here, not independent.

Second, posture is grade-neutral in itself, and what it licenses varies. The +1 everyone attributes to "symposium" is not carried by the posture. It is carried by the body bracket the suspension licenses on the dex step. The proof is pogo, which uses the identical "(no plant while)" posture but scores differently: pogo mirage is `CLIP > (no plant while) OP IN [DEX] > OP IN [DEX] > OP TOE [DEL]`, where the no-plant licenses an extra leading dexterity, a `[DEX]`, not a body event. Same posture, different licensed event, different bracket. Posture does not carry ADD; it enables a scored event, and the event's kind (a co-articulated body in symposium, an extra dex in pogo) is what the grade counts. A model that gave posture its own +1 would double-count symposium and mis-count pogo.

## 3. Posture is not one bit, it is a small typology of suspension modes

The audit's "posture" is really several distinct suspension modes with different notation, different attachment points, and different licensed events. The sector separates cleanly into:

- **No-plant (symposium).** The support leg lifts during a dex; the suspension is co-articulated with the receiver dex as a fused `[BOD] [DEX]`. This is the symposium family.
- **No-plant (pogo).** The same lifted-leg posture, but it leads with an extra dexterity rather than fusing a body event. Symposium and pogo are the two ways a lifted leg can pay for itself: with a body event or with a dex.
- **Flying.** A distinct leading airborne body action, `FLYING [BOD] > ...`, as in flying inside, flying clipper, and dragonfly kick. Not a co-articulated suspension of a dex but a body event in its own step.
- **Jump.** A leap, `JUMP [BOD] > ...`, typically closing with an explicit "(land)", as in hop over, eclipse, and butterfly kick. The jump and its landing bracket the trick.

These are not interchangeable and they attach at different points in the chain, so posture is not the binary planted-versus-suspended it first looked like. It is a typology: planted, or one of several suspension modes, each with its own licensing rule.

## 4. A notation inconsistency to flag, not resolve

Symposium is written two ways in the live data. The common form is the posture pre-state with a fused body, `(no plant while) OP IN [BOD] [DEX]`. The rarer form (10 tricks) is a dedicated dex token, `SAME SYMP [DEX]`, as in clipper symposium whirl and reverse swirling symposium mirage, which reads exactly like pogo's leading dex. So the corpus encodes the same concept both as a body-scored suspension and as a dex-scored token. This is a curator or doctrine question about how symposium should be notated, not a fact about the movement, and it is out of scope here. It is recorded so it is not rediscovered as a finding.

## 5. Refined proposal for the posture axis, without overclaiming

Keep everything proven before; add posture as follows, and no further.

- **Posture is a per-step attribute** with values {planted, suspended}, and suspended subdivides into a small mode set {no-plant, flying, jump}. It is explicitly annotated in the notation on each step and it can change within a trick.
- **Posture is structural**, distinguishing otherwise-identical tricks, in the same sense direction is structural. It is never normalized away.
- **Posture is grade-neutral by itself.** It carries no ADD. It licenses a scored event on its step, and that event's bracket carries the grade: a co-articulated body (symposium), an extra leading dex (pogo), or a leading airborne body (flying, jump).
- **Posture is not an independent multiplicative coordinate on the cube.** In the symposium sector it is entangled with simultaneity, because the suspension co-articulates with the dex in one step. Modeling it therefore requires the bundle-step revision from the prior slice (a step is a set of co-occurring events); posture is an attribute of a bundle, and the suspension contributes one member of the bundle.

So the honest result of isolating symposium is mixed, which is the point of a falsification pass. Posture is unmistakably real, per-step, and structural. But it cannot be isolated as a clean orthogonal axis: it is grade-neutral, it comes in several modes, and in the symposium sector it is inseparable from simultaneity. The recommendation that each new axis be isolated one at a time survives, but with a caveat this study establishes: posture and simultaneity are not independent, so the next isolation, simultaneity, should be studied as the same phenomenon from the other side rather than as a separate axis.

## 6. What is explicitly not claimed

That posture has exactly these modes; a wider sweep may find more (rooted, the "(rooted)" pre-state, was seen but not studied here). That the licensing rule (suspension enables one scored event) has no exceptions; only the symposium and pogo families were examined closely. That the two symposium encodings are equivalent; that is a curator call. That the unnamed posture-by-base cells are impossible; many symposium-by-atom combinations are simply unnamed. This study covers the symposium sector only, and its claims are scoped to it.

Deliverables: this note and `symposium_posture_sector.csv` (the base symposium forms, the pogo and flying and jump contrasts, the two encodings, and the explicit posture markers). No names generated, no production code, no dictionary changes. The natural next step is to study simultaneity directly, since this pass shows it and posture are two views of one structure.
