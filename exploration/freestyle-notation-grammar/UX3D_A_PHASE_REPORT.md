# UX3d-a -- Token-Coloured Hero Decomposition

Date: 2026-05-11. Status: implemented + validated.

Sister docs: `UX3_FLAGSHIP_SYNTHESIS.md` (north-star design); `UX3C_PHASE_REPORT.md` (immediate predecessor: shell unification + family tiers + hero formula).

Goal: restore the original prototype's immediate semantic identity in the universal UX3 shell without visual clutter.

Out of scope per user direction: modifier-layering nested boxes (UX3d-b), mini relationship graph (UX3e), modifier-ecosystem panels (UX3e).

---

## 1. Design decision: augment, not replace

The user constraint "preserve readable title text for accessibility" excluded the prototype's replace-the-h1 approach. The h1 stays as `page.title` (e.g., `phoenix`, `Matador`, `mind bender`). A new role-coloured decomposition strip renders **between the h1 and the family badge**, augmenting the title with explicit structural identity.

Worked examples:

```
phoenix
[pixie] [ducking] [butterfly]            ← UX3d-a decomposition strip
butterfly family   5 ADD   compound
pixie(+1) + ducking(+1) + butterfly(3) = 5 ADD    ← UX3c-c hero formula
short description prose...
```

```
toe stall                                 (no decomposition strip)
atw family   1 ADD
toe stall = 1 ADD
```

---

## 2. Activation rule

The decomposition strip activates when `modifier_links.length >= 2`. Service computes this from the `freestyle_trick_modifier_links` query already loaded in UX3c-c. Atoms, 1-modifier compounds, and modifier-only rows render with a plain h1 only.

Defensive fallbacks (yield null, plain h1):
- modifier_links.length < 2
- `dictEntry.isModifier` is true
- `dictEntry.baseTrick` is null or whitespace
- No `dictEntry` at all (no dictionary entry)

### 2.1 Validation matrix

| Trick | modifier_links | Activated | Token sequence |
|-------|---------------:|:---------:|----------------|
| toe-stall | 0 | no | plain h1 |
| mirage | 0 | no | plain h1 |
| butterfly | 0 | no | plain h1 |
| matador | 1 (nuclear) | no | plain h1 |
| tripwalk | 1 (quantum) | no | plain h1 |
| spinal-tap | 1 (tapping) | no | plain h1 |
| spinning-whirl | 1 (spinning) | no | plain h1 |
| blurry-whirl | 1 (blurry) | no | plain h1 |
| spender | 2 (spinning, paradox) | yes | `[rotation:spinning] [modifier:paradox] [core-family:blender]` |
| phoenix | 2 (pixie, ducking) | yes | `[set:pixie] [modifier:ducking] [core-family:butterfly]` |
| mind-bender | 2 (ducking, paradox) | yes | `[modifier:ducking] [modifier:paradox] [core-family:blender]` |
| montage | 4 (spinning, ducking, paradox, symposium) | yes | `[rotation:spinning] [modifier:ducking] [modifier:paradox] [modifier:symposium] [core-family:whirl]` |

---

## 3. Role coloration

Reuses the cssRole mapping from UX3c-c (`modifierCssRole(slug, type)` helper):

| Modifier | cssRole | Hero strip background |
|----------|---------|-----------------------|
| `nuclear`, `atomic`, `pixie`, `quantum`, `fairy`, `blurry`, `furious`, `shooting`, `pogo`, `rooted` (set-type) | `set` | semi-opaque white tint, blue underline |
| `spinning`, `whirling`, `swirling` (body-rotation) | `rotation` | warm-tinted, amber underline |
| `paradox`, `ducking`, `symposium`, `tapping`, `stepping`, `miraging`, `barraging`, `weaving`, `gyro`, etc. (other body) | `modifier` | yellow-tinted, yellow underline |
| base trick (last token) | `core-family` | green-tinted, green underline, bold |

The thin underline per role provides accessibility independence from colour for visitors who can't perceive colour differences. Pill backgrounds use semi-opaque white so the cool-palette role colour shows clearly against the dark hero gradient.

---

## 4. Implementation summary

### 4.1 Service layer (`src/services/freestyleService.ts`)

Added:
- `interface HeroDecompositionToken { text; cssRole; kind }`
- `function buildHeroDecomposition(modifierLinks, baseTrick, isModifier): HeroDecompositionToken[] | null`
- `content.heroDecomposition` field on `FreestyleTrickContent`
- Wired into the view-model alongside the existing `heroFormula`

Total service-layer delta: ~30 lines added.

### 4.2 Template (`src/views/partials/trick-hero.hbs`)

Added one conditional block between h1 and family-badge:

```hbs
{{#if content.heroDecomposition}}
<p class="trick-hero-decomposition" aria-label="Structural decomposition: ...">
  {{#each content.heroDecomposition}}<span class="hero-decomp-token hero-decomp-{{cssRole}}" data-kind="{{kind}}">{{text}}</span>{{#unless @last}} {{/unless}}{{/each}}
</p>
{{/if}}
```

The `aria-label` spells out the token sequence in plain text for screen readers.

### 4.3 CSS (`src/public/css/style.css`)

Appended ~55 lines of `.trick-hero-decomposition` + `.hero-decomp-token` + per-role variants. Tokens use:
- `font-family` mono stack (visual continuity with hero-formula strip)
- `font-size` 1.05rem (slightly smaller than h1, larger than the formula line)
- `flex-wrap: wrap; gap: 6px 8px` — mobile-friendly wrapping
- `border-radius: 5px; padding: 2px 9px` — pill style
- 2px solid bottom underline per role for non-colour accessibility
- Responsive: at <600px, font-size drops to 0.95rem and gap tightens

---

## 5. Validation results

| Check | Result |
|-------|--------|
| TypeScript build | clean |
| Freestyle integration tests | **244 / 244 passed** |
| Activation rule across 12 sample tricks | correct (5 activated; 7 plain) |
| Forbidden-term audit (6 reference pages) | 0 hits |
| HTML snapshots captured | `legacy_data/reports/html_qc/ux3d-a/*.html` (6 files) |
| Mobile wrap (visual inspection via media query) | tokens wrap cleanly; padding tightens |

---

## 6. Mobile responsiveness

The decomposition strip uses flexbox with `flex-wrap: wrap`. At 375px:
- `pixie` `ducking` `butterfly` (Phoenix, 3 tokens) — single line, comfortable
- `ducking` `paradox` `blender` (Mind Bender, 3 tokens) — single line
- `spinning` `ducking` `paradox` `symposium` `whirl` (Montage, 5 tokens) — wraps to 2 lines
- `pixie` (Phoenix shortest) reads naturally

Token padding shrinks slightly at <600px. Gap tightens. No horizontal scroll.

---

## 7. Accessibility

- `aria-label` on the decomposition strip spells out the token sequence
- Each token has a thin coloured underline matching its role, independent of background fill — colourblind visitors can distinguish set / rotation / modifier / core-family by underline hue + token position (base is always last)
- Bold weight on the core-family token marks the structural anchor
- All token text is lowercase, matching canonical_name convention
- No client JS dependency

---

## 8. Files changed

| File | Type | Notes |
|------|------|-------|
| `src/services/freestyleService.ts` | modified | +interface, +builder, +wire-up (~30 lines) |
| `src/views/partials/trick-hero.hbs` | modified | +conditional block (8 lines) between h1 and family-badge |
| `src/public/css/style.css` | modified | +55 lines of decomposition CSS |
| `legacy_data/reports/html_qc/ux3d-a/*.html` | new | 6 snapshots for QC diff |
| `exploration/freestyle-notation-grammar/UX3D_A_PHASE_REPORT.md` | new | this report |

No schema changes. No ontology mutation. No modifier weight changes. No parser changes. No new partials. No new templates.

---

## 9. Preservation guarantees

| Contract | Preserved because |
|----------|-------------------|
| Federation-not-adoption | Decomposition tokens render from IFPA-side `modifier_links` + `base_trick`, never from FM data |
| Parser/editorial separation | Token list comes from editorial `modifier_links` table; the parser's `structural_parse_json` is untouched and continues to surface in the collapsed diagnostic |
| Restraint-first design | Strip renders only when the editorial decomposition has at least 2 modifiers; atoms and 1-modifier compounds stay clean |
| Warm/cool notation distinction | Uses cool-palette role colours (set/rotation/modifier/core-family) -- matches the semantic notation block. Hero formula keeps its warm-adjacent tinting. No cross-palette bleeding |
| Sparse-friendly rendering | Toe Stall, Mirage, butterfly, Matador all render plain h1; the decomposition strip is invisible to readers of sparse pages |
| Empty-state honesty | When fallback conditions trigger (no base_trick, modifier-only row), the strip yields null and the h1 renders as before -- no empty pills, no missing-data placeholders |
| Asserted ADD is editorial truth | Token weights are not surfaced here (UX3c-c hero formula remains the canonical surface for weights + total) -- the decomposition is purely structural |
| Public-facing prose hygiene | Zero forbidden terms across 6 reference pages post-UX3d-a |
| No client JS dependency | Pure HTML + CSS; no `<script>` tags introduced |
| Mobile responsiveness | Flex-wrap layout + responsive font-size at <600px |

---

## 10. What did NOT change

Per user scope direction:
- No modifier-layering nested-boxes panel (deferred to UX3d-b or later)
- No mini relationship graph (deferred to UX3e)
- No ADD formula logic change (UX3c-c hero formula intact)
- No family tier change (UX3c-b lineage intact)
- No new schema columns
- No ontology growth
- No parser modification

---

## 11. Recommendation on UX3d-b

UX3d-b (modifier-layering nested boxes) is the natural next step per `UX3_FLAGSHIP_SYNTHESIS.md` §3.3 / §9.4. Trigger rule from the north-star: `modifier_links.length >= 3` (excludes 2-modifier compounds like Phoenix and Mind Bender; reserves the visualisation for genuinely dense compounds like Montage).

UX3d-b proposed activation:

| Trick | modifier_links | UX3d-a strip | UX3d-b nested boxes |
|-------|---------------:|:------------:|:-------------------:|
| Matador | 1 | no | no |
| Phoenix | 2 | yes | no (threshold) |
| Mind Bender | 2 | yes | no (threshold) |
| Spender | 2 | yes | no (threshold) |
| **Montage** | **4** | **yes** | **yes** |

In the current Wave-1/Wave-2 cohort, only Montage clears the 3-modifier threshold. UX3d-b lands a single visual surface for one page — which is the right ROI: prove the nested-box visualisation works at the densest natural case before extending to future high-density compounds.

UX3d-b can render below the existing `Set notation (operational)` block, before the prose sections. Or it can be the diagnostic-tail panel's lighter sibling. Per `UX3_FLAGSHIP_SYNTHESIS.md` §9.4, it's a "flagship-only visualisation; sparse rows can omit."

Open question for the next phase: where does the nested-box panel sit -- above or below the editorial prose blocks?

---

## 12. Decision points awaiting human input

1. **Approve commit?** UX3d-a is a small, self-contained presentation change. Single commit recommended.
2. **Begin UX3d-b (modifier-layering nested boxes)?** Affects Montage only in the current dictionary; provides the prototype's most distinctive flagship visualisation.
3. **Confirm activation threshold** (`modifier_links >= 2`)? Alternative: `>= 1` would activate Matador / Tripwalk / etc. but those would render only 1 modifier + 1 base (2 tokens) which doesn't really decompose visibly. The `>= 2` threshold ensures the strip carries enough density to justify the visual surface.
4. **Confirm "augment, not replace" title approach.** This phase did not replace the h1; the strip sits below it. If you'd prefer the prototype's replace-the-title approach for genuinely multi-token canonical names (e.g., legacy `paradox-whirl` where h1 = "paradox whirl"), say so and a follow-up can promote those cases.
