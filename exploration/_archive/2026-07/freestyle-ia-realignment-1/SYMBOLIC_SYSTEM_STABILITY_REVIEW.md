# Symbolic System Stability Review — SYMBOLIC-SYSTEM-STABILITY-REVIEW-1

Generated 2026-05-14. Architectural maturity review. NOT a roadmap; NOT an implementation plan. The deliverable is an honest assessment of whether the freestyle symbolic system has reached Phase-1 completion.

Constraints respected: no implementation, no parser expansion, no ontology mutation, no doc cleanup, no symbolic expansion, no Wave-2 drafting.

---

## Preamble

The review assesses the freestyle symbolic architecture across 8 axes against an honest standard: not whether the system is impressive, but whether it is **architecturally stable enough that future work is content + governance work, not redesign work**.

A maturity verdict has three possible states (per the user's spec):
1. Still in rapid-foundation phase — frequent structural change; surfaces appearing; governance evolving
2. Entering consolidation phase — structure stable; content + refinement still active
3. Stable long-term architecture — additive growth only; external constraints are primary blockers

The review's job is to argue which state best describes the current system.

---

## A. Strongest architectural successes

### A1 — Compact symbolic-object primitive achieved cross-surface uniformity

Same primitive (`#slug` / `≡ reading(s)` / notation / ADD chip) renders identically across landing Core Tricks, glossary §3 compression-flow, and dictionary browse cards. Visual + semantic unification both achieved. The CSS `::before { content: '#' }` injection on `.dict-card-title` solves slug-form display without HTML change. This was the architectural breakthrough of Batch 4 + CSR S1+S2+S3.

A trick like `torque` is the same object everywhere. The user catches this once and pattern-recognition starts working across all surfaces. Validated by FBORG-AUDIT-1 finding that ~24% of cards render `≡` readings — the threshold for compositional-family recognition (surging-X, atomic-X, pixie-X, miraging-X) being visible to a scanning reader.

### A2 — Two-surface contract formalized and structurally enforced

Canonical compact surface (browse layer) vs expanded narrative surface (per-trick page) is now formally documented in `docs/VIEW_CATALOG.md §6 section-conventions` (EXP-1). The boundary holds structurally: dictionary cards expose no prose slot in the view-model; expanded pages carry narrative without re-rendering the compact card.

The forever-rule "**prose / learning notes / execution walkthroughs / historical context belong on the expanded surface only; they must not drift onto compact browse cards**" is short, memorable, and load-bearing.

### A3 — Restraint-first governance fabric is operating correctly

Six interlocking pillars (per `WAVE_2_CONSOLIDATION_INDEX` PART G):
- Publication contract (six-requirement gate for canonical promotion)
- Restraint-first principle (frequency-not-authority + reversible-content-governance)
- Two-surface contract
- Stopping-depth philosophy
- Red consultation methodology (consolidate-before-send)
- Audit-source corpora (evidence ≠ canon)

Validated by recent slices: NR-1 added 17 chain entries WITHOUT touching Wave-pending operators; NR-1B added pendulum + squeeze WITHOUT inventing decompositions; FBORG-AUDIT-1 surfaced 43+ candidates WITHOUT bulk-promoting any; NR-1C surfaced ONE entry (gauntlet) as the maximum reasonable ship-now scope.

The governance system **refuses to bulk-promote evidence into canon**. That refusal is the architecture working as designed.

### A4 — Curator-content modules are the right governance pattern during ontology refinement

`freestyleSymbolicEquivalences.ts` + `freestyleAliasGovernance.ts` together demonstrate that **TypeScript content modules over SQL taxonomy migrations** is the right pattern while Red rulings are still landing. Maintainer-direction 2026-05-14 made this explicit (encoded in `feedback_reversible_content_governance`).

Reversibility, auditability, restraint, per-entry curator reasoning preserved in file comments — these properties hold without DB-schema commitment. SQL formalization comes AFTER ontology stabilization, not during.

### A5 — Stopping-depth philosophy held under the highest-ADD pressure tested

Gauntlet (7 ADD) renders two readings (`blurry ducking torque` + `stepping ducking paradox torque`) — neither over-expands. Mobius (5 ADD) renders three readings at three stopping depths — all canon-locked. Even at ADD 9 (Big Apple Sauce in FM corpus), the proposed chain reading `spinning paradox miraging symposium torque` stops at locked operators.

No recursive auto-expansion has been introduced anywhere. The rule "stop at any token in CORE_TRICKS or any intermediate operator" remains the practical guide. Architecture verified to scale into ADD-8/9 without structural changes (per `SYMBOLIC_COVERAGE_ROADMAP.md` PART H).

### A6 — Audit-source corpora pattern works at evidence-without-canon scale

`reference_legacy_move_sets` (Chris Holden compilation) and `reference_fborg_newmoves_list` (newmoves list elevated this session) both demonstrate: corpus-level evidence can be cited, mined, and audited WITHOUT becoming canonical authority. FBORG-AUDIT-1 produced 374 lines of structured findings from a 254-row corpus + 43+ FM-sample entries without proposing any bulk imports.

The line between "documented evidence" and "canonical truth" is clear and stays clear.

---

## B. Remaining weak points

### B1 — Glossary §3 mobius-flow dual-source maintenance burden

The `glossary.hbs §3` symbolic-compression-flow renders mobius's readings as hardcoded markup; the dictionary card consumes the chain registry. Both currently agree, but they're parallel sources. If the chain registry's mobius readings change, the glossary §3 cards continue rendering stale content.

Severity: low. Mitigation already exists in `NOTATION_RECONCILIATION_AUDIT.md` PART 5 (NR-4 deferred slice — refactor §3 to consume registry).

### B2 — DB `is_core` drift vs curator-canonical atom registry

Three persistent items per CSR-1 audit:
- pixie (`is_core=1` in DB) — should be 0 per Batch 1 ruling
- fairy (`is_core=1` in DB) — should be 0
- guay (`is_core=1` in DB) — pending review per maintainer 2026-05-14 ("do not silently promote, do not silently delete")
- orbit (row absent in DB) — should exist with `is_core=1`

Severity: low-moderate. CSR S4 + S6 (curator-authored SQL migrations) deferred. The drift is contained — public-facing foundational-tricks list at 11 is correct; DB columns serve internal queries only.

### B3 — Operational-notation 144-row coverage gap

16 of 160 active tricks have `operational_notation` populated. The 144-row gap is the largest raw-numbers coverage hole. Per `SYMBOLIC_COVERAGE_ROADMAP.md` PART B6, the priority subset (14 chain-registered compounds lacking operational notation) is a ~7-hour curator workstream.

Severity: low. The rendering layer treats absence honestly ("Notation pending" italic placeholder). No architectural fix is owed; the gap is curatorial workload.

### B4 — Wave-1 reply timing is external

The system has ~10-15 chain-registry entries blocked on Wave-1 ruling (blurry-*, fury, food-processor, witchdoctor). All are honest-pending; none drift the canonical surface. But progress on those depends on Red's reply cadence — not on the codebase's readiness.

Severity: not a system weakness; an external dependency. Already mitigated by the honest-pending UX (cards render `[—]` chip with footnote).

### B5 — Modifier-reference dl render-disabled state (longstanding)

The `glossary.hbs §3 modifier-reference dl` (lines 121–136) is render-disabled per `feedback_modifier_public_visibility` 2026-04-30. Its entries (`term-stepping`, `term-paradox`, etc.) serve as cross-link anchors only — readers don't see them rendered. The state is quirky but documented.

Severity: low. The quirk is preserved deliberately. Future re-enable would require curator approval.

---

## C. Unresolved conceptual tensions

### C1 — NF-2A operator-reference vs NF-2B chain registry boundary

The two registries serve distinct purposes:
- **NF-2A** (`freestyleOperatorReference.ts`): documents OPERATORS (atomic, blurry, quantum, nuclear, barraging, furious, whirling, double, high, inspinning) with one-line meaning + decomposition + worked example + pending flag
- **NF-2B** (`freestyleSymbolicEquivalences.ts`): documents TRICK DECOMPOSITIONS (mobius → spinning ss torque + ..., gauntlet → blurry ducking torque + ...) with multi-reading chains

The boundary is mostly clear, but edge cases exist:
- Is `surging` an operator (NF-2A entry) or a curator-authored stopping point (NF-2B token)? Today: surging is referenced in chain readings (NR-1 `surge`, `venom`, `surreal`, etc.) BUT has no NF-2A entry. Q4 batch pending.
- Could a future entry blur the boundary? E.g., the proposed Wave-2 Theme 9 operators (Motion, Nova, Rake, Floating, Warping) would need NF-2A entries IF promoted, but they appear in chain-registry candidate readings already.

Severity: low. The two-registry model handles edge cases via the file-header rule "stop at any intermediate operator (atomic / blurry / quantum / nuclear / barraging / furious / double / whirling / high)" + curator-authored extensions. The list of intermediate operators isn't formally enforced anywhere (it's a file-header convention) — that's the soft tension.

### C2 — Cross-corpus naming disagreements as evidence-not-conflict

The gauntlet case (FBORG: Stepping Ducking Paradox Torque; FM: Blurry Ducking Torque; DB: Stepping Ducking Paradox Torque) demonstrated that two corpus sources can disagree on a trick's decomposition string without conflicting on its identity. Per pt11 Blurry = Stepping Paradox, both readings are equivalent at different stopping depths.

Tension: the system treats this gracefully (chain registry surfaces both readings as a single trick's chain), but future cases may not resolve so cleanly. A corpus that names a trick with a decomposition that DISAGREES with canon (rather than just being a shorter expression of it) would be a real conflict.

Severity: low today, latent. Mitigation: chain-registry curatorConfirmPending flag honest; new readings always cite pt-source.

### C3 — The 144-row operational-notation backfill incentive vs restraint posture

The notation-reconciliation audit identifies a clear opportunity: backfill operational notation for the 14 chain-registered compounds + 8 body-stalls + 2 sui-generis primitives + ~20 canon-locked compounds in Category E. That's ~44 rows of safe additive backfill work.

But: the restraint posture says "don't bulk-update without curator review." So the work is curator-content workload, not a sprint.

Tension: substantive coverage gap vs governance restraint. Resolution: the gap stays as long as curator bandwidth is limited. Each row backfill is a curator decision; each correction-CSV row carries a source_note. Slow growth IS the design.

Severity: low. The tension is between "want to fill the gap" and "want to do it correctly." Restraint wins; gap closes incrementally.

### C4 — "Atom" status: 11 (public) vs 12 (curator) vs 13 (DB)

Three different counts:
- **11**: public-facing foundational-tricks list (post-Batch 1; clipper/mirage/legover/pickup/illusion/whirl/butterfly/swirl/osis/around-the-world/orbit)
- **12**: curator-canonical atom registry (per `project_freestyle_core_atoms`; adds toe-stall to the 11)
- **13**: DB `is_core=1` rows (curator-canonical + drift items pixie/fairy/guay)

Each count is internally correct for its purpose, but the divergence creates conceptual friction. A maintainer reading three numbers needs three explanations.

Severity: low. The semantics are well-bounded (`feedback_phased_scope_control` accepts deliberate divergences). The user's 2026-05-14 ruling on guay (review/pending; not promote, not delete) further preserves the divergence intentionally.

### C5 — Two new audit corpora elevated; one not yet formalized

`reference_fborg_newmoves_list` (footbag.org/newmoves/list) was formally elevated this session. `footbagmoves.com` was promoted to "secondary comparison source" status during FBORG-AUDIT-1 but hasn't received its own reference memory entry yet.

Tension: the audit-source pattern is right; coverage isn't yet complete. `SYMBOLIC_COVERAGE_ROADMAP.md` PART B4 flags this as a concurrent low-cost work item.

Severity: low. One memory entry away from parity.

---

## D. Governance stress points

### D1 — Curator manual-edit pattern at scale

Chain registry today: 37 entries. Roadmap ceiling estimate: ~100-120 entries. The pattern of manual TypeScript edits with per-entry curator reasoning is sustainable today and bounded by the realistic ceiling.

Stress point: if Wave-1 + Wave-2 rulings unblock ~25-30 new entries in a single batch, the curator review workload is real. Possible mitigation: stage curator-review in slices of 5-10 entries each (consistent with NR-1's 17-entry batch).

Severity: low. Pattern proven viable through NR-1.

### D2 — Promotion-pressure from corpus mining

Once a curator scans 254 FBORG rows + 569 FM rows, the natural pull is to promote many. The publication contract's six-requirement gate is the only structural defense.

Stress point: the audits surface dozens of "obviously promotable" candidates. The temptation to bulk-process them is real. FBORG-AUDIT-1 deliberately recommended ONE ship-now slice (NR-1C gauntlet) as a restraint demonstration.

Severity: moderate. The architecture WORKS; the human discipline to use the architecture as-designed is the load-bearing constraint.

### D3 — Wave-N packet consolidation discipline

Per `project_red_consultation_state` consolidate-before-send methodology: any new Red question must check against RED_RESOLVED_CANON.md + RED_QUESTION_STATUS_MATRIX.csv before drafting. Wave-1 demonstrated that ~40% of historical Red questions had been already-resolved through interim rulings.

Stress point: if Wave-2 drafting begins before Wave-1 reply lands, the same risk recurs. The architecture handles this (consolidate-before-send is the rule; Wave-2 send is gated on Wave-1 reply review).

Severity: low. Pattern documented in memory; the maintainer's 2026-05-14 ruling reinforces it.

### D4 — Implementation-state-language hygiene in canonical docs

Per `doc-governance.md`: VIEW_CATALOG / SERVICE_CATALOG / USER_STORIES / DESIGN_DECISIONS / DATA_MODEL must describe target patterns, not implementation status. Six doc-sync passes this session (Batches 1-4, CSR-1, EXP-1) consistently respected this — no slice tracking, no "Last updated" headers, no deviation language leaked into canonical docs.

Stress point: future contributors may not internalize this rule. Mitigation: `doc-governance.md` is loaded by the doc-sync skill; explicit checks happen on every doc-sync invocation.

Severity: low. Process is robust.

---

## E. Ontology stress points

### E1 — Wave-1 pending questions affecting ~10-15 chain candidates

Q1 (rotational bonus), Q1c (furious non-rotational), Q2 (Q4 FM-vocab batch), Q3 (positional weights), Q4 (atomic-set polysemy) collectively block: blurry-whirl, blurry-torque, barraging-osis, food-processor, fury, several venom-cousin readings, Q4-modifier-led compounds.

Stress point: external dependency. No internal action can resolve these.

Severity: nominal. The honest-pending UX pattern (no chain entry until ruled) handles this without architectural compromise.

### E2 — Wave-2 themes affecting ~10+ canonical-promotion candidates

Theme 6 (down-family) blocks Cold Fusion, Spinning Symposium Down Double Down, Superdeeduperfly, Your Mom, Your Sister, etc. Theme 2 (focus-trick set) blocks Witchdoctor/Frigidosis/Scrambled Eggbeater. Themes 9-10 (new operators + math discrepancies) surfaced from FBORG-AUDIT-1.

Stress point: Wave-2 reply timing is external. Drafting can proceed in parallel.

Severity: nominal. Same pattern as E1.

### E3 — New-operator promotion pressure (Motion, Nova, Rake, Floating, Warping, Alpine-as-mod, Zulu-as-mod)

FBORG-AUDIT-1 surfaced these via FM-corpus mining. Each is a Q4-batch-style ontology question. Promoting any without Red ruling expands NF-2A.

Stress point: 6+ named operators surfaced; the temptation to promote some "obviously canonical" ones is real. The architecture refuses (NF-2A entries require pt-citation).

Severity: moderate. The architecture WORKS but requires curator discipline to leave them out of NF-2A until Wave-2 resolves them.

---

## F. Readability / UX stress points

### F1 — Pattern-recognition saturation at higher ≡-density

When the dictionary's `≡` coverage approaches 35-40% of cards (vs today's 24%), the sigil becomes more wallpaper than signal. The risk threshold is real but not crossed today.

Mitigation: restraint at the chain-registry layer. Only canon-locked readings surface; speculative readings stay out. The architecture's restraint posture IS the mitigation.

Severity: low today. Watch threshold: when Wave-1 reply + NR-1D + further canonical promotions push ≡-coverage past 50%.

### F2 — High-ADD card height variance on mobile

A 9-ADD compound like Carousel (if promoted) with 3 chain readings + operational notation renders an 8-line card on a 320px viewport. Asymmetric card heights are the intended visual signal (complexity at a glance), but the variance grows as high-ADD canonical coverage grows.

Mitigation: typography + spacing + VIS-TUNE-1's overflow-wrap safety net. The card grid auto-flows; tall cards don't break layout.

Severity: low. The architectural choice (asymmetric card heights signal trick complexity) is correct.

### F3 — `[UNS]` and other curator-introduced op-flag accumulation

NR-1B introduced `[UNS]` as a curator-authored operational flag for squeeze. Rendering treats it as an unknown-role token (graceful). If 5+ similar flags accumulate, the glossary §9 component-flags dl needs maintenance.

Severity: very low. One flag today. Watch threshold at 3+ unfamiliar flags.

---

## G. Maintenance-mode assessment

A system is "in maintenance mode" if:

| Criterion | Met today? |
|---|---|
| Architecture is stable; new work is content + governance, not redesign | ✓ Yes |
| Visual/UX layer doesn't require fundamental changes | ✓ Yes |
| Governance fabric is documented and operating | ✓ Yes |
| External dependencies (Red rulings) are bounded; not blocking architectural progress | ✓ Yes |
| Future work has clear paths (consolidation index documents 5 lanes) | ✓ Yes |
| Curator workflow is sustainable at current + projected scale | ✓ Yes (within ceiling estimate) |
| Cross-surface consistency is enforced structurally | ✓ Yes |
| Restraint posture is documented and validated | ✓ Yes |

All 8 criteria met. The system is **architecturally in late-consolidation / early-maintenance**.

What would push it out of maintenance mode?

- Wave-1 or Wave-2 rulings that invalidate large portions of the chain registry (unlikely; Red rulings have been consistently locked-in-amber)
- A new browse-surface requirement that doesn't fit the compact-symbolic-object pattern (unlikely; no such requirement on the horizon)
- A successor parser that integrates auto-decomposition (explicitly forbidden by current governance)
- A bulk-import contract change with another corpus (forbidden by restraint posture)

None of these are imminent. The architecture is settled.

---

## H. Explicit verdict

**The freestyle symbolic system has entered stable long-term architecture.**

Subordinate findings:

1. **Phase 1 is complete.** The IA realignment (Batches 1-4) + CSR-1 (S1+S2+S3) + EXP-1 + CSR-2 (NR-1, NR-1B, NR-1C, VIS-TUNE-1, FBORG-AUDIT-1) sequence delivered a coherent compact-symbolic-object architecture with cross-surface unification, two-surface contract, restraint-first governance, and audit-source corpora methodology. The shape is locked.

2. **The current state is best characterized as late-consolidation / early-maintenance.** Architectural decisions are made; future work is additive within established structures. The 5 enrichment lanes in `SYMBOLIC_COVERAGE_ROADMAP.md` PART B are content + curator workload, not architectural redesign.

3. **Remaining work is bounded and external-dependent.** Wave-1 reply integration, Wave-2 packet drafting + send, curator-content backfill of the 144-row operational-notation gap, ~6 small deferred slices (CSR S4/S5/S6 + NR-2/NR-3/NR-4/NR-5). None require structural change.

4. **The governance fabric is the load-bearing constraint going forward, not the architecture.** The six pillars (publication contract, restraint-first, two-surface, stopping-depth, Red consultation, audit-source corpora) are interlocking and documented. Disciplined adherence to them — by curator + maintainer + future contributors — is what keeps the system from drifting.

5. **No major architectural redesign pressure exists.** The conceptual tensions identified in PART C are minor / well-bounded / handled gracefully by existing patterns. None of them require fundamental change.

6. **The pacing rhythm has shifted.** From rapid-foundation work (multiple slices per session, many surfaces in flight) to consolidation rhythm (one focused slice per session, careful scope, restraint-driven). This rhythm is sustainable and matches the maturity level.

7. **External constraints (Red ruling cadence) are the primary pace-setter going forward.** Internal capacity exists for Wave-2 drafting and curator-content backfill. External readiness is the gate.

**Verdict (explicit, per spec):**

**STABLE LONG-TERM ARCHITECTURE.** The symbolic system has reached Phase-1 completion. The next phase is governance-led, curator-paced, content-additive growth within the architecture established by this session's work + the prior DSC-2 / UX-SHIP-1 / SG / GG efforts. No architectural rebuild is on the horizon. The system is mature enough for slower, curator-led growth.

---

## I. What this verdict does NOT claim

To avoid overclaiming:

- The system is not "complete" — many compounds remain unrepresented; coverage gaps are real
- The system is not "finished" — Wave-1 + Wave-2 rulings will unblock new entries; curator content work continues
- The system is not "perfect" — minor tensions in PARTS C-F remain; small deferred slices exist
- The system is not "frozen" — additive growth is expected and welcome

What the verdict DOES claim:

- The SHAPE is locked
- The GOVERNANCE is documented and operating
- The PACE is sustainable
- The future work is well-scoped
- No architectural redesign pressure exists
- The maintainer can confidently shift attention to curator-led growth and Red consultation

---

## J. What this review changes

Nothing. This review is observational. The verdict informs whether the next major investment should be in "more foundation" (no) or "curator-paced growth" (yes), but it does not propose specific work.

Per the spec's constraint set: no implementation, no parser expansion, no ontology mutation, no doc cleanup, no symbolic expansion, no Wave-2 drafting. The review's job ends at the verdict.

---

## Cross-references

- `FREESTYLE_IA_REALIGNMENT_PLAN.md` — Batches 1-4 + PART H-pre compact-object rule
- `GLOSSARY_PEDAGOGY_REALIGNMENT_PLAN.md` — Batch 3 pedagogy
- `COMPACT_SYMBOLIC_OBJECT_VISUAL_REFINEMENT_PLAN.md` — Batch 4 typography
- `CANONICAL_SURFACE_REALIGNMENT_PLAN.md` — CSR S1-S7
- `COMPACT_SYMBOLIC_BROWSE_PLAN.md` — EXP-1 two-surface formalization
- `NOTATION_RECONCILIATION_AUDIT.md` — pre-NR-1 audit
- `SYMBOLIC_SURFACE_QA_REVIEW.md` — post-NR-1 QA review
- `FBORG_AUDIT_1_REPORT.md` — high-ADD corpus audit
- `SYMBOLIC_COVERAGE_ROADMAP.md` — long-range governance review
- `WAVE_2_CONSOLIDATION_INDEX.md` — ecosystem orientation index
- [[project_symbolic_ux_rollout]] — master state pointer (current 2026-05-14)
- [[project_red_consultation_state]] — Red consultation surface
- [[project_canonical_trick_publication_contract]] — six-requirement promotion gate
