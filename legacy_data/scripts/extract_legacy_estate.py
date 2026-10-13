#!/usr/bin/env python3
"""Extract the whole delivered legacy estate into the private operations repo.

Retired: superseded as the export producer by refresh_legacy_repo_data.py, the
only reader of the legacy repository. The helpers both used live in
refresh_support.py. Kept as the record of how the first export was made;
nothing runs it.

One command, run again after every delivery. The legacy site is being switched
off and its data currently exists only in the webmaster's repository and in
clones of it; this is what puts a copy under our own control, as CSVs a person
can open rather than SQL nobody can read.

Re-run it whenever the webmaster pushes new backups. It is idempotent: an
unchanged dump produces byte-identical CSVs, so a re-run over unchanged input
leaves the private repository's working tree clean, and the only files that
change are the ones whose source changed. Tables that disappear from a dump have
their CSVs removed rather than left behind looking current.

Everything it writes is owner-only: the export holds member personal data, so
every file ends a run at mode 600 and every directory at 700, files left
unchanged by this run included. Git does not record those modes, so a checkout
of the private repository does not carry them; a run of this script is what puts
the working export back into that state, and a run that cannot exits non-zero
naming each path, which is what keeps it from certifying the final export.

What never lands anywhere: the stored password, the live session handle and the
update cookie, dropped from every table. The oldest member snapshot drops more,
because it carries street addresses and phone numbers that the current member
table no longer has, for people who have moved house since; the historical
membership record is what has value there, not stale contact details. The
full-fidelity original stays in the webmaster's repository if it is ever needed.

Both repositories are reached through the canonical symlinks at the public
checkout's root, so this works on any maintainer's machine with the standard
layout and nowhere else, which is deliberate.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_legacy_dump import extract, write_readme  # noqa: E402
from refresh_support import (  # noqa: E402
    FILE_TREES, OWN_FILES, make_owner_only, owner_only_violations, prune_stale,
    write_copy_manifest, write_manifest, write_scrape_only)

REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY = REPO_ROOT / 'footbag_legacy_repo'
PRIVATE = REPO_ROOT / 'footbag_private_repo'
EXPORT = PRIVATE / 'legacy-export'

# The oldest member snapshot predates the current schema and carries contact
# detail the live table dropped years ago. Address and phone go with the
# credentials; what remains is the historical membership record.
# Ruled: the older snapshot keeps its street addresses and phone numbers. They
# are the membership record as it stood, the private repository is
# access-controlled, and an address a member has since left is still the fact
# the record states. Only credentials come out, as everywhere else.
OLD_SNAPSHOT_DROPS: list[str] = []

# Ordered smallest and least sensitive first, so a bad delivery shows itself on a
# cheap table rather than halfway through the member export.
MODULES: list[tuple[str, str, list[str]]] = [
    ('faq/backups/latest.sql',            'faq',            []),
    ('poll/backups/latest.sql',           'poll',           []),
    ('index2/backups/latest.sql',         'index2',         []),
    ('moves2/backups/latest.sql',         'moves2',         []),
    ('localize/backups/latest.sql',       'localize',       []),
    ('actions/backups/latest.sql',        'actions',        []),
    ('rules/backups/latest.sql',          'rules',          []),
    ('ranking/backups/latest.sql',        'ranking',        []),
    ('events/backups/latest.sql',         'events',         []),
    ('clubs/backups/latest.sql',          'clubs',          []),
    ('gallery/backups/latest.sql',        'gallery',        []),
    ('news/backups/latest.sql',           'news',           []),
    ('groups/backups/committees.sql.gz',  'groups',         []),
    ('groups/backups/group-files.sql.gz', 'groups',         []),
    ('ifpa/backups/latest.sql',           'ifpa',           []),
    ('members/admin/backups/latest.sql',  'members-admin',  []),
    ('members/backups/latest.sql',        'members',        []),
    ('registration/cron/members.dump',    'members-2015',   OLD_SNAPSHOT_DROPS),
    # Two dumps that sit outside the backups convention and would be missed by a
    # list built from that convention alone. The club-contacts one is not a
    # duplicate: it holds 2,049 rows against the delivered dump's 1,400, so 649
    # club contacts exist only here. The rulebook one is an older snapshot with
    # 52 rows fewer than the delivered dump, kept because "older" is not the same
    # as "a subset" and nobody has checked which rows differ.
    ('clubs/clubcontacts.mysql',          'clubs-contacts-fuller', []),
    ('rules/create.sql',                  'rules-older-snapshot',  []),
]


def copy_tree(sources: list[tuple[Path, str | None]], out_dir: Path) -> int:
    """Copy files or directories into one output directory, overwriting only what
    differs, removing what no source has any more, and writing the directory's
    manifest. Byte-compare rather than timestamp, so a re-run over unchanged
    input leaves the working tree clean. Takes every source for the directory at
    once, because pruning after each one separately would delete the previous
    source's files."""
    out_dir.mkdir(parents=True, exist_ok=True)
    copied = 0
    expected = set()
    for source, rename in sources:
        files = [source] if source.is_file() else sorted(
            p for p in source.rglob('*') if p.is_file())
        for src in files:
            if source.is_file():
                rel = rename or src.name
            else:
                rel = str(src.relative_to(source))
            if rel in OWN_FILES:
                raise SystemExit(
                    f'{src} would overwrite the export\'s own {rel} in '
                    f'{out_dir.name}; rename it in FILE_TREES and re-run.')
            dest = out_dir / rel
            expected.add(dest)
            dest.parent.mkdir(parents=True, exist_ok=True)
            data = src.read_bytes()
            if not dest.exists() or dest.read_bytes() != data:
                dest.write_bytes(data)
                copied += 1
    for stale in sorted(p for p in out_dir.rglob('*') if p.is_file()):
        if stale not in expected and stale.relative_to(out_dir).as_posix() not in OWN_FILES:
            stale.unlink()
            print(f'  {stale.name:32} removed (no longer in the source)')
    write_copy_manifest(out_dir, sorted(expected))
    return copied


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--only', metavar='MODULE',
                    help='extract just one output directory name')
    args = ap.parse_args()

    if not LEGACY.is_dir():
        raise SystemExit(
            'The legacy webmaster\'s clone is not reachable. Wire the '
            f'footbag_legacy_repo symlink at {REPO_ROOT} and re-run.')
    if not PRIVATE.is_dir():
        raise SystemExit(
            'The private operations checkout is not reachable. Wire the '
            f'footbag_private_repo symlink at {REPO_ROOT} and re-run.')

    # Before the first byte is written, so no export file is ever created
    # readable by another account, whatever umask the operator's shell carries.
    os.umask(0o077)

    # Two dumps feed the groups directory, so extraction is grouped by output
    # directory: every source for a directory runs before that directory is
    # pruned and its manifest written, or the second dump would delete the
    # first's files and overwrite its manifest.
    by_dir: dict[str, list[tuple[Path, list[str]]]] = {}
    for rel, out_name, drops in MODULES:
        if args.only and args.only != out_name:
            continue
        by_dir.setdefault(out_name, []).append((LEGACY / rel, drops))

    total_tables = total_rows = 0
    for out_name, sources in by_dir.items():
        out_dir = EXPORT / out_name
        written: list[dict] = []
        for source, drops in sources:
            if not source.is_file():
                print(f'{source.name}: not delivered yet, skipped')
                continue
            written.extend(extract(source, out_dir, set(drops)))
        if not written:
            continue
        prune_stale(out_dir, written)
        write_manifest(out_dir, written, sources[0][0])
        write_readme(out_dir, written, [s for s, _ in sources if s.is_file()])
        total_tables += len(written)
        total_rows += sum(w['rows'] for w in written)

    if not args.only:
        print('\nfiles copied rather than converted:')
        files_by_dir: dict[str, list[tuple[Path, str | None]]] = {}
        for rel, out_name, rename in FILE_TREES:
            source = LEGACY / rel
            if not source.exists():
                print(f'  {rel}: not present, skipped')
                continue
            files_by_dir.setdefault(out_name, []).append((source, rename))
        for out_name, sources in files_by_dir.items():
            changed = copy_tree(sources, EXPORT / out_name)
            held = sum(1 for p in (EXPORT / out_name).rglob('*')
                       if p.is_file()
                       and p.relative_to(EXPORT / out_name).as_posix() not in OWN_FILES)
            print(f'  {out_name:24} {held:6} file(s), {changed} written this run')

    if not args.only:
        print('\nfields no dump contains:')
        write_scrape_only(EXPORT, PRIVATE)

    print(f'\n{total_tables} tables, {total_rows} rows, under {EXPORT}')

    # The whole export, not only what this run wrote: a checkout or an earlier
    # run may have left it open, and an unchanged file is never rewritten.
    if EXPORT.is_dir():
        make_owner_only(EXPORT)
        open_paths = owner_only_violations(EXPORT)
        if open_paths:
            print('\nREFUSED: these export paths are still readable by another '
                  'account after the owner-only pass:', file=sys.stderr)
            for line in open_paths:
                print(f'  {line}', file=sys.stderr)
            print('The export is not certified. Move it to a filesystem that '
                  'keeps file modes, or fix each path, and re-run.', file=sys.stderr)
            return 1
        print('Every export file is owner-only (600; directories 700).')

    print('Nothing is committed. Review the diff and commit in the private repo.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
