# Phase EV0/EV1 — Dictionary / Emerging-Vocabulary Integrity Audit + Repairs

Inventory integrity audit (EV0) and the integrity repairs (EV1). Goal: every documented trick name lives in exactly one correct place (canonical, alias, emerging/tracked, or unresolved source gap), with **no trick both canonical and emerging**.

## Status: overlap blocker RESOLVED

The one materially-broken integrity class — canonical↔emerging overlap — is **fixed**. After the repair, the emerging surface contains **zero** canonical or alias slugs.

| Integrity check | EV0 result | EV1 status |
|---|---|---|
| Canonical ↔ Emerging overlap | ~165 overlapping slugs | **RESOLVED → 0** |
| ADD-view visibility | 629/629; 0 lack ADD | Clean (no change) |
| Dex-view visibility | 158 lack `operational_notation` | Data-completeness gap (deferred) |
| Family-view singletons | 73 absent (60 retired-route + 13 singleton) | Dispositioned (see below) |
| Detail-card quality (named) | 3 flagged | **7 cards patched** (incl. 2-bag/3-bag, ATW/Pixie, Orbit/Fairy) |
| Source coverage (missing-entirely) | ~0 | Clean (no change) |
| `around-the-world-sole` | never ingested; pt8 candidate | Unresolved (expected) |

## Overlap repair (EV1) — what changed

Root cause: both generated emerging modules built their "already-canonical, exclude" gate from two **static CSVs** and never read the live DB or aliases. Fix: the gate in both generators now also excludes `freestyle_tricks (is_active=1) ∪ freestyle_trick_aliases.alias_slug` (read-only DB query), then both modules were regenerated. The hand-authored module's 11 stale overlaps were removed via its own tombstone-comment convention.

### Metrics (before → after)

| Metric | Value |
|---|---|
| Overlap (emerging ∩ canonical-or-alias) | **~165 → 0** |
| Removed — tracked names | **126** (the 78 active + 48 alias overlaps) |
| Removed — observational universe | **146** (117 active + 29 alias) |
| Removed — observational tricks (hand-authored) | **11** |
| Added — tracked names (corpus now current) | **35** (all non-canonical, non-alias — verified) |
| Canonical active tricks | 651 |
| Canonical aliases | 164 |
| Tracked names (after) | 1,664 |
| Observational universe (after) | 1,480 distinct |
| Observational tricks (after) | 46 (was 57) |
| `diving-mirage` on any emerging surface | **gone** (bare canonical slug absent from all 3) |
| New tracked additions that are canonical/alias | **0** (validated) |

Exact removed/added slug lists: `removed_tracked_names.txt`, `removed_observational_universe.txt`, `added_tracked_names.txt`, and `OVERLAP_FIX_LIST.md` in this folder.

### Durability

The gate fix is permanent: any future regen now auto-excludes whatever is canonical or aliased in the live DB at regen time, so this drift class cannot silently reopen. The two generated modules remain "do not hand-edit"; the hand-authored `freestyleObservationalTricks.ts` keeps its tombstone-comment convention for promoted folk names.

## Singleton-family dispositions (EV1, recommendation only — no view code changed)

Per the doctrine "Family View is a compact map of major neighborhoods, not an exhaustive taxonomy; never surface a singleton for completeness," the 13 suppressed singletons disposition as: 5 → **Related Tricks** (around-the-world-kick, pendulum/rake, walk-over/wrap, paradox-blizzard), 2 → **attach to an existing neighborhood** (paradox-high-plains-drifter → drifter; jani-walker → walking), 6 → **remain non-family** (refraction, squeeze, hop-over, bullwhip, plasma, peak-delay). None becomes a visible singleton family.

## Detail-card patches (EV1, implemented)

Seven descriptions overridden in `freestyleSemanticOverrides.ts` (render-time, no reseed): the reciprocal Around-the-World↔Pixie and Orbit↔Fairy "uptime / delay" pairs (worded "an uptime X", never "X = Y"), around-the-world-kick scoped to "the only documented 1-ADD dex trick" + the derivable-but-undocumented kick note, and 2-bag ("two bags, one foot") / 3-bag ("three bags, two feet").

## Remaining (not blocking; not in EV1 scope)

- 158 canonical tricks lack `operational_notation` (dex-count completeness backfill).
- The singleton dispositions above are recommendations awaiting implementation.
- `around-the-world-sole` / `double-around-the-world-sole`: pt8 productive-multiplicity candidates awaiting Red adjudication.

## Verdict

The inventory is now clean on the blocking dimension: **no trick is both canonical and emerging.** The Emerging-Vocabulary redesign can proceed against a corpus that no longer mislabels settled tricks as candidates.
