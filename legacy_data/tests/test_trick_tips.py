"""Tests for the legacy footbag.org Member Tips recovery pipeline.

Extraction (legacy_data/scripts/extract_footbag_org_member_tips.py): empty tips
dropped, exact duplicates within a move dropped, legacy HTML sanitized, HintTitle
discarded, legacy move_type ('f' freestyle / 'n' net) carried.

Loader (freestyle/loaders/27_load_trick_tips.py): every tip is PRESERVED in
freestyle_trick_tips under one of five buckets, and none loads as published:
only a curator's approval in the admin tips page makes a tip public.
  - hidden               : legacy name mapped to a canonical slug (alias-aware), awaiting approval
  - unresolved_freestyle : real freestyle trick not authored yet -> 'unresolved:<name>'
  - unresolved_frontier  : blocked on a deferred operator/doctrine
  - unresolved_ambiguous : a canonical may exist but is unconfirmed
  - future_net           : net technique -> 'unresolved:net:<name>' (no public render)
Unresolved/net slugs have no freestyle_tricks row (no FK). Idempotent re-run.

All writes go to a temp dir; nothing under the repo root is touched.

Run from repo root:
    python -m pytest legacy_data/tests/test_trick_tips.py -v
"""
import json
import sqlite3
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
EXTRACT = REPO_ROOT / "legacy_data" / "scripts" / "extract_footbag_org_member_tips.py"
LOADER = REPO_ROOT / "freestyle" / "loaders" / "27_load_trick_tips.py"


def run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, *args], cwd=str(REPO_ROOT),
                          capture_output=True, text=True)


def make_db(tmp_path: Path) -> Path:
    db = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()
    return db


def seed_trick(db: Path, slug: str, name: str, aliases_json: str | None = None) -> None:
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO freestyle_tricks (slug, canonical_name, aliases_json, loaded_at) "
        "VALUES (?, ?, ?, '2026-01-01T00:00:00Z')",
        (slug, name, aliases_json),
    )
    conn.commit()
    conn.close()


def rows(db: Path, where: str = "", params: tuple = ()) -> list:
    conn = sqlite3.connect(db)
    try:
        return conn.execute(
            f"SELECT trick_slug, status, display_order, tip_text FROM freestyle_trick_tips {where}",
            params,
        ).fetchall()
    finally:
        conn.close()


def count(db: Path, where: str = "", params: tuple = ()) -> int:
    conn = sqlite3.connect(db)
    try:
        return conn.execute(f"SELECT COUNT(*) FROM freestyle_trick_tips {where}", params).fetchone()[0]
    finally:
        conn.close()


# --- extraction ---------------------------------------------------------------

MOVE_COLUMNS = ["MoveID", "OldMoveID", "Name", "Modifier", "NickName", "Pronunciation",
                "Family", "AddCount", "BOA", "Notation", "Description", "IsFundamental",
                "Video", "Priority", "Modified", "Created", "MoveType", "MoveRecord",
                "MoveRecordHolderID", "MoveRecordHolderName"]
HINT_COLUMNS = ["HintID", "MoveID", "MemberID", "HintTitle", "HintText", "HintCreated",
                "HintModified", "HintPriority"]


def _write_export(folder: Path, moves: list[tuple[str, str, str]],
                  hints: list[tuple]) -> Path:
    """A legacy export moves2 folder. `moves` is (MoveID, Name, MoveType);
    `hints` is (HintID, MoveID, HintText, HintCreated)."""
    import csv
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / "moves.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=MOVE_COLUMNS, lineterminator="\n")
        w.writeheader()
        for move_id, name, move_type in moves:
            w.writerow({"MoveID": move_id, "Name": name, "MoveType": move_type})
    with (folder / "movehints.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=HINT_COLUMNS, lineterminator="\n")
        w.writeheader()
        for hint_id, move_id, text, created in hints:
            w.writerow({"HintID": hint_id, "MoveID": move_id, "MemberID": "12338",
                        "HintTitle": "tt", "HintText": text, "HintCreated": created,
                        "HintModified": created, "HintPriority": "0"})
    return folder


def _write_legacy_export(folder: Path) -> Path:
    # Mirage (freestyle, no MoveType so the 'f' default): hints 1&2 duplicate,
    # 3 empty, 4 distinct, 1 carries HTML. Side Axe is net ('n').
    html_tip = "First tip <p>with HTML</p> and<br>a break."
    return _write_export(folder, [("60", "Mirage", ""), ("299", "Side Axe", "n")], [
        ("1", "60", html_tip, "941471587"),
        ("2", "60", html_tip, "941471600"),
        ("3", "60", "   ", "941471700"),
        ("4", "60", "Second distinct tip.", "941471800"),
        ("5", "299", "Net spike tip.", "941472000"),
    ])


def test_extraction_drops_empty_dedupes_sanitizes_and_carries_move_type(tmp_path: Path) -> None:
    src = _write_legacy_export(tmp_path / "moves2")
    out = tmp_path / "tips.ndjson"
    r = run([str(EXTRACT), "--source", str(src), "--out", str(out)])
    assert r.returncode == 0, r.stderr
    got = [json.loads(ln) for ln in out.read_text(encoding="utf-8").splitlines() if ln.strip()]
    # 5 hints -> 1 empty + 1 duplicate dropped -> 3 written (2 freestyle, 1 net)
    assert len(got) == 3, got
    by_name = {x["legacy_trick_name"]: x for x in got}
    assert by_name["Side Axe"]["move_type"] == "n"
    assert all(x["move_type"] == "f" for x in got if x["legacy_trick_name"] == "Mirage")
    texts = [x["tip_text"] for x in got]
    assert all("<" not in t and ">" not in t for t in texts)         # HTML stripped
    assert any("with HTML" in t and "a break." in t for t in texts)  # sanitized, not dropped
    assert all("tt" not in x.values() for x in got)                  # HintTitle discarded


def test_extraction_without_the_export_names_the_refresh(tmp_path: Path) -> None:
    # An operator without the export must be told which script writes it, and no
    # empty artifact may be left to read as "the legacy site had no tips".
    out = tmp_path / "tips.ndjson"
    r = run([str(EXTRACT), "--source", str(tmp_path / "absent"), "--out", str(out)])
    assert r.returncode != 0
    assert "refresh_legacy_repo_data.py" in r.stderr
    assert not out.exists()


_EMAIL_PATTERN = r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"


def test_extraction_redacts_email_addresses(tmp_path: Path) -> None:
    # Tip text flows verbatim into a committed public artifact and onward to the
    # public trick page; no contact address may survive extraction. Covers both a
    # plain address and an entity-encoded one (redaction runs after unescape).
    src = _write_export(tmp_path / "moves2", [("60", "Mirage", "f")], [
        ("1", "60", "Nice tip. for comments: someone@example.test thanks", "941471587"),
        ("2", "60", "Entity form: someone&#64;example.test bye", "941471600"),
    ])
    out = tmp_path / "tips.ndjson"
    r = run([str(EXTRACT), "--source", str(src), "--out", str(out)])
    assert r.returncode == 0, r.stderr
    import re
    got = [json.loads(ln) for ln in out.read_text(encoding="utf-8").splitlines() if ln.strip()]
    texts = [x["tip_text"] for x in got]
    assert len(texts) == 2
    assert all("[email removed]" in t for t in texts)
    assert not any(re.search(_EMAIL_PATTERN, t) for t in texts)
    # surrounding prose survives the redaction
    assert any(t.startswith("Nice tip.") and t.endswith("thanks") for t in texts)


def test_committed_tips_artifacts_carry_no_email() -> None:
    # Guard on the committed artifacts themselves: no email address in any
    # freestyle input the loaders ingest toward public pages. Read-only.
    import re
    pat = re.compile(_EMAIL_PATTERN)
    inputs_dir = REPO_ROOT / "freestyle" / "inputs"
    offenders = []
    for f in sorted(inputs_dir.glob("*.ndjson")):
        for i, ln in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if pat.search(ln):
                offenders.append(f"{f.name}:{i}")
    assert offenders == [], f"email address in committed freestyle input(s): {offenders}"


# --- loader -------------------------------------------------------------------

def _write_tips(path: Path, rows_in: list[dict]) -> Path:
    path.write_text("\n".join(json.dumps(r) for r in rows_in) + "\n", encoding="utf-8")
    return path


def _tip(hint, move, name, text, mt="f", created=100):
    return {"legacy_hint_id": hint, "legacy_move_id": move, "legacy_trick_name": name,
            "move_type": mt, "tip_text": text, "created_at_legacy": created,
            "modified_at_legacy": created}


def _loader_args(db: Path, tips: Path, review: Path) -> list[str]:
    return [str(LOADER), "--db", str(db), "--tips", str(tips), "--review-out", str(review)]


def test_matched_tips_load_hidden_in_chronological_order(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    seed_trick(db, "mirage", "mirage")
    tips = _write_tips(tmp_path / "t.ndjson", [
        _tip(2, 60, "Mirage", "Second by time.", created=200),
        _tip(1, 60, "Mirage", "First by time.", created=100),
    ])
    assert run(_loader_args(db, tips, tmp_path / "r.json")).returncode == 0
    assert rows(db, "ORDER BY display_order") == [
        ("mirage", "hidden", 0, "First by time."),
        ("mirage", "hidden", 1, "Second by time."),
    ]


def test_no_loaded_tip_is_published_until_a_curator_approves_it(tmp_path: Path) -> None:
    # Defect caught: unvetted legacy tips (profanity and chatter included) going
    # live on public trick pages straight from the load, with no curator approval.
    # Every bucket is loaded; every row is kept for the admin tips page; none is public.
    db = make_db(tmp_path)
    seed_trick(db, "mirage", "mirage")
    seed_trick(db, "clipper_stall", "clipper stall")
    tips = _write_tips(tmp_path / "t.ndjson", [
        _tip(1, 60, "Mirage", "name-matched tip"),
        _tip(2, 18, "Clipper", "override-matched tip"),
        _tip(3, 99, "Clipper set Illusion", "unmatched tip"),
        _tip(4, 299, "Side Axe or Shataf", "net tip", mt="n"),
    ])
    assert run(_loader_args(db, tips, tmp_path / "r.json")).returncode == 0
    assert count(db) == 4
    assert count(db, "WHERE status='published'") == 0
    assert count(db, "WHERE status='hidden'") == 2


def test_alias_resolution_to_hidden(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    seed_trick(db, "eggbeater", "eggbeater", aliases_json='["Atomic Legover"]')
    tips = _write_tips(tmp_path / "t.ndjson", [_tip(1, 70, "Atomic Legover", "alias tip")])
    assert run(_loader_args(db, tips, tmp_path / "r.json")).returncode == 0
    assert rows(db) == [("eggbeater", "hidden", 0, "alias tip")]


def test_unresolved_freestyle_preserved_no_fk(tmp_path: Path) -> None:
    db = make_db(tmp_path)  # no matching trick seeded
    review = tmp_path / "r.json"
    tips = _write_tips(tmp_path / "t.ndjson", [_tip(1, 99, "Clipper set Illusion", "orphan tip")])
    assert run(_loader_args(db, tips, review)).returncode == 0
    # preserved in the table under an unresolved slug, with NO freestyle_tricks row
    assert rows(db) == [("unresolved:clipper-set-illusion", "unresolved_freestyle", 0, "orphan tip")]
    data = json.loads(review.read_text(encoding="utf-8"))
    assert data["summary"]["unresolved_freestyle"] == 1
    assert "unresolved:clipper-set-illusion" in data["unresolved_freestyle"]


def test_net_tip_bucketed_as_future_net_and_not_published(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    review = tmp_path / "r.json"
    tips = _write_tips(tmp_path / "t.ndjson", [
        _tip(1, 299, "Side Axe or Shataf", "net spike tip", mt="n"),
    ])
    assert run(_loader_args(db, tips, review)).returncode == 0
    assert rows(db) == [("unresolved:net:side-axe-or-shataf", "future_net", 0, "net spike tip")]
    assert count(db, "WHERE status='published'") == 0
    data = json.loads(review.read_text(encoding="utf-8"))
    assert data["summary"]["future_net"] == 1
    assert "unresolved:net:side-axe-or-shataf" in data["future_net_content"]


def test_frontier_and_ambiguous_buckets(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    tips = _write_tips(tmp_path / "t.ndjson", [
        _tip(1, 195, "Pogo Op Whirling Swirl", "frontier tip"),
        _tip(2, 167, "Atomic Double Over Down", "ambiguous tip"),
    ])
    assert run(_loader_args(db, tips, tmp_path / "r.json")).returncode == 0
    got = {s: (slug, st) for slug, st, _, s in
           [(r[0], r[1], r[2], r[3]) for r in rows(db)]}
    assert got["frontier tip"] == ("unresolved:pogo-op-whirling-swirl", "unresolved_frontier")
    assert got["ambiguous tip"] == ("unresolved:atomic-double-over-down", "unresolved_ambiguous")


def test_loader_is_idempotent_across_all_buckets(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    seed_trick(db, "mirage", "mirage")
    review = tmp_path / "r.json"
    tips = _write_tips(tmp_path / "t.ndjson", [
        _tip(1, 60, "Mirage", "matched tip"),
        _tip(2, 99, "Clipper set Illusion", "unresolved tip"),
        _tip(3, 299, "Side Axe or Shataf", "net tip", mt="n"),
    ])
    assert run(_loader_args(db, tips, review)).returncode == 0
    first = count(db)
    assert run(_loader_args(db, tips, review)).returncode == 0
    assert count(db) == first == 3


def test_curated_move_id_override_routes_the_clipper_family(tmp_path: Path) -> None:
    # Legacy `moves.Name` is the bare "Clipper" for both the delay (move 18) and
    # Spinning Clipper (move 209); name mapping alone collides both onto the modern
    # 1-ADD kick. The curated move-ID override routes each to its real trick, while
    # the kick's own tips (move 2, "Clipper Kick") still resolve by name/alias.
    db = make_db(tmp_path)
    seed_trick(db, "clipper", "clipper", aliases_json='["Clipper Kick"]')
    seed_trick(db, "clipper_stall", "clipper stall")
    seed_trick(db, "spinning_clipper", "spinning clipper")
    tips = _write_tips(tmp_path / "t.ndjson", [
        _tip(1, 2, "Clipper Kick", "kick tip"),
        _tip(2, 18, "Clipper", "delay tip"),
        _tip(3, 209, "Clipper", "spin tip"),   # colliding name; the override wins
    ])
    assert run(_loader_args(db, tips, tmp_path / "r.json")).returncode == 0
    got = {text: slug for slug, _st, _o, text in rows(db, "WHERE status='hidden'")}
    assert got == {
        "kick tip": "clipper",
        "delay tip": "clipper_stall",
        "spin tip": "spinning_clipper",
    }
    # no tip is lost, duplicated, or left unmatched
    assert count(db) == 3
    assert count(db, "WHERE status='hidden'") == 3
    # a second run is idempotent (DELETE-by-source + INSERT)
    assert run(_loader_args(db, tips, tmp_path / "r.json")).returncode == 0
    assert count(db) == 3


def _seed_tip_row(db: Path, slug: str, text: str) -> None:
    # A pre-existing tip under the loader's own source, so a fail-closed abort can
    # be shown to leave the population untouched (no DELETE-by-source ran).
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO freestyle_trick_tips "
        "(trick_slug, legacy_hint_id, legacy_move_id, tip_text, display_order, "
        " status, source, loaded_at) "
        "VALUES (?, 999, 2, ?, 0, 'published', 'footbag_org_moves2', '2026-01-01T00:00:00Z')",
        (slug, text),
    )
    conn.commit()
    conn.close()


def test_override_missing_target_fails_closed_before_mutation(tmp_path: Path) -> None:
    # A recognized override whose target trick is absent must abort the load with
    # an actionable error and never fall back to name mapping (which would route
    # move 18 back onto the clipper kick). The abort happens before any write.
    db = make_db(tmp_path)
    seed_trick(db, "clipper", "clipper")            # clipper_stall (move 18) NOT seeded
    _seed_tip_row(db, "clipper", "sentinel")        # must survive the aborted run
    tips = _write_tips(tmp_path / "t.ndjson", [_tip(1, 18, "Clipper", "delay tip")])
    r = run(_loader_args(db, tips, tmp_path / "r.json"))
    assert r.returncode != 0
    assert "18" in r.stderr and "clipper_stall" in r.stderr and "missing" in r.stderr, r.stderr
    # population untouched: the sentinel survives, the new tip was never written
    assert rows(db) == [("clipper", "published", 0, "sentinel")]


def test_override_inactive_target_fails_closed_before_mutation(tmp_path: Path) -> None:
    # A recognized override whose target trick exists but is inactive must also
    # abort, distinctly reporting "inactive", before any write.
    db = make_db(tmp_path)
    seed_trick(db, "clipper", "clipper")
    seed_trick(db, "clipper_stall", "clipper stall")
    conn = sqlite3.connect(db)
    conn.execute("UPDATE freestyle_tricks SET is_active = 0 WHERE slug = 'clipper_stall'")
    conn.commit()
    conn.close()
    _seed_tip_row(db, "clipper", "sentinel")
    tips = _write_tips(tmp_path / "t.ndjson", [_tip(1, 18, "Clipper", "delay tip")])
    r = run(_loader_args(db, tips, tmp_path / "r.json"))
    assert r.returncode != 0
    assert "18" in r.stderr and "clipper_stall" in r.stderr and "inactive" in r.stderr, r.stderr
    assert rows(db) == [("clipper", "published", 0, "sentinel")]


def test_extraction_corrects_stale_spinning_clipper_move_name(tmp_path: Path) -> None:
    # Legacy `moves.Name` for move 209 is a stale "Clipper"; the move is Spinning
    # Clipper. Extraction applies the curated correction so the emitted tip carries
    # the real trick name.
    src = _write_export(tmp_path / "moves2", [("209", "Clipper", "f")], [
        ("42", "209", "Begin your spin with your head.", "943602004"),
    ])
    out = tmp_path / "tips.ndjson"
    r = run([str(EXTRACT), "--source", str(src), "--out", str(out)])
    assert r.returncode == 0, r.stderr
    got = [json.loads(ln) for ln in out.read_text(encoding="utf-8").splitlines() if ln.strip()]
    assert len(got) == 1
    assert got[0]["legacy_trick_name"] == "Spinning Clipper"
    assert got[0]["legacy_move_id"] == 209
