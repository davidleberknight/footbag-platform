# Content authority — where each freestyle fact is owned

This document names the single authoritative source for every public freestyle
datum, so a change is made in one place and every other surface derives from it
or references it. It describes the system as it is today; it settles no doctrine
and changes no value.

## The rule

Every concept has exactly one home. Other surfaces either read from that home at
render time, are generated from it, or (where neither is practical) must be kept
consistent with it by hand and are treated as secondary. A secondary surface that
disagrees with its home is a bug, not an alternative reading.

## Authoritative sources

| Concept | Authoritative home | Secondary surfaces (must stay consistent) |
|---|---|---|
| Trick ADD value | `freestyle_tricks.adds` (database, loaded from the curator CSVs) | worked examples and derivations in `freestyleResolvedFormulas.ts`; the ADD-analysis page |
| Operational (execution) notation | `freestyle_tricks.operational_notation` (database) | `freestyleResolvedFormulas.ts` `operationalNotation` is a **fallback only**, used when the database column is empty; it never shadows a populated row. The 12 core atoms are the one exception: `CORE_TRICK_SPEC` owns their notation |
| Aliases (folk / historical / spelling) | `freestyle_trick_aliases` table (from `red_additions` aliases column + `trick_aliases.csv`) | every rendering surface reads this table; the `aliases_json` column is deprecated and used only as a fallback for rows the table does not yet cover |
| Operator / modifier ADD, structure, X-Dex | `src/content/freestyleOperatorReference.ts` | `freestyleMovementSystems.ts`, `freestyleStructuralFactNotes.ts`, `freestyleOperatorGrammar.ts`, the `freestyle_trick_modifiers` registry, and the glossary operator text |
| Family classification | `freestyle_tricks.trick_family` (database) | the public display roster in `freestylePublicFamilies.ts` / `freestyleFamilyTiers.ts` is display-only and never changes the canonical column |
| ADD-analysis prose (component table, notes, discrepancy cases) | `src/content/freestyleAddAnalysisContent.ts` | the ADD-analysis template renders it verbatim |
| External-source ADD divergences (PassBack) | `src/content/freestyleAddDisagreements.ts` | rendered on the ADD-analysis page |
| Doctrine rulings (Red / curator) | `freestyle/doctrine/RED_RULINGS.md` and the rest of this directory | per-row CSV provenance cites, never restates, a ruling |

## The ADD-authority order (arithmetic-closes policy)

When a trick's published ADD, its notation bracket count, and an outside source's
number do not all agree, they are reconciled in this order:

1. **The published `adds` value is the official one.** The additive
   operator-weight arithmetic is diagnostic: it explains the number, it does not
   override it.
2. **The bracket count of the operational notation equals the published ADD.**
   This is enforced per row when a row is authored; a divergence is a data bug to
   fix, not a reading to publish. (The three core stalls carry a documented
   `[set]`-shorthand notation that is intentionally not bracket-counted.)
3. **An outside source's number is recorded, not adopted.** Where FootbagMoves or
   PassBack scores a trick differently, the platform publishes its structural
   value and records the divergence in the row's provenance (single-trick cases)
   or in `OPERATOR_WEIGHT_DIVERGENCE_POLICY` / `DOCTRINE_DIVERGENCE_REGISTRY`
   (cohort and per-trick cases). Frequency is evidence, never authority.

## Known duplications still to consolidate

These concepts are currently authored in more than one place. The authoritative
home is named; the secondary copies are hand-maintained and are a standing drift
risk until each is generated from, or reduced to a link to, its home. Fixing them
changes public rendering, so each is a scoped change, not a silent edit.

- **Tier-1 body-operator definitions** — authored in the operator index, the
  glossary, and `symbolicModifierEducation`. No single declared home yet.
- **The glossary ADD-accounting table** — a hand-authored copy of what
  `freestyleAddAnalysisContent.ts` owns.
- **Notation-token definitions** — authored in the glossary, the operators page,
  and the notation article.
- **Family cards** — `glossaryFamilyCards` is authored independently of the
  public-families / tier rosters.

Consolidating these four is tracked as active work in the maintainers' private tracker.
