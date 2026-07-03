# Glossary Freeze & Authority Pass — Audit

**Phase G-Final.** Read-only comprehension/authority audit of the public freestyle glossary (`src/views/freestyle/glossary.hbs`, 2128 lines, + the `src/content/freestyle*.ts` modules it renders from). No content was edited; this is a recommendation deliverable. Every finding is graded against two bars: *would a beginner understand this?* and *would an expert trust it as definitive?*

Method: four parallel section audits (Priority 1+2 beginner/how-to-read; Priority 3 expert terms; Priority 4+5 authority/emerging-vocabulary; Priority 6+7 public-language/structure), each grounded in quoted text + line numbers, then consolidated here.

Glossary section map (h2 order + tier badge):

| # | Line | Heading | Tier |
|---|---|---|---|
| 1 | 28 | How to read this glossary (intro card) | — |
| 2 | 65 | Reading the dictionary | — |
| 3 | 161 | Movement Basics | (none) |
| 4 | 239 | Contact Surfaces & Delays | Beginner |
| 5 | 348 | Dexterities (Dex) | Beginner |
| 6 | 456 | Timing & Sets | Beginner |
| 7 | 521 | Core Trick Families | Intermediate |
| 8 | 670 | Modifiers & Operators | Intermediate |
| 9 | 722 | Trick Naming & Notation | Intermediate |
| 10 | 1162 | ADD Accounting | Intermediate |
| 11 | 1383 | Symbolic Composition | Intermediate |
| 12 | 1716 | Run Architecture | Intermediate |
| 13 | 1749 | Family & Topology Concepts | Advanced Ref + observational |
| 14 | 1815 | Case study (inside-delay neighborhood) | observational |
| 15 | 1864 | Advanced Reference Concepts | container |
| 16 | 2006 | What a video can and can't tell you | Advanced Ref |
| 17 | 2052 | Community Vocabulary | Advanced Ref |
| 18 | 2077 | Historical Terms | Advanced Ref |
| 19 | 2100 | Sources | — |

---

## Executive summary

The glossary is **substantively strong and unusually honest**: the twelve-atom educational cards (movement-first "lead" + "feels-like" intuition), the timing-clock visual, the ADD-accounting worked examples, the Job's-grammar derivation, and the Furious/Railing + Big Apple Sauce divergence passages are genuine reference-grade material. Its honesty contract (canonical vs observational, "tracking is not canonization") is handled with care most references never attempt.

It is **not yet citable as authoritative**, for a small, fixable set of reasons: one hard factual **contradiction** against settled code (spyro), a missing **source-authority hierarchy** (it explains conclusions better than the reasoning that produces them), **emerging-vocabulary states explained only in governance jargon**, one **completely undefined load-bearing modifier** (whirling), **forward-dependency** in the single most important section (the dictionary key uses ADD/dex/JOB before defining them), and the **rooted / sailing / railing / shooting** operator cohort surfaced only partially with a dead cross-reference. Clear the A-list and it freezes cleanly.

Cross-cutting note on ownership: items that **correct the glossary to match already-settled code/rulings** (spyro, rooted's dead reference, the operator cohort) are corrections, not new doctrine, and should be done. Items that **add or reword a definition** (whirling, guay, warping, plain-language state table) are curator-owned editorial — recommended wording is provided, but the ruling/voice is the curator's to ratify.

---

## A. Must fix before freeze

### A1. `spyro` contradicts the settled dictionary
- **Issue:** The glossary's Community Vocabulary table calls spyro *"a distinct gyro move … (its own dictionary entry; not a synonym for inspin)"*, but the authoritative code classifies it as a **modifier-only folk rotational descriptor, kept out of the trick-browse views**.
- **Section:** Community Vocabulary, `glossary.hbs:2066`; contradicts `freestyleTrickKindOverrides.ts:72-90` (spyro in `MODIFIER_SLUGS`) and `freestyleFamilyOverrides.ts:180`.
- **Audience:** Expert.
- **Fix:** Rewrite the cell to describe spyro as a modifier-only, spinning-class folk descriptor (`category='body'`, +1), explicitly **not** "its own dictionary entry," keeping the "not a synonym for inspin" disambiguation. Also re-check the "dexing foot plants before the dex" mechanism phrasing — it reads as pre-correction wording.
- **Rationale:** This is the one outright contradiction in the audited set. The task context lists "spyro corrected" as a stabilization milestone; the public glossary still states the *old* meaning. An expert citing it would be wrong.

### A2. No source-authority hierarchy is stated
- **Issue:** The glossary repeatedly publishes "the structural value" over an external corpus but never says **why** the IFPA grammar outranks an external catalogue, nor how footbag.org / PassBack / FootbagMoves / Stanford shorthand / AnzTrikz rank when they conflict. The reader cannot predict how a *new* disagreement resolves.
- **Section:** Sources (`2099-2124`); divergence asserts outcomes without the rule (`1979-2002`).
- **Audience:** Both.
- **Fix:** Add a short ordering paragraph at the head of Sources, e.g.: *"These sources are not equal authorities. When they conflict, the platform resolves in order: (1) a curator ruling, (2) the IFPA structural grammar (the additive ADD system and operator weights), (3) community usage for the displayed name, then (4) an external catalogue's recorded number. An external source is strong evidence a trick exists and is performed; it is not authoritative over how it decomposes or its structural ADD."*
- **Rationale:** Priority 4's core ask is that an expert understand the *reasoning*, not just the answer. The divergence section demonstrates one resolution; the general rule is never given. Largest authority gap.

### A3. Emerging-vocabulary states are explained only in governance jargon
- **Issue:** The canonical / tracked / observational / under-review distinction — Priority 5's central concern — is stated in five governance terms in two sentences ("tracked," "observational," "unresolved," "promoted," "after a ruling") and never connected to *what the user sees on a page* or *why* a name sits in each state. The "under review" pill (defined at `1948`) is never tied to the "unresolved" wording at `1971`.
- **Section:** Tracking is not canonization (`1966-1976`); Pending definition (`1948`).
- **Audience:** Beginner.
- **Fix:** Precede the doctrine sentence with a plain-language state table:

  | State | In plain words | What you see | Why it's here |
  |---|---|---|---|
  | Canonical | A settled trick the community agrees on | Normal name, no badge | Name + structure both resolved |
  | Tracked | A name people really say, written down but not yet ruled on | Listed, flagged not-yet-canonical | We want a complete record before settling it |
  | Observational | A "feels-similar" grouping/reading offered as a hint | *observational* badge | Helps you see connections; not an official ruling |
  | Under review | A structure we suspect but haven't confirmed | "decomposition under review" pill | The trick is real; how it breaks down is still open |

  Anchor "tracked" with a real example already public: *"'Big Applesauce' and 'Alpine Big Apple' are tracked names — variants we've seen for moves around gyro-symposium-torque; recording a name isn't ruling it's a separate settled trick."* Keep the doctrine sentence as the summary beneath.
- **Rationale:** Priority 5 calls this "one of the most confusing surfaces." A casual user currently cannot tell the states apart or why a name is in one. The states exist and are individually defined — they just need a plain-language map + one example.

### A4. `whirling` modifier has no definition a reader can find
- **Issue:** Whirling carries an ADD weight (`+1/+1`, `glossary.hbs:1221`), drives compositions ("blender ≡ whirling osis"), and sits in the movement-system axes — but there is **no standalone definition entry**; its meaning is scattered across three modules with slightly different framings, and a beginner reading the rendered prose finds none of them. Every sibling modifier (paradox, spinning, ducking, symposium) gets a feel-card; whirling does not.
- **Section:** Modifier weights `1221`; movement systems `freestyleMovementSystems.ts:71-73`; family card `freestyleGlossaryFamilyCards.ts:250`.
- **Audience:** Both.
- **Fix (curator-owned wording):** Add one body-modifier reference entry consolidating the three framings — a rotational midtime-body modifier (+1), the "distinct beat" relative to spinning (360°)/gyro (180°), contributing the back-spin/cross-body sweep (blender ≡ whirling osis). Cross-reference from the scattered uses.
- **Rationale:** A genuine comprehension dead-end on a compositionally load-bearing term, and a trust gap for the expert who must assemble it from three places.

### A5. The dictionary key uses ADD / dex / JOB before defining them
- **Issue:** Priority 1's explicit bar is "open the dictionary right after and understand it." But the trick-row contract (`74-86`) labels line 2 *"JOB operational notation · ADD difficulty accounting"* with no gloss; "JOB" (a surname, looks like an initialism) is expanded ~700 lines later (`809`); ADD is defined ~960 lines later (§10). A strict top-down reader cannot parse the first concrete artifact on the page.
- **Section:** Reading the dictionary → The trick row (`74-86`); intro card (`28-57`).
- **Audience:** Beginner.
- **Fix:** Add one-clause inline glosses + forward-links on first mention: ADD → "(the additive difficulty score, defined under ADD Accounting)"; JOB → "(the compact operational grammar, defined under Notation)". Add a half-sentence to the intro lede telling the reader surfaces/dexes/families/modifiers/notation are all defined below in order.
- **Rationale:** This is the glossary's most important section by the task's own framing; the "each section builds on the one before" promise (`32`) is broken at the very first artifact. Fix is additive glossing, not restructuring.

### A6. The rooted / sailing / railing / shooting operator cohort is half-surfaced with a dead reference
- **Issue:** (a) The `(rooted)` pre-state flag says it "corresponds to the rooted set primitive **in the modifier table**" (`1141-1142`) — but **no glossary table lists rooted** (the only modifier table, `1213-1229`, omits it). Dead cross-reference. (b) The divergence section claims railing is *"rooted plus sailing, structurally 2"* (`1993`) but neither rooted nor sailing carries an ADD definition on the page, so the arithmetic is unverifiable. (c) `shooting` — a cohort-partner clarified in code (`freestyleTrickKindOverrides.ts:105`) — has **zero** glossary presence, while rooted and sailing get partial mentions.
- **Section:** `1141-1142`, `1993`; cohort in `freestyleTrickKindOverrides.ts:96-106`, `freestyleFamilyOverrides.ts:182-184`.
- **Audience:** Expert.
- **Fix:** Either (preferred) repoint the cross-references to the Set notation reference (`/freestyle/sets/reference`, already linked at `1156`) and surface the whole cohort there consistently, or add a small set-primitive table to the glossary listing rooted / sailing / shooting / railing with their structural values. Whichever — surface all four or defer all four; do not half-mention.
- **Rationale:** The task context lists "railing / rooted / sailing / shooting clarified" as a milestone. An expert currently hits a dead "modifier table" reference and a load-bearing arithmetic claim they cannot validate in-document.

---

## B. Strongly recommended

- **B1. Beginner forward-glosses for modifier/operator proper nouns used before §8.** Surfaces (`333`), Families (`531-534`), and Dexterities (`379`) lean on paradox/symposium/spinning/ducking and pixie/quantum/atomic/fairy as load-bearing examples while those are defined only in the Intermediate Modifiers section. Add one-clause glosses + forward-links at first use (or drop the four set-primitive names at `379`, which the in/out point doesn't need). *Beginner.*
- **B2. Name the evidence-weighing principle ("the cohort test").** The clearest articulation of *how evidence is weighed* — "a single trick could be an error; an entire cohort moving together is a convention" (`1996-2002`) — is buried as one example's moral. Promote it to a named, reusable rule the discrepancy panel (`1296`) and tracking section (`1966`) can both point to. *Expert.*
- **B3. Surface the publication contract in summary.** The six-requirement promotion gate is never shown; the reader learns tricks are "promoted after a ruling" (`1974`) but not against what bar. Add a compact list beside Tracking-is-not-canonization, including the key doctrine "a settled number is never enough — a trick whose ADD is settled but whose structure is contested is held, not published." *Expert.*
- **B4. Cover "not unique / duplicate" collapse.** Aliases are explained for historical renames (`1480-1497`) but not for the actual emerging-vocab pain point: two folk names that turn out to be the same move. Add one sentence reusing the structure-not-strings rule (`1634-1637`): when two names decompose identically, one becomes displayed and the other an alias. *Beginner.*
- **B5. Cross-link the two facets of Big Apple Sauce.** The number-divergence treatment (`1981-1985`) and the naming-collision treatment (alpine-big-apple, `1624-1650`) sit ~340 lines apart, uncross-linked. One half-sentence connects them. *Expert.*
- **B6. `guay` and `warping` are absent — decide add-or-keep-out.** Both are listed as settled clarifications (guay = pickup → inside-stall; warping clarified) yet appear nowhere in the glossary or content modules. An expert would conclude they don't exist. Either add reference rows (the decompositions are expressible from existing surface/atom entries) or record an explicit "dictionary-only, intentionally not public" decision so the omission is a choice, not an oversight. *Expert.*
- **B7. Give `rake` and `pendulum` anchored entries.** Rake's definition is current and accurate ("swing then toe … the reverse of pendulum," `856-861`) but exists only as inline prose with no `id=` anchor, so it can't be cited or linked like other terms. Add `<dt>` anchors for the rake/pendulum pair. *Expert.*
- **B8. "Topology" → "Movement Neighborhoods" label consistency.** Line `108` teaches the public name "Movement Neighborhoods," but the h2 at `1750` ("Family & Topology Concepts") and prose at `532/1356/1834` revert to "topology," forcing the reader to re-learn one concept under a jargon name. Rename the heading + prose; reserve raw "topology" for the `?view=topology` URL. *Both.*
- **B9. Simplify pipeline-jargon leaks in beginner prose.** "canonical-active" (`296`, `315` → "the standard name"), "canonical taxonomy" (`108` → "an official grouping"), "settled doctrine" (`92` → "not always final"), "canonical row" (`628` → "dictionary entry"). These are DB/pipeline phrasings in Beginner-tier sections. *Beginner.*
- **B10. Two identical "How to read this glossary" headings.** One at `28` (beginner intro), one at `1934` (publication-state layers, inside Advanced Reference). Rename the second to "How to read the claim layers." *Both.*
- **B11. Order observational sections after "observational" is defined.** Sections 13 (`1749`) and 14 (`1815`) carry an `observational` badge whose meaning is defined later at `1940`. Move them after the Advanced-Reference publication-states block so the definition precedes its use. *Expert.*
- **B12. Badge "Movement Basics."** The first content section (`161`) has no tier badge while every neighbor does, breaking the beginner→advanced visual scan the page relies on. Add the Beginner badge. *Beginner.*
- **B13. Fix the mis-targeted "core atoms" anchor.** "the twelve core atoms" (`340`) links to `#primitives-and-compounds` (`1871`, deep in Composition) instead of `#core-trick-atoms` (`194`, the twelve cards). Concrete broken-navigation fix. *Both.*

---

## C. Optional improvements

- **C1.** Expand or delete the unexplained acronym **"ATAM"** in the ADD definition (`1171`); the bracket-flags it refers to are already named at `1085-1097`. Also `[UNS]` is cited (`1173`) but missing from that flag list. *Both.*
- **C2.** De-circularize Implied-contacts wording: "clipper means a clipper stall (which is why the dictionary reads a bare surface as a stall…)" (`329`) explains the rule with the rule. *Beginner.*
- **C3.** Ground **X-Dex** with a physical cue + link to clipper's cross-body definition rather than the circular "performed in a crossed-body position" (`375`). *Beginner.*
- **C4.** Use already-seen atoms for the first **dex-count example** (`357-360`) instead of the unintroduced "Double Around the World." *Beginner.*
- **C5.** Plain-words rewrite of "Curator-confirm-pending; not yet ratified" (`1948`) and the curation-status report at `1950-1958` ("the settled/pending boundary is now well-defined … ratified … the pending set is small") — useful info, but framed as maintainer bookkeeping in a beginner section; also edges toward dated/change-history phrasing. *Beginner/Expert.*
- **C6.** Gloss or relocate unglossed **"topology"** inside data tables (`1195`, `1834`). *Expert.*
- **C7.** Flag rare slang **"The" (thuh)** (`406-407`) as rare so beginners don't read it as core vocabulary. *Beginner.*
- **C8.** Move "What a video can and can't tell you" (`2006`) adjacent to Tracking-is-not-canonization (both are evidence-vs-canonization), leaving Community Vocabulary + Historical Terms + Sources as a clean terminal reference cluster. *Expert.*
- **C9.** Confirm whether **`floating`** is a real term in this ontology (zero presence in code/content) — keep-out if not. *Expert.*
- **C10.** Consolidate the three scattered **whirling** framings into one canonical gloss once A4 is done. *Expert.*

A confirmed non-issue: `governance`, `reconciliation`, `intake`, and `frontier` appear **nowhere** in rendered prose — those internal terms are clean. And per the no-individual-names rule, the glossary correctly routes all authority language through "curator"; the Sources gratitude list is the one sanctioned place names appear. Do not "fix" either into a problem.

---

## Cross-cutting patterns

1. **Forward-dependency without forward-glossing** (A5, B1, B13, C3, C4). The "each section builds on the one before" promise is broken in practice: Beginner-tier sections lean on Intermediate-tier vocabulary (ADD, JOB, paradox, symposium, pixie, quantum). The fix is almost always a one-clause inline gloss + forward-link, never a rewrite or reorder.
2. **Glossary-vs-code drift** (A1 spyro, A6 rooted/cohort, A4 whirling, B6 guay/warping). The dictionary code has moved (spyro, rooted/sailing/railing/shooting, ATW/clipper) but the public glossary still carries pre-clarification wording or omissions. A freeze must reconcile the public surface to the settled code.
3. **Conclusions stated, reasoning withheld** (A2, B2, B3). The glossary tells the reader *what* the platform decided far better than *why* and *how it would decide the next case*. The authority layer needs the general rules (source hierarchy, cohort test, publication gate) made explicit, not just demonstrated.
4. **Governance vocabulary in user-facing prose** (A3, B9, C5). The states and rules are correct but worded for maintainers; plain-language equivalents exist and lose no rigor.

---

## Final verdict

> *Can this glossary credibly serve as the authoritative public reference for freestyle terminology, movement grammar, and dictionary interpretation?*

**Not yet — but it is close, and clearing the A-list gets it there.**

Justification: the glossary already has the *substance* of an authoritative reference — a complete atom registry, a rigorous and worked ADD-accounting system, a real compositional grammar (Job's notation), honest uncertainty handling, and divergence case studies that model the reasoning. What currently disqualifies it from being *cited* is not depth but six fixable defects: a **factual contradiction** an expert would repeat (spyro, A1), a **missing source hierarchy** so the reasoning can't be generalized (A2), **emerging-vocabulary states** a casual user can't decode (A3), a **load-bearing term with no findable definition** (whirling, A4), **forward-dependency** that defeats the dictionary key for a newcomer (A5), and an **operator cohort with a dead reference and unverifiable arithmetic** (A6). None requires new ontology or a promotion sprint; five are corrections-to-match-settled-code or additive glosses, and one (A3) is a presentation rewrite. With the A-list cleared, the glossary meets both bars simultaneously — a newcomer can learn from it and an expert can cite it — and is safe to freeze. The B-list raises it from "citable" to "polished"; the C-list is housekeeping.

Sequence to freeze: **A1, A6** (reconcile to code — corrections, do now) → **A4, A2, A3** (curator-owned wording — draft provided, curator ratifies) → **A5, B1** (forward-glosses) → re-read top-to-bottom once → freeze.
