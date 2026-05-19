---
name: freestyle-topology-governance
description: Use when adding, modifying, reviewing, or proposing topology / family / category / movement-neighborhood / cross-axis-relationship work on the freestyle dictionary. Enforces observational-vs-canonical separation, prevents premature taxonomy hardening, and codifies multi-axis movement-relationship governance.
---

# Freestyle Topology Governance Skill

Use this skill when a task touches:

- topology groupings (`?view=topology`, connective panels, movement archetypes)
- family taxonomy (`trick_family`, family-view rendering, multi-family memberships)
- category taxonomy (`?view=category`, dexterity / body / set / compound buckets)
- surface / catch classifications (clipper-as-surface vs clipper-as-family)
- modifier-vs-set-vs-archetype distinctions
- descriptive movement-language relationships (movement neighborhoods)
- proposals to canonicalize observational groupings

This skill is the conceptual guardrail. Implementation patterns live in `footbag-freestyle-dictionary` (sections 1–6). Read this skill first when a task is taxonomy-shaped; read the implementation skill second when ready to edit data.

---

## Core invariant

**Observational ≠ canonical.**

Some classifications are CANONICAL: community-sanctioned, single-valued, durable, encoded in primary columns (`freestyle_tricks.canonical_name`, `freestyle_tricks.trick_family`, `freestyle_tricks.category`).

Other classifications are OBSERVATIONAL: curator-authored groupings that surface patterns across the dictionary without claiming community authority (`connectivePanels`, topology groups, movement-archetype groupings, multi-axis cohort tagging).

Both are useful. They must stay distinct. An observational grouping that gets promoted to canonical without curator sign-off causes downstream taxonomic claims the project cannot defend.

Markers of canonical content:
- single-valued column on a primary table
- referenced by name in tutorials, competition records, or Red rulings
- treated as authoritative by external sources (footbag.org, PassBack, TT lessons)

Markers of observational content:
- multi-axis / multi-membership capable
- carries explicit "observational" or "supplementary" labels in the rendered UI
- derived from curator interpretation, not external authority
- can be refined or retired without breaking external references

When in doubt: assume observational. Promotion to canonical requires curator decision.

---

## Family semantics warnings

`trick_family` is a single-value column with severe over-loading. Treat it carefully:

1. **`family` is structural-anchor scope only.** A family slug names the structural anchor (whirl, butterfly, mirage, osis, torque, legover, illusion, drifter, pickup, swirl). It does NOT name a surface, a modifier, an archetype, or a topology axis.

2. **`family` is NOT topology.** Topology groups (midtime body modifiers, hippy-vs-leggy, X-dex compounds, ducking/diving family) are observational lenses on the dictionary, NOT family memberships. They may overlap with families (whirl-family compounds often participate in spinning topology) but they answer different questions.

3. **`family` is NOT catch surface.** Many tricks land on clipper without belonging to a "clipper family." The clipper surface is a facet that crosses family boundaries; family is about structural anchor, not landing point.

4. **`family` is NOT modifier.** Paradox is a modifier with family-like character (paradox compounds hang together), but treating it as a family slug forces a single membership on tricks that legitimately belong to multiple modifier cohorts. Use topology / component grouping instead.

5. **Single-value family is a known limitation.** Tricks like `double-leg-over` (legover-based AND mirage-related via `miraging legover` reading) and `torque` (its own family AND osis-derived via `miraging osis` reading) belong to multiple structural cohorts. The current schema cannot express this. Slice D may introduce multi-family memberships via reversible TypeScript content modules; do NOT introduce a multi-family schema until Wave-2 Red answers + curator triage stabilize the ontology.

6. **Singleton families are ambiguous.** A `trick_family` slug with only 1 active member (dada-curve, atw, several others) is currently suppressed by the `length > 1` family-view heuristic. Singleton-family policy is unresolved: do not invent rules without curator input.

---

## Topology categories

Topology groupings are observational lenses. Each surfaces a movement-mechanic pattern that crosses family boundaries.

Established topology axes (curator-authored, observational):

- **Rotational vs non-rotational**: does the body rotate during the dex moment?
- **Paradox vs non-paradox**: does the body switch sides between dex events?
- **Symposium vs grounded**: does the support leg leave the ground during the dex?
- **Ducking / diving / weaving / zulu**: four-way head-path family
- **Midtime body modifiers**: modifiers that act on the body around the trick's apex
- **Pixie / fairy / atomic neighborhoods**: set-primitive cohorts
- **Hippy vs leggy**: dex motion source (hip vs knee)
- **Butterfly progression chains**: walking-family-style modifier ladders on a single base
- **Torque / osis structural cohort**: compounds built from miraging-osis or its derivatives

When proposing a new topology axis, evaluate:

- Does it cross at least 2 canonical families? (If not, it might be a family-internal pattern.)
- Is it curator-confirmable from existing references? (Tutorials, PassBack, Red rulings.)
- Does it answer a movement question the existing axes don't?
- Can it be authored as a reversible content module? (If it needs schema change, defer.)

When considering retirement of a weak topology group:

- Does it have ≥3 active trick members?
- Does it appear in any educational pathway / glossary cross-link?
- Would retirement orphan any rendered UI affordance?
- Is the retirement reversible (delete the content-module entry vs schema migration)?

---

## Movement-neighborhood philosophy

The dictionary surfaces increasingly hint at "movement neighborhoods": tricks that feel structurally adjacent even when their canonical decompositions differ. This is an EMERGING concept, not a hardened ontology.

Movement neighborhoods may eventually crystallize as:

- a multi-axis tagging system (each trick carries multiple axis memberships)
- a similarity / distance metric (which tricks feel close to this one)
- a curator-authored topology overlay (movement-archetype cards)
- a pedagogical progression layer (which trick teaches which)

Until curator and Red guidance stabilize, do NOT:

- introduce a "movement similarity" schema column
- auto-derive neighborhood relationships from notation
- canonicalize informal proximity language ("kind of like a ripwalk") into structural claims
- build interactive movement-map visualizations on public surfaces

When working in this area, prefer the existing observational connective-panel mechanism over inventing a new structural layer.

---

## Multi-axis relationship concept

A single trick can participate in multiple relationship axes simultaneously:

- Structural-anchor (family): which base trick it descends from
- Modifier lineage: which modifier(s) characterize it
- Dex archetype: which dex pattern it uses (in-dex, out-dex, x-dex, paradox-dex, etc.)
- Catch surface: which surface the trick lands on
- Body topology: which midtime body action defines it
- Embodied feel: how the trick reads in the body (pedagogical layer)
- Pedagogical progression: where in a learning ladder it sits

A single-value column on `freestyle_tricks` expresses ONE axis only (the primary structural anchor, `trick_family`). The other six axes are either implicit in other tables (`freestyle_trick_modifier_links` carries modifier lineage) or unmodeled (catch surface, dex archetype, embodied feel, progression position).

**Do NOT pretend any single column expresses all axes.** When a slice proposal needs multi-axis expression, it must propose a curator-authored multi-axis content module (reversible TypeScript), NOT a schema migration.

---

## Red-wave governance caution

The Red Husted consultation is still in flight. As of 2026-05-15:

- Wave 1 effectively answered by ruling batch (blurry / barraging / atomic / far/reverse / fairy / blistering / mobius rulings landed)
- Wave 2 packet SENT 2026-05-15 with six grammar-level questions

Areas where Wave-2 answers are gating canonical claims:

- Blurry transitivity (`blurry whirl` vs `stepping paradox whirl`)
- Barraging operator class (set primitive vs body modifier vs structural)
- Atomic family scope (X-dex-from-toe character, hidden paradox)
- Operator-vs-trick boundary (Fairy weight, surging structure, blazing)
- Compression intent (when a long structural reading "is" the trick)
- Hidden-vs-flat preservation (when to expand vs when to compress)

Until Wave-2 answers integrate:

- Do NOT freeze decompositions in any of these areas as canonical
- Do NOT add SQL constraints that would lock the affected rows
- Do NOT promote pending readings to default rendering on public surfaces
- DO mark uncertain readings with `curatorConfirmPending: true` in chain registries
- DO preserve alternate readings in commented form where Wave-2 may overrule

See [[project_red_consultation_state]] for the live consultation state and [[project_semantic_compression_doctrine]] for the alpha doctrine that Wave-2 will sharpen.

---

## Reversible governance doctrine

Cross-references [[feedback_reversible_content_governance]]. The summary form:

- **TypeScript content modules over SQL** while ontology is in flight. Allow-lists, chain registries, kind overrides, family memberships, category taxonomies, glossary anchor allow-lists: all curator-authored, all reversible by editing one file.
- **No schema migrations** for taxonomy data until ontology stabilizes (post-Wave-2 + curator triage at minimum).
- **No auto-derivation** of curator-authoritative classification from notation, formulas, or alias tables. Curator data is curator data; parser data is parser data. (Cross-references [[feedback_parser_editorial_separation]].)
- **Restraint over feature throughput.** A wrong taxonomy commitment is worse than a missing one. When a slice is uncertain, surface the question to the curator; do not invent a default.

When a proposal violates reversibility (schema migration, SQL CHECK constraint, NOT NULL on a taxonomy column), STOP and surface to the curator. The default is "defer to next slice"; the override path is explicit curator sign-off.

---

## When this skill applies

Trigger conditions:

- A task description mentions topology / family / category / movement-neighborhood / archetype / multi-axis
- A schema proposal adds a column or table that classifies tricks structurally
- A content-module proposal introduces a new classification dimension
- A view or template change reshapes how tricks group on a browse surface
- A glossary proposal canonicalizes a movement-relationship concept
- An audit pass evaluates the dictionary's structural coverage

When triggered, read THIS skill before `footbag-freestyle-dictionary` for the conceptual frame. Then read the implementation skill for the data-layer rules.

---

## When this skill does NOT apply

- Pure rendering work that doesn't touch classification (CSS, layout, density modes)
- Token-level navigation (glossary anchor links, token underlining)
- Trick-content edits that don't reshape grouping (description prose, alias additions, ADD value corrections)
- Pipeline / loader / import work below the public surface

In these cases the implementation skill (`footbag-freestyle-dictionary`) is sufficient.

---

## Strategic frame

The freestyle dictionary is no longer primarily "a list of tricks." It is a **navigable educational movement-language system** with multiple interlocking ontology layers (canonical names / symbolic decomposition / glossary pedagogy / embodied movement analogy). Topology governance is the connective tissue that keeps the system navigable without collapsing those layers into one.

The biggest risk now is not missing content: it is over-hardening the ontology before it has stabilized. This skill exists to slow down classification work, surface uncertainty to the curator, and prevent future Claude sessions from inventing structure the curator did not author.
