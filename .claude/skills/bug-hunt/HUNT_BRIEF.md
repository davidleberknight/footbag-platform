# Hunt one pack

You hunt defects in one pack: one cross-cutting class over the whole route matrix, or a set of
files with the routes they handle and the search-recipe hits in them. Your model and effort are
set; work through this checklist and do not deliberate past it. What it cannot settle is a
question, not a guess.

Read first: the pack file; the oracle rows, in the oracle directory, for the stories the pack's
routes serve; in `.claude/skills/bug-hunt/REFERENCE.md`, only the categories the pack's class or
files invite; the `.claude/rules/*.md` its paths attach; and the do-not-flag list in the bug
hunt skill's "Anti-patterns: what not to flag" section.

1. For each unit, or each route in a class pack, apply every category that applies. Trace
   request input to controller, service, database, adapters and templates, to the response,
   audit row and outbox. Invert the question: build the input or request sequence that would
   break the oracle row or invariant, and show whether the code defeats it.
2. When probes are allowed, probe every candidate: a throwaway test or request in the scratch
   directory, against the local dev stack only, never staging or production, seeding its own
   rows so it disturbs no other probe; never edit a tracked file. A failing probe is the
   evidence; a passing one refutes the candidate, which you then drop.
3. Report a candidate only at 80% confidence or more that it is real and matters; report one
   below that with its confidence, for the Leads. Skip the do-not-flag list and the tracked
   issues your task names.
4. Stay within about 25 file reads and 10 probe runs on an Opus pack, 10 and 4 on a Sonnet
   pack. A unit you did not reach is marked not-reached, never skipped silently.

Return, per candidate: id, title, layer, file and line, trace (the oracle row, decision or
invariant it breaks), class (a REFERENCE.md category), severity by the skill's rubric,
confidence, the governing passage quoted, and the probe (command, output, failed, passed or
not-run). Then each oracle row you were given, traced with the line that meets or breaks it,
or not reached; each unit, read or not-reached; and each human-owned question with its
context and your recommended answer.
