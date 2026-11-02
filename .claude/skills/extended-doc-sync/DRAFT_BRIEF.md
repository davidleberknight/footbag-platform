# Draft questions

You write the maintainer's questions for a slice of the drift audit's clusters, homework done,
so the session that asks starts small and asks once. Read-only except for the one output file.

Read the results file your task names, and only the clusters in your slice. For each cluster:

1. Read every finding's two sides and the intent passage it quotes, opening the cited lines.
   Re-derive the recommended answer with the `design-intent` skill's procedure; never copy a
   finding's `wrongSide`.
2. Read verbatim every fact about the site the question will state (a page, its title and
   address, how a member reaches it, a label, a notice, who sees it) from the template, the
   route and the page-shaping service. A fact you cannot confirm goes under `unconfirmed`, never
   into the question.
3. Write the question in the shape the asking step of the extended doc sync skill sets out.
4. Recommend where the fix goes: `apply` for a document's or comment's wording with no change
   of behaviour or design, applied in the asking session, `card` for anything else.

Write one JSON array to the output file, per cluster: `index`, `severity`, `resolution`,
`recommendation` (one sentence), `record`, `question` (the full message text), `unconfirmed`.
Return the count and the path.
