# Presentation Object Hierarchy — Field-Order Normalization Audit (2026-05-16)

## Scope

Following on the prior renderer-normalization (Slice A) and symbolic-language audits, this audit narrows to one concrete failure mode: **the same trick renders with a DIFFERENT visible field order across views**, even though it uses the same partial and the same data object.

Renderer normalization (Slice A) confirmed the partial is shared. Symbolic-language hierarchy (`SYMBOLIC_REPRESENTATION_HIERARCHY.md`) addresses which dialect each view should speak. **This audit addresses how the fields within a card are ORDERED, regardless of dialect content.**

ADD View is the canonical hierarchy. Family / Component / Topology / Category views must conform.

## Canonical hierarchy (from ADD View)

The order users see in ADD View, row by row:

1. **Trick title** (`#whirl`)
2. **Symbolic formula** (compositional chain OR operational notation OR nothing)
3. **ADD chip** (`3 ADD`)
4. **Tutorial/media badge** (`TUTORIAL AVAILABLE` / `DEMO ONLY`)
5. Status badge (optional)
6. Placeholder note (optional)

Visible as one inline row in ADD View (registry density, 4-column grid).

## Current divergence — DOM trace per density

### Registry density (ADD View)

DOM emission order in `dictionary-trick-card.hbs:30-60`:

```
<article class="dict-card dict-card--registry" ...>
  <a class="dict-card-title">...</a>              <!-- 1 -->
  <span class="...dict-card-equivalence">...</span>  <!-- 2: formula (chain or op-notation) -->
  <span class="dict-card-add">...</span>          <!-- 3 -->
  <span class="dict-card-media-chip">...</span>   <!-- 4 -->
  <span class="dict-card-status-badge">...</span> <!-- 5 -->
</article>
```

CSS:
```
.dict-card--registry {
  display: grid;
  grid-template-columns: minmax(8rem, max-content) 1fr max-content auto;
}
```

4-column grid: title / formula / ADD chip / chips-and-badges. Field order matches user-canonical: **title → formula → ADD → badge**. ✓

### Browse density (Family / Component / Topology View)

DOM emission order in `dictionary-trick-card.hbs:63-99`:

```
<article class="dict-card dict-card--browse" ...>
  <header class="dict-card-header">                <!-- 1+3 wrapped together -->
    <a class="dict-card-title">...</a>             <!-- 1 -->
    <span class="dict-card-add">...</span>         <!-- 3 (out of canonical order!) -->
  </header>
  <p class="...dict-card-equivalence">...</p>       <!-- 2: formula -->
  <p class="dict-card-media-chip">...</p>           <!-- 4 -->
  <p class="dict-card-status-badge">...</p>         <!-- 5 -->
</article>
```

CSS:
```
.dict-card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
```

**Visual order: title (left) + ADD chip (right) → formula → badge.** Field order is `1, 3, 2, 4` — ADD chip is BEFORE the formula visually. **Diverges from canonical.** ✗

### What you see in the screenshots

| View | Row 1 | Row 2 | Row 3 |
|---|---|---|---|
| ADD View (registry) | `#whirl  [set] > leggy in dex > ss clipper  [3 ADD]  [TUTORIAL]` — single inline row, field order 1→2→3→4 | — | — |
| Family View (browse) | `#whirl ........... [3 ADD]` (title left, ADD top-right) | `[set] leggy in dex ss clipper` | `TUTORIAL AVAILABLE` |

In Family View, the `[3 ADD]` chip visually precedes the formula. In ADD View, the formula precedes the `[3 ADD]` chip. **Same data, same partial, same density-mode parameter, but different visible hierarchy.**

## Root cause

`dict-card-header` wrapper in the browse density branch. It groups `dict-card-title` and `dict-card-add` into a flex container with `justify-content: space-between`. This forces the ADD chip to render BEFORE the formula slot (which lives outside the header, as a block below).

The fix is a partial restructure + CSS adjustment. No service-shape change. No template-call-site change. No taxonomy or ontology work.

## Proposed contract

### Field order (BOTH densities)

```
1. Trick title
2. Symbolic formula (chain OR op-notation OR pending placeholder)
3. ADD chip
4. Media chip (tutorial/demo/missing)
5. Status badge (external-only placeholders)
6. Placeholder note (optional adjudication explainer)
```

The DOM emits fields in this order. CSS may control SPACING (inline vs stacked, gaps, padding, font sizes) but **must not reorder** the fields.

### Density modes

`registry` and `browse` are KEPT. Their permitted differences:

| Aspect | Registry | Browse |
|---|---|---|
| Layout | 4-column grid (single row) | Vertical stack (multi-row) |
| Title font size | 0.95 rem | 1.05 rem |
| Formula font size | 1.00 rem | 1.10 rem |
| Spacing rhythm | compact (column gaps) | breathing (row gaps) |
| ≡ sigil | hidden via CSS | visible |
| Field order | 1→2→3→4→5→6 | 1→2→3→4→5→6 (must match) |

Density NEVER changes the field order. Density NEVER moves fields between rows in a way that reorders them visually.

### "Same trick = same object" contract

For any `slug`, the rendered card must satisfy:

1. Title element comes before formula element comes before ADD-chip element comes before media-chip element (DOM order).
2. Title link href is identical.
3. ADD label string is identical.
4. First-reading token text + role + glossary anchor are identical.
5. Media chip text (if present) is identical.

Differences allowed only in:
- Wrapping element types (`<span>` vs `<p>`)
- Layout CSS (inline vs block)
- Font sizes / weights / paddings
- Anchor-highlight emphasis on group-anchor tokens

## Implementation plan (smallest safe slice)

This audit also IMPLEMENTS the fix because the diagnosis is mechanical and the surface area is small. Changes:

1. **`src/views/partials/dictionary-trick-card.hbs` — browse density branch:**
   - Remove `<header class="dict-card-header">` wrapper.
   - Emit title link as a direct child of the article.
   - Move ADD chip to AFTER the formula slot.
   - Keep media chip, status badge, placeholder note positions (already after).

2. **`src/public/css/style.css`:**
   - Remove `.dict-card-header` rule (lines 5165-5171) — the class is no longer emitted.
   - Remove `.dict-card-header` mobile rule (line 5597-ish) — same reason.
   - Add `.dict-card--browse` flex-column layout to keep vertical rhythm.
   - Add `.dict-card--browse .dict-card-title` block display.
   - Add `.dict-card--browse .dict-card-add` block-ish display (or aligned to its own row).

3. **Tests:**
   - New invariant test asserting DOM-order across both densities for one pilot.
   - Update any existing test that asserted on `<header class="dict-card-header">` markup (none found in current grep, but will verify on test run).

No service shape change. No view-builder change. No new view-model fields. The partial template is the only meaningful surface.

## Risks

1. **Visual rhythm changes in Family View** — the ADD chip moves from "top-right" to "after the formula." For multi-reading cards (e.g., `blurry whirl` with 2 chains), the ADD chip pushes down a row. Users skimming for ADD value will need to look further down. This IS the user's requested change; intentional.

2. **CSS regression on hover / layout** — registry density already uses grid; browse density currently uses default block flow with a flex header. Removing the header may surface previously-masked layout bugs (e.g., margin collapse, baseline alignment). Mitigation: visual QC after the change.

3. **Existing tests that hard-coded the header structure** — grep found zero references in `tests/`. Verifying on the test run.

4. **Mobile responsive rule for `.dict-card-header`** — exists at style.css ~line 5597. Will be removed since the class no longer exists.

## Acceptance criteria

For each of the 4 pilot tricks (`whirl`, `paradox-whirl`, `dimwalk`, `torque`):

- ADD View card and Family View card emit identical field order: title → formula → ADD → media → status → placeholder
- Card-region regex test passes: title element position-index < formula element < ADD chip < media chip in the rendered HTML
- Existing identity tests continue to pass (token content, ADD label, displayName)

## Not in scope (deferred)

- Operational-notation demotion (proposed in `SYMBOLIC_REPRESENTATION_HIERARCHY.md` — Slice G2)
- Anchor declaration for family bases (proposed there — Slice G1)
- Pending-placeholder symmetry across densities (user picked Option 3 — no change)
- Family-view multi-family memberships (Slice D)
- Token role recoloring (no change)
- Hover affordances on tokens (no change)
- Glossary anchor link rules (Slice E shipped; no change)

This is presentation-object normalization only. Field order. Nothing else.
