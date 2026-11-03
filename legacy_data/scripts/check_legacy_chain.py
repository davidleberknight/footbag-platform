#!/usr/bin/env python3
"""Refuse a member-data build whose legacy inputs come from different deliveries.

The legacy chain runs in order: the webmaster commits a delivery, the refresh turns
it into vetted CSVs, the publish builds the member CSV from those, the audited
figures are re-audited and the account rulings re-fitted for it, and only then does
a build load it. Each step can be skipped by accident, and every skip so far looked
like success until the member load: a deploy started after the refresh but before
the publish would have loaded the previous delivery's members, and figures carried
forward failed the audit only after member rows were written.

So the data build runs this first, before it touches the database. It reads only,
collects every finding, and refuses with all of them at once:

- the refresh manifest is missing or incomplete;
- the legacy clone has been pulled past the delivery the export was refreshed from
  (run the refresh), skipped with a note when the clone is not on this machine;
- the publish stamp is missing, names another delivery, or no longer matches the
  export members CSV or the published member CSV on disk (run the publish);
- the checks that need no database find an integrity failure
  (audit_member_data.py --pre-build); figures not yet re-audited for this export
  only warn, so new data never stops a build or a deploy, except with
  --final-load (the final cutover load), where they refuse;
- the account rulings were last fitted to another export (refit_rulings.py);
- with --require-committed (a production deploy), the export, the publish, the
  figures or the rulings are not committed in the private checkout, where they are
  reviewed and where the committed version is the record of what production loaded.

With --strict (any deploy) a clone pulled past the refresh refuses too; without it
that only warns, so a maintainer can rebuild locally while a newer delivery waits.
Uncommitted private changes refuse only with --require-committed and otherwise
warn, because a staging or local build is disposable and is how the changes are
tested before they are committed.

Usage:
    check_legacy_chain.py [--strict] [--require-committed] [--final-load]
"""
from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PRIVATE = REPO_ROOT / "footbag_private_repo"
CLONE = REPO_ROOT / "footbag_legacy_repo"
EXPORT = PRIVATE / "legacy-export"
MANIFEST = EXPORT / "REFRESH_MANIFEST.tsv"
EXPORT_MEMBERS = EXPORT / "members" / "members.csv"
PUBLISH = PRIVATE / "legacy-publish"
STAMP = PUBLISH / "PUBLISH_STAMP.tsv"
PUBLISHED = PUBLISH / "legacy_members.csv"
OVERRIDES = PRIVATE / "private_data" / "stage_a_overrides"
FITTED = OVERRIDES / "FITTED_EXPORT.tsv"
AUDIT = REPO_ROOT / "legacy_data" / "member_data_scripts" / "audit_member_data.py"
MEMBERS_SOURCE = "members/backups/latest.sql"
REVIEWED_PATHS = ("legacy-export", "legacy-publish", "private_data/stage_a_overrides")
STAGE_B_RULINGS = ("person_link_holds.csv", "review_resolutions.csv")

REFRESH = "legacy_data/scripts/refresh_legacy_repo_data.py"
PUBLISH_CMD = "legacy_data/scripts/publish_legacy_repo_data.py --cutover-date YYYY-MM-DD"
REFIT = "legacy_data/member_data_scripts/refit_rulings.py"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tsv(path: Path) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        cols = line.split("\t")
        if cols and cols[0]:
            out[cols[0]] = cols[1:]
    return out


def git(*args: str, repo: Path) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True,
                          timeout=120)


def check(strict: bool, python: str, require_committed: bool = False,
          final_load: bool = False) -> tuple[list[str], list[str]]:
    """(errors, warnings)."""
    errors: list[str] = []
    warnings: list[str] = []

    def soft(message: str) -> None:
        (errors if strict else warnings).append(message)

    if not MANIFEST.is_file():
        return [f"the refresh manifest is missing ({MANIFEST}); run {REFRESH}"], warnings
    manifest = tsv(MANIFEST)
    live_head = (manifest.get("live_head") or [""])[0]
    members_row = manifest.get(MEMBERS_SOURCE) or []
    if not live_head or not members_row:
        return [f"the refresh manifest is incomplete (a refresh that stopped part way); "
                f"run {REFRESH}"], warnings

    if (CLONE / ".git").exists() or CLONE.is_dir():
        head = git("rev-parse", "HEAD", repo=CLONE)
        if head.returncode == 0 and head.stdout.strip() != live_head:
            soft(f"the legacy clone is at {head.stdout.strip()[:12]} but the export was "
                 f"refreshed from {live_head[:12]}: a newer delivery has been pulled and not "
                 f"refreshed; run {REFRESH}, then the publish")
    else:
        warnings.append("the legacy clone is not on this machine; the pulled-but-not-"
                        "refreshed check was skipped")

    if not STAMP.is_file():
        errors.append(f"the publish stamp is missing ({STAMP.name}); run {PUBLISH_CMD}")
    else:
        stamp = {k: (v[0] if v else "") for k, v in tsv(STAMP).items()}
        if stamp.get("refresh_live_head") != live_head \
                or stamp.get("members_dump_sha256") != members_row[0]:
            errors.append("the published member CSV was built from another delivery than the "
                          f"export now holds; run {PUBLISH_CMD}")
        if EXPORT_MEMBERS.is_file() and stamp.get("export_members_csv_sha256") != sha256(
                EXPORT_MEMBERS):
            errors.append("the export members CSV changed after the publish read it; "
                          f"run {PUBLISH_CMD}")
        if not PUBLISHED.is_file() or stamp.get("published_members_csv_sha256") != sha256(
                PUBLISHED):
            errors.append("the published member CSV is not the one the publish wrote (edited "
                          f"by hand or a partial publish); run {PUBLISH_CMD}")

    # Figures awaiting a re-audit for new data warn here rather than stop the
    # build; the test runner's real-data row and the delivery runner still fail on
    # them. An integrity finding still refuses, and so does any stale figure on
    # the final cutover load, which ships the export production keeps.
    audit_cmd = [python, str(AUDIT), "--pre-build"]
    if not final_load:
        audit_cmd.append("--figure-drift-warns")
    audit = subprocess.run(audit_cmd, capture_output=True, text=True, timeout=1200)
    for ln in audit.stdout.splitlines():
        if ln.startswith("WARN"):
            warnings.append(f"member-data figures: {ln[len('WARN '):]}")
    if audit.returncode != 0:
        failed = [ln for ln in audit.stdout.splitlines() if ln.startswith("FAIL")]
        errors.append("the member-data checks that need no database fail: "
                      + "; ".join(failed or ["see audit_member_data.py --pre-build"]))

    if any((OVERRIDES / name).is_file() for name in STAGE_B_RULINGS):
        fitted = {k: (v[0] if v else "") for k, v in tsv(FITTED).items()} \
            if FITTED.is_file() else {}
        if EXPORT_MEMBERS.is_file() and fitted.get("export_members_csv_sha256") != sha256(
                EXPORT_MEMBERS):
            errors.append("the account rulings were not re-fitted to this export; run the data "
                          f"build to the member load, then {REFIT} (and --apply)")

    status = git("status", "--porcelain", "--", *REVIEWED_PATHS, repo=PRIVATE)
    if status.returncode == 0 and status.stdout.strip():
        message = ("the private checkout holds uncommitted changes under "
                   f"{', '.join(REVIEWED_PATHS)}; review and commit them there first")
        (errors if require_committed else warnings).append(message)
    return errors, warnings


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--strict", action="store_true",
                    help="refuse a clone pulled past the refresh too (any deploy)")
    ap.add_argument("--require-committed", action="store_true",
                    help="refuse uncommitted private changes (a production deploy)")
    ap.add_argument("--final-load", action="store_true",
                    help="refuse figures not re-audited for this export (the final "
                         "cutover load); otherwise they only warn")
    args = ap.parse_args(argv)
    python = str(REPO_ROOT / "legacy_data" / "footbag_venv" / "bin" / "python")
    if not Path(python).exists():
        python = sys.executable
    if not PRIVATE.is_dir():
        print("legacy chain: the private checkout is not reachable; nothing to check.")
        return 0
    errors, warnings = check(args.strict, python, args.require_committed, args.final_load)
    for w in warnings:
        print(f"WARNING legacy chain: {w}")
    for e in errors:
        print(f"ERROR legacy chain: {e}", file=sys.stderr)
    if errors:
        print("legacy chain: REFUSED before any database work. Nothing was changed.",
              file=sys.stderr)
        return 1
    print("legacy chain: export, publish, audited figures and rulings come from one delivery.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
