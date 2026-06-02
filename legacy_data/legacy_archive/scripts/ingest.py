#!/usr/bin/env python3
"""
ingest.py — extract allowlisted tables from a sealed raw dump into
provenance-stamped NDJSON, with a payload-free audit report.

PLANNED FLOW (when finished):
  1. verify raw/<app>/latest.sql sha256 still matches its sidecar (tamper check)
  2. start an ephemeral, network-isolated MariaDB container (tmpfs datadir)
  3. load ONLY the allowlisted tables for this app
  4. DROP denylisted columns inside the container BEFORE any read
  5. assert no denylisted column survived (pre-output scanner)
  6. SELECT surviving columns -> parsed/<app>/<table>.ndjson, with charset repair
     and a provenance stamp on every row
  7. tear down the container
  8. write reports/ingest_<app>_<date>.audit.json (counts + checksums only)

SAFETY BOUNDARIES (read before editing):
  * Allowlist-only: a table absent from allowlist.yaml is never loaded.
  * Denylisted columns are destroyed before extraction, not filtered after.
  * --dry-run writes NO permanent output; it produces the report for human review.
  * This script never writes to raw/ and never touches the production database or
    any live system.

STATUS: SKELETON. The extraction step raises NotImplementedError on purpose so
running this today cannot read, transform, or emit any data.

Usage (once implemented):
  python scripts/ingest.py --app news --dry-run
  python scripts/ingest.py --app news
"""

import argparse
import os
import sys

try:
    import yaml
except ImportError:
    sys.exit("FATAL: PyYAML is required. Install with: pip install pyyaml")

ARCHIVE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_DIR = os.path.join(ARCHIVE_ROOT, "config")
RAW_DIR = os.path.join(ARCHIVE_ROOT, "raw")
PARSED_DIR = os.path.join(ARCHIVE_ROOT, "parsed")
REPORTS_DIR = os.path.join(ARCHIVE_ROOT, "reports")


def log(msg):
    print(f"[ingest] {msg}")


def load_yaml(name):
    path = os.path.join(CONFIG_DIR, name)
    if not os.path.exists(path):
        sys.exit(f"FATAL: missing config: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def resolve_tables(app, allowlist):
    """Return the explicit, wildcard-free table list for this app, or fail."""
    if app not in allowlist:
        sys.exit(f"FATAL: app '{app}' not in allowlist.yaml; refusing to extract.")
    tables = allowlist[app] or []
    if not tables:
        sys.exit(f"FATAL: allowlist.yaml[{app}] is empty; nothing permitted.")
    if any(t == "*" for t in tables):
        sys.exit("FATAL: wildcards are not permitted in the allowlist.")
    return tables


def ingest(app, dry_run):
    allowlist = load_yaml("allowlist.yaml")
    denylist = load_yaml("denylist.yaml")
    tables = resolve_tables(app, allowlist)

    raw_path = os.path.join(RAW_DIR, app, "latest.sql")
    sha_path = raw_path + ".sha256"
    if not os.path.exists(raw_path) or not os.path.exists(sha_path):
        sys.exit(f"FATAL: sealed raw not found for app '{app}'. Run seal.py first.")

    log(f"app={app}")
    log(f"tables (allowlist)={tables}")
    log(f"denylist tables={list(denylist.keys())}")
    log(f"dry_run={dry_run}")

    # TODO(implementation):
    #   - verify sha256(raw_path) == contents of sha_path  (tamper check; fail hard)
    #   - ephemeral MariaDB extraction (docker run --rm --network none, tmpfs)
    #   - DROP denylisted columns before any SELECT
    #   - pre-output scanner: abort if any denylisted column survives
    #   - charset repair (keep raw_b64 alongside repaired value)
    #   - provenance stamp each row (_legacy_source/_legacy_table/_legacy_pk/
    #     _dump_sha256/_dump_date/_ingest_run_id)
    #   - if not dry_run: write parsed/<app>/<table>.ndjson
    #   - always: write payload-free audit report to reports/
    raise NotImplementedError(
        "ingest.py is a Step-0 skeleton; extraction is intentionally not "
        "implemented yet."
    )


def main():
    parser = argparse.ArgumentParser(description="Extract allowlisted tables from sealed raw.")
    parser.add_argument("--app", required=True, help="app key (e.g. news)")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="produce the audit report for review without writing parsed output",
    )
    args = parser.parse_args()
    ingest(args.app, args.dry_run)


if __name__ == "__main__":
    main()
