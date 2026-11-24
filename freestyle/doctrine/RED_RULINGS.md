# Red rulings ledger

The expert rulings in effect for the freestyle dictionary, and where each one's
canonical home is. Rules expert Red Husted's answers arrived in a numbered
correspondence series ("pt" batches) and later consolidated waves; the verbatim
transcripts and follow-up notes (`red-correction*-pt*.txt`, `red-followup-*.md`)
are person-attributed correspondence held in the maintainers' private
repository, while the derived per-batch adjudication logs stay frozen in
`legacy_data/inputs/curated/tricks/` (`red_corrections_pt*.csv`,
`red_corrections_consolidated.csv`). This ledger
summarizes the rulings IN FORCE — it does not restate every per-row note; the
per-row provenance lives where each ruling is applied.

## Where rulings live

- **Operator ADD values, structure, X-Dex behavior:**
  the modifier registry is the single authority for ADD (seeded before cutover by
  `freestyle/inputs/base_dictionary/trick_modifiers.csv`), and the
  `freestyle_operators` table for structure and X-Dex. This ledger names
  which operators carry expert rulings; it never duplicates their values.
- **Per-row rulings (identities, equivalences, ADDs, structures):** the provenance
  notes on the rows themselves in
  `freestyle/inputs/curated/tricks/red_additions_2026_04_20.csv` and
  `red_corrections_2026_04_20.csv`, each citing its pt batch.
- **Family and identity doctrine:** the sibling documents in this directory
  (`DOWN_FAMILY.md`, `POSITIONAL_IDENTITY.md`, `MIRROR_RULE.md`,
  `OPERATOR_DERIVATIONS.md`).
- **Who rules what** (curator ruling, 2026-11-23): the rules expert rules footbag
  doctrine, meaning what a movement physically is, how it scores, and what a word
  means in the movement. The curator owns the site's notation: how a ruled
  movement is written, which syntax a terminal or path takes, and whether the
  notation can express a distinction. Whether an old folk name stays as an
  alternate name is a curator decision; what its words mean in the movement is the
  rules expert's.

## Supersession method

A later Red statement supersedes an earlier one, and both are preserved in the row
note — the trail is never erased. Expert answers override all inferred
decomposition; inference that fails to close is deferred, never silently "fixed".
Where Red's wording clashes with the schema's terms (for example calling a modifier
a "base"), the mismatch is raised as a governance question rather than resolved by
silently reshaping either side.

## Structural doctrine in force

- **Frontier and combo compatibility** (Frontier paper answer). The frontier of
  unhit tricks and combos is too vast to enumerate, so the encyclopedia never
  publishes a bounded list of what has not been hit. "Physically impossible" is not
  a permanent category, because future players may make currently unimaginable
  things possible; any ceiling statement is dated, never final. The one hard, useful
  distinction is combo compatibility: whether the terminal contact and state of one
  move can feed the required entry and contact of the next. Fog does not chain into
  Blurry Whirl because Fog ends on a toe stall and Blurry Whirl requires a clipper
  entry, so the link is state-transition incompatible, not impossible. Canonical
  home: `freestyle/doctrine/papers/4_Frontier.md`.
- **Direction is structural, not a qualifier** (pt6). A direction-reversed move is
  its own canonical entry: mirage ≠ illusion, spinning ≠ inspinning, ATW ≠
  reverse-ATW, drifter ≠ reverse-drifter. `reverse` is never a modifier row.
  Within-trick CW/CCW execution variants the community treats as one trick stay one
  row.
- **Toe-dexterity catch foot reads by component-relative side markers** (maintainer
  ruling on the four-atom correction). Each `SAME` / `OP` side marker in the
  operational notation is read against the previous side-bearing component, not a
  fixed setting foot, so two opposite markers chain back to the setting foot. The
  four basic toe dexterities split by catching foot: mirage and illusion (two `OP`
  markers) return to the setting toe and the dexing leg does not catch; pickup and
  legover (`OP` dex, `SAME` catch) are caught by the dexing foot. The four set-entry
  and multi-dex compounds resolve by the same chain: pixie-mirage and fairy-mirage
  catch on the setting toe (their teaching prose corrected from "opposite toe"),
  while quantum-mirage and pixie-same-side-illusion catch on the opposite (dexing)
  toe (their prose already correct). Canonical home: the per-component marker rule
  in `POSITIONAL_IDENTITY.md`.
- **Double-drifter cells preserve the drifter lead** (maintainer ruling). High Plains
  Drifter and Toe Double Drifter are the clipper-set and toe-set cells of one
  double-drifter structure; both keep the drifter base's opposite-side inward lead dex
  (`OP IN`). High Plains Drifter's lead was corrected from `SAME IN` to `OP IN` to match
  its footbag.org source and the toe-set sibling; names, clipper terminal, and 4 ADD
  unchanged. Home: the high-plains-drifter operational-notation correction, regression
  in `tests/unit/freestyle-drifter-paradon-doctrine.test.ts`.
- **Mind Bender is Ducking Paradox Blender** (curator ruling). FootbagMoves gives
  Ducking Paradox Blender as Mind Bender's technical name and the Stanford list
  writes "Ducking Paradox Blender (Mind Bender)"; the second row had no source of
  its own. The two are folded into Mind Bender, which takes the `OP IN` dexterity
  footbag.org's Stepping Ducking Paradox Blender writes, and shows Ducking Paradox
  Blender as its structural name. Home: the identity-folds sweep.
- **A scored lead no operator names is a leading dexterity** (curator ruling).
  Where a trick's notation scores an inward dexterity in front of its chassis
  that no registered operator names (the "miraging" lead, which carries no
  registry weight), its breakdown writes it as "leading dexterity(+1)":
  Armageddon, Big Apple Sauce, Mofly, Paratoxic, Spinning Miraging Symposium
  Torque. A trailing swirl dexterity is written "out dex(1)", as Double Over
  Down Swirl and Pixie Quantum Double Over Down Swirl do. Home: the curated
  formulas, regression in `tests/unit/freestyle-resolved-formula-arithmetic.test.ts`.
- **Flying is an unnamed body event** (curator ruling). The modifier registry
  holds no flying operator; a flying move scores as the body event its notation
  writes, `BOD(1)`, as Flying Clipper's breakdown shows. Home: the curated
  formulas.
- **Miraging Dragon is filed on Dragon** (curator ruling). Like Drifter on
  Clipper Stall, it is filed on the catch its notation lands on; its breakdown
  is leading dexterity(+1) + dragon(2). Home: its additions row, regression in
  `tests/unit/freestyle-resolved-formula-arithmetic.test.ts`.
- **Blurrier is Stepping Barfly** (curator ruling). footbag.org's Blurrier notation is
  one stepping dexterity on the clipper-set Down cell, which the ratified grid makes
  Barfly; the 5 ADD is stepping plus barfly. The unsourced Stepping Barfly row is
  folded into Blurrier and shown as its structural name. Home: the identity-folds
  sweep.
- **Pixie Paradon is a paradon** (maintainer ruling). It is a pixie set into a paradon:
  footbag.org's move page gives it 5 ADD and
  `TOE > SAME IN [DEX] > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]`, the
  paradon's double dexterity ending in a clipper delay. It keeps its name and the
  paradon family its base gives it. "Pixie Paradon (Dimmiest)" stays separate until
  evidence shows it is the same movement. Home: the pixie_paradon operational-notation
  correction, regression in `tests/unit/freestyle-drifter-paradon-doctrine.test.ts`.
- **Clipper Symposium Whirl is a symposium whirl** (curator; answered by shipped
  structure). `CLIP > SAME SYMP [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]`, whirl family,
  4 ADD (symposium +1 on whirl); no data change.
- **Osis-suffix compositional default** (curator). An osis-suffix compound terminates in
  the osis spin-to-clipper structure after its preceding material. This is a
  compositional default only; it does not by itself author or settle every osis-suffix
  row, and the separate osis spin-polarity, side-relationship, and catch-interpretation
  questions stay open.
- **Blink's back-swirl path token is a narrow documented exception** (curator). Blink
  ships at 2 ADD with a `BACK SWIRL` path token outside the ratified in/out path
  vocabulary, sanctioned as a Blink-specific exception. It does not open a general
  rotational-path register or ratify the provisional Atlas path vocabulary.
- **Timing can individuate operators** (latest timing clarification). Red's latest
  timing clarification settles the tested pairs: Atomic is an uptime set and
  Illusioning is a distinct downtime move, so they do not merge; hippy Atomic and
  leggy Atomic are execution styles of Atomic, not separate canonical tricks.
  This ruling supersedes the earlier merge reading for that pair. The broader
  rule — whether timing always individuates every dex sequence — remains an open
  Identity question unless separately ruled. Older terminology is preserved in
  provenance or alias notes where it blurred the distinction.
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
  canonical row only on stabilized named identity (double-leg-over yes).
  James-ratified identity/publication threshold: a count-prefixed form
  earns its own canonical row only when evidence supports a stabilized trick
  identity rather than a literal instruction to repeat a movement — either stable
  community use of the count form as the trick's own independent name, or a
  structural reason it must be represented independently (anchoring a family or
  base, carrying established descendants, or resolving a decomposition ambiguity).
  Otherwise the count stays a descriptive multiplicity on the base and earns no
  row; double-over-down, double-leg-over, Double Fairy (a valid set, rules-expert
  ruling, 2026-10-18), the stabilized double-spinning forms, and triple-mirage
  qualify, while records-only counts such as Double Dyno and Double
  Whip do not. This governs row identity only: descriptive-multiplicity rendering
  is handled separately, and the ADD treatment of an unregistered count prefix
  remains the Red-blocked count-quantifier scoring question.
- **Inside / outside are naming adjectives, not modifiers** (pt7); "Symp" is
  shorthand for Symposium.
- **1-ADD delay and body tricks are included** in the dictionary; **Spyro is a
  trick, not a general modifier concept** (naming has largely shifted toward
  Inspin); **Gyro = spinning and dexing with the same foot that set the bag**.
- **Swirling and Tapping are sets; Whirling is not** (rules-expert ruling,
  2026-10-18). Swirling and Tapping are launch sets, and their set-versus-modifier
  status is settled, not pending. Whirling is not a set: Blazing is the Whirling
  set (see Blazing under Operator rulings in force), and whirling stays a body
  modifier in the registry, with its mid-chain operator reading (the injected
  rotational dex in the operator reference) unchanged. Neither set is a
  first-class By-modifier browse group; existing modifier-link relationships may
  remain available through secondary tracked-group surfaces without reclassifying
  them. Admission to the curated By Set browse roster is a separate
  browse-curation decision. This ruling reclassifies no other token.
- **Railing, Surfing, Splicing and Floating are first-class named sets, even if
  uncommon** (rules-expert ruling, 2026-10-18). Each keeps its composite definition
  in the registry; being a composition does not make a named set any less a set.
- **Cross-body and side are independent** (curator ruling, 2026-11-23): the
  `[XBD]` cross-body flag records the body relationship of a component, and
  `SAME` or `OP` records its side; neither determines the other, so a cross-body
  terminal is written on either side. This is a rule of the notation model.
- **A sourced path the in and out vocabulary cannot write takes an explicit path
  token** (curator ruling, 2026-11-23): where a movement genuinely follows a path
  that `IN` and `OUT` cannot faithfully encode, the notation names the path rather
  than forcing it into those terms for uniformity. Blink's `BACK SWIRL` dexterity
  is the case in use.

## Operator rulings in force

Values for all of these live in the `freestyle_operators` table and the modifier
registry (`trick_modifiers.csv` before cutover); the registry notes cite the
ruling batches.

- **Pogo** (the +1 adjudication): Red's pt-series answer was that pogo is a set and
  does not add ADD. The corpus contradicted the modifier half uniformly — every
  pogo compound sits one tier above its pogo-less base, with no counter-example —
  and the curator adjudicated pogo the modifier as count-bearing, overriding the
  earlier reading, while the STANDALONE pogo set keeps its 0-ADD identity (both
  halves recorded in the registry and the pogo row's provenance; evidence dossier
  at `exploration/pogo-add-doctrine-packet/CURATOR_PACKET.md`).
- **X-Dex on the atomic whirl** (rules-expert ruling by email, recorded 2026-11-23):
  "The whirl is eligible for X-Dex. Atomic Whirl and Atomic Symposium Whirl score the
  X-Dex; fold their derived rows into Reactor and Gary Coleman, following the Atom
  Smasher / Atomic Mirage precedent." Reactor is the atomic whirl at 5 and Gary
  Coleman the atomic symposium whirl at 6, each carrying the other name as a shown
  structural name with no separate row. Ego (Atomic Ducking Whirl) carries the same
  X-Dex on its whirl, so it stands at 6.
- **Atomic Miraging Butterfly is 6** (rules-expert ruling by email, recorded
  2026-11-23): "It is 6 ADD. The middle inward dexterity correctly earns X-Dex."
  Atomic(+1), the leading inward dexterity (+1) and its X-Dex (+1) on butterfly (3),
  as FootbagMoves records. This supersedes the 2026-06-20 row reading that a
  butterfly base cannot receive it.
- **Spyro** (rules-expert ruling by email, recorded 2026-11-23; the spyro half of
  registry Q14): "Spyro means Giro with a plant: the foot that normally would not
  touch the ground makes contact with it." A spyro is a gyro whose free foot plants.
  The ruling defines the movement and states no weight; the twisting half of Q14
  stays open.
- **Pogo Clipper ends in a stall** (rules-expert ruling by email, recorded 2026-11-23;
  registry Q12): "The terminal contact is a stall, not a kick." Pogo Clipper is the
  pogo set into a clipper stall, and its same-side form follows the plain form.
- **Furious = Barraging** (pt14; rules-expert ruling, 2026-10-18): the same
  concept, with Furious the canonical and commonly used name. Compounds named for
  the Barraging set take the Furious name (rules-expert ruling, 2026-10-18):
  "since they are Barraging sets, they are Furious", so Barraging Mirage becomes
  Furious Mirage, and likewise for each barraging-named compound. The two whose
  Furious name already belonged to another trick are that trick (rules-expert
  ruling, 2026-10-19): "Barraging Barfly is Nemesis, but it's explained more like
  Furious Barfly", and "Barraging Eggbeater is actually Furious Eggbeater, which is
  Clownface." Barraging Barfly folds into Nemesis and Barraging Eggbeater into Clown
  Face, each former name kept as an alias.
- **Inspinning** (pt14): any spin counts the same, so inspinning carries spinning's
  weight; it differs in rotation direction (front where spinning is back).
- **Nuclear** (pt9, pt14): structurally a paradox dex plus a downtime illusioning
  dex; nuclear itself carries no X-Dex — Sumo (Nuclear Mirage) is the named
  exception whose extra count is an X-Dex on the following far mirage. Sumo's X-Dex
  scores (rules-expert ruling by email, recorded 2026-11-23; registry Q11): Sumo is 5,
  and Nuclear Ducking Mirage, with its Sumo Thong twin, is 6.
- **Atomic and X-Dex**: atomic is a flat +1 on every base with no rotational class;
  X-Dex is a separate, receiver-gated +1 that fires only where the notation carries
  `[XDEX]` on an eligible far-form receiver dex, never inferred from an operator
  name. The earlier reading that "the illusioning naming merged into atomic" is
  **superseded by the latest timing clarification:** Atomic is an uptime set and
  Illusioning is a distinct downtime move, so they do not merge (see the
  timing-individuates entry under Structural doctrine in force). The atomic +1 and
  X-Dex rules are unaffected. The atomic entry in the `freestyle_operators` table
  is the canonical statement of the atomic +1 / X-Dex doctrine.
- **Terraging** (pt8; rules-expert ruling by email, recorded 2026-11-23, the count half
  of registry Q05):
  its own +3 element, NOT a parallel form of barraging (correcting pt6 phrasing).
  Terraging is "a triple Outside-In dex/set from a clipper": three outside-in
  dexterities off a clipper, which is the registry's +3 by the bracket count. The
  shipped two-dexterity notations and footbag.org's double-pixie Terrage each carry
  one dexterity fewer. The ruling does not give each dexterity's side or Terrage's
  entry surface, so no terraging notation is written yet; Q05 stays open for them.
- **Shooting** (pt7, pt9): both a set and a modifier, at the same weight, holding
  on rotational bases.
- **Rooted** (pt8): a unique set with one initial dexterity attached; non-scoring
  like the standalone pogo set.
- **Sailing** (pt9): a set equivalent to the Pixie Quantum set; set-standalone
  value stated, modifier behavior not classified.
- **Backside** (pt9): a body modifier.
- **Flailing** (curator-relayed): flailing is a Symposium Atomic set. This answers
  the standing confirm-or-deny in the negative: flailing is NOT the prefix form of
  flail. Flail remains a symposium illusion in its own right, and flailing is a
  distinct set combining the symposium and atomic treatments. The set's weight is
  corpus-settled at +2 by the six published atomic-symposium compounds; the proof
  and the naming consequence are in `OPERATOR_DERIVATIONS.md`.
- **Blazing** (curator-relayed, 2026-08-21): blazing is a Whirling set, an uptime
  whirl that the following trick is performed off of (Red's example: Blazing
  Paradox Mirage). This closes the open movement/notation half of the blazing
  question; the +1 count is unchanged and remains the corpus-derived ruling in
  `OPERATOR_DERIVATIONS.md`, read now as the set's scoring contribution rather
  than a body-modifier bonus. Blazing is therefore a named whirl-chassis set, not
  a body modifier and not an alias of whirling. The rules-expert ruling of
  2026-10-18 confirms it as the uptime Whirling set at 1 ADD; whirling itself is
  not a set. The registry stores count-bearing sets in the same table as
  modifiers, so blazing's `modifier_type=set` records it as a set within that
  shared storage model; the storage convention is not a claim that it modifies.
- **Blazing and flailing side reference** (curator-relayed, 2026-09-17): the side
  the set originates from establishes the reference. A following component on that
  side is same-side; crossing to the other side is opposite. This closes both
  halves of the blazing question rather than one: the following component's
  relation directly, and the opening dexterity's side by making it definitional,
  since the set's origin is the reference rather than a separate fact to
  establish. It closes the flailing positional question on the same terms, which
  asked where a positional qualifier lands inside the atomic-symposium chassis.
  The corpus already reads this way and was waiting on the rule rather than
  disagreeing with it: every published flailing name carrying the same-side
  qualifier shows a same-side token on the component after the set's dexterity,
  and the two carrying no qualifier show the opposite, six rows for six. What this
  unblocks is the eight blazing compound notations, the bare blazing row, and the
  flailing identities whose notation was held for this reason alone.
- **The blazing dex is the set, and the move after it is judged on its own**
  (curator-relayed, 2026-09-19): blazing works the way stepping does. Its dex
  belongs to the set, and what follows is evaluated independently. In blazing
  paradox whirl the paradox contribution belongs to the whirl's own dex, because
  that whirl independently satisfies the paradox requirements; blazing neither
  creates that relationship nor alters it.
  This settles what the paradox rides on, and it settles it by removing the
  question. The collision was never in the notation: it came from describing the
  seven already-authored compounds as crossing the component after the set to the
  opposite side. They do no such thing. Each carries its base's chain over
  unchanged and replaces only the set, and all seven bases happen to open on an
  opposite-side dex, which is why the wrong generalisation fitted every one of
  them. Paradox whirl is the first base that opens same-side, so it was the first
  to expose the description rather than the rule.
  What follows: a base chain is preserved under a set, never rewritten to suit
  it. The same-side dex of the paradox whirl stays same-side, which is also why
  the outside source's second front-whirl reading is not needed. Any prose
  asserting that a component following a set sits opposite it describes the
  blazing chassis's own whirl, not a rule about bases, and is worth re-reading
  against this.
- **Near and far** (curator ruling, 2026-09-18): in this context near is the
  same-side form and far the opposite-side form, so a far-qualified name and an
  opposite-side reading are one claim rather than two. This is the platform's
  working equivalence for the positional vocabulary, consistent with the
  source-register mapping already recorded in `POSITIONAL_IDENTITY.md`.
- **Butterfly implies far** (curator ruling, 2026-09-18): the butterfly default is
  the far, opposite-side execution, and only a near execution needs asserting,
  which is why the same-side form is the separately named row. A far-qualified
  butterfly name is therefore the base trick under a spelling that states what the
  base already means, not a variant of it. Infinity names the clipper-set
  butterfly; the set is what distinguishes it, not the side.
- **Ripped Warrior is the far form; Stepping Ducking Butterfly Same Side is its
  pair** (curator ruling). FootbagMoves gives Ripped Warrior the technical name
  Stepping Ducking Far Butterfly and `CLIP > OP IN [DEX] >> DUCK [BOD] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]`,
  PassBack records it as the opposite-side form, and FootbagMoves lists the
  same-side form separately. By butterfly-implies-far the plain name Stepping
  Ducking Butterfly is Ripped Warrior's, shown as its structural name; the
  same-side form is the row Stepping Ducking Butterfly Same Side. Home: the two
  rows' corrections, regression in `tests/unit/freestyle-ripped-warrior-pair.test.ts`.
- **Surging = spinning + stepping**: not a primitive modifier and never a
  `trick_modifiers` row; the standalone `surging` dictionary row keeps its
  named-trick identity while compounds decompose.
- **Pogo, quantum, furious, atomic, pixie, fairy, nuclear, blurry, shooting,
  rooted are sets** that also act as modifiers (the set/modifier dual role, pt-series
  classification carried in the registry's `modifier_type` column).

## Identity and equivalence rulings in force

Each lives as a row (with pt-cited provenance) in the curated CSVs; the notable ones:

- **Toe Blur = Quantum Mirage, 3 ADD** (curator ruling, 2026-10-25), consistent
  with the toe-prefix convention below; Blur remains Stepping Paradox Mirage,
  4 ADD. This resolves the conflict between this ledger's two entries. The earlier
  pt10 adjudication, recorded here as "Toe Blur = Stepping Paradox Mirage
  (supersedes the pt2 'Quantum Mirage' equivalence, whose math did not close)",
  is **superseded** by this ruling and kept for the record.
- Quantum is the modern naming replacing the older "toe" prefix (pt2); toe-X names
  are aliases of quantum-X canonicals.
- Omelette = Illusioning Pickup (pt6); Omelette resolves to the atomic_illusion
  canonical. The earlier reading that "atomic pickup" is Omelette's alias (on the
  ground that "illusioning merged into atomic") is **superseded** by the later
  formula-identity ruling: Atomic and Illusioning are distinct (Atomic uptime,
  Illusioning downtime), and the **Atomic Pickup structural identity is
  scrambled_eggbeater, not Omelette**. That structural-target question is settled; no
  public "atomic pickup" alias is registered in this pass (none exists, and alias
  publication needs direct naming evidence independent of the superseded Omelette
  association).
- Flail = Symposium Illusion (pt6). Fury = Furious Paradox Mirage (pt6, replacing
  the pt4 decomposition). Merkon = spinning legover (pt5). Smog = Pixie Double Leg
  Over, Smudge = Pixie Illusion, Haze = Stepping Double Leg Over (pt7). Smoke =
  Pixie Drifter, Plasma = Quantum Double Down, Grave Digger = Stepping Same-Side
  Torque, Nemesis = Furious Barfly (pt8).
- The surging compounds (pt2): Bigwalk = Surging Butterfly, Surge = Surging Paradox
  Mirage, Surreal = Surging Paradox Whirl, Surgery = Surging Symposium Reverse
  Whirl, Venom = Surging Barfly.
- **Jani Walker is a Furious Butterfly** (pt8; rules-expert ruling by email, recorded
  2026-11-23, registry Q13): "Its movement is a Furious Butterfly." Its notation
  (`CLIP > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]`, 5 ADD) is
  the furious set on butterfly, 2 + 3. Barraging is Furious, so footbag.org's
  "Barraging Butterfly" reading is the one now ruled. The separate Furious Butterfly
  row therefore duplicates Jani Walker; its disposition is with the curator. The
  Sidewinder = fairy gyro Jani Walker identity is not ruled by this answer.
- Terrage and Barrage are standalone AND compositional; Merkon is standalone;
  Sidewalk, Tombstone, Flail, and Omelette are common names that belong in the
  dictionary; Royale and Ripstein are primary entries; Eclipse counts its hop-over
  portion; Atom Smasher's count includes an X-Dex.
- Bedwetter start-delay eligibility (curator-relayed): Bedwetter may begin from
  either a clipper delay or an osis delay and remains Bedwetter from either
  start; the canonical formula writes the clipper start as the default form
  without narrowing that eligibility. This settles the start-delay question
  only; that Bedwetter and Shooting Legover are two distinct movements is a
  separate rules-expert ruling, recorded below.
- **Probe and clipper stall are distinct tricks** (curator ruling, 2026-11-23):
  Probe is the clipper stall reached from a blind set off the opposite shoulder,
  passing behind the head (footbag.org newmoves 35). Both keep their rows; the
  shared compact formula `SET > OP CLIP [XBD] [DEL]` is an accepted limit of the
  notation, and the distinction lives in each trick's structural definition.
- **Paradon and atomic butterfly are distinct tricks** (curator ruling,
  2026-11-23): they differ in which leg sets and which leg circles, and in
  Paradon's hop. Both keep their rows; the shared formula
  `TOE > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]` is the same accepted
  limit, and Paradon's `OP OUT > OP OUT` core stays the ruled Down-grid chassis.
- **Gyro and spinning compounds are distinct tricks** (rules-expert ruling by email,
  recorded 2026-11-23): "Keep them distinct even where their notation collides. Both
  receive an ADD for the turn." The gyro and spinning forms of Barfly, Butterfly Swirl,
  Double Over Down and Symposium Swirl keep their rows; their shared formula is an
  accepted limit of the notation, and both operators keep the +1 the registry gives
  them. The ruling does not define what distinguishes the two turns.
- **Butterfly and reverse whirl are distinct tricks** (rules-expert ruling by email,
  recorded 2026-11-23): "The defining physical distinction is knee-driven versus
  hip-driven." Butterfly and Reverse Whirl, and their pairs Dimwalk / Pixie Reverse
  Whirl, Ripwalk / Stepping Reverse Whirl, Spinning Butterfly / Spinning Reverse Whirl,
  Nuclear Butterfly / Nuclear Reverse Whirl, Fairy Butterfly / Fairy Reverse Whirl and
  Blazing Butterfly / Bling Blang, keep their rows; the shared formula is an accepted
  limit of the notation. Footbag.org's reverse whirl description gives the sides: the
  reverse whirl's dexterity is driven from the knee with the ankle circling the bag, the
  butterfly's from the hip through the upper leg.
- **Bedwetter and Shooting Legover are distinct tricks** (rules-expert ruling by email,
  recorded 2026-11-23): "They are two distinct movements." Both keep their rows; the
  shared formula `CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] > OP OUT [DEX] > SAME TOE [DEL]`
  is an accepted limit of the notation. Stepping Paradox Eggbeater, Bedwetter's
  footbag.org technical name (newmoves 108), stays Bedwetter's.
- **Surging and Spinning Mirage are distinct tricks** (rules-expert ruling by email,
  recorded 2026-11-23): "They are distinct movements despite the notation collision."
  Both keep their rows; the shared formula `CLIP > (back) SPIN [BOD] > OP IN [DEX] > OP TOE [DEL]`
  is an accepted limit of the notation. Whether surging is a set, a modifier or a trick
  is a separate question this does not decide.
- **Reverse Torque and Same-Side Blender are distinct movements** (rules-expert ruling
  by email, recorded 2026-11-23): "Reverse Torque is an Outside-In dexterity to Far Osis.
  Same-Side Blender, or Blender, is an Inside-Out dexterity to Same-Side Osis." In the
  notation, outside-in is `OUT` and inside-out is `IN`; a far osis is an `OP CLIP` catch
  and a same-side osis a `SAME CLIP` one. Reverse Torque's stored notation
  (`SET > SAME IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]`) writes an inward
  dexterity to a same-side catch and disagrees with the ruled movement; its correction
  is open.
- **Merlin is Miraging Symposium Mirage** (rules-expert ruling by email, recorded
  2026-11-23), distinct from Symposium Miraging Mirage. Both rows stay; their stored
  formula is identical and does not yet record what distinguishes them.

## Adjacent adjudications recorded here for completeness

- The curator micro-ruling session of 2026-07-02 (thirteen one-line calls: duplicate
  merges, alias rebinds, notation corrections, holds) is recorded at
  `exploration/curator-rulings-2026-07-02/RULINGS.md`, and each applied change cites
  it in row provenance.
- The evidence-derived operator rulings (alpine, motion, screw, blazing's count)
  are curator-applied derivations from the written record, not Red answers; their
  proofs live in `OPERATOR_DERIVATIONS.md`.
