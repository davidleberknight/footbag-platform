# MEDIA_RELATIONSHIP_LAYER_PLAN.md — indirect instructional coverage (2026-05-31)

**Architecture / governance / design sprint only.** No DB schema change, no relationship tables, no
trick promotion, no ontology-doctrine change, no hard-coded equivalence claims. Deliverable is this
plan. It is the full expansion of `exploration/freestyle-media-ingestion-2026-05-29/ARCHITECTURE.md`
**§3a** (direct-vs-indirect coverage; the `teaches` / `components-covered` proposal) into a concrete
relationship vocabulary, real-pattern audit, metric design, UX framing, and phased rollout.

Everything here is reversible analysis under `exploration/`. The write side (creating `media_items`,
galleries, public placement) is the primary maintainer's gallery-edit-tool track; this track stops at
the design + the candidate/manifest + the internal QC metric.

---

## 0. The one-sentence thesis

> A `#<slug>` tag answers *"is this clip about that trick?"* — but real footbag tutorials teach **many**
> things at once, and the questions learners actually ask are *"what does this video help me learn?"*
> and *"where is X taught?"* A **media→entity instructional-relationship layer** answers those without
> ever making a claim about what a trick **is**.

The whole design rests on one firewall: **an instructional edge is a pedagogical fact about a video,
never a structural fact about an ontology.** "This video teaches orbit while teaching ATW" must never
collapse into "orbit is part of ATW." Media pedagogy and canonical ontology stay separate layers
(the project's four-layer doctrine), connected by navigation, never by inference.

---

## PART A — Relationship taxonomy

### A.0 Design rules for the vocabulary

1. **Edges are media→entity only.** A media item points at a trick/set/operator/family/concept slug.
   Edges **never** connect two ontology entities (that would manufacture a trick→trick relationship —
   the corruption we are preventing). The trick→trick graph stays the curator's canonical layer.
2. **Every edge is a pedagogical claim, not an ontological one.** It says "this video helps you learn
   X" / "X is shown here." It says nothing about equivalence, identity, ADD, decomposition, or family
   membership.
3. **Targets must already exist as canonical slugs.** An edge can only point at an entity the platform
   already keys (active/pending trick slug, registered operator, public family, set, named concept). An
   edge never *creates* an entity or a membership.
4. **Curator-asserted, never parser-derived.** No edge is auto-inferred from notation or decomposition.
   (Same rule as the parser/editorial separation: parser data is parser data.)
5. **Minimal set, loose semantics, reversible storage.** Prefer few relations with wide, soft meaning
   over many narrow ones. All of it lives as a reversible content/tag convention (Part E), not schema.

### A.1 The candidate vocabulary, evaluated

| Relation | Intended meaning | Allowed targets | Implies ontology claim? | Primary risk | Verdict |
|---|---|---|---|---|---|
| **teaches** | Video instructs the target as a **primary subject** (breaks down how to do it) | trick · set · operator/modifier | No (pedagogy) | Over-use ("everything teaches everything"); blurring with `#slug` | **CORE.** `#<slug>` is its dedicated/primary special case |
| **components-covered** *(a.k.a. teaches-embedded)* | Video teaches/shows the target **incidentally**, as a component while teaching something else (orbit inside ATW) | trick · atom · operator | No — **but highest leakage risk** (reads like a decomposition) | Misread as "X is structurally part of Y"; combinatorial explosion if applied to every atom of every compound | **CORE, guarded.** Must be a *visible-teaching* fact, curator-asserted, never the structural decomposition |
| **demonstrates** | Video **shows** the target performed well, no teaching intent (demo/record) | trick · set · combo | No | Confusion with `teaches` | **CORE.** Maps to demo/record tiers |
| **exemplar-of** | Video is the **representative** clip for an existing family/operator/concept ("the gold mirage video") | family · operator · concept | Borderline (leans on *existing* canonical membership; asserts none new) | Treated as defining the family | **CORE, constrained.** Target must already be canonical; it selects media, not membership |
| **progression-step** | Video is **step N** of an ordered learning ladder | progression-id + ordinal | No (pedagogy) | Implies one "correct" order | **CORE (Phase 4).** Curator-authored ladders only |
| **introduces** | Video is the recommended **first exposure** to a concept | trick · concept · operator | No | Redundant with progression-step #1 / a beginner flag | **FOLD** into `progression-step` (ordinal 1) or a beginner-entry flag. Not its own relation |
| **indirectly-covers** | Umbrella for "covers without being dedicated to" | — | No | Too vague to act on as an edge | **REJECT as an edge** — keep as the *category name* for {components-covered + demonstrates}. Useful in prose, not as a stored relation |
| **related-concepts** | Loose "see also" between a video and adjacent ideas | any | **Yes, by accident** (a vague edge invites ontology-by-drift) | Dumping ground; un-auditable | **REJECT for now.** Concept adjacency already lives in the glossary; revisit only if a concrete need appears |

### A.2 The recommended minimal set

Five relations, each an edge `media_item → (relation, target-slug [, strength])`:

```
teaches            → primary instructional subject     (#slug is teaches:dedicated)
components-covered → incidental/embedded teaching      (the indirect-coverage core)
demonstrates       → shown, not taught                 (demo / record tiers)
exemplar-of        → representative media for X         (X already canonical)
progression-step   → ordered ladder position           (Phase 4)
```

Plus two optional scalar qualifiers on any edge (not new relations):
- **strength / confidence** — `primary | strong | partial | incidental`. Lets `teaches` carry "this is
  the dedicated tutorial" vs "this gets a clear 20-second breakdown mid-video."
- **curator-asserted** — always true in the curated layer; the flag exists to keep the door shut on any
  future auto-inference path.

**What the set deliberately refuses:** an `equivalent-to` / `same-as` / `decomposes-to` relation. Those
are ontology claims and have no place in a media layer. If a video's title says "Gauntlet (= stepping
ducking paradox torque)", the equivalence is the *curator's ontology decision* recorded on the trick
row, not a media edge. The media edge is just `teaches: gauntlet`.

---

## PART B — Real-world instructional patterns flat tagging fails to model

Audited against the live curated corpus and the exemplar audit
(`freestyle-media-ingestion-2026-05-29/candidates/EXEMPLAR_CORPUS.md`).

| Real pattern | Concrete example (from corpus) | Relation it actually is | What flat `#slug` loses | What the layer restores |
|---|---|---|---|---|
| **Set-list tutorial** | PassBack "set list" video covering **both pixie and fairy** | `teaches: pixie` + `teaches: fairy` (multi-target) | Forced to pick one `#slug` or mis-tag both as dedicated | Honest "teaches pixie **and** fairy" without claiming the video is *about* either alone |
| **Multi-trick tutorial** | AnzTrikz "Whirl and Reverse Whirl"; "Mirage & Illusion" | `teaches` × N (each named trick) | One trick gets the tag, the rest vanish, or both look like dedicated singles | Each named trick gets honest primary coverage; family-page can prefer the multi-trick clip |
| **Embedded atom teaching** | `orbit` taught inside the TT "Around The World" lesson (#14/#15) | `components-covered: orbit` | `orbit` reads as a **zero-media gap** when it is genuinely taught | Removes the false gap without a misleading `#orbit` dedicated tag |
| **Compound lesson that teaches its parts** | TT #31 "Symposium Mirage Stall" (shows symposium timing + mirage shape) | `teaches: symposium-mirage` + `components-covered: {symposium, mirage}` | The component teaching is invisible | Component primitives get embedded credit; compound keeps dedicated credit |
| **Operator demonstration** | A clip isolating the `paradox` / `symposium` operator across bases | `demonstrates: paradox` (operator target) | No operator namespace in flat tags → operator demos are unlinkable | Operator pages get representative media |
| **Family-overview tutorial** | A "whirl family" walkthrough touring whirl → rev-whirl → gyro-whirl | `exemplar-of: whirl (family)` + `teaches` × members | Tagged to one trick or none | One clip becomes the family's hero without implying it defines the family |
| **Progression video** | "Walking family" ladder ripwalk → sidewalk → bigwalk → … | `progression-step` (ordered) | No order, no ladder identity | Ordered learning path, beginner roadmap |
| **"How to hit X from Y"** | Transition/connector tutorials (enter whirl from a clipper) | `teaches: X` + a transition note (see open item below) | Transition context lost entirely | Connector pedagogy (deferred — needs a transition concept, not in scope) |
| **Movement-system explainer** | A dex-direction / no-plant / hippy-vs-leggy concept video | `teaches: <concept>` (concept target) | No concept namespace | Glossary concept cards get inline demo media |
| **Comparative set tutorial** | "pixie vs fairy: what's different" | `teaches` × N + a comparison framing | Looks like two unrelated dedicated clips | Honest "compares pixie and fairy" |

**Pattern across the table:** the loss is never about *which entity* — it is about the **kind of edge**.
Flat tags model exactly one edge kind (dedicated subject) and silently drop the other four (embedded,
demo, exemplar, progression). Many reported "coverage gaps" are therefore **relationship-modeling gaps**,
not actual missing media (orbit is the proof case).

---

## PART C — Coverage-metric implications

### C.1 The honesty problem

Today's dashboard (`legacy_data/event_results/scripts/24_qc_freestyle_media_coverage.py`) measures one
thing — **direct dedicated `#slug` coverage** — and reports it as "coverage": **16%** of 514 active
tricks have any dedicated video, **9%** a dedicated tutorial-tier clip. Because it sees only edge-kind 1,
it **undercounts** real pedagogical reach (orbit shows as uncovered though it is taught inside ATW).

The temptation is to "fix" the low number by counting embedded/demo coverage into the headline. **That
is dishonest inflation** and is forbidden: a trick taught for 15 seconds inside another lesson is not the
same as having its own tutorial. The fix is **two separate, clearly-named metrics**, never one merged
number.

### C.2 Recommended metric vocabulary (rename + split)

| Metric | Definition | What it counts | Headline role |
|---|---|---|---|
| **Direct dedicated coverage** | Has a clip whose **subject** is this trick (`teaches:dedicated` / `#slug`) | edge-kind 1 only | **Primary headline** (unchanged 16% / 9%) |
| **Embedded instructional coverage** | Taught **inside** another clip (`components-covered`) | edge-kind 2 | Reported **separately**, never added to the headline |
| **Demo / reference coverage** | Shown without teaching intent (`demonstrates`, record/demo) | edge-kind 3 | Separate, lowest weight |
| **Effective pedagogical reach** | Direct **or** embedded (explicitly a *different* metric, labeled as such) | 1 ∪ 2 | A **secondary** line, always labeled "(incl. embedded)" |

Rules carried forward verbatim:
- **frequency ≠ authority** — corpus recurrence never promotes a name; a video appearing N times is
  not evidence of canonical status.
- **teaching ≠ ontology** — an instructional edge never feeds ADD/decomposition/family.
- **embedded ≠ direct** — embedded coverage is reported, never merged into the dedicated headline.

### C.3 Dashboard + public wording

- **Dashboard:** split the single `primary_strength` column into `direct_strength` and
  `embedded_strength`; add a `pedagogical_reach` column explicitly suffixed `(incl. embedded)`. The
  `CORE_GAP` bucket should stop firing for tricks that are embedded-covered (orbit), reclassifying them
  to a new `EMBEDDED_ONLY` bucket — visibly distinct from both `COMPLETE` and `CORE_GAP`.
- **Public, dedicated:** "Tutorial available" (only when `teaches:dedicated`).
- **Public, embedded:** "Taught inside the *Around The World* tutorial" — names the host, makes the
  indirect nature obvious, never shows a bare "covered" checkmark.
- **Public, demo:** "Demo only — no tutorial yet."

---

## PART D — UX / glossary integration

**Design law for this layer:** users see the **human consequence**, never the relation taxonomy. The
target feeling is *"oh, this video also teaches pixie and fairy"* — never *"this video creates an
`exemplar-of` edge."* Progressive disclosure; beginner-plain; no governance vocabulary on the surface.

| Surface | What renders | Example microcopy | Disclosure level |
|---|---|---|---|
| **Media card** | The clip's own coverage chips | "Teaches: **pixie**, **fairy**" · "Also shows: orbit" | Always visible, compact |
| **Trick detail** | Dedicated vs embedded media, clearly distinct | "▶ Tutorial" / "Also taught inside *Around The World*" | Dedicated first; embedded under a lighter "Where else it's taught" line |
| **Family page** | One exemplar hero + member coverage | "Featured walkthrough: the **whirl family**" | Hero up top; per-member chips below |
| **Operator page** | Operator demos | "See the **paradox** operator in action" | One representative clip, restrained |
| **Glossary** | Inline demo on a modifier-feel / concept card | a single embedded clip on the `#modifier-*` card | Collapsed by default (matches existing observational panels) |
| **Set encyclopedia** | Set-list and comparative clips | "This tutorial covers **pixie** and **fairy** together" | On the set-detail page, below the canonical content |
| **Progression / learn** | Ordered ladders | "Step 3 of the walking-family path" | The pathway surface owns the ordering |

Restraint constraints (carry the symbolic-restraint doctrine over to media): no relationship-graph
visualizations, no interactive edge explorers, no "ontology" language anywhere public. A coverage chip
is a navigation aid, not a claim. The eclipse precedent applies directly (see E.3): any embedded-coverage
chip on a doctrine-unsettled trick must read as observational, never as a settled structural claim.

---

## PART E — Safe-first implementation strategy

### E.1 Phases (mapped to the requested rollout + ownership)

| Phase | Scope | Storage | Surface | Owner | Gate |
|---|---|---|---|---|---|
| **1 — passive metadata** | Author the namespaced-tag + relation registry (`#kind-*`, `#family-*`, `#modifier-*`, `#set-*`, `#progression-*`, and the relation vocabulary); tag **new** sidecars at ingest | reversible content module (`src/content/freestyleMediaTaxonomy.ts`, proposed in §6 of the prior sprint) + sidecar `tags[]` | **none** | James-track | **Safe now** |
| **2 — lightweight edges + hidden metrics** | Record `teaches` / `components-covered` / `demonstrates` as curator-asserted edges (still tag/sidecar/content-module, **no schema**); compute the split metrics in the QC dashboard | sidecars + dashboard (scripts 24/25) | internal only | James-track | **Safe now** (mechanism); **specific doctrine-gated edges blocked** (E.2) |
| **3 — public indirect-coverage surfacing** | Render dedicated-vs-embedded on trick/family/operator/glossary surfaces | read-only consume of Phase 2 data | public | **Dave-track** (UI placement) | Safe for doctrine-clean targets; coordinate with maintainer |
| **4 — progression / instructional graphs** | Ordered ladders, set-system learning paths | progression namespace + ordering | public | Dave-track | Safe as **pedagogy**; depends on Phase 3 |

### E.2 What is safe before Red Wave 2 vs blocked

The relationship layer is **media-side and pedagogical**, so the *mechanism* is independent of trick
ontology rulings and can proceed. What is gated is **specific edges whose targets are doctrine-unsettled**:

**Safe before Red Wave 2:**
- The entire registry + tag conventions + the five-relation vocabulary (Phase 1).
- `teaches` / `demonstrates` / `exemplar-of` edges on **doctrine-clean** targets (the 12 core atoms,
  the settled families: mirage, whirl, osis, butterfly, legover, pickup, swirl; pixie/fairy as sets).
- The metric split (Part C) and the `EMBEDDED_ONLY` reclassification — these *reduce* false gaps and
  make no ontology claim.
- The orbit-in-ATW embedded edge — the canonical exemplar, fully doctrine-clean.

**Blocked / observational-only until doctrine settles:**
- `components-covered` edges that assert a **disputed decomposition** as the reason for coverage.
  Example: an eclipse tutorial tagged `components-covered: symposium` leans on the **unsettled eclipse
  decomposition** (the case study just shipped to the glossary marks this "doctrinally unsettled"). Such
  an edge must wait for the ruling, or render as observational and phrased as embodied-coverage, never as
  a structural claim.
- Any edge targeting a **Red Wave 2 cluster**: atomic-on-rotational (Q3), blurry-transitivity,
  operator-vs-trick boundary (flailing/railing), `illusioning` (registration routed through Wave 2).
- Any edge on a **pending/unpromoted** trick — coverage may stage (`is_active=0`, hidden) but never
  surfaces publicly, matching the existing media reset-compatibility rules.

### E.3 Corruption-prevention invariants (the firewall, restated for this layer)

1. **No media edge mutates ontology.** Not ADD, not decomposition, not family, not alias, not
   publication status. Curated media may be *cited* by the curator as evidence in an ontology decision;
   it never *is* the decision, and uncurated media can only ever *associate* by tag.
2. **No trick→trick edges.** All edges are media→entity. The trick relationship graph stays canonical.
3. **No parser-derived edges.** Curator-asserted only; the `curator-asserted` flag is the standing guard.
4. **`components-covered` is a visible-teaching fact, not a decomposition.** It requires the component to
   be actually shown/taught in the clip; it is not "every atom structurally inside the compound."
5. **Lockstep with detail-page doctrine** (carried from the glossary case-study alignment rule): if a
   target trick's canonical op_notation / ADD / family changes, the media edges and any public coverage
   wording for it update in lockstep.

### E.4 Highest-ROI path before Red adjudication

1. **Author the registry (Phase 1).** One reversible content module; unblocks everything; zero risk.
2. **Backfill the orbit-class embedded edges + ship the metric split (Phase 2, James-track).** This is
   the single highest-honesty-per-effort move: it removes the most visible false gaps (orbit and peers),
   makes the dashboard tell the truth, and touches no schema and no doctrine.
3. **Hand Dave a clean candidate manifest for Phase 3 surfacing** of doctrine-clean targets only.

Defer Phase 4 (progression graphs) and all doctrine-gated edges until after Red Wave 2.

---

## Final — the six answers

1. **What problem this layer solves.** Footbag tutorials are inherently multi-trick / multi-concept, but
   the flat `#slug` tag models only "this clip is *about* one trick." The layer lets media truthfully
   express the other four edge kinds (embedded, demo, exemplar, progression) so coverage reflects real
   instruction and "gaps" stop being relationship-modeling artifacts.

2. **Why flat `#slug` tagging is insufficient.** `#slug` encodes exactly one relation — dedicated
   subject. It cannot say "taught inside another lesson" (orbit-in-ATW), "teaches both pixie and fairy",
   "shown but not taught", or "step 3 of a ladder" — without either dropping the information or lying by
   tagging non-dedicated coverage as dedicated.

3. **How instructional relationships differ from ontology relationships.** Instructional edges are
   **media→entity pedagogical facts** ("this video helps you learn X"). Ontology relationships are
   **entity→entity canonical facts** ("X decomposes to Y", "X is in the whirl family"). The layer only
   ever creates the former; it is structurally incapable of creating the latter (no trick→trick edges,
   no parser inference, curator-asserted).

4. **How indirect coverage improves pedagogical honesty.** It surfaces teaching that already exists but
   is invisible to the dedicated metric (raising *reach* without faking *dedicated* numbers), and it
   reports embedded/demo/dedicated as **separate, honestly-labeled** metrics rather than one inflated
   figure — so the dashboard and public copy both stop overstating and stop understating.

5. **How to prevent media semantics from corrupting canonical doctrine.** The E.3 firewall: media edges
   never mutate ontology; edges are media→entity only; no parser inference; `components-covered` is a
   visible-teaching fact, not a decomposition; doctrine-gated targets stay observational/blocked until
   ruled; and everything updates in lockstep with detail-page doctrine.

6. **Highest-ROI path before Red adjudication.** Author the reversible registry (Phase 1), then backfill
   the orbit-class embedded edges and ship the split coverage metric (Phase 2, James-track) — maximum
   honesty gain, zero schema, zero doctrine exposure — and hand a doctrine-clean candidate manifest to
   the maintainer for Phase 3 public surfacing. Defer progression graphs and all doctrine-gated edges to
   post-Wave-2.

---

### Provenance
Expands `exploration/freestyle-media-ingestion-2026-05-29/ARCHITECTURE.md` §3a and that sprint's
`candidates/EXEMPLAR_CORPUS.md` coverage audit. Target media model and ownership boundaries per the
`footbag-curated-media` skill (unified `media_items` + `media_tags` + sidecars + `SOURCE_TIER`; the
`freestyle_media_*` graph is deprecating and must not be revived). Governance carried from
`freestyle-topology-governance` (observational ≠ canonical; reversible content modules over SQL) and
the freestyle media-stabilization rulings (media = teaching layer, not ontology; frequency ≠ authority).
Design + analysis only; no DB, schema, loader, gallery, service, or ontology change.
