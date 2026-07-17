#!/usr/bin/env python3
"""Opt-in live crawl of footbag.org IFPA vote results.

Logs into footbag.org with member credentials, then walks a range of vote
IDs fetching:

  - /ifpa/showresults/<id>  — the results page for one vote

Writes two CSVs:

  - vote_results.csv — one row per vote ID: title, initiator, status/deadline/
    total-members-voting, the intro/proposal text, a best-effort structured
    tally summary, and the full raw visible page text (a lossless fallback in
    case a vote page doesn't match the parsed shape).
  - vote_result_options.csv — one row per (vote, option) tally, e.g. one row
    for "Yes: 35" and one for "No: 0" on a yes/no vote, or one row per
    candidate under each elected position on a multi-race ballot.

A vote ID that 404s, redirects to a "no such vote" page, or requires access
the logged-in account doesn't have is recorded as skipped and the crawl
continues.

Scope and guarantees:

  - Read-only against footbag.org. Never posts, edits, or deletes anything on
    the live site; only GETs the showresults page per vote ID.
  - Opt-in. NOT wired into run_pipeline.sh or any other pipeline mode; run it
    explicitly.
  - Credentials are never accepted as command-line arguments (they would land
    in shell history and be visible to any local user via `ps`). Pass
    --username or let it prompt; the password always comes from an
    interactive getpass prompt.
  - The "missing vote" detector is best-effort: the exact wording footbag.org
    uses for an invalid/missing vote ID was not available to verify while
    writing this script. Use --dump-html on a known-missing ID and a
    known-good ID to check the real markup before trusting a full crawl, and
    adjust `looks_like_missing_vote` if it misclassifies.
  - The structured fields (status table, initiator, tally rows) were derived
    from two real showresults pages (a yes/no membership vote and a
    multi-position election) and assume that shape: a Status/Deadline/Total
    Members Voting table, an "initiated on <date> by <a href=/members/profile/
    ...>" sentence, and result lines shaped exactly like
    "<u>Option Name</u>: <count>", with the nearest preceding <b> tag as that
    tally's heading. If a vote page departs from this shape the structured
    columns may come back blank or incomplete, but `text` always has the full
    page content, so nothing is lost — check `text` (or --dump-html) for
    votes where the structured fields look wrong.
"""
from __future__ import annotations

import argparse
import csv
import getpass
import logging
import re
import sys
import time
from pathlib import Path

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
log = logging.getLogger("scrape_footbag_org_vote_results")


def get(session: requests.Session, url: str, timeout: int = 15) -> requests.Response:
    """GET a footbag.org page with encoding forced to match the site's declared charset.

    The site declares CHARSET=iso-8859-1 via an in-body <meta> tag rather than
    an HTTP Content-Type charset param, so requests' own guess is unreliable
    and silently mangles accented names. Every parsed GET goes through this
    wrapper instead of a bare session.get.
    """
    resp = session.get(url, timeout=timeout)
    resp.encoding = "iso-8859-1"
    return resp


class SessionExpiredError(RuntimeError):
    """Raised when a page fetched mid-crawl turns out to be the sign-in page.

    footbag.org silently drops the session (instead of returning an error) when
    the logged-in account loses access mid-crawl, so a fetch that should return
    vote results can come back as the login form instead. Left undetected, the
    result would be the login form's text harvested as if it were vote results
    for every remaining vote in the crawl range.
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


def looks_like_missing_vote(soup: BeautifulSoup) -> bool:
    text = soup.get_text(" ", strip=True).lower()
    return any(
        phrase in text
        for phrase in ("no such vote", "vote not found", "does not exist", "invalid vote")
    )


def _require_still_logged_in(soup: BeautifulSoup, vote_id: int) -> None:
    if looks_like_signin_page(soup):
        raise SessionExpiredError(
            f"vote {vote_id}: session appears logged out (saw the sign-in page while fetching showresults)"
        )


_INITIATED_DATE_RE = re.compile(r"initiated on\s+(.+?)\s+by", re.IGNORECASE)


def parse_status_table(main_body) -> tuple[dict, "BeautifulSoup | None"]:
    """Finds the Status/Deadline/Total Members Voting table.

    Returns (fields, table) so the caller can locate the results table that
    follows it; table is None if no such table was found.
    """
    for table in main_body.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue
        header_cells = rows[0].find_all("td")
        headers = [c.get_text(strip=True).rstrip(":").lower() for c in header_cells]
        if headers[:1] != ["status"]:
            continue
        values = [c.get_text(strip=True) for c in rows[1].find_all("td")]
        fields = dict(zip(headers, values))
        return {
            "status": fields.get("status", ""),
            "deadline": fields.get("deadline", ""),
            "total_members_voting": fields.get("total members voting", ""),
        }, table
    return {"status": "", "deadline": "", "total_members_voting": ""}, None


def parse_initiator(main_body) -> tuple[str, str, str]:
    """Returns (initiated_date, initiator_name, initiator_profile_id), best-effort.

    The initiator is the only /members/profile/<id> link in the page body on
    both sample pages seen; the date comes from the "initiated on <date> by"
    sentence next to it.
    """
    link = main_body.find("a", href=lambda h: h and "/members/profile/" in h)
    name = link.get_text(strip=True) if link else ""
    profile_id = link["href"].rstrip("/").rsplit("/", 1)[-1] if link else ""

    match = _INITIATED_DATE_RE.search(main_body.get_text(" ", strip=True))
    initiated_date = match.group(1).strip() if match else ""

    return initiated_date, name, profile_id


def find_results_table(main_body, status_table) -> "BeautifulSoup | None":
    """Returns the table right after the status table in document order, if any."""
    if status_table is None:
        return None
    tables = main_body.find_all("table")
    try:
        idx = tables.index(status_table)
    except ValueError:
        return None
    return tables[idx + 1] if idx + 1 < len(tables) else None


_TALLY_COUNT_RE = re.compile(r"^\s*:\s*(\d+)")


def parse_results_table(vote_id: int, results_table) -> tuple[str, list[dict]]:
    """Returns (intro_text, tally_rows) from the results table's content cell.

    Walks the cell's contents in document order: the most recent <b> tag text
    becomes the "position" heading for any <u>Option</u>: <count> tally lines
    that follow it (a plain yes/no question is its own heading; a
    multi-position election has one heading per elected position). Free text
    before the first <b> tag is the intro/proposal text. This only recognizes
    the exact "<u>...</u>: <count>" shape seen in the two sample pages;
    anything else is silently left out of tally_rows (still present in the
    row's full `text` field).
    """
    if results_table is None:
        return "", []

    td = results_table.find("td")
    if td is None:
        return "", []

    intro_parts: list[str] = []
    tally_rows: list[dict] = []
    current_heading = ""
    seen_heading = False

    for el in td.descendants:
        name = getattr(el, "name", None)
        if name == "b":
            current_heading = el.get_text(strip=True)
            seen_heading = True
        elif name == "u":
            option = el.get_text(strip=True)
            sibling = el.next_sibling
            count = ""
            if isinstance(sibling, str):
                count_match = _TALLY_COUNT_RE.match(sibling)
                if count_match:
                    count = count_match.group(1)
            if option:
                tally_rows.append({
                    "vote_id": vote_id,
                    "position": current_heading,
                    "option": option,
                    "count": count,
                })
        elif isinstance(el, str) and not seen_heading:
            text = el.strip()
            if text:
                intro_parts.append(text)

    return " ".join(intro_parts), tally_rows


def fetch_vote_result(session: requests.Session, vote_id: int) -> tuple[dict | None, list[dict], str | None]:
    """Returns (row_or_None, tally_rows, skip_reason_or_None)."""
    resp = get(session, f"{BASE_URL}/ifpa/showresults/{vote_id}")
    if resp.status_code == 404:
        return None, [], "showresults 404"
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    _require_still_logged_in(soup, vote_id)
    if looks_like_missing_vote(soup):
        return None, [], "no such vote"

    title = soup.find("title")
    title_text = title.get_text(strip=True) if title else ""
    text = soup.get_text("\n", strip=True)

    main_body = soup.find("div", id="MainBody") or soup
    status_fields, status_table = parse_status_table(main_body)
    initiated_date, initiator_name, initiator_profile_id = parse_initiator(main_body)
    results_table = find_results_table(main_body, status_table)
    intro_text, tally_rows = parse_results_table(vote_id, results_table)

    row = {
        "vote_id": vote_id,
        "url": resp.url,
        "page_title": title_text,
        "initiated_date": initiated_date,
        "initiator_name": initiator_name,
        "initiator_profile_id": initiator_profile_id,
        "status": status_fields["status"],
        "deadline": status_fields["deadline"],
        "total_members_voting": status_fields["total_members_voting"],
        "intro_text": intro_text,
        "text": text,
    }
    return row, tally_rows, None


def write_results_csv(path: Path, rows: list[dict]) -> None:
    fieldnames = [
        "vote_id", "url", "page_title", "initiated_date", "initiator_name",
        "initiator_profile_id", "status", "deadline", "total_members_voting",
        "intro_text", "text",
    ]
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_options_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["vote_id", "position", "option", "count"])
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--start", type=int, default=1, help="First vote ID to crawl (default: 1)")
    parser.add_argument("--end", type=int, default=190, help="Last vote ID to crawl, inclusive (default: 190)")
    parser.add_argument("--username", default=None, help="footbag.org username/email; prompted if omitted")
    parser.add_argument("--out", type=Path, default=Path("vote_results.csv"))
    parser.add_argument("--options-out", type=Path, default=Path("vote_result_options.csv"))
    parser.add_argument(
        "--dump-html", type=int, default=None, metavar="VOTE_ID",
        help="Fetch the raw showresults page for one vote ID, save it as debug_showresults_<id>.html, "
             "then exit (no crawl). Use this to inspect real markup before trusting the missing-vote detector.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    username = args.username or input("footbag.org username/email: ")
    password = getpass.getpass("footbag.org password: ")

    session = requests.Session()
    session.headers.update({"User-Agent": "FootbagVoteResultsScrape/1.0 (IFPA internal use)"})
    login(session, username, password)

    if args.dump_html is not None:
        vote_id = args.dump_html
        resp = get(session, f"{BASE_URL}/ifpa/showresults/{vote_id}")
        out_path = Path(f"debug_showresults_{vote_id}.html")
        out_path.write_text(resp.text, encoding="utf-8")
        log.info("vote %d: saved showresults (status %d) -> %s", vote_id, resp.status_code, out_path)
        return 0

    result_rows: list[dict] = []
    option_rows: list[dict] = []
    skipped: list[tuple[int, str]] = []

    for vote_id in range(args.start, args.end + 1):
        try:
            row, tally_rows, skip_reason = fetch_vote_result(session, vote_id)
        except requests.RequestException as e:
            skipped.append((vote_id, f"fetch failed: {e}"))
            log.warning("vote %d: fetch failed: %s", vote_id, e)
            time.sleep(DELAY_SECONDS)
            continue
        except SessionExpiredError as e:
            log.error(
                "%s — stopping crawl early rather than harvesting login-page text as vote results. "
                "Log back in and rerun with --start %d to resume.",
                e, vote_id,
            )
            break

        if skip_reason:
            skipped.append((vote_id, skip_reason))
            log.info("vote %d: skipped (%s)", vote_id, skip_reason)
        else:
            result_rows.append(row)
            option_rows.extend(tally_rows)
            log.info("vote %d: %r, %d tally row(s)", vote_id, row["page_title"], len(tally_rows))

        time.sleep(DELAY_SECONDS)

    write_results_csv(args.out, result_rows)
    write_options_csv(args.options_out, option_rows)

    log.info(
        "Done: %d vote(s) captured, %d tally row(s), %d skipped. Wrote %s and %s",
        len(result_rows), len(option_rows), len(skipped), args.out, args.options_out,
    )
    if skipped:
        log.info("Skipped IDs: %s", ", ".join(f"{vid} ({reason})" for vid, reason in skipped))

    return 0


if __name__ == "__main__":
    sys.exit(main())
