# Observational Surface + Alias Ingestion Refactor — Unique-Trick Doctrine

**Date:** 2026-05-28
**Type:** Audit + proposal. **No destructive actions.** No DB writes, no canonical-CSV edits,
no schema migration. Everything proposed here is generator + service + template work on the
reversible TypeScript content layer.
**Scope surfaces:** Emerging Vocabulary / observational layer (`/freestyle/observational`),
observational reconciliation, alias ingestion, canonical promotion logic, public counters,
detail-page equivalence rendering.

---

## 0. Core doctrine being enforced

> **Public counts must represent only unique canonical tricks.**

A trick counts once iff it has one canonical trick ID, one canonical structural identity, and
one canonical detail page. Aliases, alternate constructions, source spellings, mechanically
equivalent formulations, parser variants, same-side/far/near wording drift, and observational
duplicate names are **metadata attached to a trick**, never additional tricks.

Examples that are NOT additional tricks: `smear ≡ pixie mirage`, `dimwalk ≡ pixie butterfly`,
`atom smasher ≡ atomic mirage`.

This aligns with existing project doctrine: `feedback_frequency_not_authority`,
`project_canonical_trick_publication_contract`, and the freestyle-topology-governance
invariant *observational ≠ canonical*.

---

## 1. AUDIT — where the four headline numbers come from

| Number | Real source | Counter type | Honest as "tricks"? |
|--------|-------------|-------------|---------------------|
| **499** active canonical tricks (brief said "492"; live DB = 499) | `freestyle_tricks WHERE is_active=1 AND category!='modifier'` | **Ontology** (unique canonical entities) | YES — the only count that means what a reader assumes |
| **510** `canonicalPublished` | reconciliation universe, published/canonical names | **Lexical / publication** | NO — ~11 more than 499; alias/alternate published spellings counted as names |
| **1701** `total` "observational names" | `total = len(rows)` in `build_observational_universe_content.py:111` — the ROW COUNT of the reconciliation universe (in_db=false, governance_state∉{1,2}) | **Lexical** (one row per documented string) | NO — the core problem |
| **2460** `universeTotal` | full reconciliation universe (all states) | **Lexical** | NO |

Supporting live counts (DB, 2026-05-28):
`active_non_modifier=499`, `active_all=514`, `active_modifier=10`, `total_rows=516`.
There is no `aliases` column on `freestyle_tricks`; aliases live in the alias layer.

`OBSERVATIONAL_UNIVERSE_STATS` (generated, `src/content/freestyleObservationalUniverse.ts:1754`):
```
total 1701 | canonicalPublished 510 | universeTotal 2460
ready 243 | frontier 31 | doctrineBlocked 266 | folkUnresolved 752 | parserUnresolved 409
canonicalCoveragePct 21 | sources SG672 FM505 PB369 FB128 MULTI27
```

### 1.1 How the 1701 decomposes (verified)

- **1701 lexical rows → 1647 distinct slugs.** Only ~54 rows are same-slug wording duplicates.
  Worst offenders: `fairy-whirl` (4 rows), `barraging-butterfly` (4: "Barraging Butterfly" /
  "(same side)" / "far" / "near"), `terraging-clipper`, `stepping-butterfly`, `pixie-drifter`,
  `fairy-torque`, `fairy-illusion`, `fairy-butterfly`, `atomic-mirage`, `atomic-ducking-mirage`
  (3 each). So **same-side/far/near dedup is only a ~3% lever**, not the main one.
- The builder routes `db=='alias-collapse'` rows into the **`folk`** section
  (`build_observational_universe_content.py:99`), so names that by definition collapse to an
  existing canonical trick are **counted inside the 1701**.
- The remaining ~1647 distinct slugs are **overwhelmingly compositional modifier+base names**
  (`blazing-illusion`, `diving-guay`, `barraging-mirage`, decomposition `modifier(+n) + base`).
  Per the canonical-vs-compositional rule (`footbag-freestyle-dictionary §1`), pure modifier
  chains are NOT candidate canonical rows — they are `modifier_links` on a base.

### 1.2 Conclusion

`1701` is a **lexical inventory of documented strings**, not a count of missing unique tricks.
The number that could ever mean "missing unique canonical tricks" is a **small subset** of
`parserUnresolved` (409) plus a fraction of `folkUnresolved` (752) — low hundreds at most,
likely far fewer once aliases, wording variants, and compositional names are removed.
**499 is the only count that currently means what a reader thinks it means.**

---

## 2. Counter normalization contract (the load-bearing deliverable)

Three counter families. They may never be mixed in one headline, and every public-facing
number must declare its type.

| Family | Definition | Current value | Public label |
|--------|-----------|---------------|--------------|
| **Ontology** | unique canonical tricks (one ID / identity / detail page) | 499 | the only count allowed to imply "tricks" |
| **Publication** | canonical names published (entity + its alternate published names) | 510 | always paired with the entity count: "499 tricks under 510 names" |
| **Intake** | unresolved work items in the governance queue | (recomputed; see §4) | "tracked vocabulary" / "unresolved structures" — NEVER "tricks" |

**Rule:** "missing unique tricks" may only ever be estimated from the `unresolved_structure`
bucket (§4). Never from 1701, 1647, 2460, or any lexical total. Where a lexical total must
appear, it is de-emphasized and annotated: *"documented names, not unique tricks."*

---

## 3. Data-model proposal (reversible, TS-only)

Extend `ObservationalUniverseRow` in the generated module (generator-populated; **no DB/schema
change**):

- `lexicalName` — rename of current `name`; the raw observed string.
- `canonicalSlug` — current `slug`; the dedup key. **Distinct-slug, not row count, is the unit.**
- `lexicalVariants: string[]` — wording/source variants folded onto the surviving row
  (absorbs the 1701→1647 dupes + same-side/far/near drift).
- `intakeBucket` — the 7-way classification (§4).
- `collapsesTo` — target slug when the row is an alias/equivalence/duplicate of an existing
  canonical or another universe slug. Non-empty ⇒ excluded from every "unique structure" count.

`structural_signature` (brief A.3) is correctly **future-facing**: it depends on the
parser/editorial-separation work stabilizing. Defer; do not build now.

---

## 4. Intake bucketing (brief §D) mapped onto the current 5 sections

Current sections (ready 243 / frontier 31 / doctrine 266 / folk 752 / parser 409) become a
7-bucket classification. Only `unresolved_structure` feeds any "missing unique tricks" estimate.

| New bucket | Source rule | Counts toward "missing tricks"? |
|------------|-------------|--------------------------------|
| `alias_candidate` | `db=='alias-collapse'`, or `collapsesTo` set to a published canonical | NO |
| `equivalence_candidate` | distinct lexical name, mechanically identical to an existing canonical (`smear ≡ pixie mirage`) | NO |
| `duplicate_source_variant` | same `canonicalSlug` as another universe row; wording/source drift | NO |
| `parser_generated_compound` | decomposition is `modifier(+n) + base`, no independent community identity (canonical-vs-compositional test) → `modifier_links` candidate, not a trick | NO |
| `unresolved_structure` | genuinely distinct movement structure with no existing canonical home | **YES** |
| `doctrine_blocked` | gated on a Red/curator ruling (blurry/furious, weaving, pogo, shooting, …) | not yet (re-evaluate post-ruling) |
| `low_confidence_noise` | parser failure / junk / unparseable | NO |

Ingestion changes (brief §B): collapse to distinct `canonicalSlug` first; carry variants in
`lexicalVariants`; route `alias-collapse` out of `folk` into `alias_candidate`; classify
compositional names as `parser_generated_compound`. Result: the surface tracks **unresolved
unique structures**, not raw strings.

---

## 5. Public wording revisions (brief §C / §E)

Retire everywhere: "1701 tricks", "observational tricks", "not-yet-canonical tricks".
Prefer: **tracked vocabulary**, **intake queue**, **unresolved names**, **unresolved structures**.
Headline metric on `/freestyle/observational` swaps `total: 1701` for the
distinct-`unresolved_structure` count; the lexical total, if shown, is de-emphasized with the
annotation *"documented names, not unique tricks; many are aliases, wording variants, or modifier
combinations of existing tricks."* (Reuse the glossary's shipped "documentation ≠ canonization"
frame.)

---

## 6. UI / UX doctrine (brief §F)

- **Dictionary** = ontology truth (499 unique tricks). Unchanged.
- **Detail pages** = home for lexical complexity: aliases, equivalence chains, alternate
  constructions, source spellings, parser readings, observational history, doctrine notes.
  The S3/S5/S8/S9 slot governance already exists for exactly this.
- **Observational layer** = intake/governance workflow, NOT a parallel ontology universe.
  Keep the 7 buckets as the work surface; drop the parallel "count" framing.

---

## 7. Migration path (all reversible, staged)

1. **Generator** (`build_observational_universe_content.py`): add fields, collapse-to-distinct-
   slug, 7-bucket classification; regenerate `freestyleObservationalUniverse.ts`. No DB writes.
2. **Service** (`freestyleService.ts`): recompute stats off `canonicalSlug` + `intakeBucket`;
   implement the typed-counter contract (§2).
3. **Templates**: wording overhaul + headline-metric swap (§5).
4. **Detail pages**: confirm equivalence/alias rendering covers the collapsed `lexicalVariants`.

No step touches the DB or canonical CSVs. Each step is independently shippable and testable.

**Recommended order:** §2 counter contract first (smallest honest fix — relabels and pairs the
counts without re-classifying), THEN the generator re-classification (§3/§4), THEN wording/UI.

---

## 8. Risk assessment (brief §G7)

- **Over-collapsing is the biggest risk.** A genuinely distinct trick wrongly merged by an
  aggressive alias rule vanishes from intake. Mitigation: collapse only on exact normalized-slug
  match + curator-confirmed equivalence chains; everything uncertain stays `unresolved_structure`
  (fail-open to "still a candidate"). Matches the governance rule "when in doubt, assume
  observational."
- **Doctrine in flight:** blurry/barraging/atomic ADD rulings (Red Wave-2/3) gate which
  compositional names are "real." Leave those `doctrine_blocked`; do not hard-classify.
- **Counting precision gaps — RESOLVED 2026-05-28.**
  - **Gap A (510 ↔ 499):** published canonical (gov `1*`) = 510 names → **507 distinct slugs**
    (3 wording-dupe names) ≈ **499 live DB tricks**. The 507→499 residual is reconciliation-
    snapshot drift + 2 explicit alias/SE-chain "represented-by" rows (clipper, assassin). 510 is
    a publication/name count, never a trick count.
  - **Gap B (the 1701):** the two source files are now reconciled. `total: 1701` is the
    promotion-**packet** intake queue (clean 243 + curator_confirm 31 + deferred 1427); the
    authoritative universe (`CLASSIFIED_UNIVERSE.csv`) breaks down as
    **2460 = 510 published + 5 alias/equiv + 1945 observational** (states 3 obs-represented 1879
    / 4 pending 44 / 5 policy 20 / 7 ambiguous 2; 1944 distinct slugs). **0 observational slugs
    collide with a published slug** → overlap-safety confirmed. The earlier "249 gap" was an
    artifact of mixing the packet count (1701) with the universe denominator (2460).

### 8.1 Counter contract — IMPLEMENTED 2026-05-28

- Generator (`build_observational_universe_content.py`) now emits single-source typed fields
  from `CLASSIFIED_UNIVERSE.csv`: `publishedDistinctStructures` (507), `aliasEquivalentNames`
  (5), `observationalUniverseNames` (1945), `observationalUniverseDistinctStructures` (1944);
  `total` is documented as the intake-queue size (not the universe, not unique tricks).
- Service banner relabelled: "Observational names → **Intake queue**" (hint "tracked names under
  review, not unique tricks"); "Canonical coverage → **Canonical published**" (hint "507 distinct
  structures; 2460 documented names in the full universe"). Dictionary Card 5 suffix
  "observational names → tracked names". `statsNote` carries the explicit "documented names, not
  unique tricks" disclaimer.
- Row data unchanged (deterministic regeneration); no DB writes. Tests:
  `freestyle.observational.routes.test.ts` asserts the honest framing; `freestyle.tricks-landing`
  updated to the new badge noun.
- **Still future work (the §3/§4 re-classification):** the 7-bucket `intakeBucket` +
  `collapsesTo` fields and routing `alias-collapse` out of the count. This slice delivered the
  typed-counter contract + honest wording; it did NOT yet re-classify the 1701 intake rows.

---

## 9. Adjustment to the brief's framing

The same-side/far/near dedup instinct is correct but is a **~3% lever** (54 rows). The
high-impact moves are:
1. Route `alias-collapse` rows out of the count (`alias_candidate`).
2. Classify compositional modifier+base names as non-trick `parser_generated_compound`.
3. The typed-counter contract so a lexical total can never again read as "tricks".

Those three recover almost all of the publication honesty.

---

## 10. Artifacts referenced

- `src/content/freestyleObservationalUniverse.ts` — generated universe + `OBSERVATIONAL_UNIVERSE_STATS`.
- `legacy_data/scripts/build_observational_universe_content.py` — generator (`total = len(rows)`;
  `alias-collapse → folk`).
- `src/services/freestyleService.ts` (~7932) — stats-banner shaping.
- `database/footbag.db` `freestyle_tricks` — the 499 ontology count.
- Related memory: `project_family_taxonomy_doctrine`, `project_canonical_trick_publication_contract`,
  `feedback_frequency_not_authority`, `feedback_reversible_content_governance`.
