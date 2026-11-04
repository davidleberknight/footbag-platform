# shellcheck shell=bash
#
# scripts/lib/deploy-verdict.sh -- the verdict word an entry point that deploys a
# release ends on.
#
# Sourced, never run, after scripts/lib/closing-report.sh, by every script an
# operator types to put a release on a host (deploy_to_aws.sh and
# scripts/deploy-migrate.sh), so each ends on the same words. A caller registers
# it with `cr_verdict_with deploy_verdict`.
#
# The verdict says in one word whether the site now runs this release, because
# that is the question an operator reads the end of a deploy to answer. It comes
# from how far the run got, which the deploy leaves record as facts: a release
# that went live stays DEPLOYED even when a later check failed, and a host half
# that started but did not finish is uncertain, since the host keeps no release
# to roll back to.

# deploy_verdict <error-count> <exit-status> <default-word>
deploy_verdict() {
  local errors="$1"
  if cr_has_fact release-live; then
    if (( errors )); then echo "DEPLOYED, BUT A CHECK FAILED"; else echo "DEPLOYED"; fi
  elif cr_has_fact release-installed && (( errors == 0 )); then
    echo "INSTALLED, NOT YET SERVING"
  elif cr_has_fact host-half-started; then
    echo "DEPLOY FAILED PART-WAY: CHECK THE SITE"
  else
    echo "NOT DEPLOYED"
  fi
}
