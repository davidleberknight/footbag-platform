"""Builds a throwaway copy of the mirror-extractor layout for the output tests.

The extractors locate both the mirror and their default seed directory relative
to their own file, so a test that copies an extractor into a temporary tree gets
a fully self-contained run: real argument parsing, real mirror reading, real CSV
writing, and a default output target that is itself inside the temporary tree.
That is what lets these tests exercise the genuine command path without the real
mirror, the legacy dump, a network connection, or a database, and without any
mocking of the writer or the extraction functions.

The synthetic mirror pages carry only the markup the parsers actually read.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "legacy_data" / "scripts"

CLUB_PAGE = """<html><body>
<h1 class="clubsShowName">{name}</h1>
<div class="clubsLocationHeader">{city}, {region}, {country}</div>
<div class="clubsContacts"><a href="/members/profile/{contact}/">Contact</a></div>
<div class="clubsURL"><a href="{url}">site</a></div>
<div id="ClubsWelcome">{description}</div>
<div id="MainModified">Created Sun Jan 15 10:16:52 2012; last update Mon Jan 16 11:17:53 2012.</div>
</body></html>
"""

MEMBERS_PAGE = """<html><body>
<table class="membersSearchResultsTable">
<tr><td class="memberName">{name_one}</td>
    <td class="memberAlias"><a href="/members/profile/{id_one}/">{alias_one}</a></td></tr>
<tr><td class="memberName">{name_two}</td>
    <td class="memberAlias"><a href="/members/profile/{id_two}/">{alias_two}</a></td></tr>
</table>
</body></html>
"""

# Two clubs, so ordering across clubs is exercised rather than assumed.
CLUBS = [
    {
        "key": "1000000001",
        "name": "Riverside Footbag Club",
        "city": "Springfield",
        "region": "Illinois",
        "country": "United States",
        "contact": "4242",
        "url": "https://example.org/riverside",
        "description": "All levels welcome, we meet weekly.",
    },
    {
        "key": "1000000002",
        "name": "Harbour Shred Collective",
        "city": "Wellington",
        "region": "Wellington",
        "country": "New Zealand",
        "contact": "4343",
        "url": "https://example.org/harbour",
        "description": "Outdoor sessions through the summer.",
    },
]

MEMBERS = {
    "1000000001": {
        "name_one": "Ada  Lovelace",
        "id_one": "1001",
        "alias_one": "ada",
        "name_two": "Grace Hopper",
        "id_two": "1002",
        "alias_two": "grace",
    },
    "1000000002": {
        "name_one": "Alan Turing",
        "id_one": "1003",
        "alias_one": "alan",
        "name_two": "Karen Sparck Jones",
        "id_two": "1004",
        "alias_two": "karen",
    },
}


def build_sandbox(tmp_path: Path, script_name: str, helpers: list[str]) -> Path:
    """Copy one extractor plus its helpers into a temporary mirror layout.

    Returns the path of the copied extractor. Its default seed target and its
    mirror both resolve inside the temporary tree, so nothing the run does can
    reach the checkout.
    """
    root = tmp_path / "sandbox"
    scripts = root / "legacy_data" / "scripts"
    scripts.mkdir(parents=True)
    for name in [script_name, *helpers]:
        shutil.copy2(SCRIPTS_DIR / name, scripts / name)

    mirror = root / "footbag_legacy_mirror" / "www.footbag.org" / "clubs"
    for club in CLUBS:
        show_dir = mirror / "show" / club["key"]
        show_dir.mkdir(parents=True)
        (show_dir / "index.html").write_text(CLUB_PAGE.format(**club), encoding="utf-8")

        members_dir = mirror / f"ClubID_{club['key']}" / "showmembers"
        members_dir.mkdir(parents=True)
        (members_dir / "index.html").write_text(
            MEMBERS_PAGE.format(**MEMBERS[club["key"]]), encoding="utf-8"
        )

    return scripts / script_name


def run(script: Path, *args: str, cwd: Path | None = None) -> subprocess.CompletedProcess:
    """Run a sandboxed extractor through its real command line."""
    return subprocess.run(
        [sys.executable, str(script), *args],
        capture_output=True,
        text=True,
        cwd=str(cwd or script.parent),
    )


def default_seed_csv(script: Path, filename: str) -> Path:
    """The extractor's own default target, inside the sandbox."""
    return script.parent.parent / "seed" / filename


def make_newer_than_script(csv_path: Path, script: Path, body: str = "STALE\n") -> None:
    """Plant an existing output that the freshness skip must treat as current."""
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    csv_path.write_text(body, encoding="utf-8")
    future = script.stat().st_mtime + 10_000
    os.utime(csv_path, (future, future))
