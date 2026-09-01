"""
A trick name can carry a second core-family token after a complete base. That
trailing token is an operator acting on the base's terminal, not a second base,
and the parser must score it by what doctrine gives it.

Swirl is the one ruled case: appending it replaces the base's terminal clip with
one additional dex and scores one more than the base. A trailing token with no
defined contribution scores nothing and records a warning naming itself, so a
reader can tell an undefined operator from a real disagreement. Neither weight is
ever inferred from the asserted value of the row it appears on.

Run: python -m pytest legacy_data/tests/test_parse_terminal_core_family.py -v
"""
import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parents[2] / "freestyle" / "scripts"
sys.path.insert(0, str(_SCRIPTS))

import parse_freestyle_notation as p  # noqa: E402

# Asserted values as the dictionary carries them, so the expectations below are
# checked against real numbers rather than against convenient ones.
CANON = {
    "butterfly":   {"adds": 3},
    "drifter":     {"adds": 3},
    "montage":     {"adds": 7},
    "nemesis":     {"adds": 6},
    "swirl":       {"adds": 3},
    "dragon":      {"adds": 2},
    "double_swirl_dragon": {"adds": 4},
}
WEIGHTS = {
    "atomic":   {"add_bonus": 1, "add_bonus_rotational": 1},
    "pixie":    {"add_bonus": 1, "add_bonus_rotational": 1},
    "quantum":  {"add_bonus": 1, "add_bonus_rotational": 1},
    "stepping": {"add_bonus": 1, "add_bonus_rotational": 1},
    # barraging is intentionally absent: it is not in the registry, so it scores
    # nothing here exactly as it scores nothing in the dictionary.
}


def _parse(core_tokens, mods=(), sets=(), atom_resolved=False, policy=()):
    """A parse carrying one or more core-family tokens, in name order."""
    return {
        "add_contributing_roles": {
            "core_family": [{"token": t, "atom_resolved": atom_resolved}
                            for t in core_tokens],
            "set":      [{"token": s} for s in sets],
            "rotation": [],
            "modifier": [{"token": m} for m in mods],
        },
        "descriptive_roles": {"unresolved_tokens": []},
        "policy_tokens": list(policy),
    }


def _compute(parse):
    return p.compute_formula(parse, CANON, WEIGHTS, "")


# ── The trailing swirl scores, and the base alone no longer stands in for it ──

def test_trailing_swirl_scores_one_more_than_the_base():
    computed, formula, warnings = _compute(_parse(["montage", "swirl"]))
    assert computed == 8, "montage swirl is asserted 8; the appended dex is the 8th"
    assert "swirl(+1 terminal)" in formula
    assert warnings == []


def test_the_appended_dex_is_worth_one_whatever_the_base_is_worth():
    # The contribution belongs to the operator, so it does not scale with the
    # base. A base-relative reading would still fit any single row.
    assert _compute(_parse(["drifter", "swirl"]))[0] == 4
    assert _compute(_parse(["butterfly", "swirl"]))[0] == 4
    assert _compute(_parse(["nemesis", "swirl"]))[0] == 7


def test_a_trailing_swirl_composes_with_the_modifiers_on_the_same_name():
    # stepping butterfly swirl: stepping(+1) + butterfly(3) + the appended dex.
    computed, formula, _ = _compute(_parse(["butterfly", "swirl"], mods=["stepping"]))
    assert computed == 5
    assert "stepping(+1)" in formula and "swirl(+1 terminal)" in formula


def test_the_trailing_swirl_is_not_counted_as_a_second_base():
    # Scoring it as a base would add swirl's own asserted 3 rather than one dex.
    assert _compute(_parse(["butterfly", "swirl"]))[0] == 4


# ── Swirl as the base itself is untouched ────────────────────────────────────

def test_swirl_as_the_only_core_family_token_scores_as_the_base():
    computed, formula, warnings = _compute(_parse(["swirl"], mods=["atomic"]))
    assert computed == 4, "atomic swirl is atomic(+1) on the swirl base"
    assert "terminal" not in formula, "swirl is the base here, not an appended dex"
    assert warnings == []


def test_a_bare_base_is_unchanged():
    assert _compute(_parse(["butterfly"]))[0] == 3


# ── A trailing token nothing has ruled scores nothing, and says so ───────────

def test_a_trailing_dragon_adds_nothing_and_names_itself_in_a_warning():
    # dragon names the set the trick is entered from, an entry surface rather
    # than an appended terminal, so swirl dragon scores as swirl does.
    computed, formula, warnings = _compute(_parse(["swirl", "dragon"]))
    assert computed == 3
    assert "dragon" not in formula
    assert warnings == ["terminal_token_without_defined_contribution:dragon"]


def test_the_dragon_rows_are_right_for_a_stated_reason_not_by_luck():
    # All three reach their asserted value, and each records why the trailing
    # token contributed nothing. Silence here would be the defect this fixes.
    for core, asserted in (("swirl", 3), ("butterfly", 3)):
        computed, _, warnings = _compute(_parse([core, "dragon"]))
        assert computed == asserted
        assert warnings == ["terminal_token_without_defined_contribution:dragon"]


def test_an_undefined_trailing_token_never_takes_the_weight_that_would_fit():
    # A row asserted 4 on a base of 3 would "need" +1 from dragon. The parser
    # must not supply it: the fit is arithmetic, not evidence.
    computed, _, warnings = _compute(_parse(["butterfly", "dragon"]))
    assert computed == 3
    assert warnings == ["terminal_token_without_defined_contribution:dragon"]


# ── The fix reaches rows whose totals hid it ─────────────────────────────────

def test_a_policy_bearing_row_gets_the_appended_dex_and_keeps_its_policy_token():
    # quantum butterfly swirl: the policy token is untouched by the arithmetic,
    # so the row still classifies as policy-dependent on it.
    parse = _parse(["butterfly", "swirl"], mods=["quantum"], policy=["quantum"])
    computed, _, _ = _compute(parse)
    assert computed == 5
    assert parse["policy_tokens"] == ["quantum"]


def test_an_unregistered_modifier_still_scores_nothing_after_the_fix():
    # barraging butterfly swirl is asserted 6. The appended dex is now counted,
    # which moves it from three under to two; the rest is barraging, which has
    # no registered weight and must not acquire one here.
    computed, _, _ = _compute(_parse(["butterfly", "swirl"], sets=["barraging"]))
    assert computed == 4


# ── Boundaries ───────────────────────────────────────────────────────────────

def test_a_self_atom_row_ignores_its_trailing_token_entirely():
    # The whole name resolved to one canonical, so its asserted value stands and
    # no part of the name is scored separately.
    computed, formula, warnings = _compute(
        _parse(["double_swirl_dragon"], atom_resolved=True))
    assert computed == 4
    assert "self-atom" in formula
    assert warnings == []


def test_a_row_with_an_unresolved_token_still_computes_nothing():
    parse = _parse(["butterfly", "swirl"])
    parse["descriptive_roles"]["unresolved_tokens"] = [{"token": "wonton"}]
    assert _compute(parse) == (None, None, [])


def test_three_core_family_tokens_score_every_trailing_one():
    # Nothing in the rule is limited to the second token.
    computed, _, warnings = _compute(_parse(["butterfly", "swirl", "dragon"]))
    assert computed == 4
    assert warnings == ["terminal_token_without_defined_contribution:dragon"]


def test_the_parse_is_deterministic():
    parse = _parse(["montage", "swirl"])
    assert _compute(parse) == _compute(parse)
