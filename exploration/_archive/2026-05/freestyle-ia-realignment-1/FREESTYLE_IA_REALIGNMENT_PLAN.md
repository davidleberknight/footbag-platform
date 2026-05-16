# Freestyle IA Realignment 1 — Plan

Generated 2026-05-14. Pre-implementation planning artifact. NO code changes performed by this slice; this document is the approval gate per Part 5 of the task spec.

## TL;DR

Twelve surface-level changes across four files plus one anchor-registry update, grouped under five themes:
1. Retire the "three layers" framing on landing + glossary.
2. Restructure landing intro into "Basic Components → Core Tricks" using the pb-ss1/ss2/ss3 directional guidance.
3. Correct three documented ontology errors: Symposium operator-board action, PDX flag wording, foundational-tricks list (remove pixie + fairy; add orbit).
4. De-duplicate operator taxonomy across landing / glossary / learn / educational-pathways.
5. Reframe dictionary IA (single "Browse tricks" entry; faceted filters live inside, not as parallel pillars).

Source-of-truth attribution is enumerated per change so the approver can see which lines come from existing site canon, which come from PassBack glossary adaptation, and which remain unresolved.

---

## Approval-by-artifact-path

Every change below names: surface, exact file path, line range, current state, proposed state, source. Approve any subset; rejection is per-row.

Out of scope explicitly: no equivalence-chain additions, no new operator entries, no Q4 FM-vocab promotion, no Wave-1 pending topics, no aliasing or canonical-trick promotion, no DB writes, no canonical CSV mutation, no parser changes.

---

## PART A — Surfaces under realignment (current state map)

| # | Surface | File | Active anchor / lines |
|---|---|---|---|
| 1 | Freestyle landing template | `src/views/freestyle/landing.hbs` | Hero 3–9; "What is Freestyle?" 14–28; "Freestyle Reference" three-layer panel 69–87; portal cards 90–193; demonstration video block 47–62; "Browse tricks" + "Browse by component" CTAs 130–131 |
| 2 | Freestyle landing service shaping | `src/services/freestyleService.ts` | `getLandingPage()` 4005–4077; intro paragraph hardcodes 4044–4050 |
| 3 | Glossary template | `src/views/freestyle/glossary.hbs` | Preamble + three-layer framing 19–48; §3 op-board 102–162; modifier-reference dl 121–136 (currently render-disabled per [[feedback_modifier_public_visibility]]); intermediate-operators dl 138–161; operational-glossary dl 326–339 (PDX wording at line 336); foundational tricks §10 403–428; connective panels §13 455–500 |
| 4 | Glossary service shaping | `src/services/freestyleService.ts` | `getGlossaryPage()` 3801–3851 |
| 5 | Operator board partial | `src/views/partials/operator-board.hbs` | 1–34 (logic-light; data-driven from `OperatorBoardData`) |
| 6 | Operator board service | `src/services/freestyleService.ts` | `getOperatorBoard()` 3942–4003; Symposium action string at 3987 |
| 7 | Learn index | `src/views/freestyle/learn.hbs` | 1–52 (consumes operator board); `buildSymbolicLearnIndex()` in service |
| 8 | Trick dictionary template | `src/views/freestyle/tricks.hbs` | "By component" subnav line 61; component link line 148 |
| 9 | Foundational-tricks anchor registry | `src/services/glossaryAnchors.ts` | `FOUNDATIONAL_TRICK_TERMS` 32–45 — current 12: clipper, mirage, legover, pickup, illusion, whirl, butterfly, swirl, osis, pixie, fairy, around-the-world |
| 10 | Curator-core-atom memory canon | (memory) | [[project_freestyle_core_atoms]] — toe-stall, clipper-stall, around-the-world, **orbit**, legover, pickup, mirage, illusion, butterfly, osis, whirl, swirl |
| 11 | Connective panels service | `src/services/freestyleService.ts` | `buildGlossaryConnectivePanels()` (called at line 3850; impl elsewhere) |
| 12 | Connective panels integration tests | `tests/integration/freestyle.glossary-connective-panels.routes.test.ts` | All 6 panels assertions |
| 13 | Operator-reference content | `src/content/freestyleOperatorReference.ts` | 10 entries after S1 (Inspinning added 2026-05-14) — not edited by this slice; referenced for cross-link integrity |
| 14 | PassBack glossary source | `legacy_data/inputs/curated/tricks/passback-glossary.txt` | Symposium line 185; Paradox lines 218–221; Hippy/Leggy line 160; Symple line 188; Muted line 194; Alpine line 269 |
| 15 | VIEW_CATALOG | `docs/VIEW_CATALOG.md` | Lines 301–306, 399–404 — doc-sync target after implementation |

---

## PART B — Authority boundaries (per Part 1 of the spec)

Restate explicitly so each change can be checked against the boundary:

| Surface | Owns | Does NOT own |
|---|---|---|
| Landing | conceptual onboarding; movement-language overview; core compositional examples; curated inspiration | terminology definitions; canonical trick rows; semantic decomposition; full operator reference |
| Glossary | terminology; execution vocabulary; mechanics; concise conceptual definitions; operational concepts (PDX/XBD/[DEL] flag reference) | canonical trick browse; family topology rendering; semantic decomposition; lineage |
| Dictionary (`/freestyle/tricks`) | canonical trick definitions; family/component/topology browse; aliases/equivalences | conceptual onboarding; mechanics primer; operational-flag reference |
| Trick page | all notation surfaces (semantic + operational); equivalence chains; lineage; family context | conceptual onboarding |
| Operational notation | execution mechanics only | semantic structure; ADD weights; ontology |
| Semantic notation | compositional structure only | execution mechanics |

Forever-rule that constrains every change: the existing four-layer separation per [[project_glossary_v5_synthesis]] (canonical / educational / symbolic / operational) is preserved; nothing in this slice mixes layers.

---

## PART C — Section-by-section change set

Each change is a single approvable unit. Source attribution is one of: **CANON** (already shipped on the site or in an authoritative registry), **PB-ADAPT** (adapted from `passback-glossary.txt`), or **UNRESOLVED** (depends on a Red-pending question — DEFERRED by this slice).

### C-1. Landing — replace "What is Freestyle Footbag?" with "The Language of Freestyle Footbag"

**File**: `src/views/freestyle/landing.hbs:14–28`
**Service-side**: `src/services/freestyleService.ts:4044–4050` (intro paragraph hardcodes)

**Current**: an abstract prose intro ("Freestyle is the artistic / technical side… combining moves to build runs… etc."). Verbose and overlaps with glossary §2 + tutorials.

**Proposed**: replace with the pb-ss1 structure: a one-line lede, then two sub-sections (Basic Components, Core Tricks). Prose strictly secondary to visual cards.

Sub-section **"Basic Components"** (per pb-ss1 + pb-ss2):

| Component | Concise definition | Source |
|---|---|---|
| Contact | moment when the bag touches the body; start/end of most standard tricks | **PB-ADAPT** (pb-ss1) |
| Set | the launch action that initiates a trick | **CANON** (matches `getMovesPage()` set-notation framing in `freestyleService.ts:3893–3914`) |
| Dex | leg circling the bag while it's in the air; the "main" component | **PB-ADAPT** (pb-ss1) |
| Spin | rotation of the body | **PB-ADAPT** (pb-ss1) |
| Duck | head dipping under the bag | **PB-ADAPT** (pb-ss1) |
| Delay | controlled holding of the bag on the foot/body; primary catch surface | **CANON** ([DEL] operational flag in `glossary.hbs:330`) |

**Dex sub-fields** (must include per spec — render as small grid under the Dex card per pb-ss2):

| Sub-field | Value(s) | Source |
|---|---|---|
| Direction | in-out / out-in | **PB-ADAPT** (pb-ss2) |
| Movement type | hippy / leggy | **PB-ADAPT** (`passback-glossary.txt:160`); hippy = "dex motion from hip, thigh circles bag"; leggy = "dex motion from knee, calf circles bag" |
| Support type | regular / symposium | **PB-ADAPT** (pb-ss2) |

Rule: "Do not over-explain" (spec). Each value is the bare label; full mechanics are a glossary deep-link, not landing-page prose.

### C-2. Landing — new "Core Tricks" section (per pb-ss3)

**File**: `src/views/freestyle/landing.hbs` (new block; insertion point between Basic Components and existing demonstration block)
**Registry**: `src/services/glossaryAnchors.ts:32–45` UPDATE

**Current foundational list (12)**: clipper, mirage, legover, pickup, illusion, whirl, butterfly, swirl, osis, pixie, fairy, around-the-world.

**Proposed (11)**: clipper, mirage, legover, pickup, illusion, whirl, butterfly, swirl, osis, around-the-world, orbit. Diff = REMOVE pixie + fairy (they are set modifiers, not irreducible tricks); ADD orbit (per pb-ss3 + [[project_freestyle_core_atoms]]).

**Cross-registry check**: the curator-authoritative 12-atom memory registry has both toe-stall AND clipper-stall plus the 10 base tricks plus orbit. The user's spec list (11) maps to that memory registry minus toe-stall and minus the `-stall` suffix on clipper (i.e., clipper-the-trick, not clipper-the-stall). Reconciliation: the slice ALIGNS the public foundational-tricks list with the curator-canonical orbit-inclusive memory registry, while keeping Toe out of the trick-list (Toe lives in Basic Components → Contact stalls per pb-ss2, which already classifies it as a stall not a trick). **No new ontology invented.**

Card content per spec:

| Trick | Common alias | ADD | Concise semantic formula | Family role | Source |
|---|---|---:|---|---|---|
| clipper | — | 1 | clipper (delay primitive) | delay / set primitive | **CANON** (DB `freestyle_tricks`) |
| mirage | — | 2 | mirage | base trick | **CANON** |
| legover | DLO base | 2 | legover | base trick | **CANON** |
| pickup | — | 2 | pickup | base trick | **CANON** |
| illusion | — | 2 | illusion | base trick | **CANON** |
| whirl | — | 3 | whirl | rotational base | **CANON** |
| butterfly | — | 3 | butterfly | base trick | **CANON** |
| swirl | — | 3 | swirl | rotational base | **CANON** |
| osis | — | 3 | osis | base trick | **CANON** |
| around-the-world | **ATW** | 2 | around-the-world | base trick | **CANON** ([[project_freestyle_core_atoms]]); alias canonical |
| orbit | **reverse around-the-world** | (DB lookup) | reverse ATW | direction variant of ATW | **CANON** ([[project_freestyle_core_atoms]]); alias to verify against DB |

**Alias promotion clarification**: the spec says to "Promote BOTH" pairs as canonical aliases. Interpretation: render BOTH names on the card (e.g., "around-the-world / ATW") rather than burying one. This is a RENDERING change, not a `freestyle_trick_aliases` table write. Existing alias rows are read-only here.

**Unresolved sub-question (does not block the slice)**: orbit's ADD value should be confirmed by reading `freestyle_tricks` at implementation time; if absent, render the card with ADD=`—` and a small "pending dictionary entry" footnote rather than fabricating a value. **No silent invention.**

### C-3. Landing — demonstration section curation

**File**: `src/views/freestyle/landing.hbs:47–62`

**Current**: a single featured video block.

**Proposed**: preserve the four conceptual buckets named in the spec (routine, circle, sick3, shred30) but improve curation. Each bucket gets one curated demonstration with attribution.

Required per spec (and source attribution):

| Bucket | Curation rule | Selection method |
|---|---|---|
| Sam Conlon footage | **REQUIRED** by spec | implementation-time curator pick from existing media metadata |
| classic-circle demonstration | at least one | curator pick |
| artistic routine | at least one | curator pick |
| modern technical shred example | at least one | curator pick |
| educationally readable run | at least one | curator pick |

**Plan stance**: the plan recommends a `landingDemonstrations` shape in the service that returns an array of curated `{label, videoEmbed, attribution, conceptualBucket}` objects. The exact media IDs/URLs are a curator decision at implementation time. **The plan does NOT pick media in advance** — that would be improvisation. The slice ships the rendering scaffolding + the empty curated slots; the curator backfills.

### C-4. Landing — retire "Glossary, Dictionary, and Notation — three layers" framing

**File**: `src/views/freestyle/landing.hbs:69–87` ("Freestyle Reference" panel)

**Current**: three-column panel naming Glossary / Dictionary / Notation as parallel pillars and implying notation is a co-equal architectural layer.

**Proposed**: replace with concise three-link orientation that lists the three surfaces WITHOUT the "three layers" rhetoric. Suggested treatment: a single sentence linking to each surface in context. Example wording (CANON-adapted from existing glossary text, NOT new ontology):

> Plain-language definitions live in the [glossary](/freestyle/glossary). Canonical trick rows + family/topology browse live in the [dictionary](/freestyle/tricks). Symbolic shorthand for trick structures (set notation, semantic notation, operational notation) is documented on trick pages and at the [set notation reference](/freestyle/sets).

Note: this preserves discoverability for all three destinations without elevating notation to a co-equal architectural pillar. **Notation is one surface, not a governing philosophy.**

### C-5. Landing — dictionary IA cleanup

**File**: `src/views/freestyle/landing.hbs:130–131`
**Companion**: `src/views/freestyle/tricks.hbs:61, 148` (the in-dictionary navigation)

**Current** (landing CTA): two parallel buttons "Browse tricks" and "Browse by component".
**Current** (in-dictionary): "By component" subnav at line 61.

**Proposed**:
- Landing: replace the two parallel buttons with ONE primary button "Browse the trick dictionary" (or similar single-CTA wording). Faceted filters (family / component / operator / ADD / topology / notation / set / modifier) are surfaced INSIDE the dictionary, not promoted as parallel landing pillars.
- In-dictionary: keep the existing component-view subnav (line 61) as one of several filters; add other facets later (not in this slice). **Touch only the landing CTA in this slice.** The in-dictionary subnav is in scope conceptually but the spec only flags it for repositioning, not editing — defer the actual filter expansion to a follow-up.

### C-6. Landing — tutorials / learning de-duplication

**File**: `src/views/freestyle/landing.hbs` (portal-cards grid, 90–193)
**Operator-board appearance**: `landing.hbs:65–67`

**Current**: operator board renders on landing AND on glossary §3 AND on `/freestyle/learn`. Set/operator taxonomy thus surfaces three times in the public-facing flow.

**Proposed**: keep operator board on landing (it's the visual centerpiece of "movement-language overview"). REMOVE the operator-board partial from glossary §3 (`glossary.hbs:105`) — glossary §3 retains "How Tricks Are Built" prose + the intermediate-operators dl, but does NOT re-render the full operator-board partial. The board's natural home is the landing page as conceptual onboarding; glossary's job is terminology, not visual taxonomy.

Service-side implication: `getOperatorBoard('glossary')` call at `freestyleService.ts:3843` becomes unused; the surface key `'glossary'` in `OperatorBoardSurface` becomes dead code (separate removal: out-of-scope for this slice; flag for cleanup).

Educational-pathways (`/freestyle/learn`): keep the operator board there (its surface ROLE is teaching, distinct from landing's onboarding role). No change to `learn.hbs`.

**Risk**: removing the glossary §3 op-board may break tests that assert its presence in glossary HTML. Audit task: grep `tests/integration/freestyle.routes.test.ts` for `getOperatorBoard.*glossary` and `operator-board` assertions within glossary tests; update accordingly. Per [[testing rules]] the test changes ship in the same diff.

### C-7. Operator board — correct Symposium ontology error

**File**: `src/services/freestyleService.ts:3987`

**Current**:
```typescript
op('SYMP', 'Symposium', 'An illusion combined with body rotation.', 'SYMP + ILLUSION', 'FLAIL', GLOSSARY('symposium'), true)
```

**Proposed**: replace the third argument (the action-text string) with the PassBack glossary line 185 wording verbatim:

> A symposium component is one where an active leg performs an action in a single-leg jump: the symposium leg jumps and lands on its own while the other leg remains in the air.

Source: **PB-ADAPT** (`passback-glossary.txt:185` — quoted directly).

The remaining `op(...)` arguments (composition examples 'SYMP + ILLUSION' / 'FLAIL', the glossary deeplink, the pending-flag) stay as-is. The "SYMP + ILLUSION" composition example is incidentally similar to the old erroneous prose but the example is a valid composition demonstration, not a definitional claim — keep.

**Pre-condition**: the operator-board action text on the partial template should accommodate the longer string (it currently does — check rendered width at implementation). If wrapping is ugly, the prose can be split into two lines via partial layout; do NOT shorten the wording.

### C-8. Operator board — verify Atomic / Fairy / Quantum descriptions do not invent unresolved semantics

**File**: `src/services/freestyleService.ts:3963–4002`

**Action**: at implementation, READ the current `op(...)` calls for Atomic, Fairy, Quantum, Pixie, Blender. For each:
- If the action text states a decomposition or ADD weight that is NOT in [[project_red_consultation_state]] `RED_RESOLVED_CANON.md`, flag for surgical edit to non-speculative wording.
- If the text is already conservative ("a set treatment with X character"), leave it.

**Pre-implementation expectation**: most are already conservative per the operator-board's deliberate "Tier-1 vocab" scope. Atomic specifically may need a check given Wave-1 atomic-set polysemy is open. **No invention; only redaction of any speculative claim.** Source: **CANON** (existing wording where conservative); minor PB-ADAPT for any rewording, sourced from `passback-glossary.txt` if available.

### C-9. Glossary — retire "Glossary, Dictionary, and Notation — three layers" framing

**File**: `src/views/freestyle/glossary.hbs:29` (heading) and 30–43 (bulleted layer definitions)

**Current**:
```html
<h3 class="section-heading">Glossary, Dictionary, and Notation — three layers</h3>
```
…followed by bulleted layer definitions.

**Proposed**: replace with a one-paragraph glossary intro that says what the glossary IS (terminology + execution vocabulary + concise concepts) and links to dictionary + set-notation reference WITHOUT the three-layer rhetoric. Suggested wording:

> This glossary defines the terminology used across the freestyle surfaces — execution mechanics, run quality, and the compositional vocabulary by which trick names are built. Canonical trick rows and faceted browse live in the [dictionary](/freestyle/tricks). The set-notation reference is at [/freestyle/sets](/freestyle/sets).

Source: **CANON** (re-uses existing glossary language patterns).

### C-10. Glossary — fix PDX flag wording ("paradox direction")

**File**: `src/views/freestyle/glossary.hbs:335–336`

**Current**:
```html
<dt id="op-flag-pdx"><code>[PDX]</code></dt>
<dd>Paradox component — the dex is performed in the paradox direction. Equivalent to the <code>paradox</code> body modifier in semantic notation.</dd>
```

**Proposed** (operational-flag adaptation of the user's stronger wording):
```html
<dt id="op-flag-pdx"><code>[PDX]</code></dt>
<dd>Paradox component — flags a cross-body far dex that requires a hip-pivot repositioning. Operationally summarized as <code>CLIP &gt; OP IN [DEX]</code> (clipper set, far in-out dex). Equivalent to the <code>paradox</code> body modifier in semantic notation.</dd>
```

Source: **PB-ADAPT** (`passback-glossary.txt:218` — "special type of far dex; previous component was Xbd (usually Clipper set); dex requires hip pivot"). The notation snippet (`CLIP > OP IN [DEX]`) matches the existing operational-notation conventions in `freestyleService.ts:3907` (Blurry = "CLIP > OP IN [DEX] > OP OUT [DEX] > (op side)") and is consistent.

**Companion change in modifier-reference dl** (`glossary.hbs:126–127`): the current "term-paradox" definition reads "A hip pivot between two dexes on the same set. +1 body modifier..." — this is the SEMANTIC paradox definition and is conservative + accurate. **No change to line 127.** The fix targets only the operational-flag wording at line 336. Per [[feedback_modifier_public_visibility]] the modifier-reference dl is render-disabled anyway; lines 126–127 are not user-visible.

### C-11. Glossary — Jobs notation re-emphasis

**File**: `src/views/freestyle/glossary.hbs` (Jobs notation section; exact lines TBD at implementation — likely §4 or §5)

**Current state to verify**: implementation should locate the existing Jobs-notation explanation and read it before editing.

**Proposed direction** (per spec):
- Reframe from "notation philosophy" to **symbolic compression / readable shorthand / compositional visibility**.
- Concrete example: show a long compositional trick name compressing to its symbolic form (e.g., "Stepping Paradox Mirage → BLR M" — using the resolved-canon Blur decomposition).
- Keep under 4 short lines + one worked-example block.

Source: **CANON** (uses pt11 Blur = Stepping Paradox Mirage; no new ontology).

### C-12. Glossary — Foundational Tricks section synchronization

**File**: `src/views/freestyle/glossary.hbs:403–428`
**Companion**: `src/services/glossaryAnchors.ts:32–45`

**Current**: 12 `<li id="term-{slug}">` entries: clipper, mirage, legover, pickup, illusion, whirl, butterfly, swirl, osis, pixie, fairy, around-the-world.

**Proposed**: align with the C-2 core-trick list (11 entries: drop pixie + fairy; add orbit). Each entry gets a concise formula + alias + family role per spec. The `<li>` markup will need to be richer (currently bare term anchors); proposed inline-card pattern keeps it visually concise.

Anchor-registry change: `FOUNDATIONAL_TRICK_TERMS` in `glossaryAnchors.ts:32–45` must mirror the rendered list exactly. The `glossaryHrefForTerm()` lookup at line 66 relies on this set; removing pixie/fairy from FOUNDATIONAL_TRICK_TERMS means deep-links to `term-pixie` / `term-fairy` from elsewhere will resolve differently. **Cross-link integrity check**: grep `term-pixie` and `term-fairy` site-wide before removing — if other anchors point at them, the implementation must redirect those anchors to a still-existing target (likely an in-glossary modifier section, since pixie/fairy are set modifiers).

**Pre-implementation audit**: locate every `term-pixie` and `term-fairy` referent and route appropriately. If any referent expects pixie/fairy at the foundational anchor, the redirect target is `#term-pixie` / `#term-fairy` rendered within the operator-reference dl at glossary.hbs:142–161 (where pixie/fairy don't currently appear — they're set modifiers on the operator board, not intermediate operators). Surface this gap for resolution; one safe option is to add pixie/fairy as glossary-modifier entries in the existing modifier-reference dl (which is render-disabled, but anchor-resolvable).

### C-13. Glossary — incorporate PassBack-quality explanations

**File**: `src/views/freestyle/glossary.hbs` (new entries in appropriate sections)

**Plan**: ADD glossary entries for the terms the spec names, each adapted from `passback-glossary.txt` with explicit source attribution in a `lineageNote` style. Maximum 1–2 sentence prose per entry. Integration "thoughtfully" means: no wall-of-text dump; one paragraph + one example.

| Term | PassBack source line | Proposed glossary section | Source attribution rendered? |
|---|---:|---|---|
| Alpine | 269 | new in §6 (Play Quality & Style) | yes — "per PassBack glossary" |
| Symple | 188 | new in §3 modifier-reference dl OR new intermediate-operator entry | yes |
| Muted | 194 | new in §6 | yes |
| Dex windows | TBD (verify location) | new conceptual subsection in §3 | yes |
| Hippy vs Leggy | 160 | new in §3 (under Dex sub-fields, mirrored from C-1 landing) | yes |
| Trick phases | TBD (Uptime / Midtime / Downtime per pb-ss2) | new conceptual subsection in §3 | yes |
| Side relationships | pb-ss2 (Same side / Opposite / PDX) | new conceptual subsection in §3 | yes |
| Paradox (mechanical explanation) | 218–221 | EXPAND existing term-paradox entry at line 127 (currently hidden — see [[feedback_modifier_public_visibility]]) | yes |
| Technical names vs shorthand | 260 | new in §4 Naming & Evolution | yes |

Source: **PB-ADAPT** for all. Each entry must cite "per PassBack glossary" in its rendered text or via a small lineage line.

**De-duplication discipline**: where a term overlaps with an operator-board operator (e.g., Symposium, Paradox, Spinning), the glossary's role is mechanical/execution detail; the operator board's role is compositional vocabulary. Both surfaces may reference the same term but should not repeat each other's content. The glossary is the deeper-mechanics surface.

### C-14. Connective panels — re-position conceptually (no code change in this slice)

**File**: `src/views/freestyle/glossary.hbs:455–500`; `src/services/freestyleService.ts:3850`

**Per spec**: "Do NOT delete them in this slice. But: begin repositioning them conceptually as dictionary educational views / family/topology exploration surfaces."

**Plan**: zero code change. Add a small in-glossary section heading note that signals the conceptual shift:

> Note: these connective panels are migrating to the dictionary in a future slice; they will be repositioned as family/topology exploration surfaces inside `/freestyle/tricks` rather than glossary entries.

Source: **CANON** (this is internal architectural messaging; matches the existing `connective-panels` heading at glossary.hbs:458). No data change; no test change.

### C-15. doc-sync (deferred to implementation slice)

**Files**: `docs/VIEW_CATALOG.md:301–306, 399–404` and possibly `docs/USER_STORIES.md` (verify at implementation).

**Per `add-public-page` skill trigger**: this slice touches public templates + route-level tests, so doc-sync is mandatory AFTER implementation. The doc-sync deliverable is part of the implementation slice, not this planning slice.

VIEW_CATALOG updates expected:
- Landing entry: note new "Language of Freestyle Footbag" intro structure with Basic Components + Core Tricks subsections.
- Glossary entry: note that operator-board partial is removed from §3; note that the three-layer framing has been retired.

USER_STORIES update expected: review whether any story relies on the three-layer framing or on pixie/fairy being foundational tricks. If so, update the story; otherwise leave.

---

## PART D — Source-attribution summary (Part 5 deliverable item 2)

Every definition or wording change in this slice is sourced from one of three categories. The slice introduces ZERO definitions that fall outside these three. If a definition cannot be traced to a row below, it does not ship.

### D-1. Existing site canon (CANON)

These come from the current codebase, the curator-authoritative memory registry, or already-resolved Red rulings. No new ontology.

| Definition / wording | Source |
|---|---|
| Set as a basic component | `freestyleService.ts:3893–3914` (`getMovesPage()` set-notation entries) |
| Delay as a basic component | `glossary.hbs:330` ([DEL] operational-flag definition) |
| Foundational tricks list (post-realignment 11 entries) | [[project_freestyle_core_atoms]] memory registry |
| ATW = around-the-world alias | DB `freestyle_trick_aliases` (verify at implementation) |
| Orbit = reverse around-the-world | [[project_freestyle_core_atoms]] |
| Three-link orientation replacement wording | reused glossary phrasing (no new claims) |
| Jobs notation worked example (Blur compression) | pt11 resolved canon ([[project_red_consultation_state]] `RED_RESOLVED_CANON.md` C.1) |
| Connective-panel repositioning notice | internal architectural messaging |
| VIEW_CATALOG updates | derived from implemented changes |

### D-2. PassBack glossary adaptation (PB-ADAPT)

These are adapted (sometimes quoted verbatim) from `legacy_data/inputs/curated/tricks/passback-glossary.txt`. Each rendered surface must include a source line.

| Definition / wording | PassBack source line | Verbatim vs adapted |
|---|---:|---|
| Contact (basic component) | pb-ss1 (graphic; matches glossary spirit) | adapted |
| Dex (basic component) | pb-ss1 | adapted |
| Spin (basic component) | pb-ss1 | adapted |
| Duck (basic component) | pb-ss1 | adapted |
| In-out / out-in (dex direction) | pb-ss2 | bare labels |
| Hippy / Leggy (dex movement type) | line 160 | adapted |
| Regular / Symposium (dex support type) | pb-ss2 | bare labels |
| Symposium full definition (operator-board fix) | line 185 | **verbatim** |
| Paradox mechanical explanation (PDX flag fix) | lines 218–221 | adapted |
| Alpine | line 269 | adapted |
| Symple | line 188 | adapted |
| Muted | line 194 | adapted |
| Dex windows | TBD line | adapted |
| Trick phases (Uptime / Midtime / Downtime) | pb-ss2 | adapted |
| Side relationships (ss / op / pdx / near / far) | pb-ss2 | adapted |
| Technical names vs shorthand | line 260 | adapted |

### D-3. Unresolved — explicitly deferred from this slice (UNRESOLVED)

These topics surface in the spec or in the surrounding ontology audit but are pending Red Wave 1 / Wave 2 per [[project_red_consultation_state]]. The slice MUST NOT pre-resolve them.

| Topic | Status | Where it lives |
|---|---|---|
| Operator-board Atomic action text — atomic-set polysemy | Wave 1 Q4 pending | C-8 (audit; conservative rewording only, no decomposition claim) |
| Atomic ADD rotational policy | Wave 1 Q1 pending | not surfaced on any user-facing card in this slice |
| Furious non-rotational reading | Wave 1 Q1c pending | not surfaced |
| Q4 FM-vocab modifiers (Fairy-as-modifier, gyro, barraging-FM, etc.) | Wave 1 Q2 pending | not surfaced (fairy as a set-modifier on the operator board remains conservative; no compositional claim) |
| Far / Reverse positional weights | Wave 1 Q3 pending | not surfaced (mentioned in PDX flag wording only as direction terminology, not as ADD claim) |
| Atomic-set polysemy / +1 systemic gap | Wave 1 Q4 pending | not surfaced |
| Orbit ADD value | DB lookup at implementation | C-2 (render `—` + footnote if DB lacks the row) |
| Sailing decomposition (legacy vs FM cross-source conflict) | curator triage pending | not surfaced |
| Frantic / Leaning / Hyper / Bling Blang | Wave 2 Theme 8 | not surfaced |
| Witchdoctor / Frigidosis / Scrambled Eggbeater decompositions | Wave 2 Theme 2 | not surfaced |
| Down-family canonicalization | Wave 2 Theme 6 | not surfaced |
| Connective-panel relocation to dictionary | future slice | C-14 (preview note only, no relocation) |

---

## PART E — Duplications being eliminated

| Duplication | Currently appears in | This slice removes from |
|---|---|---|
| Operator board / set-modifier taxonomy | landing.hbs:65–67, glossary.hbs:105, learn.hbs:29 | glossary.hbs (C-6: remove the §3 partial include) |
| "Three layers" framing of Glossary / Dictionary / Notation | landing.hbs:69–87, glossary.hbs:29–43 | both (C-4 and C-9) |
| Foundational trick list (FOUNDATIONAL_TRICK_TERMS vs glossary §10 vs landing implicit) | glossaryAnchors.ts, glossary.hbs:413–425 | not removed; SYNCHRONIZED (single source: glossaryAnchors.ts; glossary §10 renders from it; landing renders from it) |
| "Browse tricks" + "Browse by component" as parallel pillars | landing.hbs:130–131 | landing (C-5: single CTA) |
| Dex / Hippy / Leggy explanations (currently absent on landing) | not duplicated; net new | added to landing (C-1) AND glossary (C-13) — but with role separation: landing = concise visual; glossary = mechanical detail |
| Symposium description | operator-board action text vs glossary connective-panel text | operator board corrected (C-7); connective panel stays |
| Paradox description ("paradox direction" wording) | glossary.hbs:336 (PDX flag) vs glossary.hbs:127 (semantic modifier, hidden) | only the PDX flag text edited (C-10); semantic modifier left as-is |

---

## PART F — Obsolete framing being retired

| Framing | Surface | Replacement |
|---|---|---|
| "Glossary, Dictionary, and Notation — three layers" | landing.hbs:69–87 + glossary.hbs:29 | concise three-link orientation; no "three layers" rhetoric |
| "Browse by component" as a parallel pillar to "Browse tricks" | landing.hbs:131 | single "Browse the trick dictionary" CTA; component-browse becomes one in-dictionary filter |
| Pixie + Fairy as foundational tricks | FOUNDATIONAL_TRICK_TERMS + glossary §10 | reclassified as set modifiers (where they already live in operator-board taxonomy); foundational list reframes around irreducible base tricks |
| "What is Freestyle Footbag?" abstract prose | landing.hbs:14–28 | "The Language of Freestyle Footbag" — Basic Components → Core Tricks structure |
| Symposium = "illusion combined with body rotation" | freestyleService.ts:3987 | PassBack single-leg-jump definition (verbatim from line 185) |
| "Paradox direction" weak wording | glossary.hbs:336 | hip-pivot + cross-body-far-dex framing |

---

## PART G — Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Removing pixie/fairy from `FOUNDATIONAL_TRICK_TERMS` breaks deep-links from other surfaces | medium | Pre-implementation grep for `term-pixie` / `term-fairy` referents; redirect each to a still-existing anchor (likely operator-reference dl) — see C-12 |
| R2 | Removing operator-board partial from glossary §3 breaks existing tests | medium | Audit `tests/integration/freestyle.routes.test.ts` for operator-board assertions in glossary tests; update assertions in the implementation diff per [[testing rules]] |
| R3 | Orbit may not exist as a `freestyle_tricks` row | low | Render with `—` for ADD + footnote "pending dictionary entry" rather than fabricating; flag for curator follow-up |
| R4 | Demonstration curation requires media that may not be in current `freestyle_media_*` tables | medium | Slice ships rendering scaffolding only; curator backfills actual media selections post-merge. Per [[feedback_paused_crosstrack_no_writes]] this slice does NOT write to `freestyle_media_*` |
| R5 | PassBack-adapted definitions may inadvertently introduce ontology claims | high | Every PB-ADAPT line in PART D-2 must be verified verbatim/near-verbatim at implementation; the slice does NOT paraphrase mechanics in ways that drift from PassBack source |
| R6 | Modifier-reference dl (currently hidden per [[feedback_modifier_public_visibility]]) is still anchor-resolvable; expanding it (C-13 paradox row) must not re-enable rendering | low | Edits to the hidden dl ship; visibility CSS/template logic untouched. Explicit verification at implementation: `grep -rn "glossary-modifier-reference"` for hide rules; preserve all of them |
| R7 | Removing "three layers" framing leaves a discoverability gap for the set-notation page | low | C-4 + C-9 replacement wording explicitly links to `/freestyle/sets`; landing portal-cards grid (lines 90–193) still surfaces dictionary + glossary individually |
| R8 | doc-sync drift: VIEW_CATALOG.md entries 399–404 still describe operator-board presence on glossary §3 after C-6 removes it | medium | doc-sync runs as part of the implementation slice (C-15); VIEW_CATALOG entries updated then |
| R9 | Cross-link integrity: removing pixie/fairy from foundational list may break trick-page glossary deep-links from canonical trick rows that mention pixie/fairy in their notation | medium | Audit `freestyle_tricks` rows whose `notation` or display includes pixie/fairy as tokens; verify token resolution still routes to a glossary entry (the operator-reference dl) — see [[project_symbolic_ux_rollout]] Phase 6 token-glossary-linking work for cross-reference |
| R10 | "The Language of Freestyle Footbag" framing implies a more formal pedagogy than the site currently has — risk of over-promising | low | Keep prose concise (per spec); the framing is structural (Basic Components → Core Tricks), not pedagogical-claim-making |

---

## PART H-pre — Compact symbolic object rendering rule (cross-cutting; added 2026-05-14 maintainer direction; refined 2026-05-14 mid-Batch-2)

Every trick-card and browse-object rendering across the freestyle surfaces (Core Tricks on the landing page, dictionary-trick-card partial on `/freestyle/tricks` and its faceted views, equivalence-chain renderings on trick pages, future browse facets) renders as a **symbolic object** with the following structural layers:

1. `#slug` — canonical identity. Always present. Rendered first.
2. `≡ <reading>` — zero or more semantic-equivalence readings. Each reading is one pedagogically meaningful stopping-depth statement. Multiple `≡` lines render different stopping depths when both are useful.
3. Symbolic notation — optional operational form (e.g., `[osis] > same out dex > [osis]`). Omitted when the `≡` readings already convey the symbolic structure.
4. ADD — integer value. Always present (or `—` with a pending footnote when DB row is missing).

**Examples (maintainer-authoritative):**

```
#torque
≡ miraging osis
[osis] > same out dex > [osis]
4
```

```
#mobius
≡ spinning ss torque
≡ spinning ss miraging osis
5
```
(no symbolic-notation line; the second `≡` is the symbolic expansion)

```
#orbit
≡ reverse around-the-world
toe > reverse dex > toe
2
```

```
#toe-stall
[set] > toe
1
```
(atom: no `≡` line; the canonical name IS the irreducible identity)

**Stopping-depth philosophy:**

- Do NOT force maximal recursive decomposition. A `≡` reading stops at a pedagogically meaningful intermediate operator (e.g., `≡ miraging osis` is sufficient; expanding miraging further would just add noise).
- When two stopping depths are both useful, surface both as separate `≡` lines. The reader chooses.
- Use accepted intermediate operators (those in `freestyleOperatorReference.ts`) as natural stopping points.
- Atoms have zero `≡` lines. Their canonical identity is the irreducible token.

**Visual feel (browse layer):**

- Elegant, compositional, symbolic, alive.
- NOT sterile, tabular, database-like.
- Monospace typography for `#slug`, symbolic-notation, and ADD (the symbolic surface).
- Italic or variant typography for `≡` readings (the compositional vocabulary surface).
- Airy spacing; each line has typographic role distinction.
- No row borders, no zebra stripes, no inline column headers, nothing that suggests a database table.

**Layer separation (forever-rule):**

- **Browse layer** = symbolic object. Compact. Lines per the structure above. No prose.
- **Expanded layer** = educational narrative. Lives on trick-detail pages, modifier-pedagogy pages, glossary panels, learn pathways. Verbose, illustrative, story-shaped.

Educational prose MUST NOT drift back into compact browse surfaces. If a card needs prose to explain itself, the prose belongs on the trick-detail page, not on the card. Symbolic-object cards stay symbolic.

**Honest rendering:**

- When a field is unknown (e.g., ADD not yet in DB for a recently-promoted slug), render `—` with a small footnote on the card group rather than fabricating a value or omitting the slot.
- No invented data. Every `≡` reading and every symbolic-notation string is sourced from existing canonical sources (`freestyle_tricks.notation`, `freestyle_tricks.operational_notation`, `RED_RESOLVED_CANON.md`, `freestyleOperatorReference.ts`).
- When stopping-depth would require a Wave-1-pending operator (e.g., atomic-with-rotational-bonus), the card uses a stopping depth that does NOT depend on the pending question.

**Applies to:**

- Batch 2 Core Tricks render on landing (this slice).
- The existing dictionary-trick-card partial on `/freestyle/tricks` and faceted views (Batch 4 typography polish will normalize).
- Future browse facets / equivalence-chain renderings.

This rule is the load-bearing invariant for the "compact symbolic browse treatment" item in Batch 2 and the typography/layout polish in Batch 4.

---

## PART H — Out-of-scope / explicit non-asks

Per the user's PART 4 non-negotiable rules, this plan explicitly does NOT propose:

- Any new ADD semantics or operator weights.
- Any auto-promotion of aliases beyond the rendering treatment for ATW + reverse-ATW (which surface existing canon, not new alias rows).
- Auto-generation of symbolic chains or decomposition strings.
- Flattening of semantic vs operational notation distinctions.
- Any change to `freestyle_tricks` ADD values, decomposition strings, or stated values.
- Any movement of Wave-1 pending topics into shipped surfaces.
- Any change to the connective panels' data shape or rendering (C-14 is a preview note only).
- Any change to `OPERATOR_REFERENCE_ENTRIES` content beyond what S1 already shipped (Inspinning added 2026-05-14).
- Any change to `freestyle_trick_aliases` rows.
- Any change to the parser or notation-grammar layer.
- Any change to `freestyleEditorial.ts` history / pioneers content.

---

## PART I — Approval / next-step protocol

1. Approver reviews the change set in PART C row-by-row, accepting or rejecting each.
2. For any rejection, the row is dropped (no partial implementation of a rejected row).
3. For ambiguous items (e.g., the orbit ADD lookup, the modifier-reference dl visibility constraint, the connective-panel relocation timing), approver names the resolution before implementation begins.
4. Approver names the implementation-order grouping. Suggested grouping (smallest diffs first; each shippable in a single PR-equivalent commit):

   - **Batch 1 (low risk; mechanical)**: C-7 (Symposium fix), C-10 (PDX wording), C-9 (glossary three-layer retirement), C-4 (landing three-layer retirement)
   - **Batch 2 (registry sync)**: C-12 + C-2 anchor changes (FOUNDATIONAL_TRICK_TERMS update + glossary §10 sync + cross-link audit per R1)
   - **Batch 3 (landing restructure)**: C-1 (Basic Components), C-2 (Core Tricks render), C-5 (single CTA), C-6 (op-board removal from glossary §3)
   - **Batch 4 (glossary content expansion)**: C-13 (PassBack-quality additions)
   - **Batch 5 (notation re-emphasis)**: C-11 (Jobs notation), C-14 (connective-panel note), C-3 (demonstration scaffolding)
   - **Batch 6 (cleanup)**: C-15 (doc-sync), unused `OperatorBoardSurface` `'glossary'` key removal

5. Each batch ships with tests per [[testing rules]] and `npm run build` clean.
6. After approval, this plan moves from `exploration/freestyle-ia-realignment-1/` to the implementation slice; per project rule the assistant stages but never commits.

---

## Cross-references

- [[project_freestyle_core_atoms]] — curator 12-atom registry (basis for C-2 + C-12)
- [[project_red_consultation_state]] — Wave 1/2 pending topics (basis for PART D-3)
- [[project_symbolic_ux_rollout]] — DSC-2 + UX-SHIP-1 Phase 5 history (5-view dictionary ceiling, archetypes-belong-in-glossary rule)
- [[project_glossary_v5_synthesis]] — 12-section glossary v5 architecture (basis for de-duplication discipline)
- [[feedback_modifier_public_visibility]] — Modifier Reference render-disable constraint (basis for C-10 caveat)
- [[feedback_phased_scope_control]] — explicit phase preambles + tabular reports (the form of this document)
- [[feedback_verify_need_before_building]] — verify premise before building (each change premise here has been verified against current code state)
- [[feedback_public_facing_prose]] — strip curator-internal language from rendered prose (constrains PART D-2 wording)
- `passback-glossary.txt:185` — Symposium verbatim source for C-7
- `passback-glossary.txt:218–221` — Paradox source for C-10
- `RED_RESOLVED_CANON.md` C.1 — Blur compression example for C-11
