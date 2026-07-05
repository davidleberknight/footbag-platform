# Universe Reconciliation - Can the Bucket Totals Be Summed?

Read-only audit of the count accounting model. Answer: **no, the listed bucket totals cannot be summed.** Summing them double-counts exactly 20 rows. Proof below.

## Adopted accounting model
- **Page A canonical names = 629.**
- **Page B observational rows = 1501.**
- **True total-name universe = 2130** (629 + 1501; canonical/observational disjoint, overlap = 0).
- **Alias/Duplicate (436) is a cross-cutting layer, not a summable section.**
- **Section rows are mutually exclusive** (each row has one section; they partition the 1501).
- **Canonical / observational overlap = 0** (verified).

## The model in detail
- **Sections partition the rendered universe:** `ready 98 + frontier 23 + doctrine 259 + folk 734 + parser 387 = 1501`. No row is in two sections.
- **Alias/Duplicate is a cross-cut, not a 6th bucket:** `intakeBucket in {alias, duplicate_variant}` = 436 rows, each *also* carrying a section. Distribution: **folk 415, ready 18, frontier 2, parser 1 = 436.**
- **The page nets alias out of folk/parser but not ready/frontier:** folk/unresolved is rendered as `(734+387) - 416 = 705`; ready (98) and frontier (23) still include their 18 + 2 alias rows.
- **Names vs structures differ:** Page A is 629 names (~507 distinct structures); Page B sections are row names; alias/duplicate rows add 0 new structures.

## Reconciliation table
"Distinct structures" = distinct `semanticJob`; alias/duplicate rows contribute 0 new structures. Overlaps are non-zero only between the alias layer and the sections.

| Category | Row count (names) | Distinct structures | Overlap |
|---|---|---|---|
| Canonical (Page A) | 629 | ~507 | 0 with every observational category |
| Promotion-ready (section=ready) | 98 | 81 | 18 with alias |
| Needs-authoring (section=frontier) | 23 | 21 | 2 with alias |
| Doctrine-blocked (section=doctrine) | 259 | 259 | 0 |
| Folk/unresolved (folk+parser) | 1121 raw / **705** page (less 416 alias) | ~705 | 416 with alias (netted in the page figure) |
| Alias/duplicate (cross-cut layer) | 436 | 0 new | 415 folk + 18 ready + 2 frontier + 1 parser |

Section-to-section overlap is 0 throughout. The only overlaps are the alias-layer numbers.

## Proof: the buckets cannot be summed
```
ready 98 + frontier 23 + doctrine 259 + folk/unres 705 + alias 436 = 1521
true observational universe (distinct rows)                          = 1501
                                                          over by      = 20
```
The 20 = alias rows still inside ready (18) + frontier (2), counted once in their section and once in the alias archive. With canonical:
```
naive grand total  = 629 + 1521 = 2150
true name universe = 629 + 1501 = 2130
double-count       = 20
```
So `{629, 98, 23, 259, 705, 436}` is not a partition; its sum (2150) over-states the true universe (2130) by 20.

## True grand totals
- **A. True distinct-structure universe = ~1572** = canonical structures (507) + observational non-alias distinct structures (1065; alias/duplicate add 0).
- **B. True total-name universe = 2130** = canonical names (629) + observational rows (1501).

(`_STATS.universeTotal = 2460` is a separate mixed-metric figure - canonical structures 510 + observational names 1945 + alias 5, over a wider classified scope than the 1501 rendered rows - and is also not a clean partition.)

## Where the double-counting occurs (exactly)
1. **Alias-in-ready/frontier: +20.** The page nets alias out of folk/parser but not ready/frontier.
2. **Treating the alias archive (436) as a partition member** when it is a cross-cut over the sections.
3. **Mixing names with structures** (629 names vs 507/510 structures) across surfaces.

## Fix recommendation
Either:
- **(a)** present Alias / Duplicate visually as a separate archive layer explicitly labelled "not included in the section total"; or
- **(b)** subtract aliases symmetrically from ready/frontier as well as folk/parser before publishing any bucket sum, so the five sections become a clean partition summing to 1501.

## Guard (added)
The observational consistency test now enforces:
- the section rows sum exactly to `OBSERVATIONAL_UNIVERSE.length` (the partition holds);
- the alias layer is fully contained in the sections, so the archive count must never be added to section counts;
- the ready/frontier alias rows (currently 20) are accounted for explicitly - a change trips the test and forces the netting logic to be revisited.
