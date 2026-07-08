---
paths:
  - "src/views/**"
---

# Template conventions

Templates are logic-light Handlebars. The service layer hands them a fully-shaped view-model; templates render it.

## What templates receive

Every public page (except Home, the one composition-page exception) receives a `PageViewModel<TContent>` from `src/types/page.ts` (full page contract and primitives in `.claude/rules/view-layer.md`):

    interface PageViewModel<TContent> {
      seo: SeoMeta;       // { title, fullTitle?, description?, noindex? }
      page: PageMeta;     // { sectionKey, pageKey, title, eyebrow?, intro?, notice? }
      navigation?: NavigationMeta;
      content: TContent;  // page-specific shape
    }

Middleware also populates `res.locals.isAuthenticated`, `res.locals.isAdmin`, `res.locals.currentSection`, and similar pre-shaped booleans the layout uses.

## What templates must NOT do

- **No business rules / no computed values / no direct DB access.** If a template needs data it does not have, the fix is in the service, not the template.
- **No branching on raw domain codes.** `{{#if (eq member.role 'admin')}}` is forbidden; the service supplies `isAdmin`. `{{#if (eq teamType 'doubles')}}Doubles{{else}}...{{/if}}` is forbidden; the service supplies `teamTypeLabel`.
- **No URL construction with two or more variables.** `href="/freestyle/tricks?family={{family}}"` is acceptable (single variable). `href="/members/{{slug}}/section-{{section}}/{{id}}"` is forbidden; services provide pre-shaped `*Href` view-model fields.
- **No inline `style="..."`, `<style>`, `<script>` blocks.** CSP enforces `script-src 'self'` and `style-src 'self'`. All CSS lives in `src/public/css/style.css`. All client behavior lives in `src/public/js/*.js` loaded via `<script src="..." defer>`. The single permitted exception is non-executable JSON data islands: `<script type="application/json" id="...">{{{ jsonViewModel }}}</script>`, parsed by an external script. The CI gate at `scripts/ci/assert_conventions.sh` enforces this at merge time; CSP catches it at runtime as defense in depth.
- **No inline event handlers** (`onclick=`, `onchange=`, `onsubmit=`, etc.). Attach handlers from external JS via `addEventListener` on a class or `data-*` selector.
- **No nested `<form>` elements.** HTML closes the outer form at the first `</form>`, silently orphaning every later control and the submit button, so the form submits nothing in the browser. When independent actions must interleave with a form's fields, give the form an `id` and associate controls with `form="id"`; never wrap one `<form>` inside another. The CI gate at `scripts/ci/assert_conventions.sh` enforces this at merge time.
- **No lying labels: a control's visible label is a promise about where the click lands.** Any clickable control (a form-submit button or a button-styled link) must name the action it performs or the place it goes, and two controls that show the same label on one page must resolve to the same destination (the form `action` or the anchor `href`). A button labelled "Link My History" that actually runs a search, or two "Apply" buttons that post to different endpoints, are defects: the user cannot tell them apart, so the label lies about the outcome. The one exception is an identity-switch verb: `Switch` means "become this identity", and the dev persona harness offers more than one switch mechanism (a seeded persona and a real claimed member), so a `Switch` control may resolve to more than one switch endpoint without lying; the check exempts that single label. The button-destination integrity check in the route-wiring crawl suite (`tests/integration/route-wiring.crawl.test.ts`) enforces this statically across every template.
- **JS is optional progressive enhancement**, never required for functionality. Client-side form validation and UX polish are fine, but the page must work without JS. Core logic (defaults, business rules, data shaping) lives in services.

## Registered helpers

Templates may use these registered helpers from `src/app.ts`:

- `formatDate(iso)` -- ISO `YYYY-MM-DD` to `D Month YYYY`.
- `yearFromDate(iso)` -- extracts 4-digit year.
- `countryFlag(country)` -- flag emoji or unicode for a country code.
- `externalLink(url, label, class)` -- renders an external `<a>` with `rel="noopener noreferrer"`.
- `formatLocation(city, region, country)` -- joins location parts with commas.
- `splitParagraphs(text)` -- splits curator prose on blank lines into an array of paragraph strings (trick-detail ontology partials render each as a `<p>`).
- `eq(a, b)`, `gt(a, b)`, `add(a, b)`, `not(a)`, `or(a, b)` -- equality, comparison, arithmetic. Use `eq` for pre-shaped enum branching (e.g., `{{#if (eq activeView 'add')}}`); do NOT use `eq` to derive labels from raw domain codes -- the service shapes labels.

## CSS class vocabulary

Class names live in `src/public/css/style.css`. Every class used in a template must have a corresponding rule there. Before finishing any template change, grep `style.css` for each class you introduced; an unknown class fails nothing at build or test time and renders silently unstyled, so this check is manual and mandatory. Do not invent class names by analogy with other frameworks (`btn-secondary` is a Bootstrap name, not ours). Shared classes used across pages:

- Site frame: `.wrapper`, `.site-header`, `.site-logo`, `.main-nav`, `.site-footer`.
- Hero: `.hero`, `.hero-sm`, `.hero-eyebrow`, `.hero-subtitle`, `.hero-hashtag`.
- Sections / cards / badges / buttons: `.section-heading`, `.card`, `.card-title`, `.card-meta`, `.badge`, `.btn`, `.btn-primary`, `.btn-outline`, `.btn-inverse`.
- Spacing utilities (1 unit = 4px): `.mt-1` through `.mt-10`, `.mb-2` through `.mb-8`.
- Text utilities: `.text-muted`, `.text-secondary`, `.text-center`, `.fs-sm`, `.fw-600`.

Per-section vocabularies (clubs, members, events, freestyle, etc.) live in `src/public/css/style.css`, the source of truth for class definitions; `.claude/rules/view-layer.md` covers the vocabulary structure.

## Pre-shaped boolean discipline

When a template branches on state, it branches on a service-shaped boolean, not on raw domain data:

- **Correct:** `{{#if showContact}}{{contactEmail}}{{/if}}` -- service computed `showContact`.
- **Correct:** `{{#if hasResults}}...{{/if}}` -- service computed `hasResults` from result-row count.
- **Wrong:** `{{#if (gt member.tier 1)}}` -- template doing tier comparison.
- **Wrong:** `{{#if (eq event.status 'completed')}}` -- template doing status check; service should compute `isCompleted`.
