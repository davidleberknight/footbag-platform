#!/usr/bin/env bash
# infra-sync.sh -- sourced library: a deploy ships only onto infrastructure that
# already matches the Terraform in the tree it ships.
#
# WHY THIS EXISTS.
#
# Code and the infrastructure it needs travel in one tree but land by two acts: a
# Terraform apply and a deploy. A deploy that runs before the apply ships code
# against permissions, parameters or resources that are not there yet, and the
# failure surfaces only when a member reaches the feature, as an outage page or
# a silently dropped action. Keeping the order in an operator's head is the
# thing that fails, so every deploy checks it: Terraform's own plan for the
# environment, which must be empty. Nothing is recorded to compare against; the
# plan is the comparison, and it also catches values-file changes and edits made
# outside Terraform.
#
# WHAT IT REFUSES TO DO.
#
#   - Apply anything. It plans through scripts/terraform-apply.sh
#     --require-empty-plan, which applies nothing on any outcome; the fix it
#     names is an apply the operator runs and reviews themselves.
#   - Let the plan read the deploy's stdin. The deploy leaves carry the host's
#     sudo password on stdin, and terraform prompts on stdin, so the plan runs
#     with stdin closed.
#   - Deploy production unchecked. A plan needs the environment's values file,
#     which lives in the private operations checkout; on production its absence
#     is a refusal, because only footbag-operator deploys production and that
#     machine holds it.
#
# The one case it lets through without a plan is staging on a machine with no
# values file, which is every dev-and-tester's: they deploy staging and cannot
# plan it. It says so on every such run, so the gap is never silent. A
# maintainer's own staging deploy, which has the file, is always checked.
#
# Usage, after the host has confirmed its environment and before anything is
# built or shipped:
#   source scripts/lib/infra-sync.sh
#   infra_sync_require "$REPO_ROOT" "$FOOTBAG_ENV" || exit 1
#
# Test seams (CI only; nobody else sets these), each announced on stderr when set,
# because a run through a stand-in proves nothing about the estate:
#   INFRA_SYNC_APPLY_CMD    replaces scripts/terraform-apply.sh
#   INFRA_SYNC_VALUES_FILE  replaces terraform/<env>/terraform.tfvars

infra_sync_require() {
  local repo_root="$1" env="$2"
  case "$env" in
    staging|production) ;;
    *)
      echo "ERROR: infra_sync_require: environment must be staging or production (got '${env}')." >&2
      return 1
      ;;
  esac

  local apply_cmd="${INFRA_SYNC_APPLY_CMD:-${repo_root}/scripts/terraform-apply.sh}"
  local values_file="${INFRA_SYNC_VALUES_FILE:-${repo_root}/terraform/${env}/terraform.tfvars}"
  if [[ -n "${INFRA_SYNC_APPLY_CMD:-}" ]]; then
    echo "SYNTHETIC: infrastructure check runs '${apply_cmd}' -- a stand-in, not the real plan." >&2
  fi
  if [[ -n "${INFRA_SYNC_VALUES_FILE:-}" ]]; then
    echo "SYNTHETIC: infrastructure check reads values file '${values_file}' -- a stand-in." >&2
  fi

  if [[ ! -r "$values_file" ]]; then
    if [[ "$env" == "production" ]]; then
      echo "ERROR: cannot check that production's infrastructure matches this tree:" >&2
      echo "       terraform/production/terraform.tfvars is missing or unreadable." >&2
      echo "       It is a link into the private operations checkout; wire it with" >&2
      echo "         bash scripts/setup_private_repo.sh" >&2
      echo "       Nothing was shipped." >&2
      return 1
    fi
    echo "NOTICE: infrastructure check not run: this machine has no staging values file." >&2
    echo "        This deploy does not confirm that staging's Terraform is applied." >&2
    echo "        A maintainer's next staging deploy checks it." >&2
    return 0
  fi

  echo "==> Checking that ${env}'s infrastructure matches this tree's Terraform (plan must be empty)" >&2
  if ! bash "$apply_cmd" --target "$env" --require-empty-plan < /dev/null; then
    echo "" >&2
    echo "ERROR: ${env}'s infrastructure does not match this tree's Terraform, or the" >&2
    echo "       plan could not be read (see above). This deploy would ship code onto" >&2
    echo "       infrastructure it may depend on that is not there. Apply first:" >&2
    echo "         bash scripts/terraform-apply.sh --target ${env}" >&2
    echo "       then deploy again. Nothing was shipped." >&2
    return 1
  fi
  return 0
}
