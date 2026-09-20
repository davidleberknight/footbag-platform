#!/usr/bin/env python3
"""Replace the curated media `tier` field with a content-type hashtag.

The sidecar `tier` value was a lookup from the source id: it said nothing the
source id did not, no schema column held it, and no loader read it. It also spent
a fourth meaning of a word this repository already uses for membership tier, ADD
tier and display tier. Three tags replace it, and tags are the only
categorisation a member sees.

The mapping, ruled 2026-09-19, preserves the intent the tier values already
encoded:

    CANONICAL_TUTORIAL, STRONG_TUTORIAL -> #tutorial
    HIGH_QUALITY_DEMO                   -> #demo
    RECORD                              -> #record
    REFERENCE (individual_shred only)   -> no content-type tag
    no tier at all                      -> #demo

That last rule is deliberate and is the one worth stating. `#tutorial` is a
positive instructional claim and nobody made it for these clips; `#demo` says
only that the trick is shown. It also settles a disagreement the readers carried,
where an unknown source counted as a tutorial on trick detail and a demo on the
dictionary index.

A shred routine is not trick media and takes no content-type tag, which is why
the individual-shred tree is read and then left alone rather than skipped
silently.

Dry run by default. --apply rewrites the sidecars in place, preserving key order
and adding the tag next to the existing ones.

Usage:
    python3 scripts/migrate_media_tier_to_tag.py
    python3 scripts/migrate_media_tier_to_tag.py --apply
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CURATED = REPO_ROOT / "curated"

# The curated trick-media trees. Every clip in them gets exactly one content-type
# tag; anything outside them is not trick media and is not this migration's.
TRICK_MEDIA_TREES = ("freestyle_tricks", "freestyle_demos", "freestyle_tutorials",
                     "freestyle_media", "freestyle_sets")
SHRED_TREE = "individual_shred"

# One tree outside those holds trick media: the foundational-moves mosaic on the
# freestyle landing page, file-paired under curated/site/ and tagged with the
# trick it shows. Those clips never carried a tier, and the readers already count
# them as that trick's media through the untagged-is-a-demonstration default, so
# tagging them states a classification they already have. The same tree holds
# clips naming no trick at all -- a chinlone film, a net demonstration, an event
# clip -- and those stay untyped, which is why membership here is decided by
# whether the clip names a trick rather than by which directory it sits in.
MIXED_TREES = ("site",)

TIER_TO_TAG = {
    "CANONICAL_TUTORIAL": "#tutorial",
    "STRONG_TUTORIAL": "#tutorial",
    "HIGH_QUALITY_DEMO": "#demo",
    "RECORD": "#record",
}
UNTIERED_TAG = "#demo"
CONTENT_TYPE_TAGS = ("#tutorial", "#demo", "#record")


def trick_slugs(root: Path) -> set[str]:
    """Slugs a tag can name, read from the dictionary the tags point into.

    Only used to tell a trick clip from a discipline or event clip in a mixed
    tree. Read from the built database when it is there, because a tag naming a
    trick is what makes a clip trick media, and no committed file carries that
    list in a form this tool can trust more.
    """
    import sqlite3
    db = REPO_ROOT / "database" / "footbag.db"
    if not db.exists():
        return set()
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        slugs = {r[0] for r in conn.execute("SELECT slug FROM freestyle_tricks")}
        slugs |= {r[0] for r in conn.execute(
            "SELECT alias_slug FROM freestyle_trick_aliases")}
        return slugs
    finally:
        conn.close()


def plan(root: Path) -> tuple[list[dict], list[str]]:
    """What each sidecar becomes, and every reason to stop before writing any."""
    planned: list[dict] = []
    problems: list[str] = []
    slugs = trick_slugs(root)

    for tree in TRICK_MEDIA_TREES:
        for path in sorted((root / tree).glob("*.meta.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            tags = list(data.get("tags") or [])
            existing = [t for t in tags if t in CONTENT_TYPE_TAGS]
            tier = data.get("tier")
            if existing:
                # Already migrated is done, not an error: the tool is safe to
                # re-run. Carrying both a tag and the field it replaced is not,
                # because then two authorities answer the same question.
                if len(existing) > 1:
                    problems.append(f"{path.name}: carries {existing}; a clip is one "
                                    f"content type, not several")
                elif tier is not None:
                    problems.append(f"{path.name}: carries {existing[0]} and still has "
                                    f"tier {tier!r}; the field it replaced must go")
                continue

            if tier is None:
                tag, basis = UNTIERED_TAG, "no tier recorded"
            else:
                tag = TIER_TO_TAG.get(str(tier))
                if tag is None:
                    problems.append(f"{path.name}: tier {tier!r} is outside the ruled "
                                    f"mapping, so what this clip is has not been decided")
                    continue
                basis = str(tier)
            planned.append({"path": path, "tree": tree, "tag": tag, "basis": basis,
                            "data": data, "tags": tags})

    # A mixed tree, where naming a trick is what decides.
    for tree in MIXED_TREES:
        for path in sorted((root / tree).glob("*.meta.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            tags = list(data.get("tags") or [])
            if any(t in CONTENT_TYPE_TAGS for t in tags):
                continue
            if not any(t.lstrip("#") in slugs for t in tags):
                continue        # names no trick: a discipline or event clip
            if data.get("tier") is not None:
                problems.append(f"{path.name}: mixed-tree clip carries a tier, which "
                                f"this migration did not expect to find here")
                continue
            planned.append({"path": path, "tree": tree, "tag": UNTIERED_TAG,
                            "basis": "names a trick, no tier recorded", "data": data,
                            "tags": tags})

    # A shred routine takes no content-type tag, but the field still goes: the
    # word is what is being abolished, and REFERENCE is the value that proved it
    # was unvalidated free text in the first place.
    for path in sorted((root / SHRED_TREE).glob("*.meta.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        tier = data.get("tier")
        if tier not in (None, "REFERENCE"):
            problems.append(f"{path.name}: shred clip carries tier {tier!r}, not the "
                            f"reference value the ruling assumed")
            continue
        if any(t in CONTENT_TYPE_TAGS for t in (data.get("tags") or [])):
            problems.append(f"{path.name}: shred clip carries a content-type tag; a "
                            f"shred routine is not trick media")
            continue
        if tier is not None:
            planned.append({"path": path, "tree": SHRED_TREE, "tag": None,
                            "basis": "REFERENCE", "data": data,
                            "tags": list(data.get("tags") or [])})

    return planned, problems


def rewrite(entry: dict) -> str:
    """The sidecar with its tag added and its tier gone, key order preserved.

    Written by hand rather than by dumping the parsed object, so a file this
    migration does not understand keeps the shape its curator gave it: the tag
    lands beside the tags already there, and only the tier key leaves.
    """
    data = entry["data"]
    tag = entry["tag"]
    out: dict = {}
    for key, value in data.items():
        if key == "tier":
            continue
        if key == "tags" and tag is not None:
            out["tags"] = [*entry["tags"], tag]
        else:
            out[key] = value
    # A shred clip loses the field and gains nothing: entry["tag"] is None there.
    if tag is not None and "tags" not in out:
        out["tags"] = [tag]
    return json.dumps(out, indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true",
                        help="rewrite the sidecars; without this the tool reports only")
    parser.add_argument("--curated-root", type=Path, default=CURATED)
    args = parser.parse_args()

    planned, problems = plan(args.curated_root)

    if problems:
        print("REFUSED: nothing written.", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        return 1

    by_tag = Counter(entry["tag"] or "(none — shred routine, field removed only)"
                     for entry in planned)
    by_tree = Counter(entry["tree"] for entry in planned)
    by_basis = Counter(entry["basis"] for entry in planned)

    print(f"trick-media clips to tag: {len(planned)}")
    print(f"  by tag : {dict(by_tag)}")
    print(f"  by tree: {dict(by_tree)}")
    print(f"  basis  : {dict(by_basis)}")
    untiered = [e["path"].name for e in planned if e["basis"] == "no tier recorded"]
    if untiered:
        print(f"\n  {len(untiered)} clip(s) reach {UNTIERED_TAG} through the unknown rule "
              f"rather than from a recorded tier:")
        for name in untiered:
            print(f"    {name}")

    if not args.apply:
        print("\nDRY RUN — no sidecar written. Re-run with --apply.")
        return 0

    for entry in planned:
        entry["path"].write_text(rewrite(entry), encoding="utf-8")
    print(f"\nRewrote {len(planned)} sidecar(s): content-type tag added, tier key removed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
