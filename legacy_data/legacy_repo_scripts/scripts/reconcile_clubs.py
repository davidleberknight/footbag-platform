#!/usr/bin/env python3
"""
reconcile_clubs.py — read-only reconciliation audit: legacy clubs/clubcontacts DB
(parsed NDJSON) vs the mirror-derived bootstrap source (legacy_data/seed/clubs.csv).

AUDIT ONLY. No imports, no production writes, no schema changes. Deterministic
matching (ClubID == legacy_club_key, plus normalized-name clustering). Contact
linkage is reported as AGGREGATE counts only; no member-id values are emitted.

Outputs:
  - a per-club reconciliation CSV (club-level fields + flags; no member ids)
  - a stats summary to stdout (consumed by the markdown audit)
"""
import csv
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DB_CLUBS = os.path.join(ROOT, "legacy_data/legacy_repo_scripts/parsed/clubs/clubs.ndjson")
DB_CONTACTS = os.path.join(ROOT, "legacy_data/legacy_repo_scripts/parsed/clubs/clubcontacts.ndjson")
MIRROR = os.path.join(ROOT, "legacy_data/seed/clubs.csv")
OUT_CSV = os.path.join(ROOT, "exploration/SGoldberg/clubs-reconciliation-data-2026-06-03.csv")


def norm(s):
    if s is None:
        return ""
    return re.sub(r"[^a-z0-9]+", " ", str(s).lower()).strip()


def load_ndjson(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def main():
    db_rows = load_ndjson(DB_CLUBS)
    contacts = load_ndjson(DB_CONTACTS)
    with open(MIRROR, newline="", encoding="utf-8") as f:
        mirror_rows = list(csv.DictReader(f))

    # index by key
    db = {r["ClubID"]: r for r in db_rows}                       # ClubID is unique in DB
    mirror_by_key = {}
    mirror_dup_keys = 0
    for r in mirror_rows:
        k = r["legacy_club_key"]
        if k in mirror_by_key:
            mirror_dup_keys += 1
        mirror_by_key.setdefault(k, []).append(r)

    # contacts: club -> count of contact rows, and whether any contact member present
    contact_count = {}
    club_members = {}   # ClubID -> set of contact member ids (from clubcontacts, authoritative)
    for c in contacts:
        cid = c.get("ContactClubID")
        contact_count[cid] = contact_count.get(cid, 0) + 1
        mid = str(c.get("ContactMemberID") or "").strip()
        if mid not in ("", "0", "None"):
            club_members.setdefault(cid, set()).add(mid)

    db_keys, mirror_keys = set(db), set(mirror_by_key)
    both = db_keys & mirror_keys
    db_only = db_keys - mirror_keys
    mirror_only = mirror_keys - db_keys

    # field comparison on matched keys (deterministic, normalized)
    name_match = city_match = country_match = 0
    name_conf = city_conf = country_conf = 0
    contact_agree = contact_db_only = contact_mirror_only = contact_both_disagree = 0
    rows_csv = []
    for k in sorted(both):
        d = db[k]
        m = mirror_by_key[k][0]
        nm = norm(d.get("Name")) == norm(m.get("name"))
        cm = norm(d.get("City")) == norm(m.get("city"))
        com = norm(d.get("Country")) == norm(m.get("country"))
        name_match += nm; city_match += cm; country_match += com
        if not nm and norm(d.get("Name")) and norm(m.get("name")): name_conf += 1
        if not cm and norm(d.get("City")) and norm(m.get("city")): city_conf += 1
        if not com and norm(d.get("Country")) and norm(m.get("country")): country_conf += 1
        # contact linkage (aggregate only; DB contacts from the clubcontacts table)
        db_members = club_members.get(k, set())
        mi_cm = str(m.get("contact_member_id") or "").strip()
        db_has = len(db_members) > 0
        mi_has = mi_cm not in ("", "0", "None")
        if db_has and mi_has:
            if mi_cm in db_members: contact_agree += 1
            else: contact_both_disagree += 1
        elif db_has: contact_db_only += 1
        elif mi_has: contact_mirror_only += 1
        rows_csv.append({
            "ClubID": k, "in_db": 1, "in_mirror": 1,
            "db_approved": d.get("Approved"),
            "db_name": d.get("Name"), "mirror_name": m.get("name"),
            "name_match": int(nm), "city_match": int(cm), "country_match": int(com),
            "db_has_contact": int(db_has), "mirror_has_contact": int(mi_has),
            "db_contact_rows": contact_count.get(k, 0),
        })

    # name-cluster duplicates (same normalized name, >1 distinct key)
    def clusters(rows, key, namef):
        m = {}
        for r in rows:
            n = norm(namef(r))
            if n:
                m.setdefault(n, set()).add(r[key])
        return sum(1 for n, ks in m.items() if len(ks) > 1)

    db_name_clusters = clusters(db_rows, "ClubID", lambda r: r.get("Name"))
    mirror_name_clusters = clusters(mirror_rows, "legacy_club_key", lambda r: r.get("name"))

    # Approved breakdown
    appr = {}
    for r in db_rows:
        appr[str(r.get("Approved"))] = appr.get(str(r.get("Approved")), 0) + 1
    db_only_appr = {}
    for k in db_only:
        a = str(db[k].get("Approved"))
        db_only_appr[a] = db_only_appr.get(a, 0) + 1

    # write db-only and mirror-only marker rows to the CSV too
    for k in sorted(db_only):
        d = db[k]
        rows_csv.append({"ClubID": k, "in_db": 1, "in_mirror": 0, "db_approved": d.get("Approved"),
                         "db_name": d.get("Name"), "mirror_name": "", "name_match": "", "city_match": "",
                         "country_match": "", "db_has_contact": int(len(club_members.get(k, set())) > 0),
                         "mirror_has_contact": "", "db_contact_rows": contact_count.get(k, 0)})
    for k in sorted(mirror_only):
        m = mirror_by_key[k][0]
        rows_csv.append({"ClubID": k, "in_db": 0, "in_mirror": 1, "db_approved": "",
                         "db_name": "", "mirror_name": m.get("name"), "name_match": "", "city_match": "",
                         "country_match": "", "db_has_contact": "",
                         "mirror_has_contact": int(str(m.get("contact_member_id") or "").strip() not in ("","0","None")),
                         "db_contact_rows": ""})

    os.makedirs(os.path.dirname(OUT_CSV), exist_ok=True)
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows_csv[0].keys()))
        w.writeheader()
        w.writerows(rows_csv)

    clubs_with_contacts = sum(1 for k in db_keys if contact_count.get(k, 0) > 0)
    print(json.dumps({
        "db_clubs": len(db_keys), "mirror_rows": len(mirror_rows), "mirror_unique_keys": len(mirror_keys),
        "mirror_duplicate_key_rows": mirror_dup_keys,
        "overlap_both": len(both), "db_only": len(db_only), "mirror_only": len(mirror_only),
        "matched_name_match": name_match, "matched_city_match": city_match, "matched_country_match": country_match,
        "matched_name_conflicts": name_conf, "matched_city_conflicts": city_conf, "matched_country_conflicts": country_conf,
        "db_name_clusters_gt1": db_name_clusters, "mirror_name_clusters_gt1": mirror_name_clusters,
        "approved_breakdown": appr, "db_only_approved_breakdown": db_only_appr,
        "db_clubcontacts_total": len(contacts), "db_clubs_with_contact_rows": clubs_with_contacts,
        "contact_agree": contact_agree, "contact_disagree": contact_both_disagree,
        "contact_db_only": contact_db_only, "contact_mirror_only": contact_mirror_only,
        "out_csv": OUT_CSV,
    }, indent=2))


if __name__ == "__main__":
    main()
