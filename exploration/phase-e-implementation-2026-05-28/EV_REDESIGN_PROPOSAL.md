# P6 — Emerging Vocabulary redesign (PROPOSAL, doc only)

**Status:** design proposal. No live route/service/template code in this slice
(confirmed scope 2026-05-28). Building it later is a public-route change →
`extend-service-contract` + `add-public-page` + tests + mobile review.

## 1. The problem with the current surface

`/freestyle/observational` today is a **hand-maintained parallel system**:

- `src/content/freestyleObservationalTricks.ts` — **58** curator-authored cards
  in 4 lanes (`promotion-queue` / `formula-review` / `source-only` /
  `doctrine-blocked`).
- `src/content/freestyleTrackedNames.ts` — a separate **flat ~1,770-name** list.
- Overlap with canon is prevented **only by manual curation** (the "never reuse
  a canonical slug" rule is documented but NOT enforced in code).
- Per-entry it shows a source badge + status chip, but **no confidence score**
  and no governance/derivation state.

So it surfaces ~3% of the 1,879-name observational universe, is not synchronized
with `RECONCILIATION.csv`, and can silently drift into duplicating canon.

## 2. Target: a derived observational-governance surface

The Phase E pipeline now produces the single source of truth the surface should
be generated from:

```
CLASSIFIED_UNIVERSE.csv  +  A0_EXTRAPOLATION.csv
        │  (build step — deterministic, reversible)
        ▼
  observational dataset (TS content module or JSON)
        │  filter:  in_db_live = False  AND  governance_state ∉ {1,2}
        ▼
  /freestyle/observational  (governance interface, faceted)
```

### 2.1 Derive, don't hand-maintain
Generate the dataset from the Phase E CSVs at build time (the classifier scripts
ARE the generator). The 58-card module is retained ONLY as a **curator-override
layer** (per-slug notes, forced lane, rejection) keyed by slug — never the data
spine. `freestyleTrackedNames.ts` (the flat 1,770 list) is **retired** — it is
fully subsumed by the derived dataset.

### 2.2 Mechanical overlap guard (satisfies the non-overlap requirement)
The surface filters to `in_db_live = False AND governance_state ∉ {1,2}`. This
**guarantees by query** that no entry collides with a published canonical trick,
a curated alias, or a known decomposition — the **248 overlap rows** the pipeline
found are excluded automatically, not by hand. The exclusion is re-checked on
every build against the live DB, so W-wave promotions self-remove from the
surface.

### 2.3 Group by status; expose the distinctions the spec requires
Primary grouping = derivation/governance status, mapped from the columns the
pipeline already emits (no new judgment):

| Surface section | Derived from |
|---|---|
| Mechanically derivable (review-ready) | `mechanically_derivable=True` ∧ `doctrine_stable=True` |
| Structurally readable, ADD open | `structurally_readable=True` ∧ `mechanically_derivable=False` |
| Doctrine-blocked | `doctrine_confidence=blocked` (failure_class `compression-ambiguity`) |
| Unresolved alias | `category=B` |
| Folk-name unresolved | `failure_class=folk-name-opacity` |
| Source-exclusive | `n_sources=1` (facet, not a section) |
| Junk / parser artifact | `category=E` ∨ `failure_class=parser-ambiguity` |

The four legacy lanes map cleanly: promotion-queue ← row 1; formula-review ←
rows 2 + impossible-ADD; doctrine-blocked ← row 3; source-only ← rows 5/6.

### 2.4 Expose confidence + provenance per entry (kept separate)
Every card surfaces, from the existing columns:
- `parser_confidence` (high/medium/low/none) **and** `doctrine_confidence`
  (stable/blocked/policy-dependent) — **two independent chips**, never merged.
- `source_corpus` + full `provenance` (which sources/files).
- `provisional_add` + `decomposition`, badged **"observationally extrapolated"**
  — visually distinct from a canonical ADD, with `observationally_extrapolated=true`.
- `failure_class` as the "why not promoted yet" explainer (great UX: the user
  sees *unknown-modifier-token: arctic* instead of a blank).

### 2.5 Browse axes = facets over one dataset
The spec's axes (ecosystem / source / parser-confidence / derivation-confidence
/ doctrine-block / governance-state / modifier-stack / unresolved-token-type)
become **filter facets** over the single derived dataset — not separate surfaces
or separate content modules.

### 2.6 Respect the family skeleton (P7)
Cards carry `parent_family` and the `retired_family` flag from the classifier.
The surface **never regenerates retired route-out labels** (pixie/fairy/clipper-
stall/… as families); modifier ecosystems are an axis (facet), alternative
surfaces are a surface group, foundational surfaces are not families — exactly as
on the Family browse view.

## 3. The five layers as the surface's conceptual spine

The surface should teach the platform's core distinction by making these five
independent flags visible (they are now real columns, not aspirations):

1. **structurally readable** — we understand the move's shape.
2. **mechanically derivable** — we can compute a provisional ADD.
3. **doctrine stable** — no contested doctrine token.
4. **observationally extrapolated** — derived, not asserted (always true here).
5. **culturally canonical** — promoted into the dictionary (always false here;
   crossing this line is a curator act, never automatic).

This is the conceptual achievement to foreground: the surface is where a name
lives **before** it earns canonical status, with its exact standing legible.

## 4. Migration plan (when authorized)

1. Add a build step (`build_observational_content.py`) that emits a reversible
   TS/JSON module from the Phase E CSVs (no schema; per reversible-content rule).
2. `extend-service-contract`: service reads the derived dataset, applies the
   curator-override layer, exposes facets + the two confidence chips.
3. `add-public-page`: re-template `/freestyle/observational` as the faceted
   governance interface; keep the layer wall (no canonical row, no media, no
   detail route for observational entries).
4. Retire `freestyleTrackedNames.ts`; reduce `freestyleObservationalTricks.ts`
   to curator overrides.
5. Tests: overlap-guard assertion (no in_db slug leaks onto the surface);
   facet correctness; mobile layout.

## 5. Risks

- **Hand-editing returns.** If the surface is hand-edited instead of regenerated,
  the parallel-system problem comes back. Mitigation: CSV is the generator;
  module = overrides only; a test asserts the surface == derived dataset (minus
  overrides).
- **Confidence read as canonical.** The provisional ADD must never look like a
  canonical ADD. Mitigation: distinct badge + the explicit
  `observationally_extrapolated` flag + the five-layer chips.
- **Overlap guard silently wrong.** Mitigation: the guard is a query
  (`in_db_live`), re-evaluated each build, with a regression test.
