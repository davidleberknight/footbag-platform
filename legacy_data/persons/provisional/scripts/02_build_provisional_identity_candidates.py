# legacy_data/persons/provisional/scripts/02_build_provisional_identity_candidates.py

import sys
from pathlib import Path
import pandas as pd
import hashlib

ROOT = Path(__file__).resolve().parents[4]
IN = ROOT / "legacy_data/persons/provisional/out/provisional_persons_master.csv"
OUT = ROOT / "legacy_data/persons/provisional/out/provisional_identity_candidates.csv"

# Make pipeline.identity importable when this script is run directly.
sys.path.insert(0, str(ROOT / "legacy_data"))
from pipeline.identity.alias_resolver import load_default_resolver  # noqa: E402


def make_id(key):
    # mirror_member_id may be numeric from CSV; normalize to str for hashing.
    if pd.isna(key) or key == "":
        key_str = ""
    else:
        key_str = str(key)
    return "prov_identity::" + hashlib.sha1(key_str.encode("utf-8")).hexdigest()[:12]


def main():
    df = pd.read_csv(IN).fillna("")

    # ── Alias guard (defense-in-depth) ──────────────────────────────────────
    # Script 01 should already have filtered alias-resolvable names. This
    # second guard catches anything that slipped through (e.g. if 01 was run
    # before aliases were updated and 02 runs later). Drops alias-resolvable
    # rows before generating prov_identity::<digest> IDs.
    resolver = load_default_resolver()
    n_alias_dropped = 0
    if not df.empty and resolver is not None:
        alias_resolved = df["person_name"].apply(resolver.resolve)
        drop_mask = alias_resolved.notna() & alias_resolved.ne("")
        n_alias_dropped = int(drop_mask.sum())
        if n_alias_dropped:
            print(f"  Alias guard: dropping {n_alias_dropped} provisional row(s) that resolve via alias")
            df = df[~drop_mask].copy()

    df["key"] = df.apply(
        lambda r: r["mirror_member_id"] if r["mirror_member_id"] else r["person_name_norm"],
        axis=1,
    )

    df["provisional_identity_id"] = df["key"].apply(make_id)

    grouped = df.groupby("provisional_identity_id")

    rows = []
    for pid, g in grouped:
        rows.append({
            "provisional_identity_id": pid,
            "canonical_candidate_name": g.iloc[0]["person_name"],
            "canonical_candidate_name_norm": g.iloc[0]["person_name_norm"],
            "source_types": "|".join(sorted(set(g["source_type"]))),
            "staged_row_count": len(g),
            "membership_row_count": (g["source_type"] == "MEMBERSHIP").sum(),
            "club_row_count": (g["source_type"] == "CLUB").sum(),
            "mirror_member_id_count": (g["mirror_member_id"] != "").sum(),
            "confidence": "medium",
            "promotion_status": "STAGED",
        })

    pd.DataFrame(rows).to_csv(OUT, index=False)
    print(f"Wrote {len(rows)} identities")


if __name__ == "__main__":
    main()
