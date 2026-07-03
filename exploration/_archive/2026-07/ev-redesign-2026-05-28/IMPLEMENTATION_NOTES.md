# Emerging Vocabulary redesign — implementation notes (2026-05-28)

The `/freestyle/observational` surface was rebuilt from a hand-maintained card
list into a derived, governance-aware control surface. Read-only on the DB; no
canonical promotions, alias merges, parser changes, route-registration changes,
or VIEW_CATALOG/SERVICE_CATALOG edits in this slice.

## What shipped

**Data pipeline (generated content module).**
- `legacy_data/scripts/build_observational_universe_content.py` reads the
  committed Phase E CSVs (`exploration/phase-e-promotion-packet-2026-05-28/`
  clean / curator_confirm / deferred + `phase-e-implementation-2026-05-28/`
  CLASSIFIED_UNIVERSE) and emits `src/content/freestyleObservationalUniverse.ts`
  (1,701 rows + stats + doctrine blocking-questions). Re-runnable, deterministic,
  schema-free. Mirrors the existing `build_tracked_names_content.py` pattern.
- **Overlap-safe by construction:** the source CSVs already exclude
  `in_db=true` / `governance_state∈{1,2}` / alias-to-canon rows, so no row on the
  surface can collide with a published canonical trick or curated alias.

**Service (`freestyleService.getObservationalLayerPage`).**
- New `FreestyleObservationalContent` v2: a stats banner + five governance
  sections (Ready-for-Promotion grouped by ecosystem · Ecosystem-frontier matrix
  + curator-confirm cards · Doctrine-bottleneck clusters · Folk-name unresolved ·
  Parser uncertainty), with confidence-aware cards.
- Parser-confidence and doctrine-confidence are **separate** card chips; the
  five conceptual layers (structurally-readable / mechanically-derivable /
  doctrine-stable / observationally-extrapolated / culturally-canonical) are
  honored — provisional ADD is labelled "(extrapolated, not canonical)" and JOB
  is **not** rendered (no fabrication).
- The 58 curator notes from `freestyleObservationalTricks.ts` are merged as an
  **override layer** (notes only, keyed by slug) so curator work is preserved.

**View + CSS.**
- `src/views/freestyle/observational.hbs` rebuilt (stats banner → ready cards by
  ecosystem → frontier matrix → doctrine clusters → folk/parser summaries with
  full lists behind `<details>`). Summarize-heavy: no 1,700-card dump, no
  pagination/client-JS.
- `src/views/partials/observed-card-fields.hbs` rewritten for the confidence
  card; new `src/views/partials/observed-summary-section.hbs` for folk/parser.
- New CSS in `style.css` (stats / sections / ecosystem groups / matrix /
  clusters / confidence chips / full-list disclosure) with 768px + 480px
  breakpoints.

**Tests.** New `tests/integration/freestyle.observational.routes.test.ts`
(8 tests: stats banner, ready-by-ecosystem confidence cards, frontier matrix,
doctrine clusters, folk/parser summaries, plus a two-layer overlap guard —
render-level (no canonical hashtag, no `/freestyle/tricks/<slug>` detail link)
and module-level (only unresolved-observational sections present)).

Verification: `npm test` green (285 files / 4,897 tests), `npm run build` clean,
`scripts/ci/assert_conventions.sh` passes.

## Migration from the legacy EV surface

- The old 4-lane page (`OBSERVATIONAL_TRICKS`, 58 cards) + flat ~1,770-name
  tracked-vocabulary section (`TRACKED_UNPUBLISHED_NAMES`) is replaced by the
  derived universe + five sections.
- The `/freestyle/tricks` Card-5 ("Emerging vocabulary") count was repointed from
  `TRACKED_UNPUBLISHED_TOTAL` to `OBSERVATIONAL_UNIVERSE_STATS.total`.
- Stale page-contract tests for the old shape were removed: the whole
  `freestyle.observational-fborg-ingest.routes.test.ts` file (old card/tracked
  rendering; its separation invariants are covered by the new test +
  `freestyle.routes` leak tests), the old lanes test, and individual stale
  `it` blocks in `freestyle.routes` / `freestyle.card-job-block` /
  `freestyle.held-delay-family` / `freestyle.regression-2026-05-23`.

## Deferred caveats / follow-ups

1. **Dead code (not removed; `noUnusedLocals` is off so it compiles):** the old
   feature-local helpers (`shapeObservedTrickCard`, `sortObservedCardsByClaim`,
   `collectObservedSourceBadges`, `OBSERVED_SOURCE_BADGE`, `OBSERVED_STATUS_CHIP`),
   the `buildObservationalLanes` method, and the old `ObservedTrickCard` /
   `ObservationalLaneBucket` / `ObservationalLanesView` interfaces remain in
   `freestyleService.ts`. Safe to delete in a follow-up cleanup.
2. **Legacy modules now unused by the page but NOT deleted** (per the "no
   hard-to-reverse deletes without approval" call): `freestyleTrackedNames.ts`
   and its generator `build_tracked_names_content.py` are no longer imported.
   `freestyleObservationalTricks.ts` is retained for curator-note overrides only.
   Retire candidates pending maintainer confirmation.
3. **Doc-sync owed (needs approval — NOT done this slice):** the VIEW_CATALOG
   `/freestyle/observational` entry still describes the old flat-list + 4-lane
   contract, and SERVICE_CATALOG references the tracked-names section. Both need
   updating to the v2 governance-surface contract.
4. **Mobile layout — visual verification not performed.** 768px + 480px CSS
   breakpoints were added (stats 2-up, single-column cards/clusters, scrollable
   matrix, single-column full lists), but no browser/device render was run.
   Manual-review-required before claiming mobile-correct.
5. **Stats labelling honesty:** the banner shows "Promotion-ready 16%" (clean +
   curator-confirm), which is intentionally distinct from the A0 "mechanically
   derivable ~36%" (which also counts doctrine-blocked-but-computable rows). Do
   not relabel one as the other.
6. **Regeneration:** when Phase E CSVs change (new waves, re-run classifier),
   re-run `build_observational_universe_content.py` to refresh the module — the
   surface must stay generated, never hand-edited.
