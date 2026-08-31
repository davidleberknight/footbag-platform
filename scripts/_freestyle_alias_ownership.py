"""
Who is entitled to rewrite a freestyle alias row.

The alias table had no owner column, so each loader used whatever scope was
nearest to hand: three deleted by the provenance source they happened to write,
and one deleted by alias slug regardless of who owned the row. That worked while
committed files were the only writer. It stopped working when the application
gained an alias editor, because a curator's edit sat on a row still carrying the
source a loader deletes by, and the next refresh removed it.

Provenance is not authority. `source_id` says where the evidence came from, and
a curator may legitimately record an alias on the strength of the expert review;
a committed row may cite no source at all. Owning the row and citing a source are
different facts, and using one as the other is what made curator work deletable.

Hence this module, alongside the trick-ownership one it deliberately mirrors: the
same shape of question, the same two rules. A committed producer rewrites only
rows it owns, and nothing a rebuild reads may take a row from a curator.

Ownership is the CURRENT right to rewrite, not a record of who first inserted.
A curator editing a committed alias takes ownership of it, because an editor that
leaves the row committed-owned is an editor whose work the next refresh may
legally discard.
"""
from __future__ import annotations

# The producers that write alias rows. The database CHECK carries the same five
# values; adding one means adding it in both places.
BASE_DICTIONARY = "base-dictionary"
EXPERT_ADDITIONS = "expert-additions"
ALIAS_ADDITIONS = "alias-additions"
FOOTBAG_ORG_PENDING = "footbag-org-pending"
# Application authority, not publication. An alias is created and edited through
# the application on its own terms, with no publication event behind it, so the
# trick column's 'curator-publication' would describe most alias rows falsely.
CURATOR_APPLICATION = "curator-application"

#: Producers whose rows come from committed inputs and are refreshed from them.
COMMITTED_PRODUCERS = frozenset({
    BASE_DICTIONARY,
    EXPERT_ADDITIONS,
    ALIAS_ADDITIONS,
    FOOTBAG_ORG_PENDING,
})

#: Every value the column accepts.
ALL_PRODUCERS = COMMITTED_PRODUCERS | {CURATOR_APPLICATION}


def is_valid_producer(value) -> bool:
    """True for a value the column accepts. The column is NOT NULL, so None is not."""
    return value in ALL_PRODUCERS


def may_rewrite(row_producer, acting_producer: str) -> bool:
    """May `acting_producer` update or delete a row owned by `row_producer`?

    Only its own rows, and only when it is a committed producer refreshing from
    its input. A curator's row is never rewritten by a rebuild, and an
    unrecognised owner is refused rather than assumed: the column is NOT NULL
    precisely so that an unstamped row is a loud error and not a free one.
    """
    if acting_producer not in COMMITTED_PRODUCERS:
        return False
    if row_producer not in ALL_PRODUCERS:
        return False
    return row_producer == acting_producer


def describe_refusal(alias_slug: str, row_producer, acting_producer: str) -> str:
    """Why a rewrite was refused, in terms an operator can act on."""
    if row_producer == CURATOR_APPLICATION:
        return (
            f"{alias_slug!r} is owned by a curator and {acting_producer!r} may not "
            "rewrite it. A curator's alias exists in no committed file, so a rebuild "
            "replacing it would destroy the only copy. Rename the committed alias, "
            "or have the curator retire theirs on purpose."
        )
    return (
        f"{alias_slug!r} is owned by {row_producer!r} and {acting_producer!r} may not "
        "rewrite it. Each committed producer refreshes only the rows it created; "
        "two inputs claiming one alias slug is a conflict in the inputs themselves."
    )
