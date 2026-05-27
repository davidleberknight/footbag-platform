# Category-View Retirement Recommendation

Coherence Cleanup Slice — Phase 2 (2026-05-17). Synthesis grounded in P1c dependency matrix.

## Recommendation: DO NOT retire category-view in this slice. Mark for re-evaluation in 60 days.

The dependency-matrix audit (P1c) finds that category view does carry one piece of uniquely surfaced information: **the dex/body/set/compound role axis as a top-level grouping**. No other browse view exposes this grouping at the top level.

Whether that uniqueness is **load-bearing** is the open question.

## What category view uniquely provides

1. **Grammatical-role grouping** — only place that surfaces dex / body / set / compound as top-level buckets. These buckets correspond to grammatical role in op-notation (the four building blocks: surface → set → body → dex → delay). This is a structural axis the other views don't carry.

2. **`#category-{slug}` deep-link anchors** — six anchor IDs. No other surface uses this anchor pattern.

3. **Historical/legacy role** — this was the original dictionary browse default before SYMBOLIC-UX-1 added family / movement-system / topology / component views.

## What category view duplicates

Everything else: card primitive, modifier filtering, role-classified tokens, media chips, count chips. All inherited from shared partials.

## Arguments for retirement

- 4 of 6 buckets (dex / body / set / compound) overlap heavily with what movement-system view + family view already surface
- Grammatical-role axis isn't surfaced as a primary user-facing question on any other surface, suggesting it may not be load-bearing as a TOP-level grouping
- Tests + inbound links would all need re-wiring
- ~20-30 integration test specs reference `?view=category`

## Arguments against retirement (now)

- The grammatical-role grouping is genuinely unique among the browse views; retirement loses something
- It's well-tested; removing well-tested coverage isn't free
- The historical/legacy role means inbound links from external places (legacy posts, bookmarks) point at `?view=category` — retirement breaks them silently unless redirect is wired
- No user complaint surfaced about it (the audit is internal-driven, not pain-driven)
- The platform is in stabilization posture per `[[project_freestyle_post_slice_e_posture]]`; retirements are scope expansion

## Decision matrix

| Question | Answer | Implication |
|---|---|---|
| Is category-view's unique information valuable enough to keep? | Borderline | Lean keep |
| Does another view surface dex/body/set/compound at the top level? | NO | Retirement removes this view |
| Are there inbound links to `?view=category` from external places? | Probably (legacy bookmarks) | Retirement needs redirect |
| Is the maintainer pain-driven on this? | NO (audit-driven) | Defer pending real-pain signal |
| Are we in stabilization posture? | YES | Avoid scope expansion |

## Proposed action

**Defer the retirement decision 60 days**, with one mid-term intervention:

1. **Add an explicit explanatory note to category-view's intro** — a short paragraph at the top of `?view=category` acknowledging that the grouping is grammatical (dex/body/set/compound) and pointing readers to family-view / movement-system view for richer organization. This makes the unique value LEGIBLE rather than implicit.

2. **Re-evaluate at next coherence pass** — if maintainer signals pain (e.g. "I never use this view") or if a future slice adds a grammatical-role surface elsewhere (e.g. a glossary §3 grammatical role table), revisit the retirement decision.

3. **Do NOT mark for deprecation** in this slice. No removal CTAs, no redirect-to-other-view, no test removals.

## If a future slice DOES retire

Migration checklist:

- [ ] Add 301 redirect from `?view=category` → `?view=family` (or whichever default replaces it)
- [ ] Remove the "By category" link from the view-switcher nav
- [ ] Update `freestyleService.ts` to drop category-group construction (lines 3816+)
- [ ] Remove the `{{#if (eq content.activeView "category")}}` block from `tricks.hbs`
- [ ] Update or delete `tests/integration/freestyle.category-view.routes.test.ts`
- [ ] Update the 6 other test files that reference `?view=category` (use family-view URLs instead)
- [ ] Update `freestyleService.ts` view-switcher options
- [ ] Decide: is the `dex/body/set/compound` grouping ever surfaced elsewhere, or is it gone?

If grammatical role IS retained elsewhere, the retirement is clean. If it's just deleted, the value loss should be acknowledged.

## What's safe to ship now (Phase 3 candidate)

Step 1: the explanatory note. Single paragraph at the top of category-view's section in `tricks.hbs`. Adds ~3 lines, no removal. Helps the audit-flagged user understand why the view exists.

## Cross-references

- `category_view_dependency_matrix.csv` — the audit data this recommendation rests on
- `project_freestyle_post_slice_e_posture` — stabilization posture argues against retirement now
- `feedback_phased_scope_control` — defer-pending-real-pain matches the collaboration style
