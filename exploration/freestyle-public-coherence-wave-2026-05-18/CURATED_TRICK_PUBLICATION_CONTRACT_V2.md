# Curated Trick Publication Contract V2

Extends `docs/CANONICAL_TRICK_PUBLICATION_CONTRACT.md` (V1, 2026-05-13).
V1 stays in force as the authority for the six core publication
requirements; V2 adds three additional invariants required before
observational-layer rollout and broader external-source intake.

**Status: proposal.** This document lives in `exploration/` per the
audit-scope convention (`docs/` is Dave-coordinated). Promotion to
`docs/` requires explicit consent.

## V1 baseline (preserved verbatim from V1)

1. **Symbolic representation** — at least one of: curator-authored
   notation / equivalence reading / structural-base rendering /
   explicit pending-curation state.
2. **Structural composition** — exposes core/base relationship OR
   explicit irreducible-core status.
3. **Discoverability across domains** — appears in multiple semantic
   browse surfaces (family / component / topology / ADD / glossary /
   media / equivalence chains).
4. **Alias / equivalence governance** — known aliases mapped,
   classified, rejected, or deferred; never silently ignored.
5. **Honest incompleteness** — missing decomposition is a curation
   gap, not proof of atomicity; pending states render honestly.
6. **No fabricated structure** — no inferred decomposition, no
   auto-generated chains, no fabricated operator lineage; curator
   authority primary.

## V2 additions

### 7. Detail-page-as-superset invariant

**Rule:** Every trick-detail page (`/freestyle/tricks/:slug`) must be
a **superset** of every card surface that references the trick. Card
surfaces must never contradict the detail page.

**Why:** Cards exist across multiple browse surfaces (ADD view, family
view, movement-system view, topology view, related-tricks panels,
landing-page surfaces, search results, detail-page sidebars,
combo-analysis references). When a card shows information the detail
page lacks, users hit a discoverability dead-end. When a card
contradicts the detail page, the trick's canonical identity becomes
ambiguous.

**How to apply:**

- If a card surface adds a field (formula chip, ADD value, media
  indicator, family chip, etc.), the detail page MUST carry the same
  field with the same value.
- If a card surface omits a field that the detail page carries
  (intentional simplification), that's OK — supersets allow omission.
- Card / detail divergence is acceptable ONLY when documented as an
  intentional render-mode distinction (see V2 invariant 9 below).

### 8. TrickSlug / TrickCard identity consistency invariant

**Rule:** A curated trick's identity rendering must remain structurally
consistent across all public surfaces. The invariant applies to the
**identity layer** only; the **context layer** is explicitly free to
vary by surface.

**Identity layer (must be consistent):** canonical title, slug, ADD,
formula / symbolic chain, hashtag identity, aliases, family placement,
discrepancy status, media indicators.

**Context layer (may vary intentionally):** card density (compact vs
expanded), prose density, truncation, surrounding educational framing,
CTA layout, mobile formatting, contextual chips. Differences along the
context layer are NOT drift — they are surface-appropriate adaptation
of identity-layer truth.

See `trickslug_identity_invariant.md` for the full two-layer model + a
"would a reader be confused" test for distinguishing the two.

**Why:** The same trick currently renders across at least ten distinct
surfaces:

- ADD view (default `/freestyle/tricks`)
- Family view (`?view=family`)
- Movement System view (`?view=movement-system`)
- Topology view (`?view=topology`)
- Category view (`?view=category`)
- Related-tricks panels (on trick-detail pages)
- Landing-page surfaces (`/freestyle` Core Tricks grid, demonstrations)
- Search results (when search lands)
- Detail-page sidebars (e.g., parallels, next/previous, family)
- Combo-analysis references (`/freestyle/combo-analysis`)

The DictionaryTrickCard partial (`dictionary-trick-card.hbs`)
implements a two-mode density system (registry / browse) that shares
the same canonical field order documented in
`docs/PRESENTATION_OBJECT_HIERARCHY.md`:

```
1. title
2. formula
3. ADD chip
4. media chip
5. status badge
6. placeholder note
```

V2 codifies that field order + the canonical identity components as
an invariant: any new surface rendering a curated trick must consume
the DictionaryTrickCard partial OR the CORE_TRICK_SPEC partial, not
hand-roll its own card markup. Exceptions (e.g., the landing core-
tricks grid, which uses a distinct compact partial) must be
documented as intentional render-mode distinctions.

**How to apply:**

- Trick title (canonical name) — same string everywhere.
- Trick href — `/freestyle/tricks/{slug}`; consistent slug.
- ADD value — same value everywhere it appears; when pending, em-
  dash + explicit pending-marker class.
- Formula / structural reading — when shown, derived from the same
  shaping helper; surfaces that don't show formula must not show a
  contradictory reading.
- Hashtag — when shown, same canonical hashtag.

### 9. Render-mode register

**Rule:** When a card surface deliberately renders differently from
the canonical DictionaryTrickCard (e.g., the landing Core Tricks grid,
which uses the symbolic-object compact pattern), the difference must
be registered as an intentional render mode in the contract — not
emerge accidentally from surface drift.

**Registered render modes (initial):**

| Mode | Partial | Used by | Rationale |
|---|---|---|---|
| `registry` | `dictionary-trick-card.hbs` (registry density) | ADD view + family view + category view + topology view + component view (legacy) + movement-system view | High-density scan-oriented row |
| `browse` | `dictionary-trick-card.hbs` (browse density) | Sets view (legacy alias for component) | Vertical-stack default density |
| `core-atom-symbolic` | `core-tricks-grid.hbs` | Landing Core Tricks grid + glossary §10 foundational grid | Symbolic-object compact pattern for the 12 atoms |
| `trick-shell` | `trick-shell.hbs` (with sub-partials) | Trick-detail page `/freestyle/tricks/:slug` | Full superset — V2 invariant 7 anchor |

New surfaces must use one of these registered modes OR add a new mode
to this register (with rationale). Hand-rolled markup for trick
identity is forbidden.

## Field requirements after V2 (minimum acceptable curated trick)

A curated trick must satisfy:

| # | Field / property | Requirement | V1 / V2 origin |
|---|---|---|---|
| 1 | `slug` | non-empty; URL-safe | implicit V1 |
| 2 | `canonical_name` | non-empty | implicit V1 |
| 3 | `adds` (or explicit unrated) | numeric OR explicit "unrated" / pending state | V1 §1 / §5 |
| 4 | `base_trick` OR `is_core=1` | one or the other (not both NULL) | V1 §2 |
| 5 | `trick_family` | one of: own slug (for core atoms) / a base trick slug | V1 §3 |
| 6 | Notation OR equivalence OR core-atom marker | at least one of `notation`, `operational_notation`, a curator-authored equivalence reading, or `is_core=1` | V1 §1 |
| 7 | Hashtag tag identity | one canonical hashtag mapped via `freestyle_trick_tags` (or whatever the bidirectional-tag layer requires) | V2 invariant 8 |
| 8 | Trick-detail page renders | `/freestyle/tricks/:slug` returns 200 + the trick-shell template | V2 invariant 7 |
| 9 | Detail-page parity | every field shown on any card surface for this trick also appears on the detail page | V2 invariant 7 |
| 10 | Browse discoverability | trick appears in at least ADD view + at least one of family / movement-system / category | V1 §3 |
| 11 | Render-mode consumption | every surface that renders this trick consumes a registered render mode | V2 invariant 9 |
| 12 | Alias governance | each alias mapped to canonical (matched / rejected / deferred); no silent aliases | V1 §4 |

## Promotion gate

Before any new trick joins the curated set OR before the observational
layer rolls out, this contract is the gate. Tricks that fail any V1 or
V2 requirement must be either:

- Held in observational layer (clearly badged, not promoted)
- Marked explicitly pending with the relevant gap-classification (see
  `formula_gap_classification.csv`)
- Rejected

Silent admission is forbidden (V1 §6 + V2 invariants 7-9 reinforce).
