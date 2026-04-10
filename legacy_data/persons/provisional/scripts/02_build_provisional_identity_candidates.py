#!/usr/bin/env python3
from __future__ import annotations

import hashlib
from pathlib import Path
import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[4]

PROVISIONAL_MASTER_CSV = (
    REPO_ROOT / "legacy_data" / "persons" / "provisional" / "out" / "provisional_persons_master.csv"
)

OUT_DIR = REPO_ROOT / "legacy_data" / "persons" / "provisional" / "out"
CANDIDATES_CSV = OUT_DIR / "provisional_identity_candidates.csv"
MEMBERS_CSV = OUT_DIR / "provisional_identity_members.csv"


def norm_text(x: str) -> str:
    return " ".join(str(x).strip().split())


def norm_name(x: str) -> str:
    return norm_text(x).lower().replace("-", " ")


def require_columns(df: pd.DataFrame, required: set[str], label: str) -> None:
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"{label} missing required columns: {sorted(missing)}")


def make_identity_key(row: pd.Series) -> str:
    mirror_member_id = norm_text(row.get("mirror_member_id", ""))
    if mirror_member_id:
        return f"mirror_member_id::{mirror_member_id}"

    person_name_norm = norm_name(row.get("person_name_norm", ""))
    return f"name::{person_name_norm}"


def make_identity_id(identity_key: str) -> str:
    digest = hashlib.sha1(identity_key.encode("utf-8")).hexdigest()[:16]
    return f"provisional_identity::{digest}"


def pick_canonical_candidate_name(group: pd.DataFrame) -> str:
    # Prefer membership-derived names, then longest non-empty name
    membership_rows = group[group["source_type"] == "MEMBERSHIP"]
    if not membership_rows.empty:
        names = (
            membership_rows["person_name"]
            .fillna("")
            .astype(str)
            .map(norm_text)
        )
        names = [n for n in names if n]
        if names:
            return max(names, key=len)

    names = group["person_name"].fillna("").astype(str).map(norm_text)
    names = [n for n in names if n]
    if names:
        return max(names, key=len)

    return ""


def collapse_source_types(group: pd.DataFrame) -> str:
    vals = sorted(set(group["source_type"].fillna("").astype(str)))
    vals = [v for v in vals if v]
    return "|".join(vals)


def count_nonempty(series: pd.Series) -> int:
    return int(series.fillna("").astype(str).map(norm_text).ne("").sum())


def infer_confidence(group: pd.DataFrame) -> str:
    source_types = set(group["source_type"].fillna("").astype(str))
    mirror_count = count_nonempty(group["mirror_member_id"]) if "mirror_member_id" in group.columns else 0

    if mirror_count > 0:
        return "high"
    if source_types == {"MEMBERSHIP"}:
        return "high"
    if "MEMBERSHIP" in source_types and "CLUB" in source_types:
        return "high"
    if source_types == {"CLUB"}:
        return "medium"
    return "medium"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if not PROVISIONAL_MASTER_CSV.exists():
        raise FileNotFoundError(f"Missing provisional master file: {PROVISIONAL_MASTER_CSV}")

    df = pd.read_csv(PROVISIONAL_MASTER_CSV, dtype=str).fillna("")

    require_columns(
        df,
        {
            "provisional_person_id",
            "person_name",
            "person_name_norm",
            "source_type",
            "source_record_key",
            "mirror_member_id",
            "club_key",
            "confidence",
            "promotion_status",
        },
        "provisional_persons_master.csv",
    )

    df = df.copy()
    df["person_name"] = df["person_name"].map(norm_text)
    df["person_name_norm"] = df["person_name_norm"].map(norm_name)
    df["mirror_member_id"] = df["mirror_member_id"].map(norm_text)
    df["club_key"] = df["club_key"].map(norm_text)

    df = df[df["person_name_norm"].ne("")].copy()

    df["identity_key"] = df.apply(make_identity_key, axis=1)
    df["provisional_identity_id"] = df["identity_key"].map(make_identity_id)

    # Membership rows first, then club rows, then stable name/id ordering
    df = df.sort_values(
        by=["provisional_identity_id", "source_type", "person_name_norm", "provisional_person_id"],
        ascending=[True, True, True, True],
        kind="stable",
    ).reset_index(drop=True)

    member_rows = df[
        [
            "provisional_identity_id",
            "provisional_person_id",
            "source_type",
            "person_name",
            "person_name_norm",
            "source_record_key",
            "mirror_member_id",
            "club_key",
            "confidence",
            "promotion_status",
        ]
    ].copy()

    candidate_rows = []

    for provisional_identity_id, group in df.groupby("provisional_identity_id", sort=False):
        canonical_candidate_name = pick_canonical_candidate_name(group)
        canonical_candidate_name_norm = norm_name(canonical_candidate_name)

        membership_row_count = int((group["source_type"] == "MEMBERSHIP").sum())
        club_row_count = int((group["source_type"] == "CLUB").sum())
        staged_row_count = int(len(group))
        mirror_member_id_count = count_nonempty(group["mirror_member_id"])

        candidate_rows.append(
            {
                "provisional_identity_id": provisional_identity_id,
                "canonical_candidate_name": canonical_candidate_name,
                "canonical_candidate_name_norm": canonical_candidate_name_norm,
                "source_types": collapse_source_types(group),
                "staged_row_count": staged_row_count,
                "membership_row_count": membership_row_count,
                "club_row_count": club_row_count,
                "mirror_member_id_count": mirror_member_id_count,
                "confidence": infer_confidence(group),
                "promotion_status": "STAGED",
                "notes": "",
            }
        )

    candidates_df = pd.DataFrame(candidate_rows)

    candidates_df = candidates_df.sort_values(
        by=["canonical_candidate_name_norm", "provisional_identity_id"],
        ascending=[True, True],
        kind="stable",
    ).reset_index(drop=True)

    member_rows = member_rows.sort_values(
        by=["provisional_identity_id", "source_type", "person_name_norm", "club_key", "provisional_person_id"],
        ascending=[True, True, True, True, True],
        kind="stable",
    ).reset_index(drop=True)

    candidates_df.to_csv(CANDIDATES_CSV, index=False)
    member_rows.to_csv(MEMBERS_CSV, index=False)

    print(f"Wrote {len(candidates_df):,} rows to {CANDIDATES_CSV}")
    print(f"Wrote {len(member_rows):,} rows to {MEMBERS_CSV}")
    print()
    print("Breakdown:")
    print(f"  staged rows:                 {len(df):,}")
    print(f"  provisional identities:      {len(candidates_df):,}")
    print(f"  identities with membership:  {int((candidates_df['membership_row_count'].astype(int) > 0).sum()):,}")
    print(f"  identities with club rows:   {int((candidates_df['club_row_count'].astype(int) > 0).sum()):,}")
    print(
        f"  identities with mirror IDs:  "
        f"{int((candidates_df['mirror_member_id_count'].astype(int) > 0).sum()):,}"
    )


if __name__ == "__main__":
    main()
