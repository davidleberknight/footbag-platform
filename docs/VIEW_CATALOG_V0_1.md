# Footbag Website Modernization Project — View Catalog

## Version 0.1 — MVFP Public Events + Results Slice (Provisional)

### 1. Document purpose and scope

This document is the authoritative page/UI/view/route/view-model specification for the cataloged views.

For version 0.1, the cataloged views are intentionally limited to the **Minimum Viable First Page (MVFP)** public **Events + Results** slice.

It is intentionally **provisional**, **narrow**, and **implementation-guiding**.

It documents only the public server-rendered HTML views and route/view-model expectations for:

- public events landing
- public year archive browsing
- public canonical event page rendering
- public results display on the canonical event page
- The V0.1 MVFP user stories are: V_Browse_Upcoming_Events, V_Browse_Past_Events.

It does **not** attempt to catalog the whole site.

It does **not** define member dashboards, organizer workflows, admin pages, JSON APIs, or broader UI design patterns outside this slice.

### 2. Non-API routing note

This slice has **no REST API**.

The routes documented here are **GET HTML page routes** in a **server-rendered Express + Handlebars** application.

Guiding rules for this slice:

- Routes stay simple and stable.
- Controllers stay thin.
- Services own use-case logic and route-key interpretation.
- `db.ts` is the single prepared-statement database module.
- Templates remain logic-light.
- No repository layer is introduced for this slice.
- Validation belongs in controller/service code, not in fancy Express route syntax.

### 3. Public/member boundary note

All cataloged views in this document are **public visitor views**.

That means:

- no login is required to browse these views
- no member-only roster or participant-history data is exposed
- no organizer-only or admin-only controls appear
- organizer contact details remain excluded from the public surface unless separately specified elsewhere
- member actions such as registration, payment, uploading results, editing events, or attendance confirmation are out of scope for this document

This document covers the modern public `/events`* browsing experience only. It does not catalog legacy archive access behavior.

### 4. Canonical route summary


| Route                    | Kind                  | Canonical purpose                                              | Notes                                                                  |
| ------------------------ | --------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `GET /events`            | Public HTML page      | Events landing page                                            | Primary entry point for public events browsing                         |
| `GET /events/year/:year` | Public HTML page      | Whole-year completed-events archive and results page           | No pagination; the page shows the full selected year                   |
| `GET /events/:eventKey`  | Public HTML page      | Stable canonical route for both event detail and event results | Render mode is chosen in service/application logic, not by route shape |
| `GET /health/live`       | Operational GET route | Liveness check                                                 | Included here for slice completeness; not a cataloged user view        |
| `GET /health/ready`      | Operational GET route | Readiness check                                                | Included here for slice completeness; not a cataloged user view        |


For MVFP v0.1 operational semantics:

- `/health/live` is a cheap process-liveness signal and must not depend on SQLite, S3, SES, or other external integrations.
- `/health/ready` is a minimal SQLite-readiness signal only.
- For MVFP v0.1, `/health/ready` does not include backup freshness, S3 reachability, or CloudWatch reachability.

Route design constraints:

- Do **not** add alternate public detail routes for this slice.
- Do **not** add bare-slug routes such as `/events/beaver-open`.
- Do **not** split detail/results into separate public URLs.
- Keep `GET /events/:eventKey` as the stable canonical public event route.

### 4.1 MVFP route response and failure rules

For MVFP v0.1:

- All three `/events`* routes return server-rendered HTML.
- `/health/live` and `/health/ready` return machine-readable JSON.
- There is no public REST/JSON events API in this slice.
- Invalid `eventKey` inputs use the standard not-found behavior.
- Unknown canonical public event keys use the standard not-found behavior.
- Non-public event lookups use the standard not-found behavior.
- Temporary SQLite busy/locked read failures use the site’s standard safe failure / maintenance behavior.

### 5. Event-key note

Public event identity for this slice uses:

- `eventKey` pattern: `event_{year}_{event_slug}`

This public key is derived from the event’s standardized hashtag relationship:

- `events.hashtag_tag_id` -> `tags.id`
- stored standardized hashtag includes a leading `#`
- public `eventKey` does not include the `#`

Examples:

- stored standardized tag: `#event_2025_beaver_open`
- public route key: `event_2025_beaver_open`

Important rules:

- Do **not** invent an `event_slug` column.
- Do **not** allow bare slugs such as `beaver-open`.
- Parse and validate public `eventKey` in controller/service code.
- Normalize to stored standard-tag form before `db.ts` lookup.

### 6. Lifecycle / rendering note

Public page rendering for this slice follows this general lifecycle:

1. Browser requests a stable GET URL.
2. Express controller parses route/query inputs.
3. Controller delegates to a service method.
4. Service validates inputs, performs read logic, and returns a page-oriented data structure.
5. Controller maps that service result to a logic-light Handlebars view model.
6. Template renders HTML.

For MVFP v0.1, grouped public results appear in two places:

- the whole-year archive/results page at `GET /events/year/:year`, where grouped results may be shown inline for each completed public event in that year;
- the canonical single-event page at `GET /events/:eventKey`, which remains the stable drill-down route for one event.

For `GET /events/:eventKey`, the public contract is still a single canonical page and a single template.

The service/controller layer may change the page emphasis, but it must do so through page-model fields rather than alternate routes or alternate public templates.

Required page-model facts for the canonical event page:

- `hasResults` — true when the event is publicly visible and at least one result row exists for the event
- `primarySection` — `details` or `results`
- `resultSections[]` — grouped render data prepared above `db.ts`

Important MVFP clarification:

- A historical event without results does **not** use a different route.
- The canonical event page still renders the event.
- The year page still renders the event in the selected year.
- When no result rows exist, both pages explicitly show that no results are available yet.

### 7. View-model philosophy note

For this slice:

- view models should be page-specific and minimal
- templates should not receive raw database concerns that they do not need
- `db.ts` should return simple prepared-statement row sets
- grouping and page shaping may happen in service/controller code above `db.ts`
- templates should receive already-safe, already-resolved display data and simple booleans
- templates should not parse `eventKey`, infer authorization, or re-derive business rules

Internal identifiers may exist in service DTOs for orchestration, but only fields needed for rendering should reach the template.

---

## 8. MVFP views

### 8.1 Events Landing View

**Purpose**  
Provide the primary public Events entry page for the MVFP by showing upcoming public events and clear entry points into the completed-events archive.

**Canonical route**  
`GET /events`

**Audience / authorization level**  
Public visitor view. No authentication required.

**Visibility and privacy notes**  
Visible to any visitor. Must not expose organizer contact details, member-only controls, participant histories, or registration-management controls.

**Revised user story references**  

- `V_Browse_Upcoming_Events` (revised MVFP slice story)
- `V_Browse_Past_Events` (revised MVFP slice story, archive entry-point aspect)

**Repository references**  

- `docs/PROJECT_SUMMARY_V0_1.md`
- `docs/USER_STORIES_V0_1.md`
- `docs/SERVICE_CATALOG_V0_1.md`
- `docs/DATA_MODEL_V0_1.md`
- `docs/DESIGN_DECISIONS_V0_1.md`
- `database/schema_v0_1.sql`

**Source tables**  

- `events`
- `tags`

**Derived data requirements**  

- Public event cards require `eventKey` derived from the standardized event tag without the leading `#`.
- Upcoming list ordering should be service-owned, not template-owned.
- Archive entry links should be derived from completed-event archive years, with archive year based on `events.start_date`.
- The page returns HTML only.
- The page shows upcoming public events ordered by start date ascending.
- The page shows archive-year links derived from completed public events.

**View model fields**  

- `upcomingEvents[]`
  - `eventKey`
  - `title`
  - `description`
  - `startDate`
  - `endDate`
  - `city`
  - `region`
  - `country`
  - `hostClub`
  - `registrationStatus`
  - `status`
- `archiveYears[]`

**Regions and widgets**  

- Upcoming Events list region
- Archive Years navigation region

**Buttons / links / entry points**  

- Site navigation link to `GET /events`
- Event-card link to `GET /events/:eventKey`
- Archive-year links to `GET /events/year/:year`

**Outbound navigation**  

- to canonical event page via `GET /events/:eventKey`
- to a year archive via `GET /events/year/:year`

**Empty states**  

- If there are no upcoming public events: show a simple “No upcoming events available” message.
- If there are no archive years yet: omit or simplify the archive navigation region rather than rendering broken year links.

**Error states**  

- If the read path temporarily fails, route through the site’s standard safe error/maintenance behavior.
- The landing page should not expose stack traces, SQL errors, or internal state.

**Pagination behavior**  
None for MVFP landing.

**What is intentionally excluded from MVFP**  

- event search
- geographic filters
- advanced sort options
- organizer contact display
- registration CTA/button behavior
- member-aware personalization
- legacy archive deep linking logic
- JSON data endpoints

**Future extension notes only if directly justified**  
If later user stories require filtering or richer landing-page discovery, add them without changing the canonical route set.

---

### 8.2 Events Year View

**Purpose**  
Show one archive year of completed public events as a whole-year public archive/results page. The page is not paginated. It exists so visitors can browse a whole year of events, see which events have results, read grouped results inline when present, and then click through to a specific event page when needed.

**Canonical route**  
`GET /events/year/:year`

**Audience / authorization level**  
Public visitor view. No authentication required.

**Visibility and privacy notes**  
Visible to any visitor. The page lists completed public events for the archive year. It must not expose member-only controls, private participant data, organizer contact details, or edit/upload controls.

**Revised user story references**  

- `V_Browse_Past_Events`

**Repository references**  

- `docs/USER_STORIES_V0_1.md`
- `docs/DATA_MODEL_V0_1.md`
- `docs/SERVICE_CATALOG_V0_1.md`
- `docs/DESIGN_DECISIONS_V0_1.md`
- `database/schema_v0_1.sql`

**Input contract**

- `year` is a required four-digit path parameter.
- No pagination query parameter is part of the public contract for this route.

**Source tables**  

- `events`
- `tags`
- `clubs`
- `event_disciplines`
- `event_results_uploads`
- `event_result_entries`
- `event_result_entry_participants`

**Derived data requirements**  

- Archive year is derived from `events.start_date`.
- Year validation belongs in controller/service logic.
- Ordering is service-owned, not template-owned.
- The archive shows the full completed public event list for the selected year.
- Events are sorted by `startDate ASC`, then `endDate ASC`, then title, then stable ID.
- `hostClub` is display data derived from `events.host_club_id -> clubs.name` when present.
- `hasResults` is true only when the event is publicly visible and at least one result row exists for that event.
- Inline `resultSections[]` are grouped above `db.ts`.
- If no result rows exist for an event, the page still renders the event and an explicit no-results state.

**View model fields**  

- `year`
- `previousYear`
- `nextYear`
- `archiveYears[]`
- `events[]`
  - `eventKey`
  - `title`
  - `description`
  - `startDate`
  - `endDate`
  - `city`
  - `region`
  - `country`
  - `hostClub`
  - `status`
  - `standardTagDisplay`
  - `hasResults`
  - `resultSections[]`
    - `disciplineId`
    - `disciplineName`
    - `disciplineCategory`
    - `teamType`
    - `placements[]`
      - `placement`
      - `scoreText`
      - `participants[]`
        - `participantDisplayName`
        - `participantOrder`
  - `noResultsMessage`

Implementation note: the year page should be produced by a page-oriented service method that returns the final page-shaped data. Controllers may pass the page model into the template, but they must not invent business rules such as result visibility, host-club derivation, or sibling-year logic.

**Regions and widgets**  

- Year header region
- Previous/next year navigation region
- Archive-years navigation region
- Whole-year event/results region

**Buttons / links / entry points**  

- Year links from `GET /events`
- Previous-year / next-year links when those adjacent years exist
- Event title or card link to canonical event page `GET /events/:eventKey`
- Direct bookmarked entry to the selected year URL

**Outbound navigation**  

- to `GET /events`
- to another `GET /events/year/:year`
- to canonical event page `GET /events/:eventKey`

**Empty states**  

- If the year is a valid input but has no completed public events, show a clear empty archive state.
- Do not fabricate archive items.
- Do not fabricate result sections.

**Error states**  

- Invalid year input is handled by controller/service validation.
- Temporary service/database unavailability routes through the site’s safe error/maintenance behavior.
- The page must not expose internal validation or database details.

**Pagination behavior**  
None for MVFP v0.1.

**What is intentionally excluded from MVFP**  

- free-text archive search
- country/discipline filters
- participant-history links
- alternate archive route shapes
- JSON archive endpoints

**Future extension notes only if directly justified**  
A future UI may add filters or collapse/expand interactions, but the canonical year route must remain stable and non-paginated unless the authoritative user stories change.

---

### 8.3 Canonical Public Event Page View

**Purpose**  
Show the single canonical public page for one event. The page always uses the route `GET /events/:eventKey`. It is the stable drill-down destination from the landing page and the year page. It may emphasize event details or results depending on the returned page model, but it does not change route shape and it does not require multiple public templates.

**Canonical route**  
`GET /events/:eventKey`

**Audience / authorization level**  
Public visitor view. No authentication required.

**Visibility and privacy notes**  
This page is public only for events with allowed public visibility under the MVFP slice rule. It must not expose organizer contact details, private participant information beyond public result display names, organizer controls, upload tools, or member-only registration-management details.

**Revised user story references**  

- `V_Browse_Upcoming_Events`
- `V_Browse_Past_Events`

**Repository references**  

- `docs/USER_STORIES_V0_1.md`
- `docs/SERVICE_CATALOG_V0_1.md`
- `docs/DATA_MODEL_V0_1.md`
- `docs/DESIGN_DECISIONS_V0_1.md`
- `database/schema_v0_1.sql`

**Source tables**  

- `events`
- `tags`
- `event_disciplines`
- `event_results_uploads`
- `event_result_entries`
- `event_result_entry_participants`

**Derived data requirements**  

- Validate and normalize `eventKey` to stored standard-tag form before lookup.
- Enforce public-detail visibility by event status.
- Read flat ordered result rows below the view layer.
- Group result rows into `resultSections[]` above `db.ts`.
- Derive `hasResults` from result-row existence for the event.
- Derive `primarySection` as `details` when `hasResults = false`, otherwise `results`.

**View model fields**  

- `event`
  - `eventKey`
  - `title`
  - `description`
  - `startDate`
  - `endDate`
  - `city`
  - `region`
  - `country`
  - `hostClub`
  - `externalUrl`
  - `registrationDeadline`
  - `capacityLimit`
  - `status`
  - `registrationStatus`
  - `publishedAt`
  - `isAttendeeRegistrationOpen`
  - `isTshirtSizeCollected`
  - `sanctionStatus`
  - `paymentEnabled`
  - `currency`
  - `competitorFeeCents`
  - `attendeeFeeCents`
- `disciplines[]`
  - `disciplineId`
  - `name`
  - `disciplineCategory`
  - `teamType`
  - `sortOrder`
- `hasResults`
- `primarySection`
- `resultSections[]`
  - `disciplineId`
  - `disciplineName`
  - `disciplineCategory`
  - `teamType`
  - `placements[]`
    - `placement`
    - `scoreText`
    - `participants[]`
      - `participantDisplayName`
      - `participantOrder`

**Regions and widgets**  

- Event header / identity region
- Event description region
- Event metadata region
- Disciplines region
- Results summary region when `hasResults = true`
- Optional no-results notice region when `hasResults = false`
- Optional external-link region

**Buttons / links / entry points**  

- Direct route entry via `GET /events/:eventKey`
- Event-card links from landing and year pages
- Optional external event website link if `externalUrl` exists

**Outbound navigation**  

- to `GET /events`
- to `GET /events/year/:year` for the event archive year
- to external event website if present

**Empty states**  

- If no disciplines exist yet, show event information without fabricating a disciplines list.
- If no result rows exist for the event, show the event page with an explicit no-results notice.

**Success contract**

- This is the one canonical public route for both event detail and event results.
- The page renders event details for any public-visible event.
- When result rows exist, the page renders grouped results sections.
- When no result rows exist, the page still renders the event and includes an explicit “no results available yet” note.

**Error states**  

- Invalid `eventKey` format: handled via controller/service validation path
- Unknown `eventKey`: standard not-found behavior
- Non-public event: standard not-found behavior
- Temporary service/database failure: standard safe error/maintenance behavior

**Pagination behavior**  
None.

**What is intentionally excluded from MVFP**  

- registration form
- payment CTA flow
- organizer contact details
- attendee or competitor roster views
- participant-history links
- member profile drill-down from results
- upload or correction controls
- downloadable results files
- JSON results endpoints

---

## 9. MVFP exclusions

This initial View Catalog intentionally does **not** cover:

- member login and registration flows
- event registration and payment flows
- organizer event-management pages
- results upload and correction workflows
- admin or governance pages
- club, news, media, or member directory catalogs
- participant-history browsing
- alternate event route shapes
- REST or JSON API design
- a whole-site View Catalog

This document is intentionally limited so the MVFP public Events + Results slice can be implemented clearly without guessing about unrelated areas.