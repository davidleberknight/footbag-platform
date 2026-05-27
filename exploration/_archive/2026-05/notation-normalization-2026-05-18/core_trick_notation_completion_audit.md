# Core Trick Notation Completion Audit (NCR-1, brief E1)

Highest priority of the Notation Normalization Wave. Authors canonical
operational notation for the 12 core tricks per the curator-supplied
verbatim strings.

Supports `FINAL_RECOMMENDATION.md` NCR-1. Bakes in curator decision #4
locked 2026-05-18: source of truth is the TypeScript content module
(`CoreTrickSpec.operationalNotation` field), NOT the DB
`operational_notation` column.

---

## 1. Current state

Per recon (2026-05-18) and dictionary-coherence wave context:

- `CORE_TRICK_SPEC` in `src/content/freestyleLandingContent.ts:138-150`
  carries 12 atom entries. Each entry has:
  - `slug` (e.g. `'mirage'`)
  - `equivalences[]` (two readings per atom):
    - `[0]`: descriptive prose ("cross-body rotational dex")
    - `[1]`: accounting formula (`dex(1) + stall(1) = 2 ADD`)
- No `operationalNotation` field exists yet.

The `/freestyle` landing's Core Tricks grid renders via
`src/views/partials/core-tricks-grid.hbs:22-39`. It reads:

- `semanticEquivalences[]` (both readings; rendered as `≡` lines)
- `symbolicNotation` (a separate field; rendered as
  `<p class="core-trick-notation">{{symbolicNotation}}</p>`)

The `symbolicNotation` field is shaped by `shapeCoreTrickCard()` in
`freestyleService.ts:602` from the DB `operational_notation` column.
For core tricks, this column is **null or sparse** (recon §4
confirmed: NONE of the 12 atoms has rendered operational notation
today). The `<p class="core-trick-notation">` paragraph either renders
empty or doesn't render at all (depending on null-check semantics
in the template -- audit during implementation).

Visible state today on the landing: each core trick card shows two
`≡` lines (descriptive prose + accounting formula). No operational
notation.

---

## 2. Problem evidence (validated against recon)

Brief E1 mandate:

> Every core trick must have canonical operational notation.

Recon confirms zero coverage today. The 12 atoms have:

- Descriptive prose (rendered as `≡ <prose>`).
- Accounting formula (rendered as `≡ <formula>`; targeted for
  removal in NCR-2).
- No operational notation rendered.

The brief supplies 12 curator-authoritative strings:

```
toe stall:         [set] > toe
clipper stall:     [set] > clipper
ATW:               toe > ss(midtime) in dex > ss toe
orbit:             toe > ss(midtime) out dex > ss toe
legover:           [set] > leggy out dex > ss toe
pickup:            [set] > leggy in dex > ss toe
mirage:            [set] > hippy in dex > op toe
illusion:          [set] > leggy out dex > op toe
butterfly:         [set] > hippy out dex > ss clipper
osis:              [set] > (downtime) spin > ss clipper
whirl:             [set] > leggy in dex > ss clipper
swirl:             [set] > leggy (xbd) out dex > ss clipper
```

These are the brief's verbatim canon. The wave does not re-debate the
strings; the implementation slice authors them as supplied.

---

## 3. Options considered

### Option A: Populate `freestyle_tricks.operational_notation` column via curated CSVs

REJECTED per curator decision #4 (locked 2026-05-18). Rationale:

- Requires editing `inputs/noise/tricks.csv` +/or
  `inputs/curated/tricks/red_additions_2026_04_20.csv` and
  re-running loader 17/19. Schema-coupled.
- DB-resident; survives only when curated CSVs + loader chain stay
  in sync.
- Less reversible than TypeScript content modules.
- Mixes curator-authored teaching strings with parser-derived
  notation in the same DB column (loss of provenance).

### Option B: Add `operationalNotation` field to `CoreTrickSpec`

ACCEPTED per curator decision #4. Rationale:

- Reversible TypeScript per `feedback_reversible_content_governance`.
- Curator-authored, parallel to existing `equivalences[]` shape.
- Survives DB rebuilds without re-running loaders.
- Cleanly distinct from DB `operational_notation` column (which
  remains the home for parser-derived ops notation across the
  broader dictionary).
- The Core Tricks grid is already content-module-shaped; adding one
  field is a minimal extension.

### Option C: Author into the chain registry (`freestyleSymbolicEquivalences.ts`)

REJECTED. The chain registry expresses COMPOUND chains (e.g. "mobius
= gyro torque", with both halves linked to a base). Atoms don't have
the same compositional shape; forcing them into the chain registry
mixes structurally distinct content.

### Option D: Suppress accounting + render existing prose only

REJECTED. Doesn't satisfy the brief; operational notation is the
required new content.

---

## 4. Recommended approach

### 4.1. Content-module change

Add an `operationalNotation` field to the `CoreTrickSpec` interface
in `src/content/freestyleLandingContent.ts`:

```typescript
export interface CoreTrickSpec {
  slug:                 string;
  // existing fields...
  equivalences:         readonly string[];
  operationalNotation:  string;  // NEW — canonical structural notation
}
```

Populate the 12 verbatim strings from the brief (§2 of this doc).

Order in the data is curator-paced. Recommend matching the existing
`CORE_TRICK_SPEC` array order so the rendering loop preserves landing
visual order.

### 4.2. Service shaping helper

`shapeCoreTrickCard()` in `freestyleService.ts:602` currently shapes
`symbolicNotation` from the DB `operational_notation` column. Change:

- Source `symbolicNotation` from `CoreTrickSpec.operationalNotation`
  instead of DB column. Trivial: one-line swap.
- DB `operational_notation` column remains untouched for non-atom
  tricks; this change affects only the Core Tricks grid's shaping
  helper for atoms.

### 4.3. Template

`src/views/partials/core-tricks-grid.hbs:30` already renders
`<p class="core-trick-notation">{{symbolicNotation}}</p>` when the
field is present. Template UNCHANGED.

If the template currently has a null-check that hides the paragraph
when `symbolicNotation` is empty (which it likely does), the new
content makes the paragraph appear on every atom. Visual: each atom
card gains a notation line below its title.

### 4.4. Coupling with NCR-2

NCR-2 prunes `equivalences[1]` (the accounting formula) from the
landing grid via the shaping helper. The two changes land atomically
in one slice: the accounting line disappears, the op-notation line
appears in roughly the same visual slot. Net cosmetic effect on the
landing: one `≡` line plus the operational notation paragraph; not
two `≡` lines.

Detail in `compound_notation_strategy.md`.

### 4.5. Tests

Update tests that currently assert on the accounting `≡` line on the
landing (`freestyle.portal.routes.test.ts:901-934`, 7 accounting-formula
assertions). The same test surface can pin the new op-notation contract:

- Assert each of the 12 atom slugs renders its canonical
  `operationalNotation` string verbatim within its card scope.
- Assert no `(1) +` / `&#x3D; \d ADD` accounting prose remains on
  the landing surface.

The `/freestyle/add-analysis` page's accounting derivations
(`freestyle.add-analysis.routes.test.ts:200-226`) remain unchanged --
that page is the curator-intended home for accounting.

---

## 5. Implementation sketch

NOT actual code; enough detail to scope a slice.

### 5.1. Files touched

| File | Change |
|---|---|
| `src/content/freestyleLandingContent.ts` | Interface field add + 12 verbatim strings |
| `src/services/freestyleService.ts` | `shapeCoreTrickCard()` source-of-truth swap for `symbolicNotation`; couple with NCR-2 prune of `equivalences[1]` |
| `src/views/partials/core-tricks-grid.hbs` | NO CHANGE if existing null-check handles empty `symbolicNotation`; minor template guard otherwise |
| `tests/integration/freestyle.portal.routes.test.ts` | Update accounting assertions; add op-notation assertions for 12 atoms |
| `tests/integration/freestyle.routes.test.ts` | Update tests that assert on accounting prose for atom cards |

### 5.2. Verification

- Manual spot-check on the `/freestyle` landing: each of the 12
  atom cards now shows the curator-authored op-notation string.
  Accounting formula `≡` line no longer appears.
- `/freestyle/add-analysis` unchanged; accounting derivations
  remain accessible there.
- Dictionary surfaces (`/freestyle/tricks?view=*`) unaffected --
  they use the separate `dictionary-trick-card.hbs` partial.

### 5.3. Out of scope for the implementation slice

- DB `operational_notation` column writes for atoms.
- Parser regeneration.
- New ops-notation strings for non-atom tricks (these are sourced
  from the existing parser-population pipeline).
- Re-litigating the 12 strings (curator-authoritative per brief).

---

## 6. Curator decision points

- **(DECIDED at session-level)** TypeScript content module is the
  source of truth.
- **(DEFER)** Whether to also author op-notation for the broader
  dictionary's compound tricks in the chain registry. Out of scope
  this wave.
- **(DEFER)** Whether to expose the 12 op-notation strings on the
  trick-detail page (`/freestyle/tricks/:slug`) in addition to the
  landing. Detail-page handling is part of NCR-3's 4-tier contract;
  separate slice if needed.
- **(DEFER)** Whether to deprecate or remove the descriptive prose
  `equivalences[0]` once op-notation is the primary reading. The
  prose has independent pedagogical value; recommend keep.

---

## 7. Risks and mitigations

### 7.1. Risk: Curator wants to revise the 12 strings later

Mitigated by content-module placement. A single-file edit changes
any string; no DB seed, no schema migration. Reversibility is the
core argument for option B.

### 7.2. Risk: The 12 strings use notation conventions not defined elsewhere

The strings reference `(midtime)`, `(downtime)`, `(xbd)`, `[set]`,
`ss`, `op`, `in dex`, `out dex`, `hippy`, `leggy`, `spin`, etc.
These are established movement-language vocabulary covered in the
glossary's symbolic-grammar layer + operator board.

The brief implies these strings ARE the canon. Implementation
authors them verbatim. If glossary/operator board has minor naming
drift, that's a separate alignment task (cross-doc) and not in
this slice's scope.

### 7.3. Risk: Render line wrap on long strings at narrow widths

Strings range from 8 chars (`[set] > toe`) to 38 chars
(`[set] > leggy (xbd) out dex > ss clipper`). Most fit one line at
typical viewport widths; longest may wrap on phone. CSS should
allow soft wrap on `.core-trick-notation`. Audit during
implementation; no new pattern needed if existing notation
paragraph handles wrap.

### 7.4. Risk: Coupling with NCR-2 creates a bigger slice than expected

NCR-1 + NCR-2 atomic per locked sequencing. Both changes touch
the same shaping helper. Slice size estimate: small. The two
changes are tightly coupled by intent (NCR-1 fills the slot NCR-2
empties).

### 7.5. Risk: Test churn

Bounded: ~7 accounting-formula assertions in `portal.routes` test
file need rewriting; ~6 in `freestyle.routes.test.ts`. Each gets
replaced by an op-notation assertion. Mechanical update.

---

## 8. Out of scope

- DB column population for atom op-notation.
- Parser changes.
- Op-notation authoring for non-atom tricks (separate curator-paced
  authoring queue).
- New `equivalences` entries beyond the existing two.
- Removing the descriptive prose `equivalences[0]` (preserve for
  pedagogical value).
- Anything in `/freestyle/add-analysis` (its accounting derivations
  are explicitly preserved as the educational home).
- Trick-detail page changes (part of NCR-3 contract; separate slice
  if needed).
- Movement Neighborhoods / observational layer surfaces.

---

## 9. Cross-references

- `FINAL_RECOMMENDATION.md` -- NCR-1 cross-cutting recommendation;
  decision #4 (TS content module source-of-truth).
- `compound_notation_strategy.md` -- NCR-2 pruning detail; coupled
  slice.
- `public_notation_render_hierarchy.md` -- NCR-3 4-tier contract;
  this doc's op-notation fits Tier 2 on landing core tricks, Tier 1
  on the broader dictionary's compound chain pattern.
- `landing_density_cleanup.md` -- NCR-4 + NCR-5; landing
  reorganization touches the same surface but a different concern.
- Skill `footbag-freestyle-dictionary` doctrine 1 (canonical-vs-
  compositional rules); op-notation is canonical structural content
  per the dictionary skill's Jobs notation invariant.
- Skill `freestyle-topology-governance` doctrine A (four-layer
  ontology separation); op-notation lives in the "symbolic
  decomposition" layer; descriptive prose lives in "glossary
  pedagogy"; both layers may link, must not collapse.

---

## 10. Summary

Add `operationalNotation` field to `CoreTrickSpec`. Populate with 12
verbatim curator-authored strings. Update `shapeCoreTrickCard()` to
source `symbolicNotation` from this field. Atomic slice with NCR-2's
accounting prune. Template essentially unchanged; tests updated.
Brief E1 satisfied without DB schema work, parser changes, or
ontology mutation.
