#!/usr/bin/env python3
"""Shared mysqldump parsing and dump-root resolution for the legacy-site dump.

The legacy footbag.org export is a set of per-app MariaDB mysqldump files
(`<app>/backups/latest.sql`) using positional extended INSERTs
(`INSERT INTO <table> VALUES (...),(...)` with no column list), so values map
to columns by the `CREATE TABLE` column order. This module is the one home for
that parsing; every dump-reading script imports it rather than carrying its own
copy, so quoting, escape, and NULL handling cannot drift between extractors.

The dump itself holds clear-text credentials and personal data and lives only
on maintainer machines, outside this repository. Its location is never
committed: `resolve_dump_root()` reads the `FOOTBAG_LEGACY_DUMP_ROOT`
environment variable, falling back to the git-ignored `footbag.org` symlink at
the repository root when present, and returns None when neither exists (the
correct state for CI and for a fresh clone, where dump-driven steps skip).
"""
from __future__ import annotations

import os
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

DUMP_ROOT_ENV_VAR = "FOOTBAG_LEGACY_DUMP_ROOT"

_ESCAPES = {"0": "\0", "b": "\b", "n": "\n", "r": "\r", "t": "\t",
            "Z": "\x1a", "\\": "\\", "'": "'", '"': '"'}


def parse_create_columns(sql: str, table: str) -> list[str]:
    """Ordered column names from `CREATE TABLE <table> (...)`."""
    m = re.search(
        r"CREATE TABLE `" + re.escape(table) + r"` \((.*?)\n\) ENGINE", sql, re.S)
    if not m:
        raise SystemExit(f"error: `CREATE TABLE {table}` not found in dump")
    cols = []
    for line in m.group(1).splitlines():
        cm = re.match(r"\s*`([A-Za-z0-9_]+)`\s", line)
        if cm:
            cols.append(cm.group(1))
    return cols


def parse_value_tuples(blob: str):
    """Yield value tuples (lists; None for NULL) from a string that starts at
    an INSERT's first `(` and runs to its terminating top-level `;`."""
    i, n = 0, len(blob)
    while i < n:
        while i < n and blob[i] not in "(;":   # between tuples
            i += 1
        if i >= n or blob[i] == ";":            # end of this INSERT
            return
        i += 1                                  # past '('
        row: list = []
        while i < n and blob[i] != ")":
            while i < n and blob[i] in " ,\n\r\t":
                i += 1
            if i >= n or blob[i] == ")":
                break
            if blob[i] == "'":                  # quoted string
                i += 1
                buf = []
                while i < n:
                    c = blob[i]
                    if c == "\\" and i + 1 < n:
                        buf.append(_ESCAPES.get(blob[i + 1], blob[i + 1]))
                        i += 2
                        continue
                    if c == "'":
                        if i + 1 < n and blob[i + 1] == "'":  # '' -> '
                            buf.append("'")
                            i += 2
                            continue
                        i += 1
                        break
                    buf.append(c)
                    i += 1
                row.append("".join(buf))
            else:                               # NULL or number
                j = i
                while j < n and blob[j] not in ",)":
                    j += 1
                tok = blob[i:j].strip()
                row.append(None if tok.upper() == "NULL" else tok)
                i = j
        i += 1                                  # past ')'
        yield row


def resolve_dump_root() -> Path | None:
    """The operator's legacy-dump root, or None when no dump is available.

    Precedence: the environment variable names the root explicitly; otherwise
    the git-ignored `footbag.org` symlink at the repository root is used when
    it resolves to a directory. An environment variable that points at a
    missing directory is an operator error and fails loudly rather than
    silently falling through to the symlink.
    """
    env = os.environ.get(DUMP_ROOT_ENV_VAR, "").strip()
    if env:
        p = Path(env)
        if not p.is_dir():
            raise SystemExit(
                f"error: {DUMP_ROOT_ENV_VAR}={env} is not a directory; unset it "
                "to fall back to the repo-root footbag.org symlink, or point it "
                "at the private footbag.org clone's checkout root")
        return p
    symlink = REPO_ROOT / "footbag.org"
    if symlink.is_dir():
        return symlink
    return None


def module_dump_path(root: Path, app: str) -> Path:
    """The mysqldump file for one legacy app, e.g. `members` or
    `members/admin` -> `<root>/<app>/backups/latest.sql`."""
    return root / app / "backups" / "latest.sql"
