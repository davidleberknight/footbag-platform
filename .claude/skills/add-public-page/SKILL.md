---
name: add-public-page
description: Add or extend a public server-rendered page in the current Express + Handlebars app. Use when the task adds a new public route, new top-level nav section, or changes an existing public controller, service, template, or route-level tests.
---

# Add Public Page

Public pages in this project are IFPA-facing visitor pages. Every page must conform to the rendering standard in `.claude/rules/view-layer.md` and the owning service's file-header JSDoc. New pages must satisfy accepted user stories. Follow the authority order and read order in root `CLAUDE.md`.

## Step 1: Load authoritative docs before touching code

Read only the section relevant to this task. For large documents, locate the section by heading or keyword before reading. Do not load entire files into context.

1. **The maintainers' private tracker** (`gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open`; if unwired, note it in one line and proceed with the human's instruction as given): confirm an open issue covers the page. Note any tracked deviations from target patterns.
2. **`docs/USER_STORIES.md`**: locate the relevant user story by page name or route, then read only that story's acceptance criteria. Do not infer behavior; derive it from the stories.
3. **`docs/DATA_GOVERNANCE.md`**: when the page touches members, historical persons, search, contact fields, exports, stats, auth, or privacy boundaries, read the relevant section before proceeding.
4. **`docs/DESIGN_DECISIONS.md`** (targeted): read when entering a new code area, unwinding a temporary simplification, or when the rationale behind a pattern is unclear.
5. **`.claude/rules/view-layer.md`** (auto-attaches when editing `src/views/**` or `src/public/css/**`): the public-rendering standard — required `PageViewModel<TContent>` shape (`seo`, `page`, `navigation`, `content`); the reusable primitives (event card, discipline tag, result section, year nav, etc.); thin-controller and logic-light-template discipline; CSS-vocabulary discipline; and the visual standard. Confirm the route exists in `src/routes/publicRoutes.ts` or add it there. The per-route service binding, audience, authorization, rendering pattern, and sensitive-page invariants (privacy, anti-enumeration, owner-only, public/private boundary) live in the owning service's file-header JSDoc (item 6); read it in full for the route you are touching.
6. **The owning service's file-header JSDoc** (`src/services/<name>.ts`): the authoritative service-layer contract; read its ownership boundary and required patterns. If the required service method does not yet exist, **invoke `extend-service-contract` first and complete it before continuing here**.
7. **Code, types, tests, and `database/schema.sql`**: authoritative for current shapes (method signatures, view-model TypeScript, return types, exact column names, nullable vs required, enum values, FK relationships, indices, triggers). When current shapes disagree with the target patterns in `.claude/rules/view-layer.md` or the owning service's JSDoc, that is a deviation tracked as a private-tracker issue. Always follow existing code patterns and naming conventions if similar features have already been implemented; if no good pattern exists, ask the human before introducing a new one. Questions to the human follow `.claude/rules/asking.md`.
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
- `src/app.ts`: the site header/footer nav is the `NAV_SECTIONS` array (exposed as `res.locals.navLinks`, rendered by the `nav-links` partial); a new top-level section must be added there.
- `src/services/homeService.ts`: `primaryLinks[]` is the home-page body's featured-section list (separate from the header nav); add the section there too only if it should be featured on the home page.

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
- view-model fields required by the route's page contract (from the owning service's file-header JSDoc)
- service method(s) that will own the page shaping (from the owning service's file-header JSDoc)
- if content comes from an external URL: the fetched content structure and how it maps to `content.sections[]`
- if a new top-level nav section: which files need a nav item added (home controller, nav partial/layout, and the view-layer standard in `.claude/rules/view-layer.md`)
- crawler exposure: a new public page is indexed by default and joins the XML sitemap; set `seo.noindex` for a thin auth page, and add any new top-level public section to the sitemap source list in `siteMetaService.ts`
- complete list of files expected to change
- verification plan

## Step 6: Layout review

Before finishing, review all new or changed templates and CSS for responsive correctness:

- **Laptop (768px+):** verify the layout reads well at typical desktop/laptop widths. Check that grids, flex rows, and max-width constraints produce a balanced page.
- **Phone (480px and below):** verify that every flex row, grid, multi-column layout, and inline element stacks or wraps gracefully. Check the 480px media query block in `style.css` and add rules if the new layout would break at narrow widths.
- **Canonical breakpoints (480 / 768 / 1024):** media queries use only 480px (phone), 768px (mid-width), and 1024px (tablet, for surfaces with a genuine three-tier layout); no other widths. The `scripts/ci/assert_conventions.sh` gate rejects non-canonical `@media` widths, raw hex outside `:root`, and raw-px `border-radius`; colors and radii come from the `:root` design tokens, so a new visual value enters as a named token first.
- **Notation typography:** inline notation, formulas, and difficulty values render in the body font (`--font-body`) distinguished by semibold weight and the secondary accent color, not a separate typeface; hashtags and tags render in `--font-body` inside a low-tint rounded chip. `--font-mono` is reserved for tabular value columns and verbatim ASCII.
- Common pitfalls: horizontal overflow from fixed-width elements, side-by-side rows that do not stack, text truncation, touch targets too small, identity/detail rows that need vertical stacking on narrow screens.
- **Form structure:** the page's primary `<form>` is not nested inside another form, and its submit control sits inside it or is wired via `form="id"`; independent POST actions are sibling forms, never nested. A nested form closes the outer one early and silently orphans the submit button.
- **Truthful controls:** every clickable control's visible label names the action it performs or where it goes, and two controls that show the same label on the page resolve to the same destination (form `action` or anchor `href`). A button labelled "Link My History" that actually runs a search, or two "Apply" buttons posting to different endpoints, are defects the user cannot tell apart. The button-destination integrity check in the route-wiring crawl suite enforces this across every template.
- **Class vocabulary:** every CSS class in new or changed markup must have a rule in `src/public/css/style.css`; grep for each class you introduce before finishing. Shared button classes are `.btn-primary`, `.btn-outline`, and `.btn-inverse` (white fill with teal text, for CTAs on dark gradient panels) only; secondary content blocks use the standard card pattern (`.card`, `.card-title`, `.card-description`). An unknown class fails nothing and renders silently unstyled, so a plausible-looking name (`btn-secondary`) passes visual review while violating the CSS vocabulary. Never invent a class name by analogy; verify it exists or add it to `style.css` in the same change.
- **Button label casing:** Title Case — capitalize each word except the minor words `a an as the and or nor but to of in on at by for` (unless first or last word). See `.claude/rules/view-layer.md`.

If in doubt about a layout, flag it to the human rather than shipping something that looks broken on mobile.

## Step 7: Verification

- write or update integration tests in `tests/integration/` using factory helpers from `tests/fixtures/factories.ts` (see `tests/CLAUDE.md` for conventions and `write-tests` skill for guidance)
- make excellent adversarial tests: happy path, auth gates, not-found, draft/unpublished leakage, route ordering, edge cases from acceptance criteria
- run `npm test` to confirm all tests pass
- run `npm run build` (`tsc -p tsconfig.json`) to confirm no type errors
- only use browser automation if the human explicitly asked for it (see `browser-qa` skill)
- after changes, invoke `doc-sync` to check whether the owning service's file-header JSDoc or `.claude/rules/view-layer.md` needs updating
