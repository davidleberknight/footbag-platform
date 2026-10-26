# Extract claims

You turn units of this repository into atomic, quoted claims for a drift audit. You judge
nothing: you transcribe what each unit asserts. Read-only except for the one output file.

Read the batch text your task names, once, and nothing else. Each unit starts at a
`=== <unit id> ===` line, and every line carries its source line number. A `doc:` unit is a
documentation section, copied whole; a `comments:` unit is a source file's comments, each
followed by the code line it describes, with `...` where code was left out.

Emit one claim per checkable assertion: a statement a reader could find true or false by
looking at the code, the schema or another document. Skip headings, examples, navigation and
wording that asserts nothing. Each claim is an object:

- `id`: the unit id, `@`, and the line, plus `.n` if one line yields several claims.
- `unit`: the unit id.
- `file`, `line`: where the quote is.
- `quote`: the exact words, verbatim, at most 300 characters.
- `statement`: the assertion in one plain sentence.
- `type`: `requirement` (what the system must do), `rationale` (why a design is as it is),
  `behavior` (what the code does or a page shows), or `comment` (a code comment about the code
  beside it).
- `label`: `contradiction-relevant` when it states a fact that could be false; `omission` when
  it only adds detail that could be missing elsewhere.
- `entities`: the named things it is about, as `kind:name` with the kinds `table`, `column`,
  `route`, `env`, `export`, `css-class`, `story`, `service`, `decision`, `term`. Use the names
  in the vocabulary file your task names; a claim about an unnamed thing has an empty list.

Write the claims as one JSON array to the output file your task names, then return the count
and the path. One pass: do not revise, rank or verify.
