"""
test_symbolic_grammar_slug_literals.py
======================================

The symbolic-grammar generator names tricks by slug in lookup tables, in the
membership rules, and in its hand-authored cluster and example lists. Those names
have to be spelled the way the dictionary spells them, or the lookup silently
matches nothing.

Silently is the problem. A slug literal that never matches raises no error and
prints no warning; the row it was meant to classify simply stops appearing, and
the generator reports a healthy-looking total built from everything else. That is
how a whole family of tricks came to be dropped from the artifact for a long time
while the coverage figure still read as normal: the literals were written with
hyphens, the dictionary spells slugs with underscores, and nothing connected the
two.

This guard pins the spelling against the dictionary itself rather than against a
list of known-bad names, so it covers literals nobody has thought about yet. It
reads every hyphenated word in the generator and fails if underscoring it would
name an active trick, which is the exact shape of the defect: a name that looks
like a slug, is one letter away from a real slug, and matches nothing.

Group identifiers keep their hyphens and are unaffected, because a group
identifier is not the name of a trick and underscoring one does not produce a
slug that exists.

Reads the built database; skips when it is absent, and fails instead of skipping
in a run that declares a database is required.

Run from repo root:
    python -m pytest legacy_data/tests/test_symbolic_grammar_slug_literals.py -v
"""
import re
import sqlite3

from built_db import DB_PATH, REPO_ROOT, require_loaded

GENERATOR = REPO_ROOT / "freestyle" / "scripts" / "build_symbolic_grammar_2.py"

# Any lowercase hyphenated word: group identifiers, prose and slug literals all
# match, and the database decides which of them names a trick.
HYPHENATED = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)+")


def _active_slugs():
    connection = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        return {row[0] for row in connection.execute(
            "SELECT slug FROM freestyle_tricks WHERE is_active = 1"
        )}
    finally:
        connection.close()


def test_no_hyphenated_literal_shadows_an_active_slug():
    require_loaded("freestyle_tricks")
    active = _active_slugs()
    source = GENERATOR.read_text(encoding="utf-8")

    shadowing = sorted({
        token for token in HYPHENATED.findall(source)
        if token.replace("-", "_") in active
    })

    assert not shadowing, (
        "these generator literals are hyphenated spellings of real trick slugs, so "
        "every lookup that uses them matches nothing and the tricks they name drop "
        "out of the artifact without any error: "
        + ", ".join(f"{t} -> {t.replace('-', '_')}" for t in shadowing)
    )


def test_the_dictionary_spells_slugs_with_underscores():
    # The guard above is only meaningful while the dictionary keeps this
    # convention. If slugs were ever hyphenated, hyphenated literals would be
    # correct and the check would have to be rewritten rather than quietly kept.
    require_loaded("freestyle_tricks")
    hyphenated_slugs = sorted(s for s in _active_slugs() if "-" in s)
    assert not hyphenated_slugs, (
        "the dictionary now contains hyphenated slugs, so the spelling convention "
        "this guard rests on has changed: " + ", ".join(hyphenated_slugs)
    )
