# Surface Frame — Notation Verification

Read-only check of the Surface Frame insight (registry row 6) against the live
dictionary's operational notation, before any public glossary prose is authored. No
production content changed; no UI; no tranche-2 entries.

## Method

Queried `freestyle_tricks.operational_notation` for the ten atoms (whip and
reverse-swirl resolve via aliases to `rev_whirl` and `rev_swirl`). Notation tokens:
`SET`/`TOE`/`CLIP` = entry surface; `SAME`/`OP` = side relative to the plant leg;
`IN`/`OUT`/`BACK SWIRL` = dex direction/form; `[DEX]` = dexterity; the trailing
`<surface> [DEL]` = the receiving surface (toe, or `CLIP [XBD]` = cross-body clipper).

## The live structures

| Trick | ADD | Operational notation | Side | Dex form | Catch surface |
|---|---|---|---|---|---|
| Mirage | 2 | `SET > OP IN [DEX] > OP TOE [DEL]` | OP | IN | toe |
| Illusion | 2 | `SET > OP OUT [DEX] > OP TOE [DEL]` | OP | OUT | toe |
| Legover | 2 | `SET > OP OUT [DEX] > SAME TOE [DEL]` | OP dex / SAME catch | OUT | toe |
| Pickup | 2 | `SET > OP IN [DEX] > SAME TOE [DEL]` | OP dex / SAME catch | IN | toe |
| Around the World | 2 | `TOE > SAME IN/OUT [DEX] > SAME TOE [DEL]` | SAME | IN/OUT (full orbit) | toe |
| Orbit | 2 | `TOE > SAME OUT [DEX] > SAME TOE [DEL]` | SAME | OUT | toe |
| Whirl | 3 | `SET > OP IN [DEX] > OP CLIP [XBD] [DEL]` | OP | IN | clipper (cross-body) |
| Whip (rev_whirl) | 3 | `CLIP > OP OUT [DEX] > OP CLIP [XBD] [DEL]` | OP | OUT | clipper |
| Swirl | 3 | `CLIP > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` | SAME | BACK SWIRL | clipper |
| Reverse Swirl (rev_swirl) | 3 | `CLIP > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]` | OP | BACK SWIRL | clipper |

## Per-claim verdict

**Claim 1 — Whirl is the clipper-context Mirage. → SUPPORTED (strongly).**
Mirage is `OP IN [DEX] → OP TOE`; whirl is `OP IN [DEX] → OP CLIP [XBD]`. Identical
side (OP), identical dex (IN), identical catch side (OP) — differing in exactly one
thing: the receiving surface (toe vs clipper). Whirl *is* mirage with a cross-body
clipper catch. This is the cleanest possible confirmation of "surface frame changes
meaning": one surface token, a different trick.

**Claim 2 — Swirl is the clipper-context Around the World. → SUPPORTED as a ROLE
analogy, not a mechanical identity. SOFTEN.**
Both are the pure same-side atom of their surface context: ATW is `SAME … → SAME TOE`;
swirl is `SAME … → SAME CLIP [XBD]`. By role (the same-side rotational atom), swirl is
ATW's clipper counterpart. But the dex *form* differs — ATW is a full-orbit `IN/OUT`
dex, swirl is a `BACK SWIRL` dex — so swirl is **not** a mechanical toe→clipper swap of
ATW the way whirl is of mirage. The mapping is real but asymmetric: whirl≈mirage is an
identity-minus-one-surface; swirl≈ATW is a same-role analogy. Prose must not present the
two mappings as equally tight.

**Claim 3 — Whirl/Whip and Swirl/Reverse-Swirl are direction pairs. → HALF SUPPORTED;
the swirl half is DISPROVEN by the live notation. CORRECT.**
Whirl `OP IN` vs whip `OP OUT`: same side, opposite direction — a clean direction pair. ✓
But swirl `SAME BACK SWIRL` vs reverse-swirl `OP BACK SWIRL`: **same direction form
(both BACK SWIRL), opposite side (SAME vs OP).** In the live data, reverse-swirl is the
op-side variant of swirl, *not* a direction reversal. So "Swirl / Reverse Swirl are
direction pairs" is contradicted by the notation. (This may be a limitation of
reverse-swirl's stored notation — the name implies a front/back reversal the notation
does not encode — but per the live data as it stands, it is a side pair.)

**Claim 4 — Swirl is not a clipper Legover. → SUPPORTED.**
A clipper legover would be legover's structure with a clipper catch: `OP OUT [DEX] →
SAME CLIP`. Swirl is `SAME BACK SWIRL [DEX] → SAME CLIP` — different dex side (SAME vs
OP) and different dex form (BACK SWIRL vs OUT). Swirl is not a clipper legover. The
negative claim holds.

**Claim 5 — Mirage/Legover :: Whirl/Swirl is the wrong grid. → SUPPORTED (confirmed
wrong).**
Mirage→legover changes *direction+catch-side* (`OP IN→OP TOE` vs `OP OUT→SAME TOE`).
Whirl→swirl changes *side+dex-form* (`OP IN` vs `SAME BACK SWIRL`). Different
transformations — the dex-form change in whirl→swirl has no analogue in mirage→legover.
The grid does not hold; the correct cross-surface mapping is whirl↔mirage and swirl↔ATW.
Do not teach the mirage/legover grid.

## Overall verdict

**The Surface Frame insight is SUPPORTED.** The core teaching — surface frame changes a
dex's meaning — is strongly confirmed by whirl≈mirage, and the negative claims (swirl ≠
clipper legover; the mirage/legover grid is wrong) both hold. Read the two swirl-type
specifics below through the refined curator clarification at the end of this note, which
supersedes them:

1. **The swirl / reverse-swirl notation observation stands as a data reading, not a
   verdict.** In the live notation the two differ by side (both `BACK SWIRL`, SAME vs OP),
   while doctrine treats them as a directionally-related pair. Swirl and reverse swirl are
   two directions of a shared terminal-dex logic, **not one family** — direction reversal
   generates a distinct family. That gap is a curator/doctrine verification item, **not**
   a reason to rewrite the row.
2. **Teach whirl≈mirage and swirl≈ATW at different strengths.** whirl≈mirage is an exact
   surface-swap; swirl≈ATW-like is a useful pedagogical analogy, not a mechanical identity.
   The load-bearing swirl-type terminal-dex fact is that the dexing leg is the catching leg.

## Proposed safe wording (for the eventual entry/essay)

- *Whirl is mirage's clipper-context twin — the same opposite-side in-dex, caught
  cross-body on the clipper instead of on the toe. This is the cleanest proof that the
  surface frame is part of a trick's meaning.*
- *Swirl is usefully thought of as the clipper world's version of Around the World — but
  loosely: it is a swirl-type terminal dex, not a mechanical copy of ATW. What actually
  defines a swirl-type ending is that the same leg that performs the dex also catches the
  bag, which is what sets it apart from whirl-type endings.*
- *Reverse swirl is swirl's direction reverse. It shares the swirl-type terminal-dex logic
  but is its own reverse-direction lineage, not a member of the swirl family — direction
  reversal makes a distinct family. Like the others, it can be the ending of a longer
  sequence rather than a trick on its own.*

## Registry changes made

`INSIGHT_REGISTRY.md` row 6 was updated to: (a) present swirl≈ATW-like and rev-swirl as
pedagogical analogies rather than exact ATW/Orbit equivalences; (b) state the load-bearing
swirl-type terminal-dex rule that the dexing leg is the catching leg, with the family guard
that direction reversal makes a distinct family; and (c) mark the stored `rev_swirl`
notation as a curator/doctrine verification item, not an automatic data fix.
The core insight wording — "surface frame changes meaning" — is unchanged and does not
overclaim a perfect mapping. No production glossary content or dictionary row was touched.

## Curator clarification (2026-07-06, refined — this supersedes any earlier resolution)

The reverse-swirl question was refined in two steps; this is the settled reading. **Do
not force swirl / reverse-swirl into a strict ATW / Orbit equivalence.**

- **Keep (pedagogy):** swirl is usefully understood as a **clipper-context ATW-like
  terminal dex**, and reverse swirl is its **direction-reversed counterpart**. The ATW /
  Orbit reading is a teaching aid, not a mechanical identity.
- **The load-bearing structural rule — this, not the analogy:** in swirl-type endings,
  **the dexing leg is also the catching leg.** That is the feature that distinguishes
  swirl-type endings from whirl-type endings (whirl / whip). Swirl and reverse swirl are
  also *terminal dexes* — they can end a longer sequence (`set > dex > … > swirl` /
  `… > reverse swirl`), so the point is how a terminal dex is read, not only about
  standalone atoms.
- **Family guard (the correction that prompted this pass):** the shared terminal-dex logic
  does **not** make swirl and reverse swirl one family. Direction reversal generates a
  distinct family/lineage — reverse swirl is its own reverse-direction family, the Orbit
  family is not the ATW family, and Whip is not the Whirl family — unless the dictionary
  doctrine explicitly rules a direction pair one family. Surface-frame analogy does not
  override family identity.
- **The ATW / Orbit analogy is not exact enough to rewrite operational notation.** My
  earlier claim that the stored notation "must be reconciled to a same-side
  reversed-swirl to match clipper-Orbit" over-reached and is **withdrawn**.

**Status of the stored `rev_swirl` notation — a curator / doctrine verification item, not
an automatic data fix.** The op-side back-swirl the row currently carries (`CLIP > OP BACK
SWIRL [DEX] > OP CLIP [XBD] [DEL]`) may or may not be right; settling it depends on the
dexing-leg-is-catching-leg doctrine, not on the ATW/Orbit analogy. **Do not change the
production `rev_swirl` row.** When the doctrine is confirmed, re-run this check. This was
and remains a read-only verification; no production row was touched.
