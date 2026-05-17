# ADD Analysis — Prose Draft (curator review before integration)

**Date**: 2026-05-17.
**Purpose**: ready-to-edit prose for the proposed `/freestyle/add-analysis` page (per `ADD_ANALYSIS_SECTION_PLAN.md`). Curator approves wording + cases before any glossary/hbs integration.

> Every "Settled by:" attribution below cites a specific Red ruling traceable in `project_freestyle_state.md`. Every "Pending:" item links to `RED_QUESTIONS_REGISTRY.md`. No fabricated formulas. No Wave 2 resolutions.

---

## Heading

**ADD Accounting & Analysis**

Subtitle: *How freestyle's difficulty system is constructed, where its components come from, and why sources sometimes count the same trick differently.*

---

## §1. How ADD is built

The ADD (Additional Degree of Difficulty) score measures how structurally demanding a trick is. It isn't a stylistic rating — it counts the mechanical components a trick is made of. Each component carries a contribution; the total is the trick's canonical ADD.

The components below are the most reliable building blocks. Some interactions are historically debated and shown in the discrepancy section below.

| Component | Typical contribution | Example |
|---|---|---|
| A stall on a recognized catch surface | 1 ADD | clipper-stall, toe-stall, neck-stall |
| A dexterity (one bag-foot interaction) | 1 ADD | hippy-in, leggy-out, the various dex variants |
| A specialized surface (head, shoulder, forehead, etc.) | 1 ADD | head-stall, shoulder-stall |
| Paradox / ducking / symposium / spinning / stepping | +1 ADD per modifier on most non-rotational bases | paradox-mirage = paradox (+1) + mirage (2) = 3 |
| Atomic | +1 on non-rotational bases · +2 on rotational bases | atom-smasher = atomic (+2 via X-dex) + mirage = 4 |
| Nuclear | +2 ADD — structurally = paradox + atomic | per pt10 ruling |
| Quantum | +1 ADD — the compressed form of atomic | per pt10 ruling |
| Blurry | +1 ADD — transitively expands to "stepping paradox" on most bases | per pt11 ruling |
| Same-side (ss) / far / near / reverse | +0 ADD (positional, not difficulty) | per Red 2026-05-11 + 2026-05-15 |

**The editorial-truth rule.** When a trick's stated ADD differs from what straight addition produces, the **stated value is canonical** and the additive calculation is diagnostic. This is the IFPA editorial contract. Trick rows whose stated value matches their additive calculation are the easy ones to discuss; rows where they diverge are usually flagged by a Red ruling that explains the divergence.

**Honest incompleteness.** Some compound tricks are folk-named — they exist in the community but their structural decomposition isn't yet curator-confirmed. Those rows carry a small "pending decomposition refinement" indicator on their dictionary card. They count as full tricks; their *structural reading* is what's pending, not their *existence*.

---

## §2. Worked examples

Eight examples, ordered from primitive to compound. Each shows: components → calculation → why.

### Clipper · 1 ADD

A 1-ADD body kick into clipper position. The whole trick is one component: the kick itself + the catch surface.

  - Components: clipper kick (1)
  - Total: 1 ADD
  - Notes: Foundational primitive. No modifier surface; no dexterity.

### Mirage · 2 ADD

The 2-ADD rotational base. The mirage is structurally a dex pattern around a rotational pivot.

  - Components: mirage rotation (2)
  - Total: 2 ADD
  - Notes: One of the foundational rotational anchors. Compounds (paradox-mirage, atom-smasher) build on it.

### Whirl · 3 ADD

The 3-ADD rotational base. Whirl is the family anchor for ~17 derivative compounds (whirl-family at three+ ADD all the way through compound flagships like montage).

  - Components: whirl rotation (3)
  - Total: 3 ADD

### Butterfly · 3 ADD

The 3-ADD anchor for the entire walking-family progression (dimwalk, ripwalk, sidewalk, bigwalk, parkwalk).

  - Components: butterfly rotation (3)
  - Total: 3 ADD

### Osis · 3 ADD

The 3-ADD anchor for one of the most generative families in the dictionary. Two important branch compounds — Torque and Blender — are its 4-ADD derivatives, and each spawns its own family.

  - Components: osis rotation (3)
  - Total: 3 ADD
  - Notes: Settled by pt11 as the anchor for "miraging osis = torque" and "whirling osis = blender".

### Torque · 4 ADD

Torque is "miraging osis" — a compound base in its own right, but structurally one canonical reading of the IFPA-locked decomposition. *Settled by pt11.*

  - Components: miraging (+1) + osis (3)
  - Total: 4 ADD
  - Notes: Anchors its own branch family (paradox-torque, spinning-torque, mobius, gauntlet, atomic-torque, blurry-torque, grave-digger, spinal-tap). When you see a row with `base_trick='torque'`, you're seeing a compound on a compound base.

### Blurry Whirl · 5 ADD

Blurry as a modifier transitively expands to "stepping paradox" — settled by pt11 + Wave 1 2026-05-15. The trick blurry-whirl reads as stepping-paradox-whirl at the structural level.

  - Compressed reading: blurry (+1) + whirl (3) = 4? *No — blurry's contribution is transitively unfolded.*
  - Expanded reading: stepping (+1) + paradox (+1) + whirl (3) = 5 ADD
  - Total: 5 ADD
  - Notes: Pedagogically important. The compressed name "blurry whirl" and the expanded reading "stepping paradox whirl" describe the same trick at different stopping depths. Both are correct.

### Mobius · 5 ADD

Mobius is the dictionary's flagship multi-depth example. Two valid stopping depths reach the same total:

  - **Compact (gyro torque)**: gyro (+1) + torque (4) = 5 ADD
  - **Deep (spinning ss miraging osis)**: spinning (+1) + ss (+0) + miraging (+1) + osis (3) = 5 ADD

Both readings describe the same trick. The community uses the shortest form (*mobius*) in speech, but neither deep reading is wrong. The language picks its own stopping point.

---

## §3. ADD Discrepancies & Why They Happen

Different sources count the same trick differently. The reasons fall into a small number of recognizable patterns. Below are real cases — each with the IFPA reading, the external reading, and the mechanical interpretation that changes the count. None of these mean any source is "wrong" — they are differing interpretations or differing decomposition assumptions.

For each case: **IFPA status** marks whether the discrepancy is settled or pending.

---

### Hurl (Nuclear ss Whirl) — Δ -1

  - IFPA: 5 — nuclear (+2) + whirl (3) + ss (+0)
  - FM: 4 — same components but FM doesn't account for the same-side positional consistently
  - Pattern: **positional operator** — IFPA treats `ss` as +0 (Red 2026-05-11 universal); some external decompositions historically gave positional terms a difficulty bonus
  - IFPA status: **settled** by Red 2026-05-11 SS-universal-zero ruling

---

### Barfry (Nuclear ss Butterfly) — Δ -1

Same SS pattern as Hurl with the butterfly base.

  - IFPA: 5 — nuclear (+2) + butterfly (3) + ss (+0)
  - FM: 4
  - Pattern: **positional operator** (same as Hurl)
  - IFPA status: **settled** by Red 2026-05-11

---

### Godzilla (Nuclear ss Dyno) — Δ -1

Same SS pattern on dyno base.

  - IFPA: 6 — nuclear (+2) + dyno (4) + ss (+0)
  - FM: 5
  - Pattern: **positional operator** (same as Hurl)
  - IFPA status: **settled** by Red 2026-05-11

---

### Blurry Whirl ≡ Stepping Paradox Whirl

Two readings; one ADD. The compressed form ("blurry whirl") and the expanded form ("stepping paradox whirl") describe the same trick.

  - Either reading: 5 ADD
  - Pattern: **compression vs expansion** — the trick has multiple legitimate stopping depths
  - IFPA status: **settled** by pt11 + Wave 1 2026-05-15

---

### Blurry Torque ≡ Stepping Paradox Torque

Same compression pattern, applied to a compound base.

  - Either reading: 6 ADD
  - Pattern: **compression vs expansion** (transitively applies to compound bases per Wave 1 2026-05-15)
  - IFPA status: **settled**

---

### Food Processor ≡ Stepping Paradox Blender

The trick's folk name is itself a compression. Both the surface name and the structural reading reach 6 ADD.

  - Folk name: Food Processor (6 ADD)
  - Structural: stepping paradox blender — stepping (+1) + paradox (+1) + blender (4) = 6 ADD
  - Pattern: **compression vs expansion** on a compound base (blender = whirling osis is itself compound)
  - IFPA status: **settled** by Wave 1 2026-05-15

---

### Mobius ≡ Gyro Torque ≡ Spinning ss Miraging Osis

Two stopping depths; same 5 ADD.

  - Compact: gyro (+1) + torque (4) = 5
  - Deep: spinning (+1) + ss (+0) + miraging (+1) + osis (3) = 5
  - Pattern: **stopping-depth ambiguity** — community uses the shortest form
  - IFPA status: **settled** by pt11

---

### Atom Smasher ≡ Atomic Mirage — hidden X-dex

The arithmetic-only reading would be atomic (+1 non-rotational on mirage) + mirage (2) = 3. But atom-smasher carries an implicit X-dex from a toe that adds +1 ADD, giving 4.

  - IFPA: 4
  - Structural read: atomic + mirage + hidden X-dex = 4
  - Pattern: **hidden mechanism** — the "atomic +1 vs +2" interpretation depends on whether an X-dex is being carried
  - IFPA status: **settled** by Red 2026-05-15 (X-dex carry from a toe)
  - *Note:* Wave 2 Q3 will refine the general X-dex preservation rule.

---

### Baroque (Barraging Osis) — Two dexes + Osis

Barraging's contribution to Baroque is structural — it multiplies the dex count rather than adding as a body modifier.

  - IFPA: 5 — two dexes (+2) + osis (3) = 5
  - Pattern: **operator-class** — barraging acts as a structural dex-multiplier in this position, not as an additive modifier
  - IFPA status: **settled** by Wave 1 2026-05-15
  - *Note:* Wave 2 Q6 will resolve barraging's general operator-class question (modifier vs structural) across other compounds.

---

### Bladerunner (FM "Atomic Eggbeater") — Δ +1

FM names Bladerunner as "Atomic Eggbeater". But IFPA's eggbeater is already atomic legover (settled by pt4). FM's name applies atomic recursively; IFPA's canonical math doesn't.

  - IFPA: 4 — atomic (+1 non-rotational) + legover (3)
  - FM: 5 — "Atomic Eggbeater" treated as a fresh atomic application
  - Pattern: **recursive operator application** — FM permits applying an operator that's already structurally present; IFPA's canonical math doesn't
  - IFPA status: **settled** by pt4

---

### Edge cases mentioned briefly

  - **Sumo (Nuclear Mirage)** — 5 ADD via a named X-Dex exception (pt9). Pt9 ruled that certain nuclear-mirage compounds carry an implicit X-Dex similar to atom-smasher.
  - **Genesis (FM "Furious Whirl")** — IFPA 5, FM 7. Δ +2. The FM reading reflects FM's earlier rotational-escalation convention, which IFPA retired in pt10 (rotational bases get a flat +1 per modifier rather than progressive scaling).

---

## §4. Interpretation notes

**Asserted ADD is editorial truth.** When a trick's stated ADD diverges from the additive calculation, the stated value is canonical and the calculation is diagnostic. This rule is what makes the system stable — a row's ADD doesn't shift when the operator vocabulary refines.

**The system is incomplete by design.** Some compound tricks are folk-named without a curator-confirmed structural reading. Those rows carry a small "pending decomposition refinement" indicator on their card. They count; their structural decomposition is what's pending.

**Why disagreements exist.** Three recurring reasons:

  1. **Positional vs additive** — same-side, far, near, and reverse are positional cues in IFPA's framing (Red 2026-05-11). Some external sources count them as ADD-additive.
  2. **Compression vs expansion** — many tricks have multiple legitimate stopping depths. Players use the shortest folk name; analysts may unfold to deeper structural readings. Both arrive at the same ADD.
  3. **Historical evolution** — the operator vocabulary has refined over time. Earlier conventions (rotational escalation, recursive atomic application) produce different totals than the modern post-pt10 + pt11 + Wave 1 conventions.

**Where to go next**: [Trick Dictionary](/freestyle/tricks) · [Glossary §7 (Symbolic Notation)](/freestyle/glossary#symbolic-notation) · [History](/freestyle/history) · [Coverage audit](/internal/coverage) *(if shipped)*.

---

## End of prose draft

**Cases vetted IN this draft (10)**: Hurl, Barfry, Godzilla, Blurry Whirl, Blurry Torque, Food Processor, Mobius, Atom Smasher, Baroque, Bladerunner.

**Edge-case brief mentions (2)**: Sumo, Genesis.

**Cases EXPLICITLY EXCLUDED (5 deferred to post-Wave-2)**:
  - Eggbeater (atomic vs illusioning; Y-Q1)
  - Nemesis (furious vs barraging; W2-Q6)
  - Witchdoctor (atomic-symposium interaction; W2-Q3)
  - Surreal (UNRESOLVED_COMPOUNDS pilot member; W2-Q4)
  - Fairy-led compounds as a cohort (W2-Q1)

---

## Next step for the curator

1. Read this draft top-to-bottom.
2. Edit any phrasing — the page hasn't been integrated; this is pure text.
3. When approved, hand off to the implementation phase per `ADD_ANALYSIS_SECTION_PLAN.md` §6 (Phase 1 — single slice, ~450 lines, no Wave 2 dependencies).
