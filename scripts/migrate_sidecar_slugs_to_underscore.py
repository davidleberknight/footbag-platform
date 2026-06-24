#!/usr/bin/env python3
"""Migrate curated freestyle sidecar slugs/hashtags from hyphen to underscore.

The freestyle slug convention is a single lowercase underscore token shared by
the slug, the hashtag body, and the trick URL segment. This brings the curated
sidecars that carry trick-slug hashtags and trick-slug filenames into line with
that convention.

Scope (only where trick-slug hashtags and trick-slug filenames live):
  - curated/freestyle_tricks/  — URL-reference trick sidecars (keyed on videoUrl,
    not filename, so renaming the file is safe).
  - curated/freestyle_demos/   — file-paired demo clips (sidecar + companion
    .mov + .poster.jpg sharing one stem; all three are renamed together so the
    poster reference stays valid).

For every sidecar in those two directories:
  - Each entry of `tags` has hyphens in its body converted to underscores.
    Role-prefixed and already-underscore tags (e.g. #set_pixie, #anz_trikz,
    #footbag_org) contain no hyphens and are therefore left untouched.
  - The `poster` field (a companion filename reference) has hyphens converted
    to underscores so it matches the renamed poster file.
  - Human-text fields (caption, title, creator) and real URLs (videoUrl,
    externalUrl, thumbnailUrl) are never altered.

Then every file in those two directories whose basename contains a hyphen is
renamed with hyphens replaced by underscores (sidecar + companion media). The
trailing 8-hex content hash on trick sidecars is already underscore-joined and
is preserved as-is.

Left untouched on purpose (separate namespaces, noted for the maintainer):
  - curated/site/         — hardcoded registry slots (demo-freestyle, demo-net)
    and mosaic-<atom> clips paired by a `mosaic-` prefix; renaming would break
    the seeder's slot identity and the mosaic content pairing.
  - curated/individual_shred/ and other person sidecars — person-name stems,
    not trick slugs; they carry no hyphenated trick-slug tags.
  - curated/avatars/      — the avatar slot.

Idempotent: a second run finds no hyphens left in any in-scope tag body, poster
field, or filename, and makes no changes.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CURATED = REPO_ROOT / "curated"

# Directories whose sidecars carry trick-slug hashtags and trick-slug filenames.
IN_SCOPE_SUBDIRS = ("freestyle_tricks", "freestyle_demos")


def _underscore_tag(tag: str) -> str:
    """Convert hyphens to underscores in a hashtag body, preserving the '#'.
    A tag with no hyphens (already-underscore or role-prefixed) is unchanged."""
    if not tag.startswith("#"):
        return tag.replace("-", "_")
    return "#" + tag[1:].replace("-", "_")


def _rewrite_sidecar(path: Path) -> bool:
    """Convert tags[] bodies and the poster filename reference in one sidecar.
    Returns True if the file content changed."""
    data = json.loads(path.read_text(encoding="utf-8"))
    changed = False

    tags = data.get("tags")
    if isinstance(tags, list):
        new_tags = [_underscore_tag(t) if isinstance(t, str) else t for t in tags]
        if new_tags != tags:
            data["tags"] = new_tags
            changed = True

    poster = data.get("poster")
    if isinstance(poster, str) and "-" in poster:
        data["poster"] = poster.replace("-", "_")
        changed = True

    if changed:
        # Two-space indent + trailing newline matches the existing sidecars.
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8")
    return changed


def main() -> int:
    rewritten = 0
    renamed = 0

    for subdir_name in IN_SCOPE_SUBDIRS:
        subdir = CURATED / subdir_name
        if not subdir.is_dir():
            continue

        # Rewrite sidecar JSON first (content), then rename files (paths), so a
        # poster reference and its file end up consistent regardless of order.
        for sidecar in sorted(subdir.glob("*.meta.json")):
            if _rewrite_sidecar(sidecar):
                rewritten += 1

        # Rename every hyphenated file (sidecar + companion .mov / .poster.jpg).
        for f in sorted(subdir.iterdir()):
            if not f.is_file() or "-" not in f.name:
                continue
            target = f.with_name(f.name.replace("-", "_"))
            if target.exists():
                print(f"  ! skip rename, target exists: {target}", file=sys.stderr)
                continue
            f.rename(target)
            renamed += 1

    print(f"Sidecar slug migration: {rewritten} sidecar(s) rewritten, "
          f"{renamed} file(s) renamed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
