# Coverage Doctrine + ADD +1 Pedagogy — Editorial Refinement — 2026-05-21

A conceptual/editorial refinement slice across three surfaces: ADD
Accounting & Analysis, Trick Dictionary publication doctrine, and
Coverage / missing-tricks explanation. **Not a schema rewrite** —
proposals, critique, and wording direction only. No code changed by
this document.

---

# PART A — ADD: "Many Different Movements, Same +1 Role"

## A.1 What exists today

`src/content/freestyleAddAnalysisContent.ts` already tabulates the +1
contributions — the component-classes table lists "Entry-topology
modifiers — paradox, symposium … +1 each" and "Midtime body modifiers —
spinning, ducking, diving, swirling, stepping, tapping … mostly +1."

**The data is there; the insight is not.** The table presents +1 as a
property scattered across a taxonomy of classes. It never says the
pedagogically important thing out loud: *visually unrelated movements
occupy the same flat accounting slot.* A newcomer reading the table
sees categories, not the unifying rule.

## A.2 Recommended subsection (item 4 — wording direction)

Add one concise subsection immediately **after** the component-classes
table on `/freestyle/add-analysis`. Title:

> **Many Different Movements, Same ADD Role**

Lead with the insight, in plain language:

> A spin, a duck, a dive, a jump, a no-plant symposium entry, a
> paradox cross — these look nothing alike. In the body they feel
> completely different. But in ADD accounting they do the same job:
> each adds a flat **+1**. ADD is modular. You read a trick's name
> left to right and add one for every layer you recognize.

Then the modular-stack point:

> This is why a visually dramatic trick is rarely "one hard thing." It
> is usually a stack of small, individually-simple +1 layers. The
> drama is in the *combination*; the accounting is in the *count*.
> Very different movement types are interchangeable in this sense —
> they occupy equivalent +1 slots in the stack.

Then a contrasting-examples table (the user-requested set):

| Trick | Reads as | ADD |
|---|---|---|
| spinning whirl | whirl (3) + spinning (+1) | 4 |
| ducking butterfly | butterfly (3) + ducking (+1) | 4 |
| diving clipper | clipper-stall (2) + diving (+1) | 3 |
| flying clipper | clipper kick (1) + flying (+1) | 2 |
| symposium mirage | mirage (2) + symposium (+1) | 3 |
| paradox whirl | whirl (3) + paradox (+1) | 4 |

> Six tricks, six completely different-looking movements. Every one is
> just *a base trick plus one +1 layer.* The +1 is the same unit each
> time — what changes is which base it stacks on.

Close with a light, non-doctrinal caveat (one sentence — do NOT open a
debate):

> A few modifiers carry more than +1 (atomic on a rotational base,
> barraging, nuclear) — those are noted in the table above. But the
> default unit of ADD accounting is the flat +1, and most modifiers
> are exactly that.

## A.3 Constraints

- Pure prose addition to the existing content module; no schema, no
  new component class. Reuses the table data already there.
- Keep it short — one subsection, ~3 short paragraphs + one table.
- No doctrine debate, no Wave-2 hedging language. This is newcomer
  pedagogy; the doctrine nuance already lives in the component table's
  per-row notes.

---

# PART B — Coverage / Missing-Tricks Doctrine

## B.1 Critique of current coverage messaging (item 1)

The live coverage summary (`freestyleService.ts`, the
`FreestyleTricksCoverageSummary`) is:

- `canonicalCount`, `externalOnlyCount`, `pendingInternalCount: 0`
- `sourcesLoaded: ['footbag.org']`
- `sourcesUnavailable: ['footbagmoves.com (corpus not yet loaded)']`
- `transparencyNote: 'External-source placeholders are shown for
  transparency and coverage tracking.'`

Problems:

1. **It's stale.** "footbagmoves.com (corpus not yet loaded)" predates
   this session's FB.org master ingest. The FootbagMoves + FB.org +
   PassBack corpora ARE now loaded — into the master spreadsheet
   (854 rows) with a 670-row observational export and a staging
   queue. The messaging describes a state the project has moved past.
2. **It frames the gap as a TODO, not a doctrine.** "corpus not yet
   loaded" reads as "we haven't gotten to it" — exactly the
   amateur/incomplete impression to avoid.
3. **It's one line.** It says placeholders exist "for transparency"
   but never explains *the model* — why 171 published, where the rest
   are, that they are tracked.
4. **It under-claims.** The project has done the hard part (the corpus
   IS catalogued, QC'd, staged). The messaging hides that and so
   invites the worst reading.

The current messaging creates precisely the advanced-user risk the
brief names: "the dictionary is incomplete / coverage is arbitrary /
the project ignored freestyle history."

## B.2 Proposed doctrinal explanation (item 2)

**Doctrine: staged publication.** The published dictionary is the
*canonical/core movement-language layer* — not the exhaustive
published surface. It is the visible tip of a quality-gated pipeline.

Every published trick meets the Canonical Trick Publication Contract
(structural legibility, honest incompleteness, no fabricated
structure). The smaller count is a **consequence of a strict bar**,
not a coverage gap. The rest of the corpus is **known, catalogued, and
tracked** in named states — it is not missing, it is staged.

The five tracked states — these are not aspirational; they describe
the pipeline this project already runs:

| State | What it is | Where it lives now |
|---|---|---|
| **Published Canonical** | Meets the publication contract; live dictionary page | `freestyle_tricks` (171) |
| **Observed / Historical** | Real tricks recorded from footbag.org / FootbagMoves / PassBack; structurally catalogued, not yet promoted | master spreadsheet / observational export (~670) |
| **Under Review** | Flagged for a curator decision | `curator_review_needed=true` (~84) |
| **Alias / Equivalence candidate** | Same trick as a published one under another name, or an equivalence-topology variant; reconciliation pending | divergence register + alias work |
| **Pending Symbolic Resolution** | Decomposition / ADD / parser state incomplete or doctrine-sensitive | hedged + pending rows |

The headline reframe — from a scarcity number to a pipeline:

> **171 published · ~670 tracked across review states · exhaustive
> coverage is the roadmap.**

That single line converts "only 171?" into "171 published, the rest
in a managed queue."

## B.3 Where the explanation should live (item 3)

Two-tier, respecting the landing/reference boundary (preview on
landings; decompose on reference pages):

1. **Dictionary landing — coverage strip:** replace the one-line
   transparency note with a short *preview* — the headline line above,
   plus a link: "How the dictionary grows →". The landing previews and
   invites; it does not host the full essay.

2. **A dedicated "Coverage & Scope" explainer** — the decompose
   target. Either a short standalone reference page or a clearly-
   anchored section on an existing reference surface. It hosts the
   full "Why fewer tricks than other sources?" explanation + the
   five-state table. Cross-link it from the ADD Analysis page and the
   glossary.

Recommended title for the explainer, framed as the question advanced
users are already asking:

> **"Why does this dictionary publish fewer tricks than other
> freestyle sources?"**

Do NOT put the public explanation in
`docs/CANONICAL_TRICK_PUBLICATION_CONTRACT.md` — that is the internal
contract; this is the reader-facing essay. They cross-reference; they
are not the same document.

## B.4 Intellectual honesty without undermining confidence (item 5)

The tone rule, made concrete:

- **Lead with the bar, not the gap.** "Every published trick meets a
  strict structural-legibility standard" — quality framing. The count
  is small *because the bar is high*, and that is a feature.
- **Show the tracked corpus with real numbers.** A reader who sees
  "~670 tracked across named states" sees a managed pipeline. A reader
  who sees only "171" and a vague apology sees an abandoned project.
  Numbers are the honesty *and* the confidence.
- **Never "only these are real."** The Observed/Historical state
  explicitly affirms those tricks are real freestyle vocabulary —
  they are pre-publication, not un-real. Wording: "catalogued and
  tracked, pending publication review" — never "not yet considered."
- **Name the roadmap.** "Exhaustive coverage is the long-term goal"
  states intent without defensiveness.
- **Frame it as the project's strength.** Other sources list 500+
  names; this project is *reconciling* them — resolving aliases,
  settling ADD disputes, completing decompositions. That reconciliation
  work IS the value-add. Say so.

Net: honesty = show every state and its count; confidence = the
published set is trustworthy *because* the unpublished set is visibly
under disciplined management.

## B.5 Ontology / governance risks from low visible counts (item 6)

| Risk | Description | Mitigation |
|---|---|---|
| **Credibility** | Advanced users who know 500+ tricks exist conclude the project is amateur or ignored history | The §B.2 doctrine + visible tracked-state counts |
| **Authority erosion** | If the dictionary looks incomplete, its canonical *rulings* (ADD values, decompositions) read as less authoritative | Frame publication as a strict bar — incompleteness by discipline, not neglect |
| **Discovery / SEO** | A search for an unpublished trick returns nothing — reads as "IFPA doesn't have it" | The Coverage & Scope page should be discoverable; longer term, minimal "tracked / under review" stubs for high-traffic unpublished names |
| **Equivalence confusion** | An unpublished trick that is actually an alias of a published one looks "missing" when it is the same trick renamed | The Alias/Equivalence state must be surfaced — a reader should be able to learn "X is tracked as an equivalence candidate of Y" |
| **Re-ingest / duplication** | Without a visible staging layer, a future curator re-scrapes a corpus already catalogued | The master spreadsheet + observational export + QC tooling are the system of record; keep them referenced from the doctrine |
| **Mechanical-vs-published gap** | 184 rows are `first_class_ready` but only ~171 are published — looks like an inconsistency | The doctrine must distinguish *mechanically ready* from *curator-selected for publication* (the staging-queue triage already encodes this) |

## B.6 Recommended sequencing

1. **ADD subsection** (Part A) — smallest, self-contained, no
   dependencies. Ship first.
2. **Refresh the stale coverage summary** — at minimum correct
   "corpus not yet loaded" and swap the one-liner for the headline
   pipeline line. Quick correctness fix.
3. **Coverage & Scope explainer** — the larger editorial piece;
   author the five-state essay, wire the landing preview + link.

All three are prose/content-module work — no schema change, consistent
with "editorial refinement slice."

---

*Proposal only. No code or schema changed. Implementation is a
follow-up slice once the curator approves the doctrine framing.*
