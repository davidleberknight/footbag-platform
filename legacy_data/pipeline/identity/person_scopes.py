"""Who owns each row in historical_persons, and what its disappearance means.

Every row in that table belongs to exactly one producer, and `source_scope` is
how the row says so. The value matters most when a row stops appearing in a
reseed, because the right response differs completely by owner.

CANONICAL
    A results-derived person. The id denotes a claimed identity. If such a row
    stops appearing while anything outside its loader references it, something
    has gone wrong upstream and the load fails closed rather than stranding the
    reference.

PROVISIONAL
    Derived from club or membership material by the enrichment loader, which
    reseeds its own cohort and is the only thing that may retire one.

UNRESOLVED_STUB
    A placeholder the seed builder mints for a participant display name nothing
    could resolve. Its id is a hash of the normalised name, so it asserts that a
    name went unmatched, never that a person exists. When the name is later
    corrected or matched, the stub SHOULD disappear: that is identity resolution
    working, not data loss. References built on a stub belong to the loader that
    built them and are rebuilt by that loader in the same run, after which the
    stub is retired by the sweep.

A NULL scope means the row never said who owns it. That is not a fourth cohort
and must never be treated as one: guessing an owner is what let unresolved stubs
be claimed as canonical, which deadlocked the reseed because the guard protecting
real identities then fired on placeholders that were only ever meant to be
temporary. Rows written before the scope was recorded are backfilled once, by
positive identification, and anything unexplained afterwards stops the load.
"""
from __future__ import annotations

CANONICAL = "CANONICAL"
PROVISIONAL = "PROVISIONAL"
UNRESOLVED_STUB = "UNRESOLVED_STUB"

#: Every scope a person row may legitimately carry.
KNOWN_SCOPES = frozenset({CANONICAL, PROVISIONAL, UNRESOLVED_STUB})

#: The cohorts the canonical seed loader reseeds and may therefore retire.
#: PROVISIONAL is absent by design: it belongs to the enrichment loader.
SEED_LOADER_SCOPES = frozenset({CANONICAL, UNRESOLVED_STUB})
