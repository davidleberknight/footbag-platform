# Combinations page audit (`/freestyle/combo-analysis`) — Atlas research, read-only

Inspected: the rendered contract (route -> controller `comboAnalysis` -> service
`getComboAnalysisPage` -> template `src/views/freestyle/combo-analysis.hbs`), then the
implementation (`src/content/freestyleComboAnalysisContent.ts`). No edits made.

## What the page actually is

A **pure editorial content page**. `getComboAnalysisPage` returns a static content module
(`FREESTYLE_COMBO_ANALYSIS_CONTENT`); there is no query, no corpus, no computation. Its own
header states the contract: "pure editorial content modules; no DB access; no parser-derived
data; no fabricated formulas."

## Audit answers

| Question | Answer |
|---|---|
| What corpus does it analyze? | None. No corpus; sections are curator-authored prose. |
| Historical, generated, or illustrative combinations? | Illustrative only: 5 worked examples chosen editorially. |
| How are trick names resolved? | They are not resolved at runtime; names are hard-authored in the module (with hrefs authored alongside). |
| How are ADD totals computed? | Not computed; any totals in prose are authored. |
| Historical vs current ADD distinguished? | Not applicable (no historical data on the page). |
| Trick order tracked? | Only as authored prose order; no model. |
| Foot compatibility checked? | No. |
| Surface compatibility checked? | No. |
| Flexible SET handled? | Not modeled (prose only). |
| Ambiguous terminals handled? | Not modeled. |
| Could it display a physically impossible sequence? | In principle yes (nothing validates authored examples). In practice, **all five current worked examples pass the Atlas state model**: blurry_whirl->whirl (via flexible set), smear->dimwalk->ripwalk (TOE->TOE, CLIP->CLIP), butterfly->blurry_whirl (CLIP->CLIP), food_processor->mobius (CLIP->CLIP). The 22-ADD Solis chain exceeds three tricks and was not link-tested in this pass. |
| Do its statistics accurately describe an underlying corpus? | **Not verifiably.** The page's authored prose carries specific corpus statistics (blurry whirl "hub score 0.695", whirl "authority score 0.863, PageRank 0.126", dimwalk "out-degree 23 vs in-degree 15", "395 sequences across 22 years", per-example appearance counts, the "22-ADD corpus maximum"). These derive from the freestyle evolution report's 395-sequence corpus, and the archived sequence-foundation validation gate (2026-07) could NOT reproduce them: the located corpus file holds 375 chains with materially lower per-trick counts ("GATE NOT PASSED"). The numbers may be right, but no in-repo artifact currently reproduces them. |

## Confirmed defects

One, documentation-grade: **the page's corpus statistics are not reproducible from any
in-repo artifact.** The archived validation gate already records this (editorial numbers
computed from "a fuller or differently-normalized run" than the located 375-chain export).
The five authored examples remain physically valid under the transition model, and the
independently-extracted mirror corpus in this track (117 fully-resolved sequences from
event result blobs) is a different, smaller corpus and cannot substitute as verification.

## Desirable enhancements (not defects; future work only)

1. A historical Sick 3 section grounded in the extracted corpus (117 fully-resolved unique
   sequences exist), with per-trick current-ADD chips and honest resolution provenance.
2. Machine-checking authored examples against the transition inventory at generation time
   (research-layer check, not a runtime parser), so a future edit cannot introduce a
   physically impossible example.
3. Transition-topology prose could cite the measured entry/terminal surface distributions
   (e.g. CLIP-terminal dominance) instead of qualitative description alone.
