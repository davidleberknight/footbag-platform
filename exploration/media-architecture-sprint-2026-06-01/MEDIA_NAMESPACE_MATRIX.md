# Media Namespace Matrix (Part 1 — taxonomy stabilization)

Formalizes the semantic tag taxonomy for curated `media_items`. The tag-shape contract is enforced by
`scripts/_trick_tag_invariant.py`: every tag is exactly one of (a) **utility** (`UTILITY_EXACT`),
(b) **domain-prefix** (`SEMANTIC_PREFIXES`, snake_case `x_`), or (c) a **trick-slug** (kebab-case
resolving to `freestyle_tricks.slug`). Every active item needs ≥1 *semantic* tag (slug or domain
prefix). This matrix classifies the namespaces against that contract and proposes the minimal
extension to close the residual QC gap.

## Status legend
- **Canonical** — a recognized, validated tag class with a defined role.
- **Gallery-only** — recognized, but its job is gallery membership / filtering, not semantics.
- **Metadata-field** — belongs in a sidecar/DB field, NOT a free tag.
- **Intentionally impossible** — must never validate as a free tag (a guardrail).

## The matrix

| Namespace | Status | Meaning | Validation rule | Public/UI implication | Examples |
|---|---|---|---|---|---|
| `#<trick-slug>` | **Canonical (semantic)** | the trick this media is *about* | must resolve to active/pending `freestyle_tricks.slug`; alias-only fails | drives trick-detail Reference Media + dictionary card media chip | `#mirage`, `#double-orbit` |
| `#freestyle`, `#trick` | Canonical (utility) | domain markers | exact-match utility; never semantic on their own | none (suppressed from display) | `#freestyle` |
| `#curated` | Canonical (utility, system) | curator-owned provenance marker (auto-prepended) | exact-match; never the only semantic tag | gates curator-owned surfaces | `#curated` |
| `#<source>` (e.g. `#tricks_of_the_trade`, `#passback_records`, `#footbag_org`, `#anz_trikz`, `#shred_global`, `#footbag_finland`, `#passback_tutorials`, `#chinlone`) | **Gallery-only (utility)** | the curated source / named-gallery membership | must be in `UTILITY_EXACT` (the 6-point registration); never a substitute for a slug | tag-AND gallery membership only | `#shred_global` |
| `#unavailable_embed` | Canonical (utility, status) | curator-applied "hide from media surfaces" | in `UTILITY_EXACT`; consumed by `db.ts` always-on exclusion | item suppressed everywhere | `#unavailable_embed` |
| `demo_` | Canonical (prefix) | a section/landing demonstration loop, not trick-tagged | `SEMANTIC_PREFIXES`; satisfies the semantic requirement | landing/section hero video | `#demo_freestyle`, `#demo_net` |
| `event_`, `player_`, `club_` | Canonical (prefix) | competition / person / club association | `SEMANTIC_PREFIXES` | event-footage + roster surfaces | `#event_2003_worlds`, `#player_…` |
| `fh_` | Canonical (prefix) | FH-system-owned content marker | `SEMANTIC_PREFIXES` | system/curator media | `#fh_…` |
| `set_` | Canonical (prefix) | set-system association | `SEMANTIC_PREFIXES`; aligns with the set encyclopedia | set-system media | `#set_pixie` |
| `by_` | Canonical (prefix) | uploader/avatar marker | `SEMANTIC_PREFIXES` | avatar/uploader identity (not public contributor names) | `#by_footbag_hacky` |
| **`concept_`** (proposed) | **Canonical (prefix) — NEW** | concept/educational media not about a single trick | add to `SEMANTIC_PREFIXES`; satisfies semantic requirement | concept-media galleries (see `CONCEPT_MEDIA_GOVERNANCE.md`) | `#concept_naming`, `#concept_learning`, `#concept_pixie_sets` |
| **`discipline_`** (proposed) | **Canonical (prefix) — NEW** | non-freestyle discipline media (net, chinlone, sideline) | add to `SEMANTIC_PREFIXES` | per-discipline galleries | `#discipline_chinlone`, `#discipline_net` |
| `family_` (candidate) | **Metadata-field, NOT a tag** | the trick's family | derived from `freestyle_tricks.trick_family`; do NOT free-tag | family-page grouping (service-derived) | — |
| `operator_` (candidate) | **Metadata / glossary, NOT a media tag** | operator/modifier reference | lives in operator content modules | operator pages | — |
| `source_` (candidate) | **Intentionally NOT a prefix** | source identity | sources are `UTILITY_EXACT` exact-words + `media_sources` rows, NOT a `source_` prefix | — | use `#shred_global`, not `#source_shred` |
| clip-type words (`#tutorial`, `#demo` bare, `#record`) | **Intentionally impossible** | clip kind | clip-type is staging-only / tier-derived; never a DB free tag | — | stripped on sight |
| descriptive words (`#beginner`, `#methodology`, `#ontology`, `#set-list`, `#net` bare) | **Intentionally impossible** | loose descriptors | not a taxonomy; strip or replace with a `concept_`/`discipline_` prefix | — | replaced |

## Canonical decisions

1. **Sources are exact-word utility tags, never a `source_` prefix.** Registration is the 6-point
   checklist (`feedback_curated_media_source_registration`). This keeps the source set closed and
   reviewed; a `source_` prefix would let any `#source_x` validate freely — rejected.
2. **Trick-slug is the only "about-a-trick" semantic.** Family/operator are *derived* (from the
   dictionary), never free media tags — that would duplicate ontology in the media layer and risk
   drift. `family_`/`operator_` stay metadata.
3. **Two new prefixes close the non-trick gap:** `concept_` (educational/meta media) and
   `discipline_` (non-freestyle disciplines). Both satisfy the "≥1 semantic tag" rule honestly,
   without pretending non-trick media is trick media. This resolves the residual 4 QC items.
4. **Clip-type stays out of tags forever.** `tutorial`/`demo`/`record` are tier semantics derived
   from `source_id` (`SOURCE_TIER`), not free tags. (P3a stripped the `#tutorial`/`#demo` leakage.)
5. **Loose descriptors are intentionally impossible** until/unless a curator defines a real taxonomy;
   then it becomes a prefix, not bare words.

## Validation-rule summary (what the invariant should keep enforcing)
- Free tags resolve to exactly one of: `UTILITY_EXACT` word · `SEMANTIC_PREFIXES` prefix · resolving
  trick-slug. Everything else fails — by design.
- New source → 6-point registration. New concept/discipline media → `concept_`/`discipline_` prefix.
- The guard test (`tests/unit/freestyleSourceTier.test.ts`) + `25_qc` keep the closed set honest.

## Open for curator ruling
- Adopt `concept_` + `discipline_` (recommended; closes QC to 0 honestly) vs. exempt non-trick media
  from the invariant (weaker gate) vs. retire the 4 items. See `CONCEPT_MEDIA_GOVERNANCE.md`.
- Exact `concept_*` / `discipline_*` slugs for the 4 residual items.
