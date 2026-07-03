# Family Taxonomy Candidate Matrix — curator review

**Date:** 2026-05-28
**Type:** Governance-review artifact (NOT implementation, NOT a ruling pass).
**Companion to:** `exploration/family-hierarchy-audit-2026-05-28/REPORT.md`

> Purpose: make the proposed family taxonomy visually reviewable so the future
> curator ruling pass is fast. Nothing here changes code, data, `trick_family`,
> rendering, or ontology. "Class" is a *proposal*; the **Rule?** column flags
> where a curator decision is required before any implementation.

**Class codes:** KEEP = canonical parent/anchor family · CHILD = nests under a parent · MOD = modifier ecosystem (→ By Modifier) · SURF = Alternative Surfaces · NBHD = movement neighborhood / non-family category · ALIAS = alias/decomposition/one-off label · DECIDE = needs curator ruling.
**Risk:** L/M/H (data-migration blast radius + doctrine sensitivity). **Rule?** = curator ruling needed before implementing.

---

## A. Per-label matrix (all 90 labels, grouped by proposed disposition)

### A1. KEEP — proposed canonical parent/anchor families

| Label | Rows | Parent | Rationale | Examples | Risk | Rule? |
|---|---|---|---|---|---|---|
| whirl | 52 | — | rotational-clipper anchor (core atom) | whirl, bling-blang | M | N |
| mirage | 49 | — | hippy-in dex anchor (core atom) | mirage, anoxia, assassin | M | N |
| butterfly | 35 | — | hippy-out→clipper anchor (core atom) | butterfly, atomic-butterfly | M | N |
| legover | 33 | — | leggy-over anchor (core atom) | legover, chainsaw-massacre | M | N |
| osis | 28 | — | spin→clipper anchor (core atom) | osis, aeon-flux | M | N |
| pickup | 21 | — | leggy pickup anchor (core atom) | pickup, ducking-pickup | L | N |
| clipper-stall | 20 | — | clipper stall/surface anchor (core atom) | clipper-stall, atomic-clipper | M | N |
| toe-stall | 4 | — | toe stall anchor (core atom) | toe-stall, ducking-toe-stall | L | N |
| around-the-world | 2 | — | ATW rotational anchor (core atom); MERGE `atw` into this | around-the-world-kick, triple-around-the-world | M | Y |

### A2. CHILD — nest under a parent anchor

| Label | Rows | Parent (proposed) | Rationale | Examples | Risk | Rule? |
|---|---|---|---|---|---|---|
| illusion | 26 | mirage | hippy-dex sibling of mirage | illusion, atomic-illusion | M | **Y** (standalone vs child) |
| blender | 18 | osis | whirling-osis lineage | fairy-blender, paradox-blender | M | N |
| torque | 18 | osis | miraging-osis lineage | atomic-torque, blurry-torque | M | N |
| double-leg-over | 15 | legover | explicit legover compound | fairy-double-leg-over | L | N |
| drifter | 12 | clipper-stall | drifter ≡ miraging clipper | gyro-drifter, ducking-drifter | M | N |
| swirl | 12 | whirl | rotational pair with whirl (core atom) | swirl, barfly-swirl | M | **Y** (standalone vs child) |
| double-over-down | 11 | (Down) | "down" lineage; own parent vs fold-in | double-over-down, down-diver | M | **Y** |
| eggbeater | 10 | legover | eggbeater ≡ atomic legover | bedwetter, gyro-eggbeater | M | **Y** |
| eclipse | 8 | mirage / osis | lineage ambiguous | eclipse, atomic-eclipse | M | **Y** |
| butterfly-swirl | 5 | whirl/swirl or butterfly | name spans two anchors | gyro-butterfly-swirl | M | **Y** |
| guay | 4 | legover | leggy-over variant | guay, ducking-guay | L | **Y** |
| mobius | 3 | osis | gyro-torque (osis lineage) | fairy-mobius, pixie-mobius | L | N |
| twirl | 3 | whirl | rotational variant | fairy-twirl, symposium-twirl | L | **Y** |
| double-pickup | 2 | pickup | explicit pickup compound | gyro-double-pickup | L | N |
| reverse-drifter | 2 | clipper-stall / drifter | drifter variant | reverse-drifter, royale | L | N |
| whirling-swirl | 2 | whirl/swirl | rotational compound | paradox-whirling-swirl | L | N |
| down-double-down | 2 | (Down) | "down" lineage | down-double-down, scorpions-tail | L | **Y** |
| double-around-the-world | 1 | around-the-world | explicit ATW compound | double-around-the-world-heel | L | N |
| high-plains-drifter | 1 | clipper-stall / drifter | drifter compound | paradox-high-plains-drifter | L | N |
| rev-whirl | 1 | whirl | reverse-whirl variant (only member: `surgery`) | surgery | L | **Y** (label/member mismatch) |
| orbit | 1 | around-the-world | core atom; standalone vs child | orbit | L | **Y** |
| paradox-mirage | 1 | mirage | single compound, not a family (member: `spike-hammer`) | spike-hammer | L | N |
| paradox-illusion | 1 | illusion / mirage | single compound, not a family (member: `avalanche`) | avalanche | L | N |
| blizzard | 1 | illusion? | single compound (member: `paradox-blizzard`) | paradox-blizzard | L | **Y** |

### A3. MOD — modifier / operator ecosystems (retire family label; belong to By Modifier)

| Label | Rows | Rationale | Examples | Risk | Rule? |
|---|---|---|---|---|---|
| pixie | 3 | set modifier; the modifier row + 2 tricks need a real family | pixie (modifier), symposium-pixie, trixie | L | **Y** (re-home the 2 tricks) |
| atomic | 1 | set modifier self-label | atomic | L | N |
| fairy | 1 | set modifier self-label | fairy | L | N |
| quantum | 1 | set modifier self-label | quantum | L | N |
| surging | 1 | set modifier self-label | surging | L | N |
| terrage | 1 | modifier/folk descriptor | terrage | L | N |
| spyro | 1 | rotational descriptor (modifier-only) | spyro | L | N |
| furious | 1 | set/operator self-label | furious | L | N |
| pogo | 1 | set operator self-label | pogo | L | N |
| rooted | 1 | set operator self-label | rooted | L | N |
| sailing | 1 | set operator self-label | sailing | L | N |
| shooting | 1 | set operator self-label | shooting | L | N |

> Note: `stepping` does not appear as a family label (good — it is already only a modifier).

### A4. SURF — Alternative Surfaces (retire family label; already curated on that surface)

| Label | Rows | Already on alt-surfaces group | Examples | Risk | Rule? |
|---|---|---|---|---|---|
| cross-body-sole-stall | 2 | sole-and-heel | cross-body-sole-stall, ricochet | L | N |
| sole-stall | 1 | sole-and-heel | sole-stall | L | N |
| heel-stall | 1 | sole-and-heel | heel-stall | L | N |
| sole-kick | 1 | sole-and-heel | sole-kick | L | N |
| inside-stall | 1 | inside-outside | inside-stall | L | N |
| outside-stall | 1 | inside-outside | outside-stall | L | N |
| head-stall | 1 | head-neck-shoulder | head-stall | L | N |
| neck-stall | 1 | head-neck-shoulder | neck-stall | L | N |
| shoulder-stall | 1 | head-neck-shoulder | shoulder-stall | L | N |
| forehead-stall | 1 | head-neck-shoulder | forehead-stall | L | N |
| cloud-stall | 1 | cloud-and-knee | cloud-stall | L | N |
| cloud-kick | 1 | cloud-and-knee | cloud-kick | L | N |
| knee-stall | 1 | cloud-and-knee | knee-stall | L | N |
| dragonfly-kick | 1 | flying-variants | dragonfly-kick | L | N |
| flying-inside | 1 | flying-variants | flying-inside | L | N |
| flying-outside | 1 | flying-variants | flying-outside | L | N |
| clipper | 2 | surface name (not the clipper-stall trick) | clipper, flying-clipper | L | **Y** (surface vs clipper-stall) |

### A5. NBHD / multi-bag / kick — non-family categories

| Label | Rows | Target | Rationale | Risk | Rule? |
|---|---|---|---|---|---|
| 2-bag-juggling | 1 | multi-bag | juggling, not a trick family | L | N |
| 3-bag-juggling | 1 | multi-bag | juggling, not a trick family | L | N |
| spin | 1 | kick | spinning-kick primitive (kick-doctrine) | L | **Y** (kick grouping home) |
| double-spin | 1 | kick | double-spin kick primitive | L | **Y** |
| double-knee | 1 | kick/surface | knee primitive | L | **Y** |
| knee-clipper | 1 | kick/surface | knee-clipper folk primitive | L | **Y** |
| peak-delay | 1 | clipper/delay | delay primitive; nest under clipper-stall? | L | **Y** |
| pendulum | 1 | clipper/delay | first-class delay compound | L | **Y** |

### A6. ALIAS / one-off folk microfamilies — retire or re-home (mostly DECIDE)

| Label | Rows | Rationale | Examples | Risk | Rule? |
|---|---|---|---|---|---|
| atw | 2 | alias of around-the-world; MERGE | around-the-world, double-around-the-world | M | **Y** |
| dod | 1 | alias of double-over-down (member: `fusion`) | fusion | L | **Y** |
| infinity | 2 | label holds `barfly`/`ducking-barfly` (overlaps `barfly` family) | barfly, ducking-barfly | M | **Y** (data quirk) |
| superfly | 2 | one-off folk compound | spinning-superfly, stepping-superfly | L | **Y** |
| bullwhip | 1 | one-off folk name | bullwhip | L | **Y** |
| jani-walker | 1 | one-off folk name | jani-walker | L | **Y** |
| plasma | 1 | one-off folk name | plasma | L | **Y** |
| refraction | 1 | one-off folk name | refraction | L | **Y** |
| ripstein | 1 | one-off folk name | ripstein | L | **Y** |
| rake | 1 | one-off folk name | rake | L | **Y** |
| squeeze | 1 | one-off folk name | squeeze | L | **Y** |
| hop-over | 1 | held-delay leg-over family member | hop-over | L | **Y** |
| walk-over | 1 | held-delay leg-over family member | walk-over | L | **Y** |
| wrap | 1 | held-delay leg-over family member | wrap | L | **Y** |

### A7. DECIDE — fine-grained mini-families (genuinely novel base vs roll into a parent)

| Label | Rows | Question | Examples | Risk | Rule? |
|---|---|---|---|---|---|
| barfly | 9 | novel base or compound? (note: `barfly` base sits under `infinity`) | blurriest, nemesis | M | **Y** |
| flail | 9 | novel base or compound of legover/whirl? | atomic-flail, fairy-flail | M | **Y** |
| barrage | 7 | novel base or stepping-compound? | barrage, blurrage | M | **Y** |
| paradon | 5 | novel base or compound? | paradon, dolomite | M | **Y** |
| dyno | 5 | novel base or compound? | dyno, miraging-dyno | M | **Y** |
| dada-curve | 4 | novel base or compound? | dada-curve, gyro-dada-curve | M | **Y** |
| flurry | 3 | novel base or whirl-compound? | flurricane, paradox-flurry | M | **Y** |

---

## B. Summary sections

### B1. Proposed canonical parent families (~10)

| # | Parent | Anchored on (core atom) | Absorbs (children) |
|---|---|---|---|
| 1 | Mirage | mirage | illusion?, eclipse?, paradox-mirage/illusion, blizzard? |
| 2 | Butterfly | butterfly | (butterfly-swirl?) |
| 3 | Legover | legover | double-leg-over, guay, eggbeater |
| 4 | Pickup | pickup | double-pickup |
| 5 | Whirl / Swirl | whirl (+swirl) | swirl?, rev-whirl, twirl, whirling-swirl, butterfly-swirl? |
| 6 | Osis | osis | torque, blender, mobius, eclipse? |
| 7 | Clipper-stall | clipper-stall | drifter, reverse-drifter, high-plains-drifter |
| 8 | Around-the-world / Orbit | around-the-world | atw (merge), double-around-the-world, orbit? |
| 9 | Toe-stall | toe-stall | — |
| 10 | Down (DECIDE: own vs fold-in) | — | double-over-down, down-double-down, dod |

### B2. Proposed modifier ecosystems (→ By Modifier; retire family label)

pixie, fairy, atomic, quantum, surging, terrage, spyro, furious, pogo, rooted, sailing, shooting. (12 labels removed from family taxonomy.)

### B3. Proposed Alternative Surface groups (already curated; retire family label)

| Alt-surface group | Family labels it absorbs |
|---|---|
| Sole and heel | cross-body-sole-stall, sole-stall, heel-stall, sole-kick |
| Inside and outside | inside-stall, outside-stall |
| Head, neck, and shoulder | head-stall, neck-stall, shoulder-stall, forehead-stall |
| Cloud and knee | cloud-stall, cloud-kick, knee-stall |
| Flying and airborne variants | flying-inside, flying-outside, dragonfly-kick |

(16–17 labels removed from family taxonomy; `clipper` surface label is DECIDE.)

### B4. Proposed Neighborhood-only / non-family categories

- **Multi-bag:** 2-bag-juggling, 3-bag-juggling.
- **Kicks:** spin, double-spin, double-knee, knee-clipper (DECIDE the kick grouping's home).
- **Delay primitives:** peak-delay, pendulum (DECIDE: nest under clipper-stall/toe-stall).
- Movement Neighborhoods (topology view) is **unaffected** — it keys off `base_trick`, not `trick_family`.

### B5. Singleton / retire candidates

52 labels are singletons (1 row). After normalization most disappear as family headings: surface stalls (→SURF), modifier/operator self-labels (→MOD), single-compound labels (→CHILD of a parent), multi-bag/kick/delay primitives (→category), and one-off folk names (→ALIAS/DECIDE). Net: the Family view should fall from ~38 rendered groupings to ~10 parent families.

### B6. Highest-risk doctrine areas

| Area | Why high-risk |
|---|---|
| osis / torque / blender | 64 rows across 3 top-level labels; collapsing to one Osis parent is a large, visible re-grouping with lineage-doctrine stakes. |
| whirl / swirl / twirl / rev-whirl / whirling-swirl / butterfly-swirl | 75+ rows; "is swirl a child of whirl or a co-anchor?" is a genuine doctrine question; `rev-whirl` label/member mismatch (`surgery`). |
| mirage / illusion / pickup / legover | 129 rows; hippy-vs-leggy split (mirage/illusion hippy; legover/pickup leggy) must be ruled before nesting illusion under mirage. |
| mini-families (barfly/flail/barrage/paradon/dyno/dada-curve/flurry) | each needs a "novel base vs compound" movement-knowledge ruling. |
| `?family=<slug>` URL stability | retiring ~70 labels breaks deep links unless aliases/redirects are defined first. |

### B7. Labels most likely to confuse users (today)

- **`atw` vs `around-the-world`** — the ATW lineage is split across two family labels (atw holds the `around-the-world` base; around-the-world holds the kick + triple).
- **`infinity` holds `barfly`** while a separate `barfly` family also exists — the same base appears under two labels.
- **`dod` → `fusion`**, **`rev-whirl` → `surgery`**, **`paradox-mirage` → `spike-hammer`** — the family label and its sole member don't match, so the heading reads as a different trick than its contents.
- **Surface stalls + modifier names as "families"** — `cross-body-sole-stall`, `pixie`, `atomic` reading as trick families when they are surfaces / modifiers.

### B8. Labels likely to disappear after hierarchy normalization

~70 of the ~90 labels stop being family headings: all SURF (16–17), all MOD (12), multi-bag/kick/delay (8), most CHILD single-compound labels (~15), ALIAS/one-off (~14). The ~10 parent families in B1 remain (some absorbing core-atom labels like illusion/swirl/orbit pending the DECIDE rulings).

---

## C. Special-attention clusters (curator focus)

| Cluster | Proposal | Open question (Rule?) |
|---|---|---|
| **osis / torque / blender** | one **Osis** parent, torque + blender + mobius as children | confirm eclipse's home (osis vs mirage) |
| **whirl / swirl / twirl / rev-whirl** | one **Whirl / Swirl** parent | swirl standalone co-anchor vs child; rev-whirl label/member mismatch |
| **mirage / illusion / pickup / legover** | Mirage (hippy) + Legover/Pickup (leggy); illusion under mirage | illusion standalone vs child; hippy/leggy split naming |
| **pixie / fairy / stepping / quantum / atomic** | all → **modifier ecosystems** (By Modifier), retire family labels | re-home the 2 real tricks currently under `pixie` (symposium-pixie, trixie) |
| **surface groups** (sole/heel/cloud/cross-body-sole/inside/outside/head/neck/shoulder/forehead/knee + flying) | all → **Alternative Surfaces** (already there), retire family labels | `clipper` surface label vs clipper-stall trick |
| **orbit / around-the-world** | **ATW/Orbit** parent; merge `atw` alias | orbit standalone (core atom) vs child of ATW |
| **eclipse / butterfly-swirl / illusion** | the recurring "standalone atom vs child" cases | each needs an explicit ruling |
| **one-off folk microfamilies** (barfly, flail, barrage, paradon, dyno, dada-curve, flurry, infinity, superfly, bullwhip, jani-walker, plasma, refraction, ripstein, rake, squeeze, hop-over, walk-over, wrap) | DECIDE: novel base (keep small) vs compound (roll into parent) vs alias (retire) | per-label movement-knowledge ruling |

---

## D. How to use this matrix in the ruling pass

1. Confirm the **KEEP** anchors (A1) — these are the least controversial (core atoms).
2. Sweep the **SURF** (A4) and **MOD** (A3) tables — these are `Rule? = N` retirements; bulk-approve unless an exception is spotted.
3. Resolve the **`Rule? = Y`** rows: the standalone-vs-child atoms (illusion, swirl, eclipse, orbit, butterfly-swirl), the **Down** lineage, the mini-families (A7), and the one-offs (A6).
4. Fix the data quirks called out in B7 (atw/around-the-world split, infinity↔barfly, label/member mismatches) as part of the ruling.
5. Hand the frozen parent-family assignments to the implementation slice (see audit REPORT §8).

*No code or data changed by this artifact. Implementation remains curator-gated and out of scope.*
