#!/usr/bin/env python3
"""Emit deterministic seed-URL lists for the footbag.org archive crawl.

The archive crawler discovers pages by following links outward from a few index
pages. Whole content classes are unreachable that way because the site's own
index queries hide them. The clubs directory is the clearest case: it lists only
clubs that are approved AND currently pass the validation filter, so an
unapproved club, or one whose owner let the periodic re-validation lapse, is
linked from no page and never crawled. A directory that filters on a moving
"validated recently enough" clock cannot be reproduced by re-deriving that same
filter; the reliable fix is to seed every club id straight from the frozen
database dump so the crawl captures them regardless of approval or validation
state.

This reads the committed per-app MySQL dumps through the ``footbag_legacy_repo``
symlink and writes one plain seed file per content class under
``legacy_data/legacy_mirror/mirror_seeds/`` (one absolute URL per line, sorted, de-duplicated).
It is read-only over the dumps and the platform database; the only writes are the
seed files it is asked to produce.

Run from anywhere:

    legacy_data/footbag_venv/bin/python legacy_data/legacy_mirror/scripts/build_archive_seed_lists.py
    legacy_data/footbag_venv/bin/python legacy_data/legacy_mirror/scripts/build_archive_seed_lists.py --dry-run
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
LEGACY_MIRROR = SCRIPT_DIR.parent
REPO_ROOT = LEGACY_MIRROR.parent.parent
# The legacy clone is symlinked at the repo root (gitignored), not under legacy_data/.
LEGACY_REPO = REPO_ROOT / "footbag_legacy_repo"
OUT_DIR = LEGACY_MIRROR / "mirror_seeds"

# The crawler addresses the live site by absolute URL (see its START_URLS), so
# the seed files carry absolute URLs in the same form.
BASE_URL = "http://www.footbag.org"


def _dump_path(app: str) -> Path:
    """Path to one app's latest MySQL dump, with an actionable error if absent."""
    path = LEGACY_REPO / app / "backups" / "latest.sql"
    if not path.exists():
        raise SystemExit(
            f"MISSING: {path}\n"
            f"The archive seed builder reads the frozen per-app MySQL dumps through the\n"
            f"'footbag_legacy_repo' symlink ({LEGACY_REPO}). Restore that symlink to the\n"
            f"legacy clone before running; this tool never contacts the live site."
        )
    return path


def _parse_tuple(text: str, i: int) -> tuple[list[str], int]:
    """Parse one ``(col, col, ...)`` MySQL VALUES tuple starting at ``text[i] == '('``.

    Returns the list of raw column strings (quotes removed, escapes resolved) and
    the index just past the closing paren. Handles backslash escapes and quoted
    commas, so a comma or paren inside a string value does not split the row.
    """
    assert text[i] == "(", f"expected '(' at {i}, got {text[i]!r}"
    i += 1
    cols: list[str] = []
    cur: list[str] = []
    in_str = False
    n = len(text)
    while i < n:
        c = text[i]
        if in_str:
            if c == "\\":
                cur.append(text[i + 1])
                i += 2
                continue
            if c == "'":
                in_str = False
                i += 1
                continue
            cur.append(c)
            i += 1
            continue
        if c == "'":
            in_str = True
            i += 1
            continue
        if c == ",":
            cols.append("".join(cur))
            cur = []
            i += 1
            continue
        if c == ")":
            cols.append("".join(cur))
            return cols, i + 1
        cur.append(c)
        i += 1
    raise ValueError("unterminated VALUES tuple in dump")


def iter_table_rows(dump_path: Path, table: str):
    """Yield each row (list of column strings) of ``table`` from a dump.

    Handles both dump styles: one ``INSERT`` per row, and one ``INSERT`` carrying
    many comma-separated tuples.
    """
    text = dump_path.read_text(encoding="latin-1")
    marker = f"INSERT INTO `{table}` VALUES "
    idx = 0
    n = len(text)
    while True:
        start = text.find(marker, idx)
        if start == -1:
            return
        i = start + len(marker)
        while i < n:
            row, i = _parse_tuple(text, i)
            yield row
            while i < n and text[i] in " \r\n":
                i += 1
            if i < n and text[i] == ",":
                i += 1
                while i < n and text[i] in " \r\n":
                    i += 1
                continue
            if i < n and text[i] == ";":
                i += 1
                break
            break
        idx = i


# Column positions in the `clubs` table (verified against the dump schema).
_CLUB_ID_COL = 1


def build_clubs() -> list[str]:
    """Seed URLs for every club show page.

    Every row in the clubs dump is a real, non-deleted club (deleted clubs are
    gone from the table, and the dump carries no test/placeholder names), so the
    seed is the whole table: the crawler's own dedup drops the ones already
    reached by link-following, leaving exactly the approval-hidden and
    validation-lapsed clubs it missed. The downstream club-candidate classifier
    makes the real / dormant / junk call after the crawl; the seed's only job is
    to make sure no legitimate club is skipped.
    """
    dump = _dump_path("clubs")
    ids: set[str] = set()
    for row in iter_table_rows(dump, "clubs"):
        club_id = row[_CLUB_ID_COL].strip()
        if club_id:
            ids.add(club_id)
    return sorted(f"{BASE_URL}/clubs/show/{cid}" for cid in ids)


# Column positions in the gallery `sets` table.
_SET_REAL_ID_COL = 0
_SET_VISIBLE_COL = 2


def build_gallery() -> list[str]:
    """Seed URLs for every index-hidden gallery set.

    A gallery set with ``SetVisible = 0`` is linked from no gallery index, so the
    crawl never reaches it, yet its set page is directly servable. Seeding the set
    page lets the crawler capture the set and follow its thumbnails to the member
    images, which reliably belong to their set through ``RealSetID`` (no image is
    orphaned by that key). This is the set-level analogue of the clubs seed: the
    crawler's dedup reconciles it against whatever a prior crawl already captured,
    so the fetch lands on exactly the hidden sets still missing. Images in visible
    sets are already in the link graph and are retried by the crawl itself, so
    they are not seeded here.
    """
    dump = _dump_path("gallery")
    real_set_ids: set[str] = set()
    for row in iter_table_rows(dump, "sets"):
        if row[_SET_VISIBLE_COL].strip() == "0":
            real_set_id = row[_SET_REAL_ID_COL].strip().lstrip("-")
            if real_set_id:
                real_set_ids.add(real_set_id)
    return [
        f"{BASE_URL}/gallery/showset/{sid}"
        for sid in sorted(real_set_ids, key=int)
    ]


def build_news() -> list[str]:
    """Seed URLs for every news permalink.

    The crawl captured the article text through the year-list pages, but not the
    per-item permalinks, which are linked from nowhere the crawl followed. The
    permalink is a stable deep-link worth preserving, so every news item gets one.
    """
    dump = _dump_path("news")
    ids: set[str] = set()
    for row in iter_table_rows(dump, "news"):
        news_id = row[0].strip().lstrip("-")
        if news_id:
            ids.add(news_id)
    return [f"{BASE_URL}/news/show/{nid}" for nid in sorted(ids, key=int)]


def build_polls() -> list[str]:
    """Seed URLs for every poll.

    The poll show page is served under the live ``newpoll`` path (not ``poll``)
    and looks a poll up by ``PollID`` with no visibility filter, so every poll is
    directly servable. The poll index links only a subset, so the crawl missed
    most of them; seeding all of them lets dedup keep whatever it already has.
    """
    dump = _dump_path("poll")
    # polls columns: 0 Approved, 1 PollID.
    ids: set[str] = set()
    for row in iter_table_rows(dump, "polls"):
        poll_id = row[1].strip().lstrip("-")
        if poll_id:
            ids.add(poll_id)
    return [f"{BASE_URL}/newpoll/show/{pid}" for pid in sorted(ids, key=int)]


def build_rules() -> list[str]:
    """Seed URLs for every rulebook chapter.

    A chapter page is served at ``/rules/chapter/<SectionBase>`` and returns every
    rule row sharing that section base. Seeding each distinct section base captures
    every chapter regardless of which ones a prior crawl reached.
    """
    dump = _dump_path("rules")
    # rulebook3 columns: 4 SectionBase.
    bases: set[str] = set()
    for row in iter_table_rows(dump, "rulebook3"):
        base = row[4].strip()
        if base:
            bases.add(base)
    return [f"{BASE_URL}/rules/chapter/{b}" for b in sorted(bases, key=int)]


def build_ranking() -> list[str]:
    """Seed URLs for every ranking report (archive capture only).

    The ranking report is an unofficial draft feature linked from no public index,
    which is why the crawl never reached it. Its show page reads the ranking set
    and method as request parameters, so the archival URL carries them as a query
    string: one report per (ranking set, ranking method). Per-event ranking detail
    pages are keyed by registration-event ids from another app and are left to the
    deferred rankings-migration decision.
    """
    dump = _dump_path("ranking")
    # rank_sets column 0 is the set id; rank_methods column 0 is the method id.
    set_ids = sorted(
        (row[0].strip() for row in iter_table_rows(dump, "rank_sets") if row[0].strip()),
        key=int,
    )
    method_ids = sorted(
        (row[0].strip() for row in iter_table_rows(dump, "rank_methods") if row[0].strip()),
        key=int,
    )
    return [
        f"{BASE_URL}/ranking/showranks?set={s}&method={m}"
        for s in set_ids
        for m in method_ids
    ]


def build_moves() -> list[str]:
    """Seed URLs for every move page.

    The moves dictionary's own index filters what it links, and a prior crawl
    captured a single move page out of the hundreds in the dump. The active
    moves data lives in the ``moves2`` app's dump (the ``moves`` app directory
    is retired and has no backups); its ``moves`` table id serves the move page
    directly, so the seed is the whole table and the crawler's dedup keeps
    whatever a prior crawl already reached.
    """
    dump = _dump_path("moves2")
    # moves columns: 0 MoveID.
    ids: set[str] = set()
    for row in iter_table_rows(dump, "moves"):
        move_id = row[0].strip()
        if move_id:
            ids.add(move_id)
    return [f"{BASE_URL}/moves/show/{mid}" for mid in sorted(ids, key=int)]


def build_faq() -> list[str]:
    """Seed URLs for every FAQ article and section list.

    The FAQ index links only what its section queries surface, and the mirror
    holds a handful of articles against the dump's full table. Articles serve at
    ``/faq/show/<ArticleID>`` and section lists at ``/faq/list?sid=<SectionID>``;
    both ids come straight from the dump.
    """
    dump = _dump_path("faq")
    # faq columns: 0 ArticleID; faqsections columns: 0 SectionID.
    article_ids: set[str] = set()
    for row in iter_table_rows(dump, "faq"):
        art = row[0].strip()
        if art:
            article_ids.add(art)
    section_ids: set[str] = set()
    for row in iter_table_rows(dump, "faqsections"):
        sid = row[0].strip()
        if sid:
            section_ids.add(sid)
    urls = [f"{BASE_URL}/faq/show/{a}" for a in sorted(article_ids, key=int)]
    urls += [f"{BASE_URL}/faq/list?sid={s}" for s in sorted(section_ids, key=int)]
    return urls


def build_events() -> list[str]:
    """Seed URLs for every non-deleted event page.

    The events calendar links only what its year and status queries surface;
    the dump's ``calendar`` table carries every event. Deleted rows are gone
    content and are skipped; approval state is irrelevant to capture (an
    unapproved event's show page still serves).
    """
    dump = _dump_path("events")
    # calendar columns: 0 Approved, 1 Deleted, 2 EventID.
    ids: set[str] = set()
    for row in iter_table_rows(dump, "calendar"):
        if row[1].strip() == "0":
            event_id = row[2].strip()
            if event_id:
                ids.add(event_id)
    return [f"{BASE_URL}/events/show/{eid}" for eid in sorted(ids, key=int)]


def build_members() -> list[str]:
    """Seed URLs for every valid member profile.

    Ruled: the archive is member-only, so member-gated profile pages are wanted
    content, and every valid (non-deleted) member profile is seeded; the crawler
    dedups against the thousands already captured by link-following, and the
    404/failed residual lands in the accepted-loss register with counts.
    Admin-only member views remain capture-forbidden in the crawler itself.
    """
    dump = _dump_path("members")
    # members columns: 0 MemberID, 1 MemberValid.
    ids: set[str] = set()
    for row in iter_table_rows(dump, "members"):
        if row[1].strip() == "1":
            member_id = row[0].strip()
            if member_id:
                ids.add(member_id)
    return [f"{BASE_URL}/members/profile/{mid}" for mid in sorted(ids, key=int)]


# Each entry: output filename -> builder. HoF/player photos are intentionally
# absent: their store has no dump, so they are not dump-seedable (see README).
# The WordPress vhost seeds are not dump-derivable either (that database lives
# on the vhost machine, outside the dump set); build_vhost_seed_lists.py
# enumerates them from the live wp-json API instead.
BUILDERS = {
    "clubs.txt": build_clubs,
    "gallery.txt": build_gallery,
    "news.txt": build_news,
    "polls.txt": build_polls,
    "rules.txt": build_rules,
    "ranking.txt": build_ranking,
    "moves.txt": build_moves,
    "faq.txt": build_faq,
    "events.txt": build_events,
    "members.txt": build_members,
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the per-class counts without writing any seed file.",
    )
    args = parser.parse_args()

    if not args.dry_run:
        OUT_DIR.mkdir(exist_ok=True)

    total = 0
    for filename, builder in BUILDERS.items():
        urls = builder()
        total += len(urls)
        if args.dry_run:
            print(f"{filename}: {len(urls)} URLs (dry-run, not written)")
            continue
        out_path = OUT_DIR / filename
        out_path.write_text("\n".join(urls) + "\n", encoding="utf-8")
        print(f"{filename}: {len(urls)} URLs -> {out_path}")

    print(f"total: {total} seed URLs across {len(BUILDERS)} class(es)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
