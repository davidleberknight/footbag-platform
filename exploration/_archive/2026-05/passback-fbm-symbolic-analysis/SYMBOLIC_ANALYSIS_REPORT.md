# Symbolic Analysis Report -- PassBack + FootbagMoves Candidate Corpus

Executive synthesis of the 10-deliverable analytical pass over the combined PassBack + FootbagMoves trick corpus (782 rows: 573 FM + 106 PB-in-SG + 103 PB-augment).

## Scope of this pass

Analytical / governance, not ingestion. No DB mutations, no canonical CSV edits, no alias promotion, no new canonical tricks proposed for adoption.

Operating principle (per `feedback_frequency_not_authority.md`): corpus recurrence is evidence, never ontology authority. Every promotion-adjacent output in this pass is scored on six non-frequency axes; the highest-recurrence operators in the corpus are explicitly NOT the recommended promotion candidates.

## Deliverables (all under exploration/passback-fbm-symbolic-analysis/)

| # | Artifact | Type | Headline finding |
|---:|---|---|---|
| 1 | OPERATOR_FREQUENCY_INVENTORY.csv | mechanical | 173 distinct operator tokens; 16 locked + 16 pending_red + 18 q4_blocked + 108 base/unknown |
| 2 | DECOMPOSITION_MOTIFS.csv | mechanical | 76 distinct motif signatures; top motif `locked → base_or_unknown` covers 191/565 rows |
| 3 | COMPRESSION_PATTERN_TAXONOMY.md | synthesis | FM's P1-P15 reaffirmed; surfaces C1-C4 (FM-vocab compression, bare-base, operational leak, mid-stack temporal) |
| 4 | NF2A_CANDIDATE_QUEUE.csv + NOTES | judgment-scored | 28 candidates scored; 5 advance, 6 defer-pending, 8 to Q4 batch, 4 reject |
| 5 | EQUIVALENCE_CHAIN_CANDIDATES.csv | judgment-scored | 18 chains catalogued; 4 advance-as-NF-2A, 6 defer-pending, 4 already-canonical, 4 reject/educational only |
| 6 | ONTOLOGY_CONFLICTS.md | inventory | 4 decomposition divergences (Fury, Blur, Omelette, Terrage), 2 polysemy, 10 layer leaks, 2 dual-role overloads |
| 7 | RECURRING_SYMBOLIC_STRUCTURES.md | examples | 10 worked examples covering one representative per major motif class |
| 8 | SEMANTIC_MACRO_PROPOSALS.md | judgment-scored | 2 clean candidates (Inspinning, Reverse); 3 anti-proposals (Fairy, Bubba, Dragon) despite high frequency |
| 9 | STOPPING_DEPTH_DISTRIBUTION.csv + OBSERVATIONS | mechanical + synthesis | 91% of decompositions terminate at a base trick; 7 Dragon-terminal rows are load-bearing |
| 10 | PEDAGOGICAL_COMPRESSION_PATTERNS.md | synthesis | Compression wins for canonical-trick names; expansion wins for short clean stacks; depth >= 4 is the cognitive cliff |

## What the pass unlocks

The mechanical CSVs and synthesis docs together give the curator a corpus-grounded view of:

- WHICH operators recur and at what frequency (descriptive).
- WHICH operators have stable decompositions (filter for advancement).
- WHICH operators are Q4-blocked (defer-batch identification).
- WHICH compositions are canonical compressions vs raw FM data (pedagogical priority).
- WHERE decomposition halts (parser-coverage gaps).
- WHICH conflicts are structural vs arithmetic (Red-question typing).

This is the **gating analysis** before any NF-2A entry expansion. The curator can now choose to:

- Send a focused Red packet on the 5 clean NF-2A candidates (Sailing, Frantic, Leaning, Hyper, Inspinning).
- Batch the Q4 question across 8 FM-vocab operators with full corpus context.
- Resolve Dragon's role before any other Q4 decision (7 terminal-position rows depend on it).
- Surface canonical compressions at the primary UI level; defer FM-vocab compressions to operator-grammar deep dive.

## What this pass does NOT do

Repeated for clarity, since the corpus is large and the temptation to over-extend is real:

- No DB mutations or schema changes.
- No edits to `freestyleOperatorReference.ts` (the in-code operator catalogue).
- No alias promotion (the PassBack alias triage from earlier is paused).
- No new canonical tricks proposed.
- No bulk import of FM-vocab.
- No parser changes.
- No recursive expansion of Sets-tab definitions to canonical forms.
- No re-derivation of FM Phase 1's P1-P15 patterns, SG-2's 62 groups, or freestyleOperatorReference's 9 entries (all preserved as inputs).

## Frequency-vs-authority guardrails baked into outputs

Per the user's load-bearing constraint (frequency is evidence, not authority), the following are baked into the artifact schemas:

- `OPERATOR_FREQUENCY_INVENTORY.csv` ships `curator_status` alongside `total_observed_count` and labels counts as `evidence_class`, never `confidence` or `promotion_signal`.
- `NF2A_CANDIDATE_QUEUE.csv` includes six non-frequency axes (decomposition_clarity, provenance_quality, red_dependency, pedagogical_risk, community_drift_risk, parser_artifact_risk). Frequency is descriptive only.
- The five NF-2A advance candidates have counts of 7, 2, 3, 0, 3 -- all below the high-recurrence threshold.
- The three highest-recurrence Q4-blocked operators (Fairy 29, Gyro 28, Barraging 19) all explicitly defer.
- `SEMANTIC_MACRO_PROPOSALS.md` includes anti-proposals to document operators that recur but should NOT be promoted (Fairy, Bubba, Dragon).
- `PEDAGOGICAL_COMPRESSION_PATTERNS.md` explicitly separates the recurrence-driven surface from the pedagogically-preferred surface.

## Cross-references

- `feedback_frequency_not_authority.md` -- the governing principle.
- `project_canonical_trick_publication_contract.md` -- six publication requirements that gate canonical adoption; this pass produces inputs that those requirements consume.
- `project_glossary_v5_synthesis.md` -- modifiers-as-operators framing this analysis confirms against corpus evidence.
- `feedback_parser_editorial_separation.md` -- the layer-separation rule this pass respects (no parser mutations).
- `project_freestyle_core_atoms.md` -- the 12 curator-authoritative atoms anchor the stopping-depth analysis.
- `project_freestyle_state.md` -- pilot tier state at session open.

## Recommended next decisions (curator-bound, NOT this pass)

The curator can now choose to:

1. **Send the 5-candidate NF-2A Red packet**: Sailing, Frantic, Leaning, Hyper, Inspinning. Each is single-question scoped.
2. **Batch the Q4 question**: FM-vocab operators (Fairy, Barraging, Railing, Surging, Neutron, Blazing, Splicing, Surfing). 8 operators, one structural decision (do FM-vocab modifiers get IFPA add_bonus rows at all?).
3. **Resolve Dragon role**: independent of Q4. Surface-vs-modifier polysemy blocks 7 corpus rows.
4. **Surface the canonical-compression pedagogical priority**: at the UI level, primary surface = canonical compressions, secondary = operator decomposition. PEDAGOGICAL_COMPRESSION_PATTERNS.md provides the corpus support.
5. **Triage the 10 operational-leakage rows**: PassBack source-file fix candidates. Not an IFPA grammar question.

None of these are pre-decided by this pass. The analysis surfaces the options; the curator picks.
