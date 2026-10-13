"""Helpers the legacy refresh and the publish step share: the credential-column
test, the export's manifests and pruning, its copied file trees, owner-only
modes, and the scrape-only group field.

Nothing here reads the legacy repository or parses a dump. Each function takes
the directories it works on, so the refresh decides where the export lives and
publish can check an export it did not write.
"""
from __future__ import annotations

import csv
import hashlib
import stat
from pathlib import Path

# Dropped from every table: anything whose column name says it holds a secret.
# The legacy site stores passwords in plaintext, and not only for members — the
# clubs and events modules each carry their own edit password, which a list of
# member-prefixed names missed entirely. Matching on the word rather than on
# known names is what makes a table nobody has looked at yet safe by default,
# which is the property that matters when the webmaster delivers a new module.
#
# Erring towards dropping too much is deliberate. A column dropped by mistake is
# named in the manifest and comes back by re-running with one more argument; a
# credential kept by mistake is in a file that has now held it.
CREDENTIAL_WORDS = ('password', 'passwd', 'session', 'cookie', 'secret',
                    'salt', 'token', 'apikey', 'hash', 'credential')


def is_credential_column(name: str) -> bool:
    # Separators are stripped first, so `api_key` and `ApiKey` are the same name
    # to this check and neither depends on which convention a table happened to
    # use.
    squashed = ''.join(c for c in name.lower() if c.isalnum())
    return any(word in squashed for word in CREDENTIAL_WORDS)


def prune_stale(out_dir: Path, written: list[dict]) -> None:
    """Remove CSVs no longer produced. A table the webmaster has since dropped
    would otherwise leave its file behind, looking as current as the rest of the
    directory. Called once per output directory, after every dump that feeds it,
    because two dumps can share one directory."""
    produced = {w['path'].name for w in written}
    for stale in sorted(out_dir.glob('*.csv')):
        if stale.name not in produced:
            stale.unlink()
            print(f'  {stale.name:32} removed (no longer in the dump)')


def write_manifest(out_dir: Path, written: list[dict], source: Path) -> None:
    lines = ['file\tsha256\tbytes\trows\tdropped_columns']
    for w in sorted(written, key=lambda x: x['table']):
        data = w['path'].read_bytes()
        lines.append('\t'.join([
            w['path'].name,
            hashlib.sha256(data).hexdigest(),
            str(len(data)),
            str(w['rows']),
            ','.join(w['dropped']) or '-',
        ]))
    (out_dir / 'MANIFEST.tsv').write_text('\n'.join(lines) + '\n', encoding='utf-8')


# Material that is not a table and is copied rather than converted. Each entry
# is (source directory or file under the legacy clone, output subdirectory, the
# name a single copied file takes, or None to keep the source's own name). Only
# data is copied: the legacy tree also holds HTML pages saved under SQL-looking
# names and a compiled program from the old moves engine, and neither is data.
# The wiki images matter most: the archive mirror captured 251 of them, so the
# rest exist nowhere else we hold, and they are the images the archive's own
# wiki pages are missing.
FILE_TREES: list[tuple[str, str, str | None]] = [
    ('ifpa/data',                 'governance-prose',  None),
    ('reference/images',          'reference-images',  None),
    ('rules/rulebook.txt',        'source-data-files', None),
    # The @footbag.org forwarding-alias map: each alias against the member
    # address behind it. Member personal data, and the only record of which
    # published addresses are aliases rather than real mailboxes, which the mail
    # cutover turns on. Copied verbatim rather than reshaped, because its format
    # is the legacy mail system's and reshaping it would be a guess; renamed,
    # because the legacy system's scratch-file name says nothing about it.
    ('members/admin/tmp.out',     'mail-aliases',      'mail_aliases.tsv'),
]

# Files the export writes itself in a copied directory, which pruning keeps.
OWN_FILES = {'README.md', 'MANIFEST.tsv'}


def write_copy_manifest(out_dir: Path, files: list[Path]) -> None:
    """The same manifest the converted directories carry, one row per copied
    file, so every file in the export has a checksum to verify against. A row
    count is given for text, as its line count, and left as '-' for binary
    content such as images, where it means nothing. Nothing is withheld from a
    copied file, so the dropped-columns field is always '-'."""
    lines = ['file\tsha256\tbytes\trows\tdropped_columns']
    for path in files:
        data = path.read_bytes()
        rows = '-' if b'\0' in data else str(data.count(b'\n'))
        lines.append('\t'.join([
            path.relative_to(out_dir).as_posix(),
            hashlib.sha256(data).hexdigest(),
            str(len(data)),
            rows,
            '-',
        ]))
    (out_dir / 'MANIFEST.tsv').write_text('\n'.join(lines) + '\n', encoding='utf-8')


def make_owner_only(root: Path) -> None:
    """Every directory under the export to 700 and every file to 600, including
    the ones this run did not rewrite: a byte-identical file is skipped by the
    copy, so the run would otherwise leave an existing open mode as it found it.
    A path this cannot change is left for the check below to report, rather than
    stopping the pass halfway."""
    for path in [root, *root.rglob('*')]:
        if path.is_symlink():
            continue
        try:
            path.chmod(0o700 if path.is_dir() else 0o600)
        except OSError:
            pass


def owner_only_violations(root: Path) -> list[str]:
    """Each path under the export that another account could read, with its mode.
    A symlink is reported too: the export is written as plain files, so a link in
    it is unexpected, and the mode that matters is the target's, which may lie
    outside the export. Checked after the chmod pass rather than trusted to it,
    because some filesystems accept a chmod and keep the old mode."""
    found = []
    for path in [root, *sorted(root.rglob('*'))]:
        mode = path.lstat().st_mode
        if stat.S_ISLNK(mode):
            found.append(f'symlink {path}')
        elif stat.S_IMODE(mode) & 0o077:
            found.append(f'{stat.S_IMODE(mode):04o} {path}')
    return found


def write_scrape_only(export: Path, private: Path) -> int:
    """Preserve the one field the hand scrape holds that no dump does.

    The delivered committees dump and the authenticated scrape agree on almost
    everything: the same 170 groups, the same 1,718 roster pairings. The scrape
    alone recorded, for each group, the date of the most recent message in that
    group's archive. Nothing in any dump carries it, the host that could answer
    the question is being switched off, and it is the only evidence of which
    group discussions were still alive and how recently — which is what the
    disposition rulings and the sealed message corpus turn on.
    """
    source = private / 'private_data/group_settings.csv'
    if not source.is_file():
        print('  group settings scrape not present, skipped')
        return 0
    out_dir = export / 'scrape-only'
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(source, encoding='utf-8', newline='') as fh:
        rows = [r for r in csv.DictReader(fh)
                if (r.get('archive_most_recent_message_date') or '').strip()]
    rows.sort(key=lambda r: int(r['group_id']))
    target = out_dir / 'group_archive_last_message.csv'
    with open(target, 'w', encoding='utf-8', newline='') as fh:
        writer = csv.writer(fh, lineterminator='\n')
        writer.writerow(['group_id', 'CommitteeName', 'CommitteeKeyword',
                         'archive_most_recent_message_date'])
        for r in rows:
            writer.writerow([r['group_id'], r['CommitteeName'],
                             r['CommitteeKeyword'],
                             r['archive_most_recent_message_date']])
    print(f'  group_archive_last_message.csv   {len(rows):6} group(s)')
    return len(rows)
