"""
test_freestyle_record_resolution_cohort.py
==========================================

A competition record reaches a page, or it is one of the names known not to.

A record lands on a trick's page by its recorded trick name matching that trick,
directly or through the alias table. A name that matches neither leaves the
record in the database and on no page at all: it is not an error anywhere, it
renders nowhere, and nothing says so. The curated record files carry no producing
pipeline, so a spelling that drifts from the dictionary is invisible from both
ends.

This does not assert that every record resolves, because some legitimately do
not: the dictionary is missing tricks the records know about, and two of the
names are not tricks at all. It asserts that the set of names resolving to
nothing stays the adjudicated one below, each carrying the reason it is there and
what would take it out. An unlisted name fails on purpose.

Resolving onto a RETIRED trick is a separate case and is refused outright. A
retired row is not published, so a record folded onto one renders nowhere while
appearing to resolve. The remedy is an alias from the record's spelling onto the
trick that superseded it, which is what retiring a duplicate is supposed to leave
behind.

Reads the built database; skips when it is absent.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_record_resolution_cohort.py -v
"""
import re
import sqlite3

from built_db import DB_PATH, require_loaded


# Record names that legitimately reach no trick page, each with the reason and
# the thing that would remove it. Three kinds, and they are not interchangeable:
# clearing the omissions would leave the other three standing.
ADJUDICATED_UNRESOLVED = {
    # Recorded omissions: the observational reconciliation carries each of these
    # as a trick the dictionary is missing, awaiting curator review, at the ADD
    # the record itself carries. Promotion through that review removes them.
    "double_dyno":                   "omission awaiting review; reads as a doubled reverse same-side blender",
    "double_whip":                   "omission awaiting review; reads as a doubled reverse same-side whirl",
    "solestice":                     "omission awaiting review; reads as an osis flapper",
    "toe_spinning_toe":              "omission awaiting review; a two-add toe-to-toe spinning trick",
    # Doctrine hold: the same technical name and count as a reconciliation row
    # held under the unresolved coexistence of the compressed and the
    # structurally explicit spelling of this family. Naming it canonically would
    # double an operator, which is the part that is not settled.
    "stepping_ducking_blurry_whirl": "held pending the blurry and stepping coexistence ruling",
    # Not tricks: these name record categories, the most consecutive unique
    # dexterities at an add tier, under the recording source's own tier names.
    # Nothing removes these.
    "unique_beastly":                "a record category, not a trick: unique six-add",
    "unique_fearless":               "a record category, not a trick: unique five-add",
}

# Confidence levels a record must carry to be published. A provisional or
# disputed row is not on a public page whether or not it resolves, so it is not
# this guard's business.
PUBLIC_CONFIDENCE = ("verified", "probable")

NON_ALNUM_RUN_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    return NON_ALNUM_RUN_RE.sub("_", (name or "").lower()).strip("_")


def _resolution():
    """Every public record's recorded name, sorted into how it resolves."""
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        active = {r[0] for r in conn.execute(
            "SELECT slug FROM freestyle_tricks WHERE is_active = 1")}
        inactive = {r[0] for r in conn.execute(
            "SELECT slug FROM freestyle_tricks WHERE is_active = 0")}
        aliases = {r[0]: r[1] for r in conn.execute(
            "SELECT alias_slug, trick_slug FROM freestyle_trick_aliases")}
        placeholders = ",".join("?" for _ in PUBLIC_CONFIDENCE)
        records = conn.execute(
            f"SELECT trick_name FROM freestyle_records "
            f"WHERE confidence IN ({placeholders}) AND superseded_by IS NULL "
            f"AND trick_name IS NOT NULL AND TRIM(trick_name) <> ''",
            PUBLIC_CONFIDENCE,
        ).fetchall()
    finally:
        conn.close()

    landed, retired, unresolved = [], [], set()
    for (name,) in records:
        slug = _slugify(name)
        target = aliases.get(slug, slug)
        if target in active:
            landed.append(name)
        elif target in inactive:
            retired.append((name, target))
        else:
            unresolved.add(slug)
    return landed, retired, unresolved


def test_no_public_record_folds_onto_a_retired_trick():
    require_loaded("freestyle_records")
    landed, retired, _ = _resolution()

    # Floor before the verdict: with no public records at all, finding none on a
    # retired trick says nothing.
    assert landed or retired, "no public record resolves anywhere, so nothing was checked."

    assert not retired, (
        f"{len(retired)} public record(s) fold onto a retired trick, so they render "
        "nowhere: "
        + ", ".join(f"{name!r} -> {slug}" for name, slug in sorted(retired))
        + ". Add an alias from the record's spelling onto the trick that superseded "
        "the retired row."
    )


def test_unresolved_public_records_stay_within_the_adjudicated_cohort():
    require_loaded("freestyle_records")
    landed, _, unresolved = _resolution()

    assert landed, "no public record reaches a trick page, so the corpus is not loaded."

    unlisted = sorted(unresolved - set(ADJUDICATED_UNRESOLVED))
    assert not unlisted, (
        f"{len(unlisted)} record name(s) reach no trick page and are not adjudicated: "
        f"{unlisted}. A record whose name resolves to neither a trick nor an alias is "
        "in the database and on no page. Either give it the alias or the dictionary "
        "row it needs, or add it here with the reason it legitimately reaches nothing."
    )

    # The other direction, so the list cannot quietly outlive its reasons: a name
    # that now resolves has been fixed, and its entry is stale rather than
    # harmless. Left in place it would excuse the same name silently the next
    # time it broke.
    resolved_after_all = sorted(set(ADJUDICATED_UNRESOLVED) - unresolved)
    assert not resolved_after_all, (
        f"{len(resolved_after_all)} adjudicated name(s) now reach a trick page: "
        f"{resolved_after_all}. Remove them from the cohort."
    )
