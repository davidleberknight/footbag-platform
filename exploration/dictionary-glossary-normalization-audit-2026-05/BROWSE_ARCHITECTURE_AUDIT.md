# Browse Architecture Audit — Movement-Mechanics Reorientation (2026-05-16)

## Status

Audit + architecture proposal only. NO implementation this turn. The user has explicitly requested ontology clarification, naming clarification, browse-surface clarification, and educational-hierarchy clarification — NOT yet a build.

Hard constraints (re-stated):
- Do NOT implement giant new browse systems yet
- Do NOT build parser IDE views
- Do NOT over-engineer topology maps
- Do NOT destabilize the current dictionary rendering kernel (Slice H2 / I / J / K all stand)

## 1. Current browse surfaces — forensic inventory

The dictionary's view toggle at `/freestyle/tricks` currently offers 5 surfaces:

| Surface | URL | Source | What it groups by |
|---|---|---|---|
| By ADD | `/freestyle/tricks` | service `addGroups` | ADD numeric bucket (0, 1, 2, ... 7, unrated) |
| By Family | `?view=family` | service `familyGroups` | `freestyle_tricks.trick_family` + Slice J overrides |
| By Category | `?view=category` | service `groups` | `freestyle_tricks.category` column |
| By Component | `?view=component` | service `componentView` | `freestyle_trick_modifier_links` (modifier_type axis) |
| By Topology | `?view=topology` | service `topologyView` | curator-authored connective-panel topology groups |

### 1.1 By Category — ground truth

Post-Slice-A `kind='trick'` filter, the category bucketing is:

| Category | Count | Notes |
|---|---|---|
| `compound` | **97** | The dominant bucket — almost no grouping value |
| `surface` | 14 | Stall primitives (toe-stall, clipper-stall, etc.) |
| `dex` | 14 | Dexterity-type tricks (whirl, swirl, torque, etc.) |
| `body` | 12 | Body-mechanic tricks (cloud-kick, flying-clipper, etc.) |
| `modifier` | 10 | Filtered by Slice A `kind='modifier'` — does NOT render |
| `set` | 9 | Filtered by Slice A `kind='operator'` — does NOT render |
| (null) | 4 | (terrage, barrage, squeeze, pendulum) |

After kind filtering: 4 buckets actually render — compound (97), surface (14), dex (14), body (12). Total 137 rows.

**Conceptual diagnosis:** the `category` column is a parser-derived classification from the original dictionary-extraction pipeline. "Compound" is a catch-all for "anything with structural depth" — it's not a movement-mechanics axis. The dex/body/surface labels carry some signal but are inconsistent with how tutorials and players actually describe tricks.

### 1.2 By Component — ground truth

`freestyle_trick_modifier_links` keyed by modifier_slug — 16 distinct modifier slugs surface:

| Modifier slug | Trick-link count | Axis |
|---|---|---|
| paradox | 17 | body |
| spinning | 14 | body |
| stepping | 13 | body |
| ducking | 10 | body |
| symposium | 10 | body |
| pixie | 9 | set |
| blurry | 6 | body |
| atomic | 4 | set |
| quantum | 3 | set |
| tapping | 3 | body |
| furious | 2 | set |
| gyro | 2 | body |
| nuclear | 2 | set |
| barraging | 1 | body |
| diving | 1 | body |
| whirling | 1 | body |

The component view today splits these into two axes (body modifiers + set modifiers) and renders each modifier's trick-membership list. **Same trick can appear in multiple component groups** (intentional duplication per the existing `duplicationNote`).

**Conceptual diagnosis:** the modifier-link bucketing IS movement-mechanics-aware, but the two-axis split (body vs set) is parser-flavored. The user's emerging 6-axis ontology re-distributes these modifiers across FOUR conceptually different layers, not two:

- **pixie / atomic / quantum / nuclear / furious / barraging / stepping / blurry** → Axis 1 (Set/Uptime Systems)
- **paradox** → Axis 2 (Entry/Cross-Body Topologies) — NOT a body modifier in the deepest sense
- **spinning / ducking / diving / inspinning / whirling / gyro / tapping** → Axis 3 (Midtime Body Modifiers)
- **symposium** → Axis 4 (No-Plant/Suspension Mechanics)

The current 2-axis split collapses these into a flat body-vs-set distinction that loses pedagogical structure.

### 1.3 By Topology — ground truth

Six curator-authored connective panels: **paradox / symposium / ducking / spinning / whirl / pixie**.

Each panel renders: definition + related tricks + related symbolic groups + notation hint + deep-link to a `/freestyle/modifier/{slug}` page (where shipped).

**Conceptual diagnosis:** the six panels mix THREE different ontology axes per the user's emerging classification:
- paradox → Axis 2 (Entry/Cross-Body)
- symposium → Axis 4 (No-Plant)
- ducking → Axis 3 (Midtime Body)
- spinning → Axis 3 (Midtime Body)
- pixie → Axis 1 (Set/Uptime)
- whirl → Axis 5 (Root Terminal Family) ← a different KIND of object entirely

The whirl panel doesn't belong in a "topology" sense — whirl is a family anchor, not a modifier or topology layer. This is the deepest source of incoherence: the current topology surface mixes axis-level groupings with family-anchor groupings.

## 2. Overlap and redundancy analysis

The three "structural" surfaces (Category, Component, Topology) overlap heavily today:

| Trick example | Where it appears | What each says |
|---|---|---|
| `paradox-whirl` | Category=compound, Component=body axis (paradox), Topology=paradox panel, Family=whirl | "It's compound" / "It uses paradox" / "It's a paradox-flavored trick" / "It's whirl-family" |
| `pixie-butterfly` (dimwalk) | Category=compound, Component=set axis (pixie), Topology=pixie panel, Family=butterfly | "It's compound" / "It uses pixie" / "It's pixie-flavored" / "It's butterfly-family" |
| `mobius` | Category=compound, Component=body axis (spinning), Topology=spinning panel, Family=torque | "It's compound" / "It spins" / "It's a spinning compound" / "It's torque-family" |

The user reads each browse view and gets four overlapping classifications without a clear semantic distinction between them.

### Overlap matrix (current 5 views)

| View | Pedagogical value today | Real overlap with other views |
|---|---|---|
| By ADD | HIGH — pure difficulty scan; orthogonal to all others | none (orthogonal) |
| By Family | HIGH (post-Slice I/J) — terminal-structure grouping with invariants and sibling-pair handling | partial overlap with Topology (whirl appears in both) |
| By Category | LOW — compound is 97 rows; remaining 3 buckets duplicate Family + Component info | redundant with Component (compound = "has modifier links") + Family |
| By Component | MEDIUM — modifier-driven grouping is real, but the 2-axis split is parser-flavored | duplicates Topology when panel-slug == component-slug (paradox/symposium/spinning/ducking/pixie all overlap) |
| By Topology | MEDIUM — observational panels work, but the 6 chosen anchors mix axes | overlaps Family (whirl panel) + Component (5 of 6 panels overlap) |

### Verdict on each current surface

- **By ADD:** keep unchanged. The difficulty-ladder use case is durable.
- **By Family:** keep, post-Slice-I/J state is the new strong shape. Family invariants + sibling pairs are working.
- **By Category:** retire. The 97-row "compound" bucket has no grouping value; the dex/body/surface labels are parser-flavored, not user-language.
- **By Component:** reinterpret, don't retire. The modifier-link data is the right input; the 2-axis split is the wrong organization. Re-bucket into the user's 4-axis modifier-system ontology.
- **By Topology:** reinterpret, partly retire. The 5 modifier panels (paradox/symposium/ducking/spinning/pixie) belong as axis entries in the new modifier-system view. The whirl panel belongs in family-view territory (already there post-Slice I). Optional: keep a smaller "Movement Neighborhoods" observational view for genuinely cross-axis groupings (e.g., midtime-body cluster).

## 3. Emerging 6-axis ontology (curator-stated, observational)

Verbatim from the curator's clarification:

| Axis | Name | What members share | Examples |
|---|---|---|---|
| 1 | Set / Uptime Systems | launch mechanics, uptime dex character | pixie, fairy, atomic, quantum, nuclear, barraging, furious, blurry, stepping |
| 2 | Entry / Cross-Body Topologies | entry relationship, cross-body framing | paradox, x-dex, op/ss positionals, near/far |
| 3 | Midtime Body Modifiers | apex body mechanics around the trick's midtime | spinning, ducking, diving, weaving, zulu, inspinning |
| 4 | No-Plant / Suspension Mechanics | body-discipline + suspension | symposium, symple, muted, flying |
| 5 | Root Terminal Families | conserved ending mechanic | whirl, rev-whirl, butterfly, mirage, osis, swirl |
| 6 | Compound / Compressed Branch Families | named compositional descendants that ARE families | torque (= miraging osis), blender (= whirling osis), drifter (= miraging clipper), barfly |

This ontology is **observational, not canonical** — same governance rule as Slice I family-invariant work and Slice J rev-whirl sibling work. Adding a member to any axis here does NOT change `freestyle_tricks.category`, `trick_family`, or any other DB column. Tag-style multi-axis observational layer.

## 4. Proposed replacement architecture

### 4.1 The simplest target shape

Reduce 5 view-toggles to 3 surfaces:

| Surface | Replaces | What it does |
|---|---|---|
| **By ADD** | By ADD (unchanged) | difficulty scan |
| **By Family** | By Family (post-Slice-I/J state preserved) | terminal-structure grouping with invariants and sibling pairs (axes 5 + 6) |
| **By Movement System** (NEW) | By Category + By Component + By Topology | axis 1 / 2 / 3 / 4 reorganized as sections within one view |

Three browse modes. Each answers a clear question:

- **By ADD:** "How hard is it?" (orthogonal to structure)
- **By Family:** "What is its conserved ending?" (axes 5 + 6, the structural-anchor lens)
- **By Movement System:** "What does the body do during the trick?" (axes 1–4, the modifier-system lens)

### 4.2 By Movement System — section structure

Within the new view, four labeled sections matching the four modifier-system axes:

```
By Movement System
├── §1. Set / Uptime Systems         (axis 1; 9 modifier groups: pixie, atomic, quantum, fairy, nuclear, barraging, furious, blurry, stepping)
├── §2. Entry / Cross-Body Topologies (axis 2; paradox + structural framings)
├── §3. Midtime Body Modifiers        (axis 3; spinning, ducking, diving, etc.)
└── §4. No-Plant / Suspension         (axis 4; symposium, muted, flying)
```

Each section has subsections (one per modifier slug). Each subsection shows the tricks that link via `freestyle_trick_modifier_links` PLUS curator-attached observational members. Same dictionary-trick-card rendering as everywhere else (Slice H2 contract).

### 4.3 Alternative target shape — 4 views

If 4 sections inside one view feels too dense, split the new view into 4:

| View | Axis |
|---|---|
| By Set System | Axis 1 |
| By Body Mechanic | Axes 2 + 3 + 4 merged (since they're all "what the body does") |
| OR split further — 4 separate views (matches axis count 1:1) | |

Tradeoff:
- 1 unified view (recommended): simpler nav, axis labels carry the structural distinction
- 4 separate views: clearer axis-as-toggle but more navigation chrome

The user's stated goal "without overwhelming users" leans toward the unified-view shape.

## 5. Suggested naming

### 5.1 View-level (the toggle bar)

Recommended:

| Slot | Recommended | Alternatives |
|---|---|---|
| 1 | **By ADD** (unchanged) | — |
| 2 | **By Family** (unchanged) | — |
| 3 | **By Movement System** | "By Mechanics" / "By Modifier System" / "By Movement Layer" |

Why "Movement System": it reads as movement-mechanics-oriented (not parser-oriented), survives the user's restraint preference, and doesn't claim canonical taxonomy.

Avoid:
- "By Category" (current name is the problem)
- "By Component" (parser-flavored)
- "By Topology" (implies geometric structure; not the right metaphor for modifier systems)

### 5.2 Section names within "By Movement System"

Recommended:

| Section | Name | Curator alternative |
|---|---|---|
| §1 | Set / Uptime Systems | "Set primitives" / "Launch systems" |
| §2 | Entry & Cross-Body Topologies | "Entry mechanics" / "Cross-body topology" |
| §3 | Midtime Body Modifiers | "Body mechanics" / "Midtime body" |
| §4 | No-Plant & Suspension | "Suspension mechanics" / "No-plant family" |

The curator should pick names that read pedagogically to readers, not just structurally to AI.

### 5.3 What "By Topology" becomes

Two options:

**A. Retire entirely.** All 6 current panels relocate:
- paradox → §2 section in Movement System view
- symposium → §4
- ducking, spinning → §3
- pixie → §1
- whirl → already in Family view (via Slice I invariant); panel content redistributes

**B. Keep "By Topology" as an observational view for movement neighborhoods that don't fit any single axis.** Renamed to "Movement Neighborhoods" or "Observational Topologies". Smaller scope — only cross-axis patterns (e.g., "midtime body cluster" containing spinning + ducking + diving etc. as a cohort).

I lean A (retire). The "movement neighborhood" concept is intriguing but currently embryonic; building a separate surface for it now risks the over-engineering the user wants to avoid.

## 6. Migration strategy

### 6.1 Hard constraints

Per [[project_freestyle_post_slice_e_posture]] + [[freestyle-topology-governance]]:
- TypeScript content modules over SQL
- Reversible
- Observational ≠ canonical
- No new schema columns
- No new database tables

### 6.2 Required content

A single new content module: `src/content/freestyleMovementSystems.ts`:

```typescript
type MovementSystemAxis = 'set-uptime' | 'entry-cross-body' | 'midtime-body' | 'no-plant';

export interface MovementSystemEntry {
  axis: MovementSystemAxis;
  modifierSlug: string;       // links to freestyle_trick_modifier_links
  displayName: string;        // pedagogical label
  shortDescription: string;   // one-line characterization
  // No member lists — those are computed from modifier-link table at
  // render time (same source today's By Component uses).
}

export const MOVEMENT_SYSTEM_AXES: ReadonlyMap<MovementSystemAxis, AxisSpec> = ...;
export const MOVEMENT_SYSTEM_ENTRIES: readonly MovementSystemEntry[] = ...;
```

Curator-authored. ~30-50 lines. Lists which modifiers belong to which axis. NOT auto-derived.

### 6.3 Service-side change

The new view-builder reads modifier-link data (same data Component view uses today), then groups by axis (per the content module) rather than by modifier_type column. Each axis renders as a section; each modifier within an axis renders as a subsection.

No new DB query. No new schema column. No new pipeline.

### 6.4 Removing surfaces

`By Category` removal:
- Delete the `?view=category` branch from `tricks.hbs` and the `groups` shaping in `freestyleService.ts`
- Update view-toggle nav (remove "By category")
- Update tests that assert on category view

`By Component` retired in favor of new view:
- Same component shaping logic moves into the new movement-system view-builder
- Delete `?view=component` branch
- The new "Movement System" view replaces it

`By Topology` retired (Option A):
- Delete `?view=topology` branch
- The 6 connective panels relocate per the §5.3 map
- The observational badge can move to the new view if needed

## 7. Low-risk implementation sequence

Six small slices, each independently shippable, each reversible.

### Slice L1 — Content module (NEW content, no UI change)

- Create `src/content/freestyleMovementSystems.ts` with the 4-axis classification
- Curator confirms axis membership for each modifier slug
- Service-side shaping helper exposes the axis breakdown
- Tests pin axis membership
- **No UI change yet.** This slice gathers and locks down the content; the view-builder consumes it later.

### Slice L2 — Add "By Movement System" view alongside existing surfaces

- Add new `?view=movement-system` toggle option (or chosen name)
- Implement the view-builder reading the new content module + modifier-link data
- Render with the 4-section structure, using the same dictionary-trick-card partial
- View-toggle bar now has 6 entries: ADD / Family / Category / Component / Topology / Movement System
- **Old surfaces stay; new one is additive.** User can compare; nothing breaks.

### Slice L3 — Curator validation pass

- Operator action, not Claude action: manual visual QC of the new view
- Curator confirms axis groupings, naming, member memberships
- Possible content-module refinements (move modifiers between axes; adjust axis names)
- **No code; curator-only.**

### Slice L4 — Retire "By Category"

- Remove the view-toggle entry + the view branch in `tricks.hbs`
- Remove the service-side `groups` shaping (or keep it as dead code, deleted in cleanup)
- Update affected tests
- View toggle now: ADD / Family / Component / Topology / Movement System (5 surfaces)

### Slice L5 — Retire "By Component"

- The Movement System view now carries the modifier-link grouping
- Remove `?view=component` branch + tests
- View toggle now: ADD / Family / Topology / Movement System (4 surfaces)

### Slice L6 — Retire "By Topology" (or reframe)

- Per the §5.3 decision (A: retire entirely, OR B: rename to "Movement Neighborhoods" with smaller scope)
- If A: remove the view-toggle entry + branch + connective-panel surface (the panels still live in glossary §9)
- If B: rename and reduce scope to genuinely cross-axis cohorts
- View toggle now (Option A): ADD / Family / Movement System (3 surfaces)

### Total scope

6 slices. Each small (~50-150 lines code + tests). Sequence is strictly reversible — any slice can be paused or reordered. The destination is a 3-surface dictionary with one structural axis (Family), one mechanical axis (Movement System), and one orthogonal scan (ADD).

## 8. Risks & constraints

### Risk 1 — Curator-decision avalanche

Axis-membership for 16 modifier slugs requires 16 curator decisions. The user already classified them implicitly in the prompt (axes 1-4 above), so this is light, but borderline cases (e.g., is `stepping` set-system or body-mechanic? — the curator put it in axis 1 here) need explicit pinning in the content module.

**Mitigation:** Slice L1 IS the curator-decision pass. Land it before any UI work.

### Risk 2 — Multi-axis tricks

A trick like `paradox-spinning-whirl` uses two modifiers (paradox in axis 2, spinning in axis 3). In Movement System view, it appears in BOTH axis subsections. This is correct pedagogically (multi-membership reflects the trick's actual mechanics) but might confuse users expecting single-axis classification.

**Mitigation:** explicit "duplication note" similar to the existing Component view note. "Tricks appear in every axis they participate in."

### Risk 3 — Empty axes

Axis 4 (No-Plant) has only 1-2 confirmed modifiers (symposium + maybe muted/flying). Rendering an empty "No-Plant" section reads as broken.

**Mitigation:** sections render only when their member count > 0, same as current Component view's "axes only when groups have content" rule.

### Risk 4 — Test churn

Each retired view triggers a wave of test updates. The 5 → 3 surface reduction touches several test files.

**Mitigation:** sequence migrations strictly (L4, L5, L6 separate slices), let CI catch breakage one wave at a time.

### Risk 5 — Manual QC pause is recommended FIRST

Per [[project_freestyle_post_slice_e_posture]]: "Manual QC / UX review (RECOMMENDED PAUSE) — operator action, not Claude action." Before any browse-architecture rewrite, the curator should browse the dictionary's current state and confirm the diagnosis matches reality.

**Mitigation:** treat this audit as Slice L0 (the audit IS the planning artifact). Implementation (L1+) waits for the QC pass.

### Risk 6 — Don't destabilize Slice H2 / I / J / K

The card rendering kernel, family invariants, rev-whirl sibling family, and the Slice K landing/glossary work are all stable. Any browse-architecture work must preserve those contracts.

**Mitigation:** every new slice's tests include "presentation-unification holds" + "family invariants render" + "rev-whirl family renders" as regression guards.

## 9. Restraint check

| Constraint | Status |
|---|---|
| Observational ≠ canonical | ✅ New content lives in TypeScript module; no DB column |
| No SQL migration | ✅ Service-side aggregation from existing modifier-link table |
| No new browse systems built yet | ✅ Audit only |
| No parser IDE views | ✅ Movement System is curator-authored axis labels, not parser output |
| No over-engineered topology maps | ✅ Three browse surfaces total; no maps |
| Don't destabilize card rendering | ✅ Same dictionary-trick-card partial throughout |
| Reversible | ✅ Every slice is content-module + view branch; trivially rolled back |
| Restraint over throughput | ✅ Sequence is 6 small slices, can pause at any point |
| Manual QC before implementation | ✅ Slice L0 is THIS audit; L1+ waits |

## 10. Decision points for curator

Before Slice L1 ships:

1. **Replacement view naming.** Recommend "By Movement System." Alternatives: "By Mechanics" / "By Movement Layer" / "By Modifier System."
2. **Axis names.** Recommend §1 Set / Uptime, §2 Entry & Cross-Body, §3 Midtime Body, §4 No-Plant & Suspension. Curator should pick reader-facing names.
3. **Topology disposition.** Option A (retire) vs Option B (rename to Movement Neighborhoods with smaller scope).
4. **`stepping` axis placement.** User put it in axis 1 (Set/Uptime). Confirm — it could arguably belong in axis 3 (Midtime Body) since stepping moves the plant foot, which is mid-trick. Curator decision.
5. **`x-dex / op / ss / near / far` axis 2 surfacing.** These are positional tokens, not modifier rows. Do they need their own subsection, or are they preserved as glossary-only material?
6. **Branch families (torque, blender, drifter, barfly).** Axis 6 in the user's ontology. Do these get a separate view or stay in By Family alongside their root terminals?
7. **When to start.** Manual QC pass first; THEN Slice L1. Curator green-light needed.

## 11. What this audit does NOT propose

- No new schema columns
- No new database tables
- No mass migration of `category` or `trick_family` column values
- No parser changes
- No SQL CHECK constraints
- No removal of any existing trick row
- No alterations to operational-notation rendering
- No changes to glossary content beyond what Slice K shipped
- No changes to family invariants (Slice I + J intact)
- No changes to the dictionary-trick-card partial (Slice H2 contract intact)

End. Awaiting curator decision on the 7 questions above before any of L1-L6 ships.

---

## 12. Curator decisions — locked (2026-05-16)

Six of the seven decision points returned with firm answers:

### Q1 — Replacement view name: **`By Movement System`** ✅

Curator rationale:
- educational
- embodied
- non-parser-y
- broad enough for future evolution
- understandable to non-experts

Rejected alternatives:
- "By Mechanics" — too technical
- "By Modifier System" — too narrow
- "By Movement Layer" — too abstract

### Q2 — Axis names: **3 confirmed, 1 simplified** ✅

| Axis | Locked name |
|---|---|
| 1 | `Set / Uptime Systems` |
| 2 | `Entry Topologies` ← simplified from "Entry & Cross-Body Topologies" |
| 3 | `Midtime Body Modifiers` |
| 4 | `No-Plant & Suspension` |

Curator note on Axis 2 simplification:
> "I would maybe simplify Entry & Cross-Body Topologies to Entry Topologies unless the cross-body distinction becomes pedagogically important later."

Cross-body framing parked for later evolution; not currently a separate axis dimension. The `x-dex` / `op` / `ss` / `near` / `far` positional vocabulary lives in glossary (per Q5 below), not as an axis subdivision.

### Q3 — Topology disposition: **Option B — rename to `Movement Neighborhoods`** ✅

Curator rationale:
> "you still want exploratory relationship browsing — 'things that feel related' — adjacent movement clusters. But not as a primary taxonomy surface. That's exactly the right compromise."

Implementation implication:
- `By Topology` view-toggle entry renames to `By Movement Neighborhoods` (or similar)
- Surface scope reduces — only genuinely cross-axis cohorts (e.g., "midtime body cluster" containing multiple axis-3 modifiers as a single observational neighborhood)
- The five modifier-anchored panels (paradox, symposium, ducking, spinning, pixie) relocate into Movement System view's axis sections per the §5.3 / §4.2 map
- The whirl panel content was already absorbed into By Family via Slice I invariants

### Q4 — `stepping` axis placement: **Axis 1 (Set / Uptime Systems)** ✅

Curator rationale:
> "Stepping behaves primarily as uptime/set discipline, launch mechanic, timing/setup system. Even if body mechanics emerge later, Set / Uptime Systems is the right home."

Locked. Future ontology evolution may revisit; current classification is curator-confirmed Axis 1.

### Q5 — Positional tokens (`x-dex`, `op`/`ss`, `near`/`far`): **glossary-level only for now** ✅

Curator rationale:
> "Keep x-dex, op/ss, near/far mostly glossary-level for now. Maybe a small supporting subsection later. But they do NOT yet feel like full browse anchors. Good restraint opportunity."

Implementation implication:
- The Movement System view does NOT introduce dedicated browse subsections for positional tokens
- Glossary §3 (Direction) + §7 (Notation) carry these as terminology
- Future small-supporting-subsection within Axis 2 (Entry Topologies) remains an open option, deferred

### Q6 — Branch families (torque, blender, drifter, barfly): **stay INSIDE By Family** ✅

Curator rationale (load-bearing):
> "Keep them inside By Family. Absolutely. Because the recent ontology breakthrough was: torque family IS ALSO osis lineage. That layered relationship is powerful. Do NOT split branch families into a separate browse surface yet. That would over-fragment the ontology. Instead: By Family becomes root terminal families PLUS productive compressed branch families. That's elegant."

This is a meaningful refinement of the Slice I + J framing. **By Family contains TWO kinds of family-anchor objects:**

- **Root terminal families** — whirl, butterfly, mirage, osis, swirl, legover, pickup, illusion, etc. (the 12 core atoms + canonical bases)
- **Productive compressed branch families** — torque (= miraging osis), blender (= whirling osis), drifter (= miraging clipper), barfly — named compounds that themselves anchor families of further descendants

Both render as family sections with their own shared-terminal-structure invariants (for terminals) or chain-derived structure (for branches). The layered relationship (e.g., torque IS a family AND IS osis-lineage) is surfaced via cross-link or visual hint, NOT by splitting them into a separate browse surface.

### Q7 — Sequencing: **(a) Manual QC pause FIRST** ✅

Final sequence confirmed:

1. **Manual QC pause / live review** (operator-only; curator-eye browse of the current dictionary state)
2. **Slice L1** — content module only (`freestyleMovementSystems.ts`); NO UI change
3. **Slice L2** — additive By Movement System view (existing surfaces still present)
4. **Curator visual QC pass** on the new view
5. **Only then:**
   - L4 retire By Category
   - L5 retire By Component
   - L6 reduce/rename By Topology → By Movement Neighborhoods

Curator rationale (load-bearing strategic-framing shift, recorded verbatim):

> The project is now at the stage where:
>
> - educational readability
> - embodied movement intuition
> - browse coherence
> - visual grouping rhythm
>
> matter more than theoretical taxonomy elegance.
>
> We are no longer debugging:
>
> - rendering
> - normalization
> - parser output
> - database structure
>
> We are tuning:
>
> - movement-language browsing
> - educational grouping
> - cognitive flow
> - compositional intuition
>
> That requires curator-eye review before additional browse surfaces land.
>
> Important: the current architecture is now subtle enough that unexpected
> visual/educational effects matter more than raw ontology purity. We are
> optimizing for movement-language coherence, not maximal structural
> abstraction.

This framing extends the post-Slice-E strategic posture (per
[[project_freestyle_post_slice_e_posture]]). For Slice L work specifically:

- Implementation throughput is NOT the metric.
- "Unexpected visual/educational effects" is the primary risk class.
- Curator-eye review is a real gate, not a formality.
- Restraint applies even more sharply here than in earlier slices.

### Pre-L1 gate: manual QC pass

The manual QC pause is gated on the curator browsing the live dictionary
surfaces (`/freestyle/tricks`, `/freestyle/tricks?view=family`,
`/freestyle/tricks?view=category`, `/freestyle/tricks?view=component`,
`/freestyle/tricks?view=topology`, `/freestyle/glossary`) and confirming
that the diagnosis in this audit matches what they see. No Claude action
during this phase.

When the QC pass is complete, the curator green-lights Slice L1
implementation. Until then, the audit stands as planning artifact only.

---

## 13. Locked architecture (post-decisions)

Final target shape based on 6 confirmed decisions:

```
Dictionary browse surfaces:
├── By ADD                        (unchanged; difficulty scan)
├── By Family                     (root terminal families + productive branch families)
├── By Movement System            (NEW)
│    ├── §1. Set / Uptime Systems       (pixie, fairy, atomic, quantum, nuclear, barraging,
│    │                                   furious, blurry, stepping)
│    ├── §2. Entry Topologies           (paradox primary; positional tokens deferred)
│    ├── §3. Midtime Body Modifiers     (spinning, ducking, diving, weaving, zulu, inspinning,
│    │                                   gyro, tapping, whirling)
│    └── §4. No-Plant & Suspension      (symposium, symple, muted, flying)
└── By Movement Neighborhoods     (renamed-and-reduced from By Topology;
                                   observational cross-axis cohorts only)
```

4 browse surfaces (not 3 as the original audit recommended; the rename-and-reduce of Topology preserves the observational neighborhoods surface).

### What By Family looks like post-Q6 refinement

```
By Family
├── Whirl family               (Slice I invariant: leggy in dex > ss clipper)
├── Rev Whirl family           (Slice J invariant: front whirl > op clipper [XBD])
├── Butterfly family           (future invariant: hippy out dex > ss clipper)
├── Mirage family              (future invariant: hippy in dex > op toe)
├── Osis family                (future invariant: spin > ss clipper)
├── Swirl family               (future invariant: leggy xbd out dex > ss clipper)
├── ─── Branch families ───
├── Torque family              (also osis-lineage; cross-link surfaces the lineage)
├── Blender family             (also osis-lineage)
├── Drifter family             (also miraging-clipper-lineage)
└── Barfly family              (also a branch family)
```

Branch families are pedagogically secondary; their cross-link or visual hint surfaces the deeper lineage relationship (per Q6). Slice I/J invariant infrastructure handles both terminal and branch families uniformly.

### What L4/L5/L6 collapse to

| Slice | Action |
|---|---|
| L4 | Retire `By Category` |
| L5 | Retire `By Component` (content reorganized into By Movement System) |
| L6 | Rename `By Topology` → `By Movement Neighborhoods`; reduce scope to cross-axis cohorts only |

End-state: 4 surfaces (ADD / Family / Movement System / Movement Neighborhoods) — not 3.

End of decisions log.

