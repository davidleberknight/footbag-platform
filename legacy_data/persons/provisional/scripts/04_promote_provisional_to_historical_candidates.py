#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[4]

RECONCILIATION_CSV = (
    REPO_ROOT / "legacy_data" / "persons" / "provisional" / "out" / "provisional_to_historical_matches.csv"
)
IDENTITY_CANDIDATES_CSV = (
    REPO_ROOT / "legacy_data" / "persons" / "provisional" / "out" / "provisional_identity_candidates.csv"
)

OUT_DIR = REPO_ROOT / "legacy_data" / "persons" / "provisional" / "out"
PROMOTED_LINKS_CSV = OUT_DIR / "provisional_promoted_links.csv"
PROMOTED_CANDIDATES_CSV = OUT_DIR / "provisional_identity_candidates_promoted.csv"
SUMMARY_JSON = OUT_DIR / "provisional_promotion_summary.json"


def require_columns(df: pd.DataFrame, required: set[str], label: str) -> None:
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"{label} missing required columns: {sorted(missing)}")


def decide_promotion_status(match_status: str) -> str:
    if match_status in {"EXACT_HISTORICAL_MATCH", "VARIANT_HISTORICAL_MATCH"}:
        return "MATCHED_TO_HISTORICAL"
    if match_status in {"WEAK_HISTORICAL_MATCH", "HISTORICAL_CONFLICT"}:
        return "REVIEW_REQUIRED"
    if match_status == "NO_HISTORICAL_MATCH":
        return "STAGED"
    return "STAGED"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if not RECONCILIATION_CSV.exists():
        raise FileNotFoundError(f"Missing reconciliation file: {RECONCILIATION_CSV}")
    if not IDENTITY_CANDIDATES_CSV.exists():
        raise FileNotFoundError(f"Missing identity candidates file: {IDENTITY_CANDIDATES_CSV}")

    recon = pd.read_csv(RECONCILIATION_CSV, dtype=str).fillna("")
    candidates = pd.read_csv(IDENTITY_CANDIDATES_CSV, dtype=str).fillna("")

    require_columns(
        recon,
        {
            "provisional_identity_id",
            "canonical_candidate_name",
            "canonical_candidate_name_norm",
            "source_types",
            "staged_row_count",
            "membership_row_count",
            "club_row_count",
            "mirror_member_id_count",
            "provisional_confidence",
            "matched_historical_person_id",
            "matched_historical_person_name",
            "match_status",
            "match_rule",
            "match_score",
            "candidate_count",
            "review_needed",
        },
        "provisional_to_historical_matches.csv",
    )

    require_columns(
        candidates,
        {
            "provisional_identity_id",
            "canonical_candidate_name",
            "canonical_candidate_name_norm",
            "source_types",
            "staged_row_count",
            "membership_row_count",
            "club_row_count",
            "mirror_member_id_count",
            "confidence",
            "promotion_status",
            "notes",
        },
        "provisional_identity_candidates.csv",
    )

    recon = recon.copy()
    recon["promotion_status"] = recon["match_status"].map(decide_promotion_status)

    promoted_links = recon[
        recon["promotion_status"] == "MATCHED_TO_HISTORICAL"
    ][
        [
            "provisional_identity_id",
            "canonical_candidate_name",
            "canonical_candidate_name_norm",
            "source_types",
            "staged_row_count",
            "membership_row_count",
            "club_row_count",
            "mirror_member_id_count",
            "provisional_confidence",
            "matched_historical_person_id",
            "matched_historical_person_name",
            "match_status",
            "match_rule",
            "match_score",
        ]
    ].copy()

    promoted_links = promoted_links.sort_values(
        by=["matched_historical_person_name", "canonical_candidate_name_norm", "provisional_identity_id"],
        ascending=[True, True, True],
        kind="stable",
    ).reset_index(drop=True)

    candidates_promoted = candidates.merge(
        recon[
            [
                "provisional_identity_id",
                "matched_historical_person_id",
                "matched_historical_person_name",
                "match_status",
                "match_rule",
                "match_score",
                "candidate_count",
                "review_needed",
                "promotion_status",
            ]
        ],
        on="provisional_identity_id",
        how="left",
        suffixes=("", "_recon"),
    )

    # Preserve original notes, append promotion comment only if useful
    def build_notes(row: pd.Series) -> str:
        base = str(row.get("notes", "")).strip()
        status = str(row.get("promotion_status_recon", row.get("promotion_status", ""))).strip()
        match_status = str(row.get("match_status", "")).strip()

        additions = []
        if status == "MATCHED_TO_HISTORICAL":
            additions.append("Auto-linked to canonical historical person.")
        elif status == "REVIEW_REQUIRED":
            additions.append("Review required before any promotion/link action.")
        elif status == "STAGED" and match_status == "NO_HISTORICAL_MATCH":
            additions.append("No canonical historical match found; remains staged.")

        if not base and not additions:
            return ""
        if base and not additions:
            return base
        if not base and additions:
            return " ".join(additions)
        return base + " " + " ".join(additions)

    candidates_promoted["promotion_status"] = candidates_promoted["promotion_status_recon"].where(
        candidates_promoted["promotion_status_recon"].fillna("").astype(str).str.strip().ne(""),
        candidates_promoted["promotion_status"],
    )

    candidates_promoted["notes"] = candidates_promoted.apply(build_notes, axis=1)

    drop_cols = [c for c in ["promotion_status_recon"] if c in candidates_promoted.columns]
    if drop_cols:
        candidates_promoted = candidates_promoted.drop(columns=drop_cols)

    # Put key columns first
    ordered_cols = [
        "provisional_identity_id",
        "canonical_candidate_name",
        "canonical_candidate_name_norm",
        "source_types",
        "staged_row_count",
        "membership_row_count",
        "club_row_count",
        "mirror_member_id_count",
        "confidence",
        "promotion_status",
        "matched_historical_person_id",
        "matched_historical_person_name",
        "match_status",
        "match_rule",
        "match_score",
        "candidate_count",
        "review_needed",
        "notes",
    ]
    remaining_cols = [c for c in candidates_promoted.columns if c not in ordered_cols]
    candidates_promoted = candidates_promoted[ordered_cols + remaining_cols].copy()

    candidates_promoted = candidates_promoted.sort_values(
        by=["promotion_status", "canonical_candidate_name_norm", "provisional_identity_id"],
        ascending=[True, True, True],
        kind="stable",
    ).reset_index(drop=True)

    promoted_links.to_csv(PROMOTED_LINKS_CSV, index=False)
    candidates_promoted.to_csv(PROMOTED_CANDIDATES_CSV, index=False)

    summary = {
        "total_provisional_identities": int(len(recon)),
        "promoted_link_count": int(len(promoted_links)),
        "promotion_status_counts": candidates_promoted["promotion_status"].value_counts(dropna=False).to_dict(),
        "match_status_counts": recon["match_status"].value_counts(dropna=False).to_dict(),
        "review_required_count": int((candidates_promoted["promotion_status"] == "REVIEW_REQUIRED").sum()),
        "staged_count": int((candidates_promoted["promotion_status"] == "STAGED").sum()),
        "matched_to_historical_count": int((candidates_promoted["promotion_status"] == "MATCHED_TO_HISTORICAL").sum()),
    }

    with open(SUMMARY_JSON, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, sort_keys=True)

    print(f"Wrote {len(promoted_links):,} rows to {PROMOTED_LINKS_CSV}")
    print(f"Wrote {len(candidates_promoted):,} rows to {PROMOTED_CANDIDATES_CSV}")
    print(f"Wrote summary to {SUMMARY_JSON}")
    print()
    print("Breakdown:")
    print(f"  total provisional identities:   {summary['total_provisional_identities']:,}")
    print(f"  matched to historical:          {summary['matched_to_historical_count']:,}")
    print(f"  review required:                {summary['review_required_count']:,}")
    print(f"  staged:                         {summary['staged_count']:,}")


if __name__ == "__main__":
    main()
