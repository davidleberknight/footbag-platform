# Category View Retirement Review

Covers brief Part 3 (Category View audit).

Supports `FINAL_RECOMMENDATION.md` cross-cutting recommendation CR-4.

This doc evaluates the current `?view=category` browse mode on
`/freestyle/tricks` against retention/retirement criteria and recommends
soft-retirement of the view toggle entry, mirroring the
already-shipped 2026-05-18 component-view retirement pattern. The
underlying `category` column on `freestyle_tricks` remains as a
filterable substrate; only the public browse mode retires.

---

## 1. Current state

### 1.1. Surface and routing

- Route: `/freestyle/tricks?view=category` (`src/routes/publicRoutes.ts`).
- Service shaping: `src/services/freestyleService.ts:3879` (category groups
  builder, in `getFreestyleTricksIndexPage`).
- View model field: `content.groups` is `FreestyleTrickGroup[]` (interface
  at `freestyleService.ts:1822`).
- Template render: `src/views/freestyle/tricks.hbs:216-234`.
- View toggle entry: `tricks.hbs:64-68` ("By category" link in the
  secondary toggle row).

### 1.2. Buckets

From `freestyleService.ts:3885` (`categoryOrder`) and the `CATEGORY_LABELS`
map at `:2349-2355`:

| Bucket | Source column | Label | Notes |
|---|---|---|---|
| `dex` | `freestyle_tricks.category` | "Dexterity" | Tricks anchored on dex motion (whirl, mirage, illusion, swirl, drifter, pickup, ...) |
| `body` | `freestyle_tricks.category` | "Body" | Body-primitive motion (spin, hop-over, walk-over, flying-inside, ...) |
| `set` | `freestyle_tricks.category` | "Set" | Bag-launch primitives (pixie, fairy, atomic, quantum, nuclear, ...) -- via modifier-type, not standalone trick rows |
| `compound` | `freestyle_tricks.category` | "Compound" | Anything composed (the bulk of canonical trick rows) |
| `other` | `freestyle_tricks.category` | (pass-through) | Residual; rare |
| `modifier` | `freestyle_tricks.category` | "Modifier" | Filtered out at service shaping (`freestyleService.ts:4227`); never user-visible |

### 1.3. Current template note copy

`tricks.hbs:218-220` already concedes the view's overlap:

> Grouped by grammatical role (dex / body / set / compound) -- the four
> building blocks of operational notation. For richer organization see
> By family or By movement system.

This is essentially an in-template hint that the view is weaker than its
alternatives. The user is encouraged to leave for a better view.

### 1.4. The component-view retirement pattern (already shipped 2026-05-18)

Mirror reference -- this is the pattern to replicate.

Retired view: `?view=component`. Audit doc:
`exploration/freestyle-public-coherence-wave-2026-05-18/component_view_retirement_audit.md`.

Retirement mechanics shipped (`tricks.hbs:144-164`):

- Toggle entry removed from view-toggle row.
- Route still resolves; view body still renders.
- Above the view body, a retirement notice (`<div
  class="component-view-retirement-notice">`) explains the retirement
  and directs the user to the canonical replacement (Movement System).
- A detail line clarifies that "this page still renders so bookmarks
  and external links keep resolving, but new discovery happens through
  Movement System."

Net effect: zero broken URLs, zero schema churn, gentle guidance.

---

## 2. Problem evidence (overlap analysis)

The brief calls Category View "weak" specifically on `dex`, `body`,
`compound`, `other`. Evidence:

### 2.1. `dex` bucket vs Family view

The `dex` bucket gathers tricks whose `category='dex'`. Most of these
are members of dex-anchored families: `whirl` family, `mirage` family,
`illusion` family, `swirl` family. The Family view (`?view=family`)
groups by `trick_family`, which encodes a richer relationship -- the
specific dex anchor, not just "is a dex trick."

A user choosing "By Category -> Dexterity" gets a flat list of all dex
tricks across families. The same user choosing "By Family" gets the
same set, structured into the actual canonical anchors. Family view
strictly dominates Category View on this bucket.

### 2.2. `body` bucket vs Movement System view

The `body` bucket gathers body-primitive tricks (`spin`, `hop-over`,
`walk-over`, `flying-inside`, `double-spin`, etc.). Movement System
view's "No-Plant & Suspension" axis surfaces the same conceptual cohort
with pedagogical grouping (Red-confirmed body primitives per the
`19_load_red_additions.py` Red-overlay loader).

The Body bucket is essentially an unordered dump; Movement System
applies axis structure.

### 2.3. `set` bucket vs the Set / Uptime axis

The `set` bucket overlap is more nuanced: `set` in the category column
typically refers to STALLS that anchor sets (toe-stall, heel-stall,
etc.) rather than the SET-PRIMITIVE modifiers (pixie, fairy, atomic).
The set-primitives don't live in the `freestyle_tricks.category='set'`
bucket -- they're modifier-type links via `freestyle_trick_modifier_links`.

Net: Category's `set` bucket and Movement System's `Set / Uptime` axis
describe DIFFERENT cohorts (anchors vs launchers). The Category bucket
is conceptually narrower than its label implies, and the label confuses
users who expect "Set" to mean pixie/fairy/atomic.

### 2.4. `compound` bucket: "everything composed"

This bucket holds most active canonical rows -- effectively "any
non-primitive trick." There is no informational density: a learner
clicking "By Category -> Compound" gets a long flat list of mixed
families, mixed modifiers, mixed mechanics. Every other browse view
serves this learner better.

### 2.5. `other` bucket

Residual. By inspection (post-rebuild), `other` typically holds zero
or near-zero rows. Not browse-worthy.

### 2.6. Quantitative redundancy

Practical observation: a learner picking any of the four bucket links
("Dexterity", "Body", "Set", "Compound") would be better served by:

- A dex trick lookup -> Family view.
- A body primitive lookup -> Movement System "No-Plant & Suspension"
  axis OR direct trick search.
- A set primitive lookup -> Movement System "Set / Uptime" axis OR
  glossary §6.
- A compound trick lookup -> ADD view (skill progression) OR Family
  view (lineage).

In every case, an existing alternative dominates.

---

## 3. Options considered

### Option A: Keep `?view=category` as-is

REJECTED. Brief Part 3 calls out the redundancy. Recon validates. The
in-template note already concedes the weakness. Maintaining the view
costs curator attention without proportional user value.

### Option B: Merge category buckets into Movement System view

REJECTED. The mapping isn't clean (per §2.1-2.4 above): `dex` maps to
Family view (different axis); `body` maps to Movement System
"No-Plant" axis (subset only); `set` maps to no clear destination
because the buckets describe different cohorts. Forcing a merge
creates ontology debris.

### Option C: Demote category to a hidden/dev-only surface

REJECTED partially. The view's current state is essentially this
already (the in-template note recommends users leave). A more explicit
demotion = retirement.

### Option D: Preserve only surfaces / components / body primitives

REJECTED for this slice. The brief lists this as an option to evaluate
("preserve only surfaces/components/body primitives"). Evaluation:

- Surfaces (clipper-as-surface, etc.) are already a separate facet per
  skill doctrine C ("family is NOT catch surface"). The `category`
  column doesn't carry surface information; recreating the view as
  surface-only would require new data or schema work, out of scope.
- Components (body / set / dex primitives) are already covered by
  Movement System's axes + glossary.
- Body primitives are the only narrow value-add: a curated view of
  base body motions. Could live on Movement System or glossary; doesn't
  warrant its own browse mode.

### Option E: Soft-retire matching the component-view pattern

RECOMMENDED. Mirror the shipped 2026-05-18 component-view retirement
exactly:

- Remove the "By category" toggle entry from the secondary toggle row
  (`tricks.hbs:64-68`).
- Add a retirement notice above the view body, pointing to Family +
  Movement System as the canonical replacements.
- Route still resolves; bookmarked URLs and external links keep
  working.
- Schema: no change. `freestyle_tricks.category` column stays as a
  filterable substrate (analytics, ADD-accounting, internal tooling
  may consume it).

This option preserves bookmark / link safety, costs minimal curator
attention, follows an already-proven pattern, and adds zero ontology
debt.

---

## 4. Recommended approach

### 4.1. Retire `?view=category` from the toggle UI

Apply the component-view retirement pattern (already shipped). Specific
changes:

- **Toggle row.** Remove the "By category" `<a>` from
  `tricks.hbs:64-68`. Keep the route handler in `publicRoutes.ts`.
- **Retirement notice.** Wrap the existing category-view block
  (`tricks.hbs:216-234`) with a retirement-notice paragraph above the
  in-template note. Notice copy (preliminary):

  > **This view is being retired.** The
  > [By Family](/freestyle/tricks?view=family) view groups dex-anchored
  > tricks by structural family, and the
  > [By Movement System](/freestyle/tricks?view=movement-system) view
  > groups body and set primitives by pedagogical axis. The grammatical
  > buckets (dex / body / set / compound) duplicate those organizations
  > with lower density.
  >
  > This page still renders so bookmarks and external links keep
  > resolving, but new discovery happens through Family and Movement
  > System.

- **In-template note** at `tricks.hbs:218-220` -- delete or relocate
  beneath the retirement notice. The retirement notice subsumes its
  content.

### 4.2. Preserve the substrate

- **`freestyle_tricks.category` column.** Stays. Continues to populate
  from the source CSVs (`tricks.csv`, `red_additions_2026_04_20.csv`).
  Analytics consumers + future ADD-accounting work may still depend on
  it.
- **Service shaping helper.** `freestyleService.ts:3879` (category
  groups builder) stays. View model field continues to populate so the
  retirement-noticed view renders content (not blank). The shaping
  helper can be marked deferred/retired in JSDoc but should not be
  deleted in this slice.
- **`CATEGORY_LABELS` map.** Stays. Same reason.
- **Modifier-row filter at `:4227`.** Stays. Same reason.

### 4.3. Defer to follow-on cosmetic sweep

Out of scope for this slice; recommended for a future cosmetic pass:

- CSS rule cleanup for `.trick-category-group` if the view's render
  eventually stops being reached.
- JSDoc retirement annotation on the category shaping helper.
- Decision on whether to delete the shaping helper entirely once a
  monitoring window confirms no inbound traffic (analogous to whatever
  monitoring David sets for the component view).

---

## 5. Implementation sketch

NOT actual code; enough detail to scope a slice.

### 5.1. Template

`src/views/freestyle/tricks.hbs`:

- **Lines 64-68.** Delete the secondary-toggle entry for "By category".
  Net: secondary toggle row contains only "Movement Neighborhoods"
  (currently "topology" pre-rename; see family-and-neighborhood doc).
- **Lines 216-234.** Wrap the existing block with:
  ```
  {{#if (eq content.activeView "category")}}
  <div class="category-view-retirement-notice" role="status" aria-live="polite">
    ... retirement notice copy ...
  </div>
  ... existing category-view block ...
  {{/if}}
  ```
  Note: the wrapping `{{#if (eq content.activeView "category")}}` is
  already in place; the notice goes immediately inside it.

### 5.2. Service shaping

No change to `freestyleService.ts` shaping. View-model continues to
populate `content.groups` for the category branch.

### 5.3. CSS

Add a `.category-view-retirement-notice` rule to
`src/public/css/style.css`, mirroring the existing
`.component-view-retirement-notice` rule.

### 5.4. Test impact

`tests/integration/freestyle.tricks-insights.routes.test.ts` -- check
for assertions on the existence of the "By category" toggle link.
Update if found. The route handler itself stays, so `?view=category`
GET returning 200 still holds; assert on the retirement-notice
presence in the response body.

### 5.5. Verification

- `/freestyle/tricks` -- toggle row no longer shows "By category"
  link. Verify `?view=add`, `?view=family`, `?view=movement-system`,
  `?view=topology` (still labelled "Movement Neighborhoods" post-rename
  per doc 6) still appear.
- `/freestyle/tricks?view=category` -- 200 OK; retirement notice
  renders above the grouped content; grouped content renders unchanged.
- Bookmarked `/freestyle/tricks?view=category#anchorId` URLs still
  resolve to the right section.

---

## 6. Curator decision points

- **(DECIDED at session-level)** Retire the toggle entry; preserve
  column substrate.
- **(DEFER)** Final retirement copy. Suggest mirroring the existing
  component-view retirement notice tone exactly. Curator may want to
  edit for specificity.
- **(DEFER)** Future deletion of the service shaping helper. Wait for
  a monitoring window (matching whatever David applied for the
  component view) before considering full removal.
- **(DEFER)** Whether to ever delete the `category` column. NOT
  recommended -- analytics consumers + future ADD-accounting may use
  it. Keep indefinitely.

---

## 7. Risks and mitigations

### 7.1. Risk: External links break

Mitigation: route handler stays; retirement notice explains; same
pattern as component-view retirement which has not broken any links.

### 7.2. Risk: Curator perceives the deletion of the toggle link as
data loss

It is not data loss. The shaping helper, view-model field, column, and
rendered content all stay. Only the *promoted discovery path* (the
toggle entry) is removed.

### 7.3. Risk: Test regressions

Bounded: assertion sweep for "By category" in test files. Likely 1-3
assertion updates.

### 7.4. Risk: The category view's `set` bucket users (looking for
stalls) lose a discovery path

This is the only legitimate concern. Stalls (toe-stall, heel-stall,
outside-stall, clipper-stall, etc.) are loaded by
`19_load_red_additions.py` and carry `category='set'`. A user looking
specifically for "what stalls exist" currently uses the Category view.

Mitigation options (none required in this slice; surface for curator):

- Movement System view's "Set / Uptime" axis can absorb stalls as a
  subsection. This is the brief's Part 2 question and is addressed in
  `footbag_sets_architecture.md`.
- Glossary §6 (modifier feel cards) can carry a stall-anchor section.
- The trick-detail page for each stall already exists.

Bookmark continuity preserves the worst case: `?view=category` still
renders even after retirement; the user with that bookmark continues
to see stalls grouped under "Set". Net user impact is zero.

### 7.5. Risk: Future ADD-accounting rollout needs the category column

NOT a risk -- the column stays. The rollout can read it freely.

### 7.6. Risk: Surface inconsistency with the component-view pattern

NOT a risk -- this proposal mirrors the existing pattern explicitly.

---

## 8. Out of scope

- Modifying any other browse mode.
- Schema changes (`category` column stays).
- Service shaping removal.
- CSS rule cleanup for retired view classes (defer to cosmetic sweep).
- Any change to the source-of-truth CSVs (`tricks.csv`,
  `red_additions_2026_04_20.csv`).
- Any change to stall-anchor discovery paths (curator-paced; see
  `footbag_sets_architecture.md`).

---

## 9. Cross-references

- `FINAL_RECOMMENDATION.md` -- CR-4 cross-cutting recommendation.
- `exploration/freestyle-public-coherence-wave-2026-05-18/component_view_retirement_audit.md`
  -- pattern reference (already shipped).
- `footbag_sets_architecture.md` -- stall-anchor discovery; what
  happens to the `set` category bucket's user value.
- `dictionary_landing_page_plan.md` -- landing-card structure absorbs
  the discovery paths that Category previously served (Family +
  Movement System cards both linked from landing).

---

## 10. Summary

Apply the soft-retirement pattern already shipped for `?view=component`
on 2026-05-18 to `?view=category`. Remove the toggle entry; add a
retirement notice; preserve route + view-model + column. Mirrored
implementation, zero schema churn, zero broken bookmarks. Brief Part 3
satisfied.
