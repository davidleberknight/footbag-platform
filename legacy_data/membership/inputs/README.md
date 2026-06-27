# Membership inputs

This directory holds the operator-provided membership roster that drives the
full member enrichment load. The roster file itself is **never committed**; only
this README is tracked.

## `membership_input_normalized.csv` (gitignored)

A normalized extract of the private IFPA admin membership report. It contains
real member data (names and membership status), so it is held locally only and
is excluded by `.gitignore`, on the same model as the footbag.org mirror and the
canonical event inputs. It cannot be regenerated from the mirror or from any
committed source; obtain it from the project maintainer as a separate handoff.

Handling is governed by `docs/DATA_GOVERNANCE.md`: real member data is worked
only in an operator-controlled environment and is never committed, pasted into
issues or logs, or placed in any shared or AI-readable context.

### Expected columns

The loader reads these columns (header row required):

| Column             | Meaning                                                        |
|--------------------|----------------------------------------------------------------|
| `source_row_id`    | Stable row identifier from the source report                   |
| `name_raw`         | Member name as it appears in the source report                 |
| `name_norm`        | Normalized name (NFKC, lowercased, trimmed)                    |
| `first_name_norm`  | Normalized first name                                          |
| `surname_core`     | Normalized core surname used for matching                      |
| `first_initial`    | First initial, for initial-plus-surname matching              |
| `status`           | Membership status (for example `active`)                       |
| `expiration`       | Expiration date, or `LIFETIME` for lifetime memberships        |
| `provisional_tier` | Provisional tier label (for example `provisional_lifetime`)    |
| `source_file`      | Source report filename the row came from                       |
| `source_page`      | Page number within the source report                           |

## What consumes it

`legacy_data/membership/scripts/01_build_membership_enrichment.py` reads this
file, resolves each member against the canonical persons set
(`legacy_data/event_results/canonical_input/persons.csv`) through the
`AliasResolver`, and writes the match results to `legacy_data/membership/out/`
(also gitignored). This runs as part of the full enrichment build invoked by
`./run_dev.sh --from-csv` (and `--soup-to-nuts`); the pipeline aborts with a
preflight error if the file is absent. The committed-data hello-world path
(`./run_dev.sh` / `--reset`) does not use this file.
