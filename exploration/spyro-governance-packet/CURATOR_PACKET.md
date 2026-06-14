# Curator Packet — Spyro Governance

## Why this packet exists

The footbag.org corpus contains a Spyro cluster (Spyro Illusion, Spyro Mirage, Pandora /
Spyro Pickup, Spyro Whirl, Fairy Spyro Mirage; plus Paralax / Spyro Legover, already
canonical). These are tracked observationally but unpromoted because of one unresolved
question:

**What does "spyro" mean as a naming element?**

The answer determines whether the Spyro compounds are folk aliases of existing canonical
tricks, a re-read of a different operator, or a distinct family.

This packet does not ask whether the moves exist. They do. The question is only how
"spyro" maps onto the settled operator vocabulary.

---

## The three-way tension

### Reading A — Structural data: spyro = gyro

Every simple footbag.org "Spyro X" notation is byte-identical to the canonical `gyro-X`
compound:

| footbag.org "Spyro X" | Canonical `gyro-X` | ADD | Notation match |
|---|---|---|---|
| Spyro Illusion | gyro-illusion | 3 | identical |
| Spyro Mirage | gyro-mirage | 3 | identical |
| Pandora (Spyro Pickup) | gyro-pickup | 3 | identical |
| Paralax (Spyro Legover) | parallax (= Gyro Legover, canonical) | 3 | identical |
| Spyro Whirl | gyro-whirl | 4 | identical |

(Comparison notations, both `CLIP > (back) SPIN [BOD] > SAME … > …`.) Under this reading
spyro is simply an older folk name for gyro (back-spin, same-foot dex), and "Spyro X"
should be wired as aliases to the existing `gyro-X` canonicals — no new rows.

### Reading B — Red's naming: spyro = inspin

Red's standing guidance: "Spyro is a trick, not a general modifier; the name has largely
shifted toward Inspin." Inspin is a front-spin (`(front) SPIN`), a structurally different
move from the back-spin gyro forms above. Under this reading a modern trick called
"spyro X" denotes inspin-X, and wiring it to gyro would be wrong.

### Reading C — Distinct "plant-before-dex" variant

A stacked case shows a real divergence: Fairy Spyro Mirage
(`TOE > SAME OUT [DEX] > (back) SPIN [BOD] > OP IN [DEX] > OP TOE [DEL]`) differs from
canonical `fairy-gyro-mirage`
(`… > (back) SPIN [BOD] > SAME IN [DEX] > …`) by one dex-side (OP IN vs SAME IN): spyro
keeps the opposite side where gyro flips to same-side after the spin. This matches the
informal "spyro = plant-before-dex gyro" reading and would make spyro a distinct family,
not a pure gyro alias.

---

## What is settled

- `spyro` is a **1-ADD canonical trick** (a body primitive), NOT a registered modifier
  (spinning / gyro / inspinning are all registered +1; spyro is not).
- The simple Spyro forms match `gyro-X` exactly (table above).
- Paralax / Spyro Legover already resolves to `parallax` (= Gyro Legover).
- One Spyro compound is already folk-canonical: `genuphobia` = Fairy Spyro Symposium Torque.

---

## What is open

### Ruling 1 — How should "Spyro X" be treated?

#### Option A — spyro = gyro (folk alias)

- Wire Spyro Illusion / Mirage / Pickup (Pandora) / Whirl as **aliases** to the existing
  `gyro-illusion` / `gyro-mirage` / `gyro-pickup` / `gyro-whirl` canonicals.
- No new rows; the byte-identical notation is the justification.
- Most data-supported, but contradicts Red's "name shifted to inspin."

#### Option B — spyro = inspin

- "Spyro X" denotes inspin-X (front-spin); the back-spin footbag.org notations are then a
  historical mismatch and the modern name maps elsewhere.
- Honors Red's naming note but conflicts with every footbag.org Spyro notation (all back-spin).

#### Option C — spyro = distinct plant-before-dex variant

- Promote `spyro-X` as distinct rows (back-spin, opposite-side post-spin dex), justified by
  the Fairy Spyro Mirage divergence.
- Preserves the subtlety but multiplies near-duplicate rows against gyro.

---

## Impact

Affected cluster: Spyro Illusion, Spyro Mirage, Pandora (Spyro Pickup), Spyro Whirl,
Fairy Spyro Mirage. (Paralax / Spyro Legover already canonical as parallax.)

~5 observational tricks resolve from a single naming ruling.

---

## Recommendation

The structural data is unambiguous for the simple forms: footbag.org "Spyro X" IS
`gyro-X`. The cleanest resolution is **Option A** — treat spyro as a historical folk name
for gyro and wire the simple Spyro forms as aliases to the canonical `gyro-X` tricks — with
two reconciliations required before doing so:

1. **Red's "spyro -> inspin" note must be reconciled.** Most likely Red means the modern
   community label for this back-spin move is now "gyro/inspin" and "spyro" is the older
   name (i.e., spyro is a historical alias, consistent with Option A). Confirm this rather
   than assume it, because if "spyro" now actively denotes a front-spin (inspin) move, a
   record named "spyro X" would mis-resolve to gyro.
2. **The Fairy Spyro Mirage dex-side divergence** (Reading C) needs a per-compound check:
   either it is a notation transcription difference or spyro genuinely keeps the opposite
   side in stacked forms, which would carve out a narrow distinct case.

The ruling should be made at the naming level (what "spyro" denotes) and then applied
consistently, rather than adjudicating each Spyro compound individually.

---

## Audit provenance

Notations compared against the footbag.org 3/4-ADD pages (`exploration/fborg/`) and the live
trick dictionary's `gyro-X` rows. spyro modifier-registration status checked against
`freestyle_trick_modifiers` (absent). No Red pt-record resolves the spyro naming question.
