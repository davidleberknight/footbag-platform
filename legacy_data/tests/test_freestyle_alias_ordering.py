"""
Where committed alias resolution sits in a refresh, and what that fixes.

An alias can only attach to a trick that exists. The base dictionary's aliases
were applied at the point that loader wrote its own tricks, so an alias naming a
trick the expert overlay creates resolved against a half-built dictionary and was
skipped. Five were skipped on every build this project ever made.

They cannot simply move to the end either. The footbag.org intake reads the alias
table to decide which scraped names are already curated, so running it before the
aliases exist makes it create pending rows for moves the dictionary already holds.
The stage therefore sits between the two: after the overlay, before the intake.

One resolver change comes with it. The alias file names its target by canonical
name, and the overlay legitimately renames canonical names while slugs stay put,
so a name-only lookup loses real aliases the moment a display name is corrected.
The fallback folds the target through the slug rule and looks it up exactly. It is
identity matching, not fuzzy matching: an unknown target still fails.

These tests build with the real loaders in the real order. They touch no real
database.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_alias_ordering.py -v
"""
import importlib.util
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = REPO_ROOT / "database" / "schema.sql"
LOADERS = REPO_ROOT / "freestyle" / "loaders"
SPAWN_TIMEOUT = 180

#: The refresh, in the order the rebuild runs it. The alias stage is the second
#: appearance of the dictionary loader, between the overlay and the intake.
REFRESH = [
    ("16_preflight_trick_ownership.py", []),
    ("17_load_trick_dictionary.py", ["--stage", "tricks"]),
    ("19_load_red_additions.py", []),
    ("17_load_trick_dictionary.py", ["--stage", "aliases"]),
    ("20_link_footbag_org_sources.py", []),
    ("21_load_footbag_org_pending_tricks.py", []),
    ("21a_load_alias_additions.py", []),
    ("21b_apply_alias_overrides.py", []),
    ("21c_retire_stale_tricks.py", []),
]

#: Ruled to be retained, and skipped by every build before this ordering.
APPROVED_ADDITIONS = {
    "gravedigger": "grave_digger",
    "ps_mirage": "paradox_symposium_mirage",
    "p_s_mirage": "paradox_symposium_mirage",
    "ps_eggbeater": "paradox_symposium_eggbeater",
    "ps_torque": "paradox_symposium_torque",
}

#: Real aliases a naive move to the end of the pipeline silently dropped, because
#: their target's canonical name had been rewritten by the overlay.
RENAME_EXPOSED = ("whip", "rev_whirl_op", "toe_mobius",
                  "clipper_far_symposium_double_down", "stepping_far_double_down")

#: Now identical to its target's canonical name, so no longer an alias at all.
STALE_SELF_ALIAS = "reverse_whirl"


def run(loader: str, args: list[str], db: Path):
    return subprocess.run(
        [sys.executable, str(LOADERS / loader), "--db", str(db), *args],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=SPAWN_TIMEOUT,
    )


def refresh(db: Path):
    for loader, args in REFRESH:
        result = run(loader, args, db)
        if result.returncode != 0:
            return loader, result
    return None, None


def connect(db: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def aliases(db: Path) -> dict:
    conn = connect(db)
    try:
        return {r[0]: r for r in conn.execute(
            "SELECT alias_slug, alias_text, trick_slug, alias_type, alias_display,"
            " COALESCE(source_id, '') FROM freestyle_trick_aliases")}
    finally:
        conn.close()


def tricks(db: Path) -> set:
    conn = connect(db)
    try:
        return {r[0] for r in conn.execute("SELECT slug FROM freestyle_tricks")}
    finally:
        conn.close()


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    db = tmp_path_factory.mktemp("freestyle-alias-order") / "footbag.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))
    conn.close()
    failed, result = refresh(db)
    assert failed is None, f"{failed} failed:\n{result.stderr if result else ''}"
    return db


class TestTheOrderingItself:
    def test_the_alias_stage_runs_between_the_overlay_and_the_intake(self):
        script = (REPO_ROOT / "freestyle" / "run_freestyle.sh").read_text(encoding="utf-8")
        overlay = script.index("19_load_red_additions.py")
        alias_stage = script.index("--stage aliases")
        intake = script.index("21_load_footbag_org_pending_tricks.py")
        assert overlay < alias_stage < intake

    def test_the_trick_stage_runs_before_the_overlay(self):
        script = (REPO_ROOT / "freestyle" / "run_freestyle.sh").read_text(encoding="utf-8")
        assert script.index("--stage tricks") < script.index("19_load_red_additions.py")


class TestOneRefreshReachesTheRightAliasSet:
    def test_every_approved_alias_resolves_on_the_first_refresh(self, built):
        found = aliases(built)
        for slug, target in APPROVED_ADDITIONS.items():
            assert slug in found, f"{slug} did not resolve"
            assert found[slug][2] == target

    def test_each_approved_alias_is_technical_and_hidden(self, built):
        found = aliases(built)
        for slug in APPROVED_ADDITIONS:
            _s, _text, _target, alias_type, display, _src = found[slug]
            assert alias_type == "technical", f"{slug} is {alias_type}"
            assert display == 0, f"{slug} would render publicly"

    def test_the_aliases_a_naive_reorder_lost_are_all_present(self, built):
        found = aliases(built)
        missing = [s for s in RENAME_EXPOSED if s not in found]
        assert missing == []

    def test_the_stale_self_alias_is_gone(self, built):
        """Its target's canonical name is now the alias text, so it is not one."""
        assert STALE_SELF_ALIAS not in aliases(built)

    def test_the_base_dictionary_carries_no_alias_repeating_a_canonical_name(self, built):
        """Scoped to this loader, which is the one that skips a self-alias.

        Seven rows written by the expert overlay are also textually identical to
        their target's canonical name. That predates this work, was eight before
        the ruled removal, and belongs to a different alias path with no such
        skip; all seven are display-off, so none reaches a reader. Pinned narrowly
        here rather than asserted globally, so the count cannot grow unnoticed
        through this loader while the wider question stays open.
        """
        conn = connect(built)
        try:
            offenders = conn.execute(
                "SELECT a.alias_slug FROM freestyle_trick_aliases a"
                "  JOIN freestyle_tricks t ON t.slug = a.trick_slug"
                " WHERE LOWER(a.alias_text) = LOWER(t.canonical_name)"
                "   AND a.source_id = 'curated-v1'"
            ).fetchall()
            elsewhere = conn.execute(
                "SELECT COUNT(*) FROM freestyle_trick_aliases a"
                "  JOIN freestyle_tricks t ON t.slug = a.trick_slug"
                " WHERE LOWER(a.alias_text) = LOWER(t.canonical_name)"
            ).fetchone()[0]
        finally:
            conn.close()
        assert offenders == []
        assert elsewhere == 7, "the pre-existing overlay self-aliases have moved"


class TestTheIntakeIsUnaffected:
    """Its output must not move, because it consumes the aliases."""

    def test_it_creates_the_same_seven_pending_tricks(self, built):
        conn = connect(built)
        try:
            pending = sorted(r[0] for r in conn.execute(
                "SELECT slug FROM freestyle_tricks"
                " WHERE trick_origin_producer = 'footbag-org-pending'"))
        finally:
            conn.close()
        assert pending == [
            "fairy_spyro_mirage", "miraging_pincher", "pandora", "spyro_illusion",
            "spyro_mirage", "spyro_whirl", "stepping_p_s_whirling_x_body_rake",
        ]

    def test_it_creates_no_notation_tokens_as_aliases(self, built):
        """Names like these appear only when the resolver ran incomplete."""
        found = aliases(built)
        for token in ("back", "no_plant_while"):
            assert token not in found

    def test_its_alias_output_is_unchanged(self, built):
        conn = connect(built)
        try:
            from_intake = sorted(r[0] for r in conn.execute(
                "SELECT alias_slug FROM freestyle_trick_aliases"
                " WHERE source_id = 'footbag-org-2026-04'"))
        finally:
            conn.close()
        assert from_intake == ["stepping_op_squeeze", "spyro_pickup"] or \
               from_intake == ["spyro_pickup", "stepping_op_squeeze"]


class TestTheRenameStableLookup:
    """Loaded from the loader module, whose filename starts with a digit."""

    @staticmethod
    def _module():
        path = LOADERS / "17_load_trick_dictionary.py"
        spec = importlib.util.spec_from_file_location("loader17", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_a_renamed_target_still_resolves_by_slug(self):
        m = self._module()
        by_name = {"reverse whirl": "rev_whirl"}
        valid = {"rev_whirl"}
        # The alias file still says "rev whirl"; the row is named "reverse whirl".
        assert m.resolve_alias_target("rev whirl", by_name, valid) == "rev_whirl"

    def test_an_exact_name_still_wins(self):
        m = self._module()
        assert m.resolve_alias_target(
            "reverse whirl", {"reverse whirl": "rev_whirl"}, {"rev_whirl"}) == "rev_whirl"

    def test_an_unknown_target_fails_rather_than_being_guessed(self):
        m = self._module()
        for unknown in ("rev whirlz", "whirl reverse", "rev", "a trick nobody has"):
            assert m.resolve_alias_target(unknown, {"reverse whirl": "rev_whirl"},
                                          {"rev_whirl"}) is None

    def test_it_does_not_hop_through_another_alias(self):
        m = self._module()
        # "whip" is an alias of the reverse whirl, never a target in its own right.
        assert m.resolve_alias_target("whip", {"reverse whirl": "rev_whirl"},
                                      {"rev_whirl"}) is None

    def test_it_does_not_match_on_a_substring(self):
        m = self._module()
        assert m.resolve_alias_target("whirl", {"reverse whirl": "rev_whirl"},
                                      {"rev_whirl"}) is None

    def test_the_fallback_changes_no_alias_semantics(self, built):
        """Aliases reached through the fallback carry ordinary class and source."""
        found = aliases(built)
        whip = found["whip"]
        assert whip[2] == "rev_whirl"
        assert whip[5] == "curated-v1"
        assert whip[4] in (0, 1)


class TestTheRefreshAsAWhole:
    def test_a_second_refresh_changes_nothing(self, built, tmp_path):
        before_aliases, before_tricks = aliases(built), tricks(built)
        copy = tmp_path / "again.db"
        copy.write_bytes(Path(built).read_bytes())
        failed, result = refresh(copy)
        assert failed is None, f"{failed} failed:\n{result.stderr if result else ''}"
        assert aliases(copy) == before_aliases
        assert tricks(copy) == before_tricks

    def test_no_foreign_key_is_violated(self, built):
        conn = connect(built)
        try:
            assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
            assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        finally:
            conn.close()

    def test_a_curator_alias_is_untouched(self, built, tmp_path):
        """Nothing in the refresh reaches an alias a curator wrote."""
        copy = tmp_path / "curator.db"
        copy.write_bytes(Path(built).read_bytes())
        conn = connect(copy)
        with conn:
            conn.execute(
                "INSERT INTO freestyle_tricks (slug, canonical_name, adds, review_status,"
                " is_active, is_core, sort_order, loaded_at, trick_origin_producer)"
                " VALUES ('a_curator_trick', 'a curator trick', '4', 'curated', 1, 0,"
                " 99999, '2026-08-30T00:00:00.000Z', 'curator-publication')")
            conn.execute(
                "INSERT INTO freestyle_trick_aliases (alias_slug, alias_text, trick_slug,"
                " alias_type, alias_display, alias_origin_producer, created_at)"
                " VALUES ('a_curator_alias', 'a curator alias', 'a_curator_trick',"
                " 'common', 1, 'curator-application', '2026-08-30T00:00:00.000Z')")
        conn.close()

        failed, result = refresh(copy)
        assert failed is None, f"{failed} failed:\n{result.stderr if result else ''}"
        survivor = aliases(copy).get("a_curator_alias")
        assert survivor is not None
        assert survivor[2] == "a_curator_trick"
        assert survivor[3] == "common" and survivor[4] == 1
