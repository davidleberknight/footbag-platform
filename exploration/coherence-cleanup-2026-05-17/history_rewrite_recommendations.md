# History Rewrite Recommendations

Coherence Cleanup Slice — Phase 2 (2026-05-17). Synthesis grounded in P1e history drift audit.

## Recommendation: minimal cross-link refresh now; defer mid-scope rewrite.

The history page reads well. The drift surfaced in P1e is cross-link freshness + missing inbound pointers to the movement-language surfaces that didn't exist when the prose was written. None of the drift items justify rewriting prose; all justify refreshing links.

## Three-tier rewrite framework

### Tier A — Cross-link refresh (recommended this slice)

1. **Verify glossary anchor `#1-add-system--run-quality`** (referenced twice in history.hbs at lines 84 and 100). If it's no longer the right anchor (likely moved to §10 in v5), update to current valid anchor.

2. **Add 1 link from "modifier stacking" prose** to `/freestyle/tricks?view=movement-system` or `/freestyle/glossary#movement-system-axes`. Lets readers land on the structural anchor for the vocabulary the prose discusses.

3. **(Optional) Link first BAP / HoF mention to `/bap` / `/hof`**. The pages exist; this is a 1-token edit per mention.

**Scope:** ~3-5 lines changed in `src/views/freestyle/history.hbs`. No service-side changes. No new prose. Reversible.

### Tier B — Mid-scope addition (defer to maintainer-approved future slice)

Add a new short section: "**The Four-Layer Vocabulary**" — a single paragraph acknowledging that today's freestyle vocabulary is documented across four layers (canonical / educational / symbolic / operational), with a link to glossary §1. Anchors the historical narrative against the current structural framework without rewriting any prose.

**Scope:** 1 new `<section>` block in `history.hbs`, ~5-10 lines, references existing glossary surfaces. Needs maintainer prose review.

### Tier C — Full editorial rewrite (out of scope for this slice)

Rewriting the history prose to integrate the movement-language sophistication throughout would be ~200-400 lines of new editorial content. Would touch:

- Era descriptions (rewrite to reference modifier stacking, dex evolution, operator emergence as themes)
- Pioneers table (richer per-figure context tying each player to specific operator/family contributions)
- Geographic shift (richer treatment of European-led refinement of compositional grammar)
- Modern game (acknowledge the formal four-layer ontology + Wave-2 doctrine refinement)

**Scope:** large. Editorial work that should be maintainer-driven, not AI-driven. Defer to a future "history v2" slice.

## Specific items not in any tier

- **Pioneers table profileHref population** — service-side fill required (link to HoF/BAP/active-member profile per row). This is a service change, not a template change. Should land in a separate slice that touches `historyService.ts` (not catalogued in `freestyleService.ts`). Defer.

## Media integration

`heroMedia`, `pioneersMedia`, `modernEraMedia` already gate on curator-populated content. The media system itself is healthy; what's missing is curated media for some of the slots. That's a curator action, not a template action. Defer.

## Outdated/placeholder sections

None found. Page is in good shape; recommendation is targeted refresh, not rewrite.

## Recommended sequence

1. **This slice (Phase 3 candidate):** Tier A cross-link refresh — 3 edits
2. **Next coherence pass:** Tier B four-layer section addition (if maintainer wants it)
3. **Future "history v2" slice:** Tier C full editorial rewrite (maintainer-driven)

## Cross-references

- `history_drift_audit.md` — Phase 1e input
- `project_glossary_v5_synthesis` — confirms current glossary anchor IDs (verify against)
- `feedback_public_facing_prose` — prose hygiene rule any new history prose must follow
