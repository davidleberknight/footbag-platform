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

Before cutover, descriptions are authored in two CSVs, both loaded into `freestyle_tricks.description`:

- `freestyle/inputs/base_dictionary/tricks.csv` — canonical baseline, loaded by `freestyle/loaders/17_load_trick_dictionary.py`. Holds most active tricks. Rows with commas must be CSV-quoted.
- `freestyle/inputs/curated/tricks/red_additions_2026_04_20.csv` — Red Husted overlays, loaded by `freestyle/loaders/19_load_red_additions.py`. Holds body primitives, set primitives, and a handful of compounds.

**Never write descriptions directly to `database/footbag.db`**: `scripts/reset-local-db.sh` wipes them on next reload. Before cutover, edit the canonical CSV; verify by running script 17 (and 19 if applicable) against a fresh schema-only temp DB before claiming the change is durable. After cutover, descriptions are edited only in the admin trick editor.

---

## Media Linkage Layer — detailed mechanics

The `footbag-curated-media` skill owns the media pipeline and the media model; the rules
below are the dictionary-side detail. Curated media is the system-member-owned,
`#curated`-tagged subset of `media_items` + `media_tags`. Clip ranges live on `media_items`
(`start_seconds` / `end_seconds`); one source asset can spawn many clip rows tagged to
different tricks. Verify external URLs before reviewer sign-off.

### Source URL patterns (verified)

- **FootbagSpot tutorials:** `https://footbagspot.com/tutorials/v/{hash-or-slug}` for individual videos; `/tutorials/{category}` for landing pages. Speculative `/tutorials/{slug}` URLs 404 — do not extrapolate.
- **YouTube oembed verification:** `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={id}&format=json` returns title + author; HTTP 400 if the id is malformed (YouTube IDs are exactly 11 chars). Use this to confirm any new YouTube URL before append.
- **WorldFootbag channel inventory:** `yt-dlp --flat-playlist --dump-json https://www.youtube.com/@WorldFootbag/videos` enumerates the Tricks-of-the-Trade series (42 lessons #1–#42).

### Content type, primary clip and new sources

Content-type tags, which clip leads a page, the multi-trick tagging rule and registering a new source: the `footbag-curated-media` skill, "Content type: what a clip is for" and "Registering a new source". Within the tutorial tier, prefer an AnzTrikz single or double-trick lesson, then a Tricks-of-the-Trade single-trick lesson, then a PassBack tutorial, then any other verified instructional clip. The primary clip is computed at report/render time, never stored; media for a pending (`is_active=0`) trick is still tagged and carried, but the trick surfaces no primary until it is active.

### Reset-compatibility (HOLD / STAGED / SAFE)

Before tagging a curated sidecar to a trick slug (a pre-go-live step), classify the target against a fresh-reset load: **SAFE** (active after reset — tag it), **STAGED** (pending after reset, `is_active=0` — tag it, but it surfaces no primary until active), **HOLD** (does not exist after reset — do NOT tag; first add the canonical row so it loads via 17/19). Note `21_load_footbag_org_pending_tricks.py` runs on a fresh reset (via `freestyle/run_freestyle.sh`, which `reset-local-db.sh` invokes), so its pending rows reload as `is_active=0` (STAGED) rather than vanishing.

### Coverage dashboard

`freestyle/loaders/24_qc_freestyle_media_coverage.py` is a read-only dashboard generator; its header lists its validation checks.

---

## Navigation Layer — helper internals

Helpers in `src/services/freestyleRelatedTricks.ts`. All exclude `category='modifier'`
and the current trick.

### `buildRelatedTricks` (broad navigation, cap = 8)

The ranking rules, their gates and the cap are specified in the doc comment on
`buildRelatedTricks` in `src/services/freestyleRelatedTricks.ts`; read them there rather
than from a copy.

### Adding a new navigation surface

Default to extending `freestyleRelatedTricks.ts` rather than spawning new files (the helpers share a filter → bucket-by-ADD → sort → flatten-with-cap shape). "Structurally similar?" → Related; "all whirl tricks?" → family filter. A trick page never lists a whole family; the family view and the family page own same-family navigation.
