# Source Reconciliation — Stanford (Ben Lynn Shorthand)

## What this is

Stanford is the third outside lineage the encyclopedia reconciles, after
FootbagMoves and PassBack. Like them, this document is scholarship, not doctrine:
it creates no rule, re-opens no settled one, and does not attempt to correct
Stanford. For every Stanford formula it asks whether the trick is represented, and
where the two differ it states the disagreement, the source, which reading the
encyclopedia publishes, and why — under the Charter's **record, do not adopt**
policy.

Two facts about Stanford frame everything below.

**Stanford is a notation system, not a scorer or an observer.** It is Ben Lynn's
(Stanford) one-character compression of Job's notation: `Z.+1+Z` where the platform
writes `TOE > SAME IN [DEX] > SAME TOE [DEL]`. Both mean Around the World. The
token-to-canonical crosswalk is fully worked out already. So the overwhelming
majority of Stanford "disagreements" are not competing claims about a trick; they
are the same trick written in a different alphabet. This is the same shape as the
PassBack finding (PassBack was a different *instrument*), one step further:
**Stanford is a different notation for the same structure.**

**Stanford is not an independent source.** By Ben Lynn's own account he built the
list "after stumbling across a big list of footbag moves" on a since-vanished
web page and re-notated it. A prior lineage audit found Stanford is "partially
dependent, leaning derivative" of FootbagMoves: their intersection includes 166
obscure tricks attested by no third source, with byte-identical unusual spellings
(Blacula, Amadeus, Aeon Flux) in both. Under the Charter's rule to **weight
corroboration by independent lineage, not source count**, FootbagMoves and Stanford
together count as *one* doubly-encoded lineage. This is not a footnote — it is the
single most important interpretive fact in the Stanford reconciliation, and Section
F.7 shows the ADD divergences bearing it out directly.

## Method and sources

- `exploration/stanford/stanford-2.txt` — the 994-formula move list, bucketed by
  ADD. Every formula parses cleanly into a (bucket, formula, name) triple; zero
  parse casualties.
- `exploration/stanford/stanford-1.txt` — Ben Lynn's notation spec, including his
  own flagged open issues.
- `exploration/symbolic-master/STANFORD_TOKEN_DICT.md` and
  `FAMILY_GENERATION_INSIGHTS.md` — the token equivalence map and the structural
  lattice analysis, used rather than re-derived.
- `database/footbag.db` — the live encyclopedia. Every platform ADD quoted below was
  verified against the live dictionary, not inferred, and not taken from the
  pre-built symbolic-master CSVs (which are dated and were joined against a much
  smaller canonical table; the counts here are a fresh live re-derivation).

## The six comparison axes and the five-category taxonomy

For every Stanford formula the reconciliation asked: is the trick **represented**;
does the **structural decomposition** match; does the **operator sequence** match;
is the **canonical name** the same; is Stanford's name an **alias**; and does the
**ADD** agree. Where any axis differs, the disagreement is classified as exactly
one of:

| Category | What it means for Stanford | Where it lands |
|---|---|---|
| **Equivalent notation** | Same trick, same structure, same ADD; only the symbol system differs | The bulk — 489 matched rows |
| **Historical naming** | Stanford's name is a folk/descriptive/superseded name for a canonical the platform carries under a different name | 98 gloss-matched + 41 alias-only |
| **Parser difference** | Divergence caused by Stanford's grammar being under-specified — one formula that cannot distinguish two tricks, or a mandatory-filler token | 32 collision pairs + the clipper quirk |
| **Doctrine difference** | ADD differs because Stanford's literal token tally meets the platform's curated structural-ADD model | 118 of the 119 ADD divergences |
| **Genuine contradiction** | Stanford asserts something structurally incompatible, unexplained by the above | **None found** |

## Agreement baseline

Of the 994 Stanford formulas, matched against the live `freestyle_tricks` and
`freestyle_trick_aliases`:

| Bucket | Count | Share |
|---|---:|---:|
| Represented — canonical-name match | 567 | 57.0% |
| Represented — alias match only | 41 | 4.1% |
| **Represented, total** | **608** | **61.2%** |
| Stanford-only (no platform row yet) | 386 | 38.8% |

Among the 608 represented rows, ADD agrees on **489 (80.4%)** and disagrees on 119
(19.6%). The same honest caveat that travels with the other two reconciliations
travels with this one: the disagreement rate is a rate among *matched* rows. It says
nothing about the 386 Stanford-only formulas, which have no platform row to check
against — they are a promotion frontier (Section F.4), not a disagreement.

---

## A. Equivalent notation — the bulk

489 matched rows agree on ADD and decompose identically; they differ only in that
Stanford writes one alphabet and the platform writes another. There is no
disagreement to adjudicate, and cataloguing 489 identical-structure rows would be
noise. The scholarship is the crosswalk itself:

| Stanford | Platform canonical-bracket | Trick |
|---|---|---|
| `Z.+1+Z` | `TOE > SAME IN [DEX] > SAME TOE [DEL]` | around the world |
| `Z.+0+Z` | `TOE > SAME OUT [DEX] > SAME TOE [DEL]` | reverse ATW (orbit) |
| `*.-1-Z` | `[set] > OP IN [DEX] > OP TOE [DEL]` | mirage |
| `*.-0-Z` | `[set] > OP OUT [DEX] > OP TOE [DEL]` | illusion |
| `*.+0+Z` | `[set] > SAME OUT [DEX] > SAME TOE [DEL]` | legover |
| `U` | `SET > TOE SWING [DEL]` | pendulum |

The adopted interpretation for all 489 is trivially the platform's own reading,
because the readings are the same reading. Stanford's shorthand is preserved
verbatim in the symbolic-master layer as a parallel representation, exactly as the
FM-parens convention is — recorded, cross-linked, never collapsed into the
canonical bracket form.

---

## B. ADD divergences

All 119 ADD disagreements resolve into two mechanisms, with no unexplained residue.

### B.1 The scoring-convention offset — doctrine difference (118 of 119)

Stanford's ADD bucket is a **literal per-symbol tally** of the shorthand line. The
platform's ADD is a **curated modifier bonus added to a curated base value** for the
receiver (mirage = 2, whirl = 3, torque = 4, and so on) — the "asserted ADD is
editorial truth" architecture, where the structural bracket count, not a raw token
count, is the number. The two conventions agree for simple single-dex atoms and
diverge by 1 (occasionally 2) on compound modifier-plus-receiver stacks, because a
symbol tally does not reproduce the platform's curated per-modifier weight.

**Adopted:** the platform's structural ADD in every case (verified live). **Why:**
the site publishes compositional difficulty under its own scoring model; Stanford's
bucket is recorded as a parallel reading, per record-don't-adopt. Stanford is a
single (and derivative) source for the divergent number, which is non-authoritative
for a contested value.

The direction is lopsided and that lopsidedness is the finding: of the 118, Stanford
reads **higher than the platform in 106 cases** (delta −1 in 103, −2 in 3) and
**lower in 12**. Verified representatives:

| Stanford formula | Stanford name | Slug | Stanford ADD | Platform ADD | Direction |
|---|---|---|---:|---:|---|
| `Z-!0-0.-1-Z` | Warped Mirage | `warp` | 7 | **5** | Stanford +2 |
| `Z-0.-1-X` | Atomic Whirl | `atomic_whirl` | 5 | **4** | Stanford +1 |
| `Z-0.-1/-X` | Atomic Torque | `atomic_torque` | 6 | **5** | Stanford +1 |
| `X-1.-1-Z` | Blazing Mirage | `blaze` | 4 | **3** | Stanford +1 |
| `X-1.-0-Z` | Blurry Illusion | `blizzard` | 4 | **3** | Stanford +1 |
| `X-!1.-1-X` | Pogo Whirl | `pogo_whirl` | 5 | **4** | Stanford +1 |
| `Z+1-0.-1-X` | Sailing Whirl | `sailing_whirl` | 6 | **5** | Stanford +1 |
| `X.\-1/-X` | Spinning Torque | `spinning_torque` | 6 | **5** | Stanford +1 |
| `X-1-0.-1/-X` | Shooting Torque | `shooting_torque` | 8 | **7** | Stanford +1 |
| `X-1+1.-1-X` | Furious Whirl | `genesis` | 6 | **5** | Stanford +1 |
| `Z.+1+1-Z` | Double Pixie | `terrage` | 3 | **4** | Stanford −1 |
| `Z.+1+1+1-Z` | Triple Pixie | `trixie` | 4 | **5** | Stanford −1 |
| `X+0_.+0-X` | Nuclear ss Butterfly | `barfry` | 4 | **5** | Stanford −1 |

### B.2 The clipper filler quirk — parser difference (1 of 119)

`*. X` (any-set, peak, clipper) is bucketed at 2 ADD; the platform scores bare
`clipper` at 1 (a self-atom, `clipper(1) = 1`). Stanford's grammar *requires* the
wildcard-entry `*.` prefix on every line as a matter of syntax, even when reaching a
core atom involves no real dex event, so it over-counts by the mandatory filler
token. **Adopted:** the platform's 1. **Why:** the extra point is a syntactic
artifact of Stanford's line grammar, not a structural claim — a parser difference,
not a doctrine one.

---

## C. Name and identity divergences — historical naming

The name axis divides cleanly:

- **41 rows match only through the alias table**, not the canonical name — Stanford's
  name is one the platform already carries as an alias. Examples: `Z.+0+Z` "Reverse
  ATW" is an alias of `orbit` (the platform's ATW = in-out / orbit = out-in
  direction doctrine); `Z-0.-0+Z` "Atomic Legover" is an alias of `eggbeater`;
  `X.-0+X` "Reverse Whirl" is an alias of `rev_whirl`. **Adopted:** the platform's
  canonical name, with Stanford's as the already-wired alias. **Why:** these are
  agreements the alias system already records.

- **98 rows carry Stanford's descriptive name as primary and the platform's folk
  canonical name only in a parenthetical gloss** — Ben Lynn wrote, e.g., "Double
  Mirage (Barrage)", "Blurry Mirage (Blur)", "Atomic Mirage (Atom Smasher)",
  "Nuclear ss Whirl (Hurl)". The platform's canonical name is the folk name in the
  parenthesis; Stanford's primary is the structural reading. **Adopted:** the
  platform's folk canonical (Barrage, Blur, Atom Smasher, Hurl). **Why:** this is
  the "one true name plus descriptive sub-names" premise — the structural reading is
  a secondary, searchable name, not a competing canonical.

Of the 994 rows, 419 (42%) carry a parenthetical gloss at all; the 98 above are the
ones whose gloss is what produced the platform match. This is Stanford being
*useful*, not divergent: its structural primary names are, in effect, a large set of
structural aliases for canonicals the platform names by folk convention.

---

## D. Parser-difference cohort

Beyond the single clipper quirk, 32 distinct Stanford formulas are each written down
under **two or more different display names** in the raw corpus — Stanford's grammar
cannot tell these tricks apart. This is Ben Lynn's own flagged limitation made
concrete: he proposed disambiguating tokens (`k` for kick-versus-delay, `w1`/`w0`
for whirling-versus-stepping) but never applied them in the move list, so the
ambiguity stands in the data.

- **Butterfly ≡ Reverse Whirl (8 pairs).** The same Stanford formula names both an
  "X Butterfly" and an "X Reverse Whirl" across eight different modifier prefixes
  (`X.+0-X` Far, `Z+0.-0-X` Fairy, `Z+1.-0-X` Pixie, `X+0_.+0-X` Nuclear-ss, and
  more). **This is a Stanford notation collision, and the platform's separation of
  the two is settled, not open.** Butterfly and whirl are two of the twelve core
  atoms, and direction is structural (a settled Charter premise: mirage is not
  illusion, whirl is not swirl, and reverse-whirl is whirl reversed). The live
  dictionary correctly keeps them as distinct atoms at 3 ADD each and their compounds
  as distinct slugs (`dimwalk`, base butterfly, and `pixie_reverse_whirl`, base
  whirl, are two rows at 4 ADD each). Stanford's compression simply cannot express
  the butterfly-versus-whirl surface distinction; the core-atom doctrine already
  resolves it. **Adopted:** the platform's two distinct atoms. **Why:** Stanford's
  grammar under-distinguishes; the platform's structural model does not.
- **Blazing ≡ Blurry (6 pairs)** — `X-1.-1-Z` names both Blazing Mirage and Blurry
  Mirage, and five more like it. This is the whirling-versus-stepping ambiguity Ben
  Lynn flagged, surfacing through the blazing/blurry folk split.
- **Spinning ≡ Sonic (5 pairs)** — `X.\...` names both. The spec distinguishes them
  by single versus double backslash (`X\.` gyro/spinning versus `X\\.` sonic), but
  the move list never writes the doubled backslash, so the distinction is lost in the
  corpus itself — a Stanford-internal inconsistency, not a platform disagreement.
- **13 further single-instance collisions**, three of which are between two
  Stanford-only names.

**Adopted for the whole cohort:** wherever a side is represented, the platform's
distinct canonical entries stand. **Why:** the collisions are limits of Stanford's
notation, not evidence the platform's distinctions are wrong. Where exactly one side
of a collision is already canonical and the other is a Stanford-only name for the
identical formula, that is an alias *candidate*, recorded in Section F.5 — a curator
decision, not a contradiction.

---

## E. Genuine contradictions

**None.** Every one of the 119 ADD disagreements traces to the scoring-convention
offset (B.1) or the clipper filler quirk (B.2). A terminal-surface cross-check
across all 608 represented rows produced an initial 70 apparent mismatches, every
one of which was an artifact of confusing Stanford's *entry* letter with its
*terminal* letter; on inspection each row's operational notation ends in exactly the
surface Stanford's formula predicts. No Stanford formula asserts a structure
incompatible with the platform that the four benign categories do not explain. For a
source of 994 formulas, zero genuine contradictions is itself the finding: Stanford
and the platform describe the same vocabulary, in different symbols, at the same
structure.

---

## F. Useful structural information Stanford provides

Stanford's real value to the encyclopedia is not as a scorer to reconcile but as a
structural lens. Recorded here as scholarship; each item is a curator opportunity,
not a change made by this document.

1. **Entry-surface dominance, quantified.** Of 994 formulas, 48.8% open from a
   toe-set (`Z`) and 45.9% from a clipper-set (`X`); only 5.3% open from anything
   else (dragon, inside, pendulum-as-set, frigid-osis, crossbody-sole). The
   vocabulary is toe-or-clipper dominant to a degree the platform has no stats
   surface for. This independently corroborates the topology audit's own
   clipper-and-toe finding.
2. **Multi-name folk clusters.** Stanford shows one entry shape carrying several
   community names: `X-1.` is Stepping / Blurry / Whirling / Blazing (four names),
   `X-0.` is Bubba / Hopping / Scattered / Shattered (four), `X-1+1.` is High
   Stepping / Barraging / Furious (three). The platform treats several of these as
   distinct modifiers with their own ADD-bonus rows. Whether that is a real
   distinction (body-state during the dex, pedagogical lineage) or a naming-tradition
   overlap is a genuine ontology question — and Stanford's lattice is the cleanest
   evidence for framing it. It bears directly on the merger doctrine the Identity
   paper carries.
3. **Named-versus-unnamed combinatorial gaps.** Ben Lynn explicitly enumerates
   structurally-valid shapes the folk tradition never named — `Z+0-1.` (fairy
   quantum), `Z-0-0.` (atomic atomic), `Z-0-1.` (atomic quantum), `Z-0+1.` (atomic
   pixie). None exists as a canonical row today, even after the corpus grew fivefold.
   These are real, valid, currently-unnamed slots — material for the Frontier paper's
   unnamed-structure question, and a possible "discover unnamed tricks" surface.
4. **A 386-formula promotion frontier.** The Stanford-only rows, bucketed by claimed
   ADD (4-ADD: 125, 5-ADD: 90, 6-ADD: 63, then thinning to a single 9), are a
   second-attestation pool for future curator triage — weighted, per Section G, as
   shared-FM lineage rather than independent evidence.
5. **Eighteen clean alias candidates.** Eighteen Stanford formulas are identical
   between a name already canonical and a Stanford-only name with no alias link — for
   example `X-1.-0+Z` shared between Blazing Legover (canonical) and "Blurry Legover"
   (Stanford-only), and `X.\-1-Z` shared between Spinning Mirage and "Sonic Mirage".
   These are low-risk, structurally-verified alias candidates. Recorded for curator
   review; wiring them is a data change that needs approval, exactly as the 43
   FootbagMoves alias candidates are held.
6. **A sign-pattern axis the platform does not encode.** Stanford makes visible
   whether a compound repeats a dex sign (`Z+1+1.` Terraging) or alternates it
   (`Z+1-0.` Sailing) — a "side-switching mid-trick" facet the flat modifier-stack
   model elides. A candidate first-class facet, recorded, not adopted.

## G. Lineage independence — how much Stanford corroborates

The ADD divergences prove the shared-lineage finding rather than merely asserting it.
Stanford's scoring-convention offset (B.1) runs in the **same direction as
FootbagMoves' divergences, on the same cohorts**: it over-counts modifier stacks
(atomic, sailing, shooting, furious — Stanford reads them high, as FM does) and
under-counts the same-side configuration (Nuclear ss Butterfly / `barfry`: Stanford
4, FootbagMoves 4, platform 5 — the two outside sources land on the *identical*
under-count). This is not two independent sources agreeing; it is one lineage,
doubly encoded, reproducing the same gaps against the platform's model.

One nuance sharpens it: Stanford's *literal token tally* is sometimes more
conservative than FootbagMoves' *operator-weight* count. Furious Whirl (`genesis`)
is FootbagMoves 7, Stanford 6, platform 5 — same over-count direction, smaller
magnitude from Stanford. So Stanford is a re-notation that occasionally softens FM's
number, not a byte-copy of it, but it is unmistakably the same lineage.

The consequence for the encyclopedia's evidence-weighting is the Charter's rule,
confirmed: a trick attested by FootbagMoves and Stanford and nothing else is
**one** corroboration, not two. Only an independent lineage — footbag.org, a
competition record, a lesson attestation — lifts a reading to strongly attested. A
scholarly-hygiene corollary worth recording: several distinctive folk names now live
in the canonical dictionary verbatim (`hurl`, `barfry`, `genesis`, `nebula`,
`predator`) *and* in Stanford. Where a canonical name was itself adopted from the
FM/Stanford naming tradition during promotion, a present-day name match is the same
lineage re-imported, not fresh corroboration, and should not be double-counted in a
future source-strength pass.

## H. For the maintainer

Nothing in the Stanford overlap is a genuine source-of-truth contradiction — Section
E found zero. Two items are curator opportunities, not disagreements, recorded so the
backlog is visible rather than lost:

1. **The 18 alias candidates** (F.5) — structurally verified, low-risk, awaiting the
   approval any data change requires.
2. **The multi-name folk clusters** (F.2) and the **unnamed combinatorial gaps**
   (F.3) — structural evidence to carry into the Identity paper's merger discussion
   and the Frontier paper's unnamed-structure question, respectively.

The Butterfly-versus-Reverse-Whirl collision (D) is explicitly **not** on this list:
it is a Stanford notation limit the settled core-atom doctrine already resolves, and
it is recorded as a parser difference, not an open question.

## I. Summary

| Category | Count | Nature |
|---|---:|---|
| Equivalent notation | 489 matched | Same trick, different alphabet |
| Historical naming | 41 alias + 98 gloss | Stanford's name is a known alias or structural sub-name |
| Parser difference | 32 collisions + clipper | Stanford's grammar under-distinguishes |
| Doctrine difference | 118 | Stanford's token tally vs the platform's structural-ADD model |
| Genuine contradiction | 0 | — |

The one sentence of this reconciliation: **Stanford is the same vocabulary in a
smaller alphabet, drawn from the same lineage as FootbagMoves.** Its ADD divergences
reproduce FootbagMoves' cohorts and so corroborate the platform once, not twice; its
grammar collisions are limits of a compression, not claims; and its lasting value is
as a structural lens — the entry-surface dominance, the multi-name clusters, and the
unnamed-slot enumeration — rather than as a source whose numbers the platform must
weigh.
