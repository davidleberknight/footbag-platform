"""
Some tokens in the dictionary are historical names for an operator rather than
operators in their own right. They expand to what they name, and the thing they
name scores from the registry as it always does, so the historical spelling
never carries a weight of its own.

Barraging is a historical name for the Furious set. Furious is the official
two-dex set and is registered at +2, so a barraging compound scores exactly what
the same compound built on Furious scores. Registering a weight against the
historical spelling would produce the same numbers while asserting something the
doctrine denies: that barraging is an operator.

Run: python -m pytest legacy_data/tests/test_parse_historical_operator_names.py -v
"""
import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parents[2] / "freestyle" / "scripts"
sys.path.insert(0, str(_SCRIPTS))

import parse_freestyle_notation as p  # noqa: E402

CANON = {
    "mirage":    {"adds": 2},
    "legover":   {"adds": 2},
    "butterfly": {"adds": 3},
    "eggbeater": {"adds": 3},
    "barfly":    {"adds": 4},
    "barraging_double_leg_over": {"adds": 5},
}
WEIGHTS = {
    "furious":   {"add_bonus": 2, "add_bonus_rotational": 2},
    "symposium": {"add_bonus": 1, "add_bonus_rotational": 1},
    "spinning":  {"add_bonus": 1, "add_bonus_rotational": 1},
    "stepping":  {"add_bonus": 1, "add_bonus_rotational": 1},
    # barraging is intentionally absent, and must stay absent: the whole point
    # is that it draws Furious's contribution rather than owning one.
}
CORE = set(CANON)


def _score(name, slug=None):
    """Parse a name end to end and return (computed, formula, parse)."""
    parse = p.parse_trick(name, slug or name.replace(" ", "_"), CANON, CORE)
    computed, formula, _ = p.compute_formula(parse, CANON, WEIGHTS, "")
    return computed, formula, parse


# ── Barraging scores as Furious, because it is Furious ───────────────────────

def test_a_barraging_compound_scores_the_furious_two_dex_set():
    computed, formula, _ = _score("barraging mirage")
    assert computed == 4, "barraging mirage is asserted 4: the set's two dexes on mirage"
    assert "furious(+2)" in formula


def test_a_barraging_compound_and_its_furious_equivalent_score_identically():
    # The two spellings name one set, so any difference between them would be
    # the historical name having acquired a contribution of its own.
    for base in ("mirage", "legover", "butterfly", "barfly", "eggbeater"):
        assert _score(f"barraging {base}")[0] == _score(f"furious {base}")[0]


def test_the_expansion_composes_with_the_other_operators_on_the_name():
    computed, formula, _ = _score("barraging symposium legover")
    assert computed == 5
    assert "furious(+2)" in formula and "symposium(+1)" in formula


# ── The historical spelling is preserved, not erased ─────────────────────────

def test_the_row_records_both_the_set_it_resolved_to_and_the_name_written():
    _, _, parse = _score("barraging mirage")
    sets = parse["descriptive_roles"]["set"]
    assert [s["token"] for s in sets] == ["furious"]
    assert sets[0]["expanded_from"] == "barraging", (
        "the name as written must survive in the parse, or a reader cannot tell "
        "which rows were spelled the historical way")
    assert "virtual_modifier_expanded" in parse["additive_flags"]


def test_barraging_never_reaches_the_formula_as_a_token_of_its_own():
    _, formula, parse = _score("barraging mirage")
    assert "barraging" not in formula
    assert all(t["token"] != "barraging"
               for bucket in parse["descriptive_roles"].values()
               if isinstance(bucket, list) for t in bucket)


# ── No independent weight, and no fall-through to unresolved ─────────────────

def test_barraging_carries_no_weight_of_its_own():
    assert "barraging" not in WEIGHTS
    assert "barraging" not in p.SET_TOKENS, (
        "routing barraging as a set of its own is what left it scoring nothing")


def test_barraging_does_not_fall_through_to_unresolved():
    # Dropping it from the set tokens without the expansion would make the token
    # unresolved, which collapses the row to a self-canonical atom and reports
    # the asserted value back as though it had been computed.
    _, _, parse = _score("barraging mirage")
    assert parse["descriptive_roles"]["unresolved_tokens"] == []
    assert "inferred_self_canonical_atom" not in parse["parse_warnings"]


def test_a_row_named_for_barraging_that_is_its_own_canonical_stays_a_self_atom():
    # This row resolves to itself and never reaches the arithmetic, so the
    # expansion must not change it.
    computed, formula, _ = _score("barraging double leg over",
                                  slug="barraging_double_leg_over")
    assert computed == 5
    assert "self-atom" in formula


# ── The shared expansion mechanism still serves its first user ───────────────

def test_surging_still_expands_to_a_spin_and_a_step():
    computed, formula, parse = _score("surging mirage")
    assert computed == 4, "spinning(+1) + stepping(+1) + mirage(2)"
    assert "spinning(+1)" in formula and "stepping(+1)" in formula
    assert "surging" not in formula


def test_every_expansion_target_is_something_that_can_actually_score():
    # An expansion pointing at a token no registry carries would score nothing
    # and look like a working normalization.
    for token, expansion in p.VIRTUAL_EXPANSIONS.items():
        for role, target in expansion:
            assert target in WEIGHTS, (
                f"{token} expands to {target}, which carries no registered weight")
