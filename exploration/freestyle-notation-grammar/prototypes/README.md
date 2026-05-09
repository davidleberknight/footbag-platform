# Notation-grammar prototype suite — comparative summary

5 stand-alone HTML prototypes stress-testing the structural-parse architecture across deliberately ambiguous, policy-bound, and edge-case archetypes. Self-contained (shared CSS only). No app integration, no production routing, no parser changes.

## The suite

| # | Archetype | File | Target row | Status |
|---|---|---|---|---|
| 0 | Reference (baseline) | `../prototype-spinning-symposium-whirl.html` | spinning-symposium-whirl | exact, 3 roles, rotational base |
| 1 | Policy-dependent | `01-policy-dependent-quantum-butterfly.html` | quantum-butterfly *(hypothetical)* | policy_dependent (orthogonal flag) |
| 2 | Self-canonical atom | `02-self-atom-double-leg-over.html` | double-leg-over | exact via D1 self-atom |
| 3 | Approximate ADD | `03-approximate-add-barraging-osis.html` | barraging-osis | approximate (computed=4, asserted=5) |
| 4 | Candidate core-family | `04-candidate-family-blur.html` | blur | exact (Reading A) / would change (Reading B) |
| 5 | Unusual surface | `05-unusual-surface-head-stall.html` | head-stall | exact via D1, but role buckets cleared |

Open each in a browser. Read the "Prototype notes" footer per file for the archetype-specific findings.

---

## Which archetypes work best

**P0 baseline (reference) and P3 (approximate ADD) are the strongest fits for the current architecture.** Both produce visual hierarchies that match their semantic content:

- **P0** — clean modifier-stack decomposition, every role bucket carries information, ADD math derives cleanly.
- **P3** — the disagreement between asserted and computed becomes the load-bearing signal of the page; the "three resolution paths" framing turns the Δ into a decision tree rather than a vague flag.

These are the rows where the architecture's investment pays off most — readers extract structural understanding from the visualization that they couldn't extract from the canonical name alone.

---

## Which sections collapse under complexity

**Modifier layering** is the section that suffers most across the suite:

| Prototype | Modifier-layering coherence |
|---|---|
| P0 reference | Strong — three nested boxes with weights stack visibly |
| P1 policy | Medium — works but adds a corner badge that competes with role color |
| P2 self-atom | **Trivial** — one box, no decomposition. Could be omitted entirely |
| P3 approximate | Strong — the Δ vs computed makes the layering pedagogically interesting |
| P4 candidate-family | **Conflicted** — Reading A's trivial atom box vs Reading B's full decomposition; the page shows both |
| P5 unusual surface | **Trivial** — same as P2 |

For self-atom and surface rows the modifier-layering section delivers near-zero content. **Phase 3 should hide it for atom rows** rather than render an essentially-empty box.

---

## Where information density becomes too high

**P4 (candidate-core-family)** is the densest. It carries:

- Two competing structural readings (decomposition table × 2)
- Two competing family lineages
- Cross-list of 4 other candidate-core-family rows (a meta-concept)
- A cascade explanation (one decision, three downstream consequences)

A reader without editorial context likely loses the thread within 30 seconds. **Progressive disclosure becomes necessary here** — by default show Reading A only; "show alternative readings" toggle exposes Reading B + lineage shift + cascade.

P4's information density is the main argument that **disclosure-toggle architecture is required, not optional**, for Phase 3.

---

## Which semantic roles need redesign

| Role | Verdict | Issue |
|---|---|---|
| `core_family` | Stable | Works in all 5 archetypes |
| `set` | Stable | Clean in P0, P1; absent in others |
| `rotation` | Stable | Clean differentiation from modifier via color/weight |
| `modifier` | Stable | But the layering box becomes empty for atoms |
| `delay_surface` | **Underutilized** | Only appears notation-side in P0, P3; no canonical name carries it as a token |
| `directionality` | Single token tested (`back` annotation in P0) | Real test would be `rev-whirl` or `inspinning-X` rows; defer until Phase 3 |
| `unusual_surface` | **Cleared by D1** in P5 | Parser limitation — the surface signal is lost in self-atom rows. Phase-3 parser refinement: preserve descriptive roles separately from ADD-contributing roles |
| `policy_tokens` (orthogonal) | Stable in P1, P4 | The "?" suffix + amber tone reads correctly without overloading |
| `additive_flags` | Carrying load in P2, P5 | Underexposed in the visualization; only shows in QC panel |

**The single biggest parser refinement that would help Phase 3 visualization:** split the parse-output role buckets into two layers — `descriptive_roles` (what each token classified as, pre-D1) and `add_contributing_roles` (post-D1 reductions used for ADD math). The current single-layer model loses surface/modifier information when D1 fires.

---

## Whether progressive disclosure now seems necessary

**Yes, particularly for P4 and any future multi-reading editorial rows.**

The reference (P0) doesn't need disclosure — the page reads cleanly start-to-finish. Same for P2, P5 (atoms — short and decisive). P1 and P3 sit in the middle: information-rich but tractable.

P4 is the breaking point. Two competing readings × two competing lineages × cascade footnotes = roughly twice the information density of P0. A learner reading a candidate-core-family page in production context (without the prototype's "this is exploratory" framing) will assume the visualization commits to one reading. Showing both without commitment requires either:

1. **Progressive disclosure** — hide Reading B behind a toggle; the page commits to A by default.
2. **Editorial-mode flag** — render Reading B only when user is logged in as a curator.
3. **Separate "candidate review" view** — keep the trick-detail page committed to Reading A; expose Reading B comparison in a dedicated `/freestyle/candidate-cores/<slug>` editorial surface.

Option 3 is probably right for production. The trick-detail page is for learners; the candidate review is for editors. Different audiences, different surfaces.

---

## Cross-prototype findings: the parser-architecture issues these surfaced

Three concrete refinements emerged from building this suite that weren't anticipated in the original PROPOSAL:

### 1. D1 self-atom recognition loses descriptive role information

(P5; mentioned in P2 prototype notes)

When D1 fires, the role buckets are cleared. This is correct for ADD math (atoms don't get modifier sums) but loses the descriptive value of knowing "head was classified as unusual_surface before the atom subsumed it." Phase-3 parser refinement: preserve `descriptive_roles` separately. Bug-class severity: **medium** — affects visualization fidelity, not correctness.

### 2. Status `exact` is overloaded

(P2 prototype notes; corroborated by P5)

`exact` currently means both "math derived from modifiers and matches asserted" (P0) AND "self-atom row trivially equals itself" (P2, P5). These are pedagogically different — the first is structural confirmation, the second is tautological agreement. Sub-status proposed: `exact (modifier-derived)` vs `exact (self-atom)`. Bug-class severity: **low** — affects QC reporting clarity, not behavior.

### 3. Candidate-core-family decisions cascade

(P4 — most important finding)

A single core-family ratification doesn't just shift lineage — it can change the row's status (exact → approximate), introduce policy tokens, and remove the row entirely (in favor of an alias). The Red review packet for the 5 candidates needs to make these cascades visible, not just present the ontology question. Phase-3 implication: build the candidate-core-family review surface (option 3 above) BEFORE attempting the actual review. Bug-class severity: **high** — affects how the proposal's §13.4 ratification is conducted.

---

## Recommendation for Phase 3 sequencing

Based on what these prototypes surfaced, the original Phase 3 ordering ("CSS palette + accessibility review + integrate") is too narrow. Suggested re-ordering:

| Step | Was | Recommend |
|---|---|---|
| 1 | CSS palette / WCAG audit | **Parser refinement: descriptive_roles bucket** (P5 finding) |
| 2 | Handlebars partial integration | **Status sub-vocabulary: exact (modifier-derived / self-atom)** (P2 finding) |
| 3 | (deferred) | **Candidate core-family review surface** at `/internal/candidate-cores/...` (P4 finding) |
| 4 | (back to original sequence) | CSS palette / WCAG audit / Handlebars partial / production integration |

Steps 1–3 are parser/architecture refinements that prevent painting Phase 3 visual work into corners. Step 4 onward is the original Phase 3 ordering.

---

## What this suite did NOT validate

Honest gap log — items the suite couldn't test against current data:

- **Multi-policy-token rows.** Only single policy-token cases observed (quantum, shooting). No row with both quantum + nuclear or backside + down. Phase-3 implementation may need to handle compound policy markup.
- **Unresolved-token rows.** The full-corpus parser run produced zero `unresolved` rows after D1. The visualization for an unresolved-status row was not stress-tested. (This is GOOD — the parser closed all gaps — but means we don't know how the UI handles a true unresolved.)
- **Direction-structural rows beyond `back`.** P0 shows `(back)` as a directionality role within the notation. No prototype shows `rev-whirl` or `inspinning-X` where directionality is in the canonical name. Worth a 6th prototype if Phase 3 wants the test.
- **Multi-rotation rows.** No row in the dictionary stacks two rotations (e.g., `spinning + whirling`). The architecture supports it but isn't exercised.
- **Empty-family rows.** Every prototype has a populated family lineage. A row whose family has 1 member (itself) wasn't tested — the "lineage" section may render awkwardly.

These gaps don't block Phase 3 but should be flagged as test cases when production integration begins.

---

**Files in this directory:**

```
prototypes/
├── README.md   ← this file
├── _shared.css
├── 01-policy-dependent-quantum-butterfly.html
├── 02-self-atom-double-leg-over.html
├── 03-approximate-add-barraging-osis.html
├── 04-candidate-family-blur.html
└── 05-unusual-surface-head-stall.html
```

Reference baseline: `../prototype-spinning-symposium-whirl.html`.
