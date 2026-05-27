# ADD Multiplier Doctrine + Operator Taxonomy Stabilization -- 2026-05-19

Audit-only exploration package. No canonical mutations, no schema migrations, no UI changes. Workbook-first architecture preserved per the explicit constraint set in the brief.

The deliverable is a curator-readable taxonomy stabilization plan with safe-mechanical-cleanup, doctrine-risk, and Red-question queues clearly separated. Premature doctrine hardening is the principal risk the audit is designed to surface, not commit.

---

## 0. Frame

Recent reconciliation work (Sprint 5 swing-element doctrine, Sprint 6 rake direction-variant pair, orbit canonical activation + reverse-around-the-world consolidation) surfaced a structural distinction the operator taxonomy was not previously carrying explicitly. There are at least five operator-class behaviors in the current dictionary, each with different ADD contribution semantics, different stacking behavior, different canonical-row-creation behavior, and different downstream-surface implications.

This audit catalogs the five classes, locates every active operator + multiplier in the current ontology against them, identifies safe mechanical cleanups, separates doctrine-risk decisions from Red-question prompts, and recommends a minimal workbook-column extension that supports the alternate-formula representations now in use (notably `rev(+0)` for direction reversals).

The audit's framing aligns with two existing project doctrines:

- Reversible TypeScript governance over SQL while ontology is in flight (`feedback_reversible_content_governance`). No schema migration is proposed.
- Parser / editorial separation (`feedback_parser_editorial_separation`). Multiplier doctrine lives in the editorial layer; parser remains untouched.

---

## 1. Multiplier doctrine audit (per-operator classification)

### 1.1 Five-class taxonomy

The operator classes are observational at this stage. Each captures a distinct ADD-contribution + canonical-row behavior. Promotion of any class to canonical doctrine requires curator + Red confirmation.

| Class | ADD contribution | Stacks? | Creates canonical rows? | Belongs in resolved formulas? |
|---|---|---|---|---|
| **A. Directional reversal** | `rev(+0)` — zero ADD contribution | Single-application (you cannot reverse a reversal) | Sometimes; case-by-case (orbit yes; whip unclear) | Yes, with explicit `rev(+0)` operator notation |
| **B. Body primitive** | Own ADD intrinsic to the motion | Stand-alone (irreducible) | Yes; the row IS the trick | No (no derivation; the row carries its own ADD) |
| **C. Structural multiplier** | `multiplier(+1)` typically; some `+2` rotational variants | Yes; multi-operator chains observed (paradox + symposium + whirl = 5) | Sometimes (e.g. `double-around-the-world`); mostly produces phrases | Yes, when the product has historical stabilization |
| **D. Operator modifier** | Variable; +0 to +3 | Yes; but limited stack depth observed in practice | Rarely; folk-name resolution surfaces some | Yes, when a folk name resolves to the chain |
| **E. Canonical compound** | Stable ADD; no contribution math | Not applicable (terminal) | Yes; the row IS the compound | Sometimes, when the compound has a confirmed structural reading (e.g. `mobius ≡ gyro torque`) |

The B/D boundary is the murkiest. Some entries (`ducking`, `spinning`) are listed by curators sometimes as primitives, sometimes as multipliers. The current `freestyle_trick_modifiers` table treats all of `ducking|spinning|whirling|stepping|symposium|paradox|barraging|tapping|...` as `modifier_type='body'` with `add_bonus=1`, which is class C/D handling. There are no body-primitive rows in the modifier table (the primitives `spin`, `double-spin`, `flying-inside`, `flying-outside`, `hop-over`, `walk-over`, `spyro` live in `freestyle_tricks` as `category='body'` rows).

### 1.2 Per-operator classification (live DB inventory)

Source: `SELECT * FROM freestyle_trick_modifiers` plus `SELECT * FROM freestyle_tricks WHERE category IN ('body','set')` plus `freestyleResolvedFormulas.ts` (29 active formula entries across Sprints 1-6).

| Operator | Current home | Modifier ADD (non-rot / rot) | Audit class | Belongs in resolved formulas | Belongs in symbolic shorthand | Belongs in movement-system view | Standalone row appropriate? | Notes |
|---|---|---|---|---|---|---|---|---|
| `double` | NOT in modifier table | (treated as +1 in `double-X` formulas) | **C. Structural multiplier** | Yes (selectively) | Yes | No (multiplier, not movement axis) | NO (the products like `double-around-the-world` may be canonical, but `double` itself is not a trick) | The central observation of this audit |
| `triple` | NOT in modifier table | (presumed +2 by extrapolation; no current canonical use) | **C. Structural multiplier** | TBD | TBD | No | NO | No `triple-*` rows currently in DB; doctrine premature |
| `paradox` | modifier, body, +1/+1 | +1 / +1 | **C/D. Structural multiplier with modifier shape** | Yes (15 Sprint-1 entries) | Yes | Yes (entry-topology axis) | NO (modifier; paradox-only is not a trick) | The canonical +1 stack reference |
| `symposium` | modifier, body, +1/+1 | +1 / +1 | **C. Structural multiplier (no-plant)** | Yes (Sprint 1) | Yes | Yes (no-plant axis) | NO (modifier) | Asymmetric placement: no-plant body action |
| `atomic` | modifier, set, +1/+2 | +1 / +2 (rotational bonus!) | **C. Structural multiplier (set, rotation-sensitive)** | Yes (Sprint 4 atom-smasher with x-dex adjustment) | Yes | Yes (set primitive axis) | NO (modifier) | First rotation-asymmetric entry; Red 2026-05-15 added x-dex character |
| `furious` | modifier, set, +1/+2 | +1 / +2 (rotational bonus!) | **C. Structural multiplier (set, rotation-sensitive)** | Yes (Sprint 2 fury) | Yes | Yes | NO (modifier) | Second rotation-asymmetric entry |
| `ducking` | modifier, body, +1/+1 | +1 / +1 | **C/D. Multiplier with arguable primitive character** | Yes (Sprint 1 ducking-osis, ducking-whirl, ducking-butterfly, ducking-clipper) | Yes | Yes (midtime body axis) | NO (modifier; `ducking` alone is not a trick) | The user's framing flags this as both B and C; the audit treats it as C since stacks observed (ducking + paradox + mirage = assassin = 4 ADD) |
| `spinning` | modifier, body, +1/+1 | +1 / +1 | **C. Structural multiplier** | Yes (Sprint 1, 3) | Yes | Yes (rotational axis) | NO (modifier; `spinning` alone is not a trick; the standalone `spin` row is a different concept) | `spin` (body primitive 1 ADD) vs `spinning` (modifier +1) are distinct |
| `stepping` | modifier, body, +1/+1 | +1 / +1 | **C. Structural multiplier** | Yes (Sprint 1, 3) | Yes | Yes | NO (modifier) | foot-relocation operator |
| `whirling` | modifier, body, +1/+1 | +1 / +1 | **C. Structural multiplier** | Yes (Sprint 1 whirling-swirl) | Yes | Yes | NO (modifier) | Gerund of `whirl`; `whirl` itself is class E canonical atom (3 ADD) |
| `miraging` | modifier, body, +1/+1 | +1 / +1 | **C. Structural multiplier** | Yes (chain reading `miraging osis` = torque) | Yes | Yes | NO (modifier) | Gerund of `mirage`; `mirage` itself is class E (2 ADD) |
| `swirling` | modifier, body, +1/+1 | +1 / +1 | **C. Structural multiplier** | Indirect (via whirling-swirl pair) | Yes | Yes | NO (modifier) | Gerund of `swirl`; `swirl` is class E (3 ADD) |
| `barraging` | modifier, body, +1/+1 | +1 / +1 | **C. Structural multiplier** | Indirect (assassin decomposition) | Yes | Yes | NO (modifier) | Per Red 2026-05-15 ruling, ratified as legitimate operator |
| `tapping` | modifier, body, +1/+1 | +1 / +1 | **C. Structural multiplier** | Yes (tapdown = tapping butterfly) | Yes | Yes | NO (modifier) | Per Red 2026-05-15 pt3 |
| `blazing` | modifier, body, +1/+1 | +1 / +1 | **C. Structural multiplier** | TBD | TBD | TBD | NO (modifier) | Operator-vs-trick boundary flagged in Red Wave 2; do not codify yet |
| `gyro` | modifier, body, +1/+1 | +1 / +1 | **C. Structural multiplier** | Yes (Mobius = gyro torque, gyro symposium torque) | Yes | Yes | NO (modifier) | Per memory, gyro vocab ratified by Red 2026-05-15 |
| `weaving` | modifier, body, +1/+1 | +1 / +1 | **C. Structural multiplier** | No active use | Indirect | Yes (head-path axis) | NO (modifier) | Ducking/diving/weaving/zulu four-way head-path family |
| `diving` | modifier, body, +1/+1 | +1 / +1 | **C. Structural multiplier** | No active use | Indirect | Yes (head-path axis) | NO (modifier) | Companion to weaving |
| `backside` | modifier, body, +1/+1 | +1 / +1 | **C. Structural multiplier** | No active use | Indirect | TBD | NO (modifier) | Side-positional axis (per memory pt12) |
| `xdex` | modifier, body, +1/+1 | +1 / +1 | **D. Operator modifier (dex archetype)** | Yes (atom-smasher Sprint 4 cites x-dex) | Yes | Yes (dex archetype axis) | NO (modifier) | Tightly bound to dex-archetype taxonomy |
| `terraging` | modifier, body, +3/+3 | +3 / +3 | **E. Canonical compound treated as multiplier** | TBD | TBD | TBD | NO (modifier; `terraging` = "double pixie" per memory) | Outlier: only +3 entry in modifier table; arguably should be unwound to pixie+pixie |
| `pixie` | modifier, set, +1/+1 | +1 / +1 | **C. Structural multiplier (set)** | Yes (Sprint 2 dimwalk; Sprint 3 smear) | Yes | Yes (set primitive axis) | Likely YES (the set primitive itself; tutorial-cited; folk-name compounds like dimwalk, smear use it as operator) | `pixie` is a borderline B/C entry: it acts as a set primitive (the bag-launch) AND as +1 operator on subsequent compounds |
| `fairy` | modifier, set, +1/+1 | +1 / +1 | **C. Structural multiplier (set)** | TBD (no canonical compound yet) | Yes | Yes | Likely YES (Red 2026-05-15: "Fairy = legit operator vocab"; set-primitive identity confirmed) | Same B/C borderline as pixie |
| `quantum` | modifier, set, +1/+1 | +1 / +1 | **C. Structural multiplier (set)** | TBD | Yes | Yes | Likely YES (set primitive; Red Wave 2 pending on operator-vs-trick boundary) | Set neighborhood: pixie / fairy / atomic / quantum / nuclear |
| `blurry` | modifier, set, +1/+1 | +1 / +1 | **C. Structural multiplier (set)** | Indirect (Red pt6 collapsed "blurry whirl" → "stepping paradox whirl") | Yes | Yes | NO (modifier; Red ruling collapses blurry to stepping+paradox stack) | Red 2026-05-15 ratified `Blurry = Stepping Paradox Whirl = 5` |
| `nuclear` | modifier, set, +2/+2 | +2 / +2 | **C. Structural multiplier (set, +2)** | TBD | Yes | Yes | TBD (set primitive but heavier ADD; nuclear-mirage flagged not-found-anywhere in workbook) | Only +2 set modifier with symmetric rotational treatment |
| `shooting` | modifier, set, +3/+3 | +3 / +3 | **C/E. Multiplier-flavored canonical compound** | TBD | TBD | TBD | TBD | The +3 outlier in the set bucket; doctrinal unclear |
| `pogo` | modifier, set, +0/+0 | +0 / +0 | **D. Operator modifier (zero-ADD)** | Yes (zero-ADD operator) | Indirect | TBD | NO (modifier) | Red pt5 confirmed: pogo is a set but does not add ADD |
| `rooted` | modifier, set, +0/+0 | +0 / +0 | **D. Operator modifier (zero-ADD)** | TBD | Indirect | TBD | NO (modifier) | Second zero-ADD set modifier; pairs with pogo doctrinally |
| `flying` | NOT in modifier table | (treated as +1 in flying-clipper Sprint 5) | **C. Structural multiplier (body modifier; not in DB)** | Yes (Sprint 5 flying-clipper) | Yes | Yes (no-plant suspension axis) | YES selectively (flying-inside, flying-outside are 1-ADD body primitives; flying-clipper is +1-stack compound) | The user's emerging doctrine confirms flying as +1 multiplier; modifier-table addition is a curator-paced follow-on |
| `swing` | NOT in modifier table | (treated as +1 in pendulum, rake Sprint 5/6) | **C. Structural multiplier (movement element; not in DB)** | Yes (Sprint 5 pendulum, Sprint 6 rake) | Yes | TBD | NO (movement element, not standalone) | Curator-locked 2026-05-19 swing-element doctrine; movement element class, not a named modifier |
| `reverse` / `rev` | NOT in modifier table | `rev(+0)` per Red 2026-05-11 | **A. Directional reversal** | Yes (Sprint 2 rev-whirl + orbit; Sprint 3 rev-up) | Yes (with explicit `rev(+0)` notation) | TBD | NO (operator; not a trick on its own) | Three Sprint entries use `reverse(+0)` derivation; consolidate notation per §6 |

Total operators audited: 31 (27 in modifier table + 4 NOT in modifier table but in active formula use: `double`, `flying`, `swing`, `reverse`).

### 1.3 Findings: the four NOT-IN-TABLE operators

The four operators with no row in `freestyle_trick_modifiers` are precisely the operators surfaced by recent doctrinal work:

1. `double` — used in `double-around-the-world` (adds=3) and `double-leg-over` (adds=3) and `double-spin` (adds=2). No formula entry in resolved formulas captures `double` arithmetic explicitly. The math `double(+1) + ATW(2) = 3` is currently implicit in row data only.
2. `flying` — used in `flying-clipper` (Sprint 5; adds=2). Formula explicit.
3. `swing` — used in `pendulum` (Sprint 5; adds=2) and `rake` (Sprint 6; adds=2). Formula explicit.
4. `reverse` — used in `rev-whirl`, `orbit`, `rev-up` (Sprints 2-3; all adds=3 or 2). Formula explicit with `rev(+0)`.

The user's audit-direction frames `flying`, `swing`, `double` as **structural multipliers** (each contributing +1 ADD) and `reverse` as a **direction marker** (+0 ADD). This is consistent with current resolved-formula derivations.

**Doctrine-risk question:** should `double`, `flying`, `swing`, `reverse` enter the `freestyle_trick_modifiers` table as DB rows?

- Argument for: catalog completeness; modifier-link table can then reference them; allows future formula validation against DB.
- Argument against: `freestyle_trick_modifiers` currently has a fixed shape (`add_bonus` + `add_bonus_rotational` integer columns) that does not represent `reverse(+0)` or `swing` (which is a movement element, not a body/set modifier). Adding them under the current schema would either misrepresent their class or require schema migration (forbidden by constraint).
- Recommendation: defer. Keep them in formula-only territory until the modifier_type taxonomy expands (post Red Wave 2). Surface in workbook via new column (§3 below).

---

## 2. double-* / triple- / multi-dex / multi-spin reconciliation sweep

### 2.1 Current `double-*` inventory

| Slug | adds | base_trick | trick_family | category | Status |
|---|---|---|---|---|---|
| `double-around-the-world` | 3 | around-the-world | atw | dex | Canonical historical row; `double(+1) + ATW(2) = 3` implicit |
| `double-leg-over` | 3 | legover | legover | compound | Canonical historical row; `double(+1) + legover(2) = 3` implicit. Note: dual-membership candidate per Slice O (also reads as "miraging legover") |
| `double-spin` | 2 | double-spin | double-spin | body | **STALE.** Reclassified as modifier in 2026-05-19 emergency slice but canonical row still active; flagged in workbook as `missing_ifpa_formula` because the row is a non-trick |
| `spin` | 1 | spin | spin | body | Body primitive; row IS the trick |

`triple-*`: zero entries in current DB. No active doctrine.

`multi-dex` / `multi-spin`: not used as multiplier prefixes; the dex archetype taxonomy lives in modifier `xdex` and the dex-archetype axis in the movement system view.

### 2.2 Candidate cleanup queue (mechanical, safe)

| # | Action | Risk | Rationale |
|---|---|---|---|
| 2a | Deactivate `double-spin` canonical row (`is_active: 1 → 0` via red_corrections) | **Low.** Same mechanic as today's reverse-around-the-world consolidation. The row was reclassified as a modifier in the 2026-05-19 emergency slice and no longer represents a canonical trick. Workbook flags it as data debt. | Closes a known-stale row; identical cleanup pattern as reverse-around-the-world. |

### 2.3 Doctrine-risk queue (needs curator decision before mechanical work)

| # | Decision needed | Risk if applied mechanically |
|---|---|---|
| 2b | Should `double-around-the-world` and `double-leg-over` add resolved-formula entries (Sprint 7 doctrine: `double(+1)` multiplier)? | Medium. The arithmetic is correct, but committing `double(+1)` doctrine in resolved formulas pre-emptively locks an operator class before the modifier-table representation is decided. Recommended path: write the doctrine in this exploration doc; defer Sprint 7 entry until the modifier-table question (§1.3) is settled. |
| 2c | Should `double-leg-over` carry a dual-membership (legover-family AND miraging-element)? | Medium. Slice O already flagged this. The `double(+1)` doctrine here intersects with the `miraging` chain reading. Curator decision needed. |
| 2d | Should `terraging` (currently +3 modifier) be unwound to `pixie(+1) + pixie(+1) + base` per the "terraging = double pixie" memory note? | Medium-high. Modifier table change. If terraging is structurally "double pixie", then it is an instance of the `double` multiplier on `pixie` (an operator on an operator). This is the most exotic stacking case in the dictionary. Defer to Red Wave 2 doctrine. |

### 2.4 Red-question queue (Wave 2 packet additions)

| # | Question for Red |
|---|---|
| 2-R1 | Is `double` a +1 ADD multiplier in general, or does its contribution depend on what is being doubled (i.e., is `double-spin` adds=2 because spin=1 + double(+1), or because the second rotation adds +1, or for a different structural reason)? |
| 2-R2 | Does `double` stack with other multipliers (e.g., would `double paradox mirage` = double(+1) + paradox(+1) + mirage(2) = 4 ADD)? Are there competition-record examples? |
| 2-R3 | Is `triple` a +2 ADD multiplier (one step above double)? Or non-linear? Or non-canonical? |
| 2-R4 | For `terraging` (currently labeled "double pixie"): is the structural reading `pixie + pixie + base` (multiplier on operator), or is `terraging` itself an irreducible set primitive that happens to feel like "double pixie" pedagogically? |
| 2-R5 | Does `flying` always contribute +1 ADD, including when stacked with itself (`double flying X`)? |

---

## 3. Workbook column-extension recommendations

The reconciliation workbook at `legacy_data/scripts/build_trick_reconciliation_workbook.py` currently outputs ~10 columns capturing IFPA-vs-external formula reconciliation. The user has explicitly capped scope at "minimal and strategic."

### 3.1 Recommended NEW columns (4 total, strictly additive)

| Column | Type | Purpose | Population source |
|---|---|---|---|
| `ontology_class` | enum | A / B / C / D / E per §1.1 taxonomy | Curator-authored in a new TS content module (e.g., `freestyleOperatorOntology.ts`); fallback empty |
| `reversal_of` | slug or null | If this row is a directional reversal, the base atom slug (e.g., orbit → around-the-world; illusion → mirage; pickup → legover; whip → whirl IF that doctrine ratifies) | Curator-authored TS map; not derived from notation |
| `rev_operator_used` | bool | Whether the resolved formula uses `rev(+0)` notation | Derived from `freestyleResolvedFormulas.ts` derivation strings (grep for `'reverse(+0)'`) |
| `multiplier_operator` | slug or null | If this row's resolved formula uses a non-in-table multiplier (`double`, `flying`, `swing`, `reverse`), name it | Derived from resolved formula `operator` field |

### 3.2 Columns NOT recommended in this slice

| Column | Why deferred |
|---|---|
| `canonicalization_status` | Overlaps existing `status` column; would create taxonomy-of-taxonomy confusion |
| `standalone_trick_allowed` | Curator decision per row; encoding in workbook requires per-row review queue, not column. Better expressed as part of `ontology_class` if classes carry "standalone-row-allowed" semantics |
| `accounting_pattern` | Vague; needs decomposition into the four columns above before being useful |
| `zero_add_operator`, `direction_variant`, `canonical_reverse_status` | All subsumed by `rev_operator_used` + `reversal_of`; collapsing avoids redundancy |

### 3.3 Implementation footprint

- New TS content module `src/content/freestyleOperatorOntology.ts` (curator-authored maps; reversible per `feedback_reversible_content_governance`).
- One-line addition to `build_trick_reconciliation_workbook.py` per new column.
- No DB schema change.
- No loader change.

Defer the implementation until the doctrine of §1 is curator-accepted and the §4 cleanups are decided.

---

## 4. Safe mechanical cleanup queue

Zero items qualify as safe + mechanical at this audit point. The original §4.1 proposal (deactivate `double-spin` canonical row) was retracted after research — see §4.1 retraction below.

### 4.1 Retracted: `double-spin` deactivation is NOT a valid cleanup

Initial drafting of this audit proposed deactivating the `double-spin` canonical row based on the reconciliation workbook's companion-note text ("Reclassified as modifier 2026-05-19 emergency slice; no longer a canonical trick row"). Pre-application research surfaced that the companion text was misleading. The actual 2026-05-19 emergency slice ruling, captured in `src/content/freestyleTrickKindOverrides.ts:84-91`, is materially different:

> double-spin is a body/operator concept, not a standalone trick — same status as `spin`. It is not a settled canonical trick row absent a bag-contact resolution. Curator ruling. Filters it off the canonical trick browse views (ADD / family / movement-system / topology / category). **The DB row stays active for operator-layer surfaces (glossary / movement-system as a modifier).**

Supporting evidence that the row should remain active:

- `CANONICALIZATION_POLICY.md` §C lists `double-spin` as a body primitive alongside spin / hop-over / walk-over / flying-inside / flying-outside / spyro.
- `CANONICALIZATION_POLICY.md` §10 lists `double-spin` as a Red pt3 "stabilized canonical": "community-fixed name; pairs with `spin` as a body-primitive ladder."
- `freestyleResolvedFormulas.ts:390` Sprint 5 comment treats `double-spin` as a body primitive parallel to `spin` and `hop-over` (irreducible; no compound +1 stack).
- No aliases, no modifier_links, no operational notation expected (body primitives are intrinsic).

The reclassification was a FILTER (kind-override), not a DEACTIVATION (is_active flip). Deactivating the row would contradict the explicit curator ruling and break the operator-layer surfaces the kind-override comment named as legitimate consumers.

**Corrective edits applied 2026-05-19 alongside this retraction:**

1. `legacy_data/scripts/build_trick_reconciliation_workbook.py:595` — companion-note rewritten to accurately reflect the kind-override mechanic instead of the misleading "no longer a canonical trick row" framing.
2. This §4.1 retraction (the present text).

### 4.2 General observation about cleanup-queue safety

The retraction illustrates an audit-process hazard worth recording for future curator + Claude collaboration: workbook companion notes and memory entries are loss-of-information surfaces. They summarize ruling decisions into one-liners that lose the materially-relevant nuance ("filter from browse views" compressed to "no longer a canonical trick row"). Before any cleanup-queue item is approved, the cleanup-proposer must verify the actual ruling against the artifact that captured it (here: `freestyleTrickKindOverrides.ts` + `CANONICALIZATION_POLICY.md`), not against the summary-of-the-summary.

### 4.2 NOT-cleanup (curator-decision-blocked)

| # | Potentially-safe-looking change | Why NOT mechanical |
|---|---|---|
| 4b | Add resolved-formula entries for `double-around-the-world` and `double-leg-over` | Locks `double(+1)` doctrine before curator + Red confirmation |
| 4c | Move `swing` and `flying` into `freestyle_trick_modifiers` table | Schema-shape mismatch (no movement-element type) + curator-paced |
| 4d | Add `reverse` as a modifier-table entry with add_bonus=0 | Bypasses the question of whether `reverse` is a modifier or a positional marker |
| 4e | Auto-generate aliases like `reverse-mirage`, `reverse-legover`, `reverse-whirl` based on the rev(+0) pattern | The user explicitly warns against generalizing orbit logic automatically |
| 4f | Generalize the reverse-X / X consolidation pattern beyond ATW | Same: each pair needs case-by-case Red/curator review |

---

## 5. Relationship to executable accounting

This audit's doctrinal stabilization is upstream of every downstream accounting surface. Each surface relates as follows:

### 5.1 Computed ADD formulas (resolved formulas)

Currently 29 entries in `freestyleResolvedFormulas.ts` across Sprints 1-6. Each entry has a single `operator` field (often a chain like `'paradox + symposium'`) plus a `derivation` string. The audit's taxonomy maps each operator string to one of the five classes A-E.

**Recommendation:** add an optional `operatorClass: 'A' | 'B' | 'C' | 'D' | 'E'` field to `ResolvedFormula` (curator-authored; defaults absent for legacy entries). Use it to validate downstream rendering and to populate the workbook's new `ontology_class` column without parsing the derivation string.

### 5.2 Resolved formulas vs symbolic shorthand

Symbolic shorthand lives in `freestyleSymbolicEquivalences.ts` (chain registry: `mobius ≡ gyro torque`, etc.). Resolved formulas live in `freestyleResolvedFormulas.ts`. They are intentionally separate surfaces:

- Symbolic shorthand: the canonical chain reading (curator-authored).
- Resolved formula: the arithmetic ADD derivation (curator-authored).

These should remain separate. The audit does NOT propose consolidating them.

### 5.3 Executable accounting panels

The `/freestyle/add-analysis` page renders Sprint rows from `freestyleResolvedFormulas.ts`. The audit's taxonomy + ontology_class field would let the panel optionally group rows by operator class (A reversals together, B body primitives together, etc.). This is a future UI consideration; the audit does NOT propose UI changes now.

### 5.4 Operational notation

Notation grammar lives in `exploration/freestyle-notation-grammar/NOTATION_STYLE_GUIDE.md`. The grammar's §13 / §13.9 cover compound notation. The audit's class A (directional reversal) maps to the `reverse` token in operational notation; the audit's class C (structural multiplier) maps to modifier tokens. No grammar change is needed; the doctrine clarifies which token to use, not what tokens exist.

### 5.5 Parser separation

Per `feedback_parser_editorial_separation`, the parser reads `canonical_name` only; the editorial layer reads `base_trick` + `freestyle_trick_modifier_links` strictly. The audit's taxonomy is editorial. The parser stays untouched.

### 5.6 Future UI exposure

The user explicitly defers UI exposure. The audit honors this: every recommendation in §1-§4 lands in workbook + TS content modules only. No template, partial, or CSS change is proposed.

---

## 6. rev(+0) operator audit (addendum)

### 6.1 Current usage of `rev(+0)`

Three resolved-formula entries currently use the `reverse(+0) + base(N) = N ADD` pattern:

| Entry | Derivation | Notes |
|---|---|---|
| `rev-whirl` (Sprint 2) | `reverse(+0) + whirl(3) = 3 ADD` | Folk-named rev whirl; canonical row exists at adds=3 |
| `orbit` (Sprint 2, slug-renamed today from `reverse-around-the-world`) | `reverse(+0) + around-the-world(2) = 2 ADD` | Canonical row activated today; legacy duplicate consolidated |
| `rev-up` (Sprint 3) | `reverse(+0) + whirl(3) = 3 ADD` | Folk-named rev up; canonical row exists at adds=3; provenance flags curator uncertainty (could share decomposition with rev-whirl or be structurally distinct) |

### 6.2 Direction-variant atom pairs in current DB

| Pair | Both rows canonical? | adds match? | Pair status |
|---|---|---|---|
| `around-the-world` / `orbit` | Yes, both | 2 / 2 | Confirmed; orbit activated today |
| `mirage` / `illusion` | Yes, both | 2 / 2 | Red 2026-05-11: mirage ≠ illusion (direction is structural) |
| `legover` / `pickup` | Yes, both | 2 / 2 | Both canonical; doctrinal reverse-of relationship unconfirmed |
| `whirl` / `swirl` | Yes, both | 3 / 3 | Peer atoms; swirl is the dorsal-anchor variant, NOT a directional reversal of whirl |
| `whirl` / `whip` | `whip` NOT in DB | N/A | The user's emerging doctrine proposes `whip = rev whirl`; canonical row absent; folk distinction may be the existing `rev-whirl` row |

### 6.3 Recommendations on rev(+0) representation

| Surface | Recommendation |
|---|---|
| **Compact notation (chain reading)** | Continue using existing chain readings: `rev whirl`, `reverse around-the-world` (alias-form) or `orbit` (canonical). No change. |
| **Operational notation** | Continue using existing notation grammar tokens (`> ... > op ...`). No change. |
| **ADD formula (resolved formulas)** | Standardize on `reverse(+0)` (already in use for 3 entries). New direction-variant entries should use the same form. |
| **Reversal-relationship workbook column** | Add `reversal_of` per §3.1; populate for confirmed pairs (orbit → around-the-world; illusion → mirage; pickup → legover). Leave `whip` empty pending Red. |
| **Alias governance** | Aliases for `reverse-X` forms point at the canonical slug per CORE-ATOM-CANONICAL-RECONCILE-1 pattern. orbit + reverse-around-the-world is the precedent. |
| **Canonical trick identity** | Direction-variant pairs may both be canonical when historically stabilized (orbit, illusion, pickup). Do NOT auto-promote new reverse-X rows. Each promotion is a curator decision. |

### 6.4 Where rev(+0) is NOT appropriate

The user's caution is well-founded: `rev` should NOT be assumed equivalent to ADD multipliers like `double(+1)`, `spinning(+1)`, `ducking(+1)`. The two patterns differ:

- `rev(+0)` changes identity / direction / naming but contributes zero ADD.
- ADD multipliers contribute +1 (or +2 rotational) and stack.

These should remain distinct in:
- Resolved-formula derivation string (use `rev(+0)` vs `multiplier(+1)`).
- Workbook columns (`rev_operator_used` bool vs `multiplier_operator` slug; see §3.1).
- Class label (`A. Directional reversal` vs `C. Structural multiplier`; see §1.1).

### 6.5 Open Red/curator questions on rev(+0)

| # | Question |
|---|---|
| 6-R1 | Is `illusion = rev(+0) + mirage` the canonical structural reading of illusion, or is illusion a peer atom (independently named, separately learned)? Both rows currently exist in DB at adds=2. |
| 6-R2 | Same question for `pickup = rev(+0) + legover`. |
| 6-R3 | Is `whip = rev(+0) + whirl` a canonical reading? Currently `whip` is not in DB; the existing folk-named `rev-whirl` row may BE whip. |
| 6-R4 | For folk-named rows with the same `rev(+0) + base` derivation (currently `rev-whirl` and `rev-up`), should the dictionary preserve both as separate canonical rows or merge to one? The Sprint 3 provenance note flags this. |
| 6-R5 | Does `rev` stack with itself? (Almost certainly no; the question is whether the doctrine should be encoded.) |
| 6-R6 | Does `rev` stack with a multiplier? E.g., does `reverse spinning whirl` resolve as `rev(+0) + spinning(+1) + whirl(3) = 4 ADD`? Or does the multiplier subsume the reverse direction implicitly? |

---

## 7. Constraints honored

| Constraint | How honored |
|---|---|
| No schema migration | All recommendations in TS content + workbook generator + CSV + resolved-formula content. Zero `database/schema.sql` change. |
| No parser rewrite | Parser layer untouched. All doctrine is editorial. |
| No giant implementation wave | Audit-only deliverable; one safe mechanical cleanup (double-spin deactivation) plus deferred items. |
| No broad canonicalization | Zero new `freestyle_tricks` rows proposed. The double-spin item deactivates an existing row; it does not add new rows. |
| No fake formulas | Every formula cited above already exists in `freestyleResolvedFormulas.ts`. No new derivations proposed. |
| No premature doctrine hardening | The five-class taxonomy is explicitly labeled observational. Class boundaries flagged where unclear. |
| No broad UI redesign | Zero template / partial / CSS changes. The /freestyle/add-analysis surface is mentioned only in §5.3 as future consideration. |
| Workbook-first architecture | The minimal column extension at §3 is workbook-first. UI surfaces are downstream. |

---

## 8. Implementation-risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Premature `double(+1)` doctrine commits | **Medium**. The math is correct but locking the multiplier class before Red Wave 2 confirms generalizability would prevent later refinement. | Defer Sprint 7 entries for double-X tricks until curator + Red confirm. The doctrine document IS the curator artifact for confirmation; no code change required to surface the question. |
| `terraging` unwinding to `pixie + pixie` would touch a +3 modifier | **Medium-high**. The only +3 entry in the modifier table; mechanical removal would affect any compound that uses terraging. | Defer entirely. Surface as Red-Wave-2 question 2-R4. |
| Auto-applying orbit pattern to other reverse-X pairs (mirage/illusion, legover/pickup, whirl/whip) | **High**. Each pair has different historical stabilization; mirage/illusion are independently canonical by Red ruling. | Constraint already honored: §4.2 lists this as NOT-cleanup. The audit explicitly refuses to generalize. |
| Modifier-table entries for `double`, `flying`, `swing`, `reverse` | **High** under current schema. The +0/+1/+1/+1 shape forces classification into existing `modifier_type` enum which may misrepresent the new classes. | Defer until modifier_type taxonomy expansion (post-Red Wave 2). |
| Workbook column proliferation | **Low**. The §3 recommendation caps additions at 4; the §3.2 rejections enumerate columns NOT recommended. | Constraint already honored. |
| ~~`double-spin` deactivation~~ — RETRACTED per §4.1 | N/A | The original recommendation was based on misleading workbook companion text; pre-application research revealed the row should stay active per the explicit kind-override curator ruling. Corrective edit applied to the workbook companion text. |

---

## 9. Recommended next steps (curator-paced)

The audit positions the curator to make six discrete decisions, in roughly this order:

1. **Confirm the five-class taxonomy (§1.1)** — accept / refine the A/B/C/D/E framing. Once confirmed, the workbook column extension (§3) becomes the natural codification surface.

2. ~~Approve `double-spin` mechanical cleanup~~ — RETRACTED per §4.1; the cleanup as scoped would have contradicted the 2026-05-19 emergency-slice ruling. Corrective edit to the workbook companion text was applied instead.

3. **Decide on `freestyleOperatorOntology.ts` TS content module (§3.3)** — if accepted, the workbook columns can be populated and downstream surfaces (executable accounting, future UI grouping) can consume the classification.

4. **Decide on Sprint 7 resolved-formula entries for `double-around-the-world` + `double-leg-over` (§2.3 2b)** — locks the `double(+1)` doctrine. Risk: pre-emptive lock.

5. **Add Red Wave 2 packet questions (§2.4 + §6.5)** — surface 11 specific questions (2-R1 through 2-R5; 6-R1 through 6-R6) to the next Red consultation.

6. **Decide on `terraging` unwinding (§2.3 2d)** — the most exotic operator-stacking case. Defer until Wave 2 answers.

No code change is required to act on (1), (3), (5), or (6). Item (2) is now retracted; item (4) is medium scope.

---

## Appendix A: source inventory used in this audit

- `database/footbag.db` — current DB state
  - `freestyle_trick_modifiers` (27 rows; 16 body / 11 set)
  - `freestyle_tricks` (130 active rows; 4 `double-*` rows; 10 direction-variant atoms)
  - `freestyle_trick_modifier_links` (modifier-to-trick joins; queried for double-* rows; empty)
- `src/content/freestyleResolvedFormulas.ts` — 29 formula entries; 3 use `reverse(+0)`
- `src/content/freestyleSymbolicEquivalences.ts` — chain registry; orbit declared canonical per CORE-ATOM-CANONICAL-RECONCILE-1
- `src/services/coreTrickRegistry.ts` — 12-atom core registry
- `src/content/freestyleAddDisagreements.ts` — IFPA-vs-PB ADD-count audit content
- `src/content/freestyleFamilyOverrides.ts` — Slice J/M family taxonomy modules
- `legacy_data/reports/trick_reconciliation_summary.md` — 91-row reconciliation workbook output (post orbit activation: 1 add_disagreement / 40 agreement / 5 missing_external / 34 missing_ifpa / 11 not_found)
- `legacy_data/scripts/build_trick_reconciliation_workbook.py` — workbook generator
- `exploration/freestyle-notation-grammar/NOTATION_STYLE_GUIDE.md` — operational notation grammar (§13 / §13.9 compound notation)

---

## Appendix B: terminology used in this audit

- **Operator** — any token that participates in a trick's structural decomposition (modifier, multiplier, reversal, primitive).
- **Modifier** — operator that participates in `freestyle_trick_modifier_links` (DB-registered).
- **Multiplier** — operator that contributes +1 (or +2 rotational) ADD; subset of modifiers + the four NOT-in-table cases.
- **Atom** — irreducible canonical trick; member of the 12-atom core registry.
- **Compound** — non-atom canonical trick built from modifiers + atoms (e.g., paradox-mirage).
- **Folk name** — historical / community name that resolves to a structural reading (e.g., smear = pixie mirage, ripwalk = stepping butterfly).
- **rev(+0)** — direction-reversal operator contributing zero ADD; explicit notation in resolved-formula derivations.
- **Direction-variant pair** — two canonical atoms related by reversal (orbit/ATW, mirage/illusion, pickup/legover).
- **Ontology class** — A / B / C / D / E per §1.1; the audit's central observational classification.
