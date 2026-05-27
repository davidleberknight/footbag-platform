# ONTOLOGY_SYMBOLIC_STRATEGIC_REVIEW — 2026-05-13

**Project:** Strategic review of the freestyle trick ontology + symbolic notation system at the symbolic-grammar layer's post-shipping checkpoint.
**Stance:** Optimize for educational clarity, symbolic coherence, ontology stability. Do NOT optimize for maximum ontology size. Do NOT collapse the four conceptual layers.
**Scope:** Analysis + recommendations only. No code, schema, ontology, ADD, parser, or alias mutations.

---

## 0. EXECUTIVE SUMMARY

The system has stabilized enough to **resolve much more without Red** than was true six months ago. The symbolic-grammar layer + 8-layer representation model + modifier-operator framework have absorbed enough of the formal structure that **EQUIVALENCE-type pendings (the dominant pending category) can now be auto-resolved or auto-proposed.**

Four findings worth acting on:

1. **The pending Red cluster is dominated by EQUIVALENCE questions** that newer symbolic understanding can now resolve as proposals (Red confirms; doesn't decide from scratch). The pending count drops from 18 to ~4-6 with this reframing.
2. **Operational notation coverage is the bottleneck** (10% of active tricks). Semantic notation is at 42%. Every other downstream capability — topology browse expansion, archetype browse, decomposition viewer, symbolic search — depends on operational coverage growing.
3. **footbagmoves has ~400+ rows not in the canonical set.** Most are aliases or decomposition variants, not novel canonical tricks. A classification pass triages them into 4 buckets without any expert ruling required.
4. **Future Red packets should be cluster-based, not item-based.** The dominant pattern from pt1–pt12 was per-trick adjudication; the next era should be per-pattern (pixie/fairy together; whirl/swirl together; down-family already pioneered this).

**The ADD-derivation policy proposed in the prompt is correct and should be adopted.** Operational details + a three-class conflict policy below.

---

## SECTION A — EXISTING RED QUESTION AUDIT

### A.1 The corpus

12 Red rounds: pt1 through pt12, plus 2 follow-up packets (`red-followup-2026-04.md`, `red-followup-down-family-2026-05.md`). Consolidated state in `legacy_data/inputs/curated/tricks/red_corrections_consolidated.csv` (73 rows).

Disposition distribution:

| Disposition | Count | Share |
|---|---|---|
| `applied` | 40 | 55% |
| `pending` | 18 | 25% |
| `informational` | 6 | 8% |
| `deferred` | 2 | 3% |
| Other (partial / quoted) | 7 | 9% |

Topic-type distribution:

| Topic type | Count | Notes |
|---|---|---|
| EQUIVALENCE | 23 | Folk-name ↔ canonical decomposition (the dominant axis) |
| MODIFIER_RULE | 13 | Operator semantics (e.g., blurry +2 → +1 per pt11) |
| NEW_TRICK | 12 | Additions to canonical set |
| ADD_VALUE | 6 | Numeric ADD adjudications |
| ADD_LOCK | 6 | Confirmations that an ADD shouldn't change |
| SCOPE | 4 | Boundary / inclusion decisions |
| CONSTRUCTION | 4 | Compositional structure rulings |
| NAMING | 3 | Folk-name preference (e.g., quantum vs toe-blur) |
| INFORMATIONAL | 1 | Context-only |

### A.2 Pending cluster (18 rows) — re-evaluated through symbolic logic

The 18 pending items in `red_corrections_consolidated.csv`, re-evaluated against the newer symbolic architecture:

| Status post re-eval | Count | Examples |
|---|---|---|
| **Now resolvable as Red-confirms-proposal** (symbolic decomposition is unambiguous) | ~10 | toe-blur = Quantum Mirage; toe-ripwalk = Quantum Butterfly; gyro-butterfly under +1 rotational rule; spyro-gyro inspin direction; quantum NAMING; toe-blizzard decomposition |
| **Now resolvable as parser-confidence inference** (decomposition is stable enough to apply without Red — but should produce a review row, not silently merge) | ~3 | flurricane (likely furious-modified compound); s-m-smasher; flux |
| **Still requires expert adjudication** (no symbolic shortcut) | ~4 | flail (folk → symposium illusion?); omelette (folk → atomic illusion?); royale (ADD + base unconfirmed); double-fairy / double-blender / double-spinning-osis (multi-set semantics ambiguous) |
| **Should be retired** (superseded by later rulings) | ~1 | Items pre-pt11 whose context has since clarified |

The reframing matters: a pending row from pt1 of "Toe Blur = Quantum Mirage" was open because nobody had codified "Quantum" as a canonical set modifier. Post-pt10, Quantum is canonical (`+1` per Red). The equivalence now follows by symbolic substitution; Red confirms; the question doesn't need a fresh adjudication.

### A.3 Areas where newer symbolic understanding changes the framing

| Pre-symbolic framing | Post-symbolic framing |
|---|---|
| "Is Toe Blur a separate trick from Quantum Mirage?" | "Toe Blur is a folk-name layer 5 reading of the canonical Quantum Mirage; alias merge, not new canonical" |
| "What's the ADD of Blurry Whirl?" | "Apply the pt11 blurry → +1 transition; Blurry Whirl decomposes to Stepping Paradox Whirl per pt12 packet" |
| "Are these two equivalent tricks?" | "Compute symbolic decomposition for each; if expanded forms are identical (after applying modifier-table rules + side-flag defaults), they're equivalent. Confidence by parser; Red confirms ambiguous cases" |
| "Should Flail be added as canonical?" | Now refined: "Flail = Symposium Illusion per footbag.org. Should the folk name be canonical, or should the structural reading be canonical with Flail as layer-5 alias?" |

### A.4 Outdated assumptions that the audit surfaces

- **Pre-pt10 assumption:** "blurry is +2 rotational." Superseded by pt11 (+1 flat). All downstream Blurry compounds (Blur, Blurriest, Blurry Whirl, Blurry Torque, Food Processor) now re-evaluated per pt12.
- **Pre-pt6 assumption:** "Fog = blurry-modified eggbeater AND stepping + paradox + double-leg-over." Two competing decompositions; pt6 disambiguated.
- **Pre-pt1 assumption:** "Tricks in the curator set may be historical-only." pt1 SCOPE answer: all still in active competition/shred. Releases the entire dataset for canonical-active classification.

### A.5 Questions that should be retired

- pt2 EQUIVALENCE: toe-blur, toe-ripwalk — auto-resolved by pt10 Quantum naming
- pt1 NAMING: quantum — already applied in modifier table
- pt2 EQUIVALENCE: gyro-butterfly, spyro-gyro — auto-resolved by pt11 +1 rotational rule + Red's earlier inspin direction ruling
- pt2 EQUIVALENCE: omelette — Red answered in red-followup-2026-04.md (Atomic Illusion); should flip from pending to applied

Recommend: a **`retire-pending` curator pass** that flips ~10 pending rows to `applied` based on later rulings that resolved them implicitly. Adds operational hygiene without new expert input.

### A.6 Questions that still require expert adjudication

The genuinely-pending hard cases (~4):

| Subject | Why still hard |
|---|---|
| Flail / Omelette / Royale as canonical | Disposition question (folk vs structural canonical) — needs Red's editorial preference, not technical answer |
| Double-fairy / double-blender / double-spinning-osis CONSTRUCTION | Multi-set composition is genuinely under-specified; need Red to decide whether "double" is a modifier with consistent ADD or naming-only |
| pt12 Blurry-transitive expansions (Blurry Whirl, Blurry Torque, Food Processor) | Math closes under the proposed decompositions but Red hasn't confirmed the structural reading |
| pt-pending residue from older rounds | Each needs cross-referencing against later rulings before re-asking Red |

These four belong in the next Red packet (Section D).

---

## SECTION B — SYMBOLIC COVERAGE GAP ANALYSIS

### B.1 Current coverage (active tricks; `is_active=1`)

| Layer | Count | Share of 160 active tricks |
|---|---|---|
| ADD value populated | 151 | 94% |
| Semantic notation (`notation` column) | 67 | 42% |
| Operational notation (`operational_notation` column) | 16 | **10%** |
| Has at least one modifier link | (data-dependent) | mid-range |
| Belongs to a topology group (one of 6 pedagogical) | (data-dependent) | mid-range |

**Operational notation is the visible bottleneck.** 90% of canonical tricks have no operational notation; the dictionary trick-card system uses "Notation pending" placeholders for them.

### B.2 ROI ranking — where to fill notation gaps

| Priority | Target set | Rationale |
|---|---|---|
| 1 | The 10 core base tricks (mirage, butterfly, whirl, swirl, osis, legover, pickup, illusion, ATW, orbit) | Foundational; every compound references one. The CORE_TRICK_GRAMMAR_DRAFT already documents the canonical notation for each. Operational column population is mechanical. |
| 2 | The 6 pedagogical-topology-group anchors + their immediate compounds | Topology view's expressed memberships gain real cards instead of "Notation pending" |
| 3 | All paradox-, spinning-, ducking-, symposium-modified compounds | These four operators are the curated modifier-family pages; their compounds should support the pedagogy with visible notation |
| 4 | High-traffic flagship tricks (Phoenix, Mobius, Montage, Ripwalk, Dimwalk, Matador, Mullet, Fury, Blur, Atom Smasher) | Curator-priority by community usage |
| 5 | Long tail | Curator-led as coverage fills |

A coverage-audit script (per the strategic review's prior recommendation) would emit a per-trick CSV showing notation populated / missing; that becomes the curator triage list.

### B.3 Missing modifier semantics

Per `MODIFIER_OPERATOR_FRAMEWORK.md` §6 + ongoing Red rulings, the following modifier semantics are **stable enough to declare canonical operators:**

- paradox (+1 body), symposium (+1 body), spinning (+1 body), gyro (+1 body, half-rotation), inspin (direction flip), ducking + weaving + diving + zulu (+1 body each), stepping (+1 set), pixie (+1 set), atomic (+1 set), quantum (+1 set), nuclear (paradox + atomic; +2 set), furious (+2 set), blurry (+1 per pt11)

**Still semantically unstable or partial:**

- **Symp vs symple vs muted** — three distinct mechanics, one folk shorthand (`symp`). Red has not formally locked the three as distinct canonical operators. Recommend: Section D packet.
- **Fairy** — appears in PassBack glossary as a set modifier but has no canonical Red ruling on ADD or composition. Pending.
- **Double-X** family (double-fairy, double-blender, double-spinning-osis) — multi-set composition rules undefined. Pending.
- **Alpine, crispy** — present in PassBack glossary; not yet adjudicated by Red. Low priority; folk variants.
- **Xdex** — narrower paradox sibling; Red has acknowledged it but ADD scope is per-named-trick (per pt1) rather than universal.

### B.4 Missing decomposition operators

The system currently composes via additive modifier links + base trick. Operators that are NOT yet first-class:

- **Direction flip (`in-`/`inspin` prefix on rotation)** — handled as a tokenizer flag but no modifier-row entry. Not blocking.
- **Side modifier (`ss`/`op`)** — relational, not additive. Handled as flags. OK.
- **Compositional collapse (folk-name shorthand)** — Mobius collapses Spinning + Torque; the collapse rule is curator-authored case-by-case. No general rule. **This is the right answer for now** — generic collapse rules would over-fit.

### B.5 Missing topology / archetype groups

Per `SEMANTIC_NAVIGATION_STRATEGIC_REVIEW.md` §B, two of the six pedagogical topology groups are redundant (`whirl-swirl-structures`, `pixie-uptime-dex`). Replacement candidates:

- **toe-landing dex tricks** (base ∈ {toe-stall, mirage, illusion, legover, pickup, ATW, orbit})
- **clipper-landing dex tricks** (base ∈ {butterfly, whirl, swirl, osis, blender})

These would round the topology set out to 6 well-justified groups without over-extending.

Archetypes: **NOT recommended for browse**. Per the prior review, archetypes belong in glossary §9 as a concept, not as a browse axis.

---

## SECTION C — FOOTBAGMOVES EXPANSION STRATEGY

### C.1 Coverage state

- footbagmoves.com lists ~569 trick rows (per user-provided count)
- Local intake cache in `legacy_data/inputs/curated/tricks/footbagmoves-{3adds,3-4adds,4adds,5adds,5-6adds}.txt`
- Canonical-active set: 160 tricks
- Estimated gap: ~400 footbagmoves rows not in canonical set

### C.2 Classification framework

Every footbagmoves row triages into one of six buckets without expert ruling required (the parser + symbolic-grammar layer can propose):

| Bucket | Definition | Action |
|---|---|---|
| **canonical_likely** | Distinct trick with established community usage; no canonical equivalent in the dictionary | Add to `red_additions.csv` for Red confirmation |
| **alias_likely** | Folk name; resolves to an existing canonical via symbolic decomposition | Add to `freestyle_trick_aliases.csv` with `alias_type='folk'`; no Red needed |
| **decomposition_likely** | Compound trick whose name IS its decomposition (e.g., "Stepping Op Butterfly" rather than "Ripwalk") | If the canonical exists, add as alias. If not, mark for canonical promotion. |
| **parser_generated_likely** | Combinatorially-generated row (every possible modifier × base); evidence: low view count or no demonstration | Defer; mark observational |
| **observational_variant** | Same trick under different side/direction flag (e.g., ss vs op) | Document as variant in alias system; don't promote as separate canonical |
| **unresolved_ambiguity** | Real ambiguity (e.g., name collision; multiple plausible decompositions) | Red packet candidate |

### C.3 Extraction heuristics

For each footbagmoves row, the classifier examines:

1. **Name → canonical-slug match?** Direct match → mark as `present`. Done.
2. **Name → alias-table match?** Direct alias match → mark as `aliased`. Done.
3. **Notation present in source?** If yes, parse with the existing tokenizer:
   - Parses cleanly + computed ADD matches asserted ADD → `decomposition_likely`
   - Parses but ADD mismatches → `ADD_CONFLICT` flagged (per Section E policy)
   - Parses but introduces an unknown token → `parser_generated_likely` (or asks for review)
   - Doesn't parse → `unresolved_ambiguity`
4. **Name shape heuristics** (e.g., "X Op Y" / "X Same Y" patterns) → typically `alias_likely` (folk operational naming for canonical structural reading)
5. **Multi-modifier compounds** (e.g., "Spinning Ducking Paradox Whirl") → `decomposition_likely`; if canonical exists, alias; if not, NEW_TRICK candidate

Output: a per-row classification CSV (`exploration/footbagmoves-classification/triage.csv`) that the curator reviews. Most rows resolve to `alias_likely` (no expert needed); the `unresolved_ambiguity` rows form the Red packet.

### C.4 Expected outcome

Rough estimate of the 400+ footbagmoves rows not in canonical set:

- ~250 `alias_likely` — folk-naming or compositional-naming variants of existing canonicals. Auto-resolve via alias system.
- ~80 `decomposition_likely` — compound tricks whose name IS the decomposition. Most resolve as aliases to existing canonicals.
- ~40 `parser_generated_likely` — combinatorial padding (every modifier × base). Defer.
- ~20 `canonical_likely` — actual new community tricks worth canonical promotion. Red packet.
- ~10 `unresolved_ambiguity` — needs expert disambiguation. Red packet.

**This expansion grows the canonical set by ~20 (12.5% increase) and the alias set by ~330** without Red needing to adjudicate most of it. The reviewable cluster shrinks to ~30 items.

### C.5 What NOT to do with footbagmoves

- **Do NOT bulk-promote footbagmoves rows to canonical without triage.** The 400+ count includes algorithmic combinations + observational variants. Mass promotion would inflate the ontology with noise.
- **Do NOT discard footbagmoves rows that don't fit canonical.** They become aliases or observational variants — the data is real community-named even when not canonical.
- **Do NOT treat footbagmoves notation as canonical operational notation.** Their notation is parser-readable input but uses slightly different conventions (e.g., `(BOD)` vs `[BOD]`; `>>` vs `> >`); normalize during ingest.

---

## SECTION D — NEXT-GENERATION RED QUESTIONS

### D.1 The reframing

Pt1–pt12 were largely per-trick adjudications: "Is this a real trick? What's its ADD? Does it equal that one?" The next era should be **cluster-based, pattern-resolution-focused**.

Cluster packets adjudicate **operators + patterns**, which then close out tens of pending tricks each.

### D.2 Proposed cluster packets

Six packets, in priority order:

#### Packet 1 — Symp / Symple / Muted disambiguation

**What it asks:** Are these three distinct canonical operators with separate names, or one canonical operator (`symp`) with three execution variants?

**Why it matters:** Unlocks operational-notation linting, modifier-table cleanup, glossary §6 operator definitions. Currently `symp` shorthand collides with all three; tests + parsers handle them inconsistently.

**Pending tricks unlocked:** ~8 (every symp-variant compound).

#### Packet 2 — Down family (already drafted in `red-followup-down-family-2026-05.md`)

**What it asks:** Canonicalize down-double-down + double-over-down + the 10 down-family variants? Or keep deferred?

**Why it matters:** 10 trick rows currently stuck in `is_active=0` external residue. One ruling unblocks all 10.

**Pending tricks unlocked:** 10.

#### Packet 3 — Quantum + Fairy + Pixie + Stepping set-modifier framework

**What it asks:** Are Quantum, Fairy, Pixie, Stepping a unified family of set modifiers each at +1, OR does each have semantic specifics that differentiate ADD?

**Why it matters:** Confirms or refines the set-modifier ADD framework (currently treated as +1 each in slice 3A's component view). Resolves NAMING + EQUIVALENCE pendings around quantum.

**Pending tricks unlocked:** Quantum-family + Fairy-family pendings (~6).

#### Packet 4 — Folk-name promotion policy (Flail / Omelette / Royale / Ripstein / Merkon / Terrage / Barrage)

**What it asks:** For folk single-token names with established structural decompositions, do we canonicalize (a) the folk name (e.g., "Flail" as a slug; structural reading as alias) or (b) the structural reading (e.g., "Symposium Illusion" as slug; "Flail" as folk alias)?

**Why it matters:** Resolves 7+ pendings in one ruling. Sets the policy for all future folk-name additions from footbagmoves.

**Pending tricks unlocked:** 7+ NEW_TRICK pendings.

#### Packet 5 — Double-X composition (double-fairy / double-blender / double-spinning-osis / DATW)

**What it asks:** Is "double-X" a canonical modifier (e.g., doubles the rotation count or doubles the dex count)? If yes, what's its ADD contribution? If no, is each "Double X" a separately-named canonical?

**Why it matters:** Resolves CONSTRUCTION pendings. Sets the framework for compositional collapse vs explicit naming.

**Pending tricks unlocked:** 3-5 CONSTRUCTION pendings.

#### Packet 6 — Blurry-transitive expansion (pt12 follow-through)

**What it asks:** Confirm/reject the proposed decompositions: Blurry Whirl = Stepping Paradox Whirl; Blurry Torque = Stepping Paradox Torque; Food Processor = ??? (open).

**Why it matters:** Closes the pt11 blurry +1 transition. Food Processor is the long-standing ADD-conflict outlier.

**Pending tricks unlocked:** 3 Blurry-X compounds + 1 Food Processor.

### D.3 Packet structure (recommended template)

Each Red packet uses a consistent shape:

```
1. Cluster name and scope (one sentence)
2. Why it matters now (what infrastructure unlocks)
3. The pending tricks affected (specific count + slug list)
4. Proposed canonical decompositions per affected trick (parser-computed where possible)
5. ADD math verification per proposed decomposition
6. The specific question(s) Red needs to answer (1-3 max)
7. What changes downstream upon each answer
```

Pre-computation reduces Red's cognitive load: Red confirms/refines, doesn't decide-from-scratch.

### D.4 Packets that should NOT be sent

- **Single-trick questions** — these belong in a cluster or get resolved via the inference rules of Section E. Sending isolated trick questions is the pt1–pt12 pattern; that pattern has saturated.
- **Editorial-only questions** ("which name is cooler?") — these are curator decisions, not adjudications.
- **Notation-style preferences** — handled by the operational-notation style guide; not Red's call.

---

## SECTION E — WHAT CAN NOW BE SOLVED WITHOUT RED

### E.1 Safe automation (no Red needed)

Categories where the symbolic-grammar layer + modifier-operator framework + side-flag defaults + 8-layer representation model are now stable enough that the system can derive answers with high confidence:

1. **Alias-promotion of footbagmoves rows whose structural reading already exists in canonical** — e.g., "Stepping Op Butterfly" → alias of Ripwalk. Confidence: high. Pipeline: parser + alias-table insertion.
2. **Folk-name → structural-reading alias** when both name and structure are documented and Red has confirmed the operator family — e.g., Mobius ↔ Spinning Torque (Red has confirmed spinning, torque, and the decomposition rule).
3. **Side-flag default application** — e.g., "Toe Mirage" → "Toe op Mirage". Mechanical.
4. **Direction-pair sibling identification** — e.g., orbit is the out-direction sibling of ATW. Mechanical.
5. **Topology + component group memberships** — fully computed; already shipped per Phase 5.
6. **Equivalence-cluster identification** for tricks sharing a base + dex-class + side combination. Already in `symbolic_equivalence_clusters.csv`.

### E.2 Medium-confidence inference (auto-propose; curator confirms before commit)

1. **ADD-formula derivation** vs canonical-ADD-asserted reconciliation. Per Section G policy: emit a review row; don't silently override.
2. **Compound decomposition for new footbagmoves rows** where modifier-table contains all the constituent operators. Auto-propose; curator confirms.
3. **Modifier-link inference** from a trick name (e.g., "Spinning Whirl" → `freestyle_trick_modifier_links` row {trick:spinning-whirl, modifier:spinning}). Auto-propose; curator confirms; the existing modifier_link infrastructure handles it.
4. **Sibling-pair detection** — direction-flipped pairs, side-flipped pairs. Auto-propose; curator confirms.
5. **Topology-group expansion** beyond the current 6 pedagogical groups, IF a new high-confidence group is proposed with a deterministic membership rule. Curator approval required per the 5-view ceiling.

### E.3 Still requires expert confirmation

1. **Naming policy decisions** — should the folk name or the structural reading be canonical? Curator/Red call; not derivable.
2. **Multi-modifier ordering conventions** — does "Spinning Paradox Whirl" differ from "Paradox Spinning Whirl"? Cultural call.
3. **Folk-name promotion to canonical** — new community names entering the canonical set. Editorial.
4. **Multi-set composition** (Double-X family). Genuine semantic ambiguity.
5. **Symp / symple / muted distinction** — three operators or one? Editorial.
6. **Cultural canonicity of obscure terms** — when a footbagmoves row uses vocabulary the community doesn't currently use. Red call.

### E.4 The automation gate

For all medium-confidence inference, the operational pattern is:

```
parser/inference → review row in *_review.csv → curator scans → applied to canonical
```

Never `parser → applied to canonical`. The intermediate review row is non-negotiable. This is the same pattern as the ADD-conflict policy in Section G.

---

## SECTION F — STRATEGIC ROADMAP

### F.1 The highest-leverage next steps

Synthesizing across all sections; ROI-ranked:

| Rank | Item | Effort | Unlocks |
|---|---|---|---|
| 1 | Run the retire-pending curator pass (Section A.5) | ~0.5 dev-day | Drops pending Red queue from 18 → ~4 |
| 2 | Operational-notation coverage audit (per `SEMANTIC_NAVIGATION_STRATEGIC_REVIEW.md`) | ~1 dev-day | Curator triage list for the 90% gap |
| 3 | Footbagmoves classification triage CSV (Section C.3) | ~1 dev-day | ~330 alias additions + ~20 canonical-likely shortlist + ~30 Red packet |
| 4 | ADD-discrepancy review queue (Section G) | ~1 dev-day | Every trick has documented status: agreement / pending / escalated |
| 5 | Cluster packet 1 (symp/symple/muted) to Red | curator-side | Unlocks 8 pending compounds |
| 6 | Cluster packet 4 (folk-name promotion policy) to Red | curator-side | Unlocks 7 NEW_TRICK pendings + sets future policy |
| 7 | Token-level glossary linking on operational tokens (per prior review) | ~1 dev-day | Notation becomes self-explaining |
| 8 | Trim topology view to 4 → optionally 6 with better groups (per prior review) | ~0.5 dev-day | Removes redundant groups |
| 9 | Symbolic-coverage dashboard (curator-internal) | ~2 dev-days | Visibility into the 42% / 10% gaps |
| 10 | Operational-notation linter (curator-side) | ~2 dev-days | Enforces style guide; spots inconsistencies |

### F.2 Items 1, 3, 4 are the most leverage-per-day-spent

- **Item 1** (retire pending) requires no code; just curator audit. Reduces Red queue dramatically before sending new packets.
- **Item 3** (footbagmoves triage) is the single biggest expansion opportunity. ~330 additions to the alias surface + ~20 canonical promotions. One classifier script + a curator-review session.
- **Item 4** (ADD-discrepancy review queue) operationalizes Section G's policy. Required before any computed-ADD enforcement.

### F.3 Items deliberately deferred

- **Topology view expansion** beyond the curated 6 pedagogical groups. Per the strategic review: 5-view ceiling holds.
- **Archetype browse.** Stays in glossary §9 as a concept.
- **DB schema migration.** Zero-DB-writes invariant still preserved per `project_symbolic_ux_rollout.md`.
- **Parser rewrites.** The parser/editorial separation is load-bearing.
- **Cross-track media work.** Curator-led; gallery-Dave-track in effect.

### F.4 Architectural commitments preserved across the roadmap

1. **Ontology preservation** — canonical structure (family / ADD / modifier table) untouched by automation. All inferences land as proposed review rows.
2. **Symbolic relationships separate** — observational layer carries badges + footers; never overrides canonical.
3. **Educational layer separate** — glossary V5 is curator-led content authoring; not auto-imported.
4. **Parser/editorial internals separate** — the tokenizer is in code; the style guide is in docs; neither leaks into glossary prose.

### F.5 Symbolic browse UX direction

The five-view dictionary architecture (per the prior strategic review) is the right ceiling for *navigational* exposure. Future symbolic-browse work should:

- **Densify existing views** (more topology pedagogical groups; more component-axis modifiers as they earn membership)
- **Add reverse-discovery affordances** (already shipped for trick-detail per UX-SHIP-1 Phase 5; should expand to glossary terms + family pages)
- **Surface equivalence clusters** as a panel on trick-detail pages (the next natural extension)
- **NOT add a sixth browse view**

### F.6 Glossary integration

GLOSSARY-V5-SYNTHESIS is the content roadmap. Implementation is curator-led; this review doesn't add to it. The intersection: as the V5 §6 modifier-operator framework ships, **link each operator entry to its component-view group + its modifier-family page** (the cross-link contract from `GLOSSARY_BOUNDARY_STRATEGY.md`).

### F.7 Dictionary scaling

The dictionary scales by canonical additions (Section C) + alias additions (Section C) + notation coverage (Section B). The card-uniformity contract means scaling is structurally free: a new trick row + a card render automatically.

**The hard part isn't the technology; it's the curation.** Every canonical addition is an editorial decision. Every alias is a linguistic choice. The infrastructure can scale to thousands of tricks; the curation budget is the actual bottleneck.

### F.8 Parser safety boundaries

The parser produces:
- `structural_parse_json` — the tokenized structural decomposition
- `computed_adds` — the ADD-formula derivation
- `add_formula_status` — agreement/disagreement classification

These are **diagnostic output**, never authoritative. The parser informs review; never decides. This boundary is documented in `feedback_parser_editorial_separation.md` and must hold across all future automation.

---

## SECTION G — ADD DERIVATION POLICY (the user's working policy + operational details)

### G.1 The working policy as proposed

> Symbolic decomposition should calculate the ADD count.
> If historical/source ADD disagrees with calculated ADD, flag as ADD_CONFLICT.
> Do not silently override without review.
> Ask Red whether the discrepancy reflects:
>   1. wrong symbolic decomposition,
>   2. wrong historical ADD count,
>   3. missing modifier/operator in our notation,
>   4. naming-only convention,
>   5. special-case exception,
>   6. accepted freestyle tradition despite inconsistent math.

**This policy is correct. Adopt it.**

### G.2 Operational refinement — three-class conflict policy

```
Class A — auto-resolvable
  Discrepancy < 1 ADD (e.g., ADD-asserted is a fraction or null while formula computes integer)
  Discrepancy where the formula's edge-case is documented as known
  Auto-flag in computed_add_formula; no curator action required
  Status: 'computed_lower_confidence' / 'computed_higher_confidence' / 'agreement'

Class B — curator review queue
  Discrepancy = 1 ADD where the formula is otherwise stable
  Pattern matches a known historical-inconsistency motif (Blurry pre-pt11)
  Modifier-table refinement may resolve
  Curator categorizes into one of the six buckets the user listed
  Status: 'pending_review' until categorized

Class C — pt-ruling escalation
  Discrepancy > 1 ADD or pattern is ambiguous
  Multiple plausible decompositions
  Cultural / naming-only convention question
  Status: 'escalated_pt_packet'; included in next Red cluster packet
```

### G.3 The review-row pattern

A new `legacy_data/inputs/curated/tricks/add_discrepancy_review.csv` (or equivalent) carries:

```
trick_slug, canonical_add, computed_add, decomposition,
discrepancy_class (A/B/C), curator_category (1-6),
proposed_resolution, status, notes
```

The script populates this CSV deterministically from `freestyle_tricks` rows. The curator reviews. Resolution updates either the canonical or the decomposition, with the curator's `category` recorded for future-pattern learning.

### G.4 When the policy applies symmetrically

The policy applies in **both directions**:

- **canonical ADD asserted, formula disagrees** → review row (standard case)
- **formula ADD computed, canonical ADD unknown** → propose canonical ADD via formula; review row; curator confirms

This handles new footbagmoves additions cleanly: the parser proposes the ADD; curator reviews; the asserted value lands only after review.

### G.5 The exception: locked ADD values

Some tricks have ADD_LOCK rulings (per the topic-type histogram in §A.1; 6 such). Those rows should be **policy-immune** — the curator has decided the asserted ADD is authoritative regardless of formula. The discrepancy log records the lock as a known exception.

### G.6 Long-term

Once Class A + B are well-instrumented and Class C is the residual cluster, the ADD-derivation question stops being curator-load and becomes background bookkeeping. New tricks land via the formula by default; conflicts are rare and structured.

### G.7 The principle

> *Every trick eventually has a documented status: in agreement, in pending review, or escalated to a pt-ruling. No silent disagreements.*

That principle, combined with the four-layer separation (canonical / symbolic / educational / parser), is the architectural through-line.

---

## H. STRATEGIC SUMMARY (CONCISE)

| Action | Type | When |
|---|---|---|
| Retire-pending curator pass | Curator (1 hour) | Immediate; cuts pending Red queue by ~10 |
| footbagmoves classifier triage | Tooling + curator | Highest-leverage expansion (next slot) |
| ADD-discrepancy review queue | Tooling | Operationalize the proposed policy |
| Cluster Red packet 1 (symp/symple/muted) | Curator | When Red is ready |
| Cluster Red packet 4 (folk-name promotion policy) | Curator | When Red is ready |
| Token-level glossary linking on notation | Code | Small, ships as a unit with the trim-topology change |
| Trim topology view to 4 (or 4→6 with better groups) | Code | Pairs with #6 |

**Do NOT:**
- Add a sixth dictionary browse view
- Promote archetypes to browse
- Bulk-import footbagmoves rows without triage
- Override canonical ADD from formula without review
- Send single-trick Red questions (cluster them)

---

## I. WHAT THIS REVIEW EXPLICITLY DOES NOT DO

- **Does not specify implementation** for any of the recommended scripts (ADD-discrepancy script, footbagmoves classifier, retire-pending audit). Each is a small follow-up.
- **Does not commit to the cluster packets** in Section D. Each packet's specific question content is curator-authored.
- **Does not propose schema changes.** All recommendations stay within the existing data layout + existing service shapes.
- **Does not propose new browse views or surfaces.** The 5-view ceiling holds.
- **Does not propose canonical ADD or modifier-rule changes.** Every change goes through review.

---

## J. CONSTRAINTS HONOURED

- No ontology flattened into symbolic notation
- No parser-valid structure treated as automatically canonical
- No parser/editorial internals exposed as glossary content
- Four-layer separation preserved throughout
- Every recommendation respects the architectural principle of "every disagreement becomes a review row, never a silent override"
- The prior strategic review's conclusions (5-view ceiling; archetypes-in-glossary-not-browse; trim redundant topology groups; token-level glossary linking is next) are carried forward and refined, not contradicted

---

*End of ONTOLOGY_SYMBOLIC_STRATEGIC_REVIEW.md*
