# Positional identity doctrine

How positional trick names (`same-side` / `near` / `far` / `opposite` / `ss` / `op`)
resolve to identities. Consolidates the identity-by-configuration doctrine, the
ratified positional-vocabulary mapping, the qualifier-targeting rule, and the
configuration-resolver contract. The originating notes remain in the frozen legacy
tree (`legacy_data/inputs/curated/tricks/POSITIONAL_IDENTITY_BY_CONFIGURATION.md`,
`RELATIVE_SIDE_RELATIONSHIPS.md`, `RELATIVE_SIDE_TARGETING_RULE.md`) and in
`exploration/positional-evidence-audit-2026-06-23/` (the foundations audit and the
resolver); each carries a pointer here.

## Core rule: identity is the side-configuration

Lexical normalization handles SPELLING only (abbreviation expansion, preferred
spelling). It never decides identity.

Positional qualifiers are STRUCTURAL, not lexical. They are never stripped from the
slug. A positional qualifier sets the side of one side-bearing component, so it can
change the trick's identity. A positional name resolves by its side-configuration —
the set of SAME/OP markers across its side-bearing components, i.e. its operational
notation:

- if the configuration equals the base trick's configuration → **alias of the base**;
- if it equals an existing canonical's configuration → **alias of that canonical**;
- if it is new and historically attested → **distinct canonical**;
- if it cannot be resolved → **held for review**.

Identity is the resolved configuration, never the spelling or the position of the
qualifier token in the string: `Far X`, `X (far)`, and `X-op` resolve identically.

This rule supersedes the earlier slug-normalization clause that deleted positional
qualifiers as non-identity. That clause was over-generalized from its one valid case:
on a base with a single independently variable side-bearing component, no positional
qualifier can change the configuration, so the slug collapses to the base — the
degenerate case of this rule, not a separate rule. App-side qualifier stripping was
removed accordingly; slug resolution preserves the qualifier, matching the loaders.

Scope: this doctrine governs identity only. It does not author tricks, set ADD, or
decide X-Dex scoring (a separate receiver-gated rule; see the independence section
below).

## The ratified vocabulary mapping

Curator-ratified (2026-07-02): the three positional vocabularies are one axis.

- FootbagMoves **"ss/os"** = PassBack **"near/far"** = platform **SAME/OP**.
- **Near = same-side**: the component is on the same side of the body as its
  reference component — the plant / set foot.
- **Far = opposite-side**: the component is on the opposite side from the reference
  component.

A side qualifier therefore describes the relationship between a side-bearing
component and its reference foot — never a left/right body position, a catch
surface, or a naming variant. The operational notation's per-component `SAME` / `OP`
marker already encodes exactly this relationship, so the notation layer is the
doctrine's implementation. The distinction is real even when ADD is equal: SAME and
OP forms of the same base are different executions.

Caution for the down/barfly lineage: PassBack's near/far there is bag-relative rather
than plant-relative, with a body-spin frame inversion — see `DOWN_FAMILY.md` for
that family's coordinate-frame decoding.

## Which component the qualifier targets

When a base has more than one side-bearing element, the qualifier modifies the
**unique off-side element** (the one element whose side differs from the qualifier):

- **Dex modify**: if exactly one dex is the unique off-side element, the qualifier
  modifies that dex (e.g. fairy-same-side-mirage flips the second dex to `SAME`
  while the catch stays `OP`).
- **Catch modify**: otherwise, if the catch is the unique off-side element, the
  qualifier modifies the catch (e.g. terraging-same-clipper vs
  terraging-opposite-clipper toggle only the terminal `CLIP`).

These are one rule ("modify the unique off-side element") applied to whichever
element type is uniquely off-side. No active example contradicts it.

**The distributive rule (curator-ratified) resolves the multi-off-side case.**
When a trick-level same-side (or far) qualifier has two or more candidate dex
targets, it binds distributively: it asserts the stated side for EVERY dex
component whose side relationship can vary, not for an arbitrarily selected
"base" dex. The catch keeps the existing rule (it changes only when it is the
unique off-side element). The unique-component rule above is the
single-variable case of this broader doctrine, so the two never conflict. A
qualifier whose asserted side already matches every side-bearing component is
redundant, and the ratification supplies the curated equivalence the
multi-component collapse requires: the qualified name resolves as an alias of
the plain form.

For compounds built from a settled OP-dex atom behind a SAME-side entry operator
(fairy / pixie / nuclear / sailing prefixes), the legover/pickup precedent applies:
when the dex and the catch sit on different sides, the qualifier targets the
**structural base dex**, not the prepended entry-operator dex and not the catch.

## OP, X-Dex, PDX, and cross-body are independent axes

- An `OP` (far) component does not by itself add ADD. X-Dex is a separate flag
  (`[XDEX]`), never implied by `OP`: it fires only when a far-form dex lands on an
  eligible rotating receiver, per the receiver-gated rule whose canonical home is
  `src/content/freestyleOperatorReference.ts`.
- `[PDX]` (the paradox-direction marker) is a third member of the per-dex side
  relationship, distinct from `SAME`/`OP` and from `[XDEX]`, and can coexist with
  both on one trick (sumo carries a `[PDX]` dex and a separate `OP IN [DEX] [XDEX]`
  dex). Paradox is the case where the side relationship switches, scored on its own
  terms.
- Cross-body and side are independent dimensions. `[XBD]` records a cross-body
  position or traversal and does not imply `OP`. The explicit `SAME` or `OP` token
  on the component determines its side relationship; both `SAME ... [XBD]` and
  `OP ... [XBD]` are valid.

## Identity rules in force

- **One-component alias.** On a base with at most one independently variable
  side-bearing component, a positional name is a lexical alias of the base (or,
  where it asserts a side the lone component cannot take, an ill-formed conflict
  held for review). This is the only alias the resolver may make autonomously.
- **Multi-component distinct.** A fixed relationship read from notation is
  INSUFFICIENT evidence for multi-component identity collapse — a "fixed"
  relationship can be a notation gap. A multi-component positional alias requires an
  explicit curated equivalence row (human-attested); absent one, the name is either
  a distinct-variant candidate (new, attested configuration) or held.
- **Never flatten historical names.** Historically attested positional forms are
  preserved: a resolved form becomes an alias or a distinct canonical, never a
  silent deletion, and derivable-but-unattested forms are not authored (evidence,
  not derivability, admits a row).

## The configuration resolver contract

The resolver is a pure, read-only classifier: it classifies a positional name by its
side-configuration and never writes aliases or canonicals. Inputs: a name carrying a
positional qualifier. Outputs: the qualifier-stripped base slug, the qualifier
(`same` | `far`), the side-bearing component count (dexes + catch), a
fixed-relationship flag, and exactly one status:

- **SAFE_ALIAS** — resolves to the base. Autonomous only for single-component
  identities (component_count <= 1); multi-component requires a curated equivalence.
- **DISTINCT_VARIANT_CANDIDATE** — multi-component, unique target, new configuration
  not matching any existing canonical.
- **AMBIGUOUS_MULTI_COMPONENT** — multi-component with two or more candidate targets
  for the qualifier.
- **COLLISION** — the derived configuration equals a different existing canonical
  (alias to that canonical, not the base), or the positional slug is already taken.
- **NO_NOTATION** — the base has no operational notation; cannot resolve.
- **NEEDS_CURATED_EQUIVALENCE** — a fixed/redundant-looking multi-component
  configuration with no curated equivalence row; held until a curator asserts the
  equivalence.

**Safety invariant (regression guard).** The resolver MUST NEVER emit SAFE_ALIAS
when component_count > 1 unless an explicit curated equivalence exists (a
`freestyle_trick_aliases` row mapping the positional slug to the base). It READS
curated equivalences from the materialized `freestyle_trick_aliases` (sourced from
`trick_aliases.csv` + `red_additions`); it never writes them, and it is
authoritative for classification only, never for automatic multi-component
collapsing. The reference implementation is
`exploration/positional-evidence-audit-2026-06-23/resolver.py`, and the contract is
also carried by the freestyle dictionary skill.

## Atom-level foundations

The foundational-bases audit (2026-06-23) settled the polarity of the four
single-dex atoms; the butterfly default has since been ruled, leaving two
genuinely unresolved atoms:

- **Settled — OP at the dex: mirage, whirl, legover, pickup.** Each has a single
  `OP` dex in notation, corroborated by corpus naming (the same-side form is the
  marked deviation). For these atoms `far-X` is an alias of the base and
  `X-same-side` is the distinct variant. legover and pickup are the precedent that
  the qualifier targets the dex, not the same-side catch.
- **Settled — butterfly defaults to the far / opposite side.** The published
  canonical form is the opposite-side execution (`SET > OP OUT [DEX] > OP CLIP
  [XBD] [DEL]`), superseding the side-either `SAME/OP` fold in the canonical row.
  The same-side execution is the marked distinct canonical
  (`butterfly_same_side`), so a `far-butterfly` name is an alias of the base and
  a same-side name resolves to the same-side canonical.
- **Open — clipper.** Clipper is a catch surface with no scored dex; a side word
  targets the `[XBD]` catch itself. Whether cross-body `[XBD]` inherently encodes OP
  (making `same-side-clipper` the marked distinct and `far-clipper` redundant), or
  the cross-body axis is independent of the SAME/OP axis, is unruled. Evidence from
  the ratified clipper-terminal matrix: the `[XBD]` bracket is written on both
  sides — whirl and reverse whirl terminate `OP CLIP [XBD] [DEL]` while swirl and
  reverse swirl terminate `SAME CLIP [XBD] [DEL]` — so the built canon writes side
  independently of the cross-body flag. The matrix is evidence for the
  independent-axes reading, not the ruling itself, which stays with Red.
- **Open — osis.** Two compounding ambiguities (back-or-front spin plus an ambiguous
  `SAME/OP` catch) mean polarity cannot fix the side; osis needs a ruling tying spin
  direction to catch side before any `*-osis` side qualifier resolves.

The per-row remainders held on these open atoms (the ambiguous multi-component
same-side records and the no-notation row) live on the positional curator worklist
at `exploration/positional-evidence-audit-2026-06-23/CURATOR_WORKLIST.md`.
