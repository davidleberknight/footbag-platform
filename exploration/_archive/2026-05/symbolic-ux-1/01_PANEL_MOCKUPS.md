# SUX-1 Task A — Experimental Symbolic Page Panels

Eight panel-mockup prototypes for trick-detail pages. Each panel surfaces a different facet of the symbolic-grammar layer. **Spec + ASCII wireframes only.** No production template changes.

**Date:** 2026-05-12

**Flagship examples used:** matador / phoenix / ripwalk / spinning-whirl / paradox-mirage / montage / torque

---

## Panel 1 — Related topology tricks

**Symbolic source:** `symbolic_topology_groups.csv` + `symbolic_group_membership.csv`.
**Educational goal:** show tricks that share the same mechanical topology even when IFPA family differs.

### Mockup — on `/freestyle/tricks/matador`

```
┌────────────────────────────────────────────────────────────────┐
│ Related topology — butterfly-wing-topology                     │
├────────────────────────────────────────────────────────────────┤
│ Tricks sharing the butterfly wing-motion + cross-body          │
│ recovery (12 in pilot tier, observational topology layer).     │
│                                                                │
│ Walking-family variants                              ADD       │
│   ripwalk (stepping op)              4                         │
│   sidewalk (stepping ss)             4                         │
│   dimwalk (pixie op)                 4                         │
│   parkwalk (pixie ss)                4                         │
│   bigwalk (multi-modifier)           5                         │
│                                                                │
│ Modifier-compound variants                                     │
│   matador (you are here) — nuclear   5                         │
│   phoenix (pixie + ducking)          5                         │
│   tripwalk (quantum)                 4                         │
│                                                                │
│ Self-atom variant                                              │
│   dada-curve (no-foot-plant)         4                         │
│                                                                │
│ Anchor:   butterfly                  3                         │
└────────────────────────────────────────────────────────────────┘
```

**Layer attribution:** observational-symbolic; topology classification differs from IFPA `trick_family=butterfly` only in scope (this panel shows topology spread; IFPA family is a strict subset).

---

## Panel 2 — Modifier bridges

**Symbolic source:** `symbolic_modifier_groups.csv` + cohort growth across SCALE pilot batches.
**Educational goal:** show how one modifier composes onto multiple bases.

### Mockup — on `/freestyle/tricks/spinning-whirl`

```
┌────────────────────────────────────────────────────────────────┐
│ Modifier bridge — spinning                                      │
├────────────────────────────────────────────────────────────────┤
│ The spinning modifier (+1 ADD flat per pt10) bridges across    │
│ 13 pilot-tier base families. Same modifier; different bases.   │
│                                                                │
│ on whirl (you are here)              4   spinning-whirl         │
│ on osis                              4   spinning-osis          │
│ on torque                            5   spinning-torque        │
│ on butterfly                         —   (not yet pilot)        │
│ on drifter                           —   (spender = par+spin)   │
│ on clipper                           4   spinning-clipper       │
│ on symposium-whirl                   5   spinning-symposium-w   │
│                                                                │
│ Multi-modifier compounds using spinning:                       │
│   spender (paradox + spinning)       6   on blender base        │
│   surge (spinning + stepping)        5                         │
│   surgery (rev-whirl + paradox+spin) 6                         │
│   montage (5-mod incl spinning)      7                         │
│   surreal (paradox+spin+step+whirl)  6                         │
│                                                                │
│ Sibling modifiers (also +1 / +2 rotational):                   │
│   paradox / ducking / symposium / stepping                     │
└────────────────────────────────────────────────────────────────┘
```

---

## Panel 3 — Symbolic decomposition

**Symbolic source:** `symbolic_equivalence_clusters.csv` + `CORE_TRICK_SYMBOLIC_TABLE.csv` (James-shorthand).
**Educational goal:** show multiple equivalent decomposition readings of a single trick across layers.

### Mockup — on `/freestyle/tricks/torque`

```
┌────────────────────────────────────────────────────────────────┐
│ Decomposition — torque                                          │
├────────────────────────────────────────────────────────────────┤
│ Asserted ADD: 4    (editorial truth — IFPA dictionary)         │
│                                                                │
│ ╭ CANONICAL IFPA (pt11) ──────────────────────────────────╮   │
│ │ torque = miraging-osis                                  │   │
│ │   miraging modifier (+1) on osis base (3) = 4 ADD ✓     │   │
│ ╰──────────────────────────────────────────────────────────╯   │
│                                                                │
│ ╭ SYMBOLIC GRAMMAR ──────────────────────────────────────╮   │
│ │ start  = [set]                                          │   │
│ │ uptime = front-spin-dex (rotational arc)                │   │
│ │ midtime= miraging body intensity                        │   │
│ │ downtime= osis hippy-in extended arc                    │   │
│ │ finish = op toe                                         │   │
│ │ Topology: torque-rotational-topology                    │   │
│ ╰──────────────────────────────────────────────────────────╯   │
│                                                                │
│ ╭ OPERATIONAL NOTATION (FM) ────────────────────────────╮   │
│ │ (drawn from FM corpus; observational)                    │   │
│ ╰──────────────────────────────────────────────────────────╯   │
│                                                                │
│ ╭ EQUIVALENCE FAMILY ────────────────────────────────────╮   │
│ │ rotational-on-torque cluster (5 members):               │   │
│ │ • torque (you are here)                                  │   │
│ │ • spinning-torque (+1; mobius canonical)                 │   │
│ │ • atomic-torque (atomic-rotational +2)                   │   │
│ │ • blurry-torque (Red pt12 transitive-blurry pending)     │   │
│ │ • mobius = spinning-torque = spinning ss miraging op osis│   │
│ ╰──────────────────────────────────────────────────────────╯   │
└────────────────────────────────────────────────────────────────┘
```

**Layer separation:** each layer has its own visual box; never collapse into a single "definition."

---

## Panel 4 — Movement archetype

**Symbolic source:** `movement_archetype_registry.csv` (11 archetypes).
**Educational goal:** show the movement shape the trick exemplifies.

### Mockup — on `/freestyle/tricks/ripwalk`

```
┌────────────────────────────────────────────────────────────────┐
│ Movement archetype — Uptime dex + Downtime butterfly wing       │
├────────────────────────────────────────────────────────────────┤
│ A 4-5 ADD movement shape where a dex flick (uptime) opens       │
│ into a butterfly wing motion (downtime) with cross-body         │
│ clipper recovery.                                              │
│                                                                │
│   Anchor (3-ADD foundation)                                    │
│   └─ butterfly                            3                    │
│                                                                │
│   Modifier additions (4-ADD tier)                              │
│   ├─ stepping → ripwalk (you are here)    4                    │
│   ├─ stepping → sidewalk (ss)             4                    │
│   ├─ pixie    → dimwalk                   4                    │
│   ├─ pixie    → parkwalk (ss)             4                    │
│   ├─ quantum  → tripwalk                  4                    │
│   └─ atomic   → atomic-butterfly = legbeater  4                │
│                                                                │
│   Multi-modifier (5-ADD tier)                                  │
│   ├─ pixie + ducking → phoenix            5                    │
│   ├─ nuclear         → matador            5                    │
│   └─ bigwalk (multi-mod)                  5                    │
│                                                                │
│   No-modifier no-step variant                                  │
│   └─ dada-curve (no-foot-plant; self-atom) 4                   │
└────────────────────────────────────────────────────────────────┘
```

**Note:** archetype groups complement IFPA family but don't replace it. Phoenix appears here AND in the symposium-cohort archetype (cross-cuts).

---

## Panel 5 — Symbolic families

**Symbolic source:** all 5 `symbolic_*_groups.csv` (62 groups total).
**Educational goal:** show every symbolic group the trick belongs to (multi-axis classification).

### Mockup — on `/freestyle/tricks/phoenix`

```
┌────────────────────────────────────────────────────────────────┐
│ Symbolic families — phoenix                                     │
├────────────────────────────────────────────────────────────────┤
│ Topology              butterfly-wing-topology                   │
│ Modifier (set)        pixie-family                              │
│ Modifier (body)       ducking-family                            │
│ Dex mechanic          wing-motion-dex                           │
│ Contact start         clipper-start (typical)                  │
│ Contact finish        clipper-ending (xbd)                     │
│ Movement archetype    uptime-dex + downtime-butterfly-wing     │
│ Equivalence cluster   wing-on-butterfly (10 members)            │
│                                                                │
│ Note: this is observational classification; IFPA               │
│ trick_family = butterfly remains canonical.                    │
└────────────────────────────────────────────────────────────────┘
```

**Layer attribution:** observational-symbolic; explicit non-canonical disclaimer.

---

## Panel 6 — Related operators

**Symbolic source:** `UX1_GLOSSARY_TOKEN_MATRIX.csv` + glossary v4 crosslinks.
**Educational goal:** surface operational-notation operators relevant to the trick.

### Mockup — on `/freestyle/tricks/paradox-mirage`

```
┌────────────────────────────────────────────────────────────────┐
│ Related operators (operational notation)                        │
├────────────────────────────────────────────────────────────────┤
│ (PDX)   Paradox-direction dex marker — fires when this dex     │
│          is the paradox flick (hip pivot under bag from XBD).  │
│ (DEX)   Dexterity component flag — applies to the dex beat.    │
│ (DEL)   Delay/stall component flag — applies to terminal toe.  │
│                                                                │
│ Pre-states relevant to this row's operational form:            │
│ (back)   When the trick is executed back-direction.            │
│                                                                │
│ Glossary cross-references:                                      │
│   • Paradox (modifier family; +1 universal)                    │
│   • X-Dex (cross-comparison; toe-set analog per pt1)           │
│   • Pdx-Whirl-Free (PWF; subcategory excluding pdx-whirl)      │
│   • PS = Paradox Symposium                                      │
└────────────────────────────────────────────────────────────────┘
```

---

## Panel 7 — Mechanical progression

**Symbolic source:** SCALE pilot prose + topology-coherence data.
**Educational goal:** show the foundation → compound progression for the trick.

### Mockup — on `/freestyle/tricks/montage` (7-ADD flagship)

```
┌────────────────────────────────────────────────────────────────┐
│ Mechanical progression — montage (7 ADD; flagship density)      │
├────────────────────────────────────────────────────────────────┤
│ Foundation:                                                    │
│   whirl (3 ADD; rotational base anchor)                        │
│                                                                │
│ Single-modifier compounds (4 ADD):                             │
│   spinning-whirl   paradox-whirl   ducking-whirl               │
│   stepping-whirl   symposium-whirl                              │
│                                                                │
│ Two-modifier compounds (5 ADD):                                │
│   spinning-paradox-whirl   spinning-symposium-whirl            │
│   paradox-symposium-whirl  (PS Whirl — see PassBack glossary)  │
│                                                                │
│ Three-modifier compound (6 ADD):                               │
│   mullet = paradox + symposium + ducking + whirl               │
│                                                                │
│ Four-modifier flagship (7 ADD; you are here):                  │
│   montage = paradox + symposium + ducking + spinning + whirl   │
│                                                                │
│ Cohort context: whirl-family has 17 IFPA pilot rows; the       │
│ symbolic-grammar layer confirms this family is mechanically    │
│ coherent (topology coherence = 1.00 per SG-2 analysis).        │
└────────────────────────────────────────────────────────────────┘
```

---

## Panel 8 — Cross-family bridges

**Symbolic source:** modifier-cohort data crossing IFPA family boundaries.
**Educational goal:** show modifiers that cut across many IFPA families (educational reach).

### Mockup — on `/freestyle/tricks/spinning-whirl`

```
┌────────────────────────────────────────────────────────────────┐
│ Cross-family bridge — spinning modifier                         │
├────────────────────────────────────────────────────────────────┤
│ The spinning modifier composes with bases across 7+ IFPA       │
│ trick_family values. One modifier; many families.              │
│                                                                │
│ IFPA family    : pilot example          ADD                    │
│ ─────────────────────────────────────────                      │
│ whirl          : spinning-whirl (here)  4                      │
│ osis           : spinning-osis          4                      │
│ torque         : spinning-torque        5    (mobius canonical) │
│ clipper        : spinning-clipper       4                      │
│ blender        : spender                6    (paradox + spin)   │
│ butterfly      : surreal                6    (multi-mod)        │
│ stepping       : surge                  5    (spinning + step)  │
│                                                                │
│ Why this matters: the spinning rule (+1 ADD flat per pt10)     │
│ is the same regardless of which family the base belongs to.    │
│ Once you understand spinning on whirl, the rule generalizes.   │
│                                                                │
│ Sibling modifiers that share this cross-family reach:          │
│   paradox / ducking / pixie / symposium / stepping / atomic    │
│                                                                │
│ Observational: this view is a symbolic-layer cross-cut; it     │
│ does NOT change IFPA family classifications.                   │
└────────────────────────────────────────────────────────────────┘
```

---

## Panel rendering rules (all 8 panels)

1. **Layer-attribution header** — every panel carries an explicit "Layer 3: observational symbolic grammar" or "Layer 4: operational notation" badge in production. This mockup uses footer note instead.
2. **No ADD-value mutation** — every cited ADD is read-only from `freestyle_tricks.adds`.
3. **No IFPA family rewrite** — panels reference IFPA `trick_family` but never propose changes.
4. **Modifier-stub exclusion** — the 18 modifier-stub rows (per `feedback_modifier_public_visibility.md`) are filtered from all panels.
5. **Empty-state handling** — when a trick has zero members in a relevant group, the panel hides rather than showing an empty list.
6. **Pilot-tier rendering preference** — pilot rows are rendered prominently; non-pilot rows are rendered as name-only.

## Cross-references

- SG-2 nav-prototype `01_related_topology_tricks.md` — Panel 1 implementation spec
- SG-2 nav-prototype `04_mechanical_progression.md` — Panel 4 + 7 implementation spec
- SG-2 nav-prototype `05_symbolic_decomposition.md` — Panel 3 implementation spec
- `EVALUATION_AND_RECOMMENDATION.md` — per-panel usefulness assessment
