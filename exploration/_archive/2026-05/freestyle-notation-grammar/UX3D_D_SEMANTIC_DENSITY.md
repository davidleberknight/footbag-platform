# UX3d-d -- Semantic Density Convergence

Date: 2026-05-11. Status: exploration + safe-now refinements applied.

Reference benchmark: `exploration/freestyle-notation-grammar/prototype-spinning-symposium-whirl.html`
Sister docs: `UX3_FLAGSHIP_SYNTHESIS.md`, `UX3D_C_MONTAGE_QC.md`.

Primary principle: **semantic instrument panel first, editorial depth second.**

Goal: move the flagship production page closer to the prototype's immediate semantic density without losing UX2 editorial richness.

Out of scope per user direction: UX3e relationship systems, ontology / parser / schema / data-surface changes.

---

## 1. Prototype vs current flagship -- side-by-side characterisation

### 1.1 Prototype (`prototype-spinning-symposium-whirl.html`)

Visual rhythm:
- **`max-width: 960px`** with `padding: 24px`
- **`h1` at 1.5rem** with `margin: 0 0 4px` (modest, tight)
- **`h2` at 1rem** with `text-transform: uppercase; letter-spacing: 0.05em; color: muted; font-weight: 600`. Margin 24px above, 8px below
- **`.card` at `padding: 16px 20px; margin-bottom: 12px`** with thin border + 8px radius
- **Role pills at `padding: 1px 6px; border-radius: 4px`** -- compact
- **`.trick-name-display`**: role-coloured tokens at 2.25rem replacing the h1 entirely
- **ADD panel**: flex row of compact stat-blocks (label small caps + value 1.5rem bold)
- **Strong role-color saturation** on content surfaces (notation block, modifier-layering boxes, family lineage tiers)

Feel: a **semantic instrument panel** -- everything is scannable, dense, role-coloured. Compact cards as functional containers. Text-heavy prose absent.

### 1.2 Current UX3 production (Montage post-UX3d-c)

Visual rhythm:
- `.content-section { margin: 32px 0 }` -- generous vertical breaks
- `.section-heading { margin-bottom: 28px }` -- large gap between heading and content
- h2 inherits site-wide style: ~1.5-1.75rem, normal-case, prominent
- Prose paragraphs `line-height: 1.6` -- comfortable for reading
- Hero already prototype-style (decomposition strip, formula, summary)
- Modifier-layering: 12-14px padding, 8px margin-top, semi-opaque tinted backgrounds
- Family lineage: 8px tier padding, dotted dividers

Feel: an **article page with semantic accents**. The role-coloured surfaces are there but separated by quiet whitespace and prominent prose-style h2 headings. Reads as instructional content with infographic moments rather than as an instrument panel.

### 1.3 Concrete gap visualisation

| Surface | Prototype style | Current style | Convergence gap |
|---------|-----------------|----------------|-----------------|
| Section heading | small caps + uppercase + muted + 1rem | site-default h2 (1.5-1.75rem, normal weight) | large (h2 weight + size) |
| Section padding | tight cards | generous .content-section margins | medium (32px -> ~16px desired) |
| Section intro | terse one-liner, small | longer "Description / intent" paragraph in muted | small (sizing only) |
| Notation surface | inline `.notation-block` code in a tight card | full `.content-section` with heading + intro + tokens | medium (chrome) |
| Modifier layering | nested boxes with saturated bonus weights | nested boxes with semi-opaque tints | small (saturation only) |
| Family lineage | tier-grouped rows in dotted-bordered tight rhythm | same shape; slightly more padding | small (margin only) |
| Hero name display | role-coloured tokens AT 2.25rem | plain h1 + separate decomposition strip below | medium-large (h1 treatment) |

The prototype's instrument-panel feel comes mostly from **the typography of h2** (small caps, muted, tight) + **tight section margins** + **compact card chrome**. The role coloration is already in place. The convergence is largely typographic and spatial, not chromatic.

---

## 2. Refinement strategies

### 2.1 Visual hierarchy compression

**Tighten section rhythm.** The prototype's h2 sits 24px above + 8px below its content; the current site has 32px above (`.content-section` margin) + 28px below (`.section-heading` margin-bottom). Net: 60px between section content vs prototype's 32px.

Strategy: scope a `.trick-shell` class on the shell wrapper; restyle `.trick-shell .content-section` and `.trick-shell .section-heading` to match the prototype rhythm.

**Tighter section-intro typography.** Section-intro paragraphs render at default `line-height: 1.6` body size. Prototype's equivalent was smaller + muted. Strategy: scope `.trick-shell .section-intro { font-size: 0.88rem; color: muted; margin-bottom: 8px }`.

### 2.2 Semantic-first presentation

**Quieter h2 styling on trick-detail.** Prototype h2 is `font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 600; margin: 24px 0 8px`. Strategy: scope `.trick-shell .section-heading h2` to match.

**Stronger role-colour accents in the modifier-layering panel.** Current opacities (`rgba(...,0.42-0.65)`) are restraint-first. Prototype used near-100% saturation pills inside the boxes. Strategy: bump the inner-name span to a coloured pill at full saturation, matching the prototype's `.role` style. Keep the box border + tint subdued.

### 2.3 Prototype-style coherence

**Card chrome around notation surfaces.** Wrap `.notation-display`, `.operational-notation-display`, and `.trick-modifier-layering-panel` in a shared `.card`-style chrome (white bg, thin border, 8px radius). Within the trick-shell scope, these become a visual "instrument panel" cluster.

**Visual continuity in role coloration.** Right now the cool palette renders with three different visual treatments:
- Hero strip / formula: semi-opaque white on dark
- Notation block: full saturation on white card
- Modifier layering: 40-65% opaque tints on white card

Strategy: harmonise the body surfaces (notation, modifier-layering, family-lineage current tier) to one palette intensity. Hero surfaces continue with the dark-backdrop variant. The harmonisation is a CSS refactor of the existing classes.

### 2.4 Compact flagship mode

**Reduced paragraph spacing in prose.** Execution / Learning / Prereq paragraphs render with `margin: 0 0 12px`. Tightening to `0 0 8px` reduces vertical sprawl without harming readability.

**Tighter family-lineage rows.** Current `padding: 8px 0; border-bottom: 1px dotted #e5e7eb`. Could tighten to `padding: 6px 0` for a denser instrument panel feel.

### 2.5 Preserve

- UX2 prose blocks (Execution / Learning / Prereq) keep their role; they just visually compress
- Universal shell + partial structure preserved
- Progressive density preserved (sparse rows continue to skip prose)
- Accessibility preserved (aria labels + colour-independent role indicators stay)
- Mobile readability preserved (all changes scoped within existing media queries)

---

## 3. Refinement proposals categorised

### 3.1 Safe now (small CSS deltas, scoped to .trick-shell)

| # | Refinement | Risk | Estimated impact |
|---|-----------|:---:|------------------|
| S1 | Add `trick-shell` class to shell wrapper for scoped CSS | none (additive class) | enables S2-S6 below |
| S2 | Quieter h2 inside .trick-shell: 1rem, uppercase, tracked, muted | low (visual only) | high -- single biggest visual gain |
| S3 | Tighter section padding inside .trick-shell: `margin: 20px 0` (was 32px) | low | medium |
| S4 | Tighter section-heading margin-bottom: 12px (was 28px) | low | medium |
| S5 | Section-intro typography: 0.88rem, muted, less margin | low | small-medium |
| S6 | Prose paragraph spacing: `margin: 0 0 8px` (was 12px) inside .trick-shell | low | small |

All six together produce a meaningfully tighter scan-density on trick-detail pages while leaving every other page unaffected (the scope is the `trick-shell` class).

### 3.2 Medium risk (larger CSS / partial refactors)

| # | Refinement | Risk | Estimated impact |
|---|-----------|:---:|------------------|
| M1 | Wrap notation + operational + modifier-layering in shared `.card`-style chrome | medium (visual identity shift; existing surfaces have their own backgrounds) | high -- creates the "instrument panel" cluster |
| M2 | Saturate modifier-layering name pills to full role colour | medium (existing semi-opaque is restraint-first; full saturation reads heavier) | medium |
| M3 | Role-colour continuity refactor (harmonise hero variants with body variants) | medium-high (touches multiple CSS rule sets) | high but bounded |
| M4 | Family-lineage tier padding tightening (8px -> 6px) | low-medium (verify mobile single-column doesn't crowd) | small-medium |
| M5 | Group "Notation surfaces" cluster behind a single ancestor element with shared `aria-label="Notation surfaces"` (no visual change, just semantic grouping) | low | small (a11y) |

### 3.3 Avoid

| # | Refinement | Why avoid |
|---|-----------|----------|
| A1 | Replace h1 with role-coloured tokens (prototype style) | breaks accessibility plain-title readability; UX3d-a augment-not-replace decision still holds |
| A2 | Remove the prose Execution / Learning / Prereq sections | would gut UX2 educational richness; violates "preserve UX2" |
| A3 | Site-wide h2 retraction to 1rem | affects 200+ non-trick pages; out of scope |
| A4 | Replace the universal shell or partial structure | not a refinement; that's UX3-architecture-rewrite scope |
| A5 | Compress mobile differently from desktop | adds maintenance cost; refinements should scale through media queries naturally |
| A6 | Remove the modifier-layering hero formula duplication | the duality is the point per UX3a §9; one is scan-density, one is study-density |

---

## 4. Concrete implementation sketches (safe-now CSS)

### 4.1 Template change: add the scoping class

`src/views/freestyle/trick-shell.hbs`:
```diff
- <div class="wrapper">
+ <div class="wrapper trick-shell">
```

### 4.2 CSS append: scoped tightening

```css
/* ─────────────────────────────────────────────────────────────────────────
   UX3d-d (2026-05-11) semantic-density convergence for trick-detail pages.
   Scoped to .trick-shell so non-trick pages are unaffected. Brings the
   per-section rhythm closer to the original prototype's "semantic
   instrument panel" feel: quieter h2, tighter section padding, smaller
   section intros, denser prose spacing. Pure typography + spacing; no
   colour or layout structure changes.
   ───────────────────────────────────────────────────────────────────────── */

.trick-shell .content-section {
  margin: 20px 0;
}
.trick-shell .section-heading {
  margin-bottom: 12px;
}
.trick-shell .section-heading h2 {
  font-size: 1rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted, #6b7280);
  margin: 0;
}
.trick-shell .section-intro {
  font-size: 0.88rem;
  color: var(--text-muted, #6b7280);
  margin: 0 0 8px;
  line-height: 1.5;
}
.trick-shell .trick-prose-paragraph {
  margin: 0 0 8px;
}
.trick-shell .trick-prose-paragraph:last-child {
  margin-bottom: 0;
}

@media (max-width: 600px) {
  .trick-shell .content-section { margin: 16px 0; }
  .trick-shell .section-heading h2 { font-size: 0.92rem; }
}
```

### 4.3 Expected visual effect

On Montage after S1-S6:
- Section breaks tighten from ~60px to ~32px
- Section h2 headings shrink + go uppercase + recede behind muted colour
- The role-coloured content surfaces (decomposition strip, hero formula, notation tokens, modifier-layering nested boxes, family-lineage tiers) become the dominant visual signal
- Prose remains readable but no longer competes with the structural surfaces for attention
- The page reads as a denser "instrument panel" while preserving the universal shell

### 4.4 Mobile considerations

At <600px:
- Tightened section-padding becomes 16px (was 24px via inheritance)
- h2 shrinks further to 0.92rem (still legible; matches the prototype's compact rhythm)
- Family-lineage stacking unchanged
- Modifier-layering panel unchanged
- No horizontal overflow expected

---

## 5. What "safe-now" achieves -- before / after compression estimate

Estimated vertical-pixel savings on the Montage page at desktop:

| Surface | Pre-UX3d-d height | Post-UX3d-d height | Saving |
|---------|------------------:|-------------------:|-------:|
| Hero block | unchanged (already compact) | unchanged | 0 |
| About section header + intro + dl | ~140 px | ~96 px | ~44 px |
| Notation section header + intro + tokens | ~100 px | ~64 px | ~36 px |
| Operational section header + intro + tokens + source | ~120 px | ~80 px | ~40 px |
| Modifier layering header + intro + nested boxes | ~80 px header chrome | ~48 px header chrome | ~32 px |
| Execution / Learning / Prereq prose | ~280 px total | ~220 px total | ~60 px |
| Family lineage header + intro + tiers | ~80 px header chrome | ~48 px header chrome | ~32 px |
| Related Tricks + Media + Pathways + Previous + Records | ~600 px | ~540 px | ~60 px |
| Total (Montage flagship) | ~3000 px | ~2700 px | **~300 px (~10%)** |

The instrument-panel feel comes from **typography compression**, not from removing content. All 25 surfaces still render.

---

## 6. Implemented in this phase

Safe-now refinements S1-S6 applied:

1. Added `trick-shell` class to the shell wrapper
2-6. Appended scoped CSS for h2 + section padding + section-intro + prose spacing

Medium-risk refinements M1-M5 documented but not implemented; await human direction.

`Avoid` recommendations (A1-A6) are explicitly out of scope.

### 6.1 Validation (post-S1-S6)

| Check | Result |
|-------|--------|
| TypeScript build | clean |
| Freestyle integration tests | 244 / 244 green |
| Other non-trick pages (landing / records / leaders) | unaffected (CSS scoped via `.trick-shell`) |
| Mobile responsiveness | preserved; new media-query branch handles <600px |
| Accessibility | preserved; aria labels untouched; colour-independent role indicators intact |
| Forbidden-term audit | 0 hits |

### 6.2 HTML snapshot

`legacy_data/reports/html_qc/ux3d-d/montage.html` -- post-refinement render.

---

## 7. Visual reference: the prototype's section rhythm

For comparison, this is what the prototype renders inline (lines 138-200 of `prototype-spinning-symposium-whirl.html`):

```
<h2>Jobs notation (raw)</h2>            ← 1rem uppercase muted
<div class="card">                      ← padding 16-20px, border 1px, radius 8px
  <div class="notation-block">...</div>
  <div class="notation-source-tag">...</div>
</div>

<h2>Structural decomposition</h2>
<div class="card">
  <table class="decomp">...</table>
</div>

<h2>Modifier layering</h2>
<div class="card">
  <div class="layer layer-rotation">
    <div class="layer-content">spinning <span class="layer-bonus">+2 ADD (rotational)</span></div>
    <div class="layer layer-modifier">...</div>
  </div>
</div>
```

The post-UX3d-d render reproduces this rhythm structurally; the `.card` chrome around notation + modifier-layering remains M1 (medium-risk; pending).

---

## 8. Recommendations -- ordered by ROI

1. **Apply S1-S6 immediately** (done in this phase). Single biggest visual gain. Zero non-trick impact.
2. **Apply M1** (card chrome for notation + operational + modifier-layering) in a separate refinement -- finishes the "instrument panel" feel.
3. **Defer M2 / M3** (stronger role saturation / role-colour continuity refactor) until M1 lands and is reviewed -- the visual mix may already feel cohesive without further saturation work.
4. **Apply M4** (family-lineage padding) opportunistically when next touching that surface.
5. **Skip A1-A6** -- explicit non-goals.

---

## 9. Decision points

1. **Approve S1-S6 (already implemented)?** Validate visually on Montage; confirm acceptable.
2. **Approve M1 (card chrome cluster)?** Next-priority refinement; bounded scope.
3. **Defer or pursue M2-M3 (role-colour saturation refactor)?**
4. **Confirm "instrument panel first, editorial depth second" as the design north star** for trick-detail going forward, or revise the ordering principle?
