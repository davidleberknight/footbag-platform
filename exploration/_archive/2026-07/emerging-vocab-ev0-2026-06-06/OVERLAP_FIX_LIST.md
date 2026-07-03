# OVERLAP_FIX_LIST — exact canonical↔emerging removals (EV1)

The full removal of all 165 canonical/emerging overlaps. Every slug below was an active canonical trick or a registered alias that was wrongly present on an emerging surface; all are now removed.

## Removal counts

| Module | Mechanism | Removed | Full list |
|---|---|---:|---|
| `freestyleTrackedNames.ts` | gate fix + regen | **126** | `removed_tracked_names.txt` |
| `freestyleObservationalUniverse.ts` | gate fix + regen | **146** | `removed_observational_universe.txt` |
| `freestyleObservationalTricks.ts` (hand-authored) | tombstone comment per entry | **11** | listed below |
| **Distinct overlap slugs cleared** | | **~165** | |

Additions (corpus brought current by the same regen): **35** new tracked names, all non-canonical and non-alias (`added_tracked_names.txt`). Validated: 0 of the 35 are canonical or alias.

## The 11 hand-authored removals (observational tricks)

Each was promoted to canonical since it was hand-authored as observational; each entry is replaced with a tombstone comment (`// 'slug' is omitted: now canonical in freestyle_tricks.`), matching the file's existing `big-apple` / `blurrage` precedent. The stale "bling-blang is likewise kept observational" curator note was removed (it contradicted the promotion).

`bling-blang` (4), `darkwalk` (5), `flurricane` (5), `goliath` (5), `maelstrom` (6), `reactor` (5), `ripped-warrior` (5), `swirlwind` (7), `trixie` (5), `inspinning-paradox-mirage` (4), `inspinning-paradox-illusion` (4) — (canonical ADD in parentheses; all `is_active=1`).

## Sample of regen removals (full lists in the .txt files)

Tracked (first rows): `alpine-big-apple`, `atw` (alias of around-the-world), `backside-symposium-toe-blur`, `barraging-barfly`, `barraging-butterfly`, `barraging-legover`, `barraging-pickup`, `diving-mirage` … — all canonical or alias slugs.

Notably present and correctly removed: **`diving-mirage`** (the EV0 template case) and the alias `atw`.

## How to reproduce / verify

```bash
# regenerate (now DB-gated)
python3 legacy_data/scripts/build_tracked_names_content.py
python3 legacy_data/scripts/build_observational_universe_content.py
# overlap must be 0: every emerging slug minus (active canonical ∪ aliases)
#   = comm -12 <all-emerging-slugs> <freestyle_tricks.is_active ∪ freestyle_trick_aliases.alias_slug>
```

Result after the fix: **0** emerging slugs intersect canonical-or-alias.
