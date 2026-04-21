# legacy_data/persons/provisional/scripts/01_build_provisional_persons_master.py

import sys
from pathlib import Path
import pandas as pd
import hashlib

ROOT = Path(__file__).resolve().parents[4]

MEMBERSHIP = ROOT / "legacy_data/membership/out/membership_only_persons.csv"
CLUBS = ROOT / "legacy_data/clubs/out/club_only_persons.csv"

OUT = ROOT / "legacy_data/persons/provisional/out/provisional_persons_master.csv"

# Make pipeline.identity importable when this script is run directly.
sys.path.insert(0, str(ROOT / "legacy_data"))
from pipeline.identity.alias_resolver import load_default_resolver  # noqa: E402


def make_id(key):
    return "prov_person::" + hashlib.sha1(key.encode()).hexdigest()[:12]


def main():
    rows = []
    resolver = load_default_resolver()
    n_alias_dropped_m = 0
    n_alias_dropped_c = 0

    if MEMBERSHIP.exists():
        df = pd.read_csv(MEMBERSHIP).fillna("")
        for _, r in df.iterrows():
            name = r.get("person_name", "")
            # Alias guard: if the name resolves to a canonical person via the
            # shared alias registry, do NOT generate a prov_person:: stub —
            # the canonical person already exists and downstream stages would
            # otherwise produce a duplicate.
            if resolver and resolver.resolve(name):
                n_alias_dropped_m += 1
                continue
            norm = name.lower().strip()
            rows.append({
                "provisional_person_id": make_id("m|" + norm),
                "person_name": name,
                "person_name_norm": norm,
                "source_type": "MEMBERSHIP",
                "mirror_member_id": "",
                "club_key": "",
                "confidence": "high",
                "promotion_status": "STAGED",
            })

    if CLUBS.exists():
        df = pd.read_csv(CLUBS).fillna("")
        for _, r in df.iterrows():
            name = r.get("person_name", "")
            if resolver and resolver.resolve(name):
                n_alias_dropped_c += 1
                continue
            norm = name.lower().strip()
            rows.append({
                "provisional_person_id": make_id("c|" + norm + r.get("club_key", "")),
                "person_name": name,
                "person_name_norm": norm,
                "source_type": "CLUB",
                "mirror_member_id": r.get("mirror_member_id", ""),
                "club_key": r.get("club_key", ""),
                "confidence": "medium",
                "promotion_status": "STAGED",
            })

    out = pd.DataFrame(rows).drop_duplicates(subset=["provisional_person_id"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)

    print(f"Wrote {len(out)} rows")
    if n_alias_dropped_m or n_alias_dropped_c:
        print(f"  Alias guard dropped: {n_alias_dropped_m} from membership, {n_alias_dropped_c} from clubs")


if __name__ == "__main__":
    main()
