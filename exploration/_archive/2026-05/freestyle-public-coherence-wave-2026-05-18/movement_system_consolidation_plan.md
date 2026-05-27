# Movement System consolidation plan

Phase B planning doc. Supersedes the earlier draft
`movement-system-consolidation.md` (2026-05-18 v1) with concrete
inheritance mapping after the foundational-formula gap survey.

## Current state

`/freestyle/tricks?view=movement-system` projects 11 modifiers across
4 curator-authored axes (`src/content/freestyleMovementSystems.ts`):

| Axis | Modifiers (count) |
|---|---|
| Set / Uptime Systems | pixie, fairy, atomic, stepping, surging (5) |
| Entry Topologies | paradox (1) |
| Midtime Body Modifiers | spinning, ducking, diving, weaving (4) |
| No-Plant & Suspension | symposium (1) |

`/freestyle/tricks?view=component` projects ALL modifier_link slugs
across 2 axes (`body` / `set`). Live-DB modifier_links contain 16
distinct slugs:

  atomic, barraging, blurry, diving, ducking, furious, gyro, nuclear,
  paradox, pixie, quantum, spinning, stepping, symposium, tapping,
  whirling

## Coverage map: Component → Movement System

| Component modifier | In DB? | In Movement System? | Action |
|---|---|---|---|
| pixie | yes | yes (Set/Uptime) | none |
| fairy | no DB links | declared in MS (Set/Uptime); axis prunes if empty | curator: confirm fairy intent |
| atomic | yes | yes (Set/Uptime) | none |
| stepping | yes | yes (Set/Uptime) | none |
| surging | no DB links | declared in MS (Set/Uptime); axis prunes if empty | curator: confirm surging intent |
| paradox | yes | yes (Entry Topologies — solo) | rename axis (paradox-visibility-audit #1) |
| spinning | yes | yes (Midtime Body) | none |
| ducking | yes | yes (Midtime Body) | none |
| diving | yes | yes (Midtime Body) | none |
| weaving | no DB links | declared in MS (Midtime Body); axis prunes if empty | curator: confirm weaving intent |
| symposium | yes | yes (No-Plant & Suspension) | none |
| **barraging** | yes | **NO** | **gap — Wave 2 operator class; defer until Red ruling** |
| **blurry** | yes | **NO** | **gap — Wave 2 transitivity; defer** |
| **furious** | yes | **NO** | **gap — placement decision needed** |
| **gyro** | yes | **NO** | **gap — Midtime Body candidate** |
| **nuclear** | yes | **NO** | **gap — Set/Uptime candidate (compound modifier = paradox + atomic per pt10)** |
| **quantum** | yes | **NO** | **gap — Set/Uptime candidate (compressed atomic per pt10)** |
| **tapping** | yes | **NO** | **gap — placement decision needed** |
| **whirling** | yes | **NO** | **gap — Midtime Body candidate** |

**8 modifiers in DB and Component View are missing from Movement
System axes.** All have curator-confirmable axis placements except
barraging and blurry which are Wave 2-adjacent (touch operator-class
and transitivity questions).

## Safe inheritance plan

### Add immediately (curator-confirmable, no Wave 2 dependency)

1. **gyro** → Midtime Body Modifiers. Half-rotation body modifier;
   parallels spinning (which is full-rotation). Mobius = gyro + torque
   is Red-settled; gyro is doctrinally clear.
2. **whirling** → Midtime Body Modifiers. Body rotation in the dex
   moment; structurally parallel to spinning at a different beat.
   Blender = whirling + osis is Red-implied (per discrepancy DC-06
   wording).
3. **nuclear** → Set / Uptime Systems. Per pt10: nuclear = paradox +
   atomic structurally. The Set/Uptime axis already carries atomic;
   nuclear sits naturally alongside.
4. **quantum** → Set / Uptime Systems. Per pt10: quantum = compressed
   atomic. Already paired with atomic in the operator board.

### Add with curator decision (placement uncertainty)

5. **tapping** → placement uncertain. Not in operator board's tier-1.
   Could be Midtime Body or its own classification. Curator decision
   needed.
6. **furious** → placement uncertain. Used historically (per pt10
   evolution) but largely retired. Curator decision: include with
   note, or omit entirely.

### Defer (Wave 2 blockers)

7. **barraging** → Wave 2 (operator class question — is barraging a
   structural dex-multiplier or a body modifier?). Defer until Red
   Wave 2 reply.
8. **blurry** → Wave 2 (transitivity — does "blurry" decompose into
   "stepping paradox" universally, or only in some compounds?).
   Currently treated as compressed form per pt11; the axis placement
   depends on Wave 2 wording. Defer.

## Proposed 5-axis shape after inheritance

```
1. Set / Uptime Systems (7 modifiers, was 5)
   pixie, fairy, atomic, stepping, surging, nuclear, quantum
2. Entry Topologies (Paradox) (1 modifier — renamed per paradox audit)
   paradox
3. Midtime Body Modifiers (6 modifiers, was 4)
   spinning, ducking, diving, weaving, gyro, whirling
4. No-Plant & Suspension (1 modifier)
   symposium
5. [Pending Wave 2 reply] (3 modifiers deferred — barraging, blurry,
   tapping/furious depending on curator placement)
```

If barraging + blurry land in a clean axis once Wave 2 ships, axis 5
becomes a 5th declared axis. Otherwise the deferred set sits as a
"Pending Wave 2" group rendered with the observational badge.

## Movement System still lacks (gaps after inheritance)

Even after inheritance, three issues remain:

1. **No axis-level introduction**. The observational footer/header
   says "Four canonical axes for navigating the freestyle movement
   language" but doesn't explain why these axes (vs the family /
   category / topology / component cuts). A short axis-rationale block
   would help.
2. **Empty-axis pruning hides intent**. If fairy / surging / weaving
   never get tricks, those axis members render nothing — and the
   pruning logic removes them silently. A "pending entries" footnote
   per axis would make the curator-intended modifiers visible even
   when no tricks currently use them.
3. **No cross-link from axis cards to glossary §3 axis definitions**.
   Users hover an axis name and can't reach the glossary axis-
   vocabulary section directly.

## Files affected (when implementing)

- `src/content/freestyleMovementSystems.ts` — extend MOVEMENT_SYSTEM_AXES
- `src/views/freestyle/tricks.hbs` — render axis-rationale block,
  pending-entries footnote, glossary cross-links
- `src/services/freestyleService.ts` — pass through axis-level fields
- Tests: `tests/integration/freestyle.tricks-insights.routes.test.ts`
  + freestyle.routes.test.ts (movement-system view assertions)

## Dependencies / sequencing

- Coordinates with **observational_layer_proposal.md** (the "Pending
  Wave 2" group rendering).
- Pairs with **paradox_visibility_audit.md** #1 (axis rename to
  "Entry Topologies (Paradox)").
- Component-view retirement (see retirement audit) becomes feasible
  ONCE this inheritance lands.

## Doctrinal safety

- **Safe additions (gyro, whirling, nuclear, quantum)**: each backed
  by Red rulings or pt10/pt11 settlements.
- **Caution (tapping, furious)**: placement uncertainty; curator call.
- **Blocked (barraging, blurry)**: Wave 2 dependencies; no inheritance
  until Red replies.

## Review approval

Approve the inheritance shape + axis assignments per the table above.
Pre-implementation slice will produce a service signature change
proposal + template diff for re-review.
