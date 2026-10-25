# Freestyle Bug Hunt — detailed reference

Detailed reference for the freestyle-bug-hunt skill, factored out of SKILL.md to stay under
the 500-line ceiling; SKILL.md points here at the relevant step. Category numbers §F1–§F25
are the `Category:` values findings cite.

## Tracked-work exclusion list — how to build it (every run)

The freestyle lane carries deliberate deviations, blocked decisions, and intentional gaps,
all tracked in the maintainers' private tracker. Re-derive the list fresh each run; an
embedded copy here would drift. Method:

1. List every open issue with the compact listing form in the `tracker-ops` skill
   (`--state open --limit 200`; without a limit gh stops at 30), and take every card
   whose title or labels touch freestyle, curated media, tips or records, not only the
   `freestyle` and `pipeline` lanes; add the `BUGS.md` entries step 0 re-verified.
2. Read every listed issue in full with the detail form in the `tracker-ops` skill (body
   and every comment, in order), plus every card a doctrine file cites, and record "N
   listed, N read in full" in the report. A title is a lead, never the card's state. Before
   recording a candidate finding, also search all states
   (`gh search issues --repo "$FOOTBAG_PRIVATE_REPO" "<terms>"`) for a closed card that
   rules on it.
3. For each, note: what state its merged body and comments declare current, what it
   defers, its unblock or done condition, and any standing rule stated there (the
   surface-propagation rule is one). A later explicit ruling on the relevant card
   supersedes conflicting older doctrine; ordinary comments, status updates, and
   implementation notes do not. Record any conflict as an owner question.

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

Hold in scratch notes; never commit. Select deterministically (a fixed `ORDER BY` with a
modulus, never `RANDOM()`), so every value of each axis appears at least once, plus every
row any category flags. Record the selected slugs in the report.

| Axis | Values to cover |
|---|---|
| Trick status | active, pending, and any non-published statuses present |
| Trick kind | base, operator-built, compound, folk-named, record-only reference, modifier stub |
| Family | each public family, a below-threshold family, unfamilied tricks |
| ADD | 1, mid-range, maximum present, NULL (the modifier rows carry NULL `adds` and `category = 'modifier'`) |
| Notation | operational notation with scoring brackets, with `[KICK]`, `[set]` shorthand, empty |
| Alias shape | no aliases, and each alias type present (common, historical, structural, technical, typo, suppressed, positional, ambiguous), displayed and not; an alias demoted from a retired row |
| Adjudication | open with a draft, open without, resolved to a trick, a published candidate's row hidden |
| Tips | published, hidden, each unresolved bucket |
| Records | each confidence value, a superseded record, an unresolved holder name |
| Media | no media, one clip, several clips, unavailable embed, media reached through an alias tag |
| Hashtag role | a trick, a set, an operator, a family, and a name that is both a trick and a set (pixie, fairy) |
| Media content type | `#tutorial`, `#demo`, `#record`, and a clip naming no trick |
| Browse view | every `?view=` variant deployed |
| Gallery | every named gallery, incl. era/difficulty-organized ones |

Read-only query recipes (confirm table and column names against `database/schema.sql` first):

```bash
sqlite3 -readonly database/footbag.db "SELECT slug, canonical_name, adds, notation, operational_notation, review_status, is_active FROM freestyle_tricks ORDER BY slug LIMIT 40 OFFSET 0;"
sqlite3 -readonly database/footbag.db "SELECT slug FROM freestyle_tricks WHERE slug LIKE '%-%' UNION ALL SELECT alias_slug FROM freestyle_trick_aliases WHERE alias_slug LIKE '%-%' UNION ALL SELECT tag_normalized FROM tags WHERE tag_normalized LIKE '%-%';"   # §F17
sqlite3 -readonly database/footbag.db "SELECT alias_type, alias_display, COUNT(*) FROM freestyle_trick_aliases GROUP BY 1, 2;"   # §F6
sqlite3 -readonly database/footbag.db "SELECT a.alias_slug, a.trick_slug, a.alias_type FROM freestyle_trick_aliases a JOIN freestyle_tricks t ON t.slug = a.trick_slug WHERE t.is_active = 0;"   # §F6: aliases resolving to inactive tricks
sqlite3 -readonly database/footbag.db "SELECT alias_slug, alias_type FROM freestyle_trick_aliases WHERE alias_display = 1 AND alias_type <> 'common' AND coalesce(display_reason, '') = '';"   # §F6: displayed against class with no reason
sqlite3 -readonly database/footbag.db "SELECT a.alias_slug, 'alias=active trick' FROM freestyle_trick_aliases a JOIN freestyle_tricks t ON t.slug = a.alias_slug AND t.is_active = 1 UNION ALL SELECT m.slug, 'modifier=active trick' FROM freestyle_trick_modifiers m JOIN freestyle_tricks t ON t.slug = m.slug AND t.is_active = 1 UNION ALL SELECT a.alias_slug, 'alias=modifier' FROM freestyle_trick_aliases a JOIN freestyle_trick_modifiers m ON m.slug = a.alias_slug;"   # §F21: slug namespace collisions
rg -n "shapeDictionaryTrickCard|TAG_LABELS|OBSERVED_SOURCE_LABELS" src/services/
rg -n "view=" src/views/freestyle/ src/controllers/freestyleController.ts
```

A grep or query hit alone is never a finding; trace it to the rendered surface or the
governing clause. Record the row count every recipe returns; a recipe that errors is a
stop, not a clean result.

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
  or its gallery; a trick page whose Educational links disagree with the modifiers and base
  its Structural Facts block shows.
- Method: for each sampled trick, walk every surface it should appear on and diff the
  facts shown. For each surface-level metric, recompute it read-only.
- **Not a finding — "ADD (recorded)" differing from canonical ADD.** The records
  surfaces (a trick's Consecutive Records table and `/freestyle/records`) show "ADD
  (recorded)": the difficulty the recording source assigned when the record was logged,
  historical evidence that may differ from the trick's current canonical ADD. This is
  deliberate and captioned, and any number of tricks may differ. Flag only a *missing or
  misleading caption/label* on those surfaces, never the numeric difference itself. The
  canonical ADD on the trick page is authoritative; the recorded value is a labeled source
  claim.
- **Not a finding — a documented outside-source divergence.** Divergence-registry
  entries, per-trick scoring notes, in-row provenance strings, and the reconciliation
  series (`freestyle/doctrine/reconciliation/`) record outside sources' conflicting
  numbers on purpose (the "record, don't adopt" policy). An outside source's differing
  ADD, shown as that source's divergent claim, is scholarship, not a contradiction.
  Flag only an *undocumented* divergence — a second value that appears with no
  provenance, registry entry, or note explaining it.

### §F2 ADD-math violations

The rule (homes: `freestyle/doctrine/AUTHORITY.md` and the trick-edit story's validation):
on a row with scoring brackets, `adds` equals the count of scoring tokens in
`operational_notation` (`[DEX]`, `[BOD]`, `[XBD]`, `[PDX]`, `[DEL]`, `[UNS]`, `[XDEX]`;
`[KICK]` does not score). The `notation` column is the semantic label and carries no
scoring brackets to count.

- `adds` is TEXT: compare with `CAST(adds AS INTEGER)`.
- Exempt: rows with `category = 'modifier'` or NULL `adds`; core stalls
  written in `[set]` shorthand; rows whose operational notation carries no scoring
  brackets (report those separately as a completeness list, not as mismatches).
- Signal: a numeric `adds` differing from the scoring-token count; an ADD analysis surface
  or record badge computing a different total than the row.
- Method: mechanical pass over every row (read-only query + count), then spot-verify
  renders.

### §F3 Slot-governance leakage

The trick-detail relationship slots (aliases; SE-chain compressions; compressed-from;
equivalence topology) each own a reading exactly once. The governing criterion is the
trick-detail story's rule that same-family progression, conceptual relatives and
structural neighbours are distinct sections that do not duplicate one another.

- Signal: the same reading rendered in two slots; a non-`common` alias shown in the
  "Also called" slot without its display flag and a `display_reason`; an equivalence
  rendered as a compression.

### §F4 Layer collapse

The six data layers (trick dictionary / modifier system / alias-naming / glossary /
sequence-combo / canonical competition results) have different truth rules and MUST NOT
collapse; observational topology never masquerades as canonical ontology.

- Signal: glossary terms stored in trick or modifier tables; observational groupings
  rendered without their observational badge/footer; results data feeding dictionary
  fields; sequence analysis leaking into canonical rows.

### §F5 Modifier single-authority drift

`src/content/freestyleOperatorReference.ts` is the canonical source for every operator's
ADD value, structure, and cross-axis behavior; drift between it, the modifier registry
(`freestyle_trick_modifiers`), and any rendered surface is a bug. Compare against the
registry, not the `category = 'modifier'` rows of `freestyle_tricks`, which are link
targets. Corollaries: no primitive-modifier row for compound concepts the doctrine defines
as compositions (the dictionary skill names the canonical example), and operator pages
agree with the reference.

### §F6 Alias and resolver invariants

- Positional qualifiers are structural: the resolver never auto-collapses a same-side or
  positional variant into its base without an explicit curated equivalence; the
  SAFE_ALIAS rule on multi-component names holds.
- Display is governed by each alias's display flag, not its type: search resolves every
  alias; a typo, suppressed or technical alias never has its display flag set. Any other
  non-`common` alias (structural, historical, positional, ambiguous) with the flag set
  must carry a non-empty `display_reason`: a curator may deliberately display one where
  the equivalence is part of the public vocabulary, and that is correct.
- A displayed alias renders inline beside the canonical name in quotes, never on a line
  of its own (view-layer rule).
- An alias resolves to an active canonical trick. An alias slug equal to an inactive
  trick's slug is a deliberate demotion (the collision rule is against active canonicals)
  and is not a finding; an alias of any type other than `suppressed` whose target trick
  is inactive is. A `suppressed` alias to an inactive target is listed as an owner
  question, never recorded: the guidance does not say whether it is held state.
- Signal: an "Also called:" line showing a typo, suppressed or technical alias, or a
  non-`common` alias with no `display_reason`; a positional variant silently merged; a
  non-suppressed alias resolving to an inactive trick.

### §F7 Canonical row-eligibility violations

Rows exist only for named-identity / not-losslessly-decomposable / historically
significant / ambiguity-resolving entries. No rows for pure modifier chains, surface-only
variants, direction-only variants, or combinatorial expansions — while direction itself is
structural (mirage and illusion are distinct; spinning and inspinning are distinct).

- Signal: a row whose modifier links and base fully reproduce it with no independent
  identity evidence; two rows that differ only by a rendering artifact. A row whose *name*
  merely reads as a modifier chain is a Lead for the curator, not a finding.
- Bright line: whether a specific borderline row DESERVES canonical status is doctrine —
  route to the curator; only mechanical violations of the recorded criteria are findings.

### §F8 Notation opacity violations

The notation columns are authored data: request-time code must not regenerate them,
silently rewrite them, or parse them to derive an authoritative or persisted field
(identity, ADD, family, decomposition, eligibility, aliases, redirects, persisted
structure, or doctrine). Do not parse, do not regenerate.

- Signal: service code parsing notation to determine an authoritative or persisted value,
  or any request-time path rewriting authored notation. A request-time display grouping
  derived from notation is reported as a Lead for the freestyle maintainer to rule on.

### §F9 Description-policy violations

Descriptions that render are neutral and instructional: no reviewer names, no alias lists.
ADD-derivation shorthand is allowed in `description` as curator provenance, since a
description carrying it is suppressed from public render and the ADD math renders from the
structured composition; flag it only when it would actually render (shorthand in a
description the suppressor does not catch) or when a description contradicts its own row (a
stated ADD or component that disagrees with the columns), which is a high-severity QC failure.

### §F10 Curated-media pipeline and the trick-tag invariant

Before go-live, the intake pipeline is fixed: snippet candidates → promotion script → sidecars → seeder →
media items + tags → tag-driven galleries. Invariants: every trick-media sidecar carries
the canonical trick slug tag plus the freestyle and trick tags, and exactly one of
`#tutorial`, `#demo` or `#record`; every trick-shaped tag resolves to an ACTIVE or PENDING
dictionary slug (alias-only matches fail); no fake slugs; no silent drops (every candidate
lands in a named bucket); duplicate (source, video URL) pairs are forbidden; curator
data-prep artifacts and admin gallery-editor application code stay on their own sides of
the boundary. A clip naming no trick (a shred routine, an event) carries no content-type
tag, by design.

- Signal: a tag with no matching slug; a trick clip with no content-type tag or more than
  one; a gallery whose membership disagrees with its tag criteria; a sidecar edited in ways
  the seeder cannot reproduce; media rows with no sidecar provenance.

### §F11 Media governance

What a curated clip is for is its own content-type tag; there is no source tier. The
primary clip for a trick is derived at report/render time as the clip with the strongest
content-type tag (tutorial, then demo, then record); there is no stored `is_primary` flag
and no write-time promotion. A `#record` clip never leads while a tutorial or demo exists.
Curated trick media and member-owned media stay separate. A content-type tag that looks
wrong is a curator-judgment review item; a missing one is §F10.

### §F12 Browse-view contract

Every browse view renders the shared dictionary trick row (the row contract, pinned by the
browse-row-contract route test, which loops a hand-written `BROWSE_VIEWS` list over seeded
fixtures: diff that list against the service's `allowedViews`, and grade the pin partial
for any view it omits): rows shaped only by the service row shaper, no row-internal markup
in templates, ADD-ascending-then-name sort (the family view puts the family anchor first,
then ADD ascending), empty groups hidden (except a curator-approved per-view exception),
modifier-stub rows excluded, one heading
system across views, no authoring status on a row, and observational views carrying their
exploratory status label and non-override footer.

### §F13 Generated-content drift

Three `src/content/freestyle*.ts` modules are generated (the observational universe,
tracked names and embedded coverage); the rest are hand-written. Confirm the set by
grepping `src/content` for the `GENERATED` header rather than trusting this count.
Generated TypeScript is being removed before cutover, its content moving into the
database, and after that any generated file under `src/` is itself a finding. Until
then, the generator, the committed module, and the consuming service must agree. A service
that re-derives or overrides a generated field at request time (instead of the generator
emitting it) is drift. Whether a module is stale against its inputs needs a regeneration
the hunt cannot run read-only: list it as an owner-run check in the report, with the
generator command, rather than asserting it either way.
Check the tracked-work list first — a known generator/service deviation may already be
tracked with an owner.

### §F14 Family and topology governance

The public-family rule governs the public family roster and its display (the family view
and the family pages), never the `trick_family` column, which may hold single-member
values: a public family requires more than two active members and a terminal or downside
structural identity (the dictionary skill's public family-base rule); entry-side primitives are not
family roots; frozen readings stay frozen (pending flags respected); observational
groupings never reshape canonical `trick_family`.

- Signal: a family with two or fewer members rendered as a public family; an entry-side
  primitive presented as a family root; a pending reading rendered as settled.

### §F15 Disclosure and pedagogy surface rules

Public dictionary content is public: depth is controlled by interaction, never by role. A
trick page has no modes; each foldable section is an independent collapsible region that
starts closed. Decomposition is pedagogy and is never inside a closed region or removed.
Enum-to-display mapping happens at ONE site in the service layer; templates branch on field
presence, never on enum values. The trick name, hashtag, Detail and Media controls follow
the view-layer rule, "Hashtag and dictionary-filter links".

### §F16 Freestyle QC-gate coverage (a hand-off, not a finding)

For every category, name in the coverage ledger the deterministic check that pins it: the
tag-invariant QC loader and its shared validation module, the dictionary route tests, the
admin freestyle route tests, the card-uniformity regression test, schema constraints where
they legitimately exist, and CI gates. Then check the check and grade it (SKILL.md method
step 5). A category with no deterministic check, only a presence-only or warn-only one, or
one covering only part of the invariant, is handed to the `write-tests` skill as a named
defect class, with the invariant it pins and where the check should live; it is listed in
the report's hand-offs, never recorded in `BUGS.md`. A check that passes on missing input,
or otherwise does not do what its name or comment claims, is a configuration defect and
stays a finding here. The freestyle content source-of-truth story's clauses (the
destructive rebuild refuses a non-development database; rows survive a data-preserving
deploy; content changes only through audited surfaces) are pins this category verifies.

### §F17 Naming, slug, and hashtag conventions

Maintainer-ratified rules:

1. A trick's DISPLAY NAME is plain words. A hyphenated or underscored slug rendered in
   the name position of any surface (card title, detail heading, "Also called" line,
   gallery caption) is a bug, with two exceptions in
   `src/content/freestyleDisplayNameExceptions.ts`: a slug in `DISPLAY_NAME_ROW_EXCEPTIONS`
   (its name is shown verbatim, and need not be its slug's words), and a hyphen inside a
   `GENUINE_HYPHEN_TOKENS` token (`cross-body`, `x-body`) in any name.
2. Slugs use underscores — that is the canonical convention across the dictionary,
   sidecars, and tags. A hyphenated slug anywhere in the chain (table, alias, sidecar, tag,
   URL) is a bug.
3. A hashtag carries its role, per the trick-reference-videos story: a trick is `#{slug}`,
   a set `#set_{slug}`, an operator or modifier `#operator_{slug}`, a family
   `#family_{slug}`. The bare token is a trick's alone, so a set or operator showing a bare
   hashtag is a bug; pixie and fairy show the bare hashtag on their trick surfaces and the
   `#set_` one on set surfaces. Any other divergence between a hashtag and its slug is a
   bug.
4. Display-format uniformity: per-card fields (the ADD chip, status badges, tier labels)
   come from one service mapping site; mixed formats across cards of the same view
   (labelled vs bare values, inconsistent casing of the same token) are findings under the
   single-mapping-site rule (§F15).

- Method: mechanical pass — query slugs, alias slugs and tags for hyphens; diff rendered
  card titles against the words-only rule and both exceptions; diff each rendered hashtag
  against its slug and role; collect the distinct ADD chip formats per view.

### §F18 Outbound legacy-site link integrity

Maintainer-ratified rule: no link to the live legacy footbag.org site survives go-live.
That site goes dark at cutover, so every link into it becomes a dead end.

1. An outbound link on any freestyle page to a live legacy footbag.org URL is a bug. The
   target loses its link and keeps its text, or is removed. The platform emits only the
   archive landing page, or the login-gated `/archive` route where the archive login
   redirect is configured, never an interior archive path (`src/config/env.ts`), so an
   interior archive link is itself a finding.
2. A direct archive-host link is a bug when the linking page is reachable without signing
   in, because the archive is member-only and a signed-out visitor lands on a login bounce
   instead of the content they clicked. `/archive` is the sanctioned form and is not.
3. An external host hard-coded in a template or content module, rather than resolved from
   configuration, is a finding in its own right: it cannot be repointed without a code
   change, and it drifts silently from the tests that assert it.

- Method: extract every `<a href>` host from the rendered crawl (which also catches a host
  assembled from configuration or stored in the database), then grep templates and
  content modules for hard-coded hosts (rule 3); for each distinct host, decide whether it
  survives cutover; for each surviving archive-host link, check whether its page requires
  authentication. Judge hosts against the configuration values the precondition step
  recorded, and list "archive host on production" as an owner-run check.

### §F19 Admin write-path domain integrity

After cutover the admin freestyle surfaces are the only way freestyle data changes, so
their refusals are the dictionary's last line of defence. For each admin freestyle story
(trick editing, alias, source-link and modifier-link attach and detach, notation
authoring, publishing from a draft, source registration, tip moderation, record and
consecutive-record editing, and curated-gallery management and curator upload):

1. Trace every validation clause to the line that enforces it in the owning service, and
   list the clauses per route. Named ones include: an alias slug colliding with an active
   canonical; a typo or technical alias saved with its display flag set; modifier
   `applyOrder`; a failed submit re-rendering with the submitted values; a 404 on a
   missing id; and for galleries, a gallery-id collision, the reserved `#by_*` namespace,
   atomic tag-set replacement, external-link URL validation, sidecar writes only before
   go-live, and a catch-all gallery whose exclude set names every other source gallery's
   tag.
2. Find the route test that asserts the refusal AND that nothing was written. A clause
   with no such test is a §F16 `write-tests` hand-off; a clause with no enforcing line is
   a finding here.
3. One audit row per write, in the same transaction, with a namespaced `action_type`; no
   audit row on a GET or a refused save.
4. A multi-row action (publication: trick, aliases, source link, modifier links, ruling
   resolution, audit) lands in one transaction or not at all.
5. Slug permanence and no hard delete where the story says so (a published trick, a
   record).
6. A stale form cannot silently overwrite a newer save: check whether the edit paths use
   the row's `version` or `updated_at` to refuse a lost update, and route the answer by
   what the story requires.

- Signal: a refusal the story names with no enforcing line or no test; a write without its
  audit row or outside the transaction; a path that deletes what the story says it hides.

### §F20 Publish and edit round-trip propagation

A trick published or edited through the admin surfaces must reach every canonical surface
it belongs on (browse, search and suggest, its family, its gallery, its trick page and
Educational links) and leave the observational surfaces and the Emerging Vocabulary
packet. The hunt is read-only, so it traces rather than writes: for each surface, confirm
it reads the trick live from the database rather than from a generated module or a stored
grouping, and use a publication the route tests already seed where one exists.

### §F21 Internal link integrity

Every internal link on a freestyle page resolves to a page that renders: a
`/freestyle/tricks/<slug>` link names an active canonical slug (not an alias, not an
inactive row); family, set and modifier links name pages that render; a records link
appears only where the name resolves. Each redirect the stories name (an alias to its
trick, an operator slug to its modifier page, a retired view value to its replacement, an
unknown slug to 404) has a status-code test. "Renders" means a 200 carrying a
page-specific marker (the canonical name in the heading); a 200 with an empty shell or an
error body is a finding.

- Slug namespaces: tricks, aliases, modifiers, sets and families share the
  `/freestyle/tricks/<slug>` resolution order in `src/routes/publicRoutes.ts`. Run the
  collision recipe, and probe one slug per namespace for its expected status (200, 301 or
  404), including a redirect chain or loop. A name the stories make both a trick and a set
  (pixie, fairy) is not a collision.
- Every freestyle `<loc>` in `/sitemap.xml` returns 200, with no inactive trick and no
  below-threshold family; every media-hub folder links to a gallery that exists, and a
  planned folder with no gallery renders as unavailable.
- Slug lists stored as free text (the `symbolic_*` member and example columns) name
  active slugs.
- Method: extract every internal `href` from the rendered crawl and the content modules'
  slug references, and resolve each against the database and the route table.

### §F22 Stored-prose hygiene

The public prose rules in the `freestyle-dictionary-surface` skill (attribution and
internal language) bind curator prose stored in the database as much as template text.
Scan `freestyle_trick_tips.tip_text` and every editorial column of `freestyle_tricks`
(description, short description, execution summary, learning, prerequisite and
pronunciation notes, the notation source note) for: absolute URLs and their hosts (§F18
applies), email addresses, individuals named as a source or contributor (exempt: Ben Job
as author of the notation system, and a record holder named for the record), and
internal-process terms (exempt on the attribution surfaces the surface skill lists). Also:
a published tip whose target trick is missing, inactive or unresolved, and a tip status
outside the known set (the schema carries no constraint on it).

### §F23 Records and consecutive-records integrity

Records render honestly: an unknown value stays unknown and a placeholder date never shows
as real; precision and confidence values come from their fixed vocabularies; a superseded
record points at a real row and the chain has no cycle; a holder name that does not resolve
renders as plain text; leader aggregates recompute from the rows; a historical person's
display follows `docs/DATA_GOVERNANCE.md`. The freestyle records and leaders pages read the
same tables: diff the facts they show for the same record.

### §F24 Trick-reference media contract

The trick-reference-videos story's criteria: the browser-tab title is
`Footbag Trick #{slug}`; the Media section is omitted when the trick has no tagged videos;
a trick with no media shows its hashtag as a plain, non-clickable token; a gallery link
reached through an alias tag redirects (301) to the canonical slug's gallery, so one trick
never has two galleries; pixie and fairy show both role hashtags, from the role registry
in `src/content/freestyleHashtagRoles.ts`.

- Method: for the Media and Hashtag role axes of the sample matrix, fetch the trick page
  and the gallery link and check each criterion on the rendered HTML and status codes.

### §F25 Search and suggest

The trick-search story's criteria, checked on both `/freestyle/search` and
`/freestyle/search/suggest` and in `src/public/js/freestyle-trick-search.js`: matching
covers canonical names, slugs (a spaced query matches an underscore slug) and alias text,
with the matched alias shown; inactive tricks never appear; a family hit appears only for
a family page that renders; a query under the minimum length gets the minimum-length
notice; an over-long query returns no results; the intro and no-results strings are the
story's; the suggest JSON shape is what the client script reads.

- Method: a fixed probe set (a spaced query, an alias, an inactive trick's name, a
  one-character query, a family name, an over-long query, an empty query) against both
  endpoints, each result resolved against the database.

## Report structure (chat summary accompanying the BUGS.md write)

1. Build identity: HEAD SHA, database modification time, build mode, freestyle table row
   counts, and the label "local build clean, not verified against the cutover database".
2. Scope declaration: the surface inventory with its counts, the sampled slugs, the cards
   read in full, the tracked-work exclusions applied, and the categories run.
3. The coverage grid: every surface against every applicable category, each cell checked,
   not applicable (with the reason) or not checked (with the reason).
4. Counts by category and severity.
5. Highest-leverage findings, one sentence each.
6. Owner-question list: doctrine or preference decisions surfaced, one decision per
   question, each with context and a recommended answer per `.claude/rules/asking.md`.
7. Owner-run checks the hunt could not do read-only (for example a §F13 regeneration).
8. Refuted leads: every dropped candidate with the reason it was refuted.
9. Negative findings worth recording (categories checked clean), with each pin's status.
10. The `write-tests` hand-offs: each category with no pinning check, or a presence-only,
    warn-only or partial one.
11. Coverage statement: what the one pass read in full, what it sampled, and why, plus
    what the cross-check lane surfaced.
