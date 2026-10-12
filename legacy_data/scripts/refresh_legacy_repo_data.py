#!/usr/bin/env python3
"""Check a legacy footbag.org delivery and write the vetted per-table CSVs.

This is the one program that reads the legacy webmaster's repository. Everything
downstream reads the CSVs it writes, so whatever this script accepts is what the
member load, the clubs merge and the crawl believe. The delivery comes from a
party outside our control, so the script treats it as untrusted. It reads every
file from the delivered commit, never from the working tree, compares that
commit against an untouched copy of the first delivery, and refuses only what
would make the delivery unreadable or unsafe to write. Everything else a
delivery changes is reported for the maintainer to review before anything
downstream reads the CSVs.

Refused, with the reason and nothing written:

- History that does not extend the original copy's (a rewrite), a working tree
  that differs from its own commit, a tracked symbolic link that points outside
  the clone, a submodule, and an added or changed attribute, submodule or
  large-file-storage control file.
- New material a maintainer has not classified: a new module, a new table or a
  new column. A new column is how a renamed password column would arrive, so it
  is held until a maintainer names it with --accept-new after looking at it. An
  acceptance that names nothing new is refused too, because it is a typo or a
  stale flag that would otherwise wave through whatever later matches it.
- Any dump the strict reader cannot read exactly (see strict_dump_parser.py),
  including a compressed dump whose compression is corrupt.
- A row the delivery added or changed that carries insert statement text in a
  value, which is the shape of a row smuggled in through free text. Rows are
  matched to the original's by their values, so a row that only moved is not
  treated as new.
- Two dumps producing one table name into the same output directory.
- A gallery file field that could climb out of the site tree: a parent-directory
  segment or a backslash, checked both as stored and after URL-decoding the
  path. The thumbnail tooling joins these values, URL-decoded, under the
  mirror's site root and writes files there. A leading slash is the site's own
  root-relative form and is accepted.
- A symbolic link inside material that is copied rather than converted, and a
  copied file that would overwrite the export's own README or manifest.
- An --out directory inside either legacy clone, or inside the public checkout
  anywhere but the private checkout reached through it.

Reported, and written as delivered: a dump the original carried that is now
missing, a table that disappeared or emptied, a column that disappeared, copied
material the delivery dropped (pruned from the export), and growth in a dump's
raw control characters, invalid UTF-8 lines or end-of-dump footers against the
original. The previous CSVs survive in the private repository's history.

Credential columns are omitted as rows are written, so a stored password never
reaches a file.

Output: one directory per module under the export (default: the private
checkout's legacy-export), each with its CSVs, a manifest of checksums and a
README; the copied file trees; and REFRESH_MANIFEST.tsv recording both clones'
commits and every source file's checksum, dialect, end-of-dump dates and format
counts beside the original's. Every file ends owner-only. Nothing is committed:
the maintainer reviews the diff in the private repository, where git is the
undo.

Usage:
    refresh_legacy_repo_data.py [--out DIR] [--accept-new MODULE[.TABLE[.COLUMN]] ...]
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import os
import re
import subprocess
import sys
import zlib
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
import strict_dump_parser as sp  # noqa: E402
from extract_legacy_dump import (  # noqa: E402
    is_credential_column, prune_stale, write_manifest)
from extract_legacy_estate import (  # noqa: E402
    FILE_TREES, OWN_FILES, make_owner_only, owner_only_violations,
    write_copy_manifest, write_scrape_only)

REPO_ROOT = Path(__file__).resolve().parents[2]
LIVE = REPO_ROOT / 'footbag_legacy_repo'
ORIGINAL = REPO_ROOT / 'footbag_legacy_repo_original_data'
PRIVATE = REPO_ROOT / 'footbag_private_repo'

# Each source, its output directory and the dialect that wrote it. Ordered
# smallest and least sensitive first. The FAQ dump already carries four lines
# that are not valid UTF-8; that count is its declared tolerance, so a delivery
# that adds more is refused rather than silently replaced.
MODULES: list[tuple[str, str, sp.Dialect]] = [
    ('faq/backups/latest.sql',            'faq',           sp.tolerating(sp.MARIADB, 4)),
    ('poll/backups/latest.sql',           'poll',          sp.MARIADB),
    ('index2/backups/latest.sql',         'index2',        sp.MYSQL4_UTF8),
    ('moves2/backups/latest.sql',         'moves2',        sp.MARIADB),
    ('localize/backups/latest.sql',       'localize',      sp.MARIADB),
    ('actions/backups/latest.sql',        'actions',       sp.MARIADB),
    ('rules/backups/latest.sql',          'rules',         sp.MARIADB),
    ('ranking/backups/latest.sql',        'ranking',       sp.MARIADB),
    ('events/backups/latest.sql',         'events',        sp.MARIADB),
    ('clubs/backups/latest.sql',          'clubs',         sp.MARIADB),
    ('gallery/backups/latest.sql',        'gallery',       sp.MARIADB),
    ('news/backups/latest.sql',           'news',          sp.MARIADB),
    ('groups/backups/committees.sql.gz',  'groups',        sp.MARIADB),
    ('groups/backups/group-files.sql.gz', 'groups',        sp.MARIADB),
    ('ifpa/backups/latest.sql',           'ifpa',          sp.MARIADB),
    ('members/admin/backups/latest.sql',  'members-admin', sp.MARIADB),
    ('members/backups/latest.sql',        'members',       sp.MARIADB),
    ('registration/cron/members.dump',    'members-2015',  sp.MYSQL4_LATIN1),
    ('clubs/clubcontacts.mysql',          'clubs-contacts-fuller', sp.MSQL),
    ('rules/create.sql',                  'rules-older-snapshot',  sp.MYSQL4_LATIN1),
]

# Gallery fields holding a path under the gallery's image directory.
GALLERY_PATH_FIELDS = {
    'sets': ['Directory'],
    'images': ['ImageLocalFile', 'ImageLocalThumbnail'],
    'alt_images': ['AltImageLocalFile'],
}

# Git control files that change how a checkout reads its own content.
CONTROL_FILES = ('.gitattributes', '.gitmodules', '.lfsconfig')

LFS_POINTER = b'version https://git-lfs.github.com/spec/'

# Credential names beyond the shared extractor's list. The short ones are
# matched as whole words of the column name, because as substrings they hit
# ordinary columns (a "pin" inside "Shipping"); the long ones cannot, so they
# are matched anywhere in the name.
CREDENTIAL_WORDS = {'pwd', 'pass', 'pw', 'pin', 'otp', 'totp'}
CREDENTIAL_SUBSTRINGS = ('nonce', 'digest', 'crypt', 'md5', 'authkey', 'privatekey')
_WORD_RE = re.compile(r'[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+')


class Refused(Exception):
    pass


@dataclass
class Source:
    rel: str
    out_name: str
    dialect: sp.Dialect
    raw: bytes
    dump: sp.Dump


def is_withheld(column: str) -> bool:
    """A column whose values never reach a file."""
    if is_credential_column(column):
        return True
    words = {w.lower() for w in _WORD_RE.findall(column)}
    squashed = ''.join(c for c in column.lower() if c.isalnum())
    return bool(words & CREDENTIAL_WORDS) or any(t in squashed for t in CREDENTIAL_SUBSTRINGS)


def git(repo: Path, *args: str) -> str:
    done = subprocess.run(['git', '-C', str(repo), *args], capture_output=True,
                          text=True, check=False)
    if done.returncode != 0:
        raise Refused(f'git {" ".join(args)} failed in {repo.name}: '
                      f'{done.stderr.strip()}')
    return done.stdout


def is_ancestor(repo: Path, older: str, newer: str) -> bool:
    """Exit 0 means an ancestor and 1 means not; anything else is git failing,
    which must not read as either answer. An older commit the repository does
    not hold at all is not its ancestor: that is what a rewrite leaves."""
    present = subprocess.run(['git', '-C', str(repo), 'cat-file', '-e', f'{older}^{{commit}}'],
                             capture_output=True, check=False)
    if present.returncode != 0:
        return False
    done = subprocess.run(['git', '-C', str(repo), 'merge-base', '--is-ancestor',
                           older, newer], capture_output=True, text=True, check=False)
    if done.returncode == 0:
        return True
    if done.returncode == 1:
        return False
    raise Refused(f'git merge-base --is-ancestor failed in {repo.name}: '
                  f'{done.stderr.strip()}')


def tracked_objects(repo: Path, commit: str) -> dict[str, tuple[str, str]]:
    """Each path's mode and object id at the commit, read from git itself so a
    path with unusual characters is never quoted or mangled."""
    done = subprocess.run(['git', '-C', str(repo), 'ls-tree', '-r', '-z', commit],
                          capture_output=True, check=False)
    if done.returncode != 0:
        raise Refused(f'git ls-tree failed in {repo.name}: '
                      f'{done.stderr.decode(errors="replace").strip()}')
    objects = {}
    for entry in done.stdout.split(b'\0'):
        if entry:
            meta, path = entry.split(b'\t', 1)
            mode, _, obj = meta.decode().split()
            objects[path.decode('utf-8', errors='surrogateescape')] = (mode, obj)
    return objects


def blob(repo: Path, obj: str) -> bytes:
    done = subprocess.run(['git', '-C', str(repo), 'cat-file', 'blob', obj],
                          capture_output=True, check=False)
    if done.returncode != 0:
        raise Refused(f'git cat-file failed in {repo.name} for {obj}')
    return done.stdout


@dataclass
class Commit:
    repo: Path
    head: str
    objects: dict[str, tuple[str, str]]


def check_git(live: Path, original: Path) -> tuple[Commit, Commit]:
    """The two vetted commits, after refusing any sign that the delivery is not
    a plain extension of the original's history."""
    original_head = git(original, 'rev-parse', 'HEAD').strip()
    live_head = git(live, 'rev-parse', 'HEAD').strip()
    for repo in (original, live):
        if git(repo, 'status', '--porcelain', '--untracked-files=no').strip():
            raise Refused(f'{repo.name}: the working tree differs from its commit; '
                          'the files read would not be the ones delivered')
    if not is_ancestor(live, original_head, live_head):
        raise Refused(f'the original copy\'s commit {original_head[:12]} is not in '
                      'the live clone\'s history: the delivery rewrote history')
    original_objects = tracked_objects(original, original_head)
    live_objects = tracked_objects(live, live_head)
    root = live.resolve()
    for path, (mode, obj) in live_objects.items():
        name = path.rsplit('/', 1)[-1]
        if name in CONTROL_FILES and original_objects.get(path) != (mode, obj):
            verb = 'changes' if path in original_objects else 'adds'
            raise Refused(f'the delivery {verb} {path}, which changes how the '
                          'checkout reads its own files')
        if mode == '160000':
            raise Refused(f'the delivery carries a submodule at {path}')
        # A link's object is its target, so an unchanged object is an unchanged
        # target. The first delivery already carries one link to a path on the
        # old server; nothing here follows links, and only a new or retargeted
        # one is refused.
        if mode == '120000' and original_objects.get(path) != (mode, obj):
            target = (live / path).resolve()
            if target != root and root not in target.parents:
                raise Refused(f'the tracked link {path} points outside the clone')
    return (Commit(live, live_head, live_objects),
            Commit(original, original_head, original_objects))


def read_sources(commit: Commit, label: str) -> dict[str, Source]:
    """Every module dump the commit carries, read from git once."""
    sources = {}
    for rel, out_name, dialect in MODULES:
        entry = commit.objects.get(rel)
        if entry is None:
            continue
        mode, obj = entry
        if mode == '120000':
            raise Refused(f'{rel} is a symbolic link, not a dump')
        raw = blob(commit.repo, obj)
        if raw.startswith(LFS_POINTER):
            raise Refused(f'{rel} is a large-file-storage pointer, not a dump')
        data = raw
        if rel.endswith('.gz'):
            try:
                data = gzip.decompress(raw)
            except (OSError, EOFError, zlib.error) as err:
                raise Refused(f'{rel}: the compression is corrupt ({err})') from err
        try:
            dump = sp.parse(data, dialect, f'{label}:{rel}')
        except sp.DumpRefused as err:
            raise Refused(str(err)) from err
        sources[rel] = Source(rel, out_name, dialect, raw, dump)
    return sources


def _row_key(table: sp.Table, row: list, columns: list[str]) -> tuple:
    return tuple(row[table.columns.index(c)] if c in table.columns else None
                 for c in columns)


def check_against_original(live: dict[str, Source], original: dict[str, Source],
                           accepted: set[str], report: list[str]) -> None:
    """Refuse unclassified new material and smuggled rows; report losses."""
    used: set[str] = set()

    def held(key: str, what: str) -> None:
        if key in accepted:
            used.add(key)
            return
        raise Refused(f'{what}. New material may carry a credential under a name '
                      f'the filter does not know: inspect it, then re-run with '
                      f'--accept-new {key}')

    for rel in sorted(set(original) - set(live)):
        report.append(f'{rel}: the dump the original carried is missing from this '
                      'delivery; its CSVs are removed from the export')

    for rel, after in live.items():
        module = after.out_name
        before = original.get(rel)
        if before is None:
            held(module, f'{rel} is a module the original did not carry')
        for name, new in after.dump.tables.items():
            old = before.dump.tables.get(name) if before else None
            if before is not None and old is None:
                held(f'{module}.{name}', f'{rel}: table {name} is new')
            if old is not None:
                for c in new.columns:
                    if c not in old.columns:
                        held(f'{module}.{name}.{c}',
                             f'{rel}: table {name} gained column {c}')
            # Insert statement text is allowed only on a row the original
            # carried with the same values in the original's columns; rows are
            # matched as a multiset, so a reordered table is not a changed one.
            known = Counter()
            if old is not None:
                known = Counter(_row_key(old, old.rows[i], old.columns)
                                for i in old.rows_with_insert_text)
            for i in new.rows_with_insert_text:
                key = _row_key(new, new.rows[i], old.columns if old else new.columns)
                if old is not None and known[key] > 0:
                    known[key] -= 1
                    continue
                raise Refused(f'{rel}: table {name} row {i + 1} was added or changed '
                              'and carries insert statement text in a value')
        if before is None:
            continue
        for name, old in before.dump.tables.items():
            new = after.dump.tables.get(name)
            if new is None:
                report.append(f'{rel}: table {name} disappeared ({len(old.rows)} '
                              'rows before); its CSV is removed from the export')
                continue
            if old.rows and not new.rows:
                report.append(f'{rel}: table {name} had {len(old.rows)} rows and now '
                              'has none; its CSV is removed from the export')
            lost = [c for c in old.columns if c not in new.columns]
            if lost:
                report.append(f'{rel}: table {name} lost column(s) {", ".join(lost)}')
        for label, count in (('raw control characters', lambda d: d.raw_control_chars),
                             ('invalid UTF-8 lines', lambda d: d.invalid_utf8_lines),
                             ('end-of-dump footers', lambda d: len(d.footer_dates))):
            if count(after.dump) > count(before.dump):
                report.append(f'{rel}: {label} rose from {count(before.dump)} to '
                              f'{count(after.dump)}')

    unused = sorted(accepted - used)
    if unused:
        raise Refused('--accept-new names material this delivery does not add: '
                      + ', '.join(unused))


def check_output_names(live: dict[str, Source]) -> None:
    seen: dict[tuple[str, str], str] = {}
    for rel, source in live.items():
        for name in source.dump.tables:
            other = seen.get((source.out_name, name))
            if other is not None:
                raise Refused(f'{rel} and {other} both produce table {name} in '
                              f'{source.out_name}; one would overwrite the other')
            seen[(source.out_name, name)] = rel


_ESCAPING = re.compile(r'(^|/)\.\.(/|$)|%2e|%2f|%5c|\\', re.IGNORECASE)


def escapes_site_tree(value: str) -> bool:
    """Checked as stored and as the thumbnail tooling reads it, URL-decoded, so
    neither an encoded segment nor a query or fragment hides a parent step."""
    decoded = unquote(urlparse(value).path)
    return bool(_ESCAPING.search(value) or _ESCAPING.search(decoded))


def check_gallery_paths(sources: dict[str, Source]) -> None:
    for source in sources.values():
        if source.out_name != 'gallery':
            continue
        for table, fields in GALLERY_PATH_FIELDS.items():
            t = source.dump.tables.get(table)
            if t is None:
                continue
            idx = [t.columns.index(f) for f in fields if f in t.columns]
            for n, row in enumerate(t.rows, start=1):
                for i in idx:
                    if escapes_site_tree(row[i] or ''):
                        raise Refused(f'{source.rel}: {table} row {n} field '
                                      f'{t.columns[i]} leaves the gallery directory')


def copied_entries(commit: Commit) -> dict[str, list[tuple[str, str, str]]]:
    """For each copied output directory, (destination, mode, object) for every
    file the commit carries under the copied paths, after refusing links and
    names that would overwrite the export's own files."""
    by_dir: dict[str, list[tuple[str, str, str]]] = {}
    for rel, out_name, rename in FILE_TREES:
        by_dir.setdefault(out_name, [])
        entry = commit.objects.get(rel)
        if entry is not None:
            mode, obj = entry
            if mode == '120000':
                raise Refused(f'{rel} is a symbolic link; copied material is never followed')
            dest = rename or rel.rsplit('/', 1)[-1]
            if dest in OWN_FILES:
                raise Refused(f'{rel} would overwrite the export\'s own {dest}')
            by_dir[out_name].append((dest, mode, obj))
            continue
        prefix = rel + '/'
        for path, (mode, obj) in sorted(commit.objects.items()):
            if not path.startswith(prefix):
                continue
            if mode == '120000':
                raise Refused(f'{path} is a symbolic link inside copied material')
            dest = path[len(prefix):]
            if dest in OWN_FILES:
                raise Refused(f'{path} would overwrite the export\'s own file of that name')
            by_dir[out_name].append((dest, mode, obj))
    return by_dir


def write_tables(out_dir: Path, sources: list[Source]) -> list[dict]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for source in sources:
        for table in source.dump.tables.values():
            if not table.rows:
                continue
            keep = [i for i, c in enumerate(table.columns) if not is_withheld(c)]
            dropped = [c for c in table.columns if is_withheld(c)]
            target = out_dir / f'{table.name}.csv'
            with open(target, 'w', encoding='utf-8', newline='') as fh:
                writer = csv.writer(fh, lineterminator='\n')
                writer.writerow([table.columns[i] for i in keep])
                for values in table.rows:
                    writer.writerow(['' if values[i] is None else values[i] for i in keep])
            written.append({'table': table.name, 'path': target,
                            'rows': len(table.rows), 'dropped': dropped})
    return written


def write_readme(out_dir: Path, written: list[dict], rels: list[str]) -> None:
    """Provenance beside the data. No timestamp, so an unchanged delivery
    rewrites it identically."""
    lines = [f'# {out_dir.name}', '',
             'Written by `legacy_data/scripts/refresh_legacy_repo_data.py` in the public',
             'checkout after the delivery passed its checks. Derived, not authored: re-run',
             'that script after each delivery rather than editing anything here.', '',
             'Source ' + ('dumps' if len(rels) > 1 else 'dump') + ':']
    lines += [f'- `{r}`' for r in rels]
    lines += ['', '| Table | Rows | Columns withheld |', '|---|---:|---|']
    for w in sorted(written, key=lambda x: x['table']):
        withheld = ', '.join(f'`{d}`' for d in w['dropped']) or 'none'
        lines.append(f'| `{w["table"]}` | {w["rows"]} | {withheld} |')
    lines += ['',
              'Withheld columns are stored credentials, omitted as each row is written.',
              'A SQL NULL and an empty string are both written as an empty field.',
              '`MANIFEST.tsv` carries each file\'s sha256, byte count and row count.', '']
    (out_dir / 'README.md').write_text('\n'.join(lines), encoding='utf-8')


def copy_trees(commit: Commit, export: Path, entries: dict[str, list[tuple[str, str, str]]],
               report: list[str]) -> None:
    for out_name, files in entries.items():
        out_dir = export / out_name
        if not files and not out_dir.exists():
            continue
        out_dir.mkdir(parents=True, exist_ok=True)
        expected = set()
        for dest_rel, _, obj in files:
            dest = out_dir / dest_rel
            expected.add(dest)
            dest.parent.mkdir(parents=True, exist_ok=True)
            data = blob(commit.repo, obj)
            if not dest.exists() or dest.read_bytes() != data:
                dest.write_bytes(data)
        for stale in sorted(p for p in out_dir.rglob('*') if p.is_file()):
            if stale not in expected and stale.relative_to(out_dir).as_posix() not in OWN_FILES:
                stale.unlink()
                report.append(f'{out_name}/{stale.relative_to(out_dir).as_posix()}: '
                              'no longer in the delivery; removed from the export')
        write_copy_manifest(out_dir, sorted(expected))
        print(f'  {out_name:24} {len(expected):6} file(s) copied')


def format_counts(dump: sp.Dump | None) -> list[str]:
    if dump is None:
        return ['-', '-', '-']
    return [str(len(dump.footer_dates)), str(dump.raw_control_chars),
            str(dump.invalid_utf8_lines)]


def write_refresh_manifest(export: Path, live: Commit, original: Commit,
                           sources: dict[str, Source],
                           original_sources: dict[str, Source]) -> None:
    lines = [f'original_head\t{original.head}', f'live_head\t{live.head}',
             'source\tsha256\tbytes\tdialect\tdump_completed\tfooters\t'
             'raw_control_chars\tinvalid_utf8_lines\toriginal_footers\t'
             'original_raw_control_chars\toriginal_invalid_utf8_lines']
    for rel, s in sorted(sources.items()):
        before = original_sources.get(rel)
        lines.append('\t'.join([rel, hashlib.sha256(s.raw).hexdigest(), str(len(s.raw)),
                                s.dialect.name, ';'.join(s.dump.footer_dates) or '-',
                                *format_counts(s.dump),
                                *format_counts(before.dump if before else None)]))
    (export / 'REFRESH_MANIFEST.tsv').write_text('\n'.join(lines) + '\n', encoding='utf-8')


def check_out_dir(export: Path) -> None:
    """The export holds member personal data, so it may not land in either
    legacy clone, or in the public checkout outside the private checkout."""
    target = export.resolve()
    for clone in (LIVE, ORIGINAL):
        root = clone.resolve()
        if target == root or root in target.parents:
            raise Refused(f'--out {export} is inside {clone.name}, which is read-only input')
    repo = REPO_ROOT.resolve()
    private = PRIVATE.resolve()
    inside_repo = target == repo or repo in target.parents
    inside_private = target == private or private in target.parents
    if inside_repo and not inside_private:
        raise Refused(f'--out {export} is inside the public checkout; member data '
                      'belongs in the private checkout')


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', type=Path, help='export directory (default: the '
                    'private checkout\'s legacy-export)')
    ap.add_argument('--accept-new', action='append', default=[],
                    metavar='MODULE[.TABLE[.COLUMN]]',
                    help='new material a maintainer has inspected and accepts: a '
                    'module by its output directory, a table, or a column; repeatable')
    args = ap.parse_args()

    for path, what in ((LIVE, 'footbag_legacy_repo (the legacy clone)'),
                       (ORIGINAL, 'footbag_legacy_repo_original_data (the original copy)'),
                       (PRIVATE, 'footbag_private_repo (the private checkout)')):
        if not path.is_dir():
            raise SystemExit(f'{what} is not reachable at {REPO_ROOT}. Wire the '
                             'symlink (scripts/setup_private_repo.sh) and re-run.')
    export = args.out or PRIVATE / 'legacy-export'

    report: list[str] = []
    try:
        check_out_dir(export)
        live_commit, original_commit = check_git(LIVE, ORIGINAL)
        original = read_sources(original_commit, 'original')
        live = read_sources(live_commit, 'live')
        check_against_original(live, original, set(args.accept_new), report)
        check_output_names(live)
        check_gallery_paths(live)
        copied = copied_entries(live_commit)
    except Refused as err:
        print(f'REFUSED: {err}', file=sys.stderr)
        print('Nothing was written.', file=sys.stderr)
        return 1
    print(f'Delivery checks passed: original {original_commit.head[:12]}, '
          f'live {live_commit.head[:12]}.')

    os.umask(0o077)
    export.mkdir(parents=True, exist_ok=True)
    by_dir: dict[str, list[Source]] = {}
    for source in live.values():
        by_dir.setdefault(source.out_name, []).append(source)
    # A directory whose every dump is missing still has its old CSVs pruned, so
    # nothing in the export looks as current as the rest when it is not.
    for rel, source in original.items():
        if rel not in live and (export / source.out_name).is_dir():
            by_dir.setdefault(source.out_name, [])
    total_tables = total_rows = 0
    for out_name, group in by_dir.items():
        out_dir = export / out_name
        written = write_tables(out_dir, group)
        prune_stale(out_dir, written)
        write_manifest(out_dir, written, None)
        rels = [s.rel for s in group] or sorted(
            r for r, s in original.items() if s.out_name == out_name)
        write_readme(out_dir, written, rels)
        total_tables += len(written)
        total_rows += sum(w['rows'] for w in written)
        print(f'  {out_name:24} {len(written):3} table(s) '
              f'{sum(w["rows"] for w in written):8} rows')
    copy_trees(live_commit, export, copied, report)
    write_scrape_only(export, PRIVATE)
    write_refresh_manifest(export, live_commit, original_commit, live, original)
    print(f'{total_tables} tables, {total_rows} rows, under {export}')

    if report:
        print(f'\nReported for review ({len(report)}):')
        for line in report:
            print(f'  REPORT: {line}')

    make_owner_only(export)
    open_paths = owner_only_violations(export)
    if open_paths:
        print('REFUSED: these export paths are still readable by another account:',
              file=sys.stderr)
        for line in open_paths:
            print(f'  {line}', file=sys.stderr)
        return 1
    print('Every export file is owner-only. Nothing is committed: review the diff '
          'in the private repository and commit there.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
