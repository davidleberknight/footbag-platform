#!/usr/bin/env bash
# check_aws_identity.sh — a workstation script that reaches AWS resolves its
# identity through the shared library, rather than inheriting one.
#
# WHY THIS EXISTS.
#
# An operator workstation carries no default section, so a shell that has not
# been prepared has no AWS identity at all. For most of this
# tree's life that preparation was a line in an operator's shell profile, and it
# worked until the day a run started somewhere that had not sourced it: the
# deploy failed at its last step, reported three possible causes, and every one
# of them was false. The real answer was a stale variable in the environment
# that started the run.
#
# `scripts/lib/aws-profile.sh` is the answer to that: it clears half a key pair,
# supplies the operator profile when the shell carries no identity, and proves
# whatever identity the run ends up with before the run does any work. None of
# that helps a script that never asks it. When this check was written one script
# in the tree called it directly and everything else reached AWS on whatever the
# shell happened to hold, which is the condition that produced the failure
# above, and which no test could have caught because every test machine had a
# working profile.
#
# So this is the standing gate: a script that invokes `aws` or `terraform` says
# where its identity comes from, by sourcing the library (directly, or through
# `lib/terraform-output.sh`, which settles the identity before every read).
#
# WHAT IT DOES NOT CLAIM.
#
# Sourcing the library is not the same as calling it at the right moment, and no
# pattern can decide that: the call belongs after a script's own refusals and
# before its first AWS call, which is a judgement about that script. This
# catches the regression that can be caught mechanically, which is a new script
# reaching AWS with no idea where its credentials come from.
#
# Exemptions are by path and are listed below with a reason each. There is no
# marker a file can carry to exempt itself, deliberately: a file that can excuse
# itself excuses the next one too.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

violations=0

report() {
  echo "  FAIL: $1" >&2
  violations=$((violations + 1))
}

# Paths that must NOT resolve the operator identity, each for its own reason.
#
# Two families. The first runs on the deployed host, as root, where neither
# operator profile exists and the host's own assumed-role chain is the whole
# point. The second deliberately acts as, or proves, a different identity,
# and would be broken rather than helped by having the operator profile supplied
# underneath it.
is_exempt() {
  case "$1" in
    # It creates the profile holding the directly authenticated key, and strips
    # AWS_PROFILE to prove the pasted credential on its own. Supplying an
    # identity underneath it would be circular.
    scripts/install-operator-key.sh) return 0 ;;
    # It creates the everyday federated profile and reaches AWS not at all: it
    # writes a stanza saying where to sign in and as what, and leaves the
    # sign-in itself to the operator. There is no identity for this gate to
    # supply, and one supplied would prove nothing about the file it wrote.
    scripts/install-operator-sso-profile.sh) return 0 ;;
    # It requires an explicit profile and proves the chained runtime profiles
    # before cutting a key. A defaulted identity would let a rotation act on the
    # strength of the wrong credential.
    scripts/rotate-operator-key.sh) return 0 ;;
    # Each asserts a footbag-*-runtime identity, which the operator profile
    # would fail by design.
    scripts/verify-prod-email.sh|scripts/rehearse-bulk-send.sh) return 0 ;;
    # They run on the deployed host, on its own credential chain.
    scripts/backup-db.sh|scripts/staging_diagnostics.sh) return 0 ;;
    scripts/take-pre-cutover-snapshot.sh) return 0 ;;
    # Libraries invoked with the caller's own arguments. The caller is the run,
    # and the caller is what this gate holds to account.
    scripts/lib/iam-access-key.sh|scripts/lib/vendor-secret.sh) return 0 ;;
    scripts/lib/aws-identity.sh) return 0 ;;
    # It is the library this gate asks every other script to use.
    scripts/lib/aws-profile.sh) return 0 ;;
    # It names an explicit profile on every call and refuses to run without one,
    # so it inherits nothing from the shell it was started in.
    scripts/production-live-marker.sh) return 0 ;;
    # Its entire purpose is that no credential resolves.
    scripts/lib/aws-isolation.sh) return 0 ;;
    *) return 1 ;;
  esac
}

# The scripts an operator runs on their own workstation: scripts/ and its lib.
# scripts/internal/ is excluded as a directory, because those are the host-side
# halves piped over ssh and run as root there, and scripts/ci/ because those
# gates run offline, under the isolation that breaks every credential source.
FIND_STATUS=0
mapfile -t FILES < <(
  find scripts -maxdepth 2 -name '*.sh' \
    -not -path 'scripts/internal/*' \
    -not -path 'scripts/ci/*' \
    -not -path 'scripts/e2e/*' \
    | sort
) || FIND_STATUS=$?

if [ "$FIND_STATUS" -ne 0 ]; then
  echo "FAIL: could not list the scripts to scan (find exited ${FIND_STATUS})." >&2
  exit 1
fi

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "FAIL: the AWS-identity scan matched no files at all. Refusing to report" >&2
  echo "      a pass: an empty scope is a broken check, not a clean tree." >&2
  exit 1
fi

# An invocation in command position: start of line, or after a separator, with
# any number of VAR=value prefixes, then `aws` or `terraform` followed by
# whitespace. Deliberately does not match `command -v terraform`, a path like
# terraform/staging, or the word inside a sentence.
INVOCATION='(^|[;&|(]|&&)[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*(aws|terraform)[[:space:]]'

# The same, for the seam variables this tree uses in place of the binary name:
# any $VAR or ${VAR} whose name carries AWS, TF or TERRAFORM. A script reaching
# AWS through its own test seam is reaching AWS.
SEAM='(^|[;&|(]|&&)[[:space:]]*"?\$\{?[A-Za-z_]*(AWS|TF|TERRAFORM)[A-Za-z0-9_]*\}?"?[[:space:]]'

# grep exiting above 1 is a broken scan, not an absence of matches.
scan() {
  local pattern="$1" text="$2" out status=0
  out="$(printf '%s\n' "$text" | grep -nE "$pattern")" || status=$?
  if [ "$status" -gt 1 ]; then
    echo "FAIL: grep exited ${status} while scanning; the check cannot report a pass." >&2
    exit 1
  fi
  printf '%s' "$out"
}

scanned=0
for file in "${FILES[@]}"; do
  is_exempt "$file" && continue
  scanned=$((scanned + 1))

  # Comments are stripped before anything is looked for, so a file cannot
  # describe an invocation it does not make, or a source line it does not have.
  code="$(sed 's/#.*//' "$file")"

  hits="$(scan "$INVOCATION" "$code")"
  seam_hits="$(scan "$SEAM" "$code")"
  [ -n "$hits" ] || [ -n "$seam_hits" ] || continue

  # Sourced by name, however the path to it is spelled: several files reach a
  # sibling library through a computed directory rather than a literal path.
  #
  # Read from a here-string, never piped in. `grep -q` exits on its first match,
  # which closes the pipe, and the writer ahead of it dies on SIGPIPE; under
  # pipefail that death is the pipeline's status, so an exemption sitting near
  # the top of a long file reads as no exemption at all. Which files it hits
  # depends on timing, which is the worst form this can take: a compliant script
  # is reported as a violation on one run and not the next, and the gate teaches
  # people to re-run it rather than read it. The credentials gate carries the
  # same fix for the same reason.
  if grep -qE 'aws-profile\.sh|aws_profile_ensure' <<<"$code"; then
    continue
  fi
  if grep -qE 'terraform-output\.sh|tf_output_read' <<<"$code"; then
    continue
  fi

  report "${file} reaches AWS but never says where its identity comes from."
  echo "        Source scripts/lib/aws-profile.sh and call aws_profile_ensure" >&2
  echo "        before the first AWS or terraform call, after this script's own" >&2
  echo "        refusals; or reach terraform through lib/terraform-output.sh," >&2
  echo "        which settles the identity for every read. If this script must" >&2
  echo "        NOT take the operator identity, add it to the exempt list in" >&2
  echo "        scripts/ci/check_aws_identity.sh with the reason." >&2
  printf '%s\n' "$hits" "$seam_hits" | grep -v '^$' | sed "s|^|          ${file}:|" >&2
done

if [ "$violations" -ne 0 ]; then
  exit 1
fi

echo "[aws-identity] pass (${scanned} scripts scanned)"
