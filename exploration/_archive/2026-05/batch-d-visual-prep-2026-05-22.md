# Batch D — Visual / CSS Stabilization — Prep Notes

Prep only. No implementation here. Batch D is the visual pass and needs
the authorized browser-QA on the §2 pages before any CSS change.

**Hard scope for the next session:** visual hierarchy + beginner
readability + movement-first presentation quality. NO ontology / essay /
topology / parser work; no new features; no broad redesign.

Predecessors (done + committed): Batch A terminology, Batch B structure,
Batch C tag identity.

---

## §1 — Implementation notes (audit targets)

Each item is a thing to *inspect under browser QA first*, then fix
surgically. Restraint over throughput.

- **Green-on-green contrast** — audit the `.hero` dark-green gradient
  region for any element using `var(--primary)` (#1bb36b) as text or
  border (e.g. `.hero-year-arrow:hover`, the freestyle hero
  meta-ribbon chips). Green-on-green is low-contrast. Fix toward
  white / `rgba(255,255,255,*)` inside `.hero`.
- **Nav consistency** — confirm one breadcrumb/nav pattern across
  freestyle subpages (some heroes use `<nav class="breadcrumb">`,
  some `breadcrumbs`); normalize styling + spacing.
- **Notation readability** — `.op-token` / `.sem-token` /
  `.hero-decomp-token` / `.dict-card-notation` render compressed.
  Improve token gap / letter-spacing / line-height; consider
  operator-role colour grouping so repeated structure is scannable.
- **Typography density** — add-analysis, glossary, combo-analysis carry
  dense prose blocks. Increase paragraph spacing, cap line length,
  break walls.
- **Whitespace hierarchy** — section-to-section spacing on long pages;
  give h2/h3 breathing room.
- **Metadata demotion** — largely handled in Batch B. Re-verify the
  records / leaders / competition `hero-stats` chip rows read as
  secondary, not primary.
- **Top-of-page clutter** — subpage hero tops audited clean at source
  level in Batch B; re-confirm visually (see §3).
- **Mobile readability (480px)** — check the 480px media query for the
  freestyle surfaces: `.observational-tracked-list` (`column-width:24em`
  — confirm it collapses to one column on phones), `.dict-card-hashtag`
  + `.tracked-tag` chip wrap, dict-card layout, hero meta-ribbon wrap.
- **Formula readability / alignment** — hero-formula + ADD-breakdown
  operator chains: align operands, consistent operator spacing.
- **Family-pattern visibility** — in notation, make shared structure
  (whirl / mirage / etc.) visible via operator highlighting or colour
  grouping so neighbourhoods "pop." Avoid visual overload.

## §2 — Browser-QA page checklist

Per page check: contrast · hero · nav · spacing · density · notation
readability · mobile (480px).

- `/freestyle` — section landing (hero, portal cards).
- `/freestyle/tricks` — dictionary landing (stat strip, 6 browse cards,
  new `#slug` chips).
- `/freestyle/tricks?view=family` — family view (dict-card stacks).
- `/freestyle/tricks?view=topology` — Movement Neighbourhoods;
  also `?view=movement-system`.
- `/freestyle/observational` — observed cards + tracked-tags + the
  Tracked vocabulary list.
- Trick detail, representative: `/freestyle/tricks/` + each of
  **whirl · butterfly · mirage · osis · barrage · blender · flurry**
  (hero, notation summary, `#slug` chip, Consecutive Records placement,
  density).

## §3 — Above-the-fold audit prep

Honest finding: Batch B verified the freestyle subpage hero tops are
*already mostly clean* — prior slices removed the "loud gold metadata
strip" and the record chip from the trick hero. The above-the-fold work
is therefore primarily browser *verification*, not demolition.

- **Likely fine — verify only:** trick-detail hero (identity → notation
  summary → featured media → about is already the right order); the
  freestyle subpage heroes.
- **Watch:** records / leaders / competition `hero-stats` chip rows —
  confirm they read as light secondary stats, not a metadata block.
- **Genuine candidate:** the trick-detail page has many stacked
  sections — assess whether it reads as a long scroll (a *density*
  concern, §1, not a reordering one). Do not reorder sections without
  curator sign-off.
- **Do NOT touch the glossary's §0 framing** — that block is the
  glossary explaining its own vocabulary, which is correct per the
  terminology-tier model. It is not above-the-fold clutter.

No confirmed "worst offenders" — the prompt's premise (subpages begin
with clutter) was largely already addressed by prior slices. Treat §3
as a confirmation pass.

---

## §4 — Phase D2 note (findings deferred from D1)

D1 ran browser QA on the 9 high-impact pages and shipped two surgical
CSS contrast fixes (CSS-only, no template change):

- `.breadcrumbs` (plural, hand-written hero crumbs on tricks-landing /
  observational / operators) had zero CSS — dark-on-dark-green and
  effectively invisible. Folded into the `.breadcrumb` rule group so
  both spellings style identically; hero override now covers both.
- `.hero-cross-link a` used `var(--accent, #5a7b48)`; `--accent` is
  undefined, so the "Learn the language →" link fell back to olive
  green at ~1.6:1 on the hero. Now forced white inside `.hero`.
- Hero breadcrumb opacity nudged 0.75 → 0.92 for the lighter end of
  the gradient.

Page #4 was re-pointed from the invalid `?view=movement` to
`?view=movement-system` and QA'd; both D1 fixes render correctly there.
D1 is closed.

The same pass surfaced the following, deferred as outside D1 scope.
These are scoped follow-ups, not drift.

- **Content hygiene — ontology leak in public prose.** The
  movement-system Set / Uptime axis intro
  (`src/content/freestyleMovementSystems.ts`) renders "Red-settled
  compound set modifiers (per pt10: nuclear = paradox + atomic ...)" on
  the public page. `Red-settled` and `pt10` are internal adjudication
  jargon and breach public-prose hygiene. Belongs to the editorial
  audit, not a CSS task — audit every axis intro in that file.
- **Routing — `?view=movement` is not a real view.** Valid dictionary
  views: `add / family / category / sets / component / topology /
  movement-system`. `?view=movement` silently falls back to By ADD.
  The intended "By Movement System" surface is `?view=movement-system`.
  Decide: accept silent fallback, or redirect unknown `view` values.
- **Metadata stacking above first content** (family + ADD views). Four
  stacked explanatory blocks (sources-loaded line, transparency italic,
  expansion italic, beige prose box) push the first family / ADD group
  well below the fold. Condensing is a content decision — curator
  sign-off required.
- **Trick-detail long scroll.** ~13 stacked sections with weak
  section-to-section whitespace. Whitespace / heading-rhythm tightening
  is a safe CSS D2 task; section reordering needs curator sign-off
  (per §3).
- **Observational card density.** Cards carry several low-contrast
  elements (slug, relation, "PB claim: N", "+ More") at small size and
  read muddy. Card-level type scale + spacing pass.
- **Breadcrumb separator normalization.** The `.breadcrumbs` hero
  variant uses a bare `›` text node (not wrapped in `.breadcrumb-sep`),
  so its separator renders full-opacity and the glyph differs (`›` vs
  `/`) from loop-driven crumbs. Cosmetic; wrap + unify in D2.
- **Notation-summary label contrast.** `.trick-notation-summary-fields
  dt` uses `#8a7a40` on white ≈ 4.26:1 — marginally under AA 4.5 for
  small bold text. One-value darken.
- **`--accent` CSS variable is never defined.** Every `var(--accent, X)`
  use relies on its fallback. Not a live bug post-D1, but a footgun:
  define it or drop the variable.
- **Notation token compression** (§1 item). `.op-token` / `.sem-token`
  / `.hero-decomp-token` / `.dict-card-notation` render tight but
  legible; not re-scoped in D1. Revisit token gap / letter-spacing /
  operator-role colour grouping if pursued.
