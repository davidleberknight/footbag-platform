# Glossary Chapter Architecture: Progressive Disclosure at Chapter Scale

A design investigation, not an implementation. The glossary has crossed from "missing
content" to "risks overwhelming through scale," and this proposes the information
architecture for its next stage: one page, chapter-level progressive disclosure, built to
absorb significant future growth (including upcoming doctrine work) without the page
feeling larger. The glossary stays the single conceptual entry point for freestyle
language; the Trick Dictionary, Set Encyclopedia, Operators and Modifiers, History, and
ADD/Notation surfaces keep their responsibilities and are not migrated in.

All numbers below are measured from the live rendered page (292.5K total), not estimated.

---

## 1. Architectural critique of the current glossary

**The page grew by accretion, and every addition lands at full visual weight.** Sixteen
top-level sections render linearly, all fully visible. There is no middle layer between
"the whole section is on screen" and "a small per-entry collapsible." The recent entry
conversions added exactly the right disclosure at concept scale (a Line always visible,
depth behind per-entry panels), but section scale has no equivalent: a reader who does not
care about run architecture still scrolls past all of it.

**One section is a third of the page.** Measured weights:

| Section | Bytes | Share |
|---|---:|---:|
| Trick Families | 96.0K | 33% |
| Operators and Modifiers | 35.4K | 12% |
| Notation | 29.1K | 10% |
| Symbolic Composition (runs) | 20.0K | 7% |
| Movement Basics (atoms + concepts) | 19.5K | 7% |
| ADD Accounting | 17.6K | 6% |
| Run Architecture | 11.7K | 4% |
| everything else (9 sections) | 43.2K | 21% |

The teaching spine that Glossary V2 built (the twelve-atom band, the six concept cards) is
about a fifth of the page, and it is interleaved with, and visually dominated by, reference
material most first-time readers never reach.

**The reference plane and the teaching plane are interleaved.** The page mixes two kinds
of content with different readers: vocabulary teaching (atoms, concept cards, term lists)
and structural reference (family rosters, histograms, derivation atlas, ADD accounting
tables). The ratified architecture already distinguishes these planes; the page layout does
not yet.

**Growth is unsustainable in the current shape.** The page sits 2.4K under its 295K
release-audit size ceiling. The next doctrine wave will produce new synthesis content with
no natural home: today it would land as a seventeenth section or swell an existing one, and
either move makes the page feel larger. The "How to read this glossary" intro card is
itself a symptom: a page that needs a user manual is a page whose structure is not carrying
the reader.

**Local navigation exists; global navigation does not.** Two sections have mini-TOCs, and
the intro card lists anchors, but there is no single chapter-level map of the page, so the
reader's model of "what is here" comes from scrolling.

**What is right and must be preserved.** The three-audience entry mechanic works and reads
as a system (57 collapsibles with consistent labels scan as design, not clutter). The
teaching spine order (atoms, then axes, then grammar, then scoring) is sound. The glossary
already links outward to the standalone surfaces rather than duplicating them. The problem
is purely that everything is at one disclosure level.

---

## 2. The design idea: the entry mechanic, recursed to chapter scale

The glossary already solved this problem once, at entry scale: a Line always visible,
depth behind a labeled panel, a Reveal only where earned. The proposal is the same shape
one level up. **Every chapter renders a visible chapter Line (two or three sentences: what
this chapter is, who it is for, what it links to) plus an expand affordance; the chapter
body is the large collapsible.** The default page becomes the teaching spine plus a shelf
of clearly-labeled closed chapters, each of which is honest about what is inside.

This is not dozens more small `<details>`; it is five to seven large ones, and it is the
concrete realization of intent the architecture has already ratified (the spine design
says the default render shows the early sections open and the late sections as collapsed
teasers; that intent was never implemented).

---

## 3. Proposed top-level structure

**Tier A: always visible (the teaching spine, ~55K, about a fifth of today's page)**

1. **Orientation** (trimmed): what the glossary is, the chapter map. Absorbs most of the
   current "How to read this glossary" card, shortened, because the chapter shelf now does
   part of that job.
2. **Foundations**: the twelve-atom band and the Movement Basics concept cards. The heart
   of the page; hiding any of it damages the first-time reader.
3. **The working vocabulary**: Surfaces, Dexterities, Timing and Sets, in their current
   per-entry-disclosure form, including the concept cards (Direction, Side, Cross-body)
   and the timing-clock figure. These sections define the words a newcomer actually needs,
   and they are individually small.

**Tier B: major collapsible chapters (each with a visible chapter Line)**

4. **Family Encyclopedia** (the existing 96K Families section, whole). The single largest
   win. Its "what makes a family" teaching prose stays in the visible chapter Line region;
   the roster, tier bands, histograms, and edge cases collapse. Not migrated anywhere:
   the comparative cross-family view is glossary-native (per-family pages show one family;
   only the glossary shows the system).
5. **The Grammar of Operators** (from the current Operators and Modifiers section). The
   two concept cards (Set vs Operator, Composition) stay visible as the chapter Line
   region; the ecosystem discussion and modifier reference collapse, with the standalone
   operators page remaining the deep reference it already is.
6. **Structural Analysis** (merge of Notation + ADD Accounting, 47K combined). One chapter:
   the ADD concept card visible in its Line region, then notation grammar, worked examples,
   the derivation atlas, and ADD accounting inside. Merging removes today's split of one
   topic (how structure becomes a score) across two sections, and resolves the found
   duplication (the checksum stated twice, and two different expansions of "ADD").
7. **Runs and Sequences** (merge of Symbolic Composition + Run Architecture, 32K). Both are
   about trick-to-trick composition, not vocabulary definition; merging also defuses the
   found name collision between the Composition concept card (base plus operators) and the
   "Symbolic Composition" section (sequences).
8. **Reference and History** (tail chapter: Advanced Reference, Media claim scope,
   Community, Historical, Sources, ~21K). Low-traffic material that currently pads the
   scroll.

**Tier C: new chapters (where future growth lands)**

9. **Doctrine and Insights** (new). Synthesis, not definitions: how to tell similar tricks
   apart, why specific doctrine exists, historical naming inconsistencies, community
   misconceptions, and a reader-facing index of the registry's big ideas linking each to
   its home entry. Boundary that keeps the two-planes ruling intact: this chapter holds
   reference-style synthesis (comparisons, disambiguations, rationale summaries); the
   argumentative essays stay separate surfaces the chapter links to, and raw doctrine
   papers stay private. This is where the next doctrine wave's public residue lands
   without creating new top-level sections.
10. **The Frontier** (new). Not a trick list: the practical 8-ADD frontier, theoretical
    higher-ADD structure, structural limits, unnamed-but-derivable forms, and the currently
    open questions stated honestly as open. Maps to the registry's frontier insight
    (planned as a teaser plus essay); the chapter is that teaser grown to chapter scale,
    subject to the standing public-prose hygiene rules (no individual names, no internal
    ruling references).

**Recommendation on Structural Patterns:** do not open it as a separate chapter yet. Its
candidate content (symmetry, reversals, conserved terminal mechanics, ecosystems,
compositional patterns) is exactly the cross-cutting thread material of Doctrine and
Insights, and two thin sibling chapters would recreate the sprawl problem at chapter
scale. Start it as the "patterns" half of Doctrine and Insights; split it out later only
when its content earns a chapter on volume, which the architecture then accommodates
without restructuring.

---

## 4. What stays inline, what links out, what deep-dives

**Stays inline (hiding it would damage first-time readability):**
- The trimmed orientation and the chapter map.
- The twelve-atom band, complete.
- All six Core Concept cards (each already carries its own disclosure).
- The foundational term lists for surfaces, dexterities, timing (the words themselves; a
  glossary that hides its definitions has failed).
- The timing-clock figure.
- Every chapter's Line region: two or three visible sentences plus, where one exists, that
  chapter's concept card.

**Links out (already owned elsewhere; the glossary teaches the concept and points):**
- Per-family rosters and detail: family pages.
- Operator and modifier reference depth: the standalone operators page.
- Full worked ADD decompositions: the ADD analysis page.
- Set systems as objects: the Set Encyclopedia.
- Canonical trick records: the dictionary.

**Large optional deep-dives inside the glossary (glossary-native; no other surface owns
the cross-cutting view):**
- The Family Encyclopedia chapter (the comparative system view).
- Structural Analysis (notation as a readable system plus its self-auditing score).
- Doctrine and Insights, and The Frontier.

---

## 5. Does this improve what it needs to improve?

**Navigation: yes.** The chapter shelf plus a single page-level TOC gives the reader a
complete model of the page in one screen. Deep links keep working (anchors into a
collapsed chapter open it; a no-JS reader sees chapters closed but openable, since the
mechanism is native disclosure).

**Perceived size: dramatically.** Default-visible content drops to roughly a fifth of the
current scroll, and, more important, future growth lands inside chapters, so the default
page stops growing even as the glossary does.

**Actual payload: unchanged, and this must be said honestly.** Collapsed markup still
ships. The 295K ceiling is a byte test and chapter disclosure does not buy headroom;
the found duplications (checksum restatement, the tricks/sets/modifiers overlap with the
Set vs Operator card, the two advanced panels) buy a few K, but sustained growth forces a
maintainer decision: deliberately raise the ceiling as chapters land, or re-express the
audit around default-visible weight, or (later, separately) load chapter bodies on demand.
That is an implementation-layer choice deferred on purpose.

**Maintainability: yes, and this is the strongest argument.** Chapters give new material a
deterministic destination (doctrine residue goes in Doctrine and Insights; frontier
movement goes in The Frontier; a new family lands inside the Family Encyclopedia), which
ends the every-addition-is-a-new-section pattern. Chapter boundaries are also natural
slice boundaries for the in-place strangler model already in use, and natural contract
boundaries for the pinned route tests.

**Fit with the ratified architecture: high, with one supersession to flag.** The spine
design already ratifies "later sections as collapsed teasers"; this proposal is that,
made concrete. The still-deferred global Simple/Deep/Expert depth toggle becomes largely
redundant under chapter disclosure (chapters are a coarser, more legible version of the
same control); recommend explicitly retiring the toggle from the plan if this is adopted,
rather than leaving two competing disclosure mechanisms ratified.

**Risks worth recording:** in-page find does not search closed chapters in all browsers
(mitigable at implementation with the hidden-until-found pattern); search engines weight
collapsed content normally but heading structure inside chapters must stay semantic; and
chapter Lines must be written as genuine teaching sentences, not marketing blurbs, or the
default page becomes a table of contents with no content.

---

## 6. Sequencing sketch (for planning, not commitment)

1. Ratify the chapter list and the Tier A/B/C assignment (curator decision).
2. Convert one heavyweight section as the pilot chapter (Family Encyclopedia: biggest win,
   cleanest boundary, its teaching prose already separable as the chapter Line).
3. Convert the remaining Tier B chapters one slice each, including the two merges
   (Notation + ADD Accounting; Composition + Run Architecture), which also clear the
   duplication and naming-collision items from the polish review.
4. Open the two Tier C chapters only when their first real content exists (The Frontier
   likely first, since its material already exists in doctrine work awaiting public form).
5. Revisit the size-ceiling policy at the point the first merge lands.
