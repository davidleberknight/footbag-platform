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
  comparison.
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
  never inherited from ambient state.
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
