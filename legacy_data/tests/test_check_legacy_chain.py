"""
test_check_legacy_chain.py
==========================

Contract tests for check_legacy_chain.py, the read-only check the member-data build
runs before it touches the database. A build must refuse when the export, the
published member CSV, the audited figures and the account rulings come from
different deliveries, and pass when they agree.

Every input is a synthetic private checkout under a temp directory; the member
audit is replaced by a stub that passes or fails on request.

Run from repo root:
    python -m pytest legacy_data/tests/test_check_legacy_chain.py -v
"""
import hashlib
import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "legacy_data" / "scripts" / "check_legacy_chain.py"
_spec = importlib.util.spec_from_file_location("check_legacy_chain", SCRIPT)
chain = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(chain)

LIVE = "b" * 40
DUMP_SHA = "d" * 64


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@pytest.fixture
def tree(tmp_path, monkeypatch):
    """A consistent private checkout: one delivery throughout."""
    private = tmp_path / "private"
    export_members = b"MemberID\n1\n2\n"
    published = b"legacy_member_id\n1\n2\n"
    (private / "legacy-export/members").mkdir(parents=True)
    (private / "legacy-export/members/members.csv").write_bytes(export_members)
    (private / "legacy-export/REFRESH_MANIFEST.tsv").write_text(
        f"original_head\t{'a' * 40}\nlive_head\t{LIVE}\n"
        "source\tsha256\tbytes\tdialect\tdump_completed\n"
        f"members/backups/latest.sql\t{DUMP_SHA}\t1\tmariadb\t2026-10-29\n", encoding="utf-8")
    (private / "legacy-publish").mkdir()
    (private / "legacy-publish/legacy_members.csv").write_bytes(published)
    (private / "legacy-publish/PUBLISH_STAMP.tsv").write_text(
        f"refresh_live_head\t{LIVE}\nmembers_dump_sha256\t{DUMP_SHA}\n"
        f"export_members_csv_sha256\t{_sha(export_members)}\n"
        f"published_members_csv_sha256\t{_sha(published)}\n", encoding="utf-8")
    ov = private / "private_data/stage_a_overrides"
    ov.mkdir(parents=True)
    (ov / "person_link_holds.csv").write_text("decision\n", encoding="utf-8")
    (ov / "FITTED_EXPORT.tsv").write_text(
        f"boundary_fingerprint\t{'e' * 64}\nexport_members_csv_sha256\t{_sha(export_members)}\n",
        encoding="utf-8")
    audit = tmp_path / "audit_stub.py"
    audit.write_text("import sys\nsys.exit(0)\n", encoding="utf-8")
    for name, value in {
        "PRIVATE": private, "CLONE": tmp_path / "no-clone",
        "EXPORT": private / "legacy-export",
        "MANIFEST": private / "legacy-export/REFRESH_MANIFEST.tsv",
        "EXPORT_MEMBERS": private / "legacy-export/members/members.csv",
        "STAMP": private / "legacy-publish/PUBLISH_STAMP.tsv",
        "PUBLISHED": private / "legacy-publish/legacy_members.csv",
        "OVERRIDES": ov, "FITTED": ov / "FITTED_EXPORT.tsv", "AUDIT": audit,
    }.items():
        monkeypatch.setattr(chain, name, value)
    return private, audit


def _run(strict=False, require_committed=False):
    return chain.check(strict, sys.executable, require_committed)


def test_one_delivery_throughout_passes(tree):
    # A guard that refused a consistent chain would block every rebuild.
    errors, warnings = _run(strict=True)
    assert errors == []
    assert any("clone is not on this machine" in w for w in warnings)


def test_a_publish_from_another_delivery_refuses(tree):
    # The near miss this exists for: refreshed, not yet published, deployed anyway.
    private, _ = tree
    stamp = private / "legacy-publish/PUBLISH_STAMP.tsv"
    stamp.write_text(stamp.read_text().replace(LIVE, "c" * 40), encoding="utf-8")
    assert any("another delivery" in e for e in _run()[0])


def test_an_export_refreshed_after_the_publish_refuses(tree):
    # Same commit, but the refresh rewrote the members CSV after the publish read it.
    private, _ = tree
    (private / "legacy-export/members/members.csv").write_bytes(b"MemberID\n1\n2\n3\n")
    assert any("changed after the publish" in e for e in _run()[0])


def test_a_hand_edited_published_csv_refuses(tree):
    # The member load would read rows the publish never wrote.
    private, _ = tree
    (private / "legacy-publish/legacy_members.csv").write_bytes(b"legacy_member_id\n9\n")
    assert any("not the one the publish wrote" in e for e in _run()[0])


def test_a_missing_publish_stamp_refuses(tree):
    private, _ = tree
    (private / "legacy-publish/PUBLISH_STAMP.tsv").unlink()
    assert any("publish stamp is missing" in e for e in _run()[0])


def test_rulings_fitted_to_another_export_refuse(tree):
    # Stale rulings otherwise stop the load half way, after the database is gone.
    private, _ = tree
    (private / "private_data/stage_a_overrides/FITTED_EXPORT.tsv").write_text(
        f"export_members_csv_sha256\t{'0' * 64}\n", encoding="utf-8")
    assert any("not re-fitted" in e for e in _run()[0])


def test_a_failing_pre_build_audit_refuses_and_names_the_failed_check(tree):
    # Stale audited figures otherwise fail only after member rows are written.
    _, audit = tree
    audit.write_text("import sys\nprint('FAIL delivered export size: 3 not 2')\nsys.exit(1)\n",
                     encoding="utf-8")
    errors = _run()[0]
    assert any("FAIL delivered export size" in e for e in errors)


def test_a_clone_pulled_past_the_refresh_warns_locally_and_refuses_a_deploy(tree, tmp_path,
                                                                           monkeypatch):
    # A newer delivery waiting is fine for a local rebuild, never for a deploy.
    clone = tmp_path / "clone"
    clone.mkdir()
    env = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.invalid",
           "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.invalid",
           "PATH": "/usr/bin:/bin"}
    for args in (["init", "-q"], ["commit", "-q", "--allow-empty", "-m", "x"]):
        subprocess.run(["git", "-C", str(clone), *args], check=True, env=env, timeout=60)
    monkeypatch.setattr(chain, "CLONE", clone)
    errors, warnings = _run(strict=False)
    assert errors == [] and any("newer delivery" in w for w in warnings)
    assert any("newer delivery" in e for e in _run(strict=True)[0])


def test_uncommitted_private_changes_refuse_a_production_deploy_and_warn_elsewhere(tree):
    # Production's committed private data is the record of what it loaded; a staging
    # or local build is how those changes are tested before anyone commits them.
    private, _ = tree
    env = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.invalid",
           "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.invalid",
           "PATH": "/usr/bin:/bin"}
    for args in (["init", "-q"], ["add", "-A"], ["commit", "-q", "-m", "x"]):
        subprocess.run(["git", "-C", str(private), *args], check=True, env=env, timeout=60)
    assert _run(strict=True, require_committed=True)[0] == []
    (private / "legacy-publish/README.md").write_text("edited\n", encoding="utf-8")
    errors, warnings = _run(strict=True)
    assert errors == [] and any("uncommitted" in w for w in warnings)
    assert any("uncommitted" in e for e in _run(strict=True, require_committed=True)[0])


def test_the_deploy_runs_the_check_before_its_production_gate():
    # Refused only inside the data build, a stale chain would first cost a typed
    # confirmation and password, and the build runs after the gate.
    text = (REPO_ROOT / "deploy_to_aws.sh").read_text()
    i_check = text.index("check_legacy_chain.py")
    assert i_check < text.index("Set by the production gate below")
    block = text[text.rindex("if (( ALL_DATA_ASKED == 1 )); then", 0, i_check):]
    block = block[:block.index("\nfi\n") + 4]
    assert "CHAIN_ARGS=(--strict)" in block
    assert '== "footbag-production" ]] && CHAIN_ARGS+=(--require-committed)' in block
    assert "exit 1" in block


def test_the_build_runs_the_check_before_it_destroys_the_database():
    # Run after the reset, the check would cost the database it exists to protect.
    text = (REPO_ROOT / "scripts" / "deploy-local-data.sh").read_text()
    body = text[text.index("run_all_data() {"):]
    i_check = body.index("check_legacy_chain.py")
    assert i_check < body.index("run_from_csv")
    after = body[i_check:body.index("fi", i_check)]
    assert "exit 1" in after
    assert '== "deploy" ]] && chain_args+=(--strict)' in body[:i_check]
    # The server comes only from the deploy entry point's label, so the build never
    # reads the target; production's commit requirement sits at that entry point.
    assert "DEPLOY_TARGET" not in body[:i_check]
