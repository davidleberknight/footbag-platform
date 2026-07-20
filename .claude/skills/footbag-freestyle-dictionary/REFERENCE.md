# Footbag Freestyle Dictionary — Reference

Supporting reference for the `footbag-freestyle-dictionary` skill. Not a skill (no
frontmatter, never in the slash menu). Durable procedural detail moved out of `SKILL.md`
to keep it under the harness size limit. The rules here are load-bearing; the skill body
points at them.

---

## Description templates (Trick Dictionary Layer §1)

Active dictionary descriptions follow these templates; apply the same when adding new
active rows or normalizing future ones:

- **Compound = modifier + base:** `"{Modifier}-modified {base}."` — `Paradox-modified torque.`, `Blurry-modified mirage.`, `Whirl-modified osis.`
- **Multi-modifier compound:** nest by treating the innermost named compound as the base, then `"{Outer}-modified {Inner} {base}."` — `Paradox-modified symposium whirl.` (paradox + symposium-whirl), `Ducking-modified paradox whirl.`
- **Modifier noun-form rule:** when a modifier shares its name with a trick (mirage, whirl, swirl), drop the gerund `-ing` for descriptions: `miraging→mirage`, `whirling→whirl`. Other gerund modifiers stay as-is (`Ducking-`, `Spinning-`, `Stepping-`, `Tapping-`, `Barraging-`, `Symposium-`).
- **Stalls / delay surfaces:** `"X-based delay surface."` — `Toe-based delay surface.`, `Heel-based delay surface.`
- **Body primitives:** short mechanical motion sentence — `Inside-leg jumping motion.`, `Double rotational body spin.`
- **Base tricks (irreducible):** terse mechanical sentence — `Cross-body inside delay.` (clipper), `Rotational dexterity move.` (whirl).
- **Sentence form:** capitalized first word, terminating period. One sentence.

### Write surfaces for active descriptions

Descriptions live in two CSVs, both loaded into `freestyle_tricks.description`:

- `freestyle/inputs/base_dictionary/tricks.csv` — canonical baseline, loaded by `freestyle/loaders/17_load_trick_dictionary.py`. Holds most active tricks. Rows with commas must be CSV-quoted.
- `freestyle/inputs/curated/tricks/red_additions_2026_04_20.csv` — Red Husted overlays, loaded by `freestyle/loaders/19_load_red_additions.py`. Holds body primitives, set primitives, and a handful of compounds.

**Never write descriptions directly to `database/footbag.db`**: `scripts/reset-local-db.sh` wipes them on next reload. Edit the canonical CSV; verify by running script 17 (and 19 if applicable) against a fresh schema-only temp DB before claiming the change is durable.

---

## Media Linkage Layer — detailed mechanics

The `footbag-curated-media` skill owns the media pipeline; the rules below are the
dictionary-side detail. Curated trick media and member-uploaded media both live in the
unified `media_items` + `media_tags` graph and stay separate layers (curated media is the
system-member-owned, `#curated`-tagged subset), never merged. Clip ranges live on
`media_items` (`start_seconds` / `end_seconds`); one source asset can spawn many clip rows
tagged to different tricks. The deprecated `freestyle_media_*` graph is gone: do not
reintroduce it, and there is no `is_primary` flag (see "Primary clip is derived" below).
Verify external URLs before reviewer sign-off.

### Source URL patterns (verified)

- **FootbagSpot tutorials:** `https://footbagspot.com/tutorials/v/{hash-or-slug}` for individual videos; `/tutorials/{category}` for landing pages. Speculative `/tutorials/{slug}` URLs 404 — do not extrapolate.
- **YouTube oembed verification:** `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={id}&format=json` returns title + author; HTTP 400 if the id is malformed (YouTube IDs are exactly 11 chars). Use this to confirm any new YouTube URL before append.
- **WorldFootbag channel inventory:** `yt-dlp --flat-playlist --dump-json https://www.youtube.com/@WorldFootbag/videos` enumerates the Tricks-of-the-Trade series (42 lessons #1–#42).

### Source registry and tutorial-tier classification

The tutorial/demo/record source sets in `freestyle/loaders/24_qc_freestyle_media_coverage.py` are load-bearing for the coverage dashboard: a curated item counts as `STRONG_TUTORIAL` only if its `source_id` is in the strong-tutorial set. Registering a new trusted source updates both `media_sources` and the loader's source sets (the `footbag-curated-media` skill enumerates the full coordinated edit set).

Source priority for primary selection: (1) AnzTrikz single/double-trick tutorial; (2) TT / Tricks-of-the-Trade single-trick lesson; (3) PassBack tutorial; (4) other verified tutorial source; (5) demonstration-tier source (single-trick demos, no teaching breakdown; `SOURCE_TIER` in `freestyleService.ts` is the load-bearing classification); (6) record/performance clip (never primary if a tutorial alternative exists).

### Primary clip is derived, not stored

There is no `is_primary` flag and no write-time promotion step. A trick's primary clip is computed at report/render time as the strongest-strength curated item tagged to it, ranked by the source tier above; a record/performance-tier clip is never chosen as primary when a tutorial-tier alternative exists. Media for a pending (`is_active=0`) trick is still tagged and carried, but the trick surfaces no primary until it is active. For multi-trick tutorials, tag a target trick only when it is **explicitly named in the title**.

### Reset-compatibility (HOLD / STAGED / SAFE)

Before tagging a curated sidecar to a trick slug, classify the target against a fresh-reset load: **SAFE** (active after reset — tag it), **STAGED** (pending after reset, `is_active=0` — tag it, but it surfaces no primary until active), **HOLD** (does not exist after reset — do NOT tag; first add the canonical row so it loads via 17/19). Note `21_load_footbag_org_pending_tricks.py` runs on a fresh reset (via `freestyle/run_freestyle.sh`, which `reset-local-db.sh` invokes), so its pending rows reload as `is_active=0` (STAGED) rather than vanishing.

### Coverage dashboard

`freestyle/loaders/24_qc_freestyle_media_coverage.py` is a read-only dashboard generator over the unified `media_items` + `media_tags` graph. Three validation checks (non-zero exit on failure): report row count == total `freestyle_tricks`; every curated item's `source_id` is recognized; every `embedded_coverage.csv` slug resolves to a real trick.

---

## Navigation Layer — helper internals

Helpers in `src/services/freestyleRelatedTricks.ts`. All exclude `category='modifier'`
and the current trick.

### `buildRelatedTricks` (broad navigation, cap = 8)

Three rules in priority order; within each, ADD-bucket round-robin sampling (slug ASC tiebreak) ensures a low/mid/high mix; display order = R1 → R2 → R3.

- **R1 same-family:** `trick_family = current.trick_family`. Strongest relationship.
- **R2 modifier-prefix:** slug starts with `{first-underscore-segment}_` AND family differs. Captures cross-family modifier siblings (`paradox_mirage` ↔ `paradox_torque`).
- **R3 grandparent:** `current.base_trick → that row's base_trick → if active, non-modifier, family differs → include`. Fires only when R1 + R2 < 6; yields at most 1.

### `buildNextTricks` (family-scoped progression by ADD, cap = 5)

Strict same-family. `adds > current.adds`. Group by ADD, slug ASC within bucket, **take ≤2 per bucket**, flatten ASC. The per-bucket cap is load-bearing: without it a heavily-populated bucket buries higher tiers. Cross-family progression is intentionally out of scope (belongs in `buildRelatedTricks`).

### `buildPreviousTricks` (family-scoped regression by ADD, cap = 5)

Mirror of Next. `adds < current.adds`. Same per-bucket-2 sampling, flattened DESC (closest easier first). **Family-base tiebreaker (Previous only):** within each bucket, the row whose `slug == current.trick_family` sorts first, so foundational base tricks (`whirl`) surface in their compounds' Previous lists. Not applied to Next (base tricks are the lowest ADD in their family and never eligible as "next").

### Adding a new navigation surface

Default to extending `freestyleRelatedTricks.ts` rather than spawning new files (the helpers share a filter → bucket-by-ADD → sort → flatten-with-cap shape). "Structurally similar?" → Related; "harder in same family?" → Next; "easier in same family?" → Previous; "all whirl tricks?" → family filter.
