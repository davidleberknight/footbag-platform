# Furious / Barraging / Quantum — X-Dex Re-run (2026-06-20)

**Read-only audit. No data changes.** Re-runs the furious, barraging, and quantum bands against the
resolved X-Dex doctrine (`RED_RESOLVED_CANON §D.5`; companion to `ATOMIC_QUANTUM_NUCLEAR_READINESS.md`
and `XDEX_RULING_DELTA.md`). Goal: show that eligible receiver bases exist in these bands but **no row
is authored as a far-form variant**, so no row gains X-Dex today, and the old "auto-fire on every
receiver" model is rejected here too.

**Scope guard (read this first).** This audit establishes what the **current corpus** does. It does
**not** adjudicate what the doctrine would assign to a far variant that does not yet exist (see §4).
The corpus-detection test in §1 is an audit heuristic, not doctrine.

## 1. Method

Each row is tested in two steps. A row gains X-Dex only if **both** the doctrinal conditions hold; the
audit's job is to find which rows already satisfy them in the corpus as authored.

### Receiver-eligibility test (doctrine; necessary, not sufficient)
The dex base must be one of the five eligible receivers:

> **`{ mirage, illusion, whirl, torque, drifter }`**

Non-receivers never fire: `{ swirl, butterfly, barfly, down / DOD }`, and likewise every other base
present in these bands (`osis, legover, eggbeater, pickup, blender, eclipse, flail, guay,
double-leg-over, barrage`). Eligibility is a property of the **dex base**, never of an inserted
modifier and never of the set operator.

### Far-form trigger test (doctrine) vs. corpus detection (audit heuristic)
**Doctrine (§D.5):** an eligible receiver earns X-Dex only when the compound performs an explicit
**far** receiver dex — the extra outside-then-inside reach the canon records as the atom-smasher
pattern (`... OP OUT [DEX] > OP IN [DEX] [XDEX] ...`). The **near / default** single-receiver-dex form
does not. Red's worked examples pin the boundary: Atomic Illusion (Omelette) = 3 (near) and Atomic
Torque (Silo) = 5 (near) score no X-Dex; only Atom Smasher (atomic far mirage = 4) does.

**Audit heuristic (this re-run only — NOT doctrine):** to decide whether a row in the corpus is
*already authored* as a far-form variant, the audit looks for an `[XDEX]` token in
`operational_notation` and/or an asserted ADD that exceeds operator + base. Absent both, the row is not
authored as far-form. This heuristic detects authoring state; it is **not** the doctrinal definition of
far-form, and it says nothing about whether an as-yet-unwritten far variant would qualify. Treating the
heuristic as the doctrine would over-claim.

## 2. Band results

### Furious — 0 receivers, 0 far-form
No compound rows exist. The only row is the base `furious` (2 ADD, inactive), itself a two-dex set
operator, not a receiver. Nothing in the band can carry X-Dex.

### Barraging — 3 eligible (all near), 0 authored far-form

| Eligible receiver base (NEAR — no fire) | ADD = operator + base | Non-receiver (never eligible) |
|---|---|---|
| `barraging-illusion` | 4 = barraging 2 + illusion 2 | `barraging-barfly` (6), `barraging-barfly-swirl` (7), `barraging-butterfly` (5), `barraging-double-leg-over` (5), `barraging-eggbeater` (5), `barraging-legover` (4), `barraging-osis` (5), `barraging-pickup` (4), `barrage` (3, set base) |
| `barraging-mirage` | 4 = barraging 2 + mirage 2 | |
| `barraging-whirl` (inactive) | 5 = barraging 2 + whirl 3 | |

Every receiver row's ADD already equals operator + base with no +1; none carries `[XDEX]`.

### Quantum — 9 eligible (all near), 0 authored far-form
The nine receiver rows are exactly the "9 quantum +1" cohort the aggressive 2026-06-06 model wanted to
auto-fire.

| Eligible receiver base (NEAR — no fire) | ADD = operator + base |
|---|---|
| `quantum-mirage` | 3 = quantum 1 + mirage 2 |
| `quantum-illusion` | 3 = quantum 1 + illusion 2 |
| `quantum-whirl` | 4 = quantum 1 + whirl 3 |
| `quantum-drifter` | 4 = quantum 1 + drifter 3 |
| `quantum-torque` | 5 = quantum 1 + torque 4 |
| `quantum-gyro-mirage` | 4 = quantum 1 + gyro 0 + mirage 2 (gyro is a body modifier, +0 here) |
| `quantum-symposium-mirage` | 4 = quantum 1 + symposium 1 + mirage 2 |
| `quantum-symposium-whirl` | 5 = quantum 1 + symposium 1 + whirl 3 |
| `quantum-ducking-whirl` | 5 = quantum 1 + ducking 1 + whirl 3 |

Non-receiver quantum rows (never eligible): `quantum-butterfly` (4), `quantum-butterfly-swirl` (5),
`quantum-blender` (5), `quantum-osis` (4), `quantum-eggbeater` (4), `quantum-legover` (3),
`quantum-double-leg-over` (4), `quantum-double-over-down` (5, inactive), `quantum-pickup` (3),
`quantum-eclipse` (4), `quantum-flail` (4), `quantum-guay` (3), `pixie-quantum-butterfly` (5),
`pixie-quantum-legover` (4).

Every receiver row's ADD already equals operator + base with no +1; none carries `[XDEX]`.

## 3. Important clarification: outward direction is not the trigger

The most likely misread is treating an **outward** (`OP OUT`) dex as "far." It is not.

`quantum-illusion` (`TOE > OP IN [DEX] > OP OUT [DEX] > OP TOE [DEL]`, 3 ADD) and `barraging-illusion`
(`... OP OUT [DEX] > OP TOE [DEL]`, 4 ADD) carry an outward dex because **illusion's own dex is
outward** (illusion is the reverse-direction counterpart of mirage). That outward direction is the
receiver's single near dex, not an extra far reach. Red's worked example fixes illusion in this slot at
the near value (Atomic Illusion = 3, no X-Dex).

**Far form requires the additional outside-then-inside receiver structure** (the atom-smasher
double-dex that earns its own `[XDEX]`), not merely an outward or illusion-direction dex. Direction
(`IN` / `OUT`, `SAME` / `OP`) and far-form are independent axes; only the extra far receiver structure
triggers X-Dex.

## 4. Conclusion

### What this establishes
Across all three bands, **12 rows carry an eligible receiver base** (9 quantum + 3 barraging; furious
0) and **none is authored as a far-form variant**. Each receiver row is the near/default single-dex
construction whose ADD already equals operator + base, and none carries `[XDEX]`. So **no current
furious / barraging / quantum row gains X-Dex under §D.5.** This independently rejects the old auto-fire
model for these bands (the "9 quantum +1" in particular): those nine are receiver-eligible but **near**,
and correctly score operator + base with no bonus.

### What this does NOT establish (open)
This audit does **not** prove that a future far variant would, or would not, receive X-Dex. The
following are unresolved and are not adjudicated here:

- **`Furious Far Mirage`, `Barraging Far Mirage`, `Quantum Far Mirage`** (and the analogous
  far-`{illusion, whirl, torque, drifter}` variants) — none exists in the corpus, so the audit is
  silent on their score.
- **Operator-applicability of X-Dex beyond atomic.** §D.5's worked examples (Silo, Atom Smasher,
  Atomic Illusion) are all *atomic*. Whether the furious / barraging / quantum operators produce a
  qualifying far receiver dex, and whether X-Dex attaches the same way it does on atomic, is not ruled.

A +1 X-Dex would apply to one of these bands only if such a far variant is **explicitly authored** and
its operator-applicability is settled — a per-row governance / authoring call (and, for the
non-atomic operators, plausibly a Red question), not a consequence of the receiver base alone.
