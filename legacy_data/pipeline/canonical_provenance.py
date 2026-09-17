#!/usr/bin/env python3
"""Provenance ledger for the committed canonical artifact set.

The five CSVs under `event_results/canonical_input/` are generated output that
lives in the repository, and tests validate them. Nothing in that arrangement
establishes that the committed copies were produced by the generators the
repository now holds. So a transformation can change, its own test can pass
against yesterday's output, and the contradiction stays invisible until somebody
runs a full regeneration weeks later, where it surfaces looking like a data
regression rather than what it is.

Regenerating during a test run is the right answer wherever a generator is cheap
and hermetic, and this repository already does that for the artifacts that
qualify. The canonical set does not qualify: producing it is the multi-hour
pipeline over a site mirror, so no gate can rebuild it to compare.

What is affordable is a ledger. `PROVENANCE.json` beside the artifacts records
the fingerprint of the generators that actually produced them. A gate compares
that against the generators as they stand now, so a generator moving is visible
at the moment it moves rather than at the next regeneration.

Two outcomes are legitimate when they differ:

  - Unacknowledged. The gate fails: the artifacts silently predate the code.
  - Acknowledged. The ledger carries a `known_stale` block naming the current
    fingerprint, the date, and why regeneration was deferred. The gate passes and
    says plainly that the artifacts predate the generators.

What the acknowledgement may never do is advance `produced_by`. That field is a
statement of fact about which code produced the bytes on disk, and only a
regeneration can change it. An acknowledgement is a note about the gap, not a
way to close it.

Usage:
    python legacy_data/pipeline/canonical_provenance.py --check
    python legacy_data/pipeline/canonical_provenance.py --acknowledge \\
        --reason "comment-only change; no output difference"
    python legacy_data/pipeline/canonical_provenance.py --stamp    # after a rebuild
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import subprocess
import sys
from pathlib import Path

LEGACY = Path(__file__).resolve().parents[1]
CANONICAL = LEGACY / "event_results" / "canonical_input"
LEDGER = CANONICAL / "PROVENANCE.json"

# The artifacts this ledger speaks for.
ARTIFACTS = (
    "events.csv",
    "event_disciplines.csv",
    "event_results.csv",
    "event_result_participants.csv",
    "persons.csv",
)

# The generator dependency set: the modules that write the artifacts above, or
# that decide how they are written. Deliberately not the whole pipeline and
# deliberately not HEAD, because unrelated repository movement is not a reason to
# call generated data stale. Each entry earns its place by writing into the
# canonical trees or by owning the publication of the set.
GENERATORS = (
    "pipeline/platform/export_canonical_platform.py",
    "pipeline/platform/output_set.py",
    "pipeline/platform/build_platform_exports.py",
    "pipeline/historical/export_historical_csvs.py",
    "pipeline/05p5_remediate_canonical.py",
)

# Modules that name the canonical trees but do not produce them. Held here rather
# than left implicit, so the narrowness of the set above is a recorded judgement
# that a reader can challenge instead of a silence they have to reconstruct.
NON_GENERATORS = {
    "pipeline/02p5b_supplement_class_b.py": "consumes the set to build the workbook",
    "pipeline/06_build_mvfp_seed.py": "builds the seed from the set",
    "pipeline/build_workbook_release.py": "workbook builder, consumes only",
    "pipeline/build_workbook_community.py": "workbook builder, consumes only",
    "pipeline/generate_alias_candidates.py": "identity reporting, writes elsewhere",
    "pipeline/report_top_unresolved_names.py": "reporting, writes elsewhere",
    "pipeline/report_alias_expansion_impact.py": "reporting, writes elsewhere",
    "pipeline/event_comparison_viewerV13.py": "diagnostic viewer",
    "pipeline/identity/alias_resolver.py": "identity resolution, consumed upstream",
    "pipeline/identity/person_gate.py": "identity gate, consumed upstream",
    "pipeline/identity/build_name_variants.py": "writes name variants, not the set",
    "pipeline/identity/stub_uuid.py": "identifier helper",
    "pipeline/qc/run_qc.py": "quality control, reads the set",
    "pipeline/qc/check_alias_duplicate_persons.py": "quality control, reads the set",
    "pipeline/qc/check_workbook_parity.py": "quality control, reads the set",
}


def _read(path: Path) -> bytes:
    return path.read_bytes()


def generator_digests() -> dict[str, str]:
    """Per-file digest, so a drift report can name which generator moved."""
    digests = {}
    for rel in GENERATORS:
        path = LEGACY / rel
        if not path.exists():
            raise SystemExit(
                f"generator {rel} is missing. The dependency set names it, so either the "
                f"file moved and the set needs updating, or the checkout is incomplete."
            )
        digests[rel] = hashlib.sha256(_read(path)).hexdigest()
    return digests


def fingerprint(digests: dict[str, str] | None = None) -> str:
    """One digest over the whole dependency set, order-independent."""
    digests = digests if digests is not None else generator_digests()
    joined = "\n".join(f"{rel} {digest}" for rel, digest in sorted(digests.items()))
    return "sha256:" + hashlib.sha256(joined.encode("utf-8")).hexdigest()


def load_ledger() -> dict:
    if not LEDGER.exists():
        raise SystemExit(
            f"{LEDGER} is missing. The canonical set is generated output and the ledger is "
            f"how the repository records which generators produced it."
        )
    return json.loads(LEDGER.read_text(encoding="utf-8"))


def _today() -> str:
    return datetime.date.today().isoformat()


def _head_commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                              capture_output=True, text=True, check=True,
                              cwd=LEGACY.parent).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def check() -> int:
    ledger = load_ledger()
    produced = ledger["produced_by"]
    digests = generator_digests()
    current = fingerprint(digests)

    if current == produced["fingerprint"]:
        print("[canonical-provenance] current: the committed artifacts were produced by "
              "the generators as they stand.")
        return 0

    moved = sorted(rel for rel, digest in digests.items()
                   if produced["generators"].get(rel) != digest)
    ack = ledger.get("known_stale")

    if ack is None:
        print("[canonical-provenance] FAIL: the canonical artifacts predate the current "
              "generators, and nothing says so.", file=sys.stderr)
        print(f"  produced by : {produced['fingerprint']}", file=sys.stderr)
        print(f"  generators  : {current}", file=sys.stderr)
        print(f"  moved       : {', '.join(moved)}", file=sys.stderr)
        print("  Either regenerate and stamp, or acknowledge the gap with a reason:",
              file=sys.stderr)
        print("    python legacy_data/pipeline/canonical_provenance.py --acknowledge "
              "--reason \"...\"", file=sys.stderr)
        return 1

    if ack.get("current_fingerprint") != current:
        print("[canonical-provenance] FAIL: the acknowledgement is itself out of date. It "
              "was written against a generator state that has since moved again.",
              file=sys.stderr)
        print(f"  acknowledged: {ack.get('current_fingerprint')}", file=sys.stderr)
        print(f"  generators  : {current}", file=sys.stderr)
        print(f"  moved       : {', '.join(moved)}", file=sys.stderr)
        return 1

    print("[canonical-provenance] KNOWN STALE: the committed artifacts predate the current "
          "generators, acknowledged and unresolved.")
    print(f"  produced by    : {produced['fingerprint']} ({produced.get('regenerated_at')})")
    print(f"  generators now : {current}")
    print(f"  moved          : {', '.join(moved)}")
    print(f"  acknowledged   : {ack.get('acknowledged_at')} — {ack.get('reason')}")
    return 0


def acknowledge(reason: str) -> int:
    ledger = load_ledger()
    digests = generator_digests()
    current = fingerprint(digests)
    if current == ledger["produced_by"]["fingerprint"]:
        print("[canonical-provenance] nothing to acknowledge: the artifacts match the "
              "current generators.", file=sys.stderr)
        return 1
    ledger["known_stale"] = {
        "current_fingerprint": current,
        "acknowledged_at": _today(),
        "acknowledged_commit": _head_commit(),
        "reason": reason,
    }
    LEDGER.write_text(json.dumps(ledger, indent=2) + "\n", encoding="utf-8")
    print(f"[canonical-provenance] acknowledged the gap against {current}.")
    print("  produced_by is unchanged: only a regeneration can advance it.")
    return 0


def stamp() -> int:
    """Record that the artifacts on disk were produced by the current generators.

    Run this only after an actual regeneration. Nothing here can verify that, and
    nothing should pretend to: the ledger is a record somebody signs, which is why
    it carries a date and a commit rather than only a hash.
    """
    ledger = load_ledger() if LEDGER.exists() else {"artifacts": list(ARTIFACTS)}
    digests = generator_digests()
    ledger["artifacts"] = list(ARTIFACTS)
    ledger["produced_by"] = {
        "fingerprint": fingerprint(digests),
        "generators": digests,
        "regenerated_at": _today(),
        "commit": _head_commit(),
    }
    ledger.pop("known_stale", None)
    LEDGER.write_text(json.dumps(ledger, indent=2) + "\n", encoding="utf-8")
    print(f"[canonical-provenance] stamped {ledger['produced_by']['fingerprint']}; any "
          f"acknowledgement is cleared.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true",
                       help="compare the ledger against the generators as they stand")
    group.add_argument("--acknowledge", action="store_true",
                       help="record a deferred regeneration; needs --reason")
    group.add_argument("--stamp", action="store_true",
                       help="after a regeneration: advance produced_by, clear the "
                            "acknowledgement")
    parser.add_argument("--reason", default="",
                        help="why regeneration was deferred")
    args = parser.parse_args()

    if args.check:
        return check()
    if args.acknowledge:
        if not args.reason.strip():
            parser.error("--acknowledge needs --reason: an unexplained gap is the thing "
                         "this ledger exists to prevent")
        return acknowledge(args.reason.strip())
    return stamp()


if __name__ == "__main__":
    raise SystemExit(main())
