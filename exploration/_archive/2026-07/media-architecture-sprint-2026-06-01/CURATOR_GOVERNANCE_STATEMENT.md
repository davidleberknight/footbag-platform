# Curator-Governance Statement — Media System (Part 6)

Concise governance contract for curated media. Anchored on the load-bearing principle: **media is a
teaching layer, not an ontology layer.**

## What `#curated` guarantees

`#curated` is the system marker (auto-prepended by the seeder; never hand-added) asserting:
1. The item entered through the **curator pipeline** — `snippet_candidates` → `promote` → sidecar →
   `seed_fh_curator`, or the file-paired sidecar path — never a raw `INSERT`.
2. It is **FH-system-owned** (the curator member), not member-uploaded gallery content.
3. It passed the **media-tag invariant** at seed/QC time (well-formed tags; a real semantic tag).

`#curated` does **NOT** guarantee: correctness of any structural/ontological claim (there are none in
media), that the trick's decomposition is settled, or that the clip is *the* best clip (that's the
separate `exemplar_of` judgment).

## What remains possible without `#curated`

Member-uploaded media (`media_items` without `#curated`) is a separate, parallel system — gallery
uploads, avatars — governed by member-upload rules, never merged with curated content. Curated and
member layers stay distinct (the GOVERNANCE layer-separation rule).

## Provenance vs public surfaces (the attribution firewall)

| Fact | Home | Public? |
|---|---|---|
| source identity | `media_sources` row + `#<source>` tag + `SOURCE_TIER` | yes — as a source label ("Tricks of the Trade") |
| original URL / re-host origin | `external_url` field | provenance link only |
| **contributor / performer name** | sidecar `creator` / provenance | **NO** — individuals are never named on freestyle public surfaces (`feedback_no_individual_names_freestyle_views`); the sole exception is Jobs notation |
| review state | `reviewer` (snippet) / sidecar | internal |

**Rule:** source attribution is public and preserved; *individual* attribution stays in provenance.
"FB.org-confirmed" is source attribution (keep); "by @PalomaFreestyle" is an individual name (provenance
only). This is why the footbag.org demos render with no contributor name and the PassBack demos used a
blank public `creator`.

## Source trust tiers

Source trust is encoded once, in three coordinated places (the 6-point registration,
`feedback_curated_media_source_registration`): `SOURCE_TIER` (render bucket), `TIER_BY_SOURCE`
(sidecar tier), `24_coverage` strength sets. Trust = "what role this source's clips can play"
(tutorial / demo / record), not "is this true." A demo-tier source is never auto-promoted to primary
over a tutorial; a record source is never instructional.

## Historical / archival material

- Archival re-hosts (footbag.org legacy `.mov`, future legacy footage) are **historical_reference**
  media — a separate pedagogy role and gallery node ("Historical archives"), never counted as current
  tutorial coverage.
- Re-hosting IFPA's own legacy video to the IFPA platform is in-scope; third-party material follows
  source-trust + attribution rules.
- Archival material is preserved *as it is* — its value is provenance of how the sport documented
  itself, not currency of technique.

## Conflicting historical decompositions

When an archival/concept clip presents a decomposition that **conflicts with canonical ontology**:
1. Ontology (the dictionary) wins for what the trick *is*.
2. The clip is **preserved and framed as a historical/community view**, not corrected or deleted —
   it is provenance of the community's evolving understanding.
3. The conflict is **never resolved in the media layer** — media records the view; only a curator/Red
   ruling changes ontology. Surface it as "historical reading," not as a competing canonical claim.

This is the media≠ontology firewall applied to history: media can hold contradictory readings without
the system asserting any of them as structural truth.

## Curator approval

- Curator approval = a non-empty `reviewer` on a snippet row (promotion gate) or curator authorship of
  a file-paired sidecar. Blank reviewer = staged-unapproved; the promote pipeline skips it.
- Approval attests **pedagogical fit + provenance + tag correctness**, not ontological truth.
- All curated writes go through the pipeline; never a manual `INSERT INTO media_items`.

## The one-line contract

> Curated media is a curator-vouched **teaching artifact** with honest source/tier/coverage
> classification and provenance-only individual attribution. It teaches and preserves; it never
> defines, ranks-as-fact, or settles doctrine. Ontology, glossary, and provenance are separate layers
> it links to but never overwrites.

## Open governance items (for curator sign-off)
- Adopt `concept_` / `discipline_` namespaces (closes QC; honest non-trick classification).
- Confirm the `exemplar_of` curator flag (so "best clip" is explicit, not inferred).
- Confirm "historical_reference" as the archival role (footbag.org re-hosts land there, not Tutorials).
