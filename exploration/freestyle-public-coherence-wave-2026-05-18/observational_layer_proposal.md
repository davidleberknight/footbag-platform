# Observational / un-curated tricks layer proposal

Phase B planning doc. Supersedes the earlier draft
`observational-uncurated-layer.md` (2026-05-18 v1) with concrete card
design + governance semantics + migration path.

## Purpose

Surface tricks that exist in the community vocabulary (PassBack /
FootbagMoves / Shred Global / Footbag Finland sources) AND can carry
a readable structural formula AND don't yet have curator-confirmed
canonical status. Make the gap between "we observe this name being
used" and "we curate this trick" visible, reversible, and promotion-
friendly.

## Distinct from existing observational surfaces

Three existing observational layers already ship:

1. **Topology view** (`?view=topology`) — observational symbolic-
   grammar groupings of canonical tricks. Already curated tricks
   re-bucketed by biomechanical similarity.
2. **Movement System view** (`?view=movement-system`) — observational
   pedagogical axis projection of canonical modifier slugs. Already
   curated.
3. **Trick-detail connective-tissue panels** — observational symbolic
   adjacency within canonical decomposition.

All three operate on the canonical set. The new layer proposes
extending observational treatment to TRICKS THEMSELVES that aren't
yet in `freestyle_tricks` (or that exist but lack curator-confirmed
status). This is structurally distinct from the existing three.

## Qualifying tricks (immediate audit)

Per memory entries + recent intake:

| Source | Candidate tricks | Status |
|---|---|---|
| PassBack dictionary intake (memory `project_passback_dictionary_intake`) | 282 staged rows: 94 matched / 187 new_candidate / 1 conflict | High volume; needs filtering |
| FootbagMoves federation (memory `project_freestyle_federation`) | Symbolic groupings + 11 movement archetypes | Layer-three observational already shipped |
| Shred Global (landing portal links exist) | Gallery exists; no per-trick observational entries | Untapped |
| Footbag Finland (landing portal links exist) | Gallery exists; no per-trick observational entries | Untapped |

**Initial pilot scope**: ~10-20 tricks with high name-frequency in the
PassBack intake + clear structural formulas + no Wave 2 dependency.

Examples (candidate-only, not committed):
- Some flying-X variants where the parser can construct a formula
- Specific compounds named in PassBack but not in freestyle_tricks
- Folk names with clean operator-base decomposition

## Card design

Observational-layer trick cards differ from canonical DictionaryTrickCard:

```
┌──────────────────────────────────────────────────────────┐
│ [Observational badge — small, top-right]                  │
│                                                            │
│ #folk-name-slug                                            │
│ ≡ proposed structural reading                              │
│ ≡ ADD formula (if known)                                   │
│ — ADD (pending canonicalization)                           │
│                                                            │
│ Source: PassBack dictionary / FootbagMoves / ...           │
│ Status: Pending curator review                             │
└──────────────────────────────────────────────────────────┘
```

Key visual distinctions from canonical cards:
- Top-right observational badge (same badge as
  `observational-uncurated-layer.md` v1 proposal — single label across
  symbolic-layer surfaces)
- Numeric ADD always em-dash with "pending canonicalization" footnote
- Source attribution line (which external source surfaced the trick)
- Status line (explicit "pending curator review")
- NO hashtag link (preserves the "#-tag implies canonical" contract)
- NO media-gallery integration (preserves curator-gated media guarantee)
- NO trick-detail page (links nowhere; surfaces only in the listing)

## Disclosure surface

A dedicated `/freestyle/observational` route (or section within
`/freestyle/tricks?view=observational`) renders the layer with:

- **Heading**: "Observed tricks (pending curator review)"
- **Framing paragraph**: explicit disclosure of observational status,
  non-canonical, source-attribution, governance pathway
- **Card grid**: observational cards in alphabetical or source order
- **Footnote**: link to the promotion-pathway doc and the curator
  review queue

## Governance semantics

### Forever-invariants

1. Observational entries NEVER appear in canonical surfaces (landing
   core tricks grid, ADD analysis worked examples, glossary §X term
   entries, trick-detail pages).
2. Observational entries NEVER get hashtag chips (the `#-tag`
   convention is canonical-only).
3. Observational entries NEVER get media attachments (curator-gated).
4. Observational entries NEVER appear in family/category/topology/
   movement-system views (those are canonical browse surfaces).
5. Promotion to canonical requires curator review + commit-time
   change (no auto-promotion via "this name appears N times in the
   corpus" — per memory `feedback_frequency_not_authority`).

### Reversible content storage

Observational entries live in a TypeScript content module
(`src/content/freestyleObservationalTricks.ts` or similar) — NOT in
the `freestyle_tricks` DB table. This preserves the canonical/
observational separation in the data layer.

The TypeScript module shape:

```typescript
interface ObservationalTrick {
  folkSlug:           string;   // 'some-folk-name'
  displayName:        string;   // 'Some Folk Name'
  proposedReadings:   string[]; // ≡ structural decompositions
  proposedAddFormula: string | null; // ADD derivation if known
  proposedAddTotal:   number | null; // pending canonicalization
  sourceLabel:        'passback' | 'footbagmoves' | 'shred-global' | 'footbag-finland' | 'other';
  sourceCitation:     string;   // free-form attribution
  status:             'pending-review' | 'pending-canonicalization' | 'rejected';
  curatorNote:        string | null;
  unresolvedBlockers: string[]; // ['Wave 2: barraging operator class', ...]
}
```

Adding/editing an entry is a single-file edit. Promotion to canonical
moves the row to `freestyle_tricks` via a curator-authored
`canonical_promotions.csv` (or similar pipeline step).

## Migration path: observational → canonical

```
1. PR adds observational entry to freestyleObservationalTricks.ts
   (or extends an existing entry with new readings/citations)
2. Entry appears on /freestyle/observational with badge + disclosures
3. Curator reviews; if ready for promotion:
   a. Add a row to inputs/curated/tricks/<folk-slug>.txt with the
      canonical name + ADD + family + base_trick
   b. Re-run loader to materialize the row in freestyle_tricks
   c. Remove the entry from freestyleObservationalTricks.ts
   d. Card disappears from /freestyle/observational and appears on
      /freestyle/tricks as a canonical card
4. If curator rejects: status changes to 'rejected'; entry stays in
   the TypeScript module with the rejection note, surfacing why on
   the page
```

This mirrors the curator-CSV-feeds-builder pattern established by
`overrides/person_aliases.csv` + `overrides/club_duplicates.csv`.

## Feasibility assessment

| Dimension | Verdict |
|---|---|
| Technical | Feasible — pure TypeScript content + a new page route |
| Doctrinal | Safe — preserves all four-layer invariants explicitly |
| Discoverability | Moderate — needs a landing entry point + cross-link from `/freestyle/tricks` |
| Curator burden | Low (single-file edits + promotion via existing CSV path) |
| User confusion risk | Manageable if badge + framing are consistent |

## Recommended next governance slice

Before implementing the observational layer surface:

1. **Curator audit of the 10-20 pilot candidates** from PassBack
   intake. Decide which qualify for the observational layer vs which
   should go straight through curator review.
2. **Locking the badge label** (per `observational-uncurated-layer.md`
   v1): "Symbolic groupings (observational)" vs "Observed (pending
   review)" — these are different surfaces and could use different
   labels.
3. **Promotion pathway doc** — short procedure for converting
   observational → canonical. Mirrors `runbooks/promote-curated-
   source.md` pattern.

After those three: a single implementation slice can ship the
`/freestyle/observational` route + the content module + 5-10 seed
entries.

## Doctrinal safety

- **Safe**: TypeScript content module, no schema changes, no DB
  writes, no Wave 2 commitments.
- **Care**: badge label consistency with the existing observational
  surfaces (topology / movement-system / connective-tissue panels).
- **Forever-invariants**: must hold (no canonical cross-contamination).

## Review approval

Approve the layer concept + card design + governance semantics.
Pre-implementation slices (curator audit → label lock → promotion doc
→ implementation) sequence approved or restructured as needed.
