# Part C — Media Coverage Matrix

Classification per first-class trick (`is_active=1`, n=651), by the tier of its linked media:
- **tutorial available** — has media from a TUTORIAL-tier source (tt_youtube, passback_basics, anz_trikz, footbagspot_*, polini_pointers, footbag_foundations, everything_footbag)
- **demonstration available** — has media from a DEMONSTRATION-tier source (shred_global, footbag_finland, flipsider_footbag, passback_demos)
- **both** — has tutorial AND demonstration
- **record only** — only `passback_records` / `freestyle_records` clips
- **no media** — nothing linked

## C1. Aggregate result

| Class | Tricks | % of 651 |
|---|---:|---:|
| Has any media | **116** | 17.8% |
| — tutorial-tier (any) | 51 | 7.8% |
| — demonstration-tier (any) | 40 | 6.1% |
| — **both tutorial + demo** | **1** | 0.2% |
| — record-tier (passback_records) | 53 | 8.1% |
| — untiered/unsurfaced (no source_id) | 13 | 2.0% |
| **No media at all** | **535** | **82.2%** |

The single most actionable structural fact: **only one trick in the entire dictionary has both a tutorial and a demonstration.** Tutorial and demo coverage barely overlap — they cover largely different tricks.

`is_core` coverage (13 core rows): all have media **except `guay`** (NO MEDIA).

## C2. Full per-trick matrix (reproducible — 651 rows)
Not hand-embedded (651 rows); generate the canonical CSV with:
```sql
SELECT ft.slug, ft.canonical_name, ft.adds,
  MAX(CASE WHEN tier='TUT'  THEN 1 ELSE 0 END) tutorial,
  MAX(CASE WHEN tier='DEMO' THEN 1 ELSE 0 END) demo,
  MAX(CASE WHEN tier='REC'  THEN 1 ELSE 0 END) record,
  CASE WHEN COUNT(tier)=0 THEN 'no-media' END no_media
FROM freestyle_tricks ft
LEFT JOIN (
  SELECT substr(g.tag_normalized,2) slug,
    CASE WHEN mi.source_id IN ('tt_youtube','footbagspot_tutorials','polini_pointers','footbag_foundations','everything_footbag','passback_basics','anz_trikz','footbagspot_passback') THEN 'TUT'
         WHEN mi.source_id IN ('shred_global','footbag_finland','flipsider_footbag','passback_demos') THEN 'DEMO'
         WHEN mi.source_id='passback_records' THEN 'REC' ELSE 'UNTIERED' END tier
  FROM media_items mi JOIN media_tags mt ON mt.media_id=mi.id JOIN tags g ON g.id=mt.tag_id
  WHERE mi.moderation_status='active'
) cov ON cov.slug=ft.slug
WHERE ft.is_active=1
GROUP BY ft.slug ORDER BY ft.slug;
```

## C3. Highest-value gaps

### Highest-value missing tutorials/demos (already-taught, half-covered)
With only **1** trick having both tutorial+demo, the top ROI is **filling the missing half on the most-used tricks**. Value signal = appearance frequency in the Sick3/combo corpus (the most-used/most-connected tricks per `freestyleEditorial` INSIGHTS): `whirl`, `blurry whirl`, `swirl`, `torque`, `ripwalk`, `butterfly`, `mirage`, `legover`, `dimwalk`, `osis`. These anchor real routines and deserve **both** a TT-style tutorial and a clean demo. Rank candidates with:
```sql
-- tricks that have a tutorial but NO demo (and vice versa), ordered by family centrality
```
The TT ladder (Part B) already supplies tutorials for the foundational set; the symmetric gap is **demonstrations of those same foundational tricks** (most TT tricks have tutorial-only).

### Highest-value present-but-not-surfaced (zero-ingestion wins)
1. **17 sourceless `#trick` media** + **passback_tutorials (3)** — linked, but `tierOf`=null hides them. Tier them → instant surfacing.
2. **~124 record videos** in `freestyle_records` not in unified media — bridge `trick_name`→slug to light up RECORD-tier on those trick pages.
3. **`featured_media_id` = 0** — pin one strong existing clip per high-traffic trick for a hero slot at no ingestion cost.

### Foundational gaps to prioritize for new media
- `guay` (core trick, **no media**).
- The 535 no-media tricks skew heavily to modifier compounds; prioritize by family-anchor status and combo-corpus frequency, not by raw count. A blanket "fill all 535" is the wrong goal — target the ~40–60 high-frequency anchors first.
