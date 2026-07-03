# Count Sync Fix Plan

Acts on COUNT_SYNC_AUDIT.md. Two independent problems: (1) a count-definition drift where the coverage tracking used 651 instead of the page's 629, and (2) a stale observational snapshot. The public dictionary page itself is correct and needs no change.

## Confirmed public Page A count definition
**Canonical trick count = `is_active=1 AND resolveTrickKind(slug)==='trick'` = 629.** Excludes the 22 non-trick rows: set primitives (9), modifier primitives (11), multi-bag rows (2), and any other non-trick kind. This is the hero ("officially documented tricks") and the By-ADD bucket population; both are internally consistent at 629, with 100% ADD coverage.

## Fix 1 - reconcile coverage denominators to 629
The public page is right; the drift was in the offline topology/coverage tracking, which used raw `is_active=1` (651).
- Use **629** as the trick denominator everywhere; exclude set / modifier / multi-bag / other non-trick rows from any "tricks" count.
- True notation coverage is **~562 notated / 67 Unknown of 629** (≈ 89%), not 564 / 87 of 651. The named-set and modifier primitives never carry `operational_notation`, so counting them as notation-less tricks was the inflation.
- Action: correct `exploration/coverage-promotion-merged/DASHBOARD.md` and any baselines. No public-page or DB change. Do not hand-edit the page.

## Fix 2 - regenerate the observational snapshot (Page B)
```bash
python3 freestyle/scripts/build_observational_universe_content.py    # rewrites src/content/freestyleObservationalUniverse.ts
npm run build                                                         # tsc must pass
```
Refreshes `canonicalPublished` / `canonicalCoveragePct` / `total` / `generatedOn` and re-applies the live-DB canonical dual-gate; the Page A "Emerging vocab" cross-reference (same constant) updates with it. Row membership is unchanged (0 overlap). Never hand-edit the content module; the generator is its only writer.

## Drift guards
1. **Page A internal-consistency (QC, reads live DB):** assert over `isTrickRow` rows that `hero == sum(ADD buckets) == sum(dex buckets incl. Unknown) == isTrickRow count`. Catches a population that disagrees with itself across views.
2. **ADD-coverage guard (QC):** assert every `isTrickRow` row has a numeric ADD (`parseAddNumeric != null`). A trick with no ADD would be counted by the hero but dropped from the By-ADD view, recreating hero != ADD-sum drift.
3. **Observational sync QC (reads live DB):** fail if any `OBSERVATIONAL_UNIVERSE` slug is canonical-published (overlap > 0); warn if `_STATS.canonicalPublished` lags the live count; print `generatedOn`.
4. **Observational internal-consistency (unit, no DB):** `_STATS` section counts equal the array section sums; total equals their sum; every `section`/`intakeBucket` is a known value.

## Order of operations
Reconcile the coverage denominators to 629 (Fix 1) -> regenerate the observational snapshot (Fix 2) -> add the guards. After this, 629 is the single trick-count source-of-truth, coverage % uses the right denominator, and a drift alarm fires the moment a promoted slug or a stale stat reappears. No public count is ever hand-edited.
