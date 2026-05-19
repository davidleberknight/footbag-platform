# Dictionary Landing Page Plan

Covers brief Part 1 (new landing/orientation surface on `/freestyle/tricks`).

Supports `FINAL_RECOMMENDATION.md` cross-cutting recommendation CR-1.

This doc specifies the new landing surface that renders when a user
visits `/freestyle/tricks` with no `?view=` parameter. The landing
orients the visitor across the six browse axes before they pick one,
absorbs the discovery paths for the observational layer and the sets
cohort (per CR-2 and CR-3), and bakes in the curator-locked decisions
from session-level (no "what's new" panel, small glossary primer near
operators/sets, observational route stays in place, Movement
Neighborhoods rename).

---

## 1. Current state

### 1.1. Surface and routing

Route: `/freestyle/tricks` (`src/routes/publicRoutes.ts`).

Controller -> service -> template chain:

- Controller method: `freestyleController.tricksIndex`.
- Service method: `freestyleService.getFreestyleTricksIndexPage(family,
  view)`. Default when no `view`: `'add'`.
- Template: `src/views/freestyle/tricks.hbs`. Renders into the active
  view branch immediately.

There is **no landing/orientation surface**. A first-time visitor lands
on the ADD-grouped view with no preamble explaining what they are
looking at, what the other views do, or that an observational layer
exists.

### 1.2. The `/freestyle` landing surface (related, not the same)

`/freestyle` (route at `publicRoutes.ts:68`) does render a landing page
with portal cards. That page introduces the section as a whole; it
links to `/freestyle/tricks` as one of several portals. The
`/freestyle/tricks` page itself currently has no equivalent orientation
layer.

### 1.3. Brief Part 1's gap analysis

The brief identifies six things the current jump-into-view flow does
not communicate:

1. Ontology framing -- what's canonical vs observational.
2. Why each browse mode exists.
3. How notation/decomposition layers work.
4. How movement-system and family differ.
5. That a sets cohort exists.
6. That an observational layer exists.

All six are real -- recon confirmed (see Final Rec §"Problem framing").

---

## 2. Recommended landing structure

The landing renders only when `?view=` is absent. When any view
parameter is present, the existing browse-view chain renders unchanged
(this preserves all current bookmarks, URLs, and external links).

Order of elements top-to-bottom, with restraint principles applied
(doctrine D: no token soup, no AST, no interaction-heavy UI, no churn
panels):

### 2.1. Hero + ontology framing

Standard `.hero-sm` block at the top of the page:

- **Eyebrow:** "Freestyle" (matches the section eyebrow on
  `/freestyle`).
- **Title:** "Trick Dictionary".
- **One-line ontology framing** (the `.hero-subtitle`):
  > Canonical trick names, structural decompositions, and the
  > observational layer. Choose how to browse below.

This single line distinguishes canonical (the default surface) from
observational (a separate browse path) without front-loading taxonomy
detail.

### 2.2. Stat row

Compact stat strip beneath the hero. Four chips, each a single
number + a short label:

| Stat | Source | Example |
|---|---|---|
| Canonical tricks | `freestyle_tricks` rows where `is_active=1` AND `category != 'modifier'` | "243 canonical tricks" |
| Observational tricks | `OBSERVATIONAL_TRICKS` content module count (status `pending-review` + `pending-canonicalization` + `rejected`) | "67 observational" |
| Modifiers | `freestyle_trick_modifiers` row count | "23 modifiers" |
| Sources | `freestyle_media_sources` distinct count loaded today | "10 sources" |

Stat row is information-dense, no decoration, no animation. Single
horizontal row at desktop; wraps at mobile.

Source coverage is a count, not a list. The full source list lives on
the (existing) source attribution surface; the landing carries the
number only.

### 2.3. Six browse cards

The center of the landing. Each card explains: what this view groups
by; why a learner would pick it; one-line example or sample.

Grid: 3 columns at desktop, 2 at tablet, 1 at mobile. CSS-only
responsive; no JS. Each card is a static `<a>` block; no hover
expansions; no popovers; no interaction beyond the link.

Card order matches the brief; click-target is the whole card.

#### Card 1. By ADD

- **Title:** "By ADD"
- **Subtitle:** Difficulty progression
- **Body (one line):** Browse by ADD value; beginner to advanced.
- **Use-when:** "When you're skill-building or want a difficulty
  ladder."
- **Href:** `/freestyle/tricks?view=add`

#### Card 2. By Family

- **Title:** "By Family"
- **Subtitle:** Canonical trick lineages
- **Body:** Browse canonical structural anchors. Whirl, butterfly,
  torque, mirage, osis.
- **Use-when:** "When you know the family and want every variant in
  one place."
- **Href:** `/freestyle/tricks?view=family`

#### Card 3. By Movement System

- **Title:** "By Movement System"
- **Subtitle:** Mechanics + operators across four axes
- **Body:** Browse by movement mechanic. Set/uptime, entry topology,
  midtime body, no-plant suspension.
- **Use-when:** "When you want to understand how moves relate by
  mechanic, not by name."
- **Href:** `/freestyle/tricks?view=movement-system`
- **Sub-link** (small, just under the body): "See **Footbag Sets**
  axis" -> `/freestyle/tricks?view=movement-system#axis-set-uptime`.
  This is the locked CR-3 implementation: sets are discoverable from
  the landing without spawning a parallel view.

#### Card 4. Movement Neighborhoods (formerly "Topology")

- **Title:** "Movement Neighborhoods"
- **Subtitle:** Observational groupings by shared movement feel
- **Body:** Tricks that share embodied feel. Hippy-downtime-dex,
  leggy-uptime-dex, X-dex compounds.
- **Use-when:** "When you want to discover tricks that move like one
  you already know."
- **Observational tag:** A small `.observational-badge` chip next to
  the title that reads "observational" -- mirrors the in-view footer
  disclaimer already present on `?view=topology`. This is the
  observational-vs-canonical separation invariant made visible at the
  landing layer.
- **Href:** `/freestyle/tricks?view=topology`

Note: backend slug + URL parameter stay `topology`. Only the
user-facing label changes to "Movement Neighborhoods" per session-level
lock. The doc 6 governance audit specifies the one-line change to
`?view=topology`'s in-view rendering for label consistency.

#### Card 5. Observed Tricks

- **Title:** "Observed Tricks"
- **Subtitle:** Community-observed, staged before canonical promotion
- **Body:** Tricks named in tutorials, records, and other
  ecosystems that haven't yet entered canonical review. Curated for
  transparency.
- **Use-when:** "When you've heard a name we haven't formally adopted
  yet."
- **Observational tag:** Same `.observational-badge` treatment as
  Movement Neighborhoods.
- **Href:** `/freestyle/observational`

This card is the locked CR-2 implementation: the existing
`/freestyle/observational` surface gains a discovery path from the
dictionary landing. Route + page title + h1 stay unchanged.

#### Card 6. Operators & Components

- **Title:** "Operators & Components"
- **Subtitle:** The building blocks
- **Body:** Sets, dexes, spins, surfaces, body modifiers, and the
  movement-language vocabulary that composes tricks.
- **Use-when:** "When you want to understand what the parts mean
  before how they combine."
- **Href:** `/freestyle/glossary` (or a dedicated operators surface if
  one exists; see §3.4 below)

#### Glossary primer sub-card (small, adjacent to Card 6)

Locked decision: small, NOT a 7th card. Placement: visually adjacent
to Card 6 (Operators & Components), styled as a smaller note-card
(`.landing-primer-callout`).

- **Headline:** "New to the notation?"
- **Body (one line):** Start with the glossary primer.
- **Href:** `/freestyle/glossary#notation`

Per the locked decision: "Do not overload the landing page." This
primer is small, single-purpose, anchored beside the operators card
because that's where a new visitor naturally lands when seeking
vocabulary.

### 2.4. Notation philosophy paragraph

A single short paragraph beneath the card grid (NOT inside any card).
One paragraph, no examples, no token displays, no AST visuals --
restraint doctrine D holds.

Suggested copy:

> Notation in this dictionary follows a symbolic-first approach:
> structural readings (the `≡` lines on each trick card) describe the
> canonical decomposition, with operational notation as fallback for
> tricks whose canonical reading is still being authored. Cards
> without either render their name and ADD value only -- the absence
> is honest, not a placeholder.

This sets reader expectations for the rendering hierarchy ratified in
`notation_consistency_audit.md`. It is curator-paced editorial copy;
the exact wording is for the curator to finalize before implementation.

### 2.5. NOT included on the landing (per locked decisions)

- **No "What's new" panel.** Locked NO. The landing stays
  timeless / educational / structural.
- **No release-note style content.** Same.
- **No featured-trick rotation.** Same.
- **No interactive demo, animation, video block.** Doctrine D.
- **No token soup display.** Doctrine D.
- **No core-atom prose.** Per `notation_consistency_audit.md`.
- **No observational tricks inlined.** Per CR-2; the observational
  card LINKS to `/freestyle/observational`, never inlines content.

### 2.6. Optional footer cross-link (existing pattern)

The standard freestyle footer already cross-links to `/freestyle`,
`/freestyle/glossary`, `/freestyle/competition`, etc. No change needed.

---

## 3. Implementation sketch

NOT actual code; enough detail to scope a slice.

### 3.1. Service shaping

New method on `freestyleService`:

```typescript
getDictionaryLandingPage(): Promise<PageViewModel<DictionaryLandingContent>>
```

`DictionaryLandingContent` interface fields:

| Field | Type | Source |
|---|---|---|
| `framing` | string | static editorial copy |
| `stats` | `{ canonicalCount, observationalCount, modifierCount, sourceCount }` | DB counts + content module count |
| `cards` | `LandingCard[]` | static curator-authored array, 6 entries |
| `setsAxisLink` | `{ href, label }` | static; deep-links Movement System axis |
| `glossaryPrimer` | `{ headline, body, href }` | static |
| `notationPhilosophy` | string | static editorial copy |

`LandingCard` shape:

```typescript
{
  slug:         string;     // 'add' / 'family' / 'movement-system' / 'topology' / 'observed' / 'operators'
  title:        string;
  subtitle:     string;
  body:         string;
  useWhen:      string;
  href:         string;
  isObservational: boolean;  // true for topology + observed; drives the .observational-badge
  subLink:      { label: string; href: string } | null;  // only Movement System card uses this for sets
}
```

All card copy is curator-authored, lives in a content module
(`src/content/freestyleDictionaryLanding.ts`), reversible TypeScript.
No DB read for card text.

### 3.2. Controller

`freestyleController.tricksIndex` branches on `req.query.view`:

- If absent -> call new `getDictionaryLandingPage()`.
- If present -> existing `getFreestyleTricksIndexPage(family, view)`
  call (unchanged).

A `?family=` filter without a `?view=` defaults the user to the
existing family-filtered ADD view (current behavior preserved); the
landing is the no-params-at-all default only.

### 3.3. Template

Two options for template layout:

- **Option T1:** Inline branch in `tricks.hbs`. Add an
  `{{#if (eq content.surface 'landing')}} ... {{/if}}` at the top;
  existing browse-view blocks unaffected. Service supplies
  `content.surface` discriminator field.
- **Option T2:** New partial `tricks-landing.hbs` rendered when the
  controller resolves the no-params case. Keeps `tricks.hbs` focused
  on browse views only.

RECOMMENDED: T2 (new partial). `tricks.hbs` is already 322 lines
across seven view branches; adding a landing branch grows it further.
A dedicated partial keeps the file's per-branch density manageable.

The controller's render call passes the appropriate template/partial
name based on the view-model discriminator. View-model shape carries
the discriminator so the template choice is data-driven.

### 3.4. Card 6 href -- glossary or dedicated operators surface?

Recon shows no dedicated `/freestyle/operators` route. The glossary
(`/freestyle/glossary`) is the current canonical home for operator +
component vocabulary.

RECOMMENDED: Card 6 hrefs to `/freestyle/glossary`. If a future slice
spawns a dedicated `/freestyle/operators` surface, the card href
updates in one place (the `freestyleDictionaryLanding.ts` content
module). Single source of truth.

### 3.5. View toggle row on browse views

When a user navigates from the landing into a browse view (e.g.
`?view=add`), the existing view-toggle row at `tricks.hbs:44-79`
renders normally. Recommendation: add a "Back to dictionary landing"
link at the START of the toggle row so the user can return to the
overview.

Specifically:

```
<a href="/freestyle/tricks">← Dictionary</a>
  <span class="trick-view-toggle-sep">·</span>
  ... existing toggle entries ...
```

This is a minor template-only change, no service work.

### 3.6. CSS

New rules in `src/public/css/style.css`:

- `.dictionary-landing` -- container.
- `.landing-stat-strip` + `.landing-stat-chip` -- stat row.
- `.landing-card-grid` -- 3/2/1 responsive grid.
- `.landing-card` + `.landing-card-title`, `.landing-card-subtitle`,
  `.landing-card-body`, `.landing-card-use-when`, `.landing-card-sub-link`
  -- card layout.
- `.observational-badge` -- the small "observational" chip on cards 4
  + 5. Re-uses the styling already applied to the topology view's
  in-view footer where possible.
- `.landing-primer-callout` -- the smaller "New to the notation?"
  callout.
- `.notation-philosophy` -- the one-paragraph below the grid.

All rules are static; no animation; no `:hover` color expansions
beyond standard link emphasis. Doctrine D restraint.

### 3.7. Test impact

New integration test file
`tests/integration/freestyle.tricks-landing.routes.test.ts`:

- `GET /freestyle/tricks` returns 200 and renders landing markup.
- Landing renders all 6 cards.
- Card 4 (Movement Neighborhoods) and Card 5 (Observed Tricks) carry
  the observational badge.
- Card 5 hrefs to `/freestyle/observational`.
- Card 3 sub-link hrefs to `?view=movement-system#axis-set-uptime`.
- Glossary primer renders adjacent to Card 6.
- `GET /freestyle/tricks?view=add` continues to render the ADD view
  (regression test for the controller branch).
- `GET /freestyle/tricks?family=whirl` (no view) -- current behavior
  preserved (family-filtered default view, not landing).

Existing tests in `freestyle.tricks-insights.routes.test.ts` should
not regress; they assert on `?view=...` URLs.

### 3.8. Stat row data refresh

The stat counts are computed at page-render time from the DB +
content modules. Fast enough; no caching needed for v1. If counts
become expensive (>100ms), service can memoize at the module level.

---

## 4. Curator decision points

- **(DECIDED at session-level)** No "what's new" panel.
- **(DECIDED at session-level)** Small glossary primer placement near
  operators/sets card.
- **(DECIDED at session-level)** "Movement Neighborhoods" public
  label.
- **(DECIDED at session-level)** Observed Tricks card links to
  existing `/freestyle/observational`; no rename.
- **(DEFER)** Final wording for the ontology-framing line, card
  bodies, use-when sentences, notation-philosophy paragraph. The
  proposal above is preliminary curator copy; the curator finalizes
  before implementation.
- **(DEFER)** Whether Card 6 href stays at `/freestyle/glossary` or
  routes to a future `/freestyle/operators`. Recommendation: glossary
  for now; revisit if an operators surface materializes.
- **(DEFER)** Whether the stat row carries any additional chip
  (e.g. "Sources covered: 10/14"). Recommendation: keep to 4 chips.
- **(DEFER)** Whether the "Back to dictionary" link at the top of the
  view-toggle row is intrusive on browse views. Recommendation: ship
  it; bookmarked URLs without the landing-back link still work.

---

## 5. Risks and mitigations

### 5.1. Risk: First-time visitors confused by 6 options

Mitigation: the use-when sentence on each card answers exactly this
question. The order also helps (ADD first = the most common need for a
first-time visitor; Operators last = vocabulary depth for the curious).

### 5.2. Risk: Bookmarks to `/freestyle/tricks` (no view param) now
land somewhere different

Mitigation: most likely the inbound link target intent IS the dictionary,
not specifically the ADD view. The landing provides better orientation.
The ADD view is one click away via Card 1. Net user impact is positive.

Any external links that explicitly want the ADD view can be updated
to `/freestyle/tricks?view=add`; existing canonical inbound links
(from `/freestyle` landing, glossary, etc.) should update in the same
slice.

### 5.3. Risk: Curator-paced editorial copy becomes a bottleneck

Mitigation: ship the landing with placeholder copy (clearly marked
"DRAFT" in code comments only; not in user-facing surface). Curator
revises in content-module edits, which deploy without code changes.

### 5.4. Risk: Stat counts churn (observational adds new entries,
canonical promotes a row)

Mitigation: counts are computed fresh per request; they will always
reflect current state. No staleness possible.

### 5.5. Risk: The observational badge on cards 4 + 5 visually clashes
with cards 1-3 + 6

Mitigation: Restraint applies; the badge should be small, one-color,
non-decorative. Per skill doctrine D's 4-color budget, the badge uses
the existing observational color, not a new one.

### 5.6. Risk: Card 3's sub-link to Movement System sets axis
duplicates discovery vs. just letting the user click into Movement
System

Mitigation: The sub-link is intentional per CR-3 -- Footbag Sets is a
named cohort the brief identifies as a discoverability gap. A direct
deep-link (vs requiring the user to find the axis once inside Movement
System) closes the gap. Sub-link is small (matches text size); does
not visually compete with the card body.

### 5.7. Risk: The notation philosophy paragraph encourages users
to expect token-display learning material on the cards themselves

Mitigation: The paragraph is descriptive, not instructional. It says
"cards render structural readings" rather than "click a card to learn
notation." The notation primer (glossary primer callout) is the
learning path; the philosophy paragraph is just a heads-up.

### 5.8. Risk: New CSS rules bloat the stylesheet

Mitigation: All rules are scoped under `.dictionary-landing`; minimal
specificity. Estimated +60 lines of CSS. Within normal slice cost.

---

## 6. Out of scope

- Any change to browse views (`?view=...` paths) beyond the optional
  "Back to dictionary" link in the toggle row.
- Any change to the observational route or page.
- Any change to `/freestyle/glossary` content (the primer hrefs link
  to an existing anchor `#notation`; if that anchor doesn't exist
  yet, glossary adds it in a separate slice).
- Any change to the `/freestyle` section landing (different page).
- Schema migration.
- New DB table for landing-card content (everything is in a content
  module).
- Any cosmetic refresh of the existing browse views.
- Any A/B testing affordance, analytics event, or visitor counter on
  landing cards.

---

## 7. Cross-references

- `FINAL_RECOMMENDATION.md` -- CR-1 / CR-2 / CR-3 cross-cutting recs.
- `notation_consistency_audit.md` -- the symbolic-first hierarchy that
  the notation-philosophy paragraph references.
- `observational_layer_discoverability.md` -- Card 5's destination
  surface; this doc's deep audit + recommendations.
- `footbag_sets_architecture.md` -- Card 3's sub-link destination
  rationale; doc 5's deep audit.
- `family_and_neighborhood_governance.md` -- the "Movement
  Neighborhoods" rename specification + topology in-view label change.
- `category_view_retirement_review.md` -- Category view's retirement;
  ensures the landing doesn't accidentally re-introduce a discovery
  path to the retired view.

---

## 8. Implementation sequencing (within this slice)

1. Author `src/content/freestyleDictionaryLanding.ts` with all card
   copy, framing, primer, philosophy paragraph (curator-authored
   text).
2. Add `getDictionaryLandingPage()` method to `freestyleService`.
3. Branch controller on absence of `?view=`.
4. Add `tricks-landing.hbs` partial.
5. Add CSS for the landing surface (estimated ~60 lines).
6. Add integration tests for the landing route + observational badge
   + sub-link + primer.
7. Add the "Back to dictionary" link to the view-toggle row in
   `tricks.hbs`.
8. Verify the existing browse views still render unchanged.

Each step is small; the whole slice fits one PR.

---

## 9. Summary

`/freestyle/tricks` gains a landing surface that renders when no
`?view=` param is present. Six browse cards introduce the available
views with use-when guidance; a stat row anchors current dictionary
state; a small glossary primer near the operators card; one paragraph
on notation philosophy. No "what's new" panel; no decorative content;
no observational tricks inlined into canonical browse. The landing
absorbs discoverability for the observational layer (Card 5) and the
sets cohort (Card 3 sub-link) per CR-2 + CR-3. Movement Neighborhoods
rename applied at the rendering layer (Card 4 + the in-view label
change in doc 6). All curator-authored editorial copy lives in a
reversible TypeScript content module; zero schema change. Brief Part 1
satisfied without ontology hardening, without churn panels, without
doctrine D violation.
