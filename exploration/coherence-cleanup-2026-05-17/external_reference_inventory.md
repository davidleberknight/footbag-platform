# External Reference Inventory

Coherence Cleanup Slice — Phase 1e (part 2) (2026-05-17). Read-only audit.

## TL;DR

External references are **discussed** across several surfaces but rarely **linked**. The glossary §11 source-families list names footbag.org, PassBack, footbagmoves, AnzTrikz, TT, Jobs notation, WFA/NHSA — all as plain text. Only `moves.hbs` actually links out to footbag.org. The "transparent / academically honest / not pretending exclusivity" posture would be reinforced by adding outbound hyperlinks on the existing reference lists.

## Inventory of mentions

| Surface | Reference text | Hyperlinked? | Inbound url |
|---|---|---|---|
| `glossary.hbs:1087` | "footbag.org" (in §11 source-families) | NO | http://www.footbag.org/ |
| `glossary.hbs:1088` | "PassBack" (in §11 source-families) | NO | https://www.youtube.com/@PassBack (assumed) |
| `glossary.hbs:1089` | "footbagmoves.com" (in §11 source-families) | NO | https://www.footbagmoves.com/ |
| `glossary.hbs:1090` | "AnzTrikz" (in §11 source-families) | NO | unknown URL |
| `glossary.hbs:1091` | "Tricks of the Trade (WorldFootbag YouTube)" (in §11) | NO | https://www.youtube.com/@WorldFootbag |
| `moves.hbs:21` | "footbag.org/freestyle/sets.html" | **YES** | http://www.footbag.org/freestyle/sets.html |
| `landing.hbs:128` | "PassBack Tutorials" | internal (gallery_passback_tutorials) | — |
| `records.hbs:27` | "freestyle passback video archive" | NO (descriptive only) | — |
| `leaders.hbs:61` | "passback video archive" | NO (descriptive only) | — |
| `trick-shell.hbs:111` | "freestyle passback video archive" | NO (descriptive only) | — |
| `insights.hbs:115` | "passback archive" | NO (descriptive only) | — |
| `about.hbs:64` | "passback video archive" | NO (descriptive only) | — |
| `tricks.hbs:314` | "tricks with passback records are linked to their record pages" | NO (per-record links exist downstream) | — |

## The pattern

Curator-authored prose acknowledges the external community sources, but the actual surfaces don't link out. This is one-way visibility: the IFPA platform absorbs the vocabulary and dataset but doesn't reciprocate by signposting the community origins.

## Safe additions

Five outbound links are safe to add immediately (no doctrine risk, no governance dependency):

| Link | Target | Surface | Notes |
|---|---|---|---|
| footbag.org | `http://www.footbag.org/` | glossary §11 source-families | Already cited; URL already in moves.hbs |
| footbagmoves.com | `https://www.footbagmoves.com/` | glossary §11 source-families | Already cited; URL known |
| WorldFootbag YouTube (TT lessons) | `https://www.youtube.com/@WorldFootbag` | glossary §11 source-families | Memory `[[reference_worldfootbag_channel]]` confirms handle |
| footbag.org/newmoves/list | `http://www.footbag.org/newmoves/list` | glossary §1 ADD section OR §11 | Memory `[[reference_fborg_newmoves_list]]` documents the resource |
| (none for PassBack) | the channel URL hasn't been verified per memory | — | Defer; verify URL before linking |

Unsafe (deferred):
- AnzTrikz URL — not verified
- PassBack channel URL — not verified (multiple channels share the name)
- WFA / NHSA — historical, no active web presence

## Recommended placement

Phase 2 should propose either:
- (A) Hyperlink the existing §11 source-families list items in place (lowest risk; preserves existing structure)
- (B) Add a new "External references" sub-section to glossary §1 or §11 with a curated linked list (more discoverable)

Either approach satisfies the user's "comparative / transparent / academically honest" posture without expanding the doc's scope.

## What this slice can safely ship (Phase 3 candidate)

Approach (A) for the 4 verified URLs: footbag.org, footbagmoves.com, WorldFootbag YouTube, footbag.org/newmoves/list. Each just wraps the existing text in an `<a target="_blank" rel="noopener noreferrer">`. Total: 4 hyperlinks added to existing prose in glossary §11. Zero structural change.

## Cross-references

- `reference_worldfootbag_channel` — WorldFootbag YouTube handle verified
- `reference_fborg_newmoves_list` — footbag.org/newmoves/list as audit source
- `project_passback_dictionary_intake` — PassBack matcher infrastructure (channel URL not load-bearing for outbound link)
