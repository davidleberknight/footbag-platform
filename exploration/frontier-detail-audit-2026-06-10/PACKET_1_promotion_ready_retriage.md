# Packet 1 — Promotion Ready Retriage

Review packet. **Read-only. No edits, no promotions, no doctrine changes.** Full machine data:
`packet1_promotion_ready_retriage.csv` (36 rows).

## Finding

The "Promotion Ready: 36" card is misleading: **0 of 36 are publishable now.** Each still needs
authoring, a ruling, an alias-wire, or is already published. Re-triage into 5 buckets:

| proposed bucket | count | meaning |
|---|---:|---|
| **A — Authoring-ready** | 18 | operator resolved; needs `operational_notation` authoring + `red_additions` promotion. The genuine "do it now" queue. |
| **B — Decision-pending** | 10 | blocked on a held ruling (atomic-on-rotational X-Dex Q3 ×7; terraging +3 weight ×3). Must NOT publish until ruled. |
| **C — Alias to existing folk canonical** | 5 | structural slug already shipped under a folk name; wire an alias, do NOT create a new row. |
| **D — Already published (evict)** | 2 | already `is_active=1`; should never have appeared in a "ready" frontier. |
| **E — Exclude (malformed)** | 1 | self-referential composition; not a trick. |

## The exact 36 rows

### A — Authoring-ready (18) — the real promotion queue
`atomic-guay` · `atomic-reverse-guay` · `blazing-illusion` · `blazing-legover` · `blazing-mirage` ·
`blazing-butterfly` · `blazing-drifter` · `blazing-symposium-mirage` · `blazing-paradox-whirl` ·
`blazing-torque` · `diving-reverse-guay` · `tapping-reverse-guay` · `pixie-miraging-symposium-miraging-legover` ·
`reverse-swirling-paradox-symposium-whirl` · `spinning-miraging-symposium-miraging-refraction` ·
`surging-ducking-blender` · `surging-ducking-torque` · `surging-ducking-paradox-symposium-whirling-rake`

> Note: 8 of these are blazing-led. Confirm blazing's `+1` operator definition is curator-settled
> before bulk authoring (it is registered `add_bonus=1`, but memory flags blazing as an open token).

### B — Decision-pending (10) — do NOT publish until ruled
| slug | add | held on |
|---|---|---|
| atomic-ducking-mirage | 5 | atomic-rotational X-Dex Q3 |
| atomic-reverse-swirl | 5 | atomic-rotational X-Dex Q3 |
| atomic-swirl | 5 | atomic-rotational X-Dex Q3 |
| atomic-whirl | 5 | atomic-rotational X-Dex Q3 |
| atomic-ducking-blender | 6 | atomic-rotational X-Dex Q3 |
| atomic-symposium-whirl | 6 | atomic-rotational X-Dex Q3 |
| atomic-gyro-torque | 7 | atomic-rotational X-Dex Q3 |
| terraging-illusion | 5 | terraging `+3` weight confirmation |
| terraging-legover | 5 | terraging `+3` weight confirmation |
| terraging-mirage | 5 | terraging `+3` weight confirmation |

### C — Alias to existing folk canonical (5) — wire alias, not a new row
| structural slug | folk canonical (active) |
|---|---|
| atomic-legover | **eggbeater** |
| atomic-pickup | **omelette** |
| atomic-mirage | **atom-smasher** |
| atomic-symposium-mirage | **witchdoctor** |
| atomic-ducking-whirl | **ego** |

### D — Already published (evict from frontier) (2)
`atomic-blender` (active, 5 ADD) · `atomic-ducking-torque` (active, 7 ADD)

### E — Exclude (malformed) (1)
`atomic-eggbeater` — decomposes to "atomic atomic-legover"; does not compose.

## Recommended page labels

Replace the single "Promotion Ready" card. Two options:

1. **Split into two cards (recommended):**
   - **"Authoring-Ready" (18)** — hint: *clean ADD + resolved operator; awaiting notation authoring*
   - **"Decision-Pending" (10)** — hint: *awaiting a curator/Red ruling*
   - …and route C/D/E out of the frontier entirely (C → alias archive, D → published, E → drop).
2. **Single honest card:** **"Structurally Resolved"** — hint: *clean ADD; still needs authoring or a ruling* — paired with eviction of C/D/E.

Either way, "Promotion Ready" should not survive: it implies one-click publishability that no row has.
