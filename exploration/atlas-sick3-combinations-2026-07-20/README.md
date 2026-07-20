# Atlas: combination compatibility + historical Sick 3 study (2026-07-20)

Research-only Atlas subtrack. Establishes whether the current trick model can describe
executable three-trick sequences (setting foot, terminal foot relative to set, entry and
terminal surfaces, persistent foot identity, current ADD), audits the Combinations page,
and catalogs the historical Sick 3 corpus recoverable from project sources.

Boundaries honored: no production data, public pages, canonical notation, aliases,
scoring doctrine, or generated content were modified. The rotational-path dossier stays
paused; its footage review and the operator-order study were not touched. Scripts here
are research-only and must not become production generators.

## Model

Per trick: entry/set state -> ordered movement events -> terminal foot relative to the
original set -> terminal surface. Terminal-foot relation labels: PRESERVE (set foot =
terminal foot), SWITCH, VARIABLE (canonically either), UNRESOLVED (evidence does not
determine it). The terminal relation is read from the actual terminal contact segment's
resolved side chain (component-relative SAME/OP), never inferred from the final dexing
leg. Sequence state carries relative foot parity, so mirror (left/right) choice can never
fail a sequence.

## Contents

| File | What it is |
|---|---|
| `01_build_trick_transition_inventory.py` | Builds the per-trick transition inventory + parity census from the DB (read-only) |
| `02_extract_sick3_corpus.py` | Extracts historical Sick 3 sequences from the footbag.org mirror event pages |
| `03_compatibility_analysis.py` | Link-compatibility engine + statistics over resolved sequences |
| `out/trick_transition_inventory.csv` | 970 active public canonical tricks, classified |
| `out/terminal_parity_census.md` | PRESERVE/SWITCH/VARIABLE/UNRESOLVED distributions + cross-tabs + the dex-parity test |
| `out/combinations_page_audit.md` | Audit of `/freestyle/combo-analysis` (editorial page; one confirmed defect: corpus statistics not reproducible in-repo) |
| `packets/` | Three self-contained review packets (Sick 3 linkage rules; Whirlwind alias; eleven unstated terminal sides) |
| `out/sick3_source_catalog.csv` | Every raw source record (raw names preserved beside canonical resolution) |
| `out/sick3_sequences.csv` | Normalized unique sequences with occurrence counts and provenance |
| `out/sick3_compatibility.csv` | Per-sequence parity vector, link statuses, surface chain |
| `out/sick3_statistics.md` | Phase 6 statistics (distributions, chronology, compatibility rates, caveats) |
| `out/compatibility_anomalies.md` | Phase 7 findings, classified; nothing repaired |

## Headline results

- 970 tricks classified: PRESERVE 449 / SWITCH 445 / VARIABLE 42 / UNRESOLVED 34.
- Dex-count parity does NOT determine the terminal foot (~48% agreement; refuted by test).
- 308 raw Sick 3 source records; 117 fully-resolved unique sequences; 94% have both links
  compatible under the state model.
- All five Combinations-page worked examples are physically valid under the model; the
  page's cited corpus statistics, however, are not reproducible from any in-repo artifact
  (a previously-gated known issue).
- Strongest notation challenge: bedwetter's TOE-only entry vs four independent historical
  CLIP-entry performances (see anomalies F1).

Reproduce: run the three scripts in order with the repo venv-less system python3; they
read `database/footbag.db` via a read-only URI and write only into `out/`.
