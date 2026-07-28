#!/usr/bin/env python3
"""Merge every Hall of Fame source into one record per honoree.

Five sources describe the Hall of Fame and no two of them agree completely:

  the curated roster, which is the only one carrying a resolved person id;
  the legacy site's reference year pages, which carry the induction sequence
  number and the honoree interviews;
  the legacy site's own group roster, which carries country and covers honorees
  whose year page never went up;
  the Hall of Fame site, which carries the biographies, the photographs, and the
  only years for honorees inducted after the legacy site stopped publishing;
  the platform database, which carries the competition record and the legacy
  account behind each honoree.

This merges them and, where they disagree, says so instead of choosing. Honorees
are matched through the identity layer rather than by comparing spellings,
because the same person is spelled differently on nearly every source and
similarity matching pairs the wrong people: two honorees who share a surname
match each other before they match themselves.

Read-only. Writes the merged record, the disagreements, the induction years that
are safe to fill, the honorees no source can date, and the name spellings the
identity layer does not yet know. Nothing here edits the curated roster or the
alias registry: both are curator files, and a merge that silently rewrote them
would destroy the evidence a reviewer needs.

The merged record carries personal data and belongs in the maintainers' private
operations repository, not in this one.
"""
from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY_ROOT = REPO_ROOT / "legacy_data"

sys.path.insert(0, str(LEGACY_ROOT))
from pipeline.identity.alias_resolver import load_default_resolver, normalize_name  # noqa: E402

CURATED_ROSTER = LEGACY_ROOT / "inputs" / "hof.csv"
# The committed persons snapshot, which is also what the identity layer resolves
# against. The mid-pipeline copy under out/ holds whichever shape the last stage
# to run left behind, so reading it would make the merge depend on how the
# pipeline was invoked.
CANONICAL_PERSONS = LEGACY_ROOT / "event_results" / "canonical_input" / "persons.csv"
YEAR_PAGES_CSV = LEGACY_ROOT / "out" / "hof" / "hof_year_pages.csv"
GROUP_ROSTER_CSV = LEGACY_ROOT / "out" / "hof" / "hof_group_roster.csv"
SITE_MEMBERS_CSV = LEGACY_ROOT / "out" / "hof" / "hof_site_members.csv"
DEFAULT_DB = REPO_ROOT / "database" / "footbag.db"
OUTPUT_DIR = LEGACY_ROOT / "out" / "hof"

DOSSIER_JSON = OUTPUT_DIR / "hof_dossier.json"
DOSSIER_CSV = OUTPUT_DIR / "hof_dossier.csv"
CONFLICTS_CSV = OUTPUT_DIR / "hof_source_conflicts.csv"
PROPOSALS_CSV = OUTPUT_DIR / "hof_year_proposals.csv"
GAPS_CSV = OUTPUT_DIR / "hof_gaps.csv"
VARIANTS_CSV = OUTPUT_DIR / "hof_name_variant_candidates.csv"

CURATED = "curated_roster"
YEAR_PAGE = "mirror_year_page"
GROUP_ROSTER = "mirror_group_roster"
HOF_SITE = "hall_of_fame_site"

# The legacy account columns the dossier carries. Contact details, address,
# birth date and gender are deliberately absent: none of them says anything
# about the honor, and a record that does not hold them cannot leak them.
LEGACY_ACCOUNT_COLUMNS = [
    "legacy_member_id",
    "legacy_user_id",
    "display_name",
    "city",
    "region",
    "country",
    "bio",
    "ifpa_join_date",
    "first_competition_year",
    "is_hof",
    "is_bap",
]

# Person-layer facts that live only in the database. The deceased flag is here
# because the honor outlives the personal data and a curator working through
# these records needs to know who can still be asked about their own entry.
PERSON_COLUMNS = ["aliases", "is_deceased", "notes", "source", "source_scope"]


DOSSIER_FIELDNAMES = [
    "person_id",
    "canonical_name",
    "curated_name",
    "induction_year",
    "induction_year_status",
    "induction_year_sources",
    "induction_number",
    "country",
    "legacy_username",
    "legacy_member_id",
    "legacy_city",
    "legacy_region",
    "ifpa_join_date",
    "first_year",
    "last_year",
    "event_count",
    "placement_count",
    "bap_member",
    "bap_induction_year",
    "hof_site_url",
    "hof_site_photo_count",
    "has_site_bio",
    "has_interview",
    "name_spellings",
]

CONFLICT_FIELDNAMES = ["person_id", "display_name", "field", "source", "value"]
PROPOSAL_FIELDNAMES = ["person_id", "curated_name", "proposed_year", "agreeing_sources", "evidence"]
GAP_FIELDNAMES = ["kind", "person_id", "name", "detail"]
VARIANT_FIELDNAMES = ["variant_name", "canonical_name", "person_id", "seen_on"]


def read_csv(path):
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def _first_non_empty(*values):
    for value in values:
        if value and str(value).strip():
            return str(value).strip()
    return ""


class Matcher:
    """Resolve a published name to the honoree it belongs to.

    The identity layer answers first, because it is the project's only identity
    authority and already knows most of the spelling differences between these
    sources. The curated roster's own names are the second answer, so an honoree
    the identity layer has never seen still matches the roster row that names
    them. Anything left over is reported rather than guessed at.
    """

    def __init__(self, resolver, curated_rows):
        self.resolver = resolver
        self.by_curated_name = {}
        for row in curated_rows:
            key = normalize_name(row.get("full_name", ""))
            person_id = (row.get("person_id") or "").strip()
            if key and person_id:
                self.by_curated_name.setdefault(key, person_id)

    def match(self, name):
        key = normalize_name(name)
        if not key:
            return None
        return self.by_curated_name.get(key) or self.resolver.resolve(name)


def load_database_facts(db_path):
    """Person-layer and legacy account facts, keyed by canonical person id."""
    if not db_path.exists():
        return {}
    columns = ", ".join(
        [f"hp.{column}" for column in PERSON_COLUMNS]
        + [f"lm.{column}" for column in LEGACY_ACCOUNT_COLUMNS]
    )
    connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            f"SELECT hp.person_id AS person_id, {columns} "
            "FROM historical_persons hp "
            "LEFT JOIN legacy_members lm ON lm.legacy_member_id = hp.legacy_member_id"
        ).fetchall()
    finally:
        connection.close()
    return {
        row["person_id"]: {
            "person": {c: row[c] for c in PERSON_COLUMNS if row[c] not in (None, "")},
            "legacy_account": {c: row[c] for c in LEGACY_ACCOUNT_COLUMNS if row[c] not in (None, "")},
        }
        for row in rows
    }


def build_records(sources, matcher):
    """One record per honoree, plus the source rows that matched no honoree."""
    curated, persons, year_pages, roster, site, db_facts = sources
    records = {}
    unmatched = []

    def record_for(person_id):
        if person_id not in records:
            person = persons.get(person_id, {})
            records[person_id] = {
                "person_id": person_id,
                "canonical_name": person.get("person_name", ""),
                "curated_name": "",
                "induction_year_by_source": {},
                "induction_year_evidence": {},
                "induction_number": "",
                "country_by_source": {},
                "name_spellings": {},
                "hall_of_fame_site": {},
                "mirror_year_page": {},
                "person_layer": {},
                "legacy_account": {},
                "competition": {},
                "honors": {},
                "curated": {},
            }
        return records[person_id]

    for row in curated:
        person_id = (row.get("person_id") or "").strip() or matcher.match(row.get("full_name", ""))
        if not person_id:
            unmatched.append((CURATED, row.get("full_name", ""), "no person id and no identity match"))
            continue
        record = record_for(person_id)
        record["curated_name"] = row.get("full_name", "")
        record["curated"] = {
            "source_url": row.get("source_url", ""),
            "notes": row.get("notes", ""),
        }
        record["name_spellings"].setdefault(row.get("full_name", ""), []).append(CURATED)
        if (row.get("induction_year") or "").strip():
            record["induction_year_by_source"][CURATED] = row["induction_year"].strip()

    for row in year_pages:
        person_id = matcher.match(row["published_name"])
        if not person_id:
            unmatched.append((YEAR_PAGE, row["published_name"], f"year page {row['induction_year']}"))
            continue
        record = record_for(person_id)
        record["induction_year_by_source"][YEAR_PAGE] = row["induction_year"]
        record["induction_number"] = row["induction_number"]
        record["name_spellings"].setdefault(row["published_name"], []).append(YEAR_PAGE)
        record["mirror_year_page"] = {
            "legacy_username": row["legacy_username"],
            "first_footbag": row["first_footbag"],
            "personal_notes": row["personal_notes"],
            "achievements": row["achievements"],
            "sport_future": row["sport_future"],
            "image_names": [name for name in row["image_names"].split("|") if name],
            "source_page": row["source_page"],
        }

    for row in roster:
        person_id = matcher.match(row["published_name"])
        if not person_id:
            unmatched.append((GROUP_ROSTER, row["published_name"], f"roster {row['induction_year']}"))
            continue
        record = record_for(person_id)
        record["induction_year_by_source"][GROUP_ROSTER] = row["induction_year"]
        record["country_by_source"][GROUP_ROSTER] = row["country"]
        record["name_spellings"].setdefault(row["published_name"], []).append(GROUP_ROSTER)

    for row in site:
        person_id = matcher.match(row["display_name"])
        if not person_id:
            unmatched.append((HOF_SITE, row["display_name"], f"site page {row['url']}"))
            continue
        record = record_for(person_id)
        if row["induction_year"]:
            record["induction_year_by_source"][HOF_SITE] = row["induction_year"]
            record["induction_year_evidence"][HOF_SITE] = row["year_evidence"]
        record["name_spellings"].setdefault(row["display_name"], []).append(HOF_SITE)
        record["hall_of_fame_site"] = {
            "slug": row["slug"],
            "url": row["url"],
            "bio": row["bio"],
            "image_urls": [url for url in row["image_urls"].split("|") if url],
            "published_date": row["published_date"],
            "author": row["author"],
            "year_candidates": [year for year in row["year_candidates"].split("|") if year],
        }

    for person_id, record in records.items():
        person = persons.get(person_id, {})
        record["competition"] = {
            "first_year": person.get("first_year", ""),
            "last_year": person.get("last_year", ""),
            "event_count": person.get("event_count", ""),
            "placement_count": person.get("placement_count", ""),
        }
        record["honors"] = {
            "bap_member": person.get("bap_member", ""),
            "bap_nickname": person.get("bap_nickname", ""),
            "bap_induction_year": person.get("bap_induction_year", ""),
        }
        if person.get("country"):
            record["country_by_source"]["canonical_persons"] = person["country"]
        facts = db_facts.get(person_id, {})
        record["person_layer"] = facts.get("person", {})
        record["legacy_account"] = facts.get("legacy_account", {})
        if record["legacy_account"].get("country"):
            record["country_by_source"]["legacy_account"] = record["legacy_account"]["country"]

    return records, unmatched


def settle_year(record):
    """The induction year and how the sources stand on it.

    Agreement across every source that has an opinion is a fact. A disagreement
    the curated roster does not speak to is left unset, because the sources are
    all fallible, none outranks the others on the raw evidence, and a merge that
    picked one would bury the conflict a curator needs to see.

    A year in the curated roster is different: it is the ruling a person made
    after looking at that conflict. It stands, and the dissenting source is still
    reported so the disagreement stays visible rather than disappearing behind
    the ruling.
    """
    by_source = record["induction_year_by_source"]
    distinct = sorted(set(by_source.values()))
    if not distinct:
        return "", "no source states a year"
    if len(distinct) == 1:
        return distinct[0], "sources agree" if len(by_source) > 1 else "single source"
    curated = by_source.get(CURATED, "")
    if curated:
        return curated, "curated ruling over a dissenting source"
    return "", "sources disagree"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="Platform database to read the legacy account facts from.")
    args = parser.parse_args()

    missing = [path for path in (CURATED_ROSTER, YEAR_PAGES_CSV, GROUP_ROSTER_CSV) if not path.exists()]
    if missing:
        print(
            "ERROR: missing merge inputs:\n"
            + "\n".join(f"  {path}" for path in missing)
            + "\nRun legacy_data/scripts/extract_hof_mirror.py to produce the mirror extracts.",
            file=sys.stderr,
        )
        sys.exit(1)

    curated = read_csv(CURATED_ROSTER)
    persons = {row["person_id"]: row for row in read_csv(CANONICAL_PERSONS)}
    site = read_csv(SITE_MEMBERS_CSV)
    if not site:
        print(
            f"WARNING: no Hall of Fame site capture at {SITE_MEMBERS_CSV}, so the "
            f"biographies, photographs and the post-2016 induction years are absent "
            f"from this merge. Run legacy_data/scripts/capture_hof_site.py to add them.",
            file=sys.stderr,
        )
    db_facts = load_database_facts(args.db)
    if not db_facts:
        print(
            f"WARNING: no platform database at {args.db}, so the legacy account facts "
            f"are absent from this merge.",
            file=sys.stderr,
        )

    resolver = load_default_resolver()
    matcher = Matcher(resolver, curated)
    records, unmatched = build_records(
        (curated, persons, read_csv(YEAR_PAGES_CSV), read_csv(GROUP_ROSTER_CSV), site, db_facts),
        matcher,
    )

    dossier_rows = []
    conflict_rows = []
    proposal_rows = []
    gap_rows = []
    variant_rows = []

    for person_id, record in sorted(records.items(), key=lambda item: item[1]["curated_name"] or item[1]["canonical_name"]):
        year, status = settle_year(record)
        record["induction_year"] = year
        record["induction_year_status"] = status
        display = record["curated_name"] or record["canonical_name"]

        # A ruled disagreement is still a disagreement: the ruling settles which
        # year ships, and this file stays the place a curator sees that the
        # sources never actually agreed.
        if len(set(record["induction_year_by_source"].values())) > 1:
            for source, value in sorted(record["induction_year_by_source"].items()):
                conflict_rows.append(
                    {
                        "person_id": person_id,
                        "display_name": display,
                        "field": "induction_year",
                        "source": source,
                        "value": value,
                    }
                )

        # A proposal is an edit to a curated roster row, so an honoree with no
        # row to edit gets none; they are reported as missing from the roster
        # instead, which is the decision that has to come first.
        curated_year = record["induction_year_by_source"].get(CURATED, "")
        if year and not curated_year and record["curated_name"]:
            proposal_rows.append(
                {
                    "person_id": person_id,
                    "curated_name": record["curated_name"],
                    "proposed_year": year,
                    "agreeing_sources": "|".join(sorted(record["induction_year_by_source"])),
                    "evidence": _first_non_empty(*record["induction_year_evidence"].values())
                    or record.get("mirror_year_page", {}).get("source_page", ""),
                }
            )

        if not year:
            gap_rows.append(
                {
                    "kind": "no induction year",
                    "person_id": person_id,
                    "name": display,
                    "detail": status,
                }
            )
        if not record["curated_name"]:
            gap_rows.append(
                {
                    "kind": "not on the curated roster",
                    "person_id": person_id,
                    "name": display,
                    "detail": "|".join(sorted(record["name_spellings"])),
                }
            )

        for spelling, seen_on in sorted(record["name_spellings"].items()):
            if resolver.resolve(spelling) or not spelling:
                continue
            variant_rows.append(
                {
                    "variant_name": spelling,
                    "canonical_name": record["canonical_name"] or record["curated_name"],
                    "person_id": person_id,
                    "seen_on": "|".join(sorted(set(seen_on))),
                }
            )

        site_record = record["hall_of_fame_site"]
        legacy = record["legacy_account"]
        dossier_rows.append(
            {
                "person_id": person_id,
                "canonical_name": record["canonical_name"],
                "curated_name": record["curated_name"],
                "induction_year": year,
                "induction_year_status": status,
                "induction_year_sources": "|".join(
                    f"{source}:{value}" for source, value in sorted(record["induction_year_by_source"].items())
                ),
                "induction_number": record["induction_number"],
                "country": _first_non_empty(
                    record["country_by_source"].get(GROUP_ROSTER),
                    record["country_by_source"].get("canonical_persons"),
                    record["country_by_source"].get("legacy_account"),
                ),
                "legacy_username": _first_non_empty(
                    record.get("mirror_year_page", {}).get("legacy_username"),
                    legacy.get("legacy_user_id"),
                ),
                "legacy_member_id": legacy.get("legacy_member_id", ""),
                "legacy_city": legacy.get("city", ""),
                "legacy_region": legacy.get("region", ""),
                "ifpa_join_date": legacy.get("ifpa_join_date", ""),
                "first_year": record["competition"]["first_year"],
                "last_year": record["competition"]["last_year"],
                "event_count": record["competition"]["event_count"],
                "placement_count": record["competition"]["placement_count"],
                "bap_member": record["honors"]["bap_member"],
                "bap_induction_year": record["honors"]["bap_induction_year"],
                "hof_site_url": site_record.get("url", ""),
                "hof_site_photo_count": len(site_record.get("image_urls", [])),
                "has_site_bio": "yes" if site_record.get("bio") else "no",
                "has_interview": "yes" if any(
                    record.get("mirror_year_page", {}).get(field)
                    for field in ("first_footbag", "personal_notes", "achievements", "sport_future")
                ) else "no",
                "name_spellings": "|".join(sorted(record["name_spellings"])),
            }
        )

    for source, name, detail in unmatched:
        gap_rows.append(
            {
                "kind": "source name matched no honoree",
                "person_id": "",
                "name": name,
                "detail": f"{source}: {detail}",
            }
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for path, fieldnames, rows in (
        (DOSSIER_CSV, DOSSIER_FIELDNAMES, dossier_rows),
        (CONFLICTS_CSV, CONFLICT_FIELDNAMES, conflict_rows),
        (PROPOSALS_CSV, PROPOSAL_FIELDNAMES, proposal_rows),
        (GAPS_CSV, GAP_FIELDNAMES, gap_rows),
        (VARIANTS_CSV, VARIANT_FIELDNAMES, variant_rows),
    ):
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

    ordered = sorted(
        records.values(), key=lambda record: record["curated_name"] or record["canonical_name"]
    )
    for record in ordered:
        record["name_spellings"] = {
            spelling: sorted(set(seen_on)) for spelling, seen_on in sorted(record["name_spellings"].items())
        }
    DOSSIER_JSON.write_text(json.dumps(ordered, indent=2, ensure_ascii=False, sort_keys=True), encoding="utf-8")

    dated = sum(1 for row in dossier_rows if row["induction_year"])
    contributing = [
        label
        for label, rows in (
            (CURATED, curated),
            (YEAR_PAGE, read_csv(YEAR_PAGES_CSV)),
            (GROUP_ROSTER, read_csv(GROUP_ROSTER_CSV)),
            (HOF_SITE, site),
            ("platform_database", db_facts),
        )
        if rows
    ]
    print(f"Merged {len(dossier_rows)} honorees from: {', '.join(contributing)}.")
    print(f"  induction year known: {dated}; unknown: {len(dossier_rows) - dated}")
    print(f"  {len(proposal_rows)} year(s) proposed for the curated roster -> {PROPOSALS_CSV}")
    print(f"  {len(conflict_rows)} conflicting source value(s) -> {CONFLICTS_CSV}")
    print(f"  {len(gap_rows)} gap(s) -> {GAPS_CSV}")
    print(f"  {len(variant_rows)} name spelling(s) the identity layer does not know -> {VARIANTS_CSV}")
    print(f"  dossier -> {DOSSIER_JSON} and {DOSSIER_CSV}")


if __name__ == "__main__":
    main()
