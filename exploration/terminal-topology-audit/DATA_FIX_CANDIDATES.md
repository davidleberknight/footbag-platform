# Terminal-Topology Audit — Data-Fix Candidates

Tricks whose `trick_family` disagrees with the terminal their own formula resolves to. **Curator review list — nothing changed.** Derived by the method in `METHODOLOGY.md`.

## 1. RESOLVED — family-lineage consolidation (doctrine correction, not a data fix)
Investigation showed the `infinity` assignment was **deliberate**, not a typo: a prior curator ruling set `barfly`'s base/family to `infinity` ("barfly ≡ double infinity"), with `red_corrections` overrides on `ducking-barfly` and `barraging-barfly` to match. But the ruling was **half-applied** (3 of 13) and conflicts with the canonical name — `barfly` is the public first-class family; `infinity` is a public family nowhere. All 13 tricks are one barfly lineage (`base_trick = barfly`, double-out-dex clipper terminal `CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP`).

| slug | was `trick_family` | now | terminal |
|---|---|---|---|
| `barfly` (anchor) | infinity | **barfly** | clipper-stall |
| `ducking-barfly` | infinity | **barfly** | clipper-stall |
| `barraging-barfly` | infinity | **barfly** | clipper-stall |

**Applied** as a consolidation under `barfly` per curator ruling: `barfly` base/family `infinity → barfly` in `tricks.csv` (and the unused `trick_dictionary.csv`); the two redundant `red_corrections` overrides removed. The phantom `infinity` lineage is gone; barfly is one 13-member family including its anchor. The no-transitive-inheritance forever-rule still holds — `barfly` is now its own family, so the default (`family = base = barfly`) is correct and needs no override. This reversed the documented `infinity` naming choice, so it is a family-lineage consolidation / doctrine correction, not a data fix.

## 2. REVIEW — terminal surface disagrees with family (mis-assignment or genuine variant)

| slug | `trick_family` | formula | formula terminal | note |
|---|---|---|---|---|
| `reaper` | clipper-stall | `CLIP > SAME OUT [DEX] > SAME OUT [DEX] > SAME TOE [DEL]` | **toe-stall** | Filed under clipper-stall but the catch is `SAME TOE` — it terminates in toe, not clipper. Likely belongs to a toe-terminal identity (out-dex → toe), not the clipper-stall surface family. |
| `pixie-paradon` | paradon | `TOE > … > OP BACK SWIRL [DEX] > SAME TOE [DEL]` | **toe-stall** | The paradon family is clipper-terminal (anchor ends `OP CLIP [XBD]`); this member ends `SAME TOE`. Either a mis-assignment or a genuinely divergent paradon variant. |

These need a curator call (correct family vs. accept as a cross-surface variant); do not auto-reassign.

## 3. NOT a data error — methodology artifact (recorded so it isn't "fixed" by mistake)

| slug | `trick_family` | formula | why it flagged |
|---|---|---|---|
| `eclipse` | eclipse | `SET > JUMP [BOD] > SAME/OP INSIDE [DEL] > OP OUT [DEX] > (land)` | The `INSIDE [DEL]` is a **mid-trick delay**, not the terminal; the formula then continues `OP OUT [DEX] > (land)`. The last-token extractor mis-read the mid-stall as the catch. The eclipse family is correctly toe-dominant (7 of 8). |

**Action:** none on the data. This is a known extractor limitation (mid-formula `[DEL]` + `(land)` terminals) noted in `METHODOLOGY.md`; the robust extractor fix belongs in the audit script, not the trick data.

## Summary
- **1 family-lineage consolidation (applied):** `infinity` → `barfly` (3 rows + root) — reversed the prior `infinity` naming; one 13-member barfly family with its anchor.
- **2 review cases:** `reaper`, `pixie-paradon` (cross-surface — curator decides).
- **1 false positive:** `eclipse` (fix the extractor, not the trick).
