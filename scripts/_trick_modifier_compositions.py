"""
Per-trick modifier compositions: where a modifier is folk shorthand rather than
a fixed weight, and the trick it sits on decides which reading applies.

Most operators carry one contribution and the registry is the whole story. A few
are names people use loosely, and the same word means different structures on
different tricks. Those cannot be modelled by a weight at all, so this is where
the exceptions live: a modifier, the atoms it stands for on the named tricks,
and the tricks it applies to. Everything not named takes the ordinary registry
value.

The expansion is deliberately into atoms rather than a total. Each atom scores
from the same registry every other operator uses, so this file introduces no
weight of its own and cannot drift from the registry: it says which structure a
trick uses, never what that structure is worth.

Blurry is the case that exists. It defaults to +1 flat, which is the settled
reading: blurry implies stepping. Red pt8 ratified 'blurry = stepping paradox'
for four enumerated compounds, where it stands for the two-atom stack instead:
Blurry Whirl = Stepping Paradox Whirl = 5, Blurry Torque = Stepping Paradox
Torque = 6, Food Processor = Stepping Paradox Blender = 6, Blur = Stepping
Paradox Mirage = 4. The modifier registry keeps blurry as a +1 row, because
chain readings, glossary entries and other curator-facing surfaces still use it
as a single label; the decomposition applies only to the named tricks.

The allowlist is load-bearing rather than a formality. Blurriest is blurry
barfly, and it uses blurry as a single +1 dex-prefix on a two-dex barfly base,
not as the two-atom stack. Applying the stack to every blurry compound would
mis-derive it.

The named list is authority, not a heuristic. A trick joins it when a ruling puts
it there, never because its asserted total would fit. Two candidates are held out
for exactly that reason: nemesis, where furious = barraging + paradox is implied
by parallel structure but not explicitly ruled, and sumo, whose nuclear
composition is a genuine open question. Neither belongs here until it is settled.

This module is the single home for the list, imported rather than restated, so
the parser and the reconciliation workbook cannot answer the same question
differently.
"""
from __future__ import annotations

MODIFIER_COMPOSITIONS: dict[str, dict] = {
    "blurry": {
        "atoms": ["stepping", "paradox"],
        "targets": frozenset({
            "blur",
            "blurry_whirl",
            "blurry_torque",
            "food_processor",
        }),
    },
}


def _normalize(slug: str) -> str:
    """A slug in the form the trick tables use.

    Trick slugs are underscore-separated, and the same names are written with
    hyphens in plenty of places a caller might take one from. Membership is
    tested on the normalized form so a caller passing either spelling gets the
    same answer, rather than a silent miss that reads as "this trick is not
    named" and quietly applies the default reading.
    """
    return (slug or "").strip().lower().replace("-", "_")


def composition_atoms(modifier_slug: str, trick_slug: str | None) -> list[str] | None:
    """The atoms `modifier_slug` stands for on `trick_slug`, or None.

    None means the ordinary registry value applies, which is the answer for
    every modifier and every trick not named above.
    """
    composition = MODIFIER_COMPOSITIONS.get(_normalize(modifier_slug))
    if not composition:
        return None
    if _normalize(trick_slug) not in composition["targets"]:
        return None
    return list(composition["atoms"])
