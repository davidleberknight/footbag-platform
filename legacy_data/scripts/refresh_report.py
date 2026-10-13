"""Findings report for a legacy delivery, written beside the vetted CSVs.

The refresh refuses only what it cannot read or write safely; everything else a
delivery changes is accepted as delivered. This module says what those changes
are, so the maintainer reviews a delivery before anything downstream reads it.
A delivery is presumed an honest update; the changes an honest update would not
make are flagged by name: an account row removed, an account whose identity changed under the same id, an
email moved onto an account carrying a tier or an admin flag, an email newly
shared between accounts, a tier code or validity change, lifetime standing
gained or lost, an expiry moved earlier, a row modified after the dump says it
finished, a new account copying an existing account's name and real birth
date (the shape of a duplicate-merge hijack), a new id below the previous
highest, any change to the admin table, and text that could act on a reader
(control, direction-override or zero-width characters, active markup, or a
spreadsheet formula). Renewals, an expiry moving later, are what an honest
delivery carries every time, so they are counted rather than flagged.

Every table is compared with the last accepted delivery: the CSV committed at
HEAD in the repository that holds the export. That is what the maintainer last
reviewed and committed, and reading it from git rather than from the files on
disk means a re-run of the same delivery, before it is committed, reports the
same changes again instead of none. A table with no committed CSV is compared
with the original copy of the first delivery. Only the columns written to CSV
are compared, so a withheld credential column never reaches the report.

Output, deterministic so an unchanged delivery rewrites it identically:
REFRESH_REPORT.md (counts, the flags by kind, the board roster and its CTO check,
the refresh's own report lines) and REFRESH_REPORT_DETAIL.tsv (one line per
changed row and per flag: module, table, key, kind, columns). Rows are named by
key only; no name, email or other value is written.
"""
from __future__ import annotations

import csv
import hashlib
import io
import re
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

# The CTO's legacy account. A Board of Directors roster carrying it is the
# current one; an older delivery's roster predates the CTO seat.
CTO_MEMBER_ID = '11985'
BOARD_COMMITTEE_ID = '1'

IDENTITY_COLUMNS = ('MemberFirstName', 'MemberFirstNameUnicode', 'MemberLastName',
                    'MemberLastNameUnicode', 'MemberBirthYear', 'MemberBirthMonth',
                    'MemberBirthDay')
EMAIL_COLUMNS = ('MemberEmail', 'MemberEmail2', 'MemberEmail3')
EXPIRATION_COLUMNS = ('MemberIFPAExpiration', 'MemberIFPAExpiration2')
LIFETIME = '-1'
MATCH_COLUMNS =('MemberFirstName', 'MemberLastName', 'MemberBirthYear',
                 'MemberBirthMonth', 'MemberBirthDay')

# Built from code points so the source itself carries no invisible character.
_BIDI = ''.join(map(chr, (0x200E, 0x200F, *range(0x202A, 0x202F), *range(0x2066, 0x206A))))
_ZERO_WIDTH = ''.join(map(chr, (0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF)))
CONTENT_CHECKS = (
    ('control character', re.compile('[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')),
    ('direction-override character', re.compile('[' + _BIDI + ']')),
    ('zero-width character', re.compile('[' + _ZERO_WIDTH + ']')),
    ('active markup', re.compile(r'<\s*/?\s*(?:script|iframe|object|embed|svg|style|link|meta)\b'
                                 r'|javascript:|\son[a-z]+\s*=', re.IGNORECASE)),
)
_FORMULA_RE = re.compile(r'[=+\-@]')
_NUMBER_RE = re.compile(r'[-+]?\d+(?:\.\d+)?')


def committed_csv(path: Path) -> list[list[str]] | None:
    """The CSV as committed at HEAD in the repository holding it, or None when
    it is not in a repository or not committed there."""
    anchor = path
    while not anchor.exists():
        anchor = anchor.parent
    top = subprocess.run(['git', '-C', str(anchor if anchor.is_dir() else anchor.parent),
                          'rev-parse', '--show-toplevel'], capture_output=True, text=True)
    if top.returncode != 0:
        return None
    root = Path(top.stdout.strip()).resolve()
    try:
        rel = (anchor.resolve() / path.relative_to(anchor)).relative_to(root).as_posix()
    except ValueError:
        return None
    shown = subprocess.run(['git', '-C', str(root), 'show', f'HEAD:{rel}'],
                           capture_output=True)
    if shown.returncode != 0:
        return None
    return list(csv.reader(io.StringIO(shown.stdout.decode('utf-8'), newline='')))


def load_baselines(export: Path, live: dict, original: dict, kept) -> dict:
    """(module, table) -> (source label, columns, rows, original copy's row
    count), read before any write. `kept` gives a parsed table's written
    columns and their indexes."""
    by_table: dict[tuple[str, str], tuple] = {}
    originals = {(s.out_name, name): t for s in original.values()
                 for name, t in s.dump.tables.items()}
    wanted = set(originals) | {(s.out_name, name) for s in live.values()
                               for name in s.dump.tables}
    for module, name in sorted(wanted):
        t = originals.get((module, name))
        count = len(t.rows) if t is not None else '-'
        rows = committed_csv(export / module / f'{name}.csv')
        if rows:
            by_table[(module, name)] = ('last accepted delivery', rows[0], rows[1:], count)
        elif t is not None:
            cols, idx = kept(t)
            by_table[(module, name)] = (
                'original copy', cols,
                [['' if r[i] is None else r[i] for i in idx] for r in t.rows], count)
        else:
            by_table[(module, name)] = ('none (new table)', [], [], count)
    return by_table


def _as_dicts(columns, rows):
    return [dict(zip(columns, r)) for r in rows]


def _diff(before_cols, before_rows, after_cols, after_rows, key_columns):
    """Added, removed and changed rows as (key, row-before, row-after, columns)."""
    common = [c for c in after_cols if c in before_cols]
    before = _as_dicts(before_cols, before_rows)
    after = _as_dicts(after_cols, after_rows)
    if key_columns and all(k in common for k in key_columns):
        bk = {tuple(r[k] for k in key_columns): r for r in before}
        ak = {tuple(r[k] for k in key_columns): r for r in after}
        added = [('/'.join(k), None, ak[k], []) for k in sorted(set(ak) - set(bk))]
        removed = [('/'.join(k), bk[k], None, []) for k in sorted(set(bk) - set(ak))]
        changed = []
        for k in sorted(set(ak) & set(bk)):
            cols = [c for c in common if ak[k][c] != bk[k][c]]
            if cols:
                changed.append(('/'.join(k), bk[k], ak[k], cols))
        return added, removed, changed
    # A keyless table is compared as a multiset of whole rows; a row is named
    # by a hash of its values, which identifies it without printing it.
    bc = Counter(tuple(r[c] for c in common) for r in before)
    ac = Counter(tuple(r[c] for c in common) for r in after)
    rows_after = {tuple(r[c] for c in common): r for r in after}
    rows_before = {tuple(r[c] for c in common): r for r in before}

    def name(t):
        return 'row:' + hashlib.sha256('\x1f'.join(t).encode()).hexdigest()[:12]
    added = [(name(t), None, rows_after[t], []) for t in sorted(ac - bc) for _ in range((ac - bc)[t])]
    removed = [(name(t), rows_before[t], None, []) for t in sorted(bc - ac) for _ in range((bc - ac)[t])]
    return added, removed, []


def _content_flags(row: dict, columns) -> list[tuple[str, str]]:
    found = []
    for col in columns:
        value = row.get(col) or ''
        for kind, pattern in CONTENT_CHECKS:
            if pattern.search(value):
                found.append((kind, col))
        if _FORMULA_RE.match(value) and not _NUMBER_RE.fullmatch(value):
            found.append(('leading formula character', col))
    return found


def _expiry(row: dict, column: str) -> int:
    """A Unix time, -1 for lifetime, 0 for none; anything unparseable is none."""
    try:
        return int((row.get(column) or '').strip())
    except ValueError:
        return 0


def _tiered(row: dict | None, dump_time: int | None) -> bool:
    """Standing as the member build reads it: the legacy tier code is largely
    abandoned, so standing is Tier 2 ever held, Tier 1 lifetime, or a Tier 1
    annual still live when the dump was taken (any annual, without a dump date)."""
    if not row:
        return False
    if (row.get('MemberIFPATier') or '0') not in ('', '0'):
        return True
    tier1 = _expiry(row, 'MemberIFPAExpiration')
    if _expiry(row, 'MemberIFPAExpiration2') != 0 or tier1 == -1:
        return True
    return tier1 > 0 and (dump_time is None or tier1 > dump_time)


def _emails(rows: list[dict]) -> dict[str, set[str]]:
    holders: dict[str, set[str]] = {}
    for r in rows:
        for col in EMAIL_COLUMNS:
            email = (r.get(col) or '').strip().lower()
            if email:
                holders.setdefault(email, set()).add(r.get('MemberID', ''))
    return holders


def _member_flags(before_cols, before_rows, after_cols, after_rows, added, removed, changed,
                  admin_ids: set[str], footer: str | None
                  ) -> tuple[list[tuple[str, str, str]], int]:
    """The member flags, and how many accounts renewed (an expiry moved later),
    which an honest delivery carries routinely and so is counted, not flagged."""
    # MemberModified and the expirations are Unix times; the footer is the
    # server's local time, so a day's grace covers any time zone.
    dump_time = limit = None
    if footer:
        dump_time = int(datetime.strptime(footer, '%Y-%m-%d %H:%M:%S')
                        .replace(tzinfo=timezone.utc).timestamp())
        limit = dump_time + 86400
    # Legacy deletion was soft, so an honest delivery never drops an account row.
    flags = [(key, 'account removed', '') for key, _, _, _ in removed]
    renewed = set()
    for key, old, new, cols in changed:
        if any(c in IDENTITY_COLUMNS for c in cols):
            flags.append((key, 'identity changed at an existing id',
                          ','.join(c for c in cols if c in IDENTITY_COLUMNS)))
        if any(c in EMAIL_COLUMNS for c in cols) and (
                _tiered(old, dump_time) or _tiered(new, dump_time) or key in admin_ids):
            flags.append((key, 'email changed on an account with a tier or admin flag',
                          ','.join(c for c in cols if c in EMAIL_COLUMNS)))
        if 'MemberIFPATier' in cols:
            flags.append((key, 'tier changed', 'MemberIFPATier'))
        for col in (c for c in EXPIRATION_COLUMNS if c in cols):
            was, now = _expiry(old, col), _expiry(new, col)
            if (was == -1) != (now == -1):
                flags.append((key, 'lifetime standing gained or lost', col))
            elif now < was:
                flags.append((key, 'expiry moved earlier', col))
            else:
                renewed.add(key)
        if 'MemberValid' in cols:
            flags.append((key, 'validity changed', 'MemberValid'))
    for key, _, new, _ in added + changed:
        modified = (new.get('MemberModified') or '').strip()
        if limit is not None and modified.isdigit() and int(modified) > limit:
            flags.append((key, 'modified after the dump completed', 'MemberModified'))
        elif modified and not modified.isdigit():
            flags.append((key, 'modification time is not a timestamp', 'MemberModified'))
    before = _as_dicts(before_cols, before_rows)
    after = _as_dicts(after_cols, after_rows)
    was = _emails(before)
    for email, ids in sorted(_emails(after).items()):
        if len(ids) > 1:
            for member in sorted(ids - was.get(email, set())):
                flags.append((member, 'email newly shared with another account', ''))

    def identity(r):
        return tuple((r.get(c) or '').strip().lower() for c in MATCH_COLUMNS)

    # A third of accounts carry no birth date, and a shared common name alone
    # is not the shape of a hijack, so only a real birth date can match.
    def dated(r):
        return (r.get('MemberBirthYear') or '').strip() not in ('', '0')
    existing = {identity(r) for r in before
                if (r.get('MemberLastName') or '').strip() and dated(r)}
    ids = [int(r['MemberID']) for r in before if (r.get('MemberID') or '').isdigit()]
    highest = max(ids) if ids else None
    for key, _, new, _ in added:
        if identity(new) in existing:
            flags.append((key, 'new account copies an existing name and birth date', ''))
        if highest is not None and key.isdigit() and int(key) < highest:
            flags.append((key, 'new id below the previous highest', 'MemberID'))
    return flags, len(renewed)


def write_report(export: Path, baselines: dict, live: dict, kept,
                 live_head: str, original_head: str, refresh_report: list[str]) -> list[str]:
    """Write both report files; return the summary lines to print."""
    detail: list[tuple[str, str, str, str, str]] = []
    table_lines = []
    flags: list[tuple[str, str, str, str, str]] = []
    tables = {(s.out_name, name): (s, t) for s in live.values() for name, t in s.dump.tables.items()}
    admin_ids = set()
    for (module, name), (_, t) in tables.items():
        if name == 'admins':
            cols, idx = kept(t)
            for r in t.rows:
                row = dict(zip(cols, ('' if r[i] is None else r[i] for i in idx)))
                if row.get('AdminValid') == '1':
                    admin_ids.add(row.get('AdminID', ''))
    changed_tables = renewals = 0
    for (module, name) in sorted(set(baselines) | set(tables)):
        source, b_cols, b_rows, orig = baselines.get((module, name),
                                                     ('none (new table)', [], [], '-'))
        if (module, name) in tables:
            s, t = tables[(module, name)]
            a_cols, idx = kept(t)
            a_rows = [['' if r[i] is None else r[i] for i in idx] for r in t.rows]
            key_columns = t.key_columns
            footer = max(s.dump.footer_dates) if s.dump.footer_dates else None
        else:
            a_cols, a_rows, key_columns, footer = b_cols, [], [], None
        added, removed, changed = _diff(b_cols, b_rows, a_cols, a_rows, key_columns)
        for kind, items in (('added', added), ('removed', removed), ('changed', changed)):
            for key, _, _, cols in items:
                detail.append((module, name, key, kind, ','.join(cols)))
        for key, _, new, cols in added:
            for kind, col in _content_flags(new, a_cols):
                flags.append((module, name, key, kind, col))
        for key, _, new, cols in changed:
            for kind, col in _content_flags(new, cols):
                flags.append((module, name, key, kind, col))
        if name == 'admins':
            for kind, items in (('admin row added', added), ('admin row removed', removed),
                                ('admin row changed', changed)):
                for key, _, _, cols in items:
                    flags.append((module, name, key, kind, ','.join(cols)))
        if name == 'members' and module == 'members':
            member_flags, renewals = _member_flags(b_cols, b_rows, a_cols, a_rows, added,
                                                   removed, changed, admin_ids, footer)
            for key, kind, cols in member_flags:
                flags.append((module, name, key, kind, cols))
        changed_tables += bool(added or removed or changed)
        table_lines.append(f'| {module} | {name} | {source} | {orig} | {len(b_rows)} | '
                           f'{len(a_rows)} | {len(added)} | {len(removed)} | {len(changed)} |')

    board_rows, cto = [], False
    board = tables.get(('groups', 'ifpa_committee_members'))
    if board:
        cols, idx = kept(board[1])
        for r in board[1].rows:
            row = dict(zip(cols, ('' if r[i] is None else r[i] for i in idx)))
            if row.get('CommitteeID') == BOARD_COMMITTEE_ID:
                board_rows.append(row)
                cto = cto or row.get('CommitteeMemberID') == CTO_MEMBER_ID
    board_rows.sort(key=lambda r: (int(r.get('CommitteeMemberPriority') or 0),
                                   int(r.get('CommitteeMemberID') or 0)))

    flags = sorted(set(flags))
    kinds = Counter(f[3] for f in flags)
    lines = ['# Refresh findings report', '',
             'Written by `legacy_data/scripts/refresh_legacy_repo_data.py` beside the CSVs it '
             'wrote. Every table is compared with the CSV committed at HEAD here (the last '
             'accepted delivery), or with the original copy of the first delivery where none '
             'is committed. Rows are named by key only; `REFRESH_REPORT_DETAIL.tsv` lists each.',
             '', f'- Delivery commit: `{live_head}`', f'- Original copy commit: `{original_head}`',
             f'- Tables with changes: {changed_tables} of {len(table_lines)}',
             f'- Flags for review: {len(flags)}',
             f'- Membership renewals (an expiry moved later, not flagged): {renewals}',
             f'- Board of Directors roster carries the CTO record: '
             f'{"PASS" if cto else "FAIL (not current; set board standing by hand after cutover)"}',
             '', '## Flags for review', '']
    lines += ([f'- {kind}: {n}' for kind, n in sorted(kinds.items())] or ['- none'])
    lines += ['', '## Tables', '',
              '| Module | Table | Baseline | Original copy rows | Before | After | Added | Removed | Changed |',
              '|---|---|---|---:|---:|---:|---:|---:|---:|'] + table_lines
    lines += ['', '## Board of Directors roster (committee 1)', '',
              '| Member id | Title | Voting |', '|---:|---|---|']
    lines += [f'| {r.get("CommitteeMemberID", "")} | {r.get("CommitteeMemberTitle", "")} | '
              f'{"yes" if r.get("CommitteeMemberVoting") == "1" else "no"} |' for r in board_rows]
    lines += ['', '## Delivery notes from the refresh', '']
    lines += ([f'- {line}' for line in refresh_report] or ['- none'])
    (export / 'REFRESH_REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')

    out = ['module\ttable\tkey\tkind\tcolumns']
    out += ['\t'.join(d) for d in sorted(detail)]
    out += ['\t'.join((m, t, k, 'flag: ' + kind, c)) for m, t, k, kind, c in flags]
    (export / 'REFRESH_REPORT_DETAIL.tsv').write_text('\n'.join(out) + '\n', encoding='utf-8')
    summary = [f'{len(detail)} row change(s), {len(flags)} flag(s) for review; board CTO check '
               f'{"PASS" if cto else "FAIL"}']
    summary += [f'  {kind}: {n}' for kind, n in sorted(kinds.items())]
    return summary
