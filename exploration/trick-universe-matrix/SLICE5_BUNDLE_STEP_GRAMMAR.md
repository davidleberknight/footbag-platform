# The Bundle-Step Grammar: What Makes Co-Occurring Events One Trick-Step

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. The posture study showed that a movement is not a linear chain of single events; symposium fuses a suspension and a dex into one instant. This slice studies that fusion directly and proposes the grammar the whole project has been circling: a trick is a sequence of bundle-steps, each a set of co-occurring scored events. Companion file: `bundle_step_decomposition.csv` (worked per-step decompositions). Grounded in the operational notation of the live dictionary.

The driving question: when multiple scored events happen in the same movement instant, what makes them one trick-step rather than a linear chain.

Working axioms carried forward: a trick is a movement formula, names are annotations, the kick is worth one ADD less than its stall counterpart, the dictionary is one observed subset of a larger universe.

---

## 1. The answer, stated first

Events are one step when they share a single bag-foot contact, one instant in which the foot meets or the body carries the bag. Within that instant, one event is the carrier, the thing the contact does (a dexterity, or a landing), and the others are manners, describing how the carrier is executed (suspended, paradox, cross-body, on an unusual surface, kicked). Events are a chain when each is its own contact, with the bag traveling between them.

The notation already marks this, with three temporal relations, and the corpus uses all three at scale.

- **Juxtaposition (a bundle):** two or more scored brackets on one token group, no separator, for example `OP IN [BOD] [DEX]`. Same instant.
- **`>` (succession):** a new contact; the bag travels and the foot re-establishes. 895 tricks use it.
- **`>>` (overlap):** a body event that runs concurrently across a contact boundary, neither fully bundled nor fully sequential. 232 tricks use it.

The physical boundary maker between a bundle and a chain is the support foot. Re-plant it, and a new contact begins, a new step. Keep it lifted, and the next dexterity bundles with the suspension. The single cleanest proof is a three-way contrast the data hands us directly.

## 2. The contrast that proves it

Three tricks share the same two dexterities, a fairy out-dex and a mirage in-dex, and differ only in how those dexes relate in time.

- **fairy** `TOE > SAME OUT [DEX] > OP TOE [DEL]`, 2 ADD. One dex, one landing. Two single-event steps.
- **fairy same-side mirage** `TOE > SAME OUT [DEX] (plant) > SAME IN [DEX] > OP TOE [DEL]`, 3 ADD. The explicit `(plant)` after the first dex re-plants the support foot, so the second dex is its own contact. A chain of two planted dexes. The extra ADD is the extra dex; nothing bundles.
- **fairy symposium mirage** `TOE > SAME OUT [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]`, 4 ADD. The leg stays lifted through the second dex, so that dex bundles with a suspension body event. A chain of two steps where the second is a bundle of size two. The extra ADD over the same-side version is the suspension body event the bundle adds.

Same two dexes, three different time structures, three different tricks, three different ADD totals. The `(plant)` marker and the `(no plant while)` marker are the switches. This is the whole thesis in one family: time structure is trick identity, and the support foot decides bundle versus chain.

## 3. The grammar

A trick is a sequence of steps joined by temporal relations. A step is a bundle of co-occurring events sharing one contact.

```
TRICK    := ENTRY ( REL STEP )*
ENTRY    := contact(surface) POSTURE?                 ; grade 0; sets initial contact and posture
REL      := ">"                                       ; succession: a new contact
          | ">>"                                      ; overlap: a body event concurrent across the boundary
STEP     := POSTURE? BAG_PATH? EVENT+                 ; a bundle sharing one contact / instant
POSTURE  := planted | no-plant | flying | jump        ; grade 0; per-step; may change within a trick
BAG_PATH := normal | swing | backside                 ; grade 0; the trajectory into the step
EVENT    := BODY | DEX | TERMINAL                      ; the scored members of the bundle
BODY     := side? action [BOD]                         ; grade 1; a spin, duck, dive, suspension, jump
DEX      := side dir rot? ( [DEX] | [PDX] | [XDEX] )   ; grade 1 each; a dex-family event
TERMINAL := side? surface ( [DEL] | [XBD][DEL] | [UNS][DEL] | [XBD][UNS][DEL] | [KICK] )
GRADE    := count of scored brackets over all EVENTs of all STEPs    ; = ADD; [KICK] does not score
```

Two structural rules govern a bundle:

1. **One carrier, the rest manners.** Each step has one carrier event, the dexterity or the landing the contact performs. The other members qualify it: a body bracket means the carrier is done suspended or spun; a paradox or x-dex bracket means the carrier dex is done in that manner; the cross-body and unusual-surface brackets are the manner of a landing. Manners do not stand alone; there is no bare symposium, no floating `[PDX]` without a dex, no `[XBD]` without a `[DEL]` or a landing. This is why posture could not be isolated in the prior slice: a suspension is a manner, and a manner needs a carrier.

2. **Grade counts events, not steps.** ADD is the number of scored brackets across all bundles. The step count is the number of contacts. They are equal only when every bundle has one event, and they diverge exactly when a step bundles more than one scored event. Montage is 7 ADD in 4 steps because one step bundles three scored events and another bundles two.

## 4. The corpus, decomposed

The companion CSV walks eleven tricks step by step. The pattern across them:

- **Cube atoms are all-singleton chains.** Mirage and fairy are a single-dex step followed by a single-terminal step, every bundle size one, posture planted, path normal. The cube is precisely this sublanguage: a chain of one-dex steps closing on a one-terminal step, with no bundling, no suspension, and no path variation. Every earlier slice's cube result is this special case of the grammar.
- **Symposium is a bundle of size two:** a suspension body and the receiver dex in one instant. Pogo is the same suspension posture but a bundle of size one, the leg lifted while a leading dex scores, no body. Same posture, different bundle content, which is exactly why they score by different brackets.
- **Kicks bundle a dex with its terminal.** Dragonfly kick's second step is `OP OUT [DEX] [KICK]`, the dexterity and the strike in one instant, the kick unscored. The kick rule is now just this: the terminal slot of a bundle is either a scored delay or the unscored kick.
- **Terminals can be compound-qualified.** Cross-body sole stall is one landing carrying both a cross-body and an unusual-surface manner, `SAME SOLE [XBD] [UNS] [DEL]`, three scored brackets in one event. The clipper's grade-2 landing is the same phenomenon with one manner.
- **`>>` overlap is a real third relation.** Assassin is `TOE > SAME IN [DEX] >> DUCK [BOD] >> OP IN [DEX] > OP TOE [DEL]`: the duck is not bundled into either dex and is not a plain successor; it runs concurrently across the transition, marked by the double separator on both sides. Montage opens `CLIP >> (back) SPIN [BOD]`, a spin overlapping the set. Overlap is how a body event spans two contacts without belonging to either.

## 5. What this resolves, and what it opens

**Resolved.** The simultaneity question the posture slice raised now has a mechanism. Multiple scored events are one step when they share a contact; the support foot, via plant and no-plant, is the boundary maker; within a step one carrier is qualified by manners; ADD counts events across bundles; step count is contacts; the cube is the all-singleton sublanguage. Every prior result survives as a special case: the four-generator basis is the event types, the kick identity is the terminal slot, the surface fibers and the side-direction symmetry live on the dex and terminal events, and posture is a grade-neutral per-step attribute.

**Opened, and explicitly not claimed here.**

- **The dex-family manners are the next slice.** Paradox `[PDX]` and x-dex `[XDEX]` appear only as bundled manners on a carrier dex, `SAME IN [PDX] [DEX]`, `OP IN [DEX] [XDEX] [BOD]`. Whether they are two more manners like suspension, or carry their own sub-structure (paradox as a reversed dex direction, x-dex as a conditional extra), is the question the audit flagged and this grammar sets up but does not answer.
- **Bag path needs its own study.** Swing (pendulum, rake) and backside (`BS [DEX]`, the backside dexes) are trajectory variations sitting in the path slot. Whether path is grade-neutral like posture, or sometimes carries a scored event as rake's `SWING [DEX]` suggests, is unresolved.
- **The carrier-manner rule is a strong claim on limited evidence.** It holds across the sector examined (symposium, pogo, kicks, cross-body and unusual terminals, montage-class compounds), but the corpus is large and this study read a curated slice of it closely, not all of it. A full sweep could find a step that breaks one-carrier, and that would refine the rule.
- **Overlap semantics are described, not formalized.** The `>>` relation is real and common, but exactly what concurrency it asserts (a body event spanning which contacts, and how that affects grade) is stated qualitatively here, not pinned down.
- **Bundle cardinality of the body slot.** Every bundle examined has at most one body event; the grammar writes `body_event?` on that basis. A wider sweep should confirm no step carries two.

No claim is made that this grammar is complete, that unnamed bundle configurations are impossible, or that the decomposition of any single trick is the only defensible reading; the CSV shows the readings so they can be checked. What is claimed is narrow and, within the sector studied, well supported: the linear-word model is wrong, the right object is a sequence of bundle-steps, and the cube is the special case where every bundle is a single event.

Deliverables: this note and `bundle_step_decomposition.csv`. No names generated, no production code, no dictionary changes. The recommended next slice is the dex-family manners, paradox and x-dex, studied the way symposium was: isolate them, and ask whether they are manners like suspension or a structure of their own.
