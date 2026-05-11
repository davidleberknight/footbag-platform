# UX3d-e -- Semantic Cluster Unification

Date: 2026-05-11. Status: exploration + safe-now refinements applied.

Reference: `prototype-spinning-symposium-whirl.html`, `UX3D_D_SEMANTIC_DENSITY.md`, current Montage flagship page.

Primary principle: **the user should feel "I am still examining the same structure" rather than "I entered another content block."**

Goal: make the flagship semantic surfaces feel like one integrated analysis cluster rather than separate document sections.

Out of scope per user direction: UX3e relationship graph, ontology / parser / schema / content-system changes.

---

## 1. Cluster members

Five candidate surfaces:

| Surface | Location | Palette | Active on |
|---------|----------|---------|-----------|
| Hero decomposition strip | inside hero | cool (semi-opaque on dark) | modifier_links >= 2 |
| Hero ADD formula | inside hero | cool (semi-opaque on dark) | adds is numeric |
| Semantic notation | body | cool (full saturation on white) | notation column populated |
| Operational notation | body | warm (full saturation on white) | operational_notation populated |
| Modifier layering | body | cool + role tints on white | modifier_links >= 3 |

The two hero surfaces (strip + formula) are already grouped visually -- they live inside the hero gradient with shared dark-backdrop treatment. The convergence question is about the three body surfaces (semantic notation, operational notation, modifier layering) which currently render as independent `.content-section` blocks separated by `20px` margins.

---

## 2. The "section hopping" problem

Current Montage scroll experience for the body cluster:

```
About this trick     ← prose (editorial)
─── 20px ───
Notation             ← semantic (cool)
─── 20px ───
Set notation         ← operational (warm)
─── 20px ───
Modifier layering    ← structural (nested)
─── 20px ───
Execution            ← prose (editorial)
```

Each surface lives in its own `.content-section` with full chrome (h2 + intro + content). The eye reads them as five independent topics. The instrument-panel feel of the prototype came from the inverse: surfaces that look interchangeable as containers with strong content inside.

Two paths to convergence:

- **Path A -- Shared visual identity (additive chrome).** Give each cluster member matching card chrome. Visual unity emerges from shared appearance; structural HTML unchanged.
- **Path B -- Cluster wrapper (subtractive chrome).** Wrap the 3 surfaces in a single container. Subdivide internally with smaller h3s. Single entry point.

Path A is the prototype's approach (each `.card` shared chrome → cluster feel without wrapper). Path B is more aggressive (one panel, three subsections).

---

## 3. Activation threshold analysis

User's question: "whether the cluster should activate only when modifier_links >= 2".

Live data across the 6 reference tricks:

| Trick | modifier_links | Notation | Operational | Layering | Cluster size | Should cluster? |
|-------|---------------:|:--------:|:-----------:|:--------:|-------------:|:----------:|
| toe-stall | 0 | yes | no | no | 1 | no -- single surface, no clustering useful |
| mirage | 0 | yes | no | no | 1 | no -- same |
| matador | 1 | yes | yes | no | 2 | **yes** -- semantic + operational pair benefits from grouping |
| phoenix | 2 | yes | yes | no | 2 | yes |
| mind-bender | 2 | yes | yes | no | 2 | yes |
| montage | 4 | yes | yes | yes | 3 | yes -- full cluster |

A `modifier_links >= 2` threshold would skip Matador. But Matador has both notation AND operational seeded and reads as a 2-surface cluster naturally.

**Recommended activation rule:** cluster activates when `2+ cluster members render`. Equivalently: `notation present AND operational notation present`. Modifier-layering joins the cluster when also present (Montage today, future >= 3 modifier compounds tomorrow).

Atoms with only semantic notation (Toe Stall, Mirage, base butterfly) render notation as a standalone section. No cluster overhead for sparse pages.

Activation matrix under this rule:

| Trick | Cluster | Members |
|-------|:-------:|---------|
| toe-stall | no | notation alone |
| mirage | no | notation alone |
| matador | yes | notation + operational |
| phoenix | yes | notation + operational |
| mind-bender | yes | notation + operational |
| montage | yes | notation + operational + modifier-layering |

This is the same activation as today's "has operational notation" surface presence rule. The threshold is **data-driven**, not modifier-count gated.

---

## 4. Design options

### 4.1 Option A -- Shared card chrome (matching the prototype)

Each of `.notation-display`, `.operational-notation-display`, `.trick-modifier-layering-panel` gets matching `.card` chrome:

```css
.trick-shell .notation-display,
.trick-shell .operational-notation-display,
.trick-shell .trick-modifier-layering-panel {
  padding: 14px 18px;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 8px;
  margin: 12px 0;       /* tighter than .content-section default */
}
```

Visual result: three cards in a column with matching chrome and tighter spacing than surrounding sections. Visually distinct from the prose (`Execution / Learning / Before you try this`) which keeps prose-only treatment.

The About section continues with no card chrome -- it's editorial, not structural.

```
About this trick     ← prose (no card)
─── 20px ───
┌─ Notation ─────────────────────┐
│  SPINNING DUCKING PARADOX ...  │
└────────────────────────────────┘
─── 12px ───        ← tighter spacing between cluster members
┌─ Set notation ─────────────────┐
│  CLIP >> SPIN [BOD] ...        │
└────────────────────────────────┘
─── 12px ───
┌─ Modifier layering ────────────┐
│  ┌─ spinning (+1) ──────────┐  │
│  │   ...                    │  │
│  └──────────────────────────┘  │
└────────────────────────────────┘
─── 20px ───
Execution            ← prose returns
```

Sketch:
- 3 matching cards visually flag the structural cluster
- 12px between cluster members vs 20px between cluster and prose creates the "I am still examining the same structure" rhythm
- No new HTML wrapper required
- Sparse pages: only Notation renders → renders as a single card (atom-friendly; consistent visual but standalone)

**Risk:** low. Pure CSS additions scoped via `.trick-shell` ancestor + existing surface classes. No structural HTML changes. No accessibility heading-outline impact.

### 4.2 Option B -- Single cluster wrapper with subdivided content

Wrap the 3 surfaces in one `<section class="trick-semantic-cluster">`. Single cluster h2 "Structural analysis". Inner surfaces lose their own h2 -- they become h3 sub-blocks.

```html
<section class="trick-semantic-cluster">
  <div class="section-heading"><h2>Structural analysis</h2></div>
  
  <div class="cluster-block cluster-notation">
    <h3>Notation</h3>
    <code>...</code>
  </div>
  
  <div class="cluster-block cluster-operational">
    <h3>Set notation (operational)</h3>
    <code>...</code>
  </div>
  
  <div class="cluster-block cluster-layering">
    <h3>Modifier layering</h3>
    <div class="modifier-layer-stack">...</div>
  </div>
</section>
```

Visual result: single cluster card with three internal subsections. Single entry point.

**Risk:** medium. Requires partial restructuring (3 partials lose h2 wrappers, gain h3 wrappers; service may need to emit cluster-relevant data). Affects heading hierarchy (a11y outline tools see one section h2 + three h3s rather than three h2s). Sparse pages need a fallback rendering (notation-only with no cluster).

### 4.3 Option C -- Shared backdrop tint

Wrap the 3 surfaces in `<div class="trick-semantic-cluster">` with a subtle background tint (e.g. `rgba(243, 244, 246, 0.5)`). Surfaces keep their own h2s. Backdrop visually links them.

**Risk:** low-medium. Wrapper introduces a new container element; styling is purely visual; no structural reshuffling.

### 4.4 Option D -- Shared left-border accent

Add a 3px left border to each cluster member in a muted brand colour. Surfaces become visually aligned along a shared column.

**Risk:** low. Pure CSS. Less visual force than A or C; reads as "related" rather than "unified".

### 4.5 Option E -- Tightened inter-section margin only

Reduce `.content-section` margin between cluster members specifically (12px) while keeping default (20px) elsewhere. No visual chrome change.

**Risk:** lowest. But least cluster-feel; the eye may not register the tighter spacing as unification.

---

## 5. Recommendation

**Safe-now: Option A (shared card chrome).** Highest visual ROI for lowest risk. Matches the prototype's approach exactly (each `.card` shared chrome). Each cluster member gets matching chrome; tighter spacing between them; prose sections continue with no chrome. Pure CSS scoped via `.trick-shell` + existing surface classes.

**Medium-risk for follow-up: Option B (single wrapper with subdivision).** Strongest "single instrument panel" feel, but requires partial restructuring + careful a11y heading review. Defer to a future phase if Option A doesn't feel unified enough after live evaluation.

**Avoid: Option C / D in combination with Option A.** Combining a card chrome with backdrop tint AND left-border accents stacks visual signals; readability suffers. Choose one.

---

## 6. Implementation (Option A safe-now)

### 6.1 CSS append

```css
/* UX3d-e (2026-05-11) semantic-cluster shared chrome. Three structural
   surfaces (notation, operational notation, modifier layering) render as
   matching cards. Shared chrome + tighter spacing between them communicates
   "single integrated analysis cluster" without HTML restructuring. Atom
   pages with notation-only render the standalone card; the cluster feel
   emerges only when 2+ surfaces are present.
*/

.trick-shell .notation-display,
.trick-shell .operational-notation-display,
.trick-shell .trick-modifier-layering-panel {
  padding: 14px 18px;
  border: 1px solid var(--border, #e5e7eb);
  background: #fff;
  border-radius: 8px;
  margin: 12px 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

/* Tighter section-heading inside the cluster surfaces -- the card chrome
   provides the visual break, so the heading needs less margin-bottom. */
.trick-shell .notation-display .section-heading,
.trick-shell .operational-notation-display .section-heading,
.trick-shell .trick-modifier-layering-panel .section-heading {
  margin-bottom: 8px;
}

/* Mobile: tighten internal padding for narrow viewports. */
@media (max-width: 600px) {
  .trick-shell .notation-display,
  .trick-shell .operational-notation-display,
  .trick-shell .trick-modifier-layering-panel {
    padding: 10px 12px;
    margin: 10px 0;
    border-radius: 6px;
  }
}
```

### 6.2 No HTML changes

Pure CSS. The existing partials emit the same DOM. The card chrome is purely visual.

### 6.3 What this achieves

- The 3 structural surfaces share matching chrome → eye reads them as related
- Prose sections (Execution / Learning / Prereq) continue with their existing prose-style appearance → reads as different content type
- Atoms (Toe Stall, Mirage) with only notation render the single notation card → consistent visual identity, no cluster overhead
- Mobile: card chrome scales with tighter padding

---

## 7. Mobile considerations

At 375 px:
- Card padding tightens to 10x12 (from 14x18 on desktop)
- Inter-card margin tightens to 10px (from 12px)
- Border radius softens to 6px
- The nested modifier-layering boxes inside the card maintain their own padding tightening per UX3d-b CSS

The cluster reads as a vertical stack of 3 tight cards. No horizontal overflow. Token wrapping unaffected.

---

## 8. Accessibility considerations

- No HTML structure change → heading outline (h2 sequence) unchanged
- Existing `aria-label` attributes preserved on each section
- Glossary deep-links inside each card unchanged
- Colour-independent role indicators (per-role bottom-underline on hero strip) unaffected
- The card chrome adds NO new colour information that could confuse colourblind users -- it's structural visual signal only

---

## 9. Per-page evaluation (post-Option-A implementation)

### 9.1 Montage (flagship; cluster size 3)

Three matching cards in a column: Notation / Set notation / Modifier layering. Tighter margin between them (12px) than above About (20px) or below Execution (20px). The eye reads "this is one analytical zone".

### 9.2 Mind Bender + Phoenix (cluster size 2)

Two matching cards: Notation / Set notation. Modifier layering omits (below threshold). Cluster reads as a "notation pair" -- semantic + operational.

### 9.3 Matador (cluster size 2)

Same shape as Mind Bender / Phoenix. The 1-modifier compound benefits from clustering even though it doesn't hit the modifier-layering threshold.

### 9.4 Toe Stall + Mirage (cluster size 1)

Single notation card. The chrome makes it look like a "data card" rather than a section heading + content. Consistent visual identity, no overhead.

---

## 10. Categorised proposals

### Safe now (this phase)

| # | Refinement | Status |
|---|-----------|:------:|
| E1 | Card chrome on notation / operational / modifier-layering surfaces | **implementing** |
| E2 | Tighter inter-cluster spacing (12px vs 20px) | **implementing** |
| E3 | Tighter card section-heading margin-bottom (8px vs 12px) | **implementing** |
| E4 | Mobile padding tightening for card chrome | **implementing** |

### Medium risk (future)

| # | Refinement | Notes |
|---|-----------|-------|
| E5 | Option B single-wrapper restructure with cluster h2 + sub-h3s | Requires partial refactoring; affects a11y outline; stronger visual unity |
| E6 | Add cluster eyebrow label ("Structural analysis") above the first card | Adds one element above the cluster; small unification gain |
| E7 | Sticky cluster-internal sub-navigation | Would aid long-page navigation but adds complexity |

### Avoid

| # | Anti-pattern | Why avoid |
|---|--------------|-----------|
| E8 | Combine card chrome + backdrop tint + left-border accents | Visual signal overload; readability suffers |
| E9 | Card chrome on prose sections (Execution / Learning / Prereq) | Would erase the structural-vs-editorial visual distinction |
| E10 | Card chrome on About section | About is editorial, not structural; would muddy the cluster signal |
| E11 | Cluster-only h2 elimination | Affects heading outline; a11y regression |

---

## 11. Decision points

1. **Approve safe-now E1-E4 (Option A) implemented in this phase?** Visual sanity-check on Montage and confirm cluster feels integrated without feeling heavy.
2. **Consider Option B (E5) as a follow-up phase if Option A reads insufficient?** Stronger unification at higher complexity cost.
3. **Confirm Matador (1 modifier) inclusion in the cluster?** Current rule activates clustering whenever notation + operational both render. Matador qualifies because operational notation is seeded for it.
4. **Confirm prose sections remain outside the cluster?** Preserves the structural-vs-editorial distinction.

---

## 12. Sketch reference

```
═══ HERO (dark gradient) ═══════════════════════════════════════
  breadcrumb / eyebrow
  Montage
  [spinning] [ducking] [paradox] [symposium] [whirl]      ← UX3d-a
  whirl family / 7 ADD / compound / 3 kicks (record)
  spinning(+1) + ducking(+1) + ... + whirl(3) = 7 ADD     ← UX3c-c
  A 7-ADD whirl compound...                               ← summary
═══════════════════════════════════════════════════════════════

  Featured demonstration
  Curated tutorial coming soon...

  About this trick
  [editorial prose]
  Base trick: whirl (3 ADD)

──── UX3d-e cluster begins ───────────────────────────────────
┌─────────────────────────────────────────────────────────────┐
│  NOTATION                                                   │
│  SPINNING DUCKING PARADOX SYMPOSIUM WHIRL  Token reference →│
└─────────────────────────────────────────────────────────────┘
        12px
┌─────────────────────────────────────────────────────────────┐
│  SET NOTATION (OPERATIONAL)                                 │
│  CLIP >> SPIN [BOD] > DUCK [BOD] ...                        │
│  Source: FootbagMoves.com.       Token reference →          │
└─────────────────────────────────────────────────────────────┘
        12px
┌─────────────────────────────────────────────────────────────┐
│  MODIFIER LAYERING                                          │
│  Each modifier stacks onto the base; weights add to total.  │
│  ┌─ rotation: spinning (+1) ───────────────────────────┐    │
│  │  ┌─ modifier: ducking (+1) ──────────────────────┐  │    │
│  │  │  ... (5 nested layers) ...                    │  │    │
│  │  └─────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                       Total ≡ 7 ADD         │
└─────────────────────────────────────────────────────────────┘
──── UX3d-e cluster ends ─────────────────────────────────────
        20px

  Execution                                                  ← prose
  [walkthrough paragraphs]
  
  Learning notes
  [paragraph]
  
  Before you try this
  [paragraph]
  
  Montage Family (ADD-tiered)
  ...
```

The cluster (3 cards bracketed in matching chrome) reads as "one analytical zone". Above and below, the prose continues in unchrome'd `.content-section` blocks. The eye distinguishes "structural reference cards" from "editorial prose flow" naturally.
