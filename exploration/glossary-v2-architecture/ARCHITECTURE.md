# Glossary V2 — A Layered Teaching System (Information Architecture)

Working design, twice revised: first after the editorial review, then after the fifteen
pilot entries (PILOT_REVIEW.md), the dependency-graph synthesis (DEPENDENCY_GRAPH.md),
and the maintainer's four gating rulings. It defines structure, tiering, boundaries,
and the reusable mechanic; it does not author entries and does not design UI.

**Authoritative companions (they win where they overlap this document):**

- **`INSIGHT_REGISTRY.md`** — the single source of truth for the insight list. Where
  this document names insights, the registry governs. There is no competing list.
- **`../final-stewardship-audit-2026-07-05/RULINGS_GATING_QUESTIONS.md`** — the
  maintainer's rulings on doctrine-paper visibility, the Foundational-Skills list, the
  migration strategy, and voice ownership. Folded in below; the ruling document wins any
  conflict.
- **`DEPENDENCY_GRAPH.md`** — the hidden spine. The glossary and teaching order is a
  topological sort of it (§11). It is a private design tool and never a public surface.

---

## 0. The thesis

Version 1 answers *what are the tricks*. The V1.1 glossary answers *why does freestyle
look the way it does*, and teaches not only what the vocabulary means but **how experts
think about freestyle.** The material already exists — the doctrine papers, the
reconciliation series, the content modules, and now the dependency graph.

The single design idea: **one concept, three readers, revealed in layers.**

- **Beginner — "What is this?"** (the Line, always visible)
- **Intermediate — "How does it relate?"** (the Relates layer)
- **Expert — "What does this reveal?"** (the Reveals layer, and it is rare)

---

## 1. The core mechanic: the three-audience entry

```
Mirage                                              [term]
  A dexterity that circles the bag to the opposite  ← LINE     always visible, plain words
  side and lands back on a toe stall.
  ▶ How it relates                                  ← RELATES  intermediate
     Illusion's direction mirror. Same ADD. Not the
     same trick.
  ▶ What it reveals                                 ← REVEALS  expert — only when the entry earns it
     Direction is structural → Mirror Law.
  Explore: illusion · the Mirror Law · toe stall    ← EXPLORE  the journey outward
```

Rules:

- **The Line is plain words** — the four-test voice standard (§13) governs it: physical
  first, plain English, no metric-first opening.
- **Relates is relationships** — mirrors, neighbors, family, role, "commonly confused
  with," and **the one-line reference to an insight that lives elsewhere.**
- **Reveals is a revelation, and it is rare** (§3). Most entries do not have one.
- **Explore is the exit** — links into the rest of the encyclopedia (§7).

---

## 2. Two kinds of entry (the tiering, corrected)

The pilot proved the earlier three-tier scheme carried a dead layer — the "reference
Reveal," an expander that only said "see the other entry." It is gone. **There are two
kinds of entry:**

- **Insight home** — an entry that is the canonical home of a genuine insight. It has a
  Reveal. These are **rare** (about six across the fifteen pilot entries). This is the
  whole point: if a Reveal is present, it *means something* — this entry is where an
  insight lives.
- **Connective** — every other entry. Line + Relates + Explore, no Reveal. Where the
  entry instantiates an insight that lives elsewhere, the one-line reference sits in
  **Relates**, not in a Reveal of its own.

Beneath both sits the trivial case — **reference terms** (abbreviations, minor variants,
window/quality words): Line only, no Relates, no Explore. A beginner needs them; they
teach no system.

**Distribution is deliberately skewed.** A healthy glossary is mostly connective
entries and reference terms, with a small spine of insight homes. Over-Revealing is the
failure mode; the pilot caught it and this is the fix.

### The fifteen pilot entries, reclassified

"Insight home" entries carry a Reveal; "connective" entries carry the insight-link in
Relates. Note ATW, Illusion, Orbit, Swirl, and Blender moved to connective — the pilot's
pacing finding (one revelation per cluster; do not stack three keystones in six entries).

| Entry | Kind | Foundational Skill? | Reveal / where its insight lives |
|---|---|---|---|
| Toe Stall | **home** | ✔ | receiving state (canonical) |
| Clipper Stall | **home** | ✔ | receiving state (canonical, shared with Toe) |
| Mirage | **home** | ✔ | direction is structural → Mirror Law |
| Whirl | **home** | – | whirl/swirl: one distinction, two lineages |
| Blur | **home** | – | the algebra, rung 1 (name level) → Name vs Structure |
| Torque | **home** | – | the algebra, rung 2 (formula level) |
| Butterfly | **home** | ✔ | the algebra, rung 3 (family level) |
| Double Down | **home** | – | a family can be one structure in several variants |
| Around the World | connective | ✔ | full-orbit fact; sets up Mirage (no Reveal) |
| Osis | connective | ✔ | (Core-atom; feeds Torque/Blender — insight lives at Torque) |
| Orbit | connective | – | reverse ATW; Mirror Law link in Relates |
| Illusion | connective | – | mirage reversed; direction-is-structural link in Relates |
| Swirl | connective | – | whirl's mirror; two-lineages link in Relates |
| Blender | connective | – | whirling osis, torque's twin; algebra link in Relates |
| Barrage | connective | – | two-dex set; furious=barraging note in Relates |
| Double Over Down | connective | – | down-family member; link to Double Down |

Eight homes across fifteen entries, and three of those homes (Blur, Torque, Butterfly)
are one insight at three depths (§3). **Foundational Skill and insight-home are
independent properties** (§6): Toe Stall is both; ATW is a Skill but not a home; Whirl
is a home but not a Skill.

---

## 3. The Reveals standard, and the collapsed algebra insight

> **A Reveal never simply provides more information. A Reveal changes how the reader
> thinks.**

The test: *after reading it, would the reader look at freestyle differently?* If it is
"another fact about mirage," it is not a Reveal — it is a Relates line.

**The pilot's load-bearing correction: the three "algebra" insights are one.** The
earlier list treated "the name is the structure" (Blur), "famous tricks are compressed
formulas" (Torque), and "a family is one atom extended" (Butterfly) as three
revelations. Written out, they fire the same "aha" three times and dull it. They are
**one insight at three depths, sequenced as a staircase:**

1. *Name level* — a short name hides a structural name (Blur introduces it).
2. *Formula level* — a name that sounds primitive is a base plus an operator (Torque
   deepens it).
3. *Family level* — a whole named family is one atom extended (Butterfly completes it).

Each rung's Reveal names where in the arc it sits ("the same lesson Blur taught, one
level down"), so the reader climbs rather than loops. The staircase is one registry
entry with three home-entries.

**The insight set is small and lives in `INSIGHT_REGISTRY.md`, not here.** That file is
authoritative. The rule it enforces: an entry may carry a Reveal only for an insight in
the registry; a proposed Reveal whose idea is not in the registry (and does not earn
admission to it) is a Relates line in disguise. This document does not maintain a
parallel list.

---

## 4. Cross-cutting insights — canonical home plus thread

- **Each insight has one canonical home** (an entry or an essay) that states it in full
  — the algebra insight uniquely has three, the staircase rungs.
- **Every other entry that touches it carries a one-line reference in Relates,** never a
  restatement. Illusion's Relates says "mirage reversed; direction is structural (→
  Mirror Law)" — no second copy of the paragraph.

This kills the largest duplication risk and turns each insight into a thread the reader
keeps rediscovering — the pattern itself becomes the lesson, which is the reward
mechanic (§8). The registry records, per insight, its canonical home and its
referenced-by entries, so the thread is auditable.

---

## 5. Two planes, and the essays (doctrine-papers ruling folded in)

- **The Glossary is a reference surface** — per-concept, scannable, layered.
- **Essays are argument surfaces** — one thesis, read start to finish. An entry that
  wants to argue becomes a **teaser plus a link**; the argument lives only in the essay.

**Ruling (doctrine-paper visibility): the doctrine papers are private working
scholarship.** Public doctrine ships only as edited essays and concise notes, never as
raw papers, Red packets, or adjudication documents. The hard consequence for essay
authoring: **an essay carries its evidence inside itself, in prose** — "the encyclopedia
compared over a thousand readings across three outside sources and found one true
contradiction" — and never cites a repo path or a paper title as if the reader can
follow the link.

First edition ships three essays, chosen because the keystone entries link into them:

| Ship in V1.1 | Which entries depend on it |
|---|---|
| **Name vs Structure** | Blur and the algebra staircase |
| **The Mirror Law** | Mirage, and the Relates links on Illusion, ATW, Orbit, Whirl, Swirl |
| **The Frontier** | the 8-ADD ceiling entries |

Defer to V1.2: Read a Trick Like an Expert (a tutorial, not a "why" essay — the Notation
Reveal carries its core), How Freestyle Evolved, How We Know What We Know.

---

## 6. Core Concepts vs Foundational Physical Skills (the Bases ruling)

**Ruling: Foundational Bases are physical learner gateways, not graph-theory hubs.** The
dependency graph revealed that "the concepts most depended on" and "the movements a
player learns and returns to" are different sets. The design keeps them as two named,
never-merged categories:

- **Core Concepts** — the abstract ideas the graph shows many things depend on:
  Dexterity, Direction, Side, Set, Operator, Composition, Cross-body, Same-side /
  opposite-side, Additive scoring. These are the **graph hubs.** They are glossary
  entries (several are insight homes), but they are **not** Foundational Physical Skills
  and never carry that badge — a learner cannot stand on "Composition."
- **Foundational Physical Skills** — the tricks and positions a player physically learns
  and repeatedly returns to; the **learner-facing gateways.** The ruled V1.1 six: **Toe
  Stall, Clipper Stall, Around the World, Mirage, Butterfly, Osis.** Held for later
  (after the voice and page pattern prove out): Rake, Pendulum, Inside Stall, Whirl,
  Pickup / Legover.

A Foundational Physical Skill is an entry marked `foundationalSkill: true`. Its
treatment is the **rich Explore block and a "you will return here" framing** — a
learner gateway, not necessarily an insight home. The two properties are independent:
Toe Stall, Clipper Stall, Mirage, and Butterfly are both Skill and home; ATW and Osis
are Skills that are connective (no Reveal); Whirl and Blur are homes that are not Skills.

This requires **no new route, no new schema, no ontology change** — a pedagogical
projection over the existing atoms. Dedicated Skill *pages* (`/freestyle/bases/:slug`)
are a possible V1.2 graduation, built from the same entry content only if it proves it
wants more room. The graph's own vocabulary — "hub," "gateway," "out-degree" — is a
private design instrument and never reaches a template.

### 6a. Anchor family pages (the Toe Stall / Clipper Stall ruling)

**Ruling: Toe Stall and Clipper Stall get family-style pages, reachable from both the
dictionary and family navigation — but in a special *anchor* variant, never the ordinary
descendant-roster family template.**

They qualify twice over: they are two of the twelve core atoms, and they are the
foundational parents that almost the entire vocabulary grows from. That earns them a place
in the visible top family / foundational layer — a placement granted here by **explicit
curator override**, not by the ordinary family-promotion test. The override is specific to
these two core-atom anchors and sets no precedent (see the ATW / Rake note below).

The reason they cannot use the normal family page: an ordinary family page lists every
descendant inline, and these two route so many downstream tricks that an inline roster
would bury the page and teach nothing. The anchor variant answers *what this is and what
grows from it* without dumping the descendant set.

**Anchor page content (the variant's template):**

- what the stall is;
- why it anchors the vocabulary (its role as a foundational parent);
- how it differs from an ordinary family (an anchor, not a tidy descendant list);
- what *kinds* of tricks route through it — categories, not an enumeration;
- a small, curated set of representative pathways;
- links to the major families and example tricks that grow from it;
- a link to the full filtered trick list, for the reader who wants the complete descendant
  set.

**Hard rule: do not render hundreds of descendants inline.** The complete set lives behind
the filtered-list link; the page itself stays a curated, teachable overview. This is the
same anti-duplication contract as §9 — teach the concept and link to the roster rather than
embed it — applied to the two atoms whose rosters are largest.

**ATW and Rake are not promoted with them.** Around the World and Rake remain lesser /
minor families for now. They may earn teaching treatment later, but they are **not** moved
into the top family layer on current descendant counts, and the Toe Stall / Clipper Stall
override is not a precedent that promotes them. The two stalls are promoted because they
are core-atom foundational parents; ATW and Rake are not.

**Status: planning / doctrine only.** No code, no production data change, and no
family-page rewrite yet. When implementation begins, the anchor variant is a page pattern
distinct from the ordinary family template and from the possible `/freestyle/bases/:slug`
Skill pages of §6; whether it shares a route with either is an implementation decision
deferred to that slice.

---

## 7. The Explore block — the glossary as the start of a journey

Every insight-home and connective entry ends with an **Explore** block linking outward,
so the glossary begins a learning path rather than ending one. Explore scales:

- **Foundational Physical Skill:** the richest — exemplar tricks, family, the essays it
  feeds, notation, records, frontier. A hub.
- **Insight home / connective:** its exemplars, its mirror/twin, the essay its insight
  links to, a few onward links.
- **Reference term:** none (a leaf).

Explore is also the **anti-duplication device**: the glossary never restates related
tricks, family rosters, or records — it *links* to the surfaces that own them.

---

## 8. Making discovery rewarding

1. **The insight thread** (§4) — meeting one insight across many entries makes the
   pattern itself the reward. The strongest mechanic.
2. **Every Reveal is a genuine surprise** (§3), and rare, so it lands.
3. **Self-verification** — the notation and ADD entries let the reader do the arithmetic
   and confirm the bracket-count checksum. "I checked it and it's true" is the best
   disclosure of all.
4. **Surprising cross-links** at Relates ("the same shape as X under another name").
5. **The staircase** (§3) — Blur → Torque → Butterfly rewards the reader who follows one
   idea down three levels.

Note the earlier "depth-control-as-invitation" mechanic is deferred: the global
Simple/Deep/Expert toggle is **not** in the first slices (§11a ruling). Discovery in
V1.1 is driven by per-entry expanders and the thread, not by a page-wide mode.

---

## 9. Duplication map — where it will occur, and the guard

| Risk | Guard |
|---|---|
| The same insight restated on every instantiating entry | Canonical home + one-line Relates reference (§4); registry audits it |
| Three algebra insights firing the same aha | Collapsed to one staircase (§3) |
| A dead "reference Reveal" layer | Removed; two entry kinds (§2) |
| Family roster in the glossary vs family pages | Glossary teaches the concept, links to the roster; V2 removes the embedded roster |
| Per-trick "similar" lists in the glossary vs trick pages | Glossary teaches the relatedness taxonomy (§10), links to instances |
| Essay argument vs entry Reveals | The Reveal is a teaser + link; the argument lives only in the essay |
| Graph vocabulary leaking into the UI | "Hub/gateway/out-degree" stay private; only Core Concepts / Foundational Physical Skills reach the reader (§6) |

---

## 10. The "Similar Tricks" taxonomy (unchanged)

The glossary teaches the *kinds* of similarity; the per-trick lists live on the pages
that own them. Five types: structural twin (blur ≡ blurry mirage → trick page), mirror
(mirage ↔ illusion → Mirror Law essay), family sibling (→ family page), operator
neighbor (eggbeater → bladerunner → trick page), ADD neighbor (→ browse-by-ADD).

---

## 11. The top-level spine, ordered by the dependency graph

Nine sections. The order is **not arbitrary and not by ADD** — it is a topological sort
of the dependency graph (§11a): a concept is taught only after its prerequisites.

1. How to read freestyle
2. The vocabulary — the states, the dexterity and its properties, the core atoms
3. The grammar — set vs operator, the compositional premise
4. The operators — miraging, whirling, stepping, paradox, blurry, and the rest
5. Scoring (ADD)
6. The compounds and families
7. The notation — **late, not early** (you learn to write freestyle after you understand
   it; the current glossary front-loads notation, which the graph shows is backwards)
8. The frontier *(teaser → essay)*
9. How this was built

Default render shows only the Lines of sections 1–6; 7–9 are collapsed teasers.

### 11a. The dependency graph is the hidden spine

`DEPENDENCY_GRAPH.md` is the structure every ordering decision derives from:

- **Glossary order and teaching order are the same thing** — a topological sort of the
  graph. Prerequisites before dependents, always.
- **Order by prerequisite depth, not by ADD.** Depth (how many concepts you must already
  hold) and ADD (how many structural components a trick has) correlate loosely but
  measure different things. Torque and Barrage are both compounds; one is depth-12, one
  is depth-4. The glossary sequences by depth. This is why operators (§4 of the spine)
  come before compounds (§6) — teaching a compound before its operators is a topological
  violation, and it was the exact "composition gap" the pilot found.
- **Progression ladders are paths; the expert essay is a walk; the insights are the
  sinks.** All derived, not designed.
- **The graph is a private design tool, never a public UI.** Its derivatives ship (the
  order, the ladders, the essays); the graph itself, and its vocabulary, do not. A
  rendered concept-map is at most distant V2 speculation, not a plan.

---

## 12. The content model (for buildability, not for building now)

```
GlossaryEntry {
  term:             string
  kind:             'insight-home' | 'connective' | 'reference'
  foundationalSkill?: boolean          // learner gateway (the ruled six)
  coreConcept?:     boolean            // graph hub (Dexterity, Composition, ...)
  line:             string
  relates?:         string             // holds the one-line insight reference for connective entries
  reveals?:         { insightId, teaser, essayHref?, staircaseRung? }   // insight-home only
  explore?:         { label, href }[]
}
```

`reveals.insightId` must resolve to a row in `INSIGHT_REGISTRY.md`; that constraint is
what mechanically forbids a Reveal for an unregistered insight and forbids authoring one
insight twice. `foundationalSkill` and being an insight home are independent flags.

Every authored entry is checked against the **voice standard (§13)** before it is
canonical.

---

## 13. The voice standard (ruling: James owns voice QA)

**Ruling: James is the final voice QA owner.** Claude/Opus may draft; Red validates
doctrine; Dave reviews implementation; no Glossary V2 prose becomes canonical until
James approves it. Every flagship entry must pass four tests:

1. **Physical first** — a player can feel what the movement is.
2. **Plain English** — no doctrine jargon unless introduced.
3. **One useful relationship** — the reader learns what it sits next to.
4. **One earned insight** — only if the entry truly deserves it (this encodes
   "Reveals are rare").

Target reading experience: *"Oh, that's what it is." / "Oh, that's what it connects
to." / "Oh, that changes how I see freestyle."* The pilot entries (PILOT_ENTRIES.md) are
the exemplars of this voice.

---

## 14. Build order and the migration ruling

**Ruling (migration): in-place strangler, no parallel page.** The existing glossary
stays the public route; sections convert one at a time. No second "V2 glossary" is ever
built — that would create two authorities and invite a big-bang rewrite of a
release-audited, test-pinned, 2,434-line page.

Phases:

1. **Paper — fold-in and registry.** This revision, plus `INSIGHT_REGISTRY.md`. Done as
   part of this cleanup.
2. **Paper — tranche 2 entries in Markdown** (Dexterity, Osis, miraging, whirling,
   stepping, paradox, blurry), so the compressed-formula ladder can be walked end to
   end. **Gated on James's approval of this architecture and the registry** — do not
   start it unprompted.
3. **Paper — joint read of both tranches; James voice sign-off; finalize the registry.**
4. **Code — the smallest safe slice:** the three-layer entry partial (Line always
   visible; Relates and Reveals as per-entry `<details>`, the pattern ~10 freestyle
   partials already use), driven by a content module for **one section only — the core
   atoms** — replacing that one section of the current glossary in place. **No global
   depth toggle.** The pinned tests for that section update in the same slice; nothing
   else is touched.
5. **Code — sections convert one slice each;** Explore blocks land with their sections;
   the family roster is removed (the one deliberate subtraction) in its section's slice.
6. **Code — the global depth toggle,** only once most sections are converted.
7. **Essays in parallel** from step 4, Name vs Structure first, under the §5 citation
   constraint.
8. **Adversarial audit** of the converted glossary before V1.1 is declared.

Nothing in the code phases begins until the content phases prove the architecture.

---

## 15. What this deliberately does not do

- Not the dictionary (per-trick data stays on trick pages).
- Not a restatement of doctrine (essays cite in prose; the papers stay private, §5).
- Not auth-gated (depth is disclosure, never authorization).
- Not new schema, not new routes in V1.1 (Foundational Physical Skills are a role;
  Skill *pages* are a V1.2 maybe).
- Not a parallel page (strangler only, §14).
- Not the dependency graph made public (private design tool, §11a).
- Not content, and not UI — this is the information architecture; the entries are the
  content phase, the component is the code phase, and neither starts without the
  maintainer's go-ahead.

---

## The one-line summary

A glossary whose small spine of insight-home entries carries about half a dozen real
revelations — one canonical home each (the algebra insight, three sequenced rungs) and a
thread of Relates references — over a broad base of connective entries and plain
definitions; ordered by the dependency graph's prerequisite depth rather than by ADD;
its six Foundational Physical Skills kept distinct from the Core Concepts that are the
graph's hubs; three insights grown into essays that cite their evidence in prose because
the doctrine papers stay private; migrated in place one section at a time; and no line
of it, prose or code, canonical until James has passed it against the four-test voice
standard.
