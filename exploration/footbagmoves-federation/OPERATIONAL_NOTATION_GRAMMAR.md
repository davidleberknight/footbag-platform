# FootbagMoves operational-notation grammar — analysis

**Status:** F0 reconnaissance grammar deliverable. **Planning / analysis only.** No code, no scraping at scale, no DB writes, no parser integration.

**Source corpus:** `legacy_data/inputs/curated/tricks/footbagmoves-sample.txt` (623 lines, ~50 trick rows across ADD=4/5/6/7/8/9 pages of FootbagMoves' search interface).

**Architectural separation (forever-rule, preserved):**

> Operational notation = **execution mechanics** ("how the body performs the trick: plant, dex, body, delays in sequence")
> Semantic notation = **ontology** ("what the trick is named and what it composes from")
> Parser decomposition = **diagnostic / editorial truth** ("what the structural-grammar parser derives from canonical_name + base_trick + modifier_links")

These three layers are **complementary, not competing.** Operational notation does not replace semantic; semantic does not replace operational; parser decomposition does not replace either.

---

## 1. Page-level structure

A FootbagMoves trick page presents per-row blocks roughly as:

```
<community/colloquial name>      ← line 1; may carry multiple names separated by " / "
<structural canonical name>      ← line 2 (optional; absent when colloquial name == canonical)
Adds: <integer>                  ← line 3
                                 ← line 4 blank
<operational notation string>    ← line 5 (optional; absent for some rows)
                                 ← line 6 blank
No Video Available | (video URL) ← line 7
```

Examples of the shape:

```
Blue Widow                                       ← colloquial
Pixie Spinning Paradox Symposium Whirl           ← canonical
Adds: 7

Toe > Same In (DEX) >> (back) Spin (BOD) >> (no plant while) Same Front Whirl (DEX)(PDX)(BOD) > Op Clip (XBD)(DEL)

No Video Available
```

```
Atomic Osis                                      ← canonical only (no colloquial alternative)
Adds: 4
                                                 ← no operational notation provided
No Video Available
```

ADD pages are paginated by integer ADD (4 / 5 / 6 / 7 / 8 / 9 visible in the sample). Per-page count: 173 / 139 / 75 / 39 / (8 not in sample, but referenced) / 2.

---

## 2. Token inventory

Three categories: **component flags** (in parens, ALL-CAPS, modify the preceding move), **pre-move state flags** (in parens, lowercase, prefix the move), and **structural tokens** (un-bracketed, Title-Case for grammar; multi-word for delay surfaces).

### 2.1 Component flags (parens, ALL-CAPS)

Modify the IMMEDIATELY-preceding move token. Multiple flags may stack.

| Token | Meaning | Operational role | Semantic role | Confidence |
|---|---|---|---|---|
| `(DEX)` | Dexterity component | The move is a dex (bag-foot interaction) | Maps to a structural dex step | **High** — appears in nearly every operational string |
| `(DEL)` | Delay / stall component | The move ends in a stall on a foot/surface | Terminal action of the trick or sub-segment | **High** |
| `(BOD)` | Body-position component | The move includes a body-pose change | Maps to body modifiers in IFPA (e.g. ducking, spinning, diving, paradox) | **High** |
| `(XBD)` | Cross-body component | The move/delay is on the opposite side of the body from the plant foot | Surface-side qualifier; pairs with `(DEL)` for cross-body delays | **High** |
| `(PDX)` | Paradox component | The move is a paradox dex | Maps to IFPA `paradox` modifier | **High** |
| `(XDEX)` | X-Dex component | The move is an X-Dex (full-circle dex variant) | Maps to IFPA `xdex` modifier (Red pt1: only fires in specific named tricks; fmoves uses more broadly — **divergence flag**) | **High existence; divergent semantics** |

**Stacking observed:** `(DEX)(PDX)(BOD)`, `(DEX)(XDEX)(PDX)(BOD)`, `(DEX)(XDEX)(BOD)(PDX)`, `(XBD)(DEL)(DEX)`. Order within a stack appears free; same flags reorder across rows without changing meaning.

### 2.2 Pre-move state flags (parens, lowercase)

Modify the IMMEDIATELY-FOLLOWING move token. Communicates state that holds DURING the move's execution.

| Token | Meaning | Pairing | Confidence |
|---|---|---|---|
| `(back)` | Backward-direction orientation | Most often `(back) Spin (BOD)` | **High** |
| `(front)` | Forward-direction orientation | `(front) Spin (BOD)`, `(no plant while) Same Front Whirl ...` | **High** (less common than `back`) |
| `(no plant while)` | Support-leg does NOT plant during this segment | Often before a multi-flag move; pairs with `>>` major-step boundaries | **High** — load-bearing for execution understanding |
| `(rooted)` | Held / rooted position; no support-leg plant; corresponds to the IFPA `rooted` set | `(rooted) Same In (DEX)(BOD)` | Medium (3 rows in sample) |

### 2.3 Structural tokens (un-bracketed, Title-Case)

#### Surfaces (used as plant initiator OR delay landing)
| Token | Role | Variants |
|---|---|---|
| `Clip` | clipper-stall | `Op Clip`, `Same Clip`, `Op Clip (XBD)(DEL)`, `Clip` (initial) |
| `Toe` | toe-stall | `Op Toe`, `Same Toe`, `Toe` (initial), `Op Toe (DEL)` |

#### Side prefix (precedes a move)
- `Same` — same-side (same as plant foot)
- `Op` — opposite-side

#### Arc direction (after side prefix)
- `In` — inward arc
- `Out` — outward arc

#### Whirl/swirl execution variants (used as dex moves on rotational bases)
- `Front Whirl` / `Back Whirl`
- `Front Swirl` / `Back Swirl`

#### Body action (verb-form, often after pre-state `(back)` / `(front)`)
- `Spin` — body spin
- `Duck` — duck body action
- `Dive` — dive body action
- `XBD Rake` — rare, observed in `Op XBD Rake (XBD)(DEL)(DEX)` (Sasquatch / Warlock)

#### Sidedness suffixes inside CANONICAL NAMES (line 2 of row block; not the operational notation itself)
- `ss` — "same side" inline disambiguator (e.g. `Atomic ss Osis`, `Barraging ss Double Double Down`)
- `os` — "opposite side" inline disambiguator (e.g. `Atomic os Symposium Double Over Down`)

These appear in the canonical-name string FootbagMoves uses, not in the operational notation. They're alias-shape qualifiers for distinguishing two same-named tricks performed on different sides.

### 2.4 Sequence operators

| Operator | Meaning | Example |
|---|---|---|
| `>` | Sub-step (continuous flow within a beat group) | `Op In (DEX) > Op Toe (DEL)` |
| `>>` | Major step boundary (often signals no-plant break or beat change) | `Clip > Op In (DEX) >> Duck (BOD) >> Op In (DEX)(PDX) > ...` |

**Observed semantics of `>>`:** appears at points where the support-leg lifts (no-plant), where a body action transitions, or where the trick's "tempo" shifts to the next beat group. The `(no plant while)` annotation is more often near a `>>` boundary than a `>` boundary, but the rule is not absolute.

### 2.5 Embedded structural references (compositional shorthand)

One sample row uses another trick's NAME as a starting token:

> `Frigidosis > Same In (DEX) >> Op Out (DEX) > Op Clip (XBD)(DEL)` — Arcwalk / Arctic Butterfly

This treats "Frigidosis" as a structural shorthand whose own notation expands into the front of this trick's notation. **Confidence: medium-high** that this pattern exists across the corpus; **needs more samples to confirm prevalence and consistency.** Frigidosis itself is not in the current sample; its observed-behavior would clarify whether this is a one-off or a regular grammatical feature.

(Deferred — will integrate when Frigidosis row is provided.)

---

## 3. Body-state, plant-state, directional, rooted/no-plant semantics

### 3.1 Plant-state spectrum

The corpus distinguishes three plant states via pre-move flags:

1. **Default (no flag)** — support foot plants normally between dex moves.
2. `(no plant while)` — support foot is mid-air for this move; common in fast compounds.
3. `(rooted)` — support foot anchored / held; no plant motion in either direction.

These are **execution-mechanic** properties, not ontology. Two tricks with identical semantic decomposition may have different plant-state flags depending on which physical execution variant is being notated. Operational notation captures "this is THE way to do it" or "this is ONE valid way"; FootbagMoves' choice between competing executions is a curator decision FootbagMoves makes per-row, not a universal property of the trick.

### 3.2 Spin / front-back direction

Spin direction (`(back)` vs `(front)`) is **load-bearing** for high-difficulty rotational compounds. Most observed body spins in the sample are `(back) Spin (BOD)` — backward body rotation; `(front)` appears sparingly (e.g. Aeon Flux / Nuclear Osis: `... >> (front) Spin (BOD) > Op Clip (XBD)(DEL)`).

For whirl/swirl moves the direction is fused with the move name itself: `Front Whirl`, `Back Whirl`, `Front Swirl`, `Back Swirl` — i.e., the front/back flag promotes from a separate token to part of the move name. This is a grammar-level inconsistency: spin/dive/duck use `(direction) Verb`, but whirl/swirl use `Direction Verb`.

### 3.3 Rooted semantics

`(rooted)` appears in 3 sample rows (Compound Fracture, Flying Fish, Rail Warrior, Dorshanatrix). All four are Railing-* compounds. The `rooted` state corresponds to the IFPA `rooted` set primitive (per `trick_modifiers.csv`: `rooted,0,0,set,"unique set with one initial dexterity attached"`). FootbagMoves' `(rooted)` flag and IFPA's `rooted` set primitive are **referencing the same underlying motion**.

### 3.4 No-plant semantics

`(no plant while)` is the most commonly seen pre-move flag (~30 sample occurrences). It marks a sub-segment where the support leg is in motion, often for tempo / compression reasons. This corresponds to IFPA's `[BOD]` and `(no plant while)` annotations in the existing `/freestyle/moves` operational reference (sourced from Chris Holden's footbag.org compilation).

### 3.5 Front/back whirl as execution

`Front Whirl` and `Back Whirl` are **execution-mechanic** distinctions that don't always surface at the IFPA semantic-notation layer. IFPA's `WHIRL` token doesn't distinguish front-vs-back direction; that detail is structural-execution information that the operational layer carries and the semantic layer doesn't. **This is a real example of the operational layer providing genuine pedagogical value beyond what the semantic layer carries.**

---

## 4. Operational vs semantic vs parser — concrete comparison

Same trick, three readings:

### Gauntlet (ADD=7)

| Layer | Reading |
|---|---|
| **Operational** (FootbagMoves) | `Clip > Op In (DEX) >> Duck (BOD) >> Op In (DEX)(PDX) > (back) Spin (BOD) > Op Clip (XBD)(DEL)` |
| **Semantic** (IFPA Tier 1) | `STEPPING DUCKING PARADOX TORQUE` |
| **Parser-derived** (`structural_parse_json`) | role-tokens: stepping(modifier, +1), ducking(modifier, +1), paradox(modifier, +1), torque(core_family, 4); computed_adds = 7 |
| **Editorial decomposition** | base_trick=`torque`; modifier_links=`stepping`, `ducking`, `paradox`; composed=4+1+1+1=7 ✓ |

The operational reading describes what the body does in 6 sub-steps. The semantic reading names what the trick IS in 4 tokens. The parser confirms the math. **All three are saying the same thing in their own language.**

### Coexistence display (R4+ workbook surface)

A trick-detail page that surfaces both layers might render:

```
┌─ Notation ─────────────────────────────────────────────┐
│ STEPPING DUCKING PARADOX TORQUE          ← semantic    │
└────────────────────────────────────────────────────────┘
┌─ Set notation (operational) ───────────────────────────┐
│ Clip > Op In (DEX) >> Duck (BOD) >> Op In (DEX)(PDX)  │
│ > (back) Spin (BOD) > Op Clip (XBD)(DEL)               │
└────────────────────────────────────────────────────────┘
[ Parser-derived structural decomposition (collapsed)    ]
[ Editorial decomposition (lineage truth)                ]
```

The two notations occupy distinct screen real estate. Neither overrides the other.

---

## 5. Worked examples

### 5.1 Blur (ADD=4) — confirmed ontology conflict

```
Blur
Blurry Mirage
Adds: 4
Clip > Op In (DEX) >> Op In (DEX)(PDX) > Op Toe (DEL)
```

| Reading | Form |
|---|---|
| Operational | `Clip > Op In (DEX) >> Op In (DEX)(PDX) > Op Toe (DEL)` |
| FM canonical name | "Blurry Mirage" |
| FM colloquial | "Blur" |
| IFPA semantic (pt10 adjudicated) | "Stepping Paradox Mirage" — per James pt10 adjudication 2026-05-10 |
| FM ADD math | blurry(+2 rot) + mirage(2) = 4 ✓ (using `trick_modifiers.csv` blurry's `add_bonus_rotational=2` — UNCHANGED by pt10; only spinning/swirling/whirling were retired from rotational escalation) |
| IFPA ADD math (pt10) | stepping(+1) + paradox(+1) + mirage(2) = 4 ✓ |

**This is a textbook ontology conflict.** Both FM and IFPA arrive at ADD=4 for Blur, but they get there via **different structural decompositions**:

- FM: `BLURRY MIRAGE` — a single-modifier compound (blurry + mirage), relying on blurry's rotational-escalation +2 bonus on mirage to make the math work.
- IFPA: `STEPPING PARADOX MIRAGE` — a two-modifier compound (stepping + paradox + mirage), each at flat +1.

**Reading the operational notation against the two interpretations:**

The operational sequence has TWO dex segments separated by `>>`, with `(PDX)` on the second segment only:

| Segment | Move | Flag |
|---|---|---|
| 1 | `Op In (DEX)` | plain inward opposite-side dex |
| (major break) | `>>` | no-plant boundary |
| 2 | `Op In (DEX)(PDX)` | second inward opposite-side dex with paradox |
| 3 | `Op Toe (DEL)` | opposite toe-stall landing |

Two distinct dex segments + paradox flag arguably tracks the IFPA `STEPPING PARADOX MIRAGE` decomposition more naturally:
- segment 1 = the Stepping (set component, first dex)
- segment 2 = the Paradox dex (with PDX flag)
- segment 3 = the Mirage landing on toe-stall

**vs.** the FM name "Blurry Mirage" (where blurry is a single set modifier) which would imply ONE blurry-modified dex + the mirage, not two distinct dex segments.

**Federation pipeline routing for this row:** `notation_conflict` + `ontology_conflict` (both fire). FM canonical name ("Blurry Mirage") does not match IFPA semantic notation. FM operational structure suggests an IFPA-aligned decomposition. **Routes to `needs_red`** for adjudication on the canonical decomposition; once Red rules, the FM operational notation can either (a) be adopted as IFPA's operational form for Blur if it matches the agreed decomposition, or (b) be flagged as evidence of a competing community reading.

**This single sample row demonstrates the entire reconciliation problem in miniature:** one trick name, two structural readings, both internally consistent on ADD math, escalable to Red. The federation pipeline must surface this — never auto-resolve.

### 5.2 Barfly (ADD=4)

```
Barfly
Far Double Over Down
Adds: 4
Clip >> Same Out (DEX) > Same Out (DEX) > Op Clip (XBD)(DEL)
```

| Reading | Form |
|---|---|
| Operational | `Clip >> Same Out (DEX) > Same Out (DEX) > Op Clip (XBD)(DEL)` |
| FM canonical name | "Far Double Over Down" |
| FM colloquial | "Barfly" |
| IFPA semantic | `BARFLY` (Phase 4 Tier 1 self-atom name-form per §5.7; family=infinity) |
| IFPA editorial decomp | base_trick=`infinity`; modifier_links absent (broken upstream link — `infinity` is not in the freestyle_tricks dictionary) |
| Pt10 disposition | `answered_b` (named compound, not a true base; James-approved operational decomposition; specifics held for /freestyle/moves planning) |

**Reading the operational notation:** start with a clipper-stall (`Clip`); major step (`>>`); two same-side outward dex moves in succession (`Same Out (DEX) > Same Out (DEX)`); land on opposite-side cross-body clipper-stall (`Op Clip (XBD)(DEL)`). Two same-side out-dexes is the structural signature — "Far Double Over Down" describes what the body literally does (two outward overhead dex sweeps "going down").

**Op vs IFPA naming gap:** FM names this "Far Double Over Down" structurally; IFPA names it `BARFLY` at the semantic layer (community-stabilized name). Both are valid; the federation surfaces both.

### 5.3 Montage (ADD=7)

```
Montage
Spinning Ducking Paradox Symposium Whirl
Adds: 7
Clip >> (back) Spin (BOD) > Duck (BOD) >> (no plant while) Op Front Whirl (DEX)(PDX)(BOD) > Op Clip (XBD)(DEL)
```

| Reading | Form |
|---|---|
| Operational | `Clip >> (back) Spin (BOD) > Duck (BOD) >> (no plant while) Op Front Whirl (DEX)(PDX)(BOD) > Op Clip (XBD)(DEL)` |
| FM canonical name | "Spinning Ducking Paradox Symposium Whirl" |
| FM colloquial | "Montage" |
| IFPA semantic (hypothetical Tier 2 — not yet authored) | `SPINNING DUCKING PARADOX SYMPOSIUM WHIRL` |
| IFPA computed | not in active dictionary; pt10 spinning-flat-+1 rule applies if added: spinning(+1) + ducking(+1) + paradox(+1) + symposium(+1) + whirl(3) = 7 ✓ |

**Execution reading:** start clipper-stall → major step → backward body spin → duck body action → major step (no plant while) → opposite-side front-whirl with paradox + body flags → opposite-side cross-body clipper-stall landing. The notation captures the body-state choreography precisely.

**Notable feature:** `(no plant while) Op Front Whirl (DEX)(PDX)(BOD)` — this is a single move carrying THREE component flags (DEX + PDX + BOD) plus a pre-move state. The whirl direction is `Front`; the dex is opposite-side; the body engages via the paradox component. This level of execution detail is exactly what semantic notation does NOT carry.

### 5.4 Blue Widow (ADD=7)

```
Blue Widow
Pixie Spinning Paradox Symposium Whirl
Adds: 7
Toe > Same In (DEX) >> (back) Spin (BOD) >> (no plant while) Same Front Whirl (DEX)(PDX)(BOD) > Op Clip (XBD)(DEL)
```

| Reading | Form |
|---|---|
| Operational | `Toe > Same In (DEX) >> (back) Spin (BOD) >> (no plant while) Same Front Whirl (DEX)(PDX)(BOD) > Op Clip (XBD)(DEL)` |
| FM canonical name | "Pixie Spinning Paradox Symposium Whirl" |
| FM colloquial | "Blue Widow" |
| IFPA semantic (hypothetical) | `PIXIE SPINNING PARADOX SYMPOSIUM WHIRL` |
| Pt10 ADD math | pixie(+1) + spinning(+1) + paradox(+1) + symposium(+1) + whirl(3) = 7 ✓ |

**Op vs Montage comparison:** Blue Widow and Montage have IDENTICAL ADD value (7) and very similar canonical structures (both end in "Paradox Symposium Whirl"). They differ only in:
- Set: Pixie (toe-set) vs Spinning (clip-set with body spin)
- Plant: `Toe` vs `Clip`
- Side of front-whirl: `Same Front Whirl` vs `Op Front Whirl`

This pair illustrates that **operational notation distinguishes execution variants the semantic layer can also distinguish** (via the modifier name) — but the operational form makes the difference physically concrete. The shape of the body is different even though the semantic family is the same.

### 5.5 Big Apple Sauce (ADD=9)

```
Big Apple Sauce / Chilly Pilly Sauce
Spinning Paradox Miraging Symposium Torque
Adds: 9
Clip >> (back) Spin (BOD) >> Op In (DEX)(PDX) > (no plant while) Op In (DEX)(XDEX)(BOD) > (back) Spin (BOD) > Op Clip (XBD)(DEL)
```

| Reading | Form |
|---|---|
| Operational | `Clip >> (back) Spin (BOD) >> Op In (DEX)(PDX) > (no plant while) Op In (DEX)(XDEX)(BOD) > (back) Spin (BOD) > Op Clip (XBD)(DEL)` |
| FM canonical name | "Spinning Paradox Miraging Symposium Torque" |
| FM colloquial | "Big Apple Sauce" / "Chilly Pilly Sauce" (two community names!) |
| IFPA editorial reading | torque(4) + spinning(+1) + paradox(+1) + miraging(+1) + symposium(+1) = 8, but FM asserts 9 — **ADD-conflict candidate** for needs_red routing |

**Conflict surfacing:** the operational reading has SIX move-segments and lands in `(XBD)(DEL)`. Counting the structural decomposition naively from FM's modifier name gives 4+1+1+1+1=8, not 9. Either (a) the asserted ADD includes an `(XDEX)` bonus per the second segment's `(DEX)(XDEX)(BOD)` flag (would give +1 = 9), (b) the canonical name is incomplete, or (c) FM's ADD differs from IFPA's pt10-aligned reading. **This is exactly the kind of row that routes to `add_conflict / needs_red` in the federation pipeline** — never auto-resolved.

**Two community names** (`Big Apple Sauce / Chilly Pilly Sauce`): the federation pipeline should treat both as alias candidates for the canonical entity, never auto-promoting either to canonical without James adjudication.

### 5.6 Stepping Ducking PS Whirl (ADD=7) — convention divergence

```
Stepping Ducking PS Whirl
Adds: 7
CLIP > OP IN [DEX] > DUCK [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP CLIP [XBD] [DEL]
```

| Reading | Form |
|---|---|
| Operational (atypical convention!) | `CLIP > OP IN [DEX] > DUCK [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP CLIP [XBD] [DEL]` |
| FM canonical name | "Stepping Ducking PS Whirl" (uses `PS` — paradox-symposium abbreviation) |
| IFPA editorial reading | stepping(+1) + ducking(+1) + paradox(+1) + symposium(+1) + whirl(3) = 7 ✓ |

**Convention divergence within FootbagMoves itself:**

This entry uses **ALL-CAPS + square-brackets** (`CLIP > OP IN [DEX]`). Every other operational notation in the sample uses **Title-Case + parens** (`Clip > Op In (DEX)`). This is the **same convention used in IFPA's NOTATION_STYLE_GUIDE §2.2 and §4.1 for semantic notation** — meaning either (a) FM is experimenting with adopting IFPA's style for new entries, or (b) this entry was authored by a different curator using a different convention, or (c) the entry was COPIED from IFPA's style guide and pasted without normalization.

Whatever the cause, **the federation pipeline must normalize across both conventions at L2**. See §7 below.

Also note: `PS Whirl` in the canonical name uses `PS` as an inline abbreviation for `Paradox Symposium`. This is FM's own abbreviation convention; IFPA's NOTATION_STYLE_GUIDE doesn't endorse such inline abbreviations — Tier 1 authoring expands to `PARADOX SYMPOSIUM WHIRL`.

### 5.7 Frigidosis — DEFERRED

Referenced as a token inside Arcwalk's notation (`Frigidosis > Same In (DEX) >> Op Out (DEX) > Op Clip (XBD)(DEL)`) but not present in this sample. Investigating its own row will clarify whether FM uses cross-trick references as a regular grammatical feature. Will integrate when received.

---

## 6. Capitalization, formatting, and grammar inconsistencies

### 6.1 Two coexisting convention shapes

| Convention | Example | Source-of-style |
|---|---|---|
| Title-Case + parens | `Clip > Op In (DEX) > Op Clip (XBD)(DEL)` | Default FM convention; ~98% of sample rows |
| ALL-CAPS + square brackets | `CLIP > OP IN [DEX] > OP CLIP [XBD] [DEL]` | IFPA NOTATION_STYLE_GUIDE; appears in 1 sample row (Stepping Ducking PS Whirl) |

### 6.2 Whirl/swirl direction-token grammar inconsistency

| Pattern | Example |
|---|---|
| Pre-state flag form (matches Spin/Duck/Dive) | `(back) Spin (BOD)`, `(front) Spin (BOD)` |
| Fused-into-name form (whirl/swirl only) | `Front Whirl`, `Back Whirl`, `Front Swirl`, `Back Swirl` |

The grammar is internally inconsistent — spin/duck/dive use a pre-state flag for direction; whirl/swirl fuse the direction INTO the move name. This is observable but not "wrong"; it likely reflects how the community thinks about the moves (whirl direction is intrinsic to the whirl identity; spin direction is an execution choice on top of a generic spin).

### 6.3 Component-flag stacking order

Component flags `(DEX) (DEL) (BOD) (XBD) (PDX) (XDEX)` stack freely. Order observed across sample:

| Stack | Example row |
|---|---|
| `(DEX)(PDX)(BOD)` | Blue Widow, Montage |
| `(DEX)(XDEX)(BOD)` | Cristal, Apocalypse |
| `(DEX)(XDEX)(PDX)(BOD)` | Blurry Chainsaw Massacre |
| `(DEX)(XDEX)(BOD)(PDX)` | Rage |
| `(BOD)(PDX)` | Sasquatch / Warlock (with another order: `(DEX)(BOD)(PDX)`) |

Observation: the order `(BOD)(PDX)` vs `(PDX)(BOD)` appears interchangeable. Normalization should canonicalize the stack order to make matching deterministic.

### 6.4 Side-suffixes in canonical names (`ss` / `os`)

These are **inline alias-shape disambiguators** inside the canonical-name string FM uses on line 2 of a row block. They are NOT operational notation grammar elements — they're naming-convention shortcuts FM uses to distinguish two same-named tricks performed on different sides.

Examples:
- `Atomic ss Osis` = "Atomic Osis (same-side variant)"
- `Atomic os Symposium Double Over Down` = "Atomic Symposium ... (opposite-side variant)"
- `Barraging ss Double Double Down`

The federation pipeline should:
- Capture `ss` / `os` as alias suffixes
- Map to IFPA's structural-alias category if present, or surface as alias candidates
- Never silently merge two ss/os variants into one canonical row (they may differ at the structural level)

### 6.5 Multi-segment notation gaps

Some rows have NO operational notation despite having a canonical name. Examples in sample:
- `Atomic Butterfly (same side)` (line 39-43) — Adds: 4, no operational string
- `Atomic Osis` (line 45-49)
- `Atomic ss Osis / Tapping Osis` (line 51-55)
- `Kyttyrä / Far Whirling Bent Symposium Swirling Osis` (line 418-423)
- `Nemesis Swirl / Barraging Barfly Swirl` (line 465-470)
- `Atomic DLO`, `Atomic Drifter` (line 132-142)
- `Surging Ducking Paradox Torque` (line 582 — ADD=8 row, no notation)
- `Carousel / Surging Ducking Paradox Symposium Whirling Rake` (line 614-617)

Roughly 8/50 sample rows lack notation. The federation pipeline must handle null-notation rows gracefully (skip operational extraction; still extract name + aliases + ADD).

### 6.6 Multiplicity and repetition in canonical names

Canonical names use `Double`, `Triple` prefixes (e.g. `Far Double Over Down`, `Double Legover`, `Double Double Down`, `Stepping Diving Double Legover`). This aligns with IFPA's `CANONICALIZATION_POLICY §10` productive-multiplicity rule. Federation pipeline routes these to `productive_multiplicity_external` per the F1 plan and defers to Red.

---

## 7. Normalization recommendations

The L2 normalization layer (per F1 plan §4) should produce a deterministic canonical form so matching at L3 has reliable surfaces to compare against. Recommendations:

### 7.1 Capitalization

- Default FM convention (Title-Case + parens) is the **majority** convention. Preserve in `operational_notation_raw`.
- Produce a normalized form `operational_notation_normalized` that uses ALL-CAPS + square brackets for component flags (matching IFPA NOTATION_STYLE_GUIDE §2.2). This makes the two conventions cross-comparable and harmonizes with IFPA's own operational-notation surface plan.

### 7.2 Component flag order

Within a stack, sort flags lexicographically. Proposed canonical order: `[BOD] [DEL] [DEX] [PDX] [XBD] [XDEX]`. Matches Unicode-sorted order; deterministic.

Example normalization:
- Raw: `Op In (DEX)(XDEX)(BOD)(PDX)`
- Normalized: `OP IN [BOD] [DEX] [PDX] [XDEX]`

### 7.3 Sequence operators

Preserve `>` / `>>` exactly. They carry semantic information (no-plant boundaries / beat changes) that normalization should not flatten.

### 7.4 Pre-move state flags

Preserve `(back)` / `(front)` / `(no plant while)` / `(rooted)` exactly. These are state annotations, not stylistic. Optionally: lowercase + strip extra whitespace.

### 7.5 Whirl/swirl direction handling

Two options:
- **(a) Preserve fused form**: keep `Front Whirl`, `Back Whirl` as compound move names. Less work; matches FM convention.
- **(b) Decompose to pre-state form**: rewrite `Front Whirl` → `(front) Whirl`, parallel to `(front) Spin`. More work; harmonizes with the rest of the grammar.

**Recommendation: (a).** The fused form is the community convention; decomposition would lose information ("Whirl" without direction is rarely if ever used in FM). Preserve the fused form in normalization; flag direction via a `whirl_direction` derived field if downstream consumers need it.

### 7.6 Two-name row handling

When line 1 has `/`-separated names (e.g. `Big Apple Sauce / Chilly Pilly Sauce`), split into:
- `name_primary` = first name
- `name_aliases[]` = remaining names

When line 1 != line 2 (colloquial != canonical), capture both:
- `name_colloquial` = line 1
- `name_canonical_fm` = line 2

These four fields (`name_primary`, `name_aliases`, `name_colloquial`, `name_canonical_fm`) round-trip to the L4 conflict-classification layer for matching against IFPA's existing `freestyle_tricks` + `freestyle_trick_aliases`.

### 7.7 Side-suffix expansion

Convert inline `ss`/`os` to side-tagged variants:
- `Atomic ss Osis` → `name_canonical_fm = "Atomic Osis"`, `side_variant = "same"`
- `Atomic os Symposium Double Over Down` → `name_canonical_fm = "Atomic Symposium Double Over Down"`, `side_variant = "opposite"`

Match key against IFPA: try name without side-variant first (most common case), then with side-variant if no match.

---

## 8. Proposed canonical operational-notation rendering style

For IFPA-side authoring of operational notation (when curator transcribes a FM entry or authors fresh), recommend the following style:

| Element | Style |
|---|---|
| Surfaces, sides, directions | ALL CAPS (`CLIP`, `TOE`, `SAME`, `OP`, `IN`, `OUT`, `FRONT`, `BACK`) |
| Component flags | square brackets, ALL CAPS, single space between (`[DEX]`, `[BOD]`, `[XBD]`, `[DEL]`, `[PDX]`, `[XDEX]`) |
| Pre-move state flags | parens, lowercase (`(back)`, `(front)`, `(no plant while)`, `(rooted)`) |
| Sequence operators | preserved (`>`, `>>`) |
| Body actions | ALL CAPS verbs (`SPIN`, `DUCK`, `DIVE`) |
| Whirl/swirl variants | ALL CAPS direction + ALL CAPS noun (`FRONT WHIRL`, `BACK SWIRL`) |

This matches IFPA's existing NOTATION_STYLE_GUIDE convention for semantic notation; coexistence cost is low because both layers use the same casing and bracket conventions, just different vocabularies.

### Normalized renderings of the worked examples

| Trick | Normalized |
|---|---|
| Blur | `CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]` |
| Barfly | `CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]` |
| Montage | `CLIP >> (back) SPIN [BOD] > DUCK [BOD] >> (no plant while) OP FRONT WHIRL [BOD] [DEX] [PDX] > OP CLIP [DEL] [XBD]` |
| Blue Widow | `TOE > SAME IN [DEX] >> (back) SPIN [BOD] >> (no plant while) SAME FRONT WHIRL [BOD] [DEX] [PDX] > OP CLIP [DEL] [XBD]` |
| Big Apple Sauce | `CLIP >> (back) SPIN [BOD] >> OP IN [DEX] [PDX] > (no plant while) OP IN [BOD] [DEX] [XDEX] > (back) SPIN [BOD] > OP CLIP [DEL] [XBD]` |
| Stepping Ducking PS Whirl | `CLIP > OP IN [DEX] > DUCK [BOD] > (no plant while) OP IN [BOD] [DEX] [PDX] > OP CLIP [DEL] [XBD]` |

These renderings preserve the source content while making the form deterministic for matching, comparison, and (eventual, far-future) tokenization.

---

## 9. Could operational notation become parseable in the future?

**Specifically deferred per current task constraints.** The user instruction was: do NOT propose parser integration yet.

That said, this analysis surfaces the following observations relevant to a future evaluation (preserved for the record, not actionable in F-phase work):

| Property | Operational notation status | Implication for future tokenization |
|---|---|---|
| Token vocabulary closed? | Largely yes — small finite set of tokens identified above | Tokenizable |
| Grammar regular? | Mostly — sequence operators + Title-Case moves + parens flags follow consistent shape | Parseable as a regular grammar |
| Semantic compositionality? | Partial — cross-references like `Frigidosis > ...` introduce non-regular references | Would need grammar extension |
| Cross-trick references resolve cleanly? | Unknown until Frigidosis-style entries are inspected | Open question |
| Maps cleanly to IFPA's role taxonomy? | Partial — DEX/BOD/PDX/XDEX have IFPA-side analogs; XBD and DEL are operational-only flags | Op layer carries info semantic doesn't |
| Could syntax-highlight on render? | Yes immediately — token sets are well-defined | Low-cost UX improvement at any time |

**No concrete proposal here.** Future federation phases may revisit this; for now, the rule stands: parser reads `canonical_name` only; FM operational notation lives outside the parser surface as opaque text or curator-shaped display string.

---

## 10. Federation recommendations

Refining the F1 plan with grammar-aware specifics:

### 10.1 Initial extraction targets — refined

Per F1 §6, F2 targets ~30–40 foundational tricks. With grammar visibility, the prioritization sharpens:

| Priority | Target | Field(s) | Why |
|---|---|---|---|
| 1 | Pure-base tricks where IFPA has Tier 1 notation authored | name + aliases + operational_notation_raw | Lowest conflict risk; tests grammar normalizer |
| 2 | Single-modifier compounds (e.g. paradox-X) | same | Confirms the Same/Op + In/Out + side-suffix grammar |
| 3 | Multi-modifier compounds where ADD math is uncontroversial | same | Stresses the component-flag stacking normalization |
| 4 | Tricks with `(rooted)` / `(no plant while)` flags | same | Validates pre-move state flag handling |
| 5 (defer) | Cross-reference rows like Arcwalk (`Frigidosis > ...`) | same + referenced_trick(s) | Requires Frigidosis itself in corpus first |
| 6 (defer) | Convention-divergent rows (ALL-CAPS+brackets style) | same | Tests dual-convention normalizer |

### 10.2 Workbook integration — operational-specific

The Tricks sheet R1 schema reserves `operational_notation` and `operational_notation_status` columns (currently empty / `not-applicable`). After F2+F3:
- `operational_notation` populates from the normalized form of the FM string (per §8).
- `operational_notation_status` enum extends to: `authored / fmoves-derived / pending / conflicted-with-fm`.
- A new optional column `operational_notation_fm_raw` carries the verbatim FM string for audit; rendered as italic in workbook diff views.

The External Reconciliation sheet's per-trick fmoves row carries:
- `fm_name_primary`
- `fm_name_canonical` (line 2 of FM block)
- `fm_name_aliases` (CSV-joined)
- `fm_operational_raw`
- `fm_adds`
- `fm_side_variant` (`""` / `"same"` / `"opposite"` from ss/os parsing)

### 10.3 Conflict classes — operational-specific extensions

The existing `notation_conflict` reconciliation state (per F1 §5) splits into operational sub-states:

| State | Trigger |
|---|---|
| `notation_conflict` (existing) | Semantic IFPA notation differs from FM canonical name's modifier composition |
| `op_notation_only_fm` | FM has operational notation; IFPA has none (this is the **common case** initially) |
| `op_notation_diverges` | Both have operational notation, normalized forms differ |
| `op_notation_convention_drift` | FM uses one convention; another row uses the other (both presumably for the same trick — only happens if FM has multiple versions of the same trick) |

`op_notation_only_fm` is **not a conflict** — it's a coverage gap that operational-notation extraction fills. Routes to `auto_resolved` for adjudication; curator decides whether to author IFPA-side operational notation copying / adapting FM's.

### 10.4 What the federation pipeline does NOT do with operational notation

- **Never** auto-write FM operational notation into IFPA's `notation` column (that's the SEMANTIC field; FM's data is OPERATIONAL — wrong layer).
- **Never** auto-derive IFPA semantic notation from FM operational. The two layers carry different information; bridging requires editorial judgment.
- **Never** use FM operational to "validate" IFPA ADD math (FM's ADD may differ; FM's notation may carry an extra `(XDEX)` flag IFPA doesn't recognize). ADD math validation is parser+editorial territory.
- **Never** auto-resolve a conflict between two FM convention shapes. If found in the wild, surface to curator.

### 10.5 What's safe to surface from FM grammar today

- Names + aliases, after curator review (per F1 §8 boundaries)
- Operational notation strings, normalized but not interpreted
- Side-variant info (ss/os) as alias candidates
- Cross-reference structural shorthand presence (one observed: Frigidosis), reported as a structural property of the FM corpus

---

## 11. Open questions surfaced for follow-up

1. **Frigidosis + cross-references.** Is the `Frigidosis > ...` shorthand a regular grammatical feature or a one-off? Need the Frigidosis row to confirm.
2. ~~**Blur entry.**~~ **RESOLVED — integrated 2026-05-10.** FM canonical = "Blurry Mirage" (1-modifier compound, +2 rot reading); IFPA pt10 = "Stepping Paradox Mirage" (2-modifier compound, flat-+1). **Confirmed ontology-conflict case** — see §5.1. Operational structure (`Clip > Op In (DEX) >> Op In (DEX)(PDX) > Op Toe (DEL)`) arguably reads more naturally as the IFPA decomposition. Routes to `needs_red`.
3. **(XDEX) usage.** Red pt1 narrowed X-Dex to "specific named tricks" only. FM uses `(XDEX)` more broadly (multiple non-atom-smasher rows). Does FM's `(XDEX)` mean the same thing IFPA's xdex modifier means, or has it drifted to "any X-rotation dex"?
4. **`PS` abbreviation.** "PS Whirl" in canonical names — is this only used for Paradox Symposium, or does FM use other community-canonical abbreviations like `BS` (= Blurry Symposium per the existing IFPA aliases table)?
5. **Convention drift.** The Stepping Ducking PS Whirl row uses ALL-CAPS+brackets; does this happen elsewhere? Is there a slow-moving convention shift inside FM toward IFPA's style?
6. **Notation gaps.** ~16% of sampled rows (8/50) have no operational notation. Is this consistent across the corpus, or concentrated in certain ADD bands / categories?
7. **Blurry rotational column.** FM's "Blurry Mirage" math relies on `blurry add_bonus_rotational=2` — the same value pt10 retired for spinning/swirling. pt10's question scope was narrow (only spinning/whirling/swirling); blurry/atomic/furious retain their +2 rotational columns. Whether blurry's +2-on-rotational is still authoritative may surface for future Red review if ontology-conflict cases like Blur surface frequently.

These are not blockers; they're refinement questions for F3+ and beyond.

---

## 12. What this document explicitly does NOT do

- **No parser integration proposed.** Forever-rule preserved.
- **No DB schema changes.** Existing R1 reservations cover the columns.
- **No bulk scraping.** F0 is reconnaissance only; F2 will be ~30–40 row foundational pull.
- **No ontology rewrites.** FM's structural decomposition claims are evidence, not authority.
- **No alias auto-import.** Names from FM go through curator adjudication.
- **No ADD value auto-import.** Conflicts route to needs_red.
- **No operational notation rendered on public IFPA pages yet.** Coexistence display (per §4) is R4+ workbook surface; public site rollout is much later.
- **No precommitment to specific normalization choices.** §7 / §8 are recommendations; finalization waits on broader corpus visibility (F2 results).

---

## 13. Cross-references

- `exploration/footbagmoves-federation/` — this directory holds federation-track planning artifacts (this is the first)
- `exploration/freestyle-notation-grammar/PROPOSAL.md §9` — comparative table that motivated federation
- `exploration/freestyle-notation-grammar/NOTATION_STYLE_GUIDE.md` — IFPA semantic-notation style guide; ALL-CAPS+brackets convention reused above
- `exploration/freestyle-notation-grammar/NOTATION_CORPUS_BOOTSTRAP_PLAN.md` — defers FootbagMoves ingestion to Tier 4 historically; this analysis updates that to phased federation
- `legacy_data/scripts/build_fborg_reconciliation_xlsx.py` — workbook generator with the reserved `fbmoves` SOURCES placeholder
- `legacy_data/inputs/curated/tricks/footbagmoves-sample.txt` — source corpus for this analysis
- `feedback_parser_editorial_separation.md` (memory) — forever-rule on parser/editorial separation; respected throughout
- `project_freestyle_workbook.md` (memory) — workbook architecture R1 state, R2/R3/R4 deferred phases

## 14. Suggested next-step decisions

1. Approve normalization conventions (§7 + §8) as the working canonical shape for operational notation across the federation?
2. Confirm scope for F2 foundational scrape (per §10.1 prioritization)?
3. When ready, paste the **Blur** + **Frigidosis** rows so this doc can integrate them and produce a complete worked-example set?
4. Defer or proceed with reconciliation-state additions (`op_notation_only_fm` etc.) per §10.3?

Awaiting answers. No code, scrapes, or DB changes pending.
