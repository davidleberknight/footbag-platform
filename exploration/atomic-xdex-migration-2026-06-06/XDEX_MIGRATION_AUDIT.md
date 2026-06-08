# Atomic / Quantum / Sailing / Frantic — X-Dex Migration Audit

Audit only. **No data, code, or content has been changed.** This confirms exactly which totals move under Red's final doctrine before any migration runs.

## Final doctrine (Red)

1. Atomic is always +1 (never a 2-ADD set).
2. Quantum follows the same X-Dex rule as Atomic.
3. Qualifying sets (trigger an X-Dex on the following far dex): **Atomic, Quantum, Sailing, Frantic**.
4. The X-Dex attaches to the **following far dex**, not to the set.
5. **Far Mirage, Illusion, Whirl, Torque, Drifter receive X-Dex.**
6. **Swirl, Barfly, Down moves do not receive X-Dex.**

## Derivation reduces to a per-compound delta

`new_total = set(+1 for atomic/quantum; +2 for sailing/frantic) + intermediate modifiers + base + X-Dex(+1 iff base ∈ {mirage, illusion, whirl, torque, drifter})`

Against the old model (`atomic +2 on rotational {whirl, mirage, torque, swirl}, else +1; quantum +1 always, no X-Dex`):

| set | base | old | new | Δ |
|---|---|---|---|---|
| atomic | mirage / whirl / torque | +2 | +1 +X-Dex | **0** (re-attributed) |
| atomic | **swirl** | +2 | +1 (no X-Dex) | **−1** |
| atomic | **illusion / drifter** | +1 | +1 +X-Dex | **+1** |
| atomic | other (osis, butterfly, …) | +1 | +1 | 0 |
| quantum | **mirage / whirl / torque / illusion / drifter** | +1 | +1 +X-Dex | **+1** |
| quantum | other (swirl, butterfly, down, …) | +1 | +1 | 0 |

Base ADDs used: mirage 2, illusion 2, whirl 3, torque 4, swirl 3, drifter 3, osis 3, butterfly 3.

---

## A — No score change (re-attribution only) — 32 compounds

Total preserved; only the **decomposition string / prose** changes (`atomic(+2 rot)` → `atomic(+1) + … + X-Dex(+1)`). No `adds` / `provisionalAdd` edit.

- **Atomic + receive base (the bonus moves set→X-Dex):** `atomic-mirage` (4), `atomic-ducking-mirage` (5), `atomic-symposium-mirage` (5), `atomic-whirl` (5), `atomic-ducking-whirl` (6), `atomic-symposium-whirl` (6), `atomic-torque` (6), `atomic-ducking-torque` (7), `atomic-gyro-torque` (7).
  - **Resolves the old "silo" open case:** `atomic-torque = 6` now reads cleanly as atomic(1) + torque(4) + X-Dex(1), no "construction-specific element" hand-wave.
- **Atomic + non-receive base (already +1, untouched):** `atomic-osis`, `atomic-butterfly`, `atomic-inspinning-butterfly`, `atomic-miraging-butterfly`, `atomic-barrage`, `atomic-clipper`, `atomic-eclipse`, `atomic-flail`, `atomic-blender`, `atomic-ducking-blender`, `atomic-eggbeater`, `atomic-guay`, `atomic-reverse-guay`, `atomic-legover`, `atomic-pickup`.
- **Quantum + non-receive base (no X-Dex):** `quantum-butterfly`, `quantum-osis`, `quantum-eclipse`, `quantum-eggbeater`, `quantum-blender`, `quantum-legover`, `quantum-pickup`, `quantum-double-over-down` (down → correctly no X-Dex).

---

## B — Score change — 13 compounds (exactly these totals move)

**Primarily Quantum (9 of 13), all +1** — Quantum gaining X-Dex is the dominant effect:

| slug | old → new | layer |
|---|---|---|
| `quantum-mirage` | 3 → **4** | canonical |
| `quantum-whirl` | 4 → **5** | canonical |
| `quantum-torque` | 5 → **6** | canonical |
| `quantum-illusion` | 3 → **4** | canonical |
| `quantum-drifter` | 4 → **5** | canonical |
| `quantum-gyro-mirage` | 4 → **5** | canonical |
| `quantum-symposium-mirage` | 4 → **5** | canonical |
| `quantum-symposium-whirl` | 5 → **6** | canonical |
| `quantum-ducking-whirl` | 5 → **6** | canonical |

**Atomic (4 of 13)** — the doctrine's edges:

| slug | old → new | Δ | reason | layer |
|---|---|---|---|---|
| `atomic-illusion` | 3 → **4** | +1 | illusion now receives X-Dex (was non-rotational +1) | canonical |
| `atomic-drifter` | 4 → **5** | +1 | drifter now receives X-Dex | observational |
| `atomic-swirl` | 5 → **4** | −1 | swirl excluded from X-Dex (old model wrongly gave +2-rot) | observational |
| `atomic-reverse-swirl` | 5 → **4** | −1 | swirl excluded from X-Dex | observational |

**Net:** 11 increase (+1), 2 decrease (−1). **10 canonical** (edit `freestyle_tricks.adds`), **3 observational** (regenerate `provisionalAdd` via the generator).

---

## C — Unresolved edge cases (do not score yet)

1. **Sailing — qualifying but effectively unscored.** Every `sailing-*` compound is `low_confidence` / `alias` except `sailing-clipper` (`promotion_ready`, add=2, but its decomposition `"sailing(2) = 2"` is malformed — missing the clipper base, should be ~4). Sailing = Pixie+Quantum (+2); once scored, `sailing + {mirage, illusion, whirl, torque, drifter}` takes X-Dex. Fix the `sailing-clipper` decomposition and decide sailing scoring as a batch — not in this migration.
2. **Frantic — not canonical.** `frantic` has no `freestyle_tricks` row (Holden-only set, reads as pixie-quantum). All `frantic-*` are `low_confidence` / `alias`. Qualifying per Red, but there is no total to move until frantic is scored; defer.
3. **Near / far distinction.** Doctrine point 5 specifies **far** Mirage/Illusion/Whirl/Torque/Drifter. The scored B/A compounds are the far/named variants. Same-side / near variants (`atomic-near-butterfly`, `quantum-near-butterfly`, `sailing-ss-mirage`, the `*-ss-*` set) are all unscored; when scored, a **near** receive-base must NOT take X-Dex. Flag at scoring time.
4. **`atomic-miraging-butterfly` (currently A).** Base is butterfly (no X-Dex), but the `miraging` modifier may introduce a far-mirage dex that qualifies. Confirm with Red whether `miraging` is a far-mirage dex (would make it +1) or a pure modifier (stays 5).
5. **Down-move compounds, separately unresolved.** `atomic-double-over-down`, `atomic-far-double-down`, `sailing-dod`, `quantum-far-double-down`, etc. are `doctrine_unresolved`. X-Dex correctly excludes them (down moves), but their own double-down doctrine is a separate open question; leave parked.

---

## Bottom line

The audit confirms **exactly 13 totals move** (the §B table): 9 Quantum +1, atomic-illusion +1, atomic-drifter +1, atomic-swirl −1, atomic-reverse-swirl −1. Everything else (32 compounds) is **total-preserving re-attribution** (decomposition prose only). Sailing/Frantic and the near/far + miraging-butterfly + down-move questions stay in C, unscored, pending separate rulings.

When you greenlight the migration, the change-set is: **10 canonical `adds` edits**, **3 observational `provisionalAdd` regenerations**, and the **re-attribution prose sweep** across the inventory in the earlier `MIGRATION_MEMO.md` (parser `add_bonus_rotational` for atomic → +1, the X-Dex emission for the five far dexes, quantum gains the X-Dex trigger, and the doctrine/glossary text).
