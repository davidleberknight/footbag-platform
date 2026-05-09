# Phase 2.5 — Semantic-parse refinements before production integration

**Status:** Architecture proposal. Pre-implementation. No DB writes, no parser changes, no UI changes.
**Date:** 2026-05-09
**Inputs:** Findings from the prototype suite (`prototypes/README.md`); rotational-escalation audit (this document §3); James-flagged ontology questions.

This is an editorial / architectural pause before Phase 3 production integration. Six task areas resolve the ontology and parser-policy ambiguities the prototypes exposed, so visual work in Phase 3 doesn't paint the architecture into corners.

---

## Executive summary

Five concrete refinements + one audit, in priority order:

| # | Refinement | What changes | What stays the same |
|---|---|---|---|
| 1 | Split `descriptive_roles` vs `add_contributing_roles` | Parse JSON shape grows by one nesting level; D1 self-atom no longer wipes role information | Asserted ADDs untouched; ADD math unchanged |
| 2 | Status vocabulary: 5 distinct values | `exact` splits into `exact_modifier_derived` and `exact_self_atom` | `approximate`, `unresolved`, `policy_dependent` unchanged |
| 3 | Rotational-escalation audit | **No model change yet** — surfaces the circularity for Red review | Modifier-weight table values; computed ADDs |
| 4 | Candidate-core-family editorial architecture | Lightweight YAML metadata + future `/internal/candidate-cores/` URL pattern | Production trick-detail page stays committed to one reading |
| 5 | Parser honesty (re-affirmed) | (Principles, not code) | All current honesty invariants |
| 6 | Revised JSON shape examples | Documentation only | Live parses unchanged until Phase 3 implementation |

**Implementation bias:** every refinement is parser-side or doc-side; none mutate ontology data. Asserted ADDs remain editorially authoritative.

---

## 1. Descriptive vs ADD-contributing roles

### Problem (from prototype suite, P5)

Currently `parse_trick` populates role buckets per-token, then D1 self-atom recognition CLEARS them when it fires. Outcome: a row like `head-stall` loses the information that "head" classified as `unusual_surface` before the atom subsumed it. The parse JSON post-D1 carries only `core_family: [head-stall]` — useful for ADD math, useless for surface-aware visualization.

### Proposed shape

The role buckets split into two parallel layers in the parse JSON:

```jsonc
{
  "descriptive_roles": {
    // Pre-D1 classification. What each token was identified as.
    // Survives D1 self-atom collapse. Used for visualization,
    // semantic filtering, lineage projection. Never feeds ADD math.
    "core_family":      [],
    "set":              [],
    "rotation":         [],
    "modifier":         [],
    "delay_surface":    [],
    "directionality":   [],
    "unusual_surface":  [{"token": "head", "span_start": 0, "span_end": 4}],
    "policy_tokens":    [],
    "unresolved_tokens": []
  },
  "add_contributing_roles": {
    // Post-D1 classification. What feeds compute_formula.
    // Self-atom rows have core_family populated and other buckets empty.
    "core_family": [{"token": "head-stall", "atom_resolved": true}],
    "set":      [], "rotation":   [], "modifier":     [],
    "delay_surface": [], "directionality": [], "unusual_surface": []
  },
  "additive_flags":    ["atom_subsumed_unresolved_tokens"],
  "parse_warnings":    ["inferred_self_canonical_atom"],
  "parser_version":    "2.5",
  // ...
}
```

For modifier-decomposed rows (e.g., `spinning-symposium-whirl`), the two layers are identical (D1 didn't fire) — no information loss.

For self-atom rows, the descriptive layer preserves the per-token classifications and the contributing layer reflects atom recognition.

### Implementation impact

- **Parser:** ~30-line refactor in `parse_trick`. Build `descriptive_roles` from per-token classification; if D1 fires, populate `add_contributing_roles` with the atom; otherwise copy descriptive into contributing.
- **DB:** no schema change. The existing `structural_parse_json` column carries the new nested shape.
- **Backfill:** re-run `parse_freestyle_notation.py --apply` on the 134-row corpus. Idempotent.
- **Risk:** low. Existing JSON consumers (none in production) need to know which layer to read. Visualization reads `descriptive_roles`; ADD QC reads `add_contributing_roles`.

### What this enables

- Head-stall's "head" surface signal renders in the decomposition table, not just the QC panel.
- Cross-family lenses can filter by `descriptive_roles.unusual_surface = [sole]` without missing self-atom rows.
- The "(parser-cleared by D1)" footnote in P5 disappears — the information is preserved.

---

## 2. Status vocabulary refinement

### Problem (from prototype suite, P2 + P5)

Status `exact` currently means both:
- "Math composed cleanly from registered modifiers and matches asserted" (P0: spinning-symposium-whirl)
- "Self-atom row's adds equal itself by construction" (P2: double-leg-over; P5: head-stall)

These are pedagogically distinct. The first is structural confirmation; the second is tautological agreement. Conflating them weakens QC: a parser-coverage report that says "131 exact rows" obscures that ~30 of those are self-atom tautologies, not modifier-derived structural confirmations.

### Proposed vocabulary

Five orthogonal statuses:

| Status | Meaning | Example |
|---|---|---|
| `exact_modifier_derived` | Parse decomposes into modifiers + base; computed_adds matches asserted | `spinning-symposium-whirl` |
| `exact_self_atom` | Parse is a self-atom; computed_adds = asserted by construction (tautology) | `double-leg-over`, `head-stall` |
| `approximate` | Parse decomposes; computed disagrees with asserted | `barraging-osis` |
| `unresolved` | Parse couldn't decompose at all (no core_family) | (zero rows in current corpus) |
| `policy_dependent` | Parse contains policy-bearing tokens; status is set even when math agrees | `quantum`, `shooting` |

Orthogonality: `policy_dependent` and `exact_*` can co-occur conceptually but the policy label takes precedence in reporting (matches Phase-2 behavior).

### Status reporting impact

QC reports become more honest:

```
Phase 2 (current):
  exact            131
  approximate      1
  unresolved       0
  policy_dependent 2

Phase 2.5 (proposed):
  exact_modifier_derived  ~95-105
  exact_self_atom         ~26-36
  approximate             1
  unresolved              0
  policy_dependent        2
```

The split surfaces the dictionary's structural-vs-named-identity composition without changing any underlying data.

### Implementation impact

- **Parser:** small change in main-loop status determination. Check `cf_list[0].atom_resolved` flag → `exact_self_atom`; else if computed == asserted → `exact_modifier_derived`.
- **Schema:** the `add_formula_status` column already accepts arbitrary text (no CHECK constraint per schema.sql line 3620). No migration needed.
- **QC reports:** add new headers / columns to differentiate the two exact bands.
- **Consumers:** anywhere code currently checks `status == 'exact'` needs to update to `status IN ('exact_modifier_derived', 'exact_self_atom')`. There are zero such consumers today (Phase-3 is unwired).

---

## 3. Rotational-escalation audit findings

### Problem (James's flagged concern)

The Phase-2 prototype computed `spinning-symposium-whirl = whirl(3) + spinning(+2 rot) + symposium(+1) = 6` — matching the asserted ADD of 6. But James suspects the correct interpretation is `whirl(3) + spinning(+1) + symposium(+1) = 5`, implying the asserted ADD itself may be inflated by historical convention rather than derived from clean math.

The prototype's behavior is driven by `freestyle_trick_modifiers.add_bonus_rotational = 2` for `spinning`. Whether that registered weight reflects actual freestyle scoring or codified convention is an editorial / Red question.

### Audit data

All `spinning-X` and similar rotation-modifier rows in the active dictionary:

| Slug | Family | Base ADD | Asserted | Computed (current parser) | If +1 universally | Diff |
|---|---|---|---:|---:|---:|---:|
| `spinning-butterfly` | butterfly (non-rot) | 3 | 4 | 4 (+1) | 4 | 0 |
| `spinning-osis` | osis (non-rot) | 3 | 4 | 4 (+1) | 4 | 0 |
| `spinning-torque` | torque (rot) | 4 | 6 | 6 (+2 rot) | 5 | -1 |
| `spinning-whirl` | whirl (rot) | 3 | 5 | 5 (+2 rot) | 4 | -1 |
| `spinning-symposium-whirl` | whirl (rot) | 3 | 6 | 6 (+2 rot) | 5 | -1 |
| `whirling-swirl` | swirl (rot) | 3 | 4 | 4 (+1, no escalation per table) | 4 | 0 |
| `spinning-clipper` | clipper-stall (non-rot) | n/a | 3 | 3 (self-atom) | 3 | 0 |

### Pattern

The data is **internally consistent** with the modifier table:
- `spinning` on rotational bases (whirl, torque) → +2
- `spinning` on non-rotational bases (butterfly, osis) → +1
- `whirling` on rotational bases (swirl) → +1 (the table's `add_bonus_rotational` for whirling is set to 1, not 2 — heterogeneous policy)

But **the consistency is potentially circular.** The asserted ADDs were almost certainly set in the curated CSVs to match whatever modifier-weight model the original curator believed in. The modifier-weight table was almost certainly set to match the asserted ADDs. We cannot independently validate which is correct from this data alone.

### What we don't know

- Whether the `+2 rotational` policy reflects how freestyle scoring actually works in competition, or is a historical convention codified into the dictionary.
- Whether spinning-whirl is "actually" 4 ADD (with the asserted 5 being conventional inflation) or "actually" 5 ADD (with the +2 model being correct).
- Whether the heterogeneity (spinning escalates, whirling doesn't) reflects real mechanical differences or just the order in which the modifiers were initially curated.

### Recommended response

**Do nothing yet.** Specifically:

1. **Do not change `freestyle_trick_modifiers.add_bonus_rotational` weights.** The data supports them; without Red input we lack independent evidence to revise.
2. **Do not change asserted ADDs.** Per CANONICALIZATION_POLICY §3: asserted is editorial truth; computed is diagnostic.
3. **Architectural separation:** introduce two distinct concepts in documentation and (eventually) schema:
   - `rotational_family`: a property of the BASE trick (whirl, mirage, torque, swirl) — describes mechanical rotation in execution.
   - `rotational_modifier_bonus_policy`: a property of the MODIFIER (spinning, swirling) — describes the ADD-escalation rule when applied to a rotational family.
   These were conflated in the original parser. Splitting them lets future Red-driven policy changes affect one without the other.
4. **Build a Red-review packet.** The packet asks one question: "is the +2 rotational escalation for spinning (and swirling) historically calibrated convention or true freestyle scoring?" Possible answers:
   - **A:** convention; collapse to +1 universally; asserted ADDs adjust accordingly.
   - **B:** true scoring; current model is correct; document the rule in CANONICALIZATION_POLICY.
   - **C:** family-specific; some rotational bases trigger escalation, others don't; current heterogeneity (whirling on swirl = +1, not +2) is real.
   - **D:** defer; insufficient evidence for ratification at this time.

**Until Red rules:** add a `rotational_escalation_policy_pending_red` warning on every parse where the +2 rotational rule fires, so the visualization can communicate the uncertainty.

### Implementation impact

- **Parser:** add the warning emission. ~5-line change.
- **DB:** none.
- **QC reports:** the new warning surfaces in `parser_coverage_report.md` (renamed: now also shows policy uncertainty, not just unresolved tokens). 5-7 rows affected.
- **Risk:** zero. We're documenting an open question, not changing behavior.

---

## 4. Candidate-core-family editorial architecture

### Problem (from prototype suite, P4)

The blur prototype demonstrated that some structural decisions belong to editorial review, not to learner-facing trick pages. Specifically, the 5 §13.4 candidate-core-family rows (`blur`, `blender`, `barfly`, `ripwalk`, `stepping-*`) each potentially have alternate readings that would cascade across status, lineage, and policy classification. Showing both readings on a public trick page (as P4 did) overloads information density and confuses non-editorial users.

### Proposed split

Two surfaces, separate audiences:

| Surface | Audience | Commits to one reading? | Path |
|---|---|---|---|
| Trick detail | learners | Yes — current dictionary's reading | `/freestyle/tricks/<slug>` (existing) |
| Candidate review | editors | No — shows both readings + cascade | `/internal/candidate-cores/<slug>` (proposed; deferred) |

Per the existing `feedback_internal_only_constraint.md` memory: review/classification surfaces stay behind `/internal/`. Candidate-core-family review fits this pattern.

### Lightweight metadata structure (no schema change)

Editorial metadata for the candidates lives in a single YAML/JSON file that informs both the eventual review surface and any Red packet:

```yaml
# exploration/freestyle-notation-grammar/candidate_core_families.yaml
candidates:
  blur:
    reading_a:        # current dictionary (committed)
      shape: self-atom
      family: mirage
      status: exact_self_atom
      asserted_adds: 4
      computed_adds: 4
    reading_b:        # alternate ontology hypothesis
      shape: structural-decomposition
      decomposition: [quantum, mirage]
      status: approximate + policy_dependent
      computed_adds: 3   # asserted disagrees by 1
    cascade:           # downstream effects of choosing reading_b
      - row removed from freestyle_tricks; alias added on mirage
      - status changes from exact_self_atom → approximate
      - introduces policy_dependent flag (quantum)
      - mirage family gains 1 alias entry
    red_question: |
      Per Red pt2, "Toe Blur → Quantum Mirage". Should blur be
      reduced to a Common alias on mirage (quantum-set decomposition),
      or retained as its own canonical (current state)?
    red_disposition: pending
  # ... blender, barfly, ripwalk, stepping-* analogous

# Each candidate carries:
#   reading_a:   the current-dictionary reading
#   reading_b:   the alternate (proposed) reading
#   cascade:     bullet list of downstream effects of choosing B
#   red_question: distilled question for Red (one paragraph)
#   red_disposition: pending | answered_a | answered_b | deferred
```

### Implementation impact

- **Schema:** none. No `freestyle_trick_alternate_readings` table. JSON-first per the proposal.
- **File:** create `candidate_core_families.yaml` with all 5 candidates pre-populated. Hand-edited; no parser dependency.
- **Future review surface:** when `/internal/candidate-cores/<slug>` builds, it reads this YAML + the existing parse JSON. Trick-detail page is unchanged.
- **Red packet:** generated from the YAML; a future tool emits a Markdown packet mirroring the down-family-followup format (`red-followup-down-family-2026-05.md`). One question per candidate; cascade tabulated per option.

### What this enables

- Editorial-mode review without polluting public trick-detail pages.
- Red-packet drafting becomes data-driven (read the YAML, render the packet) rather than per-candidate manual work.
- When Red rules, the answer goes back into the YAML; the trick-detail page either stays committed to A or atomically shifts to B based on a single field flip.

---

## 5. Parser honesty (re-affirmed)

No new principles; restatement of invariants the prototype suite reaffirmed:

- **Unresolved ambiguity stays visible.** Tokens that didn't classify get listed in `unresolved_tokens`. The parser does not guess.
- **Policy uncertainty stays visible.** Policy-bearing tokens appear in BOTH their primary role bucket AND in `policy_tokens`. Status flips to `policy_dependent` even when math agrees.
- **Parser limits are explicit.** Phase 2.5 adds the `rotational_escalation_policy_pending_red` warning. This is the third axis of honest uncertainty (after `unresolved_tokens` and `policy_tokens`) — registered modifier weights themselves are subject to Red review.
- **No fake certainty.** Self-atom rows are tagged `exact_self_atom`, distinguishable from `exact_modifier_derived`. The pedagogical difference is not hidden behind a single status value.
- **Asserted ADD remains authoritative.** Computed ADDs are diagnostic; never write to `freestyle_tricks.adds`.

---

## 6. Revised JSON parse examples

Concrete shape illustrations of the post-2.5 parse JSON for each archetype.

### Reference (P0): spinning-symposium-whirl

```jsonc
{
  "descriptive_roles": {
    "core_family":  [{"token": "whirl",    "span_start": 19, "span_end": 24}],
    "rotation":     [{"token": "spinning", "span_start":  0, "span_end":  8}],
    "modifier":     [{"token": "symposium","span_start":  9, "span_end": 18}],
    "set": [], "delay_surface": [], "directionality": [], "unusual_surface": [],
    "policy_tokens": [], "unresolved_tokens": []
  },
  "add_contributing_roles": {
    // identical to descriptive — D1 didn't fire.
    "core_family":  [{"token": "whirl"}],
    "rotation":     [{"token": "spinning"}],
    "modifier":     [{"token": "symposium"}],
    "set": [], "delay_surface": [], "directionality": [], "unusual_surface": []
  },
  "additive_flags":      [],
  "parse_warnings":      ["rotational_escalation_policy_pending_red"],
  "parser_version":      "2.5",
  "parsed_at":           "2026-05-09T...",
  "parse_source":        "name_decomposition",
  // computed_add_formula and computed_adds live on the row, not in JSON.
  // status: exact_modifier_derived
}
```

Key differences from Phase 2: `descriptive_roles` / `add_contributing_roles` split + new `rotational_escalation_policy_pending_red` warning.

### Self-atom (P2): double-leg-over

```jsonc
{
  "descriptive_roles": {
    // Pre-D1: tokens "double", "leg", "over" all classified as unresolved.
    "core_family": [],
    "unresolved_tokens": [
      {"token": "double", "span_start":  0, "span_end":  6, "reason": "not in any registry"},
      {"token": "leg",    "span_start":  7, "span_end": 10, "reason": "not in any registry"},
      {"token": "over",   "span_start": 11, "span_end": 15, "reason": "not in any registry"}
    ],
    "set": [], "rotation": [], "modifier": [], "delay_surface": [],
    "directionality": [], "unusual_surface": [], "policy_tokens": []
  },
  "add_contributing_roles": {
    // Post-D1: atom owns ADD math.
    "core_family": [{"token": "double-leg-over", "atom_resolved": true}],
    "set": [], "rotation": [], "modifier": [], "delay_surface": [],
    "directionality": [], "unusual_surface": []
  },
  "additive_flags":   ["atom_subsumed_unresolved_tokens"],
  "parse_warnings":   ["inferred_self_canonical_atom"],
  // status: exact_self_atom
}
```

The descriptive layer faithfully records that the parser saw 3 unresolved tokens; the contributing layer reflects the atom collapse. Both signals coexist.

### Unusual surface (P5): head-stall

```jsonc
{
  "descriptive_roles": {
    // Pre-D1: "head" classified as unusual_surface, "stall" unresolved.
    "core_family": [],
    "unusual_surface": [{"token": "head", "span_start": 0, "span_end": 4}],
    "unresolved_tokens": [{"token": "stall", "span_start": 5, "span_end": 10, "reason": "not in any registry"}],
    "set": [], "rotation": [], "modifier": [], "delay_surface": [],
    "directionality": [], "policy_tokens": []
  },
  "add_contributing_roles": {
    "core_family": [{"token": "head-stall", "atom_resolved": true}],
    "set": [], "rotation": [], "modifier": [], "delay_surface": [],
    "directionality": [], "unusual_surface": []
    // Note: unusual_surface is empty in contributing layer (atom owns ADD)
    // but populated in descriptive layer (visualization can render it).
  },
  "additive_flags":   ["atom_subsumed_unresolved_tokens"],
  "parse_warnings":   ["inferred_self_canonical_atom"],
  // status: exact_self_atom
}
```

This is the headline P2.5 win: the surface signal survives.

### Approximate ADD (P3): barraging-osis

```jsonc
{
  "descriptive_roles": {
    "core_family": [{"token": "osis"}],
    "modifier":    [{"token": "barraging"}],
    "set": [], "rotation": [], "delay_surface": [],
    "directionality": [], "unusual_surface": [],
    "policy_tokens": [], "unresolved_tokens": []
  },
  "add_contributing_roles": {  // identical — D1 didn't fire
    "core_family": [{"token": "osis"}],
    "modifier":    [{"token": "barraging"}],
    "set": [], "rotation": [], "delay_surface": [],
    "directionality": [], "unusual_surface": []
  },
  "additive_flags":   [],
  "parse_warnings":   ["approximate_add_formula:computed=4,asserted=5"],
  // status: approximate (unchanged)
}
```

### Policy-dependent (P1): hypothetical quantum-butterfly

```jsonc
{
  "descriptive_roles": {
    "core_family":   [{"token": "butterfly"}],
    "set":           [{"token": "quantum"}],
    "policy_tokens": [{"token": "quantum"}],   // orthogonal flag
    "rotation": [], "modifier": [], "delay_surface": [],
    "directionality": [], "unusual_surface": [],
    "unresolved_tokens": []
  },
  "add_contributing_roles": {  // identical
    "core_family": [{"token": "butterfly"}],
    "set":         [{"token": "quantum"}],
    "rotation": [], "modifier": [], "delay_surface": [],
    "directionality": [], "unusual_surface": []
  },
  "additive_flags":   [],
  "parse_warnings":   ["policy_token_encountered:quantum"],
  // status: policy_dependent (unchanged)
}
```

---

## Sequencing — Phase 2.5 implementation order

If James approves the refinements, implementation lands in this order. Each step is independently shippable and reversible.

| Step | Scope | Risk | Estimated effort |
|---|---|---|---|
| **2.5a** | Parser refactor: split `descriptive_roles` / `add_contributing_roles` (Task 1) | Low — JSON shape change; readers updated in same commit | ~30 min |
| **2.5b** | Status vocabulary: split `exact` into `_modifier_derived` / `_self_atom` (Task 2) | Low — text-only change in status field | ~15 min |
| **2.5c** | Add `rotational_escalation_policy_pending_red` warning (Task 3) | Zero — informational only | ~5 min |
| **2.5d** | `--apply` re-run: backfill all 134 rows with the v2.5 JSON shape | Low — UPDATE-only, idempotent | ~5 min |
| **2.5e** | Create `candidate_core_families.yaml` with the 5 candidates (Task 4) | Zero — new doc file | ~30 min |
| **2.5f** | Run regression: full test suite + trick-page rendering | Zero — no production code touched | ~5 min |

Total: under an hour of execution time after approval.

**What does NOT happen in Phase 2.5:**
- No schema changes. The existing Phase-0 columns hold the new JSON shape; the existing `add_formula_status TEXT` column accepts the new vocabulary without migration.
- No production routes. Trick-detail rendering still doesn't consume the parse columns.
- No backfill of asserted ADDs.
- No modifier-weight changes.
- No Red packet sending. The candidate YAML and the rotational-escalation packet are drafted; sending is a separate workstream.

---

## What this phase deliberately does not address

Honest scope log:

- **Multi-policy-token rows.** Single policy-token cases observed; compound (e.g., quantum + nuclear) untested. Defer until Red ratifies the existing single-policy questions.
- **Multi-rotation rows.** No row in the dictionary stacks two rotations. Architecture supports it; not exercised.
- **Direction-structural rows beyond `back`.** P0 shows `(back)` notation-side; canonical-name `rev-X` rows resolve via D1. A 6th prototype could test this if Phase 3 needs the validation.
- **Empty-family rows.** Every prototype has a populated lineage. A 1-member-family row's lineage section may render awkwardly.
- **Production CSS palette + WCAG audit.** Deferred to Phase 3.
- **Handlebars partial integration.** Phase 3.

---

## Cross-references

- `exploration/freestyle-notation-grammar/PROPOSAL.md` — the architectural baseline (§13 decision log).
- `exploration/freestyle-notation-grammar/prototypes/README.md` — the prototype suite that surfaced these refinements.
- `legacy_data/inputs/curated/tricks/CANONICALIZATION_POLICY.md` — §3 ADD-math conflict protocol; §10 productive multiplicity.
- `.claude/skills/footbag-freestyle-dictionary/SKILL.md` — direction-is-structural rule; surging modeling rule.
- `legacy_data/inputs/curated/tricks/red-followup-down-family-2026-05.md` — template for future Red packets.

---

## Decision request

Phase 2.5 is one decision: **proceed with steps 2.5a–2.5f as specified, or revise scope first.**

If proceed: I implement 2.5a–2.5d (parser changes + backfill), draft 2.5e (YAML), confirm 2.5f (regression). Output: re-runnable parser, refreshed JSON shapes in DB, candidate-core-family metadata file, no UI / production / schema changes.

If revise: tell me which task to drop or rewrite. The most controversial proposal is Task 3 — adding the `rotational_escalation_policy_pending_red` warning surfaces a question we may not be ready to answer; if so, drop the warning and keep the architectural-separation framing in this doc only.
