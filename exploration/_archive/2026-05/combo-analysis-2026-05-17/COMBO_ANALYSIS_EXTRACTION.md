# Combo-Analysis Extraction from v6 Evolution Report

Slice: Combo Analysis & Run Architecture extraction (2026-05-17). Read-only synthesis.

## Source

`legacy_data/inputs/curated/records/FREESTYLE_EVOLUTION_REPORT.md` (v6, 404 lines, 2026-04-07).

## Why this extraction

The v6 report mixes three distinct kinds of material: (1) historical evolution of the vocabulary, (2) statistical analysis of player and event data, and (3) **combo-architecture pedagogy** — observations about how tricks combine into sequences, where risk concentrates, why certain transitions dominate. The third kind is not naturally history; it's an educational layer about how runs are built. This extraction isolates that layer so a future `/freestyle/combo-analysis` (or similar) surface can carry it without polluting `/freestyle/history`.

## Concepts extracted from v6 (with source lines)

### Sequence-architecture vocabulary

| Concept | v6 source | Distillation |
|---|---|---|
| **Setup trick** | §5 line 153–161 | A lower-ADD opening element that creates conditions for a higher-difficulty resolution |
| **Resolution trick** | §5 line 153–161 | A higher-ADD rotational terminus where the sequence lands cleanly |
| **Launch node** | §4 line 124 (blurry whirl) | A trick that disproportionately *initiates* sequences — high outbound transition count |
| **Attractor / terminus** | §4 line 124 (whirl) | A trick that disproportionately *resolves* sequences — high inbound transition count |
| **Throughput node** | §4 line 136 (dimwalk), §5 line 174 (ripwalk) | A trick that appears mid-sequence with high outbound count exceeding inbound — pure connector |
| **Sink** | §5 line 175 (swirl) | A trick that absorbs sequence flow but does not feed onward |
| **Pure terminus** | §5 line 177 (superfly) | Out-degree 1 — appears at sequence end and nowhere else |
| **Recovery trick** | §5 line 164–166 | Low-ADD element inserted between high-ADD sequences (legover→legover, clipper→clipper, whirl→whirl) |
| **Stabilization** | §5 implicit (recovery + resolution patterns) | Resetting the body to a controlled state mid-sequence |
| **Difficulty stacking** | §5 line 164–166 | The opposite of recovery: consecutive ultra-high-ADD tricks with no recovery between (food processor → mobius, 11 combined ADD) |

### Difficulty-architecture vocabulary

| Concept | v6 source | Distillation |
|---|---|---|
| **Concentration strategy** | §10 line 365 | 2–3 tricks averaging 5–6 ADD each. High ceiling, high collapse risk |
| **Breadth strategy** | §10 line 369 | 4–7 tricks averaging 3–4 ADD each. Lower ceiling, accumulation risk |
| **Per-trick ADD density** | §6 line 222–234 | avg_add/trick metric distinguishing concentration players (≥5.0) from breadth players |
| **Sequence risk** | §10 line 367–369 (architectural framings) | The collapse/error mode appropriate to each strategy — single-miss vs accumulation-break |
| **Sequence length** | §5 line 152, §6 line 213–216 | Mean 2.4 tricks; 22-ADD chain ran 7 tricks; 3-trick chains 35-55% of corpus |
| **Difficulty plateau** | §6 line 204–207 | Mean ADD held at 7-9 band for 22 years; the standard didn't escalate, but the player pool reaching it widened |

### Transition-topology vocabulary

| Concept | v6 source | Distillation |
|---|---|---|
| **Asymmetric flow** | §4 line 126 | Sequences begin with high-complexity rotational entries and resolve into stable clipper-based terminations — a directional pattern |
| **Rotational cluster** | §4 line 142–144 | Tricks that share rotational mechanics tend to chain together (whirl ↔ torque ↔ swirl) |
| **Walking transitions** | §4 line 134–136 | The dimwalk / ripwalk family functions exclusively as connector tissue, not as terminals |
| **Clipper stabilization** | §4 line 124 implicit | Whirl's clipper-stall landing makes it the natural resolution — flow converges to stable catch surfaces |
| **Ducking transitions** | §8 implicit (Serge Kaldany) | The ducking family chains tend to compose with paradox and symposium on the body axis |
| **Paradox chains** | §4 line 138–140 | Paradox-modified compounds (paradox torque, paradox whirl, paradox blender) form a related cluster; declining post-2014 |

### Compositional-layering vocabulary

| Concept | v6 source | Distillation |
|---|---|---|
| **Modifier stacking** | §3 line 89–110 | Layering body / rotational / positional modifiers on a base trick; difficulty scales non-linearly with each addition |
| **Compositional layering** | §3 implicit | Each added modifier introduces a new simultaneous constraint on body motion within a single set cycle |
| **Sequence density** | §6 line 222–234 (avg/trick) | How tightly difficulty is packed per trick in a sequence |
| **Combo pacing** | §6 line 218 implicit | The rhythmic distribution of difficulty across sequence positions |

### Network-derived findings (translatable to pedagogy)

| Finding | v6 line | Pedagogical translation |
|---|---|---|
| whirl has highest authority score (0.863), highest PageRank (0.126) | §4 line 121 | Whirl is where sequences end up — the gravitational center of the vocabulary |
| blurry whirl has highest hub score (0.695) | §4 line 124 | Blurry whirl is where sequences start — the most common opening statement |
| blurry whirl → whirl is the single most common 2-trick transition (17×, 15 players, 14 events) | §4 line 122, §5 line 158 | The canonical opening-and-resolution pair: high difficulty announces, then resolves |
| dimwalk out-degree 23 vs in-degree 15 | §4 line 136 | Dimwalk gives more than it takes — it's pure throughput, not a destination |
| swirl PageRank 0.093, hub 0.032 | §5 line 175 | Swirl absorbs — once you're in swirl, you tend to stay or end there |
| superfly out-degree 1 | §5 line 177 | Superfly is the last thing you do — nothing reliably follows it |
| paradox declining post-2014 | §4 line 140 | The community shifted weight to the blurry family; paradox compounds lost share |

### Architecture insights

| Insight | v6 source | Distillation |
|---|---|---|
| The asymmetric flow pattern (high-difficulty entry → stable termination) is a documented competitive convention | §4 line 124, §5 line 162 | This isn't accident; it's craft. Players preferentially open hard and resolve to control |
| Recovery tricks document acknowledged risk management | §5 line 164–166 | Inserting whirl → whirl mid-sequence is a "I needed a beat" maneuver, not laziness |
| The breadth strategy reaches 22 ADD (Solis 2008); concentration tops out at 16 (Hewitt 2007) | §6 line 218–220, §10 line 369–371 | Theoretical maximum favors length, but the sport rewards both routes |
| Difficulty plateau reflects biomechanical ceiling, not scoring choice | §11 line 376–387 | A physical bound, not a community taste — explains why 22 ADD doesn't keep climbing |

## What this material is NOT

These are concepts about HOW TRICKS COMBINE, not about what individual tricks are. They belong on a **combo / run / sequence** surface, not on the trick dictionary, not on the glossary §3 (dexterities), not on individual trick-detail pages. Combo-analysis is a meta-layer above trick definition.

The four-layer ontology (canonical / educational / symbolic / operational) carries trick-level concepts. Combo-analysis is a **fifth layer** in that sense — sequence-level pedagogy that the existing four layers don't address.

## What this material IS

It's the seed of a **Run Architecture** educational surface. The vocabulary already exists in the v6 report; what's missing is a home for it that:
- isn't statistical-research-paper-style (the report's tone)
- isn't trick-dictionary-style (the dictionary is per-trick)
- isn't competition-history-style (the history page is timeline-driven)
- IS pedagogical, narrative, example-driven, structurally clear

The proposed `proposed_combo_analysis_page_structure.md` lays out what that home looks like.

## Cross-references

- `RUN_ARCHITECTURE_GLOSSARY_PLAN.md` — the formal taxonomy proposal
- `combo_examples.md` — worked examples translating these concepts
- `proposed_combo_analysis_page_structure.md` — page-level architecture
- `glossary_section_relocation_plan.md` — what moves from glossary §10
- `[[project_freestyle_state]]` — current movement-language work
- `[[project_glossary_v5_synthesis]]` — current §10 design context
