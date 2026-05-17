# Rev-Whirl Sibling-Family Ontology — Audit + Proposal (2026-05-16)

## Status

Audit + proposal only. No code or data changes this turn. Follows directly on `FAMILY_LEVEL_INVARIANTS.md` (Slice I, just shipped). The curator's observation: the new family-invariant pilot has surfaced a genuinely-different conserved terminal mechanic hiding inside the Whirl family — strong enough evidence to promote reverse/front-whirl into a sibling terminal family.

## The discovery

The Whirl family invariant `leggy in dex > ss clipper` (Slice I) is structurally meaningful. It teaches what every whirl-family member should share at their terminal phase.

But operational-notation evidence shows several currently-Whirl-family rows DO NOT preserve that invariant. They use a different rotational dex variant (FRONT WHIRL) and land on the OPPOSITE clipper with cross-body marker (OP CLIP [XBD] [DEL]). They share a different conserved mechanic.

That's not "loosely related." That's a sibling family.

## Mechanical evidence from `freestyle_tricks.operational_notation`

Whirl family today (17 active members), classified by terminal mechanic:

| Cohort A: Preserves whirl invariant (`leggy in dex > ss clipper`) | Cohort B: Uses FRONT WHIRL dex with OP CLIP catch | Cohort C: No op-notation data | Cohort D: Hybrid (chain says A, op-notation says B) |
|---|---|---|---|
| whirl (base) | hatchet (4 ADD): `CLIP >> DIVE [BOD] > SAME FRONT WHIRL [DEX] > OP CLIP [XBD] [DEL]` | rev-whirl (3 ADD, dex) | surreal (6 ADD): chain `surging paradox whirl`; op-notation `… SAME IN [DEX] >> OP FRONT WHIRL [DEX] [PDX] > OP CLIP [XBD] [DEL]` |
| paradox-whirl | mullet (6 ADD): `CLIP >> DUCK [BOD] >> ... SAME FRONT WHIRL [DEX] [PDX] [BOD] > OP CLIP [XBD] [DEL]` | rev-up (3 ADD, dex) | montage (7 ADD): chain `spinning ducking paradox symposium whirl`; op-notation `… OP FRONT WHIRL [DEX] [PDX] [BOD] > OP CLIP [XBD] [DEL]` |
| spinning-whirl | | tomahawk (5 ADD) | |
| ducking-whirl | | | |
| symposium-whirl | | | |
| stepping-whirl | | | |
| tapping-whirl | | | |
| blurry-whirl | | | |
| paradox-symposium-whirl | | | |
| spinning-symposium-whirl | | | |

Two distinct conserved mechanics within the same `trick_family='whirl'` column:

- **Cohort A** (10 members): inward-direction leggy dex → same-side clipper. THE whirl invariant.
- **Cohort B** (2 mechanics-confirmed members): front-direction whirl dex → opposite clipper with XBD. A DIFFERENT terminal mechanic.

Cohort C (3 rows: rev-whirl, rev-up, tomahawk) carries no op-notation today; classification depends on curator interpretation. Cohort D is the genuinely hybrid case.

## Proposed ontology

**Three observational structural cohorts within the broader Whirl-named space:**

### 1. Whirl terminal family (preserved)

Invariant: `leggy in dex > ss clipper`

Members (Cohort A above): whirl (base), paradox-whirl, spinning-whirl, ducking-whirl, symposium-whirl, stepping-whirl, tapping-whirl, blurry-whirl, paradox-symposium-whirl, spinning-symposium-whirl.

This is the Whirl family as Slice I framed it. Unchanged.

### 2. Rev-Whirl sibling terminal family (NEW)

Anchor: `rev-whirl` (existing canonical slug; already registered as a BASE_ANCHOR in `semanticNotationRendering.ts`).

Proposed invariant: `front whirl > op clipper [XBD]`

Members (Cohort B + likely Cohort C):
- rev-whirl (base, 3 ADD) — the canonical anchor
- rev-up (3 ADD) — direction-variant folk name; curator-confirm placement
- hatchet (4 ADD) — mechanics-confirmed (FRONT WHIRL dex + OP CLIP XBD catch)
- mullet (6 ADD) — mechanics-confirmed
- tomahawk (5 ADD) — curator-confirm placement (no op-notation; folk name with ducking involvement per glossary memory)

### 3. Hybrid compounds (surreal, montage)

These rows have CURATOR-AUTHORED chain readings placing them in compositional whirl-family lineage (`surging paradox whirl`, `spinning ducking paradox symposium whirl`) BUT their operational-notation execution uses FRONT WHIRL dex with OP CLIP XBD catch — the rev-whirl-family terminal mechanic.

**Recommendation:** stay in the Whirl family `trick_family='whirl'` by their chain identity. Their FRONT WHIRL execution can surface on their trick-detail page as an "executed via" note. Do NOT force a single-family commitment.

Conceptually: a deeply-modified whirl-family compound CAN execute through a sibling family's mechanic at deep ADD-levels. Compositionally still whirl-family; mechanically borrows from rev-whirl. The dual identity is real, not a classification mistake.

## Naming recommendation

Family slug: **`rev-whirl`** (existing canonical; matches the BASE_ANCHOR registry; aligns with the existing direction-variant pair drifter/reverse-drifter pattern per [[project_freestyle_state]]).

Family display: **"Rev Whirl family"** (matches existing `canonical_name='rev whirl'` casing).

Invariant text (proposed): **`front whirl > op clipper [XBD]`** — uses the op-notation token vocabulary already registered.

Alternatives the curator should consider:

| Name | Strength | Weakness |
|---|---|---|
| `rev-whirl` (recommended) | matches existing canonical row; clean | "rev" is shorthand; some readers prefer full word |
| `reverse-whirl` | spelled out; pedagogically clearer | doesn't match existing slug |
| `front-whirl` | matches the op-notation token | requires renaming the existing rev-whirl row |
| `whip` (folk umbrella) | community-familiar | overlaps with `bullwhip` slug; confusing |

Curator decision on naming should consider that `bullwhip` already exists as its own `trick_family='bullwhip'` row (Red consultation territory per [[project_red_consultation_state]]). "Whip" as a family name would muddy that.

## Why this matches the post-Slice-E posture

The Slice I family-invariant work exposed the inconsistency. The proposed sibling family is a TRUE TERMINAL FAMILY by the same definition: it has a conserved ending mechanic shared by every member. Same governance as Slice I: observational, curator-authored, reversible.

The curator's earlier distinction (terminal families vs entry/topology/modifier systems) holds:
- Rev-Whirl = terminal family (conserved ending: front-whirl dex → op clipper XBD)
- NOT a topology / modifier / entry system

So the right home for `rev-whirl` is alongside whirl, butterfly, mirage, osis, swirl as a peer terminal family — not as a modifier or topology system.

## Migration strategy (proposed; not implementing)

**Restraint-first.** Use reversible TypeScript content modules. NO `trick_family` column UPDATEs in the database. NO schema changes.

### New content module: `src/content/freestyleFamilyOverrides.ts`

```typescript
// Curator-authored re-mapping of trick_family for specific slugs. Service-
// side override at family-group build time. Reversible: delete the entry,
// the row reverts to its DB trick_family column value.

export const FAMILY_OVERRIDES: ReadonlyMap<string, string> = new Map([
  // Mechanics-confirmed rev-whirl-family members.
  ['hatchet',    'rev-whirl'],
  ['mullet',     'rev-whirl'],
  // Direction-variant siblings — canonical rev-whirl is the family base.
  // (Curator decision required for rev-up: stays whirl-family OR moves
  // to rev-whirl-family? Folk name; ADD=3; no op-notation.)
  // (Curator decision required for tomahawk: needs structural confirmation.)
]);

export function resolveFamilyOverride(slug: string): string | null {
  return FAMILY_OVERRIDES.get(slug) ?? null;
}
```

### Service-side hook in `buildFamilyGroup`

Change the family-group iteration in `freestyleService.ts` to use the override when present:

```typescript
const familyOf = (row: ...) => resolveFamilyOverride(row.slug) ?? row.trick_family;
// Use familyOf(row) in place of row.trick_family in the family bucketing loop.
```

### Add Rev-Whirl entry to `FAMILY_INVARIANTS`

```typescript
['rev-whirl', 'front whirl > op clipper [XBD]'],
```

The Rev-Whirl family section then renders with its own invariant line, parallel to the Whirl family.

### Cross-link affordance (optional, Slice K)

A "See related: Rev Whirl family →" link from the Whirl family section, and vice versa. Preserves discoverability for users navigating between sibling families.

## Hybrid compound handling

surreal and montage stay in `trick_family='whirl'` per their chain identity. NO override entries.

Their FRONT WHIRL execution can surface on the trick detail page as a small "Executed via" note pointing at the rev-whirl family's invariant. Detail-page work; not part of this slice.

This is the ONLY case where dual-identity is acceptable. The rule: chain-authored compositional reading wins for primary family membership; mechanical-execution sibling family is a secondary contextual link.

## Risk analysis

### Risk 1 — Curator-decision avalanche

Three rows (rev-up, tomahawk, plus the hybrid handling for surreal/montage) need explicit curator decisions before promotion. Without those decisions, the migration is incomplete.

**Mitigation:** ship the migration in two stages.
- Stage A: rev-whirl invariant + override for hatchet, mullet only (mechanics-confirmed). Surreal/montage stay whirl-family. rev-up/tomahawk stay whirl-family pending curator decision.
- Stage B: curator extends the override after reviewing rev-up, tomahawk, hybrid compounds.

### Risk 2 — Discoverability loss

Players who search for "hatchet" expecting to find it in the Whirl family won't. They'll land in Rev-Whirl family instead.

**Mitigation:** the trick detail page is unaffected. `/freestyle/tricks/hatchet` still loads. The family-anchor lookup on the detail page reflects the override. Search-by-slug never relies on family membership. The cross-link affordance (Slice K future) bridges the two family sections explicitly.

### Risk 3 — Family-view section ordering disruption

Today Whirl family has 17 members. After Stage A migration, Whirl family has 15 members; Rev-Whirl family appears with 3 members (rev-whirl + hatchet + mullet). The `length > 1` heuristic admits the new section.

**Mitigation:** none needed — the new section is its own contained surface. Whirl family stays prominent.

### Risk 4 — Override module growth

Each additional family promotion adds entries. Maintaining a flat slug-to-family map scales linearly; if it grows past ~50 entries it should probably move to SQL.

**Mitigation:** Slice scoped to 2 entries (hatchet, mullet). Curator-deferred entries are explicitly NOT added without decision. If the module grows beyond ~10 entries, revisit the storage location per [[feedback_reversible_content_governance]].

### Risk 5 — Tomahawk classification ambiguity

Tomahawk has trick_family='whirl', no op-notation, no chain. Per glossary memory it's associated with ducking. Could be:
- Whirl-family ducking compound (Cohort A)
- Rev-whirl-family front-whirl ducking variant (Cohort B)
- Something else entirely

**Mitigation:** leave in whirl-family for now. Add a `curatorConfirmPending: true` flag in a future override-module entry if the curator decides to promote. Visible as a curator-flagged row.

### Risk 6 — Over-engineering "front-whirl"

The op-notation token `FRONT WHIRL [DEX]` is well-defined as a rotational dex variant. Promoting it to a family ANCHOR adds a small naming-layer overhead. Restraint says: don't extend to a "Back Whirl family" or "Swirl-direction-variant family" without strong evidence.

**Mitigation:** the slice is scoped to rev-whirl only. Future siblings (back-whirl, rev-swirl) wait for explicit data signals like the one this audit surfaced.

## Tradeoffs vs. doing nothing

**Doing nothing:** the Slice I Whirl invariant `leggy in dex > ss clipper` doesn't hold for hatchet, mullet (and silently lies for the hybrid compounds and direction-variants).

**Doing this:** the invariant tells the truth on the rows where it applies. A new sibling invariant tells the truth on the rev-whirl rows. Hybrid compounds are explicitly flagged as dual-identity rather than silently miscategorized.

**Cost:** one content module addition, one service-line tweak, two invariant entries. ~25-40 lines of code + tests.

## Restraint check

Per [[freestyle-topology-governance]] skill + [[project_freestyle_post_slice_e_posture]] strategic posture:

- **Observational only.** No SQL migration, no schema column. The override map is reversible TypeScript content.
- **Curator-authored.** No auto-derivation from op-notation patterns. The proposal IDENTIFIES candidates by reading op-notation, but the curator decides who moves.
- **Restricted slug list.** Stage A is hatchet + mullet only — mechanics-confirmed. Other rows wait for curator decision.
- **Hybrid compounds preserved.** Surreal and montage stay in whirl-family. Dual-identity is a feature, not a bug to mask.
- **No new ontology hardening.** "Terminal family" remains an observational distinction. Adding a second instance (rev-whirl) doesn't elevate it to canonical taxonomy.
- **Compatible with future Red Wave-2 answers.** If the curator or Red rules differently on direction variants, the override map updates trivially.

## Minimal implementation slice (Slice J — NOT this turn)

If approved:

| Step | File | Effort |
|---|---|---|
| 1. Override module | `src/content/freestyleFamilyOverrides.ts` (NEW) | ~25 lines |
| 2. Service hook | `src/services/freestyleService.ts` — `familyOf` helper in `buildFamilyGroup` | ~5 lines |
| 3. Rev-Whirl invariant | `src/content/freestyleFamilyInvariants.ts` | +1 entry |
| 4. Tests | `tests/integration/freestyle.rev-whirl-family.routes.test.ts` (NEW) | ~6 tests |

Slice J does NOT touch:
- The `trick_family` column in the DB
- The trick detail page (cross-link from hybrids comes later)
- Card rendering (Slice H2 contract intact)
- Glossary content

## Decision points for curator

Before implementation:

1. **Family slug.** `rev-whirl` (recommended) vs alternatives.
2. **Invariant text.** `front whirl > op clipper [XBD]` vs cleaner phrasing.
3. **Stage A scope.** Hatchet + mullet only (recommended) vs include rev-up vs include tomahawk.
4. **Hybrid handling.** Surreal/montage stay whirl-family (recommended) vs other.
5. **rev-up disposition.** Move to rev-whirl OR keep as whirl OR mark pending.
6. **tomahawk disposition.** Same options.
7. **Cross-link UI.** Add "See related: Rev Whirl family →" affordance in Slice J or defer.

End. Awaiting curator decision before implementation.
