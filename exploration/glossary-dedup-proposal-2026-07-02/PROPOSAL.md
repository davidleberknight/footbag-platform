# One-kind-of-content-per-page: glossary de-dup proposal (2026-07-02)

Proposal only — no changes made. Grounded in a read-only IA sweep of every freestyle
knowledge surface (overlap table below, produced by a dedicated inventory pass over the
templates, service shapers, and content modules).

## The principle

Each content KIND gets one owning page (the primary), generated from one module where
possible; every other surface carries at most a secondary summary or a mention that links
to the owner. Mirrors the shipped single-authority pattern for operator doctrine
(freestyleOperatorReference.ts) at the page level.

## Proposed ownership matrix

| Content kind | Proposed owner | Everyone else |
|---|---|---|
| Operator/modifier definitions | /freestyle/operators (freestyleOperatorReference) | modifier-family pages keep PEDAGOGY (feel, progression) but source their definition line from the reference; glossary keeps a one-line gloss + link |
| Set definitions | Set Encyclopedia detail pages (symbolicSetEducation / freestyleCanonicalSets) | glossary timing-sets section becomes gloss + links; compositional-sets keeps its composition framing |
| Family definitions | glossary families section today; the Family Pages MVP becomes the owner when it ships | ?view=family keeps grouping only; trick-detail keeps the ribbon |
| Notation-token reference | glossary notation section | operators' inline 3-token vocabulary and the jobs article link rather than restate; trick-notation partial renders tokens, never defines them |
| ADD scoring rules | /freestyle/add-analysis (freestyleAddAnalysisContent) | the glossary's hardcoded add-accounting table becomes generated from the same module or reduced to gloss + link |
| Dex-direction pedagogy | glossary dexterities section | operators paradox block and modifier pages link the terms (the new term-anchor deep links make this cheap) |
| Worked examples | owner per example home (add-analysis for ADD math; progression pages for ladders) | six-surface scatter consolidates by linking, not copying |
| Run-quality vocabulary | glossary run-architecture section | add-analysis run-density framing links it |

## The five drift-riskiest overlaps (fix first, in order)

1. **Operator definitions authored twice** — operatorReference vs symbolicModifierEducation both fully define Paradox/Spinning/Ducking/Diving. Fix: modifier pages import their definition sentence from the reference module.
2. **ADD rules authored twice** — glossary's hardcoded table vs freestyleAddAnalysisContent enumerate the same component contributions. Fix: generate the glossary table from the module.
3. **Notation tokens authored three times** — glossary (~435 hardcoded lines) vs operators' inline vocabulary vs the jobs article. Fix: one token module; the operators glosses stay terser by design but derive from it.
4. **Family definitions on two rosters** — glossaryFamilyCards is glossary-only beside publicFamilies/familyTiers. Fix: derive card kind/tier fields from the roster modules (the Down umbrella just exercised this seam).
5. **Dex-direction pedagogy authored three times** — including the glossary-only "OP is not X-Dex" corrective absent elsewhere. Fix: term-anchor links from operators + modifier pages into the glossary terms (partially shipped: modifier pages now deep-link their glossary term).

## Full overlap table (inventory pass, verbatim)

Depth: P=primary section, S=secondary, m=mention; hc=hardcoded in template (independently authored).

| Content kind | glossary | operators | modifier pages | sets-encyc | set-detail | compositional-sets | ?view=family | add-analysis | trick-detail |
|---|---|---|---|---|---|---|---|---|---|
| Operator/modifier definitions | S hc+CoreAtomEducational | P OperatorReference | P symbolicModifierEducation | — | — | m | m | m | m |
| Set definitions | S hc | m | — | P freestyleCanonicalSets | P symbolicSetEducation | S freestyleCompositionalSets | m | m | m |
| Family definitions | P GlossaryFamilyCards+PublicFamilies | m | m | — | m | S | P PublicFamilies+FamilyTiers | m | m |
| Notation-token reference | P hc (~435 lines) | S inline vocab | S jobNotation | m | S | S | m | m | S trick-notation partial |
| ADD scoring rules | P hc table + GlossaryAddExamples | S | m | m | m | m | S | P AddAnalysisContent | S |
| Dex-direction pedagogy | P hc | S | S | — | m | m | m | m | m |
| Worked examples | S hc + AddExamples | m | S | m | S | S | m | P | m |
| Run-quality vocabulary | P | m | — | — | — | m | — | S | — |

## Sizing and sequencing

Each of the five fixes is an independent 0.5-1.5 day slice; none needs schema or doctrine.
Recommended order = the list above (definition-drift risks before pedagogy links). Slices 1,
2, and 4 are module-derivation refactors with byte-identical rendered output as the
regression oracle; 3 is the largest (the glossary notation section's hardcoded lines move to
a module); 5 is mostly done (term anchors exist; modifier pages now consume them).
