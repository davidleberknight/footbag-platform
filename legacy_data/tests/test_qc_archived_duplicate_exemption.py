"""
Focused test for the archived-duplicate exemption in the trick-dictionary QC's
duplicate-canonical detector.

Long-term contract pinned:

  Two rows sharing a canonical name normally need a curator to pick the
  canonical form, so the detector reports them. Exactly one shape of shared
  name is already resolved and is exempt: ONE active trick, with every other
  row in the group inactive AND carrying an alias from its own slug onto that
  active trick. There the archived URL redirects to the surviving row, only one
  trick identity is publicly reachable, and the shared name is the archive
  showing through the name column rather than a second identity.

  This is the same relationship the alias/canonical hard gate already treats as
  legitimate, so the two checks agree on what an archived duplicate is.

  The exemption is narrow on purpose. Two active rows sharing a name, an
  inactive row that merely happens to share a name with no alias tying it to the
  survivor, and a group holding more than one active row all stay reported.

Run from repo root:
    python -m pytest legacy_data/tests/test_qc_archived_duplicate_exemption.py -v
"""
import importlib.util
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
QC_PATH = REPO_ROOT / "freestyle" / "loaders" / "22_qc_trick_dictionary.py"


def load_qc_module():
    """The loader filename starts with a digit, so it cannot be imported by name."""
    spec = importlib.util.spec_from_file_location("qc_trick_dictionary", QC_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


qc = load_qc_module()


def trick(slug: str, canonical_name: str, is_active: int) -> dict:
    return {
        "slug": slug,
        "canonical_name": canonical_name,
        "adds": 4,
        "base_trick": None,
        "trick_family": None,
        "category": "compound",
        "description": "",
        "notation": "",
        "review_status": "curated",
        "is_core": 0,
        "is_active": is_active,
    }


def alias(alias_slug: str, trick_slug: str) -> tuple[str, str, str, str]:
    return (alias_slug, alias_slug.replace("_", " "), trick_slug, "structural")


def duplicate_slugs(curated: dict, aliases: list) -> set:
    """Every slug the detector reports as a duplicate canonical."""
    rows = qc.detect_conflicts(curated, [], [], aliases)
    return {r["trick_slug"] for r in rows if r["conflict_type"] == "DUPLICATE_CANONICAL"}


def test_active_plus_its_archived_duplicate_is_not_reported():
    curated = {
        "stepping_rev_whirl": trick("stepping_rev_whirl", "stepping reverse whirl", 1),
        "stepping_reverse_whirl": trick("stepping_reverse_whirl", "stepping reverse whirl", 0),
    }
    aliases = [alias("stepping_reverse_whirl", "stepping_rev_whirl")]
    assert duplicate_slugs(curated, aliases) == set()


def test_two_active_rows_sharing_a_name_are_still_reported():
    curated = {
        "tapping_leg_over": trick("tapping_leg_over", "tapping leg over", 1),
        "tapping_legover": trick("tapping_legover", "tapping legover", 1),
    }
    # Even an alias between them does not excuse two reachable identities.
    aliases = [alias("tapping_legover", "tapping_leg_over")]
    assert duplicate_slugs(curated, aliases) == {"tapping_leg_over", "tapping_legover"}


def test_unrelated_inactive_row_sharing_a_name_is_still_reported():
    curated = {
        "some_trick": trick("some_trick", "shared name", 1),
        "other_trick": trick("other_trick", "shared name", 0),
    }
    # No alias ties the inactive row to the survivor, so the archive relationship
    # was never established and a curator still has to resolve the collision.
    assert duplicate_slugs(curated, aliases=[]) == {"some_trick", "other_trick"}


def test_inactive_row_aliased_to_a_different_trick_is_still_reported():
    curated = {
        "survivor": trick("survivor", "shared name", 1),
        "archived": trick("archived", "shared name", 0),
        "elsewhere": trick("elsewhere", "unrelated", 1),
    }
    # The alias points somewhere else, so it does not redirect this archived row
    # onto the row it shares a name with.
    aliases = [alias("archived", "elsewhere")]
    assert duplicate_slugs(curated, aliases) == {"survivor", "archived"}


def test_group_with_two_active_rows_and_an_archived_row_is_still_reported():
    curated = {
        "active_one": trick("active_one", "shared name", 1),
        "active_two": trick("active_two", "shared name", 1),
        "archived": trick("archived", "shared name", 0),
    }
    aliases = [alias("archived", "active_one")]
    assert duplicate_slugs(curated, aliases) == {"active_one", "active_two", "archived"}


def test_the_five_reverse_whirl_archived_duplicates_are_exempt():
    """The compounds whose display-name normalization surfaced their own archive."""
    pairs = [
        ("fairy_rev_whirl", "fairy_reverse_whirl", "fairy reverse whirl"),
        ("pixie_rev_whirl", "pixie_reverse_whirl", "pixie reverse whirl"),
        ("pixie_symposium_rev_whirl", "pixie_symposium_reverse_whirl", "pixie symposium reverse whirl"),
        ("spinning_rev_whirl", "spinning_reverse_whirl", "spinning reverse whirl"),
        ("stepping_rev_whirl", "stepping_reverse_whirl", "stepping reverse whirl"),
    ]
    curated = {}
    aliases = []
    for active_slug, archived_slug, name in pairs:
        curated[active_slug] = trick(active_slug, name, 1)
        curated[archived_slug] = trick(archived_slug, name, 0)
        aliases.append(alias(archived_slug, active_slug))
    assert duplicate_slugs(curated, aliases) == set()


def test_the_preexisting_active_pair_survives_alongside_the_exempt_ones():
    """The exemption removes only the archived pairs; a genuine collision in the
    same corpus is still reported."""
    curated = {
        "stepping_rev_whirl": trick("stepping_rev_whirl", "stepping reverse whirl", 1),
        "stepping_reverse_whirl": trick("stepping_reverse_whirl", "stepping reverse whirl", 0),
        "tapping_leg_over": trick("tapping_leg_over", "tapping leg over", 1),
        "tapping_legover": trick("tapping_legover", "tapping legover", 1),
    }
    aliases = [alias("stepping_reverse_whirl", "stepping_rev_whirl")]
    assert duplicate_slugs(curated, aliases) == {"tapping_leg_over", "tapping_legover"}


def test_predicate_requires_every_archived_row_to_redirect():
    """One un-aliased row in the group disqualifies the whole group."""
    slugs = ["survivor", "archived_ok", "archived_orphan"]
    curated = {
        "survivor": trick("survivor", "shared name", 1),
        "archived_ok": trick("archived_ok", "shared name", 0),
        "archived_orphan": trick("archived_orphan", "shared name", 0),
    }
    aliases = [alias("archived_ok", "survivor")]
    assert qc.is_archived_duplicate_group(slugs, curated, aliases) is False


def test_predicate_holds_for_a_clean_archived_pair():
    slugs = ["survivor", "archived"]
    curated = {
        "survivor": trick("survivor", "shared name", 1),
        "archived": trick("archived", "shared name", 0),
    }
    aliases = [alias("archived", "survivor")]
    assert qc.is_archived_duplicate_group(slugs, curated, aliases) is True


def test_predicate_is_false_when_no_row_is_active():
    slugs = ["archived_a", "archived_b"]
    curated = {
        "archived_a": trick("archived_a", "shared name", 0),
        "archived_b": trick("archived_b", "shared name", 0),
    }
    aliases = [alias("archived_b", "archived_a")]
    assert qc.is_archived_duplicate_group(slugs, curated, aliases) is False
