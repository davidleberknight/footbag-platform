#!/usr/bin/env python3
"""promote_snippet_candidates.py

Promote reviewer-approved rows from
`legacy_data/tools/trick_video_discovery/snippet_candidates.csv` into
`curated/freestyle_tricks/*.meta.json` sidecars.

URL-reference media only. NEVER downloads YouTube/Vimeo videos. NEVER
creates MP4s. Output is JSON metadata pointing at the external URL.

## Approval rule

A row is promotion-eligible when:
  1. `reviewer` column is non-empty.
  2. `reviewer` does NOT start with "promoted_" (those rows are already done).
  3. URL host is YouTube or Vimeo (other hosts cannot be embedded as
     URL-reference media; FootbagSpot rows are skipped and reported).
  4. No sidecar with the same canonical (platform, video_id) already exists.

## Sidecar shape (matches existing TT/passback_records sidecars)

```json
{
  "videoUrl":      "<full URL>",
  "videoPlatform": "youtube" | "vimeo",
  "title":         "<from row.notes or default>",
  "creator":       "<row.player_name or source default>",
  "sourceId":      "<row.source_id>",
  "tier":          "<inferred from source_id>",
  "tags":          ["#<trick-slug>", "#freestyle", "#trick"],
  "startSeconds":  <int, optional>,
  "endSeconds":    <int, optional>
}
```

## Filename

`curated/freestyle_tricks/{trick-slug}_{sha1(video_id)[:8]}.meta.json`,
matching the convention used by `migrate-freestyle-media-to-curated.py`
and `tools/emit_tt_sidecars.py` for Phase R1.

## Usage

    python scripts/promote_snippet_candidates.py             # apply
    python scripts/promote_snippet_candidates.py --dry-run   # report only

After a successful apply, run:
    python scripts/seed_fh_curator.py
    .venv/bin/python legacy_data/event_results/scripts/22_qc_trick_dictionary.py --db database/footbag.db
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs

REPO_ROOT = Path(__file__).resolve().parents[1]
SNIPPETS_CSV = REPO_ROOT / "legacy_data" / "tools" / "trick_video_discovery" / "snippet_candidates.csv"
SIDECAR_DIR  = REPO_ROOT / "curated" / "freestyle_tricks"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _trick_tag_invariant import (  # noqa: E402
    MediaTagInvariantError,
    load_slug_sets_from_csvs,
    validate_media_tags,
)

YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
VIMEO_HOSTS   = {"vimeo.com", "www.vimeo.com", "player.vimeo.com"}

# tier-by-source mapping; default falls back to STRONG_TUTORIAL.
TIER_BY_SOURCE = {
    "tt_youtube":          "CANONICAL_TUTORIAL",
    "footbagspot_passback": "CANONICAL_TUTORIAL",
    "footbagspot_tutorials":"STRONG_TUTORIAL",
    "shred_global":         "STRONG_TUTORIAL",
    "polini_pointers":      "STRONG_TUTORIAL",
    "passback_records":     "RECORD",
    "anz_trikz":            "STRONG_TUTORIAL",
    "footbag_finland":      "STRONG_TUTORIAL",
    "flipsider_footbag":    "STRONG_TUTORIAL",
    "passback_demos":       "HIGH_QUALITY_DEMO",
    "passback_basics":      "STRONG_TUTORIAL",
}

CREATOR_BY_SOURCE = {
    "tt_youtube": "Kenny Shults",
}


def parse_youtube_id(url: str) -> str | None:
    """Extract the 11-char YouTube video ID from common URL forms."""
    p = urlparse(url)
    host = p.hostname or ""
    if host not in YOUTUBE_HOSTS:
        return None
    if host == "youtu.be":
        return p.path.lstrip("/").split("/")[0] or None
    qs = parse_qs(p.query)
    if "v" in qs and qs["v"]:
        return qs["v"][0]
    # /shorts/<id> is a YouTube video-URL form (Shorts); the id is a normal
    # 11-char video id, so treat it like /embed/ and /v/.
    m = re.match(r"^/(embed|v|shorts)/([A-Za-z0-9_-]{11})", p.path)
    return m.group(2) if m else None


def parse_vimeo_id(url: str) -> str | None:
    p = urlparse(url)
    host = p.hostname or ""
    if host not in VIMEO_HOSTS:
        return None
    m = re.search(r"(?:/video)?/(\d+)", p.path)
    return m.group(1) if m else None


def detect_platform(url: str) -> tuple[str | None, str | None]:
    """Return (platform, video_id) or (None, None) if unembeddable."""
    yid = parse_youtube_id(url)
    if yid:
        return ("youtube", yid)
    vid = parse_vimeo_id(url)
    if vid:
        return ("vimeo", vid)
    return (None, None)


def existing_video_ids() -> set[tuple[str, str]]:
    """Walk every existing sidecar and collect (platform, video_id) pairs."""
    seen: set[tuple[str, str]] = set()
    if not SIDECAR_DIR.exists():
        return seen
    for path in SIDECAR_DIR.glob("*.meta.json"):
        try:
            sc = json.loads(path.read_text())
        except Exception:
            continue
        url = sc.get("videoUrl") or ""
        platform = sc.get("videoPlatform") or ""
        if platform == "youtube":
            vid = parse_youtube_id(url)
        elif platform == "vimeo":
            vid = parse_vimeo_id(url)
        else:
            vid = None
        if vid:
            seen.add((platform, vid))
    return seen


def is_approved(row: dict) -> bool:
    rev = (row.get("reviewer") or "").strip()
    if not rev:
        return False
    if rev.startswith("promoted_"):
        return False
    return True


_TT_NOTE_RE = re.compile(r"TT\s*#(\d+)\s+([^;()]+?)(?:\s*\(([^)]*)\))?(?:[;\.]|$)", re.IGNORECASE)

def make_title(row: dict) -> str:
    """Construct a sidecar title.

    Special-case: when source_id is `tt_youtube`, parse the row's notes for
    a "TT #N <Lesson>" stem and emit the canonical TT title format
    "Footbag Lessons - Tricks of the Trade #N - <Lesson>".

    Special-case: when source_id is `passback_records`, prepend the
    trick display name so gallery tile captions identify the trick.
    Falls back to notes verbatim, then to a slug-derived placeholder.
    """
    source_id = (row.get("source_id") or "").strip()
    notes = (row.get("notes") or "").strip()
    if source_id == "tt_youtube" and notes:
        m = _TT_NOTE_RE.search(notes)
        if m:
            num = m.group(1)
            stem = m.group(2).strip()
            paren = (m.group(3) or "").strip()
            return (
                f"Footbag Lessons - Tricks of the Trade #{num} - {stem}"
                + (f" ({paren})" if paren else "")
            )
    if source_id == "passback_records":
        slug = (row.get("trick_slug") or "").strip()
        trick = slug.replace("-", " ").title() if slug else ""
        player = (row.get("player_name") or "").strip()
        if trick and player:
            return f"{trick} — Passback record by {player}"
        if trick:
            return f"{trick} — Passback record"
        if player:
            return f"Passback record by {player}"
        return "Passback record"
    if source_id == "passback_demos":
        slug = (row.get("trick_slug") or "").strip()
        trick = slug.replace("-", " ").title() if slug else ""
        # No individual names on freestyle public surfaces, so the contributor
        # is not surfaced in the title (unlike passback_records).
        return f"{trick} — PassBack demo" if trick else "PassBack demo"
    if source_id == "passback_basics":
        slug = (row.get("trick_slug") or "").strip()
        trick = slug.replace("-", " ").title() if slug else ""
        return f"{trick} — PassBack basics" if trick else "PassBack basics"
    if notes:
        return notes
    slug = (row.get("trick_slug") or "").strip()
    return f"{slug.replace('-', ' ').title()} reference" if slug else "Reference video"


def make_creator(row: dict) -> str:
    player = (row.get("player_name") or "").strip()
    if player:
        return player
    return CREATOR_BY_SOURCE.get(row.get("source_id", ""), "")


def make_tier(row: dict) -> str:
    return TIER_BY_SOURCE.get(row.get("source_id", ""), "STRONG_TUTORIAL")


def short_id(video_id: str) -> str:
    return hashlib.sha1(video_id.encode()).hexdigest()[:8]


def emit_sidecar(
    row: dict,
    platform: str,
    video_id: str,
    dry_run: bool,
    *,
    active_slugs: set[str],
    pending_slugs: set[str],
    alias_slugs: dict[str, str],
) -> Path | None:
    slug = (row.get("trick_slug") or "").strip()
    if not slug:
        print(f"  SKIP: row has no trick_slug; url={row.get('url')!r}", file=sys.stderr)
        return None

    source_id = (row.get("source_id") or "").strip()
    tags = [f"#{slug}", "#freestyle", "#trick"]
    if source_id == "passback_records":
        tags.append("#passback_records")

    # Normalize YouTube Shorts (/shorts/<id>) to the canonical watch?v= form. The
    # downstream seeder's video-id parser only understands watch?v= and youtu.be,
    # so storing the canonical URL lets it resolve the same id with no seeder change.
    video_url = row["url"].strip()
    if platform == "youtube" and "/shorts/" in urlparse(video_url).path:
        video_url = f"https://www.youtube.com/watch?v={video_id}"

    sidecar = {
        "videoUrl":      video_url,
        "videoPlatform": platform,
        "title":         make_title(row),
        "creator":       make_creator(row),
        "sourceId":      source_id,
        "tier":          make_tier(row),
        "tags":          tags,
    }
    start = (row.get("start_seconds") or "").strip()
    end   = (row.get("end_seconds") or "").strip()
    if start:
        try: sidecar["startSeconds"] = int(start)
        except ValueError: pass
    if end:
        try: sidecar["endSeconds"] = int(end)
        except ValueError: pass

    out_path = SIDECAR_DIR / f"{slug}_{short_id(video_id)}.meta.json"
    if out_path.exists():
        print(f"  SKIP: filename already exists ({out_path.name})", file=sys.stderr)
        return None

    validate_media_tags(
        out_path.name,
        sidecar["tags"],
        active_slugs=active_slugs,
        pending_slugs=pending_slugs,
        alias_slugs=alias_slugs,
    )

    if dry_run:
        return out_path

    SIDECAR_DIR.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(sidecar, indent=2) + "\n")
    return out_path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="Report what would be promoted; write nothing.")
    args = ap.parse_args()

    if not SNIPPETS_CSV.exists():
        print(f"ERROR: {SNIPPETS_CSV} not found", file=sys.stderr)
        return 2

    active_slugs, pending_slugs, alias_slugs = load_slug_sets_from_csvs(REPO_ROOT)

    already_emitted = existing_video_ids()
    print(f"Existing sidecars on disk: {len(already_emitted)} unique (platform, video_id) pairs")

    rows_total = 0
    skipped_unreviewed = 0
    skipped_already_promoted = 0
    skipped_unembeddable: list[tuple[str, str]] = []
    skipped_already_have_sidecar: list[tuple[str, str, str]] = []
    emitted: list[Path] = []

    with SNIPPETS_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows_total += 1
            rev = (row.get("reviewer") or "").strip()
            url = (row.get("url") or "").strip()
            slug = (row.get("trick_slug") or "").strip()

            if not rev:
                skipped_unreviewed += 1; continue
            if rev.startswith("promoted_"):
                skipped_already_promoted += 1; continue

            platform, video_id = detect_platform(url)
            if platform is None:
                skipped_unembeddable.append((slug, url))
                continue

            if (platform, video_id) in already_emitted:
                skipped_already_have_sidecar.append((slug, platform, video_id))
                continue

            try:
                path = emit_sidecar(
                    row, platform, video_id, args.dry_run,
                    active_slugs=active_slugs,
                    pending_slugs=pending_slugs,
                    alias_slugs=alias_slugs,
                )
            except MediaTagInvariantError as e:
                print(f"ERROR: media-tag invariant violation: {e}", file=sys.stderr)
                return 1
            if path:
                emitted.append(path)
                already_emitted.add((platform, video_id))

    # ── Report ──
    print()
    print("=== promotion summary ===")
    print(f"  rows scanned:                         {rows_total}")
    print(f"  skipped (no reviewer):                {skipped_unreviewed}")
    print(f"  skipped (already promoted):           {skipped_already_promoted}")
    print(f"  skipped (unembeddable host):          {len(skipped_unembeddable)}")
    print(f"  skipped (sidecar already on disk):    {len(skipped_already_have_sidecar)}")
    print(f"  emitted:                              {len(emitted)}{' (dry-run, no writes)' if args.dry_run else ''}")
    print()

    if skipped_unembeddable:
        print("Approved rows skipped because URL is not YouTube/Vimeo:")
        for slug, url in skipped_unembeddable:
            print(f"  {slug:<30} {url}")
        print()
        print("These rows need rehost (FootbagSpot/etc) or a separate ingestion path before promotion.")
        print()

    if emitted:
        print("Sidecars emitted:")
        for p in emitted:
            print(f"  {p.relative_to(REPO_ROOT)}")
        print()
        if args.dry_run:
            print("(dry-run; no files written. Re-run without --dry-run to apply.)")
        else:
            print("Next steps:")
            print("  python scripts/seed_fh_curator.py")
            print("  .venv/bin/python legacy_data/event_results/scripts/22_qc_trick_dictionary.py --db database/footbag.db")

    return 0


if __name__ == "__main__":
    sys.exit(main())
