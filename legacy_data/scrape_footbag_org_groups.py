#!/usr/bin/env python3
"""Opt-in live crawl of footbag.org member groups (settings + membership).

Logs into footbag.org with member credentials, then walks a range of group
IDs fetching four pages per group:

  - /groups/editgroupinfo/<id>  — the group's settings form
  - /groups/home/<id>           — the group's member list
  - /groups/edit/<id>           — the "Administer Member Group" page, checked
                                   for the owner's name/profile ID and the
                                   member count
  - /groups/viewarchive/<id>    — checked only for the most recent message
                                   date in the archive, if any

Writes two CSVs: one row per group for settings (which now includes the
owner's name and profile ID, the member count, and the most recent archive
message date, if found), one row per (group, member) for membership. A group
ID that 404s, redirects to a "no such group" page, or requires access the
logged-in account doesn't have is recorded as skipped and the crawl
continues.

Scope and guarantees:

  - Read-only against footbag.org. Never posts, edits, or deletes anything on
    the live site; only GETs the three pages per group.
  - Opt-in. NOT wired into run_pipeline.sh or any other pipeline mode; run it
    explicitly.
  - Credentials are never accepted as command-line arguments (they would land
    in shell history and be visible to any local user via `ps`). Pass
    --username or let it prompt; the password always comes from an
    interactive getpass prompt.
  - The settings, member-list, and archive-date parsers are best-effort: they
    read whatever labeled form fields / member links / date-shaped text are
    present rather than assuming fixed columns, because the exact page markup
    was not available to verify while writing this script. Inspect the first
    few rows of output against the real pages and adjust
    `parse_group_settings` / `parse_group_members` /
    `parse_archive_most_recent_date` if a field is missing or misparsed.
"""
from __future__ import annotations

import argparse
import csv
import getpass
import logging
import re
import sys
import time
from datetime import date
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
log = logging.getLogger("scrape_footbag_org_groups")


def get(session: requests.Session, url: str, timeout: int = 15) -> requests.Response:
    """GET a footbag.org page with encoding forced to match the site's declared charset.

    The site declares CHARSET=iso-8859-1 via an in-body <meta> tag rather than
    an HTTP Content-Type charset param, so requests' own guess is unreliable
    and silently mangles accented names (e.g. "Kärki" becomes "K�rki"). Every
    parsed GET goes through this wrapper instead of a bare session.get.
    """
    resp = session.get(url, timeout=timeout)
    resp.encoding = "iso-8859-1"
    return resp


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
    title = soup.find("title")
    title_text = title.get_text(strip=True).lower() if title else ""
    if soup.find("form", {"name": "loginform"}) or "member sign-in" in title_text:
        raise RuntimeError("Login failed — still seeing the sign-in page.")
    log.info("Login successful")


def looks_like_missing_group(soup: BeautifulSoup) -> bool:
    text = soup.get_text(" ", strip=True).lower()
    return any(
        phrase in text
        for phrase in ("no such group", "group not found", "does not exist", "invalid group")
    )


# The editgroupinfo form embeds the acting account's own login credential and a
# submit button as hidden/plain fields alongside the actual group settings.
# Never let these reach the output CSV: MemberPassword is the scraping
# account's real password in plaintext, MemberID is that same account's member
# ID, and CommitteeID/SUBMIT are redundant with group_id / not a setting.
_SKIP_SETTINGS_FIELDS = {"MemberID", "MemberPassword", "CommitteeID", "SUBMIT"}


def parse_group_settings(group_id: int, soup: BeautifulSoup) -> dict | None:
    """Best-effort extraction of the editgroupinfo settings form as a flat dict.

    Reads every labeled input/select/textarea inside the page's <form>, except
    the fields in `_SKIP_SETTINGS_FIELDS`. Field names come from each
    element's `name` attribute, so the columns in the output CSV reflect
    whatever fields the live form actually has.
    """
    form = soup.find("form")
    if form is None:
        return None

    fields: dict[str, str] = {}
    for el in form.find_all(["input", "select", "textarea"]):
        name = el.get("name")
        if not name or name in _SKIP_SETTINGS_FIELDS:
            continue
        if el.name == "textarea":
            value = el.get_text(strip=True)
        elif el.name == "select":
            selected = el.find("option", selected=True) or el.find("option")
            value = selected.get_text(strip=True) if selected else ""
        else:
            input_type = (el.get("type") or "text").lower()
            if input_type in ("checkbox", "radio"):
                value = el.get("value", "1") if el.has_attr("checked") else "0"
            else:
                value = el.get("value", "")
        fields[name] = value

    return {"group_id": group_id, **fields}


def parse_group_members(group_id: int, soup: BeautifulSoup) -> list[dict]:
    """Best-effort extraction of the member list on the groups/home page.

    Collects every link to a member profile (`/members/profile/<id>`) on the
    page, using the link text as the display name.
    """
    members = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "/members/profile/" not in href:
            continue
        name = a.get_text(strip=True)
        if not name:
            continue
        profile_id = href.rstrip("/").rsplit("/", 1)[-1]
        members.append({
            "group_id": group_id,
            "member_name": name,
            "member_profile_id": profile_id,
            "member_profile_url": href,
        })
    return members


def parse_group_owner_and_member_count(soup: BeautifulSoup) -> tuple[str, str, int]:
    """Extracts the owner's name/profile ID and member count from the groups/edit page.

    The owner is the row labeled "Owner:", linking to /members/profile/<id>.
    The member count is the number of distinct CommitteeMemberID values in the
    roster's raise/lower links (see `_COMMITTEE_MEMBER_ID_RE`).
    """
    owner_name = ""
    owner_member_id = ""
    for tr in soup.find_all("tr"):
        cells = tr.find_all("td")
        if len(cells) < 2:
            continue
        label = cells[0].get_text(strip=True).rstrip(":").lower()
        if label != "owner":
            continue
        link = cells[1].find("a", href=True)
        if link and "/members/profile/" in link["href"]:
            owner_name = link.get_text(strip=True)
            owner_member_id = link["href"].rstrip("/").rsplit("/", 1)[-1]
        else:
            owner_name = cells[1].get_text(strip=True)
        break

    member_count = len(set(_COMMITTEE_MEMBER_ID_RE.findall(str(soup))))
    return owner_name, owner_member_id, member_count


_MONTH_ABBR = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1
)}
_MONTH_NAME_DATE_RE = re.compile(r"\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b")
_SLASH_DATE_RE = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
_ISO_DATE_RE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
# The message archive's actual format: "May/14/26", "Apr/1/25" (abbreviated month,
# slash-separated, 2-digit year).
_MONTH_SLASH_DATE_RE = re.compile(r"\b([A-Za-z]{3,9})/(\d{1,2})/(\d{2,4})\b")

# Each roster row on groups/edit carries a raise/lower link keyed by CommitteeMemberID,
# one per listed member (admin or not), so counting distinct IDs gives the member count.
_COMMITTEE_MEMBER_ID_RE = re.compile(r"CommitteeMemberID=(\d+)")


def _year_from_str(year_str: str) -> int:
    year = int(year_str)
    return year + 2000 if year < 100 else year


def _extract_dates(text: str) -> list[date]:
    """Best-effort scan for date-like substrings in free text; unrecognized formats are silently skipped."""
    found: list[date] = []

    for month_str, day_str, year_str in _MONTH_NAME_DATE_RE.findall(text):
        month = _MONTH_ABBR.get(month_str[:3].lower())
        if not month:
            continue
        try:
            found.append(date(_year_from_str(year_str), month, int(day_str)))
        except ValueError:
            continue

    for month_str, day_str, year_str in _MONTH_SLASH_DATE_RE.findall(text):
        month = _MONTH_ABBR.get(month_str[:3].lower())
        if not month:
            continue
        try:
            found.append(date(_year_from_str(year_str), month, int(day_str)))
        except ValueError:
            continue

    for month_str, day_str, year_str in _SLASH_DATE_RE.findall(text):
        try:
            found.append(date(int(year_str), int(month_str), int(day_str)))
        except ValueError:
            continue

    for year_str, month_str, day_str in _ISO_DATE_RE.findall(text):
        try:
            found.append(date(int(year_str), int(month_str), int(day_str)))
        except ValueError:
            continue

    return found


def parse_archive_most_recent_date(soup: BeautifulSoup) -> str:
    """Returns the latest message date on a viewarchive page, or "" if none.

    The archive lists each message as a table row starting with a date like
    "May/14/26" (abbreviated month, slash-separated, 2-digit year). This
    scans the page's visible text for that format plus a few other common
    date shapes (Month D, YYYY / M/D/YYYY / YYYY-MM-DD) as a safety net, and
    returns the most recent date found. A 2-digit year is read as 20YY.
    """
    dates = _extract_dates(soup.get_text(" ", strip=True))
    return max(dates).isoformat() if dates else ""


def fetch_group(session: requests.Session, group_id: int) -> tuple[dict | None, list[dict], str | None]:
    """Returns (settings_row_or_None, member_rows, skip_reason_or_None)."""
    settings_resp = get(session, f"{BASE_URL}/groups/editgroupinfo/{group_id}")
    if settings_resp.status_code == 404:
        return None, [], "editgroupinfo 404"
    settings_resp.raise_for_status()
    settings_soup = BeautifulSoup(settings_resp.text, "html.parser")
    if looks_like_missing_group(settings_soup):
        return None, [], "no such group"

    time.sleep(DELAY_SECONDS)

    home_resp = get(session, f"{BASE_URL}/groups/home/{group_id}")
    if home_resp.status_code == 404:
        members = []
    else:
        home_resp.raise_for_status()
        home_soup = BeautifulSoup(home_resp.text, "html.parser")
        members = [] if looks_like_missing_group(home_soup) else parse_group_members(group_id, home_soup)

    time.sleep(DELAY_SECONDS)

    owner_name, owner_member_id, member_count = "", "", 0
    edit_resp = get(session, f"{BASE_URL}/groups/edit/{group_id}")
    if edit_resp.status_code != 404:
        edit_resp.raise_for_status()
        edit_soup = BeautifulSoup(edit_resp.text, "html.parser")
        if not looks_like_missing_group(edit_soup):
            owner_name, owner_member_id, member_count = parse_group_owner_and_member_count(edit_soup)

    time.sleep(DELAY_SECONDS)

    archive_resp = get(session, f"{BASE_URL}/groups/viewarchive/{group_id}")
    if archive_resp.status_code == 404:
        archive_date = ""
    else:
        archive_resp.raise_for_status()
        archive_soup = BeautifulSoup(archive_resp.text, "html.parser")
        archive_date = "" if looks_like_missing_group(archive_soup) else parse_archive_most_recent_date(archive_soup)

    settings = parse_group_settings(group_id, settings_soup)
    if settings is not None:
        settings["owner_name"] = owner_name
        settings["owner_member_id"] = owner_member_id
        settings["member_count"] = member_count
        settings["archive_most_recent_message_date"] = archive_date

    return settings, members, None


def write_settings_csv(path: Path, rows: list[dict]) -> None:
    fieldnames: list[str] = ["group_id"]
    for row in rows:
        for key in row:
            if key not in fieldnames:
                fieldnames.append(key)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_members_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["group_id", "member_name", "member_profile_id", "member_profile_url"])
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--start", type=int, default=1, help="First group ID to crawl (default: 1)")
    parser.add_argument("--end", type=int, default=170, help="Last group ID to crawl, inclusive (default: 170)")
    parser.add_argument("--username", default=None, help="footbag.org username/email; prompted if omitted")
    parser.add_argument("--settings-out", type=Path, default=Path("group_settings.csv"))
    parser.add_argument("--members-out", type=Path, default=Path("group_members.csv"))
    parser.add_argument(
        "--dump-html", type=int, default=None, metavar="GROUP_ID",
        help="Fetch the three raw pages for one group ID, save them as debug_*.html, then exit "
             "(no crawl). Use this to inspect real markup before trusting the parsers.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    username = args.username or input("footbag.org username/email: ")
    password = getpass.getpass("footbag.org password: ")

    session = requests.Session()
    session.headers.update({"User-Agent": "FootbagGroupScrape/1.0 (IFPA internal use)"})
    login(session, username, password)

    if args.dump_html is not None:
        group_id = args.dump_html
        for label, path_segment in (
            ("editgroupinfo", f"editgroupinfo/{group_id}"),
            ("home", f"home/{group_id}"),
            ("edit", f"edit/{group_id}"),
            ("viewarchive", f"viewarchive/{group_id}"),
        ):
            resp = get(session, f"{BASE_URL}/groups/{path_segment}")
            out_path = Path(f"debug_{label}_{group_id}.html")
            out_path.write_text(resp.text, encoding="utf-8")
            log.info("group %d: saved %s (status %d) -> %s", group_id, label, resp.status_code, out_path)
        return 0

    settings_rows: list[dict] = []
    member_rows: list[dict] = []
    skipped: list[tuple[int, str]] = []

    for group_id in range(args.start, args.end + 1):
        try:
            settings, members, skip_reason = fetch_group(session, group_id)
        except requests.RequestException as e:
            skipped.append((group_id, f"fetch failed: {e}"))
            log.warning("group %d: fetch failed: %s", group_id, e)
            time.sleep(DELAY_SECONDS)
            continue

        if skip_reason:
            skipped.append((group_id, skip_reason))
            log.info("group %d: skipped (%s)", group_id, skip_reason)
        else:
            if settings:
                settings_rows.append(settings)
            member_rows.extend(members)
            log.info("group %d: %d member(s)", group_id, len(members))

        time.sleep(DELAY_SECONDS)

    write_settings_csv(args.settings_out, settings_rows)
    write_members_csv(args.members_out, member_rows)

    log.info(
        "Done: %d group(s) with settings, %d member row(s), %d skipped. Wrote %s and %s",
        len(settings_rows), len(member_rows), len(skipped), args.settings_out, args.members_out,
    )
    if skipped:
        log.info("Skipped IDs: %s", ", ".join(f"{gid} ({reason})" for gid, reason in skipped))

    return 0


if __name__ == "__main__":
    sys.exit(main())
