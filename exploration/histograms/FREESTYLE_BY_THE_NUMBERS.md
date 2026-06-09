# Freestyle By The Numbers

Six histograms, one dictionary. Each is a different lens on the same 683 active trick-kind rows.
**Actual counts, computed live from `database/footbag.db`** (re-runnable, not a baked snapshot).
Population excludes the 22 modifier/operator/pending rows that are not tricks.

| Histogram | Question | Completeness |
|---|---|---|
| Difficulty (ADD) | How layered are tricks? | complete (683/683) |
| Dexterity Ecology | How many dexes define tricks? | 61 Unknown (notation pending) |
| Terminal Topology | How do tricks finish? | complete (683/683, via `trick_family`) |
| Entry Topology | How do tricks begin? | surface 622/683; set-systems complete |
| Body Topology | What body movements shape tricks? | complete (via `modifier_links`) |
| Component Ecology | What modifiers dominate the vocabulary? | complete (modifier view); token view undercounts the 61 |

---

## 1. Difficulty (ADD) -- "How layered are tricks?"

| ADD | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| tricks | 18 | 32 | 116 | **236** | 193 | 65 | 21 | 2 |

The vocabulary is a bell curve peaking hard at **4 ADD (236 tricks, 35%)**, with the 3-5 band
holding 545 of 683 (80%). One-and-two-ADD primitives are rare (50 total); the 7-8 ADD tail is the
elite frontier (23). "Layering" is additive: each modifier or dex adds roughly one, so the curve is
really a count of how many transformations the named vocabulary stacks before a move earns its own
name.

- **Dictionary navigation:** this IS the default browse -- `?view=add` (the By ADD ladder).
- **Glossary:** anchors the run-quality vocabulary in glossary terms (tiltless = all 2+, guiltless
  = all 3+, tripless 4+, fearless 5+, beastly 6+, godly 7+).

## 2. Dexterity Ecology (dex-count) -- "How many dexes define tricks?"

| dexes | 0 | 1 | 2 | 3+ | Unknown |
|---|---|---|---|---|---|
| tricks | 46 | 209 | **283** | 84 | 61 |

Most named tricks are **2-dex (283)**; the 1-dex tier (209) is the workhorse, and 3+ (84) is the
deep-compound tail. 0-dex (46) are the body/stall primitives. The 61 Unknown are rows still
awaiting `operational_notation` (the notation-recovery effort is draining this bucket: it was 67
before the Cohort-1 slice).

- **Dictionary navigation:** `?view=dex-count` (By dex count).
- **Glossary:** the dex direction subsection (in/out, same/op) that teaches what a "dex" is.

## 3. Terminal Topology (families) -- "How do tricks finish?"

80 terminal families; top 16 by membership:

| family | n | family | n |
|---|---|---|---|
| whirl | 83 | clipper-stall | 25 |
| mirage | 73 | blender | 22 |
| butterfly | 50 | torque | 22 |
| legover | 46 | inside-stall | 18 |
| osis | 46 | double-leg-over | 16 |
| illusion | 34 | drifter | 14 |
| swirl | 34 | barfly | 13 |
| pickup | 27 | eggbeater | 13 |

A trick's family is its terminal identity -- the landing structure descendants preserve even as
modifiers stack on the entry (a `spinning-whirl` still "is" a whirl). **Whirl (83) and mirage (73)**
are the deepest lineages; the long tail of 80 families is what makes the dictionary feel large.
(This is family membership; a separate lens -- which physical surface a trick *catches* on -- is
dominated by clipper and toe and lives in the Set/surface layer.)

- **Dictionary navigation:** `?view=family` + the family-card grid.
- **Glossary:** §Core Trick Families, the "How tricks end" histogram (the public Terminal chart).

## 4. Entry Topology (sets / surfaces) -- "How do tricks begin?"

Entry surface: **toe-set 257, clip-set 243**, generic set/other 122, unknown 61.

Named set-systems (the launches that open a trick):

| system | symposium | paradox | pixie | fairy | stepping | quantum | atomic | blurry | nuclear | furious |
|---|---|---|---|---|---|---|---|---|---|---|
| tricks | 87 | 67 | 63 | 58 | 57 | 21 | 11 | 6 | 6 | 2 |

Tricks begin two ways: a **catch-surface set** (toe or clipper, near-evenly split, 500 of 683) and
an optional **named set-system** layered on top. Symposium (87), paradox (67), and the pixie/fairy
launch family lead; the rare systems (nuclear, furious) mark the experimental frontier.

- **Dictionary navigation:** `?view=sets` (the Set Hub) + the Set Encyclopedia at `/freestyle/sets`.
- **Glossary:** §Timing & Sets, the "How tricks begin" histogram (the public Entry chart).

## 5. Body Topology (body modifiers) -- "What body movements shape tricks?"

| modifier | ducking | spinning | gyro | diving | tapping | whirling | miraging | swirling | barraging |
|---|---|---|---|---|---|---|---|---|---|
| tricks | **90** | **86** | 42 | 26 | 21 | 18 | 16 | 15 | 10 |

Two body movements dominate the vocabulary: **ducking (90)** -- dropping the body under the bag --
and **spinning (86)** -- the full-body rotation. The rotational cluster (spinning + gyro + whirling
+ swirling) is the single biggest body theme; ducking + diving are the body-passage theme. This is
the curated-membership view (`modifier_links`); the raw notation confirms it (`spin [BOD]` 250
events, `duck [BOD]` 105).

- **Dictionary navigation:** `?view=movement-system` / `?view=topology` (Movement Neighborhoods) +
  the operator board.
- **Glossary:** §6 modifier feel cards (the embodied "how it feels" layer).

## 6. Component Ecology (modifiers) -- "What modifiers dominate the vocabulary?"

28 distinct modifiers; top 15 by trick count:

| modifier | ducking | symposium | spinning | paradox | pixie | fairy | stepping | gyro | diving | tapping | quantum | whirling | miraging | swirling | atomic |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| tricks | 90 | 87 | 86 | 67 | 63 | 58 | 57 | 42 | 26 | 21 | 21 | 18 | 16 | 15 | 11 |

Notation component tokens (occurrence across the corpus): **cross-body [XBD] 337**, op-in-dex 252,
spin [BOD] 250, op-out-dex 222, same-in-dex 173, same-out-dex 150, duck [BOD] 105, paradox-dex
[PDX] 84, dive [BOD] 29, jump [BOD] 11.

Seven modifiers (ducking, symposium, spinning, paradox, pixie, fairy, stepping -- all 57+) carry
the bulk of the named vocabulary; the other 21 are specialist. At the atomic level, **cross-body
movement (337) is the single most common structural component** -- more tricks cross the body than
do anything else.

- **Dictionary navigation:** `?view=component` + the By Modifier clusters.
- **Glossary:** §7 operators/modifiers + the operator board's tiered modifier reference.

---

## Landing-page placement proposal

**A "Freestyle by the Numbers" band on the `/freestyle` landing**, below the demo video and
Featured strip, as a row of six compact stat-cards -- one per histogram -- each showing its
headline number and a sparkline-style mini-bar, and each linking into its dictionary browse view.
It is the natural sibling of the foundational-tricks mosaic already on that page: the mosaic shows
*what the atoms are*, this band shows *how the whole vocabulary distributes*.

Design + governance:

- **One live computation, six lenses.** Compute all six at request time (or build-generate with a
  count-level CI guard) from the live DB -- never bake the counts (the glossary's two baked
  histograms already drifted; see `HISTOGRAM_INVENTORY.md`). The six cards read from one source so
  they can never disagree with the dictionary they link to.
- **Landing = primary surface; glossary = pedagogy.** The landing band is the canonical home for
  the full six-family picture. The glossary keeps only its two inline charts (Terminal "how tricks
  end", Entry "how tricks begin") as teaching context, sourced from the same computation.
- **Each card is a gateway.** Difficulty -> `?view=add`; Dexterity -> `?view=dex-count`; Terminal
  -> `?view=family`; Entry -> `?view=sets`; Body -> `?view=movement-system`; Component ->
  `?view=component`. The band turns the headline numbers into the front door of the dictionary's
  six browse axes.
- **Honesty marker.** While the 61 Unknown-dex rows persist, the Dexterity card carries a small
  "+61 pending notation" footnote rather than hiding them -- the notation-recovery slices visibly
  shrink it over time.
