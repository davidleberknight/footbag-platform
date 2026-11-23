---
name: add-public-page
description: Add or extend a public server-rendered page in the current Express + Handlebars app. Use when the task adds a new public route, new top-level nav section, or changes an existing public controller, service, template, or route-level tests.
---

# Add Public Page

Public pages in this project are IFPA-facing visitor pages. Every page must conform to the rendering standard in `.claude/rules/view-layer.md` and the owning service's file-header JSDoc. New pages must satisfy accepted user stories. Follow the authority order and read order in root `CLAUDE.md`.

## Step 1: Load authoritative docs before touching code

1. **The maintainers' private tracker** (`gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open`; if unwired, note it in one line and proceed with the human's instruction as given): confirm an open issue covers the page, and note any tracked deviations.
2. **`docs/USER_STORIES.md`**: only the governing story's success criteria; derive behavior from them, never infer it.
3. **`docs/DATA_GOVERNANCE.md`**: the relevant section, when the page touches members, historical persons, search, contact fields, exports, stats, auth, or privacy boundaries.
4. **`docs/DESIGN_DECISIONS.md`** (targeted): when entering a new code area, unwinding a temporary simplification, or when a pattern's rationale is unclear.
5. **The owning service's file-header JSDoc** (`src/services/<name>.ts`), in full for the route: ownership boundary, required patterns, audience, authorization, rendering pattern and sensitive-page invariants. If the required service method does not yet exist, **invoke `extend-service-contract` first and complete it before continuing here**.
6. **Code, types, tests and `database/schema.sql`** for current shapes. A disagreement with the owning JSDoc or `.claude/rules/view-layer.md` goes through the `design-intent` skill. Follow an existing pattern where one exists; with none, ask before introducing one.
7. **`docs/DATA_MODEL.md`**: entity relationships, soft-delete, audit patterns and data invariants the change must preserve.

If the requested page is not covered by a user story or an open private-tracker issue, first determine whether it is out of scope before proposing it as new work.

## Step 2: Inspect current code

After reading docs, read:
- `src/routes/publicRoutes.ts`
- the relevant controller
- the relevant service
- the target Handlebars template(s) and partials
- nearby integration tests in `tests/integration/`

If this task adds a **new top-level nav section**, also read:
- `src/app.ts`: the site header/footer nav is the `NAV_SECTIONS` array (exposed as `res.locals.navLinks`, rendered by the `nav-links` partial); a new top-level section must be added there, together with its branch in the request-path-to-`currentSection` middleware (the "Active nav section" block further down the same file), or its nav entry never shows as active.
- `src/services/homeService.ts`: `primaryLinks[]` is the home-page body's featured-section list (separate from the header nav); add the section there too only if it should be featured on the home page.

## Step 3: Architecture context

The touched paths' rules (typically `service-layer.md`, `controller-conventions.md`, `view-layer.md`, `db-layer.md`) are read under the pre-writing-code gate in root `CLAUDE.md`. Beyond them: server-rendered Express + Handlebars with no client-side rendering or speculative API layers; explicit route registration in `src/routes/publicRoutes.ts`, no dynamic or catch-all magic; `{domain}Controller.ts` and `{domain}Service.ts`, camelCase singular nouns, and no `publicController` layer.

## Step 4: Watch for route hazards

- preserve explicit route ordering
- do not break `/events/year/:year` vs. `/events/:eventKey` ordering (more-specific must be first)
- a GET handler, and every service method it calls, changes no stored state (design decision "Every GET Is Read-only"); work triggered by viewing belongs in a POST

## Step 5: State your plan before editing

Before touching any file, state:
- route(s) affected and whether they are already registered in `src/routes/publicRoutes.ts`
- user story success criteria being satisfied
- view-model fields required by the route's page contract (from the owning service's file-header JSDoc)
- service method(s) that will own the page shaping (from the owning service's file-header JSDoc)
- if content comes from an external URL: the fetched content structure and how it maps to `content.sections[]`
- if a new top-level nav section: which files need a nav item added (`NAV_SECTIONS` and the request-path-to-`currentSection` mapping in `src/app.ts`; `homeService.ts` `primaryLinks` only if the section is featured on the home page)
- crawler exposure: a new public page is indexed by default and joins the XML sitemap; set `seo.noindex` for a thin auth page. The sitemap's hand-maintained `STATIC_PUBLIC_PATHS` in `src/services/siteMetaService.ts` does not discover routes: add any new public hub or editorial page there (entity-detail pages, and rules and IFPA documents from their `ifpa/` files, join automatically)
- complete list of files expected to change
- verification plan

## Step 6: Layout review

Before finishing, review all new or changed templates and CSS against `.claude/rules/view-layer.md` and the design decisions on type and stylesheet gates ("One Type System with Body-font Notation", "Stylesheet Convention Gates", "Static-Asset Fingerprinting"), then for responsive correctness:

- **Laptop (768px+; page-check measures at 1280px):** grids, flex rows, and max-width constraints produce a balanced page.
- **Phone (the 480px breakpoint and below; page-check measures at 390px):** every flex row, grid, multi-column layout, and inline element stacks or wraps gracefully; add rules to the 480px media query block in `style.css` where the new layout would break. Watch for horizontal overflow from fixed-width elements, text truncation, small touch targets, and identity or detail rows that need vertical stacking.
- **Without JavaScript:** load each changed page with scripting off at both widths. A control a script replaces must still render at its normal size, and a box a script fills must reserve its space or not be drawn; the rendered-style check measures only with scripts on.

If in doubt about a layout, flag it to the human rather than shipping something that looks broken on mobile.

## Step 7: Verification

- write the tests through the `write-tests` skill, which owns the layer choice, the case floor and the sweeps a new route already gets
- verify per the test-targets line in root `CLAUDE.md` (the full gate is the maintainer's: an ask rule in `.claude/settings.json`, per `.claude/rules/testing.md` "Scope of a verification run")
- before calling the change done, read and follow `.claude/skills/page-check/SKILL.md` over every impacted page and section; the human's own look at finished UI follows the asking rule.
- after changes, invoke `doc-sync` to check whether the owning service's file-header JSDoc or `.claude/rules/view-layer.md` needs updating
