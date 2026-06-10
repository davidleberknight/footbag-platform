# Dry-run: missing canonical targets that blocked obvious orphan mappings

DRY-RUN ONLY. Nothing written to the dictionary. Each row is a candidate canonical
the first-pass orphan reduction tried to alias to but which does not exist yet.
ADD math verified as bracket-count == ADD. Dex counts cross-check the PassBack
dex_count column.

## Group 1 — multiplicity (double/triple of an existing atom): clean derivations

| Canonical (slug) | Aliases | JOB notation | ADD math | Evidence | Unlocks |
|---|---|---|---|---|---|
| **Double Illusion** `double-illusion` | delusion, double illusion | `SET > OP OUT [DEX] > OP OUT [DEX] > OP TOE [DEL]` | dex(2)+toe-stall(1)=**3** | PassBack "double-dex Illusion" (dex 2); illusion base | Delusion |
| **Double Whirl** `double-whirl` | whirr, double whirl | `SET > OP IN [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]` | dex(2)+clipper-stall(2)=**4** | PassBack "double-dex Whirl" (dex 2); **fborg-4add "double whirl"**; whirl base | Whirr |
| **Triple Swirl** `triple-swirl` | cardinal swirl, triple swirl | `CLIP > SAME BACK SWIRL [DEX] > SAME BACK SWIRL [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` | dex(3)+clipper-stall(2)=**5** | PassBack "triple-dex Swirl" (dex 3); swirl base | Cardinal Swirl |
| **Triple Mirage** `triple-mirage` | triage, triple mirage | `SET > OP IN [DEX] > OP IN [DEX] > OP IN [DEX] > OP TOE [DEL]` | dex(3)+toe-stall(1)=**4** | PassBack "triple-dex Mirage" (dex 3); mirage base | Triage |

## Group 2 — atomic-prefix compounds (atomic chassis + base): clean derivations

Chassis = atomic-butterfly form `TOE > OP OUT [DEX] > ...`; atomic non-rotational = +1.

| Canonical (slug) | Aliases | JOB notation | ADD math | Evidence | Unlocks |
|---|---|---|---|---|---|
| **Atomic Whirl** `atomic-whirl` | reactor, atomic whirl | `TOE > OP OUT [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]` | atomic(1)+whirl(3)=**4** | PassBack "Atomic far Whirl" (dex 2) | Reactor |
| **Atomic Blender** `atomic-blender` | ego, atomic blender | `TOE > OP OUT [DEX] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` | atomic(1)+blender(4)=**5** | PassBack "Atomic far Blender" (dex 2) | Ego **+ 1 video record** |
| **Atomic Double Legover** `atomic-double-leg-over` | predator, atomic dlo, atomic double legover | `TOE > OP OUT [DEX] > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]` | atomic(1)+double-leg-over(3)=**4** | PassBack "Atomic far DLO" (dex 3); sister to Bladerunner (Atomic far Eggbeater) | Predator |
| **Atomic Ducking Torque** `atomic-ducking-torque` | icarus, atomic ducking torque | `TOE > OP OUT [DEX] > DUCK [BOD] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` | atomic(1)+ducking(1)+torque(4)=**6** | PassBack "Atomic Ducking far Torque" (dex 2) | Icarus |

## Group 3 — need a base/doctrine decision first (flagged, not clean)

| Candidate | Tentative ADD | Issue to resolve |
|---|---|---|
| **double-switchover** (DSO) | 3 (fborg-3add "Double Switch-Over") | Is "switchover" structurally distinct from leg-over? If double-switchover == double-leg-over, DSO should be an **alias of double-leg-over**, not a new canonical. The support-leg switch carries no bracket. |
| **triple-switchover** (TSO) | 4 | PassBack decomposition is "triple-dex **Legover**", not switchover. Proposed canonical is **`triple-leg-over`** `SET > OP IN [DEX] > OP OUT [DEX] > OP IN [DEX] > SAME TOE [DEL]` (dex 3 + toe-stall 1 = 4), with TSO / triple-switchover as folk aliases. Confirm the name. |
| **double-twist** (Revstein) | 4 | "twist" is not a standalone canonical; the orphan "Twist" decomposes to **"Rev. Swirl"**. Proposed `CLIP > SAME FRONT SWIRL [DEX] > SAME FRONT SWIRL [DEX] > SAME CLIP [XBD] [DEL]` (front = reverse direction). Confirm twist == rev-swirl and the rev-direction token. |
| **atomic-whirl** (Reactor) | 4 — or **5** | The held atomic/quantum X-Dex doctrine lists **whirl** among the X-Dex-receiving bases. If that greenlights, the whirl dex carries `[XDEX]` and atomic-whirl is 5, not 4. Currently held; proposed at 4 pending that doctrine. |
| **spinning-motion** (Motion Sickness) | unknown | "motion" is **not a canonical atom**; it recurs (spinning-motion, stepping-motion). Define the "motion" base first — doing so unlocks **both Motion Sickness and Locomotion**. Blocked until "motion" is defined. |

## Separate flag — DLO / DATW foundational alias placement

`DLO -> double-leg-over` and `DATW -> double-around-the-world` are valid mappings whose
targets DO exist, but those canonical rows are **foundational** (not in
`red_additions_2026_04_20.csv`), so the `dlo` / `datw` aliases cannot be added through
the red_additions aliases column (same limitation hit on `clipper-kick`). These need
either (a) the base-seed location where foundational tricks carry aliases, or (b) a
loader-supported direct alias entry. Pending that, DLO and DATW remain unaliased.

## Summary

- **Clean to create now (8):** double-illusion, double-whirl, triple-swirl, triple-mirage, atomic-whirl, atomic-blender, atomic-double-leg-over, atomic-ducking-torque.
- **Need a decision first (4):** double-switchover (alias vs new), triple-switchover (name = triple-leg-over?), double-twist (twist = rev-swirl?), spinning-motion (define "motion").
- **Orphans unlocked:** 12 (one per target), plus Locomotion if "motion" is defined.
- **Video records unlocked:** 1 (Ego clip -> atomic-blender).
- **Foundational-alias blocker:** DLO, DATW.
