# shellcheck shell=bash
#
# Resolves the operator's initial-admin email allowlist into the CSV value the
# dev/staging register-allowlist bootstrap reads, for the two deploy wrappers.
#
# The list carries maintainer email addresses, so it lives in the private
# operations checkout and is reached through the canonical repo-root symlink
# rather than being kept in this one. An operator without that checkout gets an
# empty value, which is the same outcome as an empty list: the allowlist path is
# opt-in by design and its absence is not an error.
#
# The parsing rules have to match getInitialAdminEmails in
# src/dev-bootstrap/runtime.ts, because both decide who becomes an administrator
# on staging: strip everything from the first '#', trim, lowercase, drop blanks.
# They lived as two hand-copied blocks in the wrappers before this, which is the
# shape that drifts.
#
# Production is never a caller of the file at all. It has its own first-admin
# path, a single-use token claimed after the deploy, so the value has no
# legitimate use there. Reading it anyway made a production deploy depend on
# whether one particular workstation happened to hold the file: the remote half
# refused, correctly, but only after the release had been promoted and the host
# env file rewritten, leaving the declared state and the running state
# disagreeing. That refusal stays as the backstop; this function simply declines
# to send something production must never accept.

# Prints the CSV to stdout. Empty output is a valid answer and clears the value
# on the host, so a stale list cannot survive the operator emptying the file.
#
#   $1  repository root
#   $2  deploy target (the production target reads nothing)
resolve_initial_admin_emails_csv() {
  local repo_root="$1" remote="$2" admin_file

  if [[ "$remote" == "footbag-production" ]]; then
    return 0
  fi

  admin_file="${repo_root}/footbag_private_repo/private_data/operator-local/initial-admins.txt"
  [[ -f "$admin_file" ]] || return 0

  awk '
    {
      sub(/#.*$/, "")
      gsub(/^[ \t]+|[ \t]+$/, "")
      if (length($0) > 0) print tolower($0)
    }
  ' "$admin_file" | paste -sd, -
}
