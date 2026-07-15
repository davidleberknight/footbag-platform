"""
Email-template seeder: sidecars -> email_templates reconcile contract.

scripts/seed_email_templates.py loads the committed /curated/email_templates/
sidecars into email_templates. Pinned here: a fresh-schema seed loads every
sidecar; re-running is idempotent (same row count, stable ids); a deleted
sidecar's row is removed on the next run (orphan cleanup); malformed sidecars
(stem/key mismatch, unknown field, bad classification, conditional-syntax
braces) abort with an actionable error before any write; and a database
carrying the in-database post-cutover marker is refused before any mutation,
because the reconcile model would clobber admin-edited wording.

Run from repo root:
    python -m pytest legacy_data/tests/test_seed_email_templates.py -v
"""
import json
import sqlite3
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SEEDER = REPO_ROOT / "scripts" / "seed_email_templates.py"
SCHEMA = REPO_ROOT / "database" / "schema.sql"
SIDECAR_DIR = REPO_ROOT / "curated" / "email_templates"


def make_schema_db(path):
    con = sqlite3.connect(path)
    con.executescript(SCHEMA.read_text(encoding="utf-8"))
    con.close()


def write_sidecar(dirpath, key, **overrides):
    data = {
        "templateKey": key,
        "subjectTemplate": "Subject for " + key,
        "bodyTemplate": "Hello {memberName},\nbody for " + key + ".",
        "piiClassification": "internal",
        "isEnabled": True,
    }
    data.update(overrides)
    (dirpath / f"{key}.json").write_text(json.dumps(data), encoding="utf-8")


def run_seeder(db, source_dir):
    return subprocess.run(
        ["python3", str(SEEDER), "--db", str(db), "--source-dir", str(source_dir)],
        capture_output=True,
        text=True,
    )


def rows(db):
    con = sqlite3.connect(db)
    got = con.execute(
        "SELECT template_key, subject_template, is_enabled, pii_classification, id"
        " FROM email_templates ORDER BY template_key"
    ).fetchall()
    con.close()
    return got


def test_seeds_the_committed_sidecars_against_a_fresh_schema(tmp_path):
    db = tmp_path / "fresh.db"
    make_schema_db(db)
    result = run_seeder(db, SIDECAR_DIR)
    assert result.returncode == 0, result.stderr
    committed = sorted(p.stem for p in SIDECAR_DIR.glob("*.json"))
    assert [r[0] for r in rows(db)] == committed


def test_rerun_is_idempotent_with_stable_ids(tmp_path):
    db = tmp_path / "twice.db"
    make_schema_db(db)
    run_seeder(db, SIDECAR_DIR)
    first = rows(db)
    result = run_seeder(db, SIDECAR_DIR)
    assert result.returncode == 0, result.stderr
    assert rows(db) == first


def test_orphan_row_is_deleted_when_its_sidecar_disappears(tmp_path):
    src = tmp_path / "sidecars"
    src.mkdir()
    write_sidecar(src, "keep_me")
    write_sidecar(src, "drop_me")
    db = tmp_path / "orphan.db"
    make_schema_db(db)
    run_seeder(db, src)
    assert [r[0] for r in rows(db)] == ["drop_me", "keep_me"]
    (src / "drop_me.json").unlink()
    result = run_seeder(db, src)
    assert result.returncode == 0, result.stderr
    assert [r[0] for r in rows(db)] == ["keep_me"]


def test_stem_key_mismatch_aborts_before_writing(tmp_path):
    src = tmp_path / "sidecars"
    src.mkdir()
    (src / "wrong_name.json").write_text(
        json.dumps({
            "templateKey": "other_key",
            "subjectTemplate": "s",
            "bodyTemplate": "b",
            "piiClassification": "internal",
            "isEnabled": True,
        }),
        encoding="utf-8",
    )
    db = tmp_path / "mismatch.db"
    make_schema_db(db)
    result = run_seeder(db, src)
    assert result.returncode != 0
    assert "stem" in result.stderr
    assert rows(db) == []


def test_conditional_syntax_braces_are_rejected(tmp_path):
    src = tmp_path / "sidecars"
    src.mkdir()
    write_sidecar(src, "branchy", bodyTemplate="{{#if x}}yes{{/if}}")
    db = tmp_path / "branchy.db"
    make_schema_db(db)
    result = run_seeder(db, src)
    assert result.returncode != 0
    assert "logic-less" in result.stderr
    assert rows(db) == []


def test_unknown_field_and_bad_classification_abort(tmp_path):
    src = tmp_path / "sidecars"
    src.mkdir()
    write_sidecar(src, "extra_field", extraThing="nope")
    db = tmp_path / "unknown.db"
    make_schema_db(db)
    result = run_seeder(db, src)
    assert result.returncode != 0
    assert "unknown field" in result.stderr.lower()

    (src / "extra_field.json").unlink()
    write_sidecar(src, "bad_class", piiClassification="top_secret")
    result = run_seeder(db, src)
    assert result.returncode != 0
    assert "piiClassification" in result.stderr


def test_refuses_a_post_cutover_database_before_any_mutation(tmp_path):
    db = tmp_path / "marked.db"
    make_schema_db(db)
    run_seeder(db, SIDECAR_DIR)
    con = sqlite3.connect(db)
    con.execute(
        "INSERT INTO system_config (id, created_at, config_key, value_json,"
        " effective_start_at, reason_text) VALUES"
        " ('cfg_test_cutover', '2026-01-01T00:00:00.000Z', 'post_cutover', '1',"
        "  '2026-01-01T00:00:00.000Z', 'test fixture')"
    )
    # Simulate a post-cutover admin edit that a reseed would clobber.
    con.execute(
        "UPDATE email_templates SET subject_template = 'admin edited', version = 2"
        " WHERE template_key = 'account_verify'"
    )
    con.commit()
    con.close()
    result = run_seeder(db, SIDECAR_DIR)
    assert result.returncode != 0
    assert "post-cutover" in result.stderr
    assert "no bypass" in result.stderr
    edited = [r for r in rows(db) if r[0] == "account_verify"]
    assert edited[0][1] == "admin edited", "the refusal must land before any mutation"
