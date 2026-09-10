#!/usr/bin/env python3
"""Load the legacy IFPA governance CSVs into the throwaway
`internal_governance_*` tables defined in `database/schema.sql`'s
"Legacy-governance-review only" block.

Committees, rosters, group files, elections, issues and the derived vote
tallies, loaded so the Board can rule on disposition by browsing the data
rather than reading `mysqldump` text. The tables, this loader and the
matching `src/db/db.ts` statement group are deleted together before the
production build; see the retirement inventory in GO_LIVE_PLAN (private
repo).

Three source files are never read here, regardless of what the export
contains -- the card's hard bars, not a completeness gap:
  - `ifpa_issue_votes.csv` (ballot-level rows; no ballot row or member id may
    reach any table -- the derived/reconciled tallies already cover this)
  - `ifpa_memberpayments.csv` and `ifpa_membership_transactions.csv`
    (forbidden wholesale; private export only)
The legacy group-message archive is not read either, but for a different
reason: it was never delivered in the export at all.

`ifpa_group_files.csv`'s committee-scoping is labelled from its `FileScope`
column only, never from the private-custody manifest -- the manifest is a
stale subset (97 of the 214 actually-scoped files) and using it would
mislabel 117 files as unscoped.

Each table is a full DELETE+INSERT per run (throwaway staging data with no
natural per-row upsert key worth tracking), so a re-run over unchanged input
leaves the tables byte-for-byte the same and a corrected export always wins
cleanly over a stale load. Every source file's row count is checked against
its own `MANIFEST.tsv` entry before loading, so a short or long read aborts
loudly instead of silently loading a partial table.

Dry-run by default; --apply performs the writes inside one transaction.

Usage:
  python legacy_data/scripts/load_governance_tables.py [--db path] [--apply]
"""
from __future__ import annotations

import argparse
import csv
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "lib"))
from db_cutover_guard import assert_db_pre_cutover  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
PRIVATE = REPO_ROOT / 'footbag_private_repo'
EXPORT = PRIVATE / 'legacy-export'
DEFAULT_DB = REPO_ROOT / 'database' / 'footbag.db'

# Named individually, not just excluded by omission, so a reviewer can see at
# a glance that this loader knows about them and still refuses.
NEVER_LOADED = (
    'ifpa_issue_votes.csv',
    'ifpa_memberpayments.csv',
    'ifpa_membership_transactions.csv',
)


def epoch_to_iso(raw: str | None) -> str | None:
    """Legacy timestamps are unix seconds; 0 means unset. Formatted as
    'YYYY-MM-DDTHH:MM:SS.sssZ' per schema.sql's lexical-sort contract, not
    Python's default isoformat() (which emits '+00:00', not 'Z')."""
    raw = (raw or '').strip()
    if not raw.isdigit() or raw == '0':
        return None
    return datetime.fromtimestamp(int(raw), timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')


def flag(raw: str | None) -> int:
    return 1 if (raw or '').strip() == '1' else 0


def opt(raw: str | None) -> str | None:
    raw = (raw or '').strip()
    return raw or None


def opt_int(raw: str | None) -> int | None:
    raw = (raw or '').strip()
    return int(raw) if raw.isdigit() else None


def manifest_row_count(manifest_path: Path, filename: str) -> int:
    if not manifest_path.is_file():
        raise SystemExit(f'Missing manifest: {manifest_path}')
    with open(manifest_path, encoding='utf-8', newline='') as fh:
        for row in csv.DictReader(fh, delimiter='\t'):
            if row['file'] == filename:
                return int(row['rows'])
    raise SystemExit(f'{filename} has no MANIFEST.tsv entry in {manifest_path}')


def read_export_csv(path: Path) -> list[dict]:
    """A real CSV parser (never line-splitting) against a row count already
    verified against the module's own MANIFEST.tsv, so a short read aborts
    loudly instead of silently loading a partial table."""
    if path.name in NEVER_LOADED:
        raise SystemExit(f'refusing to read forbidden source file: {path.name}')
    if not path.is_file():
        raise SystemExit(f'Missing export file: {path}')
    expected = manifest_row_count(path.parent / 'MANIFEST.tsv', path.name)
    with open(path, encoding='utf-8', newline='') as fh:
        rows = list(csv.DictReader(fh))
    if len(rows) != expected:
        raise SystemExit(
            f'{path.name}: read {len(rows)} rows, manifest says {expected} -- '
            f'refusing a short/long read')
    return rows


def build_committees() -> list[tuple]:
    rows = read_export_csv(EXPORT / 'groups/ifpa_committees.csv')
    return [(
        r['CommitteeID'],
        flag(r['CommitteeValid']),
        flag(r['CommitteePublic']),
        opt(r['CommitteeName']),
        opt(r['CommitteeOwnerID']) if r['CommitteeOwnerID'] != '0' else None,
        opt(r['SubcommitteeOfID']) if r['SubcommitteeOfID'] != '0' else None,
        opt(r['CommitteeCharter']),
        flag(r['CommitteeEmail']),
        flag(r['CommitteePrependSubject']),
        opt(r['CommitteeEmailSubject']),
        flag(r['CommitteeEmailRestricted']),
        flag(r['CommitteeEmailModerated']),
        flag(r['CommitteeEmailArchived']),
        opt(r['CommitteeKeyword']),
        opt(r['CommitteeType']),
        flag(r['CommitteeIsOfficial']),
        epoch_to_iso(r['CommitteeCreated']),
        epoch_to_iso(r['CommitteeModified']),
    ) for r in rows]


def build_committee_members() -> list[tuple]:
    rows = read_export_csv(EXPORT / 'groups/ifpa_committee_members.csv')
    return [(
        f"{r['CommitteeID']}:{r['CommitteeMemberID']}",
        r['CommitteeID'],
        r['CommitteeMemberID'],
        opt_int(r['CommitteeMemberPriority']),
        opt(r['CommitteeMemberTitle']),
        opt(r['CommitteeMemberAlias']),
        opt(r['CommitteeMemberName']),
        flag(r['CommitteeMemberAdmin']),
        opt(r['CommitteeMemberPrivs']),
        flag(r['CommitteeMemberVoting']),
    ) for r in rows]


def build_group_files() -> list[tuple]:
    rows = read_export_csv(EXPORT / 'groups/ifpa_group_files.csv')
    records = []
    for r in rows:
        scope = opt_int(r['FileScope']) or 0
        records.append((
            r['FileID'],
            flag(r['FileVisible']),
            opt(r['FileName']),
            opt_int(r['FilePriority']),
            opt(r['FileOwnerID']),
            opt(r['FileGroupID']),
            opt(r['FileLocation']),
            epoch_to_iso(r['FileCreated']),
            epoch_to_iso(r['FileModified']),
            1 if scope != 0 else 0,
            str(scope) if scope != 0 else None,
            opt(r['FileDescription']),
        ))
    return records


def build_elections() -> list[tuple]:
    rows = read_export_csv(EXPORT / 'ifpa/ifpa_elections.csv')
    return [(
        r['ElectionID'],
        opt(r['ElectionOwnerID']),
        opt(r['ElectionCommitteeID']) if r['ElectionCommitteeID'] != '0' else None,
        flag(r['ElectionVisible']),
        opt(r['ElectionTitle']),
        epoch_to_iso(r['ElectionStart']),
        epoch_to_iso(r['ElectionDeadline']),
        opt(r['ElectionDescription']),
        epoch_to_iso(r['ElectionCreated']),
        epoch_to_iso(r['ElectionModified']),
    ) for r in rows]


def build_issues() -> list[tuple]:
    rows = read_export_csv(EXPORT / 'ifpa/ifpa_issues.csv')
    records = []
    for r in rows:
        answers = [opt(r[f'IssueAnswer{i}']) for i in range(1, 11)]
        tallies = [opt_int(r[f'IssueTally{i}']) for i in range(1, 11)]
        records.append((
            r['IssueID'],
            flag(r['IssueVisible']),
            opt(r['IssueElectionID']),
            opt_int(r['IssueElectionOrder']),
            opt(r['IssueQuestion']),
            *answers,
            *tallies,
            opt(r['IssueOwnerID']),
            epoch_to_iso(r['IssueCreated']),
            epoch_to_iso(r['IssueModified']),
            opt(r['IssueDescription']),
            flag(r['IssueIsElection']),
        ))
    return records


def build_issue_vote_tallies() -> list[tuple]:
    rows = read_export_csv(EXPORT / 'derived-vote-tallies/tally_reconciliation.csv')
    return [(
        f"{r['issue_id']}:{r['answer_index']}",
        r['issue_id'],
        opt(r['election_id']),
        opt(r['question']),
        int(r['answer_index']),
        opt(r['answer_text']),
        opt_int(r['derived_votes']),
        opt_int(r['stored_tally']),
        opt_int(r['capture_count']),
        opt(r['status']),
    ) for r in rows]


TABLES: list[tuple[str, int, object]] = [
    ('internal_governance_committees', 18, build_committees),
    ('internal_governance_committee_members', 10, build_committee_members),
    ('internal_governance_group_files', 12, build_group_files),
    ('internal_governance_elections', 10, build_elections),
    ('internal_governance_issues', 30, build_issues),
    ('internal_governance_issue_vote_tallies', 10, build_issue_vote_tallies),
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', default=str(DEFAULT_DB))
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    if not EXPORT.is_dir():
        raise SystemExit(
            f'{EXPORT} does not exist. Wire the footbag_private_repo symlink '
            f'at {REPO_ROOT} and re-run.')

    if args.apply:
        assert_db_pre_cutover(args.db, 'load_governance_tables.py')

    conn = sqlite3.connect(args.db) if args.apply else None

    counts: dict[str, int] = {}
    for table, width, builder in TABLES:
        records = builder()
        counts[table] = len(records)
        if args.apply:
            placeholders = ','.join(['?'] * width)
            conn.execute(f'DELETE FROM {table}')
            conn.executemany(f'INSERT INTO {table} VALUES ({placeholders})', records)

    scoped = sum(1 for r in build_group_files() if r[9] == 1)

    if args.apply:
        conn.commit()
        conn.close()

    mode = 'APPLIED' if args.apply else 'DRY RUN (pass --apply to write)'
    print(f'-- {mode} --')
    for table, _, _ in TABLES:
        print(f'{table}: {counts[table]} rows')
    print(f'internal_governance_group_files: {scoped} committee-scoped, '
          f'{counts["internal_governance_group_files"] - scoped} unscoped')


if __name__ == '__main__':
    main()
