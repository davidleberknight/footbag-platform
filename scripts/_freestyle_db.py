"""
Guarded database open for the freestyle rebuild loaders.

Every freestyle rebuild loader opens its target database through open_freestyle_db,
so the post-cutover refusal travels with the connection itself rather than living
only in the run_freestyle.sh orchestrator's single up-front _assert_dev_db.sh check.
A rebuild loader run directly, outside the orchestrator, against a live or
restored-production database still refuses before it can wipe or reload a freestyle
table: the shared guard reads the in-database post_cutover marker, which travels
with every copy, snapshot, and restore of the database file.

The read-only freestyle QC loaders (trick-dictionary, media-coverage, media-tag)
do not open through here: they only read the rebuild database and never mutate it,
so they are not the rebuild path the guard protects.
"""
from __future__ import annotations

import os
import sqlite3
import sys

# The shared post-cutover guard lives in scripts/lib. This module sits in scripts/,
# so lib/ is a sibling directory; put it on the path once.
_LIB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib")
if _LIB not in sys.path:
    sys.path.insert(0, _LIB)
from db_cutover_guard import assert_db_pre_cutover  # noqa: E402


def open_freestyle_db(db_path, script_name: str | None = None) -> sqlite3.Connection:
    """Refuse a post-cutover database, then open db_path for a freestyle rebuild loader.

    The refusal is the same production-safety rule run_freestyle.sh applies once up
    front; applying it at the point of connection open protects a loader run directly,
    outside the orchestrator. db_path is opened and returned unchanged on success, so
    this is a drop-in replacement for sqlite3.connect(db_path).
    """
    name = script_name or os.path.basename(sys.argv[0]) or "a freestyle rebuild loader"
    assert_db_pre_cutover(str(db_path), name)
    return sqlite3.connect(db_path)
