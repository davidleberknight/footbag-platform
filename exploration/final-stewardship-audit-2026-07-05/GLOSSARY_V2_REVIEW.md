# Glossary V2 — Stewardship Review

Blunt assessment of the four design documents in `exploration/glossary-v2-architecture/`
(ARCHITECTURE.md, PILOT_ENTRIES.md, PILOT_REVIEW.md, DEPENDENCY_GRAPH.md), asked as:
is this mature, what is the smallest safe slice, and what kills it.

## Verdict up front

The design is **mature enough to author against, not yet ready to code against.** The
Line/Relates/Reveal model survived contact with real content; the pilot found real
flaws and the fixes are accepted; the dependency graph settled the ordering questions.
What blocks code is not design — it is that the accepted revisions live only in a
review document, the insight registry exists in three inconsistent copies, and the
migration strategy for a 2,434-line load-bearing production page has never been
chosen. Fix those three on paper and the first implementation slice is safe.

## Does the Line / Relates / Reveal model still hold?

**Yes, with the pilot's amendments, and stop re-litigating it.** Fifteen real entries
were written through it and it read naturally; the tiering discriminated (Barrage and
Double Over Down feel complete with no Reveal); the reward mechanic (insight threads)
worked in prose. The two amendments that matter: reference-Reveals are dead (two entry
kinds only — insight-home or connective), and Reveals are rare (six across fifteen
entries, not eleven). Any future session proposing a fourth layer or per-entry Reveals
is regressing against evidence.

## Is the insight registry sound?

**The idea is sound; the current state is a drift hazard.** The insight list now exists
in three places with three different shapes: the ~12-item candidate list in
ARCHITECTURE.md, the collapse-to-one-staircase correction in PILOT_REVIEW.md, and the
Layer-9 sinks in DEPENDENCY_GRAPH.md. Nobody has reconciled them. Before one more entry
is authored, there must be **one file — an INSIGHT_REGISTRY.md — that is the single
authority**, with the algebra staircase collapsed per the accepted review, each insight
carrying its canonical home entry, and a hard rule: an entry may not carry a Reveal
whose insight is not in the registry. The registry is small (likely ~10 rows after the
collapse). This is a one-hour task and it is the next task, before tranche 2.

## Is the dependency graph a design tool, or public?

**Design tool. Keep it private.** The graph's *derivatives* become public — the
glossary order is its topological sort, progression ladders are its paths, the expert
essay is a walk — but the graph document itself is pedagogy engineering written for
maintainers ("the reader's capacity for aha is finite"). Publishing it would be
publishing the lesson plan instead of teaching the lesson. One exception worth
considering later: a small rendered "concept map" visual could someday be a public
artifact, but that is V2-era speculation, not a plan.

## Foundational Bases vs Core Concepts — are they distinct?

**They are now, and the distinction must be guarded in naming.** The graph split what
the phrase "Foundational Base" conflated: *gateways* (learned first) versus *hubs*
(most depended on). The corrected hub set includes non-tricks — Dexterity, the
compositional premise — which can never carry a public "Foundational Base" badge
shaped like a trick page. Recommended vocabulary discipline: **"Foundational Base" is
the public, pedagogical badge** (Toe Stall, Clipper Stall, and whichever hub *tricks*
James ratifies); **"hub" and "gateway" are private graph vocabulary** that never
reaches a template. If graph vocabulary leaks into the UI, visitors get served the
lesson plan again. This needs one James decision (the ratified public Base list — see
HARD_QUESTIONS #5) and then it is settled.

## Build the collapsible sections soon, or author more content first?

**Author first. The design says so itself and it is right.** The phasing rule — UI
driven by proven content — has already paid off twice (the pilot found the reference-
Reveal flaw and the operator gap; a component built before the pilot would have
encoded both). The remaining content debt before any code:

1. Fold the accepted revisions into ARCHITECTURE.md (it is currently *frozen wrong* —
   frozen before the review it accepted).
2. Create INSIGHT_REGISTRY.md (above).
3. Author tranche 2: Dexterity, Osis, miraging, whirling, stepping, paradox, blurry —
   the seven entries that let the Torque ladder be walked end to end.
4. One read-through of both tranches together (does the staircase pace correctly?).

Only after 1–4 does code start.

## The smallest safe implementation slice

**One section, strangler-pattern, on the existing page.** Concretely: a three-layer
entry partial (Line always visible; Relates and Reveals as `<details>`, the pattern
~10 freestyle partials already use), driven by a content module for **one section
only — the twelve core atoms** — replacing that one section of the current glossary
in place. No depth toggle yet (per-entry expanders only), no data-model migration of
the other sections, no route change, no removal of anything else. The existing
glossary tests that pin that section's wording are updated in the same slice; every
other section's tests stay untouched. That slice proves the component, the content
model, and the migration pattern at minimum blast radius, and it is independently
shippable.

Explicitly NOT the first slice: the site-wide depth toggle (needs the whole page
converted to mean anything), the essays (independent track, can go in parallel), and
any removal of the family roster (a later section's slice).

## The biggest risk

Ranked:

1. **Big-bang migration of the live page.** The glossary is 2,434 lines, load-bearing,
   with integration tests pinning its content, and it passed a release audit two days
   ago. The failure mode is a future session "implementing Glossary V2" as a rewrite.
   The mitigation is the strangler slice above, made explicit in the plan so no session
   ever receives "build glossary V2" as one task.
2. **Voice drift at scale.** The pilot voice is distinctive and easy to do badly
   (essayistic Reveals go purple fast). The voice rules exist but live at the bottom of
   PILOT_REVIEW.md. Promote them into the architecture doc as a named "Voice standard"
   section, and require every authoring batch to be read against it. Decide who QA's
   voice (HARD_QUESTIONS #10).
3. **Design-doc accretion.** Four design documents, zero shipped entries. The chain was
   productive — each doc changed the design — but the marginal value of a fifth design
   document is now negative. The next artifact must be either the registry (a working
   file, not a design) or tranche-2 content. This review is deliberately the last
   meta-document.
4. **Insight-registry drift** (covered above) — three copies, no authority.

## Recommended sequencing (the whole V2 arc, for the record)

1. Fold revisions + INSIGHT_REGISTRY.md (paper, one sitting).
2. Tranche 2 in Markdown (seven entries).
3. Joint read of both tranches; finalize registry; James voice sign-off.
4. Slice 1: three-layer partial + the atoms section, strangler-style.
5. Sections 2–6 converted one slice each; Explore blocks land with their sections.
6. Depth toggle (only once most sections are converted).
7. Essays in parallel from step 4 (Name vs Structure first).
8. Adversarial audit of the converted glossary before V1.1 is declared.
