# Moved: the ruling ledger now lives in the committed inputs

`EV_FORMULA_IDENTITY_ROWS.csv` — the ruling ledger the observational-universe
generator reads as its adjudication authority — has moved to a permanent, committed
inputs home:

    freestyle/inputs/observational/EV_FORMULA_IDENTITY_ROWS.csv

`freestyle/scripts/build_observational_universe_content.py` and the generated-content
consistency check read it there. Nothing in the build depends on this research
directory any longer.

`REPORT.md` in this directory stays as the audit context (the methodology and
disposition summary behind that ledger); it is provenance, not a build input.
