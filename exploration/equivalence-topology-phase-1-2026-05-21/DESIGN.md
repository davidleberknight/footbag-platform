# Equivalence Topology Phase 1 — Design Proposal — 2026-05-21

A governance + publication-model slice for tricks that admit multiple
structurally coherent derivations. Phase 1 establishes the model; later
phases curate inventory and wire publication surfaces.

**This is a curator-review deliverable.** No public-rendering changes ship
in Phase 1. The TS module + tests ship as a schema commitment the curator
can ratify before Phase 2.

---

## 0. Status + scope

### 0.1 What this revises

R1a–R1h (2026-05-20 / 2026-05-21) stabilized major ontology infrastructure
(barraging weight, witchdoctor composite reading, mobius doctrine-locked
framing, derivation-atlas polish). During that work the dictionary
surfaced a deeper frontier: **some tricks possess multiple structurally
coherent derivations that converge arithmetically but differ
pedagogically, historically, or in publication discipline.**

The existing equivalence-chain primitive in
`freestyleSymbolicEquivalences.ts` handles **compression ladders** well —
the same decomposition rendered at progressively shallower depths
(e.g. `mobius → gyro torque → spinning ss torque → spinning ss miraging op
osis`). It does NOT handle **alternate derivations** — structurally
distinct decomposition paths that all converge on the same canonical
trick.

This document proposes a lightweight Phase 1 model for the alternate-
derivation case without collapsing the canonical reading, hardening the
ontology, or anticipating Wave-2 Red rulings.

### 0.2 What stays locked

- Canonical readings remain in `freestyle_tricks` + `freestyle_trick_modifier_links`. Nothing in the new layer competes with the canonical column.
- Compression-ladder readings remain in `freestyleSymbolicEquivalences.ts`. The two layers coexist; neither replaces the other.
- Published-formula entries in `freestyleResolvedFormulas.ts` remain the source-of-truth for the convergence rule.
- Per `feedback_parser_editorial_separation`: parser layer reads canonical_name only; editorial layer reads base_trick + modifier links + asserted ADD. The new layer is editorial.

### 0.3 What this adds

A new content module `freestyleEquivalenceTopology.ts` that carries
**alternate-derivation entries** as additive, observational topology
descriptors. Each entry names the trick, asserts a derivation
alternative to the canonical published reading, tags the entry with a
role/source/status triple, and remains reversible by deletion.

No SQL changes. No schema migrations. No public-rendering surface in
Phase 1.

---

## 1. Equivalence-topology identity statement

> An **equivalence-topology entry** asserts that a single canonical
> trick admits a derivation path that is **structurally distinct from
> its canonical published decomposition** but **arithmetically
> equivalent** under current ADD doctrine. The entry preserves the
> alternate path as observational metadata without displacing the
> canonical reading.

Equivalence topology is the **alternate-path layer** of the freestyle
ontology. The canonical reading remains primary in publication and in
the convergence rule. The alternate-derivation entries add educational,
historical, or doctrinal richness without conflicting with canon.

---

## 2. Audit inventory (Phase 1 baseline)

A targeted audit of the current dictionary infrastructure surfaces
**two** genuine structural multi-derivation cases. All other multi-
reading entries reduce to **compression ladders** (one decomposition at
multiple depths).

| slug | source A (path 1) | source B (path 2) | both reach | flagged? |
|---|---|---|---:|:---:|
| **flurry** | `freestyleSymbolicEquivalences.ts` &mdash; `barraging legover` (pt4-locked) | `freestyleDerivationPilot.ts` &mdash; `paradox(+1) + paradox-legover(3) = 4 ADD` (double-paradox stack) | 4 ADD | YES |
| **witchdoctor** | `freestyleSymbolicEquivalences.ts` &mdash; `atomic symposium mirage` (FM-only, pending) | `freestyleService.ts COMPOSITE_DERIVATIONS` &mdash; `atom-smasher(4) + symposium(+1) = 5 ADD` (composite-base; Red 2026-05-20) | 5 ADD | YES |

**Compression-ladder cases (NOT multi-derivation — already handled):**
mobius, matador, gauntlet, paradox-blender, food-processor,
paradox-drifter, fog. Each carries a 2- or 3-reading chain that walks
shallow → deep on a **single** structural decomposition.

**Latent / future cases (NOT in Phase 1 inventory):**
- `blurry-torque` and `blurry-whirl` &mdash; alt-reading `stepping paradox X` retired Red 2026-05-20; new alternate path pending curator decision on missing-component derivation. May become equivalence-topology entries once the curator resolves the 1-component gap. Tracked under R1g.
- `torque` &mdash; its own family AND osis-derived via `miraging osis`. Per topology-governance skill warnings, this is a multi-family case the schema cannot express today; equivalence-topology MAY become an interim surfacing mechanism.
- `double-leg-over` &mdash; legover-based AND mirage-related via `miraging legover`. Same shape as torque case.
- `blender` &mdash; canonical `whirling osis` vs culturally atomic perception.
- `drifter` &mdash; canonical `miraging clipper` vs culturally atomic perception.

These remain candidates; Phase 1 does NOT pre-author entries for them.

---

## 3. Classification of multi-derivation patterns

Five patterns emerge from the audit. Phase 1 surfaces only the first two;
the others are catalogued so future entries can be tagged consistently.

| Pattern | Description | Example | Phase |
|---|---|---|---|
| **modifier-stack ↔ paradox-stack** | Same arithmetic, different operator topology: one path uses a composite modifier (barraging, blurry, nuclear), the other uses a paradox-stack decomposition that walks operator-by-operator. | flurry | **1** |
| **flat-stack ↔ composite-base** | Same arithmetic, different anchor: one path uses a flat (base + modifiers) decomposition, the other treats a named compound (atom-smasher, blender, drifter) as the structural base with additional modifiers stacked. | witchdoctor | **1** |
| **folk-name ↔ structural** | A trick carries a folk name whose structural decomposition has been curator-rationalized; both forms remain socially live. | reaper (folk; orphan), surreal (folk; hybrid) | 2 |
| **rotational reinterpretation** | The doctrine governing the trick's ADD has shifted; older readings remain pedagogically useful as historical artifacts. | mobius (doctrine-locked rotational continuity reading) | 2 (already partially surfaced via §8.7 doctrine card) |
| **hidden-component / implied-component** | The canonical ADD includes a component (X-dex from a toe, hidden paradox, hidden symposium) not visible in the flat operator string. | atom-smasher (X-dex carry; Red 2026-05-15 hidden mechanism) | 2 |

The pattern label is part of the data shape; future readers can filter
by pattern when authoring or rendering.

---

## 4. Lightweight topology-governance proposal

### 4.1 Schema (TypeScript content module, reversible by deletion)

```ts
// src/content/freestyleEquivalenceTopology.ts

export type DerivationRole =
  | 'canonical-primary'          // matches the canonical published reading
  | 'alternate-equivalent'       // structurally distinct, arithmetically converges
  | 'historical'                 // prior reading retained for pedagogy / lineage
  | 'doctrine-locked-alternate'  // alternate that the doctrine explicitly governs
  | 'deprecated';                // retired alt-reading; preserved for searchability

export type DerivationSource =
  | 'curator-derived'   // curator-authored structural assertion
  | 'historical'        // Holden Move Sets / footbag.org / other archival source
  | 'community'         // widely-used community shorthand
  | 'structural';       // emerges from operator decomposition

export type DerivationStatus =
  | 'pending-curator'    // entry authored; awaits curator confirmation
  | 'confirmed'          // curator-locked
  | 'wave-2-gated'       // Red Wave-2 ruling may override
  | 'doctrine-locked';   // governed by a published doctrine

export interface EquivalenceTopologyEntry {
  /** Canonical trick slug. Must exist in freestyle_tricks. */
  readonly slug:               string;
  /** Display name (the canonical compressed name). */
  readonly displayName:        string;
  /** Pattern label from §3 classification table. */
  readonly pattern:
    | 'modifier-stack-vs-paradox-stack'
    | 'flat-stack-vs-composite-base'
    | 'folk-name-vs-structural'
    | 'rotational-reinterpretation'
    | 'hidden-component';
  /** One-line context note rendered as the entry header summary. */
  readonly summary:            string;
  /** All published derivation paths for this slug, ordered: index 0 is
   *  the canonical-primary reading; remaining entries are alternates. */
  readonly derivations:        readonly DerivationPath[];
  /** When true, the entry surfaces with the pending flag. Phase-1 pilot
   *  entries default to true; curator flip to false ratifies. */
  readonly curatorConfirmPending: boolean;
  /** Optional advanced-prose paragraph for curator-internal commentary;
   *  never publicly surfaced in Phase 1. */
  readonly curatorNote?:       string;
}

export interface DerivationPath {
  readonly role:           DerivationRole;
  readonly source:         DerivationSource;
  readonly status:         DerivationStatus;
  /** Short structural reading: "barraging legover", "paradox + paradox
   *  legover", "atom-smasher + symposium". Curator-authored verbatim. */
  readonly reading:        string;
  /** Optional executable ADD breakdown using §8 vocabulary:
   *  "barraging(+2) + legover(2) = 4 ADD". Aligns with derivation-pilot
   *  breakdown field where present. */
  readonly addBreakdown?:  string;
  /** Optional provenance citation: which module / source / ruling
   *  publishes this path. Surfaced to curator only in Phase 1. */
  readonly publishedIn?:   string;
}
```

### 4.2 Distinctions

This proposal explicitly separates five concepts that often collapse in
casual discussion:

| Concept | Layer | Where it lives |
|---|---|---|
| **equivalence** (mechanical) | convergence rule | `freestyleService.ts` (assertFirstClassConvergence) |
| **alias** (name-to-slug pointer) | dictionary | `freestyle_trick_aliases` table |
| **alternate derivation** (structurally distinct path) | **NEW** | `freestyleEquivalenceTopology.ts` |
| **observational reinterpretation** | observational layer | `freestyleObservationalTricks.ts` |
| **doctrine-locked alternate** | doctrine cards | `freestyleGlossaryAddExamples.ts` + glossary §8 |

The new layer adds the `alternate derivation` row; it does not absorb
the other four.

### 4.3 Invariants

1. **Canonical-primary index 0**. Every entry's `derivations[0]` MUST match the canonical reading from `freestyle_trick_modifier_links` (where present) or from the canonical compressed name (otherwise). The TS module is additive: it never overrides canon.
2. **Slug uniqueness**. Each slug appears at most once in the topology array. Multiple alternates for the same slug live as multiple `DerivationPath` entries inside that slug's `derivations` array.
3. **Arithmetic convergence**. All `derivations[].addBreakdown` totals (when present) MUST equal the canonical ADD. Mismatches are governance failures, not data; the entry is broken if breakdowns disagree.
4. **No public render in Phase 1**. The module is curator-internal until a curator-authored render path is approved.
5. **Reversible by deletion**. Removing an entry retires the alternate-derivation surfacing. No migration required.

---

## 5. Flurry pilot recommendation

### 5.1 The flurry case

Three published surfaces carry structural data about flurry:

| Surface | Reading | Arithmetic | Source authority |
|---|---|---|---|
| `freestyleSymbolicEquivalences.ts` (chain registry) | `barraging legover` (single-reading chain; pt4-locked) | barraging(+2) + legover(2) = 4 (under R1b weights) | Red pt4 2026-05-02 |
| `freestyleDerivationPilot.ts` (derivation atlas) | `flurry → double paradox legover → CLIP > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > SAME TOE` | paradox(+1) + paradox-legover(3) = 4 | curator-authored 2026-05-20 |
| DB `freestyle_trick_modifier_links` | empty (no modifier rows for flurry) | self-derived; convergence rule reports convergence-ready | dictionary-loaded |

All three reach **4 ADD**. None of the three can be deleted without
losing pedagogical or historical signal:

- **The chain reading** is Red-locked at pt4 and preserves the historical "Barraging Legover" naming tradition.
- **The pilot reading** is the live derivation-atlas pedagogy for the "paradox-stack as compositional generator" narrative; without it the atlas loses a worked-example slot.
- **The empty DB reading** is the convergence-rule fallback that keeps the rule consistent with rows that don't yet carry curator-locked decompositions.

### 5.2 Pilot proposal

Author **one entry** in the new module:

```ts
{
  slug:        'flurry',
  displayName: 'Flurry',
  pattern:     'modifier-stack-vs-paradox-stack',
  summary:     'Flurry admits two structurally distinct derivations that both yield 4 ADD: a barraging-stack reading anchored at pt4, and a paradox-stack reading published in the derivation atlas. Both are pedagogically live.',
  derivations: [
    {
      role:          'canonical-primary',
      source:        'historical',
      status:        'confirmed',
      reading:       'barraging legover',
      addBreakdown:  'barraging(+2) + legover(2) = 4 ADD',
      publishedIn:   'freestyleSymbolicEquivalences.ts (pt4-locked 2026-05-02; barraging weight 2 per Red 2026-05-20)',
    },
    {
      role:          'alternate-equivalent',
      source:        'curator-derived',
      status:        'pending-curator',
      reading:       'paradox + paradox legover',
      addBreakdown:  'paradox(+1) + paradox-legover(3) = 4 ADD',
      publishedIn:   'freestyleDerivationPilot.ts (derivation-atlas pilot 2026-05-20)',
    },
  ],
  curatorConfirmPending: true,
  curatorNote: 'Phase 1 pilot entry. Both readings preserve under R1b barraging weight = +2. Curator must ratify which is the canonical-primary; the other is pedagogically valid as alternate-equivalent. DB modifier_links remains empty until ratification.',
},
```

The pilot establishes:
- The schema works for the `modifier-stack-vs-paradox-stack` pattern.
- `pending-curator` and `curatorConfirmPending: true` together preserve the curator-input gate.
- `publishedIn` traces the entry back to its source surfaces so the curator can verify before ratifying.

The pilot is reversible: deleting the entry removes the topology surfacing without affecting any of the three source surfaces.

---

## 6. Publication semantics

Phase 1 ships **no public render**. The recommended publication
semantics for Phase 2+ (curator authorization required):

### 6.1 Where alternates may surface

| Surface | Show alternates? | When | Phase |
|---|---|---|---|
| Trick-detail page (default view) | NO | never inline | — |
| Trick-detail page (`[advanced]` panel) | YES | when entry exists | 2 |
| Derivation atlas panel | YES | as a sub-component below the ladder | 2 |
| Glossary §10 equivalence-chain primitive | YES | dedicated row per alternate-derivation entry | 3 |
| Search results | NO | never | — |
| Browse views (`?view=family` etc.) | NO | never | — |

### 6.2 When to suppress

- The default trick-detail view always shows the canonical-primary reading only.
- Alternates appear only behind an explicit affordance: a `[advanced]` expandable, a "see alternate derivations" link, or the derivation-atlas panel.
- `pending-curator` entries never appear publicly until curator flips the flag.
- `deprecated` entries surface only on a curator-internal audit view, never publicly.

### 6.3 How alternates render

Phase 2 proposal: a compact two-line rendering inside an existing
`[advanced]` panel:

```
+---------------------------------------------------------------+
| Alternate derivations                                         |
+---------------------------------------------------------------+
| ≡  barraging legover         [historical]      4 ADD          |
| ≡  paradox + paradox legover [curator-derived] 4 ADD  [pending]|
+---------------------------------------------------------------+
```

The format reuses the existing equivalence-chain row shape from the
glossary derivation atlas (memory: `feedback_no_individual_names_freestyle_views`
applies — no individuals in attribution).

---

## 7. UI placement strategy

### 7.1 Decision

**Phase 1**: no UI placement. Module is curator-internal.

**Phase 2** (curator-ratified): place alternate-derivation surfacing
inside the existing `[advanced]` expandable on trick-detail pages, and
optionally as a sub-component below the derivation-atlas ladder. NO new
top-level browse surface; NO standalone equivalence-topology landing
page.

### 7.2 Why this placement

- Existing surfaces (derivation panel, trick detail) already carry the per-trick context the reader needs. Adding a top-level browse surface would invent navigation the data doesn't yet justify.
- The `[advanced]` expandable already signals "this is a deeper layer the default reader doesn't need." Alternates fit that contract.
- The derivation-atlas panel already shows one-trick decomposition with full structural detail. Adding the alternates as a sub-component beneath the ladder reuses the panel's visual language.
- Per memory `feedback_modifier_public_visibility`: caution around new public surfaces is high. Restraint-first.

---

## 8. Risks + failure modes

| Risk | Mitigation |
|---|---|
| Premature canonical claim &mdash; the pilot entry mistakes a curator-derived path for canon | `curatorConfirmPending: true` + `status: pending-curator` make this loud; flurry pilot stays pending until ratification |
| Wave-2 Red rulings overrule an entry's structural reading | `status: 'wave-2-gated'` exists; per topology-governance skill, mark all uncertain entries explicitly |
| The pattern list (§3) ossifies prematurely | Pattern enum is closed-set but reviewable. Adding a pattern requires curator decision + design-doc update; subtracting requires retiring all entries that used it. Phase 1 ships only two patterns active. |
| Schema drift &mdash; new fields added later break old entries | Schema-pinning tests assert exhaustive shape; type-only `interface` change requires updating every entry; restraint-first |
| Curator load &mdash; pending-curator entries accumulate | Phase 1 ships exactly ONE pending entry. Phase 2 review of inventory candidates is a curator-paced operation. |
| The new module gets confused with `freestyleSymbolicEquivalences.ts` | Module header documents the distinction; file naming separates them; tests pin both modules' shapes |
| SQL hardening pressure &mdash; "this should be a column" | Forbidden by reversibility doctrine; if a future slice proposes migration, requires curator sign-off + design-doc update |
| Auto-derivation pressure &mdash; "we could parse-derive these" | Forbidden by parser/editorial separation (memory `feedback_parser_editorial_separation`); curator-authored only |
| Confusing public-prose attribution | No individual names per memory `feedback_no_individual_names_freestyle_views`; "Red 2026-05-20" framing is the authorized exception for codified rulings, not a per-derivation source-of-truth claim |

### 8.1 Non-goals

- NOT a parser rewrite.
- NOT a full topology engine.
- NOT a multi-family schema migration.
- NOT a replacement for `freestyleSymbolicEquivalences.ts`.
- NOT a doctrine-decision layer (doctrine cards remain in `freestyleGlossaryAddExamples.ts`).
- NOT a movement-similarity surface; movement-neighborhood concept stays per topology-governance skill.

---

## 9. Minimal implementation candidate

### 9.1 Ship in Phase 1

1. `src/content/freestyleEquivalenceTopology.ts` &mdash; type definitions + flurry pilot entry (curatorConfirmPending: true).
2. `tests/unit/freestyleEquivalenceTopology.test.ts` &mdash; schema-pinning tests: type shape, slug uniqueness, canonical-primary at index 0, addBreakdown arithmetic agreement, role/source/status enum coverage.
3. No service wiring. No public surface. No template changes.

### 9.2 Defer to Phase 2 (post-curator ratification)

- Add the witchdoctor entry (flat-stack vs composite-base pattern).
- Add a service method that reads the topology array for trick-detail pages.
- Wire a render path inside an existing `[advanced]` expandable.
- Surface in derivation-atlas panels as a sub-component.

### 9.3 Defer to Phase 3+

- Folk-name vs structural cases (reaper, surreal, montage, etc.) once Wave-2 + Red-track resolve folk-name canonicalization.
- Rotational reinterpretation cases (deeper mobius pedagogy beyond §8.7 doctrine card).
- Hidden-component cases (atom-smasher X-dex carry visualized as alt-derivation).
- Glossary §10 equivalence-chain primitive integration.

---

## 10. Phased acceptance gates

### Phase 1 (this slice)

- [x] Audit confirms 2 multi-derivation cases (flurry, witchdoctor) and 5 latent candidates.
- [x] Schema specified with role / source / status / pattern enums.
- [x] Flurry pilot entry authored with `curatorConfirmPending: true`.
- [x] Schema-pinning tests pass.
- [x] No public-rendering changes.
- [ ] Curator reads this design doc + the pilot entry; ratifies or revises.

### Phase 2 (post-curator ratification)

- Flurry entry `curatorConfirmPending` flipped to false.
- Witchdoctor entry authored.
- One render path wired behind `[advanced]` expandable on trick-detail.
- Schema-pinning tests extended.

### Phase 3+

- Latent candidates triaged.
- Glossary §10 integration.
- Pattern catalog reviewed against accumulated entries.

---

## 11. Closing

The freestyle ontology contains a small number of tricks whose structure
can be honestly read in more than one way. Phase 1 of equivalence
topology surfaces that fact without resolving it &mdash; the curator
ratifies, the doctrine stabilizes, and the schema absorbs new entries
as Red Wave-2 lands. The module is a quiet additive layer that
preserves richness without spilling into the canonical surfaces or the
parser.

Restraint-first. Reversible by deletion. Curator-paced.
