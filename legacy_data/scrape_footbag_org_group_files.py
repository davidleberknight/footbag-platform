#!/usr/bin/env python3
"""Opt-in live crawl of files uploaded to footbag.org IFPA member groups.

Logs into footbag.org with member credentials, then walks a range of file
IDs fetching:

  - /groups/showfile/<id>  — the page describing one uploaded file, which
                              links to the file itself

For each file ID it downloads the linked file's bytes to disk and writes one
metadata CSV row per file: which group it belongs to, who uploaded it and
when, the description text, and where the file was saved locally. A file ID
that 404s, redirects to a "no such file" page, or requires access the
logged-in account doesn't have is recorded as skipped and the crawl
continues.

Scope and guarantees:

  - Read-only against footbag.org. Never posts, edits, or deletes anything on
    the live site; only GETs the showfile page and the linked file per ID.
  - Opt-in. NOT wired into run_pipeline.sh or any other pipeline mode; run it
    explicitly.
  - Credentials are never accepted as command-line arguments (they would land
    in shell history and be visible to any local user via `ps`). Pass
    --username or let it prompt; the password always comes from an
    interactive getpass prompt.
  - The page parser was derived from one real showfile page (see the file
    header comment in this script's originating conversation): a paragraph
    reading "The following file was uploaded to the working area for the
    group <a href=/groups/list/ID>Name</a> by <uploader> on <date>." followed
    by a bgcolor=#e0e0e0 table whose first cell links to the file and second
    cell holds the description. Only one showfile page was available to
    verify this against, so treat it as best-effort: run with
    --metadata-only first, or --dump-html on a few IDs spanning different
    groups, before trusting a full crawl. The "missing file" detector is a
    similar best-effort guess (the exact wording for an invalid ID was not
    available to verify).
"""
from __future__ import annotations

import argparse
import csv
import getpass
import logging
import re
import shutil
import sys
import time
from pathlib import Path
from urllib.parse import unquote, urljoin, quote

import requests
from bs4 import BeautifulSoup

BASE_URL = "http://www.footbag.org"
LOGIN_URL = BASE_URL + "/members/home"
DELAY_SECONDS = 0.5  # polite delay between requests to the live site

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("scrape_footbag_org_group_files")


def get(session: requests.Session, url: str, timeout: int = 15) -> requests.Response:
    """GET a footbag.org page with encoding forced to match the site's declared charset.

    The site declares CHARSET=iso-8859-1 via an in-body <meta> tag rather than
    an HTTP Content-Type charset param, so requests' own guess is unreliable
    and silently mangles accented names. Every parsed (HTML) GET goes through
    this wrapper; binary file downloads do not, since .encoding only affects
    .text and never touches .content.
    """
    resp = session.get(url, timeout=timeout)
    resp.encoding = "iso-8859-1"
    return resp


class SessionExpiredError(RuntimeError):
    """Raised when a page fetched mid-crawl turns out to be the sign-in page.

    footbag.org silently drops the session (instead of returning an error) when
    the logged-in account loses access mid-crawl, so a fetch that should return
    file metadata can come back as the login form instead. Left undetected,
    the result would be the login form harvested as if it were file metadata
    for every remaining ID in the crawl range.
    """


def looks_like_signin_page(soup: BeautifulSoup) -> bool:
    title = soup.find("title")
    title_text = title.get_text(strip=True).lower() if title else ""
    return bool(soup.find("form", {"name": "loginform"})) or "member sign-in" in title_text


def login(session: requests.Session, username: str, password: str) -> None:
    init_resp = session.get(BASE_URL + "/members/", timeout=10)
    init_resp.raise_for_status()

    payload = {
        "MemberID": username.split("@")[0],  # alias part only, matches the site's login form
        "MemberPassword": password,
        "login_retry": "1",
    }
    login_resp = session.post(LOGIN_URL, data=payload, timeout=15, allow_redirects=True)
    login_resp.raise_for_status()

    verify_resp = get(session, LOGIN_URL, timeout=10)
    verify_resp.raise_for_status()
    soup = BeautifulSoup(verify_resp.text, "html.parser")
    if looks_like_signin_page(soup):
        raise RuntimeError("Login failed — still seeing the sign-in page.")
    log.info("Login successful")


def looks_like_missing_file(soup: BeautifulSoup) -> bool:
    text = soup.get_text(" ", strip=True).lower()
    return any(
        phrase in text
        for phrase in ("no such file", "file not found", "does not exist", "invalid file")
    )


def _require_still_logged_in(soup: BeautifulSoup, file_id: int) -> None:
    if looks_like_signin_page(soup):
        raise SessionExpiredError(
            f"file {file_id}: session appears logged out (saw the sign-in page while fetching showfile)"
        )


_UPLOAD_SENTENCE_RE = re.compile(
    r"uploaded\s+to\s+the\s+working\s+area\s+for\s+the\s+group\s+(.+?)\s+by\s+(.+?)\s+on\s+([^.]+)\.",
    re.IGNORECASE,
)
_GROUP_LINK_RE = re.compile(r"^/groups/list/(\d+)$")


def parse_showfile_page(file_id: int, soup: BeautifulSoup) -> dict | None:
    """Best-effort extraction of a showfile page's metadata and file link.

    Returns None if the shared-file table (bgcolor=#e0e0e0, file link in the
    first cell, description in the second) isn't found — treated the same as
    a missing/inaccessible file by the caller.
    """
    group_link = soup.find("a", href=_GROUP_LINK_RE)
    group_id = ""
    group_name = ""
    if group_link is not None:
        match = _GROUP_LINK_RE.match(group_link["href"])
        group_id = match.group(1) if match else ""
        group_name = group_link.get_text(strip=True)

    uploader_name, uploaded_date = "", ""
    upload_match = _UPLOAD_SENTENCE_RE.search(soup.get_text(" ", strip=True))
    if upload_match:
        uploader_name, uploaded_date = upload_match.group(2), upload_match.group(3)

    file_table = soup.find("table", attrs={"bgcolor": re.compile("^#?e0e0e0$", re.I)})
    if file_table is None:
        return None
    cells = file_table.find_all("td")
    if not cells:
        return None
    file_link = cells[0].find("a", href=True)
    if file_link is None:
        return None
    description = cells[1].get_text(strip=True) if len(cells) > 1 else ""

    return {
        "file_id": file_id,
        "file_href": file_link["href"],
        "link_text": file_link.get_text(strip=True),
        "description": description,
        "group_id": group_id,
        "group_name": group_name,
        "uploader_name": uploader_name,
        "uploaded_date": uploaded_date,
    }


_UNSAFE_FILENAME_CHARS_RE = re.compile(r'[\\/:*?"<>|]')


def local_filename(file_id: int, original_filename: str) -> str:
    """Builds a filesystem-safe local filename, prefixed with file_id to avoid collisions."""
    safe_name = _UNSAFE_FILENAME_CHARS_RE.sub("_", original_filename) or f"file_{file_id}"
    return f"{file_id:04d}_{safe_name}"


def fetch_file_metadata(session: requests.Session, file_id: int) -> tuple[dict | None, str | None]:
    """Returns (row_or_None, skip_reason_or_None). Does not download the file itself."""
    resp = get(session, f"{BASE_URL}/groups/showfile/{file_id}")
    if resp.status_code == 404:
        return None, "showfile 404"
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    _require_still_logged_in(soup, file_id)
    if looks_like_missing_file(soup):
        return None, "no such file"

    parsed = parse_showfile_page(file_id, soup)
    if parsed is None:
        return None, "shared-file table not found"

    title = soup.find("title")
    parsed["page_url"] = resp.url
    parsed["page_title"] = title.get_text(strip=True) if title else ""
    original_filename = unquote(parsed["file_href"].rstrip("/").rsplit("/", 1)[-1])
    parsed["original_filename"] = original_filename
    parsed["file_url"] = urljoin(BASE_URL, quote(parsed["file_href"], safe="/:%"))
    parsed["content_length"] = fetch_content_length(session, parsed["file_url"])

    return parsed, None


def fetch_content_length(session: requests.Session, file_url: str, timeout: int = 15) -> str:
    """Best-effort file size in bytes via HEAD, without downloading the body.

    Falls back to a streamed GET closed immediately after the headers arrive,
    in case the server doesn't support HEAD on this path. Returns "" if
    neither reports a Content-Length (server omitted it, or both requests
    failed) — the caller should not assume "" means empty.
    """
    try:
        resp = session.head(file_url, timeout=timeout, allow_redirects=True)
        length = resp.headers.get("Content-Length")
        if length is not None:
            return length
    except requests.RequestException:
        pass

    try:
        with session.get(file_url, timeout=timeout, stream=True) as resp:
            return resp.headers.get("Content-Length", "")
    except requests.RequestException:
        return ""


def free_disk_bytes(path: Path) -> int:
    return shutil.disk_usage(path).free


def download_file(session: requests.Session, file_url: str, dest_path: Path, timeout: int = 60) -> int:
    """Streams the file to dest_path; returns the byte count written."""
    with session.get(file_url, timeout=timeout, stream=True) as resp:
        resp.raise_for_status()
        total = 0
        with dest_path.open("wb") as fh:
            for chunk in resp.iter_content(chunk_size=65536):
                fh.write(chunk)
                total += len(chunk)
    return total


def write_metadata_csv(path: Path, rows: list[dict]) -> None:
    fieldnames = [
        "file_id", "page_url", "page_title", "group_id", "group_name",
        "uploader_name", "uploaded_date", "description", "original_filename",
        "file_url", "content_length", "local_path",
    ]
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--start", type=int, default=1, help="First file ID to crawl (default: 1)")
    parser.add_argument("--end", type=int, default=445, help="Last file ID to crawl, inclusive (default: 445)")
    parser.add_argument("--username", default=None, help="footbag.org username/email; prompted if omitted")
    parser.add_argument("--out", type=Path, default=Path("group_files.csv"))
    parser.add_argument("--files-dir", type=Path, default=Path("group_files"), help="Directory to save downloaded files into")
    parser.add_argument(
        "--metadata-only", action="store_true",
        help="Parse and record each showfile page without downloading the linked file. "
             "Use this to sanity-check the parser, and see the total content_length across "
             "a range, before downloading everything.",
    )
    parser.add_argument(
        "--min-free-mb", type=int, default=200,
        help="Stop the crawl (without downloading further files) if free disk space on "
             "--files-dir would drop below this many MB. Default: 200.",
    )
    parser.add_argument(
        "--dump-html", type=int, default=None, metavar="FILE_ID",
        help="Fetch the raw showfile page for one file ID, save it as debug_showfile_<id>.html, "
             "then exit (no crawl). Use this to inspect real markup before trusting the parser.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    username = args.username or input("footbag.org username/email: ")
    password = getpass.getpass("footbag.org password: ")

    session = requests.Session()
    session.headers.update({"User-Agent": "FootbagGroupFilesScrape/1.0 (IFPA internal use)"})
    login(session, username, password)

    if args.dump_html is not None:
        file_id = args.dump_html
        resp = get(session, f"{BASE_URL}/groups/showfile/{file_id}")
        out_path = Path(f"debug_showfile_{file_id}.html")
        out_path.write_text(resp.text, encoding="utf-8")
        log.info("file %d: saved showfile (status %d) -> %s", file_id, resp.status_code, out_path)
        return 0

    if not args.metadata_only:
        args.files_dir.mkdir(parents=True, exist_ok=True)

    result_rows: list[dict] = []
    skipped: list[tuple[int, str]] = []

    for file_id in range(args.start, args.end + 1):
        try:
            row, skip_reason = fetch_file_metadata(session, file_id)
        except requests.RequestException as e:
            skipped.append((file_id, f"fetch failed: {e}"))
            log.warning("file %d: fetch failed: %s", file_id, e)
            time.sleep(DELAY_SECONDS)
            continue
        except SessionExpiredError as e:
            log.error(
                "%s — stopping crawl early rather than harvesting login-page data as file metadata. "
                "Log back in and rerun with --start %d to resume.",
                e, file_id,
            )
            break

        if skip_reason:
            skipped.append((file_id, skip_reason))
            log.info("file %d: skipped (%s)", file_id, skip_reason)
            time.sleep(DELAY_SECONDS)
            continue

        row["local_path"] = ""
        if not args.metadata_only:
            min_free_bytes = args.min_free_mb * 1024 * 1024
            needed_bytes = int(row["content_length"]) if row["content_length"].isdigit() else 0
            free_bytes = free_disk_bytes(args.files_dir)
            if free_bytes - needed_bytes < min_free_bytes:
                log.error(
                    "file %d: only %.1f MB free on %s (need ~%.1f MB for this file plus a "
                    "%d MB buffer) — stopping crawl rather than risk filling the disk. "
                    "Free up space and rerun with --start %d to resume.",
                    file_id, free_bytes / 1024**2, args.files_dir, needed_bytes / 1024**2,
                    args.min_free_mb, file_id,
                )
                break

            time.sleep(DELAY_SECONDS)
            dest_path = args.files_dir / local_filename(file_id, row["original_filename"])
            try:
                size = download_file(session, row["file_url"], dest_path)
                row["local_path"] = str(dest_path)
                log.info("file %d: downloaded %r (%d bytes) -> %s", file_id, row["original_filename"], size, dest_path)
            except requests.RequestException as e:
                skipped.append((file_id, f"download failed: {e}"))
                log.warning("file %d: download failed: %s", file_id, e)
                time.sleep(DELAY_SECONDS)
                continue
        else:
            log.info(
                "file %d: %r (metadata only, content_length=%s)",
                file_id, row["original_filename"], row["content_length"] or "unknown",
            )

        result_rows.append(row)
        time.sleep(DELAY_SECONDS)

    write_metadata_csv(args.out, result_rows)

    known_sizes = [int(r["content_length"]) for r in result_rows if r["content_length"].isdigit()]
    unknown_count = len(result_rows) - len(known_sizes)
    total_mb = sum(known_sizes) / 1024**2

    log.info(
        "Done: %d file(s) captured, %d skipped. Wrote %s%s",
        len(result_rows), len(skipped), args.out,
        "" if args.metadata_only else f" and saved files under {args.files_dir}",
    )
    log.info(
        "Total size of %d file(s) with a known content_length: %.1f MB (%d file(s) had no reported size)",
        len(known_sizes), total_mb, unknown_count,
    )
    if skipped:
        log.info("Skipped IDs: %s", ", ".join(f"{fid} ({reason})" for fid, reason in skipped))

    return 0


if __name__ == "__main__":
    sys.exit(main())
