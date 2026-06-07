# Family Doctrine vNext — Proposal

**Status: proposal for curator ruling. Read-only. No code, schema, or family doctrine has been changed by this document.** It operationalizes the empirical family doctrine on the corrected terminal-topology foundation and surfaces the decisions that must be made before any implementation.

Companion: `../terminal-topology-audit/METHODOLOGY.md` (how terminal identity is derived) and `DATA_FIX_CANDIDATES.md` (the foundation corrections already applied).

---

## 1. The doctrine being operationalized

A family parent is a terminal lineage that satisfies **both**:

- **A. Conserved terminal identity** — descendants inherit a recognizable terminal identity from the parent (torque → osis, eggbeater → legover). Mechanic similarity alone is insufficient.
- **B. Statistical significance** — the lineage's descendant population exceeds a published, uniform threshold.

Families are not selected by importance, popularity, or history. They **emerge** from observed vocabulary topology. Doctrine's job is to define the admission rule, not to hand-pick the members.

## 2. Foundation corrections already applied

The roster below rests on a corrected foundation (all confirmed this session):

- Terminal identity is read from each trick's **own formula**, never from `trick_family`.
- **Excluded** as never-terminal: entry/set systems (pixie, fairy, atomic, quantum, nuclear, …), entry/orbit atoms (around-the-world, orbit, rake), surface labels, and the `clipper`-kick identity.
- **guay → inside-stall** (a surface-family identity, not legover).
- **swirl is its own root** (not folded into whirl); rev-whirl and twirl are not auto-folded.
- Confirmed conserved-identity folds: torque/blender/mobius → osis; double-leg-over/eggbeater → legover.
- **barfly consolidated** to one 13-member family (the phantom `infinity` lineage removed).

## 3. Proposed threshold

**Recursive descendant population ≥ 3**, applied uniformly to every candidate.

This is the existing ">2 active members" rule, generalized from direct membership to the full recursive subtree. Rationale:

- It is the only threshold consistent with the three-layer doctrine: **every current first-class family clears it, so there are zero demotions.**
- Any higher bar (≥5 demotes 2 current families; ≥10 demotes 8) contradicts the doctrine's Layer 3, which keeps the smaller productive lineages.
- It is objective and reproducible from the documented trick universe.

Two candidates sit exactly at the floor (twirl, mobius, rec 3) and are flagged as borderline below.

## 4. The candidate roster (rec ≥ 3, formula-grounded)

**26 family parents** emerge: the current 18, plus 8 promotions, with **zero demotions**.

### Layer 1 — Core terminal roots (rec ≥ 25, all currently first-class)
| family | rec | direct | surface |
|---|---|---|---|
| osis | 84 | 37 | clipper-stall |
| whirl | 73 | 73 | clipper-stall |
| legover | 71 | 42 | toe-stall |
| mirage | 69 | 67 | toe-stall |
| butterfly | 48 | 48 | clipper-stall |
| illusion | 34 | 34 | toe-stall |
| pickup | 27 | 25 | toe-stall |

### Layer 2 — Derived branches (inherit a root's identity)
| family | rec | direct | parent | status |
|---|---|---|---|---|
| blender | 22 | 22 | osis | **NEW** |
| torque | 22 | 22 | osis | **NEW** |
| double-leg-over | 16 | 16 | legover | **NEW** |
| eggbeater | 13 | 13 | legover | **NEW** |
| mobius | 3 | 3 | osis | **NEW (borderline)** |

### Surface-family roots (the surface is the identity)
| family | rec | direct | status |
|---|---|---|---|
| inside-stall | 10 | 10 | **NEW** (guay's lineage) |

### Layer 3 — Productive lineages (own terminal identity)
| family | rec | direct | status |
|---|---|---|---|
| swirl | 24 | 24 | **NEW** (own root, swirl ≠ whirl) |
| drifter | 14 | 14 | first-class |
| barfly | 13 | 13 | first-class (now with its anchor) |
| double-over-down | 12 | 12 | first-class |
| eclipse | 9 | 9 | first-class |
| flail | 9 | 9 | first-class |
| barrage | 8 | 8 | first-class |
| paradon | 6 | 6 | first-class |
| dyno | 5 | 5 | first-class |
| butterfly-swirl | 5 | 5 | first-class |
| dada-curve | 4 | 4 | first-class |
| flurry | 3 | 3 | first-class |
| twirl | 3 | 3 | **NEW (borderline)** |

## 5. Promotions and demotions

**8 promotions:**
- **Strong (rec ≥ 10):** swirl (24), blender (22), torque (22), double-leg-over (16), eggbeater (13), inside-stall (10).
- **Borderline (rec 3, at the floor):** twirl, mobius.

**0 demotions.** Every current first-class family clears the threshold.

## 6. The decision that gates implementation: flat vs hierarchical

The current system is **flat**: 18 first-class families, and sub-families fold away. Promoting the Layer-2 branches changes the *shape* of the model, because a branch (e.g. torque) is simultaneously a descendant of a root (osis) and a parent of its own descendants. That is a **hierarchical family tree**, not a flat list. Two coherent ways forward:

### Option A — Flat, roots only (smaller change: 18 → 20)
Admit only the new **roots**: **swirl** and **inside-stall**. Leave the branches (torque, blender, double-leg-over, eggbeater, mobius) folded under their parent, as today.
- Keeps the flat model and every existing surface (glossary cards, `?view=family`, trick-detail family chip) unchanged in shape.
- Honest cost: the data plainly shows torque/blender (22 each) are larger lineages than half the current first-class families, and Option A declines to recognize them. It under-describes the topology.

### Option B — Hierarchical, full roster (full change: 18 → 26)
Admit all 8, adopting a two-level tree: roots → branches → leaves; surface-families (inside-stall) as their own roots.
- Faithfully reflects the topology and fulfills "promote more family parents."
- Honest cost: a structural rework. Every flat-family surface must learn to render a parent→branch relationship; `freestylePublicFamilies.ts` becomes a tree (or gains a parent pointer); the glossary §families and `?view=family` need a two-level view.

**This is the single decision the proposal cannot make for you.** Everything else (threshold, roster, stats) is determined by the data once this is chosen.

## 7. Implementation touch-points (once a model is chosen)

- `src/content/freestylePublicFamilies.ts` — the ratified roster (add roots; Option B adds a parent field / nesting).
- `src/content/freestyleGlossaryFamilyCards.ts` — cards for the new families (structural fields derivable; editorial notes are curator-authored).
- `src/views/freestyle/glossary.hbs` §families — the roster + (Option B) the parent→branch view.
- `?view=family` fold logic in `freestyleService.ts` — reconcile with `freestyleParentFamilies.ts`.
- Per-family transparency block (the doctrine's goal): each family page can display recursive descendants, direct descendants, topology rank, landing surface, parent lineage.
- Tests pinning the family roster; `doc-sync` for `VIEW_CATALOG` §families.

## 8. Open decisions for the curator

1. **Adopt the empirical doctrine + threshold (≥3, uniform)?**
2. **Option A (flat, +swirl +inside-stall → 20) or Option B (hierarchical, all 8 → 26)?**
3. **The two borderline promotions** (twirl, mobius, rec 3) — admit under the uniform rule, or hold as documented-not-admitted?
4. **inside-stall** as the promoted parent name (vs. any alternative label for that surface lineage).

## 9. What this proposal does not do

It does not edit `freestylePublicFamilies.ts`, the glossary, or any trick data; it does not reopen the conserved-identity foundation (settled this session); and it does not pick the model for you. On a ruling, implementation can be staged behind the existing reversible-content governance (TypeScript content modules first, SQL formalization only after stabilization).
