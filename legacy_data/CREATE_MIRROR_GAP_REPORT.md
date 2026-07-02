# MIRROR_REPORT.md — footbag.org → archive.footbag.org content-gap audit

**Status:** findings-only audit complete. No repo/mirror/dump files were modified. No gaps
have been closed yet. This document is a handoff so the work can resume in a new session.

**Date of audit:** 2026-07-02. **Auditor method:** deterministic, code-driven set difference
across two independent snapshots plus the code that connects them (see Method).

---

## 1. Context and stakes

We are modernizing footbag.org for the IFPA. At go-live, the static crawl currently at
`legacy_data/mirror_footbag_org.BAK/` becomes **archive.footbag.org** — the permanent,
read-only archive of the old site. Any old-site content that is **not** in that mirror **and**
**not** migrated into the new platform is **lost forever at cutover**.

We hold two independent snapshots of the old site, plus the crawler code:

- **The site (dump)** — `footbag.org` → symlink to `../GOLDBERG/footbag.org/`. This is the
  *live PHP CMS source plus its content databases*. It is a git working copy; media binaries
  are git-ignored, but the per-subsystem `backups/latest.sql` database dumps are present on
  disk. **Unique value: structured DATA and source pages.**
- **The mirror** — `legacy_data/mirror_footbag_org.BAK/www.footbag.org/`. A *transformed HTTP
  crawl* (30,320 files; ~57k successful downloads; ~92 GB fetched media). It is **not a raw
  copy**: the crawler fixes/rewrites links and **re-encodes all media through ffmpeg**.
  **Unique value: the binary MEDIA — it is the only place the 92 GB of photos/videos exist**
  (the dump has none).
- **The crawler** — `legacy_data/create_mirror_footbag_org.py` (~2,937 lines). Defines exactly
  what is captured, excluded, and transformed.

The two snapshots are **asymmetric**, and that asymmetry is the whole basis of the audit:
the dump is authoritative for *records*; the mirror is authoritative for *media*.

### Key resume paths
- Dump root: `footbag.org/` (→ `/home/footbag/GITHUB/GOLDBERG/footbag.org/`)
- Content DBs: `footbag.org/<section>/backups/latest.sql`
- Mirror content: `legacy_data/mirror_footbag_org.BAK/www.footbag.org/`
- Mirror capture indexes: `legacy_data/mirror_footbag_org.BAK/sitemap.txt` (lines are
  `./mirror_footbag_org/www.footbag.org/<path>` — match on the `www.footbag.org/<path>`
  suffix) and `legacy_data/mirror_footbag_org.BAK/redirect_map.json` (alias/negative-id →
  canonical URL; **always check both** — a record may be reachable only via a redirect).
- Crawler: `legacy_data/create_mirror_footbag_org.py`
- `legacy_data/mirror_footbag_org/` is an **empty** in-progress reset directory; `.BAK` is the
  only populated archive and the one audited.
- `mirror_progress.json` has been **reset to empty**, so the crawler's failed-URL list did not
  survive; only aggregate counts remain in the `sitemap.txt` header.

### sitemap.txt header stats (the surviving crawl telemetry)
```
total_urls: 62108   successful_downloads: 57431   failed_downloads: 5751
magic_byte_failures: 969   image_conversions: 22331   video_conversions: 3814
skipped_too_large: 0   media_input_bytes: 92,151,092,462   media_output_bytes: 58,331,147,268
```

---

## 2. Method — deterministic set difference

    GAP  =  (content-URL universe from site PHP read-routes × content DBs)
          − (capture set: crawler ruleset applied, verified vs sitemap.txt + redirect_map.json)

Every missing item is assigned exactly one **reason** from a fixed taxonomy, which decides
whether it is actionable:

1. **Intentional policy drop** — audio/SVG/XML-RSS, archives/executables, media re-encode,
   admin/mutating route, destructive param, `Visible=0`/`Approved=0` records the live site
   itself withheld. *Not a gap.*
2. **Migrated to new platform** — covered by the footbag-platform project. *Not a loss.*
3. **Recoverable dump-only gap** — record exists in a DB, was capture-eligible, yet is absent
   from the mirror. **Actionable.**
4. **False-exclusion (crawler bug)** — a legitimate read surface the crawler wrongly dropped or
   mis-linked. **Actionable (code fix).**
5. **Hard loss** — referenced but present in neither source. Log to the loss-risk register.

Mirror path convention (the join key): records render to
`www.footbag.org/<section>/show/<id>/index.html` (also `list`, `showset`, `photo`, `video`,
`index`, `showresults`, `chapter/<n>`, `list_<year>`, `past_year_<year>`, etc.).

---

## 3. The crawler ruleset (deterministic, from `create_mirror_footbag_org.py`)

- **Media is re-encoded, not copied** (lines ~152, 824–949). Every accepted image/video is run
  through **ffmpeg as a malware-stripping security requirement** (images→JPG, video→MP4,
  GIF→GIF, EXIF/ICC stripped). Original resolution/format is intentionally not preserved —
  **this is by design, not a gap.** Documented design decision: "only MP4 and JPG are
  preserved."
- **`SKIP_EXTENSIONS`** (lines 141–145): `.zip .tar.gz .exe .dmg .asx .php .sh .xml
  .mp3 .ogg .wav .aac .m4a .svg`. Consequences: **audio and RSS/XML feeds are dropped by
  policy**; `.php` skip does not affect pretty-URL routes (e.g. the MediaWiki uses
  `/reference/-/<Article>`, no `.php` suffix). No real `.svg` content exists in the site.
- **`DESTRUCTIVE_ROUTES`** (frozenset, lines ~405–437) refuses ~68 write endpoints
  (`*/edit2 new2 delete vote addresults2 doranks countvotes …`); all verified as genuinely
  mutating (real INSERT/UPDATE/DELETE). Read routes (`show/list/view/showset/showresults/…`)
  are allowed. `registration/regsummary?tid=` archival views are intentionally kept.
- **`DESTRUCTIVE_PARAMS`** (lines ~442–444): `unreg delete remove confirm approve reject vote`.
  Full-source grep confirmed no read view is gated by a query-key collision.
- **`is_unsafe_url`** (lines ~446–461) uses exact path-segment matching for `admin` (not
  substring) — no legitimate content section is caught.
- **`RESPECT_ROBOTS_TXT = True`** (line 147). The live robots.txt is not preserved.
- **Failure handling:** magic-byte failures (line ~502) and video-conversion failures
  (line ~833) **delete the bytes and do NOT increment `failed_downloads`** — they surface only
  in the `magic_byte_failures` / `failed_conversion_videos` stats. Transient 5xx/network errors
  are retried once and, if still failing, are **not counted** — so the true "could-never-fetch"
  number is understated.

**Verdict on the crawler's exclusion logic: sound.** No false-exclusion *rule* bug was found
(all destructive routes are genuinely mutating; the `admin` rule has no false positives). The
crawler bugs that do exist are in **link rewriting / route mapping**, not exclusion (Section 6).

---

## 4. Content databases audited (the record universe)

Per-subsystem `backups/latest.sql` on disk (present despite being git-ignored):

| DB | size | primary content tables | rows (content) |
|----|------|-------------------------|----------------|
| members | 14.5 MB | (member profiles) | PII — **counts-only, not extracted** |
| news | 4.9 MB | `news` | 17,682 (real content years 1997–2002; 13,515 are `Year=0` blank/spam stubs) |
| gallery | 4.7 MB | `sets`,`images`,`alt_images` | 1,955 sets / 16,768 images / 68 alt |
| events | 4.2 MB | `calendar` | 1,723 (1,437 approved) |
| faq | 2.3 MB | `faq`,`faqsections` | 38 / 7 |
| localize | 2.2 MB | `localization` | UI strings only (14 langs) |
| rules | 2.1 MB | `rulebook3` | 1,619 across 14 sections |
| ifpa | 0.73 MB | `ifpa_elections`,`ifpa_issues`,(votes/payments excluded) | 187 elections / 332 issues |
| clubs | 0.45 MB | `clubs`,`clubcontacts`(PII) | 602 clubs |
| ranking | 0.37 MB | `rankings`,`rank_sets`,`rank_methods` | 12,672 / 14 / 1 |
| moves2 | 0.33 MB | `moves`,`movehints`,`moves_journal` | 303 / 431 / 97 |
| poll | 0.16 MB | `polls`,`pollanswers` | 11 / 4,899 |
| index2 | 0.02 MB | `potd`,`index_cache` | internal cache — not content |
| actions | 0.12 MB | `actions` | internal admin queue (PII) — not content |
| members/admin | 0.009 MB | — | **admin — excluded** |

`reference/` is a **MediaWiki** but the dump contains **no page/text/revision data** (only
schema patches). The wiki's article text lives only in the mirror's `reference2/` (606 pages) —
so the wiki is the *reverse* case (mirror is the better source). The dump's only unique wiki
asset is its uploaded images (Section 5, finding #1).

---

## 5. Consolidated findings — the gap inventory

### Tier 1 — Recoverable from the dump today (deterministic, no live site needed)

| # | Gap | Count | Rebuild from | Severity |
|---|-----|-------|--------------|----------|
| 1 | **Hall-of-Fame / historical player photos** (`reference/images/<hash>/<hash2>/*.jpg\|png\|gif`) | **367 originals, 0 captured** | dump filesystem | **Critical** — IFPA-specific, culturally significant; `reference2/` successor carries none of them forward |
| 2 | **Club records** absent from mirror | **222 of 602** | `clubs/backups/latest.sql` | Warning — also absent from the club-migration pipeline input (it reads the same mirror HTML → 312 rows) |
| 3 | **Rulebook chapters** linked from the crawled index but never fetched | **7 of 10** (only 300/400/500 captured; missing 20,40,50,60,100,200,910) | `rules/backups/latest.sql` | Warning — real crawl failure, links were present |
| 4 | **News article permalinks** (`news/show/<NewsID>`) | **17,682, 0 captured** | `news/backups/latest.sql` | Warning — **text is NOT lost** (full text is in `news/list_<year>` pages); missing permalink URLs only |
| 5 | **Polls** | **9 of 11** (missing 948263383, 948583074, 949095377, 950727318, 971804588, 986459157, 1078984135, 1070747831, 1153940998) | `poll/backups/latest.sql` | Info — small, not publicly linked |
| 6 | **Rankings** | **12,672 rows, 0 captured** | `ranking/backups/latest.sql` | Warning — already catalogued in the migration plan as a *deferred* decision, not a surprise |

Recovery method for Tier 1: deterministic — the target URLs/records are all known from the DBs;
either a DB-driven static rebuild or a seeded (non-link-following) fetch pass.

### Tier 2 — Recoverable only by re-crawling the live site (dump has no media)

| # | Gap | Count | Caveat |
|---|-----|-------|--------|
| 7 | **Gallery sets/images/alt-images** | **2,426** (448 sets + 1,964 images + 14 alt-images) | Root cause: the crawler follows links only (no ID sweep), so **443 `SetVisible=0` sets** — hidden from the top-level index but directly servable by URL — were never discovered. Their URLs are all deterministic from the DB. **The dump holds no gallery binary media**, so recovery needs footbag.org still live. |

Within Tier 2, the **concrete failed-fetch evidence** (the visible face of the 5,751 failed
downloads): 4 `SetVisible=1` containers (esp. set **"Seb" / RealSetID 1068**, whose captured
parent page literally contains the dropped `href="../Seb/index.html"`) and **28 isolated
images** (24 of them legacy `.wmv/.avi/.mpg/.mp4`, two with corrupted non-ASCII filenames) that
were linked from captured pages yet never fetched. These need targeted re-fetch + re-encode and
individual diagnosis if they fail again.

Gallery reconciliation: 18,791 DB rows → 16,213 captured → 2,578 missing = **152 policy**
(`Visible=0`, live site never served them) + **2,426 recoverable** + 0 migrated + 0 rule-bug.

### Tier 3 — Crawler link/route bugs (content present, references broken — fix in mirror code)

| # | Bug | Volume | Nature |
|---|-----|--------|--------|
| 8 | **`forum-down.html/index.php` mis-rewrite** | 18,987 broken refs, all sections | Treats the flat file `forum-down.html` as a directory. **One bug**; target content is present. `forum/index.html`'s `../forum-down.html` link is correct, proving the bug is isolated to the `discussion.html`-style redirect path. |
| 9 | **`&`-double-escaping in `.mp4` filenames** | ~34 videos + ~238 thumbnails | On-disk `Lisa&Andy….mp4`; links point to `Lisa&amp;amp;Andy…`. Video present, link broken. |
| 10 | **`events/ical` route never mapped** in `url_to_filepath()` | 1,182 event pages | Generic fallback collapses every `?eid=` onto one nonexistent path — iCal export captured for **zero** events. |
| 11 | **238 thumbnails** missing but **full image present** | 238 | Regenerable locally from the mirror; no live site needed. |
| 12 | **`events/rm` / `events/edit`** (non-`2` variants) missing from `DESTRUCTIVE_ROUTES` | few | Crawler requested them; live site rejected (GET didn't mutate). Harmless here but an allowlist hole to close. |

### Tier 4 — Hard losses (log to the migration plan's uncatalogued-loss-risk register)

- **The discussion forum** — down since ~2019 (hosting-provider issue per `forum-down.html`);
  no thread content in either source. *Known.*
- **106 gallery audio tracks** — dropped by the MP4/JPG-only media policy; the crawler discards
  the original filename (placeholder span `[Audio: not mirrored]` in `gallery/show/*`), so
  recoverable **only from the live site**.
- **Video "Open de France 2005 – Finale Double Net" (all 3 parts, `media/1232/…`)** — the live
  site returned a PHP memory-exhaustion error; no bytes exist anywhere.
- **7+ clubs** referenced from old news archives (e.g. ClubID 1098109619, 1207008912,
  1024950604, 1053011234) that were **already deleted from the live DB** before the snapshot.
- **worlds2002 promo button images** (`worlds2002/images/*.gif|jpg`, ~848 refs) and **WordPress
  theme assets** on the worlds2011–2017 microsites — real 404s from abandoned installs.
- **238 thumbnails with no full-image backup** — cannot be regenerated.
- **969 magic-byte rejections (~3.6%)** — some plausibly legitimate old-format files wrongly
  discarded; bytes are gone. Assessable only via a retention-on-failure re-run.
- **WordPress site (`wp/`)** — git-ignored from the dump entirely; also `forum`, `forum2`,
  `oldmembers`, `attic` are dump-side holes.

### Governance-blocked — DO NOT backfill without IFPA sign-off

- **IFPA election results: 155 of 187 pages missing** (`ifpa/showresults/<id>`; 32 captured).
  The data is safe in `ifpa/backups/latest.sql`, but there is an **open, secretary-owned
  decision** about whether the old vote records — which include individually-attributable
  ballots — should ever be published. Publishing them into a public archive would pre-empt that
  decision. The recommended posture on record is archive-encrypted-and-sealed, never published.
  **Flag, do not fix.** (`ifpa_issue_votes` = 10,497 rows, `ifpa_memberpayments`,
  `ifpa_membership_transactions` are PII/financial and were excluded from the audit.)

---

## 6. Confirmed NOT gaps (so nothing is miscounted)

- **`moves2` — RETRACTED false positive.** An early pass flagged `moves2/` as absent. It is
  **not**: the live `moves2` app is deployed at `/newmoves/`, all 303 move records are captured
  1:1 there, and they are migrated into the freestyle dictionary
  (`freestyle/inputs/footbag_org_moves_metadata.ndjson`; tips → `freestyle_trick_tips`).
  `moves_journal` (97 rows) is intentionally kept private (denylisted). The flag was a
  path-naming artifact (source dir `moves2` vs deployed route `newmoves`, analogous to
  `poll`→`newpoll`).
- **Events**: all 1,437 approved events captured. The 286 missing are all `Approved=0`
  (spam/test/withdrawn, e.g. "Test Event (ignore)") — correctly never-public. Events are also
  a first-class feature of the new platform. One oddity for a human glance: an event named
  "IFPA Worlds Footbag Championships 2024" is `Approved=0,Deleted=1`, so it was excluded like
  the rest — notable name, uniformly correct per the approval gate.
- **FAQ**: 100% captured (37 entries + 7 sections; the one missing row is an empty junk
  placeholder).
- **Localization (`localize/`)**: UI strings only (labels like `_YourProfile`), sparse and
  largely incomplete; the locale is a session setting, not a distinct crawlable URL per
  language — no localized pages exist to capture. Not a content loss.
- **Dead-code / vendor dirs (not content):** `gallery2`, `groups2`, `newgallery` (marked
  `NOT_IN_ACTIVE_USE`), `moves` (v1, README says "ignore"), `tib` (jQuery Tablesorter, README
  says "skip"), `wrapper`, `lib`, `google`, `api`, `ads`, `facebook*`, `global`.
- **`index2` / `actions`**: internal cache / admin queue — correctly out of crawl scope.

### Live-site defects captured verbatim into the archive (not mirror faults)
- A `ranking/eventresults.php` PHP warning ("Illegal string offset 'MemberCountry'") is baked
  into `events/show/*` pages.
- **Raw MariaDB SQL syntax errors leak into some live-site error pages** (e.g. under
  `gallery/showset/<garbage>`, `members/updateprofile`) and were captured verbatim — worth
  noting as a **security observation about the old site**, not a mirror problem.

---

## 7. Recommended next steps (nothing done yet — each needs go-ahead)

Ranked by value ÷ risk:

1. **Recover the 367 Hall-of-Fame photos** (Tier 1 #1) — pure dump pull, no live dependency,
   highest cultural value. Decide where they live in the archive.
2. **Recover the 222 club records** (Tier 1 #2) — pure DB rebuild; also fixes the migration
   pipeline's blind spot.
3. **Fix the crawler link bugs** (Tier 3 #8–#11) — recovers already-present content and
   regenerable thumbnails without a re-crawl.
4. **Backfill rules chapters, news permalinks, polls** (Tier 1 #3–#5) — DB-driven rebuilds.
5. **Decide on rankings** (Tier 1 #6) — resolve the deferred migration-plan question.
6. **Attempt a seeded live re-crawl** for the 2,426 gallery items + audio + the 4 visible-set /
   28 isolated failures (Tier 2, Tier 4) — **only while footbag.org is still reachable**; this
   is time-sensitive relative to cutover.
7. **Route the IFPA election results and all hard losses to the loss-risk register**, and get
   IFPA sign-off before touching the election data.

### Constraints to honor when resuming
- **Data governance is mandatory** for anything touching members, persons, contact fields,
  votes, payments, privacy. Member/contact/vote/payment columns were **not** extracted in this
  audit and must stay that way without explicit governance clearance.
- Closing gaps in the archive, editing canonical docs, or adding loss-register rows are each
  **separate, per-batch-approved** actions — this audit only produced findings.
- Media recovery depends on the live site; the dump has no binary media.

---

## 8. How this audit was run (for reproducibility)

Six read-only auditor agents, one per track, each computing the Section 2 set difference and
tagging findings with the Section 2 reason taxonomy, all verifying absence against **both**
`sitemap.txt` and `redirect_map.json` plus direct filesystem checks:

- **A-gallery** — `sets`/`images`/`alt_images` completeness (largest section).
- **A-news/events/faq** — record completeness + RSS handling.
- **A-small-DBs** — poll, ranking, clubs, rules, moves2, ifpa, index2, actions.
- **B-false-exclusions** — adversarial audit of the crawler's exclusion rules (cleared).
- **C+D+E** — directory coverage diff, MediaWiki uploaded images, localization.
- **F** — reconstruct the failed/uncrawled set (9,603 distinct broken references from 47,421
  occurrences) and verify thin/broken pages and per-year index shells against DB counts.

All raw SQL parsing and route enumeration was read-only `grep`/`awk`/Read over plain files.
