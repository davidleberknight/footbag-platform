"""
test_refresh_legacy_repo_data.py
================================

Pins the legacy refresh's delivery checks: a delivery that is not a plain,
honest extension of the original copy is refused with nothing written, and an
accepted delivery is written as owner-only CSVs with no credential column and
byte-identical output on a re-run.

Each test builds a throwaway checkout layout: the refresh and its helpers under
legacy_data/scripts, an original clone and a live clone as small git
repositories holding synthetic dumps, and an empty private repository. Nothing
here reads the real dump, the real private repository or the network.

Run from repo root:
    python -m pytest legacy_data/tests/test_refresh_legacy_repo_data.py -v
"""
from __future__ import annotations

import gzip
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "legacy_data" / "scripts"
COPIED = ("refresh_legacy_repo_data.py", "refresh_report.py", "strict_dump_parser.py",
          "refresh_support.py")
MEMBERS = "members/backups/latest.sql"
GALLERY = "gallery/backups/latest.sql"


def members_dump(rows: str = "(1,'Ann','pw-secret-a'),(2,'Bo','pw-secret-b')",
                 extra_column: str = "", drop_name: bool = False) -> str:
    name_col = "" if drop_name else "  `MemberName` varchar(80) DEFAULT NULL,\n"
    return ("-- MySQL dump 10.16\n/*!40101 SET NAMES utf8 */;\n"
            "CREATE TABLE `members` (\n  `MemberID` int(11) NOT NULL,\n" + name_col +
            extra_column + "  `MemberPassword` varchar(40) DEFAULT NULL,\n"
            "  PRIMARY KEY (`MemberID`)\n) ENGINE=MyISAM;\n"
            "LOCK TABLES `members` WRITE;\n" +
            (f"INSERT INTO `members` VALUES {rows};\n" if rows else "") +
            "UNLOCK TABLES;\n-- Dump completed on 2026-05-29 15:46:52\n")


def gallery_dump(directory: str = "worlds98", image_file: str = "/media/554/a.jpg",
                 thumbnail: str = "/media/.thumb/a.jpg", alt_file: str = "b.jpg") -> str:
    return ("-- MySQL dump 10.16\n/*!40101 SET NAMES utf8 */;\n"
            "CREATE TABLE `sets` (\n  `RealSetID` int(11) NOT NULL,\n"
            "  `Directory` varchar(80) NOT NULL DEFAULT ''\n) ENGINE=MyISAM;\n"
            f"INSERT INTO `sets` VALUES (1,'/photos/ffa'),(2,'{directory}');\n"
            "CREATE TABLE `images` (\n  `RealImageID` int(11) NOT NULL,\n"
            "  `ImageLocalFile` text,\n  `ImageLocalThumbnail` text\n) ENGINE=MyISAM;\n"
            f"INSERT INTO `images` VALUES (1,'{image_file}','{thumbnail}');\n"
            "CREATE TABLE `alt_images` (\n  `AltImageID` int(11) NOT NULL,\n"
            "  `AltImageLocalFile` text\n) ENGINE=MyISAM;\n"
            f"INSERT INTO `alt_images` VALUES (1,'{alt_file}');\n"
            "-- Dump completed on 2026-05-28 20:30:45\n")


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(repo), "-c", "user.name=test",
                    "-c", "user.email=test@example.org", "-c", "commit.gpgsign=false",
                    *args], check=True, capture_output=True, timeout=60)


def commit_all(repo: Path, message: str) -> None:
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "--allow-empty", "-m", message)


def write(repo: Path, rel: str, text: str) -> None:
    path = repo / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


class Checkout:
    """A checkout whose original copy is taken from the live clone's first
    commit, as the maintainer's copy was, after which the live clone moves."""

    def __init__(self, tmp_path: Path):
        self.root = tmp_path / "checkout"
        scripts = self.root / "legacy_data" / "scripts"
        scripts.mkdir(parents=True)
        for name in COPIED:
            shutil.copy2(SCRIPTS_DIR / name, scripts / name)
        self.live = tmp_path / "GOLDBERG" / "footbag.org"
        self.live.mkdir(parents=True)
        git(self.live, "init", "-q")
        write(self.live, MEMBERS, members_dump())
        write(self.live, GALLERY, gallery_dump())
        commit_all(self.live, "first delivery")
        self.original = tmp_path / "GOLDBERG_ORIGINAL_DUMP" / "footbag.org"
        shutil.copytree(self.live, self.original, symlinks=True)
        (self.root / "footbag_legacy_repo").symlink_to(self.live)
        (self.root / "footbag_legacy_repo_original_data").symlink_to(self.original)
        (self.root / "footbag_private_repo").mkdir()
        self.out = tmp_path / "export"

    def deliver(self, rel: str, text: str) -> None:
        write(self.live, rel, text)
        commit_all(self.live, "next delivery")

    def run(self, *extra: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, "-I", str(self.root / "legacy_data/scripts/refresh_legacy_repo_data.py"),
             "--out", str(self.out), *extra],
            capture_output=True, text=True, timeout=120)


@pytest.fixture
def checkout(tmp_path):
    return Checkout(tmp_path)


def assert_refused(result: subprocess.CompletedProcess, out: Path, reason: str) -> None:
    assert result.returncode == 1, result.stdout + result.stderr
    assert reason in result.stderr
    assert "Nothing was written." in result.stderr
    # Every check runs before the first write, so a refused delivery leaves no
    # partial export for a later step to mistake for a vetted one.
    assert not out.exists()


def test_an_honest_refresh_writes_owner_only_csvs_without_credentials(checkout):
    checkout.deliver(MEMBERS, members_dump("(1,'Ann','pw-secret-a'),(2,'Bo','pw-secret-b'),(3,'Cy','pw-c')"))
    first = checkout.run()
    assert first.returncode == 0, first.stderr
    csv_path = checkout.out / "members" / "members.csv"
    text = csv_path.read_text(encoding="utf-8")
    assert text == "MemberID,MemberName\n1,Ann\n2,Bo\n3,Cy\n"
    assert "pw-secret" not in "".join(p.read_text(errors="ignore")
                                      for p in checkout.out.rglob("*") if p.is_file())
    assert oct(csv_path.stat().st_mode & 0o777) == "0o600"
    manifest = (checkout.out / "REFRESH_MANIFEST.tsv").read_text()
    assert manifest.splitlines()[0].startswith("original_head\t")
    assert f"{MEMBERS}\t" in manifest and "mariadb\t2026-05-29 15:46:52" in manifest
    before = {p: p.read_bytes() for p in checkout.out.rglob("*") if p.is_file()}
    assert checkout.run().returncode == 0
    after = {p: p.read_bytes() for p in checkout.out.rglob("*") if p.is_file()}
    assert after == before


def test_an_export_file_left_readable_by_a_checkout_is_closed(checkout):
    # Git does not record file modes, so a fresh checkout of the private
    # repository leaves member data world-readable; rewriting a file in place
    # keeps that mode, and only the owner-only pass closes it.
    stale = checkout.out / "members" / "members.csv"
    stale.parent.mkdir(parents=True)
    stale.write_text("stale\n")
    stale.chmod(0o644)
    assert checkout.run().returncode == 0
    assert oct(stale.stat().st_mode & 0o777) == "0o600"


def test_rewritten_history_is_refused(checkout):
    shutil.rmtree(checkout.live / ".git")
    git(checkout.live, "init", "-q")
    commit_all(checkout.live, "replayed history")
    assert_refused(checkout.run(), checkout.out, "the delivery rewrote history")


def test_a_working_tree_that_differs_from_its_commit_is_refused(checkout):
    write(checkout.live, MEMBERS, members_dump("(9,'Uncommitted','x')"))
    assert_refused(checkout.run(), checkout.out, "the working tree differs from its commit")


def test_a_new_link_outside_the_clone_is_refused_and_an_original_one_is_not(checkout, tmp_path):
    os.symlink("/home/someone/parse", checkout.original / "old-link")
    os.symlink("/home/someone/parse", checkout.live / "old-link")
    commit_all(checkout.live, "first delivery carried a dangling link")
    git(checkout.original, "add", "-A")
    git(checkout.original, "commit", "-q", "-m", "first delivery carried a dangling link")
    shutil.rmtree(checkout.original)
    shutil.copytree(checkout.live, checkout.original, symlinks=True)
    assert checkout.run().returncode == 0
    shutil.rmtree(checkout.out)
    os.symlink(str(tmp_path), checkout.live / "new-link")
    commit_all(checkout.live, "delivery adds a link out of the tree")
    assert_refused(checkout.run(), checkout.out, "new-link points outside the clone")


def test_added_git_attributes_are_refused(checkout):
    checkout.deliver(".gitattributes", "*.sql filter=lfs\n")
    assert_refused(checkout.run(), checkout.out, "adds .gitattributes")


def assert_reported(result: subprocess.CompletedProcess, line: str) -> None:
    assert result.returncode == 0, result.stdout + result.stderr
    assert f"REPORT: {line}" in result.stdout


def test_a_dump_the_original_carried_that_is_now_missing_is_reported_and_its_csvs_removed(checkout):
    assert checkout.run().returncode == 0
    assert (checkout.out / "gallery" / "images.csv").exists()
    (checkout.live / GALLERY).unlink()
    commit_all(checkout.live, "gallery dump dropped")
    assert_reported(checkout.run(), f"{GALLERY}: the dump the original carried is missing")
    # Written as delivered: nothing left behind looks as current as the rest.
    assert not list((checkout.out / "gallery").glob("*.csv"))


def test_a_table_that_emptied_is_reported_and_its_csv_removed(checkout):
    assert checkout.run().returncode == 0
    checkout.deliver(MEMBERS, members_dump(rows=""))
    assert_reported(checkout.run(), f"{MEMBERS}: table members had 2 rows and now has none")
    assert not (checkout.out / "members" / "members.csv").exists()


def test_a_table_that_disappeared_is_reported(checkout):
    checkout.deliver(GALLERY, gallery_dump().split("CREATE TABLE `alt_images`")[0] +
                     "-- Dump completed on 2026-05-28 20:30:45\n")
    assert_reported(checkout.run(), f"{GALLERY}: table alt_images disappeared")


def test_a_lost_column_is_reported_and_the_rest_written(checkout):
    checkout.deliver(MEMBERS, members_dump("(1,'pw-a'),(2,'pw-b')", drop_name=True))
    assert_reported(checkout.run(), f"{MEMBERS}: table members lost column(s) MemberName")
    assert (checkout.out / "members" / "members.csv").read_text() == "MemberID\n1\n2\n"


def test_a_new_column_is_held_until_a_maintainer_accepts_it(checkout):
    # A renamed password column arrives as a new column the credential filter
    # may not recognise; it must not reach a file unexamined.
    checkout.deliver(MEMBERS, members_dump("(1,'Ann','v-a','pw-secret-a')",
                                           extra_column="  `Notes` varchar(40) DEFAULT NULL,\n"))
    assert_refused(checkout.run(), checkout.out, "--accept-new members.members.Notes")
    assert checkout.run("--accept-new", "members.members.Notes").returncode == 0
    assert "v-a" in (checkout.out / "members" / "members.csv").read_text()


def with_second_table(name: str, rows: str = "(1,'Ann','pw-a')") -> str:
    """The members dump with a second table of the same shape before its footer."""
    first, footer = members_dump().rsplit("-- Dump completed", 1)
    second = members_dump(rows).split("/*!40101 SET NAMES utf8 */;\n", 1)[1]
    second = second.rsplit("-- Dump completed", 1)[0].replace("`members`", f"`{name}`")
    return first + second + "-- Dump completed" + footer


def test_a_new_table_is_held_until_a_maintainer_accepts_it(checkout):
    checkout.deliver(MEMBERS, with_second_table("member_keys"))
    assert_refused(checkout.run(), checkout.out, "--accept-new members.member_keys")
    assert checkout.run("--accept-new", "members.member_keys").returncode == 0


def test_a_new_module_is_held_until_a_maintainer_accepts_it(checkout):
    checkout.deliver("news/backups/latest.sql", members_dump().replace("`members`", "`news`"))
    assert_refused(checkout.run(), checkout.out, "--accept-new news")
    assert checkout.run("--accept-new", "news").returncode == 0


def test_an_acceptance_that_names_nothing_new_is_refused(checkout):
    # A typo or a stale flag would otherwise wave through whatever later matched it.
    assert_refused(checkout.run("--accept-new", "members.members.Pwd"), checkout.out,
                   "--accept-new names material this delivery does not add: members.members.Pwd")


@pytest.mark.parametrize("column", ["UserPIN", "Pwd", "LoginPass", "OtpSeed", "AuthKeyHex",
                                    "PasswordDigest", "Md5Sum", "CryptValue", "ActionKey"])
def test_a_credential_column_is_withheld_from_the_csv(checkout, column):
    checkout.deliver(MEMBERS, members_dump("(1,'Ann','cred-value','pw-a')",
                                           extra_column=f"  `{column}` varchar(40) DEFAULT NULL,\n"))
    assert checkout.run("--accept-new", f"members.members.{column}").returncode == 0
    text = (checkout.out / "members" / "members.csv").read_text()
    assert column not in text and "cred-value" not in text


def test_an_ordinary_column_containing_a_short_credential_word_is_kept(checkout):
    # Short words are matched whole, so a pin inside Shipping is not a PIN.
    checkout.deliver(MEMBERS, members_dump("(1,'Ann','to-home','pw-a')",
                                           extra_column="  `Shipping` varchar(40) DEFAULT NULL,\n"))
    assert checkout.run("--accept-new", "members.members.Shipping").returncode == 0
    assert "to-home" in (checkout.out / "members" / "members.csv").read_text()


def test_an_added_row_carrying_insert_text_is_refused_and_an_original_one_is_not(checkout):
    smuggled = "(3,'x\\nINSERT INTO members VALUES (99)','pw')"
    write(checkout.original, MEMBERS, members_dump(f"(1,'Ann','pw-a'),{smuggled}"))
    git(checkout.original, "commit", "-q", "-am", "original already quoted SQL")
    shutil.rmtree(checkout.live)
    shutil.copytree(checkout.original, checkout.live, symlinks=True)
    assert checkout.run().returncode == 0
    shutil.rmtree(checkout.out)
    checkout.deliver(MEMBERS, members_dump(
        f"(1,'Ann','pw-a'),{smuggled},(4,'y\\nINSERT INTO members VALUES (100)','pw')"))
    assert_refused(checkout.run(), checkout.out, "row 3 was added or changed and carries insert statement text")


@pytest.mark.parametrize("field, value", [
    ("Directory", "../../.ssh"),
    ("Directory", "photos/%2e%2e/x"),
    ("Directory", "photos\\\\x"),
    ("ImageLocalFile", "/media/%2E%2E%2f%2e%2e%2fetc"),
    ("ImageLocalThumbnail", "/media/.thumb/..%5c..%5cx"),
    ("AltImageLocalFile", "a/../../b"),
])
def test_a_gallery_path_that_could_leave_the_site_tree_is_refused(checkout, field, value):
    argument = {"Directory": "directory", "ImageLocalFile": "image_file",
                "ImageLocalThumbnail": "thumbnail", "AltImageLocalFile": "alt_file"}[field]
    checkout.deliver(GALLERY, gallery_dump(**{argument: value}))
    assert_refused(checkout.run(), checkout.out, f"field {field} leaves the gallery directory")


def test_a_row_carrying_insert_text_that_is_edited_in_place_is_refused(checkout):
    # Same position, different content: a planted payload replacing the
    # original quoted SQL must not pass as the row the original carried.
    write(checkout.original, MEMBERS, members_dump("(1,'x\\nINSERT INTO a VALUES (1)','pw')"))
    git(checkout.original, "commit", "-q", "-am", "original already quoted SQL")
    shutil.rmtree(checkout.live)
    shutil.copytree(checkout.original, checkout.live, symlinks=True)
    checkout.deliver(MEMBERS, members_dump("(1,'x\\nINSERT INTO a VALUES (2)','pw')"))
    assert_refused(checkout.run(), checkout.out, "row 1 was added or changed")


def test_an_original_link_retargeted_outside_the_clone_is_refused(checkout, tmp_path):
    os.symlink("members", checkout.live / "inner-link")
    commit_all(checkout.live, "first delivery carried an inner link")
    shutil.rmtree(checkout.original)
    shutil.copytree(checkout.live, checkout.original, symlinks=True)
    (checkout.live / "inner-link").unlink()
    os.symlink(str(tmp_path), checkout.live / "inner-link")
    commit_all(checkout.live, "link retargeted")
    assert_refused(checkout.run(), checkout.out, "inner-link points outside the clone")


def test_a_dirty_original_copy_is_refused(checkout):
    write(checkout.original, MEMBERS, members_dump("(9,'Edited','x')"))
    assert_refused(checkout.run(), checkout.out,
                   "footbag_legacy_repo_original_data: the working tree differs from its commit")


def test_added_submodule_machinery_is_refused(checkout):
    checkout.deliver(".gitmodules", '[submodule "x"]\n\tpath = x\n\turl = ../x\n')
    assert_refused(checkout.run(), checkout.out, "adds .gitmodules")


def test_a_submodule_entry_is_refused(checkout):
    # An embedded repository at its own commit: tracked as a gitlink with a
    # clean working tree, so only the submodule check can refuse it.
    vendored = checkout.live / "vendored"
    vendored.mkdir()
    git(vendored, "init", "-q")
    write(vendored, "x.txt", "x\n")
    commit_all(vendored, "vendored code")
    commit_all(checkout.live, "submodule")
    assert_refused(checkout.run(), checkout.out, "carries a submodule at vendored")


def test_a_large_file_storage_pointer_is_refused(checkout):
    checkout.deliver(MEMBERS, "version https://git-lfs.github.com/spec/v1\noid sha256:ab\nsize 9\n")
    assert_refused(checkout.run(), checkout.out, "is a large-file-storage pointer")


def test_a_compressed_dump_is_read_through_its_compression(checkout):
    write(checkout.live, "groups/backups/committees.sql.gz", "")
    (checkout.live / "groups/backups/committees.sql.gz").write_bytes(
        gzip.compress(members_dump().replace("`members`", "`ifpa_committees`").encode()))
    commit_all(checkout.live, "groups module delivered")
    assert checkout.run("--accept-new", "groups").returncode == 0
    assert (checkout.out / "groups" / "ifpa_committees.csv").read_text().startswith("MemberID,")


def test_a_corrupt_compressed_dump_is_refused(checkout):
    write(checkout.live, "groups/backups/committees.sql.gz", "")
    (checkout.live / "groups/backups/committees.sql.gz").write_bytes(
        gzip.compress(members_dump().encode())[:-12])
    commit_all(checkout.live, "truncated compressed dump")
    assert_refused(checkout.run("--accept-new", "groups"), checkout.out,
                   "groups/backups/committees.sql.gz: the compression is corrupt")


def test_two_dumps_producing_one_table_into_one_directory_are_refused(checkout):
    for rel in ("groups/backups/committees.sql.gz", "groups/backups/group-files.sql.gz"):
        write(checkout.live, rel, "")
        (checkout.live / rel).write_bytes(gzip.compress(members_dump().encode()))
    commit_all(checkout.live, "both groups dumps carry a members table")
    assert_refused(checkout.run("--accept-new", "groups"), checkout.out,
                   "both produce table members in groups")


def test_a_changed_git_attributes_file_is_refused(checkout):
    write(checkout.live, ".gitattributes", "*.txt text\n")
    commit_all(checkout.live, "attributes")
    shutil.rmtree(checkout.original)
    shutil.copytree(checkout.live, checkout.original, symlinks=True)
    checkout.deliver(".gitattributes", "*.sql filter=lfs\n")
    assert_refused(checkout.run(), checkout.out, "changes .gitattributes")


def test_an_added_large_file_storage_config_is_refused(checkout):
    checkout.deliver("members/.lfsconfig", "[lfs]\n\turl = https://example.org\n")
    assert_refused(checkout.run(), checkout.out, "adds members/.lfsconfig")


def test_an_untracked_file_in_copied_material_is_not_copied(checkout):
    # Everything is read from the delivered commit, so a file sitting in the
    # clone's working tree but never delivered cannot reach the export.
    write(checkout.live, "ifpa/data/1.description", "A statement.\n")
    commit_all(checkout.live, "governance prose delivered")
    write(checkout.live, "ifpa/data/planted.description", "not delivered\n")
    assert checkout.run().returncode == 0
    assert not (checkout.out / "governance-prose" / "planted.description").exists()
    assert (checkout.out / "governance-prose" / "1.description").exists()


def test_reordered_rows_that_carry_original_insert_text_pass(checkout):
    quoted = "(3,'x\\nINSERT INTO members VALUES (99)','pw')"
    write(checkout.original, MEMBERS, members_dump(f"(1,'Ann','pw-a'),{quoted}"))
    git(checkout.original, "commit", "-q", "-am", "original already quoted SQL")
    shutil.rmtree(checkout.live)
    shutil.copytree(checkout.original, checkout.live, symlinks=True)
    checkout.deliver(MEMBERS, members_dump(f"{quoted},(1,'Ann','pw-a')"))
    assert checkout.run().returncode == 0


def test_a_second_copy_of_an_original_insert_text_row_is_refused(checkout):
    # A keyless table can hold the same row twice; the original's one quoted
    # row admits one copy, not every copy a delivery adds.
    quoted = "x\\nINSERT INTO a VALUES (1)"
    original = gallery_dump(alt_file=quoted)
    write(checkout.original, GALLERY, original)
    git(checkout.original, "commit", "-q", "-am", "original already quoted SQL")
    shutil.rmtree(checkout.live)
    shutil.copytree(checkout.original, checkout.live, symlinks=True)
    row = f"(1,'{quoted}')"
    checkout.deliver(GALLERY, original.replace(f"VALUES {row};", f"VALUES {row},{row};"))
    assert_refused(checkout.run(), checkout.out, "table alt_images row 2 was added or changed")


def test_insert_text_in_a_new_table_is_refused(checkout):
    checkout.deliver(MEMBERS, with_second_table("member_notes",
                                                "(1,'x\\nINSERT INTO a VALUES (1)','pw')"))
    assert_refused(checkout.run("--accept-new", "members.member_notes"), checkout.out,
                   "table member_notes row 1 was added or changed")


@pytest.mark.parametrize("value", ["..#x", "/..?x", "photos/%252e%252e/x"])
def test_a_gallery_path_hiding_a_parent_step_is_refused(checkout, value):
    checkout.deliver(GALLERY, gallery_dump(directory=value))
    assert_refused(checkout.run(), checkout.out, "field Directory leaves the gallery directory")


def test_an_out_directory_inside_the_legacy_clone_is_refused(checkout):
    result = subprocess.run(
        [sys.executable, "-I", str(checkout.root / "legacy_data/scripts/refresh_legacy_repo_data.py"),
         "--out", str(checkout.live / "export")], capture_output=True, text=True, timeout=120)
    assert result.returncode == 1
    assert "is inside footbag_legacy_repo, which is read-only input" in result.stderr
    assert not (checkout.live / "export").exists()


def test_an_out_directory_inside_the_original_copy_is_refused(checkout):
    result = subprocess.run(
        [sys.executable, "-I", str(checkout.root / "legacy_data/scripts/refresh_legacy_repo_data.py"),
         "--out", str(checkout.original / "export")], capture_output=True, text=True, timeout=120)
    assert result.returncode == 1
    assert "is inside footbag_legacy_repo_original_data, which is read-only input" in result.stderr
    assert not (checkout.original / "export").exists()


def test_a_dump_delivered_as_a_link_is_refused(checkout):
    # The link stays inside the clone, so only the dump reader can refuse it.
    write(checkout.live, "members/backups/elsewhere.sql", members_dump())
    (checkout.live / MEMBERS).unlink()
    os.symlink("elsewhere.sql", checkout.live / MEMBERS)
    commit_all(checkout.live, "dump replaced by a link")
    assert_refused(checkout.run(), checkout.out, f"{MEMBERS} is a symbolic link, not a dump")


def test_the_refresh_never_rewrites_a_clone_index(checkout):
    # The clones are read-only input; a stat-stale index is what a plain
    # status refreshes and writes back.
    index = checkout.live / ".git" / "index"
    before = index.read_bytes()
    os.utime(checkout.live / MEMBERS, (1, 1))
    assert checkout.run().returncode == 0
    assert index.read_bytes() == before


def test_a_failure_after_the_first_write_says_the_export_is_partial(checkout):
    # A run that stops part way must not leave an export, or an old report,
    # that reads as a finished delivery.
    write(checkout.live, "ifpa/data/1.description", "A statement.\n")
    commit_all(checkout.live, "governance prose delivered")
    (checkout.out / "governance-prose" / "1.description").mkdir(parents=True)
    stale = ("REFRESH_REPORT.md", "REFRESH_REPORT_DETAIL.tsv", "REFRESH_MANIFEST.tsv")
    for name in stale:
        (checkout.out / name).write_text("from an earlier run\n")
    result = checkout.run()
    assert result.returncode == 1
    assert "The export is partially written" in result.stderr
    assert f"git -C {checkout.out} checkout -- ." in result.stderr
    assert f"git -C {checkout.out} clean -fd ." in result.stderr
    for name in stale:
        assert not (checkout.out / name).exists(), name


def test_an_out_directory_in_the_public_checkout_is_refused(checkout):
    target = checkout.root / "legacy_data" / "export"
    result = subprocess.run(
        [sys.executable, "-I", str(checkout.root / "legacy_data/scripts/refresh_legacy_repo_data.py"),
         "--out", str(target)], capture_output=True, text=True, timeout=120)
    assert result.returncode == 1
    assert "is inside the public checkout" in result.stderr
    assert not target.exists()


def test_format_counts_are_recorded_beside_the_original_and_a_rise_is_reported(checkout):
    checkout.deliver(MEMBERS, members_dump("(1,'Ann','pw-a'),(2,'B\x1ao','pw-b')"))
    result = checkout.run()
    assert_reported(result, f"{MEMBERS}: raw control characters rose from 0 to 1")
    row = next(line for line in (checkout.out / "REFRESH_MANIFEST.tsv").read_text().splitlines()
               if line.startswith(MEMBERS + "\t"))
    # footers, raw control characters and invalid UTF-8 lines, live then original
    assert row.split("\t")[5:] == ["1", "1", "0", "1", "0", "0"]


def test_an_export_path_still_open_after_the_owner_only_pass_fails_the_run(checkout, tmp_path):
    # A link in the export cannot be closed by a mode change; the run must not
    # certify an export it could not close.
    (checkout.out / "members").mkdir(parents=True)
    os.symlink(str(tmp_path), checkout.out / "members" / "stray")
    result = checkout.run()
    assert result.returncode == 1
    assert "still readable by another account" in result.stderr
    assert "stray" in result.stderr


def test_a_symlinked_copied_tree_root_is_refused(checkout):
    os.symlink("members", checkout.live / "ifpa-data-target")
    (checkout.live / "ifpa").mkdir()
    os.symlink("../members", checkout.live / "ifpa" / "data")
    commit_all(checkout.live, "copied root is a link")
    assert_refused(checkout.run(), checkout.out, "ifpa/data is a symbolic link; copied material is never followed")


def test_a_copied_file_named_like_the_export_manifest_is_refused_before_writing(checkout):
    write(checkout.live, "ifpa/data/MANIFEST.tsv", "planted\n")
    commit_all(checkout.live, "copied tree carries a manifest name")
    assert_refused(checkout.run(), checkout.out, "would overwrite the export's own file")


def test_copied_material_is_mirrored_and_stale_outputs_are_pruned(checkout):
    write(checkout.live, "ifpa/data/1.description", "A statement.\n")
    commit_all(checkout.live, "governance prose delivered")
    stale_table = checkout.out / "members" / "dropped_table.csv"
    stale_copy = checkout.out / "governance-prose" / "gone.description"
    for stale in (stale_table, stale_copy):
        stale.parent.mkdir(parents=True, exist_ok=True)
        stale.write_text("left from an earlier delivery\n")
    result = checkout.run()
    assert result.returncode == 0
    prose = checkout.out / "governance-prose"
    assert (prose / "1.description").read_text() == "A statement.\n"
    assert "1.description\t" in (prose / "MANIFEST.tsv").read_text()
    # A file a later delivery no longer produces must not sit in the export
    # looking as current as the rest, and its removal is reported.
    assert not stale_table.exists()
    assert not stale_copy.exists()
    assert "REPORT: governance-prose/gone.description: no longer in the delivery" in result.stdout


def test_a_dump_the_strict_reader_refuses_stops_the_refresh(checkout):
    checkout.deliver(MEMBERS, members_dump("(1,'Ann')"))
    assert_refused(checkout.run(), checkout.out, "a row has 2 values against 3 columns")


def test_a_link_inside_copied_material_is_refused(checkout):
    # The link stays inside the clone, so the history check passes it; copying
    # through it would still put the member dump into a copied directory.
    (checkout.live / "ifpa" / "data").mkdir(parents=True)
    write(checkout.live, "ifpa/data/1.description", "A statement.\n")
    os.symlink("../../members", checkout.live / "ifpa" / "data" / "keys")
    commit_all(checkout.live, "copied tree gains a link")
    assert_refused(checkout.run(), checkout.out, "ifpa/data/keys is a symbolic link inside copied material")


RICH_COLUMNS = ("MemberID", "MemberValid", "MemberFirstName", "MemberLastName", "MemberEmail",
                "MemberBirthYear", "MemberBirthMonth", "MemberBirthDay", "MemberIFPATier",
                "MemberModified", "MemberIFPAExpiration", "MemberIFPAExpiration2",
                "MemberPassword")
ADMINS = "members/admin/backups/latest.sql"
COMMITTEES = "groups/backups/committees.sql.gz"
# MemberModified and the expirations are Unix time; the dump completed on
# 2026-05-29, between these two.
BEFORE_DUMP = "1700000000"
AFTER_DUMP = "1900000000"
RICH_ROWS = {
    1: ("1", "Annwyl", "Leeward", "ann@example.org", "1980", "1", "2", "2", BEFORE_DUMP,
        BEFORE_DUMP, "0"),
    2: ("1", "Boaz", "Ngata", "bo@example.org", "1990", "3", "4", "0", BEFORE_DUMP, "0", "0"),
    3: ("0", "Cyan", "Oxley", "cy@example.org", "1970", "5", "6", "0", BEFORE_DUMP, "0", "0"),
    5: ("1", "Dior", "Pollux", "di@example.org", "1985", "7", "8", "0", BEFORE_DUMP, "0", "0"),
}


def sql(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def rich_members_dump(rows: dict) -> str:
    columns = "".join(f"  `{c}` varchar(80) DEFAULT NULL,\n" for c in RICH_COLUMNS[1:])
    values = ",".join("(" + ",".join([str(k), *map(sql, v), "'pw-secret'"]) + ")"
                      for k, v in sorted(rows.items()))
    return ("-- MySQL dump 10.16\n/*!40101 SET NAMES utf8 */;\n"
            "CREATE TABLE `members` (\n  `MemberID` int(11) NOT NULL,\n" + columns +
            "  PRIMARY KEY (`MemberID`)\n) ENGINE=MyISAM;\n"
            f"INSERT INTO `members` VALUES {values};\n"
            "-- Dump completed on 2026-05-29 15:46:52\n")


def admins_dump(rows: str) -> str:
    return ("-- MySQL dump 10.16\n/*!40101 SET NAMES utf8 */;\n"
            "CREATE TABLE `admins` (\n  `AdminID` int(11) NOT NULL DEFAULT '0',\n"
            "  `AdminValid` int(11) NOT NULL DEFAULT '0',\n"
            "  KEY `idx_admins` (`AdminID`)\n) ENGINE=MyISAM;\n"
            f"INSERT INTO `admins` VALUES {rows};\n"
            "-- Dump completed on 2026-05-29 15:46:52\n")


def committee_dump(rows: str) -> bytes:
    return gzip.compress((
        "-- MySQL dump 10.16\n/*!40101 SET NAMES utf8 */;\n"
        "CREATE TABLE `ifpa_committee_members` (\n"
        "  `CommitteeID` int(11) NOT NULL DEFAULT '0',\n"
        "  `CommitteeMemberID` int(11) NOT NULL DEFAULT '0',\n"
        "  `CommitteeMemberPriority` int(11) NOT NULL DEFAULT '50',\n"
        "  `CommitteeMemberTitle` varchar(255) DEFAULT '',\n"
        "  `CommitteeMemberVoting` int(11) NOT NULL DEFAULT '1'\n) ENGINE=MyISAM;\n"
        f"INSERT INTO `ifpa_committee_members` VALUES {rows};\n"
        "-- Dump completed on 2026-05-29 15:46:52\n").encode())


def first_delivery(checkout, members: dict = RICH_ROWS) -> None:
    """Replace the first delivery, in both clones, with the richer member,
    admin and board dumps the findings report reads."""
    write(checkout.original, MEMBERS, rich_members_dump(members))
    write(checkout.original, ADMINS, admins_dump("(1,1)"))
    (checkout.original / COMMITTEES).parent.mkdir(parents=True, exist_ok=True)
    (checkout.original / COMMITTEES).write_bytes(committee_dump("(1,2,10,'Secretary',1)"))
    commit_all(checkout.original, "first delivery with members, admins and board")
    shutil.rmtree(checkout.live)
    shutil.copytree(checkout.original, checkout.live, symlinks=True)


def flags(checkout) -> set[tuple[str, str]]:
    detail = (checkout.out / "REFRESH_REPORT_DETAIL.tsv").read_text(encoding="utf-8")
    return {(line.split("\t")[2], line.split("\t")[3][len("flag: "):])
            for line in detail.splitlines() if "\tflag: " in line}


def changed(row: int, **fields) -> dict:
    rows = dict(RICH_ROWS)
    values = list(rows[row])
    for name, value in fields.items():
        values[RICH_COLUMNS.index(name) - 1] = value
    rows[row] = tuple(values)
    return rows


def added(row: int, values: tuple) -> dict:
    return {**RICH_ROWS, row: values}


@pytest.mark.parametrize("delivered, key, kind", [
    (changed(2, MemberFirstName="Zed"), "2", "identity changed at an existing id"),
    (changed(1, MemberEmail="new@example.org"), "1",
     "email changed on an account with a tier or admin flag"),
    (changed(2, MemberEmail="ann@example.org"), "2", "email newly shared with another account"),
    (changed(2, MemberIFPATier="2"), "2", "tier changed"),
    (changed(3, MemberValid="1"), "3", "validity changed"),
    (changed(2, MemberModified="1900000000"), "2", "modified after the dump completed"),
    (added(6, ("1", "Boaz", "Ngata", "other@example.org", "1990", "3", "4", "0", BEFORE_DUMP,
               "0", "0")), "6", "new account copies an existing name and birth date"),
    (added(4, ("1", "Ed", "Fu", "ed@example.org", "1975", "9", "9", "0", BEFORE_DUMP, "0", "0")),
     "4", "new id below the previous highest"),
    ({k: v for k, v in RICH_ROWS.items() if k != 3}, "3", "account removed"),
    (changed(2, MemberFirstName="B" + chr(0x202E) + "o"), "2", "direction-override character"),
    (changed(2, MemberFirstName="B\x07o"), "2", "control character"),
    (changed(2, MemberFirstName="B" + chr(0x200B) + "o"), "2", "zero-width character"),
    (changed(2, MemberFirstName="<script>x"), "2", "active markup"),
    (changed(2, MemberFirstName="=cmd()"), "2", "leading formula character"),
    (added(6, ("1", "<script>x", "Fu", "f@example.org", "1975", "9", "9", "0", BEFORE_DUMP,
               "0", "0")), "6", "active markup"),
    (changed(2, MemberModified="yesterday"), "2", "modification time is not a timestamp"),
    # Standing lives in the expirations, not the tier code, so a paid account
    # with tier code 0 is still one whose e-mail must not move unseen.
    (changed(2, MemberIFPAExpiration="-1", MemberEmail="new@example.org"), "2",
     "email changed on an account with a tier or admin flag"),
    (changed(2, MemberIFPAExpiration2=BEFORE_DUMP, MemberEmail="new@example.org"), "2",
     "email changed on an account with a tier or admin flag"),
    (changed(2, MemberIFPAExpiration=AFTER_DUMP, MemberEmail="new@example.org"), "2",
     "email changed on an account with a tier or admin flag"),
    (changed(2, MemberIFPAExpiration="-1"), "2", "lifetime standing gained or lost"),
    (changed(1, MemberIFPAExpiration="1600000000"), "1", "expiry moved earlier"),
])
def test_the_findings_report_flags_each_suspicious_member_change(checkout, delivered, key, kind):
    # Each is the shape of a webmaster-side change that would reach a live
    # account if accepted unseen: identity reuse, account takeover, privilege
    # or tier inflation, fabricated or deleted rows, and text that acts on a reader.
    first_delivery(checkout)
    checkout.deliver(MEMBERS, rich_members_dump(delivered))
    result = checkout.run()
    assert result.returncode == 0, result.stdout + result.stderr
    assert (key, kind) in flags(checkout)
    assert f"{kind}: 1" in result.stdout


def test_an_unchanged_delivery_raises_no_flag(checkout):
    # A report that flags honest data trains the reviewer to skip it.
    first_delivery(checkout)
    result = checkout.run()
    assert result.returncode == 0, result.stdout + result.stderr
    assert flags(checkout) == set()
    assert "Flags for review: 0" in (checkout.out / "REFRESH_REPORT.md").read_text()


def test_a_renewal_is_counted_and_not_flagged(checkout):
    # Members renew all the time; flagging each renewal would bury the flags
    # that matter, so an expiry moving later is a count in the report.
    first_delivery(checkout)
    checkout.deliver(MEMBERS, rich_members_dump(changed(1, MemberIFPAExpiration=AFTER_DUMP)))
    result = checkout.run()
    assert result.returncode == 0, result.stdout + result.stderr
    assert flags(checkout) == set()
    assert "Membership renewals (an expiry moved later, not flagged): 1" in (
        checkout.out / "REFRESH_REPORT.md").read_text()


def test_a_lifetime_account_losing_its_lifetime_standing_is_flagged(checkout):
    first_delivery(checkout, changed(2, MemberIFPAExpiration="-1"))
    checkout.deliver(MEMBERS, rich_members_dump(changed(2, MemberIFPAExpiration=AFTER_DUMP)))
    assert checkout.run().returncode == 0
    assert ("2", "lifetime standing gained or lost") in flags(checkout)


def test_an_email_change_on_an_annual_that_lapsed_before_the_dump_is_not_flagged(checkout):
    # A lapsed annual is no standing at the dump, so its e-mail is ordinary churn.
    lapsed = changed(2, MemberIFPAExpiration=BEFORE_DUMP)
    first_delivery(checkout, lapsed)
    lapsed[2] = (*lapsed[2][:3], "new@example.org", *lapsed[2][4:])
    checkout.deliver(MEMBERS, rich_members_dump(lapsed))
    assert checkout.run().returncode == 0
    assert flags(checkout) == set()


def test_a_new_account_sharing_only_a_name_and_a_blank_birth_date_is_not_flagged(checkout):
    # A third of real accounts carry no birth date, so an honest sign-up with
    # a common name would otherwise read as a duplicate-merge hijack.
    blank = ("1", "Boaz", "Ngata", "bo@example.org", "0", "0", "0", "0", BEFORE_DUMP, "0", "0")
    first_delivery(checkout, {**RICH_ROWS, 2: blank})
    checkout.deliver(MEMBERS, rich_members_dump(
        {**RICH_ROWS, 2: blank, 6: (*blank[:3], "other@example.org", *blank[4:])}))
    assert checkout.run().returncode == 0
    assert flags(checkout) == set()


def test_an_added_admin_row_is_flagged(checkout):
    first_delivery(checkout)
    checkout.deliver(ADMINS, admins_dump("(1,1),(5,1)"))
    assert checkout.run().returncode == 0
    assert any(kind == "admin row added" for _, kind in flags(checkout))


def test_a_removed_admin_row_is_flagged(checkout):
    first_delivery(checkout)
    checkout.deliver(ADMINS, admins_dump("(1,0)"))
    assert checkout.run().returncode == 0
    assert any(kind == "admin row removed" for _, kind in flags(checkout))


def test_an_email_change_on_an_untiered_admin_is_flagged(checkout):
    first_delivery(checkout)
    write(checkout.live, ADMINS, admins_dump("(1,1),(2,1)"))
    checkout.deliver(MEMBERS, rich_members_dump(changed(2, MemberEmail="new@example.org")))
    assert checkout.run().returncode == 0
    assert ("2", "email changed on an account with a tier or admin flag") in flags(checkout)


def test_tracked_files_outside_the_captured_set_are_reported(checkout):
    # A dump delivered somewhere the refresh does not read would otherwise
    # never be seen; other files are counted by folder, not listed.
    write(checkout.original, "ifpa/ifpa_issues.mysql", "-- an older issues dump\n")
    commit_all(checkout.original, "first delivery carried a stray dump")
    shutil.rmtree(checkout.live)
    shutil.copytree(checkout.original, checkout.live, symlinks=True)
    write(checkout.live, "faq/faq.sql", "-- an older faq dump\n")
    write(checkout.live, "ifpa/ifpa_issues.mysql", "-- the stray dump, edited\n")
    write(checkout.live, "members/index.php", "<?php\n")
    write(checkout.live, "notes.txt", "x\n")
    write(checkout.live, "ifpa/data/1.description", "A statement.\n")
    write(checkout.live, MEMBERS, members_dump("(1,'Ann','pw-a'),(2,'Bo','pw-b'),(3,'Cy','pw-c')"))
    commit_all(checkout.live, "files beyond the module dumps")
    result = checkout.run()
    assert_reported(result, "faq/faq.sql: a tracked dump-like file added outside the captured set")
    assert_reported(result, "ifpa/ifpa_issues.mysql: a tracked dump-like file changed outside "
                            "the captured set")
    assert_reported(result, "members: 1 other tracked file(s) added or changed outside the "
                            "captured set")
    assert_reported(result, "(top level): 1 other tracked file(s) added or changed outside the "
                            "captured set")
    # The converted dump and the copied tree are captured, so neither is named.
    outside = "".join(line for line in result.stdout.splitlines()
                      if "outside the captured set" in line)
    assert MEMBERS not in outside and "ifpa/data" not in outside


def test_the_board_roster_passes_the_cto_check_only_when_it_carries_the_cto(checkout):
    first_delivery(checkout)
    assert checkout.run().returncode == 0
    report = (checkout.out / "REFRESH_REPORT.md").read_text()
    assert "carries the CTO record: FAIL" in report
    (checkout.live / COMMITTEES).write_bytes(
        committee_dump("(1,2,10,'Secretary',1),(1,11985,20,'CTO',0)"))
    commit_all(checkout.live, "board roster now current")
    assert checkout.run().returncode == 0
    report = (checkout.out / "REFRESH_REPORT.md").read_text()
    assert "carries the CTO record: PASS" in report
    assert "| 11985 | CTO | no |" in report


def test_the_report_compares_with_the_committed_delivery_and_a_rerun_repeats_it(checkout):
    # The baseline is what the maintainer last accepted, so running again
    # before committing must not report the delivery as already seen.
    first_delivery(checkout)
    assert checkout.run().returncode == 0
    git(checkout.out, "init", "-q")
    commit_all(checkout.out, "accepted delivery")
    checkout.deliver(MEMBERS, rich_members_dump(changed(2, MemberIFPATier="2")))
    assert checkout.run().returncode == 0
    report = (checkout.out / "REFRESH_REPORT.md").read_text()
    assert "| members | members | last accepted delivery |" in report
    first = (checkout.out / "REFRESH_REPORT_DETAIL.tsv").read_bytes()
    assert ("2", "tier changed") in flags(checkout)
    assert checkout.run().returncode == 0
    assert (checkout.out / "REFRESH_REPORT_DETAIL.tsv").read_bytes() == first


def test_the_report_names_rows_by_key_and_never_writes_a_name_or_email(checkout):
    first_delivery(checkout)
    checkout.deliver(MEMBERS, rich_members_dump(changed(2, MemberEmail="ann@example.org")))
    assert checkout.run().returncode == 0
    for name in ("REFRESH_REPORT.md", "REFRESH_REPORT_DETAIL.tsv"):
        text = (checkout.out / name).read_text()
        for leaked in ("example.org", "Boaz", "Ngata", "Annwyl", "pw-secret"):
            assert leaked not in text, (name, leaked)


def test_missing_original_copy_is_named(checkout):
    (checkout.root / "footbag_legacy_repo_original_data").unlink()
    result = checkout.run()
    assert result.returncode != 0
    assert "footbag_legacy_repo_original_data (the original copy) is not reachable" in result.stderr
