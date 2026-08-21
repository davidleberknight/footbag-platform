#!/usr/bin/env python3
"""Derive the IFPA vote tallies from the ballot rows, and reconcile the three
records of the same numbers.

Three sources claim to say how each legacy IFPA vote came out, and they do not
agree. The ballot table is the evidence: one row per member per issue. The
application also stored its own running totals in ten `IssueTally` columns on
each issue, and Julie's authenticated capture of the live site holds a third set,
745 rows of already-aggregated per-option counts. Only the ballots can settle a
disagreement, and only while they are still in hand.

This reads the ballots once, in memory, and writes aggregates. No ballot-level
row is written anywhere by this script: no member id reaches any output file,
which is the bar the vote-disposition ruling sets and the reason the derivation
exists at all.

What it emits, in a directory of its own so that no module extraction's pruning
pass can claim it:

- `ifpa_issue_vote_tallies.csv`, the derived count per issue and answer, with the
  answer text alongside so the numbers can be read without a join.
- `tally_reconciliation.csv`, the derived count beside the application's stored
  tally and beside the capture's count, per cell, with a status naming any
  disagreement rather than resolving it silently.

`VoteIndex` is one-based against the `IssueAnswerN` columns. A ballot carrying
index 0 selected no numbered answer; those are kept as their own row per issue
rather than folded into an answer or dropped, because the stored tallies do not
represent them at all and dropping them would lose the fact that they exist.

Output is a pure function of the inputs: sorted rows, no timestamp, so a re-run
over unchanged input rewrites byte-identical files.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_legacy_dump import (  # noqa: E402
    _INSERT_RE, parse_rows, read_dump, table_columns)

REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY = REPO_ROOT / 'footbag_legacy_repo'
PRIVATE = REPO_ROOT / 'footbag_private_repo'
EXPORT = PRIVATE / 'legacy-export'
OUT_NAME = 'derived-vote-tallies'

DUMP = 'ifpa/backups/latest.sql'
# The capture's per-option counts, the independent third record. Not produced by
# any dump: Julie read them off the rendered result pages while the site was up.
CAPTURE = 'private_data/vote_result_options.csv'

NO_ANSWER = '(no numbered answer)'


def table_rows(sql: str, columns: dict[str, list[str]], table: str) -> list[dict]:
    """Every row of one table, as dicts keyed by column name."""
    cols = columns.get(table)
    if cols is None:
        raise SystemExit(f'{table} is not declared in the dump')
    out: list[dict] = []
    for m in _INSERT_RE.finditer(sql):
        if m.group('name') != table:
            continue
        for values in parse_rows(sql, m.end()):
            if len(values) != len(cols):
                raise SystemExit(
                    f'{table} row has {len(values)} values against {len(cols)} '
                    f'columns; refusing to guess')
            out.append(dict(zip(cols, values)))
    return out


def derive(dump: Path) -> tuple[Counter, dict, dict]:
    """Ballot counts per (issue, answer index), plus the issue and election rows
    the counts are read against."""
    sql = read_dump(dump)
    columns = table_columns(sql)
    counts: Counter = Counter()
    for row in table_rows(sql, columns, 'ifpa_issue_votes'):
        # The member id is read and dropped on the spot. It is never put in a
        # variable that outlives this loop, let alone in a file.
        counts[(row['VoteIssueID'], int(row['VoteIndex']))] += 1
    issues = {r['IssueID']: r for r in table_rows(sql, columns, 'ifpa_issues')}
    elections = {r['ElectionID']: r
                 for r in table_rows(sql, columns, 'ifpa_elections')}
    return counts, issues, elections


def read_capture(private: Path) -> dict:
    """The capture's counts, keyed the way the rendered pages key them: the vote,
    the position voted on, and the option's own text."""
    source = private / CAPTURE
    if not source.is_file():
        return {}
    with open(source, encoding='utf-8', newline='') as fh:
        return {(r['vote_id'], r['position'].strip(), r['option'].strip()):
                int(r['count']) for r in csv.DictReader(fh)}


def answer_text(issue: dict, index: int) -> str:
    if index == 0:
        return NO_ANSWER
    return (issue.get(f'IssueAnswer{index}') or '').strip()


def stored_tally(issue: dict, index: int) -> int | None:
    """The application's own running total for one answer. There is no column for
    index 0, which is the first thing the reconciliation has to say."""
    if index == 0:
        return None
    raw = (issue.get(f'IssueTally{index}') or '').strip()
    return int(raw) if raw else 0


def build_rows(counts: Counter, issues: dict, elections: dict,
               capture: dict) -> tuple[list[dict], list[dict]]:
    # Every cell either source knows about, so a stored tally with no ballots
    # behind it shows up rather than being invisible for want of a ballot row.
    cells = set(counts)
    for issue_id, issue in issues.items():
        for index in range(1, 11):
            if stored_tally(issue, index):
                cells.add((issue_id, index))

    tallies, reconciliation = [], []
    for issue_id, index in sorted(cells, key=lambda c: (int(c[0]), c[1])):
        issue = issues.get(issue_id, {})
        election_id = issue.get('IssueElectionID', '')
        question = (issue.get('IssueQuestion') or '').strip()
        answer = answer_text(issue, index)
        derived = counts.get((issue_id, index), 0)
        stored = stored_tally(issue, index)
        captured = capture.get((election_id, question, answer))

        tallies.append({
            'issue_id': issue_id,
            'election_id': election_id,
            'question': question,
            'answer_index': index,
            'answer_text': answer,
            'derived_votes': derived,
        })

        if index == 0:
            status = 'no numbered answer; no stored tally exists for these'
        elif stored is None:
            status = 'no stored tally'
        elif derived != stored:
            status = f'disagree: ballots {derived}, stored {stored}'
        elif captured is None:
            status = 'agrees with stored; not matched in capture'
        elif captured != derived:
            status = f'agrees with stored; capture says {captured}'
        else:
            status = 'all three agree'

        reconciliation.append({
            'issue_id': issue_id,
            'election_id': election_id,
            'question': question,
            'answer_index': index,
            'answer_text': answer,
            'derived_votes': derived,
            'stored_tally': '' if stored is None else stored,
            'capture_count': '' if captured is None else captured,
            'status': status,
        })
    return tallies, reconciliation


def write_csv(target: Path, rows: list[dict], fields: list[str]) -> None:
    with open(target, 'w', encoding='utf-8', newline='') as fh:
        writer = csv.DictWriter(fh, fieldnames=fields, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)


def write_manifest(out_dir: Path, names: list[str]) -> None:
    lines = ['file\tsha256\tbytes\trows']
    for name in sorted(names):
        data = (out_dir / name).read_bytes()
        lines.append('\t'.join([
            name, hashlib.sha256(data).hexdigest(), str(len(data)),
            str(data.count(b'\n') - 1),
        ]))
    (out_dir / 'MANIFEST.tsv').write_text('\n'.join(lines) + '\n',
                                          encoding='utf-8')


def write_readme(out_dir: Path, disagreements: int, unmatched: int,
                 no_answer_ballots: int, total: int) -> None:
    lines = [
        f'# {out_dir.name}', '',
        'Derived, not authored: produced by',
        '`legacy_data/scripts/derive_vote_tallies.py` in the public checkout,',
        'from the ballot rows in the delivered `ifpa` module dump. Re-run that',
        'script rather than editing anything here.', '',
        'One row per issue and answer, with the count of ballots cast for it.',
        'No ballot-level row is written here: no member id, and nothing that',
        'says how any named person voted.', '',
        '| File | What it holds |',
        '|---|---|',
        '| `ifpa_issue_vote_tallies.csv` | The derived count per issue and '
        'answer, with the answer text alongside |',
        '| `tally_reconciliation.csv` | The same counts beside the '
        "application's own stored tally and the live-site capture's count, "
        'with a status per cell |', '',
        'What the reconciliation found:', '',
        f'- {total} answer cells carry votes.',
        f'- {disagreements} cells where the ballots and the stored tally '
        'disagree. The ballots are the evidence; the stored tallies are a '
        'running total the application maintained.',
        f'- {no_answer_ballots} ballots carry no numbered answer. The stored '
        'tallies have no column for these and do not represent them at all.',
        f'- {unmatched} cells the capture does not cover, which is expected: '
        'the capture was read off the result pages that were still rendered.',
        '',
        'The three sources are kept side by side rather than reconciled into '
        'one number, because which is right is a records question rather than '
        'an arithmetic one.', '',
    ]
    (out_dir / 'README.md').write_text('\n'.join(lines), encoding='utf-8')


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', type=Path, default=None,
                    help='output directory (default: the private export)')
    args = ap.parse_args()

    dump = LEGACY / DUMP
    if not dump.is_file():
        raise SystemExit(
            'The legacy webmaster\'s clone is not reachable. Wire the '
            f'footbag_legacy_repo symlink at {REPO_ROOT} and re-run.')
    out_dir = args.out or (EXPORT / OUT_NAME)
    if args.out is None and not PRIVATE.is_dir():
        raise SystemExit(
            'The private operations checkout is not reachable. Wire the '
            f'footbag_private_repo symlink at {REPO_ROOT} and re-run.')

    counts, issues, elections = derive(dump)
    capture = read_capture(PRIVATE)
    tallies, reconciliation = build_rows(counts, issues, elections, capture)

    out_dir.mkdir(parents=True, exist_ok=True)
    write_csv(out_dir / 'ifpa_issue_vote_tallies.csv', tallies,
              ['issue_id', 'election_id', 'question', 'answer_index',
               'answer_text', 'derived_votes'])
    write_csv(out_dir / 'tally_reconciliation.csv', reconciliation,
              ['issue_id', 'election_id', 'question', 'answer_index',
               'answer_text', 'derived_votes', 'stored_tally', 'capture_count',
               'status'])

    ballots = sum(counts.values())
    no_answer = sum(v for k, v in counts.items() if k[1] == 0)
    disagreements = sum(1 for r in reconciliation
                        if r['status'].startswith('disagree'))
    unmatched = sum(1 for r in reconciliation if r['capture_count'] == ''
                    and r['answer_index'] != 0)
    numbered = sum(1 for r in reconciliation if r['answer_index'] != 0)
    write_readme(out_dir, disagreements, unmatched, no_answer, numbered)
    write_manifest(out_dir, ['ifpa_issue_vote_tallies.csv',
                             'tally_reconciliation.csv'])

    print(f'{dump.name} -> {out_dir}')
    print(f'  {ballots} ballots read, none written')
    print(f'  {numbered} numbered answer cells, {len(tallies)} rows written')
    print(f'  {no_answer} ballots with no numbered answer')
    print(f'  {disagreements} cells where ballots and stored tally disagree')
    print(f'  {unmatched} cells the capture does not cover')
    print('Nothing is committed. Review the diff and commit in the private repo.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
