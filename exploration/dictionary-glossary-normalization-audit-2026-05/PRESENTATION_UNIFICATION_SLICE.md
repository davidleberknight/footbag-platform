# Presentation Unification — Single Density Slice (2026-05-16)

## Scope

Resolves the residual visual divergence the prior Presentation Object Hierarchy slice did not fix. DOM order was normalized; CSS styling was not. After this slice, every browse view renders cards with **identical typography, layout, padding, font sizes, and borders** — only the surrounding section heading and group-anchor underline differ.

## Root cause (precisely)

DOM order was normalized in the prior slice. But registry and browse densities are still visually-distinct component variants because the CSS rules diverge across 7 axes:

| Axis | Registry density | Browse density |
|---|---|---|
| Card layout | 4-column grid (single inline row), baseline-aligned | flex column (vertical stack) |
| Card padding | `6px 10px` | `12px 14px 10px 14px` (default `.dict-card`) |
| Card margin-bottom | `0` | `14px` (default) |
| Card border-bottom | `1px solid #efece2` | none |
| Title font-size | `0.95rem` | `1.05rem` |
| Equivalence font-size | `1.00rem` (inline class) | `1.10rem` (browse override) |
| Equivalence display | `inline`, ≡ sigil hidden | `block`, ≡ sigil visible |
| Media chip font-size | `0.66rem` (registry override) | default (larger) |
| Wrapper | `.dict-card-stack--registry` (flex column, 2px gap) | `.dict-card-stack` (default block flow) |

Same DOM, same field order, but the cards look like different component designs.

## Decision: Option A

The user offered four options. Option A is the minimal mechanical fix: change family / component / topology / category views to use `density="registry"`. ADD View is already canonical; all browse views match it exactly.

**Why not B (collapse density-specific CSS):** B would keep the vertical-stack layout of browse density but match registry's typography. That doesn't satisfy "ADD View cards grouped by family" — the user's screenshots show ADD View cards are single-line, and the user explicitly wants Family/Component/Topology to use that same compact layout.

**Why not C (rename densities as spacing variants):** Same problem — keeps two visual variants.

**Why not D (remove density mode entirely):** Larger blast radius. The browse density branch in `dictionary-trick-card.hbs` becomes dead code under Option A; a follow-up slice can prune it if desired. Slice A makes the partial behaviorally single-density; slice D would make it textually single-density.

## What changes

`src/views/freestyle/tricks.hbs`:

| Branch | Before | After |
|---|---|---|
| Family view (line 116-120) | `<div class="dict-card-stack">{{> dictionary-trick-card density="browse"}}</div>` | `<div class="dict-card-stack dict-card-stack--registry">{{> dictionary-trick-card density="registry"}}</div>` |
| Component view (line 155-159) | same browse density + plain stack wrapper | same registry change |
| Topology view (line 211-215) | same browse density + plain stack wrapper | same registry change |
| Category view (line 187-191) | already registry density | unchanged |
| ADD view (line 95-99) | already registry density (canonical) | unchanged |

The `density="browse"` branch in the partial remains for now — dead code under Option A, removable in a follow-up cleanup slice. The partial's pending-notation rendering (browse-density `<em>Notation pending</em>`) no longer triggers anywhere; registry density is silent.

## Consequences (intentional)

1. **Pending placeholder disappears from all browse views.** Cards with neither a chain nor op-notation render silently — just title + ADD chip on a single grid row. Per the user's prior Option-3 decision (accept silent-vs-pending asymmetry, registry silent). The asymmetry collapses because only registry runs now.

2. **Multi-reading cards show first reading only.** `blurry-whirl` (`blurry whirl` + `stepping paradox whirl`), `gauntlet` (`blurry ducking torque` + `stepping ducking paradox torque`), `matador` (`nuclear butterfly` + `paradox atomic butterfly`), `montage` (single reading) — registry shows only the first inline. Deeper depth lives on the trick detail page; browse cards stay compact and uniform.

3. **≡ sigil is hidden everywhere on browse cards.** Registry CSS hides the sigil via `.dict-card-equivalence--inline .core-trick-equiv-sigil { display: none; }`. Family View tokens are no longer prefixed by `≡` on cards — matches ADD View.

4. **Family-anchor underline still works.** `data-anchor-style="solid"` on the family-view section element triggers the ancestor selector on family-anchor tokens. Cards inside the section maintain the underline behavior. No regression.

5. **Section heading is the only visible differentiator.** Each browse view's outer `<section>` carries its own heading (`<h2>Whirl family</h2>` / `<h2>Body modifiers</h2>` / `<h2>Midtime body modifiers</h2>` / `<h2>Dexterity</h2>`); the cards within are identical to ADD View cards.

## Tests affected (existing)

- `tests/integration/freestyle.family-view-identity.routes.test.ts` — assertions on `<a class="sem-token sem-token--base-anchor sem-token--linked">whirl</a>` etc. still hold (token markup is density-independent). Assertions on `Notation pending` absence already hold and will hold more broadly now. No test edits expected.

- `tests/integration/freestyle.family-view-identity-extended.routes.test.ts` — same shape; no edits expected.

- `tests/integration/freestyle.presentation-hierarchy.routes.test.ts` (just written) — line 162 asserts `class="dict-card dict-card--browse"` on Family View cards. Must update to `dict-card--registry`. Also the "no `dict-card-header`" sweep still holds.

- `tests/integration/freestyle.dictionary-trick-card.routes.test.ts` — montage rendering test asserts `<(?:span|a) class="sem-token` count ≥ 4. Registry density shows only first reading; montage has one reading (`spinning ducking paradox symposium whirl` — 5 tokens). Count of ≥4 still holds.

- `tests/integration/freestyle.cross-link-slice-e.routes.test.ts` — paradox-whirl token regex tests rely on token markup (not density class); should still pass.

## Acceptance criteria

For each pilot (`whirl`, `paradox-whirl`, `dimwalk`, `torque`):

- Same `dict-card--registry` class on the `<article>` in every view
- Same single-line layout (4-column grid)
- Same typography (title 0.95rem / 500, formula 1.00rem)
- Same padding, same border-bottom rhythm
- Same media chip sizing
- Same field order: title → formula → ADD → media → status
- Different ONLY in the surrounding section heading and the family-anchor underline (when group-anchor matches)

## Not in scope

- Removing the browse density branch from `dictionary-trick-card.hbs` (Option D — follow-up cleanup; not blocking)
- Browse-specific CSS rules (lines 5395-5420 area). These become unused; cleanup can remove them in a follow-up.
- Re-enabling the pending-placeholder anywhere (user's Option-3 decision stands; silent is now uniform)
- Re-enabling multi-reading display anywhere except trick detail pages
