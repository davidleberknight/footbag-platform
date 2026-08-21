---
paths:
  - "scripts/**"
  - "legacy_data/scripts/**"
  - "legacy_data/tools/**"
---

# Script secret-transport safety rules

## When to Use

Any shell script or deploy/install step that handles a secret: a sudo or account password, an AWS access key / secret key, an API key, a signing key, a token, or seed content carrying credentials. Scope: `scripts/**` (including `scripts/internal/**`) and any script moving a secret across a process, host, or container boundary.

## Hard rule

A secret MUST NEVER appear in any process's argv on any host: `ps -ef` (any reader) can capture it. Carry every secret over stdin (pipes) or a restricted `file://` temp file, never as a command-line argument or an inline `-e VAR=value`.

## Rules

- Read sudo passwords from stdin (`sudo -k -S -p ""`), never as an argument; feed the password as the first line of the same pipe. `-k` ignores any cached sudo timestamp, so sudo always consumes exactly the one line the pipe supplies. Without it, a host whose operator recently used sudo consumes nothing, and the password falls through to whatever reads stdin next.
- Pass secret values into a remote shell by appending them to the SSH stdin stream (shell-builtin `printf '%q'` assignments + cat-piped body), not via `ssh host "cmd $SECRET"`.
- Never use `docker compose exec -e VAR=value` for secret content; pipe via `-T` stdin and reassign from `$(cat)` inside the container.
- Write a secret destined for a file via a restricted (`umask 077` / mode `0600`) temp file and `install`/`file://`, then `shred` it; suppress shell history for any pasted-key step.
- Do not `echo`/`printf` a secret into another command's argv, and do not log it.
- Emit a secret meant for a human to `/dev/tty`, never to stdout, which a wrapper, a CI job, or an agent session may be capturing. Verify the terminal exists BEFORE minting or storing the secret: a credential nobody can read is not a failed run, it is a live credential needing cleanup. Model: `scripts/admin-bootstrap-token.sh`.
- A script that prompts verifies stdin is a terminal before reading. The `/dev/tty` rule below protects scripts that expect a credential on stdin; this protects the ones that do not, because nothing stops a caller redirecting a credential file into them and `read` will then consume the password as the answer to a confirmation. Either read the answer from `/dev/tty`, or refuse unless stdin, stdout and stderr are all TTYs. Models: `scripts/staging_diagnostics.sh` and `scripts/arming.sh` respectively.

## Do NOT

- Put a secret in argv (`cmd --pass X`, `-e VAR=value`, `ssh host "... $SECRET"`).
- Pipe `sudo -S` into a stdin-consuming file writer (`tee`, `cat`, `dd`): if sudo consumes nothing, the password becomes the first line of the target file. Write the file from inside the remote half instead, through a root-side restricted temp file promoted with `install` (the `install_via_tmp` shape in `scripts/internal/install-cwagent-remote.sh`). `sudo -k -S -p "" bash` is not this case; it is the required form.
- Reach a host's privileged state with `ssh -t` and an interactive sudo prompt. A TTY prompt cannot be driven by a test, it makes the operator hold a step in their head, and a tree carrying both forms drifts back to the weaker one. Every privileged remote step goes through the wire pattern below. This covers comments as well as code: a comment describing the interactive flow is how the superseded doctrine survived a revert and was later cited back as though it were the rule.
- Write a secret to a world-readable file, or leave a keys file un-shredded.
- Compose a credential-redirect invocation from memory, or by analogy with a sibling script. Whether `< <operator credential file>` belongs on a command is a property of that one script, not of the family it sits in: read its usage header and its `read` sites before writing the command. Handing an operator `< credfile bash <script>` for a script that does not consume stdin feeds the password straight into a confirmation prompt and echoes it on the failed comparison.

## The required wire pattern

Every privileged remote step is one ssh session carrying one stream: the sudo password, then the values the root-side body needs, then the body itself.

```bash
{
  printf '%s\n' "$SUDO_PASS"        # line 1, consumed by sudo -S
  printf 'VAR=%q\n' "$VALUE"        # printf is a builtin: no fork, no argv
  cat "$REMOTE_HALF"                # scripts/internal/<name>-remote.sh
} | ssh "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash'
```

Read the password once with `IFS= read -r SUDO_PASS` when several sessions need it; a single stdin cannot serve two, because the first drains it. A confirmation prompt reads from `/dev/tty`, never stdin, which now belongs to the credential pipe.

File content travels the same way, base64 on one line, rather than by `scp`: no host-side staging path, so no cleanup step for a crash or an interrupt to skip.

`scripts/install-cwagent-staging.sh` is the model; `scripts/lib/host-env-remote.sh` is the shared implementation for host env-file reads and writes. Operator-facing rationale: DEVOPS_GUIDE.md (private GitHub repo), "CloudWatch agent install (one-time per host)" section.

## Enforcement

`scripts/ci/check_script_credentials.sh` runs inside `scripts/ci/assert_conventions.sh`, so it gates `npm run test:pre-pr` and CI. It blocks `--password` flags, credentials in URLs, `sudo -S` feeding a file writer, any `ssh -t` under `scripts/`, and a prompt-style read in a script carrying no terminal guard. Everything else here is enforced by code review.
