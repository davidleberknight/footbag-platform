> **SUPERSEDED as doctrine by `freestyle/doctrine/POSITIONAL_IDENTITY.md`** (this contract note remains the dated history; the resolver implementation stays beside it).

# Configuration resolver — contract (2026-06-23)

The positional configuration resolver classifies a positional trick name by its
side-configuration (per POSITIONAL_IDENTITY_BY_CONFIGURATION.md). It is a pure,
read-only classifier: it never writes aliases or canonicals.

## Input
- a record/trick name carrying a positional qualifier (e.g. `Dyno (op)`)

## Output
- `base_canonical` — the qualifier-stripped base slug
- `qualifier` — `same` | `far`
- `component_count` — side-bearing components (dexes + catch) in the base notation
- `fixed_relationship` — true when the base has < 2 independently variable components
- `resolver_status` — one of the six below

## resolver_status values
- **SAFE_ALIAS** — resolves to the base. Autonomous only for single-component
  identities (component_count <= 1); multi-component requires a curated equivalence.
- **DISTINCT_VARIANT_CANDIDATE** — multi-component, unique target, new config not
  matching any existing canonical.
- **AMBIGUOUS_MULTI_COMPONENT** — multi-component, the qualifier has >= 2 candidate
  targets (target undetermined).
- **COLLISION** — derived config equals an existing different canonical (or the
  positional slug is already taken). Alias to that canonical, not the base.
- **NO_NOTATION** — base has no operational notation; cannot resolve.
- **NEEDS_CURATED_EQUIVALENCE** — fixed/redundant-looking multi-component config
  with no curated equivalence row; held until a curator asserts the equivalence.

## Invariant (regression guard)
SAFE_ALIAS is forbidden when `component_count > 1` unless an explicit curated
equivalence exists (a row in `freestyle_trick_aliases` mapping the positional slug
to the base). The resolver asserts this at runtime over every classified row and
over an autonomous-mode (`curated = {}`) pass; a violation raises immediately.
Curated equivalences are READ from the materialized `freestyle_trick_aliases`
(sourced from `trick_aliases.csv` + `red_additions`); the resolver never writes them.

## Source
`exploration/positional-evidence-audit-2026-06-23/resolver.py` (read-only).

> Skill placement: this contract and its invariant are now PROMOTED into the
> freestyle dictionary skill (`.claude/skills/footbag-freestyle-dictionary/SKILL.md`,
> section 3a "Positional identity by configuration"), so future contributors
> inherit the regression guard. This file remains the longer-form reference.
