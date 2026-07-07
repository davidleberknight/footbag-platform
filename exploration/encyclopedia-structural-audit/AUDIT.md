# Encyclopedia Structural Audit

Eight audits across the whole freestyle public surface, per the maintainer's brief. The
meta-instruction governs everything here: the writing is assumed finished; findings are
structural weaknesses, conceptual gaps, contradictions, missing synthesis, misplaced
material, and whole-encyclopedia opportunities, prioritized by whether they would change
the architecture or intellectual organization. No prose optimization, and nothing was
modified. Evidence discipline: each finding says what proves it (the canonical operational
notation in the dictionary DB, a ruled doctrine, or a measured render) and which side of a
conflict the evidence supports; where only a curator can settle it, that is said.

Method: two exhaustive cross-surface sweeps (structural surfaces: glossary, operator
reference, ADD analysis, trick content; and history, set encyclopedia, family surfaces,
emerging vocabulary), a rendered-page analysis of the live glossary, and synthesis against
the insight registry, dependency graph, and doctrine state.

---

## 1. Hidden contradictions (highest priority)

Ten checks came back consistent (listed at the end of this section). Six clusters are
genuine conceptual conflicts.

### C1. rev_whirl renders as a top-level Family Parent root, the exact inverse of doctrine
**A live rendering bug, verified on the rendered page.** The glossary family-card shaper
carries an override map that demotes card-only lineages, keyed `'rev-whirl'` (hyphen); the
card's slug is `'rev_whirl'` (underscore). The override misses, the tier falls through to
the default (unknown slug = family parent), and the live page renders Rev Whirl under
"Family Parents, Root lineages" as a peer of whirl and osis. Every other surface teaches
rev-whirl is not a family at all (absent from the public roster, the descendant counts, and
the histogram; the roster prose on the same page promises the glossary and dictionary
rosters "always match"). blur and phoenix use matching keys and demote correctly; rev_whirl
is the lone broken case. This is the same hyphen/underscore drift class as the trick_family
loader bug fixed earlier; the audit recommends the same normalization discipline at this
join point. Severity: high; one-line fix plus a parity test.

### C2. Whirl's structure is stated three incompatible ways; the atom cards match the DB, older surfaces do not
The signed-off atom cards teach whirl enters from an open set and catches on the
opposite-side clipper, and that whirl and swirl are distinct atoms differing in entry
surface, dex form, and catch side. The older surfaces teach the pre-revision model: the
whirl family card says "clipper-to-clipper" with a `CLIP` entry; the family invariants and
the ADD-analysis example say whirl ends on a same-side clipper; the glossary family section
says "every whirl ends ... into a same-side cross-body clipper"; and the swirl family card
still teaches the retired mirror framing ("same start, same finish, opposite path", "differs
from the whirl only in that circling dex").

**The arbiter exists:** the canonical operational notation in the dictionary is
`SET > OP IN [DEX] > OP CLIP [XBD] [DEL]` for whirl and
`CLIP > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` for swirl. The atom cards were
authored from it; the family cards, invariants, and ADD example predate the revision and
were never reconciled. Recommendation: one reconciliation slice that makes the notation the
single authority for every surface stating an atom's operational form, and a conformance
test that derives entry/dex/catch claims from the notation rather than restating them.
Severity: high (a reader gets opposite structural models of the sport's largest lineage
pair, on the same site, sometimes on the same page).

### C3. Blurry is assigned two conflicting universal weights, both contradicting the ruled per-trick doctrine
The glossary modifier-weights table hard-codes blurry = +2 on every base; the ADD-analysis
component table hard-codes blurry = +1; the ruled doctrine (recorded in the resolved
formulas and the blurry review) is that blurry resolves per named trick (+2 as
stepping+paradox in blur, blurry-whirl, blurry-torque, food-processor; +1 flat in
blurriest). The ADD-analysis file is also internally inconsistent: its own blurry-whirl
worked example uses +2 while its table says +1. Compounding it, the glossary table sits
under the heading "each modifier adds a fixed ADD weight on every base," a universal law the
corpus's own scoring does not honor. Severity: high for scoring trust; the fix is to make
both tables carry the per-trick resolution (or footnote blurry as the documented exception)
and soften the universal-weight heading.

### C4. The scored-bracket list omits [XDEX] and [PDX], breaking the checksum it teaches
The glossary's ADD-philosophy line lists the scored brackets as
[BOD]/[DEX]/[XBD]/[DEL]/[UNS]; the ADD-analysis bracket rule lists seven, including [PDX]
and [XDEX], "each one counts one"; and the glossary's own X-Dex term says [XDEX] scores +1.
A reader counting brackets from the five-token list undercounts every X-Dex and paradox
trick, on the page whose headline reveal is "the bracket count is the ADD." Nested inside is
an evidence conflict: the glossary explicitly calls [PDX] counting an open doctrine
question, while ADD-analysis states it as settled. The token-list fix is mechanical; the
[PDX] settledness needs the curator (see the evidence audit).

### C5. Two different numeric thresholds define "family parent"
The public-families module header defines a family parent as conserving a terminal plus at
least 3 recursive descendants; the tier system and the glossary teach the hard rule of more
than 10 documented descendants (and a later comment in the same public-families file says
more than 10, contradicting its own header). Two admission rules for the same first-class
status. The tier system is what actually renders, so the greater-than-10 rule is the de
facto doctrine; the 3-descendant floor looks like the fossil of an earlier standard.
Curator should ratify one number and the other text be reconciled.

### C6. Naming and self-consistency leaks
Smaller but real: the Direction concept card names the whirl mirror "whip" while every
family surface calls it Rev Whirl (whip is a DB alias; a reader cannot connect the two); the
glossary's advanced-reference partial says "four-way ducking family" on the same page that
teaches ducking is an ecosystem and explicitly not a family; and the glossary family section
claims the card set and roster "always match" while the cards include three lineages (blur,
phoenix, rev-whirl) absent from the roster it claims to mirror.

**Checked and consistent** (no conflict found): ADD "one point per operator" residue (none;
weights vary correctly, nuclear +2, barraging +2), butterfly side variants, mirage/illusion
distinctness, osis decomposition, atomic +1 flat (the +2-rotational reading is retired
everywhere), ATW/orbit family separation, the is_core DB flag (never rendered; both TS
registries agree on the teaching twelve), sets-vs-operators role framing, pixie/fairy uptime
motion readings (analogy wording everywhere, never identity), history-vs-glossary notation
attribution (Ben Job 1995 consistent), emerging-vocabulary isolation, toe/clipper
never called a family, the Down umbrella, and the torque/blender branch presentation.

---

## 2. Missing synthesis

The insight registry is the synthesis inventory, and its shipping state is lopsided:

- **The algebra staircase shipped its top rung only.** Butterfly's atom card carries rung 3
  (a family is one atom wearing operators), but rung 1 (Blur: a short name hides a
  structural name) and rung 2 (Torque: a primitive-sounding name is a formula) exist only in
  prototypes. The encyclopedia's central claim, that the vocabulary is a small algebra, is
  never stated first-hand on any public surface; the reader meets the staircase's conclusion
  without its front door.
- **The live page cites works that do not exist.** Verified on the rendered glossary: the
  orbit and illusion cards cite "the Mirror Law" (one says "home: Mirage"), and the osis
  card says "see Torque, and Name vs Structure." No route serves either essay and no
  glossary entry named Torque exists. These are promissory notes the page has already
  issued; the essays are now owed, or the citations should be softened until they exist.
- **"Families emerge from conserved terminal mechanics" has no home.** The dependency graph
  lists it as a terminal insight; the glossary teaches the family definition but never the
  emergence story (why the vocabulary organized itself around terminals, whirl as the model
  fossil). This is the missing bridge between the Families chapter and the history page.
- Never explicitly stated anywhere: why modifiers exist (the compression pressure that
  produced the operator layer), why notation became necessary (history names Ben Job but
  not the problem the notation solved), why vocabulary growth slowed (the frontier story,
  intentionally reserved), and what makes a trick first-class (the family tier rule is
  taught; the trick promotion standard is not).

---

## 3. Discovery audit (can a newcomer find the answers?)

- *Why is mirage different from illusion?* Discoverable. Taught directly on the atom cards
  and the Direction/Side concept cards. The strongest path on the site.
- *Why are ATW and orbit different tricks?* Discoverable, same path.
- *Why does torque belong to osis?* Discoverable with two hops: the osis atom card states
  "miraging osis is torque," and the family section teaches terminal identity. Adequate.
- *Why is blur "blur"?* **Not discoverable as a lesson.** The trick page shows the
  decomposition mechanically (blurry mirage; structural alias), but nothing public teaches
  the name-compression idea, because rung 1 of the algebra never shipped. A newcomer can
  see THAT blur decomposes; nowhere can they learn WHY short names hide formulas.
- **Cross-reference dead ends:** the concept and atom cards name destinations with no links
  and, in two cases, no destination at all ("see Torque, and Name vs Structure"; "the Mirror
  Law"). The signed-off entries carry Explore blocks precisely for this, deferred because
  their targets did not exist; the audit's finding is that several targets STILL do not
  exist while the prose already points at them. Rendering Explore links remains blocked on
  authoring the essays, not on UI.

---

## 4. Information architecture audit (concepts not in their best home)

- **The decomposition table (derivation atlas) sits in Runs & Sequences.** It is per-trick
  structural analysis (named tricks read as formulas); its natural home is the Structural
  Analysis chapter. It landed in the composition section historically and was carried along
  by the chapter fold.
- **"Vocabulary relationships: four ways trick names relate" also sits in Runs &
  Sequences.** It is about names and structure (compression, aliases), not about sequencing;
  it wants Structural Analysis now, or the Doctrine and Insights chapter when that opens.
- **The inside-delay case study (wrap / walk-over / hop-over / eclipse) sits in Reference &
  History.** It is the encyclopedia's single best "similar tricks and how ADD diverges from
  felt difficulty" specimen, which is Doctrine and Insights material; parked acceptably
  today, it should be the first content moved when that chapter opens.
- **The X-Dex term definition carries doctrine provenance** ("historically, [XDEX] was
  recorded on the far form of certain bases...") inside a beginner term list. The sentence
  is doctrine history; its home is the trick pages or the future Doctrine chapter.
- **"Tricks, sets, and modifiers" (Movement Basics) overlaps the Set vs Operator card**
  (also flagged in the earlier polish review). One is taxonomy-for-navigation, the other is
  the role insight; they should be consolidated with the taxonomy deferring to the card.

## 5. Boundary audit (sections drifted beyond charter)

- The glossary carries open-doctrine commentary (the [PDX] open-question note) and doctrine
  history (the X-Dex provenance) inside definition lists; both belong to doctrine surfaces.
  The glossary's charter is teaching the vocabulary; unsettledness should be flagged in one
  consistent way (see evidence audit), not narrated per-term.
- The glossary's community/history tail duplicates the History page's job at stub scale;
  now that it is folded into Reference & History, the chapter should eventually thin to
  links plus the vocabulary that is genuinely glossary-native (folk and historical term
  definitions), leaving narrative to the History page.
- The family cards editorialize execution comparisons ("swirl is not a harder whirl")
  which is trick-page intuition material, and in the swirl case is also the vehicle of
  contradiction C2. Family cards' charter is lineage structure.
- No drift found the other way: history does not teach notation mechanics, operators does
  not teach families (its lineage-or-ecosystem test is boundary-marking, which is its job),
  and the set encyclopedia stays inside set systems.

## 6. Future-proofing audit (where do 200 doctrine answers go?)

The architecture is ready in shape but the pipeline is only implicit. Recommended explicit
insertion points, so no ruling ever lands as "another paragraph":

1. **Canonical registries first**: operator reference, resolved formulas, red_corrections
   (data), exactly as today.
2. **Per-trick surfaces**: the five curator-locked trick-page overlays (scoring-notes and
   kin) for rulings that change one trick's reading. The overlay system already exists.
3. **The Doctrine and Insights chapter** (reserved, absent): one synthesis note per ruling
   cluster, in the existing doctrine-note partial format. This is the designed landing zone
   for exactly this volume; its absence today is intentional, and the first Red packet is
   its opening trigger.
4. **The glossary teaching spine changes only when a ruling changes a taught concept**
   (as the whirl/swirl revision did), never as an accumulation point.
5. **The Frontier chapter** for above-ceiling and open-question movements.

One structural gap: nothing marks WHERE in the collapsed chapters a new subsection may be
inserted (each chapter body is a single flow). A light convention (each chapter body ends
with a named slot comment) would keep 200 insertions from becoming 200 judgment calls.

## 7. Evidence audit (claim strength vs support)

Classification of the significant public claim families, with mismatches flagged:

- **Established by canonical data** (notation, counts): atom formulas on the cards, the
  histograms, ADD totals. Correctly stated as fact. The whirl/swirl older surfaces (C2)
  FAIL this class: they contradict the canonical notation and must be reconciled to it.
- **Red-ruled doctrine**: atomic +1 flat, furious=barraging, the Down umbrella, blurry
  per-trick, illusioning=rev(0) miraging. Correctly stated where stated; the blurry weight
  tables (C3) contradict their own ruled doctrine.
- **Curator judgment stated as such**: osis as the "golden reference" atom, the family
  tier standard ("current editorial standard, reversible"). Appropriately framed.
- **Platform synthesis / pedagogy, correctly hedged**: pixie as an uptime-ATW motion
  ("can be understood as"), whirl as "one of the sport's major rotational bases" (the
  earlier "most documented" overclaim was already softened at sign-off), eclipse's +1
  ("doctrinally unsettled"). These are the model for how synthesis should read.
- **Mismatches needing attention**: [PDX] is presented as settled on one surface and open
  on another (C4); "each modifier adds a fixed weight on every base" is stated stronger
  than the corpus's own scoring (C3); "the glossary roster and the dictionary roster always
  match" is stated stronger than the render delivers (C6).
- **Structural recommendation**: the site already uses ad-hoc badges (observational,
  advanced, exploratory, PROVISIONAL). Adopt ONE evidence-class vocabulary (established /
  ruled / historical / community / synthesis / open) and render it consistently, starting
  with the Doctrine and Insights chapter. This converts the evidence audit from a one-time
  pass into a property of the architecture.

## 8. The missing-book audit (works that exist nowhere)

If the project became a book, these chapters exist nowhere on any surface. Ordered by how
much existing material already presses against their absence:

1. **Name vs Structure** (the algebra). Already cited by the live page; rungs 1 and 2
   unshipped; the single most owed work.
2. **The Mirror Law** (direction, side, and the symmetry of the vocabulary). Cited twice on
   the live page; the mirror-pairs catalog and the reversal-makes-a-family doctrine are its
   ready-made content.
3. **The Art of Telling Tricks Apart** (similar tricks). The inside-delay case study is its
   one existing specimen; whirl/swirl, mirage/illusion, legover/pickup, torque/blender are
   the obvious chapters.
4. **The Frontier** (why the vocabulary slowed; the 8-ADD ceiling; unnamed derivable
   structures; the open questions). Designed and reserved.
5. **Why Freestyle Evolved** (the causal story: compression pressure produced operators,
   operators produced notation, notation produced the checksum). History has the timeline;
   nobody has the mechanism.
6. **The Mathematics of Freestyle** (the closure set, the operator algebra, the axes as a
   symmetry system). The doctrine papers hold this privately; no public-safe treatment
   exists.
7. **Naming Philosophy** (folk names, compression, what canonicalization protects). Exists
   only as internal policy.
8. **How We Know** (sources, evidence classes, reconciliation method). The sources section
   is its stub; the evidence-class vocabulary (audit 7) is its skeleton.

Works 1 and 2 are already promised by the live page. Works 3 and 4 have designated chapters
waiting. That is the priority order the page itself implies.

---

## Priority summary

| # | Finding | Kind | Action shape |
|---|---|---|---|
| 1 | rev_whirl renders as Family Parent root (slug mismatch) | live bug | one-line fix + parity test |
| 2 | whirl/swirl structure contradicted corpus-wide vs canonical notation | contradiction | reconciliation slice; notation becomes single authority |
| 3 | blurry dual universal weights vs ruled per-trick doctrine | contradiction (scoring) | fix both tables + soften universal heading |
| 4 | scored-bracket list omits [XDEX]/[PDX]; [PDX] settledness conflict | contradiction | mechanical list fix; curator ruling on [PDX] |
| 5 | dual family-parent thresholds (3 vs more-than-10) | doctrine drift | curator ratifies one; reconcile text |
| 6 | live page cites nonexistent essays; algebra rungs 1-2 unshipped | missing synthesis | author Name vs Structure and Mirror Law, or soften citations |
| 7 | derivation atlas + vocabulary relationships + case study misplaced | IA | move at next chapter slice |
| 8 | evidence-class vocabulary absent | architecture | adopt one taxonomy with the Doctrine chapter |
