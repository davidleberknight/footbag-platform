# Representation-Strength Analysis

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. It sorts the structural coordinates by how faithfully the operational notation represents each, into high-fidelity, weakly-represented, and cannot-currently-be-represented regions, measured against the 895 active movements. It describes strength; it does not criticize or recommend. Companion to `VOLUME_III.md`, `representation_catalog.csv`, and `INFORMATION_LOSS_MAP.md`.

## High-fidelity regions

Coordinates the notation writes explicitly and consistently, wherever the structure occurs. A reader recovers these from the notation directly.

- **The landing.** The terminal surface and its delay are written in 97% of movements; the endpoint is the single best-represented coordinate.
- **The dexterity event and its direction.** A dexterity is written in 93% of movements, and its direction, including the rotational and backward directions, is fully written.
- **The scored modifiers.** Cross-body (53%) and body operators (59%) are explicit wherever present.
- **Simultaneity.** The sequence-versus-overlap distinction is written in a quarter of movements and is unambiguous where it appears.
- **Scoring.** The additive value is recoverable exactly from the count of scored brackets; the notation's spine is high-fidelity for score.

These regions are why the notation is a precise instrument for what it represents: the scored structure and the family-distinguishing coordinates are recorded with little loss.

## Weakly-represented regions

Coordinates the notation writes sometimes, or writes only relative to something it does not record, so recovery is partial or conditional.

- **Dex side.** The relative side is written on every dexterity, but the frame it is relative to is never recorded, and 40 movements write the side as deliberately ambiguous. The side is strong as a relative token and weak as an absolute coordinate.
- **Stance and facing.** Written for a marked minority (stance ~19%, facing ~28%) and defaulted otherwise, so a non-default that goes unmarked is lost.
- **Launch surface.** Strong for a concrete launch, absent for the generic set launch.
- **The intermediate carriage.** Never written; recoverable only by inference under a transition rule the grammar does not supply, so it is weak by derivation, not by token.

These regions are representable in principle from the tokens the notation already has, but only partially realized or only relative to an unrecorded reference.

## Regions that cannot currently be represented

Coordinates for which the notation has no vocabulary at all, so they are absent from every movement.

- **The reference frame (absolute foot).** No token; absent from 100% of movements.
- **The support leg and the free leg.** No token; absent from 100% of movements.
- **Fine rotational phase.** No token for continuous phase between events.
- **Bag height and trajectory.** No token; outside the notation's design.

These regions cannot be recovered from the notation by any inference, because there is nothing in the vocabulary to infer from. They are the hard edge of the notation's representational reach.

## The strength gradient

The gradient is not random; it tracks scoring and identity. The coordinates represented with high fidelity are exactly those that bear on the score (the scored events and modifiers) and those that distinguish trick families (surface, direction). The weakly-represented coordinates are the ones that matter to a movement but only sometimes to its score or name (stance, facing, side-relative-to-frame). The unrepresentable coordinates are the ones that matter to a movement and never to its score or name (the absolute frame, the legs, the fine phase). Representation strength falls off precisely as a coordinate's relevance to scoring and identity falls off, which is the clearest single sign of what the notation is built to do.
