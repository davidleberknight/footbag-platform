#!/usr/bin/env python3
"""
patch_pt_v78_merge_character_loss_pairs.py

Merge the 44 duplicate person rows behind the character-loss check's report,
each into the established record of the same player.

Every doomed row here is a spelling of a real player's name that reached the
canonicalizer unrecognised and was minted as its own person: a letter or accent
lost downstream of the crawl ("Andr Lemaire"), an umlaut written out ("Andreas
Kaefer"), a typo or short form ("Gary Laut", "Joshua Penney"), or a stray
character ("Patrick Keehan*"). Such a row carries no legacy account link and can
never be claimed by the real player, and it splits his competition record. The
maintainer ruled every pair the same person, including the four the review left
open: the four Christian Löw spellings are one player, Jonathan Mori is Jonathan
Morin, Steve Campbell is Steven Campbell, and the 1995 Tim Kelly is the Big Add
Posse honoree Tim Kelley.

The survivor is the established record: the one carrying player ids, results or
an honour. Three survivors are themselves damaged spellings, and the doomed row
holds the true one, so the survivor takes the true spelling and keeps its old one
as an alias:

  922790c4  'Gregor ipek'   -> 'Gregor Šipek'
  a640fdee  'Marek Andrik'  -> 'Marek Šandrik'
  33222145  'Rado arnaj'    -> 'Rado Čarnaj'

One doomed row owns lock data: 'Christian Loew' (1805e38e) carries player ids,
one player placement and three team placements. Its ids join the survivor and its
placements move to it, as in the v77 merge. Every other doomed row owns nothing in
the placements lock: its results come from the result stream and re-attribute
through the alias registry on the next export.

Operations:
  Persons_Truth_Final.csv       survivor absorbs the doomed rows' player ids, and
                                gains their spellings in player_names_seen and
                                aliases_presentable; the three renames above;
                                the doomed rows are deleted
  Placements_ByPerson.csv       the doomed person's own rows move to the survivor;
                                team rows have the doomed id replaced in
                                team_person_key, and their display text, which is
                                source text, stays
  person_aliases.csv            alias rows naming a doomed id point at the
                                survivor; every doomed spelling, and a renamed
                                survivor's old spelling, gains an alias row unless
                                one already resolves to the survivor
  person_country_overrides.csv  each doomed row's line is deleted (its country was
                                inferred from one event's location)

Each file is rewritten line by line: every other line is copied through byte for
byte. Every file is rewritten in memory and checked before any is written. A
second run stops on its pre-condition checks rather than compounding the edit;
checking out the four files is the rollback.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_pt_v78_merge_character_loss_pairs.py
"""

from __future__ import annotations

import csv
import io
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.identity.alias_resolver import normalize_name  # noqa: E402

PT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"
PBP = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"
ALIASES = ROOT / "overrides" / "person_aliases.csv"
COUNTRY = ROOT / "inputs" / "person_country_overrides.csv"
DELIM = " | "
NOTE = ("character-loss or spelling variant; minted as an unclaimable duplicate "
        "and merged into the established record")
PENDING: dict[Path, str] = {}


@dataclass
class Merge:
    survivor_pid: str
    canon_pre: str
    doomed: list[tuple[str, str]]  # (pid, canon)
    canon_post: str = ""

    @property
    def canon(self) -> str:
        return self.canon_post or self.canon_pre


MERGES: list[Merge] = [
    Merge("071ff943-073b-5edb-b2b1-ae6bb1676176", "AJ Shultz",
          [("840afecd-c646-5a4d-b09f-5cd9c3426c08", "AJ Schultz")]),
    Merge("8cf04727-1ddc-5d6a-9680-9581a4466522", "André Lemaire",
          [("ad171a1d-399c-590c-a7ed-b87d688ca54d", "Andr Lemaire")]),
    Merge("b4d3857a-5a59-5e4f-8756-766f9defcce8", "Andreas Käfer",
          [("257613b6-c90e-5b73-b80f-68aeea73f376", "Andreas Kaefer")]),
    Merge("39bc6c51-d2e0-5930-8677-51828c12de14", "Andy Ronald",
          [("ede58b38-2fc5-523b-9a4e-7cc9b5312cfc", "Andy Ronalds")]),
    Merge("c859420d-4487-5539-8a89-7fd09956d790", "Christian Löw",
          [("6ac8a32b-beed-5517-bb29-a804b89ee47d", "Christian Loewe"),
           ("bc87149c-b9f5-5da5-adc6-190043e02f9b", "Christian Löwe"),
           ("1805e38e-adb4-52ab-9d96-281024c565d9", "Christian Loew")]),
    Merge("6d948954-90cb-5446-9a60-9d4ca0ef4734", "Filip Wojcik",
          [("bac4ab7a-dd0d-5fa9-ac24-3423efb08f1d", "Filip Wjcik")]),
    Merge("579ef1e3-096f-501a-8195-ae446edef3b9", "François Parayre",
          [("b2f7a2ca-00b7-5b3a-8e51-698125650aa6", "Franois Parayre")]),
    Merge("66a5ee0b-abd2-5b24-9d53-5c4f6e3fee14", "Gary Lautt",
          [("133b6dd3-1463-5d89-802e-707414d4cc06", "Gary Laut")]),
    Merge("a737859a-35f6-51c8-9cd1-d5f54f88b8dd", "Gosia Debska",
          [("5a51c9b2-8b04-553c-93f2-670c54b64320", "Gosia Dbska")]),
    Merge("97771593-c865-5ac9-b7bf-c76ba6159476", "Greg Potts",
          [("7f28a753-d941-5bd5-a0d2-7c6dfca147bc", "Gregg Potts")]),
    Merge("922790c4-3d94-5b02-b5b7-eac2e77c0662", "Gregor ipek",
          [("05d68884-d2e0-5e29-b253-48a280f2d68a", "Gregor Sipek")], "Gregor Šipek"),
    Merge("ec1d5118-cd4b-591f-a84a-04bbe20868bc", "Grischa Tellenbach",
          [("1a91f7f4-2a7e-5090-8661-e83b2cc8b37f", "Grisha Tellenbach")]),
    Merge("6257b1c3-bbae-5937-b773-ffd5c2152715", "James Dean",
          [("bbbc14f6-4a30-509b-a6be-ca3294b090cb", "James Deans")]),
    Merge("4b64e224-7a2f-576c-a81a-ecc0db13e2a3", "Jay Moldenhauer",
          [("045862ac-72b8-5b86-bc01-5a4d087b47e0", "Jay Moldenhauser")]),
    Merge("184a06bb-be96-5120-9a7c-1676f2b01a2a", "Jean-Francois Lemieux",
          [("320e5738-1b7e-56d0-8854-4fdde0a682e0", "Jean-Franois Lemieux")]),
    Merge("3f48caf5-14c9-59f1-8255-1db7ef2fd049", "Jenny Davison",
          [("014427ca-52a3-5363-8cf2-784115ce7a9d", "Jenny Davidson")]),
    Merge("05231a10-9d6a-51f5-b170-42dc8b6f9494", "Jonathan Morin",
          [("90dc41bd-7fc8-568f-92d8-41d820ac2c83", "Jonathan Mori")]),
    Merge("ffb44633-32b2-5794-8239-1e20e2c68e23", "Josh Penney",
          [("0f1d5703-1707-50c0-b53e-310a32d256e6", "Joshua Penney")]),
    Merge("8e17712f-7c8d-5c61-93e2-85d061117be2", "Kerstin Anhuth",
          [("82efe273-58aa-56e0-923c-d5d9d3df4a11", "Kerstin Anhut")]),
    Merge("f2936893-0ca3-5314-b8fe-8f89595b93d0", "Kinga Gwozdz",
          [("1658ef95-0402-5e7d-bdcb-bb936d363b75", "Kinga Gwźdź")]),
    Merge("b41cedc4-cb5f-5d49-899f-5a04af4092da", "Klemenz Längauer",
          [("08006721-8766-5d37-9dae-c91fef984657", "Klemenz Lngauer")]),
    Merge("ddf2f704-a4d2-5653-a82a-45987d37645c", "Krzysztof Sobótka",
          [("f5a9e806-eea5-5035-9c1a-916cc8cd2000", "Krzysztof Sobtka")]),
    Merge("21e3e2db-cc50-541f-9ce9-928da111bb6a", "Malgorzata Oledzka",
          [("2430dadf-ab47-5f40-a4b3-d2f5cba9a8be", "Magorzata Olędzka")]),
    Merge("a640fdee-b541-5767-8bb1-10597dbdca47", "Marek Andrik",
          [("66a75aea-2932-550b-ab1f-1250c7bfa765", "Marek Šandrik")], "Marek Šandrik"),
    Merge("6f08080b-9aad-54de-afc5-1c6e553f6a6e", "Mark Hunsburger",
          [("5a12d580-866d-5e5f-92d8-0a5cd408dcf9", "Mark Hunsbuger")]),
    Merge("4aacc030-1054-5a9e-82e9-96a8e7887435", "Martin Sladek",
          [("5d821b80-4cf1-580b-af38-c8bd73fb06ad", "Martin Sldek")]),
    Merge("18d82973-e5e4-5c70-9fc5-3b878544e7e7", "Max Gerhardt",
          [("0dc6498b-a8ed-5410-9ca6-930bf9aa9ad9", "Max Gerhard")]),
    Merge("7d5a5f40-0f4c-5c3e-ae53-f2d1aed6af19", "Nadine Beyeler",
          [("7d88acae-cdb3-53c1-b90c-f0f8485e038d", "Nadine Beyler")]),
    Merge("246cf8ea-f186-5e7e-a781-3fc4205a702e", "Ole Schnack",
          [("c70c6137-6faa-5887-92f1-34a5e09d2a69", "Ole Snack")]),
    Merge("a885c64b-88c5-5b90-a17e-598a5076fcd5", "Patrick Keehan",
          [("8ea1c9ad-d2d1-5cd0-ba57-2e59c8a3ff96", "Patrick Keehan*")]),
    Merge("33222145-5dc0-540d-ba73-913052dd4751", "Rado arnaj",
          [("12c12db3-36eb-564c-9b93-1a68f547798c", "Rado Čarnaj")], "Rado Čarnaj"),
    Merge("3c50ab0f-2056-50ce-a5f2-c7c95e96702f", "Robin Puchel",
          [("50976d65-b674-5423-a4fb-543936e4e95b", "Robin Puechel")]),
    # Both spellings already alias to the third row, so it survives and both go.
    Merge("1e1bc64f-894f-59b0-ad65-d83914077067", "Simon Kolodenchuk",
          [("a7c87843-ec5d-5626-8c40-8e7ae88b1835", "Simon-François Kolodenchuk"),
           ("1b8c7a0d-2e95-5e80-8bea-9d226c9bdd00", "Simon-Francois Kolodentchuk")]),
    Merge("9188c2d1-9556-5ad8-b890-6c22425dbbf0", "Stephan Rauthenberg",
          [("f86e6eee-04ac-5ff8-89c2-881ad5c34161", "Stephan Rautenber")]),
    Merge("d3941833-f276-5b0c-b7b2-c92fffacd3c1", "Steven Campbell",
          [("9eb5c503-7c1c-58b5-a1c4-6e21d3d308a7", "Steve Campbell")]),
    Merge("97b4db80-0f51-5701-9dc2-aba083758a58", "Tomas Tyrpekl",
          [("9eafd635-3b2a-5a67-8522-b58282b7071c", "TMS Tyrpekl")]),
    Merge("16209b8e-9f70-5a0c-afb5-1ac2173a7140", "Thomas Foerster",
          [("8bebb3c9-6fbd-5bf2-bd8e-a8e2bfc3d940", "Thomas Förster")]),
    Merge("044b9080-ec21-5ca5-a8b0-e85ab5fb1c0b", "Tim Kelley",
          [("ec692339-872c-5faa-a562-e5767b9627bf", "Tim Kelly")]),
    Merge("c6704eb0-91e0-538b-8806-9a43b16e91cb", "Walt Houston",
          [("ef011846-b672-5dd4-a671-ce5197cee74b", "Walter Houston")]),
    Merge("c917c04b-83fa-5c1a-8f2c-292f24db5616", "Wiktor Debski",
          [("378333f4-1c22-548c-a549-32e8036f3338", "Wiktor Dbski.")]),
    Merge("d65e2ac9-c615-5f25-b58f-14493a27af47", "Lukasz Domin",
          [("2ee44016-454f-5ee8-9bb9-b26a74cd47f3", "ukasz Domin")]),
]

# The one doomed row that owns placements in the lock: (player rows, team rows).
OWNS_PLACEMENTS = {"1805e38e-adb4-52ab-9d96-281024c565d9": (1, 3)}
EXPECTED_DOOMED = 44

DOOMED_TO = {pid: m for m in MERGES for pid, _ in m.doomed}


def _emit(row: list[str]) -> str:
    buf = io.StringIO()
    csv.writer(buf, lineterminator="").writerow(row)
    return buf.getvalue()


def _pipe(value: str) -> list[str]:
    return [p.strip() for p in (value or "").split("|") if p.strip()]


def _lines(path: Path) -> list[str]:
    raw = path.read_bytes().decode("utf-8")
    if "\r\n" in raw:
        raise AssertionError(f"{path.name}: expected LF line endings")
    return raw.split("\n")


def _row(header: list[str], line: str) -> dict[str, str]:
    return dict(zip(header, next(csv.reader([line]))))


def merge_persons_truth() -> None:
    lines = _lines(PT)
    header = next(csv.reader([lines[0]]))
    by_pid = {}
    for line in lines[1:]:
        if line:
            r = _row(header, line)
            by_pid[r["effective_person_id"]] = r
    for m in MERGES:
        s = by_pid.get(m.survivor_pid)
        if s is None:
            raise AssertionError(f"survivor {m.survivor_pid} missing (already merged?)")
        if s["person_canon"] != m.canon_pre:
            raise AssertionError(f"survivor {m.survivor_pid}: expected {m.canon_pre!r}, got {s['person_canon']!r}")
        ids, names, presentable = set(_pipe(s["player_ids_seen"])), set(_pipe(s["player_names_seen"])), set(_pipe(s["aliases_presentable"]))
        for pid, canon in m.doomed:
            d = by_pid.get(pid)
            if d is None:
                raise AssertionError(f"doomed {pid} ({canon}) missing (already merged?)")
            if d["person_canon"] != canon:
                raise AssertionError(f"doomed {pid}: expected {canon!r}, got {d['person_canon']!r}")
            if d["legacyid"].strip():
                raise AssertionError(f"doomed {canon} carries a legacy account link")
            if d["exclusion_reason"].strip():
                raise AssertionError(f"doomed {canon} carries an exclusion")
            if _pipe(d["player_ids_seen"]) and pid not in OWNS_PLACEMENTS:
                raise AssertionError(f"doomed {canon} carries player ids")
            ids |= set(_pipe(d["player_ids_seen"]))
            names.add(canon)
            presentable.add(canon)
        if m.canon_post:
            presentable.add(m.canon_pre)
            s["person_canon"] = m.canon_post
            s["person_canon_clean"] = m.canon_post
        presentable.discard(m.canon)
        s["player_ids_seen"] = DELIM.join(sorted(ids))
        s["player_names_seen"] = DELIM.join(sorted(names))
        s["aliases_presentable"] = DELIM.join(sorted(presentable))
    survivors = {m.survivor_pid: m for m in MERGES}
    out, dropped = [lines[0]], 0
    for line in lines[1:]:
        if not line:
            out.append(line)
            continue
        pid = line.split(",", 1)[0]
        if pid in DOOMED_TO:
            dropped += 1
            continue
        if pid in survivors:
            out.append(_emit([by_pid[pid][h] for h in header]))
            continue
        out.append(line)
    if dropped != EXPECTED_DOOMED:
        raise AssertionError(f"persons truth: deleted {dropped} rows, expected {EXPECTED_DOOMED}")
    PENDING[PT] = "\n".join(out)
    print(f"{PT.relative_to(ROOT)}: {len(MERGES)} survivors updated, {dropped} rows deleted")


def remap_placements() -> None:
    lines = _lines(PBP)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    moved: dict[str, list[int]] = {pid: [0, 0] for pid in OWNS_PLACEMENTS}
    for line in lines[1:]:
        hit = [pid for pid in DOOMED_TO if pid in line]
        if not hit:
            out.append(line)
            continue
        r = _row(header, line)
        for pid in hit:
            if pid not in OWNS_PLACEMENTS:
                raise AssertionError(f"placements: {DOOMED_TO[pid].canon} doomed id {pid} unexpectedly present")
            m = DOOMED_TO[pid]
            if r["person_id"] == pid:
                r["person_id"] = m.survivor_pid
                r["person_canon"] = m.canon
                r["norm"] = m.canon.lower()
                moved[pid][0] += 1
            elif pid in r["team_person_key"]:
                r["team_person_key"] = r["team_person_key"].replace(pid, m.survivor_pid)
                moved[pid][1] += 1
            else:
                raise AssertionError(f"doomed id in an unexpected column: {line[:120]}")
        out.append(_emit([r[h] for h in header]))
    for pid, expected in OWNS_PLACEMENTS.items():
        if tuple(moved[pid]) != expected:
            raise AssertionError(f"placements for {pid}: moved {moved[pid]}, expected {expected}")
    PENDING[PBP] = "\n".join(out)
    print(f"{PBP.relative_to(ROOT)}: " + ", ".join(f"{DOOMED_TO[p].doomed[-1][1]} {v[0]} player and {v[1]} team row(s) moved" for p, v in moved.items()))


def repoint_and_add_aliases() -> None:
    lines = _lines(ALIASES)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    resolves: dict[str, str] = {}
    repointed = 0
    for line in lines[1:]:
        if not line:
            continue
        r = _row(header, line)
        if r["person_id"] in DOOMED_TO:
            m = DOOMED_TO[r["person_id"]]
            r["person_id"], r["person_canon"] = m.survivor_pid, m.canon
            line = _emit([r[h] for h in header])
            repointed += 1
        elif r["person_id"] in {m.survivor_pid for m in MERGES if m.canon_post}:
            m = next(x for x in MERGES if x.survivor_pid == r["person_id"])
            r["person_canon"] = m.canon
            line = _emit([r[h] for h in header])
        resolves.setdefault(normalize_name(r["alias"]), r["person_id"])
        out.append(line)
    added = 0
    for m in MERGES:
        spellings = [c for _, c in m.doomed] + ([m.canon_pre] if m.canon_post else [])
        for spelling in spellings:
            key = normalize_name(spelling)
            if key == normalize_name(m.canon):
                continue
            owner = resolves.get(key)
            if owner == m.survivor_pid:
                continue
            if owner is not None:
                raise AssertionError(f"alias {spelling!r} already resolves to {owner}, not {m.survivor_pid}")
            out.append(_emit([spelling, m.survivor_pid, m.canon, "verified", NOTE]))
            resolves[key] = m.survivor_pid
            added += 1
    out.append("")
    PENDING[ALIASES] = "\n".join(out)
    print(f"{ALIASES.relative_to(ROOT)}: {repointed} alias row(s) repointed, {added} added")


def drop_country_overrides() -> None:
    lines = _lines(COUNTRY)
    out = [lines[0]]
    dropped = 0
    for line in lines[1:]:
        if line.split(",", 1)[0] in DOOMED_TO:
            dropped += 1
            continue
        out.append(line)
    PENDING[COUNTRY] = "\n".join(out)
    print(f"{COUNTRY.relative_to(ROOT)}: {dropped} line(s) deleted")


def postconditions() -> None:
    for path, text in PENDING.items():
        for pid in DOOMED_TO:
            if pid in text:
                raise AssertionError(f"{path.name} would still name doomed id {pid}")


def main() -> None:
    for p in (PT, PBP, ALIASES, COUNTRY):
        if not p.exists():
            print(f"ERROR: {p} not found", file=sys.stderr)
            sys.exit(1)
    if len(DOOMED_TO) != EXPECTED_DOOMED:
        raise AssertionError(f"{len(DOOMED_TO)} doomed ids listed, expected {EXPECTED_DOOMED}")
    merge_persons_truth()
    remap_placements()
    repoint_and_add_aliases()
    drop_country_overrides()
    postconditions()
    for path, text in PENDING.items():
        path.write_text(text, encoding="utf-8")
    print(f"Merged {EXPECTED_DOOMED} duplicate rows into {len(MERGES)} established records")


if __name__ == "__main__":
    main()
