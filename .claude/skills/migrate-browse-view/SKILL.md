---
name: migrate-browse-view
description: Migrate one dictionary browse view (any `?view=` surface) onto the shared `<dictionary-trick-card>` partial. Use when a task adds a new browse view or moves a legacy view off inline markup. Preserves the card-uniformity contract (mechanically tested across all browse views).
---

# Migrate Browse View

## When to use this skill

Use this skill (not general editing) when a task does any of the following:

- Adds a new browse view at `/freestyle/tricks?view={new}`
- Migrates an existing browse view off legacy markup (table, spreadsheet, inline `<li>` rows) onto the shared `<dictionary-trick-card>` partial
- Renames a legacy view (e.g., the historical `?view=sets → ?view=component` precedent)
- Adds a new grouping wrapper that consumes existing `DictionaryTrickCard[]` data
- Changes within-group ordering rules for any browse view

Do **not** use this skill to:
- Modify the `<dictionary-trick-card>` partial itself (that's a card-spec change; route through `extend-service-contract` + `add-public-page`)
- Touch ontology, ADD math, parser, alias, or schema (forbidden across every browse-view slice)
- Add new modifier-link types or new symbolic-grammar groups (curator-track work)

## The pattern this skill encodes

Every browse view shipped to date (`add`, `family`, `category`, `sets`, `component`, `topology`, `movement-system`, `dex-count`) follows the same six-step recipe. The contract is mechanically tested by `freestyle.dictionary-trick-card.routes.test.ts`: any view that fails to render `dict-card-stack` fails the regression guard.

```
Step 1 → READ existing patterns          (no writing yet)
Step 2 → SERVICE: extend group type + builder
Step 3 → TEMPLATE: replace markup with partial
Step 4 → CSS: minimal additions (no card-internal CSS)
Step 5 → TESTS: per-slice integration test
Step 6 → REPORT: slice implementation report
```

## Step 1: Read the precedent before writing

Read the most recent migration's report so the new slice matches established conventions. Skim, don't deeply read:

- `exploration/dictionary-symbolic-card/UNIFIED_DICTIONARY_VIEW_PLAN.md`: the architectural target every migration approaches
- `exploration/dictionary-symbolic-card/SYMBOLIC_CARD_SPEC.md`: the partial's contract (do NOT modify; consume only)
- The most recent slice's report in `exploration/dictionary-symbolic-card/` (e.g., `DSC2_COMPONENT_VIEW_SLICE3A_REPORT.md`, `DSC2_CATEGORY_VIEW_SLICE3B_REPORT.md`, `DSC2_TOPOLOGY_VIEW_REPORT.md`): for the most up-to-date precedent
- `src/views/partials/dictionary-trick-card.hbs`: the shared partial all views render
- The existing group type for the view being migrated (e.g., `FreestyleTrickAddGroup`, `FreestyleFamilyGroup`, `FreestyleTrickGroup`, `ComponentGroup`, `TopologyGroup`): to see how prior slices extended their group types

If migrating a brand-new view, also read `exploration/dictionary-symbolic-card/SEMANTIC_NAVIGATION_STRATEGIC_REVIEW.md` for background: a new browse view needs curator approval before it is added to the current set.

## Step 2: Extend the service group type + builder

Two patterns to follow exactly:

### 2a. Existing-view migration (off legacy markup)

Extend the existing group interface with two fields:

```ts
export interface FreestyleSomeGroup {
  // ... existing fields stay ...
  tricks: FreestyleTrickIndexRow[];   // legacy; preserved for backward compat
  // NEW:
  cards: DictionaryTrickCard[];
  anchorId: string;                    // `{view}-{slug}`: used in template ids
}
```

Then refactor the group-construction code so it emits both `tricks` (legacy) and `cards` (new) in parallel:

```ts
const buildGroup = (key: string, rows: FreestyleTrickRowWithStatus[]): FreestyleSomeGroup => {
  const sorted = rows.slice().sort(/* per-view ordering rule */);
  const indexRows = sorted.map(r => shapeTrickIndexRow(r, ctx));
  return {
    // ...
    tricks: indexRows,
    cards:  sorted.map((r, i) => shapeDictionaryTrickCard(r, indexRows[i]!)),
    anchorId: `{view}-${key}`,
  };
};
```

### 2b. New-view introduction

Add a fresh `*BrowseView` interface in `freestyleService.ts`. Build it alongside existing view shapes. Add the new view key to `FreestyleTricksActiveView` and `allowedViews`. Add it to `FreestyleTricksIndexContent`. Reference precedents:
- `ComponentBrowseView` (slice 3A): multi-axis with priority ordering
- `TopologyBrowseView` (topology slice): single axis, observational-layer attribution

### Required invariants (every browse view)

- **Sort within groups: ADD ascending, then trick name alphabetical** (unless an explicit per-view exception is documented: family view uses "anchor first then ADD asc"; component view uses "priority order then alphabetical fallthrough" for groups but ADD-asc-then-name within groups)
- **Empty groups hidden** via `entries.length > 0` filter (every shipped view; explicit per-view exceptions require curator approval)
- **Modifier-stub rows excluded** at the row-filtering step (modifier rows are FK targets, not public tricks; they never render on browse views)
- **Cards built via `shapeDictionaryTrickCard()`**: do NOT inline card shaping; do NOT bypass the helper
- **`FreestyleTrickRowWithStatus`** is the row type the card builder needs (operational_notation column lives there, not on the base `FreestyleTrickRow`)

## Step 3: Replace the template branch with the shared partial

In `src/views/freestyle/tricks.hbs`, locate the existing `{{#if (eq content.activeView "...")}}` branch for the view (or add a new branch for a fresh view). Replace inline markup with:

```handlebars
{{#if (eq content.activeView "{view}")}}
{{#each content.{viewModel}}}
<section class="content-section trick-{view}-group" id="{{anchorId}}">
  <div class="section-heading">
    <h2><a href="/freestyle/tricks?view={view}#{{anchorId}}">{{label}}</a></h2>
    <span class="section-count">{{cards.length}}</span>
  </div>
  {{#if bodyDefinition}}
  <p class="trick-{view}-group-definition">{{bodyDefinition}}</p>
  {{/if}}
  <div class="dict-card-stack">
    {{#each cards}}
      {{> dictionary-trick-card}}
    {{/each}}
  </div>
</section>
{{/each}}
{{/if}}
```

### Template gotchas (load-bearing)

- **Static URL prefixes only.** When building `href` values that contain `?view=...`, write the URL as a static template prefix with slug-only interpolation: `href="/freestyle/tricks?view={view}#{view}-{{slug}}"`. Handlebars HTML-escapes `=` to `&#x3D;` when interpolated as part of a single mustache value; tests asserting the URL will fail. The static-prefix convention is used in every shipped view.
- **Section ID format: `{view}-{slug}`.** Anchor IDs are public API: once shipped, never rename without coordinated cross-link updates.
- **Heading wraps the label in a self-anchored `<a>` link.** Lets users copy a deep-link to a specific group.
- **Update the view toggle.** Add a new `<a href="/freestyle/tricks?view={view}">By {view}</a>` entry to the toggle nav at the top of `tricks.hbs`. If the view is a rename of an existing view, also add server-side alias resolution in the service (`{old} → {new}`).
- **No card-internal markup.** The template never directly renders title / ADD / operational notation / aliases. That's the partial's job.

## Step 4: CSS additions only at the group-wrapper level

The card itself has stable CSS (`.dict-card`, `.dict-card-title`, etc.). The slice adds CSS only for:

- The group-wrapper class (`.trick-{view}-group`)
- The group heading variant if needed
- Any one-line definition rendering (`.trick-{view}-group-definition`)
- Observational-layer styling if the view is observational (badge + footer)
- Mobile media-query adjustments (single-column under 640px)

Do **not** touch:
- `.dict-card` rules
- `.dict-card-stack` rules
- `.op-token--*` rules
- Any rule shared across browse views

If the new CSS exceeds ~80 lines, the slice is probably reshaping the card itself: that's out of scope; route to a card-spec change.

## Step 5: Tests

Each browse-view slice ships a focused integration test file at `tests/integration/freestyle.{view}-view.routes.test.ts`. The test file covers:

1. **Route + view toggle**: returns 200; "By {view}" is the active toggle entry
2. **Grouping wrapper structure**: anchor IDs render; heading-wrapped self-anchor link present; count chip present
3. **Within-group ordering**: verify ADD-asc-then-name sort (or the view-specific rule); pick an example with 3+ tricks at different ADD values to assert ordering
4. **Empty-group hiding** (when applicable): assert that groups with zero members do NOT render their anchor
5. **Intentional duplication** (when applicable): for views where a trick can appear in multiple groups (component, topology), verify multi-group rendering
6. **Card-density contract**: verify the view renders the density it implements (`dict-card-stack` for card-density views, `dict-trick-row` for two-line views, `compact-list` for sets) and at least one `data-trick-slug=` attribute (the partial's identity marker)
7. **Observational-layer attribution** (when applicable): for observational views, verify the badge + footer render

Then update `tests/integration/freestyle.dictionary-trick-card.routes.test.ts`:

```ts
it('the dict-card-stack browse views use the shared dictionary-trick-card partial', async () => {
  // Card-density views render the shared card. Two-line views (?view=add, family)
  // render dict-trick-row; ?view=sets uses compact-list; ?view=topology asserts
  // NOT dict-card-stack. A new view joins whichever density contract it implements.
  for (const view of ['category', 'component']) {
    const res = await request(createApp()).get(`/freestyle/tricks?view=${view}`);
    expect(res.status).toBe(200);
    expect(res.text, `${view} must render dict-card-stack`).toContain('dict-card-stack');
  }
});
```

If migrating off legacy markup, also locate the OLD assertions for that view (most likely in `tests/integration/freestyle.tricks-insights.routes.test.ts`) and update or retire them: they'll be testing markup that no longer exists.

### Test seeding requirements

- Modifier links: use `insertFreestyleTrickModifier` + `insertFreestyleTrickModifierLink`. Required when the view's membership depends on links (component, topology).
- Operational notation: set `operational_notation: '[clip] > ...'` on seeded tricks so the card renders role-tagged token spans (the test for "renders dict-card-stack" only checks the wrapper; richer assertions require populated notation).
- Anchor coverage: seed at least one trick per group you want to assert is rendered.

## Step 6: Slice implementation report

Produce a report at `exploration/dictionary-symbolic-card/DSC2_{VIEW}_VIEW_REPORT.md` (or `DSC2_{VIEW}_VIEW_SLICE{NUM}_REPORT.md`). The report covers:

1. **Before / after**: describe what the legacy rendering looked like and what the new structure is
2. **Within-group ordering**: explicit ordering rule + verification reference
3. **Files changed**: table of files + delta line counts
4. **Tests passed**: new test count + full-suite pass count + tsc clean
5. **Activation matrix** (when applicable): for views with priority/curator-tagged groupings (component, topology), list each group + status
6. **Known visual concerns / curator follow-ups**: non-blocking gaps
7. **Constraints honoured**: explicit list of no-schema / no-ontology / etc.
8. **Recommendation for next slice**: which view to migrate next, why
9. **Stop confirmation**: "stopping after this slice per the slice cadence"

Reports for prior slices are the format-of-truth: `DSC2_ADD_VIEW_IMPLEMENTATION_REPORT.md`, `DSC2_FAMILY_VIEW_IMPLEMENTATION_REPORT.md`, `DSC2_COMPONENT_VIEW_SLICE3A_REPORT.md`, `DSC2_CATEGORY_VIEW_SLICE3B_REPORT.md`, `DSC2_TOPOLOGY_VIEW_REPORT.md`.

## Step 7: Stage and hand off

Run:
- `npx tsc -p tsconfig.json --noEmit`: must be clean
- `npx vitest run --exclude "tests/e2e/**" --exclude "tests/smoke/**"`: full suite green
- `git add` the changed files (services / templates / CSS / tests / report)
- Surface the commit command to the user (Claude never commits; the human owns commits)

## Constraints (every browse-view slice)

The slice MUST NOT:

- Modify the `<dictionary-trick-card>` partial itself
- Add ontology / ADD / parser / alias / schema changes
- Introduce a new modifier-link type or new symbolic-grammar group (curator track)
- Bypass `shapeDictionaryTrickCard()` for card construction
- Render card-internal markup inline in the template
- Introduce per-view CSS that affects shared card rules
- Skip the operational-notation rendering (cards must show notation tokens OR the "Notation pending" placeholder)
- Add a new browse view without curator approval (the current set is eight; see `SEMANTIC_NAVIGATION_STRATEGIC_REVIEW.md` for background)

## Naming convention

- View key: lowercase single word (`add`, `family`, `category`, `component`, `topology`)
- URL: `/freestyle/tricks?view={key}`
- Anchor ID format: `{key}-{slug}` for groups; `axis-{name}` for sub-axes when applicable
- Group wrapper class: `.trick-{key}-group`
- CSS group-internal classes: `.trick-{key}-group-{element}` (e.g., `-heading`, `-definition`)

## Observational vs canonical view check

Before adding a new view, decide its layer:

- **Canonical view** (ADD, family, category): groups derived from canonical columns (`adds`, `trick_family`, `category`). No badge required.
- **Observational view** (component, topology, future symbolic axes): groups derived from observational data (modifier links, curator-tagged bases, symbolic-grammar CSVs). Required: observational badge + footer; framing prose at top; cross-reference to canonical view in the footer ("does not override canonical IFPA family classifications").

Observational badge convention: `<span class="symbolic-layer-badge" title="...">observational</span>`. Footer convention: `<p class="symbolic-layer-footer">...</p>`.

## Cross-references

- `exploration/dictionary-symbolic-card/SYMBOLIC_CARD_SPEC.md`: the partial's contract
- `exploration/dictionary-symbolic-card/UNIFIED_DICTIONARY_VIEW_PLAN.md`: the architectural target
- `exploration/dictionary-symbolic-card/SEMANTIC_NAVIGATION_STRATEGIC_REVIEW.md`: background on the semantic-navigation architecture and the curator-approval gate for adding a browse view
- `src/views/partials/dictionary-trick-card.hbs`: the shared partial; never modify in a browse-view slice
- `tests/integration/freestyle.dictionary-trick-card.routes.test.ts`: the card-uniformity regression guard
