# Red / SME Questions Registry

**Date**: 2026-05-17.
**Purpose**: consolidate every outstanding Red / SME question across the comparative-reconciliation arc + Wave 2 packet + Slices O–S + Pre-Red sweep + human-review triage + final external coverage audit. Single source for the curator to confirm completeness of the Red Wave 2 packet (sent 2026-05-15) and queue any additional questions.

**Status**: each question carries a `question_id`, a `priority` rating (HIGH / MEDIUM / LOW), and a `wave` flag (Wave 1 / Wave 2 / Wave 2+). Items already settled by prior Red rulings (pt1–pt12 + Wave 1 batch ruling 2026-05-15) are NOT included here — see `project_freestyle_state.md` for the durable-rulings table.

---

## Wave 2 packet — sent 2026-05-15 (6 questions)

These are the formally-submitted Wave 2 items. They block downstream curator decisions across multiple comparative-reconciliation outputs.

### W2-Q1 — Fairy operator boundary

  - **topic**: operator-vs-trick boundary for `fairy`
  - **affected tricks/operators**: fairy itself; nallegam, fairy-beater, fear, fudge, casket, phobia (5+ external candidates use fairy compositionally per Slices P, R, Y)
  - **current IFPA posture**: `fairy` is `kind='operator'` in `freestyleTrickKindOverrides.ts`; `MODIFIERS` registry includes fairy as a set primitive; chain readings DO NOT use fairy verb operator yet
  - **external-source evidence**: PB uses fairy in technical names ("Fairy Drifter", "Fairy Mirage", "Fairy Mobius"); FM Wave-2 candidates include fairy-led compounds
  - **why needed**: any chain authoring for fairy-compounds depends on the operator's structural identity; the Slice L1 Movement System places fairy in Set/Uptime axis but a Wave 2 ruling could move it
  - **possible outcomes**: (a) fairy = set primitive (current posture confirmed); (b) fairy = body modifier (closer to spinning); (c) fairy = compound operator (set + something else)
  - **downstream files/surfaces affected**: `freestyleMovementSystems.ts`, `freestyleSymbolicEquivalences.ts`, all Slice P/R fairy-flagged rows
  - **priority**: HIGH
  - **wave**: Wave 2

### W2-Q2 — Compression-intent doctrine

  - **topic**: when a long structural reading "is" the trick vs when the compressed folk name is the canonical identity
  - **affected tricks/operators**: mobius (gyro torque ≡ spinning ss miraging op osis), drifter (miraging clipper), blender (whirling osis), torque (miraging osis), food-processor (blurry blender ≡ stepping paradox blender)
  - **current IFPA posture**: 3-card compression flow on /freestyle/glossary §8 + curator-authored multi-reading chains preserve progressive depth; no formal doctrine
  - **external-source evidence**: Slice P found PB consistently writes the compressed form (gyro torque) where FM technical_names sometimes write the expanded form
  - **why needed**: curator-authored chains need a doctrine for when to STOP unfolding. Currently per-chain ad-hoc.
  - **possible outcomes**: (a) prefer-shortest-curator-authored; (b) preserve-all-stopping-depths; (c) compress-to-folk-name-when-Red-locked
  - **downstream files/surfaces affected**: chain registry authoring + glossary §8 rendering + token render priorities
  - **priority**: MEDIUM
  - **wave**: Wave 2

### W2-Q3 — Hidden X-dex preservation rules

  - **topic**: how to surface implicit X-dex compounds in compositional readings
  - **affected tricks/operators**: atom-smasher (Red 2026-05-15: carries X-dex like paradox from a toe), fusion, plasma, double-down compounds, barrage (PB "double-dex Mirage"), ripstein (PB "double-dex Swirl")
  - **current IFPA posture**: no surface for hidden X-dex; chain readings collapse atom-smasher = atomic mirage without X-dex annotation
  - **external-source evidence**: FM `(X-DEX)` annotation in operational_notation_raw; PB uses `double-dex` prefix; Slice Q flagged 4 hidden-dex-discrepancy rows
  - **why needed**: atomic-family ontology is incomplete without X-dex preservation rule; ADD math for nuclear/atomic compounds depends on this
  - **possible outcomes**: (a) annotate as suffix `[X-DEX]` in chain readings; (b) lift to a new operator class; (c) leave implicit per atomic compound's pt-locked decomposition
  - **downstream files/surfaces affected**: chain registry + glossary §7 notation reference + Movement System view's atomic group
  - **priority**: HIGH
  - **wave**: Wave 2

### W2-Q4 — Folk-stabilization adjudication threshold

  - **topic**: when does a folk-named compound earn canonical status (vs stay in `UNRESOLVED_COMPOUNDS`)?
  - **affected tricks/operators**: rev-up, reaper, surreal, montage, witchdoctor, fury, surgery (7 pilot members post Pre-Red tomahawk removal)
  - **current IFPA posture**: 7-row `UNRESOLVED_COMPOUNDS` pilot; rendering pending-pill; no admission criterion documented
  - **external-source evidence**: tomahawk removed from pilot 2026-05-17 after FM+PB external consensus on `ducking paradox whirl`. Same pattern could apply to witchdoctor (FM has "Atomic Symposium Mirage" but PB silent — single-source threshold question).
  - **why needed**: doctrine for promotion-out-of-pill so curator decisions are repeatable
  - **possible outcomes**: (a) require multi-source agreement (FM + PB both); (b) accept Red ruling; (c) accept single-source if structurally clean
  - **downstream files/surfaces affected**: `freestyleUnresolvedCompounds.ts`, `freestyleSymbolicEquivalences.ts`
  - **priority**: MEDIUM
  - **wave**: Wave 2

### W2-Q5 — Blurry transitivity (compounds vs base tricks)

  - **topic**: does `blurry` apply to compounds (`blurry blender` → `stepping paradox blender`) or only base tricks (`blurry mirage`)?
  - **affected tricks/operators**: food-processor (Red-locked blurry blender = stepping paradox blender; pt11 + Wave-1 ruling); blurry-whirl, blurry-torque (pt12 expanded-decomposition cohort)
  - **current IFPA posture**: pt11 ruling sets `blurry = stepping paradox` for base tricks; food-processor extends this transitively to a compound base (blender). The transitivity rule was implied but not stated explicitly.
  - **external-source evidence**: PB writes "Stepping far Blender" for food-processor → transitivity-confirming
  - **why needed**: blurry-compound chain authoring depends on whether the transitive rule holds; future folk-blurry compounds need a rule
  - **possible outcomes**: (a) blurry transitive across all compounds; (b) blurry only base-trick scope; (c) case-by-case per compound
  - **downstream files/surfaces affected**: chain authoring policy
  - **priority**: MEDIUM
  - **wave**: Wave 2

### W2-Q6 — Barraging operator class

  - **topic**: is `barraging` a body modifier (current IFPA posture) or a set primitive (some external sources)?
  - **affected tricks/operators**: barraging-osis (Red 2026-05-15: Baroque = Two dexes + Osis = 5), nemesis (IFPA `furious barfly` vs FM `Barraging Barfly` vs PB `Barraging far Double Down`), barfry, fission, genesis, janiwalker, clownface (Slice P/R candidates)
  - **current IFPA posture**: `barraging` is `kind='modifier'` body modifier; `MODIFIERS` semantic registry includes it
  - **external-source evidence**: Slice P + Slice Q found multiple cases where FM/PB use barraging as a set-initiator-style operator (similar to atomic)
  - **why needed**: nemesis-class compounds (furious vs barraging) hinge on this; barraging-X family discoverability depends on the class
  - **possible outcomes**: (a) confirm modifier (current); (b) reclassify as set primitive; (c) compound operator (modifier in some contexts, primitive in others)
  - **downstream files/surfaces affected**: `freestyleTrickKindOverrides.ts`, `semanticNotationRendering.ts`, Movement System axes
  - **priority**: HIGH
  - **wave**: Wave 2

---

## Comparative-reconciliation queue items (post–Wave-2)

These surfaced from Slices O–S + Pre-Red sweep + human-review triage but are NOT yet in the Wave 2 packet. The curator may want to add some to a future Wave 3.

### Y-Q1 — Atomic / illusioning conjecture

  - **topic**: pt4 ruled eggbeater = atomic legover. Slice P found FM AND PB both say "Illusioning Legover" for eggbeater (cross-source contest of the IFPA reading). Is there an "atomic family" vs "illusioning family" doctrine?
  - **affected tricks/operators**: eggbeater, omelette (atomic illusion), atom-smasher (atomic mirage; Red 2026-05-15 X-dex carry)
  - **current IFPA posture**: pt4-locked atomic-legover for eggbeater; pt2 + followup-2026-04 locked atomic-illusion for omelette
  - **external-source evidence**: 2 external sources agree on Illusioning Legover for eggbeater
  - **why needed**: cross-source disagreement on a pt-locked row; either IFPA's reading needs justification documentation OR a doctrine for when external consensus overrules pt
  - **priority**: MEDIUM
  - **wave**: Wave 2+

### Y-Q2 — Barfly branch-family promotion

  - **topic**: Slice O surfaced barfly as the single new structural branch-family candidate (4 descendants: blurriest, superfly, venom, nemesis). Should it be promoted to `FAMILY_DUAL_MEMBERSHIPS` like torque/blender/drifter?
  - **affected tricks/operators**: barfly + 4 descendants; tied to W2-Q6 (barraging operator class — nemesis is barraging-on-barfly)
  - **current IFPA posture**: barfly is `trick_family='infinity'`; 4 descendants reference barfly as their `trick_family`
  - **external-source evidence**: FM "Far Double Over Down" for barfly; PB "Clipper far Double Down"; FM technical names for descendants encode barfly compositionally
  - **why needed**: post Wave-2 W2-Q6, the operator class for nemesis resolves and barfly-family invariant becomes authorable
  - **priority**: MEDIUM
  - **wave**: Wave 2+

### Y-Q3 — Witchdoctor single-source reading

  - **topic**: Slice P found FM has "Atomic Symposium Mirage" for witchdoctor but PB is silent. Pre-Red sweep added the chain with `curatorConfirmPending=true` and kept witchdoctor in UNRESOLVED_COMPOUNDS. Does single-source FM warrant pill removal?
  - **affected tricks/operators**: witchdoctor
  - **current IFPA posture**: chain reading authored but provisional; pending pill retained
  - **external-source evidence**: FM only
  - **why needed**: extends the folk-stabilization threshold doctrine (W2-Q4) to the single-source case
  - **priority**: LOW
  - **wave**: Wave 2+

### Y-Q4 — Remaining unresolved compounds individual status

  - **topic**: per-row review of rev-up, surreal, montage, reaper, fury, surgery (6 remaining `UNRESOLVED_COMPOUNDS` pilot members)
  - **affected tricks/operators**: the 6 named rows
  - **current IFPA posture**: pending-pill on all 6; surreal + montage have chain entries (curatorConfirmPending=true); others have no chain
  - **external-source evidence**:
      - rev-up: PB "(downtime) Twisting near Pickup" — uses `twisting` which IFPA doesn't recognize
      - reaper: PB "Clipper far DSO" — uses `DSO` shorthand for double-switchover; IFPA-unrecognized
      - surreal: PB "Surging far Whirl" — surging is in UNRESOLVED itself
      - montage: PB "Spinning Ducking far Symp. Whirl" — structurally clean, Wave-2-paradox-dialect
      - fury: FM "Furious Mirage" vs PB "Barraging far Mirage" — tied to W2-Q6
      - surgery: PB silent; FM silent
  - **why needed**: each row needs an individual Wave-2 outcome (chain authoring, pill removal, structural reclassification)
  - **priority**: LOW
  - **wave**: Wave 2+

### Y-Q5 — DLO dual-family question

  - **topic**: Slice R + human-review noted double-leg-over appears in both mirage and legover families. Slice O classified it as borderline branch-family candidate (3 descendants: fog, smog, haze). Should DLO get `FAMILY_DUAL_MEMBERSHIPS` treatment like torque/blender/drifter?
  - **affected tricks/operators**: double-leg-over + 3 descendants
  - **current IFPA posture**: trick_family='legover' (DB); chain reading 'miraging legover' (pt4-locked)
  - **external-source evidence**: PB describes DLO compounds with both mirage and legover bases interchangeably
  - **why needed**: extends Slice M dual-membership pattern; depends on family-invariant authoring policy (post W2-Q1)
  - **priority**: MEDIUM
  - **wave**: Wave 2+

### Y-Q6 — ATW productive multiplicity

  - **topic**: pt8 community-stabilized productive-multiplicity rule has only 3 confirmed cases (DLO + double-around-the-world + double-spin). Should additional cases be canonical? double-ATW, triple-ATW, ATW-sole, ATW-toe variants are common in PB.
  - **affected tricks/operators**: double-ATW (already canonical), triple-ATW, ATW-sole, ATW-toe; productive-multiplicity rule generally
  - **current IFPA posture**: pt8 explicitly rejected productive-multiplicity except community-stabilized cases
  - **external-source evidence**: PB lists multiple "X-ATW" compounds confidently
  - **why needed**: opens or closes a long-tail addition cohort
  - **priority**: LOW
  - **wave**: Wave 2+

### Y-Q7 — Operator audit (eclipse / gyro / swirl / rake)

  - **topic**: are eclipse, double-knee, flying moves, gyro, swirl, rake operators? Body modifiers? Surface designations? Tricks? Slice R + human-review flagged each.
  - **affected tricks/operators**:
      - eclipse — currently has `trick_family='catwalk'` in DB; possibly a 3-ADD named compound, possibly a body-modifier
      - double-knee — possibly a no-plant / flying / midair example
      - flying — currently a body modifier or pseudonym?
      - gyro — already recognized as `kind='modifier'`; per memory "Mobius ≈ Gyro Torque" Red 2026-05-15 ruling
      - swirl — canonical base trick (core atom); listed under operator question by mistake?
      - rake — possibly a stall variant or body modifier; currently absent from IFPA
  - **current IFPA posture**: gyro confirmed modifier; eclipse a row but classification fuzzy; others uncategorized
  - **why needed**: closes the "no-plant / suspension / flying" axis expansion question and the body-modifier registry completeness
  - **priority**: MEDIUM
  - **wave**: Wave 2+

### Y-Q8 — No-plant / suspension family expansion

  - **topic**: Movement System axis 4 (No-Plant & Suspension) currently has only symposium. Should it include flying/midair examples like double-knee, eclipse?
  - **affected tricks/operators**: candidates from above audit
  - **current IFPA posture**: axis pilot = symposium only
  - **external-source evidence**: PB describes some flying tricks
  - **why needed**: Movement System axis 4 is structurally narrow; broadening requires curator-confirmed axis membership
  - **priority**: LOW
  - **wave**: Wave 2+

---

## Inventory by priority

| Priority | Count | Question IDs |
|---|---|---|
| HIGH | 3 | W2-Q1, W2-Q3, W2-Q6 |
| MEDIUM | 6 | W2-Q2, W2-Q4, W2-Q5, Y-Q1, Y-Q2, Y-Q5, Y-Q7 |
| LOW | 5 | Y-Q3, Y-Q4, Y-Q6, Y-Q8 |

**Total: 14 questions** (6 Wave 2 + 8 post-Wave-2 / Wave 2+).

## What's NOT in this registry

  - Questions already settled by pt1–pt12 + Wave 1 batch ruling 2026-05-15 — see `project_freestyle_state.md` for the durable-rulings table
  - Questions where the curator has already made an explicit decision (e.g., Slice S embodied-analogy observational-only contract)
  - Tooling / infrastructure questions (Diagnostic-details admin-gating; performance index work) — these are curator-decision items, not Red questions

## Recommended next action

1. Curator reviews this registry against the Wave 2 packet sent 2026-05-15 — confirm no Wave 2 item is missing.
2. Curator decides which Y-Q items belong to a future Wave 3 vs which can be resolved curator-side without Red.
3. After Wave 2 responses arrive, this registry is updated to mark which questions are answered + close them.

---

## End
