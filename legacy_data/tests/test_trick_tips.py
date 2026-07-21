"""Tests for the legacy footbag.org Member Tips recovery pipeline.

Extraction (legacy_data/scripts/extract_footbag_org_member_tips.py): empty tips
dropped, exact duplicates within a move dropped, legacy HTML sanitized, HintTitle
discarded, legacy move_type ('f' freestyle / 'n' net) carried.

Loader (freestyle/loaders/27_load_trick_tips.py): every tip is PRESERVED in
freestyle_trick_tips under one of five buckets; only status='published' rows are
public:
  - published            : legacy name mapped to a canonical slug (alias-aware)
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

def _write_legacy_sql(path: Path) -> Path:
    # Mirage (freestyle, default move_type 'f'): hints 1&2 duplicate, 3 empty,
    # 4 distinct, 1 carries HTML. Side Axe (net, move_type 'n' at index 16).
    path.write_text(
        "INSERT INTO `moves` VALUES (60,0,'Mirage');\n"
        "INSERT INTO `moves` VALUES (299,0,'Side Axe',0,0,0,0,0,0,0,0,0,0,0,0,0,'n');\n"
        "INSERT INTO `movehints` VALUES "
        "(1,60,12338,'tt','First tip <p>with HTML</p> and<br>a break.',941471587,941471587,0),"
        "(2,60,12338,'tt','First tip <p>with HTML</p> and<br>a break.',941471600,941471600,0),"
        "(3,60,12338,'tt','   ',941471700,941471700,0),"
        "(4,60,12338,'tt','Second distinct tip.',941471800,941471800,0),"
        "(5,299,12338,'tt','Net spike tip.',941472000,941472000,0);\n",
        encoding="utf-8",
    )
    return path


def test_extraction_drops_empty_dedupes_sanitizes_and_carries_move_type(tmp_path: Path) -> None:
    src = _write_legacy_sql(tmp_path / "legacy.sql")
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


_EMAIL_PATTERN = r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"


def test_extraction_redacts_email_addresses(tmp_path: Path) -> None:
    # Tip text flows verbatim into a committed public artifact and onward to the
    # public trick page; no contact address may survive extraction. Covers both a
    # plain address and an entity-encoded one (redaction runs after unescape).
    src = tmp_path / "legacy.sql"
    src.write_text(
        "INSERT INTO `moves` VALUES (60,0,'Mirage');\n"
        "INSERT INTO `movehints` VALUES "
        "(1,60,12338,'tt','Nice tip. for comments: someone@example.test thanks',941471587,941471587,0),"
        "(2,60,12338,'tt','Entity form: someone&#64;example.test bye',941471600,941471600,0);\n",
        encoding="utf-8",
    )
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


def test_published_mapping_in_chronological_order(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    seed_trick(db, "mirage", "mirage")
    tips = _write_tips(tmp_path / "t.ndjson", [
        _tip(2, 60, "Mirage", "Second by time.", created=200),
        _tip(1, 60, "Mirage", "First by time.", created=100),
    ])
    assert run(_loader_args(db, tips, tmp_path / "r.json")).returncode == 0
    assert rows(db, "WHERE status='published' ORDER BY display_order") == [
        ("mirage", "published", 0, "First by time."),
        ("mirage", "published", 1, "Second by time."),
    ]


def test_alias_resolution_to_published(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    seed_trick(db, "eggbeater", "eggbeater", aliases_json='["Atomic Legover"]')
    tips = _write_tips(tmp_path / "t.ndjson", [_tip(1, 70, "Atomic Legover", "alias tip")])
    assert run(_loader_args(db, tips, tmp_path / "r.json")).returncode == 0
    assert rows(db, "WHERE status='published'") == [("eggbeater", "published", 0, "alias tip")]


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
        _tip(1, 60, "Mirage", "published tip"),
        _tip(2, 99, "Clipper set Illusion", "unresolved tip"),
        _tip(3, 299, "Side Axe or Shataf", "net tip", mt="n"),
    ])
    assert run(_loader_args(db, tips, review)).returncode == 0
    first = count(db)
    assert run(_loader_args(db, tips, review)).returncode == 0
    assert count(db) == first == 3
