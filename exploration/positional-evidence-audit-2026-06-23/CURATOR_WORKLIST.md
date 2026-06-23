# Curator worklist — remaining 14 positional names (2026-06-23)

Read-only output of the configuration resolver. No aliases or canonicals written.

Reproduce: `python3 exploration/positional-evidence-audit-2026-06-23/resolver.py`. CSV: `curator_worklist.csv`.

## Status counts

| resolver_status | count | curator action |
|---|---:|---|
| RESOLVED | 1 | done — alias already wired in the DB (removed from the unresolved worklist) |
| DISTINCT_VARIANT_CANDIDATE | 7 | decide: author as a new canonical (needs attestation + ADD/notation) or alias |
| AMBIGUOUS_MULTI_COMPONENT | 5 | decide which component the qualifier targets before any identity is assigned |
| NO_NOTATION | 1 | author base notation first (blocked until then) |

## Safety-invariant guard demonstration (the 7 previously-added aliases)

SAFE_ALIAS for component_count > 1 requires a curated equivalence row. The 6 multi-component aliases were explicitly human-approved last turn (their curated rows now exist in trick_aliases.csv); without those rows the resolver yields NEEDS_CURATED_EQUIVALENCE.

| record | components | with curated rows | with curated={} (autonomous) |
|---|:--:|---|---|
| Clipper Stall (ss) | 0 | SAFE_ALIAS | SAFE_ALIAS |
| Dyno (op) | 2 | SAFE_ALIAS | NEEDS_CURATED_EQUIVALENCE |
| Flail (ss) | 2 | SAFE_ALIAS | NEEDS_CURATED_EQUIVALENCE |
| Pickup (ss) | 2 | SAFE_ALIAS | NEEDS_CURATED_EQUIVALENCE |
| Rev Whirl (op) | 2 | SAFE_ALIAS | NEEDS_CURATED_EQUIVALENCE |
| Symposium Mirage (ss) | 2 | SAFE_ALIAS | NEEDS_CURATED_EQUIVALENCE |
| Symposium Swirl (op) | 2 | SAFE_ALIAS | NEEDS_CURATED_EQUIVALENCE |

## Worklist

| record | base_canonical | qualifier | components | fixed? | resolver_status | note |
|---|---|:--:|:--:|:--:|---|---|
| Double Leg Over (ss) | `double-leg-over` | same | 3 | False | **AMBIGUOUS_MULTI_COMPONENT** | 2 candidate targets for 'same' |
| Eggbeater (ss) | `eggbeater` | same | 3 | False | **AMBIGUOUS_MULTI_COMPONENT** | 2 candidate targets for 'same' |
| Fairy Double Leg Over (ss) | `fairy-double-leg-over` | same | 4 | False | **AMBIGUOUS_MULTI_COMPONENT** | 2 candidate targets for 'same' |
| Pigbeater (ss) | `pigbeater` | same | 4 | False | **AMBIGUOUS_MULTI_COMPONENT** | 2 candidate targets for 'same' |
| Smog (ss) | `smog` | same | 4 | False | **AMBIGUOUS_MULTI_COMPONENT** | 2 candidate targets for 'same' |
| Assassin (ss) | `assassin` | same | 3 | False | **DISTINCT_VARIANT_CANDIDATE** | unique target; new config `TOE > SAME IN [DEX] >> DUCK [BOD] >> SAME IN [DEX] > OP TOE [DEL]` |
| Eclipse (ss) | `eclipse` | same | 2 | False | **DISTINCT_VARIANT_CANDIDATE** | unique target; new config `SET > JUMP [BOD] > SAME INSIDE [DEL] > OP OUT [DEX] > (land)` |
| Fairy Pickup (ss) | `fairy-pickup` | same | 3 | False | **DISTINCT_VARIANT_CANDIDATE** | unique target; new config `TOE > SAME OUT [DEX] > SAME IN [DEX] > SAME TOE [DEL]` |
| Paste (ss) | `paste` | same | 3 | False | **DISTINCT_VARIANT_CANDIDATE** | unique target; new config `TOE > SAME IN [DEX] >> SAME IN [DEX] > SAME TOE [DEL]` |
| Pixie Double Pickup (ss) | `pixie-double-pickup` | same | 4 | False | **DISTINCT_VARIANT_CANDIDATE** | unique target; new config `TOE > SAME IN [DEX] >> SAME IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]` |
| Smear (ss) | `smear` | same | 3 | False | **DISTINCT_VARIANT_CANDIDATE** | unique target; new config `TOE > SAME IN [DEX] >> SAME IN [DEX] > OP TOE [DEL]` |
| Smudge (ss) | `smudge` | same | 3 | False | **DISTINCT_VARIANT_CANDIDATE** | unique target; new config `TOE > SAME IN [DEX] > SAME OUT [DEX] > OP TOE [DEL]` |
| Pixie DSO (ss) | `pixie-dso` | same | 0 | None | **NO_NOTATION** | base has no operational notation |
| Fairy Legover (ss) | `fairy-legover` | same | 3 | False | **RESOLVED** | already wired: alias `fairy-legover-ss` -> `double-orbit` |
