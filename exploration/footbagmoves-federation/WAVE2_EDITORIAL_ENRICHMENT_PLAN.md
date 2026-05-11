# Wave-2 Editorial Enrichment Plan (W2c)

Date: 2026-05-11. Status: planning + drafts only. No DB writes. No ontology mutation. Federation-not-adoption preserved.

Scope: upgrade the 6 Tier-1 rows landed in W2b (Matador, Phoenix, Mind Bender, Tripwalk, Legeater, Spinal Tap) from ontology-complete to editorially rich. Pure authoring + planning; no row inserts, no parser changes, no modifier-table changes.

Sibling artifacts:
- `WAVE2_OPERATIONAL_NOTATION_DRAFTS.md` -- FM-evidence-derived operational notation seeds, curator-review-gated.
- `WAVE2_MEDIA_DISCOVERY.md` -- per-row media availability + tagging targets.
- `WAVE2_FAMILY_LADDER_NOTES.md` -- per-family pedagogical pairings + progression notes.
- `WAVE2_EXECUTION_GUIDE_DRAFTS.md` -- per-row execution / learning / prerequisite prose drafts.

Prior artifacts referenced: `WAVE2_IMPLEMENTATION_PLAN.md` (W2b), `WAVE2_FAMILY_IMPACT.md` (W2b), `UX2_EDITORIAL_LAYOUT_PLAN.md`, `UX2_PILOT_IMPLEMENTATION.md`.

---

## 1. Per-row audit

| Row | Notation | Op-notation evidence | Media | Family richness | Educational | Glossary | Page state |
|-----|----------|----------------------|-------|-----------------|-------------|----------|------------|
| Matador | clean (nuclear butterfly) | FM string available | FM video + IFPA record | dense (butterfly 12) | high (nuclear intro) | known tokens | semantic-only |
| Phoenix | clean (pixie ducking butterfly) | FM string available | FM video + IFPA record | dense (butterfly 12) | high (3-modifier compound) | known tokens | semantic-only |
| Mind Bender | clean (ducking paradox blender) | FM string available | no FM video | medium (blender 4) | high (pairs with Spender) | known tokens | semantic-only |
| Tripwalk | clean (quantum butterfly) | FM string available | FM video | dense (butterfly 12) | high (quantum intro) | known tokens | semantic-only |
| Legeater | clean (quantum pickup) | FM string available | no FM video | small (pickup 5) | medium (beginner entry) | known tokens | semantic-only |
| Spinal Tap | clean (tapping torque) | FM string available | no FM video | medium (torque 8) | medium (modifier-substitution) | known tokens | semantic-only |

All 6 have clean semantic notation, all 6 carry FM operational-notation evidence (drafts in `WAVE2_OPERATIONAL_NOTATION_DRAFTS.md`), all 6 use IFPA-known modifier tokens (no glossary work needed).

---

## 2. Prioritization

### 2.1 Flagship candidates (ranked)

1. **Matador** -- nuclear-modifier flagship; FM video + IFPA record; pt10 nuclear-as-Paradox-Atomic ruling has prose to anchor against; cleanest 2-modifier ratio (one editorial modifier + base) at 5 ADD with cross-family resonance (matches Sumo's Nuclear Mirage alias precedent).
2. **Phoenix** -- 3-modifier compound flagship; FM video + IFPA record; most editorial density per page (pixie + ducking + butterfly stack); pairs naturally with Matador on the same 5-ADD butterfly tier for cross-modifier comparison.
3. **Mind Bender** -- pedagogical-pair flagship; no media but the single strongest A/B comparison in Wave-2 (Spender's spinning vs Mind Bender's ducking on the same paradox-blender frame). Editorial value comes from being read alongside Spender, not in isolation.

### 2.2 Strongest visual/media candidates

Matador, Phoenix, Tripwalk -- only 3 with FM video evidence. See `WAVE2_MEDIA_DISCOVERY.md` for tagging targets.

### 2.3 Strongest tutorial candidates

Tripwalk -- single-modifier compound; clean quantum=+1 intro on the most familiar non-rotational base (butterfly). Lowest learning ceiling among Wave-2; ideal tutorial entry.

Legeater -- 3 ADD beginner-tier modifier intro on pickup; pairs with Wave-1 Paste for a paired tutorial set.

### 2.4 Strongest notation examples

- **Tripwalk** -- cleanest single-modifier semantic notation; demonstrates quantum-token highlighting in isolation. Best teaching exhibit for the cool-palette semantic role rendering.
- **Mind Bender** -- semantic and operational notation diverge most visibly here. Semantic: `ducking paradox blender` (3 tokens, all IFPA-vocab). Operational: `Clip >> Duck (BOD) >> Same Front Whirl (DEX)(PDX) > (back) Spin (BOD) > Same Clip (XBD)(DEL)` -- 5 op-sequence steps. Best teaching exhibit for "semantic structure differs from operational steps."
- **Spinal Tap** -- semantic `tapping torque` looks deceptively simple. Pt11 ruling expands `torque -> Miraging Osis`, so the actual ADD math is `tapping (1) + miraging (1) + osis (3) = 5`. Best teaching exhibit for "compound-name versus transitive decomposition."

---

## 3. UX2 promotion candidates

Per the `UX2_PILOT_IMPLEMENTATION.md` Section §10 gate: pilot remains scope-locked to Montage unless explicit human direction extends it. This W2c plan does NOT promote any row; it identifies which would be the cleanest promotions if the gate opens.

### 3.1 Recommended UX2 promotion order (if approved)

1. **Matador** -- has all UX2-pilot ingredients (flagship media, settled-modifier intro, strong family tier, single concise composition). Curator authoring effort ~ Montage.
2. **Phoenix** -- 3-modifier prose density rivals Montage; pairs Matador on the 5-ADD butterfly tier so promoting both creates a cross-page educational unit.
3. **Mind Bender** -- pedagogical-pair value with Spender is highest editorial yield; lack of media is the only weakness, and the empty-state pattern is already validated by Montage.

### 3.2 Should remain lightweight (legacy template)

- **Tripwalk** -- single-modifier compound; full UX2 prose would dilute the "minimal quantum intro" pedagogical role.
- **Legeater** -- beginner tier; lightweight is the correct treatment.
- **Spinal Tap** -- interesting but pages at this composition density read fine in legacy template; UX2 prose adds little.

### 3.3 Gate confirmation needed

UX2 extension requires explicit human approval per `project_freestyle_state.md` and `feedback_paused_crosstrack_no_writes.md`. This W2c plan provides the analysis only.

---

## 4. Seeding strategy

### 4.1 Operational notation (per-row drafts in `WAVE2_OPERATIONAL_NOTATION_DRAFTS.md`)

All 6 rows have FM operational-notation evidence. Federation-not-adoption posture:
- FM strings are starting drafts, NOT auto-imports.
- Each draft requires curator review before landing in `freestyle_tricks.operational_notation`.
- Source provenance line follows O1d pattern: `"FM curator-reviewed (2026-05-11)"`.
- Apply via `red_corrections_2026_04_20.csv` with field=`operational_notation` and field=`operational_notation_source` per Wave-1 (montage + 7 others) precedent.

### 4.2 Editorial prose (per-row drafts in `WAVE2_EXECUTION_GUIDE_DRAFTS.md`)

Three prose blocks per row:
- **Execution summary** -- plain-English mechanics; 1-2 short paragraphs.
- **Learning notes** -- where practitioners struggle; what to focus on.
- **Prerequisite notes** -- which lower-ADD tricks to master first.

These three correspond to the UX2 pilot's `executionParagraphs` / `learningParagraphs` / `prerequisiteParagraphs` view-model fields. For rows NOT promoted to UX2, the prose can land in the existing `description` column (or be held for a future schema migration per UX2 plan §6.5).

### 4.3 Related-tricks + family-progression authoring

Service-side `relatedTricks` derivation is automatic (R1 same-family / R2 modifier-prefix / R3 grandparent rules). No curator authoring needed; new rows enter that derivation as soon as they land. Wave-2's role: surface the pedagogical pairings (`WAVE2_FAMILY_LADDER_NOTES.md`) so curator-authored learning-notes prose references the right sibling tricks.

### 4.4 Tagging cadence

Recommended ship order:
1. **W2c-A (this phase)** -- author all drafts; no DB writes.
2. **W2c-B (next phase, awaiting approval)** -- promote Tier-1 operational notation seeds into the DB via `red_corrections_2026_04_20.csv`. Apply loader 19 + parser-population. Smoke-render. Test green.
3. **W2c-C (next phase, awaiting approval + media curation)** -- tag FM-video evidence for Matador / Phoenix / Tripwalk into `freestyle_media_links` (curator-mediated; per `feedback_gallery_dave_track.md` gallery-edit-tool may be in flight -- check with Dave first).
4. **W2c-D (deferred; explicit human approval gate)** -- UX2 pilot extension to Matador / Phoenix / Mind Bender per §3.1.

This plan delivers only W2c-A. Other phases are sequenced; nothing executes here.

---

## 5. Page-completeness scoring

| Row | Today | Post W2c-A | Post W2c-B | Post W2c-C | Post W2c-D |
|-----|-------|-----------|-----------|-----------|-----------|
| Matador | semantic-only | drafts authored | + op notation | + tutorial media | + UX2 layout |
| Phoenix | semantic-only | drafts authored | + op notation | + tutorial media | + UX2 layout |
| Mind Bender | semantic-only | drafts authored | + op notation | (no media) | + UX2 layout |
| Tripwalk | semantic-only | drafts authored | + op notation | + tutorial media | (legacy stays) |
| Legeater | semantic-only | drafts authored | + op notation | (no media) | (legacy stays) |
| Spinal Tap | semantic-only | drafts authored | + op notation | (no media) | (legacy stays) |

W2c-A = today's output. W2c-B-D require explicit approval gates.

---

## 6. Notation rendering distinctions (best examples per layer)

The user asked which rows best demonstrate semantic vs operational notation distinctions. Each layer has different teaching strength:

| Layer | Best Wave-2 demonstrator | Why |
|-------|--------------------------|-----|
| Semantic notation (cool palette; `notation` column) | Tripwalk | Single-modifier compound; quantum token highlights in isolation; pt10 ruling provides anchored explainer copy. |
| Operational notation (warm palette; `operational_notation` column) | Mind Bender | 5 op-sequence steps including BOD, DEX, PDX, XBD, DEL tags exercising the full operational-grammar vocabulary on one page. |
| Editorial decomposition (`freestyle_trick_modifier_links` table) | Phoenix | 3-modifier compound where each modifier's editorial entry surfaces a distinct `add_bonus` value (pixie 1, ducking 1, on butterfly base 3). |
| Self-atom vs modifier-derived | Spinal Tap | Pt11's torque=Miraging-Osis transitive ruling means the editorial decomposition (tapping+torque) sits over a parser-side decomposition that further expands to (tapping+miraging+osis). Shows the layered structure explicitly. |

Recommendation: when the UX2 pilot extends, use Tripwalk's semantic block as the cool-palette flagship and Mind Bender's operational block as the warm-palette flagship. Cross-page references in the glossary can point at both.

---

## 7. Preservation guarantees

- **Federation-not-adoption.** Every FM-derived string in `WAVE2_OPERATIONAL_NOTATION_DRAFTS.md` is marked as a draft requiring curator review. No auto-import. Source provenance line goes into `operational_notation_source`.
- **Parser/editorial separation.** Operational notation lives in its own column; never read by the parser; never affects asserted ADDs. Editorial decomposition table (`base_trick` + `freestyle_trick_modifier_links`) remains the ADD-math authority.
- **Restraint-first rendering.** Operational-notation section omits when column is NULL (existing template behavior; verified). No new template surfaces introduced. UX2 promotion stays gated.
- **Wave-1 notation UX conventions.** Cool palette for semantic, warm palette for operational, glossary deeplinks at both, UX1 Phase A token tooltips intact. No client-JS changes.

---

## 8. Out of scope for this enrichment plan

- No DB writes. All drafts are file-only.
- No ontology mutation. No modifier weights change. No base-trick changes.
- No Wave-3 candidate processing. No fairy/gyro/blazing vocab introduction.
- No Q1-Q4 dependency resolution. Tier-3 ready-after-Red rows untouched.
- No new modifier registration. All 6 rows use IFPA-vocab modifiers.
- No media-link insertions. Media tagging is a separate curator pass (W2c-C, gated).
- No UX2 pilot promotion. Pilot remains Montage-only (W2c-D, gated).
- No description-column rewrites. Wave-2 inserts already landed minimal descriptions; this plan does NOT mutate those.

---

## 9. Decision points awaiting human input

1. Approve W2c-B (operational-notation seed into DB) for some / all / none of the 6 rows? Drafts in `WAVE2_OPERATIONAL_NOTATION_DRAFTS.md` are ready to land via loader 19.
2. Approve W2c-C (media tagging) for Matador / Phoenix / Tripwalk? Requires coordination with Dave's gallery-edit-tool track (`feedback_gallery_dave_track.md`).
3. Approve W2c-D (UX2 pilot extension to Matador / Phoenix / Mind Bender)? Pilot gate currently scope-locked to Montage per `feedback_paused_crosstrack_no_writes.md`-style restraint.
4. Confirm the per-row prose drafts in `WAVE2_EXECUTION_GUIDE_DRAFTS.md` are technically accurate before any prose lands in code or DB.
5. Confirm the deferred-vs-shipped split for Tripwalk / Legeater / Spinal Tap (recommendation: ship operational notation; defer UX2 layout).
