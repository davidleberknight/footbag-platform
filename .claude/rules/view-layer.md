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

## Visual standard (look-and-feel consistency)

All public pages present one consistent experience: clean, content-first layout; consistent spacing,
typography hierarchy, card and metadata treatment, empty-state and notice styling, header and footer
behavior. No section introduces its own chrome system or a parallel design language; a new surface
inherits the shared tokens and primitives. Consistency is a forward requirement, not a one-time
state.

The durable visual decisions live in DESIGN_DECISIONS §4 and are mechanically enforced by
`scripts/ci/assert_conventions.sh`: one type system with body-font notation (§4.6), canonical
breakpoints 480 / 768 / 1024 (§4.7), accessible responsive HTML-first design (§4.4), and the
stylesheet / template convention gates (§4.8) — colors from `:root` tokens (no raw hex in rule
bodies), `--radius*` tokens for corners, `--font-body` / `--font-mono` only, no inline `style` or
`script`, no nested `<form>`, and template-class-to-`style.css` correspondence.

## Where the rest lives

- Template mechanics (what templates MAY / MUST NOT do, registered helpers, pre-shaped-boolean
  discipline): `template-conventions.md`.
- Controller / HTTP shape, status codes, cookies, auth gates: `controller-conventions.md`.
- Service page-shaping methods and view-model ownership: `service-layer.md`.
- Each page's audience, rendering contract, and sensitive-page invariants: the owning service's
  file-header JSDoc.
- Privacy, visibility, and anti-enumeration rendering rules: `DATA_GOVERNANCE.md`, plus the owning
  service's JSDoc and route/template tests.
