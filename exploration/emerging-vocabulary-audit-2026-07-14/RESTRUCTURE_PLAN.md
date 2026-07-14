# Emerging Vocabulary restructure plan (2026-07-14)

Companion to `AUDIT.md`. Proposes the replacement architecture: independent
per-row dimensions instead of one overloaded heading, a question registry as the
doctrine spine, ledger-first precedence with registry reconciliation, and a
public page that shows the exact open question instead of "awaiting" language.
Read-only proposal; nothing here is implemented.

## 1. Proposed data model

One adjudication record per NAME (the ruling ledger, extended), plus a small
question registry. Six orthogonal dimensions per row; no single field carries
more than one meaning.

Stored on the ledger row (curator-owned adjudication facts):

- `object_type`: complete-trick | set/operator | modifier | terminal/contact |
  generic-term | source-fragment | malformed.
- `identity_target`: the canonical or alias slug the name resolves to, when it
  resolves ('' otherwise). Already exists as `matched_existing_object`.
- `evidence_state`: exact-notation | verified-footage | authoritative-prose |
  partial-structure | name-only | contradictory | none. New column; today this is
  smeared across `parse_confidence`, `failure_class`, and prose notes.
- `blocker_id`: '' or a key into the question registry (below). Replaces
  free-text `blocker_subtype` as the join key; the subtype string stays as the
  human label.
- `owner`: mechanical | james | james+dave | james+red | evidence | none.
  Today's `residual_home` almost carries this; make it enumerated.

Derived at generation time (never stored, so they cannot go stale):

- `publication_state`: live-canonical | live-alias | ready-to-author |
  adjudication-pending | doctrine-blocked | evidence-pending | observational |
  rejected. Derived from identity_target + live DB + blocker_id + owner.
- `duplicate_group`: identity key (parenthetical-stripped, abbreviation-expanded
  normalized name); all spellings of one identity render once.
- unlock counts per question (count of rows sharing a blocker_id).

Internal-only diagnostics (never drive public display): `parse_confidence`,
`failure_class`, the frozen CSVs' section/ecosystem fields, n_sources.

The question registry is a new small committed CSV
(`freestyle/doctrine/QUESTION_REGISTRY.csv` or an exploration-owned file until
ratified): `question_id, exact_question, vehicle (Scoring paper | Notation paper
| rider | curator), status (drafted | sent | answered), answer_ref`. The 14
questions in `AUDIT.md` section 14 are the seed rows. `RED_QUEUE.md` remains the
prose home; the registry is the machine-joinable index of it.

## 2. Source-of-truth and precedence rules

1. **Live database** (canonicals + aliases) decides publication state, at
   request time, always.
2. **Operator registry** (`trick_modifiers.csv`) decides operator definedness
   and weight. A ledger blocker claiming an operator is undefined while the
   registry defines it is a defect surfaced by a generator warning, and the
   registry wins.
3. **Ruling ledger** decides identity, object type, evidence state, blocker,
   and owner for every adjudicated name.
4. **Question registry** decides what each blocker means, its vehicle, and its
   open/answered status. A blocker_id pointing at an answered question is drift
   the generator flags loudly.
5. **Observational CSVs** supply provenance and raw evidence only (sources,
   source ADDs, first-seen spellings). They never assign state.
6. Parser artifacts are internal diagnostics.

## 3. Proposed public page architecture

Four sections plus an optional generated changelog; every section states its
contract in one line, and every entry shows its exact open question, not a
category word.

1. **Decide now** (~53 rows today): names with enough evidence for James or a
   curator to decide, grouped by decision batch (down-family cell labels,
   same-side batches, registry confirmations, dragon token, alias targets).
   Renders the smallest exact decision per group.
2. **Waiting on a named ruling** (~277 rows today): grouped BY QUESTION, one
   card per question with its exact wording, its vehicle and send status, and
   its unlock count; the gated names sit behind a disclosure on each card.
   Rows never appear under a question unless their blocker_id points at it.
3. **Needs evidence** (~7 rows today): names whose identity cannot be recovered
   without footage, notation, or a stronger source; states what evidence would
   suffice.
4. **Documented vocabulary (archive)**: the alias archive, the observational
   folk names, and non-trick terms, in one collapsed reference section framed as
   history, not work. Malformed fragments are dropped from display entirely
   (kept in the data with `object_type: malformed`).
5. **Recently resolved** (optional, generated): names whose ledger row gained
   `promoted=`, a new alias target, or a reject tag in the last N regenerations.

Suppression rules stay as shipped (live DB filter at request time) and extend to
parenthetical-content resolution and duplicate-group folding (section 6). The
health tiles collapse to the four section counts plus one "gated by N open
questions" figure; the nine-state ladder retires from public display.

## 4. Proposed admin/internal filters

The internal view (behind `/internal/`, per the internal-only rule) keeps the
full granularity: filter by any stored or derived dimension (object type,
evidence state, blocker, owner, parser diagnostics, source corpus, duplicate
group, ledger state), see per-row provenance including the frozen-CSV fields,
and export the working CSV. This is where parser confidence remains visible.

## 5. Generator migration plan

Phase the existing `build_observational_universe_content.py` rather than
rewriting it:

1. Add the question registry and the ledger `evidence_state`/`object_type`/
   `blocker_id`/`owner` columns (data-only change; defaults derived from the
   current subtype strings by a one-shot backfill script whose output is
   reviewed, not trusted).
2. Teach the generator the registry-vs-ledger reconciliation warning and the
   two suppression extensions (parenthetical resolution, duplicate folding).
3. Replace evState/holdKind stamping with the derived-dimension model, keeping
   the emitted TS backward-compatible for one commit (emit both old and new
   fields) so the service and tests migrate in a separate reviewable step.
4. Re-shape the service sections to the four-section model and retire the
   nine-state ladder from the template.
5. Delete the compatibility fields.

## 6. Suppression and deduplication rules

- A name suppresses from every active section when: its slug or any name
  candidate resolves to a live canonical/alias (shipped); OR any parenthetical
  content resolves (new); OR its identity_target is set (ledger).
- Duplicate groups render once, under the best spelling (prefer the spelling
  with a folk-name parenthetical; list the others as "also recorded as").
- Object types set/operator, modifier, terminal/contact, and generic-term route
  to the operator/glossary surfaces and render on this page only inside the
  archive section, labelled as terms.
- Malformed and rejected rows never render publicly.

## 7. Ledger integration

The ledger stays the single adjudication record. Additions: the four new
columns (section 1), the registry reconciliation rule (an undefined-operator
blocker is invalid when the registry defines the operator), and the convention
that answering a question retags every row whose blocker_id references it in
the same change (the question registry's `answer_ref` records the ruling). The
16 pollution rows and 17 non-trick rows in `AUDIT.md` sections 9 and 10 are the
first ledger-correction batch.

## 8. Test and freshness-gate requirements

Extend the existing drift guard (`tests/unit/observational-universe-consistency
.test.ts`):

- no rendered active-section row resolves to a live canonical/alias, INCLUDING
  parenthetical content (pins the section-9 pollution fix);
- every doctrine-gated row's blocker_id exists in the question registry and
  that question is not answered;
- no row with object_type other than complete-trick renders in an active
  section;
- duplicate groups render exactly once;
- every ledger blocker naming an operator token has no registry definition for
  that token (pins the registry reconciliation);
- the four public section counts equal the derived-dimension partition;
- parser fields appear nowhere in the public view-model.

## 9. Safe implementation sequence

1. Ledger correction batch (pollution + non-trick + duplicate targets) - data
   only, regenerate, tests.
2. Question registry + ledger columns + backfill - data only.
3. Generator: reconciliation warning + suppression extensions + derived
   dimensions with compatibility fields - code, regenerate, extend tests.
4. Service + template: four-section page - code, route tests updated.
5. Remove compatibility fields; retire the nine-state ladder assertions.
6. James decision batches (down-family cells, same-side batches, registry
   confirmations, dragon token) as separate promotion-style commits, each with
   full surface propagation.

## 10. Proposed commit boundaries

One commit per numbered step above (steps 1-2 may merge: both are data-only and
reviewed together). The James batches in step 6 are one commit per decision
group, mirroring the shipped same-side promotion commit shape.

## 11. Do-not-change-without-ruling list

- The 14 question-gated clusters (AUDIT section 14): no row leaves its gate
  without the named answer or an explicit James override recorded in the ledger.
- Sumo's provisional [XDEX] and both Nuclear-Ducking rows.
- Pogo Clipper and Pogo ss Clipper (terminal question).
- The four repeated-operator rows and paradox_blur's empty notation.
- The three shipped down-family tension rows (shooting_star,
  tapping_double_over_down, venom) pending the embedded-base frame.
- The 360-row alias archive (lookup history; never re-adjudicated in bulk).
- Red-sourced naming (the atomic-pickup alias hold and similar curator items in
  `RED_QUEUE.md`).

## 12. Recommended first implementation batch (no external input)

Maximizes resolved rows using only repository evidence and James's own calls:

1. Ledger corrections: 16 pollution rows to their live targets; 17 non-trick
   rows to object_type set/operator/term; 4 malformed/reject rows; 9 duplicate
   groups keyed. (46 rows leave the active surface; mechanical.)
2. James decision batch A: 27 down-family cell labels (mechanical from name
   markers once the convention is confirmed).
3. James decision batch B: confirm registry authority over the stale
   undefined-operator tags (11 rows become authorable).
4. James decision batch C: sailing + inspinning same-side derivations (8 rows
   authorable).
5. James decision batch D: dragon catch token (5 rows authorable + Miraging
   Dragon follows).
6. Author the 25 rows from batches B-D plus POD via the established
   red_additions + red_corrections + propagation path.

Net effect: the active backlog drops from 457 rendered "awaiting" rows to
approximately 280 rows behind 14 named questions plus 7 evidence rows, the
dictionary gains ~25 canonicals, and the page states every remaining gate as an
exact question with an unlock count.
