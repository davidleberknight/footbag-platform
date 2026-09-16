#!/usr/bin/env bash
# Script credential-handling gate. The deploy/operations scripts follow a
# stdin/no-argv discipline for secrets by hand; this gate is the only mechanical
# control over that discipline, so it blocks the regressions a reviewer misses:
#
#   1. --password style CLI flags: argv is visible to every local process
#      via ps and lands in shell history.
#   2. user:password@ URLs: credentials embedded in a URL leak into logs,
#      proxies, and error messages.
#   3a. `sudo -S` without `-k`. The rule names `sudo -k -S -p ""` as the required
#      form for a reason: -k ignores any cached sudo timestamp, so sudo always
#      consumes exactly the one password line the pipe supplies. Without it, a
#      host whose operator recently used sudo consumes nothing and the password
#      falls through to whatever reads stdin next.
#   3b. `sudo -S` feeding a stdin-consuming file writer (tee/cat/dd, a -c shell,
#      or anything reading /dev/stdin): with cached credentials the password on
#      stdin flows straight through into the target file. Piping `sudo -S ... bash`
#      with the password as the first stdin line is the accepted remote-exec
#      pattern and is not flagged.
#   4. `ssh -t` anywhere in scope: a remote PTY exists to let sudo prompt a
#      human, which is the pattern the canonical wire form replaces. An
#      interactive prompt cannot be driven by a test, it makes the operator hold
#      a step in their head, and a tree carrying both forms drifts back to the
#      weaker one. Comments count: a comment describing the interactive flow is
#      how the superseded doctrine survived a revert and got cited back as
#      though it were the rule.
#   5. An operator prompt reading stdin in a script with no terminal guard. This
#      is the reverse of the rule above and bites the caller rather than the
#      author: the script never asks for a credential, so nothing stops someone
#      invoking it with one redirected in, and `read` then consumes the password
#      as the answer to a confirmation prompt.
#
# THREE PROPERTIES THIS GATE MUST KEEP, each of which it once lacked:
#
#   * No line can exempt itself. Exclusions are applied to the file list, by
#     path, never to the matched output by content. Filtering the output meant a
#     line whose text merely mentioned an excluded path was dropped, so any
#     violation could be waved through with a trailing comment.
#   * It fails closed. A grep that errors, a file list that comes back empty, or
#     a missing tool is a failure, not a pass. A gate that reports success
#     because it scanned nothing is worse than no gate.
#   * It covers the scripts that actually carry credentials, including the
#     repository-root operator wrapper, which receives the operator credential
#     file and forwards it to the leaf deploys.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

violations=0

# ── File discovery ───────────────────────────────────────────────────────────
# Exclusions live here, matched on the path, so nothing in a file's CONTENT can
# remove that file or a line of it from the scan. This gate excludes itself
# because it necessarily quotes every pattern it forbids.
#
# Absent directories are collected first rather than handed to find, because a
# find that errors on a missing path exits non-zero and there is nothing wrong
# with a checkout that has no legacy tools directory.
SCAN_DIRS=()
for d in scripts legacy_data/scripts legacy_data/tools; do
  [ -d "$d" ] && SCAN_DIRS+=("$d")
done

# Every other find failure does fail the gate. Discovery used to end
# `-print 2>/dev/null || true`, discarding both find's message and its exit
# status, so a directory in scope that could not be read was skipped in silence
# and whatever remained was reported as a pass. That is the fail-open shape this
# gate exists to refuse, and the one its header claims it does not have: an
# unreadable FILE and a dangling symlink already failed closed, so the directory
# case was the single hole, with the printed file count as its only mitigation.
# A grep exit above 1 already fails closed further down; discovery now matches it.
# Each find runs outside the mapfile subshell so its status can be seen at all.
FIND_STATUS=0
SUBTREE_LIST=""
if [ "${#SCAN_DIRS[@]}" -gt 0 ]; then
  # -type f OR -type l: a symlinked script is still a script, and skipping
  # links meant one could sit in scope while being scanned nowhere. `.bash` is
  # included for the same reason the extension list exists at all.
  # The virtualenv is pruned rather than filtered out of the results. Filtering
  # still descends it, and it holds a couple of hundred megabytes of installed
  # third-party Python that is not this project's code and can never be in
  # scope; walking it was most of this gate's runtime.
  SUBTREE_LIST=$(find "${SCAN_DIRS[@]}" \
       \( -name '.venv' -o -name '__pycache__' -o -name 'node_modules' \) -prune -o \
       \( -type f -o -type l \) \
       \( -name '*.sh' -o -name '*.bash' -o -name '*.ts' -o -name '*.py' \) \
       -not -path 'scripts/ci/check_script_credentials.sh' \
       -print) || FIND_STATUS=$?
fi
# The repository-root operator scripts. deploy_to_aws.sh is the everyday
# production path: it resolves the operator credential file and pipes it into
# the leaf deploys, which is squarely "moving a secret across a process
# boundary" and was outside this gate entirely.
ROOT_LIST=$(find . -maxdepth 1 \( -type f -o -type l \) \( -name '*.sh' -o -name '*.bash' \) -print) \
  || FIND_STATUS=$?

if [ "${FIND_STATUS}" -ne 0 ]; then
  echo "FAIL: file discovery could not read part of the scan scope (find exit ${FIND_STATUS})." >&2
  echo "      A path in scope that cannot be read would otherwise be skipped in silence," >&2
  echo "      shrinking the scan rather than failing it. find's own message above names it." >&2
  echo "      Fix the permissions, or take the path out of scope, then re-run." >&2
  exit 1
fi

mapfile -t FILES < <(printf '%s\n%s\n' "${SUBTREE_LIST}" "${ROOT_LIST}" | grep -v '^$' || true)

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "FAIL: the credential scan matched no files at all. Refusing to report a pass," >&2
  echo "      because a gate that scanned nothing cannot have found nothing." >&2
  exit 1
fi

# The sudo and prompt checks are about shell semantics, so they run over shell
# files only; `read` in a TypeScript comment is English, not a bash builtin.
mapfile -t SH_FILES < <(printf '%s\n' "${FILES[@]}" | grep -E '\.(sh|bash)$' || true)
if [ "${#SH_FILES[@]}" -eq 0 ]; then
  echo "FAIL: the credential scan found no shell files. Refusing to report a pass." >&2
  exit 1
fi

# Drops matched lines that are comments. Applied to the sudo and prompt checks,
# where a comment describing the mechanism is prose rather than an instruction.
# Deliberately NOT applied to the ssh -t check: the rule says comments count
# there, because a comment describing the interactive flow is how the superseded
# doctrine survived a revert and was later cited back as though it were the rule.
# Only `#`. An earlier version also treated a line starting `*` or `//` as a
# comment, meaning to skip JSDoc continuation lines -- but these checks run over
# shell files, where a line starting `*` is a `case` arm, so every one-line
# `*) sudo -S tee /etc/x ;;` was silently discarded from the scan.
strip_comments() {
  grep -vE '^[^:]+:[0-9]+:[[:space:]]*#' || true
}

# A shell file reduced to the part that executes: heredoc bodies dropped, the
# contents of quoted strings blanked, then everything from the first remaining
# `#` cut away.
#
# One definition of "is this code or is this text", because the question is
# asked in more than one place and the two halves of the earlier comment hole
# were exactly what happens when each place answers it separately. A file could
# no longer DESCRIBE a guard it does not have in a comment, but it could still
# do it in a usage heredoc or an `echo`, and every prompt in the file was then
# exempt.
#
# Quotes are blanked rather than removed so column positions survive, and the
# cut at `#` runs last so a `#` inside a string cannot truncate a real line.
# Blanking can only ever remove a match, never invent one, so the direction of
# any error is toward refusing rather than passing.
normalize_shell_source() {
  awk '
    # Heredoc bodies are data the shell hands to another program, not commands.
    # The delimiter may be quoted and may be indented with <<-.
    heredoc != "" {
      line = $0
      sub(/^[ \t]+/, "", line)
      if (line == heredoc) { heredoc = "" }
      print ""
      next
    }
    {
      if (match($0, /<<-?[ \t]*"[^"]+"/) || match($0, /<<-?[ \t]*'"'"'[^'"'"']+'"'"'/) \
          || match($0, /<<-?[ \t]*[A-Za-z_][A-Za-z0-9_]*/)) {
        tag = substr($0, RSTART, RLENGTH)
        sub(/^<<-?[ \t]*/, "", tag)
        gsub(/["'"'"']/, "", tag)
        # `<<<` is a here-string: one line of data, not a block, and the line it
        # sits on is still code.
        if (substr($0, RSTART, 3) != "<<<") { heredoc = tag }
      }
      out = ""
      n = length($0)
      q = ""
      for (i = 1; i <= n; i++) {
        c = substr($0, i, 1)
        if (q == "") {
          if (c == "\"" || c == "'"'"'") { q = c; out = out c; continue }
          out = out c
        } else {
          if (c == q) { q = ""; out = out c; continue }
          out = out " "
        }
      }
      sub(/#.*$/, "", out)
      print out
    }
  ' "$1"
}

# grep exits 0 on a match, 1 on no match, and 2 or more on a real error. Only
# the first two are answers; anything else means the scan did not happen.
# -H, always. Without it grep omits the filename when handed a single file, so
# the `path:lineno:` prefix that strip_comments keys on is absent and stripping
# silently does nothing. That made a one-file test fixture take a different code
# path from the real multi-file run, so the fixtures proved less than they looked.
scan() {
  local pattern="$1" out status
  out=$(grep -nHE -e "$pattern" -- "${FILES[@]}") && status=0 || status=$?
  if [ "$status" -gt 1 ]; then
    echo "FAIL: the credential scan itself errored (grep exit $status)." >&2
    exit 1
  fi
  printf '%s' "$out"
}

scan_sh() {
  local pattern="$1" out status
  out=$(grep -nHE -e "$pattern" -- "${SH_FILES[@]}") && status=0 || status=$?
  if [ "$status" -gt 1 ]; then
    echo "FAIL: the credential scan itself errored (grep exit $status)." >&2
    exit 1
  fi
  printf '%s' "$out"
}

report() {
  echo "$1" >&2
  shift
  printf '%s\n' "$@" >&2
  violations=$((violations + 1))
}

# ── 1. Secrets on the command line ───────────────────────────────────────────
# Narrow on purpose: a flag NAMING a secret (--secret session_secret) is how the
# provisioning scripts select which parameter to write, and is not a value on the
# command line. Only flags that carry the value itself belong here.
hits=$(scan '--(password|passwd)[ =]')
if [ -n "$hits" ]; then
  report "$hits" \
    "FAIL: secrets must not ride CLI flags; read them from stdin or a 600-mode file"
fi

# ── 1b. A secret-shaped value inlined into a container's environment ─────────
# The rule names this form explicitly: "Never use `docker compose exec -e
# VAR=value` for secret content; pipe via -T stdin and reassign from $(cat)
# inside the container." An inline assignment puts the value in the argv of both
# the docker client and the container process.
#
# Matched on the NAME rather than by trying to recognise a secret value: a
# variable called something-SECRET, -KEY, -TOKEN or -PASSWORD carries one by its
# own account. `-e VAR` and `-e VAR=` with nothing after it are the safe
# pass-through forms and are not matched.
# A name that carries a secret by its own account. `KEY` alone is deliberately
# excluded and only compounds like API_KEY or SIGNING_KEY count: a bare `KEY` is
# as often a lookup key or a config key name as it is a credential, and a gate
# that cries wolf on those gets its findings waved through.
# `_PASS` is matched as a suffix or an inner component, never as a substring: the
# underscore is what distinguishes SUDO_PASS and SUDO_PASS_FILE from BYPASS and
# PASSTHROUGH, which carry nothing. This omission mattered more than the others it
# would have caught, because SUDO_PASS is the variable the secret-transport rule's
# own required wire pattern uses, so the one name every privileged remote step in
# this tree carries was the one name these two checks could not see.
SECRET_NAME_RE='([A-Z_]*(SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL)[A-Z_]*|[A-Z]+_PASS[A-Z_]*|[A-Z_]+_KEY[A-Z_]*)'

# Both spellings of the flag, and an optional opening quote before the name:
# `-e "SECRET=$s"` and `--env SECRET="$s"` put the value in argv exactly as the
# bare form does, and quoting it changes nothing about who can read it.
hits=$(scan "(^|[[:space:]])(-e|--env)[[:space:]]+[\"']?${SECRET_NAME_RE}=." | strip_comments)
if [ -n "$hits" ]; then
  report "$hits" \
    "FAIL: a secret must not be inlined into a container's environment; it lands in argv" \
    "      on both sides. Pipe it via 'docker compose exec -T' stdin and reassign from" \
    "      \$(cat) inside the container."
fi

# ── 1c. A secret interpolated into a remote command string ──────────────────
# "Pass secret values into a remote shell by appending them to the SSH stdin
# stream, not via `ssh host \"cmd \$SECRET\"`." Interpolation happens locally, so
# the value is in the remote sshd's argv and in the local process list alike.
hits=$(scan "\\bssh\\b[^|;&]*[\"'][^\"']*\\\$\\{?${SECRET_NAME_RE}" | strip_comments)
if [ -n "$hits" ]; then
  report "$hits" \
    "FAIL: a secret must not be interpolated into a remote command string; it reaches" \
    "      argv on both hosts. Append it to the ssh stdin stream instead, as a" \
    "      printf '%q' assignment ahead of the cat-piped body."
fi

# ── 2. Credentials in URLs ───────────────────────────────────────────────────
hits=$(scan '[a-z][a-z0-9+.-]*://[^/@ "'"'"']+:[^/@ "'"'"']+@')
if [ -n "$hits" ]; then
  report "$hits" "FAIL: credentials must not be embedded in URLs"
fi

# ── 3. sudo reading the password from stdin ──────────────────────────────────
# Every line invoking sudo with an -S in any short-flag cluster (or --stdin),
# with any number of other flags in front of it. Both checks below narrow this
# one set, so a form that evades this pattern evades both.
# A `sudo` word, optionally reached by an absolute path (`/usr/bin/sudo` evaded
# the old anchor), on a line that also carries an -S-bearing flag cluster or
# --stdin. Both checks below narrow this one set.
sudo_stdin=$(scan_sh '(^|[^[:alnum:]_-])(/[^[:space:]]*/)?sudo([[:space:]]|$)' \
  | grep -E '(^|[[:space:]])(-[a-zA-Z]*S[a-zA-Z]*|--stdin)([[:space:]]|$)' \
  | strip_comments || true)

if [ -n "$sudo_stdin" ]; then
  # 3a. ... must also carry -k, and it must belong to THIS sudo. Requiring the
  # -k token to sit in the flag run that follows the sudo word is what stops an
  # unrelated -k elsewhere on the line satisfying the check: `curl -k https://x
  # | sudo -S bash` passed the old version, as did a -c body containing
  # `make -k install`.
  # `-p` takes the NEXT word as its prompt string, whatever that word looks
  # like, so `sudo -S -p -k bash` never passes -k to sudo at all: the password
  # is read with a cached timestamp still live, which is the exact failure -k
  # exists to prevent. Cut each `-p` and the word it consumes before looking for
  # -k, so a swallowed flag cannot satisfy the check that requires it.
  sudo_stdin_pless=$(printf '%s' "$sudo_stdin" \
    | sed -E 's/-p[[:space:]]+("[^"]*"|'"'"'[^'"'"']*'"'"'|[^[:space:]]+)//g')

  missing_k=$(printf '%s' "$sudo_stdin_pless" \
    | grep -vE '(^|[^[:alnum:]_-])(/[^[:space:]]*/)?sudo([[:space:]]+-[a-zA-Z]+([[:space:]]+([^-[:space:]][^[:space:]]*|"[^"]*"|'"'"'[^'"'"']*'"'"'))?)*[[:space:]]+-[a-zA-Z]*k' || true)
  if [ -n "$missing_k" ]; then
    report "$missing_k" \
      "FAIL: sudo reading a password from stdin must pass -k, so it ignores any cached" \
      "      timestamp and always consumes exactly the one line the pipe supplies." \
      "      Required form: sudo -k -S -p \"\" bash"
  fi

  # 3b. ... must not hand that stdin to a file writer.
  writers=$(printf '%s' "$sudo_stdin" \
    | grep -E '\|[[:space:]]*(sudo[[:space:]][^|]*)?(tee|dd)([[:space:]]|$)|sudo[^|]*[[:space:]](tee|dd)([[:space:]]|$)|sudo[^|]*[[:space:]]cat[[:space:]]*(-[[:space:]]*)?>|sudo[^|]*[[:space:]](sh|bash|zsh)[[:space:]]+-c[^|]*(>|[[:space:]](tee|dd|cat)[[:space:]])|sudo[^|]*/dev/stdin' || true)
  if [ -n "$writers" ]; then
    report "$writers" \
      "FAIL: sudo -S must never feed a stdin-consuming file writer; the cached-credential" \
      "      case pipes the password into the target file. Write the file from inside the" \
      "      remote half, through a root-side restricted temp file promoted with install."
  fi
fi

# ── 4. ssh -t ────────────────────────────────────────────────────────────────
# The t may sit anywhere in a combined short-option cluster, not only at its end:
# -tN requests a terminal exactly as -t does, and a guard anchored on the last
# letter would wave it through. RequestTTY is the same request spelled long.
hits=$(scan '\bssh\b[^|;&]* -[a-zA-Z]*t[a-zA-Z]*\b|RequestTTY[= ]*(yes|force)')
if [ -n "$hits" ]; then
  report "$hits" \
    "FAIL: no ssh -t in scope; a privileged remote step goes through the wire pattern" \
    "      (password as stdin line 1 + printf %q assignments + cat-piped remote half" \
    "      into 'sudo -k -S -p \"\" bash'). Model: scripts/install-cwagent-staging.sh."
fi

# ── 4b. A terminal request assembled in an option array ──────────────────────
# The check above reads one line at a time, so a -t placed in an options array
# and expanded onto the ssh invocation later evades it while making exactly the
# request the rule bans. It is one line further away, not one bit safer.
#
# Both halves are required before this reports anything: the flag has to sit in
# an array assignment, AND that array's variable has to be expanded onto an ssh
# invocation in the same file. An options array holding a -t that never reaches
# ssh belongs to some other command, and a gate that cried wolf on those would
# get its findings waved through, which is the failure this check cannot afford.
array_offenders=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  # Read the file's code, so a -t inside a comment or a usage string is not an
  # array element and an ssh expansion described in prose is not an invocation.
  code=$(normalize_shell_source "$f")
  ssh_arrays=$(printf '%s\n' "$code" \
    | grep -oE '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=\([^)]*\)' \
    | grep -E '(^|[[:space:]]|\()-[a-zA-Z]*t[a-zA-Z]*([[:space:]]|\))' \
    | grep -oE '[A-Za-z_][A-Za-z0-9_]*=' \
    | tr -d '=' || true)
  [ -n "$ssh_arrays" ] || continue
  while IFS= read -r v; do
    [ -n "$v" ] || continue
    # The expansion is looked for in the raw file, not the normalized code,
    # because normalization blanks the inside of quoted strings and the
    # expansion is almost always written quoted. Comments count here for the
    # same reason they count in the check above: a comment describing the
    # interactive flow is how the superseded doctrine survived a revert once
    # already.
    grep -qE "\bssh\b[^|;&]*\\\$\{${v}\[@\]\}" "$f" || continue
    # Report the assignment line, because that is the line to change.
    hit=$(grep -nHE "^[[:space:]]*${v}=\(" "$f" || true)
    array_offenders="${array_offenders}${hit}
"
  done <<< "$ssh_arrays"
done < <(printf '%s\n' "${SH_FILES[@]}")

if [ -n "$(printf '%s' "$array_offenders" | tr -d '[:space:]')" ]; then
  report "$array_offenders" \
    "FAIL: this options array carries a terminal-request flag and is expanded onto an ssh" \
    "      invocation in the same file, which requests a remote PTY exactly as 'ssh -t' does." \
    "      Drop the flag; a privileged remote step goes through the wire pattern instead."
fi

# ── 5. A prompt reading stdin with no terminal guard ─────────────────────────
# Every `read` is a candidate; the data-plumbing forms are excluded by shape.
# Loop reads, here-strings and here-docs are plumbing rather than prompts, as is
# any read naming its own source with a redirect: naming the source means it is
# not consuming whatever the caller happened to attach.
#
# The file-level exemption looks for a guard in CODE, not for a mention. It used
# to accept any file containing the text "/dev/tty" or "-t 0" anywhere, so a
# comment exempted every prompt in the file. Comment lines are stripped before
# the guard is looked for.
#
# `read` is matched only in command position -- at the start of a line, or after
# a separator -- optionally preceded by an IFS= prefix, and followed by a flag or
# a variable name. Matching the bare word anywhere caught every English "read
# from" in a comment and drowned the real signal.
# `read` as a command word: not preceded by an identifier character, and
# followed by whitespace. Deliberately broad. An earlier version required the
# token after the flag cluster to start with a letter, and anchored only on
# punctuation separators, so `read -rp "Type yes: " answer` and `if read -r
# answer` both evaded it -- and both were caught by the gate this replaced. The
# data-plumbing forms are excluded by shape below rather than by narrowing here,
# because a security check should over-match and be filtered, not under-match.
# NOTE the anchor: this pattern is applied to raw file lines by the loop below,
# not to `path:lineno:` scan output, so `^` is the start of the source line.
# The optional backslash is not decoration. `\read` suppresses alias and
# function lookup and runs the builtin, so it is the same command to bash and a
# different string to a pattern that does not expect it.
PROMPT_RE='^[[:space:]]*(IFS=[^[:space:]]*[[:space:]]+)?\\?read([[:space:]]+-[a-zA-Z]+)*[[:space:]]|[;&|(){}][[:space:]]*(IFS=[^[:space:]]*[[:space:]]+)?\\?read([[:space:]]+-[a-zA-Z]+)*[[:space:]]|(^|[[:space:]])(if|then|else|elif|do|while|until|!|time|command|builtin)[[:space:]]+\\?read([[:space:]]+-[a-zA-Z]+)*[[:space:]]'
# A guard must be present as CODE. Comments are stripped before it is looked
# for, so a file cannot describe a guard it does not have. Three deliberate
# narrowings over the previous version, each closing a false exemption:
#   - the fd must be 0. `read -t 1 dummy` is a timeout on an unrelated read, and
#     it exempted whole files.
#   - the test must be inside a bracket, so `echo "-t 0"` is not a guard. This
#     still admits `[[ ! -t 0 ]]`, which is as common as the positive form.
#   - the helper names must appear as a call, not a definition: a file
#     containing `confirm_from_tty() { :; }` was exempting itself.
GUARD_RE='\[\[?[^]]*-t[[:space:]]+0|/dev/tty|(confirm_from_tty|require_operator_stdin)[^(]'

prompt_offenders=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  # The data-plumbing exclusions are tested against the CODE of the line only.
  # Everything from the first `#` is cut first, and each word is anchored as a
  # shell token instead of being matched anywhere in the string. Both of those
  # closed a real self-exemption: `strip_comments` only drops lines that are
  # wholly comments, so `read -r answer  # compared against /dev/tty input` and
  # `read -r answer  # while the operator decides` both passed, and so did
  # `read -r answer_while`, because the filter saw the whole
  # `path:lineno:content` string and any occurrence of an exemption word in it.
  # Cutting at the first `#` can shorten a prompt string that contains one, which
  # can only lose an exclusion and never add one, so it errs toward refusing.
  hits_in_file=$(grep -nHE "$PROMPT_RE" "$f" 2>/dev/null \
    | strip_comments \
    | sed -E 's/#.*$//' \
    | grep -vE '<<<|<<|(^|[;&|(){}[:space:]])(while|until)[[:space:]]|done[[:space:]]*<|<[[:space:]]*/dev/tty|read[^|;&]*<[[:space:]]|(^|[;&|(){}[:space:]])(mapfile|readarray)[[:space:]]' \
    || true)
  [ -n "$hits_in_file" ] || continue
  # The guard must be present as code, so the whole of every comment is cut
  # before it is looked for, not just the lines that are comments end to end.
  # Dropping only whole-comment lines left the other half of the same hole: the
  # trailing comment on `read -r answer  # compared against /dev/tty input` was
  # itself accepted as the file's terminal guard.
  # A here-string, not a pipe into `grep -q`: under `pipefail` the early exit of
  # `grep -q` closes the pipe, the stripper dies on SIGPIPE, and the pipeline's
  # status becomes 141, so a file whose guard sits near the top reads as having
  # no guard at all. A failed substitution yields no guard and therefore a
  # refusal, which is the safe direction.
  # -e, because the pattern begins with a dash and grep would read it as a flag.
  if grep -qE -e "$GUARD_RE" <<< "$(normalize_shell_source "$f")"; then
    continue
  fi
  prompt_offenders="${prompt_offenders}${hits_in_file}
"
done < <(printf '%s\n' "${SH_FILES[@]}")

if [ -n "$(printf '%s' "$prompt_offenders" | tr -d '[:space:]')" ]; then
  report "$prompt_offenders" \
    "FAIL: an operator prompt reads stdin in a script with no terminal guard;" \
    "      a caller who redirects a credential file in would have the password" \
    "      consumed as the answer. Read the answer from /dev/tty, or refuse a" \
    "      non-TTY stdin. Model: scripts/arming.sh."
fi

if [ "$violations" -gt 0 ]; then
  exit 1
fi

echo "[script-credentials] pass (${#FILES[@]} files scanned)"
