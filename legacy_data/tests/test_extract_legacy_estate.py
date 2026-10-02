"""
test_extract_legacy_estate.py
=============================

Pins the legacy estate extractor's output contract:

  - every file it leaves in the export is owner-only (600, directories 700),
    even when the operator's shell would create world-readable files, and files
    an earlier checkout left open are closed although the run does not rewrite
    them;
  - a run whose export cannot be made owner-only exits non-zero naming each open
    path, so the final export is never certified on a filesystem that drops modes;
  - a second run over unchanged input changes no byte and no mode;
  - the member forwarding-alias map lands under its curated name with a manifest
    row, as every copied directory now carries;
  - the HTML pages and the compiled program in the legacy tree are not copied.

The extractor finds both repositories through symlink names at the checkout
root, so each test copies it into a temporary checkout layout holding a
synthetic legacy clone and an empty private repository. Nothing here needs the
real dump, the real private repository, a network connection or a database.

Run from repo root:
    python -m pytest legacy_data/tests/test_extract_legacy_estate.py -v
"""
from __future__ import annotations

import importlib.util
import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "legacy_data" / "scripts"
SCRIPT = "extract_legacy_estate.py"
HELPER = "extract_legacy_dump.py"

MEMBERS_DUMP = """SET NAMES utf8;
CREATE TABLE `members` (
  `MemberID` int(11) NOT NULL,
  `MemberEmail` varchar(80) default NULL,
  `MemberPassword` varchar(40) default NULL,
  PRIMARY KEY (`MemberID`)
);
INSERT INTO `members` VALUES (1,'one@example.org','pw-one'),(2,'two@example.org','pw-two');
"""

ALIAS_MAP = "alias-one\t\t\tone@example.org\nalias-two\t\t\ttwo@example.org\n"


def build_checkout(tmp_path: Path) -> Path:
    """A temporary checkout: the extractor and its helper under legacy_data/scripts,
    a legacy clone holding one member dump plus the copied-file sources (two
    HTML pages saved under SQL names and a compiled program among them), and an
    empty private repository. Returns the copied extractor."""
    root = tmp_path / "checkout"
    scripts = root / "legacy_data" / "scripts"
    scripts.mkdir(parents=True)
    for name in (SCRIPT, HELPER):
        shutil.copy2(SCRIPTS_DIR / name, scripts / name)

    legacy = root / "footbag_legacy_repo"
    (legacy / "members" / "backups").mkdir(parents=True)
    (legacy / "members" / "backups" / "latest.sql").write_text(MEMBERS_DUMP, encoding="utf-8")
    (legacy / "members" / "admin").mkdir(parents=True)
    (legacy / "members" / "admin" / "tmp.out").write_text(ALIAS_MAP, encoding="utf-8")
    (legacy / "rules").mkdir()
    (legacy / "rules" / "rulebook.txt").write_text("Rule 1. Keep the bag up.\n", encoding="utf-8")
    (legacy / "ifpa" / "data").mkdir(parents=True)
    (legacy / "ifpa" / "data" / "1.description").write_text("A candidate statement.\n", encoding="utf-8")
    (legacy / "clubs").mkdir()
    (legacy / "clubs" / "create.mysql").write_text("<html><body>saved page</body></html>\n", encoding="utf-8")
    (legacy / "events").mkdir()
    (legacy / "events" / "create.mysql.saved").write_text("<html>saved</html>\n", encoding="utf-8")
    (legacy / "moves" / "sqml").mkdir(parents=True)
    (legacy / "moves" / "sqml" / "parse").write_bytes(b"\x7fELF\x01\x01\x01\0\0\0\0")

    (root / "footbag_private_repo").mkdir()
    return scripts / SCRIPT


def export_of(script: Path) -> Path:
    return script.parents[2] / "footbag_private_repo" / "legacy-export"


def run_permissive(script: Path) -> subprocess.CompletedProcess:
    """Run the extractor through its real command line from a shell whose umask
    would make every new file readable by any account, as an operator's often is."""
    return subprocess.run(
        [sys.executable, str(script)],
        capture_output=True, text=True, cwd=str(script.parent),
        preexec_fn=lambda: os.umask(0o022), timeout=120,
    )


def snapshot(root: Path) -> dict[str, tuple[bytes, int]]:
    return {
        p.relative_to(root).as_posix(): (p.read_bytes(), stat.S_IMODE(p.stat().st_mode))
        for p in sorted(root.rglob("*")) if p.is_file()
    }


def open_paths(root: Path) -> list[str]:
    """Every path under root another account could read, as 'mode path'."""
    found = []
    for p in [root, *sorted(root.rglob("*"))]:
        mode = stat.S_IMODE(p.lstat().st_mode)
        if mode & 0o077:
            found.append(f"{mode:04o} {p.relative_to(root)}")
    return found


def test_every_export_path_is_owner_only_under_a_permissive_umask(tmp_path):
    # Without the run's own umask and chmod pass, the member files and the alias
    # map would land at 644, readable by every account on the machine.
    script = build_checkout(tmp_path)
    res = run_permissive(script)
    assert res.returncode == 0, res.stderr
    export = export_of(script)
    assert (export / "members" / "members.csv").is_file()
    assert open_paths(export) == []
    assert stat.S_IMODE(export.stat().st_mode) == 0o700
    assert stat.S_IMODE((export / "mail-aliases" / "mail_aliases.tsv").stat().st_mode) == 0o600


def test_a_run_that_aborts_partway_leaves_nothing_it_wrote_readable(tmp_path):
    # The closing chmod pass never runs when a later dump aborts the run, so
    # the member CSV already written is private only if it was created private.
    script = build_checkout(tmp_path)
    broken = script.parents[2] / "footbag_legacy_repo" / "registration" / "cron"
    broken.mkdir(parents=True)
    # A row with fewer values than columns aborts that dump, after the current
    # member table has already been written.
    (broken / "members.dump").write_text(
        "CREATE TABLE members (\n  MemberID int(11) NOT NULL,\n  MemberEmail varchar(80)\n);\n"
        "INSERT INTO members VALUES (1);\n", encoding="latin-1")
    res = run_permissive(script)
    assert res.returncode != 0
    assert "refusing to guess" in res.stderr
    export = export_of(script)
    assert (export / "members" / "members.csv").is_file()
    assert open_paths(export) == []


def test_a_rerun_closes_files_an_earlier_checkout_left_open(tmp_path):
    # A git checkout creates files at the shell's default mode, and the copy
    # skips a byte-identical file, so a re-run that only re-wrote what changed
    # would leave these open for good.
    script = build_checkout(tmp_path)
    assert run_permissive(script).returncode == 0
    export = export_of(script)
    reopened = [export / "mail-aliases" / "mail_aliases.tsv", export / "members" / "members.csv"]
    for p in reopened:
        p.chmod(0o644)
    (export / "members").chmod(0o755)
    res = run_permissive(script)
    assert res.returncode == 0, res.stderr
    assert open_paths(export) == []


def test_an_export_that_stays_open_is_refused_naming_each_path(tmp_path, monkeypatch, capsys):
    # A filesystem that accepts a chmod and keeps the old mode (a Windows drive
    # mounted without metadata does this) must not let the run report success:
    # the final export would be certified while still world-readable.
    script = build_checkout(tmp_path)
    spec = importlib.util.spec_from_file_location("estate_under_test", script)
    module = importlib.util.module_from_spec(spec)
    monkeypatch.syspath_prepend(str(script.parent))
    spec.loader.exec_module(module)
    monkeypatch.setattr(sys, "argv", [str(script)])
    monkeypatch.setattr(Path, "chmod", lambda self, mode: None)

    # The run's own umask call is neutralised too, so the files it writes land
    # at the shell's 644 and the chmod pass is the only thing that could close them.
    real_umask = os.umask
    previous = real_umask(0o022)
    try:
        monkeypatch.setattr(os, "umask", lambda mask: 0o022)
        result = module.main()
    finally:
        real_umask(previous)

    err = capsys.readouterr().err
    assert result == 1
    assert "REFUSED" in err
    assert "members/members.csv" in err
    assert "mail-aliases/mail_aliases.tsv" in err


def test_a_second_run_over_unchanged_input_changes_no_byte_and_no_mode(tmp_path):
    # The property the final re-run after the last delivery depends on: an
    # unchanged delivery leaves the private working tree exactly as it was.
    script = build_checkout(tmp_path)
    assert run_permissive(script).returncode == 0
    before = snapshot(export_of(script))
    res = run_permissive(script)
    assert res.returncode == 0, res.stderr
    assert snapshot(export_of(script)) == before


def test_the_alias_map_keeps_its_curated_name_and_its_manifest(tmp_path):
    # The raw scratch name tells a reader nothing, and a directory without its
    # manifest has nothing to verify its member addresses against.
    script = build_checkout(tmp_path)
    assert run_permissive(script).returncode == 0
    aliases = export_of(script) / "mail-aliases"
    assert sorted(p.name for p in aliases.iterdir()) == ["MANIFEST.tsv", "mail_aliases.tsv"]
    rows = (aliases / "MANIFEST.tsv").read_text(encoding="utf-8").splitlines()
    assert rows[0] == "file\tsha256\tbytes\trows\tdropped_columns"
    name, _sha, size, count, dropped = rows[1].split("\t")
    assert (name, size, count, dropped) == ("mail_aliases.tsv", str(len(ALIAS_MAP)), "2", "-")


def test_html_pages_and_the_compiled_program_are_not_copied(tmp_path):
    # Neither is data: the two "create.mysql" files are saved HTML pages and
    # "parse" is an executable from the old moves engine.
    script = build_checkout(tmp_path)
    assert run_permissive(script).returncode == 0
    held = sorted(p.name for p in (export_of(script) / "source-data-files").iterdir())
    assert held == ["MANIFEST.tsv", "rulebook.txt"]
    copied = [p.name for p in export_of(script).rglob("*")]
    for excluded in ("create.mysql", "create.mysql.saved", "parse"):
        assert excluded not in copied


def test_stored_credentials_still_never_reach_the_export(tmp_path):
    # The owner-only pass protects what is written; it is no reason to write a
    # password, which the per-row drop keeps out entirely.
    script = build_checkout(tmp_path)
    assert run_permissive(script).returncode == 0
    members = (export_of(script) / "members" / "members.csv").read_text(encoding="utf-8")
    assert "MemberPassword" not in members.splitlines()[0]
    assert "pw-one" not in members


@pytest.mark.parametrize("name", ["README.md", "MANIFEST.tsv"])
def test_a_source_file_named_like_the_exports_own_files_is_refused(tmp_path, name):
    # Copying it would overwrite the directory's README or manifest with legacy
    # content, and the manifest would then vouch for nothing.
    script = build_checkout(tmp_path)
    (script.parents[2] / "footbag_legacy_repo" / "ifpa" / "data" / name).write_text("x\n", encoding="utf-8")
    res = run_permissive(script)
    assert res.returncode != 0
    assert f"would overwrite the export's own {name}" in res.stderr
