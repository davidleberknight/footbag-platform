# Freestyle Encyclopedia — First-Visit Hesitation Log

Read-only usability/authority passes over live-rendered freestyle pages. This is the Phase A
usability specification.

**Rendering method:** real rendered HTML. A dev server was already running on `localhost:3000`
(a fresh launch hit `EADDRINUSE`; `curl` returned 200 for every route), so each page was fetched
live with `curl` and converted to readable text. All findings are from the actual rendered
output of `database/footbag.db`, not from templates. The expert pass cross-checks page claims
against the doctrine of record in `freestyle/doctrine/`.

---

# PASS 1 — Intermediate freestyler ("help me go deeper")

**Persona:** an advancing intermediate. I can do mirage, legover, butterfly, roughly a whirl.
I know stall/set/dexterity. I want structure, family relationships, what a move is, and where
to go next. Basic vocabulary is NOT flagged here; failure to *deepen* understanding is.

## The intermediate experience in three sentences
For a reader who already kicks, the deep pages are genuinely excellent — osis, whirl,
whirling-swirl, and paradox each explain *what the move is, why it matters, and how it's built*,
with strong onward links. But the on-ramp betrays the depth: the landing's "12 Foundations" grid
drops me into a silent video viewer that never links to the trick page that would teach me, and
a few structurally central destinations (the whole **Down** family, the **swirling-whirl** twin)
give me only a notation formula with no words describing the motion. Fix the connective tissue
and the sparse-page gaps and this becomes a reference an improving player would live in.

### `/` — Site landing
| # | Hesitation | Severity | Fix | Feeds |
|---|---|---|---|---|
| I1 | "Big Add Posse — invite-only posse of top *shredders*": no hint what earns you in, term unlinked. | cosmetic | One clause, or link the term. | A4 |
| I2 | "Tutorials — *Coming soon*" dead card beside live sections. | slows | Hide until it has a destination. | A4 |

### `/freestyle` — Freestyle landing
| # | Hesitation | Severity | Fix | Feeds |
|---|---|---|---|---|
| I3 | **The "12 Foundations" cards link to a media video, not the trick page.** I clicked Osis and landed on a bare clip with prev/next and hashtags, *no link to `/freestyle/tricks/osis`* where the explanation lives. The most inviting learning path is severed from the content. | blocks-understanding | Point each foundation card at its trick/family page, or link the media-card heading to the trick. | A3 |
| I4 | The History block shows three "*Coming soon*" cards (Timeline, Milestones, Evolution of Vocabulary) though `/freestyle/history` already delivers eras, a difficulty timeline, and a combo-evolution narrative. | slows | Link the three cards into the anchors that already exist on the history page, or drop the trio. | A2 |
| I5 | "Set Encyclopedia — the named *uptime* sets…": "uptime" used before defined, unlinked. | cosmetic | Link to glossary, or say "sets a trick launches from". | A4 |
| I6 | "Family endings" counts (Mirage 69 / Whirl 74 / Osis 84) differ from the dictionary's "By family" counts (Mirage 97 / Whirl 100 / Osis 55) with no note that one is *terminal* and one is *base* family. I briefly distrusted the data. | slows | Label "ends in this family" vs "built on this base". | A4 |

### `/freestyle/tricks` — Trick Dictionary index
| # | Hesitation | Severity | Fix | Feeds |
|---|---|---|---|---|
| I7 | Seven overlapping browse axes (ADD, dex-count, family, modifier, movement-system, topology, neighborhoods). I can't tell which lens is for a player vs a cataloguer — "Movement Neighborhoods" vs "By family" ("Compare to By family for the official grouping") especially. | slows | A one-line "which view when" hint per axis, aimed at a player. | A3 |

### `/freestyle/tricks/osis`
Model page: tells me *why* osis matters ("one of the most generative bases"; "spawns torque and
blender"), how to set it, technique/learning notes, where it lands.
| # | Hesitation | Severity | Fix | Feeds |
|---|---|---|---|---|
| I8 | **Real content typos in the About prose:** "paradox torque and *mobiuson* the torque side" and "making the *osisone* of the most generative bases" — two missing spaces. Confirmed in raw HTML. In the paragraph that sells the trick. | cosmetic | Add the two missing spaces in source. | A4 |
| I9 | Hero reads **"Osis (ss)"** — no tooltip/link/expansion. I know sets and dexes but not the same-side/opposite-side shorthand; it appears on many titles. | slows | Expand to "same-side" or link the badge to the glossary term. (See also expert finding E1 — the side itself is doctrinally unresolved for osis.) | A1/A3 |

### `/freestyle/families/down`
| # | Hesitation | Severity | Fix | Feeds |
|---|---|---|---|---|
| I10 | **I clicked Down to learn what a "down" physically is, and no page tells me.** The Overview is boilerplate plus a notation formula (`TOE > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]`); the "Glossary Family Card" link goes to `#term-down`, the *same* notation card. Unlike whirl/osis/barfly the "Down" anchor is **not a real trick** (`/freestyle/tricks/down` 404s), so nowhere on the site describes the down motion in words. | blocks-understanding | Give the Down Overview (and glossary card) a plain-language physical description, as whirl/osis *trick* pages have. Applies to any family whose anchor is not a materialized trick. | A1 |
| I11 | "Family anchor: **Down** 4 ADD" renders as plain text that looks clickable (sibling families render the anchor as a link). I clicked; nothing. | slows | Make it a link, or mark "no page yet". | A3 |

### `/freestyle/tricks/swirling_whirl` vs `/freestyle/tricks/whirling_swirl` — mirror twins
| # | Hesitation | Severity | Fix | Feeds |
|---|---|---|---|---|
| I12 | **swirling-whirl has no "About this trick" description at all** — only an auto "How it's built" (Whirl + swirling) and boilerplate. Its twin **whirling-swirl** has a full physical walk-through. I can visualize one and not the other, for a symmetric pair. | blocks-understanding | Author a physical description for swirling-whirl (and sweep for other auto-only tricks); at minimum borrow the twin's with the dex order swapped. | A1 |
| I13 | swirling-whirl shows "No tutorials yet" / "No records yet" with no onward nudge — a true leaf. | cosmetic | Offer "explore the Whirl family" / "compare with whirling-swirl". | A3 |

### `/freestyle/glossary`, `/freestyle/operators`, `/freestyle/modifier/paradox`, `/freestyle/history`, `/freestyle/observational`, `/freestyle/add-analysis`, `/freestyle/sets`
Strengths, not hesitations: notation tokens (`[XBD]`, `[DEL]`, `[DEX]`, `OP`, `SAME`) are all
actually defined in the glossary; the paradox teaching page ("What it is / Why it exists / How
it changes the base / notation / where it appears / how it composes / worked progression") is a
model; history reads well; ADD-Analysis and Set Encyclopedia orient a deepening player.
| # | Hesitation | Severity | Fix | Feeds |
|---|---|---|---|---|
| I14 | A trick page labels **"whirling"** a *Modifier* and links `/freestyle/modifier/whirling`, which **301-redirects to `/freestyle/sets/whirling`**. Same thing is a "modifier" then a "set"; the silent redirect blurs the categories. | slows | Label whirling consistently, or have the modifier page say "whirling is a launch set, so this opens the Set Encyclopedia". | A3 |

---

# PASS 2 — Novice / accessibility ("can I understand this? do I want to keep reading?")

**Persona:** just discovered freestyle, cannot do tricks. Here basic terms DO count.
Strengths worth protecting: the `/freestyle` intro paragraph, the tricks-index "New to
freestyle? Start here" primer, the glossary "How to read this glossary" tiering, and the whole
history page are all genuinely beginner-friendly — do not lose them.

| # | Page | Hesitation (beginner voice) | Severity | Fix | Feeds |
|---|---|---|---|---|---|
| N1 | `/freestyle` | The intro is great, but "By the Numbers" then hits me with a wall of undefined words — symposium, paradox, pixie, atomic, quantum, nuclear, blurry, furious, gyro, miraging, barraging — as bare labels with counts. It reads as "this sport is impossibly technical" right after telling me it's approachable. | slows | One-word gloss or hover on each operator name; or move this block below the friendlier sections. | A1/A2 |
| N2 | trick pages (osis, whirling_swirl…) | The page leads with **Movement notation / Execution notation / ADD** (`SET > SPIN [BOD] > OP CLIP [XBD] [DEL]`, `spin(1)+xbod(1)+stall(1)`) *before* the plain-English "About / Movement intuition". I hit a block of symbols first and want to leave. | blocks-understanding | Lead with the plain About/intuition; demote notation below it or behind a "Deep dive" toggle. | A1 |
| N3 | `/freestyle/families/down` | I can't picture what a "down" is at all — the page is a formula and a member list. | blocks-understanding | Same fix as I10: a plain physical description. | A1 |
| N4 | `/freestyle/tricks/swirling_whirl` | Nothing to read — the page tells me nothing about the move. | blocks-understanding | Same fix as I12. | A1 |
| N5 | `/freestyle` foundations grid | I clicked a foundation to learn it; I got a silent video with no caption and no "what this is / read more" — I don't even know what I watched. | slows | Caption each foundation clip and link it to the trick page. | A3 |
| N6 | `/freestyle/tricks` | The "Start here" primer is excellent, then I face seven ways to browse with no "if you're new, click this one first". Decision paralysis. | slows | Add a single "New here? Start with By family" nudge. | A3 |
| N7 | trick titles | "(ss)" after a trick name means nothing to me and isn't explained. | cosmetic | Expand/link it (see I9/E1). | A4 |
| N8 | `/` landing | "Big Add Posse… shredders" — friendly slang but I don't know what it is. Minor; the rest of the landing is clear. | cosmetic | One clause of context. | A4 |

Novice strengths (PASS, no action): `/freestyle` opening paragraph; tricks "New to freestyle?
Start here" (defines ADD/Dex/Family/Modifier in plain words with a build-up example); glossary
"How to read this glossary" ("start at the top; each section builds on the one before"; "a first
read does not need [reference/history]"); the entire history narrative.

---

# PASS 3 — Expert / authority ("can I trust this?")

**Persona:** a curator/historian. This is a fact-check against the doctrine of record
(`freestyle/doctrine/README.md`, `RED_RULINGS.md`, `DOWN_FAMILY.md`, `POSITIONAL_IDENTITY.md`,
`OPERATOR_DERIVATIONS.md`, `MIRROR_RULE.md`, `RED_QUEUE.md`). Source-priority per README:
Red Husted rulings > curated dictionary > footbag.org > scraped. Severity = does-it-mislead.

| # | Page | Finding vs doctrine | Verdict | Fix |
|---|---|---|---|---|
| E1 | `/freestyle/tricks/osis` | **The page asserts a same-side terminal that its own notation and the doctrine of record both contradict.** Hero badge: "Osis **(ss)**"; the Osis-family block: "Conserved terminal mechanic: **spin > ss clipper**" (same-side). But the page's own **Execution notation reads `SET > SPIN [BOD] > OP CLIP [XBD] [DEL]`** — the terminal clipper is marked **OP** (opposite-side). And `POSITIONAL_IDENTITY.md` (Atom-level foundations) lists **osis as an OPEN atom**: "two compounding ambiguities (back-or-front spin plus an ambiguous SAME/OP catch) mean polarity cannot fix the side; osis needs a ruling tying spin direction to catch side before any `*-osis` side qualifier resolves." So the page (a) contradicts itself OP vs ss and (b) presents as settled a polarity the rules expert has not ruled. A reader-only pass would never catch this. | **FAIL — misleads** | Reconcile the side: either show OP consistently (matching the notation) or drop the "(ss)" / "ss clipper" assertion and mark osis's catch side as unresolved, per doctrine. Do not present both. |
| E2 | `/freestyle/tricks/osis` | "The osis spawns two major named sub-families: torque (miraging osis) and blender (whirling osis)… one of the most generative bases in the advanced trick vocabulary"; ADD `spin(1)+xbod(1)+stall(1)=3`. Matches the core-atom registry and `RED_RULINGS.md`. | PASS | (Typos only — see I8.) |
| E3 | `/freestyle/families/down` | Correctly states the one-family ruling in Red's own terms ("one core movement performed from different sets and from different feet") — **not** as a mere observational note — and renders **all four ruled cells**: Barfly 15, Double-Over-Down 17, Paradon 8, Down-Double-Down 5 (= 45), exactly the 2x2 grid in `DOWN_FAMILY.md`. "DOD" folds into Double-Over-Down; no fifth identity is invented. | PASS | Minor: a single "Canonical formula" (a TOE-set form) heads a family the doctrine defines as four distinct set/foot bases; could imply one decomposition. Consider labeling it the anchor's form. |
| E4 | `whirling_swirl` / `swirling_whirl` | whirling_swirl describes whirling as a launch set performed *before* the swirl, consistent with the operator reference. No simultaneity/ordering error. swirling_whirl has no prose to fact-check — the defect is absence (I12/N4), not inaccuracy. Family assignment correct: whirling_swirl → Swirl family; swirling_whirl → Whirl family. | PASS | — |
| E5 | `/freestyle` "By the Numbers" | The landing "Family endings" counts and the dictionary "By family" counts are **two legitimately different metrics** — terminal family vs base family. **Correct data, not an inconsistency.** Labels are not sharp enough for even a careful reader to be sure they aren't contradictory. | PASS (data) / misleads (labels) | Clarity fix, not a data fix — see I6. |
| E6 | `/freestyle/observational` | "Emerging Vocabulary… nothing here is an official trick yet"; counts honestly frame the waiting room, matching the governance principle. No overclaiming. | PASS | — |

**Authority bottom line:** one real, reader-invisible defect (E1: osis states an unresolved
polarity as settled and contradicts its own notation). Everything else the passes flagged is a
readability/connectivity problem, not a trust problem — and notably the Down family page, which
*fails* both readers, is doctrinally *correct*.

---

# Three-persona synthesis

| Page | Novice | Intermediate | Expert |
|---|---|---|---|
| `/` landing | PASS (BAP slang minor) | PASS (BAP/Tutorials minor) | PASS |
| `/freestyle` | FRICTION — "By the Numbers" jargon wall | FRICTION — foundations link + coming-soons | FRICTION — two counts under-labeled (data ok) |
| `/freestyle/tricks` | FRICTION — 7-axis paralysis after a great primer | FRICTION — which lens deepens? | PASS |
| `/freestyle/tricks/osis` | FRICTION — notation before plain text | PASS (strong; typos aside) | **FAIL — ss/OP contradiction on an open atom** |
| `/freestyle/families/down` | **FAIL — can't picture a down** | **FAIL — no plain "what is a down"** | PASS — ruling stated correctly, all 4 cells |
| `whirling_swirl` | FRICTION — dense but present | PASS — good prose | PASS |
| `swirling_whirl` | **FAIL — empty** | **FAIL — empty** | PASS (n/a — nothing asserted) |
| `/freestyle/glossary` | PASS (strength) | PASS | PASS |
| `/freestyle/operators` | PASS | PASS (strength) | PASS |
| `/freestyle/modifier/paradox` | PASS | PASS (model page) | PASS |
| `/freestyle/history` | PASS (strength) | PASS | PASS (archival slot empty, honest) |

**The gaps that are the whole point (pass one persona, fail another):**
- **osis** reads beautifully for both readers but **fails the fact-check** — the polish hides a
  doctrinal contradiction (E1). Most dangerous kind of page: trusted because it's well-written.
- **Down family** is **doctrinally correct** yet **fails both readers** — accurate and unreadable.
  Correctness and comprehensibility are independent here.
- **swirling_whirl** has nothing wrong to fact-check because it has nothing to read.

## Merged, ranked top fixes (supersedes the intermediate-only top-ten)

1. **Reconcile the osis polarity** — the page asserts "(ss)" / "ss clipper" while its own notation
   shows `OP CLIP`, on an atom the doctrine of record leaves open. Fix the contradiction or stop
   asserting a settled side. *(Expert; A1; authority-critical, reader-invisible)*
2. **Give the Down family a plain-language description of what a down physically is** (Overview +
   glossary card). Doctrinally right, humanly unreadable. *(Novice + Intermediate; A1)*
3. **Author the missing About prose for swirling_whirl and other auto-only tricks;** mirror the twin.
   *(Novice + Intermediate; A1)*
4. **Point the "12 Foundations" cards at trick/family pages** (and caption + cross-link the clips)
   so the on-ramp reaches the content that teaches. *(Novice + Intermediate; A3)*
5. **On trick pages, lead with the plain About/intuition and demote the notation blocks** below it
   or behind a "Deep dive" toggle, so a newcomer isn't hit with symbols first. *(Novice; A1)*
6. **Resolve the landing's three "Coming soon" history cards** against the already-rich history page.
   *(Novice + Intermediate; A2)*
7. **Clarify the two family-count metrics** (terminal "ends in" vs base "builds on") — data is
   correct, labels aren't; both readers distrust the mismatch. *(Intermediate + Expert; A4)*
8. **Explain/link the "(ss)" positional badge** on trick titles; readers can't decode it, and on
   osis specifically the side is itself unruled (ties to fix 1). *(All; A1/A3)*
9. **Gloss the operator names in the landing "By the Numbers" wall** so the "approachable" promise
   survives the scroll. *(Novice; A1/A2)*
10. **Add a "New here? start with By family" nudge** on the tricks index, and give leaf tricks a
    fallback "explore the family" next click. *(Novice + Intermediate; A3)*
11. **Fix the osis About typos** "mobiuson" / "osisone". *(Intermediate; A4)*
12. **Make the "Down" family anchor a real link or clearly non-clickable; disambiguate
    modifier-vs-set for "whirling"** (silent `/sets` redirect). *(Intermediate; A3)*

---

*Note (2026-07-03): a fourth review lens — the Editor / engagement persona ("is this page worth
reading? is it a good encyclopedia article?") — was added to the acceptance standard after this
reconnaissance ran; see `exploration/v1-completion-audit-2026-07-03/MASTER_ROADMAP.md` section 2a.
It is applied as each A1 page is written, not retrofitted onto this log.*

*Artifact:* `exploration/v1-usability-firstvisit-2026-07-03/HESITATION_LOG.md`
