# legacy_data/persons/provisional/scripts/02_build_provisional_identity_candidates.py

import csv
import sys
from pathlib import Path
import pandas as pd
import hashlib

ROOT = Path(__file__).resolve().parents[4]
IN = ROOT / "legacy_data/persons/provisional/out/provisional_persons_master.csv"
OUT = ROOT / "legacy_data/persons/provisional/out/provisional_identity_candidates.csv"
DUPLICATE_OVERRIDES_CSV = ROOT / "legacy_data/overrides/provisional_person_duplicates.csv"

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


def norm_member_id(value) -> str:
    """Compare legacy account ids by their digits.

    The column arrives from a CSV round-trip that renders an id as ``66932.0``
    when any row in it is blank, so the curated file's plain ``66932`` would
    otherwise match nothing.
    """
    if pd.isna(value):
        return ""
    text = str(value).strip()
    if text.endswith(".0"):
        text = text[:-2]
    return text


def load_duplicate_account_overrides(path: Path = DUPLICATE_OVERRIDES_CSV) -> dict[str, str]:
    """Adjudicated duplicate legacy accounts as retired id -> kept id.

    Schema: ``keep_mirror_member_id,drop_mirror_member_id,reason``. The reason
    column records the evidence for audit and drives nothing. A row missing
    either id adjudicates nothing and is skipped rather than merging two people
    on incomplete input.

    One person who registered twice on the legacy site reaches this stage as two
    accounts and becomes two archival identities, and only a human can tell that
    apart from two people who share a name, so the ruling lives in the curated
    overrides tree where a rebuild cannot regenerate it away. A missing file
    means no ruling has been recorded and nothing is merged, which keeps a fresh
    checkout working.
    """
    if not path.exists():
        return {}
    pairs: dict[str, str] = {}
    with path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            drop = norm_member_id(row.get("drop_mirror_member_id") or "")
            keep = norm_member_id(row.get("keep_mirror_member_id") or "")
            if drop and keep:
                pairs[drop] = keep
    return pairs


def apply_duplicate_account_overrides(df: pd.DataFrame, pairs: dict[str, str]) -> int:
    """Point each retired account at its kept account before identities are minted.

    Mutates ``df`` in place and returns the number of rows re-pointed. Both sides
    of every pair must be present: an id that no longer appears means the ruling
    is stale and silently merging nothing would leave two archival identities for
    one person, so this stops the run instead.

    Marks each re-pointed row in ``_retired_account`` so the merged identity can
    take its displayed name from the account the curator kept rather than from
    whichever of the two happened to be read first.
    """
    df["_retired_account"] = False
    if not pairs:
        return 0

    present: dict[str, object] = {}
    for value in df["mirror_member_id"]:
        key = norm_member_id(value)
        if key:
            present.setdefault(key, value)

    dangling = sorted(
        f"{drop} -> {keep}"
        for drop, keep in pairs.items()
        if drop not in present or keep not in present
    )
    if dangling:
        raise SystemExit(
            "legacy_data/overrides/provisional_person_duplicates.csv names legacy "
            "account ids that are not in "
            "persons/provisional/out/provisional_persons_master.csv: "
            + ", ".join(dangling)
            + ". Re-run persons/provisional/scripts/"
            "01_build_provisional_persons_master.py, or correct the override rows "
            "to account ids the club and membership rosters still carry."
        )

    normalized = df["mirror_member_id"].map(norm_member_id)
    mask = normalized.isin(pairs)
    df.loc[mask, "mirror_member_id"] = normalized[mask].map(
        lambda drop: present[pairs[drop]]
    )
    df.loc[mask, "_retired_account"] = True
    return int(mask.sum())


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

    # ── Adjudicated duplicate accounts ──────────────────────────────────────
    # Applied before the key is built, so two accounts a human ruled to be one
    # person produce one identity rather than two archival records that person
    # cannot both claim.
    n_merged = apply_duplicate_account_overrides(df, load_duplicate_account_overrides())
    if n_merged:
        print(f"  Duplicate accounts: merged {n_merged} row(s) onto their kept account")

    df["key"] = df.apply(
        lambda r: r["mirror_member_id"] if r["mirror_member_id"] else r["person_name_norm"],
        axis=1,
    )

    df["provisional_identity_id"] = df["key"].apply(make_id)

    # A merged identity's name and normalized name are read off the first row of
    # its group, so the kept account sorts ahead of the accounts retired onto it.
    df = df.sort_values("_retired_account", kind="stable")

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
