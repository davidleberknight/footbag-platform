# External-Link Curated Media — Implementation Spec (Dave-ready)

**Status: design spec only. No code written, no sidecars emitted, no schema/DB/rendering changed.**
This documents a coordinated cross-track change so that already-approved **external-link tutorials**
(FootbagSpot curriculum) can enter the curated media pipeline. Authored 2026-05-29 as the follow-up to
the media-stabilization sprint (`MEMO.md`, Part C). It crosses into Dave-owned files
(`seed_fh_curator.py`, `curatorMediaService`, rendering, schema), so it is a spec for coordination, not
a unilateral change.

---

## 1. The blocker (why these rows can't promote today)

Seven reviewer-approved (`reviewer=JL`) tutorial rows in `snippet_candidates.csv` point at FootbagSpot
URLs. The curated pipeline is **YouTube/Vimeo-only end to end**, at four enforcement points:

| Layer | File:anchor | Enforcement |
|---|---|---|
| Promote script | `scripts/promote_snippet_candidates.py:118` (`detect_platform`) | returns `(None,None)` for non-YT/Vimeo → row skipped as "unembeddable host" |
| Seeder (Dave) | `scripts/seed_fh_curator.py:695` | `if platform not in ("youtube","vimeo"): raise` — **hard error; breaks the whole seed** |
| Seeder cleanup (Dave) | `scripts/seed_fh_curator.py:1150` | orphan-prune only manages `video_platform IN ('youtube','vimeo')` |
| Schema | `database/schema.sql:2160` | `video_platform TEXT CHECK (video_platform IN ('youtube','vimeo','s3'))` + shape CHECK at `:2195` requiring `video_id`+`video_url` for non-s3 |
| Rendering | `src/views/partials/video-facade.hbs` | renders an iframe facade; assumes an embeddable platform |

The `external_url` / `external_url_validated_at` columns **already exist** (`schema.sql:72-73, 2189-2190`)
but are used today only by the member/admin curator-UI upload path (`curatorMediaService` →
`validateExternalUrl`); the **curated-sidecar seed path has no external branch**. (Evidence: the single
`external_url` row in `media_items` is an `s3`-platform member upload — a Wikipedia link — not a sidecar.)

## 2. Why promote-script-only support is unsafe

Adding FootbagSpot handling to `promote_snippet_candidates.py` alone is **worse than doing nothing**: it
would emit a `curated/freestyle_tricks/*.meta.json` sidecar with a non-YT/Vimeo platform, which sits
inert until the next `seed_fh_curator.py` run — then **`seed_fh_curator.py:695` raises and aborts the
entire curated-media seed** (a `reset-local-db.sh` would fail mid-pipeline). The promote-script change is
only safe **after** the seeder, schema, and rendering accept the new platform. This is why the change
must be coordinated, and why this spec pauses before any emission.

## 3. Minimal external-link media model

Introduce a fourth video platform value, used only for link-out reference media:

```jsonc
// sidecar shape (curated/freestyle_tricks/<slug>_<id>.meta.json)
{
  "videoUrl":      "https://footbagspot.com/tutorials/v/footbag-level-3-around-the-world",
  "videoPlatform": "external",          // NEW value
  "externalUrl":   "https://footbagspot.com/tutorials/v/footbag-level-3-around-the-world",
  "thumbnailUrl":  null,                 // optional; null → generic source thumbnail
  "title":         "FootbagSpot Level 3 — Around the World",
  "creator":       "FootbagSpot",
  "sourceId":      "footbagspot_passback",
  "tier":          "CANONICAL_TUTORIAL",
  "tags":          ["#around-the-world", "#freestyle", "#trick"]
}
```

Rules for `videoPlatform: "external"`:
- `externalUrl` is **required**; `video_id`/embeddable-id is **not used** (identity is `(platform, externalUrl)`).
- Renders as a **labeled link/button card** ("Watch on FootbagSpot ↗"), never an iframe.
- `externalUrl` must be HTTP-verified before sign-off (already satisfied here: `reviewer=JL`); the seeder
  stamps `external_url_validated_at`.
- `s3` (curator-uploaded bytes) stays distinct: `external` = a link we don't host and don't embed.

## 4. Coordinated change set (by file, with ownership)

### 4a. Promote script — `scripts/promote_snippet_candidates.py` *(James-track)*
- `detect_platform` (`:118`): add a FootbagSpot host branch → return `("external", <stable-id>)` where the
  stable id is `sha1(externalUrl)[:8]`-derived (drives the filename `{slug}_{id}.meta.json` and dedup).
- `existing_video_ids` (`:129`): collect `("external", externalUrl)` identity for external sidecars so
  re-runs are idempotent (the current dedup keys on parseable `video_id` only).
- `emit_sidecar` (`:218`): when platform is `external`, write `externalUrl` (and optional `thumbnailUrl`),
  omit embed-only fields. Keep the existing `validate_media_tags` call.
- `TIER_BY_SOURCE` already maps `footbagspot_passback→CANONICAL_TUTORIAL`, `footbagspot_tutorials→STRONG_TUTORIAL` — no change.
- **Gate emission** on a capability flag (e.g. `--allow-external`) OR simply land this change *after* 4b–4e
  so no external sidecar can exist before the seeder accepts it.

### 4b. Schema — `database/schema.sql` *(Dave / schema-coordination; reversible migration)*
- Relax `media_items.video_platform` CHECK (`:2160`) to include `'external'`.
- Relax the shape CHECK (`:2195`) so an `external` row is valid with `external_url IS NOT NULL` and
  `video_id`/`video_url` NULL (parallel to the existing `s3` exemption).
- Apply via an additive migration; no column adds needed (`external_url`/`external_url_validated_at` exist).
- Mirror the change in the two row-type unions in `src/db/db.ts:5637,5667` (`'youtube'|'vimeo'|'s3'` → add `'external'`).

### 4c. Seeder — `scripts/seed_fh_curator.py` *(Dave-owned)*
- `_seed_one_sidecar` (`:695`): add an `external` branch instead of raising — read `externalUrl`, set
  `external_url`, `external_url_validated_at=ts`; leave `video_id`/`video_url` NULL.
- Identity (`:736`, `_url_ref_media_id`): key external rows on `(platform, externalUrl)`.
- INSERT (`:777`): populate `external_url` / `external_url_validated_at`; the existing column list already
  has room (only the value mapping changes for the external branch).
- Orphan-prune (`:1150`): extend the `video_platform IN (...)` set to include `'external'` so external
  rows are managed (deleted when their sidecar is removed) like YT/Vimeo rows.

### 4d. Curator media service — `src/services/curatorMediaService.ts` + `src/services/videoMedia.ts` *(Dave-owned)*
- `videoMedia.ts:9`: extend `type VideoPlatform = 'youtube'|'vimeo'|'s3'` → add `'external'`.
- Ensure the sidecar resolve/edit/delete path (`src/lib/curatorUrlSidecar.ts:228`,
  `curatorMediaService` edit/delete) treats `external` as link-reference (no oEmbed/`validateExternalUrl`
  re-fetch needed at seed time — already verified at sign-off; keep `validateExternalUrl` available for
  the member-UI path only).

### 4e. Rendering — `src/views/partials/video-facade.hbs` (+ the freestyle trick-media view-model) *(Dave-owned)*
- Add a branch: when `videoPlatform === 'external'`, render a link/button card
  ("Watch on {source} ↗", `rel="noopener noreferrer"`) using `externalUrl`, instead of the iframe facade.
- Service shaping: the trick-media view-model must carry a pre-shaped `externalHref` + `sourceLabel`
  boolean/string (templates do not build URLs from multiple vars).

### 4f. Tag invariant — `scripts/_trick_tag_invariant.py` *(James-track)*
- No change required for the trick-slug tags (`#<slug>`/`#freestyle`/`#trick` already validate). Only add
  a source gallery tag (e.g. `#footbagspot`) to `UTILITY_EXACT` **if** a FootbagSpot gallery is later wanted.

## 5. Rows this unlocks (approved, awaiting the path)

| Slug | source_id | URL | Note |
|---|---|---|---|
| around-the-world | footbagspot_passback | …/v/footbag-level-3-around-the-world | single-trick-named |
| clipper | footbagspot_tutorials | …/v/7wgbb9sh5yskgxn25y9jnmgd73ffyf | single |
| osis | shred_global | …/v/shred-global-osis-by-zac-miley | single (FootbagSpot wrapper of a Shred Global clip) |
| paradox-mirage | footbagspot_passback | …/v/footbag-level-5-bops | **multi-trick** (Level-5 "BOPs" = butterfly/osis/paradox-mirage) |
| toe-stall | footbagspot_passback | …/v/footbag-level-2-stalls | **multi-trick, shared URL** |
| outside-stall | footbagspot_passback | …/v/footbag-level-2-stalls | **multi-trick, shared URL** |
| heel-stall | footbagspot_passback | …/v/footbag-level-2-stalls | **multi-trick, shared URL** |

**Multi-trick caveat (do not skip at review):** the Level-2-stalls URL is one video tagged to three
stalls, and Level-5-bops is one video tagged to paradox-mirage. Per the curated-media skill, a multi-trick
tutorial is promoted to a trick only when that trick is **explicitly named in the title** — "Footbag
Level 2 Stalls" does not name toe/outside/heel individually. Curator call at promotion time: either (a)
accept the curriculum-level video as a shared reference across its covered stalls (it teaches all three),
or (b) hold the multi-trick rows until the future `teaches`/`components-covered` indirect-coverage edge
(ARCHITECTURE §3a) exists — which is the cleaner ontology home for "one video covers N tricks." The
single-trick rows (around-the-world, clipper, osis) have no such caveat.

## 6. Separate minor issue — YouTube Shorts (not external-link)

One approved row is blocked for an **unrelated** reason: `drifter` →
`https://www.youtube.com/shorts/nLm3UtIzOc4`. This is a YouTube video; it is only skipped because
`parse_youtube_id` (`promote_snippet_candidates.py:94`) doesn't recognize the `/shorts/{id}` path form. It
needs **no external-link work and no Dave coordination** — a one-line regex extension to accept
`/shorts/([A-Za-z0-9_-]{11})` makes it promote through the existing YouTube path (still
`videoPlatform:"youtube"`, seeder-compatible). It is a record-tier short, not a foundational tutorial, so
it is low priority — but it is the one genuinely safe, self-contained fix available now. Track it
independently of this spec.

## 7. Risks / tradeoffs

- **Schema migration is the heavyweight step.** Relaxing two CHECK constraints on `media_items` is a real
  (if additive/reversible) schema change; it must go through the normal schema-coordination + db-write-
  safety process (audit, reversible, tested). This is the main reason the change is Dave-coordinated, not
  a content edit.
- **Link-out UX divergence.** External cards behave differently from embeds (navigate away vs inline play).
  Keep them visually distinct and labeled so users aren't surprised; never style an external card to look
  like a playable embed.
- **Link rot.** External URLs can die; FootbagSpot speculative URLs are known to 404. Mitigation:
  `external_url_validated_at` stamping + a periodic re-validation pass (out of scope here). These 7 are
  already `reviewer=JL`-verified.
- **Ontology neutrality preserved.** External tutorials are still RECORD/TUTORIAL *teaching* media — no
  doctrine implication (consistent with the media-stabilization "media = teaching, not ontology" rule).
- **Scope creep guard.** `external` is for *link-reference* media only; it is not a general "any URL"
  escape hatch. Restrict the promote-script host branch to a known allow-list (FootbagSpot) so arbitrary
  hosts don't silently become external sidecars.

## 8. Acceptance criteria

1. `seed_fh_curator.py` seeds an `external` sidecar into a `media_items` row with `video_platform='external'`,
   `external_url` set, `external_url_validated_at` stamped, `video_id`/`video_url` NULL — **without raising**.
2. Schema accepts that row (both CHECK constraints satisfied); a fresh `reset-local-db.sh` completes clean.
3. `25_qc_media_tag_invariant.py` passes (tag shape unchanged; trick tags still resolve).
4. Trick-detail page renders the external row as a labeled link card (no iframe), opens in a new tab with
   `rel="noopener noreferrer"`.
5. `promote_snippet_candidates.py` is idempotent on external rows (second run emits 0).
6. The 3 single-trick FootbagSpot rows (around-the-world, clipper, osis) promote and render; the 4
   multi-trick rows follow the curator's §5 decision.
7. No regression to existing YouTube/Vimeo media (same counts, same rendering).

## 9. Suggested migration path (phased, reversible)

1. **Phase 0 (this doc).** Spec + curator sign-off on the model and the multi-trick policy.
2. **Phase 1 — schema.** Additive migration relaxing the two CHECKs + db.ts row-type unions. Reversible.
3. **Phase 2 — seeder + service + rendering (Dave).** External branch in `seed_fh_curator.py`,
   `VideoPlatform` union, `video-facade.hbs` link card + view-model `externalHref`/`sourceLabel`. Tests:
   seeder external-branch unit; rendering snapshot; route/integration for an external trick-media row.
4. **Phase 3 — promote script (James).** External host branch + dedup + emission, landed only after Phase 2
   so no seed-breaking sidecar can exist first.
5. **Phase 4 — promote the 3 single-trick rows**, dry-run → emit → reseed → QC. Multi-trick rows per §5.
6. **(Independent) YouTube Shorts** — land the `/shorts/` regex fix whenever; not gated on the above.

---

### Provenance
Spec derived from read-only inspection on 2026-05-29: `promote_snippet_candidates.py`,
`seed_fh_curator.py`, `database/schema.sql`, `src/services/videoMedia.ts`, `src/db/db.ts`,
`src/services/curatorMediaService.ts`, `src/lib/curatorUrlSidecar.ts`,
`src/views/partials/video-facade.hbs`, and the 8 blocked `snippet_candidates.csv` rows. No files edited.
