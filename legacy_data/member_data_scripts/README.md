# Legacy member data scripts

This directory holds the legacy member load: it validates, reconciles and loads
the legacy footbag.org member accounts into `legacy_members`, with the tier flags
measured at cutover, the admin flag and the board flag. It reads the published
member CSV in the maintainers' private checkout, never the legacy repository or a
database dump, and it is kept separate from the two intakes that read committed
or mirrored inputs:

- the historical mirror pipeline (`legacy_data/pipeline/`,
  `legacy_data/event_results/`, `legacy_data/clubs/`), which reads the offline
  footbag.org HTML mirror, and
- curated media and freestyle content (`curated/`, `freestyle/`).

## The input is the published member CSV

The legacy refresh (`legacy_data/scripts/refresh_legacy_repo_data.py`) is the one
program that reads the legacy repository; it writes vetted per-table CSVs, every
stored credential withheld, into the private checkout's `legacy-export/`. The
legacy publish (`legacy_data/scripts/publish_legacy_repo_data.py --cutover-date
YYYY-MM-DD`) builds the finished member CSV from those at
`legacy-publish/legacy_members.csv` in the same checkout, and fixes the cutover
date and the board flag in it. The runner resolves that path through the
git-ignored repo-root `footbag_private_repo` symlink; no operator command carries
a path. The loader still aborts before reading any row if a credential-bearing
column header is found.

## Behavior without the private checkout

The private checkout exists only on a maintainer machine. Without it, the load
refuses with the missing path named, and a `--all-data` build refuses before any
destructive step. A development database built without it (`./run_dev.sh
--reset`) carries no member data: its `legacy_members` rows are the system
fixtures every build seeds from the club rosters and canonical persons (an id and
a display name), the Footbag Hacky fixture and, by default, the test personas.
That is the correct state for local development and CI.

## Maintainer-only, cutover-time load

Loading the real member values is a cutover-migration step run on maintainer
machines; it is not run against the production database after go-live. Local and
CI builds run against the inert default columns and seeded fixtures.

There is one load path, no modes, entered through `run_legacy_members.sh --load`;
every run prints what it found. The recorded account rulings live in the private
checkout under `private_data/stage_a_overrides/`, which the runner resolves by
canonical path rather than from any variable. A production build (`deploy_to_aws.sh
--target production`) makes them mandatory, and the final cutover load (the same
deploy with `--final-member-load`) also requires every membership-only person to
carry a proposed link or a recorded disposition; a machine without them
loads on the mechanical merge rule and says so. The retired `--extract`,
`--from-csv` and `--final-export` flags are refused by name rather than silently
ignored. The runner's `--help` is authoritative for all of it.

## Intermediate outputs

The load writes credential-free but PII-bearing working files (member emails,
names, addresses, dates of birth) into a git-ignored `out/` directory in this
folder: the honours-joined member CSV, the Stage A review and merge map, the
Stage B proposed links, and the apply audit and rollback files. They are produced
and consumed within one `--load` run and are never committed.

## Contents

The Goldberg member-account data family lives here:

- `run_legacy_members.sh` is the entry point: it resolves the private inputs,
  reports them, applies the refusals above, and sequences everything below.
- `extract_legacy_members.py`, `extract_legacy_admins.py` and `_dump_parser.py`
  are retired and kept as the record of earlier extracts; nothing runs them.
- `validate_legacy_export.py` gates the export before load.
- `reconcile_legacy_members.py` groups duplicate accounts and proposes
  account-to-person links into git-ignored review CSVs for human adjudication;
  it never merges accounts and never writes the database. When the recorded
  rulings are present, Stage B applies the person-link holds and review
  resolutions to its proposals and the final merge applies the account
  rulings, all fingerprinted and failing closed on drift, and every ruling row
  must be applied; the final merge also refuses to build artifacts while no row
  carries an active Tier 1 annual, so an OR-merge cannot drop a grant.
- `snapshot_legacy_members.py` captures the pre-load state of every row the
  member load could touch, as an audit CSV plus rollback SQL, so an applied
  load can be fully reverted.
- `load_legacy_export.py` loads the member CSV into `legacy_members`, applying
  the merge map when the rulings produced one; it writes the board flag the
  claim reads, and reads and ignores the empty underlying-tier column.
- `apply_reconciled_links.py` applies the reconciliation's cleared
  account-to-person links to `historical_persons.legacy_member_id` (dry-run
  by default, writing its own audit CSV and rollback SQL).
- `extract_legacy_honors.py` / `validate_legacy_honors.py` /
  `report_legacy_member_honors.py` / `diff_live_honor_rosters.py` derive,
  validate, report, and drift-check the Hall-of-Fame and Big-Add-Posse honor flags.
  `validate_legacy_honors.py --flags-from-db` judges the flags as loaded; the
  runner calls it after the links are applied and fails the load on any mismatch,
  and the real-data test row runs it too.
- `audit_member_data.py` checks that the delivered member data still yields its
  audited figures (export size, the uncovered-row ruling, name-encoding repairs,
  the membership-only cohort, the historical-person account assertions), reading
  the private `legacy-export/members/members.csv`, the private rulings, and the
  figures audited for the delivery, which live in the private
  `legacy-publish/audit/` and are re-audited there per delivery as a data edit;
  counts and PASS/FAIL only. The runner calls it after the honours check and fails
  the load on any finding; the real-data test row and every production deploy that
  ships a database run it too. An uncovered row or an unbacked account assertion
  with no recorded decision fails it; the platform's own Footbag Hacky account is
  covered by design and needs none.
- `crosscheck_member_profile_ids.py` reconciles the dump member-id namespace
  against the mirror profile-URL ids.
- The two read-only reports (`crosscheck_member_profile_ids.py`,
  `report_legacy_member_honors.py`) also run automatically at the end of every
  `--all-data` build, writing their worklists under the gitignored
  `legacy_data/reports/`.

The build wrapper is `run_legacy_members.sh` above, reached from a data build
via `./run_dev.sh --all-data` or `deploy_to_aws.sh`. Remaining open load-design
questions live in the maintainers' private tracker.
