# Grammar Closure: Is the Freestyle Movement Grammar Complete?

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. No production code, no dictionary rows, no trick names, no generation. This is a grammar-completeness study only. It asks one question and answers it, and it deliberately does not enumerate any movement space.

Companion of the Phase I trick-universe work in `freestyle/research/trick-universe-matrix/`, especially the movement-algebra slice (the four-generator basis) and the state-of-the-theory snapshot (the confidence ladder and the merges). This study does not re-derive that work; it tests it for closure.

## 0. The question, stated exactly

Not "how many tricks exist," not "what is the ADD of X," not "which moves combine." The single question:

> Is the current movement grammar closed? Have we discovered every primitive movement generator needed to describe freestyle, or is a primitive still hidden inside the existing vocabulary?

Closure here means: the set of primitive generators is both **complete** (nothing real falls outside it) and **irreducible** (nothing in it is secretly a composition, a parameter, a special case, or two concepts fused). The method is minimization by falsification: take every primitive, try to merge it away or split it apart, and keep only what survives every attempt.

Forget ADD, names, and combinations for this study. They are annotations on a structure; the structure is what is under test.

## 1. Starting basis (carried from Phase I, not re-derived)

The movement-algebra slice already reduced the observed grammar to a graded word over **four generator kinds**:

| Generator | Role | Grade |
|---|---|---|
| entry `e(surface)` | the starting contact | 0 |
| dexterity `d(side, direction, rotation)` | the leg circles the bag | 1 (2 if cross-body rotational) |
| body `b(kind)` | the body moves, no new bag contact | 1 |
| terminal `D`/`T`/`K` | plain landing / hard landing / kick | 1 / 2 / 0 |

with two structural facts already established corpus-wide: **ADD equals the count of scored generators** (the firmest result in the theory), and **set, body, and receiver are positions of the one dexterity generator, not separate kinds**. The closure study takes this four-generator basis as the object to test.

## 2. The named-operator layer collapses entirely (successful merges)

The dictionary's forty-plus named operators and its twelve "foundational atoms" look like a large primitive vocabulary. They are not. Every one reduces to the four generators plus parameters. These merges all **succeed**:

- **The four +1 dex set-operators are one generator at four settings.** Pixie is `d(SAME, IN)`, fairy `d(SAME, OUT)`, miraging `d(OP, IN)`, atomic `d(OP, OUT)`. They are the four corners of the side-by-direction square, not four primitives. (Verified against the toe cube: the eight named atoms are one schema at eight vertices.)
- **The rotational operators are the dex plus a rotation parameter.** Whirl, swirl, whirling, swirling attach a rotation to a dex. Rotation is a grade parameter of the dexterity, not its own generator.
- **The body operators are one generator at different kind settings.** Ducking, diving, weaving, zulu, tapping, backside, blazing, inspinning, spinning are all `b(kind)`; the operator name is the body kind.
- **Compound operators decompose to two generators.** Surging is spinning plus stepping (a settled decomposition); gyro is a spin bundled with a same-foot dex; the two-dex and three-dex sets (furious, nuclear, floating, shooting, warping, and the rest) are compositions of several dex and body events. None is primitive.
- **X-Dex is a conditional grade parameter of a dex.** It fires only on a far receiver and adds a scored point to that dex; it is a parameter of the dexterity, not a generator.
- **Unusual-surface landing is a landing-hardness parameter.** An unusual-surface stall is the terminal generator at the "hard" setting, exactly like a cross-body stall; the surface is a parameter, not a new kind.
- **The twelve atoms are all compositions.** Toe stall is entry plus a delay; mirage, orbit, legover and their kin are dex plus a delay; butterfly, osis, whirl, swirl are a motion plus a cross-body landing. Phase I's result stands: the 2-ADD universe contains no primitives.
- **Set-versus-dex and stall-versus-kick are position and terminal-switch, not kinds.** A set operator is a dex in first position; a kick is the delay-absent form of the terminal.

**Conclusion of Section 2:** the entire named vocabulary is reducible. That half of the grammar is **closed**: no named operator or atom is a hidden primitive.

## 3. The four generators are irreducible (failed merges)

Each attempted reduction of a generator into another **fails**, which is the positive evidence that these four (with one refinement, Section 4) are real:

- **Dexterity into body, or body into dexterity: fails.** A dexterity is the leg circling the bag; a body step is the body moving with no new bag contact. They score the same (one point each) but are different physical events, and the receiver-versus-body distinction is structural, not positional. Neither reduces to the other.
- **Motion into landing: fails.** A dex or a body step is a scored motion; a delay is the bag coming to rest on a surface. A held landing is not a motion and cannot be expressed as one.
- **Cross-body into a landing parameter: fails, and this forces a split (Section 4).** Phase I refuted the earlier belief that cross-body is always a manner of a landing: a cross-body contact stands alone, with no held landing, in four tricks. So cross-body is a contact in its own right, not merely a hardness parameter of the terminal.
- **Entry into terminal, or terminal into entry: fails as-is, but see Section 4.** An entry is a starting contact (grade 0), a terminal delay is an ending contact (grade 1). They are the same physical thing, a bag resting on a surface, in different roles, which is a merge opportunity, not a collapse.

## 4. Two refinements the closure test surfaces (a merge and a split)

Testing the four generators for irreducibility exposes two places where the basis is not yet in its minimal form. Neither is a completeness gap; both make the grammar smaller and cleaner:

- **Merge: entry and plain landing are one contact generator, role-parameterized.** Both are "the bag rests on a surface." A single generator `contact(surface, role)` with `role` in {launch, land} subsumes the entry (launch, grade 0) and the plain terminal delay (land, grade 1), and the kick becomes the same contact with the held delay absent. This shrinks four generators toward three motion-or-contact kinds without losing anything.
- **Split: cross-body is its own contact, not a terminal hardness.** Because a cross-body contact can stand alone (Section 3), it should be pulled out of the "hard terminal" bundle and named as its own primitive contact, `xbody`, which scores 1 on its own and combines with a delay to make the grade-2 cross-body stall. The terminal generator was hiding two concepts, a delay-or-kick contact and a cross-body contact, and they should be separated.

After the merge and the split, the minimal candidate basis is: **contact** (a bag-on-surface event, launch or land), **cross-body contact** (a contact reached across the body), **dexterity** (the leg circles the bag), and **body** (the body moves). Four irreducible kinds, cleaner than the starting four. This is the smallest complete-looking basis the current evidence supports.

## 5. The genuine completeness gaps (uncertain / candidate-missing primitives)

Minimization succeeds everywhere in Sections 2 to 4. Closure fails only at the primitive floor, where a small number of cells resist every reduction **and** do not fit the candidate basis. These are the reason the grammar is not yet closed.

- **Pogo (strongest evidence of an open primitive).** Pogo is a set that adds one scored point without a scoring dexterity, body step, or landing. It does not fit the "dex in first position" identity and it does not fit any of the four candidate kinds. It is either a genuine fifth primitive, a scored set-contribution that is neither a dex, a body, nor a contact, or a special case not yet explained. Phase I flagged it at grade 1 and again at grade 2 and could not resolve it. **Uncertain, and the single most important closure question.**
- **The bare-surface kick (same shape as pogo).** A kick off a bare surface (sole kick, cloud kick) scores 1 with no scoring generator in the word. Its point has no source in the four-generator basis. This is the same phenomenon as pogo: a scored contribution the basis cannot see. It points to either a missing "strike" primitive distinct from the dexterity, or an implicit dex the kick carries, or a scoring reinterpretation. **Uncertain, and probably resolves together with pogo.**
- **Paradox.** Paradox is a dex performed with a double-hip-pivot. It always co-occurs with a dexterity (zero counterexamples corpus-wide) and never floats free, which is consistent with its being a parameter of the dexterity rather than a generator. But whether it is a parameter or a distinct scored event is not settled; it is entangled with the open scoring question about how a blurry-named trick's extra element is counted, which is with the rules expert. **Uncertain, pending a scoring ruling; likely a dex parameter, not a new primitive.**
- **Posture and suspension (symposium, pogo's cousin).** Support-leg posture (planted, no-plant, airborne) is real, per-step, and structural, but whether a suspension is a scored event in its own right or a licensing parameter that lets a co-occurring event score is unresolved: a suspension is treated like an event yet was described as a manner, and the grade-neutrality claim rests on a single comparison. **Uncertain, likely a parameter, but under-tested.**
- **Rotation grade (a parameter question, not a missing primitive).** Which rotations raise a dex's grade (a cross-body rotational dex reaches grade 3) is encoded but not pinned down; it needs the grade-3 data. This does not threaten completeness, but it must be fixed before scoring is reliable in generation.

## 6. Inventory of the proposed primitive generators

The complete candidate primitive basis after minimization, with the justification for each remaining primitive and its status:

| Primitive | What it is | Grade | Why it survives | Status |
|---|---|---|---|---|
| `contact(surface, role)` | the bag rests on a surface, launched or landed | 0 (launch) / 1 (held land) | a landing is not a motion and cannot be a dex or body; merges entry and plain terminal | firm |
| `xbody` | a contact reached across the body | 1 (alone) / 2 with a delay | stands alone in four tricks, so not a landing-hardness parameter | firm (Phase I refuted the manner reading) |
| `dexterity(side, direction, rotation, far?)` | the leg circles the bag | 1 (2 if cross-body rotational) | irreducible motion; subsumes all set and receiver operators as positions and parameters | firm |
| `body(kind)` | the body moves with no new bag contact | 1 | distinct scored motion from a dex; body slot never doubles | firm |
| posture (planted / no-plant / airborne) | support-leg state | parameter | real, per-step, structural | uncertain: parameter vs scored event |
| paradox | a dex with a double-hip-pivot | parameter or event | always bundled onto a dex, never free | uncertain: parameter vs event (scoring ruling pending) |
| **pogo / non-dex set contribution** | a set that scores 1 with no dex, body, or contact | 1 | does not fit any candidate kind | **uncertain: possible missing fifth primitive** |
| **bare-surface strike** | a kick that scores with no scoring generator | 1 (?) | point has no source in the basis | **uncertain: possible missing primitive, likely resolves with pogo** |

The four rows marked firm are the irreducible motion-and-contact basis. The four below are the open floor: two parameters awaiting a ruling, and two candidate-missing primitives (pogo and the bare-surface strike) that are the same phenomenon seen twice.

## 7. Final assessment: is the grammar mature enough to begin unrestricted generation?

**Not yet.** The answer has two clean halves.

**What is closed.** The named-operator and named-atom layer is fully reducible to a small basis, and the four motion-and-contact generators are irreducible (with the entry-and-landing merge and the cross-body split making them minimal). If freestyle's primitives were only motions and contacts, the grammar would be closed and generation could begin. That is a real and reassuring result: the vocabulary explosion is an illusion of naming, and the true basis is four kinds.

**Why it is not closed.** Generation would be premature because the primitive floor has an unresolved candidate fifth generator. Pogo adds a scored point with no dex, body, or contact, and the bare-surface kick does the same thing from the other direction; both sit outside the four-kind basis. Until their status is ruled, a generator built on the four kinds would be **structurally incomplete** (it could not generate the pogo family at all) and, together with the unresolved rotation-grade and paradox questions, would **mis-grade** part of what it did generate. Generating a large movement space on an incomplete basis would produce an authoritative-looking universe that silently omits a real primitive, which is exactly the premature-generation failure this study exists to prevent.

**Exactly what is missing, to close the grammar:**

1. **Rule pogo's status.** Is it a fifth primitive, a scored set-contribution that is neither dex, body, nor contact, or a special case of one of them? This is the single blocking question. The bare-surface kick almost certainly resolves with it.
2. **Rule the bare-surface strike scoring.** Where does a bare surface kick's single point come from: a missing strike primitive, an implicit dex, or a scoring reinterpretation?
3. **Settle paradox.** Parameter of the dexterity or a distinct scored event. This is entangled with the pending scoring ruling and is with the rules expert, not resolvable internally.
4. **Fix the rotation-grade rule** using the grade-3 data, so a cross-body rotational dex is scored correctly.
5. **Test posture grade-neutrality** beyond the single symposium-versus-pogo comparison.

None of these needs new theory. Items 1, 2, and 5 are answerable from the existing corpus plus targeted analysis; item 3 is a rules-expert ruling already in the queue; item 4 needs the grade-3 enumeration that Phase II would produce anyway. The recommendation is therefore narrow and firm: **do not begin unrestricted generation until pogo's status is ruled**, because that one answer decides whether the basis has four primitives or five, and every generated formula depends on it. The rotation-grade and paradox items can be settled in parallel, but pogo is the gate.

## 8. Non-goals honored

No higher-dex generation, no enumeration of a larger movement space, no new trick formulas, no ADD computed as a claim, no production code, no dictionary change. The deliverable is this study and its primitive inventory. The next phase of the Trick Universe project should begin only after pogo's status is ruled and the grammar is confirmed closed.
