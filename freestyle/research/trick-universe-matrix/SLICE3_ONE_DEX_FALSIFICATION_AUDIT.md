# Falsifying the Cube/Fiber Model: an Audit of Every Named Zero-or-One-Dexterity Trick

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. This note changes the search axis. Instead of climbing by ADD, it audits the entire named corpus of tricks with zero or one dexterity, at any ADD, to try to break the cube/fiber movement algebra using real data. Companion file: `zero_one_dex_audit.csv` (all 326 rows). Grounded in the operational notation of the live dictionary (`freestyle_tricks`, active rows), with dexterity counted as the number of `[DEX]` scoring brackets.

Working axioms carried forward: a trick is a movement formula, names are annotations, the kick is worth one ADD less than its stall counterpart, the dictionary is one observed subset of a larger universe. Discipline for this slice: falsification. Do not claim the model is complete. Do not infer impossibility from lack of names. Report what breaks.

---

## 1. What the audit covered

Every active named trick whose operational notation contains at most one `[DEX]` bracket: 326 tricks, of which 65 have zero dexes and 261 have exactly one. Each was reduced to a feature vector counting its scoring brackets (`[DEX]`, `[BOD]`, `[XBD]`, `[UNS]`, `[KICK]`, `[PDX]`, `[XDEX]`), plus two flags: a posture flag (the notation carries a suspension pre-state such as "no plant while", or a launch-trajectory token such as "SWING"), and a simultaneity flag (two scoring brackets sit on one step, for example `[BOD] [DEX]` or `[PDX] [DEX]`). Each row was then classified by a fixed rule set. The rule set is mechanical and reproducible; the classification column and every feature it used are in the companion CSV so any judgment can be re-checked.

## 2. The headline count

| Classification | Count | Meaning |
|---|---|---|
| explained-hard-terminal-crossbody | 117 | one or zero dex plus a cross-body clipper landing; grade sits at 3 or 4 by the landing, not the dex |
| explained-body-modified-cube | 57 | a cube dex plus one or more body operators, plain landing |
| breaker-posture-suspension-or-trajectory | 55 | carries a no-plant suspension, or a swing launch |
| stretch-dex-family-fusion-paradox-xdex | 33 | carries a paradox or x-dex bracket fused to the dex |
| explained-cube-fiber | 16 | the clean one-dex plain-landing cube atoms |
| explained-body-extension | 16 | zero-dex body tricks |
| explained-kick-stall-rule | 13 | kick-terminated forms |
| explained-plain-stall | 10 | zero-dex plain stalls and juggles |
| explained-unusual-terminal | 7 | unusual-surface landings |
| ambiguous-needs-notation | 2 | notation incomplete in the data, not a model question |

Explained by the current algebra (the cube, its surface fibers, the body generator, the hard and unusual terminals, and the kick rule): 236 of 326, about 72 percent. Not explained: 88 tricks, about 27 percent, split into 55 posture breakers and 33 paradox stretches. Genuinely undecidable from the data: 2, both a notation gap rather than a model gap.

The model survives for the shallow corpus and fails for a specific, coherent quarter of it. That quarter is the finding.

## 3. What the model explains, and why it is not surprising that it does

Three results confirm the algebra rather than break it, and one of them corrects an earlier guess.

**The whirl family is one-dex, and its grade comes from the landing, not from rotation.** Whirl is `SET > OP IN [DEX] > OP CLIP [XBD] [DEL]`: a single inward-opposite dex, the mirage dex, landing on a cross-body clipper. Butterfly is the same with an outward dex. Swirl is `CLIP > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]`: a single rotational dex, launched and landed on the clipper. In every case there is exactly one `[DEX]`, and the grade of 3 comes entirely from the cross-body clipper terminal, which is itself worth 2. This falsifies the earlier slice's open guess that a cross-body rotational dex must be grade 2. It is not. Rotation (the WHIRL or SWIRL token) is folded into a single dex bracket and is grade-preserving; the whirl family is grade 3 because it lands cross-body, exactly the Phase III lift the surface-fiber slice predicted. The 117 hard-terminal rows are this pattern and its body-modified elaborations.

**Osis is a zero-dex body trick, not a dexterity atom.** Osis is `SET > (back or front) SPIN [BOD] > SAME/OP CLIP [XBD] [DEL]`: a body spin into a cross-body clipper, with no dexterity at all. The dictionary lists osis beside whirl and swirl as a foundational atom, but structurally it belongs to the body-plus-hard-terminal family, not the dex family. Folk atom status does not track dexterity count. Twenty-plus osis compounds inherit this: they are body stacks landing cross-body, still zero or one dex.

**A dex plus a body operator on a plain landing is just a body-modified cube atom.** Spinning mirage, ducking legover, gyro pickup, eclipse, surging, and 50 others are one cube dex with one or two body operators, landing plain. The algebra already has a body generator, so these compose without new structure. They are the largest "explained but not trivial" class, 57 rows.

## 4. The model-breakers, and the axis each one needs

Two classes resist the model, and they point at three axes the cube/fiber picture does not contain.

**Support-leg posture (planted versus suspended). 55 rows, the largest breaker class.** The symposium family carries a "(no plant while)" pre-state: the support leg leaves the ground during the move. Symposium mirage is `SET > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]`. This is still one dex and a plain toe landing, so the cube says grade 2, but the trick is grade 3, and the extra grade plus the whole character of the move come from the suspension. Posture is a real, independent axis: a trick is performed planted or with the support leg airborne, and that choice is not any of the cube's five surface-and-side coordinates. The flail, symposium, and warping-style moves all live here. The model has no posture dimension, and cannot get one by relabeling a surface or a side.

**Simultaneity, or co-articulation. Pervasive inside the breaker and stretch classes.** The linear-word model assumed one scoring event per step. The data refutes this directly: symposium moves put `[BOD] [DEX]` on a single step (a body suspension and a dex at the same instant), and the deepest moves stack three, for example montage's `OP FRONT WHIRL [DEX] [PDX] [BOD]`, a rotational dex, a paradox, and a body event co-articulated in one moment. A step is not a single event; it is a set of simultaneous events. The `>>` separator is the same phenomenon at the launch, marking a spin that happens during the set rather than after it. Simultaneity is the axis the linear grammar most cleanly lacks.

**Paradox as a distinct dex-family generator. 33 rows.** Paradox writes as a `[PDX]` bracket fused to the dex, `SAME IN [PDX] [DEX]`, a second dex-family scoring event that is co-articulated with the base dex and is not expressible as an IN-or-OUT direction. Paradox mirage, paradox whirl, royale, tomahawk, and the large paradox-compound family carry it. The cube's direction axis has two values; paradox is a third dex-family state that rides alongside a base dex rather than replacing its direction. It needs its own generator, not a third value on the existing direction axis.

**Launch trajectory and bag path. Rare but real.** Pendulum is `TOE SWING (SET) > (contact)` and rake is `SET > SWING [DEX] > SAME TOE [DEL]`. SWING is a bag-path token, the trajectory the bag travels before the dex, and it is not in the surface, side, or direction vocabulary. Only a handful of moves use it, so it is a minor axis, but it is a real one the model does not represent.

## 5. The short list of most important model-breakers

Ranked by how much structure they force the model to grow:

1. Symposium mirage (`SET > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]`). The minimal suspension case: one dex, plain landing, yet grade 3 and un-cube-able. It isolates the posture axis with nothing else confounding it.
2. Montage (`... OP FRONT WHIRL [DEX] [PDX] [BOD] ...`). Three scoring brackets on one step. The clearest proof that a step is a bundle of simultaneous events, not a single event.
3. Paradox mirage (`CLIP > OP IN [PDX] [DEX] > OP TOE [DEL]`). The minimal paradox case: one base dex plus one fused paradox, isolating the paradox generator.
4. Osis (`SET > SPIN [BOD] > CLIP [XBD] [DEL]`). Not a breaker but a category error the audit exposes: a named foundational "atom" that has zero dexterities and is really a body-plus-hard-terminal trick.
5. Pendulum and rake (SWING). The minimal launch-trajectory case: a bag path the surface-and-side vocabulary cannot name.

## 6. A revised algebra proposal, without overclaiming

The cube/fiber algebra is correct as a model of the shallow, planted, single-event-per-step universe, and it explains about seventy percent of the zero-or-one-dex corpus outright. It is not the whole algebra. The audit says the movement space has at least three axes the cube omits, and one structural assumption it makes is false. The revision is additive: keep the cube as a face of a larger object.

**From a word to a trajectory of bundles.** Replace "a movement is a word whose letters are single scoring events" with "a movement is a sequence of steps, and each step is a bundle (a set) of co-occurring scoring events." ADD remains the total count of scoring events across all bundles. The cube's moves are the special case where every bundle has exactly one event. Simultaneity is then first-class, and montage's triple-event step is representable.

**Add a posture coordinate to each step.** Each step carries a support-leg state, planted or suspended (no-plant). Posture is orthogonal to the dex coordinates and can raise grade (the suspended event is itself scored, as `[BOD]` inside the bundle). The symposium family is the suspended sector of the space.

**Admit paradox and x-dex as dex-family generators, not direction values.** The dex generator gains sibling generators that co-articulate with it: paradox (`[PDX]`) and the conditional x-dex (`[XDEX]`). They live in a bundle beside a base dex; they are not a third value on the IN-or-OUT axis.

**Admit a bag-path coordinate for the launch.** A small, mostly-empty axis for launch trajectory (the swing), used by pendulum and rake. Flag it as present but sparsely populated; do not build it out until more of the corpus needs it.

**What stays exactly as proven.** The four-generator basis (entry, dex, body, terminal), the kick-as-grade-lowering-terminal identity, the graded-by-ADD structure, the side-and-direction symmetry group on the dex, the surface fibers, and the three-phase surface classification (cube-preserving, cube-halving, cube-lifting). The whirl family confirms the Phase III lift. Nothing here retracts the earlier slices; it extends them.

**What is explicitly not claimed.** That these four additions complete the model. This audit only covers zero-or-one-dex tricks; the two-and-more-dex space may force further structure (true multi-dex composition, set-plus-receiver interaction, the `>>` launch simultaneity in full). That the unnamed cells of any fiber are impossible. That the classification rule set is the only defensible one; it is mechanical and the CSV exposes its inputs so a curator can re-judge any row. The two `ambiguous-needs-notation` rows (the bare toe and clipper stalls, whose stored notation is a lowercase placeholder) are a data-completeness gap, not evidence about the model.

---

## 7. Deliverables and next step

Deliverables: this note; `zero_one_dex_audit.csv` (all 326 rows with features and classification); the model-breaker short list in section 5; and the revised algebra in section 6.

The natural next slice is to isolate one new axis at a time on its minimal cases, the way the cube was isolated: take the suspended (symposium) sector alone and see whether posture plus the existing cube regenerates it, then the paradox sector, then simultaneity. That tests each proposed axis by falsification before any of it is treated as settled. No names generated, no production code, no dictionary changes.
