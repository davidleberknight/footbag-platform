# Slice M — Pre-Red Stabilization Plan (2026-05-16)

## Status

Planning only. Implementation pending curator approval of this proposal.

## Framing

The dictionary system is now close to a genuinely stable pre-Red checkpoint after Slices A-L2. The remaining visible issues are **ontology consistency cleanup and symbolic reinforcement** — *not* architectural reinvention.

Per the curator's directive, this slice MUST NOT:
- reopen glossary architecture
- expand Batch 5 visual systems
- build topology graphs
- add parser-heavy UI
- massively expand Movement Neighborhoods
- harden unresolved doctrine
- auto-classify rows from operational notation

This slice CAN do:
- additive branch-family dual-membership
- lightweight symbolic reinforcement on the Movement System view
- a small visual differentiator for unresolved/folk-derived compounds
- retire one family surface (Clipper-Stall) without orphaning rows
- clean up one piece of stale prose

---

## 1. Impact analysis — retiring the Clipper-Stall family

### Current state (from DB, 2026-05-16)

`trick_family='clipper-stall'` contains 6 rows:

| Slug | ADD | Op-notation | Modifier links | Risk if family retired |
|---|---|---|---|---|
| `clipper-stall` | 2 | `[set] > clipper` | — | Anchor only. Primitive surface trick. |
| `drifter` | 3 | `CLIP >> OP IN [DEX] > SAME CLIP [XBD] [DEL]` | — | Already anchor of `trick_family='drifter'` branch family with 4 rows. Promote via dual-membership (see §2). |
| `ducking-clipper` | 3 | (none) | ducking | Discoverable via Movement System → Midtime Body → ducking. |
| `reaper` | 3 | `CLIP >> SAME OUT [DEX] >> SAME OUT [DEX] > SAME TOE [DEL]` | — | Folk-derived; no modifier links; would lose its only family home. |
| `spinning-clipper` | 3 | (none) | spinning | Discoverable via Movement System → Midtime Body → spinning. |
| `high-plains-drifter` | 4 | (none) | — | Hard-coded folk derivative of drifter. Re-bucket via override to `drifter` family. |

### Decision points

1. **`clipper-stall` row** — primitive surface. Already classified `kind='trick'` per `freestyleTrickKindOverrides.ts`. Family view filter is `if (rows.length > 1)` — so if `clipper-stall` ends up alone in a bucket, it disappears from Family view but stays in ADD view, Alphabetical, etc. Safe.
2. **`drifter` row** — promote to `drifter` family via dual-membership (also retain clipper-stall lineage on the trick detail page if appropriate). Net effect: `drifter` becomes the anchor of `drifter-family` (5 rows: drifter + paradox-drifter + smoke + tombstone + vortex). High-plains-drifter joins via additional override.
3. **`ducking-clipper` / `spinning-clipper`** — discoverable via Movement System → Midtime Body, ADD view, modifier reference table. Family view loses them. Acceptable tradeoff: they aren't a "family" — they're modifier applications. Their kinship surfaces under the modifier axis instead.
4. **`reaper`** — the orphan risk. Folk-derived, no modifier links, no other obvious family. Two options:
   - **(a) Orphaned in Family View** — visible in ADD view + Alphabetical + Search but not in any family bucket. Acceptable per curator's "unresolved/folk-derived" framing.
   - **(b) Tagged as unresolved compound** — surfaces with the new `pending decomposition refinement` pill (see §4); still orphaned in Family View.
5. **`high-plains-drifter`** — re-bucket via override to `drifter` family alongside drifter promotion.

### Side-effects audit

- `src/services/freestyleService.ts:2326-2329` — `FAMILY_TEXTS['clipper']` prose currently reads "Stall-based compounds (ducking clipper, spinning clipper, drifter) live under the clipper-stall family per the 2026-05-08 clipper migration." This sentence becomes false and must be updated (or excised).
- No glossary text references "clipper-stall family" as a browse surface.
- No test asserts that clipper-stall family renders (verified via grep).
- Family-view's `rows.length > 1` filter already protects against zero-content sections.
- The `clipper` family (note: distinct from `clipper-stall`) has 2 rows — also borderline, but out of scope here.

### Recommendation

**Retire `clipper-stall` from the Family View surface.** Mechanism: add to a `RETIRED_FAMILIES` set in `freestyleFamilyOverrides.ts`. The Family-View bucketing loop checks this set and skips matching families.

The `clipper-stall` row stays in the DB with `trick_family='clipper-stall'`. All consumers other than the Family View browse surface remain unchanged.

---

## 2. Branch-family dual-membership — implementation plan

### Concept

A branch-family anchor (e.g., `torque`, `blender`, `drifter`) currently lives in its lineage family in the DB. The newer ontology requires it to *also* appear as the anchor of its own branch family — without removing it from the lineage.

This is **additive dual-membership**, not a re-bucketing. Different from Slice J's `FAMILY_OVERRIDES` (which is a one-way redirect).

### Required dual-membership rules (curator-confirmed)

| Slug | DB `trick_family` | Branch family to also appear in |
|---|---|---|
| `torque` | `osis` | `torque` |
| `blender` | `osis` | `blender` |
| `drifter` | `clipper-stall` (retired — falls through to `drifter`) | `drifter` |

After this slice, the Family View shows:
- **Osis family** still includes torque + blender (lineage preserved) — but no longer renders the `Stall-based compounds` part of the prose
- **Torque family** now begins with `torque` (= miraging osis) as anchor + 8 existing rows
- **Blender family** now begins with `blender` (= whirling osis) as anchor + 4 existing rows
- **Drifter family** now begins with `drifter` (= miraging clipper) as anchor + 4 existing rows + (optional) `high-plains-drifter` via re-bucket
- **Clipper-Stall family** no longer renders (retired per §1)

### Mechanism

1. New content map in `freestyleFamilyOverrides.ts`:
   ```typescript
   export const FAMILY_DUAL_MEMBERSHIPS: ReadonlyMap<string, readonly string[]> = new Map([
     ['torque',  ['torque']],
     ['blender', ['blender']],
     ['drifter', ['drifter']],
   ]);
   ```

2. New helper:
   ```typescript
   export function resolveFamilyDualMemberships(slug: string): readonly string[] {
     return FAMILY_DUAL_MEMBERSHIPS.get(slug) ?? [];
   }
   ```

3. Service-layer change (`freestyleService.ts`, family-view bucketing loop ~lines 3875–3882):
   ```typescript
   for (const row of activeRows) {
     if (!isTrickRow(row)) continue;
     const primaryFamily = familyOf(row);
     const families: string[] = [];
     if (primaryFamily && !isRetiredFamily(primaryFamily)) families.push(primaryFamily);
     for (const extra of resolveFamilyDualMemberships(row.slug)) {
       if (!families.includes(extra)) families.push(extra);
     }
     for (const fslug of families) {
       const bucket = familyMap.get(fslug) ?? [];
       bucket.push(row);
       familyMap.set(fslug, bucket);
     }
   }
   ```

4. Add `'drifter'` to `FAMILY_ORDER` so it sits near `'clipper'` in the canonical sequence. Suggested:
   ```typescript
   const FAMILY_ORDER = ['whirl', 'rev-whirl', 'butterfly', 'osis', 'torque', 'blender', 'mirage', 'clipper', 'drifter', 'legover'];
   ```
   (moved torque/blender up next to osis to surface the lineage relationship visually)

### What this preserves

- Slice J's `FAMILY_OVERRIDES` (rev-whirl, hatchet, mullet) remains a one-way redirect (those rows DO leave the whirl family). Untouched.
- Slice I's `FAMILY_INVARIANTS` (whirl, rev-whirl) remains the single source for shared-terminal-structure prose. No new invariants added here — torque/blender/drifter family invariants are curator-deferred and the field falls back to `null`.
- Operational notation, symbolic equivalences, cards, anchors — all unchanged.

### What this does not do

- Does not add invariants for torque/blender/drifter families (those are pending Red Wave 2 grammar rulings on operator-vs-trick boundary).
- Does not promote any other branch family — strictly the three named by the curator.
- Does not change DB `trick_family` columns.

---

## 3. Paradox symbolic reinforcement — proposal

### Goal

Paradox should display its conserved entry-topology structure on the Movement System view so it reads as **an entry topology / compositional modifier system**, NOT a terminal family.

### Mechanism

Add an optional `educationalGloss` field to `MovementSystemAxis` (or per-modifier — see decision below) in `freestyleMovementSystems.ts`. Service shapes it onto each `MovementSystemGroup` as `compositionGloss: string | null`. Template renders it above the card stack, below the modifier-name heading.

### Curator-authored gloss content (pilot — paradox only)

```typescript
export const MODIFIER_COMPOSITION_GLOSSES: ReadonlyMap<string, string> = new Map([
  ['paradox', 'PDX + base — the body crosses sides without changing the set foot. Reads as an entry topology, not a terminal family. Compounds: PDX + WHIRL, PDX + TORQUE, PDX + BLENDER.'],
]);
```

Other modifiers (pixie, atomic, spinning, ducking, symposium, …) — left unauthored in this slice; their groups render without a gloss until curator drafts one. The field is `string | null`; the template suppresses an empty row.

### Decision: per-modifier vs. per-axis?

**Per-modifier** is the right granularity. Rationale:
- Modifiers within an axis differ in structural role (e.g., pixie ≠ atomic).
- A per-axis gloss would compress to the axis definition, which already lives on `MovementSystemAxis.axisDefinition`.
- Per-modifier glosses give the curator room to expand without restructuring.

### Visual restraint

- Single italic line under the modifier-name heading, before `bodyDefinition`.
- No notation tokens, no parser blocks, no clickable references.
- Style mirrors `.movement-axis-definition`.

---

## 4. Unresolved / folk-compound handling — proposal

### Pilot set (curator-flagged)

```typescript
export const UNRESOLVED_COMPOUNDS: ReadonlySet<string> = new Set([
  'rev-up',       // folk name; no op-notation; canonical direction-variant status unconfirmed
  'tomahawk',     // folk name; no op-notation; structural decomposition uncertain
  'reaper',       // folk-derived; mechanically unclear; orphan after clipper-stall retirement
  'surreal',      // hybrid: chain reads 'surging paradox whirl' but op-notation uses front whirl dex
  'montage',      // same hybrid pattern as surreal
  'witchdoctor',  // folk name; curator-flagged
  'fury',         // folk name; curator-flagged
  'surgery',      // mechanically resembles rev-whirl/hatchet but no curator confirmation
]);
```

`witchdoctor` and `fury` aren't currently in the DB (verified) — they're future-proofed entries. The set is forward-compatible; rows added later automatically pick up the pill.

### Mechanism

1. New content module `src/content/freestyleUnresolvedCompounds.ts` (~30 lines).
2. New helper `isUnresolvedCompound(slug: string): boolean`.
3. Add `pendingDecomposition: boolean` field to `DictionaryTrickCard` (per-card flag).
4. Service shaping (`shapeDictionaryTrickCard`) reads the helper and sets the flag.
5. Template renders a small italic pill inside the card metadata row, only when `pendingDecomposition === true`.

### Visual treatment (restraint-first)

- Small italic label: `pending decomposition refinement`
- Muted color (matches `--text-subtle`).
- Renders inline with `addsLabel` chip; does NOT take a card-wide row.
- No tooltip, no interaction, no link to anywhere.

### What this does NOT do

- Does not classify rows by uncertainty level.
- Does not auto-derive from missing `operational_notation` or other heuristics — strictly curator-authored allow-list.
- Does not create a separate "Unresolved" browse view, axis, or section.
- Does not orphan rows; they remain in all browse views.

---

## 5. Smallest coherent stabilization slice — Slice M scope

### In scope

| # | Change | Layer |
|---|---|---|
| 1 | Branch-family dual-membership (`torque`, `blender`, `drifter`) | content + service |
| 2 | Clipper-Stall family retirement from Family View | content + service |
| 3 | `high-plains-drifter` re-bucket to `drifter` family (via dual-membership or one-way override — TBD in implementation) | content |
| 4 | `FAMILY_TEXTS['clipper']` prose cleanup (drop "clipper-stall family" reference) | service (one string) |
| 5 | `MODIFIER_COMPOSITION_GLOSSES` content module — paradox gloss only | content |
| 6 | `MovementSystemGroup.compositionGloss` field + service shaping + template render | service + template + CSS |
| 7 | `UNRESOLVED_COMPOUNDS` content module + `pendingDecomposition` card field + pill render | content + service + template + CSS |
| 8 | `FAMILY_ORDER` reorder: torque + blender after osis; drifter near clipper | service (one array literal) |
| 9 | Tests (unit + integration) | tests |

### Out of scope (deferred)

| Item | Reason for deferral |
|---|---|
| Educational symbolic notation hierarchy cleanup | Per curator: "default browse readability should prefer normalized symbolic notation." This is a data-debt audit — many trick rows have `operational_notation` but lack `symbolicEquivalences` chain readings. Slogging the curator content for each row is its own arc. Slice N candidate. |
| New family invariants for torque/blender/drifter | Pending Red Wave 2 operator-vs-trick boundary rulings. |
| Symbolic reinforcement glosses for non-paradox modifiers | Pilot is paradox-only per the curator prompt. Other modifiers as curator authors content. |
| Trick-detail page lineage cross-link for `drifter` (clipper-stall lineage breadcrumb) | Detail-page surface separate from browse surface; tackle when curator audits trick detail surfaces. |
| New entries to `freestyleFamilyInvariants.ts` | Pending Red Wave 2. |
| Topology graphs, neighborhood expansion, glossary architecture | Explicitly out-of-scope per curator. |

### Files touched (estimated)

| File | Lines |
|---|---|
| `src/content/freestyleFamilyOverrides.ts` | +25 |
| `src/content/freestyleUnresolvedCompounds.ts` (NEW) | +30 |
| `src/content/freestyleMovementSystems.ts` | +15 |
| `src/services/freestyleService.ts` | +35 |
| `src/views/freestyle/tricks.hbs` | +6 |
| `src/views/freestyle/dictionary-trick-card.hbs` | +4 |
| `src/public/css/style.css` | +20 |
| `tests/unit/freestyleFamilyOverrides.test.ts` (NEW) | +40 |
| `tests/unit/freestyleUnresolvedCompounds.test.ts` (NEW) | +30 |
| `tests/integration/freestyle.routes.test.ts` (existing — extend) | +50 |
| `tests/integration/freestyle.movement-system-view.routes.test.ts` (extend) | +20 |
| **Total** | **~275 lines** |

### Two-phase option

If the curator prefers fragmenting, the slice splits cleanly:

**Phase M-A — ontology corrections (mechanical, low-risk)**:
- Items 1, 2, 3, 4, 8 (branch dual-membership + clipper-stall retirement + prose cleanup + family order)
- ~150 lines including tests
- Reversible by deleting `FAMILY_DUAL_MEMBERSHIPS` / `RETIRED_FAMILIES` entries

**Phase M-B — symbolic + unresolved UI (lightweight UI)**:
- Items 5, 6, 7 (paradox gloss + composition gloss field + unresolved pill)
- ~125 lines including tests
- Touches template + CSS; visual QC pass recommended

**Recommendation**: ship as one slice. The two phases share content/service surface area; fragmenting buys nothing because no part is risky.

---

## 6. Risks + tradeoffs

| Risk | Severity | Mitigation |
|---|---|---|
| Retiring clipper-stall family orphans `reaper` from Family View | LOW | Curator-acknowledged in directive. Reaper is folk-derived; not a coherent family. Stays in ADD/Alpha/Search; gains the unresolved pill. |
| Drifter dual-membership creates redundancy: drifter shows in clipper-lineage breadcrumb + drifter-family + Movement System? | LOW | Lineage breadcrumb is detail-page only (not browse). Browse surfaces show drifter only in Drifter family after clipper-stall retirement. No redundancy. |
| Torque + blender now appear in TWO family groups (osis + own) — could confuse users into thinking they're duplicated | MEDIUM | This is the explicit curator directive. Dual-membership is the ontology fact. Cards are visually identical across views. The pattern is the same one as compounds appearing in multiple modifier groups in Component view (explicitly framed as "intentional duplication"). Adopt the same `duplicationNote` pattern in Family View if needed (deferred — not required for slice). |
| `MODIFIER_COMPOSITION_GLOSSES` could expand into a sprawling content pile | LOW | Pilot = paradox only. Adding entries is one curator decision per entry. No system mechanism encourages bulk-write. |
| Unresolved-pill becomes a dumping ground for "anything curator doesn't like" | MEDIUM | Pilot set is curator-authored (8 entries). Adding entries requires curator decision. Field is binary; no severity scale, no auto-classification. The forbidden-list in the directive ("DO NOT harden unresolved doctrine") is the governance brake. |
| FAMILY_ORDER reorder could re-shuffle stable visual position of osis/torque/blender — confusing users mid-pattern | LOW | Family-view section ordering is rarely user-anchored. The new order is more coherent (lineage adjacency). Document in commit message. |
| `clipper` (singular, 2-row family) might also warrant retirement under the same logic | OUT OF SCOPE | Not in curator directive. Defer to a future audit. |
| `FAMILY_TEXTS['clipper']` prose cleanup might miss other stale prose elsewhere | LOW | Single grep'd reference. Verified: no other surfaces reference "clipper-stall family" as a browse-surface. |

---

## 7. Recommended implementation sequence

1. Write all the content modules (`freestyleFamilyOverrides.ts` extensions, `freestyleUnresolvedCompounds.ts`, `freestyleMovementSystems.ts` glosses) — fully reversible.
2. Add unit tests for the content modules.
3. Wire service-layer family-view bucketing for dual-membership + retirement.
4. Wire `pendingDecomposition` + `compositionGloss` shaping into the card / movement-system view.
5. Update `FAMILY_ORDER`.
6. Update `FAMILY_TEXTS['clipper']` prose (delete the stale sentence).
7. Add template snippets (movement-system gloss row; card pill).
8. Add CSS for the two new visual elements.
9. Extend integration tests:
   - Family-view: torque-family / blender-family / drifter-family populate with their anchors; clipper-stall family absent.
   - Movement-system view: paradox group shows the composition gloss.
   - Dictionary-trick-card: unresolved-pill renders on `rev-up`/`tomahawk`/`reaper`/`surreal`/`montage`/`surgery`; absent on others.
10. `npm test` + `npm run build`.
11. Stage and hand off.

---

## 8. Preservation contract

This slice MUST preserve, intact:
- Slice A trick-kind discriminator
- Slice A2 / A3 family-chain normalization
- Slice B operator board
- Slice C glossary content
- Slice E token cross-links
- Slice H DOM order
- Slice H2 normalized card contract (`dictionary-trick-card` partial as single render surface)
- Slice I family invariants (whirl + rev-whirl entries)
- Slice J rev-whirl sibling family (one-way override unchanged)
- Slice K glossary cleanup
- Slice L-polish glossary polish
- Stabilization slice (Movement Neighborhoods rename, demoted toggle tier)
- Slice L1 + L2 Movement System content module + view
- Four-layer ontology rule (canonical / symbolic / pedagogical / embodied — never collapsed)
- Reversibility doctrine (no SQL migrations during ontology refinement)

If any change in this slice contradicts the above, it is wrong — not the preserved contract.

---

## 9. Paste-ready commit message (draft)

To be finalized after implementation; the draft below is the shape:

```
feat(freestyle): Slice M — pre-Red ontology stabilization (branch dual-membership, clipper-stall retirement, symbolic reinforcement, unresolved pill)

Closes the largest visible ontology inconsistencies before Red Wave 2.
Strictly additive content-module + service-shape edits; no SQL, no
schema, no parser changes, no glossary architecture, no new browse view.

Why now

  Slices A-L2 reached structural stability. The remaining visible
  issues are ontology coherence — branch-family anchors missing from
  their own branches, one family surface (Clipper-Stall) that no
  longer functions as a coherent terminal family, and a few folk-
  derived rows that read awkwardly without a "this is unresolved"
  signal. This slice closes those four issues using the smallest
  reversible content + service edits possible.

Changes

  Branch-family dual-membership

    New FAMILY_DUAL_MEMBERSHIPS map in freestyleFamilyOverrides.ts.
    torque + blender + drifter each gain membership in their own
    branch family while preserving lineage in osis-family /
    clipper-stall-family (the latter retired in the same slice).
    Family-view bucketing loop walks both primary and dual-membership
    families per row.

    Net effect — three branch families now begin with their canonical
    anchor:
      Torque family:  torque + 8 existing rows
      Blender family: blender + 4 existing rows
      Drifter family: drifter + 4 existing rows + high-plains-drifter

  Clipper-Stall family retirement

    New RETIRED_FAMILIES set in freestyleFamilyOverrides.ts. The
    Family-view bucketing loop skips matching families. clipper-stall
    row itself stays in DB / ADD view / Alphabetical / Search; only
    the Family View surface drops the section. ducking-clipper +
    spinning-clipper discoverable via Movement System (Midtime Body
    axis). drifter promoted via dual-membership. reaper orphaned in
    Family View; gains the unresolved pill (below).

  Paradox symbolic reinforcement

    New MODIFIER_COMPOSITION_GLOSSES map in freestyleMovementSystems.
    Pilot entry: paradox. Movement System view renders the gloss as a
    single italic line above the trick cards in each modifier group.
    Other modifiers stay un-glossed pending curator authoring.

  Unresolved-compound pill

    New freestyleUnresolvedCompounds.ts content module. Curator-
    authored allow-list of 8 folk-derived / mechanically-unclear
    slugs. dictionary-trick-card renders a small italic
    "pending decomposition refinement" pill when the flag is set.
    No interaction, no link, no category — purely a visual hedge
    against false-certainty.

  Misc cleanup

    FAMILY_ORDER reshuffled to surface torque + blender adjacent to
    osis (lineage adjacency). drifter added near clipper.
    FAMILY_TEXTS['clipper'] prose drops the stale "clipper-stall
    family per the 2026-05-08 clipper migration" sentence.

Tests + build

  Full suite N/N passing. tsc clean.

Out of scope (deferred)

  - Default symbolic-notation hierarchy cleanup (data-debt slog;
    Slice N candidate)
  - New family invariants for torque/blender/drifter (Red Wave 2)
  - Non-paradox modifier composition glosses (per curator
    authoring)
  - Trick-detail lineage breadcrumb for drifter (detail-surface
    audit, separate)

Preserved

  Slice A-L2, Slice H2 card contract, Slice I+J family invariants,
  four-layer ontology rule, reversibility doctrine.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## End
