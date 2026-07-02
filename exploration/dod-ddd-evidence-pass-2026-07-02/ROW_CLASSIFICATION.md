# DOD / DDD frontier cluster: 46-row evidence classification

> **Partially superseded (same day, 2026-07-02)** by `PASSBACK_SOURCING_REPORT.md`. The
> "far"/"near" tokens in row names are PassBack leg-selection tokens, not receiver
> qualifiers; several calls below are corrected there. In particular
> spinning-near-double-down is NOT C-DDD (it is Bullwhip), and rows 1, 3, 34 change
> character. Read the sourcing report's section 7 before using this table.

Date: 2026-07-02. Companion to `RED_PACKET_A1_REVISED.md`.
Rows: every `cluster: "dod-ddd"` entry in `src/content/freestyleObservationalUniverse.ts` (46).
JOB evidence universe: `legacy_data/out/scraped_footbag_moves.csv` (FB.org scrape; the only
source in the repo holding verbatim down-family JOBs) plus shipped rows in
`src/content/freestyleResolvedFormulas.ts`. FM / PB / SG rows carry no notation.

Classes:
- **C-DOD / C-DDD**: JOB (direct or via a JOB-anchored sibling chassis) confirms the base.
- **CONFLICT**: folk name contradicts the JOB; base is still determined (by the JOB).
- **NOJOB**: no JOB anywhere in the repo; mechanical under ruling R1 once a JOB is sourced.
  "Lean" records the sibling-prior only; it is a hypothesis, not evidence.
- **ADJ-OTHER**: gated by a different open item (pogo, osis token, barraging chassis reading),
  not by the DOD/DDD ruling.

## Classification table

| # | slug | src | folk | evidence | base | agree | conf | class |
|--|--|--|--|--|--|--|--|--|
| 1 | spinning-far-double-down | PB | DDD | Scorpion's Tail JOB (103): spinning + DDD chassis; "far" is a receiver qualifier | DDD | yes | HIGH | C-DDD |
| 2 | spinning-near-double-down | PB | DDD | same anchor (103) | DDD | yes | HIGH | C-DDD |
| 3 | shooting-far-double-down | PB | DDD | Shooting Star JOB (265) traces to DDD cell; "far" qualifier | DDD | yes | MED-HI | C-DDD |
| 4 | gyro-shooting-double-down-gyro-shooting-star | SG | DDD | 265 anchor + gyro (spin body op, parity-neutral) | DDD | yes | MED-HI | C-DDD |
| 5 | shooting-ddd-shooting-star | SG | DDD | direct: 265 traces to DDD cell | DDD | yes | HIGH | C-DDD; duplicate of shipped `shooting_star`, whose shipped base (double-over-down) needs correction |
| 6 | atomic-double-over-down | FM | DOD | direct: Fusion JOB (167); parity-normalized = atomic + DOD | DOD | yes | HIGH | C-DOD; duplicate of shipped `fusion`, reconcile as alias |
| 7 | spinning-symposium-double-over-down | FM | DOD | direct: JOB 255 (scrape names it Spinning Symposium **Down Double Down**) traces to DDD cell | DDD | **no** | HIGH | CONFLICT |
| 8 | shooting-star-shooting-double-over-down | FB | DOD | direct: JOB 265 traces to DDD cell | DDD | **no** | HIGH | CONFLICT; this is the shipped row itself, base correction candidate |
| 9 | sailing-dod | SG | DOD | none; sailing = pixie-illusion chassis, pixie sibling (244) is DOD | lean DOD | - | LOW | NOJOB |
| 10 | fairy-spinning-double-over-down | FM | DOD | none; fairy is pixie-adjacent, DOD prior | lean DOD | - | LOW | NOJOB |
| 11 | pixie-spinning-double-over-down | FM | DOD | none; Pixie DOD JOB (244) is DOD | lean DOD | - | LOW | NOJOB |
| 12 | toe-set-spinning-double-over-down | FM | DOD | none; explicit toe entry + spin (parity-neutral) | lean DOD | - | LOW | NOJOB |
| 13 | dod-reverse-swirl | SG | DOD | none; DOD-swirl JOB (162) gives the swirl chassis, reverse-swirl unattested | lean DOD | - | LOW | NOJOB |
| 14 | pixie-quantum-double-over-down-swirl | FM | DOD | none; quantum + swirl both attested separately, composition not | lean DOD | - | LOW | NOJOB |
| 15 | atomic-os-symposium-double-over-down | FM | DOD | none; folk DOD but symposium siblings run clipper-entry | unknown | - | - | NOJOB |
| 16 | clipper-set-ss-symposium-double-over-down | FM | DOD | none; explicit clipper entry cuts against the DOD folk name | unknown | - | - | NOJOB (conflict-flag) |
| 17 | flailing-ss-symposium-double-over-down | FM | DOD | none | unknown | - | - | NOJOB |
| 18 | stepping-ducking-far-double-over-down | FM | DOD | none; folk-conflict pair with row 27 (same trick, opposite folk names across sources) | unknown | - | - | NOJOB (pair-flag) |
| 19 | nuclear-double-over-down | FM | DOD | none; nuclear expansion is ruled (paradox + downtime illusion), traceable once a JOB exists | lean DOD | - | LOW | NOJOB |
| 20 | symposium-down-double-down | FM | DDD | none; JOB 255 (spinning-symposium) is DDD, strong sibling prior | lean DDD | - | MED | NOJOB |
| 21 | stepping-far-double-down | PB | DDD | none; Blurrier JOB (243) = stepping + DDD supports | lean DDD | - | MED | NOJOB |
| 22 | stepping-near-double-down | PB | DDD | same prior | lean DDD | - | MED | NOJOB |
| 23 | stepping-far-symp-double-down | PB | DDD | none; Torch-r Rack (281) traces DDD-cell | lean DDD | - | MED | NOJOB |
| 24 | clipper-far-symp-double-down | PB | DDD | none; symposium siblings clipper-entry / DDD | lean DDD | - | LOW | NOJOB |
| 25 | clipper-near-symp-double-down | PB | DDD | same | lean DDD | - | LOW | NOJOB |
| 26 | clipper-ducking-far-double-down | PB | DDD | none | lean DDD | - | LOW | NOJOB |
| 27 | stepping-ducking-far-double-down | PB | DDD | none; folk-conflict pair with row 18 | unknown | - | - | NOJOB (pair-flag) |
| 28 | toe-far-symp-double-down | PB | DDD | none; explicit toe entry vs DDD folk name, Paradon-cell possible | unknown | - | - | NOJOB (conflict-flag) |
| 29 | toe-near-symp-double-down | PB | DDD | same | unknown | - | - | NOJOB (conflict-flag) |
| 30 | miraging-far-symp-double-down | PB | DDD | none | lean DDD | - | LOW | NOJOB |
| 31 | atomic-far-double-down | PB | DDD | none; under R1 the atomic insertion is strippable once a JOB exists | lean DDD | - | LOW | NOJOB |
| 32 | atomic-ducking-far-double-down | PB | DDD | same | lean DDD | - | LOW | NOJOB |
| 33 | atomic-far-symp-double-down | PB | DDD | same | lean DDD | - | LOW | NOJOB |
| 34 | quantum-far-double-down | PB | DDD | none; Plasma (249) is quantum + DOD, so this claims a *different* trick (quantum + DDD), plausible but unattested | lean DDD | - | LOW | NOJOB |
| 35 | pixie-far-double-down | PB | DDD | none; only JOB-anchored pixie sibling (244) is DOD, tension noted | unknown | - | - | NOJOB (conflict-flag) |
| 36 | pixie-near-double-down | PB | DDD | same | unknown | - | - | NOJOB (conflict-flag) |
| 37 | nuclear-far-double-down | PB | DDD | none; nuclear expansion ruled, traceable once JOB'd | lean DDD | - | LOW | NOJOB |
| 38 | nuclear-ddd-cold-fusion-geesha | SG | DDD | none; same | lean DDD | - | LOW | NOJOB |
| 39 | surging-far-double-down | PB | DDD | none; surging is a spin-family body op (parity-neutral), Scorpion's Tail analogy | lean DDD | - | LOW | NOJOB |
| 40 | frantic-far-double-down-swirl | PB | DDD | none; frantic is a known set, swirl known, composition unattested | lean DDD | - | LOW | NOJOB |
| 41 | tapping-double-down | PB | DDD | none; shipped `tapping_double_over_down` is DOD, so this claims a distinct DDD sibling | unknown | - | - | NOJOB (conflict-flag) |
| 42 | barraging-far-double-down | PB | DDD | barraging chassis circles inward (OP IN, SAME IN per shipped barfly rows); may not contain a down base at all | unknown | - | - | ADJ-OTHER |
| 43 | barraging-near-double-down | PB | DDD | same | unknown | - | - | ADJ-OTHER |
| 44 | barraging-ss-double-double-down | FM | DDD | same, plus "double double" doubling unresolved | unknown | - | - | ADJ-OTHER |
| 45 | double-down-near-osis | PB | DDD | osis continuation token unresolved (separate open item) | unknown | - | - | ADJ-OTHER |
| 46 | pogo-nuclear-far-double-down | PB | DDD | pogo ADD is its own open Red item | unknown | - | - | ADJ-OTHER |

## Tally

| class | count | notes |
|--|--|--|
| C-DDD | 5 | rows 1-5 |
| C-DOD | 1 | row 6 (duplicate of shipped fusion) |
| CONFLICT (folk wrong, base = DDD) | 2 | rows 7-8 |
| NOJOB | 33 | mechanical under R1 once a JOB is sourced; 8 carry conflict/pair flags |
| ADJ-OTHER | 5 | gated by pogo / osis / barraging readings, not by this ruling |

Net immediate mechanical promotions if R1 is ratified: **~5** (rows 1-4 plus row 7 with its
folk name corrected). Rows 5, 6, 8 are reconcile/dedup/correction actions against shipped rows.

Notable cross-source signal: **zero frontier rows confirm DOD as a new promotion**; every clean
JOB read landed DDD, and the only C-DOD row is the shipped Fusion duplicate. The DOD side of the
frontier is folk-name-inflated.

## Appendix A: corpus parity traces (all 14 down-family JOBs)

Trace = contact-relative leg tracking, entry side normalized to R. Produced by
`parity_trace.py` (this directory); reproducible from the scrape CSV.

| id | source name | alt | entry | dex legs | catch | cell |
|--|--|--|--|--|--|--|
| 97 | Double-Over Down | | TOE(R) | R,R | L | **DOD** |
| 98 | Down Double-Down | | CLIP(R) | L,L | R | **DDD** |
| 120 | Paradon | | TOE(R) | L,L | R | Paradon cell |
| 162 | Double-Over Down Swirl | | TOE(R) | R,R,L | L | DOD |
| 164 | Down Diver | Diving Down Double-Down | TOE(R) | R,R | L | DOD (folk alias wrong) |
| 167 | Fusion | Atomic Double Over Down | TOE(R) | L,R,R | L | DOD (atomic dex stripped) |
| 244 | Pixie Double Over Down | | TOE(R) | R,R,R | L | DOD |
| 249 | Plasma | Quantum Double Over Down | TOE(R) | L,R,R | L | DOD (quantum dex stripped) |
| 103 | Scorpion's Tail | Spinning Down Double-Down | CLIP(R) | L,L | R | DDD |
| 290 | Bullwhip (variant A) | Spyro Double Down | CLIP(R) | R,R | L | unnamed cell 4 |
| 290 | Bullwhip (variant B) | Spyro Double Down | TOE(R) | L,L | R | Paradon cell |
| 243 | Blurrier | Stepping Down Double Down | CLIP(R) | L,L,L | R | DDD (terminal pair reads SAME/SAME: raw-terminal method fails here) |
| 255 | Spinning Symposium Down Double Down | | CLIP(R) | L,L | R | DDD |
| 265 | Shooting Star | Shooting Double Over Down | CLIP(R) | L,R,L,L | R | DDD (shipped base says DOD: correction candidate) |

Prose cross-checks validating contact-relative labeling: 98 ("delay ... on your right clipper
again" = same side, printed OP CLIP), 97 ("catch on a left leg clipper" = cross side, printed
OP CLIP), 120 ("circle twice with your left leg ... catch on a right clipper delay" = L,L + R).
