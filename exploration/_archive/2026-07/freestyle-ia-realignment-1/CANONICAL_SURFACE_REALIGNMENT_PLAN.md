# Canonical Surface Realignment 1 — Plan

Successor to the four-batch `FREESTYLE_IA_REALIGNMENT_PLAN.md`. Generated 2026-05-14. Pre-implementation audit + planning artifact; no code shipped from this slice. Implementation gated on maintainer approval per the user spec ("Do NOT implement immediately. Planning/audit phase first.").

The four IA-realignment batches established the **visual + structural foundation** of the symbolic-object surface. This plan audits the **semantic and data completeness** of that surface and proposes the next round of stabilization slices.

---

## TL;DR

Audit reveals one **major opportunity** plus several **real drifts** between the freshly-built symbolic-object surface and the canonical data behind it:

1. **`src/content/freestyleSymbolicEquivalences.ts` already holds 13 curator-authored compositional equivalence chains** (mobius / torque / ripwalk / matador / montage / etc.) but no compact-object surface consumes it. The Batch 2 landing CoreTricks uses a parallel static array; the dictionary uses unfiltered DB aliases. Surfacing the existing curator chains on dictionary cards is the highest-leverage canonical-surface unblock.
2. **Alias governance is structurally absent.** 126 alias rows all tagged `alias_type='common'`; no taxonomy in use; dictionary cards surface every alias verbatim, including `osis ≡ frigidosis` (Wave-2 pending), `legover ≡ leg-over` (orthographic), `swirl ≡ reverse swirl` (different trick). User-spec PART 3A explicitly forbids these on compact surfaces.
3. **Three concrete DB drifts vs Batch 1 user-spec canon**: `pixie` and `fairy` still flagged `is_core=1` (should be `is_core=0` + category='modifier'); `orbit` row entirely absent; `guay` flagged `is_core=1` despite not appearing in any user-spec foundational list.
4. **Notation column has self-token entries on compounds** (`mobius|MOBIUS`, `torque|TORQUE`, `blender|BLENDER`, `drifter|DRIFTER`) where canon (`RED_RESOLVED_CANON.md` C.1) names the compositional form (`SPINNING TORQUE`, `MIRAGING OSIS`, `WHIRLING OSIS`, `MIRAGING CLIPPER`). Compact-object surfaces can't safely render `notation` as the symbolic-notation slot until reconciled.
5. **Cross-surface semantic inconsistency.** Landing uses static `CORE_TRICK_SPEC`; glossary uses hardcoded `osis`/`torque`/`mobius` flow; dictionary uses unfiltered `commonAliases`. Three surfaces, three sources, three different equivalence renderings for the same trick.

Out of scope explicitly: no ontology expansion, no new operator semantics, no new ADD claims, no Wave-1/Wave-2 pre-resolution, no visual changes (Batch 4 settled those).

---

## PART 1 — Canonical-object completeness audit

DB snapshot (`database/footbag.db`, 2026-05-14):

| Metric | Count | % of active | Implication |
|---:|---:|---:|---|
| Total active canonical tricks (`is_active=1`) | **160** | 100% | Baseline |
| External-only placeholders (`is_active=0`) | 1 | — | Not on browse surface |
| Has `adds` set | 151 | 94.4% | **9 rows missing ADD** |
| Has semantic `notation` (Jobs) | 67 | 41.9% | **93 rows render compact card with no notation slot** |
| Has `operational_notation` | 16 | 10.0% | **144 rows have no execution-mechanics layer** |
| Has both notations | 16 | 10.0% | Same 16 |
| Has `base_trick` linked | 149 | 93.1% | **11 rows missing family lineage** |
| `is_core=1` (atoms in DB) | 13 | 8.1% | See PART 1B |
| `category='modifier'` | 10 | 6.3% | — |
| Alias rows (`freestyle_trick_aliases`) | 126 | — | See PART 2 |

### 1A — Compact-object render completeness

For each active trick, the compact-object rendering needs **four layers**: `#slug`, optional `≡ reading(s)`, optional notation, ADD. Worst-case rendering completeness:

| Layer | Sourcable | Render-completeness on dictionary today |
|---|---|---:|
| `#slug` | `slug` (always present) | 100% |
| `≡ reading(s)` | per audit: `commonAliases` (unfiltered) → noisy; `freestyleSymbolicEquivalences.ts` → 13 of 160 tricks | Effective: ~10% canonical (≡ chains) ; ~30% with-alias-noise |
| Symbolic notation | `notation` (where set, where canon-aligned) — see PART 4 | Effective: 67 rows have a value, ~40 of those are canon-aligned. ~25% |
| ADD | `adds` (where set) | 94% (9 missing) |

The compact-object surface today is **completely populated** for an estimated **15–20% of active tricks** and **partially populated** for the rest. The user's spec calls for "Every accepted trick should behave as a compact symbolic object" — meaningful gap.

### 1B — `is_core` flag drift

DB has 13 rows with `is_core=1`:

```
around-the-world, butterfly, clipper, fairy, guay, illusion, legover, mirage,
osis, pickup, pixie, swirl, whirl
```

Per Batch 1 user-spec, the core-trick list is **11 entries**:

```
clipper, mirage, legover, pickup, illusion, whirl, butterfly, swirl, osis,
around-the-world, orbit
```

Diffs:

| Slug | DB `is_core` | User-spec core? | Action |
|---|---|---|---|
| pixie | 1 | NO (set modifier per Batch 1) | Flip to `is_core=0`; verify `category='modifier'` |
| fairy | 1 | NO (set modifier per Batch 1) | Flip to `is_core=0`; verify `category='modifier'` |
| guay | 1 | not listed | Needs curator review — is guay a real foundational atom or DB drift? See [[project_freestyle_core_atoms]] for the canonical memory registry (which has 12 atoms; guay is in some past listings but not the Batch-1 user spec) |
| orbit | row missing | YES (per Batch 2 C-2; confirmed in Batch 1 §10) | Insert row with `is_core=1`, `adds=<TBD>`, `base_trick='orbit'` or linked to `around-the-world`; also add alias row `orbit ≡ reverse around-the-world` |

### 1C — Missing-ADD rows

9 rows have `is_active=1` but no `adds` value. These render as `[—]` (pending chip) on compact-object surfaces. List should be enumerated at implementation time (a single SQL query of the 9 rows) and either:
- Curator-backfilled with the canonical ADD per `RED_RESOLVED_CANON.md` (if Red has ruled),
- Or flagged for Red consultation (Wave 1 / Wave 2 enqueue).

No new ADD values invented; backfill only when an authoritative source exists.

### 1D — Missing-`base_trick` rows

11 rows have no `base_trick`. These render with no family-lineage cue. Implementation note: many of these are likely modifiers or sui-generis tricks (down-family, body-elements per pt7 + pt1) for which `base_trick` is genuinely null. The audit should classify each:
- Genuinely sui-generis → leave null; no family chip rendered (correct).
- Compound trick with missing link → backfill `base_trick`.

---

## PART 2 — Alias / equivalence visibility audit

### 2A — The taxonomy gap

`freestyle_trick_aliases` schema (per `database/schema.sql`):

```sql
alias_type TEXT NOT NULL    -- 'common' | 'abbreviation' | 'historical' | 'notation' (no CHECK)
```

Reality: **all 126 alias rows have `alias_type='common'`**. The taxonomy column exists but isn't populated. Every alias is rendered indistinguishably by the dictionary card via `commonAliases`.

### 2B — Atom-level alias surface (audit subset)

The 13 `is_core=1` rows have 5 alias rows between them:

| Trick → alias | Educational status | Should surface on compact card? | Drift category |
|---|---|---|---|
| `around-the-world` → `atw` | **canonical educational** (per user spec PART 3) | YES | none — correct |
| `illusion` → `outside-in mirage` | **canonical compositional equivalence** | YES | none — correct |
| `legover` → `leg-over` | orthographic only | NO | **orthographic noise** (user-spec PART 3A) |
| `osis` → `frigidosis` | Wave-2 pending (folk-name overload) | NO | **Wave-2 pending** ([[project_red_consultation_state]]) |
| `swirl` → `reverse swirl` | not an equivalence — different trick | NO | **non-canonical** (different trick, not an alias) |

Dictionary cards today render **all five**. Landing cards (post-Batch-2) render only the first two via the static `CORE_TRICK_SPEC` filter. **Inconsistency: 3 of 5 atom aliases that the user spec forbids on compact surfaces are still showing on the dictionary.**

### 2C — The parallel curator equivalence-chain registry

**Critical audit finding.** `src/content/freestyleSymbolicEquivalences.ts` (lines 1–124) exists with 13 curator-authored compositional equivalence chains:

| Trick | Curator chain(s) |
|---|---|
| `mobius` | `gyro torque` / `spinning ss torque` / `spinning ss miraging op osis` |
| `toe-blur` | `quantum mirage` |
| `ripwalk` | `stepping butterfly` |
| `dimwalk` | `pixie butterfly` |
| `phoenix` | `pixie ducking butterfly` |
| `atomsmasher` | `atomic mirage` |
| `matador` | `nuclear butterfly` / `paradox atomic butterfly` |
| `paradox-symposium-whirl` | `ps whirl` |
| `montage` | `spinning ducking paradox symposium whirl` |
| `double-fairy` | `double illusion` |
| `double-blender` | `whirling blender` |
| `double-spinning-osis` | `two spins to osis` |
| `spyro-gyro` | `gyro butterfly swirl` |

Each entry is curator-edited, stopping-depth-aware (uses intermediate operators as stopping points), and pedagogically meaningful.

**Consumed by**: the per-trick **detail page** (Layer 2 of the semantic-notation ladder).
**NOT consumed by**: any compact-object surface — not landing, not glossary flow, not dictionary cards.

This is the **single highest-leverage canonical-surface unblock**. Wiring this module into the dictionary card view-model gives 13 compounds their canonical `≡` readings overnight, with zero new ontology and zero invention.

### 2D — Three sources / three renderings

Today's reality across the three compact-object surfaces:

| Surface | Equivalence source | Filter applied | Coverage |
|---|---|---|---|
| Landing Core Tricks | static `CORE_TRICK_SPEC` (Batch 2) | hand-curated to canonical-only | 12 atoms; all with `≡` readings |
| Glossary compression-flow | hardcoded in `glossary.hbs` | hand-curated (only osis/torque/mobius shown) | 3 of 3 |
| Dictionary cards | `freestyle_trick_aliases.commonAliases` | none (all aliases) | All 160 tricks see their raw aliases |

Three different rendering paths for the same conceptual layer. **The unification path is to consume the curator-authored chain registry on all compact surfaces, with `freestyle_trick_aliases` as a supplementary source for canonical aliases (`atw`, `outside-in mirage`) that aren't compositional chains.**

---

## PART 3 — Symbolic-notation consistency audit

### 3A — DB `notation` column vs. canonical readings

Spot check of marquee trick rows:

| Slug | DB `notation` | Canon (`RED_RESOLVED_CANON.md` C.1) | Aligned? |
|---|---|---|---|
| `mirage` | `MIRAGE` | (atom — self-token OK) | ✓ |
| `osis` | `OSIS` | (atom — self-token OK) | ✓ |
| `torque` | `TORQUE` | `MIRAGING OSIS` (pt11) | **drift** — self-token instead of composition |
| `mobius` | `MOBIUS` | `SPINNING TORQUE` (pt11) | **drift** |
| `blender` | `BLENDER` | `WHIRLING OSIS` (pt11) | **drift** |
| `drifter` | `DRIFTER` | `MIRAGING CLIPPER` (pt11) | **drift** |
| `atom-smasher` | (empty) | `ATOMIC MIRAGE` (pt1+pt2+pt10) | **gap** |
| `fury` | (empty) | `FURIOUS PARADOX MIRAGE` (pt6) | **gap** |
| `matador` | `NUCLEAR BUTTERFLY` | `NUCLEAR BUTTERFLY` (DB notation matches canon) | ✓ |
| `ripwalk` | `BLURRY BUTTERFLY` | `STEPPING BUTTERFLY` (pt11) | **drift** — DB uses Blurry-form, pt11 says Stepping |

Across 67 rows with `notation` set, an estimated **20–30 rows carry self-token or canon-divergent notation values**. Compact-object surfaces that read `notation` as the symbolic-notation slot will surface these drifts directly.

### 3B — Reconciliation policy

**Source-of-truth ordering** for symbolic-notation slot on compact-object cards:

1. `freestyleSymbolicEquivalences.ts` chain (for tricks in the curator chain registry — currently 13).
2. `freestyle_trick_aliases` row tagged `alias_type='equivalence'` (proposed new taxonomy use — see PART 2A).
3. `freestyle_tricks.notation` (where canon-aligned per `RED_RESOLVED_CANON.md`).
4. None (atoms: render no notation slot; the slug IS the symbol).

Layer 3 is the noisy layer. Reconciliation requires either:
- Manual curator backfill of `notation` for the 20–30 drifted compound rows, OR
- Curator promotion of canonical chains into `freestyleSymbolicEquivalences.ts` (which subsumes the noisy notation column for those slugs).

The second path is structurally cleaner — the curator file is already the canonical source.

### 3C — Operational notation gap

16 of 160 rows have `operational_notation`. This layer is rich on matador (`CLIP > SAME OUT [DEX] [PDX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]`) but absent on most rows. Compact-object cards currently render `operational_notation` as the notation slot via `shapeOperationalNotationDisplay`.

For tricks without `operational_notation`, the dict-card today renders "Notation pending" italic placeholder. Per Batch 2 R3 + compact-object spec, that's acceptable honest-pending behavior.

**Backfill is out of scope for this slice.** The 144-row operational-notation gap is a curator/curatorial-pipeline question, not a Batch-5 implementation question.

---

## PART 4 — Stopping-depth audit

`freestyleSymbolicEquivalences.ts` already encodes stopping-depth-aware readings (per its file-header comment: "Stop at any intermediate operator (atomic / blurry / quantum / nuclear / barraging / furious / double / whirling / high)"). The audit confirms:

| Trick | Chain depth strategy | Stops at |
|---|---|---|
| mobius | 3 readings (shallow → deep) | `gyro torque` (compressed) → `spinning ss torque` (intermediate) → `spinning ss miraging op osis` (atom-level) |
| matador | 2 readings | `nuclear butterfly` (compressed) → `paradox atomic butterfly` (deeper but stops at atomic) |
| atomsmasher | 1 reading | `atomic mirage` (one stopping point; deeper would mean atomic-set-as-paradox) |

The 3-reading mobius is the only multi-depth chain in the registry. Per Batch 4's tightly-layered `≡` rendering rule, three `≡` lines render compactly without becoming a wall.

**Stopping-depth governance is healthy in the registry.** The risk is in the parallel `freestyle_trick_aliases` table where no stopping-depth metadata exists — every alias is just a string. If the dictionary continues consuming raw aliases unfiltered, stopping-depth philosophy isn't enforceable through that path.

### 4A — Recommendation

Migrate alias-based equivalences (atw, outside-in mirage) into either:
- New `freestyle_trick_aliases.alias_type='equivalence'` (use the existing taxonomy slot), OR
- Promote into `freestyleSymbolicEquivalences.ts` as single-reading chains.

Either path lets compact-object surfaces consume a single canonical equivalence source with stopping-depth metadata preserved.

---

## PART 5 — Compact symbolic-density review

Post-Batch-4 visual: cards are airy, type-led, minimal-containment. Density is appropriate for **scanning + family recognition**.

User-spec target: users should subconsciously begin recognizing repeated operators (`spinning ss …`), repeated bases (`… whirl`), compositional patterns, etc. The visual rhythm now supports this — the data layer doesn't yet, because only 13 compounds surface their `≡` readings.

**Density gain when PART 2C wiring lands**: an estimated 50–80 additional dictionary rows would surface canonical `≡` readings (counting the 13 chain-registry entries plus the 60–67 `notation`-populated rows after canon reconciliation in PART 3B). That's the point at which scanning-for-pattern starts working visually.

No additional density-tuning is recommended in this slice. The visual system from Batch 4 is correctly calibrated; the data layer is what needs the lift.

---

## PART 6 — Landing / glossary / dictionary cross-surface consistency

Post-Batch-4 visual consistency: ✓ (all three surfaces share `.core-trick-object` / `.dict-card` typography family).
**Semantic consistency: gap.**

| Trick | Landing render | Glossary render | Dictionary render |
|---|---|---|---|
| `torque` | (not present) | `#torque / ≡ miraging osis / 4` | `#torque / [—-or-notation-if-set] / 4 ADD` — **no `≡` reading** because dictionary doesn't consume `freestyleSymbolicEquivalences.ts` |
| `mobius` | (not present) | `#mobius / ≡ spinning ss torque / ≡ spinning ss miraging osis / 5` | `#mobius / [notation: MOBIUS = self-token] / 5 ADD` — **no `≡` readings** |
| `around-the-world` | `#around-the-world / ≡ ATW / 2` | (not present) | `#around-the-world / [no `≡` line] / aliases: atw / 2 ADD` — **inconsistent rendering of alias** (landing: `≡ ATW`; dict: `aliases: atw` text) |
| `illusion` | `#illusion / ≡ outside-in mirage / 2` | (not present) | `#illusion / aliases: outside-in mirage / 2 ADD` — **same inconsistency** |
| `orbit` | `#orbit / ≡ reverse around-the-world / [—]` | (not present) | (not present — DB row missing) |

**The cross-surface gap is structural, not visual.** Same trick, different equivalence-rendering, different source-of-truth. Closing this is the main goal of the next implementation slice.

---

## PART 7 — Torque / mobius educational continuity

Post-Batch-3: the glossary flow renders correctly. The flagship pedagogy works in §3.

Audit gaps for **continuity across surfaces**:

| Surface | torque | mobius | osis |
|---|---|---|---|
| Glossary §3 flow | ✓ rendered with `≡ miraging osis` | ✓ rendered with two `≡` readings | ✓ rendered as atom |
| Trick-detail page (`/freestyle/tricks/torque`) | ✓ Layer-2 ladder via `freestyleSymbolicEquivalences.ts` (`torque` not in registry but Layer 3 lineage works) | ✓ Layer-2 ladder shows all 3 readings | ✓ as atom |
| Dictionary card on `/freestyle/tricks` | **NO `≡` line** today (DB notation = `TORQUE` self-token) | **NO `≡` lines** today (DB notation = `MOBIUS` self-token) | ✓ as atom |

Result: the **flagship pedagogy works on the dedicated surfaces (glossary §3 + trick-detail) but fails on the dictionary browse**, which is the primary scanning surface. A user browsing the dictionary doesn't see the torque/mobius compositional progression at all.

**Closing this gap is the dictionary-card-equivalence-rollout (the PART 2C unblock).**

### 7A — `torque` is NOT in `freestyleSymbolicEquivalences.ts`

The registry has entries for mobius / matador / ripwalk / etc., but **not torque**. Per RED_RESOLVED_CANON.md C.1: `Torque = Miraging Osis (pt11)`. The reading is canon-locked; no Red question is pending.

Adding `torque` to `freestyleSymbolicEquivalences.ts` is a one-line curator edit:

```typescript
{
  slug:     'torque',
  readings: ['miraging osis'],
  curatorConfirmPending: false,   // pt11-locked
},
```

Similarly `blender` (`whirling osis`) and `drifter` (`miraging clipper`) are pt11-locked and absent from the registry. Three quick wins.

---

## PART 8 — Unresolved ontology still blocked by Red

Per [[project_red_consultation_state]] Wave 1 packet (sent / pending reply), explicitly NOT surfaced in this slice:

| Topic | Status | Affected canonical surfaces |
|---|---|---|
| Rotational-bonus generalization (blurry/barraging/furious +1 vs +2) | Wave 1 Q1 pending | Any equivalence reading involving `blurry-whirl`, `blurry-torque`, `barraging-osis`, `food-processor` stays out of compact cards until ruled. |
| Q4 FM-vocab batch | Wave 1 Q2 pending | The 14 FM-vocab modifiers (fairy-as-modifier, gyro, barraging-FM, surging, railing, flailing, splicing, surfing, neutron, bubba, twinspinning, jolimont, smiling, spyro-as-modifier) stay out of compact-object equivalence readings. |
| Positional/directional weights (far, reverse) | Wave 1 Q3 pending | Readings using `far` or `reverse` as direction terms are fine (factual); ADD claims on those terms are pending. |
| Atomic-set polysemy / +1 systemic gap | Wave 1 Q4 pending | Atomic-anything stays at conservative readings. Atom Smasher's `≡ atomic mirage` is current canon; deeper readings (`paradox atomic mirage`) await ruling. |
| Furious non-rotational reading | Wave 1 Q1c pending | Furious-led equivalences (Fury) carry `curatorConfirmPending: true` until reply. |
| Witchdoctor / Frigidosis / Scrambled Eggbeater | Wave 2 Theme 2 | Not surfaced in compact cards. The DB alias `osis ≡ frigidosis` will get filtered out under PART 2A taxonomy. |
| Down-family canonicalization | Wave 2 Theme 6 | Affected down-* rows stay at current state. |
| Frantic / Leaning / Hyper / Sailing / Bling Blang | Wave 2 Theme 8 | These FM-vocab equivalence chains stay out. |
| Sailing decomposition (legacy vs FM source conflict) | Curator triage pending | Sailing's equivalence reading stays out pending source resolution. |

**No Wave-1 / Wave-2 outcomes are pre-resolved by this slice's recommendations.** All proposed work uses already-canonical sources.

---

## PART 9 — Browse-layer drift risks

| Risk | What it looks like | Mitigation |
|---|---|---|
| **Educational prose creep** | A descriptive sentence sneaks into the dictionary card view-model (`description`, `narrative`, `synopsis`) and renders on browse | Re-affirm: dictionary card view-model has NO prose slot; any consumer adding one violates the Batch-2 contract. Negative test: assertion that no `<p class="dict-card-description">` etc. appears in browse HTML. |
| **Alias-rendering taxonomy collapse** | Future curator adds an alias row with `alias_type='equivalence'` but the dictionary-card filter doesn't read the type column, so it falls through and renders the alias as raw text | Service-layer filter shapes `commonAliases` based on `alias_type` before passing to template. New alias-type assertions in integration tests. |
| **Notation column drift** | Curator updates `notation` for a compound to match canon, but a future scraper re-imports stale data and overrides | Loader-level invariant: if a row already has curator-set notation, scraper-imported notation goes to a quarantine queue, not in-place overwrite. (Pipeline concern; not in scope for this slice.) |
| **Equivalence-chain orphan readings** | `freestyleSymbolicEquivalences.ts` gets a reading whose tokens are no longer in the operator-reference (e.g., FM-vocab leaked in) | Unit test on the chain registry: every token in every reading must resolve to either an atom, an NF-2A operator-reference entry, or a known positional/directional marker. Fail the test if an unknown token appears. |
| **Stopping-depth drift via deep readings** | Curator adds a 4th reading to a chain that decomposes past intermediate operators (e.g., `mobius` → `spinning ss miraging osis` → `spinning ss mirage modifier on osis ... `) | File-header rule in `freestyleSymbolicEquivalences.ts` already says "Max 3 readings per chain". Unit test enforces. |
| **Compact-card metadata bloat** | Future surface adds 5 metadata rows (creator chip, year-introduced chip, country-of-origin chip) to the dictionary card | Re-affirm Batch 2 + Batch 4 contract: the compact card has 4 symbolic-core layers plus alias/family/media-coverage chips. New chips must be evaluated against the symbolic-vs-dashboard boundary. |
| **`freestyle_trick_aliases` becomes the equivalence-chain authority** | Future work bypasses `freestyleSymbolicEquivalences.ts` and just adds alias rows | Service-layer policy: equivalence chains for compounds come from the curator module (single source). Alias table is for orthographic / abbreviation / historical / canonical-shorthand only. New service comments document this. |
| **The DB `is_core` flag drifts further from user-spec canon** | A new scraper-imported row gets `is_core=1` based on some external source | Curator approval required for any `is_core=1` insert. Loader invariant. (Same scope concern as notation drift.) |

---

## PART 10 — Proposed implementation slices

Ordered by leverage (highest impact first). Each is a discrete sub-slice; rejection-per-slice allowed.

### S1 — Surface curator equivalence chains on dictionary cards (highest leverage)

**Goal**: dictionary-trick-card consumes `freestyleSymbolicEquivalences.ts` and renders `≡` readings inside the symbolic-core.

**Touched files**:
- `src/services/freestyleService.ts` — extend `DictionaryTrickCard` view-model with `symbolicEquivalences: string[]`; populate from `getSymbolicEquivalenceChain(slug)`; if empty AND tricks has canonical (taxonomy-tagged) alias rows, fall back to those.
- `src/views/partials/dictionary-trick-card.hbs` — render `≡` lines above the operational-notation row.
- `src/public/css/style.css` — `.dict-card-equivalence` styling matching `.core-trick-equivalence`.
- Tests — dictionary-card test file gets equivalence-rendering assertions.

**Net effect**: ~13 compound tricks immediately surface their canonical equivalence readings on the dictionary. Cross-surface semantic consistency is reached for those 13.

**Out of scope**: backfilling more chains into the registry (curator work; separate slice).

### S2 — Add `torque`, `blender`, `drifter`, `vortex`, `eggbeater`, `omelette`, `fury` to `freestyleSymbolicEquivalences.ts`

**Goal**: bring obviously-canon-locked pt11/pt1/pt2/pt6 readings into the chain registry. All entries are one-line curator edits.

**Touched files**:
- `src/content/freestyleSymbolicEquivalences.ts` — append entries.
- Tests — registry-coverage assertion gets new slugs.

**Constraint**: only canon-locked readings (`curatorConfirmPending: false`). Furious-derived `fury` reading stays pending per Q1c.

After S1 + S2, an estimated **20 compound tricks** show canonical equivalence readings on the dictionary. Scanning + family-recognition starts working.

### S3 — Alias taxonomy enforcement on dictionary cards

**Goal**: `commonAliases` field shapes only canonical aliases (atw, outside-in mirage) and filters out orthographic / Wave-pending / non-equivalence noise.

**Implementation**:
- Add a deterministic filter in `shapeDictionaryTrickCard` that consults a per-slug allow-list (curator-authored content module: `freestyleAliasGovernance.ts`). Aliases not in the allow-list don't surface on browse cards.
- OR: backfill `alias_type` column with proper taxonomy values, then filter in SQL.

**Allow-list (initial)** for the 5 atom-level aliases audited in PART 2B:
- around-the-world → atw ✓
- illusion → outside-in mirage ✓
- legover → leg-over ✗ (orthographic)
- osis → frigidosis ✗ (Wave-2 pending)
- swirl → reverse swirl ✗ (different trick)

After S3, all 5 atom aliases render correctly on dictionary (2 surface, 3 filtered).

### S4 — Insert `orbit` row + alias

**Goal**: close the orbit DB gap. `orbit` becomes a canonical row with ADD=2 (per being a direction-variant of around-the-world; verify with curator), `is_core=1`, `base_trick='around-the-world'`, and an alias row `orbit → reverse around-the-world`.

**Touched files**:
- `database/footbag.db` via curator-authored SQL migration (NOT in pipeline scope; curator action).
- `src/content/freestyleLandingContent.ts` — `orbit` entry's `addPending: false` once row exists.
- `freestyleSymbolicEquivalences.ts` — `orbit → reverse around-the-world` chain.

**Out of scope**: any other backfill (the 9 missing-ADD rows; the 11 missing-base_trick rows).

### S5 — Reconcile DB notation column with `RED_RESOLVED_CANON.md`

**Goal**: the 20–30 compound rows with self-token or drifted `notation` get updated to canon-aligned form. Curator-authored migration.

**Examples**:
- `mobius`: `MOBIUS` → `SPINNING TORQUE`
- `torque`: `TORQUE` → `MIRAGING OSIS`
- `blender`: `BLENDER` → `WHIRLING OSIS`
- `drifter`: `DRIFTER` → `MIRAGING CLIPPER`
- `ripwalk`: `BLURRY BUTTERFLY` → `STEPPING BUTTERFLY`

**Constraint**: only reconcile rows where canon source (`RED_RESOLVED_CANON.md`) is locked. Wave-pending rows stay as-is.

This is a curator/pipeline slice, not a code-change slice. Touched: `database/footbag.db` via curator-authored migration.

### S6 — Fix `is_core` drift

**Goal**: bring `is_core` flag into alignment with Batch-1 user-spec canon.

**Implementation**:
- `pixie` `is_core=1` → `is_core=0`; `category='modifier'` confirmed
- `fairy` `is_core=1` → `is_core=0`; `category='modifier'` confirmed
- `guay` `is_core=1` → review with curator; either keep (if guay is a real atom per a memory entry I haven't found) or flip
- `orbit` (after S4 inserts the row) → `is_core=1`

Curator-authored migration. Not a code-change slice on its own.

### S7 — Tests + doc-sync

After S1–S6 (or any combination), tests harden the new contract:

- Dictionary-card test asserts `≡` lines render for tricks in the chain registry
- Alias-taxonomy assertion: noise aliases don't surface
- Cross-surface consistency assertion: same trick's `≡` readings match across landing / glossary / dictionary (where applicable)
- Registry-coverage assertion: every token in every chain reading is resolvable
- doc-sync VIEW_CATALOG: glossary + dictionary entries note the chain-registry consumption

---

## PART 11 — Risks of NOT shipping this work

If the canonical-surface gaps persist:

| Gap | Long-term cost |
|---|---|
| Dictionary cards never show `≡` readings | The compact-object pattern only works for atoms; compounds (the majority of the corpus) render with the same compact-card structure but no compositional information. Scanning rhythm degrades on the densest surface. |
| Alias-rendering noise | `osis → frigidosis`, `swirl → reverse swirl` etc. continue confusing readers. Curator-feedback churn. |
| DB `is_core` drift | `pixie` and `fairy` continue showing up as foundational tricks anywhere a downstream surface consults `is_core` directly (e.g., future browse facets). |
| Orbit absent | Landing-page pending state never resolves. The user's PART 2 canonical-trick spec ("Every accepted trick should behave as a compact symbolic object") fails for orbit indefinitely. |
| Three sources of truth for equivalence | Future contributors must hunt across `CORE_TRICK_SPEC` (Batch 2), `freestyleSymbolicEquivalences.ts` (Batch 3 pedagogy), `freestyle_trick_aliases` (DB), and `glossary.hbs` (Batch 3 hardcoded) to update any one trick's reading. Maintenance friction compounds. |

---

## Cross-references

- `FREESTYLE_IA_REALIGNMENT_PLAN.md` PART H-pre — compact symbolic-object rendering rule (this plan's audit is against that rule)
- `GLOSSARY_PEDAGOGY_REALIGNMENT_PLAN.md` PART 2 — torque/mobius flow (referenced in PART 7 of this plan)
- `COMPACT_SYMBOLIC_OBJECT_VISUAL_REFINEMENT_PLAN.md` — visual system this plan builds on
- `src/content/freestyleSymbolicEquivalences.ts` — the unconsumed registry that's the highest-leverage unblock
- `RED_RESOLVED_CANON.md` C.1 — equivalence-chain rulings (basis for S2 + S5 canon source)
- `RED_OPEN_QUESTIONS_REFORMULATED.md` — Wave 1 + Wave 2 pending topics (basis for PART 8 carve-outs)
- [[project_red_consultation_state]] — current Red consultation surface
- [[project_freestyle_core_atoms]] — curator-canonical atom registry (basis for PART 1B `is_core` reconciliation)
- [[feedback_frequency_not_authority]] — guardrail against FM-vocab promotion
- `src/services/freestyleService.ts:1400–1416` — `DictionaryTrickCard` view-model (the surface where S1 lands)

---

## What needs maintainer decision before S1–S7 implementation

Three open questions worth a maintainer call before the next slice starts:

1. **`guay` `is_core` status.** The DB has it as an atom; no Batch-1 user-spec mentions it; [[project_freestyle_core_atoms]] memory has 12 atoms without guay. Is guay a real foundational atom (DB is right), or is `is_core=1` legacy drift to flip? Either is defensible; curator call.

2. **Alias taxonomy backfill strategy: allow-list module vs. SQL column backfill.** S3 proposes two paths. Allow-list module (TypeScript content file) is faster to ship and easier to audit. SQL column backfill is more structurally correct but requires a migration. Maintainer call on which to do first.

3. **Implementation order between S1 and S2.** S1 wires the consumer (dictionary cards consume the registry). S2 expands what's in the registry. Either order works:
   - S1 first → dictionary surfaces existing 13 chains immediately; S2 grows coverage.
   - S2 first → registry grows to 20; S1 surfaces all 20 at once.
   I default to **S1 first** (smaller mechanical change; immediate visible payoff for the existing 13). Maintainer can override.
