# Media / Record Fix Plan (Part 2)

Proposes the minimal fixes for the linkage gaps. Nothing here is applied; review first.

## High-confidence fixes

### F1. Resolver: strip side qualifiers in `trickNameToSlug` (recovers 20 records)
`src/services/freestyleRecordShaping.ts:4` currently slugifies raw, so `Clipper Stall (ss)` becomes `clipper-stall-ss` (a 404). The slug-normalization rule already holds that `(ss)` / `(op)` / `(near)` / `(far)` qualifiers do not change the slug, so the resolver should drop a trailing side qualifier before slugifying:

```ts
export function trickNameToSlug(name: string): string {
  return name
    .replace(/\s*\((?:ss|op|near|far|same side|opp|opposite)\)\s*$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
```

Pure-function change, no DB, fully reversible. Recovers all 20 qualifier records in both directions (record link and trick-page listing).

### F2. Alias wire: `2-bag-juggle` -> `2-bag-juggling` (recovers the juggle)
The record name `2-Bag Juggle` slugifies to `2-bag-juggle`, which no qualifier strip can reach (it is a lexical variant, not a qualifier). Add an alias row to the curated `trick_aliases.csv` source:

| alias_slug | alias_text | trick_slug | alias_type |
|---|---|---|---|
| `2-bag-juggle` | `2 bag juggle` | `2-bag-juggling` | common |
| `3-bag-juggle` | `3 bag juggle` | `3-bag-juggling` | common (preventive; no 3-bag record exists yet) |

The today-added aliases used the spelled `two-bag` form; this adds the digit `2-bag` form the record actually uses. After reload, the record's `trickHref` resolves and the trick page lists the record, **provided the trick-page record query resolves through aliases** (see V1).

### F3. Orphan media tags - NO-OP (already done)
The audit's two "orphans" were a false positive. `#curated` and `#chinlone` are
already in `scripts/_trick_tag_invariant.py` `UTILITY_EXACT`, so the tag-invariant
QC already treats them as non-trick utility tags. There are zero orphan media
tags and nothing to fix here.

## Verification items (confirm before / during the fix)

- **V1. Trick-page record query is alias-aware.** F2 only closes the reciprocal if the `2-bag-juggling` page resolves its records through the alias table (so `2-Bag Juggle` -> `2-bag-juggle` -> `2-bag-juggling`). If the page matches records by the trick's own slug/name only, add alias resolution there too. The regression test in T2/T4 pins this.

## Review-only (do not auto-fix)

- **R1. Abbreviations (`DDD`, `DSO`, `PLO`).** Almost certainly `down-double-down` and two compound variants, but the expansion is a curator call; wire aliases only after confirmation. Never guess.
- **R2. The 47 genuine compounds.** Record names for compounds the dictionary does not carry (`Stepping Ducking Blurry Whirl`, `Atomic Pickup`, `Blazing Butterfly`, ...). This is a coverage decision for the promotion sprint, not a linkage bug. Check `Infinity` / `Infinity Swirl` against the infinity-to-barfly consolidation during that pass.

## Tests needed (so this class of mismatch is caught next time)

- **T1. Resolver qualifier-strip unit test** (`tests/unit/`): `trickNameToSlug('Clipper Stall (ss)') === 'clipper-stall'`, `('Dyno (op)') === 'dyno'`, and that a bare name is unchanged.
- **T2. Record-to-trick reciprocal test** (integration): a seeded record whose `trick_name` is a qualifier/alias variant produces a `trickHref` that resolves to a real trick page, and that trick page lists the record.
- **T3. Dictionary badge consistency test** (integration): a trick with a resolved `media_tags` entry renders its media badge; the badge presence equals media presence.
- **T4. Named regression: juggling** (integration): `2-bag-juggling`, `2 bag juggle`, and `2 bag juggling` all resolve to the `2-bag-juggling` trick, and the `2-Bag Juggle` record links to it.
- **T5. Media-tag orphan guard** (unit or integration): every trick-shaped `media_tags.tag_display` resolves to an active slug or a wired alias; the only allowed non-resolving tags are the named utility set. This fails loudly when a future tag drifts.

## Smallest safe commit sequence (Part 2 portion)
1. F1 (resolver) + T1 + T2, one commit. Pure code + tests, recovers 20.
2. F2 (alias rows) + T4, one commit. Data + regression, recovers the juggle. Include V1's reciprocal fix if needed.
3. F3 is a no-op (tags already whitelisted); the existing `25_qc_media_tag_invariant.py` already serves as the T5 orphan guard.

Part 1 (dictionary field hygiene) is a separate, earlier commit per `PLAN.md`; it touches `freestyleResolvedFormulas.ts` only and shares no files with Part 2.
