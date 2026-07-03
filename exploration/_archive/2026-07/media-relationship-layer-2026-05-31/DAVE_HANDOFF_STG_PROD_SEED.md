# Dave hand-off: footbag.org Video Moves demos — stg/prod seed + demonstration-bucketing follow-up (2026-05-31)

## Part A — stg/prod seed request (ready to run)

17 re-hosted footbag.org demonstration clips (13 freestyle tricks) are committed under
`curated/freestyle_demos/` (commits `f2de4b31` manifest + `#footbag_org` whitelist, `256b2796`
binaries + posters + sidecars). They use the **existing file-paired curator S3 path**
(`seed_fh_curator.py: seed_file_paired_sidecars`) — no schema/seeder changes were made.

Please run the standard curated-media seed in **staging**, then **prod**:

- `seed_fh_curator.py` picks them up automatically (binaries committed; no out-of-band transfer).
- Prod S3: `deploy_to_aws.sh --sync-media` pushes `data/media/` → S3.
- Post-seed QC: `25_qc_media_tag_invariant.py` shows **0 violations for `#footbag_org` rows**
  (tag is whitelisted). Coverage: 13 tricks gain demonstration media (`24_qc_freestyle_media_coverage.py`).

**Verified locally (this checkout, full `reset-local-db.sh` + parser-population):** all 17 render in
the trick-detail Reference Media block, the `s3` video + poster serve 200 (`video/mp4`/`image/jpeg`),
captions are move-name-only, and **no contributor name leaks into rendered HTML**.

## Part B — known display gap + complete future fix (NOT done; needs Dave-owned seed change)

**Current behavior:** the demos render and play correctly, but under the **"Tutorials"** heading with
the `#footbag_org` **tag chip** rather than a source label. They should be under **"Demonstrations"**
with source label **"footbag.org"**.

**Root cause:** the file-paired seed path leaves `media_items.source_id = NULL` (its `item` dict and
`seed_video_item`'s INSERT carry no `source_id`; only the URL-ref path sets it from a sidecar
`sourceId`). The reference-media renderer buckets by `tierOf(source_id)` in `freestyleService.ts`; with
`source_id` NULL it falls through to the "unclassified → Tutorials" default, and the source label is null.

An app-side-only `SOURCE_TIER`/`SOURCE_LABELS` mapping for `footbag_org` was trialed and **deliberately
reverted** — it is inert while `source_id` is NULL, and dormant code makes the state harder to reason
about. The fix must land seed-side first, then app-side, together:

1. **(Dave) File-paired sidecar gains an optional `sourceId`** field, and `seed_video_item` /
   `seed_file_paired_sidecars` write it to `media_items.source_id`.
2. **(Dave) `media_sources` has a `footbag_org` row** (FK target for `source_id`). Add to
   `legacy_data/inputs/curated/media/media_sources.csv` (read by `_bootstrap_media_sources`).
3. **(James) Add `"sourceId": "footbag_org"`** to the 17 `curated/freestyle_demos/*.meta.json` sidecars
   (trivial once the field is supported; the acquisition script can emit it).
4. **(James) Re-add the app-side mapping** in `src/services/freestyleService.ts`:
   `SOURCE_TIER.footbag_org = 'DEMONSTRATION'` and `SOURCE_LABELS.footbag_org = 'footbag.org'`.
5. **Verify:** demos then render under "Demonstrations" with the "footbag.org" source label; re-run the
   two QC scripts.

This is a coordinated change; none of it is required for Part A to ship — the demos are functional today.

## Part C — optional browsable gallery (operator / admin UI, Dave's surface)

If a browsable footbag.org archive cluster is wanted (sibling to the existing `shred_global` /
`tricks_of_the_trade` galleries), create it via the admin UI — do not hand-author
`curated/galleries/*.json`:

- **Title:** "footbag.org Video Moves"
- **Criteria tag (AND):** `#footbag_org`   **Exclude:** none   **Sort:** `upload_desc`
- Yields a 17-clip cluster. Not required; the trick-detail pages already surface each clip by `#<slug>`.
