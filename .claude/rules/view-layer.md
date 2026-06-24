---
paths:
  - "src/views/**"
  - "src/public/css/**"
---

# View-layer standard

The public site has one reusable look-and-feel standard. Pages consume the standard; pages do not
define their own. This rule states the cross-cutting standard and points at each enforcement site.
Per-page contracts (audience, rendering invariants, sensitive-page rules) live in the owning
service's file-header JSDoc, not here.

## Page contract

Every public page except Home renders from `PageViewModel<TContent>`. `src/types/page.ts` is the
source of truth for the shape; renaming a `SeoMeta` / `PageMeta` / `NavigationMeta` field is a
compile error at every call site.

- `seo.title` is the browser-tab suffix; the layout renders `Footbag {seo.title}`, so the value
  never contains the word "Footbag". `seo.fullTitle`, when set, is the complete tab title with no
  `Footbag` prefix.
- `seo.description` is the page meta description; the layout renders it as `<meta name="description">`
  and `og:description`. `seo.noindex` marks a public page do-not-index (login, register, and other
  thin auth pages), rendered as a robots noindex meta. The layout also emits a self-referencing
  canonical and Open Graph / Twitter Card tags from request-derived `res.locals` (canonical and
  `og:url` are omitted on error and not-found responses); services own only the `seo` fields.
- `page.sectionKey` selects the active nav section; `page.pageKey` is a unique page id; `page.title`
  is the displayed h1 (distinct from `seo.title`); `eyebrow` / `intro` / `notice` are optional.
- `navigation` (breadcrumbs / siblings / contextLinks) is service-provided. Middleware separately
  provides `currentSection` and `isAuthenticated` via `res.locals`; those are not part of the
  service contract.
- `content` holds page-specific regions. Services compute every href and every domain-derived label
  and boolean; templates render them. Templates never construct URLs or derive labels.

Naming: a page's content interface is `<PageName>Content` (e.g. `RecordsContent`); a row-level
view-model inside it is `<Entity>ViewModel` (e.g. `NetTeamViewModel`); the template is
`src/views/<section>/<page>.hbs`. Every page service method returns `PageViewModel<TContent>`;
inline controller renders type the arg with `satisfies PageViewModel<TContent>`.

Home is the one intentional composition-page exception (DESIGN_DECISIONS §4.1): it uses a bespoke
view model but still uses the shared layout, design tokens, section identity, thin-controller
discipline, and service-owned shaping. Internal `/internal/*` tooling is exempt from this contract.

## Reusable primitives

Compose every public page from one small set: site frame (header / main / footer), page hero
(eyebrow / title / subtitle / notice), content section, event card, discipline tag, result section,
year navigation, metadata / summary rows, empty state, and notice / coming-soon block. A new page
joins the standard only if it can be expressed through these. A genuinely new reusable primitive is
added to the standard first, then applied across the relevant pages, never invented per page.

The page hero carries only its own parts (eyebrow, title, subtitle, notice). Primary navigation, back
links, and item pagers belong in the page body, never in the hero. Never render the same action's
label twice on one page (for example a "Back to results" link in both the hero and the pager); one
control reads cleaner. Keep visible spacing between the hero and the first content block, and between
stacked sections, so adjacent blocks never butt together with a zero gap.

## Hashtag and dictionary-filter links

Freestyle dictionary surfaces follow the href rule above with no exceptions. Every media hashtag, family chip, and view filter (by-ADD, by-family, by-movement-system, movement-neighborhoods, by-dex, by-modifier) is a service-provided display-and-href pair: the service fixes the destination (a hashtag links to its media gallery `/media/browse?context=<slug>`; a family or view filter links to the filtered dictionary `/freestyle/tricks?...`; the plain-English trick name is display text only, and a separate "Trick Detail" link resolves to the trick detail page) and the template only renders the pair. Templates never assemble a `?family=` or `?context=` URL from a slug. A trick's slug, hashtag body, and `/freestyle/tricks/:slug` segment are one lowercase underscore token (no hyphens); the display name is the plain-English words, also without hyphens. The trick name is plain text, never a link. The hashtag links to the trick's media gallery only when the trick has media (an existence check at render, not a count) and renders as a plain token otherwise, so a clickable hashtag is the sole signal that media exists. A separate "Trick Detail" link opens the detail page. Name, hashtag, and Trick Detail stay three distinct controls.

## CSS vocabulary

`src/public/css/style.css` is the source of truth for class definitions; this rule names the
discipline, not the enumeration.

- Every class used in a template has a corresponding rule in `style.css` (a class counts as defined
  when it appears in any selector, including a compound such as `.hero.hero-sm`). Before a template
  change ships, grep `style.css` for each class introduced: an undefined class fails nothing at
  build or test time and renders silently unstyled.
- Never invent a class by analogy with another framework (`btn-secondary` is a Bootstrap name, not
  ours). New classes are added to `style.css`.
- The vocabulary is shared (required across all public pages) plus per-section (required only within
  that section); both groups live in `style.css`.
- Buttons: `.btn-primary`, `.btn-outline`, and `.btn-inverse` (white fill, teal text, for CTAs on
  dark gradient panels) are the only button variants. Secondary content uses the card pattern
  (`.card`, `.card-title`, `.card-meta`, `.card-description`); status chips use `.badge`.
- Button / CTA label casing is Title Case: capitalize the first letter of each word EXCEPT the
  minor words `a an as the and or nor but to of in on at by for`, unless the minor word is the first or
  last word ("Create a New Club", "Browse All Matching Media", "Log In", "Go to Home", "Apply Hashtag
  Filters"). This applies to every `.btn` label and to service/controller-authored CTA strings;
  curator/member-authored content (e.g. an external-link label) is left as entered. (A general design
  skill may suggest sentence case for copy; for button/CTA labels this project rule governs.)
- Reference site CSS/JS only through the `asset` helper (`{{{asset 'css/style.css'}}}`), which emits a
  content-hash version token (`/css/style.css?v=<hash>`, served immutable) so a deploy self-busts the
  CDN. Never hardcode a `/css/*` or `/js/*` URL; `tests/unit/asset-helper-conformance.test.ts` fails
  the build on a raw asset URL.

## Visual standard (look-and-feel consistency)

All public pages present one consistent experience: clean, content-first layout; consistent spacing,
typography hierarchy, card and metadata treatment, empty-state and notice styling, header and footer
behavior. No section introduces its own chrome system or a parallel design language; a new surface
inherits the shared tokens and primitives. Consistency is a forward requirement, not a one-time
state.

A page uses one section pattern and one content-card pattern, never two. Do not mix the site
`.section-heading` (the h2 type-scale system) with the `.profile-section` / `.profile-section-heading`
label system on the same page; pick one and apply it to every section. Within a page, section headings
are one size, one case, one weight, one color; content cards are one padding, one radius, one elevation;
and stacked sections share one vertical-spacing rhythm so adjacent blocks read as one page rather than
several pasted together. A block that needs a different visual weight is a justified exception, not a
default. The member profile is the reference: it composes entirely from `.profile-section` +
`.profile-section-heading`, and `tests/unit/profile-section-conformance.test.ts` enforces that no
profile-owned markup reintroduces the competing system.

The durable visual decisions live in DESIGN_DECISIONS §4 and are mechanically enforced by
`scripts/ci/assert_conventions.sh`: one type system with body-font notation (§4.6), canonical
breakpoints 480 / 768 / 1024 (§4.7), accessible responsive HTML-first design (§4.4), and the
stylesheet / template convention gates (§4.8) — colors from `:root` tokens (no raw hex in rule
bodies), `--radius*` tokens for corners, `--font-body` / `--font-mono` only, no inline `style` or
`script`, no nested `<form>`, and template-class-to-`style.css` correspondence.

## Content and copy standard

Public page copy (the hero intro, every section intro, and every filtered-state header) is
service-shaped and rendered verbatim by templates, so this standard binds the page-shaping service
author as much as the template. It applies without exception to the freestyle dictionary surfaces,
where it is most often violated.

- Lead with orientation, never a metric. The first sentence of a page or a filtered state tells the
  visitor where they are and what they can do here, in plain language. No body intro opens with a raw
  count or inventory statistic (for example a trick total); counts are supporting metadata placed
  lower on the page, not the lede.
- Plain words over internal vocabulary. Orientation copy a newcomer reads uses everyday language.
  Internal or taxonomic terms ("officially documented", "not-yet-promoted", "source-variant", "lens",
  "Emerging Vocabulary") are avoided in primary orientation copy, or introduced with a plain-language
  gloss and a glossary link; never assumed.
- Short, one idea per sentence. An intro is a few short sentences, not one dense paragraph stacking
  definitions and parentheticals. A concept that needs explaining links to the glossary instead of
  inlining a taxonomy.
- Every filtered or deep-linked state self-orients. Each dictionary filter and view state says where
  the visitor is, what the subset means, how to clear or change it, and how to reach beginner help; no
  state leads with the full-dictionary count.

## Where the rest lives

- Template mechanics (what templates MAY / MUST NOT do, registered helpers, pre-shaped-boolean
  discipline): `template-conventions.md`.
- Controller / HTTP shape, status codes, cookies, auth gates: `controller-conventions.md`.
- Service page-shaping methods and view-model ownership: `service-layer.md`.
- Each page's audience, rendering contract, and sensitive-page invariants: the owning service's
  file-header JSDoc.
- Privacy, visibility, and anti-enumeration rendering rules: `DATA_GOVERNANCE.md`, plus the owning
  service's JSDoc and route/template tests.
