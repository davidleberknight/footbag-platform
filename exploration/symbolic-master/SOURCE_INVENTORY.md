# Part A — Source Inventory (2026-05-24)

## Project-internal notation / ontology sources

| File / Surface | Role | Active? | Layer |
|---|---|---|---|
| `freestyle_tricks` DB table (loaded from CSVs by scripts 17/19) | Canonical trick row store: slug, canonical_name, adds, base_trick, trick_family, notation (compact), operational_notation (JOB), aliases | **Active** — public-route source of truth | Structural accounting + JOB notation column |
| `legacy_data/inputs/noise/tricks.csv` | Curated baseline trick list (most active rows; loaded by script 17) | **Active** | Data input |
| `legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv` | Red Husted curator overlays (body primitives, set primitives, additional compounds; loaded by script 19) | **Active** | Data input |
| `legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` | Per-field corrections (`field` column: notation / operational_notation / base_trick / is_active / ...) | **Active** | Data input |
| `src/content/freestyleResolvedFormulas.ts` (`RESOLVED_FORMULAS_SPRINT_1`) | Curator-published ADD derivations + `operationalNotation` overrides for compound tricks | **Active** | Structural derivation + JOB override |
| `src/services/freestyleService.ts` — `ATOMIC_FLAG_DECOMPOSITIONS` | Slug → `{decomposition, totalAdd, operationalChain}` for folk-name canonical compounds (barfly, paradon, DLO, rev-whirl, etc.) | **Active** | Structural derivation |
| `src/services/freestyleService.ts` — `CORE_TRICK_SPEC` | 12-atom curator-locked spec including `operationalNotation` | **Active** | Atomic JOB notation |
| `src/services/freestyleService.ts` — `FIRST_CLASS_TIER_1 / TIER_2` | Sets gating which tricks render the Notation Summary card | **Active** | Publication governance |
| `src/content/freestyleSymbolicEquivalences.ts` | Chain readings (compound folk-name readings: ripwalk ≡ "stepping butterfly", DLO ≡ "miraging legover") | **Active** | Chain-reading layer |
| `src/content/freestyleTrackedNames.ts` | 558 unpublished documented names + their `operationalNotation` strings (FM-parens convention, mostly) | **Active** | Cross-source vocabulary |
| `src/content/freestyleObservationalTricks.ts` (`OBSERVATIONAL_TRICKS`) | Emerging Vocabulary entries (community-documented; not canonical) | **Active** | Layer-separated staging |
| `src/content/freestyleSemanticOverrides.ts` (`REVERSE_PAIR_TRANSFORMS`) | The 5 curator-locked rev(0) entries (illusion, pickup, rev-whirl, rev-swirl, orbit) | **Active** | ALT-row reverse-pair layer |
| `src/content/freestyleTrickIntuition.ts` | Movement-feel prose (7 entries: 6 core atoms + toe-stall) | **Active** | Pedagogical prose |
| `src/content/freestyleUnresolvedCompounds.ts` (`UNRESOLVED_COMPOUNDS`) | Slugs flagged with pending-decomposition pill | **Active** | Quality marker |

## Curator-authored exploration artifacts (planning only, not load-bearing)

| File | Role | Status |
|---|---|---|
| `exploration/scalable-publication-2026-05-23/PUBLICATION_STANDARDS.md` | 4-tier publication threshold + dual-convention rule | Draft for curator review |
| `exploration/derived-job-audit-2026-05-24/AUDIT.md` | 68-row classification of pending JOB derivations into Bucket A / B / C | Draft |
| `exploration/symbolic-master/` (this directory) | Master CSV + multi-system schema | Draft (this slice) |

## External / corpus sources

| Source | Where | Notation system | Active? |
|---|---|---|---|
| **footbag.org** `/newmoves/list` | Canonical-bracket-format JOB strings + per-trick narrative prose | `[BRACKETS]` convention | Reference (offline; archived in repo as needed) |
| **FootbagMoves (FM)** | Trick directory by community; uppercase + parens flags | FM-parens convention | Reference (cross-referenced in `freestyleTrackedNames.ts`) |
| **PassBack** | Records database + tutorial archive; PassBack-claim ADDs | PB difficulty claims (dex-count baseline per Red Q11-A) | Reference |
| **Stanford / Ben Lynn shorthand** (`exploration/stanford/stanford-1.txt` + `stanford-2.txt`) | Single-character compressed notation, 994-row move list | Stanford shorthand (`Z`, `X`, `+`, `-`, `0`, `1`, etc.) | **NEW this slice** — added as third symbolic layer |

## Stale / retired artifacts (kept on disk but not load-bearing)

- `exploration/_archive/` — shipped phase docs (no load).
- Various exploration directories from prior slices (read for context only; not source of truth).

## Authoritative layer ordering (forever-rule)

When a row carries multiple notation strings, the dictionary's render priority is:

1. `CoreTrickSpec.operationalNotation` (the 12 atoms; locked)
2. `ResolvedFormula.operationalNotation` override (curator-published compounds)
3. `freestyle_tricks.operational_notation` DB column (CSV-loaded canonical)

Stanford shorthand is **never** auto-promoted into any of the above. It lives only on the symbolic-master CSV until a curator explicitly authors a canonical-bracket equivalent.

## Overlap matrix

| Domain | Canonical DB | TrackedNames | Observational | Stanford |
|---|---:|---:|---:|---:|
| Total rows | 183 active | 558 | 62 | 994 |
| Carries JOB notation | ~80 (partial) | ~375 (FM-parens) | 2 (fborg) | 994 (Stanford shorthand) |
| Carries ADD value | 183 | 0 (no claim) | 49 (PB claim) | 994 (Stanford-bucketed) |
| Carries family | 183 | 0 | 0 | implicit via set prefix |
| Cross-references slug to canonical | self | 558 → not | 62 → not | 125 matched, 869 unmatched |

## Gaps surfaced by the inventory

1. **JOB-notation coverage gap.** ~100 active canonical compounds render `JOB: notation pending` because no source has authored a JOB string yet. The `derived-job-audit-2026-05-24` slice classified 35 as safely-derivable (Bucket A); the rest need curator review or stay pending.
2. **Stanford-only emerging cohort.** 869 Stanford-corpus tricks have no canonical row. Many are likely candidates for Emerging Vocabulary promotion; per-row curator triage required.
3. **Single-source ADD claims.** PassBack claims live in `freestyleObservationalTricks.proposedAddTotal`; Stanford claims via the per-section `2 ADD` / `3 ADD` headers. These two systems share many overlapping community labels but their numeric claims may diverge — neither replaces the canonical executable ADD.
4. **No unified search index.** A reader looking up a trick by Stanford shorthand or FM-format string has no way to find it cross-system today.
