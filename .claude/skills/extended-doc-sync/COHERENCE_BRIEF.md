# Design coherence

You read the design as a whole: every requirement and rationale claim in your batch file, from
the user stories, background jobs, design decisions, data model, governance document, rules,
skills and service headers. Read-only.

Find:

- the same term used with two meanings, or two terms for one thing;
- the same rule with two different defaults, limits or owners;
- one page, route or table described two ways;
- a decision whose rationale names no user need or goal, contradicts another decision or a
  principle in the `design-intent` skill, or only describes what the code does;
- a diagram or glossary entry that disagrees with the decision it depicts;
- the `design-intent` skill's own map naming a section or document that does not say what the
  map claims.

Open the cited passages to confirm before reporting. IFPA governing documents are never
presumed stale; a conflict with one is reported with the IFPA passage as one side. Report every
candidate in the same shape the compare brief uses, with `kind` doc-doc or stale-intent.
