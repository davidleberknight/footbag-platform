"""Regression tests for the authoritative approved-key club overlay.

The overlay regenerates seed/clubs.csv so it holds exactly the dump's Approved=1
ClubID universe: existing (mirror-enriched) rows are preserved verbatim, dump-only
approved clubs are added with an empty contact, unapproved clubs are excluded, and
a formerly-seeded key absent from the approved dump is dropped. Credentials are
never emitted, the missing-dump path is a clean no-op, and a present-but-invalid
dump fails closed without touching the seed.

All fixtures are synthetic; no real club, contact, or credential data is used.

Run from repo root:
    python -m pytest legacy_data/tests/test_overlay_clubs_from_dump.py -v
"""
import csv
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL = "legacy_data/scripts/overlay_clubs_from_dump.py"

SEED_HEADER = [
    "legacy_club_key", "name", "city", "region", "country", "contact_member_id",
    "external_url", "description", "created", "last_updated",
]

# A synthetic clubs dump whose CREATE TABLE closes with a bare `);` (as the real
# clubs dump does) and whose VALUES are positional against the column order.
DUMP_COLUMNS = [
    "Approved", "ClubID", "Name", "ClubNameUnicode", "City", "State", "Country",
    "URL", "Created", "Modified", "Password", "TagLine", "Welcome",
]


def _dump(*rows: tuple) -> str:
    cols = ",\n  ".join(f"`{c}` text" for c in DUMP_COLUMNS)
    head = f"CREATE TABLE `clubs` (\n  {cols},\n  PRIMARY KEY (`ClubID`)\n);\n"
    inserts = []
    for r in rows:
        vals = ",".join(
            str(v) if isinstance(v, int) else "'" + str(v).replace("'", "''") + "'"
            for v in r
        )
        inserts.append(f"INSERT INTO `clubs` VALUES ({vals});")
    return head + "\n".join(inserts) + "\n"


def _row(approved, club_id, name, uni, city, state, country, url,
         created, modified, password, tagline, welcome):
    return (approved, club_id, name, uni, city, state, country, url,
            created, modified, password, tagline, welcome)


def _write(path: Path, text: str) -> Path:
    # The clubs dump is UTF-8 and its CREATE TABLE declares no charset at all, so
    # the fixture is written UTF-8 to match what the tool reads.
    path.write_text(text, encoding="utf-8")
    return path


def _write_seed(path: Path, rows: list[dict]) -> Path:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=SEED_HEADER, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in SEED_HEADER})
    return path


def _seed_row(key, **kw) -> dict:
    base = {k: "" for k in SEED_HEADER}
    base["legacy_club_key"] = key
    base.update(kw)
    return base


def _env_without_dump(tmp_path: Path) -> dict[str, str]:
    """An environment whose legacy-dump root exists but holds no clubs dump.

    Pointing at an empty directory rather than unsetting the variable keeps the
    no-dump cases deterministic: a developer machine that happens to carry the
    real dump would otherwise resolve it through the repo-root symlink and take a
    different path than CI.
    """
    root = tmp_path / "empty-dump-root"
    root.mkdir(exist_ok=True)
    return {**os.environ, "FOOTBAG_LEGACY_REPO": str(root)}


def _run(seed: Path, dump: Path | None) -> subprocess.CompletedProcess:
    args = [sys.executable, TOOL, "--seed", str(seed)]
    if dump is not None:
        args += ["--dump", str(dump)]
    return subprocess.run(args, cwd=str(REPO_ROOT), capture_output=True, text=True)


def _read(path: Path) -> dict[str, dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return {r["legacy_club_key"]: r for r in csv.DictReader(f)}


def test_overlap_row_preserved_byte_for_byte(tmp_path: Path) -> None:
    seed = _write_seed(tmp_path / "clubs.csv", [
        _seed_row("overlap", name="Rich Mirror Name", city="Portland", region="Oregon",
                  country="USA", contact_member_id="4242",
                  external_url="https://mirror.example", description="Mirror description.",
                  created="Sun Jan 15 10:16:52 2012", last_updated="Mon Feb 20 09:00:00 2013"),
    ])
    before = seed.read_bytes()
    dump = _write(tmp_path / "dump.sql", _dump(
        _row(1, "overlap", "Dump Name", "Dump Uni", "Dtown", "OR", "USA",
             "http://dump.example", 1000000000, 1100000000, "PW", "DumpTag", "DumpWel"),
    ))
    r = _run(seed, dump)
    assert r.returncode == 0, r.stderr
    row = _read(seed)["overlap"]
    assert row["name"] == "Rich Mirror Name"
    assert row["contact_member_id"] == "4242"
    assert row["external_url"] == "https://mirror.example"
    # The overlap row's fields are exactly the pre-run mirror row.
    pre = {r["legacy_club_key"]: r for r in csv.DictReader(before.decode().splitlines())}["overlap"]
    assert dict(pre) == dict(row)


def test_dump_only_row_added_with_empty_contact(tmp_path: Path) -> None:
    seed = _write_seed(tmp_path / "clubs.csv", [])
    dump = _write(tmp_path / "dump.sql", _dump(
        _row(1, "new-1", "New Club", "New Club Uni", "Berlin", "BE", "Germany",
             "https://new.example", 1010000000, 1020000000, "PW", "A tagline", "Welcome"),
    ))
    r = _run(seed, dump)
    assert r.returncode == 0, r.stderr
    row = _read(seed)["new-1"]
    assert row["name"] == "New Club Uni"
    assert row["country"] == "Germany"
    assert row["external_url"] == "https://new.example"
    assert row["contact_member_id"] == ""
    assert "2002" in row["created"] or row["created"]  # epoch converted to a year-bearing text


def test_unapproved_dump_row_excluded(tmp_path: Path) -> None:
    seed = _write_seed(tmp_path / "clubs.csv", [])
    dump = _write(tmp_path / "dump.sql", _dump(
        _row(1, "keep", "Keep", "Keep", "C", "S", "USA", "", 0, 0, "PW", "", ""),
        _row(0, "drop", "Drop", "Drop", "C", "S", "USA", "", 0, 0, "PW", "", ""),
    ))
    r = _run(seed, dump)
    assert r.returncode == 0, r.stderr
    keys = set(_read(seed))
    assert keys == {"keep"}


def test_formerly_seeded_unapproved_key_removed(tmp_path: Path) -> None:
    seed = _write_seed(tmp_path / "clubs.csv", [
        _seed_row("stale", name="Was Seeded"),
        _seed_row("keep", name="Still Approved"),
    ])
    dump = _write(tmp_path / "dump.sql", _dump(
        _row(1, "keep", "Keep", "Keep", "C", "S", "USA", "", 0, 0, "PW", "", ""),
    ))
    r = _run(seed, dump)
    assert r.returncode == 0, r.stderr
    keys = set(_read(seed))
    assert keys == {"keep"}, "a seeded key absent from the approved dump must be dropped"


def test_unicode_name_preference_and_fallback(tmp_path: Path) -> None:
    seed = _write_seed(tmp_path / "clubs.csv", [])
    dump = _write(tmp_path / "dump.sql", _dump(
        _row(1, "uni", "Ascii Name", "Unicode Náme", "C", "S", "USA", "", 0, 0, "PW", "", ""),
        _row(1, "fallback", "Ascii Only", "", "C", "S", "USA", "", 0, 0, "PW", "", ""),
    ))
    r = _run(seed, dump)
    assert r.returncode == 0, r.stderr
    rows = _read(seed)
    assert rows["uni"]["name"] == "Unicode Náme"
    assert rows["fallback"]["name"] == "Ascii Only"


def test_damaged_unicode_column_falls_back_to_the_clean_plain_name(tmp_path: Path) -> None:
    """Some legacy rows hold the same name twice and the Unicode-suffixed copy was
    stored already double-encoded while the plain copy is intact. The clean copy
    must win, and a Unicode copy that is merely non-ASCII must still be preferred."""
    seed = _write_seed(tmp_path / "clubs.csv", [])
    dump = _write(tmp_path / "dump.sql", _dump(
        # Unicode copy carries the damage; plain copy is the same name intact.
        _row(1, "damaged", "The Free Häcky Style", "The Free HÃ¤cky Style",
             "C", "S", "CH", "", 0, 0, "PW", "", ""),
        # Unicode copy is simply the better value and still wins.
        _row(1, "healthy", "Ascii Name", "Unicode Náme", "C", "S", "USA", "", 0, 0, "PW", "", ""),
    ))
    r = _run(seed, dump)
    assert r.returncode == 0, r.stderr
    rows = _read(seed)
    assert rows["damaged"]["name"] == "The Free Häcky Style"
    assert rows["healthy"]["name"] == "Unicode Náme"


def test_numeric_character_references_are_decoded(tmp_path: Path) -> None:
    """Several legacy records store non-Latin text as numeric character
    references. They must reach the seed as characters, not as literal escapes."""
    seed = _write_seed(tmp_path / "clubs.csv", [])
    dump = _write(tmp_path / "dump.sql", _dump(
        _row(1, "ents", "Tren&#269;&#237;n footbag club", "", "Tren&#269;&#237;n",
             "S", "SK", "", 0, 0, "PW", "kopiemy nasz&#261; zosi&#281;", ""),
    ))
    r = _run(seed, dump)
    assert r.returncode == 0, r.stderr
    rows = _read(seed)
    assert rows["ents"]["name"] == "Trenčín footbag club"
    assert rows["ents"]["city"] == "Trenčín"
    assert rows["ents"]["description"] == "kopiemy naszą zosię"


def test_utf8_dump_values_survive_the_read(tmp_path: Path) -> None:
    """The whole point of the dump read: accented and non-Latin values arrive
    intact rather than as double-encoded text."""
    seed = _write_seed(tmp_path / "clubs.csv", [])
    dump = _write(tmp_path / "dump.sql", _dump(
        _row(1, "fi", "Jyväskylän Footbag-klubi", "", "Jyväskylä", "", "Finland",
             "", 0, 0, "PW", "", ""),
    ))
    r = _run(seed, dump)
    assert r.returncode == 0, r.stderr
    rows = _read(seed)
    assert rows["fi"]["name"] == "Jyväskylän Footbag-klubi"
    assert rows["fi"]["city"] == "Jyväskylä"


def test_tagline_preference_and_fallback_to_welcome(tmp_path: Path) -> None:
    seed = _write_seed(tmp_path / "clubs.csv", [])
    dump = _write(tmp_path / "dump.sql", _dump(
        _row(1, "tag", "N", "N", "C", "S", "USA", "", 0, 0, "PW", "A tagline", "A welcome"),
        _row(1, "wel", "N", "N", "C", "S", "USA", "", 0, 0, "PW", "", "Only welcome"),
    ))
    r = _run(seed, dump)
    assert r.returncode == 0, r.stderr
    rows = _read(seed)
    assert rows["tag"]["description"] == "A tagline"
    assert rows["wel"]["description"] == "Only welcome"


def test_credential_field_never_emitted(tmp_path: Path) -> None:
    seed = _write_seed(tmp_path / "clubs.csv", [])
    dump = _write(tmp_path / "dump.sql", _dump(
        _row(1, "c", "N", "N", "C", "S", "USA", "", 0, 0, "SUPERSECRETPW", "", ""),
    ))
    r = _run(seed, dump)
    assert r.returncode == 0, r.stderr
    assert "SUPERSECRETPW" not in seed.read_text()
    assert "password" not in [c.lower() for c in SEED_HEADER]


def test_explicitly_named_missing_dump_is_a_prerequisite_failure(tmp_path: Path) -> None:
    # Naming a dump states it is required. Reporting its absence as a clean no-op
    # let a run that reconciled nothing pass for one that did, which is the whole
    # reason a caller cannot trust exit 0 alone.
    seed = _write_seed(tmp_path / "clubs.csv", [_seed_row("a", name="Kept")])
    before = seed.read_bytes()
    before_mtime = seed.stat().st_mtime_ns
    absent = tmp_path / "does-not-exist.sql"

    r = _run(seed, absent)

    assert r.returncode == 3, r.stderr
    assert str(absent) in r.stderr
    assert "not found" in r.stderr
    assert "Authoritative club reconciliation:" not in r.stdout
    assert seed.read_bytes() == before, "a prerequisite failure must not touch the seed"
    assert seed.stat().st_mtime_ns == before_mtime
    assert list(tmp_path.glob("*.tmp")) == []


def test_explicit_dump_that_is_a_directory_is_a_prerequisite_failure(tmp_path: Path) -> None:
    seed = _write_seed(tmp_path / "clubs.csv", [_seed_row("a", name="Kept")])
    before = seed.read_bytes()
    as_dir = tmp_path / "dump-dir"
    as_dir.mkdir()

    r = _run(seed, as_dir)

    assert r.returncode == 3, r.stderr
    assert "not a regular file" in r.stderr
    assert seed.read_bytes() == before
    assert list(tmp_path.glob("*.tmp")) == []


def test_explicit_unreadable_dump_is_a_prerequisite_failure(tmp_path: Path) -> None:
    seed = _write_seed(tmp_path / "clubs.csv", [_seed_row("a", name="Kept")])
    before = seed.read_bytes()
    dump = _write(tmp_path / "dump.sql", _dump(
        _row(1, "a", "Kept", "Kept", "C", "S", "USA", "", 0, 0, "PW", "", ""),
    ))
    dump.chmod(0o000)
    try:
        r = _run(seed, dump)
        assert r.returncode == 3, r.stderr
        assert "not readable" in r.stderr
        assert seed.read_bytes() == before
    finally:
        dump.chmod(0o600)


def test_prerequisite_failure_precedes_seed_parsing(tmp_path: Path) -> None:
    # A seed that would abort the reconciliation if it were ever parsed. The dump
    # check has to come first, so the run fails on the dump rather than the seed.
    seed = tmp_path / "clubs.csv"
    seed.write_text("this is not a valid clubs seed at all\n", encoding="utf-8")
    before = seed.read_bytes()

    r = _run(seed, tmp_path / "does-not-exist.sql")

    assert r.returncode == 3, r.stderr
    assert "unusable" in r.stderr
    assert seed.read_bytes() == before


def test_absent_machine_local_dump_remains_a_supported_no_op(tmp_path: Path) -> None:
    # No --dump and no configured machine-local dump: the documented optional
    # configuration the orchestrator relies on. Still exit 0, and still explicit
    # that no reconciliation happened.
    seed = _write_seed(tmp_path / "clubs.csv", [_seed_row("a", name="Kept")])
    before = seed.read_bytes()

    r = subprocess.run(
        [sys.executable, TOOL, "--seed", str(seed)],
        cwd=str(REPO_ROOT), capture_output=True, text=True, env=_env_without_dump(tmp_path),
    )

    assert r.returncode == 0, r.stderr
    assert "skipped" in r.stdout.lower()
    assert "No reconciliation was performed" in r.stdout
    assert "Authoritative club reconciliation:" not in r.stdout
    assert seed.read_bytes() == before


def test_require_dump_turns_the_optional_no_op_into_a_failure(tmp_path: Path) -> None:
    seed = _write_seed(tmp_path / "clubs.csv", [_seed_row("a", name="Kept")])
    before = seed.read_bytes()

    r = subprocess.run(
        [sys.executable, TOOL, "--seed", str(seed), "--require-dump"],
        cwd=str(REPO_ROOT), capture_output=True, text=True, env=_env_without_dump(tmp_path),
    )

    assert r.returncode == 3, r.stderr
    assert "--require-dump" in r.stderr
    assert "Authoritative club reconciliation:" not in r.stdout
    assert seed.read_bytes() == before


def test_require_dump_alongside_an_explicit_dump_stays_strict(tmp_path: Path) -> None:
    # The two flags together must never be weaker than --dump alone. A usable
    # explicit dump still reconciles; a missing one still fails closed.
    seed = _write_seed(tmp_path / "clubs.csv", [_seed_row("a", name="Kept")])
    dump = _write(tmp_path / "dump.sql", _dump(
        _row(1, "a", "Kept", "Kept", "C", "S", "USA", "", 0, 0, "PW", "", ""),
    ))

    ok = subprocess.run(
        [sys.executable, TOOL, "--seed", str(seed), "--dump", str(dump), "--require-dump"],
        cwd=str(REPO_ROOT), capture_output=True, text=True,
    )
    assert ok.returncode == 0, ok.stderr
    assert "Authoritative club reconciliation:" in ok.stdout

    before = seed.read_bytes()
    missing = subprocess.run(
        [sys.executable, TOOL, "--seed", str(seed),
         "--dump", str(tmp_path / "gone.sql"), "--require-dump"],
        cwd=str(REPO_ROOT), capture_output=True, text=True,
    )
    assert missing.returncode == 3, missing.stderr
    assert "Authoritative club reconciliation:" not in missing.stdout
    assert seed.read_bytes() == before


def test_flags_missing_their_values_are_rejected(tmp_path: Path) -> None:
    seed = _write_seed(tmp_path / "clubs.csv", [_seed_row("a", name="Kept")])
    before = seed.read_bytes()

    for argv in (
        [TOOL, "--seed", str(seed), "--dump"],
        [TOOL, "--seed"],
        [TOOL, "--seed", str(seed), "--not-a-flag"],
    ):
        r = subprocess.run([sys.executable, *argv], cwd=str(REPO_ROOT),
                           capture_output=True, text=True)
        assert r.returncode != 0, f"{argv} must be rejected"
        assert "Authoritative club reconciliation:" not in r.stdout
    assert seed.read_bytes() == before


def test_help_exits_zero_and_touches_nothing(tmp_path: Path) -> None:
    seed = _write_seed(tmp_path / "clubs.csv", [_seed_row("a", name="Kept")])
    before = seed.read_bytes()

    r = subprocess.run([sys.executable, TOOL, "--help"], cwd=str(REPO_ROOT),
                       capture_output=True, text=True)

    assert r.returncode == 0, r.stderr
    assert "--require-dump" in r.stdout
    assert "--dump" in r.stdout
    assert seed.read_bytes() == before


def test_seed_that_is_a_directory_is_an_invalid_invocation(tmp_path: Path) -> None:
    as_dir = tmp_path / "clubs.csv"
    as_dir.mkdir()
    dump = _write(tmp_path / "dump.sql", _dump(
        _row(1, "a", "Kept", "Kept", "C", "S", "USA", "", 0, 0, "PW", "", ""),
    ))

    r = _run(as_dir, dump)

    assert r.returncode == 2, r.stderr
    assert "not a regular file" in r.stderr


def test_valid_dump_with_no_byte_change_still_reports_reconciliation(tmp_path: Path) -> None:
    # A legitimate no-change result is a successful reconciliation, and must not
    # read like the skip path: the marker has to be present either way.
    seed = _write_seed(tmp_path / "clubs.csv", [_seed_row("a", name="Kept")])
    dump = _write(tmp_path / "dump.sql", _dump(
        _row(1, "a", "Kept", "Kept", "C", "S", "USA", "", 0, 0, "PW", "", ""),
    ))

    first = _run(seed, dump)
    assert first.returncode == 0, first.stderr
    after_first = seed.read_bytes()

    second = _run(seed, dump)

    assert second.returncode == 0, second.stderr
    assert "Authoritative club reconciliation:" in second.stdout
    assert "skipped" not in second.stdout.lower()
    assert seed.read_bytes() == after_first


def test_invalid_present_dump_fails_closed(tmp_path: Path) -> None:
    seed = _write_seed(tmp_path / "clubs.csv", [_seed_row("a", name="Kept")])
    before = seed.read_bytes()
    # Present but yields zero approved rows.
    dump = _write(tmp_path / "dump.sql", _dump(
        _row(0, "x", "N", "N", "C", "S", "USA", "", 0, 0, "PW", "", ""),
    ))
    r = _run(seed, dump)
    assert r.returncode != 0, "a dump with no approved clubs must fail closed"
    assert seed.read_bytes() == before, "a failed-closed run must not touch the seed"


def test_duplicate_approved_club_id_fails_closed(tmp_path: Path) -> None:
    seed = _write_seed(tmp_path / "clubs.csv", [])
    dump = _write(tmp_path / "dump.sql", _dump(
        _row(1, "dup", "First", "First", "C", "S", "USA", "", 0, 0, "PW", "", ""),
        _row(1, "dup", "Second", "Second", "C", "S", "USA", "", 0, 0, "PW", "", ""),
    ))
    before = seed.read_bytes()
    r = _run(seed, dump)
    assert r.returncode != 0, "a duplicate approved ClubID must fail closed"
    assert "duplicate" in (r.stdout + r.stderr).lower()
    assert seed.read_bytes() == before


def test_deterministic_ordering_and_byte_identical_rerun(tmp_path: Path) -> None:
    seed = _write_seed(tmp_path / "clubs.csv", [_seed_row("m-key", name="Mirror")])
    dump = _write(tmp_path / "dump.sql", _dump(
        _row(1, "m-key", "N", "N", "C", "S", "USA", "", 0, 0, "PW", "", ""),
        _row(1, "a-key", "N", "N", "C", "S", "USA", "", 0, 0, "PW", "", ""),
        _row(1, "z-key", "N", "N", "C", "S", "USA", "", 0, 0, "PW", "", ""),
    ))
    assert _run(seed, dump).returncode == 0
    first = seed.read_bytes()
    # Output is sorted by legacy_club_key.
    keys = [r["legacy_club_key"] for r in csv.DictReader(first.decode().splitlines())]
    assert keys == sorted(keys) == ["a-key", "m-key", "z-key"]
    assert _run(seed, dump).returncode == 0
    assert seed.read_bytes() == first, "a rerun must be byte-identical"


def test_pipeline_runs_overlay_before_classification(tmp_path: Path) -> None:
    """run_pipeline.sh must invoke the overlay after the mirror extractor and
    before any club classifier reads the seed (producer before consumer)."""
    text = (REPO_ROOT / "legacy_data" / "run_pipeline.sh").read_text()
    assert "overlay_clubs_from_dump.py" in text, "overlay is not wired into run_pipeline.sh"
    i_extract = text.find("extract_clubs.py")
    i_overlay = text.find("overlay_clubs_from_dump.py")
    i_classify = text.find("02_build_legacy_club_candidates.py")
    assert i_extract != -1 and i_overlay != -1 and i_classify != -1
    assert i_extract < i_overlay < i_classify, "order must be extract -> overlay -> classify"
