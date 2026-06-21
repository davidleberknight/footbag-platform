# X-Dex Ruling — Delta Report (Red 2026-06-20)

What the doctrine ruling unlocks, rejects, and leaves open. Companion to the re-run
`ATOMIC_QUANTUM_NUCLEAR_READINESS.md` and the canon entry `RED_RESOLVED_CANON §D.5`.

## The ruling (exactly as stated)

> "X-Dex occurs when you have a far move after a dexterity (that isn't Paradox)."

- **Receiver set (eligibility):** mirage, illusion, whirl, torque, drifter = yes. swirl, butterfly,
  barfly, DOD family = no. No receivers beyond these five.
- **Trigger (firing condition):** a **far move after a non-paradox dexterity**. Paradox does not
  qualify. Ducking, gyro, and all other modifiers do not alter eligibility.

## The load-bearing distinction: eligible receiver ≠ X-Dex trigger

An eligible receiver does **not** automatically receive X-Dex. The far-form condition must also hold.
The near / default form of a receiver scores no X-Dex. Red's own worked example is the template:

| Compound | Base eligible? | Far form? | ADD |
|---|---|---|---:|
| Atomic Torque (Silo) | torque — yes | no (near) | **5** — no X-Dex |
| Atomic Far Torque | torque — yes | **yes** | **6** — X-Dex fires |
| Atomic Illusion (Omelette) | illusion — yes | no (near) | **3** — no X-Dex |
| Atom Smasher (atomic far mirage) | mirage — yes | **yes** | **4** — X-Dex fires |

## What this UNLOCKS

1. **The §E deferral is closed.** "Which following dexes earn X-Dex" was the single open question
   gating every atomic/quantum value change. It now has an exact structural test. Canon updated
   (`RED_RESOLVED_CANON §D.5`); the readiness audit's "do not start" gate is lifted.
2. **The receiver-set "contradiction" dissolves.** It was never a contradiction: torque is a
   receiver *and* Silo = 5, because Silo is the near form. Near ≠ far resolves it.
3. **Two −1 corrections are cleared to apply** — `atomic-swirl` and `atomic-reverse-swirl`. Swirl is
   a confirmed non-receiver, so they carry no X-Dex; dropping the retired +2-rotational proxy moves
   each −1. This is the IP-flagged "atomic-swirl / atomic-rev-swirl score one too high" bug, now
   greenlit.
4. **`atomic-far-torque` = 6 is validated** as a distinct far-form reading (Red explicit), separate
   from the near `Atomic Torque` (Silo) = 5.
5. **The mechanical reconcile gains full doctrinal cover** — `atomic.add_bonus_rotational` 2 → 1,
   with Silo / `atomic-symposium-mirage` / `atomic-ducking-torque` reconciling computed→asserted
   (0 displayed move).
6. **`atomic-miraging-butterfly` (was C4) resolves to no-X-Dex** — butterfly is a non-receiver and an
   inserted modifier cannot grant eligibility. Stays 5.
7. **`witchdoctor`'s `red-doctrine` block clears** — its X-Dex is the atom-smasher far-mirage,
   already counted in the 4; it needs only the curator link fix, not a Red answer.

## What this REJECTS

- **The aggressive 2026-06-06 "13 auto-fire moves."** Firing X-Dex on every receiver's near form
  contradicts Red (it would force Silo = 6). So the receiver auto-fires do **not** happen:
  `atomic-illusion` stays 3, `atomic-drifter` near stays, and the **9 near `quantum-*` forms do not
  gain +1.** The skeptical 2026-06-14 SPEC's instinct (X-Dex is far-explicit) is vindicated.

## What remains open (now decoupled from X-Dex)

- **DOD-vs-DDD doctrine** — separate Red question; atomic/quantum DOD compounds get no X-Dex (down is
  a non-receiver), but the down-family scoring is still its own open item.
- **Gyro-into-set insertion precedent** — `atomic-gyro-torque` is no longer X-Dex-blocked, but still
  waits on the set-then-gyro insertion ruling in `GOVERNANCE_PRECEDENT_FRONTIER.md`.
- **Per-row near/far authoring** — for receiver bases, deciding whether a given compound is the far
  form (and authoring its `[XDEX]`) is now a curator/notation call, not a doctrine block.
- **Identification bands** — sailing and frantic bands unchanged (identify before scoring).

## Net effect

The ruling converts one Red doctrine block into a small, bounded set of edits: **two −1 corrections,
one validated far-form (`atomic-far-torque` = 6), and a reversible registry/parser reconcile** — with
every near-form receiver explicitly *held in place*. No data migration has been executed here; this is
the re-evaluation and delta only.

## Code touchpoints (flagged, not changed)

- `src/services/freestyleService.ts` `NB_XDEX_RECEIVERS` already equals Red's set
  `{mirage, illusion, whirl, torque, drifter}` — no set change needed.
- The classifier rule that marks `atomic|quantum|nuclear + receiver` as `red-doctrine` is now stale
  (those rows are resolved, not Red-blocked); it should be revised so resolved far/near cases route to
  authoring, not doctrine-blocked. Code change, separate slice.
- The far-form trigger is not yet encoded in the parser (X-Dex stays explicit-`[XDEX]`-only); auto-
  derivation is out of scope until the near/far signal is reliably present in notation.
