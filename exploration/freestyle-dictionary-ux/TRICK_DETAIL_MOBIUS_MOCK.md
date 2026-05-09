# Mockup: Mobius Trick Detail Page

**Lane:** sandboxed UX exploration. Not production. See `EXPLORATION_CHARTER.md`.

**Hypothetical route:** `/freestyle/tricks/mobius` (already exists in production but at a thinner layout — this mockup explores a richer projection)

**Anchored in real ontology data** as of 2026-05-07.

---

## Mobius — the actual data

```
slug              : mobius
canonical_name    : mobius
adds              : 5
base_trick        : torque
trick_family      : torque        ← single primary family
category          : compound
description       : "Gyro-modified torque."
modifier_links    : gyro

inline aliases    : gyro torque · möbius · moebius
alias rows        : gyro-torque · m-bius · moebius

records           : 1 (Evan Gatesman, 11 kicks, 2014-09-28)
media             : 2 — Footbag Finland tutorial + PassBack record clip
TT lesson         : none (Mobius is not in TT #1-42)

torque siblings   : grave-digger, paradox-torque, atomic-torque,
                    blurry-torque, spinning-torque, gauntlet
gyro-modified     : (mobius itself), vortex (gyro drifter),
                    bullwhip (gyro family per Red pt6/pt8)
```

**Key data finding before mockup:** the dictionary places Mobius in `trick_family = 'torque'` (single value, not a list). The "gyro family" is a narrative association via the modifier, not a second-family record. This redirects the multi-family test from "two families" toward "one primary family + a modifier-based association." That's the real shape of the question. The mockup honors it.

---

## PHASE 1 — PAGE PURPOSE

Before laying out controls, settle what the page is FOR.

### Candidate goals (weighed)

| Goal | Weight | Notes |
|---|---|---|
| **Teach the trick** | High | "What is this, mechanically? How is it distinct?" |
| **Serve as canonical reference** | High | Single source of truth: ADD, decomposition, name authority |
| **Surface related tricks (outbound nav)** | High | Same base, harder variants, modifier siblings; outbound > inbound |
| **Showcase media** | High | A canonical demo + records is what people came for |
| **Expose decomposition** | High | Mobius = gyro + torque; this IS pedagogy for anyone past beginner |
| **Preserve historical naming** | Medium | Aliases live here, but the page isn't a naming-history archive |
| **Support progression** | Medium | "What to learn before / after" is high value but partial coverage |
| **Search disambiguation** | Low | SEO output, not primary UX |
| **Player records leaderboard** | Low | Records section gets one block; not the page's job to be a competition tracker |

### Recommendation

**Primary purpose:** Teach the trick + canonical reference. A user landing here should walk away knowing what Mobius is, what it's made of, what it relates to, and where to watch it.

**Secondary purposes:** decomposition visibility, related-trick navigation outward, media access.

**Things the page should NOT try to do:**

- Be a complete naming-history archive (aliases live here but in compact form)
- Be a progression curriculum (link to family + base, don't curate paths inline)
- Embed every video that mentions the trick (we LINK, we don't curate exhaustively)
- Be a personal-records tracker (records section is informational, not a leaderboard)
- Validate or correct the trick (provenance lives in the ontology details; it's not the page's job to argue)

This shapes everything below: when in doubt between teaching and exhaustive cataloging, lean toward teaching.

---

## PHASE 2 — MOCKUP

### Simple mode (default for first-time visitors)

```
═══════════════════════════════════════════════════════════════════
   /freestyle  >  Tricks  >  Mobius
═══════════════════════════════════════════════════════════════════

   MOBIUS                                  [ Simple | ▶ Deep Dive ]
   ──────────────────────────────────────────────────────────────

       5 ADD     Family: Torque     Compound

   The Mobius is a single-leg rotational trick — a torque with a
   gyro spin added. Often called "Gyro Torque."


   ┌─────────────────────────────────────────────────────────────┐
   │  ▶ Watch a Mobius                                           │
   │  [Footbag Finland — Mobius]                  canonical demo │
   └─────────────────────────────────────────────────────────────┘


   How is it built?

       gyro (+1)  +  torque (4)  =  5 ADD ✓


   Related tricks

       Built from torque   →  paradox-torque · spinning-torque ·
                              atomic-torque · gauntlet
       Same modifier       →  vortex (gyro drifter)


   Records

       Evan Gatesman                          11    2014-09-28


   ── Want more? ──────────────────────────────────────────────
       View as Deep Dive →
```

### Deep Dive mode (toggle right; persists in localStorage)

```
═══════════════════════════════════════════════════════════════════
   /freestyle  >  Tricks  >  Mobius
═══════════════════════════════════════════════════════════════════

   MOBIUS                                  [ Simple | ▶ Deep Dive ]
   ──────────────────────────────────────────────────────────────

       5 ADD       Family: Torque       Gyro-modified       Compound
                                        (modifier association)

   The Mobius is a 5-ADD compound combining a torque (single-leg
   over-the-top dexterity) with the gyro modifier (a body rotation
   behind the bag). Structurally it lives in the torque family
   alongside paradox-torque, atomic-torque, and gauntlet, but its
   name marks it as a distinct community-named trick. The
   structural decomposition "Gyro Torque" is also a common name
   for it — both forms appear in tutorials and records.


   ┌─────────────────────────────────────────────────────────────┐
   │  ▶ Watch a Mobius                                           │
   │  [Footbag Finland — Mobius]                  canonical demo │
   └─────────────────────────────────────────────────────────────┘


   STRUCTURAL DECOMPOSITION

       Mobius = gyro + torque

       gyro (+1, body modifier)  +  torque (4, base)  =  5 ADD ✓

       The gyro modifier is +1 universally (per modifier table:
       "gyro torque=mobius=5, gyro whirl=4, gyro butterfly=4").


   ALSO KNOWN AS

       Common              Gyro Torque
       Historical          möbius (German spelling)
                           Moebius (anglicized)

       (3 search-only typo / abbreviation forms exist; not shown)


   RELATED TRICKS

       ── Built from torque (same base) ─────────────────────
            grave-digger              5 ADD     stepping ss torque
            paradox-torque            5 ADD     + paradox
            atomic-torque (silo)      6 ADD     + atomic
            blurry-torque             6 ADD     + blurry
            spinning-torque (marius)  6 ADD     + spinning
            gauntlet                  7 ADD     stepping+ducking+paradox

       ── Gyro-modified (same modifier) ─────────────────────
            vortex                    4 ADD     gyro drifter
            bullwhip                  5 ADD     gyro family

       ── Whole family ──────────────────────────────────────
            View Torque family →


   RECORDS

       Holder            Count   ADD   Date            Video
       Evan Gatesman      11      5    2014-09-28      ▶
       (1 record on file)


   MEDIA

       Tutorials & demos
            ▶ Footbag Finland — Mobius              CANONICAL_TUTORIAL
       Records
            ▶ Evan Gatesman 11-kick run             RECORD


   ─── ontology details ▾ ───────────────────────────────────────

   STRUCTURE
       slug                : mobius
       canonical_name      : mobius
       category            : compound
       base trick          : torque
       trick family        : torque  (data-canonical, single value)
       modifier links      : gyro
       direction-reversed  : (none in dictionary)

   ADD MATH (verifiable per modifier table)
       gyro      : +1 universal (body modifier)
       torque    : 4 (base, miraging-osis decomp)
       mobius    : 5  ✓

   ALIAS PROVENANCE
       gyro-torque         : structural-decomposition alias; in
                             use as a community name; categorized
                             as Common
       möbius / moebius    : German / anglicized spellings;
                             categorized as Historical
       m-bius              : typo; search-only

   FAMILY MEMBERSHIP
       PRIMARY (data)      : torque family — set on freestyle_tricks
       MODIFIER ASSOCIATION : gyro-modified (via modifier_links);
                              not a separate "family" in the schema
       Effect: Mobius shows up on the torque family page; on the
       gyro association surface (if it existed), it would appear
       alongside vortex (gyro drifter).

   NOTATION
       (Jobs notation not yet captured for Mobius)

   PROVENANCE
       Activated as canonical via Red Husted's curated set;
       modifier-table cross-reference confirms ADD = gyro(+1) +
       torque(4) = 5. fb.org "Mobius (Gyro Torque)" cross-ref via
       Mark Monistere's Shred Global tutorial title.
```

---

## PHASE 2-A — HERO AREA EVALUATION

What ended up at top:

| Element | Why |
|---|---|
| Canonical name (large) | The page IS this trick; one identity at the top |
| ADD value | Numeric anchor; first thing browsers/copyers want |
| Family badge | Single primary family — rendered as plain text label, not a competing identity |
| "Gyro-modified" qualifier (Deep Dive only) | Honors the modifier association without inventing a second family |
| One-line description | Bridge between identity and decomposition |
| Canonical demo video | Lets a user just-watch-it within 2 seconds of landing |

What deliberately did NOT go in the hero:

- Aliases (live below in their own block; would compete with canonical name)
- Decomposition formula (lives below as "How is it built?" — earned, not announced)
- Records numbers (they're informational, not identity)
- Direct links to base/parent (would force navigation before orientation)

**Beginner readability test:** the Simple-mode hero answers "what is this?" in three lines: name, family + ADD, one sentence of plain English. A reader who's never heard of Mobius walks away knowing it's a 5-ADD torque-family trick.

**Advanced trust signal test:** the Deep-Dive hero adds "Gyro-modified" as a secondary structural badge and the second-line-prose names the family kinship and the structural-decomposition alias relationship in one breath. An advanced reader sees the page is honest about both the canonical name AND the structural identity.

---

## PHASE 2-B — SIMPLE vs DEEP DIVE AT TRICK LEVEL

The toggle model from the family page transfers cleanly. The differences worth naming:

### What collapses in Simple

- The "modifier association" badge (Deep Dive shows `Gyro-modified` as a structural footnote; Simple omits)
- Multi-paragraph description → single 2-sentence intro
- Decomposition presented as `gyro + torque = 5 ADD ✓` only (no modifier-table provenance line)
- "Also known as" hidden entirely (aliases not shown)
- Related-tricks compressed to two short rows; full lists hidden
- Media subgrouping omitted; one demo shown
- Ontology details expander hidden entirely

### What expands in Deep Dive

- Modifier association badge surfaces in hero
- Three-sentence intro with structural anchor and naming context
- Decomposition shows the modifier-table reference inline
- Alias categories (Common / Historical / Technical hidden) rendered explicitly
- Three full related-trick lists (same base / same modifier / family link)
- Records + media table format
- Ontology details expanded inline (no further click)

### Does trick-detail need different disclosure than family pages?

The model holds, with one exception: **at trick-detail level, the decomposition itself is pedagogy.** A family page can show "+ paradox + symposium" as compact annotation in a ladder; a trick-detail page must explain decomposition as content.

This means the "How is it built?" section is **always rendered** (even in Simple), just at varying depth:

- Simple: `gyro (+1) + torque (4) = 5 ADD ✓` — the formula with a check
- Deep Dive: same formula plus "The gyro modifier is +1 universally..." (the why)

The toggle controls **depth of explanation**, not visibility of the structural fact. Decomposition itself is non-optional at the trick level.

### Open questions

1. **Should Simple hide decomposition entirely for absolute beginners?** A first-time learner of Mobius might just want "watch this." But Mobius is a 5-ADD trick — beginners aren't here. The trick-detail audience skews intermediate-or-above. Decision: keep decomposition in Simple.
2. **Does the Simple "Want more? View as Deep Dive →" affordance get tedious if a user clicks it on every trick page?** The localStorage-persistence flag should auto-promote them to Deep Dive after 1-2 clicks. The toggle becomes "Simple" once they're already there.
3. **Does the toggle persist across pages?** Yes — single localStorage key `freestyle_view_mode`. If a user is in Deep Dive on the Whirl family page, they're in Deep Dive when they click into Mobius.

---

## PHASE 2-C — MULTI-FAMILY MEMBERSHIP (the central test)

### The honest finding

Mobius is **not** in two families in the data. The dictionary stores `trick_family = 'torque'` (single string, not a list). The "Mobius is also in the gyro family" framing turns out to be a **narrative convention**, not a structural fact.

What IS structural:

- `trick_family = torque` — Mobius's primary family, data-canonical
- `base_trick = torque` — Mobius is a torque-derived compound
- `modifier_links = gyro` — Mobius has gyro as a modifier
- The modifier table calls out `gyro torque = mobius = 5` — explicit named-decomposition reference

What is NOT structural (today):

- Any "Mobius lives in the gyro family" claim. There's no "gyro family" in the data — there's a `gyro` modifier.

### How the mockup renders this

The Deep-Dive hero shows two badges:

```
Family: Torque       Gyro-modified
                     (modifier association)
```

The first is a navigable badge (clicks to torque family page). The second is informational text — explicit it's a modifier association, not a parallel family. This is intentional: it keeps the data honest while still surfacing the kinship users feel.

The Related Tricks section then has TWO useful outbound paths:

```
Built from torque (same base)         ← navigates to torque family
Gyro-modified (same modifier)         ← cross-cutting list, no destination page yet
```

The "same modifier" list is a flat enumeration in this mockup. If the system gains a future `/freestyle/modifiers/gyro` surface, the link target is ready. Until then, the list itself fills the gap.

### Evaluation of the four candidate models

| Model | Verdict for Mobius |
|---|---|
| **Tag model** ("Mobius is tagged `gyro` and `torque`") | Loses primary/secondary distinction; over-flattens |
| **"Lives in both families"** | Currently inaccurate (data has one family); would require schema change |
| **Primary/secondary family** | Would model the kinship structurally; needs new column; not in scope |
| **Structural-family vs social-family** | The honest model: torque is structural (in data); gyro is social (in narrative + modifier_links). The mockup uses this. |

### Recommendation

**The current data is correct.** Mobius's structural family is torque; its kinship with vortex and bullwhip is via the gyro modifier. The mockup makes both surfaces visible without changing the data.

If the project ever wants a first-class "gyro family" surface, the schema lift is small: a `secondary_family` column or a `family_associations` join table. But the family page mockup (whirl) and this trick mockup (mobius) both demonstrate the same conclusion: **the data already encodes what UX needs to surface; the work is projection, not modeling.**

### Open questions

1. **Is there a `/freestyle/modifiers/gyro` page in the future?** It would aggregate gyro-modified tricks the same way family pages aggregate same-base tricks. Probably yes; out of scope for this mockup.
2. **Should the "Gyro-modified" badge BE a link, even without a destination page?** No — broken links are worse than informational text. Once the modifier surface exists, promote the badge to a link.
3. **What if a future trick has TWO modifier associations (e.g., a gyro + spinning compound)?** Render both as badges. The display scales; the schema stays single-valued for the primary family.

---

## PHASE 2-D — DECOMPOSITION HANDLING

The decomposition appears in three layers of increasing detail:

| Layer | Where it appears | What it says |
|---|---|---|
| 1 | Description sentence (Simple + Deep Dive) | "a torque with a gyro spin added" — prose form |
| 2 | "How is it built?" / "Structural decomposition" block (Simple + Deep Dive) | `gyro (+1) + torque (4) = 5 ADD ✓` — formula form |
| 3 | Ontology details expander (Deep Dive only) | Modifier-table cross-reference + provenance |

### Should decomposition visually dominate?

No. Mobius's name is the page identity; decomposition is structural support. The hero shows the name; decomposition is one block among several. The page should NOT feel like "a torque-with-gyro page" — it should feel like "a Mobius page, which happens to be a torque-with-gyro."

### Canonical identity vs structural identity

The mockup keeps these in tension by design. The hero says **MOBIUS**. The first-line description says "Gyro-modified torque" (the structural identity, but in noun-phrase form, not formula form). The decomposition block then makes the formula explicit. The aliases section names "Gyro Torque" as a Common alias.

Three different surfaces, three different framings of the same structural fact. The page lets the user choose how they think about it.

### Open questions

1. **Should the decomposition formula be inverted in some cases?** "Mobius = gyro + torque" suggests gyro is THE thing being added. For someone who already knows torque well, this reads naturally. For someone learning gyro for the first time, "torque + gyro" might land better. Currently the canonical convention is `modifier + base` (per modifier-table notes). Stick with it.
2. **What about tricks where decomposition isn't fully canonical?** Mobius is clean: gyro + torque. Tricks like "bullwhip" (per Red pt8) have unresolved base_trick. The decomposition block on those pages would say "Compound trick. Base structure deferred." Less satisfying; honest.

---

## PHASE 2-E — RELATED TRICKS

The mockup shows three related-trick lists in Deep Dive:

```
Built from torque (same base)    — 6 tricks
Gyro-modified (same modifier)    — 2 tricks
Whole family link
```

### Which relationships feel useful

Tested against the candidate list from the user spec:

| Relationship | Useful here? | Why |
|---|---|---|
| Built from same base | **Yes** — top section | Outbound nav to siblings; surfaces the torque-family branch |
| Harder variants | Implicit in "same base" via ADD column | Same data; could split if more derivatives existed |
| Neighboring tricks | ✓ via "Gyro-modified" | Modifier-driven kinship matters more than ADD-distance for this trick |
| Same modifier | **Yes** — second section | Vortex + Bullwhip surface here; impossible to find otherwise |
| Same set | n/a | Mobius doesn't use a set primitive |
| Commonly learned before/after | Skipped | Curatorial; would need expert input |

### Which feel noisy

- A "harder variants" section separate from "same base" would duplicate. Same data, two presentations.
- "Same ADD" (other 5-ADD tricks) is a flat dictionary slice; not structurally meaningful for navigation. Skipped.
- "Cross-family adjacencies" (e.g., "tricks that share a modifier path") get speculative quickly. Skipped.

### Open questions

1. **Should the "Gyro-modified" list be exhaustive or top-N?** With 3 tricks total (mobius itself, vortex, bullwhip), exhaustive is fine. For a more populous modifier (paradox, spinning), pagination kicks in.
2. **Should the page show "tricks that USE Mobius" (i.e., compounds built from Mobius)?** None exist in the dictionary today. If a future "Spinning Mobius" or similar gets added, this section appears.

---

## PHASE 2-F — ALIAS RENDERING

Apply the four-category taxonomy from the whirl exploration. Mobius's aliases:

| Alias | Category | Render? |
|---|---|---|
| `Gyro Torque` (from inline alias `gyro torque`) | **Common** + structural-decomposition | ✓ inline |
| `möbius` (German spelling) | **Historical** | Deep Dive only |
| `moebius` (anglicized) | **Historical** | Deep Dive only |
| `gyro-torque` (slug form) | **Technical** | search-only |
| `m-bius` (apparent typo) | **Typo** | search-only |

### The "Gyro Torque" double-status finding

Gyro Torque is BOTH a common alias AND the literal structural decomposition. In the alias taxonomy, this is a new edge case the whirl exploration didn't surface: **structural-decomposition strings that are ALSO community-used names.**

Whirl-family analog: "Spinning Symposium Whirl" is the canonical name AND the literal decomposition. But Mobius/Gyro-Torque is the inverse: the structural form is the *alias*, not the canonical.

Render decision: show "Gyro Torque" in the Common-aliases row. Don't suppress the duplication ("Gyro Torque" appears as alias AND in the decomposition formula). They're two different surfaces; the user can connect them.

### Open question

1. **Should structural-decomposition aliases get their own subcategory?** Could split Common into "Common (synonym)" vs "Common (structural)." Adds nuance; adds complexity. For now, keep Common as one bucket — the duplication with the decomposition block is mild.

---

## PHASE 2-G — MEDIA HIERARCHY AT TRICK SCALE

Mobius has 2 media items in the system:

```
Footbag Finland  Mobius                    CANONICAL_TUTORIAL    tier 1
PassBack         Evan Gatesman 11 kicks    RECORD                tier 4
```

### Tier mapping (from the whirl deepening)

| Tier | Purpose at trick scale | Mobius example |
|---|---|---|
| **Canonical demo** | One curator-chosen video to lead with | Footbag Finland tutorial |
| **Tutorials** | Other instructional videos | (none for Mobius beyond the canonical) |
| **Records** | Community proof clips | Evan Gatesman 11-kick run |
| **Supplemental** | Variations, slow-mos, comparisons | (none for Mobius) |

### How does this differ from family-page behavior?

**Family page hero** uses the most representative TUTORIAL across all family members (e.g., the AnzTrikz "Whirl and Reverse Whirl" pair for the whirl family — covers two members in one video).

**Trick page hero** uses the FOCUSED tutorial for THIS trick. No multi-trick coverage at the hero level. This is the inverse choice; the family page wants breadth, the trick page wants focus.

For Mobius, the focused tutorial is Footbag Finland's Mobius video. If TT had a Mobius lesson, it'd be the canonical demo (TT outranks Footbag Finland in the tutorial-tier ordering). It doesn't, so Footbag Finland becomes the canonical demo by source-priority fallback.

### Empty-tier handling

Many advanced tricks have ONE record and ZERO tutorials (or vice versa). The page renders the populated tiers and silently omits empty ones. A "no tutorial yet" placeholder would be honest but heavy; the canonical-demo block simply doesn't render if no tutorial exists. The Records section appears or doesn't, based on data.

### Open questions

1. **For tricks with ZERO media, what does the page look like?** The hero loses its video block. The page still renders identity + decomposition + related tricks. Honest; minimal; maybe boring. The "where's the tutorial?" question is implicit.
2. **Should the Footbag Finland video be the family-page canonical demo for the torque family too?** No — family pages should prefer multi-trick coverage where available. The trick page and family page can use different videos as their canonicals; the source registry prevents drift.

---

## PHASE 2-H — PEDAGOGICAL LANGUAGE

### Simple-mode intro

> The Mobius is a single-leg rotational trick — a torque with a gyro spin added. Often called "Gyro Torque."

Two sentences. Names the mechanical category (single-leg rotational), names what's added (gyro spin), names the alternative name. Beginners learn: it's a thing called Mobius, also called Gyro Torque, made from torque + spin.

### Deep-Dive intro

> The Mobius is a 5-ADD compound combining a torque (single-leg over-the-top dexterity) with the gyro modifier (a body rotation behind the bag). Structurally it lives in the torque family alongside paradox-torque, atomic-torque, and gauntlet, but its name marks it as a distinct community-named trick. The structural decomposition "Gyro Torque" is also a common name for it — both forms appear in tutorials and records.

Three sentences. Answers:

1. **Mechanical signature:** single-leg over-the-top dex + body rotation behind the bag (mechanical, not just nominal)
2. **Distinctiveness vs neighbors:** in the torque family but a named compound (vs being just "another torque variant")
3. **Confusion pre-emption:** "Mobius" and "Gyro Torque" are the same trick — read in the wild, both forms are valid

The 5-question family-intro framework adapted to a single trick:

1. ✓ What does the leg/body do? — "single-leg over-the-top dex + body rotation behind the bag"
2. ✓ What makes it distinctive? — "named community-recognized compound, not just a variant"
3. (skipped) Why care? — implicit; users came to a 5-ADD trick page, they care
4. ✓ Common confusions — "both 'Mobius' and 'Gyro Torque' are valid names"
5. ✓ How does it branch / connect? — handled by Related Tricks section

Q3 (why care) gets less weight at trick level than at family level. The family page sells the family ("most freestyle players learn the whirl after the clipper"). The trick page assumes interest is established.

### Authorial voice (from whirl mockup)

- Warm and structural
- Names neighbors
- Ontology-anchored (verifiable from the dictionary)
- Short sentences
- No expert hedges

The Mobius intro tests cleanly against these.

---

## PHASE 2-I — ONTOLOGY DETAILS EXPANDER

What's in it (per the mockup):

| Section | Useful? | Notes |
|---|---|---|
| Structure (slug, base, family, modifiers, direction-reversed) | ✓ Useful for curators / nerds | Compact; encodes the data record |
| ADD math (gyro +1 / torque 4 / sum 5 with ✓) | ✓ Trust signal | Shows the page checks itself |
| Alias provenance with category labels | ✓ Distinguishes structural from typo aliases | Explains why some aliases were rendered, others weren't |
| Family membership (primary vs modifier-association) | ✓ Reveals the data shape honestly | Surfaces what the schema actually encodes |
| Notation | ✓ When present | Mobius doesn't have it; render "(not yet captured)" rather than omit |
| Provenance | ✓ Curator/historian audience | Cites Red Husted's curated set + Mark Monistere video as cross-ref |

### What would be overwhelming

- Full git-blame of the dictionary row (too granular)
- Every cross-source disagreement (footbag.org / footbagmoves.com / etc.) inline (this is QC artifact territory)
- The full modifier_table content (only the relevant entry is needed)
- Test data, validation results, data-quality flags

The expander is "show me your work" depth, not "give me everything ever recorded."

---

## PHASE 3 — WHAT THIS MOCKUP TEACHES

### What worked well

- **Three layers of decomposition (prose / formula / provenance)** map cleanly to disclosure modes
- **Single primary family + modifier association** turned out to be the honest model — the multi-family question reduces to "structural primary + narrative neighbors"
- **Same toggle persists across the family and trick views** — Deep Dive on family page → Deep Dive on trick page, no per-page state
- **The 5-question intro framework adapted to single tricks** with one question (Q3 "why care?") downweighted because trick-page audience has self-selected
- **Real ontology data sufficed for everything** — no inventing fields, no inventing tricks, no inventing aliases

### What felt awkward

- The "Gyro Torque" double-status (alias AND decomposition) doesn't have a clean home in the alias taxonomy. The page handles it by surfacing it twice in different contexts; a stricter taxonomy would split Common into Common-synonym vs Common-structural. Not a blocker, but a wrinkle.
- The "Records" section with 1 row feels thin. For sparse data, a single row + "More records coming" could be honest, but verges on apologetic. Current mockup just shows the row.
- "Modifier association" as a non-clickable text badge is honest but feels like a placeholder for a future page that doesn't exist. Trade-off acknowledged.
- The empty Tutorials list in the canonical-demo case (Footbag Finland is the only one) means the "Tutorials" subgroup label is redundant. Could collapse into a single "Demo" label. Minor.

### What ontology gaps became visible

| Gap | Severity | Fix when? |
|---|---|---|
| No `alias_kind` distinction (Common / Historical / Technical / Typo) | Medium | When alias surface goes production; one column |
| No "modifier association" or `secondary_family` relation | Low | Only matters if `/freestyle/modifiers/X` ever ships |
| No notation for many compound tricks (Mobius among them) | Low | Notation backlog; not blocking |
| No curator-asserted "best example" media flag | Medium | Falls back to source-priority order today; works |

### What required no new schema

Every UI surface in this mockup. Repeat:

- Hero / identity / ADD / family badge: existing fields
- Description: existing field
- Decomposition formula: derivable from `base_trick` + `modifier_links` + `trick_modifiers` table
- "Built from torque": query (`base_trick = 'torque'`); existing data
- "Gyro-modified": query (`modifier_links LIKE '%gyro%'`); existing data
- Aliases (with degraded categorization): existing `freestyle_trick_aliases`
- Records: existing `freestyle_records`
- Media tier ordering: existing `source_id` + curator tier semantics
- Ontology details: assembled from existing rows

### What future metadata might help

(Not proposing schema changes — listing for future-decision context only)

- `alias_kind` on aliases — would make the four-category rendering clean
- `media.is_canonical_demo` flag (per trick, per role) — would replace the source-priority fallback
- A `family_association` table for modifier-based or structural cross-family kinship — would let `/freestyle/modifiers/gyro` exist
- Notation field with provenance source — already a known gap

### What should stay curator-authored vs auto-derived

| Stay curator | Auto-derive |
|---|---|
| Pedagogical intro prose (Simple + Deep Dive) | Structural decomposition formula |
| "Best example" media flag (when added) | "Built from base / same modifier" related lists |
| Alias category assignments (when `alias_kind` lands) | ADD math validation |
| "If you know X, try Y" curated paths | Records sort + display |
| Family intro paragraphs | Source-priority media ordering |
| Notation when expert can supply it | Family membership (single-value primary) |

### Did Mobius validate the multi-family model?

**Partially, and helpfully.** The exploration hypothesized "Mobius is in two families." The data revealed: "Mobius is in one family + has a modifier-based association." That's a more accurate frame. The mockup renders both honestly without inventing structure that isn't there.

The validation isn't of "multi-family as a feature" but of "the data already encodes the kinship — the question is how to project it." Repeat of the family-page lesson: ontology projection beats ontology extension.

---

## PHASE 4 — COMPARISON TO FAMILY PAGE

| Dimension | Family page (Whirl) | Trick page (Mobius) |
|---|---|---|
| **Width vs depth** | Wide; aggregates 11+ tricks | Narrow; one trick deep |
| **Primary user need** | "What's this category? What can I learn here?" | "What's this specific thing?" |
| **Beginner friendliness** | High (browse / discover) | Medium (assumes interest) |
| **Ontology surface** | Collective structure (modifier branching, ADD ladders) | Atomic structure (decomposition, ADD math, aliases) |
| **Outbound nav role** | Funnels INTO trick pages | Funnels OUT to family + neighbors |
| **Hero media role** | Multi-trick representative (e.g., AnzTrikz pair) | Focused single-trick demo (e.g., Footbag Finland Mobius) |
| **Decomposition rendering** | Compact annotation (`+ paradox + symposium`) | Pedagogical block ("How is it built?") |
| **Records role** | Aggregated across family; deep-link out | Per-trick table; primary surface |
| **Aliases rendering** | Inline ladder annotations (compact) | Dedicated "Also known as" block (categorized) |

### Which surfaces ontology better?

**Both, on different axes.** Family pages surface the *relational* ontology (how tricks branch from a common base via modifiers). Trick pages surface the *compositional* ontology (what a single trick is made of, what it relates to).

The family page wins on first-time discovery — a user landing on `/freestyle/families/whirl` learns more about the dictionary's structural model in 30 seconds than they'd learn from any single trick page. The trick page wins on ground-truth — once a user knows what they want, the trick page is the canonical reference.

### Which is more beginner-friendly?

Family page, by a meaningful margin. Trick pages are reached AFTER a user has a target trick in mind. A true beginner doesn't search "Mobius" — they navigate from a family page or from search.

### Which better demonstrates the project's advantage?

**Family pages.** The trick page shows rigor (ADD math, alias categories, decomposition); rigor is *defensible* but less *visible*. Family pages show the relational structure other dictionaries don't have, in a way a casual visitor can immediately appreciate.

This reinforces the MVP recommendation from the future-IA exploration: **family-first ship.** Trick pages are good and need to exist; family pages are differentiated and lead the case.

### Where each falls short

- Family pages have no "you-just-clicked-a-result-from-Google" entry mode. They assume browsing intent.
- Trick pages alone don't tell a beginner "what do I learn next?" The family page does. Without family pages, trick pages are isolated artifacts.

The two surfaces are complementary, not competitive.

---

## CONSTRAINT ADHERENCE

| Constraint | Honored |
|---|---|
| No ontology / CSV / loader / schema modifications | ✅ |
| No production routes / controllers / services / templates | ✅ |
| No frontend code | ✅ markdown + ASCII only |
| No CANONICALIZATION_POLICY edits | ✅ |
| No invented data (no fake tricks / fake aliases / fake records) | ✅ — every name, ADD, alias, record, video pulled from current DB |
| No DB migration proposals | ✅ — gaps named as future-decision items only, never as scope |
| No feature creep | ✅ — exploration ends here; next steps are advisory |

---

## NEXT POSSIBLE EXPLORATIONS (suggestive, not prescriptive)

If the lane continues:

- **`LANDING_PAGE_MULTI_DOOR_MOCK.md`** — how `/freestyle` (the index) sits next to family-browse, trick-search, and a "where to start" beginner door. The two existing mockups are the two destination types; the entry-point question is unanswered.
- **`EMPTY_FAMILY_OR_TRICK_MOCK.md`** — Down family (zero tutorials), or a trick with zero records and zero tutorials. The "graceful empty" question.
- **`ALIAS_CATEGORIES_VISUAL_MOCK.md`** — a focused exploration of how the four-category alias taxonomy renders across pages (search results, trick detail, ladder annotations, ontology expander).
- **`SEARCH_DISAMBIGUATION_MOCK.md`** — what does typing "gyro torque" return? Mobius (the canonical, via alias) — but what does the result page look like?

The lane is allowed to stop here. Two mockups (Whirl family + Mobius trick) jointly establish the projection model and surface most of the durable design questions. Adding more mockups should pay rent in new findings, not just cover more area.
