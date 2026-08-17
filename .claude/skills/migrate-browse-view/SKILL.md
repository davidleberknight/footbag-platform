---
name: migrate-browse-view
description: Add or change a dictionary browse view (any `?view=` surface) on the shared `<dictionary-trick-row>` partial. Use when a task adds a new browse view, moves a legacy view off inline markup, or changes grouping or ordering on an existing one. Preserves the row contract, which is mechanically tested across every browse view.
---

# Migrate Browse View

## When to use this skill

Use this skill (not general editing) when a task does any of the following:

- Adds a new browse view at `/freestyle/tricks?view={new}`
- Moves an existing browse view off legacy markup (table, spreadsheet, inline `<li>` rows) onto the shared `<dictionary-trick-row>` partial
- Renames a view (the historical `?view=sets → ?view=component` is the precedent)
- Adds a new grouping wrapper that consumes existing `DictionaryTrickCard[]` data
- Changes within-group ordering rules for any browse view

Do **not** use this skill to:
- Modify the `<dictionary-trick-row>` partial itself. That changes every browse view at once, so it is a row-contract change: route through `extend-service-contract` + `add-public-page`
- Touch ontology, ADD math, parser, alias, or schema (forbidden across every browse-view change)
- Add new modifier-link types or new symbolic-grammar groups (curator-track work)

## The pattern this skill encodes

Every browse view in the `allowedViews` set in `src/services/freestyleService.ts` renders the same
row. There is no per-view density choice and no view-specific row variant: a trick reads the same
way whichever view a visitor arrived through, and that is the whole point. A view that grows a
rendering of its own is the defect this skill exists to prevent.

```
Step 1 → READ the row contract and one shipped view   (no writing yet)
Step 2 → SERVICE: group type + builder
Step 3 → TEMPLATE: grouping wrapper around the shared row
Step 4 → CSS: group-wrapper level only
Step 5 → TESTS: per-view integration test + the shared guard
Step 6 → VERIFY and hand off
```

## Step 1: Read the contract before writing

- `src/views/partials/dictionary-trick-row.hbs`: the shared partial every view renders. Its header
  comment is the row contract: two columns, what a row may carry, and what it may never carry.
- `tests/integration/freestyle.browse-row-contract.routes.test.ts`: the guard that pins that
  contract across every view. Read it before changing a view; it is what will fail if the change
  breaks uniformity.
- One shipped view whose shape resembles the new work, read in `src/views/freestyle/tricks.hbs`:
  By modifier for cluster-then-group nesting, By family for banded sub-groups, By component for
  axis-then-group nesting, Movement System for progressive disclosure.
- The existing group type for the view being changed (`FreestyleTrickAddGroup`,
  `FreestyleFamilyGroup`, `FreestyleTrickGroup`, `ComponentGroup`, `TopologyGroup`).

A new browse view needs curator approval before it joins `allowedViews`. That is a decision for the
human, not something this skill authorises.

## Step 2: The service group type and builder

A group type carries its identity, its label, its anchor, and its rows:

```ts
export interface FreestyleSomeGroup {
  label:     string;
  anchorId:  string;                    // `{view}-{slug}`: used in template ids
  cards:     DictionaryTrickCard[];     // the shared row view-model, ADD ascending then name
}
```

Build it from sorted rows, shaping each row through the one helper:

```ts
const buildGroup = (key: string, rows: FreestyleTrickRowWithStatus[]): FreestyleSomeGroup => {
  const sorted    = rows.slice().sort(/* per-view ordering rule */);
  const indexRows = sorted.map(r => shapeTrickIndexRow(r, ctx));
  return {
    label:    labelFor(key),
    anchorId: `{view}-${key}`,
    cards:    sorted.map((r, i) => shapeDictionaryTrickCard(r, indexRows[i]!, ctx)),
  };
};
```

For a brand-new view, add a `*BrowseView` interface in `freestyleService.ts`, add the view key to
`FreestyleTricksActiveView` and `allowedViews`, and add the view model to
`FreestyleTricksIndexContent`. `ComponentBrowseView` is the multi-axis precedent;
`TopologyBrowseView` is the single-axis observational one.

### Required invariants (every browse view)

- **Sort within groups: ADD ascending, then trick name alphabetical.** Documented per-view
  exceptions: the family view puts the family anchor first, then ADD ascending; the component view
  orders its groups by priority then alphabetically, while rows inside a group keep ADD-then-name.
- **Empty groups hidden** via an `entries.length > 0` filter. A per-view exception needs curator
  approval.
- **Modifier-stub rows excluded** at the row-filtering step. Modifier rows are foreign-key targets,
  not public tricks, and never render on a browse view.
- **Rows built via `shapeDictionaryTrickCard()`.** Never inline the shaping, never bypass the helper.
- **`FreestyleTrickRowWithStatus`** is the row type the shaper needs; the operational-notation column
  lives there, not on the base `FreestyleTrickRow`.
- **Browse builders filter to active rows.** An inactive row never reaches a browse view, so any
  branch keyed on an inactive-only state is unreachable there and must not be written.

## Step 3: The template branch wraps the shared row

In `src/views/freestyle/tricks.hbs`, each view is a `{{#if (eq content.activeView "...")}}` branch.
The branch owns grouping, headings and prose; the row owns everything inside a row:

```handlebars
{{#if (eq content.activeView "{view}")}}
{{#each content.{viewModel}}}
<section class="content-section trick-{view}-group" id="{{anchorId}}">
  <div class="section-heading">
    <h2><a href="/freestyle/tricks?view={view}#{{anchorId}}">{{label}}</a></h2>
    <span class="section-count">{{cards.length}}</span>
  </div>
  {{#if bodyDefinition}}
  <p class="{view}-group-definition">{{bodyDefinition}}</p>
  {{/if}}
  <div class="dict-trick-row-stack">
    {{#each cards}}
      {{> dictionary-trick-row}}
    {{/each}}
  </div>
</section>
{{/each}}
{{/if}}
```

### Template rules (load-bearing)

- **One heading system.** A group heading is the site `.section-heading` with an `<h2>` (or `<h3>`
  for a sub-group) and a `.section-count` chip. Never a per-view heading class: a view with its own
  heading treatment fails uniformity exactly as a view with its own row would.
- **Static URL prefixes only.** Write a `?view=` href as a static prefix with slug-only
  interpolation: `href="/freestyle/tricks?view={view}#{view}-{{slug}}"`. Handlebars escapes `=` to
  `&#x3D;` when the whole URL is interpolated through one mustache, and tests asserting the URL fail.
- **Section ID format `{view}-{slug}`.** Anchor IDs are public API. Never rename one without
  updating every cross-link in the same change.
- **Heading wraps the label in a self-anchored link**, so a reader can copy a deep link to a group.
- **Update the view toggle** unless the view is deliberately unlisted. A renamed view also needs
  server-side alias resolution in the service.
- **No row-internal markup.** The template never renders a name, difficulty value, hashtag, control
  or notation itself. That is the partial's job.

## Step 4: CSS at the group-wrapper level only

The row has stable CSS (`.dict-trick-row`, `.dict-trick-row-identity`, `.dict-trick-row-notation`).
A view adds CSS only for:

- The group-wrapper class (`.trick-{view}-group`), including its `scroll-margin-top`
- Any one-line definition rendering
- Framing prose or footer styling if the view is observational

Do **not** touch:
- `.dict-trick-row*` rules
- `.dict-trick-row-stack`
- `.op-token--*` rules
- `.section-heading` or `.section-count`
- Any rule shared across browse views

Use `var(--anchor-offset)` for a group's `scroll-margin-top`, never a literal. The site header is
sticky and its height changes at the 768px breakpoint, so a literal offset lands the heading behind
the header at one width or the other.

If the new CSS exceeds ~40 lines, the change is probably reshaping the row: that is out of scope.

## Step 5: Tests

Each view ships a focused integration test at
`tests/integration/freestyle.{view}-view.routes.test.ts` covering:

1. **Route + view toggle**: returns 200; the view's toggle entry is active (or deliberately absent)
2. **Grouping wrapper**: anchor IDs render; the heading carries its self-anchor link and count chip
3. **Heading system**: the group heading uses `.section-heading`, so a bespoke one cannot creep back
4. **Within-group ordering**: assert the sort with an example spanning three or more ADD values
5. **Empty-group hiding**: groups with zero members render no anchor
6. **Intentional duplication** where a trick can appear in several groups (component, topology)
7. **Row contract**: the view renders `dict-trick-row-stack` and at least one `data-trick-slug=`

Then add the view to the shared guard in
`tests/integration/freestyle.browse-row-contract.routes.test.ts`, which loops every browse view and
asserts the row markup, the control-separation rule and the alias slot. There is no exclusion list
and no view may be added to one.

`tests/integration/freestyle.browse-row-rendering.routes.test.ts` holds the cross-view rendering
contracts (required row slots, sparse and deep tricks through one template, group placement, no
authoring status, no accounting prose). Update it when a change affects what a row renders anywhere.

If moving off legacy markup, find the old assertions for that view, most likely in
`tests/integration/freestyle.tricks-insights.routes.test.ts`, and update or retire them.

### Test seeding requirements

- Modifier links: `insertFreestyleTrickModifier` + `insertFreestyleTrickModifierLink`, required when
  membership depends on links (component, topology, set, modifier, movement-system).
- Operational notation: set `operational_notation` on seeded tricks so the row renders role-tagged
  token spans; the stack assertion alone only checks the wrapper.
- Anchor coverage: seed at least one trick per group you assert renders.
- A view whose groups this fixture does not populate renders its empty state, so assert the positive
  only for views the fixture actually fills.

## Step 6: Verify and hand off

- `npm run build`: clean.
- The view's own suite, the shared row-contract guard, and the cross-view rendering suite, named
  explicitly.
- `npm run test:pre-pr` as the gate, since the row partial and the row view-model are shared.
- Every new assertion demonstrated red before it goes green.
- A view change is UI work: run `./run_dev.sh` and read the view in a browser beside a neighbouring
  view at desktop and at 480px, confirming row rhythm, heading weight, count-chip treatment and the
  controls all match. The stylesheet is read once at boot and memoized, so a CSS edit needs a restart
  to be visible.
- List the changed files for the human to stage. Claude never stages, commits or pushes.

## Constraints (every browse-view change)

The change MUST NOT:

- Modify the `<dictionary-trick-row>` partial
- Give one view a row, heading, or density of its own
- Add ontology / ADD / parser / alias / schema changes
- Introduce a new modifier-link type or new symbolic-grammar group (curator track)
- Bypass `shapeDictionaryTrickCard()` for row construction
- Render row-internal markup inline in the template
- Introduce per-view CSS that affects shared row rules
- Render authoring status on a browse row: no incomplete badge, no pending placeholder, no
  decomposition-under-review pill. A row renders notation when it exists and nothing otherwise;
  status lives on the trick detail page
- Add a new browse view without curator approval

## Naming convention

- View key: lowercase, hyphenated when compound (`add`, `family`, `set`, `category`, `modifier`,
  `component`, `topology`, `movement-system`, `dex-count`)
- URL: `/freestyle/tricks?view={key}`
- Anchor ID: `{key}-{slug}` for groups; `axis-{name}` for sub-axes
- Group wrapper class: `.trick-{key}-group`
- Group-internal classes: `.{key}-group-{element}` (for example `-definition`)

## Observational vs canonical view check

Before adding a new view, decide its layer:

- **Canonical view** (ADD, family, category, set): groups derived from canonical columns. No framing
  needed beyond an ordinary intro.
- **Observational view** (component, topology, movement-system, future symbolic axes): groups
  derived from observational data such as modifier links or curator-tagged bases. Required: a
  status label at the top of the view stating in plain words that it is exploratory and not an
  official grouping, and a closing footer cross-referencing the canonical view.

The shipped conventions are `<p class="browse-view-status-label">` for the label and
`<p class="symbolic-layer-footer">` for the footer. The `symbolic-layer-badge` chip belongs to the
trick-detail and glossary surfaces, not to a browse view.

## Cross-references

- `src/views/partials/dictionary-trick-row.hbs`: the row contract; never modified here
- `tests/integration/freestyle.browse-row-contract.routes.test.ts`: the uniformity guard
- `tests/integration/freestyle.browse-row-rendering.routes.test.ts`: cross-view rendering contracts
- `src/views/freestyle/tricks.hbs`: every view's grouping branch
- `.claude/rules/view-layer.md`: the site's action hierarchy, section systems and CSS vocabulary
