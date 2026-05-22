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
