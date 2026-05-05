# Tricks of the Trade Series View -- Read-Only Spec

## 1. Goal

Surface the WorldFootbag *Tricks of the Trade* video series (TT #1 through TT #42, taught by Kenny Shults) as a structured, ordered list. The view exposes the lesson sequence at a glance, marks which lessons have been integrated into the dictionary, and flags missing lessons so curation gaps are visible.

The view is read-only. It does not promote, write sidecars, or mutate any table.

## 2. Non-goals

- No promotion of staging CSV rows to sidecars.
- No schema changes; no new tables; no new columns.
- No writes to `media_items`, `media_tags`, `media_sources`, `freestyle_tricks`, or any sidecar file.
- No automated YouTube-channel polling. The TT inventory is the 42-lesson roster captured in memory `reference_worldfootbag_channel.md`; updates to the source channel are an offline process.
- No editorial reordering. Sort is strict TT-number ascending.

## 3. Route

```
GET /freestyle/tt-series
```

- Public, unauthenticated.
- Cache-control parity with other public freestyle pages.
- Linked from `/freestyle` landing nav under "Tutorials" (or equivalent), and from each trick detail page that has a TT lesson.
- No pagination. The full list of 42 entries fits one page; ranking and grouping happen via the data shape described below, not via URL.

## 4. Data sources (read-only)

| Source | Use |
|---|---|
| `media_items` | Find video rows where `source_id = 'tt_youtube'` OR `caption LIKE '%Tricks of the Trade%'` |
| `media_tags` | Trick-slug tag (the non-meta `#trick-slug` chip on each TT row) is the sidecar to dictionary join key |
| `media_sources` | Tier and creator metadata for the TT source row (single row, `source_id = 'tt_youtube'`) |
| `freestyle_tricks` | Resolve trick slug to canonical_name + `is_active` flag (drives ACTIVE vs PENDING distinction) |
| `freestyle_trick_aliases` | Fall back to alias resolution when a TT row carries a tag that maps to an alias rather than a canonical slug |
| `curated/freestyle_media/tt_roster.csv` | The TT roster (42 entries with TT-number, lesson title, optional canonical-trick mapping). Authoritative enumeration of which TT numbers exist. |

The TT roster lives in `curated/freestyle_media/tt_roster.csv` (under the existing `curated/freestyle_media/` staging directory used by the PassBack intake). It is the single source of truth for "which TT numbers exist" and for the lesson-title text. Sidecars provide the video URL and confirm presence; they do not enumerate the series. The view loads the CSV at request time (small, 42 rows, no caching needed) or at boot, at the implementer's discretion.

### 4.1 `tt_roster.csv` schema

| Column | Type | Required | Description |
|---|---|---|---|
| `tt_number` | int 1..42 | yes | Lesson number; primary key |
| `lesson_title` | string | yes | Display title (no ADD parentheticals; nav copy) |
| `is_meta` | 0 or 1 | yes | 1 marks non-trick entries (e.g. TT #1 Shoes); excluded from active/pending/missing counts |
| `expected_trick_slug` | slug | no | Canonical trick slug the lesson teaches, when known. Empty for meta rows or roster rows whose mapping is still unconfirmed |
| `expected_video_id` | YouTube id | no | Optional override for lesson-number extraction when the title regex fails (see §5) |
| `notes` | string | no | Curator-facing notes; not rendered |

Editing the roster is a curator action, not a developer action. Re-runs of the view pick up CSV edits automatically.

## 5. Lesson-number extraction

Lesson numbers are read in this priority order, with the first match winning:

1. Title regex: `/Tricks of the Trade #(\d+)/i` against `media_items.caption`.
2. CSV override: `tt_roster.csv` row with a non-empty `expected_video_id` matching `media_items.video_id` provides the TT number. Used as fallback when the title format drifts.

Numbers outside `[1, 42]` are dropped with a logged warning. Duplicate numbers (two sidecars claim the same TT #) surface as a HIGH-severity item in QC output but render the most-recently-loaded row in the view, with the duplicate flagged.

## 6. Page contract

### 6.1 View-model shape

```ts
interface TtSeriesContent {
  total: 42;
  counts: {
    active: number;
    pending: number;
    missing: number;
    meta: number;
  };
  items: TtItem[];
}

interface TtItem {
  ttNumber: number;
  lessonTitle: string;
  status: 'ACTIVE' | 'PENDING' | 'MISSING' | 'META';
  trickSlug?: string;
  trickHref?: string;
  videoUrl?: string;
  videoEmbedUrl?: string;
  thumbnailUrl?: string;
  creator?: string;
  notes?: string;
}
```

`items` is sorted by `ttNumber` ascending and includes one entry for every number in `[1, 42]`, regardless of status.

### 6.2 Status assignment

The four statuses describe distinct gating issues, not a single "completeness" axis. A row is gated by either dictionary curation (PENDING) or sidecar curation (MISSING), and the view surfaces which.

For each TT number `n` in `tt_roster.csv` where `is_meta = 0`:

- **`ACTIVE`**: a sidecar exists for TT `n` (one or more `media_items` rows resolve to `n` via §5), AND the sidecar's resolved trick slug exists in `freestyle_tricks` with `is_active = 1`. The lesson is fully wired into the public dictionary surface; nothing pending.

- **`PENDING`**: a sidecar exists for TT `n`, but the sidecar's resolved trick slug either (a) does not exist in `freestyle_tricks` at all, or (b) exists with `is_active = 0` (typically `review_status = 'pending'`). **The gating issue is dictionary activation by the expert reviewer, not sidecar emit.** When a future review activates the trick, this row promotes to ACTIVE automatically with no sidecar change.

- **`MISSING`**: no `media_items` row resolves to TT number `n`. The roster says the lesson exists in the WorldFootbag video series, but no `.meta.json` sidecar has been emitted yet. **The gating issue is sidecar curation, not dictionary work.** A MISSING TT can target a trick that is already ACTIVE in the dictionary (e.g. TT #12 Forehead Stall is missing as a sidecar, but `forehead-stall` is active in the dict). In that case the only blocker is sidecar emit; running `seed_curator_media.py` after `.meta.json` creation closes it.

- **`META`**: `tt_roster.csv` marks the row as `is_meta = 1`. TT #1 *Shoes* is the canonical example. The view renders the row inline (so the sequence is unbroken) but excludes it from `counts.active / pending / missing`.

A TT row whose sidecar tag set has no resolvable trick slug is treated as PENDING case (a) above (slug does not exist), not MISSING. The sidecar IS present; the dictionary entry is the gap.

A TT row that maps to multiple trick slugs takes the first slug in the tag set after dropping `#freestyle` and `#trick`. Order within the sidecar tag list is significant.

### 6.3 Highlighting rules

The template colors rows by status. Suggested chip palette (no design-system commitment in this spec):

- `ACTIVE`: green chip, "Active in dictionary" label.
- `PENDING`: amber chip, "Awaiting dictionary activation" label, with an inline link to the trick row (when slug present) so the gating dictionary entry is one click away.
- `MISSING`: gray chip, "No video staged" label. Renders the lesson title (from the roster) without a video tile.
- `META`: muted chip, "Meta lesson" label.

A header band above the list shows `counts.active / pending / missing / meta` so the curation gap is visible without scrolling.

## 7. Current TT roster (informational)

The 42-lesson inventory the view will surface. Source: WorldFootbag channel scrape captured in `reference_worldfootbag_channel.md`. Status column reflects sidecar presence as of 2026-05-04.

| TT # | Lesson | Sidecar | Notes |
|---|---|---|---|
| 1  | Shoes                              | n/a    | META |
| 2  | Toe Stall                          | yes    | ACTIVE |
| 3  | Inside Stall                       | yes    | ACTIVE |
| 4  | Outside Stall                      | yes    | ACTIVE |
| 5  | Knee Stall                         | no     | MISSING (TT discovery already staged the URL; pending sidecar emit) |
| 6  | Spin                               | yes    | PENDING (`spin` is pending in dict) |
| 7  | Flying Outside                     | yes    | ACTIVE |
| 8  | Flying Inside                      | yes    | ACTIVE |
| 9  | Clipper                            | yes    | ACTIVE |
| 10 | Sole                               | no     | MISSING |
| 11 | Cloud                              | no     | MISSING |
| 12 | Forehead Stall                     | no     | MISSING (active in dict; sidecar pending emit) |
| 13 | Neck Catch                         | no     | MISSING (active in dict; sidecar pending emit) |
| 14 | Around The World                   | yes    | ACTIVE |
| 15 | Around The World Toe Stall         | yes    | ACTIVE |
| 16 | Leg-Over Stall                     | yes    | ACTIVE |
| 17 | Mirage Stall                       | yes    | ACTIVE |
| 18 | Clipper Stall                      | yes    | ACTIVE |
| 19 | Hop-Over                           | yes    | ACTIVE |
| 20 | Flying Clipper                     | yes    | PENDING (`flying-clipper` pending in dict) |
| 21 | Dragonfly                          | yes    | PENDING (`dragonfly-kick` pending) |
| 22 | Sole Stall                         | no     | MISSING (active in dict; sidecar pending) |
| 23 | Squeeze                            | no     | MISSING (`squeeze` pending in dict) |
| 24 | Cross-Body Sole                    | no     | MISSING (active in dict; sidecar pending) |
| 25 | Pendulum                           | yes    | ACTIVE |
| 26 | Butterfly Stall                    | yes    | ACTIVE |
| 27 | Whirl Stall                        | yes    | ACTIVE |
| 28 | Osis Stall                         | yes    | ACTIVE |
| 29 | Double Around the World            | yes    | ACTIVE |
| 30 | Double Leg-Over Stall              | yes    | ACTIVE |
| 31 | Symposium Mirage Stall             | no     | MISSING (active in dict; sidecar pending) |
| 32 | Paradox Mirage Stall               | yes    | ACTIVE |
| 33 | Drifter Stall                      | yes    | ACTIVE |
| 34 | (unconfirmed)                      | no     | MISSING (lesson title pending channel cross-check) |
| 35 | Torque Stall                       | yes    | ACTIVE |
| 36 | Spinning Osis Stall                | yes    | ACTIVE |
| 37 | Swirl Stall                        | yes    | ACTIVE |
| 38 | Spinning Butterfly                 | yes    | ACTIVE |
| 39 | Blur Stall                         | yes    | ACTIVE |
| 40 | Dada Curve                         | yes    | PENDING (`da-da-curve` pending) |
| 41 | Whirling Swirl Stall               | yes    | PENDING (`whirling-swirl` pending) |
| 42 | Symposium Whirl                    | yes    | ACTIVE |

Sidecars present: 31. Lessons with no sidecar yet: 11 (excluding TT #1 meta).

## 8. Constraints

1. The view is read-only. No insert, update, or delete on any table or sidecar.
2. No new schema. The roster is a code-level constant; status fields are derived at request time.
3. The TT-number-to-lesson mapping is hand-curated in `curated/freestyle_media/tt_roster.csv`. Do not derive lesson titles from sidecar `caption` strings; titles drift and embed ADD parentheticals that do not belong in nav copy.
4. The view must not depend on `tt_roster.csv` being kept in sync with sidecar captions. Mismatches are tolerable; QC may flag them.
5. The view must not query YouTube at request time. All data is local DB and the local CSV roster.

## 9. Test contract

Integration tests for `GET /freestyle/tt-series`:

- 200 OK with title "Tricks of the Trade".
- All 42 TT numbers appear in render order (1, 2, ..., 42).
- An `ACTIVE` row renders a video tile and a link to the canonical trick page.
- A `PENDING` row renders a video tile and a "Awaiting dictionary activation" chip.
- A `MISSING` row renders a status chip and the lesson title, with no video tile.
- The header counts sum to 42 (active + pending + missing + meta).
- Adversarial: a sidecar whose tag set has no resolvable trick slug renders as PENDING (not crashes).
- Adversarial: two sidecars claiming the same TT number renders one row with a duplicate-flagged warning surfaced in the structured response (not as a thrown error).
- The page renders deterministic HTML for a fixed DB state (snapshot-friendly).

## 10. Open questions

1. **TT #34 lesson title**: not yet confirmed against the WorldFootbag channel index. The roster CSV should carry `lesson_title = "unconfirmed"` and an empty `expected_trick_slug` until verified; the view should render the row as MISSING until both title and sidecar land.
2. **Multi-trick TT lessons**: TT #15 (ATW + Toe Stall) demonstrates a compound; the current sidecar tags only one slug. Spec assumes "first non-meta tag wins" and accepts that the linked trick page is the dominant component, not the only one.
3. **Header link to channel**: should the page header link out to the WorldFootbag channel? Recommended yes (single anchor, opens in new tab) so users can confirm against source. Decide before implementation.
4. **Embedding policy**: the view should match the existing media-gallery facade pattern (click-to-play, no autoplay iframes), per `src/views/media/gallery.hbs`.

## 11. Implementation handoff (out of scope for this spec)

When implemented, the slice should: create `curated/freestyle_media/tt_roster.csv` populated from §7's roster table, add a CSV reader helper, add `freestyleService.getTtSeriesPage()`, add the controller and route, render via a new `views/freestyle/tt_series.hbs`, and add the integration tests above. No schema migration, no sidecar emit, no scrape job. Authority for activating PENDING entries remains the dictionary review process; this view only surfaces the gap, it does not close it.

---

**Status: READY FOR IMPLEMENTATION** (2026-05-04)
