# Nav Prototype 3 — Modifier Ladder

**Spec only.** No template changes.

## Purpose

Visualize the progression of compounds within a modifier family, ordered by ADD value. Educational discovery: "How does spinning compose with bases to produce 3-ADD, 4-ADD, 5-ADD, 6-ADD, 7-ADD compounds?"

## UX sketch

Page at `/freestyle/modifier/:slug/ladder`:

```
Spinning modifier ladder
─────────────────────────────────────────────────────────
  3-ADD  spin (modifier-stub; hidden)
                                                         
  4-ADD  spinning-whirl       (whirl)
         spinning-osis        (osis)
         spinning-clipper     (clipper)
                                                         
  5-ADD  spinning-torque      (torque = miraging-osis)
         spinning-paradox-w   (whirl + paradox)
         spinning-symposium-w (whirl + symposium)
         spinning-ducking-w   (whirl + ducking)
         spender              (drifter + paradox)
                                                         
  6-ADD  paradox-symposium-w  (whirl + paradox + sym)
         spinning-stepping-w  (multi-mod)
         spinning-blender     (blender = whirling-osis)
                                                         
  7-ADD  montage              (whirl + paradox + sym + duck)
         spinning-mullet      (multi-mod)
```

## Data sources

- `symbolic_modifier_groups.csv` — group definition
- `symbolic_group_membership.csv` — modifier membership
- `freestyle_tricks` — adds value (authoritative source for sort)
- `freestyle_trick_modifier_links` — to identify multi-modifier compounds for parenthetical hint

## URL pattern

- `/freestyle/modifier/:slug/ladder` (companion view to the modifier list above)

## Filter behavior

- Vertical stacking by ADD value (ascending)
- Within each ADD tier: alphabetical
- Compound modifier-stack noted in parenthetical: `(base + modifier1 + modifier2)`
- Pilot tier members rendered as links; non-pilot as plain text
- Modifier-stub rows hidden

## Educational angle

The ladder makes visible the "modifier-bridge" cohort growth across SCALE batches — readers see how a modifier composes onto increasingly complex bases as you climb. Cross-references SCALE pilot data without requiring memory awareness.

## Effort estimate

- Service method extension: `getTricksByModifier(slug, group_by_adds=True)` — +20 lines on top of nav-2 method
- Template: ~80 lines (column layout)
- Tests: 4-6 specific ladder-ordering tests
- Total: ~half-day on top of nav-2 (shares service)

## Constraint check

- No DB schema change
- No canonical mutation
- Reuses nav-2's data path
