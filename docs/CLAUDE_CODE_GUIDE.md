# Claude Code Guide

A map of how this repository is engineered for Claude Code (and any other AI coding agent), and how to change that setup safely. It is written for human maintainers.

This guide is **not** loaded into an agent's context automatically — it carries no `paths:` glob and nothing imports it — so it can be as long as it needs to be without spending an agent's context budget. The files it describes are the source of truth: `CLAUDE.md`, `.claude/rules/*`, `.claude/skills/*`, `.claude/hooks/*`, `.claude/agents/*`, and `.claude/settings.json`. If this guide and one of them ever disagree, the file wins and this guide is stale.

## The core idea

If you read nothing else, read this. The whole harness follows from three premises:

1. **Context is finite, and every loaded token competes.** An agent reasons better over a small, relevant working set than a large one. So the harness loads the minimum and reveals the rest on demand.
2. **An instruction is a request; only machinery guarantees.** An agent follows prose probabilistically, so anything that must *always* hold is enforced by a deterministic hook or a permission rule, never by asking nicely.
3. **The harness is production configuration.** It is version-controlled, reviewed, and tested like code, because a bad line in it misdirects every future session.

Everything below is one of those three premises applied to a concrete part of the system. A good next read after this guide is the root `CLAUDE.md` itself.

Each topic below opens with what the concept *is*, then how this repo applies it, then the official Anthropic guidance it follows (and, where relevant, where the repo deliberately goes further).

## Progressive disclosure

**What it is:** loading a small "table of contents" always, and opening the "chapters" and "appendix" only when needed. It is premise 1 in practice.

**What loads when:**
- *Always, every session:* root `CLAUDE.md` (kept deliberately short), the top of the `MEMORY.md` index (Claude Code loads roughly its first 200 lines / 25 KB), and every skill's one-line `description` — metadata only, not the skill body.
- *Lazily:* a nested `CLAUDE.md` loads when a file in its subtree is opened; a rule with a `paths:` glob attaches only when a matching file is Read or Edited — **not** on a grep or a Bash command, and not by merely reasoning about a path.
- *On demand:* canonical docs under `docs/`, a skill's full body (loaded when the skill is invoked, then resident for the session), and individual memory entries.

**How the repo applies it:** detail lives where it loads only when relevant. A convention for editing controllers is a `paths:`-scoped rule, not a line in root `CLAUDE.md`. A skill's long reference material moves into a `REFERENCE.md` beside it, so a ~500-line `SKILL.md` body stays lean; `bug-hunt`, `design-bug-hunt`, and `extended-doc-sync` are split this way.

**Official grounding:** Anthropic's progressive-disclosure model, the best-practices instruction to keep `CLAUDE.md` minimal and prune it ("would removing this line cause a mistake? if not, cut it"), and the ~500-line `SKILL.md` ceiling.

## When each layer fires — and what a subagent sees

This is the precise trigger for each layer, and how the picture changes inside a subagent.

**In the main session:**
- **Root `CLAUDE.md`** loads at the start of every session and stays in context.
- **A nested `CLAUDE.md`** loads when you open a file in its subtree.
- **A path-scoped rule** attaches when a file matching its `paths:` glob is Read or Edited — **not** on a grep, a Bash command, or reasoning about a path. Because of that gap, an agent is told to Read a governing rule itself before editing. The glob-less rules (`asking`, `memory`, `deployed-surface`) are pulled in by name wherever `CLAUDE.md` or a skill points to them.
- **A skill's** one-line description is always in context; the agent loads the skill body when a task matches that description, or when you name the skill explicitly. A skill marked `disable-model-invocation: true` never auto-fires — it runs only when named, and its description leaves always-loaded context until then.
- **A hook** fires on the tool call its matcher names — before the tool runs (PreToolUse, which can allow, ask, or deny) or when the agent tries to stop (Stop). The Bash matcher here wires several guard hooks and a read-only auto-approver; when their decisions differ, deny and ask always beat allow, so the guards win regardless of execution order.
- **Memory:** the index is always loaded; an individual entry is pulled on recall.

**Inside a subagent** (`auditor`, `researcher`, or any Task-spawned agent) — the part most setups get wrong:
- A subagent runs in a **fresh context** with its own system prompt from its `.claude/agents/*.md` definition and its own tool allowlist. It does not inherit the parent's conversation or Plan-Mode state; if it needs a rule's or skill's content, it reads the file.
- **Permission rules (`settings.json` `permissions.*`) do apply** to its tool calls.
- **Assume PreToolUse and Stop hooks do not fire** for a subagent: Anthropic does not document hook behavior inside subagents and it has varied across versions, so this repo's design never relies on it. User-scope settings likewise are not relied on there.
- So a subagent's safety rests on the two things it can count on: the inherited permission rules, and the restrictive tool allowlist in its definition. That is why `auditor` and `researcher` are given read-only tools — the hooks that protect the main session are not assumed to be there to catch them.
- A subagent also cannot ask the human; it must return question candidates in its report for the main agent to raise under `.claude/rules/asking.md`.
- **Authoring consequence:** express every guard you can as a permission rule in `settings.json` (subagents inherit it); reserve hooks for the positional cases a static rule cannot express, treating them as main-session protection only.

## Routing

**What it is:** how an agent gets from the always-loaded entry point to the exact document a task needs.

**The chain:** root `CLAUDE.md` → `PROJECT_SUMMARY_CONCISE.md` (an orientation index and a "need X → read Y" table) → the canonical design docs (`docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, `docs/DATA_MODEL.md`, `docs/DATA_GOVERNANCE.md`, `docs/TESTING.md`) and `IMPLEMENTATION_PLAN.md`.

**The load-bearing distinction:** canonical docs describe design intent and are timeless; `IMPLEMENTATION_PLAN.md` is the one place implementation status lives. A deviation, a "current vs target" gap, a completion note, or a dated status line belongs in the plan, never in a canonical doc. `.claude/rules/doc-governance.md` enforces this, and it prevents the classic failure where docs slowly rot into stale status the agent then trusts.

## The three orders

Three orderings are easy to conflate, so each has exactly one home and is linked to by name — because a duplicated instruction drifts, and a drifted copy is worse than none.

- **Authority order** — who wins when sources conflict. Single home: root `CLAUDE.md`.
- **Read order** — what to load first to save context. Also in root `CLAUDE.md`, and explicitly *not* an authority ranking: it is "load the minimum," not a claim about which source wins.
- **Composition order** — when several skills apply to one task, the sequence to run them in. Stated once in root `CLAUDE.md`.

This guide intentionally does not reproduce the rankings themselves — read them in `CLAUDE.md`, for the same single-home reason.

## Guardrails

**What it is:** enforcement that does not depend on the agent choosing to comply. It is premise 2 in practice.

**How the repo applies it:** anything that must always hold is a deterministic hook or a permission rule, not prose. The hooks live in `.claude/hooks/`: a secret-file block on writes, and a PreToolUse chain on Bash that blocks git mutations, blocks reads of secret-bearing files, guards production operations, guards destructive database commands, guards dangerous git history rewrites, and auto-approves genuinely read-only Bash (deny/ask decisions from the guards always beat that allow). A Stop hook blocks low-quality questions to the human.

Read-only is not the same as safe: an allowed read of a secret file plus an allowed network fetch is an exfiltration chain. That is why secret-bearing paths are denied to Bash outright (`guard-secret-reads.sh`) — the Read-tool deny rules do not bind shell commands — and why WebFetch is domain-scoped rather than open.

**Fail mode is chosen deliberately per hook:** security gates fail closed (deny on doubt); the read-only auto-approver fails open (falls back to the normal permission prompt) and refuses to reason about command substitution, redirects, or backticks, so it never approves something it cannot fully parse.

**Mirror static guards into permissions.** Anything a static permission rule can express is put in `settings.json`; hooks are reserved for the positional cases a rule cannot express — a `find -delete`, or a `curl -X POST` flag anywhere in the arguments. This matters because hooks do not fire inside a subagent while permission rules do (see "When each layer fires"), so a hook-only guard leaves subagents unprotected.

**Official grounding:** Anthropic's "put guardrails in hooks — an instruction is a request, not a guarantee" heuristic, and the documented subagent inheritance behavior.

## Permissions and approval fatigue

**What it is:** the allow/ask/deny policy in `settings.json`, and the discipline of cutting needless prompts without cutting safety. Too many prompts train a reviewer to click "allow" blindly, which is its own risk.

**How the repo applies it:** precedence is `deny > ask > allow`. There is no broad wildcard allow on a mutating or network command head. Claude Code checks each part of a compound command (`&&`, `;`, `|`) against the rules independently, but a rule sees only the command prefix — a mutating flag later in the argument list (`find … -delete`, `curl -X POST`) is invisible to it; those positional cases are what the guard hooks are for. Network reads route through domain-scoped `WebFetch(domain:…)` allows rather than an allowed `curl`; `sqlite3` is auto-approved only with `-readonly`. Prompts are reduced only three safe ways: the read-only-Bash auto-approver, narrowly-scoped exact allows, and — per developer, never committed — OS sandboxing. The `fewer-permission-prompts` skill prunes an over-grown local allow-list.

`.claude/settings.local.json` deserves its own mention: it is the machine-local, gitignored sibling where every "always allow" clicked at a prompt accumulates, and its allows merge silently into the effective policy (a deny at any scope still wins). It drifts toward over-permission by construction — prune it periodically, and never let it carry a broad allow for something the committed policy deliberately asks about.

**Official grounding:** the permissions doc's `deny > ask > allow` precedence and per-part compound-command checking, its recommendation to prefer `WebFetch(domain:…)` over `curl`, the settings doc's scope-merge behavior, and the sandboxing guidance.

## What belongs where

| Layer | Holds | Loads |
|---|---|---|
| root `CLAUDE.md` | process, the three orders, non-negotiable rules | always |
| nested `CLAUDE.md` | subtree-specific orientation | when a subtree file is opened |
| `.claude/rules/*.md` | per-path "how" (controllers, services, views, db, adapters, tests, comments, secrets) | when a matching file is Read/Edited |
| `.claude/skills/*` | repeatable playbooks (add a public page, run a review, sync docs) | when invoked |
| `.claude/hooks/*` | deterministic guardrails that *block*, not advise | on the matching tool call |
| `.claude/agents/*` | read-only subagents that isolate context (`auditor`, `researcher`) | when spawned |
| `.claude/settings.json` | permission allow/ask/deny and hook wiring | always (enforced by the runtime) |
| memory store | machine-local or Claude-product facts with no repo home | index always; entries on recall |
| `docs/*` | design intent (canonical) and permanent operating procedure | on demand |
| service file-header JSDoc | the per-service and per-page contract | with the file |
| `tests/` + `scripts/ci/*` | executable backpressure | in CI |

Most rules are path-scoped by a `paths:` glob — including `claude-harness-governance.md`, whose glob covers `.claude/**` so it attaches whenever you open a harness file to edit. **Three** rules are deliberately glob-less and are linked to by name because they are not tied to one subtree: `asking.md` (how to put a question to a human), `memory.md` (the memory write gate), and `deployed-surface.md` (how to determine what the app actually deploys and classify user stories — shared by the review skills).

## Memory

**What it is:** a small, indexed store of durable facts, treated as a scarce resource that competes for context like everything else.

**How the repo applies it:** memory holds only facts with **no repo home** — machine-local pointers and Claude-product behavior. Anything already stated or enforced by a `CLAUDE.md`, a rule, a hook, or a committed doc does not go in memory; if a rule or doc *could* hold it but does not yet, promote it there instead. Status and dated progress belong in `IMPLEMENTATION_PLAN.md`, never in memory. Never write a `docs/…` filename into a memory body as a live citation — docs get deleted and the note goes stale; state the concept in words.

`.claude/rules/memory.md` is the write-time gate (a five-step audit, announced in the conversation and gated by a permission prompt). The `audit-memory` skill runs that same checklist over the whole store on demand to prune duplicates, dead links, stale citations, and malformed entries.

**Official grounding:** the memory doc's instruction to review rules and memory periodically and remove what is outdated.

## Changing the harness safely

**What it is:** the workflow for editing the harness itself. It is premise 3 in practice, and its single home is `.claude/rules/claude-harness-governance.md`, which auto-attaches whenever you open a `.claude/**` file.

- **Start any non-trivial change in Plan Mode.** State the evidence (what is broken or missing) before proposing the edit, and land it only with explicit human approval shown as literal before/after. Hooks and settings are security-sensitive — never change them silently.
- **A rule** is per-path "how"; give it a `paths:` glob unless it is a shared, linked-to rule, and never restate the authority order — link to it.
- **A skill** needs a specific description (what it does and when to use it) kept short — it is loaded into every session's context — an explicit trigger and stop condition, and `disable-model-invocation: true` if it is explicit-only or side-effect-heavy (so it never auto-fires and its description leaves always-loaded context). Keep `SKILL.md` under ~500 lines; move long reference material into a plain `REFERENCE.md` (no frontmatter, no command).
- **A hook** emits a valid PreToolUse decision (allow/deny/ask) or exits 0 to defer, picks its fail mode deliberately, is reviewed for bypass (substitution, redirection, pipes, `xargs`, quoting), ships with a fixture test (pipe a synthetic event on stdin), and is wired in `settings.json`.
- **A permission** follows `deny > ask > allow`, adds no broad mutating/network allow, and keeps the committed file pretty-printed.
- **A subagent** keeps a read-only tool set unless there is a reason otherwise, and a clear evidence-cited output contract.

**Why this rigor:** a committed `.claude/` that any contributor — or a compromised dependency — could alter is a real attack surface; public advisories have shown a malicious `.claude/settings.json` reaching code execution and credential exfiltration before a trust prompt appears. Treating the config as reviewed, tested production code is the mitigation, and keeping platform-specific settings in each developer's own `~/.claude/settings.json` (never committed) keeps `.claude/` behaving identically for everyone.

## The harness self-check

`scripts/ci/assert_claude_harness.sh` verifies the harness stays internally consistent: `settings.json` is valid JSON; every wired hook exists and is executable; no live file references a deleted doc; explicit-only skills carry `disable-model-invocation`; every `SKILL.md` is under the line ceiling or backed by a reference file; `sqlite3` is never auto-allowed without `-readonly`; and every concrete rule/skill/hook/agent reference resolves. It runs as the `harness` job in `.github/workflows/ci.yml`. Run it locally with `bash scripts/ci/assert_claude_harness.sh`. A known, tracked exception is a commented, removable entry near the top of the script — never a silent skip.

Checking the config's *own* consistency in CI goes a step beyond current vendor documentation; it is a deliberate practice this repo adopts because its harness is large enough to drift on its own. On a small harness it would not yet earn its keep.

## Anti-patterns

- **A bloated root `CLAUDE.md`.** Subtree detail belongs in a scoped rule; rarely-needed detail belongs in an on-demand doc.
- **Duplicating the authority order.** Restated in several places it drifts, and a copy that ranks code above design intent inverts policy. Keep one home, linked everywhere.
- **Restating a shared procedure.** A derivation copied into several skills drifts into inconsistent versions — the deployed-surface definition and its classification taxonomy live once in `deployed-surface.md`, cited by name. Reference a shared rule by name, never by a section number that rots.
- **A vague or over-triggering skill.** A broad description auto-fires on near-miss phrases; make explicit-only skills `disable-model-invocation: true` and write a precise trigger.
- **A broad mutating allow.** `Bash(sqlite3:*)` auto-approves silent writes; scope it to `Bash(sqlite3 -readonly:*)` and add a guard hook for write forms.
- **Over-confidence in a hook regex.** A substring match is bypassable by substitution or reordering; prefer a static permission rule where one suffices, and mirror it into `settings.json` so subagents inherit it.
- **An undocumented hook change.** Every hook ships with a fixture test and human approval; a policy change to a guard is reviewed, not quietly edited.
- **Stale memory.** Duplicates, citations of deleted docs, and one-off status accumulate silently; the write gate plus the periodic `audit-memory` pass keep the store honest.
- **A canonical doc polluted with status,** or `IMPLEMENTATION_PLAN.md` polluted with long-term design — the two must not blur.
- **A dated status journal inside a skill body.** It reloads into context on every invocation; status goes in the plan, the skill keeps only timeless procedure.
