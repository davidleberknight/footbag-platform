# Symbolic Representation Hierarchy — Governance Audit (2026-05-16)

## Status

Audit only. No code changes. This audit follows the Family View normalization audit (this directory's `AUDIT.md`) and supersedes the implicit fallback-ladder behavior currently in `dictionary-trick-card.hbs` for browse-density rendering.

## The blocker, restated

The renderer normalization succeeded. The visual incoherence the user observes is NOT a rendering bypass. It is a **symbolic-language priority** problem.

Today, the partial asks:

> "What symbolic content does this row have?"

It should ask:

> "What symbolic dialect does this view speak, and what does this row contribute in that dialect?"

The dialect-priority question has never been answered. The fallback ladder
(`tokenizedEquivalences` → `operationalNotation` → `Notation pending`)
silently mixes three dialects across a single view. This is the governance gap.

## Visual evidence (from the user's two screenshots, 2026-05-16)

### ADD View, 3-ADD bucket — three dialects in one column

The bucket shows 12 rows. Each speaks one of three dialects, no coherent grouping:

| Slug | Rendered formula | Dialect |
|---|---|---|
| refraction | *(silent gap)* | none / pending |
| rev up | *(silent gap)* | none |
| rev whirl | *(silent gap)* | none |
| reverse-drifter | `CLIP >> OP OUT [DEX] > SAME CLIP [XBD] [DEL]` | **operational** |
| scrambled eggbeater | `TOE > OP OUT [DEX] >> OP IN [DEX] > SAME TOE [DEL]` | **operational** |
| smear | `pixie mirage` | **compositional** |
| smudge | `pixie illusion` | **compositional** |
| spinning clipper | *(silent gap)* | none |
| swirl | `[set] > leggy (xbd) out dex > ss clipper` | **operational** |
| symposium mirage | `symposium mirage` | **compositional** |
| tap | `atomic near mirage` | **compositional** |
| whirl | `[set] > leggy in dex > ss clipper` | **operational** |

Adjacent rows speak entirely different languages. The user reading this column cannot form a stable mental model of "what a 3-ADD trick looks like" because the symbolic surface keeps shifting.

### Family View, Whirl section — the anchor inversion

| Slug | Rendered formula | Position in family |
|---|---|---|
| whirl | `[set] leggy in dex ss clipper` | **anchor (base, 3 ADD)** |
| rev up | "Notation pending" | direction variant |
| rev whirl | "Notation pending" | direction variant |
| ducking whirl | `≡ ducking whirl` | **descendant (4 ADD)** |

The family anchor `whirl` renders LESS structurally clean than its descendant `ducking whirl`. Op-notation looks like technical scaffolding next to the descendant's clean modifier+base reading. The hierarchy is visually inverted: the descendants look more normalized than the root. This is the load-bearing screenshot.

## Why the inversion exists today

Today's partial fallback ladder is content-availability-driven, not dialect-driven:

```
if tokenizedEquivalences.length > 0       → render compositional tokens
else if operationalNotation                → render operational tokens
else                                       → render pending placeholder
```

The ladder asks: "does this row have any symbolic content at all?" If yes, render whatever it has.

- A descendant like `paradox-whirl` has a curator-authored chain → renders `≡ paradox whirl` (compositional).
- A base like `whirl` has no chain (it IS the base; nothing to decompose) → falls to operational notation → renders `[set] > leggy in dex > ss clipper`.

Both code paths are correct in isolation. They are wrong in juxtaposition.

## The dialects, classified

### Dialect A — Compositional chain (canonical curator content)

Source: `src/content/freestyleSymbolicEquivalences.ts` — 62 chain entries authored by curator.
Form: lower-case operator words joined into a structural sentence.
Tokenization: each word lookup in `BASE_ANCHORS` / `MODIFIERS` / `SIDE_POSITIONAL` registry.

Examples:
- `pixie mirage` (smear)
- `paradox whirl` (paradox-whirl)
- `gyro torque` (mobius)
- `miraging osis` (torque)
- `stepping near butterfly` (sidewalk)

Visual weight: HIGH — color-coded tokens, glossary-linked anchors, family-anchor underlines.

### Dialect B — Modifier + base shorthand

Source: derivable on-the-fly from canonical name when both tokens are registered.
NOT currently a separate code path. Today this collapses into Dialect A when curator-authored chain content equals the canonical name (e.g., `atomic butterfly` chain equals the slug-decomposed reading).

This is conceptually a SUB-DIALECT of A. The user's audit treats it as distinct, but in current code they share the same renderer.

### Dialect C — Operational notation

Source: `freestyle_tricks.operational_notation` column (curator-authored separately).
Form: bracketed component flags, sequence operators, surface names — execution-mechanics description.
Tokenization: different registry (`op-token`, role-tagged surfaces / dexes / bodies / structural flags).

Examples:
- `[set] > leggy in dex > ss clipper` (whirl)
- `CLIP >> OP OUT [DEX] > SAME CLIP [XBD] [DEL]` (reverse-drifter)
- `TOE > OP OUT [DEX] >> OP IN [DEX] > SAME TOE [DEL]` (scrambled-eggbeater)

Visual weight: HIGH (today, same as Dialect A) — bold uppercase tokens with brackets.

### Dialect D — Pending / unresolved

Source: absence of content in A/B/C.
Form: italic placeholder `Notation pending` (browse density) or silent (registry density).
Visual weight: LOW (italic muted color in browse; invisible in registry).

## Proposed hierarchy

The user's draft hierarchy (Tier 1: compositional / Tier 2: modifier-base shorthand / Tier 3: operational / Tier 4: pending) is sound but has one subtlety: Tier 1 and Tier 2 are not actually different rendering paths today. They produce identical visual output when the chain reading equals the modifier+base decomposition. Treating them as a single tier is cleaner and avoids implying a code split that doesn't exist.

### Recommended hierarchy

| Tier | Dialect | Rendering rule |
|---|---|---|
| **1** | Compositional reading | Curator-authored chain. Render as colored tokens with glossary anchors. The canonical Family View / Component View / Topology View dialect. |
| **2** | Anchor declaration (NEW) | For family-base tricks with no decomposition, render a positive "anchor" indicator instead of falling through to operational notation. Example: `≡ family anchor` or just `(base)` as a subdued label. |
| **3** | Operational notation | DEMOTED. Surfaces on trick detail pages only. Removed from family / component / topology browse cards. Optionally present on ADD-view registry-density rows as a secondary line, visually subordinate to the title. |
| **4** | Pending | Italic `Notation pending` on browse density; silent on registry density. Reserved for rows with no chain AND no anchor-declaration eligibility AND no decision to render operational notation. |

The key shift: **operational notation drops out of the browse-card rendering ladder**. It does NOT compete with compositional chains for the same slot. It moves to a different surface (detail pages, or a secondary subordinate slot).

### What the new ladder looks like in code (proposal, not implemented)

```
if tokenizedEquivalences.length > 0       → Tier 1: render compositional tokens
else if isFamilyBaseAnchor                → Tier 2: render anchor declaration
else                                      → Tier 4: render pending placeholder

// Tier 3 (operational notation) is NOT in the browse-card ladder.
// It renders on the trick detail page under a separate, labeled section.
```

## Family View standardization proposal

**Family View speaks Tier 1 + Tier 2 only.** Operational notation is removed from family-view cards entirely. The family anchor declares itself as anchor; descendants render their compositional reading.

### Before / after sketch (whirl family, browse density)

| Slug | TODAY | PROPOSED |
|---|---|---|
| whirl | `[set] leggy in dex ss clipper` (op-notation) | `(family anchor)` — subdued label, no false decomposition |
| rev up | "Notation pending" | "Notation pending" (unchanged) |
| rev whirl | "Notation pending" | "Notation pending" (unchanged) |
| ducking whirl | `≡ ducking whirl` | `≡ ducking whirl` (unchanged) |
| paradox whirl | `≡ paradox whirl` | `≡ paradox whirl` (unchanged) |
| symposium whirl | `≡ symposium whirl` | `≡ symposium whirl` (unchanged) |
| blurry whirl | `≡ blurry whirl` + `≡ stepping paradox whirl` | unchanged |
| montage | `≡ spinning ducking paradox symposium whirl` | unchanged |
| **hatchet** | `CLIP >> DIVE [BOD] > SAME FRONT WHIRL [DEX] > OP CLIP [XBD] [DEL]` (op-notation) | "Notation pending" (op-notation removed; folk-name compound awaits curator) |
| **mullet** | `CLIP >> DUCK [BOD] >> ...` (op-notation) | "Notation pending" |
| **surreal** | `≡ surging paradox whirl` (chain) | unchanged |
| **montage** | `≡ spinning ducking paradox symposium whirl` (chain) | unchanged |
| **tomahawk** | "Notation pending" | "Notation pending" (unchanged) |

Net effect: every row in Family View speaks ONE dialect (compositional) or is explicitly absent (anchor / pending). Visual coherence restored without inventing decompositions.

### Trade-offs of demoting operational notation

**What we lose:** users who reach Family View looking for execution-mechanics scaffolding for `whirl`, `hatchet`, `mullet` no longer see it on the card. They have to click into the detail page.

**What we gain:** Family View becomes a single-dialect surface. The anchor inversion disappears. Folk-name compounds without curator-authored chains no longer pretend to be operationally documented — they explicitly read "Notation pending" so the curator gap is visible.

**Mitigation:** the trick detail page already renders operational notation under a dedicated section. The Family View card link takes the reader there. No content is lost; it just lives in one place rather than two.

## Examples — pilot before / after (across the 4 target families)

### Whirl family (anchor case)

| Slug | Today | Proposed |
|---|---|---|
| whirl | op-notation | anchor declaration |
| paradox-whirl | `≡ paradox whirl` | unchanged |
| spinning-whirl | `≡ spinning whirl` | unchanged |
| hatchet | op-notation | pending |
| tomahawk | pending | unchanged |
| montage | `≡ spinning ducking paradox symposium whirl` | unchanged |

### Butterfly family

| Slug | Today | Proposed |
|---|---|---|
| butterfly | `[set] > hippy out dex > ss clipper` (op) | anchor declaration |
| parkwalk | `TOE > SAME IN [DEX] >> SAME OUT [DEX] > OP CLIP [XBD] [DEL]` (op) | pending |
| ripwalk | `≡ stepping butterfly` | unchanged |
| dimwalk | `≡ pixie butterfly` | unchanged |
| matador | `≡ nuclear butterfly` + `≡ paradox atomic butterfly` | unchanged |
| phoenix | `≡ pixie ducking butterfly` | unchanged |

### Mirage family

| Slug | Today | Proposed |
|---|---|---|
| mirage | `[set] > hippy in dex > op toe` (op) | anchor declaration |
| paradox-mirage | `≡ paradox mirage` | unchanged |
| smear | `≡ pixie mirage` | unchanged |
| tap | `≡ atomic near mirage` | unchanged |
| blur | `CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]` (op) | pending |
| witchdoctor | pending | unchanged |
| fury | pending | unchanged |

### Torque family

| Slug | Today | Proposed |
|---|---|---|
| torque | `≡ miraging osis` (chain — torque IS already chained, so it shows as a chain) | unchanged — torque has a curator-confirmed compositional reading |
| paradox-torque | `≡ paradox torque` | unchanged |
| mobius | `≡ gyro torque` | unchanged |
| spinal-tap | `TOE > OP OUT [DEX] >> ...` (op) | pending |
| gauntlet | `≡ blurry ducking torque` + `≡ stepping ducking paradox torque` | unchanged |

Notable: **torque is NOT an anchor-only case** because it has a curator-confirmed compositional reading (`miraging osis`). The proposal preserves it. Anchor declaration is only for rows that have neither a chain NOR a useful decomposition.

## Fallback rules (proposed)

For each row, decide rendering in this order:

1. **Chain exists** → Tier 1 (compositional reading, color-tokenized).
2. **No chain AND row is a curator-confirmed family base anchor** → Tier 2 (anchor declaration label).
3. **Else** → Tier 4 (pending placeholder in browse density; silent in registry density).

Operational notation is NOT a fallback for browse-card rendering. It only renders on the trick detail page (existing surface, separate section, dedicated label) and on the symbolic-compression flow in glossary §8.

### Anchor declaration — who qualifies

A row gets the anchor declaration ONLY if:
- It is in `CORE_TRICKS` (the 12 curator-authored core atoms per `[[project_freestyle_core_atoms]]`)
- AND it has no chain entry in `freestyleSymbolicEquivalences.ts`

The 12 core atoms: `toe-stall`, `clipper-stall`, `around-the-world`, `orbit`, `legover`, `pickup`, `mirage`, `illusion`, `butterfly`, `osis`, `whirl`, `swirl`.

Of these:
- `torque` and `blender` are named-compound bases (also family anchors) but have curator-authored chains (`miraging osis`, `whirling osis`). Tier 1.
- Bare-base atoms (`whirl`, `butterfly`, `mirage`, `osis`, `illusion`, `legover`, `pickup`, `swirl`) get Tier 2 anchor declaration.
- Stall atoms (`toe-stall`, `clipper-stall`) get Tier 2 — they ARE primitives, no decomposition.
- `around-the-world` (and its display alias `atw`) and `orbit` are also primitives; Tier 2.

Anchor declaration label proposal: subdued styling, NOT a colored token row. A single short text like `(base)` or `(family anchor)` or `(primitive)`. Curator decision on exact wording.

## View-specific dialect assignment (proposed)

| View | Primary dialect | Fallback hierarchy |
|---|---|---|
| **ADD** | Compositional (Tier 1) | Tier 2 anchor → Tier 4 pending |
| **Family** | Compositional (Tier 1) | Tier 2 anchor → Tier 4 pending |
| **Component** | Compositional (Tier 1) | Tier 2 anchor → Tier 4 pending |
| **Topology** | Compositional (Tier 1) | Tier 2 anchor → Tier 4 pending |
| **Category** | Compositional (Tier 1) | Tier 2 anchor → Tier 4 pending |
| **Trick detail page** | Compositional (Tier 1) PLUS operational notation in separate labeled section | Detail page is the home for operational notation |
| **Glossary §7 / §8** | Compositional (Tier 1) + operational notation contrast table (existing) | Glossary is where the contrast is taught |

Every browse view speaks ONE dialect. Operational notation moves to detail pages and glossary teaching surfaces.

### Why no view-specific dialect

The user's prompt suggests differentiating ADD-view scanability from Family-view compositional emphasis from Component-view token visibility. Tempting, but DANGEROUS — it would resurrect the visual-identity gap the Slice A normalization closed.

The card identity invariant requires the SAME slug to render the same visible content across views. Different dialects per view would break this. The right axis of differentiation is DENSITY (inline scan vs stacked card), not DIALECT.

## Restraint constraints honored

Per the post-Slice-E posture and the four-layer doctrine:

- **No invented decompositions.** `whirl` is not auto-derived into `LEGGY IN DEX + CLIPPER` or similar. It declares itself an anchor. No fake structural claim.
- **No ontology over-hardening.** Operational notation is DEMOTED (moved to a different surface), not deleted. The data stays in `freestyle_tricks.operational_notation`; the rendering surface changes.
- **No parser AST aesthetics.** The anchor declaration is a label, not a tree.
- **No giant symbolic trees.** The compositional reading remains a single-line flat token sequence.
- **No over-tokenization.** No new token roles added.
- **No doctrinal claims beyond evidence.** Operational notation, when authored by the curator, remains preserved in the DB; it just doesn't compete on browse cards. Folk-name compounds without chains explicitly read "pending" so the gap is visible.
- **Observational ≠ canonical.** The anchor declaration is a true canonical assertion ("this is a family base") — only for the 12 curator-authoritative core atoms. No observational atoms get the label.

## Whirl pilot — concrete recommendations

Direct answers to the user's pilot questions:

| Slug | Today's render | Proposed render | Rationale |
|---|---|---|---|
| `whirl` | `[set] > leggy in dex > ss clipper` | `(family anchor)` subdued label | Family base; do not invent compositional reading; do not show op-notation on browse cards |
| `swirl` | `[set] > leggy (xbd) out dex > ss clipper` | `(family anchor)` | Same as whirl; CORE_TRICKS member |
| `paradox-whirl` | `≡ paradox whirl` | unchanged | Curator chain authored |
| `ducking-whirl` | `≡ ducking whirl` | unchanged | Curator chain authored |
| `blurry-whirl` | `≡ blurry whirl` + `≡ stepping paradox whirl` | unchanged | Multi-stage chain authored |
| `rev-whirl` | "Notation pending" | "Notation pending" | No chain; not a curator-confirmed canonical primitive; awaits direction-variant policy decision |
| `reverse-drifter` | op-notation in ADD view | pending OR anchor-eligible | DECISION POINT: is reverse-drifter a canonical primitive (anchor) or a direction-variant of drifter (pending)? Curator question |
| `hatchet`, `mullet`, `tomahawk` | mixed (op for hatchet/mullet, pending for tomahawk) | "Notation pending" for all three | Folk-name compounds whose decomposition is not curator-locked; treating all three consistently |

The whirl-anchor problem dissolves once op-notation leaves the browse-card ladder. The anchor declares itself as anchor; the descendants show their compositional readings. Hierarchy restored.

## Unresolved doctrine areas

These questions need curator decision before implementation:

1. **Anchor declaration exact wording.** `(base)` vs `(family anchor)` vs `(primitive)` vs just an `⚓` glyph vs no label at all (silent). Tone-bearing curator decision.

2. **Anchor declaration visual style.** Subdued gray vs italic vs background-tinted pill vs plain text. Restraint says: as subdued as possible.

3. **Direction variants (`rev-whirl`, `rev-up`, `rev-swirl`, `reverse-drifter`).** Are these family-base anchors of their own (`(direction variant of whirl)` label?) or are they pending compounds awaiting a "reverse" operator policy? This intersects [[project_freestyle_post_slice_e_posture]] unresolved doctrine #4 (reverse/rev policy).

4. **Operational notation on registry-density ADD view.** Removed entirely (consistent with Family View) OR kept as secondary subordinate slot (gray, smaller)? The ADD view's scan use case slightly differs from Family View's compositional emphasis.

5. **Category view.** Does category view stay Tier 1 compositional, or revert to the legacy category-tag visibility that previously dominated? Tied to Slice D category-taxonomy work.

6. **Topology view operational-notation removal.** Same question as Family View; same answer (remove) recommended.

7. **Pending placeholder visibility in registry density.** Currently silent in registry. Should it become VISIBLE in registry once op-notation leaves the ladder? Currently silent is acceptable because op-notation filled the slot for many rows; with op-notation removed, the silent gap will appear far more often. Curator decision on whether to symmetrize the placeholder.

## Risk analysis

### Risk 1 — Operational notation users lose discoverability

Players who navigate to `/freestyle/tricks?view=family` and want execution-mechanics for `whirl` no longer see them on the family-view card. They have to click into the detail page.

**Mitigation:** add a small, restrained indicator on rows with operational notation — e.g., a subdued chip "Op notation available →" that links to the detail page's operational-notation section. NOT a token, NOT a formula — just a labeled affordance.

### Risk 2 — Coverage perception drop

Today's Family View shows formula content on many rows (chain OR op-notation). After demoting op-notation, the rows that previously rendered op-notation will read "Notation pending" instead. This will visually inflate the "pending" cohort by 1.5×–2× in many families.

**Mitigation:** the cohort SIZE is exactly the same; only the LABEL changes. The actual chain-coverage gap was always real (just masked by op-notation). Making it visible is the audit's intent — users see where curator chain work is needed.

### Risk 3 — Anchor declaration drifts into fake decomposition

If `(family anchor)` reads too much like a special "operator," subsequent slices may be tempted to extend it. E.g., `(direction variant)`, `(catch primitive)`, `(operator)`.

**Mitigation:** anchor declaration is RESTRICTED to the 12 CORE_TRICKS members WITHOUT chains. Any future label extension requires explicit curator decision via this audit's doctrine sections.

### Risk 4 — Detail-page operational notation surface needs verification

If op-notation is removed from family cards, the trick detail page must ALREADY surface op-notation prominently. If it doesn't, removing op-notation from cards leaves users stranded.

**Mitigation (verification before implementation):** confirm that `/freestyle/tricks/whirl` currently renders the operational notation prominently in a dedicated section. If not, that surface must be strengthened FIRST.

### Risk 5 — Chain-coverage feels like the bottleneck again

With op-notation removed from family cards, every "Notation pending" row visually demands a curator chain. The temptation to invent chains for folk-name compounds (parkwalk, hatchet, mullet, blur, witchdoctor, fury, spinal-tap) will increase.

**Mitigation:** the post-Slice-E posture explicitly preserves restraint. Pending is honest; inventing decompositions is dishonest. Pending labels are the right answer.

## Recommended implementation slices

This is a foundational change. Multiple small slices, none rushed.

### Slice G1 — Anchor declaration plumbing (small)

1. Add an `isFamilyAnchor` (or `kind === 'family-anchor'`) discriminator on `DictionaryTrickCard`. Populated when the slug is in CORE_TRICKS AND has no chain.
2. Add an `anchorDeclaration: string | null` field with curator-chosen wording.
3. No partial change yet. Service-shape only.
4. Tests: assert the field populates for the 8 anchor-eligible slugs (whirl, butterfly, mirage, osis, illusion, legover, pickup, swirl) plus the 2 stalls + atw + orbit, with the right field values.

### Slice G2 — Partial fallback ladder reshape (small, behind density rules)

1. Change the partial's fallback ladder. For browse density:
   - Tier 1 chain → render compositional tokens (unchanged)
   - Tier 2 anchor declaration → render the curator label
   - Tier 4 pending → render placeholder (unchanged)
   - Tier 3 op-notation is REMOVED from this ladder.
2. Registry density: same ladder, silent on pending.
3. Operational notation no longer renders on any browse card.
4. Tests: assert op-notation does NOT appear inside `<article class="dict-card">` markup; assert anchor labels DO appear on the 12 core anchors.

### Slice G3 — Detail page operational-notation reinforcement (verification + maybe small CSS)

1. Verify the trick detail page surfaces operational notation in a labeled, prominent section. If yes, no code change. If no, strengthen the detail-page op-notation block.
2. Add the small "Op notation available →" affordance on browse cards for rows that have op-notation in the DB. Subdued chip, links to the detail page's op-notation anchor.

### Slice G4 — Curator pass on pending cohort (no code; curator work)

1. With op-notation demoted, the pending cohort visually grows. Curator reviews the 5 (whirl-family) + 4 (mirage/butterfly/torque) folk-name compounds and decides:
   - Authored chain → adds Tier 1 entry
   - Direction-variant policy → groups rev-* into a small category with consistent treatment
   - Truly unresolved → stays pending; awaits Wave-2 or deeper curator triage

### Slice G5 — Documentation (docs + glossary)

1. Glossary §7 should reflect the dialect hierarchy (compositional primary, operational secondary). Update §7's existing layer-contrast table.
2. Audit doc references in skills: `footbag-freestyle-dictionary` SKILL.md section A (four-layer separation) should add a note: "operational notation is layer-3-symbolic-decomposition AND a technical execution layer; on browse surfaces compositional always wins."

### Sequencing

G1 → G2 → G3 (verification gate before browse-card op-notation removal) → G4 (curator) → G5 (docs).

G1, G2 are mechanical. G3 is gated on detail-page verification. G4 is curator-only. G5 is documentation.

**Do not start any of G1-G5 before:**
- Curator decision on anchor declaration wording (open question #1)
- Curator decision on direction-variant policy (open question #3)
- Manual QC pass over current Family View (per [[project_freestyle_post_slice_e_posture]] recommended sequence step #1)

## Acceptance criteria for the new contract

When Slice G1-G5 ship, the dictionary surfaces must satisfy:

1. Every browse card in Family / Component / Topology / Category / ADD view speaks ONE symbolic dialect (compositional) OR is explicitly labeled (anchor declaration / pending).
2. Operational notation appears on browse cards in zero places. It appears on the trick detail page and on glossary §7 contrast table — those two surfaces only.
3. The whirl family anchor inversion is gone — `whirl` reads as anchor; `paradox-whirl` reads as `≡ paradox whirl`; the anchor reads MORE pedagogically primary than its descendants, not less.
4. No row pretends to decompose when it doesn't.
5. The 12 CORE_TRICKS anchors are all marked as anchors when they don't have chains; the 2 named-compound bases (torque, blender) keep their chain readings.

## What this audit does NOT propose

- No multi-family memberships (Slice D territory).
- No taxonomy reshape (Slice D).
- No new token roles (symbolic restraint doctrine).
- No interactive UI affordances on tokens (Slice E covered the restrained jump pattern).
- No new schema columns. All shaping is curator-content + service-derivation.
- No changes to glossary content beyond a single §7 contrast-table note.
- No Batch 5 resumption.

## End

This audit closes the gap between renderer normalization and symbolic-language governance. The remaining work is curator decisions (open questions list) and the small implementation slices G1-G5.

The whirl screenshot is the load-bearing artifact: when the anchor reads less normalized than its descendants, the hierarchy is inverted. Restoring it is the goal.
