#!/usr/bin/env python3
"""Turn a legacy `mysqldump` file into one CSV per table, dropping credentials.

The legacy estate arrives as per-module dumps that nobody can read without
parsing SQL by hand, and it lives only on a host that is being switched off.
This converts a dump into ordinary CSVs so the data survives somewhere we
control and a person can open it.

Credential columns never reach the output. They are omitted while the row is
being written, rather than written and cleaned up afterwards, because a file that
once held a password has held it. Any column whose name contains a word for a
secret goes, in every table, so a module nobody has inspected yet is safe by
default; a caller can drop more columns by name.

Two dump generations are handled. The current dumps quote identifiers and
declare UTF-8 bytes; the oldest member snapshot predates both and neither quotes
its column names nor declares an encoding, so its bytes are read as latin-1.

Nothing is inferred about a column that is not in the CREATE TABLE block: a row
whose value count does not match its column count aborts the table rather than
shifting every later field by one, which is the failure that silently corrupts a
whole extract.

Re-runnable by design, because the webmaster keeps updating his repository and
every delivery has to be re-extractable without anyone remembering how. Output
is a pure function of the dump: row order follows the dump, column order follows
the table declaration, and nothing carries a timestamp, so re-running an
unchanged dump rewrites byte-identical files and `git status` stays empty. A
re-run over a dump that has lost a table removes the stale CSV rather than
leaving it to look current forever.

Read-only with respect to the dump. Writes CSVs, and a manifest carrying each
file's sha256, byte count and row count.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import re
import sys
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

_CREATE_RE = re.compile(
    r'CREATE TABLE\s+`?(?P<name>[A-Za-z0-9_]+)`?\s*\((?P<body>.*?)\n\)',
    re.DOTALL | re.IGNORECASE)
_COLUMN_RE = re.compile(r'^\s+`?(?P<col>[A-Za-z0-9_]+)`?\s+[a-z]', re.IGNORECASE)
_INSERT_RE = re.compile(
    r'INSERT INTO\s+`?(?P<name>[A-Za-z0-9_]+)`?\s+VALUES\s*', re.IGNORECASE)


def read_dump(path: Path) -> str:
    raw = gzip.open(path, 'rb').read() if path.suffix == '.gz' else path.read_bytes()
    # The current dumps announce their own encoding; the oldest one predates the
    # convention and is latin-1, which is what its server ran.
    if b'SET NAMES utf8' in raw[:4000]:
        return raw.decode('utf-8', errors='replace')
    return raw.decode('latin-1')


def table_columns(sql: str) -> dict[str, list[str]]:
    """Column names per table, in declaration order."""
    tables: dict[str, list[str]] = {}
    for m in _CREATE_RE.finditer(sql):
        cols = []
        for line in m.group('body').splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith(('PRIMARY', 'UNIQUE', 'KEY',
                                                    'FULLTEXT', 'CONSTRAINT',
                                                    'INDEX')):
                continue
            cm = _COLUMN_RE.match(line)
            if cm:
                cols.append(cm.group('col'))
        tables[m.group('name')] = cols
    return tables


_UNESCAPE = {'0': '\0', 'b': '\b', 'n': '\n', 'r': '\r', 't': '\t',
             'Z': '\x1a', '\\': '\\', "'": "'", '"': '"'}


def parse_rows(text: str, start: int):
    """Yield one list of values per `(...)` tuple, from `start` to the statement's
    terminating semicolon. Values are str, or None for SQL NULL."""
    i, n = start, len(text)
    while i < n:
        while i < n and text[i] in ' \t\r\n,':
            i += 1
        if i >= n or text[i] == ';':
            return
        if text[i] != '(':
            return
        i += 1
        row, field, in_str = [], [], False
        while i < n:
            c = text[i]
            if in_str:
                if c == '\\' and i + 1 < n:
                    field.append(_UNESCAPE.get(text[i + 1], text[i + 1]))
                    i += 2
                    continue
                if c == "'":
                    # A doubled quote inside a string is a literal quote.
                    if i + 1 < n and text[i + 1] == "'":
                        field.append("'")
                        i += 2
                        continue
                    in_str = False
                    i += 1
                    continue
                field.append(c)
                i += 1
                continue
            if c == "'":
                in_str = True
                field.append('\0MARK')  # marks a quoted (non-NULL) empty string
                i += 1
                continue
            if c == ',':
                row.append(_finish(field))
                field = []
                i += 1
                continue
            if c == ')':
                row.append(_finish(field))
                i += 1
                break
            field.append(c)
            i += 1
        yield row


def _finish(field: list[str]) -> str | None:
    joined = ''.join(field)
    if joined.startswith('\0MARK'):
        return joined[len('\0MARK'):]
    bare = joined.strip()
    return None if bare.upper() == 'NULL' else bare


def extract(dump_path: Path, out_dir: Path, extra_drops: set[str]) -> list[dict]:
    sql = read_dump(dump_path)
    columns = table_columns(sql)
    if not columns:
        raise SystemExit(f'No CREATE TABLE found in {dump_path}')
    extra = {d.lower() for d in extra_drops}

    def is_dropped(col: str) -> bool:
        return is_credential_column(col) or col.lower() in extra

    out_dir.mkdir(parents=True, exist_ok=True)

    # A dump splits one table across several INSERT statements, so rows are
    # gathered per table across the whole file before anything is written. The
    # earlier shape, one file per INSERT, silently kept only the last statement.
    by_table: dict[str, list[list[str | None]]] = {}
    for m in _INSERT_RE.finditer(sql):
        table = m.group('name')
        cols = columns.get(table)
        if cols is None:
            raise SystemExit(f'{dump_path.name}: INSERT for unknown table {table}')
        for values in parse_rows(sql, m.end()):
            if len(values) != len(cols):
                raise SystemExit(
                    f'{dump_path.name}: {table} row has {len(values)} values '
                    f'against {len(cols)} columns; refusing to guess')
            by_table.setdefault(table, []).append(values)

    written = []
    for table, rows in by_table.items():
        cols = columns[table]
        keep = [i for i, c in enumerate(cols) if not is_dropped(c)]
        dropped = [c for c in cols if is_dropped(c)]
        target = out_dir / f'{table}.csv'
        with open(target, 'w', encoding='utf-8', newline='') as fh:
            writer = csv.writer(fh, lineterminator='\n')
            writer.writerow([cols[i] for i in keep])
            for values in rows:
                writer.writerow(['' if values[i] is None else values[i] for i in keep])
        written.append({'table': table, 'path': target, 'rows': len(rows),
                        'dropped': dropped})
        note = f' (dropped {", ".join(dropped)})' if dropped else ''
        print(f'  {table:32} {len(rows):7} rows{note}')

    return written


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


def write_readme(out_dir: Path, written: list[dict], sources: list[Path]) -> None:
    """Provenance beside the data: which dump each directory came from, what it
    holds, and what was withheld. Carries no timestamp, so re-running an
    unchanged delivery rewrites it identically."""
    lines = [f'# {out_dir.name}', '',
             'Extracted from the legacy webmaster\'s repository by',
             '`legacy_data/scripts/extract_legacy_estate.py` in the public checkout.',
             'Derived, not authored: re-run that script after each delivery rather than',
             'editing anything here.', '']
    lines.append('Source ' + ('dumps' if len(sources) > 1 else 'dump') + ':')
    for s in sources:
        lines.append(f'- `{s.parent.parent.name}/{s.parent.name}/{s.name}`')
    lines += ['', '| Table | Rows | Columns withheld |', '|---|---:|---|']
    for w in sorted(written, key=lambda x: x['table']):
        withheld = ', '.join(f'`{d}`' for d in w['dropped']) or 'none'
        lines.append(f'| `{w["table"]}` | {w["rows"]} | {withheld} |')
    lines += ['',
              'Withheld columns are stored credentials. They are omitted as each row is',
              'written rather than written and cleaned up afterwards, because a file that',
              'once held a password has held it. `MANIFEST.tsv` carries each file\'s',
              'sha256, byte count and row count.', '']
    (out_dir / 'README.md').write_text('\n'.join(lines), encoding='utf-8')


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('dump', type=Path, help='mysqldump file (.sql or .sql.gz)')
    ap.add_argument('out_dir', type=Path, help='directory to write CSVs into')
    ap.add_argument('--drop', action='append', default=[], metavar='COLUMN',
                    help='additional column name to omit; repeatable')
    args = ap.parse_args()

    if not args.dump.is_file():
        raise SystemExit(f'No such dump: {args.dump}')
    print(f'{args.dump.name} -> {args.out_dir}')
    written = extract(args.dump, args.out_dir, set(args.drop))
    prune_stale(args.out_dir, written)
    write_manifest(args.out_dir, written, args.dump)
    total = sum(w['rows'] for w in written)
    print(f'  {len(written)} table(s), {total} rows, manifest written')
    return 0


if __name__ == '__main__':
    sys.exit(main())
