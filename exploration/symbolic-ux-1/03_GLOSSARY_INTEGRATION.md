# SUX-1 Task C — Glossary Integration Concepts

How glossary term pages surface symbolic-grammar context. Builds atop GLOSSARY-SYNTHESIS-1's `GLOSSARY_ARCHITECTURE_V4.md` 4-layer design.

**Date:** 2026-05-12

---

## Frame

The v4 architecture proposes 4 layers (canonical / educational / symbolic / operational) with up to 5 attribute sections per entry (canonical_definition / passback_explanation / symbolic_interpretation / operational_usage / related_terms). This document specifies HOW symbolic context renders on glossary pages.

Three integration patterns:
1. **Inline symbolic interpretation** — Layer 3 prose alongside canonical + educational layers
2. **Related-tricks panel** — list pilot tricks where this term applies
3. **Notation + operator panels** — operational examples + glossary cross-links

---

## Integration pattern 1 — multi-layer entry view

### Mockup — `/freestyle/glossary/spinning`

```
┌────────────────────────────────────────────────────────────────┐
│ Spinning                                                        │
│ [modifier]  [rotation]  [+1 ADD flat per pt10]                  │
├────────────────────────────────────────────────────────────────┤
│ ╭ CANONICAL (IFPA) ────────────────────────────────────────╮ │
│ │ Rotation modifier adding +1 ADD (flat per pt10 Red       │ │
│ │ ruling; previously +2 on rotational base; flattened in   │ │
│ │ pt10).                                                    │ │
│ │   Source: IFPA glossary v2 + modifier table              │ │
│ ╰────────────────────────────────────────────────────────────╯ │
│                                                                 │
│ ╭ EDUCATIONAL (PassBack) ─────────────────────────────────╮ │
│ │ Spins are performed by rotating the entire body to       │ │
│ │ various degrees. Gyro = 180°; Spinning = 360°. The two   │ │
│ │ terms combine for arbitrary degrees (Spinning Gyro =     │ │
│ │ 540°, Double Spinning = 720°). Default is backspin;       │ │
│ │ Inspin = chest passes the bag first.                     │ │
│ │   Source: PassBack glossary                              │ │
│ ╰────────────────────────────────────────────────────────────╯ │
│                                                                 │
│ ╭ SYMBOLIC GRAMMAR (observational) ──────────────────────╮ │
│ │ Group: spinning-family (modifier axis)                   │ │
│ │ 13+ pilot rows; cuts across whirl / osis / torque /      │ │
│ │ butterfly / clipper / drifter / blender bases.           │ │
│ │ Composition rule: spinning + base = +1 ADD               │ │
│ │ regardless of base family.                                │ │
│ ╰────────────────────────────────────────────────────────────╯ │
│                                                                 │
│ ╭ OPERATIONAL NOTATION ──────────────────────────────────╮ │
│ │ Component flag (BOD) on spin beat; pre-state (back)      │ │
│ │ or (front) orients rotation. Example:                    │ │
│ │   Toe > (back) Spin (BOD) >> Op In (DEX) > Op Toe (DEL) │ │
│ ╰────────────────────────────────────────────────────────────╯ │
│                                                                 │
│ Used in these tricks (15 pilots)                               │
│   spinning-whirl(4) spinning-osis(4) spinning-torque(5)        │
│   spender(6) montage(7) surge(5) surgery(6) surreal(6) ...     │
│                                                                 │
│ Related glossary terms                                         │
│   → gyro (educational_pair; rotational degree)                  │
│   → inspinning (educational_pair; rotational direction)         │
│   → paradox (related_to; both body modifiers)                   │
│   → whirl (modifier_of; spinning + whirl = spinning-whirl)      │
│                                                                 │
│ Related operators (operational notation)                        │
│   (BOD) component flag — body action on rotational beat        │
│   (back) / (front) pre-state — rotation direction              │
└────────────────────────────────────────────────────────────────┘
```

---

## Integration pattern 2 — related-tricks panel rendering

### Mockup — bottom of `/freestyle/glossary/symposium`

```
┌────────────────────────────────────────────────────────────────┐
│ Used in these tricks (9 pilots)                                 │
├────────────────────────────────────────────────────────────────┤
│ symposium-whirl              4   single-modifier on whirl       │
│ symposium-mirage             3   single-modifier on mirage      │
│ matador                      5   nuclear + symposium-implicit   │
│ phoenix                      5   pixie + ducking + symposium    │
│ mullet                       6   paradox + symposium + ducking  │
│ montage                      7   5-modifier flagship             │
│ superfly                     5   symposium + barfly             │
│ spinal-tap                   5   spinning + tapping + symposium │
│                                                                 │
│ Related: symple (foot returns midway), muted (no plant at all)  │
└────────────────────────────────────────────────────────────────┘
```

**Render rules:**
- Sorted by ADD ascending
- Pilot rows render as clickable badges; non-pilot as name-only
- Multi-modifier composition shown in parenthetical context

---

## Integration pattern 3 — "common confusions" surfacing

Some terms have known confusion patterns documented in the glossary v4 drafts. v4 renders these explicitly.

### Mockup — `/freestyle/glossary/paradox` (common confusions section)

```
┌────────────────────────────────────────────────────────────────┐
│ Common confusions                                               │
├────────────────────────────────────────────────────────────────┤
│ Paradox vs X-Dex:                                              │
│   Both involve hip pivots between dexes. Paradox applies to   │
│   clipper-set tricks (XBD-prefix); X-Dex applies to toe-set    │
│   tricks. Pt1: X-Dex is narrow (specific named tricks only).   │
│                                                                 │
│ "Clipper Far X" vs "Pdx X":                                    │
│   Same compound; "Pdx X" is the canonical shortening.          │
│                                                                 │
│ Paradox modifier vs Pdx pre-state:                             │
│   Operational notation may use both forms; modifier-table      │
│   uses "paradox"; notation tokens use "PDX".                   │
└────────────────────────────────────────────────────────────────┘
```

**Source for common-confusions sections:** the 17 GLOSSARY_SYNTHESIS_DRAFTS.md drafts each carry a "Common misunderstandings" subsection — promote directly into v4 rendering.

---

## Integration pattern 4 — notation example block

For terms with operational-notation counterparts.

### Mockup — `/freestyle/glossary/ducking` (operational example)

```
┌────────────────────────────────────────────────────────────────┐
│ Operational notation examples                                   │
├────────────────────────────────────────────────────────────────┤
│ Component flag (BOD) marks the duck beat. Pre-state (back)     │
│ or (front) orients duck direction.                             │
│                                                                 │
│ Sample notations from FM corpus:                                │
│                                                                 │
│   Toe > Same In (DEX) >> Duck (BOD) >> Op In (DEX) > Op Toe   │
│         (DEL)        — Assassin (Pixie Ducking Mirage)         │
│                                                                 │
│   Clip >> Op Front Whirl (DEX) > (back) Spin (BOD) > Op Clip  │
│          (XBD)(DEL)     — Blister (Ducking + Spinning + Whirl)│
│                                                                 │
│ Note: this is FM-corpus operational notation (observational).  │
│ IFPA-canonical execution may differ; see trick-detail pages    │
│ for canonical readings.                                        │
└────────────────────────────────────────────────────────────────┘
```

---

## Integration pattern 5 — related modifiers panel

For modifier terms specifically.

### Mockup — `/freestyle/glossary/pixie` (related modifiers panel)

```
┌────────────────────────────────────────────────────────────────┐
│ Related modifiers                                               │
├────────────────────────────────────────────────────────────────┤
│ Sibling +1-universal set modifiers:                            │
│   fairy        — sibling +1 set modifier; distinct mechanic    │
│   quantum      — sibling +1 set modifier; +1 universal pt10    │
│                                                                 │
│ Related (different ADD class):                                 │
│   atomic       — set primitive; +1 non-rotational / +2 rot    │
│   nuclear      — +2 universal; structurally paradox + atomic  │
│   furious      — set primitive parallel to atomic              │
│                                                                 │
│ Often paired with:                                             │
│   ducking      — pixie + ducking = phoenix on butterfly base   │
│   stepping     — pixie + stepping cohort                       │
│   diving       — pixie + diving (smaller cohort)               │
│                                                                 │
│ Naming-equivalent pairings (per IFPA + PassBack):              │
│   pixie + mirage = smear                                        │
│   pixie + butterfly = dimwalk                                  │
│   pixie + pickup = paste                                        │
│   pixie + eggbeater = pigbeater                                │
│   pixie + illusion = smudge                                    │
│   pixie + ss legover = Magellan                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Glossary-page navigation strategy

Three entry points to the glossary system:

### Strategy 1 — Alphabetical browse
URL: `/freestyle/glossary` with A-Z index
Filters: layer (canonical/educational/symbolic/operational) × axis (concept/modifier/trick/stall/notation/execution/stance/ADD) × confidence

### Strategy 2 — Concept-driven entry pages
URL: `/freestyle/glossary/:term_slug`
Multi-layer entry with all 5 attribute sections

### Strategy 3 — Symbolic-group entry pages
URL: `/freestyle/glossary/group/:symbolic_group_id`
Shows the group's definition + all member tricks + member modifiers + cross-references

---

## Cross-references

- `GLOSSARY_ARCHITECTURE_V4.md` — 4-layer architecture spec
- `GLOSSARY_SYNTHESIS_DRAFTS.md` — 17 best-of drafts with full 5-attribute coverage
- `SYMBOLIC_GLOSSARY_LINKS.csv` — symbolic-group ↔ glossary-term ↔ trick-membership
- `GLOSSARY_RELATIONSHIP_GRAPH.csv` — 102 term-to-term relationships
- `EVALUATION_AND_RECOMMENDATION.md` — usefulness assessment for glossary integration patterns
