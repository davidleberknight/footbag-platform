# Proposed Combo Analysis Page Structure

Slice: Combo Analysis extraction (2026-05-17). Page architecture proposal.

## Page concept

A new public freestyle section page at `/freestyle/combo-analysis` (or similar slug — `/freestyle/run-architecture` is also defensible). Companion to `/freestyle/add-analysis` but operating at the *sequence* level rather than the *trick* level. Same editorial register; same anti-fabrication discipline.

## Tab title + page intro

> **Combo & Run Architecture**
>
> How freestyle sequences are built. The vocabulary of setup tricks and resolution tricks; concentration and breadth; recovery and stacking. The patterns that distinguish a memorable combo from a random list of tricks.

## Section structure

### §1 — Philosophy (~150-200 words)

Single short opening section establishing the framing.

Draft prose:

> Freestyle runs are not random collections of tricks. They form structured movement phrases — with setup mechanics, transitions, recovery points, and resolution patterns. The vocabulary players use to talk about these structures has evolved alongside the trick vocabulary itself, and this page documents what's emerged.
>
> The page assumes familiarity with individual tricks (see the [Trick Dictionary](/freestyle/tricks)) and with how ADD is constructed (see [ADD Accounting & Analysis](/freestyle/add-analysis)). It operates at the level above both: how the tricks combine.

### §2 — Run-quality terminology (from RUN_ARCHITECTURE_GLOSSARY_PLAN.md §A)

Anchor: `#run-quality`. Inherits the table from glossary §10 + the BOP exception. Includes Sick3 and Shred:30 as event formats since they're the contexts where run-quality language gets used.

### §3 — Sequence architecture (from RUN_ARCHITECTURE_GLOSSARY_PLAN.md §B)

Anchor: `#sequence-architecture`. The structural roles: setup / resolution / launch node / attractor / throughput / sink / pure terminus / stabilization / recovery.

Each term gets one paragraph. Cross-link to relevant worked example in §5.

### §4 — Difficulty architecture (from RUN_ARCHITECTURE_GLOSSARY_PLAN.md §C)

Anchor: `#difficulty-architecture`. Concentration vs breadth; per-trick ADD density; sequence risk; the difficulty plateau as a biomechanical observation.

Includes the concentration-vs-breadth table from `combo_examples.md`. Side-by-side architectural comparison gives the reader the cross-cutting framework.

### §5 — Worked examples (from combo_examples.md)

Anchor: `#worked-examples`. Five examples (blurry whirl → whirl; smear → dimwalk → ripwalk; butterfly → blurry whirl; food processor → mobius; Solis 22-ADD). Each example surfaces 3-4 §2/§3/§4 concepts.

### §6 — Transition topology (from RUN_ARCHITECTURE_GLOSSARY_PLAN.md §D)

Anchor: `#transition-topology`. Asymmetric flow; rotational cluster; walking transitions; clipper stabilization; ducking / paradox chains. Network observations from v6 translated to pedagogical language.

Could carry small visual aids (see "Visual elements" below) if maintainer wants them.

### §7 — Honesty + uncertainty

Anchor: `#caveats`. Short section acknowledging:
- Documented patterns reflect the Sick3-format-dominated corpus, not all competitive freestyle
- European competition dominates 2004–2021 documentation; North American coverage is sparser
- Pre-1997 data is partial
- Vocabulary evolved; some terms have shifted meaning
- "Tiltless" through "Godly" tier definitions are community conventions; specific ADD thresholds have varied over time
- Network metrics describe documented transitions, not what players *would* do — they describe what was *recorded*

This section keeps the page intellectually honest. Maps to the user's "uncertainty/governance honesty" task in the original brief.

### §8 — Cross-references

Anchor: `#further-reading`. Outbound links:

- [/freestyle/add-analysis](/freestyle/add-analysis) for ADD construction detail
- [/freestyle/history](/freestyle/history) for competitive history context
- [/freestyle/tricks](/freestyle/tricks) and [Glossary §3](/freestyle/glossary#term-clipper) for individual trick references
- [/freestyle/insights](/freestyle/insights) for current data-driven analysis (Sick3 sequences, etc.)
- the full source report (`legacy_data/inputs/curated/records/FREESTYLE_EVOLUTION_REPORT_v7.md` when v7 ships) for the underlying statistics

## View-model shape (proposed)

Following the established `PageViewModel<TContent>` pattern from VIEW_CATALOG §6:

```ts
interface CombosAnalysisContent {
  philosophy:           string[];               // §1 paragraphs
  runQuality:           RunQualityEntry[];      // §2 table rows
  architectureSections: ArchitectureSection[];  // §3 + §4 with definition + example refs
  workedExamples:       WorkedComboExample[];   // §5 cards
  transitionTopology:   TopologyPattern[];      // §6
  caveats:              string[];               // §7
  crossLinks:           CrossLinkEntry[];       // §8
}
```

All shaping happens in service; template stays logic-light per template-conventions rule.

## Visual elements (optional)

If a future implementation slice wants them:
- A small inline diagram for §6 showing the asymmetric flow pattern (rotational entry → clipper-stable resolution)
- A timeline strip for §4's "difficulty plateau" finding
- Per-example small ASCII diagrams (already present in `combo_examples.md`)
- A network mini-map showing the whirl-as-attractor / blurry-whirl-as-launch-node relationship

All optional; not load-bearing.

## What this page is NOT

- **Not a trick dictionary.** Individual trick definitions stay on `/freestyle/tricks`.
- **Not a tutorial.** This is taxonomy + analysis, not "how to perform a trick."
- **Not a competition guide.** Event-format rules live on `/rules/freestyle/`.
- **Not a research paper.** The v7 evolution report carries that role; this page is the pedagogical layer.

## Implementation cost estimate (rough)

For when a future slice implements this:
- 1 new route + controller method
- 1 new service method (`getCombosAnalysisPage`)
- 1 new view-model type (CombosAnalysisContent)
- 1 new template (`src/views/freestyle/combo-analysis.hbs`)
- 1 new content module (likely `src/content/freestyleComboAnalysisContent.ts`) carrying philosophy / examples / topology prose
- ~15-25 integration test specs (route + content + cross-link + anti-enumeration)
- Glossary §10 trim once the new page exists (separate fix)
- history.hbs cross-link updates

Estimated effort: similar to the ADD Analysis page (Slice X Phase 1) — a few hours of focused implementation.

## Slug naming

`/freestyle/combo-analysis` is the cleanest analogue to `/freestyle/add-analysis`. Alternatives considered:
- `/freestyle/run-architecture` — accurate but less obviously paired with add-analysis
- `/freestyle/sequences` — too generic; "sequence" is overloaded with Sick3-format language
- `/freestyle/combos` — too colloquial; misses the analysis register

Recommendation: `/freestyle/combo-analysis`.

## Cross-references

- `COMBO_ANALYSIS_EXTRACTION.md` — source material
- `RUN_ARCHITECTURE_GLOSSARY_PLAN.md` — the §2/§3/§4/§6 content
- `combo_examples.md` — §5 content
- `glossary_section_relocation_plan.md` — the §10 migration story this page enables
