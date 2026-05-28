# Family Hierarchy Audit — Freestyle Trick Dictionary

**Date:** 2026-05-28
**Status:** Taxonomy/governance audit. **PROPOSAL ONLY — nothing implemented.**
**Author:** historical-pipeline maintainer (audit), curator-directed.

> This document does NOT change family assignments, browse rendering, trick rows,
> promotions, or ontology. It inventories the current `trick_family` labels,
> classifies each, and proposes a smaller canonical family taxonomy plus a
> parent/child hierarchy, with a risk assessment and a future implementation
> plan. Implementation is a separate, curator-gated slice.

---

## 0. Root cause: why there are ~90 "families"

`freestyle_tricks.trick_family` is populated by loader 19 with a default of
`trick_family = base_trick`, and `base_trick` for a brand-new base trick is the
trick's own slug. **Consequence: every base trick that has at least one
compound becomes its own "family," and every base trick with no compounds
becomes a singleton "family."** There is no notion of a parent family above the
base trick. So the count grows monotonically with the number of distinct base
tricks, not with the number of genuine structural family lineages.

This is why the two surfaces disagree on scale:

- **Landing "By family" card:** counts ALL distinct `trick_family` labels (~90–91, incl. singletons + modifier/operator self-labels).
- **Family VIEW (`?view=family`):** renders only families with `> 1` member (singletons dropped) AND only `kind==='trick'` rows, so ~38 groupings render.

Neither number is a settled taxonomy. The audit's central recommendation is to
introduce a small set of **parent families** keyed off the curator-authoritative
**12 core atoms** (plus a few structural anchors), route non-family labels to the
surfaces that already exist for them, and let compounds inherit a parent family
rather than minting a new label each.

---

## 1. Inventory of current family labels (active rows, 2026-05-28)

Source: `SELECT trick_family, COUNT(*) FROM freestyle_tricks WHERE is_active=1 GROUP BY trick_family`.
90 non-null labels + 1 NULL bucket (10 modifier rows, not a family).

### 1a. Large labels (≥ 8 rows) — 17 labels

| family | rows | family | rows | family | rows |
|---|---|---|---|---|---|
| whirl | 52 | clipper-stall | 20 | double-over-down | 11 |
| mirage | 49 | blender | 18 | eggbeater | 10 |
| butterfly | 35 | torque | 18 | barfly | 9 |
| legover | 33 | double-leg-over | 15 | flail | 9 |
| osis | 28 | drifter | 12 | eclipse | 8 |
| illusion | 26 | swirl | 12 | |
| pickup | 21 | | | |

### 1b. Mid labels (3–7 rows) — 11 labels

barrage (7), butterfly-swirl (5), dyno (5), paradon (5), dada-curve (4), guay (4), toe-stall (4), flurry (3), mobius (3), pixie (3, incl. 1 modifier row), twirl (3).

### 1c. Two-row labels — 10 labels

around-the-world, atw, clipper, cross-body-sole-stall, double-pickup, down-double-down, infinity, reverse-drifter, superfly, whirling-swirl.

### 1d. Singleton labels (1 row) — 52 labels

2-bag-juggling, 3-bag-juggling, atomic, blizzard, bullwhip, cloud-kick, cloud-stall, dod, double-around-the-world, double-knee, double-spin, dragonfly-kick, fairy, flying-inside, flying-outside, forehead-stall, furious, head-stall, heel-stall, high-plains-drifter, hop-over, inside-stall, jani-walker, knee-clipper, knee-stall, neck-stall, orbit, outside-stall, paradox-illusion, paradox-mirage, peak-delay, pendulum, plasma, pogo, quantum, rake, refraction, rev-whirl, ripstein, rooted, sailing, shooting, shoulder-stall, sole-kick, sole-stall, spin, spyro, squeeze, surging, terrage, walk-over, wrap.

**Distribution:** 52 singletons + 10 two-row = **62 of 90 labels (69%) have ≤ 2 rows.** Only ~17 labels carry ≥ 8 rows.

### 1e. Coherence check

Sampled mid/large labels are **self-named** (the family slug equals its base trick): `flail`→base `flail`, `barfly`→`barfly`, `eclipse`→`eclipse`, etc. The only labels with multiple distinct base tricks are the already-merged lineages: `clipper-stall` (clipper-stall + drifter), `blender` (blender + paradox-blender + spinning-paradox-blender), `drifter` (drifter + paradox-drifter). This confirms §0: families are base-trick slugs, not lineages.

---

## 2. Cross-reference surfaces (where non-family labels already belong)

These curated surfaces already exist and already contain many of the labels that are currently *also* minting redundant family entries:

- **Core atoms (12, curator-authoritative):** toe-stall, clipper-stall, around-the-world, orbit, legover, pickup, mirage, illusion, butterfly, osis, whirl, swirl. (`freestyleCoreAtoms`)
- **Movement System modifier axes (`freestyleMovementSystems.ts`):** set/uptime = pixie, fairy, atomic, quantum, nuclear, stepping, surging; rotational/midtime = spinning, gyro, whirling, ducking, diving, weaving; no-plant = symposium.
- **By Modifier / Canonical Sets (`freestyleCanonicalSets.ts`):** the registered modifier/set vocabulary.
- **Alternative Surfaces (`freestyleAlternativeSurfaces.ts`)** — already groups these surface tricks:
  - sole-and-heel: sole-stall, sole-kick, **cross-body-sole-stall**, heel-stall
  - inside-outside: inside-stall, outside-stall
  - head-neck-shoulder: head-stall, neck-stall, shoulder-stall, forehead-stall
  - cloud-and-knee: cloud-stall, cloud-kick, knee-stall
  - flying-variants: flying-clipper, flying-inside, flying-outside, dragonfly-kick, butterfly-kick
- **Movement Neighborhoods (topology, 6 groups)** anchored on base sets: HIPPY = {mirage, butterfly}; LEGGY = {legover, pickup, whirl, swirl, illusion}; CLIPPER-LANDING = {butterfly, whirl, swirl, osis, blender}; plus pixie/symposium/ducking link-based groups.

**Key redundancy:** every Alternative-Surfaces member (sole-stall, heel-stall, cross-body-sole-stall, inside/outside/head/neck/shoulder/forehead-stall, cloud-stall, knee-stall, flying-inside/outside, sole-kick, cloud-kick, dragonfly-kick) STILL appears as a `trick_family` label. The curator's `cross-body-sole-stall should NOT be a family` is the representative case — it is already on Alternative Surfaces and should simply stop being a family label.

---

## 3. Classification of every label

Disposition codes: **KEEP** (canonical parent/anchor family) · **CHILD** (sub-family nests under a parent) · **MOD** (modifier ecosystem → By Modifier) · **SURF** (Alternative Surfaces) · **NBHD** (Movement Neighborhood, not a family) · **ALIAS** (alias/decomposition/one-off label) · **RETIRE** (drop from Family view) · **DECIDE** (needs curator decision).

> Note: SURF / MOD targets already exist as curated surfaces; "move" here means *retire the redundant family label*, the trick keeps appearing on its real surface.

### 3a. KEEP — proposed canonical parent/anchor families

| label | rows | role |
|---|---|---|
| mirage | 49 | hippy-in dex anchor (parent of the hippy-dex lineage) |
| whirl | 52 | rotational-clipper anchor (parent of whirl/swirl rotational lineage) |
| osis | 28 | spin-to-clipper anchor (parent of osis/torque/blender lineage) |
| legover | 33 | leggy-over anchor (parent of legover lineage) |
| pickup | 21 | leggy pickup anchor |
| butterfly | 35 | hippy-out-to-clipper anchor |
| clipper-stall | 20 | clipper stall/surface anchor |
| toe-stall | 4 | toe stall anchor (core atom; foundational) |
| around-the-world | 2 | ATW rotational anchor (core atom) |

(9 anchors. `illusion` and `swirl` are core atoms but are proposed as CHILD of mirage / whirl respectively — see §4; whether they stay standalone anchors is a **DECIDE** item.)

### 3b. CHILD — nest under a parent anchor

| label | rows | proposed parent |
|---|---|---|
| illusion | 26 | mirage (hippy-dex) — or keep standalone (DECIDE) |
| eclipse | 8 | mirage / osis lineage (DECIDE which) |
| drifter / reverse-drifter / high-plains-drifter | 12 / 2 / 1 | clipper-stall (drifter ≡ miraging clipper) |
| double-leg-over | 15 | legover |
| guay | 4 | legover (leggy-over variant) |
| eggbeater | 10 | legover (eggbeater ≡ atomic legover) |
| double-pickup | 2 | pickup |
| swirl | 12 | whirl (rotational pair) — or keep standalone (DECIDE) |
| rev-whirl | 1 | whirl |
| twirl | 3 | whirl |
| whirling-swirl | 2 | whirl/swirl |
| butterfly-swirl | 5 | whirl/swirl or butterfly (DECIDE) |
| torque | 18 | osis |
| blender | 18 | osis |
| mobius | 3 | osis (gyro-torque) |
| double-around-the-world | 1 | around-the-world |
| atw | 2 | around-the-world (also an ALIAS — see 3f) |
| orbit | 1 | around-the-world (core atom; DECIDE standalone vs child) |
| double-over-down / down-double-down / dod | 11 / 2 / 1 | DECIDE — "down" lineage; may be its own small parent or nest under legover/pickup |
| paradox-mirage / paradox-illusion | 1 / 1 | mirage / illusion (single compound rows; should not be their own family) |

### 3c. MOD — modifier ecosystems (retire family label; belong to By Modifier)

pixie, fairy, atomic, quantum, surging, terrage, spyro, nuclear, **and the operator/set self-labels** pogo, rooted, sailing, shooting, furious. (These are modifier/set/operator rows whose `trick_family` is their own slug; they are not trick families.)

### 3d. SURF — Alternative Surfaces (retire family label; already curated there)

sole-stall, heel-stall, **cross-body-sole-stall**, inside-stall, outside-stall, head-stall, neck-stall, shoulder-stall, forehead-stall, cloud-stall, knee-stall, sole-kick, cloud-kick, dragonfly-kick, flying-inside, flying-outside. (`knee-clipper` → DECIDE: surface vs kick.)

### 3e. NBHD / category — not a trick family

- 2-bag-juggling, 3-bag-juggling → **multi-bag** category (juggling), not a trick family.
- spin, double-spin → **kick primitives** (kick-doctrine tricks). DECIDE: a small "spin/kick" grouping vs Alternative Surfaces. Not a structural family.
- double-knee → kick/surface primitive (DECIDE).
- peak-delay, pendulum → DECIDE (delay/clipper primitives; likely nest under clipper-stall or toe-stall).

### 3f. ALIAS / decomposition / one-off terminal variants

atw (alias of around-the-world), dod (alias of double-over-down). Possible decomposition/one-off labels (DECIDE per row): infinity, superfly, bullwhip, jani-walker, plasma, refraction, ripstein, blizzard, rake, squeeze, hop-over, walk-over, wrap.

### 3g. DECIDE — fine-grained mini-families needing curator ruling

barfly (9), flail (9), barrage (7), paradon (5), dyno (5), dada-curve (4), flurry (3), and the one-offs in 3f. Each is a self-named base trick with a few compounds. The question per label: is it a *genuinely novel base structure* (→ keep as a small CHILD/anchor) or a *compound that should inherit a parent family* (→ CHILD)? This requires movement-knowledge curator judgment, not a data rule.

### 3h. Summary counts

| disposition | approx labels |
|---|---|
| KEEP (canonical anchors) | 9 |
| CHILD (nest under a parent) | ~20 |
| MOD (modifier ecosystem) | ~13 |
| SURF (alternative surfaces) | ~16 |
| multi-bag / kick / NBHD | ~5 |
| ALIAS / one-off | ~2 firm + ~11 DECIDE |
| DECIDE (mini-families) | ~7 |

---

## 4. Proposed smaller canonical family set

**Target: ~8–10 canonical parent families** (down from ~90 labels / 38 rendered groupings):

1. **Mirage (hippy-in dex)** — mirage; children: illusion?, eclipse?, paradox-mirage, paradox-illusion, refraction-class compounds.
2. **Butterfly (hippy-out to clipper)** — butterfly; children: butterfly-swirl?, dada-curve?.
3. **Legover (leggy over-the-leg)** — legover, double-leg-over, guay, eggbeater.
4. **Pickup (leggy pickup)** — pickup, double-pickup.
5. **Whirl / Swirl (rotational clipper)** — whirl, swirl, rev-whirl, twirl, whirling-swirl, butterfly-swirl?.
6. **Osis (spin to clipper)** — osis, torque, blender, mobius, eclipse?.
7. **Clipper-stall (clipper surface lineage)** — clipper-stall, drifter, reverse-drifter, high-plains-drifter.
8. **Around-the-world / Orbit (ATW rotation)** — around-the-world, double-around-the-world, orbit.
9. **Toe-stall (toe surface)** — toe-stall.
10. **Down lineage** — double-over-down, down-double-down (DECIDE: own parent vs fold into legover/pickup).

Everything else routes to **By Modifier** (modifier ecosystems), **Alternative Surfaces** (surface tricks), **multi-bag/kick** categories, or is retired as an **alias**. The mini-families in §3g get individual curator rulings.

This is a **proposal**; the exact membership of illusion/swirl/eclipse/butterfly-swirl/down as standalone-vs-child is explicitly left to the curator.

---

## 5. Proposed parent/child hierarchy (illustrative)

```
Mirage (hippy-in dex)
├── illusion            (DECIDE: standalone atom vs child)
├── eclipse             (DECIDE: mirage vs osis)
├── paradox-mirage, paradox-illusion (compounds, not families)
Butterfly (hippy-out → clipper)
Legover (leggy over)
├── double-leg-over
├── guay
└── eggbeater           (≡ atomic legover)
Pickup (leggy pickup)
└── double-pickup
Whirl / Swirl (rotational → clipper)
├── swirl               (DECIDE: standalone atom vs child)
├── rev-whirl
├── twirl
├── whirling-swirl
└── butterfly-swirl     (DECIDE: here vs Butterfly)
Osis (spin → clipper)
├── torque
├── blender
├── mobius
└── eclipse?            (DECIDE)
Clipper-stall
├── drifter
│   ├── reverse-drifter
│   └── high-plains-drifter
Around-the-world / Orbit
├── double-around-the-world
└── orbit               (DECIDE)
Toe-stall
Down (DECIDE: own parent vs fold-in)
├── double-over-down
└── down-double-down

→ By Modifier:           pixie, fairy, atomic, quantum, surging, terrage, spyro, nuclear, (operators) pogo/rooted/sailing/shooting/furious
→ Alternative Surfaces:  sole/heel/cross-body-sole/inside/outside/head/neck/shoulder/forehead/cloud/knee stalls; sole/cloud/dragonfly kicks; flying-inside/outside
→ Multi-bag:             2-bag-juggling, 3-bag-juggling
→ Kicks:                 spin, double-spin, (knee-clipper / double-knee — DECIDE)
→ Aliases / one-offs:    atw, dod, + DECIDE list
```

---

## 6. Examples of tricks affected by each proposed consolidation

- **osis/torque/blender → Osis parent:** `torque` (18 rows incl. paradox-torque, spinning-torque), `blender` (18 incl. paradox-blender, spinning-paradox-blender), `mobius` (gyro-torque). All currently separate top-level families; would render under one "Osis" heading with sub-sections.
- **whirl/swirl/twirl/rev-whirl → Whirl/Swirl parent:** `swirl` (12), `twirl` (3), `whirling-swirl` (2), `rev-whirl` (1) join `whirl` (52). Movement Neighborhoods already pairs whirl+swirl ("Whirl / swirl structures").
- **legover lineage → Legover parent:** `double-leg-over` (15), `guay` (4), `eggbeater` (10) join `legover` (33).
- **surface stalls → Alternative Surfaces (retire family):** `cross-body-sole-stall` (2), `sole-stall`, `heel-stall`, `cloud-stall`, `knee-stall`, the head/neck/shoulder/forehead/inside/outside stalls — all already listed on the Alternative Surfaces section; they stop appearing as family headings.
- **modifier ecosystems → By Modifier (retire family):** `pixie` (3), `fairy`, `atomic`, `quantum`, `surging` — these are set/body modifiers; they belong to the modifier vocabulary, not the family browse.
- **multi-bag → own category:** `2-bag-juggling`, `3-bag-juggling`.

---

## 7. Risk assessment

| risk | severity | mitigation |
|---|---|---|
| **Reassigning `trick_family` is a data migration** (affects family view, family filter `?family=`, topology anchors, related-set cross-links, family-invariant rendering, detail-page family chips). | High | Treat as a dedicated migration slice with its own red/curator review; do NOT bundle with UI work. Keep `base_trick` unchanged; introduce a SEPARATE parent-family field rather than overwriting `trick_family` if reversibility is wanted. |
| **`?family=<slug>` URL stability** — existing deep links to retired family slugs would 404 or empty. | Medium | Decide alias-redirect policy (old family slug → parent) before changing labels. |
| **Topology / Movement Neighborhoods depend on `base_trick`, not `trick_family`** — so neighborhoods are unaffected by a family-label change. | Low | Confirm: HIPPY/LEGGY/CLIPPER sets key off `base_trick`. Family migration can proceed without touching topology. |
| **Curator authority** — which labels are true families vs ecosystems is a movement-knowledge judgment (Red/curator), not a data rule. | High | The DECIDE bucket must be ruled by the curator before implementation. This audit proposes; it does not decide. |
| **Double-counting / membership semantics** — dual-membership (torque/blender in osis + own) already exists; a parent/child model must define whether a child renders under both its parent and standalone. | Medium | Define membership rule in the implementation spec; reuse the existing `FAMILY_DUAL_MEMBERSHIPS` mechanism. |
| **Reversibility governance** — per `feedback_reversible_content_governance`, prefer a TypeScript content mapping (parent-family registry) over a SQL schema migration while the taxonomy is still ruling. | Medium | Implement the parent/child map as curator content first; SQL formalization only after the taxonomy stabilizes. |

---

## 8. Implementation plan for a future slice (NOT this slice)

1. **Curator ruling pass** — resolve every DECIDE label (illusion/swirl/eclipse/butterfly-swirl/down/orbit + the mini-families barfly/flail/barrage/paradon/dyno/dada-curve/flurry + the one-off ALIAS list). Output: a frozen parent-family assignment per base trick.
2. **Parent-family content registry** — add a curator-authored `PARENT_FAMILY` map (base-trick slug → parent-family slug) in `src/content/` (reversible TS content, not a schema change), plus parent-family display metadata (name, shared-structure invariant).
3. **Service shaping** — `buildFamilyGroup` consumes the parent map: render parent families with nested child sub-sections; keep the `> 1` member rule at the parent level. Route SURF/MOD/multi-bag labels OUT of `familyGroups` (they have their own surfaces).
4. **Landing reconciliation** — make the landing "By family" count the parent-family count (e.g. ~9–10), not all distinct labels; update the cautious wording to match.
5. **URL/alias policy** — add `?family=<old-slug>` → parent redirects (or accept old slugs as aliases) for link stability.
6. **Doc-sync** — VIEW_CATALOG family-view description + a DESIGN_DECISIONS entry recording the parent/child taxonomy rationale (with approval).

---

## 9. Tests that would be needed if implemented

- **Parent-family registry shape test** — every base trick maps to exactly one parent family; no orphan base tricks; no parent cycles.
- **Family-view structure test** — family view renders the small parent set; each parent renders its child sub-sections; SURF/MOD/multi-bag labels do NOT render as families.
- **No-retired-label test** — none of the retired family slugs (cross-body-sole-stall, pixie, sole-stall, …) render as a top-level family heading.
- **Landing-count reconciliation test** — the landing "By family" count equals the parent-family count and the family view renders that many parent groupings (kills the 91-vs-38 discrepancy).
- **URL-stability test** — `?family=<retired-slug>` resolves to its parent (redirect or alias), not a 404/empty.
- **Topology-unaffected regression** — Movement Neighborhoods still render the same 6 groups (they key off `base_trick`, not `trick_family`).
- **Row-contract guard remains green** — `freestyle.browse-row-contract` (the two-line row contract is independent of family taxonomy).
- **Per-trick family-chip test** — detail-page family chip points to the parent family, not the retired leaf label.

---

## 10. Recommendation

Proceed in this order, each curator-gated: **(1) curator ruling on the DECIDE labels → (2) parent-family content registry → (3) service + view + landing reconciliation → (4) URL alias policy + doc-sync.** Schedule the whole sequence **before** the Emerging Vocabulary redesign and before any major new trick promotions (new promotions into the current flat scheme would deepen the sprawl this audit is trying to reverse). Do not change `trick_family` inside a UI/browse-shell slice.
