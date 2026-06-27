# Red Doctrine Integration — Consistency Audit

Scope: Operators & Modifiers surfaces, Set Encyclopedia, glossary, symbolic/JOB notation,
ADD-analysis, trick-detail doctrine modules, and the ADD compute/data model. Read-only audit;
no edits made. Implementation should re-verify exact line numbers before editing (citations below
are from a point-in-time read).

---

## 0. Headline finding

The doctrine prose is **already integrated on most surfaces**. The +2-on-rotational reading is
retired in the data (`trick_modifiers.csv`) and the parser; atomic = +1, X-Dex-is-separate,
the named far-receiver set (mirage / illusion / whirl / torque / drifter), the swirl exclusion,
and the paradox-vs-X-Dex distinction are all taught correctly on the canonical authority
(`freestyleOperatorReference.ts`), `freestyleStructuralFactNotes.ts`, the glossary, the
notation-token reference, and the ADD-analysis worked examples.

The genuine inconsistencies are **narrow** and concentrated in five places:

- **A. Paradox surfaces** — the entry formula is presented as the *definition* on the landing and
  the advanced-reference partial; the Paradox *detail* page lacks the formula, the [PDX] framing,
  mid-trick examples, and a notation cross-link. (This is the biggest item, and the one you named.)
- **B. Zulu / Weaving** — placeholders; Red's operational definitions are not present anywhere.
- **C. Atomic ↔ Miraging** — parallel and reciprocally linked, but with asymmetric depth and
  audit-status that reads as "Miraging is the lesser twin."
- **D. Two stale "atomic + paradox = Nuclear" lines** — contradict the settled
  `nuclear = paradox + downtime illusion`.
- **E. One real OPEN data question** — Quantum (and Sailing / Frantic) do **not** trigger X-Dex in
  the stored ADDs, although the *full* Red doctrine says they should. This is a stored-ADD
  migration, not a wording fix, and it has curator C-items still open.

A note on provenance: a prior internal memory described this whole migration as "HELD pending
greenlight." That memory is stale — the **atomic** half shipped. The **quantum/sailing/frantic**
half (item E) did not.

---

## 1. Doctrine baseline (what "correct" means here)

From the current correspondence (authoritative):

1. Atomic is always **+1** (never +2; no rotational class).
2. X-Dex is **separate** from atomic and is a notation/scoring component.
3. Eligible **far** receivers carry `[XDEX]`: **mirage, illusion, whirl, torque, drifter**.
4. **Swirl** and **Reverse Swirl** never carry `[XDEX]`.
5. "Far" is a positional descriptor; its annotation depends on context (Paradox or X-Dex).
6. Paradox must be taught as three distinct things: the **operator**, the **dex relationship**,
   and **`[PDX]`** the notation component. The clipper-entry formula is the common **entry
   example**, not the definition. Mid-trick paradox exists.
7. **Zulu set** = a ducking set where the bag passes across the body / under the chin **before** the
   duck. **Weaving set** = a ducking set where the bag is caught on the **same foot** that performed
   the set.

**Carry-over from the fuller Red ruling (relevant to item E):** the X-Dex *trigger* sets are
**Atomic, Quantum, Sailing, Frantic** — not atomic alone. The trigger attaches `[XDEX]` to the
following far receiver. The current correspondence's worked examples are all atomic-prefixed, so
whether this pass also moves the quantum/sailing/frantic stored ADDs is the central scope question
(see §5, Q1).

**Landmines (do not touch in this pass):**

- The **Q7 predator / "implicit paradox-atomic"** notes in `freestyleTrickDoctrine.ts` (predator
  entry) and `freestyleResolvedFormulas.ts` (predator) intentionally retain pt10 framing. They are a
  *separate, still-open* question. Leave them.
- `nuclear = paradox + downtime illusion` (carries no X-Dex) is settled and repropagated. The
  Paradox edits must not reopen it — they must align the two stale lines in §3-D to it.

---

## 2. Surface-by-surface state

| Surface | File(s) | State |
|---|---|---|
| Operator content authority | `src/content/freestyleOperatorReference.ts` (atomic 66-75; miraging 80-82) | ALREADY-CORRECT — atomic +1, X-Dex separate, "neither derived from the other" |
| Structural-fact notes | `src/content/freestyleStructuralFactNotes.ts:24` | ALREADY-CORRECT |
| Operators landing | `src/views/freestyle/operators.hbs:83-89` | CONFLICT (Paradox) — see I1 |
| Paradox detail (concept) | `src/services/symbolicModifierEducation.ts` PARADOX_CONTENT 255-379 | GAP (no formula / [PDX] / mid-trick / notation link) — see I2; plus stale nuclear line — see I3 |
| Advanced-reference partial | `src/views/partials/freestyle-modifier-advanced-reference.hbs:37-42` | CONFLICT (Paradox-as-formula) — see I1 |
| Modifier-reference partial | `src/views/partials/freestyle-modifier-reference.hbs:121-127` | ALREADY-CORRECT (paradox = dex relationship) |
| Glossary | `src/views/freestyle/glossary.hbs` (X-Dex 435-436; [PDX]/[XDEX] 1312-1315; far 464-465; weights 1468) | ALREADY-CORRECT |
| Notation token labels | `src/services/operationalNotationRendering.ts:116` ([XDEX]) | ALREADY-CORRECT |
| ADD-analysis | `src/content/freestyleAddAnalysisContent.ts` (SPIN_NOTE 221-230; classes 186-188; Atom Smasher 371-377) | ALREADY-CORRECT |
| Glossary ADD examples | `src/content/freestyleGlossaryAddExamples.ts` (nuclear 66-73) | ALREADY-CORRECT |
| Set: Atomic | `src/content/freestyleCanonicalSets.ts:303-329` | IA-asymmetry — see I6 |
| Set: Miraging | `src/content/freestyleCanonicalSets.ts:381-402` | IA-asymmetry — see I6 |
| Set: Quantum | `freestyleCanonicalSets.ts:280-301`; `freestyleService.ts` xDexReceiverNote ~10197 | Prose correct; **data** open — see I7 |
| Set: Swirling | `freestyleCanonicalSets.ts:748-765` | ALREADY-CORRECT (no [XDEX]) |
| Compositional sets | `src/content/freestyleCompositionalSets.ts` (miraging 382-387 vs atomic 447-451) | IA-asymmetry — see I6 |
| Zulu | `freestyleLandingContent.ts:80`; `freestyleService.ts:3512, 9640`; `freestyleMovementSystems.ts:78` | PLACEHOLDER — see I4 |
| Weaving | `freestyleObservationalUniverse.ts:1420`; `freestyleService.ts:565-570, 8518` | PLACEHOLDER + wrong gloss — see I5 |
| Atomic feel-card | `src/services/freestyleService.ts` ~3413-3421 (familyHint) | CONFLICT (stale nuclear) — see I3 |
| ADD data model | `freestyle/inputs/noise/trick_modifiers.csv:18`; `freestyle/scripts/parse_freestyle_notation.py:63` | Atomic CORRECT; quantum/sailing/frantic trigger NOT applied — see I7 |
| Q7 predator notes | `freestyleTrickDoctrine.ts` (predator); `freestyleResolvedFormulas.ts` (predator) | DO-NOT-TOUCH |

---

## 3. Inconsistencies found

**I1 — Paradox taught as "the formula," not the concept (landing + advanced reference).**
- `operators.hbs:83-87` defines Paradox, then gives `CLIP > OP IN [DEX]` as "the most common example"
  and notes a mid-trick `[PDX]` dex — but it does not separate the three senses (operator / dex
  relationship / `[PDX]` notation), and it carries this primary teaching that has no deeper home.
- `freestyle-modifier-advanced-reference.hbs:37-42` is worse: `Formula: PDX → CLIP > OP IN [DEX]`
  is presented as the definition of Paradox.
- Doctrine 6 says the formula is the entry *example*, not the definition.

**I2 — The Paradox detail page is not the authoritative explanation.**
- `symbolicModifierEducation.ts` PARADOX_CONTENT (255-379) has excellent embodied mechanics and a
  correct paradox-vs-X-Dex confusion card, but **no operational entry formula**, **no `[PDX]`
  notation-component framing**, **no explicit mid-trick paradox example**, and **no cross-link to the
  notation discussion**. The landing therefore holds information the detail page lacks — the exact
  inversion you flagged.

**I3 — Stale "atomic + paradox = Nuclear" drift (two sites).**
- `symbolicModifierEducation.ts` PARADOX_CONTENT `relatedModifiers.atomic` (371-372):
  "Combined with paradox, atomic produces the nuclear set (+2)."
- `freestyleService.ts` atomic feel-card `familyHint` (~3417): "Atomic stacks with paradox into
  Nuclear."
- Both contradict the settled `nuclear = paradox + downtime illusion` (which the *same*
  PARADOX_CONTENT states correctly in its confusion card at 291-294). Internal contradiction.

**I4 — Zulu is an undefined placeholder.**
- `freestyleLandingContent.ts:80` "Head dip or arc; duck/dive/weave/zulu family."
- `freestyleService.ts:9640` lists zulu under "Definition pending: undefined folk operators."
- No surface carries Red's "across-body / under-chin before the duck" definition.

**I5 — Weaving placeholder, and its one gloss is wrong.**
- `freestyleObservationalUniverse.ts:1420` "Weaving is an undefined folk operator; movement structure
  unruled."; `freestyleService.ts:565-570` carries a 'red-doctrine' (awaiting-ruling) status.
- `freestyleService.ts:8518` glosses weaving as "Head moves toward the bag, bag falls to the same
  side." — this is **not** Red's definition ("caught on the **same foot** that performed the set").

**I6 — Atomic ↔ Miraging read as unequal twins (depth + status, not "derived").**
- The reciprocal cross-links exist and the "neither derived from the other" framing is present in
  `operatorReference.ts:80-82`, so the *worst* wording is already gone.
- But: `freestyleCanonicalSets.ts` gives Atomic `audit: 'partial'` (327) and Miraging
  `audit: 'aligned'` (400); Miraging's `movement` text (383-386) is roughly half the length of
  Atomic's (304-307); and `freestyleCompositionalSets.ts` gives Miraging a one-line entry (382-387)
  against Atomic's detailed note (447-451). The asymmetry undercuts "parallel first-class systems."

**I7 — (DATA, OPEN) Quantum / Sailing / Frantic do not trigger X-Dex in stored ADDs.**
- Current data: `quantum_mirage=3`, `quantum_whirl=4`, `quantum_torque=5`, `quantum_illusion=3`,
  `quantum_drifter=4`, `quantum_symposium_whirl=5`, `quantum_ducking_whirl=5` — none carry `[XDEX]`.
- The only `[XDEX]`-bearing active rows are atomic/nuclear-family (atom_smasher, atom_bomb, ego,
  sumo, reactor, bladerunner, chainsaw_massacre, gary_coleman, juno_reactor, trixie).
- `frantic` has no `freestyle_trick_modifiers` row; `sailing` exists at +2.
- Under the full Red doctrine the far quantum rows move (e.g. `quantum_mirage 3→4`,
  `quantum_whirl 4→5`, `quantum_torque 5→6`). This is a stored-ADD migration touching ~9 quantum
  rows plus sailing/frantic, and it intersects the **ADD-analysis** surface. It is gated on the
  curator C-items (near/far variants; sailing batch; frantic has no canonical row). **Resolve scope
  (Q1) before any data edit.**

---

## 4. Proposed edits, grouped by page

### Paradox detail page — `symbolicModifierEducation.ts` PARADOX_CONTENT (make it authoritative)
1. Add an **operational section** carrying the entry formula `CLIP > OP IN [DEX]`, explicitly framed
   as the *common entry example*, not the definition.
2. Add the **three-senses** framing: Paradox the operator (+1 hip pivot), Paradox the dex
   relationship (third side relationship beside SAME/OP), and `[PDX]` the notation component.
3. Add a **mid-trick paradox** example (a `[PDX]` dex that is not the entry), to make clear paradox
   is not only an entry phenomenon.
4. Add a **cross-link to the notation discussion** (the `[PDX]` token reference in the glossary /
   JOB-notation article).
5. Fix `relatedModifiers.atomic` (371-372) to remove "atomic + paradox = nuclear"; nuclear is
   `paradox + downtime illusion`. If a nuclear pointer is wanted, state it correctly or drop it.

### Operators landing — `operators.hbs:83-89`
6. Reduce the Paradox block to a **summary** (one or two sentences: side-switching hip pivot, +1,
   recorded `[PDX]`) and **link to the Paradox detail page** for the formula and examples. Nothing on
   the landing should be unavailable on the detail page (your "landing summarizes, detail teaches"
   rule).

### Advanced-reference partial — `freestyle-modifier-advanced-reference.hbs:37-42`
7. Reword so the formula is labelled an **entry example**, not "Formula:"/definition; or replace the
   inline formula with a pointer to the Paradox detail page.

### Atomic feel-card — `freestyleService.ts` ~3417
8. Fix `familyHint` "Atomic stacks with paradox into Nuclear" → remove/replace; nuclear is
   `paradox + downtime illusion`.

### Zulu — wherever zulu is glossed (`freestyleLandingContent.ts:80`, `freestyleService.ts:3512/9640`, movement-systems)
9. Replace the placeholder with Red's definition: **a ducking set where the bag passes across the
   body / under the chin before the duck**. Remove zulu from any "definition pending / undefined folk
   operator" list. Add a worked movement description and update its relationship to Ducking (zulu is a
   ducking variant distinguished by bag path).

### Weaving — `freestyleObservationalUniverse.ts:1420`, `freestyleService.ts:565-570/8518`
10. Replace the placeholder + the wrong "bag falls to the same side" gloss with Red's definition:
    **a ducking set where the bag is caught on the same foot that performed the set**. Clear the
    'red-doctrine' awaiting-ruling status. Add a worked movement description and the Ducking
    relationship.

### Set Encyclopedia IA — `freestyleCanonicalSets.ts`, `freestyleCompositionalSets.ts`
11. Bring Miraging's `movement` text (383-386) to the depth of Atomic's (304-307).
12. Reconcile the audit-status asymmetry (Atomic `partial` vs Miraging `aligned`) — confirm with the
    curator which is right and set both consistently (see Q-note below).
13. Expand the Miraging entry in `freestyleCompositionalSets.ts` (382-387) to match Atomic's
    structural note (447-451).
14. **(Pending Q3)** Decide whether Zulu / Weaving get first-class set pages here (parallel IA to
    Atomic/Miraging) or are documented as Ducking variants on the modifier/glossary surface.

### Data / ADD-analysis — **gated on Q1; do not edit until scope is set**
15. If quantum/sailing/frantic are in scope: emit `[XDEX]` on the qualifying far quantum rows + move
    the ~9 stored ADDs, register `frantic`, run the sailing batch, then re-verify ADD-analysis
    worked examples. This is the held stored-ADD migration; it is CSV + parser + loader work, not a
    wording pass, and must follow the bracket-count == ADD rule.

---

## 5. Doctrine questions requiring curator confirmation

> Listed as a deliverable (per the request). Q1 is the one that gates implementation scope.

**Q1 (scope — blocks the data work).** The current rulings are written with atomic-only worked
examples, but the fuller Red doctrine names the X-Dex *trigger* sets as **Atomic, Quantum, Sailing,
Frantic**, and the stored data still has quantum **without** X-Dex (`quantum_mirage=3`,
`quantum_whirl=4`, …). Does this pass:
  (a) update **educational wording only** and leave quantum/sailing/frantic stored ADDs unchanged
      for now, or
  (b) also execute the **stored-ADD migration** (≈9 quantum rows move, e.g. `quantum_mirage 3→4`;
      plus sailing/frantic), which touches the ADD-analysis surface and the data/parser?

**Q2 (near/far receivers).** `atomic_illusion=3` and `atomic_drifter=4` carry no `[XDEX]` today even
though illusion and drifter are named receivers. Are these rows the **near** forms (correctly no
X-Dex), or should far variants exist / carry `[XDEX]`? (This is the open near/far C-item.)

**Q3 (Zulu / Weaving IA).** Red defines them as **ducking sets**. Should they become first-class
**Set Encyclopedia pages** parallel to Atomic/Miraging, or be documented as **Ducking variants** on
the modifier-family / glossary surface (with the new definitions)? This is a sets-vs-modifier layer
decision and changes which IA template they follow.

**Q4 (Frantic / Sailing).** `frantic` has no canonical row or modifier registration; `sailing` exists
at +2. Are either in scope for this pass, or deferred until they have canonical rows?

**Q5 (audit-status reconciliation).** Atomic is marked `audit: 'partial'` and Miraging `'aligned'`.
Which is authoritative now that both are confirmed first-class? (Cosmetic but visible in provenance
footers.)

---

## 6. Implementation order (highest educational impact first)

1. **Paradox detail page becomes authoritative** (edits 1-5). Highest impact: it is the page you
   named, the inversion is the most visible, and it unblocks edits 6-7.
2. **Operators landing + advanced-reference summarize-and-link** (edits 6-7). Completes the
   landing-summarizes / detail-teaches contract for Paradox.
3. **Nuclear drift fix** (edits 5, 8). Two-line correctness fix; removes an internal contradiction;
   cheap and safe.
4. **Zulu / Weaving definitions** (edits 9-10), once Q3 sets the IA. High impact (they are currently
   wrong/placeholder), but blocked on the sets-vs-modifier decision.
5. **Atomic ↔ Miraging IA polish** (edits 11-13). Medium impact; pure parallelism/depth.
6. **Quantum / Sailing / Frantic stored-ADD migration** (edit 15), only if Q1 = (b). Largest and
   riskiest (data + parser + ADD re-verification, C-items pending); lowest *wording* impact because
   the prose already teaches it correctly.

Throughout: edit `operatorReference.ts` first when any operator value/behavior is touched, then bring
secondary surfaces into line (single-authority rule). Do not disturb the Q7 predator notes or the
nuclear = paradox + downtime illusion definition.
