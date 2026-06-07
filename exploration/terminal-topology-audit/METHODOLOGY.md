# Terminal-Topology Audit — Reproducible Methodology

Read-only analysis. Discovers the major **terminal lineages** of the freestyle vocabulary: which conserved terminal identities generate the largest descendant populations. It does not promote, demote, or modify families; it produces the empirical basis a family system can be explained from.

## Scope (fixed)
Terminal topology only — **how tricks end**. Entry systems, sets, uptime systems, modifiers, and opening topology are explicitly out of scope.

## Source of truth
The trick's own **`operational_notation` (the formula)** is the source of truth for terminal identity. `trick_family` is used ONLY to detect mismatches; it is never trusted as the terminal identity, because it conflates entry labels, mechanic similarity, and curator folds.

Corpus: `freestyle_tricks` where `is_active = 1` (651 tricks; 473 carry `operational_notation`).

## Step 1 — Terminal surface (the catch)
Extract the **last catch-surface token** in the formula. Vocabulary (order matters: `INSIDE`/`OUTSIDE` are matched before `SIDE`):

`clipper-stall, toe-stall, inside-stall, outside-stall, sole-stall, side-stall, heel-stall, knee-stall, head-stall, neck-stall, shoulder-stall, forehead-stall, chest-stall`

Distribution is bimodal: clipper-stall ≈ 54%, toe-stall ≈ 41%, everything else < 3% combined.

## Step 2 — Terminal identity (above the surface)
A trick's terminal identity is the **conserved terminal mechanic** it inherits, if one exists above the bare surface. The rule for whether a surface carries distinct mechanic-families:

- A surface that is **split into multiple distinct terminal mechanics** yields mechanic-families. clipper-stall → whirl / osis / butterfly / swirl / drifter / …; toe-stall → mirage / illusion / legover / pickup / …
- A surface that hosts **only one lineage** is itself the identity (a *terminal-surface family*). inside-stall, sole-stall, outside-stall, heel-stall, knee-stall.

So: identity = the mechanic-family when the surface is shared; identity = the surface when it is not.

## Step 3 — Exclusions (never terminal families)
1. **Entry / set / uptime systems** — pixie, fairy, atomic, quantum, nuclear, stepping, rooted, furious, shooting, sailing, surging, spin, pogo (and the modifier table). They describe how a trick *begins*; they resolve to the trick's actual landing surface. (`pixie mirage` → mirage → toe.)
2. **Entry / orbit / swing atoms** — around-the-world, orbit, rake. A mechanic appearing *inside* a trick does not create membership; these resolve to their landing surface. (`around-the-world` → toe; `double-around-the-world-heel` → heel.)
3. **Surface labels** — clipper, clipper-stall, toe-stall, … . These *are* the surface, not a lineage above it.

## Step 4 — Conserved-identity folds (recursive parent links)
A descendant joins a parent lineage **only when it inherits the parent's terminal identity**, never on mechanic similarity alone. Confirmed identity-preserving folds: torque → osis, blender → osis, mobius → osis, double-leg-over → legover, eggbeater → legover.

Explicitly **rejected** folds (mechanic-based or unverified, so left as their own roots): guay → legover (guay is an inside-stall lineage, not legover); swirl → whirl (different movement); rev-whirl → whirl (not automatic); twirl → swirl (not automatic).

## Step 5 — Recursive descendant count
Each trick contributes to its terminal identity, to every conserved-identity ancestor in its chain, and to its surface — once each (deduplicated). A lineage's recursive count is its full subtree size.

## Step 6 — Family admission (empirical)
`conserved terminal identity + statistical significance = family parent`. The published threshold is **recursive descendants ≥ 3** (the existing ">2 active members" rule, generalized to recursive population). Applied uniformly, with no special cases. Topology determines which *identities* are significant; the parent chosen is always the most stable conserved terminal identity available (prefer the broader surface identity, e.g. inside-stall, over a specific descendant trick, e.g. guay).

## Five-way classification of every `trick_family` value
1. True terminal-mechanic families (distinct ending on clipper/toe).
2. Terminal-surface families (the surface is the identity).
3. Entry/set labels (resolve to surface).
4. Shared-mechanic artifacts / atoms (resolve to surface).
5. Data errors (see `DATA_FIX_CANDIDATES.md`).

## Known limitations (do not over-trust without these)
- **No-notation tricks (178/651):** terminal surface is inferred from the family's dominant surface, not the trick's own formula.
- **Mid-formula stalls:** a `[DEL]` delay mid-trick can be mis-read as the terminal by a last-token extractor when the formula then continues (e.g. `eclipse`: `… SAME/OP INSIDE [DEL] > OP OUT [DEX] > (land)` — the inside is a mid-delay, not the terminal). A robust version should resolve `(land)` and ignore non-final `[DEL]` stalls.
- **The fold hierarchy is partly doctrine.** The vocabulary gives trick → identity → surface cleanly; the identity → parent-identity links (torque → osis, …) are curator-confirmed conserved-identity relationships, not purely emergent.
- **Recursive depth** is therefore bounded by the confirmed fold set.

## Reproducibility
Inputs: `freestyle_tricks(slug, trick_family, operational_notation, is_active)`. Constants: the surface vocabulary (Step 1), the exclusion lists (Step 3), the confirmed fold map (Step 4). The audit script regenerates the surface topology, the `trick_family`↔formula mismatch list, the ranked terminal identities, and the candidate roster deterministically from those inputs.
