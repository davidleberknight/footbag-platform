# Footbag Website Modernization Project -- Claude Code Guide

**Document Purpose:**

This document explains how this repository's Claude Code harness works, why it is built that way, and how it meets Anthropic's published best practices. Contributors are expected to understand it before using Claude Code in this repository. It assumes general familiarity with Claude Code: the official Anthropic documentation covers the product, and this document covers this repository's application of it.

This document is not loaded into Claude's context automatically; it carries no `paths:` glob and nothing imports it, so its length costs no agent context. The files it describes are the source of truth: `CLAUDE.md`, `.claude/rules/*`, `.claude/skills/*`, `.claude/hooks/*`, `.claude/agents/*`, and `.claude/settings.json`. Where this document and one of those files disagree, the file wins and this document is stale.

## Table of Contents

- [1. Design Premises](#1-design-premises)
- [2. Progressive Disclosure](#2-progressive-disclosure)
- [3. Path-Scoped Rules: Where Coding Conventions Live](#3-path-scoped-rules-where-coding-conventions-live)
- [4. Layer Activation and Subagent Behavior](#4-layer-activation-and-subagent-behavior)
- [5. Document Routing](#5-document-routing)
- [6. The Three Orders](#6-the-three-orders)
- [7. Deterministic Guardrails](#7-deterministic-guardrails)
- [8. Permission Policy and Approval Fatigue](#8-permission-policy-and-approval-fatigue)
- [9. Layer Responsibility Map](#9-layer-responsibility-map)
- [10. Memory Discipline](#10-memory-discipline)
- [11. Harness Change Control](#11-harness-change-control)
- [12. Continuous Self-Verification](#12-continuous-self-verification)
- [13. Anti-patterns This Harness Avoids](#13-anti-patterns-this-harness-avoids)

## 1. Design Premises

The harness follows from three premises. Every practice below is one of them applied to a concrete part of the system, and each section closes with the Anthropic guidance it follows, noting where the repository deliberately goes further.

1. **Context is finite, and every loaded token competes.** An agent reasons better over a small, relevant working set. The harness loads the minimum at session start and reveals the rest on demand.
2. **An instruction is a request; only machinery guarantees.** An agent follows prose probabilistically. Anything that must always hold is enforced by a deterministic hook or a permission rule, never by prose alone.
3. **The harness is production configuration.** It is version-controlled, reviewed, and tested like application code, because a defective line in it misdirects every future session.

The root `CLAUDE.md` is the natural next read after this document.

## 2. Progressive Disclosure

The first premise in practice: the always-loaded layer is a table of contents, and the chapters open only when a task needs them.

**What loads when:**

- *Always, every session:* the root `CLAUDE.md` (kept deliberately short), the top of the `MEMORY.md` index (roughly its first 200 lines / 25 KB), and every skill's one-line `description`. Metadata only, not the skill body.
- *Lazily:* a nested `CLAUDE.md` loads when a file in its subtree is opened; a rule with a `paths:` glob attaches only when a matching file is Read or Edited, never on a grep, a Bash command, or reasoning about an unopened path.
- *On demand:* canonical documents under `docs/`, a skill's full body (loaded when invoked, then resident for the session), and individual memory entries.

**In this repository:** detail lives where it loads only when relevant. A convention for editing controllers is a `paths:`-scoped rule, not a line in the root `CLAUDE.md`. A skill's long reference material moves into sidecar reference files beside it so the `SKILL.md` body stays under the roughly 500-line ceiling; `bug-hunt` (with `REFERENCE.md`, `DESIGN.md`, and `DOCSYNC.md`) is split this way.

**Official grounding:** Anthropic's progressive-disclosure model, the instruction to keep `CLAUDE.md` minimal ("would removing this line cause a mistake? if not, cut it"), and the roughly 500-line `SKILL.md` ceiling.

## 3. Path-Scoped Rules: Where Coding Conventions Live

Rules are the workhorse of the harness: nearly every line of code Claude writes here is governed by one. `.claude/rules/` holds a convention file per application layer: controllers, services, views, templates, the database layer, database write safety, adapters, tests, code comments, and secret handling in scripts. Each carries a `paths:` glob, so it attaches exactly when a file in its layer is opened and costs no context before that.

This is what keeps the root `CLAUDE.md` small without losing precision: the always-loaded file states process and non-negotiables, and the per-layer detail lives in the rule that loads only when that kind of code is being touched. When needed, the convention arrives verbatim, not paraphrased from the agent's memory of a long system prompt.

Two design details:

- **Attachment has a known gap, and the harness compensates.** A rule attaches on Read or Edit of a matching file, never on a grep or a Bash command. The root `CLAUDE.md` therefore imposes a pre-writing-code gate: before writing, the agent must enumerate the paths the change will touch and Read each path's governing rule itself rather than trusting auto-attach.
- **Three rules are deliberately glob-less** because they are not tied to one subtree; they are linked by name from `CLAUDE.md` and the skills that need them: `asking.md` (putting a question to a human), `memory.md` (the memory write gate), and `deployed-surface.md` (determining what the application actually deploys, shared by the review skills).

**Official grounding:** Anthropic's guidance to keep `CLAUDE.md` minimal and move detail into scoped, on-demand files. The pre-writing-code gate goes further, closing an attachment gap the vendor documentation does not call out.

## 4. Layer Activation and Subagent Behavior

The harness is designed around the precise trigger for each layer, and around how the picture changes inside a subagent.

**In the main session:**

- The **root `CLAUDE.md`** loads at session start and stays in context.
- A **nested `CLAUDE.md`** loads when a file in its subtree is opened.
- A **path-scoped rule** attaches when a matching file is Read or Edited (Path-Scoped Rules above covers the gap this leaves).
- A **skill's** one-line description is always in context; the body loads when a task matches it or the skill is named. A skill marked `disable-model-invocation: true` never auto-fires: it runs only when named, and its description leaves always-loaded context.
- A **hook** fires on the tool call its matcher names, before the tool runs (PreToolUse: allow, ask, or deny) or when the agent attempts to stop (Stop). The Bash matcher wires several guard hooks and a read-only auto-approver; when decisions differ, deny and ask always beat allow, so the guards win regardless of execution order.
- **Memory:** the index is always loaded; an individual entry is pulled on recall.

**Inside a subagent** (`auditor`, `researcher`, or any Task-spawned agent):

- A subagent runs in a fresh context with its own system prompt from its `.claude/agents/*.md` definition and its own tool allowlist. It does not inherit the parent's conversation or Plan Mode state; if it needs a rule's or skill's content, it reads the file.
- **Permission rules** (`settings.json` `permissions.*`) do apply to its tool calls. This inheritance is the guaranteed, version-proof floor a subagent can always count on.
- **`settings.json` hooks do NOT fire for a subagent's tool calls.** A PreToolUse hook declared in an agent's own `.claude/agents/*.md` frontmatter, however, does fire for that agent's calls, running alongside the inherited permission rules. This harness uses exactly that: the `auditor` (which has `Bash`) declares the full Bash guard chain and the read-only auto-approver in its frontmatter, so inside the auditor the secret-read block and the destructive-command guards are restored and read-only research stays prompt-free. The `researcher` declares none by design — it has no `Bash`, `Edit`, or `Write`, so there is nothing to guard.
- **Two layers, not one, and deliberately so.** The frontmatter hooks are defense-in-depth on top of the permission floor, never a replacement for it: subagent hook-firing has varied across Claude Code versions, so the permission rules still carry every statically-expressible guard. And a subagent spawned as a *built-in* type through the Agent tool (`Explore`, `general-purpose`, `Plan`) carries no custom frontmatter, so it gets only the permission floor plus its own tool restriction — not the read-only auto-approver. Route read-only work that needs that approver through the custom read-only agents, which do carry it.
- Because the approver now runs inside a subagent where a sibling guard might be absent, it is written to be **self-sufficient**: it never grants a command head while a write- or exec-capable predicate is present (`find … -exec`, even quote-obfuscated; `sort -o`; `date -s`), rather than leaning on a neighbour hook to catch what it waved through.
- A subagent cannot ask the human. It returns question candidates in its report for the main agent to raise under `.claude/rules/asking.md`.

**Authoring consequence:** every guard a static permission rule can express still goes in `settings.json`, because that is the one layer a subagent always inherits. The read-only auto-approver and the positional guards (a mutating flag later in the argument list) are additionally wired into the frontmatter of any custom agent that has `Bash`, so that agent is protected too — and the parser is kept conservative enough to be safe as a lone approver.

**Official grounding:** the documented subagent permission-inheritance behavior, and the documented agent-frontmatter `hooks:` schema (it mirrors `settings.json` and runs alongside the project hooks). The design still treats cross-version subagent hook-firing as best-effort and keeps the permission floor as the guarantee.

## 5. Document Routing

Routing is how the agent gets from the always-loaded entry point to the exact document a task needs.

**The chain:** root `CLAUDE.md`, then `PROJECT_SUMMARY_CONCISE.md` (an orientation index with fast-routing and what-to-read-next sections), then the canonical design documents (`docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, `docs/DATA_MODEL.md`, `docs/DATA_GOVERNANCE.md`, `docs/TESTING.md`) and `IMPLEMENTATION_PLAN.md`.

**The load-bearing distinction:** canonical documents describe design intent and are timeless; `IMPLEMENTATION_PLAN.md` is the one place implementation status lives. A deviation, a current-versus-target gap, a completion note, or a dated status line belongs in the plan, never in a canonical document. `.claude/rules/doc-governance.md` enforces this, preventing the failure mode where documentation rots into stale status the agent then trusts.

## 6. The Three Orders

Three orderings are easy to conflate, so each has exactly one home and is linked to by name; a duplicated instruction drifts, and a drifted copy is worse than none.

- **Authority order:** which source wins when sources conflict. Single home: the root `CLAUDE.md`.
- **Read order:** what to load first to conserve context. Also in the root `CLAUDE.md`, and explicitly not an authority ranking.
- **Composition order:** when several skills apply to one task, the sequence to run them in. Stated once in the root `CLAUDE.md`.

This document intentionally does not reproduce the rankings; they live in `CLAUDE.md`, for the same single-home reason.

## 7. Deterministic Guardrails

The second premise in practice: enforcement that does not depend on the agent choosing to comply.

**What is enforced.** A hook on Edit and Write blocks changes to secret-bearing files, and a chain of hooks runs on every Bash command:

- blocks git mutations;
- blocks reads of secret-bearing files;
- guards production operations;
- guards destructive database commands;
- guards dangerous git history rewrites;
- hard-denies `find` command-execution predicates (`-exec`, `-execdir`, `-ok`, `-okdir`), including quote- and backslash-obfuscated spellings such as `find . '-exec' …`;
- asks about mutating flags that ride on otherwise read-only commands (`find -delete`, `sort -o`, `tree -o`, `sed -i` and `sed`'s `w`/`e` write/exec commands);
- asks to confirm a full-suite `vitest run` invoked directly, which would bypass the smoke/e2e/dev excludes baked into `npm test` and pull in the live-AWS and local-stack tiers that run only on explicit instruction;
- auto-approves genuinely read-only Bash through `allow-readonly-bash.sh`, with deny and ask decisions from the guards always beating this allow — and the approver itself refusing any write- or exec-capable form rather than relying on a neighbour guard to catch it.

A Stop hook blocks low-quality questions to the human.

**Where the whole setup lives.** The guard scripts are in `.claude/hooks/` and are wired — with their matchers and order — in the `hooks` block of `.claude/settings.json`; the always-on permission floor is the `permissions` block of the same file; the read-only auto-approver is `.claude/hooks/allow-readonly-bash.sh`; and the guard hooks have fixtures in `scripts/ci/test_hooks.sh`. Read those files to see the entire enforcement surface — this document explains the design, not every line.

Read-only is not the same as safe: an allowed read of a secret file plus an allowed network fetch is an exfiltration chain. That is why secret-bearing paths are denied to Bash outright (`guard-secret-reads.sh`), since the Read-tool deny rules do not bind shell commands, and why WebFetch is domain-scoped rather than open.

**Fail mode is chosen per hook:** security gates fail closed and deny on doubt. The read-only auto-approver only ever grants: it emits allow for a command it can prove read-only and otherwise stays silent so the normal prompt decides. It splits the command into segments and checks each head against a read-only allowlist, stripping control keywords, grouping, and negation so a command hidden behind them (`( rm x )`, `! rm x`) is still checked, and stripping read-only wrappers (`timeout`, `nice`, `command -v`) so the wrapped command is what gets vetted. Command-runner heads that execute their argument (`env`, `command CMD`) are not treated as read-only, and a head is rejected when an exec or write flag rides mid-arguments where a prefix rule cannot see it (`git --output`, `git ls-remote --upload-pack`, `rg --pre`, `sed -i`, a second file operand). It also refuses a read-only-looking head that can still act: `find` carrying any action predicate (`-exec`/`-delete`/`-fprint`, matched after stripping quotes and backslashes so `find . '-exec' …` cannot slip through), `sort -o`, `date -s`, `hostname <name>`; it drops `printenv`, which would dump the whole environment; and it defers on bash 5.2 function substitution (`${ cmd; }`). It accepts a command substitution only when its content is a single simple read-only command, and stays silent on nested substitution, arithmetic, backticks, process substitution, or a write redirect; when it neutralizes separators inside quotes it honors backslash escaping, so a backslash-escaped quote cannot smuggle a live command past the segment split. Because deny and ask always beat allow, a write that slips past it is still caught by its guard — and because the approver also runs inside the `auditor` subagent, it is kept conservative enough to be safe as the lone approver there.

**Static guards are mirrored into permissions.** Anything a static permission rule can express is put in `settings.json`; hooks cover only the positional cases a rule cannot express, such as a `find -delete` or a `curl -X POST` flag anywhere in the arguments (see Layer Activation and Subagent Behavior for why this split protects subagents).

**Official grounding:** Anthropic's guidance that guardrails belong in hooks because an instruction is a request, not a guarantee.

## 8. Permission Policy and Approval Fatigue

The allow/ask/deny policy in `settings.json` embodies a discipline: cut needless prompts without cutting safety. Excess prompting trains a reviewer to approve blindly, which is its own risk.

**What the policy does:**

- Precedence is `deny > ask > allow`.
- Wildcard allows are limited to read-only command heads (the first word of a command) plus a short list of deliberate development conveniences: `mkdir`, `kill` and `pkill` for dev-server lifecycle, `npm test` and `npm run build`, and `git fetch`. Destructive, history-rewriting, package-installing, and service-touching commands sit in ask or deny.
- Claude Code checks each part of a compound command (`&&`, `;`, `|`) against the rules independently, but a rule sees only the command prefix. A mutating flag later in the argument list (`find ... -delete`, `curl -X POST`) is invisible to it; those positional cases are what the guard hooks cover.
- Network reads route through domain-scoped `WebFetch(domain:...)` allows and WebSearch rather than an allowed `curl`, and `sqlite3` is auto-approved only with `-readonly`.
- Prompts are reduced in only three safe ways: the read-only-Bash auto-approver `allow-readonly-bash.sh`, narrowly scoped exact allows, and per-developer OS sandboxing that is never committed. The `fewer-permission-prompts` skill prunes an overgrown local allow-list.

**The approval-fatigue fix, concretely.** A permission allow rule is a prefix match on a string; it cannot parse a compound command or see a mutating flag later in the arguments, so it can never safely auto-approve the kind of command real research uses — a pipeline, a loop, a `$(…)`, a `VAR=… cmd`. That is the job of `allow-readonly-bash.sh`, a PreToolUse hook that actually parses the Bash command: it splits every segment (across `&&`, `;`, `|`, subshells, control constructs), strips read-only wrappers, vets each command head against a read-only allowlist, resolves `$(…)` fail-closed, and returns *allow* only when the entire command is provably read-only. Anything it cannot prove inert it leaves alone, so the normal prompt decides. The result: complex read-only research runs without a prompt, while a genuinely mutating command still stops — the specific outcome the "read-only never asks, mutations still gate" requirement demands. This is the same class of solution (real shell parsing, not prefix matching) that the tools which credibly reduce this fatigue all converge on.

One prompt class the harness cannot remove is Claude Code's own built-in check: a compound command that begins with `cd` and also redirects output (even `2>/dev/null`) is flagged as a possible path-resolution bypass. That guard lives inside the product, not in this repo's settings or hooks, and because an `allow` never outranks an `ask`, no hook or permission rule here can suppress it — even though the read-only auto-approver would otherwise allow the command. It is avoided behaviorally instead: the root `CLAUDE.md` instructs relying on the persistent working directory and absolute paths rather than prefixing `cd`.

**Repo-wide vs machine-local: where a rule belongs.** Three files hold permission rules, and which one a rule lives in is a deliberate decision, not an accident of where it was first clicked:

- `.claude/settings.json` — **repo-wide.** Committed and version-controlled, so every developer and CI get the identical policy. All deliberate allow/ask/deny rules and all hook wiring live here. This is the default home for anything shareable and platform-independent.
- `.claude/settings.local.json` — **machine-local, per-developer.** Gitignored, so it is never shared and is absent in CI. It is where clicking "always allow" at a prompt silently writes a rule, so it drifts toward over-permission by construction and is kept near-empty: the safe, general rules belong in the committed file instead, and the rest is deleted. The harness self-check scans it for a dangerous broad allow (an un-`-readonly` `sqlite3`, an interpreter or shell wildcard that amounts to `Bash(*)`) so that drift cannot hide there again.
- `~/.claude/settings.json` — **user-global, per-machine, every project.** The correct and only home for a rule that must name an absolute machine-specific path: the session scratchpad directory (so the AI's own temp/scratch files never prompt) and the memory-store path. These cannot be committed — an absolute home path is wrong for every other machine, and the team-portability rule forbids machine-specific paths in `.claude/`.

Precedence across all three is `deny > ask > allow`: a `deny` at any scope wins, and a local `allow` can only loosen, never override, a committed `deny`. Rule of thumb: **repo-wide for all shared, platform-independent policy; machine-local only for an absolute path unique to one computer.**

**Official grounding:** the permissions documentation's `deny > ask > allow` precedence and per-part compound-command checking, its recommendation to prefer `WebFetch(domain:...)` over `curl`, the settings documentation's scope-merge behavior, and the sandboxing guidance.

## 9. Layer Responsibility Map

| Layer | Holds | Loads |
|---|---|---|
| root `CLAUDE.md` | process, the three orders, non-negotiable rules | always |
| nested `CLAUDE.md` | subtree-specific orientation | when a subtree file is opened |
| `.claude/rules/*.md` | per-path coding conventions (controllers, services, views, db, adapters, tests, comments, secrets) | when a matching file is Read/Edited |
| `.claude/skills/*` | repeatable playbooks (add a public page, run a review, sync docs) | when invoked |
| `.claude/hooks/*` | deterministic guardrails that block, not advise | on the matching tool call |
| `.claude/agents/*` | read-only subagents that isolate context (`auditor`, `researcher`) | when spawned |
| `.claude/settings.json` | permission allow/ask/deny and hook wiring | always (enforced by the runtime) |
| memory store | machine-local or Claude-product facts with no repo home | index always; entries on recall |
| `docs/*` | design intent (canonical) and permanent operating procedure | on demand |
| service file-header JSDoc | the per-service and per-page contract | with the file |
| `tests/` + `scripts/ci/*` | automated enforcement of code and harness invariants | in CI |

`claude-harness-governance.md` is itself path-scoped with a glob covering `.claude/**`, so the rules for changing the harness attach automatically whenever a harness file is opened for editing.

## 10. Memory Discipline

Memory is a small, indexed store of durable facts, treated as a scarce resource that competes for context like everything else.

**The discipline:** memory holds only facts with no repository home, meaning machine-local pointers and Claude-product behavior. Anything already stated or enforced by a `CLAUDE.md`, a rule, a hook, or a committed document does not go in memory; if a rule or document could hold it but does not yet, it is promoted there instead. Status and dated progress belong in `IMPLEMENTATION_PLAN.md`, never in memory. A `docs/` filename is never written into a memory body as a live citation, because documents get deleted and the note goes stale; the concept is stated in words instead.

`.claude/rules/memory.md` is the write-time gate: a five-step audit, announced in the conversation and backed by a permission prompt. The `audit-memory` skill runs the same checklist over the whole store on demand to prune duplicates, dead links, stale citations, and malformed entries.

**Official grounding:** the memory documentation's instruction to review rules and memory periodically and remove what is outdated.

## 11. Harness Change Control

The third premise in practice: the workflow for editing the harness itself. Its single home is `.claude/rules/claude-harness-governance.md`, which auto-attaches whenever a `.claude/**` file is opened.

- **Any non-trivial change starts in Plan Mode.** The evidence (what is broken or missing) is stated before the edit is proposed, and the edit lands only with explicit human approval shown as literal before/after text. Hooks and settings are security-sensitive and are never changed silently.
- **A rule** is per-path convention. It gets a `paths:` glob unless it is a shared, linked-to rule, and it links to the authority order rather than restating it.
- **A skill** needs a specific, short description of what it does and when to use it (the description loads into every session's context), an explicit trigger and stop condition, and `disable-model-invocation: true` if it is explicit-only or side-effect-heavy. `SKILL.md` stays under roughly 500 lines; long reference material moves into a plain `REFERENCE.md` beside it, a file with no frontmatter so it is inert reference text rather than a second skill.
- **A hook** emits a valid PreToolUse decision (allow, deny, or ask) or exits 0 to defer, and picks its fail mode deliberately. It is reviewed for bypass via substitution, redirection, pipes, `xargs`, and quoting; it ships with a fixture test that pipes a synthetic event on stdin; and it is wired in `settings.json`.
- **A permission** follows `deny > ask > allow`, adds no broad mutating or network allow, and keeps the committed file pretty-printed.
- **A subagent** keeps a read-only tool set unless there is a documented reason otherwise, and a clear evidence-cited output contract.

**Why this rigor:** a committed `.claude/` directory that any contributor, or a compromised dependency, could alter is a real attack surface. Public advisories have shown a malicious `.claude/settings.json` reaching code execution and credential exfiltration before a trust prompt appears. Treating the configuration as reviewed, tested production code is the mitigation, and keeping platform-specific settings in each developer's own uncommitted `~/.claude/settings.json` keeps `.claude/` behaving identically for everyone.

**Official grounding:** Anthropic's guidance to version-control and review Claude Code configuration. The fixture-test requirement for hooks goes further.

## 12. Continuous Self-Verification

`scripts/ci/assert_claude_harness.sh` verifies that the harness stays internally consistent. It checks that:

- `settings.json` is valid JSON;
- every wired hook exists and is executable;
- no live file references a deleted document;
- explicit-only skills carry `disable-model-invocation`;
- every `SKILL.md` is under the line ceiling or backed by a reference file;
- `sqlite3` is never auto-allowed without `-readonly`;
- every concrete rule, skill, hook, and agent reference resolves;
- the committed allow list never regains a mutation-capable command head or an unscoped `WebFetch(domain:*)`;
- no harness file depends on a machine-local memory-store path;
- the hook fixture suite passes, so a reopened bypass or a new over-block fails the build;
- the machine-local `settings.local.json`, when present, carries no dangerous broad allow.

It runs as the `harness` job in `.github/workflows/ci.yml` and locally via `bash scripts/ci/assert_claude_harness.sh`. A known, tracked exception is a commented, removable entry near the top of the script, never a silent skip.

Checking the configuration's own consistency in CI goes a step beyond current vendor documentation; the harness here is large enough to drift on its own, so the check earns its keep.

## 13. Anti-patterns This Harness Avoids

Common failure modes in Claude Code setups, each paired with this repository's countermeasure.

- **A bloated root `CLAUDE.md`.** Subtree detail belongs in a scoped rule; rarely needed detail belongs in an on-demand document.
- **Duplicating the authority order.** Restated in several places it drifts, and a copy that ranks code above design intent inverts policy. One home, linked everywhere.
- **Restating a shared procedure.** A copy in several skills drifts into inconsistent versions. The deployed-surface definition lives once in `deployed-surface.md`, cited by name; shared rules are referenced by name, never by a section number that rots.
- **A vague or over-triggering skill.** A broad description auto-fires on near-miss phrases. Explicit-only skills carry `disable-model-invocation: true`, and every skill has a precise trigger.
- **A broad mutating allow.** `Bash(sqlite3:*)` auto-approves silent writes; the repository scopes it to `Bash(sqlite3 -readonly:*)` and guards write forms with a hook.
- **Over-confidence in a hook regex.** A substring match is bypassable by substitution or reordering. A static permission rule is preferred where one suffices, mirrored into `settings.json` so subagents inherit it.
- **An undocumented hook change.** Every hook ships with a fixture test and human approval; a policy change to a guard is reviewed, not quietly edited.
- **Stale memory.** Duplicates, citations of deleted documents, and one-off status accumulate silently. The write gate plus the periodic `audit-memory` pass keep the store honest.
- **A canonical document polluted with status,** or `IMPLEMENTATION_PLAN.md` polluted with long-term design. The two must not blur.
- **A dated status journal inside a skill body.** It reloads into context on every invocation. Status goes in the plan; the skill keeps only timeless procedure.
