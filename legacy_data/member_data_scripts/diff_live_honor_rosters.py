#!/usr/bin/env python3
"""Opt-in live-roster drift check for the honor flags (M12 companion).

The deterministic M12 gate (`validate_legacy_honors.py`) checks the derived
is_hof / is_bap flags against the CAPTURED roster snapshots. This script is the
separate, opt-in companion: it fetches the public Footbag Hall of Fame and Big
Add Posse roster pages that the platform links, and reports whether those live
rosters have drifted from the captured snapshots
(`fbhof_data_updated.csv` / `bap_data_updated.csv`), so a curator can refresh
the snapshots before go-live.

Scope and guarantees:

  - Read-only. Fetches the two public roster pages and reads the snapshot CSVs;
    it never mutates any data and writes nothing except an optional worklist CSV.
  - Opt-in. NOT wired into `validate_legacy_honors.py`, the gate chain, or CI.
    Run it explicitly when checking roster freshness.
  - Curator worklist, not automatic truth. Live-only / snapshot-only names are
    candidates for human review (a recent inductee, a spelling variant, a
    rename), never an automatic edit to the snapshots or the honor flags.
  - Exits non-zero ONLY when a page cannot be fetched or yields zero parsed
    names (the check could not run). Drift alone exits 0 with a worklist.

Default URLs are the public roster pages the site links: the Footbag Hall of
Fame member directory and the Big Add Posse roster. Both are overridable.
"""
from __future__ import annotations

import argparse
import csv
import html
import importlib.util
import re
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_HOF_URL = "https://www.footbaghalloffame.net/our-members"
DEFAULT_BAP_URL = "https://bigaddposse.com/"
DEFAULT_FHOF_CSV = REPO_ROOT / "legacy_data" / "inputs" / "fbhof_data_updated.csv"
DEFAULT_BAP_CSV = REPO_ROOT / "legacy_data" / "inputs" / "bap_data_updated.csv"

# Reuse the honor-resolution name normalizer so live/snapshot/flag comparisons
# all key names the same way (NFKC + lowercase + collapse).
_ELH = Path(__file__).resolve().parent / "extract_legacy_honors.py"
_spec = importlib.util.spec_from_file_location("extract_legacy_honors", _ELH)
_elh = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_elh)
norm = _elh.norm

# Footbag Hall of Fame member directory: each inductee is an anchor to their
# own page. Two markup quirks the regex absorbs: the host may be present
# (absolute) or absent (relative), and some names render the first letter as a
# drop-cap OUTSIDE the anchor (e.g. `J<a href="/our-members/on-lind">on Lind</a>`),
# so an optional leading capital immediately before the anchor is captured and
# prepended.
_HOF_RE = re.compile(
    r'>([A-Z]?)<a href="(?:https?://www\.footbaghalloffame\.net)?/our-members/[a-z0-9-]+"[^>]*>(.*?)</a>',
    re.S,
)
# Big Add Posse roster: each honoree is <h3 class="member-name">Name</h3>.
_BAP_RE = re.compile(r'<h3 class="member-name">(.*?)</h3>', re.S)
_TAG_RE = re.compile(r"<[^>]+>")


def _clean(raw: str) -> str:
    text = html.unescape(_TAG_RE.sub("", raw))
    return re.sub(r"\s+", " ", text).strip()


def parse_hof(page_html: str) -> list[str]:
    """Display names from the Footbag Hall of Fame member directory HTML."""
    return [n for n in (_clean(cap + inner) for cap, inner in _HOF_RE.findall(page_html)) if n]


def parse_bap(page_html: str) -> list[str]:
    """Display names from the Big Add Posse roster HTML."""
    return [n for n in (_clean(m) for m in _BAP_RE.findall(page_html)) if n]


def fetch(url: str, timeout: int = 30) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (roster-drift-check)"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (fixed public URLs)
        charset = resp.headers.get_content_charset() or "utf-8"
        return resp.read().decode(charset, errors="replace")


def load_snapshot_names(csv_path: Path) -> list[str]:
    with csv_path.open(encoding="utf-8", newline="") as fh:
        return [(r.get("name") or "").strip() for r in csv.DictReader(fh) if (r.get("name") or "").strip()]


def diff_roster(live_names: list[str], snapshot_names: list[str]) -> dict:
    """Compare two name lists by normalized key.

    Returns live_only / snapshot_only (display names present on one side only by
    normalized key) and ambiguities (distinct display names that collapse to the
    same key within a side: a possible duplicate or spelling variant to review).
    """
    def index(names: list[str]) -> tuple[dict, list[tuple[str, str]]]:
        by_key: dict[str, str] = {}
        ambig: list[tuple[str, str]] = []
        for n in names:
            k = norm(n)
            if not k:
                continue
            if k in by_key and by_key[k] != n:
                ambig.append((by_key[k], n))
            else:
                by_key.setdefault(k, n)
        return by_key, ambig

    live_idx, live_ambig = index(live_names)
    snap_idx, snap_ambig = index(snapshot_names)
    live_only = sorted(live_idx[k] for k in live_idx.keys() - snap_idx.keys())
    snapshot_only = sorted(snap_idx[k] for k in snap_idx.keys() - live_idx.keys())
    return {
        "live_only": live_only,
        "snapshot_only": snapshot_only,
        "ambiguities": live_ambig + snap_ambig,
        "live_count": len(live_idx),
        "snapshot_count": len(snap_idx),
    }


def _report(label: str, result: dict) -> None:
    print(f"\n=== {label} ===")
    print(f"  live roster: {result['live_count']} names | snapshot: {result['snapshot_count']} names")
    if result["live_only"]:
        print(f"  LIVE-ONLY ({len(result['live_only'])}) — on the live roster, missing from the snapshot (refresh candidate):")
        for n in result["live_only"]:
            print(f"    + {n}")
    if result["snapshot_only"]:
        print(f"  SNAPSHOT-ONLY ({len(result['snapshot_only'])}) — in the snapshot, not on the live roster (rename / removal / local error):")
        for n in result["snapshot_only"]:
            print(f"    - {n}")
    if result["ambiguities"]:
        print(f"  AMBIGUITY ({len(result['ambiguities'])}) — distinct names that normalize alike (review):")
        for a, b in result["ambiguities"]:
            print(f"    ? {a!r} ~ {b!r}")
    if not (result["live_only"] or result["snapshot_only"] or result["ambiguities"]):
        print("  no drift.")


def main() -> int:
    p = argparse.ArgumentParser(description="Opt-in live-roster drift check (M12 companion). Read-only; curator worklist.")
    p.add_argument("--hof-url", default=DEFAULT_HOF_URL)
    p.add_argument("--bap-url", default=DEFAULT_BAP_URL)
    p.add_argument("--fhof-csv", type=Path, default=DEFAULT_FHOF_CSV)
    p.add_argument("--bap-csv", type=Path, default=DEFAULT_BAP_CSV)
    p.add_argument("--out", type=Path, default=None, help="Optional worklist CSV path")
    args = p.parse_args()

    failures: list[str] = []
    rosters = {}
    for label, url, parse, csv_path in (
        ("Footbag Hall of Fame", args.hof_url, parse_hof, args.fhof_csv),
        ("Big Add Posse", args.bap_url, parse_bap, args.bap_csv),
    ):
        try:
            page = fetch(url)
        except Exception as e:  # noqa: BLE001 — opt-in tool; report any fetch failure
            failures.append(f"{label}: fetch failed for {url}: {e}")
            continue
        live = parse(page)
        if not live:
            failures.append(f"{label}: parsed 0 names from {url} (page structure may have changed)")
            continue
        rosters[label] = diff_roster(live, load_snapshot_names(csv_path))

    for label, result in rosters.items():
        _report(label, result)

    if args.out and rosters:
        with args.out.open("w", encoding="utf-8", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["roster", "status", "name"])
            for label, result in rosters.items():
                for n in result["live_only"]:
                    w.writerow([label, "live_only", n])
                for n in result["snapshot_only"]:
                    w.writerow([label, "snapshot_only", n])
        print(f"\nWorklist written: {args.out}")

    if failures:
        print("\nPARSE/FETCH FAILURES (the check could not fully run):", file=sys.stderr)
        for f in failures:
            print(f"  ! {f}", file=sys.stderr)
        return 1
    print("\nDrift is a curator worklist, not an automatic edit. Refresh the snapshot CSVs by hand after review.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
