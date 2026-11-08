#!/usr/bin/env bash
# production-cutover.sh
#
# The staged applies of the production cutover, one stage per apply, each one a
# change that sets several values in an environment's values file together and
# so cannot go through scripts/set-terraform-gate.sh, which sets one gate per
# apply. Every stage has the same shape: it proves its preconditions, shows the
# values-file change, takes a typed APPLY, writes the values through the
# file's symlink, applies through scripts/terraform-apply.sh, and verifies what
# is served. Later stages (the custom domain, the window state, the freeze, the
# launch) join this file when they are first used.
#
# WHY IT EXISTS.
#
# A cutover apply typed by hand is a values-file edit plus an apply, and the
# edit is where it goes wrong: a value pasted from the wrong place, a companion
# value forgotten, a second change already pending in the tree riding along
# under the cutover's name. Each stage owns its values, refuses a tree with
# anything else pending, and proves the outcome rather than the invocation.
#
# STAGE archive-base: the archive base stack, in pass 1, with no DNS.
#
# Turns on the members-only archive's own bucket and distribution on its
# cloudfront.net name. Three values change together:
#   enable_archive               true
#   archive_platform_url         the tree's platform_url output, which is the
#                                distribution's own https://<id>.cloudfront.net
#                                address while the custom domain is off. Left
#                                unset, the archive's gate pages are built
#                                pointing at the legacy site's address.
#   archive_signing_public_key   exactly what
#                                provision-archive-signing-key.sh tfvars prints,
#                                never retyped.
# Then the private key is stored in Parameter Store (which needs the parameter
# the apply creates) and scripts/verify-archive-edge.sh proves the edge: the
# gate page served, an unsigned request refused, a signed one let through.
#
# Turning the archive on is effectively one-way: the archive bucket carries
# prevent_destroy. So a run that stops part way is finished by running it
# again, never undone: values already written are left as they are, an apply
# not yet made is made, a key already stored is not stored again.
#
# WHAT IT REFUSES.
#   - Any stage it does not know, and a target other than staging or production.
#   - A values file that is missing, or a symlink pointing at nothing: the
#     private operations checkout is absent, and nothing is improvised.
#   - A tree with other changes pending before the write, or, on a re-run, any
#     pending change beyond the archive stack itself.
#   - A platform_url that is not a cloudfront.net address: once the custom
#     domain is on, the archive's address is the preview's, set by a later stage.
#   - Values already set on a machine without this environment's signing key,
#     because neither the key in the file nor the edge can then be checked.
#   - A write without a terminal to confirm on, unless --yes is given; the
#     production apply then still asks for its own typed APPLY.
#
# Usage:
#   scripts/production-cutover.sh --target staging --stage archive-base --dry-run
#   scripts/production-cutover.sh --target staging --stage archive-base
#   scripts/production-cutover.sh --target production --stage archive-base
#
# Flags:
#   --target staging|production   The environment (required).
#   --stage archive-base          The stage to run (required).
#   --dry-run                     Show what the stage would change, and stop.
#   --yes                         Take the values-file confirmation as given.
#                                 The production apply still asks its own.
#
# Test seams, each announced on stderr, because a stubbed run proves nothing:
#   PRODUCTION_CUTOVER_TERRAFORM_BIN   terraform
#   PRODUCTION_CUTOVER_APPLY_CMD       scripts/terraform-apply.sh
#   PRODUCTION_CUTOVER_KEY_CMD         scripts/provision-archive-signing-key.sh
#   PRODUCTION_CUTOVER_VERIFY_CMD      scripts/verify-archive-edge.sh
#   PRODUCTION_CUTOVER_KEY_DIR         where the signing keys live (~/AWS)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/closing-report.sh
source "${REPO_ROOT}/scripts/lib/closing-report.sh"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"

TARGET=""
STAGE=""
DRY_RUN=0

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { cr_error "--target requires an argument"; exit 2; }
      ;;
    --stage)
      STAGE="${2:-}"
      shift 2 || { cr_error "--stage requires a stage name"; exit 2; }
      ;;
    --dry-run) DRY_RUN=1; shift ;;
    # Parsed after the library is sourced, which assigns ASSUME_YES
    # unconditionally, so only this flag can set it.
    --yes) ASSUME_YES="yes"; shift ;;
    --help|-h) usage; cr_finish ;;
    *) cr_error "unknown argument '$1'"; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2

case "$STAGE" in
  archive-base) ;;
  "") cr_error "--stage is required (one of: archive-base)"; exit 2 ;;
  *) cr_error "unknown stage '${STAGE}' (one of: archive-base)"; exit 2 ;;
esac

TF_DIR="${REPO_ROOT}/terraform/${TARGET}"

# The seams, announced, because a stubbed run proves nothing about the estate.
TF_BIN="${PRODUCTION_CUTOVER_TERRAFORM_BIN:-terraform}"
APPLY_CMD="${PRODUCTION_CUTOVER_APPLY_CMD:-${REPO_ROOT}/scripts/terraform-apply.sh}"
KEY_CMD="${PRODUCTION_CUTOVER_KEY_CMD:-${REPO_ROOT}/scripts/provision-archive-signing-key.sh}"
VERIFY_CMD="${PRODUCTION_CUTOVER_VERIFY_CMD:-${REPO_ROOT}/scripts/verify-archive-edge.sh}"
KEY_DIR="${PRODUCTION_CUTOVER_KEY_DIR:-${HOME}/AWS}"
for seam in PRODUCTION_CUTOVER_TERRAFORM_BIN PRODUCTION_CUTOVER_APPLY_CMD \
            PRODUCTION_CUTOVER_KEY_CMD PRODUCTION_CUTOVER_VERIFY_CMD PRODUCTION_CUTOVER_KEY_DIR; do
  if [[ -n "${!seam:-}" ]]; then
    echo "SYNTHETIC: ${seam}='${!seam}' -- this run proves nothing about the estate." >&2
  fi
done
KEY_ARGS=(--target "$TARGET")
[[ -n "${PRODUCTION_CUTOVER_KEY_DIR:-}" ]] && KEY_ARGS+=(--key-dir "$KEY_DIR")
PRIVATE_KEY="${KEY_DIR}/archive-signing-key-${TARGET}.pem"

# The values file. A missing file or a dangling link means the private
# operations checkout is not on this machine, and no environment can be
# applied without it.
TFVARS_LINK="${TF_DIR}/terraform.tfvars"
if [[ -L "$TFVARS_LINK" && ! -e "$TFVARS_LINK" ]]; then
  cr_die "terraform/${TARGET}/terraform.tfvars points at nothing: the private operations checkout is absent, and this script never improvises a values file."
fi
if [[ ! -e "$TFVARS_LINK" ]]; then
  cr_die "terraform/${TARGET}/terraform.tfvars does not exist: the private operations checkout is not linked here, and this script never improvises a values file."
fi
TFVARS_PATH="$(resolve_tfvars_target "$TFVARS_LINK" "$REPO_ROOT")" \
  || cr_die "the values file for ${TARGET} cannot be written safely; nothing was changed."

# The values file carries operator addresses, and its companion secrets file
# carries vault-governed values. Neither is printed or diffed in full: the only
# lines of it shown are this stage's own three settings, and the rewritten file
# is held in this shell's memory and written back with the printf builtin, so
# its content never sits in another process's argv or in a temp file.

# Every terraform call below reaches the state backend, so the identity is
# settled and proved once, here. A run with terraform stubbed reaches nothing.
if [[ -z "${PRODUCTION_CUTOVER_TERRAFORM_BIN:-}" ]]; then
  # shellcheck source=lib/aws-profile.sh
  source "${REPO_ROOT}/scripts/lib/aws-profile.sh"
  aws_profile_ensure || cr_die "no AWS identity to plan or apply ${TARGET} with; nothing was changed."
fi

# ── Reading the three settings ───────────────────────────────────────────────

FLAG_PATTERN='^[[:space:]]*enable_archive[[:space:]]*='
URL_PATTERN='^[[:space:]]*archive_platform_url[[:space:]]*='

# The last assignment of enable_archive, which is the one terraform reads;
# empty when the file sets none. grep finding no line is an answer.
read_flag() {
  grep -E "$FLAG_PATTERN" "$1" | tail -n 1 \
    | sed -E 's/^[^=]*=[[:space:]]*"?([a-z]+)"?.*/\1/' || [[ $? == 1 ]]
}

read_url() {
  grep -E "$URL_PATTERN" "$1" | tail -n 1 \
    | sed -E 's/^[^=]*=[[:space:]]*"([^"]*)".*/\1/' || [[ $? == 1 ]]
}

# The public key's whole assignment as written: one line, or a heredoc through
# its closing EOT. The last one in the file, as terraform reads.
read_key_block() {
  awk '
    /^[ \t]*archive_signing_public_key[ \t]*=/ {
      block = $0 "\n"
      inside = ($0 ~ /<</)
      next
    }
    inside {
      block = block $0 "\n"
      if ($0 ~ /^[ \t]*EOT[ \t]*$/) inside = 0
      next
    }
    END { printf "%s", block }
  ' "$1"
}

# The file with the three settings taken out, comments and every other line
# kept. Two files whose stripped forms match differ only in these settings.
strip_settings() {
  awk '
    /^[ \t]*archive_signing_public_key[ \t]*=/ { inside = ($0 ~ /<</); next }
    inside { if ($0 ~ /^[ \t]*EOT[ \t]*$/) inside = 0; next }
    /^[ \t]*(enable_archive|archive_platform_url)[ \t]*=/ { next }
    { print }
  ' "$1"
}

# Terraform's diagnostic titles ("Error: ..."), joined on one line, or a note
# that it printed none. Never the lines beneath a title, which can quote the
# values or secrets file.
error_titles() {
  local titles
  titles="$(grep -E '^Error: ' | paste -sd ';' - || [[ $? == 1 ]])"
  printf '%s' "${titles:-no error title printed}"
}

# A read-only plan of the tree, extra arguments appended, with its exit status
# in PLAN_RC and its output in PLAN_OUT, held in memory and never printed whole.
# Its Error and Warning titles reach the closing report; the lines under them
# do not.
plan_tree() {
  PLAN_RC=0
  PLAN_OUT="$("$TF_BIN" -chdir="$TF_DIR" plan -input=false -no-color -detailed-exitcode "$@" 2>&1)" \
    || PLAN_RC=$?
  local line
  while IFS= read -r line; do
    case "$line" in
      "Error: "*) cr_error "terraform plan: ${line}" ;;
      "Warning: "*) cr_warn "terraform plan: ${line}" ;;
    esac
  done <<<"$PLAN_OUT"
}

refuse_other_pending() {
  grep -E '^Plan: ' <<<"$PLAN_OUT" || [[ $? == 1 ]]
  cr_error "other changes are pending in the ${TARGET} tree besides the archive base stack; apply them first with scripts/terraform-apply.sh --target ${TARGET}, then re-run. The values file is unchanged and nothing was applied"
  cr_unproved "the archive base stack on ${TARGET}: refused with other changes pending"
  cr_finish
}

echo "== production cutover: stage ${STAGE} on ${TARGET} =="
echo "values file: ${TFVARS_PATH}"

# The platform's own address, from the tree: the distribution's cloudfront.net
# name while the custom domain is off. public_base_url is not used, because it
# becomes the preview address in the window state.
OUT_RC=0
PLATFORM_URL="$("$TF_BIN" -chdir="$TF_DIR" output -raw platform_url 2>/dev/null)" || OUT_RC=$?
if [[ "$OUT_RC" != 0 ]]; then
  cr_die "the read of terraform/${TARGET}'s platform_url output failed (exit ${OUT_RC}); nothing was changed."
fi
if [[ ! "$PLATFORM_URL" =~ ^https://[a-z0-9]+\.cloudfront\.net$ ]]; then
  cr_die "terraform/${TARGET}'s platform_url is not the distribution's own https://<id>.cloudfront.net address, so this is not pass 1; the archive's address past pass 1 is set by a later stage. Nothing was changed."
fi

FILE_FLAG="$(read_flag "$TFVARS_PATH")"
FILE_URL="$(read_url "$TFVARS_PATH")"
FILE_KEY="$(read_key_block "$TFVARS_PATH")"
echo "  enable_archive currently reads:       ${FILE_FLAG:-<absent; default false>}"
echo "  archive_platform_url currently reads: ${FILE_URL:-<absent>}"
echo "  archive_signing_public_key:           $([[ -n "$FILE_KEY" ]] && echo set || echo '<absent>')"
echo "  platform_url (the address to pin):    ${PLATFORM_URL}"
echo ""

# The key assignment exactly as the key script prints it, comments dropped.
WANTED_KEY=""
read_wanted_key() {
  local out rc=0
  out="$(bash "$KEY_CMD" "${KEY_ARGS[@]}" tfvars)" || rc=$?
  if [[ "$rc" != 0 ]]; then
    cr_die "provision-archive-signing-key.sh tfvars failed (exit ${rc}); nothing was changed."
  fi
  WANTED_KEY="$(sed -n '/^archive_signing_public_key[[:space:]]*=/,/^[[:space:]]*EOT[[:space:]]*$/p' <<<"$out")"
  if ! grep -q -- '-----BEGIN PUBLIC KEY-----' <<<"$WANTED_KEY"; then
    cr_die "provision-archive-signing-key.sh tfvars printed no public key assignment; nothing was changed."
  fi
}

VALUES_SET=0
if [[ -e "$PRIVATE_KEY" ]]; then
  read_wanted_key
  if [[ "$FILE_FLAG" == true && "$FILE_URL" == "$PLATFORM_URL" && "$FILE_KEY" == "$WANTED_KEY" ]]; then
    VALUES_SET=1
  fi
elif [[ "$FILE_FLAG" == true ]]; then
  cr_die "enable_archive is already true in the ${TARGET} values file, but this machine has no ${PRIVATE_KEY}: the key in the file and the edge cannot be checked without it. Run this from the machine that holds ${TARGET}'s signing key. Nothing was changed."
fi

# ── Dry run ──────────────────────────────────────────────────────────────────

if (( DRY_RUN )); then
  if (( VALUES_SET )); then
    echo "The values file already holds all three settings; it would not be changed."
  else
    [[ -e "$PRIVATE_KEY" ]] || echo "Would generate ${PRIVATE_KEY} with provision-archive-signing-key.sh."
    echo "Would set enable_archive = true, archive_platform_url = \"${PLATFORM_URL}\""
    echo "and archive_signing_public_key from provision-archive-signing-key.sh tfvars."
  fi
  echo "Would run, in order:"
  echo "  1. terraform plan at the current values (read-only; anything else pending stops here)"
  echo "  2. the values-file write (typed APPLY), then scripts/terraform-apply.sh --target ${TARGET}"
  echo "  3. provision-archive-signing-key.sh store, unless status already reports a match"
  echo "  4. scripts/verify-archive-edge.sh --target ${TARGET}"
  cr_unproved "anything: a dry run changes and checks nothing"
  cr_finish
fi

# ── Values and apply ─────────────────────────────────────────────────────────

NEED_APPLY=1
if (( VALUES_SET )); then
  echo "The values file already holds all three settings; leaving it alone."
  echo "Planning ${TARGET} read-only to see whether the state holds them too."
  plan_tree -lock=false
  case "$PLAN_RC" in
    0)
      echo "Nothing is pending: the archive base stack is already applied."
      NEED_APPLY=0
      ;;
    2)
      # A plan with the archive off is clean only when the archive is the one
      # thing the state does not yet hold: a run that stopped between the write
      # and the apply.
      grep -E '^Plan: ' <<<"$PLAN_OUT" || [[ $? == 1 ]]
      echo "Changes are pending; planning with enable_archive = false to see whether the archive is the only one."
      plan_tree -lock=false -var enable_archive=false
      case "$PLAN_RC" in
        0) echo "Only the archive base stack is pending; applying it." ;;
        2) refuse_other_pending ;;
        *)
          cr_error "the read-only plan of ${TARGET} with enable_archive = false failed (exit ${PLAN_RC}); nothing was applied. Read a plain plan with scripts/terraform-apply.sh --target ${TARGET}"
          cr_unproved "the archive base stack on ${TARGET}: terraform could not tell what is pending"
          cr_finish
          ;;
      esac
      ;;
    *)
      cr_error "the read-only plan of ${TARGET} failed (exit ${PLAN_RC}); nothing was applied"
      cr_unproved "the archive base stack on ${TARGET}: the state could not be read"
      cr_finish
      ;;
  esac
else
  # Planned at the current values first, before anything is generated or
  # written: a clean plan means the apply below carries this stage and nothing
  # else.
  echo "Planning ${TARGET} read-only at its current values, so the apply carries only this stage."
  plan_tree -lock=false
  case "$PLAN_RC" in
    0) echo "Nothing else is pending." ;;
    2) refuse_other_pending ;;
    *)
      cr_error "the read-only plan of ${TARGET} at its current values failed (exit ${PLAN_RC}); the values file is unchanged and nothing was applied"
      cr_unproved "the archive base stack on ${TARGET}: terraform could not plan the current values"
      cr_finish
      ;;
  esac

  if [[ ! -e "$PRIVATE_KEY" ]]; then
    echo "Generating ${TARGET}'s archive signing key."
    if ! bash "$KEY_CMD" "${KEY_ARGS[@]}" generate; then
      cr_die "provision-archive-signing-key.sh generate failed; the values file is unchanged and nothing was applied."
    fi
    read_wanted_key
  fi

  # The new file: the three settings taken out wherever they were, and set
  # once, where the first of them stood (or at the end of a file that sets
  # none of them). Every other line, comments included, is kept as it was.
  NEW_BLOCK="enable_archive = true
archive_platform_url = \"${PLATFORM_URL}\"
${WANTED_KEY}"
  NEW_CONTENT="$(NEW_BLOCK="$NEW_BLOCK" awk '
    function put() { if (!placed) { print ENVIRON["NEW_BLOCK"]; placed = 1 } }
    /^[ \t]*archive_signing_public_key[ \t]*=/ { put(); inside = ($0 ~ /<</); next }
    inside { if ($0 ~ /^[ \t]*EOT[ \t]*$/) inside = 0; next }
    /^[ \t]*(enable_archive|archive_platform_url)[ \t]*=/ { put(); next }
    { print }
    END { put() }
  ' "$TFVARS_PATH")"

  # The rewrite must have changed nothing but the three settings, and must
  # hold each of them once at the value wanted. A rewrite that lost a line
  # would be written over the only copy outside the vault, so it is refused.
  if [[ "$(strip_settings "$TFVARS_PATH")" != "$(strip_settings <(printf '%s\n' "$NEW_CONTENT"))" ]] \
     || [[ "$(read_flag <(printf '%s\n' "$NEW_CONTENT"))" != true ]] \
     || [[ "$(read_url <(printf '%s\n' "$NEW_CONTENT"))" != "$PLATFORM_URL" ]] \
     || [[ "$(read_key_block <(printf '%s\n' "$NEW_CONTENT"))" != "$WANTED_KEY" ]] \
     || [[ "$(grep -cE "$FLAG_PATTERN" <<<"$NEW_CONTENT")" != 1 ]] \
     || [[ "$(grep -cE "$URL_PATTERN" <<<"$NEW_CONTENT")" != 1 ]]; then
    cr_die "the rewrite of the archive settings did not come out as exactly those three settings changed; the values file is unchanged."
  fi

  # Planned with the new values before the file is touched, so anything
  # Terraform rejects at plan time (a validation, a precondition) stops the run
  # with the file as it was. The public key is public, so it may travel in argv.
  NEW_KEY_VALUE="$(sed -n '2,$p' <<<"$WANTED_KEY" | sed '$d' | sed 's/^  //')"
  echo "Planning ${TARGET} read-only with the archive settings before writing anything."
  plan_tree -lock=false -var enable_archive=true -var "archive_platform_url=${PLATFORM_URL}" \
    -var "archive_signing_public_key=${NEW_KEY_VALUE}"
  case "$PLAN_RC" in
    0|2) echo "The plan succeeded." ; echo "" ;;
    *)
      cr_error "the read-only plan of ${TARGET} with the archive settings failed (exit ${PLAN_RC}); the values file is unchanged and nothing was applied"
      cr_unproved "the archive base stack on ${TARGET}: terraform could not plan it"
      cr_finish
      ;;
  esac

  # Only the three settings' own lines, before and after: a full diff would
  # print the neighbouring lines as context, and those are operator addresses.
  echo "Values-file change in ${TFVARS_PATH} (the archive settings only):"
  {
    grep -E "$FLAG_PATTERN|$URL_PATTERN" "$TFVARS_PATH" || [[ $? == 1 ]]
    [[ -z "$FILE_KEY" ]] || printf '%s\n' "$FILE_KEY"
  } | sed 's/^/-/' | tfvars_mask /dev/stdin
  sed 's/^/+/' <<<"$NEW_BLOCK" | tfvars_mask /dev/stdin
  echo ""
  echo "Turning the archive on cannot be undone: the archive bucket is protected"
  echo "from destruction. Type APPLY to write this to the values file and apply ${TARGET}."
  if ! confirm_from_tty "Type APPLY to continue: " "APPLY"; then
    cr_die "Aborted: the values file is unchanged and nothing was applied."
  fi
  # Through the link, never mv: the values file is a symlink into the private
  # operations checkout, and moving over it would leave a real file here.
  printf '%s\n' "$NEW_CONTENT" > "$TFVARS_PATH"
  if [[ "$(read_flag "$TFVARS_PATH")" != true || "$(read_url "$TFVARS_PATH")" != "$PLATFORM_URL" \
        || "$(read_key_block "$TFVARS_PATH")" != "$WANTED_KEY" ]]; then
    cr_die "the archive settings did not read back from ${TFVARS_PATH} as written; nothing was applied."
  fi
  echo "  The three archive settings are written and read back."
  echo ""
fi

if (( NEED_APPLY )); then
  echo "== applying ${TARGET} =="
  # Run directly rather than through cr_run: on production it asks for a typed
  # APPLY on the terminal. Its own problems reach this report through the
  # closing report's nested mode.
  if ! bash "$APPLY_CMD" --target "$TARGET"; then
    cr_error "the values file holds the archive settings but the ${TARGET} apply did not land; re-run this command to finish it"
    cr_unproved "the archive base stack on ${TARGET}: the apply failed"
    cr_finish
  fi
  cr_proved "the archive base stack applied to ${TARGET} through scripts/terraform-apply.sh"
  echo ""
fi

# ── The private key and the edge ─────────────────────────────────────────────

key_matches() {
  local out
  out="$(bash "$KEY_CMD" "${KEY_ARGS[@]}" status 2>&1)" || return 1
  grep -qE '^[[:space:]]*match:[[:space:]]+yes' <<<"$out"
}

if key_matches; then
  echo "The stored signing key already matches the local one."
else
  echo "== storing ${TARGET}'s archive signing key =="
  if ! bash "$KEY_CMD" "${KEY_ARGS[@]}" store; then
    cr_error "provision-archive-signing-key.sh store failed; re-run this command to finish it"
    cr_unproved "the archive base stack on ${TARGET}: the private key is not stored"
    cr_finish
  fi
  if ! key_matches; then
    cr_error "after the store, provision-archive-signing-key.sh status does not report the stored key matching the local one"
    cr_unproved "the archive base stack on ${TARGET}: the stored key is unconfirmed"
    cr_finish
  fi
fi
cr_proved "the archive signing key in Parameter Store on ${TARGET} matches the local key"

echo ""
echo "== verifying the ${TARGET} archive edge =="
if ! bash "$VERIFY_CMD" --target "$TARGET"; then
  cr_error "scripts/verify-archive-edge.sh --target ${TARGET} did not pass; the archive is applied, but what it serves is not proved"
  cr_unproved "the ${TARGET} archive edge"
  cr_finish
fi
cr_proved "the ${TARGET} archive edge: gate page, unsigned refusal and signed access checked by verify-archive-edge.sh"
cr_unproved "access-log delivery, which can lag an hour: run scripts/verify-archive-edge.sh --target ${TARGET} --profile footbag-operator --check-logs later"
cr_finish
