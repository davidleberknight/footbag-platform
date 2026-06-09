# COHORT1_IMPLEMENTATION_PACKET

Ready-to-apply notation-recovery slice for the 8 clean Cohort-1 rows from
`SAFE_RECOVERY_PACKET.md`. **This packet does not modify data** -- it contains the exact rows for
the curator to append + the apply procedure. Nothing is appended to the CSVs, no loader run, no
DB write.

## Mechanism (important)

All 8 are **already active rows** (`is_active=1`) -- this is **notation backfill, not promotion**.

- `red_additions` rows already exist for all 8 and are **unchanged** (that file has no
  `operational_notation` column; it created the rows metadata-only).
- **JOB (`notation`) is already populated** for all 8 (mechanical rule applied, e.g.
  `DIVING DRIFTER`). No JOB correction needed.
- The only missing field is `operational_notation`. Recovery = **one `red_corrections` row per
  slug** (`slug,operational_notation,,<NOTATION>,<note>`), mirroring the established `barfly` /
  `blur` / `tap` backfill pattern.

Chassis (exemplar-confirmed): **diving** = insert `DIVE [BOD]` after the entry token (+1);
**spinning** = insert `(back) SPIN [BOD]` after entry (+1); **inspinning** = insert
`(front) SPIN [BOD]` after entry and flip the first dex `OP -> SAME` (+1). Hard gate:
**bracket-count == ADD**, verified for all 8.

---

## The 8 rows

### 1. diving-drifter
- **Final notation:** `SET > DIVE [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL]`
- **ADD verification:** brackets `[BOD][DEX][XBD][DEL]` = 4 == `adds` 4 OK
- **Family verification:** `trick_family = clipper-stall` (terminal of the drifter base) OK
- **Source justification:** diving chassis mirrored from canonical `diving-mirage/-butterfly/-osis/-whirl`; base `drifter` = `SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]` (3 ADD) + `DIVE [BOD]` = 4. Existing row attests observational (SG).
- **red_additions (existing, unchanged):**
  `diving-drifter,4,drifter,compound,,diving,"Diving-modified drifter.",expert_reviewed,1,"Diving-chassis promotion; diving(+1) DIVE [BOD] on the drifter body; bracket count 4 matches ADD; observational (SG)."`
- **red_corrections (append):**
  `diving-drifter,operational_notation,,SET > DIVE [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL],"Diving chassis: DIVE [BOD] after entry (+1 ADD), mirror of canonical diving exemplars; bracket count 4 equals asserted ADD."`

### 2. diving-guay
- **Final notation:** `SET > DIVE [BOD] > OP IN [DEX] > SAME INSIDE [DEL]`
- **ADD verification:** `[BOD][DEX][DEL]` = 3 == 3 OK
- **Family verification:** `inside-stall` OK
- **Source justification:** base `guay` = `SET > OP IN [DEX] > SAME INSIDE [DEL]` (2 ADD) + `DIVE [BOD]` = 3. Tier-1 sweep on canonical guay; observational (SG).
- **red_additions (existing, unchanged):**
  `diving-guay,3,guay,compound,,diving,Tier-1 sweep: diving on guay.,expert_reviewed,1,Clean Tier-1 sweep; diving on canonical guay; chassis mirrors the settled diving exemplar; bracket count 3 matches ADD; observational (SG).`
- **red_corrections (append):**
  `diving-guay,operational_notation,,SET > DIVE [BOD] > OP IN [DEX] > SAME INSIDE [DEL],"Diving chassis: DIVE [BOD] after entry (+1 ADD), mirror of canonical diving exemplars; bracket count 3 equals asserted ADD."`

### 3. diving-pickup
- **Final notation:** `SET > DIVE [BOD] > OP IN [DEX] > SAME TOE [DEL]`
- **ADD verification:** `[BOD][DEX][DEL]` = 3 == 3 OK
- **Family verification:** `pickup` OK
- **Source justification:** base `pickup` = `SET > OP IN [DEX] > SAME TOE [DEL]` (2 ADD) + `DIVE [BOD]` = 3. Observational (SG).
- **red_additions (existing, unchanged):**
  `diving-pickup,3,pickup,compound,,diving,"Diving-modified pickup.",expert_reviewed,1,"Diving-chassis promotion; diving(+1) DIVE [BOD] on the pickup body; bracket count 3 matches ADD; observational (SG)."`
- **red_corrections (append):**
  `diving-pickup,operational_notation,,SET > DIVE [BOD] > OP IN [DEX] > SAME TOE [DEL],"Diving chassis: DIVE [BOD] after entry (+1 ADD), mirror of canonical diving exemplars; bracket count 3 equals asserted ADD."`

### 4. diving-smudge
- **Final notation:** `TOE > DIVE [BOD] > SAME IN [DEX] > OP OUT [DEX] > OP TOE [DEL]`
- **ADD verification:** `[BOD][DEX][DEX][DEL]` = 4 == 4 OK
- **Family verification:** `illusion` OK
- **Source justification:** base `smudge` = `TOE > SAME IN [DEX] > OP OUT [DEX] > OP TOE [DEL]` (3 ADD) + `DIVE [BOD]` = 4. Observational (PB).
- **red_additions (existing, unchanged):**
  `diving-smudge,4,smudge,compound,,diving,"Diving-modified smudge.",expert_reviewed,1,"Diving-chassis promotion; diving(+1) DIVE [BOD] on the smudge body; bracket count 4 matches ADD; observational (PB)."`
- **red_corrections (append):**
  `diving-smudge,operational_notation,,TOE > DIVE [BOD] > SAME IN [DEX] > OP OUT [DEX] > OP TOE [DEL],"Diving chassis: DIVE [BOD] after entry (+1 ADD), mirror of canonical diving exemplars; bracket count 4 equals asserted ADD."`

### 5. diving-eclipse
- **Final notation:** `SET > DIVE [BOD] > JUMP [BOD] > SAME/OP INSIDE [DEL] > OP OUT [DEX] > (land)`
- **ADD verification:** `[BOD][BOD][DEL][DEX]` = 4 == 4 OK
- **Family verification:** `eclipse` OK
- **Source justification:** base `eclipse` (jump-class) = `SET > JUMP [BOD] > SAME/OP INSIDE [DEL] > OP OUT [DEX] > (land)` (3 ADD) + `DIVE [BOD]` before `JUMP` = 4 (double-[BOD] front-of-chain matches the canonical ducking/gyro-eclipse precedent). Observational (SG).
- **red_additions (existing, unchanged):**
  `diving-eclipse,4,eclipse,compound,,diving,"Diving-modified eclipse.",expert_reviewed,1,"Diving-chassis promotion; diving(+1) DIVE [BOD] on the eclipse body; bracket count 4 matches ADD; observational (SG)."`
- **red_corrections (append):**
  `diving-eclipse,operational_notation,,SET > DIVE [BOD] > JUMP [BOD] > SAME/OP INSIDE [DEL] > OP OUT [DEX] > (land),"Diving chassis on jump-class base: DIVE [BOD] before JUMP (+1 ADD), double-BOD front-of-chain per ducking/gyro-eclipse precedent; bracket count 4 equals asserted ADD."`

### 6. spinning-tomahawk
- **Final notation:** `CLIP > (back) SPIN [BOD] >> DUCK [BOD] >> SAME FRONT WHIRL [DEX] [PDX] > OP CLIP [XBD] [DEL]`
- **ADD verification:** `[BOD][BOD][DEX][PDX][XBD][DEL]` = 6 == 6 OK
- **Family verification:** `whirl` OK
- **Source justification:** base `tomahawk` = `CLIP >> DUCK [BOD] >> SAME FRONT WHIRL [DEX] [PDX] > OP CLIP [XBD] [DEL]` (5 ADD) + `(back) SPIN [BOD]` after the CLIP entry = 6. Observational (PB).
- **red_additions (existing, unchanged):**
  `spinning-tomahawk,6,tomahawk,compound,,spinning,"Spinning-modified tomahawk.",expert_reviewed,1,"Spinning-chassis promotion; spinning(+1) back-spin prefix on the tomahawk body; bracket count 6 matches ADD; observational (PB)."`
- **red_corrections (append):**
  `spinning-tomahawk,operational_notation,,CLIP > (back) SPIN [BOD] >> DUCK [BOD] >> SAME FRONT WHIRL [DEX] [PDX] > OP CLIP [XBD] [DEL],"Spinning chassis: (back) SPIN [BOD] after entry (+1 ADD), mirror of canonical single-spinning exemplars; bracket count 6 equals asserted ADD."`

### 7. spinning-butterfly-kick
- **Final notation:** `SET > (back) SPIN [BOD] > JUMP [BOD] > SAME/OP OUT [DEX]`
- **ADD verification:** `[BOD][BOD][DEX]` = 3 == 3 OK
- **Family verification:** `butterfly-kick` (kick self-family) OK
- **Source justification:** base `butterfly-kick` = `SET > JUMP [BOD] > SAME/OP OUT [DEX]` (2 ADD) + `(back) SPIN [BOD]` = 3 (double-BOD: SPIN + JUMP). Observational (FM).
- **red_additions (existing, unchanged):**
  `spinning-butterfly-kick,3,butterfly-kick,compound,,spinning,Tier-1 sweep: spinning on butterfly kick.,expert_reviewed,1,Clean Tier-1 sweep; spinning on canonical butterfly-kick; chassis mirrors the settled spinning exemplar; bracket count 3 matches ADD; observational (FM).`
- **red_corrections (append):**
  `spinning-butterfly-kick,operational_notation,,SET > (back) SPIN [BOD] > JUMP [BOD] > SAME/OP OUT [DEX],"Spinning chassis: (back) SPIN [BOD] after entry (+1 ADD), double-BOD with the base JUMP; bracket count 3 equals asserted ADD."`

### 8. inspinning-guay
- **Final notation:** `SET > (front) SPIN [BOD] > SAME IN [DEX] > SAME INSIDE [DEL]`
- **ADD verification:** `[BOD][DEX][DEL]` = 3 == 3 OK
- **Family verification:** `inside-stall` OK
- **Source justification:** base `guay` = `SET > OP IN [DEX] > SAME INSIDE [DEL]` (2 ADD) + `(front) SPIN [BOD]` and first dex flipped `OP IN -> SAME IN` (pt7 inspin rule) = 3. Observational (FM).
- **red_additions (existing, unchanged):**
  `inspinning-guay,3,guay,compound,,inspinning,Tier-1 sweep: inspinning on guay.,expert_reviewed,1,Clean Tier-1 sweep; inspinning on canonical guay; chassis mirrors the settled inspinning exemplar; bracket count 3 matches ADD; observational (FM).`
- **red_corrections (append):**
  `inspinning-guay,operational_notation,,SET > (front) SPIN [BOD] > SAME IN [DEX] > SAME INSIDE [DEL],"Inspinning chassis (pt7): (front) SPIN [BOD] after entry, first dex flipped OP->SAME (+1 ADD); bracket count 3 equals asserted ADD."`

---

## Append block (all 8 red_corrections rows, ready to paste)

Append to `legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` (header
`slug,field,old_value,new_value,source_note`):

```
diving-drifter,operational_notation,,SET > DIVE [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL],"Diving chassis: DIVE [BOD] after entry (+1 ADD), mirror of canonical diving exemplars; bracket count 4 equals asserted ADD."
diving-guay,operational_notation,,SET > DIVE [BOD] > OP IN [DEX] > SAME INSIDE [DEL],"Diving chassis: DIVE [BOD] after entry (+1 ADD), mirror of canonical diving exemplars; bracket count 3 equals asserted ADD."
diving-pickup,operational_notation,,SET > DIVE [BOD] > OP IN [DEX] > SAME TOE [DEL],"Diving chassis: DIVE [BOD] after entry (+1 ADD), mirror of canonical diving exemplars; bracket count 3 equals asserted ADD."
diving-smudge,operational_notation,,TOE > DIVE [BOD] > SAME IN [DEX] > OP OUT [DEX] > OP TOE [DEL],"Diving chassis: DIVE [BOD] after entry (+1 ADD), mirror of canonical diving exemplars; bracket count 4 equals asserted ADD."
diving-eclipse,operational_notation,,SET > DIVE [BOD] > JUMP [BOD] > SAME/OP INSIDE [DEL] > OP OUT [DEX] > (land),"Diving chassis on jump-class base: DIVE [BOD] before JUMP (+1 ADD), double-BOD front-of-chain per ducking/gyro-eclipse precedent; bracket count 4 equals asserted ADD."
spinning-tomahawk,operational_notation,,CLIP > (back) SPIN [BOD] >> DUCK [BOD] >> SAME FRONT WHIRL [DEX] [PDX] > OP CLIP [XBD] [DEL],"Spinning chassis: (back) SPIN [BOD] after entry (+1 ADD), mirror of canonical single-spinning exemplars; bracket count 6 equals asserted ADD."
spinning-butterfly-kick,operational_notation,,SET > (back) SPIN [BOD] > JUMP [BOD] > SAME/OP OUT [DEX],"Spinning chassis: (back) SPIN [BOD] after entry (+1 ADD), double-BOD with the base JUMP; bracket count 3 equals asserted ADD."
inspinning-guay,operational_notation,,SET > (front) SPIN [BOD] > SAME IN [DEX] > SAME INSIDE [DEL],"Inspinning chassis (pt7): (front) SPIN [BOD] after entry, first dex flipped OP->SAME (+1 ADD); bracket count 3 equals asserted ADD."
```

## Apply procedure (curator-paced; not run here)

1. `cp database/footbag.db database/footbag.db.bak-pre-cohort1-notation`
2. Append the 8 rows above to `red_corrections_2026_04_20.csv` (use `>>` append; never DictReader/DictWriter round-trip).
3. Reload via loader 19 (`event_results/scripts/19_load_red_additions.py`, which applies red_corrections) or `scripts/reset-local-db.sh`.
4. **Parser-populate:** `python3 scripts/parse_freestyle_notation.py --apply` (the dex view + structural_parse depend on it; currently 0/705 -- see audit).
5. `npm run build` + `npm test` (all green).
6. Re-run the dex bucketing / coverage QC; `git add`; hand off the commit.

---

## Projected impact (the 8 clean rows)

- **Slice size:** 8 rows (notation backfill).
- **Unknown dex count:** **67 -> 59** (the 8 leave Unknown; `diving-toe-stall` held back so 9th not in this slice).

**Dex histogram (exact, from the verified notation):**

| bucket | current | after slice | change |
|---|---|---|---|
| 0 dex | 46 | 46 | 0 |
| 1 dex | 204 | **211** | +7 (diving-drifter/-guay/-pickup/-eclipse, spinning-tomahawk/-butterfly-kick, inspinning-guay) |
| 2 dex | 282 | **283** | +1 (diving-smudge) |
| 3+ dex | 84 | 84 | 0 |
| **Unknown** | 67 | **59** | **-8** |

**Terminal histogram (by `trick_family`; broad and shallow -- the big eggbeater/torque gains arrive in later cohorts):**

| family | current* | after slice | change |
|---|---|---|---|
| clipper-stall | 328 | 329 | +1 (diving-drifter) |
| whirl | 74 | 75 | +1 (spinning-tomahawk) |
| illusion | 34 | 35 | +1 (diving-smudge) |
| pickup | 27 | 28 | +1 (diving-pickup) |
| inside-stall | 11 | 13 | +2 (diving-guay, inspinning-guay) |
| eclipse | 9 | 10 | +1 (diving-eclipse) |
| butterfly-kick | (kick family) | +1 | +1 (spinning-butterfly-kick) |

\* baseline = the 2026-06-07 `FAMILY_HISTOGRAM` snapshot (directional; see `HISTOGRAM_INVENTORY.md`).

**Net:** a zero-doctrine slice that removes 12% of the Unknown-dex bucket (8 of 67) with every row
bracket-count-verified. It does not move the headline histogram bars; its value is correctness +
proving the recovery pipeline before the larger cohorts.
