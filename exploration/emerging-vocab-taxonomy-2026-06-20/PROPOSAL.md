# Emerging Vocabulary + "Unknown / no notation" — taxonomy revision proposal (2026-06-20)

Two stale surfaces, audited against live data. This proposes the revised taxonomy, new metrics, and
the "Unknown" fix. Implementation follows on approval (public copy + metrics change).

## Surface 1 — `/freestyle/observational` (Emerging Vocabulary)

`getObservationalLayerPage()` partitions `OBSERVATIONAL_UNIVERSE` by a `section` field
(ready/frontier/doctrine/folk/parser) and shows stat blocks. The stale claim: **"Doctrine Blocked:
awaiting a curator or Red ruling" = 185.**

### Audit of the 185 "doctrine" rows (by `cluster`)
| cluster | count | actual status (post-rulings) |
|---|---:|---|
| weaving | 32 | **Red doctrine blocked** (genuinely open) |
| blurry | 66 | **SETTLED** (Stepping[+Paradox]) → mechanically promotable / needs authoring |
| pogo | 39 | **SETTLED (+0)**, 12 promoted this session → mechanically promotable |
| dod-ddd | 46 | **Curator/governance** (verification), not Red |
| other | 2 | identification (dragon/refraction) |

The `doctrineConfidence` field (139 "blocked", 46 "policy-dependent") is **stale** — it predates the
blurry/pogo rulings, so it labels settled rows as blocked.

### Proposed 8-category taxonomy (derived in-service from existing universe fields; reversible, no regeneration)
Precedence per row:
1. **Alias / duplicate** — `intakeBucket ∈ {alias, duplicate_variant}` (≈435)
2. `section=doctrine`:
   - `cluster=weaving` → **Red doctrine blocked** (≈32)
   - `cluster ∈ {blurry, pogo}` → **Mechanically promotable** (settled doctrine; ≈105)
   - `cluster=dod-ddd` → **Curator/governance blocked** (verification; ≈46)
   - else → **Identification blocked** (≈2)
3. `section=ready` → **Mechanically promotable** (≈2)
4. `section=frontier` → **Needs authoring** (≈63)
5. `section=parser` → **Notation blocked** (parser/model gap) where no `semanticJob`/`decomposition`; else **Folk / unresolved**
6. `section=folk` → **Folk / unresolved**

Plus a fixed, separate note for the one cross-cutting Red question that does NOT live in this universe:
the **atomic / X-Dex receiver-rule value-migration** (canonical band; see `ATOMIC_QUANTUM_NUCLEAR_READINESS.md`).

### Proposed new metric blocks (replacing the four stale ones)
| label | value | hint |
|---|---|---|
| Red doctrine blocked | ~32 | the one open Red ruling (Weaving); the atomic/X-Dex receiver rule is the other, on the canonical band |
| Curator / governance | ~46 | verification or a precedent/insertion convention, not a Red ruling (DOD/DDD) |
| Identification | ~2 | structure or identity unconfirmed (dragon, refraction) |
| Mechanically promotable | ~107 | settled doctrine (Blurry, Pogo) + clean derived ADD; authoring throughput, not doctrine |
| Needs authoring | ~63 | structure understood; notation/decomposition not yet authored |
| Folk / unresolved | large | documented names whose structure is not yet understood |
| Alias / duplicate | ~435 | resolve to an existing trick; archive, not frontier |

The "Doctrine Blocked = 185 / awaiting a curator or Red ruling" block is **removed** and replaced by the
split above so users do not read 185 as "waiting on Red."

## Surface 2 — `/freestyle/tricks?view=dex-count` "Unknown / no notation" (38)

The predicate (`freestyleService.ts:8091`) buckets any active trick with `operational_notation IS NULL`
as "Unknown / no notation" — but that conflates four states:

| sub-bucket | count | examples | fix |
|---|---:|---|---|
| Has JOB notation, no op-notation | **25** | atomic-torque, liquifier, warp, floatation, big-apple-sauce, blazing-* | **mislabeled** — these have notation; relabel |
| Modifier / not a trick | ~7 | barraging, ducking, gyro, paradox, spinning, blazing | exclude from the trick dex view |
| Truly no notation | ~3 | (genuine) | keep |
| Has structural parse, no JOB | 3 | sole-survivor, oh-wheely, bill-ted | own bucket |

### Proposed rename / split
Replace the single "Unknown / no notation" group with notation-aware labels driven by what each row
actually has:
- **"JOB only (operational notation pending)"** — has `notation`, no `operational_notation` (the 25)
- **"No notation yet"** — genuinely empty (the ~3)
- and **drop modifiers** from the trick dex-count view (they are not tricks).

So the dex-count axis stops claiming 38 tricks are notation-less when 25 carry JOB notation.

## Open decisions for sign-off
1. The 8-category **labels/hints** above (public copy).
2. The Pogo/Blurry → "Mechanically promotable" remap (treats the stale `doctrineConfidence=blocked`
   as superseded by the rulings — correct, but it moves ~105 rows out of "Doctrine Blocked").
3. The "Unknown" split labels + dropping modifiers from the trick dex view.
