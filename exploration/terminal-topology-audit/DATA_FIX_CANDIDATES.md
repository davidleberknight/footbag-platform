# Terminal-Topology Audit — Data-Fix Candidates

Tricks whose `trick_family` disagrees with the terminal their own formula resolves to. **Curator review list — nothing changed.** Derived by the method in `METHODOLOGY.md`.

## 1. CLEAR — the `infinity` "family" is three misfiled barfly tricks
There is no real `infinity` terminal lineage. All three members are barfly tricks, including the **barfly anchor itself**, which is why the actual `barfly` family (10) renders without its own root.

| slug | current `trick_family` | `base_trick` | formula terminal | should be |
|---|---|---|---|---|
| `barfly` | infinity | infinity | clipper-stall (`CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]`) | **barfly** |
| `ducking-barfly` | infinity | barfly | clipper-stall | **barfly** |
| `barraging-barfly` | infinity | barfly | (no notation) | **barfly** |

**Fix:** set `trick_family = 'barfly'` on all three (and `base_trick = 'barfly'` on `barfly` itself). Effect: the phantom `infinity` lineage disappears; the barfly family is completed (10 → 13) and gains its anchor. Confidence: **high** (names + base_trick + clipper terminal all agree on barfly).

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
- **1 high-confidence data fix** (3 rows): `infinity` → `barfly`.
- **2 review cases:** `reaper`, `pixie-paradon` (cross-surface — curator decides).
- **1 false positive:** `eclipse` (fix the extractor, not the trick).
