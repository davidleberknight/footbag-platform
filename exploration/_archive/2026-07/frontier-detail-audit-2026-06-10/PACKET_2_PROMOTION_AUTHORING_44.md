# Packet 2 — Promotion-authoring dry-run for the 44 deferred rows

**Dry-run only. No promotions written, no DB writes, no doctrine changes.** Classification +
proposed per-row data for the 44 re-triage rows from `packet2a_stale_doctrine.csv`.

## Headline

The 44 source **names** collapse to **31 distinct slugs** (the `ss` / `far` / `near` side-qualifiers
don't change the slug; parenthetical folk names fold to aliases). Of those 31:

| class | count | meaning |
|---|---:|---|
| **A — safe promotion now** | **6** | clean nuclear/quantum chassis on a canonical base, bracket-count == ADD, single reading, no blocker |
| **B — curator decision** | 13 | furious chassis (non-mechanical), illusioning rev-parity, multi-operator stacking order, or a reverse-base not yet canonical |
| **C — doctrine blocked** | 0 | none — every operator here (nuclear / furious / illusioning / quantum / symposium) is resolved; no DOD/DDD; no atomic/quantum-on-rotational X-Dex |
| **D — reject / already resolved** | 12 | already canonical/alias, a bare operator, or a structure already published under a folk name |

**So "re-triage 44 to authoring" overstated it:** 12 are already done, 13 need a ruling, and only **6 are
mechanically promotable now.** This is a coverage finding, not a promotion blocker.

---

## Class A — safe promotion now (6)

Nuclear chassis mirrored from `nuclear-illusion` (`CLIP > SAME OUT [PDX] [DEX] > {base body}`, +2);
quantum chassis from `quantum-drifter` (`TOE > OP IN [DEX] > {base body}`, +1). All bracket-count == ADD verified.

| proposed slug | title | ADD | op_notation | evidence | aliases | family | risk |
|---|---|---:|---|---|---|---|---|
| quantum-guay | Quantum Guay | 3 | `TOE > OP IN [DEX] > OP IN [DEX] > SAME INSIDE [DEL]` | SG | — | inside-stall | guay non-rotational → no X-Dex; clean |
| nuclear-guay | Nuclear Guay | 4 | `CLIP > SAME OUT [PDX] [DEX] > OP IN [DEX] > SAME INSIDE [DEL]` | SG | — | inside-stall | — |
| nuclear-drifter | Nuclear Drifter | 5 | `CLIP > SAME OUT [PDX] [DEX] > OP IN [DEX] > SAME CLIP [XBD] [DEL]` | FM, SG | 69 | clipper-stall | folk "69" → alias |
| nuclear-double-leg-over | Nuclear Double Leg Over | 5 | `CLIP > SAME OUT [PDX] [DEX] > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]` | FM, SG | Terminator | legover | folk "Terminator" → alias |
| nuclear-dyno | Nuclear Dyno | 6 | `CLIP > SAME OUT [PDX] [DEX] > OP OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` | FM, SG | Godzilla | dyno | folk "Godzilla" → alias |
| nuclear-torque | Nuclear Torque | 6 | `CLIP > SAME OUT [PDX] [DEX] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` | SG | — | osis | per loader-19 rule, pair with a `trick_family=osis` override (base torque is itself an osis branch) |

---

## Class B — curator decision needed (13)

| proposed slug | source names | ADD (est) | decision needed | evidence |
|---|---|---:|---|---|
| furious-drifter | Furious Drifter | ~5 | **furious chassis is non-mechanical** — the furious canonicals (fury, jani-walker, genesis…) vary per base (fury carries a `[PDX]`, others don't); needs a curator furious-chassis ruling before any furious-X is derivable | SG |
| furious-symposium-eggbeater | Furious Symposium Eggbeater (Walrus) | ~5 | furious + symposium multi-operator; chassis + order judgment | SG |
| furious-butterfly-swirl | Furious Butterfly Swirl (Tsunami) | ~5 | furious on a two-token base (butterfly-swirl); chassis + base judgment | SG |
| illusioning-flail | Illusioning Flail (Toe Massacre) | ~4 | **illusioning = rev(0) miraging** — the rev-parity direction is a judgment, not yet exemplar-pinned for non-kick bases | PB, SG |
| illusioning-legover | Illusioning Legover | ~3 | illusioning rev-parity on legover | MULTI |
| illusioning-symposium-butterfly | Illusioning Symposium Butterfly | ~4 | illusioning + symposium multi-operator order | PB |
| illusioning-symposium-eggbeater | Illusioning Symposium Eggbeater | ~5 | illusioning + symposium multi-operator order | PB |
| illusioning-symposium-mirage | Illusioning Symposium Mirage (Slaughter) | ~4 | illusioning + symposium multi-operator order | SG |
| nuclear-ducking-mirage | Nuclear Ducking Mirage (Sumo Thong) | ~5 | nuclear + ducking stacking order (nuclear-prefix vs duck-first) | FM, SG |
| nuclear-reverse-guay | Nuclear Reverse Guay | ~4 | reverse-guay base not canonical; needs the reverse derivation | SG |
| nuclear-reverse-whirl | Nuclear Reverse Whirl | ~5 | reverse-whirl base not canonical; needs the reverse derivation | SG |
| quantum-reverse-guay | Quantum Reverse Guay | ~3 | reverse-guay base not canonical; reverse derivation | SG |
| symposium-furious-legover | Symposium Furious Legover | ~5 | symposium + furious multi-operator; furious chassis unresolved (see above) | SG |

---

## Class D — reject / already resolved (12)

| proposed slug | source names | reason |
|---|---|---|
| nuclear | Nuclear | bare operator, not a trick (termination rule) |
| nuclear-illusion | Nuclear ss Illusion | already canonical (`is_active=1`) |
| nuclear-legover | Nuclear ss Legover | already canonical |
| nuclear-pickup | Nuclear ss Pickup | already canonical |
| nuclear-whirl | Nuclear ss Whirl, Nuclear ss Whirl (Hurl) | already canonical; folk "Hurl" → alias |
| nuclear-mirage | Nuclear far Mirage, Nuclear ss Mirage | already a registered alias |
| nuclear-butterfly | Nuclear Butterfly, Nuclear ss/far/near Butterfly, …(Barfry) | structure ≡ **matador** (canonical); folk "Barfry" → alias |
| nuclear-osis | Nuclear Osis, Nuclear Osis (Nucleosis)(Aeon Flux)(Paradox Flux) | structure ≡ **aeon-flux** (canonical); folk names → aliases |
| furious-mirage | Furious Mirage | structure ≡ **fury** (canonical) |
| furious-illusion | Furious Illusion, Furious Illusion (Fission) | structure ≡ **fission** (registered alias) |
| illusioning-osis | Illusioning far Osis | structure ≡ **flux** (canonical) |
| illusioning-symposium-illusioning-legover | Illusioning Symp. Illusioning Legover | malformed — `illusioning` appears twice (self-reference); not a valid composition |

---

## Recommended first slice — Class A only, lowest ADD first

Promote these 6 via the standard path (`red_additions` row + RESOLVED_FORMULAS + FIRST_CLASS tier +
RECONCILIATION flip → loader 19 → parser-populate → test), in ADD order, folk parentheticals wired as
aliases:

1. **quantum-guay** (3) — `TOE > OP IN [DEX] > OP IN [DEX] > SAME INSIDE [DEL]`
2. **nuclear-guay** (4) — `CLIP > SAME OUT [PDX] [DEX] > OP IN [DEX] > SAME INSIDE [DEL]`
3. **nuclear-drifter** (5) — `CLIP > SAME OUT [PDX] [DEX] > OP IN [DEX] > SAME CLIP [XBD] [DEL]` (alias: 69)
4. **nuclear-double-leg-over** (5) — `CLIP > SAME OUT [PDX] [DEX] > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]` (alias: Terminator)
5. **nuclear-dyno** (6) — `CLIP > SAME OUT [PDX] [DEX] > OP OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` (alias: Godzilla)
6. **nuclear-torque** (6) — `CLIP > SAME OUT [PDX] [DEX] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` (+ family=osis override)

Then the two prerequisite curator rulings unlock most of Class B in one pass each: **(i) the furious
chassis** (settles furious-drifter / furious-symposium-eggbeater / furious-butterfly-swirl /
symposium-furious-legover) and **(ii) the illusioning rev-parity for non-kick bases** (settles the 5
illusioning rows). The reverse-base rows need their `reverse-{whirl,guay}` bases canonicalized first.
