# Freestyle 1.0 release certification (2026-06-25)

Adversarial, read-only. Every verdict judged against the CURRENT codebase, not historical notes.

## 1. IMPLEMENTATION_PLAN freestyle closure checklist

| IP item | Status | Evidence / why |
|---|---|---|
| Spinning-symposium-whirl replacement video | NOT COMPLETE (curator) | demo hidden via `#unavailable_embed`; page renders cleanly. Non-blocking. |
| Individual-shred semantic tag (~46 clips) | NOT COMPLETE (curator) | advisory media-tag QC floor; `run_freestyle.sh` exits 0, hard gate passes. Non-blocking. |
| Link 16 world-record videos | NOT COMPLETE (curator/Red) | records render gracefully (null-guarded `trickHref`); 27 unresolved names individually classified (P1.3 audit). No broken links. Non-blocking. |
| Trick-promotion decisions | BLOCKED (Red Wave 2) | external; intentionally deferred. |
| Rename / de-epoch freestyle test files | NOT COMPLETE | internal test hygiene (~120 files); not a public surface. Non-blocking. |
| `exploration/` go-live disposition | NOT COMPLETE | repo housekeeping decision; ~970 tracked files. Pre-go-live, not a public defect. |
| Underscore residuals (3 slugifiers, trackedNames regen, skill sweep) | NOT COMPLETE | affects ~9 `is_active=0` Emerging-Vocab pending tricks (kebab slugs, excluded from public canonical browse) + an unconsumed generated file + an internal skill. Non-blocking. |
| Hashtag → gallery link rework (name-as-text, Trick Detail link, drop media chip) | NOT COMPLETE (DEVIATION) | verified: `dictionary-trick-row/card.hbs` render hashtag as `<span>`, name as the link, media-coverage chip present; related/progression partials link the hashtag to *detail* (internal inconsistency). Functional + non-misleading. |
| Trick-detail hero (side-qualifier + ribbon) | PARTIALLY COMPLETE (BUG) | side-qualifier leak FIXED (`page.title = stripDisplaySideQualifier`, freestyleService.ts:6634); taxonomy ribbon STILL in the hero (`trick-hero.hbs:18`), not moved to body; no Mirage route test (done-condition unmet). |
| PassBack compound difficulty tags | NOT COMPLETE (DEVIATION) | `#passback_advanced`/`#passback_beginner` still in 20+ curated sidecars + `mediaService` tag map; not split. Galleries work. |
| Trick-dictionary landing beginner-first | COMPLETE | orientation-first intro (freestyleService.ts:9086, "This is the dictionary… Pick a lens below to start"); count demoted. IP text is stale. |
| Self-orienting filtered-state headers | COMPLETE | every `?view=` and `?family=` state renders a per-view intro/filter pill (tricks.hbs lines 21/239/284/330/525/575/105). |
| Foundations named-gallery burnt-in captions (BUG) | COMPLETE (fixed) | `#demo_mosaic` → `captionMask` (mediaService.ts:1121-1125) → `.gallery-tile-caption-mask` overlay (`_gallery-tile.hbs:10`), same pattern as the landing mosaic. |
| Tidy/relocate freestyle skills (`.claude/`) | NOT COMPLETE | internal skill hygiene; maintainer-owned. Non-blocking. |
| DD §2.6 + USER_STORIES role-based hashtag doc-sync | NOT COMPLETE (DOC DRIFT) | canonical docs still describe the superseded single-token + `#toe_set` model; the shipped role-based/underscore convention is unrecorded. Maintainer-owned; proposal packaged, not applied. |
| Record difficulty-tag design | NOT COMPLETE | blocked on the PassBack tag split. |

External blockers (cannot be "completed", correctly deferred): IFPA rules wording (rules buttons intentionally absent), Red Wave 2. Deferred/parked (acceptable for 1.0): no in-app dictionary editing (read-only dictionary), Glossary V4, symbolic-grammar UI, local MP4 ingest.

## 2-4. Surfaces / data / content (from this session's audits + P1 clearance)

- **No release-blocker (incorrect/misleading) content found.** All P1 items from the release audit are cleared: blurry glossary contradiction fixed; atom↔operator links bidirectional; record links render gracefully; family `?family=` round-trips; ADD-analysis internal-jargon (Red/pt##/file-refs/provenance column) removed with a page-wide regression test.
- Surfaces internally consistent; terminology/notation/formula consistent across glossary, operators, sets, movement-systems, add-analysis, trick detail; no rendered `pt##`/Red/code-symbol jargon (views are comment-only; content render-walk = 0).
- Completeness gaps that remain are P2/P3: ~21 empty/placeholder trick descriptions; ~7 flagship tricks with terser descriptions than fb.org; ~711 active tricks without operational notation (114 are "operational-notation pending", the rest genuinely unauthored); media sparse (curator track).

## 5. Beginner walkthrough (Toe Stall → … → Drifter → combinations)

No navigation/learning break found: landing is orientation-first, glossary "how to read" card + progressive arcs, each browse state self-orients, atom↔operator now cross-linked both ways, Set Encyclopedia + families navigable. Minor: a beginner hitting a trick with an empty description (P2) or a `<span>` hashtag they can't click to media (the deviation) gets less than the intended experience, but the path never dead-ends.

## 6. footbag.org comparison (where fb.org is still better)

- Execution-first prose: fb.org leads several foundational moves (clipper, mirage, osis, illusion) with how-to-perform + entry options + balance cues; some of ours are terser/structural. P2.
- That is the only material area; our coverage, cross-linking, taxonomy, and discoverability exceed fb.org elsewhere.

## 7. Classification

- **RELEASE BLOCKER:** none.
- **MAJOR QUALITY:** hashtag→gallery deviation (+ related-partial inconsistency); DD §2.6 / USER_STORIES doc drift.
- **MINOR POLISH:** hero taxonomy-ribbon move + Mirage test; PassBack compound-tag split; underscore residuals; flagship execution-first descriptions; ~21 empty descriptions.
- **FUTURE / external / curator:** 16 record videos, trick-promotion decisions (Red), individual-shred tags, spinning-symposium-whirl video, test de-epoch, `exploration/` disposition, in-app dictionary editing, IFPA rules wording.

## Final verdict

1. **Ready for public 1.0?** Yes on a correctness/consistency basis — no release blocker, no incorrect or misleading public content, all P1 cleared, surfaces consistent. The open items are accepted deviations, curator/external work, internal hygiene, or doc drift — none blocks ship.
2. **Every IP freestyle commitment complete/superseded/deferred?** No — 3 are complete (beginner landing, self-orienting headers, Foundations gallery), 1 partial (hero), the rest are open as accepted deviations, external/curator blocks, or internal hygiene. None is a release blocker.
3. **If shipping tomorrow, close these first (in order):**
   1. DD §2.6 + USER_STORIES doc-sync (canonical docs contradict the shipped hashtag model — maintainer-owned, quick, highest truth-risk).
   2. Hashtag→gallery deviation + the related/progression-partial inconsistency (largest user-visible intended-design gap).
   3. Finish the hero `[BUG]`: move the taxonomy ribbon to the body + add the Mirage hero route test (closes the done-condition).
   (The record-video links, trick promotions, and IFPA rules wording are curator/external and cannot be completed unilaterally.)
