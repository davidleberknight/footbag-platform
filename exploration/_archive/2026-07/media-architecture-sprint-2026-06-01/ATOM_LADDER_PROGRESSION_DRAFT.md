# Atom-Ladder Progression — flagship draft (2026-06-01)

The concrete first artifact promised by `PROGRESSION_MODELING_MEMO.md`: one hand-authored flagship
progression (the core-atom learning path) **plus** its live coverage-gap readout. This is
curator-authored reversible content — an ordered slug list with a teaching narrative. It is **not**
a generator, **not** new ontology edges, **not** schema, and **not** wired to rendering (that is the
deferred UI slice). Media for each node is whatever direct coverage exists at render time.

## Firewall (restated, load-bearing)

- A progression asserts a **teaching order**, never a structural one. It does NOT claim node B
  "contains" node A (that is decomposition / ontology), and it does NOT assert difficulty as fact.
- Ordering is a **curator judgment**, not derived from ADD. Where it happens to track ADD (below), that
  alignment is coincidental and must be presented as such — the surface must visibly distinguish
  "learn order" from "ADD order" so it never reads as a structure/difficulty claim.
- It reads from the dictionary (which atoms exist, their family/ADD), the media graph (node clips), and
  the glossary (concept-media entry framing). It writes back to none of them.

## Entry node (frame, not a step)

| Node | Tag | Live coverage | Role |
|---|---|---|---|
| **How to learn freestyle** | `#concept_learning` | 1 clip ✓ | The *frame* of the ladder — tells a learner how to use the path. Per the memo, a concept video is the entry, not a rung. |

## The flagship ladder (ordered)

Each rung is a core atom (`[[project_freestyle_core_atoms]]`). "Learn rationale" is the teaching
narrative the progression owns. "Direct coverage" is live as of 2026-06-01 (`24_qc` / DB);
T = tutorial-tier clip, R = record-tier.

| # | Slug | Name | ADD | Learn rationale | Direct coverage | Gap? |
|---|---|---|---|---|---|---|
| 0a | `toe-stall` | Toe Stall | 1 | The foundational delay — every line starts from a stall. | 3T (tt, anz, basics) | strong |
| 0b | `inside-stall` | Inside Stall | 1 | Second stall surface; opens the inside line. | 3T (tt, anz, basics) | strong |
| 0c | `clipper-stall` | Clipper | 2 | Cross-body stall; the gateway surface for most dex tricks. | 2T (tt, basics) + 2R | strong |
| 1 | `around-the-world` | Around the World | 2 | First circular path around the planted leg — the core leg-circle motor pattern. | 3T (tt×2, basics) + 1R | strong |
| 2 | `orbit` | Orbit | 2 | Extends the ATW circle into a continuous/controlled orbit — same motor pattern, more control. | **1T (basics only)** | **THIN** |
| 3 | `mirage` | Mirage | 2 | First deception: an inside→outside switch; introduces dex direction change. | 3T (tt, anz, basics) + 1R | strong |
| 4 | `illusion` | Illusion | 2 | The mirage's mirror partner — completes the deception pair. | 2T (anz, basics) | strong |
| 5 | `butterfly` | Butterfly | 3 | First iconic cross-body 3-ADD; composes stall + dex into the signature move. | 2T (tt, basics) + 1R | strong |
| 6 | `whirl` | Whirl | 3 | Capstone: a continuous rotational atom — the gateway into spinning vocabulary. | 2T (tt, anz) + 1R | strong |

## Coverage-gap readout (the progression doubling as a priority map)

This is the highest-leverage *pedagogical* use of the coverage data — a progression makes the thin
nodes visible as a teaching-priority list, independent of raw per-trick counts.

- **`orbit` is the single weak rung.** Its only clip is the `passback_basics` tutorial promoted
  2026-06-01; there is no canonical TT-grade lesson and no demonstration clip. Highest-priority
  acquisition target for this ladder: a dedicated orbit tutorial (TT/AnzTrikz-grade) and/or a clean
  demo. (Before 2026-06-01 orbit had **zero** coverage, so the Basics promotion already lifted it off
  the floor — but one clip on a foundational rung is still thin.)
- Every other rung has ≥2 tutorial-tier clips — no acquisition action needed.
- The `#concept_learning` entry frame has 1 clip — adequate as a single framing video; a second is not
  a priority.

## Entry rung — RULED (A, 2026-06-01)

The memo's illustrative sequence starts at `toe-stall` and jumps straight to `around-the-world`. The
ladder above instead prepends a **stall rung (0a–0c: toe → inside → clipper)**. Ruling **A**: keep the
stall rung. It is the honest teaching entry — a learner does the stalls before any dex trick — and it
is fully coverage-backed (all three stalls carry Basics tutorials promoted 2026-05/06-01). The
rejected alternative was the memo-literal 7-node ladder (`toe-stall → ATW → … → whirl`), which treated
the other stalls as assumed prerequisites outside the ladder; tighter, but it hides the real entry.
The memo's sequence was illustrative, so refining it here is in-bounds curator authoring. Everything
else in the draft is settled by the memo + live coverage.

## Proposed content-module shape (NOT yet wired)

When the UI slice lands — and after the `exemplar_of` flag exists (the memo gates node-clip selection
on "preferring the `exemplar_of` clip") — this lifts into `src/content/` as a reversible TS list. Shape
only, for review; do not add to `src/` until rendering + `exemplar_of` are in:

```ts
// Curator-authored teaching order. NOT a structural or difficulty claim.
export interface ProgressionNode {
  slug: string;        // resolves to freestyle_tricks.slug (read-only)
  rationale: string;   // the teaching narrative this layer owns
}
export interface Progression {
  id: string;
  title: string;
  conceptTag: string;  // entry frame, e.g. '#concept_learning' (not a node)
  nodes: ProgressionNode[];
  // media + ADD resolved per node at render time; never stored here.
}

export const ATOM_LADDER: Progression = {
  id: 'atom-ladder',
  title: 'Core Atom Ladder',
  conceptTag: '#concept_learning',
  nodes: [
    { slug: 'toe-stall',        rationale: 'The foundational delay — every line starts from a stall.' },
    { slug: 'inside-stall',     rationale: 'Second stall surface; opens the inside line.' },
    { slug: 'clipper-stall',    rationale: 'Cross-body stall; gateway surface for most dex tricks.' },
    { slug: 'around-the-world', rationale: 'First circular path around the planted leg.' },
    { slug: 'orbit',            rationale: 'Extends the ATW circle into a controlled orbit.' },
    { slug: 'mirage',           rationale: 'First deception: inside→outside switch; introduces dex direction change.' },
    { slug: 'illusion',         rationale: "The mirage's mirror partner; completes the deception pair." },
    { slug: 'butterfly',        rationale: 'First iconic cross-body 3-ADD; stall + dex composed.' },
    { slug: 'whirl',            rationale: 'Capstone rotational atom; gateway into spinning vocabulary.' },
  ],
};
```

## Out of scope / deferred (do not build here)

- **Rendering** — the gallery "Learning progressions" node + any trick-detail/family cross-link. UI slice.
- **`exemplar_of`** — node-clip selection prefers it; until it lands, render falls back to any direct
  tutorial. Authoring the list does not depend on it; *rendering quality* does.
- **`progression_for` edge** — reserved semantic vocabulary, not built.
- **Set-acquisition + family-expansion progressions** — the memo's other two shapes; one flagship
  first, by design.
- **No generator.** Ordering is a teaching judgment, authored by hand, forever.
