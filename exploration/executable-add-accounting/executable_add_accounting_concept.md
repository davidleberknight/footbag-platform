# Executable ADD Accounting — Concept

**Status:** Planning artifact. Future-feature exploration; no implementation in scope. Treat any code paths, file names, or render shapes named below as conceptual proposals subject to curator review.

**Date:** 2026-05-18

---

## Purpose

The freestyle subsystem currently exposes:

- canonical trick notation (compact symbolic shorthand)
- operator decomposition (`/freestyle/operators`)
- resolved formulas + provenance (`/freestyle/add-analysis`)
- modifier-feel cards (glossary §6 Surface A)
- structural parse JSON + `computed_adds` (parser)
- editorial `asserted_adds` (authoritative totals)

What is **missing**: a user-facing surface that explains *why* a trick's ADD value is what it is — that is, the per-component derivation from notation tokens into ADD-bearing contributions.

This document frames a future feature that surfaces **executable ADD accounting** — derivation breakdowns that explain ADD totals component-by-component, without replacing the compact community-aligned shorthand that is primary today.

## The core insight

Symbolic notation already carries the information needed to derive ADD totals. Components like `dex`, `xbody`, `stall`, `spin`, `step`, `mirage`, `pixie`, `paradox`, `symposium`, `ducking` are each one of:

- **ADD-bearing** — contributes +N to the trick's total
- **Surface-bearing** — names the contact surface (toe, clipper, etc.); inherits stall(+1)
- **Structural** — describes topology or motion without contributing ADD
- **Compositional** — combines other components (compressed atoms like `torque` = `mirage-dex + xbody + stall + spin`)

Today this attribution is **implicit** — it lives in the curator's head and in the prose of `freestyleResolvedFormulas.ts`. Making it executable means:

1. Each notation token carries a known ADD contribution (or surfaces a curator-acknowledged unresolved status).
2. The system can render the per-token breakdown alongside the canonical formula.
3. The breakdown can be verified against the editorial `asserted_adds` total.
4. Disagreement between curator-map and parser becomes a diagnostic signal, not silent drift.

## Three framing decisions (locked)

### Decision 1 — Surface architecture: D, sequenced B → C, no A initially

- **Phase 1 (B):** per-trick expandable derivation panel on `/freestyle/tricks/:slug` detail pages. Opt-in, collapsed by default. Renders only when curator-map + editorial agree.
- **Phase 2 (C):** glossary §3 / §7 educational integration + `/freestyle/add-analysis` enrichment. Surfaces the derivation pattern as a teaching layer, not a per-trick artifact.
- **Phase 3 (A):** *not pursued initially.* A standalone `/freestyle/derivation` page would compete with `/freestyle/add-analysis` without a clear new audience. Revisit only if B + C surface demand.

### Decision 2 — Wave-2 doctrine boundary: suppress entirely

For tricks whose decomposition depends on doctrine that Red has not ruled on (paradox internals, symposium internals, ducking, barraging, fairy weighting, hidden X-dex doctrine), the derivation panel **does not render**. The trick still displays:

- canonical notation
- editorial `asserted_adds` total
- normal trick-detail layout

The absence of the panel is the signal. No "Pending Red ruling" copy on trick pages in Phase 1 — that prose lives in `/freestyle/add-analysis` provenance, not on trick pages.

Rationale: silence is the cleanest doctrine-respect posture where authority has not ruled. Provisional rendering risks anchoring an unconfirmed reading in user memory.

Revisit in Phase 2 once stable patterns emerge from resolved cases.

### Decision 3 — Precedence: editorial > curator-map > parser

The accounting layer is **never** authoritative on its own. The render path is:

```
1. Read freestyle_tricks.asserted_adds            → authoritative total
2. Look up trick in curator-maintained add-map    → per-component breakdown
3. Sum curator-map components                     → expected total
4. If steps 1 and 3 agree                         → render derivation panel
5. If they disagree                               → suppress panel + log diagnostic
6. Parser computed_adds                           → consistency-check only
                                                    (never displayed to user;
                                                    used by curator workbench)
```

This honors the parser/editorial separation rule — Architecture C (parser metadata-seeding) is permanently rejected. Parser is a **check**, not an **authority**.

## Four-layer ontology mapping

The accounting layer sits cleanly in the existing four-layer separation; it introduces no new layer.

| Layer | What it owns | Accounting role |
|---|---|---|
| **Canonical** | `freestyle_tricks` rows; `asserted_adds`; alias graph | Provides the authoritative total to validate against |
| **Educational** | Modifier-feel cards; glossary §3 movement language; descriptive prose | Frames *why* a component carries ADD (the teaching layer) |
| **Symbolic** | Notation tokens; operator-board glyphs; equivalence chains | Provides the token inventory the accounting reads |
| **Operational** | Parser; `structural_parse_json`; `computed_adds`; allow-list module | Provides the parser-as-check signal; never authoritative |

The new surface is a **read-only render** that joins canonical totals to symbolic tokens via a curator-maintained map.

## What this is, and isn't

**Is:**

- A read-only derivation render
- Curator-maintained component-attribution map (new TypeScript content module in Phase 1)
- Optional, opt-in surface (collapsed expander)
- Diagnostic signal for curator-map / editorial disagreement

**Is not:**

- A parser feature
- A replacement for compact notation
- A schema change
- An alias-resolution surface
- An ontology authority
- A doctrine-resolution tool (cannot answer "what is the right decomposition of paradox?")

## Forbidden patterns

Per existing project doctrine:

- **No parser-soup rendering.** Compact `gyro torque` stays primary everywhere it appears today. The derivation is an *optional expansion*, never a replacement.
- **No hardcoded Wave-2 doctrine.** The curator-map must not include breakdowns for barraging, blurry-transitivity claims, hidden X-dex doctrine, fairy weighting, paradox / symposium / ducking internals, until Red rules.
- **No schema mutation.** Phase 1 uses a content module (`freestyleAddAccounting.ts` or similar) — same pattern as `freestyleResolvedFormulas.ts`. Schema work waits until ontology is stable.
- **No individual contributor names** in any rendered surface, per public-prose hygiene. Notation traditions (e.g. Jobs notation) remain the sole exception.
- **No retroactive renaming** of operator-board glyphs to match accounting components. The board and the accounting map can speak different vocabularies; the curator-map handles translation.

## Atom ADD baseline (illustrative; authoritative map in deliverable #3)

The 12 core atoms anchor the breakdown. Values below are illustrative starting points — every row needs explicit curator confirmation before landing in the production map.

| Atom | Notation lede | Provisional baseline ADD components |
|---|---|---|
| toe-stall | `toe` | stall(+1) |
| clipper-stall | `clipper` | stall(+1) |
| around-the-world | `atw` | xbody(+1) + stall(+1) |
| orbit | `orbit` | TBD — curator confirmation pending |
| legover | `legover` | xbody(+1) + stall(+1) |
| pickup | `pickup` | stall(+1) — surface variant |
| mirage | `mirage` | dex(+1) + stall(+1) |
| illusion | `illusion` | dex(+1) + spin(+1) + stall(+1) |
| butterfly | `butterfly` | dex(+1) + xbody(+1) + stall(+1) |
| osis | `osis` | mirage-dex(+1) + xbody(+1) + stall(+1) |
| whirl | `whirl` | xbody(+1) + dex(+1) + stall(+1) |
| swirl | `swirl` | xbody(+1) + dex(+1) + stall(+1) — component order distinct from whirl per mechanical difference |

Note the explicit preservation of **butterfly vs whirl component order** — locked in the prior session. The curator-map must honor it. Component order in the derivation render encodes mechanical sequence, not symbolic preference.

## Worked examples (illustrative; full set in deliverable #5)

```
whirl
  xbody(+1) + dex(+1) + stall(+1) = 3 ADD ✓
  (editorial asserted_adds = 3)

mirage whirl
  mirage(+1) + xbody(+1) + dex(+1) + stall(+1) = 4 ADD ✓
  (editorial asserted_adds = 4)

torque
  mirage-dex(+1) + xbody(+1) + stall(+1) + spin(+1) = 4 ADD ✓
  (editorial asserted_adds = 4)

mobius (≈ gyro torque)
  spin(+1) + mirage-dex(+1) + xbody(+1) + stall(+1) + spin(+1) = 5 ADD ✓
  (editorial asserted_adds = 5; per pre-Red Mobius ≈ Gyro Torque ruling)

paradox
  ⊘ SUPPRESSED — paradox internals doctrine-unresolved
  (trick page renders normal layout; editorial asserted_adds still displayed
   in standard ADD chip)

baroque (≈ barraging osis)
  ⊘ SUPPRESSED — barraging doctrine pending pre-Red ruling
  (editorial asserted_adds = 5; panel suppressed per Decision 2)
```

The resolved illustrative examples become workable in the curator-map once their Red rulings are formally integrated via the `RED_RESOLVED_CANON` flow.

## Research questions (carried into later deliverables)

The brief's 10 research questions map to subsequent deliverables:

| RQ # | Question | Lands in |
|---|---|---|
| 1 | Which components are explicitly ADD-bearing? | #2 inventory CSV |
| 2 | Which are hidden inside compressed atoms? | #3 expansion map |
| 3 | How should compressed atoms expand? | #3 expansion map |
| 4 | How should cross-body accounting appear? | #3 + #5 render examples |
| 5 | How should paradox accounting appear? | #4 sensitive cases (= suppressed) |
| 6 | How should symposium accounting appear? | #4 sensitive cases (= suppressed) |
| 7 | Should hidden / internal adds be visible? | #3 + #5 — depends per-atom; default yes for resolved cases |
| 8 | How should alternate accounting interpretations surface? | #4 sensitive cases |
| 9 | Can the system auto-verify ADD totals? | #5 + #6 — yes, via curator-map vs `asserted_adds` |
| 10 | Can notation / accounting disagreements be detected? | #6 + final report — yes, as diagnostic signal |

## Success criteria for the Phase-1 prototype (B)

The Phase-1 prototype succeeds when:

1. A `freestyleAddAccounting.ts` content module exists with curator-confirmed breakdowns for ≥ 20 tricks (the resolved cohort).
2. The trick-detail page renders a "Show ADD derivation" expander on those tricks, collapsed by default.
3. The expander shows: token-by-token component list + per-token ADD chip + total line + canonical-formula reference.
4. Tricks not in the map render the existing layout unchanged — no visual regression.
5. Tricks with curator-map total ≠ `asserted_adds` suppress the panel and emit a diagnostic (curator workbench, not user-facing).
6. Notation tokens in the breakdown link to the corresponding glossary §3 / §6 surface when present.
7. No new schema; no parser changes; no canonical mutation.
8. Component order respects mechanical-distinction conventions (butterfly vs whirl ordering preserved).
9. Wave-2-sensitive tricks (per deliverable #4) suppress the panel cleanly.

## Out of scope

- Phase 3 / Architecture A (standalone `/freestyle/derivation` page) — explicitly deferred per Decision 1
- Per-component ADD weighting changes (e.g., revising whether dex carries +1 or +0.5)
- Doctrine resolution (paradox internals, symposium internals, etc.) — exploration only surfaces *which* cases are unresolved, never proposes resolutions
- Schema mutation of `freestyle_tricks` or related tables
- Parser feature work
- Alias-graph changes
- Component vocabulary additions beyond what the curator-map needs
- Mobile-specific UI work (covered in deliverable #6's brainstorm, then deferred to implementation)

## Open questions for curator review

The following decisions are deliberately deferred to curator input — flag any that should be resolved before subsequent deliverables proceed:

1. **Orbit baseline ADD components** — table above marks TBD. Does orbit decompose to spin(+1) + stall(+1), or something else?
2. **Surface-variant tricks** — toe-stall and clipper-stall both reduce to stall(+1) at baseline. Should the derivation panel render at all for atom-only tricks (single-component), or only for compound tricks (≥ 2 components)? A single-line derivation may add noise without teaching value.
3. **Component vocabulary for the curator-map** — does the map use exactly the glossary §3 vocabulary (dex, xbody, stall, spin, mirage, step, pixie, ducking, etc.), or does it introduce derived tokens (e.g. `mirage-dex` as a compound label vs `mirage + dex` as two separate components)? Implications for the expansion-map's structure.
4. **Diagnostic emission destination** — when curator-map ≠ editorial, where does the diagnostic go? Options: console log in dev only / curator workbench page / build-time CI failure / silent suppression. Phase-1 default: log to a curator-only internal page if one exists, otherwise build-time warning.
5. **Operator-board cross-link policy** — when a component (e.g. `torque`) appears on the operator-board AND in the curator-map, should the derivation panel link out to the board? Risk: clutter; benefit: pedagogical coherence.

## Cross-references

- [[project_freestyle_state]] — current freestyle subsystem state
- [[project_freestyle_core_atoms]] — 12-atom registry
- [[feedback_parser_editorial_separation]] — precedence rule
- [[feedback_reversible_content_governance]] — content-module > SQL during ontology refinement
- [[feedback_no_individual_names_freestyle_views]] — attribution hygiene
- `src/content/freestyleResolvedFormulas.ts` — precedent for the content-module pattern
- `src/content/freestyleLandingContent.ts` — precedent for static-content rendering
- `/freestyle/add-analysis` — closest existing surface; informs Phase 2 (C) integration
- `/freestyle/combo-analysis` — sequence-level peer surface

## Next deliverable

`add_bearing_symbol_inventory.csv` — per-token inventory listing every notation token observed in canonical trick names, classified by ADD-bearing / surface-bearing / structural / compositional, with curator-confirmation status. Lands after this concept doc has explicit approval.
