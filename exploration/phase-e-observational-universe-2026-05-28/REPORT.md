# Phase E — Observational Universe Reconciliation + Promotion Strategy

**Date:** 2026-05-28
**Status:** Strategy / audit report. Read-only. No promotion, no merge, no
ontology mutation, no fabricated formula / JOB / ADD.
**Deliverable scope:** the 15 numbered sections requested + the A0
compound-notation-extrapolation bucket + the requested expansion metrics.

---

## 0. Method honesty (read first)

This report is a **synthesis-and-strategy layer over work that already
exists**, not a fresh derivation. Most of the heavy lifting was done in
five prior passes whose artifacts I re-used rather than re-computed:

- `exploration/vocabulary-reconciliation-audit-2026-05-21/RECONCILIATION.csv`
  — the unified per-name reconciliation table. **Now 2,460 rows** (the
  AUDIT_REPORT.md in that folder still says 761; it is stale — the file was
  regenerated 2026-05-27 10:31 after Wave 0 expanded the corpus union).
- `exploration/wave0-reconciliation-expansion-2026-05-26/` — corpus union
  build (2,382 unique normalized names; index 3,176).
- `exploration/wave1-triage-2026-05-27/` — the A–F mechanical/blocked
  classifier over the state-3 population, **plus 30+ `w*_apply.py` promotion
  scripts (W1a–W9o) that already ran on 2026-05-27.**
- `exploration/promotion-cohorts/`, `.../footbagmoves-federation/` (divergence
  register + curator queue), `.../passback-intake/`, the doctrine framework,
  the family doctrine pass, and the Phase C consistency audit.

**Three honesty caveats that shape every number below:**

1. **The CSV is a post-W9 snapshot.** The Wave 1 triage counted **2,154**
   state-3 names *before* the W1–W9 promotion waves. The current CSV shows
   **1,879** state-3 names. The ~275-row drop is the W1–W9 work draining
   Cat A. So Phase E does **not** start from a full Cat-A backlog — it starts
   *after* the cheap mechanical promotions already happened. The remaining
   observational bulk is proportionally harder than the triage's headline
   62% "safe" figure suggests.

2. **The classifier columns were never re-run over the full corpus.** Of the
   2,460 names, only **282** carry an `add_formula` + `primary_operator`,
   only **~544** carry any `parse_confidence`, and **2,176** have a blank
   `doctrine_status`. The rich scoring covers roughly the original
   audit population; the ~1,700 Wave-0-added names sit at
   `governance_state = 3` with everything else blank. **The mechanical-vs-
   blocked split for most of the corpus is therefore currently *unknown* —
   defining the pipeline that classifies them is the core of Phase E, not a
   thing this report can finish.**

3. **The live parser has not been run on the live DB snapshot.** All 446
   compound rows in `database/footbag.db` have `structural_parse_json`,
   `computed_adds`, and `add_formula_status` NULL. (`parse_freestyle_notation.py
   --apply` is the populator; it is not in `reset-local-db.sh`.) The
   extrapolation pipeline (§6) *can* fill these; this snapshot does not
   reflect it.

Every percentage below is labelled with its denominator and basis. Estimates
are labelled **(est.)**.

---

## 1. Reconciliation findings

**Live canonical DB** (`database/footbag.db`, `freestyle_tricks`): **516 rows**
— 446 compound, 15 dex, 15 surface, 13 body, 11 modifier, 9 set, 5
uncategorised, 2 multi-bag. 514 active / 2 inactive. **490** of these get a
canonical detail page (compound + surface + dex + body + multi-bag); that is
the universe the Phase C audit covers. Supporting: 136 aliases, 487
modifier-links, 551 source-links across **3 registered sources** (Red Husted
review 479, curated-v1 72, footbag.org 0 links — registered but unlinked).

**Unified observational universe** (`RECONCILIATION.csv`, 2,460 unique names),
by governance state:

| State | Meaning | Names | % of 2,460 |
|---|---|---:|---:|
| 1 | Published canonical | ~510 | 20.7% |
| 2 | Covered via alias / equivalence | ~9 | 0.4% |
| 3 | Observationally represented | 1,879 | 76.4% |
| 4 | Pending symbolic resolution | 44 | 1.8% |
| 5 | Policy-dependent | 20 | 0.8% |
| 7 | Structurally ambiguous | 2 | 0.1% |
| 6 / 8 | Historical-obsolete / insufficiently-sourced | 0 | (heuristic; needs curator pass) |
| 9 | Truly untracked | un-enumerable | (the growth frontier; see §3) |

`in_db`: **226 True / 2,234 False.** (Published-canonical *names* > in_db rows
because several distinct names map to one DB row, e.g. "clipper kick" and
"clipper" → `clipper`. The audit is name-level; that is correct, not
double-counting.)

**Headline finding:** the universe is **~21% resolved, ~76% documented-but-
unresolved.** The unresolved bulk is not noise — it is real, sourced freestyle
vocabulary. The reconciliation problem is therefore **mostly additive (a large
union to classify), not deduplicative** (see §2).

---

## 2. Overlap matrix

Cross-source presence by **lexical normalized-name identity** (the only
overlap the data currently encodes):

| | exclusive | shared | total presence |
|---|---:|---:|---:|
| Stanford | 851 | ~0 | 851 |
| FootbagMoves | 801 | 58 (52 w/ PB, 6 w/ fborg) | ~859 |
| PassBack | 396 | 52 (w/ FM) | ~448 |
| footbag.org | 306 | 6 (w/ FM) | ~312 |
| IFPA-canonical | 47 | — | 47 |
| curator | 1 | — | 1 |

`n_sources`: **2,402 single-source, 58 two-source, 0 three-or-more.**

**Finding:** lexical cross-source overlap is **tiny (~2.4%)**. Each corpus is
largely disjoint. **But this almost certainly *understates* conceptual
overlap** — the same trick appears under different folk names and notations
across sources (Stanford shorthand `Z.+0-0+X` ≡ "eggbeater" ≡ a PassBack
natural-language name). Lexical matching cannot see this. **The structural-
expansion pipeline (§6) is the prerequisite for true cross-source dedup:**
only after every name is normalized to canonical components can the real
intersection be measured. Treat the 58 lexical overlaps as a *lower bound* and
a watch-list, never as the dedup ceiling.

---

## 3. Cross-source gap analysis

**Source sizes & character:**

- **Stanford (~851, the largest, ~99% exclusive)** — a single-character
  shorthand cipher (`STANFORD_TOKEN_DICT.md`): set-position, dex counts,
  direction, terminal surface (e.g. `Z.+0-0+X`). **Deterministically
  decodable** to canonical components given the token dictionary. This is the
  single biggest mechanically-recoverable block, but via a *cipher decoder*,
  not natural-language parsing.
- **FootbagMoves (~859)** — natural-language compound names + an ADD column
  that **systematically over-counts** vs footbag.org/IFPA (see §5). Compound
  structure is visible in the name.
- **PassBack (~448)** — natural-language compound names that **encode the full
  modifier stack directly in the visible name** (e.g. "Stepping Ducking
  Mirage", "Pixie Ducking far Mirage", "Atomic far Eggbeater", "Spinning far
  Miraging Symp. Miraging Refraction"). The single richest source for A0
  extrapolation (§6).
- **footbag.org (~312)** — pre-bucketed by ADD band (1-add … 7-add); explicit
  ADD claims; the `FBORG_CURATOR_SELECTION_QUEUE` already sorts 77 of these.
- **IFPA-canonical (47)** — the curated atoms/modifier stubs already in the DB.

**Which sources hold the largest *unresolved* universes:** Stanford and
FootbagMoves (both large, both mostly state-3, both structurally parseable).
**Which are mostly aliases:** the 52 FM∩PB names + the blurry/stepping cluster
are the clean alias-candidate surface. **Which are likely parser artifacts:**
negligible — the `no-notation` family (210 names) is the closest thing, and
those are opaque-folk candidates, not malformed syntax (§10).

---

## 4. Duplicate / alias findings

- **Lexical exact/variant duplicates:** 58 cross-source same-name pairs (§2),
  plus known intra-source format variants (ATW/around-the-world,
  DLO/double-leg-over, DATW, slash/parenthetical variants) — these are
  collapse-on-normalization candidates, **confidence-tagged, never silently
  merged.**
- **Alias / equivalence relationships already recorded:** the CSV carries
  populated `equivalent_to` on the resolved rows; the live DB carries 136
  aliases. The Wave 1 triage classified **476 names (22.1% of the 2,154
  state-3 population) as Cat B — alias / compression** — i.e. the single
  largest non-mechanical bucket is *not new tricks, it is renamings of tricks
  already in the system.* Collapsing these is a **count-reduction**, not a
  promotion.
- **Constraint honored throughout prior work:** equivalence is recorded as a
  *relationship*, never a merge; per-source `source_adds` preserved (Red
  2026-05-21 doctrine). Phase E must keep this.

**Recommendation:** the alias-collapse pass (Cat B) should run *before* the
promotion pass, because every Cat-B name resolved removes a false "missing
trick" and prevents an Emerging-Vocabulary card that duplicates canon.

---

## 5. Unresolved-name classification (the buckets)

Phase E's requested buckets, mapped onto the **already-computed Wave 1 triage**
(basis = 2,154 state-3 names, pre-W9; proportions still hold for the residual
1,879). The triage's A–E *is* this classification; I add **A0** as a sub-split
of A per the addendum.

| Bucket | Triage cat | Count | % | Meaning |
|---|---|---:|---:|---|
| **A0 Compound-notation extrapolatable** | A (subset) | ~est. 900–1,100 | ~est. 45% | Modifier-stack / cipher visible in the name; expandable deterministically (§6) |
| **A Mechanically derivable** | A (remainder) | (1,343 total A) | 62.3% | Known operators + known base; clean ADD accounting |
| **B Strong-inferred / alias** | B | 476 | 22.1% | Renaming/compression of existing canon; needs curator alias-merge |
| **C Doctrine-sensitive structural** | C | 104 | 4.8% | Structure plausible but coherence/placement review needed |
| **D Doctrine-blocked / folk-unresolved** | D | 227 | 10.5% | Waits on a doctrine ruling (§9) |
| **E Junk / invalid syntax** | E | 4 | 0.2% | Weak-source / malformed; quarantine |
| F Trivial | F | 0 | 0% | Filtered pre-Wave-0 |

**A0 is the central insight of the addendum and is correct:** the largest part
of the unresolved universe is **"not yet *formally promoted*," not "cannot be
*resolved*."** PassBack and Stanford in particular carry the full structure in
the surface form. A0 must be kept distinct from D (doctrine-blocked) and E
(junk) — conflating them is what makes the universe look more intractable than
it is. The A0 count above is an **(est.)** — it cannot be made exact until the
classifier (caveat 2) runs over the full corpus; producing that exact number
is deliverable #1 of the pipeline (§13).

---

## 6. Derivation strategy framework

The expansion target is identical across sources: **`set + modifier-stack +
terminal mechanic → {canonical components, proposed JOB, proposed ADD,
confidence, provenance}`**. What differs is the *front-end decoder*. Hence a
**two-front-end, shared-backend pipeline**:

```
  Stanford shorthand ──▶ [cipher decoder: STANFORD_TOKEN_DICT]──┐
  PassBack / FM / fborg ▶ [NL compound tokenizer]───────────────┤
                                                                 ▼
                              [canonical-component normalizer]
                                  (core-atom registry: 12 atoms;
                                   modifier ecosystem registry;
                                   alias/equivalence resolver)
                                                                 │
                                                                 ▼
                          [ADD/JOB derivation backend]
                          (parse_freestyle_notation.py +
                           derivation-audit operator rules)
                                                                 │
                                                                 ▼
        {proposed JOB, proposed ADD, add_formula_status, parse_confidence,
         add_confidence, provenance, "observationally-extrapolated" status}
```

**Answer to the addendum's explicit question** — *can Stanford shorthand,
PassBack compounds, and FM compounds share one expansion pipeline?*
**Partially, and that is the right design:** they converge on the *same
backend* (normalizer + ADD/JOB derivation) but require *different decoders*
(deterministic cipher vs natural-language tokenizer). Build the backend once;
build two thin front-ends.

**Derivation reliability (from the derivation/ADD/JOB audits):**

- The operator rules are already documented per modifier (paradox flips
  direction on a base-specific rule; ducking prepends `DUCK [BOD]`; spinning
  shifts `SET→CLIP`; stepping duplicates first dex; pixie tightens first dex;
  atomic adds X-Dex; symposium adds "no plant"). These are the deterministic
  core.
- JOB-notation audit: of 61 notation gaps on live tricks, **~54 were judged
  mechanically derivable** (19 high-confidence "Bucket A" + ~35 needing a
  light curator check), **7 doctrine-blocked.** That ~88% mechanical rate is
  the best available evidence for the A0 thesis.
- **Hard failure modes (must not auto-harden):** tapping signature diverges
  across siblings (spinal-tap ≠ tap); stepping on barrage (blurrage) is
  unprecedented; any base whose own family is unruled. These route to C/D, not
  A0.

**Forever-rule:** extrapolated JOB/ADD is **observational, confidence-scored,
provenance-stamped — never silently written into canonical ontology.** This is
the existing parser/editorial layer-separation rule applied to the corpus.

---

## 7. Promotion-shortlist methodology

A name is promotable when it satisfies the **Canonical Trick Publication
Contract** (symbolic representation, structural composition, discoverability,
alias governance, honest incompleteness, no fabricated structure). The tiering:

| Tier | Gate | Sourced from |
|---|---|---|
| **1 — mechanically promotable** | A0/A + settled doctrine + clean derived JOB/ADD + base already canonical | triage Cat A residual ∩ derivation Bucket A ∩ promotion-cohorts "backfill-ready" |
| **2 — high-confidence curator review** | A/C + one small judgment (folk-name resolution, new base, chain confirmation) | derivation Bucket B + FBORG queue foundational/topology tiers |
| **3 — doctrine-blocked** | waits on a Red ruling | triage Cat D + the open Red packets (§9) |
| **4 — observational only** | worth documenting, unlikely canonical | historical-oddity queue + opaque folk |
| **5 — quarantine / junk** | invalid / weak-source | triage Cat E (4) |

**Method, not fresh data:** the inputs already exist —
`promotion_cohorts_2026-05-23.csv` (26 cohorts), the FBORG curator queue (77
rows, 5 tiers), the derivation-audit buckets, and the triage per-ecosystem
splits. Phase E's job is to *intersect* them into a single ranked queue keyed
by `(triage_cat == A) AND (derivation_bucket == A) AND (publication_status ==
first_class_ready) AND (in_db == False)`, sorted by ecosystem batch so prose
can be authored family-at-a-time (the SCALE-pilot model).

---

## 8. Top promotion candidates

**Tier 1 (mechanically promotable now).** The CSV already flags **58 names
`first_class_ready` AND not in DB** — that is the concrete Tier-1 shortlist.
The cleanest ecosystem batches (triage A-heavy, low/zero D):

- **inspinning** — 24 names, A=20, D=1 (XS risk). Head of queue.
- **quantum** — 50 names, A=27, D=1. `quantum-illusion`, `quantum-mirage`,
  `quantum-pickup`, `quantum-whirl`.
- **rail-rooted** — 15 names, A=14, D=1.
- **gyro-spyro** — 114 names, A=63, low C/D — large clean batch.
- **fairy** — 136 names, A=84 (note: fairy *productivity weight* itself is a
  Red Q4.A item — promote the clean members, hold the weight-sensitive ones).
- **promotion-cohorts backfill-ready:** symposium (6/6 ready), legover-
  descendants (4/5), pixie (7/10), clipper-descendants (3/6).

**Tier 2 (one curator judgment):** FBORG queue's 9 foundational/pedagogical +
33 topology-critical (e.g. `around-the-world-kick`, `pixie-leg-over`,
`tapping-illusion`, `paradox-blizzard`).

*All names above are quoted from existing queues; none are newly invented, and
none carry a Phase-E-authored ADD/JOB.*

---

## 9. Doctrine-blocked clusters

**Doctrine block is highly concentrated.** Of 227 Cat-D names, **208 (92%)
sit in just four ecosystems:**

| Ecosystem | D-blocked | Blocking question |
|---|---:|---|
| blurry-furious | 129 (100% of cluster) | Q1.A — does `blurry` carry +2 on rotational bases? Q1.C — `furious` on non-rotational |
| weaving | 32 (100%) | weaving movement ruling pending |
| pogo | 28 (100%) | pogo structural ruling pending |
| shooting | 19 (100%) | shooting structural ruling pending |

The remaining ~19 Cat-D are scattered (symposium 23-of-235, paradox 15, etc.).

**Other named doctrine blocks (from the doctrine framework + Red packets):**

- **Atomic-class on compound bases** — Q2.A: witchdoctor (IFPA 5 vs 4),
  omelette (pickup-vs-illusion root). Implicit +2 rotational vs +1 flat.
- **IFPA implicit-operator gap** — Q7: ~17 PassBack rows where IFPA exceeds PB
  by +1..+5 (blurrage, predator, schmoe at gap=1). Strongest hypothesis: an
  implicit "set/named-trick +1" baseline. **Highest-leverage single ruling.**
- **Family-placement unrulings (family doctrine R8):** drifter lineage
  (mirage-descendant vs standalone), eclipse (mirage vs osis), butterfly-swirl
  (whirl/swirl vs butterfly), torque/blender/phoenix classification, the 4
  uncarded parent families (illusion/legover/pickup/around-the-world). These
  also block the glossary §families rewrite (cross-ref the family-taxonomy
  workstream).
- **FM-only operators (Q4, ~14):** presume reject-uniformly pending ruling.
- **Polysemy (Q5):** dragon (3 roles), slicing (FM-internal conflict),
  quantum (educational-layer only, no ADD impact either way).

**Sequencing implication:** four Red rulings (Q1.A blurry, weaving, pogo,
shooting) would unblock **208 names** — the single highest-ROI doctrine action
in the whole phase.

---

## 10. Parser / junk clusters

True junk is **negligible**: triage Cat E = **4 names (0.2%)**; Cat F
(trivial) = 0 (filtered before Wave 0). There is **no evidence of a large
malformed-syntax population.**

The nearest thing to a "parser can't structure this" cluster is the
**`no-notation` family (210 names)** in the CSV — names the structural parse
could not bucket. These are **opaque-folk candidates, not junk**: they need
historical/movement research or a folk-name equivalence, not quarantine. Route
them to Bucket 4 (observational-only) pending evidence, **not** Bucket 5.

**Recommendation:** keep the quarantine bucket tiny and explicit. Resist the
temptation to dump hard-to-parse names into "junk" — that destroys
documentation value and violates honest-incompleteness.

---

## 11. Proposed Emerging Vocabulary redesign

**Current state (the problem):** the public `/freestyle/observational` surface
is a **hand-maintained content module** (`freestyleObservationalTricks.ts`,
**58 cards** across 4 lanes: promotion-queue / formula-review / source-only /
doctrine-blocked) **plus a separate flat ~1,770-name `freestyleTrackedNames.ts`
list.** It is **not derived from RECONCILIATION.csv** — it is a parallel,
divergent system. Overlap with canon is prevented **only by manual curation**
(the "never reuse a canonical slug" rule is documented but **not enforced in
code**). There is no per-entry confidence score, and the 58 cards represent
~3% of the 1,879-name observational universe.

**Target: an observational-governance surface derived from the single source
of truth.**

1. **Derive, don't hand-maintain.** Generate the surface from
   `RECONCILIATION.csv` at build time (the audit script is already the
   re-runnable generator). The 58-card module becomes curator *overrides*
   (notes, lane forcing), not the data spine.
2. **Mechanical overlap guard (satisfies the spec's non-overlap requirement).**
   Filter to `in_db == False AND governance_state NOT IN (1, 2)`. This
   *guarantees* no Emerging entry collides with a published canonical trick,
   a curated alias, or a known decomposition — enforced by the query, not by
   hand.
3. **Group by governance status, not a flat list.** Primary axis = governance
   state (3/4/5/7); secondary = triage category (A0/A/B/C/D/E); tertiary =
   ecosystem cluster. This replaces the 4 ad-hoc lanes with a principled
   2-level grouping that scales to ~1,900 names.
4. **Expose confidence + provenance per entry** (the columns already exist):
   `parse_confidence`, `add_confidence`, `n_sources`, `sources`,
   `doctrine_status`, and the proposed-JOB/ADD with an explicit
   "observationally extrapolated" badge distinct from canonical ADD.
5. **Separate the axes the spec lists** — mechanically-derivable /
   doctrine-blocked / observational-only / folk-lineage / source-exclusive /
   ecosystem-cluster / parse-confidence / add-confidence — as **filter
   facets** over the one derived dataset, not separate surfaces.
6. **Keep the layer wall.** Observational entries still get no canonical row,
   no media, no detail-page route (existing contract). The redesign changes
   *where the data comes from* and *how it is grouped*, not the layer
   separation.

This is a **design recommendation only**; building it is a separate approved
slice (it touches a public route + service + template → `add-public-page` +
`extend-service-contract` when undertaken).

---

## 12. Governance-state recommendations (evaluate only — do NOT implement)

The current 9-state model is sound; the gaps are in *sub-classification*, not
the top-level states. Evaluation:

- **Keep** the 9 states. They map cleanly to the Vocabulary Registry design.
- **Add sub-flags on state 3** rather than new top-level states, to carry the
  triage signal: `mechanically-derived` (A0/A), `alias-collapsed` (B),
  `parser-derived` (machine-expanded, unreviewed), `high-confidence-
  observational`, `doctrine-blocked` (D), `unresolved-folk-name`
  (no-notation), `policy-dependent` (already state 5).
- **States 6 (historical/obsolete) and 8 (insufficiently-sourced) stay empty
  until a curator allow-list populates them** — they must not be heuristic-
  guessed (a near-empty state 6 is doctrinally *correct*: freestyle layers
  names rather than retiring them, per Doctrine C).
- **State 9 (truly untracked) remains un-enumerable** and is operationalised
  by the registry's growth frontier, not pre-populated.

Recommendation: encode the sub-flags as **CSV columns / TS content**, reversible
(per the reversible-content-governance rule), not as a schema migration —
ontology is still stabilising.

---

## 13. Implementation sequencing

Ordered by `(unblock value) / (doctrine risk)`. **Each step is its own
approved slice; this is a proposal, not a commitment.**

1. **Re-run the classifier over the full corpus (deliverable #1).** Run
   `audit_vocabulary_reconciliation.py` + the triage classifier so all 2,460
   names carry parse/add/doctrine columns. *This is the prerequisite that
   turns every "(est.)" in this report into a real number.* No promotion.
2. **Build the structural-expansion pipeline backend** (§6) + the two decoders.
   Output to a staging CSV with confidence/provenance. Read-only on canon.
3. **Alias-collapse pass (Cat B, ~476).** Resolve renamings to existing canon
   first — shrinks the universe and prevents duplicate Emerging cards.
4. **Tier-1 mechanical promotion, ecosystem-batched** (inspinning → quantum →
   rail-rooted → gyro → clean fairy/pixie/symposium), prose authored
   family-at-a-time. Continues the W1–W9 pattern.
5. **Four Red rulings (Q1.A blurry, weaving, pogo, shooting)** → unblocks 208
   Cat-D names. Highest doctrine ROI. Then Q7 (implicit-operator gap).
6. **Emerging Vocabulary redesign** (§11) — once the derived dataset exists,
   swap the hand-maintained module for the generated surface.
7. **Family-placement rulings (R8)** in parallel — also unblocks the glossary
   §families rewrite.

---

## 14. Risks if implemented aggressively

1. **Hardening parser guesses into canon.** The biggest risk. Extrapolated
   JOB/ADD is a *hypothesis*. Auto-promoting A0 output without the
   confidence/provenance wall would fabricate ontology at scale. **Mitigation:**
   "observationally-extrapolated" status is terminal until curator/Red review;
   never write computed values over `adds`.
2. **Silent alias merges.** Collapsing 476 Cat-B names by lexical similarity
   will mis-merge distinct tricks (folk names are noisy). **Mitigation:**
   confidence-tag every merge; equivalence is a relationship, never a
   destructive merge; preserve per-source `source_adds`.
3. **Doctrine pre-emption.** Promoting blurry/atomic/witchdoctor families
   before Q1.A/Q2.A/Q7 ruling bakes a guessed ADD rule into 200+ pages.
   **Mitigation:** Tier 3 stays frozen until the specific ruling lands.
4. **Cross-source over-trust.** FM systematically over-counts ADD (§5);
   importing FM ADD as truth would propagate the +1/+2 error. **Mitigation:**
   per-source `source_adds`, never a collapsed single value.
5. **Coverage-metric theatre.** "% resolved" can be inflated by promoting junk
   or by counting extrapolated-but-unreviewed as canonical. **Mitigation:**
   report extrapolated and reviewed-canonical separately, always.
6. **Emerging-surface drift returning.** If the redesigned surface is
   hand-edited again instead of regenerated, the parallel-system problem
   returns. **Mitigation:** make the CSV the generator; module = overrides only.

---

## 15. Estimated canonical-coverage maturity

**Resolved today (basis = 2,460 unique names):**

- Exact canonical (state 1): ~510 → **20.7%**
- + alias/equivalence covered (state 2): ~9 → **21.1% resolved total**
- Documented-but-unresolved (state 3): 1,879 → **76.4%**
- Pending/policy/ambiguous (4/5/7): 66 → **2.7%**

**Within the unresolved bulk** (triage proportions, basis = 2,154 state-3,
pre-W9 — **(est.)** for the current residual):

| Addendum metric | Est. | Basis |
|---|---:|---|
| % parser-expandable / mechanically extrapolatable (A0+A) | ~62% | triage Cat A |
| % source-only aliases (B) | ~22% | triage Cat B |
| % doctrine-blocked (D) | ~10.5% | triage Cat D (92% in 4 ecosystems) |
| % structural-review (C) | ~5% | triage Cat C |
| % opaque folk-name | ~5–9% | `no-notation` family ∩ C |
| % impossible/invalid syntax (E) | ~0.2% | triage Cat E (4 names) |

**Maturity verdict (est.):** the canonical *publication* layer can realistically
rise from **~21%** of the universe to a **~55–65%** ceiling once (a) Cat-B
alias-collapse removes duplicate "missing" names, (b) Tier-1/Tier-2 mechanical
promotion clears the A0/A bulk, and (c) the 4 high-concentration doctrine
rulings land. A **~10–15% residual** (doctrine-permanent edge cases + opaque
folk names + the un-enumerable state-9 frontier) is the honest long-term floor
of *unresolved* — and that floor is correct, not a failure: it is the
observational layer doing its job.

**The platform's end state is four coexisting layers** — canonical truth /
observational documentation / unresolved doctrine / historical vocabulary —
never collapsed into one. Nothing in this strategy promotes for the sake of a
metric; the objective is an *intelligible, deduplicated, honestly-classified*
universe with a deterministic, confidence-preserving pipeline feeding it.

---

## Appendix — data provenance for this report

- Live DB counts: direct `sqlite3` queries against `database/footbag.db`
  (2026-05-28).
- Governance/source/confidence distributions: direct import + GROUP BY over
  `RECONCILIATION.csv` (2,460 rows, regenerated 2026-05-27 10:31).
- Mechanical/blocked split + per-ecosystem table: `wave1-triage-2026-05-27/
  summary.txt` (2,154 state-3 basis).
- Divergence patterns: `footbagmoves-federation/FBORG_CROSS_SOURCE_DIVERGENCE_
  REGISTER_2026-05-21.md` (11 divergences).
- Promotion inputs: `promotion-cohorts/` (26 cohorts) + `FBORG_CURATOR_
  SELECTION_QUEUE_2026-05-21.csv` (77 rows, 5 tiers).
- Doctrine/Red state: `doctrine_divergence_framework_2026-05-23.md`,
  `red-consolidation/`, `red-*-packet*/`.
- Emerging Vocabulary impl: `src/content/freestyleObservationalTricks.ts`
  (58 cards, 4 lanes) + `freestyleTrackedNames.ts` (~1,770 names);
  `/freestyle/observational` route.
- Family doctrine: `family-ruling-pass-short-2026-05-28/`,
  `glossary-family-doctrine-2026-05-28/`, `family-hierarchy-audit-2026-05-28/`.

No source data, master spreadsheet, CSV, or DB was modified.
