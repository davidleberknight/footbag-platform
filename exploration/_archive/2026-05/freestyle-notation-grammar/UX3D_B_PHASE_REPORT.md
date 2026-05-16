# UX3d-b -- Modifier-Layering Nested Boxes

Date: 2026-05-11. Status: implemented + validated.

Sister docs: `UX3_FLAGSHIP_SYNTHESIS.md` (north-star design); `UX3D_A_PHASE_REPORT.md` (token-coloured hero decomposition strip).

Goal: restore the original prototype's strongest flagship visualization -- nested modifier layering for high-complexity compounds.

Out of scope per user direction: mini relationship graphs (UX3e), modifier-ecosystem panels (UX3e), broad page redesign.

---

## 1. Activation rule

The panel activates only when `modifier_links.length >= 3`. In the current dictionary (160 active tricks), exactly **one** trick clears that threshold: **Montage** (`modifier_links` = spinning + ducking + paradox + symposium, count = 4). All other pages omit the panel cleanly.

This matches the UX3 north-star `UX3_FLAGSHIP_SYNTHESIS.md` §9.4 reasoning: 2-modifier compounds (Phoenix, Mind Bender, Spender) would render trivial 3-layer stacks that add little signal; 4+-modifier compounds carry enough density to make the nesting pedagogically valuable.

Defensive fallbacks to `null` (panel omitted):
- modifier_links.length < 3
- `dictEntry.isModifier` is true
- `dictEntry.baseTrick` null or whitespace
- `dictEntry.adds` non-numeric (no derivable total)
- No `dictEntry` at all

---

## 2. Validation matrix

| Trick | modifier_links | Panel | Layer chain |
|-------|---------------:|:-----:|-------------|
| toe-stall | 0 | omitted | -- |
| mirage | 0 | omitted | -- |
| butterfly | 0 | omitted | -- |
| matador | 1 | omitted | -- |
| spinning-symposium-whirl | 2 | omitted | (below threshold) |
| atomic-torque | 1 | omitted | -- |
| phoenix | 2 | omitted | (below threshold) |
| mind-bender | 2 | omitted | (below threshold) |
| spender | 2 | omitted | (below threshold) |
| **montage** | **4** | **activated** | `rotation:spinning -> modifier:ducking -> modifier:paradox -> modifier:symposium -> core:whirl (Total 7 ADD)` |

5 of 5 reference pages without ≥3 modifiers correctly omit the panel. Montage correctly renders the 5-layer nested stack.

---

## 3. Design

### 3.1 Nested-box visualisation

The prototype's flagship surface (`prototype-spinning-symposium-whirl.html`) used concentric boxes with outermost = first applied modifier, innermost = base trick. UX3d-b preserves that mental model:

```
┌─ rotation: spinning (+1) ─────────────────────────────┐
│  ┌─ modifier: ducking (+1) ──────────────────────┐    │
│  │  ┌─ modifier: paradox (+1) ───────────────┐   │    │
│  │  │  ┌─ modifier: symposium (+1) ──────┐   │   │    │
│  │  │  │  ┌─ core: whirl (3) ─────────┐  │   │   │    │
│  │  │  │  └─────────────────────────────┘  │   │   │    │
│  │  │  └─────────────────────────────────────┘   │    │
│  │  └─────────────────────────────────────────────┘    │
│  └─────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────
              Total ≡ 7 ADD
```

Each box is a `.modifier-layer` div with:
- a coloured border + tinted background matching the modifier's role
- a head row with: role label (small caps), modifier name (bold), weight in parens (mono)
- the next deeper layer nested inside as a child div (HTML containment = visual nesting)

The innermost layer (`kind='base'`) shows `core: whirl (3)` -- the role label "core" is used instead of "core-family" for legibility in the small caps slot.

### 3.2 Server-shaped + recursive partial

Service builds a nested `ModifierLayering.rootLayer` structure:
```ts
{ kind: 'modifier', name: 'spinning', weight: '(+1)', cssRole: 'rotation',
  inner: {
    kind: 'modifier', name: 'ducking', weight: '(+1)', cssRole: 'modifier',
    inner: {
      kind: 'modifier', name: 'paradox', weight: '(+1)', cssRole: 'modifier',
      inner: {
        kind: 'modifier', name: 'symposium', weight: '(+1)', cssRole: 'modifier',
        inner: {
          kind: 'base', name: 'whirl', weight: '(3)', cssRole: 'core-family',
          inner: null
        }
      }
    }
  }
}
```

A new recursive partial `src/views/partials/trick-modifier-layer.hbs` renders one layer + recursively renders its `inner`:
```hbs
<div class="modifier-layer modifier-layer-{{layer.cssRole}}" data-kind="{{layer.kind}}">
  <div class="modifier-layer-head"> ... </div>
  {{#if layer.inner}}
  {{> trick-modifier-layer layer=layer.inner}}
  {{/if}}
</div>
```

`express-handlebars` (v7) supports partial self-reference; verified working end-to-end on the 5-layer Montage panel.

A second partial `trick-modifier-layering.hbs` wraps with the section h2 + total summary line.

### 3.3 Placement

The shell renders `{{> trick-modifier-layering}}` after the operational notation block and before the editorial prose sections. Rationale: notation surfaces (semantic + operational) are scan-layer; the nested layering is a structural-decomposition visualisation that supports them; editorial prose then takes over for instruction. The flow reads top-to-bottom as: identify the trick (hero) → see its tokens (notation) → see its mechanics (operational) → see how the modifiers stack (UX3d-b) → read what it is (prose).

For the 159 non-Montage pages, the section is `null` and yields no output (no empty heading, no skeleton placeholder).

### 3.4 Mobile responsiveness

At <600px:
- padding tightens (`12px 14px` → `8px 10px`)
- role-label font shrinks (`0.74rem` → `0.68rem`)
- name font shrinks (`1.05rem` → `0.98rem`)
- weight font shrinks (`0.9rem` → `0.85rem`)
- box gap tightens (`8px` → `6px`)
- border-radius softens (`8px` → `6px`)

At 375px, the 5-layer Montage panel renders with each box at ~340px wide. No horizontal overflow. Each layer's head row wraps if needed (role + name + weight may wrap to 2 lines on the smallest devices).

### 3.5 Role coloration (cool palette)

Reuses cssRole classification from UX3c-c / UX3d-a:

| Layer kind | cssRole | Border | Background | Text |
|-----------|---------|--------|-----------|------|
| modifier (`set` slot) | `set` | `#93c5fd` (blue) | `rgba(219, 234, 254, 0.42)` | `#1e3a8a` |
| modifier (rotation: spinning/whirling/swirling) | `rotation` | `#fdba74` (amber) | `rgba(255, 237, 213, 0.55)` | `#9a3412` |
| modifier (other body) | `modifier` | `#fcd34d` (yellow) | `rgba(254, 243, 199, 0.52)` | `#78350f` |
| base | `core-family` | `#4ade80` (green) | `rgba(209, 250, 229, 0.65)` | `#14532d` |

The base trick's name is extra-bold (font-weight 800) to mark the structural anchor.

---

## 4. Files changed

| File | Type | Notes |
|------|------|-------|
| `src/services/freestyleService.ts` | modified | +`ModifierLayer` + `ModifierLayering` interfaces; +`buildModifierLayering()` helper; +`content.modifierLayering` view-model field |
| `src/views/partials/trick-modifier-layer.hbs` | new | Recursive layer partial (16 lines) |
| `src/views/partials/trick-modifier-layering.hbs` | new | Section partial (13 lines) |
| `src/views/freestyle/trick-shell.hbs` | modified | +1 line: `{{> trick-modifier-layering}}` after the operational notation block |
| `src/public/css/style.css` | modified | +92 lines of `.modifier-layer*` rules |
| `legacy_data/reports/html_qc/ux3d-b/*.html` | new | 6 snapshots for QC diff |
| `exploration/freestyle-notation-grammar/UX3D_B_PHASE_REPORT.md` | new | this report |

Net delta: ~140 lines added; 0 lines removed.

No schema changes. No ontology mutation. No modifier weight changes. No parser changes. No mini graph. No relationship rendering. No broad page redesign.

---

## 5. Validation

| Check | Result |
|-------|--------|
| TypeScript build | clean |
| Freestyle integration tests | **244 / 244 passed** |
| Activation matrix correct (Montage activated; 9 other sample tricks omitted) | ✓ |
| Forbidden-term audit (6 reference pages) | 0 hits per page |
| HTML snapshots | `legacy_data/reports/html_qc/ux3d-b/*.html` (6 files) |
| Mobile <600px | padding/font/gap responsive; no horizontal overflow |
| Recursive partial | verified end-to-end on Montage's 5-layer stack |

---

## 6. Preservation guarantees

| Contract | Preserved because |
|----------|-------------------|
| Federation-not-adoption | Panel data sourced from IFPA-side `freestyle_trick_modifier_links` + `base_trick`. No FM data consulted |
| Parser/editorial separation | Panel reads editorial-decomposition data; parser's `structural_parse_json` remains separate (the collapsed diagnostic) |
| Restraint-first design | Single trick activates the panel today; all 159 other pages omit cleanly with no empty header / no skeleton placeholder |
| Warm/cool palette | Panel uses cool palette role colours (set/rotation/modifier/core-family) matching the semantic notation block. No cross-palette bleeding |
| Sparse-friendly rendering | Toe Stall renders 4 sections; the layering panel does not appear at all |
| Empty-state honesty | Fallback conditions (missing data, modifier-only row) yield null and the section omits -- no fabricated layers |
| Asserted ADD is editorial truth | `totalLabel` derives from `dictEntry.adds` (editorial); modifier weights from the modifier table (curator-managed) |
| Public-facing prose hygiene | 0 forbidden-term hits across 6 reference pages post-UX3d-b |
| No client JS dependency | Pure HTML + CSS. Recursive partial executes at server-render time |
| Mobile responsiveness | Panel adapts at <600px; no horizontal scroll on Montage's 5-layer stack at 375px |
| Hero formula unchanged | UX3c-c hero quick-stat strip still renders below hero-stats; unchanged content + position |
| Family lineage unchanged | UX3c-b ADD-tiered family ladder still renders below related-tricks; unchanged content + position |
| Modifier ordering rules unchanged | Layer order = `modifier_links` query order (preserves the canonical IFPA reading order; first entry is outermost wrapper) |
| ADD math unchanged | Total ≡ `dictEntry.adds`; individual modifier weights from `freestyle_trick_modifiers` (editorial truth) |

---

## 7. What did NOT change

Per user scope direction:
- No activation for 2-modifier tricks (threshold remains `>= 3`)
- No mini relationship graph (UX3e)
- No hero-formula alteration (UX3c-c intact)
- No family-lineage alteration (UX3c-b intact)
- No modifier-ordering rule change
- No ADD-math change
- No ontology mutation

---

## 8. Sample rendered output (Montage)

```
Modifier layering
Outermost first; core last. Each modifier wraps the next and contributes its weight to the total.

  ROTATION   spinning  (+1)
    MODIFIER   ducking  (+1)
      MODIFIER   paradox  (+1)
        MODIFIER   symposium  (+1)
          CORE   whirl  (3)

Total ≡ 7 ADD
```

(Indentation represents the nested-box containment; in the rendered page each level is a coloured bordered box with the deeper level nested inside.)

---

## 9. Recommendation on next steps

UX3d-b completes the flagship visualisation work scoped here. Per the user's deferral list, the explicit "do NOT" items remain out of scope:
- mini relationship graphs
- modifier ecosystem panels
- broader page redesign

If you proceed to UX3e (relationship rendering / modifier-ecosystem panels), the natural next surface is the "other tricks using this modifier" cross-family lens. Activation rule per `UX3_FLAGSHIP_SYNTHESIS.md` §8.7: requires modifier_links >= 2 AND each modifier appears in >= 3 other tricks. Current dictionary candidates: Phoenix (pixie + ducking), Mind Bender (ducking + paradox), Spender (spinning + paradox), Montage (4 modifiers).

For now, UX3d-b ships in isolation. Single-page activation; bounded scope; reviewable end-to-end on Montage.

---

## 10. Decision points awaiting human input

1. **Approve commit?** UX3d-b is a self-contained presentation phase. Recommend single commit.
2. **Confirm activation threshold `>= 3`?** Currently activates only Montage. If you wanted Phoenix / Mind Bender / Spender to also get the visualisation, the threshold drops to `>= 2`. Counter-argument from `UX3_FLAGSHIP_SYNTHESIS.md` §9.4: 2-modifier stacks read thin and add little signal vs the 3-layer (2 modifiers + base) form.
3. **Confirm placement.** Currently between operational notation and execution prose. Alternative: at the top of the Reference/Diagnostic tail, paired with the collapsed structural decomposition. Counter-argument: surfacing in the scan/study zone matches its flagship intent.
4. **Confirm "core" label** for the base layer's role-label slot. Alternative: "core family" (full role name) -- but that's longer. Current choice is "core" (4 letters) for visual harmony with other role labels.
5. **Begin UX3e?** Modifier-ecosystem / parallel-tricks / mini relationship graph all deferred per current direction.
