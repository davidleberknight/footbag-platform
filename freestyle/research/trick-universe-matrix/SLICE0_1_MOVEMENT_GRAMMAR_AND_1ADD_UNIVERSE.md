# Freestyle Trick Universe: Slice 0 and Slice 1 research

Status: exploratory research under `exploration/`. Not production data, not canonical doctrine, not a change to the live freestyle dictionary. This document defines a symbolic movement grammar from first principles and enumerates the 1-ADD movement layer. Names are treated as annotations applied after the movement is described, never as the starting point.

Prior art in this repository that this reconciles with (does not replace): `exploration/freestyle-notation-grammar/` (grammar glossary, style guide, op-notation drafts) and the live operational-notation vocabulary in `src/services/operationalNotationRendering.ts`.

---

## 0. Framing: the physics question

The question is not "how many trick names can we invent." The question is "what distinct footbag movements are physically realizable by a human while keeping control of the bag." A trick is first a path through movement space and only later a name:

```
START_SURFACE  ->  SET_LAYER*  ->  BODY_LAYER*  ->  RECEIVER_LAYER*  ->  TERMINAL_SURFACE
```

The live dictionary is one observed subset of that space. The goal here is to describe the space itself, with the named tricks placed inside it as labels.

A single, load-bearing observation reframes everything below. The named "atoms" of the current dictionary are already compounds of two or more scoring events:

- A plain toe stall scores 1 (it is one held delay).
- Mirage, illusion, legover, orbit, around-the-world, and pickup each score 2 (a single dexterity plus a held delay).
- A clipper stall scores 2 (it is a cross-body delay: a cross-body component plus a delay).
- Whirl, swirl, butterfly, and osis score 3.

So the true atomic layer, the 1-ADD movements, sits below the named atoms. The clearest evidence is the "kick" family in the live data: `around_the_world_kick`, `orbit_kick`, `legover_kick`, `pixie_kick`, `fairy_kick`, `atomic_kick`, and `miraging_kick` all score 1. A kick is the same dexterity motion as its 2-ADD held cousin, but with no held delay at the end, so only the single dexterity scores. The kicks expose the pure single-dex primitive that the held atoms hide inside a 2-ADD compound.

That is the reason to enumerate the 1-ADD layer first: it is the real primitive vocabulary of the movement universe.

---

## 1. Slice 0: the symbolic movement grammar

### 1.1 Primitive inventory (drawn from the codebase, not invented)

Every element below already exists as a closed vocabulary in the code. Sources are named so the grammar stays grounded in what the platform already represents.

**Contact surfaces** (`SURFACES` in `operationalNotationRendering.ts`), 14 tokens. Two roles: launch positions and landing surfaces.

- Launch / set positions: `SET` (generic launch), `CLIP` (clipper set), `TOE` (toe set).
- Landing surfaces: `INSIDE`, `OUTSIDE`, `SOLE`, `KNEE`, `NECK`, `HEAD`, `FOREHEAD`, `SHOULDER`, `CLOUD`, `HEEL`, `PEAK`.

**Sides and directions** (secondary tokens). Side: `SAME`, `OP` (relative to the plant foot). Direction: `IN`, `OUT`, and the rotational pair `FRONT`, `BACK` (which fuse with `WHIRL` / `SWIRL`).

**Component roles / scoring brackets** (`COMPONENT_FLAGS`). These are the ADD carriers. The count of scoring brackets is the ADD:

- Scoring: `[DEX]` dexterity, `[DEL]` delay/stall, `[BOD]` body step, `[XBD]` cross-body delay, `[PDX]` paradox dex, `[XDEX]` conditional X-Dex, `[UNS]` unusual-surface delay.
- Non-scoring: `[KICK]` kick action marker (the kick itself carries no ADD).

**Motions that are not surfaces**: body actions `SPIN`, `DUCK`, `DIVE`, `FLYING`; rotation nouns `WHIRL`, `SWIRL` (two-token fusion with FRONT/BACK).

**Set operators** (`freestyle_trick_modifiers`, `modifier_type = 'set'`), with their ADD contribution: `rooted` (+0), `atomic` `blurry` `fairy` `pixie` `pogo` `quantum` `stepping` (+1), `barraging` `furious` `nuclear` `railing` `sailing` `splicing` (+2), `floating` `shooting` `surfing` `warping` (+3). The curated single-authority descriptions live in `src/content/freestyleOperatorReference.ts`.

**Body operators** (`modifier_type = 'body'`), all +1 except one: `backside` `blazing` `diving` `ducking` `gyro` `inspinning` `miraging` `paradox` `spinning` `swirling` `symposium` `tapping` `weaving` `whirling` `xdex` `zulu` (+1), `terraging` (+3).

**Receiver dexterities / the twelve core atoms** (`CORE_ATOM_SLUGS`): `toe_stall`, `clipper_stall`, `around_the_world`, `orbit`, `legover`, `mirage`, `pickup`, `illusion`, `butterfly`, `osis`, `whirl`, `swirl`. As standalone named tricks their ADDs are: toe stall 1; clipper stall, ATW, orbit, legover, mirage, illusion, pickup all 2; butterfly, osis, whirl, swirl all 3.

**Kicks**: named kick tricks that score 1 (`around_the_world_kick`, `orbit_kick`, `legover_kick`, `pixie_kick`, `fairy_kick`, `atomic_kick`, `miraging_kick`, `cloud_kick`, `sole_kick`, `double_kick`, `double_knee`).

**Quantifiers**: `double` (and higher counts), which multiply a step rather than adding a new movement kind.

### 1.2 The layer model

Every primitive maps to exactly one layer. The layers are ordered by when they occur in a trick:

| Layer | What it does | Primitives |
|---|---|---|
| Contact / entry | where the bag is launched from | `SET`, `TOE`, `CLIP` |
| Set | shapes the launch, adds a first dexterity | atomic, pixie, fairy, stepping, quantum, blurry, pogo, and the +2 / +3 set operators |
| Body | reshapes the body mid-flight, no new bag contact required | spinning, gyro, ducking, diving, weaving, zulu, tapping, symposium, inspinning, paradox, backside, blazing, and the bare body actions spin, spyro, flying |
| Receiver | the dexterity that catches or redirects the bag | the dex core atoms (ATW, orbit, legover, mirage, illusion, pickup) and rotational dexes (whirl, swirl) |
| Terminal | where the bag comes to rest or is struck | any landing surface with `[DEL]` (a stall), a cross-body `[XBD][DEL]`, an unusual-surface `[UNS][DEL]`, or a `[KICK]` |

Two facts make the layers real rather than cosmetic:

1. The same physical motion can occupy different layers and the layer is what the notation records. Pixie is a single same-side inward toe-set dexterity written at the front of the chain (the set layer); the identical shape appearing later in the chain is a receiver dexterity. This is exactly the distinction the education content already draws (`symbolicSetEducation.ts`): a launch "is written as the opening set, not as a body or paradox token alongside the dexterity."
2. Layers stack and each scoring event is preserved. Pixie Mirage is not "mirage from a pixie entry." It is two dexterity layers, a pixie set dex plus a mirage receiver dex, and the operational notation keeps both: `TOE > SAME IN [DEX] >> OP IN [DEX] > OP TOE [DEL]`, which reads pixie(+1) + mirage(2) = 3. The grammar must preserve layered dex composition, and the existing notation already does.

### 1.3 The smallest grammar that expresses every current trick

The following covers every live trick because it is the operational-notation grammar stated as production rules. It is intentionally the existing grammar formalized, not a redesign.

```
TRICK       := ENTRY STEP*  TERMINAL
ENTRY       := ( "SET" | "TOE" | "CLIP" )?              ; a launch position, sometimes implicit
STEP        := SEP PRESTATE* SIDE? DIRECTION? MOTION ROLE+
SEP         := ">" | ">>"                               ; ">>" marks a layered / simultaneous step
SIDE        := "SAME" | "OP"
DIRECTION   := "IN" | "OUT" | "FRONT" | "BACK"
MOTION      := SURFACE | "WHIRL" | "SWIRL" | "SPIN" | "DUCK" | "DIVE" | "FLYING"
ROLE        := "[DEX]" | "[DEL]" | "[BOD]" | "[XBD]" | "[PDX]" | "[XDEX]" | "[UNS]" | "[KICK]"
PRESTATE    := "(back)" | "(front)" | "(no plant while)" | "(rooted)"
TERMINAL    := SIDE? SURFACE ( "[DEL]" | "[XBD]" "[DEL]" | "[UNS]" "[DEL]" | "[KICK]" )
ADD         := count of scoring ROLE tokens ( every role except "[KICK]" )
```

The layer model of section 1.2 is a semantic overlay on this linear grammar: the set layer is the leading STEP(s) before the receiver, the body layer is STEPs carrying `[BOD]` / `[PDX]`, the receiver layer is the STEP(s) carrying the final scoring `[DEX]` before the terminal, and the terminal is the last STEP.

### 1.4 Mapping to operational notation and to JOB

**Operational notation.** The grammar above is operational notation, so the mapping is one to one by construction. What maps cleanly: surfaces, sides, directions, the seven scoring roles, the kick marker, sequence separators, and the pre-state flags. This is the whole live vocabulary and it already renders and ADD-scores.

What does not map cleanly, and should be treated as open modeling questions rather than defects:

- Kick scoring. A held stall is `SURFACE [DEL]` = 1. A kick terminator `[KICK]` is non-scoring, yet `sole_kick` and `cloud_kick` score 1. For the dex-kicks (around-the-world kick and friends) the 1 comes cleanly from the single `[DEX]`. For a bare surface kick the source of the 1 is not expressible in the current bracket rule. This is the single most important gap the 1-ADD enumeration surfaces (section 2.5).
- Pogo. Pogo is a set that contributes +1 without a scoring dexterity. The bracket-count rule cannot see it. It is a genuine primitive that the linear grammar under-represents.
- Simultaneity. `>>` distinguishes a layered or simultaneous step from a sequential one, but the grammar does not otherwise model true simultaneity (two things happening at once versus in sequence). For a physics-first model this may eventually matter.

**JOB notation.** Treat JOB (the Stanford-style Jobs formula) as historical reference, not the primary representation, exactly as the platform already does: the `notation` column stores raw Jobs notation as opaque text and the parser does not regenerate it. A faithful JOB cross-map needs the external Stanford encoding in hand; that is a reading task, and this document does not fabricate JOB formulas. Recommendation: keep JOB as an optional annotation on movements that have a documented JOB form, and do not rebuild the movement model around it. The operational grammar is the primary representation because the platform already tokenizes and scores it.

---

## 2. Slice 1: the 1-ADD movement universe

### 2.1 Definition from first principles

A 1-ADD movement is a movement whose formula contains exactly one scoring bracket. Every richer trick is a composition of these. There is no smaller unit, so this is the true primitive layer.

The single scoring bracket can be any of the seven scoring roles, which partitions the 1-ADD universe cleanly:

- one `[DEL]`: a held stall on a landing surface
- one `[DEX]`: a single dexterity (the "trip"), most visibly the kick family
- one `[BOD]`: a single body step
- one `[XBD]`: a single cross-body event (note: a cross-body stall is `[XBD][DEL]`, which is two brackets, so cross-body stalls are 2-ADD, which is why the clipper stall scores 2)
- one `[PDX]`: a single paradox-direction dex
- one `[UNS]`: a single unusual-surface stall
- one `[XDEX]`: a single conditional X-Dex

### 2.2 The enumeration (companion file: `one_add_universe.csv`)

**Held stalls (surface + `[DEL]`).** One per landing surface. Named today: toe, inside, outside, knee, neck, head, forehead, shoulder, peak (nine). Structurally valid and unnamed in the live dictionary: sole stall, heel stall, cloud stall (only their kick forms are named). A physicist's inventory of body-contact surfaces is a superset of the fourteen code tokens (chest, thigh, back of neck, and so on), each a candidate 1-ADD stall; the code vocabulary is the grounded floor, not the ceiling.

**Single dexterities (`[DEX]`), the trip primitives.** The elegant core of the layer. Launched from the toe set, the two-by-two of side and direction generates four primitive dexes, and these are exactly the named +1 set operators and the named kicks:

| side x direction | operator name | kick name | receiver-atom cousin (2-ADD held) |
|---|---|---|---|
| SAME IN | pixie | pixie_kick, around_the_world_kick | around_the_world |
| SAME OUT | fairy | fairy_kick | (fairy-family) |
| OP IN | miraging | miraging_kick | mirage |
| OP OUT | atomic | atomic_kick, orbit_kick | orbit |

Plus legover as its own dex primitive (legover_kick), pickup (held pickup is 2-ADD; a pickup kick is an unnamed candidate), and the rotational dex primitives whirl and swirl (named forms are all 2+ ADD held tricks; the bare rotational dex is an unnamed candidate). The single dexterity is 1-ADD; the named held atom is that dexterity plus a terminal delay, hence 2-ADD.

**Single body steps (`[BOD]`).** Named: spin, spyro, flying inside, flying outside. Candidates named only as +1 operators, not as bare tricks: duck (ducking), dive (diving).

**The +1 operators as 1-ADD injectors.** Every +1 set operator (atomic, pixie, fairy, stepping, quantum, blurry, pogo) and every +1 body operator (paradox, spinning, gyro, ducking, diving, weaving, zulu, tapping, symposium, inspinning, whirling, swirling, backside, blazing, miraging, xdex) is, by definition, a movement that contributes exactly one scoring bracket. They are the same 1-ADD layer seen as composable operators rather than as terminal tricks.

### 2.3 Observed subset versus universe

The live dictionary currently names 25 tricks at 1 ADD: 9 stalls, 7 dex-or-kick forms, and 9 body-or-kick forms (`freestyle_tricks`, `adds = 1`, active). The enumeration above shows the universe is larger than the named subset in three concrete directions: unnamed held stalls on surfaces that today have only a kick form, unnamed bare dexes (pickup kick, bare whirl and swirl dexes) whose held cousins are named, and unnamed bare body actions (duck, dive) that exist today only as operators. None of these are proposals to name anything; they are coordinates in the movement space that happen to be currently unlabeled.

### 2.4 The symbolic matrix

The full row-level matrix is the companion CSV `one_add_universe.csv`, with columns: layer, primitive, symbolic form, scoring bracket, ADD, named status, named example slug, notes. It lists every 1-ADD primitive by layer (terminal stalls, terminal kicks, dexes, body steps, set operators, body operators) and marks each as named, candidate (structurally valid and unnamed), or operator.

### 2.5 The one real modeling gap to resolve first

Kick scoring is the one place the current bracket rule and the 1-ADD data disagree. Dex-kicks score cleanly through their single `[DEX]`. Bare surface kicks (sole kick, cloud kick) score 1 with no scoring bracket in the current vocabulary. Before any generation, the model needs one ruling: either a kick off a surface carries an implicit scoring role, or the 1 comes from an unstated dex, or surface kicks are a distinct scoring category. This is a small, self-contained question and it gates a clean 1-ADD enumeration.

---

## 3. Recommended first executable research prototype

Your intuition is right: enumerate and visualize the complete 1-ADD movement universe before any higher-order generation. Concretely, the smallest useful prototype is a read-only enumerator and viewer of the 1-ADD layer, not a general trick generator.

- Input: the primitive vocabularies already in the codebase (surfaces, the four side-by-direction dex primitives, body actions, the +1 operators), read from the canonical registries so there is no second source of truth.
- Process: emit one row per 1-ADD primitive (the CSV in this folder is the hand-built seed of exactly this output), classify each as named / candidate / operator by matching against the live dictionary, and compute the single scoring bracket.
- Output: the matrix plus a simple visualization that lays the layer on two axes that the data itself suggests, side (SAME / OP) by direction (IN / OUT) for the dex primitives, and surface by role for the terminals, with named cells filled and candidate cells empty. The empty cells are the visible gaps between the named subset and the movement universe.
- Deliberately excluded: any enumeration of 2-ADD or higher compositions, any name generation, any physics claim beyond the rule-based legality already implicit in the grammar.

This proves the whole idea (movement first, names later, gaps visible) at the smallest possible scale, and it produces an artifact that the later generator can be validated against.

---

## 4. Open questions and blockers

- Kick scoring convention (section 2.5). The one modeling question that should be answered before enumeration is finalized.
- Pogo and other non-dex +1 sets. The bracket-count rule cannot see a set that adds 1 without a scoring dex. Decide whether pogo is a genuine exception or carries an implicit role.
- Surface vocabulary scope. Fix whether the 1-ADD stall inventory is the fourteen code surface tokens only, or the larger anatomically-plausible set of contact surfaces. The first keeps the prototype grounded; the second is truer to the physics question.
- JOB encoding. A faithful JOB cross-map needs the external Stanford Jobs formula specification. Until it is read, JOB stays an optional annotation, not a representation. This is a reading task, flagged, not attempted here.
- Simultaneity. The linear grammar marks layered steps with `>>` but does not fully model two events happening at once. Likely irrelevant at the 1-ADD layer; may matter later.

Nothing in this slice touches the live dictionary, canonical doctrine, or production code. The deliverables are this document and the companion `one_add_universe.csv`.
