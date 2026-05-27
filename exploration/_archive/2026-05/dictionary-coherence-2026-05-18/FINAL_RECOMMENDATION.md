# Dictionary Coherence + Discoverability -- Final Recommendation

Cross-cutting architectural recommendation for the freestyle dictionary
subsystem, ahead of executable ADD accounting rollout, broader FM ingestion,
and further canonical promotion. Grounded in the current-state recon dated
2026-05-18 (see supporting docs in this directory).

This document is the SPINE. Six supporting docs deep-dive each surface:

1. `dictionary_landing_page_plan.md` -- Part 1 landing/orientation surface
2. `observational_layer_discoverability.md` -- Part 1.5 + standalone audit
3. `footbag_sets_architecture.md` -- Part 2 sets architecture
4. `category_view_retirement_review.md` -- Part 3 category audit
5. `notation_consistency_audit.md` -- Parts 4 + 5 notation + core-trick policy
6. `family_and_neighborhood_governance.md` -- Part 6 governance audit

The recommendations here are the curator-facing summary. The supporting docs
hold the evidence, line-cited code locations, alternative options considered,
and per-surface implementation sketches.

---

## Executive summary

The dictionary subsystem is not architecturally broken. Most surfaces the brief
identifies as missing already exist in code; the user-facing problem is
**discoverability and view-coherence**, not structural deficit. The
recommendation is therefore mostly about **landing surfaces, retirement, and
formalization of existing rules**, not greenfield construction.

The single highest-value change is a new **dictionary landing surface at
`/freestyle/tricks`** that orients the user across the six browse axes
(ADD / family / movement-system / topology / observed / operators) before
they pick one. That alone resolves ~60% of the brief's discoverability
concerns: the movement-system view, the observational layer, and the sets
cohort all already exist but are invisible to a first-time visitor.

Three smaller-but-load-bearing changes accompany it: retire `category` view,
formalize a 4-tier notation suppression hierarchy that removes the
`coreAtomLabel` prose fallback from public surfaces, and promote the
movement-system `Set / Uptime` axis to a discoverable top-level entry point
(without spawning a new browse mode).

All recommendations preserve the four-layer ontology separation (canonical
names / symbolic decomposition / glossary pedagogy / embodied movement
analogy) and the observational-vs-canonical invariant. No schema migrations,
no parser rewrites, no Wave-2 doctrine assumptions, no executable accounting
in this slice.

---

## Ontology disambiguation (load-bearing across all six docs)

Four classification surfaces appear repeatedly in the brief and the
recommendations. They are NOT interchangeable; each answers a different
question. Skill doctrine C ("family ≠ topology ≠ catch surface ≠
modifier") forbids collapsing them. Establish here so each supporting
doc can reference one shared definition.

| Surface | Meaning | Layer | Authority | Example |
|---|---|---|---|---|
| **Family** | Canonical derivative lineage | Canonical | Community + IFPA + Red rulings | `whirl` family: whirl, rev-whirl, spinning-whirl, paradox-whirl. Anchored by a single structural base. |
| **Movement System** | Operator / mechanical grammar | Canonical (curator-authored ontology) | Curator + skill doctrine | Set/Uptime, Entry Topologies, Midtime Body, No-Plant & Suspension. Four axes. Mechanic-anchored, not lineage-anchored. |
| **Neighborhoods** (formerly "topology") | Embodied movement similarity | Observational | Curator interpretation; never external authority | Hippy-downtime-dex, leggy-uptime-dex, X-dex compounds. Cross-family by design. |
| **Observed** | Externally seen, not yet canonized | Observational | External sources (PassBack, FM, TT, Shred Global, etc.) | Tricks named in tutorials/records that haven't entered canonical review. Status: pending-review, pending-canonicalization, or rejected. |

**Compact disposition:**

- **Family** answers: which structural anchor does this trick descend from?
- **Movement System** answers: how does the trick mechanically work?
- **Neighborhoods** answers: which other tricks feel like this one in the body?
- **Observed** answers: what does the external ecosystem name that we haven't formally adopted?

The first two are CANONICAL claims. The last two are OBSERVATIONAL --
they may inform canonical decisions, but they never freeze ontology. A
trick can simultaneously be `whirl`-family (canonical), participate in
the spinning Entry Topology (canonical), sit in the hippy-downtime-dex
neighborhood (observational), and be cross-referenced as
"`stepping-paradox-whirl`" in PassBack (observational provenance). Four
distinct facts about the same trick. None of the four collapses into
another.

See `family_and_neighborhood_governance.md` (doc 6) for the extended
treatment with multi-axis examples and curator decision pathways. The
other batch B docs (`observational_layer_discoverability.md`,
`footbag_sets_architecture.md`) reference this table inline.

---

## Problem framing (what the brief identifies, grounded in recon)

| Brief concern | Recon finding | Recommendation type |
|---|---|---|
| No landing/orientation surface on `/freestyle/tricks` | Confirmed -- default `?view=add` renders without preamble | NEW SURFACE (landing) |
| Observational layer hidden | Surface exists at `/freestyle/observational`; not linked from `/freestyle/tricks`; not announced anywhere a curious browser would notice | DISCOVERABILITY (link surface) |
| Missing "Footbag Sets" organization | Pixie / atomic / fairy etc. exist as modifier-type `set` rows, surfaced inside `movement-system` axis "Set / Uptime", but never as a top-level entry | DISCOVERABILITY (promote existing axis) |
| Category view redundant / weak | Confirmed -- buckets dex/body/set/compound overlap heavily with family and movement-system; "compound" is essentially "everything that's not a primitive" | RETIREMENT (with substrate preserved) |
| Notation rendering inconsistent | Confirmed -- 9-layer hierarchy in `DictionaryTrickCard` interface; `coreAtomLabel` prose fallback exposes implementation-flavored language ("core atom -- rotational dex") on public surfaces | FORMALIZATION + suppression rule |
| Family / neighborhood overlap explosion | Partially confirmed -- `FAMILY_DUAL_MEMBERSHIPS` + `RETIRED_FAMILIES` + `UNRESOLVED_COMPOUNDS` already govern most of it; specific items (rev-up in whirl family; intra-family ordering) need targeted audit | GOVERNANCE AUDIT (no taxonomy change) |

The five "DO NOT" constraints in the brief (no parser rewrites, no ontology
hardening, no FM bulk ingestion, no executable accounting implementation, no
Wave-2 assumptions) and the two PRESERVE constraints (observational/canonical
separation, shorthand elegance) match the existing skill doctrines verbatim.
Nothing in the proposed direction violates them.

---

## Cross-cutting recommendations (six calls)

### CR-1. Build a dictionary landing surface on `/freestyle/tricks`

Status: not yet built. Becomes the default render when no `?view=` param is
supplied. Existing browse views (`?view=add` etc.) continue to render
view-only when a param is present. The landing introduces, in this order:

1. **One-line ontology framing.** What a "trick" is in this dictionary
   (canonical only; observational surfaced separately).
2. **Stat row.** Active canonical trick count, observational trick count,
   modifier count, source-coverage summary.
3. **Six browse cards** -- ADD / Family / Movement System / Topology
   (renamed user-facing to "Movement Neighborhoods") / Observed Tricks /
   Operators & Components -- each with purpose + a 1-sentence "use this
   when..." explainer.
4. **Notation philosophy paragraph.** One paragraph explaining the
   symbolic-first / op-notation-fallback precedence so the user understands
   what they're looking at on trick cards. (No examples; no token soup; no
   AST visuals -- doctrine D restraint holds.)
5. **Cross-link to glossary** for terminology depth.

No schema change. No service-method change beyond a new `getDictionaryLandingPage`
shaping helper. No template change beyond a new `landing.hbs` partial under
`src/views/freestyle/tricks/`. Detail in `dictionary_landing_page_plan.md`.

### CR-2. Surface the observational layer from the landing -- not from the canonical browse

`/freestyle/observational` exists, is correctly isolated from canonical
trick surfaces (per skill doctrine A: observational ≠ canonical), and is
DB-free (content-module driven). The problem is that the average user never
finds it.

Recommendation: add an "Observed Tricks" card to the new landing surface
(CR-1) that links to `/freestyle/observational`. Label clarifies status
("community-observed; staged before canonical promotion"). The existing
route + page title stay unchanged. Do NOT:

- Rename `/freestyle/observational` to `/freestyle/tricks/observed`.
- Inline observational rows into `/freestyle/tricks` views.
- Render observational status badges on canonical trick cards.

Doctrine A and the topology-governance "Observational ≠ canonical" rule
make these last three forbidden. Detail in `observational_layer_discoverability.md`.

### CR-3. Promote the "Set / Uptime" movement-system axis to a discoverable surface; do NOT build a parallel "Sets" view

The brief asks for a coherent Sets surface covering pixie / stepping /
atomic / fairy / quantum / nuclear / symposium / gyro / ducking / spinning.
Recon shows these are already grouped under the `movement-system` view's
`Set / Uptime` axis (curator-authored, four-axis ontology, `freestyleMovementSystems.ts`).

Three options were considered:

- **Option A: Standalone `?view=sets` browse mode.** REJECTED. Duplicates
  the movement-system content under a different slug; forces curator to
  maintain two surfaces; risks ontology drift.
- **Option B: Dedicated section within Movement System view.** REJECTED.
  Already the case structurally; doesn't help discoverability.
- **Option C: Landing-card entry point + axis anchor link.** RECOMMENDED.
  Landing surface (CR-1) carries a "Footbag Sets" card that deep-links to
  `?view=movement-system#axis-set-uptime`. Same data, single source of
  truth, discoverable from the top. Card copy explains the set primitives
  briefly without duplicating the axis content.

Detail + option-tradeoff matrix in `footbag_sets_architecture.md`.

### CR-4. Retire `?view=category` from the browse-toggle UI; keep the substrate

The category buckets (dex / body / set / compound / other) overlap:

- `dex` overlaps with multiple families (`whirl` family, `mirage` family
  are largely dex-anchored). Family view encodes the same information with
  more precision.
- `body` overlaps with the movement-system "No-Plant & Suspension" axis.
- `set` overlaps with the "Set / Uptime" axis (CR-3).
- `compound` is "everything composed" -- essentially every active trick
  that isn't a primitive. Low informational density.
- `other` is residual; not browse-worthy.

Recommendation: **retire `?view=category` from the toggle UI** (matches
the soft-retirement pattern already applied to `?view=component` on
2026-05-18). Keep the `category` column on `freestyle_tricks` -- it
remains a filterable substrate for analytics and ADD-accounting purposes.
Backlink: include a brief "What happened to the category view?" note in
the supporting doc; no template-level retirement footer needed.

Lessons from the component-view retirement (already shipped): the toggle
disappears, the URL still resolves with a retirement notice, no schema
churn. Same pattern applies here. Detail in `category_view_retirement_review.md`.

### CR-5. Formalize a 4-tier notation suppression hierarchy on trick cards; remove `coreAtomLabel` prose from public surfaces

Current rendering (9-layer; see recon §6) is mostly correct but exposes
two implementation-leak surfaces the brief calls out:

- `coreAtomLabel` ("core atom -- rotational dex") renders as prose on cards
  lacking notation/chain. This is implementation language exposed to the
  public.
- `pendingDecomposition` pill is correctly observational-labeled but
  occasionally appears beside an ADD chip in a way that reads as "this
  trick is incomplete" rather than "this trick's decomposition is pending
  curator review."

Formal 4-tier hierarchy (in priority order, highest wins):

| Tier | Source | Renders as | Suppresses lower tiers? |
|---|---|---|---|
| 1. Full notation | `tokenizedEquivalences` from chain registry + alias governance | `≡ <reading>` lines, role-tagged tokens | Yes |
| 2. Op-notation fallback | `operationalNotation` (parser-derived, muted styling) | role-tagged token spans | Yes (relative to tier 3) |
| 3. Pending refinement | `pendingDecomposition: true` flag | small italic "pending decomposition refinement" pill | Coexists with tier 4 |
| 4. Silent (no fallback prose) | nothing | nothing | -- |

Removed entirely: the `coreAtomLabel` "core atom -- X" prose render. The
curator-authored core-atom registry continues to exist as metadata, but
does NOT render to the public card. A card with no tier 1 / 2 / 3 content
shows just the trick name + ADD chip; the user infers "primitive trick"
from the absence rather than from a meta-label.

Cards in the **Core Trick** registry (curator-flagged base tricks like
mirage, whirl, butterfly, osis) get an explicit override: their canonical
notation from the structural-decomposition source IS the primary render,
in tier 1 form. Example: `whirl` renders `[set] > leggy in dex > ss clipper`,
NOT "core atom -- rotational dex" prose. Detail in `notation_consistency_audit.md`.

This explicitly preserves the brief's Part 5 mandate ("movement notation
first; ADD separately; executable accounting only as secondary expandable
layer") and the doctrine D restraint constraint (no token soup, no AST,
no expansion-heavy symbolic UI).

### CR-6. Family governance: audit-pass first, no taxonomy changes this slice

The brief raises specific concerns (rev-up in whirl family; family
ordering; intra-family ordering; neighborhood overlap explosion). Recon
shows the family taxonomy is well-governed:

- `freestyleFamilyOverrides.ts` -- slug-level overrides + display names
- `freestyleFamilyDualMemberships.ts` -- additive multi-family memberships
- `freestyleFamilyInvariants.ts` -- shared terminal structure per family
- `RETIRED_FAMILIES` -- soft-retired families hidden from browse
- `UNRESOLVED_COMPOUNDS` -- pendingDecomposition pilot

Multi-axis movement relationships (skill doctrine C: family ≠ topology ≠
catch surface ≠ modifier) are correctly held separate. Single-value
`trick_family` is acknowledged as a known limitation; the dual-membership
allow-list handles the worst cases reversibly.

Recommendation: targeted audit only, no taxonomy changes this slice.
Specific items the supporting doc will address:

- Audit rev-up's whirl-family membership against community usage. Surface
  options to curator: keep / move to own family / dual-membership.
- Propose intra-family ordering rule (currently mixed): ADD ascending,
  base trick first, then complexity. Apply consistently.
- Singleton-family policy: current `length > 1` heuristic hides
  dada-curve / atw / others. Surface options to curator.
- Movement Neighborhoods (Part 1.4 in the brief) framing: the existing
  `?view=topology` IS the neighborhood surface. Rename user-facing to
  "Movement Neighborhoods" for clarity. Backend slug + column stay
  `topology`; rendering label updates. Doctrine C warning preserved
  (these are observational, never canonical).

Detail in `family_and_neighborhood_governance.md`.

---

## Per-surface recommendations (short form)

| Brief part | Surface | Recommendation | Risk |
|---|---|---|---|
| 1. Landing page | New `/freestyle/tricks` landing | BUILD new shaping helper + partial; render when no `?view=` param. | Low |
| 1.4 Neighborhoods | `?view=topology` (rename label) | RENAME user-facing label only; preserve observational footer. | Low |
| 1.5 Observed Tricks | `/freestyle/observational` | LINK from landing; do not rename or inline. | Low |
| 2. Footbag Sets | `?view=movement-system#axis-set-uptime` | LANDING CARD links to existing axis; do not build parallel view. | Low |
| 3. Category View | `?view=category` | RETIRE from toggle; preserve column substrate. | Low |
| 4. Notation consistency | `dictionary-trick-card.hbs` partial | FORMALIZE 4-tier hierarchy; remove `coreAtomLabel` prose. | Low / medium (UI churn audit) |
| 5. Core trick policy | Core trick cards specifically | Notation FIRST; suppress core-atom prose. | Low |
| 6. Family / neighborhood | Family + topology views | AUDIT ONLY; no taxonomy changes. | Low |

---

## Sequencing (if recommendations are approved)

Implementation order. Each is independently shippable; later items don't
block earlier ones.

1. **Notation suppression hierarchy** (CR-5). Smallest blast radius; one
   partial + a shape-helper change. Removes implementation language from
   public surfaces immediately.
2. **Category view retirement** (CR-4). Mirrors the component-view
   retirement pattern; well-trodden.
3. **Dictionary landing surface** (CR-1). New shaping helper + partial;
   lands the orientation surface; unblocks CR-2 and CR-3 from being
   discoverable.
4. **Observational discoverability** (CR-2). One landing card.
5. **Sets discoverability** (CR-3). One landing card + axis anchor.
6. **Family / neighborhood audit** (CR-6). Curator-paced; surface findings
   in the supporting doc, await triage.

A "movement neighborhood" label rename (Part 1.4) folds into CR-6 as a
tiny one-line label change in the topology view template.

---

## What this slice explicitly does NOT do

Restating the brief's DO NOTs + adding skill-doctrine-derived no-gos:

- **No parser rewrites.** Op-notation rendering keeps its current
  fallback role; nothing about the parser changes.
- **No ontology hardening.** No new `trick_family` slugs, no new modifier
  rows, no schema migrations.
- **No FM bulk ingestion.** Observational surface stays as-is until
  curator triage of the comparative-reconciliation queues + Wave-2 Red
  answers land.
- **No executable accounting implementation.** Notation hierarchy
  explicitly defers executable ADD accounting to a secondary expandable
  layer in a later slice.
- **No Wave-2 doctrine assumptions.** Specifically: blurry transitivity,
  barraging operator class, atomic family X-dex scope, Fairy weight,
  compression intent, hidden-vs-flat preservation are all curator-paced
  decisions; this slice does not anticipate any of them.
- **No promotion of observational groupings to canonical.** Topology +
  movement-neighborhood groupings remain observational. Skill doctrine A
  + C invariant.
- **No multi-family schema migration.** Reversible TypeScript content
  modules continue to handle dual memberships.
- **No new symbolic-surface affordances.** Doctrine D restraint holds: no
  token soup, no AST views, no popovers, no animated expansions.
- **No interactive movement-map visualizations.** Per topology-governance
  skill explicit prohibition.
- **No `coreAtomLabel` prose on public cards.** The metadata stays in the
  content module; the rendering disappears.

---

## Out of scope for this planning slice; queued for later

- Executable ADD accounting rollout (per brief).
- Broader footbagmoves.com ingestion (per brief).
- Wave-2 Red doctrine integration (post-answer).
- Schema migration for multi-axis taxonomy (post-Wave-2 + curator triage).
- Movement-similarity / distance metric (premature; skill doctrine
  warning).
- Curator-paced editorial revision of the 17 glossary v4 synthesis drafts
  (separate slice).
- Per-trick canonical-vs-observational provenance metadata (separate slice).

---

## Reading guide for the 6 supporting docs

Each supporting doc follows the same structure:

1. **Current state** -- what's in code, with file paths + line numbers.
2. **Problem evidence** -- what the brief identifies, validated against
   recon.
3. **Options considered** -- alternatives evaluated, with explicit
   rejection reasons.
4. **Recommended approach** -- the call this doc makes.
5. **Implementation sketch** -- enough detail to plan a slice, not enough
   to substitute for one. No actual code.
6. **Curator decision points** -- explicit asks where the recommendation
   defers to human judgment.
7. **Risks and mitigations** -- what could go wrong.

Reading order suggested:

- `notation_consistency_audit.md` first (smallest blast radius; highest
  user-facing improvement).
- `category_view_retirement_review.md` second (pattern-mirror of an
  already-shipped retirement).
- `dictionary_landing_page_plan.md` third (the big new surface).
- `observational_layer_discoverability.md` + `footbag_sets_architecture.md`
  fourth (both fold into the landing; read together).
- `family_and_neighborhood_governance.md` last (curator-paced; longest
  audit; most decision points).

---

## Open questions for curator review

These don't need answers before the supporting docs ship, but the
supporting docs will surface them again with more context.

- **Should the landing surface have a "What's new" or "Recently added"
  section?** Could fold ~ROBLA recent canonical promotions, recent
  observational tricks awaiting review. Risks ontology-status leak.
- **Should the topology view's user-facing label change from "Topology"
  to "Movement Neighborhoods"?** Friendly for newcomers; mild loss of
  precision for curator-side mental model.
- **Should `coreAtomLabel` continue to exist as a metadata field at all,
  or be deleted entirely?** Current curator-authored core-atom registry
  has utility for the structural-decomposition panel; deleting the
  rendering doesn't require deleting the metadata. Recommendation:
  preserve the metadata; remove the public rendering only.
- **Should the landing surface render a small "Glossary primer" callout
  for first-time visitors?** Could folded into ontology-framing paragraph
  or kept as its own card. Detail in landing-page-plan supporting doc.
- **Rev-up in whirl family: current state correct, or should rev-up move?**
  Audit will surface evidence; curator decides.

---

## Process note

This slice is a planning artifact, not an implementation slice. Approval
of any cross-cutting recommendation (CR-1 through CR-6) authorizes a
separate implementation slice. The implementation slices are sequenced in
the table above. Each will respect the same DO NOTs, the same
observational/canonical separation, the same restraint doctrine.

The dictionary subsystem reached its pre-Red stabilization checkpoint on
2026-05-17; that posture remains in effect. This slice's recommendations
are explicitly compatible with that checkpoint: every recommended change
is reversible TypeScript / template / content-module work, not schema
migration or canonical-ontology mutation.
