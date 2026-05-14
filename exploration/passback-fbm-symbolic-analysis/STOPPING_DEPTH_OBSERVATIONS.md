# Stopping-depth observations

Synthesizes `STOPPING_DEPTH_DISTRIBUTION.csv` (565 rows with technical_name) into qualitative observations about where decompositions terminate, how deep they go, and which operator classes act as terminal vs intermediate.

## Depth distribution

| Token count | Rows | % of corpus |
|---:|---:|---:|
| 1 | 26 | 4.6% |
| 2 | 261 | 46.2% |
| 3 | 149 | 26.4% |
| 4 | 66 | 11.7% |
| 5 | 28 | 5.0% |
| 6 | 13 | 2.3% |
| 7 | 7 | 1.2% |
| 8+ | 15 | 2.7% |

Median depth is 2 tokens. 91% of rows have depth <= 4. The long tail (depth 8+) is dominated by parser-artifact rows (operational notation leaking into technical_name) and prose-as-technical-name rows (Walkover, Wrap descriptions).

## Terminal class

What kind of token does each decomposition end on?

| Terminal class | Rows | % | Interpretation |
|---|---:|---:|---|
| base_or_unknown | 516 | 91.3% | Decomposition terminates at a canonical base trick (Mirage, Whirl, Osis, Butterfly, etc.). This is the expected pedagogical shape. |
| surface | 24 | 4.2% | Decomposition terminates at a surface token (Toe, Clipper). Indicates operational-style technical_name (e.g., "Spinning Toe", "Diving Clipper"). |
| q4_blocked | 7 | 1.2% | Decomposition halts on an unresolved FM-vocab operator at the end. The trick name does NOT have a canonical resolution. |
| locked | 3 | 0.5% | Rare: decomposition ends on a locked-class operator without a base trick. Likely tokenization artifact (e.g., trailing "Osis" tokenized as base but classified as locked due to dual-role). |
| other | 15 | 2.6% | Mostly parser-artifact rows where commas in technical_name confused tokenization. |

## Terminal q4_blocked rows (the load-bearing observation)

The 7 rows that terminate on a q4_blocked operator are the "decomposition halts on unresolved" cases:

- Furnace: `Hopover Swirl Dragon`
- Firefly: `Butterfly Dragon`
- Spitfire: `Swirl Dragon`
- Snapdragon: `Reverse Swirl Dragon`
- Dragonstein: `Double Swirl Dragon`
- Pteradon: `Toe set os Double Over Down Dragon`
- Flipwalk: `Dragon set Stepping op Firewalk`

All 7 involve `Dragon`. The polysemy of Dragon (modifier vs surface vs suffix; see ONTOLOGY_CONFLICTS P2) means decomposition cannot terminate cleanly. These rows are the structural argument for resolving Dragon's role before any other Q4 batch decision.

## Modifier-count distribution

How many distinct modifier-class tokens (locked / pending_red / q4_blocked) per row?

| Modifier count | Rows | Interpretation |
|---:|---:|---|
| 0 | 87 | Bare base trick names (Butterfly, Whirl, Osis, Eggbeater, etc.) |
| 1 | 272 | Single-modifier compositions (Pixie Butterfly, Atomic Mirage). The 48% sweet spot. |
| 2 | 142 | Two-modifier stacks (Stepping Ducking Mirage, Atomic far Mirage). |
| 3 | 38 | Three-modifier stacks. Deep but readable. |
| 4 | 9 | Four-modifier stacks. Diminishing pedagogical returns. |
| 5+ | 17 | Five plus modifiers. Almost all are PassBack folk-name attempts at long combos OR operational notation leaks. |

This is the operational-half of the pedagogical-compression question. Where the modifier count exceeds 4, the trick is almost certainly under-served by the technical name; a folk name is doing real cognitive work. Conversely, the 26 bare-base rows are tricks where the technical name IS the name; no compression is happening.

## Q4_blocked operator position

Of the 145 rows with a q4_blocked token, position distribution:

- Leading position (token index 0): 132 rows (91%). The FM-vocab modifier fronts the decomposition.
- Middle position: 6 rows. (Gyro inside `Blister: Whirling Gyro Mirage`; Spyro in `Colossus: Spyro Diving Symposium Whirl`.)
- Terminal position: 7 rows (the Dragon cases above).

Implication: FM-vocab operators are almost always leading modifiers, not embedded ones. This is consistent with their syntactic role as primary set / body modifiers in FM grammar. The 6 mid-position cases are unusual; if Q4 resolves these operators as canonical, the mid-position usage will need separate evaluation (most likely the same as leading, but worth verifying).

## Operational leakage

10 rows carry operational notation in technical_name (per Phase A summary). These rows score high on token count (depth 6-13) because the operational tokens dilute the modifier-count signal. Examples:

- ATW: 9 tokens, 0 semantic modifiers
- Orbit: 9 tokens, 0 semantic modifiers
- Legover: 7 tokens, 1 temporal flag, 0 semantic modifiers
- Pickup: 7 tokens, 1 temporal flag, 0 semantic modifiers

Treat as data-quality fix candidates in the PassBack source files. Do NOT include in grammar-level frequency analysis.

## Implications for parser coverage

- The 145 q4_blocked rows are the parser's "stopping" cases: the parser cannot resolve them without a Red ruling on the FM-vocab operator class.
- The 132 leading-position q4_blocked cases all follow the same fix: a Q4 batch ruling. Resolution would unblock 132 rows in one decision.
- The 7 Dragon cases are NOT solvable by a single Q4 ruling because Dragon's role varies.

## Implications for pedagogical surfacing

- Depth >= 4 is the cognitive cliff. Below 4 tokens, technical_name reads as a sentence. At 4+ tokens, the decomposition is a chain that requires guidance to parse.
- Pedagogically, the 87 bare-base rows + 272 single-modifier rows + 142 two-modifier rows (89% of corpus) are the readable surface. The rest is where folk names earn their keep.

See PEDAGOGICAL_COMPRESSION_PATTERNS.md for the user-facing question of where to surface compressed vs expanded readings.
