# EV3 — Emerging Vocabulary Implementation Plan

Build the approved Hybrid model on `/freestyle/observational`. Section order:
**Promotion Ready → Needs Authoring → Doctrine Blocked → Folk/Unresolved → Alias Archive**, with derived-ADD ordering inside Promotion Ready + Needs Authoring and the existing doctrine clusters preserved.

Scope guardrails (carried from EV2): **no ontology, no promotions, no doctrine changes, read-only governance surface.** This is presentation + view-model shaping only. The generated modules (`freestyleObservationalUniverse.ts`, `freestyleTrackedNames.ts`) stay generated — no hand-edits.

This is an **evolution of the existing `getObservationalLayerPage`**, which already produces readyCards, frontierCards, doctrineClusters, ecosystemMatrix, and intakeBucket stats. EV3 re-groups, re-orders, adds two sections, and swaps ecosystem-grouping for ADD-grouping in A/B.

## Step 1 — Service helpers (freestyleService.ts)

1. **`deriveObservationalAdd(notation: string | null): number | null`**
   - Count ATAM bracket-flags (`[BOD]`/`[DEX]`/`[XBD]`/`[DEL]`/`[UNS]`) in the entry's `operationalNotation`, summing to a derived ADD; `null` when no notation (→ "ADD Unknown").
   - **MUST reuse the canonical ADD-flag counting**, not a parallel implementation. First action: locate the existing notation→ADD logic (search the service / `parse_freestyle_notation` equivalent on the TS side); if a shared counter exists, call it; if only the Python parser computes it, extract a single shared TS helper and use it for both canonical and observational so the page can never contradict the dictionary. Obs-tricks use their stored `proposedAddTotal` directly (no derivation).
2. **`frontierStatus(entry): 'ready' | 'needs-authoring' | 'doctrine' | 'folk' | 'alias'`** — the decision table from the IA doc:
   ```
   alias/duplicate_variant            -> 'alias'
   doctrine_unresolved/doctrine_pending -> 'doctrine'
   promotion_ready                    -> 'ready'
   hasStructure (notation|proposedAdd) -> 'needs-authoring'
   else                               -> 'folk'
   ```
   `hasStructure` reads existing fields only. **Define `needs-authoring` explicitly** (the one derived split) and surface the rule in the section intro so it's auditable.

## Step 2 — Reshape getObservationalLayerPage (view-model)

Return a status-first content shape (reuse existing card shaping for fields):
```
content: {
  metrics: { frontierSize, promotionReady, doctrineBlocked, unresolved, aliasDuplicate, pctUnderstood },
  promotionReady: { total, addGroups: [{ add: '1'|'2'|...|'unknown', label, cards[] }] },
  needsAuthoring: { total, addGroups: [...] },          // same ADD-group shape
  doctrineClusters: [...],                              // UNCHANGED from today
  folk: <summary-section vm>,                           // merge today's folk + parser tails
  aliasArchive: <summary-section vm>,                   // NEW: alias + duplicate_variant
  ecosystemMatrix: [...],                               // demoted to a collapsible health panel
  layerNote, canonicalReferences, generatedOn,
}
```
- **ADD groups**: bucket A and B cards by `deriveObservationalAdd`, order `1 → 2 → … → unknown` (unknown last). Within a group, sort by name.
- **Provenance**: keep the source label as a per-card chip (`src:FM` etc.), never a grouping key.
- **Metrics**: the five counts + `pctUnderstood = (ready + needsAuthoring) / frontierSize` where `frontierSize` excludes alias/duplicate. Drop any vanity totals.
- **Alias archive is excluded from `frontierSize`** and from `pctUnderstood`.

## Step 3 — View (observational.hbs)

Re-order to the Hybrid layout (reuse `observed-card-fields` + `observed-summary-section` partials):
1. Hero + intro (trim the triple stats/sources/layer-note stack).
2. **Promotion Ready** section FIRST — ADD-group headings, card grids. (Currently Section A but ecosystem-grouped; swap to ADD groups.)
3. **Frontier-health metric strip** immediately under Promotion Ready (5 numbers + % understood). Not an above-the-fold banner.
4. **Needs Authoring** — ADD groups; each card shows a `needs: notation/decomposition` tag.
5. **Doctrine Blocked** — keep the existing cluster markup verbatim.
6. **Folk / Unresolved** — `observed-summary-section`, collapsed.
7. **Alias / Duplicate Archive** — `observed-summary-section`, collapsed, labelled "resolves to an existing trick."
8. **Frontier by ecosystem** — the existing matrix, in a collapsed `<details>`.
9. Footer (canonical-reference links + generated date) — unchanged.

Cards: name + tracked-tag chip + derived-ADD badge (`✓N` or `⚠ ADD Unknown`) + source chip. **No detail-page link, no media** (these aren't canonical). No "promote" affordance.

## Step 4 — CSS (style.css)

Reuse existing `.observed-*` classes. Add: status badge variants (`--ready` green · `--needs-authoring` amber · `--doctrine` red · `--folk` grey · `--alias` muted), an ADD-group heading style, an `ADD Unknown` warning chip, and `<details>` styling for the collapsibles. Every new class must have a rule before merge (template-conventions manual check). No inline styles.

## Step 5 — Tests (tests/integration/freestyle.observational.routes.test.ts)

Extend the existing suite (don't replace):
- Section order: Promotion Ready renders **before** Needs Authoring before Doctrine Blocked before Folk before Alias.
- Promotion Ready is ADD-grouped and the lowest ADD group renders first; ADD Unknown renders last.
- Metric strip shows the five counts + % understood; alias count is shown but **not** added into frontierSize (assert the math).
- Doctrine clusters still render with their blocking question (regression).
- Read-only invariant: no promote button / no canonical detail-link on observational cards.
- Edge cases: empty Promotion Ready (no section), an entry with no notation lands in ADD Unknown, an alias-bucket entry lands only in the archive.
- The ADD derivation matches canonical for a known case (e.g. a name whose notation has two bracket-flags derives to 2).

## Implementation order

`deriveObservationalAdd` + `frontierStatus` (with the shared-ADD-counter check) → view-model reshape → view re-order → CSS → tests. Build + convention gate + the observational suite after each of the last three.

## Risks + guardrails

- **ADD-derivation drift from canonical** — the top risk. Reuse one shared bracket-flag counter; do not re-implement. A page that scores a name differently from the dictionary breaks trust. Mitigation: a test asserting parity on a known notation.
- **The derived Needs-Authoring split** — if `hasStructure` is loose, A and B blur. Keep the rule explicit + visible in the section intro.
- **Scope creep into promotion** — no promote action, ever; this stays a read-only map.
- **Alias archive inflating frontier** — exclude it from frontier math + label it clearly as resolved.
- **Generated-module temptation** — do not hand-edit the universe/tracked `.ts`; all logic lives in the service.
- **Performance** — the universe is ~1,500 rows; the existing page already iterates them, so grouping by ADD is the same order of work. No new data load.

## Acceptance criteria (done = all true)

1. Sections render in the Hybrid order; **Promotion Ready is the first content** below the hero.
2. Promotion Ready + Needs Authoring are grouped by **derived ADD**, lowest first, ADD Unknown last; source is a chip, not a group.
3. The five metrics + "% structurally understood" are correct and exclude the alias archive from frontier size.
4. Doctrine clusters are preserved unchanged.
5. Folk/Unresolved, Alias Archive, and the ecosystem matrix are collapsed by default.
6. No promote affordance, no canonical detail-link on cards; the page stays read-only.
7. Build, convention gate, and the observational test suite pass; no ontology/doctrine/data changed.

## Out of scope (explicitly deferred)

- Any promotion action or curator write-back.
- Backfilling `operationalNotation` for the 1,335 notation-less tracked names (a data task that would shrink ADD Unknown; separate from this presentation build).
- A stored `needs_authoring` flag in the generator (would remove the derivation; a generator change for later if the derived split proves insufficient).
