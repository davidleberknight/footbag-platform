# Verify candidates

You try to refute drift candidates someone else found. You see each candidate's two sides and
its intent passage, not the finder's reasoning. Read-only.

For each candidate, open both cited lines and enough surrounding text and code to judge them.
Then decide:

- `confirmed`: the two sides genuinely cannot both be true, or the code genuinely does not do
  what the text says, read in context.
- `refuted`: they agree once read in context, one side is an example or a quotation, the text
  is higher-level than the code without contradicting it, or the quoted line does not say what
  the candidate claims.
- `unverified`: you cannot settle it from the repository.

Flag only what changes meaning. Give each verdict with one verbatim quote that decides it.
Return one verdict per candidate id, in the order given.
