# Bug Hunt — harness-layer reference (Lane 5)

Harness-layer method detail for the bug-hunt skill, kept out of SKILL.md to hold the body
under the ceiling; SKILL.md's dispatch table points here. This is the Lane 5 brief: it is
read by the subagent(s) that sweep the Claude Code harness, never by the orchestrator. A
lane conclusion is a lead, not a finding — the main session re-verifies every candidate.

The harness is the fifth defect layer: the `.claude/` configuration is reviewed production
code (CLAUDE_CODE_GUIDE §11), and a defective line in it misdirects every future session.
This lane hunts what that configuration gets wrong.

## Surface

Enumerate fresh every run, never from a seed list:

- `.claude/settings.json` — the `permissions` floor (allow/ask/deny) and the `hooks` wiring.
- `.claude/hooks/*` — every guard script and the read-only approver.
- `.claude/rules/*` — path-scoped conventions and the shared glob-less rules.
- `.claude/skills/*` — every `SKILL.md` and its sidecars.
- `.claude/agents/*` — custom subagent definitions and their frontmatter `hooks:`/`tools:`.
- `docs/CLAUDE_CODE_GUIDE.md` — the human-facing explanation, both an authority (below) and
  itself an audited surface.
- `scripts/ci/assert_claude_harness.sh` and the hook fixtures in `scripts/ci/test_hooks.sh`
  — the deterministic self-check (read to dedup against, see below).

## Authority and the drift-direction rule

Three homes, each authoritative for a different thing:

- **`docs/CLAUDE_CODE_GUIDE.md`** — the harness *design rationale* (why each layer exists,
  what Anthropic guidance it follows, where it deliberately goes further).
- **`.claude/rules/claude-harness-governance.md`** — the *change-control contract* (how the
  harness may be edited; the single-home rule; the subagent-safety floor).
- **The config files themselves** (`settings.json`, `hooks/*`, `rules/*`, `agents/*`) — the
  truth for *actual behavior*.

Cite these by name; do not restate them.

When behavior and the guide disagree, the config is truth for behavior and the guide for
rationale. Default to a **guide-stale** finding, *unless* the config demonstrably fails a
security or design intent the guide states — then cite both sides and let the human decide
(the guide even self-demotes: "the file wins and this document is stale"). Classify every
harness gap as exactly one of:

- **(a) `.claude` drifted from the guide** — the config no longer matches the design the
  guide describes, and the guide is the correct target.
- **(b) the guide is internally wrong** — it contradicts itself or another canonical doc.
- **(c) the guide/harness is stale vs current vendor guidance** — subject to the churn
  filter below.
- **(d) the guide deliberately goes further than vendor guidance** — explicitly flagged in
  the guide ("goes further", "beyond current vendor documentation"). This is NOT a bug;
  never report it as one.

## Vendor-guidance arm (the `researcher` subagent) and the churn filter

Anthropic's official guidance is not static. The `researcher` arm (WebFetch/WebSearch)
fetches the current official docs and tests the guide's "Official grounding" claims against
them. A case-(c) finding is admissible ONLY when it cites: the **specific vendor claim**,
its **URL**, and a **concrete behavioral consequence for this harness** (a real bypass,
gap, or misdirection a session would hit). Vendor rewording, renamed sections, or new
features this harness does not use are never findings — that is churn, and Lane 5 must not
emit it. When the guide already marks the divergence deliberate (case d), stop.

## De-duplicate against the deterministic self-check (mandatory, mechanical)

Before recording any harness lead, read `scripts/ci/assert_claude_harness.sh` and enumerate
the checks it already pins — the script is the source of truth; do not trust any list here,
it drifts. It currently guards well over a dozen invariants (valid settings JSON; wired hooks
exist; every rule/skill/hook/agent reference resolves; `sqlite3` never auto-allowed without
`-readonly`; no mutating allow head or `WebFetch(domain:*)`; and more). Exclude anything the
script already guards. "The script should ALSO check X" is a **verification-layer gap** —
route it to Lane 4's finding form, never re-report it here as if the harness were unguarded.

## What to hunt (categories the self-check cannot pin)

- **Hook bypass** — a guard regex evadable by substitution, reordering, quoting, process
  substitution, redirection, `xargs`, or multiline input; a guard anchored to mention
  instead of execution (or vice-versa); a fail-open where it should fail closed.
- **Permission gap** — a broad or mutating allow head; an `ask`/`deny` a static rule could
  express but only a hook does (so a subagent on a hook-less client loses it); precedence
  errors (allow shadowing a needed ask/deny).
- **Subagent-inheritance hole** — a guard expressible statically but living only in a hook;
  a custom `Bash` agent whose frontmatter hook chain has drifted from `settings.json`; an
  agent whose tool set or system prompt contradicts its assigned job (the auditor's own
  `.claude/` boundary was one such gap).
- **Single-home / restatement drift (guide §13)** — the authority/read/composition orders,
  the deployed-surface method, or a contract restated in a second place and now inconsistent;
  a rule or skill clause the code has outgrown; a doc mandate no rule or skill carries.
- **Skill authoring** — an over-triggering or vague description; a side-effect-heavy or
  explicit-only skill missing `disable-model-invocation`; a `SKILL.md` over the ceiling with
  no reference backing; a dated status line or implementation journal in a skill body.
- **Guide accuracy** — a guide section describing a layer, hook, or approver behavior the
  config no longer has (case a/b), or an "Official grounding" claim now stale (case c).
- **Fixture coverage** — a guard with no fixture pinning both its execution-asks and
  mention-defers directions; a new guard not wired or not tested.

## Return contract

Return leads only, each with: the file and line; the drift class from (a)-(d) plus its
one-line definition (so the orchestrator need not read this file); the concrete evidence
(the bypass input, the missing guard, the contradicting sources); a refutation attempt; and
any human-owned decision as a clearly marked question (the subagent cannot ask the human).
Never propose or make an edit — findings-only.
