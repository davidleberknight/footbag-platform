"""
A few modifiers are folk shorthand rather than fixed weights: the same word means
a different structure depending on the trick it sits on. Those are scored per
trick from a named list, and every trick not on that list takes the ordinary
registry value.

Blurry is the case. It defaults to +1 flat, and on four named tricks it stands
for the two-atom stepping-plus-paradox stack instead. The atoms score from the
same registry every other operator uses, so nothing here carries a weight of its
own, and the named list decides only which structure applies.

The failure this guards against is the tempting one: promoting every blurry
compound to the two-atom reading. That would fix rows whose totals happen to fit
and mis-derive blurriest, which takes the flat reading and is correct as it is.

Run: python -m pytest legacy_data/tests/test_parse_per_trick_composition.py -v
"""
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO / "freestyle" / "scripts"))
sys.path.insert(0, str(_REPO / "scripts"))

import parse_freestyle_notation as p  # noqa: E402
import _trick_modifier_compositions as comp  # noqa: E402

CANON = {
    "whirl":   {"adds": 3},
    "torque":  {"adds": 4},
    "drifter": {"adds": 3},
    "barfly":  {"adds": 4},
}
WEIGHTS = {
    "blurry":    {"add_bonus": 1, "add_bonus_rotational": 1},
    "stepping":  {"add_bonus": 1, "add_bonus_rotational": 1},
    "paradox":   {"add_bonus": 1, "add_bonus_rotational": 1},
    "symposium": {"add_bonus": 1, "add_bonus_rotational": 1},
}
CORE = set(CANON)


def _score(name, slug):
    parse = p.parse_trick(name, slug, CANON, CORE)
    computed, formula, _ = p.compute_formula(parse, CANON, WEIGHTS, "")
    return computed, formula, parse


# ── A named trick takes the two-atom reading ─────────────────────────────────

def test_a_named_trick_expands_blurry_into_its_two_atoms():
    computed, formula, _ = _score("blurry whirl", "blurry_whirl")
    assert computed == 5, "blurry whirl is asserted 5: two atoms on a whirl"
    assert "stepping(+1)" in formula and "paradox(+1)" in formula
    assert "blurry(" not in formula, "the shorthand must not also score as itself"


def test_the_other_named_trick_takes_the_same_reading():
    computed, formula, _ = _score("blurry torque", "blurry_torque")
    assert computed == 6
    assert "stepping(+1)" in formula and "paradox(+1)" in formula


def test_the_atoms_come_from_the_registry_not_from_this_list():
    # Change what stepping is worth and the total follows, which is what makes
    # the registry the single source of every weight.
    parse = p.parse_trick("blurry whirl", "blurry_whirl", CANON, CORE)
    heavier = dict(WEIGHTS, stepping={"add_bonus": 5, "add_bonus_rotational": 5})
    assert p.compute_formula(parse, CANON, heavier, "")[0] == 9


# ── An unnamed trick keeps the flat reading ──────────────────────────────────

def test_an_unnamed_trick_keeps_the_ordinary_flat_reading():
    computed, formula, _ = _score("blurry drifter", "blurry_drifter")
    assert computed == 4, "the default reading is blurry(+1) on drifter(3)"
    assert "blurry(+1)" in formula
    assert "stepping" not in formula and "paradox" not in formula


def test_no_blurry_compound_is_promoted_merely_because_the_total_would_fit():
    # blurry drifter is asserted 5 and the two-atom reading would produce it.
    # Being unnamed is the whole answer; a fitting total is not a ruling.
    assert _score("blurry drifter", "blurry_drifter")[0] == 4


def test_the_flat_counterexample_is_not_disturbed():
    # blurriest is asserted 5 and takes blurry as +1 flat on barfly. The two-atom
    # reading would make it 6, which is the mis-derivation this list prevents.
    computed, formula, _ = _score("blurry barfly", "blurriest")
    assert computed == 5
    assert "blurry(+1)" in formula


# ── The row says which ruling it used ────────────────────────────────────────

def test_a_named_trick_records_the_ruling_it_applied():
    _, _, parse = _score("blurry whirl", "blurry_whirl")
    assert "per_trick_composition:blurry=stepping+paradox" in parse["parse_warnings"], (
        "a reader must be able to tell a per-trick ruling from a universal weight")
    assert "per_trick_composition_expanded" in parse["additive_flags"]


def test_the_shorthand_written_in_the_name_survives_the_expansion():
    _, _, parse = _score("blurry whirl", "blurry_whirl")
    expanded = [t for bucket in ("set", "modifier")
                for t in parse["descriptive_roles"][bucket]]
    assert {t["token"] for t in expanded} == {"stepping", "paradox"}
    assert all(t["expanded_from"] == "blurry" for t in expanded)


def test_an_unnamed_trick_records_no_ruling():
    _, _, parse = _score("blurry drifter", "blurry_drifter")
    assert not any("per_trick_composition" in w for w in parse["parse_warnings"])


# ── The shared list itself ───────────────────────────────────────────────────

def test_the_named_list_is_exactly_the_four_ruled_tricks():
    assert comp.MODIFIER_COMPOSITIONS["blurry"]["targets"] == frozenset(
        {"blur", "blurry_whirl", "blurry_torque", "food_processor"})
    assert comp.MODIFIER_COMPOSITIONS["blurry"]["atoms"] == ["stepping", "paradox"]


def test_membership_survives_either_slug_spelling():
    # The trick tables use underscores and the same names are written with
    # hyphens elsewhere. A spelling mismatch would read as "not named" and
    # silently apply the default reading, which is a wrong answer, not an error.
    assert comp.composition_atoms("blurry", "blurry_whirl") == ["stepping", "paradox"]
    assert comp.composition_atoms("blurry", "blurry-whirl") == ["stepping", "paradox"]
    assert comp.composition_atoms("blurry", "Blurry_Whirl") == ["stepping", "paradox"]


def test_an_unnamed_trick_or_unlisted_modifier_gets_no_composition():
    assert comp.composition_atoms("blurry", "blurry_drifter") is None
    assert comp.composition_atoms("blurry", None) is None
    assert comp.composition_atoms("stepping", "blurry_whirl") is None


def test_the_list_carries_no_weights_of_its_own():
    # Every atom must be something the registry can score. A number here would
    # be a second authority for what an operator is worth.
    for modifier, composition in comp.MODIFIER_COMPOSITIONS.items():
        assert set(composition) == {"atoms", "targets"}, modifier
        assert all(isinstance(a, str) for a in composition["atoms"]), modifier


# ── Both consumers read the one list ─────────────────────────────────────────

def _workbook():
    """The reconciliation workbook builder, loaded from its real path so its
    own repo-relative imports resolve."""
    import importlib.util
    path = _REPO / "legacy_data" / "scripts" / "build_trick_reconciliation_workbook.py"
    spec = importlib.util.spec_from_file_location("_wb_under_test", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["_wb_under_test"] = module
    spec.loader.exec_module(module)
    return module


def test_the_workbook_does_not_keep_its_own_copy_of_the_named_list():
    # Two copies of an allowlist are two answers waiting to diverge, and this
    # pair diverged silently once already.
    assert not hasattr(_workbook(), "MODIFIER_COMPOSITIONS")


def test_the_workbook_expands_the_named_tricks_and_leaves_the_rest_flat():
    wb = _workbook()
    canon = {"whirl": {"adds": 3}, "barfly": {"adds": 4}, "drifter": {"adds": 3}}
    named = wb.derive_add_math("blurry_whirl", "whirl", ["blurry"], canon, WEIGHTS)
    assert named[1] == 5 and "stepping(+1)" in named[0] and "paradox(+1)" in named[0]

    for slug, base, total in (("blurriest", "barfly", 5), ("blurry_drifter", "drifter", 4)):
        flat = wb.derive_add_math(slug, base, ["blurry"], canon, WEIGHTS)
        assert flat[1] == total and "blurry(+1)" in flat[0], slug


def test_both_consumers_agree_on_every_trick_they_are_asked_about():
    # The reason the list is shared at all: the parser and the workbook must not
    # be able to give different answers for the same trick.
    wb = _workbook()
    canon = {"whirl": {"adds": 3}, "drifter": {"adds": 3}}
    for slug, base, name in (("blurry_whirl", "whirl", "blurry whirl"),
                             ("blurry_drifter", "drifter", "blurry drifter")):
        from_workbook = wb.derive_add_math(slug, base, ["blurry"], canon, WEIGHTS)[1]
        from_parser = _score(name, slug)[0]
        assert from_workbook == from_parser, slug
