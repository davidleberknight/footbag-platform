# Down family doctrine

The down/barfly lineage is ONE family: a single structural decomposition whose named
bases are set/foot variants of the same movement. Ruled by rules expert Red Husted
(Wave 3 follow-up, 2026-07-02): "The downs are part of the same family, it's
essentially the same move with different sets/from different feet. I'd say single
structural decomposition." The ruling ratified the reading that an adversarial
falsification pass had failed to break; the evidence is summarized below and lives in
full at `exploration/dod-ddd-evidence-pass-2026-07-02/` (`RED_PACKET_A1_REVISED.md`,
`DOWN_FAMILY_ADVERSARIAL_AUDIT.md`, and the deterministic classifier
`parity_trace.py`).

## The four-cell grid

The family's four distinct 4-ADD bases form a 2x2 grid. Axes: the set surface, and
which leg performs the two out-to-in dexes (entry-relative).

| | setting-side leg dexes | other leg dexes |
|--|--|--|
| **Toe set** | Double-Over Down | Paradon |
| **Clipper set** | Barfly | Down Double-Down |

- Every cell is bare-attested by its own footbag.org JOB (Double-Over Down showmove
  97, Down Double-Down 98, Paradon 120, Barfly 78), and every cell is a platform
  canonical.
- "DOD" is the abbreviation of Double-Over Down and folds into that cell; it is not a
  fifth identity. "DDD" abbreviates Down Double-Down.
- Folk "double down" names the generic motif (PassBack's own bare row calls it a
  "double-dex Butterfly"), never a base. The four cell names are the bases.
- Every traceable down/barfly-family JOB in the corpus (24 at audit time) lands in
  exactly one cell; an audit that searched only for counterexamples found zero
  violations. Grid membership is computed by a contact-relative leg-parity trace of
  the JOB (`parity_trace.py`).
- The original doctrine question ("is DOD the same as DDD, or is one description
  erroneous?") is dissolved, not answered: neither description is erroneous; they are
  two of the four cells. Scoring is unaffected everywhere (bracket count equals ADD
  under every reading).

## One family under two naming traditions

The "down family" and the "barfly family" are the same family. The barfly compounds
(blurriest, nemesis, venom, superfly — base_trick barfly) are the clipper column of
the grid. Footbag.org's compound naming is internally consistent with this: Nemesis
("a barraging barfly") and Blurriest ("a stepping opposite side barfly") both strip
to the Barfly shape, and Superfly carries footbag.org's own alternate name "Symposium
Barfly", anchoring the superfly chain on barfly and retiring the older
double-over-down prose reading of it.

## Coordinate frames (how the sources reconcile)

Footbag.org and PassBack fully agree on the family's structures once their coordinate
frames are decoded:

- **Folk base names are entry-relative**: which absolute leg dexes, given the set.
  This is the platform's parity-trace reading and matches shipped rows (fusion =
  atomic double-over-down, and so on).
- **PassBack technical near/far is bag-relative**: near = the leg beside the bag's
  current position. For a toe delay the bag is over the setting foot (near = setting
  leg); for a clipper delay the bag sits beside the SUPPORT leg (the clipping foot
  crosses behind it), so near = the support-side leg. After any dex or plant, near =
  that contact leg. This decoding is forced by Barfly's own footbag.org prose
  ("bring the SETTING LEG straight from the clipper around the footbag from out to
  in twice").
- **A body spin inverts the near/far frame** (physically: the unwind carries the bag
  to the other side of the body). Two independent exhibits support this (Scorpion's
  Tail and Bullwhip, each differing from a bare clipper row only by the leading
  back-spin yet labeled opposite), with zero counter-exhibits. This is an evidenced
  convention note, not yet ruled doctrine.

Under this reading, 13 of the 14 cross-source pairs reconcile exactly; the one
residual is Torch-R-Rack, off by one leg under every reading tried (possibly the
symposium fused duck-dex token inverting the frame, or a bad source token), parked
with its evidence in the adversarial audit.

## Grid boundary

The grid is the OUT-direction motif. IN-direction double-dex structures (double
around the world, double pickup) fall outside it on the direction axis, as the model
requires: the ATW/pickup lineage is the motif's IN-direction twin, out of scope.

The Down grid contains the clean two-dex outward cells. Source-attested mixed cells
are not normalized into a grid cell by analogy: Plasma's OP OUT > SAME OUT core
remains outside the grid. A three-outward-dex sequence resolving to clipper may
contain a ruled Paradon chassis plus one added outward dexterity; Fusion, Cold
Fusion, and ID therefore remain Down-derived compounds. The side of Fusion's added
dexterity is tracked separately and remains frozen pending source reconciliation.

## Display-layer umbrella

The public By-family browse represents the ruling as a Down umbrella in
`src/content/freestylePublicFamilies.ts`: a `down` root with the four cells (barfly,
double_over_down, paradon, down_double_down) as its variant branches, aggregated into
one Down section. This is the curated public-display layer only; it never changes
canonical `trick_family` values, and the raw `dod` family label folds into
`double_over_down` at the display layer.

## Open: the embedded-base labeling frame

One half of the down question remains with Red: for an operator compound, which
frame names the embedded base after stripping the operator contacts? The evidence
suggests entry-relative assignment with the body-spin inversion convention, but that
convention rests on two exhibits and is not yet doctrine. The rule decides three
shipped base labels (no ADD changes anywhere); those three rows stay as shipped, and
no row is relabeled where the frame rule matters, until the ruling lands:

| shipped row | shipped base | trace | corroboration |
|--|--|--|--|
| shooting_star | double-over-down | Down Double-Down cell | folk aliases split (Shooting DDD / Shooting DOD); PassBack gives two technical readings |
| tapping_double_over_down | double-over-down | Paradon cell | archive alias "Tapping Paradon (Kiwi)" agrees with the trace against the shipped base |
| venom | barfly | Down Double-Down cell raw; Barfly cell under spin inversion | footbag.org prose "a gyro blurriest" (barfly-family) supports Barfly plus inversion |

This open question is tracked in `RED_QUEUE.md`.
