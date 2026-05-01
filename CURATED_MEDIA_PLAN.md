# CURATED_MEDIA_PLAN.md

Status: **PAUSED**. Cross-track decision needed with the legacy-data maintainer (James) before implementation can resume.

This document is the full handoff: origin context, the design as agreed, the schema-rule conflict that surfaced, analysis of why the rule exists, the three options with pros/cons, and the questions James needs to answer. Once James answers, the platform maintainer (Dave) decides direction and resumes implementation.

---

## How to read this doc

- **If you're Dave or his Claude resuming this work**: read top to bottom; the answers James provides at §"Questions for James" determine which option moves forward.
- **If you're James or his Claude (directed here from a todo in `legacy_data/IMPLEMENTATION_PLAN.md`)**: skip to §"For James's Claude" then §"Questions for James". Ask one question per turn. Capture answers inline (commit them back to this file). Do not make schema or code decisions; just gather James's answers + rationale.

---

## Origin

The platform-side maintainer is implementing `A_Upload_Curated_Media` (US §6.3) before go-live. The current admin panel at `/admin/curator/upload` ships only photo + video upload that lands in the `media_items` table (the member-uploaded gallery layer). Missing: list, edit, delete, a unified storage chain, a sustainable sync strategy, an opt-in deploy flag, per-trick tag identity, named galleries, and uploader-as-tag unification.

Dave's vision: one unified admin curator workflow handling upload + edit + delete + sync; `/curated/` is a git-tracked tree of source files plus per-file sidecar metadata; James and Dave both contribute snippets to `/curated/` via git; the maintainer deploys; deploy-time seed pass propagates to S3 via per-file PUT; never bulk re-upload.

Approved design lives in `~/.claude/plans/vast-wishing-tulip.md`. It is reproduced in §"Approved design" below for self-contained handoff.

---

## Decisions made so far

1. **`/curated/` is git-tracked** at the repo root. Sidecar `.meta.json` per source file (sibling in the same directory) holds tags + caption + per-file metadata. Atomic per-file commits; no merge conflicts when contributors add files in parallel.
2. **Per-file sidecar format chosen over a single manifest** because of the multi-contributor parallel-add workflow (James adds many snippets; manifest would conflict).
3. **Videos are short snippets** (long-form goes to YouTube/Vimeo). No git-LFS needed.
4. **Admin UI scope (option A from earlier discussion)**: local-dev runs upload + edit + delete; prod admin UI runs only edit + delete. Upload action writes file + sidecar to local `/curated/`; contributor commits both. Prod's only durable home for curated content is git.
5. **`#curated` is admin-only and equals the FH/admin uploader marker.** Auto-applied by `curatorMediaService` for every admin upload. Rejected as input from any non-system uploader. Two enforcement points (auto-add + reject).
6. **Tag namespace rules per US §1.1 line 245**: only `#event_*` and `#club_*` use the strict namespaced format. Members use bare slug as tag (`#david_leberknight`). Tricks use bare slug (`#ripwalk`). This is THE existing rule, not new.
7. **Per-trick identity**: each freestyle dictionary entry gets a canonical `hashtag` field equal to its bare slug. Pipeline validates: tricklike sidecar tags matching a known dictionary slug auto-link; tricklike tags not in the dictionary emit a warning but do not abort.
8. **Standard tag stack for trick videos**: sidecar `tags` carries `#freestyle #trick #ripwalk`; pipeline auto-prepends `#curated`; final `media_tags` row set: `#curated #freestyle #trick #ripwalk`.
9. **Named galleries**: bookmarkable URLs at `/galleries/{slug}`. Implemented as a `galleries` table + `galleries_media` bridge for explicit ordering. NOT a tag namespace. Distinct from tag-collection galleries.
10. **Filename-referenced slots**: hardcoded landing-page slots reference media by `source_filename` (column already in `media_items`).
11. **Uploader as tag unification**: `#curated` IS the uploader filter for FH content. When member uploads exist later, they auto-apply `#{member_slug}` per the bare-slug rule. One query path for all gallery types.
12. **Deploy: opt-in `--with-curated` flag**. Without it, S3 media and `media_items` rows are untouched. With it, `/curated/***` is rsynced and `curatorSeedService.reconcile()` runs on the host (per-file PUT for diffs, or full upload after S3 wipe). The existing `aws s3 sync RELEASE_DIR/data/media/ → s3://` block (lines 298-310 of `scripts/internal/deploy-rebuild-remote.sh`) is removed unconditionally; the workstation `python scripts/seed_curator_media.py` is no longer invoked before deploy. Composes with all existing flags (`--code-only`, `--with-db`, `--from-csv`, `--keep-media`, etc.).
13. **Edit semantics**: caption + tags edits are pure DB writes + sidecar JSON rewrite; no S3 traffic, no re-encode. File replacement = delete-old + upload-new (content-hashed `media_id` makes in-place replacement meaningless).
14. **Delete semantics**: hard delete; cascades DB rows + S3 variant keys + (on prod) emits a `git rm` snippet for the operator. Audit row written. No soft delete for curator content (soft delete is for the separate member-moderation flow).
15. **Inheritance from prior plans**: inherits `~/.claude/plans/snappy-wondering-trinket.md` (canonical admin-upload + bootstrap design, ratified, partially executed). Adopts the `media_items.source_filename` column from `~/.claude/plans/lazy-soaring-emerson.md` (column already in schema). Supersedes that plan's directory-relocation half (`/curated/` stays at repo root).

---

## Approved design

(Verbatim from `~/.claude/plans/vast-wishing-tulip.md` for self-contained handoff. The plan file remains the single source of truth; this section is a snapshot for cross-session readability.)

### Storage chain

```
admin uploads via /admin/curator/upload (local dev)  OR  git commit /curated/{file} + {file}.meta.json
   │
   ▼
/curated/{slug}.{ext}   +   /curated/{slug}.meta.json   ← git-tracked source of truth
   │
   ▼ (re-encoded by curatorSeedService.reconcile() on host during --with-curated deploy)
data/media/{system_member_id}/detached/   ← derived variants (thumb, display, video, poster)
   │
   ▼ (per-file PUT via MediaStorageAdapter)
S3 + CloudFront                          ← served at /media/{key}, immutable cache
   │
DB: media_items + media_tags              ← metadata cache (sidecar is authoritative)
```

### Sidecar `.meta.json` schema

```json
{
  "caption": "Ripwalk single-leg setup, slow motion",
  "tags": ["#freestyle", "#trick", "#ripwalk"],
  "isAvatar": false,
  "poster": "ripwalk.poster.jpg"
}
```

`#curated` is auto-applied by the pipeline; never hand-written. `poster` is optional (video only). `isAvatar` (optional, defaults false) marks images that should also update `members.avatar_media_id` for the curator system account.

### Unified processing pipeline

One pipeline used by every entry path (deploy seed, local-dev admin UI upload, prod admin UI edit/delete). Implemented in `curatorMediaService` so all paths share validation, scrubbing, transcode parameters, and DB write semantics:

1. Resolve sidecar; validate schema.
2. Compute `media_id` as content-hash of source bytes plus deterministic slug seed.
3. Detect format; reject non-whitelisted formats early.
4. Re-encode + strip metadata via existing `imageProcessor.processPhoto()` / `transcodeCuratorVideo()`.
5. Write variants via `MediaStorageAdapter.put()`.
6. Compute canonical tag set (sidecar tags + `#curated` auto-applied).
7. Reject `#curated` from non-system entry paths.
8. Validate trick tags against freestyle dictionary; warn (not abort) on tricklike-but-unknown.
9. Insert/upsert `media_items` row (key on `media_id`); insert/replace `media_tags` rows.
10. Append audit row.

Idempotency: re-running against unchanged `/curated/` produces zero DB writes and zero S3 PUTs.

### Admin UI actions

`/admin/curator/` (gated by `requireAdmin`):

1. **List** at `/admin/curator/media`. Paginated; thumbnail + filename + caption + tag chips + edit/delete actions; filter by tag.
2. **Upload** at `/admin/curator/upload`. Local-dev only; returns 404 on prod. Surfaces dictionary-backed autocomplete chips for trick tags.
3. **Edit** at `/admin/curator/media/:id/edit`. Caption + tags only. Writes sidecar + DB. Available on local-dev and prod.
4. **Delete** at `/admin/curator/media/:id/delete`. Hard delete; cascades DB + S3; emits `git rm` snippet on prod.

### Deploy flag

`--with-curated` opt-in. See §"Decisions made so far" item 12.

### Behavior matrix

| Invocation | Rsync /curated? | Seed pass? | S3 touch? | DB rebuild? |
|---|---|---|---|---|
| `--code-only` | No | No | None | No |
| `--code-only --with-curated` | Yes | Yes | Per-file PUT for diffs | No |
| (default = `--with-db --from-csv`) | No | No | None | Yes |
| `--with-db --with-curated` | Yes | Yes | Per-file PUT (or full upload after wipe) | Yes |
| `--with-db --keep-media` | No | No | None | Yes |
| `--with-db --keep-media --with-curated` | Yes | Yes | Per-file PUT for diffs | Yes |

### Galleries

Three query patterns:

1. **Tag-collection** (existing `media_tags` index): event/club/trick/uploader filters.
2. **Named** (new `galleries` + `galleries_media` bridge tables): bookmarkable `/galleries/{slug}` with explicit ordering.
3. **Filename-referenced** (existing `media_items.source_filename`): hardcoded landing-page slots like the home hero.

---

## The new problem: schema's "no merge" layer-separation rule

`database/schema.sql` lines 3473-3493 declares a separate table family for curated freestyle reference media:

- `freestyle_media_sources` — registry of provenance (DVD, website, YouTube channel, creator)
- `freestyle_media_assets` — one row per documented media asset (video/image, url, title, creator, source_id, review_status, is_active)
- `freestyle_media_links` — many-to-many edges (entity_type ∈ {trick, person, event, record}, entity_id, start_seconds, end_seconds, is_primary)

The schema comment is unambiguous: **"Curated media assets. NOT a substitute for media_items (member-uploaded). The two systems must never be merged; see GOVERNANCE on layer separation."**

Per `database/CLAUDE.md`: schema.sql is authoritative; do not invent or override relationships.

The plan as approved would write trick reference videos like `ripwalk.mp4` into `media_items` with tags `#curated #freestyle #trick #ripwalk`. That violates the rule.

### Confirmed state of `freestyle_media_*` (not just planned)

Despite the schema comment saying "Loaders (planned)", these tables ARE actively loaded today by the legacy-data pipeline:

- `legacy_data/event_results/scripts/22_load_freestyle_media_assets.py` — loads assets + links
- `legacy_data/pipeline/qc/check_media_coverage.py` — QC over `freestyle_media_assets`, `freestyle_media_links`, `freestyle_media_sources`
- `legacy_data/pipeline/qc/check_snippet_candidates.py` — references `freestyle_media_sources` for slug + source_id validation

So the schema's `(planned)` comment is stale; the system is real and load-bearing for the historical pipeline. James's track depends on it.

---

## Why does the no-merge rule exist?

The schema doesn't spell out the rationale (the GOVERNANCE pointer in the schema comment did not return matches in `docs/GOVERNANCE.md` on grep). Best inferences from schema shape and pipeline use:

1. **Provenance richness**. `freestyle_media_sources` (DVD title, channel name, creator, source_type) captures reference-archive provenance that doesn't apply to member uploads. Mixing them would force `NULL`-heavy provenance columns on every `media_items` row.

2. **Multi-entity linkage with clip ranges**. `freestyle_media_links` supports one asset linked to many entities (a TT1 DVD clip referenced by a trick + a record + a person at specific timestamps). `media_items` has no equivalent: one media item belongs to one uploader and gets aggregated via tags, with no native clip-range or multi-entity-with-time-windows semantics.

3. **`is_primary` per entity**. Trick pages need a featured video; `freestyle_media_links` has a partial UNIQUE index enforcing at most one primary per (entity_type, entity_id). `media_items` + tags has no equivalent enforcement.

4. **Privacy boundary**. `media_items` rows reference `uploader_member_id` (PII; subject to GDPR purge on member deletion). Curated reference media has no individual uploader from the public site's perspective; it shouldn't share a column whose semantics include member-PII purge cascades.

5. **Moderation pipeline**. Member uploads use `moderation_status` + `moderation_reason` + member-flag rate limits. Curated reference media is admin-curated by definition; doesn't need that pipeline. Mixing them would mean every reference asset carries unused moderation columns and gets exposed to member-flag handling code.

6. **Lifecycle differences**. Member uploads can be deleted by the uploader at any time. Curated reference is permanent unless explicitly retired (`is_active = 0`). Mixing them risks one falling under the other's deletion rules.

7. **Schema evolution stability**. Changes to the member-upload model (e.g. adding tier-gated upload limits) shouldn't ripple through reference-media loaders. Vice versa.

8. **Query clarity**. When joining trick → reference media, you know the result set is curated only. When listing a member's gallery, no reference content leaks in. Mixing requires a discriminator everywhere or risks subtle bugs.

The rule is defensible. Probably introduced specifically to keep the historical pipeline (which feeds DVD-era archival material) cleanly separated from the user-generated content layer.

---

## Three options for resolving the conflict

### A. Honor the layer separation. Two parallel admin upload paths.

- General curated content (FH avatar, banners, demos that aren't trick-specific) continues to land in `media_items` via the existing `curatorMediaService`.
- Trick reference media (the `ripwalk.mp4` case) lands in `freestyle_media_assets` + `freestyle_media_links` via a new `freestyleMediaService`.
- Admin dashboard exposes two upload paths (or one upload form with a `mediaKind` selector that routes).
- `/curated/` tree gets sub-routing or a `mediaKind` field in the sidecar that determines which table the seed pass writes to.

**Pros**: schema rule preserved; James's pipeline continues unchanged; provenance + clip-range + is_primary + moderation semantics all stay where they belong; clear separation of concerns.

**Cons**: contradicts Dave's "unified curator workflow" intent; two admin UI surfaces (more code); operator has to think about which kind they're uploading; per-file sidecar grows a `mediaKind` field; `freestyle_media_assets.url` mismatches the local `/curated/` filesystem source-of-truth model unless we resolve how URLs and local files relate.

### B. Drop `freestyle_media_*`. Route everything through `media_items` + tags.

- `freestyle_media_assets` is dropped from schema.
- `freestyle_media_links` is either dropped or rewritten (`media_id` retargets to `media_items.id`; or replaced entirely by tag-based linkage).
- `freestyle_media_sources` is either dropped or kept as a provenance-only reference table.
- All curated content lives in `media_items`; trick linkage is via `media_tags` + tag-query.

**Pros**: simplest, matches Dave's unified vision; one storage layer; one admin UI; one pipeline.

**Cons**: BREAKS James's pipeline (`load_freestyle_media_assets.py` and the QC scripts depend on these tables); loses clip-range semantics (`start_seconds`/`end_seconds`) — tag-based linkage cannot express "this 10-second segment of this video belongs to this trick"; loses `is_primary` enforcement; loses provenance richness; significant doc-sync (DD, GOVERNANCE, DATA_MODEL); requires James's full agreement and his pipeline's rewrite.

### C. Hybrid: `media_items` for storage; `freestyle_media_links` retargeted as the trick-membership join.

- Curated source files + variants live in `media_items` (one storage chain, one admin UI for upload/edit/delete; matches Dave's vision).
- When a media item carries a trick tag matching a dictionary slug, the seed pass also writes a row into `freestyle_media_links` (entity_type='trick', entity_id=slug, media_id=media_items.id) so trick pages can query the rich linkage with clip ranges + is_primary.
- `freestyle_media_assets` is either dropped (its url + title + creator fields move to `media_items` columns) OR kept as a thin pre-asset registry that points at `media_items` (denormalized).
- `freestyle_media_sources` stays for archival provenance.

**Pros**: keeps Dave's unified upload+edit+delete flow; preserves trick-linkage richness; bounded schema rewrite (drop one table, retarget one FK).

**Cons**: BREAKS James's `load_freestyle_media_assets.py` because it expects `freestyle_media_assets` to exist as the asset table; requires James to rewrite his loader to write `media_items` rows for assets with provenance metadata; the privacy-boundary concern (5 above) reappears (member-uploader PII columns adjacent to reference-media rows); the moderation-pipeline concern (5) reappears; introduces a discriminator (a `kind` column on `media_items` or implicit-via-tags); the layer-separation rule's underlying concerns are partially re-introduced.

---

## Recommendation (subject to James's input)

Earlier in the design dialogue Dave's working recommendation was C. After confirming `freestyle_media_*` is actively loaded today (not deferred), C looks weaker because it forces James's pipeline to rewrite. A may be the better answer despite contradicting the unified-flow ideal — it preserves James's working system and respects the layer-separation rule.

**Final call lives with the maintainer pair after James answers the questions below.**

---

## Cons of the unified-storage approach (B and partially C), spelled out

For the maintainer's later evaluation:

1. **Privacy column adjacency**. `media_items.uploader_member_id` is PII subject to GDPR-purge cascades. Curated reference rows would carry this column populated with the curator system account, which is fine, but the same query paths that touch member uploads would touch reference rows; a privacy-purge bug in member-upload code could accidentally affect reference content (though the system account isn't a real member and isn't subject to purge).
2. **Moderation pipeline noise**. `moderation_status` exists for member-flag handling. Curator content would carry `moderation_status='active'` permanently. Member-flagging UI would need to special-case curator content to never expose flag actions, OR risk members flagging FH content and triggering admin review queues for content the admin curated themselves.
3. **Loss of clip-range semantics in option B**. A DVD clip at `[start_seconds=42, end_seconds=58]` cannot be expressed by media_items + tags alone. Either `media_items` grows clip-range columns (which only matter for reference media), or DVD imports lose the ability to point at sub-clips, or we reintroduce a join table (which is essentially `freestyle_media_links` in disguise).
4. **Loss of `is_primary` enforcement in option B**. Trick pages need to pick a featured video. Tag-based queries would need an external "featured" tag (`#trick_primary_ripwalk`?) and an enforcement check at write time, which duplicates what `freestyle_media_links`'s partial UNIQUE index does for free.
5. **Loss of `freestyle_media_sources` registry** in option B. Provenance for archival sources (DVD title, channel name, creator) becomes free-text on media_items rows or a parallel side table.
6. **Doc-sync surface**. GOVERNANCE rule, DD entries, DATA_MODEL all need rewrite for B and partially for C.
7. **Pipeline coordination**. James's loaders need to rewrite for B and C. Cross-track work; can't ship platform side without his side moving in lockstep.
8. **Test coverage gap**. The current `tests/` may rely on `freestyle_media_*` rows existing for trick-page rendering. Any merge would need to not break those.

---

## For James's Claude

You're being directed to this file from a todo entry in `legacy_data/IMPLEMENTATION_PLAN.md`. Read this whole file first.

Background: Dave is implementing the admin curator content lifecycle on the platform side and needs cross-track input from you (the historical-pipeline maintainer) before resuming. The schema's `freestyle_media_*` layer-separation rule conflicts with Dave's unified-curator design. You own that layer and its loaders; Dave needs your call on how to reconcile.

Your job: ask James the questions in §"Questions for James" below. **One question per turn.** Capture each answer inline in this file (write his answer immediately under the question), commit, then move to the next. Do not propose schema or code changes; do not pick options. Just gather his answers + rationale.

When all questions are answered, post a one-sentence summary at the bottom of this doc indicating James's preferred direction and any open follow-ups.

---

## Questions for James

### Q1. Why was the no-merge rule introduced?
What's the original rationale for the strict separation between `freestyle_media_*` and `media_items`? Hard constraint (privacy/compliance/architecture) or convention?

**James's answer**:

The no-merge rule between `freestyle_media_*` and `media_items` is an architectural separation, not just a convention. It exists to preserve two fundamentally different classes of media with different guarantees, lifecycles, and constraints.

**Core rationale (authoritative):**

1. **Reference vs User-Generated Media (hard boundary)**
   - `freestyle_media_*` = curated, canonical, reference-quality media tied to the historical record (like a textbook)
   - `media_items` = user-generated content (like a social platform)
   - These serve different purposes and must not be conflated.

2. **Identity / PII isolation (hard constraint)**
   - `media_items` includes `uploader_member_id` → subject to deletion, GDPR-style concerns
   - `freestyle_media_*` has no user ownership, no deletion cascade
   - Mixing them creates data integrity and compliance risk

3. **Lifecycle differences (hard constraint)**
   - Curated media: persistent, versioned, editorially controlled
   - User media: mutable, deletable, moderation-driven
   - A shared table would force incompatible lifecycle rules

4. **Query correctness and guarantees (hard constraint)**
   - When querying trick reference media, results must be 100% curated, high-confidence
   - No filtering logic should be required to exclude user uploads
   - This is a data contract, not just convenience

5. **Data model specialization (strong design driver)**
   - `freestyle_media_*` supports:
     - multi-entity linking (trick, person, event)
     - clip ranges (start/end timestamps)
     - per-entity primary designation
   - These are core features, not extensions

6. **Provenance clarity (design driver)**
   - Curated media tracks structured sources (DVDs, official tutorials, known channels)
   - This is different from user uploads and should remain explicit and queryable

7. **Schema stability and evolution (design driver)**
   - The two systems evolve independently:
     - curator/reference system → editorial + historical correctness
     - `media_items` → product features, moderation, UX
   - Coupling them increases risk and slows both

---

### Q2. Confirm `freestyle_media_*` is actively loaded today.
The grep shows `legacy_data/event_results/scripts/22_load_freestyle_media_assets.py` and the QC scripts under `legacy_data/pipeline/qc/` depend on these tables. Is this still the active path, or are these scripts deprecated?

**James's answer**:

Confirmed active. Loaders `21_load_freestyle_media_sources.py` / `22_load_freestyle_media_assets.py` / `23_load_freestyle_media_links.py` are all wired into `scripts/reset-local-db.sh` and run on every fresh DB rebuild. Curated CSVs at `legacy_data/inputs/curated/media/{media_sources,media_assets,media_links}.csv` are the source of truth. QC at `legacy_data/pipeline/qc/check_media_coverage.py` and `check_snippet_candidates.py` reference these tables. Current DB state: 47 assets / 84 links / 40 active tricks with primary video. Not deprecated.

---

### Q3. What's the source mix for `freestyle_media_*` today vs planned?
Today: which sources populate (DVDs, YouTube, archived web, other)? Planned: what's coming next (more DVD clips, member-contributed snippets, other)?

**James's answer**:

**Today** (sources with assets):

| source_id | source_type | asset count |
|---|---|---:|
| `passback_records` | database (YouTube clips of competition records) | 38 |
| `anz_trikz` | YouTube tutorials (Anssi Sundberg) | 4 |
| `footbagspot_passback` | website | 3 |
| `footbagspot_tutorials` | website | 1 |
| `shred_global` | YouTube | 1 |

Sources registered with zero assets (configured but unused): `tt1`, `tt2`, `everything_footbag`, `polini_pointers`, `footbag_foundations`.

**Planned: open.** Many resources are candidates, including AnzTrikz (more tutorials beyond the four loaded), and hopefully TT1 and TT2 if obtained. At this point the goal is to assemble the best sources, not to commit to a sequence.

---

### Q4. Which option matches your view of the right path forward?
The three options are described in detail in §"Three options for resolving the conflict" above. In short:

- **A. Honor separation**. Trick reference videos go into `freestyle_media_assets`; general curated stays in `media_items`; two admin UI flows.
- **B. Drop `freestyle_media_*`**. Everything in `media_items` + tags; your loaders rewrite to write `media_items` rows.
- **C. Hybrid**. Storage in `media_items`; `freestyle_media_links` retargeted to point at `media_items.id` for trick-membership; your loaders rewrite to drop the asset row and use the new linkage.

Or a different option you'd propose.

**James's answer**:

**Option A.** Reference media should remain a separate curated/canonical subsystem. The platform curator workflow can create and manage broader `media_items`, but it should not replace or absorb `freestyle_media_*`. The bridge should be semantic linking, not table unification.

---

### Q5. Are clip ranges (`start_seconds` / `end_seconds`) load-bearing?
Several sources you load (DVDs, multi-trick segments) need clip-range semantics. If we move toward option B or C, can clip ranges be carried by adding columns to `media_items`, or do they fundamentally need a separate join table?

**James's answer**:

At this point, do not use `start_seconds` / `end_seconds`. Use the entire video clip. The columns stay in the schema (Option A keeps `freestyle_media_links` unchanged), but the curator workflow does not need to populate them right now. Existing populated values may remain; new entries leave them NULL.

---

### Q6. Is `is_primary` per (entity_type, entity_id) load-bearing?
Trick pages need a featured video. The partial UNIQUE index on `freestyle_media_links` enforces this. If we merge layers, where should `is_primary` enforcement live?

**James's answer**:

Yes, load-bearing. Enforcement stays in `freestyle_media_links` via the partial UNIQUE index `uq_freestyle_media_links_primary ON (entity_type, entity_id) WHERE is_primary = 1`. No change needed under Option A; no migration required.

---

### Q7. Source provenance: does `freestyle_media_sources` survive any of these options?
DVD title / channel name / creator metadata is rich. If we keep it (option A or partial C), no problem. If we drop it (option B), where does provenance go?

**James's answer**:

`freestyle_media_sources` survives intact under Option A. The 10 currently-registered sources (`anz_trikz`, `tt1`, `tt2`, `passback_records`, `footbagspot_passback`, `footbagspot_tutorials`, `shred_global`, `everything_footbag`, `polini_pointers`, `footbag_foundations`) and any future entries continue to be the canonical provenance registry for reference media.

---

### Q8. Who owns the implementation work for the option you pick?
Option A: Dave's track only (new `freestyleMediaService` on the platform side; your pipeline unchanged). Option B or C: cross-track work; you rewrite loaders, Dave rewrites the platform side. Either way, what's the right sequence and who blocks whom?

**James's answer**:

Two-stage workflow under Option A:

1. **Curator-side intake (Dave's track):** I support adding structured curator-side organization such as `curated/freestyle_tricks/`. That is an intake / review / source-management structure, not a requirement to merge storage tables. Dave owns this directory layout, the admin UI for it, and the review process.
2. **Reference-layer publish (James's track):** Curator-managed freestyle trick media lives in the intake structure first, then publishes into the `freestyle_media_*` reference layer after review. The historical-pipeline maintainer owns the publish step and the loaders that populate `freestyle_media_assets` + `freestyle_media_links`.

Yes to structured curated folders / workflow; no to collapsing `freestyle_media_*` into `media_items`. Dave's curator slice is not blocked by my pipeline; my pipeline is not blocked by his slice. The two systems coexist and exchange media via the intake → publish handoff.

---

## How to resume

Once James answers above:

1. James (or his Claude) commits this file with the answers.
2. Dave's next session reads §"Questions for James" answers, picks the direction, and updates `~/.claude/plans/vast-wishing-tulip.md` to reflect the chosen option.
3. The 5 task batches in Dave's task list resume execution from Batch 1 against the revised plan.

---

## Suggested todo line for `legacy_data/IMPLEMENTATION_PLAN.md`

To insert under James's "Active work" or "External blockers" section:

```
- **Cross-track decision needed: curator content lifecycle vs `freestyle_media_*` layer separation.** Dave's curator slice (`A_Upload_Curated_Media`) needs your input on how to reconcile the unified-curator design with the schema's `freestyle_media_*` no-merge rule. Read `CURATED_MEDIA_PLAN.md` at repo root and answer the questions in §"Questions for James". Blocks: Dave's curator slice cannot resume until your answers land.
```

---

## Plan file reference

Full pre-conflict plan: `~/.claude/plans/vast-wishing-tulip.md` (gitignored / per-machine).

---

## James's direction (closing summary, 2026-05-01)

**Option A.** `freestyle_media_*` remains a separate curated/canonical reference subsystem; do not merge into `media_items`. Bridge via semantic linking, not table unification. A curator-side intake structure (e.g. `curated/freestyle_tricks/`) is welcome as a review/source-management layer that publishes into `freestyle_media_*` after review. Clip-range columns stay in schema but new entries leave `start_seconds` / `end_seconds` NULL for now. No follow-ups blocking Dave's curator slice from resuming.
