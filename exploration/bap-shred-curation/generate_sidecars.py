#!/usr/bin/env python3
"""Generate Individual Shred Videos URL-reference sidecars from the curated
BAP candidate list (YouTube-only first batch, induction 1992-2007).

Writes curated/individual_shred/<player-slug>_<sha1(url)[:8]>.meta.json.
Vimeo candidates are deferred (Vimeo sidecars require a thumbnailUrl that is
not derivable offline). Re-runnable: stable filenames; overwrites in place.
"""
from __future__ import annotations
import hashlib, json, re
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "curated" / "individual_shred"

# (year, name, nickname, youtube_id) — CURATE rows <=2007, YouTube only.
ROWS = [
    (1992, "Kenny Shults", "The Enforcer", "gXdt0wGXcWo"),
    (1992, "Peter Irish", "The Executioner", "m_ZxDmqaVxc"),
    (1992, "Tim Kelley", "Stikman", "q37vo62psGA"),
    (1995, "Tuan Vu", "Disco Ninja", "nisxR0eIZ9E"),
    (1995, "Scott Davidson", "Enlightener", "zMenKdZ-qi4"),
    (1995, "Greg Nelson", "GF Smoothie", "1e3GS17JB-U"),
    (1995, "Josh Casey", "Chiseler", "63cgWLJYTNI"),
    (1995, "Paul Munger", "Hu-Mongous", "xMpJ_WelGDY"),
    (1996, "Ahren Gehrman", "Torch", "3DauF8s7dZY"),
    (1997, "Ryan Mulroney", "Regulator", "t4l-X0SFMJ8"),
    (1997, "Red Husted", "Shred", "YCQ5RLeLPu4"),
    (1997, "Tu Vu", "Huge", "U_yKAXALgVw"),
    (1997, "Chad Devlahovich", "Big Add", "y14ZxGaMi2o"),
    (1997, "Noah Dubreuil", "Merlin", "CNpOh_KJJe4"),
    (1997, "Dave Holton", "Highlander", "gBeuu7tDaR4"),
    (1998, "Brian McKenzie", "Kamakenzie", "rFxxDBTSsm8"),
    (1998, "Eric Windsor", "Wicked", "mh8ASGrAfC0"),
    (1998, "Carol Wedemeyer", "She blade", "NxLcAq6xEz0"),
    (1998, "Eli Piltz", "Intergalactic", "LHQrW6mNCuY"),
    (1999, "Sunil Jani", "Tsunami", "PPmWoRNz7yQ"),
    (1999, "Mika Koistinen", "Iceman", "wlfrnErbaGI"),
    (2000, "Jonathan Schneider", "Outsider", "A6kCUKwLUuM"),
    (2000, "Lon Smith", "Shred On", "dk2PEKRKYMU"),
    (2001, "Yacine Merzouk", "Fiend", "7KJA-1hee48"),
    (2001, "Richie Abshire", "Renegade", "dOLh7EJdfMY"),
    (2001, "Sebastien Duschesne", "Hurricane", "ORfTSfIFrXw"),
    (2001, "Gordon Scott Bevier", "Flash", "cLc9enanEyI"),
    (2002, "Honza Weber", "Webslinger", "20lOET6K5dE"),
    (2002, "Ales Zelinka", "The Man of Steel", "I0RwwiMkPxE"),
    (2002, "Jim Penske", "Pimpske", "lr46ug-5WS8"),
    (2003, "Jere Vainikka", "Smooth Criminal", "2fqFlHaths4"),
    (2003, "Yves Kreil", "Krusher", "zYGDIpUmq4c"),
    (2003, "Felix Zenger", "Stone Cold", "InY3SLWORj8"),
    (2003, "Tuukka Antikainen", "Tko", "vhh7Mf4mKTk"),
    (2004, "Dylan Fry", "Stylon Dylon", "b-BjxwUbX7M"),
    (2004, "Nick Laroche", "Slick Nick", "xbkIoVgvL04"),
    (2004, "Johnny Murphy", "Magic Feet (J$)", "W4OF2w2M5EY"),
    (2004, "Jorden Moir", "The Destroyer", "L7a-hXbRyYQ"),
    (2004, "Toni Paakkonen", "The Beast", "6ZmmwTt2up4"),
    (2005, "Juho Marjo", "Super", "-KHP-qdg0UA"),
    (2005, "Mikko Lepisto", "Uniqueo", "vlcWEigrzFw"),
    (2005, "Karim Daouk", "Special K", "upg0renncwU"),
    (2006, "Phillip Morrison", "Red Rocket", "wgQEPbdqQdM"),
    (2006, "Aleksi Airinen", "Air", "1Pr_IFINrNU"),
    (2006, "Tina Aberli", "Swiss Miss", "pwqMxZ9apkU"),
    (2007, "Damian Gielnicki", "Twister", "Q1PAlpdRPk4"),
    (2007, "David Clavens", "Cleaver", "SF91AqS_Iyg"),
]


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    written = 0
    seen_ids: set[str] = set()
    for year, name, nick, vid in ROWS:
        assert vid not in seen_ids, f"duplicate video id {vid}"
        seen_ids.add(vid)
        url = f"https://www.youtube.com/watch?v={vid}"
        sidecar = {
            "videoUrl": url,
            "videoPlatform": "youtube",
            "title": f'{name} "{nick}" (BAP {year})',
            "creator": name,
            "sourceId": "bap_individual_shred",
            "tier": "REFERENCE",
            "tags": ["#freestyle", "#individual_shred_videos", "#bap"],
        }
        # invariants the seeder enforces
        assert "#curated" not in sidecar["tags"]
        fname = f"{slugify(name)}_{hashlib.sha1(url.encode()).hexdigest()[:8]}.meta.json"
        (OUT / fname).write_text(json.dumps(sidecar, indent=2) + "\n", encoding="utf-8")
        written += 1
    print(f"wrote {written} sidecars to {OUT}")


if __name__ == "__main__":
    main()
