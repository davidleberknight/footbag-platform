# Concept-Media Governance (Part 3)

The QC cleanup surfaced a real category: **some curated media is not about a trick.** It teaches a
*concept* — naming conventions, movement language, learning methodology, set lists, decomposition
philosophy. The residual QC items are exactly these: `freestyle-trick-naming` ("How to Identify &
Name Freestyle Footbag Tricks"), `footbag-trick-learning` ("How to Learn a Footbag Trick"),
`pixie-set-list` ("the set list"), plus the chinlone discipline demo (a separate case, see end).

## Definition

**Concept media** = curated instructional media whose subject is a *concept, method, or vocabulary*,
not a specific trick. It has no single `freestyle_tricks.slug` because it is not about one trick —
that absence is correct, not a tagging gap.

Distinguish three sibling kinds (all pedagogy-layer, none ontology):

| Kind | Subject | Has a trick slug? | Example |
|---|---|---|---|
| **Trick media** | one trick | yes (`#<slug>`) | TT "Forehead Stall" |
| **Set-system media** | a set/launch family | `#set_*` (+ slugs if it demos specific tricks) | a pixie set-list walk-through |
| **Concept media** | a method/vocabulary/philosophy | no slug — `#concept_*` | "How to name tricks" |

## Tagging

- Concept media carries a **`#concept_<topic>`** domain-prefix tag (new prefix; see
  `MEDIA_NAMESPACE_MATRIX.md`) as its semantic tag, plus its source tag (e.g. `#passback_tutorials`)
  and `#curated`/`#freestyle`.
- **Strip the loose descriptors** that currently fail QC (`#tutorial`, `#methodology`, `#beginner`,
  `#ontology`, `#set-list`) — they are not a taxonomy. Fold their meaning into the `concept_` slug:
  - `freestyle-trick-naming` → `#concept_naming`
  - `footbag-trick-learning` → `#concept_learning`
  - `pixie-set-list` → `#concept_pixie_sets` (or `#set_pixie` if it's primarily a set reference — curator call)
- A concept clip MUST NOT carry a `#<trick-slug>` unless it genuinely demonstrates that trick
  (mentioning a trick ≠ being about it) — this preserves direct-coverage honesty (see
  `COVERAGE_SEMANTICS.md`).

## Surfacing

- Concept media gets its **own gallery node** — Freestyle › Concept media, and a cross-domain
  Educational systems node (`GALLERY_IA_PROPOSAL.md`). It is *adjacent to* trick tutorials, not mixed
  into them: a learner browsing "Tutorials" wants per-trick how-tos; concept media answers "how the
  vocabulary/method works."
- Concept media **does not appear in trick-detail Reference Media** (it has no slug), and **must not
  count toward any trick's direct coverage** — it has no trick to cover.
- It MAY be cross-linked from the glossary (a naming-conventions video next to the naming glossary
  entry) — a *link*, not a merge.

## Concept media vs glossary content (the firewall)

| | Concept media | Glossary |
|---|---|---|
| form | curated *video/asset* in `media_items` | curator-authored *prose* on `/freestyle/glossary` |
| authority | pedagogy layer (a teaching artifact) | pedagogy layer (the definitional text) |
| relationship | concept media *illustrates* glossary concepts; glossary *defines* them | — |

They link, never merge. A concept video about naming is media; the glossary's naming section is the
canonical text. Neither is ontology.

## Concept media vs ontology/doctrine (the hard line)

Concept media is the **most dangerous** media kind for the media≠ontology firewall, because its
subject (naming, decomposition philosophy) *sounds* ontological. Rules:
- A concept video presenting a decomposition is a **teaching artifact about how the community talks**,
  never a structural ruling. It cannot promote a trick, set an ADD, or settle a folk-name.
- If a concept video's content conflicts with canonical ontology, the *ontology* wins; the video is
  preserved as provenance of the community view, framed as such (see `CURATOR_GOVERNANCE_STATEMENT.md`
  on conflicting historical decompositions).
- Concept media is explicitly **out of scope for Red Wave 2** — it advances independently of doctrine.

## Relationship to progression systems
Concept media is the connective tissue of learning paths (`PROGRESSION_MODELING_MEMO.md`): a "how to
learn" video is the *entry node* of a progression, not a step in it. Progressions sequence trick media;
concept media frames the sequence.

## The chinlone case (NOT concept media)
`chilone.mp4` ("Chinlone in Myanmar") is a **different discipline**, not concept media — it carries
`#discipline_chinlone`, lives under its own discipline node (not Freestyle), and is governed like Net
/ Sideline media, not like a freestyle concept video.

## Proposed resolution of the 4 residual QC items
Adopt `concept_` (+ `discipline_` for chinlone), retag the 4, strip the loose descriptors → QC to 0,
honestly. Curator call on the exact `concept_*` slugs and whether `pixie-set-list` is `concept_` or
`set_`.
