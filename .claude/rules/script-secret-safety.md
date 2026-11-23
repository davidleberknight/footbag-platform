---
paths:
  - "scripts/**"
  - "legacy_data/scripts/**"
  - "legacy_data/tools/**"
  - "deploy_to_aws.sh"
---

# Script secret-transport safety rules

## When to Use

Any shell script or deploy/install step that handles a secret: a sudo or account password, an AWS access key / secret key, an API key, a signing key, a token, or seed content carrying credentials. Scope: `scripts/**` (including `scripts/internal/**`) and any script moving a secret across a process, host, or container boundary.

## Hard rule

A secret must never appear in any process's argv on any host: `ps -ef` (any reader) can capture it. Carry every secret over stdin (pipes) or a restricted `file://` temp file, never as a command-line argument or an inline `-e VAR=value`.

## Rules

- Read sudo passwords from stdin (`sudo -k -S -p ""`), never as an argument; feed the password as the first line of the same pipe. `-k` ignores any cached sudo timestamp, so sudo always consumes exactly the one line the pipe supplies. Without it, a host whose operator recently used sudo consumes nothing, and the password falls through to whatever reads stdin next.
- Pass secret values into a remote shell by appending them to the SSH stdin stream (shell-builtin `printf '%q'` assignments + cat-piped body), not via `ssh host "cmd $SECRET"`.
- Never use `docker compose exec -e VAR=value` for secret content; pipe via `-T` stdin and reassign from `$(cat)` inside the container.
- Write a secret destined for a file via a restricted (`umask 077` / mode `0600`) temp file and `install`/`file://`, then `shred` it; suppress shell history for any pasted-key step.
- Do not `echo`/`printf` a secret into another command's argv, and do not log it.
- Emit a secret meant for a human to `/dev/tty`, never to stdout, which a wrapper, a CI job, or an agent session may be capturing. Verify the terminal exists before minting or storing the secret: a credential nobody can read is not a failed run, it is a live credential needing cleanup. Model: `scripts/admin-bootstrap-token.sh`.
- A script that prompts verifies stdin is a terminal before reading. The `/dev/tty` rule above protects scripts that expect a credential on stdin; this protects the ones that do not, because nothing stops a caller redirecting a credential file into them and `read` will then consume the password as the answer to a confirmation. Either read the answer from `/dev/tty`, or refuse unless stdin, stdout and stderr are all TTYs. Models: `scripts/staging_diagnostics.sh` and `scripts/arming.sh` respectively.

## Do not

- Pipe `sudo -S` into a stdin-consuming file writer (`tee`, `cat`, `dd`): if sudo consumes nothing, the password becomes the first line of the target file. Write the file from inside the remote half instead, through a root-side restricted temp file promoted with `install` (the `install_via_tmp` shape in `scripts/internal/install-cwagent-remote.sh`). `sudo -k -S -p "" bash` is not this case; it is the required form.
- Reach a host's privileged state with `ssh -t` and an interactive sudo prompt. A TTY prompt cannot be driven by a test, it makes the operator hold a step in their head, and a tree carrying both forms drifts back to the weaker one. Every privileged remote step goes through the wire pattern below. This covers comments as well as code, because a comment describing the interactive flow gets cited back later as though it were the rule.
- Wrap a command whose output can carry a secret (a privileged ssh session, a Terraform plan,
  anything that echoes stdin) in `cr_run` or `cr_tolerate`, which keep the whole output in a log
  on disk. Run it through `cr_run_marked` (or `cr_tolerate_marked`) in
  `scripts/lib/closing-report.sh`, which writes down only the lines the half marked, or run it
  unwrapped.
- Put a secret in a `cr_error` or `cr_warn` message, a label or a registered cleanup command.
- Hand a password to a child script in argv or a here-string; send it on stdin by a pipe or a
  process substitution.
- Commit an archive of any kind. Every secret control here reads text, including the
  gitleaks history scan, so an archive is a container none of them can see into. A saved
  Terraform plan is a zip and can carry live secrets past every text scan.
  `scripts/ci/check_no_opaque_archives.sh` refuses them by magic bytes, wherever the file
  sits and whatever it is called, because a filename rule misses one saved under an
  unexpected name.
- Compose a credential-redirect invocation from memory, or by analogy with a sibling script. Whether `< <operator credential file>` belongs on a command is a property of that one script, not of the family it sits in: read its usage header and its `read` sites before writing the command. Handing an operator `< credfile bash <script>` for a script that does not consume stdin feeds the password straight into a confirmation prompt and echoes it on the failed comparison.

## The required wire pattern

Every privileged remote step is one ssh session carrying one stream: the sudo password, then the values the root-side body needs, then the body itself.

```bash
{
  printf '%s\n' "$SUDO_PASS"        # line 1, consumed by sudo -S
  printf 'VAR=%q\n' "$VALUE"        # printf is a builtin: no fork, no argv
  cat "$REPORT_LIB" "$REMOTE_HALF"  # scripts/lib/closing-report-remote.sh, then the half
} | ssh "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash'
```

Read the password once with `IFS= read -r SUDO_PASS` when several sessions need it; a single stdin cannot serve two, because the first drains it. A confirmation prompt reads from `/dev/tty`, never stdin, which now belongs to the credential pipe.

The sending side reads one line and emits one line: sudo consumes exactly one, and the remote
`bash` runs everything after it, so a bare `cat` of the operator's credential file would run any
second line of it as a root command on a deployed host.

File content travels the same way, base64 on one line, rather than by `scp`: no host-side staging path, so no cleanup step for a crash or an interrupt to skip.

`scripts/install-cwagent-staging.sh` is the model; `scripts/lib/host-env-remote.sh` is the shared implementation for host env-file reads and writes. Operator-facing rationale: DEVOPS_GUIDE.md (private GitHub repo), "CloudWatch agent install (one-time per host)" section.

## Enforcement

`scripts/ci/check_script_credentials.sh` (run by `scripts/ci/assert_conventions.sh`) gates the common violations; its header documents what it blocks, its scope and its mechanics, and `tests/integration/scriptCredentialsGate.script.test.ts` pins them (add to its "no weaker than the gate it replaced" block, never replace it). Spelling a flag around the gate is not a fix. The gate matches shapes, so it is a floor, not a proof; the rest of this rule is enforced by code review.

## Ambient state decides nothing

A guard that an environment variable can satisfy is not a guard, and a safety property every script needs belongs in the shared library every script sources, not in a convention each caller repeats: `scripts/lib/host-env-remote.sh` assigns `ASSUME_YES` unconditionally, so an exported value cannot accept a typed confirmation.
