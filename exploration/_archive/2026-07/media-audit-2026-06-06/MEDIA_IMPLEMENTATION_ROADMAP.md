# Phase M2 — Media Implementation Roadmap

Architecture + sequencing only. No implementation; all writes (tags, `SOURCE_TIER`, `member_galleries`, seeders, surfaces) are Dave-owned. Supersedes the interim `ROADMAP.md` (M1) by folding the V2 six-card IA into the ranking. Ordered by **user value ÷ effort**.

## Ranked work

### Tier 1 — Connectivity (cheap, no new media, immediate payoff)
1. **Tier the untiered media** — add `passback_tutorials → TUTORIAL` to `SOURCE_TIER`; backfill `source_id`/tier on the 17 source-less `#trick` items. *Effort: very low. Value: med-high* — unblocks ~20 already-linked clips invisible on trick pages today.
2. **Records → trick-page bridge** — normalize `freestyle_records.trick_name` → slug so trick-bound record clips render (RECORD tier); route discipline-only records (2-bag/3-bag juggle, consecutive net/golf) to the **Freestyle Records** destination instead. *Effort: low-med. Value: high* — ~124 stranded record videos surface; fixes the **2-Bag Juggle** case (its video exists but has no trick page → it lives on Records, not a trick page).
3. **Activate `featured_media_id`** — pin one strong existing clip as the hero on high-traffic tricks (0 used today). *Effort: low. Value: med.*

### Tier 2 — TT curriculum correctness (cheap, makes the on-ramp trustworthy)
4. **Fix TT mappings + backfill** — retarget **TT14** off `#around-the-world` (kick vs the TT15 stall); verify **TT09 `#clipper`** (surface slug) surfaces where intended; locate/backfill **TT01** (intro) + **TT34** (gap). *Effort: very low. Value: med* — 2 tag edits + 2 lookups make the strongest tutorial set fully correct before it becomes the beginner spine.

### Tier 3 — Landing redesign (medium, converts existing media into discoverable value)
5. **Ship the six-card IA** (V2) — re-group existing gallery bookmarks under the six destinations; **build Cards 1 (Freestyle Tutorials & Demos) and 2 (Freestyle Records) fully**; render Cards 3–6 (Chinlone&Takraw / Net / Sideline / Photos) as honest structured stubs. *Effort: med. Value: high* — needs **no new media**; surfaces everything Tier 1–2 unlocked.
6. **Unify with `/freestyle` "Watch & Learn"** — make Card 1 the canonical destination; convert the freestyle-landing buttons (`gallery_passback_tutorials`, `gallery_anz_trikz`) into deep links/previews into Card 1's sub-sections. *Effort: low. Value: med* — removes duplication, one source of truth.
7. **Promote TT to a curriculum** — "Start Learning Freestyle" = TT02→TT42 in skill order as the beginner on-ramp. *Effort: low-med. Value: high* — the single best learning asset becomes the front door.

### Tier 4 — Gallery restructuring (medium)
8. **Retire "Curated Freestyle Tricks"** — demote the aggregate to Card 1 "Browse All"; rely on per-source/per-tier sub-sections + existing trick-page surfacing. *Effort: low. Value: med* — removes a provenance-blind redundant bucket; no media lost.
9. **Per-clip tier overrides** — sidecar-level overrides for mixed-character sources (AnzTrikz, footbagspot_passback held blanket-TUTORIAL today). *Effort: med. Value: med.*

### Tier 5 — Future ingestion (high effort; sequence last, onto working surfaces)
10. **Demonstrations for foundational tricks** — only **1** trick has both tutorial + demo; fill the demo half on the ~40–60 highest-frequency tricks. *Effort: high. Value: high.*
11. **Ingest the 11 empty registered sources** — TT1/TT2 DVDs, HoF archive, passback_youtube, Polini, Foundations, Everything Footbag, curated playlists. *Effort: high. Value: med-high* (archival value, esp. HoF + DVDs).
12. **Grow the stub destinations** — Net, Sideline, Chinlone & Takraw, Photos. *Effort: high, ongoing. Value: med* — the V2 IA already gives each a home, so ingestion has somewhere to land.
13. **Long-tail freestyle coverage** — chip at the 535 no-media tricks, anchor-first (NOT a blanket fill). *Effort: very high. Value: med.*

## Recommended sequence
**Phase A (days):** items 1–4 (connectivity + TT correctness). Pure surfacing/fix wins on existing media.
**Phase B (1–2 wks):** items 5–8 (six-card IA, Watch&Learn unification, TT curriculum, retire the aggregate). Re-homes everything Phase A unlocked under user intent; builds the two real cards, stubs the four sparse ones.
**Phase C (ongoing):** items 9–13 (per-clip tiers, then ingestion by value). New media lands onto already-working surfaces.

## Bottom line
Highest value-per-effort is still **Phase A connectivity** — and the V2 landing (Phase B) is what makes that newly-surfaced media *discoverable* without inventing new content. Build Cards 1 & 2 for real, scaffold 3–6 honestly, and let ingestion (Phase C) fill the scaffold over time. Defer any large gallery buildout until the scaffold + connectivity are in place.
