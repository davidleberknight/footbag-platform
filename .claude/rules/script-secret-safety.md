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

- Read sudo passwords from stdin (`sudo -S -p ""`), never as an argument; feed the password as the first line of the same pipe.
- Pass secret values into a remote shell by appending them to the SSH stdin stream (shell-builtin `printf '%q'` assignments + cat-piped body), not via `ssh host "cmd $SECRET"`.
- Never use `docker compose exec -e VAR=value` for secret content; pipe via `-T` stdin and reassign from `$(cat)` inside the container.
- Write a secret destined for a file via a restricted (`umask 077` / mode `0600`) temp file and `install`/`file://`, then `shred` it; suppress shell history for any pasted-key step.
- Do not `echo`/`printf` a secret into another command's argv, and do not log it.

## Do NOT

- Put a secret in argv (`cmd --pass X`, `-e VAR=value`, `ssh host "... $SECRET"`).
- Pipe `sudo -S` into a stdin-reading command (`tee`, `cat`): cached sudo credentials can let the password flow through into the target file. Use the user-tmp + `sudo install` pattern instead.
- Write a secret to a world-readable file, or leave a keys file un-shredded.

## Canonical pattern and enforcement

`scripts/install-cwagent-staging.sh` is the model (stdin-piped sudo password + cat-piped remote-half + `printf %q` assignments); preserve that wire-pattern verbatim. Operator-facing rationale: DEVOPS_GUIDE.md (private GitHub repo), "CloudWatch agent install (one-time per host)" section. Enforced by code review.
