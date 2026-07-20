#!/usr/bin/env python3
"""Emit seed-URL lists for the WordPress vhost (sites.footbag.org) sites.

The vhost's WordPress database lives on the vhost machine and is not part of
the per-app dump set, so these seeds cannot be dump-derived like the ones from
build_archive_seed_lists.py. WordPress's own REST API enumerates every page and
post URL instead: ``/wp-json/wp/v2/pages?per_page=100&_fields=link`` (and the
same for ``posts``), paginated via the ``X-WP-TotalPages`` response header.
wp-json itself is never archived (the crawler refuses it as non-content); it is
used here offline-of-the-crawl purely to build the lists.

Writes one file per site under ``legacy_data/mirror_seeds/``
(``vhost_<site>.txt``; the vhost root site is ``vhost_root.txt``), one absolute
URL per line, sorted, de-duplicated. Read-only over the live site: a handful of
paginated GETs per site, politely spaced.

Run from anywhere:

    legacy_data/.venv/bin/python legacy_data/scripts/build_vhost_seed_lists.py
    legacy_data/.venv/bin/python legacy_data/scripts/build_vhost_seed_lists.py --dry-run
    legacy_data/.venv/bin/python legacy_data/scripts/build_vhost_seed_lists.py --sites worlds2018 reference
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import requests

SCRIPT_DIR = Path(__file__).resolve().parent
LEGACY_DATA = SCRIPT_DIR.parent
OUT_DIR = LEGACY_DATA / "mirror_seeds"

VHOST = "sites.footbag.org"
VHOST_BASE = f"http://{VHOST}"  # the vhost refuses HTTPS; plain HTTP only

# Every live site on the multisite vhost, verified by probe (HTTP 200 on the
# site root). The empty slug is the root site itself (its own pages, e.g. the
# usage-information page). A slug that stops resolving is a one-line warning,
# not a failure, so a retired site never blocks the others.
DEFAULT_SITES = [
    "",  # root site
    "worlds2011", "worlds2012", "worlds2013", "worlds2014",
    "worlds2015", "worlds2016", "worlds2017", "worlds2018",
    "reference",
]

DELAY_SECONDS = 0.25
PER_PAGE = 100  # wp-json caps per_page at 100


# Fallback link extraction for a response whose body is not valid JSON: the
# multisite's aged WordPress ignores _fields on some sites and can emit
# rendered-content escapes that break strict JSON parsing. The link values
# themselves are clean, so pull them straight out of the raw text.
_LINK_RE = re.compile(r'"link"\s*:\s*"((?:[^"\\]|\\.)*)"')


def _links_from_body(text: str) -> list[str]:
    try:
        return [item.get("link") for item in json.loads(text) if item.get("link")]
    except (json.JSONDecodeError, AttributeError, TypeError):
        links = [m.group(1).replace("\\/", "/") for m in _LINK_RE.finditer(text)]
        if links:
            return links
        raise


def _fetch_links(site: str, kind: str) -> list[str]:
    """Every content URL of one kind ('pages' or 'posts') for one site."""
    prefix = f"{VHOST_BASE}/{site}" if site else VHOST_BASE
    links: list[str] = []
    page = 1
    total_pages = 1
    while page <= total_pages:
        url = f"{prefix}/wp-json/wp/v2/{kind}?per_page={PER_PAGE}&_fields=link&page={page}"
        resp = requests.get(url, timeout=20,
                            headers={"User-Agent": "FootbagMirror/1.0 (seed-list build)"})
        resp.raise_for_status()
        total_pages = int(resp.headers.get("X-WP-TotalPages", "1") or "1")
        links.extend(_links_from_body(resp.text))
        page += 1
        time.sleep(DELAY_SECONDS)
    return links


def _canonicalize(link: str) -> str | None:
    """Keep the host the site itself declares (a cross-published site's REST
    links carry www.footbag.org — those pages serve there and are seeded there,
    which is exactly the store-once ruling); force plain HTTP; drop anything
    outside the two footbag web hosts."""
    p = urlparse(link)
    if p.netloc not in (VHOST, "www.footbag.org"):
        return None
    return urlunparse(p._replace(scheme="http", query="", fragment=""))


def build_site(site: str) -> tuple[list[str], dict[str, int]]:
    """The site's seed URLs plus a per-host count (cross-published evidence)."""
    urls: set[str] = set()
    by_host: dict[str, int] = {}
    for kind in ("pages", "posts"):
        for link in _fetch_links(site, kind):
            canonical = _canonicalize(link)
            if canonical:
                urls.add(canonical)
                host = urlparse(canonical).netloc
                by_host[host] = by_host.get(host, 0) + 1
    # The site root is always seeded, so the crawler enters the site and
    # link-follows its menus even when the REST enumeration is broken or
    # incomplete on this aged install.
    root = f"{VHOST_BASE}/{site}/" if site else f"{VHOST_BASE}/"
    urls.add(root)
    return sorted(urls), by_host


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sites", nargs="+", metavar="SLUG", default=None,
        help="Site slugs to enumerate (default: every verified live site; "
             "use 'root' for the vhost root site).")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print the per-site counts without writing any seed file.")
    args = parser.parse_args()

    sites = DEFAULT_SITES if args.sites is None else \
        ["" if s == "root" else s for s in args.sites]

    if not args.dry_run:
        OUT_DIR.mkdir(exist_ok=True)

    total = 0
    degraded = 0
    for site in sites:
        label = site or "root"
        try:
            urls, by_host = build_site(site)
            note = " ".join(f"[{h}: {n}]" for h, n in sorted(by_host.items()))
        except (requests.RequestException, ValueError) as e:
            # REST enumeration failed outright (broken plugin output, retired
            # site). The site root still gets seeded so the crawler enters and
            # link-follows the site; the enumeration gap is visible here.
            degraded += 1
            urls = [f"{VHOST_BASE}/{site}/" if site else f"{VHOST_BASE}/"]
            note = f"[REST enumeration failed: {e}; seeding site root only]"
        total += len(urls)
        if args.dry_run:
            print(f"vhost_{label}.txt: {len(urls)} URLs (dry-run, not written) {note}")
            continue
        out_path = OUT_DIR / f"vhost_{label}.txt"
        out_path.write_text("\n".join(urls) + "\n", encoding="utf-8")
        print(f"vhost_{label}.txt: {len(urls)} URLs -> {out_path} {note}")

    print(f"total: {total} vhost seed URLs across {len(sites)} site(s), "
          f"{degraded} with root-only fallback")
    return 0


if __name__ == "__main__":
    sys.exit(main())
