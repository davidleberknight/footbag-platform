# Foundational Formula Strategy

Coherence Cleanup Slice — Phase 2 (2026-05-17). Synthesis doc grounded in P1a + P1b audits.

## Problem statement

39 of 55 atoms (71%) render with no formula on any surface. 10 of 11 landing core-trick cards (91%) render SPARSE — just `#slug` + ADD chip. Compounds derived from these atoms typically carry rich chain readings + op-notation. The visual asymmetry inverts pedagogical expectation: the building blocks appear less explained than the things built from them.

## Strategy: progressive layered presence

Different atom classes carry different doctrinal weight. The strategy assigns each class to a presentation tier that matches what's safely authorable today.

### Tier 1 — Mechanically obvious (safe immediate fill)

Surface atoms (stalls + kicks) whose operational notation follows the established sibling pattern.

| Class | Pattern | Status |
|---|---|---|
| Stall atoms | `[set] > <surface>` | 12/14 surface stalls covered after Slice X corrective; 0 remaining safe-immediate |
| Kick atoms | `[set] > <surface> kick` | 2/2 kicks covered after Slice X corrective; 0 remaining safe-immediate |

**Action:** none — Slice X corrective already swept this tier.

### Tier 2 — Service-side editorial readings (safe via curator content modules)

`CORE_TRICK_SPEC.equivalences[]` is intentionally empty for the 11 landing atoms. Populate each with a 1-line **observational** reading drawn from the glossary §2/§3 definitions that already exist. The readings are editorial, not parser-derived, and not doctrinally load-bearing.

Proposed 1-line readings:

| Slug | Proposed reading | Source justification |
|---|---|---|
| clipper-stall | (already has op-notation `[set] > clipper`) | Slice X corrective |
| mirage | dex with cross-body framing | glossary §3 motion-style |
| legover | dex over the supporting leg | glossary §3 |
| pickup | dex catching the bag from below | glossary §3 |
| illusion | dex with mid-flight rotation | glossary §3 |
| whirl | rotational dex | glossary §3 |
| butterfly | rotational dex on a different beat | glossary §3 |
| swirl | reverse-direction whirl | glossary §3 (already in operator reference) |
| osis | dex with double-pass | glossary §3 |
| around-the-world | dex with full bag-orbit | glossary §3 |
| orbit | (not in DB; addPending=true) | defer until row exists |

**Risk:** the proposed readings are observational, not doctrine. They describe what the move IS, not how it's notationally derived. A reader who clicks through expects more depth from the trick-detail page (which has the §3 prose).

**Action:** propose 10 readings to curator; if approved, edit `src/content/freestyleLandingContent.ts` CORE_TRICK_SPEC. Service-side only; no DB writes; reversible.

### Tier 3 — Wave-2 blocked (defer)

Dex atoms surveyed in glossary §3 by name (no op-notation form): `guay`, `refraction`, `reverse-drifter`. These don't appear on the landing surface so don't drive the asymmetry; safe to defer.

Body atoms acting as operators: `spin`, `spyro`, `flying-inside`, `flying-outside`, `double-spin`, `dragonfly-kick`, `hop-over`, `walk-over`, `clipper` (kick variant). These are operator-vs-trick boundary cases pending Wave 2.

Set atoms acting as modifiers: `pogo`, `rooted`, `atomic`, `fairy`, `furious`, `pixie`, `quantum`, `sailing`, `shooting`. Wave 2 territory.

Compound atoms with no base: `surging`, `butterfly`, `eclipse`, `osis`, `dyno`, `paradon`, `ripstein`, `bullwhip`, `jani-walker`. Need curator decomposition before op-notation can be safely authored.

**Action:** defer; track in `[[project_red_consultation_state]]` Wave 2 packet.

### Tier 4 — Cosmetic options (rejected)

Approaches considered and rejected:

- **Render a "foundational atom" badge in place of a missing formula** — preserves silence intent but adds no structural information. Cosmetic-only. Doesn't serve the formula-accountability principle.
- **Replace core-tricks-grid with dictionary-trick-card** — would converge the landing card with the dictionary card, but changes the "silent atom" pedagogical posture; needs maintainer sign-off; potentially destabilizes the landing's compositional identity.

## Card-primitive divergence finding (P1b)

The landing's `core-tricks-grid.hbs` partial diverges from the dictionary's `dictionary-trick-card.hbs`. Tier 2 above fills the equivalences slot but doesn't change the partial — the divergence persists as an intentional design.

If the maintainer wants single-primitive uniformity, that's a separate decision from this strategy doc. Recommended posture: **keep the two partials separate**, populate the landing's equivalences via Tier 2. The two partials serve different surfaces with different visual hierarchies; uniformity isn't the goal — formula presence is.

## Strategy summary table

| Atom class | Tier | Action this slice | Action future |
|---|---|---|---|
| Surface stalls (12) | 1 | — (Slice X done) | — |
| Surface kicks (2) | 1 | — (Slice X done) | — |
| 10 landing dex atoms | 2 | **Propose 10 readings → curator → edit CORE_TRICK_SPEC** | — |
| Other dex atoms (3) | 3 | defer | Wave 2 |
| Body atoms (9) | 3 | defer | Wave 2 |
| Set atoms (9) | 3 | defer | Wave 2 |
| Compound-base atoms (9) | 3 | defer | Curator decomposition |
| Composite surfaces (2) | 3 | defer | Naming decision |

## Implementation cost estimate (Tier 2 only)

- 1 file edit: `src/content/freestyleLandingContent.ts` (~10 lines)
- 0 DB changes
- 0 schema changes
- 0 Wave-2 dependencies
- 1 reversal path: revert the file edit
- Test updates: landing-page tests assert specific text — if readings render in cards, may need spec updates

## Recommended decision sequence

1. Curator reviews proposed 10 readings → approve / amend / reject (per reading)
2. If approved, edit CORE_TRICK_SPEC + run tests
3. If rejected wholesale, keep the silent posture as intentional and acknowledge in this strategy doc as the closure
4. Either way, the Tier 3 deferrals remain Wave-2 blocked
