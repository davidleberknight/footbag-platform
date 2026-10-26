---
name: extended-doc-sync
description: Whole-repository drift audit. Finds every disagreement between the documents, the design intent, the code comments and the code, verifies each in a fresh context, and brings every one to the maintainer with a recommended answer derived from the design intent. Run only when the maintainer asks for an "extended doc sync" by name; never inferred, and not the per-change doc-sync.
disable-model-invocation: true
---

# Extended doc sync

The whole-repository audit that leaves documents, design intent, code comments and code
consistent. No source is presumed correct: a design passage can be stale, a comment can lie,
and code can have drifted from the design. Every discrepancy goes to the maintainer under
`.claude/rules/asking.md`, which also fixes the order a recommendation is derived in. This is
drift only; defect hunting is the separate bug-hunt pass, run after this one.

## How it is built

A script does everything mechanical and enumerates every unit; models only read and judge.

1. **Inventory** (script, no model). Vocabulary, every documentation section and commented
   source file as a unit, the mechanical checks, the read-only parity gates, and, against the
   ledger, only the units whose files changed.
2. **Extract** (Sonnet, low effort, one pass). Each batch of units becomes atomic, quoted
   claims keyed by the entities they name.
3. **Group** (script). Claims bucketed by entity: everything every source says about one
   table, route, story or service, together.
4. **Compare** (Opus, medium effort, for buckets holding a requirement or rationale; Sonnet for the rest)
   and **coherence** (Opus, over every design claim). Report everything; quote both sides.
5. **Verify** (Opus, medium, fresh context). Sees the two sides and the intent passage, never
   the finder's reasoning, and tries to refute each candidate.
6. **Cluster** (Sonnet, low). One ruling, one item, ranked by severity.

Steps 2 and 4 to 6 run in the saved workflow `.claude/workflows/extended-doc-sync-stages.js`; the
briefs beside this file are what its agents read.

## Run

Scratch: a fresh directory under the session scratchpad, written below as `<run>`.
Ledger: `footbag_private_repo/DOC_SYNC_LEDGER.json`; when the private checkout is absent,
`<run>/ledger.json`, said in one line. No ledger means a full baseline run.

**Chunked walk, the default.** "Run the extended doc sync" walks one chunk: read
`footbag_private_repo/EXTENDED_DOC_SYNC_REVIEW.md`, take the first chunk in its walk order with
no Walked line, and run the steps below over that chunk's units only, selected as the file's
resume procedure says. A chunk walk skips step 8, because recording marks every inventoried file
checked; it adds the chunk's Walked line to the file instead. A full run over every unit happens
only when the maintainer asks for one by name. When the private checkout is absent, say so in one
line and walk the slice the maintainer names.

1. `npx tsx scripts/extended-doc-sync-inventory.ts --inventory --out <run>/inventory.json --ledger <ledger>`.
   Read its summary line, its failing gates and its mechanical findings. A detector that fires
   many times in one document is one finding with a count and two or three examples, so a
   pattern never buries a single instance that changes meaning.
2. **Pilot first** whenever this skill or its briefs changed since the last run, and on the
   first run: take one slice (one story group, its data-model section, its service, controller
   and their comments) by passing only those units' batches, then report units read,
   candidates, verified findings and tokens spent, and stop for the maintainer to decide on the
   full run. A pilot never records the ledger: recording marks every inventoried file checked,
   and a pilot read one slice. Otherwise run what the inventory batched.
3. Extract: `Workflow({ name: 'extended-doc-sync-stages', args: { stage: 'extract', docBatches, commentBatches, vocabPath: '<run>/inventory.vocab.json', textDir: '<run>/inventory.batches', claimsDir: '<run>/claims' } })`,
   the batches taken from the inventory's `extract` field. It returns counts and any batch that
   failed; rerun only those.
4. `npx tsx scripts/extended-doc-sync-inventory.ts --group --claims <run>/claims --out <run>/grouped`.
5. Compare: `Workflow({ name: 'extended-doc-sync-stages', args: { stage: 'compare', files: <grouped summary's files>, reopen: <inventory's incremental.reopenEntities>, priorRulings: <inventory's incremental.priorRulings>, resultsPath: '<run>/results.json' } })`.
   It returns counts; the clusters are in the results file.
6. Ask. Read the results file one cluster at a time. For each, re-derive the recommendation
   yourself with the `design-intent` skill from the passages, never copying the worker's, and
   put it to the maintainer under the asking rule, written for someone reading on a phone who
   saw none of the run:
   - One discrepancy per message, in plain sentences; never a table.
   - Open with what the feature is and where it shows on the site, in everyday words, before
     any file name, identifier or internal term.
   - Say what each side says in one sentence each, then the recommended answer and what would
     change on the site or in the code if it is accepted.
   Mechanical findings and failing gates are asked the same way.
7. Record each ruling as work; never carry it out in the review session, which would grow too
   long. Every fix, to a document, a comment or code, becomes a step on a private-tracker card
   (the `tracker-ops` skill) naming the losing side, the winning passage and the exact change.
   Batch so one card is one session's work: every ruling in one domain (a service and its
   pages) goes on one card, added as a step when its ruling lands, and a new card starts only
   for another domain or for work too large for one session. A feature not yet built is
   recorded and left.
8. Record: write the run's remaining findings and every ruling into the results file, then
   `npx tsx scripts/extended-doc-sync-inventory.ts --record --results <run>/results.json --ledger <ledger> --from <run>/inventory.json`,
   so the next run reads only what changed and never re-asks a ruling.

## Sensitive data

Never put raw emails, phone numbers, addresses, private names from non-public data, password
hashes, tokens, session values, API keys, staging credentials or demo-user identifiers in a
claim, finding, question or ledger. Use `[redacted-email]`-style placeholders, counts, or
table, column, route, service and test names.

## Stop when

Every cluster, mechanical finding and failing gate has a ruling or an explicit deferral from
the maintainer, every ruling is a step on a card, and the ledger is recorded. A chunk walk stops
at the same point for its own units, with the chunk's Walked line recorded in place of the
ledger.
