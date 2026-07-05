# Family Pages MVP — design spec

**Status:** design spec for implementation. Platform code (route/controller/service/view) is the primary maintainer's area; the freestyle maintainer advises on ontology/content. This document is the hand-off: it specifies the design so the page can be built without further ontology decisions. No platform code is written here.

## Context

Third step of the freestyle milestone (finish the core encyclopedia → targeted Technique Notes → family pages). The first two are done, so the trick pages a family hub links to are content-complete. Per the `freestyle-dictionary-surface` skill, family pages are the highest-leverage remaining UX step and are a **projection** of the existing ontology, not new modeling — every field already lives in `src/content/` and the dictionary. Today a family is reachable only as a `?view=family` browse filter with `#family-{slug}` anchors; there is no destination page.

---

## 1. Purpose and user value

A per-family landing page gives each first-class family a stable URL that answers, in one place: what defines this family, how it branches, which tricks belong to it (grouped by complexity), and where to go next. It converts the dictionary's structural ontology from a browse-filter into browsable hubs — the site's competitive differentiator (structure, not trick count) made navigable.

## 2. Coverage — which families get a page

> **Updated for the Down umbrella (expert ruling integrated 2026-07-02).** The downs are
> one family — a single structural decomposition with set/foot variants — represented at
> the display layer as a `down` roster root whose variant branches are barfly,
> double_over_down, paradon, and down_double_down (the `dod` sub-label folds into
> double_over_down). The roster is now 26 entries = 18 roots + 8 branches, 17 Family
> Parents. Everything below derives from the same two modules as before
> (`freestyleFamilyTiers.ts` + `freestylePublicFamilies.ts`), so the enumerator picks the
> umbrella up automatically; the notes in this section are the umbrella-specific behavior
> to be aware of, not extra machinery.

MVP = the curated **first-class family parents**: the families above the `FAMILY_PARENT_MIN_DESCENDANTS` threshold in `src/content/freestyleFamilyTiers.ts` — osis, whirl, legover, mirage, butterfly, illusion, swirl, pickup, blender, torque, double_leg_over, drifter, barfly, eggbeater, double_over_down, inside_stall, **down** (17; the original draft of this list omitted drifter, which clears the threshold at 14).

**The `down` page is an umbrella**: it has no raw `trick_family` rows of its own; its membership is the union of its variant branches (45 active tricks), exactly what `rawFamilyLabelsUnder('down')` in `freestylePublicFamilies.ts` returns and what the `?view=family` Down section and `?family=down` filter already render. The page should group members by variant (barfly / double-over-down / paradon / down-double-down) rather than by the standard complexity rungs alone, mirroring the ruling's set-by-foot variant framing. Barfly and double_over_down are themselves parents and keep their own pages, each presenting as a branch of Down (`PUBLIC_FAMILY_PARENT_LABEL`).

**Minor lineages** (eclipse, flail, barrage, paradon, dyno, down_double_down, butterfly_swirl, dada_curve, flurry) stay as `?view=family` anchors for MVP; a thin page for them is a later extension — note it, do not build it. Paradon and down_double_down are minor-tier *variants of Down*: they 404 as their own pages for MVP but their tricks all render on the `down` page, so no down-family trick is page-less. The page set is deliberately aligned with the existing `?view=family` grouping so navigation stays consistent.

## 3. Route / controller / service / view — mirrors `/freestyle/sets/:slug`

The set-detail stack is the near-exact template to copy.

**Route** — `src/routes/publicRoutes.ts`, inside the freestyle block, param route registered **before** the `/freestyle/tricks/:slug` and `/freestyle` catch-alls (literal-before-param, per that block's stated convention):
- `GET /freestyle/families/:slug` → `freestyleController.familyDetail`
- Optional bare hub `GET /freestyle/families` → redirect to `/freestyle/tricks?view=family` (reuse the existing browse index; do **not** build a new hub for MVP).

**Controller** — `src/controllers/freestyleController.ts`, mirror `setDetail` (≈ lines 235–255): read `req.params.slug`; optional `freestyleService.familyRouteRedirectTarget(slug)` → `res.redirect(301, …)`; `const vm = freestyleService.getFamilyDetailPage(slug)`; **404 via null-return** → `res.status(404).render('errors/not-found', …)` with the same payload the set/modifier/trick 404s use (anti-enumeration); otherwise `res.render('freestyle/family-detail', vm)`.

**Service** — `src/services/freestyleService.ts`, new `getFamilyDetailPage(slug: string): PageViewModel<FamilyDetailContent> | null`, mirroring `getCanonicalSetDetailPage` (≈ line 10172):
- Gate: return `null` unless `slug` is a curated first-class family parent (`isOfficialFamilyParent(slug)` from `freestyleFamilyTiers.ts`, plus presence in `PUBLIC_DISPLAY_FAMILIES` from `freestylePublicFamilies.ts`). This is the anti-enumeration gate.
- Member tricks: reuse the existing `?view=family` grouping rather than re-querying. The `FreestyleFamilyGroup` shape (`members`, `cards`, `rungGroups` = Core / 1 / 2 / 3+ operators, `sharedStructure`) is already built inside `getFreestyleTricksIndexPage` via `familyOf` → `resolveDisplayFamily` → `familyWithAncestors` and `buildFamilyGroup`. Factor `buildFamilyGroup` (and its helpers) so both the index and the family-detail page share one builder.
- Project the content fields per §4.
- Add a sitemap enumerator `listSitemapFamilySlugs()` mirroring `listSitemapSetSlugs()` (≈ line 10132).

**View** — `src/views/freestyle/family-detail.hbs`, self-contained with **no partials** (matches `set-detail.hbs` and `modifier-family.hbs`; the trick-shell / hero / gallery partials belong to trick-detail only). Sections per §5. Member tricks render as service-provided `{ displayName, href }` pairs; the template never constructs a URL or derives a label (view-layer rule).

## 4. Data sources to project (all already exist; read-only)

| Source (`src/content/…` unless noted) | Projected as |
|---|---|
| `freestyleGlossaryFamilyCards.ts` — `GlossaryFamilyCard` (canonicalFormula, familyAnchorAdds, kind, commonDescendants, siblingFamilies, notableCompounds, observationalNotes); 28 cards | Overview block, sibling-family links, notable compounds, collapsible observational notes |
| `freestyleFamilyInvariants.ts` — `getFamilyInvariant(slug)` | "Shared structure" one-liner (already rendered as `sharedStructure` in the browse view) |
| `freestyleTrickFamilyEvolution.ts` — `getTrickFamilyEvolution(slug)` (branchAxis / prose / exemplarSlugs) | "How it branches" narrative with exemplar trick links; omit the section if no entry |
| `freestyleFamilyTiers.ts` — `familyTier`, `FAMILY_TIER_LABEL`, `FAMILY_DESCENDANT_COUNTS` | Tier label + curated descendant count in the header |
| Member grouping — `buildFamilyGroup` → `FreestyleFamilyGroup.rungGroups` | Member-trick list grouped by operator depth (Core / 1 / 2 / 3+), each linking trick detail |
| Media | **Only where already available.** The `hasAnyReferenceMedia` → `/media/browse?context=${slug}` pattern exists solely in `getTrickDetailPage` today, and no family-level media aggregator exists. MVP: a single "See family videos" link to `/freestyle/tricks?view=family#family-{slug}`. Per-member gallery aggregation is optional and deferred — do **not** build a family media aggregator for MVP. |
| `freestylePublicFamilies.ts` — `resolveFamilyDisplayName`, `PUBLIC_FAMILY_LABEL` | Display name / heading |

## 5. Page sections and recommended ordering

1. **Header** — family name, tier label ("Family Parent"), curated descendant count, family hashtag/anchor.
2. **Overview** — glossary-card canonical formula + anchor ADD + a one-sentence orientation (lead with what the family *is*, not a metric — view-layer copy rule).
3. **Shared structure** — the family invariant one-liner (if present).
4. **How it branches** — the evolution narrative with exemplar trick links (if present).
5. **Member tricks** — grouped by operator depth (Core / 1 / 2 / 3+ from `rungGroups`); each links `/freestyle/tricks/:slug`. This is the core of the page.
6. **Sibling / related families** — links to their family pages (from `siblingFamilies`).
7. **Notable compounds** — from the glossary card (if present).
8. **Where to go next / cross-links** — `?view=family` browse, glossary family cards, movement systems; optional family-video link.
9. **Observational notes** — collapsible, from the glossary card (if present).

## 6. Empty-state behavior

- Unknown or non-first-class slug → **404** (`getFamilyDetailPage` returns null; anti-enumeration, same as set/modifier). Minor-lineage slugs 404 for MVP (or 301 to `?view=family#family-{slug}` — implementer's call; 404 is the simpler MVP default).
- A first-class family always has more than one member, so the Member-tricks section is never empty. Any *optional* section whose source is absent (no evolution entry, no invariant, no notable compounds) is **omitted**, never rendered empty.

## 7. SEO / title / breadcrumb / sitemap

- **Indexable** public content — no `seo.noindex`.
- Title: `"{FamilyName} Family — Freestyle"`. Breadcrumbs: Freestyle → Trick Dictionary → Families (link to `/freestyle/tricks?view=family`) → {FamilyName}.
- `page.pageKey = freestyle_family_${slug}`.
- Sitemap: add `listSitemapFamilySlugs()` and wire it into `siteMetaService.collectPublicPaths()` next to the set/modifier detail loops (roster/DB-derived, not manual `STATIC_PUBLIC_PATHS`). A bare `/freestyle/families` hub redirect, if added, does **not** go in the sitemap.
- Services own all `seo` fields and every href/label; the layout emits canonical/OG from `res.locals`.

## 8. Tests to add (`tests/integration/freestyle.family-detail.routes.test.ts`)

Mirror `freestyle.set-detail.routes.test.ts` / `freestyle.modifier-family.routes.test.ts`:
- **Happy path:** `GET /freestyle/families/whirl` → 200; response contains the family name, the invariant prose, and member-trick hrefs (`href="/freestyle/tricks/…"`).
- **404:** unknown slug → 404 (anti-enumeration); a minor-lineage slug → 404 (or the chosen redirect).
- **Route ordering:** `/freestyle/families/:slug` does not collide with `/freestyle/tricks/:slug` (assert the family template renders, not `trick-shell`).
- **Section conditionals:** a family with no evolution entry omits that section cleanly.
- **Sitemap:** `listSitemapFamilySlugs()` returns the first-class parents and the paths appear in the sitemap.
- Use factories (`insertFreestyleTrick`), the real SQLite harness, and do not trip the `logger.error` guard.

## 9. Non-goals (hard boundaries for this MVP)

- **No new doctrine** — project existing rulings only.
- **No schema changes** — no new tables/columns; `trick_family` untouched; all data from `src/content/` + existing tables.
- **No new family taxonomy** — use the curated `PUBLIC_DISPLAY_FAMILIES` / tier model as-is; do not add, split, or re-rank families.
- **No content rewriting** — reuse the existing family cards, invariants, and evolution prose verbatim; author no new prose beyond a one-sentence orientation lead per section where a section needs framing.
- **No promotion work** — no trick promotions, alias changes, or dictionary edits.

## Appendix — key file references

- Mirror target: `src/controllers/freestyleController.ts` `setDetail`; `src/services/freestyleService.ts` `getCanonicalSetDetailPage` (≈10172), `listSitemapSetSlugs` (≈10132); `src/views/freestyle/set-detail.hbs`.
- Family content: `src/content/freestyleFamilyTiers.ts`, `freestylePublicFamilies.ts`, `freestyleGlossaryFamilyCards.ts`, `freestyleFamilyInvariants.ts`, `freestyleTrickFamilyEvolution.ts`, `freestyleFamilyOverrides.ts`.
- Grouping to factor: `buildFamilyGroup` and the `?view=family` path inside `getFreestyleTricksIndexPage` (`src/services/freestyleService.ts`).
- Sitemap: `src/services/siteMetaService.ts` `collectPublicPaths()`, `STATIC_PUBLIC_PATHS`.
- View-layer rules: `.claude/rules/view-layer.md` (service-owns-hrefs, hashtag/gallery-link rules, indexability).
