#!/usr/bin/env python3
"""Find mirror pages whose relative links point at files that do not exist.

Past crawls rewrote links to other footbag.org hosts into relative local paths
without ever fetching those hosts, baking silently broken links into the
captured HTML; ordinary failed downloads leave the same symptom. This scanner
walks every captured HTML file, resolves each relative href/src against the
file's own location, and reports the pages carrying at least one dangling
link. Its second output is the remediation input: a seed list of those pages'
URLs, written INSIDE the gitignored mirror directory (it is ephemeral run
state, not a committed seed class), to feed back to the crawler:

    python create_mirror_footbag_org.py <user> <pass> --seeds <mirror>/recrawl_broken_pages.txt

Re-crawling the affected pages with the fixed, host-aware crawler regenerates
their links through one rewrite pipeline: capturable targets become real
relative links, and links to never-crawled hosts resolve offline or are
removed with a marker.

Read-only over the page content; writes only its two report files into the
mirror directory. Pages whose on-disk location cannot be inverted to a URL
(the crawler's special-cased year/list mappings) are counted and listed, not
silently skipped.

Run from anywhere:

    legacy_data/footbag_venv/bin/python legacy_data/legacy_mirror/scripts/scan_mirror_broken_links.py
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from urllib.parse import unquote

SCRIPT_DIR = Path(__file__).resolve().parent
LEGACY_MIRROR = SCRIPT_DIR.parent
REPORT_NAME = "broken_link_scan.txt"
SEEDS_NAME = "recrawl_broken_pages.txt"
BASE_URL = "http://www.footbag.org"
VHOST_BASE = "http://sites.footbag.org"

_LINK_RE = re.compile(r"""(?:href|src)\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
_SKIP_PREFIXES = ("http://", "https://", "mailto:", "javascript:", "tel:",
                  "data:", "#", "webcal:", "ftp:")

# On-disk directories the crawler synthesizes from query parameters; their
# index.html paths do not invert to a fetchable URL by simple path joining.
_SPECIAL_DIR_RE = re.compile(
    r"(^|/)(list_\d{4}|past_year_\d{4}|results_year_\d{4}|ClubID_[^/]+|SID_[^/]+)(/|$)")


def _invert_to_url(html_file: Path, www_root: Path) -> str | None:
    """The page URL a captured file was fetched from, or None when the path is
    one of the crawler's query-derived special mappings. A capture under the
    reserved 'sites/<slug>/' prefix belongs to the WordPress vhost, so it
    inverts back to sites.footbag.org (a www '/sites/...' URL would be refused
    by the crawler's reserved-prefix guard and is the wrong host anyway)."""
    rel = html_file.relative_to(www_root).as_posix()
    if _SPECIAL_DIR_RE.search(rel):
        return None
    base = BASE_URL
    if rel == "sites" or rel.startswith("sites/"):
        base = VHOST_BASE
        rel = rel[len("sites/"):] if rel.startswith("sites/") else ""
    if rel == "" or rel == "index.html":
        return f"{base}/"
    if rel.endswith("/index.html"):
        return f"{base}/{rel[: -len('/index.html')]}/"
    return f"{base}/{rel}"


def scan(mirror_root: Path):
    www = mirror_root / "www.footbag.org"
    if not www.is_dir():
        raise SystemExit(
            f"MISSING: {www}\n"
            "Point --mirror at a mirror directory produced by "
            "create_mirror_footbag_org.py (default: legacy_data/legacy_mirror/mirror_footbag_org).")
    broken_pages: dict[Path, list[str]] = {}
    pages_scanned = 0
    for html_file in www.rglob("*.html"):
        pages_scanned += 1
        try:
            text = html_file.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        dangling: list[str] = []
        for match in _LINK_RE.finditer(text):
            link = match.group(1).strip()
            if not link or link.startswith(_SKIP_PREFIXES) or link.startswith("//"):
                continue
            target = link.split("#", 1)[0].split("?", 1)[0]
            if not target:
                continue
            resolved = (html_file.parent / unquote(target)).resolve()
            if not resolved.exists():
                dangling.append(link)
        if dangling:
            broken_pages[html_file] = dangling
    return pages_scanned, broken_pages


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mirror", default=str(LEGACY_MIRROR / "mirror_footbag_org"),
        help="Mirror directory to scan (default: the canonical local mirror).")
    parser.add_argument(
        "--max-examples", type=int, default=5,
        help="Dangling links listed per page in the report (default 5).")
    args = parser.parse_args()

    mirror_root = Path(args.mirror)
    www = mirror_root / "www.footbag.org"
    pages_scanned, broken_pages = scan(mirror_root)

    seeds: set[str] = set()
    uninvertible: list[str] = []
    lines = [f"# Broken-relative-link scan of {mirror_root}",
             f"pages scanned: {pages_scanned}",
             f"pages with dangling relative links: {len(broken_pages)}"]
    total_dangling = 0
    for html_file in sorted(broken_pages):
        dangling = broken_pages[html_file]
        total_dangling += len(dangling)
        rel = html_file.relative_to(mirror_root)
        examples = "; ".join(dangling[: args.max_examples])
        more = f" (+{len(dangling) - args.max_examples} more)" if len(dangling) > args.max_examples else ""
        lines.append(f"  {rel}  [{len(dangling)} dangling] {examples}{more}")
        url = _invert_to_url(html_file, www)
        if url:
            seeds.add(url)
        else:
            uninvertible.append(str(rel))
    lines.append(f"total dangling links: {total_dangling}")
    if uninvertible:
        lines.append(f"pages not URL-invertible (query-derived mappings; re-captured "
                     f"by the crawl's own handlers): {len(uninvertible)}")
        lines.extend(f"  {p}" for p in uninvertible)

    report = "\n".join(lines)
    print(report)
    (mirror_root / REPORT_NAME).write_text(report + "\n", encoding="utf-8")
    seeds_path = mirror_root / SEEDS_NAME
    seeds_path.write_text("\n".join(sorted(seeds)) + ("\n" if seeds else ""), encoding="utf-8")
    print(f"\nreport: {mirror_root / REPORT_NAME}")
    print(f"re-crawl seed list ({len(seeds)} pages): {seeds_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
