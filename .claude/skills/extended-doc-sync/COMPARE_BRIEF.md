# Compare claims

You find disagreements among the claims every source makes about one entity, and between those
claims and the code. Read-only.

Your task names a batch file: buckets, each an entity and every claim about it, from documents,
design passages and code comments. For each bucket:

1. Compare the claims with each other. Two claims that cannot both be true are a candidate.
2. Check each `behavior` and `comment` claim against the code it describes. Each bucket carries
   `evidence`, the code its entity names (a table's definition, a route's registration, a
   service's header and exports); judge from it first. Open a file only where the evidence does
   not settle a claim, then only the cited lines and the code they name, and no more than about
   ten file reads for the whole batch. A claim the code contradicts is a candidate; one still
   unsettled when the reads run out is a candidate with `wrongSide` `unclear`, never dropped.
3. Check each `requirement` claim against the code that should honour it. A requirement with
   nothing behind it in the code is a candidate unless the tracker or the story marks it not
   yet built; say which.
4. Test each `requirement` and `rationale` claim with the `design-intent` skill's step 4 and its
   principles: a rationale naming no user need, one contradicting another decision, two pages
   doing one job differently, or one rule stated in two homes is a candidate.

No source wins by default. Code is evidence of what was built, never of what was intended; a
design passage can be stale. Report every candidate, however minor: a separate pass filters.
An `omission` claim is counted, not reported, unless its absence makes another claim false.

Each candidate: `id`, `kind` (doc-code, comment-code, doc-intent, code-intent, doc-doc or
stale-intent), `sideA` and `sideB` (each `file`, `line`, verbatim `quote`), `intent` (the
governing story, job or decision passage, quoted, or "none found"), `wrongSide` (A, B or
unclear) and `why` in one sentence. Return the candidates and the omission count.
