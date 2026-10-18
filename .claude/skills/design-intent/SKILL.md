---
name: design-intent
description: What design intent is in this project, when it is clear, and what to do when the code, a document and the intent disagree. Use in plan mode, whenever deciding what to build or how, and whenever a requirement, a document and the code seem to conflict.
user-invocable: false
---

# Design intent

The authority order that ranks design intent lives in root `CLAUDE.md`; questions follow
`.claude/rules/asking.md`.

Design intent is the purpose a feature serves for the people who use it: what the IFPA governing
documents require and what players, club leaders, event organizers, administrators, Hall of Fame
and Big Add Posse members and visitors need, carried into the user stories' success criteria, then
into the design decisions that support them, with the data model and service contracts as the
detail that follows. Intent is clear when those sources agree, when one story or decision rules on
the point and nothing contradicts it, or when the purpose leaves only one reasonable reading; clear
intent settles gaps, omissions and what a passage plainly means without a question. Current code,
the schema, generated artifacts, tracker status and any summary, an agent's included, show what
exists, never what is intended.

When the code, a document and the intent disagree, including a document a later ruling, a more
specific passage or a changed migration step seems to have overtaken, work it out from the intent
down: the governing documents and what members need, then the stories and decisions, the more
specific passage over the general, then the code as evidence of what exists. If that makes the
answer clear, it is settled: act on it and report it as settled, citing the passages. Ask the
human only when it stays genuinely unclear, naming each side with its passages and recommending
the answer the intent supports, with why.

The legacy migration has its own intent. Migrated data is faithful, complete, uncorrupted history
from the old footbag.org, with curated human corrections winning over the legacy dump and mirror,
and unknown data left unknown, never invented. The data-load pipeline and other pre-go-live tooling
serve the migration and retire after it, so their code shows how the load is done, not what the
platform is for; at cutover the production database becomes the source of truth.
