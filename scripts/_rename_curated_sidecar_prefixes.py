#!/usr/bin/env python3
"""Plan, apply and verify the fold of curated URL-reference sidecar filename
prefixes to the site's one slug rule (lowercase letters, digits, underscores).

A sidecar is named `<prefix>_<sha1(url)[:8]>.meta.json`. The prefix only names
the file: the media id is a hash of the platform and URL, so a rename changes
no database row. This helper is driven by
`scripts/rename-curated-sidecar-prefixes.sh`, which owns the run.

  plan   --curated-dir DIR             print one `old<TAB>new` line per rename;
                                       exit 2 when a target collides or a prefix
                                       holds a character the fold cannot settle
  seed   --curated-dir DIR --db PATH --out FILE
                                       load every URL-reference sidecar into a
                                       fresh database at PATH through the curator
                                       seeder's own loader, and write one
                                       `media_id<TAB>tags` line per item to FILE
                                       (the loader prints its own progress)
  apply  --curated-dir DIR             rename every file the plan lists

It never writes outside the curated directory it is given, except the scratch
database `seed` is pointed at.
"""

import argparse
import re
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parent
SCHEMA = REPO_ROOT / "database" / "schema.sql"

SIDECAR = re.compile(r"^(?P<prefix>.+)_(?P<hash>[0-9a-f]{8})\.meta\.json$")
FOLDABLE = re.compile(r"^[a-z0-9_-]+$")


def fold(prefix: str) -> str:
    """The prefix by the slug rule: each run of other characters becomes one
    underscore, with none at either end."""
    return re.sub(r"[^a-z0-9]+", "_", prefix).strip("_")


def sidecar_dirs(curated: Path) -> list[Path]:
    sys.path.insert(0, str(SCRIPTS_DIR))
    from seed_fh_curator import URL_REF_SIDECAR_SUBDIRS  # noqa: E402
    return [curated / d for d in URL_REF_SIDECAR_SUBDIRS if (curated / d).is_dir()]


def plan(curated: Path) -> tuple[list[tuple[Path, Path]], list[str]]:
    renames: list[tuple[Path, Path]] = []
    problems: list[str] = []
    for d in sidecar_dirs(curated):
        names = {p.name for p in d.glob("*.meta.json")}
        targets: dict[str, str] = {}
        for name in sorted(names):
            m = SIDECAR.match(name)
            if not m:
                problems.append(f"{d.name}/{name}: not named <prefix>_<8 hex>.meta.json")
                continue
            prefix = m.group("prefix")
            if not FOLDABLE.match(prefix):
                problems.append(f"{d.name}/{name}: prefix holds a character the fold cannot settle")
                continue
            new_prefix = fold(prefix)
            if new_prefix == prefix:
                continue
            new_name = f"{new_prefix}_{m.group('hash')}.meta.json"
            if new_name in names:
                problems.append(f"{d.name}/{name}: target {new_name} already exists")
                continue
            if new_name in targets:
                problems.append(f"{d.name}/{name}: target {new_name} also comes from {targets[new_name]}")
                continue
            targets[new_name] = name
            renames.append((d / name, d / new_name))
    return renames, problems


def seed(curated: Path, db_path: Path) -> list[str]:
    sys.path.insert(0, str(SCRIPTS_DIR))
    import seed_fh_curator as seeder  # noqa: E402

    con = seeder.sqlite3.connect(str(db_path))
    try:
        con.executescript(SCHEMA.read_text(encoding="utf-8"))
        con.execute("PRAGMA foreign_keys = ON")
        ts = seeder.now_iso()
        fh_id = seeder.ensure_fh_member(con, ts)
        seeder.seed_freestyle_tricks_sidecars(con, fh_id, curated, ts)
        con.commit()
        rows = con.execute(
            """
            SELECT mi.id, group_concat(t.tag_normalized, ' ')
            FROM media_items mi
            JOIN media_tags mt ON mt.media_id = mi.id
            JOIN tags t ON t.id = mt.tag_id
            WHERE mi.uploader_member_id = ? AND mi.video_platform IN ('youtube', 'vimeo')
            GROUP BY mi.id
            ORDER BY mi.id
            """,
            (fh_id,),
        ).fetchall()
    finally:
        con.close()
    return [f"{mid}\t{' '.join(sorted(tags.split(' ')))}" for mid, tags in rows]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=("plan", "seed", "apply"))
    parser.add_argument("--curated-dir", required=True)
    parser.add_argument("--db")
    parser.add_argument("--out")
    args = parser.parse_args()
    curated = Path(args.curated_dir).resolve()
    if not curated.is_dir():
        print(f"no curated directory at {curated}", file=sys.stderr)
        return 2

    if args.command == "seed":
        if not args.db or not args.out:
            print("seed needs --db and --out", file=sys.stderr)
            return 2
        lines = seed(curated, Path(args.db))
        Path(args.out).write_text("".join(f"{line}\n" for line in lines), encoding="utf-8")
        return 0

    renames, problems = plan(curated)
    if problems:
        for p in problems:
            print(f"refused: {p}", file=sys.stderr)
        return 2
    if args.command == "plan":
        for old, new in renames:
            print(f"{old.relative_to(curated)}\t{new.relative_to(curated)}")
        return 0
    for old, new in renames:
        old.rename(new)
    print(f"renamed {len(renames)} file(s)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
