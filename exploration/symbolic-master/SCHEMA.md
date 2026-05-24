# Part B — Master Schema (2026-05-24)

Column-by-column definition for `symbolic_trick_master_YYYY-MM-DD.csv`. Multi-notation review surface. One row per trick-like entity.

## Identity

| Column | Type | Notes |
|---|---|---|
| `slug` | str | Canonical kebab-case identifier. For Stanford-only rows, derived from `slugify(trick_name)`. |
| `canonical_name` | str | Canonical lowercase display name with spaces. |
| `display_name` | str | Currently same as canonical; reserved for human-readable variants. |
| `hashtag` | str | `#slug_with_underscores` form. |

## Publication

| Column | Type | Values |
|---|---|---|
| `publication_status` | enum | `canonical` / `demoted_inactive` / `stanford_only_unpublished` |
| `first_class_tier` | enum / blank | `tier-1` / `tier-2` / blank when not first-class |
| `promotion_readiness` | enum (reserved) | future field for triage rounds |

## Movement ontology

| Column | Type | Notes |
|---|---|---|
| `family` | str | `freestyle_tricks.trick_family` value |
| `base_trick` | str | `freestyle_tricks.base_trick` |
| `modifiers` | str (pipe-delimited) | Reserved; future field for `modifier_links` decomposition |
| `topology_tags` | str (reserved) | future cross-axis movement-neighborhood tags |
| `movement_system` | str (reserved) | future top-level movement-system grouping |

## Primary notation

| Column | Type | Notes |
|---|---|---|
| `notation_primary` | str | The most-visible notation string on the trick's canonical card. Drawn from `operational_notation` if populated, else from compact `notation`. |
| `notation_primary_system` | enum | `job_bracket` / `fm_parens` / `plain_self_token` / `stanford_shorthand` / `mixed` / `missing` |

## Job / operational

| Column | Type | Notes |
|---|---|---|
| `operational_notation` | str | The DB `operational_notation` column verbatim. |
| `operational_notation_source` | str | DB `operational_notation_source` column (free-text provenance). |
| `operational_notation_convention` | enum | `canonical_bracket` / `fm_parens` — derived from the string's punctuation per the dual-convention rule. |

## Stanford shorthand

| Column | Type | Notes |
|---|---|---|
| `stanford_symbolic` | str | The shorthand string verbatim from `stanford-2.txt`. |
| `stanford_symbolic_normalized` | str | Whitespace-stripped form for stable matching. |
| `stanford_components` | JSON list | Token labels in source order under the Stanford token map. `unknown:<c>` for unmapped characters. |
| `stanford_parseable` | bool | `true` when no token is `unknown:*`. |
| `stanford_family_pattern` | str (reserved) | Future field — for the set-pattern cluster (e.g. `X-1.` family). |
| `stanford_generation_rule` | str (reserved) | Future field — for explicit generation-template authoring. |
| `stanford_notes` | str (reserved) | Future curator notes. |

## Scoring

| Column | Type | Notes |
|---|---|---|
| `official_add` | int / blank | The canonical published ADD. |
| `add_formula_primary` | str | Reserved — the primary derivation string the curator chose to publish. |
| `add_formula_convention` | enum (reserved) | `structural_bracket` / `dex_count_fm` / `modifier_stack` |
| `source_add_claim` | str | Numeric ADD claim from an external source. Stanford rows carry their ADD-bucket header here. |
| `source_add_system` | str | `stanford` / `passback` / `footbagmoves` etc. |
| `doctrine_divergence_category` | str (reserved) | `historical-divergence` / `wave-2-pending` / `composite-modifier` etc., from `DOCTRINE_DIVERGENCE_REGISTRY` |

## Source lineage

| Column | Type | Notes |
|---|---|---|
| `source_primary` | str | `canonical_db` / `stanford` |
| `source_refs` | str | Pipe-separated list of source-file paths or DB references. |
| `source_formula_raw` | str (reserved) | The verbatim formula from the primary source. |
| `source_description_raw` | str (reserved) | Verbatim source description if archived. |

## Quality

| Column | Type | Notes |
|---|---|---|
| `parser_status` | enum (reserved) | Result of feeding `notation_primary` to the parser. |
| `shorthand_status` | enum | `stanford_canonical_match` / `stanford_unparsed_match` / `stanford_only` / `stanford_only_unparsed` / `no_stanford_equivalent` |
| `unsupported_tokens` | str (reserved) | Future field — list of any Stanford tokens not in the dictionary. |
| `notation_gap` | enum | `no-job-no-stanford` / `no-job-stanford-only` / `no-stanford` / blank |
| `blocker_notes` | str (reserved) | Curator-internal notes on promotion blockers. |
| `curator_notes` | str | Free-text per-row curator note. |

## Schema philosophy

- **Multi-system honesty.** A row can carry both `operational_notation` (canonical) and `stanford_symbolic` (Stanford) simultaneously. The two never overwrite each other; each system's claim is preserved.
- **Provenance over elegance.** A row that comes only from Stanford has `source_primary=stanford`, `publication_status=stanford_only_unpublished`. No silent canonicalization.
- **Reserved fields are explicit.** Columns marked "reserved" exist in the header so downstream curator scripts can fill them without schema migration. Empty for now.
- **Doctrine fields are descriptive.** `doctrine_divergence_category` describes the kind of disagreement; it does NOT resolve it.

## Why not a Postgres / SQL schema yet

Per the slice brief: this is a review artifact, not a DB migration. The CSV is curator-friendly (opens in Excel / LibreOffice / Google Sheets) and Git-friendly (line-based diffs). When the schema stabilizes and the curator decides which subset of columns to land, the natural next step is a structured DB table — not yet.
