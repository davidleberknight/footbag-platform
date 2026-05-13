# SYMBOLIC_VISUAL_CONSOLIDATION — CSS / Terminology / Heading Consistency

UX-CONSOLIDATION-1 Task C. Identifies visual inconsistencies across the symbolic subsystem + proposes light cleanup. **Does not redesign flagship trick pages.** Scope is the symbolic subsystem only.

**Date:** 2026-05-12

---

## 1. Observational badge — current state

Three nearly-identical tooltips, one divergent.

| Tooltip text | Used on |
|---|---|
| `Observational symbolic-grammar layer — does not change IFPA family classifications` | Related Topology panel (Surface 1); Walking Progression (Surface 2); Spinning Modifier (Surface 3) |
| `Observational symbolic-grammar layer — supplementary, non-canonical` | Glossary Connective panels (Surface 4) |

**Recommendation:** unify to a single tooltip that captures both meanings:

```
Observational symbolic-grammar layer — supplementary; does not change canonical classifications
```

Reasoning: the "supplementary" framing applies to all four surfaces; the "does not change canonical classifications" framing is also true for all four (it doesn't only apply to IFPA `trick_family` — it also applies to glossary canonical definitions). One unified tooltip captures both.

**Light-cleanup action:** safe to do now. 4 partial/template files affected; trivial change.

---

## 2. Disclaimer footer — current state

Four variations, all anchored on `Observational symbolic-grammar layer.` as the opening sentence.

| Surface | Opening | Specific prose |
|---|---|---|
| 1 | "Observational symbolic-grammar layer." | "Topology groups describe mechanical similarity and may cross-cut the IFPA trick family. Canonical relating lives in the Related Tricks section above." |
| 2 | "Observational symbolic-grammar layer." | "This progression surfaces mechanical similarity across the butterfly-wing topology. It does not change canonical IFPA family classifications." |
| 3 | "Observational symbolic-grammar layer." | "This page is educational and describes the {modifier} modifier physically and mechanically. It does not change canonical IFPA family classifications or modifier-table ADD rules." |
| 4 | "Observational symbolic-grammar layer." | "These panels surface mechanical and educational connections; the canonical glossary sections above are the authoritative reference for terminology." |

**Pattern:** every footer follows `Observational symbolic-grammar layer. {context-specific prose}.` The context-specific second sentence varies by surface — appropriate; each surface points to a different canonical reference (Related Tricks section / IFPA family classifications / modifier-table ADD rules / glossary canonical sections).

**Recommendation:** **keep the variation.** This is genuinely contextual, not duplicative. Each footer correctly points the reader back to the relevant canonical reference for THAT surface. **No change recommended.**

---

## 3. CSS class redundancy

Five rules with `background: #fafaf7; border-left: 3px solid #d6d2c4; border-radius: 0 4px 4px 0;`:

| Class | Lines |
|---|--:|
| `.symbolic-related-topology` | 3931-3937 |
| `.symbolic-walking-progression .progression-step` | 4018-4024 |
| `.symbolic-modifier-family .confusion-card` | 4180-4186 |
| `.symbolic-modifier-family .diagram-placeholder` | (different pattern; dotted border) |
| `.glossary-connective-panel` | (with same colors) |

**Proposed consolidation:** introduce a shared `.symbolic-card` base class. Surface-specific rules add their own padding/dimensions/structural details on top.

```css
.symbolic-card {
  background: #fafaf7;
  border-left: 3px solid #d6d2c4;
  border-radius: 0 4px 4px 0;
}
```

Then update each rule to either:
- Use `.symbolic-card` directly in HTML (preferred — saves CSS)
- Or `@extend .symbolic-card` semantics: keep rule but document that it inherits the pattern

**Light-cleanup action:** add the `.symbolic-card` base class to CSS; do NOT modify HTML for now (would touch many partials/templates and risks rendering regressions). The new class is available for future surfaces. Specific cleanup of existing rule duplication can be a follow-up.

---

## 4. Heading hierarchy

Per design, the symbolic subsystem uses different heading levels by surface type:

| Surface | Heading level | Rationale |
|---|---|---|
| 1 (Related Topology panel — INSIDE trick page) | `<h3>` | subordinate to canonical Related Tricks `<h2>` |
| 2 (Walking Progression page — full page) | `<h2>` for section | page-level surface |
| 3 (Spinning Modifier page — full page) | `<h1>` page title, `<h2>` per section | page-level surface |
| 4 (Glossary Connective panels — INSIDE glossary page) | `<h2>` section header, `<h3>` per panel | follows existing glossary numbering pattern |

**Inconsistency check:** Surface 4 uses `<h2>` for the section header (matching glossary's existing `<h2>` per numbered section). Surface 1 uses `<h3>` because it sits AS a sub-element inside a trick page where canonical Related Tricks is `<h2>`. Both are correct relative to their context.

**No change recommended.** The heading hierarchy is correctly context-aware.

---

## 5. Spacing audit — current state

Common values across symbolic rules:

| Pattern | Frequency | Surfaces |
|---|--:|---|
| `padding: 12px 14px` | 2 | glossary connective panel + walking progression step (mobile) |
| `padding: 12px 16px` | 1 | Related Topology |
| `padding: 14px 18px` | 1 | Walking progression step |
| `padding: 12px 16px / 14px 18px` (mixed) | 1 | Spinning modifier confusion card vs diagram placeholder |
| `margin-top: 8px` / `10px` / `14px` (block-level) | 4+ | various |

**Verdict:** there's small variation but it's defensible per surface (denser panels use less padding; teaching surfaces use more). **No change recommended.** Worth documenting the convention informally — but not a cleanup target.

---

## 6. Chip/badge styling consistency

Three chip-style elements in the subsystem:

| Element | Style |
|---|---|
| `.symbolic-layer-badge` | uppercase, 0.66rem, `#e8e4d3` bg, `#6e6850` color |
| `.symbolic-topology-adds` | not uppercase, 0.78rem, `#ede9d8` bg, `#8a8470` color |
| `.glossary-connective-panel .panel-symbolic-groups span` | similar pill, 0.74rem, `#ede9d8` bg, `#6e6850` color |
| `.symbolic-walking-progression .step-adds` | 0.82rem, `#ede9d8` bg, `#6e6850` color |

**Verdict:** the layer badge is uppercase and distinctive (correct — it's the layer marker). The ADD-value chips are similar across surfaces. The symbolic-group chips are similar to ADD-value chips. **Two small inconsistencies:**

- ADD-value chip text colors: `#8a8470` (related-topology) vs `#6e6850` (walking progression). Both are valid muted tones, but minor visual drift.
- ADD-value chip font-size: 0.78rem vs 0.82rem.

**Light-cleanup action:** unify ADD-value chip color + font-size across all symbolic surfaces. One CSS rule (probably 0.78rem / `#6e6850`); apply across all three surfaces. Trivial.

---

## 7. Terminology consistency

Headings used to introduce trick-lists:

| Heading | Surface | Semantic |
|---|---|---|
| "Related Tricks" (canonical, NOT symbolic) | trick pages | family-based siblings |
| "Related topology tricks" | Surface 1 | topology-based siblings |
| "Used in these tricks" | Surface 4 (glossary panel) | tricks containing a glossary term |
| "The same idea on other bases" | Surface 3 (modifier page) | same modifier, different base |

**Verdict:** each heading is contextually accurate and semantically distinct. **NO normalization recommended.** Compressing them all to "Related tricks" would lose meaning.

---

## 8. Specific light-cleanup proposals

### Do now (low-risk, allowed)

| # | Cleanup | Files | Risk |
|--:|---|---|---|
| 1 | Unify observational badge tooltip → "Observational symbolic-grammar layer — supplementary; does not change canonical classifications" | 4 template/partial files | minimal |
| 2 | Drop misleading middle `Modifier` breadcrumb on `/freestyle/modifier/spinning` (collapse to `Freestyle / Spinning`) | freestyleService.ts breadcrumb line | minimal |
| 3 | Unify ADD-value chip styling — single rule for `.symbolic-topology-adds`, `.step-adds`, `.cross-base-adds`, `.panel-trick-adds` | 1 CSS rule consolidation | minimal |
| 4 | Add a `.symbolic-card` base class to CSS for future surfaces (not used in existing HTML yet) | style.css | nil |

### Defer (out of UX-CONS-1 scope)

| Item | Why deferred |
|---|---|
| Glossary fragment-anchor support per term | requires data-shaping + glossary template restructuring (not the symbolic subsystem) |
| `/freestyle/learn` symbolic index page | new route; expansion not consolidation |
| Trick-page CTAs linking out to walking progression / spinning modifier page | new template edits across multiple trick pages; expansion not consolidation |
| Refactor existing HTML to use the new `.symbolic-card` class | broad template surgery; risks regressions |

---

## 9. Cross-references

- SYMBOLIC_SUBSYSTEM_AUDIT.md — surface inventory + redundancy findings
- SYMBOLIC_NAVIGATION_COHERENCE.md — breadcrumb fix rationale
- DELIVERABLES_AND_RECOMMENDATION.md — final phase decision
