# Prototype Accounting Render Examples

**Status:** Planning artifact. Visual / pedagogical exploration. ASCII mockups represent render-shape proposals, not production HTML. No implementation in scope.

**Date:** 2026-05-18

---

## Purpose

Prototype how executable ADD accounting would actually FEEL to users. Demonstrate progressive disclosure, the compact-vs-expanded transition, the visual distinction between symbolic chains and accounting expansions, and the bad render patterns the system must avoid.

This is a render-shape exploration. Type-styling, exact spacing, and CSS classes are out of scope. The goal is locking the *information layout* before D6 (UI brainstorm) finalizes the surface treatment.

---

## The most important principle — progressive disclosure

**The educationally best render is NOT always the most complete.**

Three render modes coexist:

| Mode | Audience | Default state | Information density |
|---|---|---|---|
| Compact | Everyone | always visible | shorthand only — community-readable |
| Expanded Accounting | Curious learners | opt-in expander | full component breakdown |
| Deep Decomposition | Advanced learners | separate surface (operator board / glossary §7 / equivalence registry) | structural-chain layers |

The three modes serve different cognitive moments. They must not collapse into one wall of information.

---

## Render Mode A — Compact Mode

Always visible. Minimal augmentation. Preserves the existing trick-page feel.

### Mockup — generic compact view

```
┌────────────────────────────────────────────────────┐
│ mobius                                      5 ADD  │
│ ≡ gyro torque                                      │
│                                                    │
│ [ Show ADD derivation ▾ ]                          │
└────────────────────────────────────────────────────┘
```

**Anatomy:**
- Title: canonical trick name
- ADD chip: editorial `asserted_adds`, right-aligned
- One-line ≡ equivalence (optional, present where curator-confirmed)
- A single collapsed-by-default expander

**What it preserves:** the existing trick-page reading experience. No new visual weight added for users who don't expand.

**What it adds:** one inline button. Discoverable without being demanding.

### Mockup — atom with no derivation panel (suppressed Class B)

```
┌────────────────────────────────────────────────────┐
│ toe stall                                   1 ADD  │
│                                                    │
│ (atomic stall — see glossary for component theory) │
└────────────────────────────────────────────────────┘
```

**Anatomy:** no expander at all. Class B / single-component-atom suppression is silent.

**Why:** there is nothing hidden to reveal. A `stall(+1) = 1 ADD` derivation would teach nothing.

---

## Render Mode B — Expanded Accounting Mode

The opt-in derivation. Component-level breakdown with optional inheritance hints.

### Lead showcase — mobius

The marquee teaching moment. Demonstrates shorthand compression, inheritance, hidden accounting, and the double-spin emergence.

```
┌──────────────────────────────────────────────────────┐
│ mobius                                        5 ADD  │
│ ≡ gyro torque                                        │
│                                                      │
│ [ Hide ADD derivation ▴ ]                            │
│                                                      │
│   spin(+1)             ← from gyro                   │
│ + mirage-dex(+1)       ← inherited from torque       │
│ + xbody(+1)            ← inherited from torque       │
│ + stall(+1)            ← inherited from torque       │
│ + spin(+1)             ← inherited from torque       │
│ ─────────────────────                                │
│ = 5 ADD                                              │
└──────────────────────────────────────────────────────┘
```

**Pedagogical anatomy:**

1. **Compact line stays primary.** The canonical name `mobius` and the structural-chain hint `≡ gyro torque` remain the dominant text.
2. **Five aligned `+` rows.** Each line is a single component with its ADD chip. The `+` operator aligns vertically — the eye scans down the column without parsing word boundaries.
3. **Right-aligned inheritance hints.** The "← from gyro" / "← inherited from torque" annotations explain *where each component comes from*. They are visually de-emphasized (smaller / lighter) so the primary scan reads as a clean addition.
4. **Horizontal rule above the total.** Standard math-style addition layout — familiar pattern, low cognitive load.
5. **Equals line.** Echoes the ADD chip in the compact header. Closes the loop.

**The double-spin emergence:** rows 1 and 5 are both `spin(+1)`. They are deliberately *not* merged into `spin(+2)`. The two distinct spins are the teaching moment.

### Mobile reduction of mobius

On phones, the right-aligned hints drop below the line or hide entirely.

```
┌─────────────────────────────┐
│ mobius              5 ADD   │
│ ≡ gyro torque               │
│                             │
│ [ Hide derivation ▴ ]       │
│                             │
│   spin(+1)                  │
│ + mirage-dex(+1)            │
│ + xbody(+1)                 │
│ + stall(+1)                 │
│ + spin(+1)                  │
│ ─────────                   │
│ = 5 ADD                     │
└─────────────────────────────┘
```

Inheritance hints relocate to a secondary tap-to-reveal layer ("Where does each part come from?" button below the total). Or omit entirely on mobile — Phase-1 ships either way.

### Generic structure for expanded mode

```
[Trick name]                          [Editorial ADD chip]
[Structural-chain hint, optional]

[Component 1](+N)        ← [where it comes from]
+ [Component 2](+N)      ← [where it comes from]
+ ...
─────
= [Total ADD]
```

---

## Render Mode C — Deep Decomposition Mode

Lives on the operator board and equivalence-registry surface. NOT on the trick page derivation panel.

### Operator-board shape (existing surface)

```
mobius
  ≡ gyro torque
  ≡ spinning miraging osis
  ≡ (other equivalence-chain layers)
```

This is the structural-chain view — what compounds reduce to in symbolic terms. It is curator-maintained, exists today, and answers "how do I read this trick in different shorthands?"

### Important contract

**Render Mode C does NOT appear inside the derivation panel.** The accounting panel and the equivalence chain are two different surfaces serving two different questions:

| Question | Surface |
|---|---|
| "Why does this trick total 5 ADD?" | Accounting panel (Mode B) |
| "What does this trick equal in other shorthand?" | Operator board / equivalence registry (Mode C) |

The accounting panel may include *one* structural-chain hint (the `≡ gyro torque` line in mobius above) as a Phase-2 enhancement, but full chain rendering belongs to Mode C's home surface.

---

## Required good examples

12 tricks per the brief. Mockups in expanded mode (Mode B) where renderable.

### 1. whirl  (Class A — renderable)

```
whirl                                          3 ADD

  xbody(+1)
+ dex(+1)
+ stall(+1)
─────────
= 3 ADD
```

**Teaches:** the three hidden components inside a single-word atom. First exposure to `xbody` as a named unit.

### 2. butterfly  (Class A — renderable)

```
butterfly                                      3 ADD

  dex(+1)
+ xbody(+1)
+ stall(+1)
─────────
= 3 ADD
```

**Teaches:** same total as whirl, different component order. Pairs nicely with whirl in a side-by-side teaching example (glossary §8).

### 3. osis  (Class A — renderable)

```
osis                                           3 ADD

  mirage-dex(+1)
+ xbody(+1)
+ stall(+1)
─────────
= 3 ADD
```

**Teaches:** first appearance of `mirage-dex` as a compound dex unit. Subtle distinction from butterfly's vanilla `dex`.

### 4. atw (around-the-world)  (Class A — renderable)

```
around-the-world                               2 ADD

  xbody(+1)
+ stall(+1)
─────────
= 2 ADD
```

**Teaches:** the cleanest 2-ADD atom. Body-crossing made explicit.

### 5. mirage  (Class A — renderable)

```
mirage                                         2 ADD

  dex(+1)
+ stall(+1)
─────────
= 2 ADD
```

**Teaches:** the mirage *word* is the dex+stall unit, not a third thing.

### 6. torque  (Class A — renderable)

```
torque                                         4 ADD
≡ miraging osis (+ spin)

  mirage-dex(+1)        ← from osis
+ xbody(+1)             ← from osis
+ stall(+1)             ← from osis
+ spin(+1)              ← added by torque
─────────
= 4 ADD
```

**Teaches:** how a compound atom inherits from its base atom and adds one more component. The "+ spin" emergence is the trick's defining contribution.

### 7. mobius  (Class A — lead showcase, see above)

Treated above as the lead showcase. Double-spin emergence.

### 8. ripwalk (≡ stepping butterfly)  (Class A — renderable)

```
ripwalk                                        4 ADD
≡ stepping butterfly

  set(+1)               ← from stepping
+ dex(+1)               ← from butterfly
+ xbody(+1)             ← from butterfly
+ stall(+1)             ← from butterfly
─────────
= 4 ADD
```

**Teaches:** how a modifier (`stepping`) manifests as a component (`set`). The compact form names the modifier; the expansion names the component it produces.

### 9. dimwalk (≡ pixie butterfly)  (Class A — renderable)

```
dimwalk                                        4 ADD
≡ pixie butterfly

  set(+1)               ← from pixie
+ dex(+1)               ← from butterfly
+ xbody(+1)             ← from butterfly
+ stall(+1)             ← from butterfly
─────────
= 4 ADD
```

**Teaches:** identical accounting to ripwalk; different modifier. The modifier-set-collapse rule made obvious by side-by-side comparison.

### 10. reverse whirl  (Class C — context-note)

```
reverse whirl                                  3 ADD
Context: reverse

  xbody(+1)
+ dex(+1)
+ stall(+1)
─────────
= 3 ADD
```

**Teaches:** the positional marker (`reverse`) is +0 and carries no accounting weight. The "Context: reverse" line acknowledges its presence without claiming a +0 row.

### 11. reverse atw  (Class C — context-note)

```
reverse around-the-world                       2 ADD
Context: reverse

  xbody(+1)
+ stall(+1)
─────────
= 2 ADD
```

**Teaches:** same accounting as atw. Reinforces that reverse modifies *direction*, not weight.

### 12. blur (≡ blurry whirl)  (Class D — suppressed)

```
blurry whirl                                   5 ADD
```

**That is the entire render.** No derivation panel. No "Show ADD derivation" expander. No "Pending Red ruling" copy.

**Teaches by absence:** the trick still has an authoritative ADD (per Red ruling). The component decomposition is not curator-attributable because it routes through paradox internals (Wave-2 cluster U1). The page remains useful for everything else (canonical name, ADD chip, alias graph, media gallery).

### 13. smear  (Class D — suppressed, insufficient data)

```
smear                                          ? ADD
```

ADD chip may also be absent if editorial total is not yet established (curator-confirmation-pending). Page renders the trick name + whatever metadata is present.

**Same silent treatment as Wave-2 cases.** No "Pending" copy.

---

## Required bad examples

Documenting what the system MUST avoid. Each comes with a what-went-wrong note.

### Bad #1 — Parser soup (operator-names-as-components)

```
mobius                                         5 ADD

  gyro(+1)
+ torque(+4)             [expand?]
─────────
= 5 ADD
```

**What went wrong:** Renders operator names, not components. The "torque(+4)" line is a black box — it has its own ADD but no breakdown surfaced. To get the actual learning, the user has to click "expand?" — making the panel a nested clicking exercise rather than a single revelation.

**The right rule:** render *components*, not *operators*. Operator-to-component manifestation (gyro → spin) is the curator-map's job. Once the panel opens, it shows the full component breakdown.

### Bad #2 — Full AST flattening

```
mobius
─ (gyro
     (torque
        (mirage-dex
           (mirage(+1) + dex(+1))
         + xbody(+1)
         + stall(+1)
         + spin(+1)))
     + spin(+1))
= 5 ADD
```

**What went wrong:** Treats accounting as a syntax-tree visualization. Renders parentheses, nested groupings, AST-style indentation. Unreadable. Parser-centric. Exposes mirage-dex as `mirage + dex` (splitting a unit the inventory locked as one).

**The right rule:** flat additive list, one component per line, no nesting.

### Bad #3 — Maximal exposure (everything at once)

```
mobius                                         5 ADD
≡ gyro torque
≡ spinning miraging osis
≡ (extended chain via paradox decomposition pending)

Structural chain layers:
  Layer 1: mobius
  Layer 2: gyro + torque
  Layer 3: gyro + (miraging + osis + spin)
  Layer 4: gyro + (miraging + (mirage + dex) + xbody + stall + spin)

Educational accounting:
  spin(+1) + mirage-dex(+1) + xbody(+1) + stall(+1) + spin(+1) = 5 ADD

Hidden components inherited from:
  - gyro contributes spin
  - torque inherits from osis: mirage-dex, xbody, stall
  - torque contributes spin
  - mobius has no additional component contribution

Component family classifications:
  spin     → spin-family   (operator-tier)
  mirage-dex → dex-family  (compound)
  xbody    → body-family   (atomic)
  stall    → stall-family  (foundational)

Parser computed_adds: 5 (agrees with editorial)
Diagnostic: no disagreement
```

**What went wrong:** Mixes Modes A / B / C / diagnostic / classification into one block. The user is reading a curator workbench, not a teaching surface. Cognitive overload. The "aha" moment is buried under noise.

**The right rule:** one mode per moment. The trick page is Mode B (accounting). Mode C lives elsewhere. Diagnostics are curator-internal.

### Bad #4 — Inline positional-marker pollution

```
reverse near same-side whirl                   3 ADD

  reverse(+0)
+ near(+0)
+ same-side(+0)
+ xbody(+1)
+ dex(+1)
+ stall(+1)
─────────
= 3 ADD
```

**What went wrong:** Renders every positional marker as a +0 row. Visual weight implies they matter for the math. Learners look at three "+0" rows and wonder why they're there. The signal-to-noise ratio is awful.

**The right rule:** positional markers go into a single `Context:` caption above the derivation. They never appear as +0 rows inline.

### Bad #5 — Inheritance chain rendered as nested decomposition

```
mobius                                         5 ADD

  spin(+1)
+ torque(+4)
    │
    └─ mirage-dex(+1)
       └─ mirage(+1) + dex(+1)
    └─ xbody(+1)
    └─ stall(+1)
    └─ spin(+1)
─────────
= 5 ADD
```

**What went wrong:** Tries to be helpful by showing the inheritance chain. Result is a tree diagram that no one wants to read. Mixes the flat-additive accounting view with the structural-chain view.

**The right rule:** flat list. Inheritance is communicated by the right-aligned annotations ("← from torque"), not by indentation.

### Bad #6 — Parser-disagreement surfaced to users

```
osis                                           3 ADD

  mirage-dex(+1)
+ xbody(+1)
+ stall(+1)
─────────
= 3 ADD

⚠ Parser disagrees: parser-computed total = 4 (split mirage-dex into mirage + dex)
```

**What went wrong:** Surfaces a curator-internal diagnostic on the public page. The user does not need to know that the parser produces a different number. The diagnostic is for the curator workbench.

**The right rule:** parser disagreement is a curator-only signal. Public render shows the curator-map result, full stop.

### Bad #7 — Suppression with apology copy

```
paradox whirl                                  6 ADD

⏳ Derivation pending Red ruling on paradox internals. We're working on it!
   This trick will get its ADD derivation when the Wave-2 doctrine resolves.
```

**What went wrong:** Adds explanatory copy that names the doctrine status, the resolution dependency, and an implicit timeline. Per Decision 2, the page must not advertise doctrine state.

**The right rule:** silent suppression. The trick page renders normal layout + editorial ADD chip. The absence of the panel is the only signal.

### Bad #8 — Mobile cliff (lines too long)

```
ripwalk                                                                4 ADD
≡ stepping butterfly

  set(+1)        ← from stepping (the walking-family modifier; visible in the canonical name)
+ dex(+1)        ← from butterfly (ankle dexterity; the standard +1 dex unit)
+ xbody(+1)      ← from butterfly (body crossing; hidden inside the butterfly atom name)
+ stall(+1)     ← from butterfly (the trick terminator; universal across atoms)
─────────
= 4 ADD
```

**What went wrong:** Inheritance annotations are full sentences. On a phone these wrap into three-line paragraphs per component. The clean column scan collapses into a wall of text.

**The right rule:** inheritance annotations are 2-4 word fragments. Anything longer goes into a separate "Where does each part come from?" disclosure on mobile.

---

## Suppression examples — restraint, not failure

Suppression is **intentional educational restraint**, not omission. Three reasons a trick suppresses:

### Reason A — Atom-only ADD ≤ 1 (Class B)

```
toe stall                                      1 ADD
clipper stall                                  1 ADD
pickup                                         1 ADD
inside stall                                   1 ADD
```

**Why suppress:** the derivation would be a single `stall(+1) = 1 ADD` line. That teaches nothing. The compact label and the surface-name above the chip provide all the context.

**Page experience:** normal trick-detail layout, no expander, no derivation panel. Indistinguishable from a trick that simply has no accounting metadata.

### Reason B — Wave-2 doctrine unresolved (Class D)

```
paradox whirl                                  6 ADD
symposium butterfly                            4 ADD
baroque                                        5 ADD
ducking butterfly                              ? ADD
fairy drifter                                  ? ADD
```

**Why suppress:** the components that produce these totals are not curator-attributable. Per Decision 2, silence beats a provisional reading that anchors an unconfirmed decomposition in user memory.

**Page experience:** normal layout. ADD chip when editorial total is known; chip absent when not. No expander. No "Pending" copy.

### Reason C — Contextual modifier without locked manifestation (Class D)

```
fairy drifter                                  ? ADD
reverse drifter                                ? ADD
drifter whirl                                  ? ADD
```

**Why suppress:** drifter's manifestation is context-dependent (per D3 Section 4). Until the curator-map locks a per-compound manifestation table, the panel cannot render without inventing a rule.

**Page experience:** normal layout, no expander.

### Suppression contract in summary

| Element on the page | Class A renderable | Class B suppressed | Class C context-note | Class D suppressed |
|---|---|---|---|---|
| Trick name | ✓ | ✓ | ✓ | ✓ |
| Editorial ADD chip | ✓ | ✓ | ✓ | ✓ (when known) |
| Structural-chain hint (≡ ...) | ✓ when curator-confirmed | — | ✓ when curator-confirmed | — |
| Derivation expander | ✓ | — | ✓ (with caption) | — |
| Component breakdown (after expand) | ✓ | — | ✓ | — |
| "Pending" copy | — | — | — | — |
| Curator diagnostic | — | — | — | — |

---

## UX principles

### Progressive disclosure

1. **Default = compact.** Everyone sees the compact view. No new visual weight per trick.
2. **Opt-in expansion.** A single button reveals the derivation. The user chooses the moment.
3. **One disclosure level.** No nested expanders. The derivation either renders fully or does not render at all.
4. **No mode-switcher.** The user does not pick Mode A / B / C. The page presents Mode A by default, Mode B on demand. Mode C lives on a different page.

### Educational density

5. **Tricks with ADD ≥ 2 hidden components are the cohort that earns the expander.** Atom-only trick with ADD = 1 does not.
6. **Inheritance annotations are pacing aids, not authority claims.** They explain where each component "comes from." Brief, easy to skip.
7. **Side-by-side comparison is the highest-density teaching pattern.** Glossary §8 (walking-family) is the natural home for ripwalk + dimwalk + sidewalk together. The trick page is single-trick context.

### Readability preservation

8. **Compact line never moves.** The trick name + ADD chip + structural-chain hint stay where they are today. The expander appears below them. Pre-expansion and post-expansion, the compact reading is identical.
9. **No new typography for the panel.** Reuse the existing trick-page type scale. The derivation does not deserve special headers or callout boxes — it's a content section.
10. **Use existing components where possible.** ADD chips already exist on trick pages. Reuse them in the derivation; do not invent a new chip style.

### Compact-vs-expanded transitions

11. **Expansion is an inline reveal, not a modal.** The derivation appears below the compact line, in-page. No overlay, no drawer, no page reload.
12. **Collapse restores the prior state exactly.** No layout shift. The "Show / Hide" button is the only thing that changes.

### Mobile readability

13. **Lines wrap predictably or hide.** Inheritance annotations either hide on narrow screens or reflow to a secondary tap-to-reveal layer. Never let them produce three-line wraps.
14. **Tap targets meet minimum size.** The expander button is a full-width row on phones.
15. **Component rows align to grid.** The `+` operator stays in column 1 on every screen size. No center-alignment, no flex-wrap on the component rows themselves.

### Hover vs inline expansion

16. **Phase 1: inline expansion only.** Click-to-expand. Hover-reveal is a Phase-2 enhancement for desktop power users.
17. **Hover does not satisfy mobile.** Any feature gated on hover must have a tap equivalent.

### When derivation helps

- Atom with ADD ≥ 2 (whirl, butterfly, osis, atw, etc.)
- Modifier compounds where the modifier-to-component manifestation is non-obvious (stepping → set)
- Compound atoms with inheritance (torque inheriting from osis; mobius inheriting from torque)
- Direction variants where the +0 marker needs context (reverse-whirl)
- Cross-trick comparisons (ripwalk vs dimwalk)

### When derivation overwhelms

- Atom-only ADD = 1 (no hidden accounting to surface)
- Tricks with 6+ components rendered (cognitive load too high)
- Tricks with mixed positional + accounting + structural-chain pollution
- Tricks where the manifestation is contextual or unresolved

### Hidden-accounting "aha" moments to optimize for

| Trick / pairing | The aha moment |
|---|---|
| whirl | "There are three things inside that one word." |
| butterfly vs whirl | "Same components, different order — because the body moves differently." |
| osis | "Mirage-dex is one unit, not two — the dex carries a mirage flavor." |
| torque | "Torque is osis + spin." |
| **mobius** | **"There are TWO spins — one from gyro and one inherited from torque."** |
| ripwalk vs dimwalk | "Same accounting, different modifier. The modifier collapses into the set." |
| reverse-whirl | "Reverse doesn't change the math, only the direction." |

The mobius double-spin is the single highest-impact moment in the system.

---

## Visual principles

### Folk readability preservation

- Compact names ("whirl", "mobius", "ripwalk") stay primary.
- Community shorthand ("gyro torque", "stepping butterfly") stays visible as the structural-chain hint.
- The expansion supplements; it does not replace.

### Movement-language elegance

- Components carry their natural names ("xbody", "mirage-dex"), not parser-internal tokens.
- The `+` operator and `=` line look like math, not code.
- No camelCase, no underscores, no parser-style identifiers in user-visible text.

### Compact notation aesthetics

- The trick-page hero stays the trick name. The ADD chip is right-aligned and small.
- The expander button is unobtrusive — a single inline button, not a card or callout.
- White space matters more than ornament. Resist the urge to add boxes / dividers / icons.

### Things to avoid

- Parser-centric visuals (AST trees, brackets, parentheses-as-grouping)
- Giant additive walls (5+ components without visual rhythm)
- Exhaustive flattening (every layer of inheritance rendered inline)
- Machine-oriented presentation (JSON-shaped, table-with-types, type-system-shaped)
- Status indicators on Wave-2 tricks (no warning icons, no "pending" badges)
- Editorial commentary inside the derivation ("This component is interesting because...")

---

## Optional ideas

These are explicitly Phase-2+ candidates, not Phase-1 requirements.

### Hover reveals (desktop only)

Component names could carry hover-reveal glossary mini-cards:

```
Hovering "mirage-dex(+1)" →

  ┌────────────────────────────────────┐
  │ mirage-dex                         │
  │ Compound dex unit; the "mirage"    │
  │ flavor of dex (one component, not  │
  │ two). Appears in osis, torque,     │
  │ mobius.                            │
  │                                    │
  │ See glossary §3 →                  │
  └────────────────────────────────────┘
```

Phase-2 enhancement. Phase-1 cross-links to glossary via inline link only.

### Accounting-density indicator (compact mode)

On trick listings, a small badge could indicate "this trick has hidden accounting":

```
whirl                                  3 ADD  💡
toe stall                              1 ADD
```

The 💡 icon indicates "expand for hidden accounting." Risk: this makes Class-B atoms (toe-stall) look "less than" Class-A atoms. Recommend against; let the trick page itself communicate this.

### "Why is this 5 ADD?" helper

A header link on the trick page:

```
mobius                                         5 ADD  [why?]
```

Clicking "[why?]" expands the derivation. Same outcome as the standard expander; different affordance. Possible Phase-2 A/B.

### Chain / accounting side-by-side (Phase 2 glossary integration)

For pedagogical pages (glossary §8 walking-family), a two-column layout could surface chain + accounting together:

```
┌─────────────────────────────────────────┬──────────────────────────────┐
│ Structural chain                        │ Accounting                   │
├─────────────────────────────────────────┼──────────────────────────────┤
│ ripwalk                                 │   set(+1)                    │
│   ≡ stepping butterfly                  │ + dex(+1)                    │
│                                         │ + xbody(+1)                  │
│                                         │ + stall(+1)                  │
│                                         │ = 4 ADD                      │
├─────────────────────────────────────────┼──────────────────────────────┤
│ dimwalk                                 │   set(+1)                    │
│   ≡ pixie butterfly                     │ + dex(+1)                    │
│                                         │ + xbody(+1)                  │
│                                         │ + stall(+1)                  │
│                                         │ = 4 ADD                      │
└─────────────────────────────────────────┴──────────────────────────────┘
```

This is Phase 2 (C in the sequencing) and lives in glossary §8 / §7, not on individual trick pages.

### Component-link to glossary

Each component name in the derivation could link to its glossary §3 entry:

```
  [xbody](+1)
+ [dex](+1)
+ [stall](+1)
```

Where `[xbody]` is a hyperlink to `/freestyle/glossary#term-xbody`. Phase-1 candidate; low cost, high pedagogical value.

---

## Final report — deliverable #5

### Strongest educational render patterns

1. **Flat additive list with right-aligned inheritance annotations.** The mobius mockup. Component-per-line, aligned `+` column, brief "← from X" annotation per row. Reads top-to-bottom as a math expression with provenance.
2. **Side-by-side pairings (Phase 2).** Ripwalk + dimwalk shown together. Two compact lines on the left; two identical accountings on the right. Teaches the modifier-set-collapse rule by visual identity.
3. **Structural-chain hint on one line above the derivation.** `≡ gyro torque` for mobius. Acknowledges Mode C's existence without rendering it.
4. **Class-C context caption for positional markers.** `Context: reverse` above the derivation. Honors the directional information without adding +0 rows.
5. **Silent suppression for Class B and D.** Page looks normal. No "missing" affordance, no "pending" copy.

### Weakest render patterns (anti-patterns demonstrated)

1. Parser soup (operator names as components).
2. AST tree flattening.
3. Maximal exposure (Modes A/B/C in one block).
4. Inline `+0` positional rows.
5. Inheritance rendered as nested decomposition.
6. Parser-disagreement surfaced publicly.
7. Apology copy on suppressed tricks.
8. Mobile cliff (annotations too long, lines wrap badly).

### Readability findings

- **Component rows align cleanly when each line begins with the operator (`+`) and the component name is short.** This holds for all six accounting components. The pattern scales to 5-6 lines comfortably; degrades past 7.
- **Right-aligned inheritance annotations are scannable only when ≤ 4 words.** Longer annotations create mobile-cliff risk and desktop visual noise.
- **The `≡ X` structural-chain hint reads as natural-language equivalence,** not as a tech notation. Users do not need the symbol explained inline.
- **Class-C context captions (`Context: reverse`) read as English,** not as a special marker. Acceptable cognitive overhead.

### Parser-risk observations

- **Parser-disagreement diagnostics must never reach the public render.** Bad #6 demonstrates the failure mode. Diagnostic destination must be curator-internal (per concept doc Open Q4).
- **Parser-named components (e.g., parser thinks `mirage-dex` is `mirage + dex`) must not leak into the panel.** The curator-map's component names are authoritative. Parser is for total-only validation.
- **Parser silence does not gate panel rendering.** Suppression gates on `wave2_sensitive=true` in the inventory, not on parser computability. The parser computes Wave-2 totals just fine; that does not authorize the panel.

### Recommended Phase-1 render shape

```
[trick name]                                   [editorial ADD chip]
[≡ structural-chain hint, when curator-confirmed]

[ Show ADD derivation ▾ ]                      ← collapsed by default

(on expansion:)

  [component 1](+N)        ← [≤ 4-word source annotation]
+ [component 2](+N)        ← [...]
+ ...
─────────
= [total]
```

**Constraints:**
- Phase 1 uses click-to-expand only (no hover).
- Class-C tricks insert a `Context: ...` line above the derivation.
- Component names link to glossary §3 (Phase 1 low-cost addition).
- No mode-switcher. No nested expanders. No "why?" alternate affordance.

### Recommended future-phase experiments

| Experiment | Phase | Risk |
|---|---|---|
| Side-by-side family layout (glossary §8) | 2 | Layout complexity at mobile |
| Hover-reveal glossary cards | 2 | Desktop-only; not equivalent for phones |
| Accounting-density indicators on listings | deferred | Visual hierarchy implies Class B = lesser |
| "Why?" affordance variant | A/B test | Affordance proliferation |
| Two-column chain / accounting view | 2 | Heavy layout; deserves dedicated route |

### Suppression heuristics (codified)

1. `wave2_sensitive=true` for any token in the trick → suppress.
2. Atom-only with ADD ≤ 1 → suppress (Class B).
3. Modifier with contextual manifestation → suppress until manifestation locked.
4. Insufficient curator-confirmed data → suppress.
5. Editorial total absent → trick may still render normally; just no panel, no chip.

**The default is suppress.** A trick only renders the panel when (a) all its tokens are resolved, (b) the curator-map total agrees with editorial, and (c) the breakdown is ≥ 2 components.

### Progressive-disclosure recommendations

1. **One disclosure level, never two.** Expander reveals derivation; derivation never reveals nested expanders.
2. **Compact state is the canonical state.** Refreshing the page should not preserve "expanded" — every visit starts compact. Avoids surprising users with content they don't remember opening.
3. **The expander button is small and inline.** Not a card. Not a callout. A single text button in the trick-page reading flow.
4. **Glossary deep-links (component → §3) are the secondary discovery path.** Users who want more context follow the link; the trick page doesn't expand further.
5. **Phase 2 may add side-by-side comparison layouts** on glossary pages — but the trick page itself stays single-disclosure.

---

## Cross-references

- `executable_add_accounting_concept.md` — framing, three locked decisions
- `add_bearing_symbol_inventory.csv` — gates panel rendering via `wave2_sensitive`
- `compressed_atom_expansion_map.md` — D3 expansion logic; Section 4 (drifter), Section 5 (positional handling)
- `wave2_sensitive_accounting_cases.md` — D4 suppression register
- [[project_freestyle_state]] — Red rulings + walking-family ladder
- [[feedback_parser_editorial_separation]] — parser is consistency-check, never authority

## Next deliverable

`educational_mode_ui_brainstorm.md` — UI surface mockups for the per-trick expander, glossary integration, and mobile considerations. Translates D5's render shapes into concrete UI patterns.
