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


def test_missing_dump_is_clean_noop(tmp_path: Path) -> None:
    seed = _write_seed(tmp_path / "clubs.csv", [_seed_row("a", name="Kept")])
    before = seed.read_bytes()
    r = _run(seed, tmp_path / "does-not-exist.sql")
    assert r.returncode == 0, r.stderr
    assert "skipped" in (r.stdout + r.stderr).lower()
    assert seed.read_bytes() == before, "missing dump must not touch the seed"


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
