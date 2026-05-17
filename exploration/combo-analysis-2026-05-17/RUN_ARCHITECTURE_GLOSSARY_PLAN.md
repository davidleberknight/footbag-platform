# Run Architecture Glossary Plan

Slice: Combo Analysis extraction (2026-05-17). Planning doc.

## Purpose

A structured educational taxonomy for combo and run terminology. This plan organizes the concepts extracted from the v6 report into a four-section glossary that can ground a future `/freestyle/combo-analysis` (or similar) educational surface.

## Proposed taxonomy

### A. Run-quality terminology

Inherited from the current glossary §10 + ADD-analysis context. These describe *runs*, not individual tricks.

| Term | Plain-language definition | Source |
|---|---|---|
| Tiltless | Every trick in the run reaches at least ADD 2 | community convention |
| Guiltless | Every trick reaches at least ADD 3 | community convention |
| Tripless | Every trick reaches at least ADD 4 | community convention |
| Fearless | Every trick reaches at least ADD 5 | community convention |
| Beastly | Every trick reaches at least ADD 6 | community convention |
| Godly | Every trick reaches at least ADD 7 | aspirational; rarely achieved |
| Genuine | Guiltless excluding BOP tricks | community convention |
| BOP | Butterfly, Osis, Paradox Mirage | named exception set |
| Sick3 | Three-trick scored sequence; pure-difficulty format | event format |
| Shred / Shred:30 | Technical scoring format with timed runs | event format |
| Links / Strings | Informal terms for connected trick sequences | colloquial |
| Density | Average ADD per trick across a run | analytical |
| Run | A continuous performance unit (typically 2-3 minutes in a routine; 3 tricks in Sick3) | foundational |

### B. Sequence architecture

The structural roles tricks play within a sequence. Derived from network analysis findings in v6 §4–§5, translated to pedagogical language.

| Term | Plain-language definition |
|---|---|
| Setup trick | A lower-difficulty opening that creates favorable body position for what follows |
| Resolution trick | A higher-difficulty rotational landing where the sequence comes to rest |
| Launch node | A trick that disproportionately *opens* combos — players reach for it first when starting a sequence (blurry whirl is the corpus's strongest launch node) |
| Attractor / terminus | A trick that disproportionately *closes* combos — sequences gravitate to it (whirl is the corpus's strongest attractor) |
| Throughput trick | A connector that appears mid-sequence; rarely opens or closes (dimwalk is the corpus's strongest throughput trick) |
| Sink | A trick that absorbs flow but rarely chains onward (swirl tends to behave this way) |
| Pure terminus | A trick that appears at the end of a sequence and almost nowhere else (superfly is the cleanest example) |
| Stabilization | A move that resets the body to a controlled state mid-sequence |
| Recovery trick | A low-difficulty element inserted between high-difficulty work to reclaim composure (whirl → whirl, legover → legover) |

### C. Difficulty architecture

How difficulty distributes across a run. The two architectural extremes are concentration and breadth; many runs blend both.

| Term | Plain-language definition |
|---|---|
| Concentration strategy | Few tricks (2–3), each averaging 5–6 ADD. The "depth" approach. Risks one-miss collapse |
| Breadth strategy | More tricks (4–7), each averaging 3–4 ADD. The "length" approach. Risks accumulation-break |
| Per-trick ADD density | Average ADD divided by trick count — the metric that distinguishes the two strategies |
| Sequence risk | The collapse mode appropriate to a given architecture — single-miss for concentration, accumulation-break for breadth |
| Difficulty stacking | Consecutive ultra-high-ADD tricks with no recovery between (food processor → mobius) |
| Additive layering | The principle that compound tricks build ADD by summing operator weights onto a base |
| Difficulty plateau | The observation that competitive maximum-ADD has not increased since ~2008; biomechanical ceiling, not scoring choice |

### D. Transition topology

The directional flow patterns between tricks. Network observations from v6 §4 + §5, translated.

| Term | Plain-language definition |
|---|---|
| Asymmetric flow | The corpus-documented pattern of high-difficulty rotational entries resolving to stable clipper-based terminations |
| Rotational cluster | Tricks that share rotational mechanics tend to chain together (whirl ↔ torque ↔ swirl) |
| Walking transitions | The dimwalk / ripwalk family functions as connector tissue, not as terminals |
| Clipper stabilization | The convergence of sequences toward clipper-stall landings — flow resolves to stable catch surfaces |
| Ducking chains | Ducking-modified compounds tend to compose with paradox and symposium on the body axis |
| Paradox chains | Paradox-modified compounds form a related cluster (paradox torque / paradox whirl / paradox blender); declining post-2014 |
| Combo pacing | The rhythmic distribution of difficulty across sequence positions |
| Sequence density | How tightly difficulty is packed per trick |

## Section sequencing

The four sections should be read in order:
- **A** sets up the vocabulary the rest of the page assumes
- **B** introduces the structural roles
- **C** explains how difficulty distributes
- **D** explains how tricks chain together

This ordering moves from named-states (A) → structural roles (B) → difficulty (C) → flow (D), each section building on the prior.

## Cross-references

- `COMBO_ANALYSIS_EXTRACTION.md` — the source mapping each term to v6 lines
- `combo_examples.md` — worked examples that exercise this vocabulary
- `proposed_combo_analysis_page_structure.md` — page-level integration
- `glossary_section_relocation_plan.md` — where the glossary §10 inheritance comes from
