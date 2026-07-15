"""Apply-side tests for the member auto-merge (member_merge.py).

Real in-memory SQLite with the referencing tables and their unique indexes:

  * build-time pipeline references (historical_persons, club affiliations,
    club bootstrap leaders) remap loser -> survivor;
  * live-entity references (members, account_tokens, auto_link_staged_candidates,
    an existing legacy_members row, a claimed bootstrap leadership) hard-abort
    before any mutation;
  * a uniqueness collision that is an exact duplicate is deduplicated, one that
    is not is aborted, and two different canonical persons never fuse;
  * a MergeAbort inside the caller's transaction rolls everything back;
  * after a clean apply no loser id survives in any referencing table.
"""
import sqlite3
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "legacy_data" / "member_data_scripts"))
import member_merge as mm  # noqa: E402

SCHEMA = """
CREATE TABLE legacy_members (
  legacy_member_id TEXT PRIMARY KEY,
  claimed_by_member_id TEXT,
  claimed_at TEXT
);
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  legacy_member_id TEXT
);
CREATE TABLE account_tokens (
  id TEXT PRIMARY KEY,
  target_legacy_member_id TEXT
);
CREATE TABLE auto_link_staged_candidates (
  id TEXT PRIMARY KEY,
  legacy_member_id TEXT
);
CREATE TABLE historical_persons (
  person_id TEXT PRIMARY KEY,
  legacy_member_id TEXT
);
CREATE UNIQUE INDEX ux_hp_lmid ON historical_persons(legacy_member_id)
  WHERE legacy_member_id IS NOT NULL;
CREATE TABLE legacy_person_club_affiliations (
  id TEXT PRIMARY KEY,
  historical_person_id TEXT,
  legacy_member_id TEXT,
  legacy_club_candidate_id TEXT NOT NULL,
  inferred_role TEXT NOT NULL,
  confidence_score REAL,
  resolution_status TEXT,
  resolved_club_id TEXT,
  display_name TEXT,
  notes TEXT
);
CREATE UNIQUE INDEX ux_affil ON legacy_person_club_affiliations(
  legacy_member_id, legacy_club_candidate_id, inferred_role)
  WHERE legacy_member_id IS NOT NULL;
CREATE TABLE club_bootstrap_leaders (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL,
  imported_member_id TEXT,
  claimed_member_id TEXT,
  legacy_member_id TEXT NOT NULL,
  role TEXT NOT NULL,
  confidence_score REAL,
  status TEXT,
  claim_confirmed_at TEXT,
  notes TEXT,
  UNIQUE(club_id, legacy_member_id, role)
);
"""


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    # Manual transaction control, matching how load_legacy_export drives BEGIN /
    # commit / rollback explicitly (no implicit per-statement transaction).
    conn.isolation_level = None
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def _ins(cur, table, **cols):
    keys = ", ".join(cols)
    qs = ", ".join("?" for _ in cols)
    cur.execute(f"INSERT INTO {table} ({keys}) VALUES ({qs})", tuple(cols.values()))


def _seed_survivor(cur, sid="100"):
    _ins(cur, "legacy_members", legacy_member_id=sid)


def _one(cur, sql, *params):
    r = cur.execute(sql, params).fetchone()
    return r[0] if r else None


# ── pipeline reference remap ────────────────────────────────────────────────

def test_pipeline_references_remap_to_survivor():
    conn = _db(); cur = conn.cursor()
    _seed_survivor(cur, "100")
    _ins(cur, "historical_persons", person_id="pX", legacy_member_id="200")
    _ins(cur, "legacy_person_club_affiliations", id="a1", legacy_member_id="200",
         legacy_club_candidate_id="c1", inferred_role="member")
    _ins(cur, "club_bootstrap_leaders", id="b1", club_id="cl1",
         legacy_member_id="200", role="leader")

    stats = mm.apply_member_merge(cur, {"200": "100"})

    assert _one(cur, "SELECT legacy_member_id FROM historical_persons WHERE person_id='pX'") == "100"
    assert _one(cur, "SELECT legacy_member_id FROM legacy_person_club_affiliations WHERE id='a1'") == "100"
    assert _one(cur, "SELECT legacy_member_id FROM club_bootstrap_leaders WHERE id='b1'") == "100"
    assert stats["remap"]["historical_persons"]["remapped"] == 1
    # nothing left on the loser
    mm.verify_no_loser_remains(cur, {"200"})


# ── live-entity references hard-abort before mutation ───────────────────────

@pytest.mark.parametrize("seed", [
    lambda cur: _ins(cur, "legacy_members", legacy_member_id="200"),
    lambda cur: _ins(cur, "members", id="m1", legacy_member_id="200"),
    lambda cur: _ins(cur, "account_tokens", id="t1", target_legacy_member_id="200"),
    lambda cur: _ins(cur, "auto_link_staged_candidates", id="s1", legacy_member_id="200"),
    lambda cur: _ins(cur, "club_bootstrap_leaders", id="b1", club_id="cl1",
                     legacy_member_id="200", role="leader", claimed_member_id="m9"),
])
def test_live_reference_hard_aborts_before_mutation(seed):
    conn = _db(); cur = conn.cursor()
    _seed_survivor(cur, "100")
    _ins(cur, "historical_persons", person_id="pX", legacy_member_id="200")
    seed(cur)
    with pytest.raises(mm.MergeAbort):
        mm.precheck_live_references(cur, {"200"})
    # precheck is a pure read: the pipeline ref is still on the loser, untouched.
    assert _one(cur, "SELECT legacy_member_id FROM historical_persons WHERE person_id='pX'") == "200"


# ── uniqueness resolution ───────────────────────────────────────────────────

def test_affiliation_exact_duplicate_is_deduped():
    conn = _db(); cur = conn.cursor()
    _seed_survivor(cur, "100")
    common = dict(legacy_club_candidate_id="c1", inferred_role="member",
                  confidence_score=0.7, resolution_status="pending",
                  resolved_club_id=None, display_name="Sam", notes=None,
                  historical_person_id=None)
    _ins(cur, "legacy_person_club_affiliations", id="surv", legacy_member_id="100", **common)
    _ins(cur, "legacy_person_club_affiliations", id="lose", legacy_member_id="200", **common)

    stats = mm.apply_member_merge(cur, {"200": "100"})
    assert stats["remap"]["legacy_person_club_affiliations"]["deduped"] == 1
    assert _one(cur, "SELECT COUNT(*) FROM legacy_person_club_affiliations WHERE legacy_member_id='100'") == 1
    assert _one(cur, "SELECT COUNT(*) FROM legacy_person_club_affiliations WHERE id='lose'") == 0


def test_affiliation_nonexact_collision_aborts():
    conn = _db(); cur = conn.cursor()
    _seed_survivor(cur, "100")
    _ins(cur, "legacy_person_club_affiliations", id="surv", legacy_member_id="100",
         legacy_club_candidate_id="c1", inferred_role="member", confidence_score=0.7)
    _ins(cur, "legacy_person_club_affiliations", id="lose", legacy_member_id="200",
         legacy_club_candidate_id="c1", inferred_role="member", confidence_score=0.2)
    with pytest.raises(mm.MergeAbort):
        mm.apply_member_merge(cur, {"200": "100"})


def test_historical_persons_two_different_persons_abort():
    conn = _db(); cur = conn.cursor()
    _seed_survivor(cur, "100")
    _ins(cur, "historical_persons", person_id="pS", legacy_member_id="100")
    _ins(cur, "historical_persons", person_id="pL", legacy_member_id="200")
    with pytest.raises(mm.MergeAbort):
        mm.apply_member_merge(cur, {"200": "100"})


def test_missing_survivor_row_aborts():
    conn = _db(); cur = conn.cursor()   # no survivor seeded
    _ins(cur, "historical_persons", person_id="pX", legacy_member_id="200")
    with pytest.raises(mm.MergeAbort):
        mm.apply_member_merge(cur, {"200": "100"})


# ── transaction rollback is complete ────────────────────────────────────────

def test_abort_inside_transaction_rolls_everything_back():
    conn = _db(); cur = conn.cursor()
    _seed_survivor(cur, "100")
    _ins(cur, "historical_persons", person_id="pS", legacy_member_id="100")
    _ins(cur, "historical_persons", person_id="pL", legacy_member_id="200")

    cur.execute("BEGIN")
    cur.execute("INSERT INTO legacy_members (legacy_member_id) VALUES ('999')")  # a survivor upsert
    try:
        mm.apply_member_merge(cur, {"200": "100"})   # aborts: two different persons
        conn.commit()
    except mm.MergeAbort:
        conn.rollback()
    # the mid-transaction insert is gone, and the loser link is untouched.
    assert _one(cur, "SELECT COUNT(*) FROM legacy_members WHERE legacy_member_id='999'") == 0
    assert _one(cur, "SELECT legacy_member_id FROM historical_persons WHERE person_id='pL'") == "200"


# ── verification catches a dangling loser ───────────────────────────────────

def test_verify_flags_a_dangling_loser():
    conn = _db(); cur = conn.cursor()
    _ins(cur, "auto_link_staged_candidates", id="s1", legacy_member_id="200")
    with pytest.raises(mm.MergeAbort):
        mm.verify_no_loser_remains(cur, {"200"})


# ── merge-map loader guards ─────────────────────────────────────────────────

def test_synthetic_final_apply_leaves_no_dangling_loser(tmp_path):
    """End-to-end through the real loader CLI against the real schema: a loser
    with pipeline references (person link, affiliation, bootstrap) is merged into
    its survivor; the survivor imports with consolidated evidence, and no loser id
    remains in any referencing table."""
    import csv
    import os
    import subprocess

    db = tmp_path / "e2e.db"
    schema = (REPO_ROOT / "database" / "schema.sql").read_text()
    con = sqlite3.connect(db)
    con.executescript(schema)
    con.close()

    con = sqlite3.connect(db)
    con.execute("PRAGMA foreign_keys=OFF")
    aud = ("created_at,created_by,updated_at,updated_by",
           "'t','seed','t','seed'")
    con.execute("INSERT INTO historical_persons(person_id,person_name,legacy_member_id) "
                "VALUES('pX','Sam Kim','200')")
    con.execute(f"INSERT INTO legacy_person_club_affiliations"
                f"(id,legacy_member_id,legacy_club_candidate_id,inferred_role,{aud[0]}) "
                f"VALUES('a1','200','cand1','member',{aud[1]})")
    con.execute(f"INSERT INTO club_bootstrap_leaders"
                f"(id,club_id,legacy_member_id,role,{aud[0]}) "
                f"VALUES('b1','cl1','200','leader',{aud[1]})")
    con.commit()
    con.close()

    fields = ["legacy_member_id", "member_valid", "legacy_user_id", "legacy_email",
              "legacy_email2", "legacy_email3", "real_name", "display_name", "city",
              "region", "country", "bio", "birth_date", "street_address", "postal_code",
              "ifpa_join_date", "is_hof", "is_bap", "legacy_is_admin",
              "legacy_ever_paid_tier2", "legacy_ever_paid_tier1_lifetime",
              "legacy_tier1_annual_active_at_cutover", "legacy_was_board_at_cutover",
              "legacy_board_underlying_paid_tier"]
    survivor = {f: "" for f in fields}
    survivor.update(legacy_member_id="100", member_valid="1", legacy_user_id="sam",
                    legacy_email="s@x.com", legacy_email2="l@x.com", real_name="Sam Kim",
                    display_name="Sam Kim", birth_date="1990-05-05", is_bap="1",
                    legacy_ever_paid_tier2="1")
    merged = tmp_path / "merged.csv"
    with merged.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        w.writerow(survivor)
    mp = tmp_path / "map.csv"
    mp.write_text(
        "group_id,match_key,survivor_legacy_member_id,loser_legacy_member_id,survivor_email_union\n"
        "A1,x,100,200,s@x.com l@x.com\n", encoding="utf-8")

    loader = REPO_ROOT / "legacy_data" / "member_data_scripts" / "load_legacy_export.py"
    env = dict(os.environ, FOOTBAG_ENV="dev", NODE_ENV="development")
    r = subprocess.run([sys.executable, str(loader), "--export", str(merged),
                        "--db", str(db), "--apply", "--merge-map", str(mp)],
                       capture_output=True, text=True, env=env)
    assert r.returncode == 0, r.stderr

    con = sqlite3.connect(db)
    one = lambda s: (con.execute(s).fetchone() or [None])[0]
    assert one("SELECT 1 FROM legacy_members WHERE legacy_member_id='100'") == 1
    assert one("SELECT 1 FROM legacy_members WHERE legacy_member_id='200'") is None
    assert one("SELECT is_bap FROM legacy_members WHERE legacy_member_id='100'") == 1
    assert one("SELECT legacy_member_id FROM historical_persons WHERE person_id='pX'") == "100"
    assert one("SELECT legacy_member_id FROM legacy_person_club_affiliations WHERE id='a1'") == "100"
    assert one("SELECT legacy_member_id FROM club_bootstrap_leaders WHERE id='b1'") == "100"
    dangling = sum(one(f"SELECT COUNT(*) FROM {t} WHERE {c}='200'") for t, c in [
        ("legacy_members", "legacy_member_id"),
        ("historical_persons", "legacy_member_id"),
        ("legacy_person_club_affiliations", "legacy_member_id"),
        ("club_bootstrap_leaders", "legacy_member_id"),
        ("members", "legacy_member_id"),
        ("account_tokens", "target_legacy_member_id"),
        ("auto_link_staged_candidates", "legacy_member_id"),
    ])
    con.close()
    assert dangling == 0


def test_merge_map_rejects_a_chain(tmp_path):
    p = tmp_path / "map.csv"
    p.write_text(
        "group_id,match_key,survivor_legacy_member_id,loser_legacy_member_id,survivor_email_union\n"
        "A1,x,100,200,\n"
        "A2,y,200,300,\n",   # 200 is both a survivor and a loser
        encoding="utf-8")
    with pytest.raises(mm.MergeAbort):
        mm.load_merge_map(p)
