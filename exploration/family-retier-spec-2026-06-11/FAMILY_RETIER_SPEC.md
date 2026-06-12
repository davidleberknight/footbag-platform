# Family Roster Re-Tiering — Migration Spec + Mockups

Spec only. **No implementation, no doctrine ratified.** Describes the exact before/after roster, every
surface that changes, and how "Minor lineages" would render. Counts are the curated `FAMILY_HISTOGRAM`
values (`freestyleTopologyHistograms.ts`), the same metric the glossary histogram already shows.

## 1. Before / after roster

**Before:** 24 first-class families (`PUBLIC_DISPLAY_FAMILIES`, `freestylePublicFamilies.ts`) = 20 roots + 4 branches.
**After:** 16 first-class **Family Parents** (>10) + 8 **Minor lineages** (<10). 2 **Foundational Terminal
Surfaces** (toe/clipper) stay excluded (already not in the roster). The `>10` cut lands in a natural gap
(nothing at 10; Inside Stall 11, Double-Over-Down 12 in; Eclipse/Flail 9 out).

| family | count | tier | branch of | before → after |
|---|---:|---|---|---|
| Osis | 84 | Family Parent | — | first-class → **first-class** |
| Whirl | 74 | Family Parent | — | first-class → first-class |
| Legover | 71 | Family Parent | — | first-class → first-class |
| Mirage | 69 | Family Parent | — | first-class → first-class |
| Butterfly | 48 | Family Parent | — | first-class → first-class |
| Illusion | 34 | Family Parent | — | first-class → first-class |
| Swirl | 29 | Family Parent | — | first-class → first-class |
| Pickup | 27 | Family Parent | — | first-class → first-class |
| Blender | 22 | Family Parent | osis | first-class → first-class |
| Torque | 22 | Family Parent | osis | first-class → first-class |
| Double Legover | 16 | Family Parent | legover | first-class → first-class |
| Drifter | 14 | Family Parent | — | first-class → first-class |
| Barfly | 13 | Family Parent | — | first-class → first-class |
| Eggbeater | 13 | Family Parent | legover | first-class → first-class |
| Double-Over-Down | 12 | Family Parent | — | first-class → first-class |
| Inside Stall | 11 | Family Parent | — | first-class → first-class |
| **Eclipse** | 9 | **Minor lineage** | — | first-class → **DEMOTED** |
| **Flail** | 9 | Minor lineage | — | first-class → DEMOTED |
| **Barrage** | 8 | Minor lineage | — | first-class → DEMOTED |
| **Paradon** | 6 | Minor lineage | — | first-class → DEMOTED |
| **Dyno** | 5 | Minor lineage | — | first-class → DEMOTED |
| **Butterfly-Swirl** | 5 | Minor lineage | — | first-class → DEMOTED |
| **Dada-Curve** | 4 | Minor lineage | — | first-class → DEMOTED |
| **Flurry** | 3 | Minor lineage | — | first-class → DEMOTED |

All 8 demotions are **roots** (no branches demoted), so no re-parenting. `trick_family` values are
**unchanged** — every demoted family's tricks keep their membership; only the *display tier* changes.

## 2. Surfaces affected (every consumer of the roster)

| # | surface | file:line | what changes |
|---|---|---|---|
| 1 | `?view=family` browse — per-family sections | `tricks.hbs:271` (`familyGroups`), built `freestyleService.ts:7111` | 8 fewer first-class `trick-family-group` sections; the 8 move to a new "Minor lineages" band |
| 2 | Dictionary landing "By family" card (count + chips) | `freestyleService.ts:7728-7732` | count `24 → 16`; chip list drops 8 (or splits into parent chips + a minor-lineage row) |
| 3 | `?family=<slug>` filtered browse | route + `resolveDisplayFamily` | still resolves for all 24 (trick_family unchanged); demoted slugs render with a "minor lineage" label instead of "family" |
| 4 | Trick-card family chip on dictionary rows | `dictionary-trick-row` partial (`.trick-family-chip`) | a card whose `trick_family` is demoted shows a minor-lineage-styled chip |
| 5 | Trick-detail family chip + "Also a member of" | `trick-family.hbs`, `freestyleService.ts` (`familyChip`/`additionalFamilies`) | a demoted family's detail page shows "Flurry (minor lineage)" rather than "Flurry family" |
| 6 | Glossary §families "First-class families" roster | `glossary.hbs` (roster derives from `PUBLIC_DISPLAY_FAMILIES`) | roster `24 → 16`; add a "Minor lineages" list of the 8 |
| 7 | Glossary family histogram | `FAMILY_HISTOGRAM` + `glossary.hbs` | the 8 rows re-tier from `family` to a new `minor` tier (label/treatment change) |
| 8 | Family-anchor / shared-structure sub-labels | `tricks.hbs:283-288`, `freestyleFamilyInvariants.ts` | demoted families lose the "Family-anchor" framing or gain a minor-lineage variant |

**Single source of truth:** items 1–6 all flow from `PUBLIC_DISPLAY_FAMILIES` / `PUBLIC_FAMILY_ORDER`
in `freestylePublicFamilies.ts`. Item 7 is the parallel `FAMILY_HISTOGRAM` content module. So the change
is **two reversible content modules + the rendering that reads them** — no schema, no `trick_family`.

## 3. Mockups (text — pixel-accurate screenshots need the running dev server)

### `?view=family` — Family Parents render as now; a "Minor lineages" band is appended

```
By family — 16 families (root families first, then derived branches)

┌────────────────────────────────────────────────────────────┐
│ Osis family                                           84  │  ← full section (unchanged)
│ Family-anchor: Osis    Shared terminal structure: …        │
│ [ trick rows … ]                                            │
├────────────────────────────────────────────────────────────┤
│ Whirl family                                          74  │
│ …                                                          │
├────────────────────────────────────────────────────────────┤
│ … (14 more Family Parents, incl. Torque/Blender branches) │
└────────────────────────────────────────────────────────────┘

── Minor lineages ───────────────────────────────────────────
Small, conserved-terminal lineages (fewer than ~10 documented
tricks). Real lineages, browsable, but not first-class families.

  Eclipse (9)   Flail (9)   Barrage (8)   Paradon (6)
  Dyno (5)      Butterfly-Swirl (5)   Dada-Curve (4)   Flurry (3)

  ▸ each name links to /freestyle/tricks?family=<slug>
```

Recommended treatment: the 8 minor lineages render as a **single compact band** (names + counts as
links), *not* eight full card-stack sections — that's the visual signal that they're subordinate, and
the main reason the page gets shorter and clearer.

### Trick-detail page of a demoted-family member (e.g. a Flurry trick)

```
BEFORE:   [ Flurry family ]      ← first-class chip, links to ?family=flurry

AFTER:    [ Flurry · minor lineage ]   ← muted chip, links to ?family=flurry
          (still a real conserved-terminal lineage, just not first-class)
```

### Dictionary landing — "By family" lens card

```
BEFORE:  By family   24 families
         chips: Osis · Whirl · … · Flurry · Dada-Curve   (24 chips)

AFTER:   By family   16 families   (+8 minor lineages)
         chips: Osis · Whirl · … · Inside Stall          (16 parent chips)
         minor lineages: Eclipse · Flail · … · Flurry    (muted row)
```

### Glossary §families roster

```
First-class families (16)
  Mirage · Illusion · Butterfly · Legover · Pickup · Whirl · Osis
  (Torque, Blender) · (Double Legover, Eggbeater) · Drifter · Barfly
  · Double-Over-Down · Swirl · Inside Stall

Minor lineages (8) — conserved terminal identity, fewer than ~10 descendants
  Eclipse · Flail · Barrage · Paradon · Dyno · Butterfly-Swirl
  · Dada-Curve · Flurry

Foundational terminal surfaces (excluded — too broad to teach as a lineage)
  Clipper Stall (328) · Toe Stall (252)
```

## 4. Risks / migration notes (carried from the doctrine review)

- **Curator-ratified, reversible-content only.** Edits land in `freestylePublicFamilies.ts` +
  `freestyleTopologyHistograms.ts` + the rendering; never schema, never `trick_family`.
- **No broken links / no data loss.** Demoted families keep their `?family=<slug>` route, their detail
  pages, and their `trick_family` rows. Only the display tier changes.
- **Test churn (predictable).** The glossary-framing tests pin the promoted roster + the histogram
  tiers (`Flurry 3`, "promotes six empirically-admitted family parents", butterfly-swirl as a family);
  the family-skeleton / family-invariant tests assert the 24-family ordering. These update with the
  re-tier.
- **Borderline fragility.** Eclipse (9) and Flail (9) sit just under the cut; a future promotion could
  re-tier them. State the `>10` threshold as curator-set and reversible.
- **Counts caveat.** `FAMILY_HISTOGRAM` (curated/recursive) and the live `?family=` chip counts
  (`familyTrickCounts`, raw `trick_family`) differ slightly (e.g. Whirl 74 vs 84). The doctrine cut
  should pin ONE metric; this spec uses the histogram. Confirm which the threshold reads before build.

## Screenshots

Pixel-accurate screenshots require the running dev server + a browser pass (browser-qa), which is a
heavy, separately-invoked step and is not run unsolicited. The text mockups above reflect the actual
markup (`trick-family-group` sections, `.trick-family-chip`, the landing-grid card). On request I can
spec the exact CSS for the minor-lineage band/chip so a reviewer can eyeball it in the dev server.
