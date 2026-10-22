---
paths:
  - "scripts/**"
  - "legacy_data/**/*.py"
  - "legacy_data/**/*.sh"
  - "freestyle/loaders/**"
  - "freestyle/scripts/**"
  - "freestyle/tools/**"
  - "freestyle/*.sh"
---

# Database write safety

Two kinds of script write to the database, and their safeguards differ.

## Rebuild loaders

A loader that runs inside a from-scratch rebuild (`scripts/reset-local-db.sh`,
`legacy_data/run_pipeline.sh`, `freestyle/run_freestyle.sh`) writes a database the rebuild created
and can recreate, so it needs no apply flag, audit CSV or rollback SQL. It still:

- writes each table set in one transaction, committed once, so a failure leaves no half-loaded table;
- replaces a pipeline-regenerated table with DELETE + INSERT inside that transaction, scoping the
  DELETE where owners share a table (the loader contract in `legacy_data/CLAUDE.md`);
- refuses on a missing input or unmet precondition rather than skipping rows.

## In-place patches

A script that changes rows in a database it did not just build (an identity patch, a link
reconciliation, a backfill, any write to staging or production data):

- runs a read-only diagnostic first and validates its preconditions;
- is a dry run by default and writes only with an explicit `--apply` flag;
- writes an audit CSV of every row it will change, and the rollback SQL that restores them, before
  writing;
- makes all its writes in one transaction.

`legacy_data/member_data_scripts/apply_reconciled_links.py` is the model. Such data is never
changed by hand-typed SQL; write the script.
