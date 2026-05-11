# UX2 -- Editorial Trick-Page Layout Evolution

Design exploration only. No implementation in this artifact. No Wave-2 data work, no parser logic, no schema migration, no bulk FootbagMoves prose import.

Sibling artifacts: `UX1_NOTATION_INTERACTION_AUDIT.md` (token-level UX, landed Phase A+B), `prototype-spinning-symposium-whirl.html` (reference ontology prototype), `prototypes/` (5 archetype prototypes + README).

Target validation surface: `/freestyle/tricks/{montage,mullet,hatchet,pigbeater,tap}` (Wave-1 canonical rows landed via loader 19 on 2026-05-10).

---

## 1. Executive summary

The current `src/views/freestyle/trick.hbs` is **ontology-first**: structural decomposition, parser diagnostics, and editorial composition tables dominate. This was correct for the Phase 6 grammar-rendering rollout. With the parser stable at 89/45/1/1, federation track established, and Wave-1 canonical rows landed, the production audience shifts from grammar-validation reviewers to learners and competition watchers.

UX2 proposes a **media-first, learner-oriented hierarchy** that:

1. Leads with a hero + featured media slot, falling back gracefully when no media exists (every Wave-1 trick currently has 0 media links).
2. Adds five **lightweight, optional** prose fields (short_description, execution_summary, learning_notes, prerequisite_notes, featured_media_priority). Each one is a single column on `freestyle_tricks`. No new tables, no schema systems.
3. Demotes (does not remove) parser diagnostics and structural decomposition to a collapsible diagnostic panel near the bottom of the page.
4. Preserves the warm/cool palette discipline (operational warm, semantic cool, editorial neutral) and the three-layer parser/editorial/operational separation.
5. Preserves federation-not-adoption: any FM-derived prose is curator-mediated, never bulk-imported.

The layout is structural redesign. The technical sections (notation, set notation, structural decomposition, family ladder, passback records, record progression, related/previous/next) **stay**; they move position and group into a "Reference & diagnostics" tail.

---

## 2. Current state inventory

### 2.1 Section sequence (live `trick.hbs`)

| Order | Section | Conditional | Audience signal |
|------:|---------|-------------|-----------------|
| 1 | Hero (breadcrumb, title, family badge, ADD badge, sort name, kicks-record badge) | always | mixed |
| 2 | About This Trick (description, ADD composition or base, aliases, family note) | `if dictEntry` | learner |
| 3 | Notation (semantic, token-coloured, glossary link) | `if notationDisplay` | grammar-aware |
| 4 | Set notation (operational, warm palette, sourceNote, glossary link) | `if operationalNotation` | grammar-aware |
| 5 | Structural decomposition (parser diagnostics, asserted vs computed, editorial decomposition table, policy tokens, diagnostic details) | `if notationGrammar` | reviewer / curator |
| 6 | Pathways ("What you can do with this trick": learn / watch / family) | always | learner |
| 7 | Related Tricks (cross-family token-shared) | `if relatedTricks.length` | learner |
| 8 | Previous Tricks (lower-ADD same-family) | `if previousTricks.length` | learner |
| 9 | Reference Media (tutorials + demonstrations grid) | `if hasReferenceMedia` | learner |
| 10 | Next Tricks (higher-ADD same-family) | `if nextTricks.length` | learner |
| 11 | Trick Family (full difficulty ladder) | `if hasFamilyMembers` | learner |
| 12 | Passback Records (record table) | `if recordCount` | watcher |
| 13 | Record Progression (history of best) | `if hasProgression` | watcher |
| 14 | Source-note footer | always | meta |

### 2.2 What the current order optimises for

The current order maximises **ontology validation per scroll-pixel**. Sections 3, 4, 5 sit immediately after the description, before any media or pathway content. This served Phase 6 reviewer ergonomics. It is not the right order for a logged-out learner arriving from a Google search for "footbag pigbeater how to."

### 2.3 What is missing

- **Featured media slot.** Reference Media (section 9) is a grid of all tutorials + demonstrations; there is no single hero-adjacent "watch this first" video. The video-facade partial is already production-grade.
- **Short executive summary.** `dictEntry.description` is the one prose field. It is sometimes a 5-word phrase ("Spinning-modified ducking paradox symposium whirl"), sometimes a paragraph. No structural distinction between "elevator-pitch summary" and "longer explanation."
- **Execution / mechanics prose.** The operational-notation block is dense formal notation. Nothing renders "first you set the bag, then you spin, then you land in a clipper" in human prose.
- **Prerequisites.** Previous Tricks shows lower-ADD same-family rows, but does not say "before attempting this, you should be able to do X consistently."
- **Learning notes.** Nothing curator-authored captures the practitioner-level "this is the trick where most people fail because Y" insight.

### 2.4 Wave-1 data state (relevant constraints)

All five Wave-1 validation rows have **0 reference media** in `freestyle_media_links` as of 2026-05-10:

| Slug | ADD | Family | Modifier links | Description length | Media |
|------|----:|--------|---------------:|-------------------:|------:|
| montage | 7 | whirl | 4 (ducking, paradox, spinning, symposium) | 50 chars | 0 |
| mullet | 6 | whirl | 3 (ducking, paradox, symposium) | tbd | 0 |
| hatchet | tbd | tbd | tbd | tbd | 0 |
| pigbeater | tbd | legover (post-fix) | tbd | tbd | 0 |
| tap | tbd | tbd | tbd | tbd | 0 |

Implication: a "featured media slot" must render gracefully empty in 100% of validation cases. The empty state is **the default state** for Wave-1, not an edge case.

---

## 3. Prototype reference inventory

### 3.1 `prototype-spinning-symposium-whirl.html` (reference baseline, 20955 bytes)

Standalone HTML, 360 lines, semantic role palette implemented inline. Section sequence:

1. Eyebrow + trick-name-display (role-coloured tokens at h1 scale)
2. ADD panel (asserted, computed, status badge, parser version)
3. Jobs notation (raw)
4. Structural decomposition (role-bucket table)
5. Modifier layering (nested boxes, outermost->innermost, with bonus weights)
6. ADD derivation (formula notation block)
7. Family lineage (per-ADD-tier rows, current highlighted)
8. Related tricks (other spinning, other symposium)
9. Parse QC (warnings, policy, unresolved, raw-vs-resolved count, parse source, parsed-at)
10. Legend (role colour key)

### 3.2 What the reference prototype optimises for

The reference prototype is a **reviewer surface**. Every visual element communicates structural information for a reviewer who already knows what "rotation," "modifier," "core_family" mean. The trick-name itself becomes role-coloured at h1 scale, which works as a hook for grammar-aware audiences but reads as visual noise to a learner.

The prototype is the right artifact for the `/internal/candidate-cores/` review surface (P4 archetype, per `prototypes/README.md` §"progressive disclosure"). It is **not** the target template for the public trick-detail page.

### 3.3 What UX2 inherits from the prototype

- Token-coloured spans for the notation blocks (already shipped via UX1 Phase A).
- Family lineage tier organisation (current `Trick Family` ladder is the simpler equivalent; keep as-is for now).
- Legend pattern for the glossary deeplink (UX1 Phase B already shipped paired deeplinks).
- The "asserted is editorial truth; computed is diagnostic" framing (current copy already says this in §5).

### 3.4 What UX2 does NOT inherit

- Role-coloured trick-name at h1 scale. Too noisy for the public surface.
- Modifier-layering nested-box visualisation. The existing editorial-decomposition table already conveys this; the nested-box pattern is a reviewer affordance.
- Parse-source / parsed-at metadata at top-of-fold. Belongs in the collapsible diagnostic panel.

---

## 4. Gap analysis -- production goals vs ontology prototype

| Goal (production audience) | Current state | Prototype state | Gap |
|----------------------------|---------------|-----------------|-----|
| "Show me how this looks" | Reference Media at section 9, post-pathways | n/a (prototype omits media) | Media is too far down; no hero-adjacent featured slot. |
| "Tell me what this is in one sentence" | `description` field used both as one-liner and paragraph | n/a | No structural distinction; description content is inconsistent across rows. |
| "Tell me how to do it in plain English" | No prose field | n/a | Missing entirely. Operational notation is too formal; description is too short. |
| "What should I learn before this?" | Previous Tricks list (auto-derived by ADD) | n/a | Auto-derived list does not capture editorial prerequisite intent ("be solid on whirl + spinning before attempting"). |
| "What goes wrong when I try this?" | No prose field | n/a | Missing entirely. |
| "Show me the structural breakdown if I care" | Sections 3 + 4 + 5, always rendered | All sections at top | Currently always-visible; production should be demoted to a tail/collapsible region for non-reviewer audiences. |
| "Show me records" | Sections 12 + 13 | n/a | Already late in the page; correct placement. |

---

## 5. Proposed editorial hierarchy

Two-tier organisation: **Learn block** (top) followed by **Reference & diagnostics block** (tail). Section omission rules preserved -- the page never renders empty headers.

### 5.1 Learn block (sections 1-7)

| Order | Section | Conditional | New? | Audience signal |
|------:|---------|-------------|------|-----------------|
| 1 | Hero (breadcrumb, title, family badge, ADD badge, kicks-record badge) | always | unchanged | mixed |
| 2 | Short description (one-sentence elevator pitch) | `if short_description` | NEW field | learner |
| 3 | Featured media (single video; falls back to "tutorial coming soon" empty state) | always renders the section, body conditional | NEW slot | learner |
| 4 | About This Trick (full description, ADD composition, aliases, family note) | `if dictEntry` | renamed, content unchanged | learner |
| 5 | Execution summary (plain-English mechanics in prose) | `if execution_summary` | NEW field | learner |
| 6 | Learning notes (curator-authored gotchas / progression tips) | `if learning_notes` | NEW field | learner |
| 7 | Prerequisites (curator-authored prose; falls back to auto-derived "Previous Tricks" link) | `if prerequisite_notes` else fallback to Previous Tricks anchor | NEW field | learner |

### 5.2 Reference & diagnostics block (sections 8-17)

| Order | Section | Conditional | New? | Audience signal |
|------:|---------|-------------|------|-----------------|
| 8 | Pathways (learn / watch / family) | always | unchanged | learner |
| 9 | Reference Media (full tutorials + demonstrations grid; excludes the featured-media item if it appears here) | `if hasReferenceMedia` | unchanged content, may dedupe featured item | learner |
| 10 | Related Tricks | `if relatedTricks.length` | unchanged | learner |
| 11 | Previous Tricks (auto-derived; serves as fallback prerequisites link target) | `if previousTricks.length` | unchanged | learner |
| 12 | Next Tricks | `if nextTricks.length` | unchanged | learner |
| 13 | Trick Family ladder | `if hasFamilyMembers` | unchanged | learner |
| 14 | Notation (semantic) | `if notationDisplay` | unchanged content, demoted position | grammar-aware |
| 15 | Set notation (operational) | `if operationalNotation` | unchanged content, demoted position | grammar-aware |
| 16 | Structural decomposition (parser diagnostics + editorial decomposition + diagnostic details) | `if notationGrammar`, **wrapped in `<details>` collapsed by default** | demoted + collapsed | reviewer / curator |
| 17 | Passback Records | `if recordCount` | unchanged | watcher |
| 18 | Record Progression | `if hasProgression` | unchanged | watcher |
| 19 | Source-note footer | always | unchanged | meta |

### 5.3 Rationale for collapsing sections 14-16 into a single tail region

The prototypes README §"Which sections collapse under complexity" already established that modifier-layering is **trivial** for atom rows (P2, P5) and **conflicted** for candidate-core-family rows (P4). For public learner audiences, sections 14-16 are pedagogically useful when the user has clicked through from `/freestyle/glossary` or from a notation token; they are noise on a cold "I want to learn pigbeater" arrival.

Demoting + collapsing is the lightest-touch intervention that preserves the three-layer separation. Section 16 (`Structural decomposition`) is the only section getting wrapped in `<details>`; sections 14 and 15 remain expanded -- they are short, role-coloured, and already glossary-deeplinked.

### 5.4 Why prerequisites is two-track (prose with auto-derived fallback)

`prerequisite_notes` is curator-authored prose. If absent, the page links to the in-page anchor for `Previous Tricks`. This avoids the "missing prerequisites section" empty state without forcing curators to author prose for every row. Wave-1 reality: 0 of 5 rows have `prerequisite_notes` yet; all 5 have populated `previousTricks` lists.

---

## 6. Content-model proposal -- 5 new optional fields

Constraint per session preamble: "no large schema systems." This proposal adds **5 nullable columns to the existing `freestyle_tricks` table**. No new tables, no new joins, no migration of historical content. Curator backfill is per-row, opt-in, paced.

### 6.1 Field specs

| Field | Type | Length | Default | Renders in section | Wave-1 backfill |
|-------|------|--------|---------|--------------------|-----------------|
| `short_description` | TEXT | guideline: ~80 chars | NULL | §2 | optional |
| `execution_summary` | TEXT | guideline: 1-3 paragraphs | NULL | §5 | optional |
| `learning_notes` | TEXT | guideline: 1-3 paragraphs | NULL | §6 | optional |
| `prerequisite_notes` | TEXT | guideline: 1 paragraph | NULL | §7 (else fallback) | optional |
| `featured_media_id` | INTEGER FK -> `freestyle_media_links.id` | n/a | NULL | §3 | optional; falls back to "tutorial coming soon" |

Length guidelines are editorial, not enforced at DB level. No CHECK constraints; field intent is "use as much room as is editorially honest." The shape stays trivial.

### 6.2 Why `featured_media_id` is a single FK, not a priority enum

The original brief considered `featured_media_priority` (an integer per media row). A single FK on `freestyle_tricks` is structurally simpler:

- One row per trick decides the featured media. No tie-breaking logic on the service side.
- Soft delete: setting to NULL falls back to the standard reference-media grid.
- Curator workflow is "pick the one tile you want at the top," not "rank every tile."
- If the chosen media is later removed from `freestyle_media_links`, the FK NULLs automatically (ON DELETE SET NULL); page falls back cleanly.

If multi-featured rendering becomes a real need later, a follow-up can replace the FK with a sidecar table. Not a now-problem.

### 6.3 Why prose lives directly on `freestyle_tricks`

Sidecar table (`freestyle_trick_prose` keyed by `trick_id`) was considered. Rejected for now because:

- All five fields are 1-to-1 with the trick row. A sidecar adds a JOIN with no normalisation benefit.
- Wave-1 backfill is opt-in and slow; sparse columns on the main table are tolerable at 149 rows.
- If FM federation later produces high-volume prose with provenance metadata, a sidecar (`freestyle_trick_prose_sources` with `source_url`, `source_kind`, `imported_at`) becomes the right place. Not a now-problem.

### 6.4 What this proposal does NOT do

- No `is_editorial_complete` flag. Page renders sections conditionally; "completeness" is implicit.
- No content versioning / draft state. Curator authors directly via the existing dictionary-loader red-corrections workflow.
- No FM auto-import. The prose fields are curator-mediated; federation prose evidence (where it exists) becomes a starting draft for human review, never an auto-publish.
- No Wave-2 row insertion. The new fields land before Wave-2 candidate processing resumes.

### 6.5 Loader path

Curator backfill flows through the existing `legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` per-field-correction pattern. Loader 19 already accepts `field=short_description` / `field=execution_summary` / etc. because the f-string SQL UPDATE is field-name-parametric. The SOURCE_ASSERTABLE_FIELDS audit-trail allowlist will need a single line each per new field; that is a 1-line change per field, not a schema-system addition.

Memory ref: `feedback_loader_19_family_default.md` documents the per-field-correction pattern that loader 19 supports today.

---

## 7. Desktop wireframe (>=900px)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb: freestyle / tricks / whirl family                            │
│                                                                          │
│ Montage                            [whirl family]  [7 ADD]               │
│ sort name: spinning-ducking-paradox-symposium-whirl                      │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Spinning-modified ducking paradox symposium whirl.                       │  ← §2 short_description
│                                                                          │     (single sentence, large readable)
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────────────────────────┐  ┌─────────────────────────────┐    │
│ │                                  │  │ Featured video               │    │
│ │     [ video facade thumbnail ]   │  │ Brief caption explaining     │    │
│ │     play overlay                 │  │ what this video demonstrates │    │  ← §3 featured media
│ │                                  │  │                              │    │     (graceful empty fallback:
│ │                                  │  │ Source: WorldFootbag TT #..  │    │     "Tutorial coming soon.
│ └──────────────────────────────────┘  └─────────────────────────────┘    │     [browse demos →]")
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ About this trick                                                         │
│ ─────────────                                                            │
│ Spinning-modified ducking paradox symposium whirl.                       │  ← §4 full description
│                                                                          │     (currently the only prose field;
│ How it's built: ducking + paradox + symposium + spinning + whirl = 7    │     becomes the "long form" alongside
│ Also known as: montage, the montage                                     │     the new short_description)
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Execution                                                                │  ← §5 execution_summary
│ ─────────                                                                │
│ <1-3 paragraphs of plain-English mechanics. Optional. Curator-authored.> │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Learning notes                                                           │  ← §6 learning_notes
│ ──────────────                                                           │
│ <1-3 paragraphs. Optional. Where practitioners commonly struggle.>       │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Before you try this                                                      │  ← §7 prerequisite_notes
│ ────────────────────                                                     │     (else: link to anchor #previous-tricks)
│ <Curator prose; e.g. "Be solid on whirl + spinning before attempting.">  │
└──────────────────────────────────────────────────────────────────────────┘

────────────────────── Reference & diagnostics tail ────────────────────────

┌──────────────────────────────────────────────────────────────────────────┐
│ What you can do with this trick (pathways)                               │
│ ────────────────────────────────                                         │
│ [ Learn this trick  ]  [ Watch records  ]  [ Related families  ]         │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Reference media (tutorials + demonstrations)                             │
│ ────────────────                                                         │
│ Tutorials                                                                │
│   [thumb] [thumb] [thumb]                                                │
│ Demonstrations                                                           │
│   [thumb] [thumb] [thumb] [thumb] [thumb]                                │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Related Tricks   |   Previous Tricks   |   Next Tricks                   │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Whirl family ladder                                                      │
│ ──────────────                                                           │
│ 3 ADD: whirl                                                             │
│ 4 ADD: ducking-whirl, paradox-whirl, ...                                 │
│ 5 ADD: blurry-whirl, paradox-symposium-whirl, ...                        │
│ 6 ADD: mullet, ...                                                       │
│ 7 ADD: montage ← here                                                    │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Notation (semantic)                       [Token reference →]            │  ← §14 cool palette
│ ─────────                                                                │
│ ducking paradox symposium spinning whirl                                 │
│ (role-coloured tokens, glossary link)                                    │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Set notation (operational)                [Token reference →]            │  ← §15 warm palette
│ ─────────────                                                            │
│ <operational tokens here>                                                │
│ Source: FM curator-reviewed.                                             │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ ▶ Structural decomposition (diagnostic)                                  │  ← §16 collapsed by default
│ ──────────────────────────                                               │     (click to expand)
│ <parser status, asserted vs computed, editorial decomposition, policy>   │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Passback records                                                         │
│ ─────────────                                                            │
│ <table>                                                                  │
└──────────────────────────────────────────────────────────────────────────┘

[ Record Progression ]
[ Source note footer ]
```

---

## 8. Mobile wireframe (375px)

```
┌────────────────────────────────┐
│ freestyle / tricks / whirl     │
│                                │
│ Montage                        │
│ [whirl family]  [7 ADD]        │
│ spinning-ducking-paradox-…     │
│ symposium-whirl                │
└────────────────────────────────┘

┌────────────────────────────────┐
│ Spinning-modified ducking      │
│ paradox symposium whirl.       │  ← §2 (line wraps cleanly)
└────────────────────────────────┘

┌────────────────────────────────┐
│ ┌────────────────────────────┐ │
│ │                            │ │
│ │ [ video thumbnail 16:9 ]   │ │  ← §3 single-column;
│ │ play overlay               │ │     thumbnail full-width
│ │                            │ │     (or empty state card)
│ └────────────────────────────┘ │
│ Caption                        │
│ Source label                   │
└────────────────────────────────┘

┌────────────────────────────────┐
│ About this trick               │
│ ─────────────                  │
│ Spinning-modified ducking      │
│ paradox symposium whirl.       │
│                                │
│ How it's built:                │
│ ducking + paradox + symposium  │
│ + spinning + whirl = 7         │
│                                │
│ Also known as: montage         │
└────────────────────────────────┘

┌────────────────────────────────┐
│ Execution                      │  ← §5 only renders if
│ ─────────                      │     field is non-null
│ <prose>                        │
└────────────────────────────────┘

┌────────────────────────────────┐
│ Learning notes                 │  ← §6 only renders if
│ ──────────────                 │     field is non-null
│ <prose>                        │
└────────────────────────────────┘

┌────────────────────────────────┐
│ Before you try this            │  ← §7 prose, OR
│ ────────────────────           │     "See previous tricks →"
│ <prose>                        │     link
└────────────────────────────────┘

──── Reference & diagnostics ────

┌────────────────────────────────┐
│ What you can do                │  ← §8 stacked vertically
│ ───────────────                │     (instead of horizontal
│ [ Learn this trick   →    ]    │     3-up on desktop)
│ [ Watch records      →    ]    │
│ [ Related families   →    ]    │
└────────────────────────────────┘

[ Reference media -- vertical stack ]
[ Related / Previous / Next -- stacked sections ]
[ Family ladder -- existing vertical layout ]

┌────────────────────────────────┐
│ Notation (semantic)            │  ← §14 cool palette
│ ─────────                      │     tokens wrap to multiple
│ ducking paradox                │     lines on narrow screens
│ symposium spinning whirl       │
│ Token reference →              │
└────────────────────────────────┘

┌────────────────────────────────┐
│ Set notation (operational)     │  ← §15 warm palette
│ ─────────────                  │     wraps cleanly
│ <tokens wrap>                  │
│ Source: FM curator-reviewed.   │
│ Token reference →              │
└────────────────────────────────┘

┌────────────────────────────────┐
│ ▶ Structural decomposition     │  ← §16 collapsed
│   (diagnostic)                 │     tap to expand
│ ──────────────────────────     │
└────────────────────────────────┘

[ Passback records -- existing horizontally-scrollable table ]
[ Record progression -- existing horizontally-scrollable table ]
[ Source-note footer ]
```

---

## 9. Featured-media slot -- thumbnail and responsive details

### 9.1 Sizing

| Viewport | Layout | Thumbnail aspect | Caption position |
|----------|--------|------------------|------------------|
| >=900px | 2-column grid: thumbnail (left, ~60% width) + caption block (right) | 16:9 | right of thumbnail |
| 600-899px | 2-column with narrower caption (40/60) | 16:9 | right of thumbnail |
| <600px | single column | 16:9 full-width | below thumbnail |

### 9.2 Empty-state

When `featured_media_id IS NULL`:

```
┌────────────────────────────────┐
│ Featured video                 │
│ ───────────────                │
│ Tutorial coming soon.          │
│                                │
│ Curated tutorials and          │
│ performance clips appear in    │
│ Reference Media below.         │
│ [ See reference media →  ]     │
└────────────────────────────────┘
```

Anchor target: `#reference-media` (already exists on `trick.hbs` line 394). If `hasReferenceMedia` is also false, render the empty state without the deep-link button.

### 9.3 Dedup rule

If the chosen `featured_media_id` matches a tile in the Reference Media grid below, the service layer can either:

- A) suppress the duplicate from the §9 grid (cleaner visual)
- B) keep both (the grid becomes a "full catalogue" view; the featured slot is "we recommend starting here")

Recommendation: B. The featured slot is a recommendation surface, not a uniqueness constraint. Showing the same tile twice (once featured, once in the grid) communicates "this is the canonical demo, and there are more like it." This avoids service-layer dedup complexity and keeps the grid's tutorial-vs-demonstration split intact.

### 9.4 Reuse of `video-facade` partial

The existing `views/partials/video-facade.hbs` (used by Reference Media §9) renders a thumbnail with play-overlay; click-through opens the embedded player. Reuse without changes. The featured slot is structurally a single-tile wrapper around the same partial.

---

## 10. Validation against the 5 Wave-1 tricks

### 10.1 Montage (ADD 7, 4 modifier links, densest)

| Section | State at first render |
|---------|----------------------|
| §1 hero | "Montage" + whirl family + 7 ADD + sort_name |
| §2 short | null -> hidden |
| §3 featured | empty state -> renders "Tutorial coming soon" card |
| §4 about | renders existing description + ADD composition table |
| §5-§7 prose | all null -> all hidden |
| §8 pathways | renders 3-card grid (learn / watch / family) |
| §9 ref media | hasReferenceMedia=false -> hidden |
| §10-12 lateral nav | renders Related (whirl family siblings, 16 of them) + Previous + Next |
| §13 family ladder | renders 16-member ladder, montage highlighted at 7 ADD |
| §14 semantic notation | renders 5 role-coloured tokens (densest valid case) |
| §15 operational notation | renders, sourceNote = "FM curator-reviewed (2026-05-10)" |
| §16 structural decomp | collapsed; on-expand shows 5-row editorial table |
| §17-18 records | recordCount=0 -> hidden |

**Verdict:** No empty-state hazards. The 4-modifier editorial decomposition is hidden by default in §16; previous Wave-1 mobile testing already validated it does not overflow when expanded.

### 10.2 Mullet (ADD 6, 3 modifier links, whirl family)

Same shape as Montage with one fewer modifier. §13 family ladder shows mullet (6 ADD) and montage (7 ADD) on adjacent tiers; the lateral nav §10-12 will surface montage as a Next Trick, providing organic progression discovery.

### 10.3 Hatchet, Pigbeater, Tap

Until verified against the live DB, treat each as a standard rendering case. Pigbeater specifically: family was post-corrected from eggbeater to legover via per-field correction (memory `feedback_loader_19_family_default.md`); the §13 family ladder will reflect the correction; §14 notation will read across legover-family modifiers. The validation here is that demoting §14-16 to the tail does NOT hide the post-fix family-ladder rendering for the user trying to confirm Pigbeater is now in the right family.

**Risk surfaced:** for editors landing on a row they just corrected, the demoted structural-decomposition is harder to reach. Mitigation: keep §13 (family ladder) in the Learn block where it currently renders; only §14-16 demote. The family ladder is the most-load-bearing post-correction verification surface and stays prominent.

### 10.4 Tap (likely simplest)

For an atom or near-atom row, sections §14-16 may render trivially or be omitted entirely (notation NULL, operational_notation NULL, notationGrammar status=exact via self-atom). The tail block becomes very short or absent. The Learn block still has §1, §4, §8, plus whatever lateral nav and family ladder rows apply. No empty-state hazard.

---

## 11. Migration risks and mitigations

| Risk | Likelihood | Severity | Mitigation |
|------|-----------:|---------:|------------|
| All 5 Wave-1 rows render empty featured-media states. | certain | low | Empty state is a first-class design; renders gracefully with deep-link to ref-media if any exists. |
| Curators interpret §2 short_description as "rewrite the existing description here" -> duplicate prose. | medium | low | Loader-side comment + editorial doc explain "short is for the elevator pitch; description is the longer paragraph." |
| Demoting §14-16 below pathways/lateral-nav breaks existing integration tests that assert section order. | low | medium | Tests live in `tests/integration/freestyle.tricks-insights.routes.test.ts` (per UX1 work). Run test suite during implementation; update assertion ordering. Tests covering presence/absence of content stay valid. |
| Featured-media FK to `freestyle_media_links.id` becomes stale if a media row is hard-deleted. | low | low | `ON DELETE SET NULL` on the FK; section §3 falls back to empty state. |
| `featured_media_id` chosen by a curator does not appear in `freestyle_media_links` for that trick (cross-trick FK). | low | low | DB-level CHECK or service-layer guard: featured media must be linked to the same trick. Reject otherwise. |
| Curator backfill of `execution_summary` slowly absorbs federation FM prose, eroding federation-not-adoption. | medium | high (governance) | Required: any FM-derived sentence in `execution_summary` carries a sourceNote (same pattern as operational_notation). The field is curator-mediated; FM evidence is starting material, never auto-published. Reuse the audit-trail allowlist pattern. |
| §16's `<details>` collapse loses keyboard accessibility on some screen readers. | low | medium | Native `<details>` is broadly supported; tab focus + Enter to expand is standard. Verify with axe-core during implementation. |
| The "Tutorial coming soon" empty state becomes the dominant first impression because Wave-1 has zero media. | high | medium | Mitigate by curator priority: tag at least 1 featured-media slot per Wave-1 trick before announcing the new layout. Reuse the `tt_youtube` source (memory ref: `reference_worldfootbag_channel.md`) for whirl-family TT lessons. |

---

## 12. Contract preservations

UX2 preserves the following contracts that earlier phases established:

| Contract | Source | How UX2 preserves it |
|----------|--------|----------------------|
| Three-layer separation (parser / editorial / operational) | `feedback_parser_editorial_separation.md` | All three sections remain rendered, with independent data sources. Demoted but not merged. |
| Federation-not-adoption | `project_freestyle_federation.md` | New prose fields are curator-authored; FM evidence requires sourceNote attribution. No bulk import path. |
| Warm/cool palette discipline | UX1 audit + landed Phase A | Semantic notation §14 cool (#2a7a3a); operational §15 warm (#b45309). Featured-media slot uses neutral palette to avoid competing. |
| Restraint-first design | `feedback_modifier_public_visibility.md` + prototypes README | New sections only render when their fields are populated. Empty states are honest ("coming soon"), not decorative. |
| Modifier reference suppressed on public freestyle pages | `feedback_modifier_public_visibility.md` | No change; UX2 does not surface modifier reference content. |
| Internal-only constraint | `feedback_internal_only_constraint.md` | The public trick-detail page stays public-facing. Any curator-facing companion (e.g., a "draft preview" mode for the new prose fields) lives under `/internal/` if built. |
| Asserted ADD is editorial truth | DD; current copy in §16 | Unchanged. Demoted section preserves the asserted-vs-computed framing. |
| Doc style: no em dashes in canonical-doc prose | `.claude/rules/doc-governance.md` | This artifact follows the rule (exploration doc, but governance-aware). |
| Git commit boundary (AI stages, user commits) | `feedback_git_commit_boundary.md` | UX2 produces an artifact only. No git commit attempted. |

---

## 13. Out of scope (deferred / not in UX2)

- Implementation of §3-§7 sections. UX2 is design-only.
- Schema migration for the 5 new columns. Pending user go-ahead.
- Curator backfill workflow for the new prose fields. Pending.
- Wave-2 canonical insertion. Track is paused pending UX2 review.
- Parser changes (descriptive_roles vs add_contributing_roles split per `prototypes/README.md` finding §1). Separate parser-refinement track.
- HTML5 Popover-API token disclosure (UX1 Phase C). Deferred.
- Gallery-edit-tool changes (Dave's track per `feedback_gallery_dave_track.md`).

---

## 14. Recommended next steps (pending user go-ahead)

If user approves direction:

1. Surface this plan to Dave for visual-design review (he owns gallery and may have preferences on featured-media slot styling).
2. Add the 5 columns to `freestyle_tricks` via a Phase migration script (single ALTER TABLE statement set, schema.sql diff).
3. Extend loader 19's SOURCE_ASSERTABLE_FIELDS allowlist for the 4 new prose fields + featured_media_id.
4. Author the section template updates in `trick.hbs` per §5.1-§5.2.
5. Extend the freestyle service to shape `content.shortDescription`, `content.featuredMedia`, `content.executionSummary`, `content.learningNotes`, `content.prerequisiteNotes`.
6. Backfill 1 featured_media_id per Wave-1 trick (prioritise from the TT inventory).
7. Update existing route/integration tests for new section presence/order assertions.
8. Optional Wave-1 prose backfill -- 1-2 fields per trick, hand-authored, no FM bulk.

This is sequencing only. No approval implied for any step.
