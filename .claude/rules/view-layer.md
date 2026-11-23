---
paths:
  - "src/views/**"
  - "src/public/**"
  - "src/services/**"
  - "src/types/page.ts"
  - "src/lib/outcomeNotice.ts"
  - "src/lib/titleCase.ts"
  - "src/content/**"
---

# View-layer standard

Pages consume the standard; pages do not define their own. Per-page contracts (audience, rendering
invariants, sensitive-page rules) live in the owning service's file-header JSDoc.

## Page contract

Every public page except Home renders from `PageViewModel<TContent>` (`src/types/page.ts`). Home is
the one composition-page exception (DESIGN_DECISIONS "Server-rendered HTML with Handlebars
Templates"): bespoke view model, same layout, tokens and thin-controller discipline. `/internal/*`
tooling is exempt.

- `seo.title` never contains "Footbag"; the layout prefixes it.
- Services compute every displayed href, domain-derived label and boolean; templates render them. A
  controller supplies only the response's own URL fields (form action, cancel href, redirect
  target). Templates build no URL beyond a one-variable path (Template mechanics) and derive no
  label.
- Naming: `<PageName>Content`, row model `<Entity>ViewModel`, template
  `src/views/<section>/<page>.hbs`; an inline controller render uses
  `satisfies PageViewModel<TContent>`.

## Reusable primitives

Compose every public page from one small set: site frame (header / main / footer), page hero
(eyebrow / title / subtitle / notice), content section, compact disclosure card grid,
discipline tag, result section, year navigation, pager, metadata / summary rows, data table (`.data-table`,
the one table treatment), queue row, grouped link
index, dated item, archive row, member picker, membership prompt (the `membership-prompt` partial: what a
non-member sees in place of a member-only action, one sentence and its log-in, join or finish-onboarding
buttons), prominent action link, back link (the `back-link` partial),
empty state, notice block, and admin instructions block. A new page
joins the standard only if it can be expressed through these. A genuinely new reusable primitive is
added to the standard first, then applied across the relevant pages, never invented per page.

A symbol whose meaning a sighted reader takes from its look (a record star, a flagship mark) carries
`aria-hidden="true"` and is followed by its spoken form in `.visually-hidden` text. A `title`
tooltip is never the only carrier of meaning, because neither a keyboard, a touch screen, nor a
screen reader reliably reaches it.

A **queue row** (`.admin-queue-row`) is one line naming a queue, its count as a badge and an
optional age or split line, linking to the queue; on the work-queue list the same row, as a `div`,
names one item with a Claim button and an Open link. A **grouped link index** (`.admin-goto-grid`)
is columns of plain links under group headings, with no counts or descriptions.

A **pager** (the `_pager` partial) closes every paged list, shaped by the page service as its
pagination block. A paged hashtag-media result also shows the large-result notice above its grid
whenever the set spans more than one page.

A **dated item** (the `dated-item` partial) is one entry in a list of things that happen or were
published on a date (upcoming events, news): date, title link, optional badge, an optional second
badge (the registration status of the upcoming event a news item is about), meta line, excerpt
and square thumbnail; a compact form drops the excerpt and thumbnail. Every page that lists upcoming
events draws each as a dated item; a completed event on a year page is an **archive row** (the
`event-archive-row` partial). The page service shapes the date as one preformatted range, the label
as the registration status of an upcoming event (a completed event carries none) and the meta line
as location, host club and hashtag token. A template never lays out an event, compares its dates or
derives its status.

A **clickable card** is a card that leads to one place. Its one link (the title link, else the
card's one button) carries `.card-link`, stretched over the card by `::after`; any other link in the
card sits above it and keeps its target. Only a clickable card lifts on hover, and keyboard focus on
its link draws one ring around the card. A second control repeating the card's link (cover photo,
thumbnail, Read button) is out of the tab order and hidden from assistive technology. A card with
several actions, or none, carries no `.card-link`.

A **member picker** (the `member-picker` partial) is the one way a form lets a person choose another
member, by name. The field shows who is chosen; Choose or Change opens a search directly under it
showing at most five names with location, each with a Choose button (or the form's own verb where
choosing completes the action). Every picker control posts back to the form, which re-renders and
saves nothing until the form's own submit. The service accepts only a member the picker could
offer, never a typed member id, slug or profile URL; a confirm page carries the chosen member in a
hidden field. A lookup that finds a member or a member's record asks for a name, or a login email or
legacy username where an admin has one; a search for an old footbag.org account also takes its old
id.

A table reordered client-side carries `data-sortable` on its `.data-table` (`sortable-table.js`); a
list the server sorts keeps its query-string sort.

An **admin instructions block** (the `admin-instructions` partial, shaped as `PageMeta.instructions`)
opens every administrator page directly below the hero: what the screen does, why, how to use it,
and a heads-up list of consequences a reader would not guess (omitted when none). On a confirm page
its heads-up is the page's existing caution, never a second copy.

The page hero carries only eyebrow, title, subtitle and notice. A page's own media hashtag sits in
the media line (the `media-line` partial) beside its gallery link. Primary navigation, back links
and item pagers belong in the body, never the hero. Breadcrumbs sit in the hero above the eyebrow,
only on a page two or more levels below its section's landing page. A back link exists only on a
page nested under another and without breadcrumbs, leads one level up, reads "Back to <that page's
title>", and is drawn once at the end of the body by the `back-link` partial from
`navigation.contextLinks`. Never render the same action's label twice on one page; a page serving
distinct audiences in side-by-side panels may repeat an action once per panel.

## Action hierarchy

Every clickable control on a public page belongs to exactly one of six tiers, and the tier fixes
the class (DESIGN_DECISIONS "Action Hierarchy"). The site frame's own controls and a media
player's controls are styled by their component and sit outside the tiers. A control that fits no
tier is a design question to raise, never a licence to mint a class.

| Tier | What it is | Class |
|---|---|---|
| Primary action | The main action of a page, or of each self-contained panel on it when a page serves distinct audiences side by side (the login page's log-in form and its two join panels) | `.btn .btn-primary` |
| Secondary action | A real action, subordinate to the primary one, including every state-changing control in a list item, a table row or a filter bar, and the pointer that closes a list, an excerpt or a preview and leads to the full set ("More News", "See All Tricks in This Family") | `.btn .btn-outline`, or `.btn .btn-inverse` on a dark gradient panel |
| Prominent action link | A destination that must read as important without being a button: a cross-link out of a section, the page's back link (through the `back-link` partial) | `.action-link` |
| Prose link | An ordinary link inside running text; the service shapes linked prose as text and link segments, never an HTML string, and an external one renders through the `externalLink` helper | bare `<a>` |
| Tag or chip | A clickable filter, tag, or hashtag | `.tag-chip`; a trick hashtag uses the shared hashtag token; no chip, button or link label carries a count |
| Non-clickable token | An identity or status that is not a link | the hashtag token at rest; `.badge` for status |

`.btn-sm` is the compact size on the two button tiers (padding and type size only), taken by a
button inside a list item, table row or filter bar. A container holding a row of buttons wraps them
(`flex-wrap: wrap`) and centres them on one line (`align-items: center`).

An action that permanently loses data or stops money (cancelling a recurring donation, removing a
record row) goes through a server-rendered confirm page that states the consequence in body colour
under a `.notice notice-warn` caution and ends in the final button, the pattern of the club
leave-confirm page. A browser confirm dialog is never the only guard, because the page must work
without JavaScript. A typed reason is asked for only where the audit trail needs one.

No decorative arrows and the resting-underline rule: DESIGN_DECISIONS "Link and Disclosure
Affordances". No link renders at `color: inherit` without an underline cue. A control's label is
truthful (Template mechanics).

## Message vocabulary

A message reporting what just happened is not a callout (DESIGN_DECISIONS "Callout and Box
Policy"). Four tones cover every outcome, each fixing one class and one aria role:

| Outcome | Tone | Class | Role |
|---|---|---|---|
| The thing asked for happened | success | `.form-success-banner` | `status` |
| Nothing needed changing, and nothing was refused | informational | `.form-notice` | `status` |
| A caution before an act, on a confirm page | warning | `.notice notice-warn` | `alert` |
| The request was refused | refusal | `.form-error-banner` | `alert` |

There is no fifth treatment and no page-local message class; a surface that fits none of the four
is a design question to raise.

An outcome that changed nothing because the desired state already held from another act is
informational, never success; a refusal is never green. The actor's own repeat of an act that
already landed shows the first submit's success message.

The tone is decided where the message is chosen and travels with it: across a redirect in the flash
cookie (`outcomePayload` / `outcomeNotice`, `src/lib/outcomeNotice.ts`); on a page that renders its
own outcome as `PageMeta.noticeTone` or a tone field on the content shape. The page draws it through
the `outcome-notice` partial (`text`, `lines`, or a block call for a link or code span); a template
never branches on tone itself. The warning tone reports no outcome: write it directly on the
confirm page that shows it. A standing caveat elsewhere is a callout.

## CSS vocabulary

- Every class a template uses has a `style.css` rule that reaches it where it is used: a descendant
  selector such as `.hero .hero-title-link` defines the class only inside that container. The
  convention gate checks static class tokens against the stylesheet.
- An element that needs a class to be styled at all is not caught by the gate: group form fields
  with `.form-fieldset`, never a bare `<fieldset>` (there is no base rule).
- A new class enters only through a reviewed change adding it to
  `tests/unit/template-class-baseline.txt`; the default answer is an existing primitive.
- Interface chrome (button and call-to-action labels, page titles, hero titles, section headings)
  is Title Case. `toTitleCase()` in `src/lib/titleCase.ts` is the executable definition;
  `tests/unit/heading-case-conformance.test.ts` enforces it.
- Text the platform did not write (an interpolated value, curator- or member-authored content) is
  never re-cased; casing is applied where the literal is authored, never at render time. Body copy,
  help text, descriptions, empty states, error messages and the article subheads of the long-form
  freestyle reference stay as written; a page title is chrome even there.
- The gate covers heading tags and `.btn` labels in templates and `title:` literals in services, and
  three things it does not cover follow the rule without being machine-checked. Service `label:`
  keys: that one key carries both dropdown options, which are chrome, and tooltip prose, which is
  not, so gating it would either misfire or need an exception list longer than the rule. The
  freestyle and symbolic reference services, whose `title:` keys carry article section titles the
  scan cannot tell apart from page titles. And any heading that interpolates a value, which is
  skipped whole because the gate cannot separate the authored half from the borrowed one.

## Visual standard

A page uses one section pattern and one content-card pattern, never two: the bare `<section>` with
a rule between siblings (browse or index pages), `.content-section` (long prose or reference pages,
compact rhythm through a section body class), or `.profile-section` (member profile only). Never mix
`.section-heading` with `.profile-section-heading` on one page, and do not introduce a fourth
system.

A table carries only the columns a reader needs. A wide results or admin table scrolls inside one
`.records-table-wrap` wrapper (`tabindex="0"`, `role="region"`, accessible name); only a narrow,
record-like table stacks each row at phone width. Fixed-width preformatted text scrolls inside its
own labelled, keyboard-focusable box the same way.

A section heading is an `h2` inside a `.section-heading` wrapper; a sub-heading is a plain `h3`,
never a second `.section-heading` (`sub-heading-conformance.test.ts`).

Within a page, section headings, content cards and vertical spacing are uniform. The member profile
is the reference (`profile-section-conformance.test.ts`).

What the browser draws is checked by `npm run test:rendered-style` (every page view at 390px and
1280px, shrink-only baseline); `npm run style -- url <path>` runs the same rules on one dev-stack
page.

## Detail-page order

A detail page orients before it analyses. Under the hero, in this order: a notice band if the page
has one; the page's cover photo at full content width, when it has one; a short horizontal strip of
identifying facts, if one opens the page; the media line when
the page has its own hashtag; plain-language prose saying what the thing
is; then the structured or technical sections; then actions; then the back link from
`navigation.contextLinks`. Club detail, event detail and the member profile are the worked examples.

Short related facts sit horizontally on desktop and stack on narrow screens rather than each taking
a line of its own. Reuse `.event-meta-row` (a wrapping inline strip), `.club-detail-meta` (a
label-and-value grid), or `.trick-structural-facts-list` (the same grid with an explicit stack at
480px). Do not add a fourth.

## Content and copy standard

Page copy (hero intro, section intros, filtered-state headers) is service-shaped and rendered
verbatim, so this binds the service author. It is most often violated on the freestyle dictionary
surfaces.

- Lead with orientation, never a metric: the first sentence says where the visitor is and what they
  can do; no intro opens with a count or inventory statistic.
- Plain words over internal vocabulary ("lens", "source-variant", "Emerging Vocabulary"); gloss and
  glossary-link a term a newcomer needs.
- One idea per short sentence; link the glossary instead of inlining a taxonomy.
- Every filtered or deep-linked state says where the visitor is, what the subset means, how to clear
  or change it, and how to reach beginner help.
- No em dashes in text a site visitor reads (templates, content and UI strings, notification email
  bodies); the convention gate enforces it.

## Static assets (`src/public/`)

Served at `/` with no build step. Scope each script to one page or feature and load it with `defer`.
`src/public/img/` holds site-owned images only; member-uploaded media lives in object storage.

## Template mechanics

Templates render a fully shaped view-model; a template missing data is fixed in the service.
Middleware adds the pre-shaped booleans the layout uses (`isAuthenticated`, `isMember`, `isAdmin`,
`currentSection`).

- Branch only on a service-shaped boolean or enum, never a raw domain code: `{{#if isCompleted}}` is
  right, `{{#if (eq event.status 'completed')}}` is wrong. Labels likewise (`teamTypeLabel`, never
  an `eq` on `teamType`).
- A URL with one variable may be written in the template (`href="/clubs/{{slug}}"`); one with two
  or more, and every dictionary filter, view or hashtag link, is a service-shaped `*Href` field.
- Paragraph text renders escaped; a link inside it is a service-shaped text-and-link segment.
  `{{{ }}}` only for registered helpers, the layout `body`, `*Json` islands and `*Html` markdown
  (gated). A service-shaped `*Href` renders through `siteHref`.
- No inline event handlers (`onclick=` and the like); attach handlers from external JS with
  `addEventListener` on a class or `data-*` selector.
- **Truthful controls.** A control's visible label names the action it performs or where it goes,
  and two controls with the same label on one page resolve to the same destination. `Switch`, the
  dev persona identity verb, is exempt. `tests/integration/route-wiring.crawl.test.ts` enforces it.

A person's country and location come from `personLocation` (`src/services/countryUtils.ts`), never
the raw columns; admin pages show the stored values.
