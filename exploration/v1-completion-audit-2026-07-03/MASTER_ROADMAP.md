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
I. **The Hour Test passes (site-level final gate).** A person browses the site for an
   uninterrupted hour as an interested freestyler — no code, no database, no CSVs,
   just browsing — and never hits a point where they want to stop and edit something:
   "this is confusing", "I expected a link", "why isn't this explained", "where do I
   click now", "this sentence is awkward". Whatever the browse surfaces gets fixed,
   and the hour is repeated until it runs clean. Manual by nature, and the thing that
   separates a technically complete encyclopedia from a genuinely polished one.
J. **Four-audience acceptance passes (per-page final gate).** Every foundational and
   important page passes the four-audience review defined in section 2a: a novice
   understands it (accessibility), an advancing player learns from it (education), an
   expert trusts it (authority), and an editor would recommend it (engagement) — all
   four, independently. This is the per-page companion to the Hour Test's site-level
   browse; together they are the release bar for editorial completion.

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

## 2a. Execution frame — the Editorial Release Phase (curator-set, 2026-07-03)

Work is no longer executed as a numbered roadmap. This is the Editorial Release
Phase: every slice must directly improve what a public visitor sees, and internal
cleanup, repository work, and pipeline documentation are intentionally deferred until
editorial completion. The numbered sections of this document remain the
dependency-and-owner reference; this section governs execution order. Work runs in
four phases, A → B → C → D.

**Phase A — Public Encyclopedia Polish (highest priority; the pages every visitor
sees). This is editorial completion, and it is the release bar. It runs as four
ordered sub-phases — polishing toward a finished encyclopedia rather than patching
one — plus a running usability pass.**

- **A1 — Foundational pages (Tier 1, highest teaching value).** The four foundation
  pages become the model pages for the whole encyclopedia: **Down**, **Swirling
  Whirl**, **Osis**, **Whirling Swirl**. Recommended build order: Down first (it fails
  both reader lenses while being doctrinally correct — the widest gap), then Swirling
  Whirl (no prose at all today), then Osis (made the model page, resolving the polarity
  contradiction as part of the rewrite — the page asserts a same-side catch that its
  own notation and the open positional doctrine both contradict), then Whirling Swirl
  (already strong; align it to the model). Each teaches first, answers the ten-question
  rubric, leaves one memorable takeaway, and passes the four-audience review, drawing
  on `PHASE1_FOUNDATIONAL_EDITORIAL.md` and the ranked fixes in `HESITATION_LOG.md`.
  Foundation-card connectivity is Tier-3 (A3) work and explanation-before-notation is a
  standing principle — neither is folded into A1.
- **A2 — History (the biggest content gap).** Rewrite the history page; add BAP,
  Hall of Fame, and FB World; add the timeline; add references; link to records and
  to historical people. This replaces most of the "Coming Soon" concept with real
  content.
- **A3 — Encyclopedia connectivity (where it starts to feel finished).** Glossary,
  deep links, "see also", family links, operator links, movement links, notation
  links, history links. The single biggest quality-of-life improvement for readers.
- **A4 — Public-honesty pass (final polish).** Remove any remaining "Coming Soon";
  missing videos; broken links; records-page framing; badge cleanup. Done last, so
  it polishes a finished encyclopedia: A2 has already given the Coming-Soon tiles
  real destinations, so this is cleanup of the residue, not a remove-versus-replace
  call.

**Usability pass — the advancing intermediate player (run early; feeds A1 and A3).**
Read the encyclopedia not as curator or database author, and not as a stranger to the
sport, but as its real audience: an advancing intermediate freestyler who can already
do Mirage, Legover, Butterfly, and maybe Whirl, and wants to understand freestyle
more deeply. Browse from the landing page through families, trick pages, and links,
and ask at each page — do I understand why this trick is important, can I visualize
the motion, do I know where to go next, and are there dead ends? Every five-second
hesitation gets written down. This surfaces editorial improvements no audit or
roadmap finds; its log seeds the A1 and A3 work. Its findings are scheduled by their
phase tag (A1–A4), not by a flat severity ranking: history (A2) is completed before
connectivity (A3) even when a connectivity finding scores as the single highest-value
fix, because history is what makes this an encyclopedia rather than a dictionary. So
the recon's top-ranked item — repointing the "12 Foundations" cards at their trick
pages — is A3 work that waits for A2, not a queue-jump.

**Before A1 — the north star: teach first, reference second, documentation third.**
Do not optimize a page for completeness; optimize it for understanding. A page
succeeds if the reader closes it remembering one important idea and immediately knowing
where to go next — even if every technical detail is not visible above the fold.
Teaching comes first, reference material (notation, tables) second, exhaustive
documentation third. This is the lens through which the rubric, the memorable takeaway,
and the four-audience review are all applied; the tiers below are ordered by teaching
value, not by fix count.

**Foundational-page rubric — ten questions (teaching is the primary requirement).**
The real distinction is not missing notation or missing links: some pages merely
describe mechanics, and the best pages teach. Teaching is the primary requirement for
a foundational page. Every foundational page — and, by their example, every trick and
family page — answers, in this order: (1) Why should I care? (2) What question brought
the reader here? (3) What is it physically? (4) Why is it important? (5) How is it
performed? (6) Where does it appear? (7) What does it generate or lead to? (8) Common
misunderstandings. (9) What should I learn next? (10) What makes this trick
interesting or memorable? Questions 1-2 are the opening hook; question 10 is the
takeaway. Notation is reference material: it supports the explanation and never leads
it. Per page — Osis: a terminal movement, not a clipper entry; one of the most
influential terminal movements in freestyle, anchoring the Torque and Blender
families. Down: what a "down" is physically, first; the four structural variants share
one underlying terminal movement, which is why Red confirmed they are one structural
family; link Barfly, DOD, DDD, Paradon. Whirling Swirl: a simultaneous whirl and swirl
— not sequential. Swirling Whirl: the same coordinated execution from the opposite
perspective; the name alone does not indicate execution order.

**The opening — answer, then justify, then define.** A reader arrives with a question,
not a request for a definition, so a foundational page opens in three moves, in this
order — backwards from traditional documentation, but natural for an encyclopedia: (1)
**answer the reader's question** — their perspective, the motivation that brought them;
(2) **explain why the subject matters** — the encyclopedia's perspective, its
importance; (3) only then **explain what it is** — the definition. Motivation and
importance are kept distinct, not merged: the first frames the page from the reader's
seat, the second asserts the encyclopedia's judgment. Osis, worked: the reader's
question is "why does everyone keep talking about Osis?"; the importance is "Osis
became one of the most influential terminal movements in freestyle because it anchors
the Torque and Blender families and appears throughout advanced combinations"; the
definition (a spin that ends behind the back) follows. Per-page motivating questions:
Osis — "why does everyone keep talking about Osis?"; Down — "what exactly is a Down?";
Whirling Swirl — "which dex happens first?"; Swirling Whirl — "how is this different
from Whirling Swirl?"; Butterfly — "why is Butterfly considered fundamental?"; Mirage
— "why is Mirage the first dex everyone learns?". This opening is the twin of rubric
question 8: the hook opens, the takeaway closes.

**The memorable takeaway — "would I quote this?" (rubric question 10).** Every
foundational page must leave the reader remembering one important thing — a sentence a
player would quote when explaining the trick to someone else. A page with no memorable
line is probably accurate but forgettable; this is the gap between describing a trick
and teaching it. Model takeaways: Osis — "Osis became one of freestyle's defining
movements because Torque and Blender — and hundreds of advanced combinations — grow
directly from it"; Down — "the Down family looks like four different tricks, but
they're really four variations of the same ending"; Butterfly — "the bridge between
beginner freestyle and modern combinations"; Mirage — "the first dexterity that unlocks
almost everything that follows"; Whirling Swirl — "the whirl and swirl are coordinated,
not sequential".

**The Family Teaching Contract (the family-page skeleton).** Every foundational family
page renders the same eleven sections, in this order, so Osis, Mirage, Whirl,
Butterfly, Torque, Blender, and Down all read as one encyclopedia rather than eleven
separate authors: (1) why should I care (the hook, in the hero); (2) what is it
physically; (3) why is it important; (4) structural model (the variant grid and the
ruling behind it); (5) how to recognize one (recognition cues, distinct from
execution); (6) how to think about it (a reusable mental tool); (7) common
misconceptions; (8) famous descendants (the named compounds that build on it); (9)
reference notation (the formal form, below the explanation, never leading); (10) where
to go next; (11) one memorable takeaway. The contract is enforced in code, not only in
prose: the `FamilyTeaching` interface in `src/content/freestyleGlossaryFamilyCards.ts`
is its schema and `family-detail.hbs` renders the sections in this fixed order. A
family opts in by supplying the block, and its glossary card shows a compact
projection (physical description, significance, and a link to the full article); a
family with no block renders the compact projection unchanged. Down is the first fully
authored exemplar.

**The contract is frozen.** The eleven sections are stable editorial architecture: do
not add, remove, or reorder them while authoring individual pages. Any future change
must improve every family page simultaneously, never serve one page. Stability
milestone: when four consecutive foundational pages can be authored without modifying
the contract, the editorial architecture is considered stable. The stress-test
sequence is Osis (a terminal movement that became a family), Whirling Swirl
(simultaneous actions), Swirling Whirl (perspective naming), and Mirage (a foundational
dex); if the contract holds for those four, it holds almost everywhere.

**Two authoring rules the contract enforces on every page:**
- **Describe the movement independent of its entry.** Never describe a movement by how
  it is usually entered when the movement itself is independent of the entry. Describe
  the movement first (for a terminal movement, its ending); discuss common entries
  afterward, as entries, not as the definition.
- **State only what is unquestionably true.** Where a doctrine point is unresolved (for
  example an osis catch-side the rules have not fixed), state only what is settled and
  do not imply a starting surface or catch-side that has not been ruled. This is
  stronger than wording around the gap: the page simply does not assert the unruled
  thing.

**Frozen questions, not answers: the structural-model slot flexes by archetype.** The
contract fixes the eleven questions, never how a family answers them. Section 4
(structural model) is whatever best explains why that family exists, and families fall
into at least two archetypes: a **variant tree** (one movement, a fixed set of named
variants, like Down's four set-by-foot cells) and a **generative tree** (one movement
and many descendants that build on it, like Osis, whose Torque, Blender, Mobius, and
Spender each add something before the same osis ending). The template renders section
4 as prose, showing the variant grid only for a variant tree, so both archetypes fill
the same slot without forcing one family into the other's shape. Do not force every
family into the same structural explanation.

**Four-audience review — the page-acceptance standard.** Answering the ten questions
is necessary but not sufficient. A Version 1.0 page — and every important page — is
finished only when four independent readers would each say yes, because accessibility,
education, authority, and engagement are different tests a page can pass singly while
failing another: a page can be perfectly accurate yet dull, or engaging yet quietly
wrong. This is the editorial standard for the encyclopedia, not merely "technically
correct":

- **Novice — Accessibility ("Can I understand this?").** Just discovered freestyle.
  Asks: what is this, can I understand the first paragraph, what do these words mean,
  can I picture it, where do I go next. Watches for jargon, unexplained terms, dead
  ends, intimidation. Success: "I want to keep reading." The page reads easily,
  defines its terminology, links well, never dead-ends.
- **Intermediate — Education ("Can I learn from this?").** Knows the basics, wants to
  improve. Asks: why is this trick important, how does it relate to other tricks,
  what should I learn first, what misconception did this clear up, what to practice
  next. Watches for progression, relationships, conceptual understanding, navigation.
  Success: "I learned something useful." The page explains significance, shows
  relationships, gives correct progression, suggests next reading.
- **Expert / historian / curator — Authority ("Can I trust this?").** Years of play.
  Asks: is this historically accurate, is the doctrine consistent, is terminology
  correct, are aliases handled properly, are sources represented honestly, does it
  match community understanding, were controversial points acknowledged. Watches for
  subtle inaccuracies, historical omissions, doctrinal inconsistency, misleading
  wording, unsupported claims. Success: "I trust this encyclopedia." This lens has two
  facets, and both must pass: (a) a **doctrine-and-fact check** — every claim verified
  against `freestyle/doctrine/*` and the source-priority order (Red > curated >
  footbag.org > scraped), so the page is structurally correct, fair to its sources,
  doctrine-consistent, and free of unsupported assertions; and (b) an
  **editorial-authority review** — read the page as a named long-time freestyler
  (Red, Vasek, Lon, Ken) and ask not about ADDs or doctrine but about judgment: is the
  emphasis correct, is the history fair, is anything misleading, is anything
  oversimplified, is something important omitted? The veteran's "that's not quite
  right" catches a class of issues neither the reader lenses nor the fact-check will.
- **Editor — Engagement ("Is this page worth reading?").** Asks: does it have a
  compelling opening, does every paragraph earn its place, is there unnecessary
  repetition, does it leave the reader with one memorable idea, would I recommend this
  page to another player? Watches for dullness, bloat, a buried point, structure that
  wanders. Success: "I'd send this to someone." A correct page can still be dull or
  poorly structured; this lens is what separates technically complete from worth
  reading, and it is why the four-audience standard replaces "technically correct".

The rule: a page is finished only when the novice understands it (approachable), the
advancing player learns from it (structure and progression), the expert trusts it
(accurate and editorially balanced), and the editor would recommend it (engaging,
concise, memorable, worth reading) — all four, independently. Correctness,
comprehension, and engagement are separate dimensions; a V1.0 page satisfies all four.
This is the per-page acceptance test at the release bar; the Hour Test (checklist gate
I) is its site-level companion — the four-audience review certifies each page, the Hour
Test certifies the whole browse. The reconnaissance already ran the novice,
intermediate, and expert lenses (`exploration/v1-usability-firstvisit-2026-07-03/HESITATION_LOG.md`);
the editor lens is applied as each A1 page is written and accepted.

**Flow principle — every click should make the reader feel smarter.** The
reconnaissance's highest-severity issues are not missing content but missing
transitions: a foundation card opens a silent video instead of the explanation, the
Down family offers notation with no physical description, swirling-whirl shows
autogenerated structure with no human words, the history landing says "Coming Soon"
over an already-rich history page. These are failures of flow, not knowledge. So
across Phase A, every click should leave the reader feeling smarter than the page they
came from; a click that lands on a dead end, boilerplate, or something less
explanatory than its origin is a candidate for improvement. Primarily an A3 test, but
every link built in A1 and A2 is held to it too.

**Phase B — Dictionary completion.** Unknown notation (the 26 notation-less active
tricks); the no-Red blurry footbag.org subset; remaining deterministic authoring;
remaining aliases. Author the derivable rows; record deferred status per row for the
Red-blocked remainder (arctic, blazing structure, rake-based).

**Phase C — Architecture.** De-dup; authority modules; reference ownership;
exploration consolidation.

**Phase D — Repository.** PRE-KANBAN; skills trim; pipeline docs; cleanup; backup
pruning.

Dependency check: the phase order is safe. Phase A depends on nothing in B, C, or D.
The A1 → A2 → A3 → A4 sub-order is deliberate: the foundational pages set the model
the connectivity pass links into; the history build gives the "Coming Soon" tiles
real destinations before the honesty pass removes the residue (so remove-versus-
replace never has to be decided); and connectivity precedes the final polish so links
point at stable homes. Phase C's exploration consolidation stays after the editorial
and dictionary work, so the references doctrine docs and skills make into
`exploration/` are repointed once, not mid-flight. Phase D is the previously-deferred
repository track. The only cross-cutting inputs are curator content decisions inside
Phase A — the sole-survivor clip, and the Hall of Fame / FB World / BAP history
sources, including the BAP shred-clip tagging pass — curator work, not cross-phase
blockers.

Interactions to manage (soft, not blockers):
- The A1 Down-family and Osis editorial rewrites edit `freestyleGlossaryFamilyCards.ts`
  prose; the Phase C family-card de-dup later derives that card's kind/tier fields
  and must preserve the A1 prose (the render-oracle regression catches content loss).
- Phase B promotions shift the gate counts; each slice re-syncs its own counts under
  the surface-propagation rule.

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
