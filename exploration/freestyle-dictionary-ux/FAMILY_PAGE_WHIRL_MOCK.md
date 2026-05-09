# Mockup: Whirl Family Page

**Lane:** sandboxed UX exploration. Not production. See `EXPLORATION_CHARTER.md`.

**Hypothetical route:** `/freestyle/families/whirl` (not implemented; conceptual)

**Anchored in real ontology data** as of 2026-05-07: 11 active whirl-family canonicals, 14 aliases, 13 records, 18 curated media items.

---

## Why Whirl

Density: 11 members ranging 3–6 ADD; covers solo dex (whirl, rev-whirl), single-modifier compounds (spinning-whirl, paradox-whirl, etc.), multi-modifier compounds (paradox-symposium-whirl, spinning-symposium-whirl). Has 14 historical aliases including a famous one (Whirlwind = spinning-symposium-whirl). Solid media coverage: TT #27 + TT #42 + TT #41 (Whirling Swirl) + AnzTrikz "Whirl and Reverse Whirl" + Will Digges PS Whirl on Shred Global + 11 PassBack record clips.

Good test bed. Sufficient density to surface real UX tensions; recognizable enough that a reader can ground-truth the mockup against memory.

---

## ASCII WIREFRAME

```
═══════════════════════════════════════════════════════════════════
   /freestyle  >  Families  >  Whirl
═══════════════════════════════════════════════════════════════════

   WHIRL FAMILY                                        11 tricks
   ──────────────────────────────────────────────────────────────

   The whirl is a single-leg rotational dexterity. The leg
   passes around the bag in a circular arc while the body stays
   square. From the base whirl, the family branches by modifier:
   spinning, paradox, symposium, blurry, ducking, stepping,
   tapping, plus the direction-reversed Rev Whirl and the swirl-
   adjacent Whirling Swirl.

   ┌─────────────────────────────────────────────────────────────┐
   │  ▶ Watch a Whirl                                            │
   │  [TT #27 — Whirl Stall, by Kenny Shults]    canonical demo  │
   └─────────────────────────────────────────────────────────────┘


   THE LADDER                                  sort: ▼ ADD  □ name
   ──────────────────────────────────────────────────────────────

   3 ADD ─────────────────────────────────────────────────────
        Whirl                                           [base]
        Rev Whirl                       direction-reversed
                                        also: Whip · Reverse Whirl

   4 ADD ─────────────────────────────────────────────────────
        Symposium Whirl                 + symposium     [TT #42]
        Paradox Whirl                   + paradox       also: P-Whirl
        Ducking Whirl                   + ducking
        Stepping Whirl                  + stepping
        Tapping Whirl                   + tapping

   5 ADD ─────────────────────────────────────────────────────
        Spinning Whirl                  + spinning      ★ records: 3
        Blurry Whirl                    + blurry
        Paradox Symposium Whirl         + paradox + symposium
                                        also: PS Whirl · P-S Whirl
                                        ★ records: 2

   6 ADD ─────────────────────────────────────────────────────
        Spinning Symposium Whirl        + spinning + symposium
                                        also: Whirlwind

   ─── adjacent family member ───────────────────────────────
        Whirling Swirl                  whirling+swirl  [TT #41]
        (whirl-as-modifier on a swirl base; lives here too)


   RECORDS IN THIS FAMILY                          [show all 13 ▾]
   ──────────────────────────────────────────────────────────────

       Trick                            Count   Holder         Year
       Rev Whirl                          61    Norek          2009
       Whirl                              41    Ken Somolinos  2012
       Blurry Whirl                       35    Norek          2009
       Paradox Symposium Whirl            31    Jim Penske     2023
       Spinning Whirl                     25    SkyLon Smith   2015
       Symposium Whirl                    19    Norek          2009
       …7 more

       View all whirl-family records →


   MEDIA ACROSS THE FAMILY                                  18 items
   ──────────────────────────────────────────────────────────────

   Tutorials
       ▶ Anz' Trikz — Whirl and Reverse Whirl    covers 2 tricks
       ▶ TT #27 — Whirl Stall                    Kenny Shults
       ▶ TT #42 — Symposium Whirl                Kenny Shults
       ▶ TT #41 — Whirling Swirl Stall           Kenny Shults
       ▶ PS Whirl by Will Digges                 Shred Global

   Records
       11 PassBack record clips across 6 tricks  view all →


   RELATED FAMILIES                            [progressive disclosure]
   ──────────────────────────────────────────────────────────────

       •  Swirl  — adjacent dex; Whirling Swirl bridges
       •  Mirage — paired tutorial pattern (TT often pairs them)
       •  Symposium-modifier family — symp-X tricks from this and other bases


   ─── show ontology details ▾ ─────────────────────────────────
   (collapsed by default for casual viewers)
```

```
═══ EXPANDED ── show ontology details ════════════════════════════

   STRUCTURE

       Base trick           : whirl (3 ADD, dex)
       Family members       : 11 canonical
       Modifiers attached   : spinning, paradox, symposium, blurry,
                              ducking, stepping, tapping
       Direction-reversed   : rev-whirl (separate canonical per
                              "direction is structural" rule)

   ADD MATH (verifiable per modifier table)

       whirl                    = 3
       + spinning (rotational)  = 5    ✓ matches Spinning Whirl
       + paradox                = 4    ✓ matches Paradox Whirl
       + ducking                = 4    ✓ matches Ducking Whirl
       + symposium              = 4    ✓ matches Symposium Whirl
       + paradox + symposium    = 5    ✓ matches Paradox Symposium Whirl
       + spinning + symposium   = 6    ✓ matches Spinning Symposium Whirl
       + blurry (rotational)    = 5    ✓ matches Blurry Whirl

   HISTORICAL NAMING (alias provenance)

       Whirlwind     →  Spinning Symposium Whirl     (Red, RC-2A)
       PS Whirl      →  Paradox Symposium Whirl      (RC-2A)
       Whip          →  Rev Whirl                    (Red, pt8)
       Pdx Whirl     →  Paradox Whirl
       (and 10 other typo / abbreviation aliases)

   CROSS-FAMILY OVERLAP

       Whirling Swirl is a whirl-modified swirl; appears here AND on
       /freestyle/families/swirl. Multi-family membership is data-
       honest; navigation surfaces both.
```

---

## SECTION-BY-SECTION REASONING

### Hero + family description

A short prose blurb that tells a beginner what defines the family. Three sentences max. Anchors the mechanical signature ("single-leg rotational dex; leg passes around the bag in a circular arc"); names the structural axis the family branches along (modifiers); names the directional sibling and the cross-family member.

The canonical demo video sits in the hero — one click to "what does this look like." Choosing TT #27 because it's a tutorial-tier solo demo of the base; the AnzTrikz pair would also work but is multi-trick.

### The Ladder

The single most valuable surface on the page. ADD-grouped sections; each member shows:

- name
- modifier composition (`+ paradox`, `+ symposium`)
- annotations (TT lesson number, alias call-outs, record count if notable, "[base]" tag)

Members link to detail pages. The grouping by ADD lets a beginner read "I know whirl (3 ADD), what's next?" left-to-right. The modifier annotation surfaces the ontology for free without forcing the user to think about decomposition unless they want to.

**Open question:** should each ADD bucket be visually a card / row / plain group? Cards add visual weight; plain groups (as drafted) keep the page scannable but might feel sparse. Trying plain groups first.

### "adjacent family member" callout for Whirling Swirl

Whirling Swirl is `whirling + swirl`. It's structurally a swirl with a whirl modifier — closer kin to the swirl family than the whirl family. But the "whirling" modifier is what binds it to whirl. Showing it on this page (with explicit framing as "adjacent") respects the cross-family reality without misleading the user.

This is the multi-family membership question made concrete. The mockup chooses **show with framing** over **hide entirely**.

### Records section

Sortable table. Top 6 visible, "show all 13" expander. Rev Whirl at 61 by Norek leads — interesting because Rev Whirl has TWO records in the data (61 by Norek + 56 (op) by SkyLon, post-RC-2A rebound from Whip). The page should disambiguate them via the same caption pattern as the Passback gallery: `Rev Whirl — Norek (61, 2009-11-02)` and `Rev Whirl (op) — SkyLon Smith (56, 2014-08-27)`.

### Media across the family

Two subgroups: Tutorials and Records (count only; deep link). The tutorial list is curated-asserted "best of family" content. Records aggregate without visual clutter; the deep-link routes to the per-trick records or the existing Passback Records gallery filtered by family.

The AnzTrikz "Whirl and Reverse Whirl" entry surfaces meaningfully here because it's a multi-trick tutorial covering two family members — a natural fit for a family page that single trick pages can't fully advertise.

### Related Families

Progressive disclosure — collapsed by default for casual viewers, expanded for curious ones. Three bullets, each links to another family page.

### Ontology details (expandable)

Decomposition + ADD math + alias provenance + cross-family overlap. This is the "deep dive" beginners can ignore and curators / nerds expand. The ADD math validation is a fun trust signal: the page is showing its work.

---

## OPEN UX QUESTIONS

These surfaced from drafting the mockup. Capturing for future review.

### 1. How should "adjacent" members be visually demarcated?

Whirling Swirl belongs structurally to swirl (base) but uses whirl-as-modifier. Showing it inside the same ladder as primary members might mislead. The current mockup uses a horizontal rule + "adjacent family member" label. Alternatives:

- Separate section ("Cross-family")
- Sidebar link only
- Don't show; require user to click "Related Families"

The right answer depends on how often multi-family membership occurs across the dictionary. Whirl + Swirl might be the only real case in the active set; pixie / fairy / atomic might surface more.

### 2. How should the sort control work when ADD ties?

Sorting "by ADD" puts 5 tricks at 4 ADD and 3 tricks at 5 ADD. Within those buckets, what's the secondary sort?

Options: alphabetical (boring but predictable), by-record-count (surfaces popular tricks), by-media-coverage (encourages curator attention to gaps), or curator-defined (one more thing to maintain). The mockup uses alphabetical — least surprising.

### 3. Where do "abandoned" or "barely-used" family members live?

If `tapping-whirl` has zero records, zero tutorials, zero media, should it still appear on the family page with the same visual weight? Or appear in a "lesser-known variants" expander?

The ontology says it exists; the data says no one cares. The page should respect both signals. Current mockup treats every member equally; a "lesser-known" demotion based on media-richness might be a future refinement.

### 4. What does the page look like when there's no canonical-demo video?

For families like the Down family (no tutorials anywhere), the hero `▶ Watch a [Family]` block has no content. Options: omit the hero entirely; show "no canonical demo yet, here are records"; show a placeholder that signals "we know this is a gap." Current mockup assumes a tutorial exists; the answer for empty cases needs a parallel mockup.

### 5. Should records render captions WITH dates by default?

Per CD-1, gallery captions include `(N kicks, YYYY-MM-DD)`. On a family-page records table, the date column is separate. If the table renders compactly, do we drop the date from the caption (avoid duplication) or keep it (for consistency with gallery)?

The mockup uses a structured table (count + holder + year), so caption-style rendering doesn't apply here. The gallery deep-link still uses the CD-1 caption format. Tension: same data, two presentations. Acceptable as a transient inconsistency.

### 6. How should aliases surface in the ladder?

Whirlwind = Spinning Symposium Whirl. The mockup shows `also: Whirlwind` under the canonical row. But what about aliases like `pdx-symposium-whirl` (typo / abbreviation)? Showing them adds clutter. Options: show only "named aliases" (Whirlwind, PS Whirl, Whip), hide typo / abbreviation aliases; or expand-only.

The mockup hides typo aliases by default. That's a curator-asserted distinction the data doesn't currently mark — there's no `alias_type='typo'` column. Adding such a marker is a future ontology question.

### 7. Beginner-friendliness vs information density

The mockup currently shows: hero + ladder + records + media + related + expandable details. That's a lot. A true beginner might bounce off.

A potential variant: hide records and media behind a "more about this family" expander, leaving only the hero + ladder + "Try the base trick" CTA visible by default. The trade-off is depth feels less immediate, but the page lands gentler.

This is a real tension; the right answer might depend on user testing with actual beginners. Capturing it for later.

---

## TENSIONS / TRADE-OFFS SURFACED

| Tension | Choice in this mock | Alternative | Notes |
|---|---|---|---|
| Multi-family member visibility | Show with explicit framing | Hide; require click | Whirling-Swirl test case; few cases overall |
| Sort ties | Alphabetical secondary | Record-count or curator | Predictable beats clever |
| Aliases in ladder | Show only "named" aliases | Show all OR none | No data marker for "named-vs-typo"; needs future flag |
| Density | Full rich page | Beginner-stripped variant | Need user testing |
| Decomposition visibility | Expander, collapsed default | Always-on inline | Deeper info doesn't compete with ladder |
| Records display | Compact table | Tile grid | Tables scale better with N |
| Empty-data fallback | Not shown | Needs separate mockup | Down family is the canonical empty case |

---

## WHAT THIS TEACHES US ABOUT THE ONTOLOGY

Five observations from drafting the mockup against real data:

### 1. ADD groups create natural pedagogical buckets

The 3-4-5-6 ADD split is genuinely useful for organizing the page. The eye reads "this is a family at increasing difficulty"; the data structure supports that without any new modeling. The ontology was already shaped this way.

### 2. Multi-modifier compositions are short text

`+ paradox + symposium` is two words. Even at the upper end (`+ stepping + ducking + paradox`), it's compact. The decomposition prose does NOT need a graph view at the family-page level. (A trick detail page might still benefit from one.)

### 3. Aliases are richer than I expected

14 aliases for 11 canonicals — more than 1 alias per canonical on average. About 5 are "named" (Whirlwind, PS Whirl, Whip, P-Whirl, Reverse Whirl) and the rest are typos / abbreviations. **The ontology has rich historical naming data that the current dictionary surface doesn't expose.** This is a real opportunity. Family pages are a natural place to surface "named aliases" without burdening detail pages.

### 4. Whirling Swirl forces the multi-family question

It's the cleanest test case for "what about tricks in N families?" The current data model doesn't formally support secondary-family membership; the mockup treats it via convention (show with framing). If multi-family becomes common, the data model may want a `secondary_family` field (out of scope for this lane).

### 5. The ADD-math expander is a trust signal

Showing the math (`whirl 3 + spinning 2 = 5 ✓ matches Spinning Whirl`) doesn't add information for a casual viewer. But for a curator, expert, or skeptic, it signals "this site checks itself." That's a competitive differentiator footbag.org and footbagmoves.com cannot offer because they don't have the structural model. Worth keeping even if rarely viewed.

---

## DEEPENING — FOUR AXES

This section extends the original mockup along the four axes flagged as highest-leverage: simple/deep-dive disclosure, alias rendering categories, family-intro language, and media tiering.

### Axis 1 — Simple vs Deep Dive (disclosure depth, NOT auth)

A single page; one toggle in the upper-right of the family hero; persists in localStorage (no account needed); not a URL state. Default lands in **Simple** for first-time visitors, **Deep Dive** for anyone who's previously chosen it.

```
   WHIRL FAMILY                    [ Simple | ▶ Deep Dive ]
```

#### Simple mode (default for new visitors)

```
   ┌─────────────────────────────────────────────────────────────┐
   │  ▶ Watch a Whirl                                            │
   │  [TT #27 — Whirl Stall]                                     │
   └─────────────────────────────────────────────────────────────┘

   Whirls are single-leg rotational dexterities. The leg sweeps
   around the bag in a circular arc. Most freestyle players learn
   the whirl after the clipper.

   THE LADDER

   3 ADD       Whirl                                       [base]
               Rev Whirl                          (reverse direction)

   4 ADD       Symposium Whirl                          [TT #42]
               Paradox Whirl
               Ducking Whirl
               + 2 more variants

   5 ADD       Spinning Whirl                       ★ records: 3
               Blurry Whirl
               Paradox Symposium Whirl              ★ records: 2

   6 ADD       Spinning Symposium Whirl

   ── Top records ─────────────────────────────────────────────
       Rev Whirl                  61    Norek          2009
       Whirl                      41    Ken Somolinos  2012
       Blurry Whirl               35    Norek          2009
       View all records →

   ── Want more? ──────────────────────────────────────────────
       View as Deep Dive →
```

What disappears in Simple:

- Modifier annotations on each ladder row (`+ paradox + symposium`)
- Alias call-outs in the ladder
- "adjacent family member" Whirling Swirl callout (deferred to Deep Dive)
- The Records section is collapsed to top-3 only; "view all" link still present
- Media subgroups collapsed to one canonical demo
- Related Families section hidden
- Ontology details expander hidden entirely
- The "+2 more variants" abbreviation absorbs Stepping/Tapping/Ducking variants behind a single click

#### Deep Dive mode (toggle right; persists)

```
   ┌─────────────────────────────────────────────────────────────┐
   │  ▶ Watch a Whirl                                            │
   │  [TT #27 — Whirl Stall, by Kenny Shults]    canonical demo  │
   └─────────────────────────────────────────────────────────────┘

   The whirl is a single-leg rotational dexterity. The leg passes
   around the bag in a circular arc while the body stays square.
   From the base whirl, the family branches by modifier (spinning,
   paradox, symposium, blurry, ducking, stepping, tapping), plus
   the direction-reversed Rev Whirl and the swirl-adjacent
   Whirling Swirl.

   THE LADDER                                  sort: ▼ ADD  □ name

   3 ADD ─────────────────────────────────────────────────────
        Whirl                                           [base]
        Rev Whirl              direction-reversed
                               also: Whip · Reverse Whirl

   4 ADD ─────────────────────────────────────────────────────
        Symposium Whirl        + symposium     [TT #42]
        Paradox Whirl          + paradox       also: P-Whirl
        Ducking Whirl          + ducking
        Stepping Whirl         + stepping
        Tapping Whirl          + tapping

   5 ADD ─────────────────────────────────────────────────────
        Spinning Whirl         + spinning      ★ records: 3
        Blurry Whirl           + blurry
        Paradox Symposium      + paradox + symposium
          Whirl                also: PS Whirl  ★ records: 2

   6 ADD ─────────────────────────────────────────────────────
        Spinning Symposium     + spinning + symposium
          Whirl                also: Whirlwind

   ── adjacent family member ─────────────────────────────────
        Whirling Swirl         whirling+swirl  [TT #41]
        (whirl-as-modifier on a swirl base; lives here too)

   [Records section: full table, 13 rows, sortable]
   [Media: tutorials + records subgroups, all 18 items linked]
   [Related families: 3 cross-references, expanded]
   [Ontology details: expanded inline, no further click needed]
```

#### Why both modes share one URL

A user shares `/freestyle/families/whirl` with a friend; the friend lands on the same content even if they're new. Their Simple/Deep Dive preference is theirs alone (localStorage). The deep-link is canonical; the rendering is layered. This avoids the "did they see what I saw?" problem of URL-state-driven views.

#### Open questions on this axis

1. **Does the "+2 more variants" abbreviation help or hurt in Simple?** It compresses density but also hides 3 valid family members. Test case: a Tapping Whirl learner googles it and lands here in Simple — will they see their trick?
2. **Should "Records: top 3 only" hide the lesser-known holders?** Top 3 by count lands Norek and Ken Somolinos and Penske — already heavy hitters. Lesser-known players never surface in Simple. Maybe top-3 by-recency would tell a different story.
3. **Is the toggle prominent enough at top-right, or should it be inline near each section that abbreviates?** Inline ("Show all variants") might guide better than a global toggle.

### Axis 2 — Alias rendering strategy

The dictionary currently has 14 aliases for 11 whirl-family canonicals. They split naturally into four categories that the data doesn't currently mark explicitly. The exploration suggests categorizing them as:

| Category | Whirl-family examples | Rendering rule |
|---|---|---|
| **Common alias** | `Reverse Whirl` → rev-whirl; `PS Whirl` → paradox-symposium-whirl; `P-Whirl` → paradox-whirl | Inline as "also: X" on the ladder row; Simple AND Deep Dive |
| **Historical name** | `Whirlwind` → spinning-symposium-whirl; `Whip` → rev-whirl | Inline with provenance ("formerly: X"); Deep Dive only |
| **Technical decomposition** | `pdx-whirl` → paradox-whirl; `pdx-symposium-whirl` → paradox-symposium-whirl; `BW` → blurry-whirl; `P-S Whirl` → paradox-symposium-whirl | Hidden in default views; surface only in a "search hits" or "abbreviations" expander |
| **Typo / misspelling** | `blury-whirl` → blurry-whirl; `spinning-symposium-wirl` → spinning-symposium-whirl; `symposium-wirl` → symposium-whirl | NEVER displayed; search-resolution only |

**Categorization is not in the schema today.** The four categories can be inferred heuristically (length-based for abbreviations; vowel-edit-distance for typos; word-count-based for compound names) but inference will misclassify edge cases. A curator-asserted `alias_kind` column would make this clean — but that's a future schema question, not in scope here.

For the mockup, the assumption is: a curator-asserted `alias_kind ∈ {common, historical, technical, typo}` is the right model when this becomes production. Until then, the family page can render only the most-confidently-named aliases (Whirlwind, PS Whirl, Whip, P-Whirl) and hide the rest.

#### Where each category renders

```
                          Simple    Deep Dive    Search    Detail page
   Common alias            ✓         ✓           ✓         ✓
   Historical name         ─         ✓           ✓         ✓ (with date/source)
   Technical decomposition ─         expander    ✓         expander
   Typo                    ─         ─           ✓         ─
```

The principle: **search resolves everything; display surfaces only what helps.** Typos never reach the user's eye; abbreviations don't clutter the ladder.

#### Open questions on this axis

1. **Whirlwind vs Spinning Symposium Whirl — which is canonical-display?** Today Spinning Symposium Whirl is the canonical name and Whirlwind is the alias. But community usage might lean toward Whirlwind. The "historical name" categorization respects ontology convention; the page could ALSO let users opt into "show community names instead." Out of scope for now; flagged.
2. **Should "P-Whirl" (single hyphen, Paradox Whirl) live in common-alias or technical-decomposition?** It's an abbreviation but uses recognizable convention. Borderline. The categorization heuristic needs a curator override.
3. **Decomposition aliases that aren't typos (`pdx-whirl`, `BW`) carry social information.** Real freestylers DO call it "BW." Hiding it entirely from display might feel sterile. Consider a "community shorthands" subsection in Deep Dive — between common aliases and pure technicals.

### Axis 3 — Family intro language (the teaching layer)

The intro paragraph is the page's most important text. It's where ontology becomes teachable. A weak intro turns the page into a database; a strong intro turns it into a primer.

A good family intro answers five questions:

1. **What does the leg/body do?** (mechanical signature)
2. **What makes this family distinctive?** (vs neighboring families)
3. **Why do players care?** (entry point in progression / common compound stem)
4. **What does it sometimes get confused with?** (pre-empt the FAQ)
5. **How does it branch?** (preview the modifiers)

#### Two versions for whirl

**Simple-mode intro (1 sentence):**

> Whirls are single-leg rotational dexterities. The leg sweeps around the bag in a circular arc. Most freestyle players learn the whirl after the clipper.

Answers Q1 (mechanical), partial Q3 (entry point). Skips distinctiveness, confusion, and branching — those land via the ladder visual.

**Deep-Dive intro (3 sentences, anchored to ontology):**

> The whirl is a single-leg rotational dexterity. The leg passes around the bag in a circular arc while the body stays square — distinct from a swirl, where the leg crosses behind, and from a spin, where the body rotates instead of the leg. From the base whirl, the family branches by modifier (spinning, paradox, symposium, blurry, ducking, stepping, tapping), plus the direction-reversed Rev Whirl and the swirl-adjacent Whirling Swirl.

Answers all 5 questions. Q4 (confusion) is the most underrated — pre-empting "wait, isn't this a swirl?" earns user trust before they bounce.

#### Authorial voice norms

- **Warm and structural, not encyclopedic.** "The leg sweeps" beats "characterized by a single-leg rotational maneuver in which..."
- **Names neighbors before naming variants.** "Distinct from a swirl, where..." is more useful than "12 family members listed below."
- **Ontology-anchored, not invented.** Every claim should be defensible from the dictionary. "Most players learn after clipper" is verifiable from progression conventions; "the whirl was invented in 1989 by..." is biographical fluff that rots.
- **Short sentences. 1-2 clauses each.** This is signage, not prose.
- **Avoid "expert" hedges.** "It's said to be..." or "Some consider..." erodes trust. Either it's true (state plainly) or it's not in scope.

#### Pitfalls to avoid

- Don't define ADD math in the intro; that lives in the expander
- Don't reference uncommon aliases ("also called Whirlwind" is fine on the spinning-symposium-whirl row, NOT in the family-level intro)
- Don't list every family member in prose; that's the ladder's job
- Don't editorialize difficulty ("hard tricks ahead!"); ADD numbers speak

#### Open questions on this axis

1. **Who writes these?** 25 families × 30-60 words = ~1000 words of curator authoring. Probably Red. Probably done family-by-family as families ship.
2. **Are intros versioned?** A family intro in 2026 might read awkwardly in 2030 if the family grows. Treat them as living text; track changes in git rather than schema.
3. **Should there be a "common confusions" callout below the ladder?** Q4 (confusion) is currently woven into the intro. A separate section ("Often mistaken for...") might land better for visual scanners.

### Axis 4 — Media prioritization tiers

The user identified the right hierarchy: tutorial / records / canonical demo / supplemental. Mapping these onto a family page surfaces a question the trick-detail level didn't: **what does "canonical demo" mean at the family level?** A family doesn't have one canonical move; it has a representative.

Proposed tier semantics:

| Tier | Family-page role | Trick-detail role | Whirl-family example |
|---|---|---|---|
| **CANONICAL DEMO** | One curator-chosen video that best represents the family for a first-time visitor | One curator-chosen video that best teaches the trick | Family: AnzTrikz "Whirl and Reverse Whirl" (paired tutorial covers base + direction). Trick (whirl): TT #27 "Whirl Stall" |
| **TUTORIAL** | Other instructional videos for any family member | Other tutorials specifically of this trick | Family: TT #27, TT #42 (Symposium Whirl), TT #41 (Whirling Swirl), Will Digges PS Whirl. Trick (whirl): TT #27 plus AnzTrikz pair |
| **RECORDS** | Aggregated record clips per family member; deep-link to per-trick or per-family records gallery | Per-trick record clips | Family: 11 PassBack clips across 6 tricks, deep-link to filtered records gallery. Trick (whirl): Ken Somolinos 41 |
| **SUPPLEMENTAL** | Style variations, slow-mos, comparisons, alt-takes | Same | Currently empty for whirl family; would land here: a freestyler's compilation, a slow-mo, a side-by-side mirage-vs-whirl |

The hierarchy is a **render order**, not a database structure. The data model is unchanged: tags + source_id + tier. The tier ordering is service-layer mapping (per the patterns established in club-leadership-surface and CD-1).

#### Family-page implications

The family page hero shows ONE video — the curator-chosen "canonical demo." For whirl that's the AnzTrikz "Whirl and Reverse Whirl" pair, because:

1. It covers two family members (whirl + rev-whirl) — efficient for a family-level intro
2. It's CANONICAL_TUTORIAL tier (highest source rank)
3. AnzTrikz outranks TT in the established source-priority order

The TT #27 solo demo is then a "More tutorials" link, NOT the hero. This INVERTS the trick-detail page choice (where TT #27 IS the hero for whirl-the-trick). That's correct: the family wants a multi-trick representative; the trick wants a focused one.

#### Open questions on this axis

1. **What if no canonical demo exists yet?** For the Down family (zero tutorials anywhere), the hero block has no content. Options: (a) omit the hero entirely; (b) hero shows a "no tutorial yet" placeholder with a "submit one" CTA; (c) hero promotes to records tier and shows a record clip as substitute. Each carries product implications.
2. **Should the canonical demo for a family be a curator-assembled compilation?** Family-level compilations are editorial work — high quality bar, curator-paced. But "Whirl Family in 90 Seconds" is the kind of artifact users would share. Different question: does the platform produce these, or aggregate them from creators?
3. **Does the records tier render as a tile preview or a count + link?** The current mockup shows a count + link ("11 PassBack clips across 6 tricks"). A tile preview (top 3 records as thumbnails) is more visual but heavier. Likely test-driven.

---

## WHAT THIS DEEPENING CONFIRMED

The four axes pressure-tested the same hypothesis: **the ontology can drive meaningful UI without new schema.** Each axis reduced to:

| Axis | New schema needed? |
|---|---|
| Simple vs Deep Dive | None — disclosure is presentation; localStorage handles persistence |
| Alias rendering categories | **One curator-asserted `alias_kind` column would help** — but graceful degradation via heuristics works until then |
| Family intro language | None — text content; lives in a `family_intros.md` style sidecar at most |
| Media prioritization | None — existing `source_id` + `tier` already encode the ordering |

Three of four axes need zero schema work. The fourth (alias categories) needs one column eventually but degrades gracefully without it.

That's the architectural success worth naming aloud. The dictionary's structure already encodes the things UX wants to surface. The work ahead is **projection** (services + templates + curator content), not **modeling** (schema).

Out of scope for this single mockup; future explorations may pick up:

- **Trick detail pages.** This mockup ends at "links to detail." Detail-page progressive disclosure is its own mockup.
- **Search.** Search bar omitted; assumed lives in header.
- **Member-specific surfaces.** Records visible publicly; member achievement / "tricks I can land" features are post-launch.
- **Media within the page (embedded videos).** Page links to media, doesn't embed. Embedding is implementation detail.
- **Mobile layout.** ASCII assumes desktop. Mobile is a separate exercise.
- **Family pages with ZERO members or ONE member.** Edge cases need parallel mockups.

---

## NEXT POSSIBLE EXPLORATIONS (suggestive, not prescriptive)

If this lane continues:

- `LANDING_PAGE_MULTI_DOOR_MOCK.md` — how the families index sits next to ADD-browse, search, "where to start"
- `TRICK_DETAIL_PROGRESSIVE_DISCLOSURE_MOCK.md` — three-layer detail page using the patterns surfaced here
- `EMPTY_FAMILY_MOCK.md` — what does a 0–1 member family page look like (Down family is the test case)
- `ALIAS_HISTORICAL_VIEW_MOCK.md` — surfacing the alias graph as a feature

But the lane is allowed to stop here. Producing one good mockup that surfaces concrete tensions is more valuable than producing five shallow ones.
