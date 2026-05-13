# LANDING_PHILOSOPHY_REALIGNMENT_REVIEW — 2026-05-13

**Project:** Landing-page + trick-page philosophy realignment to the symbolic / PassBack-informed architecture
**Type:** Information-architecture critique + recommendations. Not a cosmetic pass; the public-facing philosophy must match the evolved back-end.
**Stance:** Optimize for clarity, pedagogy, symbolic coherence, editorial intentionality, movement-language framing. Restraint: no sixth browse axis; no archetype browse; glossary-first for new symbolic concepts.
**Constraints:** preserves prior strategic-review conclusions (5-view ceiling; archetypes-in-glossary-not-browse; observational/canonical separation; curated/editorial distinction).

---

## 0. The philosophical anchor

The site should communicate:

> **Freestyle footbag is a compositional movement language.**

It currently communicates, by default:

> *Freestyle footbag is a list of tricks with notation attached.*

That mismatch is the realignment task. The back-end now supports movement-language framing (operators, decomposition, topology, semantic navigation, glossary architecture). The front door doesn't yet reflect it.

Three structural shifts dominate the recommendations:

1. **Re-center the landing page around movement-language framing** (sets, dexes, operators, modifiers, decomposition) — not around notation systems.
2. **Restore a standalone operators/sets educational surface** (the user's #7 complaint; this was good and is missing).
3. **Audit trick-page symbolic consistency** — Torque rendering only "TORQUE" is unacceptable now that symbolic infrastructure exists.

---

## A. LANDING-PAGE ARCHITECTURE CRITIQUE

### A.1 Current landing-page structure (as observed)

```
Hero (mascot + tagline)
└─ "What is Freestyle Footbag?" — 5-paragraph prose intro
└─ Competition Formats — 2-card grid (Routines, Shred)
└─ Featured Video — single panel (Footbag 2026 San Marino)
└─ The Freestyle Reference — 3-layer list (Glossary, Dictionary, Notation)
└─ Portal cards (2-col, 8 cards) — Tutorials, Glossary, Dictionary, Notation Reference,
   World Records, Competition, History, Insights
└─ Get Started tiles — 3-col placeholder grid
```

### A.2 What works

- The mascot + hero is friendly and brand-consistent
- Competition Formats (Routines vs Shred) succeeds at explaining the two competitive shapes
- The Reference layer list IS pedagogically real — Glossary / Dictionary / Notation captures three real depths
- Portal cards are intent-ordered (learn → reference → records → competition → context → analysis)
- The recent DISC-2 `/freestyle/learn` pointer paragraph is well-placed

### A.3 What's misaligned

Five structural issues (mapped to user complaints):

| Issue | Where it lives | Severity |
|---|---|---|
| **1. "What is Freestyle Footbag?" intro is generic** | content.intro.paragraphs (5 paragraphs) | High |
| **2. Notation framing dominates The Freestyle Reference** | "Notation" gets equal weight to Glossary + Dictionary; Jobs-notation card on its own | High |
| **3. "Browse by sets" link is obsolete** | Trick Dictionary card secondary action | Trivial fix |
| **4. Tutorials / Learning section is weak** | Generic "Tutorials & Learning" card with 4 gallery deep-links; no PassBack educational presence | High |
| **5. The standalone operators/sets overview is missing entirely** | Was present in legacy; not in current landing | High — restore as glossary-anchored surface, not browse |

Plus three secondary issues:

| Issue | Where | Severity |
|---|---|---|
| **6. Featured Video is a singleton** — fragmented from other curated media | "Featured Video" section | Medium |
| **7. History card prose is fine, but the History page itself needs museum direction** | History portal card → /freestyle/history | Medium — recommended in curated-media intake §G |
| **8. Symbolic / topology / component navigation is invisible from the landing page** | No mention of `/freestyle/learn` until the Reference paragraph; component view + topology view never named | Medium |

### A.4 The root tension

The landing page's prose treats **notation as the structural anchor** ("its own structural language. Three reference layers explain it..."). After the symbolic-grammar layer + V5 glossary work, the structural anchor should be **movement composition**: sets, dexes, operators, body actions, the timing clock. Notation describes that composition; it isn't the composition itself.

Reframing the prose flips the page from "the site that catalogs tricks" to "the site that teaches movement composition."

---

## B. PROPOSED REVISED LANDING-PAGE STRUCTURE

A six-section reordering. Each section is a deliberate pedagogical step; the page reads top-to-bottom as a learner's first hour.

```
1. Hero (mascot + tagline) — UNCHANGED
2. What is Freestyle Footbag? — REWRITTEN movement-language framing
3. Featured Freestyle (curated strip) — REPLACES "Featured Video" singleton
4. The Movement Language — NEW section (replaces "The Freestyle Reference")
   ├─ Sets + body operators (mini operator board)
   ├─ Glossary CTA + /freestyle/learn CTA
   └─ Dictionary CTA + symbolic browse CTAs
5. Learning paths — REPLACES generic Tutorials card
   ├─ PassBack "How to Learn a Footbag Trick" (newly curated)
   ├─ PassBack "How to Identify & Name Freestyle Tricks" (newly curated)
   └─ Curated tutorial galleries (TT, AnzTrikz, etc.)
6. Reference + history portal cards — TRIMMED grid
   ├─ World Records
   ├─ Competition
   ├─ History (museum direction — see §I)
   └─ Insights
7. Get Started tiles — UNCHANGED
```

### B.1 What this reordering accomplishes

- **Movement-language framing dominates** by section 2 + section 4
- **Curated media surfaces as one strip**, not a singleton + scattered cards
- **Learning paths get a dedicated section**, with PassBack canonical methodology pieces as the spine
- **Notation drops from co-equal status** to a referenced layer inside §4
- **Portal cards trim from 8 to 4** — the four that are genuinely browse destinations (records, competition, history, insights). The other four (Tutorials, Glossary, Dictionary, Notation) integrate into §4 + §5 as content, not as portal tiles

### B.2 The single biggest structural change

The current §4 ("The Freestyle Reference") becomes §4 ("The Movement Language"). The prose stops being *"three layers to navigate this catalog"* and starts being *"this is a language; here's how the parts compose."* This single rewrite carries most of the philosophical realignment.

---

## C. SECTION-BY-SECTION REWRITE RECOMMENDATIONS

### C.1 Hero (unchanged)

Mascot + tagline. The current "Tricks, combos, and choreographed routines set to music" is acceptable — though `"A compositional movement language built from sets, dexes, and body operators."` would be sharper. **Recommend: replace the tagline.** One-line change.

### C.2 "What is Freestyle Footbag?" — proposed rewrite

The current 5-paragraph intro is generic sports description. Replace with **3-4 movement-language-anchored paragraphs**:

```
Freestyle footbag is a compositional movement language. Players combine
a small vocabulary of body actions — sets, dexes, spins, ducks, hip
pivots — into named tricks, and tricks into flowing combos. The list
of trick names is large, but the underlying language is small: once
you can read a trick, you can read all of them.

Three movement primitives anchor the language:
  • A SET sends the bag into the air.
  • A DEX is the leg circling the bag while it's in the air, either
    hippy (hip-driven thigh sweep) or leggy (knee-driven calf circle).
  • A CATCH lands the bag on a surface — toe, clipper, inside, sole.

Modifiers transform these primitives. Spinning adds a full-body
rotation. Paradox inserts a hip pivot between two dexes. Stepping
relocates a foot in the uptime. Each modifier is an operator that takes
a base trick and produces a new one. "Ripwalk" is the operator
"stepping" applied to the base "butterfly"; "Mobius" is "spinning"
applied to "torque"; "Phoenix" is "pixie + ducking" applied to
"butterfly". Names get long when the composition is dense — and the
naming is readable.

The ADD (Additional Degree of Difficulty) system gives a numerical
weight to each composed trick. ADD scoring + execution judging together
produce a complete picture of a routine's difficulty and style.
```

The new intro:
- **Leads with "compositional movement language"** (the philosophical anchor)
- **Names the three movement primitives explicitly** (set, dex, catch)
- **Introduces hippy/leggy on first paragraph** (the prior strategic-review's first-class concept)
- **Shows operator composition with Ripwalk, Mobius, Phoenix** (the same examples threaded through the V5 glossary primer)
- **Closes with ADD** (scoring after structure, per the GLOSSARY-V5 PassBack-audit recommendation)

### C.3 Featured Video → "Featured Freestyle" curated strip

Replace the singleton panel with a small editorially-curated strip of 4-6 items:

```
Featured Freestyle (mixed showcase + historical + tutorial)
├─ Footbag 2026 San Marino (current featured) — showcase / community overview
├─ 1998 Worlds Women's Freestyle Finals — historical archive
├─ PassBack — How to Identify & Name Freestyle Tricks — educational
├─ Big footbag tricks (CeilingF4n) playlist — inspiration
└─ 1-2 additional curator picks
```

Source: items already in `legacy_data/inputs/curated/media/media_assets.csv` (the recent intake) + future high-ROI additions per `CURATED_MEDIA_INTAKE_REPORT.md` §F.

Visual: a single row of thumbnails with editorial captions ("Why this is featured"). NOT a video wall. Maximum 6 items; curator-chosen.

### C.4 The Movement Language (replaces "The Freestyle Reference")

```
H2: The Movement Language

[short intro paragraph]
Freestyle has a small grammar of operators that transform a small
inventory of base tricks into many compounds. Two reference layers
explain it.

[two-column mini layout]
┌── Operators ───────────────────┬── Bases ───────────────────────┐
│  Set operators                  │  Toe-landing bases             │
│  • Pixie  +1                    │  • Mirage   • Illusion         │
│  • Atomic  +1                   │  • Pickup   • Legover          │
│  • Quantum  +1                  │  • ATW      • Orbit            │
│  • Nuclear  +2                  │                                │
│  • Stepping  +1                 │  Clipper-landing bases         │
│  • Furious  +2                  │  • Butterfly  • Whirl          │
│                                 │  • Swirl      • Osis           │
│  Body operators                 │                                │
│  • Spinning  +1                 │                                │
│  • Gyro  +1                     │                                │
│  • Paradox  +1                  │                                │
│  • Symposium  +1                │                                │
│  • Ducking / Diving / Weaving / │                                │
│    Zulu  +1                     │                                │
└─────────────────────────────────┴────────────────────────────────┘

[Screenshot_passback_sets.png — placed here as the operator-board visual]

[CTAs row]
Glossary →  ·  Educational pathways →  ·  Trick dictionary →  ·  Browse by component →
```

This section:
- **Restores the standalone operators/sets overview** (user complaint #7)
- **Treats operators + bases as co-equal** (the actual compositional grammar)
- **Embeds the PassBack screenshot** (the recommended primary placement per the curated-media intake)
- **Surfaces 4 CTAs** that route to the existing browse-mode infrastructure
- **Drops Jobs-notation framing** from the lead position — Jobs notation now lives as a single CTA on the Notation Reference page, NOT as a co-equal Reference layer

Each operator entry links to its component-view anchor (`/freestyle/tricks?view=component#component-paradox`) and its modifier-family page where one exists.

### C.5 Learning paths (replaces generic Tutorials card)

```
H2: Learning paths

Three pathways, depending on where you are:

┌── If you're new ──────────────────────────────┐
│  Read "How to Learn a Footbag Trick" (PassBack)│
│  ↓                                              │
│  Open the educational pathways page             │
│  ↓                                              │
│  Browse the dictionary by ADD                   │
└─────────────────────────────────────────────────┘

┌── If you want to read trick names ────────────┐
│  Read "How to Identify & Name Freestyle Tricks"│
│   (PassBack — foundational)                     │
│  ↓                                              │
│  Open the Glossary                              │
│  ↓                                              │
│  Browse the dictionary by component             │
└─────────────────────────────────────────────────┘

┌── If you have a specific trick in mind ───────┐
│  Search the dictionary                          │
│  ↓                                              │
│  Watch the curated tutorial galleries:          │
│  Tricks of the Trade · AnzTrikz · Shred Global  │
│  · Footbag Finland                              │
└─────────────────────────────────────────────────┘
```

The PassBack methodology pieces (curated in the recent intake) become the **onboarding spine**. They are visible from the landing page, not buried.

### C.6 Reference + history portal cards (trimmed grid)

Drop from 8 cards to 4. The four removed (Tutorials, Glossary, Dictionary, Notation Reference) are integrated above in §4 + §5 as content rather than as portal tiles. Remaining four:

- **World Records** — unchanged
- **Competition** — unchanged
- **History** — copy refined toward museum direction (era cards, magazine covers; full proposal in §I)
- **Insights** — unchanged

### C.7 Get Started tiles (unchanged)

These are placeholders; the structure is fine. Curator decides which become populated.

---

## D. OPERATOR / SETS EDUCATIONAL-SURFACE PROPOSAL

The user's #7 complaint is the load-bearing one: the standalone operators/sets overview was good and is now missing.

### D.1 Where it lives

**NOT a new browse page.** The 5-view ceiling holds. Two options:

| Option | Pros | Cons | Recommendation |
|---|---|---|---|
| **A: Inline mini-board on the landing page §4** | Visible from the front door; no new surface | Constrained space; needs to be tight | **Recommended for v1** |
| **B: Glossary §6 anchor (Modifiers & Operators)** | Permanent home in V5 glossary; richer per-operator content | Less prominent than landing page | **Recommended for v2** (long-term) |

**Hybrid implementation:** the landing page §4 shows the compact mini-board (operator names + ADD weights + visual screenshot). Each operator name is a deep-link to its glossary §6 entry (where the full mechanical explanation lives) and its component-view group (where the tricks live). The screenshot is the unified visual.

### D.2 What each operator entry contains

In the compact landing-page form:

```
spinning  +1   full-body rotation
gyro      +1   half-body rotation (180°)
paradox   +1   hip pivot between two dexes
symposium +1   no-plant body discipline
ducking   +1   head dip — head toward bag, bag opposite
...
```

5 fields: name, ADD weight, one-line meaning, (implicit: links to glossary + component view + modifier-family page).

In the glossary §6 form (v2):

The full modifier-operator framework (`MODIFIER_OPERATOR_FRAMEWORK.md` §6) with worked examples, common confusions, transformation rules, related modifiers.

### D.3 What the surface explicitly does NOT do

- **NOT a sixth browse axis.** It's a *learning surface* that deep-links into existing browse axes.
- **NOT a duplicate of the component view.** Component view *browses tricks by operator*; this surface *defines the operators*.
- **NOT exhaustive of every modifier.** Lead with the well-defined operators (spinning, gyro, paradox, symposium, ducking, stepping, pixie, atomic, quantum, nuclear, furious, blurry); folk variants stay in glossary §11.

### D.4 Screenshot integration

Per `CURATED_MEDIA_INTAKE_REPORT.md` §E: `Screenshot_passback_sets.png` belongs at the top of the operator-board section as the visual orientation. The screenshot is the bridge from the PassBack visual vocabulary to the platform's operator framework. Caption + responsive sizing details in the curated-media report.

---

## E. GLOSSARY-GAP AUDIT RECOMMENDATIONS

Per the GLOSSARY-V5-SYNTHESIS package, the glossary is migrating to a 12-section architecture (§1–§9 primer; §10–§11 reference; §12 pathways). The audit asks: which V5 sections / entries are still missing?

### E.1 Confirmed gaps (the audit's findings)

| Missing concept | V5 home | Priority |
|---|---|---|
| `alpine` | §6 (operators) + §11 (folk variants — Alpine is operator-meta per `MODIFIER_OPERATOR_FRAMEWORK.md` §6.10) | High — user-flagged |
| `crispy` | §6 + §11 | Low — folk-flagged by PassBack |
| `weaving` / `diving` / `zulu` (full 4-way head-motion family) | §6 (per `MODIFIER_OPERATOR_FRAMEWORK.md` §6.5) | Medium — three siblings of ducking |
| `gyro` (full coverage; currently only mentioned inline) | §6 | High |
| `inspin` / `in-spin` | §6 | High — direction-flip operator |
| `xdex` (paradox sibling) | §6 + §11 | Medium — narrow scope |
| `furious` | §6 | Medium |
| `nuclear` (= paradox + atomic; +2) | §6 | High — flagship compound modifier |
| `quantum` | §6 | High (pt10 ruling now applied; needs glossary entry) |
| `fairy` | §6 + §11 | Medium — needs Red ruling first |
| `symp` / `symple` / `muted` triplet | §6 — three distinct operators OR one with three execution modes (see Section D cluster packet 1 from the ontology review) | High — needs Red disambiguation first |

### E.2 Recommended audit script (curator-side)

A small read-only Python script that:

1. Reads the V5 §1–§9 primer + §6 modifier-operator framework drafts
2. Extracts every term referenced (bolded; in worked examples; in tables)
3. Cross-references against current `glossary.hbs` content + the `glossaryAnchors.ts` resolver
4. Emits `legacy_data/reports/glossary_gap_audit.csv` with columns: `term, primer_referenced, anchor_exists, recommended_section, priority`

The script is the deterministic gap-finding mechanism; the curator decides which gaps to fill first.

### E.3 Distinction between glossary completeness and landing-page CTA language

The user's distinction is correct: glossary content authoring is curator content work. Landing-page CTA language doesn't need glossary completeness — the CTAs can read "Open glossary →" regardless of how complete the glossary is. The two don't block each other.

What DOES block: if the landing page references an operator inline (e.g., "Spinning adds a full-body rotation") and the glossary doesn't have a `spinning` entry, the inline reference can't deep-link to glossary explanation. **Recommend: the operator-board in §C.4 only links to glossary entries that already exist; missing entries link to the component-view anchor instead (which always exists when the modifier has any linked tricks).**

---

## F. TRICK-PAGE SYMBOLIC-CONSISTENCY AUDIT

The user's #10 complaint: Torque page shows only "TORQUE" instead of decomposition. Other trick pages render notation correctly. This inconsistency is unacceptable.

### F.1 The audit's scope

For every active trick (`is_active=1`, ~160 rows), verify what the trick-detail page renders for notation. The audit dimensions:

| Dimension | Values | Notes |
|---|---|---|
| Semantic notation populated? | yes / no | `freestyle_tricks.notation` column |
| Semantic notation has multiple tokens? | yes / no / (1 token only) | A single-token semantic notation like "TORQUE" surfaces the "TORQUE → nothing visible to read" issue |
| Operational notation populated? | yes / no | `freestyle_tricks.operational_notation` column |
| Editorial decomposition present? | yes / no | `editorial_decomposition` / base + modifier_links |
| Trick-detail render quality | full / partial / fallback-only / empty | Curator subjective; tied to the above three |

### F.2 The Torque specific issue

`Torque` is a structural base trick whose canonical reading is **"miraging osis"** (a "mirage-style dex applied to the osis base"). Per the canonical-active layer, Torque is its own base; its semantic notation column might literally contain "TORQUE" (the trick name) rather than "miraging osis" (the structural reading). That's a data choice — there are arguments either way:

- **Argument for "TORQUE" as semantic notation:** the trick has a community-canonical single-token name; pretending otherwise is over-formalization
- **Argument for "miraging osis":** the structural reading IS the semantic decomposition; a single-token notation that just repeats the trick name carries no information

**Recommendation:** semantic notation should follow the 8-layer model (`NOTATION_LAYER_STRATEGY.md`):
- Layer 1 (canonical name) — `Torque`
- Layer 2 (semantic compressed) — `Miraging Osis`
- Layer 3 (semantic expanded) — `Miraging Osis` (same as layer 2 here since torque has no further decomposition)
- Layer 4 (operational) — `[clip] > ss miraging op osis` (per the canonical notations the user provided)

The trick-detail page should surface **at least layer 2 (semantic compressed)** for every trick whose layer 1 differs from layer 2. Today's semantic-notation column should be re-curated to hold layer 2 values, not layer 1.

### F.3 Suggested audit + fix plan

1. **Audit script** — for each active trick, output `slug, layer_1 (canonical_name), layer_2 (current notation column), layer_4 (operational_notation)`. Identify rows where layer_2 == layer_1 (the "TORQUE" case). Emit a curator-review CSV.
2. **Curator pass** — for each flagged row, decide:
   - Does this trick have a distinct semantic compression? (Torque → Miraging Osis; Phoenix → Pixie Ducking Butterfly; Mobius → Gyro Torque)
   - If yes: update `notation` column to layer-2 form
   - If no: keep the single-token; trick-detail page should fall through to operational notation rendering
3. **Trick-detail template adjustment** — when semantic notation is single-token AND operational notation exists, prefer operational rendering as the visual lead. When both are missing, render "decomposition unavailable" placeholder (not a blank section). See §G.

### F.4 Fallback behavior is a separate question (see §G)

The audit identifies where the data is missing. §G recommends what to render when data is missing.

---

## G. NOTATION FALLBACK BEHAVIOR

### G.1 The current fallback states

Per the codebase audit:

- **Semantic notation populated + operational populated** → both render (semantic in cool palette; operational in warm). Good.
- **Semantic populated only** → semantic renders; operational section omitted entirely.
- **Operational populated only** → operational renders; semantic notation falls back to "Notation pending" (per the dictionary card).
- **Both missing** → "Notation pending" placeholder on the card; trick-detail page renders empty notation sections.

### G.2 Recommended fallback ladder

When rendering a trick's symbolic structure, fall through in this order:

```
1. If operational_notation is populated → render it (warm-palette tokens)
2. Else if semantic notation is multi-token → render it (cool-palette tokens)
3. Else if editorial decomposition (base + modifier_links) exists →
   render a derived semantic reading: "{modifier_links} {base_trick}"
   (e.g., "Spinning Whirl" derived from base=whirl + modifier_link=spinning)
4. Else → render "Decomposition pending" with a curator-only note that
   surfaces base_trick + ADD value if known
```

**The key change:** today's behavior stops at step 1 or 2. The proposed ladder adds step 3 (derive a reading from existing structural data) so that trick pages NEVER show only the canonical-name token.

### G.3 The derivation rule for step 3

`shapeDerivedSemanticReading(row, modifierLinks)`:

- Order modifier links per the canonical convention (set modifiers before body modifiers; alphabetical within type)
- Concatenate as `"{Modifier1} {Modifier2} ... {Base}"` (e.g., "Spinning Paradox Whirl")
- Display-case each token
- Emit as a single semantic-notation string; pass through `shapeNotationDisplay` for role-tagging

This makes every trick with a populated base + modifier_link automatically render a meaningful semantic decomposition, even if the curator hasn't authored the notation column explicitly.

### G.4 The Torque-specific resolution

With step 3 active, Torque's render becomes:
- Step 1: no operational_notation populated → fall through
- Step 2: semantic notation is just "TORQUE" (single token) → fall through
- Step 3: derive from base_trick=osis + modifier_link=miraging → render "Miraging Osis"

The reader sees "Miraging Osis" — the actual structural reading. Same data, no curator intervention required.

### G.5 Long-term: populate the notation column

Step 3 is a fallback; the real fix is curator-authored notation. The audit in §F identifies which rows need fixing. The derivation rule prevents the page from rendering empty in the meantime.

---

## H. CURATED EDUCATIONAL FLOW

### H.1 The onboarding spine (proposed)

Per §B.5 and the curated-media intake, three pathways:

| Pathway | First touchpoint | Spine |
|---|---|---|
| **I'm new** | "How to Learn a Footbag Trick" (PassBack) | → `/freestyle/learn` index → dictionary by ADD |
| **I want to read trick names** | "How to Identify & Name Freestyle Tricks" (PassBack) | → Glossary §6 (operators) → dictionary by component |
| **I have a trick in mind** | Search the dictionary | → Curated tutorial galleries |

These three pathways match the V5 glossary §12 pathway picker — same conceptual model, different surface.

### H.2 The curated tutorial galleries

Currently: 4 deep-linked galleries (TT, AnzTrikz, Shred Global, Footbag Finland) on the Tutorials card. The current pattern is fine; the issue is positioning, not content. Move the galleries into the "Learning paths" section §B.5, under "If you have a specific trick in mind".

### H.3 What's NOT on the educational flow

- **Records / leaderboard** — competition/community context, not learning
- **Insights** — analytical, not pedagogical
- **History** — cultural memory, not skill acquisition

Each of those gets a portal card in §B.6 (the trimmed grid), kept separate from the learning spine.

---

## I. HISTORICAL / MUSEUM DIRECTION

Per `CURATED_MEDIA_INTAKE_REPORT.md` §G — repeated here as a recommendation for the realignment:

### I.1 History should NOT become a video feed

The current History page is prose-only era descriptions. The user's spec: avoid making History "just another video feed." The right structure is era-card + artifact-gallery.

### I.2 Era cards

```
1980s — Foundational era
1990s — Worlds + ADD system + Footbag World magazine
2000s — Modifier stacking + European refinement
2010s — Documentation era + PassBack rise
2020s — Symbolic-grammar layer + curated archives
```

Each era card holds 2-3 curated artifacts (photos, magazine covers, video clips, prose) — not exhaustive. Editorial.

### I.3 First-pass artifact curation

The 1998 Worlds Women's Freestyle Finals clip (recently curated; `473a49ad-...`) anchors the 1990s era card. Curator gathers magazine covers + iconic photos as next batch (see §F.3 of the curated-media intake).

### I.4 The "Artifact of the era" pattern

Per the curated-media report: one prominent featured artifact per era, visually anchored on the era card. The visual equivalent of a museum's "feature object."

### I.5 What this is NOT

- NOT an algorithmic event-by-event archive
- NOT a Wikipedia-style chronology
- NOT a list of every documented event
- NOT exhaustive

The History page becomes a curated stroll, not a database.

---

## J. IMPLEMENTATION PRIORITY RANKING

### J.1 Quick wins (≤ 1 day each)

| # | Item | Effort | Impact |
|--:|---|---|---|
| 1 | **Replace the "Browse by sets" CTA** on the Trick Dictionary card (`?view=sets` → `?view=component`, label "Browse by component") | <1h | Removes obsolete reference |
| 2 | **Update hero tagline** to "A compositional movement language built from sets, dexes, and body operators" | <1h | One-line philosophical realignment |
| 3 | **Add /freestyle/learn CTA** to the existing portal-cards row (or to the new operator-board section) | <1h | Surfaces the existing educational pathway |
| 4 | **Drop Jobs-notation card from portal grid** OR demote its prominence | <1h | Reduces Jobs-notation overweight |
| 5 | **Rewrite "What is Freestyle Footbag?" intro paragraphs** to the §C.2 form | <2h | Largest philosophical shift per character changed |

### J.2 Medium implementation (1-3 days each)

| # | Item | Effort | Impact |
|--:|---|---|---|
| 6 | **Build the "Movement Language" section** (§C.4) with operator-board mini-grid + screenshot | 1-2d | Restores standalone operator overview |
| 7 | **Build the "Featured Freestyle" curated strip** replacing the singleton | 1d | Unified curated media presence |
| 8 | **Build the "Learning paths" section** (§C.5) with PassBack methodology pieces as spine | 1-2d | Strong onboarding |
| 9 | **Implement notation-fallback ladder step 3** (derived semantic reading) | 1-2d | Fixes Torque-class trick pages |
| 10 | **Run the trick-page symbolic-consistency audit** (§F audit script) | 1d | Curator triage list |

### J.3 Larger architectural / curator work

| # | Item | Effort | Impact |
|--:|---|---|---|
| 11 | **Curator pass: populate semantic-notation layer-2 form for ~50 affected tricks** | 5-10 curator-days | Eliminates the "TORQUE" rendering across the dictionary |
| 12 | **Curator pass: populate operational_notation column for the 144 tricks missing it** | 10-20 curator-days | Closes the 10% → 95%+ coverage gap |
| 13 | **Build the era-card history page** | 2-3 dev-days + curator content | Museum direction |
| 14 | **Run the glossary-gap audit script + curator triage** | 1d script + multi-week curator | Completes V5 glossary §6 + §11 |

### J.4 Item 9 + item 10 are the highest visible impact per day

- **Item 9 (notation-fallback ladder step 3)** — single template + service change; immediately fixes the Torque-class issue across every affected trick without curator effort
- **Item 10 (audit script)** — produces the curator triage list that drives items 11 + 12

Together: ~3 dev-days for visible improvement across the entire dictionary.

---

## K. QUICK WINS vs LARGER ARCHITECTURAL WORK

### K.1 The visible-impact pareto

If only the quick wins (J.1 + items 6, 7, 8 from J.2) ship, the landing page reflects the symbolic philosophy completely. The remaining work (curator-content + history museum + glossary completion) is content scaling, not philosophical realignment.

| Effort tier | Visible impact |
|---|---|
| **5 quick wins (J.1)** | Tagline + intro + obsolete-CTA cleanup = ~50% of philosophical realignment done in <1 day |
| **+3 medium items (J.2 #6-#8)** | Operator board + featured strip + learning paths = ~85% of philosophical realignment in 3-5 days |
| **+notation-fallback (J.2 #9)** | Torque-class fix dictionary-wide = ~95% of trick-page symbolic consistency in <2 days |
| **Full curator content scaling (J.3)** | Last 5% over weeks/months; ongoing |

### K.2 The right phase boundary for an implementation slice

**Phase 1: Quick wins + medium items 6 + 7 + 8 + 9.** ~5-7 dev-days. Lands the philosophical realignment + the Torque-class fallback fix. Curator content scaling proceeds in parallel.

**Phase 2: Trick-page symbolic-consistency curator pass.** Curator-led; multi-week.

**Phase 3: History museum surfaces.** When curator is ready with artifact gathering.

### K.3 What this realignment explicitly preserves

- **The 5-view ceiling on the dictionary** — no new browse axes. The operator board is a *landing-page learning surface*, not a browse view.
- **The card-uniformity contract** — trick-detail pages keep using the shared partials.
- **Observational / canonical separation** — observational layer remains badge-attributed.
- **The curated / editorial distinction** — curated media stays in `curated/`; raw inventories don't leak.
- **Glossary-first for new symbolic concepts** — the operator board deep-links INTO glossary, doesn't replace it.
- **Curator-first governance** — every recommendation respects curator decision authority on content.

---

## L. CONSTRAINTS HONOURED

- No sixth browse axis
- No archetype browse
- No ontology flattening
- No duplication of the component view (the operator board is a *learning* surface, not a browse)
- No legacy "reference dump" restoration (the 8-card portal grid trims to 4)
- No noisy media walls (Featured Freestyle is curated-finite, not algorithmic)
- Prior strategic-review conclusions carried forward (5-view ceiling; archetypes-in-glossary; trim redundant topology groups; token-level glossary linking is next)
- All recommendations are documentation; no code mutations in this slice

---

## M. SUMMARY (CONCISE)

**The realignment is mostly editorial + IA, not engineering.** Five quick wins (J.1) carry ~50% of the philosophical shift in under a day. Three medium items (J.2 #6-#8) carry another 35%. The notation-fallback ladder (J.2 #9) carries the dictionary-wide trick-page fix in <2 days.

**The operator-board section (§C.4 / §D)** is the single largest content addition. Restores the user-flagged missing standalone operators overview as a landing-page learning surface — NOT a sixth browse view.

**The Torque-class issue** resolves with a fallback-ladder step (§G) without curator intervention. Long-term curator pass fills the layer-2 semantic notation columns (§J.3 #11).

**The History page** evolves separately on the museum-direction track (§I + curated-media intake §G). Not a landing-page concern.

**The Featured Freestyle strip** unifies the singleton featured video + the 1998 Worlds clip + the PassBack methodology pieces + the Big footbag tricks playlist into one curated-finite strip (§C.3).

The prior strategic review's "5-view ceiling" + "glossary-first for new symbolic concepts" + "no archetype browse" stand. This realignment adds **content surface** (operator board + featured strip + learning paths) without adding new **navigational** surface.

---

*End of LANDING_PHILOSOPHY_REALIGNMENT_REVIEW.md*
