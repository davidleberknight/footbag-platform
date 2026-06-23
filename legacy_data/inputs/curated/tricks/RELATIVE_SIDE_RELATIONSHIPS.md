# Relative-Side Relationships

Doctrine note. Records only what is strongly evidenced from the corpus and notation
as of 2026-06-22. Downstream consequences that are not yet settled (whether a
same-side form is an alias, whether a missing same-side baseline should be
authored, how a name selects its reference dex in multi-dex tricks) are out of
scope and live in OPEN_QUESTIONS.md.

## The relationship

A side qualifier on a trick name describes the relationship between a dex and its
reference component (the plant / set foot), not a left/right body position, a
catch surface, or a naming variant.

- **Near = Same-Side.** The dex is on the same side of the body as the reference
  component.
- **Far = Opposite-Side.** The dex is on the opposite side from the reference
  component.

## SAME / OP already encode this in the notation

The operational notation's per-dex side marker is the doctrine, already
implemented:

- `SAME` = "step on same side as plant foot" (near / same-side)
- `OP` = "step on opposite side from plant foot" (far / opposite)

(`src/services/operationalNotationRendering.ts`, `notationRendering.ts`.)

The name's qualifier matches the marker on the differentiating dex, every observed
case:

| Name | Differentiating dex | Marker |
|---|---|---|
| `terraging-same-clipper` | clipper catch | `SAME CLIP` |
| `terraging-opposite-clipper` | clipper catch | `OP CLIP` |
| `fairy-same-side-mirage` | 2nd dex | `SAME IN` |
| `fairy-mirage` (baseline) | 2nd dex | `OP IN` |
| `pixie-opposite-clipper` | clipper catch | `OP CLIP` |

The distinction is real: `SAME` and `OP` forms are different executions even when
they carry the same ADD (`terraging-same-clipper` and `terraging-opposite-clipper`
are both 4 ADD; `fairy-same-side-mirage` and `fairy-mirage` are both 3 ADD).

## OP and X-Dex are independent

An `OP` (far) dex does not by itself add ADD. X-Dex is a separate flag (`[XDEX]`),
not implied by `OP`:

- `terraging-opposite-clipper` — `OP CLIP`, ADD 4, no `[XDEX]`.
- `atomic-butterfly` — both dexes `OP OUT`, ADD 4, no `[XDEX]`.

## X-Dex remains receiver-gated

`[XDEX]` is defined as a "conditional +1 on an eligible far-form **receiver** dex."
It fires only when the far/`OP` dex lands on an eligible rotating receiver
(mirage, illusion, whirl, torque, drifter), not on every far dex:

- `atom-smasher` (atomic far mirage) — `OP IN [DEX] [XDEX]`, ADD 4 (mirage is a
  receiver).
- `sumo` (nuclear far mirage) — `OP IN [DEX] [XDEX]` (and a separate `[PDX]`).
- `atomic-butterfly` / `terraging-opposite-clipper` — `OP` but non-receiver, no
  `[XDEX]`.

This is consistent with Red's confirmation that Atomic Mirage / Illusion / Torque /
Drifter each differ from their Far forms because the far form is more work.

## PDX is a separate concept that can coexist with OP and X-Dex

`[PDX]` (the paradox-direction marker) is a third member of the per-dex side
relationship, distinct from `SAME`/`OP` and from `[XDEX]`, and it can coexist with
both on one trick: `sumo` carries a `[PDX]` dex and a separate `OP IN [DEX] [XDEX]`
dex. Paradox is not a value of the near/far axis; it is the case where the side
relationship switches, scored on its own terms, independent of the same/opposite
distinction and of X-Dex.

## The identity layer currently contradicts the notation layer

The notation distinguishes `SAME` from `OP`, but the name / identity layer strips
the qualifier as non-identity:

- `src/services/freestyleRecordShaping.ts` removes a trailing
  `(ss | op | opp | opposite | near | far | same side)` qualifier, commented as
  "never changes" the identity.
- The slug-normalization convention likewise treats `(same side)/(op)/(far)/(near)`
  as not changing the slug.

So a far/opposite form and its same-side form can collapse to the same identity in
the name layer while the notation layer keeps them distinct. Reconciling the two
layers is downstream work, tracked separately; this note records only that the
contradiction exists and that the notation layer is the one already carrying the
distinction.
