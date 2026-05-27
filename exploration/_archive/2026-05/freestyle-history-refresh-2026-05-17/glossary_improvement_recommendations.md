# Glossary Improvement Recommendations

Slice: Historical Evolution Refresh — Phase C (2026-05-17). Bridges v7 report findings to glossary improvement opportunities. Per the user's added note: "use the document to inform glossary improvement."

## Intent

The v7 evolution report surfaces multiple findings that are *already* glossary-relevant but underutilized in the current glossary text. This doc catalogs the bridge opportunities: where v7 findings can deepen glossary entries without expanding the ontology, without resolving Wave-2 doctrine, and without changing ADD values.

All recommendations are document-only — no code edits proposed here. A future implementation slice would translate these into specific glossary template changes.

## Recommendation 1 — Foreground "compositional layering" in glossary §6

The v7 report's framing of modifiers as *simultaneous constraints on body motion within a single set cycle* is sharper than the current glossary §6 Surface A presentation. The 13 modifier feel cards on Surface A describe individual modifiers; the v7 report's framing of *how layering compounds difficulty non-linearly* is missing.

**Action:** add a short opening paragraph to §6 Surface A explaining the layering principle. Cross-link to v7 report §3 ("ADD System and Trick Decomposition"). Single paragraph; doesn't touch the 13 cards.

**Source:** v7 §3 line "Each modifier introduces a simultaneous additional constraint on body motion within a single set cycle. Difficulty therefore scales not linearly, but through the interaction of multiple constraints."

## Recommendation 2 — Surface the "vocabulary stabilization by 2007-2008" finding in §1

The v7 report makes the *two-phase history* explicit (invention 1985-2008 → recombination 2008-today). The current glossary §1 doesn't acknowledge this temporal structure. A short paragraph would frame the entire glossary as "a snapshot of a vocabulary that completed its first phase fifteen years ago."

**Action:** add a 2-sentence framing paragraph to §1's opening, acknowledging that the vocabulary stabilized by ~2007-2008 and that current work refines rather than expands. Cross-link to v7 §7 ("Trick Innovation Timeline").

**Risk:** none — the finding is historical-statistical fact.

## Recommendation 3 — Add network-attractor framing to whirl's §3 / §5 entry

The whirl entry could carry the v7 finding that whirl is the corpus's strongest *attractor* — the trick sequences gravitate toward. This is a structural property, not just a use-frequency observation.

**Action:** add a 1-sentence note to the whirl entry: "Network analysis of 22 years of Sick3 sequences shows whirl as the central attractor of the freestyle trick network — sequences converge on it as a stable resolution point." This is observational, not prescriptive.

**Risk:** none — the finding is corpus-documented.

**Optional:** similar 1-sentence notes for blurry whirl (launch node), dimwalk (throughput), and superfly (pure terminus). Each grounds the §3/§5 entry in observable structural behavior.

## Recommendation 4 — Add Sick3 / Shred:30 / BOP cross-links in §10

These terms currently live in §10's prose without anchor-level deep-linkability. The Combo Analysis extraction slice plans to move them to a future `/freestyle/combo-analysis` surface, but until that ships, the current §10 entries deserve anchor IDs.

**Action:** add `id="sick3"`, `id="shred-30"`, `id="bop"` (and similar) to the §10 prose so external links can target them. Once `/freestyle/combo-analysis` ships, redirect the anchors there.

**Already done in Coherence Cleanup Phase 3:** `id="run-quality"` was added. This is the same pattern, extended.

## Recommendation 5 — Add foundational-trick attribution acknowledgment to §3 / §5

The v7 report's §2 surfaces specific player attribution for the foundational vocabulary (Kenny Shults → whirl; Rick Reese → ripwalk; Eric Wulff → butterfly variants; Tuan Vu → early difficulty). The current glossary §5 family-tree entries don't surface this attribution.

**Action:** add a small "credit" line to family-tree entries where attribution is documented in v7. E.g. on the whirl family tree: "Whirl as competitive element traces to Kenny Shults's foundational work; the modifier extensions (blurry, spinning, paradox, symposium) emerged 2001-2008."

**Risk:** medium — attribution claims need careful sourcing. Use only the attribution v7 already documents; don't invent new attribution.

## Recommendation 6 — Add "evolved ADD value" annotation to glossary tier-3 entries

Several modifier weights in v7 are "consensus models with era-dependent variation" — blurry's +1 vs +2 depending on rotational base, gyro's recent ratification as a distinct operator, etc. These caveats live in the v7 ADD-table disclaimer but don't surface in the glossary.

**Action:** add a small "(weight conventions varied historically; see [ADD Analysis](/freestyle/add-analysis))" annotation to the modifier definitions in §6 Surface B Body Modifier Reference. Doesn't change values; just acknowledges the convention's history.

**Risk:** low — preserves the existing surface while adding doctrine-honest acknowledgment.

## Recommendation 7 — Add the "additive structural accounting" principle to §10's ADD definition

The current §10 defines ADD as "a scoring system that assigns difficulty values to tricks based on their components." The v7 framing is sharper: ADD is *additive structural accounting* — a base trick's weight plus each modifier's weight, summed. This is the same principle that lets the dictionary describe `mobius = gyro torque` and have the ADD add up.

**Action:** rewrite the §10 ADD intro sentence to surface the additive-structural-accounting framing. Cross-link to `/freestyle/add-analysis`.

**Risk:** none — already on the platform's published roadmap.

## Recommendation 8 — Reframe "abbreviations" §7 as "operator notation" with v7 cross-link

The current §7 has an abbreviations subsection that mixes trick names and operational tokens. The v7 report's framing of operational notation as *a compact symbolic shorthand for composing trick names* would sharpen this.

**Action:** add a paragraph to §7 introducing the operational notation as "the compact symbolic form of trick composition" with a worked example (e.g. "paradox = `CLIP > OP IN [DEX]` reads as 'clipper set, then far in-out dex'") and cross-link to v7 report §3 or `/freestyle/add-analysis` for fuller treatment.

**Risk:** none — references existing governed content.

## Recommendation 9 — Acknowledge regional variation in §11

The v7 report documents a structural divergence between North American (BAP-lineage) and European (Klouda / Gielnicki / Wilk / Weber lineage) competitive traditions. The current glossary §11 "Community & Historical Vocabulary" doesn't address regional variation in terminology.

**Action:** add a short sub-section to §11 noting that some terminology has regional history — particularly the BAP-induction vocabulary (which skews North American) vs the Central European competitive vocabulary (which dominates the modern era). This is editorial framing, not new entries.

**Risk:** low; reference v7 §9.

## Recommendation 10 — Add an "About this glossary" framing closer

The v7 report's conclusion frames the platform's movement-language work as "the formal accounting of a vocabulary that the community built informally over four decades." The current glossary doesn't carry an explicit framing statement of its purpose.

**Action:** add a 2-sentence closing paragraph (or a section preceding §11) framing the glossary as the codification surface of a community-built vocabulary, not as the source of authority for that vocabulary.

**Risk:** none — humble framing aligns with anti-overhardening posture.

## Prioritization

| # | Recommendation | Effort | Risk | Priority |
|---|---|---|---|---|
| 1 | Compositional layering in §6 | small | none | HIGH |
| 2 | Vocabulary-stabilization framing in §1 | small | none | HIGH |
| 3 | Network-attractor framing on whirl §3/§5 | small | none | MEDIUM-HIGH |
| 4 | Sick3/Shred:30/BOP anchors in §10 | trivial | none | HIGH |
| 5 | Foundational-trick attribution in §5 | medium | medium (sourcing) | MEDIUM |
| 6 | "Evolved ADD value" annotation in §6 | small | low | MEDIUM |
| 7 | Additive structural accounting in §10 | small | none | HIGH |
| 8 | Operator notation framing in §7 | small | none | MEDIUM |
| 9 | Regional variation in §11 | small | low | LOW |
| 10 | "About this glossary" closing | small | none | MEDIUM |

## Constraints respected

- No ontology expansion (no new families, categories, modifiers, operators)
- No Wave-2 resolutions (no doctrine commitments)
- No ADD changes
- No fabricated content (every addition references v7 or already-governed material)
- No parser jargon (all proposals in pedagogical voice)
- Four-layer separation preserved

## What a future implementation slice would look like

If the maintainer approves any subset of these:
- Service: `freestyleService.getGlossaryPage` returns additional content fields where new prose is service-shaped (not template-hardcoded)
- Template: `src/views/freestyle/glossary.hbs` gains the new prose blocks
- Tests: ~1 spec per added prose paragraph asserting the new text renders
- Estimated effort: small per recommendation; a focused slice could batch 5-7 of these in one commit

## Cross-references

- `FREESTYLE_EVOLUTION_REPORT_v7.md` — primary source for the framings
- Coherence Cleanup Slice's `glossary_section_relocation_recommendations.md` — predecessor; this doc extends with v7-derived improvements
- `[[project_glossary_v5_synthesis]]` — original glossary design context
