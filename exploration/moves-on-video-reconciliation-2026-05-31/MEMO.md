# Moves-on-video reconciliation — footbag.org Video Moves (2026-05-31)

Read-only reconciliation of `exploration/fborg/moves-on-video.txt` (the footbag.org
"Video Moves" list — **32 moves**, each marked "Video demonstration available!" on
footbag.org, with name, ADD, op_notation, description, and folk-name parentheticals)
against our curated-media state. Two write actions were taken (§Actions); embedded
edges were held (§Embedded).

## Coverage status (32 moves)

| Bucket | n | Moves |
|---|---|---|
| Strongly covered (tutorial-tier already) | 8 | toe-stall, clipper-stall, drifter, osis, spinning-osis, torque, blur, symposium-whirl |
| Weakly covered (demo/record only — upgrade targets) | 10 | barfly, blender, vortex, ripwalk, blurriest, mobius, paradox-torque (demo); ripstein, paradox-drifter, blurry-whirl (record-only) |
| True missing media (footbag.org has video, we hold zero) | 12 | butterfly-swirl, double-over-down, down-double-down, flurry, high-plains-drifter, paradon, paradox-double-leg-over, paradox-whirl, symposium-double-leg-over, symposium-eggbeater, fog, barraging-osis (baroque) |
| Approved-but-unpromoted | 1 | scorpion's-tail (reviewed=YES PassBack record in `video_coverage.csv`, never promoted) |
| Missing canonical row entirely | 1 | **Hop Over Swirl** — no `hop-over-swirl` slug; footbag.org op_notation `INSIDE > (JUMP)[BOD] > OP SWIRL[DEX] > SAME CLIP` |

## The seven findings

1. **True missing media** — the 12 above (+ 3 record-only) are real gaps; `flurry` is the standout (4-ADD legover-family generator, zero media). All have a footbag.org demo.
2. **Duplicate coverage** — the 8 strongly-covered already have tutorial-tier clips; footbag.org's video is redundant for them (skip).
3. **Already-covered-but-unlinked** — none stranded (every curated sidecar is seeded into `media_items` post-migration). Only `scorpion's-tail` has an approved-but-unpromoted queue row.
4. **Folk-name alias mismatches** — 3 already registered (`baroque`/`barroque`→barraging-osis, `gyro-drifter`→vortex, `spinning-down-double-down`→scorpions-tail); **7 were not** (now wired — §Actions).
5. **Media relationship opportunities** — every compound is a folk↔structural projection with footbag.org op_notation; once ingested, the compound demos would be embedded-coverage sources for their atoms. But see §Embedded (not actionable yet).
6. **"FootbagSpot-only" blockers → footbag.org is not a registered media source.** All 32 videos are footbag.org-hosted; there is no `footbag_org` source in the registry. The 12 true-missing moves are ingestion-blocked by the same external-link mechanism as FootbagSpot (`seed_fh_curator` hard-reject + schema CHECK) — a maintainer decision to register a footbag.org-video source / lift the block.
7. **Multi-trick instructional assets** — none. footbag.org demos are single-move (one video per move), unlike TT's multi-trick lessons. The only multi-coverage angle is embedded (compound→atom), per §Embedded.

## Actions taken (this sprint)

**Wired 7 folk-name aliases** (footbag.org-authoritative structural folk names → existing
canonical tricks; each equivalence verified against the file's op_notation):

| alias_slug | → trick | wired via |
|---|---|---|
| stepping-opposite-osis | torque | `trick_aliases.csv` |
| stepping-opposite-side-butterfly | ripwalk | `trick_aliases.csv` |
| stepping-paradox-mirage | blur | `trick_aliases.csv` |
| gyro-torque | mobius | `trick_aliases.csv` |
| stepping-paradox-double-leg-over | fog | `trick_aliases.csv` |
| stepping-paradox-whirl | blurry-whirl | `trick_aliases.csv` |
| double-swirl | ripstein | red_additions `aliases` column |

- `double-swirl` went in ripstein's red_additions `aliases` column (not `trick_aliases.csv`)
  because ripstein is red-additions-only and the dedicated alias CSV can't resolve it at
  loader-17 time (it exists only after loader 19). Side effect: `double-swirl` will render in
  ripstein's S3 alias slot (via `aliases_json`); the other 6 are resolver-only
  (`freestyle_trick_aliases`), not S3-rendered. If uniform S3 display is wanted, that's a
  curator follow-up — the 6 are structural folk-names, arguably S5 (compression) rather than
  S3 (alias), so resolver-only is the conservative default.
- Verified: all 7 resolve in `freestyle_trick_aliases` (temp-DB loader run); **zero new
  trick-dictionary QC conflicts** (9 pre-existing, identical with/without these edits).
- No collisions (none of the 7 folk-slugs pre-existed as a trick slug or alias).
- Aliases land in the live DB on the next reseed (`reset-local-db.sh`, maintainer-owned).

**Added the canonical row for Hop Over Swirl** (the lone footbag.org Video Move with no DB row):
- red_additions: `hop over swirl` (slug `hop-over-swirl`), 4 ADD, base_trick/family `swirl` (mirrors
  butterfly-swirl / spinning-swirl / stepping-swirl / whirling-swirl — all swirl-family 4-ADD compounds),
  category compound, review_status `curated` (footbag.org provenance), is_active 1.
- red_corrections: `notation = HOP OVER SWIRL` (mechanical JOB) + `operational_notation =
  INSIDE > (JUMP) [BOD] > OP SWIRL [DEX] > SAME CLIP [XBD] [DEL]` (copied from footbag.org).
- Verified: ADD-math 4 brackets = 4 ADD; alias-collapse clear (no existing jump+swirl trick);
  zero new QC conflicts. Lands on next reseed (run the parser-populate after, per the standing rule).

## Embedded coverage — held (no honest edges from this file)

The reconciliation surfaced compound→atom relationships, but **no embedded-coverage edge
is honestly addable from this file right now**:

- An embedded edge requires a real host video that *teaches* the component. Every atom these
  compounds embed (osis, whirl, drifter, clipper-stall, mirage) **already has its own direct
  tutorial** — so the edges would be redundant, not gap-filling. (orbit was the lone atom gap,
  already wired orbit←ATW.)
- The compound demos that would host new edges are **footbag.org-hosted and not ingested**
  (finding 6). Asserting an embedded edge against an un-ingested video violates the
  "actual video that teaches it" firewall.

So nothing was added to `embedded_coverage.csv`. Real embedded edges from this corpus become
addable only after footbag.org is registered as a media source and its compound demos are
ingested (maintainer-track).

## Recommended follow-ups (each needs sign-off)

- **James-track:** the curator could rule whether the 6 resolver-only folk-names should also
  surface in S3 or stay resolver-only. (Hop Over Swirl's canonical row is done — see Actions.)
- **Maintainer-track:** register a `footbag_org` video source / lift the external-link block to
  ingest the 12 true-missing demos; promote scorpion's-tail's approved record clip.

---

### Provenance
Source: `exploration/fborg/moves-on-video.txt`. Reconciled against `freestyle_tricks`,
`freestyle_trick_aliases`, `media_items`/`media_tags`, `curated/freestyle_tricks/` sidecars,
`video_coverage.csv`, and the unified coverage dashboard. Alias mechanism per the gauntlet
precedent ([[project_frontier_canonicalization]]); embedded firewall per
[[feedback_glossary_detail_page_alignment]] / [[project_freestyle_media_ingestion]]. Read-only
except the 7 alias rows; no media, schema, seeder, or ontology change.
