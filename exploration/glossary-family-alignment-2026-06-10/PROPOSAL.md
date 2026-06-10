# `?view=family` → 24-family doctrine alignment — before/after proposal

Read-only audit + implementation proposal. No code changed yet. Produced per the
legacy_data IP requirement ("a reviewable before/after proposal before any
implementation") for the URGENT glossary family-taxonomy alignment item.

## Goal

Make the public **By family** browse (`/freestyle/tricks?view=family`) render the
settled 24-family doctrine, so the glossary roster, the landing browse-card chips,
and the browse page itself all present ONE family system. Chosen render model
(curator-selected): **mirror the glossary exactly** — the 20 roots as ordered
top-level sections, the 4 first-class branches as labeled sub-sections under their
parent root, sub-bar labels folded under their nearest root, and the raw-label tail
suppressed.

## Source of truth

`src/content/freestylePublicFamilies.ts` → `PUBLIC_DISPLAY_FAMILIES` = the 24-family
doctrine. 20 roots (no `parent`) + 4 first-class branches (`parent` set):

- **Roots (20, render order):** mirage, illusion, butterfly, legover, pickup, whirl,
  osis, eclipse, drifter, barrage, dada-curve, barfly, dyno, paradon,
  double-over-down, flurry, flail, butterfly-swirl, swirl, inside-stall.
- **Branches (4):** torque (osis), blender (osis), double-leg-over (legover),
  eggbeater (legover).

### Membership rule (baked in — derive every disposition from this, NOT from the stale fold map)

A **family** is a terminal *ending topology* that satisfies BOTH bounds, applied
uniformly:

- **Floor:** ≥3 recursive descendants that conserve that ending topology. Too few →
  not a family. Excludes `rev-whirl`, `twirl`, `around-the-world`/`atw`, `orbit`.
- **Ceiling:** not a universal catch surface. Too many descendants (everything ends
  there, so the grouping teaches nothing) → not a family. Excludes `toe-stall`,
  `clipper-stall`.

Fold rule for sub-labels: a label that itself fails the floor but **conserves a
24-family's terminal identity** folds under that family. The conserved terminal is
usually the terminal token in the name (`paradox-mirage` → mirage; `double-pickup` →
pickup), but some are curator knowledge not visible in the slug (`mobius` → torque;
`guay` → inside-stall). A label that conserves no family terminal and clears neither
bound is **not in a family** and does not render in the browse at all.

All 24 clear the floor in the live `trick_family` counts (smallest: flurry 3,
dada-curve 4) and none is a catch surface.

## Finding: the divergence has moved out of the glossary

The IP entry describes the glossary as presenting an independent 8-parent model with
ATW as a parent. That is **stale** — the glossary prose, first-class roster, and
cards are already on the 24-family model. The lagging surface is the `?view=family`
browse in `freestyleService.ts`, which still buckets on the retired 8-parent skeleton
(`freestyleParentFamilies.ts`).

| Surface | Source today | Aligned? |
|---|---|---|
| Glossary §families prose | ≥3 rule; ATW = entry primitive; torque/blender/eggbeater branches | yes |
| Glossary first-class roster (text) | `PUBLIC_DISPLAY_FAMILIES` (24) | yes |
| Glossary family cards | `ROOT_TERMINAL_FAMILIES` + `BRANCH_FAMILIES` (27 = 24 + rev-whirl/blur/phoenix as flagged non-first-class sub-cards) | yes |
| Landing "By family" browse-card chips | `PUBLIC_DISPLAY_FAMILIES` (24) | yes |
| **`?view=family` browse page** | **`PARENT_FAMILY_ORDER` (8) + `resolveParentFamily` fold + `RETIRED_FAMILIES`** | **NO** |

### Concrete contradictions on `?view=family` today

1. **`inside-stall` is in `RETIRED_FAMILIES`** (`freestyleFamilyOverrides.ts:191`) —
   suppressed from the browse — yet it is a doctrine root (18 members) and a landing
   chip. Clicking the chip works (`?family=inside-stall` is a raw filter) but the
   family never appears as a section in the browse.
2. **`swirl` is folded into whirl** (`PARENT_FAMILY_OF_LABEL`) — yet it is a doctrine
   root (35 members).
3. **`torque`, `blender`, `double-leg-over`, `eggbeater` are invisibly folded** into
   osis/legover — yet they are first-class branches the glossary shows as their own
   labeled cards.
4. **`around-the-world` is one of the 8 ordered parents** — yet it is excluded from
   the doctrine as an entry primitive.
5. **Two now-false public statements:**
   - Glossary (glossary.hbs ~650-652): "the glossary roster and the dictionary
     roster always match." They don't.
   - Landing topology card (freestyleService.ts ~7615): "Compare to By family for
     the official grouping." Points at the un-aligned fold.

## Target spec (mirror the glossary)

A row appears in `?view=family` ONLY if its resolved family is one of the 24 (root or
branch). Top-level sections = the 20 roots in `PUBLIC_DISPLAY_FAMILIES` order; the 4
branches render as labeled sub-sections under their parent root (using the existing
`parent` field). Everything else folds to a root or is absent.

### Fold map (sub-label → 24-family it conserves the terminal of)

Derived from the membership rule. "Stale map" = the current value in
`PARENT_FAMILY_OF_LABEL` / `FAMILY_OVERRIDES`, several of which are wrong.

| Sub-label | Folds to | Stale map | Basis | Status |
|---|---|---|---|---|
| whirling-swirl | **swirl** | whirl | conserves swirl terminal | curator-confirmed; was wrong |
| mobius | **torque** | osis | curator knowledge (mobius is a torque member) | curator-confirmed; was wrong |
| guay | **inside-stall** | legover | curator knowledge | curator-confirmed; was wrong |
| double-pickup | pickup | pickup | conserves pickup terminal | derived — confirm |
| paradox-mirage | mirage | mirage | conserves mirage terminal | derived — confirm |
| paradox-illusion | **illusion** | mirage | conserves illusion terminal | derived; likely was wrong — confirm |
| reverse-drifter | drifter | drifter | conserves drifter terminal | derived — confirm |
| high-plains-drifter | drifter | drifter | conserves drifter terminal | derived — confirm |

Promotions / structural (not folds):

| Label | Disposition | Stale map | Change |
|---|---|---|---|
| swirl | **root** (own top-level family) | folded → whirl | REMOVE fold; promote to root |
| inside-stall | **root** | in `RETIRED_FAMILIES` | REMOVE from retired; promote to root |
| torque / blender | **visible branch under osis** | folded invisibly → osis | render as labeled sub-section |
| double-leg-over / eggbeater | **visible branch under legover** | folded invisibly → legover | render as labeled sub-section |

### Not a family — absent from the browse (reachable only via `?family={slug}`)

- **Floor failures (too few descendants):** `rev-whirl` (ERROR — currently mis-folded
  into whirl; remove that fold), `twirl`, `around-the-world` (+ `around-the-world-kick`,
  `double-around-the-world`, `atw`), `orbit`. Add `around-the-world` to the route-out
  set; remove it from the ordered roster (it is currently one of the wrong 8 parents).
- **Ceiling failures (catch surfaces, too many descendants):** `clipper-stall`,
  `toe-stall`, `clipper`, and all `*-stall` / `*-clipper` / `*-kick` surface labels —
  already in `RETIRED_FAMILIES`. Keep.
- **Modifier ecosystems / folk singletons / `(null)`:** blizzard, plasma, dragon,
  furious, quantum, atomic, sailing, spyro, terrage, jani-walker, hop-over, surging,
  spin, double-spin, superfly, pixie, fairy, rake, etc. — not families → absent.
- **DOD cohort (`dod`, `down-double-down`):** doctrine-blocked (pending the DOD/DDD
  Red ruling). Recommend: leave absent until that ruling lands.

## File-by-file before/after

1. **`src/services/freestyleService.ts` — the bucketing (~6855-6964).**
   - `FAMILY_ORDER = PARENT_FAMILY_ORDER` → drive top-level order from
     `PUBLIC_DISPLAY_FAMILIES` roots (the 20, in list order).
   - Replace `resolveParentFamily(...)` calls (lines 5852, 6890, 6895) with a fold
     resolver backed by the corrected map above (roots resolve to self; branches
     resolve to self but carry a `parent` for nested rendering; sub-bar labels fold
     to root; non-24 labels resolve to a sentinel that is skipped).
   - Render the 4 branches as labeled sub-sections under their parent root.
   - Display-name resolution (lines 5974, 6407, 6950): drop `PARENT_FAMILY_DISPLAY`
     ("Whirl / Swirl") since whirl and swirl are now separate roots; fall back to
     `resolveFamilyDisplayName` + capitalize.
   - `familyBrowseHref` (line 6407): a swirl trick's family chip now links to
     `#family-swirl`, not `#family-whirl` (correct under the 24-model).

2. **`src/content/freestyleFamilyOverrides.ts`.**
   - `RETIRED_FAMILIES`: remove `inside-stall`; add `around-the-world`.
   - Comment at line 153 ("only the 8 canonical parent families plus") → rewrite.

3. **`src/content/freestyleParentFamilies.ts` — retire.**
   - The 8-parent module is superseded. Remove it (and its imports in the service),
     OR repurpose the file to a thin fold map keyed off `PUBLIC_DISPLAY_FAMILIES`.
     Recommended: retire the module; encode the corrected fold map (the table above)
     where it belongs (alongside the public-family content). Several existing entries
     are wrong and must be fixed in the move, not copied: whirling-swirl (whirl→swirl),
     mobius (osis→torque), guay (legover→inside-stall), paradox-illusion (mirage→illusion),
     and the erroneous rev-whirl→whirl fold (drop it entirely).

4. **`src/content/freestylePublicFamilies.ts`.**
   - Comment at line 11 referencing "the 8 canonical PARENT family anchors" → rewrite
     (no behavioral change to the 24-entry list).

5. **`src/views/freestyle/glossary.hbs` — prose reconciliation.**
   - The "always match" claim (~650-652) becomes TRUE once the browse aligns; verify
     wording reads correctly post-change (no edit needed if it already states parity,
     but confirm).
   - The "Family anchor" definition (~595-599) currently describes the browse as a
     superset that "includes atoms and sub-families too." Under the suppressed-tail
     model this is no longer accurate — reconcile to "the browse leads with the
     24-family roster" (curator-directed wording change, in scope per the IP).

6. **`src/services/freestyleService.ts` — landing card prose.**
   - Comment at 7571 ("distinct from the 8 parent anchors") → rewrite.
   - Topology crossLink (line 7615) "official grouping" claim is now accurate; keep.

## Verification plan

- `npm run build` + full freestyle test suite.
- Route check on `?view=family`: assert top-level sections = the 20 roots in order;
  torque/blender nested under osis; double-leg-over/eggbeater under legover;
  inside-stall and swirl present as roots; around-the-world absent; no raw-label tail.
- Card-uniformity contract across browse views (the mechanically-tested invariant)
  still holds.
- Cross-surface parity assertion: the set of top-level family slugs rendered by
  `?view=family` roots == `PUBLIC_DISPLAY_FAMILIES.filter(f => !f.parent)` slugs ==
  the glossary first-class roster slugs. This is the regression gate that pins
  "always match."
- `project_family_taxonomy_doctrine` memory refresh (still records the 8-parent
  model) after implementation.

## Remaining minor sub-decision (does not block drafting)

**DOD cohort (`dod`, `down-double-down`, 2 rows each):** fold under the
`double-over-down` family, or leave absent until the DOD/DDD Red ruling lands?
Recommendation: **leave absent** (consistent with doctrine-blocked status; avoids
asserting a fold the Red question may overturn). Revisit when DOD/DDD resolves.
