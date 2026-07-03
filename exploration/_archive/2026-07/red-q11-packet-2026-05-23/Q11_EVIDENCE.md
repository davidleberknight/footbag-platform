# Q11 — Evidence rows

The full 17-row clean-cohort table the question is based on. Each row is
a PassBack trick whose move name decomposes cleanly into stable
vocabulary; the "IFPA add-up" column is the sum of IFPA-side weights
for each part (base trick + modifier + positional).

The gap (PB minus IFPA-add-up) is always negative — PB is always lower.
Never the same direction reversed.

---

## Gap = +1 cohort (3 rows)

These three are the Wave 7 pilots already shipped as documented
divergences. Currently labeled "PassBack historically rates this at N
ADD; the IFPA-grammar derivation gives M."

| PB trick | PB notation | PB total | IFPA add-up | Gap | Derivation |
|----------|-------------|---------|-------------|-----|------------|
| `blurrage` | Stepping far Barrage | 3 | **4** | +1 | stepping(+1) + barrage(3) |
| `predator` | Atomic far DLO | 3 | **4** | +1 | atomic(+1 non-rot) + dlo(3) |
| `schmoe` | Stepping near Legover | 2 | **3** | +1 | stepping(+1) + legover(2) |

## Gap = +2 cohort (7 rows)

| PB trick | PB notation | PB total | IFPA add-up | Gap | Derivation |
|----------|-------------|---------|-------------|-----|------------|
| `flare` | Symp. Whirling far Mirage | 2 | **4** | +2 | symposium(+1) + whirling(+1) + mirage(2) |
| `gdlo` | Gyro DLO | 2 | **4** | +2 | gyro(+1) + dlo(3) |
| `pandora-s-box` | Gyro Pickup | 1 | **3** | +2 | gyro(+1) + pickup(2) |
| `slapdown` | Quantum near Butterfly | 2 | **4** | +2 | quantum(+1) + butterfly(3) |
| `spikehammer` | Stepping Ducking Mirage | 2 | **4** | +2 | stepping(+1) + ducking(+1) + mirage(2) |
| `swifter` | Stepping far Swirl | 2 | **4** | +2 | stepping(+1) + swirl(3) |
| `whirlwalk` | Whirling far Whirl | 2 | **4** | +2 | whirling(+1) + whirl(3) |

## Gap = +3 cohort (6 rows)

| PB trick | PB notation | PB total | IFPA add-up | Gap | Derivation |
|----------|-------------|---------|-------------|-----|------------|
| `darkwalk` | Pixie Diving near Butterfly | 2 | **5** | +3 | pixie(+1) + diving(+1) + butterfly(3) |
| `golden-shower` | Stepping Ducking far Symp. Eggbeater | 3 | **6** | +3 | stepping(+1) + ducking(+1) + symposium(+1) + eggbeater(3) |
| `gybas` | Stepping far Dyno | 2 | **5** | +3 | stepping(+1) + dyno(4) |
| `mortal-kombat` | Stepping Ducking far Grifter | 2 | **5** | +3 | stepping(+1) + ducking(+1) + grifter(3) |
| `reactor` | Atomic far Whirl | 2 | **5** | +3 | atomic(+2 rot) + whirl(3) |
| `whirlygig` | Stepping far Symp. Whirl | 2 | **5** | +3 | stepping(+1) + symposium(+1) + whirl(3) |

## Gap = +5 cohort (1 row — possibly a data typo)

| PB trick | PB notation | PB total | IFPA add-up | Gap | Derivation |
|----------|-------------|---------|-------------|-----|------------|
| `colossus` | Spinning Diving near Symp. Whirl | 1 | **6** | +5 | spinning(+1) + diving(+1) + symposium(+1) + whirl(3) |

---

## A few rows worth special attention

These are the rows that most distinguish between the four hypotheses
on the question page:

- **`gdlo` (Gyro DLO) and `pandora-s-box` (Gyro Pickup)** — both have
  exactly **one modifier** and **no positional** (no far/near). The
  +2 gap on both can't come from a positional-weight disagreement.
  It must be either in the `gyro` modifier itself, or in how PB scores
  the base trick. Strongest test for hypothesis **C** (different
  formula): if `gyro` is +0 in PB but +1 in IFPA, both rows close
  exactly.

- **`darkwalk` (Pixie Diving near Butterfly)** — three add-ons and a
  +3 gap. Strongest test for whether modifiers stack with diminishing
  returns in PB (hypothesis **C** sub-form A).

- **`colossus` (Spinning Diving near Symp. Whirl)** — gap +5 is too
  extreme for normal modifier-disagreement; either a PB data error
  (typo in the book), or evidence that PB treats some folk-named
  tricks as essentially atomic (1 ADD regardless of formula). Either
  outcome is informative. If you can recall whether "Colossus" is a
  long-established trick name, that alone clarifies a lot.

- **`whirlwalk` (Whirling far Whirl)** and **`swifter` (Stepping far
  Swirl)** — clean, simple two-part compositions. Both gap +2. Useful
  for sanity-checking whether the gap mechanism is fundamentally
  about base trick weights vs modifier weights.

---

## What's NOT in this cohort

Worth knowing for context:

- **Tricks PB and IFPA agree on** — these exist (about 30 vocab-clean
  rows total; 13 of those have already-aligned ADD values per IFPA-side
  numbers — they're not in this 17-row "clean disagreement" cohort).
  So the disagreement isn't universal; whatever convention is in play
  applies to a **subset** of tricks.

- **Tricks where PB's reading is ambiguous** — about 13 more rows
  where the move name parses to multiple readings. Those aren't in
  this cohort because the ambiguity confounds the comparison; we're
  only showing clean-parse rows.

- **Tricks where PB lists no ADD value** — about 37 rows. Not part of
  the analysis at all.

The 17 rows here are the cleanest comparison set we could pull —
single readings, stable vocabulary, both totals known. They're the
strongest evidence we have for the same-direction pattern.

— end —
