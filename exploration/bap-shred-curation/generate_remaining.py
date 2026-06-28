#!/usr/bin/env python3
"""Generate the remaining BAP Individual-Shred sidecars (the 26 CURATE
candidates not covered by the 1992-2007 YouTube batch in generate_sidecars.py).

Differences from generate_sidecars.py:
- Unicode-safe slugify (pre-maps non-decomposing Latin letters such as Polish l,
  then NFKD-folds the rest) so diacritic names produce correct slugs/player tags.
- Emits the #player_<slug> tag (the seeder uses sidecar tags verbatim).
- Includes Vimeo rows: the seeder requires a thumbnailUrl for Vimeo (the CDN
  thumbnail id is separate from the video id, so it is not derivable offline).
  The public thumbnail URLs are fetched once from Vimeo's oEmbed API and cached
  in VIMEO_THUMBNAILS below, keeping this generator offline-deterministic; a
  Vimeo row with no cached thumbnail is deferred rather than written.

Re-runnable: stable filenames; overwrites in place.
"""
from __future__ import annotations
import hashlib, json, re, unicodedata
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "curated" / "individual_shred"

# Non-NFKD-decomposing Latin letters seen in the roster (e.g. Polish l-stroke).
_PREMAP = str.maketrans({
    "ł": "l", "Ł": "L",  # l-stroke
    "ø": "o", "Ø": "O",  # o-slash
    "đ": "d", "Đ": "D",  # d-stroke
})


def slugify(name: str) -> str:
    s = name.translate(_PREMAP)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def bap_era(year: int) -> str:
    """Induction-era bucket for the collection's era browse, mirroring the Big
    Add Posse roster's own year organization."""
    if year <= 1994:
        return "originators"
    if year <= 1999:
        return "golden_age"
    if year <= 2009:
        return "expansion"
    if year <= 2019:
        return "modern"
    return "current"


# Canonical person identity comes from the Persons Truth table, NOT the BAP
# roster. Where the roster spelling (nickname, transliteration, typo, diminutive,
# legacy spelling) differs from the reconciled canonical person, the #player_ tag
# uses the canonical person slug; the roster spelling is an alias only. These six
# were reconciled during the Persons Truth work (verified by pid + bap_nickname).
CANONICAL_PLAYER_SLUG = {
    "Arek Dzudzinski": "arkadiusz_dudzinski",  # Arkadiusz Dudzinski (Hi-Tek)
    "Jindra Smola":    "jindrich_smola",       # Jindrich Smola (FootZepp)
    "Nick Polini":     "nick_pollini",         # Nick Pollini (Houdini)
    "Olav Piwowar":    "olaf_piwowar",         # Olaf Piwowar (Anaconda)
    "Rene Ruhr":       "rene_ruehr",           # Rene Ruehr (Collider)
}


def normalize_url(platform: str, url: str) -> str:
    if platform == "youtube":
        m = re.search(r"(?:v=|youtu\.be/)([\w-]+)", url)
        if m:
            return f"https://www.youtube.com/watch?v={m.group(1)}"
    return url


# (year, name, nickname, platform, url)
ROWS = [
    (1992, "Rick Reese", "Rippin'", "vimeo", "https://vimeo.com/472505541"),
    (1995, "Eric Wulff", "Iron Man", "vimeo", "https://vimeo.com/197154435"),
    (1996, "Daryl Genz", "Genzu Blades", "youtube", "https://www.youtube.com/watch?v=CaxMzgzPfeQ"),
    (2001, "Allan Haggett", "Allan", "vimeo", "https://vimeo.com/158856059"),
    (2008, "Arek Dzudzinski", "Hi-Tek", "youtube", "https://www.youtube.com/watch?v=v6VdTmLw7VM"),
    (2009, "Anssi Sundberg", "Accelerator", "youtube", "https://www.youtube.com/watch?v=ORrnOcnFk_4"),
    (2009, "Milan Benda", "Megatron", "vimeo", "https://vimeo.com/143522157"),
    (2009, "Nick Landes", "The Praying Mantis", "youtube", "https://www.youtube.com/watch?v=_2bPJnNLJNE"),
    (2010, "Evan Gatesman", "Silencer", "youtube", "https://www.youtube.com/watch?v=aUi_CIjNzYQ"),
    (2011, "Jay Boychuk", "(the) Creator", "youtube", "https://www.youtube.com/watch?v=joH8OuncFrU"),
    (2011, "Olav Piwowar", "Anaconda", "youtube", "https://www.youtube.com/watch?v=YTHE_VFUm5A"),
    (2012, "Lauri Airinen", "Madness", "youtube", "https://www.youtube.com/watch?v=21h1CQalhkI"),
    (2012, "Marcin Bujko", "Stylish", "youtube", "https://www.youtube.com/watch?v=31Y7U3NgsEc"),
    (2013, "Jindra Smola", "FootZepp", "youtube", "https://www.youtube.com/watch?v=CJWN4DNGVAw"),
    (2013, "Johnny Suderman", "The Canadian Hero", "youtube", "https://www.youtube.com/watch?v=kp3Tx9PHm88"),
    (2013, "Rene Ruhr", "Collider", "youtube", "https://www.youtube.com/watch?v=5jd1sFrbDEI"),
    (2014, "Mathias Blau", "The Matrix", "youtube", "https://www.youtube.com/watch?v=Sif2ZYf2Zqw"),
    (2017, "Nick Polini", "Houdini", "youtube", "https://youtu.be/xp4YjZP-DUk"),
    (2018, "Dominik Šimků", "Nunchaku", "youtube", "https://www.youtube.com/watch?v=XSrNYGpugxU"),
    (2018, "Taishi Ishida", "Shuriken", "youtube", "https://www.youtube.com/watch?v=XUThE6cZKVU"),
    (2020, "Rafał Kaleta", "Killa", "youtube", "https://www.youtube.com/watch?v=_CeQUdG1MqM"),
    (2021, "Christopher Schillem", "The Machine", "youtube", "https://www.youtube.com/watch?v=QrLcGB4JKwY"),
    (2021, "Pawel Nowak", "Dynomite", "youtube", "https://www.youtube.com/watch?v=JSUsWB_7Huc"),
    (2024, "Dante Diotallevi", "The Inferno", "youtube", "https://www.youtube.com/watch?v=qrf1eiZmUDs"),
    (2025, "Jakub Mościszewski", "Endurance", "youtube", "https://youtu.be/v0aCWgd8Nx8"),
]


# Public Vimeo thumbnail URLs, keyed by numeric video id, fetched once from
# Vimeo's oEmbed API (https://vimeo.com/api/oembed.json?url=...&width=640). The
# CDN thumbnail id is independent of the video id, so it cannot be derived
# offline; caching it here keeps this generator (and the seeder) deterministic
# with no network call at generate or seed time.
VIMEO_THUMBNAILS: dict[str, str] = {
    "472505541": "https://i.vimeocdn.com/video/982940574-13ea3c15ba3a9010fa78c3ec88e7b9638e693c9a94b1a052bbc4f032ebe91232-d_640?region=us",
    "197154435": "https://i.vimeocdn.com/video/609812333-aa67319f7bd7b2367c3bb05c187c59bf6e48c5858d83050b9c6f911b23fefa8e-d_640?region=us",
    "158856059": "https://i.vimeocdn.com/video/560455806-f129e5292beb7819f9c4e7c8ea23df142739a5c52a1707fa103695438af4cab5-d_640?region=us",
    "143522157": "https://i.vimeocdn.com/video/865183302-265b64cd4fd56bff446b5219378f14c3f30af3b4a204eef1208d99b052931994-d_640?region=us",
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    written = 0
    deferred: list[tuple[str, str, str]] = []
    for year, name, nick, platform, raw_url in ROWS:
        url = normalize_url(platform, raw_url)
        slug = slugify(name)
        player_slug = CANONICAL_PLAYER_SLUG.get(name, slug.replace("-", "_"))
        player_tag = "#player_" + player_slug
        sidecar = {
            "videoUrl": url,
            "videoPlatform": platform,
            "title": f'{name} "{nick}" (BAP {year})',
            "creator": name,
            "sourceId": "bap_individual_shred",
            "tier": "REFERENCE",
        }
        if platform == "vimeo":
            m = re.search(r"vimeo\.com/(\d+)", url)
            thumb = VIMEO_THUMBNAILS.get(m.group(1)) if m else None
            if not thumb:
                # No cached thumbnail: defer rather than write a sidecar the
                # seeder would reject (Vimeo thumbnailUrl is mandatory).
                deferred.append((name, url, player_tag))
                continue
            sidecar["thumbnailUrl"] = thumb
        sidecar["tags"] = ["#freestyle", "#individual_shred_videos", "#bap", f"#bap_{bap_era(year)}", player_tag]
        assert "#curated" not in sidecar["tags"]
        fname = f"{slug}_{hashlib.sha1(url.encode()).hexdigest()[:8]}.meta.json"
        (OUT / fname).write_text(json.dumps(sidecar, indent=2) + "\n", encoding="utf-8")
        written += 1
        print(f"  {platform:7} {slug:24} {player_tag}")
    print(f"wrote {written} sidecars to {OUT}")
    for name, url, tag in deferred:
        print(f"  DEFERRED-VIMEO {name} ({url}) -> {tag} [needs thumbnailUrl]")


if __name__ == "__main__":
    main()
