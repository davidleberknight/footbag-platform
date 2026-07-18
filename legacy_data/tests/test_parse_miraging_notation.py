"""
Regression: a compound whose name carries the retired 'miraging' nickname scores
its middle downtime inward dex from the operational notation, not from a name-token
operator weight (miraging is not a registered operator). Self-atom rows (the miraging
kick) and non-miraging compounds are unaffected.

Run: python -m pytest legacy_data/tests/test_parse_miraging_notation.py -v
"""
import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parents[2] / "freestyle" / "scripts"
sys.path.insert(0, str(_SCRIPTS))

import parse_freestyle_notation as p  # noqa: E402

CANON = {"butterfly": {"adds": 3}, "miraging_kick": {"adds": 1}}
WEIGHTS = {
    "atomic": {"add_bonus": 1, "add_bonus_rotational": 1},
    "gyro":   {"add_bonus": 1, "add_bonus_rotational": 1},
    # miraging is intentionally absent (zero weight): not a registered operator.
}


def _parse(core, mods, atom_resolved=False):
    return {
        "add_contributing_roles": {
            "core_family": [{"token": core, "atom_resolved": atom_resolved}],
            "set": [], "rotation": [],
            "modifier": [{"token": m} for m in mods],
        },
        "descriptive_roles": {"unresolved_tokens": []},
    }


def test_count_scoring_brackets_ignores_set_and_kick():
    assert p.count_scoring_brackets("SET > SAME TOE [DEL]") == 1
    assert p.count_scoring_brackets("SET > OP CLIP [XBD] [DEL]") == 2
    assert p.count_scoring_brackets(
        "TOE > OP OUT [DEX] > OP IN [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]") == 5
    assert p.count_scoring_brackets("SET > SAME SOLE [UNS] [KICK]") == 1  # KICK non-scoring


def test_miraging_compound_scores_from_notation():
    # butterfly(3) + atomic(1) + miraging(0) by name = 4, but the notation has 5
    # scoring brackets (the middle miraging inward dex is an explicit [DEX]).
    parse = _parse("butterfly", ["atomic", "miraging"])
    notation = "TOE > OP OUT [DEX] > OP IN [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]"
    computed, formula, _ = p.compute_formula(parse, CANON, WEIGHTS, notation)
    assert computed == 5
    assert "notation" in (formula or "")


def test_non_miraging_compound_uses_the_name_sum_not_the_notation():
    # No miraging token: the notation override must not apply, even when the bracket
    # count would differ from the name sum.
    parse = _parse("butterfly", ["gyro"])
    computed, _, _ = p.compute_formula(
        parse, CANON, WEIGHTS,
        "SET > A [DEX] > B [DEX] > C [DEX] > D [DEX] > E [DEX]")  # 5 brackets
    assert computed == 4  # butterfly(3) + gyro(1); name sum wins


def test_miraging_self_atom_kick_is_unaffected():
    # miraging_kick is a self-atom: it returns base_adds before the miraging rule.
    parse = _parse("miraging_kick", [], atom_resolved=True)
    computed, _, _ = p.compute_formula(
        parse, CANON, WEIGHTS, "SET > SAME [DEX] [KICK]")
    assert computed == 1
