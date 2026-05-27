# Trick-Card Consistency Analysis

Coherence Cleanup Slice — Phase 1b (2026-05-17). Read-only audit; no code mutated.

## TL;DR

The dictionary trick-card primitive is **already mechanically uniform** across the six `/freestyle/tricks` browse views (ADD / family / movement-system / topology / component / category). One shared partial (`src/views/partials/dictionary-trick-card.hbs`) in registry density renders every card. Differences between views are **intentional grouping/heading variations**, not card-shape drift.

The single load-bearing divergence is **between dictionary cards and landing core-tricks-grid cards**, which use a different partial (`partials/core-tricks-grid.hbs`). That's a real cross-surface inconsistency.

## What's already uniform (mechanical)

The shared partial enforces canonical field order in BOTH density modes:

```
1. title  →  2. formula  →  3. ADD chip  →  4. media chip  →  5. status badge  →  6. placeholder note
```

Every browse view uses `{{> dictionary-trick-card density="registry"}}`. There's no possibility of card-shape drift between views — Handlebars renders the same template against the same view-model shape.

Per-card branches inside the partial:
- `tokenizedEquivalences.length` → render ≡ readings as role-classified op-tokens
- `else if operationalNotation` → render op-tokens (suppressed if a chain reading is present)
- `else` (browse density only) → render "Notation pending" placeholder
- `else` (registry density) → render no formula slot (cleaner blank)
- `pendingDecomposition` → render pending pill
- `hasReferenceMedia` → render media chip with coverage tier
- `statusBadge` / `placeholderNote` → external-only placeholder annotations

## What differs across views (intentional)

| View | Grouping headings | Definition text | Family-anchor underline | Cross-link / extra |
|---|---|---|---|---|
| ADD | h2 (addLabel) | none | inactive | (baseline) |
| Family | h2 (familyName + family link) | sharedStructure + crossLink | active per family | Slice-I family invariants |
| Movement-system | h2 (axisLabel) → h3 (modifierName) | observationalNote + bodyDefinition | active per modifier | two-level grouping; axis-jump nav |
| Topology | h2 (topologyName + topology link) | observationalNote + bodyDefinition | inactive | observational badge; symbolic-layer footer |
| Component | h2 (axisLabel) → h3 (componentName) | observationalNote + bodyDefinition | active per component | two-level grouping; axis-jump nav |
| Category | h2 (label + category link) | none | inactive | thinnest wrapper |

These differences reflect **grouping semantics**, not card drift:
- Family-view emphasizes structural family lineage (anchor underline + family invariants)
- Topology emphasizes observational layer (badge + disclaimer footer)
- Movement-system + component use two-level axis>group grouping (axes have intro text)
- ADD + Category are flat (heading + cards)

## Real cross-surface drift: landing/glossary §10 vs dictionary

The landing core-tricks grid and glossary §10 share a SEPARATE partial: `partials/core-tricks-grid.hbs`. It renders different markup:

| Shape | Dictionary card | Core-tricks grid |
|---|---|---|
| Wrapper | `article.dict-card` | `article.core-trick-object` |
| Title | `a.dict-card-title` linking to detail | `p.core-trick-slug` (#slug text, no link) |
| Formula | tokenized op-tokens (chain or op-notation) | plain text from `semanticEquivalences[]` + optional plain notation |
| ADD | `span.dict-card-add` | `p.core-trick-add` |
| Media chip | yes (4-tier coverage) | no |
| Status badge | yes (external-only) | no |
| Placeholder note | yes | no |
| Click-through | yes (to /freestyle/tricks/:slug) | no |
| Glossary anchor underlines | yes (via tokenizedEquivalences with isFamilyAnchor) | no |
| Role-classified token CSS | yes (`op-token--<role>`) | no (plain text) |

This is the genuine drift the audit needs to call out. The core-tricks-grid renders LESS RICHLY than the dictionary card it represents. A user clicking from landing to dictionary sees the same trick in a richer form, but the landing-card surface is supposed to be the "first-encounter" surface — exactly where richness matters most for foundational tricks.

## Why the divergence exists (history)

Per the partial header comments + memory `project_symbolic_ux_rollout`:
- Dictionary-trick-card was unified in SYMBOLIC-UX-1 Path C hybrid (2026-05-14)
- Core-tricks-grid was Phase 2/G of SURFACE-COMPRESSION-REALIGNMENT-1 (2026-05-14) — shipped on the same day but as a separate partial deliberately, to keep the foundational-atom surface "silent" relative to the dictionary
- CORE_TRICK_SPEC.equivalences[] arrays are intentionally empty per the file's own comment: "foundational atoms intentionally render as bare atom (#slug + ADD), matching the foundational atom feel the surface promises"

The two-surface separation was intentional design. The audit finds that the silence is now in tension with formula-accountability and contributes directly to the atom-vs-compound asymmetry catalogued in P1a.

## Recommendations (for Phase 2)

Three reconciliation paths surface here:

**A. Converge: replace core-tricks-grid with dictionary-trick-card in registry density.** Landing + glossary §10 would render the same card primitive as the dictionary. Cards would be clickable, role-classified, media-aware. Risk: changes the "silent foundational atom" pedagogical posture; needs maintainer sign-off.

**B. Diverge intentionally: keep core-tricks-grid but populate equivalences.** If foundational silence is intentional, populate `CORE_TRICK_SPEC.equivalences[]` with curator-authored 1-line readings so the cards stop being SPARSE while still rendering as a distinct surface (no media, no click-through, no role-classified tokens). This matches Approach D from P1a.

**C. Hybrid: keep the separate partial but add click-through and a notation slot.** Minimum changes: link the slug to `/freestyle/tricks/:slug` and render `symbolicNotation` when present. Already partially done for clipper.

The decision depends on whether the "silent foundational atom" design is still load-bearing. Phase 2 should test that with the maintainer.

## Companion deliverable

- `trickcard_consistency_matrix.csv` — per-view per-card-attribute breakdown

## Cross-references

- `CORE_FORMULA_VISIBILITY_AUDIT.md` — Phase 1a; the asymmetry the partial divergence enables
- `feedback_parser_editorial_separation` — sets the layer boundaries any card change must respect
- `project_symbolic_ux_rollout` — history of the SYMBOLIC-UX-1 + SURFACE-COMPRESSION-REALIGNMENT-1 cards
