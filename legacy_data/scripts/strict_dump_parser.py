#!/usr/bin/env python3
"""Strict reader for the legacy footbag.org database dumps.

The webmaster who delivers these dumps is outside our control, so a delivery is
read as untrusted input: every line must be one of the few forms a dump tool
writes, every row must fit the table it claims, and anything else stops the read
with the file, the line and the reason. Nothing is guessed, skipped or repaired.
A delivery that cannot be read exactly is a delivery a human looks at before
anything downstream sees it.

What is refused, and why each matters:

- A line outside the allowlist. Statements: table definitions, row inserts,
  table drops, table locks, key toggles and session settings, each alone on its
  line. Comments: only the banner, host, version, table and footer lines the
  dump tool writes. A trigger, a definer, a grant, an update or a delete is not
  something a backup contains, and a comment of any other shape is a channel a
  looser reader could be fooled through.
- An insert whose form changed: a column list, `INSERT IGNORE`, `REPLACE`, a
  binary or hex literal, or rows spread over several lines. A reader built for
  the positional one-line form would misread such a file and report success.
- A row whose value count differs from its table's column count, a column name
  declared twice, and two rows sharing a value of the table's primary or unique
  key. The server that wrote the dump enforces all three, so an honest dump
  never breaks them.
- An insert that does not start its line: the shape of a row smuggled in through
  free text such as a profile. Insert text inside a string value cannot become a
  row under this reader, and the delivered news table already holds one such
  value (an old item quoting SQL), so it is recorded per row rather than refused.
- An unterminated string or row, a missing end-of-dump footer where the dialect
  writes one, and anything after a footer other than the start of the next
  concatenated dump: each is a truncated or appended file.
- Undecodable text beyond the per-file tolerance declared for that file, because
  a silent replacement character is data lost without anyone being told.

Raw carriage returns, NUL bytes and Ctrl-Z inside string values are counted: the
dump tool always escapes them, so the count of raw ones is a format fingerprint
to compare across deliveries.

Four dump dialects exist in the legacy estate, and each file is read under the
one that wrote it: the current MariaDB dumps (UTF-8, quoted names, a footer), the
older MySQL 4 dumps in UTF-8 and in latin-1 (no footer), and one mSQL dump whose
statements end with a backslash-g rather than a semicolon.

A SQL NULL is returned as None and every other value as text exactly as the dump
stores it after unescaping.
"""
from __future__ import annotations

import gzip
import re
from dataclasses import dataclass, field, replace
from pathlib import Path


@dataclass(frozen=True)
class Dialect:
    name: str
    encoding: str
    footer_required: bool
    terminator: str
    # Lines that may fail to decode as UTF-8 before the read is refused. Zero
    # except where a delivered file is already known to be mixed, so growth in
    # that count is itself a finding.
    invalid_utf8_lines_allowed: int = 0


MARIADB = Dialect('mariadb', 'utf-8', True, ';')
MYSQL4_UTF8 = Dialect('mysql4-utf8', 'utf-8', False, ';')
# The server that wrote these snapshots called its charset latin1, but MySQL's
# and MariaDB's latin1 is Windows-1252, so curly quotes and dashes in the
# 0x80-0x9F range are the Windows characters, not control codes.
MYSQL4_LATIN1 = Dialect('mysql4-latin1', 'mariadb-latin1', False, ';')
MSQL = Dialect('msql', 'latin-1', False, '\\g')


def _mariadb_latin1_table() -> dict[int, str]:
    """Byte to character for MariaDB's latin1: Windows-1252, with the five bytes
    Windows-1252 leaves undefined kept as the control characters of the same
    value, which is what the server returns for them."""
    table = {}
    for b in range(0x80, 0xA0):
        try:
            table[b] = bytes([b]).decode('cp1252')
        except UnicodeDecodeError:
            table[b] = chr(b)
    return table


_MARIADB_LATIN1 = _mariadb_latin1_table()


def tolerating(dialect: Dialect, invalid_utf8_lines: int) -> Dialect:
    return replace(dialect, invalid_utf8_lines_allowed=invalid_utf8_lines)


class DumpRefused(Exception):
    """A dump that cannot be read exactly. The message names the file, the line
    and the reason, and never quotes row content."""

    def __init__(self, source: str, line: int, reason: str):
        super().__init__(f'{source}: line {line}: {reason}')
        self.source = source
        self.line = line
        self.reason = reason


@dataclass
class Table:
    name: str
    columns: list[str]
    # The primary key's columns, or the first unique key's when there is no
    # primary key; empty for a table with neither.
    key_columns: list[str] = field(default_factory=list)
    rows: list[list[str | None]] = field(default_factory=list)
    # Indexes into rows of each row holding insert statement text in a value.
    rows_with_insert_text: list[int] = field(default_factory=list)


@dataclass
class Dump:
    tables: dict[str, Table]
    footer_dates: list[str]
    server_versions: list[str]
    invalid_utf8_lines: int
    raw_control_chars: int


_ESCAPES = {'0': '\0', 'b': '\b', 'n': '\n', 'r': '\r', 't': '\t',
            'Z': '\x1a', '\\': '\\', "'": "'", '"': '"'}
_RAW_CONTROLS = frozenset('\r\0\x1a')

_NAME = r'`?([A-Za-z0-9_]+)`?'
_CONDITIONAL_RE = re.compile(
    r'/\*!\d{5} (?:SET (?:(?!\*/)[^;])*|ALTER TABLE ' + _NAME +
    r' (?:DISABLE|ENABLE) KEYS) \*/;$')
_LOCK_RE = re.compile(r'LOCK TABLES ' + _NAME + r' WRITE;$')
_CREATE_RE = re.compile(r'CREATE TABLE ' + _NAME + r' \($', re.IGNORECASE)
_COLUMN_RE = re.compile(r'^\s+(?:`([A-Za-z0-9_]+)`|([A-Za-z0-9_]+))\s+[a-z]',
                        re.IGNORECASE)
# Table options on a definition's closing line, as each dialect writes them.
_TABLE_OPTION = r'(?:(?:ENGINE|TYPE|AUTO_INCREMENT|DEFAULT CHARSET|CHARSET|COLLATE|PACK_KEYS)=[A-Za-z0-9_]+)'
_KEY_RE = re.compile(r'\s+(PRIMARY KEY|UNIQUE KEY)(?: ' + _NAME + r')? \(([^)]*)\),?$')
_KEY_PREFIXES = ('PRIMARY KEY', 'UNIQUE KEY', 'KEY ', 'FULLTEXT KEY')
_INSERT_RE = re.compile(r'INSERT INTO ' + _NAME + r' +VALUES *')
_INSERT_MARKER_RE = re.compile(r'INSERT\s+INTO', re.IGNORECASE)
_NUMBER_RE = re.compile(r'-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?')
_FOOTER_RE = re.compile(r'-- Dump completed on (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})$')
_SERVER_RE = re.compile(r'-- Server version\t(\S.*)$')
_HEADER_RE = re.compile(r'-- MySQL dump [0-9.]+(?:  Distrib [^\n]+)?$')
_COMMENT_RES = [re.compile(p) for p in (
    r'--$', r'-- -{20,}$', r'-- Host: \S+ +Database: \w+$',
    r'-- Table structure for table `\w+`$', r'-- Dumping data for table `\w+`$')]
_MSQL_COMMENT_RES = [re.compile(p) for p in (
    r'#$', r'#-{20,}$', r'# mSQL Dump  \(requires mSQL [0-9.]+ Beta \d+ or newer\)$',
    r'# Host: \S+ +Database: \w+$', r"# Table structure for table '\w+'$",
    r"# Dumping data for table '\w+'$")]


def read_bytes(path: Path) -> bytes:
    return gzip.open(path, 'rb').read() if path.suffix == '.gz' else path.read_bytes()


def decode(raw: bytes, dialect: Dialect, source: str) -> tuple[str, int]:
    """The dump's text and the number of lines that did not decode."""
    if dialect.encoding == 'latin-1':
        return raw.decode('latin-1'), 0
    if dialect.encoding == 'mariadb-latin1':
        return raw.decode('latin-1').translate(_MARIADB_LATIN1), 0
    try:
        return raw.decode('utf-8'), 0
    except UnicodeDecodeError:
        pass
    bad = []
    for number, line in enumerate(raw.split(b'\n'), start=1):
        try:
            line.decode('utf-8')
        except UnicodeDecodeError:
            bad.append(number)
    if len(bad) > dialect.invalid_utf8_lines_allowed:
        raise DumpRefused(
            source, bad[0],
            f'{len(bad)} line(s) are not valid UTF-8, more than the '
            f'{dialect.invalid_utf8_lines_allowed} this file is declared to carry')
    return raw.decode('utf-8', errors='replace'), len(bad)


def parse(raw: bytes, dialect: Dialect, source: str) -> Dump:
    text, invalid = decode(raw, dialect, source)
    return _Parser(text, dialect, source).run(invalid)


def parse_file(path: Path, dialect: Dialect, source: str | None = None) -> Dump:
    return parse(read_bytes(path), dialect, source or path.name)


class _Parser:
    def __init__(self, text: str, dialect: Dialect, source: str):
        self.text = text
        self.n = len(text)
        self.dialect = dialect
        self.source = source
        self.pos = 0
        self.line = 1
        self.tables: dict[str, Table] = {}
        self.footers: list[str] = []
        self.versions: list[str] = []
        self.raw_controls = 0
        # Set by a footer: the next line must be blank or begin the next dump.
        self.after_footer = False

    def refuse(self, reason: str, line: int | None = None):
        raise DumpRefused(self.source, line or self.line, reason)

    def next_line(self) -> str:
        eol = self.text.find('\n', self.pos)
        if eol == -1:
            eol = self.n
        line = self.text[self.pos:eol]
        self.pos = eol + 1
        self.line += 1
        return line

    def run(self, invalid_utf8_lines: int) -> Dump:
        term = self.dialect.terminator
        while self.pos < self.n:
            start_line = self.line
            if self.text.startswith('INSERT INTO', self.pos):
                self.not_after_footer(start_line)
                self.insert()
                continue
            line = self.next_line()
            if not line.strip():
                continue
            if _HEADER_RE.match(line):
                self.after_footer = False
                continue
            self.not_after_footer(start_line)
            if line.startswith('--'):
                self.comment(line, start_line)
                continue
            if self.dialect.name == 'msql' and line.startswith('#'):
                if not any(r.match(line) for r in _MSQL_COMMENT_RES):
                    self.refuse('comment line of a form the dump tool does not write',
                                start_line)
                continue
            if line.startswith('/*!'):
                if not _CONDITIONAL_RE.match(line):
                    self.refuse('conditional comment outside the allowlist '
                                '(only session settings and key toggles)', start_line)
                continue
            if _LOCK_RE.match(line) or line == 'UNLOCK TABLES;':
                continue
            if re.match(r'(?i)drop table (?:if exists )?' + _NAME + re.escape(term) + '$', line):
                continue
            create = _CREATE_RE.match(line)
            if create:
                self.create_table(create.group(1), start_line)
                continue
            if self.dialect.name == 'msql' and re.match(r'CREATE {1,3}INDEX \w+ ON \w+ \($', line):
                self.skip_index(start_line)
                continue
            self.refuse(self.describe_statement(line.strip()), start_line)
        if self.dialect.footer_required and not self.footers:
            self.refuse('the end-of-dump footer is missing: the file is truncated '
                        'or was not written by the dump tool')
        self.check_keys()
        return Dump(self.tables, self.footers, self.versions, invalid_utf8_lines,
                    self.raw_controls)

    def not_after_footer(self, line: int):
        if self.after_footer:
            self.refuse('content follows an end-of-dump footer without the start '
                        'of a new dump', line)

    def comment(self, line: str, start_line: int):
        footer = _FOOTER_RE.match(line)
        if footer:
            self.footers.append(footer.group(1))
            self.after_footer = True
            return
        version = _SERVER_RE.match(line)
        if version:
            self.versions.append(version.group(1))
            return
        if not any(r.match(line) for r in _COMMENT_RES):
            self.refuse('comment line of a form the dump tool does not write', start_line)

    @staticmethod
    def describe_statement(stripped: str) -> str:
        upper = stripped.upper()
        for form in ('INSERT IGNORE', 'REPLACE', 'UPDATE', 'DELETE', 'GRANT', 'USE ',
                     'CREATE DATABASE', 'CREATE TRIGGER', 'DELIMITER', 'LOAD DATA',
                     'SOURCE', 'ALTER', 'CREATE'):
            if upper.startswith(form):
                return f'statement form outside the allowlist: {form.strip()}'
        if 'INSERT INTO' in upper:
            return 'insert statement does not start its line'
        return 'statement form outside the allowlist'

    def skip_index(self, start_line: int):
        column = self.next_line()
        closing = self.next_line()
        if not re.match(r'\t\w+$', column) or closing != ') \\g':
            self.refuse('index definition of a form the dump tool does not write',
                        start_line)

    def create_table(self, name: str, start_line: int):
        if name in self.tables:
            self.refuse(f'table {name} is defined twice', start_line)
        closing = re.compile(r'\)(?: ' + _TABLE_OPTION + r')*' +
                             (r' \\g' if self.dialect.name == 'msql' else ';') + '$')
        columns: list[str] = []
        primary: list[str] = []
        unique: list[str] = []
        while self.pos < self.n:
            body_line = self.line
            line = self.next_line()
            stripped = line.strip()
            if line.startswith(')'):
                if not closing.match(line):
                    self.refuse(f'table {name}: definition does not end with its '
                                'terminator and table options alone', body_line)
                if not columns:
                    self.refuse(f'table {name} declares no columns', start_line)
                self.tables[name] = Table(name, columns, primary or unique)
                return
            if not stripped:
                continue
            if stripped.startswith(_KEY_PREFIXES):
                key = _KEY_RE.match(line)
                if key:
                    cols = [c.strip().strip('`') for c in key.group(3).split(',')]
                    if any(c not in columns for c in cols):
                        self.refuse(f'table {name}: a key names an undeclared column',
                                    body_line)
                    if key.group(1) == 'PRIMARY KEY':
                        primary = cols
                    elif not unique:
                        unique = cols
                continue
            column = _COLUMN_RE.match(line)
            if not column:
                self.refuse(f'table {name}: a definition line is neither a column '
                            'nor a key', body_line)
            col = column.group(1) or column.group(2)
            if col in columns:
                self.refuse(f'table {name} declares column {col} twice', body_line)
            columns.append(col)
        self.refuse(f'table {name}: definition runs to the end of the file',
                    start_line)

    def check_keys(self):
        for table in self.tables.values():
            if not table.key_columns:
                continue
            idx = [table.columns.index(c) for c in table.key_columns]
            seen = set()
            for row in table.rows:
                key = tuple(row[i] for i in idx)
                if None in key:
                    continue
                if key in seen:
                    self.refuse(f'{table.name}: two rows share one value of the '
                                f'key ({", ".join(table.key_columns)})', 1)
                seen.add(key)

    def insert(self):
        start_line = self.line
        m = _INSERT_RE.match(self.text, self.pos)
        if not m:
            ahead = self.text[self.pos:self.pos + 200]
            if re.match(r'INSERT INTO ' + _NAME + r'\s*\(', ahead):
                self.refuse('column-list insert: the positional form is the only '
                            'one this reader accepts')
            self.refuse('insert statement form outside the allowlist')
        table = self.tables.get(m.group(1))
        if table is None:
            self.refuse(f'insert into {m.group(1)}, which no definition precedes')
        self.pos = m.end()
        width = len(table.columns)
        term = self.dialect.terminator
        while True:
            self.skip_spaces()
            if not self.text.startswith('(', self.pos):
                self.refuse(f'{table.name}: expected a row', start_line)
            self.pos += 1
            row, marked = self.row(table.name, start_line)
            if marked:
                table.rows_with_insert_text.append(len(table.rows))
            if len(row) != width:
                self.refuse(f'{table.name}: a row has {len(row)} values against '
                            f'{width} columns', start_line)
            table.rows.append(row)
            self.skip_spaces()
            if self.text.startswith(',', self.pos):
                self.pos += 1
                continue
            if self.text.startswith(term, self.pos):
                self.pos += len(term)
                break
            self.refuse(f'{table.name}: unexpected text after a row', start_line)
        rest = self.text.find('\n', self.pos)
        rest = self.n if rest == -1 else rest
        if self.text[self.pos:rest].strip():
            self.refuse(f'{table.name}: text follows the insert on its line', start_line)
        self.pos = rest + 1
        self.line += 1

    def skip_spaces(self):
        while self.pos < self.n and self.text[self.pos] == ' ':
            self.pos += 1

    def row(self, table: str, start_line: int) -> tuple[list[str | None], bool]:
        values: list[str | None] = []
        marked = False
        while True:
            self.skip_spaces()
            if self.pos >= self.n:
                self.refuse(f'{table}: row is unterminated at the end of the file',
                            start_line)
            if self.text[self.pos] == "'":
                value = self.string(table, start_line)
                marked = marked or bool(_INSERT_MARKER_RE.search(value))
                values.append(value)
            else:
                values.append(self.bare(table, start_line))
            self.skip_spaces()
            if self.pos >= self.n:
                self.refuse(f'{table}: row is unterminated at the end of the file',
                            start_line)
            c = self.text[self.pos]
            self.pos += 1
            if c == ')':
                return values, marked
            if c != ',':
                self.refuse(f'{table}: unexpected character between values', start_line)

    def string(self, table: str, start_line: int) -> str:
        self.pos += 1
        out = []
        text, n = self.text, self.n
        while self.pos < n:
            c = text[self.pos]
            if c == '\\':
                if self.pos + 1 >= n:
                    break
                nxt = text[self.pos + 1]
                if nxt not in _ESCAPES:
                    self.refuse(f'{table}: escape sequence outside the dump tool\'s '
                                'set', start_line)
                out.append(_ESCAPES[nxt])
                self.pos += 2
                continue
            if c == "'":
                if text.startswith("''", self.pos):
                    out.append("'")
                    self.pos += 2
                    continue
                self.pos += 1
                return ''.join(out)
            if c == '\n':
                self.refuse(f'{table}: a raw line break inside a string value',
                            start_line)
            if c in _RAW_CONTROLS:
                self.raw_controls += 1
            out.append(c)
            self.pos += 1
        self.refuse(f'{table}: string is unterminated at the end of the file',
                    start_line)

    def bare(self, table: str, start_line: int) -> str | None:
        if self.text.startswith('NULL', self.pos):
            self.pos += 4
            return None
        m = _NUMBER_RE.match(self.text, self.pos)
        if not m:
            self.refuse(f'{table}: value form outside the allowlist (only quoted '
                        'text, numbers and NULL)', start_line)
        self.pos = m.end()
        return m.group(0)
