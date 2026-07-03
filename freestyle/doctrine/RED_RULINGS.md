# Red rulings ledger

The expert rulings in effect for the freestyle dictionary, and where each one's
canonical home is. Rules expert Red Husted's answers arrived in a numbered
correspondence series ("pt" batches) and later consolidated waves; the raw
transcripts and per-batch adjudication logs are frozen in
`legacy_data/inputs/curated/tricks/` (`red-correction*-pt*.txt`,
`red_corrections_pt*.csv`, `red_corrections_consolidated.csv`). This ledger
summarizes the rulings IN FORCE — it does not restate every per-row note; the
per-row provenance lives where each ruling is applied.

## Where rulings live

- **Operator ADD values, structure, X-Dex behavior:**
  `src/content/freestyleOperatorReference.ts` is the single authority, mirrored on
  the data side by `freestyle/inputs/noise/trick_modifiers.csv`. This ledger names
  which operators carry expert rulings; it never duplicates their values.
- **Per-row rulings (identities, equivalences, ADDs, structures):** the provenance
  notes on the rows themselves in
  `freestyle/inputs/curated/tricks/red_additions_2026_04_20.csv` and
  `red_corrections_2026_04_20.csv`, each citing its pt batch.
- **Family and identity doctrine:** the sibling documents in this directory
  (`DOWN_FAMILY.md`, `POSITIONAL_IDENTITY.md`, `MIRROR_RULE.md`,
  `OPERATOR_DERIVATIONS.md`).

## Supersession method

A later Red statement supersedes an earlier one, and both are preserved in the row
note — the trail is never erased. Expert answers override all inferred
decomposition; inference that fails to close is deferred, never silently "fixed".
Where Red's wording clashes with the schema's terms (for example calling a modifier
a "base"), the mismatch is raised as a governance question rather than resolved by
silently reshaping either side.

## Structural doctrine in force

- **Direction is structural, not a qualifier** (pt6). A direction-reversed move is
  its own canonical entry: mirage ≠ illusion, spinning ≠ inspinning, ATW ≠
  reverse-ATW, drifter ≠ reverse-drifter. `reverse` is never a modifier row.
  Within-trick CW/CCW execution variants the community treats as one trick stay one
  row.
- **The downs are one family** (Wave 3 follow-up, 2026-07-02): a single structural
  decomposition with set/foot variants. Full doctrine, grid, and the still-open
  embedded-base labeling half in `DOWN_FAMILY.md`. The earlier pt7 ruling that the
  down-pattern names (double-over down, down double-down, down diver) are DIFFERENT
  tricks stands within it: they are distinct bases of the one family, and "down"
  itself is a naming pattern, not a modifier.
- **Stalls are common anchor positions, not a universal base layer** (pt5). The
  ontology supports non-stall tricks, body primitives, sets, and modifiers; a trick
  whose base is unclear is deferred, never forced into a stall decomposition.
- **Multiplicity is descriptive unless community usage stabilizes a name** (pt3).
  "Double / Triple X" describes repeated dexterity or body-spin events; it earns a
  canonical row only on stabilized named identity (double-leg-over yes; Double
  Fairy no).
- **Inside / outside are naming adjectives, not modifiers** (pt7); "Symp" is
  shorthand for Symposium.
- **1-ADD delay and body tricks are included** in the dictionary; **Spyro is a
  trick, not a general modifier concept** (naming has largely shifted toward
  Inspin); **Gyro = spinning and dexing with the same foot that set the bag**.

## Operator rulings in force

Values for all of these live in `freestyleOperatorReference.ts` /
`trick_modifiers.csv`; the registry notes cite the ruling batches.

- **Pogo** (the +1 adjudication): Red's pt-series answer was that pogo is a set and
  does not add ADD. The corpus contradicted the modifier half uniformly — every
  pogo compound sits one tier above its pogo-less base, with no counter-example —
  and the curator adjudicated pogo the modifier as count-bearing, overriding the
  earlier reading, while the STANDALONE pogo set keeps its 0-ADD identity (both
  halves recorded in the registry and the pogo row's provenance; evidence dossier
  at `exploration/pogo-add-doctrine-packet/CURATOR_PACKET.md`).
- **Furious = barraging** (pt14): the same operator — a two-dex uptime set;
  "Barraging is more explanative."
- **Inspinning** (pt14): any spin counts the same, so inspinning carries spinning's
  weight; it differs in rotation direction (front where spinning is back).
- **Nuclear** (pt9, pt14): structurally a paradox dex plus a downtime illusioning
  dex; nuclear itself carries no X-Dex — Sumo (Nuclear Mirage) is the named
  exception whose extra count is an X-Dex on the following far mirage.
- **Atomic and X-Dex**: atomic is a flat +1 on every base with no rotational class;
  X-Dex is a separate, receiver-gated +1 that fires only where the notation carries
  `[XDEX]` on an eligible far-form receiver dex, never inferred from an operator
  name. The illusioning naming merged into atomic. `freestyleOperatorReference.ts`
  is the canonical statement of this doctrine.
- **Terraging** (pt8): its own +3 body modifier, NOT a parallel form of barraging
  (correcting pt6 phrasing). The unreconciled terraging-chain arithmetic is an open
  rider — see `RED_QUEUE.md`.
- **Shooting** (pt7, pt9): both a set and a modifier, at the same weight, holding
  on rotational bases.
- **Rooted** (pt8): a unique set with one initial dexterity attached; non-scoring
  like the standalone pogo set.
- **Sailing** (pt9): a set equivalent to the Pixie Quantum set; set-standalone
  value stated, modifier behavior not classified.
- **Backside** (pt9): a body modifier.
- **Surging = spinning + stepping**: not a primitive modifier and never a
  `trick_modifiers` row; the standalone `surging` dictionary row keeps its
  named-trick identity while compounds decompose.
- **Pogo, quantum, furious, atomic, pixie, fairy, nuclear, blurry, shooting,
  rooted are sets** that also act as modifiers (the set/modifier dual role, pt-series
  classification carried in the registry's `modifier_type` column).

## Identity and equivalence rulings in force

Each lives as a row (with pt-cited provenance) in the curated CSVs; the notable ones:

- Toe Blur = Stepping Paradox Mirage (pt10 adjudication; supersedes the pt2
  "Quantum Mirage" equivalence, whose math did not close).
- Quantum is the modern naming replacing the older "toe" prefix (pt2); toe-X names
  are aliases of quantum-X canonicals.
- Omelette = Illusioning Pickup (pt6) — with illusioning since merged into atomic,
  this is why "atomic pickup" is omelette's alias; the open rebind question is in
  `RED_QUEUE.md`.
- Flail = Symposium Illusion (pt6). Fury = Furious Paradox Mirage (pt6, replacing
  the pt4 decomposition). Merkon = spinning legover (pt5). Smog = Pixie Double Leg
  Over, Smudge = Pixie Illusion, Haze = Stepping Double Leg Over (pt7). Smoke =
  Pixie Drifter, Plasma = Quantum Double Down, Grave Digger = Stepping Same-Side
  Torque, Nemesis = Furious Barfly (pt8).
- The surging compounds (pt2): Bigwalk = Surging Butterfly, Surge = Surging Paradox
  Mirage, Surreal = Surging Paradox Whirl, Surgery = Surging Symposium Reverse
  Whirl, Venom = Surging Barfly.
- Jani Walker (pt8): ADD ruled without structure — Red declined the footbag.org
  "Barraging Butterfly" reading; the row is active on ADD authority with structure
  deferred (the ADD-without-structure activation precedent), and the structure sits
  on the open rider list.
- Terrage and Barrage are standalone AND compositional; Merkon is standalone;
  Sidewalk, Tombstone, Flail, and Omelette are common names that belong in the
  dictionary; Royale and Ripstein are primary entries; Eclipse counts its hop-over
  portion; Atom Smasher's count includes an X-Dex.

## Adjacent adjudications recorded here for completeness

- The curator micro-ruling session of 2026-07-02 (thirteen one-line calls: duplicate
  merges, alias rebinds, notation corrections, holds) is recorded at
  `exploration/curator-rulings-2026-07-02/RULINGS.md`, and each applied change cites
  it in row provenance.
- The evidence-derived operator rulings (alpine, motion, screw, blazing's count)
  are curator-applied derivations from the written record, not Red answers; their
  proofs live in `OPERATOR_DERIVATIONS.md`.
