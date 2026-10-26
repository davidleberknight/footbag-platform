---
name: add-public-page
description: Add or extend a public server-rendered page in the current Express + Handlebars app. Use when the task adds a new public route, new top-level nav section, or changes an existing public controller, service, template, or route-level tests.
---

# Add Public Page

Public pages in this project are IFPA-facing visitor pages. Every page must conform to the rendering standard in `.claude/rules/view-layer.md` and the owning service's file-header JSDoc. New pages must satisfy accepted user stories. Follow the authority order and read order in root `CLAUDE.md`.

## Step 1: Load authoritative docs before touching code

1. **The maintainers' private tracker** (`gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open`; if unwired, note it in one line and proceed with the human's instruction as given): confirm an open issue covers the page. Note any tracked deviations from target patterns.
2. **`docs/USER_STORIES.md`**: locate the relevant user story by page name or route, then read only that story's success criteria. Do not infer behavior; derive it from the stories.
3. **`docs/DATA_GOVERNANCE.md`**: when the page touches members, historical persons, search, contact fields, exports, stats, auth, or privacy boundaries, read the relevant section before proceeding.
4. **`docs/DESIGN_DECISIONS.md`** (targeted): read when entering a new code area, unwinding a temporary simplification, or when the rationale behind a pattern is unclear.
5. **`.claude/rules/view-layer.md`** (loads on views, public assets, services and content): the public-rendering standard. Confirm the route exists in `src/routes/publicRoutes.ts` or add it there. The per-route service binding, audience, authorization, rendering pattern, and sensitive-page invariants (privacy, anti-enumeration, owner-only, public/private boundary) live in the owning service's file-header JSDoc (item 6); read it in full for the route you are touching.
6. **The owning service's file-header JSDoc** (`src/services/<name>.ts`): the authoritative service-layer contract; read its ownership boundary and required patterns. If the required service method does not yet exist, **invoke `extend-service-contract` first and complete it before continuing here**.
7. **Code, types, tests and `database/schema.sql`** show current shapes (signatures, view-model types, columns, nullability, enums, keys, triggers). A disagreement with the owning JSDoc or `.claude/rules/view-layer.md` goes through the `design-intent` skill. Follow an existing pattern where one exists; with none, ask before introducing one.
8. **`docs/DATA_MODEL.md`**: understand entity relationships, soft-delete conventions (`deleted_at`), audit patterns, and data invariants the view-layer change must preserve.

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

Path-scoped rule files in `.claude/rules/` govern the paths the change touches. For public-page work these are typically `service-layer.md`, `controller-conventions.md`, `view-layer.md`, and `db-layer.md`. Read each touched path's rule yourself (the pre-writing-code gate in root `CLAUDE.md`); do not restate them in your plan.

Two architecture rules sit outside any path-scoped file and apply broadly:

- Server-rendered Express + Handlebars; no client-side rendering or speculative API layers.
- Explicit route registration in `src/routes/publicRoutes.ts`; no dynamic or catch-all magic.

Naming:
- Controllers: `{domain}Controller.ts` -- camelCase, singular noun. No `publicController` layer.
- Services: `{domain}Service.ts` -- camelCase, singular noun.

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
- crawler exposure: a new public page is indexed by default and joins the XML sitemap; set `seo.noindex` for a thin auth page, and add any new top-level public section to the sitemap source list in `siteMetaService.ts`
- complete list of files expected to change
- verification plan

## Step 6: Layout review

Before finishing, review all new or changed templates and CSS against `.claude/rules/view-layer.md` (Template mechanics, CSS vocabulary, Action hierarchy, Message vocabulary, Visual standard), and for responsive correctness:

- **Laptop (768px+; page-check measures at 1280px):** verify the layout reads well at typical desktop/laptop widths. Check that grids, flex rows, and max-width constraints produce a balanced page.
- **Phone (the 480px breakpoint and below; page-check measures at 390px):** verify that every flex row, grid, multi-column layout, and inline element stacks or wraps gracefully. Check the 480px media query block in `style.css` and add rules if the new layout would break at narrow widths.
- **Notation typography:** inline notation, formulas, and difficulty values render in the body font (`--font-body`) distinguished by semibold weight and the secondary accent color, not a separate typeface; hashtags and tags render in `--font-body` inside a low-tint rounded chip. `--font-mono` is reserved for tabular value columns and verbatim ASCII.
- Common pitfalls: horizontal overflow from fixed-width elements, side-by-side rows that do not stack, text truncation, touch targets too small, identity/detail rows that need vertical stacking on narrow screens.
- **Without JavaScript:** load each changed page with scripting off at both widths. A control a script replaces must still render at its normal size, and a box a script fills must reserve its space or not be drawn; the rendered-style check measures only with scripts on.
- **Conformance gates:** a new template class needs a reviewed line in `tests/unit/template-class-baseline.txt` (reuse an existing primitive first); headings and button labels pass `toTitleCase`; site assets go through the `asset` helper; no inline `style`, `<style>`, `<script>` or event handler, because the content security policy refuses them.

If in doubt about a layout, flag it to the human rather than shipping something that looks broken on mobile.

## Step 7: Verification

- write the tests through the `write-tests` skill, which owns the layer choice, the case floor and the sweeps a new route already gets
- verify per the Verification default in root `CLAUDE.md`
- before calling the change done, read and follow `.claude/skills/page-check/SKILL.md` over every impacted page and section. Screenshots run only when the human asks (`browser-qa`); the human's own look at finished UI follows the asking rule.
- after changes, invoke `doc-sync` to check whether the owning service's file-header JSDoc or `.claude/rules/view-layer.md` needs updating
