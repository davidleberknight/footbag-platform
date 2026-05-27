# History Page Drift Audit

Coherence Cleanup Slice — Phase 1e (part 3) (2026-05-17). Read-only audit.

## TL;DR

`/freestyle/history` is a sound editorial page but drifts in three specific ways relative to the platform's current movement-language maturity:

1. **Pioneers table doesn't link to player profiles or honor pages** — names render as plain text in most cases (per-row `profileHref` check exists but appears under-populated)
2. **Pre-IFPA terminology baked into prose** — section names like "BAP inductees of the early 1990s" assume background that the glossary now formally defines (BAP is in §10; could deep-link)
3. **No cross-link to the operator board / Movement System primer** — history talks about "modifier stacking" without pointing to where that vocabulary is now anchored

These are drift, not failure. The page reads well; the audit's job is to identify points where outbound links would strengthen the reader's journey across the now-richer surrounding surfaces.

## Section-by-section

| Section | Drift? | Recommendation |
|---|---|---|
| Hero/intro media panel | none | — |
| Competitive Eras (5 chapters) | minor — keyFigures text but no profile links | Service should populate profileHref for HoF/BAP names |
| Evolution of Difficulty | none | — |
| How Combos Grew | already links to glossary `#1-add-system--run-quality` | OK — but glossary §10 is the section, not §1 (anchor may be stale) |
| From Routines to Guiltless | links to glossary `#1-add-system--run-quality` | Same anchor concern as above |
| Founders & Pioneers (table) | profileHref check exists but most rows render as plain text | Service-side fill; not a template fix |
| ADD System | links to /freestyle/tricks, /freestyle/insights, /freestyle/add-analysis | **Strong** — already wired correctly |
| Geographic Shift | links to /freestyle/competition | OK |
| Modern Game | optional media panel | OK |

## Specific drift items

### 1. Stale anchor `#1-add-system--run-quality`
The glossary's run-quality content moved to §10 in v5 (per `project_glossary_v5_synthesis`). The history page deep-links to `#1-add-system--run-quality` in two places (lines 84 and 100). The anchor may no longer exist; verify via curl + fix.

### 2. Operator vocabulary references not linked
History prose mentions "modifier stacking in the 2000s." The platform now has a movement-system view + operator board + intermediate-operator reference. The history page could link to `/freestyle/glossary#movement-system-axes` or `/freestyle/tricks?view=movement-system` to land the reader on the structural anchors that didn't exist when the prose was written.

### 3. Pioneers profileHref population
The template branches `{{#if profileHref}}<a href="{{profileHref}}">{{name}}</a>{{else}}{{name}}{{/if}}` — service-side fill of profileHref for known HoF/BAP names would convert plain-text rows to clickable.

### 4. BAP / HoF terminology
"BAP inductees" and "HoF" are used in the prose. BAP is defined in glossary §10's traditional reference, and `/bap` + `/hof` editorial pages exist. The first mention could anchor-link to either or both.

### 5. Movement-language sophistication mismatch
History describes the freestyle vocabulary's evolution using the old terms; the glossary now uses the four-layer ontology (canonical / educational / symbolic / operational). The page could acknowledge this layered view in a single sentence — "Today the vocabulary is documented across four layers" — with a link to glossary §1.

## Media integration

`heroMedia`, `pioneersMedia`, `modernEraMedia` all gate on `content.*Media` populated by the service. Curator content. Not template drift.

## Outdated / placeholder sections

None found. The page is in good shape; the drift is all in cross-link freshness.

## Recommendation for Phase 2 (history_rewrite_recommendations.md)

This audit is the input for `history_rewrite_recommendations.md`. The Phase 2 doc will propose either:
- (A) Minimal cross-link refresh (fix stale anchors + add 3-4 inbound links to glossary/dictionary)
- (B) Mid-scope rewrite that integrates the movement-language sophistication as a new section
- (C) Full editorial rewrite (large; defer)

Recommendation: (A) is the safe-immediate path; (B) is the right medium-term but requires editorial sign-off; (C) is out of scope for this slice.

## What's safe to ship now (Phase 3 candidate)

(A) the cross-link refresh:
1. Verify glossary anchors `#1-add-system--run-quality` — update if moved
2. Add 1-line link from "modifier stacking" prose to `/freestyle/tricks?view=movement-system`
3. (Optional) Link first BAP / HoF mention to `/bap` / `/hof`

Pioneers profileHref is a service-side change — defer.

## Cross-references

- `project_glossary_v5_synthesis` — confirms glossary section re-organization
- `project_freestyle_state` — current glossary section anchors
- `feedback_public_facing_prose` — prose hygiene rule
