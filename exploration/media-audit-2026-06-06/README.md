# Phase M1 — Media Audit + Landing Redesign (2026-06-06)

Read-only audit + on-paper redesign. **No code, seeder, tag, or data changes** were made — implementation is Dave-owned media writes. Source of truth: `database/footbag.db` + `src/services/freestyleService.ts` (`SOURCE_TIER`), queried 2026-06-06. All numbers are reproducible via the SQL embedded in each part.

## Headline numbers
- **20** media sources registered (`media_sources`); only **10 have any media**; **11 registered-but-empty**.
- **215** active `media_items` (213 video, 2 photo).
- **116 / 651** first-class tricks (`is_active=1`) have ≥1 media → **535 have none (82%)**.
- Coverage by tier: **51** tutorial-tier · **40** demonstration-tier · **53** record-tier · **only 1** trick has both tutorial + demo.
- **204** record videos in `freestyle_records` (all carry `video_url`); only **80** are in the unified media system.
- `featured_media_id` (pinned hero media) is used by **0** tricks — feature is dormant.
- **17** `#trick`-tagged media are effectively **unsurfaced** (no `source_id` → `tierOf`=null → absent from the trick-detail Tutorial/Demo split).
- TT curriculum: **40 lessons present (TT02–TT42); TT01 & TT34 missing**; 2 mapping issues (TT14/TT15 collision, TT09 surface-slug).

## Highest-ROI conclusion
The biggest wins are **connectivity, not ingestion** — a large amount of media already exists but isn't reaching trick pages. See `ROADMAP.md`. Rank-1 items (tier the untiered sources; bridge record videos; fix TT mappings) are cheap and unblock media that is already in the DB.

## Files
- `CONNECTIVITY_AUDIT.md` — Part A: per-source connectivity + exact issue lists + fixes
- `TT_CURRICULUM_AUDIT.md` — Part B: Tricks of the Trade as curriculum
- `MEDIA_COVERAGE_MATRIX.md` — Part C: per-trick coverage classification + highest-value gaps
- `MEDIA_LANDING_REDESIGN.md` — Part D: `/media` critique + intent-based IA + wireframe
- `ROADMAP.md` — Part E: ranked work by impact ÷ effort
