# Identity Lock

This directory contains the identity resolution tables consumed by the canonical pipeline.

## Active files

| File | Role |
|---|---|
| `Persons_Truth_Final.csv` | Canonical person registry (effective_person_id, person_canon, identity metadata) |
| `Placements_ByPerson.csv` | Player-resolved placement records (one row per event, person, division, place) |
| `Persons_Unresolved_Organized_v28.csv` | Unresolvable entries; tracked separately, awaiting evidence |
| `Person_Display_Names_v1.csv` | Append-only display name registry |
| `member_id_supplement.csv` | Supplementary IFPA member ID lookups |

These are the files referenced by `run_pipeline.sh` and other pipeline consumers. Do not modify them by hand.

## Patch toolchain and version trail

`Persons_Truth_Final.csv` and `Placements_ByPerson.csv` are mutated in place by the patch scripts under `legacy_data/tools/patch_pt_*.py` and `legacy_data/tools/patch_placements_*.py`. Each patch lands as its own commit; `git log` is the version trail.

Earlier prototyping snapshots may persist locally with versioned names (`Persons_Truth_Final_v{N}.csv`, `Placements_ByPerson_v{M}.csv`). They are not consumed by the pipeline; they remain in the working tree as historical artifacts and may be cleaned up later.

The `archive/` subdirectory may contain additional earlier snapshots.
