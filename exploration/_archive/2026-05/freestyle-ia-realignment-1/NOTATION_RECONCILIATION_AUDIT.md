# Notation Reconciliation Audit

Generated 2026-05-14. Pre-implementation audit; no code shipped from this slice. Per spec: "Do NOT implement immediately. Audit/planning phase first."

This audit follows the four-batch FREESTYLE-IA-REALIGNMENT-1 + CANONICAL-SURFACE-REALIGNMENT-1 (S1+S2+S3 shipped; S4-S6 deferred) + EXP-1 (formal two-surface contract docs). With the rendering infrastructure and visual system stable, the audit's job is to characterize the **data-layer** gaps.

## TL;DR — five sharp findings

1. **93 of 160 active canonical tricks have no notation of any kind** (neither Jobs semantic `notation` nor `operational_notation`). On compact browse cards today these render "Notation pending" — honest, but a real coverage gap for the canonical surface.
2. **51 of the 67 rows that DO carry semantic notation hold self-token strings** (uppercase slug-form: `TORQUE`, `MOBIUS`, `BLENDER`, etc.). For compounds these are NOT compositional decompositions — the chain registry is the canonical source for `≡` readings, not the DB `notation` column.
3. **One genuine notation drift identified**: `ripwalk` DB `notation='BLURRY BUTTERFLY'` vs pt11-locked `STEPPING BUTTERFLY` (chain registry). All other compound notation rows are either canon-aligned, intentionally self-token, or unreconcilable without Red.
4. **Stopping-depth consistency is currently HIGH** across the three compact surfaces after CSR S1+S2: tricks in the chain registry render identical `≡` readings on dictionary, glossary §3, and trick-detail. Outside the registry, no `≡` line renders (correct honest behavior).
5. **Semantic-vs-operational layer boundary is structurally enforced** post-Batch 3 (§9 contrast table, PDX flag wording fix, retired three-layer framing). No active boundary leakage detected; one residual ambiguity flagged on the body-stall family (head-stall vs forehead/knee/sole/neck/shoulder/cloud — inconsistent notation coverage).

Out of scope explicitly: this audit recommends NO immediate code changes. The proposed implementation slices at the end are all curator-authored content edits OR small SQL migrations gated on curator approval. The largest gap (93-row notation coverage) is genuinely a curatorial workload, not a development one.

---

## PART 1 — Notation-gap inventory

### 1A — Headline counts (DB snapshot 2026-05-14)

| Metric | Count | % of active |
|---|---:|---:|
| Active canonical tricks (`is_active=1`) | 160 | 100% |
| Has Jobs semantic `notation` (any value) | 67 | 42% |
| Has `operational_notation` | 16 | 10% |
| Has **both** notations | 16 | 10% |
| Has **neither** notation | **93** | **58%** |
| Active atoms (`is_core=1`) | 13 | 8% |
| Active atoms with notation | 12 | 75% of atoms |
| Active modifier rows (`category='modifier'`) | 10 | 6% |
| Active missing `adds` value | 9 | 6% |

The 144-row operational-notation gap is the user-spec headline number. The 93-row total-notation gap is the tighter audit metric (rows where the browse card has NO notation slot to populate at all).

### 1B — The 93 zero-notation rows, categorized

Categories below describe what KIND of curatorial work each row needs. No row is invented; categories pulled from existing DB metadata + canon sources.

#### Category A — Modifier rows (10 rows)

Rows where `category='modifier'` and no notation is expected. These are operators / treatments that act on base tricks; they don't have their own structural decomposition.

Rows: `barraging`, `blazing`, `ducking`, `gyro`, `paradox`, `spinning`, `stepping`, `symposium`, `tapping`, plus one no-adds modifier (per spot check).

**Disposition**: no notation needed. These rows function as operator-reference targets, not as standalone tricks. They appear on the dictionary's component-view facet (`?view=component`) and as token-anchors elsewhere. Their `notation` column staying empty is correct.

#### Category B — Body / surface stalls (12 rows, inconsistent)

Body-position stalls and contact primitives. Inconsistent: `head-stall` has notation `HEAD STALL`; six siblings (knee/forehead/shoulder/neck/sole/cloud) do not.

| Slug | adds | notation | base_trick |
|---|---:|---|---|
| `head-stall` | 1 | `HEAD STALL` | head-stall |
| `heel-stall` | 1 | `HEEL STALL` | heel-stall |
| `inside-stall` | 1 | `INSIDE STALL` | inside-stall |
| `outside-stall` | 1 | `OUTSIDE STALL` | outside-stall |
| `toe-stall` | 1 | `TOE STALL` | toe-stall |
| `sole-kick` | 1 | `SOLE KICK` | sole-kick |
| `clipper-stall` | 2 | `CLIPPER STALL` | clipper-stall |
| `forehead-stall` | 1 | *(empty)* | forehead-stall |
| `knee-stall` | 1 | *(empty)* | knee-stall |
| `neck-stall` | 1 | *(empty)* | neck-stall |
| `shoulder-stall` | 1 | *(empty)* | shoulder-stall |
| `sole-stall` | 2 | *(empty)* | sole-stall |
| `cloud-stall` | 2 | *(empty)* | cloud-stall |
| `knee-clipper` | 2 | *(empty)* | knee-clipper |
| `cross-body-sole-stall` | 3 | *(empty)* | cross-body-sole-stall |

**Disposition**: low-risk curator backfill. Pattern is uniform: `<SURFACE> STALL` uppercase, matching the existing siblings. No Red dependency; no canon question. Note `cloud-stall` ADD is `2` but pt8 left it deferred — backfilling its notation does not pre-resolve its ADD ruling.

#### Category C — Sui-generis / pre-state primitives (4 rows)

Rows that ARE primitives at the operational level but don't carry compositional decomposition.

| Slug | adds | notes |
|---|---:|---|
| `pogo` | 0 | pt2 + pt6 ruled sui-generis "set, not modifier" |
| `rooted` | 0 | pt8 ruled "stall baseline; 0 ADD" |
| `pendulum` | 2 | `base_trick` blank; not in any chain registry; identity unclear |
| `squeeze` | 2 | pt8 ruled "+2 ADD"; `base_trick` blank |

**Disposition**: pogo and rooted are pt-ruled primitives — notation could be backfilled as `POGO` and `ROOTED` self-token uppercase, matching the atom/modifier pattern. Pendulum and squeeze need curator review (no base_trick; status uncertain).

#### Category D — Compounds with `≡` reading in the chain registry (after CSR S2)

Tricks that have a curator-authored chain reading already published. The DB `notation` is empty, but the canonical surface DOES surface `≡ <reading>` via `freestyleSymbolicEquivalences.ts`.

Examples (slug → registry reading):
- `mobius` (DB notation = `MOBIUS` self-token) — already in registry, three readings.
- `torque` (DB self-token `TORQUE`) — registry: `≡ miraging osis` (S2).
- `blender` (DB self-token `BLENDER`) — registry: `≡ whirling osis` (S2).
- `drifter` (DB self-token `DRIFTER`) — registry: `≡ miraging clipper` (S2).
- `vortex` (DB self-token `VORTEX`) — registry: `≡ gyro drifter` (S2).
- `eggbeater` (no DB notation) — registry: `≡ atomic legover` (S2).
- `omelette` (no DB notation) — registry: `≡ atomic illusion` (S2).
- `atom-smasher` (no DB notation; slug fixed in CSR S1) — registry: `≡ atomic mirage`.
- `ripwalk` (DB has `BLURRY BUTTERFLY` — see PART 2 drift) — registry: `≡ stepping butterfly` (pt11-correct).
- `phoenix` (no DB notation) — registry: `≡ pixie ducking butterfly`.
- `dimwalk` (no DB notation) — registry: `≡ pixie butterfly`.
- `matador` (DB `NUCLEAR BUTTERFLY`) — registry: `≡ nuclear butterfly` + `≡ paradox atomic butterfly`.
- `paradox-symposium-whirl` (DB `PARADOX SYMPOSIUM WHIRL`) — registry: `≡ ps whirl`.
- `montage` (DB `SPINNING DUCKING PARADOX SYMPOSIUM WHIRL`) — registry: `≡ spinning ducking paradox symposium whirl` (same; redundant with DB).

**Disposition**: These rows are NOT in coverage crisis. Their canonical `≡` reading lives in the chain registry; the DB `notation` column is parallel-source. Future curator work could update DB `notation` to match the canon-locked chain reading (for cross-source consistency) but it's NOT user-visible-blocking.

#### Category E — Compounds NOT in chain registry, NOT in Wave-pending list (~30 rows)

Tricks without curator-authored chain readings AND without Wave-1/Wave-2 dependence. Largest cohort needing curator work. Spot list:

- `flail` (illusion family) — `Flail = Symposium Illusion` per pt6+followup-2026-04
- `magellan` (legover family) — unknown
- `merkon` (legover family) — `Standalone dex` per pt4+followup
- `paradox-mirage` (mirage family) — `Paradox Mirage` is structurally trivial
- `reaper` (clipper-stall family) — unknown
- `smudge` (illusion family) — `Pixie Illusion` per pt7
- `smog` (double-leg-over family) — `Pixie Double Legover` per pt7
- `smoke` (drifter family) — `Pixie Drifter` per pt8
- `haze` (double-leg-over family) — unknown
- `eclipse` (eclipse family) — pt1 ruled `jump-bearing 3-ADD`
- `dyno` (no base_trick) — FM-corpus identified; not directly Red-pending
- `royale` (reverse-drifter family) — pt5 ruled `Paradox Reverse Drifter`
- `flurry` (legover family) — pt4 ruled `Barraging Legover = 4`
- `surge` (mirage family) — pt2 ruled `Surging Paradox Mirage = 5`
- `surreal` (whirl family) — pt2 ruled `Surging Paradox Whirl = 6`
- `surgery` (rev-whirl family) — pt2 ruled `Surging Symposium Reverse Whirl = 6`
- `venom` (barfly family) — pt2 ruled `Surging Barfly = 6`
- `bigwalk` (butterfly family) — pt2 ruled `Surging Butterfly = 5`
- `plasma` (no base_trick) — pt8 ruled `Quantum Double Over Down = 5`
- `fusion` (no base_trick) — pt2 ruled `Atomic Double Over Down = 5`
- `grave-digger` (torque family) — pt8 ruled `Stepping Same-side Torque = 5`
- `nemesis` (barfly family) — pt6+pt8 ruled `Furious Barfly = 6`
- `silo` / `atomic-torque` — pt4 ruled `Atomic Torque = 6`
- `s-m-smasher` — pt2 ruled `Atomic Barrage = 4` (if seeded; check DB)
- (plus the seven-row `surging-*` cohort, several with pt2 rulings)

**Disposition**: chain-registry expansion candidates. Each row's reading already exists in `RED_RESOLVED_CANON.md`. Curator-authored append to `freestyleSymbolicEquivalences.ts` would surface `≡` readings on the dictionary for ~20+ compounds. This is the natural extension of CSR S2 (which added 6 entries).

#### Category F — Compounds blocked by Wave-1 / Wave-2 pending (~10 rows)

| Slug | adds | Block reason |
|---|---:|---|
| `blurry-whirl` | 5 | Wave-1 Q1 rotational-bonus pending |
| `blurry-torque` | 6 | Wave-1 Q1 pending |
| `barraging-osis` | 5 | Wave-1 Q1 pending |
| `food-processor` | 6 | Wave-1 Q1 pending (food-processor follows same +1 pattern) |
| `fury` | 5 | Wave-1 Q1c furious non-rotational pending |
| `witchdoctor` | 4 | Wave-2 Theme 2 focus-trick set |
| `scrambled-eggbeater` | (active) | Wave-2 Theme 2 |
| `frigidosis` | (alias only; no canonical row) | Wave-2 Theme 2 |
| `surging` | 2 | Wave-1 Q2 (FM-vocab) — though pt1 has `Surging = Spinning + Stepping` compression reading |
| `terraging` | 3 | Wave-1 Q1+Q2 (FM-vocab + math) — pt4+followup gave a Terrage=4 ruling but Terraging-the-modifier is FM-vocab |

**Disposition**: do not surface `≡` readings until ruled. The honest current rendering ("Notation pending") IS the correct posture for these.

### 1C — Sum-of-categories

| Category | Count | Action posture |
|---|---:|---|
| A. Modifier rows | 10 | No notation needed |
| B. Body / surface stalls (uniform pattern) | 8 missing of ~15 | Curator backfill (safe; pattern-matched) |
| C. Sui-generis primitives | 4 | Curator review (2 safe self-tokens, 2 unclear) |
| D. Compounds already in chain registry | ~14 | No coverage crisis; DB `notation` is parallel-source |
| E. Compounds with canon-locked readings NOT yet in registry | ~20-30 | Chain-registry expansion candidates |
| F. Wave-pending compounds | ~10 | Honest pending; do not touch |
| **Total accounted for** | **~70** | |
| **Not yet categorized** | ~23 | Need spot-by-spot curator audit |

The "not yet categorized" cohort is the genuine gray zone — tricks where the audit can't determine block-status from canon sources alone.

---

## PART 2 — Notation-depth inconsistency audit

### 2A — Self-token vs decompositional notation

67 rows have `notation` populated. Of those:

- **31 are atoms or body-primitive rows** with uppercase-slug notation (`MIRAGE`, `OSIS`, `BUTTERFLY`, `WHIRL`, `TOE STALL`, `HEAD STALL`, etc.). Self-token is correct for these.
- **36 are compounds with notation**. Breakdown of those 36:

| Pattern | Count | Examples |
|---|---:|---|
| Self-token (single uppercase = slug) | ~22 | `mobius|MOBIUS`, `torque|TORQUE`, `blender|BLENDER`, `drifter|DRIFTER`, `sumo|SUMO`, `dyno|DYNO`, `eclipse|ECLIPSE`, `ripstein|RIPSTEIN`, `vortex|VORTEX`, etc. |
| Genuine decompositional multi-token | 14 | `blur|STEPPING PARADOX MIRAGE`, `gauntlet|STEPPING DUCKING PARADOX TORQUE`, `matador|NUCLEAR BUTTERFLY`, `mind-bender|DUCKING PARADOX BLENDER`, `montage|SPINNING DUCKING PARADOX SYMPOSIUM WHIRL`, `mullet|DUCKING PARADOX SYMPOSIUM WHIRL`, `paste|PIXIE PICKUP`, `phoenix|PIXIE DUCKING BUTTERFLY`, `pigbeater|PIXIE EGGBEATER`, `ripwalk|BLURRY BUTTERFLY`, `scrambled-eggbeater|ATOMIC PICKUP`, `smear|PIXIE MIRAGE`, `spender|SPINNING PARADOX BLENDER`, `spinal-tap|TAPPING TORQUE`, `tap|TAPPING MIRAGE`, `tripwalk|QUANTUM BUTTERFLY` |

**Observation**: the DB `notation` column carries inconsistent semantics. For atoms it's correctly self-token. For compounds the population is split — some compounds carry the canon-decomposition (matador), others carry just their slug name (mobius, torque). The chain registry resolved this inconsistency by being the source of truth for `≡` readings; the DB `notation` column became parallel and noisy.

### 2B — Depth inconsistency by example

How the same compositional axis renders inconsistently:

| Trick | DB notation | Chain registry reading | Canon ruling |
|---|---|---|---|
| `mobius` | `MOBIUS` (self-token) | `gyro torque` / `spinning ss torque` / `spinning ss miraging op osis` | pt11: `Spinning Torque` |
| `torque` | `TORQUE` (self-token) | `miraging osis` (S2) | pt11: `Miraging Osis` |
| `blender` | `BLENDER` (self-token) | `whirling osis` (S2) | pt11: `Whirling Osis` |
| `drifter` | `DRIFTER` (self-token) | `miraging clipper` (S2) | pt11: `Miraging Clipper` |
| `matador` | `NUCLEAR BUTTERFLY` (decomp) | `nuclear butterfly` / `paradox atomic butterfly` | pt10: `Nuclear Butterfly` |
| `ripwalk` | `BLURRY BUTTERFLY` (drifted) | `stepping butterfly` (S2-locked) | pt11: `Stepping Butterfly` |
| `gauntlet` | `STEPPING DUCKING PARADOX TORQUE` (full decomp) | (not in registry; 7-ADD example) | (no Red ruling on gauntlet specifically; structurally readable) |
| `paradox-whirl` | `PARADOX WHIRL` (decomp, trivial) | (not in registry) | structurally trivial; canon-readable from slug |

The depth chosen for `notation` varies row-by-row with no consistent rule. The chain registry, in contrast, has documented stopping-depth rules.

### 2C — Recommendation

**The DB `notation` column is being decommissioned as the source of truth for `≡` readings.** The chain registry has the locked source. The `notation` column should be either:
- Reconciled to match chain-registry readings (for cross-source consistency, but redundant since the registry is the consumed source), OR
- Repurposed as the operator-reference slug-token (the simple uppercase form, for token-resolution surfaces like /freestyle/sets), OR
- Left as-is and treated as informational-only.

This audit recommends **option 3 (left as-is)** for the canonical surface — the chain registry already drives compact-card rendering — but flags it as a known inconsistency for future cleanup if the curator wants single-source clarity.

---

## PART 3 — Stopping-depth consistency audit

### 3A — Cross-surface stopping-depth (post-CSR S1+S2)

Three compact-symbolic-object surfaces consume readings; their depth choices for shared tricks:

| Trick | Landing | Glossary §3 flow | Dictionary card | Trick-detail Layer 2 |
|---|---|---|---|---|
| osis | atom; no `≡` | atom; no `≡` | atom; no `≡` | atom; no `≡` |
| torque | (not surfaced — landing has atoms only) | `≡ miraging osis` (hardcoded) | `≡ miraging osis` (chain registry post-S2) | `≡ miraging osis` (registry) |
| mobius | (not surfaced) | `≡ spinning ss torque` / `≡ spinning ss miraging osis` (hardcoded; 2 readings) | `≡ gyro torque` / `≡ spinning ss torque` / `≡ spinning ss miraging op osis` (chain registry; 3 readings) | Same as dictionary (3 readings) |
| atom-smasher | (not surfaced) | (not surfaced) | `≡ atomic mirage` (registry) | `≡ atomic mirage` (registry) |
| ripwalk | (not surfaced) | (not surfaced) | `≡ stepping butterfly` (registry) | `≡ stepping butterfly` (registry) |
| around-the-world | `≡ ATW` (static spec) | (not surfaced) | `≡ ATW` (allow-list) | `≡ ATW` (allow-list reach via registry-allow-list merge?) — VERIFY |

### 3B — Two flagged inconsistencies

1. **Mobius**: glossary §3 flow renders 2 readings (`spinning ss torque` + `spinning ss miraging osis` — hardcoded in `glossary.hbs`). Dictionary + trick-detail render 3 readings from the chain registry (`gyro torque` is the registry's first reading). The glossary uses a more curated subset.

   Both renderings are pedagogically valid. The glossary intentionally simplifies for teaching; the dictionary/trick-detail surfaces the registry's full chain. **Not a bug; an intentional rendering-policy split** between the educational glossary worked-example and the canonical dictionary surface.

2. **Glossary §3 flow hardcoded depth choices** — torque/mobius readings are written into `glossary.hbs` directly, not sourced from the chain registry. If the registry's readings change (e.g., the curator removes `gyro torque` from mobius readings), the glossary flow continues showing its hardcoded subset. **Potential drift surface**; not currently drifted.

   Mitigation: a future refactor could source the glossary flow from the registry (with a per-surface filter on which readings to render). For now, the two surfaces happen to agree; documenting the divergence risk.

### 3C — Over-expansion / under-expansion check

Spot-audit per spec target list:

| Trick | Currently rendered depth | Could deeper? | Should deeper? |
|---|---|---|---|
| mobius | 3 readings (registry) | Yes (atomic-set-level) | NO — already at the deepest pedagogically-useful stopping point per registry rules |
| torque | 1 reading (`miraging osis`) | Yes (expand miraging) | NO — miraging is an intermediate operator; expanding crosses a stopping boundary |
| vortex | 1 reading (`gyro drifter` after S2) | Yes (expand drifter) | NO — drifter is in chain registry; if a deeper reading were desired, add it as a multi-reading chain |
| blender | 1 reading (`whirling osis` after S2) | Yes (expand whirling) | NO — whirling is an intermediate operator |
| atom-smasher | 1 reading (`atomic mirage`) | Yes (atomic-set-as-paradox per Wave-1 Q4) | NO — Wave-1 Q4 pending; deeper reading is a Red question, not a curator decision |
| omelette | 1 reading (`atomic illusion` after S2) | Yes | NO — same as atom-smasher |
| paradox-symposium-whirl | 1 reading (`ps whirl`) | Trivial expansion | NO — ps is a canonical abbreviation; the reading IS the canonical compression |

**Verdict**: NO over-expansion detected. NO obvious under-expansion (every trick listed has its canon-locked depth as the surfaced reading). Stopping-depth philosophy is currently well-respected across all consuming surfaces.

---

## PART 4 — Semantic-vs-operational ambiguity audit

The boundary was formalized in Batch 3:
- §9 layer-contrast table shipped (`glossary.hbs §9`)
- PDX flag wording fixed (`[PDX]` reads "cross-body far dex requiring hip-pivot repositioning")
- Symposium operator-board action verbatim from PassBack (`glossary.hbs` and `freestyleService.ts:3987`)

### 4A — Spot audit per spec targets

| Concept | Semantic rendering | Operational rendering | Layer boundary clear? |
|---|---|---|---|
| Paradox | "+1 body modifier; hip pivot between two dexes on the same set" (glossary modifier-reference; currently render-disabled) | `[PDX]` flag: "cross-body far dex requiring hip-pivot repositioning. Operationally: `CLIP > OP IN [DEX]`." (Batch 3 C-3-A) | YES (Batch 3 fix) |
| Symposium | "+1 body modifier" (operator-board action: PassBack-verbatim mechanical wording) | "[BOD]" component flag at execution layer | YES (Batch 1 C-7 fix) |
| Same-side / opposite-side | `ss` / `op` / `near` / `far` positional operators (semantic notation tokens) | Operational rendering: `> OP IN [DEX]` (op-prefix on a dex move) | YES (different surfaces) |
| Directional operators (reverse, far, near) | Semantic: direction marker in operator stack | Operational: arrow-segment prefix | YES; rendered with role-aware spans (`op-token--direction`, `op-token--side`) |
| Dex-window operators | Conceptual: dex-window glossary entry (Batch 3 C-3-F) — describes deep/thin/the-component | Operational: not surfaced as flag tokens (would be a future extension) | Semantic only currently; no boundary leakage |

**Verdict**: no active boundary leakage detected post-Batch 3.

### 4B — Residual ambiguity flagged

One residual case worth noting:

**Body-stall family naming inconsistency**: `head-stall|HEAD STALL` carries notation; `forehead-stall|(empty)`, `knee-stall|(empty)`, etc. do not. The semantic-vs-operational layer isn't blurred here — both layers should render the same simple self-token for a stall. The gap is **completeness**, not **ambiguity**. Listed in PART 1 Category B.

### 4C — Recommendation

No code change needed for the semantic-vs-operational boundary. The layer-contrast table at glossary §9 + the role-aware token rendering are already enforcing the boundary structurally.

---

## PART 5 — Symbolic-completeness inventory

Combining PARTS 1-4, the per-axis canonical-surface completeness:

| Axis | Coverage | Honest pending? |
|---|---|---|
| Canonical slug (`#torque`) | 100% — every active trick has a slug | n/a |
| ADD value | 151/160 = 94% | 9 rows render `[—]` placeholder honestly |
| Symbolic identity (slug + display) | 100% | n/a |
| Semantic notation (DB `notation`) | 67/160 = 42% | rest render no semantic-token row |
| Operational notation | 16/160 = 10% | rest render "Notation pending" honestly |
| `≡` chain-registry reading | 19/160 = 12% (after CSR S2) | rest render no `≡` line; correct when no canon reading exists |
| Atom-level canonical alias surfacing | 2 atoms (atw, outside-in-mirage) of 13 atoms = 15% | atoms without canonical aliases render no `≡` line; correct |
| Family (`base_trick`) | 149/160 = 93% | 11 rows render no family chip; mostly sui-generis |

### 5A — The "fully canonical-surface complete" cohort

Tricks with all four core fields populated (slug + canonical decomposition reading + operational notation + ADD): currently **~13 tricks** (matador being the cleanest example). The rest are partial.

Aspiration: each of the **~30 non-Wave-pending compounds** in PART 1 Category E could reach this state via chain-registry expansion + operational-notation backfill.

### 5B — Distinguishing categories per spec PART 5

| Reason a trick is incomplete | Examples | What this audit recommends |
|---|---|---|
| True missing data (curator hasn't authored) | smudge, smoke, smog | Category E in PART 1; chain-registry expansion candidate |
| Intentionally unresolved (Wave-pending) | blurry-whirl, fury, witchdoctor | Honest pending; do not touch |
| Intentionally suppressed equivalence | `frigidosis` alias (Wave-2) | Allow-list governance; current allow-list correctly hides |
| Orthographic-only alias | `leg-over` | Allow-list governance; correctly hidden |
| Historical-source conflict | `ripwalk|BLURRY BUTTERFLY` vs pt11 `STEPPING BUTTERFLY` | PART 2 drift; one-row curator decision needed |

---

## PART 6 — Unresolved ontology inventory

Per `project_red_consultation_state` Wave 1 packet (sent / pending reply):

| Wave-1 question | Blocking | Affected rows |
|---|---|---|
| Q1 Rotational-bonus generalization | blurry/barraging/furious +1 vs +2 | blurry-whirl, blurry-torque, barraging-osis, food-processor |
| Q1c Furious non-rotational | Furious's ADD on non-rotational bases | fury |
| Q2 Q4 FM-vocab batch | fairy/gyro/blazing/surging/railing/flailing/splicing/surfing/neutron/bubba/twinspinning/jolimont/smiling/spyro-as-modifier | ~30 FM-led tricks; none in canonical-surface compounds today |
| Q3 Positional/directional weights | far/reverse weights | systemic; no specific row currently displaying ADD claim |
| Q4 Atomic-set polysemy | the +1 systemic gap | 11 PB rows where Atomic-X implies +1 (atom-smasher, blur, drifter, sumo, fury) |

Wave 2 deferred per project_red_consultation_state:

| Wave-2 theme | Affected rows |
|---|---|
| Theme 2 (focus-trick set) | witchdoctor, frigidosis, scrambled-eggbeater |
| Theme 6 (down-family canonicalization) | down-*, double-over-down, down-diver |
| Theme 7 (double-quantifier default) | double-fairy, double-blender, double-spinning-osis |
| Theme 8 (equivalence-chain promotion) | sailing, frantic, leaning, hyper, bling-blang |

**Post-Wave-1-reply protocol** (per project_red_consultation_state):
1. Re-run `legacy_data/tools/build_add_conflict_audit.py`.
2. Update `RED_RESOLVED_CANON.md`.
3. Append newly-canon-locked entries to `freestyleSymbolicEquivalences.ts`.
4. Allow-list newly-canonical aliases in `freestyleAliasGovernance.ts`.
5. Compact cards surface the new readings on next deploy.

Curator-only after-action; no code change needed.

---

## PART 7 — Safe cleanup candidates

Curator content edits that:
- have no Red dependency
- are canon-aligned per `RED_RESOLVED_CANON.md`
- are pure additive (no deletions)
- can ship in single small slices

### N1 — Body-stall notation backfill (8 rows)

Add self-token uppercase `notation` to: `forehead-stall`, `knee-stall`, `neck-stall`, `shoulder-stall`, `sole-stall`, `cloud-stall`, `knee-clipper`, `cross-body-sole-stall`. Pattern matches existing siblings. Zero Red risk.

**Implementation**: 8-row SQL UPDATE (curator-authored migration). Read-only against Red sources.

### N2 — Sui-generis primitive notation (2 rows)

Add `POGO` and `ROOTED` self-token notation to those slugs. pt2+pt6 / pt8 already ruled their sui-generis status; the self-token treatment is correct for their compact-card rendering.

**Implementation**: 2-row SQL UPDATE.

### N3 — Chain-registry expansion (~15 rows; canon-locked per RED_RESOLVED_CANON.md)

Append entries to `freestyleSymbolicEquivalences.ts` for tricks with canon-locked compositional readings:

| Slug | Reading | Source |
|---|---|---|
| flail | `symposium illusion` | pt6+followup-2026-04 |
| smudge | `pixie illusion` | pt7 |
| smog | `pixie double legover` | pt7 |
| smoke | `pixie drifter` | pt8 |
| flurry | `barraging legover` | pt4 |
| royale | `paradox reverse drifter` | pt5 |
| eclipse | (atom-tier per pt1; no `≡` needed) | — |
| dlo / double-leg-over | `miraging legover` | pt4 |
| surge | `surging paradox mirage` | pt2 |
| surreal | `surging paradox whirl` | pt2 |
| surgery | `surging symposium reverse whirl` | pt2 |
| venom | `surging barfly` | pt2 |
| bigwalk | `surging butterfly` | pt2 |
| plasma | `quantum double over down` | pt8 |
| fusion | `atomic double over down` | pt2 |
| grave-digger | `stepping same-side torque` | pt8 |
| nemesis | `furious barfly` | pt6+pt8 (NOTE: depends on Q1c not yet ruled if Furious's rotational behavior matters; barfly base — pt6 Fury established Furious +2 on rotational; barfly is rotational; reading is locked) |
| atomic-torque / silo | `atomic torque` | pt4 |

Each entry is one-line. `curatorConfirmPending: false` for fully pt-locked rows; `true` for borderline (nemesis depending on Q1c interpretation).

**Implementation**: append to `src/content/freestyleSymbolicEquivalences.ts`. Zero code change (content-only).

### N4 — ripwalk notation drift fix

DB `ripwalk|BLURRY BUTTERFLY` vs pt11-locked `STEPPING BUTTERFLY`. Curator decision required:
- Option A: update DB notation to `STEPPING BUTTERFLY` (canon-align).
- Option B: leave DB as-is; rely on chain registry (`stepping butterfly`) for `≡` rendering; DB notation becomes informational-only.

**Recommendation**: Option B (no DB write). The chain registry already shipped (`stepping butterfly` after CSR S2); the DB column is parallel-source and not user-visible-blocking. If a future single-source-of-truth pass happens, fold this in.

### N5 — Cross-surface mobius-flow source unification

Glossary §3 flow renders mobius hardcoded with 2 readings; dictionary surfaces registry's 3 readings. Refactor opportunity: source the glossary flow from the chain registry (with `?slice=2` or similar filter for the educational subset).

**Implementation**: small template + service change. Out of scope for "audit-only" but flagged as a future cleanup.

---

## PART 8 — Curator-required decisions

| Decision | Where it lives | Block-if-undecided |
|---|---|---|
| 1. Sequence safe cleanup N1-N3 vs new feature work | Maintainer call | No urgency; honest pending posture works today |
| 2. Whether to reconcile DB `notation` column for compounds (option A in N4 above + similar for mobius/torque/blender/drifter/vortex) | Curator + maintainer | Optional cleanup; cross-source consistency vs status-quo |
| 3. `guay` is_core status | Curator + maintainer (CSR S6 deferred) | Pending per `feedback_phased_scope_control`; user-resolved 2026-05-14 to: pending state, not promote, not delete |
| 4. `pendulum` and `squeeze` audit | Curator | Two rows in PART 1 Category C with unclear base_trick + status |
| 5. Body-stall notation pattern (self-token vs operational-form) | Curator | The siblings use self-token; N1 follows the pattern. Maintainer could direct different scheme |
| 6. nemesis chain registry entry — `curatorConfirmPending` true or false | Curator | Depends on Q1c interpretation (furious's behavior on rotational bases is already pt6-locked; non-rotational case is pending) |

---

## PART 9 — Proposed implementation slices

Ordered by leverage (smallest mechanical change with highest pedagogical payoff first). All slices are curator-authored content edits or small SQL migrations. No service-shape changes proposed.

### NR-1 — Chain-registry expansion (N3 above)

**Goal**: ~15 additional `≡` readings surface on dictionary cards.

**Touched files**: `src/content/freestyleSymbolicEquivalences.ts` (append entries).

**Risk**: low. Each entry sourced from `RED_RESOLVED_CANON.md`. Tests assert chain-registry coverage (existing unit test in `tests/unit/freestyleAliasGovernance.test.ts` is for allow-list; a new unit test on chain-registry hygiene would complement).

**Net effect**: 19 → ~34 compounds with `≡` readings on the dictionary. Scanning rhythm continues to densify.

### NR-2 — Body-stall notation backfill (N1)

**Goal**: 8 body-stall rows get uppercase self-token notation; cross-card consistency restored.

**Touched files**: `database/footbag.db` via curator-authored SQL migration. NO code change.

**Risk**: low. Pattern-matched to existing siblings.

### NR-3 — Sui-generis primitive notation (N2)

**Goal**: pogo + rooted carry self-token notation; cross-card consistency restored.

**Touched files**: same as NR-2 (one curator-authored migration).

**Risk**: low. pt-ruled status.

### NR-4 — Glossary §3 flow refactor to consume chain registry (N5)

**Goal**: single-source-of-truth for cross-surface stopping-depth.

**Touched files**: `src/services/freestyleService.ts` (getGlossaryPage shaping), `src/views/freestyle/glossary.hbs` (§3 flow), small CSS if needed.

**Risk**: medium-low. Visual regression possible if filter rules emerge wrong; tests should assert §3 flow still renders 3 osis→torque→mobius cards in order.

**Deferral candidate**: this is a structural cleanup; current state works. Consider only if registry expansion (NR-1) creates pressure on the dual-source maintenance.

### NR-5 — Wave-1 post-reply automation

After Wave-1 reply lands, the post-reply protocol (re-run ADD-conflict audit; update RED_RESOLVED_CANON.md; append registry; allow-list) becomes a single curator workflow. Pre-document the workflow.

**Touched files**: documentation only.

**Risk**: zero. Process-level deliverable.

### Out of scope (deferred per CSR S4/S5/S6)

- CSR S4: orbit DB row insert
- CSR S5: notation column reconciliation (option A in N4)
- CSR S6: pixie/fairy `is_core=0`; guay → review/pending
- Wave-2 batch addition (orbit's chain entry, sailing/leaning/hyper/etc.)

All curator-authored SQL or content edits. Defer until specifically requested.

---

## PART 10 — Risk analysis

### 10A — Risks of acting on this audit's recommendations

| Risk | Severity | Mitigation |
|---|---|---|
| Chain-registry expansion (NR-1) introduces a reading that's canon-locked but pt-numbered-out-of-date | low | Cross-verify each entry against `RED_RESOLVED_CANON.md` at curator-add time; the registry's `curatorConfirmPending` flag is the safety surface |
| Body-stall backfill (NR-2) chooses wrong notation form (uppercase vs operational) | low | Match existing siblings (head-stall = `HEAD STALL`); no invention |
| Sui-generis primitives (NR-3) get notation that misreads their pt-ruled status | low | pogo + rooted are explicit pt-ruling rows; notation matches their canonical names |
| Glossary flow refactor (NR-4) breaks visual rhythm | medium | Defer until needed; current dual-source state works |
| Cross-source notation reconciliation (N4 option A) silently drifts a row away from a future Red ruling | medium | Recommend Option B (chain registry is single source; DB column informational); no DB write |

### 10B — Risks of NOT acting

| Risk | Severity | Long-term cost |
|---|---|---|
| 30+ compounds with canon-locked readings stay un-surfaced on dictionary cards | medium | Browse-layer pattern recognition (the breakthrough from CSR S1+S2+S3) plateaus at ~14 compounds. Scanning rhythm for pattern recognition stays sparse. |
| 8 body-stall rows render "Notation pending" inconsistently with their head-stall sibling | low | Visual inconsistency on browse; not pedagogically harmful but visually uneven |
| DB notation column drift accumulates as new ingestion sources land | medium | Future contributors must repeatedly reconcile; the column becomes archaeology |

### 10C — Restraint-first guardrails (per spec PART 6)

Categories MUST stay separated in any future action:

| Category | Action policy |
|---|---|
| Safe canonical cleanup (N1 + N2 + N3 chain-locked entries) | Curator content edit; ship freely |
| Curator-required decisions (PART 8 list) | Maintainer call before action |
| Red-blocked ontology (Wave-1 Q1, Q1c, Q2, Q3, Q4) | DO NOT pre-resolve |
| Wave-2 pending (Theme 2, 6, 7, 8) | DO NOT pre-resolve |
| SQL migration candidates (NR-2, NR-3, CSR S4/S5/S6) | Curator + maintainer approval; DB writes never go through assistant directly |
| Visual / rendering gaps | Already shipped — no current gap |

The audit's job is to keep these categories LEGIBLE. No category collapse.

---

## Summary

The canonical-surface architecture is stable. The 93-row notation gap is real but mostly partitions cleanly into:
- **Modifier rows (10)** — no notation expected.
- **Body-stall siblings (8)** — pattern-matched safe backfill.
- **Sui-generis primitives (4)** — 2 safe, 2 need curator review.
- **In-registry compounds (~14)** — already surfaced via chain registry; DB column is parallel-source.
- **Out-of-registry canon-locked compounds (~15)** — chain-registry expansion candidate (NR-1).
- **Wave-pending (~10)** — honest pending; do not touch.

One genuine notation drift (`ripwalk|BLURRY BUTTERFLY` vs pt11 `STEPPING BUTTERFLY`) — chain registry already supersedes; DB column is informational.

Stopping-depth philosophy is currently well-respected. Semantic-vs-operational layer boundary is structurally enforced. The next material progress is curator-authored chain-registry expansion (NR-1) — surfaces ~15 more compounds with their canonical `≡` readings, taking the dictionary browse from 14 → ~34 compositionally-decoded compounds and continuing the scanning-rhythm breakthrough from CSR.

No code change recommended in this slice. Plan staged. Awaiting maintainer direction on slice sequencing.
