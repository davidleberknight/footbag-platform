# Coherence Cleanup Audit — master synthesis

**Slice:** Coherence Cleanup Slice A + B (merged) — 2026-05-17
**Inputs:** human-review notes from `HUMAN_REVIEW_CHECKLIST.md` + `RENDERED_HTML_AUDIT.md` (post Slice W)
**Posture:** stabilization-friendly; no ontology expansion; no Wave 2 resolution; no fabricated formulas
**Result:** 5 audit docs + 3 CSV/matrices + 3 synthesis docs + 5 safe corrective edits + 8 new test specs (3360 → 3368 passing)

## TL;DR per-task summary

| Task (Slice A + B merged) | Phase 1 audit doc | Phase 2 synthesis | Phase 3 fix |
|---|---|---|---|
| A.6 + B.1+5+6 Core-trick formula visibility | `CORE_FORMULA_VISIBILITY_AUDIT.md` + `core_formula_gap_report.csv` + `landing_page_formula_gaps.csv` | `foundational_formula_strategy.md` (Tier 2 readings drafted) | Deferred — needs curator approval |
| A.1 + B.5 Trickcard consistency | `TRICKCARD_CONSISTENCY_ANALYSIS.md` + `trickcard_consistency_matrix.csv` | (folded into foundational_formula_strategy.md) | None — cards already uniform across 6 browse views |
| B.3 Category-view retirement | `category_view_dependency_matrix.csv` | `category_view_retirement_recommendation.md` (defer 60 days) | Category-view explanatory intro note |
| A.3 Paradox formula visibility | `paradox_formula_visibility_report.md` | (no separate doc; recommendation in audit) | Deferred — needs maintainer prose sign-off |
| A.4 Spyro / spinning / gyro / inspin | `classification_drift_report.md` | (no separate doc; recommendation in audit) | §11 spyro→inspin row clarification |
| A.5 Traditional Reference reclassification | (folded into history_drift_audit.md scope) | `glossary_section_relocation_recommendations.md` | §10 header note + `id="traditional-reference"` + `#run-quality` anchor |
| A.2 External reference inventory | `external_reference_inventory.md` | (folded into the audit) | 4 outbound hyperlinks added to §11 |
| A.7 History rewrite planning | `history_drift_audit.md` | `history_rewrite_recommendations.md` | Anchor fix + movement-system inbound link |

## Files delivered (all under `exploration/coherence-cleanup-2026-05-17/`)

**Phase 1 — audits (read-only data):**
1. `CORE_FORMULA_VISIBILITY_AUDIT.md`
2. `core_formula_gap_report.csv` (151 rows × 10 columns)
3. `landing_page_formula_gaps.csv` (11 rows)
4. `TRICKCARD_CONSISTENCY_ANALYSIS.md`
5. `trickcard_consistency_matrix.csv` (7 surfaces × 12 attributes)
6. `category_view_dependency_matrix.csv` (17 dimensions across 6 views)
7. `paradox_formula_visibility_report.md`
8. `classification_drift_report.md`
9. `external_reference_inventory.md`
10. `history_drift_audit.md`

**Phase 2 — synthesis + recommendations:**
1. `foundational_formula_strategy.md`
2. `category_view_retirement_recommendation.md`
3. `glossary_section_relocation_recommendations.md`
4. `history_rewrite_recommendations.md`

**Phase 4 — this master doc:**
1. `COHERENCE_CLEANUP_AUDIT.md`

## What was actually fixed (Phase 3)

Five safe / governed / reversible edits shipped in a single batch:

1. **Glossary §10 anchor restoration.** Added `id="traditional-reference"` to the §10 heading + `id="run-quality"` to the ADD-system-and-run-quality sub-heading. Updated 2 stale `#1-add-system--run-quality` deep-links in `history.hbs` to `#run-quality`. (Inbound history-page links were silently broken before.)
2. **§10 mixed-level-of-analysis acknowledgment.** Added a 1-paragraph note explaining that §10 vocabulary operates at the *run* and *competition* level rather than the *trick* level.
3. **4 outbound hyperlinks in glossary §11 source-families list.** footbag.org, footbag.org/newmoves/list, footbagmoves.com, WorldFootbag YouTube. All with `target="_blank" rel="noopener noreferrer"`.
4. **§11 spyro→inspin row clarification.** Added inline annotation: "spyro is the active dictionary slug; inspin is a folk synonym." Resolves the classification contradiction surfaced in `classification_drift_report.md` without deleting either side.
5. **Category-view explanatory intro note.** Added 1-paragraph intro to `?view=category` explaining the grammatical-role grouping (dex / body / set / compound) and pointing readers to family / movement-system as richer alternatives.
6. **History "How Combos Grew" inbound link.** Added link to `/freestyle/tricks?view=movement-system` from the run-quality cross-link paragraph, anchoring the "modifier stacking" vocabulary discussion at a structural surface.

**Test coverage:** 8 new specs in `tests/integration/freestyle.routes.test.ts` under describe block "Coherence Cleanup Slice — Phase 3 safe corrective fixes (2026-05-17)". All passing. Suite: 3360 → 3368 / 182 files.

**Build:** clean.

## What remains blocked

### Wave 2 doctrine (waiting on Red)

- **9 dex atoms** (mirage / whirl / butterfly / osis / swirl / legover / pickup / illusion / around-the-world / guay / refraction / reverse-drifter) need bare-form op-notation doctrine before their landing/glossary cards stop rendering sparse
- **9 body atoms** (clipper / spin / spyro / flying-inside / flying-outside / double-spin / dragonfly-kick / hop-over / walk-over) need operator-vs-trick boundary ruling
- **9 set atoms** (pogo / rooted / atomic / fairy / furious / pixie / quantum / sailing / shooting) need standalone-form doctrine
- **Spyro full classification** (currently body atom in DB + folk-equivalent of inspin in glossary §11) — annotated this slice; full reconciliation still pending

These match the open Wave 2 grammar questions per `[[project_red_consultation_state]]`.

### Curator-paced

- **Foundational Tier 2 readings** for the 10 landing core atoms (`CORE_TRICK_SPEC.equivalences[]`). Strategy doc proposes; curator approval gates implementation. Currently the 10 readings are draft text inside `foundational_formula_strategy.md`.
- **Paradox visible canonical formula synthesis.** Recommendation in `paradox_formula_visibility_report.md` would surface `paradox = CLIP > OP IN [DEX]   (+1 body modifier; hip-pivot framing)` as a single high-visibility anchor across §3 / §6 / §9. Needs maintainer prose review before shipping.
- **History page Tier B addition** (the "Four-Layer Vocabulary" short section). `history_rewrite_recommendations.md` proposes; needs maintainer sign-off.
- **Pioneers profileHref population** in history service. Service-side fill; not a template change. Defer to a future slice that touches `historyService.ts`.

### Future combo / run analysis page

- Run-quality tier table (Tiltless / Guiltless / Tripless / Fearless / Beastly / Godly / Genuine / BOP) belongs in a Combo/Run Analysis page that does not yet exist. Per `glossary_section_relocation_recommendations.md` the table stays in §10 until that page is built; then the move happens.
- Event-format vocabulary (Routine / Shred / Big Trick / Circle / Most Rippin' Run) could move to `/rules/freestyle/` or to event-detail pages; not blocking.

### Category-view retirement

- 60-day deferral with re-evaluation trigger. Recommendation in `category_view_retirement_recommendation.md`. If retired in a future slice, migration checklist already documented.

## What was found to be already correct

- **Trick-card primitive uniformity** across `/freestyle/tricks` browse views (ADD / family / movement-system / topology / component / category). Shared partial; canonical field order; no drift. Differences in surrounding wrappers (h2 headings, group definitions, axis-jump nav) are intentional grouping semantics.
- **ADD analysis discoverability** post Slice X corrective. 4 inbound surfaces (landing portal card / dictionary footer / glossary §1 + §8 / history ADD-system section). No additional inbound surfaces needed.
- **External reference acknowledgement.** Glossary §11 already names footbag.org, PassBack, footbagmoves, AnzTrikz, TT, Jobs notation, WFA / NHSA as source families — what was missing was hyperlinks (now added for 4 verified URLs).
- **Card primitive layer separation.** The parser layer (canonical_name) and editorial layer (chains / op-notation) are cleanly separated per `[[feedback_parser_editorial_separation]]`. No drift.

## Recommended next slice

Three reasonable next slices, in priority order:

1. **Foundational Tier 2 reading approval pass** — present the 10 draft readings to curator; if approved, edit `CORE_TRICK_SPEC.equivalences[]` (small file edit; biggest visual impact on landing). **Estimated effort: small.**
2. **Paradox formula visible-anchor pass** — author the synthesized formula block; place it in glossary §3 and §6 and §9; update operator reference if applicable. **Estimated effort: small-medium; needs maintainer prose review.**
3. **Wave 2 response integration** — when Red's Wave 2 ruling lands, this slice's deferrals can be reopened for the dex / body / set atom op-notation forms. **Estimated effort: depends on Red.**

Lowest-priority and not recommended immediately:
- Category-view retirement
- History Tier B / C rewrite
- Combo/Run Analysis page creation

## Constraints respected

- No ontology expansion (no new families, categories, modifiers, operators)
- No Wave 2 resolutions (all 27 atom op-notation gaps remain doctrine-deferred)
- No parser grammar work
- No ADD changes
- No fabricated formulas (every prose addition is editorially grounded in existing glossary text)
- No category deletion (deferral path documented; immediate retirement rejected)
- Four-layer separation preserved (no parser-editorial blending)
- Anti-overhardening posture preserved (only governed / reversible changes shipped)

## Cross-references

- `feedback_phased_scope_control` — collaboration style satisfied
- `feedback_audit_scope_legacy_and_exploration` — all deliverables under `exploration/`
- `feedback_reversible_content_governance` — all fixes are TS / HBS / CSV; no SQL
- `project_freestyle_state` — current state pre-slice and post-slice
- `project_red_consultation_state` — Wave 2 dependencies
- `project_freestyle_post_slice_e_posture` — stabilization posture aligned with deferral discipline
