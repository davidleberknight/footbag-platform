# Phase 2 — FM/Folk ≥7 Adjudication Methodology

Frontier Initiative phase 2 (charter priority 4). **Methodology / design only. Read-only; no promotion,
no canonical edits.** Defines how the FM-attested folk-named ≥7-ADD cohort is triaged into the existing
frontier tiers. It **consolidates** the existing systems (review_status, parser `add_formula_status`,
observational `intakeBucket`, the folk-name-overlap registry, the divergence registries) — it does not
invent a parallel framework. Eagle theory is out of scope (still curator-undefined); this is the
non-Eagle methodology and is usable now.

## The cohort (read-only profile, 2026-05-29)

From `exploration/symbolic-master/comprehensive_symbolic_trick_corpus_2026-05-23.csv`:

- 48 distinct slugs with `fm_add_claim ≥ 7`.
- **7 already canonical, 1 already an alias** (folk names for existing structures).
- **40 novel** (not canonical, not alias). **0 are corroborated** by `official_add`/`fborg_add_claim` ≥7
  — the entire novel cohort is **FM-single-source.** ADD distribution: 35×7, 3×8, 2×9.
- Doctrine-gate operators present in the novel decompositions: DOD-policy (4), atomic-rotational-Q3 (4),
  blurry-transitivity (3), surging-decomposition (3), unregistered operators (3+).

**Two structural facts that drive the methodology:**
1. **FM-only ≥7 claims are non-authoritative for ADD** (the PassBack/FM-outlier forever-rule: when canon
   + fborg agree and FM is the lone divergent source, FM is observational, not authoritative). With 0
   corroborated, **no candidate in this cohort qualifies for Tier-A fast-track.**
2. **Folk names hide already-canonical structures.** `alpine-big-apple` (FM "Gyro Ducking Symposium
   Torque") = the canonical `gyro-ducking-symposium-torque`; same pattern as `gauntlet`. The duplication
   check must operate on the **decomposed structure**, never the folk-name string.

## Governance priors (binding)

- **Frequency is evidence, not authority.** FM attestation never auto-promotes a name/alias/operator/formula.
- **FM-only is the weakest attestation tier.** Corroboration ladder: official_add > fborg > multi-source > FM-only > single-source folk.
- **Folk-name-overlap rule.** If the decomposed structure is already canonical, the folk name is an alias
  (S3) or S5 reading on the existing row — never a new canonical row.
- **Doctrine gates are hard stops** (blurry-transitivity, atomic-rotational Q3, DOD-family policy,
  unregistered operators). A decomposition that invokes one cannot be promoted until the gate clears.
- **Reversible always** (staging CSV / content module; no schema, no promotion in this phase).

## Per-candidate decision procedure (5 steps)

For each FM/folk ≥7 candidate, in order; the first terminal outcome wins:

1. **Structural duplication check (most important).** Decompose `fm_technical_name` → operator chain →
   canonical structural slug; normalize the folk name too. If either matches an existing canonical slug
   OR alias → **Tier B (already covered)**: wire the folk name as an alias on the existing row if not
   already wired (the `gauntlet` / `alpine-big-apple` pattern). STOP — not a new trick.
2. **Corroboration check.** Is the ≥7 ADD claim backed by official_add or fborg ≥7? If FM-only (the whole
   current cohort) → it **cannot be Tier A**; cap at Tier B/C/D per the remaining steps.
3. **Decomposition + parser/ADD-math check.** Can the technical name decompose into *registered* operators
   + a known base, with bracket-count == claimed ADD (run the parser)? 
   - Clean decomposition, math closes, no doctrine gate, but FM-only → **Tier B/C (frontier_review)**: a
     structurally-solved-but-uncorroborated candidate; needs cultural/source confirmation, not parser work.
   - Decomposition fails / contradictory / impossible → **Tier D**.
4. **Doctrine-gate check.** Does the decomposition invoke blurry-transitivity, atomic-on-rotational (Q3),
   DOD-family policy, or an **unregistered operator**? → **Tier C (parser_blocked / frontier_review)**:
   route the gate to Red (doctrine) or to operator-triage (registration). Do not promote.
5. **Cultural stability + route.** Single-source folk name, no decomposition, or speculative/theoretical
   → **Tier D (observational / folklore / theoretical)**: record in the observational registry, never canonical.

## Tier routing + frontier_status mapping

| Tier | Criteria (this cohort) | frontier_status | Action |
|---|---|---|---|
| A — solved+stable | corroborated + clean decomp + no gate | frontier_stable | fast-track promote. **(0 qualify — all FM-only)** |
| B — covered / structurally-solved | structure already canonical, OR clean decomp but FM-only | (alias on existing) / frontier_review | alias-wire the folk name (gauntlet pattern), or queue for source confirmation |
| C — parser/doctrine frontier | decomposition invokes a doctrine gate or unregistered operator | parser_blocked / frontier_review | route to Red (doctrine) or operator-triage (registration); do not promote |
| D — observational/speculative | single-source, no clean decomp, impossible/contradictory | observational / folklore / theoretical | record in observational registry; never canonical |

## New unregistered operators surfaced (feed operator-triage)

The novel decompositions introduce operator-shaped tokens beyond the registry and the prior triage:
**Railing** (dorshanatrix, flying-fish), **Floating** (floatation), **Surfing/Surfing-ss** (big-papa-smurf),
**Spyro** (genuphobia) — plus the already-triaged `illusioning` / `flailing`. These route to
`candidates/OPERATOR_TRIAGE.md` (same disposition discipline: real-operator-candidate vs alias vs
folk/artifact). A Tier-C candidate whose only blocker is an unregistered operator unblocks if/when that
operator is curator-ruled.

## Worked examples

- `alpine-big-apple` (FM "Gyro Ducking Symposium Torque") → **Tier B**: decomposes to canonical
  `gyro-ducking-symposium-torque`. Alias-wire, no new row. (Generalizes the gauntlet catch.)
- `cold-fusion` (FM "Nuclear Double Over Down", fm=7) → **Tier C**: DOD-family policy-dependent ADD
  doctrine gate. Hold for the DOD Red question.
- `blurry-chainsaw-massacre` (FM "Blurry Illusioning Paradox Symposium Eggbeater", fm=7) → **Tier C**:
  two gates (blurry-transitivity + unregistered `illusioning`). Doubly blocked.
- `clown-face` (FM "Furious Eggbeater", fm=7) / `genesis` (FM "Furious Whirl") → **Tier B/C
  (frontier_review)**: `furious` is registered and the decomposition is clean, but FM-only and
  single-source — needs source/cultural corroboration before promotion, not parser work.
- `big-apple-sauce` (FM "Spinning Paradox Miraging Symposium Torque", fm=9) → **Tier C**: deep stack,
  FM-only, above-7; structurally parseable but uncorroborated + complexity-fragile. Adjudication, not promotion.

## Output (when the methodology is run)

A reversible staging registry `candidates/fm_folk_ge7_triage.csv` (read-only-derived, no DB writes):
`slug, folk_name, fm_add, official_add, fborg_add, fm_technical_name, decomposed_structure,
structure_in_db, tier, frontier_status, doctrine_gates, unregistered_ops, action`. One row per candidate;
curator reviews and rules; nothing promotes without curator + (where gated) Red sign-off.

## Governance guardrails + non-goals

- No promotion, no canonical edits, no operator registration in this phase.
- No SQL/schema; staging CSV + content-module only.
- Do not treat the FM ≥7 claims as ADD authority; corroboration required before Tier A.
- Eagle theory remains out of scope (curator-undefined); this methodology stands alone.

## Recommended next actions

1. **Run the triage** to produce `fm_folk_ge7_triage.csv` over all 40 novel candidates (read-only; the
   profile above is the validated shape). Highest immediate value: surface the Tier-B duplications
   (folk names for existing canon, alias-wire like gauntlet) and isolate the Tier-C doctrine cohort.
2. Feed the new unregistered operators (Railing/Floating/Surfing/Spyro) into operator-triage.
3. Route the doctrine clusters (DOD-policy, blurry-transitivity, atomic-Q3) to the Red packet — they
   gate multiple candidates each, so one ruling unblocks many.
