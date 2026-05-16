# Dictionary Browse Surface — UX + Ontology Audit

**Status:** audit + planning. No implementation; no destructive edits. Refines `SYMBOLIC_CARD_SPEC.md` and proposes a Batch-style execution plan.

**Scope:** `GET /freestyle/tricks` and its five views (by ADD, by family, by category, by component, by topology). Cards rendered by `src/views/partials/dictionary-trick-card.hbs` via `freestyleService.getTricksIndexPage`.

**Reading order:** §1 (diagnosis) → §A (visual hierarchy) → §B (rendering) → §C (ontology) → §D (surfaces) → §E (QC) → §F (sequencing) → §G (cautions). §H is mockups.

---

## §1. Diagnosis — current state

### §1.1 What the card renders today

Per `dictionary-trick-card.hbs` (Batch DSC-2 slice 1 baseline; CANONICAL-SURFACE-REALIGNMENT-1 refinements):

```
HEADER:   title (1.20rem mono bold)  ......................  ADD chip
≡ line(s):  Spinning Paradox Whirl   (plain text, 0.92rem)
notation:   [clip] > op in dex > butterfly wing > ss clipper
            (mono 0.82rem, role-colored op-tokens, color: text-subtle)
media chip / status badge / placeholder note (optional)
```

Notation is below the title in a `<code>` block — stacked, smaller, dimmer. The title is the visual center of gravity.

### §1.2 What the user is reporting

> The symbolic notation is visually compressed and cognitively secondary. In component/family browse modes, users cannot easily perceive recurring structural patterns (e.g. all whirl tricks sharing the whirl component).

Cross-referenced against the actual page:

1. **Operational notation IS color-coded** (9 role classes: surface, body-action, rotation-variant, side, direction, component-flag-{dex|bod|pdx}, pre-state, sequence-op-{minor|major}). This works on the per-token level.
2. **Semantic ≡ readings are plain text.** "Spinning Paradox Whirl" renders without any visual signal that `whirl` is the family anchor or that `spinning` and `paradox` are stackable modifiers. This is the primary gap.
3. **Title dominates.** At 1.20rem mono-bold versus notation at 0.82rem dim-color, the visual hierarchy is title >> notation. Compositional structure reads as "the trick's name is the truth; the notation is footnote-grade."
4. **Family/component views don't visually surface their grouping basis.** All whirl-family cards do share `whirl` in their ≡ readings or operational notation, but the shared token is not visually distinguished. A reader scanning the whirl family sees 12 differently-named tricks before noticing they all contain `whirl`.
5. **"Notation pending" placeholder** appears on rows with neither operational notation nor ≡ readings. Reads as failure state; visually creates noise.

### §1.3 What's working

- The `≡` symbol is a clear semantic signal where present.
- Operational notation's role-color system works well on detail pages where the notation has horizontal room.
- The four browse views (ADD / family / category / component / topology — actually five) reuse the same card via `dictionary-trick-card.hbs`; the "one card renderer" doctrine from `SYMBOLIC_CARD_SPEC.md` §1.0 is intact.
- Equivalence allow-list (`freestyleAliasGovernance.ts`, `freestyleSymbolicEquivalences.ts`) keeps the ≡ readings curator-governed and high-signal.

### §1.4 The core asymmetry to fix

Operational notation is the rendered-token surface (visually rich, role-colored, horizontal). Semantic notation (the ≡ readings) is plain prose-style text. Both convey structural meaning; only one is visually structured. **This audit's central recommendation:** lift the ≡ readings to the same role-tokenized treatment, and re-balance the visual hierarchy so semantic structure reads first, name reads second.

---

## §A. Visual hierarchy

### §A.1 Two density modes

`SYMBOLIC_CARD_SPEC.md` §1.2 mentions a `density` prop with `browse` and `detail` values. This audit recommends a third mode for browse surfaces:

| Density | Use | Layout |
|---|---|---|
| **registry** | Dense scanning across families, components, or large ADD-grouped lists | Single-line horizontal: title · notation tokens · ADD |
| **browse** (current default) | General-purpose browsing | Header line + ≡ readings + notation |
| **detail** | Trick-detail page hero | Full slot expansion; expanded form; folk names |

The three modes are the same card renderer with three populations / layouts. Per `SYMBOLIC_CARD_SPEC.md` §1.0: this is permissible *density* variation, not view-mode branching. Recommendation: registry density becomes the default for By ADD and By Category (dense scanning use cases); browse density stays default for By Family, By Component, By Topology (pattern-comparison use cases).

### §A.2 Inline-notation layout (registry mode)

Proposed registry-mode shape:

```
#mobius   spinning ss miraging osis                       ◆ 5
#torque   miraging osis                                   ◆ 4
#blender  whirling osis                                   ◆ 4
#osis     osis                                            ◆ 3
```

Per row:
- **Slug** (left, mono, base-family color): `#mobius`
- **Tokenized semantic notation** (center, role-colored tokens): `spinning ss miraging osis`
- **ADD chip** (right, mono, restrained border): `◆ 5`

When notation is too long for the available width, it wraps to a second line with hanging indent under the notation column. Title slug stays single-line.

### §A.3 Browse-mode layout (refined)

For browse density (current default for family / component / topology views), keep the existing vertical stack but re-balance the hierarchy:

1. **Semantic ≡ reading promoted to the same line as the title.** Title becomes a hashtag-style identifier; the ≡ reading becomes the structural sentence.
2. **Operational notation demoted slightly more.** Becomes a secondary structural reading visible on hover-disclosed expansion or in the lower-right of the card. (Hover disclosure is interaction — defer; instead simply suppress operational notation in registry/browse modes when ≡ reading is present, surface only on detail page.)

Proposed browse-mode shape:

```
#mobius     ◆ 5
spinning  ss  miraging  osis        (≡ tokenized, base-anchor underlined)

[operational notation suppressed when ≡ reading is present]
```

The current operational notation row is informationally redundant with the ≡ reading for tricks that have both. Suppress on browse cards; keep on detail page where horizontal room allows it to teach the [DEX] / [DEL] / [BOD] vocabulary.

### §A.4 Family-stem emphasis

When the user lands on `/freestyle/tricks?view=family` or `?family=whirl`, the **family anchor** in every card's ≡ reading and notation should be visually dominant.

Tactic: extend the `op-token` system with a `--family-anchor` modifier class. When a token text matches the active-view's family anchor slug (e.g., `whirl` in the whirl family), apply:
- 1.5px thick underline in the base-anchor color (not the modifier color)
- Slightly heavier font weight (500 → 600)
- No color change (color is already base-family green per the token's role)

Result: scanning the whirl family, every card has `whirl` visually underlined; the modifier-stacking left of it becomes obvious. The same applies to component view (`paradox` underlined in paradox-component group) and topology view.

### §A.5 Suppressing "Notation pending"

Current: `<p class="dict-card-notation--pending"><em>Notation pending</em></p>` renders when both `operationalNotation` and `symbolicEquivalences.length === 0`.

Recommendation: when `symbolicEquivalences.length > 0`, the ≡ reading IS the notation; suppress the pending placeholder. The template already does this conditionally. Extend the suppression: **never render "Notation pending" on registry density**. Cards without any notation become identifier-only (slug + ADD) — visually cleaner than a placeholder.

For browse density, the "pending" placeholder can stay but should be visually quieter: smaller font, no italic, lower contrast. Treats absence as "this trick exists; structural reading is curator-pending" without screaming.

### §A.6 Typography scaling

Current title: 1.20rem mono bold. Notation: 0.82rem mono. The 38% size delta is what tells the eye "title first; notation footnote." To re-balance:

| Element | Current | Proposed (browse) | Proposed (registry) |
|---|---|---|---|
| Title (`#slug`) | 1.20rem bold | 1.05rem regular | 0.95rem regular |
| ≡ semantic reading | 0.92rem regular | 1.10rem regular | 1.00rem regular |
| Operational notation | 0.82rem mono | suppressed on browse | suppressed on registry |
| ADD chip | 0.78rem mono | 0.78rem mono | 0.80rem mono |

Result: semantic reading becomes the visually-dominant row; title becomes a hashtag-style identifier. The "structural sentence reads first" promise is delivered.

### §A.7 Mobile responsiveness

Below ~520px viewport:

- **Registry mode** collapses to two-line card: line 1 = slug + ADD, line 2 = notation (wraps if needed). Maintains scan density.
- **Browse mode** unchanged in structure; font sizes step down by ~10%.
- Family-stem underline preserved at all viewport sizes (it's CSS, not layout).
- Hashtag `#` glyph drops to muted color on mobile to save horizontal space.

---

## §B. Symbolic rendering

### §B.1 Tokenization of semantic notation

The semantic ≡ readings are currently plain strings. Service work needed to tokenize them analogously to operational notation:

```typescript
interface SemanticNotationToken {
  text:     string;       // 'spinning' | 'ss' | 'miraging' | 'osis'
  role:     SemanticRole; // 'set-operator' | 'body-operator' | etc.
  cssRole:  string;       // CSS suffix
  isFamilyAnchor: boolean; // true when token matches active-view family slug
  weight?:  string;       // '+1' | '+2' | '+0' for tooltip
}
```

A `shapeSemanticNotation(reading: string, ctx: SemanticLookupContext): SemanticNotationToken[]` service helper, analogous to existing `shapeNotationDisplay()`, produces the array. The service joins the operator-reference module + operator-board + foundational-atom registry to resolve each lowercase token's role.

### §B.2 Role taxonomy for semantic tokens

Per `SEMANTIC_COMPRESSION_DOCTRINE.md` §5 four-color budget, the semantic-rendering role palette must stay within 4 simultaneous role colors. Mapping:

| Role | Color | Token examples | Coverage |
|---|---|---|---|
| **Base anchor (core family)** | `#7f9a6b` (core-green) | whirl, butterfly, mirage, osis, clipper-stall, legover, pickup, illusion, swirl, around-the-world, orbit | 12 foundational atoms |
| **Modifier (set + body)** | `#b5a85a` (olive) | spinning, paradox, ducking, symposium, stepping, pixie, atomic, quantum, blurry, nuclear, barraging, furious, fairy, miraging, whirling, gyro, atomic, etc. | Lumped — see §C taxonomy |
| **Rotational variant** | `#c08a55` (orange) | rev-whirl, rev-swirl, gyro (direction-bound) | Small set |
| **Side / positional** | `#8a8470` (neutral) | ss, op, far, reverse, near | Zero-weight; visually subordinate |

This palette matches the existing notation-token system already used for operational notation. **The user asked for distinct colors for "set operators / body operators / paradox flags / delay surfaces."** The four-color budget cannot honor every requested distinction with a separate color. Compromise:

- Set operators + body operators + structural operators share the **modifier-olive** band. Distinct rendering happens through font weight or sub-decoration (see §B.3).
- Paradox/structural flags: only the `[PDX]` component flag on the OPERATIONAL notation side (already amber/violet underline). No separate color in semantic notation; paradox-as-modifier sits in the olive band.
- Delay/surface operators: appear only in operational notation `[DEL] CLIP` and similar; semantic notation rarely surfaces them directly.

If a fifth color becomes necessary (e.g., to distinguish set operators from body operators on the same row), use **font-weight banding** within the olive color: set operators 500 weight, body operators 600 weight. This adds typographic distinction without expanding the palette.

### §B.3 Operator chips (registry mode)

In registry-density rows, semantic tokens render as **small inline chips** with a 1px border in the token's role color and the same role color text. Chips are tight (1px padding inside) so they don't bloat the row.

```
#mobius   [spinning] [ss] [miraging] [osis]                ◆ 5
```

Where:
- `[spinning]`, `[miraging]` = modifier-olive border + text
- `[ss]` = neutral-gray border + text, slightly smaller
- `[osis]` = core-green border + text, **persistent family underline if active view is osis family or torque/blender component**

Chip aesthetic must remain *flat* (no rounded corners → buttons; no shadows; no gradients). Per Batch 5 planning memo §3 chip rules: flat rectangles, role-color border, body-font typography. Restraint discipline carries forward.

### §B.4 Token disambiguation

The OPERATIONAL notation system already has multiple role classes for what semantically might be one modifier (e.g., `direction` and `side` are both neutral-gray but distinct CSS classes). For semantic notation, the disambiguation strategy is simpler:

- One semantic token → one role from {base-anchor, modifier, rotational-variant, side-positional}.
- Tooltip on hover (browser-native `title` attribute, no JS) carries the operator's full meaning + ADD weight. E.g., `<span title="spinning: body modifier; +1 ADD">spinning</span>`.

### §B.5 What this does NOT introduce

- No font-family change within tokens (all stays in body font; only operational notation uses mono).
- No background fills (only border + text color).
- No animation, no hover-to-expand. Tooltip is static `title` attribute.
- No new color palette outside the four-color budget.

---

## §C. Ontology consistency audit

The user listed nine entities that oscillate between roles. Per-entity audit:

### §C.1 Per-entity disposition

| Entity | Standalone trick? | Set modifier? | Body modifier? | Family anchor? | Structural/quantifier? | Doctrine status |
|---|---|---|---|---|---|---|
| **fairy** | yes (2-ADD base; pt-era) | yes (operator role confirmed 2026-05-15; ADD weight pending) | no | yes (small family) | no | **Q4.C-pending** — modifier weight unknown |
| **pixie** | no (no standalone trick) | yes (+1; Tier-1 board operator) | no | no | no | **SETTLED** |
| **atomic** | no | yes (+1/+2 rotational policy per pt10) | no | no (atomic-X compounds form a *neighborhood*, not a family) | "hidden X-dex character" per 2026-05-15 ruling | **Q3-pending** scope; weight settled |
| **quantum** | yes (Quantum Mirage = Toe Blur is the only named compound; the modifier IS the trick when ambiguous) | yes (+1; "compressed atomic") | no | no | no | **SETTLED weight**; lineage note open |
| **furious** | no | yes (+2 rotational; non-rotational reading pending) | no | no | possibly count-bearing per Q2 parallel | **Q2-pending** count reading; rotational weight settled |
| **surging** | no | yes (compressed form of stepping + spinning) | no | no | structural compression | **SETTLED** as expanded decomposition |
| **barraging** | no | yes (single +1 modifier per IFPA table) OR count-bearing primitive (two-dex set primitive per Baroque ruling) | no | no | count-bearing per 2026-05-15 ruling | **Q2-pending** — operator class doctrine choice |
| **whirling** | no | no | no | no | yes (compositional: whirling osis = blender, etc.) | **SETTLED** as compositional modifier per pt11 |
| **tapping** | no | no | yes (+1 body modifier per pt3) | no | no | **SETTLED** |

### §C.2 Proposed operator taxonomy (formal)

The user asked for a 6-bucket taxonomy. Compared with `SEMANTIC_COMPRESSION_DOCTRINE.md`'s 5-class **decomposition** taxonomy:

| User's 6 buckets | Doctrine 5 classes | Alignment |
|---|---|---|
| set operators | Class 1 flat + Class 5 policy-dependent | Pixie (Class 1), atomic (Class 5) |
| body operators | Class 1 flat | paradox / spinning / ducking / symposium / stepping |
| structural operators | Class 2 expanded + Class 3 hidden | blurry (Class 2), atomic (Class 3) |
| dex operators | (not in decomp taxonomy — operational concept) | DEX / IN / OUT flags |
| transformational operators | Class 2 expanded (count-bearing sub-pattern) | barraging / double / triple / surging |
| delay/surface operators | (operational concept) | CLIP / TOE / [DEL] |

The user's 6-bucket taxonomy is an **operator-role** taxonomy (functional: what does the operator do?). The doctrine's 5-class taxonomy is a **decomposition-class** taxonomy (structural: how does it decompose?). These are **orthogonal**, not conflicting.

Recommendation: adopt the user's 6-bucket taxonomy as the **operator-role** axis used for semantic-notation token coloring + chip rendering. The doctrine's 5-class taxonomy remains the structural framework for adjudication. An operator carries both: e.g., `atomic` is operator-role = **set operator** AND decomposition-class = **Class 5 policy-dependent** + **Class 3 hidden cross-body**.

### §C.3 Reconciled operator-role classes

| Operator role | Members | Token color (4-color budget) |
|---|---|---|
| **Set operators** | pixie, fairy, atomic, quantum, blurry, nuclear, barraging, furious, stepping | modifier-olive |
| **Body operators** | paradox, spinning, ducking, symposium, tapping, inspinning, weaving, diving, zulu | modifier-olive (heavier weight) |
| **Structural operators** | miraging, whirling, illusioning, blurry-as-expansion | modifier-olive |
| **Dex operators** (operational-only) | DEX, IN, OUT, BACK, FRONT | (in operational; no semantic surface) |
| **Transformational operators** (count-bearing) | barraging, double, triple, surging | modifier-olive (font-weight 600 + italic for count-bearing) |
| **Delay/surface operators** (operational-only) | CLIP, TOE, INSIDE, OUTSIDE, SOLE, [DEL] | (in operational; no semantic surface) |

Plus:

| Non-operator role | Members | Token color |
|---|---|---|
| **Base anchors (foundational atoms)** | whirl, butterfly, mirage, osis, clipper-stall, legover, pickup, illusion, swirl, around-the-world, orbit, torque, blender (= whirling osis as named compound; functions as anchor in derived family) | core-green |
| **Side / positional markers** | ss, op, far, reverse, near | neutral-gray |

### §C.4 Doctrine-blocked operator-role assignments

Pending Wave 2 Red answers, these assignments are alpha:

- **atomic** as Class 3 hidden-X-dex carrier (Q3 scope)
- **barraging** as count-bearing vs flat (Q2)
- **furious** as count-bearing parallel (Q2 sub-question)
- **fairy** ADD weight + role class (Q4.C)
- **operator-vs-trick boundary** for any token (Q4 doctrine)

These can be **rendered with the proposed operator-role color** but should carry a small visual hedge (e.g., dashed border instead of solid) to signal doctrine-pending status. Once Wave 2 settles, hedges resolve.

### §C.5 What the audit does NOT do

- Does not propose ontology changes to the canonical dictionary (`freestyle_tricks` table; `freestyle_trick_modifiers` table; `freestyle_trick_modifier_links` table). Those are doctrine-locked.
- Does not introduce a new schema column for operator-role. The role classification lives in TypeScript content modules (`OPERATOR_REFERENCE_ENTRIES`, future `OPERATOR_ROLE_REGISTRY`).
- Does not formalize taxonomy in canonical docs (`docs/`). That's a future ADR (per the doc-governance audit, ADR candidate #002–#005 cover this terrain).

---

## §D. Browse-surface recommendations

Five live views; each has a distinct cognitive job:

### §D.1 Per-view cognitive purpose

| View | Cognitive job | Recommended density | Family-stem emphasis |
|---|---|---|---|
| **By ADD** | Dense scanning by difficulty tier | **registry** | none (no active family) |
| **By family** | Pattern comparison within a family | **browse** | **yes** — family anchor underlined in every card |
| **By category** | Tag-based scanning | **registry** | none |
| **By component** | Pattern comparison within a modifier cohort | **browse** | **yes** — modifier underlined as the shared structural element |
| **By topology** | Observational structural-neighborhood scan | **browse** | **yes** — topology anchor (where defined) underlined |

### §D.2 Surface-level layout differentiation

| View | Heading style | Card density | Card emphasis |
|---|---|---|---|
| By ADD | ADD-tier headings (`3 ADD`, `4 ADD`, ...) | registry (single-line) | minimal; ADD is the obvious axis |
| By family | Family-name headings (`whirl family`, `butterfly family`, ...) | browse | family-anchor token underlined |
| By category | Category-label headings | registry | category-relevant token highlighted (e.g., `clipper` for clipper-led tricks) |
| By component | Component-name sub-headings within axis sections | browse | shared modifier underlined |
| By topology | Topology-name headings with observational badge | browse | topology anchor underlined; observational badge present |

### §D.3 Coverage-summary placement

The coverage-summary block (canonical-count / external-only / sources-loaded) is currently uniform across views. Recommendation: collapse to a one-line summary on registry-density views; keep full block on browse-density views where the reader is doing pattern comparison and the source provenance carries pedagogical weight.

### §D.4 Inter-view linking

Currently each view re-renders the cards in its grouping; cross-links between views are minimal. Recommendation:

- Family view → "see by component" link in family heading (cross-view jump)
- Component view → "see by family" link in component sub-heading
- Topology view → "see by family" link with observational caveat

These are small surface additions; they don't change the card renderer. Treat as part of the surface-level layout differentiation in §D.2.

### §D.5 By-ADD view: high-leverage simplification

The current By ADD view is visually identical to other views except for grouping headings. Switching to registry density (per §A) gives this view a distinct identity: it becomes the **dense scan** surface. Users who want to find "what 5-ADD tricks exist" can scan all of them on a single screen.

This is the highest-leverage layout change: one density swap that gives the most-used default view its own identity.

---

## §E. QC audit

### §E.1 Strengths

| Dimension | State | Evidence |
|---|---|---|
| **Symbolic consistency** | Good | One renderer (`dictionary-trick-card.hbs`) across all views; `op-token` color system consistently applied |
| **Equivalence governance** | Strong | Curator-locked allow-list in `freestyleSymbolicEquivalences.ts`; high signal-to-noise ratio on ≡ readings |
| **Family coherence** | Moderate-good | `trick_family` column drives family view; canonical family classifications stable post-pt11 |
| **Notation maturity (operational)** | Strong | Token-role color system + tooltip labels; covers 9 role classes; well-tested |
| **Notation maturity (semantic)** | **Weak** | Plain-string ≡ readings; no role coloring; no token-level treatment |
| **Placeholder handling (operational)** | Moderate | "Notation pending" placeholder exists but is visually loud |
| **One-card invariant** | Strong | `SYMBOLIC_CARD_SPEC.md` §1.0 forever-rule is honored; no special-case templates |

### §E.2 Weaknesses

| Dimension | Issue | Severity |
|---|---|---|
| **Visual hierarchy** | Title dominates; notation reads as footnote; structural sentence is not the first thing the eye sees | High |
| **Pattern recognition across cards** | All whirl-family cards share `whirl` but the shared token is not visually distinguished; readers must mentally parse each row independently | High |
| **Semantic notation rendering** | Plain text only; no role coloring; misses the educational opportunity already present in operational notation | High |
| **"Notation pending" visual noise** | Italic placeholder reads as failure state on cards that have ≡ readings or are intentionally external-only | Medium |
| **By-ADD view density** | Identical layout to other views; misses the "dense scan" affordance the view's name implies | Medium |
| **Family-stem emphasis** | Family anchor in notation gets no visual signal even on family-grouped surfaces | High (the user's direct complaint) |
| **Operator-role visibility** | A reader cannot tell from the rendered token whether `barraging` is a set operator, a body operator, or a structural quantifier — they all render as plain lowercase text | Medium |
| **Mobile density** | Cards are reasonable but tight on small screens; registry mode would improve density without sacrificing legibility | Low-medium |

### §E.3 Redundancy

| Source | Redundant with | Treatment |
|---|---|---|
| Operational notation when ≡ reading present | ≡ reading (informationally) | Suppress on browse/registry; keep on detail page |
| "Notation pending" when ≡ reading present | Already suppressed per template | OK |
| Source-note prose at page bottom | Page-intro coverage block | Could compress; not urgent |

### §E.4 Visual noise

The card body is otherwise restrained. The one consistent noise source is the "Notation pending" italic line; remediation in §A.5.

### §E.5 Discoverability

Coverage block + view-toggle nav are clear. Per-view cognitive purpose (§D.1) is not currently signaled in any prose on the page — readers have to guess that "by ADD" means difficulty-grouped and "by topology" means observational. Recommendation: add a 1-line cognitive-purpose subtitle below each view-toggle activation. Small intervention, high clarity gain.

---

## §F. Sequencing recommendations

### §F.1 Safe now (doctrine-stable; recommended scope for first batch)

| Item | Effort | Risk |
|---|---|---|
| Tokenize semantic ≡ readings (service `shapeSemanticNotation`) | Medium (~1 day) | Low — uses existing operator-reference registry |
| CSS: add `dict-card-density-registry` variant; CSS for inline-token rows | Low (~0.5 day) | Low |
| Template: density branch in `dictionary-trick-card.hbs` | Low (~0.5 day) | Low — additive |
| Default By ADD + By Category to registry density | Trivial | Low |
| Default By Family + By Component + By Topology to browse density | Trivial | Low |
| Family-stem emphasis (CSS class + service flag on family-anchor token) | Low (~0.5 day) | Low |
| Re-balance typography per §A.6 | Trivial | Low (already-restrained palette) |
| Suppress "Notation pending" on registry density | Trivial | Low |
| Add per-view cognitive-purpose subtitle | Trivial | Low |

This bundle is the **Browse-Refactor Slice 1** scope: tokenized semantic notation + density modes + family-stem emphasis. Doctrine-stable; high-leverage.

### §F.2 Hold (Batch 6+)

| Item | Reason for hold |
|---|---|
| Operator-role color banding beyond the 4-color budget | Tension with `SEMANTIC_COMPRESSION_DOCTRINE.md` §5; defer unless reader feedback shows the 4-color budget is insufficient |
| Inter-view linking (family ↔ component ↔ topology cross-jumps) | Low-priority surface addition; defer until Slice 1 lands |
| Detail-page notation re-layout (mobius / fury showcase) | Out of scope for browse audit; covered by future detail-page work |
| Interactive hover-disclosure of operational notation in browse cards | Per Batch 5 doctrine, no interaction added in current phase |
| Operator-role-aware token chip variants (set-operator chip vs body-operator chip) | Doctrine-pending — operator-vs-trick boundary (Q4) affects role classification |

### §F.3 Doctrine-blocked (waiting on Wave 2 Red reply)

| Item | Blocked by |
|---|---|
| Atomic-family token visualization (X-dex annotation; hidden vs flat) | Q3 + Q6 |
| Barraging chip — count-bearing vs flat single-modifier rendering | Q2 |
| Furious count-reading rendering | Q2 sub-question |
| Fairy as operator (chip + role + weight) | Q4.C |
| Compression verb discipline in any prose around new tokens | Q5 |
| Hidden-structure annotations on Atom Smasher / Eggbeater / Legbeater / Silo cards | Q6 |

When Wave 2 reply arrives, these unblock and feed Slice 2.

### §F.4 Future research

| Item | Why future |
|---|---|
| Movement-feel cohort surfaces (flowing / technical-density / connector families) | Subjective; better fit in a separate routine-analysis surface |
| Routine-analysis browse mode (sequence neighborhoods) | Not glossary or dictionary territory |
| Symbolic family graph visualization | Risk of parser-IDE aesthetic |
| Inline notation editing for curators | Out of scope for public surface |

---

## §G. Risk + cautions

### §G.1 Top risks

1. **Color-budget creep.** User's request for distinct colors for set / body / structural / paradox / delay implies 5+ semantic colors. Honoring all would exceed the 4-color budget. Mitigation: §B.2's font-weight banding gives typographic distinction within the olive band; pair with chip-border for registry density. If after observation a fifth color is needed, propose explicitly with budget-impact analysis.

2. **Semantic-notation tokenization complexity.** Tokenizing free-form ≡ strings risks misclassification when a token is ambiguous (e.g., `whirling` is structural-modifier; `whirl` is base-anchor; `whirling whirl` would have both). Mitigation: explicit operator-role registry (TypeScript content module) with curator-confirmed entries; fall back to `unknown` role color (no color) when a token isn't in the registry — never guess.

3. **Density-mode visual confusion.** If registry mode and browse mode look too similar, readers won't recognize the switch when navigating between views. Mitigation: density-mode signal in the view-toggle nav active state (e.g., subtle "dense" / "browse" sub-label).

4. **Family-stem emphasis on observational views.** Topology view is observational — applying a family-anchor underline might imply canonical membership where only structural similarity exists. Mitigation: on topology view, the underline is dotted, not solid; visually distinguishes observational membership.

5. **Doctrine-pending operator visualization.** Rendering Fairy, atomic, barraging, furious with their (alpha) role colors before Wave 2 settles risks teaching wrong doctrine. Mitigation: dashed-border treatment on doctrine-pending tokens; visual hedge that resolves when Wave 2 returns.

6. **Mobile registry-mode wrap.** Long notations wrapping awkwardly on small screens. Mitigation: hanging indent + max-width on notation column; tested at 375px before ship.

### §G.2 Stop conditions

If during implementation any of these arise, STOP and revisit:

- A new role color is proposed beyond the 4-color budget without an §B.2-style alternative.
- A density variant requires a new card renderer (violates `SYMBOLIC_CARD_SPEC.md` §1.0).
- Family-stem emphasis requires per-trick configuration (should derive from `trick_family` + active-view slug only).
- Reader feedback says "all cards look the same now" — the visual hierarchy re-balance has gone too flat.
- Tokenized semantic notation requires changes to `freestyle_tricks` schema (should be purely service-layer transformation).

### §G.3 Success signals

- A user scanning By Family for whirl sees `whirl` underlined on every row within 5 seconds of landing.
- A user scanning By ADD = 5 can read all 5-ADD tricks on a single mobile screen.
- The structural sentence (≡ reading) reads before the title in eye-tracking.
- No "Notation pending" placeholder visible in registry mode on rows with curator-set equivalences.
- The operator-role registry has zero `unknown` token classifications for any token used in a published ≡ reading.

---

## §H. Plaintext mockups

### §H.1 Registry mode — By ADD = 5

```
#blurry-whirl    stepping  paradox  whirl                           ◆ 5
                                    ─────  (active anchor; underline persists)

#mobius          spinning  ss  miraging  osis                       ◆ 5
                                         ────

#nemesis         furious  barfly                                    ◆ 5

#fury            furious  paradox  mirage                           ◆ 5
                                   ──────

#surreal         surging  paradox  symposium  whirl                 ◆ 5
                                              ─────

#sumo            nuclear  mirage                                    ◆ 5
                         ──────
```

Notation reads as the structural sentence. Slugs are quiet identifiers. The base-anchor underline persists across rows even though base anchors differ; underline color matches the anchor's role (core-green). Modifier tokens are in olive (or olive-with-weight for set vs body).

### §H.2 Browse mode — By Family / whirl family

```
                                                                    ◆ 3
#whirl                                                              #whirl
whirl
─────
(canonical family anchor; entry point)

                                                                    ◆ 4
#paradox-whirl
paradox  whirl
         ─────

                                                                    ◆ 5
#blurry-whirl
stepping  paradox  whirl
                   ─────

                                                                    ◆ 5
#spinning-whirl
spinning  whirl
          ─────

                                                                    ◆ 5
#symposium-whirl
symposium  whirl
           ─────

                                                                    ◆ 6
#surreal
surging  paradox  symposium  whirl
                             ─────
```

Every row's `whirl` is underlined in core-green. Modifier-stacking left of `whirl` is visually obvious. The reader sees the pattern.

### §H.3 Browse mode — By Component / paradox component

```
                                                                    ◆ 3
#paradox-mirage
paradox  mirage
─────────

                                                                    ◆ 4
#paradox-whirl
paradox  whirl
─────────

                                                                    ◆ 5
#fury
furious  paradox  mirage
         ─────────

                                                                    ◆ 5
#blurry-whirl
stepping  paradox  whirl
          ─────────

                                                                    ◆ 6
#paradox-torque
paradox  torque
─────────
```

In paradox-component view, `paradox` is the shared modifier; underlined in olive (modifier band). The base anchor varies per row (mirage, whirl, torque); not emphasized.

### §H.4 Browse mode — By Topology / rotational neighborhood

```
                                                                    ◆ 3
#whirl
whirl
─ ─ ─                                                              [observational]

                                                                    ◆ 3
#swirl
swirl
─ ─ ─                                                              [observational]

                                                                    ◆ 4
#torque
miraging  osis  (= torque)
          ─ ─ ─                                                    [observational]
```

Observational underline is dotted, not solid. Marks structural neighborhood without implying canonical-family classification. Visual distinction from family view.

### §H.5 Pending operator (doctrine-blocked)

```
                                                                    ◆ 5
#baroque
[barraging]  osis
─ ─ ─ ─ ─    ────
(dashed border on barraging = doctrine-pending; Q2)
```

Dashed border around the token signals "operator-role classification under community review." Once Q2 resolves, the dashed border becomes solid.

---

## §I. Cross-references

- `SYMBOLIC_CARD_SPEC.md` — the canonical card-renderer doctrine this audit refines
- `NOTATION_LAYER_STRATEGY.md` — the 8-layer representation model this audit uses
- `OPERATIONAL_NOTATION_STYLE_GUIDE.md` — operational notation conventions (the card already consumes this)
- `exploration/red-consolidation/SEMANTIC_COMPRESSION_DOCTRINE.md` — the 4-color visual budget, 4 locution levels, decomposition class taxonomy
- `exploration/glossary-v5-synthesis/BATCH_5_PLANNING_MEMO.md` — operator-chip aesthetic + restraint discipline carried forward
- `src/views/partials/dictionary-trick-card.hbs` — current card renderer
- `src/services/operationalNotationRendering.ts` — operational tokenization service; semantic counterpart proposed in §B.1
- `src/services/freestyleService.ts` — `getTricksIndexPage()` + `DictionaryTrickCard` view-model
- `src/content/freestyleOperatorReference.ts` — current operator registry; would be extended for operator-role classification
- `src/public/css/style.css` lines 5155–5300 — current `dict-card-*` CSS
- `src/public/css/style.css` lines 2584–2618 — current `op-token-*` CSS (existing role system, reusable)

---

## §J. Memo close

This audit's central recommendation: **lift semantic ≡ readings to the same role-tokenized treatment that operational notation already enjoys, and re-balance the visual hierarchy so the structural sentence reads first.**

Slice 1 scope (§F.1) is doctrine-stable and high-leverage: tokenize semantic notation, add registry density, apply family-stem emphasis, swap the By-ADD view to registry. This bundle delivers the user's primary complaints (pattern recognition; cognitive promotion of notation) without exceeding the 4-color visual budget or breaking the one-card-renderer doctrine.

Slice 2+ work (operator-role chip variants, count-bearing rendering, atomic-family hidden-X-dex visualization, Fairy chip) is doctrine-blocked on Wave 2; defer.

The dictionary's symbolic system has the necessary structural infrastructure already in place. The visual surface just needs to catch up.
