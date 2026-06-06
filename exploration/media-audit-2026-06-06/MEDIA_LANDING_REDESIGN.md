# Part D — `/media` Landing Page Redesign (on paper only)

Current implementation: `GET /media` → `mediaController.hub` → `media/index.hbs` (45 lines): an `<h1>`, one "Browse by hashtag" card (→ `/media/browse`), then a flat loop of gallery cards (name / description / summary / →). It is a **directory of galleries + a hashtag search**.

## Current-state critique

**Strengths**
- Clean, fast, low-maintenance; the hashtag browse (`/media/browse`) is genuinely powerful for power users.
- Source galleries preserve provenance/attribution (good for creators).
- Already mobile-friendly card grid; nothing to throw away — it becomes the "advanced" layer.

**Weaknesses**
- **No user intent.** Every visitor — absolute beginner or record-hunter — gets the same undifferentiated grid of source names. A newcomer can't tell `anz_trikz` from `passback_records`.
- **Source-centric, not goal-centric.** Cards are named after *where the media came from*, not *what the user wants to do* (learn / watch / compete / browse history).
- **The best learning asset is buried.** The TT curriculum (40-lesson beginner→advanced ladder, Part B) is just one card among many, with no "start here" framing.
- **Records are mixed in as just another gallery**, despite being a distinct intent (204 record videos with timecodes).
- **No surfacing of coverage.** Nothing tells a user a trick *has* a tutorial; discovery is by hashtag guesswork.

**Missing opportunities**
- A genuine **"Learn Freestyle" on-ramp** (TT ladder + foundational families).
- A **Records** destination (the 204 record videos already exist).
- A **Historical/Archive** lane (HoF archive, the TT1/TT2 DVDs, older footage) — registered but unsurfaced.
- **Featured/editorial collections** (e.g., "Watch the 22-ADD Solis run", "the 6 foundational families").

## User-intent answers
- **Beginner lands on `/media`:** should see one prominent **"Start here → Learn Freestyle"** path → the TT ladder from Toe Stall forward.
- **Wants to learn tricks:** **Trick Tutorials** (TT + PassBack Basics + Footbag Spot), ideally browsable by skill order or by family.
- **Wants records:** a **Records** tile → the records table/clips (timecoded), not a source gallery.
- **Wants historical footage:** an **Archives** tile → HoF archive, TT DVDs, vintage channels.

## Proposed IA — intent-first, source-second

Top level reorganizes the *same media* under **goals**, with the existing source galleries + hashtag browse kept as a second layer:

1. **Learn Freestyle** (primary, beginner) — TT curriculum ladder; "start at Toe Stall." Progression-ordered.
2. **Trick Tutorials** — all TUTORIAL-tier media, browsable by family / skill (tt_youtube, passback_basics, footbagspot, polini, foundations).
3. **Demonstrations** — DEMONSTRATION-tier showcase clips (shred_global, footbag_finland, passback_demos).
4. **Records** — competitive record videos (passback_records + freestyle_records), timecoded; links to `/freestyle/records`.
5. **Historical Archives** — HoF archive, TT1/TT2 DVDs, vintage channels.
6. **Featured Collections** — editorial sets (foundational families, famous runs, player spotlights).
7. _(retained, secondary)_ **Browse by hashtag** + **All source galleries** — the current power-user layer.

Map of current sources → proposed sections:
- Learn / Tutorials ← tt_youtube, passback_basics, passback_tutorials, footbagspot_*, polini_pointers, footbag_foundations, everything_footbag
- Demonstrations ← shred_global, footbag_finland, flipsider_footbag, passback_demos, anz_trikz
- Records ← passback_records (+ freestyle_records bridge)
- Archives ← footbag_hof_archive, tt1, tt2, passback_youtube, curated_playlists

## Text-only wireframe

```
┌──────────────────────────────────────────────────────────────┐
│  Footbag Media                                               │
│  Tutorials, demonstrations, records, and archives.           │
├──────────────────────────────────────────────────────────────┤
│  ▶ START HERE                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Learn Freestyle                                        │ │
│  │  New to footbag? Follow the Tricks of the Trade ladder  │ │
│  │  from Toe Stall to your first compound.   [Start →]     │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  BROWSE BY GOAL                                              │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐      │
│  │ Trick         │ │ Demonstra-    │ │ Records       │      │
│  │ Tutorials     │ │ tions         │ │ 200+ record   │      │
│  │ Learn a trick │ │ Watch it done │ │ clips, timed  │      │
│  │        [→]    │ │        [→]    │ │        [→]    │      │
│  └───────────────┘ └───────────────┘ └───────────────┘      │
│  ┌───────────────┐ ┌───────────────┐                        │
│  │ Historical    │ │ Featured      │                        │
│  │ Archives      │ │ Collections   │                        │
│  │ HoF, TT DVDs  │ │ Curated sets  │                        │
│  │        [→]    │ │        [→]    │                        │
│  └───────────────┘ └───────────────┘                        │
│                                                              │
│  ─ Advanced ─────────────────────────────────────────────   │
│  [ Browse by hashtag → ]   [ All source galleries → ]        │
└──────────────────────────────────────────────────────────────┘
```

## Constraints / notes
- On-paper only; no implementation. Surfaces, controllers, and seeders are **Dave-owned media writes**.
- The redesign is mostly **re-grouping existing galleries by intent** + one new "Learn" path — it does not require new media to ship value (it surfaces what already exists, including the unsurfaced items from Part A).
