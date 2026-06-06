# Phase M2 — Media IA Reset + Landing Redesign V2

On-paper architecture only. No code, seeder, gallery, or data changes. Builds on `CONNECTIVITY_AUDIT.md` / `MEDIA_COVERAGE_MATRIX.md` (M1). Grounded in `database/footbag.db`, `mediaService.ts`, `media/index.hbs`, and the current-page screenshot (`exploration/media-landing-page.png`).

Mechanism fact that shapes everything below: **named galleries are `member_galleries` rows = saved tag-query bookmarks** (tag-AND + exclude + optional `#by_<member>`). So "restructuring the landing" is **re-grouping tag queries + nav + a few new bookmarks**, not a data migration. All such writes are Dave-owned.

---

## 1. Critique of the current page

Current `/media` ("Media Galleries — browse by hashtag or visit named galleries") = a flat 3-wide grid of **8 named galleries + a hashtag-browse card**:
`Browse by hashtag`, `AnzTrikz`, `Chinlone in Myanmar`, `Curated Freestyle Tricks`, `Footbag Finland`, `PassBack Tutorials`, `Passback World Records`, `Shred Global`, `Tricks of the Trade`.

**Weaknesses**
- **Source-as-navigation.** Cards are named after *provenance*, not *intent*. A newcomer can't tell `AnzTrikz` from `Shred Global`; both are "freestyle videos."
- **No hierarchy of importance.** "Curated Freestyle Tricks" (the whole reference set) sits as one equal tile next to a 1-item "Chinlone in Myanmar."
- **Redundant aggregate.** "Curated Freestyle Tricks" re-surfaces media that the per-source galleries already show, and that already appears on trick pages.
- **Disciplines are invisible.** The site has Freestyle / Net / Sideline (top nav) + Chinlone (media-only); the landing flattens all of that into undifferentiated freestyle galleries.
- **The best learning asset is buried.** The TT curriculum (Part B) is one card with no "start here."
- **No Records destination, no Photos destination, no Net/Sideline media home.**

**Strengths to keep** — fast/clean grid; the powerful `/media/browse` hashtag tool (becomes the "advanced" layer); per-creator attribution (moves from *navigation* to *attribution on items*).

---

## 2. User-intent analysis

Users arrive with an **activity**, not a source:

| Intent | Today they must… | Should land on |
|---|---|---|
| "Learn freestyle from scratch" | guess that "Tricks of the Trade" is a beginner ladder | **Freestyle → Start Learning** (TT ladder) |
| "Learn a specific trick" | open several source galleries | **Freestyle → Trick Tutorials** (by family/skill) |
| "Watch tricks performed well" | guess "Footbag Finland"/"Shred Global" | **Freestyle → Demonstrations** |
| "Watch records" | find "Passback World Records" | **Freestyle Records** |
| "Watch Net / Sideline" | nothing | **Net** / **Sideline** destinations |
| "Chinlone / Takraw footage" | "Chinlone in Myanmar" tile | **Chinlone & Takraw** |
| "See photos" | no photo-first surface | **Photo Gallery** |

**Principle:** sources → attribution (on the item/creator chip). Activities → navigation (the six cards).

---

## 3. Recommended six-card IA

The six cards are **discipline-aligned** (Freestyle / Net / Sideline / Chinlone-Takraw) + **two cross-cutting** (Records, Photos). Honest current volumes drive how much to build now:

| # | Destination | Intent | Active media today | Build posture |
|---:|---|---|---:|---|
| 1 | **Freestyle Tutorials & Demos** | learn / watch freestyle | ~150 tutorial+demo items (+ TT 40) | **Build fully now** |
| 2 | **Freestyle Records** | watch records | 204 record videos (80 in unified) | **Build fully now** |
| 3 | **Chinlone & Takraw** | cultural/related footage | 1 chinlone item, 0 takraw | **Stub / "growing"** |
| 4 | **Net** | net footage | 1 demo video | **Stub / "growing"** |
| 5 | **Sideline** | sideline footage | 0 | **Stub / "coming soon"** |
| 6 | **Photo Gallery** | photos | 2 photos | **Stub / "growing"** |

> The single most important architectural call: **only cards 1 and 2 are populated.** Design the IA as forward-looking scaffolding — build 1 and 2 well; render 3–6 as honest, structured placeholders ("growing collection" / "coming soon") so future ingestion has a home and the nav stays stable. Do **not** fabricate six rich destinations from two cards' worth of media.

### Card 1 — Freestyle Tutorials & Demos (primary)
The media equivalent of the `/freestyle` "Watch & Learn" section. **Unify them:** make this card the single canonical destination; the `/freestyle` landing keeps a *preview* that deep-links here (per the landing-vs-reference rule: landings preview + invite, reference decomposes). Today the freestyle landing links straight to `gallery_passback_tutorials` + `gallery_anz_trikz` — those become deep links into this card's sub-sections instead.
Sub-sections:
- **Start Learning Freestyle** — the TT ladder in skill order (see §7); the beginner on-ramp.
- **Tricks of the Trade** — Kenny Shults curriculum (TT02–TT42), presented as a numbered curriculum, not a shuffle.
- **PassBack Tutorials** — conceptual / anatomy / movement-language onboarding (complements TT).
- **Trick Tutorials** — all TUTORIAL-tier media browsable by family/skill (TT + PassBack Basics + AnzTrikz + future Footbag Spot / Polini / Foundations).
- **Demonstrations** — DEMONSTRATION-tier showcase clips (Footbag Finland, Shred Global, PassBack demos, Flipsider).
- **Browse All** — the aggregate "all freestyle media" view (absorbs Curated Freestyle Tricks — see §6) + the hashtag browse.

### Card 2 — Freestyle Records
Home for trick records, challenge/consecutive records, PassBack records, and historical record footage (204 timecoded videos in `freestyle_records`). Connects to `/freestyle/records`. See §"Records bridge" below.

### Card 3 — Chinlone & Takraw
Cultural / related ball-foot sports footage. Chinlone already exists (1 item, "Chinlone in Myanmar"); Takraw (sepak takraw) is the adjacent net-kick sport and belongs in the same "traditional & related" lane. Future structure: sub-by-sport. Today: a structured stub.

### Card 4 — Net
Net match footage + net tutorials/demos. Net has its own landing + demo video + ~10 routes; the media destination mirrors Freestyle's tutorials/demos/matches split. Today: 1 demo video → stub.

### Card 5 — Sideline
Sideline/circle-kicking footage. Has a landing but **0 media** → "coming soon" stub with the same tutorials/demos structure.

### Card 6 — Photo Gallery
Photo-first browse (filter `media_type='photo'`). 2 photos today. Future: event/player/historical photos. Separate experience from the video-centric cards.

---

## 4. Text wireframe

```
┌────────────────────────────────────────────────────────────────┐
│  Footbag Media                                                 │
│  Learn, watch, and explore — across every footbag discipline.  │
├────────────────────────────────────────────────────────────────┤
│  FREESTYLE                                                     │
│  ┌──────────────────────────┐ ┌──────────────────────────┐    │
│  │ Freestyle Tutorials &    │ │ Freestyle Records        │    │
│  │ Demos              ★      │ │ 200+ record clips, timed │    │
│  │ Start learning → TT      │ │ Trick · Challenge · World│    │
│  │ ladder, tutorials, demos │ │            [Watch →]     │    │
│  │            [Learn →]     │ │                          │    │
│  └──────────────────────────┘ └──────────────────────────┘    │
│                                                                │
│  OTHER DISCIPLINES                                             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                 │
│  │ Net        │ │ Sideline   │ │ Chinlone & │                 │
│  │ growing    │ │ coming soon│ │ Takraw     │                 │
│  │     [→]    │ │     [→]    │ │ growing[→] │                 │
│  └────────────┘ └────────────┘ └────────────┘                 │
│                                                                │
│  ACROSS EVERYTHING                                            │
│  ┌──────────────────────────┐                                 │
│  │ Photo Gallery   growing  │   [ Browse by hashtag → ]       │
│  │                   [→]    │   [ All source galleries → ]    │
│  └──────────────────────────┘                                 │
└────────────────────────────────────────────────────────────────┘
```
(Freestyle gets visual primacy = where the media is; the 4 stubs read as honest "growing/coming soon"; the hashtag browse + raw source galleries survive as an Advanced footer.)

---

## 5. Migration plan from current galleries

No data moves — re-home the existing tag-query bookmarks + add a few new ones:

| Current gallery | New home |
|---|---|
| Tricks of the Trade | Card 1 → **Start Learning** + **Tricks of the Trade** |
| PassBack Tutorials | Card 1 → **PassBack Tutorials** |
| AnzTrikz | Card 1 → **Trick Tutorials** |
| Footbag Finland | Card 1 → **Demonstrations** |
| Shred Global | Card 1 → **Demonstrations** |
| Passback World Records | Card 2 → **Freestyle Records** |
| Chinlone in Myanmar | Card 3 → **Chinlone & Takraw** |
| Curated Freestyle Tricks | **Retire** → Card 1 "Browse All" (see §6) |
| Browse by hashtag | Advanced footer (unchanged) |

New bookmarks/queries to create (tag-query only, Dave-owned): "Start Learning Freestyle" (TT in skill order), per-tier "Trick Tutorials" / "Demonstrations" rollups, "Freestyle Records," and stub pages for Net/Sideline/Chinlone-Takraw/Photos. Nav: add a **Media** mega-link or section headers; keep discipline nav (Freestyle/Net/Sideline) deep-linking into the matching card.

---

## 6. Fate of "Curated Freestyle Tricks"

**Retire it as a top-level card.** Rationale:
- It's an **aggregate** (`#curated #freestyle` + every trick slug) that duplicates what the per-source galleries already show and what already renders on trick pages via tags.
- Its contents are **already attributed to real sources** (`media_items.source_id` + source tags) — nothing is lost by removing the aggregate wrapper.
- Replace with: (a) the per-source/per-tier sub-sections under Card 1, which give better, intent-driven discovery; and (b) a single **"Browse All freestyle media"** view inside Card 1 for completeness (the same aggregate query, demoted from a headline tile to a catch-all).
- Net effect: no media disappears; it just stops being discovered through a provenance-blind bucket.

---

## 7. Roles of TT / PassBack / Footbag Finland / Shred Global / AnzTrikz

| Source | Character | Role in new IA |
|---|---|---|
| **Tricks of the Trade** (Kenny Shults) | structured beginner→advanced **curriculum** (TT02–42) | **Spine of "Start Learning Freestyle."** Promote from gallery to ordered curriculum; **yes, the beginner path should begin with TT.** Carry the curriculum examples: **TT09 → Clipper (kick)**, **TT14 → Around-the-World Kick**, **TT15 → Around-the-World Stall** (and fix the TT14/TT15 `#around-the-world` collision per Part B). |
| **PassBack Tutorials** | conceptual / anatomy / movement-language onboarding | **PassBack Tutorials** sub-section; the "why/how it works" complement to TT's "here's the trick." |
| **AnzTrikz** | tutorial series, foundational + advanced (mixed-character TUTORIAL tier) | **Trick Tutorials** sub-section. |
| **Footbag Finland** | high-quality named-trick **demos** | **Demonstrations.** |
| **Shred Global** | per-trick instructional/demo by reputable players | **Demonstrations** (currently DEMONSTRATION tier; could split per-clip later). |

All five keep their creator attribution on the item/creator chip — provenance is preserved, it just stops being the navigation.
