# Footbag Freestyle Doctrine Treatise

A dependency-graph audit of freestyle-dictionary knowledge: what is settled, what is
unsettled, which unresolved questions are root blockers, how many tricks each controls,
who can answer them, and the shortest path to maximum frontier collapse.

Grounded in: the live DB (`freestyle_trick_modifiers`, `freestyle_tricks`), the content
modules under `src/content/`, the curator rulings in `freestyle/inputs/curated/tricks/red_*.csv`
source-notes, the exploration audits (June 5 -> June 14), and project memory.

---

## 0. Executive summary

**The frontier is doctrine-bound, not discovery-bound.** The fb.org/FM/Stanford/PassBack
corpus is fully tier-audited and every clean compound of *settled* vocabulary has been
promoted. What is left is gated by a small number of unresolved operator-semantics
questions. The next 100+ unlocks are not hidden tricks; they are tricks that already exist
in the corpus but cannot be authored until ~8 doctrine questions are answered.

**Two numbers frame everything:**

- Published table: **752 active** canonical tricks, **64 inactive** in-table (34 `pending`,
  28 `expert_reviewed`-but-held, 2 `curated`).
- External frontier: **~1,640 unique non-canonical** candidate names (down from ~1,844 in
  early June). This is the real unlock pool; it lives in the corpus/exploration files, not
  in `freestyle_tricks`.

**The single structural insight of this audit:** of the **35 registered modifiers** (each
has a settled ADD bonus in `freestyle_trick_modifiers`), only **18 have a defined operator
chassis**; **17 are "registered but undefined"** — they have a number but no structural
definition. That gap is the spine of the frontier. But it splits sharply into two very
different categories that have been wrongly lumped together as "blocked":

- **Merely unwritten (INTERNAL work, not blocked):** ~10 of the 17 have settled ADD *and* a
  settled decomposition; only the operator-reference entry is unwritten. The 7 composite
  sets (railing, sailing, splicing, surfing, floating, shooting, warping) are the clearest:
  their decompositions are in the modifier-table notes. Authoring their chassis is a
  keyboard task, not a Red question.
- **Genuinely blocked (needs a ruling):** ~5 have **zero notated exemplars** — blazing,
  terraging, and the deepest of warping/floating/splicing — so authoring would *fabricate*
  the operator. These need one sentence from Red each.

**Shortest path to maximum collapse (Part V):** three rulings — **DOD/DDD policy (~46),
Weaving (~32), and one "movement-verb" session (motion/flailing/frantic/twisting, ~11)** —
convert roughly **75-90 frontier entries** from blocked to mechanical. Everything else is
singletons or governance.

**Temporal caveat (load-bearing):** the corpus moved fast. The June 5/6 SKILL.md §B numbers
are partly superseded by the June 10-14 audits; the authoritative open-question inventory is
`exploration/red-frontier-doctrine-round-2026/PACKET.md` (June 14). And several "settled"
items were *staged or HELD* pending greenlight — most importantly, **atomic = +1 is FINAL in
doctrine but NOT shipped**: the live `freestyle_trick_modifiers` table still encodes
`atomic +1/+2` (the +2-rotational form), and the parser still uses the old rotational model.
Verify code state before treating any "RESOLVED" item as live.

---

## Part I — Settled doctrine inventory

For each: ruling / source / affected tricks / downstream.

### I.1 The 35-modifier registry (ADD authority)
- **Ruling.** ADD bonuses live exactly in `freestyle_trick_modifiers` (`add_bonus` /
  `add_bonus_rotational` / `modifier_type`), never derived from trick rows. The 35 modifiers
  by bonus: **0** = pogo, rooted. **+1** = atomic (live: +2 rotational), backside, blazing,
  blurry, diving, ducking, fairy, gyro, illusioning, inspinning, miraging, paradox, pixie,
  quantum, spinning, stepping, swirling, symposium, tapping, weaving, whirling, xdex. **+2** =
  barraging, furious, nuclear, railing, sailing, splicing. **+3** = floating, shooting,
  surfing, terraging, warping.
- **Source.** `freestyle_trick_modifiers` (DB), `database/schema.sql`.
- **Downstream.** Governs all compound ADD math; the bracket-count==ADD gate.

### I.2 Atomic / X-Dex separation — FINAL in doctrine, HELD in code
- **Ruling.** Atomic is **+1**. An **X-Dex** is a separate +1 conditional event on the
  *following far* dex (not part of atomic). Qualifying sets that trigger an X-Dex: atomic,
  quantum, sailing, frantic. Receivers: mirage, illusion, whirl, torque, drifter. Excluded:
  swirl, barfly, down moves.
- **Source.** `freestyleOperatorReference.ts`; memory `project_atomic_xdex_doctrine`,
  `project_pt14_rulings_nuclear_deferred`.
- **Affected.** atomic/quantum/xdex; Atom Smasher (atomicX mirage = 4), atomic-torque
  (corrected to 5).
- **Downstream / status.** **HELD, not shipped.** Live table still `atomic 1/2`; parser
  treats atomic as a +2-rotational proxy. The audit (exactly 13 totals move) is done; the
  migration awaits greenlight. Only the **whirl/swirl X-Dex eligibility tail (E1)** is
  genuinely open.

### I.3 illusioning == rev(0) miraging — SETTLED, live
- **Ruling.** `illusioning` is the reverse-direction form of `miraging` (+1, both base types),
  parallel to illusion = rev(0) mirage.
- **Source.** modifier-table notes; memory `project_frontier_canonicalization`.
- **Affected.** illusioning; underlies omelette (illusioning pickup = 3).
- **Downstream.** The canonical "direction is structural" example.

### I.4 Set-operator ADD values + composites — values SETTLED
- **Ruling.** barraging +2 (two-dex uptime; furious is the SAME operator, +2). nuclear +2 =
  paradox dex + downtime illusioning dex, carries NO X-Dex. sailing +2 = pixie + quantum.
  railing +2 = rooted + sailing. splicing +2 = gyro + reving. shooting +3. surfing +3 =
  fairy + symposium + swirling. warping +3 = two-dex set (2nd = symposium). floating +3 =
  quantum + symposium + quantum. terraging +3. rooted/pogo = 0.
- **Source.** `freestyle_trick_modifiers` notes; memory `project_pt14_rulings_nuclear_deferred`.
- **Downstream.** ADD values settled; the *decompositions are known* — but the
  operator-reference **chassis is unwritten** for the +2/+3 composites (see I.13 / Part II).

### I.5 Backside — SETTLED +1
- **Ruling.** `backside` is a real +1 body modifier (symposium-strength), not a directional
  term. Source: modifier-table notes. Affected: backside, Backside Blur. Chassis unwritten.

### I.6 Family taxonomy — SETTLED
- **Ruling.** Three display tiers: **Family Parent** (conserved terminal identity + >10
  descendants), **Minor Lineage** (<=10), **Foundational Terminal Surface** (toe/clipper
  stall, excluded). Admission to public-family at all = conserved terminal identity AND **>2
  recursive descendants (HARD RULE)**. Families emerge from topology, not hand-picked.
  Doctrines: terminal-identity base (a paradox-whirl still *is* a whirl, read from each
  trick's own notation); entry-side primitives are NOT roots (ATW reclassified out);
  whirl != swirl; branch->root containment (torque/blender under osis; dlo/eggbeater under
  legover).
- **Source.** `freestyleFamilyTiers.ts`, `freestylePublicFamilies.ts`,
  `freestyleFamilyInvariants.ts`; memory `project_family_taxonomy_doctrine`.
- **Affected.** Roster of 24 first-class families -> 16 Family Parents + 8 Minor Lineages.
  Parents: osis(84)/whirl(74)/legover(71)/mirage(69)/butterfly(48)/illusion(34)/swirl(29)/
  pickup(27)/blender(22)/torque(22)/double-leg-over(16)/drifter(14)/barfly(13)/eggbeater(13)/
  double-over-down(12)/inside-stall(11).
- **Downstream.** Public By-family browse; reversible TS overlay, no schema change.

### I.7 Canonical Trick Publication Contract — SETTLED policy, 0 code enforcement
- **Ruling.** Six requirements gate canonical promotion (symbolic rep / structural
  composition / discoverability / alias governance / honest incompleteness / no fabricated
  structure). **Arithmetic validity != structural certainty** — a clean ADD never licenses
  asserting a contested structure (held, not published).
- **Source.** `docs/CANONICAL_TRICK_PUBLICATION_CONTRACT.md`; memory
  `project_canonical_trick_publication_contract`.
- **Downstream.** Enforced only by curator discipline + `is_active=1`. The maintainer
  tightened intent (2026-06-14): "render honestly with pending gaps" is migration-only;
  first-class now intends complete notation AND decomposition. A demotion/hide mechanism
  (`publication_state` column) was **not built**. Residual = 84-row curator backlog.

### I.8 guay / rake / whirling / spyro / warping — SETTLED
- **Ruling.** guay = pickup -> inside-stall (consolidated as an inside-stall member). rake =
  scoop -> toe-stall = reverse of pendulum (swing-element exception). whirling = uptime whirl
  dex, +1, flips leading dex parity. spyro = plant-before-dex gyro (structurally = gyro; name
  has shifted toward inspin). warping = two-dex set, 2nd dex symposium, +3.
- **Source.** SKILL.md; modifier-table notes; CSV source-notes.
- **Downstream.** Notation completion of already-canonical bases; guay->inside-stall fold.

### I.9 Swing-element exception (pendulum / rake) — SETTLED
- **Ruling.** pendulum is the only trick with an **arbitrary final surface** — terminal
  renders as open `(contact)`, 2-ADD swing element, 1 bracket. rake is its direction variant
  (swing > toe). Source: CSV source-notes; SKILL.md. (Just shipped: pendulum notation
  corrected to `TOE SWING (SET) > (contact)`.)

### I.10 Quantity ladder + surging — SETTLED
- **Ruling.** double/triple are repetition quantifiers (NOT families, NOT difficulty
  progressions). double = set applied twice (double pixie = terraging). **surging is NOT a
  primitive** — always decompose to spinning + stepping (no surging row).
- **Source.** `freestyleQuantityLadders.ts`, `freestyleOperatorReference.ts`; CSV.

### I.11 Operator-notation symbolic standard — SETTLED
- **Ruling.** Symbolic CAPS in brackets; **bracket-count == ADD is the hard gate**. Token set:
  `[DEX] [BOD] [XBD] [PDX] [DEL] [UNS] [XDEX]`. Stalls = surface + `[DEL]` (unusual = `[UNS]`);
  kicks end in non-scoring `[KICK]`; flying = `FLYING [BOD]`; cross-body = `[XBD]`. Notation
  stored opaque in `freestyle_tricks.notation`, never re-parsed.
- **Source.** memory `feedback_op_notation_kick_vs_stall`; `freestyleOperatorGrammar.ts`.
- **Downstream.** Chassis derivation by mirroring a same-operator sibling exemplar; the
  ADD-math pre-write gate.

### I.12 Slug normalization / direction / held-delay lineage / movement systems — SETTLED
- rev-X preferred over reverse-X; qualifier parentheticals don't change slugs; direction is
  structural (mirage != illusion). atomic-legover = eggbeater; atomic-double-leg-over =
  predator; self-reference suspicion rule (no atomic-eggbeater). Movement systems = four
  observational axes that never reshape `trick_family`.
- **Source.** memory `feedback_freestyle_slug_normalization`; `freestyleMovementSystems.ts`.

### I.13 The operator-reference coverage map (the spine)
- **18 DEFINED** (chassis exists in `freestyleOperatorReference.ts` and/or
  `freestyleMovementSystems.ts`): atomic, blurry, quantum, nuclear, barraging, inspinning,
  whirling, paradox, spinning, ducking, symposium, stepping, pixie, fairy, gyro, diving,
  miraging, weaving(axis-only).
- **17 REGISTERED-BUT-UNDEFINED** (ADD bonus, no chassis): **backside, blazing, floating,
  furious, illusioning, pogo, railing, rooted, sailing, shooting, splicing, surfing,
  swirling, tapping, terraging, warping, xdex.**
- Of these, several are *cosmetic* gaps (furious = barraging; illusioning = rev(0) miraging;
  gyro intentionally unlinked; xdex intentionally not a prefix operator). The substantive
  gaps are in Part II.

---

## Part II — Root unresolved questions

Authoritative inventory: `exploration/red-frontier-doctrine-round-2026/PACKET.md` (June 14).
For each: question / why unresolved / who answers / trick impact.

| # | Cluster | Open question | Why unresolved | Who | Impact |
|---|---|---|---|---|---|
| **A1** | **DOD / DDD policy** | Is DOD (Double-Over-Down) the same structure as DDD (Down-Double-Down)? If distinct, the rule? | Both read 4 ADD as bare bases, kept as separate rows; "down" may be a naming layer (Option C) not a base. | **RED** | **~46** (the down cluster) / ~30 immediate. Highest leverage. |
| **A2** | **Weaving** | Is weaving an operator (+N), a movement family (+0), or a naming layer? | No notation authored; no source gives its ADD; spreads across stall + dex bases (operator-shaped). Registered +1 is a placeholder. | **RED** | **~32**. |
| **A3** | **Blurry transitivity** | Is blurry +1, +2 (stepping+paradox), or base-type-dependent? | Registered flat +1, but asserted ADDs split: +1 non-rotational, **+2 rotational** (blur, blurry-whirl 5, blurry-torque 6) — the same tension atomic had. pt11 logged "pt12 follow-up owed." | **RED** | ~7 direct + dictionary-wide ripple. |
| **B1** | **Pogo** | Does pogo add ADD — +0 (Red) or +1 (corpus)? | Red said 0; fb.org lists all **13 pogo compounds exactly +1 above base, zero counter-examples**. Clean ruling-vs-corpus contradiction. | **RED** | **13** (all promotable either way). |
| **C1** | **Shooting (residual)** | Do same-side ("ss") shooting variants collapse to opposite-side, or distinct rows? | +3 settled; no ss exemplar exists to decide the duality. | **RED** / NEW-EVIDENCE | ~13 residual. |
| **C2** | **Spyro naming** | Does "spyro" mean gyro (folk alias), inspin, or a distinct variant? | Structurally byte-identical to gyro-X (Pandora = Spyro Pickup = gyro-pickup), but Red noted the name shifted toward inspin; one fairy-spyro case diverges by a dex-side. Structure may be settled (= gyro); only naming governance open. | **RED** (naming intent) | ~6. |
| **D1** | **Illusioning governance + compression-intent** | Spawn a parallel "illusioning-X" family, or keep illusioning as a rev(0) reading? + the locution/verb-discipline doctrine (hidden-vs-flat). | Arithmetic settled (+1); governance/presentation open. Compression-intent (Semantic Compression Doctrine L1-4) still formally Unresolved. | **DAVE/CURATOR** (governance) + RED (compression verbs) | Governance-only on ADD; affects glossary prose dictionary-wide. |
| **E1** | **X-Dex eligibility tail** | Are whirl / swirl X-Dex-eligible when an atomic compound on them appears? | mirage=eligible, blender/drifter/torque=not, **whirl/swirl=undetermined (no active atomic compound exists yet)**. | **RED** (minor) | a few. |

### Items that are CLOSED — do not re-raise
- **Atomic-rotational "Q3" (+2-vs-+1):** RESOLVED (atomic = +1, X-Dex separate). Migration HELD.
- **atomic-implicit-paradox / predator-dlo (old Q7):** subsumed; predator created as canonical.
- **same-operator-applied-twice:** DOCTRINE-BLOCKED (zero exemplars apply an operator twice).
  Subsumes paradox-blur (double-paradox), atomic-eggbeater (double-atomic). Who: RED.
- **crossbody / xbd register (~47):** STALE (June 5/6). Largely burned down by June 10;
  residual = doctrine-pending blurry-conditioned `xbd-rake` cases only. Who: INTERNAL.
- **rooted:** RESOLVED (support-foot set, 0 ADD).

### Items that are NOT actually root-blocked (mislabeled)
- **blazing:** blocked on a one-sentence **token ruling** (what is blazing mechanically + its
  body-event token). Confirmed +1; no notated exemplar, so authoring would fabricate. Gates
  **8** (blazing-{butterfly, drifter, illusion, legover, mirage, paradox-whirl,
  symposium-mirage, torque}). Who: RED.
- **terraging:** ADD +3 confirmed in registry; the residual is the **chassis + ripstein's
  base**. Largely a verify-and-author task. Who: INTERNAL/RED. Impact ~3-5.
- **motion / flailing / frantic / twisting / zulu / slapping:** undefined folk movement-verbs.
  Leverage (June 10 `OPERATOR_LEVERAGE.md`): motion 5, flailing 2, frantic 2, twisting 2,
  alpine 4, grifter/mobiusscrew 2. flailing/frantic are the **most corroborated** (PassBack +
  fb.org + FM). Note: flailing = symposium illusioning was wired provisionally
  (`freestyleSymbolicEquivalences.ts`) — so flailing may be INTERNAL-resolvable. Who: RED for
  the movement-verb; INTERNAL for already-wired equivalences.
- **The 17-modifier chassis gap (Part I.13):** for the 7 composite sets (railing, sailing,
  splicing, surfing, floating, shooting, warping) ADD *and* decomposition are settled — only
  the operator-reference entry is unwritten. **This is INTERNAL authoring, not a Red block.**
  blazing/terraging/warping/floating/splicing have zero notated exemplars and are the deeper
  end (token ruling needed before authoring compounds on novel bases).

### Lower-tier open threads
- PassBack residual (69): 7 pure folk-names (historical ID, RED/new-evidence), 21 folk-operator
  decompositions, 41 novel-structure new-canonical-vs-alias calls.
- Carried-over canonical calls: DSO alias-vs-distinct; double-twist/Revstein; spinning-motion
  (blocked on motion); atomic-whirl/Reactor (held under X-Dex migration). Who: RED.
- furious chassis (per-base variation); swivel (2 vs 7 ADD); royale ADD; eggbeater
  construction; blistering existence. Who: RED/CURATOR.

---

## Part III — Dependency graph (cascading unlocks)

```
ROOT: DOD / DDD policy (A1)            [RED]
  -> defines whether "down" is a base or a naming layer
  -> unlocks the down family: down-over-down, down-double-down, down-diver, ...
  -> unlocks shooting-DDD residuals, ~12 observational + 18 residual "other"
  => ~46 tricks (the largest single band)

ROOT: Weaving (A2)                     [RED]
  -> defines weaving operator (+N) or family
  -> unlocks weaving-magellan(already aliased), weaving-pigbeater(now built), + ~30 frontier
  => ~32 tricks

ROOT: Movement-verb session            [RED, one sitting]
  motion -> spinning-motion (held canonical) + locomotion + ~3
  flailing/frantic -> their corroborated compounds (~4)
  twisting -> ~2
  => ~11 tricks in one ruling

ROOT: Pogo +0/+1 (B1)                  [RED]
  -> 13 pogo compounds, all promotable either way once the number is fixed
  => 13 tricks

ROOT: Blazing token (8) / Terraging chassis (~3-5) [RED token, then INTERNAL author]
  blazing ruling -> 8 blazing-* compounds (already active but op_notation-blocked)
  => 8 + ~4

BRANCH (NOT a root block): the 7 composite-set chassis    [INTERNAL author]
  railing/sailing/splicing/surfing/floating/shooting/warping
  -> ADD + decomposition settled; authoring the operator-reference entry +
     mirror-deriving op_notation closes the publication-contract structural-composition
     requirement for their existing compounds.
  => unblocks notation completeness for dozens of *already-active* compounds (no Red)
```

Total addressable by the top doctrine answers: **~75-90 new tricks** (A1+A2+verb session +
pogo + blazing) plus **dozens of completeness fixes** on already-active tricks (the chassis
gap), available with no Red at all.

---

## Part IV — Expert routing

Stop treating all blockers as equal. Classification:

**A. Internal (resolvable now from existing evidence) —**
- The 7 composite-set chassis (railing/sailing/splicing/surfing/floating/shooting/warping):
  decomposition known, author the operator-reference entry + mirror op_notation.
- flailing = symposium illusioning (already wired); confirm and propagate.
- terraging chassis (+3 confirmed; mirror a +3 sibling) and ripstein's base.
- crossbody/xbd register cleanup (mechanical; only blurry-conditioned residual is Red).
- The 6 Class-A nuclear/quantum-guay promotable-now rows
  (`PACKET_2_PROMOTION_AUTHORING_44.md`) — zero doctrine dependency.
- Pruning the 18 redundant observational entries (already-canonical/alias).

**B. Dave / community expert (Adrian etc.) —**
- Illusioning **governance** (parallel family vs rev(0) reading) — presentation, not ADD.
- The publication-contract demotion/hide mechanism design (`publication_state`).
- Eagle theory **definition** — needs the curator to author axioms before anything can be
  built (NEW-EVIDENCE, currently gates 0).
- Compression-intent verb discipline at the *prose* layer (glossary tone).

**C. Requires Red specifically —**
- A1 DOD/DDD (base identity + down arithmetic).
- A2 Weaving (+N).
- B1 Pogo (+0 vs +1).
- A3 Blurry transitivity (pt12 follow-up).
- blazing token ruling; same-operator-twice coherence; spyro naming intent.
- The folk movement-verbs (motion/twisting/frantic) as movement definitions.
- E1 whirl/swirl X-Dex tail; the carried-over canonical calls (DSO, swivel, royale,
  blistering, eggbeater construction).

**D. Requires new evidence (a source that does not yet exist) —**
- Shooting same-side exemplar (C1).
- The 7 PassBack pure folk-names (lost-trick historical identification).
- Eagle theory (no corpus at all).

---

## Part V — Frontier collapse plan (top questions by unlock value)

Ranked by (tricks unlocked) x (confidence of resolution). Confidence = how clean the
question is and how likely a single answer settles it.

| Rank | Question | Tricks | Doctrine unlocked | Who | Confidence | Notes |
|---|---|---|---|---|---|---|
| 1 | **DOD / DDD policy (A1)** | **~46** | the entire down family + base-vs-naming-layer rule | RED | High | Clean binary-ish question; biggest band by far. |
| 2 | **Weaving +N (A2)** | **~32** | weaving operator/family | RED | Medium | Needs a value; operator-shaped spread is strong evidence it's an operator. |
| 3 | **Pogo +0/+1 (B1)** | **13** | pogo set-ADD | RED | High | Either answer promotes all 13; only the choice blocks. |
| 4 | **Movement-verb session** (motion/flailing/frantic/twisting) | **~11** | 4 folk operators in one sitting | RED | Med-High | Most corroborated tokens; motion frees the held spinning-motion. |
| 5 | **Blazing token ruling** | **8** | blazing chassis | RED | Medium | 8 compounds already active, only op_notation-blocked. |
| 6 | **The 7 composite-set chassis** | dozens of *completeness* fixes (no new rows) | railing/sailing/splicing/surfing/floating/shooting/warping operator-reference | **INTERNAL** | High | Highest-confidence; pure authoring, no Red. Closes the publication-contract gap. |
| 7 | **Shooting ss-collapse (C1)** | **~13** | shooting same-side duality | RED/new-evidence | Medium | Mechanical once decided. |
| 8 | **Blurry transitivity pt12 (A3)** | ~7 + ripple | blurry rotational +2 | RED | Medium | Same shape as the (now-settled) atomic case -> Red has a precedent. |
| 9 | **Spyro naming (C2)** | **~6** | spyro = gyro vs inspin | RED | High | Structure already = gyro; only naming governance. |
| 10 | **The 6 Class-A nuclear/quantum-guay rows** | **6** | none (mechanical) | **INTERNAL** | High | Promotable *now*, zero doctrine dependency. Do these immediately. |

**Where the next 100+ unlocks come from:** ranks 1-5 (RED) = ~110 tricks behind **five
questions**, of which A1 + A2 alone are ~78. Ranks 6 + 10 (INTERNAL) are available with no
Red and should be done first to clear the decks. A single Red sitting that answers
**DOD/DDD, Weaving, Pogo, and the movement-verbs** collapses the great majority of the
addressable frontier.

---

## Caveats and verification notes

1. **Temporal drift.** SKILL.md §B is June 5/6; the June 10-14 audits supersede several
   numbers (crossbody ~47 is stale; the folk-name frontier burned from ~605 to ~262).
   Treat `red-frontier-doctrine-round-2026/PACKET.md` as the current authority.
2. **Held != shipped.** atomic = +1 is FINAL in doctrine but the live table still encodes
   `atomic +1/+2`; the parser still uses `ROTATIONAL_BASES`. Confirm code state before
   asserting the atomic model is live.
3. **Publication contract has no enforcement.** The only gate is `is_active=1`; the
   demotion/hide mechanism is unbuilt. "Settled doctrine" about promotion is curator
   discipline, not code.
4. **In-table vs corpus frontier.** The 64 in-table inactive rows are NOT the frontier; the
   ~1,640 external candidates are. Trick-impact counts above blend both and are approximate.

---

### Source index
- DB: `freestyle_trick_modifiers`, `freestyle_tricks`.
- Content: `src/content/freestyleOperatorReference.ts`, `freestyleMovementSystems.ts`,
  `freestyleModifierClusters.ts`, `freestyleFamilyTiers.ts`, `freestylePublicFamilies.ts`,
  `freestyleFamilyInvariants.ts`, `freestyleQuantityLadders.ts`, `freestyleOperatorGrammar.ts`.
- Rulings: `freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv` +
  `red_additions_2026_04_20.csv` (source-note column);
  `docs/CANONICAL_TRICK_PUBLICATION_CONTRACT.md`.
- Frontier authority: `exploration/red-frontier-doctrine-round-2026/PACKET.md` (June 14);
  `exploration/frontier-audit-2026-06-10/{FRONTIER_AUDIT.md,OPERATOR_LEVERAGE.md}`;
  `exploration/frontier-burndown-2026-06/REMNANT.md`;
  `exploration/red-passback-residual-2026-06-10/RED_PACKET.md`;
  `exploration/red-consolidation/SEMANTIC_COMPRESSION_DOCTRINE.md`;
  `legacy_data/inputs/curated/tricks/OPEN_QUESTIONS.md`.
- Memory: `project_atomic_xdex_doctrine`, `project_family_taxonomy_doctrine`,
  `project_frontier_canonicalization`, `project_fm_promotion_arc`,
  `project_canonical_trick_publication_contract`, `project_pt14_rulings_nuclear_deferred`.

---

## Part VI — The not-first-class frontier, bucketed

"Not first-class" = the promotion/completion frontier: active-but-incomplete rows +
in-table inactive (64) + external candidates (ecosystem CSVs). In-table lists are exact
(DB); external lists (DOD/Weaving/movement-verbs) are from
`exploration/wave1-triage-2026-05-27/by_ecosystem/*.csv` ground truth.

**1. Promotable TODAY, no new doctrine — 6.** nuclear-guay(4), quantum-guay(3),
nuclear-drifter(5)=69, nuclear-double-leg-over(5)=Terminator, nuclear-dyno(6)=Godzilla,
nuclear-torque(6). JOB already authored (PACKET_2 Class-A). Effort: ~1-2h, mechanical
red_additions + op_notation rows (nuclear-torque needs a family=osis override).

**2. Promotable after authoring SETTLED doctrine (internal, no Red) — ~17 in-table + a large
cascade tail.** terraging-{illusion,legover,mirage,opposite-clipper,same-clipper}(+3 chassis
settled); composite-set compounds floatation(floating)/liquifier(splicing)/warp(warping);
cascade-derivable gyro-diving-clipper, fairy-gyro-torque, hop-over, inspinning-same-side-
{illusion,mirage}, miraging-pincher, toe-double-drifter, toe-whirr; sole-survivor (mirror of
spinning-symposium-whirl). PLUS the 7 composite-set chassis (railing/sailing/splicing/
surfing/floating/shooting/warping) whose authoring closes notation on dozens of already-
active compounds. Effort: 15-30 min each; the chassis-authoring is the highest-confidence work.

**3. Blocked by DOD/DDD — ~50** (DDD-form subset of the 139-row down family). down-double-down,
double-down, symposium-down-double-down, {atomic,clipper,pixie,spinning,stepping,toe,quantum,
surging,nuclear,shooting,tapping}-{far,near}-double-down + symp variants, scorpions-tail/
bullwhip/superfly chains. Effort: blocked until Red rules DOD≡DDD; then ~46 mechanical (days).

**4. Blocked by Weaving — 32** (weaving.csv). weaving-{butterfly,clipper,legover,magellan,osis,
pickup,pigbeater,whirl,drifter,eclipse,guay,illusion,mirage,reverse-guay,symposium-mirage,
toe-stall,xbd-rake} + 15 stacked (fairy/pixie/gyro/quantum/stepping/tapping-weaving-*). Effort:
blocked until Red rules weaving +N; then mechanical.

**5. Blocked by Pogo — 13.** pogo + pogo-{barfly,pickup,voodoo,paradox-barrage,paradox-blender,
paradox-da-da-curve,paradox-drifter,paradox-eggbeater,paradox-mirage,paradox-torque,
paradox-whirl,paradox-whirling-swirl}. Effort: blocked on Red +0/+1; then trivial (~1h, all
promotable either way).

**6. Blocked by Blazing — 9.** blazing + blazing-{butterfly,drifter,illusion,legover,mirage,
paradox-whirl,symposium-mirage,torque} (active but op_notation-blocked). Effort: blocked on a
one-sentence Red token ruling; then ~1h mirror-chassis.

**7. Blocked by movement-verb rulings — ~15.** motion: locomotion, motion-sickness, nemosis,
spinning-motion(held), base-motion; flailing: atom-bomb, legbreaker; frantic: e-walk, heart;
twisting: blink, what; alpine: jackknife, king-koopa, skullsmasher, id (alternate readings).
Effort: blocked on one Red movement-verb session; then mechanical.

**Not covered by these 7 (other blockers):** blurry-transitivity A3 (blur, blurry-whirl,
blurry-torque, blurrier, blurry-drifter, blurry-symposium-whirl, blurry-whirling-swirl = 7);
spyro-naming C2 (spyro, fairy-spyro-mirage, pandora, spyro-illusion/mirage/whirl = 6);
same-operator-twice (paradox-blur, atomic-eggbeater); atomic-held (atomic-torque + migration);
shooting-ss residual (~13); xbd-rake pending (stepping-p-s-whirling-x-body-rake);
folk-decomposition with no operator (witchdoctor, redwetter, big-apple-sauce, oh-wheely,
bill-ted-s-excellent-adventure, voodoo, flog, blistering-whirl, leg-over-flapper-stall).
