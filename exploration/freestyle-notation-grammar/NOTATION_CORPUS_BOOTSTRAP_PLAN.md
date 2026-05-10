# Notation Corpus Bootstrap Plan (Planning)

Proposal-only. No notation population yet, no parser changes, no Red ingestion, no DB writes. This document plans the strategy; execution is approval-gated per tier.

Builds on:
- `PROPOSAL.md` (Jobs notation grammar definition)
- `PHASE_2_5_REFINEMENTS.md` (parser status vocabulary)
- `SEMANTIC_AUDIT_FINDINGS.md` (the surface that consumes notation)
- `PHASE5_STATUS_SHAPE_CONSULTS.md` (architectural separation between parser-derived and editorial decompositions)
- `PHASE5E_EDITORIAL_DATA_CLEANUP_PLAN.md` (Tier A + B2 just-landed; editorial layer is now clean enough to use as a QA anchor)

---

## 1. Current state and goal

**Current state (post-Phase-5e Tier A + B2, commit 46b5f0e):**

- 146 active tricks in the dictionary.
- **0 of 146 have `notation` populated.** Earlier "50/86 active" figure (memory) was pre-clipper-migration; current rebuilds initialize `notation` to NULL via scripts 17/19.
- 0 of 146 have `jobs_notation_raw` populated either. The Phase-0 schema columns exist; nothing fills them.
- The parser tokenizes `canonical_name` to produce structural decomposition. It runs WITHOUT a notation source. Notation is currently a display-only field; not a parser input.
- Editorial decomposition layer (Phase 5a) now resolves cleanly for ~60 tricks (post-5e). Audit-picklist editorial state is the cleanest it's been.

**Public UX symptom:** trick-detail and dictionary-index views show "Notation Pending" for every active trick. The diagnostic-grammar panel only renders Jobs notation when present (Phase 4 moved it behind the Diagnostic-details disclosure — even more invisible by default).

**Goal:** populate Jobs notation systematically across the highest-value subset of the dictionary before any FootbagMoves ingestion. Treat the bootstrap as a curation discipline, not a code project. Use the now-clean editorial decomposition layer as a per-row QA anchor.

**Note on field disambiguation:** the dictionary has TWO notation-shaped columns:
- `freestyle_tricks.notation` — public-facing display string (curator-authored prose-form notation; surfaced on dictionary index and trick-detail).
- `freestyle_tricks.jobs_notation_raw` + `jobs_notation_normalized` — Phase-0 structured Jobs grammar columns (parser input candidates per PROPOSAL §2 architecture, currently unused by parser).

This bootstrap targets BOTH coherently. For Tier 1, the same authored Jobs-grammar string lands in both columns (raw verbatim, normalized lowercased) so public surface and parser input stay aligned. Splitting the two channels is deferred until a real divergence requires it.

---

## 2. Corpus prioritization — categories

The dictionary has 146 active rows. Bootstrapping all 146 in one pass is unwise (no QC bandwidth); doing them in unprioritized order squanders the educational opportunity. The categories below feed tiering decisions in §3.

### 2.1 Foundational educational tricks (anchor of Tier 1)

The set every learner sees first; the "if these are wrong, the dictionary is wrong" rows.

- **Surface delays (10):** toe-stall, heel-stall, inside-stall, outside-stall, knee-stall, head-stall, neck-stall, forehead-stall, shoulder-stall, sole-stall.
- **Pure base tricks (12):** whirl, butterfly, mirage, osis, illusion, legover, pickup, clipper (kick form), blender, drifter, swirl, torque.
- **Body primitives (8):** spin, double-spin, hop-over, walk-over, flying-inside, flying-outside, spyro, around-the-world.

Total: ~30 rows. Notation here MUST be pedagogically pristine — every later tier inherits these as building blocks.

### 2.2 Parser-demonstration tricks (Tier 1 + 2 sample)

The audit picklist's 27 tricks are already the curated set for parser exercise. Notation on these tricks immediately improves the diagnostic surface AND the audit's signal value.

Picklist members: head-stall, knee-clipper, cross-body-sole-stall, cloud-kick, double-leg-over, atom-smasher, food-processor, surging, dada-curve, around-the-world, rev-up, whirl, butterfly, paradox-whirl, spinning-whirl, spinning-symposium-whirl, mobius, gauntlet, blur, ripwalk, barfly, blurriest, sumo, sailing, barraging-osis, quantum, shooting.

### 2.3 Structurally rich compounds (Tier 2 anchor)

Multi-modifier rotational compounds where Jobs notation reveals the layered structure most clearly:

- **Whirl family modifier ladder:** paradox-whirl, spinning-whirl, symposium-whirl, ducking-whirl, stepping-whirl, tapping-whirl, blurry-whirl, paradox-symposium-whirl, spinning-symposium-whirl, paradox-spinning-mirage.
- **Torque family:** paradox-torque, spinning-torque, atomic-torque, blurry-torque, mobius (gyro-torque).
- **Multi-modifier named compounds:** gauntlet (stepping+ducking+paradox+torque), tomahawk (ducking+paradox+whirl), surge (surging-paradox-mirage), surreal (surging-paradox-whirl), surgery (surging-symposium-rev-whirl), venom (surging-barfly), witchdoctor (atomic+symposium+mirage), fury (furious+paradox+mirage).

Notation on these tricks lets the parser exercise its most complex paths and lets readers learn modifier composition.

### 2.4 Canonical family anchors (Tier 1 + 2 cross-cut)

Anchor each major family with notation so per-row notation can be derived/cross-checked against the family root:

- mirage (anchors mirage family + double-leg-over via miraging modifier)
- whirl (anchors whirl family + huge modifier ladder)
- butterfly (anchors butterfly family)
- osis (anchors osis family + barraging-osis approximate case)
- illusion (anchors illusion family + flail/eggbeater)
- legover (anchors legover family + DLO + magellan)
- torque (anchors torque family + mobius + atomic-torque)
- barfly (anchors infinity-derived family — even with broken upstream, the row needs notation)
- clipper-stall (anchors stall family + drifter + ducking-clipper et al.)

### 2.5 Tricks with clean editorial decomposition (Tier 2 high-leverage)

Phase 5e Tier A + B2 just landed editorial-layer cleanup. The 33 rows newly populated with modifier_links + clean composedAdds are the **highest-leverage Tier-2 candidates** — their editorial state already validates structural decomposition, so notation that matches the editorial composition can be QC'd automatically:

atomic-butterfly, atomic-torque, blur, blurriest, blurry-torque, blurry-whirl, dimwalk, ducking-butterfly, ducking-clipper, ducking-osis, ducking-whirl, food-processor, mobius, paradox-blender, paradox-drifter, paradox-mirage, paradox-symposium-whirl, paradox-torque, paradox-whirl, ripwalk, smear, spinning-butterfly, spinning-clipper, spinning-osis, spinning-symposium-whirl, spinning-torque, spinning-whirl, stepping-osis, stepping-whirl, superfly, symposium-whirl, tapping-whirl, tomahawk.

Plus barraging-osis (Tier B2 known divergence — notation should still land; divergence is asserted truth).

### 2.6 Historically important tricks (Tier 1 mix-in)

Tricks Red has emphasized in pt1–pt9 corrections OR that anchor competition results history:

- atom-smasher (X-Dex anchor; pt1 + ongoing)
- fury (Red pt6 corrected from 4 to 5 ADD)
- sumo (Nuclear Mirage; pt9 X-Dex)
- sailing (pt9 Pixie Quantum)
- gauntlet (Red pt6, alpine family)
- nemesis (Red pt8 furious-barfly)
- smoke, plasma, grave-digger, jani-walker (Red pt8 batch)
- bigwalk, surge, surreal, surgery, venom (Red pt2 surging family)
- merkon, terrage, barrage (Red pt5)

These rows have been touched recently by Red rulings; notation should reflect those rulings precisely.

### 2.7 Tricks already stabilized by Red rulings (Tier 1 anchor)

Subset of 2.6 with full pt-batch ratification:

| Slug | Status anchor |
|---|---|
| sumo | pt9 mechanism + 5 ADD locked |
| sailing | pt9 Pixie Quantum equivalence |
| backside (modifier) | pt9 +1 body modifier |
| shooting | pt7 + pt9 set with +3 |
| terraging | pt8 +3 body modifier |
| fury | pt6 5 ADD |
| atom-smasher | pt1+pt4 4 ADD locked, X-Dex |

These are notation-bootstrap-safe anchors — no pending ambiguity.

### 2.8 Categories explicitly OUT of scope for the bootstrap

- **Modifier rows themselves** (`category='modifier'`). They aren't tricks; they're decomposition components. Notation doesn't apply.
- **Pending rows** (`is_active=0`). Surface as "Notation Pending" remains correct until they're activated; bootstrapping notation for pending rows wastes effort on rows that may never go active.
- **Pure-alias rows.** Aliases live in `freestyle_trick_aliases`, not as their own dictionary rows; no notation needed.
- **Glossary terms.** Per CANONICALIZATION_POLICY §8 these aren't tricks at all.
- **Tricks with currently-broken editorial decomposition** (Tier C from Phase 5e: barfly→infinity, fusion→dod). Notation-bootstrap should wait until ontology questions resolve; otherwise the notation encodes a state that may be invalidated.

---

## 3. Suggested bootstrap tiers

Each tier batched separately; tier-N must complete + audit-pass before tier-N+1 begins.

### Tier 1 — Foundational + parser-anchoring (target: 40–50 rows)

**Composition:** 30 foundational educational rows (§2.1) + 10–20 highest-leverage parser-demonstration anchors (§2.2 + §2.4 + §2.7). Specifically:

- All surface delays (10) — clean, identical-shape notation set.
- All pure base tricks (12) — anchor every family.
- All body primitives (8) — anchor stress-test cases.
- ~10 Red-stabilized rows: sumo, sailing, atom-smasher, fury, terrage, backside-related (if the modifier itself gets notation in a future phase, currently no), gauntlet.

Approximate row count: 40 ± 5.

**Outcome target after Tier 1:**
- "Notation Pending" disappears from all foundational pages.
- Parser can exercise full pipeline on 40+ rows.
- The dictionary's notation surface becomes coherent: every base, every surface, every primitive carries Jobs notation.

### Tier 2 — Canonical compounds + modifier-rich (target: 50–60 rows)

**Composition:** §2.3 structurally rich compounds + §2.5 editorial-clean rows (Phase-5e backfilled set).

Specifically:
- 33 Phase 5e clean-editorial rows (§2.5).
- 10–15 multi-modifier compounds (gauntlet covered in Tier 1; tomahawk, fury, surge, surreal, surgery, venom, witchdoctor, fog).
- ~10 named compounds in the family-anchor remainder: nemesis, smoke, plasma, grave-digger, jani-walker, magellan, bigwalk, dyno, paradon.

Approximate row count: 50 ± 10.

**Outcome target after Tier 2:**
- ~90–100 of 146 active tricks have notation (60–70% coverage).
- Every audit-picklist trick has notation.
- Multi-modifier composition demonstrably renders correctly across the parser.

### Tier 3 — Difficult / policy-sensitive (target: 20–30 rows)

**Composition:** §2.6 historically-important-but-not-yet-Tier-1 + policy-token rows + productive-multiplicity rows + remaining canonical rows.

- Policy-dependent: quantum (notation must surface policy-token tagging), shooting (already Tier 1 likely).
- Nuclear/X-Dex special case: sumo's notation needs to encode the X-Dex escalation (per Red pt9 description). Decision needed: does notation reflect "nuclear mirage with X-Dex" or just "X-Dex on Mirage"? — needs adjudication, likely James-tier.
- Productive multiplicity: double-leg-over, double-around-the-world (Red pt3 stabilized but ambiguous between "Double X" prefix and structural form).
- Tier B1 deferred from Phase 5e: blender (whirling-osis), torque (mirage-osis loose), drifter, double-leg-over.
- Other remaining: terraging-X family, ripstein, royale (post-pt5 activation candidates), pendulum, dragonfly-kick, whirling-swirl, dada-curve.
- Rev-* family: rev-up, rev-whirl, reverse-around-the-world (direction-as-structural per pt6).

Approximate row count: 25 ± 10.

**Outcome target after Tier 3:**
- ~115–125 of 146 active tricks have notation.
- Policy-dependent and productive-multiplicity rows surface their uncertainty IN the notation (not papered over).
- Tier B1 deferred items get a path forward via notation rather than waiting on broader ontology decisions.

### Tier 4 — External corpora reconciliation (DEFERRED)

**Composition:** FootbagMoves.com ingestion + cross-reference against existing notation. NOT IN SCOPE for this bootstrap. Mentioned only to reserve the slot.

Pre-conditions for Tier 4 (revisit at the time):
- Tier 1–3 must be complete and re-audited.
- `feedback_parser_editorial_separation.md` forever-rules verified intact.
- Editorial decomposition layer continues to surface the curator-data signals from external corpora (the Phase 5a architectural payoff).

---

## 4. Notation authoring standards

Reference: Jobs notation grammar per `exploration/freestyle-notation-grammar/PROPOSAL.md`. This section adds discipline standards specific to the bootstrap, not the grammar itself.

### 4.1 Syntax discipline (raw column)

- **Uppercase tokens for grammar elements:** `CLIP`, `OUT`, `IN`, `DEX`, `DEL`, `OP`, `XBD`, etc. (per Jobs's documented form).
- **Square brackets for atomic role groups:** `[OUT IN] DEX` for the dexterity body of a trick.
- **`>` for delay-to-execution sequencing** when the move chains a delay into action (e.g. `CLIP > OP IN [DEX]`).
- **Modifier prefixes are explicit tokens, not abbreviations:** `PARADOX [OUT IN] DEX MIRAGE`, NOT `PDX [OUT IN] DEX MIRAGE`.
- **Whitespace-separated** between major elements; no commas.
- **NO trailing punctuation.**

### 4.2 Normalized column

`jobs_notation_normalized` = `lowercase(trim(jobs_notation_raw))` for Tier 1–3. Future divergence (e.g. unicode-fold or canonical reorder) is a Phase 6+ concern; bootstrap keeps the normalized form mechanically derivable from raw.

### 4.3 Ambiguity handling

Where Jobs notation admits multiple legitimate forms for the same trick (rare but real for productive-multiplicity rows):

1. Pick the form that **most closely matches `canonical_name`** under tokenization. This keeps parser-derived structural decomposition and notation consistent.
2. Document the alternative in the row's `description` (Phase 4 Editorial context block) — NOT in the notation itself.
3. NEVER encode "or" alternatives in notation (`A | B` is not Jobs grammar).

### 4.4 Unresolved-token policy

Some canonical names contain tokens that don't classify against the parser's role registries (per audit findings §6 — head-stall's "stall", around-the-world's "around/the/world"):

- **Surface-suffix tokens** (`stall`, `kick`, `delay`): retained in notation when canonically used (e.g. `HEAD STALL`); the parser's unresolved-tokens machinery handles them per current behavior.
- **Pure naming tokens** (`around`, `the`, `world`): retained in notation (`ATW` as Jobs-canonical form, OR `[OUT IN] AROUND-THE-WORLD` if multi-token); parser will mark unresolved, descriptive layer captures.
- **Abbreviations are NOT used in notation** even when they're aliases. `ATW` IS Jobs-canonical (per existing community usage). `PDX` IS NOT — use `PARADOX`.

The unresolved-token threshold for QC (§5.3) catches over-pollution; authoring discipline keeps it from happening in the first place.

### 4.5 Intentional absence (when notation should remain NULL)

Bootstrap should NOT populate notation for:

- **`category='modifier'` rows** — they aren't tricks; notation doesn't apply.
- **`is_active=0` rows** — no public surface to display on.
- **Tier C deferred rows** — barfly, fusion (broken-upstream rows pending Red consultation; their structural notation is ontologically uncertain).
- **Self-reference compound rows where structure is genuinely unclear** (e.g. dada-curve has activation-only authority; structure deferred).

Leave NULL. Surface "Notation Pending" remains the correct presentation.

### 4.6 Productive multiplicity (per CANONICALIZATION_POLICY §10)

Per Red pt3: "Double / Triple describes repetition unless community usage stabilizes a distinct name."

For the stabilized productive-multiplicity rows (`double-leg-over`, `double-around-the-world`, `double-spin`):

- Notation **uses the multiplicity prefix explicitly**: `DOUBLE [OUT IN] LEGOVER` or `DOUBLE ATW`.
- Notation does NOT encode the "really-it's-miraging-legover" structural alternative — that lives in editorial context, NOT in notation.
- The notation form mirrors what the community says when describing the trick.

For the descriptive multiplicity rows (Double Fairy, Double Blender, etc. per CANONICALIZATION_POLICY §10): out of scope; they aren't canonical entries.

### 4.7 Rotational modifiers

Modifiers with rotational/non-rotational ADD splits (`spinning`, `blurry`, `atomic`, `swirling`, `furious`):

- **Notation does NOT encode rotational-vs-non-rotational** (that's an ADD-math property, not a structural property).
- Notation simply lists the modifier: `SPINNING [OUT IN] DEX WHIRL`.
- The parser already infers rotational-vs-non-rotational from the BASE family (per `ROTATIONAL_BASES` set).
- The audit's `rotational_escalation_policy_pending_red` warning (per audit-finding §10) continues to surface uncertainty independently.

### 4.8 Pedagogical clarity vs mechanical completeness

Tension: a notation can be technically complete (all tokens, all groupings) OR pedagogically readable (ATW vs `[FAR IN] AROUND-THE-WORLD`).

Recommendation:

- **Tier 1 prefers pedagogical clarity.** These rows are anchors for human learning. Use the form a community member would recognize at a glance. Example: ATW for around-the-world (NOT `[FAR IN] AROUND-THE-WORLD`); `MIRAGE` for the row whose canonical_name IS `mirage` (NOT `[OUT IN] DEX`). Self-atom forms acceptable when the canonical name is an established named compound.
- **Tier 2 prefers mechanical completeness.** Multi-modifier compounds gain explanatory value from explicit token decomposition: `PARADOX SPINNING [OUT IN] DEX WHIRL` rather than `PARADOX-SPINNING-WHIRL`.
- **Tier 3 prefers honest uncertainty.** Policy-dependent and productive-multiplicity rows should have notation that surfaces the contested element; suppress nothing. If uncertainty itself can't be encoded, leave NULL (§4.5).

The bootstrap chooses pedagogical-or-mechanical per-tier on principle; case-by-case ambiguity documented in row review notes.

### 4.9 What notation does NOT do

- Notation does NOT encode ADD math. The asserted ADD in `freestyle_tricks.adds` is editorial truth; the parser-derived `computed_adds` is diagnostic. Notation is a third channel: structural representation. None of these three replace each other.
- Notation does NOT override `description`. Description is human prose; notation is grammar. Both surface in the diagnostic panel.
- Notation does NOT introduce slug-specific encoding. Same syntax rules apply to every row.

---

## 5. QC strategy

Notation is a curator-authored field; bootstrapping it without QC is how typos and ambiguities ship to production. The Phase 5a editorial layer plus the existing parser provide multiple cross-checks.

### 5.1 Parser round-trip check

For each newly authored notation:

1. Set `jobs_notation_raw` to the authored value.
2. Run `python3 scripts/parse_freestyle_notation.py --apply` (per `feedback_parser_population_after_rebuild.md`).
3. Verify parser output:
   - **`add_formula_status`** is one of `exact_modifier_derived`, `exact_self_atom`, `approximate`, `policy_dependent` — NOT `unresolved` (would indicate notation has tokens parser can't classify; fail the row).
   - **`computed_adds`** equals `asserted_adds` for non-`approximate` rows; reasonable disagreement allowed for `approximate` (e.g. barraging-osis).
   - **`parse_warnings`** contains no surprise warnings beyond the row's expected set (e.g. `inferred_self_canonical_atom` is fine for self-atom rows; `policy_token_encountered:X` is fine for known policy-token rows).

### 5.2 ADD agreement check

Three ADD values per row:
- `asserted_adds` (editorial truth, fixed)
- `computed_adds` (parser-derived from notation)
- editorial-decomposition `composedAdds` (from base_trick + modifier_links)

For Tier 1–2 rows post-bootstrap:
- All three should agree.
- Disagreement between any two is a QC fail; investigate.

For Tier 3 rows:
- `asserted_adds` always wins (Phase-2.5 contract).
- `computed_adds` may differ from asserted on `approximate` rows (barraging-osis precedent). Notation should reflect the structural truth even when math diverges.
- Editorial `composedAdds` may differ from parser `computed_adds` on policy-dependent rows (sumo's nuclear weight uncertainty).
- Honest divergence is preserved; not papered over.

### 5.3 Unresolved-token threshold

Per-row threshold: notation tokens that classify as `unresolved_tokens` should be ≤ 1 token for Tier 1, ≤ 2 tokens for Tier 2, ≤ 3 tokens for Tier 3.

Corpus-wide: total unresolved-token count across all bootstrapped rows should NOT increase by more than (rows-bootstrapped × 1.5). If it does, notation discipline is leaking.

Hard fail: any row whose notation produces > 3 unresolved tokens AND status=`unresolved`. Re-author the notation; don't relax the threshold.

### 5.4 Policy-token surfacing

Each Tier 3 policy-dependent row should show in `parser_policy_dependent_queue.md` after parse. The bootstrap doesn't ELIMINATE policy-dependent classification — it only authors notation that surfaces it correctly.

### 5.5 Editorial decomposition comparison

For rows with editorial decomposition (post-Phase-5e: ~60 rows), the notation-derived parser output should produce role buckets that align with the row's `freestyle_trick_modifier_links` join-table state.

Example for `blur` (post-5e clean editorial state):
- Editorial says: `Base: mirage(2) + blurry(+2 rot) = 4`.
- Notation should be parseable into roles: `core_family: mirage`, `set: blurry` (or modifier, depending on grammar).
- Parser-derived `add_contributing_roles` should match.
- Cross-layer divergence here is a QC fail.

This check is the **highest-leverage QC step** because it leverages Phase 5e's just-cleaned editorial layer as ground truth.

### 5.6 Human review checkpoints

Per-tier:

- **Tier 1**: every row reviewed by James OR documented self-review with explicit pedagogical justification. ~40 rows × ~5 min each = ~3h review burden.
- **Tier 2**: batched review. James spot-checks 20% (random sample); rest pass via QC automation (5.1–5.5). ~50 rows × ~2 min spot-check = ~30min review burden.
- **Tier 3**: full James review per row (policy-sensitive). Some rows escalate to Red. ~25 rows × ~10 min each + Red turnaround on subset.

Audit re-run after each tier completes; signals must show:
- "Notation Pending" count drops by tier-row-count.
- Editorial decomposition layer signals unchanged (parser independence forever-rule).
- Parser status breakdown shifts (more `exact_*`, fewer `unresolved`).

### 5.7 Corpus-wide post-tier audit

After each tier:
1. Re-run `scripts/audit-notation-grammar.ts`.
2. Compare against pre-tier snapshot.
3. Classify deltas: `(slug, prior_state, new_state)` per row.
4. Surface any row whose new state is WORSE than prior (e.g. went from no-notation to unresolved-tokens-present). Re-author or hold.

---

## 6. Workflow design

The bootstrap touches the same pipeline that Phase 5e edits used. No new infrastructure required.

### 6.1 Curator authoring workflow

1. Curator (James) selects the next-tier batch (e.g. 40 Tier-1 rows).
2. For each row, author Jobs notation per §4 standards.
3. Stage edits in a curator-friendly intermediate form:
   - **Option A: extend `red_corrections_2026_04_20.csv`.** Each row = `slug, notation, old_value=NULL, new_value=<authored>, source_note=Notation bootstrap Tier N 2026-MM-DD`. Pure field-level UPDATE; safe for any existing trick row.
   - **Option B: dedicated `notation_bootstrap.csv`** with curator-friendly schema (slug, jobs_notation_raw, jobs_notation_normalized, source, notes, tier, reviewer). Requires a small loader extension. Cleaner audit trail but introduces a new pipeline component.

   **Recommendation: Option A for Tier 1 (smallest infrastructure footprint), revisit Option B if Tier 2 onwards reveals authoring tooling needs.**

### 6.2 James-reviewable vs Red-review-required

- **James-reviewable (default):** Tier 1, Tier 2, Tier 3 non-policy-token rows. James reviews authored notation against §4 standards, approves batch.
- **Red-review-required:** Tier 3 policy-token rows (quantum, shooting, sumo with X-Dex, productive-multiplicity edge cases) where the notation form encodes a structural claim Red has authority on. Routed through the standard pt-N packet channel.

### 6.3 Staging CSVs

`legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` already loads notation via `SOURCE_ASSERTABLE_FIELDS`. Phase 5e Tier A used the same channel for base_trick fixes. Same pattern for notation field updates.

If Option B (dedicated CSV) is later chosen, schema:
```csv
slug,jobs_notation_raw,jobs_notation_normalized,tier,authored_at,reviewer,source_note
```
…with a small loader script (`23_load_notation_bootstrap.py` or similar) running between scripts 19 and 22 (QC).

### 6.4 Promotion flow

1. Curator authors → CSV staging.
2. `./scripts/reset-local-db.sh` rebuild.
3. `python3 scripts/parse_freestyle_notation.py --apply` (per `feedback_parser_population_after_rebuild.md`).
4. Run QC checks per §5.
5. Re-run `npx tsx scripts/audit-notation-grammar.ts`.
6. Verify all post-tier signals.
7. Run notation-grammar tests + full test suite.
8. James reviews; commit.

### 6.5 Audit logging

Per CSV staging convention (matches Phase 5e):
- `source_note` column carries provenance: "Notation bootstrap Tier N 2026-MM-DD: [optional reasoning]".
- For Red-required rows: `source_note` references the originating pt-N batch.
- Commits scoped per tier, not per row.

### 6.6 Rollback strategy

Every bootstrap is a CSV row. Rollback:
1. Remove the offending row(s) from the CSV (or revert via `git checkout` on the file).
2. Run rebuild + parser-population.
3. Re-audit.

For a tier-wide rollback (worst case), revert the tier's commit. The parser-derived columns repopulate to NULL on next rebuild. Public surface returns to "Notation Pending."

No DB-level rollback needed — the pipeline rebuild is idempotent.

---

## 7. Public UX implications

### 7.1 Trick detail pages

- "Notation Pending" disappears for bootstrapped tiers.
- `/freestyle/tricks/:slug` displays Jobs notation as a prominent field (above the structural-decomposition diagnostic panel).
- The Phase-4 Diagnostic-details disclosure still wraps `jobs_notation_raw` for parser-debug context, but the public-facing notation is now visible by default.

### 7.2 Glossary usefulness

`/freestyle/glossary` currently describes notation conventions abstractly. With Tier 1 in place:
- Each notation token can link to canonical example tricks (e.g. "DEX" links to `mirage`, `whirl`, `osis`).
- Reverse-lookup: glossary entries reference rows that exemplify each token.
- This lift is template-only; service-shaping derives from existing dictionary state.

### 7.3 Educational value

Bootstrapped notation models the language. A learner reading `/freestyle/tricks/spinning-whirl` post-Tier-2 sees:
- Jobs notation (e.g. `SPINNING [OUT IN] DEX WHIRL`).
- Parser-derived structural decomposition.
- Editorial decomposition (whirl + spinning).
- Description ("Spinning-modified whirl.").

Four mutually-reinforcing surfaces, each contributing different information.

### 7.4 Semantic highlighting opportunities

Future template work (NOT this phase): render notation tokens with role-aware coloring:
- core_family tokens in one color
- set / rotation / body modifier tokens in another
- delay surface tokens in another

The parser already knows token roles (per Phase 2.5 descriptive layer). Template can consume that for visual highlighting.

### 7.5 Future family/group browsing

With notation populated, family-page rendering (`/freestyle/tricks?family=whirl`) can show notation alongside name — readers see structural similarity at a glance. Without notation, this is just slug + name + ADD.

Relatedly, `buildRelatedTricks` (Phase 4-era) could in the future use notation similarity as an additional related-trick signal. Out of scope for this phase; flagged as downstream value.

---

## 8. Explicitly deferred

Per the proposal constraints, none of the following is in scope for this bootstrap:

- **FootbagMoves.com ingestion** (Tier 4 future; reserved slot only).
- **Automatic notation generation** (no heuristic, no AI inference, no description-text parsing). Every notation is hand-authored.
- **AI inference / LLM-generated notation.** Even with strong models, AI-generated notation would be opaque about its provenance and might smooth over the curator-data signals the editorial layer worked hard to surface.
- **Parser rewrites.** The parser tokenizes canonical_name; this bootstrap doesn't change that. If notation is later considered as an alternative parser input source, that's a separate proposal.
- **Ontology redesign.** Bootstrap is data work; ontology changes (productive multiplicity, X-Dex generalization, Tier C resolution) are separate.
- **Full visual notation renderer.** Notation appears as monospace text in this bootstrap. A future graphical-notation engine (per PROPOSAL §6 future work) is not in scope.

---

## 9. Forever-rules carried forward

From `feedback_parser_editorial_separation.md` and PHASE5_STATUS_SHAPE_CONSULTS.md §7:

1. **Parser still tokenizes canonical_name only.** Notation field exists alongside; parser doesn't read it as primary input. (Future change to parser input would be its own proposal.)
2. **Editorial layer still reads only base_trick + freestyle_trick_modifier_links.** Notation is a third independent channel, not a substitute for either.
3. **Asserted_adds is editorial truth.** Notation doesn't contradict; it represents.
4. **No slug-specific code branches.** Bootstrap is data-only; no runtime logic added.
5. **`sourceLabel: 'editorial'` const literal preserved.** Notation doesn't relabel editorial decomposition.

The bootstrap is a CONTENT layer addition. The architecture stays untouched.

---

## 10. Estimated effort

Authoring + QC time, not commit time:

| Tier | Rows | Time/row (author + QC) | Total |
|---|---:|---|---|
| Tier 1 | 40 | ~10 min | **~7 hours** |
| Tier 2 | 50 | ~6 min | **~5 hours** |
| Tier 3 | 25 | ~15 min (incl. some Red turnaround) | ~6 hours active + Red wait |
| Tier 4 | (deferred) | n/a | n/a |

Plus: rebuild + parser-population + audit re-run + test suite per tier (~10 min × 3 tiers = 30 min).

Plus: James review per tier (§5.6 review burden).

**Total active-time investment: ~20 hours across three tiers.** Dominated by per-row authoring discipline, not infrastructure.

This is well-bounded. The bottleneck is curator focus time, not engineering throughput.

---

## 11. Recommended decision

**Approve the bootstrap as a multi-tier rollout with explicit per-tier approval gates.**

Specifically:

1. **Approve Tier 1 first.** 40 rows, foundational + Red-stabilized. Lowest authoring risk. Highest immediate UX payoff (every base trick gains notation). Gate: Tier 1 must complete + audit-pass + James review before Tier 2 begins.

2. **Hold Tier 2 for separate approval.** Conditional on Tier 1 outcomes (especially: did the §5.5 editorial-decomposition cross-check work as intended).

3. **Hold Tier 3 for separate approval, with tighter scoping.** Some rows likely route to Red; keep the batch small and precise.

4. **Defer Tier 4 indefinitely.** FootbagMoves becomes its own proposal once Tier 1–3 establishes a clean baseline.

5. **Use Option A staging (red_corrections.csv extension) for Tier 1.** Lowest infrastructure footprint. Revisit Option B (dedicated CSV) after Tier 1 if authoring tooling demands it.

6. **Adopt §4.8's per-tier preference:** pedagogical (Tier 1) → mechanical (Tier 2) → honest-uncertainty (Tier 3).

---

## 12. What this proposal does NOT propose

- No notation values authored here. Tier 1 row list is enumerated; notation strings for those rows are NOT.
- No CSV writes.
- No DB writes.
- No parser changes.
- No template / service changes.
- No new tests.
- No Red consultation queued.

Authoring begins only after Tier 1 approval.

---

## Cross-references

| File / Path | Role |
|---|---|
| `exploration/freestyle-notation-grammar/PROPOSAL.md` | Jobs notation grammar spec (the language being authored) |
| `exploration/freestyle-notation-grammar/PHASE_2_5_REFINEMENTS.md` | Status vocabulary the QC checks will reference |
| `exploration/freestyle-notation-grammar/SEMANTIC_AUDIT_FINDINGS.md` | The surface bootstrap UX improvements land on |
| `exploration/freestyle-notation-grammar/PHASE5_STATUS_SHAPE_CONSULTS.md` | Forever-rules carried forward (§7) |
| `exploration/freestyle-notation-grammar/PHASE5E_EDITORIAL_DATA_CLEANUP_PLAN.md` | The data-cleanup pass that just made editorial layer reliable enough to use as bootstrap QA anchor |
| `legacy_data/inputs/curated/tricks/CANONICALIZATION_POLICY.md` | §4 directionality, §10 productive multiplicity — drives §4.6 / §4.7 of this plan |
| `legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` | Bootstrap staging channel (Option A) |
| `scripts/parse_freestyle_notation.py` | Parser whose round-trip check QCs each notation |
| `scripts/audit-notation-grammar.ts` | Audit tooling for per-tier verification |
| `feedback_parser_editorial_separation.md` (memory) | Architectural commitments preserved across the bootstrap |
| `feedback_parser_population_after_rebuild.md` (memory) | Required step after each rebuild during QC |
