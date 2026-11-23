---
paths:
  - "scripts/**"
  - "deploy_to_aws.sh"
---

# Operator script rules

## When to use

Writing or changing anything under `scripts/` that an operator runs against a real environment:
an install, an apply, an activation, a provisioning step, a diagnostic. Secret transport has its own rule,
`.claude/rules/script-secret-safety.md`, and the closing report has its own,
`.claude/rules/script-closing-report.md`; this one covers the shape of the script around them.

## What a script owns

The design position lives in the design decisions: a script owns the whole operation, not the
mutating step in the middle of it. In practice:

- **Preconditions run inside the script.** A precondition an operator is asked to check first is
  a precondition that is skipped under pressure. If it can be checked from here, check it and
  refuse; if it cannot, state it and require the operator to attest to it.
- **Confirmation is typed, and read from a terminal.** Never from stdin when stdin carries a
  credential: the prompt would consume the credential as the answer and echo it on the failed
  comparison. And never from the environment: the accept-without-asking flag is assigned by the
  shared helper, so an exported value in the operator's shell cannot stand in for the typed answer.
  Use `confirm_from_tty`; do not re-implement the prompt.
- **The credential file is chosen by the account, not by the operator and not by a variable.**
  `scripts/lib/operator-credential.sh` picks it from the account the alias connects as (its header
  explains the rule); no script builds the path itself and nothing selects it by environment
  variable. Nothing falls back: a selected file that is missing is refused by name, and a mode
  other than 600 or 400 is refused with a message saying to rotate. Say on stderr which file the
  rule chose, on every run.
- **The word is always `APPLY`.** One word for every confirmation in the tree, whatever the script
  and whatever the direction; a yes-or-no question is answered yes or no. State what is being
  confirmed in full, immediately before the prompt,
  and never encode it in the word: a phrase per script gives the operator something to look up, and
  looking it up is what teaches them to reach for whatever flag skips the prompt.
  Where a confirmation carries a direction, the direction comes from the flag and the prose, not from
  the word.
- **A production deploy asks every time.** Whatever the mode, including a code-only deploy that
  leaves the database alone, because the release it replaces is what the public is served. No flag
  and no environment variable supplies that confirmation in advance, and a run with no terminal
  attached is refused rather than waved through, so no scheduled job, continuous-integration runner
  or agent session can deploy production unattended. Staging is deliberately not gated this way.
- **Verification proves the outcome.** Not that a command was invoked, and not that a service is
  running, if what matters is that it is configured and doing its job.
- **The closing report states every error and warning the run met**; the requirement is the
  script closing-report rule, `.claude/rules/script-closing-report.md`.
- **Cleanup is on a trap**, covering EXIT, INT, TERM and HUP, so an interrupt leaves nothing behind
  that a successful run would not have left. A script on the closing-report library registers
  cleanup through it (`.claude/rules/script-closing-report.md`). A remote half keeps its own trap.

  One narrow exception: where whether to clean up depends on how far the run got (a created file
  that a retry needs once its content has reached an environment), the trap covers INT and TERM
  only and the ordinary exits decide for themselves, since a blanket EXIT trap would destroy what
  a retry needs. A file the operator supplied is never touched either way.

## Four invariants

A violation of any of these fails silently.

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
4. **Identity is an AWS fact, never a file name.** There are two kinds of principal in this
   estate and no others: IAM users, and the IAM roles they assume. Everything a run is allowed
   to do follows from which of those it is acting as, and the only way to know that is to ask
   `sts get-caller-identity` and judge the ARN it returns.

   A named profile is not a principal, so no script decides what a run may do, reports whose
   machine it is on, or infers who is running it, by testing which profile exists or matching a
   profile's name; a run that selects a profile still proves what it got. Each profile is named
   for the principal it reaches (`footbag-operator`, `FootbagDevTester`), so text naming one must
   say whether it means the profile or the principal. No mechanical check enforces this; it is
   held by review and by the assertions in `scripts/lib/aws-identity.sh`.

## The shape

- A `--target` naming the environment, with **no default**, and nothing else naming one: the host is
  `footbag-<target>`, buckets, parameter paths and addresses derive from the target, and no flag or
  variable overrides them. Before changing or reporting anything on a host, call `require_host_is`,
  which refuses a host whose recorded `FOOTBAG_ENV` is missing or differs. Two exceptions to the
  no-default rule, both recorded in the design decisions: a script whose subject exists in one
  environment only, and `deploy_to_aws.sh`, which defaults to staging; production is protected there
  by the typed confirmation every production deploy requires, refused outright with no terminal
  attached.
- The deploy works in `$REPO_ROOT`, never the working directory: it moves there once, as soon as it
  has computed it, ships from there, and reaches every script it hands off to by a path built from
  its own location rather than a relative one. The same holds for the entry point an operator
  types: anchor the whole run, not only the path it hands off, or its build steps and preflights
  silently resolve against the caller's directory.
- A guard stays fail-closed wherever it is written or moved: refuse anything that is not exactly
  the safe value (`!= "false"`, never `== "true"`). A failed read is never "absent": only the
  tool's own not-found (`ParameterNotFound`, `NoSuchEntity`) is, and any other failure is an error
  carrying the tool's message.
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
- Idempotent, wherever the script changes a real environment: a host, an AWS resource, a
  database, a secret, or an operator's own files. Three things, all required. A re-run does no
  harm. A re-run after a stop part way finishes the work rather than refusing or looping on the
  half-done state. And "already done" is decided by proving the outcome (a login, a read-back,
  sudo accepting the password), never by a proxy such as a file existing, and the run says so
  rather than repeating the work. Read-only diagnostics, the CI gates and the shared libraries
  are exempt: they hold no state to resume.
- A header that states why the script exists and what it refuses to do, followed by usage and
  flags.

## Testing

Every operator script has a companion test under `tests/integration/` named
`<script>.script.test.ts`. It drives the script through its test seam and pins the refusals: the
argument guards, the preconditions, and the cleanup behaviour. Each refusal sits beside a case
where the same guard lets a valid run through, so a script that refuses everything cannot pass.
The mutating path is the operator's and is not exercised there, except wherever the script's own
reading of its outcome decides what it does next or what it reports: there the suite drives the
mutating path end to end against stand-ins (a stub binary, a scratch database), so the verdict
comes from a real run. The archive publisher, whose post-publish checks gate the CDN
invalidation, and the pause levers, which report the switch they read back, are the worked
examples. Nothing real is reached or mutated.
Synchronous spawns use the shared bound from `tests/fixtures/spawnGuard.ts`. A script that parses
output a tool never promised to keep stable (a package manager's listing, an error message) is
tested against a sample captured from a real run, with its capture date, under the testing rule.

## Do not

- Leave a step in a runbook that the script could take.
- Judge success by the exit status of a command whose failure you have documented as normal.
- Delete, revoke or roll back anything the run did not create.
- Prompt on stdin in a script that also receives a credential there.
