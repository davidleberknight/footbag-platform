# Legacy member data scripts

This directory holds the processing for the legacy footbag.org database dump: the
registered member accounts, the IFPA payment and governance tables, and the
committee and board roster. It is the one data-intake path that reads the live
legacy site's database, and it is kept separate from the two intakes that read
committed or mirrored inputs:

- the historical mirror pipeline (`legacy_data/pipeline/`,
  `legacy_data/event_results/`, `legacy_data/clubs/`), which reads the offline
  footbag.org HTML mirror, and
- curated media and freestyle content (`curated/`, `freestyle/`).

Isolating member-account processing here lets the build run it as its own step
and skip it cleanly when the dump is not present.

## The dump location is operator-supplied, never hardcoded

The footbag.org database dump contains clear-text passwords and personal data. It
is never committed, and its filesystem location is never written into any script,
document, or config in this repository. Each script reads the location from the
operator at run time:

- as an explicit argument for the table file it parses (for example
  `--members-sql <path>`), or
- from an environment variable naming the dump root, passed in by the build
  wrapper.

Scripts open the dump read-only and write only their own output files. Credential
and session columns are dropped during extraction, and the load step aborts
before reading any row if a credential-bearing column header is found.

## Behavior when the dump is absent

The dump exists only on a maintainer machine. When it is absent, the member-data
step prints a warning and is skipped, and the rest of the build (schema,
mirror-derived data, curated data, seeds) proceeds normally. A build with no dump
produces a database that carries no legacy member accounts, which is the correct
state for local development and CI.

## Maintainer-only, cutover-time load

Deriving and loading the real member values runs against the dump that only the
maintainers hold, as a cutover-migration step. It is not run against the
production database after go-live. Local and CI builds run against the inert
default columns and seeded fixtures.

## Intermediate outputs

The extract scripts write credential-free but PII-bearing intermediate CSVs
(member emails, names, addresses, dates of birth) into a git-ignored `out/`
directory in this folder. They are inputs to the load step only and are never
committed.

## Contents

The Goldberg member-account data family lives here:

- `extract_legacy_members.py` / `extract_legacy_admins.py` parse the `members`
  and admins dumps into credential-free loader-input CSVs.
- `validate_legacy_export.py` gates the export before load.
- `reconcile_legacy_members.py` groups duplicate accounts and proposes
  account-to-person links into git-ignored review CSVs for human adjudication;
  it never merges accounts and never writes the database.
- `snapshot_legacy_members.py` captures the pre-load state of every row the
  member load could touch, as an audit CSV plus rollback SQL, so an applied
  load can be fully reverted.
- `load_legacy_export.py` loads the export CSV into `legacy_members`.
- `apply_reconciled_links.py` applies the reconciliation's cleared
  account-to-person links to `historical_persons.legacy_member_id` (dry-run
  by default, writing its own audit CSV and rollback SQL).
- `extract_legacy_honors.py` / `validate_legacy_honors.py` /
  `report_legacy_member_honors.py` / `diff_live_honor_rosters.py` derive,
  validate, report, and drift-check the Hall-of-Fame and Big-Add-Posse honor flags.
- `crosscheck_member_profile_ids.py` reconciles the dump member-id namespace
  against the mirror profile-URL ids.
- The two read-only reports (`crosscheck_member_profile_ids.py`,
  `report_legacy_member_honors.py`) also run automatically at the end of every
  `--all-data` build, writing their worklists under the gitignored
  `legacy_data/reports/`.

The build-wrapper step that runs these as a dump-gated, warn-and-skip phase, and
the full load design (composed birth date, email-column population, de-duplication
against `historical_persons`, the production-DB guard), are tracked in the
maintainers' private tracker.
