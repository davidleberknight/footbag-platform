# Compound Notation Strategy (NCR-2, brief E2 + E4)

Removes executable accounting from public landing card rendering;
establishes the headline / secondary / tertiary layering for compound
tricks across the public surfaces.

Supports `FINAL_RECOMMENDATION.md` NCR-2 + the E4 brief item. Bakes in
curator decision #3 locked 2026-05-18: prune via the shaping helper
(Path B), not cosmetically in the template.

---

## 1. Current state

### 1.1. Where accounting renders today (recon-confirmed)

Per recon §1, accounting prose appears in exactly two public surfaces:

| Surface | Mechanism | Source data |
|---|---|---|
| `/freestyle` landing Core Tricks grid | `core-tricks-grid.hbs:22-39` loops `semanticEquivalences[]` and renders each as `≡` line | `CORE_TRICK_SPEC.equivalences[1]` -- accounting formula per atom |
| `/freestyle/add-analysis` worked examples | `add-analysis.hbs:57-68` renders `derivation` field inside `<code>` element | `FREESTYLE_ADD_ANALYSIS_CONTENT` derivation strings |

Dictionary cards (`?view=*` browse views, trick-detail pages) carry
NO accounting prose post-CR-5.

### 1.2. Service shaping helper for the Core Tricks grid

`shapeCoreTrickCard()` in `freestyleService.ts:602`. Currently
returns:

```typescript
{
  slug,
  displayName,
  symbolicNotation:      <from DB operational_notation column>,
  semanticEquivalences:  <both readings from CORE_TRICK_SPEC.equivalences>,
  // ... other fields
}
```

The template then renders `semanticEquivalences[]` as a loop of `≡`
paragraphs.

### 1.3. What the brief targets

Brief E2 says "REMOVE executable accounting notation from public
cards" with the example `≡ xbody(1) + dex(1) + stall(1)`. Recon
confirms the only surface this affects is the `/freestyle` landing's
Core Tricks grid. Everything else listed in the brief (add view,
family view, movement-system view, movement neighborhoods view,
glossary, related trick surfaces) is already clean.

Brief E4 establishes the compound-trick layering: headline =
shorthand compositional ("torque = miraging osis"); secondary = full
operational notation; tertiary = collapsed executable accounting.

---

## 2. Problem evidence

### 2.1. Visual hierarchy collision

The landing Core Tricks grid currently renders BOTH the descriptive
prose AND the accounting formula at equal `≡`-line hierarchy:

```
≡ cross-body rotational dex
≡ dex(1) + stall(1) = 2 ADD
```

Two equally-weighted readings on a compact card. Three problems:

- The user has no signal which reading is canonical.
- The accounting formula leaks implementation language (`(1)`,
  `+`, `= N ADD`) into public copy.
- The actual canonical operational notation (NCR-1) has no
  visible home today.

### 2.2. Layer separation per skill doctrine A

The accounting formula belongs in the "executable / accounting" layer
of the freestyle subsystem -- educational disclosure surface. Per
doctrine D restraint, it does NOT belong as a primary card affordance
on the landing or browse surfaces.

`/freestyle/add-analysis` is the curator-intended educational home.
The wave preserves it.

---

## 3. Options considered

### Option A: Drop `equivalences[1]` cosmetically in the template

Template currently loops `{{#each semanticEquivalences}}`. Path A:
replace the loop with `{{#with semanticEquivalences.[0]}}` (render
only the first reading).

REJECTED per curator decision #3 (locked 2026-05-18). Rationale: data
still flows from shaping helper to template; the template silently
suppresses a curator-authored line. Contract is fuzzy; future
developer sees `equivalences[]` populated and template only
rendering one entry, must inspect the template to learn why.

### Option B: Prune `equivalences[1]` in the shaping helper

`shapeCoreTrickCard()` returns `semanticEquivalences:
spec.equivalences` today. Path B: return only the first reading
(`semanticEquivalences: [spec.equivalences[0]]`). Template loop
unchanged; produces one `≡` line.

ACCEPTED per curator decision #3. Rationale:

- Cleaner contract: the shaping helper is the layer that decides
  which readings reach the landing surface.
- Template stays simple: a loop over a curated list, no
  silent suppression.
- Reversible: a single-line change re-enables both readings if
  curator changes course.
- Preserves curator-authored `CORE_TRICK_SPEC.equivalences[1]`
  data; metadata survives.
- Aligns with NCR-1's coupled change (adding `symbolicNotation`
  source) -- both changes touch the same shaping helper.

### Option C: Delete `equivalences[1]` from `CORE_TRICK_SPEC`

REJECTED. Loses curator-authored data. The accounting formulas have
durable value for `/freestyle/add-analysis` cross-references and
future executable-accounting disclosure surfaces. Demote rendering,
preserve data.

### Option D: Add a third equivalences slot for op-notation

REJECTED in favor of NCR-1's `operationalNotation` field path.
Adding a third equivalences slot mixes the conceptually distinct
op-notation reading with the existing two pedagogical readings.
Separate field, separate purpose.

---

## 4. Recommended approach

### 4.1. Shaping-helper prune (Path B)

`src/services/freestyleService.ts:shapeCoreTrickCard()`:

- Replace `semanticEquivalences: spec.equivalences` with
  `semanticEquivalences: [spec.equivalences[0]]` (or equivalent --
  takeFirst pattern).
- Preserve all other shaped fields.
- One-line change.

### 4.2. Coupling with NCR-1

Same shaping helper grows:

- `symbolicNotation: spec.operationalNotation` (new source-of-truth
  per decision #4).
- `semanticEquivalences: [spec.equivalences[0]]` (Path B prune).

Net effect on the landing's atom card after NCR-1 + NCR-2 atomic
slice:

```
Mirage
≡ cross-body rotational dex             <- preserved (equivalences[0])
[set] > hippy in dex > op toe           <- NEW (operationalNotation)
2 ADD
```

vs today:

```
Mirage
≡ cross-body rotational dex
≡ dex(1) + stall(1) = 2 ADD
2 ADD
```

One `≡` line plus an operational notation paragraph. Cleaner; one
canonical reading; one structural notation.

### 4.3. Compound trick layering (brief E4)

For compound tricks (not atoms; rendered via the dictionary
`dictionary-trick-card.hbs` partial), the layering is already in
place post-CR-5:

| Tier | Source | Renders on dictionary card |
|---|---|---|
| 1 | `tokenizedEquivalences` (chain registry + alias governance) | `≡ <chain reading>` (e.g. "gyro torque", "miraging osis") |
| 2 | `operationalNotation` (parser-derived) | Role-tagged op-notation tokens |
| 3 | Silent | Card renders title + ADD chip only |
| 4 | (Future) Executable accounting | DETAIL-PAGE collapsed `<details>` ONLY; not on browse cards |

Tier 1 carries the compositional shorthand the brief E4 calls
"headline" (e.g. `torque = miraging osis`, `mobius = gyro torque`).
This is the chain-registry pattern already shipped through Slices L
through N + Pre-Red sweep (71 entries).

Tier 2 is the operational notation -- present where parser-population
has run; muted styling.

Tier 4 is the curator-intended future home for executable accounting
on individual tricks. Implementation is out of scope this wave;
NCR-3 documents the contract.

### 4.4. What stays unchanged

- `/freestyle/add-analysis` -- educational accounting home;
  preserved.
- Dictionary browse views (`?view=*`) -- already aligned post-CR-5;
  no change needed.
- Glossary `/freestyle/glossary` -- semantic-grammar layer; not
  affected.
- Trick-detail page (`/freestyle/tricks/:slug`) -- no current
  accounting prose; future tier-4 surface lands here.
- `CORE_TRICK_SPEC.equivalences[1]` content-module data --
  preserved; only rendering changes.

---

## 5. Implementation sketch

NOT actual code; enough detail to scope a slice.

### 5.1. Files touched (atomic with NCR-1)

| File | Change |
|---|---|
| `src/services/freestyleService.ts` | `shapeCoreTrickCard()` two changes: `semanticEquivalences` takeFirst; `symbolicNotation` source from `spec.operationalNotation` |
| `src/views/partials/core-tricks-grid.hbs` | Unchanged (rendering follows the curated `semanticEquivalences` list) |
| Tests as listed in `core_trick_notation_completion_audit.md` §5.1 | Combined updates |

### 5.2. Verification

- Manual spot-check: each atom card on `/freestyle` shows exactly
  one `≡` line (descriptive prose) plus the operational notation
  paragraph. No `(1)`, `+`, `&#x3D;`, `= N ADD` strings within the
  Core Tricks grid section.
- `/freestyle/add-analysis` continues to show all 17 derivation
  lines (recon §1 confirmed count).
- Dictionary cards unchanged.

### 5.3. CSS

The existing `.core-trick-notation` rule (singular, for one
notation paragraph per card) needs to handle the new content. Audit
during implementation to ensure no styling change is required; if
needed, minor tweak for line wrap on the longest atom string
(`swirl`'s 38-char form).

### 5.4. Out of scope for the implementation slice

- Compound dictionary card rendering (already aligned post-CR-5).
- Trick-detail page accounting disclosure (deferred per E4
  tertiary; NCR-3 documents contract).
- `/freestyle/add-analysis` changes.
- New ops-notation strings for non-atom tricks.

---

## 6. Curator decision points

- **(DECIDED at session-level)** Shaping-helper prune (Path B).
- **(DECIDED at session-level)** `equivalences[1]` data preserved
  in content module; only rendering changes.
- **(DEFER)** Whether to add a future collapsed `<details>` block
  to atom cards that surfaces the accounting formula on demand.
  Not for v1; potential future enhancement.
- **(DEFER)** Compound trick tier-4 detail-page surface design
  (where on the trick-detail page does the accounting `<details>`
  block live? above op-notation? below records?). NCR-3 documents
  the principle; implementation pacing is curator's call.
- **(DEFER)** Whether to introduce a tier-4 surface that aggregates
  ADD-accounting derivations across a family or movement system.
  Out of scope.

---

## 7. Risks and mitigations

### 7.1. Risk: Curator-authored `equivalences[1]` accounting prose has off-landing consumers

Hypothetical: some other view-model might consume the
`CORE_TRICK_SPEC.equivalences[1]` array directly. Mitigation: the
content module is unchanged; data still flows. Only the landing
shaping helper takes only the first entry.

Spot-check during implementation: grep `CORE_TRICK_SPEC` consumers.
The current consumer set is small (recon shows the landing grid as
the primary).

### 7.2. Risk: Visual void after accounting removed

The card had two `≡` lines; now has one plus an op-notation paragraph
(via NCR-1). Net visual density: roughly unchanged. The new
operational notation is the brief's intent for the slot.

### 7.3. Risk: Test churn

Bounded: ~7 accounting assertions in `freestyle.portal.routes.test.ts`
plus ~6 in `freestyle.routes.test.ts`. Each gets replaced (NCR-1
update path) or removed (cards with NULL operational notation, if
any). Mechanical sweep.

### 7.4. Risk: Restraint doctrine D violation

The added op-notation line could read as "more text on a busy card."
Mitigation: the line REPLACES the accounting line conceptually --
not stacked on top. Visual density bounded.

### 7.5. Risk: Compound dictionary cards drift

NCR-2 explicitly does not change compound dictionary card rendering;
the 4-tier hierarchy from CR-5 holds. Risk mitigated by separation
of concerns.

---

## 8. Out of scope

- Compound dictionary card behavior (CR-5 already aligned).
- `/freestyle/add-analysis` (curator-intended educational home).
- Glossary surfaces.
- Trick-detail page tier-4 disclosure (deferred; documented in
  NCR-3 contract only).
- Aggregation views of accounting derivations.
- Removing `CORE_TRICK_SPEC.equivalences[1]` from the content
  module (preserve data).
- Modifier rows or family-membership changes.

---

## 9. Cross-references

- `FINAL_RECOMMENDATION.md` -- NCR-2; decision #3 (Path B shaping
  helper prune).
- `core_trick_notation_completion_audit.md` -- NCR-1; the coupled
  slice that adds operationalNotation while NCR-2 removes
  `equivalences[1]`.
- `public_notation_render_hierarchy.md` -- NCR-3 4-tier contract;
  this doc maps Tier 4 to detail-page disclosures.
- `landing_density_cleanup.md` -- NCR-4 + NCR-5; landing
  reorganization; touches the same surface but a separate concern.
- Skill `footbag-freestyle-dictionary` doctrine A (four-layer
  ontology separation). Accounting prose = "executable / accounting
  layer"; not part of the canonical-symbolic layer rendered on
  landing.
- Skill `freestyle-topology-governance` doctrine D restraint.
  Cards stay restrained; tier-4 disclosure is collapsed by default.

---

## 10. Summary

Prune `CORE_TRICK_SPEC.equivalences[1]` accounting prose from the
landing Core Tricks grid via the shaping helper (Path B per
curator decision #3). Preserve metadata in the content module.
Lands atomically with NCR-1 (op-notation completion). The 4-tier
hierarchy that governs compound dictionary cards holds; tier-4
accounting disclosure on detail pages remains deferred per brief
E4 tertiary. Brief E2 + E4 satisfied without data loss, schema
mutation, or restraint violation.
