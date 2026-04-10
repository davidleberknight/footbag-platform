#!/usr/bin/env python3
from __future__ import annotations

import hashlib
from pathlib import Path
import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[4]

MEMBERSHIP_ONLY_CSV = REPO_ROOT / "legacy_data" / "membership" / "out" / "membership_only_persons.csv"
CLUB_ONLY_CSV = REPO_ROOT / "legacy_data" / "clubs" / "out" / "club_only_persons.csv"

OUT_DIR = REPO_ROOT / "legacy_data" / "persons" / "provisional" / "out"
OUT_CSV = OUT_DIR / "provisional_persons_master.csv"


def norm_text(x: str) -> str:
    return " ".join(str(x).strip().split())


def norm_name(x: str) -> str:
    return norm_text(x).lower().replace("-", " ")


def stable_membership_id(name_norm: str) -> str:
    digest = hashlib.sha1(f"membership|{name_norm}".encode("utf-8")).hexdigest()[:16]
    return f"membership_only::{digest}"


def stable_club_id(club_key: str, name_norm: str) -> str:
    digest = hashlib.sha1(f"club|{club_key}|{name_norm}".encode("utf-8")).hexdigest()[:16]
    return f"club_only::{digest}"


def empty_frame() -> pd.DataFrame:
    return pd.DataFrame(
        columns=[
            "provisional_person_id",
            "person_name",
            "person_name_norm",
            "source_type",
            "source_record_key",
            "legacy_member_id",
            "legacy_user_id",
            "legacy_email",
            "mirror_member_id",
            "club_key",
            "country",
            "membership_status",
            "membership_expiration",
            "membership_tier_provisional",
            "confidence",
            "promotion_status",
            "matched_historical_person_id",
            "notes",
        ]
    )


def build_membership_rows(df: pd.DataFrame) -> pd.DataFrame:
    required = {
        "person_name",
        "person_name_norm",
        "membership_status",
        "membership_expiration",
        "membership_tier_provisional",
    }
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"membership_only_persons.csv missing columns: {sorted(missing)}")

    out = df.copy()
    out["person_name"] = out["person_name"].fillna("").astype(str).map(norm_text)
    out["person_name_norm"] = out["person_name_norm"].fillna("").astype(str).map(norm_name)

    out = out[out["person_name_norm"].ne("")].copy()
    out = out.drop_duplicates(subset=["person_name_norm"], keep="first")

    out["provisional_person_id"] = out["person_name_norm"].map(stable_membership_id)
    out["source_type"] = "MEMBERSHIP"
    out["source_record_key"] = out["person_name_norm"]

    out["legacy_member_id"] = ""
    out["legacy_user_id"] = ""
    out["legacy_email"] = ""
    out["mirror_member_id"] = ""
    out["club_key"] = ""
    out["country"] = out["country"].fillna("").astype(str) if "country" in out.columns else ""

    if "confidence" not in out.columns:
        out["confidence"] = "high"

    out["promotion_status"] = "STAGED"
    out["matched_historical_person_id"] = ""
    out["notes"] = ""

    keep = [
        "provisional_person_id",
        "person_name",
        "person_name_norm",
        "source_type",
        "source_record_key",
        "legacy_member_id",
        "legacy_user_id",
        "legacy_email",
        "mirror_member_id",
        "club_key",
        "country",
        "membership_status",
        "membership_expiration",
        "membership_tier_provisional",
        "confidence",
        "promotion_status",
        "matched_historical_person_id",
        "notes",
    ]
    return out[keep].copy()


def build_club_rows(df: pd.DataFrame) -> pd.DataFrame:
    # flexible schema because club_only_persons.csv does not exist yet
    possible_name_cols = ["person_name", "member_name_raw", "display_name", "alias", "name"]
    name_col = next((c for c in possible_name_cols if c in df.columns), None)
    if name_col is None:
        raise ValueError(
            "club_only_persons.csv must contain one of: "
            "person_name, member_name_raw, display_name, alias, name"
        )

    club_key_col = next((c for c in ["club_key", "legacy_club_key"] if c in df.columns), None)
    if club_key_col is None:
        raise ValueError("club_only_persons.csv must contain club_key or legacy_club_key")

    out = df.copy()
    out["person_name"] = out[name_col].fillna("").astype(str).map(norm_text)
    out["person_name_norm"] = out["person_name"].map(norm_name)
    out["club_key"] = out[club_key_col].fillna("").astype(str).map(norm_text)

    out = out[(out["person_name_norm"].ne("")) & (out["club_key"].ne(""))].copy()
    out = out.drop_duplicates(subset=["club_key", "person_name_norm"], keep="first")

    out["provisional_person_id"] = out.apply(
        lambda r: stable_club_id(r["club_key"], r["person_name_norm"]), axis=1
    )
    out["source_type"] = "CLUB"
    out["source_record_key"] = out["club_key"] + "|" + out["person_name_norm"]

    out["legacy_member_id"] = ""
    out["legacy_user_id"] = ""
    out["legacy_email"] = ""
    out["mirror_member_id"] = out["mirror_member_id"].fillna("").astype(str) if "mirror_member_id" in out.columns else ""
    out["country"] = out["country"].fillna("").astype(str) if "country" in out.columns else ""
    out["membership_status"] = ""
    out["membership_expiration"] = ""
    out["membership_tier_provisional"] = ""

    if "confidence" not in out.columns:
        if "affiliation_confidence_score" in out.columns:
            out["confidence"] = out["affiliation_confidence_score"].fillna("").astype(str)
        else:
            out["confidence"] = "medium"

    out["promotion_status"] = "STAGED"
    out["matched_historical_person_id"] = ""
    out["notes"] = ""

    keep = [
        "provisional_person_id",
        "person_name",
        "person_name_norm",
        "source_type",
        "source_record_key",
        "legacy_member_id",
        "legacy_user_id",
        "legacy_email",
        "mirror_member_id",
        "club_key",
        "country",
        "membership_status",
        "membership_expiration",
        "membership_tier_provisional",
        "confidence",
        "promotion_status",
        "matched_historical_person_id",
        "notes",
    ]
    return out[keep].copy()


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if not MEMBERSHIP_ONLY_CSV.exists():
        raise FileNotFoundError(f"Missing membership-only file: {MEMBERSHIP_ONLY_CSV}")

    membership_only = pd.read_csv(MEMBERSHIP_ONLY_CSV, dtype=str).fillna("")
    membership_rows = build_membership_rows(membership_only)

    parts = [membership_rows]
    club_rows = empty_frame()

    if CLUB_ONLY_CSV.exists():
        club_only = pd.read_csv(CLUB_ONLY_CSV, dtype=str).fillna("")
        club_rows = build_club_rows(club_only)
        parts.append(club_rows)

    final_df = pd.concat(parts, ignore_index=True)

    final_df = final_df.sort_values(
        by=["source_type", "person_name_norm", "club_key", "provisional_person_id"],
        ascending=[True, True, True, True],
        kind="stable",
    ).reset_index(drop=True)

    final_df.to_csv(OUT_CSV, index=False)

    print(f"Wrote {len(final_df):,} rows to {OUT_CSV}")
    print()
    print("Breakdown:")
    print(f"  membership rows: {len(membership_rows):,}")
    print(f"  club rows:       {len(club_rows):,}")
    print(f"  total staged:    {len(final_df):,}")


if __name__ == "__main__":
    main()
