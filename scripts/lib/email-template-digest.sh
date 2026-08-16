# One definition of "which email wording is this", shared by the deploy that
# seeds it and the status view that checks it.
#
# The wording a running environment renders comes from its `email_templates`
# rows, not from the repository. Those rows are written by the sidecar seeder,
# which runs on the workstation against a locally built database that the
# full-rebuild deploy then ships whole. A code-only deploy leaves them alone.
# So editing a sidecar changes nothing that is deployed, and until this digest
# existed nothing anywhere said so: production went on rendering the wording it
# was seeded with while the repository held something else, and the only way to
# notice was to read a message it sent.
#
# The rebuild deploy records this digest beside its own provenance, and the
# bring-up status view compares it against the sidecars as they stand now. Both
# sides compute it on the workstation from the same files, so there is no host
# tooling to depend on and nothing to keep in step by hand.
#
# It answers one question: were the templates this environment holds seeded from
# the sidecars exactly as they read today. It deliberately does not read the
# deployed database, so it says nothing about wording an administrator changed
# through the template editor after the fact, which is a legitimate divergence
# rather than drift, and after go-live is the only way wording changes at all.

# email_template_digest [source-dir]
# Prints a stable digest over every sidecar's contents. Sorted by path so the
# result does not depend on directory order, and empty when the directory holds
# no sidecars, which the caller reports rather than treating as agreement.
email_template_digest() {
  local dir="${1:-curated/email_templates}"
  if [[ ! -d "$dir" ]]; then
    return 1
  fi
  local files
  files="$(find "$dir" -maxdepth 1 -name '*.json' -type f | sort)"
  if [[ -z "$files" ]]; then
    return 1
  fi
  # Hash each file's basename and contents, never its directory: the deploy and
  # the status view reach these files by different paths, and a digest carrying
  # the path would make them disagree while the wording is identical. The
  # basename stays in so a renamed template still registers as a change.
  printf '%s\n' "$files" | xargs sha256sum | sed 's#  .*/#  #' | sort | sha256sum | cut -d' ' -f1
}
