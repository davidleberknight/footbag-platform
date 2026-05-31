#!/usr/bin/env python3
"""acquire_footbag_org_demos.py

Acquire the footbag.org "Video Moves" demonstration clips and stage them for
the EXISTING file-paired curator S3 path (`seed_fh_curator.py:
seed_file_paired_sidecars`). This script does data prep only: it downloads
binaries into /curated and emits paired sidecars. It does NOT touch the
seeder, schema, promote script, rendering, doctrine, or ontology, and it does
NOT route through snippet_candidates.csv.

Input  : legacy_data/tools/trick_video_discovery/footbag_org_rehost_candidates.csv
Output : curated/freestyle_demos/<stem>.mov          (re-host source binary)
         curated/freestyle_demos/<stem>.poster.jpg   (poster; seeder skips *.poster.*)
         curated/freestyle_demos/<stem>.meta.json     (paired sidecar)

Each sidecar carries:
  caption      move name only (contributor names are NOT emitted; they stay in
               the manifest for provenance, per the no-individual-names rule)
  tags         ["#<trick_slug>", "#freestyle", "#trick", "#footbag_org"]
               (NOT "#curated" — the seeder auto-prepends it)
  poster       "<stem>.poster.jpg"
  externalUrl  the footbag.org /newmoves/showmove/<id> source page

Hosting: every clip is a legacy footbag.org .mov in one of two sub-archives:
  media_42 -> http://www.footbag.org/media/42/<stem>.mov
              poster http://www.footbag.org/media/.thumb/42/<stem>.jpeg
  eniac    -> http://www.footbag.org/video/eniac/moves/<stem>.mov
              poster http://www.footbag.org/video/eniac/moves/_jpg/<stem>.jpg

Usage:
    python3 scripts/acquire_footbag_org_demos.py --dry-run   # HEAD-probe, no writes
    python3 scripts/acquire_footbag_org_demos.py             # download + emit sidecars
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST = REPO_ROOT / "legacy_data" / "tools" / "trick_video_discovery" / "footbag_org_rehost_candidates.csv"
DEST_DIR = REPO_ROOT / "curated" / "freestyle_demos"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _trick_tag_invariant import (  # noqa: E402
    MediaTagInvariantError,
    load_slug_sets_from_csvs,
    validate_media_tags,
)

# Strip a single trailing "(...)" group — the contributor parenthetical — to
# reduce a clip label to its move name. Leaves any "#2" suffix intact.
_PAREN_TAIL = re.compile(r"\s*\([^)]*\)\s*$")


def caption_from_label(label: str) -> str:
    return _PAREN_TAIL.sub("", label).strip()


def stem_of(raw_asset_url: str) -> str:
    fname = raw_asset_url.rsplit("/", 1)[-1]
    return fname[:-4] if fname.lower().endswith(".mov") else Path(fname).stem


def poster_url(stem: str, sub_archive: str) -> str:
    if sub_archive == "media_42":
        return f"http://www.footbag.org/media/.thumb/42/{stem}.jpeg"
    if sub_archive == "eniac":
        return f"http://www.footbag.org/video/eniac/moves/_jpg/{stem}.jpg"
    raise ValueError(f"unknown sub_archive {sub_archive!r}")


def head(url: str) -> tuple[int | None, int | None, str]:
    """HEAD-probe a URL; return (status, content_length, detail)."""
    req = urllib.request.Request(url, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            clen = r.headers.get("Content-Length")
            return (r.status, int(clen) if clen else None, r.headers.get("Content-Type", ""))
    except Exception as exc:  # noqa: BLE001 — surfaced to the operator, never silent
        return (None, None, f"{type(exc).__name__}: {exc}")


def download(url: str, dest: Path) -> int:
    with urllib.request.urlopen(url, timeout=120) as r:
        data = r.read()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return len(data)


def load_rows() -> list[dict]:
    with MANIFEST.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def build_plan(rows: list[dict]) -> list[dict]:
    plan: list[dict] = []
    for r in rows:
        slug = r["trick_slug"].strip()
        raw = r["raw_asset_url"].strip()
        stem = stem_of(raw)
        caption = caption_from_label(r["clip_label"].strip())
        plan.append({
            "slug": slug,
            "stem": stem,
            "raw_url": raw,
            "poster_url": poster_url(stem, r["sub_archive"].strip()),
            "caption": caption,
            "tags": [f"#{slug}", "#freestyle", "#trick", "#footbag_org"],
            "external_url": r["source_page_url"].strip(),
            "contributor": r["contributor"].strip(),
            "mov_path": DEST_DIR / f"{stem}.mov",
            "poster_path": DEST_DIR / f"{stem}.poster.jpg",
            "sidecar_path": DEST_DIR / f"{stem}.meta.json",
        })
    return plan


def validate(plan: list[dict]) -> list[str]:
    """Return a list of error strings; empty means clean."""
    errors: list[str] = []
    active, pending, alias = load_slug_sets_from_csvs(REPO_ROOT)
    contributors = {p["contributor"] for p in plan if p["contributor"]}

    stems_seen: set[str] = set()
    for p in plan:
        # Tag invariant (slug resolution + #footbag_org whitelist).
        try:
            validate_media_tags(
                p["sidecar_path"].name, p["tags"],
                active_slugs=active, pending_slugs=pending, alias_slugs=alias,
            )
        except MediaTagInvariantError as e:
            errors.append(f"tag invariant: {e}")
        # Caption must be non-empty and must NOT leak a contributor name.
        if not p["caption"]:
            errors.append(f"{p['stem']}: empty caption")
        for name in contributors:
            if name and name.lower() in p["caption"].lower():
                errors.append(f"{p['stem']}: caption leaks contributor name {name!r}")
        # Stems must be unique (one binary == one media row).
        if p["stem"] in stems_seen:
            errors.append(f"duplicate stem {p['stem']!r}")
        stems_seen.add(p["stem"])
    return errors


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--dry-run", action="store_true",
                    help="HEAD-probe every URL and validate; write nothing.")
    args = ap.parse_args()

    if not MANIFEST.exists():
        print(f"ERROR: manifest not found: {MANIFEST}", file=sys.stderr)
        return 2

    rows = load_rows()
    plan = build_plan(rows)
    print(f"Manifest rows: {len(plan)}  →  dest: {DEST_DIR.relative_to(REPO_ROOT)}")
    print(f"Distinct slugs: {len({p['slug'] for p in plan})}\n")

    errors = validate(plan)
    if errors:
        print("VALIDATION ERRORS (no writes):", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print("Validation: tags OK, captions name-free, stems unique.\n")

    if args.dry_run:
        print(f"{'slug':<26} {'stem':<30} {'caption':<26} mov / poster (HEAD)")
        total_mov = 0
        unreachable = 0
        for p in plan:
            ms, msize, mdetail = head(p["raw_url"])
            ps, psize, pdetail = head(p["poster_url"])
            total_mov += msize or 0
            if ms != 200 or ps != 200:
                unreachable += 1
            mtxt = f"{ms} {msize}B" if ms == 200 else f"FAIL({mdetail})"
            ptxt = f"{ps} {psize}B" if ps == 200 else f"FAIL({pdetail})"
            print(f"{p['slug']:<26} {p['stem']:<30} {p['caption']:<26} mov={mtxt} | poster={ptxt}")
        print()
        print(f"reachable clips: {len(plan) - unreachable}/{len(plan)}  "
              f"(all CANONICAL_TRICK)")
        print(f"total .mov bytes (source): {total_mov:,} (~{total_mov/1_048_576:.1f} MiB)")
        print("\n(dry-run; no files written. Re-run without --dry-run to acquire.)")
        return 0 if unreachable == 0 else 1

    # ── apply ──
    DEST_DIR.mkdir(parents=True, exist_ok=True)
    dl_mov = skip_mov = dl_poster = skip_poster = wrote_sidecar = 0
    total_bytes = 0
    for p in plan:
        if p["mov_path"].exists():
            skip_mov += 1
        else:
            n = download(p["raw_url"], p["mov_path"])
            total_bytes += n
            dl_mov += 1
            print(f"  ↓ {p['mov_path'].name}  ({n:,}B)")
        if p["poster_path"].exists():
            skip_poster += 1
        else:
            n = download(p["poster_url"], p["poster_path"])
            dl_poster += 1
            print(f"  ↓ {p['poster_path'].name}  ({n:,}B)")
        sidecar = {
            "caption": p["caption"],
            "tags": p["tags"],
            "poster": p["poster_path"].name,
            "externalUrl": p["external_url"],
        }
        p["sidecar_path"].write_text(json.dumps(sidecar, indent=2) + "\n", encoding="utf-8")
        wrote_sidecar += 1

    print()
    print("=== acquisition summary ===")
    print(f"  .mov downloaded / skipped(existing): {dl_mov} / {skip_mov}")
    print(f"  posters downloaded / skipped:        {dl_poster} / {skip_poster}")
    print(f"  sidecars written:                    {wrote_sidecar}")
    print(f"  bytes downloaded this run:           {total_bytes:,} (~{total_bytes/1_048_576:.1f} MiB)")
    print("\nNext: run the local seed/reset, then 25_qc_media_tag_invariant.py + "
          "24_qc_freestyle_media_coverage.py.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
