# Anchor Family Page — Implementation Slice Scope

Scope plan for the anchor family pages ruled in `ARCHITECTURE.md` §6a: dictionary- and
family-navigation-accessible pages for **Toe Stall** and **Clipper Stall**, in an anchor
variant that teaches what the stall is and what grows from it **without a giant descendant
roster inline.** This is a scope/plan only — no code is written here, no production data
changes. It is grounded in a read-only map of the currently deployed freestyle surface.

## Deployed-surface baseline (what exists today)

- **Family pages are live** at `/freestyle/families/:slug` — `freestyleController.familyDetail`
  → `freestyleService.getFamilyDetailPage` (`freestyleService.ts:10216`) → template
  `freestyle/family-detail.hbs`. The view-model is `FreestyleFamilyDetailContent` (member
  links, variant groups, teaching block, sibling families, breadcrumbs).
- **Toe Stall and Clipper Stall deliberately 404 there.** They are listed in
  `FOUNDATIONAL_TERMINAL_SURFACES` (`freestyleFamilyTiers.ts:41-44`), so `isOfficialFamilyParent`
  returns false and `getFamilyDetailPage` returns null → 404. The JSDoc there states they
  are intentionally "too broad to teach as a lineage" — which is exactly the problem §6a's
  anchor variant is designed to solve.
- **"What lands on toe / clipper" exists today only on the trick page.** On
  `/freestyle/tricks/toe_stall` the terminal cohort renders via curated
  `TERMINAL_DERIVED_COHORTS` (`freestyleTerminalCohorts.ts:25`), partial
  `trick-terminal-derived.hbs`. This cohort is an **editorial subset**, not a DB query over
  a terminal column.
- **A full descendant list has no home.** The dictionary filter `/freestyle/tricks?family=<slug>`
  groups by `trick_family`; toe/clipper are not a `trick_family` value, so there is no
  existing route that lists "every trick that lands on toe." Any true full enumeration would
  need a new filter or a terminal-classification data pass.

## The core data-truth boundary (read before scoping the "full list" link)

There is **no stored fact** for "every trick that terminates on toe/clipper." The only
machine-available set is the curated `TERMINAL_DERIVED_COHORTS` editorial list. So "the full
filtered trick list" in §6a's template means, for this slice, **the complete curated
terminal cohort** — not a structural enumeration of all descendants. A true enumeration
would require classifying every trick's terminal atom into a queryable column, which is a
separate data slice and is **out of scope here.** This slice ships the honest set we have
and labels it as curated, rather than implying a completeness the data cannot back.

## Slice scope — what this builds

Additive, projection-first (no new schema, no ontology change), reusing the family-page
infrastructure.

1. **Route + controller.** Keep the existing `/freestyle/families/:slug` route. In
   `freestyleController.familyDetail`, branch: if the slug is an anchor surface (toe_stall,
   clipper_stall) call the new anchor path; otherwise the existing `getFamilyDetailPage`.
   No new route string; the two anchor slugs simply stop 404-ing.

2. **Service method + view-model.** New `getAnchorFamilyPage(slug)` returning
   `PageViewModel<FreestyleAnchorFamilyContent>`. It bypasses the
   `FOUNDATIONAL_TERMINAL_SURFACES` exclusion for these two slugs only, and shapes the
   anchor view-model (below). It reuses the existing card-shaping helpers
   (`DictionaryTrickCard`) and the terminal cohort as its member source, not `trick_family`
   grouping. All hrefs and labels computed in the service (view-layer rule).

3. **Anchor view-model (the §6a template, one field per ruled bullet):**
   - `whatItIs` — curated prose: what the stall is.
   - `whyItAnchors` — curated prose: its role as a foundational parent.
   - `howItDiffers` — curated prose: an anchor, not a tidy descendant list.
   - `routesThrough` — a small set of **categories** (kinds of tricks that route through it),
     not an enumeration.
   - `representativePathways` — a small, capped, curated set (target 4–8) of exemplar
     pathways, each a card + one-line why.
   - `growsInto` — service-computed links to the major families and example tricks that grow
     from it (e.g. clipper → butterfly, whirl; each an href to its family page).
   - `fullListHref` — a single link to the complete curated cohort (see item 5).
   No full member array is placed on the view-model — the anti-roster guard is structural,
   not just a template choice.

4. **Template.** New `freestyle/family-anchor.hbs` (a distinct template rather than a mode
   flag on `family-detail.hbs`, because the content shape differs materially: no member
   roster, has categories + pathways + full-list link). Composes from the shared primitives
   and existing `style.css` classes; no per-page chrome; em-dash-free copy that leads with
   plain orientation, not a count.

5. **The "full list" link.** Add a `?terminal=<slug>` filter to the existing tricks index
   (`getFreestyleTricksIndexPage`), backed by the curated cohort (`TERMINAL_OF_MEMBER`), so
   the complete curated set renders in the standard long-list view the index already
   provides. Copy on that filtered state self-orients ("Tricks that land on the toe stall")
   and is labelled as the curated set. This is the one small addition beyond the anchor page
   itself.

6. **Content module (curated, editorial).** New `src/content/freestyleAnchorFamilies.ts`
   holding the two anchors' prose, categories, and pathway/grows-into selections. Editorial
   and curator-owned; consistent with the Toe Stall / Clipper Stall glossary entries. No DB
   rows.

7. **Navigation attach points** (all service-computed hrefs):
   - `trick-terminal-derived.hbs` — the toe/clipper trick pages already render the cohort;
     add a "full anchor page" link there.
   - The By-family browse view (`/freestyle/tricks?view=family`) — surface the two anchor
     surfaces as reachable.
   - The glossary foundational-terminal tier group (`buildFamilyCardTierGroups`) — link the
     two anchor pages from their existing tier card.

## View-layer / rules compliance checklist

- Returns `PageViewModel<TContent>`; service owns every href, label, boolean; template only
  renders.
- Single mapping site: reuse `CATEGORY_LABELS`, `STATUS_LABELS`, `FAMILY_TIER_LABEL` — invent
  no new display labels in the template.
- Projection over extension: no schema, no ontology change; the anchor page is a projection
  of existing atoms + the curated cohort.
- Hashtag/name/Trick-Detail remain three distinct controls; trick names are plain text;
  hashtags link to media only when media exists.
- Copy standard: plain-language orientation first, no raw-count openers, no em dashes,
  filtered states self-orient.
- Disclosure not auth-gating: the anchor page is fully public.

## Tests

- New `tests/integration/freestyle.family-anchor.routes.test.ts` — sibling of
  `freestyle.family-detail.routes.test.ts`: asserts **200** for `/freestyle/families/toe_stall`
  and `/freestyle/families/clipper_stall` (where today it is 404), the anchor sections
  render, and — the anti-roster guard — the page renders at most the capped representative
  set and does **not** enumerate the full cohort inline.
- Keep `freestyle.trick-terminal-derived.routes.test.ts` green: the trick-page cohort must
  still render (the anchor page is additive, not a migration of that section).
- The `?terminal=` filtered index gets a case in the tricks-index route test (200, correct
  self-orienting copy, curated set).
- Sitemap: add the two anchor slugs to `listSitemapFamilySlugs` (they are excluded today)
  with a matching sitemap assertion.

## Explicitly out of scope

- Any schema or data change, including a terminal-classification column for true descendant
  enumeration (deferred; the slice ships the curated cohort as the full set).
- The `/freestyle/bases/:slug` Foundational-Skill pages (a separate possible graduation).
- Promoting ATW or Rake into the top family layer (§6a: they stay minor).
- A global depth toggle, rev_swirl, blurry scoring, or any Glossary V2 entry rendering — this
  slice is a dictionary/family-nav feature and does not depend on the Glossary V2 migration.

## Open decisions for James (recommendations inline; none blocking the plan)

1. **"Full list" meaning.** Recommend the curated cohort via `?terminal=`, deferring a true
   terminal enumeration to a later data slice. Confirm this is the intended completeness for
   now, or flag if a real structural enumeration is wanted (larger, data-layer work).
2. **Distinct template vs mode flag.** Recommend a distinct `family-anchor.hbs`, since the
   content shape diverges from the roster-driven family page. A conditional mode on
   `family-detail.hbs` is the alternative if minimal divergence is preferred.
3. **Pathway / category content.** The curated prose, categories, and representative
   pathways are editorial and want curator authorship (or sign-off on a Claude draft),
   consistent with the anchor pages' teaching purpose.

## Coordination note

The canonical family-page UX patterns live in the `freestyle-dictionary-surface` skill under
`.claude/`, which currently documents only the roster-driven family page. When this slice is
implemented, that skill needs the anchor variant recorded — a `.claude` edit that requires
your and Dave's approval. Flagged here; not edited.

## Rough shape / sequencing

Small-to-medium, one slice: content module + service method + template + the `?terminal=`
filter + three nav links + the test siblings. No data migration, no schema. The service and
template are the bulk; the filter and nav links are small; the anti-roster guard is the key
assertion. Buildable independently of the Glossary V2 entry work.
