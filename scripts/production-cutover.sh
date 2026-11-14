#!/usr/bin/env bash
# production-cutover.sh
#
# The staged applies of the production cutover, one stage per apply, each one a
# change that sets several values in an environment's values file together and
# so cannot go through scripts/set-terraform-gate.sh, which sets one gate per
# apply. Every stage has the same shape: it proves its preconditions, shows the
# values-file change, takes a typed APPLY, writes the values through the
# file's symlink, applies through scripts/terraform-apply.sh, and verifies what
# is served. Later stages (the custom domain, the window state, the freeze)
# join this file when they are first used.
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
# STAGE launch: the go-live cutover change, production only.
#
# Lifts the migration notice and, in the same apply, removes every name not
# served from go-live:
#   enable_cutover_notice          false (the platform serves www)
#   enable_preview_record          false (preview, the pre-cutover name, goes)
#   enable_legacy_mirror_records   false (every mirrored legacy name goes)
#   the "g" entry of each Workspace map, removed; my and *.my stay until the
#   IFPA secretary retires them.
# Launch opens member sign-in to the public and the legacy names do not come
# back, so before it writes anything the stage proves:
#   - the window: the apex and www already point at the platform and the
#     cutover-day mail apply is on, without which removing the mirror deletes
#     the apex mail records;
#   - the ifpa mail records have left the mirror maps for the Workspace maps;
#   - the cutover log (footbag_private_repo/cutover/CUTOVER_LOG.md, its T-0
#     section) records the cutover-day mail results as passed, the admin@
#     receive-and-reply test among them, since the legal page links admin@ as
#     the public contact from the moment of launch;
#   - nothing else is pending in the tree;
#   - the plan with the new values is exactly the launch, read from Terraform's
#     JSON plan: it destroys only legacy mirror, preview and Workspace g
#     records and every one of those the state holds, and creates exactly the
#     cutover-window alarms the notice keeps absent (the zero-logins watch only
#     when it was armed);
#   - the fresh zone capture taken for the launch (--capture, from
#     scripts/capture-legacy-zone.sh, a complete transfer): every name in it
#     leaves the zone in this plan, unless a Workspace map entry keeps it, and
#     the run prints each name's outcome for the cutover log.
# It prints the reverse lookups of the legacy addresses for the cutover log
# (recorded, never a stop), shows the change, takes a typed APPLY, writes the
# values through the link, applies through scripts/terraform-apply.sh, and
# proves the tree then plans clean. A run that stops after the write is
# finished by running it again: it checks the pending plan is still exactly the
# launch and applies it. The base-address deploy, the launch checks and the
# mail resume that follow are their own steps.
#
# WHAT IT REFUSES.
#   - Any stage it does not know, and a target other than staging or production.
#   - The launch stage anywhere but production; on production, any of its
#     preconditions above unmet, or the launch settings half written.
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
#   scripts/production-cutover.sh --target production --stage launch \
#     --capture <fresh zone capture> --dry-run
#   scripts/production-cutover.sh --target production --stage launch \
#     --capture <fresh zone capture>
#
# Flags:
#   --target staging|production   The environment (required).
#   --stage archive-base|launch   The stage to run (required).
#   --capture <file>              The launch stage's fresh zone capture
#                                 (required for launch, refused otherwise).
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
#   PRODUCTION_CUTOVER_DIG_BIN         dig
#   PRODUCTION_CUTOVER_LOG             the cutover log
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/closing-report.sh
source "${REPO_ROOT}/scripts/lib/closing-report.sh"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"

TARGET=""
STAGE=""
CAPTURE=""
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
    --capture)
      CAPTURE="${2:-}"
      shift 2 || { cr_error "--capture requires a path"; exit 2; }
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
  archive-base|launch) ;;
  "") cr_error "--stage is required (one of: archive-base, launch)"; exit 2 ;;
  *) cr_error "unknown stage '${STAGE}' (one of: archive-base, launch)"; exit 2 ;;
esac
if [[ "$STAGE" == launch && "$TARGET" != production ]]; then
  cr_error "the launch stage runs on production only: ${TARGET} has no cutover notice and no legacy mirror to remove"
  exit 2
fi
if [[ "$STAGE" == launch && -z "$CAPTURE" ]]; then
  cr_error "the launch stage needs --capture <file>: the fresh zone capture taken for the launch with scripts/capture-legacy-zone.sh, which the removal set is checked against"
  exit 2
fi
if [[ "$STAGE" != launch && -n "$CAPTURE" ]]; then
  cr_error "--capture is the launch stage's; stage ${STAGE} takes none"
  exit 2
fi

TF_DIR="${REPO_ROOT}/terraform/${TARGET}"

# The seams, announced, because a stubbed run proves nothing about the estate.
TF_BIN="${PRODUCTION_CUTOVER_TERRAFORM_BIN:-terraform}"
APPLY_CMD="${PRODUCTION_CUTOVER_APPLY_CMD:-${REPO_ROOT}/scripts/terraform-apply.sh}"
KEY_CMD="${PRODUCTION_CUTOVER_KEY_CMD:-${REPO_ROOT}/scripts/provision-archive-signing-key.sh}"
VERIFY_CMD="${PRODUCTION_CUTOVER_VERIFY_CMD:-${REPO_ROOT}/scripts/verify-archive-edge.sh}"
KEY_DIR="${PRODUCTION_CUTOVER_KEY_DIR:-${HOME}/AWS}"
DIG_BIN="${PRODUCTION_CUTOVER_DIG_BIN:-dig}"
LOG_PATH="${PRODUCTION_CUTOVER_LOG:-${REPO_ROOT}/footbag_private_repo/cutover/CUTOVER_LOG.md}"
for seam in PRODUCTION_CUTOVER_TERRAFORM_BIN PRODUCTION_CUTOVER_APPLY_CMD \
            PRODUCTION_CUTOVER_KEY_CMD PRODUCTION_CUTOVER_VERIFY_CMD PRODUCTION_CUTOVER_KEY_DIR \
            PRODUCTION_CUTOVER_DIG_BIN PRODUCTION_CUTOVER_LOG; do
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

# ── STAGE launch ─────────────────────────────────────────────────────────────

LAUNCH_FLAG_PATTERN='^[[:space:]]*(enable_cutover_notice|enable_preview_record|enable_legacy_mirror_records)[[:space:]]*='

# The last assignment of a true/false setting, which is the one terraform
# reads; empty when the file sets none. grep finding no line is an answer.
read_bool() {
  grep -E "^[[:space:]]*$1[[:space:]]*=" "$2" | tail -n 1 \
    | sed -E 's/^[^=]*=[[:space:]]*"?([a-z]+)"?.*/\1/' || [[ $? == 1 ]]
}

# The keys a top-level map setting declares, one per line. Brackets are counted
# so a key's multi-line list is read as one entry.
map_keys() {
  awk -v name="$1" '
    $0 ~ "^[ \t]*" name "[ \t]*=[ \t]*[{]" { if ($0 !~ /[{][ \t]*[}]/) { inside = 1; depth = 0 }; next }
    inside && depth == 0 && /^[ \t]*[}]/ { inside = 0; next }
    inside {
      if (depth == 0 && $0 ~ /^[ \t]*"[^"]*"[ \t]*=/) {
        k = $0; sub(/^[ \t]*"/, "", k); sub(/".*/, "", k); print k
      }
      line = $0; o = gsub(/\[/, "", line); line = $0; c = gsub(/\]/, "", line); depth += o - c
    }
  ' "$2"
}

# The file with the "g" entry taken out of each Workspace map, every other line
# kept as written. The g prefix domain retires in the launch apply; my and *.my
# stay until the IFPA secretary retires them. Exits 3 when a Workspace map or
# its g entry never closes, since the bracket count would otherwise carry the
# drop on to the end of the file.
drop_g_entries() {
  awk '
    /^[ \t]*workspace_(mx|txt|cname)_records[ \t]*=[ \t]*[{]/ && !/[{][ \t]*[}]/ { if (inside) bad = 1; inside = 1; depth = 0; print; next }
    inside && !skipping && depth == 0 && /^[ \t]*[}]/ { inside = 0; print; next }
    inside {
      line = $0; o = gsub(/\[/, "", line); line = $0; c = gsub(/\]/, "", line)
      if (skipping) { depth += o - c; if (depth <= 0) { skipping = 0; depth = 0 }; next }
      if (depth == 0 && $0 ~ /^[ \t]*"g"[ \t]*=/) { depth = o - c; if (depth > 0) skipping = 1; else depth = 0; next }
      depth += o - c
      print; next
    }
    { print }
    END { if (inside || skipping || bad) exit 3 }
  ' "$1"
}

# A top-level map setting as written, its first line through its closing brace.
map_block() {
  awk -v name="$1" '
    $0 ~ "^[ \t]*" name "[ \t]*=" { inside = 1 }
    inside { print; if ($0 ~ /^[}]/ || $0 ~ /[{][ \t]*[}]/) inside = 0 }
  ' "$2"
}

# The Value cell of the row in the cutover log's T-0 section (4b) whose first
# cell starts with the given text; exit 1 when no such row exists.
log_value() {
  awk -v want="$1" '
    /^### 4b\./ { inside = 1; next }
    inside && /^#/ { inside = 0 }
    inside && /^[|]/ {
      split($0, cell, "|")
      r = cell[2]; gsub(/^[ \t]+|[ \t]+$/, "", r)
      if (index(r, want) == 1) { v = cell[3]; gsub(/^[ \t]+|[ \t]+$/, "", v); print v; found = 1; exit }
    }
    END { if (!found) exit 1 }
  ' "$LOG_PATH"
}

# Launch opens the site to every visitor, so it waits on the cutover-day mail
# results being recorded: the mail apply, its record check, the outside tests,
# the admin@ receive-and-reply test the legal page's contact link depends on,
# the certificate-address bounce test, and the alarm receipts. Each row's
# first cell, then the word its value must start with.
LAUNCH_LOG_ROWS=(
  "Mail apply|applied"
  "\`scripts/verify-mail-records.sh --stage mail-day\` passes|pass"
  "Outside tests|pass"
  "\`admin@\` receive-and-reply test|pass"
  "Certificate-address bounce test|pass"
  "Alarm subscriptions confirmed|pass"
  "Test alarm|pass"
)

launch_log_gate() {
  [[ -f "$LOG_PATH" ]] || cr_die "no cutover log at ${LOG_PATH}: launch waits on the cutover-day mail results recorded there, and the private operations checkout is missing. Nothing was changed."
  local entry row lead value missing=0
  for entry in "${LAUNCH_LOG_ROWS[@]}"; do
    row="${entry%|*}"
    lead="${entry##*|}"
    if ! value="$(log_value "$row")"; then
      cr_error "the cutover log's T-0 section has no row \"${row}\""
      missing=1
      continue
    fi
    if [[ "${value,,}" != "${lead}"* ]]; then
      cr_error "the cutover log's row \"${row}\" reads \"${value:-<empty>}\"; launch waits until it records ${lead}"
      missing=1
      continue
    fi
    echo "  cutover log: ${row}: ${value}"
  done
  if (( missing )); then
    cr_unproved "the launch apply: the cutover-day mail results are not all recorded as passed"
    cr_finish
  fi
  cr_proved "the cutover-day mail results recorded as passed in the cutover log, the admin@ receive-and-reply test among them"
}

# Reads a saved plan as Terraform's JSON plan representation and prints one
# line per way it differs from the launch apply; nothing printed means the plan
# is exactly the launch. Destroyed: only legacy mirror records, the preview
# records and the Workspace g entries, and every one of those the state holds.
# Created: exactly the cutover-window alarms the notice keeps absent, the
# zero-logins watch only when it was armed. Updated in place: allowed (the
# notice function and the addresses that follow the base address). And every
# name in the fresh zone capture leaves the zone in this plan, unless what keeps
# it is a Workspace map entry, which is IFPA's and stays.
launch_plan_problems() {
  jq -r --argjson login "$1" --argjson cap "$2" '
    def may_go: test("^aws_route53_record\\.(legacy_mirror_(a|cname|mx|txt)\\[\"[^\"]+\"\\]|preview_(a|aaaa)\\[0\\]|workspace_(mx|txt|cname)\\[\"g\"\\])$");
    (["aws_route53_health_check.site_ready[0]",
      "aws_cloudwatch_metric_alarm.site_unavailable[0]",
      "aws_cloudwatch_metric_alarm.cloudfront_5xx[0]"]
      + (if $login then ["aws_cloudwatch_metric_alarm.cutover_zero_logins[0]"] else [] end)) as $want
    | [.resource_changes[]? | select(.mode == "managed")
        | {a: .address, x: (.change.actions | join(","))}] as $ch
    | ($ch | map(select(.x == "delete") | .a)) as $del
    | ($ch | map(select(.x == "create") | .a)) as $cre
    | [.prior_state.values.root_module? // {} | .. | objects
        | select(has("address") and (.mode? == "managed")) | .address] as $prior
    | (if .prior_state == null then "the plan carries no prior state, so what the zone holds cannot be checked" else empty end),
      ($ch[] | select(.x != "no-op" and .x != "read" and .x != "delete" and .x != "create" and .x != "update")
        | "would \(.x) \(.a)"),
      ($del[] | select(may_go | not) | "would destroy \(.)"),
      ($cre[] | select(IN($want[]) | not) | "would create \(.)"),
      ($want[] | select(IN($cre[]) | not) | "does not create \(.)"),
      ($prior[] | select(may_go) | select(IN($del[]) | not) | "leaves \(.) in place"),
      ($cap[] as $l
        | [$prior[] | select(endswith("[\"" + $l + "\"]")) | select(IN($del[]) | not)
            | select(test("^aws_route53_record\\.workspace_") | not)]
        | select(length > 0)
        | "the fresh capture names \($l), which stays served by \(join(", "))")
  '
}

# One line per name in the fresh capture: removed by this plan, kept by a
# Workspace map entry, or held by no per-name Terraform record (removed at an
# earlier apply, or served by a fixed record). Printed for the cutover log's
# removal-set row.
launch_capture_report() {
  jq -r --argjson cap "$1" '
    [.resource_changes[]? | select(.change.actions == ["delete"]) | .address] as $del
    | [.prior_state.values.root_module? // {} | .. | objects
        | select(has("address") and (.mode? == "managed")) | .address] as $prior
    | $cap[] as $l
    | [$prior[] | select(endswith("[\"" + $l + "\"]"))] as $held
    | if ($held | length) == 0 then "  \($l): no per-name record in Terraform (removed by an earlier apply, or served by a fixed record such as the www alias)"
      elif ([$held[] | select(IN($del[]))] | length) == ($held | length) then "  \($l): removed by this plan"
      elif ([$held[] | select(IN($del[]) | not) | select(test("^aws_route53_record\\.workspace_"))] | length) > 0
        and ([$held[] | select(IN($del[]))] | length) > 0 then "  \($l): partly removed; its Workspace entry stays"
      else "  \($l): kept by its Workspace entry" end
  '
}

# The fresh zone capture's names, as relative labels: the transfer must open
# and close with the zone's SOA, as a complete transfer does, and name at
# least one record below the apex.
read_capture_labels() {
  [[ -r "$CAPTURE" ]] || cr_die "the zone capture ${CAPTURE} cannot be read. Nothing was changed."
  local records first last labels
  records="$(grep -vE '^[[:space:]]*(;|$)' "$CAPTURE" || [[ $? == 1 ]])"
  first="$(head -n 1 <<<"$records" | awk '{print toupper($4)}')"
  last="$(tail -n 1 <<<"$records" | awk '{print toupper($4)}')"
  if [[ "$first" != SOA || "$last" != SOA ]]; then
    cr_die "the zone capture ${CAPTURE} does not open and close with the zone's SOA record, so it is not a complete transfer. Take a fresh one with scripts/capture-legacy-zone.sh. Nothing was changed."
  fi
  labels="$(awk '{print tolower($1)}' <<<"$records" | sed -n 's/\.footbag\.org\.$//p' | sort -u)"
  [[ -n "$labels" ]] || cr_die "the zone capture ${CAPTURE} names no record below the apex. Nothing was changed."
  CAPTURE_JSON="$(jq -R . <<<"$labels" | jq -cs .)"
  echo "  zone capture: ${CAPTURE} ($(wc -l <<<"$labels") names below the apex)"
}

# Plans with the given extra arguments into a private saved plan and checks it.
# The saved plan can hold secrets, so it lives in a mode-700 directory removed
# on every exit, and only addresses and actions are read out of it.
check_launch_plan() {
  local login="$1"; shift
  local plan_file="${LAUNCH_TMP}/launch.tfplan" json problems
  plan_tree -lock=false -out="$plan_file" "$@"
  case "$PLAN_RC" in
    2) ;;
    0)
      cr_error "the launch plan shows no changes, so it is not the launch apply; nothing was applied"
      cr_unproved "the launch apply: terraform planned nothing to change"
      cr_finish
      ;;
    *)
      cr_error "the read-only launch plan of production failed (exit ${PLAN_RC}); the values file is unchanged and nothing was applied"
      cr_unproved "the launch apply: terraform could not plan it"
      cr_finish
      ;;
  esac
  json="$("$TF_BIN" -chdir="$TF_DIR" show -json "$plan_file" 2>/dev/null)" \
    || cr_die "terraform show -json of the launch plan failed; the values file is unchanged and nothing was applied."
  problems="$(launch_plan_problems "$login" "$CAPTURE_JSON" <<<"$json")" \
    || cr_die "the launch plan could not be read as Terraform's JSON plan; the values file is unchanged and nothing was applied."
  if [[ -n "$problems" ]]; then
    local p
    while IFS= read -r p; do cr_error "launch plan: ${p}"; done <<<"$problems"
    cr_unproved "the launch apply: the plan is not exactly the launch, so nothing was written or applied"
    cr_finish
  fi
  echo "The launch plan is exactly the launch: it destroys $(jq '[.resource_changes[]? | select(.change.actions == ["delete"])] | length' <<<"$json") records, creates the cutover-window alarms, and updates $(jq '[.resource_changes[]? | select(.change.actions == ["update"])] | length' <<<"$json") resources in place:"
  jq -r '.resource_changes[]? | select(.change.actions == ["update"]) | "  updated in place: \(.address)"' <<<"$json"
  echo "The fresh zone capture against the plan, for the cutover log's removal-set row:"
  launch_capture_report "$CAPTURE_JSON" <<<"$json"
}

# The reverse lookups of the legacy webmaster's addresses, read before the
# launch apply removes the names that point at them. Recorded, never a stop: a
# footbag.org answer is his to fix, and launch does not wait on it.
launch_reverse_lookups() {
  local ip out rc
  echo "Reverse lookups of the legacy addresses, for the cutover log's launch section:"
  for ip in 74.50.54.203 173.8.190.53 173.8.190.59 173.8.190.60; do
    rc=0
    out="$("$DIG_BIN" +short -x "$ip" 2>&1)" || rc=$?
    if [[ "$rc" != 0 ]]; then
      cr_warn "dig -x ${ip} failed (exit ${rc}): ${out}; record its reverse lookup in the cutover log by hand"
      continue
    fi
    echo "  ${ip} -> ${out:-<no PTR record>}"
  done
}

if [[ "$STAGE" == launch ]]; then
  command -v jq >/dev/null || cr_die "jq is not installed; the launch plan cannot be checked without it. Nothing was changed."
  LAUNCH_TMP="$(mktemp -d)"
  chmod 700 "$LAUNCH_TMP"
  cr_cleanup rm -rf "$LAUNCH_TMP"
  read_capture_labels

  CUR_NOTICE="$(read_bool enable_cutover_notice "$TFVARS_PATH")"
  CUR_PREVIEW="$(read_bool enable_preview_record "$TFVARS_PATH")"
  CUR_MIRROR="$(read_bool enable_legacy_mirror_records "$TFVARS_PATH")"
  CUR_ALIAS="$(read_bool enable_apex_alias_records "$TFVARS_PATH")"
  CUR_MAIL="$(read_bool ses_enable_mail_records "$TFVARS_PATH")"
  CUR_LOGIN="$(read_bool enable_cutover_login_alarm "$TFVARS_PATH")"
  G_LEFT=""
  for m in workspace_mx_records workspace_txt_records workspace_cname_records; do
    if grep -qx 'g' <<<"$(map_keys "$m" "$TFVARS_PATH")"; then G_LEFT="${G_LEFT} ${m}"; fi
  done
  echo "  enable_cutover_notice:        ${CUR_NOTICE:-<absent>}"
  echo "  enable_preview_record:        ${CUR_PREVIEW:-<absent>}"
  echo "  enable_legacy_mirror_records: ${CUR_MIRROR:-<absent>}"
  echo "  Workspace g entries in:      ${G_LEFT:- none}"
  echo "  enable_apex_alias_records:    ${CUR_ALIAS:-<absent>}"
  echo "  ses_enable_mail_records:      ${CUR_MAIL:-<absent>}"
  echo "  enable_cutover_login_alarm:   ${CUR_LOGIN:-<absent; default false>}"
  echo ""

  for f in enable_cutover_notice enable_preview_record enable_legacy_mirror_records; do
    [[ -n "$(read_bool "$f" "$TFVARS_PATH")" ]] \
      || cr_die "${f} is not set in the production values file; the launch changes only settings the file already carries. Nothing was changed."
  done
  # The apex and www have pointed at the platform since the freeze apply, and
  # the mail records must be on before the mirror goes: clearing the mirrored
  # names with them off deletes the apex mail records and sender policy.
  [[ "$CUR_ALIAS" == true ]] \
    || cr_die "enable_apex_alias_records is not true: the freeze apply has not switched the apex and www to the platform, so this is not the launch window. Nothing was changed."
  [[ "$CUR_MAIL" == true ]] \
    || cr_die "ses_enable_mail_records is not true: the cutover-day mail apply has not landed, and removing the legacy mirror without it deletes the apex mail records. Nothing was changed."
  # The ifpa list domain's mail records move from the mirror maps to the
  # Workspace maps before launch; left in the mirror, the launch removes them.
  for m in legacy_mirror_mx_records legacy_mirror_txt_records; do
    if grep -qx 'ifpa' <<<"$(map_keys "$m" "$TFVARS_PATH")"; then
      cr_die "${m} still carries ifpa: the ifpa mail records have not moved to the Workspace maps, and the launch would delete them. Nothing was changed."
    fi
  done
  [[ "$CUR_LOGIN" == true || "$CUR_LOGIN" == false || -z "$CUR_LOGIN" ]] \
    || cr_die "enable_cutover_login_alarm reads '${CUR_LOGIN}', neither true nor false. Nothing was changed."
  LOGIN_ARMED=false
  [[ "$CUR_LOGIN" == true ]] && LOGIN_ARMED=true

  RESUME=0
  if [[ "$CUR_NOTICE" == true ]]; then
    :
  elif [[ "$CUR_NOTICE" == false && "$CUR_PREVIEW" == false && "$CUR_MIRROR" == false && -z "$G_LEFT" ]]; then
    RESUME=1
    echo "The values file already holds the launch settings."
  else
    cr_die "the launch settings are half set (the notice is off but the preview, the mirror or a g entry remains); this is neither the launch window nor a finished launch write. Nothing was changed."
  fi

  launch_log_gate

  if (( DRY_RUN )); then
    if (( RESUME )); then
      echo "The values file would not be changed; the launch apply would be planned, checked and applied if still pending."
    else
      echo "Would set enable_cutover_notice, enable_preview_record and enable_legacy_mirror_records to false"
      echo "and remove the g entry from each Workspace map, then plan, check, apply."
    fi
    cr_unproved "anything beyond the preconditions: a dry run changes and checks nothing else"
    cr_finish
  fi

  if (( RESUME )); then
    echo "Planning production read-only to see whether the state holds the launch."
    plan_tree -lock=false
    case "$PLAN_RC" in
      0)
        cr_proved "the launch apply is already in production: the values file holds it and the tree plans clean"
        cr_unproved "the base-address deploy, the launch checks and the mail resume, which follow as their own steps"
        cr_finish
        ;;
      2) echo "Changes are pending; checking that they are exactly the launch." ;;
      *)
        cr_error "the read-only plan of production failed (exit ${PLAN_RC}); nothing was applied"
        cr_unproved "the launch apply: the state could not be read"
        cr_finish
        ;;
    esac
    check_launch_plan "$LOGIN_ARMED"
  else
    echo "Planning production read-only at its current values, so the apply carries only the launch."
    plan_tree -lock=false
    case "$PLAN_RC" in
      0) echo "Nothing else is pending." ;;
      2)
        grep -E '^Plan: ' <<<"$PLAN_OUT" || [[ $? == 1 ]]
        cr_error "other changes are pending in the production tree besides the launch; apply them first with scripts/terraform-apply.sh --target production, then re-run. The values file is unchanged and nothing was applied"
        cr_unproved "the launch apply: refused with other changes pending"
        cr_finish
        ;;
      *)
        cr_error "the read-only plan of production at its current values failed (exit ${PLAN_RC}); the values file is unchanged and nothing was applied"
        cr_unproved "the launch apply: terraform could not plan the current values"
        cr_finish
        ;;
    esac

    launch_reverse_lookups
    echo ""

    # The new file: the g entries dropped and each flag set false once, where
    # its first assignment stood. Every other line, comments included, is kept.
    DROPPED="$(drop_g_entries "$TFVARS_PATH")" \
      || cr_die "a Workspace map or its g entry in the values file never closes, so the g entries cannot be removed safely; the values file is unchanged."
    NEW_CONTENT="$(printf '%s\n' "$DROPPED" | awk '
      match($0, /^[ \t]*(enable_cutover_notice|enable_preview_record|enable_legacy_mirror_records)[ \t]*=/) {
        n = $0; sub(/^[ \t]*/, "", n); sub(/[ \t]*=.*/, "", n)
        if (!(n in seen)) { seen[n] = 1; print n " = false" }
        next
      }
      { print }
    ')"
    # The rewrite must change nothing but the launch settings: a rewrite that
    # lost a line would be written over the only copy outside the vault. Judged
    # by a plain line diff, independent of the functions that made it: every
    # line removed is a launch flag or part of a g entry, and every line added
    # is a launch flag set false.
    rewrite_ok=1
    DIFF_RC=0
    DIFF_OUT="$(diff "$TFVARS_PATH" <(printf '%s\n' "$NEW_CONTENT"))" || DIFF_RC=$?
    (( DIFF_RC <= 1 )) || cr_die "the rewrite of the launch settings could not be compared with the values file (diff exit ${DIFF_RC}); the values file is unchanged."
    REMOVED="$(sed -n 's/^< //p' <<<"$DIFF_OUT")"
    ADDED="$(sed -n 's/^> //p' <<<"$DIFF_OUT")"
    BAD_REMOVED="$(grep -vE "${LAUNCH_FLAG_PATTERN}|^[[:space:]]*\"g\"[[:space:]]*=|^[[:space:]]*\"[^\"]*\",?[[:space:]]*\$|^[[:space:]]*\],?[[:space:]]*\$|^\$" <<<"$REMOVED" || [[ $? == 1 ]])"
    BAD_ADDED="$(grep -vxE '(enable_cutover_notice|enable_preview_record|enable_legacy_mirror_records) = false|' <<<"$ADDED" || [[ $? == 1 ]])"
    [[ -z "$BAD_REMOVED" && -z "$BAD_ADDED" ]] || rewrite_ok=0
    for f in enable_cutover_notice enable_preview_record enable_legacy_mirror_records; do
      [[ "$(read_bool "$f" <(printf '%s\n' "$NEW_CONTENT"))" == false ]] || rewrite_ok=0
      [[ "$(grep -cE "^[[:space:]]*${f}[[:space:]]*=" <<<"$NEW_CONTENT")" == 1 ]] || rewrite_ok=0
    done
    for m in workspace_mx_records workspace_txt_records workspace_cname_records; do
      if grep -qx 'g' <<<"$(map_keys "$m" <(printf '%s\n' "$NEW_CONTENT"))"; then rewrite_ok=0; fi
    done
    (( rewrite_ok )) || cr_die "the rewrite of the launch settings did not come out as exactly those settings changed; the values file is unchanged."

    # Planned with the new values before the file is touched. The override
    # carries only the launch settings: the three flags and the Workspace maps,
    # which hold DNS values and no operator address.
    OVERRIDE="${LAUNCH_TMP}/launch-override.tfvars"
    {
      printf '%s\n' "enable_cutover_notice = false" "enable_preview_record = false" "enable_legacy_mirror_records = false"
      for m in workspace_mx_records workspace_txt_records workspace_cname_records; do
        map_block "$m" <(printf '%s\n' "$NEW_CONTENT")
      done
    } > "$OVERRIDE"
    echo "Planning production read-only with the launch settings before writing anything."
    check_launch_plan "$LOGIN_ARMED" -var-file="$OVERRIDE"
    echo ""

    # Only the launch settings' own lines, before and after: a full diff would
    # print neighbouring lines, and those are operator addresses.
    echo "Values-file change in ${TFVARS_PATH} (the launch settings only):"
    {
      grep -E "$LAUNCH_FLAG_PATTERN" "$TFVARS_PATH" | sed 's/^/-/' || [[ $? == 1 ]]
      diff <(grep -vE "$LAUNCH_FLAG_PATTERN" "$TFVARS_PATH") \
           <(grep -vE "$LAUNCH_FLAG_PATTERN" <<<"$NEW_CONTENT") \
        | sed -n 's/^< /-/p' || [[ $? == 1 ]]
      printf '%s\n' "+enable_cutover_notice = false" "+enable_preview_record = false" "+enable_legacy_mirror_records = false"
    } | tfvars_mask /dev/stdin
    echo ""
    echo "This is the launch: the notice lifts, member sign-in opens to the public, and the"
    echo "preview and every legacy name are removed, with no rollback to the legacy site."
    echo "Type APPLY to write this to the values file and apply production."
    if ! confirm_from_tty "Type APPLY to continue: " "APPLY"; then
      cr_die "Aborted: the values file is unchanged and nothing was applied."
    fi
    # Through the link, never mv: the values file is a symlink into the private
    # operations checkout, and moving over it would leave a real file here.
    printf '%s\n' "$NEW_CONTENT" > "$TFVARS_PATH"
    for f in enable_cutover_notice enable_preview_record enable_legacy_mirror_records; do
      [[ "$(read_bool "$f" "$TFVARS_PATH")" == false ]] \
        || cr_die "${f} did not read back as false from ${TFVARS_PATH}; nothing was applied."
    done
    echo "  The launch settings are written and read back."
    echo ""
  fi

  echo "== applying production =="
  # Run directly rather than through cr_run: on production it asks for a typed
  # APPLY on the terminal.
  if ! bash "$APPLY_CMD" --target "$TARGET"; then
    cr_error "the values file holds the launch settings but the production apply did not land; re-run this command to finish it"
    cr_unproved "the launch apply: the apply failed"
    cr_finish
  fi
  plan_tree -lock=false
  if [[ "$PLAN_RC" != 0 ]]; then
    cr_error "after the apply, production still plans changes (exit ${PLAN_RC}); re-run this command to finish the launch apply"
    cr_unproved "the launch apply: the state does not yet hold it"
    cr_finish
  fi
  cr_proved "the launch apply in production: applied through scripts/terraform-apply.sh, and the tree plans clean"
  cr_unproved "what is served: the base-address deploy, the launch checks (verify-cutover-notice.sh --front-door --expect-live and the survivor lookups) and the mail resume follow as their own steps"
  cr_finish
fi

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
