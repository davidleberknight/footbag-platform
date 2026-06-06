# Glossary Freeze Completion — Implementation Plan

**Phase G2.** Turns `GLOSSARY_FREEZE_AUDIT.md` into a concrete, drafted, freeze-ready plan. Drafting deliverable: proposed wording is shown but **not implemented**. Governing constraint: **clarification, cross-linking, hierarchy/authority explanation — not new ontology, doctrine, or systems. The glossary should become clearer, not larger.**

Two structural principles drive the resolutions below:
- **One authoritative home per concept.** Glossary owns *interpretation* (how to read the dictionary, what the layers mean) and *modifiers*. The **Set Encyclopedia** (`/freestyle/sets`, `/sets/reference`) owns *set operators*. The **dictionary** (trick pages) owns *individual tricks*. The glossary cross-links to the other two rather than re-defining their contents.
- **Correct-to-settled-code is not expansion.** Aligning the public glossary to rulings already in the dictionary/code (spyro, the operator cohort) is a correction, always in scope.

---

## Task 1 — Audit the audit (classification of every A and B finding)

| Finding | Verdict | Note |
|---|---|---|
| **A1** spyro contradiction | **IMPLEMENT** | Correction to settled code. No ruling needed; the dictionary already settled it. |
| **A2** source hierarchy missing | **IMPLEMENT** | Drafted in §"Authority-layer additions" → Task 2. |
| **A3** emerging-vocab states in jargon | **IMPLEMENT** | The *state table* is in scope (clarification). The broader emerging-vocab *redesign* is explicitly deferred. Drafted → Task 3. |
| **A4** whirling undefined | **IMPLEMENT (glossary)** | Whirling is a **modifier** — the glossary's own domain, not a set operator. One reference entry closes a gap; this is not encyclopedia work. (See Task 8 reasoning.) |
| **A5** ADD/JOB used before defined | **IMPLEMENT** | Forward-glosses, Task 7. |
| **A6** rooted/sailing/railing/shooting | **IMPLEMENT WITH MODIFICATION** | Do **not** add a glossary operator table (that is expansion + a second home). Instead: fix the dead "in the modifier table" reference by **cross-linking to the Set Encyclopedia**, and make the railing arithmetic claim link to where the operators are (or will be) defined. Authoritative definitions live in the encyclopedia — see Deferred. |
| **B1** beginner forward-glosses (paradox/pixie/…) | **IMPLEMENT** | Task 7. |
| **B2** name the "cohort test" | **IMPLEMENT** | Drafted → Task 6. |
| **B3** publication-contract summary | **IMPLEMENT** | Drafted → Task 4. |
| **B4** not-unique / duplicate coverage | **IMPLEMENT** | Folded into the Task 3 state table (Alias/Duplicate row) + one alias-section sentence. |
| **B5** Big Apple Sauce two-facet cross-link | **IMPLEMENT** | One cross-link. |
| **B6** guay / warping absent | **IMPLEMENT WITH MODIFICATION** | Decision is per-term (Task 8): guay → a glossary folk-vocab row; warp → dictionary (already there); warping → modifier reference *if* it is a modifier. Each pending one curator confirm; default is add a cross-referencing row, not a full definition. |
| **B7** rake / pendulum anchors | **IMPLEMENT** | Add `id=` anchors to existing prose; no new content. |
| **B8** "topology" → "Movement Neighborhoods" | **IMPLEMENT** | Label consistency; reserve raw "topology" for the URL. |
| **B9** pipeline-jargon leaks in beginner prose | **IMPLEMENT** | "canonical-active", "canonical taxonomy", etc. → plain words. |
| **B10** duplicate "How to read this glossary" headings | **IMPLEMENT** | Rename the second to "How to read the claim layers". |
| **B11** observational sections precede the definition of "observational" | **IMPLEMENT WITH MODIFICATION** | Lightest fix: move the two observational sections (13/14) after the publication-states block, OR add one forward-link; full reorder optional. |
| **B12** "Movement Basics" missing tier badge | **IMPLEMENT** | One class. |
| **B13** mis-targeted "core atoms" anchor | **IMPLEMENT** | One-char href fix. |

**No outright REJECTs.** The only modifications are (a) A6 routed to cross-linking instead of glossary expansion, (b) B6 routed to cross-referencing rows pending curator keep-out decisions, (c) B11 lightened. All three modifications *reduce* scope, consistent with "clearer, not larger."

---

## Immediate corrections (mechanical; no curator ruling required)

These align the public surface to settled code or fix concrete defects. Ship first.

1. **A1 — spyro.** Rewrite the Community Vocabulary cell (`glossary.hbs:2066`) so spyro reads as a modifier-only, spinning-class folk rotational descriptor (`category='body'`, +1), explicitly **not** "its own dictionary entry"; keep "not a synonym for inspin". Drop the stale "dexing foot plants before the dex" mechanism unless curator re-endorses.
2. **A6 / B-refs — rooted cohort cross-link.** At `glossary.hbs:1141-1142` change "the rooted set primitive in the modifier table" → "the rooted set primitive (see the [Set notation reference](/freestyle/sets/reference))". At `1993`, link `sailing`/`rooted` in the "rooted plus sailing, structurally 2" gloss to the same reference. Removes the dead reference without expanding the glossary.
3. **B13 — anchor.** `glossary.hbs:340` `#primitives-and-compounds` → `#core-trick-atoms`.
4. **B12 — badge.** Add the Beginner tier badge to "Movement Basics" (`161`).
5. **B8 — label consistency.** Rename h2 "Family & Topology Concepts" (`1750`) → "Family & Movement-Neighborhood Concepts"; replace "topology" with "movement neighbourhood/neighborhood" in prose at `532`, `1356`, `1834`; keep raw "topology" only in the `?view=topology` URL.
6. **B9 — de-jargon beginner prose.** `296`/`315` "canonical-active" → "the standard name"; `108` "canonical taxonomy" → "an official grouping"; `92` "settled doctrine" → "always final"; `628` "canonical row" → "dictionary entry".
7. **B10 — heading.** Rename the second "How to read this glossary" (`1934`) → "How to read the claim layers".

---

## Authority-layer additions (drafted copy — show, don't implement)

### Task 2 — Source hierarchy (new short subsection, head of "Sources")

> **Where authority comes from.** Footbag terminology comes from many sources, and they don't always agree. When they conflict, the platform resolves in a fixed order:
>
> 1. **A curator ruling.** An explicit decision by the dictionary's maintainers settles the case.
> 2. **The structural grammar.** A trick's difficulty is what its movement composition adds up to — the additive ADD system and its operator weights.
> 3. **Community usage.** What players actually call a move decides its displayed name.
> 4. **External catalogs.** FootbagMoves, PassBack, and older lists are strong evidence that a trick exists and is performed, and a useful cross-check — but they do not override how a trick decomposes or what its structural ADD is.
>
> An external number is **evidence, not authority**. That is why, when FootbagMoves lists Big Apple Sauce at 9 and the structure derives 8, the platform publishes **8** and records the 9 as a noted divergence; and why the Furious and Railing cohorts publish at their structural values even when a catalog scores them differently (see *The cohort test*).

### Task 4 — Publication contract summary (new compact block, beside "Tracking is not canonization")

**Short version (drop-in):**
> **When does a trick get published?** A name becomes a canonical, published trick only when:
> - it can be written in the symbolic notation;
> - its **structure** is reconciled — which operators compose it, which base it lands on — not just its number;
> - it's discoverable across the browse views, with its aliases and folk names governed;
> - nothing about its structure is invented; missing pieces are shown honestly, not guessed.
>
> **A settled difficulty number is never enough on its own.** A trick whose ADD everyone agrees on but whose structure is still contested is *held, not published* — that's the contract working as designed, not a gap.

**Detailed version (reference level, expandable):**
> A canonical trick is a structurally legible symbolic object, not merely a database row. Six requirements gate promotion: **(1) symbolic representation** (the trick renders in the notation, including its base-lineage form); **(2) structural composition** (its operator/base decomposition is reconciled); **(3) discoverability** across the dictionary's browse domains; **(4) alias & equivalence governance** (known folk/PassBack/equivalent names are recorded and resolved); **(5) honest incompleteness** (unknown structure is marked unknown, never filled in); **(6) no fabricated structure** (no invented operator lineage). Arithmetic validity and structural certainty are **independent gates**: a clean ADD never licenses asserting a decomposition the sources don't agree on.

### Task 5 — ADD authority (new subsection in ADD Accounting: "Where do ADD values come from?")

> **Where does the ADD come from?** Every trick shows an ADD — its additive difficulty. That number can come from three places, and they don't always match:
> - **Source-stated ADD** — the number an external catalog (FootbagMoves, PassBack) recorded.
> - **Derived ADD** — the number the platform computes from the trick's structure: each scoring element (dex, cross-body, delay, unusual surface, and the operators) contributes 1, and they sum.
> - **Structural derivation** — for a named compound, the ADD is the sum of its parts (eggbeater = atomic + legover + stall = 3; warp derives to 5 from its composition).
>
> **When the stated and derived numbers disagree, the derived (structural) number is canonical, and the source number is recorded as a divergence.** Two reasons this happens:
> - **Different things are being counted.** PassBack records *dexes*; the platform counts *ADD*. A mirage is 1 dex but **2** ADD (dex + stall); a butterfly is 1 dex but **3** ADD. Neither is wrong — they measure different things.
> - **A catalog convention.** FootbagMoves lists Big Apple Sauce at 9; the structure derives 8. The Furious and Railing cohorts carry catalog values that differ from their structural composition.
>
> Ontology can override a catalog number because **the catalog records what was observed, while the structural ADD states what the move is made of.** See *Where authority comes from* and *The cohort test*.

*Grounding note:* the PassBack dex-vs-ADD cases (mirage 2/1, butterfly 3/1, legover 2/1, illusion 2/1, eggbeater 3/1) are live in `freestyleAddDisagreements.ts`. **`warp` has no divergence entry** in the content modules (it's a 5-ADD dictionary trick) — its use above is as a *structural-derivation* illustration only; if a numeric source divergence for warp is intended, the curator must supply the figure before this copy ships.

### Task 6 — The cohort test (named principle; new subsection in source-divergence)

> **The cohort test.** A single trick whose number differs from its catalog value could just be an error. An entire *cohort* of related tricks diverging the same way is a *convention*. The platform treats them differently:
> - **Single-trick divergence.** One trick's stated number disagrees with its structure → publish the structural value, note the one-off. *Example: Big Apple Sauce — 9 stated, 8 derived, 8 published.*
> - **Cohort divergence.** A whole family diverges together in one direction → that's not a mistake to correct, it's a convention to record → publish the structural value, record the cohort's shared convention as a named divergence. *Examples: the Furious cohort; the Railing cohort.*
>
> The difference is between **cataloguing a number and understanding a grammar.**

---

## Beginner-comprehension improvements

### Task 3 — Emerging-vocabulary state table (drafted; the audit's A3)

Lead the "Tracking is not canonization" subsection with this, then keep the existing doctrine sentence beneath:

> **Not every name is at the same stage.** Here's what each label means, what you'll see, and why it's there:
>
> | State | In plain words | What you see | Why it's here |
> |---|---|---|---|
> | **Canonical** | A settled trick the community agrees on | Normal name, no badge | Its name *and* its structure are both resolved |
> | **Tracked** | A name people really use, written down but not yet ruled on | Listed, flagged not-yet-canonical | We keep a complete record before settling it (e.g. "Big Applesauce", "Alpine Big Apple") |
> | **Under review** | A real trick whose breakdown isn't confirmed | "decomposition under review" pill / *advanced* badge | The move exists; its structure is still open |
> | **Observational** | A "feels-similar" grouping or alternate reading, offered as a hint | *observational* badge | Helps you see connections; it isn't an official ruling |
> | **Alias / duplicate** | A second name for a trick that already has one | Resolves to the main trick | Two names that decompose to the same move — one is displayed, the other kept so either still finds it |
>
> A name becomes **canonical** only by being promoted after a ruling. Writing a name down is not the same as ruling it's a separate, settled trick.

This single table satisfies A3, B4 (the Alias/duplicate row), and the casual-user goal ("understand the pipeline in under a minute") without a redesign.

### Task 7 — Forward-gloss checklist (no implementation)

Sections reviewed: Reading the Dictionary, Movement Basics, Surfaces & Delays, Dexterities, Timing & Sets.

| Term | First appearance | Definition location | Proposed inline gloss (on first use) |
|---|---|---|---|
| ADD | trick row, ~78 | §10 ADD Accounting, ~1162 | "(the additive difficulty score — defined under ADD Accounting)" |
| dex / dexterity | trick row + Movement Basics, ~95/357 | §5 Dexterities, ~348 | "(a dexterity: a controlled circle of the leg around the bag — see Dexterities)" |
| JOB | trick row, ~78 | §9 Notation, ~809 | "(the compact operational grammar — see Notation)"; or drop the bare token here |
| set | Movement Basics / trick row | §6 Timing & Sets, ~456 | "(the toss that starts a trick — see Timing & Sets)" |
| paradox / symposium / spinning / ducking | Families, ~531-534 | §8 Modifiers, ~155-171 | one clause each: "(paradox pivots the hips mid-trick; ducking dips the head; spinning rotates the body; symposium keeps the support leg airborne — all under Modifiers)" |
| pixie / quantum / atomic / fairy | Dexterities, ~379 | §8 Modifiers | "(set primitives — see Modifiers)", or delete the four names (the in/out point stands without them) |
| crossed-body (in X-Dex) | ~375 | clipper card, ~274 | "(the same cross-body position as a clipper)" + link |
| atom ADD number | atom cards, ~210 | §10 | one line in the band lede: "the number on each card is its ADD — higher = more layered; full definition under ADD Accounting" |
| whirling | ADD table ~1221 / movement systems | (undefined) | new modifier entry — see A4 / Task 8 |
| ATAM (acronym) | ADD def, ~1171 | (never) | delete the acronym; the bracket-flags are already named at ~1085 |
| Double Around the World (dex example) | ~358 | unintroduced compound | replace with already-seen ATW atom |

---

## Expert-reference improvements

### Task 8 — One authoritative home per concept

| Term | Kind | Authoritative home | Glossary action | Rationale |
|---|---|---|---|---|
| **whirling** | modifier | **Glossary** (modifier reference) | **Add one entry** (A4) | A body modifier is the glossary's own domain; not a set operator, so not encyclopedia. Dictionary pages cross-link to it. |
| **guay** | folk/alias name (pickup → inside-stall) | **Dictionary** (the decomposition) | **Add a folk-vocab row** cross-linking to the dictionary; or keep-out if curator rules it dictionary-only | Avoids defining the decomposition twice; the glossary row is a pointer, not a second definition. |
| **rake** | trick (reverse of pendulum) | **Dictionary** (trick page) | **Add an `id=` anchor** to existing prose + cross-link | Definition already exists and is current; only needs to be citable/linkable. |
| **warp** | trick (5 ADD) | **Dictionary** (already there) | none, unless used as an ADD example (then cross-link) | Already has its home; glossary need not carry it. |
| **warping** | modifier? (recently clarified) | **Glossary** modifier reference *if* a modifier; else Dictionary | **Curator confirm** what warping is; then one modifier entry or none | Resolve the warp(trick)/warping(modifier) split before adding anything. |
| **rooted / sailing / railing / shooting** | **set operators** | **Set Encyclopedia / operator reference** | **Cross-link only** (A6) | These are `category='set'` operators; the encyclopedia is their home. They are not yet in `freestyleOperatorReference.ts` — documenting them there is set work, not glossary work. The glossary must not become their second home. |

This keeps each concept in exactly one authoritative place and reduces the glossary's footprint for the operator cohort rather than enlarging it.

---

## Items intentionally deferred

- **Emerging-vocabulary redesign** — explicitly out of scope this phase. The Task 3 state *table* ships (clarification); the larger redesign waits.
- **Set-operator documentation** (rooted / sailing / railing / shooting definitions, and possibly `shooting`'s first appearance) — belongs in the **Set Encyclopedia / operator reference**, a separate surface and work item. The glossary freeze only adds the cross-links.
- **warp / warping specifics** — pending one curator confirmation (warping = modifier vs trick; whether warp carries a numeric source divergence). Drafted copy uses warp only as a structural-derivation illustration until then.
- **guay public exposure** — pending curator keep-out decision (it may be intentionally dictionary-only).
- **C-list housekeeping** (ATAM, "The (thuh)" slang flag, unglossed "topology" in data tables, X-Dex cue, video-section placement) — optional; not freeze-blocking.
- **whirling consolidation** of the three scattered framings — do after the A4 entry exists.

---

## Freeze readiness assessment

The plan splits cleanly into three tranches by who must act:

1. **Immediate corrections** (7 items) — mechanical, no ruling needed. These resolve the only *contradiction* (spyro) and the dead operator reference (A6), which were the two genuinely freeze-blocking expert-trust defects.
2. **Authority-layer copy** (Tasks 2/4/5/6) and the **state table** (Task 3) — drafted here, ready to drop in; they need a curator read for voice/accuracy but introduce **no new ontology** (they explain existing rulings and existing structure).
3. **Comprehension glosses** (Task 7) and **anchors/labels** (B7/B8/B10/B12/B13) — additive, low-risk.

Everything that would *enlarge* the glossary (operator definitions, emerging-vocab redesign, warp/guay exposure) is deferred to its proper home. The net effect is a glossary that is **clearer and better cross-linked, not larger.**

### Final question

> *After these changes, can the glossary be frozen as the authoritative reference layer while work shifts to Emerging Vocabulary?*

**Yes — conditionally, and the condition is small.** Once the **Immediate corrections** ship (especially A1 spyro and the A6 cross-link, which remove the contradiction and the dead reference) and the **drafted authority copy + state table** are pasted in after a curator read, the glossary meets both bars: a newcomer can learn from it (forward-glosses + state table + plain-language authority), and an expert can cite it (source hierarchy, publication contract, cohort test, ADD-authority, and every set-operator pointing to its one real home). The only items that remain open are explicitly *not* glossary-layer problems — they're Set-Encyclopedia documentation and the Emerging-Vocabulary redesign that is the next phase's subject. So the glossary can be frozen as the authoritative **interpretation + terminology** layer now, with the understanding that the **set-operator definitions** live (and continue to grow) in the Set Encyclopedia, and emerging-vocabulary refinement proceeds separately against the state table this plan installs as its stable anchor.

**One genuine blocker to flag honestly:** the authority copy and the spyro correction are *factual* statements about how the platform reasons and what spyro is. They should get a curator's eyes before freeze, because freezing wrong authority text is worse than freezing none. With that single review, freeze is go.
