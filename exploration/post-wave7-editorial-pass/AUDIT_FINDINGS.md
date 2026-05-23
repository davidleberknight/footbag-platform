# Post-Wave-7 Editorial Consistency Pass — Audit Findings

**Date:** 2026-05-23
**Slice posture:** Report-first; tabular findings; approval-by-path before any edits.
**Scope:** Editorial / pedagogy / ontology-surface coherence — NOT parser,
doctrine, or mass-promotion work.

The ontology architecture (Waves 3–7) has outpaced the editorial layer.
This document is the readout from a 3-agent parallel audit covering core
atoms (A), glossary-vs-dictionary drift (B), modifier-intuition coverage
(C), tutorial attribution (D), and Observed Tricks UX (E). Part F is a
content-enrichment roadmap derived from project memory and the audit
findings.

---

## PART A — Foundational Atom Consistency

### A.1 Core atom registry (canonical source)

`src/content/freestyleCoreAtomEducational.ts:62-159` — **12 atoms,
curator-locked 2026-05-22:**

| Atom | ADD | Atom | ADD |
|------|-----|------|-----|
| toe-stall | 1 | mirage | 2 |
| clipper-stall | 2 | pickup | 2 |
| around-the-world | 2 | illusion | 2 |
| orbit | 2 | butterfly | 3 |
| legover | 2 | osis | 3 |
|  |  | whirl | 3 |
|  |  | swirl | 3 |

### A.2 Trick-detail rendering chain

`src/views/freestyle/trick-shell.hbs` — partials all gated at the
**service layer** by null-checks on pre-shaped fields, NOT by category
branching in templates. Implication: atoms can render compound-shaped
sections only if the service hands them shaped data.

Relevant partials:
- `trick-add-analysis.hbs` — gated on `content.addAnalysis`
- `trick-equivalence-topology.hbs` — gated on `content.equivalenceTopology`
- `trick-scoring-notes.hbs` — gated on `content.scoringNote`

### A.3 Leakage onto core atoms

**One concentrated leakage source identified.** Pre-Wave-7 audit prediction
of widespread atom contamination was wrong — the actual surface is small,
specific, and contained in a single file.

| atom | file:line | leak | severity |
|------|-----------|------|----------|
| whirl | `freestyleDerivationPilot.ts:316` | `'rev-whirl (reverse direction; ADD 4)'` — factually wrong (canonical ADD 3) | HIGH |
| whirl | `freestyleDerivationPilot.ts:324` | `right: '(foundational atom — not further compressible)'` — placeholder-style equivalence row asserts non-decomposability using decomposition framing | MEDIUM |
| whirl | `freestyleDerivationPilot.ts:330` | `'The branch lineage flows: whirl → torque (gyro family root) → blender, mobius, drifter.'` | **NOT A LEAK** — correct branch prose, no false ADD claim |

Other atoms (`butterfly`, `mirage`, `osis`, `clipper-stall`, `toe-stall`,
`pickup`, `illusion`, `around-the-world`, `orbit`, `legover`, `swirl`) —
clean. No equivalence-chain leakage; no fake decompositions; no REV+1
implications.

### A.4 Whirl specifics

The user's three flagged issues map cleanly to the audit:

1. **REV +1 implication** — surfaces ONLY as the wrong ADD literal at
   line 316 (`ADD 4`). The string conflicts with the resolved formula
   at `freestyleResolvedFormulas.ts:277` (`reverse(+0) + whirl(3) = 3
   ADD`). No deeper REV+1 leakage found elsewhere.
2. **Torque branch lineage** — wording is structurally correct; not a
   leak. Whirl branches into torque via gyro composition; this prose
   states a topological fact, not a decomposition.
3. **"Foundational atom — not further compressible"** — line 324, the
   placeholder equivalence row. Awkward; uses decomposition-frame
   language to assert non-decomposability. Two fixes available:
   - **Suppress the row entirely** for core atoms (gate at service or
     content level).
   - **Rephrase** the right-hand side to non-decomposition framing
     (e.g., just leave the equivalence section blank for atoms).

### A.5 Publication rule (proposed)

Core atoms may render:
- topology / branch context (whirl → torque; mirage / illusion siblings)
- operational notation (CLIP > OP IN [DEX] > …)
- canonical formula (xbody + dex + stall = 3 ADD)
- family card with terminal mechanic prose

Core atoms should NOT render:
- equivalence-chain decomposition (atoms ARE the floor; no shallower
  reading)
- "≡ X" rows on themselves
- ADD-analysis numeric add-up sections that imply the atom is itself
  composed
- placeholder rows asserting non-decomposability using decomposition
  framing

The publication rule is a service-layer responsibility — atom slugs
should receive the `category: 'atom'` (or equivalent) treatment that
suppresses compound-shaped partials at shaping time. The current
all-rendering-is-null-gated pattern already supports this with no
template churn.

---

## PART B — Glossary / Dictionary Drift Audit

### B.1 Headline finding

**Drift is much less than expected.** The glossary's atom and modifier
tables (`src/views/freestyle/glossary.hbs:755-794`) match canonical
dictionary values across the board. Worked examples
(`src/content/freestyleGlossaryAddExamples.ts`) for `blur`, `mobius`,
`quantum`, `baroque` either match or carry explicit doctrine notes
acknowledging policy-dependent readings.

### B.2 Inventoried formulas

Atom table — all 12 atoms render their canonical ADD value (no
mismatch). Modifier table — all primary modifiers (`paradox +1`,
`atomic +1/+2`, `nuclear +2`, etc.) render canonical weights.

Worked examples:

| trick | glossary formula | canonical | status |
|-------|------------------|-----------|--------|
| blur | `stepping(+1) + paradox(+1) + mirage(2) = 4` | match | clean |
| baroque | `barraging(+2) + osis(3) = 5` | match | clean |
| mobius | `gyro(+2 rot) + torque(4) = 6 [naïve]` | noted policy-dependent (official 5) | acceptable (drift acknowledged) |
| quantum | `[DEX] + [DEL] + topology = 3` | `compressed atomic = 3` | acceptable (different formulation, same value) |

### B.3 Stale doctrine-era prose audit

Single confirmed stale phrase: `freestyleDerivationPilot.ts:324`
"foundational atom — not further compressible" — overlaps Part A.3
finding. No widespread REV+1, no widespread "not further compressible"
leakage in glossary proper.

### B.4 Conclusion

Glossary drift is essentially absent at the formula level. The
editorial issue is not drift — it is **intuition gap** (Part C below).

---

## PART C — Movement Intuition Enrichment

This is the largest editorial gap and the most important pedagogy
upgrade. The infrastructure for embodied prose exists; coverage is
spotty and sometimes inverted (some surfaces carry intuition, others
serving the same modifiers stay formula-only).

### C.1 Where intuition IS currently present

| surface | coverage | quality |
|---------|----------|---------|
| Modifier feel cards (Glossary §6 + Operators page) | All 13 cards (9 set + 4 body) | Good — `feel` + `intuition` fields both authored |
| Movement-System view composition glosses | 5 of 7 set/uptime modifiers | Good where present; fairy + surging missing entries |
| Dedicated modifier pages (`/freestyle/modifier/:slug`) | Only 3 of 13+ modifiers — spinning, paradox, ducking | Excellent — full 6-section teaching structure |
| `freestyleService.ts` SET/BODY_MODIFIER_FEEL_CARDS | All 13 modifiers | Curated `feel` + `intuition` fields |

### C.2 Where intuition is ABSENT

| surface | issue |
|---------|-------|
| Operator-board `oneLineMeaning` (Glossary §3) | Uniformly structural/operational; even modifiers with embodied prose elsewhere lose it here |
| Family card intros (Glossary §5) | All 12 family cards (6 root + 6 branch) render formula + topology only; zero embodied movement prose |
| Symbolic equivalence chains | Pure notation; no embodied prose |
| 10 of 13+ modifiers | No dedicated `/freestyle/modifier/:slug` page (gyro, weaving, diving, zulu, whirling, tapping, inspinning, atomic, quantum, nuclear, barraging, furious, blurry, pixie, fairy, stepping, surging, symposium) — only 3 authored |
| Composition glosses | `fairy` and `surging` missing entries in `MODIFIER_COMPOSITION_GLOSSES` |

### C.3 Per-modifier intuition gap

Selected modifiers with the user's example intuition prose, mapped to
current coverage:

| modifier | user's example intuition | current modifier-feel-card | current operator oneLineMeaning | modifier page exists? |
|----------|--------------------------|----------------------------|----------------------------------|----------------------|
| pixie | "uptime ATW-like motion" | "tight, compressed uptime dexes" — present | (not in operator ref) | NO |
| fairy | "uptime orbit-like motion" | "alternate uptime path; illusion-style mechanics" — present | (not in operator ref) | NO |
| atomic | "cross-body pickup-like launch" | "launches with cross-body, X-dex-like character" — present | "cross-body uptime set with x-dex character" — partial | NO |
| quantum | "compressed atomic feel" | "compressed-atomic feel; quicker, similar cross-body" — present | "compressed-atomic set" — partial | NO |
| blurry | "stepping momentum + paradox body position" | "combines stepping momentum with paradox-style body positioning" — present | "stepping treatment with paradox-style second dex" — partial | NO |
| nuclear | (user not specified) | "stacks paradox-and-atomic into heavy launch character" — present | "paradox's hip pivot with atomic's cross-body character" — present | NO |
| barraging | (user not specified) | "two same-direction dexes on a single set" — formula-only | "high-stepping treatment with two in-direction dexes" — partial | NO |
| furious | (user not specified) | "extends the uptime with rotational character" — partial | "an extended set form" — formula-only | NO |

### C.4 Structural observation

The modifier-feel-card data shape is **already richer than what most
surfaces render**. Operator-board entries could pull from feel-card
prose; family-card intros could pull from terminal-mechanic prose; the
infrastructure is present, the wiring is what's missing.

### C.5 Recommendation surface map

Three intuition-upgrade levels, increasing in scope:

1. **L1 — Wire existing intuition.** Surface the `feel` prose from the
   modifier-feel cards on the operator board (Glossary §3) where it's
   currently formula-only. No new prose authored.
2. **L2 — Author missing composition glosses.** Add `fairy` and
   `surging` entries to `MODIFIER_COMPOSITION_GLOSSES`.
3. **L3 — Author dedicated modifier pages.** Expand the 3-page set to
   cover the primary set + body modifiers (atomic, quantum, blurry,
   nuclear, pixie, fairy, stepping, symposium). High effort; high
   pedagogical payoff; matches the user's "embodied movement
   intuition" goal directly.

Family-card intros are a fourth dimension; the user did not flag them
explicitly. Embodied family-terminal-mechanic prose would parallel
the modifier-page work.

---

## PART D — Tutorial / Source Attribution

### D.1 Surface inventory

| surface | current label | source attribution? |
|---------|---------------|---------------------|
| Landing — Watch & Learn card 1 | "Tricks of the Trade" | NO author attribution |
| Landing — Watch & Learn card 2 | "Featured Tutorials" | NO source attribution (gallery_passback_tutorials) |
| Landing — Watch & Learn card 3 | "AnzTrikz" | Source-as-heading (acceptable) |
| Landing — Watch & Learn card 4 | "Shred Global" | Source-as-heading (acceptable) |
| Landing — Watch & Learn card 5 | "Footbag Finland" | Source-as-heading (acceptable) |
| Trick-detail — Reference Media (Tutorials subsection) | Per-tile `{{sourceLabel}}` | Service-shaped from `SOURCE_LABELS` map |
| Trick-detail — Reference Media (Demonstrations subsection) | Per-tile `{{sourceLabel}}` | Service-shaped from `SOURCE_LABELS` map |

### D.2 SOURCE_LABELS map (canonical attribution source)

`src/services/freestyleService.ts:500-507`:

| source_id | label | tier |
|-----------|-------|------|
| `tt_youtube` | "Tricks of the Trade" | TUTORIAL |
| `passback_records` | "Passback record" | RECORD |
| `anz_trikz` | "Anz' Trikz" | TUTORIAL |
| `footbag_finland` | "Footbag Finland" | DEMONSTRATION |
| `shred_global` | "Shred Global" | DEMONSTRATION |
| `flipsider_footbag` | "Flipsider" | DEMONSTRATION |
| `footbagspot_passback` | "FootbagSpot" | TUTORIAL |
| `footbagspot_tutorials` | "FootbagSpot Tutorials" | TUTORIAL |

### D.3 PassBack disambiguation problem

"PassBack" surfaces in three semantically distinct ways:

1. **PassBack Dictionary** — the community-curated trick reference
   book (`passback-dicrionary.txt`); source of the Wave 7 doctrine-
   divergence rows.
2. **PassBack Records** — the consecutive-completion record database
   (`source_id: passback_records`, label: "Passback record").
3. **PassbackFootbag** — the YouTube channel/company that authored
   the tutorials in `gallery_passback_tutorials` (currently labeled
   only as "Featured Tutorials").

Capitalization is inconsistent across the codebase: `'passback'` /
`'PassBack'` / `'Passback'` appear with no rule. The Wave 7
doctrine-divergence prose uses "PassBack historically lists…" —
referring to the book, not the YouTube channel. The "Featured
Tutorials" landing card links to videos almost certainly from the
channel, not the book.

### D.4 Tricks of the Trade attribution

"Tricks of the Trade" labeled at:
- Landing button text
- `SOURCE_LABELS` (`tt_youtube → 'Tricks of the Trade'`)
- `MEDIA_TAG_KNOWN_SOURCES` (`#tricks_of_the_trade`)

**Kenny Shults is NOT attributed anywhere in the codebase.** Per
project memory (`reference_worldfootbag_channel`), the WorldFootbag
YouTube channel hosts exactly 42 TT lessons (#1-#42); Kenny Shults
is the named author / instructor.

### D.5 Recommendation set

Three levels:

1. **L1 — Landing card labels (low-risk; 1 file, 5 lines).** Rewrite
   landing.hbs:49-53 button labels:
   - "Tricks of the Trade" → "Tricks of the Trade — Kenny Shults"
   - "Featured Tutorials" → "Tutorials — PassbackFootbag" (or similar)
   - "AnzTrikz" → "Tutorials — Anz' Trikz" (consistent framing)
   - etc.

2. **L2 — SOURCE_LABELS attribution (medium-risk; cascades through
   trick-detail tiles).** Update labels in
   `freestyleService.ts:500-507`:
   - `tt_youtube: 'Tricks of the Trade — Kenny Shults'`
   - `footbagspot_passback: 'PassbackFootbag'` (if applicable)
   - Adjust any per-tile rendering that assumes short labels.

3. **L3 — "PassBack" disambiguation forever-rule.** Document the
   3-way distinction (PassBack Dictionary / Records / channel) as a
   memory entry; consistently use "PassBack Dictionary" / "Passback
   record" / "PassbackFootbag" everywhere thereafter. Touches Wave 7
   doctrine-divergence prose (currently "PassBack historically lists…"
   → "the PassBack Dictionary historically lists…" or similar).

L1 is the user's stated task and is mechanically safe. L2 cascades
through every trick-detail Reference Media tile and the TT-series
view; touches more surfaces but stays within the SOURCE_LABELS
abstraction. L3 is governance-level — a memory entry and a sweep,
not a code change.

---

## PART E — Observed Tricks UX

### E.1 Current state

- Single page at `/freestyle/observational`
- Sort: alphabetical by displayName only
- Grouping: none (flat grid)
- Status chips, source badges, blocker chips all present in the data
  shape
- "Sources represented" strip lists unique sources without counts
- Tracked vocabulary section grouped by source

### E.2 Data shape — what's already available but unused

| field | current use | latent use |
|-------|-------------|------------|
| `status` | Renders as chip | Could prioritize `pending-canonicalization` above `pending-review` |
| `sourceLabel` | Renders as badge | Could group entries by source |
| `proposedAddTotal` | Renders inline | Could group by ADD tier (1, 2, 3+) |
| `unresolvedBlockers.length` | Renders blocker chip | Could surface "ready to promote" (blockers === 0) above the rest |
| `curatorNote` | Renders in detail expansion | Could indicate editorial-readiness state |

### E.3 FB.org / FootbagMoves alignment

- `'fborg'` source label exists; at least one entry uses it
- `'footbagmoves'` source label exists in the type union BUT **no
  entries currently populated with it**
- No bidirectional links to FB.org or FootbagMoves federation work
- Page reads as staging area, not dictionary

### E.4 Low-risk UX improvement candidates

| change | risk | code reference |
|--------|------|----------------|
| Source-count annotation on sources-represented strip | LOW | `collectObservedSourceBadges` already iterates; add count |
| Group-by-source view toggle (alternative to alphabetical) | LOW | `sortObservedCardsAlphabetical` already exists as a clean isolation point |
| ADD-tier grouping option (1 / 2 / 3+) | LOW | `proposedAddTotal` present in shape; group at service |
| Visual priority for `pending-canonicalization` status | LOW–MEDIUM | OBSERVED_STATUS_CHIP already maps tone; CSS only |
| "Ready for curation" sub-surface (status + zero blockers) | MEDIUM | Requires new service method or template logic |
| FootbagMoves federation acknowledgment in layerNote | LOW | Prose-only change |
| Cross-link to canonical trick when reading matches | MEDIUM-HIGH | Requires reconciliation NLP / symbolic match |

### E.5 Recommendation

The user's framing: "Observed Tricks is now a staging/canonicalization
layer, not a junk drawer." Three low-risk wins:

1. **Add ADD-tier grouping option** to make the page feel more
   dictionary-like (matches the user's "FB.org / FootbagMoves
   navigability" goal).
2. **Source-count annotations** on the sources strip — communicates
   archive density honestly.
3. **Visual priority for `pending-canonicalization` entries** —
   surfaces the editorial-readiness signal already in the data.

Higher-risk items (canonical cross-linking, "ready for curation"
sub-surface) deferred.

---

## PART F — Future Content Enrichment Roadmap

This is roadmap-only; not implementation. Goal: map the path from the
current symbolic / structural editorial layer to a future layer that
includes embodied movement prose and integrated historical/community
descriptive language.

### F.1 Available source corpora

| source | location / status | content type | potential |
|--------|-------------------|--------------|-----------|
| FB.org `/newmoves` per-trick descriptions | `legacy_data/mirror_footbag_org/` (per memory: 197-row CSV reconciled; NR-1B verbatim source for pendulum/squeeze) | English textual descriptions of trick mechanics; varies trick-by-trick | HIGH — provides per-trick descriptive prose already aligned to canonical names; cite-as-source pattern proven (pendulum/squeeze precedent) |
| FootbagMoves prose | `passback-fbm-symbolic-analysis/` + memory: F0/F1/O1a-d + W1/W2 federation complete 2026-05-10/11 | Symbolic-grammar layer + cross-sport pb-dict2.txt (42 terms) + master spreadsheet | MEDIUM — symbolic / grammatical; less embodied than FB.org; richer for relationship topology |
| PassBack Glossary (180 terms) | `passback-glossary.txt`; staged 2026-05-12 via non-destructive matcher (commit a1ecfd2); 162 new_term educational-layer candidates | English glossary-style descriptions; community-cured | HIGH — direct fit for movement-feel prose enrichment; curator-triage staged |
| Chris Holden compilation (Legacy Move Sets) | `/freestyle/sets` live; cited in `freestyleOperatorReference.ts` as lineageNote source | Decomposition-grade folk-name equivalents (Blurry=Stepping Paradox, Terraging=Double Pixie, etc.) | MEDIUM — primarily decomposition, not embodied; useful for alias resolution |
| Historical descriptive language (newsgroups, archive prose) | Not yet inventoried; would require new ingestion lane | Vintage community language; "feel" rich | LOW (near-term) — high latency to harvest cleanly |
| TT Lesson #1-#42 transcripts (WorldFootbag YouTube) | Per memory: 42 lessons inventoried via yt-dlp; transcripts not yet extracted | Kenny Shults's instructor prose — primary movement-feel source | HIGH — would directly drive Part C L3 modifier-page authoring |

### F.2 Recommended sequencing

Three lanes, ordered by ratio of editorial payoff to ingestion cost:

**Lane 1 — Curator-triage existing staged content first.** The PassBack
Glossary staging (180 terms, 162 educational-layer candidates) is
already extracted and matched against canonical tricks. Per memory:
"curator triage of 17 drafts recommended next" + "curator triage of
SG-2 outputs recommended next." This is the lowest-cost win — the
content is staged, just not adopted.

**Lane 2 — FB.org per-trick description extraction.** The mirror is
local; the NR-1B precedent (pendulum/squeeze cited verbatim) proves
the pattern. Extract per-trick description blobs from
`legacy_data/mirror_footbag_org/newmoves/<slug>/index.html`, store as
content-module data (`freestyleFborgDescriptions.ts`), surface on
trick-detail pages as a "Historical description" section gated below
the symbolic / structural sections. **No ingestion-into-canonical;
provenance-only.** Per `feedback_reversible_content_governance` —
TypeScript content module, not SQL migration.

**Lane 3 — TT Lesson transcript extraction.** Highest payoff for
modifier-page authoring (Part C L3), highest extraction cost.
yt-dlp can pull captions if available; if not, would require manual
transcription or an audio-to-text pipeline. Per memory: tt_youtube
source registered + Kenny Shults named in `reference_worldfootbag_
channel`. **Defer until lanes 1 and 2 land.**

**Lane 4 (deferred indefinitely) — Historical newsgroup / archive
prose.** High curatorial latency; community-flavored language is rich
but hard to align to canonical names without manual work.

### F.3 Architectural guidance

Independent of which lane runs first, these constraints apply:

- **Content modules, not SQL.** Per
  `feedback_reversible_content_governance` — descriptive prose is
  editorial content, not ontology data. TypeScript content modules
  with explicit source-attribution metadata. SQL formalization only
  after ontology stabilization.
- **Cite verbatim where possible.** The NR-1B precedent
  (pendulum/squeeze cited verbatim from FB.org) is the right model.
  Verbatim attribution preserves the source author's voice and side-
  steps editorial revision tax.
- **Layer below structure, not above.** Per
  `feedback_landing_vs_reference_boundary` and the architectural
  separation note (`movement_vs_scoring_semantics_2026-05-23.md`):
  embodied prose belongs on trick-detail and modifier pages, not on
  beginner-facing landings or browse cards.
- **No automated ingestion of unverified prose.** Curator triage
  pattern (per `project_passback_dictionary_intake` memory) — non-
  destructive matchers; staging reports; per-row curator review;
  forever-rule.
- **Distinguish "official IFPA description" from "source attribution
  prose."** The platform may eventually need both: IFPA's editorial
  voice on a trick, plus the cited historical descriptions. The
  current canonical_name + base_trick fields are silent on prose;
  adding a `description` or `description_segments[]` shape is a
  future schema decision deferred until corpus volume justifies it.
- **Avoid beginner-bloat.** Per the user's guardrails: this is
  trick-detail / modifier-page enrichment, NOT glossary-beginner-
  section expansion.

### F.4 Forward-pointing milestones (not commitments)

| milestone | content lane | gating dependency |
|-----------|--------------|-------------------|
| Curator triage of staged PassBack Glossary 162 candidates | Lane 1 | Curator availability |
| `freestyleFborgDescriptions.ts` content module with N seed entries (N = 10-20 first-class atoms + Tier-1 compounds) | Lane 2 | NR-1B precedent already proven |
| Trick-detail "Historical description" section partial | Lane 2 | Service shaping + partial template |
| Modifier-page authoring expansion (Part C L3) — 5 new modifier pages | Lane 3 (if TT transcripts) or hand-authored (no Lane 3) | Curator authoring time |
| Per-trick "feel" prose data shape on freestyle_tricks (deferred) | Future | Corpus volume + ontology stability |

---

## CONSOLIDATED FIX CANDIDATES (for approval-by-path)

The audit's findings produce eight candidate fixes, each scoped to a
specific path or path-set. The user approves which land in this slice
and which defer.

| # | scope | file(s) | risk | effort | what it does |
|---|-------|---------|------|--------|--------------|
| F1 | A.3 + A.4 — whirl page corrections | `src/content/freestyleDerivationPilot.ts` (lines 316, 324) | LOW | ~5 min | Fix `ADD 4` → `ADD 3` for rev-whirl; suppress or rephrase the "not further compressible" equivalence row |
| F2 | A.5 — core-atom publication rule | service-layer (TBD), no template churn | MEDIUM | ~30-60 min | Service-level suppression of equivalence-chain / numeric add-up partials for atom slugs; gate via category or core-atom-set membership |
| F3 | C L1 — surface existing modifier-feel prose on operator board | `freestyleOperatorReference.ts` + service wiring | LOW-MEDIUM | ~30 min | Pull `feel` prose from modifier-feel cards into operator-board `oneLineMeaning` (or add a parallel field) so Glossary §3 carries embodied prose |
| F4 | C L2 — author missing composition glosses | `freestyleMovementSystems.ts` — add fairy + surging entries | LOW | ~10 min | Two prose entries in MODIFIER_COMPOSITION_GLOSSES |
| F5 | D L1 — landing card source labels | `src/views/freestyle/landing.hbs:49-53` | LOW | ~5 min | "Tricks of the Trade — Kenny Shults"; "Tutorials — PassbackFootbag"; etc. |
| F6 | D L2 — SOURCE_LABELS attribution refresh | `freestyleService.ts:500-507` | MEDIUM (cascades through trick-detail tiles + tests) | ~20 min | Update map; verify rendering on trick-detail; update tests asserting label strings |
| F7 | E.5 — Observed Tricks UX low-risk wins | `freestyleService.ts` + `observational.hbs` | LOW-MEDIUM | ~45-60 min | ADD-tier grouping + source-count annotations + visual priority for pending-canonicalization |
| F8 | C L3 — author 5 dedicated modifier pages | `symbolicModifierEducation.ts` (new entries) | LOW (additive content) — but HIGH effort | ~4-6 hours | New `MODIFIER_PAGE_CONTENT` entries for atomic, quantum, blurry, nuclear, pixie/fairy/stepping/symposium — partial-set |

### Recommendation cluster

If the user wants a tight in-slice landing, **F1 + F4 + F5** are the
cleanest cluster: low risk, low effort, three independent files, all
fix concrete user-flagged items. F2 is the structural fix that
prevents future leakage (medium-effort but architecturally valuable).
F3 + F7 are the highest-payoff editorial upgrades. F6 + F8 are larger
follow-ons.

**Suggested sequencing if multi-step:**

1. **F1** first (whirl page corrections — fixes the only confirmed leak)
2. **F4 + F5** (composition glosses + landing labels — clean,
   independent, mechanically safe)
3. **F2** (core-atom service rule — prevents recurrence; the right
   structural fix)
4. **F3** (intuition wiring on operator board — high editorial value)
5. **F7** (observational UX — separate visual surface)
6. **F6** (SOURCE_LABELS — touches more surfaces; needs careful test
   verification)
7. **F8** (modifier page authoring — separate authoring slice, not
   bundled with editorial fixes)

Part F (roadmap) is informational; no action this slice.

---

## NEXT STEP

Awaiting per-fix approval. Each item is path-scoped; the user can
green-light any subset (e.g., "F1 + F4 + F5 yes; F2 + F3 next slice;
F6 + F7 + F8 defer").

— end —
