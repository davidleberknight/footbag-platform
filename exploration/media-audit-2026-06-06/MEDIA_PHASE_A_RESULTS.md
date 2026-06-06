# Ticket A5 — Media Phase A Results

Phase A was **connectivity, classification, and gallery work** — surfacing and re-homing media that already exists, not ingesting new media. So per-trick coverage counts barely move by design; the wins are in *discoverability* (clipper now browseable, TT curriculum correct, two galleries populated).

## Before / after metrics

| Metric | Before (M1 baseline) | After (Phase A) | Δ |
|---|---:|---:|---:|
| First-class tricks with any media | 116 | **117** | +1 |
| — with a tutorial-tier clip | 51 | **52** | +1 |
| — with a demonstration-tier clip | 40 | 40 | 0 |
| — with both tutorial + demo | 1 | 1 | 0 |
| Tricks using `featured_media_id` | 0 | 0 | 0 |
| Untiered/stranded `#trick` media (no `source_id`) | 17 | 17* | 0 |
| Named galleries | 8 | **9** | +1 |
| Active `media_items` | 215 | 215 | 0 |

\*The 17 footbag.org clips now have a **gallery home** (footbag.org gallery) but still lack a `source_id`/tier, so they remain absent from the trick-detail tutorial/demo split. Tier registration was deliberately **not** the chosen fix — see A1 below.

The +1 trick / +1 tutorial is `around-the-world-kick`, which gained TT14 after the retag (it previously had no media).

## Per-ticket status

| Ticket | Status | Notes |
|---|---|---|
| **A1 — surface untiered media** | **Reframed + partially done** | The "20 untiered items" split into two populations, neither matching the original premise: (a) the **3 passback_tutorials** are *conceptual* tutorials with **no trick-slug tag** — they were never meant for a trick page and correctly live in the PassBack gallery; (b) the **17 are footbag.org demos** (`#footbag_org`, no registered source). Their real problem was a missing **gallery**, not a missing tier — solved by the new **footbag.org gallery** (17 items). A trick-detail tier for them (registering `footbag_org` as a source) remains optional future work. |
| **A2 — TT curriculum corrections** | **Done** | TT14 retagged `#around-the-world` → `#around-the-world-kick` (sidecar + reseed); TT15 already correct on `#around-the-world`; **TT09 resolved without a tag change** — the Clipper Kick *is* slug `clipper`, which was mis-classified `kind='surface'` and hidden from the browse. Removing it from `SURFACE_SLUGS` made it a visible 1-ADD trick, giving TT09's `#clipper` a real page. (TT01/TT34 still missing — locate/backfill is open.) |
| **A3 — featured tutorial activation** | **Deferred (needs a build)** | `featured_media_id` is read by `freestyleService` but has **no write/seed path** anywhere — nothing populates it. Activating it is a new loader/content path, not a data backfill, so it's scoped to a follow-up rather than rushed. 0 tricks use it today. |
| **A4 — records-to-trick bridge audit** | **Delivered** | `RECORD_VIDEO_BRIDGE_CANDIDATES.md`: 165 record names → 93 exact (51 surfaced / 42 bridge-ready), 20 probable, 4 record-category, 48 review-needed. 62 high-confidence bridge candidates; no bulk linking performed. |
| **A5 — coverage measurement** | **This doc** | |

## Adjacent wins shipped in Phase A (beyond the original tickets)
- **`clipper` reclassified** `kind='surface'` → `kind='trick'` — now appears in the 1-ADD dictionary browse and renders a trick page (the root cause behind the whole TT09 thread).
- **footbag.org gallery** created (`/media/gallery_footbag_org`, 17 clips) — homes media that previously had no destination.
- **PassBack demos folded into the PassBack Tutorials gallery** (20 demos + 3 conceptual tutorials = 23), so PassBack instructional content sits in one place.
- All changes verified: tag-invariant QC PASS 215/215; live server confirms each surface.

## What's left
- **A3** featured-media write path (build).
- **A1** optional `footbag_org` source registration for trick-detail tiering (the gallery already covers discovery).
- **A4 follow-ups**: bridge the 62 candidates, build a Records surface for the 4 categories + 2-Bag Juggle, adjudicate the 48 review names.
- **TT01 / TT34** locate + backfill.

## Bottom line
Phase A converted the dictionary's most visible classification bug (clipper hidden) and the TT kick/stall mix-ups into fixes, and gave two orphaned media sets (footbag.org demos, PassBack demos) real gallery homes — at zero new ingestion. The coverage *numbers* are flat because the point was reachability, not volume; the records bridge (A4) is the next big surfacing lever, and it's now fully specced.
