# Atomic computation migration

Atomic = +1 is final and baked into canon.

## Remaining open question

Replace the legacy "atomic +2 on rotational bases" computation logic with
"atomic +1 plus explicit per-base X-Dex eligibility."

## Resolved

- **Canon:** atomic = +1 (final); the +2-rotational reading is retired.
- **Public prose:** operator reference, glossary, ADD-analysis, mechanical-delta,
  progressive-readings, and the atomic notation tooltip all reframed to
  "+1 final + conditional X-Dex."
- **Published data:** atomic-on-rotational compounds carry base+1 — atomic-blender (5),
  atomic-drifter (4) — except the legitimate explicit-X-Dex case atom-smasher
  (atomic mirage = 4, the named atomicX). The last legacy holdout, **atomic-torque,
  was corrected 6 -> 5** (atomic(+1) + torque(4)); source baseline and canon now agree,
  no ADD-disagreement.
- **Formula layer:** RESOLVED_FORMULAS atomic-torque already reads atomic(+1) + torque(4) = 5.

## Outstanding

- `freestyleService.ts` still contains the legacy rotational-base path:
  `ROTATIONAL_BASES` (whirl/mirage/torque/blender/swirl/drifter) and the atomic modifier's
  `add_bonus_rotational = 2`, which compute +2 for atomic on any rotational base. This now
  diverges from the published data for torque/blender/drifter (a diagnostic computed-vs-asserted
  mismatch), and is only still correct for atom-smasher (mirage).
- Exact per-base X-Dex eligibility remains unresolved. Read from the published data it is
  already implied — mirage = eligible (atom-smasher); blender / drifter / torque = not
  (base+1) — but whirl and swirl have no active atomic compounds yet, so their eligibility
  is undetermined.
- The computation layer therefore still encodes the historical +2-rotational assumption.

## Goal

Determine per-base X-Dex eligibility (the open doctrine call) and retire the remaining
rotational-base computation path: replace `add_bonus_rotational = 2` + the `ROTATIONAL_BASES`
branch with atomic = +1 plus an explicit per-base X-Dex eligibility table. Once the data is
fully consistent (it now is, except where the service still computes +2), retiring the path is
a mechanical cleanup with nothing left relying on it beyond the X-Dex-eligible bases.
