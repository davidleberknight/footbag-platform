# Footbag Website Modernization Project -- View Catalog

This catalog defines the target rendering standard for the public site and the target page contract for every public route. It describes durable design intent: required `PageViewModel` shape, required reusable primitives, required visual rules, route-level audience and authorization, and the sensitive-page invariants (anti-enumeration, owner-only, public/private profile boundary). Current shapes (controller code, template HTML, view-model TypeScript) are authoritative for current behavior; this catalog is authoritative for target patterns. When this catalog and `IMPLEMENTATION_PLAN.md` disagree, the plan wins for current-state questions; this catalog wins for target-design questions.

## Table of Contents

- [1. Purpose and authority](#1-purpose-and-authority)
- [2. Scope](#2-scope)
- [3. Governing principles](#3-governing-principles)
- [4. Public rendering standard](#4-public-rendering-standard)
  - [4.1 Standard purpose](#41-standard-purpose)
  - [4.2 Required page contract](#42-required-page-contract)
  - [4.3 Required reusable primitives](#43-required-reusable-primitives)
  - [4.4 Implementation rules](#44-implementation-rules)
  - [4.5 Visual rules](#45-visual-rules)
- [5. Public route catalog](#5-public-route-catalog)
- [6. Public page matrix](#6-public-page-matrix)
- [7. Sensitive page target rules](#7-sensitive-page-target-rules)
- [8. Shared public behavior rules](#8-shared-public-behavior-rules)
- [9. Future admission rules](#9-future-admission-rules)
- [10. Catalog update rules](#10-catalog-update-rules)

---

## 1. Purpose and authority

This catalog owns: the target public-rendering standard, the target page contract (`PageViewModel<TContent>`), the required reusable primitives and CSS vocabulary, the public route catalog, and the target audience/authorization and rendering invariants for every public page. It is authoritative for design questions about how a public page must be rendered, what view-model shape services must produce, and which rules templates must follow.

This catalog does not own: current template HTML, current view-model TypeScript shapes, current controller code paths, or current implementation status. Those live in `src/views/`, `src/types/`, `src/controllers/`, and `IMPLEMENTATION_PLAN.md` respectively. It also does not own service ownership boundaries; those live in `docs/SERVICE_CATALOG.md`.

This catalog is intentionally narrower than the full product. A public capability may still be part of the broader product because it is defined in `docs/USER_STORIES.md` even when it is not yet cataloged here. Read `IMPLEMENTATION_PLAN.md` to determine current scope.

It has two jobs: define the generic look-and-feel standard that applies to every cataloged page; and define the catalog of public pages that consume that standard. The standard is cross-site and generic. Every public page must conform to it.

## 2. Scope

This document covers:

- the public visual and structural standard for server-rendered visitor pages
- the public route catalog
- the required page contract for public rendering
- the public, account, claim, and content-discovery pages in the cataloged surface
- the rules a future page must follow to join the catalog

`docs/USER_STORIES.md` remains broader than this file. This catalog is authoritative for the views it includes; it does not catalog the full future product.

This document does not cover: organizer workflows, admin pages, APIs, internal tools, and pages that remain out of scope for the cataloged surface.

## 3. Governing principles

### 3.1 One standard, many pages

The public site has one reusable look-and-feel standard. Pages consume the standard. Pages do not define their own standards.

### 3.2 Reuse must be enforceable

The standard is enforceable through reusable code, not through convention alone:

- thin controllers
- shaped page view-models
- one public layout contract
- reusable Handlebars partials and components
- shared CSS tokens and component styles
- logic-light templates

### 3.3 Events are consumers, not the authority

The Events pages are part of the catalog, but they do not define site-wide visual or structural rules. They refer to the generic standard exactly as Home, Clubs, and other sections do.

### 3.4 Future pages must fit the standard

A new public page may join the catalog only if it can be expressed through the same generic standard. If a genuinely reusable new primitive is needed, that primitive must be added to the standard itself and then reused.

### 3.5 Home is a special composition-page exception

Home (`/`) is the one intentional composition-page exception. It is not required to use the standard `seo / page / navigation / content` contract, but it must use the shared site layout, shared visual tokens, shared section identity, thin-controller discipline, and service-owned shaping.

Home may introduce richer editorial composition and optional media or interactivity regions such as hero media, inline video, motion treatments, or other page-specific JavaScript enhancements. These enhancements must remain within the same Express plus Handlebars plus vanilla TypeScript architecture and must not introduce a separate front-end stack, template-owned routing logic, or a home-only chrome system.

Any permanent change to navigation structure or global shell belongs in the shared layout and design system, not in the Home template alone.

## 4. Public rendering standard

### 4.1 Standard purpose

The public rendering standard defines the shared structure, page contract, and reusable UI primitives that every cataloged public page must use.

### 4.2 Required page contract

Every public page except Home (per §3.5) must render from the same top-level contract.

**Required top-level shape:**

- `seo`
  - `title`: tab suffix (e.g. `"Events"`, `"2025 Events"`, `"Alice Footbag"`); the layout renders `Footbag {seo.title}` in the `<title>` tag; never include the word "Footbag" in this value
  - optional `description`: meta description for future SEO use
  - optional `fullTitle`: complete tab title (no "Footbag" prefix); used when the page needs a non-"Footbag" prefix (e.g. IFPA Member pages render `IFPA Member {name}`)
- `page`
  - `sectionKey`: nav section identifier (`'events'`, `'members'`, `'clubs'`, `'hof'`, `'bap'`, `'freestyle'`, `'records'`, `'net'`, `'sideline'`, `'rules'`, `'media'`, or `''` for login/error pages)
  - `pageKey`: unique page identifier (`'events_index'`, `'event_detail'`, `'member_history_detail'`, etc.)
  - `title`: displayed h1 text (distinct from `seo.title`)
  - optional `eyebrow`: small label rendered above h1
  - optional `intro`: subtitle paragraph rendered below h1
  - optional `notice`: WIP or caveat notice block
- `navigation`: contextual navigation; service-provided and distinct from middleware locals
  - Middleware provides `currentSection` (drives active nav link) and `isAuthenticated` (drives login/logout display) via `res.locals` on every request; these are not part of the service contract.
  - Services provide an optional `navigation` object for page-specific nav context that middleware cannot infer:
  - optional `breadcrumbs`: `{ label: string; href?: string }[]`; last entry is the current page (no `href`); used for hierarchical pages; omitted on flat pages
  - optional `siblings`: `{ previous?: { label, href }; next?: { label, href } }`; sequential browsing (year archive prev/next); omitted on pages with no sequential relationship
  - optional `contextLinks`: `{ label, href, variant?: 'primary' | 'outline' }[]`; page-scoped related actions; templates place these explicitly, the layout does not render them automatically
- `content`
  - page-specific regions, always nested under this key
  - services compute all hrefs (e.g. `participantHref`, `eventHref`, `memberHref`); templates never construct URLs
  - services compute domain-derived display labels (e.g. `teamTypeLabel`) and boolean display flags (e.g. `hasResults`)
  - templates use registered helpers (`formatDate`, `countryFlag`, `yearFromDate`) for presentation formatting only
  - templates iterate typed arrays for structured content (results, event groups, discipline lists)

Templates consume this contract rather than derive it.

**TypeScript enforcement:** the shape is codified as a generic interface in `src/types/page.ts`:

```ts
interface PageViewModel<TContent = Record<string, unknown>> {
  seo: SeoMeta;
  page: PageMeta;
  navigation?: NavigationMeta;
  content: TContent;
}
```

The generic slot `TContent` is the page-specific content shape. Each page declares its own `<PageName>Content` interface (e.g. `RecordsContent`, `NetTeamsContent`, `LoginContent`); services return `PageViewModel<TContent>` rather than hand-rolling a bespoke envelope.

**Naming conventions:**

- Page-content interfaces: `<PageName>Content` (e.g. `LoginContent`, `RecordsContent`).
- Row-level view-model interfaces inside a `*Content` shape: `<Entity>ViewModel` (e.g. `FreestyleRecordViewModel`, `NetTeamViewModel`).
- Controllers: `<domain>Controller.ts`; templates: `src/views/<section>/<page>.hbs`. Service and prepared-statement naming live in `docs/SERVICE_CATALOG.md`.

**Enforcement:**

- Every service method that produces a public page returns `PageViewModel<TContent>` as its declared return type.
- Controllers that render inline (no service-method wrapper) type the render arg with `satisfies PageViewModel<TContent>` so the envelope is compile-time-checked.
- Renaming a field in `SeoMeta`, `PageMeta`, or `NavigationMeta` produces a compile error at every call site.

Home is exempt per §3.5. Internal `/internal/*` routes (operator tooling) are exempt; they are not part of the public rendering standard.

**Browser tab title rule:**

The HTML `<title>` follows the pattern `Footbag {seo.title}` for most pages. When `seo.fullTitle` is set, it is the complete tab title (no "Footbag" prefix). Home renders as `Footbag Worldwide` (no suffix; no `seo` contract applies to Home per §3.5). `page.title` is the displayed h1 text and is distinct from `seo.title`.

### 4.3 Required reusable primitives

Every public page must be composed from the same small set of reusable primitives.

**Site frame:** header/navigation region, main content container, footer region.

**Page hero:** optional eyebrow (`.hero-eyebrow`), page title, optional subtitle (`.hero-subtitle`), optional notice. All text inside `.hero` must be white or `rgba(255, 255, 255, *)`; `.text-muted` is overridden inside `.hero` as a safety net, but prefer the semantic classes `.hero-eyebrow`, `.hero-subtitle`, or `.hero-hashtag`.

**Content section:** section heading, optional supporting text, content body.

**Event card:** used in events index upcoming list and home featured events. Renders title (linked to canonical event route), date range, location, host club when present, status badge, short description when present.

**Discipline tag:** used in event detail. Renders the discipline name; non-singles disciplines (`doubles`, `mixed_doubles`) include a parenthetical team-type indicator. `discipline_category` is application-enforced taxonomy with canonical families `freestyle`, `net`, `golf`, `sideline`. Tags ordered by `sortOrder`.

**Result section:** used in event detail. One section per discipline grouping. Header is `disciplineName` when present; otherwise "General Results". Optional meta line when `teamType` is present. One row per placement: `placement` number, participant entries ordered by `participantOrder` (stacked for `doubles` and `mixed_doubles`); each participant renders `participantDisplayName` and may optionally render `participantHref` when a linked detail target exists; `scoreText` when present (cell empty when absent, no placeholder). Placements rendered ascending. Template prose, debug text, and loop scaffolding must never appear in rendered HTML.

**Handlebars helpers:** `formatDate` (ISO `YYYY-MM-DD` to `D Month YYYY`); `yearFromDate` (extracts 4-digit year for href construction); same-day-event suppression via `{{#unless (eq startDate endDate)}}`. Raw ISO date strings must never appear in rendered output.

**Year navigation:** used in year archive. Renders prev/next year links when adjacent years with completed public events exist; disabled placeholder otherwise. Sits below the hero inside the wrapper. Uses `.year-page-nav`, `.hero-year-arrow`, `.hero-year-arrow--disabled`.

**Metadata list / summary rows:** used for date, location, host, status, and equivalent facts.

**Empty state:** used when a page is valid but has no content.

**Notice / coming-soon block:** used for temporary incompleteness or intentionally stubbed sections.

**CSS class vocabulary:**

The vocabulary is split into shared (required across all public pages) and per-section (required only within that section). Class definitions live in `src/public/css/style.css`; this catalog names the groups and points at the source for the full enumeration. Every CSS class used in a template must have a corresponding rule in `src/public/css/style.css`; new classes are added to `style.css` and to the appropriate group below.

Shared (required across all public pages):

- Site frame: `.wrapper`, `.site-header`, `.site-logo`, `.main-nav`, `.site-footer`.
- Hero: `.hero`, `.hero-sm` (default 36px padding; `.hero` without `.hero-sm` reserved for large-format hero use), `.hero-eyebrow`, `.hero-subtitle`, `.hero-hashtag`. Hero text classes use white with reduced opacity for dark-gradient contrast.
- Sections, cards, badges, buttons, states, notices: `.section-heading`, `.section-count`, `.card-grid`, `.card`, `.card-title`, `.card-meta`, `.card-description`, `.card-actions`, `.card-secondary-link`, `.badge`, `.badge-{published,registration_full,closed,completed}`, `.btn`, `.btn-primary`, `.btn-outline`, `.empty-state`, `.notice`.
- Notice cards (in-page advisories): `.notice-card` plus variants `.notice-card--info`, `.notice-card--info-blue`, `.notice-card--warn`, `.notice-card--warn-strong`. Distinct from `.notice` (subtle inline text below a section heading).
- Nav and form utilities: `.nav-logout`, `.nav-logout-btn`, `.form-hint`, `.profile-identity-block`, `.avatar-edit-row`.
- Spacing utilities (Tailwind-style; 1 unit = 4px): margin-top `.mt-1` through `.mt-10`; margin-bottom `.mb-2` through `.mb-8`; `.m-0`, `.my-4`, `.pt-6`, `.pl-5`. Use these instead of inline `style="margin:..."`.
- Width utilities (Tailwind-style; 1 unit = 4px): `.w-12`, `.w-20`, `.w-30`, `.w-50`. Use for table column widths and short input sizing.
- Type utilities: `.text-muted`, `.text-secondary` (HoF/BAP teal, `var(--secondary)`), `.text-center`, `.fs-{sm,xs,xxs,mini}`, `.fw-{500,600}`, `.op-60`, `.ws-pre-line`, `.truncate-50`.
- Row-state utilities (internal QC pages only): `.row-flagged`.
- Layout: `.pagination-row` (flex row with gap and 1rem vertical margin for prev/next pagination).
- Footer: `.footer-brand-block`, `.footer-logo`, `.footer-tagline`, `.footer-links`, `.footer-legal`, `.footer-legal-links`, `.footer-copy`.

Per-section vocabularies (required only within that section; full enumerations in `src/public/css/style.css`):

- Legal page (`/legal`): `.legal-toc`, `.legal-section`, `.legal-last-updated`.
- Clubs section: country nav (`.club-country-nav*`), country sections (`.club-section`, `.club-region-heading`), club list (`.club-list`, `.club-entry`, `.club-name`, `.club-location`, `.club-hashtag`, `.club-external-link`), club leaders summary on country page (`.club-leaders-summary`, `.club-leaders-label`, `.club-leader-name`, `.club-leaders-overflow`), club vitality meta row (`.club-meta-row`, `.club-meta-row--*` modifier per status label, `.club-meta-chip`, `.club-meta-sep`), club detail (`.club-detail*`), club snapshot (`.club-snapshot`, `.club-snapshot--*` modifier per status label, `.club-snapshot-heading`, `.club-snapshot-list`, `.club-status-label`).
- Members section: profile layout (`.profile-layout`, `.profile-sidebar`, `.profile-main`), avatar card (`.profile-avatar-*`), profile text (`.profile-name`, `.profile-location`, `.profile-honor-badge`), profile sections, caption helpers (`.profile-bap-caption`), account list, links grid.
- Events section: archive years (`.year-grid`, `.year-pill`), year page navigation, year archive event list (`.event-list*`), event detail layout (`.event-detail*`), disciplines (`.disciplines-list`, `.discipline-tag`), results (`.results-section*`, `.results-table`, `.placement-num`, `.participants-list`, `.score-text`, `.no-results-notice`).
- Freestyle section: landing wrapper (`.freestyle-landing`), hero with mascot (`.hero-with-mascot`, `.hero-mascot`), tile cards (`.card-tile`, `.format-card`), embedded video wrapper (`.video-embed`), stats strip (`.stats-strip`), trick-dictionary view toggle (`.trick-view-toggle`, `.trick-view-toggle-active`, `.trick-view-toggle-sep`), trick-dictionary coverage summary (`.trick-coverage-summary`, `.trick-coverage-counts`, `.trick-coverage-note`), trick-dictionary ADD-grouped layout (`.trick-add-group`, `.trick-list`, `.trick-row`, `.trick-row--external-placeholder`, `.trick-row-header`, `.trick-name`, `.trick-add-chip`, `.trick-add-chip--unrated`, `.trick-family-chip`, `.trick-category-chip`, `.trick-media-chip`, `.trick-media-chip--tutorial`, `.trick-media-chip--demo`, `.trick-media-chip--missing`, `.trick-media-chip--available` (legacy alias), `.trick-status-badge`, `.trick-notation`, `.trick-notation--missing`, `.trick-description`, `.trick-description--missing`, `.trick-aliases`, `.trick-placeholder-note`), trick-detail pathways cross-link block (`.trick-pathways`, `.trick-pathway-list`, `.trick-pathway`, `.trick-pathway--learn`, `.trick-pathway--watch`, `.trick-pathway--family`, `.trick-pathway--empty`, `.trick-pathway-title`, `.trick-pathway-primary`, `.trick-pathway-secondary`, `.trick-pathway-link`), trick-dictionary sets-grouped layout (`.trick-set-group`, `.trick-set-type`), family-filtered cross-link block (`.related-set-groups`, `.related-set-groups-label`, `.related-set-group-link`, `.related-set-group-count`, `.related-set-group-sep`), trick-detail reference-media split (`.reference-media-subsection`, `.reference-media-subsection--tutorials`, `.reference-media-subsection--demos`, `.reference-media-subheading`), operator-board partial (`.operator-board`, `.operator-board-heading`, `.operator-board-lede`, `.operator-tier`, `.operator-tier-set`, `.operator-tier-body`, `.operator-tier-structural`, `.operator-tier-eyebrow`, `.operator-tier-title`, `.operator-tier-intro`, `.operator-grid`, `.operator-card`, `.operator-glyph`, `.operator-name`, `.operator-action`, `.operator-example`, `.operator-example-input`, `.operator-example-arrow`, `.operator-example-result`, `.operator-card-deeplink`), intermediate-operator reference (`.glossary-intermediate-operators`, `.glossary-operator-pending-flag`, `.glossary-operator-meaning`, `.glossary-operator-decomposition`, `.glossary-operator-decomposition-label`, `.glossary-operator-pending-note`, `.glossary-operator-examples`, `.glossary-operator-lineage`), operator-board landing footer link (`.operator-board-footer-link`).
- Internal QC tooling (`/internal/*`): decision forms (`.rc-decision-form`, `.rc-{approved,rejected,deferred}`), net review item editor (`.review-edit-row`, `.review-edit-forms`, `.review-inline-form`).
- Simulated email card (dev/sandbox only; partial renders nothing in production): container variants (`.sec-card`, `.sec-card-dev`, `.sec-card-sandbox`), inner elements (`.sec-card .sec-{body,table,msgid}`).


### 4.4 Implementation rules

The standard must be implemented through reusable code.

**Express and controller rules:**

- Routes return HTML pages.
- Controllers stay thin; page shaping belongs in services or page-model builders.
- Shared site-wide data may be injected through `app.locals` and `res.locals`.
- Error mapping runs through `handleControllerError` in `src/lib/controllerErrors.ts` (per §8.2).
- Session cookies are set or cleared through `issueSessionCookie` and `clearSessionCookie` in `src/lib/sessionCookie.ts`; controllers never write `Set-Cookie` directly.

**Service-owned shaping helpers.** Services are the single source of URL construction and cross-entity shape. Templates receive pre-shaped hrefs and labels; they never construct URLs or apply domain rules. Current shared helpers:

- `personHref(memberSlug, historicalPersonId)`: canonical person-detail URL (`/members/:slug` or `/history/:personId`), or `null` when no linkable identity exists.
- `shapePartnershipPair(row)`: shapes a two-person doubles partnership into the view-model pair used by net and freestyle partnership surfaces.
- `shapeFreestyleRecord(row)`: shapes a `FreestyleRecordRow` into the public `FreestyleRecordViewModel`, stripping pipeline-curation metadata.
- `groupPlayerResults(rows)`: groups flat player-result rows into per-event and per-discipline view-model groups.

Helpers live alongside the service that owns their shape (`src/services/*Shaping.ts`) or inside the service module itself when scoped to one consumer.

**Handlebars rules:**

- Shared structure lives in reusable partials and components.
- Templates remain logic-light.
- Helpers, when used, remain presentation-oriented.
- Templates do not own business rules or infer domain behavior from raw data.
- Forms must preserve user-submitted state on validation-error re-render. Every state control (radio, checkbox, `<select>`, CSS-only tab radio) must honor the corresponding `formValues.X` value via a conditional `checked` / `selected` attribute. Hardcoded defaults are only acceptable for the very first render when `formValues` is absent. Text inputs (`<input type="text">`, `<textarea>`) similarly use `value="{{formValues.X}}"`. File inputs cannot be re-populated by the server (browser security); the form's error-banner copy should make re-selection expected. The reason: a 422 that drops user state is a worse UX than the original error.

**CSS rules.** The visual system is organized as reusable layers:

- design tokens
- base and global styles
- layout styles
- reusable component styles
- minimal page-specific exceptions only when unavoidable

Hard rules: every CSS class used in a template has a corresponding rule in `src/public/css/style.css`; no undefined classes. New classes are documented in §4.3. Hero content (honors, location) is not duplicated in the page body; choose one canonical placement per data element.

**Asset rules.** The application enforces a strict Content-Security-Policy (`script-src 'self'`, `style-src 'self'`, `script-src-attr 'none'`, `frame-ancestors 'none'`). Templates and partials must therefore satisfy:

- No inline `style="..."` attributes. Use a class from §4.3; if styling does not yet have a class, add the class to `style.css` and document it in §4.3.
- No inline `<script>...</script>` blocks. Client behavior lives in `src/public/js/*.js` files loaded via `<script src="..." defer>`. The single permitted exception is non-executable JSON data islands declared as `<script type="application/json" id="...">{{{ jsonViewModel }}}</script>` and parsed by an external script.
- No inline `<style>...</style>` blocks in templates or partials. All CSS lives in `src/public/css/style.css`. Internal-tooling pages (`/internal/*`) follow the same rule.
- No inline event-handler attributes (`onclick`, `onchange`, `onsubmit`). Attach handlers from external JS using `addEventListener` on a class or `data-*` selector.
- Externally-hosted assets (CDNs, fonts, images, iframes) must be added to the CSP directive list in `src/app.ts` at the same time the reference is added to the template.

### 4.5 Visual rules

All public pages present a consistent public experience: clean, readable, content-first layout; consistent spacing and max width; consistent typography hierarchy; consistent card and metadata treatment; consistent empty-state and notice styling; consistent header and footer behavior; no section-specific chrome systems.

Visual token baseline (from `src/public/css/style.css`): font stack Inter, Helvetica Neue, Arial, sans-serif; primary accent green (`#1bb36b`); secondary accent teal (`#0b5e6b`); white page background; soft-gray borders; rounded cards with light drop shadow; generous whitespace, clean editorial layout, not dense app chrome.

## 5. Public route catalog

| Route | Page | Purpose |
| --- | --- | --- |
| `GET /` | Home | Public landing page |
| `GET /events` | Events index | Browse upcoming events and archive entry points |
| `GET /events/year/:year` | Events year archive | Browse completed events for one year |
| `GET /events/:eventKey` | Event detail | Canonical public event page |
| `GET /members` | Members welcome | Public membership-information page with tier explainer and join CTAs (CTAs hidden for authenticated visitors) |
| `GET /members/:memberKey` | Member profile | Own profile or public HoF/BAP read-only view |
| `GET /members/:memberKey/edit` | Member profile edit | Own-profile edit form |
| `POST /members/:memberKey/avatar` | Member avatar upload | Multipart upload endpoint (inline on edit page; no GET route) |
| `GET /members/:memberKey/galleries` | Member galleries list | Owner-only list with create, edit, delete actions |
| `GET /members/:memberKey/galleries/new` | Member gallery create | Owner-only new-gallery form |
| `GET /members/:memberKey/galleries/:id/edit` | Member gallery edit | Owner-only edit form for a member-owned gallery |
| `GET /members/:memberKey/media/upload` | Member upload | Owner-only form to upload one photo or submit one video URL |
| `GET /members/:memberKey/contact-admin` | Contact IFPA admin form | Owner-only structured contact-request form (category + message); inserts a `member_contact_request` row in the admin work queue |
| `GET /members/:memberKey/:section` | Member account stub | Placeholder pages for future account subsections |
| `GET /history` | Historical players redirect | 301 redirect to `/members` |
| `GET /history/:personId` | Historical player detail | Historical person competitive record detail |
| `GET /history/:personId/claim` | HP claim confirmation | Historical-person direct claim confirm page |
| `POST /history/:personId/claim/confirm` | HP claim execution | Direct HP claim handler |
| `GET /clubs` | Clubs index | Country-grouped clubs directory entry |
| `GET /clubs/:key` | Clubs shared handler | Dispatches to country page or club detail |
| `GET /media` | Media hub | Public hub listing every named-gallery URL bookmark |
| `GET /media/browse` | Media tag browse | On-the-fly tag browse and temp gallery |
| `GET /media/:galleryId` | Named gallery | Single named-gallery page, items computed at request time |
| `GET /login` | Login | Member login |
| `GET /register` | Register | Member registration |
| `GET /register/check-email` | Check-email landing | Generic post-registration and post-resend landing |
| `GET /register/wizard/:taskType` | Onboarding wizard task page | Renders the task-specific view for `legacy_claim`, `club_affiliations`, `first_competition_year`, `show_competitive_results`; idempotent task-list bootstrap on first GET; unknown `:taskType` returns 404 |
| `POST /register/wizard/:taskType/skip` | Onboarding wizard skip | Marks the task `skipped` and 303-redirects to the next outstanding task page (or `/register/wizard/complete` when none remain) |
| `POST /register/wizard/legacy_claim/find` | Wizard manual-id lookup | Legacy-account lookup; per §8.4, 303-redirects to the next task on fast-path or to the same step with a `WIZARD_LEGACY_CLAIM_RESULT` flash carrying optional `hpPersonId` and `sinceIndex` |
| `POST /register/wizard/legacy_claim/auto-link/confirm` | Wizard auto-link confirm | Re-validates classifier; commits the HP claim and 303-redirects to the next task, or 303-redirects to the legacy_claim step with a `WIZARD_AUTO_LINK_DRIFT` flash when the classifier no longer holds |
| `GET /register/wizard/legacy_claim/claim/confirm/:token` | Wizard claim-token review | Peek-only token review page reached from the claim email |
| `POST /register/wizard/legacy_claim/claim/confirm` | Wizard claim-token consume | Consumes the token and runs the merge; 303-redirects to the next task |
| `POST /register/wizard/first_competition_year/submit` | Wizard year submit | Writes `members.first_competition_year`; 303-redirects to the next task |
| `POST /register/wizard/show_competitive_results/submit` | Wizard results-visibility submit | Writes `members.show_competitive_results`; 303-redirects to the next task |
| `GET /register/wizard/complete` | Onboarding wizard complete | Terminal page rendered when no outstanding tasks remain |
| `GET /verify/:token` | Email-verify link | Consume verification token; issue session |
| `GET /password/forgot` | Password forgot | Form to request a password-reset email |
| `GET /password/reset/:token` | Password reset | Form to set a new password from an email link |
| `GET /members/:memberKey/edit/password` | Member password edit | Own-profile change-password form |
| `GET /hof` | HoF landing | Footbag Hall of Fame editorial landing page |
| `GET /bap` | BAP landing | Big Add Posse editorial landing page |
| `GET /freestyle` | Freestyle landing | Freestyle section entry page |
| `GET /freestyle/records` | Freestyle records | Freestyle world records authoritative list |
| `GET /freestyle/leaders` | Freestyle leaders | Freestyle leaders list |
| `GET /freestyle/about` | Freestyle about | Freestyle discipline overview |
| `GET /freestyle/sets` | Freestyle moves | Freestyle moves reference (legacy `/freestyle/moves` 301-redirects) |
| `GET /freestyle/glossary` | Freestyle glossary | Domain glossary for freestyle terminology |
| `GET /freestyle/tricks` | Freestyle tricks index | Trick dictionary browse |
| `GET /freestyle/tricks/:slug` | Freestyle trick detail | Detail page for a single freestyle trick |
| `GET /freestyle/competition` | Freestyle competition | Results-derived competition analytics |
| `GET /freestyle/partnerships` | Freestyle partnerships | Doubles partnerships from competition results |
| `GET /freestyle/history` | Freestyle history | Editorial history, pioneers, eras |
| `GET /freestyle/insights` | Freestyle insights | Analytical insights |
| `GET /records` | Consecutive records | Consecutive kicks world records |
| `GET /net` | Footbag Net landing | Footbag Net section entry page |
| `GET /net/teams` | Net teams list | League-table view of net doubles teams |
| `GET /net/teams/:teamId` | Net team detail | Team detail with stats and history |
| `GET /net/events` | Net events list | Net events ordered by recency |
| `GET /sideline` | Sideline landing | Casual / social footbag games portal |
| `GET /rules` | Rules index | Top-level index of rule pages, grouped by discipline |
| `GET /rules/:disciplineSlug/:ruleSlug` | Rule detail | Single rule page from `ifpa/rules/{discipline}.md` |
| `GET /ifpa` | IFPA hub | Top-level index of IFPA governance documents (membership rules, bylaws, articles of incorporation) |
| `GET /ifpa/:docSlug` | IFPA doc detail | Single governance doc rendered from `ifpa/*.md` with TOC anchors |
| `GET /legal` | Legal | Privacy, Terms of Use, Copyright and Trademarks single page |
| `GET /health/live` | Operational endpoint | Liveness check (not a cataloged page) |
| `GET /health/ready` | Operational endpoint | Readiness check (not a cataloged page) |

### Route rules

- `GET /` is the canonical public home route.
- `GET /events` is the canonical events section entry; `GET /events/:eventKey` is the canonical public event detail; `GET /events/year/:year` is the year archive.
- `GET /members` is the public membership-information page. It renders the same tier explainer to every visitor; the sign-up and login CTAs are visible only when unauthenticated. The authenticated personal home (membership block, identity, quick actions, member search, coming-soon) lives on the profile at `GET /members/:memberKey`.
- `GET /members/:memberKey` is the canonical member profile route. It serves the owner's profile when authenticated as that member, and serves a limited public read-only profile for HoF/BAP members.
- `POST /members/:memberKey/avatar` is the multipart avatar upload endpoint; there is no GET route (upload is inline on the edit page).
- `GET /members/:memberKey/galleries` is the owner-only list of the member's named galleries. Slug mismatch returns 404 (anti-enumeration), matching the rest of the `/members/:memberKey/` block. `GET /members/:memberKey/galleries/new` and `GET /members/:memberKey/galleries/:id/edit` render create and edit forms; `POST /members/:memberKey/galleries`, `POST /members/:memberKey/galleries/:id/edit`, `POST /members/:memberKey/galleries/:id/delete`, and `POST /members/:memberKey/media/upload` are form-action handlers and are not cataloged separately. The four mutating POST routes carry a route-layer tier gate (`requireTier1Benefits`): a Tier 0 member with no Active Player grant gets 403 before the controller runs. Service-layer authorization (admin OR owner) is the source of truth for write authorization; the route layer's slug check and tier gate are defense-in-depth on top of the service-layer assertion.
- `GET /members/:memberKey/:section` is the account stub-page route for explicitly supported account sections.
- `GET /history` permanently redirects to `/members`. `GET /history/:personId` is the historical person detail.
- `GET /clubs` is the canonical clubs section entry. `GET /clubs/:key` is the shared Express handler for both country page and club detail; the controller dispatches by prefix (a key beginning with `club_` routes to club detail; any other key routes to country page).
- `GET /media` is the canonical public media hub. `GET /media/:galleryId` is the canonical named-gallery page (items computed at request time by tag-AND match against `member_gallery_tags` minus exclude tags). `GET /media/browse` is the on-the-fly tag browse and temp gallery; included and excluded tags travel as query args. Unknown `galleryId` values return 404.
- `GET /login` is the member login route. `POST /login` and `POST /logout` are form-action handlers, not cataloged pages. `POST /logout` clears the session cookie and redirects to the Referer page if present and valid, otherwise `/`.
- `GET /register` is the registration route. `POST /register` is its form-action handler.
- `GET /register/check-email` is the generic post-registration and post-resend landing. It never reveals whether an account exists for a given address.
- `GET /verify/:token` consumes an email-verification token. Success issues a session cookie and redirects to the legacy-link check when the member's email matches a legacy row, or to the dashboard otherwise. Invalid, expired, or used tokens render an identical generic error page (enumeration-safe).
- `POST /verify/resend` is the form-action handler for the resend form on `/register/check-email`. The response is identical regardless of membership or rate-limit state.
- `GET /password/forgot` is the password-reset request form. `POST /password/forgot` is its form-action handler; the response is identical regardless of membership.
- `GET /password/reset/:token` is the password-reset form reached from the emailed link. `POST /password/reset/:token` is its form-action handler; on success it issues a fresh session cookie (new `passwordVersion`) and redirects to `/members`.
- `GET /members/:memberKey/edit/password` is the own-profile change-password form. `POST /members/:memberKey/edit/password` is its form-action handler; on success it re-issues the session cookie with the bumped `passwordVersion` so the current browser stays authenticated.
- `GET /hof` and `GET /bap` are the canonical HoF and BAP section entry routes.
- `GET /freestyle` is the canonical freestyle section entry; sub-routes (`/freestyle/records`, `/freestyle/leaders`, `/freestyle/about`, `/freestyle/sets`, `/freestyle/tricks`, `/freestyle/tricks/:slug`, `/freestyle/competition`, `/freestyle/partnerships`, `/freestyle/history`, `/freestyle/insights`) are public and unauthenticated.
- `GET /records` is the canonical records section entry and the single page in the records section.
- `GET /net` is the canonical net section entry; portal landing with hero, mascot, narrative, Singles/Doubles competition-format cards, and pathways into data sub-routes. `GET /net/teams` lists doubles teams ordered by appearance count; `GET /net/teams/:teamId` is the team detail route, returning 404 for unknown team IDs. All team-data pages render the disclaimer: "Team identities are algorithmically constructed from placement data and may not reflect official partnerships."
- `GET /sideline` is the canonical sideline section entry. Static hero plus per-game sections (Circle Kicking, 2-Square, 4-Square, Consecutive Kicks, Footbag Golf) with cartoon icons and per-game demo `.webm` clips. All "MORE INFO" links route internally to `/rules/sideline/{slug}`; the page contains zero offsite links.
- `GET /rules` is the canonical rules section entry; lists every rule page grouped by discipline. `GET /rules/:disciplineSlug/:ruleSlug` is the canonical rule-detail route, returning 404 for unknown discipline or slug. Rule pages render zero offsite hyperlinks; cross-language alternates exposed via a frontmatter-driven internal toggle button.
- `GET /legal` is the canonical legal page. Public unauthenticated single page composing Privacy, Terms of Use, and Copyright and Trademarks as three anchored sections (`#privacy`, `#terms`, `#copyright`). Footer links across the site deep-link to these anchors.
- Health routes are operational and outside the cataloged page system.

## 6. Public page matrix

One row per public route. The "Required rendering pattern" column carries the load-bearing target invariants for the page; sensitive-page detail (anti-enumeration, owner-only, public/private boundary, scope language) lives in §7.

**Compact symbolic-object visual system (freestyle surfaces).** The `#slug` / `≡ equivalence` / notation / ADD-chip primitive renders identically across the landing Core Tricks grid (`.core-trick-object`), the glossary compression-flow (`.core-trick-object.glossary-compression-card`), and the trick dictionary browse (`.dict-card`). All three surfaces share the same typography hierarchy, ADD-chip outline treatment, and minimal containment styling (no left borders, no min-height, no fills). Typography + grid gap carry object identity. The `.dict-card-title::before` CSS rule injects the `#` glyph on dictionary cards so the slug-form identity matches landing and glossary surfaces without changing rendered HTML.

**Equivalence-reading sources.** `≡` readings on dictionary cards are merged from two curator-authored sources: `src/content/freestyleSymbolicEquivalences.ts` (multi-reading compositional chains for compounds; stopping-depth-aware) and `src/content/freestyleAliasGovernance.ts` (restraint-first allow-list for atom-level canonical aliases drawn from `freestyle_trick_aliases`). Aliases NOT explicitly approved in the allow-list are not surfaced on compact browse surfaces. The legacy `dict-card-aliases` text row is retired.

| Page | Route | Service / method | Audience | Required rendering pattern | Source |
| --- | --- | --- | --- | --- | --- |
| Home | `GET /`  | `HomeService.getPublicHomePage` | Public | Composition-page exception per §3.5 (no `PageViewModel` envelope); shared layout, tokens, section identity, thin-controller, service-owned shaping; rich editorial composition allowed within the same Express + Handlebars + vanilla TS architecture; YouTube media renders as click-to-play facade with link fallback. | `src/controllers/homeController.ts`, `src/views/home/index.hbs` |
| Members welcome | `GET /members` | `MemberService.getMembersWelcomePage` | Public; authenticated and unauthenticated both see the same informational page | `PageViewModel<MemberWelcomeContent>`; `content.tiers[]` iterates the four canonical tier labels (Tier 0 Registered Member, Tier 1 IFPA Member, Tier 2 IFPA Organizer Member, Tier 3 IFPA Director), each with a USD price string (`Free`, `$10 USD`, `$50 USD`, `Assigned by IFPA`) and a per-tier benefits list sourced from `ifpa/IFPAMembershipStructure_2026.md` §1 and the `M_Purchase_Tier_1` / `M_Purchase_Tier_2` success messages. The profile membership block (per `M_View_Tier_Status`) uses the separate high-level `tierBenefitsBlurb`. `content.showJoinCtas` gates the Sign Up and Log In cards (true only when the visitor is unauthenticated), and on the rendered page the cards appear above the tier explainer so first-time visitors see the join action first. No search affordance: member search is authenticated-only per `M_Search_Members` and lives on the personal home. | `src/controllers/memberController.ts`, `src/views/members/welcome.hbs` |
| Member profile / personal home | `GET /members/:memberKey` | `MemberService.getOwnProfile` (owner, accepts `?q=` for member search) / `MemberService.getPublicProfile` (public HoF/BAP) | Owner OR public HoF/BAP | Owner view (`PageViewModel<OwnProfileContent>`) is the authenticated personal home: composes membership (per `M_View_Tier_Status`: tier badge, second-person benefits blurb, "View IFPA membership rules" link to `/ifpa`, Active Player line for Tier 0 with formatted expiry, underlying-tier text for Tier 3, upgrade-CTA visibility flags), identity (legacy-account and historical-person link state with CTA to the onboarding wizard's `legacy_claim` task when either link is missing), quick-actions (slug-scoped links to profile-edit, galleries, upload), member search (form posts back to `/members/:memberKey?q=`; results from `searchMembers` reading `members_searchable`; min 2 chars; 20-result cap with `hasMore` and `tooShort` flags; results show display name, country, honor badges only), and coming-soon feature cards for unbuilt M_ surfaces, alongside the existing About / Competitive Results / Account sections. Contact-field visibility via `email_visibility`; non-owner non-HoF/BAP fails closed. Public view (`PageViewModel<PublicProfileContent>`) remains the limited HoF/BAP read-only profile. See §7.1. | `src/controllers/memberController.ts`, `src/views/members/profile.hbs` |
| Member profile edit | `GET /members/:memberKey/edit` | `MemberService.getProfileEditPage` | Owner only | `PageViewModel<ProfileEditContent>`; read-only identity block (name, login email, profile URL) with a "Contact IFPA admin" link to `/members/:memberKey/contact-admin` for corrections; onboarding wizard CTA to the `legacy_claim` task shown when legacy-account or historical-person link is missing, hidden when both are linked; avatar upload inline via multipart form posting to `/members/:memberKey/avatar`; `member_links` max 3 URLs validated as https. | `src/controllers/memberController.ts`, `src/views/members/profile-edit.hbs` |
| Member avatar upload | `POST /members/:memberKey/avatar` | `createAvatarService(...).uploadAvatar` | Owner only | Multipart endpoint; JPEG/PNG only; 5 MB size limit; replaces existing avatar atomically; no GET route. | `src/controllers/memberController.ts` |
| Member galleries list | `GET /members/:memberKey/galleries` | `CuratorMediaService.listGalleriesForOwner` | Owner only | `PageViewModel<MemberGalleriesListContent>`; slug mismatch returns 404 (anti-enumeration); per-row Edit/View/Delete plus "Upload media" and "Create new gallery" links; `savedFlag` drives success banner (`'create' | 'edit' | 'delete' | 'upload' | null`). See §7.4. | `src/controllers/memberGalleryController.ts`, `src/views/members/galleries-list.hbs` |
| Member gallery create | `GET /members/:memberKey/galleries/new` | (none — controller renders an empty form) | Owner only | `PageViewModel<MemberGalleryNewContent>`; shared `partials/gallery-edit-form.hbs`; multipart-encoded form with optional inline photo upload widget (carries a user-supplied `uploadTags` field, criteria-as-suggestion); slug mismatch 404; `formAction` posts to `/members/:memberKey/galleries`. | `src/controllers/memberGalleryController.ts`, `src/views/members/gallery-new.hbs` |
| Member gallery edit | `GET /members/:memberKey/galleries/:id/edit` | `CuratorMediaService.getGalleryForEdit` | Owner only | `PageViewModel<MemberGalleryEditContent>`; pre-populated shared form; read-only thumbnail display of current items (each linking to the item's edit page); inline photo upload widget with user-supplied `uploadTags`; external-link label+URL inputs (validated per DD §3.17, capped by `config.galleryMaxExternalLinks`); inline field-level errors next to the offending input; 404 when gallery does not exist OR is not owned by the authenticated member; `formAction` posts to `/members/:memberKey/galleries/:id/edit`. | `src/controllers/memberGalleryController.ts`, `src/views/members/gallery-edit.hbs` |
| Member upload | `GET /members/:memberKey/media/upload` | `MediaGalleryService` (no specific read method; controller assembles form values) | Owner only | `PageViewModel<MemberMediaUploadContent>`; CSS-only tabbed mediaType selector (photo / video link); photo file picker (JPEG/PNG up to 25 MB); video URL fields (YouTube/Vimeo); shared caption (max 500 chars), tags, and external URL fields; uploads auto-tagged with uploader's slug-tag; slug mismatch 404. Works without JavaScript for the entire flow. | `src/controllers/memberMediaUploadController.ts`, `src/views/members/media-upload.hbs` |
| Member account stub | `GET /members/:memberKey/:section` | `MemberService` (per-section) | Owner only | `PageViewModel`; supported sections `media`, `settings`, `password`, `download`, `delete`; unsupported sections fail closed. | `src/controllers/memberController.ts`, `src/views/members/account-stub.hbs` |
| Historical players redirect | `GET /history` | `historyController` (permanent redirect) | Public | 301 to `/members`. | `src/controllers/historyController.ts` |
| Historical player detail | `GET /history/:personId` | `HistoryService.getHistoricalPlayerPage` | Public for HoF/BAP; auth required otherwise | `PageViewModel<HistoricalPlayerDetailContent>`; controller-level auth check (loads person, checks honor flags, redirects unauthenticated to `/login?returnTo=/history/{personId}` for non-honored persons); `eventGroups[]` with service-computed `eventHref`; per-row `participantHref` via `personHref()` (resolves to `/members/{slug}` or `/history/{personId}`); historical-only persons must not imply current-member capabilities or contactability. | `src/controllers/historyController.ts`, `src/views/history/player-detail.hbs` |
| Onboarding wizard task page | `GET /register/wizard/:taskType` | `MemberOnboardingService` + per-task delegated services | Authenticated only; redirect to `/login?returnTo=...` on unauthenticated visit | `PageViewModel<TaskContent>` keyed by task type. `legacy_claim`: unified candidate list per §7.7. `club_affiliations`: stage-aware view-model per MIGRATION_PLAN §9.3. `first_competition_year` and `show_competitive_results`: simple forms. Each page renders a `Skip for now` POST and a `Back to dashboard` link to the member's profile. Unknown `:taskType` returns 404. Idempotent `startTaskList` runs on first GET so all four task rows exist. See §7.6a. | `src/controllers/memberOnboardingController.ts`, `src/views/register/wizard/*.hbs` |
| Wizard manual-id lookup | `POST /register/wizard/legacy_claim/find` | `MemberOnboardingService.processLegacyClaimSubmit` | Authenticated only | Non-revealing response regardless of outcome; rate-limited per requesting account, per target row, per session/IP. 303-redirects per §8.4. Fast-path `auto_linked` advances to the next task. `enqueued`, `no_match`, and `target_rate_limited` outcomes redirect to the same step with a `WIZARD_LEGACY_CLAIM_RESULT` flash carrying optional `hpPersonId` (matched HP for the prominent card) and `sinceIndex` (dev simulated-email card scope, confirm URLs under `/register/wizard/legacy_claim/claim/confirm/`). The next GET surfaces the anti-enumeration banner, the prominent HP card when present, and the simulated-email card (dev/sandbox only). See §7.7. | `src/controllers/memberOnboardingController.ts`, `src/services/memberOnboardingService.ts`, `src/views/register/wizard/legacy-claim.hbs` |
| Wizard auto-link confirm | `POST /register/wizard/legacy_claim/auto-link/confirm` | `IdentityAccessService.getAutoLinkClassificationForMember` + `IdentityAccessService.claimHistoricalPerson` | Authenticated only | Re-validates the classifier output at commit time (drift safety); on `high` / `medium` confidence and matching `personId` runs `claimHistoricalPerson` atomically and renders the next task page inline. On classifier drift (no longer high/medium, or `personId` mismatch) re-renders the wizard's `legacy_claim` view; on `ValidationError` re-renders the auto-link confirm template at 422 with a user-safe message. | `src/controllers/memberOnboardingController.ts`, `src/views/history/auto-link-confirm.hbs`, `src/views/register/wizard/legacy-claim.hbs` |
| Wizard claim-token review | `GET /register/wizard/legacy_claim/claim/confirm/:token` | `IdentityAccessService.peekLegacyClaim` | Authenticated only; token bound to the requesting member | Peek-only review reached from the claim email. Renders the wizard's token-confirm view with the matched legacy record fields. Invalid, expired, used, or member-foreign tokens render the generic token-invalid view at 400. | `src/controllers/memberOnboardingController.ts`, `src/views/register/wizard/legacy-claim-token-confirm.hbs`, `src/views/register/wizard/legacy-claim-token-invalid.hbs` |
| Wizard claim-token consume | `POST /register/wizard/legacy_claim/claim/confirm` | `IdentityAccessService.consumeAndClaimLegacy` | Authenticated only; token bound to the requesting member | Consumes the token and runs the merge atomically per the MIGRATION_PLAN merge rules; on success completes the `legacy_claim` task and renders the next task page inline. Single-use enforced: re-consume returns 422 with the generic invalid-token template. Missing or empty token returns 422. | `src/controllers/memberOnboardingController.ts`, `src/views/register/wizard/legacy-claim-token-invalid.hbs` |
| Wizard year submit | `POST /register/wizard/first_competition_year/submit` | `MemberOnboardingService.submitTaskResponse` → `MemberService.setFirstCompetitionYear` | Authenticated only | Writes `members.first_competition_year` (or NULL on empty); validates the value is a whole number between 1972 and the current year; completes the task and renders the next task page inline. Invalid year returns 422 with the form re-rendered and an inline error. | `src/controllers/memberOnboardingController.ts`, `src/views/register/wizard/first-competition-year.hbs` |
| Wizard results-visibility submit | `POST /register/wizard/show_competitive_results/submit` | `MemberOnboardingService.submitTaskResponse` → `MemberService.setShowCompetitiveResults` | Authenticated only | Writes `members.show_competitive_results`; checked toggle writes `1`, missing writes `0`. Completes the task and renders the next task page inline; when this is the last outstanding task, renders the wizard completion page. | `src/controllers/memberOnboardingController.ts`, `src/views/register/wizard/show-competitive-results.hbs` |
| HP claim confirmation | `GET /history/:personId/claim` | `LegacyMigrationService.lookupHistoricalPersonForClaim` | Authenticated only | `PageViewModel<HpClaimConfirmContent>`; surname-match precondition; first-name-variant warning flag (e.g. Dave/David); `ValidationError` with user-safe message on ineligibility. | `src/controllers/historyClaimController.ts`, `src/views/history/hp-claim-confirm.hbs` |
| HP claim execution | `POST /history/:personId/claim/confirm` | `LegacyMigrationService.claimHistoricalPerson` | Authenticated only | Atomic merge; sets `members.historical_person_id`; transitively claims linked `legacy_members` row when present; partial UNIQUE index enforces one live member per HP. | `src/controllers/historyClaimController.ts` |
| Events index | `GET /events` | `EventService.getPublicEventsLandingPage` | Public | `PageViewModel<EventsIndexContent>`; `featuredPromo` shape owned by this catalog; `upcomingEvents[]` rendered with the standard event card; `archiveYears[]` listed; pre-1997 archive note; `registrationStatus` rendered when present, no fallback wording when absent. | `src/controllers/eventsController.ts`, `src/views/events/index.hbs` |
| Events year archive | `GET /events/year/:year` | `EventService.getPublicEventsYearPage` | Public | `PageViewModel<EventsYearArchiveContent>`; pre-1997 years return 404; `formatDate` for displayed dates with same-day suppression; `.event-list` primitive; year navigation primitive (§4.3) below the hero; results not rendered inline (results live on canonical event detail). | `src/controllers/eventsController.ts`, `src/views/events/year-archive.hbs` |
| Event detail | `GET /events/:eventKey` | `EventService.getPublicEventPage` | Public | `PageViewModel<EventDetailContent>`; visibility limited to status `published`, `registration_full`, `closed`, `completed` (other statuses return standard not-found); public key format `event_{year}_{event_slug}` exact-match underscore-based; `participantHref` via `personHref()` (templates render plain text when null). See §7.10. | `src/controllers/eventsController.ts`, `src/views/events/detail.hbs` |
| Clubs index | `GET /clubs` | `ClubService` (read method per code) | Public | `PageViewModel<ClubsIndexContent>`; SVG world map JS-enhanced (hidden on mobile, degrades to country list when JS unavailable); `mapDataJson` injected into `window.__CLUBS_MAP_DATA__`; country list with flag, name, count, link. | `src/controllers/clubsController.ts`, `src/views/clubs/index.hbs` |
| Clubs country page | `GET /clubs/{countryKey}` (shared `:key`) | `ClubService` (read method per code) | Public | `PageViewModel<ClubsCountryContent>`; anchor nav for state/province sections when 2+ named regions exist; each region carries `id="region-{regionSlug}"` for future map anchor; each entry carries `data-club-id="{clubId}"` for future map pin; unnamed-region clubs appear last under no heading; per-club leader summary shows up to 2 display names plus a `+N more` overflow count, sort role-then-alpha, status filter mirrors detail page (no contact details on country page); per-club vitality metadata row renders pre-shaped chips (leader count, member count when > 0, conservative status label `Known leaders` / `Member activity` / `Historical club` / `Needs update`); unknown country returns 404. | `src/controllers/clubsController.ts`, `src/views/clubs/country.hbs` |
| Club detail | `GET /clubs/{clubKey}` (shared `:key`) | `ClubService` (read method per code) | Public | `PageViewModel<ClubDetailContent>`; `clubKey` matches `^club_[a-z0-9_]+$` exactly (no aliasing or fuzzy); leaders section public; `contactEmail` rendered only when `showContact = true`; service filters non-renderable leaders at read query (not in template); club snapshot section renders pre-shaped vitality strings (known leaders count or `None known yet`; members count or `Unknown`; status label); see §7.9. | `src/controllers/clubsController.ts`, `src/views/clubs/detail.hbs` |
| Media hub | `GET /media` | `MediaGalleryService.getMediaHubPage` | Public | `PageViewModel<MediaHubContent>`; lists every named-gallery URL bookmark (FH-owned and member-owned); FH first then alphabetical within each cohort; `byMember` chip lifted from `#by_<slug>` criterion when it resolves to active member (auth-gated profile link); `criteriaTags[]` and `excludeTags[]` chips; per-card `owner` shape (`displayName`, `slug`, `isSystem`); FH-owned card owner rendered as plain text, member-owned as plain text inside card (no nested anchor). | `src/controllers/mediaController.ts`, `src/views/media/hub.hbs` |
| Named gallery | `GET /media/:galleryId` | `MediaGalleryService.getNamedGalleryPage` | Public | `PageViewModel<NamedGalleryContent>`; tag-AND match against `member_gallery_tags` minus `member_gallery_exclude_tags`; filter `moderation_status = 'active'` and `is_avatar = 0`; ordering follows `member_galleries.sort_order`; pagination via `?page=N` (invalid clamps to 1); hero `byMember` chip; per-item `tags[]` as `TagChip[]` linking to `/media/browse?tag=<normalized-without-#>`; video tiles render canonical `VideoMedia` shape via `partials/video-facade.hbs`; unknown `galleryId` returns 404. | `src/controllers/mediaController.ts`, `src/views/media/named-gallery.hbs` |
| Media tag browse | `GET /media/browse` | `MediaGalleryService.getMediaBrowsePage` | Public | `PageViewModel<MediaBrowseContent>`; not a registered named-gallery URL bookmark (no `member_galleries` row, no hub-card listing); repeatable `?tag=` and `?exclude=` plus optional `?page=N`; tokens accepted with or without leading `#`, normalized to `#<lowercase>`, deduplicated, include winning over same-token exclude; `mode = 'browse'` (form pane only when no token resolves) or `mode = 'results'` (form plus paginated tile grid); default sort `upload_desc`, page size 24; pagination prev/next reproduce canonical repeated-arg form; `unresolvedTokens[]` echoes back unresolved criteria. | `src/controllers/mediaController.ts`, `src/views/media/browse.hbs` |
| Login | `GET /login` | `authController` (no service-method wrapper) | Public | `PageViewModel<LoginContent>`; auth-reason notice when `?returnTo` query param present; inline error display; hidden `returnTo` field validated as relative same-site path (starts with `/`, not `//` or `http`); falls back to `/members/{memberKey}` on missing or invalid value. See §7.5. | `src/controllers/authController.ts`, `src/views/auth/login.hbs` |
| Register | `GET /register` | `authController` | Public | `PageViewModel<RegisterContent>`; inline validation errors; safe validation feedback that does not leak protected account information. See §7.5. | `src/controllers/authController.ts`, `src/views/auth/register.hbs` |
| Check-email landing | `GET /register/check-email` | `authController` (with `SimulatedEmailService.getEmailPreview` for dev) | Public | `PageViewModel<CheckEmailContent>`; never reveals whether an account exists for a given address; `SimulatedEmailService` view-model in dev/sandbox mode only (renders nothing in production). See §7.5. | `src/controllers/authController.ts`, `src/views/auth/check-email.hbs` |
| Email-verify link | `GET /verify/:token` | `IdentityAccessService.verifyEmail` | Public | Token consumption; success issues session cookie and redirects to legacy-link check (when member's email matches a legacy row) or to `/members`; invalid, expired, or used tokens render an identical generic error page (enumeration-safe). | `src/controllers/authController.ts`, `src/views/auth/verify-error.hbs` |
| Password forgot | `GET /password/forgot` | `IdentityAccessService.requestPasswordReset` | Public | `PageViewModel<PasswordForgotContent>`; response identical regardless of membership; rate-limited per email per hour. See §7.6. | `src/controllers/authController.ts`, `src/views/auth/password-forgot.hbs` |
| Password reset | `GET /password/reset/:token` | `IdentityAccessService.resetPassword` | Public | `PageViewModel<PasswordResetContent>`; on success issues fresh session cookie with new `passwordVersion` and redirects to `/members`; invalid or expired token renders identical generic error. See §7.6. | `src/controllers/authController.ts`, `src/views/auth/password-reset.hbs` |
| Member password edit | `GET /members/:memberKey/edit/password` | `IdentityAccessService.changePassword` | Owner only | `PageViewModel<PasswordEditContent>`; on success re-issues session cookie with bumped `passwordVersion` so current browser stays authenticated; bumping `password_version` invalidates all other sessions. | `src/controllers/memberController.ts`, `src/views/members/password-edit.hbs` |
| HoF landing | `GET /hof` | `HallOfFameService.getHofLandingPage` | Public | `PageViewModel<HofLandingContent>`; service-shaped (no DB queries); `content.externalLink` provided so templates do not construct the standalone HoF URL. See §7.8. | `src/controllers/hofController.ts`, `src/views/hof/index.hbs` |
| BAP landing | `GET /bap` | `BigAddPosseService.getBapLandingPage` | Public | `PageViewModel<BapLandingContent>`; service-shaped (no DB queries); `content.externalLink` provided so templates do not construct the standalone BAP URL. See §7.8. | `src/controllers/bapController.ts`, `src/views/bap/index.hbs` |
| Freestyle landing | `GET /freestyle` | `FreestyleService.getLandingPage` | Public | `PageViewModel<FreestyleLandingContent>`; freestyle-section primitives (`.freestyle-landing`, `.hero-with-mascot`, `.card-tile`, `.format-card`, `.video-embed`, `.stats-strip`); renders "The Language of Freestyle Footbag" structure (short intro lede + autoplay demo loop), a Basic Components grid (Contact / Set / Dex / Spin / Duck / Delay; Dex carries Direction / Movement type / Support type sub-fields), and a Core Tricks grid of eleven compact symbolic objects (each card: #slug + zero-or-more ≡-readings + optional symbolic notation + ADD; missing rows render `—` with a pending-dictionary-entry footnote). Below: a curated Demonstrations strip (five conceptual slots — Sam Conlon / Classic Circle / Artistic Routine / Modern Technical Shred / Educationally Readable Run — each backed by curator-managed media slots with explicit placeholder rendering when unfilled), preserved competition-formats panel (routine / circle / sick3 / shred30), the operator-board orientation strip (fourteen Tier-1 operators across set / body / structural tiers), a concise three-link orientation block (`Where to go next`), and the portal-cards grid. | `src/controllers/freestyleController.ts`, `src/views/freestyle/landing.hbs` |
| Freestyle records | `GET /freestyle/records` | `FreestyleService.getRecordsPage` | Public | `PageViewModel<FreestyleRecordsContent>`; world records grouped by record type. | `src/controllers/freestyleController.ts`, `src/views/freestyle/records.hbs` |
| Freestyle leaders | `GET /freestyle/leaders` | `FreestyleService.getLeadersPage` | Public | `PageViewModel<FreestyleLeadersContent>`; leaders list. | `src/controllers/freestyleController.ts`, `src/views/freestyle/leaders.hbs` |
| Freestyle about | `GET /freestyle/about` | `FreestyleService.getAboutPage` | Public | `PageViewModel<FreestyleAboutContent>`; freestyle discipline overview. | `src/controllers/freestyleController.ts`, `src/views/freestyle/about.hbs` |
| Freestyle moves | `GET /freestyle/sets` | `FreestyleService.getMovesPage` | Public | `PageViewModel<FreestyleMovesContent>`; set-notation reference compiled from Chris Holden's legacy compilation (footbag.org/freestyle/sets.html); legacy `/freestyle/moves` 301-redirects. | `src/controllers/freestyleController.ts`, `src/views/freestyle/moves.hbs` |
| Freestyle glossary | `GET /freestyle/glossary` | `FreestyleService.getGlossaryPage` | Public | `PageViewModel<FreestyleGlossaryContent>`; domain glossary for freestyle terminology rendered from the curated glossary source; §3 ("How Tricks Are Built") carries the compositional-vocabulary terminology inline (the operator-board partial renders on the landing page and `/freestyle/learn` rather than here); §3 also carries: an intermediate-operator reference subsection (`id='intermediate-operators'`) rendering ten compound/quantifier/directional operator entries with `id='term-{slug}'` anchors for equivalence-chain deep-linking, a torque/mobius symbolic-compression worked example (`id='symbolic-compression-flow'`) rendered with the compact-symbolic-object pattern, and an Execution Mechanics subsection (`id='execution-mechanics'`) collecting several PassBack-adapted execution-mechanics concepts; §8 is "Symbolic Compression" — the section's lead is the maintainer-mandated thesis sentence "The language evolves by compressing recurring compositional structures into shorter readable symbolic forms." cross-linked back to the §3 worked example; §9 (Operational Notation) opens with a semantic-vs-operational layer-contrast table so the layer boundary is unmistakable; §10 (Foundational Tricks) lists eleven irreducible base tricks (clipper, mirage, legover, pickup, illusion, whirl, butterfly, swirl, osis, around-the-world / ATW, orbit); pixie and fairy render in a small set-modifiers subsection below §10 (`id='set-modifiers-tier-1'`) so their `term-{slug}` anchors remain resolvable as set-modifier references rather than as core tricks; §13 connective panels carry a positioning note marking them as transitional educational/dictionary bridges pending future relocation. | `src/controllers/freestyleController.ts`, `src/views/freestyle/glossary.hbs` |
| Freestyle tricks index | `GET /freestyle/tricks` | `FreestyleService.getFreestyleTricksIndexPage` | Public | `PageViewModel<FreestyleTricksIndexContent>`; default beginner ADD-grouped view (groups by integer ADD; unrated rows in an "Unrated / unresolved" bucket; modifiers excluded); per-row card carries name, notation (with "Notation pending" fallback), description (with "Description pending" fallback), aliases, family/category chips, tier-aware media-coverage chip (`Tutorial available` / `Demo only` / `No video yet`, classified via `TUTORIAL_SOURCE_IDS` / `DEMO_SOURCE_IDS`), and a `External source — not yet adjudicated` badge for `is_active=0 review_status='pending'` rows; pending placeholders render inert (no detail-page link); coverage summary shows canonical count, external-only count, sources loaded, sources unavailable, and the transparency note "External-source placeholders are shown for transparency and coverage tracking"; `?view=family` and `?view=category` preserve the legacy family-card and category-table layouts; `?view=sets` projects the dictionary by which set or modifier each canonical trick uses (driven by `freestyle_trick_modifier_links`), with cross-reference to the static set-notation legend at `/freestyle/sets`; optional `?family=<slug>` filters all views to one family. When a family filter is active and at least one in-family trick uses a modifier via `freestyle_trick_modifier_links`, a `Related set/modifier groups` cross-link block surfaces deep-links to `/freestyle/tricks?view=sets#set-{modifier-slug}`. | `src/controllers/freestyleController.ts`, `src/views/freestyle/tricks.hbs` |
| Freestyle trick detail | `GET /freestyle/tricks/:slug` | `FreestyleService.getTrickDetailPage` | Public | `PageViewModel<FreestyleTrickContent>`; reference video gallery filters to curator-uploaded media (`#curated` plus `#freestyle` plus `#trick` plus slug tag) joined to `media_sources` for provenance; `NotFoundError` on unknown slug renders 404; tab title format `Footbag Trick #{slug}`; pathways cross-link block (`content.pathways.{learn,watch,family}`) renders near the top with three pre-shaped summaries (Learn this trick, Watch records, Related families) — each carries `available`, `count`, `primaryText`, `secondaryText`, `href`, `hrefLabel`; service builds anchor hrefs (`#reference-media`, `#passback-records`) and family-filter URLs; templates render with triple-stash for href slots (service-built, no user input). Reference Media section is split by source tier into Tutorials (CANONICAL_TUTORIAL + STRONG_TUTORIAL) and Demos (HIGH_QUALITY_DEMO) subsections; service classifies via TUTORIAL_SOURCE_IDS / DEMO_SOURCE_IDS; passback_records media items are filtered out of both subsections (they render in the Passback Records table). Both Reference Media and Passback Records sections carry matching `id` anchors. Controller selects the rendered template via `content.ux2Pilot`: when the service populates the field, `src/views/freestyle/trick-ux2.hbs` renders the editorial pilot layout (HERO with short summary + featured-media slot, LEARN block with execution / learning notes / prerequisites prose, MEDIA block, REFERENCE tail with collapsed structural decomposition); otherwise `src/views/freestyle/trick.hbs` renders the standard layout. The pilot is service-layer-gated (constant `UX2_PILOT_RAW` in `freestyleService.ts`); current scope is three slugs (`montage`, `matador`, `mind-bender`). | `src/controllers/freestyleController.ts`, `src/views/freestyle/trick.hbs`, `src/views/freestyle/trick-ux2.hbs` |
| Freestyle competition | `GET /freestyle/competition` | `FreestyleService` (competition method) | Public | `PageViewModel<FreestyleCompetitionContent>`; results-derived analytics: top competitors, eras, recent events. | `src/controllers/freestyleController.ts`, `src/views/freestyle/competition.hbs` |
| Freestyle partnerships | `GET /freestyle/partnerships` | `FreestyleService` (partnerships method) | Public | `PageViewModel<FreestylePartnershipsContent>`; doubles partnerships extracted from competition results. | `src/controllers/freestyleController.ts`, `src/views/freestyle/partnerships.hbs` |
| Freestyle history | `GET /freestyle/history` | `FreestyleService` (history method) | Public | `PageViewModel<FreestyleHistoryContent>`; editorial static-curated content. | `src/controllers/freestyleController.ts`, `src/views/freestyle/history.hbs` |
| Freestyle insights | `GET /freestyle/insights` | `FreestyleService` (insights method) | Public | `PageViewModel<FreestyleInsightsContent>`; analytical insights. | `src/controllers/freestyleController.ts`, `src/views/freestyle/insights.hbs` |
| Records | `GET /records` | `RecordsService.getRecordsPage` | Public | `PageViewModel<RecordsContent>`; cross-sport records page; aggregates consecutive-kicks world records, highest scores, progression, milestones, and freestyle passback records into one view-model. | `src/controllers/recordsController.ts`, `src/views/records/index.hbs` |
| Net landing | `GET /net` | `NetService.getNetHomePage` | Public | `PageViewModel<NetHomeContent>`; portal landing with hero/mascot, narrative, Singles/Doubles competition-format cards, Explore-card data-driven grey-out, notable teams, notable players, recent events; statistics firewall (`canonical_only` data only). | `src/controllers/netController.ts`, `src/views/net/index.hbs` |
| Net teams list | `GET /net/teams` | `NetService.getTeamsPage` | Public | `PageViewModel<NetTeamsContent>`; ordered by appearance count descending; conflict-flag-aware discipline label resolution; algorithmic-team disclaimer always rendered. | `src/controllers/netController.ts`, `src/views/net/teams.hbs` |
| Net team detail | `GET /net/teams/:teamId` | `NetService.getTeamDetailPage` | Public | `PageViewModel<NetTeamDetailContent>`; appearances grouped by year descending; `NotFoundError` on unknown ID renders 404; algorithmic-team disclaimer always rendered. | `src/controllers/netController.ts`, `src/views/net/team-detail.hbs` |
| Net events list | `GET /net/events` | `NetService` (events method) | Public | `PageViewModel<NetEventsContent>`; net events ordered by recency with team and appearance counts. | `src/controllers/netController.ts`, `src/views/net/events.hbs` |
| Sideline landing | `GET /sideline` | `SidelineService.getSidelineLandingPage` | Public | `PageViewModel<SidelineLandingContent>`; static content; fixed game list with mascot, optional cartoon icon, optional demo `.webm` video, optional internal-only `moreInfo` link; zero offsite links. | `src/controllers/sidelineController.ts`, `src/views/sideline/index.hbs` |
| Rules index | `GET /rules` | `RulesService.getRulesIndexPage` | Public | `PageViewModel<RulesIndexContent>`; rule pages grouped by discipline ordered `sideline -> net -> golf -> freestyle`; rendered from `ifpa/rules/*.md` via `marked` v14, in-memory cache. | `src/controllers/rulesController.ts`, `src/views/rules/index.hbs` |
| Rule detail | `GET /rules/:disciplineSlug/:ruleSlug` | `RulesService.getRulePage` | Public | `PageViewModel<RulesDetailContent>`; title hero, optional cross-language toggle button (driven by `alternateLanguageHref` plus `alternateLanguageLabel` frontmatter), italic authority and effective-date meta line, optional on-this-page TOC, markdown-rendered `bodyHtml`; H1 becomes rule page with `slugify(headingText)`; H2 receives matching `id` for in-page anchor; zero offsite hyperlinks; `NotFoundError` on unknown slug renders 404. | `src/controllers/rulesController.ts`, `src/views/rules/detail.hbs` |
| Legal | `GET /legal` | `LegalService.getLegalPage` | Public | `PageViewModel<LegalContent>`; three sections in fixed order with stable anchor IDs `privacy`, `terms`, `copyright`; per-section `bodyHtml` pre-shaped by service; `lastUpdated` ISO date rendered. | `src/controllers/legalController.ts`, `src/views/legal/index.hbs` |

## 7. Sensitive page target rules

This section carries the privacy, anti-enumeration, owner-only, and visibility-status invariants that do not compress into a matrix cell. Each subsection is self-contained: it states the target rule for one page or related set of pages without "see other section" cross-refs.

### 7.1 Member profile public/private boundary

`GET /members/:memberKey` serves three audiences with three rendering modes. Mode is selected in the service layer, not the template.

1. **Owner** (authenticated as the member whose slug matches `:memberKey`). `MemberService.getOwnProfile` returns `PageViewModel<OwnProfileContent>` including display name, bio, city/region/country, phone if applicable, login email (always visible to owner), `email_visibility` setting, avatar thumbnail, and account context links. Owner sees edit links and account-management call-to-actions.

2. **Authenticated non-owner viewing a HoF/BAP member**. `MemberService.getPublicProfile` returns `PageViewModel<PublicProfileContent>` with approved non-PII fields only: display name, country, honor badges, bio, optional `member_links`. No edit links. No contact-field exposure. Email is shown only when `email_visibility = 'members'` AND the viewer is authenticated; never to unauthenticated visitors. `email_visibility = 'public'` is not a forward-looking supported value; contact fields are never publicly exposed.

3. **Authenticated non-owner viewing a non-HoF/BAP member**, OR **unauthenticated visitor on any member URL**. Fail closed via standard not-found behavior. No template-level "this profile is private" message; that itself would leak existence.

The privacy gate is enforced at the service layer (`getPublicProfile` returns null for non-HoF/BAP). The controller maps null to 404. The template must not branch on member-tier or honor-flag values to decide what to render; if the service handed it a model, every field in that model is renderable.

### 7.2 Member personal-home auth gate and member-search anti-enumeration

`GET /members` is the public membership-information page. It renders the same tier explainer to every visitor; the sign-up and login CTAs are visible only when unauthenticated. There is no auth gate, no search, no member-data hint of any kind on this page.

The authenticated personal home composing the membership block, identity links, quick actions, member search, and coming-soon feature cards lives on the profile route `GET /members/:memberKey` (owner-only; slug mismatch returns 404, matching the rest of the owner-only `/members/:memberKey/` block). The form posts back to `/members/:memberKey?q=`.

Member search via `?q=` on the profile page:

- Substring match on `display_name_normalized` against the `members_searchable` view (excludes soft-deleted, deceased, opted-out, PII-purged, and unverified rows; the unverified exclusion is the primary mechanism preventing legacy placeholder rows from appearing in results).
- Minimum 2-character query; `tooShort` flag drives the "type at least 2 characters" hint.
- Maximum 20 results; `hasMore` flag drives the "refine your query" hint.
- Results show display name, country, and honor badges only (HoF, BAP, board). No email, no city, no member-internal data.
- No browse-all pagination. No exhaustive list endpoint. The 20-result cap with `hasMore` is intentional anti-enumeration design.
- Search is reachable only from the owner's own personal home; non-owner profile renders (HoF/BAP public view) and the unauthenticated public welcome page do not surface a search affordance.

### 7.3 Member account stub pages and profile edit owner-only block

`GET /members/:memberKey/edit`, `GET /members/:memberKey/edit/password`, and `GET /members/:memberKey/:section` are owner-only: the controller verifies `req.user.slug === req.params.memberKey` and returns 404 on mismatch (anti-enumeration). Template must not render any owner-only content when the model is absent; the controller must not fall through to rendering a page with empty content.

The profile edit page renders a read-only identity block (name, login email, profile URL; none editable on this page) plus the editable bio, location, contact prefs, and external URLs (max 3, validated as https). Avatar upload is inline via a separate multipart form posting to `/members/:memberKey/avatar`. The avatar form follows the same owner-only gate.

Account stub sections: `media`, `settings`, `password`, `download`, `delete`. Unsupported sections fail closed (404, not a generic stub).

### 7.4 Member upload and member gallery management owner-only block

`GET /members/:memberKey/galleries`, `GET /members/:memberKey/galleries/new`, `GET /members/:memberKey/galleries/:id/edit`, and `GET /members/:memberKey/media/upload` are owner-only with anti-enumeration parity: slug mismatch returns 404, matching the rest of the `/members/:memberKey/` block. Edit-form 404 also applies when the gallery does not exist OR is not owned by the authenticated member.

Service-layer authorization (admin OR owner) is the source of truth for write authorization on `POST /members/:memberKey/galleries`, `POST /members/:memberKey/galleries/:id/edit`, and `POST /members/:memberKey/galleries/:id/delete`. The route layer's slug check exists for anti-enumeration parity. A forged `ownerMemberId` in the request body is ignored: the controller takes the owner from the session.

CSRF protection comes from the SameSite=Lax session cookie, Origin-header pinning at the HTTP layer, and `requireAuth`; not from a per-form token. `ValidationError` (including authz failures and shape violations) renders the form re-populated with input and 422 status. `ConflictError` (UNIQUE owner+name on create) renders the form with the conflict message at 422.

Member-owned galleries auto-prepend `#by_<owner_slug>` to validated criteria tags on every create and edit so the gallery's owner-scoping criterion survives DELETE-then-INSERT and cannot be removed by editing. User-supplied `#by_*` tags rejected from input. Gallery edit never mutates item tags — items appear in a gallery iff they carry every criteria tag and no exclude tag, and the edit form's current-items display is read-only.

### 7.5 Auth pages: login, register, check-email, verify, resend

Anti-enumeration applies across all account-existence-sensitive surfaces. Same code path runs for "exists" and "does not exist"; same response shape; same timing.

- `GET /login` renders `PageViewModel<LoginContent>`. Auth-reason notice rendered when `?returnTo` is present. Inline error rendered above the form on failed authentication; the error message must not distinguish "wrong password" from "no such account". `content.returnTo` is validated as a relative same-site path (starts with `/`, not `//` or `http`); invalid or absent values fall back to `/members/{memberKey}`.

- `GET /register` renders `PageViewModel<RegisterContent>` with inline validation errors. Successful registration redirects into the member account flow. Validation feedback must not leak whether the supplied email is already in use; the registration response is identical for "new account created" and "duplicate email; check your inbox".

- `GET /register/check-email` renders the generic post-registration and post-resend landing. The page never reveals whether an account exists for a given address. In dev (`SES_ADAPTER=stub`) and sandbox modes the `simulated-email-card` partial renders with captured stub messages or a sandbox notice; in production the partial renders nothing.

- `POST /verify/resend` is the form-action handler for the resend form on `/register/check-email`. The response is identical regardless of membership state or rate-limit state.

- `GET /verify/:token` consumes the email-verification token. Success issues a session cookie and redirects: to the legacy-link check when the member's email matches a legacy row; otherwise to `/members`. Invalid, expired, used, or wrong-type tokens render an identical generic error page; the page must not distinguish among the failure modes.

### 7.6 Password reset flow

Anti-enumeration applies. Same code path; same response; same timing.

- `GET /password/forgot` renders the request form. `POST /password/forgot` is the form-action handler; response is identical regardless of membership. Rate-limited at 5 requests per email per hour, enforced regardless of email existence.

- `GET /password/reset/:token` renders the form reached from the emailed link. `POST /password/reset/:token` consumes the token (1-hour expiry, unused) and on success: increments `password_version` (invalidating all outstanding JWTs), updates `password_hash`, marks token consumed, issues a fresh session cookie with the new `passwordVersion`, and redirects to `/members`. Invalid, expired, or used tokens render an identical generic error page.

- `GET /members/:memberKey/edit/password` is the own-profile change-password form. On success the controller re-issues the session cookie with the bumped `passwordVersion` so the current browser stays authenticated; all other browser sessions for this member are immediately invalid via the JWT `passwordVersion` check in middleware.

### 7.6a Onboarding wizard and dashboard task widget

The onboarding wizard backed by `MemberOnboardingService` (MIGRATION_PLAN §10, SERVICE_CATALOG §6.1) is the post-verification entry point for outstanding onboarding tasks; the member dashboard hosts a task widget that surfaces the same tasks for resume. Both surfaces call the same service methods and share view-model shapes.

Wizard URL family: `/register/wizard/:taskType` mounted under the `/register/*` group. Per-task POST sub-paths use the action-suffix convention shared with the rest of the codebase: `/skip` for all task types, plus `/find`, `/auto-link/confirm`, `/claim/confirm/:token`, `/claim/confirm` for `legacy_claim`, and `/submit` for the two metadata tasks. The same URL serves the post-verify entry and the dashboard task-widget Resume target. Cataloged in §5.

Wizard PRG: state-changing wizard POSTs follow §8.4. Task-advance and completion outcomes issue 303 to the next-task GET URL or to `/register/wizard/complete`. Transient-notice outcomes (claim submitted, identifier matched a historical person, classifier match drifted) issue 303 to the same step with a signed flash cookie that the next GET consumes for the banner state. Validation errors re-render at 422; rate-limit re-renders at 429 with `Retry-After`. Two wizard flash kinds: `WIZARD_LEGACY_CLAIM_RESULT` carries optional `hpPersonId` (matched HP for the prominent card) and `sinceIndex` (dev simulated-email card scope); `WIZARD_AUTO_LINK_DRIFT` carries no payload. The auth-gate redirect to `/login?returnTo=...` comes from `requireAuth` middleware.

Required auth and CSRF behavior:

- All wizard routes are authenticated; an unauthenticated request redirects to `/login?returnTo=...` per the standard auth-gate pattern.
- State-changing wizard routes are subject to the Origin-pin middleware per DD §3.3; cross-site POSTs are rejected at 403 before reaching the service.
- The wizard never reveals whether the authenticated member has a plausible legacy match outside the service's existing anti-enumeration contract; tasks that the server determines are `not_applicable` are simply not rendered.

Task UI shape: each task renders a single page with the task-specific view-model (unified legacy-and-HP candidate list for `legacy_claim`, multi-stage club picker for `club_affiliations` per MIGRATION_PLAN §9.3 Stages 1A/1B/2A/2B/3A/3B, simple form for `first_competition_year` and `show_competitive_results`), a `Skip for now` action, and a `Complete and continue` action. Per-card actions persist immediately; there is no separate save action. Visual consistency is enforced via the shared wizard layout primitive so all four current tasks render in the same chrome. The `club_affiliations` view-model carries a per-card `confidence` discriminator (`pre_populate` for Stage 2A cards, `onboarding_visible` for Stage 2B cards, `dormant` for Stage 3A revival cards) so the template renders the stage-appropriate framing and per-card question wording. Stage 2A's "I'd like to join" path renders an outbound link to the club's join page on the club detail surface; no signal is recorded by the wizard.

Dashboard task widget: rendered at the member's personal-home view; queries `MemberOnboardingService.getTaskWidget`; shows one row per outstanding task (state `pending` or `skipped`) with a Resume button targeting `/register/wizard/:taskType`. The widget is hidden when no outstanding tasks remain.

### 7.7 Legacy account claim flow

Non-revealing target. `LegacyMigrationService.initiateAccountClaim` returns a generic non-revealing response regardless of outcome: zero matches, multiple matches, ineligible rows, and blocked rows are indistinguishable to the caller. Recommended message: "If an eligible legacy record was found, a claim email will be sent."

Rate limiting applies at `initiateAccountClaim` and resend per requesting account, per target row, and per session/IP. A token may only be consumed by the same `member_id` that initiated the request; consuming while authenticated as a different account is rejected.

`POST /register/wizard/legacy_claim/claim/confirm` runs the merge transaction atomically: marks the target `legacy_members` row claimed (`claimed_by_member_id` plus `claimed_at`; the row is NOT deleted, it persists as the permanent archival record), copies merge fields per the MIGRATION_PLAN merge rules, sets `members.historical_person_id` when the target's `legacy_member_id` matches a `historical_persons.legacy_member_id`, runs the HP-sourced field merge, writes a single tier grant with `reason_code = 'legacy.claim_tier_grant'`, processes confirmed club affiliations and bootstrap-leader confirmations, and marks all outstanding `account_claim` tokens targeting the row as consumed. After successful merge, the wizard completes the `legacy_claim` task and renders the next outstanding task page inline.

`GET /history/:personId/claim` is the direct historical-person claim flow (no legacy-account row required). Surname-match precondition between `members.real_name` and `historical_persons.person_name`; first-name variance (e.g. Dave/David) permitted with a `firstNameWarning` flag on the preview. Service throws a `ValidationError` with a user-safe message on ineligibility. `POST /history/:personId/claim/confirm` executes the direct-HP claim atomically.

### 7.8 HoF and BAP landing scope

`GET /hof` and `GET /bap` are the canonical section entry routes. The current target is the editorial landing page only. The services (`HallOfFameService.getHofLandingPage` and `BigAddPosseService.getBapLandingPage`) are read-only with no DB queries; they shape the page model directly. Templates must not construct the standalone HoF or BAP URLs; the service provides `content.externalLink` for the call-to-action.

Full inductee and roster surfaces are deferred out of scope by design: in-site HoF inductee pages, member-linked HoF records, and richer HoF history are scope-deferred per the `HallOfFameService` entry in `docs/SERVICE_CATALOG.md`. In-site BAP roster pages, induction-year pages, and member-linked BAP records are scope-deferred per the `BigAddPosseService` entry. This is scope language, not status: the design intent is that those surfaces require future curation work that has not been scoped in.

### 7.9 Club detail leader contact gate

`GET /clubs/{clubKey}` renders the canonical public club detail page. The Leaders section is visible to authenticated AND unauthenticated visitors; leader display names are public; contact details are gated.

Each leader entry renders display name, role label (`Leader` or `Co-leader`), optional badge label, optional badge note, and optional contact email. Display name links to `/history/{personId}` when `personId` is present; plain text otherwise. Sort order: `role='leader'` rows first, then `role='co-leader'`; alphabetical within each role; service-computed.

Privacy gate: `contactEmail` MUST NOT appear in the rendered HTML when `showContact` is false. The template branches on `showContact` only; it does not infer from `status` or any other field.

Suppression: leaders with non-renderable status MUST NOT appear in the rendered HTML; the service filters at the read query, not in the template.

Unauthenticated visitors viewing the club detail page see the leaders section with display names but no club member roster; a login prompt or equivalent bounded call-to-action appears in place of the visible roster. Authenticated visitors see only the approved club-member visibility; unresolved affiliations and non-approved roster visibility must not leak through template logic.

### 7.10 Event detail visibility status

`GET /events/:eventKey` renders the canonical public event detail page. Public visibility is limited to events whose `status` is one of `published`, `registration_full`, `closed`, or `completed`. Events with status `draft`, `pending_approval`, or `canceled` resolve through standard not-found behavior; no distinct error state is exposed for non-public events.

Public-key parsing and validation belong in the service layer. The public key format is exactly `event_{year}_{event_slug}`; exactness is underscore-based; the catalog does not authorize hyphen/underscore rewrites, aliasing, or fuzzy matching.

The canonical public event page is one route and one template; render emphasis is expressed through page-model fields such as `primarySection` (set to `details` when no results exist; `results` when results exist), not through alternate public URLs.

When shaping public result rows, set `participantHref` via `personHref(participant_member_slug, participant_historical_person_id)` (resolves to `/members/{slug}` for claimed members, `/history/{personId}` otherwise, null if neither). Templates render plain name when `participantHref` is null; no URL construction in templates.

## 8. Shared public behavior rules

### 8.1 Authorization boundary

Most pages in this catalog are public visitor pages. The following routes require authentication and redirect unauthenticated visitors to `/login?returnTo=<originalUrl>`:

- `GET /history/:personId`: historical player detail (public for HoF/BAP persons; auth required otherwise). `GET /history` (no id) is a public 301 redirect to `/members` and is not auth-gated.
- `GET /register/wizard/:taskType` and the wizard's per-action POST sub-paths (`/skip`, `/find`, `/auto-link/confirm`, `/claim/confirm`, `/claim/confirm/:token`, `/submit`): auth required (route middleware).
- `GET /history/:personId/claim`, `POST /history/:personId/claim/confirm`: auth required (route middleware).
- `GET /members`: auth-gated member dashboard with search.
- `GET /members/:memberKey`: own profile when authenticated as that member; limited public read-only HoF/BAP view otherwise; non-HoF/BAP public access fails closed.
- `GET /members/:memberKey/edit`, `POST /members/:memberKey/edit`: auth required, owner-only.
- `POST /members/:memberKey/avatar`: auth required, owner-only.
- `GET /members/:memberKey/:section`, `GET /members/:memberKey/galleries*`, `GET /members/:memberKey/media/upload`, `GET /members/:memberKey/edit/password`: auth required, owner-only.

Public pages must not expose: member-only data, organizer-only controls, admin controls, internal diagnostics, private participant history, or workflow actions outside the public browsing scope.

### 8.2 Error behavior

Public pages must fail safely. They must not expose stack traces, SQL errors, or internal implementation details.

Service-layer errors map to HTTP responses through `handleControllerError` in `src/lib/controllerErrors.ts`:

| Service error class | HTTP status | Rendered page |
|---|---|---|
| `NotFoundError` | 404 | `errors/not-found` |
| `ValidationError` | 404 | `errors/not-found` (validation details intentionally not leaked to public visitors) |
| `ServiceUnavailableError` | 503 | `errors/unavailable` |
| `ConflictError` | n/a | unhandled by public controller; falls to Express error middleware |
| `RateLimitedError` | 429 | controller sets `Retry-After` from `retryAfterSeconds` and renders a rate-limited response |

Errors not listed delegate to Express's default error middleware. Controllers that do not use `handleControllerError` must still preserve the same status mapping and must not leak service-layer detail into the response body.

### 8.3 Template behavior

Templates may branch only on already-shaped display data such as booleans, empty lists, or presentation-ready sections. They must not parse route semantics, authorization rules, or domain logic. Template prose, debug text, and loop scaffolding must never appear in rendered HTML output.

### 8.4 HTTP response convention

The response-code convention, the explicit-303 rule, the discriminated-union service contract that drives the redirect/render switch, and the rationale for flash cookies over query-string notices are defined in DD §5.2. For new public views and routes:

- The flash cookie is signed with `SESSION_SECRET`, scoped `httpOnly` with `sameSite=lax` and `path=/`, and carries a 60-second TTL. Value format is `<kind>` or `<kind>:<payload>` with split on the first colon only.
- A new transient-notice surface adds a new `FLASH_KIND` value in `src/lib/flashCookie.ts`. The receiving GET reads the flash, clears it, and surfaces the banner through pre-shaped view-model fields per §8.3. Templates never branch on `req.query`.
- The `requireAuth` middleware redirect to `/login?returnTo=...` is the auth-gate at the framework layer, not a per-route response. It is excluded from the explicit-303 rule.

## 9. Future admission rules

A future public page may join this catalog only if:

- it uses the same top-level page contract (`PageViewModel<TContent>`)
- it uses the same reusable primitives (§4.3)
- it does not introduce a section-specific chrome system
- it can be rendered through the same reusable Handlebars and CSS approach

If a future page requires a new reusable primitive, add that primitive to the standard first, then apply it across all relevant pages.

## 10. Catalog update rules

Update this catalog when any of the following changes:

- A new public route is added, retired, or renamed.
- A required rendering pattern is added, removed, or strengthened.
- An invariant in §7 changes (privacy gate, anti-enumeration, owner-only, visibility status).
- The `PageViewModel<TContent>` envelope shape changes.
- A reusable primitive in §4.3 is added or retired.

Do not update this catalog for:

- View-model field shape changes that preserve the contract (TypeScript at the cited path is authoritative).
- Template HTML restructuring that preserves the rendering pattern.
- Controller refactors that preserve the route, audience, and service binding.
- Implementation-state notes ("currently", "in progress", "not yet wired"); those belong in `IMPLEMENTATION_PLAN.md`.
- Deviation tracking; those belong in `IMPLEMENTATION_PLAN.md`.
- Sprint-scoped or status-tracking language of any kind.

When in doubt: the catalog describes durable design intent. If the change is durable and design-level, update the catalog. If the change is shape-level, update TypeScript and tests; the catalog already covers the rendering pattern that constrains the shape.
