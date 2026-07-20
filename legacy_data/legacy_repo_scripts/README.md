# legacy_repo_scripts — footbag.org forensic / provenance layer

**What this is:** a small, isolated, append-only *archival* layer for the legacy
footbag.org mysqldumps. Its only job (for now) is to prove a single workflow:

```
raw dump  ->  safe selective extraction  ->  provenance-stamped NDJSON  ->  audit trail
```

**What this is NOT (yet):**

- Not a product subsystem.
- Not a normalized data model.
- Not connected to the production database.
- Not a reconciliation engine.
- Not a generalized ingestion platform.

It is a **forensic / historical-preservation layer** and a **future reconciliation
source**. The live platform systems remain authoritative and are never touched by
this code:

- freestyle ontology / dictionary
- media_items
- club bootstrap
- persons / PT
- current IFPA governance

Legacy imports must **never silently overwrite or supersede** those systems.

## Layout

```
config/      sources.yaml, allowlist.yaml, denylist.yaml  (committed)
scripts/     seal.py, ingest.py                            (committed)
raw/         immutable verbatim dumps + .sha256 sidecars   (GITIGNORED)
parsed/      extracted NDJSON, rebuildable from raw         (GITIGNORED)
reports/     ingest_<app>_<date>.audit.json                 (committed, payload-free)
```

## Safety boundaries (non-negotiable)

1. **raw/ is immutable.** Sealed once, `chmod 0444`, never overwritten. A new dump
   lands as a new dated file.
2. **No data in git.** `raw/` and `parsed/` are gitignored. Only code, config, and
   payload-free audit reports are tracked.
3. **Allowlist-only extraction.** A table is processed only if it is listed in
   `allowlist.yaml` for that app. No wildcards.
4. **Denylisted columns are destroyed before any read.** See `denylist.yaml`.
5. **Reversible.** Every downstream artifact is rebuildable from immutable raw.

## Status

**Step 0 — scaffolding only.** `seal.py` and `ingest.py` are skeletons; their
mutating / extraction steps raise `NotImplementedError` on purpose, so running them
today cannot cause an irreversible change. No ingestion has been run.

## Dependencies

- Python 3
- PyYAML (config parsing) — the only external dependency.
