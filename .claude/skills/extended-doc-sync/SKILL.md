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
   source file as a unit, including the private operations documents, the mechanical checks,
   the read-only parity gates, and, against the ledger, only the units whose files changed.
2. **Extract** (Sonnet, low effort, one pass). Each batch of units becomes atomic, quoted
   claims keyed by the entities they name.
3. **Group** (script). Claims bucketed by entity: everything every source says about one
   table, route, story or service, together; split where too large, each bucket carrying the
   code its entity names.
4. **Compare** (Opus, medium effort, for buckets holding a requirement or rationale; Sonnet for the rest)
   and **coherence** (Opus, over every design claim). Report everything; quote both sides.
5. **Verify** (Opus, medium, fresh context). Sees the two sides and the intent passage, never
   the finder's reasoning, and tries to refute each candidate. Candidates are pooled across
   batches, about 25 to a verifier, each with a read budget; one it cannot settle is kept as
   unverified.
6. **Cluster** (Sonnet, low). One ruling, one item, each with a severity (S1 requirement or
   design breach, S2 misdescription Claude would treat as design, S3 stale fact, S4 form) and
   settled or disputed. Severity sets the order questions are asked in, never whether.
7. **Draft** (Opus, medium). Each cluster's question written with its homework done, and its
   handover-or-card recommendation.

Steps 2 and 4 to 7 run in the saved workflow `.claude/workflows/extended-doc-sync-stages.js`; the
briefs beside this file are what its agents read.

## Run

Run directory: `footbag_private_repo/doc-sync-run/<date>/`, gitignored there, written below as
`<run>`: the asking spans later sessions, and a session scratchpad is not theirs to read.
Ledger: `footbag_private_repo/DOC_SYNC_LEDGER.json`; when the private checkout is absent,
`<run>/ledger.json`, said in one line. No ledger means a full baseline run.

**Domain by domain.** "Run the extended doc sync" walks the repository one domain at a time,
each only on the maintainer's approval, with its token cost reported before the next is
offered: the inventory limited to that domain's exact units with `--units`, then one
extraction, one grouping, one comparison, one draft. The asking then runs over as many fresh
sessions as it takes, in the domain order
`footbag_private_repo/EXTENDED_DOC_SYNC_REVIEW.md` sets, S1 first within each, until every
cluster has a ruling; that file records which are ruled, and "continue the extended doc sync"
resumes there. A later run extracts only what the ledger shows changed. When the private
checkout is absent, say so in one line, put `<run>` under the session scratchpad, and run over
the public repository only.

1. `npx tsx scripts/extended-doc-sync-inventory.ts --inventory --out <run>/inventory.json --ledger <ledger> --private-root footbag_private_repo`.
   Read its summary line, its failing gates and its mechanical findings. A detector that fires
   many times in one document is one finding with a count and two or three examples, so a
   pattern never buries a single instance that changes meaning.
2. **Pilot first** whenever this skill or its briefs changed since the last run, and on the
   first run: take one slice (one story group, its data-model section, its service, controller
   and their comments) by passing its unit ids to `--units`, never the batches that happen to
   hold them, then report units read, candidates, verified findings and tokens spent, and stop
   for the maintainer to decide on the next domain. A pilot's units are recorded with
   `--record --units`, which marks only what it read.
3. Extract: `Workflow({ name: 'extended-doc-sync-stages', args: { stage: 'extract', docBatches, commentBatches, vocabPath: '<run>/inventory.vocab.json', textDir: '<run>/inventory.batches', claimsDir: '<run>/claims' } })`,
   the batches taken from the inventory's `extract` field. It returns counts and any batch that
   failed; rerun only those.
4. `npx tsx scripts/extended-doc-sync-inventory.ts --group --claims <run>/claims --out <run>/grouped`.
5. Compare: `Workflow({ name: 'extended-doc-sync-stages', args: { stage: 'compare', files: <grouped summary's files>, reopen: <inventory's incremental.reopenEntities>, priorRulings: <inventory's incremental.priorRulings>, resultsPath: '<run>/results.json' } })`.
   It returns counts; the clusters are in the results file. Then draft:
   `Workflow({ name: 'extended-doc-sync-stages', args: { stage: 'draft', resultsPath: '<run>/results.json', clusters: <compare's clusters count>, draftsDir: '<run>/drafts' } })`;
   rerun only a slice it reports failed.
6. Ask, from a fresh session. Once the drafts are written, end the run by giving the
   maintainer `<run>`; each asking session reads only the results, the drafts, the review
   file's position and the cards, so every question is asked from a small context. A draft's
   `unconfirmed` fact is checked by a fresh-context subagent before it is used. Before any
   cluster reaches the maintainer, settled or disputed, re-derive it yourself with the
   `design-intent` skill: read its governing passage and the code this session, never copying
   the worker's verdict or recommendation, and drop, saying so, any cluster the intent does
   not bear out. Then one ratify-only message lists every re-derived settled cluster below S1,
   one plain sentence each naming what changes; one approval covers that list, and any item
   the maintainer names is pulled out or asked on its own. Then every S1 cluster and every
   disputed one, one at a time, from its re-derivation, put to the maintainer under the asking
   rule, written for someone reading on a phone who saw none of the run:
   - One discrepancy per message, in plain sentences; never a table.
   - Every message has the same shape, in this order, so a new topic is unmistakable:
     1. First line, a bold heading: "Question N of M: <plain title>".
     2. "What this is:" two or three short sentences saying what the feature is, where it shows
        on the site and who sees it, in everyday words, with no file name, identifier or
        internal term. A term that clashes with a site term (such as "tier") is not used.
     3. The problem: what each side says, one sentence each.
     4. The "Settled from the sources:" lines.
     5. The recommended answer and what would change on the site or in the code if it is
        accepted, then the one question.
   - After a correction or a follow-up, restate the whole message in this shape rather than
     amending the previous one.
   - Do the homework before asking. Every fact the message states about the site (a page, its
     title, its address, how a member reaches it, a button or link label, a notice, who sees it)
     is read this turn from the template, the route and the page-shaping service, and quoted
     verbatim; a label is never paraphrased and a page is never named from memory. A fact that
     cannot be confirmed that way is checked by a fresh-context subagent before the question is
     asked, never put to the maintainer as an assumption.
   Mechanical findings and failing gates are asked the same way.
7. The maintainer triages every ruling; no record is assumed. A tiny fix, a document's or
   comment's wording with no change of behaviour or design, is applied when the maintainer
   says so or goes into `footbag_private_repo/HANDOVER_DOC_SYNC.md`. For anything larger, a
   card is one option, not the default: each new card, and each step added to an existing
   card (the `tracker-ops` skill), is its own question, asked one at a time after its finding
   is re-derived against the design intent. Any record names the losing side, the winning
   passage and the exact change; card-sized rulings the maintainer puts on cards share one
   card per domain (a service and its pages). A feature not yet built is recorded and left.
   No doc-sync session changes public page wording; wording on the freestyle pages goes to the
   freestyle maintainer.
8. Record: write the run's remaining findings and every standing ruling (not drift, recorded
   and left, or carried to a card) into the results file; an applied fix needs none, because the
   drift it fixed no longer appears. Then
   `npx tsx scripts/extended-doc-sync-inventory.ts --record --results <run>/results.json --ledger <ledger> --from <run>/inventory.json --units <run>/units.json`,
   so the next run reads only what changed and never re-asks a ruling.

## Sensitive data

Never put raw emails, phone numbers, addresses, private names from non-public data, password
hashes, tokens, session values, API keys, staging credentials or demo-user identifiers in a
claim, finding, question or ledger. Use `[redacted-email]`-style placeholders, counts, or
table, column, route, service and test names.

## Stop when

Every cluster, mechanical finding and failing gate has a ruling or an explicit deferral from
the maintainer, every ruling is triaged by the maintainer and recorded as a card step or a
handover entry, and the ledger is recorded. A chunk walk stops
at the same point for its own units, with the chunk's Walked line recorded in place of the
ledger.
