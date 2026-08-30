"""
Who is entitled to retire a freestyle trick row.

The freestyle tables were once a pure function of committed inputs, so every
loader could clear its table and repopulate it. That stopped being true when
curators gained the ability to create a canonical trick through the publication
funnel: a row can now exist that no committed input carries, and absence from a
file is no longer evidence that a row is stale.

It was never true across the committed producers either. Three of them create
trick rows and each owns a different part of the dictionary, so "delete the rows
my input no longer carries" is only safe when it can be scoped to the rows that
producer actually created. A single committed-or-curator flag cannot do that: the
base dictionary owns a small minority of rows, and such a flag would let its
reload delete everything the other two produced.

Hence one column naming the owner, and this module as the single place that
answers what an owner may do. Ownership is the CURRENT right to retire, not a
historical record of first insertion: it can move between committed producers
when an input moves, and this module is where that move is permitted or refused.

Two rules hold whatever else changes. A producer retires only rows it owns, so an
unowned row is never anybody's to delete. And curator ownership is never taken
away by a refresh, because a rebuild reading committed files has no standing to
decide that a curator's work is stale.
"""
from __future__ import annotations

# The producers that create trick rows. The database CHECK carries the same four
# values; adding one means adding it in both places.
BASE_DICTIONARY = "base-dictionary"
EXPERT_ADDITIONS = "expert-additions"
FOOTBAG_ORG_PENDING = "footbag-org-pending"
CURATOR_PUBLICATION = "curator-publication"

#: Producers whose rows come from committed inputs and are refreshed from them.
COMMITTED_PRODUCERS = frozenset({
    BASE_DICTIONARY,
    EXPERT_ADDITIONS,
    FOOTBAG_ORG_PENDING,
})

#: Every value the column accepts.
ALL_PRODUCERS = COMMITTED_PRODUCERS | {CURATOR_PUBLICATION}


def is_valid_producer(value) -> bool:
    """True for a value the column accepts, NULL excluded."""
    return value in ALL_PRODUCERS


def may_retire(row_producer, acting_producer: str) -> bool:
    """May `acting_producer` delete a row owned by `row_producer`?

    Only its own rows, and only when it is a committed producer refreshing from
    its input. An unclassified row (NULL) belongs to nobody and is therefore
    never deletable: that is the protected default, not an oversight, and it is
    what makes a failed or partial classification safe rather than destructive.
    """
    if row_producer is None:
        return False
    if acting_producer not in COMMITTED_PRODUCERS:
        return False
    return row_producer == acting_producer


def may_transfer_ownership(current_producer, new_producer: str) -> bool:
    """May ownership move from `current_producer` to `new_producer`?

    Between committed producers, yes: an input can legitimately hand a row over,
    and a later reconciliation step needs to record that in place rather than by
    deleting and re-creating the row, which would break every reference to it.

    Away from a curator, never. A refresh reading committed files has no standing
    to decide that a curator's trick has become the pipeline's. An unclassified
    row is claimable, because claiming one is what backfill does.
    """
    if current_producer == CURATOR_PUBLICATION:
        return False
    if new_producer not in COMMITTED_PRODUCERS:
        return False
    return current_producer is None or current_producer in COMMITTED_PRODUCERS
