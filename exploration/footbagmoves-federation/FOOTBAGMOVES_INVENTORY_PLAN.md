# FootbagMoves inventory plan (Phase F1a)

**Status:** F1a reconnaissance produced. No live scrape, no canonical mutation, no ontology auto-import, no parser integration, no DB writes.
**Date:** 2026-05-10
**Inputs evaluated:**
- `legacy_data/inputs/curated/tricks/footbagmoves-3adds.txt` (94 rows; FM header `Moves found: 114`)
- `legacy_data/inputs/curated/tricks/footbagmoves-4adds.txt` (63 rows; FM header `Moves found: 173`)
- `legacy_data/inputs/curated/tricks/footbagmoves-5-6adds.txt` (84 rows; FM headers `Moves found: 139` AND `Moves found: 267` — anomaly, see §15)
- `legacy_data/inputs/curated/tricks/footbagmoves-sample.txt` (73 rows, multi-band; pre-existing curator artifact)
**Output preview:** `/tmp/fm_f1a/footbagmoves_f1a.csv` (241 rows extracted; not promoted to `legacy_data/out/` yet)

---

## 1. Executive summary

The FootbagMoves external inventory is **feasible to build via the paste-driven path** (Path C from `API_DISCOVERY_REPORT.md`). The public API was definitively closed in Rounds 1+2+2.5 (13 polite probes). The paste-driven path produces a stable, curator-controlled corpus with no FM bandwidth cost. The principal constraint is that **paste output carries no per-move URLs and no FM internal IDs** — the inventory's `external_id` must be synthetic (content-derived). This is acceptable for federation purposes (we don't need FM's primary key; we need a stable cross-reference back to FM concepts).

F1a confirms the parser script `legacy_data/scripts/parse_footbagmoves_corpus.py` (landed 2026-05-10) produces clean extraction on the supplied inputs: 241 rows / 0 malformed / 4 within-file duplicates / 58.9% with operational notation. The inventory layer is a thin transformation on top of the parser CSV.

---

## 2. URL structure findings (consolidated)

| Surface | URL | Status | Notes |
|---|---|---|---|
| Web SPA | `https://footbagmoves.com/` | Public, Angular SPA, client-rendered | DOM contains no enumerable per-move URLs visible to non-JS clients |
| robots.txt | `/robots.txt` | 404 | No formal scraping policy |
| Public list API | `/api/moves` | 200 (JSON, 10-row hard cap) | Returns randomized 10-row window; `limit`, `offset`, `page` all ignored |
| Filtered list API | `/api/moves?level={Basic\|Advanced}` | 200 | `level` filter honored; still capped at 10 rows |
| Per-move API | `/api/moves/{id}` | **401 Unauthorized** | Auth-gated; no public path |
| Asset directory | `/assets/*.json`, `/data/*.json` | 404 | No static dump available |
| YouTube embeds | `videoUrl` field within API response | youtube-nocookie.com/embed/{vid} | Available only for moves surfaced in the 10-row API window |

**Bottom line:** there is no per-move URL the inventory layer can carry as a stable identifier. The web SPA is Angular client-routed (no SEO-style per-move pages); the per-item API is auth-gated.

**Reading derived from paste output:** the paste captures `display_name`, optional `technical_name`, ADD value, optional `operational_notation`, and a `No Video Available` marker. It does NOT capture FM internal id, videoUrl, level, setFromClipper, endingOnClipper, difficulty, or completion-state fields seen in the API schema.

---

## 3. Pagination behavior

**No pagination on the public list endpoint.** Three independent probes (`?limit=100`, `?offset=10`, `?page=2`) all returned identical 10-row windows (Round 2 + Round 2.5). The 10-row cap is server-enforced; clients cannot widen the window.

**Implications for inventory:**
- Programmatic enumeration of the full corpus via API is impossible without authentication.
- The paste-driven path is band-level batched (curator opens FM's UI with Min-Adds = Max-Adds = N, scrolls/copies, pastes). Coverage is curator-time-bounded.

---

## 4. Stable identifier strategy

### 4.1 What FM exposes
- **Internal numeric `id`** (e.g. `id: 405` for Inside Stall) — STABLE, but only retrievable via the auth-gated `/api/moves/{id}` route or the 10-row randomized public list.
- **`technicalName` field** — appears in API; mirrors the paste's second-line "technical name". Not unique (e.g. "Miraging Clipper" appears as technical_name for both `Drifter` and `Drifter (same-side)`).
- **`name` field** — display name. Not unique either (variants like `(same-side)` create suffix-disambiguated dupes).
- **`alsoKnownAs`** — aliases, comma-separated in API. In paste data, " / " separated in display_name.

### 4.2 Recommended external_id construction

Since FM internal IDs aren't paste-accessible, derive a **synthetic external_id** from paste fields. Stable across paste re-runs because paste content is deterministic.

**Proposed format:** `fm__<slug-form-of-display-name>__add<N>`

Examples (drawn from F1a sample):
- `fm__drifter__add3`
- `fm__drifter-same-side__add3`
- `fm__inside-stall__add1`
- `fm__atom-bomb__add6`
- `fm__sasquatch__add7` (with `aliases_raw` capturing the "/ Warlock" alias)

**Slug rules:**
- Lowercase
- Replace non-alphanumerics with `-`
- Strip leading/trailing `-`
- Collapse multiple `-` to single `-`
- Preserve `(same-side)` → `-same-side` (suffix becomes part of slug)
- ADD value as final suffix to disambiguate cross-band collisions

**Collision handling:** if the parser ever produces two rows with the same synthetic external_id (e.g. duplicate paste within a file), append `__d2`, `__d3` etc. — duplicates report flags these for curator review.

### 4.3 Optional future enrichment

If a consent-bearing path to FM internal IDs ever opens (operator outreach + sanctioned export), add an `fm_internal_id` column to the inventory. The synthetic external_id stays as the primary key; FM internal IDs are an optional sidecar.

---

## 5. Total move count

From "Moves found:" headers in paste files + API-confirmed band totals:

| ADD band | FM total | Paste-covered | Coverage % |
|--:|--:|--:|--:|
| 1 | not in current paste set | 0 | 0% |
| 2 | not in current paste set | 0 | 0% |
| 3 | 114 | 94 | 82% |
| 4 | 173 | 63 | 36% |
| 5 | 139 | 9 | **6.5%** (severely under-covered) |
| 6 | 75 | 75 | 100% |
| 7 | 39 | ~37 (per sample.txt) | ~95% |
| 8 | (few) | ~2 (per sample.txt) | partial |
| 9 | 2 | 2 | 100% |
| **Total estimated** | **~550** | **282 (54%)** | — |

**Notes:**
- Sample.txt overlaps with the 3 new files for bands 7–9; band 5 has minimal sample.txt coverage either.
- The "569 tricks" figure from FM's planning docs likely included ADD=1 and ADD=2 bands not present in the current paste set.
- Band 5 is the principal coverage gap for any future F1b promotion.

---

## 6. Category / grouping behavior

FM exposes these grouping axes:

1. **ADD band** (Min-Adds + Max-Adds search filter) — authoritative grouping, used to drive paste-file segregation.
2. **Level** (Basic / Advanced / Beginner / ... — filter values not fully enumerated). API confirms `level=Advanced` filter is honored; paste UI shows "Level: All" by default.
3. **Video Only** filter (boolean; reduces results to moves with videos). API schema has `videoUrl` field; paste output indicates presence/absence via "No Video Available" marker.
4. **Set/end surface** (`setFromClipper`, `endingOnClipper` booleans in API schema). Paste does NOT capture these — only API does.

**For inventory purposes:** ADD band is the primary group; Level is the secondary grouping if curators ever want to paste level-filtered subsets. Set/end surface is **not accessible via paste** and is omitted from F1a scope.

---

## 7. Inventory strategy

**Approach:** transform the parser's raw CSV (`scraped_footbagmoves.csv`) into a normalized inventory CSV (`footbagmoves_inventory.csv`) with the minimal field set §13 specifies. The inventory is **derived**, not authoritative — re-deriving from raw paste files reproduces it deterministically.

**Phasing:**
- **F1a (this phase):** Plan + sample rows only. No inventory CSV in `legacy_data/out/` yet.
- **F1b (next, requires curator approval):** Fill the band-5 coverage gap (paste 130 more rows for ADD=5), then promote `scraped_footbagmoves.csv` to `legacy_data/out/` and emit the derived `footbagmoves_inventory.csv`.
- **F1c (deferred):** Sidecar JSON enrichment per row (if/when API consent surfaces; capture FM internal id + videoUrl + level + surface-flag fields).

---

## 8. URL enumeration strategy

**N/A.** There are no enumerable per-move URLs to crawl. The web UI is a SPA; the API rejects pagination and auth-gates per-item access. The "URL enumeration strategy" reduces to: **no enumeration**.

The only public URL the inventory can carry per row is `source_url = "https://footbagmoves.com/"` (the SPA root) — informational, not deep-linkable. Adding a `fm_search_query` hint (`?adds=3` query string mirror) is **not** wired to the SPA's search state (SPA reads search params from internal store, not URL), so it's not a usable deep link either.

**Recommended `source_url` value:** `https://footbagmoves.com/` for every row, with a `source_note` column carrying any extraction context (paste-file name + block index).

---

## 9. Extraction feasibility (sample-validated)

The parser ran cleanly on the F1a inputs:

| Metric | Value |
|---|--:|
| Rows extracted | 241 |
| Malformed | 0 |
| Duplicates (within paste files) | 4 (2 instances of `Symp Mirage` in 3adds; 2 of `Symp Whirl` in 4adds) |
| With operational notation | 142 (58.9%) |
| With video marker (present) | 44 (18.3%) |
| With technical_name | 142 (58.9%) |
| With `" / "` aliases | 3 (1.2%) |
| Same-side variants (`(same-side)` or `(same side)` suffix) | 31 (12.9%) |

**Feasibility verdict:** the paste path is robust and ready for F1b promotion once band-5 coverage closes.

---

## 10. Recommended crawl boundaries

There is **no crawling proposed**. The federation-not-adoption posture is preserved by design: every byte of FM data comes through the curator's hand-paste, mediated by IFPA's review.

**Forbidden activities (re-stated for the audit trail):**
- No automated requests to `footbagmoves.com` (HTML, API, asset, or otherwise) beyond the closed Rounds 1/2/2.5 reconnaissance.
- No bulk download of any kind.
- No headless browser, no rendering-based scrape, no DOM extraction.
- No re-fetching of YouTube videoUrls from the 10-row API responses (those captured in Rounds 1+2+2.5 are sufficient as schema evidence; no expansion).

**Curator-mediated activities (allowed, on curator's pace):**
- Curator opens FM in a normal browser, scrolls the search interface, copies the rendered text, pastes into `footbagmoves-Xadds.txt`. No automation.
- Curator re-pastes on demand (e.g. to fill the band-5 gap) at whatever cadence they choose.
- IFPA's parser reads the paste file from disk; no network calls.

---

## 11. Rate-limit / ethical scraping considerations

Moot for the paste path (no requests). For the audit trail:

- The FM operator has not given explicit consent for any programmatic access. The Rounds 1/2/2.5 recon (13 polite probes, 2s spacing, identifying User-Agent) was the entirety of acceptable programmatic interaction.
- The paste path generates zero requests against FM infrastructure beyond the curator's normal browsing.
- Any future consent-bearing channel (e.g. operator-approved bulk export, or auth-token shared by FM) would re-open the rate-limit / ethics question. F1a does **not** propose such a channel.

---

## 12. Local cache structure (recommended three tiers)

| Tier | Files | Lifecycle | Owner |
|---|---|---|---|
| **Tier 1 — Raw paste** | `legacy_data/inputs/curated/tricks/footbagmoves-{N}adds.txt` (one file per ADD band, or per coverage batch) | Curator-edited; committed to repo as the source-of-truth paste record | Curator (James) |
| **Tier 2 — Parser CSV** | `legacy_data/out/scraped_footbagmoves.csv` + `_report.md` + `_malformed.csv` + `_duplicates.csv` | Regenerated from Tier 1 by `parse_footbagmoves_corpus.py`; gitignored (per `legacy_data/CLAUDE.md` `out/` convention) | Parser-script-generated |
| **Tier 3 — Inventory CSV** | `legacy_data/out/footbagmoves_inventory.csv` (proposed; not yet emitted) | Derived from Tier 2 by a future F1b script (`build_footbagmoves_inventory.py`); gitignored | Inventory-builder-generated |

**Why three tiers:**
- Tier 1 is the auditable record of what the curator pasted (and from which FM search state).
- Tier 2 is the raw extraction (parser-output as-is; preserves source text fidelity).
- Tier 3 is the normalized inventory (synthetic IDs, presence-flags, dedup-resolved) for downstream federation work.

Each tier is regeneratable from the tier above. Curator-paste re-runs propagate cleanly to Tier 2 and Tier 3 via the script chain.

---

## 13. Minimal external inventory fields (recommended schema)

Per task spec § 4. Field-by-field justification + source mapping:

| Field | Type | Source | Notes |
|---|---|---|---|
| `external_id` | TEXT, primary key | Derived (synthetic, §4.2) | `fm__<slug>__add<N>` format; stable across re-runs |
| `external_slug` | TEXT | Derived from display_name | Slugified display_name; component of external_id |
| `display_name` | TEXT | Parser `display_name` (raw paste) | Preserves casing |
| `aliases` | TEXT (`\|`-delimited) | Parser `aliases_raw` + technical_name considered | technical_name retained as a distinct field; aliases column carries " / "-derived alts only |
| `technical_name` | TEXT | Parser `technical_name` | Optional; FM's "structural" naming, e.g. "Miraging Clipper" for Drifter |
| `add_count` | INTEGER | Parser `adds` | FM-asserted ADD value; NEVER overwrites IFPA's `freestyle_tricks.adds` |
| `notation_present` | INTEGER (0/1) | Derived: `1 if operational_notation_raw != "" else 0` | Presence flag only |
| `notation_raw` | TEXT | Parser `operational_notation_raw` | Preserved verbatim; never normalized or parsed in F1a |
| `description_present` | INTEGER (0/1) | Always 0 in F1a | Paste doesn't carry descriptions; field reserved for future API-derived enrichment |
| `video_present` | INTEGER (0/1) | Parser `video_present` | From "No Video Available" marker detection |
| `source_url` | TEXT | Constant `https://footbagmoves.com/` | Per §8; no deep-linking available |
| `source_paste_file` | TEXT | Parser `source_file` | Provenance: which paste file produced this row |
| `source_block_index` | INTEGER | Parser `source_block_index` | Position within the source file (anchor ordering) |
| `same_side_variant` | INTEGER (0/1) | Derived: `1 if "(same-side)" or "(same side)" in display_name` | New flag introduced in F1a; relevant to Barfry pt11 "ss" question |
| `snapshot_date` | TEXT (ISO-8601) | Curator's paste timestamp (file mtime fallback) | Captures when FM data was harvested |

**Fields explicitly NOT in F1a inventory:**
- FM internal numeric `id` — not paste-accessible.
- `videoUrl` — not paste-accessible.
- `level` (Basic / Advanced / ...) — not paste-accessible.
- `setFromClipper`, `endingOnClipper` — not paste-accessible.
- `difficulty` (numeric) — not paste-accessible.
- `completed`, `completedAt`, `consecutiveRecord` — per-user fields, federation-rule-forbidden.
- IFPA cross-reference (`ifpa_canonical_slug`, `ifpa_match_status`) — F3 (deferred).

---

## 14. Sample inventory rows (F1a preview)

The 13 rows below are projected through the proposed §13 schema, drawn from the F1a parser run. **These are illustrative only** — no inventory CSV has been promoted to `legacy_data/out/`.

| external_id | display_name | technical_name | add_count | aliases | notation_present | video_present | same_side_variant | source_paste_file |
|---|---|---|--:|---|--:|--:|--:|---|
| `fm__double-switchover-far__add3` | `Double Switchover (far)` | _(empty)_ | 3 | _(empty)_ | 0 | 0 | 0 | footbagmoves-3adds.txt |
| `fm__dragster__add3` | `Dragster` | `Miraging Dragon` | 3 | _(empty)_ | 1 | 1 | 0 | footbagmoves-3adds.txt |
| `fm__drifter__add3` | `Drifter` | `Miraging Clipper` | 3 | _(empty)_ | 1 | 1 | 0 | footbagmoves-3adds.txt |
| `fm__drifter-same-side__add3` | `Drifter (same-side)` | `Miraging Clipper` | 3 | _(empty)_ | 1 | 1 | **1** | footbagmoves-3adds.txt |
| `fm__ducking-clipper__add3` | `Ducking Clipper` | _(empty)_ | 3 | _(empty)_ | 0 | 0 | 0 | footbagmoves-3adds.txt |
| `fm__fairy-mirage-same-side__add3` | `Fairy Mirage (same side)` | _(empty)_ | 3 | _(empty)_ | 0 | 0 | **1** | footbagmoves-3adds.txt |
| `fm__grifter-same-side__add3` | `Grifter (same side)` | `Reverse Drifter` | 3 | _(empty)_ | 1 | 1 | **1** | footbagmoves-3adds.txt |
| `fm__symp-mirage__add3` | `Symp Mirage` | _(empty)_ | 3 | _(empty)_ | 0 | 0 | 0 | footbagmoves-3adds.txt (duplicate at blocks 76 & 77 — see §15) |
| `fm__inside-stall__add1` | `Inside Stall` | _(empty)_ | 1 | _(empty)_ | 0 | _(unknown)_ | 0 | _(API-known; not in current paste set; included as schema demo)_ |
| `fm__atomsmasher__add3` | `Atomsmasher` | `Atomic Mirage` | 3 | _(empty)_ | 1 | 0 | 0 | footbagmoves-3adds.txt |
| `fm__blue-widow__add7` | `Blue Widow` | `Pixie Spinning Paradox Symposium Whirl` | 7 | _(empty)_ | 1 | 0 | 0 | footbagmoves-sample.txt |
| `fm__sasquatch__add7` | `Sasquatch` | `Blurry Symposium Whirling XBD Rake` | 7 | `Warlock` | 1 | 0 | 0 | footbagmoves-sample.txt |
| `fm__big-apple-sauce__add9` | `Big Apple Sauce` | `Spinning Paradox Miraging Symposium Torque` | 9 | `Chilly Pilly Sauce` | 1 | 0 | 0 | footbagmoves-sample.txt |

(Full 241-row preview is in `/tmp/fm_f1a/footbagmoves_f1a.csv`; not promoted.)

---

## 15. Conflict-risk assessment

### 15.1 Within FM (paste-side risks)

| Risk | Severity | Example | Mitigation |
|---|---|---|---|
| Display-name collisions (`display_name` not unique without ADD + suffix qualifier) | MEDIUM | `Drifter` / `Drifter (same-side)` both adds=3 with same `technical_name` "Miraging Clipper" | external_id construction includes ADD and same-side suffix — handled |
| Within-file duplicate paste blocks | LOW | `Symp Mirage` 2× in 3adds.txt (blocks 76 & 77); `Symp Whirl` 2× in 4adds.txt | parser duplicates report flags; collision handling adds `__d2` suffix in inventory step |
| Same-side suffix variations (`(same-side)` vs `(same side)`) | LOW | `Fairy Mirage (same side)` vs hypothetical `Fairy Mirage (same-side)` | normalize on suffix detection at slug-derive time; both map to `-same-side` slug |
| Cross-band re-occurrence | LOW (unobserved so far) | A move's ADD could be re-asserted at a different value in a different band paste (e.g. FM update over time) | inventory's snapshot_date carries the version; duplicates report would flag cross-band re-occurrence |
| Header anomaly `Moves found: 267` in `5-6adds.txt` | MEDIUM | The second paste-block in 5-6adds has header `Moves found: 267`, not matching any known per-band total. Likely: user changed search filter (e.g. ADD ≥ 5) mid-paste. | Parser tolerates (extracts band-6 rows correctly); document the search-state ambiguity in the row's source_paste_file metadata; curator clarification recommended at F1b promotion time |

### 15.2 Cross-IFPA (federation-side risks, deferred to F3 but flagged here)

| Risk | Severity | Example | Mitigation (F3 scope) |
|---|---|---|---|
| FM display_name ↔ IFPA canonical_name same-string-different-trick | MEDIUM | FM "Blurry Mirage" = ADD 4; IFPA "Blur" = ADD 4 but decomp Stepping Paradox Mirage. Same conceptual entity, different labels. | F3 normalization layer; pt11 establishes federation-not-adoption precedent (FM label stays folk; IFPA decomp canonical) |
| FM technical_name ↔ IFPA modifier-derived name collision | MEDIUM | FM "Miraging Clipper" (technical_name of Drifter) — IFPA also names this as Drifter | match via IFPA's modifier-derived canonical resolver; not auto-overridden |
| FM ADD ↔ IFPA ADD disagreement | HIGH | FM Barfry = 4; IFPA semantic decomp Nuclear ss Butterfly under generic modifier weights = 5. Awaiting pt12 resolution on "ss" weight. | Per pt11 Phase D queue; never auto-resolve toward FM |
| Down-family or other forbidden-import-zones | HIGH | Any FM row representing a down-family trick must be quarantined (per CANONICALIZATION_POLICY §10) | F3 routing rules; quarantine bucket already defined in `OPERATIONAL_NOTATION_GRAMMAR.md` |

---

## 16. Recommended extraction sequencing

```
F1a (this doc)         — inventory plan + sample rows (PRODUCED 2026-05-10)
   ↓
F1b (next, curator-paced) — fill band-5 coverage gap; emit inventory CSV
                           - curator pastes ADD=5 (target ~130 more rows)
                           - run parse_footbagmoves_corpus.py → legacy_data/out/scraped_footbagmoves.csv
                           - run (new) build_footbagmoves_inventory.py → legacy_data/out/footbagmoves_inventory.csv
                           - parser report + duplicates + malformed reports as audit trail
   ↓
F1c (optional, deferred) — sidecar JSON per row (if consent-bearing API channel opens)
                           - one /api/moves?level=X probe per ADD band to capture FM internal IDs for surface-flag-bearing moves
                           - attach to inventory as fm_internal_id sidecar column
   ↓
F2  (deferred, separately tracked) — pt11 cross-reference (IFPA ↔ FM name match)
F3  (deferred)                       — normalization layer
F4  (deferred)                       — workbook integration (activate fbmoves SOURCES placeholder)
F5  (deferred)                       — curator adjudication via Red Review Queue
F6  (deferred)                       — selective adoption
```

**Gating conditions:**
- F1b waits on: (a) band-5 paste expansion (~130 more rows for full coverage, OR curator decision to ship at current 6.5% band-5 coverage), AND (b) human approval to promote `scraped_footbagmoves.csv` from `/tmp/` to `legacy_data/out/`.
- F1c waits on: a consent-bearing FM operator relationship that doesn't currently exist.
- F2 waits on: F1b completion (inventory CSV emitted).

---

## 17. Contract preservations

- ✓ Federation-not-adoption: FM treated as one external evidence source; never authoritative.
- ✓ No canonical mutation: no writes to `legacy_data/inputs/noise/tricks.csv`, no DB schema changes, no parser logic edits.
- ✓ No ontology auto-import: every IFPA cross-reference is manual / curator-mediated, never derived from FM.
- ✓ No parser integration: `parse_footbagmoves_corpus.py` is an independent script with no hooks into `parse_freestyle_notation.py` or the freestyle ontology toolchain.
- ✓ No 569-page scrape attempted in F1a (and forbidden in future phases without consent-bearing channel).
- ✓ No workbook ingestion: F4 placeholder `fbmoves` SOURCES entry remains commented out.
- ✓ No alias auto-normalization: aliases preserved as raw " | "-delimited strings; normalization deferred to F3.
- ✓ No DB migrations.

---

## 18. Open items surfaced by F1a

1. **Band-5 coverage gap** (9 of 139 = 6.5%). Curator decision needed: paste full band-5 before F1b, or ship F1b at current coverage and backfill band-5 later.
2. **5-6adds.txt header anomaly** (`Moves found: 267`). Curator clarification: was the search-state changed mid-paste? Should the file be re-segmented into pure band-5 and pure band-6 segments?
3. **Within-file duplicates** (Symp Mirage, Symp Whirl). Curator review: are these intentional separate FM rows, or paste artifacts to dedupe?
4. **Same-side ADD-math** (31 same-side variants observed; Barfry's pt11 "ss" question still pending). Recommend collecting same-side ADD-math signals into a separate pt12 packet section to give Red a structured dataset.
5. **ADD-band 1 + ADD-band 2 not in current paste set.** Curator decision: are bands 1 and 2 (likely small total) worth a paste pass for completeness?
6. **Header inconsistencies** within paste blocks (multiple `Moves found:` headers in single files indicates multi-paste assembly). Parser handles this correctly; just documenting.

---

## 19. Cross-references

- `API_DISCOVERY_REPORT.md` (uncommitted; same directory) — Rounds 1+2+2.5 API recon record.
- `OPERATIONAL_NOTATION_GRAMMAR.md` (same directory) — F0/F1 grammar formalization.
- `RENDERING_SURFACE_PROPOSAL.md` (same directory) — O1 rendering surface design (O1a–O1d shipped).
- `PT11_IMPACT_AUDIT.md` (`exploration/freestyle-notation-grammar/`) — pt11 ontology audit including the Barfry "ss" / same-side question that F1a's 31-row same-side cohort can inform.
- `legacy_data/scripts/parse_footbagmoves_corpus.py` — the raw-extraction parser script that this inventory layer sits on top of.
- `project_freestyle_federation.md` (memory) — federation track current state.
