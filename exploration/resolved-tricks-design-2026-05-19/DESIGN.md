# Resolved / First-Class Trick Pages — Design Spec -- 2026-05-19

Architectural design for the comparative movement-language rendering system on trick-detail pages. Sets the criteria for "resolved" / "first-class" trick pages and the multi-notation coexistence pattern that distinguishes them from the basic dictionary surface.

**This document is a design deliverable, not implementation.** No code work begins until a slice is curator-approved.

---

## Executive summary

| What | Why |
|---|---|
| Define a **resolved-trick governance class** with the canonical formula `resolved = notation-complete + accounting-converged + doctrine-clean` (§6.0) | The dictionary is becoming a comparative movement-language reference system; resolution is governance completeness, not coverage |
| Gate promotion behind the **First-Class ADD Convergence Rule** — executable derivation = computed ADD = official ADD, no doctrine blockers (§6.0) | Stricter than computed-vs-official agreement; prevents promotion of tricks whose three-way arithmetic doesn't converge |
| Adopt a **2-row trick-page layout**: hero (name + compact notation + ADD chip) + secondary comparative metadata row (`JOB:` / `ADD:` / `VIDEO:`) in smaller font + collapsed detail (§2) | 2-row design keeps the page scannable; the primary identity stays visually dominant; comparative metadata is at-a-glance, not headline |
| Collapse operational + Job notation into a single `JOB:` row | Both share the ATAM lineage; a separate operational row creates redundancy without information gain |
| Soften the "Job notation unavailable" stance: **approximate / adapted Job notation acceptable** | The current 0% Job-notation populate rate forces blankness; lineage continuity is preferable |
| Rename UI labels for ADD math: **"ADD breakdown" / "ADD derivation"**, never "formula" | "Formula" is overloaded across Job notation, operational notation, shorthand, and executable accounting; the UI vocabulary should be unambiguous |
| Treat family / neighborhood / lineage / media as **soft signals**, never blocking | Singleton atoms (osis, butterfly, whirl) qualify without family; resolution is convergence + governance, not graph membership |
| Pilot scope (§6.4 + §7.4): **5 slugs** — osis, paradox-mirage, symposium-mirage, atomic-butterfly, ripwalk — behind a service-side allow-list for controlled rollout | Convergence rule narrows the qualifying pool; the 5 cover atomic flag-decomposition + +1-stack + folk-name-resolution variety |

---

## 1. Resolved trick architecture audit

### 1.1 Current notation surfaces on `/freestyle/tricks/:slug`

10 surfaces, all sequential, none comparative:

| # | Surface | Tier | Data field | Render state |
|---|---|---|---|---|
| 1 | Hero h1 + ADD chip | 1 | `trickName`, `dictEntry.adds` | ✓ universal |
| 2 | Hero decomposition strip (token chain below h1) | 1 | `heroDecomposition` | ✓ when ≥2 modifiers |
| 3 | Hero quick-stat formula one-liner | 1 | `heroFormula` | ✓ when non-modifier + numeric ADD |
| 4 | Compact / semantic notation block | 1 | `notationDisplay` (from DB `notation`) | ✓ when notation column populated (~100% of canonical) |
| 5 | Equivalent readings ladder (Layer 2) | 2 | `semanticNotation.layer='equivalence'` | ✓ when chain reading authored (~5-10% of tricks) |
| 6 | Base-lineage fallback ("Built on …") | 3 | `semanticNotation.layer='base-lineage'` | ✓ when base_trick set + no notation |
| 7 | Operational notation block (warm palette) | 2 | `operationalNotation` (from DB `operational_notation`) | ✓ when populated — **currently 1/166 tricks** (blur only) |
| 8 | Modifier-layering nested boxes | 1 | `modifierLayering` | ✓ when ≥3 modifiers (Montage only currently) |
| 9 | ADD-analysis disclosure (Phase B) | 4 | `addAnalysis` (from `RESOLVED_FORMULAS_SPRINT_1`) | ✓ when published — **currently 25/166 tricks** |
| 10 | Structural-decomposition diagnostic (parser) | 4+ | `notationGrammar` (incl. `jobsNotationRaw`) | ✓ when `structural_parse_json` populated; **`jobsNotationRaw` currently 0/166** |

### 1.2 The comparative gap

The user-facing problem: a visitor on `/freestyle/tricks/mobius` sees five separately-presented "names" for the same trick (Mobius, gyro torque, spinning ss torque, spinning ss miraging op osis, …) but no scaffolding explains that **these are coherent alternative descriptions of the same movement, surfaced through different representation systems**.

The first-class-trick design must make the reader understand:

> "Here are several coherent ways humans have described this movement."

Not:

> "Here is the One True Parse Tree."

### 1.3 Notation system map

Five systems coexist on canonical pages. Each has a distinct audience + tradition:

| System | Audience | Lineage | Example (Mobius) |
|---|---|---|---|
| **Compact / semantic** | Visitors learning the IFPA shorthand | Recent (post-pt-rulings) | `gyro torque` |
| **Operational notation** | Practitioners reading execution | ATAM grammar (Robinson era) | `CLIP > (BACK) SPIN [BOD] > SAME IN [DEX] > (BACK) SPIN [BOD] > OP CLIP [XBD] [DEL]` |
| **Job notation** | Old-school freestylers + historical readers | Ben Job 1995 | (variant of operational; lineage continuity) |
| **ADD derivation** | Visitors who want to understand the difficulty value | Curator-published arithmetic | `gyro(+2) + torque(4) = 6 ADD` (subject to Red ruling) |
| **Equivalent readings** | Visitors who learned the trick by a folk name | Editorial chain registry | `gyro torque` ↔ `spinning ss torque` ↔ `spinning ss miraging op osis` |

---

## 2. Comparative-notation rendering spec

### 2.1 Page structure

The first-class trick page is a **stacked single-page layout** with two visible zones + one collapsed:

```
ZONE A — PRIMARY IDENTITY ROW (always visible, hero-tier)
  • h1 trick name + #tag chip               [large]
  • Compact notation                        [medium, one-line]
  • Official ADD chip                       [chip]

ZONE B — SECONDARY COMPARATIVE METADATA ROW (always visible, smaller font)
  • JOB: <Job / operational notation>
  • ADD: <ADD breakdown / derivation>
  • VIDEO: yes / no (or count)

ZONE C — EXPANDED DETAIL (collapsed by default, single <details>)
  • Equivalent readings (if any)
  • Movement neighborhood (if any)
  • Family + sibling tricks (if any)
  • Operator stack visualization (if ≥3 modifiers)
  • Lineage / history (if authored)
  • Tutorial / media (always; existing media block)
```

Zone A is the existing trick-hero (light edits — add compact notation line under h1). Zone B is **new** — a single secondary row in a smaller font carrying Job notation + ADD breakdown + a video availability indicator. Zone C absorbs everything else.

**Two-row design rationale.** A 4-row notation card front-loads too much symbolic content. The 2-row design surfaces (a) what the trick is (Zone A: name + shorthand + difficulty) and (b) how it is structurally described (Zone B: Job-tradition notation + arithmetic breakdown + media availability). Job and operational notation share the ATAM lineage; collapsing them to a single `JOB:` row removes redundancy without losing information.

### 2.2 Zone B — secondary comparative metadata row

The load-bearing new surface. Single row, **smaller font than Zone A**, three labeled inline elements:

```
─────────────────────────────────────────────────────────────────
  Mobius                                                    5 ADD
  gyro torque
─────────────────────────────────────────────────────────────────

  JOB:    CLIP > (BACK) SPIN [BOD] > SAME IN [DEX] > (BACK) SPIN [BOD] > OP CLIP [XBD] [DEL]
  ADD:    gyro(+2 rotational) + torque(4) = 6 ADD
  VIDEO:  available
```

**Rules:**
- Smaller font than Zone A; constant-width labels (`JOB:` / `ADD:` / `VIDEO:`) for scan alignment.
- Each label on its own line at narrow widths; inline on wide widths if space permits.
- Value column uses a toned-down version of the existing role-token palette — no aggressive symbolic highlighting in Zone B (full palette stays available in Zone C if user expands).
- The `JOB:` row carries the ATAM-lineage operational notation (curator-published when available; mechanically derived from base + modifier stack when not). Caption `[derived]` when derived.
- The `ADD:` row carries the breakdown (curator-published derivation when available; computed from modifier stack when not, with `[computed]` caption).
- The `VIDEO:` row carries `available` (when curator-tagged reference media exists), `available (tutorial)`, `available (demo)`, or `none yet`.
- Empty row policy: italicized `"Not yet published"` per element when the system genuinely has no value (rare; see §2.3).
- Provenance / curator-internal language **never appears** in this row.

### 2.3 Empty-state policy

The current "Job notation unavailable" empty-state is a hard blank. Per design correction:

- **JOB row:** when `jobs_notation_raw` is populated → show it. When empty BUT `operational_notation` is populated → show the operational form directly (the two systems share the ATAM lineage). When `operational_notation` is also empty BUT modifier_links + base_trick exist → derive a Job-form chain from base + modifier stack with `[derived]` caption. When the row is an atom (no modifiers, slug == base) → show the atom's chain (e.g., `SET > BACK BOD > SAME CLIP` for `osis`) with `[atomic]` caption. When nothing derivable → italicized `"Lineage notation not yet adapted"`.
- **ADD row:** when in `RESOLVED_FORMULAS_SPRINT_1` → show derivation. When not, but modifier_links exist → show **derived sum** with `[computed]` quiet caption. When the row is an atom → show `"<base>(N) = N ADD"` with `[atomic]` caption.
- **VIDEO row:** `available (tutorial)` / `available (demo)` / `available (N items)` / `none yet`. Derived from `media_items` joined to `media_sources` (the same data feeding the existing Reference Media section).

The empty-state ladder is **mechanical**: derived when possible, italicized prose when not. Never blank.

### 2.4 Coexistence with the test-pinned 4-tier contract

The current 4-tier contract (test-pinned in `freestyle.portal.routes.test.ts` + `freestyle.dictionary-trick-card.routes.test.ts`) forbids Tier-4 patterns (`xbody(N)`, `dex(N)`, `stall(N)`, `spin(N)`, `= N ADD`) on browse cards + landing. The first-class trick page is `/freestyle/tricks/:slug` — already permitted as the public Tier-4 surface. **No contract change needed.**

The Zone B row brings Tier-2 (operational/Job lineage) and Tier-4 (ADD breakdown) into the same row, but both surfaces are already permitted on trick-detail. The change is **layout**, not **contract**.

---

## 3. Browser-readability audit

### 3.1 Density assessment per surface (current state)

| Surface | Density | Reader effort | Verdict |
|---|---|---|---|
| Hero h1 + ADD chip | Low | Trivial | ✓ keep |
| Hero decomposition strip | Low-medium | Quick scan | ✓ keep but consider folding into Zone B |
| Hero quick-stat formula one-liner | Medium | Light | △ duplicates ADD breakdown in Zone B; **resolve by removing from hero** if Zone B carries the breakdown |
| Compact notation block (existing trick-notation) | Medium | Light | △ folds into Zone B row 1 |
| Equivalent readings ladder | Medium-high (when present) | Substantial when 3+ readings | △ folds into Zone C (Detail) |
| Base-lineage fallback | Low | Trivial | ✓ keep, fold into Zone B empty-state ladder |
| Operational notation block | Medium-high (when present) | Substantial — warm-palette tokenization | △ folds into Zone B row 2 |
| Modifier-layering nested boxes | High | Substantial visual parsing | △ stays in Zone C, current placement OK |
| ADD-analysis disclosure (Phase B) | Low (collapsed) | Click-to-expand | △ folds into Zone B row 4 (uncollapsed; the comparative frame is the point) |
| Structural-decomposition diagnostic | Very high (when expanded) | Heavy | △ stays in Zone C, keep collapsed |

### 3.2 Compiler-aesthetic patterns currently in use

The audit identified the following patterns. Most are acceptable; some warrant attention in the redesign:

| Pattern | Where | Verdict |
|---|---|---|
| Role-colored tokens inline (notation-display-tokens, operational-notation-tokens) | trick-notation + trick-operational | ✓ keep with toned-down palette in Zone B; full palette in Zone C if user expands |
| Nested indented boxes (modifier-layer) | trick-modifier-layering | ✓ keep in Zone C; not a primary surface |
| Per-token role classification list (notation-grammar-role-list) | trick-structural | △ already collapsed; **OK** |
| Token-bracket inline (e.g., `[XBD] [DEL]`) | operational notation, Job-notation diagnostic | △ keep but ensure they're not the ONLY readable form; Zone B shows the chain, brackets sit in row 2 |
| Symbolic chip stacks (#tag + ADD + family chip + category chip on browse cards) | dictionary-trick-card partial | ✓ off-topic for this slice (browse cards already governed by Tier-4 contract) |

### 3.3 The "compiler vs human-first" risk

The current page tilts compiler-aesthetic in three places:
1. **Operational notation block**: warm-palette tokenization is dense for first-time readers
2. **Modifier-layering nested boxes**: visually heavy
3. **Structural-decomposition diagnostic**: parser-tier; already correctly hidden

The Zone B card uses a **flat, label-led layout** with quiet system tags and one-line values. This re-frames the operational notation from "compiler output" to "one of several ways to describe the trick."

---

## 4. Proposed UI layouts

### 4.1 Wireframe — first-class trick page (Mobius)

```
═══════════════════════════════════════════════════════════════════
  Freestyle › #mobius                                                 [breadcrumb]
═══════════════════════════════════════════════════════════════════

  Mobius                                                  5 ADD     [Zone A — primary]
  gyro torque                                                       [compact, medium font]
  ───────────────────────────────────────────────────────────

  JOB:    CLIP > (BACK) SPIN [BOD] > SAME IN [DEX] > (BACK) SPIN [BOD] > OP CLIP [XBD] [DEL]
  ADD:    gyro(+2 rotational) + torque(4) = 6 ADD ⚠ Wave-2-pending
  VIDEO:  available (tutorial)                                      [Zone B — smaller font]

═══════════════════════════════════════════════════════════════════

  ▸ More                                                            [Zone C — collapsed]
    • Equivalent readings: 3 alternative names
    • Family: Torque family · 4 sibling tricks
    • Operator stack: gyro + torque (rotational)
    • Records: 2 holders
═══════════════════════════════════════════════════════════════════
```

### 4.2 Wireframe — atomic singleton (osis)

The same 2-row layout, with derived values where curator-authored data is absent:

```
═══════════════════════════════════════════════════════════════════
  Osis                                                      3 ADD
  osis
═══════════════════════════════════════════════════════════════════

  JOB:    SET > (BACK or FRONT) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]   [derived · atomic]
  ADD:    spin(1) + xbod(1) + stall(1) = 3 ADD                             [atomic flag-decomposition]
  VIDEO:  available (demo · 1 item)

═══════════════════════════════════════════════════════════════════

  ▸ More
    • Family: Osis self-family
    • Sibling compounds: paradox-osis, spinning-osis, atomic-osis…
═══════════════════════════════════════════════════════════════════
```

Atoms qualify for first-class status without family memberships beyond their self-base. **Family is optional, not a gate.** Their ADD breakdown carries pedagogical content — the three flags that compose osis's difficulty — rather than a trivial identity.

### 4.3 Wireframe — folk-name compound (blur)

```
═══════════════════════════════════════════════════════════════════
  Blur                                                      4 ADD
  stepping paradox mirage
═══════════════════════════════════════════════════════════════════

  JOB:    CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]
  ADD:    stepping(+1) + paradox(+1) + mirage(2) = 4 ADD
  VIDEO:  available (tutorial)

═══════════════════════════════════════════════════════════════════

  ▸ More
    • Equivalent readings: Blur ↔ Stepping Paradox Mirage (Red-confirmed)
    • Family: Mirage family
    • Operator stack: stepping + paradox + mirage (3-modifier)
═══════════════════════════════════════════════════════════════════
```

The 2-row design keeps the primary identity row visually dominant (name + shorthand + ADD chip); the secondary row carries the comparative metadata at a glance.

---

## 5. Required data-field audit

### 5.1 Fields needed for the resolved-trick contract

| Field | Current source | Coverage today | Required for first-class? |
|---|---|---|---|
| `canonical_name` | DB `freestyle_tricks.canonical_name` | 100% | ✓ required |
| `adds` (official ADD) | DB `freestyle_tricks.adds` | 80% | ✓ required |
| `notation` (compact) | DB `freestyle_tricks.notation` | ~100% canonical | ✓ required |
| `operational_notation` | DB `freestyle_tricks.operational_notation` | **0.6% (1/166)** | ✓ required for first-class — **major gap** |
| `jobs_notation_raw` | DB `freestyle_tricks.jobs_notation_raw` | **0%** | △ soft requirement — derived approximation acceptable per design correction |
| ADD derivation | TS `RESOLVED_FORMULAS_SPRINT_1` | 15% (25/166) | ✓ required for first-class — derivable from modifier stack as fallback |
| `base_trick` | DB | ~95% | ✓ required |
| `trick_family` | DB | ~95% | △ OPTIONAL (per correction; atoms qualify without family) |
| Equivalent readings | TS `freestyleSymbolicEquivalences.ts` | ~10% | △ optional (Zone C content) |
| Movement neighborhood | TS topology registry | ~30% | △ optional |
| Tutorial / media | DB media_items | ~25% canonical | △ optional |

### 5.2 Coverage gap analysis

**Operational notation gap (0.6%) is the binding constraint.** Without operational notation, the Zone B row 2 either renders the derived compact form (acceptable per §2.3) OR is blank. The design is robust against the gap (derived fallback exists) but the resolved-trick class can't grow until operational notation populates.

**Job notation gap (0%) is the second constraint.** The design correction admits derived/adapted Job notation as acceptable. The simplest derivation rule: strip bracket-flag annotations from operational notation, retain `> ` chain structure. This is a service-layer transformation, not curator work.

**ADD derivation gap (85%) is the third.** Service-layer derivation from modifier_links + modifier table values (already used by workbook's `derive_add_math` Python helper) is portable to TypeScript. The Phase B Tier-4 disclosure can render derived values when no curator-published row exists, with a `"derived from modifier stack"` quiet caption.

### 5.3 Workbook ↔ trick-detail field alignment

The workbook (`build_trick_reconciliation_workbook.py`) already tracks the field set this design needs:

| Workbook column | Trick-detail surface |
|---|---|
| `name_status` | implicit (page exists) |
| `compact_status` + `ifpa_compact_notation` | Zone A (hero, under h1) |
| `full_status` + `ifpa_full_formula` | Zone B `JOB:` element (operational notation, when present) |
| `job_status` + `ifpa_job_notation` | Zone B `JOB:` element (curator-authored Job notation supersedes full when present) |
| `add_formula_status` + `ifpa_add_formula` | Zone B `ADD:` element |
| `computed_add_status` + `ifpa_computed_add` | Zone B `ADD:` element (validation against official; H6 convergence check) |
| `official_add_status` + `ifpa_official_add` | Zone A hero chip |

The workbook governance gate is already the truth-maintenance surface for the resolved-trick class. **A `resolved_status` column in the workbook becomes the natural promotion signal.**

---

## 6. Resolved-trick qualification audit

### 6.0 The First-Class ADD Convergence Rule

**A trick cannot be promoted to resolved / first-class / notation-complete unless:**

```
executable ADD derivation  =  computed ADD  =  official ADD
```

**with no unresolved doctrine blockers.**

Equivalently, the canonical definition:

> **resolved = notation-complete + accounting-converged + doctrine-clean**

Where:

| Term | Definition | Source |
|---|---|---|
| **executable ADD derivation** | The curator-published arithmetic statement for the trick (e.g., `paradox(+1) + mirage(2) = 3 ADD`) | `RESOLVED_FORMULAS_SPRINT_1` (TS content module) OR the trivial atomic derivation `<base>(N) = N ADD` for atomic singletons |
| **computed ADD** | The numeric value produced by the mechanical derivation from `freestyle_trick_modifier_links` + modifier-table weights + base ADD + the `MODIFIER_COMPOSITIONS` registry | `derive_add_math` helper (Python in workbook; TS port for service) |
| **official ADD** | The curator-confirmed DB value | `freestyle_tricks.adds` column |
| **accounting-converged** | All three numeric values agree | Computed as a workbook-side check |
| **notation-complete** | Compact present + (operational present OR mechanically derivable) + (Job present OR adaptable from operational) | Workbook column states |
| **doctrine-clean** | Row not in `wave2_blocked`, `add_disagreement`, `curator_hold`, or `derived_add_mismatch` workbook status | Workbook row status |

The convergence rule is **the gate**, not the recommendation. A trick missing any of the three values, or having any pair disagree, is **not first-class** regardless of how complete its other surfaces are.

### 6.1 Qualification criteria (post-convergence-rule)

**Hard requirements** (all of these — promotion gated on the AND):

| # | Requirement | Workbook signal |
|---|---|---|
| H1 | Canonical row exists in `freestyle_tricks` (not a placeholder) | row in scope |
| H2 | `freestyle_tricks.notation` populated (compact form authored) | `compact_status = 'present'` |
| H3 | `freestyle_tricks.adds` populated (official ADD authored) | `official_add_status = 'present'` |
| H4 | Executable derivation exists: row in `RESOLVED_FORMULAS_SPRINT_1` (compounds) OR row in `ATOMIC_FLAG_DECOMPOSITIONS` (atoms — curator-published flag-component decomposition like `spin(1) + xbod(1) + stall(1) = 3 ADD`) | `add_formula_status = 'present'` |
| H5 | Computed ADD agrees with official ADD (no `derived_add_mismatch`) | `computed_add` agrees with `official_add` |
| H6 | Executable derivation total agrees with both (3-way convergence) | computed-vs-derivation agreement |
| H7 | No unresolved doctrine blocker (row not in `wave2_blocked` / `add_disagreement` / `curator_hold` / `derived_add_mismatch`) | row status ∈ `{agreement, add_disagreement_doctrine_locked}` |
| H8 | Operational notation present OR mechanically derivable from compact + modifier stack | `full_status` OR derivation available |

**Soft requirements** (recommended but not blocking):
- ~~family~~ → **OPTIONAL** (atoms qualify without family beyond self-base; family is a graph-membership signal, not a completeness signal)
- Job notation populated OR adapted-from-operational available
- Equivalent readings authored
- Movement neighborhood classified
- Tutorial / media available

**Disqualifying conditions** (any of these blocks first-class):
- `wave2_blocked` row status in workbook (D1)
- `add_disagreement` row status, NOT doctrine-locked (D2)
- `curator_hold` row status (D3)
- `derived_add_mismatch` row status (D4 — until composite-modifier doctrine resolved)
- Placeholder slug (`alias_of_canonical` / `derivable_structural_form`)

**Notes on H4 atomic flag-decompositions:** Atomic singletons (slug == base_trick, no modifiers, e.g. `osis`, `butterfly`, `whirl`, `torque`, `mirage`) need their own curator-published executable derivation in the form of a **flag-component decomposition** drawn from the Add-Categories doctrine: each ATAM bracket-flag (`[BOD]` / `[DEX]` / `[XBD]` / `[DEL]` / `[UNS]`) in the operational notation contributes 1 ADD. Example: `osis` decomposes as `spin(1) + xbod(1) + stall(1) = 3 ADD` (one body, one cross-body, one delay flag). The identity `<base>(N) = N ADD` is NOT acceptable — it carries no educational content. The pilot ships with `osis` only; other atoms enter the registry as the curator publishes their flag decompositions individually.

**Notes on H6 vs H5:** H5 is the workbook's existing `derived_add_mismatch` check (computed vs official). H6 is the **stronger** three-way check (executable derivation total vs computed vs official). All three must agree. For atoms, "computed" equals official by construction (no modifiers to sum); the load-bearing check is `ATOMIC_FLAG_DECOMPOSITIONS[slug].totalAdd == official`.

### 6.2 Estimated resolved-trick population (current state, under convergence rule)

Drawing from workbook 2026-05-19 distribution + the H1-H8 convergence rule:

| Category | Workbook count | Convergence-eligible? |
|---|---|---|
| `agreement` | 119 | ✓ candidates (passes H7 doctrine-clean; H5 satisfied) |
| `add_disagreement_doctrine_locked` | 2 (atom-smasher, rake) | ✓ doctrine-locked is a governance-clean signal (Red ruling stands) |
| `derived_add_mismatch` | 4 (nemesis, sumo, barraging-osis, witchdoctor) | ✗ fails H5 |
| `add_disagreement` (open) | 5 (omelette, fury, surging, sailing, shooting) | ✗ fails H7 |
| `wave2_blocked` | 4 (bullwhip, double-down, terrage, datw) | ✗ fails H7 |
| `curator_hold` | 6 (jani-walker, guay, reaper, refraction, blistering, nuclear) | ✗ fails H7 |
| `alias_of_canonical` | 8 | ✗ not canonical rows |
| `derivable_structural_form` | 19 | ✗ not canonical rows |
| `missing_external_formula` | 30 | ✓ doesn't disqualify (external-side gap; IFPA-side internally converges) |

**Provisional convergence-eligible pool: ~119 + 2 = 121 canonical rows that pass H5 + H7.**

Apply the three-way convergence test (H6):

| Sub-population | Count | Eligibility under H6 |
|---|---|---|
| Atomic singletons (slug == base_trick, no modifiers) | ~13 candidates total (toe-stall, clipper-stall, around-the-world, orbit, mirage, butterfly, osis, whirl, swirl, torque, blender, drifter, … per core-atom registry) | △ each atom needs an entry in `ATOMIC_FLAG_DECOMPOSITIONS`; pilot ships with `osis` only |
| Compounds with curator-published derivation in `RESOLVED_FORMULAS_SPRINT_1` | ~25 (Sprint 1-7 entries) | ✓ pass H4 directly; H6 verified per-row |
| Compounds without published derivation, but with computed agreement | ~83 (the remainder of `agreement` set) | ✗ fail H4 (no executable derivation published) — pending Sprint 8+ promotion |

**First-class qualifying pool today: ~13 atoms + ~25 Sprint-resolved compounds = ~35-40 rows.**

The H4 requirement (curator-published compound derivation OR atomic flag-decomposition) is the binding constraint. The other ~83 `agreement`-status compounds are *convergence-ready* (computed = official, governance-clean) but lack the curator-published derivation to satisfy H4. Sprint 8+ work would lift compounds; atom-by-atom flag-decomposition curation lifts atoms.

### 6.3 Promotion signal — workbook column extension

The `resolved_status` column proposed earlier needs revising to reflect the convergence-rule architecture:

| Workbook `resolved_status` value | Criteria |
|---|---|
| `first-class` | H1-H8 all satisfied; no disqualifying status |
| `convergence-ready` | H1-H3, H5, H7-H8 satisfied; H4 missing (no curator-published derivation; would promote on Sprint+ addition) |
| `coverage-pending` | H1-H3 satisfied; operational/compact incomplete |
| `governance-blocked` | Any disqualifying row status (D1-D4) |
| `placeholder` | Not a canonical row |

The `first-class` column is the gate. `convergence-ready` is the queue for Sprint+ promotion work. The service layer reads this column (when present) or computes the equivalent in TypeScript. An `isFirstClass: boolean` field on `FreestyleTrickContent` drives a future badge / promoted-page treatment.

### 6.4 Pilot cohort identification

The convergence rule is **stricter than the prior estimate** — only the curator-published Sprint set plus atomic singletons clear H6. This actually *simplifies* the pilot: the qualifying pool is small and well-characterized.

**Recommended pilot cohort (5 slugs)** — one atom, one folk-name compound, three +1-stack compounds, all clearly converging:

| Slug | Kind | Official ADD | Computed | Published derivation | H6 convergence | H7 doctrine |
|---|---|---:|---:|---|---|---|
| `osis` | atom (singleton) | 3 | 3 (3 flags: BOD/XBD/DEL) | `spin(1) + xbod(1) + stall(1) = 3 ADD` (flag-decomposition) | ✓ | ✓ agreement |
| `paradox-mirage` | Sprint 1 +1-stack | 3 | 3 (paradox+1 + mirage 2) | `paradox(+1) + mirage(2) = 3 ADD` | ✓ | ✓ agreement |
| `symposium-mirage` | Sprint 1 +1-stack | 3 | 3 | `symposium(+1) + mirage(2) = 3 ADD` | ✓ | ✓ agreement |
| `atomic-butterfly` | Sprint 1 +1-stack | 4 | 4 | `atomic(+1) + butterfly(3) = 4 ADD` | ✓ | ✓ agreement |
| `ripwalk` | Sprint 3 folk-name resolution | 4 | 4 | `stepping(+1) + butterfly(3) = 4 ADD` | ✓ | ✓ agreement |

**Coverage rationale:** the pilot covers (a) atomic case, (b) simplest +1-stack, (c) a different operator family (symposium vs paradox), (d) different base (butterfly vs mirage), (e) folk-name resolution (ripwalk). If the rendering pattern works across this variety, the broader 30-row cohort follows the same shape.

**Slugs deliberately NOT in pilot:**
- `mobius` — gyro operator has Wave-2 doctrine question; H7 currently fails (or borderline). Defer.
- `blur` — not in `RESOLVED_FORMULAS_SPRINT_1` yet (workbook handles via MODIFIER_COMPOSITIONS, but H4 currently fails on the TS side). Promote to Sprint 8 first, then pilot.
- `whirl` / `torque` / `butterfly` — qualifying atoms but redundant with `osis` for pilot coverage. Add in second wave.

## 7. Suggested implementation sequence

### 7.1 Slice ordering — recommended

| # | Slice | Scope | Risk | Gate |
|---|---|---|---|---|
| **1** | **Service: derive operational notation from compact + modifier stack** | TypeScript port of mechanical derivation. Returns derived form when DB column null. Caption marks derivation. | Low | None — purely additive |
| **2** | **Service: derive Job notation from operational** | Strip bracket-flag annotations, retain chain structure. Returns derived form when raw column null. Caption marks derivation. | Low | None — additive |
| **3** | **Service: derive ADD breakdown from modifier_links** | Port `derive_add_math` Python helper to TypeScript. Use for Tier-4 disclosure fallback when slug not in RESOLVED_FORMULAS_SPRINT_1. Composite-modifier expansion (blurry → stepping+paradox) reuses the existing workbook `MODIFIER_COMPOSITIONS` registry. | Medium | Curator approval of TS-side MODIFIER_COMPOSITIONS (4 SAFE rows) |
| **4** | **Service: comparative-notation card shape** | New `FreestyleTrickContent.comparativeNotation: ComparativeNotationCard` field carrying 4 pre-shaped rows (each with label, value, derived-flag, captionProse). Slices 1-3 supply the row values. | Medium | Slices 1-3 complete |
| **5** | **Template: Zone B card partial** | New `src/views/partials/trick-comparative-notation.hbs`. Replaces / supersedes the existing trick-notation + trick-operational sequential blocks. Inserts in trick-shell.hbs between hero and modifier-layering. | Medium | Slice 4 service shape live |
| **6** | **Template: Zone C consolidation** | Move existing equivalent-readings + base-lineage + curation-gap displays into a single `<details>` block (Zone C). The pieces stay as partials; only the parent grouping changes. | Low | Slice 5 ships first |
| **7** | **Workbook: `resolved_status` column** | Add column to `build_trick_reconciliation_workbook.py`. Computed from existing status columns. Output to `trick_reconciliation.csv`. | Low | Independent of Slices 1-6 |
| **8** | **Service: `isFirstClass` field** | Read workbook `resolved_status` (or compute in TS) → expose to template. Gate a future "First-class" badge or promoted-page treatment. | Low | Slice 7 first |
| **9** | **Visual: First-class badge / promoted treatment** | UX polish — hero badge, distinct page-title weight, etc. Curator decision: badge vs different border vs different breadcrumb. | Low | Slice 8 first; curator UX approval |
| **10** | **Tests + doc-sync** | Per-slice tests; final doc-sync VC §363 + SC §259. | Low | Slices 5+8 done |

### 7.2 Critical path

Slices 1+2+3 are independent and unblock everything. Suggested cadence: all three in one PR (foundational derivation surface), then 4+5 (Zone B card), then 7+8 (governance column + isFirstClass), then 6+9+10 as polish.

### 7.3 What to ship FIRST (smallest useful slice)

If a single-PR pilot is needed: **Slice 1 + 4 + 5 (operational-derivation + comparative card)**. This delivers the Zone B card with derived operational notation for slugs that lack curator-authored op_notation. Job notation row shows derived-from-operational; ADD breakdown row shows Phase-B disclosure. Visible improvement; small surface area; reversible.

### 7.4 Pilot implementation scope (convergence-rule-gated)

The convergence rule (§6.0) makes the pilot scope very precise:

**Pilot cohort:** the 5 slugs listed in §6.4 — `osis`, `paradox-mirage`, `symposium-mirage`, `atomic-butterfly`, `ripwalk`.

**Pilot slices (subset of §7.1):**

| # | Slice | Scope for pilot | LOC est. |
|---|---|---|---|
| **P1** | Convergence checker (TS service helper) | `assertFirstClassConvergence(slug, dictRow, modifierLinks, modifierTable)` returns `{ status: 'first-class' \| 'convergence-ready' \| 'governance-blocked' \| 'coverage-pending', diagnostic: string }`. Implements H1-H8 in pure TS. Reads `RESOLVED_FORMULAS_BY_SLUG` (already shipped Phase B) + workbook doctrine-blocker registries. | ~80 |
| **P2** | Service: `isFirstClass: boolean` field on `FreestyleTrickContent` | Single field driven by P1. Other pages don't change. | ~10 |
| **P3** | Service: `comparativeNotation` shape (Zone B row) | Per §2.2: pre-shaped fields `{ jobLineage, jobLineageSource, addBreakdown, addBreakdownSource, videoState }`. Derivation fallbacks per §2.3. NULL when `isFirstClass=false`. | ~60 |
| **P4** | Template: Zone B card partial | New `src/views/partials/trick-comparative-notation.hbs`. Inserts in trick-shell BEFORE the existing trick-notation + trick-operational + trick-add-analysis (which stay in place as Tier-2/3 fallback for non-first-class tricks). | ~50 |
| **P5** | CSS for Zone B card | New `.trick-comparative-*` block. Same restrained aesthetic as Phase B. | ~80 |
| **P6** | Tests | (a) 5 pilot slugs render Zone B card; (b) non-first-class slug does NOT render Zone B card; (c) convergence checker correctly identifies the 5 + rejects mobius/blur; (d) 4-tier contract preserved on browse/landing | ~120 |

**Out of scope for the pilot** (deferred to Wave 2 of resolved-trick work):
- Workbook `resolved_status` column (P7-P10 territory)
- Operational notation mechanical derivation for arbitrary tricks (P1 with simple atomic + +1-stack support is enough for the pilot 5)
- Job notation adaptation (pilot can show `[lineage notation not yet adapted]` for all 5; full derivation is post-pilot)
- First-class visual badge / promoted treatment (UX polish — defer)
- Sprint 8+ promotion of additional slugs

**Pilot success criteria:**
1. All 5 pilot slugs render the Zone B card with correct comparative-notation surfaces
2. Non-pilot slugs render the existing trick-detail layout unchanged (regression: 0)
3. `assertFirstClassConvergence` correctly classifies the 5 pilot slugs as `first-class` AND rejects `mobius` (Wave 2) + `blur` (no Sprint entry yet) as `convergence-ready`
4. 4-tier rendering hierarchy test-pinned contract preserved (no Tier-4 leakage to browse/landing)
5. `npm run build` clean; full `npm test` suite ≥ 3600 pass (no regressions)

**Pilot risk mitigation:**
- Pilot ships behind a service-side allow-list initially: even if `assertFirstClassConvergence` returns first-class for a slug, the comparativeNotation shape is null unless the slug is in `PILOT_FIRST_CLASS_SLUGS = ['osis', 'paradox-mirage', 'symposium-mirage', 'atomic-butterfly', 'ripwalk']`. This is a "double gate" — convergence test AND pilot allow-list — for controlled rollout.
- After cohort testing approves, the allow-list dissolves and convergence test alone gates the population.

**Cohort testing approach:**
1. Ship pilot to the 5 slugs (allow-list-gated)
2. Visual review: each of the 5 pages displays the Zone B card correctly
3. Curator review: confirm the comparative-notation framing reads as intended (not compiler-aesthetic; human-first)
4. Iterate on copy / layout / palette per curator feedback
5. After approval: remove the allow-list; expand to the full ~30-row qualifying pool
6. Document any slugs that pass the convergence test but should be excluded for editorial reasons (these become a deny-list, not a blocker)

---

## 8. Mock renderings — 7 example slugs

Each mock shows: hero (Zone A) + comparative card (Zone B) + Zone C summary. Renderings assume Slices 1-3 (derivation fallbacks) are live.

### 8.1 `blur` (folk compound; full coverage)

```
─────────────────────────────────────────────────────────────────
  Blur                                                      4 ADD
  stepping paradox mirage
─────────────────────────────────────────────────────────────────

  JOB:    CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]
  ADD:    stepping(+1) + paradox(+1) + mirage(2) = 4 ADD
  VIDEO:  available (tutorial)

  ▸ More
    • Equivalent readings: 1 (Blur ↔ Stepping Paradox Mirage, Red-confirmed)
    • Family: Mirage family
    • Operator stack: 3 modifiers (stepping + paradox; nesting visualized)
─────────────────────────────────────────────────────────────────
```

**First-class status:** △ pending Sprint 8 promotion (blur not yet in `RESOLVED_FORMULAS_SPRINT_1`; workbook decomposition handles it via `MODIFIER_COMPOSITIONS`). After promotion: ✓ qualifies.

### 8.2 `mobius`

```
─────────────────────────────────────────────────────────────────
  Mobius                                                    5 ADD
  gyro torque
─────────────────────────────────────────────────────────────────

  JOB:    CLIP > (BACK) SPIN [BOD] > SAME IN [DEX] > (BACK) SPIN [BOD] > OP CLIP [XBD] [DEL]   [derived]
  ADD:    gyro(+2 rotational) + torque(4) = 6 ADD ⚠ pending Red       [computed conflicts with official 5]
  VIDEO:  available

  ▸ More
    • Equivalent readings: 3 (gyro torque · spinning ss torque · spinning ss miraging op osis)
    • Family: Torque family
    • Operator stack: gyro + torque (rotational base)
─────────────────────────────────────────────────────────────────
```

**First-class status:** ✗ fails H6 convergence (computed=6 vs official=5; the gyro-on-rotational doctrine question is unresolved). Until Red ruling: not first-class.

### 8.3 `torque`

```
─────────────────────────────────────────────────────────────────
  Torque                                                    4 ADD
  torque
─────────────────────────────────────────────────────────────────

  JOB:    CLIP > OP IN [DEX] > (BACK) SPIN [BOD] > OP CLIP [XBD] [DEL]   [derived · atomic]
  ADD:    dex(1) + spin(1) + xbod(1) + stall(1) = 4 ADD                  [atomic flag-decomposition · curator-pending]
  VIDEO:  available

  ▸ More
    • Equivalent readings: 1 (miraging osis — pt11-locked)
    • Family: Torque self-family
    • Sibling compounds: gyro-torque (mobius), paradox-torque, spinning-torque, …
─────────────────────────────────────────────────────────────────
```

**First-class status:** △ awaits curator publication of atomic flag-decomposition entry in `ATOMIC_FLAG_DECOMPOSITIONS`. Compositionally clean (4 flags = 4 ADD) but the pilot ships with `osis` only.

### 8.4 `whirl`

```
─────────────────────────────────────────────────────────────────
  Whirl                                                     3 ADD
  whirl
─────────────────────────────────────────────────────────────────

  JOB:    CLIP > OP IN [DEX] > OP CLIP [XBD] [DEL]                       [derived · atomic]
  ADD:    dex(1) + xbod(1) + stall(1) = 3 ADD                            [atomic flag-decomposition · curator-pending]
  VIDEO:  available

  ▸ More
    • Family: Whirl self-family
    • Sibling compounds: paradox-whirl, blurry-whirl, gyro-whirl, …
─────────────────────────────────────────────────────────────────
```

**First-class status:** △ awaits curator publication of atomic flag-decomposition entry in `ATOMIC_FLAG_DECOMPOSITIONS`. Pilot ships with `osis` only.

### 8.5 `osis`

```
─────────────────────────────────────────────────────────────────
  Osis                                                      3 ADD
  osis
─────────────────────────────────────────────────────────────────

  JOB:    SET > (BACK or FRONT) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]   [derived · atomic]
  ADD:    spin(1) + xbod(1) + stall(1) = 3 ADD                             [atomic flag-decomposition]
  VIDEO:  available (demo)

  ▸ More
    • Family: Osis self-family
    • Sibling compounds: paradox-osis, spinning-osis, symposium-osis, …
─────────────────────────────────────────────────────────────────
```

**First-class status:** ✓ qualifies. **Pilot anchor.**

### 8.6 `butterfly`

```
─────────────────────────────────────────────────────────────────
  Butterfly                                                 3 ADD
  butterfly
─────────────────────────────────────────────────────────────────

  JOB:    SET > SAME OUT [DEX] > OP IN [DEX] > SAME CLIP [XBD] [DEL]      [derived · atomic]
  ADD:    dex(1) + xbod(1) + stall(1) = 3 ADD                             [atomic flag-decomposition · curator-pending]
  VIDEO:  available

  ▸ More
    • Family: Butterfly self-family
    • Sibling compounds: atomic-butterfly, pixie-butterfly, dimwalk, stepping-butterfly, …
─────────────────────────────────────────────────────────────────
```

**First-class status:** △ awaits curator publication of atomic flag-decomposition entry in `ATOMIC_FLAG_DECOMPOSITIONS`. Pilot ships with `osis` only.

### 8.7 `ripwalk` (Sprint 3 resolved-formula entry)

```
─────────────────────────────────────────────────────────────────
  Ripwalk                                                   4 ADD
  stepping butterfly
─────────────────────────────────────────────────────────────────

  JOB:    CLIP > OP IN [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]        [derived]
  ADD:    stepping(+1) + butterfly(3) = 4 ADD
  VIDEO:  available

  ▸ More
    • Equivalent readings: 1 (Ripwalk ↔ Stepping Butterfly)
    • Family: Butterfly family
─────────────────────────────────────────────────────────────────
```

**First-class status:** ✓ qualifies (curator-published ADD derivation; clean three-way convergence: derivation=computed=official=4). **Pilot anchor.**

---

## 9. Risk analysis

### 9.1 Parser overload risk

**Hazard:** the operational-notation derivation algorithm (Slice 1) is structurally a parser. Adding it to the service layer risks the team treating it as authoritative; future curators may bypass the workbook governance gate and let the derivation populate the canonical column.

**Mitigation:**
- Derivation produces ONLY the view-model value; never writes back to the DB column
- Service field carries `derived: true` flag; caption renders "[derived from compact + modifier stack]" verbatim
- Tests assert the derivation path does NOT mutate the DB
- Workbook continues as governance gate; derivation is presentation-only

### 9.2 Notation overload risk

**Hazard:** multiple notation surfaces visible simultaneously could overwhelm first-time readers ("which one should I learn?").

**Mitigation:**
- The 2-row design is explicitly hierarchical: Zone A (hero) is visually primary with the trick name + compact notation + ADD chip; Zone B is a single smaller-font row carrying `JOB:` / `ADD:` / `VIDEO:` for at-a-glance comparison
- The reader sees identity first; the comparative metadata is secondary
- An optional ~20-word framing prose at the top of the card: `"These describe the same trick from different angles. The compact notation is shorthand; operational is execution; Job is the historical lineage form; ADD breakdown is the arithmetic of difficulty."` (curator-authored)
- Mobile: rows stack vertically; primary row keeps its size, others step down

### 9.3 Doctrine leakage risk

**Hazard:** provenance / pt-ruling references / Wave 2/3 internal language could leak into the comparative card, especially the ADD-breakdown row.

**Mitigation:**
- All provenance fields held server-side; never shipped to template
- Empty-state captions use **only** the curator-approved short vocabulary: `"derived from <source>"`, `"atomic"`, `"not yet published"`, `"lineage notation not yet adapted"`
- Adversarial tests assert internal language ('Red', 'pt##', 'Wave', 'curator', specific dates) does NOT appear in the Zone B card HTML

### 9.4 UI density risk

**Hazard:** the Zone B card grows over time as systems are added (e.g., a future fifth notation system). Width / row-count balloon.

**Mitigation:**
- Zone B is fixed at 3 inline labels (`JOB:` / `ADD:` / `VIDEO:`); any future notation system goes to Zone C, not into Zone B
- Each row enforces a one-line constraint at desktop; wrapping is acceptable but row count is fixed
- Visual review at 480px / 768px / 1200px widths before any visual change ships

### 9.5 Workbook ↔ service drift risk

**Hazard:** the workbook's `resolved_status` column and the service's `isFirstClass` computation could drift if both implement their own logic.

**Mitigation:**
- Workbook is authoritative; service reads the column
- Single source of truth: `legacy_data/reports/trick_reconciliation.csv` consumed at service startup (or via a derived TS module exported from a build step)
- Test asserts the workbook column → service field round-trip is identity

### 9.6 Empty-state derivation correctness risk

**Hazard:** derived operational notation may be subtly wrong (e.g., for spinning-class tricks where rotation direction matters and isn't recoverable from compact form alone).

**Mitigation:**
- Derivation is **best-effort**, not authoritative
- When derivation produces a value that conflicts with curator-authored value: the curator-authored value wins; service hides the derivation
- Tests cover the known cases (atomic / single-modifier / multi-modifier-non-rotational); rotational + composite-modifier cases remain curator-authored only until explicit Red ruling on each operator class
- Caption "[derived]" makes the uncertainty visible

### 9.7 Phase B coexistence risk

**Hazard:** the just-shipped Phase B `trick-add-analysis` partial overlaps with Zone B row 4. Double-rendering would be visually heavy.

**Mitigation:**
- Slice 5 replaces the Phase B `trick-add-analysis` partial with the unified Zone B card
- The partial file stays as a transitional helper or is deleted in the same PR
- The collapsed-by-default Phase B pattern moves into Zone C (or the row 4 itself becomes the always-visible compact form, with `<details>` expansion only for the provenance / context paragraph)

---

## 10. Open decisions for curator

Pilot scope (§7.4) is precisely defined; the remaining decisions are:

1. **Promotion mechanism:** TS allow-list (pilot stage; recommended for the 5-slug pilot) → workbook `resolved_status` column (post-pilot, for the full ~30-row population) → DB column (heaviest; deferred indefinitely)
2. **First-class visual treatment:** badge vs distinct page-title weight vs distinct hero border vs nothing-visible (governance-only). Recommend nothing-visible for pilot; visual treatment is post-curator-review.
3. **Zone B framing prose:** include the 20-word framing sentence at the top of the card, or skip it (purist take: the row labels are self-explanatory)
4. **Operational derivation scope:** for the pilot, the 5 slugs split: `osis` (atom; atomic-trivial), `paradox-mirage`, `symposium-mirage`, `atomic-butterfly`, `ripwalk` (all +1 stacks with derivable operational). Pilot ships operational derivation for these patterns only — broader derivation deferred.
5. **Job notation derivation rule:** for the pilot, accept the `[lineage notation not yet adapted]` empty-state on all 5 (zero pre-adapted Jobs notation today). Derivation rule selected when Job notation backfill begins.
6. ~~**Resolved cohort pilot**~~ → **RESOLVED in §6.4:** osis, paradox-mirage, symposium-mirage, atomic-butterfly, ripwalk (5 slugs)
7. **"First-class" naming:** "first-class" vs "resolved" vs "notation-complete" vs "promoted" vs "graduated". The spec uses "first-class" and "resolved" interchangeably; curator picks one before the pilot test file lands.

---

## 11. Glossary (working definitions)

| Term | Definition |
|---|---|
| **First-class trick page** | A trick-detail page promoted to the resolved-trick presentation pattern. Gate: the First-Class ADD Convergence Rule (§6.0) — executable derivation = computed ADD = official ADD, with no unresolved doctrine blockers. Formal definition: `resolved = notation-complete + accounting-converged + doctrine-clean` |
| **First-Class ADD Convergence Rule** | The promotion gate (§6.0). A trick cannot be first-class unless executable ADD derivation, computed ADD, and official ADD all equal, with no unresolved doctrine blockers. Stricter than the prior heuristic (computed-vs-official agreement); requires a three-way match anchored to a curator-published derivation OR atomic-trivial identity |
| **Accounting-converged** | Component of the convergence rule. The three ADD values (derivation, computed, official) are numerically equal |
| **Atomic flag-decomposition** | The convergence rule's executable-derivation form for atomic singletons (slug == base_trick, no modifiers): a curator-published decomposition into ATAM bracket-flags from `ATOMIC_FLAG_DECOMPOSITIONS`. Example: `osis = spin(1) + xbod(1) + stall(1) = 3 ADD`. The trivial identity form (`<base>(N) = N ADD`) is explicitly NOT acceptable — it carries no educational content. |
| **Resolved trick** | Synonym for first-class trick. Used interchangeably in this document; curator picks one for ship |
| **Notation-complete** | A trick where the relevant notation surfaces (compact in Zone A; Job-lineage chain + ADD breakdown in Zone B) are populated either as curator-authored values or mechanically-derived values with caption |
| **Secondary comparative metadata row** | The Zone B surface; a single row below the hero, in smaller font, carrying three labeled inline elements: `JOB:` (Job / operational notation chain), `ADD:` (ADD breakdown / derivation), `VIDEO:` (yes / no / count). Replaces the prior 4-row "comparative notation card" framing |
| **ADD breakdown** | The arithmetic decomposition of a trick's ADD value (e.g., `paradox(+1) + mirage(2) = 3 ADD`). NEVER called "formula" on the UI |
| **ADD derivation** | Synonym for ADD breakdown. Used in service-layer and content-module identifiers |
| **Derived notation** | A notation value computed by the service from related fields (modifier_links + base + compact form) rather than authored by a curator. Surfaces with a `[derived]` caption |
| **Adapted Job notation** | An approximation of Job notation derived from operational notation by stripping bracket-flag annotations. Acceptable as a fallback when curator-authored Job notation is absent |
| **Governance-clean** | A trick whose workbook row is NOT in `wave2_blocked`, `add_disagreement`, `curator_hold`, or `derived_add_mismatch` status |
| **Promotion** | The act of moving a trick from generic dictionary-entry treatment to first-class trick page treatment. Triggered by meeting the qualification criteria; surfaced via workbook `resolved_status` column |

---

## What this document does NOT propose

- Does not introduce parser-maximalism, AST exposure, or symbolic-soup rendering
- Does not block broader canonical coverage (the first-class class is a promotion criterion, not a coverage gate)
- Does not force notation supremacy (compact, operational, Job, ADD-breakdown are presented as complementary, not hierarchical)
- Does not collapse the canonical/observational separation
- Does not mandate ontology hardening (resolved status is reversible; rows can be demoted if governance changes)
- Does not require a DB schema change (workbook column + TS service shape is sufficient)
- Does not change the test-pinned 4-tier rendering hierarchy contract (Tier-4 patterns remain forbidden on browse / landing)
- Does not commit any code

---

## Cross-references

- 4-tier rendering hierarchy contract: `tests/integration/freestyle.portal.routes.test.ts` + `tests/integration/freestyle.dictionary-trick-card.routes.test.ts`
- Phase B Tier-4 disclosure: `src/views/partials/trick-add-analysis.hbs` + `RESOLVED_FORMULAS_SPRINT_1`
- Workbook governance gate: `legacy_data/scripts/build_trick_reconciliation_workbook.py` + `exploration/workbook-completion-2026-05-19/`
- Observational layer (Phase A): `/freestyle/observational` redesign — `exploration/workbook-completion-2026-05-19/observed_tricks_scalability_plan.md`
- View-catalog entry for trick detail: `docs/VIEW_CATALOG.md` §363
- Service catalog FreestyleService entry: `docs/SERVICE_CATALOG.md` §125, §257, §259
- Drift report (prior session): `exploration/workbook-completion-2026-05-19/workbook_drift_report_post_parser_repair.md`

---

## Approval gate

This document is a design proposal. No code changes are pending. Curator review and explicit slice approval are required before any implementation work begins.

Recommended sequencing for review:
1. Pick decisions from §10 (especially #1 promotion mechanism + #7 naming)
2. Approve §6 qualification criteria (with family confirmed optional)
3. Approve §7.3 first slice scope (operational derivation + Zone B card pilot)
4. Approve §8 mock renderings as the visual target
5. Schedule Slices 1-3 (derivation surfaces) as the foundational PR
