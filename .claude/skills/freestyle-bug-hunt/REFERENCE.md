# Freestyle Bug Hunt — detailed reference

Detailed reference for the freestyle-bug-hunt skill, factored out of SKILL.md to stay under
the 500-line ceiling; SKILL.md points here at the relevant step. Category numbers §F1–§F17
are the `Category:` values findings cite.

## Tracked-work exclusion list — how to build it (every run)

The freestyle lane carries deliberate deviations, blocked decisions, and intentional gaps,
all tracked in the maintainers' private tracker. Re-derive the list fresh each run; an
embedded copy here would drift. Method:

1. List the open freestyle-lane issues with `gh issue list -R "$FOOTBAG_PRIVATE_REPO"
   --state open --label freestyle`, and again with `--label pipeline` for the
   data-pipeline lane (read-only, auto-approved); add the local gitignored `BUGS.md`.
2. Collect every open issue whose subject is freestyle or curated media — `bug` marks a
   defect or an accepted deviation tracked to removal, `blocked` an item whose body opens
   `Blocked on: <person> - <what>`, `question` an open decision — plus any standing rule
   stated there (the surface-propagation rule is one).
3. For each, note: what state it declares current, what it defers, and its unblock or done
   condition.

The kinds of entries expected there (illustrative, not a substitute for the fresh read):
compound-tag deviations behind named galleries, generator-vs-service classification
deviations, unresolved record-video buckets awaiting curator or rules-expert decisions,
tricks intentionally left without technique notes, intentional media-coverage gaps,
promotion decision packets on hold, comment/label cleanup lanes, and skill-file trims.

Two-directional discipline:

- A behavior the list tracks is NOT a finding. Do not re-flag it, at any severity.
- An open issue whose described state no longer matches the repo IS a finding (stale
  tracker issue): the fix landed and the issue survived, or the deviation drifted into
  something the issue no longer describes. Cite the issue's own text and the contradicting
  repo evidence.

## Sample matrix

Hold in scratch notes; never commit. Sample so every value of each axis appears at least
once, plus every row any category flags:

| Axis | Values to cover |
|---|---|
| Trick status | active, pending, and any non-published statuses present |
| Trick kind | base, operator-built, compound, folk-named, record-only reference |
| Family | each first-class family + unfamilied tricks |
| ADD | 1, mid-range, maximum present |
| Alias shape | no aliases, common, historical, structural, technical, typo |
| Media | no media, primary clip, multi-clip, unavailable-embed |
| Media source | each registered source, each tier |
| Browse view | every `?view=` variant deployed |
| Gallery | every named gallery, incl. era/difficulty-organized ones |

Read-only query recipes (adjust table/column names against `database/schema.sql` first):

```bash
sqlite3 -readonly database/footbag.db "SELECT slug, canonical_name, official_add, notation, status FROM freestyle_tricks ORDER BY RANDOM() LIMIT 40;"
sqlite3 -readonly database/footbag.db "SELECT slug FROM freestyle_tricks WHERE slug LIKE '%-%';"   # §F17: hyphenated slugs
sqlite3 -readonly database/footbag.db "SELECT t.slug, mt.tag FROM media_tags mt LEFT JOIN freestyle_tricks t ON ... ;"  # §F10: tags with no active/pending slug
rg -n "buildFamilyGroup|shapeDictionaryTrickCard|classifyFrontier|SOURCE_TIER|SOURCE_LABELS" src/services/
rg -n "view=" src/views/freestyle/ src/controllers/freestyleController.ts
```

A grep or query hit alone is never a finding; trace it to the rendered surface or the
governing clause.

## Category catalog

### §F1 Cross-surface propagation drift

The standing rule (single home: the `footbag-freestyle-dictionary` skill's surface
propagation section): any freestyle change (promotion, doctrine change, classifier
change, content backfill) must propagate to every affected
surface before its slice is complete. Affected surfaces, as applicable: canonical trick
data;
aliases / duplicate archive; the emerging-vocabulary surface; the observational universe;
tracked names; ADD analysis; trick detail; browse and search; operator/modifier pages; set
pages; family surfaces; media and related-trick projections; metrics, counts, and copy;
generated content files; tests and QC gates.

- Signal: the same trick or operator shows different names, ADDs, families, statuses, or
  counts on two surfaces; a count or "N tricks" copy string disagrees with the data behind
  it; a promoted trick present in the dictionary but absent from search, its family group,
  or its gallery.
- Method: for each sampled trick, walk every surface it should appear on and diff the
  facts shown. For each surface-level metric, recompute it read-only.
- **Not a finding — "ADD (recorded)" differing from canonical ADD.** The records
  surfaces (a trick's Consecutive Records table and `/freestyle/records`) show "ADD
  (recorded)": the difficulty the recording source assigned when the record was logged,
  historical evidence that may differ from the trick's current canonical ADD. This is
  deliberate and captioned; sixteen tricks legitimately differ (e.g. Bladerunner:
  canonical 4, recorded 5). Flag only a *missing or misleading caption/label* on those
  surfaces, never the numeric difference itself. The canonical ADD on the trick page is
  authoritative; the recorded value is a labeled source claim.
- **Not a finding — a documented outside-source divergence.** Divergence-registry
  entries, per-trick scoring notes, in-row provenance strings, and the reconciliation
  series (`freestyle/doctrine/reconciliation/`) record outside sources' conflicting
  numbers on purpose (the "record, don't adopt" policy). An outside source's differing
  ADD, shown as that source's divergent claim, is scholarship, not a contradiction.
  Flag only an *undocumented* divergence — a second value that appears with no
  provenance, registry entry, or note explaining it.

### §F2 ADD-math violations

The forever-rule: the bracket count in the notation (`[DEX]`, `[BOD]`, `[XBD]`, `[PDX]`,
`[DEL]`, `[UNS]`, `[XDEX]`) equals the row's official ADD, on every row.

- Signal: `official_add` differing from the bracket count; an ADD analysis surface or
  record badge computing a different total than the row.
- Method: mechanical pass over all rows (read-only query + count), then spot-verify
  renders.

### §F3 Slot-governance leakage

The trick-detail relationship slots (aliases; SE-chain compressions; compressed-from;
equivalence topology) each own a reading exactly once. Slot leakage is the most common
audit failure named by the dictionary skill.

- Signal: the same reading rendered in two slots; a structural alias shown in the
  plain-alias slot; an equivalence rendered as a compression.

### §F4 Layer collapse

The six data layers (trick dictionary / modifier system / alias-naming / glossary /
sequence-combo / canonical competition results) have different truth rules and MUST NOT
collapse; observational topology never masquerades as canonical ontology.

- Signal: glossary terms stored in trick or modifier tables; observational groupings
  rendered without their observational badge/footer; results data feeding dictionary
  fields; sequence analysis leaking into canonical rows.

### §F5 Modifier single-authority drift

`src/content/freestyleOperatorReference.ts` is the canonical source for every operator's
ADD value, structure, and cross-axis behavior; drift between it, the modifier table, and
any rendered surface is a bug. Corollaries: no primitive-modifier row for compound
concepts the doctrine defines as compositions (the dictionary skill names the canonical
example), and operator pages agree with the reference.

### §F6 Alias and resolver invariants

- Positional qualifiers are structural: the resolver never auto-collapses a same-side or
  positional variant into its base without an explicit curated equivalence; the
  SAFE_ALIAS rule on multi-component names holds.
- The five-category alias taxonomy (common / historical / structural / technical / typo)
  is respected in rendering: search resolves everything; display surfaces only what helps;
  typo aliases are never user-visible.
- Signal: an "Also called:" line showing a typo alias; a positional variant silently
  merged; an alias resolving to a retired slug.

### §F7 Canonical row-eligibility violations

Rows exist only for named-identity / not-losslessly-decomposable / historically
significant / ambiguity-resolving entries. No rows for pure modifier chains, surface-only
variants, direction-only variants, or combinatorial expansions — while direction itself is
structural (mirage and illusion are distinct; spinning and inspinning are distinct).

- Signal: a row whose name is exactly a modifier chain over an existing base with no
  independent identity evidence; two rows that differ only by a rendering artifact.
- Bright line: whether a specific borderline row DESERVES canonical status is doctrine —
  route to the curator; only mechanical violations of the recorded criteria are findings.

### §F8 Notation opacity violations

The notation column is opaque text: never parsed to derive other fields at request time,
never regenerated, never silently rewritten; mismatches are QC-flagged.

- Signal: service code parsing notation to compute ADD/family/decomposition; a generator
  rewriting notation outside the curated write surfaces.

### §F9 Description-policy violations

Descriptions are neutral and instructional: no reviewer names, no ADD shorthand, no alias
lists inside descriptions; a description contradicting its own row (a stated ADD or
component that disagrees with the columns) is a high-severity QC failure.

### §F10 Curated-media pipeline and the trick-tag invariant

The intake pipeline is fixed: snippet candidates → promotion script → sidecars → seeder →
media items + tags → tag-driven galleries. Invariants: every trick-media sidecar carries
the canonical trick slug tag plus the freestyle and trick tags; every trick-shaped tag
resolves to an ACTIVE or PENDING dictionary slug (alias-only matches fail); no fake slugs;
no silent drops (every candidate lands in a named bucket); duplicate (source, video URL)
pairs are forbidden; curator data-prep artifacts and admin gallery-editor application code
stay on their own sides of the boundary.

- Signal: a tag with no matching slug; a gallery whose membership disagrees with its tag
  criteria; a sidecar edited in ways the seeder cannot reproduce; media rows with no
  sidecar provenance.

### §F11 Media governance

Primary-clip promotion passes the five-gate rule (active trick, teaches the trick,
tutorial-tier source, current primary missing or weaker, no duplicate primary). Record-tier
sources never become tutorial-primary. Registering a new source requires the six
coordinated edits the curated-media skill enumerates — a partial registration is a
finding. Curated trick media and member-owned media stay separate. A wrong tier is
presentation-level (`inconsistent`), never `broken` — calibrate severity accordingly.

### §F12 Browse-view contract

Every browse view renders the shared dictionary trick card (the card-uniformity contract,
mechanically pinned by the dictionary-trick-card route test): cards shaped only by the
service card shaper, no card-internal markup in templates, ADD-ascending-then-name sort,
empty groups hidden, modifier-stub rows excluded, observational views carrying their badge
and non-override footer.

### §F13 Generated-content drift

The `src/content/freestyle*.ts` modules are generated artifacts: the generator, the
committed module, and the consuming service must agree. A service that re-derives or
overrides a generated field at request time (instead of the generator emitting it) is
drift; a module regenerated stale (source data changed, module not rebuilt) is drift.
Check the tracked-work list first — a known generator/service deviation may already be
tracked with an owner.

### §F14 Family and topology governance

The public-family hard rule (a family page/grouping requires more than two members);
entry-side primitives are not family roots; no multi-family schema or SQL constraints on
taxonomy while the reversible-governance doctrine holds; frozen readings stay frozen
(pending flags respected); new relationship axes land as content modules, not columns.

- Signal: a two-member family rendered as a family; a schema migration adding taxonomy
  constraints; a pending reading rendered as settled.

### §F15 Disclosure and pedagogy surface rules

Public dictionary content is public: depth is controlled by interaction (simple vs
deep-dive), never by role. Decomposition is pedagogy and stays visible even in the simple
mode. Enum-to-display mapping happens at ONE site in the service layer; templates branch on
field presence, never on enum values. The hashtag, the trick name, and the trick-detail
link are three distinct controls: the name is never a link, and a hashtag links to a
gallery only when media exists.

### §F16 Freestyle QC-gate coverage (a testing gap is a bug)

For every category above, identify the deterministic check that pins it: the tag-invariant
QC loader and its shared validation module, the dictionary route tests, the
card-uniformity regression test, schema constraints where they legitimately exist, and CI
gates. A category with no deterministic check, or a check covering only part of the
invariant, is a first-class finding with severity from the surface it leaves unguarded —
not a suggestion. State the exact missing check, the invariant it pins, and where it
should live.

### §F17 Naming, slug, and hashtag conventions

Maintainer-ratified rules:

1. A trick's DISPLAY NAME is plain words. A hyphenated or underscored slug rendered in
   the name position of any surface (card title, detail heading, "Also called" line,
   gallery caption) is a bug.
2. Slugs use underscores — that is the canonical convention across the dictionary,
   sidecars, and tags. A hyphenated slug anywhere in the chain (table, sidecar, tag,
   URL) is a bug.
3. The hashtag is exactly `#` plus the slug. Any divergence between a surface's hashtag
   and the underlying slug is a bug.
4. Display-format uniformity: per-card fields (the ADD chip, status badges, tier labels)
   come from one service mapping site; mixed formats across cards of the same view
   (labelled vs bare values, inconsistent casing of the same token) are findings under the
   single-mapping-site rule (§F15).

Known seed signals observed on a live browse view (verify against current code before
recording; they may have been fixed): slug-shaped display names such as
`around-the-world-kick`, `atomic-kick`, `double-kick` rendered as titles where sibling
cards correctly show plain words; ADD chips mixing `stall(1)`, `dex(1)`, bare `1`,
`xbody(1)`, and upper-case `UNS(1)` within one view.

- Method: mechanical pass — query all slugs for hyphens; diff rendered card titles against
  a words-only rule; diff each rendered hashtag against its slug; collect the distinct ADD
  chip formats per view.

## Report structure (chat summary accompanying the BUGS.md write)

1. Scope declaration: surfaces derived, sample-matrix coverage, tracked-work exclusions
   applied, categories run.
2. Counts by category and severity.
3. Highest-leverage findings, one sentence each.
4. Owner-question list: doctrine or preference decisions surfaced, one decision per
   question, each with context and a recommended answer per `.claude/rules/asking.md`.
5. Negative findings worth recording (categories checked clean).
6. Dryness statement: whether the final two passes surfaced no new candidate.
