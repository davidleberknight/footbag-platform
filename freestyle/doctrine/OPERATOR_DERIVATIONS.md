# Evidence-derived operator rulings

Operator rulings established from the written record itself — source notations and
folk-name pairs — rather than from a new expert answer. Each ruling below carries its
full proof and the adversarial check it survived, so the derivation can be
re-inspected; the section after them states, just as explicitly, what was NOT
derived, so the boundary of what is proven stays visible. Source: the reduction
audit (2026-07-02) at `exploration/red-reduction-audit-2026-07-02/AUDIT.md`, its
"Proofs for every evidence-derived ruling" section.

Method: the burden of proof is on KEEPING a question in the expert queue. A ruling is
derived only when independent evidence converges and a competing reading is
positively excluded; where evidence ran out, the item stays with the expert or the
curator and says so. Operator ADD values themselves live in
`src/content/freestyleOperatorReference.ts` and the
`freestyle/inputs/base_dictionary/trick_modifiers.csv` registry; this document records the
derivations and their proofs.

## Alpine = the ducking prefix

Nine independent PassBack folk pairs equate "Alpine X" with a ducking/diving-
augmented technical name:

- Goliath (Pixie Ducking far DLO = Alpine Smog; smog = pixie DLO, canonical)
- Id (Atomic Ducking far Double Down = Alpine Fusion; fusion = atomic
  double-over-down, canonical)
- King Koopa (= Alpine Super Mario; super mario = spinning symposium torque,
  canonical)
- Maelstrom (= Alpine Spinning Whirl)
- Morpheus (= Alpine Void)
- Ripped Warrior (Stepping Ducking Butterfly = Alpine Ripwalk; ripwalk = stepping
  butterfly, canonical)
- Skullsmasher (Atomic Ducking far Mirage = Alpine Atomsmasher; atom-smasher =
  atomic mirage, canonical)
- Superdeeduperfly (= Alpine Superduperfly)
- Jackknife (Stepping DIVING ss Butterfly = Alpine Sidewalk; sidewalk = stepping
  butterfly, canonical)

*Adversarial check passed:* the competing reading "alpine = far" fails, because
Ripped Warrior and Superdeeduperfly carry ducking but NO far/ss token — two pairs
isolating alpine = +ducking exactly.

*Residual risk:* Jackknife is the one diving (not ducking) case, eight against one;
ducking and diving are both +1 body modifiers in the same four-way family, so ADD is
unaffected either way.

**Ruling: alpine = +ducking, with the diving variance noted per row.** Applying it
relabels modifier links only; no ADD changes.

## Motion is documentarily defined, not derived

FootbagMoves carries a bare `Motion` notation (high confidence): `Toe >> Same Out
(DEX) >> Same Out (DEX) > (back) Spin (BOD) > Same Clip (XBD)(DEL)` — five brackets,
5 ADD. (An earlier draft of the proof miscounted four; the implementation review
caught it.) Three FootbagMoves compound notations are consistent with it: Locomotion
(stepping prefix + motion body, 6), Motion Sickness (spinning prefix + motion body,
6), and Atomotion (atomic prefix + motion body with `[XDEX]`). A third source
converges: PassBack's technical name for Motion is "Double Down near Osis", and the
FootbagMoves body IS two out-dexes (the double-down motif) into a spin plus
cross-body clipper catch (the osis tail) — the identity that had been parked as
osis-gated resolves concretely here.

*Adversarial checks passed:* (a) no active canonical row shares this body, so motion
is not an existing trick under another name; (b) the compounds' first-dex parity
varies OP/SAME by prefix — the standard prefix-induced flip, best-effort refinable
without ADD impact.

**Ruling: motion registers as a 5-ADD base per the FootbagMoves notation; the
compounds author mechanically from it.**

## The screw suffix = an inserted back-whirl dex (+1)

FootbagMoves `Torquescrew` (high confidence): `Clip >> Op In (DEX) > Op Back Whirl
(DEX) > (front) Spin (BOD) > Op Clip (XBD)(DEL)` — torque's chassis with one
inserted `Op Back Whirl (DEX)` (+1, five total). FootbagMoves `Moby Dick`
(= Mobiusscrew) shows the same inserted back-whirl dex inside mobius's chassis
(+1, six total). Two independent notations, one consistent residue.

**Ruling: screw = an inserted back-whirl dex, +1.** Moby Dick authors from its own
FootbagMoves notation regardless.

## Blazing = +1 by arithmetic (structure since ruled a Whirling set)

All eight canonical blazing compounds satisfy base + 1 exactly: butterfly 3+1=4,
drifter 3+1=4, illusion 2+1=3, legover 2+1=3, mirage 2+1=3, paradox_whirl 4+1=5,
symposium_mirage 3+1=4, torque 4+1=5.

**Ruling: the ADD question is closed by the corpus — blazing contributes +1.** The
movement/notation half that this derivation left open has since been ruled by Red
(curator-relayed, 2026-08-21): blazing is a Whirling set, an uptime whirl that the
following trick is performed off of. That structure is consistent with the +1
derived here, since whirling is scored as a +1 set treatment, so no per-row ADD
correction follows from it. The ruling is recorded in `RED_RULINGS.md`.

## Swirl-chain terminal replacement

When Swirl is appended to a trick that ends in a clipper delay, the compound replaces
that terminal clip with one additional outward dex into a cross-body clipper delay and
scores one more than the base.

The appended dex's side is fixed by contact-relative leg parity: the compound finishes
on the same leg that would have made the base trick's terminal clip. Equivalently, the
appended dex inherits the base terminal clip's SAME/OP relation, and the resulting
terminal is `SAME CLIP`.

Reverse Swirl follows the same rule with the appended dex directed inward rather than
outward. Existing link structure, including a no-plant link, is preserved.

The published Butterfly Swirl, Barfly Swirl, Paradon Swirl, and Double Over Down Swirl
independently corroborate the `OP CLIP` case. Application to a `SAME CLIP` base such as
Drifter follows from the already-ratified leg-parity rule rather than from an additional
source exemplar.

**The four corroborating exemplars.** Each is either cross-source cited or had its
appended dex preserved rather than derived, so none is circular:

| Compound | Base terminal | Rule predicts | Published | Finishes on the base's terminal leg | ADD |
|---|---|---|---|---|---|
| Butterfly Swirl | `OP CLIP` | `OP OUT` | `OP OUT` | yes | 3 to 4 |
| Barfly Swirl | `OP CLIP` | `OP OUT` | `OP OUT` | yes | 4 to 5 |
| Paradon Swirl | `OP CLIP` | `OP OUT` | `OP OUT` | yes | 4 to 5 |
| Double Over Down Swirl | `OP CLIP` | `OP OUT` | `OP OUT` | yes | 4 to 5 |

**Rows that are NOT evidence for this convention.** Dada Curve Swirl has no source
notation; its formula was authored by applying this convention while the convention's
wording was still silent on the dex side, which is how it acquired a `SAME OUT` that the
rule does not give. Double Over Down Reverse Swirl is recorded as the direction-reversed
sibling of the live swirl form. Both are derived from the convention and neither may be
counted as independent corroboration in a later audit.

## Flapper is a terminal catch, not an operator

Flapper is the cross-body sole delay. It is a catch, and in every source it appears
only in terminal position; it never modifies a following trick.

**Ruling: flapper's operator status was a classification error, not a second sense.**
The name had been carried in the undefined-operator gate because the parser met an
unfamiliar trailing token and the ledger recorded it as an unknown operator. Nothing
in the record supports an operator reading.

The evidence is unanimous across both source traditions, and the two differ only in
the word they use for the same catch:

| Source | Name | Recorded notation |
|---|---|---|
| footbag.org | Flapper Delay, glossed "Cross-Body Sole Delay" | `SET > FLAP [UNS] [XBD] [DEL]` |
| footbag.org | Leg-Over Flapper Stall | `TOE > OP OUT [DEX] > OP SOLE [XBD] [UNS] [DEL]` |
| FootbagMoves | Buttersole, alternate name Butterfly Flapper | `Set >> Op Out (DEX) > Op Flapper (XBD)(UNS)(DEL)` |
| FootbagMoves | Singularity, alternate name Symposium Whirling Flapper | `Clip >> (no plant while) Op Front Whirl (DEX)(BOD) >> Op Flapper (XBD)(UNS)(DEL)` |
| FootbagMoves | Ricochet | `Toe >> Op Out (DEX) >> Same Out (DEX) > Op Flapper (XBD)(UNS)(DEL)` |

Every one places it last and brackets it identically: cross-body, unusual surface,
delay. The platform had already reached the same conclusion twice independently. The
Notation paper lists flapper among resolved non-core terminals rather than among
operators, and three canonical rows already ship the encoding as `SOLE [XBD] [UNS]
[DEL]`: the cross-body sole stall itself, leg over flapper stall, and ricochet.

Two consequences follow. The encoding of a flapper terminal is settled, so no
flapper-terminal name waits on the path/catch terminal-encoding question. And
`flapper` is registered as an alias of the cross-body sole stall correctly; that
registration was never in tension with anything real.

## Solestice = an osis on the flapper catch (4 ADD)

Solestice had been carried as an undefined "osis flapper" operator. It is not an
operator at all. Following the flapper ruling above, the name reads as an osis that
ends on the flapper catch — the cross-body sole delay — instead of a clipper.

**Ruling: identity and count are reconstructed; no operator exists.** The count is 4.
What remains open is only the terminal's side, inherited from the unresolved osis
catch-side question, which is not specific to this name.

Three independent lines converge, and the bracket arithmetic closes from each:

- **The record.** The PassBack world record carries the technical name "Osis Flapper"
  and records the count as 4 on its own row.
- **The records vocabulary.** The same records source, for the same player, gives the
  cross-body sole stall the technical name "Flapper (op)" at 3. Flapper already
  denotes the catch there, so "Osis Flapper" is an osis plus that catch.
- **The naming parallel.** Solestice embeds *sole*, exactly as Buttersole does for the
  ruled Butterfly Flapper. Both portmanteaus name the sole catch.

A flapper terminal costs exactly one bracket more than a clipper terminal, the
unusual-surface flag, and that holds wherever it is checked:

| Comparison | Clipper terminal | Flapper terminal |
|---|---|---|
| bare catch | clipper stall `SET > OP CLIP [XBD] [DEL]` = 2 | cross-body sole stall `SET > SAME SOLE [XBD] [UNS] [DEL]` = 3 |
| butterfly | butterfly = 3 | Buttersole (Butterfly Flapper) = 4 |
| osis | osis = 3 | **Solestice = 4**, matching the record |

No source records a movement notation for Solestice, so the full form is not written
here: it would read `SET > (back or front) SPIN [BOD] > ? SOLE [XBD] [UNS] [DEL]` once
the osis catch-side question is settled. Solestice stays records-only; it gates a
world-record badge and no dictionary row, and nothing here promotes it.

## Mid-chain whirling: two source-attested notation registers

**Ruling.** Mid-chain whirling is represented in two source-attested notation
traditions. FootbagMoves writes the rotational dex explicitly as `FRONT WHIRL`;
footbag.org may fold the same action into the base dex direction and following body
rotation. Sourced canonical notation is preserved in the register used by its source.
For new platform-authored derivations, use the explicit `FRONT WHIRL` register for
consistency. Blender provides the direct equivalence between `FRONT WHIRL` and the
footbag.org inward-dex encoding; **no broader directional conversion should be
inferred without source evidence.**

The registers track the source traditions exactly, across the whole dictionary:

- 37 active rows use `FRONT WHIRL`. Of the 23 carrying a clean citation, every one
  cites FootbagMoves.
- footbag.org never writes `FRONT WHIRL` anywhere in the snapshot. Blender, Double
  Blender and Whirling Swirl carry footbag.org citations and use the folded form.

Blender is the equivalence exemplar because both traditions record it: footbag.org as
`SET > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` with the prose "a
whirling osis, begin like a whirl but then bail to an osis", and FootbagMoves, under
its alternate name Whirling Osis, as `Clip >> Op Front Whirl (DEX) > (back) Spin (BOD)
> Same Clip (XBD)(DEL)`. Same movement, same bracket count, 4 ADD either way. That
establishes `FRONT` against the inward-dex encoding for this case and nothing wider:
the complementary `BACK` correspondence has no cross-register pair demonstrating it.

Two consequences. Normalizing either way would overwrite sourced notation with a
platform preference, so neither is done: normalizing to the folded form would rewrite
37 FootbagMoves-cited rows, and normalizing to the explicit token would rewrite three
footbag.org-cited ones. And the seven unsourced `whirling_*` rows already use the
explicit register, so nominating it for new authoring changes nothing on disk; those
rows carry no citation and are never evidence for the register they use.

## Flailing = a Symposium Atomic set (+2), and its written Symposium is redundant

Red ruled flailing a Symposium Atomic set, which denies the older hypothesis that
flailing is the prefix form of flail. Two things follow, both settled by the
corpus rather than by reading the names.

**The weight is +2.** Every published atomic-symposium compound contributes
exactly two over its base, with no exceptions:

| Compound | ADD | Base | Delta |
|---|---|---|---|
| Atomic Symposium Mirage | 4 | mirage 2 | +2 |
| Atomic Symposium Whirl | 5 | whirl 3 | +2 |
| Atomic Symposium Butterfly | 5 | butterfly 3 | +2 |
| Atomic Symposium Eggbeater | 5 | eggbeater 3 | +2 |
| Atomic Symposium Paradon | 6 | paradon 4 | +2 |
| Symposium Atomic Butterfly | 5 | butterfly 3 | +2 |

The shape is consistent too: the atomic dex is prepended and the base's leading
dex becomes a no-plant `[BOD] [DEX]`, which is the symposium treatment and is
exactly what flail is on its own.

**Ruling: in a flailing compound name, an immediately associated Symposium token
is an explanatory expansion of the flailing set, not a second symposium
treatment, unless a source explicitly establishes two distinct symposium
actions. It adds no ADD beyond flailing's +2.**

The proof is arithmetic, not a reading of the wording. Bill Ted's Excellent
Adventure is published at 5 ADD and carries the registered alias "flailing ss
symposium eggbeater". Eggbeater is 3, and flailing contributes 2, giving 5. Were
the written symposium a second scored treatment the row would be 6, contradicting
its own published count.

So the folk names unpack the set rather than stacking on it: Flailing Symposium
Mirage is mirage 2 plus flailing 2 = 4, Flailing Symposium Whirl is 5, and
Flailing Symposium Eggbeater is 5. No repeated-operator question arises.

**Not settled here: the positional qualifier.** Several flailing names carry `ss`
or `far`, and nothing above says what that qualifier modifies or where its
SAME/OP relation lands inside the atomic-symposium chassis. The six exemplars
carry no positional form, so they cannot answer it. That question is why the one
blank-notation flailing row stays blank.

## Explicitly NOT derived (the boundary of what is proven)

- **Slapping: a confirm/deny hypothesis, not a ruling.** FootbagMoves defines bare
  `Slap` (`Toe > Op In (DEX) >> Same In (DEX)(XDEX) > Op Toe (DEL)`), but NO compound
  notation for a "Slapping X" exists to cross-check a prefix reading — unlike motion,
  the operator body cannot be verified against a second data point. It stays with the
  expert as a single confirm/deny hypothesis (is slapping the prefix form of the
  documented bare structure?). The matching flailing hypothesis is closed: Red ruled
  flailing a Symposium Atomic set, which denies the prefix reading rather than
  confirming it, and the proof is in the flailing section above. FootbagMoves also
  documents `Flail = Symposium Illusion`, which still matches the canonical flail row;
  flail and flailing are separate identities and that entry is unaffected.
- **Monster / Rotor / Wauxspin: downgraded to curator-held.** Monster ("Symp.
  Swirling Gyro Inside") and Rotor ("Swirling Gyro Inside Stall") are a consistent
  pair, but no canonical swirling+gyro stack exemplar exists to mirror a chassis
  from, and PassBack gives no dex counts. Wauxspin ("Butterfly Gyro Toe") puts gyro
  AFTER the base — a suffix position with no precedent. The readings are recorded;
  authoring would require an invented chassis, so they hold.
