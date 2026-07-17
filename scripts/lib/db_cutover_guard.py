"""
Shared post-cutover refusal for destructive seeders and loaders.

At cutover the live database becomes the single source of truth for content,
and the operator records that inside the database itself by appending a
system_config row with config_key 'post_cutover' and value_json '1'. Unlike the
host env-file marker and the env/path guards (which stay in place as defense in
depth), this marker travels with every copy, snapshot, and restore of the
database, so a seeder pointed at a restored production snapshot on any machine
still refuses before mutating anything. A destructive run against such a
database would orphan-delete admin- and member-authored rows that have no
committed seed input.

Contract, in refusal-safety order:
  - database file missing        -> allowed (a fresh build target)
  - system_config table missing  -> allowed (pre-schema or foreign file)
  - no 'post_cutover' row        -> allowed (pre-cutover database)
  - current value '1'            -> REFUSED, no bypass flag

The check opens the database read-only via a URI so it can never create a
0-byte file as a side effect of probing a not-yet-built path.

Use from Python:  assert_db_pre_cutover(db_path, script_name)
Use from shell:   scripts/internal/assert-db-pre-cutover.sh <db-path> (a thin
wrapper that runs this module as a script).
"""
from __future__ import annotations

import os
import sqlite3
import sys


def db_is_post_cutover(db_path: str) -> bool:
    """True when db_path is a real database whose current 'post_cutover' config value is '1'."""
    if not os.path.isfile(db_path):
        return False
    uri = f"file:{db_path}?mode=ro"
    try:
        con = sqlite3.connect(uri, uri=True)
    except sqlite3.Error:
        return False
    try:
        row = con.execute(
            "SELECT value_json FROM system_config_current WHERE config_key = 'post_cutover'"
        ).fetchone()
    except sqlite3.Error:
        # No system_config table / view: not a platform database in the
        # post-cutover sense, so the destructive caller may proceed.
        return False
    finally:
        con.close()
    return row is not None and str(row[0]).strip() == "1"


def assert_db_pre_cutover(db_path: str, script_name: str) -> None:
    """Exit non-zero with an operator-actionable message when db_path is post-cutover."""
    if not db_is_post_cutover(db_path):
        return
    sys.stderr.write(
        f"REFUSED: {script_name} will not run against a post-cutover database.\n"
        f"  database: {db_path}\n"
        "  This database carries the post_cutover marker (system_config key\n"
        "  'post_cutover' = 1), meaning it is, or was copied from, the live\n"
        "  source of truth: admin- and member-authored rows in it have no\n"
        "  committed seed inputs, and a destructive rebuild or reseed would\n"
        "  silently delete them. There is no bypass flag. If this is a\n"
        "  deliberate disaster rebuild, follow the recovery procedure in\n"
        "  DEVOPS_GUIDE.md (private GitHub repo), which appends a post_cutover = 0\n"
        "  config row as an explicit out-of-band step before rebuilding.\n"
    )
    sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.stderr.write("usage: db_cutover_guard.py <db-path>\n")
        sys.exit(2)
    assert_db_pre_cutover(sys.argv[1], "this destructive step")
