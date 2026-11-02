#!/usr/bin/env python3
"""
patch_placements_v135_rebuild_cinco2002.py

Rebuilds Cinco de Mayo Footbag Fest 2002 (event 1016457376) from its source page.

The page lists three divisions, each holding separate contests. The lock held the
headings as if each were one contest, so "Novice" merged 4 Square with Timed 3
Minute Consecutives and took each competitor's city as a team, "Intermediate"
merged Big 3 with Timed 3 Minute Consecutives into false ties, and "Shred 30"
merged the Intermediate and Open lists into false ties. The bare headings then
became "Novice Net" and "Intermediate Net", though no net was played. Open Big 3 was
missing.

The rebuilt rows are the page's lists, each competitor named by the id the lock
already carried for that name:
  Novice        4 Square; Timed 3 Minute Consecutives
  Intermediate  Big 3; Timed 3 Minute Consecutives; Shred 30
  Open          Shred 30; Big 3; Sick One

Each Faber row keeps the spelling that list gives and that spelling's own record.
Open Sick One keeps only Jon Schneider's win, because the page numbers no place for
the second name it lists, and an unstated place stays unstated.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v135_rebuild_cinco2002.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

COLEMAN = Player(0, "Andrew Coleman", "66c8ee00-cda8-5430-ba1c-ffb177198d18")
OREILLY = Player(0, "Paully O'Reilly", "ba572db5-f29d-52b3-aedb-ee41a49a9930")
OWENS = Player(0, "Josh Owens", "a2823c8b-27b9-5f22-95cd-58af9770f3a6")
SCARBOROUGH = Player(0, "Ben Scarborough", "00535124-269f-5de1-be41-94948cdae1c0")
ABLES = Player(0, "Brett Ables", "153f48a3-6f39-583d-a39a-e791454234e8")
CARLSEN = Player(0, "Mitch Carlsen", "4dabfb71-0ea3-5e0f-8a63-66e2481e19f9")
STEPHEN_PRIDE = Player(0, "Stephen Pride", "2c482579-1100-568b-81d0-61fc9b6257ba")
SAM_PRIDE = Player(0, "Sam Pride", "d8643200-9610-52ea-879f-c30d9fc1f847")
SQUIRES = Player(0, "Todd Squires", "dbb133f8-699a-53d9-b8b3-5e92751e8644")
SCHNEIDER = Player(0, "Jonathan Schneider", "2c16c43d-6111-5231-b813-23f20f6ba7a3")
ALEX_FABER = Player(0, "Alex Faber", "16b2083f-d41a-5944-8669-d41494e21159")
ALEXANDER_FABER = Player(0, "Alexander Faber", "bd9edb36-ddd6-5fa8-b46f-aad4e708716d")


def division(name: str, category: str, *players: Player) -> Division:
    return Division(name, category, "complete", tuple(
        Player(place, p.name, p.person_id) for place, p in enumerate(players, start=1)))


DIVISIONS = [
    division("Novice 4 Square", "sideline", CARLSEN, STEPHEN_PRIDE, SAM_PRIDE, SQUIRES),
    division("Novice Timed 3 Minute Consecutives", "sideline", STEPHEN_PRIDE, SQUIRES, CARLSEN, SAM_PRIDE),
    division("Intermediate Big 3", "freestyle", COLEMAN, OREILLY, OWENS, SCARBOROUGH, ABLES),
    division("Intermediate Timed 3 Minute Consecutives", "sideline", COLEMAN, SCARBOROUGH, ABLES, OWENS, OREILLY),
    division("Intermediate Shred 30", "freestyle", COLEMAN, SCARBOROUGH, OREILLY, OWENS, ABLES),
    division("Open Shred 30", "freestyle", SCHNEIDER, ALEX_FABER),
    division("Open Big 3", "freestyle", SCHNEIDER, ALEXANDER_FABER),
    division("Open Sick One", "freestyle", SCHNEIDER),
]

if __name__ == "__main__":
    rebuild("1016457376", "2002", {"Novice": 8, "Intermediate": 8, "Shred 30": 8, "Sick One": 1}, DIVISIONS)
