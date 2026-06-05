---
name: add-public-page
description: Add or extend a public server-rendered page in the current Express + Handlebars app. Use when the task adds a new public route, new top-level nav section, or changes an existing public controller, service, template, or route-level tests.
---

# Add Public Page

Public pages in this project are IFPA-facing visitor pages. Every page must conform to the rendering standard in VIEW_CATALOG.md. New pages must satisfy accepted user stories. The source-of-truth order is: explicit human decisions > current code > docs.

## Step 1: Load authoritative docs before touching code

Read only the section relevant to this task. For large documents, locate the section by heading or keyword before reading. Do not load entire files into context.

1. **The top active-slice/status block in `IMPLEMENTATION_PLAN.md`**: confirm the page is in scope now, drafted next, or out of scope. Note any current deviations from target patterns flagged here.
2. **`docs/USER_STORIES.md`**: locate the relevant user story by page name or route, then read only that story's acceptance criteria. Do not infer behavior; derive it from the stories.
3. **`docs/DATA_GOVERNANCE.md`**: when the page touches members, historical persons, search, contact fields, exports, stats, auth, or privacy boundaries, read the relevant section before proceeding.
4. **`docs/DESIGN_DECISIONS.md`** (targeted): read when entering a new code area, unwinding a temporary simplification, or when the rationale behind a pattern is unclear.
5. **`docs/VIEW_CATALOG.md`**: target rendering standard and target page contract. Read:
   - public-rendering-standard section: required `PageViewModel<TContent>` shape (`seo`, `page`, `navigation`, `content`); required reusable primitives (event card, discipline tag, result section, year nav, etc.); implementation rules (thin controllers, logic-light templates, service-owned shaping); visual rules and CSS token baseline.
   - route registration: confirm the route exists in `src/routes/publicRoutes.ts` or add it there. The route-rules section lists per-route ordering, anti-enumeration, and canonical-identity constraints; read any bullet matching the route you are touching.
   - public-page-matrix entry for the affected route: required service binding, audience and authorization, required rendering pattern.
   - sensitive-page target rules: when the page touches privacy, anti-enumeration, owner-only, or public/private boundary surfaces, read the relevant subsection in full.
6. **`docs/SERVICE_CATALOG.md`**: target service-layer ownership and required patterns. Locate the entry for the owning service; read its boundary statement and required patterns. If the required service method does not yet exist, **invoke `extend-service-contract` first and complete it before continuing here**.
7. **Code, types, tests, and `database/schema.sql`**: authoritative for current shapes (method signatures, view-model TypeScript, return types, exact column names, nullable vs required, enum values, FK relationships, indices, triggers). When current shapes disagree with target patterns in VC or SC, that is a deviation tracked in `IMPLEMENTATION_PLAN.md`, not catalog drift. Always follow existing code patterns and naming conventions if similar features have already been implemented; if no good pattern exists, ask the human before introducing a new one.
8. **`docs/DATA_MODEL.md`**: understand entity relationships, soft-delete conventions (`deleted_at`), audit patterns, and data invariants the view-layer change must preserve.

If the requested page is not cataloged, first determine whether it is out of scope for the cataloged surface before proposing catalog expansion.

## Step 2: Inspect current code

After reading docs, read:
- `src/routes/publicRoutes.ts`
- the relevant controller
- the relevant service
- the target Handlebars template(s) and partials
- nearby integration tests in `tests/integration/`

If this task adds a **new top-level nav section**, also read:
- `src/controllers/homeController.ts`: the home page composes `primaryLinks[]`; a new section must appear here
- the shared nav partial or layout template that renders the `navigation.items` array: confirm the new section key will render correctly.

## Step 3: Architecture context

Path-scoped rule files in `.claude/rules/` auto-attach when Claude reads or edits files in their matching paths. For public-page work this typically loads `service-layer.md`, `controller-conventions.md`, `template-conventions.md`, and `db-layer.md`. Trust those rules; do not restate them in your plan.

Two architecture rules sit outside any path-scoped file and apply broadly:

- Server-rendered Express + Handlebars; no client-side rendering or speculative API layers.
- Explicit route registration in `src/routes/publicRoutes.ts`; no dynamic or catch-all magic.

Naming:
- Controllers: `{domain}Controller.ts` -- camelCase, singular noun. No `publicController` layer.
- Services: `{domain}Service.ts` -- camelCase, singular noun.

Client JS:
- JS is optional progressive enhancement, never required for functionality.
- Client-side form validation and UX polish are fine, but the page must work without JS.
- Core logic (defaults, business rules, data shaping) lives in services.

## Step 4: Watch for route hazards

- preserve explicit route ordering
- do not break `/events/year/:year` vs. `/events/:eventKey` ordering (more-specific must be first)

## Step 5: State your plan before editing

Before touching any file, state:
- route(s) affected and whether they are already registered in `src/routes/publicRoutes.ts`
- user story acceptance criteria being satisfied
- view-model fields required by the VIEW_CATALOG public-page-matrix entry for the route
- service method(s) that will own the page shaping (from the SERVICE_CATALOG entry for the owning service)
- if content comes from an external URL: the fetched content structure and how it maps to `content.sections[]`
- if a new top-level nav section: which files need a nav item added (home controller, nav partial/layout, the VIEW_CATALOG public-rendering-standard section)
- complete list of files expected to change
- verification plan

## Step 6: Layout review

Before finishing, review all new or changed templates and CSS for responsive correctness:

- **Laptop (768px+):** verify the layout reads well at typical desktop/laptop widths. Check that grids, flex rows, and max-width constraints produce a balanced page.
- **Phone (480px and below):** verify that every flex row, grid, multi-column layout, and inline element stacks or wraps gracefully. Check the 480px media query block in `style.css` and add rules if the new layout would break at narrow widths.
- Common pitfalls: horizontal overflow from fixed-width elements, side-by-side rows that do not stack, text truncation, touch targets too small, identity/detail rows that need vertical stacking on narrow screens.
- **Form structure:** the page's primary `<form>` is not nested inside another form, and its submit control sits inside it or is wired via `form="id"`; independent POST actions are sibling forms, never nested. A nested form closes the outer one early and silently orphans the submit button.
- **Class vocabulary:** every CSS class in new or changed markup must have a rule in `src/public/css/style.css`; grep for each class you introduce before finishing. Shared button classes are `.btn-primary` and `.btn-outline` only; secondary content blocks use the standard card pattern (`.card`, `.card-title`, `.card-description`). An unknown class fails nothing and renders silently unstyled, so a plausible-looking name (`btn-secondary`) passes visual review while violating the VIEW_CATALOG §4.3 vocabulary. Never invent a class name by analogy; verify it exists or add it to `style.css` AND VC §4.3 in the same change.

If in doubt about a layout, flag it to the human rather than shipping something that looks broken on mobile.

## Step 7: Verification

- write or update integration tests in `tests/integration/` using factory helpers from `tests/fixtures/factories.ts` (see `tests/CLAUDE.md` for conventions and `write-tests` skill for guidance)
- make excellent adversarial tests: happy path, auth gates, not-found, draft/unpublished leakage, route ordering, edge cases from acceptance criteria
- run `npm test` to confirm all tests pass
- run `npm run build` (`tsc -p tsconfig.json`) to confirm no type errors
- only use browser automation if the human explicitly asked for it (see `browser-qa` skill)
- after changes, invoke `doc-sync` to check whether VIEW_CATALOG.md or SERVICE_CATALOG.md needs updating
