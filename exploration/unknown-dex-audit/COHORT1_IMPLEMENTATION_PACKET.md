# COHORT1_IMPLEMENTATION_PACKET (curator-review applied)

Notation-recovery slice for the Cohort-1 rows from `SAFE_RECOVERY_PACKET.md`, **after the curator
review of the 8**. The review found 3 of the original proposals were grammatically wrong (checked
against live exemplars), so this revision splits the slice: **5 verified-clean rows ready to
write, 3 held for curator confirmation.** **No data modified** -- no CSV appended, no loader run,
no DB write. `red_corrections` remains untouched until greenlight.

## Mechanism (unchanged)

All rows are **already active** -- this is `operational_notation` backfill via `red_corrections`
(one row per slug), not promotion. `red_additions` rows already exist and are unchanged; JOB is
already populated. Hard gate: **bracket-count == ADD**.

## Review outcome

| status | rows | count |
|---|---|---|
| **Verified clean -- ready to write** | diving-drifter, diving-guay, diving-pickup, diving-smudge, inspinning-guay (corrected) | **5** |
| **Held -- curator confirm jump-class chassis / entry** | diving-eclipse (corrected), spinning-butterfly-kick (corrected) | 2 |
| **Held -- confirm `>>` no-plant boundary** | spinning-tomahawk | 1 |

What the review changed vs the original packet:
- **inspinning-guay:** entry was `SET`, **corrected to `CLIP`** -- a real `spinning-guay`
  exemplar exists (`CLIP > (back) SPIN [BOD] > OP IN [DEX] > SAME INSIDE [DEL]`); inspinning mirrors
  it with `(back)->(front)` + dex `OP->SAME`. Now a clean Class-A mirror.
- **diving-eclipse:** original mirrored the base `eclipse` row; corrected to the eclipse-**compound**
  chassis (ducking/gyro/pixie/fairy-eclipse): body-mod + JUMP **merge** (no `>`), double-`[DEL]`
  landing, **no `[DEX]`**. The wrong form carried a spurious `[DEX]` and would have mis-bucketed it.
- **spinning-butterfly-kick:** jump-class -- SPIN + JUMP **merge** (no `>`).
- **spinning-tomahawk:** ADD-correct; the `>>` no-plant boundary handling is the open item.

---

## SECTION A -- 5 verified-clean rows (ready to write)

| slug | final notation | ADD | family | basis |
|---|---|---|---|---|
| diving-drifter | `SET > DIVE [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL]` | 4 == 4 | clipper-stall | mirror diving-mirage/-whirl |
| diving-guay | `SET > DIVE [BOD] > OP IN [DEX] > SAME INSIDE [DEL]` | 3 == 3 | inside-stall | mirror diving exemplars |
| diving-pickup | `SET > DIVE [BOD] > OP IN [DEX] > SAME TOE [DEL]` | 3 == 3 | pickup | mirror diving exemplars |
| diving-smudge | `TOE > DIVE [BOD] > SAME IN [DEX] > OP OUT [DEX] > OP TOE [DEL]` | 4 == 4 | illusion | mirror diving exemplars |
| inspinning-guay | `CLIP > (front) SPIN [BOD] > SAME IN [DEX] > SAME INSIDE [DEL]` | 3 == 3 | inside-stall | **mirror spinning-guay** ((back)->(front), OP->SAME) |

### Append block A (ready to append to `red_corrections_2026_04_20.csv`)

```
diving-drifter,operational_notation,,SET > DIVE [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL],"Diving chassis: DIVE [BOD] after entry (+1 ADD), mirror of canonical diving exemplars; bracket count 4 equals asserted ADD."
diving-guay,operational_notation,,SET > DIVE [BOD] > OP IN [DEX] > SAME INSIDE [DEL],"Diving chassis: DIVE [BOD] after entry (+1 ADD), mirror of canonical diving exemplars; bracket count 3 equals asserted ADD."
diving-pickup,operational_notation,,SET > DIVE [BOD] > OP IN [DEX] > SAME TOE [DEL],"Diving chassis: DIVE [BOD] after entry (+1 ADD), mirror of canonical diving exemplars; bracket count 3 equals asserted ADD."
diving-smudge,operational_notation,,TOE > DIVE [BOD] > SAME IN [DEX] > OP OUT [DEX] > OP TOE [DEL],"Diving chassis: DIVE [BOD] after entry (+1 ADD), mirror of canonical diving exemplars; bracket count 4 equals asserted ADD."
inspinning-guay,operational_notation,,CLIP > (front) SPIN [BOD] > SAME IN [DEX] > SAME INSIDE [DEL],"Inspinning (pt7): mirror of spinning-guay with (back)->(front) SPIN and first dex OP->SAME; entry normalized to CLIP per spinning-guay; bracket count 3 equals asserted ADD."
```

---

## SECTION B -- 3 held rows (DO NOT write until curator confirms)

Corrected notation shown for review; each carries one open question.

| slug | corrected notation | ADD | family | open question |
|---|---|---|---|---|
| diving-eclipse | `TOE > DIVE [BOD] JUMP [BOD] > SAME INSIDE [DEL] > SAME TOE [DEL]` | 4 == 4 (no `[DEX]`) | eclipse | first diving-on-jump-class; mirror of ducking-eclipse (DUCK->DIVE). Confirm entry token (TOE vs CLIP) and that diving merges with JUMP. |
| spinning-butterfly-kick | `SET > (back) SPIN [BOD] JUMP [BOD] > SAME/OP OUT [DEX]` | 3 == 3 | butterfly-kick | jump-class SPIN+JUMP merge per eclipse precedent. Confirm entry token. |
| spinning-tomahawk | `CLIP > (back) SPIN [BOD] >> DUCK [BOD] >> SAME FRONT WHIRL [DEX] [PDX] > OP CLIP [XBD] [DEL]` | 6 == 6 | whirl | spin-before-duck OK; confirm whether tomahawk's `>>` no-plant boundaries are preserved or normalized to `>`. |

Held append block (NOT for writing until confirmed):

```
# HELD pending curator confirmation -- do not append until greenlit
# diving-eclipse,operational_notation,,TOE > DIVE [BOD] JUMP [BOD] > SAME INSIDE [DEL] > SAME TOE [DEL],"..."
# spinning-butterfly-kick,operational_notation,,SET > (back) SPIN [BOD] JUMP [BOD] > SAME/OP OUT [DEX],"..."
# spinning-tomahawk,operational_notation,,CLIP > (back) SPIN [BOD] >> DUCK [BOD] >> SAME FRONT WHIRL [DEX] [PDX] > OP CLIP [XBD] [DEL],"..."
```

---

## Apply procedure (curator-paced; not run here)

1. `cp database/footbag.db database/footbag.db.bak-pre-cohort1-notation`
2. Append **Section A only** to `red_corrections_2026_04_20.csv` (`>>` append; never DictReader round-trip).
3. Reload via loader 19 (`19_load_red_additions.py`) or `reset-local-db.sh`.
4. `python3 scripts/parse_freestyle_notation.py --apply` (structural_parse currently 0/705).
5. `npm run build` + `npm test`; re-run dex bucketing / coverage QC; `git add`; hand off commit.

---

## Projected impact -- the 5-row clean slice

- **Slice size:** 5 (notation backfill). **Unknown dex: 67 -> 62** (-5).

**Dex histogram (exact, from the verified notation):**

| bucket | current | after slice | change |
|---|---|---|---|
| 0 dex | 46 | 46 | 0 |
| 1 dex | 204 | **208** | +4 (diving-drifter/-guay/-pickup, inspinning-guay) |
| 2 dex | 282 | **283** | +1 (diving-smudge) |
| 3+ dex | 84 | 84 | 0 |
| **Unknown** | 67 | **62** | **-5** |

**Terminal histogram (by `trick_family`):** clipper-stall +1, inside-stall +2 (diving-guay,
inspinning-guay), pickup +1, illusion +1. Headline bars unmoved.

**If the 3 held rows are later confirmed:** diving-eclipse -> **0-dex** (no `[DEX]` -- the
correction matters), spinning-tomahawk -> 1-dex, spinning-butterfly-kick -> 1-dex; Unknown 62 -> 59.

**Net:** the genuinely safe first slice is **5 rows, not 8** -- every one mirrors a confirmed
exemplar with bracket-count == ADD. The 3 jump/boundary rows are corrected and parked for a quick
curator yes/no, not written.
