"""
Two data-preparation scripts never overwrite a file a person may have edited.

The reconciliation audit's output and the demo clip sidecars are both maintained
by hand between runs, so a rerun proposes its result and leaves them alone.

The audit runs for real from a copy in a scratch tree, because it finds every
path from its own location. The demo script's network and tag checks are replaced,
and its write step runs for real.

Run from repo root:
    python -m pytest legacy_data/tests/test_proposal_file_scripts.py -v
"""
import csv
import json
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))
import acquire_footbag_org_demos as demos  # noqa: E402

SPAWN_TIMEOUT = 120
HAND_EDITED = '"name"\n"a row a curator corrected by hand"\n'
MASTER_COLUMNS = [
    "move_name", "canonical_slug", "display_name", "equivalent_to", "source",
    "source_adds", "doctrine_status", "publication_status", "parse_confidence",
    "add_confidence", "derived_symbolic_family", "primary_operator", "add_formula",
    "parser_notes", "unresolved_questions", "provenance_notes",
]


@pytest.fixture
def audit_tree(tmp_path):
    scripts = tmp_path / "legacy_data" / "scripts"
    scripts.mkdir(parents=True)
    shutil.copy(REPO_ROOT / "legacy_data" / "scripts" / "audit_vocabulary_reconciliation.py", scripts)

    inputs = tmp_path / "freestyle" / "inputs" / "observational"
    inputs.mkdir(parents=True)
    with (inputs / "SYMBOLIC_GRAMMAR_MASTER.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=MASTER_COLUMNS)
        writer.writeheader()
        writer.writerow({**{c: "" for c in MASTER_COLUMNS}, "move_name": "Sample Move", "source": "FM"})
    (inputs / "RECONCILIATION.csv").write_text(HAND_EDITED)

    (tmp_path / "database").mkdir()
    db = sqlite3.connect(tmp_path / "database" / "footbag.db")
    db.execute("CREATE TABLE freestyle_tricks (slug TEXT, canonical_name TEXT, aliases_json TEXT)")
    db.commit()
    db.close()
    return tmp_path


def run_audit(tree: Path) -> None:
    subprocess.run(
        [sys.executable, str(tree / "legacy_data" / "scripts" / "audit_vocabulary_reconciliation.py")],
        cwd=tree, check=True, capture_output=True, text=True, timeout=SPAWN_TIMEOUT,
    )


def test_the_audit_leaves_the_live_reconciliation_file_alone(audit_tree):
    run_audit(audit_tree)
    live = audit_tree / "freestyle" / "inputs" / "observational" / "RECONCILIATION.csv"
    assert live.read_text() == HAND_EDITED


def test_the_audit_writes_its_result_to_the_reports_folder(audit_tree):
    run_audit(audit_tree)
    proposal = audit_tree / "freestyle" / "reports" / "RECONCILIATION.proposed.csv"
    with proposal.open(newline="") as f:
        names = [row["name"] for row in csv.DictReader(f)]
    assert names == ["Sample Move"]


def test_the_reports_folder_is_ignored_by_git():
    result = subprocess.run(
        ["git", "check-ignore", "-q", "freestyle/reports/RECONCILIATION.proposed.csv"],
        cwd=REPO_ROOT, timeout=SPAWN_TIMEOUT,
    )
    assert result.returncode == 0


@pytest.fixture
def demo_tree(tmp_path, monkeypatch):
    dest = tmp_path / "curated" / "freestyle_demos"
    dest.mkdir(parents=True)
    (dest / "clip.mov").write_bytes(b"already downloaded")
    (dest / "clip.poster.jpg").write_bytes(b"already downloaded")
    manifest = tmp_path / "manifest.csv"
    manifest.write_text("present")

    monkeypatch.setattr(demos, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(demos, "DEST_DIR", dest)
    monkeypatch.setattr(demos, "MANIFEST", manifest)
    monkeypatch.setattr(demos, "validate", lambda _plan: [])
    monkeypatch.setattr(demos, "load_rows", lambda: [{
        "trick_slug": "whirl",
        "raw_asset_url": "http://www.footbag.org/media/42/clip.mov",
        "clip_label": "Whirl (a contributor)",
        "sub_archive": "media_42",
        "source_page_url": "http://www.footbag.org/newmoves/showmove/1",
        "contributor": "a contributor",
    }])
    monkeypatch.setattr(sys, "argv", ["acquire_footbag_org_demos.py"])
    return dest


GENERATED = {
    "caption": "Whirl",
    "tags": ["#whirl", "#freestyle", "#trick", "#footbag_org"],
    "poster": "clip.poster.jpg",
    "externalUrl": "http://www.footbag.org/newmoves/showmove/1",
}


def test_a_new_clip_gets_its_sidecar(demo_tree):
    assert demos.main() == 0
    assert json.loads((demo_tree / "clip.meta.json").read_text()) == GENERATED
    assert not (demo_tree / "clip.meta.json.proposed").exists()


def test_an_edited_sidecar_is_kept_and_the_result_is_proposed_beside_it(demo_tree):
    edited = json.dumps({**GENERATED, "tags": ["#whirl", "#freestyle", "#trick", "#demo"]})
    (demo_tree / "clip.meta.json").write_text(edited)

    assert demos.main() == 0

    assert (demo_tree / "clip.meta.json").read_text() == edited
    assert json.loads((demo_tree / "clip.meta.json.proposed").read_text()) == GENERATED


def test_a_sidecar_that_already_matches_gets_no_proposal(demo_tree):
    (demo_tree / "clip.meta.json").write_text(json.dumps(GENERATED, indent=2) + "\n")

    assert demos.main() == 0

    assert not (demo_tree / "clip.meta.json.proposed").exists()
