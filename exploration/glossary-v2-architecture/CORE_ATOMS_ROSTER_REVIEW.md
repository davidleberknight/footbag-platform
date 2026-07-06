# Core Atoms Roster — Pin and Section Readiness

Pins the exact twelve core atoms the glossary teaches, per James's ruling that Toe Stall and
Clipper Stall are included, and reviews whether the core-atoms section is ready for voice
sign-off. Read-only; grounded in the live dictionary. No production glossary content, no UI,
no dictionary-data change, no insight-registry change, no architecture change.

## The twelve (pinned)

**Two stall-anchor atoms** — the resting surfaces a dex leaves from and comes home to:

- Toe Stall
- Clipper Stall

**Ten dex / terminal movement atoms** — the single-dex moves, as four direction-mirror pairs
plus two singletons:

| Pair / atom | Members |
|---|---|
| Around the World / Orbit | same-side full orbit, and its reverse |
| Mirage / Illusion | opposite-side dex to the opposite toe, and its reverse |
| Legover / Pickup | dex to the opposite side caught on the same toe, out and in |
| Whirl / Swirl | dex landing cross-body on the clipper |
| Butterfly | the wing-shaped cross-body clipper atom |
| Osis | the spinning cross-body clipper atom |

Two stall anchors plus ten dex atoms is the twelve. Both members of each mirror pair count
separately, because reversing a dex makes a different trick (direction is structural).

## This is NOT the database `is_core` flag — do not conflate them

The dictionary has an `is_core` column, and it flags **thirteen** rows, a different set built
for a different job (it marks irreducible trick primitives, and it gates a rendering
fallback). It is not the teaching twelve:

| | In the teaching twelve | In DB `is_core` (13) |
|---|---|---|
| Toe Stall, Clipper Stall | yes | no |
| Orbit | yes | no (only Around the World is flagged) |
| Around the World, Mirage, Illusion, Legover, Pickup, Whirl, Swirl, Butterfly, Osis | yes | yes |
| Clipper (the bare atom), Guay, Pixie, Fairy | no | yes |

So the two rosters diverge on five items. The glossary's twelve is a **teaching / closure
roster** — the small alphabet the vocabulary decomposes to, chosen for pedagogy: it folds in
the two anchor stalls and both directions of each pair, and it leaves out the set primitives
(pixie, fairy), the minor dex guay, and the bare clipper atom, which are taught in the
operator and surface layers instead. A glossary surface must read this doctrine roster, **not**
the `is_core` flag, when it says "the twelve."

## How the glossary should phrase it (so it does not mislead)

The failure modes to avoid are "twelve dex tricks" and "the top twelve families." The twelve
is neither: it is the small, fixed **alphabet** the whole vocabulary is spelled from — a mix
of two resting stalls and ten single-dex movement atoms — the irreducible set everything else
decomposes into, not a ranking of the best or most-performed tricks and not a count of
dex-only moves. The already-authored Core Atoms Core Concept entry phrases it exactly this
way ("the closure set of the vocabulary … not a ranking of the best or most-performed
tricks … the two resting stalls and the single-dex atoms that reach them"), so **that entry
needs no revision** — this note confirms its roster and its framing.

## Two reconciliations to flag (not changed here)

1. **The dependency-graph label.** The private dependency-graph design note labels its dex-atom
   row "the irreducible twelve" but lists ten, with the stalls sitting a layer above. With the
   twelve now pinned to include the stalls, that label miscounts; recommend it be reconciled to
   "ten dex atoms; the two stalls complete the twelve." Left unedited — it is a private design
   tool and a cosmetic label, not a breaking contradiction.
2. **The `is_core` asymmetry** (Around the World flagged, Orbit not) is pre-existing dictionary
   data and out of scope here; noted only so no one reads `is_core` as the teaching roster.

## Section readiness for voice sign-off

The core-atoms section renders the twelve. Entry status:

| Atom | Status |
|---|---|
| Toe Stall | READY (add the one-clause non-stalling exception noted in the voice packet) |
| Clipper Stall | READY |
| Around the World | READY (now connective after the Reveal demotion) |
| Orbit | READY (now connective after the Reveal demotion) |
| Mirage | READY |
| Illusion | READY (now connective after the Reveal demotion) |
| Legover | READY (drafted this pass) |
| Pickup | READY (drafted this pass) |
| Butterfly | READY |
| Osis | READY |
| Whirl | HELD |
| Swirl | HELD |

**Ten of the twelve are ready; two are held.** Whirl and Swirl remain held because their
entries still carry Reveals tied to the surface-frame axis, whose public prose is parked on
the unresolved reverse-swirl notation check. So the section is **not yet fully sign-off-ready
as authored** — it is sign-off-ready for ten atoms, and clears entirely once one of two things
happens:

- you rule that Whirl and Swirl ship in **connective** form now (Line + Relates, their
  surface-frame Reveals deferred exactly as Around the World's was), which unblocks the section
  without touching the parked notation question; or
- the reverse-swirl check is settled and their held Reveals are finalized.

Recommendation: the first option is the clean unblock — it is the same demotion already applied
to the other primitives and does not touch reverse-swirl. With that, the full twelve-atom
section is ready for your sign-off and to be the first production slice.

## Impacts

- **Insight registry:** no change. Legover and Pickup are connective; the roster pin only
  enumerates row 4's existing "twelve," it does not add or reword an insight. Count stays at
  eleven.
- **Architecture:** no change made. One cosmetic dependency-graph label flagged above for a
  later, separate reconciliation.
