#!/usr/bin/env bash
# scripts/lib/full-pass-receipt.sh -- where the proofs of a passing run live.
#
# Sourced, never run. Two receipts, each with two readers that must agree on it.
#
# The --full receipt: ./run_all_tests.sh removes it when a --full run starts and
# writes it only when that run's local gates end GREEN; the production release
# gate accepts a production deploy of exactly the tree it describes.
#
# The --staging receipt: ./run_all_tests.sh removes it when a --staging run
# starts and writes it only when every staging row passed, keyed to the commit
# the staging host reported it was running; the production release gate accepts
# it only for the commit staging runs when the deploy is attempted. It is
# independent of the --full receipt: a staging failure never voids the proof
# about the local tree, and a local failure never voids the proof about staging.
#
# One fixed path per account under /tmp, deliberately not under TMPDIR: the shell
# that ran the tests and the shell that deploys need not share a TMPDIR, and a
# proof the gate cannot find is a refused deploy. They are transient by design; a
# reboot clears them and the next run writes them again. Because /tmp is shared,
# the gate trusts a receipt only when this account owns it and nobody else can
# write it.

full_pass_receipt_path() {
  printf '/tmp/footbag-full-pass-receipt-%s' "$(id -u)"
}

staging_pass_receipt_path() {
  printf '/tmp/footbag-staging-pass-receipt-%s' "$(id -u)"
}

# full_pass_receipt_trusted <file> -- owned by this account, mode 600. Applies to
# either receipt.
full_pass_receipt_trusted() {
  local mode owner
  mode="$(stat -c '%a' "$1" 2>/dev/null || true)"
  owner="$(stat -c '%u' "$1" 2>/dev/null || true)"
  [[ "$mode" == "600" && "$owner" == "$(id -u)" ]]
}
