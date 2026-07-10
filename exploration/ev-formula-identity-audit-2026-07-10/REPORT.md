# Emerging Vocabulary formula-identity audit

Read-only audit. No content authored, no generator/resolver/parser/dictionary/alias/status
change, no Red questions created. Applies the completed movement-language framework (Phase I)
to the current Emerging Vocabulary backlog. Does not begin Phase II.

Core premise applied throughout: a trick's identity is its movement formula; names attach to
formulas. Every row was tested for whether it resolves to a formula that is already represented,
genuinely new and authorable, or blocked, rather than matched literally as a name.

Row-level artifact: `EV_FORMULA_IDENTITY_ROWS.csv` (819 rows; submitted name, normalized name,
proposed formula, matched object, match type, ev-state, hold-kind, failure-class, final
disposition, blocker subtype, residual home, confidence, source).

Method note: the audit is grounded in the generator's own per-row structural classification (the
nine-state ladder plus the specific `holdKind` and `failureClass` it stamps), which is the
project's formula-resolution layer, then refined by (a) formula-identity name resolution against
the published trick and alias set (the folk-suffix / abbreviation / positional-exact candidate
logic), and (b) a settled-operator allowlist taken from the canonical operator authority
`freestyleOperatorReference.ts`. Disposition B is deliberately strict: a name that resolves as a
recognized token is not authorable unless every operator in it has a settled definition.

## 1. Total rows audited

819 (the Emerging Vocabulary surface after the represented-name resolver fix).

## 2 and 3. Final dispositions

| | Disposition | Rows | % |
|---|---|---|---|
| A | Already represented (another label for an existing formula or object) | 317 | 38.7% |
| B | New, formula-resolved, authorable now | 12 | 1.5% |
| C | Formula-blocked (missing token / undefined operator / parser / notation-governance / doctrine) | 318 | 38.8% |
| D | Identity-blocked (name maps to more than one formula; needs a curator or identity ruling) | 71 | 8.7% |
| E | Source-blocked (plausible structure, needs stronger source or video review) | 2 | 0.2% |
| F | Not a trick object (set/operator label, folk residue, malformed, duplicate) | 99 | 12.1% |

**Already represented after formula and name resolution: 317 rows (38.7%).** These are labels for
a formula that exists elsewhere: fuzzy misspellings that resolve to a published canonical trick,
and lexical duplicates of another row's formula. Note this is on top of the 151 rows the resolver
fix already removed from the surface; counting those, roughly half of the raw observed-name intake
was duplicate naming rather than genuine movement absence.

## 4. Genuinely new, formula-resolved, immediately authorable

**12 rows.** The dominant cluster is Inward Gyro (see output 9). This number is small by design:
the strict rule rejects any row whose operator lacks a settled definition, which removes a large
band of token-recognized-but-undefined names that a literal reading would have called authorable.

## 5. Blocked by formula, notation, parser, or operator gaps

**318 rows (disposition C).** The largest sub-bands: 103 parser (ambiguous terminal mechanic),
59 blurry-expansion predicate, ~90 undefined or open-definition operators (frantic, neutron,
surfing, floating, splicing, flailing, slicing, railing, arctic, symple, slapping, fusing,
phasing, slaying, sonic, and the rest), 24 notation-governance (zulu / weaving, no notation
token), 17 double-prefix / count-quantifier riders, 12 cross-body rake base, 5 directional syntax.

## 6. Blocked by identity or source questions

**73 rows (D 71 + E 2).** Identity: 40 positional forms needing a same-side-equivalence call,
21 down-family per-trick verifications, 10 competing multi-name identities. Source: 2 (POD, needs
a video viewing to settle versus Dimmier; Kiwi, a source-internal contradiction not rulable from
the record).

## 7. Row-level artifact

`EV_FORMULA_IDENTITY_ROWS.csv`, one row per Emerging Vocabulary entry, sorted by disposition then
blocker then name. Confidence is high for rows anchored on a definite match or a specific
hold-kind, medium for folk / parser rows whose structure is unrecovered.

## 8. Highest-impact resolver improvements (to auto-collapse future duplicate intake)

Ranked by how much duplicate naming each would absorb automatically.

1. **Structural-parse formula equivalence.** Parse each incoming name to its operator-plus-base
   formula and match on the formula, not the slug string, against published tricks' formulas.
   This is the general form of the Nuclear finding: it collapses decomposed noun-phrase names and
   nickname compounds that no string match catches. Duplicate class: decomposed-form and
   compound-phrase duplicates. Examples: any "Gyro Torque" for mobius, "Atomic Legover" for
   eggbeater. Rows affected: the whole A pool and more (300-plus over time). False-positive risk:
   medium (requires a reliable parser and must keep the positional guard, which forbids collapsing
   a side configuration to its base). Home: structural parsing, backed by curator-maintained
   equivalence data for the cases the parser cannot settle alone.
2. **Historical-nickname to official-set equivalence data.** Map the settled nickname patterns
   (Illusioning X, Miraging X, Barraging X) to their official set (Quantum X, Atomic X, Furious X)
   as curated alias rows. Duplicate class: historical-nickname compounds. Examples: 24
   nickname-lead rows currently on the surface plus more embedded. Rows affected: ~24 to ~40.
   False-positive risk: low (the doctrine is settled). Home: curator-maintained equivalence data
   (alias resolution).
3. **Terminal-atom validation (operator/set-label rejection).** A name that does not terminate in
   one of the twelve core atoms is not a publishable trick object; route it to not-a-trick at
   intake. Duplicate class: bare set/operator labels and folk residue. Examples: "Nuclear" alone,
   "BS Paste", "Bubba Beater". Rows affected: ~99 (the F pool). False-positive risk: low. Home:
   structural parsing (this is the deferred terminal-atom check).
4. **Settled-operator gate at intake.** Flag any name whose operator is absent from the operator
   authority (frantic, neutron, surfing, and the rest) so an undefined-operator name is queued for
   a definition rather than presented as authorable. Duplicate class: token-recognized but
   structure-undefined operators. Rows affected: ~90. False-positive risk: low (it queues rather
   than drops). Home: structural parsing (operator-vocabulary gate) plus curator (define or reject).
5. **Lev-1 misspelling promotion to hard alias rows.** The generator already folds fuzzy
   misspellings to an alias state heuristically; promoting the confirmed ones to real alias rows
   makes intake deterministic and shrinks the fuzzy band. Duplicate class: spelling and
   spacing variants. Rows affected: up to 317 (the alias-state pool). False-positive risk:
   low-to-medium at the one-edit boundary (needs a confirm step). Home: alias resolution.

## 9. First safe authoring batch: none survives the notation-authority check

The candidate first batch was Inward Gyro (nine Shred Global rows). Applying the explicit
notation-token authority check to it, it **fails and is withdrawn**. No clean immediately-authorable
batch survives on the current surface.

Authority check on Inward Gyro:
- **Gyro is a settled operator** (in the operator authority; spinning and dexing with the same foot
  that set the bag). This holds.
- **"inward" is not a valid notation token.** It appears in the codebase only as prose ("inward
  dex" describing miraging and quantum), never as a token the notation system emits. Direction in
  this notation is expressed as IN / OUT on the dex, and a gyro's dex direction is already
  intrinsic to which base it resolves to: gyro_mirage is the IN-dex form, gyro_illusion the OUT-dex
  form.
- **The combination therefore needs a new token or a ruling, and collides with existing structure.**
  Every non-pixie Inward Gyro row already has a published plain gyro_X canonical:

  | Observed name | Existing canonical | Its dex | What "inward" means |
  |---|---|---|---|
  | Inward Gyro Mirage | gyro_mirage | IN | redundant (already the IN form) -> already represented |
  | Inward Gyro Guay | gyro_guay | IN | redundant -> already represented |
  | Inward Gyro Reverse Guay | gyro_reverse_guay | IN | redundant -> already represented |
  | Inward Gyro Symposium Mirage | gyro_symposium_mirage | IN | redundant -> already represented |
  | Inward Gyro Butterfly | gyro_butterfly | OUT | collides (butterfly is the OUT form) -> ruling |
  | Inward Gyro Flail | gyro_flail | OUT | collides -> ruling |
  | Inward Gyro Illusion | gyro_illusion | OUT | collides (illusion is OUT; IN would be the mirage) -> ruling |
  | Pixie Inward Gyro Mirage | pixie_gyro_mirage (absent) | mirage=IN | "inward" redundant; the real question is the plain pixie_gyro_mirage |

  So an "Inward Gyro X" name is either a redundant restatement of an existing gyro_X (already
  represented) or a direction collision with the base's own OUT dex (needs a decision on what, if
  anything, "inward" denotes on a gyro). It is not authorable.

Consequence: this audit's disposition-B allowlist wrongly trusted "inward" as a direction token, so
the true immediately-authorable count is smaller than the headline 12. Withdrawing the Inward Gyro
rows leaves only a handful of individually-uncertain candidates (Nuclear Ducking Mirage, which may
be Ducking Sumo since Nuclear Mirage is the alias Sumo; Toe set Gyro Torque; Da Da Curve Swirl),
each needing its own verification and none forming a clean batch. **The honest position is that the
current surface has no ready-to-author clean batch.** The "what, if anything, does inward denote on
a gyro" question is a Notation-paper item; the redundant rows are already-represented duplicates.

**The earlier Frantic recommendation does not survive this audit either.** Frantic is a recognized
token but is not a settled operator in the operator authority and has no defined ADD, structure, or
X-Dex; the generator itself groups it with the folk operators. The Frantic rows cannot be authored
with a defined formula and are disposition C (operator-definition-pending), routed to the Scoring
paper. Both the Frantic and the Inward Gyro recommendations rested on the generator's
authoring-state signal, which means only "the tokens are recognized" -- exactly the literal-name
shortcut this audit was built to catch. That the lead candidate failed the deeper check on a second
pass is the strongest evidence for the working-understanding change below.

## Working understanding of Emerging Vocabulary going forward

- **Freshly generated does not mean correctly classified.** A row's generator state (ready /
  authoring) reflects token recognition and heuristics, not verified movement authority; treat it
  as a lead, never as a warrant to author.
- **Recognized name tokens do not equal formula authority.** A token in the generator's known
  vocabulary is not the same as a settled operator (with a defined ADD, structure, and notation) in
  the operator authority, nor the same as a valid notation token. Frantic is recognized but
  undefined; inward is recognized in prose but is not a notation token.
- **Formula identity, not trick-name matching, drives authoring.** Author only when the movement
  formula is settled, every operator and token is defined in the authority and representable in the
  notation, the row is not a redundant restatement or a collision with an existing canonical, and
  the evidence supports publication. When a name resolves to a formula that already exists, it is a
  label, not a new trick.

## 10. Residual blocker map (where unresolved rows belong)

No standalone Red questions are created. Each Red-facing band is assigned to one of the remaining
doctrine papers (Frontier, Notation, Scoring, History); everything else is curator, parser,
source, or internal governance work.

| Residual home | Rows | What sits here |
|---|---|---|
| Scoring paper | 179 | blurry-expansion predicate; operator structural definitions (frantic, neutron, surfing, symple, slapping, and the rest); repeated-operator scoring; terraging-chain arithmetic |
| parser (internal) | 103 | ambiguous-terminal-mechanic rows the parser cannot yet decompose |
| curator equivalence data | 40 | positional (same-side / far / near) forms awaiting a same-side-equivalence ruling |
| Notation paper | 35 | zulu / weaving notation-governance (no WEAVE/ZULU token); cross-body rake base and register; unresolved directional syntax |
| curator, Identity paper sets the frame | 21 | down-family per-trick embedded-base verification |
| curator identity ruling | 10 | competing multi-name identities |
| source / video review (Red queue, with the curator) | 2 | POD versus Dimmier; Kiwi source contradiction |
| internal (tracked deferral) | 1 | pogo operator reactivation |

Nothing routes to the Frontier or History papers from this backlog; those papers cover other
material. The Identity paper's open half (the down-family embedded-base frame) governs 21 rows but
their per-trick resolution is curator work once the frame lands.

## One-line conclusion

Of 819 observed names, roughly 39% are duplicate labels for formulas that already exist, another
12% are not trick objects, and the headline "12 authorable" collapses toward zero once the
notation-token authority check is applied to the lead candidate. The backlog is overwhelmingly
duplicate naming and blocked formulas, not a reservoir of unbuilt tricks. Frantic is blocked on an
operator definition; Inward Gyro is withdrawn because "inward" is not a notation token and the
gyro dex direction is already intrinsic. No clean ready-to-author batch survives on the current
surface. Formula identity, not name recognition, is the gate.
