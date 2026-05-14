# Phase A mechanical analysis -- summary

Frequency in the tables below is OBSERVED evidence, not a promotion signal. See `feedback_frequency_not_authority.md` and the multi-axis NF-2A scoring (Phase B2) before drawing operator-promotion conclusions.

## Corpus

- footbagmoves rows: 573
- passback rows (in SG-MASTER): 106
- passback augment rows (additional from trick_sources.csv): 103
- total rows: 782
- rows with technical_name string: 565

## Operator inventory shape

- distinct operator tokens: 173
- locked (curator-confirmed): 16
- pending_red (in inventory with ambiguity): 16
- q4_blocked (FM-vocab, no IFPA add_bonus): 18
- quantifiers: 4
- surface tokens: 6
- operational-notation leakage: 5
- base or unknown (terminal): 108

## Motifs

- distinct motif signatures: 76
- top motif: locked → base_or_unknown (n=191)

## Stopping depth

- rows with depth>=4 tokens: 129
- rows hitting a q4_blocked token: 145
- rows with operational-notation leakage: 10

Outputs in this directory:

- OPERATOR_FREQUENCY_INVENTORY.csv
- DECOMPOSITION_MOTIFS.csv
- STOPPING_DEPTH_DISTRIBUTION.csv

Synthesis docs (Phase B) reference these CSVs by row, not by re-listing.
