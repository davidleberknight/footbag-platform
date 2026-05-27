# Component View retirement audit

Phase B planning doc. Supersedes the earlier draft
`component-view-retirement.md` (2026-05-18 v1) with a dependency
audit + retirement readiness assessment.

## Unique-value assessment after Movement System inheritance

Once Movement System inherits the 4 Red-safe modifiers (gyro,
whirling, nuclear, quantum) per `movement_system_consolidation_plan.md`,
Component View provides little unique value:

| Surface aspect | Component View | Movement System (post-inheritance) |
|---|---|---|
| Modifier coverage | All 16 DB modifier_link slugs | 15 of 16 (everything except Wave-2-deferred barraging/blurry; tapping/furious pending curator placement) |
| Axis structure | 2 axes (body / set) | 4-5 axes (set-uptime / entry-topology / midtime-body / no-plant-suspension + pending) |
| Pedagogical scaffolding | None | 4-axis vocabulary mirrors glossary §3 |
| Trick card rendering | DictionaryTrickCard (shared) | DictionaryTrickCard (shared) |
| Anchor URLs | `#component-{slug}` | `#movement-{slug}` |
| Duplication semantics | Trick can appear under multiple groups | Trick can appear under multiple groups |

**Unique value of Component View after inheritance**:
- Coverage of barraging + blurry (Wave-2-deferred in Movement System)
- Body/set bipartite axis structure (simpler than 4-axis)

Both points are weak: barraging + blurry coverage can be addressed
by the "Pending Wave 2" group in Movement System (per the
consolidation plan); the bipartite structure is the LESS pedagogically
informative organization.

**Recommendation: retire Component View after Movement System
inheritance lands.**

## Inbound-link dependency audit

Component View receives links from these surfaces:

| Source | Line | Anchor format | Re-point target |
|---|---|---|---|
| `src/views/freestyle/tricks.hbs:73` | View-toggle entry "By component" | n/a (toggle link) | Remove toggle entry |
| `src/views/freestyle/tricks.hbs:168` | Component-view card heading | `?view=component#{anchorId}` | Remove (lives inside the view block) |
| `src/views/freestyle/glossary.hbs:460` | §6 Surface A modifier feel cards "See tricks using {name} →" | `?view=component#component-{slug}` | `?view=movement-system#movement-{slug}` |
| `src/views/freestyle/glossary.hbs:479` | §6 Surface B advanced reference modifier cards | `?view=component#component-{slug}` | `?view=movement-system#movement-{slug}` |
| Service code | `FreestyleTricksActiveView` type literal `'component'` | n/a | Remove from type union |
| Service code | `componentView: ComponentBrowseView` field | n/a | Remove from page view-model |
| Service code | `shapeComponentView` shaper | n/a | Remove |
| Tests | Any test pinning `?view=component` or "By component" | n/a | Remove / re-point |

External (crawled/bookmarked) inbound URLs: unknown but plausibly
zero from search engines (the view is recent — DSC-2 slice 3A,
2026-05-13). Low external-redirect cost.

## Redirect vs plain removal

Two retirement strategies:

**Option A: Plain removal (recommended).**
- Drop the `?view=component` handling at the controller. Unknown
  values fall through to the default ADD view.
- Internal cross-links (glossary §6) are explicitly re-pointed.
- No 301 redirect; no DD §5.2 redirect-policy contest.
- External-link breakage cost: minimal (recent surface; low PageRank).

**Option B: 301 redirect.**
- Controller redirects `?view=component` → `?view=movement-system`
  preserving the anchor where possible.
- Touches the DD §5.2 redirect-policy gray area (URL-rename redirects;
  see Dave audit #3 conversation).
- Glossary §6 cross-links still re-pointed (so redirect is for
  external links only).
- Slightly higher complexity.

**Recommendation: Option A.** The view shipped recently (2026-05-13);
external inbound link risk is minimal. Plain removal is cleaner.

## Anchor mapping for re-pointed glossary links

The glossary §6 modifier cards use `?view=component#component-{slug}`.
After re-pointing to `?view=movement-system#movement-{slug}`, the
mapping is identity-preserving:

- `?view=component#component-paradox` → `?view=movement-system#movement-paradox`
- `?view=component#component-spinning` → `?view=movement-system#movement-spinning`
- etc.

All anchor slugs that exist on the component-view side also exist on
movement-system view (post-inheritance) because Movement System
inherits the same modifier-link slugs.

## Discoverability preservation

Component View was a unique discovery path for users who wanted
modifier-grouped browsing. After retirement:

- Discoverability of modifier-grouped browse: preserved via Movement
  System (which is structurally richer).
- The "By component" view-toggle label disappears from
  `tricks.hbs:73`; the navigation row will read: By family / By
  movement system / By category / Movement Neighborhoods. Four toggle
  entries instead of five — cleaner.
- Glossary §6 modifier cross-links continue to function (re-pointed).

No discoverability regression.

## Useful-groupings preservation

Component View has no per-group editorial content unique to it —
the `bodyDefinition` per group sources from `COMPONENT_DEFINITIONS`
(the same map Movement System reads from). No groupings are lost
in retirement.

## Retirement sequence

```
1. Movement System inheritance lands (per consolidation plan)
2. Glossary §6 modifier cross-links re-pointed to Movement System
3. Component-view code removed (template block + service shaper +
   type literal + tests)
4. tricks.hbs view-toggle row trimmed
```

Each step is independently verifiable; the sequence can split into
2-3 small slices if preferred.

## Doctrinal safety

- **Safe**: no ontology changes, no Wave 2 commitments. Pure surface
  consolidation.
- **Care**: confirm Movement System anchor coverage matches every
  Component View anchor before deleting the view block (test pin
  catches missing anchors).
- **Out of scope**: any redesign of the four-axis Movement System
  structure itself.

## Review approval

Approve the retirement recommendation + Option A (plain removal, no
redirect). Implementation lands AFTER `movement_system_consolidation_
plan.md` ships.
