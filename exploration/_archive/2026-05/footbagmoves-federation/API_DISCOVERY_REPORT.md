# FootbagMoves API discovery — bounded reconnaissance

**Status:** Path A reconnaissance per user instruction 2026-05-10. **Discovery only.** No extraction. No pagination sweep. No bulk download. No DB writes. No workbook ingestion. No ontology mutation.

**Budget honored:** 8 polite HTTP requests used out of ~10 budget. 2-second spacing between probes. User-agent identifies IFPA recon + James's contact email.

---

## Topline finding

**Yes — FootbagMoves exposes a public JSON API.**

- **Endpoint:** `https://footbagmoves.com/api/moves`
- **Auth:** Public (no auth required for this probe)
- **Response shape:** JSON array of trick objects
- **Content-Type:** `application/json; charset=utf-8`
- **Probe response size:** 3,018 bytes for 10 rows
- **robots.txt:** Absent (HTTP 404) — by convention, no automated-crawl restrictions; site has no formal scraping policy

## Probe log (8 requests; chronological)

| # | URL | Status | Notes |
|--:|---|---|---|
| 1 | `/robots.txt` | 404 | No robots file; conventionally interpreted as no automated-crawl restrictions |
| 2 | `/` | 200 (682 B HTML shell) | Angular SPA; client-rendered |
| 3 | `/api/tricks` | 200 (682 B HTML) | Falls back to SPA shell — endpoint NOT recognized |
| 4 | **`/api/moves`** | **200 (3,018 B JSON)** | ✓ **API endpoint** |
| 5 | `/api/v1/tricks` | 200 (682 B HTML) | SPA shell — not recognized |
| 6 | `/api` | 200 (682 B HTML) | SPA shell — no API root index |
| 7 | `/assets/tricks.json` | 404 (0 B) | Not present |
| 8 | `/data/tricks.json` | 404 (0 B) | Not present |
| 9 | `/api/moves` (schema GET) | 200 (3,018 B JSON) | Inspected response body — see schema below |

The Angular SPA's catch-all routing returns the 682-byte shell for any path not matched by an API or static-asset rule. Genuine API endpoints return content-typed JSON. Genuine missing files return 404 with `application/json` content-type and 0 bytes (suggesting the API server's 404 handler distinguishes from the SPA shell).

## API schema — `/api/moves`

Response is a JSON array. Each element is a trick object with these fields:

| Field | Type | Sample value | Federation relevance |
|---|---|---|---|
| `id` | int | `405` | Stable internal ID; useful as primary key for the inventory CSV |
| `name` | string | `"Inside Stall"` | Display / colloquial name |
| `technicalName` | string | `""` (empty for stalls); `"Pixie Spinning Paradox Symposium Whirl"` (from sample) | Structural / canonical name |
| `alsoKnownAs` | string | `""` (mostly empty in the probe sample) | Aliases, comma-separated |
| `level` | string | `"Basic"` | Difficulty tier label |
| `setFromClipper` | bool | `true` | Plant-foot starting surface flag |
| `endingOnClipper` | bool | `false` | Landing-foot surface flag |
| `adds` | int | `1` | Numeric ADD value |
| `addComponents` | string | `""` (empty for stalls); presumably the operational notation for compound tricks | **The operational notation field** |
| `difficulty` | int | `0` | Additional difficulty rating (purpose unclear without more samples) |
| `videoUrl` | string | `"https://www.youtube-nocookie.com/embed/wps1JMROsks?rel=0"` | Embedded video URL |
| `completed` | bool | `false` | **Per-user state** — public response carries default false; ignore for federation |
| `completedAt` | datetime/null | `null` | **Per-user state** |
| `consecutiveRecord` | int/null | `null` | **Per-user state** |

The presence of `completed` / `completedAt` / `consecutiveRecord` fields suggests the same endpoint serves authenticated user data when called with credentials. Public response returns default-empty values for those fields.

**First-row sample (Inside Stall, ID 405, ADD=1):**

```json
{
  "id": 405,
  "name": "Inside Stall",
  "technicalName": "",
  "alsoKnownAs": "",
  "level": "Basic",
  "setFromClipper": true,
  "endingOnClipper": false,
  "adds": 1,
  "addComponents": "",
  "difficulty": 0,
  "videoUrl": "https://www.youtube-nocookie.com/embed/wps1JMROsks?rel=0",
  "completed": false,
  "completedAt": null,
  "consecutiveRecord": null
}
```

## Pagination / filtering — UNCONFIRMED

The 10-row response is suspicious in two ways:
1. The earlier RENDERING_SURFACE_PROPOSAL referenced "~569 tricks" as the FootbagMoves corpus size — far more than 10.
2. All 10 returned rows have `level: "Basic"` — suggests either a default level-filter or default pagination.

**No probes spent on pagination/filter discovery** (would push past the ~10 budget). Hypotheses worth one probe each in a future bounded round:
- `?limit=N` query parameter (most common pattern)
- `?page=N` / `?offset=N` for paginated retrieval
- `?level=All` to lift the apparent default `Basic` filter
- `?adds=N` to filter by ADD band (the FM web UI exposes Min-Adds/Max-Adds filters; the API likely does too)

**Single-shot full-corpus retrieval** is technically feasible if the API supports `?limit=1000` or similar — 569 rows × ~300 B each ≈ 170 KB single response. **Single probe** would confirm.

## Federation-not-adoption posture

The federation pipeline plan in `OPERATIONAL_NOTATION_GRAMMAR.md` and `RENDERING_SURFACE_PROPOSAL.md` requires:

- ✓ External evidence corpus storable as raw CSV
- ✓ Curator-reviewed adoption (never auto-import)
- ✓ Three-layer separation preserved (operational / semantic / parser)

**The discovered API supports all three.** Each row is structured; the operational notation lives in the `addComponents` field; aliases live in `alsoKnownAs`; ADD values live in `adds`. A future F2 scrape can produce one CSV row per FM `id`, preserving each field verbatim.

**The `completed` / `completedAt` / `consecutiveRecord` fields should be DROPPED at extraction time** — they're per-user state, not corpus content. Federation should never carry user state across systems.

## Extraction feasibility assessment

| Aspect | Assessment |
|---|---|
| API exists | ✓ Yes |
| Public access | ✓ Yes (no auth observed) |
| Schema is structured | ✓ Yes (JSON; flat object per row; stable field names) |
| Operational notation captured cleanly | ✓ Likely yes (`addComponents` field; needs probe on a non-stall row to confirm) |
| Aliases captured | ✓ Yes (`alsoKnownAs` field) |
| ADD values captured | ✓ Yes (`adds` field) |
| Pagination strategy | ⚠ Unconfirmed (one or two probes needed) |
| Total request count for full extraction | ⚠ 1–10 (depends on pagination behavior) |
| Privacy / per-user fields | ⚠ Three fields require strict drop on extraction |
| robots.txt restrictions | ✓ None (404 on robots.txt) |
| Response sizes manageable | ✓ ~170 KB worst case for full corpus |

**Bottom line: extraction is feasible with single-digit additional API probes.** The remaining uncertainty is pagination — bounded by 1-2 probes to confirm.

## Recommendation

### Recommended: **API extraction (Path A continuation)** — but in two more bounded rounds

**Round 2 (next bounded recon — ~3 probes):** confirm pagination/filter behavior. Try:
1. `/api/moves?limit=100`
2. `/api/moves?level=All` (or omit `level`)
3. One probe on a non-`Basic` row to confirm `addComponents` populates with operational notation strings

If round 2 confirms a single-shot or paginated extraction works → Round 3 is the actual extraction (estimated 1-10 requests, all rate-limited; output one raw CSV with field-verbatim rows).

If round 2 reveals the API can't deliver the full corpus cleanly → fall back to Path C (manual batch-export).

**Why API over manual:**
- ✓ Deterministic — same data on every retrieval; auditable
- ✓ Captures FM's stable internal ID (gives federation a reliable join key)
- ✓ Captures fields the FM web UI doesn't expose visibly (e.g. `level`, `setFromClipper`/`endingOnClipper` booleans)
- ✓ Lower total HTTP cost on FM (~10 well-paced requests vs many human page-loads)
- ✓ Native JSON parsing on our side (no fragile text-block parser to maintain)

**Why NOT API (the federation-not-adoption tension):**
- ⚠ FM has not given explicit consent for programmatic access
- ⚠ The API may be undocumented and could change without notice
- ⚠ Bulk retrieval is ethically borderline even with a public endpoint

**Mitigations if Round 2 + Round 3 proceed:**
- Identify our HTTP client clearly (User-Agent with project name + James's contact email; already in place)
- Rate-limit aggressively (≥ 2 seconds between requests; pause on any non-200 response)
- Single full-corpus retrieval; cache the CSV; never re-scrape unless data is known stale
- Drop per-user fields (`completed`, `completedAt`, `consecutiveRecord`) at the extraction layer
- Emit a clear citation in the workbook (`fmoves-2026-05-10-snapshot`) so downstream curator review knows which retrieval the data came from
- Coordinate with the FM operator if/when scaled extraction is contemplated

### Path C (manual batch-export) — preserved as fallback

If you prefer to avoid programmatic extraction entirely, the manual paste workflow remains viable:

- You navigate FM's search interface, copy results, paste into ADD-band-keyed text files
- I write the parser + emit `legacy_data/out/scraped_footbagmoves.csv`
- ~8 paste operations on your side
- Zero crawling pressure on FM
- Already aligned with the existing `footbagmoves-sample.txt` format

Path C remains aligned with the federation-not-adoption posture and is the most conservative option.

## Decisions needed

1. **Approve Round 2 bounded recon** (~3 more probes to confirm pagination + a non-Basic row to verify `addComponents` carries operational notation)?
2. **Or fall back to Path C** (manual batch-export) without further API probing?
3. If Round 2 + 3 (extraction) approved, **what extraction-time scope filters apply?**
   - Drop per-user fields (yes — non-negotiable per federation rules)
   - Drop or preserve `videoUrl` (it's media metadata; project policy on FM media URL ingestion is unclear — see `feedback_modifier_public_visibility.md` and `feedback_paused_crosstrack_no_writes.md` for adjacent rules)
   - Single CSV vs ADD-band-keyed multiple CSVs

No further probes until you decide.

---

## Round 2 — pagination + filter behavior (2026-05-10)

**Status:** Authorized by user "authorize round 2. do not commit." Three probes spent, 2-second spacing, same UA. No extraction. No commit.

### Probe log (3 requests)

| # | URL | Status | Size | Key result |
|--:|---|---|---|---|
| R2-1 | `/api/moves?limit=100` | 200 | 3,018 B | Returned 10 rows (identical byte-size to Round 1 default). `limit` param **ignored**. Levels mixed (`Basic`, `Advanced`) — different distribution from Round 1's 10-Basic response, suggesting the endpoint returns a quasi-fixed / non-deterministically-ordered 10-row window. |
| R2-2 | `/api/moves?level=Advanced` | 200 | 2,986 B | Returned 10 rows, **all `level: "Advanced"`**. Filter **honored**. Response still hard-capped at 10. |
| R2-3 | `/api/moves?level=Advanced&offset=10` | 200 | 2,986 B | Same 10 IDs as R2-2 (sorted IDs identical: `267, 268, 327, 331, 333, 334, 335, 336, 376, 527`). `offset` param **ignored**. |

### Confirmed behaviors

1. **Hard server-side cap of 10 rows per response.** Confirmed across `?limit=100` and `?level=Advanced` — both returned exactly 10 rows.
2. **`level=` filter works.** Returns a subset bounded by level. Valid values seen so far: `Basic`, `Advanced` (others not probed).
3. **`limit=` and `offset=` are ignored.** No pagination keyword discovered. `page=`, `skip=`, `cursor=`, etc. were not probed.
4. **`addComponents` carries real operational-notation grammar, sparsely populated.** Out of 10 Advanced rows in R2-2: 3 populated, 7 empty (~30%). Even ADD=2 Advanced tricks can have empty `addComponents` (e.g. Blink id 376 "Reverse Swirling Toe" → empty). Population appears curator-driven, not derivable from name/level/adds.
5. **Casing of operational notation is inconsistent across rows.** Examples:
   - R1 Toe Stall id 145: `"SET > OP/SAME TOE [DEL]"` — all caps
   - R2 Atomsmasher id 331: `"Toe > Op Out (DEX) >> Op In (DEX)(XDEX) > Op Toe (DEL)"` — title case
   - Federation normalization will need case-folding at parse time.
6. **Some Advanced rows have empty `videoUrl`** (e.g. Atomsmasher id 331 has `videoUrl: ""`). Not all rows carry media.

### Updated extraction-feasibility table

| Aspect | Round-1 assessment | Round-2 assessment |
|---|---|---|
| API exists | ✓ Yes | ✓ Yes |
| Schema is structured | ✓ Yes | ✓ Yes |
| `addComponents` carries operational notation | ⚠ Likely | ✓ **Confirmed** (grammar matches F0/F1) |
| `addComponents` populated everywhere | (not assessed) | ✗ **Sparse (~30% on Advanced sample)** |
| Single-shot full-corpus retrieval | ⚠ Unconfirmed | ✗ **Not feasible — 10-row hard cap** |
| Pagination via `limit`/`offset` | ⚠ Unconfirmed | ✗ **Both ignored** |
| Pagination via `page`/`skip`/cursor | (not assessed) | ⚠ Untested |
| Individual-resource fetch `/api/moves/{id}` | (not assessed) | ⚠ Untested |
| Total requests for full corpus | ⚠ 1–10 | ⚠ Unknown — depends on whether `?page=` or `/api/moves/{id}` works |

### Revised recommendation

The Round-1 path "API extraction is feasible with ~10 requests" is **no longer supported by evidence.** The hard 10-row cap and ignored `limit`/`offset` parameters mean:

- **Path A (full programmatic extraction) is now uncertain.** Two further probes would settle it:
  - One probe on `/api/moves?page=2` (test alternate pagination keyword)
  - One probe on `/api/moves/331` (test individual-resource fetch — if it works, an id-walk of ~569 requests becomes feasible but expensive)
- **If neither alternate pattern exists,** the only API-based extraction strategy is repeated calls to the randomized 10-row endpoint hoping to collect coverage statistically — **rejected** as both unreliable and unethical w.r.t. FM bandwidth.
- **Path C (manual batch-export) becomes the strong default** unless one of the two follow-up probes finds a usable extraction path.

### Updated decision menu

1. **Round 2.5 — two more bounded probes** (`?page=2` and `/api/moves/{id}`) to settle whether any extraction strategy via the API exists?
2. **Fall back to Path C now** (manual batch-export workflow); abandon API approach without further probing?
3. **Stop and shelve FM federation entirely** until a different need surfaces?

No further probes until you decide. Total probes used: Round 1 = 8, Round 2 = 3, cumulative = 11.

---

## Round 2.5 — alternate-pagination + individual-fetch probes (2026-05-10)

**Status:** Authorized by user "authorize round 2.5". Two probes spent, 2-second spacing, same UA. No extraction. No commit.

### Probe log (2 requests)

| # | URL | Status | Size | Key result |
|--:|---|---|---|---|
| R2.5-1 | `/api/moves?level=Advanced&page=2` | 200 | 2,986 B | Returned **identical 10 IDs** as Round 2 probe 2 (sorted IDs: `267, 268, 327, 331, 333, 334, 335, 336, 376, 527`). `page` param **ignored**. |
| R2.5-2 | `/api/moves/331` | **401** | 0 B | Individual-resource route **exists but is auth-gated**. Empty body, no `Content-Type`. Distinct from the 404-with-JSON-body pattern seen in Round 1 missing-asset probes. |

### Confirmed behaviors

1. **No pagination keyword exists on the public list endpoint.** Three independent attempts (`limit`, `offset`, `page`) all silently ignored. The response window appears tied to a server-side default with no client-controllable knob.
2. **`/api/moves/{id}` is auth-gated, not public.** The list endpoint is open; the per-item endpoint requires authentication. This pattern is consistent with the per-user state fields (`completed`, `completedAt`, `consecutiveRecord`) that hinted authenticated calls return user-scoped data.
3. **No usable extraction path via the public API.** Combining all evidence:
   - Single-shot full corpus: blocked by 10-row hard cap
   - Paginated extraction: blocked by no working pagination param
   - Id-walk extraction: blocked by 401 on `/api/moves/{id}`
   - Repeated calls to the randomized 10-row endpoint hoping to converge on coverage: rejected on reliability (no guarantee of full coverage) and ethics (would generate hundreds of polite requests against FM with no consent)

### Final feasibility table

| Aspect | Final assessment |
|---|---|
| API exists | ✓ Yes |
| Public list endpoint | ✓ `/api/moves` (10-row cap, randomized window) |
| Pagination | ✗ None (`limit`, `offset`, `page` all ignored) |
| Individual-resource fetch | ✗ Auth-gated (`/api/moves/{id}` → 401) |
| Full-corpus programmatic extraction | ✗ **Not feasible** within federation-not-adoption ethics |
| `addComponents` carries operational notation grammar | ✓ Confirmed (sparse, ~30% on Advanced sample, mixed casing) |
| Schema shape (for future reference, e.g. an FM-operator-blessed export) | ✓ Documented (Round 1 schema table still valid) |

### Final recommendation

**Switch to Path C (manual batch-export).** The API was probed in good faith across three bounded rounds (11 polite requests total) and provides no ethical path to full-corpus extraction. The Round-1 framing of "API extraction is feasible" is **superseded by Round 2 + 2.5 evidence**.

**Path C workflow** (unchanged from Round 1 description):
- You navigate FM's search interface, copy results, paste into ADD-band-keyed text files (the existing `footbagmoves-sample.txt` format)
- I write the parser to emit `legacy_data/out/scraped_footbagmoves.csv`
- ~8 paste operations on your side
- Zero further crawling pressure on FM
- Workflow already aligned with `OPERATIONAL_NOTATION_GRAMMAR.md` and `RENDERING_SURFACE_PROPOSAL.md`

**What this report's schema documentation is still good for:** if FM's operator is ever contacted and consents to an authenticated or operator-provided export, the field schema captured in Round 1 (and the `addComponents` grammar variants seen in Rounds 1 + 2) gives us a head start on the parser. That's a longer-term, consent-bearing path — not a near-term action.

### Single open decision

**Confirm switch to Path C?** If yes, the next concrete action is for you to begin batch-export pastes when ready; I write the parser when there's at least one file to parse against. No further probes against FM until/unless a consent-bearing channel opens.

No further probes until you decide. Total probes used: Round 1 = 8, Round 2 = 3, Round 2.5 = 2, cumulative = 13.

---

## Constraints honored

**Round 1 + Round 2 + Round 2.5 cumulative:**

- ✓ Bounded recon only (13 probes total across three rounds; each round stayed within its authorized sub-budget)
- ✓ No extraction (only schema inspection on individual 10-row responses)
- ✓ No pagination sweep (only 1 probe testing `offset`, then stopped)
- ✓ No broad crawling
- ✓ No workbook ingestion
- ✓ No DB writes
- ✓ No ontology mutation
- ✓ No parser integration
- ✓ Federation-not-adoption preserved (no canonical-layer write proposed; FM cited as external evidence source only)
- ✓ Polite spacing (≥ 2 seconds between requests)
- ✓ User-Agent identifies project + contact email (`IFPA-footbag-platform-recon/1.0 (+contact: redacted)`)
- ✓ Report file remains uncommitted per user instruction
