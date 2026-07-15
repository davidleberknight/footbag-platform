#!/usr/bin/env python3
"""Apply-side of the exact-name + full-DOB member auto-merge.

The reconcile step decides which duplicate accounts collapse into one survivor
and emits a deterministic loser->survivor mapping. This module applies that
mapping against the destination database as part of the final member load, in
the loader's single transaction, so the whole apply either lands or rolls back.

Reference classes (enumerated from database/schema.sql):

  Build-time pipeline references, remapped loser -> survivor:
    - historical_persons.legacy_member_id
    - legacy_person_club_affiliations.legacy_member_id
    - club_bootstrap_leaders.legacy_member_id

  Live-entity references, a hard abort if a loser carries any of them (they mean
  a member has already claimed or is onboarding onto the loser account, which the
  merge must never silently drop):
    - an existing legacy_members row for the loser (claimed or not)
    - members.legacy_member_id
    - account_tokens.target_legacy_member_id
    - auto_link_staged_candidates.legacy_member_id
    - a club_bootstrap_leaders row for the loser with a member already imported
      or claimed onto it

Uniqueness conflicts are resolved explicitly: a pipeline row that, after
remapping, exactly duplicates an existing survivor row is deleted (deduplicated);
a collision that is not an exact duplicate, or a historical-person link that would
fuse two different canonical persons, is a relationship that cannot be merged
losslessly and aborts the whole transaction.
"""
from __future__ import annotations

import csv
import sqlite3
from pathlib import Path


class MergeAbort(Exception):
    """Raised for any unsafe condition; the caller rolls back the transaction."""


def load_merge_map(path: Path) -> dict[str, str]:
    """loser legacy_member_id -> survivor legacy_member_id, from the reconcile
    mapping artifact. Deterministic; rejects a loser mapped to two survivors and
    a loser that is also a survivor (a chain), which must never occur."""
    mapping: dict[str, str] = {}
    survivors: set[str] = set()
    with Path(path).open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            loser = (r.get("loser_legacy_member_id") or "").strip()
            survivor = (r.get("survivor_legacy_member_id") or "").strip()
            if not loser or not survivor:
                continue
            if loser in mapping and mapping[loser] != survivor:
                raise MergeAbort(
                    f"merge map is inconsistent: loser {loser} maps to both "
                    f"{mapping[loser]} and {survivor}")
            mapping[loser] = survivor
            survivors.add(survivor)
    overlap = set(mapping) & survivors
    if overlap:
        raise MergeAbort(
            f"merge map has loser ids that are also survivors (a merge chain): "
            f"{sorted(overlap)}")
    return mapping


def _table_exists(cur: sqlite3.Cursor, name: str) -> bool:
    return cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def _ids_present(cur: sqlite3.Cursor, sql: str, losers: set[str]) -> list[str]:
    """Loser ids returned by a single-column query, in sorted order."""
    hit = {(r[0] or "") for r in cur.execute(sql)} & losers
    return sorted(hit)


def precheck_live_references(cur: sqlite3.Cursor, losers: set[str]) -> None:
    """Abort before any mutation if a loser carries live-entity evidence. Pure
    read; raises MergeAbort naming the offending table and ids."""
    violations: list[str] = []

    existing = _ids_present(
        cur, "SELECT legacy_member_id FROM legacy_members", losers)
    if existing:
        violations.append(
            f"already present as legacy_members rows (claimed or not): {existing}")

    if _table_exists(cur, "members"):
        m = _ids_present(
            cur,
            "SELECT legacy_member_id FROM members WHERE legacy_member_id IS NOT NULL",
            losers)
        if m:
            violations.append(f"claimed via members.legacy_member_id: {m}")

    if _table_exists(cur, "account_tokens"):
        t = _ids_present(
            cur,
            "SELECT target_legacy_member_id FROM account_tokens "
            "WHERE target_legacy_member_id IS NOT NULL",
            losers)
        if t:
            violations.append(f"targeted by account_tokens: {t}")

    if _table_exists(cur, "auto_link_staged_candidates"):
        a = _ids_present(
            cur,
            "SELECT legacy_member_id FROM auto_link_staged_candidates "
            "WHERE legacy_member_id IS NOT NULL",
            losers)
        if a:
            violations.append(f"staged in auto_link_staged_candidates: {a}")

    if _table_exists(cur, "club_bootstrap_leaders"):
        b = _ids_present(
            cur,
            "SELECT legacy_member_id FROM club_bootstrap_leaders "
            "WHERE claimed_member_id IS NOT NULL OR imported_member_id IS NOT NULL",
            losers)
        if b:
            violations.append(
                f"bootstrap leadership already claimed/imported by a member: {b}")

    if violations:
        raise MergeAbort(
            "final-load merge aborted before any write: a loser account carries "
            "live-entity references that a merge must not drop:\n  - "
            + "\n  - ".join(violations))


# Semantic columns (everything but the surrogate id, the audit stamps, and the
# remapped legacy_member_id) that decide whether two pipeline rows are exact
# duplicates once the loser is remapped onto the survivor.
_AFFIL_FACT_COLS = ("historical_person_id", "legacy_club_candidate_id",
                    "inferred_role", "confidence_score", "resolution_status",
                    "resolved_club_id", "display_name", "notes")
_BOOTSTRAP_FACT_COLS = ("club_id", "role", "imported_member_id",
                        "claimed_member_id", "confidence_score", "status",
                        "claim_confirmed_at", "notes")


def _remap_or_dedupe(cur: sqlite3.Cursor, table: str, key_cols: tuple[str, ...],
                     fact_cols: tuple[str, ...],
                     loser_to_survivor: dict[str, str]) -> dict[str, int]:
    """Remap legacy_member_id loser->survivor in a pipeline table whose unique
    key includes legacy_member_id. On a post-remap collision with an existing
    survivor row: delete the loser row when it is an exact duplicate of the
    survivor's fact, otherwise abort (not losslessly mergeable)."""
    remapped = deduped = 0
    for loser, survivor in loser_to_survivor.items():
        rows = cur.execute(
            f"SELECT * FROM {table} WHERE legacy_member_id = ?", (loser,)
        ).fetchall()
        for row in rows:
            where = " AND ".join(f"{c} IS ?" for c in key_cols)
            params = [survivor if c == "legacy_member_id" else row[c]
                      for c in key_cols]
            clash = cur.execute(
                f"SELECT * FROM {table} WHERE {where}", params).fetchone()
            if clash is None:
                cur.execute(
                    f"UPDATE {table} SET legacy_member_id = ? WHERE id = ?",
                    (survivor, row["id"]))
                remapped += 1
                continue
            loser_fact = tuple(row[c] for c in fact_cols)
            surv_fact = tuple(
                (survivor if c == "legacy_member_id" else clash[c])
                for c in fact_cols)
            if loser_fact == surv_fact:
                cur.execute(f"DELETE FROM {table} WHERE id = ?", (row["id"],))
                deduped += 1
            else:
                raise MergeAbort(
                    f"{table}: remapping loser {loser} onto survivor {survivor} "
                    f"collides on {key_cols} with a row that is not an exact "
                    f"duplicate; cannot merge losslessly. Route the group to review.")
    return {"remapped": remapped, "deduped": deduped}


def remap_pipeline_references(cur: sqlite3.Cursor,
                              loser_to_survivor: dict[str, str]) -> dict[str, dict[str, int]]:
    """Remap the three build-time pipeline references loser->survivor. Assumes the
    survivor legacy_members rows already exist (the loader upserts them first), so
    the foreign keys resolve. Raises MergeAbort on any lossless-impossible merge."""
    stats: dict[str, dict[str, int]] = {}

    # historical_persons: at most one row per legacy_member_id (partial unique).
    # If both the loser and the survivor already carry a person link, they are two
    # different canonical persons and must not be fused.
    hp_remapped = 0
    for loser, survivor in loser_to_survivor.items():
        loser_hp = cur.execute(
            "SELECT person_id FROM historical_persons WHERE legacy_member_id = ?",
            (loser,)).fetchone()
        if loser_hp is None:
            continue
        surv_hp = cur.execute(
            "SELECT person_id FROM historical_persons WHERE legacy_member_id = ?",
            (survivor,)).fetchone()
        if surv_hp is not None:
            raise MergeAbort(
                f"historical_persons: loser {loser} (person {loser_hp['person_id']}) "
                f"and survivor {survivor} (person {surv_hp['person_id']}) are linked "
                f"to different canonical persons; merging would fuse two people. "
                f"Route the group to review.")
        cur.execute(
            "UPDATE historical_persons SET legacy_member_id = ? WHERE legacy_member_id = ?",
            (survivor, loser))
        hp_remapped += 1
    stats["historical_persons"] = {"remapped": hp_remapped, "deduped": 0}

    if _table_exists(cur, "legacy_person_club_affiliations"):
        stats["legacy_person_club_affiliations"] = _remap_or_dedupe(
            cur, "legacy_person_club_affiliations",
            ("legacy_member_id", "legacy_club_candidate_id", "inferred_role"),
            _AFFIL_FACT_COLS, loser_to_survivor)

    if _table_exists(cur, "club_bootstrap_leaders"):
        stats["club_bootstrap_leaders"] = _remap_or_dedupe(
            cur, "club_bootstrap_leaders",
            ("club_id", "legacy_member_id", "role"),
            _BOOTSTRAP_FACT_COLS, loser_to_survivor)

    return stats


def verify_no_loser_remains(cur: sqlite3.Cursor, losers: set[str]) -> None:
    """After the remap, no loser id may survive in any referencing table."""
    checks = [
        ("legacy_members", "SELECT legacy_member_id FROM legacy_members"),
        ("historical_persons",
         "SELECT legacy_member_id FROM historical_persons WHERE legacy_member_id IS NOT NULL"),
    ]
    if _table_exists(cur, "members"):
        checks.append(("members",
                       "SELECT legacy_member_id FROM members WHERE legacy_member_id IS NOT NULL"))
    if _table_exists(cur, "account_tokens"):
        checks.append(("account_tokens",
                       "SELECT target_legacy_member_id FROM account_tokens "
                       "WHERE target_legacy_member_id IS NOT NULL"))
    if _table_exists(cur, "auto_link_staged_candidates"):
        checks.append(("auto_link_staged_candidates",
                       "SELECT legacy_member_id FROM auto_link_staged_candidates "
                       "WHERE legacy_member_id IS NOT NULL"))
    if _table_exists(cur, "legacy_person_club_affiliations"):
        checks.append(("legacy_person_club_affiliations",
                       "SELECT legacy_member_id FROM legacy_person_club_affiliations "
                       "WHERE legacy_member_id IS NOT NULL"))
    if _table_exists(cur, "club_bootstrap_leaders"):
        checks.append(("club_bootstrap_leaders",
                       "SELECT legacy_member_id FROM club_bootstrap_leaders"))
    remaining: list[str] = []
    for table, sql in checks:
        hit = _ids_present(cur, sql, losers)
        if hit:
            remaining.append(f"{table}: {hit}")
    if remaining:
        raise MergeAbort(
            "post-merge verification failed: loser ids still referenced:\n  - "
            + "\n  - ".join(remaining))


def apply_member_merge(cur: sqlite3.Cursor, loser_to_survivor: dict[str, str]) -> dict:
    """Precheck, remap, and verify, on an open transaction the caller owns. The
    survivor member rows must already be upserted before this runs. Raises
    MergeAbort on any unsafe condition so the caller rolls back."""
    losers = set(loser_to_survivor)
    if not losers:
        return {"losers": 0, "remap": {}}
    survivors_present = _ids_present(
        cur, "SELECT legacy_member_id FROM legacy_members",
        set(loser_to_survivor.values()))
    missing = set(loser_to_survivor.values()) - set(survivors_present)
    if missing:
        raise MergeAbort(
            f"survivor rows absent from legacy_members after upsert: {sorted(missing)}. "
            f"The merged member CSV must carry every survivor.")
    remap = remap_pipeline_references(cur, loser_to_survivor)
    verify_no_loser_remains(cur, losers)
    return {"losers": len(losers), "remap": remap}
