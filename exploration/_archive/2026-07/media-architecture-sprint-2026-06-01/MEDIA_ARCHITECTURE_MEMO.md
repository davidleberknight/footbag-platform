# Media Architecture Memo (2026-06-01)

Umbrella for the post-QC / pre–Red-Wave-2 media stabilization sprint. Design and governance only —
no UI, schema, doctrine, parser, or promotions. Builds on `exploration/freestyle-media-ingestion-2026-05-29/ARCHITECTURE.md`
(§3a indirect coverage), `media-relationship-layer-2026-05-31/MEDIA_RELATIONSHIP_LAYER_PLAN.md`, and
`media-stabilization-2026-05-29/MEMO.md`.

## Where the system is (the premise)

Ingestion mechanics are solved: unified `media_items` + `media_tags` graph; URL-ref path
(YouTube/Vimeo) and file-paired S3 re-host path both proven; footbag.org archival demo path proven;
direct-vs-embedded coverage split established; the media-tag QC gate is at 4/201 (down from 66), with
the residual 4 being non-trick media awaiting a namespace decision. The frontier is now **semantic,
organizational, and pedagogical**, not mechanical.

## The load-bearing invariant: four separated layers

Media work must never collapse these. They may *link*; they must not *merge*.

| Layer | What it asserts | Home | Authority |
|---|---|---|---|
| **Ontology** | what a trick *is* — canonical name, ADD, family, structural decomposition | `freestyle_tricks`, content modules | curator / Red |
| **Pedagogy / media** | what *teaches or shows* a trick — clips, tutorials, demos, concept videos | `media_items` + `media_tags` + galleries | curator (James track) |
| **Glossary** | how concepts are *explained* — prose, definitions, feel | `/freestyle/glossary` | curator |
| **Provenance** | *where it came from* and *who vouched* — source, contributor, review state | `media_sources`, sidecar fields, `external_url` | curator |

**Forever-principle (carried from `project_freestyle_media_ingestion`): media is a teaching layer, not
an ontology layer.** A clip teaching a trick is a pedagogical fact; it is never a structural claim and
never settles doctrine. The embedded-coverage firewall (`freestyleEmbeddedCoverage.ts`: "an embedded
edge is a PEDAGOGICAL fact… never a STRUCTURAL claim") is the canonical expression of this and the
template for all future media-relationship vocabulary.

## What this sprint stabilizes (and the 6 companion docs)

1. **Semantic taxonomy** → `MEDIA_NAMESPACE_MATRIX.md` — which tag namespaces are canonical,
   gallery-only, metadata, or intentionally impossible.
2. **Gallery IA** → `GALLERY_IA_PROPOSAL.md` — the multi-domain (Freestyle/Net/Sideline/Events/…)
   hierarchy the current source-galleries grow into.
3. **Concept media** → `CONCEPT_MEDIA_GOVERNANCE.md` — formalizing media that is *not about a trick*.
4. **Coverage semantics** → `COVERAGE_SEMANTICS.md` — direct vs embedded, honesty rules, future
   relationship vocabulary.
5. **Progression modeling** → `PROGRESSION_MODELING_MEMO.md` — how media expresses learning paths.
6. **Curator governance** → `CURATOR_GOVERNANCE_STATEMENT.md` — what `#curated` guarantees, provenance,
   attribution.

## Design constraints (held across all six)

- No Red Wave 2 doctrine; no parser/notation change; no trick promotions; no schema rewrite unless
  strictly necessary; no blind semantic whitelisting.
- Preserve ontology / pedagogy / media / provenance separation.
- Prefer reversible content modules (TS/CSV) over SQL taxonomy migrations while doctrine is pending
  (`feedback_reversible_content_governance`).
- Public surfaces never name individuals (`feedback_no_individual_names_freestyle_views`);
  contributor attribution lives in provenance only.
- Gallery rows are Dave's track / admin-UI-created; this sprint stops at architecture + tag/namespace
  governance, not gallery JSON authoring (`feedback_gallery_dave_track`).

## North star

A multi-domain IFPA media system where every clip is honestly classified (what it teaches, from what
source, at what tier), galleries are browseable by both domain and pedagogy, coverage metrics never
overstate, and not one media artifact pretends to settle ontology — ready to expand cleanly after Red
Wave 2 rules, without re-architecting.
