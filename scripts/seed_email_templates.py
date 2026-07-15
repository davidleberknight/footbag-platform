#!/usr/bin/env python3
"""Seed email_templates from the committed sidecars in /curated/email_templates/.

Pre-go-live source-of-truth loader: one JSON sidecar per template key carries
the subject template, plain-text body template ({token} merge fields), PII
classification, and enabled flag. This seeder reconciles the email_templates
table to exactly the sidecar set: every sidecar is upserted (INSERT OR REPLACE
on a key-derived stable id), and any row whose template_key has no sidecar on
disk is deleted. Re-running restores the canonical state with no manual
cleanup. The admin template editor is edit-only, so pre-go-live every row
legitimately corresponds to a sidecar.

At go-live the persistent production database becomes the source of truth and
this seeder is never run against it again; the shared in-database post-cutover
guard refuses such a database before any mutation, because this reconcile
model would clobber admin-edited wording.

Sidecar schema (camelCase), filename <templateKey>.json with stem == key:
  templateKey        lowercase snake_case key, matches the code registry
  subjectTemplate    1..300 chars, may carry {token} merge fields
  bodyTemplate       plain text, may carry {token} merge fields
  piiClassification  'public' | 'internal' | 'confidential' | 'restricted'
  isEnabled          boolean (false suppresses the email type at send time)

Token syntax is validated here mechanically (well-formed single braces,
camelCase names, no conditional-syntax artifacts); the strict content contract
(every key registered in the code registry, every token declared) is pinned by
the TypeScript conformance test over the same files, so it is not duplicated
in Python.

Usage:
  python scripts/seed_email_templates.py [--db path] [--source-dir path]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from db_cutover_guard import assert_db_pre_cutover  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = "./database/footbag.db"
DEFAULT_SOURCE_DIR = REPO_ROOT / "curated" / "email_templates"

REQUIRED_FIELDS = {
    "templateKey", "subjectTemplate", "bodyTemplate", "piiClassification", "isEnabled",
}
CLASSIFICATIONS = ("public", "internal", "confidential", "restricted")
KEY_RE = re.compile(r"^[a-z][a-z0-9_]*$")
TOKEN_RE = re.compile(r"\{([a-zA-Z0-9]*)\}")
SUBJECT_MAX = 300


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stable_id(key: str) -> str:
    digest = hashlib.sha1(f"email_template||{key}".encode("utf-8")).hexdigest()[:24]
    return f"emailtpl_{digest}"


def validate_template_text(path: Path, field: str, text: str) -> None:
    if "{{" in text or "}}" in text:
        sys.exit(
            f"ERROR: {path.name} {field}: doubled braces are a conditional-syntax "
            "artifact; templates are logic-less plain text with single-brace {token} merge fields."
        )
    depth = 0
    for ch in text:
        if ch == "{":
            depth += 1
            if depth > 1:
                sys.exit(f"ERROR: {path.name} {field}: nested '{{' in template text.")
        elif ch == "}":
            depth -= 1
            if depth < 0:
                sys.exit(f"ERROR: {path.name} {field}: unmatched '}}' in template text.")
    if depth != 0:
        sys.exit(f"ERROR: {path.name} {field}: unclosed '{{' in template text.")
    for m in TOKEN_RE.finditer(text):
        token = m.group(1)
        if not token or not re.match(r"^[a-z][a-zA-Z0-9]*$", token):
            sys.exit(
                f"ERROR: {path.name} {field}: malformed merge token '{{{token}}}' "
                "(tokens are camelCase, e.g. {memberName})."
            )


def load_sidecar(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"ERROR: {path.name}: invalid JSON: {e}")
    if not isinstance(data, dict):
        sys.exit(f"ERROR: {path.name}: sidecar must be a JSON object.")
    missing = REQUIRED_FIELDS - data.keys()
    unknown = data.keys() - REQUIRED_FIELDS
    if missing:
        sys.exit(f"ERROR: {path.name}: missing field(s): {sorted(missing)}")
    if unknown:
        sys.exit(f"ERROR: {path.name}: unknown field(s): {sorted(unknown)}")
    key = data["templateKey"]
    if not isinstance(key, str) or not KEY_RE.match(key):
        sys.exit(f"ERROR: {path.name}: templateKey must be lowercase snake_case, got {key!r}")
    if path.stem != key:
        sys.exit(
            f"ERROR: {path.name}: filename stem must equal templateKey "
            f"(stem {path.stem!r} != key {key!r})."
        )
    subject = data["subjectTemplate"]
    body = data["bodyTemplate"]
    if not isinstance(subject, str) or not subject.strip() or len(subject) > SUBJECT_MAX:
        sys.exit(f"ERROR: {path.name}: subjectTemplate must be a non-empty string of at most {SUBJECT_MAX} chars.")
    if not isinstance(body, str) or not body.strip():
        sys.exit(f"ERROR: {path.name}: bodyTemplate must be a non-empty string.")
    if data["piiClassification"] not in CLASSIFICATIONS:
        sys.exit(
            f"ERROR: {path.name}: piiClassification must be one of {CLASSIFICATIONS}, "
            f"got {data['piiClassification']!r}"
        )
    if not isinstance(data["isEnabled"], bool):
        sys.exit(f"ERROR: {path.name}: isEnabled must be a JSON boolean.")
    validate_template_text(path, "subjectTemplate", subject)
    validate_template_text(path, "bodyTemplate", body)
    return data


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", default=None, help="Path to SQLite database")
    parser.add_argument("--source-dir", default=None, help="Path to the email-template sidecar directory")
    args = parser.parse_args()

    db_path = args.db or os.environ.get("FOOTBAG_DB_PATH", DEFAULT_DB)
    source_dir = Path(args.source_dir or DEFAULT_SOURCE_DIR)

    if not source_dir.is_dir():
        sys.exit(
            f"ERROR: source-dir {source_dir} does not exist. The committed "
            "sidecars live in curated/email_templates/; an incomplete checkout "
            "is restored with 'git checkout -- curated/email_templates'."
        )

    sidecars = [load_sidecar(p) for p in sorted(source_dir.glob("*.json"))]
    if not sidecars:
        sys.exit(f"ERROR: no *.json sidecars found in {source_dir}.")
    keys = [s["templateKey"] for s in sidecars]
    dupes = {k for k in keys if keys.count(k) > 1}
    if dupes:
        sys.exit(f"ERROR: duplicate templateKey across sidecars: {sorted(dupes)}")

    # The reconcile model deletes rows with no sidecar, which would clobber
    # admin-edited wording in a post-cutover database. Refuses before any
    # mutation.
    assert_db_pre_cutover(db_path, "seed_email_templates.py")

    ts = now_iso()
    con = sqlite3.connect(db_path)
    con.execute("PRAGMA foreign_keys = ON")
    try:
        with con:
            upserted = 0
            for s in sidecars:
                cur = con.execute(
                    "INSERT OR REPLACE INTO email_templates"
                    " (id, created_at, created_by, updated_at, updated_by, version,"
                    "  template_key, subject_template, body_template, is_enabled, pii_classification)"
                    " VALUES (?, ?, 'seed', ?, 'seed', 1, ?, ?, ?, ?, ?)",
                    (
                        stable_id(s["templateKey"]), ts, ts,
                        s["templateKey"], s["subjectTemplate"], s["bodyTemplate"],
                        1 if s["isEnabled"] else 0, s["piiClassification"],
                    ),
                )
                if cur.rowcount == 1:
                    upserted += 1
            placeholders = ",".join("?" for _ in keys)
            cur = con.execute(
                f"DELETE FROM email_templates WHERE template_key NOT IN ({placeholders})",
                keys,
            )
            orphans_deleted = cur.rowcount
        print(
            f"  → Email-template seed complete: {upserted} templates upserted, "
            f"{orphans_deleted} orphan rows deleted."
        )
    finally:
        con.close()


if __name__ == "__main__":
    main()
