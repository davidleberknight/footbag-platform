# Emerging Vocabulary — generator-level classification cleanup (design spec)

**Status:** design spec for implementation. This is the **data-layer half** of the Emerging Vocabulary whole-surface fix. The **render-layer half is already done** (the `/freestyle/observational` page now drives its card sections and tiles from one classifier, `classifyFrontier` in `freestyleService.ts`). This spec makes the *generated data* carry that same classification so the service can stop overriding stale fields at render. Platform code + the data-pipeline generator are the primary maintainer's / pipeline area; the freestyle maintainer advises on the classification model.

## Context

The Emerging Vocabulary page had two disagreeing classifiers. The render fix made the **service** the single model at request time, but it works by *overriding* the generator's stale per-row fields (`section`, `intakeBucket`, `doctrineConfidence`, `cluster`). The data still says, e.g., blurry rows are `frontier` (ordinary authoring) and Nuclear-Osis is `frontier`, while the page correctly shows them as curator holds. Per the surface propagation rule, a generated surface that disagrees with the rendered page is drift to close: the generator should emit the primary-blocker classification directly, and the service should read it.

## Problem — where the stale classification is stamped

`legacy_data/scripts/build_observational_universe_content.py`:
- `doctrine_blocker(name)` (≈ line 87) returns a cluster key (`weaving` / `dod-ddd` / undefined-operator) or `None`, using `COHERENT_DOCTRINE_CLUSTERS` (≈ line 53) to split structure-known clusters from undefined-operator ones.
- `main()` (≈ line 250) assigns `section`/`cluster`/`intakeBucket` from that: `None` → `frontier`; a coherent cluster → `doctrine` + `doctrine_pending`; an undefined operator → `doctrine` + `doctrine_unresolved`; plus `folk` / `parser`.
- The header comment claims "the SERVICE owns sectioning / sampling / labeling," yet the generator stamps `section`. That split is exactly the drift.

The service's `classifyFrontier` (now the render source of truth) re-derives the real primary blocker from those fields **plus** curated token sets (`KNOWN_FRONTIER_TOKENS`, `NB_UNDEFINED_OPERATORS`, `IDENTIFICATION_NAMED`), `isFullyDerived`, and the newly-added curator-hold routings (blurry packet → curator; Nuclear-Osis / multi-alias parentheticals → identity). So the classification logic is split across two files and one of them (the data) is wrong.

## Target

The generator emits a **first-class primary-blocker classification** per row, computed once from the committed reclassification model, so the data is honest and the service reads the field instead of re-deriving it.

## Design

### 1. Emit the primary-blocker model from the generator
Port the deterministic classifier at `exploration/frontier-reclassification-2026-06-30/classify_frontier.py` into `build_observational_universe_content.py`. It already mirrors the service's token vocabulary; fold it into the row builder so each row carries:
- `primaryBlocker: 'doctrine_blocked' | 'parser_limitation' | 'needs_curator_review' | 'ready_for_authoring'` — assigned by the ratified precedence (Doctrine Blocked > Parser Limitation > Needs Curator Review > Ready for Authoring).
- `holdKind` (optional finer label the page can group by): `weaving_grammar` / `undefined_operator` / `identity` / `dod_ddd_verification` / `blurry_packet` / `ready` / `authoring` / `parser` / `folk` / `alias`. (This is what the render classifier's `FrontierCategory` currently computes; move it to generation time.)
- `flags: string[]` — the orthogonal reclassification flags (`positional_variant`, `duplicate_or_alias_candidate`, `verification_needed`, `depends_on_parent`). `depends_on_parent` needs the canonical-base DB cross-check the reclassification README left as a follow-up.

Fold in the routings the service now adds at render, so they live once at the source:
- **blurry** compounds (leading token in `blurry` / `blurrier` / `blurriest`) → `needs_curator_review` (`blurry_packet`) while the blurry packet is pending.
- **Nuclear-Osis / Aeon-Flux** and any name with **≥2 canonical-alias parentheticals** → `needs_curator_review` (`identity`).
- fully-derived rows (numeric `provisionalAdd` + non-empty `decomposition`) → `ready_for_authoring`, regardless of the old `section` label.
- `weaving` → `doctrine_blocked` (`weaving_grammar`): definition given, notation-token grammar unresolved — the one genuine doctrine blocker.

### 2. Update the generated TS interface + the two content files
- Add `primaryBlocker` / `holdKind` / `flags` to `ObservationalUniverseRow` in `src/content/freestyleObservationalUniverse.ts` (generated; regenerate, do not hand-edit).
- Regenerate `freestyleObservationalUniverse.ts` and its `freestyleTrackedNames.ts` peer from the generator.

### 3. Simplify the service to read the emitted field
In `freestyleService.ts` `getObservationalLayerPage`:
- Replace `classifyFrontier` (and its curated token sets `KNOWN_FRONTIER_TOKENS` / `NB_UNDEFINED_OPERATORS` / `IDENTIFICATION_NAMED`, `isFullyDerived`, `nameResolvesToKnownTokens`, and the blurry / nuclear-osis routings) with a thin read of `r.holdKind` / `r.primaryBlocker`.
- The section-building (`inCategory('ready')`, `inCategory('authoring')`, the doctrine/curator hold clusters), the tiles, and the summary copy already consume categories — repoint them at the emitted field. Behaviour and counts must be identical to the shipped render fix (that is the regression oracle).
- Keep the page's card sections, tiles, and copy exactly as they render today; only the *source* of the category changes (request-time closure → generated field).

### 4. Retire the vestigial fields
Once the primary-blocker field drives everything, the old `section` (as a display driver), `doctrineConfidence`, and `cluster` become inputs to the generator's classifier only, or are dropped. Decide per field: keep as a debugging input, or remove from the row shape. Do not remove `intakeBucket` / `layer` (they drive the alias-archive netting).

## Specific reconciliation (the four the audit named)

| Row set | Generated today | Rendered today (post render-fix) | Target generated value |
|---|---|---|---|
| weaving (19) | `doctrine` / `doctrine_unresolved` | Doctrine blocked | `doctrine_blocked` (`weaving_grammar`) |
| blurry (66) | `frontier` (58) + `doctrine` (5) | Curator review | `needs_curator_review` (`blurry_packet`) |
| Nuclear-Osis / multi-alias (≈7) | `frontier` / `compression-ambiguity` | Identification | `needs_curator_review` (`identity`) |
| pogo (16 frontier + 1 doctrine) | `frontier` / `doctrine` | authoring / parser | `ready_for_authoring` or `parser_limitation` per row (promoted pogo rows already dropped) |

## Two defects the reclassification README flagged — close them here
- The tile "Needs authoring" and the card section "Needs Authoring" were different populations. The render fix already unified them; the generator field makes that structural, not a request-time coincidence.
- The doctrine card section did not net out the alias archive on the same basis as the ready/frontier sections. With one classifier partitioning every row into exactly one primary blocker (alias rows excluded up front), the counts are one clean partition.

## Migration / verification
1. Extend the generator; regenerate `freestyleObservationalUniverse.ts` + `freestyleTrackedNames.ts` (the generator writes them; run parser-population if the pipeline requires it).
2. Simplify `getObservationalLayerPage` to read the field.
3. Run `npm run build` and `tests/integration/freestyle.observational.routes.test.ts` — the rendered output (sections, counts, copy) must be **byte-for-byte the same** as the shipped render fix; that is the correctness oracle for "the generator now says what the page shows."
4. Confirm the before/after category counts match the render fix: Ready 7, Needs Authoring 142, Doctrine+Curator holds 143 (weaving 19, curator 110, identification 14).

## Non-goals
- **No new doctrine** — encode the committed reclassification model only.
- **No new taxonomy / no re-ranking families or operators.**
- **No schema change** — this is generated content + a service simplification, not a DB migration.
- **No canonical trick edits, no promotions.**
- **No page redesign** — the rendered page must not visibly change; only the classification's source moves from the service to the generated data.

## Appendix — key references
- Generator: `legacy_data/scripts/build_observational_universe_content.py` (`doctrine_blocker`, `main()` row assignment, `row()` builder, `COHERENT_DOCTRINE_CLUSTERS`).
- Model to port: `exploration/frontier-reclassification-2026-06-30/classify_frontier.py` + `README.md` (precedence, flags, doctrine basis).
- Render source of truth (the oracle): `getObservationalLayerPage` / `classifyFrontier` in `src/services/freestyleService.ts`; view `src/views/freestyle/observational.hbs`; test `tests/integration/freestyle.observational.routes.test.ts`.
- Generated content: `src/content/freestyleObservationalUniverse.ts` (`ObservationalUniverseRow`).
