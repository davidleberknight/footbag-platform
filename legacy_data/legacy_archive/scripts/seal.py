#!/usr/bin/env python3
"""
seal.py — Step 1: make an IMMUTABLE raw copy of one app's mysqldump.

WHAT THIS DOES:
  1. Copies sources.yaml[app].dump_path -> raw/<app>/latest.sql verbatim.
  2. Generates a sha256 sidecar (raw/<app>/latest.sql.sha256) over the copy.
  3. Seals both files read-only (chmod 0444).

SAFETY BOUNDARIES (read before editing):
  * Only ever CREATES raw/<app>/latest.sql + latest.sql.sha256.
  * MUST refuse to overwrite an existing sealed raw file. Immutable means
    immutable; a new dump must land as a new dated file, never an overwrite.
  * Does NOT parse, transform, load, or inspect contents. No Docker. No DB.
    Parsing/extraction is ingest.py's job, which remains a Step-0 skeleton.

STATUS: IMPLEMENTED for Step-1 raw sealing (copy + sha256 sidecar + 0444).
ingest.py is still skeleton-only and performs no extraction yet.

Usage:
  python scripts/seal.py --app news
"""

import argparse
import hashlib
import os
import shutil
import sys

# Single external dependency, behind a guarded import with an explicit message.
try:
    import yaml
except ImportError:
    sys.exit("FATAL: PyYAML is required. Install with: pip install pyyaml")

# Resolve paths relative to the archive root (the parent of scripts/), so the
# script behaves the same regardless of the caller's working directory.
ARCHIVE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_DIR = os.path.join(ARCHIVE_ROOT, "config")
RAW_DIR = os.path.join(ARCHIVE_ROOT, "raw")


def log(msg):
    """Explicit, prefixed logging. No magic, no hidden side effects."""
    print(f"[seal] {msg}")


def sha256_of(path):
    """Streamed sha256 so large dumps don't have to fit in memory."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_sources():
    """Read config/sources.yaml. Fail loudly if missing or malformed."""
    path = os.path.join(CONFIG_DIR, "sources.yaml")
    if not os.path.exists(path):
        sys.exit(f"FATAL: missing config: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def seal(app):
    sources = load_sources()
    if app not in sources:
        sys.exit(f"FATAL: app '{app}' not found in sources.yaml")

    src = sources[app].get("dump_path", "")
    if not src or src.startswith("TODO"):
        sys.exit(f"FATAL: sources.yaml[{app}].dump_path is not set (still 'TODO').")

    dest_dir = os.path.join(RAW_DIR, app)
    dest = os.path.join(dest_dir, "latest.sql")

    # --- IMMUTABILITY GUARD -------------------------------------------------
    # Never overwrite a sealed raw file. This is the single most important
    # safety boundary in this script.
    if os.path.exists(dest):
        sys.exit(
            f"FATAL: {dest} already exists. Raw is immutable and is never "
            f"overwritten. A new dump must be sealed as a new dated file."
        )
    # ------------------------------------------------------------------------

    if not os.path.exists(src):
        sys.exit(f"FATAL: source dump not found: {src}")

    log(f"app={app}")
    log(f"source={src}")
    log(f"dest={dest}")

    sha_path = dest + ".sha256"

    # Defensive: if a sha sidecar exists without its dump (or vice versa), stop.
    # A half-sealed state should be inspected by a human, never auto-repaired.
    if os.path.exists(sha_path):
        sys.exit(
            f"FATAL: {sha_path} already exists but {dest} does not. "
            f"Refusing to touch a partial/inconsistent seal; resolve by hand."
        )

    # 1. Ensure the destination directory exists (the dump file itself is the
    #    immutability guard above; the directory is safe to create).
    os.makedirs(dest_dir, exist_ok=True)

    # 2. Copy verbatim. copy2 preserves the source mtime; we do NOT transform,
    #    decode, or inspect contents in any way at this stage.
    log("copying dump verbatim ...")
    shutil.copy2(src, dest)

    # 3. Hash the COPY (not the source) so the recorded sha256 attests to exactly
    #    the bytes we sealed. Sidecar format: "<sha256>  latest.sql".
    digest = sha256_of(dest)
    with open(sha_path, "w", encoding="utf-8") as f:
        f.write(f"{digest}  latest.sql\n")

    # 4. Lock both files read-only. Raw is immutable from here on.
    os.chmod(dest, 0o444)
    os.chmod(sha_path, 0o444)

    # 5. Tiny console summary (the only "report" seal.py emits).
    byte_size = os.path.getsize(dest)
    log("SEALED")
    log(f"  sha256={digest}")
    log(f"  bytes={byte_size}")
    log(f"  raw={dest} (0444)")
    log(f"  sha={sha_path} (0444)")


def main():
    parser = argparse.ArgumentParser(description="Seal one app's dump into immutable raw/.")
    parser.add_argument("--app", required=True, help="app key from sources.yaml (e.g. news)")
    args = parser.parse_args()
    seal(args.app)


if __name__ == "__main__":
    main()
