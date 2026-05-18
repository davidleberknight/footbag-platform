# TrickSlug identity invariant

Phase B audit deliverable. Formalizes the identity-rendering invariant
added to the Curated Trick Publication Contract V2 (invariant 8).

## The invariant

> A curated trick's identity rendering must remain structurally
> consistent across all public surfaces.

## Two-layer model

The invariant applies to the **identity layer** only. The **context
layer** is explicitly free to vary by surface.

### Identity layer — MUST be consistent across every surface

Every surface that shows a given trick must agree on these elements,
and changes here cascade across all surfaces (via the shared service-
layer shaping pipeline):

- **Canonical title** (`displayName`) — visible text everywhere the
  trick is named.
- **Slug** — URL path segment + DOM `data-trick-slug` + anchor IDs.
- **ADD** value — same number everywhere; em-dash when pending.
- **Formula / structural reading** — same shaping output (tokenized
  equivalence OR operational notation OR core-atom marker) when shown.
- **Hashtag identity** — the canonical `#-tag` for the trick on every
  chip / media tag / cross-link.
- **Symbolic chain** — same tokenized `≡` reading sequence when shown,
  same role classifications on the tokens.
- **Aliases** — same canonical/non-canonical alias mapping;
  none silently introduced or omitted.
- **Family placement** — same `trick_family` slug on every family
  chip / anchor / link.
- **Discrepancy status** — same pending/settled/discrepancy markers
  (the `pendingDecomposition` pill, discrepancy badges, etc.).
- **Media indicators** — same `mediaCoverage` / `hasReferenceMedia` /
  `mediaCoverageLabel` shape everywhere.

These are sourced from `freestyle_tricks` + the service-layer shaping
helpers. Any surface that wants to render one of these must consume
the shaped value, never re-derive locally.

### Context layer — MAY vary by surface

Context-layer choices are intentionally per-surface, driven by space
constraints, audience, or pedagogical role:

- **Card density** (compact vs expanded; registry vs browse).
- **Prose density** (intro paragraphs, supporting captions).
- **Truncation** (visible alias count, description length, related-
  tricks list cap).
- **Surrounding educational framing** (axis-rationale blocks, "why
  this section exists" ledes).
- **CTA layout** (where buttons sit; whether they appear at all).
- **Mobile formatting** (stack order, collapsible sections).
- **Contextual chips** (a movement-system view may add an axis chip
  not visible in ADD view — additive, not contradictory).

Differences along the context layer are NOT drift. They are surface-
appropriate adaptation of identity-layer truth.

### The line between them

A simple test: would a reader be confused or misled by the
difference?

- "ADD shown as 3 in ADD view but 4 in family view" → **identity-
  layer violation** (drift).
- "Family-view card omits the family chip because it's grouped under
  the family already" → **context-layer adaptation** (intentional).
- "Detail page lacks the formula visible on cards" → **identity-layer
  violation** (V2 invariant 7: detail page must be a superset).
- "Detail page expands the formula across multiple sections with
  prose context that the card omits" → **context-layer adaptation**
  (superset principle preserved).

If the difference would surprise a reader who knows the trick, it's
identity-layer. If it serves the surface's role without obscuring or
contradicting the trick's identity, it's context-layer.

## Identity components — source-of-truth table

| Component (identity layer) | Source of truth | Rendering rule |
|---|---|---|
| **slug** | `freestyle_tricks.slug` | URL path segment + DOM `data-trick-slug` attribute + anchor IDs |
| **canonical name** (`displayName`) | `freestyle_tricks.canonical_name` | Visible text in titles / chips / links |
| **detail-page href** | `/freestyle/tricks/{slug}` | All cross-references resolve here |
| **ADD value** | `freestyle_tricks.adds` (or `addNumeric` / `addsLabel` shaped fields) | Same numeric value everywhere; em-dash when pending |
| **hashtag** | `tags.tag_normalized` (via the tags table) | Same canonical hashtag on every chip / media tag / link |
| **family** | `freestyle_tricks.trick_family` | Same family slug on every family chip / anchor |
| **base trick** | `freestyle_tricks.base_trick` | Used in structural readings; consistent across notation displays |
| **structural reading** (formula / equivalence) | Shaped by `freestyleService` (notation / equivalences / core-atom marker) | Same shaping pipeline every surface |

## Surfaces in scope

Every surface that renders a curated trick falls into one of these
identity-consistent groups:

### Card surfaces (consume `dictionary-trick-card.hbs`)

- `/freestyle/tricks` (ADD view) — `density="registry"`
- `/freestyle/tricks?view=family` — `density="registry"`
- `/freestyle/tricks?view=category` — `density="registry"`
- `/freestyle/tricks?view=movement-system` — `density="registry"`
- `/freestyle/tricks?view=topology` — `density="registry"`
- `/freestyle/tricks?view=component` (soft-retired) — `density="registry"`
- `/freestyle/tricks?view=sets` (legacy alias) — `density="registry"` via component
- ADD analysis worked-example trick links — `density="browse"` (when used)
- Combo analysis references — links use `/freestyle/tricks/{slug}` directly (text-only)

### Core-atom symbolic surfaces (consume `core-tricks-grid.hbs`)

- `/freestyle` landing Core Tricks grid — `idPrefix="core-trick-"`
- `/freestyle/glossary` §10 foundational tricks grid — `idPrefix="term-"`

### Detail-page surfaces (consume `trick-shell.hbs` + sub-partials)

- `/freestyle/tricks/:slug` — the canonical full-superset surface

### Cross-link surfaces (text-only references)

- Related-tricks panels on trick-detail pages (parallels, next/previous, etc.)
- Family chips / hashtag chips
- Glossary §3 / §6 modifier "See tricks using" cross-links (now pointing at
  Movement System via the modifier-reference partial)
- ADD analysis discrepancy case trick links
- History page cited tricks
- Combo-analysis sequence trick names

## Identity invariants

### I1: Canonical slug stability

Once a trick is in `freestyle_tricks` as curated, its slug is
immutable. Renaming requires migration with explicit redirect handling.

### I2: Canonical name uniformity

`displayName` rendering must come from `freestyle_tricks.canonical_name`
(shaped through the service layer). Hard-coded literal names in
templates are forbidden — surfaces that need a trick name pull it
through the view-model.

### I3: ADD parity

A trick's numeric ADD value is canonical (per V1 §1 + V1 §5). Card
surfaces and detail page must show the same value. When pending, all
surfaces render the em-dash + pending-marker class.

### I4: Hashtag parity

Where a trick's hashtag chip is rendered (e.g., in the chip strip on
card or detail), the chip text must match `tags.tag_normalized` for
the canonical tag. Media-gallery hashtag filters use the same tag.

### I5: Detail-page-as-superset (V2 invariant 7)

The detail page is the union of every field a card surface might show.
Cards may omit fields (intentional simplification); cards must not
introduce contradictory content.

### I6: Render-mode discipline (V2 invariant 9)

New surfaces consume a registered render mode (registry / browse /
core-atom-symbolic / trick-shell). Hand-rolled trick-identity markup
is forbidden.

### I7: Family-slug stability across views

A trick's `trick_family` is the same string in family view chips,
related-family panels, and detail-page family-tree references. No
view rewrites the family slug.

### I8: Cross-link href uniformity

Every reference to a trick uses `/freestyle/tricks/{slug}` as the
href. Surfaces never construct alternate URLs for the same trick.

### I9: Tokenized-equivalence consistency

When a surface renders the tokenized equivalence reading (the `≡`
sentence with role-classified tokens), the tokens come from the same
shaping pipeline (`shapeNotationDisplay` / `shapeTokenizedEquivalences`).
Different surfaces never re-classify the same tokens differently.

### I10: Media-coverage indicator parity

The media-coverage chip (`mediaCoverage` / `hasReferenceMedia` /
`mediaCoverageLabel`) is shaped per-trick once and renders identically
on card + detail-page reference-media section.

## Drift detection (acceptance criteria)

Any of these would constitute a drift violation:

- A trick rendered as `Foo Trick` in family view but `Foo trick` in
  ADD view (capitalization drift).
- A trick showing ADD value 3 in registry density but 4 in browse
  density (numeric drift — would be a shaping bug).
- A trick's detail page lacking a field present on a card surface
  (parity drift — V2 invariant 7).
- A new surface rendering trick identity markup directly (template
  hand-roll, bypassing registered render modes).
- Two different hashtag chips for the same trick (e.g., `#paradox-mirage`
  on one surface, `#paradox_mirage` on another).
- A trick's slug appearing in URL `/freestyle/tricks/foo-bar` from one
  page and `/freestyle/tricks/foo_bar` from another.

## Exemptions

Documented exemptions to the invariant (so future readers don't
mistake them for drift):

- **Compact symbolic-object pattern** (landing core-tricks grid +
  glossary §10) renders the 11 core atoms differently from the
  registry/browse densities — intentional, registered as the
  `core-atom-symbolic` mode in the V2 contract.
- **Tokenized vs operational-notation display** is intentional per
  the dictionary-trick-card partial design — tokenized takes
  precedence when present; operational notation fills in otherwise.
- **`displaySlug` override** on the `clipper-stall` core atom (visible
  tag `#clipper`, anchor id `core-trick-clipper-stall`) — registered
  per `CORE-ATOM-CANONICAL-RECONCILE-1` in memory.

Any new exemption must be added to this list (or to the V2 render-mode
register) before shipping.
