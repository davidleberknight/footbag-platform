# Generator pass — fold junk out of the public Emerging Vocabulary (2026-06-25)

Folded aliases / misspellings / malformed scrape strings / single-source junk OUT of the public
frontier, in `legacy_data/scripts/build_observational_universe_content.py`. No promotion, no
authoring. Goal: honest, smaller public counts. Junk is kept only in an internal reports CSV.

## First finding: the committed universe was stale

The committed `freestyleObservationalUniverse.ts` had **1,276 rows**; a fresh regen from current
inputs + DB yields **1,434**. So the public page had been rendering stale counts. The 1,434 fresh
regen is the honest BEFORE baseline for the fold.

## Rules applied (long-tail folk + parser rows only; frontier/doctrine untouched)

| Input | Disposition |
|---|---|
| alias-collapse / duplicate-of-an-emitted-slug | alias archive (kept in TS, lookup-only) — unchanged |
| misspelling / normalized duplicate of a canonical slug (edit-distance ≤1 or hyphen/space variant) | **alias** (high-confidence resolves to a real trick) |
| malformed scrape / OCR / parser string (comma, leading digit, stray chars, prose) | **junk** (internal CSV, dropped) |
| single-source, no structure, no known atom/operator, no recurring operator | **junk** (internal CSV, dropped) |
| carries a real atom/operator token (plausibly real folk) | keep public (folk) |
| undefined operator that recurs ≥3 times (worth investigating) | keep public (folk) |
| multi-source (corroborated ≥2) | keep public (unresolved candidate) |

## Before → after (fresh regen → after fold)

| Metric | Before (fresh regen) | After fold | Δ |
|---|---:|---:|---:|
| Total public rows | 1,434 | **1,272** | −162 |
| `low_confidence` (single-source noise) | 649 | **418** | −231 |
| `alias` (archive, lookup-only) | 432 | 502 | +70 (misspellings folded in) |
| folk section | 698 | 587 | −111 |
| parser section | 390 | 339 | −51 |
| archive layer | 1,137 | 976 | −161 |
| frontier layer | 297 | 296 | −1 |

The 231-row drop in `low_confidence` = **162 → junk CSV** + **69 → alias archive** (misspellings).
Frontier (the real promotion surface) is essentially unchanged: the fold only touched noise.

## What was folded (162 junk → `legacy_data/reports/observational_junk_folded.csv`)

- **138 low-confidence, no signal** — coined single-source names with no recoverable structure and no
  real operator/atom token: Amadeus, Anonymous, Apocalypse, Arachnophobia, Badger, Blackula, Frenzy, …
- **24 malformed** — scrape/OCR/list artifacts: "84", "Alex Zerbe is the greatest",
  "ATW, Around the World", "Bill & Ted`s Bogus Journey", "Cardinal Swirl, Tripstein",
  "Components of sets, but not necessarily sets", "Dex, Dexterity", …

## What was kept (validated "plausibly real")

Kept low-confidence folk all carry a signal: a known atom/operator (Frantic Clipper, Double Helix,
Double Reverse ATW, Fusing Clipper) or a recurring real folk operator worth investigating
(`alpine` — a real uptime/downtime split — keeps "Alpine Void" / "Alpine Super Mario"). Names with no
such signal are folded out.

## Reversibility / mechanism

- Pure generator change + internal CSV; the TS is regenerated, not hand-edited. Re-run to refresh.
- Thresholds are curator-tunable constants: `KNOWN_TOKENS`, `REPEATED_OPERATOR_MIN` (=3),
  `is_malformed`, `is_misspelling`. Raising/lowering them retunes how aggressive the fold is.
- The page needs no change: a smaller universe yields smaller public counts automatically; aliases
  remain in the existing archive disclosure for lookup.
- No promotion, no authoring, no schema change, no DB write.
