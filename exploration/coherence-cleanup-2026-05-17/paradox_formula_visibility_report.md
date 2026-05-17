# Paradox Formula Visibility Report

Coherence Cleanup Slice — Phase 1d (part 1) (2026-05-17). Read-only audit.

## TL;DR

Paradox has **multiple** structural representations scattered across glossary surfaces — none is positioned as the single load-bearing visible canonical formula. The user-flagged problem is real: a reader curious about paradox gets four different presentations on different surfaces, none of them designated authoritative.

## Inventory of paradox representations

| Surface | Form | Status |
|---|---|---|
| Glossary §3 (`#term-paradox`) | "A hip pivot between two dexes on the same set. +1 body modifier." (definition prose) | Definitional |
| Glossary §3 connective panel link | "See connective panel" | Cross-ref to deeper material |
| Glossary §6/§7 inline notation example | `paradox whirl` (op-token form) | Worked compound example |
| Glossary §7 abbreviation table row | `[PDX]` = "Paradox component — flags a cross-body far dex requiring a hip-pivot repositioning to bring the leg under the bag. Operationally: `CLIP > OP IN [DEX]`" | Operational definition |
| Glossary §3 (line 459) | "paradox is an entry topology (cross-body framing)" | Topology characterization |
| `freestyleOperatorReference.ts` (intermediate ops) | "stepping paradox" reading for blurry; "paradox + atomic" for nuclear | Operational decomposition |
| `freestyleMovementSystems.ts` | paradox is a registered modifier on the Set axis | Movement-system classification |
| Glossary §9 connective panel (`glossary-panel-paradox`) | Connective panel with related tricks + symbolic groups + notation hint | Comprehensive — but ONE OF SIX panels (paradox + symposium + ducking + spinning + whirl + pixie) |

## The visibility problem

A reader landing on glossary §1 looking for "what is paradox" sees a 1-sentence definition. To get the operational form they must scroll to §7 abbreviations table. To get worked examples they must scroll to §6/§7 notation examples. To get the connective panel they must scroll to §9. The "compositional revelations earned progressively" pedagogy intentionally spreads paradox across the page — but the result is that no single anchor displays the **canonical visible formula**.

Compare with the user's prompt: "Paradox is discussed repeatedly but lacks a single highly visible canonical formula anchor." That diagnosis is accurate.

## What "canonical formula" would look like

Per the user's example: `PDX → clip > op-in dex` is the proposed shape. Mapping to current governed wording:

- `[PDX]` is the documented abbreviation token (glossary §7, line 768)
- `CLIP > OP IN [DEX]` is the documented operational reading (same line)
- Per `freestyleOperatorReference.ts` paradox is "+1 body modifier" with semantic-tree decomposition "set with hip-pivot between two dexes"

The proposed visible formula could be:

```
paradox  =  CLIP > OP IN [DEX]   (+1 body modifier; hip-pivot framing)
```

All three components are already governed. The synthesis is the visible anchor; nothing new is being authored.

## Recommendation for Phase 2

Surface a single high-visibility paradox anchor in §3 (alongside the existing `#term-paradox` definition) that combines:
1. The 1-sentence definition (already present)
2. The operational form `CLIP > OP IN [DEX]` (already present in §7)
3. The +1 body modifier weight (already governed)

Re-render the same formula block in:
- §6 (operator theory subsection)
- §9 (paradox connective panel)
- `freestyleOperatorReference.ts` paradox entry (currently has decomposition prose; could promote to the visible formula slot)

Goal: a reader sees the same formula on every surface where paradox is discussed. Phase 2 should draft the exact block + present to maintainer for sign-off before implementing.

## Cross-references

- `freestyleOperatorReference.ts` carries the existing per-operator decomposition data
- `feedback_parser_editorial_separation` — formula representations live on the editorial layer
- `project_semantic_compression_doctrine` — locution-level discipline (Level-1 "is" form is appropriate for paradox since it's curator-authoritatively defined)
