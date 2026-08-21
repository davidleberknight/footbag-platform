#!/usr/bin/env python3
"""One row per legacy group, carrying everything a disposition ruling needs.

Ruling on a legacy group means asking whether it is still alive, who is in it,
what it holds and whether any of that was ever public. Those facts sit in four
separate exported files, so answering it today means joining them by hand, 170
times. This writes the join once.

It replaces the staging tables and the throwaway admin screen that were going to
serve the same purpose. Those would have put tables into the schema production
shares, for a read a spreadsheet does as well, so the worksheet is what the
rulings get instead.

Read from the committed export rather than from the dump, so the worksheet
regenerates from the same artifact everyone else is reading, and re-running it
after a fresh extraction picks up whatever the extraction picked up.

The last-message date has no other home: no dump carries it, and the host that
could answer the question is being switched off. It comes from the authenticated
scrape, and it is the only evidence of which discussions were still alive.

A ruling already written into the worksheet survives a re-run. The disposition
and notes columns are read back before anything is written and carried forward by
group id, because a generated file that eats the human's work on every run is a
trap this project has already been bitten by once.
"""
from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PRIVATE = REPO_ROOT / 'footbag_private_repo'
EXPORT = PRIVATE / 'legacy-export'
TARGET = PRIVATE / 'evidence/group-disposition-worksheet.csv'

# The two columns the human owns. Everything else is derived and rewritten.
RULED = ('disposition', 'notes')

FIELDS = [
    'group_id', 'name', 'keyword', 'type', 'official', 'valid', 'public',
    'parent_group_id', 'email', 'email_restricted', 'email_moderated',
    'email_archived', 'members', 'voting_members', 'admins', 'files',
    'committee_scoped_files', 'last_archive_message', 'created', 'modified',
    *RULED,
]


def read_rows(path: Path) -> list[dict]:
    if not path.is_file():
        raise SystemExit(f'Missing export file: {path}')
    with open(path, encoding='utf-8', newline='') as fh:
        return list(csv.DictReader(fh))


def as_date(epoch: str) -> str:
    """Legacy timestamps are unix seconds. A date is what a person ruling on a
    group needs; the seconds are noise."""
    raw = (epoch or '').strip()
    if not raw.isdigit() or raw == '0':
        return ''
    return datetime.fromtimestamp(int(raw), timezone.utc).strftime('%Y-%m-%d')


def carried_forward(target: Path) -> dict[str, dict]:
    """Whatever a human has already written into the worksheet, by group id."""
    if not target.is_file():
        return {}
    with open(target, encoding='utf-8', newline='') as fh:
        return {r['group_id']: {k: (r.get(k) or '') for k in RULED}
                for r in csv.DictReader(fh)}


def build(export: Path, target: Path) -> tuple[list[dict], int]:
    groups = read_rows(export / 'groups/ifpa_committees.csv')
    members = read_rows(export / 'groups/ifpa_committee_members.csv')
    files = read_rows(export / 'groups/ifpa_group_files.csv')
    scrape_path = export / 'scrape-only/group_archive_last_message.csv'
    scrape = read_rows(scrape_path) if scrape_path.is_file() else []

    member_count: Counter = Counter()
    voting_count: Counter = Counter()
    admin_count: Counter = Counter()
    for r in members:
        gid = r['CommitteeID']
        member_count[gid] += 1
        if (r.get('CommitteeMemberVoting') or '').strip() not in ('', '0'):
            voting_count[gid] += 1
        if (r.get('CommitteeMemberAdmin') or '').strip() not in ('', '0'):
            admin_count[gid] += 1

    file_count: Counter = Counter()
    scoped_count: Counter = Counter()
    for r in files:
        gid = r['FileGroupID']
        file_count[gid] += 1
        # Any non-zero scope restricts that one file to a committee, whatever
        # the group's own visibility. A public group still holds scoped files.
        if (r.get('FileScope') or '').strip() not in ('', '0'):
            scoped_count[gid] += 1

    last_message = {r['group_id']: r['archive_most_recent_message_date']
                    for r in scrape}
    kept = carried_forward(target)

    rows = []
    for g in groups:
        gid = g['CommitteeID']
        prior = kept.get(gid, {})
        rows.append({
            'group_id': gid,
            'name': g.get('CommitteeName', ''),
            'keyword': g.get('CommitteeKeyword', ''),
            'type': g.get('CommitteeType', ''),
            'official': g.get('CommitteeIsOfficial', ''),
            'valid': g.get('CommitteeValid', ''),
            'public': g.get('CommitteePublic', ''),
            'parent_group_id': g.get('SubcommitteeOfID', ''),
            'email': g.get('CommitteeEmail', ''),
            'email_restricted': g.get('CommitteeEmailRestricted', ''),
            'email_moderated': g.get('CommitteeEmailModerated', ''),
            'email_archived': g.get('CommitteeEmailArchived', ''),
            'members': member_count[gid],
            'voting_members': voting_count[gid],
            'admins': admin_count[gid],
            'files': file_count[gid],
            'committee_scoped_files': scoped_count[gid],
            'last_archive_message': last_message.get(gid, ''),
            'created': as_date(g.get('CommitteeCreated', '')),
            'modified': as_date(g.get('CommitteeModified', '')),
            **{k: prior.get(k, '') for k in RULED},
        })
    rows.sort(key=lambda r: int(r['group_id']))
    return rows, sum(1 for r in rows if any(r[k] for k in RULED))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', type=Path, default=None,
                    help='output file (default: the private evidence directory)')
    args = ap.parse_args()

    if not PRIVATE.is_dir():
        raise SystemExit(
            'The private operations checkout is not reachable. Wire the '
            f'footbag_private_repo symlink at {REPO_ROOT} and re-run.')
    target = args.out or TARGET
    rows, ruled = build(EXPORT, target)

    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, 'w', encoding='utf-8', newline='') as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)

    public = sum(1 for r in rows if str(r['public']).strip() not in ('', '0'))
    scoped = sum(1 for r in rows if r['committee_scoped_files'])
    alive = sum(1 for r in rows if r['last_archive_message'])
    print(f'{target}')
    print(f'  {len(rows)} groups, {public} public, {len(rows) - public} private')
    print(f'  {scoped} groups holding committee-scoped files')
    print(f'  {alive} groups with a recorded last archive message')
    print(f'  {ruled} groups already carrying a disposition, carried forward')
    print('Nothing is committed. Review the diff and commit in the private repo.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
