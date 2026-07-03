# Part E — Prioritized Media Roadmap

Ranked strictly by **user impact ÷ implementation effort**. The thesis: the highest-ROI media work is **connectivity, not ingestion** — a large amount of media already exists and isn't reaching trick pages. Do the cheap surfacing wins before any gallery buildout. (All items are Dave-owned media writes; this doc only sequences them.)

| # | Work | Impact | Effort | ROI | Why |
|---:|---|---|---|---|---|
| 1 | **Tier the untiered media** — add `passback_tutorials` to `SOURCE_TIER`; backfill `source_id`/tier on the 17 sourceless `#trick` items | Med-High | **Very low** | ★★★★★ | Unblocks ~20 already-linked clips that are invisible on trick pages today. Pure config + data fix. |
| 2 | **Bridge record videos → trick pages** — normalize `freestyle_records.trick_name`→slug; route discipline-only records (2-bag juggle, consecutive) to a Records surface | High | Low-Med | ★★★★★ | ~124 record videos already in the DB but stranded; lights up RECORD tier on dozens of trick pages + fixes the 2-Bag-Juggle example. |
| 3 | **Fix TT mappings + backfill** — retarget TT14 off `#around-the-world`; verify TT09 `#clipper`; locate TT01 + TT34 | Med | **Very low** | ★★★★☆ | 2 tag edits + 2 lookups make the strongest existing tutorial set fully correct. |
| 4 | **Activate `featured_media_id`** — pin one strong existing clip as hero on high-traffic tricks | Med | Low | ★★★★☆ | Zero-ingestion surfacing win; schema already supports it (currently 0 used). |
| 5 | **`/media` landing intent-redesign** — re-group existing galleries under Learn / Tutorials / Demos / Records / Archives + a "Start here" TT path (Part D) | High | Med | ★★★★☆ | Turns a source directory into a goal-driven on-ramp; surfaces items #1–#4 to users; needs no new media. |
| 6 | **Demonstrations for foundational tricks** — fill the demo half on the ~40–60 most-used tricks (only 1 trick has both tutorial+demo today) | High | High (ingestion) | ★★★☆☆ | Biggest content gap, but real ingestion effort; sequence after the surfacing wins so each new clip lands on a working surface. |
| 7 | **Ingest the empty registered sources** — TT1/TT2 DVDs, HoF archive, passback_youtube, polini_pointers, footbag_foundations, etc. (11 shells) | Med-High | High | ★★★☆☆ | Real archival value (esp. HoF + DVDs) but heavy; do after the landing can route it (Archives lane from #5). |
| 8 | **Coverage for the long tail** — chip away at the 535 no-media tricks by family-anchor priority | Med | Very High | ★★☆☆☆ | Worthwhile but never "done"; explicitly NOT a blanket fill. Lowest ROI per unit. |

## Recommended sequence (highest-ROI first)
**Phase 1 — Connectivity (cheap, no new media):** items **1 → 2 → 3 → 4**. Surfaces existing media; fixes the curriculum; ~days of work, large visible payoff.
**Phase 2 — Landing facelift:** item **5**. Re-homes everything Phase 1 unlocked under user intent.
**Phase 3 — Ingestion:** items **6 → 7**, prioritized by combo-corpus frequency and archival value, landing onto the now-working surfaces.
**Phase 4 — Long tail:** item **8**, ongoing, anchor-first.

## One-line answer to the brief
Before any major gallery buildout, do **Phase 1 (connectivity)** — tier the untiered media, bridge the 124 stranded record videos, and correct the TT curriculum. That converts already-existing media into visible value at near-zero cost, and gives the landing redesign (Phase 2) something real to surface.
