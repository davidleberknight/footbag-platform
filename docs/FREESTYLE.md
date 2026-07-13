# FREESTYLE.md - the freestyle maintainer guide

The single orientation document for a maintainer of the freestyle subsystem. It
describes what the area is, who owns each fact, and how to change it safely after
go-live, when the live production database is the source of truth. It states
durable intent only; for operational commands it links out rather than copying.

Audience: a maintainer who is not the original author and starts from zero,
working against the live production database. The committed CSV pipeline is a
pre-go-live and local-development tool; this document says where that line falls
for every mechanism it describes.

## 1. Orientation

Freestyle is the footbag-freestyle dictionary and its surrounding surfaces. The
pieces:

- **Public reader surfaces.** The trick index and per-trick detail pages, the
  family pages, the set encyclopedia, the operators and per-modifier pages, the
  glossary, the learn path, freestyle search, the world-records and
  consecutive-kicks records pages, and curated media. These are read-only
  projections of the dictionary tables, shaped by `src/services/freestyleService.ts`
  and its helpers.
- **The dictionary tables.** Ten `freestyle_*` tables plus six `symbolic_*` tables
  hold the trick corpus, its provenance and aliases, the modifier registry, the
  records, the community tips, and the observational symbolic-grammar layer. See
  section 3.
- **The doctrine record.** `freestyle/doctrine/` holds the standing rulings that
  govern classification, scoring, and naming. See section 6.
- **The code-side authority modules.** `src/content/freestyle*.ts` carry the
  content that is deliberately code-managed rather than database-managed: the
  operator reference (the ADD and structure authority), the family tiers, the
  observational universe, and the symbolic panels. See sections 2 and 4.
- **The curated media lane.** A separate system from the dictionary, governed by
  the curated-media skill; it attaches reference videos to tricks. Never merged
  with the dictionary tables.
- **The retired build pipeline.** `freestyle/` holds the loaders that rebuilt the
  dictionary from committed CSVs before cutover. After cutover it is a
  local-development tool only. See sections 5 and the `freestyle/README.md`
  runbook.

## 2. Post-cutover authority boundaries

After cutover the live production database is the single source of truth for
freestyle content, and every content edit happens in the running application
through the audited admin surfaces. The destructive CSV rebuild is refused on a
cutover-marked host and is never a production maintenance path. The operational
statement of this, and the deploy, backup, and rollback mechanics behind it, are
owned by `docs/DEVOPS_GUIDE.md` section 15.6 (freestyle content source of truth);
this guide points there and does not restate it.

Not everything is database-owned. Freestyle content falls into five authority
tiers, and knowing which tier a datum sits in is the whole of making a safe edit:

1. **Live-database-owned curation.** Everything a curator edits in the running
   app: trick scalar and editorial-prose fields, aliases, source links, modifier
   links, records, consecutive-kicks records, trick tips, and provenance-source
   rows. Section 4 lists the surface for each.
2. **Code-managed doctrine and operator authority.** `freestyleOperatorReference.ts`
   is the single authority for every operator's ADD value, structure, and X-Dex
   behavior; the database modifier registry is a secondary data-side mirror that
   must stay consistent with it. Changing an operator is a code change plus a
   reviewed data change, never an in-app edit. Doctrine rulings live in
   `freestyle/doctrine/` (section 6).
3. **Generated or spreadsheet-owned symbolic research.** The six `symbolic_*`
   tables load from committed spreadsheets under `freestyle/symbolic_grammar/`;
   the group-membership layer is machine-generated and the rest are curator
   research artifacts. The spreadsheets stay authoritative; the database is a
   rendered copy; their loader must not run inside a general live rebuild.
4. **Sealed provenance inputs.** `freestyle/inputs/footbag_org_moves_metadata.ndjson`
   is a sealed, immutable archive artifact preserved for provenance and as a
   future description-upgrade source. No loader consumes it.
5. **Public generated content with regeneration guards.** The observational
   universe and tracked-names content modules are generated from the corpus and
   gated at request time; a committed-content drift guard fails the build if the
   generated files fall out of date. Regenerate them, never hand-edit.

The single-authority rule (tier 2), the alias and slug identity rules, and the
surface-propagation-by-pointer rule are the invariants every curation edit must
respect. Where a source appears to contradict another, resolve it through the
authority order in the root `CLAUDE.md`.

## 3. The data model (table level)

Column-level detail lives in the inline comments in `database/schema.sql`; this
section is the table-level home that `docs/DATA_MODEL.md` points to. Sixteen
tables are freestyle-owned: ten `freestyle_*` and six `symbolic_*`.

- **`freestyle_tricks`** - the trick corpus. Load-bearing columns: `adds` (the ADD
  value; may be numeric, blank, or the literal `modifier`), `review_status` and
  `is_active` (only `is_active = 1` rows render publicly), `trick_family`,
  `base_trick`, `category`, the editorial-prose fields, and the structural-parse
  columns (`structural_parse_json`, `computed_adds`, `add_formula_status`)
  populated by the notation parser.
- **`freestyle_trick_aliases`** - first-class aliases. `alias_type` is one of the
  documented semantic classes; `alias_display` gates public "Also called" display
  while search and redirect resolve any alias regardless of the gate.
- **`freestyle_trick_sources`** and **`freestyle_trick_source_links`** - the
  provenance registry and its many-to-many trick-to-source links, which preserve
  per-source assertions that may diverge from canonical.
- **`freestyle_trick_modifiers`** and **`freestyle_trick_modifier_links`** - the
  operator/modifier registry (the data-side mirror of the operator reference) and
  its per-trick apply-ordered links.
- **`freestyle_trick_relations`** - a stored relations table, empty by design;
  relations are derived, not stored (section 4).
- **`freestyle_trick_tips`** - imported community advice. `status` is one of
  `published`, `hidden`, or the granular unresolved buckets
  (`unresolved_freestyle`, `unresolved_frontier`, `unresolved_ambiguous`,
  `future_net`); only `published` tips on an active trick render publicly.
- **`freestyle_records`** and **`consecutive_kicks_records`** - the world-record
  and consecutive-kicks corpora, with confidence and superseded-by state.
- **The six `symbolic_*` tables** - `symbolic_equivalence_clusters`,
  `symbolic_group_membership`, `symbolic_movement_archetypes`,
  `symbolic_topology_groups`, `symbolic_modifier_groups`, and
  `symbolic_glossary_crosslinks`. The observational symbolic-grammar layer; a
  public research overlay, never the canonical family classification.

## 4. In-app curation surfaces and the code-managed exceptions

Every built curation surface writes through a prepared statement in one
transaction with one audit entry, behind the admin gate and the pre-go-live
persona guard. There are no unspecified "not yet built" curator surfaces: every
freestyle content type either has a working in-app path or is a deliberately ruled
exception below.

**Built, audited in-app paths:**

- Trick scalar fields and the seven editorial-prose fields: the admin trick edit
  page.
- Aliases (add and remove): the admin trick edit page.
- Source links (attach and detach): the admin trick edit page.
- Modifier links (attach and detach): the admin trick edit page.
- World records (create and edit): the admin records surface.
- Consecutive-kicks records (create and edit): the admin consecutive-records
  surface.
- Trick tips (edit text, hide, restore, remap to an active canonical trick): the
  admin tips index at `/admin/freestyle/tips`. Hide and restore toggle only
  published and hidden; the import's unresolved buckets are never flattened.
- Provenance-source rows (create): the admin dictionary-provenance registry at
  `/admin/freestyle/sources`. Distinct from the media-source registry.

**Deliberately ruled exceptions (no in-app editor by design):**

- **Modifier-registry creation is authority-blocked and code-managed.** A new
  modifier is published through the operator reference plus the modifier seed, not
  an in-app create, because creating one publishes its ADD to public surfaces and
  the database registry is secondary to the curator-locked operator reference. An
  in-app creator is possible only once the operator authority exposes a complete
  machine-readable contract for every modifier.
- **Trick relations are derived and read-only.** No editor exists; the stored
  `freestyle_trick_relations` table is empty by design and is not an incomplete
  surface. A relation editor is built only on a demonstrated curator-authored
  relation the derivation cannot represent.
- **The six symbolic layers are generated, doctrine-blocked, or code-managed.**
  Group membership is generated from mechanical sources; equivalence clusters are
  doctrine-blocked; movement archetypes, topology groups, modifier groups, and
  glossary crosslinks are intentionally code-managed. The committed spreadsheets
  stay authoritative; there is no in-app editor.

## 5. Pre-go-live CSV provenance (history, not the current edit model)

This section is historical. Before cutover the committed CSVs under
`freestyle/inputs/` were the source of truth: they were hand-edited and loaded by
the disposable rebuild, with git as the audit trail. The input classes and what
each owned:

- The base-dictionary tricks, modifiers, and aliases CSVs (the curated-v1
  foundation).
- The alias additions and override CSVs.
- The curated expert-review addition and correction overlays.
- The records masters.
- The footbag.org moves snapshot and the imported member tips.
- The `symbolic_grammar` spreadsheets.

After cutover these files and the pipeline are a local-development tool for
building throwaway databases only, never a production edit path. A maintainer can
read the git history and the provenance columns to understand where any datum came
from, without ever mistaking a CSV for a live edit path. The runbook for the
pipeline is `freestyle/README.md`.

## 6. Doctrine workflow

`freestyle/doctrine/` is the doctrine of record: the rulings in force, the rules
they establish, and their evidence chains. The workflow is `RED_QUEUE.md` (open
questions for the rules expert or curator) to `RED_RULINGS.md` (the ledger of
rulings in effect and where each lives), with derived rulings carrying their
proofs in `OPERATOR_DERIVATIONS.md`. Standing per-topic doctrine documents
(the family, positional-identity, and mirror rules) and `AUTHORITY.md` (the
single-authority map) sit alongside. The `papers/` series is the narrative
doctrine record and `reconciliation/` holds the cross-corpus studies. The
directory's own `README.md` is the authoritative index of what lives where; the
dated working history that produced these consolidations lives in the repository
root `exploration/` tree.

## 7. Publication governance

The gate a trick must pass to become accepted canonical content is
`docs/CANONICAL_TRICK_PUBLICATION_CONTRACT.md`: structural legibility across the
symbolic system, the independence of ADD arithmetic from structural decomposition,
honest incompleteness, and no fabricated structure. This guide links to that
contract as the publication authority and does not restate it.

## 8. Terminology ownership

One sentence answers who owns a term's meaning. Canonical structure and scoring
are owned by the dictionary tables and the operator reference
(`freestyleOperatorReference.ts` for operator ADD, structure, and X-Dex). The
reader-facing explanation of terms is the public glossary page. `docs/GLOSSARY.md`
is the project technical glossary. This guide points to those homes and never
copies their content, so a term's meaning has exactly one authoritative source.

## 9. Operational safety

Build, test, rebuild, deploy, backup, and rollback commands are owned by
`docs/DEVOPS_GUIDE.md`: the freestyle content source-of-truth and cutover model in
section 15.6, the deploy and rollback runbooks in section 13, and the backup and
disaster-recovery runbooks in section 16. Recovery from a bad edit is a corrective
in-app edit first (every curation write is audited with recoverable metadata);
snapshot restore is for disasters. This guide does not duplicate any of those
instructions; the local rebuild runbook is `freestyle/README.md`.

## 10. Documentation map

Each document owns one thing:

- `docs/FREESTYLE.md` (this guide) - freestyle orientation, authority boundaries,
  the table-level data model, and the doc map.
- `database/schema.sql` - column-level table detail.
- `docs/DEVOPS_GUIDE.md` - operational commands, the cutover model, deploy,
  backup, and rollback.
- `docs/DATA_MODEL.md` - the platform data model; points here for the freestyle
  and symbolic tables.
- `docs/CANONICAL_TRICK_PUBLICATION_CONTRACT.md` - the trick publication gate.
- `freestyle/doctrine/` (and its `README.md` index) - the doctrine of record.
- `src/content/freestyleOperatorReference.ts` - the operator ADD, structure, and
  X-Dex authority.
- The public glossary page and `docs/GLOSSARY.md` - reader-facing and technical
  term explanation.
- `freestyle/README.md` - the pipeline runbook (a local-development tool).
- The freestyle skills and the path-scoped `.claude/rules/*` - the agent-facing
  procedures and per-path rules for the area.
