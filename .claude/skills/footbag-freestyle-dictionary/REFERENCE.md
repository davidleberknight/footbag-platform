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
dictionary-side detail. Curated trick media and member `media_items` are two parallel
layers, never merged. `end_seconds` on `freestyle_media_links` is load-bearing for
multi-trick sources (one asset spawns many clip-links); never drop it. Trick-primary
clip logic is provisional (partial unique index `(entity_type, entity_id) WHERE is_primary=1`
enforces one primary per entity). Verify external URLs before reviewer sign-off. `clip_type`
(`tutorial / demo / record / slow_mo / compilation`) is staging-only.

### Source URL patterns (verified)

- **FootbagSpot tutorials:** `https://footbagspot.com/tutorials/v/{hash-or-slug}` for individual videos; `/tutorials/{category}` for landing pages. Speculative `/tutorials/{slug}` URLs 404 — do not extrapolate.
- **YouTube oembed verification:** `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={id}&format=json` returns title + author; HTTP 400 if the id is malformed (YouTube IDs are exactly 11 chars). Use this to confirm any new YouTube URL before append.
- **WorldFootbag channel inventory:** `yt-dlp --flat-playlist --dump-json https://www.youtube.com/@WorldFootbag/videos` enumerates the Tricks-of-the-Trade series (42 lessons #1–#42).

### Source registry and tutorial-tier classification

The `TUTORIAL_SOURCES` set in `freestyle/loaders/24_qc_freestyle_media_coverage.py` is load-bearing for the coverage dashboard: a primary link counts as `STRONG_TUTORIAL` only if its `source_id` is in this set. Update both `media_sources.csv` and the script's set when registering a new trusted-tutorial source.

Source priority for primary selection: (1) AnzTrikz single/double-trick tutorial; (2) TT / Tricks-of-the-Trade single-trick lesson; (3) PassBack tutorial; (4) other verified tutorial source; (5) demonstration-tier source (single-trick demos, no teaching breakdown; `SOURCE_TIER` in `freestyleService.ts` is the load-bearing classification); (6) record/performance clip (never primary if a tutorial alternative exists).

### Primary-promotion rules (applied before every media-link write)

Promote to `is_primary=1` only if all hold: (1) target trick is active; (2) the video clearly teaches/demonstrates that specific trick; (3) the source is in the tutorial tier; (4) the current primary is missing OR is a record/demo/performance clip; (5) no duplicate primary. Do NOT promote if: target is pending (use `is_primary=0`); the video is a montage/drill/record/shred run; the title is generic; the trick is not explicitly central; the current primary is already a strong tutorial. Multi-trick tutorials: promote only when each target trick is **explicitly named in the title**.

### Reset-compatibility (HOLD / STAGED / SAFE)

Before appending any `media_links.csv` row, classify the target slug against a fresh-reset load: **SAFE** (active after reset — append immediately), **STAGED** (pending after reset, `is_active=0` — append only with `is_primary=0`), **HOLD** (does not exist after reset — do NOT append; first add the canonical row so it loads via 17/19). Note `21_load_footbag_org_pending_tricks.py` runs on a fresh reset (via `freestyle/run_freestyle.sh`, which `reset-local-db.sh` invokes), so its pending rows reload as `is_active=0` (STAGED) rather than vanishing.

### Coverage dashboard

`freestyle/loaders/24_qc_freestyle_media_coverage.py` is a read-only dashboard generator. Four validation checks (non-zero exit on failure), run before every media commit: no duplicate primary per trick; no `media_links.entity_id` orphan after reset; pending tricks with media all have `is_primary=0`; report row count == `freestyle_tricks` total.

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
