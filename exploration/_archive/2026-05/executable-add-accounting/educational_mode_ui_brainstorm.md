# Educational Mode UI Brainstorm

**Status:** Planning artifact. UI / interaction-pattern exploration. ASCII mockups represent surface concepts, not production HTML / CSS / component code. Final visual treatment requires browser-rendered iteration (manual review required at implementation time).

**Date:** 2026-05-18

---

## Purpose

Translate D5's render shapes into concrete UI surface patterns. Define what the user sees, taps, hovers, and expands at each phase of the executable-ADD-accounting rollout.

This is the bridge between the conceptual model (D1-D4) + rendering grammar (D5) and the eventual implementation. It is not implementation. It does not name templates, controllers, CSS classes, or component libraries — those decisions belong to the implementation slice once curator-map content lands.

---

## Phase-1 surface inventory

Per Decision 1 (concept doc), Phase 1 is sequencing letter **B** — per-trick expandable derivation panel on `/freestyle/tricks/:slug` pages. Two UI surfaces:

| Surface | Role | Cost |
|---|---|---|
| **Per-trick expander** | Primary educational moment; opt-in derivation reveal | medium (new component, content module, styles) |
| **Component-glossary cross-links** | Secondary discovery path; inline links from component names to glossary §3 entries | low (extends existing link patterns) |

No other Phase-1 surfaces. No new pages. No new nav. No new dashboards (curator workbench is Phase-2 / deferred).

---

## Surface 1 — The per-trick expander

### Default (collapsed) state

This is what the trick-detail page looks like for an accounting-eligible trick before any user interaction.

```
┌────────────────────────────────────────────────────────────┐
│  ◀ Back to tricks                                          │
│                                                            │
│  mobius                                            5 ADD   │
│  ≡ gyro torque                                             │
│                                                            │
│  Family: spin                                              │
│  Aliases: möbius                                           │
│                                                            │
│  ─────────────────────────────────────────────────────     │
│                                                            │
│  [ Show ADD derivation ▾ ]                                 │
│                                                            │
│  ─────────────────────────────────────────────────────     │
│                                                            │
│  Description: …                                            │
│  Reference media: …                                        │
│  …                                                         │
└────────────────────────────────────────────────────────────┘
```

**Anatomy:**

- **Trick header** unchanged from current production layout (name, ADD chip, equivalence hint, family, aliases).
- **Hairline divider** above and below the expander button — minimal visual weight, separates the new affordance from existing content without making it a "card."
- **Single inline button** — `Show ADD derivation ▾`. Text-button styling (not a CTA button). Sentence-case, no all-caps.
- **No badges, no icons, no tooltips on the collapsed state.** The button text is sufficient.

### Expanded state

Triggered by clicking / tapping the button.

```
┌────────────────────────────────────────────────────────────┐
│  ◀ Back to tricks                                          │
│                                                            │
│  mobius                                            5 ADD   │
│  ≡ gyro torque                                             │
│                                                            │
│  Family: spin                                              │
│  Aliases: möbius                                           │
│                                                            │
│  ─────────────────────────────────────────────────────     │
│                                                            │
│  [ Hide ADD derivation ▴ ]                                 │
│                                                            │
│    spin(+1)             ← from gyro                        │
│  + mirage-dex(+1)       ← inherited from torque            │
│  + xbody(+1)            ← inherited from torque            │
│  + stall(+1)            ← inherited from torque            │
│  + spin(+1)             ← inherited from torque            │
│  ──────────────                                            │
│  = 5 ADD                                                   │
│                                                            │
│  ─────────────────────────────────────────────────────     │
│                                                            │
│  Description: …                                            │
│  …                                                         │
└────────────────────────────────────────────────────────────┘
```

**Anatomy:**

- Button text toggles `Show` ↔ `Hide` and the chevron toggles `▾` ↔ `▴`.
- The derivation appears **inline, immediately below the button**, indented by one step (visual subordination).
- Component-name links (the highlighted tokens) navigate to glossary §3 anchors — Surface 2 below.
- Inheritance annotations are right-aligned on desktop, hidden or repositioned on mobile.
- The horizontal rule above the total is **shorter than the page-level dividers** — about the width of the derivation lines. Differentiates "math summation rule" from "page section divider."

### Transition behavior

- **No animation in Phase 1.** Click → state change. Content snaps into place.
- **No scroll adjustment.** The page does not auto-scroll to keep the expander in view. If the user expands a derivation off-screen, that's the user's problem (they clicked it; they know where it is).
- **Reload resets to collapsed.** State is not persisted in localStorage, URL hash, or session. Every visit starts compact. (Phase 2 may revisit this.)

### Button styling principles

- Text size: same as body text, not heading-sized.
- Color: link-colored (current theme accent), not button-shaped.
- Hover (desktop): underline.
- Active / focus: visible focus ring per accessibility standard.
- Disabled state: never disabled. If the trick suppresses, the button does not render at all.

### Where on the page

**Position:** between the trick header (name + ADD chip + meta) and the rest of the content (description, media, related tricks, etc.). The accounting layer is part of the trick's *identity*, not part of its *content*.

**Why not at the bottom:** putting the expander after the description would bury it. Putting it above the description (but below the header) signals "this is core trick information; expand if curious."

**Why not at the top:** putting it inside the header would make every trick look busier even when collapsed. The hairline-separator approach contains the affordance without making it a hero element.

---

## Surface 2 — Component-glossary cross-links

The Phase-1 low-cost enhancement: each component name in the derivation panel is a hyperlink to its glossary §3 entry.

### Mockup — link affordance

```
    spin(+1)             ← from gyro
  + mirage-dex(+1)       ← inherited from torque
  + xbody(+1)            ← inherited from torque
  + stall(+1)            ← inherited from torque
  + spin(+1)             ← inherited from torque
```

With link affordance (browser-rendered):

```
    [spin](+1)           ← from gyro
  + [mirage-dex](+1)     ← inherited from torque
  + [xbody](+1)          ← inherited from torque
  + [stall](+1)          ← inherited from torque
  + [spin](+1)           ← inherited from torque
```

Where `[term]` indicates a hyperlink anchor like `/freestyle/glossary#term-mirage-dex`.

### Link patterns

| Component | Target anchor | Notes |
|---|---|---|
| `stall` | `/freestyle/glossary#term-stall` | exists in §3 today |
| `dex` | `/freestyle/glossary#term-dex` | exists in §3 today |
| `xbody` | `/freestyle/glossary#term-xbody` | may need a glossary entry added — D6 flag |
| `spin` | `/freestyle/glossary#term-spin` | exists in §3 today |
| `set` | `/freestyle/glossary#term-set` | may need a glossary entry added — D6 flag |
| `mirage-dex` | `/freestyle/glossary#term-mirage-dex` | needs a glossary entry — D6 flag |

**Glossary §3 entries that may need adding for Phase 1:**

- `xbody` — currently the XBODY operator-board glyph is described in the symbolic-notation context; needs a §3 dexterity / body entry framed as a component
- `set` — set-modifier primitives appear in §3 today but the accounting role ("the +1-or-+0 component that operators attach to") may need its own entry
- `mirage-dex` — the compound dex unit; the most-hidden component in the inventory; needs §3 placement

Doc-sync skill should be invoked at implementation time to confirm which §3 entries exist and which need adding. This is a curator-decision point.

### Same-page navigation

Within the trick page, the component links go to the **glossary page** (not in-page anchors). The trick page does not duplicate the component definitions inline — that's what the glossary is for.

The link is a soft hand-off: "want to learn more about xbody? here's the definition."

### Reverse linking (Phase 2)

In Phase 2 / Surface C (glossary integration), each glossary §3 component entry could link back to **example tricks** that feature the component prominently. That is a Phase-2 enhancement, not Phase-1.

---

## Class-C — context-caption rendering

For tricks with positional markers (reverse, far, near, same-side, etc.), the derivation panel adds a caption line above the component breakdown.

### Mockup — reverse whirl

```
┌────────────────────────────────────────────────────────────┐
│  reverse whirl                                     3 ADD   │
│                                                            │
│  [ Hide ADD derivation ▴ ]                                 │
│                                                            │
│  Context: reverse                                          │
│                                                            │
│    xbody(+1)                                               │
│  + dex(+1)                                                 │
│  + stall(+1)                                               │
│  ──────────                                                │
│  = 3 ADD                                                   │
└────────────────────────────────────────────────────────────┘
```

**Anatomy:**

- `Context: reverse` line sits **inside** the expanded panel (not in the header) — it explains *the derivation*, not the trick.
- Plain text, no inline ADD chip. Reader infers +0 by absence.
- Multi-positional compounds (`near reverse whirl`) render the caption as `Context: near, reverse` — comma-separated.

### Why a caption, not inline rows

Per D5 Bad #4, rendering `reverse(+0)` as a component row creates visual weight that implies it matters for the math. The caption acknowledges presence without claiming weight.

### When the caption appears

| Trick attribute | Caption renders? |
|---|---|
| Contains 1+ positional markers (reverse, far, near, same-side, opposite-side, under, over, in-dex, out-dex) | yes |
| Contains 1+ timing markers (uptime, downtime, early, late) | yes |
| Atom-only with no positional / timing markers | no |
| Modifier compound with no positional / timing markers | no |

Positional and timing markers share the caption pattern. (They both have `add_value=0` and `accounting_role=positional-only` or `descriptive-only` in the inventory.)

---

## Suppression UI patterns

Per D5 — suppression is **intentional educational restraint**, not omission. The page must look normal.

### Class B — atom-only ADD ≤ 1 (silent suppression)

```
┌────────────────────────────────────────────────────────────┐
│  ◀ Back to tricks                                          │
│                                                            │
│  toe stall                                         1 ADD   │
│                                                            │
│  Family: stall                                             │
│                                                            │
│  ─────────────────────────────────────────────────────     │
│                                                            │
│  Description: …                                            │
│  Reference media: …                                        │
│  …                                                         │
└────────────────────────────────────────────────────────────┘
```

**What's missing:** no derivation expander. No hairline dividers above/below where the expander would be. No "Show ADD derivation" button. **No empty container.**

**What the user sees:** the existing trick page layout, identical to today.

### Class D — Wave-2 / contextual / insufficient data (silent suppression)

```
┌────────────────────────────────────────────────────────────┐
│  ◀ Back to tricks                                          │
│                                                            │
│  paradox whirl                                     6 ADD   │
│                                                            │
│  Family: paradox                                           │
│                                                            │
│  ─────────────────────────────────────────────────────     │
│                                                            │
│  Description: …                                            │
│  …                                                         │
└────────────────────────────────────────────────────────────┘
```

**Same treatment as Class B.** The page renders normally. The ADD chip shows the editorial total. No "pending Red ruling" copy, no warning icon, no info-button.

### What suppression does NOT look like

```
                                                                 ┌─── BAD
┌────────────────────────────────────────────────────────────┐   │
│  paradox whirl                                     6 ADD   │   │
│  ⏳ Derivation pending                                      │ ← │
│                                                            │   │
│  [ Show ADD derivation ▾ ]  (disabled)                     │ ← │
└────────────────────────────────────────────────────────────┘   │
                                                                 └─── violates Decision 2
```

**Failure mode:** advertising doctrine state in the trick-page chrome. Per Decision 2 this is forbidden.

### Tradeoff to flag

Silent suppression has a known cost: users may not realize that certain tricks have derivations available and others don't. The pattern is "if it's there, expand it; if it's not, the page just doesn't have one."

**Mitigation in Phase 2:** glossary §3 / §7 / §8 surfaces explicitly teach about the derivation pattern. Users who learn the pattern there will recognize it on trick pages.

**Mitigation NOT in Phase 1:** no on-trick-page indicator of suppression. Visual silence is the entire point.

---

## Phase-2 surface — glossary integration (sequencing letter C)

Phase 2 begins after Phase 1 ships and stabilizes. The accounting pattern moves from per-trick artifact to teaching layer.

### Glossary §3 — component pages with accounting context

Each component (stall, dex, xbody, spin, set, mirage-dex) gets an enhanced glossary entry that includes:

1. The existing definition prose (unchanged).
2. The component's ADD baseline value.
3. A "where it appears" example list — 2-3 tricks where this component is visible / hidden.
4. A reverse-link to the trick-detail derivation panels.

```
─── Glossary §3: Cross-body (xbody) ────────────────────────

Cross-body (xbody) is the body-crossing unit. It contributes
+1 ADD wherever it appears.

  Visible in:    around-the-world, legover
  Hidden in:     whirl, butterfly, osis, torque, mobius
  Total +1 ADD per appearance.

  Example expansion:
    whirl = xbody(+1) + dex(+1) + stall(+1) = 3 ADD
            └────────┘
            this is xbody contributing here

  See also: dex, set, mirage-dex
```

**Layout principle:** the glossary entry teaches the component as both a concept (what it is) and an accounting unit (what it contributes). Where Phase 1's trick page surfaces accounting per-trick, Phase 2's glossary surfaces accounting per-component.

### Glossary §7 — symbolic notation with accounting examples

§7 (the symbolic notation primer) gets an accounting subsection that uses 2-3 worked examples to show the pattern. Lead example: mobius.

```
─── Glossary §7.4: ADD derivation ──────────────────────────

Some tricks expand their ADD value into a per-component
breakdown. The breakdown shows where each ADD comes from.

Example — mobius (5 ADD):

  ≡ gyro torque

    spin(+1)             ← from gyro
  + mirage-dex(+1)       ← inherited from torque
  + xbody(+1)            ← inherited from torque
  + stall(+1)            ← inherited from torque
  + spin(+1)             ← inherited from torque (the hidden spin)
  ──────────────
  = 5 ADD

Note the two spins. Gyro contributes one; torque inherits
another. Compound atoms accumulate inherited components.

(See trick pages for individual derivations.)
```

**Anatomy:** rendered identically to the trick-page panel. The same render grammar; different page context. Users learn the pattern once on the glossary; recognize it everywhere.

### Glossary §8 — walking-family side-by-side

The highest-density Phase-2 layout. Family progression rendered with synchronized accounting.

```
─── Walking family progression ─────────────────────────────

  butterfly       =  dex + xbody + stall                    = 3 ADD

  ripwalk         =  stepping butterfly
                  =  set + dex + xbody + stall              = 4 ADD

  dimwalk         =  pixie butterfly
                  =  set + dex + xbody + stall              = 4 ADD

  sidewalk        =  stepping near butterfly                          → see below
  dada-curve      =  miraging far symposium butterfly                 ⊘ suppressed
  matador         =  nuclear butterfly
                  =  set + dex + xbody + stall              = 4 ADD

  phoenix         =  pixie ducking butterfly                          ⊘ suppressed
```

**Anatomy:**

- Each row is a single compound from the walking family.
- The structural-chain line and the accounting line align.
- **Suppressed compounds render the chain only**, with a `⊘ suppressed` marker. This is appropriate in §8 (teaching context) but NOT on trick pages (per Decision 2). The teaching surface can acknowledge doctrine gaps where the per-trick surface cannot.
- Identical accountings (ripwalk, dimwalk, matador all → `set + dex + xbody + stall = 4`) are the teaching moment: the modifier-set-collapse rule made obvious by visual alignment.

### Glossary §8 — modifier-set-collapse callout

A standalone callout in §8 (above the walking-family list) names the pattern:

```
┌────────────────────────────────────────────────────────────┐
│  The modifier-set-collapse rule                            │
│                                                            │
│  When a set-modifier (stepping, pixie, atomic, nuclear,    │
│  fairy) attaches to a base trick, it contributes +1 ADD    │
│  via the set component. The modifier's identity affects    │
│  the trick's name and movement style, but the accounting   │
│  is identical across the family.                           │
│                                                            │
│  See: ripwalk, dimwalk, matador, nuclear-butterfly         │
└────────────────────────────────────────────────────────────┘
```

**Style:** subtle background tint, no heavy chrome. Reads as a teaching aside, not a warning callout.

### Walking-family side-by-side on mobile

On phones the two-line-per-compound format wraps badly. Mobile fallback:

```
butterfly                                        3 ADD
  dex + xbody + stall

ripwalk (≡ stepping butterfly)                   4 ADD
  set + dex + xbody + stall

dimwalk (≡ pixie butterfly)                      4 ADD
  set + dex + xbody + stall

matador (≡ nuclear butterfly)                    4 ADD
  set + dex + xbody + stall

dada-curve (suppressed)                          5 ADD
  (≡ miraging far symposium butterfly)

phoenix (suppressed)
  (≡ pixie ducking butterfly)
```

Each compound becomes a stacked block. The vertical alignment of the three matching-accounting rows preserves the teaching pattern; the structural chain moves to parenthetical on mobile.

---

## Phase-2 surface — `/freestyle/add-analysis` enrichment

The existing `/freestyle/add-analysis` page already surfaces resolved-formula provenance. Phase 2 extends it with derivation rendering for each resolved formula.

### Mockup — existing format

```
─── /freestyle/add-analysis ────────────────────────────────

Section 2b — Resolved formulas

  mobius = gyro torque = 5 ADD
    Resolution date: 2026-04-…
    Provenance: pre-Red ruling integrated 2026-04-…
    Notes: prior reading mobius = miraging osis + spin was
           superseded by the gyro-torque equivalence chain.
```

### Mockup — Phase-2 enriched format

```
─── /freestyle/add-analysis ────────────────────────────────

Section 2b — Resolved formulas

  mobius = gyro torque = 5 ADD
    Resolution date: 2026-04-…
    Provenance: pre-Red ruling integrated 2026-04-…
    Notes: prior reading mobius = miraging osis + spin was
           superseded by the gyro-torque equivalence chain.

    Derivation:
        spin(+1)             ← from gyro
      + mirage-dex(+1)       ← inherited from torque
      + xbody(+1)            ← inherited from torque
      + stall(+1)            ← inherited from torque
      + spin(+1)             ← inherited from torque
      = 5 ADD
```

**Anatomy:** the resolved-formula block grows by one section ("Derivation:") containing the same render shape as the trick page. No mode switching; no expander needed (the user is already on the analysis page and expecting detail).

### Wave-2 cases on `/freestyle/add-analysis`

Unlike trick pages, the analysis page CAN explicitly state doctrine status. This is its established role.

```
  paradox internals — UNRESOLVED
    Affected tricks: paradox whirl, paradox butterfly, stepping
                     paradox whirl, atom smasher, blurry compounds
    Dependency: Red ruling pending on per-component decomposition
                of paradox.
    Current state: editorial ADD chips are authoritative; per-
                   component derivations are suppressed on trick
                   pages until doctrine resolves.
```

**Anatomy:** named cluster, affected-tricks list, dependency, current-state explanation. This is exactly the content of D4's register, surfaced on a teaching page. The trick pages remain silent; the analysis page is the home for the doctrine-status conversation.

---

## Curator workbench (internal-only, Phase 2 / deferred)

The diagnostic destination for curator-map vs editorial disagreements. Per [[feedback_internal_only_constraint]] this lives under `/internal/` and is gated by member-admin authentication.

### Mockup

```
─── /internal/freestyle/accounting-diagnostics ────────────────

ADD accounting diagnostics — 2026-05-18

✓ 23 tricks render derivation panel
✓ 0 diagnostic disagreements
○ 60 tricks suppress (per Wave-2 register)
○ 3 tricks suppress (insufficient data — see D4)

────────────────────────────────────────────────────────────

Diagnostic disagreements (0):

  (none — curator-map total matches editorial total for all
   23 accounting-eligible tricks)

────────────────────────────────────────────────────────────

Suppression queue — Wave-2 (60):

  paradox whirl                  6 ADD    blocks: U1
  paradox butterfly              5 ADD    blocks: U1
  symposium butterfly            4 ADD    blocks: U2
  baroque                        5 ADD    blocks: U3 (alias chain?)
  …
  [link: see D4 register]

────────────────────────────────────────────────────────────

Parser consistency check (informational):

  Tricks where parser disagrees with curator-map: 8
  Tricks where parser agrees with curator-map: 15
  Most-common parser divergence:
    mirage-dex split into mirage + dex (5 tricks)

  Note: parser disagreement is informational only and does
  not affect public rendering. Curator-map is authoritative.
```

**Anatomy:** four sections (status counts, diagnostic disagreements, suppression queue, parser consistency). All curator-internal. Mirrors the spirit of `/internal/data-quality` and similar admin surfaces.

**This is deferred to Phase 2 or later.** Phase-1 prototype can ship without the workbench; diagnostics can land as a build-time CI log or a one-off script until the workbench is justified.

---

## Mobile considerations (consolidated)

### Phone-specific rules

1. **Lines wrap predictably.** Component rows (`+ mirage-dex(+1)`) are short enough to fit on a single mobile line. Inheritance annotations (`← inherited from torque`) drop below the line or hide.
2. **Tap targets are full-width.** The "Show ADD derivation" button spans the content column edge-to-edge.
3. **No hover-dependent affordances.** Any feature gated on hover must have a tap equivalent or be Phase-2+.
4. **Side-by-side layouts (glossary §8) reflow to stacked.** Two-column desktop layouts become single-column stacks with synchronized typography.
5. **The expanded panel does not push down critical content.** The expander button sits above description / media / related-tricks; expanding adds 5-8 lines of vertical space. On mobile this is acceptable because the user opted in by tapping.

### Mobile mockup — mobius

```
┌──────────────────────────┐
│ ◀ Back                   │
│                          │
│ mobius           5 ADD   │
│ ≡ gyro torque            │
│                          │
│ Family: spin             │
│ Aliases: möbius          │
│                          │
│ ─────────────────────    │
│                          │
│ [ Show ADD derivation ▾ ]│
│                          │
│ ─────────────────────    │
│                          │
│ Description: …           │
└──────────────────────────┘
```

Expanded:

```
┌──────────────────────────┐
│ mobius           5 ADD   │
│ ≡ gyro torque            │
│                          │
│ [ Hide derivation ▴ ]    │
│                          │
│   spin(+1)               │
│ + mirage-dex(+1)         │
│ + xbody(+1)              │
│ + stall(+1)              │
│ + spin(+1)               │
│ ─────────                │
│ = 5 ADD                  │
│                          │
│ [ Where does each part   │
│   come from? ▾ ]         │   ← Phase-2 mobile-only secondary disclosure
│                          │
│ ─────────                │
│                          │
│ Description: …           │
└──────────────────────────┘
```

Phase 1 mobile may omit inheritance annotations entirely. Phase 2 may add the secondary disclosure ("Where does each part come from?") to surface them on tap.

---

## Accessibility patterns

### Keyboard navigation

- The expander button is keyboard-focusable.
- `Enter` and `Space` toggle expand / collapse.
- `Tab` order: trick name → ADD chip (if interactive) → meta links → expander button → component links (after expansion) → next page section.

### Screen reader rendering

- **Expander button** announces as: "Show ADD derivation, collapsed" / "Hide ADD derivation, expanded."
- **Component breakdown** reads as a list. The `+` operator is announced as "plus." The `=` line is announced as "equals."
- **Inheritance annotations** read as the component's full label including the source: "spin plus one, from gyro."
- **Class-C context caption** reads first: "Context: reverse. Open paren plus zero close paren. spin plus one, …"

### Color and contrast

- Inheritance annotations may be styled in a softer color, but contrast must meet WCAG AA against the page background.
- The `=` total line uses the same color/weight as the editorial ADD chip — ties them visually.
- No information conveyed by color alone. The `+` and `=` operators are the structural signal.

### Motion sensitivity

- No animation in Phase 1 means no `prefers-reduced-motion` consideration in Phase 1.
- If Phase-2 adds transitions, gate them behind the media query.

### Implementation note

These accessibility patterns are not implemented in this brainstorm — they are constraints on the eventual implementation. The doc-sync skill at implementation time should verify these patterns land.

---

## Future Phase-3+ surfaces (deferred)

Surfaces deliberately NOT pursued in Phase 1 or Phase 2. Listed here for context only.

### Standalone /freestyle/derivation page

Per Decision 1, Architecture A is not pursued. A standalone page would duplicate `/freestyle/add-analysis` without a clear new audience.

### Search by derivation

"Find all tricks with 4 ADD" — a search-by-attribute surface. Useful but requires schema work (indexing derivations). Out of scope until ontology is stable.

### "Build a trick" composer

Interactive UI where users compose components and see the resulting ADD computed. Tempting but introduces ontology-authority risk (user-facing surface implies the components combine validly, which they don't always do). Strictly off-limits in current planning.

### Derivation diff between trick versions

When a Red ruling re-resolves a trick, surface the before/after derivation. Useful for the curator-history-aware audience; tiny audience. Defer.

### Component-frequency dashboards

Curator analytics: how often does each component appear across the corpus? Belongs to curator workbench domain. Phase 3+.

---

## UI principles synthesis

Consolidating the rules surfaced across D5 + D6:

1. **Compact stays primary** at every surface, every screen size, every state.
2. **One disclosure level.** No nested expanders. No mode switchers on user-facing surfaces.
3. **Silent suppression.** Wave-2 tricks render normal layout; absence of the panel is the only signal.
4. **Inheritance annotations are pacing aids, not authority claims.** Brief, hideable on mobile.
5. **Components, not operators.** The render grammar locks `set(+1)` over `stepping(+1)`.
6. **Positional markers get a single caption, never inline +0 rows.**
7. **Component-glossary links are the secondary discovery path.** Phase-1 low-cost.
8. **Curator workbench is internal-only and Phase-2 / deferred.**
9. **Side-by-side comparison is the highest-density teaching pattern.** Glossary §8, not trick pages.
10. **The analysis page (`/freestyle/add-analysis`) is the home for the doctrine-status conversation.** Trick pages stay silent.
11. **Accessibility patterns are constraints, not enhancements.** Phase 1 ships meeting them.
12. **No persisted expand state.** Page reload returns to compact.

---

## Final report — deliverable #6

### Phase-1 surface count

**Two surfaces:**
1. Per-trick expander on `/freestyle/tricks/:slug` pages
2. Component-glossary cross-links from the expander to `/freestyle/glossary` §3 anchors

No new pages, no new nav, no new admin surfaces.

### Phase-2 surface count

**Four surfaces:**
1. Glossary §3 component-page enhancements (per-component ADD context)
2. Glossary §7 symbolic notation accounting subsection (worked examples)
3. Glossary §8 walking-family side-by-side layout (+ modifier-set-collapse callout)
4. `/freestyle/add-analysis` enrichment (derivation rendering + Wave-2 doctrine-status content)

Plus the curator workbench (`/internal/freestyle/accounting-diagnostics`) as a deferred Phase-2 candidate.

### Recommended Phase-1 UI MVP

The smallest shippable Phase-1 surface:

1. The per-trick expander on accounting-eligible tricks (Class A + Class C).
2. Silent suppression for Class B (atom-only ADD ≤ 1) and Class D (Wave-2 / contextual / insufficient data).
3. Component names in the panel link to glossary §3 anchors.
4. The Class-C context caption ("Context: reverse") for tricks with positional / timing markers.
5. Mobile-responsive layout that hides inheritance annotations or relocates them to a secondary disclosure.
6. Keyboard / screen-reader / contrast support.

That's the entire Phase-1 surface. No workbench, no analytics, no side-by-side, no diff view, no composer.

### Mobile-vs-desktop divergence summary

| Element | Desktop | Mobile |
|---|---|---|
| Expander button | Inline link-style, sentence-case | Full-width tap target |
| Component rows | Aligned `+` column, right-aligned annotations | Aligned `+` column, annotations hidden |
| Inheritance annotations | Inline, right-aligned | Hidden in Phase 1; tap-to-reveal in Phase 2 |
| Side-by-side family layout (Phase 2) | Two-column rendering | Stacked single-column with synchronized typography |
| Context caption | Inline above derivation | Same |
| Suppression | Identical (silent) | Identical (silent) |

### Critical UI risks

**Risk U1 — Silent suppression confusion.** Users may not realize derivation exists on some tricks but not others. **Mitigation:** Phase-2 glossary §3 + §7 teach the pattern; users learn it once and recognize it on trick pages. **Reservation:** between Phase-1 ship and Phase-2 ship, the silent-suppression behavior is unexplained. This is acceptable per Decision 2 but should be acknowledged in any user research conducted between phases.

**Risk U2 — Expander discoverability.** The Phase-1 inline link-style button is intentionally low-key. Users who do not click it never see the feature. **Mitigation:** none in Phase 1 by design — the feature is opt-in. **Reservation:** if usage metrics post-Phase-1 show very low expand rates, consider a more prominent affordance in Phase 2.

**Risk U3 — Mobile inheritance-annotation loss.** Hiding annotations on phones removes pedagogical context for the largest device class. **Mitigation:** Phase-2 secondary disclosure restores them on tap.

**Risk U4 — Glossary §3 entries may not exist for all components.** xbody, set, mirage-dex may need glossary entries added before the Phase-1 cross-links work. **Mitigation:** doc-sync skill at implementation time identifies missing entries; curator adds them as part of Phase-1 scope.

**Risk U5 — Curator workbench scope creep.** The diagnostic dashboard mockup includes parser-comparison metrics that go beyond the strict curator-map-vs-editorial check. **Mitigation:** Phase 2 ships only the suppression queue + disagreement count; parser-comparison metrics defer to a later iteration.

### Recommended future-phase experiments

1. **Phase-2 A/B on expander affordance** — does a slightly more prominent button (light background, larger text) increase expand rate without violating the "compact stays primary" principle? Measurable.
2. **Phase-2 glossary §8 side-by-side adoption** — does the modifier-set-collapse callout improve walking-family comprehension? Qualitative user feedback.
3. **Phase-3 component-frequency analytics** — curator-internal dashboard surfacing how often each component appears across the corpus. Defer; only valuable if curator finds Phase-2 surfaces insufficient.
4. **Phase-3 derivation diff view** — when a Red ruling re-resolves a trick, surface before/after. Tiny audience. Defer until curator demand surfaces.

### Progressive-disclosure recommendations (consolidated)

1. Page-level disclosure: compact state default, expander reveals derivation.
2. Component-level disclosure: glossary §3 link reveals component definition. Out-of-page.
3. Doctrine-status disclosure: lives on `/freestyle/add-analysis`, not on trick pages.
4. Inheritance-annotation disclosure: hidden on mobile in Phase 1, restored via secondary disclosure in Phase 2.
5. Curator-diagnostic disclosure: internal-only, Phase 2 / deferred.

### Suppression heuristics (codified UI side)

1. If `wave2_sensitive=true` for any token: no expander rendered.
2. If atom-only with ADD ≤ 1: no expander rendered.
3. If modifier with contextual manifestation present: no expander rendered.
4. If curator-map missing or total disagrees with editorial: no expander rendered + curator diagnostic emitted.
5. If editorial total absent: trick page renders normally; chip absent; no expander.

The default is **suppress**. Rendering requires explicit curator-map presence + agreement.

---

## Cross-references

- `executable_add_accounting_concept.md` — Decision 1 (B → C sequencing), Decision 2 (silent suppression)
- `add_bearing_symbol_inventory.csv` — `wave2_sensitive` column gates panel
- `compressed_atom_expansion_map.md` — D3 expansion grammar; Section 5 (positional handling)
- `wave2_sensitive_accounting_cases.md` — D4 suppression register
- `prototype_accounting_render_examples.md` — D5 render shapes and UX principles
- [[feedback_internal_only_constraint]] — curator workbench placement
- [[feedback_ai_review_tool_availability]] — UI claims requiring browser verification

## Next deliverable

`FINAL_REPORT.md` — synthesis of D1-D6: educational value, doctrine risks, feasibility, parser dependencies, recommended sequencing, MVP recommendation.
