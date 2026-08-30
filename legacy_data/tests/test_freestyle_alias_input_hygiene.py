"""
What a curated alias input may not ask for, and what it no longer carries.

An alias is stored under a normalised slug, so two spellings that fold together
are one row. A file listing both is asking for one alias under two names, and
only one survives; which one was decided by whichever loader wrote last or
collided first, an answer nobody chose and one that changed with pipeline order.
Five such pairs sat in the curated inputs unnoticed, invisible because another
producer claimed each slug before a deduplication step ran.

Two alias strings are also gone. Neither had ever reached a built database, and
neither had evidence: one an abbreviation resting only on a media-ingest shorthand
list, the other a misspelling attested nowhere at all, unlike every other typo
alias in the dictionary, which traces to a real occurrence.

These tests read the committed inputs and exercise the gate. They touch no
database.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_alias_input_hygiene.py -v
"""
import csv
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from _freestyle_aliases import (  # noqa: E402
    DuplicateAliasSlugError,
    alias_text_to_slug,
    assert_no_duplicate_alias_slugs,
)

INPUTS = REPO_ROOT / "freestyle" / "inputs"
ALIAS_CSV = INPUTS / "base_dictionary" / "trick_aliases.csv"
TRICKS_CSV = INPUTS / "base_dictionary" / "tricks.csv"
ADDITIONS_CSV = INPUTS / "curated" / "tricks" / "red_additions_2026_04_20.csv"


def dedicated_aliases() -> list[tuple[str, str]]:
    with ALIAS_CSV.open(encoding="utf-8") as fh:
        return [(r["alias"], r["trick_canon"]) for r in csv.DictReader(fh)]


def inline_aliases(path: Path, name_field: str) -> list[tuple[str, str]]:
    out = []
    with path.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            for alias in (row.get("aliases") or "").split("|"):
                if alias.strip():
                    out.append((alias.strip(), row[name_field]))
    return out


AUTHORITATIVE_INPUTS = [
    ("the base dictionary alias file", lambda: dedicated_aliases()),
    ("the base dictionary's inline trick aliases",
     lambda: inline_aliases(TRICKS_CSV, "trick_canon")),
    ("the expert additions' inline aliases",
     lambda: inline_aliases(ADDITIONS_CSV, "canonical_name")),
]


class TestNoInputAsksForOneAliasTwice:
    @pytest.mark.parametrize("label,read", AUTHORITATIVE_INPUTS,
                             ids=[label for label, _ in AUTHORITATIVE_INPUTS])
    def test_input_is_free_of_duplicate_normalised_slugs(self, label, read):
        assert_no_duplicate_alias_slugs(read(), label)

    def test_the_paradox_pairs_keep_one_spelling_across_every_input(self):
        """The spelling each already-ruled slug resolves to is the one retained.

        These three were carried by all three inputs, so all three were corrected
        and no input can reintroduce a competing spelling.
        """
        kept = {"p_torque": "p. torque", "p_whirl": "p. whirl", "pdx_mirage": "pdx mirage"}
        everything = (dedicated_aliases()
                      + inline_aliases(TRICKS_CSV, "trick_canon")
                      + inline_aliases(ADDITIONS_CSV, "canonical_name"))
        by_slug: dict[str, set[str]] = {}
        for text, _target in everything:
            by_slug.setdefault(alias_text_to_slug(text), set()).add(text.strip())
        for slug, spelling in kept.items():
            assert by_slug.get(slug) == {spelling}, (
                f"{slug} should be carried as exactly \"{spelling}\"")

    def test_the_walk_and_legover_pairs_keep_one_spelling_across_every_input(self):
        """Each is carried once, by the alias file, in the ruled spelling.

        Both were duplicated twice over: once inside the alias file, and again by
        a spaced spelling sitting inline on the trick's own row in a second input.
        The second copy did not trip the gate, since no single input asked twice,
        and the hyphenated spelling won only because the alias file is merged
        later. Removing the inline copies settles it by decision rather than by
        merge order; the surviving spelling is the one already ruled and already
        displayed, so nothing a reader sees changes.
        """
        everything = (dedicated_aliases()
                      + inline_aliases(TRICKS_CSV, "trick_canon")
                      + inline_aliases(ADDITIONS_CSV, "canonical_name"))
        by_slug: dict[str, set[str]] = {}
        for text, _target in everything:
            by_slug.setdefault(alias_text_to_slug(text), set()).add(text.strip())
        assert by_slug.get("park_walk") == {"park-walk"}
        assert by_slug.get("leg_over") == {"leg-over"}

    def test_no_spaced_spelling_survives_inline_on_its_own_trick_row(self):
        inline = {alias_text_to_slug(t) for t, _ in inline_aliases(TRICKS_CSV, "trick_canon")}
        assert "park_walk" not in inline
        assert "leg_over" not in inline


class TestTheGateRefusesRatherThanChoosing:
    def test_it_names_every_duplicated_slug_and_both_spellings(self):
        with pytest.raises(DuplicateAliasSlugError) as err:
            assert_no_duplicate_alias_slugs(
                [("p torque", "paradox torque"), ("p. torque", "paradox torque")],
                "a test input",
            )
        message = str(err.value)
        assert "a test input" in message
        assert "p_torque" in message
        assert "p torque" in message and "p. torque" in message

    def test_it_catches_a_repeat_of_the_identical_string(self):
        with pytest.raises(DuplicateAliasSlugError):
            assert_no_duplicate_alias_slugs(
                [("pdx mirage", "paradox mirage"), ("pdx mirage", "paradox mirage")],
                "a test input",
            )

    def test_it_catches_spellings_that_differ_only_by_punctuation(self):
        for a, b in (("p-whirl", "p. whirl"), ("park walk", "park-walk"),
                     ("leg over", "leg-over")):
            with pytest.raises(DuplicateAliasSlugError):
                assert_no_duplicate_alias_slugs(
                    [(a, "a trick"), (b, "a trick")], "a test input")

    def test_it_permits_distinct_slugs(self):
        assert_no_duplicate_alias_slugs(
            [("pdx mirage", "paradox mirage"), ("p. mirage", "paradox mirage")],
            "a test input",
        )

    def test_it_ignores_blank_entries(self):
        assert_no_duplicate_alias_slugs(
            [("", "a trick"), ("   ", "a trick"), ("real", "a trick")], "a test input")


class TestTheRemovedAliases:
    def test_neither_removed_alias_is_carried_by_any_input(self):
        """Removed for want of evidence; they must not return by rebuild."""
        everything = (dedicated_aliases()
                      + inline_aliases(TRICKS_CSV, "trick_canon")
                      + inline_aliases(ADDITIONS_CSV, "canonical_name"))
        slugs = {alias_text_to_slug(t) for t, _ in everything}
        assert "bs_whirl" not in slugs
        assert "blurry_symposium_wirl" not in slugs

    def test_no_override_adjudicates_an_alias_no_input_carries(self):
        """An override for a removed alias would be a ruling about nothing.

        The override loader refuses a retype whose alias is absent, so a stale
        row here fails the build rather than sitting unnoticed.
        """
        overrides_csv = INPUTS / "base_dictionary" / "alias_overrides.csv"
        with overrides_csv.open(encoding="utf-8") as fh:
            ruled = {r["alias_slug"] for r in csv.DictReader(fh)
                     if r["action"].strip() == "retype"}
        assert "bs_whirl" not in ruled
        assert "blurry_symposium_wirl" not in ruled
