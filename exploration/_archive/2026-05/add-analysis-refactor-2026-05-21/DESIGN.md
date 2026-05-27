# ADD Accounting & Analysis — Refactor Design — 2026-05-21

The `/freestyle/add-analysis` page is the project's longest-standing
ADD-explanation surface. It predates the current four-layer ontology
(parser / editorial / canonical / observational) and predates the
operator-board worldview that now drives the glossary, the trick
dictionary, the first-class trick architecture, and the equivalence-
topology layer. This document proposes a movement-language-first
refactor that aligns the page with the newer surfaces without losing
its honest-truthfulness posture.

**Doctrine inherited** from the 2026-05-21 glossary architecture
overhaul §12.1:

> The glossary is a curated conceptual overview layer, not an
> exhaustive enumeration surface. Exhaustive ontology publication
> belongs to per-trick expanded pages and dictionary browse systems.

The ADD analysis page sits orthogonally: it's the **canonical ADD
doctrine surface** plus **cross-source reconciliation appendix**. Per
the user's task: pedagogy + structural readings should *also* live
here, but the page should not duplicate the glossary essay; it should
inherit the glossary's vocabulary and point readers at first-class
trick pages for expanded ontology.

---

## 1. Conceptual critique

### 1.1 The page's identity is mixed

The current page interleaves five distinct concerns:

| Concern | Section(s) | Audience |
|---|---|---|
| Canonical ADD doctrine (operator weights, additive rules) | §1 component table + §1 callouts | Compliance / scoring reader |
| Glossary pedagogy (worked examples that teach the movement language) | §2 worked examples | Learner / scanner |
| Symbolic notation (the operator-board grammar) | implicit, scattered | Analyst |
| Historical discrepancy analysis (FM, PB, pre-pt10 conventions) | §3 + §3c | Historical / reconciliation reader |
| Settled-compound reference | §2b resolved formulas | Lookup user |

Each audience reads the page differently. The current single-flow
ordering forces a learner to step through doctrine (§1), then
worked-examples (§2), then a settled-formulas table (§2b), then
discrepancy cases (§3), then framing notes (§3c collapsed details),
then closing prose (§4). The analyst needs the symbolic readings; the
historical reader needs the appendix; the learner needs the worked
examples. **All three audiences currently traverse the same path.**

### 1.2 Specific terminology drift since the page was authored

Five concrete instances where the page predates the current ontology:

| Drift | Where | Why it's a problem |
|---|---|---|
| "Rotation (spin) — a full-body rotation built into the atom" | §1 component-class table | Conflates three distinct things: the *rotational-direction* property of certain atoms; the *spin* flag-counting primitive; the *spinning* body operator. The current row's example reinforces the conflation ("the spin built into osis (distinct from the spinning operator stacked on top)"). |
| "Mirage — Foundational rotational anchor" | §2 worked-example whyNote | Mirage is a dexterity atom, not a rotational atom. Per `FAMILY_INVARIANTS`: `hippy in dex > op toe`. Calling it "rotational" pre-dates the topology-governance distinction between dexterity primitives and rotational primitives. |
| "Clipper (kick)" as a 1-ADD worked example | §2 worked examples | There is no canonical trick named "Clipper (kick)" — the canonical row is `clipper-stall`. The 1-ADD entry exists to teach `xbody` as a primitive but presents it as a named trick, which confuses the canonical / pedagogical layer separation. |
| ATW description: "full-orbit dex(1) + stall(1) = 2 ADD" | §2 worked example | The page predates the ATOMIC_FLAG_DECOMPOSITIONS operational chain for around-the-world: `toe > ss(midtime) in dex > ss toe`. The richer operational form is now available and should surface as the symbolic reading. |
| "Body operators — paradox, ducking, symposium, spinning, stepping" | §1 component-class table | Collapses set modifiers (pixie/fairy/atomic), entry-topology modifiers (paradox/symposium), midtime body modifiers (spinning/ducking/stepping/diving/swirling/tapping), and no-plant/suspension modifiers into one undifferentiated "body operators" row. The operator-board four-axis taxonomy (Set / Entry / Midtime / No-plant) is the newer organizing frame. |

### 1.3 Worked-example format weakness

The `Components: / Derivation: / Why:` triple was authored as
prose-first pedagogy:

- **Components:** free-form English (e.g. "One cross-body kick (no
  stall finish)")
- **Derivation:** the additive math line
- **Why:** one-line pedagogical note

The newer architecture has stronger symbolic vocabulary available:

- Operational chains from `ATOMIC_FLAG_DECOMPOSITIONS` (e.g. `[set] >
  leggy in dex > ss clipper` for whirl)
- First-class Notation summary already published on trick-detail pages
  for the 11 Tier-1 atom singletons (osis, mirage, whirl, butterfly,
  swirl, legover, pickup, illusion, ATW, toe-stall, clipper-stall)
- Family invariants (DP-1) restating the structural form per family

The current `Components:` prose is consistently **less informative**
than the symbolic data already published elsewhere. A reader who
clicks from a worked example to the trick-detail page descends from
prose into richer symbolic content — the wrong direction of pedagogy.

### 1.4 The "honest-truthfulness" posture is the page's load-bearing
asset

The page's philosophy paragraph + editorial-truth rule + incompleteness
note + discrepancy section all establish a posture the rest of the
site inherits from. This refactor must preserve that posture exactly.
Specifically:

- Editorial-truth rule (canonical ADD wins; arithmetic is diagnostic)
- Incompleteness note (folk-named compounds carry pending pills)
- No-fabricated-formulas discipline
- Honest disagreement framing ("differs from", never "wrong")
- Cross-source transparency (PB vs IFPA, FM vs IFPA)

These are doctrine the refactor preserves verbatim.

---

## 2. Terminology recommendations

### 2.1 Adopt the operator-board four-axis taxonomy

Replace the single "Body operators" row with four axis-aligned rows
mirroring `MOVEMENT_SYSTEM_AXES`:

| Axis | Members | Weight |
|---|---|---|
| Set / Uptime | pixie, fairy, atomic, quantum, nuclear, blurry, barraging | varies (atomic +1/+2 rot; nuclear +2; quantum +1; blurry +1; barraging +2; pixie/fairy +1) |
| Entry topology | paradox, symposium | +1 each (entry-topology modifiers) |
| Midtime body | spinning, ducking, diving, swirling, stepping, tapping, gyro, furious, whirling, miraging | mostly +1; some rotational (gyro +1; furious +2 rotational) |
| Positional / directional | ss, far, near, reverse, op | +0 (positional, not difficulty) |

Mirrors `freestyleMovementSystems.ts` and the operator-board grammar.
Honest about which weights are settled vs Wave-2-gated.

### 2.2 Disambiguate "rotation" / "spin" / "spinning"

Three distinct concepts:

| Term | Meaning | Where it appears |
|---|---|---|
| **Spin flag** (atomic component) | A ±1-bearing primitive that appears in an atom's flag decomposition (osis carries `spin(1) + xbod(1) + stall(1) = 3 ADD`) | §1 atomic-component primitives |
| **Spinning body operator** | A +1 midtime-body modifier applied atop a base trick | §1 modifier table; §2 worked examples |
| **Rotational character** (of a base) | A topology property — certain atoms are rotational; this triggers the atomic +2-rotational rule and the rotational-frame continuity doctrine | §1 atomic / rotational doctrine; §2 mobius doctrine |

Each gets its own labeled row + careful prose. The conflation in the
current page is the single highest-priority terminology fix.

### 2.3 Replace weak phrasing throughout

| Current weak phrasing | Proposed |
|---|---|
| "Rotation built into the atom" | "Spin flag — a rotational primitive counted as one ADD-bearing unit when present in an atom's flag decomposition." |
| "Foundational rotational anchor" (mirage) | "Foundational dexterity atom" / "dex-stall atom" |
| "Clipper (kick)" | Reframe as "Cross-body traversal (xbody primitive)" — an accounting primitive illustrated via clipper motion, not a canonical trick. Or move to §1 as the xbody example, drop from worked examples. |
| "full-orbit dex" | Use the operational chain: `toe > ss(midtime) in dex > ss toe`. Augment the additive line with the symbolic chain. |
| "Body operators" (single row) | Four axis-aligned rows per §2.1 above. |
| "Components: / Derivation: / Why:" | "Operational reading: / Structural derivation: / Interpretation:" |

### 2.4 Worked-example row vocabulary

| Old label | New label | Content |
|---|---|---|
| Components: | **Operational reading:** | Symbolic chain from ATOMIC_FLAG_DECOMPOSITIONS where available; structural form otherwise. Example: `[set] > leggy in dex > ss clipper` for whirl. |
| Derivation: | **Structural derivation:** | Explicit additive math line (unchanged content; only the label changes). |
| Why: | **Interpretation:** | Concise pedagogical context — what the reading teaches; what it makes visible about the compositional language. Tighter, less prose-heavy than current `whyNote`. |

The "Operational reading:" row is the load-bearing change. It surfaces
the symbolic chain on this page rather than forcing readers to click
through to the trick-detail page to find it.

### 2.5 Vocabulary alignment with glossary publication-states

Inherit the GA-1 publication-state badges where applicable:

- `[advanced]` for deep-form unfolding rows on multi-depth examples
  (mobius)
- `[doctrine]` for rotational-continuity reading on mobius
- `[historical]` for pre-pt10 / pre-Wave-2 conventions in §3
- `[observational]` (not used here — this page is canonical doctrine)

Reuse the existing CSS classes (`.glossary-layer-badge--*`) for
visual cohesion across surfaces.

---

## 3. Proposed restructuring — A / B / C sections

The user-recommended three-section split is the right structural move.
Each section serves one audience cleanly.

### 3.1 SECTION A — Canonical ADD Accounting

**Audience:** compliance / scoring readers; analysts looking up rules.

**Tone:** specification-like, dense, scannable, no narrative.

**Contents:**

| Subsection | Content |
|---|---|
| A.1 Atomic flag primitives | The five flag-counting primitives: stall / dex / xbody / spin / specialized-surface. Each row: label + weight + example. |
| A.2 Operator weights by axis | Four axis-aligned modifier rows (Set / Entry / Midtime / Positional) per §2.1. Each row: members + weight rule + example. |
| A.3 Settled doctrine | Positional +0 universal rule (Red 2026-05-11); atomic rotational policy (+1 non-rotational / +2 rotational); rotational-escalation retired (pt10); ss=+0 universal; barraging two-dex set (Red 2026-05-20). |
| A.4 The editorial-truth rule | Canonical ADD wins; arithmetic is diagnostic. Verbatim from the current page. |
| A.5 Honest incompleteness | Pending-decomposition rows carry the dictionary-card pill. Verbatim. |

Total: ~40 lines of compact specification. No worked examples. No
narrative. Reads like reference documentation.

### 3.2 SECTION B — Structural Readings & Worked Examples

**Audience:** learners; movement-language readers; anyone descending
from the glossary "View full ontology →" link.

**Tone:** movement-language-first; symbolic; pedagogical.

**Contents:**

| Subsection | Content |
|---|---|
| B.1 The compositional reading method | Two-paragraph intro: how to read a trick name as a structural formula. Mirrors the glossary §7 generative-insight framing without duplicating it. |
| B.2 Atomic worked examples (11 entries) | Each Tier-1 atom: operational reading + structural derivation + interpretation. Reuses ATOMIC_FLAG_DECOMPOSITIONS data where available. |
| B.3 Operator-stack worked examples | 3-5 entries showing modifier stacking (paradox-mirage, atom-smasher, etc.). Each shows the stack visually. |
| B.4 Compression and expansion | 2-3 entries showing multi-depth readings (mobius, blurry-whirl, food-processor). Compressed vs expanded vs deep readings, all converging to the same ADD. |
| B.5 Equivalence-topology preview | Brief mention + cross-link to /freestyle/glossary#compression-vs-alternate-derivation. NOT a full restatement. |

Each B.* worked example follows the new row vocabulary: **Operational
reading: / Structural derivation: / Interpretation:**.

Total: ~120 lines of pedagogical movement-language content. Symbolic
chains visible. Each example links to the trick-detail page via the
GA-6 standardized "View full ontology →" affordance.

### 3.3 SECTION C — Historical / Cross-source Differences

**Audience:** historical readers; reconciliation analysts; readers
researching pre-pt10 conventions.

**Tone:** appendix; archival; transparent.

**Contents:**

| Subsection | Content |
|---|---|
| C.1 Why disagreements exist | Three recurring reasons: positional vs additive; compression vs expansion; historical evolution. Verbatim from current §4 closing paragraphs. |
| C.2 Discrepancy cases | The current 10 DC-* cases. Format unchanged; section-renamed for appendix framing. |
| C.3 Edge cases | The current 2 brief mentions (Sumo, Genesis). Unchanged. |
| C.4 PassBack vs IFPA framing | The current collapsed-details section. Unchanged. |
| C.5 Pre-pt10 conventions | Brief retrospective: rotational escalation retired, recursive atomic application no longer applied, etc. New content. |

Total: ~60 lines + the existing tables.

### 3.4 Section ordering

A → B → C is the natural ordering by audience: doctrine spec first
(scoring readers want the rules); pedagogy second (learners read the
worked examples); appendix last (reconciliation analysts know to
scroll). A reader can jump to any section via a sticky sidebar TOC
(mirrors the glossary's sticky sidebar pattern).

---

## 4. Rewritten sample sections

Five illustrative samples. **These are drafts for review, not
implementation-locked text.** The curator's wording prerogative
applies; this document supplies the *shape* and *vocabulary*.

### 4.1 Sample: §A.2 operator-weight axes (replacement for current
single "Body operators" row)

```
| Axis              | Members                                       | Weight rule                                  | Example                          |
|-------------------|-----------------------------------------------|----------------------------------------------|----------------------------------|
| Set / Uptime      | pixie · fairy · atomic · quantum · nuclear ·  | atomic +1 non-rotational / +2 rotational ·   | atomic mirage = atom smasher = 4 |
|                   | blurry · barraging                            | nuclear +2 (= paradox + atomic) ·            |                                  |
|                   |                                               | quantum +1 (compressed atomic) ·             |                                  |
|                   |                                               | blurry +1 · barraging +2 (two-dex set)       |                                  |
| Entry topology    | paradox · symposium                           | +1 each — entry-position modifiers           | paradox mirage = 3               |
| Midtime body      | spinning · ducking · diving · swirling ·      | mostly +1 · gyro +1 · furious +2 rotational  | ducking whirl = 4                |
|                   | stepping · tapping · gyro · furious ·         | (non-rotational TBD) · whirling/miraging +1  |                                  |
|                   | whirling · miraging                           |                                              |                                  |
| Positional /      | ss · far · near · reverse · op                | +0 — positional cues, not difficulty         | hurl = nuclear ss whirl = 5      |
| directional       |                                               | (Red 2026-05-11 + 2026-05-15)                |                                  |
```

Honest about Wave-2-gated weightings (furious non-rotational TBD).

### 4.2 Sample: §A.1 atomic flag primitives (replacement for current
"Rotation (spin)" row + companion rows)

```
| Primitive  | Weight | Meaning                                                                |
|------------|--------|------------------------------------------------------------------------|
| stall      | 1 ADD  | A catch on a recognized surface (toe-stall, clipper-stall, neck-stall) |
| dex        | 1 ADD  | One bag-foot interaction (hippy, leggy, in, out, ss, op)               |
| xbody      | 1 ADD  | The bag crosses one plane around the body                              |
| spin flag  | 1 ADD  | A rotational primitive in an atom's flag decomposition (osis).         |
|            |        | Distinct from the *spinning* body operator (which adds +1 atop a       |
|            |        | base) and from the *rotational-character* property of certain atoms    |
|            |        | (which triggers the atomic +2-rotational rule).                        |
| specialized| 1 ADD  | A non-foundational surface (head, shoulder, forehead) used as a stall  |
| surface    |        |                                                                        |
```

The "spin flag" row carries the disambiguation explicitly so the
reader sees the three distinct concepts at once.

### 4.3 Sample: §B.2 atomic worked example — whirl (movement-language-
first format)

```
Whirl  ·  3 ADD                                          [View full ontology →]

  Operational reading:     [set] > leggy in dex > ss clipper
  Structural derivation:   xbody(1) + dex(1) + stall(1) = 3 ADD
  Interpretation:          The rotational dex finishing in a same-side
                           clipper stall. Three flag-counting primitives
                           combine into the foundational rotational atom.
                           Anchors a deep family (paradox-whirl,
                           spinning-whirl, ducking-whirl, blurry-whirl,
                           symposium-whirl, mobius via torque branch).
```

Compare to the current entry, which has prose `Components:` ("Cross-
body + dex + stall") that is less informative than the symbolic
chain available in `ATOMIC_FLAG_DECOMPOSITIONS`.

### 4.4 Sample: §B.2 atomic worked example — mirage (with terminology
fix)

```
Mirage  ·  2 ADD                                         [View full ontology →]

  Operational reading:     [set] > hippy in dex > op toe
  Structural derivation:   dex(1) + stall(1) = 2 ADD
  Interpretation:          A dexterity atom: an inward-hippy dex
                           finishing on the opposite-side toe.
                           Foundational dexterity primitive that anchors
                           a deep cohort (paradox-mirage, atom-smasher,
                           blur, witchdoctor) via modifier stacks and
                           composite-base readings.
```

"Foundational rotational anchor" → "Foundational dexterity primitive."
Honest. Aligned with `FAMILY_INVARIANTS`.

### 4.5 Sample: §B.2 reframed "Clipper (kick)" entry

Option 1 — **drop** from worked examples; move the xbody example up to
§A.1 (the primitive table) where it logically belongs.

Option 2 — **keep but reframe** as a pedagogical-only entry:

```
Cross-body traversal (xbody primitive)  ·  illustrative          [no canonical trick page]

  Operational reading:     xbody only (no stall finish)
  Structural derivation:   xbody(1) = 1 ADD
  Interpretation:          Not a named trick — a single accounting
                           primitive shown in isolation. The xbody
                           flag is what the clipper kick contributes
                           to compound tricks like whirl and butterfly.
                           For the canonical clipper trick, see
                           clipper-stall.
```

Option 1 is cleaner (the §A.1 row already establishes xbody as a
primitive with the same example). Option 2 preserves the pedagogical
visibility at the cost of slight redundancy.

**Recommendation:** Option 1. Drop the entry; the §A.1 primitive table
covers it.

### 4.6 Sample: §B.4 compression-and-expansion worked example — mobius
(multi-depth)

```
Mobius  ·  5 ADD                                         [View full ontology →]

  Compressed reading:      gyro torque
  Semantic reading:        spinning ss torque
  Deep reading:            spinning ss miraging osis
  Operational reading:     CLIP > OP IN [DEX] > (BACK) SPIN [BOD] > OP CLIP [XBD] [DEL]
  Structural derivation:   gyro(+1) + torque(4) = 5 ADD
                           OR (deep form):
                           spinning(+1) + ss(+0) + miraging(+1) + osis(3) = 5 ADD
  ADD doctrine:            [doctrine] rotational-frame continuity — the
                           naïve count of 6 is reduced by 1 because the
                           gyro and the torque share a single rotational
                           frame. Mechanism, not weight.
  Interpretation:          The flagship multi-depth example. Three
                           stopping depths reach the same ADD. Players
                           use "mobius" in conversation; the deeper
                           readings exist for structural analysts.
                           See glossary §9 for the compression-ladder
                           framing.
```

Surfaces the symbolic ladder + doctrine + cross-link in one block.
Sits at the junction of the page's spec / pedagogy / discrepancy
concerns — and resolves all three simultaneously.

---

## 5. Doctrine-risk warnings

| Risk | Mitigation |
|---|---|
| The §A.2 operator-axis row over-claims that the four-axis taxonomy is canonical | The current MOVEMENT_SYSTEM_AXES is curator-authored; per topology-governance skill it's observational pedagogy, not a single-valued taxonomy column. The refactor should label the §A.2 framing as "operator-board axes (organizing convention)" rather than "canonical taxonomy". |
| The §B.4 mobius doctrine claim ("rotational-frame continuity") becomes the rendered authoritative explanation | The doctrine note already lives in §1 of the glossary (derivation atlas). The §B.4 sample above quotes the doctrine note by reference; the authoritative home stays §1 glossary. ADD analysis page links to it. |
| Renaming "Components: / Derivation: / Why:" to "Operational reading: / Structural derivation: / Interpretation:" forces a relabeling that may invalidate prior reader citations | The old labels are not stable URLs or anchors; no external citation depends on them. Internal cross-references update in one place. Low risk. |
| Dropping "Clipper (kick)" as a worked example removes an entry that some readers may have bookmarked | The `#workedExample-clipper` anchor (if it exists) becomes stale. Mitigation: leave a brief breadcrumb in the §A.1 row pointing to `clipper-stall` as the canonical trick name. |
| The four-axis operator taxonomy may shift as Red Wave 2 lands | All Wave-2-gated weightings (furious non-rotational, barraging operator class refinements) are marked TBD explicitly in §A.2. The refactor doesn't lock them. |
| Surfacing operational chains for every Tier-1 atom may over-promise — some atoms have curator-pending chains | ATOMIC_FLAG_DECOMPOSITIONS already covers all 11 Tier-1 atoms. The refactor uses only this curator-locked data; doesn't fabricate chains. |
| "Foundational dexterity primitive" terminology for mirage may need curator confirm before public render | Per the topology-governance skill: mirage is `hippy in dex > op toe`; "dexterity atom" / "dex-stall atom" / "foundational dexterity primitive" are all reasonable labels. Curator picks the preferred phrasing. |
| The A/B/C split adds a sticky sidebar — UI weight | Mirrors the glossary's existing pattern. Same CSS conventions. Low risk. |
| Removing prose `Components:` may regress readability for non-symbol-literate readers | The `Interpretation:` line preserves the pedagogical prose. The new "Operational reading:" line ADDS the symbolic chain without removing the human-readable explanation. |

### 5.1 Non-doctrine-risk reminders

- Do NOT change any canonical ADD value as part of this refactor. The
  editorial-truth rule holds: canonical numbers are sacred.
- Do NOT collapse the equivalence-topology discrepancy cases (DC-04,
  DC-05, DC-06, DC-07) into the worked-examples section. Those cases
  remain in §C (historical / cross-source) because they teach the
  reader to recognize compression patterns in OTHER sources, not
  rewrite IFPA's own readings.
- Do NOT delete the `passbackAddDisagreements` table. It's the only
  cross-source PB reconciliation surface; load-bearing for honest
  attribution.
- Do NOT add new discrepancy cases without curator confirmation that
  they're settled (the current "5 controversial cases excluded"
  discipline holds).

---

## 6. Integration with glossary + first-class trick pages

The refactor strengthens three integration points.

### 6.1 ADD analysis ↔ glossary

| Direction | Mechanism |
|---|---|
| Glossary §8 (ADD Accounting) → ADD analysis page | Existing cross-link "For the full mechanical walkthrough, see /freestyle/add-analysis" — preserved |
| Glossary §9 (Compression ladders vs alternate derivations) → ADD analysis §B.4 | NEW link: §B.4 mobius example cross-links to glossary §9's distinctions table |
| ADD analysis §A.4 (editorial-truth rule) → glossary §1 (How to read this glossary) | NEW link: ADD analysis points back at the glossary's publication-state vocabulary |
| ADD analysis §C.5 (pre-pt10 conventions) → glossary §13 (Historical Terms) | NEW link: historical readers can deep-dive |

### 6.2 ADD analysis ↔ first-class trick pages

Every worked example in §B.2 and §B.3 carries a "View full ontology →"
link (GA-6 standardized affordance) to the trick-detail page. Where
the trick is FIRST_CLASS_TIER_1 (osis, mirage, whirl, butterfly, etc.),
the destination page already renders the first-class Notation summary
+ ATOMIC_FLAG_DECOMPOSITIONS — the reader descends from compact
analysis into full ontology cleanly.

Reciprocally: trick-detail pages for first-class atoms already cross-
link back to /freestyle/add-analysis from the dictNote / source
footer. No change needed there.

### 6.3 ADD analysis ↔ dictionary browse views

The current `crossLinks` block links to "Trick Dictionary" generically.
The refactor sharpens:

| Old link | New link |
|---|---|
| "Trick Dictionary" → /freestyle/tricks | "By family" → /freestyle/tricks?view=family (teaches structural grouping, sibling to the operator-board axes) |
| (none) | "By movement system" → /freestyle/tricks?view=movement-system (matches the §A.2 operator-axis framing) |
| "Glossary §7 Symbolic Notation" → /freestyle/glossary#symbolic-notation | "Glossary §7: Operational notation" → /freestyle/glossary#section-notation (correct anchor) |
| "Glossary §10 Traditional Reference" → /freestyle/glossary#traditional-reference | (unclear what this points to — verify before keeping) |

---

## 7. Reducing redundancy across surfaces

Five concrete redundancy reductions:

### 7.1 Mobius rotational-continuity doctrine

Currently appears in:
- Glossary §1 derivation-atlas mobius doctrine note (authoritative)
- Glossary §8 mobius worked-example (cross-link only post-GA-6)
- Glossary §9 mobius compression example
- ADD analysis page §3 (DC-07 mobius case)

After refactor: ADD analysis §B.4 surfaces the doctrine *by reference*
(quotes the doctrine name + status + links to glossary §1). The
authoritative wording lives in glossary §1; the ADD analysis page
*uses* it without restating it.

### 7.2 Compression vs expansion concept

Currently appears in:
- Glossary §9 distinctions table (authoritative)
- ADD analysis DC-04 / DC-05 / DC-06 / DC-07 cases (different framings)

After refactor: ADD analysis §B.4 introduces compression briefly and
cross-links to glossary §9 for the full distinctions table. The DC-*
cases in §C focus on cross-source identification (when does another
source compress vs expand differently from IFPA?), not on the concept
itself.

### 7.3 Blurry as +1 with stepping-paradox expansion

Currently appears in:
- Glossary §8 worked example
- ADD analysis §1 component table ("Blurry — +1 ADD — transitively expands to stepping paradox")
- ADD analysis DC-04 (blurry whirl)
- ADD analysis DC-05 (blurry torque)
- ADD analysis DC-06 (food processor)
- Per the R1a/R1d Red 2026-05-20 ruling: blurry no longer implies paradox

The current ADD-analysis prose "Blurry — transitively expands to
stepping paradox" predates the Red 2026-05-20 ruling that retired
this expansion. **The current page carries stale doctrine.**

After refactor: §A.2 rows should state "blurry +1 (implies stepping;
prior paradox-implication retired Red 2026-05-20)" or similar. DC-04
through DC-06 cases need a similar update or retire.

### 7.4 Atomic +1 non-rotational / +2 rotational

Currently appears in:
- Glossary §8 component definitions (Atomic +1 non-rotational / +2 rotational)
- ADD analysis §1 component table (same rule)
- Multiple worked examples

After refactor: the rule lives in §A.2 of ADD analysis (the
specification surface). Glossary §6 / §8 *reference* it. Single home
on the spec page; the glossary section becomes a brief mention +
cross-link.

### 7.5 SS = +0 universal

Currently appears in:
- Glossary §6 modifier reference
- ADD analysis §1 component table
- ADD analysis DC-01 / DC-02 / DC-03 cases

After refactor: rule lives in §A.3 of ADD analysis (the doctrine
home). Cases reference it.

---

## 8. Phased implementation proposal

The refactor is bigger than a single slice. Proposed phasing:

### Phase 1 — Surgical doctrine fixes (low-risk, high-value)

Fix the five terminology drifts identified in §1.2 without
restructuring the page:

1. Rewrite the "Rotation (spin)" component row per §4.2
2. Fix mirage's "rotational anchor" prose per §4.4
3. Drop or reframe "Clipper (kick)" per §4.5 (recommendation: drop)
4. Upgrade ATW's operational reading per §1.2 / §4.3 style
5. Split the "Body operators" row into four axis-aligned rows per §2.1
6. Update blurry doctrine line per §7.3 (Red 2026-05-20)

~100 lines of content-module edits. No template changes. No new
section. Tests pin the corrected terminology.

### Phase 2 — Worked-example format upgrade

Apply the new row vocabulary across all 18 worked examples:

1. Rename `components` → `operationalReading` (or add new field
   alongside `components` for migration safety)
2. Add `interpretation` field (rename `whyNote`)
3. Add "View full ontology →" affordance per worked example
4. Surface the ATOMIC_FLAG_DECOMPOSITIONS operational chain for the
   11 Tier-1 atoms

Service-shape changes; ~50 lines of view-model adjustments. Template
updates the row labels. Test sweep.

### Phase 3 — A/B/C section split

Restructure the page into three sections with sticky sidebar TOC.

This is the largest slice; recommend curator review of Phase 1+2
landings before committing.

### Phase 4 — Cross-surface redundancy reduction

Apply §7's redundancy reductions across glossary + ADD analysis.
Touches `freestyleGlossaryAddExamples.ts` + glossary template +
ADD analysis content module.

Phase 4 is gated on the curator's preference for which surfaces
should be authoritative for which concepts.

---

## 9. Acceptance gates

### Phase 1 (proposed; minimal slice)

- [ ] Five terminology fixes applied per §1.2
- [ ] Blurry doctrine line updated per Red 2026-05-20
- [ ] Tests pin corrected terminology
- [ ] No canonical ADD value changes
- [ ] No worked-example removals beyond "Clipper (kick)" (curator-
      confirmed drop)

### Phase 2

- [ ] Worked-example row vocabulary updated
- [ ] Operational readings sourced from ATOMIC_FLAG_DECOMPOSITIONS
- [ ] "View full ontology →" affordance per worked example
- [ ] Tests pin new row vocabulary

### Phase 3

- [ ] A/B/C section split implemented
- [ ] Sticky sidebar TOC
- [ ] Mobile-tested at 480px

### Phase 4

- [ ] Cross-surface redundancy reductions per §7
- [ ] Single home per concept; other surfaces reference

---

## 10. Closing

The ADD analysis page predates the project's current movement-language
worldview. It still teaches honestly and transparently — that posture
is the page's load-bearing asset. The refactor lifts the page into
the operator-board vocabulary, surfaces the symbolic chains that now
live in ATOMIC_FLAG_DECOMPOSITIONS, splits the audiences into three
sections, and stops duplicating doctrine that now has authoritative
homes in the glossary.

Restraint-first. Reversible by section. Curator-paced. The five
terminology fixes in Phase 1 are the smallest, highest-value slice;
the A/B/C restructure is a Phase 3 commitment that benefits from
curator review of Phase 1+2 outcomes before commitment.

Phase 1 is implementation-ready in this document. Phases 2-4 are
design-ready and await curator authorization.
