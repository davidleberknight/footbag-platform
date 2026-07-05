# Count Sync Audit - Trick Dictionary vs Emerging Vocabulary

Read-only audit. No counts changed. Compares the public counts on `/freestyle/tricks` (Trick Dictionary) and `/freestyle/observational` (Emerging Vocabulary), their sources, current vs expected values, and the regeneration each needs.

## Headline (corrected)
A first pass treated `is_active=1` (651) as the trick count; that was wrong, and it is recorded here so it is not repeated. The Page A hero and ADD buckets are self-consistent at **629**; the suspect number was the **651 baseline** the topology/coverage work used.

- **Page A trick count = 629**, not 651. The hero ("officially documented tricks") and the By-ADD buckets are live-DB and **internally consistent at 629**.
- **651 is NOT the public trick count.** It is the raw `is_active=1` row count, which includes 22 non-trick rows (9 sets + 11 modifiers + 2 multi-bag). The topology/coverage dashboard used 651 as its denominator and therefore over-counted by 22.
- **Page A is current** (live DB; reload of the notation derivations is applied), but its true notation coverage is **~562 notated / 67 Unknown of 629 tricks**, not 564 / 87 of 651.
- **Page B (`/freestyle/observational`) is a generated snapshot, and was NOT data-stale.** Regenerating it changed only the `generatedOn` date (2026-06-06 -> 2026-06-08); every stat is byte-identical. `canonicalPublished=510` is a distinct-structures/loader-gate metric (a different population from the 629 trick count), not a stale 651. Slug membership is overlap-clean (0 canonical leakage).

## Page A count derivation (the corrected core)
**Hero / total trick count** is computed at `freestyleService.ts:6877`:
```
allRows.filter(r => r.is_active === 1 && isTrickRow(r)).length   // = 629
```
where `isTrickRow(row) = resolveTrickKind(row.slug) === 'trick'` (`freestyleService.ts:6663`). Trick-kind rows are compound (582) + atoms body/dex/surface (42) + uncategorized None (5) = **629**. Excluded as non-trick: **set (9), modifier (11), multi-bag (2) = 22**. `651 - 22 = 629`.

**By-ADD buckets** group the same `isTrickRow` rows through `parseAddNumeric` (`freestyleService.ts:4640`), which returns null for empty / `'modifier'` / non-integer. Verified: **all 629 trick rows have a numeric ADD**, so the ADD buckets sum to 629 and there is no "Unknown ADD" bucket - ADD coverage is 100%.

**By-dex buckets** group `isTrickRow` rows by `[DEX]` count in `operational_notation`, with an Unknown bucket for rows lacking notation. Notation coverage is below 100%, so Unknown is non-empty (~67).

### Answers to the five derivation questions
1. **Where 629 comes from:** `is_active=1 AND resolveTrickKind(slug)==='trick'`, live DB. Sets/modifiers/multi-bag are the 22 excluded.
2. **What it excludes:** inactive rows (yes, `is_active=1`); sets/modifiers/multi-bag (yes, non-trick-kind); aliases (yes - aliases live in `freestyle_trick_aliases`, not as trick rows); pending/unpublished (yes - the hero filters `is_active=1`, dropping `is_active=0 review_status=pending`). It does **not** filter by ADD, but all 629 happen to carry a numeric ADD.
3. **What "officially documented tricks" should mean:** the current definition (active trick-kind rows = atoms + compounds = 629) is defensible and is what the hero shows. It is **not** distinct structures (~507-510, a different metric on Page B) and **not** compound-only (582). The fix is not to change 629; it is to make the topology/coverage baseline use 629 too.
4. **Why dex has Unknown (67) but ADD has none:** every trick has a numeric ADD (100% ADD coverage), so the ADD view needs no Unknown bucket; notation coverage is only ~562/629, so the dex view needs Unknown for the ~67 un-notated tricks. Different completeness, not a bug. Latent risk: a trick with no numeric ADD would be counted by the hero but silently dropped from the ADD buckets (hero > bucket sum). Currently zero such rows; a guard is warranted.
5. **Is 651 the true source-of-truth?** No. 651 = raw active rows including non-trick kinds. The public trick count is **629**. The coverage dashboard's 651 denominator was the drift.

## Page B (unchanged from the first pass - still stale)
Generated snapshot `src/content/freestyleObservationalUniverse.ts`, `generatedOn 2026-06-06`, by `legacy_data/scripts/build_observational_universe_content.py` (reads Phase E CSVs 2026-05-28/06-05 + a live-DB canonical dual-gate). Buckets: ready 98, frontier 23, doctrineBlocked 259, folkUnresolved 734, parserUnresolved 387, total 1501, alias ~436; canonicalPublished 510, coverage 21%. Slug overlap with live canonical = **0** (layer separation holds; questions 5 and 7 are clean). The canonical-side stats lag the live dictionary.

## Count-by-count table (corrected)
| # | Page | Count | Source | Current | Correct value | Status |
|---|---|---|---|---|---|---|
| 1 | A | Hero "officially documented tricks" | `freestyleService:6877` live DB `isTrickRow` | **629** | 629 | **correct; my baseline 651 was wrong** |
| 2 | A | By-ADD buckets (sum) | `:7407` live DB, numeric ADD | **629** | 629 | **correct** (100% ADD coverage) |
| 3 | A | By-dex 0/1/2/3+ | `:6898` live DB `operational_notation` | ~562 total | same | correct |
| 4 | A | By-dex **Unknown** | same | **67** | 67 | **correct; my baseline 87 was wrong** |
| 5 | A | (my dashboard) total / notated / unknown | topology audit, `is_active=1` | 651 / 564 / 87 | **629 / ~562 / 67** | **STALE/WRONG baseline - reconcile** |
| 6 | A | Emerging cross-ref | `:7484` `_STATS.total` | 1501 | re-gen | stale (reads snapshot) |
| 7-14 | B | observational buckets + canonical stats | snapshot `_STATS` | (2026-06-06 values) | re-gen | stale; overlap-clean |

## Net
The real problem is a single one, and it is not what the first pass said:
1. **Definition drift on Page A's tracking:** the dictionary page is correct at 629; the topology/coverage tracking used 651 (raw active rows). Fix: standardize the trick count on `isTrickRow` = 629 and exclude sets/modifiers/multi-bag from coverage denominators.
2. **Page B was not data-stale:** regeneration changed only the `generatedOn` date. The apparent mismatch (629 trick names vs `canonicalPublished` 510) is two different metrics (trick names vs distinct published structures), not drift. The regenerated date refresh is harmless to keep.

The three numbers in play - 629 (trick names, Page A hero), 651 (raw active rows, the bad baseline), 510 (distinct published structures, Page B) - measure three different populations. Reconciling the *definitions* (Fix 1) resolves the perceived sync gap; no public count was wrong.

See COUNT_SYNC_FIX_PLAN.md.
