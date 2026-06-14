# Curator Packet — Blurry Transitivity

## Why this packet exists

"Blurry" is registered as a flat +1 set modifier, and its accepted decomposition is
"stepping + paradox" (= +2). Those two facts cannot both hold uniformly, and the dictionary
already encodes the contradiction: blurry-named compounds split into a +1 group and a +2
group. Red pt11 flattened the modifier to +1 and explicitly deferred the compounds that
break under that value to a pt12 follow-up that has not landed.

**The open question: is blurry +1 or +2, and what rule governs the split?**

This is the "blurry transitivity" thread. It is not about whether the moves exist; it is
about how the single naming element "blurry" maps onto ADD.

---

## The contradiction, in data

Every blurry compound is stored with `modifier_links = blurry` (the +1 registered modifier),
but the asserted ADDs split cleanly by base type:

| Compound | Base | Base type | Base ADD | Asserted | blurry = +1 | blurry = +2 (stepping+paradox) | Matches |
|---|---|---|---|---|---|---|---|
| Ripwalk | butterfly | non-rotational | 3 | 4 | 4 | 5 | **+1** |
| Blurriest | barfly | non-rotational | 4 | 5 | 5 | 6 | **+1** |
| Blur | mirage | rotational | 2 | 4 | 3 | 4 | **+2** |
| Blurry Whirl | whirl | rotational | 3 | 5 | 4 | 5 | **+2** |
| Blurry Torque | torque | rotational | 4 | 6 | 5 | 6 | **+2** |
| Food Processor (Blurry Blender) | blender | rotational | 4 | 6 | 5 | 6 | **+2** |

The split is exact: **blurry = +1 on non-rotational bases, +2 on rotational bases**
(mirage / whirl / torque / blender). This is structurally the same rotational-bonus pattern
that atomic carries (atomic +1 vs the retired +2-rotational reading).

(One outlier: Fog = stepping + paradox + double-leg-over (+2) on a non-rotational base. It is
a separately-contested case — Red pt5 left "Fog = stepping+paradox+dlo" vs "blurry+eggbeater"
unreconciled — so it is noted but not used as evidence for the base-type rule.)

---

## How this arose

- `blurry` registered in `trick_modifiers` as +1 (set). Red pt11 migrated its
  `add_bonus_rotational` from 2 to 1 ("+1 model"), joining the flat-+1 family
  (spinning / swirling / whirling).
- pt11 recorded the fallout verbatim: "Blur (4) rescued via the existing Stepping Paradox
  Mirage decomposition; Blurriest (5) improves; Ripwalk (4) unchanged (non-rotational);
  **Blurry Whirl (5) breaks under +1 — pt12 follow-up; Blurry Torque (6) breaks under +1 —
  pt12 follow-up**."
- Ripwalk was then re-decomposed (pt11) to "Stepping Butterfly" (+1, paradox rejected),
  confirming that ripwalk's "blurry" is really just stepping.
- The +2 compounds (Blur, Blurry Whirl, Blurry Torque, Food Processor) keep their asserted
  ADDs only via the explicit stepping + paradox (+2) reading, NOT via the +1 blurry modifier.

So the modifier value (+1) is now correct for the non-rotational compounds and silently wrong
for the rotational ones, which survive on a different decomposition than the modifier they
link to.

---

## What is settled

- `blurry` decomposes as stepping + paradox (Red pt10 / James adjudication: Blur = Stepping
  Paradox Mirage = 4).
- `blurry` is +1 on non-rotational bases (Ripwalk, Blurriest) — and Ripwalk = Stepping
  Butterfly is Red-ruled.
- The rotational blurry compounds (Blur, Blurry Whirl, Blurry Torque, Food Processor) carry
  ADDs that require +2.

---

## What is open

### Ruling 1 — Reconcile blurry +1 vs +2

#### Option A — blurry is +2 (stepping + paradox), uniformly

- Re-decompose all blurry compounds as stepping + paradox + base.
- Forces re-examining the non-rotational cases: Ripwalk and Blurriest would read +2 (5 and 6),
  contradicting their asserted 4 and 5 — so under A they are NOT "blurry" at all; they are
  stepping-only compounds wearing a folk "blurry" name (Ripwalk = Stepping Butterfly already
  confirms this).
- Net: "blurry" as a name means stepping+paradox; tricks that are only stepping should drop
  the blurry name.

#### Option B — blurry stays +1; rotational compounds decompose explicitly

- Keep the +1 modifier (matches non-rotational), and store the rotational blurry compounds via
  explicit `stepping | paradox` modifier links (+2), treating their "blurry" name as a folk
  compression that does NOT invoke the +1 modifier.
- Net: blurry the modifier is +1; blurry the name is sometimes a +2 stepping-paradox compound.

#### Option C — blurry is base-type-dependent (+1 / +2 rotational)

- Formalize "blurry = +1 non-rotational, +2 rotational" as the rule (the paradox direction-flip
  is only meaningful on a rotational dex). Mirrors the pre-migration atomic model that pt11 was
  trying to move away from.

---

## Impact

Rotational blurry compounds whose ADD currently depends on +2: Blur, Blurry Whirl, Blurry
Torque, Food Processor (Blurry Blender) — plus the contested Fog. Non-rotational: Ripwalk,
Blurriest. ~6-7 compounds, and the modifier's registered value, all turn on this ruling.

---

## Recommendation

The cleanest model is **Option A/B hybrid**: treat "blurry" as a folk naming layer rather than
a single arithmetic modifier, and decompose every blurry compound explicitly —
stepping + paradox (+2) where the paradox is real (the rotational set), stepping-only (+1)
where it is not (Ripwalk, Blurriest, which then shed the "blurry" label as a structural
reading and keep it only as a historical alias). This makes the math self-consistent without
a base-type-conditional modifier value, and it matches the direction Red already took with
Ripwalk = Stepping Butterfly.

The one thing Red must rule explicitly is the pt12 follow-up: **do Blurry Whirl (5) and Blurry
Torque (6) keep +2 via stepping+paradox** (Option A/B), **or does blurry carry a formal
rotational +2** (Option C)? Either way the rotational compounds need +2; the question is
whether that +2 lives in an explicit decomposition or in a base-type-conditional modifier
value (which the project is otherwise retiring, cf. the atomic migration).

---

## Audit provenance

ADDs and bases read from the live trick dictionary; modifier registration from
`freestyle_trick_modifiers` (blurry = 1/1/set after pt11). Doctrine history from the pt10/pt11
adjudication records and OPEN_QUESTIONS. The Blurry Whirl / Blurry Torque break under +1 is
pt11's own recorded pt12 deferral.
