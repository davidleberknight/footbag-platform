#!/usr/bin/env python3
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[4]

PROVISIONAL_CANDIDATES_CSV = (
    REPO_ROOT / "legacy_data" / "persons" / "provisional" / "out" / "provisional_identity_candidates.csv"
)
PERSONS_CSV = (
    REPO_ROOT / "legacy_data" / "event_results" / "canonical_input" / "persons.csv"
)

OUT_DIR = REPO_ROOT / "legacy_data" / "persons" / "provisional" / "out"
OUT_MATCHES_CSV = OUT_DIR / "provisional_to_historical_matches.csv"
OUT_SUMMARY_JSON = OUT_DIR / "provisional_reconciliation_summary.json"


KNOWN_FIRST_NAME_VARIANTS = {
    "dave": {"david"},
    "david": {"dave"},
    "mike": {"michael"},
    "michael": {"mike"},
    "matt": {"matthew"},
    "matthew": {"matt"},
    "alex": {"alexander", "alexandre"},
    "jon": {"john", "jonathan"},
    "john": {"jon"},
    "jim": {"james"},
    "james": {"jim"},
    "bill": {"william"},
    "william": {"bill"},
    "chris": {"christopher"},
    "christopher": {"chris"},
    "steve": {"steven", "stephen"},
    "steven": {"steve"},
    "stephen": {"steve"},
    "andy": {"andrew"},
    "andrew": {"andy"},
    "seb": {"sebastian", "sebastien"},
    "sebastian": {"seb"},
    "sebastien": {"seb"},
    "ben": {"benjamin"},
    "benjamin": {"ben"},
    "charlie": {"charles"},
    "charles": {"charlie"},
    "theo": {"theodore"},
    "theodore": {"theo"},
    "nic": {"nicholas", "nick"},
    "nick": {"nicholas", "nic"},
    "doug": {"douglas"},
    "douglas": {"doug"},
    "joey": {"joseph"},
    "joseph": {"joey"},
    "kenny": {"ken", "kenneth"},
    "ken": {"kenny", "kenneth"},
    "kenneth": {"ken", "kenny"},
    "billy": {"bill", "william"},
    "bill": {"billy"},
}


def norm_text(x: str) -> str:
    return " ".join(str(x).strip().split())


def norm_name(x: str) -> str:
    return norm_text(x).lower().replace("-", " ")


def require_columns(df: pd.DataFrame, required: set[str], label: str) -> None:
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"{label} missing required columns: {sorted(missing)}")


def pick_person_name_col(df: pd.DataFrame) -> str:
    for col in ["person_name", "person_canon", "name"]:
        if col in df.columns:
            return col
    raise ValueError(
        f"persons.csv must contain one of ['person_name', 'person_canon', 'name']; found {list(df.columns)}"
    )


def normalize_persons(df: pd.DataFrame) -> pd.DataFrame:
    source_col = pick_person_name_col(df)

    out_rows = []
    for _, row in df.iterrows():
        person_name = norm_text(row[source_col])
        person_name_norm = norm_name(person_name)
        tokens = person_name_norm.split()
        first = tokens[0] if tokens else ""
        last = tokens[-1] if tokens else ""

        rec = row.to_dict()
        rec["person_name_raw"] = person_name
        rec["person_name_norm"] = person_name_norm
        rec["person_first_name_norm"] = first
        rec["person_surname_core"] = last
        rec["person_token_count"] = len(tokens)
        out_rows.append(rec)

    return pd.DataFrame(out_rows)


def build_indexes(persons: pd.DataFrame) -> dict[str, dict[str, list[dict]]]:
    exact_name = defaultdict(list)
    surname = defaultdict(list)

    for _, row in persons.iterrows():
        rec = row.to_dict()
        n = rec.get("person_name_norm", "")
        s = rec.get("person_surname_core", "")

        if n:
            exact_name[n].append(rec)
        if s:
            surname[s].append(rec)

    return {
        "exact_name": exact_name,
        "surname": surname,
    }


def candidate_row(person: dict, rule: str, score: int) -> dict:
    return {
        "matched_historical_person_id": person.get("person_id", ""),
        "matched_historical_person_name": person.get("person_name_raw", ""),
        "match_rule": rule,
        "match_score": score,
    }


def exact_pass(prov: dict, idx: dict) -> list[dict]:
    return [
        candidate_row(p, "exact_full_name", 100)
        for p in idx["exact_name"].get(prov["canonical_candidate_name_norm"], [])
    ]


def variant_pass(prov: dict, idx: dict) -> list[dict]:
    name_norm = prov["canonical_candidate_name_norm"]
    tokens = name_norm.split()
    if len(tokens) < 2:
        return []

    first = tokens[0]
    surname = tokens[-1]
    variants = KNOWN_FIRST_NAME_VARIANTS.get(first, set())

    out = []
    for p in idx["surname"].get(surname, []):
        pf = p.get("person_first_name_norm", "")
        if pf in variants:
            out.append(candidate_row(p, "known_variant", 75))
    return out


def same_first_same_surname_pass(prov: dict, idx: dict) -> list[dict]:
    name_norm = prov["canonical_candidate_name_norm"]
    tokens = name_norm.split()
    if len(tokens) < 2:
        return []

    first = tokens[0]
    surname = tokens[-1]

    out = []
    for p in idx["surname"].get(surname, []):
        pf = p.get("person_first_name_norm", "")
        p_tok = int(p.get("person_token_count", 0) or 0)

        # only allow this looser pass for names with more structure
        if pf == first and (len(tokens) >= 2 and p_tok >= 2):
            out.append(candidate_row(p, "same_first_same_surname", 65))
    return out


def dedupe_candidates(cands: list[dict]) -> list[dict]:
    best_by_person = {}
    for c in cands:
        pid = c["matched_historical_person_id"] or c["matched_historical_person_name"]
        if pid not in best_by_person or c["match_score"] > best_by_person[pid]["match_score"]:
            best_by_person[pid] = c
    return list(best_by_person.values())


def choose_best(cands: list[dict]) -> tuple[str, dict | None, int]:
    if not cands:
        return "NO_HISTORICAL_MATCH", None, 0

    cands = sorted(
        cands,
        key=lambda x: (-x["match_score"], x["matched_historical_person_name"]),
    )
    top = cands[0]
    same_top = [c for c in cands if c["match_score"] == top["match_score"]]

    if len(same_top) > 1:
        return "HISTORICAL_CONFLICT", top, len(same_top)

    if top["match_score"] >= 100:
        return "EXACT_HISTORICAL_MATCH", top, 1
    if top["match_score"] >= 75:
        return "VARIANT_HISTORICAL_MATCH", top, 1
    if top["match_score"] >= 65:
        return "WEAK_HISTORICAL_MATCH", top, 1

    return "NO_HISTORICAL_MATCH", None, 0


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if not PROVISIONAL_CANDIDATES_CSV.exists():
        raise FileNotFoundError(f"Missing provisional candidates file: {PROVISIONAL_CANDIDATES_CSV}")
    if not PERSONS_CSV.exists():
        raise FileNotFoundError(f"Missing persons.csv: {PERSONS_CSV}")

    prov = pd.read_csv(PROVISIONAL_CANDIDATES_CSV, dtype=str).fillna("")
    persons_raw = pd.read_csv(PERSONS_CSV, dtype=str).fillna("")
    persons = normalize_persons(persons_raw)

    require_columns(
        prov,
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
        },
        "provisional_identity_candidates.csv",
    )
    require_columns(
        persons,
        {
            "person_id",
            "person_name_raw",
            "person_name_norm",
            "person_first_name_norm",
            "person_surname_core",
            "person_token_count",
        },
        "persons.csv(normalized)",
    )

    idx = build_indexes(persons)

    rows = []

    for _, row in prov.iterrows():
        rec = row.to_dict()

        passes = [
            exact_pass(rec, idx),
            variant_pass(rec, idx),
            same_first_same_surname_pass(rec, idx),
        ]

        all_cands: list[dict] = []
        for pass_cands in passes:
            if pass_cands:
                all_cands.extend(pass_cands)
                break

        all_cands = dedupe_candidates(all_cands)
        match_status, best, candidate_count = choose_best(all_cands)

        review_needed = 1 if match_status in {"WEAK_HISTORICAL_MATCH", "HISTORICAL_CONFLICT"} else 0

        rows.append(
            {
                "provisional_identity_id": rec["provisional_identity_id"],
                "canonical_candidate_name": rec["canonical_candidate_name"],
                "canonical_candidate_name_norm": rec["canonical_candidate_name_norm"],
                "source_types": rec["source_types"],
                "staged_row_count": rec["staged_row_count"],
                "membership_row_count": rec["membership_row_count"],
                "club_row_count": rec["club_row_count"],
                "mirror_member_id_count": rec["mirror_member_id_count"],
                "provisional_confidence": rec["confidence"],
                "matched_historical_person_id": best["matched_historical_person_id"] if best else "",
                "matched_historical_person_name": best["matched_historical_person_name"] if best else "",
                "match_status": match_status,
                "match_rule": best["match_rule"] if best else "",
                "match_score": best["match_score"] if best else "",
                "candidate_count": candidate_count,
                "review_needed": review_needed,
            }
        )

    out = pd.DataFrame(rows)

    out = out.sort_values(
        by=["match_status", "canonical_candidate_name_norm", "provisional_identity_id"],
        ascending=[True, True, True],
        kind="stable",
    ).reset_index(drop=True)

    out.to_csv(OUT_MATCHES_CSV, index=False)

    summary = {
        "provisional_identity_count": int(len(out)),
        "match_status_counts": out["match_status"].value_counts(dropna=False).to_dict(),
        "review_needed_count": int((pd.to_numeric(out["review_needed"], errors="coerce").fillna(0) == 1).sum()),
        "exact_match_count": int((out["match_status"] == "EXACT_HISTORICAL_MATCH").sum()),
        "variant_match_count": int((out["match_status"] == "VARIANT_HISTORICAL_MATCH").sum()),
        "weak_match_count": int((out["match_status"] == "WEAK_HISTORICAL_MATCH").sum()),
        "conflict_count": int((out["match_status"] == "HISTORICAL_CONFLICT").sum()),
        "no_match_count": int((out["match_status"] == "NO_HISTORICAL_MATCH").sum()),
    }

    with open(OUT_SUMMARY_JSON, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, sort_keys=True)

    print(f"Wrote {len(out):,} rows to {OUT_MATCHES_CSV}")
    print(f"Wrote summary to {OUT_SUMMARY_JSON}")
    print()
    print("Breakdown:")
    print(f"  provisional identities:     {summary['provisional_identity_count']:,}")
    print(f"  exact historical matches:   {summary['exact_match_count']:,}")
    print(f"  variant historical matches: {summary['variant_match_count']:,}")
    print(f"  weak historical matches:    {summary['weak_match_count']:,}")
    print(f"  historical conflicts:       {summary['conflict_count']:,}")
    print(f"  no historical match:        {summary['no_match_count']:,}")
    print(f"  review needed:              {summary['review_needed_count']:,}")


if __name__ == "__main__":
    main()
