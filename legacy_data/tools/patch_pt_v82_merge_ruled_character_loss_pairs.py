#!/usr/bin/env python3
"""
patch_pt_v82_merge_ruled_character_loss_pairs.py

Merge forty-five duplicate person rows into forty established records, the
pairs the maintainer ruled the same player when the widened character-loss
check reported them.

Each doomed row is a player's name damaged or varied in one place: a Polish,
Czech or Slovak letter lost ("Pawe Nowak", "Micha Ostrowski", "David Andrik"
for Šandrik, "Ondrej Krabal" for Škrabal), a typing slip ("Athur Ledain",
"Sébasteien Duchesne"), a letter doubled or dropped ("Jaako Inkinen", "Lassd
Yacoub"), an umlaut written out or put in ("Lisa Übele", "Philip Schäfer"), or
an empty stub carrying a variant spelling ("John Lind", "Michael Sauren"). Each
was minted as its own person and carries no account link, so it could never be
claimed and it split, or shadowed, the player's record.

The maintainer ruled these pairs in batches, from the evidence for each: the
pattern of the damage, the size of each record, an account on the established
one, shared events where there are any, and never the same discipline of one
event. Pairs ruled two people, or that the evidence cannot settle, are recorded
in overrides/identity_review_queue.csv and left alone; this patch touches none
of them.

The survivor is the record holding the player's legacy account, otherwise the
record with more results, otherwise the correct spelling: Pawel Cisek survives
over "Pawe Cisek" although the damaged spelling carries one more event. Names
stay as they are, so a damaged survivor spelling such as "Natalia Fry" is left
for a separate naming cleanup.

Three doomed rows are coverage-closure placeholders, added only so a result
naming that id resolved to a person row: Johny Sarah, Mikka Koistinen and Thomas
Laboutka. Their placements move to the survivor like any other, which keeps the
reference they were added for, so the merge is allowed past the exclusion guard
for exactly those three rows.

Forty-three doomed rows own placements in the lock, player or team rows; they
move to the survivor, as in the v81 merge. The other two own nothing and their
results re-attribute through the alias registry on the next export.

Operations:
  Persons_Truth_Final.csv       survivor absorbs the doomed rows' player ids, and
                                gains their spellings in player_names_seen and
                                aliases_presentable; the doomed rows are deleted
  Placements_ByPerson.csv       the doomed person's own rows move to the survivor;
                                team rows have the doomed id replaced in
                                team_person_key, and their display text, which is
                                source text, stays
  person_aliases.csv            alias rows naming a doomed id point at the
                                survivor; every doomed spelling gains an alias row
                                unless one already resolves to the survivor
  person_country_overrides.csv  each doomed row's line is deleted

Each file is rewritten line by line: every other line is copied through byte for
byte. Every file is rewritten in memory and checked before any is written. A
second run stops on its pre-condition checks rather than compounding the edit;
checking out the four files is the rollback.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_pt_v82_merge_ruled_character_loss_pairs.py
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
NOTE = ("spelling or character-loss variant of the same player; minted as an "
        "unclaimable duplicate and merged into the established record")
PENDING: dict[Path, str] = {}

# Coverage-closure placeholder rows this patch may merge despite their exclusion.
PLACEHOLDER_EXCLUSION = "COVERAGE_CLOSURE"
PLACEHOLDER_ROWS = {
    "21d690c8-a897-54d4-a7fc-2981f4a33852",  # Johny Sarah
    "10a47c6a-00a3-5c9f-ae09-ab668c8e9c4c",  # Mikka Koistinen
    "eb59af92-1734-525c-b929-34e8e9ab8dc3",  # Thomas Laboutka
}


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
    Merge("9fccb3a3-3408-518a-aacb-43d9678fcce4", "Pawel Nowak",
          [("e5a6f257-390d-5df7-8cb0-5832e2855573", "Pawe Nowak")]),
    Merge("da3fbe76-ba2d-51ee-a019-97e7ba93089a", "Michal Ostrowski",
          [("2f7336f6-7201-5e28-93a9-33b2f5183f9e", "Micha Ostrowski")]),
    Merge("603bbc2d-6488-5891-a942-b5c5c79e0018", "Pawel Cisek",
          [("112d09c8-3761-585b-904a-a4b51003400b", "Pawe Cisek")]),
    Merge("59b9b60b-1697-54f8-98d1-eaed43e99f65", "Chris Löw",
          [("77077fa3-e070-5728-87d5-88c81b58466a", "Chris Loew")]),
    Merge("e528ca88-e462-5870-bd7f-45fb49bfbcfc", "Arthur Ledain",
          [("6ad61bb2-30ae-5886-bb62-f94a1053d018", "Athur Ledain")]),
    Merge("58cca5c0-0120-5bf1-a40e-ae4f46712dc1", "Jaakko Inkinen",
          [("b097c320-f6cb-5350-8a0e-7e47a3b0338b", "Jaako Inkinen"),
           ("01f4574f-4ac1-5479-a3cb-cda9c142477e", "Jakko Inkinen")]),
    Merge("3d1a7216-f5c6-58ef-b850-743fe1db4cc9", "Jani Lirkki",
          [("6230ab0e-7a5d-59a0-aee4-47a4b8fb25c9", "Janni Lirkki")]),
    Merge("dad697e8-36ed-598e-84b3-8105a2868685", "Guillaume Degat",
          [("e7a8d967-1cd4-5bb3-a6b4-df3d02f5261f", "Guilaume Degat")]),
    Merge("c476f406-2f03-5f67-88aa-f90dcc36ac42", "Justin Eichenlaub",
          [("2c008ccf-e10d-5cb4-b4e0-1a2e8285c616", "Justin Eichlaub")]),
    Merge("c2c56323-1121-5a07-8416-5aca5fa1ce00", "Johnny Sarah",
          [("6567aee8-0162-5a1b-81a2-9ad7796a0cc4", "Johhny Sarah"),
           ("21d690c8-a897-54d4-a7fc-2981f4a33852", "Johny Sarah")]),
    Merge("d1aace44-cd92-5b85-9ed1-fe4afb2cd502", "Ken Somolinos",
          [("1aa73959-e3a8-509b-9bc5-95f734e5c653", "Ken Somolino")]),
    Merge("bd97ebe2-5ecd-5854-9d2e-b877a27ac527", "Daryl Genz",
          [("93058512-dda3-563d-8738-429082c7630c", "Darryl Genz")]),
    Merge("31bd4e75-1a44-56b4-94b3-071cdc8dee82", "Jeremy Mirken",
          [("8dcb2d11-b913-536d-9308-1844c57aba26", "Jeremey Mirken"),
           ("8e976f2a-c515-53dd-9314-e0dc96d95930", "Jermey Mirken")]),
    Merge("ce7e0e5a-0d7f-542c-8d5d-fb4895184909", "Max Kerkhoff",
          [("17fb4250-ce1e-5357-99ed-f379322ec898", "Max Kerkoff")]),
    Merge("947f45c0-78b1-5c03-ae2e-ab431b5ae491", "Mika Koistinen",
          [("10a47c6a-00a3-5c9f-ae09-ab668c8e9c4c", "Mikka Koistinen")]),
    Merge("6dd904b7-11c6-5d62-af34-dad61040e67e", "Sebastien Duchesne",
          [("108bf1c9-a829-5dfd-adb3-3ee4ba8d3b6c", "Sébasteien Duchesne")]),
    Merge("f569a985-6548-5b3d-9322-5e2c764bcc11", "Robert Lavigne",
          [("290519a0-7c5d-5068-98a5-ec9f8847801f", "Rober Lavign")]),
    Merge("f1f49edd-da47-536a-b759-de441795fc2f", "Cory Current",
          [("4f88ab52-2627-5f0c-9c6b-13b173c86228", "Corey Current")]),
    Merge("da228355-48d6-5112-8208-97793d324412", "Thorsten Schäfer",
          [("92c90802-658e-5995-b2f6-fbd5d9c8ec4a", "Thorsten Schaefer"),
           ("5a898a66-990c-5bb0-a0e4-fa74539c1b61", "Torsten Schaefer")]),
    Merge("a6e260ae-74e5-5ef5-8b20-d7c2fbd65b83", "Jon Lind",
          [("290ed496-1837-57fd-820d-a907ba6ea20b", "John Lind")]),
    Merge("b6324016-900b-5b30-86d7-5a1d9dde113e", "Michal Sauren",
          [("e7f08a8a-b913-555d-bd73-081a2b1b53b9", "Michael Sauren")]),
    Merge("8f22bf52-7920-5746-9a5d-8930b5e1da81", "Tomas Laboutka",
          [("eb59af92-1734-525c-b929-34e8e9ab8dc3", "Thomas Laboutka")]),
    Merge("4e6f43e2-e696-59ca-81f1-8f45729a2df4", "Nicolas Janin",
          [("60f2f097-5583-5ef1-afc0-d077656d1026", "Nicholas Janin")]),
    Merge("f5204064-f32c-562e-9cfe-9820060fc8e3", "Antony Arnaud",
          [("07b2ad01-ccb8-5acf-ac37-d8a7261e5a73", "Anthony Arnaud")]),
    Merge("1ef51b9d-a795-592e-8d0c-46184f784bf4", "Phillip Schaefer",
          [("50cbe690-5881-512c-8f73-c25839dc675b", "Philip Schäfer"),
           ("b8094062-435d-5140-ae69-045431f6be23", "Phillipp Schäfer")]),
    Merge("71a137ee-eae2-5404-9d1c-b5edbceff47e", "David Sandrik",
          [("6b0a72d8-a985-5548-a3fa-5a359e0043c3", "David Andrik")]),
    Merge("73733b5e-6e77-5f59-b29c-e2354619bddb", "Ondrej Skrabal",
          [("1e3db10c-d1c8-5361-8560-76b21edbe9f1", "Ondrej Krabal")]),
    Merge("249b7568-9f0d-58db-8528-391c2ef34aa0", "Hanka Kusnjerová",
          [("e478501f-05bf-5198-bfbe-160f2c68b45e", "Haka Kusnjerová")]),
    Merge("61656316-f92f-5235-a6fd-e3218d5601f8", "Jim Hankins",
          [("069371cb-847f-5c68-a3dd-7b1171999566", "Jim Hankin")]),
    Merge("2d338829-1ec2-5f5c-9910-bccbf1252af3", "Kaiser Ahmad",
          [("c30e873d-5093-5b8f-a1e7-6790caf3bb05", "Kaiser Amad")]),
    Merge("58e6ac47-fc96-5e9d-9121-99ef6927e939", "Gergo Csallo",
          [("e19b83c1-2185-53eb-bc64-2d8800618f3e", "Georgo Csallo")]),
    Merge("1845d6ee-79c0-57bb-8474-0139e2a4e555", "Lassad Yacoub",
          [("67e21d6a-cfdc-5ecd-a023-66eed90ce770", "Lassd Yacoub")]),
    Merge("d47ff105-1ef4-5474-8580-a2aa69d104ab", "Natalia Fry",
          [("5eaa3535-50ff-5f8f-94c1-18a4b5ea4fed", "Natalia Fryś")]),
    Merge("c27376a4-743e-59d6-afe4-de633ef0b323", "Flipp Derr",
          [("d5cd223b-d711-5f67-8a82-132058b92eb3", "Flip Derr")]),
    Merge("ebad1497-e45b-538a-a18a-0a3cda5d730c", "Lisa Uebele",
          [("e368b23b-3c07-55eb-847f-a1181e820e97", "Lisa Übele")]),
    Merge("995409d3-edde-58b5-806a-029f05ad5047", "Barthélémy Meridjen",
          [("c653acac-232c-57bf-a21f-69168681b046", "Bathélémy Meridjen")]),
    Merge("d9a7e5f1-4575-53df-8031-84d5ae7ac7f0", "Darwins Mora",
          [("602f9e26-8ece-549f-8ab6-13e2f1e7affe", "Darwin Mora")]),
    Merge("082830d4-4364-51eb-88e6-90d00f98411d", "Natacha Mercure",
          [("e0385a8b-7610-5981-b32f-78a3699e7ff9", "Nathacha Mercure")]),
    Merge("e3de11aa-d25a-509d-ba0f-11b14f609cb6", "Mael Le Gall",
          [("6b76e4a5-d1e8-51b1-b623-9c35758632ee", "Maël LeGall")]),
    Merge("9337337c-b3c1-53a6-9f38-ee3923ef6c13", "Fabien Riffaud",
          [("476c0482-e7af-5795-893d-6a2900ab235b", "Fabien Riffau")]),
]

# Doomed rows that own placements in the lock: (player rows, team rows).
OWNS_PLACEMENTS = {
    "e5a6f257-390d-5df7-8cb0-5832e2855573": (79, 2),
    "2f7336f6-7201-5e28-93a9-33b2f5183f9e": (29, 7),
    "112d09c8-3761-585b-904a-a4b51003400b": (9, 0),
    "77077fa3-e070-5728-87d5-88c81b58466a": (6, 5),
    "6ad61bb2-30ae-5886-bb62-f94a1053d018": (1, 0),
    "b097c320-f6cb-5350-8a0e-7e47a3b0338b": (2, 2),
    "01f4574f-4ac1-5479-a3cb-cda9c142477e": (1, 0),
    "6230ab0e-7a5d-59a0-aee4-47a4b8fb25c9": (1, 0),
    "e7a8d967-1cd4-5bb3-a6b4-df3d02f5261f": (1, 0),
    "2c008ccf-e10d-5cb4-b4e0-1a2e8285c616": (1, 0),
    "6567aee8-0162-5a1b-81a2-9ad7796a0cc4": (1, 0),
    "21d690c8-a897-54d4-a7fc-2981f4a33852": (1, 0),
    "1aa73959-e3a8-509b-9bc5-95f734e5c653": (2, 0),
    "93058512-dda3-563d-8738-429082c7630c": (3, 0),
    "8dcb2d11-b913-536d-9308-1844c57aba26": (1, 0),
    "8e976f2a-c515-53dd-9314-e0dc96d95930": (1, 1),
    "17fb4250-ce1e-5357-99ed-f379322ec898": (1, 0),
    "108bf1c9-a829-5dfd-adb3-3ee4ba8d3b6c": (1, 0),
    "290519a0-7c5d-5068-98a5-ec9f8847801f": (1, 0),
    "4f88ab52-2627-5f0c-9c6b-13b173c86228": (1, 1),
    "92c90802-658e-5995-b2f6-fbd5d9c8ec4a": (3, 2),
    "5a898a66-990c-5bb0-a0e4-fa74539c1b61": (1, 0),
    "290ed496-1837-57fd-820d-a907ba6ea20b": (1, 0),
    "e7f08a8a-b913-555d-bd73-081a2b1b53b9": (0, 0),
    "60f2f097-5583-5ef1-afc0-d077656d1026": (2, 0),
    "07b2ad01-ccb8-5acf-ac37-d8a7261e5a73": (3, 1),
    "50cbe690-5881-512c-8f73-c25839dc675b": (0, 3),
    "b8094062-435d-5140-ae69-045431f6be23": (1, 1),
    "6b0a72d8-a985-5548-a3fa-5a359e0043c3": (1, 0),
    "1e3db10c-d1c8-5361-8560-76b21edbe9f1": (1, 0),
    "e478501f-05bf-5198-bfbe-160f2c68b45e": (1, 0),
    "069371cb-847f-5c68-a3dd-7b1171999566": (0, 1),
    "c30e873d-5093-5b8f-a1e7-6790caf3bb05": (1, 0),
    "e19b83c1-2185-53eb-bc64-2d8800618f3e": (0, 1),
    "67e21d6a-cfdc-5ecd-a023-66eed90ce770": (1, 0),
    "5eaa3535-50ff-5f8f-94c1-18a4b5ea4fed": (2, 1),
    "d5cd223b-d711-5f67-8a82-132058b92eb3": (1, 0),
    "e368b23b-3c07-55eb-847f-a1181e820e97": (0, 4),
    "c653acac-232c-57bf-a21f-69168681b046": (0, 1),
    "602f9e26-8ece-549f-8ab6-13e2f1e7affe": (0, 2),
    "e0385a8b-7610-5981-b32f-78a3699e7ff9": (1, 0),
    "6b76e4a5-d1e8-51b1-b623-9c35758632ee": (1, 0),
    "476c0482-e7af-5795-893d-6a2900ab235b": (1, 0),
}
EXPECTED_DOOMED = 45

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
            exclusion = d["exclusion_reason"].strip()
            if exclusion and not (pid in PLACEHOLDER_ROWS and exclusion == PLACEHOLDER_EXCLUSION):
                raise AssertionError(f"doomed {canon} carries an exclusion")
            if pid in PLACEHOLDER_ROWS and exclusion != PLACEHOLDER_EXCLUSION:
                raise AssertionError(f"doomed {canon} is listed as a placeholder but carries {exclusion!r}")
            if _pipe(d["player_ids_seen"]) and pid not in OWNS_PLACEMENTS:
                raise AssertionError(f"doomed {canon} carries player ids")
            # A row minted as a new person lists its own person id as its only
            # player id; that is not a parser player id and does not survive it.
            ids |= set(_pipe(d["player_ids_seen"])) - {pid}
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
    total = [sum(v[i] for v in moved.values()) for i in (0, 1)]
    print(f"{PBP.relative_to(ROOT)}: {total[0]} player and {total[1]} team row(s) moved")


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
        resolves.setdefault(normalize_name(r["alias"]), r["person_id"])
        out.append(line)
    added = 0
    for m in MERGES:
        for _, spelling in m.doomed:
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
