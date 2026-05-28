# P3 — A0 compound-notation extrapolation

Ran the validated parser (scripts/parse_freestyle_notation.py, pure functions, in-memory, **DB never written**) over **1702** unresolved observational names. Every row carries `observationally_extrapolated=true`; no value is canonical; JOB is deferred (no fabrication).

## Coverage (the five layers, independent)

| Layer | Count | % of candidates |
|---|---:|---:|
| structurally_readable (1 base, all tokens placed) | 642 | 37.7% |
| mechanically_derivable (structure + closed ADD, all weights known) | 615 | 36.1% |
| doctrine_stable (no doctrine/policy token) | 1405 | 82.5% |
| observationally_extrapolated | 1702 | 100% |
| culturally_canonical | 0 | 0% (canonical rows excluded by construction) |

Parser confidence (independent of doctrine):

| parser_confidence | count |
|---|---:|
| high | 615 |
| medium | 27 |
| low | 665 |
| none | 395 |

Doctrine confidence (independent of parser):

| doctrine_confidence | count |
|---|---:|
| stable | 1405 |
| blocked | 194 |
| policy-dependent | 103 |

## Failure classes

| failure_class | count |
|---|---:|
| (derived) | 615 |
| folk-name-opacity | 395 |
| unknown-modifier-token | 359 |
| ambiguous-terminal-mechanic | 264 |
| compression-ambiguity | 56 |
| unresolved-directional-syntax | 9 |
| parser-ambiguity | 4 |

These classes are the actionable backlog: `unknown-modifier-token` + `missing_modifier_weights` drive parser/registry evolution (e.g. `inspinning` has no weight row); `compression-ambiguity` + `impossible-ADD-reconciliation` drive doctrine prioritization; `folk-name-opacity` is the observational-only residual; `conflicting-source-expansions` is the cross-source watch-list.

## Caveats (honest scope)

- **64** names that P5 put in Tier 4 ("observational-only", bare folk) are in fact structurally readable once parsed — the A0 pass reclassifies them upward, confirming the Tier-4 over-inclusion caveat.
- `mechanically_derivable` requires the BASE trick to be a known canonical with a known ADD AND every modifier to have a registered weight. A correct structure with an unregistered modifier (e.g. `inspinning`) is `structurally_readable` but NOT `mechanically_derivable` — surfaced, not silently zero-counted.
- JOB notation is intentionally NOT generated. Provisional ADD + decomposition are derived; JOB requires curator-gated chassis substitution (separate slice).
- Stanford names in this corpus are already decoded English, so one NL tokenizer covers all sources; a cipher decoder is future-only.
