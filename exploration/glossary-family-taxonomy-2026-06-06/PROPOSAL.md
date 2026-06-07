# Glossary Family-Taxonomy Alignment — Rule-First Proposal

Reviewable proposal. **No code or data changed; nothing implemented.**

The 18 first-class families are **already a ratified curator ruling and current dictionary doctrine** — they are enumerated in `src/content/freestylePublicFamilies.ts` (`PUBLIC_DISPLAY_FAMILIES`). This proposal does **not** reopen the taxonomy or re-derive a count. Its job is to (a) make the admission rule explicit so it *justifies* the ratified 18, (b) explain why ATW is excluded, and (c) align the glossary to that baseline. Any change to the count would require a per-item curator argument; this proposal proposes none.

## The ratified baseline — the 18 (source of truth: `freestylePublicFamilies.ts`)

mirage, illusion, butterfly, legover, pickup, whirl, osis, eclipse, drifter, barrage, dada-curve, barfly, dyno, paradon, double-over-down, flurry, flail, butterfly-swirl.

The glossary must mirror **this** set, not the separate 8-parent model it currently uses.

## The admission rule (already stated in `freestylePublicFamilies.ts`; surface it in the glossary)

A first-class family is a **terminal-identity topology family**:
- **Conserved terminal topology** — a structure the trick *lands into*, whose recognizable downside signature descendants preserve even as modifiers stack on the entry ("paradox-whirl still *is* a whirl").
- **More than two active members (≥3)** — the hard count gate; ≤2-member groupings are never first-class roots.

Two things are excluded by *kind*, not by count:
- **Entry-side primitives / operators** — surfaced on the movement-system / glossary-fundamentals layer, not as family roots.
- **Sparse derivative micro-clusters** — low-count direction-reverses or motifs of a parent; a future minor/derived band, not roots.

## The most valuable distinction: five kinds of "family-ish" object

This is what the glossary should teach so the 18 make sense and future cases resolve cleanly.

1. **Family anchor (browsing device).** `?view=family` emits an anchor per `trick_family` value (~28), including atoms, sub-families, micro-clusters. A bucketing affordance, **not** the family roster.
2. **First-class family.** Passes the rule above; the ratified 18.
3. **Sub-family.** Conserved terminal but inherits a *parent's* identity, so it folds under the parent (swirl → whirl; torque/blender/mobius → osis; guay/eggbeater/double-leg-over → legover). Reachable via `?family=`, not a root.
4. **Atom / primitive.** A building block performed *within* tricks — entry, orbit, swing — never a terminal topology (around-the-world, orbit, rake). Lives on the fundamentals layer.
5. **Modifier ecosystem.** Transforms many bases, no terminal of its own (pixie, fairy, ducking, spinning).

(Surfaces — toe-stall, clipper-stall — behave like atoms here.)

## Why the 18 qualify, and why ATW does not

- **The 18 each satisfy both prongs**: a conserved terminal topology + ≥3 productive members. The seven terminal anchors (whirl, mirage, butterfly, legover, osis, illusion, pickup) plus the productive named lineages (eclipse, drifter, barrage, dada-curve, barfly, dyno, paradon, double-over-down, flurry, flail, butterfly-swirl).
- **Drifter is the positive exemplar** of a productive descendant lineage — compositional in origin (a miraging clipper), productive in fact (reverse-drifter, high-plains-drifter inherit its terminal). It is the model of how a lineage *earns* first-class status, and it is correctly in the 18.
- **ATW is the negative pole, on kind not count.** It is an orbit-class entry primitive: foundational and heavily taught, but performed *within* tricks rather than inherited as a terminal topology. Its identity is as an atom on the fundamentals layer, which is exactly why `freestylePublicFamilies.ts` lists it as the canonical exclusion. (Orbit and rake are the same kind.)

## The conflict to fix

The codebase carries **two** family notions, and the glossary is wired to the wrong one:
- `freestylePublicFamilies.ts` — the ratified **18** public families (the dictionary's "By family" roster). **This is the doctrine.**
- `freestyleParentFamilies.ts` — a separate **8-parent** three-tier skeleton (includes ATW as a parent). **The glossary's §families renders this**, and asserts "eight recognized parents … and around-the-world."

So the glossary contradicts the dictionary: it shows an 8-parent model with ATW as a parent, while the dictionary's ratified family doctrine is the 18 with ATW excluded.

## Glossary before/after

**Before (`glossary.hbs` §families):**
- "…the **eight recognized parents** are mirage, illusion, butterfly, legover, pickup, whirl / swirl, osis, **and around-the-world**." (553-556)
- "**All eight recognized parents** are carded here … **and around-the-world** — kept here only for structural bucketing…" (604)
- Cards sourced from the 8-parent model (`rootTerminalFamilies` ← `freestyleParentFamilies.ts`).

**After:**
- §families teaches the **five-kinds distinction** + the **admission rule** (quoting the `freestylePublicFamilies.ts` inclusion principle), so readers understand *why* a lineage is or isn't a family.
- The family cards render the **ratified 18** (`PUBLIC_DISPLAY_FAMILIES`) — the same set as the dictionary's "By family" roster, no independent "eight."
- ATW (and orbit/rake) move to the fundamentals/atoms treatment, framed as entry primitives — matching their intentional exclusion from the 18.
- Drifter kept visible as the worked example of an earned productive lineage.

## Promotion candidates (the only open count question — none proposed here)
The single ≥3-member group with a plausible terminal topology that is **not** in the 18 is **`infinity`** (3 members). It is excluded today. Whether it merits promotion is a per-item curator call with its own argument — this proposal does **not** propose adding it. Everything else outside the 18 is explained by the rule (surface, sub-family fold, atom, ecosystem, or <3 micro-cluster).

## Open flags (before implementation)
1. **Confirm the alignment target** is `freestylePublicFamilies.ts` (the 18) and that the glossary should drop the separate 8-parent model — not reconcile the two.
2. **The `?view=family` anchors (~28) include non-family buckets** (ATW, orbit, micro-clusters) rendered identically (all `style=solid`). The glossary aligning to the 18 will intentionally differ from the raw anchor list; reconciling the view's anchor styling (mark the 18 vs the minor band) is a separate follow-up.
3. **`infinity`** promotion question (above) — defer to curator.

## Implementation touch points (after approval — not done here)
- `glossary.hbs` §families (~548-627): replace the "eight parents" prose with the five-kinds distinction + the admission rule; re-source the cards from `PUBLIC_DISPLAY_FAMILIES`; move ATW/orbit to the atoms/fundamentals treatment.
- `freestyleService.ts`: point the glossary family cards (`rootTerminalFamilies`/`branchFamilies`) at the 18 public-family set rather than the 8-parent model.
- `freestyleParentFamilies.ts`: the 8-parent three-tier skeleton stops driving the glossary (kept only if the family-VIEW fold logic still needs it; otherwise retire ATW's parent treatment).
- Refresh `project_family_taxonomy_doctrine` memory (records the old 8-parent model as the glossary's basis).
