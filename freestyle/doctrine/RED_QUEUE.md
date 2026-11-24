# Red queue — the open questions

The human-readable list of every open freestyle doctrine question awaiting the
rules expert (Red Husted) or the curator. `QUESTION_REGISTRY.csv` is the
machine-readable grain (Q01 through Q15); this document enumerates the same open
work by subject, one entry per operator, so each question can be answered on its
own. Each entry names the rows or names it affects, the exact fact that unlocks it,
and the condition that closes it.

## Working this queue

The maintenance rule is: when a question is answered, integrate the answer, record
the ruling, and delete the entry here. No tombstones. What follows is what
"integrate" involves, in order, because several steps are enforced mechanically and
skipping one produces a confusing failure rather than a clean error.

**1. Record the ruling.** Expert and curator rulings go in `RED_RULINGS.md`, or in
the standing doctrine document that owns the topic. A ruling derived from the
written record rather than from expert judgement carries its proof and its
adversarial checks in `OPERATOR_DERIVATIONS.md`, so a later ruling that changes it
has a chain to amend instead of an unexplained edit.

**2. Delete this entry.** The queue lists open work only.

**3. Update the machine-readable registry.** Before cutover, `QUESTION_REGISTRY.csv` is the grain
behind this document and is wired into the build: the observational-universe content
generator loads it and exits outright if it is missing, because doctrine blockers
cannot be validated without it. An Emerging Vocabulary row names a question there as
its blocker, so leaving a closed question's status stale leaves rows blocked on a
question that is answered.

**4. If the ruling defines an operator, update the operator authority.** An
operator's structure and X-Dex behaviour are owned by the `freestyle_operators`
table, changed through the operator editor, and its ADD by the modifier
registry: the `inputs/base_dictionary/trick_modifiers.csv` seed before
cutover, and the `freestyle_trick_modifiers` table, changed through the modifier
editor, after. The generator cross-checks these: a
ledger row still claiming an operator is undefined while the registry defines it is
reported as a reconciliation defect, and the registry wins.

**5. Clear the rows the answer unblocks, then, before cutover, re-run the generator
and read its warnings.** It reports rows gated on an operator the registry now defines, rows whose
owner disagrees with their question's owner, and names the live database has resolved
that the ledger still holds. Those warnings are the checklist for what the ruling left
half-done.

**6. Author the affected trick rows through the right path for the moment.** After
cutover the live database is the source of truth and every edit goes through the
audited admin surfaces — the trick edit page for scalar fields, the seven editorial
prose fields, aliases, source links and modifier links. The committed-CSV rebuild path
is pre-go-live history and is not used to edit a live row.

**7. Before cutover, rebuild and run the QC.** `run_freestyle.sh` rebuilds the freestyle tables from
the committed inputs; the trick-dictionary QC is a hard gate and must pass, including
the alias-versus-active-canonical collision check. The media-coverage QC is advisory.

**8. Apply the publication gate before promoting anything to accepted canonical
status.** It is set out in the freestyle maintainer guide under publication
governance, and its central rule is that arithmetic validity is not structural
certainty: when the ADD number is settled but the structure is contested, the trick is
held, not published. Holding it is the contract working, not a coverage gap.

A question none of this resolves stays here, or the affected name stays in Emerging
Vocabulary, visibly and honestly. Parking a name is a correct outcome, not a failure.
Frequency of attestation is evidence, never authority.

## Undefined operators

One operator, one definition: defining an operator unblocks every name that uses
it, so all of these map to the registry's single operator-definitions gate (Q02),
enumerated here per operator. ADD status is noted where it is already settled;
otherwise the weight is part of the ask. Close condition for each: the rules expert
defines the movement, and its weight where the weight is not yet evidenced.

- **Slapping.** Confirm or deny. An outside source defines a bare Slap; is slapping
  its prefix form? No "Slapping X" compound exists to cross-check, so this is a
  single yes/no, not an open derivation.
- **Arctic.** Undefined. Affected names: Arctic Butterfly, Arctic Whirl (the
  "frigidosis Pixie" and "Arc Walk" readings are on file but are not usable
  definitions).
- **Neutron.** Undefined. Affected names: Neutron Smasher, Neutron Double Legover,
  Neutron Drifter (folk aliases recorded, no structure).
- **Frootie.** Undefined. Affected names: Frootie Illusion, Frootie Legover, Frootie
  Mirage.
- **Fyro.** Undefined. Affected names: Fyro Torque (the Pyro Torque spelling folds
  into this token), Fyro Double Legover, Fyro Mirage.
- **Leaning.** Undefined. Affected names: Leaning Mirage, Leaning Osis (the "stepping
  inspinning" reading is recorded, not confirmed).
- **Twisting.** A degenerate structure with no exemplar; Toe Spinning Toe and the
  "What!?" name hang on it (registry Q14).
- **Twisted.** Undefined. Affected names: Twisted Butterfly, Twisted Mirage, Twisted
  PS Whirl, Twisted Torque (the "Dragon set Swirling Paradox" reading is recorded,
  not confirmed).
- **Snapping.** Undefined. Affected names: Snapping Butterfly, Snapping Symposium
  Mirage.
- **Wonton.** Undefined. Affected names: Wonton Butterfly, Wonton Illusion, Wonton
  Mirage, Pixie Wonton Butterfly.
- **Wrecking.** Undefined. Affected names: Wrecking Mirage, Wrecking Pickup, Wrecking
  Torque.
- **Slicing.** Undefined. Affected names: Slicing Butterfly, Slicing far Butterfly,
  Slicing Infinity (Lawn Moir's base reading, pending a notation authoring attempt).
- **Spyro's weight.** The rules expert ruled what spyro is: a gyro whose free foot
  plants (see the Spyro ruling). He did not say what it adds; every stored spyro
  total already reads it as gyro's +1, the plant scoring nothing. Ask: does the plant
  add anything? Its held names (spyro illusion, spyro mirage, spyro whirl, fairy
  spyro mirage) sit under registry Q14 with twisting, so they stay held until both
  halves are answered; Colossus (`colossus`, 6 ADD, technical name Spyro Diving
  Symposium Whirl) keeps its opening held until the weight is confirmed.
- **Zipper.** Undefined. Affected name: Zipper Stepping Op Butterfly Zipper.
- **Blistering.** Undefined, and open since the batch that answered its paired
  question (sailing) left this one unanswered; the ask is the movement. No canonical
  row; ADD unevidenced.
- **Symple.** The first question is what kind of token this is, since it attaches to
  entry primitives (Symple ATW, Symple Reverse ATW, Symple Guay) as readily as to
  bases: a distinct operator, or a spelling of a "simple" (bare) reading that folds
  into no operator. Affected names: Symple Butterfly and its same-side form, Symple
  Legover, Symple Pickup, Symple Reverse Swirl (same-side and far), Miraging Symple
  Butterfly, Spyro Symple Drifter. No canonical row, so its ADD is unevidenced.
  Unlock: whether symple names an operator at all, and if so its movement and weight.
  Close: Red identifies symple as an operator (with movement and weight) or as a
  spelling or variant that folds into an existing token.
- **Frantic.** Confirm or deny, not define: a folk reading records Frantic as a
  pixie-quantum stack, so the question is whether frantic is a distinct operator or a
  name for the pixie-plus-quantum combination (Frenzy is a folk alias of Frantic
  Mirage). Affected names: Frantic Butterfly, Frantic Clipper, Frantic Flail, Frantic
  Illusion, Frantic Legover, Frantic Mirage (Frenzy), Frantic Pickup. No canonical
  row; ADD unevidenced. Unlock: the pixie-quantum reading composes it from defined
  operators with no new weight; a distinct ruling needs its own movement and weight.
  Close: Red confirms the pixie-quantum reading or defines frantic as its own
  operator.
- **Fusing.** Confirm or deny whether fusing is the operator or prefix form of the
  fusion movement the platform already carries (fusion and its descendants cold_fusion
  and id), rather than a separate primitive. Affected names: Fusing Butterfly, Fusing
  Clipper, Fusing Legover, Fusing Mirage (Philibuster), Fusing Pickup, Fusing
  same-side Illusion, Fusing same-side Mirage. No canonical row; ADD unevidenced.
  Unlock: a fusing-equals-fusion ruling authors the band off the fusion structure; a
  distinct ruling needs its own movement and weight. Close: Red ties fusing to fusion
  or defines it independently.
- **Phasing.** Define: what is phasing structurally? The folk layer records
  per-compound aliases (Phase for Phasing Mirage, Spiral for Phasing Osis, Downward
  Spiral for Phasing Dyno, Frankenstein for Phasing same-side Swirl), but none
  decompose the operator itself. Affected names: Phasing Blender, Phasing Dyno,
  Phasing Mirage, Phasing Osis, Phasing Pickup, Phasing near Swirl, Phasing same-side
  Swirl. No canonical row; ADD unevidenced. Unlock: the movement and weight, which
  authors the phasing band. Close: Red defines phasing.
- **Slaying.** Define: what is slaying structurally? No narrowing evidence is on
  file. Affected names: Slaying Butterfly, Slaying Illusion, Slaying Mirage, Slaying
  same-side Flail, Slaying same-side Symposium Mirage. No canonical row; ADD
  unevidenced. Unlock: the movement and weight. Close: Red defines slaying.
- **Sonic.** Confirm or deny, not define: a folk reading records Sonic as a
  double-spinning movement, so the question is whether sonic is a distinct operator or
  a name for double spinning. Affected names: Sonic Illusion, Sonic Legover, Sonic
  Mirage, Sonic Pickup, Sonic Torque. No canonical row; ADD unevidenced. Unlock: a
  sonic-equals-double-spinning ruling scores it off the count-prefix answer; a
  distinct ruling needs its own movement and weight. Close: Red confirms the
  double-spinning reading or defines sonic independently.
- **Twinspinning.** Confirm or deny, not define: a folk reading records Twinspinning
  as nuclear inspinning, so the question is whether twinspinning is a distinct
  operator or a name for the nuclear-inspinning movement (Tornado is a folk alias of
  Twinspinning Mirage). Affected names: Twinspinning Illusion, Twinspinning Legover,
  Twinspinning Mirage (Tornado), Twinspinning Pickup, Twinspinning same-side Mirage.
  No canonical row; ADD unevidenced. Unlock: a twinspinning-equals-nuclear-inspinning
  ruling authors it off that structure; a distinct ruling needs its own movement and
  weight. Close: Red confirms the nuclear-inspinning reading or defines twinspinning
  independently.
- **The bubba prefix (registry Q15).** Not a define-the-movement question: bubba is a
  settled standalone trick (the active canonical bubba row is 2 ADD, and symposium
  bubba is 3 ADD), so this does not belong in the operator-definitions gate above.
  Like the spyro prefix, the open question is what bubba contributes when it prefixes
  another base. Affected names: Bubba Butterfly, Bubba Legover, Bubba Paradox Flail,
  Bubba same-side Mirage, Symposium Bubba Barfly, Symposium Bubba Mirage. Each has a
  published terminal and settled companion operators, so the prefix contribution is
  the only unresolved atom on all six. Evidence on file: the published Chainsaw
  Massacre (7 ADD, symposium-eggbeater base) leaves a residue of 2 after paradox and
  symposium, which is bubba's own standalone value — corroboration for a +2 reading,
  not a ruling. Chainsaw Massacre's own opening and Difficulty breakdown wait on the
  same answer. Unlock: the prefix contribution, which authors the Bubba-prefixed band
  off the settled bubba structure. Close: Red rules what the bubba prefix contributes.

## Notation and positional questions

Each is separable and answered on its own.

- **Paradox bracket, physical or convention (registry Q01).** Is the paradox `[PDX]`
  term physical content that one source records and another elides, or a notation
  convention? The answer also settles, for every blurry-named row, whether each
  blurry-form spelling is an alias of a live canonical or a distinct paradox-bearing
  variant.
- **Osis spin-to-catch relationship (registry Q10).** What is the structural
  relationship between the osis spin and its catch (the Butterfly near Osis hold)?
  The same question decides `double_spinning_clipper` and `gyro_osis`, which share a
  two-spin terminal-clipper formula on different asserted bases: whether Osis
  structurally embeds a spin.
- **Inward-on-a-gyro direction (registry Q09).** What does an inward qualifier denote
  on a gyro, whose base already carries its own OUT direction? It decides the
  withdrawn Inward Gyro batch.
- **Directional-syntax tokens (registry Q08).** Are the unresolved directional tokens
  in folk names (the alpine rows' inward and outward-style syntax) sanctioned path
  vocabulary, and how do they map onto the ratified IN and OUT terms?
- **Royale paradox construction.** Royale sits on the reverse-drifter line (base
  `reverse_drifter`, historical alias "paradox grifter"), and that placement is
  preserved, but its notation `CLIP >> SAME OUT [DEX] [PDX] >> SAME CLIP [XBD] [DEL]`
  disagrees with its base twice. Two separable asks: (a) should the reverse-drifter
  dex read `SAME OUT [PDX]`, or preserve the base's `OP OUT`? The corpus applies
  paradox inconsistently (paradox drifter, paradox mirage, and paradox torque keep
  the base `OP`; paradox whirl flips to `SAME`), so direction is not mechanically
  decidable. (b) [Resolved, James source-intent read: no canonical correction
  warranted.] The two `>>` no-plant links are structurally valid and corpus-attested:
  a no-plant entry off a clipper set appears in ripstein, mobius, and bullwhip, and a
  no-plant dex directly into a clipper terminal appears in tapping clipper
  (`TOE > OP OUT [DEX] >> SAME CLIP [XBD] [DEL]`), Royale's exact second-link shape.
  Link markers add no ADD (Royale remains 4). The corpus cannot prove the author's
  intent, but absence of that proof is not evidence of drift; the curated notation
  stands unless a primary source contradicts it. Only (a), the reverse-drifter dex
  direction, remains open; the canonical row is unchanged.
- **Down-family embedded-base coordinate frame.** Red has ruled the downs one family
  (a single structural decomposition with set and foot variants), which settles the
  grid; what remains is one line of doctrine: which coordinate frame names the
  embedded base of an operator compound, entry-relative after stripping operator
  contacts, with or without the body-spin frame inversion. It decides the three
  base-label tension rows (shooting star, tapping double over down, venom; detail in
  `DOWN_FAMILY.md`). No ADD changes ride on it.
- **What distinguishes the gyro turn.** The rules expert ruled gyro and spinning
  compounds distinct, each adding one for its turn, without saying what distinguishes
  the turns. The ratified-rulings record reads gyro as spinning with the dexterity on
  the setting foot; the operator reference reads it as a half turn where spinning is a
  full one. Ask: which is the definition? Close: record it, align the operator
  reference, and remove this entry.
- **What distinguishes Merlin from Symposium Miraging Mirage.** The rules expert ruled
  Merlin (Miraging Symposium Mirage) distinct from Symposium Miraging Mirage. Both store
  `SET > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]` at 4 ADD, and
  Symposium Miraging Mirage's own review note places its symposium on the first
  dexterity, where its formula puts it on the second. FootbagMoves gives Merlin 5 with
  an X-Dex. Ask: what physically distinguishes the two, and is Merlin 4 or 5? Close:
  record the answer, correct the formula that differs, and remove this entry.
- **Reverse Torque's notation, and whether it is Flux.** The rules expert ruled Reverse
  Torque an outward dexterity to a far osis; its stored notation
  `SET > SAME IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` writes an inward
  dexterity to a same-side catch. FootbagMoves gives Reverse Torque as Flux's technical
  name, `Set >> Op Out (DEX) > (front) Spin (BOD) > Op Clip (XBD)(DEL)`, which agrees
  with the ruling and matches Flux's stored formula on a toe set; footbag.org gives Flux
  as Atomic Osis and a Stanford list as Illusioning Osis. Ask: are Reverse Torque and
  Flux one movement? The same answer names Same-Side Blender: the ruling describes it
  as Blender's own movement ("Same-Side Blender, or Blender"), while the stored
  `blender_same_side` row writes a `SAME IN` dexterity no source gives. Close: record
  the answer, correct Reverse Torque's notation, fold or keep each row accordingly, and
  remove this entry.

- **Reverse swirling as a prefix.** Seven active rows carry a reverse swirling
  prefix: `reverse_swirling_pickup`, `reverse_swirling_osis`,
  `reverse_swirling_blender`, `reverse_swirling_paradox_torque`,
  `reverse_swirling_symposium_mirage`, `symposium_reverse_swirling_pickup` and
  `reverse_swirling_paradox_symposium_whirl`. None can be described yet, because the
  record gives the prefix no single meaning. Swirling is defined only in its outward
  form, a same-side outward dexterity ahead of the base; the reverse rule in the
  operator derivations covers a swirl appended at the end of a trick, not a reverse
  swirling dexterity in front. The rows also disagree with each other: five open with
  a same-side inward dexterity (`SET > SAME IN [DEX] > …`), while Reverse Swirling Osis
  opens with an opposite-side inward dexterity and a forward spin
  (`SET > OP IN [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]`). Three carry a
  `SAME SYMP [DEX]` token found nowhere else in the dictionary, where the standard
  form of a no-plant dexterity is `(no plant while)` with `[BOD]`. And Reverse
  Swirling Paradox Torque is stored on a Torque base while its notation ends
  `SAME IN [DEX] [PDX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]`, a same-side
  inward dexterity to a same-side catch, a cell neither Torque (an inward dexterity
  to a far osis) nor Reverse Torque (an outward dexterity to a far osis, by the rules
  expert's ruling) occupies.

  Ask for the rules expert: What does a reverse swirling prefix contribute? Is it the
  same-side inward dexterity five of the rows show, and if so, is Reverse Swirling
  Osis's opposite-side form an error or a different movement? Should
  `SAME SYMP [DEX]` be read as an ordinary no-plant dexterity? Is Reverse Swirling
  Paradox Torque built on Torque, on Reverse Torque, or on the same-side form its
  notation ends in?

  Until then the seven rows keep their current openings and receive no plain-language
  rewrite. Close condition: record the ruling in the ratified-rulings record, define
  the prefix in the operator authority if it is ruled one, correct any row whose
  notation or base the ruling changes, write the seven openings, and remove this queue
  entry.

- **Tombstone vs stepping reverse swirl shared notation.** Both carry
  `CLIP > OP IN [DEX] >> SAME IN [DEX] > SAME CLIP [XBD] [DEL]`. The bases
  live in different clipper-matrix cells: drifter's dexterity is the opposite
  leg circling inward to a same-side clipper, reverse swirl's is the same leg.
  The stepped forms collide because side re-registration after the plant is
  not consistently encoded; the footbag.org source (newmoves 258) itself
  writes tombstone's second dexterity as SAME IN after the plant. Tombstone
  is expert-attested with a live record; both stay distinct with no merge and
  no formula change. Ask for the rules expert: confirm the post-plant
  registration reading, and whether stepped compounds should re-register
  component sides relative to the planted foot. The same reading governs the
  tapping rows: the stored tapping definition writes the dexterity after the tap
  as SAME, which Tap, Tapping Legover, Tapping Illusion and Spinal Tap carry,
  while tapping pickup, whirl, drifter, eggbeater, clipper and guay keep OP;
  re-registering tapping guay would make it identical to tapping reverse guay.
  Close condition: record the ruling and remove this entry.

- **Sailing's structural decomposition.** Sailing's scored value is settled:
  a +2 set. Its decomposition is not: the modifier registry note reads
  pixie + quantum, the sailing legover description reads a pixie-illusion
  entry, the stored formula algebra reads a pixie lead plus an outward
  opposite-side dex, and the operator reference carries no sailing entry at
  all. The pixie eggbeater / sailing legover collision (byte-identical
  formulas, both 4 ADD) is held until this is settled: if sailing's second
  component is the outward opposite-side dex, the two names are one movement
  bracketed two ways; if not, they are distinct and the notation
  under-describes sailing. No disposition of the pair, no alias change, and
  no operator-reference entry before the decomposition is ruled.
  Close condition: rule the decomposition, add the operator-reference entry,
  dispose the pair accordingly, and remove this entry.

- **Quantum butterfly's derived formula.** Two sources agree on what quantum
  butterfly is: FootbagMoves names Tripwalk's form "Quantum Butterfly", and
  footbag.org newmoves 135 gives the same dual naming, both with the planted
  form `TOE > OP IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]`. The
  separate quantum_butterfly canonical carries a sibling-derived formula
  (`TOE > OP IN [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]`, no plant,
  same-side second dex) with no external attestation. Either the derived
  chassis is wrong and the row duplicates Tripwalk, or it is a real distinct
  movement that needs its own name. The Tripwalk / Toe Ripwalk identity merge
  stands independently of this question. quantum_butterfly is unchanged until
  ruled. Close condition: rule the true quantum-butterfly chassis, then
  merge, rename, or retain the derived row accordingly, and remove this
  entry.


- **Spun Down compounds vs the Barfly cell: frame-inversion identity.** The
  spinning and gyro forms of Barfly and Double-Over-Down (four rows), and the
  7-ADD pair spinning ducking superfly / spinning ducking symposium double
  over down, render semantically identical formulas. The unprefixed bases stay
  structurally distinct under the ratified Down grid - Double-Over-Down is the
  toe-set cell, Barfly the clipper-set cell, and Superfly is the
  source-attested Symposium Barfly identity - but the spin prefix replaces the
  original entry, so the set-surface distinction the grid runs on is no longer
  represented in the rendered formula. The unresolved question is whether the
  underlying Down-grid cell identity survives body-spin frame inversion once
  the original set surface is not explicitly written; this is the same
  doctrine class as the Venom "Barfly cell under spin inversion" reading.
  Bullwhip belongs to the same question: footbag.org move 290 gives it the gyro
  barfly notation exactly, its folk alias reads "spinning near double down", and
  the rules expert gave its base trick as gyro at 5 ADD. Whether Bullwhip, gyro
  barfly and gyro double over down are one movement is this ruling's to make.
  Within-segment bracket order is formatting, not evidence of structural
  difference ([DEL] [XBD] versus [XBD] [DEL]; [DEX] [BOD] versus [BOD] [DEX]).
  No merge, alias change, formula change, bracket-order normalization, scoring
  change, or family change is authorized. Close when the frame-inversion
  question is ruled and the cell identities of the spun compounds are recorded
  accordingly.
- **Near nuclear forms move the catch too (Barfry, Hurl).** Barfry
  (`CLIP > SAME OUT [PDX] [DEX] > SAME OUT [DEX] > SAME CLIP [XBD] [DEL]`, built on
  Matador) and Hurl (`CLIP > SAME OUT [PDX] [DEX] > SAME IN [DEX] > SAME CLIP [XBD] [DEL]`,
  built on nuclear whirl) are the attested near forms ("Nuclear near Butterfly",
  "Nuclear ss Butterfly", "Nuclear ss Whirl"). Against their far forms each moves two
  components to the same side: the base dexterity and the clipper catch. The ratified
  targeting rule moves the catch only when it is the sole off-side element, so the
  stored near configuration goes beyond it; it was derived from the far exemplars
  (far = OP on the base dexterity and the catch). PassBack's near/far is bag-relative
  in the down lineage, which may bear on Barfry. Ask for the rules expert: does a near
  qualifier on a nuclear butterfly or whirl move the catch as well as the dexterity?
  Both openings are held until it is ruled. Close condition: record the ruling, correct
  the two notations if the catch stays opposite, and remove this entry.

## Individual held tricks

- **Miraging Pincher.** What is Miraging Pincher structurally: a Quantum-like uptime
  inward set directly into a Pincher or Squeeze catch, a complete Mirage relationship
  combined with a Pincher terminal, or the "Stepping opposite Squeeze" structure
  recorded by the folk alias? Which component is the set, what is the terminal, and
  how should the trick be notated and scored? The held row (`miraging_pincher`, 3
  ADD, family unset, inactive) carries footbag.org's recorded form
  `CLIP > OP IN [DEX] > OP PINCHER [UNS] [DEL]` under the name "Stepping op Squeeze";
  the three readings imply different set, terminal, and decomposition, so the row
  stays held until one is chosen.
- **Atomic Miraging Butterfly's scoring.** The row (`atomic_miraging_butterfly`,
  base butterfly, linked to atomic only) stores 5 ADD and the notation
  `TOE > OP OUT [DEX] > OP IN [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]`.
  FootbagMoves lists it at 6, with an X-Dex on the middle inward dexterity:
  `Toe > Op Out (DEX) >> Op In (DEX)(XDEX) > Op Out (DEX) > Op Clip (XBD)(DEL)`.
  Settled doctrine says miraging is not a scored operator, which leaves atomic(+1) on
  butterfly(3) at 4. Ask for the rules expert: does the middle inward dexterity score,
  and does it carry the X-Dex FootbagMoves gives it, making the trick 4, 5 or 6 ADD?
  The row stays held, with no opening, until that is ruled.
- **Voodoo's structure, and whether Symposium Blur is Voodoo.** Footbag.org move 157
  gives Voodoo (technical name "Paradox Symposium Blur") at 5 ADD as
  `CLIP > SAME IN [DEX] [BOD] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]`;
  FootbagMoves gives it as "Paradox Merlin" at 6 ADD,
  `Clip >> Same In (DEX)(PDX) > (no plant while) Op In (DEX)(XDEX)(BOD) > Op Toe (DEL)`.
  Both are Merlin's shape with the first dexterity changed; they differ on whether that
  dexterity is a body or a paradox mark and on whether the symposium dexterity carries
  an X-Dex. Ask for the rules expert: is Voodoo paradox Merlin, and is it 5 or 6 ADD?
  The same answer decides Symposium Blur (`symposium_blur`, 5 ADD), a row whose name
  came from footbag.org text and whose notation the pipeline composed, with the
  symposium on Blur's first dexterity: is it Voodoo under another name, or a distinct
  trick? Both rows stay held, with no opening, until that is ruled.
- **Two symposium actions in a flailing compound (Bill and Ted).** The flailing
  derivation rules that a Symposium written after flailing restates the set and adds
  nothing, unless a source shows two distinct symposium actions, and proves it from
  Bill Ted's Excellent Adventure being published at 5 ADD. FootbagMoves gives that
  trick ("Flailing ss Symposium Eggbeater") at 7 ADD with two separate no-plant
  steps and an X-Dex:
  `Toe > (no plant while) Op Out (DEX)(BOD) >> (no plant while) Same Out (DEX)(XDEX)(BOD) > Op Out (DEX) > Same Toe (DEL)`,
  and Bill & Ted's Bogus Journey ("Flailing ss Symposium Double Legover") at 6 with
  the same two no-plant steps. Ask for the rules expert: is Bill and Ted 5 ADD
  (flailing on eggbeater) or 7 (flailing, a symposium eggbeater and an X-Dex), and
  does the redundancy ruling stand? The row (`bill_ted_s_excellent_adventure`, 5 ADD,
  no notation) stays held, with no opening, until that is ruled. The same answer
  decides Atom Bomb (`atom_bomb`, 6 ADD), whose FootbagMoves technical name is
  Flailing Symposium Mirage and whose notation carries the same two no-plant steps
  and an X-Dex: 6 if they count, 4 if the redundancy ruling stands.
- **Whether Blizzard is already a symposium move.** Blizzard (`blizzard`, 3 ADD,
  stepping on illusion) stores `SET > OP IN [DEX] > OP OUT [DEX] > OP TOE [DEL]`, with
  the support foot planted, while its own opening, footbag.org's description, calls it
  "a blurry reverse symposium mirage" and has the dexterity done "without planting the
  left foot". Symposium Blizzard (`symposium_blizzard`, 4 ADD) adds exactly that
  no-plant step: `SET > (no plant while) OP IN [BOD] [DEX] > OP OUT [DEX] > OP TOE [DEL]`.
  If the description is right, Symposium Blizzard restates Blizzard and Blizzard's
  notation and ADD are short a symposium; if the notation is right, the two are
  distinct and Blizzard's opening is wrong to say symposium. Ask for the rules expert:
  is Blizzard performed with the support foot planted or without it? Symposium
  Blizzard's opening stays held until that is ruled. Close condition: record the
  ruling, then either fold Symposium Blizzard into Blizzard and correct Blizzard's
  notation and ADD, or correct Blizzard's opening; remove this entry.
- **What "reverse" means in Reverse Magellan.** Reverse Magellan
  (`reverse_magellan`, 3 ADD, built on magellan) stores
  `TOE > OP IN [DEX] >> OP OUT [DEX] > OP TOE [DEL]`, the magellan's
  `TOE > SAME IN [DEX] >> SAME OUT [DEX] > SAME TOE [DEL]` with every side flipped and
  both directions kept. Its opening calls it "the reverse-direction form of the
  magellan", and its Technique Notes run the circles out-in then in-out. Ask for the
  rules expert: does Reverse Magellan reverse the dexterity directions, as its name
  and prose say, or the sides, as its notation records? Close condition: record the
  ruling, correct whichever of the notation or the prose is wrong, and remove this
  entry.

## Scoring and structure questions

- **Backside's structural axis.** What movement axis does backside belong to, and how
  should it be taught? Not whether it exists: it is ruled a body modifier, contributes
  +1 ADD, is distinct from directional naming like "inside", and carries three linked
  compounds across three families (backside symposium smear, backside magellan,
  backside paste). The registry records that the named compound Backside Blur
  decomposes structurally as Stepping Paradox Symposium Mirage while backside itself
  still contributes its own +1, so the expansion does not replace it. What is missing
  is the axis: it is neither a body rotation like spinning nor a head-or-body passage
  like ducking, and naming it either on the strength of the word "backside" would be
  inventing the classification rather than recording one. Until it is ruled, backside
  stays out of the ratified operator axes and its browse entry stays unlinked, the
  same treatment splicing gets for its own open question.
- **Blurry reading on three compounds.** Blurry normally means stepping and
  contributes one ADD. On Blur, Blurry Whirl, Blurry Torque and Food Processor, the
  settled per-trick composition uses the full stepping-plus-paradox structure and
  contributes two. Three named tricks are covered by neither ruling: Blurry Drifter,
  Blurry Symposium Whirl and Blurry Whirling Swirl. Each is notated with the same
  opening structure seen in the two-ADD reading, an inward dex followed by a paradox
  dex, and each would reach its currently published difficulty under that reading. Do
  these three use the two-ADD Blurry composition, or the ordinary one-ADD-flat
  reading? The published totals are consistent with the two-ADD reading, but a total
  that fits is arithmetic rather than evidence, and it is the notation rather than the
  total that puts the question worth asking: their opening matches the ruled group and
  does not match Blurriest, the row that anchors the flat reading and carries no
  expanded notation at all. Until it is ruled the three keep the flat reading, so the
  parser reports them as disagreeing rather than quietly resolving them either way.
- **Count-quantifier disposition (registry Q03).** How does a bare double or triple
  count prefix score, and are the count-quantifier names (double-dex X, triple-dex X,
  Double Guay and kin) dictionary rows at all? The drafted disposition routes them to
  internal renderer and parser cleanup rather than new trick rows. Double Dyno and
  Double Whip carry the additional ambiguity of their "(rev)" annotation; both are
  records-only. The active row Trixie (`trixie`, 5 ADD, technical name Triple Pixie)
  waits on the same answer: its notation runs three pixie dexterities with an X-Dex on
  the third, and its opening stays held until the triple count is ruled.
- **Repeated same-operator scoring (registry Q04).** When the same scored operator
  appears twice in one compound (miraging then miraging), does the second occurrence
  add again? Four rows sit in this gate, plus the active canonical paradox blur, a
  double-paradox whose asserted ADD waits on the same answer.
- **Terraging's three dexterities (registry Q05).** The rules expert ruled terraging "a triple
  Outside-In dex/set from a clipper", which settles its +3. It does not give the side
  of each of the three dexterities, nor whether Terrage, which its stored notation,
  its aliases and every outside source enter from a toe, is entered from a clipper.
  Five rows stay held until then: Terraging Illusion, Terraging Legover and Terraging
  Mirage, which have no execution notation, and Terraging Opposite Clipper and
  Terraging Same Clipper, whose published 4 ADD a three-dexterity reading would make
  5. Ask: which side does each dexterity take, and where does Terrage start? Close:
  write the notations, settle the clipper rows' ADD, and remove this entry.
- **Cross-body rake base (registry Q06).** What is the cross-body rake base
  structurally, a terminal contact posture like clipper, or a raking path? One
  contract, and every rake compound composes defined operators onto it; Snowflake
  needs it now, and a parser-section drain of roughly 47 slugs follows.
- **Three-outward clipper sequence.** A cluster carries three consecutive outward
  dexes resolving to a clipper, which the two-dex Down grid cannot classify: `fusion`
  (`TOE > OP OUT [DEX] > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]`, labeled
  `base_trick=double_over_down`), and its descendants `cold_fusion` (a `[PDX]` on the
  lead dex) and `id` (a `DUCK` inserted between dexes). Do three outward dexes
  resolving to a clipper contain a two-dex Down chassis plus one added dex, or a
  distinct Triple or Fusion movement whose parity is defined independently of the
  four-cell grid? These three stay bounded row-level holds. `sailing_double_over_down`
  is not one of them; its cell-dex rendering is a separate bounded question, held pending the Sailing decomposition.
- **Plasma parity, source evidence needed.** `plasma`
  (`TOE > OP IN [DEX] > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]`, family
  `plasma`, no base trick, named a quantum double-over-down) has a mixed
  `OP OUT > SAME OUT` core matching neither the double-over-down cell
  (`SAME OUT > SAME OUT`) nor the paradon cell (`OP OUT > OP OUT`). No parity
  normalization by analogy is applied; notation, family, and prose stay unchanged
  pending a provenance audit establishing whether the mixed core is intentional or
  drift.
- **The general osis-suffix rule.** Is there a single rule for what an osis suffix
  contributes across the compounds that carry it? A general answer replaces the
  per-row curator path for the whole osis-suffix band; the general osis-suffix
  compositional default is already ruled, and this is the finer question that remains.

## Records-only and memory riders

These block only a world-record badge or ask a memory question; none gates a
dictionary row. Their live tracking home is the unresolved-world-record-videos item
in the maintainers' private tracker.

- **Stepping Ducking Blurry Whirl.** The folk name reads four operators at 6 ADD
  while the structured name reads two operators at 5; which reading the badge takes is
  open.
- **The Motorfly memory check.** One source carries the name Motorfly with no
  technical name and nothing else appears anywhere; the ask is simply whether anyone
  remembers what it is. A null answer confirms the attested-only class rather than
  failing it.
- **The reported 9-ADD landing.** An account relayed to the project holds that a
  9-ADD trick was landed, but the cleanliness of the landing is disputed. The ask is
  the concrete record: which trick, roughly when, whether footage or witnesses exist,
  and the exact reason the landing is questioned, so the frontier ceiling note can
  move from anonymized testimony to a corroborated or retired entry. Until then the
  documented ceiling stands at 8.

## With the curator

- **Path or catch terminal syntax (registry Q07).** How a trick that ends on a path
  or a catch, rather than a stall, is written in operational notation. This is a
  notation-syntax rule for the curator to write, not a question for the rules
  expert; it goes to the rules expert only where a particular movement's physical
  ending is in doubt. It decides how the ambiguous-terminal formula names read.
  Close: the syntax rule is recorded and the affected notations follow it.
- **Orbit canonical name.** Direction is structural, so orbit and around-the-world
  are separate tricks; that is settled and not at issue. What is open is which name
  the orbit row carries as canonical. The dictionary names it by the folk name
  `orbit`, with `reverse around-the-world` as a displayed structural alias, matching
  the one-true-name premise that structural readings are secondary and searchable.
  Two facts pull the other way: the direction ruling itself is written "ATW ≠
  reverse-ATW", naming the orbit side structurally, and orbit has the weakest folk
  attestation of the three direction mirrors — the footbag.org corpus carries no
  orbit row and treats around-the-world as direction-neutral, and no bare-orbit
  competition record exists. Against a change: orbit is a locked core atom named by
  folk convention among the twelve, and `double_orbit`, `triple_orbit`, and
  `orbit_kick` embed the name. Closes when the curator rules whether the folk name
  stays canonical; if it does not, the slug-preserving correction plus
  display-name-exception mechanism is the one the reverse whirl rename used.
