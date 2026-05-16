# UX1 — Notation interaction audit + educational UX proposal

**Status:** Audit + design proposal. No implementation in this artifact. Validation cases: Montage / Mullet / Spender / Hatchet / Pigbeater (all 5 confirmed rendering correctly).
**Date:** 2026-05-11
**Scope:** UX/presentation enrichment only. No ontology, no parser, no Wave-2, no FM ingestion.

---

## 1. Current state inventory

### 1.1 Semantic notation rendering (cool palette)

**Renderer:** `src/services/notationRendering.ts`. **Template:** `src/views/freestyle/trick.hbs:106-114`.

Each token rendered as:
```html
<span class="notation-token notation-{cssRole}" data-role="{role}" title="{label}">{text}</span>
```

**Roles + CSS classes:**

| Role | CSS class | Color | Example tokens |
|---|---|---|---|
| `core_family` | `.notation-core-family` | green | WHIRL, MIRAGE, OSIS, BUTTERFLY |
| `set` | `.notation-set` | blue | PIXIE, ATOMIC, FAIRY, QUANTUM, NUCLEAR |
| `rotation` | `.notation-rotation` | orange | SPINNING, WHIRLING, SWIRLING, GYRO |
| `modifier` | `.notation-modifier` | gold | TAPPING, DUCKING, PARADOX, SYMPOSIUM, DIVING |
| `delay_surface` | `.notation-delay-surface` | gray | CLIPPER, TOE, HEEL |
| `unusual_surface` | `.notation-unusual-surface` | gray | SOLE, KNEE, HEAD |
| `directionality` | `.notation-directionality` | gray italic | REV, REVERSE |
| `body_component` | `.notation-body-component` | gray | (rare) |
| `footedness` | `.notation-footedness` | gray italic | SAME, OP, IN, OUT |
| `multiplicity` | `.notation-multiplicity` | gray bold | DOUBLE, TRIPLE |
| `suffix` | `.notation-suffix` | gray | (rare) |
| `unresolved` | `.notation-unresolved` | amber dashed | (fallback) |

### 1.2 Operational notation rendering (warm palette)

**Renderer:** `src/services/operationalNotationRendering.ts`. **Template:** `src/views/freestyle/trick.hbs:127-150`.

Each token rendered as:
```html
<span class="op-token op-token--{cssRole}" data-role="{role}" title="{label}">{text}</span>
```

**Roles + CSS classes:**

| Role | CSS class | Color | Example tokens |
|---|---|---|---|
| `surface` | `.op-token--surface` | amber-700 | CLIP, TOE |
| `body_action` | `.op-token--body-action` | orange-700 | SPIN, DUCK, DIVE |
| `rotation_variant` | `.op-token--rotation-variant` | teal-700 | FRONT WHIRL, BACK WHIRL (2-token fusion) |
| `side` | `.op-token--side` | neutral-600 | SAME, OP |
| `direction` | `.op-token--direction` | neutral-600 | IN, OUT, FRONT, BACK (standalone) |
| `component_flag` | `.op-token--component-flag` | neutral-500 small | [DEX], [DEL], [BOD], [XBD], [PDX], [XDEX] |
| `sequence_op` | (neutral default) | gray | `>`, `>>` |
| `pre_state` | (no specific class) | gray | (back), (front), (no plant while), (rooted) |
| `unknown` | (neutral default) | gray | (fallback) |

### 1.3 Glossary linkage

**Template:** `src/views/freestyle/trick.hbs:142-145` — single deeplink at the operational notation section foot:

```html
<p class="operational-notation-glossary-link">
  <a href="/freestyle/glossary#operational-notation">Token reference →</a>
</p>
```

**Glossary doc:** `src/views/freestyle/glossary.hbs` — 12 sections; sections 8 (Notation/Jobs Notation) and 9 (Operational Notation) cover the relevant vocabulary.

### 1.4 Hover/title behavior

Both renderers populate the HTML `title=` attribute with per-token educational text. Examples from `operationalNotationRendering.ts`:

| Token | title= |
|---|---|
| CLIP | "Clipper-stall surface (inside of support foot)" |
| TOE | "Toe-stall surface" |
| [DEX] | "Dexterity component (bag-foot interaction)" |
| [DEL] | "Delay component (lands on a stall surface)" |
| [BOD] | "Body-position component (pose/spin/duck/dive)" |
| (back) | "Backward direction (next move oriented backward)" |
| (no plant while) | "No support-leg plant during this segment" |

The semantic notation renderer uses a `ROLE_LABELS` map for short generic labels per role.

### 1.5 Mobile interaction behavior

**None today.** Native HTML `title=` tooltips fire only on `:hover`, which doesn't trigger on touch devices. Mobile users see no token disclosure surface. The single bottom-of-section glossary link is the only mobile-accessible route to vocabulary explanation.

---

## 2. Strengths

- **Per-token role classification is comprehensive.** Both renderers tokenize cleanly; ambiguous text gets specific roles (e.g. `WHIRL` is `core_family` in semantic but `rotation_variant` in operational when fused with FRONT/BACK).
- **Per-token `title` text is already educational.** Operational tokens carry contextual one-line explanations, not just role-generic labels. Semantic tokens carry role-level fallbacks.
- **Two-palette discipline is preserved.** Cool palette (semantic, core_family/set/rotation/modifier saturated) vs warm palette (operational, surface/body-action/rotation-variant saturated). Restraint-first per `RENDERING_SURFACE_PROPOSAL §3` — secondary roles render muted.
- **Layer separation is structural.** Token classes don't bleed across layers (`.notation-set` vs `.op-token--surface` are distinct classes; ambiguous tokens get layer-appropriate roles).
- **Federation-not-adoption preserved.** Source provenance citation (O1d) accompanies every FM-derived operational notation block.
- **Glossary cross-link exists** (O1c) — discoverability path documented.

---

## 3. Gaps

| Gap | Affects | Severity |
|---|---|---|
| **Mobile/touch users see no per-token education** | All touch-screen visitors | High — primary accessibility gap |
| **Title tooltips are browser-default styled** (small, sans-serif, single-line, ~1s delay) | Desktop hover users | Low — works but feels primitive |
| **Keyboard users (Tab navigation) don't trigger tooltips** | A11y / power users | Medium — accessibility shortfall |
| **No per-token glossary deep-link** | All users | Medium — must scroll through glossary section to find a specific term |
| **No screen-reader explanation beyond `title`** (no `aria-describedby`, no `aria-label` enrichment) | Screen-reader users | Medium — `title` is announced by some screen readers but not all |
| **`title` text isn't curated for consistency** between layers (semantic uses role-generic, operational uses per-token specific) | All users | Low — inconsistent depth |
| **WHIRL/SAME/OP/IN/OUT ambiguity unmarked** between layers | Learners | Medium — same token, different meaning per layer; no cross-link |
| **Pre-state flags `(back)` / `(no plant while)` aren't keyboard-focusable** | A11y | Low |

---

## 4. Token ambiguity notes

Three classes of cross-layer ambiguity surfaced:

### 4.1 `WHIRL` and `SWIRL`

- **In semantic notation** (when standalone or final base): `core_family` — the trick named "whirl" or "swirl" (e.g. SPINNING SYMPOSIUM **WHIRL**)
- **In operational notation** (when fused with FRONT/BACK as a 2-token rotation variant): `rotation_variant` — a rotational dex-step within the trick's execution (e.g. OP FRONT **WHIRL** [DEX] [PDX])

**Recommendation:** the per-token tooltip should explicitly contextualize: "Whirl (here: rotational dex step)" vs "Whirl (here: base-trick family)".

### 4.2 `SAME` / `OP` / `IN` / `OUT`

- **In semantic notation** (rare; per `FOOTEDNESS_TOKENS`): `footedness` — same/opposite foot, inward/outward arc
- **In operational notation** (frequent): `side` (SAME/OP) or `direction` (IN/OUT)

**Recommendation:** acceptable to keep distinct role names; per-token tooltips already differentiate. Optional: surface a "same concept, different layer convention" cross-link.

### 4.3 `CLIP` and `TOE`

- **In semantic notation** (rare; would appear as `CLIPPER` full-word): `delay_surface`
- **In operational notation**: `surface` (set/landing surface; abbreviated)

**Recommendation:** explain abbreviation in operational tooltip; cross-link to glossary surfaces section.

---

## 5. Tooltip taxonomy proposal

Three-tier educational depth per token:

| Tier | Audience | Format | Vehicle |
|---|---|---|---|
| **T1** Quick | All users; first hover/tap | One sentence (~10 words), plain English | `title=` (current) + ARIA |
| **T2** Detailed | Learners who want more | 2-3 sentences with role context, sample usage | Popover/inline expansion |
| **T3** Glossary | Deep learners | Full section in `/freestyle/glossary` with examples and cross-references | Existing glossary page anchors |

**T1 text consistency rules** (proposed):
- Format: `{Token name} ({role context}): {one-sentence plain English}`
- Length: ≤ 70 chars where possible
- Plain English: avoid jargon ("dexterity" → "controlled flick"), but preserve terms that are themselves vocabulary (modifier names, surface names)
- Layer context: when the token is layer-ambiguous (WHIRL, SAME/OP/IN/OUT), prefix with `(here: ...)` to disambiguate
- Curator-curated: T1 text is now editorially load-bearing; should not change without curator review

**Example T1 rewrites:**

| Token | Current title | Proposed T1 |
|---|---|---|
| CLIP | "Clipper-stall surface (inside of support foot)" | "Clipper (set): clipper-stall surface used to start the trick." ✓ minor refinement |
| WHIRL (operational, fused) | "Whirl variant" | "Whirl (rotational dex step): controlled rotation as a trick-internal step." |
| WHIRL (semantic, core_family) | (generic role label only) | "Whirl (base trick): the rotational base family." |
| [DEX] | "Dexterity component (bag-foot interaction)" | "DEX: a controlled-flick step contributing 1 to ADD." |
| [DEL] | "Delay component (lands on a stall surface)" | "DEL: the trick's final stall (landing), contributing 1 to ADD." |
| TAPPING | (role label only) | "Tapping (body modifier; +1): a tap-style body action distinct from Stepping." |

---

## 6. Mobile interaction proposal

### 6.1 Recommended implementation: HTML Popover API (no JS)

The HTML5 Popover API (Chromium 114+, Firefox 125+, Safari 17+) lets tokens reveal richer content on tap/click with zero JS. Implementation pattern:

```html
<button
  popovertarget="popover-token-clip"
  class="op-token op-token--surface"
  data-role="surface"
  aria-describedby="popover-token-clip"
>CLIP</button>

<div popover="auto" id="popover-token-clip" class="token-popover">
  <p class="popover-label">Clipper (set)</p>
  <p class="popover-body">Clipper-stall surface used to start the trick.</p>
  <a href="/freestyle/glossary#operational-notation-surfaces">More in glossary →</a>
</div>
```

**Why this approach:**
- Zero JS — popover dismiss-on-outside-click handled by browser
- Mobile-tap-friendly natively (no `:hover` dependency)
- Keyboard-accessible (Tab focuses the button, Enter/Space opens, Escape closes)
- Screen-reader announces via `aria-describedby`
- Browser-native styling baseline; can be themed via CSS

**Browser support consideration:** Safari 17 ships in iOS 17 (Sept 2023). For sub-3% legacy traffic, the popover element simply doesn't reveal; fallback is the existing `title=` (kept for backwards compatibility).

### 6.2 Alternative: minimal-JS focus-within (fallback path)

If Popover API support concerns outweigh: use `<span tabindex="0">` + CSS `:focus-within` to show a child `<dialog>` or styled tooltip box. Adds ~10 lines of CSS, no JS.

### 6.3 Performance footprint

- Per Wave-1 trick: 5-20 tokens per page; each gets a button+popover pair → ~40 added DOM nodes for the densest case (Montage)
- No JS bundle increase
- Popover-related CSS budget: ~30 lines on top of existing `.op-token--*` palette

---

## 7. Glossary discoverability proposal

Two changes to the glossary surface for per-token deep-linking:

1. **Add per-token anchor IDs** to glossary section 9 (Operational Notation) and section 8 (Jobs Notation). Example:
   ```html
   <h3 id="operational-notation-dex">DEX — Dexterity component</h3>
   <p>...</p>
   ```

2. **Update per-token popover footers** to deep-link to the right anchor:
   ```html
   <a href="/freestyle/glossary#operational-notation-dex">More in glossary →</a>
   ```

This gives every token a 3-tap path: token → popover → glossary section.

---

## 8. Educational UX recommendations (phased)

Priority order, lightest-touch first:

### Phase A — Title-text harmonization (no template change, 1 service-layer edit)

- Standardize `title=` text format across both renderers per §5 taxonomy
- Harmonize semantic-notation role labels (currently generic role labels) to match operational notation's per-token specificity
- Add layer-context prefix for ambiguous tokens (`(here: ...)`)
- **No JS, no CSS, no template change.** Reversible by reverting the constant maps in the two renderer files.

### Phase B — Glossary deep-link enrichment (template + glossary edit)

- Add per-token anchor IDs to `/freestyle/glossary` section 8 + 9
- Update operational notation block's footer link to point to a more useful place than just `#operational-notation`
- Add a parallel "Token reference →" link to the semantic notation block (currently has no glossary link)
- **No JS, light CSS, minor templating change.** Reversible.

### Phase C — Popover API integration (template + small CSS)

- Change `<span class="op-token">` to `<button popovertarget="...">` for each token
- Emit `<div popover="auto">` siblings with T1+T2 content + glossary deep-link
- Add ~30 lines of CSS for popover positioning + theming
- **No JS bundle increase.** Requires Popover API browser support (≥97% modern browsers).
- A11y: `aria-describedby` + `tabindex` ordering + Escape dismiss all native.

### Phase D — Future-optional: inline expansion (deferred)

- Click token → expand inline below the notation block with full T2 + cross-references
- Requires modest JS (~50 lines) for the expand/collapse behavior
- Defer until Phase C feedback says popovers aren't enough

---

## 9. Implementation phasing — exact change list

If you approve, here's the surgical change for each phase:

### Phase A (recommended first; ~30 minutes of edits)

1. `src/services/operationalNotationRendering.ts`:
   - `WORD_TOKEN_LABELS`: minor wordsmithing per §5 (CLIP/TOE/WHIRL/SWIRL specifically) — add "(here: ...)" prefix where ambiguous
2. `src/services/notationRendering.ts`:
   - `ROLE_LABELS`: replace role-only labels with per-token labels mirroring the operational renderer's depth
   - Add WORD_TOKEN_LABELS pattern for semantic vocabulary
3. Tests: extend `tests/integration/freestyle.routes.test.ts` to assert new tooltip strings appear (single-token spot-check is enough)

### Phase B (Phase A optional prerequisite)

1. `src/views/freestyle/glossary.hbs` section 8 + 9:
   - Add `id="..."` anchors per token sub-heading
2. `src/views/freestyle/trick.hbs`:
   - Add semantic notation glossary link (parallel to operational notation's)
   - Optionally enrich the operational notation glossary link with a token-specific anchor

### Phase C (Phase A + B prerequisite)

1. Both renderers: emit popover-target attributes + matching popover divs
2. `src/views/freestyle/trick.hbs`: emit popover containers after each notation block
3. `src/public/css/style.css`: add `.token-popover` styles + responsive positioning
4. Tests: a11y test for keyboard navigation; touch-tap fallback test

---

## 10. Validation cases — current rendering state

All 5 Wave-1 pages verified rendering both notation surfaces with full token classification:

| Trick | Semantic tokens | Operational tokens | Roles exercised |
|---|--:|--:|---|
| Montage | 5 | 20 | sem: rotation/modifier/core_family ; op: surface/sequence_op/pre_state/body_action/component_flag/side/direction/rotation_variant |
| Mullet | 4 | 16 | sem: modifier/core_family ; op: surface/sequence_op/pre_state/body_action/component_flag |
| Spender | 3 | 19 | sem: rotation/modifier/core_family ; op: same coverage as Montage |
| Hatchet | 2 | 13 | sem: modifier/core_family ; op: surface/sequence_op/body_action/component_flag/side/direction/rotation_variant |
| Pigbeater | 2 | 17 | sem: set/core_family ; op: surface/sequence_op/side/direction/component_flag |

Montage exercises the most roles per layer (8 distinct operational roles). If Phase C popovers work on Montage at 375px, the implementation generalizes to every Wave-1 page.

---

## 11. Contract preservations

- ✓ UX/presentation only. No ontology, parser, modifier, ADD, or Wave-2 changes.
- ✓ Three-layer separation maintained: semantic ↔ operational ↔ editorial decomposition stay independent surfaces.
- ✓ Federation-not-adoption preserved: FM-source citations remain on operational blocks; popovers expose IFPA-side explanations only.
- ✓ Restraint-first visual design preserved: warm-vs-cool palette unchanged; only primary roles carry saturation.
- ✓ No JS-heavy interaction systems proposed. Phases A-C are zero-JS; Phase D (deferred) is the first to add JS and only if Phase C feedback requires it.
- ✓ A11y improvements (`aria-describedby`, keyboard, Escape) are standards-compliant additions; no degradation of existing screen-reader behavior.
- ✓ Backwards compatibility: if Popover API isn't supported, tokens fall back to `title=` (kept as a secondary attribute alongside the popover).

---

## 12. Companion artifact

**`UX1_GLOSSARY_TOKEN_MATRIX.csv`** (this directory) — unified token → layer → role → label → plain English → glossary anchor mapping for all ~80 vocabulary entries across both notation layers. Drives Phase A's title-text rewrite and Phase B's anchor-ID emission.
