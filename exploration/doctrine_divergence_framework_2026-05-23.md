# Doctrine-Divergence Framework
**Date:** 2026-05-23
**Status:** Design note — no implementation in this slice
**Builds on:** `exploration/pb_semantic_ratification_findings_2026-05-23.md`, `exploration/red-consolidation/SEMANTIC_COMPRESSION_DOCTRINE.md`, `exploration/composite_modifier_expansion_framework_2026-05-22.md`

---

## §0. Context and posture

The PB semantic-ratification pass revealed that the parser is mature — vocabulary closes 17 of 30 single-reading PB rows — but **none of those 17 rows converge with their PB-source ADD claim**. The disagreement is no longer mechanical; it is **scoring doctrine**.

Three foundational doctrines coexist in the corpus:
1. **Executable IFPA derivation** — the parser's modifier × base math; what `derived_add` computes; the audit's source of truth.
2. **PassBack community scoring** — the ADD totals players documented at competition and in dictionaries; treated as authoritative within the PB community.
3. **Red-adjudicated rulings** — Red Husted's curator-canonical decisions; treat as IFPA-authoritative when they conflict with parser-derived totals.

These three systems mostly agree. When they don't, the corpus needs a **first-class concept of doctrine divergence** rather than treating disagreement as a parser bug, a data error, or a doctrine block.

**Posture for this design slice:**
- Preserve the zero-mismatch invariant. Divergence is a tagged-row state, not an audit failure.
- Preserve parser trustworthiness. The parser keeps deriving what the IFPA grammar produces; divergence rows carry an explicit doctrine tag.
- Preserve readability. Public surfaces stay quiet by default; divergence notes appear on the trick-detail page, not on browse cards.
- Avoid over-academizing beginner surfaces. The Glossary §1 / Landing / browse cards stay free of doctrine debate.
- No mass-promotion until the framework lands.
- Curator-governed and reversible (TS content modules per `feedback_reversible_content_governance`).

**No code changes in this slice.** The deliverable is this document.

---

## §1. Findings recap

From `exploration/pb_semantic_ratification_findings_2026-05-23.md`:

- 67 PassBack folk-name entries in `OBSERVATIONAL_TRICKS`.
- 30 single-reading + non-null-total rows survive the first two filters.
- 17 of those 30 close the parser (modifier+base vocabulary stable; base canonical).
- **0 of 17 converge with the PB-claimed total.** Every row's IFPA-derived ADD exceeds the PB claim by 1, 2, 3, or 5 ADDs.
- Recurring pattern: gap is always **positive** (IFPA derives more than PB scores). Suggests systematic implicit-operator pickup in IFPA readings that PB's literal decomposition doesn't capture.

This wave's job: build the framework that lets these rows publish without violating invariants.

---

## §2. Part A — Doctrine divergence taxonomy

The user-proposed seven categories overlap. After consolidation, **five categories** are sufficient:

### Category 1 — `exact`
Derived ADD == official ADD == published. The default. Most current first-class slugs. No special rendering; no provenance note.

### Category 2 — `historical-divergence`
A community / external-source ADD (e.g., PB dictionary, FB.org listing) differs from the executable IFPA derivation. **Both systems are stable readings — neither is wrong; they apply different conventions.**

Distinguishing trait: the divergence is **not pending a future ruling**. It's a stable disagreement between two scoring conventions. The IFPA-derived value is the canonical (publishable) ADD; the community source is preserved as provenance.

Example: `blurrage` — PB scores 3; IFPA-derived `stepping(+1) + barrage(3) = 4`. Both readings are valid in their respective systems.

### Category 3 — `doctrine-sensitive`
Official ADD is pending a Red ruling (or analogous external doctrine authority). **Status: temporary.** Currently the audit's `doctrine-sensitive` classification is reserved for slugs in `DOCTRINE_BLOCKED_SLUGS`.

Distinguishing trait: the divergence is expected to **resolve** when Red rules. Trick is not first-class; provenance note explicitly says "pending Red Q6.A" or similar.

Example: `bullwhip` (`wave2_blocked`), `nemesis` (Red-implicit furious composition pending), `surging-*` cluster.

### Category 4 — `folk-compressed`
The slug's name is a folk shorthand for a longer structural reading. The reading itself is curator-canonical; the score follows from the reading. **Orthogonal axis to divergence** — folk-compressed slugs can be `exact`, `historical-divergence`, or `doctrine-sensitive` independently of their compression status.

Example: `mobius` (folk for `spinning torque`), `atom-smasher` (folk for `atomic mirage`), `food-processor` (folk for `blurry blender`). Per `SEMANTIC_COMPRESSION_DOCTRINE.md`.

### Category 5 — `alternate-accounting`
Multiple IFPA-acceptable derivations yield different ADDs for the same slug; the curator publishes a per-slug allowlist or composite-derivation entry. **Different from `historical-divergence`** — both systems are IFPA-internal; the disagreement is between literal grammar and a curator-published carve-out.

Example: `blurry-whirl` — literal grammar gives `blurry(+1) + whirl(3) = 4` (post-Red 2026-05-20 retraction); the MODIFIER_COMPOSITIONS carve-out gives `stepping(+1) + paradox(+1) + whirl(3) = 5`. Both are IFPA-grammar-internal; curator allowlist picks per-slug.

### Categories rejected from the user's proposal

- **"unresolved external ruling"** — folded into `doctrine-sensitive` (subset; same operational semantics).
- **"parser-clean / accounting-divergent"** — describes a *combination* of states (parser-clean is the precondition; divergence is the classification). Not its own category. Use `historical-divergence` or `alternate-accounting` as appropriate.

### Public-facing vs internal-only

| category | public-facing? | rendering |
|---|---|---|
| exact | n/a (no note) | no special rendering; default |
| historical-divergence | **public** | small muted note on trick-detail page, NOT on browse cards |
| doctrine-sensitive | **public** | "pending Red review" badge + brief note on trick-detail |
| folk-compressed | **public** | structural reading on trick-detail (per existing layer architecture) |
| alternate-accounting | mostly **internal** | curator-only QC; surface to advanced section if pedagogically valuable |

### Mutual exclusivity

A slug carries at most one **primary** category, but can layer with `folk-compressed` (which is orthogonal). Examples:
- `blurrage`: `historical-divergence` + parser-clean (current finding)
- `food-processor`: `folk-compressed` + `alternate-accounting` (composite-modifier carve-out applies)
- `bullwhip`: `doctrine-sensitive` (primary)
- `mirage`: `exact` + neutral (default)

### Implementation shape (proposed TS)

```typescript
// src/content/freestyleTrickDoctrine.ts (proposed new module)
export type DoctrineCategory =
  | 'exact'
  | 'historical-divergence'
  | 'doctrine-sensitive'
  | 'alternate-accounting';   // folk-compressed handled separately
                              //   via FOLK_COMPRESSED_SLUGS

export interface DoctrineDivergenceEntry {
  slug: string;
  category: DoctrineCategory;
  publicNote: string | null;   // shown on trick-detail; null = internal-only
  internalNote: string;        // always-internal QC text
  divergentValue: number | null; // the OTHER source's ADD claim
  divergentSource: string | null; // 'PassBack' | 'FB.org' | 'pt6 ruling' | etc.
  relatedRedQuestion: string | null; // 'Q6.A' | 'Q7' | etc.
}

export const DOCTRINE_DIVERGENCE_REGISTRY: ReadonlyMap<string, DoctrineDivergenceEntry>;
```

Single source of truth for divergence metadata. Reversible content module. Renderer consults the registry and surfaces public notes only when present.

---

## §3. Part B — Provenance note system

### Tone guidelines

- **Factual, never apologetic.** "PassBack scores this trick as 3; the IFPA-grammar derivation gives 4." Not: "There's a disagreement..." or "Some sources say..."
- **Source-attributed.** Name the source explicitly. "PassBack," "FB.org /newmoves," "Red 2026-05-20 ruling." Avoid "some sources" or "the community."
- **Brief.** One sentence by default; two if the explanation truly requires it. Provenance notes are not pedagogical essays; that's the glossary's job.
- **Neutral on which system is "right."** Don't editorialize on which scoring is canonical. Present both; note which one the audit/site publishes.
- **Forward-pointing when pending.** If Red Q6.A would resolve the divergence, name it. "Pending Red Q6.A (positional `far` ADD weight)."

### Rendering examples

**Example 1 — `blurrage` (historical-divergence, gap=1)**

```
blurrage — 4 ADD
JOB: stepping > far > barrage
ADD: stepping(+1) + barrage(3) = 4 ADD

[Scoring notes — small italic muted text under the ADD breakdown]
PassBack historically lists blurrage at 3 ADD. The executable IFPA
derivation yields 4 because positional `far` is treated as +0; if
Red Q6.A rules `far = +1`, the published value would revise to 5.
```

**Example 2 — `bullwhip` (doctrine-sensitive)**

```
bullwhip — 5 ADD
JOB: pending Red review
ADD: pending Red review (wave2_blocked)

[Status banner]
This trick's structural decomposition is pending Red Husted's
review. Current ADD value reflects community consensus.
```

**Example 3 — `mobius` (folk-compressed, exact)**

```
mobius — 5 ADD
JOB: spinning > torque
ADD: spinning(+1) + torque(4) = 5 ADD

[Structural reading — separate from divergence notes]
"Mobius" is the folk name; structurally reads as spinning torque
or (deeper) spinning miraging osis.
```

**Example 4 — `food-processor` (folk-compressed + alternate-accounting)**

```
food processor — 6 ADD
JOB: notation pending
ADD: stepping(+1) + paradox(+1) + blender(4) = 6 ADD

[Structural reading]
"Food processor" is the folk name; structurally reads as blurry
blender, which expands to stepping paradox blender.

[Scoring notes]
The `blurry → stepping + paradox` expansion applies to this slug
via the MODIFIER_COMPOSITIONS allowlist (per Red pt8 ratification);
the post-2026-05-20 general `blurry` reading is +1 flat. Both
readings are IFPA-grammar-internal.
```

### Placement strategy

| surface | divergence note rendering |
|---|---|
| Browse cards (`/freestyle/tricks`) | **none** — keep cards clean |
| Trick-detail page | **yes** — dedicated "Scoring notes" section under the ADD breakdown, above the comparative-notation row |
| Glossary | **no** — glossary discusses divergence as a *concept* (in §8 ADD Accounting or a new advanced section), not per-trick |
| Operator board / family pages | **no** — these are reference surfaces, not trick-detail |
| ADD Analysis page | **yes** — aggregate examples can appear here as case studies |
| Records page | **no** — records are about completions, not derivations |
| Search results | **no** |

### Visibility levels (proposed)

Default: provenance notes are always public. But three explicit levels for nuanced cases:

- **`public`** — always visible. Default for `historical-divergence` and `doctrine-sensitive`.
- **`advanced`** — collapsed by default; expand to view. For dense edge cases (composite-modifier MODIFIER_COMPOSITIONS, multi-stopping-depth folk-compressed).
- **`curator-only`** — internal QC; never rendered. For interim notes during curator review.

### When notes appear, when they don't

**Show:**
- Any slug in `DOCTRINE_DIVERGENCE_REGISTRY` with non-null `publicNote`.
- Any slug in `DOCTRINE_BLOCKED_SLUGS` (auto-generate "pending Red review" via the existing block).
- Any slug in `SUI_GENERIS_SELF_TOKEN_SLUGS` carrying a JOB notation difference from canonical reading.

**Don't show:**
- Slugs not in the registry (~99% of canonical slugs). Default = quiet.
- Slugs where the only divergence is a folk-name compression (those use the existing structural-reading layer, not the scoring-notes section).
- Slugs in the `alternate-accounting` curator-published cases unless explicitly flagged `publicNote != null`.

### Anti-patterns

Avoid:
- **"Some sources differ from this value"** — too vague; name the source.
- **Multi-paragraph essays per trick** — that's the glossary's job; trick-detail notes are one or two sentences.
- **Pending Red language on every divergent row** — only use when Red has an open question that would resolve it; don't speculate.
- **Discounting the canonical published value** — the displayed ADD is the canonical (publishable) one; provenance contextualizes, doesn't undermine.
- **Rendering on browse cards** — keeps browse surfaces beginner-clean per `feedback_landing_vs_reference_boundary`.

---

## §4. Part C — Red-queue integration

The PB findings ARE evidence for two existing Red queue questions:

### Q6.A — positional `far`/`near`/`op`/`os` ADD weight

Current state (from `RED_OPEN_QUESTIONS_REFORMULATED.md`): "Does `far` carry +0 ADD universally? If yes, document and lock; the 11 PassBack structural disagreements then point at an implicit operator elsewhere. If no, `far` weight = +1 per case."

**This wave's evidence reinforces the question.** Of the 17 vocab-clean PB rows, the 3 gap=1 rows all contain positional tokens (`far` or `near`):

| slug | PB | reading | gap interpretation |
|---|---|---|---|
| `blurrage` | 3 | `Stepping far Barrage` | if `far = +1`, derivation gives 5 (overshoots PB by 2 — does NOT close the gap). If `far = +0`, derivation gives 4 (overshoots by 1 — Q7-pattern). |
| `predator` | 3 | `Atomic far DLO` | same — `far = +1` gives 5; `far = +0` gives 4 (1-gap). |
| `schmoe` | 2 | `Stepping near Legover` | `near = +1` gives 4 (overshoots by 2); `near = +0` gives 3 (1-gap). |

**Wave-finding revision for Q6.A:** the 1-gap rows do NOT close under either `far=+0` or `far=+1`. The 1-ADD systematic gap survives independently of positional weight. Q6.A's `far=+1` hypothesis does not explain the gap=1 rows; Q7's implicit-operator hypothesis does.

### Q7 — implicit-operator compression

Current Q7: "What is the structural source of the +1 gap between PassBack literal decompositions and IFPA stated values across 11 named compounds?"

Q7's four hypotheses:
- A. PassBack's `far` carries +1 ADD (Q6.A path; this wave's evidence does NOT support).
- B. IFPA's `Atomic X` reads as `Paradox Atomic X` per pt10's `nuclear = paradox + atomic` framing. **This wave's evidence partially supports** — `predator` (`Atomic far DLO`) at gap=1 fits, but `reactor` (`Atomic far Whirl`) is gap=3 and would not close under (B) alone.
- C. IFPA stated values include a 1-ADD "set" or "named-trick" baseline that the literal modifier formula doesn't capture.
- D. IFPA's `Atomic` reading varies by trick (incidental, not systemic).

**Wave-finding contribution to Q7:** the gap pattern broadens (1, 2, 3, 5) suggests **multiple compounding effects**, not a single implicit operator. The 1-gap rows might be the leading edge of Q7's hypothesis (B); the 2-gap and 3-gap rows likely involve additional disagreements (positional + modifier-stacking + named-trick baseline).

### Recurring divergence patterns

Distinct patterns surfaced by the PB findings:

1. **Positional + literal modifier stack (gap=1)** — IFPA reading appears to carry an implicit +1 that PB's literal decomposition skips. 3 rows.
2. **Multi-modifier compositional stack (gap=2)** — IFPA's reading of multi-operator chains is +2 above PB's literal sum. 7 rows.
3. **Atomic-on-rotational compounds (gap=3 cluster)** — when atomic-class modifiers attach to rotational bases AND positional tokens appear, the gap widens. `reactor` (atomic far whirl) and `whirlygig` (stepping far symp whirl) fit this. 6 rows.
4. **Probable data error (gap=5)** — `colossus` outlier; investigate the PB source.

### Strongest evidence rows for new Red queue question

A new question — **Q6.B** or **Q7.E** depending on the project's queue conventions — could capture: *"For multi-operator compounds where IFPA-derivation exceeds PassBack-source by ≥2 ADDs, is the gap explained by (a) `far`/`near` carrying +1 each, (b) implicit paradox absorption per pt10, (c) a multi-effect combination, or (d) PassBack source error?"*

Strongest pilot rows for Red consultation:

- `pandora-s-box` (gap=2; `Gyro Pickup`; no positionals; suggests gyro might be +0 or pickup might be 1 in PB convention).
- `gdlo` (gap=2; `Gyro DLO`; same pattern as pandora-s-box).
- `darkwalk` (gap=3; `Pixie Diving near Butterfly`; multiple modifiers + positional).
- `reactor` (gap=3; `Atomic far Whirl`; atomic-rotational + positional).

These four rows isolate different combinations cleanly and would let Red distinguish between hypotheses without conflating effects.

### Cross-cutting Red queue refinement

The existing Q6.A and Q7 entries in `RED_OPEN_QUESTIONS_REFORMULATED.md` should be refined with this wave's evidence:
- Q6.A — note that the 1-gap rows do NOT close under either positional weight; suggests positional is a smaller effect than Q6.A's original framing assumed.
- Q7 — expand from 11 named compounds to ~25 (including the 17 PB vocab-clean rows); the gap pattern is broader than originally surveyed.

A separate "doctrine divergence" memory entry could capture the framework principle — see Part E memory recommendation.

---

## §5. Part D — Gap=1 pilot evaluation (3 rows)

### `blurrage` (PB:3, derived:4)

| field | value |
|---|---|
| Reading | `Stepping far Barrage` |
| Executable derivation | `stepping(+1) + far(+0) + barrage(3) = 4 ADD` |
| PB claim | 3 ADD |
| Divergence explanation | Most consistent with Q7 hypothesis (B) — IFPA's `Atomic`-class reading or implicit modifier absorption — though blurrage uses `stepping` not `atomic`. Could also be explained by PB treating `stepping` as +0 when it modifies a compound base. |
| Publication risk | **Low.** Gap=1 is the cleanest divergence. If Red later rules `stepping`-on-compound = +0, the published value revises to 3 (matching PB); the revision is small and reversible. |
| First-class promotability | **Yes, conditionally.** The reading is clean, the derivation closes, the divergence is documentable. Publishable as `historical-divergence` with provenance note. |
| Notes-section text | "PassBack historically lists this at 3 ADD; the IFPA-grammar derivation gives 4. The 1-ADD divergence is part of a systemic pattern under Red review (Q7)." |

### `predator` (PB:3, derived:4)

| field | value |
|---|---|
| Reading | `Atomic far DLO` |
| Executable derivation | `atomic(+1 non-rot) + far(+0) + dlo(3) = 4 ADD` (dlo is not in FIRST_CLASS_ROTATIONAL_BASES, so atomic uses non-rotational column) |
| PB claim | 3 ADD |
| Divergence explanation | **Strongest evidence for Q7 hypothesis (B).** `Atomic X` could be implicitly read as `Paradox Atomic X` per pt10 framing; PB's literal `Atomic far DLO` would miss the implicit paradox; gap = +1. If Q7(B) is correct, predator = 4 IFPA-canonical with the implicit paradox accounted for. |
| Publication risk | **Low.** Gap=1; the Q7(B) framing is the leading hypothesis. |
| First-class promotability | **Yes, conditionally.** Same shape as blurrage. Publishable as `historical-divergence`. |
| Notes-section text | "PassBack historically lists this at 3 ADD. The IFPA-grammar derivation gives 4 — possibly via pt10's `nuclear = paradox + atomic` framing, where Atomic reads as implicit paradox-atomic in compound contexts (under Red review, Q7)." |

### `schmoe` (PB:2, derived:3)

| field | value |
|---|---|
| Reading | `Stepping near Legover` |
| Executable derivation | `stepping(+1) + near(+0) + legover(2) = 3 ADD` |
| PB claim | 2 ADD |
| Divergence explanation | Q7 implicit-operator pattern (similar to blurrage; the gap survives under both positional-weight hypotheses). |
| Publication risk | **Low.** Gap=1; well-known modifier vocabulary. |
| First-class promotability | **Yes, conditionally.** |
| Notes-section text | "PassBack lists this at 2 ADD; the IFPA-grammar derivation gives 3. The 1-ADD divergence reflects the systematic gap under Red review (Q7)." |

### Pilot governance — gating conditions for promotion

Before any of the 3 publish, the framework requires:

1. **`DoctrineDivergenceEntry` data shape exists** in TS content modules. Without the registry, the renderer has nowhere to read provenance from. This is the prerequisite implementation.
2. **Trick-detail page renders the "Scoring notes" section** with category-aware styling. Per Part B placement; per-trick public notes appear on detail surface only.
3. **Audit script extended to read `DoctrineDivergenceEntry` registry.** When a slug is in the registry with category `historical-divergence`, the audit classifies it as `exact` (not `mismatch`), since the publishable ADD matches the derived value, and the divergence is the documented other-source claim — not a parser error.
4. **Test coverage** — a parity test asserts that divergent rows render their scoring-notes section on trick-detail but NOT on browse cards (the per-surface placement rule).

**Recommendation: defer promotion until the framework above lands** (a separate implementation slice). The 3 gap=1 rows are the pilot batch for the framework's first use.

---

## §6. Part E — Glossary implications

### Movement-language decomposition vs ADD accounting are separable systems

The four-layer architecture (`canonical / educational / symbolic / operational` per `project_glossary_synthesis`) implicitly assumed they cohere — that the structural reading of a trick determined its ADD, modulo Red rulings on edge cases. **The PB findings prove they don't cohere universally.**

Two distinct systems:

| system | what it answers | example |
|---|---|---|
| **Movement-language decomposition** | What the body does (structural reading). | `blurrage = stepping far barrage` |
| **ADD accounting** | How the difficulty score is computed (the math layer). | `stepping(+1) + barrage(3) = 4 ADD` (IFPA) **OR** `3 ADD` (PB) |

The decomposition is a single canonical reading (the curator-ratified structural meaning). The ADD accounting layered on top is **not** uniquely determined — multiple valid scoring conventions can read the same structural decomposition differently.

**This is a deep ontological insight surfaced by the PB ratification pass.** Prior to this wave, the corpus implicitly assumed that publishing a reading implied a single ADD. The reality is more nuanced:
- One reading → one structural meaning.
- One structural meaning → potentially multiple ADD-scoring interpretations (PB / IFPA / Red-adjudicated).

This separability is the foundational justification for the divergence taxonomy in §2.

### Glossary sections affected (analysis only — no rewrite yet)

| section | implication |
|---|---|
| **§1 Movement Basics** | **No change.** Beginner surface; doctrine divergence is far too advanced. Continues to teach "tricks are built from reusable components" without mentioning scoring multiplicity. |
| **§2 Surfaces** | No change. |
| **§3 Dexterities** | No change. |
| **§4 Timing & Sets** | No change. |
| **§5 Trick Families** | **No change** to family-card content. The structural readings are already settled per Red rulings; family classification is unchanged. |
| **§6 Modifiers** | **Future addition** — small note that some modifiers (positionals like `far`/`near`) have ADD weights under active Red review (Q6.A). Brief; not a divergence discussion. |
| **§7 Notation** | No change. |
| **§8 ADD Accounting** | **Primary affected surface.** This is where doctrine-divergence belongs. A future subsection ("Scoring divergences and provenance") would: (a) explain that movement-language decomposition and ADD accounting are separable systems, (b) show the framework taxonomy (exact / historical-divergence / doctrine-sensitive / alternate-accounting), (c) reference Red queue questions Q6.A, Q7. |
| **Advanced Reference Concepts** (current §11 tail) | **Possible new entry** for "Doctrine divergence and provenance." If §8 grows too long, this is a natural overflow surface. |

### What does NOT belong in the glossary

- **Per-trick scoring notes.** Those live on the trick-detail page (per Part B). The glossary discusses the framework; the trick-detail page applies it.
- **Red-queue specifics.** The glossary references the existence of pending rulings but doesn't paste open-question text. That stays in `exploration/red-consolidation/`.
- **The DOCTRINE_DIVERGENCE_REGISTRY data.** That's a TS content module; the glossary explains *why* it exists, not its rows.

### Pedagogical layering

The user warned against "academizing beginner surfaces." The right layering:

1. **Beginner surface (Landing, §1, browse cards)** — movement-language framing only. Scoring is implicit and assumed coherent. No mention of divergence.
2. **Intermediate surface (trick-detail pages, operator board)** — per-trick scoring notes appear only when divergence applies. Most pages stay clean.
3. **Advanced surface (§8 ADD Accounting, ADD Analysis page)** — doctrine divergence introduced as a concept. Framework taxonomy explained. Examples drawn from the real registry.
4. **Curator-internal surface (this doc, Red queue, content modules)** — full taxonomy, per-row classifications, governance.

### When the glossary rewrite should happen

**Not in this slice.** The framework needs to land first (the implementation slice that creates `DOCTRINE_DIVERGENCE_REGISTRY` + renders scoring notes on trick-detail). Once the framework is in production and a handful of rows publish under it, the glossary §8 update gets concrete examples to reference. Sequencing:

1. Ship the framework + registry + trick-detail rendering (separate slice).
2. Publish `blurrage`, `predator`, `schmoe` as the pilot batch.
3. Observe how the divergence notes read in practice. Adjust tone / placement if needed.
4. Then write the glossary §8 addition with real examples to reference.

Writing the glossary update before the framework lands would be premature.

---

## §7. Recommended implementation slice (after this design lands)

**Wave 7: Doctrine Divergence Architecture (post-design)**

1. **New content module** `src/content/freestyleTrickDoctrine.ts` with `DOCTRINE_DIVERGENCE_REGISTRY: ReadonlyMap<string, DoctrineDivergenceEntry>`. Initially empty or carrying the 3 gap=1 pilot rows.
2. **Service-layer integration** — `freestyleService.ts` exposes per-trick divergence metadata on the trick-detail view-model.
3. **Template** — new `trick-detail-scoring-notes` partial; rendered on `/freestyle/tricks/:slug` only; styled muted/small per Part B placement; category-aware (different visual treatment for `historical-divergence` vs `doctrine-sensitive`).
4. **Audit script extension** — read the registry; classify registry-tagged slugs as `exact` (not `mismatch`); add a new audit summary line "doctrine-divergent (tagged): N".
5. **Tests** — assert scoring notes render on trick-detail but NOT on browse cards; assert audit's new classification.
6. **Wave 7-A: ship 3 gap=1 pilot promotions** (blurrage / predator / schmoe) — exercising the new framework end-to-end.

Estimated slice size: ~150 lines of new TS + template + ~5 test cases + 3 RESOLVED_FORMULAS entries + 3 DB inserts + 3 observational removals.

---

## §8. Cross-references

- `exploration/pb_semantic_ratification_findings_2026-05-23.md` — the empirical findings that motivated this framework.
- `exploration/red-consolidation/SEMANTIC_COMPRESSION_DOCTRINE.md` — the 5-class decomposition taxonomy + 4-locution levels + 3-layer architecture this framework sits inside.
- `exploration/composite_modifier_expansion_framework_2026-05-22.md` — parallel framework for composite-modifier carve-outs (per-trick allowlist; same governance model).
- `exploration/red-consolidation/RED_OPEN_QUESTIONS_REFORMULATED.md` — Q6.A + Q7 (the open Red questions this framework's evidence reinforces).
- `exploration/red-consolidation/RED_QUESTION_STATUS_MATRIX.csv` — Red queue tracking.
- `legacy_data/scripts/audit_derived_add_from_notation.py` — the read-only audit that classifies rows; would gain a new `doctrine-divergent` category when the framework lands.
- `feedback_observational_canonical_promotion_cleanup.md` — the 5-step layer-separation pattern; still applies to divergent-row promotions.
- `feedback_reversible_content_governance.md` — TS content modules are reversible; the registry follows the same pattern.

## §9. Posture summary

- **The architecture preserves invariants.** Zero-mismatch (divergent rows reclassify as `exact + tagged`); parser trustworthiness (parser keeps deriving IFPA-canonical values); reversibility (TS content module).
- **The framework names a phenomenon the corpus already exhibits.** Doctrine divergence has been happening since the first Wave 2 ruling that didn't match a community source; the framework formalizes the handling rather than inventing a new concern.
- **Public-facing surfaces stay quiet by default.** Beginner Glossary, Landing, browse cards remain free of doctrine debate. Only trick-detail pages of divergent rows carry the provenance notes, and the prose is short and factual.
- **Red queue is reinforced, not replaced.** Q6.A and Q7 remain the doctrine-resolution channel; this framework documents what to publish *while* those questions are unresolved.
- **The pilot batch (gap=1 rows) defers** until the framework's implementation slice lands. Premature promotion without the registry + rendering would push the audit to either accept mismatches (Path B from the PB findings) or omit divergence notes entirely (loss of source attribution).
- **Movement-language decomposition and ADD accounting are now formally separable systems** in the project's ontology. The structural reading is single-canonical; the ADD scoring is potentially multi-system. This is the foundational ontological result of the PB ratification pass.
