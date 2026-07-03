# Freestyle encyclopedia — master roadmap to Version 1.0

Audit date 2026-07-03. Synthesizes the four sibling deliverables:
`COMPLETION_CRITERIA.md` (per-subsystem done-checklists),
`ENCYCLOPEDIA_AUDIT.md` (editorial/IA findings), `TECH_DEBT.md` (residue census),
`RED_DEPENDENCY_AUDIT.md` (external-dependency challenge), and the sibling
`PHASE1_FOUNDATIONAL_EDITORIAL.md` (the four foundational pages, separately
authored). Respects the curator-set working order in `IMPLEMENTATION_PLAN.md`.

## 1. Completion checklist (the V1.0 definition of done)

A. **No public dishonesty**: no "Coming soon" tiles; no trick page whose only demo
   is a dead embed; unresolved record names either resolved or honestly framed.
B. **One authoritative home per concept**: de-dup fixes 1-4 executed (fix 5
   finished); family-content ownership handed to the shipped family pages.
C. **Every published number honest**: ADD mismatches flagged (done), Red-queue
   counts current, generated stats fresh against the DB (freshness check or
   documented procedure).
D. **Every hold visible and governed**: EV ladder current (done); each held case
   in exactly one live queue; the arctic state inconsistency reconciled;
   terraging rider send-confirmed.
E. **The plan of record matches reality**: stale IP items closed (Family Pages,
   EV generator cleanup); the PRE-KANBAN pipeline doc-sync run.
F. **Repo fit for go-live**: exploration disposition executed with references
   repointed; skills trimmed and the two CI waivers deleted; comment/test-label
   hygiene items done.
G. **Editorial floor met**: foundational-page pass per
   `PHASE1_FOUNDATIONAL_EDITORIAL.md`; history rewrite done; contextual-only
   surfaces introduced properly or promoted.
H. **Everything else parked ON PURPOSE**: EV promotion frontier, queued set pages,
   Movement Systems audit, admin dictionary editor — each carried as a recorded
   post-V1 item, never as silent absence.

## 2. Ordered implementation roadmap (shortest path to done)

Follows the curator working order where it applies; each step names its owner.

1. **Plan/skill sync to reality** (James, small): close the stale Family Pages and
   EV-cleanup items after verifying done-conditions; refresh Red-queue counts and
   the arctic inconsistency; confirm-or-send the terraging rider. (Checklist D, E)
2. **Pipeline doc-sync** (James, PRE-KANBAN, medium): the post-refactor
   documentation-sync pass already itemized in the IP; fold in the scraped-CSV
   twin clarification. (E)
3. **Freestyle consolidation architecture** (James, medium): execute the
   exploration disposition — doctrine-cited evidence packets and live queues get
   permanent homes; superseded scratch archives; skills/IP references repointed in
   the same change. (F)
4. **Public-honesty fixes** (James + curator, small): remove or build the three
   landing "Coming soon" tiles; sole-survivor replacement video (curator find +
   fresh DB build); records-page honest framing for the ~10 unresolved names. (A)
5. **Unknown-notation / deterministic-authoring batch** (James, medium): the 26
   active tricks without operational notation; author or record the
   ADD-authority-only status per row. (C)
6. **Blurry fb.org-JOB sub-batch** (James, medium): split the 64-row blurry gate;
   author the rows carrying their own footbag.org JOBs under source priority;
   shrink the Red gate to the remainder. (D, and the largest promotion unblock
   available without Red)
7. **De-dup fixes 2 and 4** (James/Dave, small each): generate the glossary ADD
   table from `freestyleAddAnalysisContent`; derive family cards from the roster
   modules and hand family ownership to the shipped family pages. Render-oracle
   regression per the blueprint. (B)
8. **De-dup fix 1 then fix 3** (James/Dave, medium): pick the Tier-1 operator
   definition authority, then the notation-token module move (the big one). (B)
9. **History rewrite + foundational editorial pass** (James as editor, per
   `PHASE1_FOUNDATIONAL_EDITORIAL.md`), including the landing "reference shelf"
   and the contextual-only-surface decisions. (G)
10. **Hygiene batch** (James, small each, parallel-friendly): freestyleService
    slice-comment strip + the two pt-framed notes reworded; test de-epoch and
    doc-reference strips (two IP items); `__pycache__` gitignore; DB backup prune
    (one consolidated destructive approval). (F)
11. **Skills trim** (Dave, after step 3 supplies the content audit): rewrite the
    four freestyle skills, delete the two `assert_claude_harness.sh` waivers. (F)
12. **Close-out audit** (James, small): re-run the completion checklist; confirm
    every OPEN in `COMPLETION_CRITERIA.md` is either done or recorded as post-V1.

## 2a. Curator reprioritization — finish the public encyclopedia first (2026-07-03)

The roadmap is a dependency graph, not a fixed order. The curator has reprioritized
to complete the public freestyle encyclopedia as fully as practical before any
repository-wide work, and this reordering was verified free of dependency
violations. The execution order is now:

1. **Public-honesty fixes** (was step 4) — the coming-soon tiles, the sole-survivor
   video, the records-page framing. The sole-survivor clip waits on a curator
   sourcing action (and a fresh DB build); the tile removal and the records sentence
   proceed independently.
2. **Foundational editorial pass** (part of step 9) — Osis, Down family, Whirling
   Swirl, Swirling Whirl, per `PHASE1_FOUNDATIONAL_EDITORIAL.md`.
3. **History rewrite + reference shelf** (rest of step 9).
4. **Unknown-notation batch** (was step 5) — the 26 notation-less active tricks;
   author the derivable subset, record deferred status for the Red-blocked remainder
   (arctic, blazing structure, rake-based rows).
5. **Blurry footbag.org-JOB authorable subset** (was step 6) — the rows that author
   under source priority regardless of Red's answer; the remainder stays gated.
6. **Glossary / encyclopedia de-dup fixes** (was steps 7-8) — fixes 2 and 4, then 1
   then 3.
7. **Discoverability and cross-link pass** (from `ENCYCLOPEDIA_AUDIT.md`).
8. **Only then repository-wide work** — pipeline doc-sync (step 2), exploration
   consolidation (step 3), hygiene (step 10), skills trim (step 11).

Why it is safe: no freestyle item depends on the deferred repository work.
Exploration consolidation is better done AFTER the content work — it repoints the
references doctrine docs and skills make into `exploration/`, so doing it last avoids
repointing mid-flight — and the pipeline doc-sync gates no content authoring. The
only external inputs inside the freestyle track are curator actions (the
sole-survivor clip, the history sources), not repository tasks.

Interactions to manage (soft, not blockers):
- Coming-soon tiles (item 1) and the history rewrite (item 3) share the
  landing/history surface: item 1 removes the vaporware for honesty now; item 3
  rebuilds real pages and tiles. Treating removal as the honest interim state avoids
  remove-then-readd churn.
- The Down-family editorial rewrite (item 2) and the family-card de-dup fix 4 (item
  6) both edit `freestyleGlossaryFamilyCards.ts`, but item 2 rewrites the definition
  prose and the mislabeled one-family ruling while fix 4 derives the kind/tier
  fields; fix 4 must preserve item 2's prose (the render-oracle regression catches
  content loss).
- Items 4 and 5 promote rows and shift the gate counts; each slice re-syncs its own
  counts under the surface-propagation rule.

## 3. Parallelizable work

- Steps 4, 5, 6 are independent of steps 2, 3 (different files).
- The two de-dup pairs (7 and 8) are four independent slices by design.
- Step 10's hygiene items are all independent of everything.
- The curator/Red tracks below run concurrently with everything.
- Only real sequencing constraints: 3 before 11 (skills need the disposition);
  fix 1 before fix 3 (authority decision first); 1 before the kanban seeding.

## 4. Curator work (decision or viewing time, not code)

- Source the sole-survivor replacement video.
- POD-versus-Dimmier video viewing; Kiwi; Clipper Symposium Whirl; the
  atomic-pickup alias confirmation (status-quo-on-omelette is the natural
  default).
- The five-plus-one ambiguous same-side positional records (worklist exists).
- Optional accelerators identified by the Red audit: adjudicate the
  embedded-base spin-inversion convention on the two-exhibit evidence, and/or
  accept the slapping/flailing prefix-form hypotheses as evidence-derived rulings
  with recorded residual risk (both have the alpine precedent).
- Per-trick tagging pass over the BAP shred clips (or record its V1 exclusion).

## 5. Red work (external; V1 does not wait on any of it)

- The Wave 3 letter is out; the remaining answers: blurry predicate (the
  post-split remainder), embedded-base frame, four operator structural
  definitions, cross-body rake base, terraging chain, and the rider list.
- The one administrative must-do on our side: confirm the terraging rider was
  actually sent.
- Every entry has a governed fallback (EV parking, divergence notes, or curator
  adjudication) per `RED_DEPENDENCY_AUDIT.md` — Red silence degrades promotion
  throughput, never correctness.

## 6. Primary-maintainer (Dave) work

- Skills trim + CI waiver deletion (step 11; waits on James's content audit —
  now supplied by `TECH_DEBT.md` Section 1-2).
- Close the Family Pages MVP item after verifying its route tests and sitemap
  done-conditions.
- The gallery-links item (family view, landing, `/freestyle/media` into context
  galleries) and the Net-gallery sibling item.
- The difficulty-tag design recording (after James splits the PassBack compound
  tags).
- De-dup slices if taken as platform work (they touch service/template code).
- Post-V1: the admin dictionary editor under the source-of-truth cutover pattern
  (parked; must appear in the go-live scope decision as a stated limitation).

## 7. Cleanup work (small, bounded, no decisions)

- Slice/pt comment rewording (9 + 4 sites); test de-epoch (~120 files, mechanical
  but large); doc-reference strips (8 test files + named content/service files).
- `__pycache__` removal + gitignore; zero-byte DB stragglers; stray dev keypair.
- Scraped-CSV twin rename/clarification.
- Red-queue count refresh + single-queue de-duplication of the records-only
  riders.

## 8. Technical debt (recorded, scheduled, not V1)

- `freestyleService.ts` split (11,291 lines) — post-V1, behind the service
  contract.
- glossary.hbs shrinks via de-dup, not separate refactor.
- Generated-content freshness check (count-sync test) — small, worth doing in the
  V1 window if cheap; otherwise document the manual regeneration procedure.
- DB backup retention convention (~2.5 GB, 59 files; one consolidated approval).
- `seed_from_records.py` tool disposition.

## 9. Nice-to-have future work (post-V1, explicitly not blockers)

- The five queued set pages (Atomic, Miraging, Quantum, Barraging, Nuclear) and
  the Quantum/Miraging merge question.
- Movement Systems completeness audit; a second progression page (or folding
  walking-family under learn).
- EV undefined-operator "what we know" one-liners; glossary V5 section 12;
  symbolic-grammar UI rollout phase 1.
- Instructional-slot expansion beyond the 205 most-read tricks; the four deferred
  Technique Notes as sources appear.
- Local MP4 clip ingestion; member-tips author attribution (behind the
  public-names governance decision); PassBack staged-intake promotion as its
  open questions resolve.
- History Timeline / Milestones / Evolution-of-Vocabulary as real pages (if the
  tiles were removed rather than built in step 4).

---

## If the freestyle encyclopedia were released today, what would prevent calling it Version 1.0?

The honest list, in order of severity. Notably, the promotion frontier is NOT on
it: 507 published structures with 971 intake rows visibly governed on the EV
ladder is a defensible, honest V1 shape — parking is a correct outcome by the
encyclopedia's own doctrine.

1. **The landing page advertises content that does not exist.** Three public
   "Coming soon" tiles (History Timeline, Historical Milestones, Evolution of
   Vocabulary). A reference work does not ship vaporware tiles; build or remove.
2. **Reference content is still double-authored in four places.** The glossary's
   hardcoded ADD table, notation tokens, family cards, and Tier-1 operator
   definitions each have a second (or third) independent authoring. In an
   encyclopedia this is a latent correctness defect, not style debt: the next
   doctrine change silently forks the copies. Fixes 2 and 4 are each under a
   day; 1 and 3 are the remaining real work.
3. **A published trick page has a dead demo and about ten historical records
   badge nowhere, silently.** Sole-survivor's only clip is private; the ~10
   unresolved record names just fail to badge with no explanation. Both are
   honesty defects on live surfaces (the fixes are a curator video hunt and one
   honest sentence on the records page — the underlying rulings can wait).
4. **26 active tricks carry no operational notation** — below the encyclopedia's
   own universal-notation-card standard, with no on-page acknowledgment. Author
   them or state the deferred status per row.
5. **The plan of record disagrees with reality.** Family Pages and the EV
   generator cleanup are shipped but still open in the IP; the Red queue's counts
   have drifted (43 vs 64 blurry; 3 vs 4 repeated-operator); arctic is
   simultaneously "undefined" (queue) and "authoring" (universe); and nothing
   proves the terraging rider ever reached Red. None of this is user-visible,
   but a 1.0 cannot be declared from a ledger that misstates its own state.
6. **The go-live repo gates the IP itself names are unmet**: the exploration
   disposition plan (doctrine evidence and live queues currently live in a
   ~1,000-file scratch corpus the doctrine documents cite), the freestyle skills
   trim with its two CI enforcement waivers, and the PRE-KANBAN pipeline
   doc-sync.
7. **The editorial passes the curator has already ordered are not done**: the
   history rewrite and the foundational-pages pass (the sibling Phase-1
   deliverable), plus the discoverability decisions for the five unlinked
   surfaces.

What does NOT block V1.0, by explicit doctrine or recorded decision: every open
Red question (all have governed fallbacks), the EV frontier, the five queued set
pages, the read-only dictionary limitation (state it in the scope decision), the
Movement Systems audit, the freestyleService monolith, and the test-comment
hygiene items (do them, but they gate the repo's 1.0, not the encyclopedia's).
