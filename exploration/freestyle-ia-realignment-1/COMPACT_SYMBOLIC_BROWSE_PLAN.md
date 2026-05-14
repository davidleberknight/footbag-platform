# Compact Symbolic Browse — Plan

Generated 2026-05-14. Pre-implementation planning artifact; no code shipped from this slice. Per spec: "Do NOT implement immediately. Planning/mockup phase first."

## Status preamble — what's already shipped

This plan formalizes a model whose **infrastructure is largely already built** across two prior realignment efforts. Honest inventory:

| Required deliverable | Status | Where it lives |
|---|---|---|
| Compact-object rendering | **SHIPPED** | Batch 2 of `FREESTYLE_IA_REALIGNMENT_PLAN.md` (landing Core Tricks `.core-trick-object`); Batch 4 unified treatment across landing + glossary + dictionary; CSS at `src/public/css/style.css:5253–5316` |
| Browse-card prose reduction | **SHIPPED** | Batch 2 retired `description` field on dict-cards; CSR S1+S3 retired the legacy `aliases:` text row |
| Equivalence rendering | **SHIPPED** | CSR S1+S2+S3 — `freestyleSymbolicEquivalences.ts` (14 compounds after S2) + `freestyleAliasGovernance.ts` allow-list now feed dict-card `≡` lines |
| Symbolic-notation rendering policy | **PARTIAL** | Operational-notation surface ships on dict-cards (Batch 2) but only 16/160 rows populated; reconciliation deferred to S5 (curator SQL migration) |
| Stopping-depth philosophy | **CODIFIED** | `freestyleSymbolicEquivalences.ts:21–25` file-header rules; PART H-pre of `FREESTYLE_IA_REALIGNMENT_PLAN.md`; max-3-readings rule |
| Torque/mobius teaching flow | **SHIPPED** | Batch 3 C-3-D in `glossary.hbs §3 symbolic-compression-flow` |
| Typography hierarchy | **SHIPPED** | Batch 4 — `#slug` 1.20rem mono, `≡` 0.96rem Georgia italic, notation 0.82rem `--text-subtle`, ADD 0.78rem chip |
| ATW + orbit alias visibility | **SHIPPED** | Batch 2 landing CoreTricks + CSR S3 allow-list (`displayAs: 'ATW'`); orbit DB row deferred to S4 (curator migration) |
| Canonical surface (compact) | **SHIPPED** | as documented above |
| **Expanded surface (formal contract)** | **GAP** | per-trick pages exist at `/freestyle/tricks/:slug` but the two-surface contract isn't formally documented in `VIEW_CATALOG.md`; no `#torque-expanded` URL convention; trick-detail page mixes browse-card and narrative content without an explicit boundary |

The genuinely-new contribution of this plan is **PART 2** (formal canonical-vs-expanded contract) and the gap-identification at the end. PARTS 1, 3-9 are largely consolidation/formalization of the shipped model.

---

## PART 1 — Compact-object rendering proposal

The compact canonical object is the **universal browse primitive** across the freestyle surfaces. Its rendering is already shipped; this section codifies the contract for future contributors.

### 1A — The four-layer structure

```
#slug                       ← PRIMARY: canonical identity
≡ semantic reading(s)       ← SECONDARY: compositional decomposition
operational notation        ← TERTIARY: execution mechanics
[ADD chip]                  ← QUATERNARY: numeric difficulty
```

**Atoms** collapse to: `#slug` + ADD chip. No `≡` line (the slug IS the irreducible token); no operational notation when not authored.

**Compounds** with one canonical equivalence: 3-layer (slug + ≡ + ADD).

**Compounds with operational detail**: full 4-layer.

**Compounds with stopping-depth options** (mobius being the flagship): multiple `≡` lines, layered tightly via the adjacent-sibling `margin-top: -2px` rule.

### 1B — Where it renders

| Surface | CSS root | Source for `≡` readings |
|---|---|---|
| Landing Core Tricks grid | `.core-trick-object` | Static `CORE_TRICK_SPEC` in `freestyleLandingContent.ts` (atoms only) |
| Glossary §3 compression-flow | `.core-trick-object.glossary-compression-card` | Hardcoded osis/torque/mobius in `glossary.hbs` |
| Dictionary browse cards | `.dict-card` | Merge of `freestyleSymbolicEquivalences.ts` (compound chains) + `freestyleAliasGovernance.ts` (allow-listed atom aliases) |

The visual rendering is identical across surfaces (Batch 4 typography unification); the data-source paths differ because each surface has different content needs (landing curates 11 atoms; glossary curates 3 worked examples; dictionary surfaces all 160 active tricks).

### 1C — Forever-rules for any future surface

A future browse surface adopting the compact-object primitive must:

1. Use the shared `.core-trick-object` (or surface-specific modifier like `--landing`, `--flow`, `--dict`) — never re-roll typography.
2. Source `≡` readings from `freestyleSymbolicEquivalences.ts` (compounds) and/or `freestyleAliasGovernance.ts` (atom aliases), never from raw `freestyle_trick_aliases` rows.
3. Honor stopping-depth: max-3 readings per card; readings stop at intermediate operators (atomic/blurry/whirling/etc.) per the registry's documented rules.
4. Render no prose, no descriptions, no execution walkthroughs, no historical notes. Those belong on the expanded surface (PART 2B).

---

## PART 2 — Canonical vs expanded surface rules (the formal contract)

This is the genuinely-new contribution of this plan. The two-surface model has been operating informally; this section formalizes it.

### 2A — Canonical surface (compact)

**Renders on**: dictionary browse (`/freestyle/tricks` and faceted views), landing Core Tricks grid, glossary compression-flow, future browse facets (topology, component, family, ADD views), search results, connective panels.

**Content contract (ALLOWED)**:
- Canonical name + slug-form identity (`#torque`)
- Aliases / equivalences (`≡ miraging osis`)
- Semantic notation (`miraging osis` rendered as Jobs-notation tokens with role-aware classes)
- Symbolic / operational notation (`[osis] > same out dex > [osis]`)
- ADD value (`[4]` chip)
- Family / base lineage hook (`base_trick` chip; small, optional)
- Media-coverage chip (`Tutorial available` / `Demo only`) — optional, restrained
- Status badges for external placeholders (`External source — not yet adjudicated`)

**Content contract (FORBIDDEN)**:
- Prose descriptions
- Learning notes
- Execution walkthroughs
- Historical context
- Tutorial summaries
- Topology discussion
- Decomposition essays
- Operator explanations
- Anything that would require more than 4 short rendered lines per card

**Visual contract**: per Batch 4 typography hierarchy. Typography + grid gap carry object identity; no card containment (no left borders, no min-height, no fills, no shadows, no rounded corners, no animation).

**Maintenance contract**: a curator-authored content module (`freestyleSymbolicEquivalences.ts`, `freestyleAliasGovernance.ts`) governs what `≡` readings surface. Aliases not in the allow-list do not surface. The DB `freestyle_trick_aliases` table holds every folk-name/equivalence relationship; only curator-approved subsets render on browse.

### 2B — Expanded surface (narrative)

**Renders on**: `/freestyle/tricks/:slug` (the per-trick detail page) — today. **Formalization opportunity**: codify this URL as the canonical expanded surface. A `#torque-expanded` URL convention is not necessary if `/freestyle/tricks/torque` IS the expanded surface — but the contract should be documented.

**Content contract (ALLOWED)**:
- Prose description (canonical + curator-authored)
- Videos (tutorials, demos, records footage)
- Execution walkthroughs
- Notation explanation (per-trick token roles, structural reading)
- Family relationships (cross-link to family pages)
- Historical context (creator credits, evolution notes)
- Topology discussion (compositional placement)
- Decomposition walkthroughs (chain readings expanded with prose)
- Reference media (per-trick gallery)
- Records list (current + superseded)
- Pathway cross-links (learn / watch / family)

**Content contract (FORBIDDEN)**:
- Re-rendering the compact-object card as the page's primary identity (the expanded surface has its own page treatment; it should NOT lead with a `.dict-card` element)
- Treating the page as a glossary entry (terminology lives in glossary; per-trick prose is trick-specific narrative)

**Visual contract**: rich, content-card / article-style typography. Not symbolic-monospace. Per `src/views/freestyle/trick.hbs` + `src/views/freestyle/trick-ux2.hbs` (the pilot layout).

**Boundary rule**: any browse card that links to a per-trick page is linking from compact → expanded. The inverse is also true: an expanded page may include a compact "back to dictionary" link to its compact representation but should NOT re-render the compact card as its identity layer.

### 2C — Boundary tests (negative)

If a contributor proposes adding any of the following to a compact surface, the change violates the boundary:

| Proposal | Violation |
|---|---|
| Add `description` field to `DictionaryTrickCard` view-model and render under notation | Browse cards stay symbolic; prose lives on expanded surface |
| Add `tutorialNotes` or `executionHint` to landing Core Tricks | Same; pedagogy belongs on `/freestyle/learn` or expanded surface |
| Show a thumbnail video on each dict-card | Media chips signal availability; full videos render on expanded surface |
| Insert a 2-sentence "how to execute" paragraph below the notation row on dict-cards | Forbidden; prose-creep |
| Render historical-context note ("invented by Yamamoto, 1996") on landing cards | Historical context is narrative; lives on expanded surface |

If a contributor proposes adding any of the following to an expanded surface, the change is FINE:

| Proposal | Status |
|---|---|
| Re-render the compact symbolic object as a hero at the top of the page | Allowed if it's clearly the page's symbolic identity (e.g., a `.core-trick-object` at the top, followed by expanded narrative) — but the page's BODY is narrative, not a re-rendered card |
| Multi-paragraph prose explanation of the trick | Allowed |
| Embedded videos with curator captions | Allowed |
| Cross-links to related tricks via family chips | Allowed |
| Records progression table | Allowed (already shipped per VIEW_CATALOG.md:406) |

---

## PART 3 — Typography hierarchy

Already shipped (Batch 4). Codifying for reference:

| Layer | Class | Size | Family | Weight | Color |
|---|---|---:|---|---:|---|
| PRIMARY — `#slug` | `.core-trick-slug` (incl. `.dict-card-title` via Batch 4 alignment) | 1.20rem | ui-monospace stack | 700 | `--secondary` (teal) |
| SECONDARY — `≡ reading` | `.core-trick-equivalence` (+ `.dict-card-equivalence` surface modifier) | 0.96rem | Georgia serif italic | 400 | `--text` |
| TERTIARY — notation | `.core-trick-notation`, `.dict-card-notation` | 0.82rem | ui-monospace stack | 400 | `--text-subtle` (#8a8a8a) |
| QUATERNARY — ADD chip | `.core-trick-add-value`, `.dict-card-add` | 0.78rem | ui-monospace stack | 600 | `--primary` (chip outline) |

**Family cap**: 2 type families per compact object (ui-monospace stack + serif italic). No third family.

**Mobile (≤480px)**: slug → 1.10rem; notation gets hanging indent + `overflow-wrap: anywhere`; ADD chip → 0.74rem.

**Equivalence > notation invariant**: 17% size differential + distinctly dimmer color + different type family. Equivalence is semantic identity; notation is implementation detail.

**Adjacent-sibling tight stack**: `.core-trick-equivalence + .core-trick-equivalence { margin-top: -2px; }` so consecutive `≡` readings hug each other (mobius's two readings layer rather than bullet-list).

---

## PART 4 — Equivalence rendering policy

Already shipped (CSR S1+S2+S3). Codifying for reference:

### 4A — Source ordering

For a given trick's compact card, `≡` readings come from:

1. **`freestyleSymbolicEquivalences.ts`** — curator-authored multi-reading chains for compounds. 19 entries after S2. Each entry: slug + readings[] + curatorConfirmPending. Stopping-depth-aware.
2. **`freestyleAliasGovernance.ts`** — restraint-first allow-list for atom-level canonical aliases drawn from `freestyle_trick_aliases`. 5 entries today (2 surface, 3 hidden). `displayAs` override supports ATW uppercase convention.

Sources are MERGED in `shapeDictionaryTrickCard` (`freestyleService.ts:1885–1890`). Atoms typically have zero chain entries and one allow-listed alias (e.g., around-the-world); compounds typically have one or more chain readings and zero allow-listed aliases.

### 4B — What never appears

Aliases NOT in the allow-list are filtered out. Specifically (audit per CSR PART 2B):

- `osis ≡ frigidosis` (Wave-2 pending; project_red_consultation_state)
- `legover ≡ leg-over` (orthographic only; user spec PART 3A forbids)
- `swirl ≡ reverse swirl` (not an equivalence — different trick)
- Any future seeded alias not explicitly approved by curator

This is the **restraint-first default**: the browse surface surfaces meaningful semantic compression, never every textual relationship.

### 4C — Stopping-depth rules (codified)

From `freestyleSymbolicEquivalences.ts:21–25` file header (applies to all `≡` readings):

- Stop at any token in `CORE_TRICKS` (the 13 atoms).
- Stop at any intermediate operator: atomic, blurry, quantum, nuclear, barraging, furious, double, whirling, high.
- Deeper depth only when curator-authored.
- Max 3 readings per chain (beyond is glossary worked-example territory).

**Forbidden**: recursive auto-expansion. The parser never generates `≡` readings. Curator authors them; render-time is read-only.

---

## PART 5 — Symbolic-notation rendering policy

Already shipped at the rendering layer; **data layer is the gap**.

### 5A — Operational-notation rendering

Per `dictionary-trick-card.hbs:28–32`:

```hbs
{{#if operationalNotation}}
  <code class="dict-card-notation" aria-label="Operational notation">
    {{#each operationalNotation.tokens}}
      <span class="op-token op-token--{{cssRole}}" data-role="{{role}}" title="{{label}}">{{text}}</span>
    {{/each}}
  </code>
{{else}}
  <p class="dict-card-notation dict-card-notation--pending">
    <em>Notation pending</em>
  </p>
{{/if}}
```

Honest pending-state. Renders the operational form when authored; renders an italic "Notation pending" placeholder otherwise.

### 5B — The 144-row gap

Per CSR audit PART 1: only 16 of 160 active tricks have `operational_notation` set. The remaining 144 render "Notation pending" today. This is the **largest single canonical-surface gap** and is a curator/curatorial-pipeline question, not a code-shipping question.

S5 of CSR (curator-authored migration; deferred) addresses this in two paths:
- Backfill `operational_notation` for canon-locked compounds (e.g., torque should have an operational form derived from `miraging osis`).
- Or: extend the rendering policy so that, when `operational_notation` is null but a chain reading is present, the chain reading's first reading serves as the notation slot.

The second path is faster but blurs the layer boundary (semantic readings render in the operational slot). **Recommend the first path** when the curator has bandwidth.

### 5C — Recursion forbidden

The compact-surface notation rendering MUST NOT auto-expand operators recursively. Today the rendering uses pre-shaped tokens from the curator-authored `operational_notation` string. Future contributors must not add a "smart expansion" step that walks operator references and produces deeper notation strings at render time.

---

## PART 6 — Stopping-depth examples

Three flagship cases the rendering must handle correctly:

### 6A — Atom (clipper)

```
#clipper
[1]
```

Two lines. No `≡` (clipper IS the canonical token). No operational-notation slot (atoms render no decomposition).

### 6B — Compound, one stopping depth (torque)

```
#torque
≡ miraging osis
[4]
```

Three lines. `≡ miraging osis` (pt11) is the canonical compressed reading. Operational-notation slot is empty in DB today; would render "Notation pending" placeholder. Post-S5 backfill, the operational form (e.g., `[osis] > same out dex > [osis]`) renders below the `≡` line.

### 6C — Compound, multi-depth (mobius)

```
#mobius
≡ gyro torque
≡ spinning ss torque
≡ spinning ss miraging op osis
[5]
```

Five lines. Three chain readings render in their tight-stacked layered form (adjacent-sibling `-2px` rule). The reader can choose any of the three stopping depths. No reading is called "the right one".

### 6D — Compound NOT in registry (paradox-whirl)

```
#paradox-whirl
[notation if authored, or "Notation pending"]
[4]
```

No `≡` line. Paradox-whirl is a compound but not in `freestyleSymbolicEquivalences.ts`. The compact card renders honestly — slug + (notation OR pending) + ADD. Future curator addition to the registry would surface `≡ paradox whirl` (the slug already conveys this; redundant) or stop at a different stopping depth (`≡ paradox + whirl` is the trivial unfolding; not pedagogically useful).

The honest answer: not every compound needs a `≡` chain. Paradox-whirl's compositional structure IS visible in its name (paradox + whirl); a `≡` line would just restate the name. The chain registry is for compounds where shorthand compression has happened (mobius hides spinning+ss+torque; ripwalk hides stepping+butterfly).

---

## PART 7 — Torque / mobius teaching-flow mockup

Already shipped (Batch 3 C-3-D) at `glossary.hbs §3 symbolic-compression-flow`. Documented in `GLOSSARY_PEDAGOGY_REALIGNMENT_PLAN.md` PART 2.

The flow renders three cards in vertical sequence:

```
        #osis
        [3]

           ↓                      ← muted typographic arrow

        #torque
        ≡ miraging osis
        [4]

           ↓

        #mobius
        ≡ spinning ss torque
        ≡ spinning ss miraging osis
        [5]
```

Below the cards, ≤50 words of prose name the principle. The visual progression carries the lesson; the prose is minimal.

After CSR S1+S2 shipped, the **same three cards** would also render their `≡` readings on the dictionary browse — completing the cross-surface continuity. `#torque` on the glossary flow looks identical to `#torque` on `/freestyle/tricks`; the symbolic object IS the same everywhere.

---

## PART 8 — Browse-card before/after examples

### 8.1 — Atom card (around-the-world)

**Before all batches**:
```
┌── 3px bronze left border ──┐
│ around the world      2-ADD │
│                              │
│ aliases: atw                 │
│ family: around-the-world     │
│ Description: A trick where  │
│   the leg circles entirely  │
│   around the bag in the air.│
└─────────────────────────────┘
```

**After Batch 1 + Batch 4 + CSR**:
```
   #around-the-world                  ← 1.20rem mono bold teal
   ≡ ATW                              ← 0.96rem Georgia italic, primary green ≡ sigil
   [2]                                ← 0.78rem primary-outline chip
```

Stripped of prose, container heaviness, redundant family-chip noise. Pure symbolic object.

### 8.2 — Compound card with chain (mobius)

**Before**:
```
┌── 3px bronze left border ──┐
│ mobius                5-ADD │
│ MOBIUS                       │
│ aliases: gyro torque        │
│ family: torque              │
│ Description: A trick that   │
│   combines spinning and     │
│   torque.                   │
└─────────────────────────────┘
```

**After**:
```
   #mobius
   ≡ gyro torque
   ≡ spinning ss torque
   ≡ spinning ss miraging op osis
   [5]
```

Three stopping depths visible. No prose. Compositional structure scannable at a glance.

### 8.3 — Compound with operational notation (matador)

**Before** (Batch 2 partial state):
```
matador                5-ADD
CLIP > SAME OUT [DEX] [PDX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]
aliases: (none)
family: butterfly
```

**After** (full canonical surface):
```
   #matador
   ≡ nuclear butterfly
   ≡ paradox atomic butterfly
   CLIP > SAME OUT [DEX] [PDX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]
   [5]
```

Two `≡` stopping depths (per chain registry) + operational mechanics + ADD chip. Fully populated symbolic object.

---

## PART 9 — Risks of over-minimalism

Documented in `COMPACT_SYMBOLIC_OBJECT_VISUAL_REFINEMENT_PLAN.md` PART 9. Codifying for reference:

| Risk | Manifestation | Mitigation |
|---|---|---|
| Cards bleed into each other | Without left-border accent, the eye loses object identity | Generous grid gap (20–22px wider than card padding 12–14px); typographic hierarchy (slug 1.20rem distinct from notation 0.82rem) creates implicit edges |
| Hierarchy collapse | All four layers read at similar weight | Two-family cap + 17% size differential + distinct color tier per layer |
| Object identity loss | Compact cards feel like generic content blocks | Stable `#slug` lead + airy spacing; if scanning rhythm degrades post-deploy, **add more spacing, not borders** (maintainer guidance 2026-05-14) |
| Mobile rhythm degrades | Long notation strings overflow narrow cards | Hanging-indent wrap (`text-indent: -1em; padding-inline-start: 1em; overflow-wrap: anywhere`) shipped in Batch 4 |
| Over-design creep | New type families, animations, shadows | Forbidden vocabulary list in Batch 4 PART 3; no `transition`, no `box-shadow`, no rounded corners on `.core-trick-object` |

---

## PART 10 — Unresolved ontology still blocked by Red

Per `project_red_consultation_state` Wave 1 packet (sent / pending reply), the following are explicitly NOT surfaced in any compact-object card:

| Topic | Status | Affected surface impact |
|---|---|---|
| Rotational-bonus generalization (blurry/barraging/furious +1 vs +2) | Wave 1 Q1 pending | `blurry-whirl`, `blurry-torque`, `barraging-osis`, `food-processor` render without `≡` readings until ruled |
| Q4 FM-vocab batch (14 modifiers) | Wave 1 Q2 pending | Fairy / gyro / barraging-FM / surging / etc. stay out of `≡` readings on compact surfaces |
| Far / reverse positional weights | Wave 1 Q3 pending | Direction terms render as factual (e.g., `reverse around-the-world`); no ADD claim made |
| Atomic-set polysemy | Wave 1 Q4 pending | Atomic-led readings stop at conservative depth |
| Furious non-rotational | Wave 1 Q1c pending | Fury intentionally absent from chain registry; would render slug + ADD only |
| Witchdoctor / Frigidosis / Scrambled Eggbeater | Wave 2 Theme 2 | Stay out of compact surfaces; the legacy `osis ≡ frigidosis` DB alias is explicitly hidden by allow-list |
| Down-family canonicalization | Wave 2 Theme 6 | Affected `down-*` rows render at current state |
| Frantic / Leaning / Hyper / Sailing / Bling Blang | Wave 2 Theme 8 | FM-vocab equivalence-chain promotion deferred |

After Wave 1 reply lands, the chain registry can incorporate the newly-resolved readings. The pipeline:

1. Re-run `legacy_data/tools/build_add_conflict_audit.py` per [[project_red_consultation_state]] post-reply protocol.
2. Update `RED_RESOLVED_CANON.md` with new rulings.
3. Append new chain entries to `freestyleSymbolicEquivalences.ts` with `curatorConfirmPending: false`.
4. Allow-list any newly-canonical aliases in `freestyleAliasGovernance.ts`.
5. Compact cards surface the new readings on the next deploy.

No code change required for steps 3-5; curator content edits only.

---

## PART 11 — Remaining gaps (proposed next slices)

After all the IA-REALIGNMENT-1 batches + CSR S1+S2+S3, the canonical surface is **largely complete**. Remaining gaps:

### EXP-1 — Formal expanded-surface contract in VIEW_CATALOG.md

Document the `/freestyle/tricks/:slug` page as the canonical expanded surface. Currently the catalog row (line 406) describes the page's content but doesn't frame it as the formal "expanded surface" counterpart to the compact browse cards.

Proposed addition to the page-matrix section-conventions:

> **Two-surface freestyle model.** The compact symbolic-object primitive (PART [N] of this catalog) is the canonical browse layer. Per-trick narrative content lives on the expanded surface at `/freestyle/tricks/:slug`. Browse cards link compact → expanded; expanded pages may render the compact card as a hero element but must not duplicate the browse view.

Minimal change. CSS-free. Documents what's already true.

### EXP-2 — Browse-card hero on expanded pages

Today `/freestyle/tricks/:slug` renders the trick name as a `<h1>`. Surfacing the compact symbolic object at the top of the expanded page would:
- Visually anchor "this is the same object you saw on the browse"
- Provide the `≡` readings (curator-authoritative) before any prose
- Cross-link to glossary / family for compositional context

Implementation: add an early `.core-trick-object` render to the trick template, sourcing from the same view-model the dict-card uses. Small template + view-model addition. Tests assert hero presence.

**Risk**: cluttering the expanded surface with the same content twice (hero + page body). Mitigation: render the hero IN the page's hero section, separated by section heading from the body narrative. The hero IS the symbolic identity; the body IS the narrative.

### Deferred curator work (already enumerated)

| Slice | Scope |
|---|---|
| CSR S4 | Insert `orbit` row + alias migration (DB) |
| CSR S5 | Reconcile `freestyle_tricks.notation` with `RED_RESOLVED_CANON.md` for ~20–30 drifted compounds (DB) |
| CSR S6 | Fix `is_core` drift: pixie/fairy → 0, guay → review/pending per maintainer 2026-05-14 (DB) |

All three are curator-authored SQL migrations, deferred per the maintainer-approved restraint posture.

---

## Cross-references

- `FREESTYLE_IA_REALIGNMENT_PLAN.md` PART H-pre — compact symbolic-object rendering rule
- `GLOSSARY_PEDAGOGY_REALIGNMENT_PLAN.md` PART 2 — torque/mobius teaching flow
- `COMPACT_SYMBOLIC_OBJECT_VISUAL_REFINEMENT_PLAN.md` — typography hierarchy + risks of over-minimalism
- `CANONICAL_SURFACE_REALIGNMENT_PLAN.md` — audit + S1-S7 slice sequence (S1+S2+S3 shipped, S4-S6 deferred)
- `src/content/freestyleSymbolicEquivalences.ts` — 19 chain entries after S2
- `src/content/freestyleAliasGovernance.ts` — alias allow-list module
- `src/views/partials/dictionary-trick-card.hbs` — compact-object rendering on dictionary
- `src/views/freestyle/glossary.hbs §3` — compression-flow teaching example
- `src/views/freestyle/landing.hbs` — Core Tricks grid
- `RED_RESOLVED_CANON.md` C.1 — equivalence-chain canon source
- `RED_OPEN_QUESTIONS_REFORMULATED.md` — Wave 1 + Wave 2 pending
- [[project_red_consultation_state]] — current Red consultation surface

---

## What needs maintainer decision before further implementation

Two open questions:

1. **EXP-1 priority.** Should the formal two-surface contract documentation ship as the next slice, or is it a "we know what this is; document it later" item? My default: ship soon (EXP-1 is a 1-edit doc-sync change with zero code impact).

2. **EXP-2 priority.** Hero render of the compact symbolic object on expanded trick pages — is this a wanted enhancement, or are expanded pages already serving their purpose without it? My default: nice-to-have, low priority; the compact ↔ expanded boundary already works without it. Defer until specifically requested.

---

## Summary

The compact symbolic browse layer is **architecturally shipped**. The four IA-realignment batches + CSR S1+S2+S3 delivered the model: canonical symbolic-object primitive, cross-surface visual consistency, curator-governed equivalence rendering, restraint-first alias surfacing, typography hierarchy, stopping-depth philosophy, torque/mobius teaching flow.

This plan codifies the contract for future contributors and identifies the small remaining gaps (formal documentation of the two-surface model in VIEW_CATALOG; optional hero render on expanded pages; deferred curator SQL migrations for orbit / notation reconciliation / `is_core` cleanup).

No new shipping work is proposed in this slice. Plan staged but not committed; awaiting maintainer direction on whether EXP-1 ships next or whether the next priority is elsewhere.
