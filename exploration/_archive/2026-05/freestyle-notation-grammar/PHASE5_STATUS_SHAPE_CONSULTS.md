# Phase 5 — Parser / Status-Shape Consult Architecture (Planning)

Proposal-only. No code changes. Investigates lightweight ways for the notation-grammar diagnostic surface to consult editorial metadata (`base_trick`, `modifier_links`, `description`, `freestyle_trick_modifier_links` join) without crossing parser independence or introducing hardcoded ontology behavior.

Builds on:
- `PROPOSAL.md` (Phase 1–2 grammar shape)
- `PHASE_2_5_REFINEMENTS.md` (descriptive vs add-contributing layer split, status vocabulary)
- `SEMANTIC_AUDIT_FINDINGS.md` §3, §4, §12, §16 (the gaps Phase 5 addresses)
- Phase 4 presentation cleanup (commit landing soon — surfaced `description` as Editorial context block)

---

## 1. Problem statement

The Phase 3.5 audit identified that the parser's structural decomposition is honest within its own terms but blind to editorial metadata stored on the row:

- The parser tokenizes `canonical_name` and classifies each token against role registries. It never reads `base_trick`, `modifier_links`, or `freestyle_trick_modifier_links`.
- For named compounds whose canonical name is single-token (sumo, blur, ripwalk, blurriest, barfly, mobius, sailing — and many more in the broader corpus: nemesis, smoke, plasma, fury, surge, fog, etc.), the parser produces formulas like `slug(N) = N` with status `exact_modifier_derived`, even though the row's editorial metadata carries the structural lineage.
- Phase 4 closed part of this gap by rendering `description` as an Editorial context block. The reader of `/freestyle/tricks/sumo` now sees "Nuclear-modified mirage; 5 ADD via X-Dex escalation per Red pt9." — but the structured decomposition (base=mirage, modifier=nuclear) is not consulted by the panel.

Phase 5 asks: **what is the lightest architecture that surfaces structured editorial decomposition without breaking parser purity?**

---

## 2. Concrete state of the editorial layer (snapshot)

`freestyle_trick_modifier_links` contains 39 rows linking trick slugs to modifier slugs. Coverage is sparse:

- 39 tricks have at least one modifier link (e.g. fury, nemesis, smoke, plasma, gauntlet, surge, sumo).
- Most named compounds in the audit picklist do NOT have join-table rows (blur, ripwalk, blurriest, barfly, mobius, sailing). They carry the modifier lineage in the `description` text only.

Per-slug editorial state for the audit picklist's named compounds:

| Slug | `base_trick` | join-table modifiers | description (verbatim) |
|---|---|---|---|
| `sumo` | mirage | nuclear | "Nuclear-modified mirage; 5 ADD via X-Dex escalation per Red pt9." |
| `blur` | mirage | (none) | "Blurry-modified mirage." |
| `ripwalk` | butterfly | (none) | "Blurry-modified butterfly." |
| `blurriest` | barfly | (none) | "Blurry-modified barfly." |
| `barfly` | infinity | (none — and `infinity` is NOT a dictionary row) | "Double infinity." |
| `mobius` | torque | (none) | "Gyro-modified torque." |
| `sailing` | sailing (self) | (none) | "Sailing set. 2 ADD standalone. Per Red pt9 equivalent to Pixie Quantum set." |

This data shape matters for Phase 5's architecture choices — three editorial signals are at play (base_trick column, modifier_links join table, description text), with different fidelity, different curator coverage, and different invariants.

---

## 3. Three semantic layers — definitions

Phase 5 must distinguish these three layers precisely. Mixing them is the single largest risk.

### A. Parser-derived semantics

**Origin:** `scripts/parse_freestyle_notation.py` running over `canonical_name` only, classifying tokens against fixed registries (`SET_TOKENS`, `MODIFIER_TOKENS`, etc.).

**Owns:**
- `add_formula_status` (exact_self_atom, exact_modifier_derived, approximate, unresolved, policy_dependent)
- `computed_adds`
- `computed_add_formula`
- `parse_warnings`
- `policy_tokens`
- `additive_flags`
- `descriptive_roles` and `add_contributing_roles`

**Invariants:**
- Reads only canonical_name + role registries. Never reads row metadata.
- Honest about what it does and doesn't know.
- `asserted_adds` (editorial truth) overrides any parser-computed value at presentation time.

**Cannot tell you:** what the row's curator believes the structural decomposition is.

### B. Editorial / declarative semantics

**Origin:** curator-asserted columns on `freestyle_tricks` rows (`base_trick`, `modifier_links` JSON column NOT present in current schema — using `freestyle_trick_modifier_links` join table instead, `description`, `aliases_json`, `category`, `trick_family`), plus governance docs (`CANONICALIZATION_POLICY.md`).

**Owns:**
- `asserted_adds` (editorial truth — the load-bearing invariant)
- `base_trick` (curator-asserted upstream lineage)
- `modifier_links` (curator-asserted modifier composition, via the join table)
- `description` (human-prose editorial framing)
- `trick_family` (curator-asserted family membership)

**Invariants:**
- Per CANONICALIZATION_POLICY §7: every editorial assertion has provenance (Red pt-N, James adjudication, curated baseline).
- Editorial state can be incomplete (sparse join-table coverage), inconsistent (description mentions a modifier the join table doesn't carry), or stale.
- Editorial state is not a parser substitute. It encodes WHAT the curator believes, not WHAT TOKENS THE NAME RESOLVES TO.

**Cannot tell you:** what the parser would say if it ran.

### C. Inferred semantics

**Origin:** rules that combine parser output with editorial metadata to produce derived hints, lineage walks, or divergence flags.

**Owns:**
- Cross-layer divergence reports (e.g. "parser says self-atom; editorial says base+modifier — both shown")
- Lineage-chain walks (e.g. `blurriest → barfly → infinity (broken)`)
- Confidence/source attribution per claim (when implemented)
- Presentation enrichment (which layer to render where)

**Invariants:**
- Inferred semantics MUST NOT silently override either parser or editorial output.
- Every inferred claim must carry a "source: parser+editorial inference" marker.
- Inference rules live in service-layer code, not in the parser, not in the template.

**Cannot tell you:** any new ground truth. Inferences are presentation-shaped, not authoritative.

### Why the three-layer separation matters

The audit findings (§4 candidate-core ambiguity, §12 editorial metadata help) are about **inferred** problems: places where parser and editorial layers disagree or where editorial is richer than parser. Phase 5 is fundamentally an **inferred-layer architecture choice**. The parser layer doesn't change. The editorial layer doesn't change. Phase 5 is about how to compose them.

---

## 4. Architecture options

### Architecture A — Display-only augmentation (Phase 4 baseline)

**Mechanism:** template renders `description` text as Editorial context block. No structured consultation; just unstructured curator prose surfaced.

**Already shipped** in Phase 4. Closes ~50% of the named-compound clarity problem (reader sees "Gyro-modified torque." for mobius).

**Pros:**
- Zero parser risk.
- Trivially auditable: only one new view-model field (`editorialContext`).
- No cross-layer inference.

**Cons:**
- description is human prose, not structured. A reader can't programmatically traverse it; future tools (search, lineage walks) can't consume it.
- description and structured fields can drift (mobius description mentions "Gyro" but join table has no `mobius|gyro` row — inconsistency invisible).
- No formula-shape improvement (parser still says `mobius(5) = 5`).

### Architecture B — Editorial decomposition layer (recommended)

**Mechanism:** at service-shape time, read `row.base_trick` + `freestyle_trick_modifier_links` for the row's slug. Compose a structured editorial decomposition view-model:

```
editorialDecomposition: {
  baseSlug:    string | null;    // e.g. 'mirage'
  baseAdds:    number | null;    // resolved from base row (or null if base not in dict)
  baseStatus:  'resolved' | 'broken_link';  // 'broken_link' for barfly→infinity case
  modifiers: Array<{
    slug:           string;       // e.g. 'nuclear'
    addBonus:       number;       // from trick_modifiers row
    addBonusRot:    number;       // from trick_modifiers row
    isUncertain:    boolean;      // true for nuclear (Uncertain caveat per Red)
    policyToken:    boolean;      // true if slug ∈ POLICY_TOKENS
  }>;
  composedAdds:    number | null; // sum of base + modifier bonuses; null when math doesn't close
  matchesAsserted: boolean | null;// composedAdds === asserted_adds, or null when composedAdds null
  derivationText:  string | null; // e.g. "nuclear(+2) + mirage(2) = 4 (asserted=5; mechanism: see description)"
  sourceLabel:     'editorial';   // ALWAYS; this layer never claims parser provenance
}
```

Render alongside parser-derived blocks. Clearly labeled "Editorial decomposition" with a one-line explanatory caption ("Composition derived from row metadata; parser-derived above. Asserted ADD remains editorial truth.").

**Pros:**
- Parser remains pure. No code change in `scripts/parse_freestyle_notation.py`.
- Editorial state surfaces structured, not just prose.
- Closes audit findings §4 (candidate-core ambiguity) for the rows where editorial state IS rich enough.
- Honestly surfaces broken links (barfly→infinity becomes a "broken_link" badge, not silent absence).
- Shows divergence between editorial and parser output without picking a winner.
- Modest implementation: ~50–100 lines in `freestyleService.ts` + ~20 lines of template + 5 new view-model fields.

**Cons:**
- For rows where `freestyle_trick_modifier_links` is empty (most of the audit picklist!), the editorial decomposition shows base only. Reader sees "blur ← mirage" but no modifier — accurate to the editorial state, but underwhelming.
- Adds a second decomposition view to the panel. Information-density risk if not progressively disclosed.
- Mobius/blur/ripwalk-style inconsistency (description has modifier, join table doesn't) becomes visible — which is honest but might surface a backlog of editorial-data work.

**Variants:**
- B1: **Strict** — read only the join table. Show base + modifiers exactly as the editorial state declares. Most rows show base only.
- B2: **Description-parsed** — also parse `description` text to extract modifier hints (e.g. "Blurry-modified mirage." → editorial modifier=blurry). Closes more rows but introduces a soft-parse step that's its own can of worms.
- B3: **Hybrid** — B1 by default; B2 as a fallback flagged "(inferred from description)" for rows lacking join-table coverage. Most explanatory but most architecturally complex.

**Recommended starting form:** B1 (strict). Get the architecture right; add B2 only if a real backlog of curator data absence persists after Phase 6 and B3 becomes the cheapest path forward.

### Architecture C — Parser hints / metadata seeding (REJECTED)

**Mechanism:** parser optionally consults `base_trick` + `modifier_links` to seed virtual tokens before tokenizing. e.g. for sumo, parser would behave as if canonical_name were "nuclear mirage" instead of "sumo".

**Why rejected:** crosses parser independence. Once the parser reads editorial metadata, its output stops being an independent structural reading and becomes a renderer of editorial declarations. The "asserted is authoritative; computed is diagnostic" Phase-2.5 contract collapses because the diagnostic is no longer independent of the assertion.

This architecture is a forever-no. Documented here to make the line explicit.

### Architecture D — Confidence layering (Phase 6+ candidate)

**Mechanism:** every claim in the diagnostic surface (status, formula, role, ADD, modifier weight, base lineage) carries a structured `source` attribution: `parser_derived | editorial_assertion | inferred | red_authoritative`. The template renders attribution as a small badge or color tier.

**Pros:**
- Information-rich. Lineage clear at every claim.
- Lets the panel express "parser computed X; editorial asserts Y; Red pt-N ratified Z."
- Foundational for advanced features (lineage walks, productive-multiplicity navigation, expert-review queues).

**Cons:**
- Bigger lift. Requires source-tagging on every parser warning, formula component, and editorial field.
- Display becomes denser; needs careful information design to not overwhelm.
- Premature without a clearer product use case.

**Verdict:** good direction for Phase 6+, NOT Phase 5. Recommended path B is a strict subset of D — every editorial decomposition claim is implicitly source=editorial.

### Architecture E — Editorial overlay with structural validator

**Mechanism:** B + reconciliation logic. When parser and editorial layers disagree, surface the divergence as an explicit signal (e.g. "parser: self-atom; editorial: nuclear-modified mirage — these are not contradictory but offer different decompositions").

**Pros:**
- Maximally honest about cross-layer state.
- Explains the disagreement to readers (audit finding §3 misleading "exact" semantics).
- Useful for QC: divergences could feed a curator-facing report.

**Cons:**
- Adds reconciliation logic that itself is a third layer of inference.
- Risk of cluttering the panel with meta-commentary.
- Unclear how to phrase reconciliation messages without sounding like the parser is wrong (it isn't — it's just operating on different inputs).

**Verdict:** subset of D. Specific reconciliation messages can be added incrementally on top of B. Not a separate architecture so much as a stylistic choice within B's rendering.

### Comparison table

| Axis | A (Phase 4) | **B (recommended)** | C (rejected) | D (Phase 6+) | E (style on B) |
|---|---|---|---|---|---|
| Parser purity | ✓ | ✓ | ✗ | ✓ | ✓ |
| Editorial visibility | prose only | structured | n/a | structured + tagged | structured + reconciled |
| Implementation cost | done | low | medium | high | low+ |
| Cross-layer claims | none | side-by-side | merged into parser | per-claim source | reconciliation messages |
| Risk of fake exactness | low | low if labeled | high | low if implemented well | low |
| Risk of silent ontology override | none | low | high | low | low |

---

## 5. Recommended minimal path

**Architecture B1 (strict editorial decomposition layer).** The lightest path that adds structural value beyond Phase 4.

### Concrete shape

**Service (`src/services/freestyleService.ts`):**

1. Add an `EditorialDecomposition` interface (shape per §4 architecture B).
2. Add a new function `shapeEditorialDecomposition(row, allDictRows, allModifierRows, modifierLinks)` that:
   - Returns null when row has no `base_trick` OR base_trick is self-reference (e.g. sailing's base_trick=sailing).
   - Reads base_trick, finds the base row in `allDictRows`, captures `baseSlug`, `baseAdds`, `baseStatus`.
   - Reads modifier links for the slug from a new prepared statement (or from a passed-in map).
   - Composes `composedAdds` = base.adds + sum(modifier.add_bonus or add_bonus_rotational based on whether base is in `ROTATIONAL_BASES`). Honest about modifier weights flagged Uncertain.
   - Sets `matchesAsserted` based on row.adds.
   - Generates `derivationText` similar to existing `addComposition` but with explicit Uncertain caveats and policy-token flags.
3. Add `editorialDecomposition: EditorialDecomposition | null` to the `NotationGrammarPanel` interface.
4. Wire into `shapeNotationGrammar` — pass through allDictRows + allModifierRows + modifier links.

**Template (`src/views/freestyle/trick.hbs`):**

5. Render an "Editorial decomposition" block alongside the existing parser-derived blocks. Place it after ADD-contributing roles, before Editorial context. Same progressive-disclosure pattern as Phase 4 — visible by default when present, omitted entirely when null.
6. Make the explanatory caption explicit: "Derived from this row's `base_trick` and modifier metadata. Parser-derived structural decomposition above is an independent reading. Asserted ADD is editorial truth."

**Tests:**

7. Update existing notation-grammar fixtures and add new ones that exercise:
   - Row with base_trick + non-empty modifier links → editorial decomposition renders fully.
   - Row with base_trick but empty modifier links → editorial decomposition shows base only, modifier list empty.
   - Row with broken base_trick (e.g. base_trick='infinity', no such dict row) → editorial decomposition shows broken_link.
   - Row with self-reference base_trick → editorial decomposition NOT rendered (no information).
   - Row where editorial-derived composedAdds matches asserted → matchesAsserted=true, derivationText reads cleanly.
   - Row where editorial-derived composedAdds mismatches asserted → matchesAsserted=false, divergence visible without claiming either side wrong.

### What this minimal path does NOT do

- Does NOT modify the parser.
- Does NOT change asserted_adds for any row.
- Does NOT change `add_formula_status` interpretations.
- Does NOT auto-reconcile parser vs editorial divergences.
- Does NOT override `addsAgree` (the parser-derived agree/disagree signal).
- Does NOT introduce slug-specific branches anywhere.
- Does NOT parse `description` text (B1 not B2; defer description-parsing question to its own future proposal).
- Does NOT add Red consultation, new tricks, or modifier-weight changes.

---

## 6. Failure modes and mitigations

### F1. Sparse modifier-link coverage produces underwhelming editorial decompositions

**Manifest:** for blur, the editorial decomposition reads "base: mirage (2)" with no modifiers. The 4-ADD asserted value isn't explained by 2-ADD base + zero modifiers. composedAdds=null or 2; matchesAsserted=false.

**Mitigation:** be honest about it. The block carries a "modifier coverage incomplete" badge. Doesn't pretend to fully decompose. Reader sees: parser says self-atom-shaped; editorial says base=mirage but modifier metadata is absent. That divergence is itself useful information — flags rows that need curator attention.

**Failure-mode-as-feature:** the editorial decomposition's incompleteness becomes a curator backlog signal. Could feed a periodic "editorial coverage" report.

### F2. Description-text/join-table inconsistency

**Manifest:** mobius's description says "Gyro-modified torque." but `freestyle_trick_modifier_links` has no `mobius|gyro` row. Editorial decomposition shows base=torque only.

**Mitigation:** B1 strict path doesn't claim to read description. The Phase 4 Editorial context block still shows the description text. Reader sees both: Editorial decomposition (base only) + Editorial context (says gyro). Internal inconsistency visible, not invented.

**Forward-looking:** if B2 (description-parsed) is later considered, this is exactly the case where it'd fire — and exactly the case where a "(inferred from description)" badge becomes load-bearing to keep editorial assertion separate from text-parse inference.

### F3. Editorial-derived ADD math fails

**Manifest:** sumo's editorial composition is mirage(2) + nuclear(+2) = 4, asserted=5. matchesAsserted=false.

**Mitigation:** this is the same shape as the parser's `approximate` status for barraging-osis. Honest disagreement; asserted wins; both shown. The derivationText explicitly flags `nuclear(+2 — Uncertain)` with the caveat coming from `trick_modifiers.csv` notes. Reader sees: editorial says ~4 if Nuclear is +2; the +5 asserted comes from Red pt9's X-Dex mechanism not captured in the modifier table; description fills in the gap.

**This is the load-bearing design point.** Editorial divergence MUST surface, not hide. Mirrors Phase-2.5's parser-side approximate handling. The editorial layer earns trust by handling its own failures honestly.

### F4. Broken upstream link (barfly → infinity)

**Manifest:** barfly's base_trick='infinity', infinity is not a dictionary row.

**Mitigation:** baseStatus='broken_link'. derivationText says "base: infinity (not in dictionary — broken upstream link)". Editorial layer is honest about its own broken state. This single feature closes audit finding §4's "barfly hides ontology" complaint immediately.

### F5. Self-reference base_trick (sailing → sailing)

**Manifest:** sailing's base_trick=sailing.

**Mitigation:** editorial decomposition skipped. derivationText null. Block omitted from render. The parser's self-atom verdict + the Editorial context block (description: "Sailing set...") are sufficient.

### F6. Information-density / two-decomposition overload

**Manifest:** panels for tricks with rich editorial state could now show: status, asserted/computed, parser formula, descriptive roles, ADD-contributing roles, editorial decomposition with its own derivation, editorial context (description), policy tokens, and Diagnostic details disclosure. That's a lot.

**Mitigation:** progressive disclosure. Editorial decomposition stays primary (visible) when present and informative. Editorial context (description) stays primary. Diagnostic details remain behind disclosure. The two-decomposition view is intentional — comparing parser-derived to editorial-derived is exactly the audit-finding-driven feature.

If density still pushes too hard, a Phase-6 re-design could collapse parser-derived AND editorial-derived into a tabbed or toggled "Decomposition lenses" view. Not Phase 5 work.

### F7. Circular reasoning / asserted-ADD contamination

**Manifest:** future iteration tempts using editorial-derived composedAdds to "fix" asserted_adds when they disagree. e.g. "editorial says 4, but asserted is 5; let me update asserted to 4."

**Mitigation:** documented forever-no. Asserted_adds is editorial truth (Phase-2.5 contract). Editorial-derived composedAdds is a presentation aid. composedAdds NEVER feeds back into the editorial layer. Code reviewers, tests, and CI rules should enforce this — no service code path that reads composedAdds and writes back to asserted.

### F8. Hidden hardcoding for "important" rows

**Manifest:** future temptation to add slug-specific logic ("if slug==sumo, render the X-Dex mechanism specially").

**Mitigation:** all editorial decomposition logic must read from generic columns (`base_trick`, `freestyle_trick_modifier_links`, `description`). Slug-specific branches are forbidden. Special mechanism notes (X-Dex for sumo, Pixie Quantum for sailing) live in the description column where curators can edit them — same channel as for any other row.

### F9. Candidate-core contamination

**Manifest:** rows like blur/ripwalk/blurriest/barfly classify in editorial state as "candidate-core" — names that look base-level but classify as derivatives. Risk: editorial decomposition silently collapses them under a base ("blur is mirage-derived"), erasing the productive-multiplicity ontological tension Red codified in pt3 / CANONICALIZATION_POLICY §10.

**Mitigation:** editorial decomposition shows the asserted upstream lineage but does NOT claim that the row is "really just" the base. Reader still sees: blur's status as a canonical row (own page, own records, own family); blur's editorial decomposition (base=mirage); blur's description (curator framing). The three together preserve productive-multiplicity. CANONICALIZATION_POLICY §10's "stabilized examples vs descriptive examples" distinction lives in the dictionary's row-existence decision, not in how the diagnostic panel renders existing rows.

---

## 7. Things that should remain parser-independent forever

These are immutable. Phase 5 doesn't move them; future phases don't move them.

1. **Parser tokenization input.** `parse_freestyle_notation.py` reads `canonical_name` only. Never `base_trick`, never `modifier_links`, never `description`, never any other row column.

2. **Parser registries.** `SET_TOKENS`, `MODIFIER_TOKENS`, `ROTATION_TOKENS`, `DELAY_SURFACE_TOKENS`, `UNUSUAL_SURFACE_TOKENS`, `DIRECTION_TOKENS`, `POLICY_TOKENS`, `VIRTUAL_EXPANSIONS`, `ROTATIONAL_BASES` live as parser-internal constants, derived from `freestyle_trick_modifiers` table for value lookup but NOT from per-row metadata of consumers.

3. **Status determination.** `add_formula_status` is computed by the parser from its own analysis of role buckets and parse warnings. Editorial metadata can ENRICH the rendered status (e.g. an editorial decomposition box appears alongside) but NEVER changes which `add_formula_status` is set.

4. **Computed ADDs.** `computed_adds` is parser-derived from base.adds + modifier weights. Editorial-derived `composedAdds` lives in a parallel field, never overwrites computed_adds.

5. **Asserted ADDs.** `freestyle_tricks.adds` is editorial truth. Parser's computed_adds and editorial-derived composedAdds both compare against it; neither is allowed to update it.

6. **Parse warnings ownership.** `parse_warnings` is emitted by the parser. Editorial-derived signals (broken-link badges, modifier-coverage warnings) live in their OWN channel (`editorialDecomposition.baseStatus`, etc.), never appended to parse_warnings.

7. **Independent reproducibility.** A reader (or QC tool) must be able to run the parser against any active trick row and reproduce the same `structural_parse_json` regardless of editorial state changes. If editorial metadata edits could alter parser output, the parser's diagnostic role is corrupted.

8. **No slug-specific branches.** Anywhere. In the parser, in the service, or in the template. Special-case behavior must derive from generic data shape, never from name matching.

9. **Per-claim source tagging is allowed; cross-layer overwrites are forbidden.** A future Phase 6+ confidence layer (Architecture D) is welcome to add `{source: parser_derived | editorial | inferred}` to claims it presents — but each claim's source must be immutable. An editorial assertion never gets re-tagged as parser_derived.

---

## 8. Worked examples — what the panel would render under Architecture B1

(Illustrative HTML/text, not copy-pasted from the actual implementation. For Phase 5 doc only.)

### `sumo` (rich editorial state — best case)

```
Status: Exact: structurally derived (exact_modifier_derived)
Asserted ADD: 5
Computed ADD: 5 (agrees with asserted)
Derivation: sumo(5) = 5

Descriptive roles:
  - Core family: sumo

ADD-contributing roles:
  - Core family: sumo

Editorial decomposition:
  Derived from this row's base_trick and modifier metadata. Parser-derived above
  is an independent structural reading.
  - Base: mirage (2)
  - Modifier: nuclear (+2 non-rotational; flagged Uncertain — see modifier notes)
  - Composed: nuclear(+2) + mirage(2) = 4
  - vs asserted: composed=4 disagrees with asserted=5; mechanism (X-Dex)
    captured in editorial context below; asserted is editorial truth.

Editorial context:
  Nuclear-modified mirage; 5 ADD via X-Dex escalation per Red pt9.

Policy tokens:
  - nuclear (in editorial decomposition; pending expert review for flat value)

[Diagnostic details ▸]
```

This is the load-bearing case. Three layers — parser, editorial, description — all visible, each clearly attributed, divergences honestly named, asserted=5 uncontested.

### `mobius` (description-only modifier — partial editorial)

```
...
Editorial decomposition:
  - Base: torque (4)
  - Modifier coverage: incomplete (no entries in modifier links table)
  - Composed: cannot resolve without modifiers
  - Note: description below mentions "Gyro-modified" — promote to modifier link
    if curator confirms.

Editorial context:
  Gyro-modified torque.
```

Reveals the curator backlog cleanly. Shows the join-table gap without inventing data.

### `barfly` (broken upstream link)

```
...
Editorial decomposition:
  - Base: infinity (broken upstream link — `infinity` is not in the dictionary)
  - Composed: cannot resolve
  - Note: editorial state references a slug that no longer exists or was never
    created.

Editorial context:
  Double infinity.
```

Audit finding §4 closed for barfly.

### `sailing` (self-reference base — block omitted)

```
Status: Exact: structurally derived (exact_modifier_derived)
Asserted ADD: 2
Computed ADD: 2 (agrees with asserted)
Derivation: sailing(2) = 2
... role layers ...

(Editorial decomposition block omitted — base_trick is self-reference.)

Editorial context:
  Sailing set. 2 ADD standalone. Per Red pt9 equivalent to Pixie Quantum set.
```

Self-reference cleanly handled by null-the-block.

### `paradox-whirl` (full parser-derived, editorial decomposition redundant)

```
Status: Exact: structurally derived (exact_modifier_derived)
Derivation: paradox(+1) + whirl(3) = 4
... role layers ...

Editorial decomposition:
  - Base: whirl (3)
  - Modifier coverage: incomplete (canonical name carries the modifier; join table empty)
  - Note: parser-derived decomposition above is the authoritative reading for this row.

Editorial context: (description if present)
```

For rows where parser already does the work, editorial decomposition is mildly redundant but honest. Could be hidden behind progressive disclosure to reduce noise — see §9.

---

## 9. Open design questions for Phase 5 implementation (not Phase 5 planning)

These are NOT decisions for this proposal; they're flagged for the implementation phase that follows approval.

- **Q1.** Should the editorial decomposition block be hidden when it adds no information beyond the parser-derived layer (e.g. paradox-whirl)? Cleanest: hide when (parser-derived modifier set ⊇ editorial modifier set) AND parser+editorial composedAdds agree.

- **Q2.** Should description-text-derived modifier hints (Architecture B2) ever ship? Open. Defer to a separate proposal if a curator-data-coverage backlog persists post-Phase-5.

- **Q3.** Should `freestyle_trick_modifier_links` be expanded retroactively to cover named compounds whose description names a modifier (mobius/gyro, blur/blurry, etc.)? That's editorial data work, not Phase 5 architecture. Could be a separate "modifier-link backfill" pass driven by Phase 5's coverage report (failure mode F1's silver lining).

- **Q4.** Should the editorial decomposition's composedAdds be exposed in the view-model as a number, even when matching asserted? Yes — having both parser computed_adds AND editorial composedAdds visible side-by-side is the point of the architecture.

- **Q5.** Where does the editorial decomposition for MODIFIER rows themselves (rows where `category='modifier'`) render? Probably never — modifier rows aren't compounds and don't have base_trick + modifier_links of their own. Verify with a fixture.

- **Q6.** How should the editorial decomposition handle rotational base detection? Same `ROTATIONAL_BASES` set the parser uses, OR import from a shared source-of-truth constant. Avoid duplication.

- **Q7.** Should curator-side QC tooling consume the new `editorialDecomposition.baseStatus` and `modifierCoverage` signals to drive a backfill report? Beyond Phase 5 scope but a natural downstream.

---

## 10. Rollout sketch (sequence, no code)

If Phase 5 is approved as Architecture B1:

1. **Phase 5a — service shape**: implement `EditorialDecomposition` interface and `shapeEditorialDecomposition` function. Wire into `shapeNotationGrammar`. Pass-through fixtures to test composition + null cases. No template change yet.

2. **Phase 5b — template render**: add the Editorial decomposition block to `trick.hbs`. Progressive-disclosure rules for low-information cases (Q1). Add CSS hooks.

3. **Phase 5c — tests + coverage**: integration tests for the seven failure-mode cases (F1–F8). Update audit picklist explanations to reference editorial decomposition where relevant.

4. **Phase 5d — re-audit**: regenerate `semantic-audit-notes.md` against the new template; confirm sumo/blur/ripwalk/blurriest/barfly/mobius all surface their editorial decomposition; confirm no regression on parser-derived blocks.

5. **Phase 5e — coverage report (optional)**: emit a curator-facing summary of rows whose editorial decomposition shows incomplete modifier coverage or broken upstream links. Feeds future editorial-data backfill.

Each sub-phase is a separate approval-gated artifact. No implementation begins without explicit Phase 5 approval.

---

## 11. Recommended decision

**Approve Architecture B1 (strict editorial decomposition layer) for Phase 5 implementation.**

Reasons:
- Closes the largest remaining audit finding (§4 candidate-core ambiguity, §3 misleading "exact" semantics, §12 editorial metadata help) with the least architectural risk.
- Preserves all parser-independence invariants (§7).
- Creates a structured editorial layer the codebase can build on — Phase 6 confidence layering (Architecture D) becomes a natural extension.
- Surfaces real editorial-data gaps (modifier-link sparseness, broken upstream links) without inventing data.
- No new Red consultation, no new tricks, no asserted-ADD changes.

**Reject Architecture C (parser hints) permanently.** Document the rejection in this proposal so future iterations don't revisit it without explicit reasoning.

**Park Architecture D (confidence layering) for Phase 6+** as the natural follow-on once the editorial layer in B is operational and the codebase has experience with the two-layer view.

---

## Cross-references

| File / Path | Role |
|---|---|
| `exploration/freestyle-notation-grammar/PROPOSAL.md` | Phase 1–2 grammar shape; the parser-pure baseline |
| `exploration/freestyle-notation-grammar/PHASE_2_5_REFINEMENTS.md` | Two-layer descriptive/contributing split; status vocabulary |
| `exploration/freestyle-notation-grammar/SEMANTIC_AUDIT_FINDINGS.md` | The audit findings Phase 5 closes (§3, §4, §12, §16) |
| `legacy_data/inputs/curated/tricks/CANONICALIZATION_POLICY.md` | §3 ADD-math conflict protocol; §7 expert-override protocol; §10 productive multiplicity |
| `scripts/parse_freestyle_notation.py` | The parser whose purity Phase 5 preserves |
| `src/services/freestyleService.ts` | Where `shapeEditorialDecomposition` would live |
| `src/views/freestyle/trick.hbs` | Where the new block would render |
| `database/schema.sql` | `freestyle_tricks`, `freestyle_trick_modifier_links`, `freestyle_trick_modifiers` schemas |
