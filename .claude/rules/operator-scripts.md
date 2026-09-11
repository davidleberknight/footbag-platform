---
paths:
  - "scripts/**"
---

# Operator script rules

## When to use

Writing or changing anything under `scripts/` that an operator runs against a real environment:
an install, an apply, an activation, a provisioning step, a diagnostic. Secret transport has its
own rule and is not restated here; this one covers the shape of the script around it.

## What a script owns

The design position lives in the design decisions: a script owns the whole operation, not the
mutating step in the middle of it. In practice that means four things, and the failure mode of
each is a real one.

- **Preconditions run inside the script.** A precondition an operator is asked to check first is
  a precondition that is skipped under pressure. If it can be checked from here, check it and
  refuse; if it cannot, state it and require the operator to attest to it.
- **Confirmation is typed, and read from a terminal.** Never from stdin when stdin carries a
  credential: the prompt would consume the credential as the answer and echo it on the failed
  comparison. And never from the environment: the accept-without-asking flag is assigned by the
  shared helper, so an exported value in the operator's shell cannot stand in for the typed answer.
  Use `confirm_from_tty`; do not re-implement the prompt.
- **The word is always `APPLY`.** One word for every confirmation in the tree, whatever the script
  and whatever the direction. State what is being confirmed in full, immediately before the prompt,
  and never encode it in the word: a phrase per script gives the operator something to look up, and
  looking it up is what teaches them to reach for whatever flag skips the prompt. A script that asks
  for anything else fails the conventions suite, which counts the prompts rather than sampling them.
  Where a confirmation carries a direction, the direction comes from the flag and the prose, not from
  the word.
- **A production deploy asks every time.** Whatever the mode, including a code-only deploy that
  leaves the database alone, because the release it replaces is what the public is served. No flag
  and no environment variable supplies that confirmation in advance, and a run with no terminal
  attached is refused rather than waved through, so no scheduled job, continuous-integration runner
  or agent session can deploy production unattended. Staging is deliberately not gated this way.
- **Verification proves the outcome.** Not that a command was invoked, and not that a service is
  running, if what matters is that it is configured and doing its job.
- **Cleanup is on a trap**, covering EXIT, INT and TERM, so an interrupt leaves nothing behind
  that a successful run would not have left.

## Three invariants

Each of these was violated by a script in this repository, and each failure was silent.

1. **A trap may only undo what the run itself created and nothing outside has recorded yet.**
   Once a credential has been written into the vault, or a resource has been handed to another
   system, an unfinished run must report the state and leave it alone. Withdrawing it makes the
   external record a lie, which is worse than the half-finished state it was trying to tidy.
2. **A check asserts the outcome, not the invocation.** "The service is active" is not "the
   service is configured". "The alarm exists" is not "the alarm is watching something". State
   what the check would fail to notice, and if that thing is the failure you care about, check
   something else.
3. **A step whose failure is expected is not the verdict on the run.** Where a tool is known to
   exit nonzero on success, tolerate that exit explicitly, say so in the output, and judge the
   run on a condition that actually distinguishes the outcomes.

## The shape

- A `--target` naming the environment, with **no default**. Which environment a run lands on is
  never inherited from ambient state. Two exceptions, both deliberate and recorded in the design
  decisions. A script whose subject exists in exactly one environment, such as the live-payments
  levers, where the environment is a property of the thing rather than a choice the operator is
  making. And the deploy entry points, which take `DEPLOY_TARGET` from the environment and default it
  to staging: the wrapper refuses any value that is not one of the two known environments, so a typo
  cannot route a deploy somewhere unintended, and a forgotten variable sends the run to the
  environment whose data is disposable. Production is protected by a different mechanism instead,
  which is the one that matters: every production deploy stops for a typed confirmation read from the
  terminal, and refuses outright when no terminal is attached, so no scheduled job or agent session
  can replace what the public is served unattended.
- The deploy works in `$REPO_ROOT`, never the working directory: it moves there once, as soon as it
  has computed it, ships from there, and reaches every script it hands off to by a path built from
  its own location rather than a relative one. A relative source means a run started from elsewhere ships a
  tree that matches none of the anchored includes, and the remote half then promotes that near-empty
  tree over the live install with `--delete`. Anchoring the source alone leaves the same defect on the
  building side, where the database rebuild, the smoke checks, the Terraform reads and the media check
  resolve against the caller's directory: the run then builds one database and ships another. The same
  applies to the entry point an operator types, and there it is worse, because its preflights fail open
  rather than loudly. A wrapper that anchors only its hand-off still measures disk on whichever
  filesystem the caller stood on, still finds no database to check for a lock, and still conditions its
  schema gates on a file it is now looking for in the wrong place — so the run proceeds without the gate
  that exists to stop it, and says nothing. Anchor the whole run, not the path it hands off.
- A named test seam (an environment variable replacing the external binary) for anything that
  reaches AWS or a host, and the script **says on stderr when the seam is in use**, because a
  stubbed run proves nothing about the estate.
- A terminal guard on anything that prompts: either read the answer from the terminal device, or
  refuse unless stdin, stdout and stderr are all terminals.
- Every temp file created with `mktemp`, mode-restricted if it holds anything sensitive, and
  paired with a trap in the same breath.
- A values file is written through its symlink with `cat >`, never `mv`, so the link into the
  private operations checkout survives.
- A diff is shown before any file an operator owns is changed.
- Idempotent: safe to re-run, and a re-run of an already-done step says so rather than repeating
  the work.
- A header that states why the script exists and what it refuses to do, followed by usage and
  flags.

## Testing

Every operator script has a companion test under `tests/integration/` named
`<script>.script.test.ts`. It drives the script through its test seam and pins the refusals: the
argument guards, the preconditions, and the cleanup behaviour. The mutating path is the
operator's and is not exercised there. Synchronous spawns use the shared bound from
`tests/fixtures/spawnGuard.ts`.

## Do NOT

- Leave a step in a runbook that the script could take.
- Judge success by the exit status of a command whose failure you have documented as normal.
- Delete, revoke or roll back anything the run did not create.
- Prompt on stdin in a script that also receives a credential there.
