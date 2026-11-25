#!/usr/bin/env bash
# production-cutover.sh
#
# The staged applies of the production cutover, one stage per apply, each one a
# change that sets several values in an environment's values file together and
# so cannot go through scripts/set-terraform-gate.sh, which sets one gate per
# apply. Every stage has the same shape: it proves its preconditions, shows the
# values-file change, takes a typed APPLY, writes the values through the
# file's symlink, applies through scripts/terraform-apply.sh, and verifies what
# is served. In run order: archive-base (pass 1), custom-domain, ses-domain,
# window and rehearsal (pass 2, after the zone move), record-switch (the
# freeze), launch, and notice-raise (the rollback).
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
# STAGE custom-domain: the platform's own names, production only, pass 2.
#
# Puts the platform and the archive on their footbag.org names, in one apply:
#   enable_platform_custom_domain  true (the certificate for the apex, www and
#                                  preview, and the distribution's aliases)
#   enable_preview_record          true (preview, the pre-cutover name)
#   enable_archive_custom_domain   true (archive.footbag.org and its certificate)
#   archive_platform_url           https://preview.footbag.org, the platform's
#                                  address until the record switch clears it
# It proves pass 1's state (the archive stack and the mirror on, the alias and
# the notice off, the archive address the distribution's own), that the
# delegation converged at least 90000 seconds ago by the cutover log's
# zone-move section and is delegated now, and that the plan creates exactly the
# certificates, their validation, the preview and archive names and the two
# certificate-expiry alarms, destroys nothing, and moves the distribution and
# the host's base address. After the apply it asks CloudFront whether another
# distribution claims or overlaps any of the platform's names. --undo takes it
# all down again, the archive address back to the distribution's own.
#
# STAGE ses-domain: the SES domain identity, production only, pass 2.
#
#   ses_enable_domain_identity     true
#   ses_enable_domain_auth         true (the verification and DKIM records,
#                                  and the apply's wait, up to 45 minutes, on
#                                  SES verifying the domain)
# Together in one apply, after the same delegation wait as the custom domain.
# The plan creates exactly the identity, its DKIM, verification, records,
# topics and feedback setting, and changes nothing else. The sender cutover
# follows as its own script.
#
# STAGE window: the migration notice, before the record switch.
#
#   enable_cutover_notice          true (the edge function carries the notice;
#                                  the window alarms are removed while it is up)
# With the custom domain, the preview and the mirror on and the alias off.
# Run while the launch rehearsal is in progress, it is the rehearsal's return:
# rehearse_launch_base_address goes false in the same apply. --undo takes the
# notice down again, the alias still off.
#
# STAGE rehearsal: the launch dress rehearsal, from the window state.
#
#   enable_cutover_notice          false
#   rehearse_launch_base_address   true (the host is given www, which testers
#                                  reach through an edge address)
# Before the record switch only. Its APPLY attests the two things it cannot
# read: www and the apex in the Turnstile widget, and the outbox drained. The
# window stage returns from it.
#
# STAGE launch: the go-live cutover change, production only, in two runs.
#
# The first run, in the window after the record switch, publishes www as the
# host's base address while the notice is still up, and nothing else:
#   launch_www_base_address        true
# then stops for the code-only deploy that puts it on the host. The second
# run reads preview's robots.txt, which names www's sitemap only once the host
# is on www, and refuses until it does. It then lifts the notice and, in the
# same apply, removes every name not served from go-live, so www accepts form
# posts from the moment it serves the platform:
#   enable_cutover_notice          false (the platform serves www)
#   enable_preview_record          false (preview, the pre-cutover name, goes)
#   enable_legacy_mirror_records   false (every mirrored legacy name goes)
#   launch_www_base_address        false (www now follows from the notice off)
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
# launch and applies it. The launch checks and the mail resume that follow are
# their own steps. Run again after the notice raise, it is the rollback's
# re-lift, in the same two runs.
#
# STAGE record-switch: the switch at the write-freeze, production only.
#
# Points the apex and www at the platform, behind the migration notice, and
# arms the sign-in watch for launch, in one apply:
#   enable_apex_alias_records    true (the apex and www leave the legacy host)
#   enable_cutover_login_alarm   true (created only once launch lifts the
#                                notice, and on from here until the 48-hour
#                                watch after launch closes)
#   archive_platform_url         "" (the archive's gate pages point at www,
#                                the platform's address from launch on)
# The legacy names that are CNAMEs onto the apex or www ride the switched
# names, so the same apply removes them: Terraform holds them only while the
# alias is off. Nothing reaches the legacy site by name afterwards, so before
# it writes anything the stage proves:
#   - the window: the custom domain, the preview, the notice and the legacy
#     mirror all on, and no launch rehearsal in progress;
#   - the newest zone capture (--capture, from scripts/capture-legacy-zone.sh,
#     which names it footbag.org.<date>.zone), taken just in time while the
#     legacy nameservers answer: a complete transfer, no older than the
#     capture the cutover log's zone-move section records the mirror verified
#     against, its changes since that one listed by record for the typed APPLY
#     to accept, and its names riding the apex and www exactly the values
#     file's legacy_apex_cname_records;
#   - nothing else is pending in the tree;
#   - the plan with the new values is exactly the switch, read from
#     Terraform's JSON plan: it switches the apex and www records, creates
#     their IPv6 pair, destroys every apex-riding CNAME the state holds, each
#     name the capture shows riding the apex among them, and destroys nothing
#     else.
# The freeze itself (the legacy site read-only, the last crawls, the saved
# election results, the sealed group-message containers) cannot be read from
# here, so the sentence before the typed APPLY states it and the operator's
# APPLY attests it. A run that stops after the write is finished by running it
# again. The record lookups and the notice check that follow are their own
# steps.
#
# STAGE notice-raise: the migration notice raised again, production only.
#
# The rollback's first step, after launch: takes the public names out of
# service while preview serves the platform to the operator, in one apply:
#   enable_cutover_notice   true
#   enable_preview_record   true (the notice needs it: preview is then the
#                           only name reaching the platform)
# It proves the apex is switched and the custom domain on (with the alias off
# this is before the window, which is not a rollback), no launch rehearsal in
# progress, nothing else pending, and that the plan is exactly the raise: it
# changes the edge function, creates the preview pair, and destroys only the
# cutover-window alarms the notice keeps absent, every one the state holds.
# Lifting the notice again afterwards is the launch stage, run again. The
# preview base-address deploy and the checks that follow are their own steps.
#
# WHAT IT REFUSES.
#   - Any stage it does not know, and a target other than staging or production.
#   - Every stage but archive-base anywhere but production; on production,
#     any of its preconditions above unmet, or its settings half written.
#   - --undo for any stage but custom-domain and window.
#   - The custom-domain and ses-domain stages before the delegation has
#     converged 90000 seconds, with no convergence time in the cutover log,
#     or with footbag.org not delegated to the Route 53 zone now.
#   - Every stage but the launch while the launch's first run has published
#     www, and every stage but the window's return during the rehearsal.
#   - A zone capture that is not a complete transfer, and for the record
#     switch one not named for the day it was taken, one named for a day after
#     today, one older than the verified capture the cutover log records, or
#     one whose verified capture is not recorded, not verified or not beside it.
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
#   scripts/production-cutover.sh --target production --stage custom-domain
#   scripts/production-cutover.sh --target production --stage custom-domain --undo
#   scripts/production-cutover.sh --target production --stage ses-domain
#   scripts/production-cutover.sh --target production --stage window
#   scripts/production-cutover.sh --target production --stage window --undo
#   scripts/production-cutover.sh --target production --stage rehearsal
#   scripts/production-cutover.sh --target production --stage launch \
#     --capture <fresh zone capture> --dry-run
#   scripts/production-cutover.sh --target production --stage launch \
#     --capture <fresh zone capture>
#   scripts/production-cutover.sh --target production --stage record-switch \
#     --capture <newest zone capture>
#   scripts/production-cutover.sh --target production --stage notice-raise
#
# Flags:
#   --target staging|production   The environment (required).
#   --stage <stage>               The stage to run (required): archive-base,
#                                 custom-domain, ses-domain, window, rehearsal,
#                                 record-switch, launch or notice-raise.
#   --undo                        Take the custom domain or the window down
#                                 again (those two stages only).
#   --capture <file>              The fresh zone capture (required for launch
#                                 and record-switch, refused otherwise); the
#                                 record switch takes the newest, no older than
#                                 the verified capture in the cutover log.
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
#   PRODUCTION_CUTOVER_AWS_BIN         aws (the custom domain's alias check)
#   PRODUCTION_CUTOVER_CURL_BIN        curl (the launch's base-address check)
#   PRODUCTION_CUTOVER_LOG             the cutover log
#   PRODUCTION_CUTOVER_NOW             now, in epoch seconds, against which
#                                      the delegation wait is measured
#   PRODUCTION_CUTOVER_TODAY           today's date, YYYY-MM-DD, after which
#                                      no record-switch capture can be named
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
UNDO=0

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
    --undo) UNDO=1; shift ;;
    # Parsed after the library is sourced, which assigns ASSUME_YES
    # unconditionally, so only this flag can set it.
    --yes) ASSUME_YES="yes"; shift ;;
    --help|-h) usage; cr_finish ;;
    *) cr_error "unknown argument '$1'"; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2

STAGES_IN_ORDER="archive-base, custom-domain, ses-domain, window, rehearsal, record-switch, launch, notice-raise"

case "$STAGE" in
  archive-base|custom-domain|ses-domain|window|rehearsal|record-switch|launch|notice-raise) ;;
  "") cr_error "--stage is required (one of: ${STAGES_IN_ORDER})"; exit 2 ;;
  *) cr_error "unknown stage '${STAGE}' (one of: ${STAGES_IN_ORDER})"; exit 2 ;;
esac
if (( UNDO )) && [[ "$STAGE" != custom-domain && "$STAGE" != window ]]; then
  cr_error "--undo is the custom-domain and window stages' own; stage ${STAGE} is undone by a later stage, not by itself"
  exit 2
fi
if [[ "$STAGE" != archive-base && "$TARGET" != production ]]; then
  cr_error "the ${STAGE} stage runs on production only: ${TARGET} has no cutover notice and no legacy mirror"
  exit 2
fi
if [[ ( "$STAGE" == launch || "$STAGE" == record-switch ) && -z "$CAPTURE" ]]; then
  cr_error "the ${STAGE} stage needs --capture <file>: the fresh zone capture taken with scripts/capture-legacy-zone.sh, which the names it removes are checked against"
  exit 2
fi
if [[ "$STAGE" != launch && "$STAGE" != record-switch && -n "$CAPTURE" ]]; then
  cr_error "--capture is the launch and record-switch stages'; stage ${STAGE} takes none"
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
AWS_BIN="${PRODUCTION_CUTOVER_AWS_BIN:-aws}"
CURL_BIN="${PRODUCTION_CUTOVER_CURL_BIN:-curl}"
LOG_PATH="${PRODUCTION_CUTOVER_LOG:-${REPO_ROOT}/footbag_private_repo/cutover/CUTOVER_LOG.md}"
for seam in PRODUCTION_CUTOVER_TERRAFORM_BIN PRODUCTION_CUTOVER_APPLY_CMD \
            PRODUCTION_CUTOVER_KEY_CMD PRODUCTION_CUTOVER_VERIFY_CMD PRODUCTION_CUTOVER_KEY_DIR \
            PRODUCTION_CUTOVER_DIG_BIN PRODUCTION_CUTOVER_AWS_BIN PRODUCTION_CUTOVER_CURL_BIN \
            PRODUCTION_CUTOVER_LOG PRODUCTION_CUTOVER_TODAY PRODUCTION_CUTOVER_NOW; do
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

# Reads a saved plan as Terraform's JSON plan representation and prints one
# line per pending change that is not the archive base stack's; nothing printed
# means every change is. A declaration belongs to the stack when its count or
# its arguments name the archive flag, or a declaration whose count is gated on
# it, and its count or for_each does not name the custom-domain flag: those
# declarations are the custom domain, which a later stage owns. An argument
# that only switches on that flag, such as the distribution's aliases, does
# not take a declaration out of the stack.
# Nothing of the stack may be destroyed outright: a replacement
# is how Terraform finishes a resource an interrupted apply left half made.
archive_resume_problems() {
  jq -r '
    def refs: [.. | objects | .references? // empty | .[]];
    (.configuration.root_module.resources // error("no configuration")) as $cfg
    | [$cfg[] | select(.mode == "managed")
        | select(.count_expression.references // [] | index("var.enable_archive"))
        | .address] as $gated
    | [$cfg[] | select(.mode == "managed")
        | select((.count_expression.references // []) + (.for_each_expression.references // [])
            | index("var.enable_archive_custom_domain") | not)
        | select(.address as $a | ($gated | index($a))
            or (refs | any(. == "var.enable_archive" or IN($gated[]))))
        | .address] as $stack
    | (.resource_changes // error("no resource changes"))[]
    | select(.mode == "managed")
    | (.change.actions | join(",")) as $x
    | select($x != "no-op")
    | (.address | sub("\\[[^\\]]*\\]$"; "")) as $base
    | if $x == "delete" then "would destroy \(.address)"
      elif ($stack | index($base)) then empty
      else "would \($x | sub("^delete,create$|^create,delete$"; "replace")) \(.address), which is not part of the archive base stack"
      end
  '
}

# Plans the current values into a private saved plan and refuses the resume
# unless every pending change is the archive base stack's. The saved plan can
# hold secrets, so it lives in a mode-700 directory removed on every exit, and
# only addresses and actions are read out of it.
check_archive_resume_plan() {
  local plan_tmp plan_file json problems p
  plan_tmp="$(mktemp -d)"
  chmod 700 "$plan_tmp"
  cr_cleanup rm -rf "$plan_tmp"
  plan_file="${plan_tmp}/archive.tfplan"
  plan_tree -lock=false -out="$plan_file"
  case "$PLAN_RC" in
    2) ;;
    0)
      echo "The saved plan shows nothing pending after all; applying to be sure the state matches."
      return 0
      ;;
    *)
      cr_error "the read-only saved plan of ${TARGET} failed (exit ${PLAN_RC}); nothing was applied"
      cr_unproved "the archive base stack on ${TARGET}: terraform could not tell what is pending"
      cr_finish
      ;;
  esac
  json="$("$TF_BIN" -chdir="$TF_DIR" show -json "$plan_file" 2>/dev/null)" \
    || cr_die "terraform show -json of the pending plan failed; nothing was applied."
  problems="$(archive_resume_problems <<<"$json" 2>/dev/null)" \
    || cr_die "the pending plan could not be read as Terraform's JSON plan, so what is pending is unknown; nothing was applied. Read a plain plan with scripts/terraform-apply.sh --target ${TARGET}"
  if [[ -n "$problems" ]]; then
    while IFS= read -r p; do cr_error "pending plan: ${p}"; done <<<"$problems"
    refuse_other_pending
  fi
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

LAUNCH_FLAG_PATTERN='^[[:space:]]*(enable_cutover_notice|enable_preview_record|enable_legacy_mirror_records|launch_www_base_address)[[:space:]]*='

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

# The Value cell of the row whose first cell starts with the given text, in the
# cutover log section given second (the T-0 section, 4b, by default); exit 1
# when no such row exists.
log_value() {
  awk -v want="$1" -v head="### ${2:-4b}." '
    index($0, head) == 1 { inside = 1; next }
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
# the certificate-address bounce test, the alarm receipts, each work-queue
# area group receiving the platform's own mail, and the area owners saved
# after the load, which replaces the database and would wipe an earlier
# setting. The area digests are not among them: they are switched on after
# launch, once mail is built against www, because a digest queued before it
# would carry preview links the launch removes. Each row's first cell, then
# the word its value must start with.
LAUNCH_LOG_ROWS=(
  "Mail apply|applied"
  "\`scripts/verify-mail-records.sh --stage mail-day\` passes|pass"
  "Outside tests|pass"
  "\`admin@\` receive-and-reply test|pass"
  "Certificate-address bounce test|pass"
  "Alarm subscriptions confirmed|pass"
  "Test alarm|pass"
  "Work-queue area groups receive the platform's mail|pass"
  "Work-queue area owners saved|pass"
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
  records="$(grep -vE '^[[:space:]]*(;|$)' "$CAPTURE" || [[ $? == 1 ]])"
  first="$(head -n 1 <<<"$records" | awk '{print toupper($4)}')"
  last="$(tail -n 1 <<<"$records" | awk '{print toupper($4)}')"
  if [[ "$first" != SOA || "$last" != SOA ]]; then
    cr_die "the zone capture ${CAPTURE} does not open and close with the zone's SOA record, so it is not a complete transfer. Take a fresh one with scripts/capture-legacy-zone.sh. Nothing was changed."
  fi
  labels="$(awk '{print tolower($1)}' <<<"$records" | sed -n 's/\.footbag\.org\.$//p' | sort -u)"
  [[ -n "$labels" ]] || cr_die "the zone capture ${CAPTURE} names no record below the apex. Nothing was changed."
  CAPTURE_JSON="$(jq -R . <<<"$labels" | jq -cs .)"
  # The names riding the apex or www: CNAMEs onto either, www itself aside,
  # which has its own record.
  CAPTURE_RIDING="$(awk 'toupper($4) == "CNAME" && (tolower($5) == "footbag.org." || tolower($5) == "www.footbag.org.") { print tolower($1) }' <<<"$records" \
    | sed -n 's/\.footbag\.org\.$//p' | grep -vx 'www' | sort -u || [[ $? == 1 ]])"
  echo "  zone capture: ${CAPTURE} ($(wc -l <<<"$labels") names below the apex)"
}

# The record switch's capture is the newest one taken, and is checked against
# the capture the Route 53 mirror was last written from and verified against,
# which the cutover log's zone-move section records. The fresh one is taken just
# in time while the legacy nameservers still answer; once they stop, the newest
# capture on file is the reference, and it can be no older than the verified
# one. The legacy operator may still edit his zone, so whatever changed since
# the verified capture is listed by record and the typed APPLY accepts it; a
# change to a name riding the apex or www is refused further on, because the
# mirror has to be re-synced for it first. A transfer carries no time of its
# own, so when it was taken is the date scripts/capture-legacy-zone.sh is told
# to name it by, and that script never overwrites a capture. A date after today
# is refused; today is read in local time and in UTC, since an evening run is
# already tomorrow in UTC.
capture_day() {
  local base
  base="$(basename "$1")"
  [[ "$base" =~ ^footbag\.org\.([0-9]{4}-[0-9]{2}-[0-9]{2})\.zone$ ]] || return 1
  printf '%s\n' "${BASH_REMATCH[1]}"
}

# A capture's records, one per line, without the transfer's comments, the SOA
# (whose serial moves on every edit) or the cache lifetimes, as
# scripts/capture-legacy-zone.sh compares them.
capture_records() {
  grep -vE '^[[:space:]]*(;|$)' "$1" \
    | sed -E 's/[[:space:]]+/ /g; s/ $//' \
    | awk 'toupper($4) != "SOA" { $2 = ""; print }' | sed 's/  / /' | sort -u \
    || [[ $? == 1 ]]
}

CAPTURE_CHANGES=""
require_capture_current() {
  local taken today verified verified_day verified_path verification added removed
  taken="$(capture_day "$CAPTURE")" \
    || cr_die "the zone capture ${CAPTURE} is not named footbag.org.<YYYY-MM-DD>.zone, as scripts/capture-legacy-zone.sh is told to name it, so the day it was taken is unknown. Nothing was changed."
  today="${PRODUCTION_CUTOVER_TODAY:-$(date -u +%F)}"
  if [[ -z "${PRODUCTION_CUTOVER_TODAY:-}" && "$(date +%F)" > "$today" ]]; then today="$(date +%F)"; fi
  [[ ! "$taken" > "$today" ]] \
    || cr_die "the zone capture ${CAPTURE} is named for ${taken}, after today (${today}), so the day it was taken is not that. Nothing was changed."

  [[ -f "$LOG_PATH" ]] || cr_die "no cutover log at ${LOG_PATH}: the record switch checks the capture against the verified one recorded there, and the private operations checkout is missing. Nothing was changed."
  verified="$(log_value "Fresh capture and diff" 4a)" || verified=""
  verified="$(grep -oE 'footbag\.org\.[0-9]{4}-[0-9]{2}-[0-9]{2}\.zone' <<<"$verified" | head -n 1 || [[ $? == 1 ]])"
  [[ -n "$verified" ]] \
    || cr_die "the cutover log's zone-move section names no verified capture (its 'Fresh capture and diff' row), so there is nothing to check this capture against. Nothing was changed."
  verification="$(log_value "Name and apex CAA verification" 4a)" || verification=""
  [[ "$verification" == pass* ]] \
    || cr_die "the cutover log's zone-move section does not record the mirror verified against ${verified} (its 'Name and apex CAA verification' row reads '${verification}', not pass); re-sync with scripts/resync-zone-mirror.sh --with-removals first. Nothing was changed."
  verified_day="$(capture_day "$verified")"
  [[ ! "$taken" < "$verified_day" ]] \
    || cr_die "the zone capture ${CAPTURE} was taken ${taken}, before the verified capture ${verified}: use the newest capture. Nothing was changed."
  verified_path="$(dirname "$CAPTURE")/${verified}"
  [[ -r "$verified_path" ]] \
    || cr_die "the verified capture ${verified} the cutover log names is not beside ${CAPTURE}, so the change since it cannot be read. Nothing was changed."

  added="$(comm -13 <(capture_records "$verified_path") <(capture_records "$CAPTURE"))"
  removed="$(comm -23 <(capture_records "$verified_path") <(capture_records "$CAPTURE"))"
  if [[ -z "$added" && -z "$removed" ]]; then
    echo "  zone capture: unchanged since the verified capture ${verified}"
    return 0
  fi
  echo "  zone capture: changed since the verified capture ${verified}:"
  [[ -z "$added" ]] || sed 's/^/    added   /' <<<"$added"
  [[ -z "$removed" ]] || sed 's/^/    removed /' <<<"$removed"
  CAPTURE_CHANGES="$(( $(grep -c . <<<"$added" || [[ $? == 1 ]]) + $(grep -c . <<<"$removed" || [[ $? == 1 ]]) ))"
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

# The launch runs as a function, called once the helpers it shares with the
# later stages are defined below.
launch_stage() {
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
  # The apex and www have pointed at the platform since the record switch, and
  # the mail records must be on before the mirror goes: clearing the mirrored
  # names with them off deletes the apex mail records and sender policy.
  [[ "$CUR_ALIAS" == true ]] \
    || cr_die "enable_apex_alias_records is not true: the record switch has not moved the apex and www to the platform, so this is not the launch window. Nothing was changed."
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

  # The base address comes first: published as www while the notice is up, put
  # on the host by a code-only deploy, and proved served before the notice
  # lifts, so www accepts form posts from the moment it serves the platform.
  CUR_LWWW="$(read_bool launch_www_base_address "$TFVARS_PATH")"
  CUR_LWWW="${CUR_LWWW:-false}"
  [[ "$CUR_LWWW" == true || "$CUR_LWWW" == false ]] \
    || cr_die "launch_www_base_address reads '${CUR_LWWW}', neither true nor false. Nothing was changed."
  echo "  launch_www_base_address:      ${CUR_LWWW}"
  if (( RESUME )) && [[ "$CUR_LWWW" == true ]]; then
    cr_die "the notice is lifted but launch_www_base_address is still on; the launch write sets both together, so this is not a launch the stage made. Nothing was changed."
  fi
  if (( ! RESUME )) && [[ "$CUR_LWWW" == false ]]; then
    launch_base_address_run
  fi
  if (( ! RESUME )); then
    if (( ! DRY_RUN )); then
      # A first run whose write landed but whose apply did not is finished
      # here, and stops for the deploy.
      plan_tree -lock=false
      case "$PLAN_RC" in
        0) ;;
        2)
          if pending_is_base_address; then
            RESUME=1
            launch_base_address_run
          fi
          grep -E '^Plan: ' <<<"$PLAN_OUT" || [[ $? == 1 ]]
          cr_error "other changes are pending in the production tree besides the launch; apply them first with scripts/terraform-apply.sh --target production, then re-run. The values file is unchanged and nothing was applied"
          cr_unproved "the launch apply: refused with other changes pending"
          cr_finish
          ;;
        *)
          cr_error "the read-only plan of production failed (exit ${PLAN_RC}); nothing was applied"
          cr_unproved "the launch apply: the state could not be read"
          cr_finish
          ;;
      esac
    fi
    require_host_on_www
  fi

  if (( DRY_RUN )); then
    if (( RESUME )); then
      echo "The values file would not be changed; the launch apply would be planned, checked and applied if still pending."
    else
      echo "Would set enable_cutover_notice, enable_preview_record, enable_legacy_mirror_records and"
      echo "launch_www_base_address to false and remove the g entry from each Workspace map, then plan, check, apply."
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
      match($0, /^[ \t]*(enable_cutover_notice|enable_preview_record|enable_legacy_mirror_records|launch_www_base_address)[ \t]*=/) {
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
    BAD_ADDED="$(grep -vxE '(enable_cutover_notice|enable_preview_record|enable_legacy_mirror_records|launch_www_base_address) = false|' <<<"$ADDED" || [[ $? == 1 ]])"
    [[ -z "$BAD_REMOVED" && -z "$BAD_ADDED" ]] || rewrite_ok=0
    for f in enable_cutover_notice enable_preview_record enable_legacy_mirror_records launch_www_base_address; do
      [[ "$(read_bool "$f" <(printf '%s\n' "$NEW_CONTENT"))" == false ]] || rewrite_ok=0
      [[ "$(grep -cE "^[[:space:]]*${f}[[:space:]]*=" <<<"$NEW_CONTENT")" == 1 ]] || rewrite_ok=0
    done
    for m in workspace_mx_records workspace_txt_records workspace_cname_records; do
      if grep -qx 'g' <<<"$(map_keys "$m" <(printf '%s\n' "$NEW_CONTENT"))"; then rewrite_ok=0; fi
    done
    (( rewrite_ok )) || cr_die "the rewrite of the launch settings did not come out as exactly those settings changed; the values file is unchanged."

    # Planned with the new values before the file is touched. The override
    # carries only the launch settings: the four flags and the Workspace maps,
    # which hold DNS values and no operator address.
    OVERRIDE="${LAUNCH_TMP}/launch-override.tfvars"
    {
      printf '%s\n' "enable_cutover_notice = false" "enable_preview_record = false" "enable_legacy_mirror_records = false" "launch_www_base_address = false"
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
      printf '%s\n' "+enable_cutover_notice = false" "+enable_preview_record = false" "+enable_legacy_mirror_records = false" "+launch_www_base_address = false"
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
    for f in enable_cutover_notice enable_preview_record enable_legacy_mirror_records launch_www_base_address; do
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
  cr_unproved "what is served: the launch checks (verify-cutover-notice.sh --front-door --expect-live, verify-host-env.sh and the survivor lookups) and the mail resume follow as their own steps"
  cr_finish
}

# ── Shared by the record switch and the notice raise ─────────────────────────

# The values file with each named setting assigned once, where its first
# assignment stood, and any later assignment of it dropped; every other line,
# comments included, kept as written. A setting the file does not carry is
# added at its end, in the order given: every setting a stage writes is one
# Terraform declares with a default, so the added line states what the file
# meant by leaving it out, and then changes it. Arguments: the file, then
# name=value pairs, no value holding a space.
rewrite_assignments() {
  local file="$1"; shift
  awk -v pairs="$*" '
    BEGIN {
      n = split(pairs, p, " ")
      for (i = 1; i <= n; i++) { k = p[i]; sub(/=.*/, "", k); v = p[i]; sub(/^[^=]*=/, "", v); want[k] = v; order[i] = k }
    }
    /^[ \t]*[a-z_]+[ \t]*=/ {
      name = $0; sub(/^[ \t]*/, "", name); sub(/[ \t]*=.*/, "", name)
      if (name in want) { if (!(name in seen)) { seen[name] = 1; print name " = " want[name] }; next }
    }
    { print }
    END { for (i = 1; i <= n; i++) if (!(order[i] in seen)) print order[i] " = " want[order[i]] }
  ' "$file"
}


# A saved plan's changes and prior state as the plan checks below read them.
# Each check prints one line per way the plan differs from its stage; nothing
# printed means the plan is exactly the stage. Updates in place are allowed
# and listed, as in the launch.
PLAN_PRELUDE='
  [.resource_changes[]? | select(.mode == "managed")
    | {a: .address, x: (.change.actions | join(","))}] as $ch
  | ($ch | map(select(.x == "delete") | .a)) as $del
  | ($ch | map(select(.x == "create") | .a)) as $cre
  | ($ch | map(select(.x == "update") | .a)) as $upd
  | [.prior_state.values.root_module? // {} | .. | objects
      | select(has("address") and (.mode? == "managed")) | .address] as $prior
  | (if .prior_state == null then "the plan carries no prior state, so what the zone holds cannot be checked" else empty end),
    ($ch[] | select(.x != "no-op" and .x != "read" and .x != "delete" and .x != "create" and .x != "update")
      | "would \(.x) \(.a)"),'

# The record switch: destroyed, only the CNAMEs riding the apex and www, every
# one the state holds and each the capture shows riding them; created, only
# the IPv6 pair the alias brings (already held counts, on a resume); and, on a
# fresh write, the apex and www records switched in place.
record_switch_plan_problems() {
  jq -r --argjson fresh "$1" --argjson riding "$2" "
    def may_go: test(\"^aws_route53_record\\\\.legacy_apex_cnames\\\\[\\\"[^\\\"]+\\\"\\\\]\$\");
    ${PLAN_PRELUDE}"'
      ($del[] | select(may_go | not) | "would destroy \(.)"),
      ($prior[] | select(may_go) | select(IN($del[]) | not) | "leaves \(.) in place"),
      ($riding[] as $l | "aws_route53_record.legacy_apex_cnames[\"" + $l + "\"]"
        | select(IN($del[]) | not) | select($fresh or IN($prior[]))
        | "does not remove \($l), which rides the apex or www in the capture"),
      ($cre[] | select(IN("aws_route53_record.apex_aaaa[0]", "aws_route53_record.www_aaaa[0]") | not) | "would create \(.)"),
      ("aws_route53_record.apex_aaaa[0]", "aws_route53_record.www_aaaa[0]"
        | select(IN($cre[]) | not) | select(IN($prior[]) | not) | "does not create \(.)"),
      (if $fresh then ("aws_route53_record.apex_a[0]", "aws_route53_record.www[0]"
        | select(IN($upd[]) | not) | "does not switch \(.) to the platform") else empty end)
  '
}

# The notice raise: destroyed, only the cutover-window alarms the notice keeps
# absent, every one the state holds; created, only the preview pair (already
# held counts, on a resume); and, on a fresh write, the edge function changed
# to compile the notice in.
notice_raise_plan_problems() {
  jq -r --argjson fresh "$1" "
    def window_alarm: IN(\"aws_route53_health_check.site_ready[0]\", \"aws_cloudwatch_metric_alarm.site_unavailable[0]\",
      \"aws_cloudwatch_metric_alarm.cloudfront_5xx[0]\", \"aws_cloudwatch_metric_alarm.cutover_zero_logins[0]\");
    ${PLAN_PRELUDE}"'
      ($del[] | select(window_alarm | not) | "would destroy \(.)"),
      ($prior[] | select(window_alarm) | select(IN($del[]) | not) | "leaves \(.) in place"),
      ($cre[] | select(IN("aws_route53_record.preview_a[0]", "aws_route53_record.preview_aaaa[0]") | not) | "would create \(.)"),
      ("aws_route53_record.preview_a[0]", "aws_route53_record.preview_aaaa[0]"
        | select(IN($cre[]) | not) | select(IN($prior[]) | not) | "does not create \(.)"),
      (if $fresh then ("aws_cloudfront_function.apex_redirect[0]"
        | select(IN($upd[]) | not) | "does not change \(.), so the notice would not be compiled in") else empty end)
  '
}

# Plans with the given extra arguments into a private saved plan and checks it
# with the stage's check. The saved plan can hold secrets, so it lives in a
# mode-700 directory removed on every exit, and only addresses and actions are
# read out of it. Arguments: the stage's name for the report, the check
# function and its arguments, "--", then the plan's extra arguments.
check_stage_plan() {
  local what="$1"; shift
  local check=()
  while [[ "$1" != -- ]]; do check+=("$1"); shift; done
  shift
  local plan_file="${STAGE_TMP}/stage.tfplan" json problems p
  plan_tree -lock=false -out="$plan_file" "$@"
  case "$PLAN_RC" in
    2) ;;
    0)
      cr_error "the ${STAGE} plan shows no changes, so it is not the ${what}; nothing was applied"
      cr_unproved "the ${what}: terraform planned nothing to change"
      cr_finish
      ;;
    *)
      cr_error "the read-only ${STAGE} plan of production failed (exit ${PLAN_RC}); the values file is unchanged and nothing was applied"
      cr_unproved "the ${what}: terraform could not plan it"
      cr_finish
      ;;
  esac
  json="$("$TF_BIN" -chdir="$TF_DIR" show -json "$plan_file" 2>/dev/null)" \
    || cr_die "terraform show -json of the ${STAGE} plan failed; the values file is unchanged and nothing was applied."
  problems="$("${check[@]}" <<<"$json")" \
    || cr_die "the ${STAGE} plan could not be read as Terraform's JSON plan; the values file is unchanged and nothing was applied."
  if [[ -n "$problems" ]]; then
    while IFS= read -r p; do cr_error "${STAGE} plan: ${p}"; done <<<"$problems"
    cr_unproved "the ${what}: the plan is not exactly the ${what}, so nothing was written or applied"
    cr_finish
  fi
  echo "The ${STAGE} plan is exactly the ${what}:"
  jq -r '.resource_changes[]? | select(.mode == "managed")
    | (.change.actions | join(",")) as $x
    | if $x == "delete" then "  removed by this plan: \(.address)"
      elif $x == "create" then "  created by this plan: \(.address)"
      elif $x == "update" then "  updated in place: \(.address)"
      else empty end' <<<"$json"
}

# A check a stage runs once the state holds its settings, before the run is
# reported proved: a function name, or empty for none.
STAGE_AFTER_APPLY=""

# The shared run of a two-or-three-setting stage once its preconditions hold:
# resume or a fresh write, the typed APPLY, the read-back, the apply, and the
# clean plan after it. Arguments: the stage's name for the report, the
# sentence stating what the apply does, the next steps that follow it, the
# fresh-write check (its function and arguments), "--", the resume check,
# "--", then the name=value pairs to write.
run_settings_stage() {
  local what="$1" consequence="$2" next="$3"; shift 3
  local fresh_check=() resume_check=()
  while [[ "$1" != -- ]]; do fresh_check+=("$1"); shift; done
  shift
  while [[ "$1" != -- ]]; do resume_check+=("$1"); shift; done
  shift
  local pairs=("$@") pair names_pattern=""
  for pair in "${pairs[@]}"; do names_pattern="${names_pattern:+${names_pattern}|}${pair%%=*}"; done

  if (( RESUME )); then
    echo "Planning production read-only to see whether the state holds the ${what}."
    plan_tree -lock=false
    case "$PLAN_RC" in
      0)
        [[ -z "$STAGE_AFTER_APPLY" ]] || "$STAGE_AFTER_APPLY"
        cr_proved "the ${what} is already in production: the values file holds it and the tree plans clean"
        cr_unproved "${next}"
        cr_finish
        ;;
      2) echo "Changes are pending; checking that they are exactly the ${what}." ;;
      *)
        cr_error "the read-only plan of production failed (exit ${PLAN_RC}); nothing was applied"
        cr_unproved "the ${what}: the state could not be read"
        cr_finish
        ;;
    esac
    check_stage_plan "$what" "${resume_check[@]}" --
  else
    echo "Planning production read-only at its current values, so the apply carries only the ${what}."
    plan_tree -lock=false
    case "$PLAN_RC" in
      0) echo "Nothing else is pending." ;;
      2)
        grep -E '^Plan: ' <<<"$PLAN_OUT" || [[ $? == 1 ]]
        cr_error "other changes are pending in the production tree besides the ${what}; apply them first with scripts/terraform-apply.sh --target production, then re-run. The values file is unchanged and nothing was applied"
        cr_unproved "the ${what}: refused with other changes pending"
        cr_finish
        ;;
      *)
        cr_error "the read-only plan of production at its current values failed (exit ${PLAN_RC}); the values file is unchanged and nothing was applied"
        cr_unproved "the ${what}: terraform could not plan the current values"
        cr_finish
        ;;
    esac

    NEW_CONTENT="$(rewrite_assignments "$TFVARS_PATH" "${pairs[@]}")"

    # Planned with the new values before the file is touched. The override
    # carries only this stage's settings, and none is an operator address.
    local override="${STAGE_TMP}/stage-override.tfvars"
    for pair in "${pairs[@]}"; do
      grep -qE "^[[:space:]]*${pair%%=*}[[:space:]]*=" <<<"$NEW_CONTENT" && printf '%s\n' "${pair%%=*} = ${pair#*=}"
    done > "$override"
    echo "Planning production read-only with the ${what} settings before writing anything."
    check_stage_plan "$what" "${fresh_check[@]}" -- -var-file="$override"
    echo ""

    # Only this stage's own lines, before and after: a full diff would print
    # neighbouring lines, and those are operator addresses.
    echo "Values-file change in ${TFVARS_PATH} (the ${what} settings only):"
    {
      grep -E "^[[:space:]]*(${names_pattern})[[:space:]]*=" "$TFVARS_PATH" | sed 's/^/-/' || [[ $? == 1 ]]
      grep -E "^[[:space:]]*(${names_pattern})[[:space:]]*=" <<<"$NEW_CONTENT" | sed 's/^/+/' || [[ $? == 1 ]]
    } | tfvars_mask /dev/stdin
    echo ""
    printf '%s\n' "$consequence"
    echo "Type APPLY to write this to the values file and apply production."
    if ! confirm_from_tty "Type APPLY to continue: " "APPLY"; then
      cr_die "Aborted: the values file is unchanged and nothing was applied."
    fi
    # Through the link, never mv: the values file is a symlink into the private
    # operations checkout, and moving over it would leave a real file here.
    printf '%s\n' "$NEW_CONTENT" > "$TFVARS_PATH"
    for pair in "${pairs[@]}"; do
      grep -qE "^[[:space:]]*${pair%%=*}[[:space:]]*=" <<<"$NEW_CONTENT" || continue
      [[ "$(grep -E "^[[:space:]]*${pair%%=*}[[:space:]]*=" "$TFVARS_PATH" | tail -n 1 | sed -E 's/^[^=]*=[[:space:]]*//')" == "${pair#*=}" ]] \
        || cr_die "${pair%%=*} did not read back as ${pair#*=} from ${TFVARS_PATH}; nothing was applied."
    done
    echo "  The ${what} settings are written and read back."
    echo ""
  fi

  echo "== applying production =="
  # Run directly rather than through cr_run: on production it asks for a typed
  # APPLY on the terminal.
  if ! bash "$APPLY_CMD" --target "$TARGET"; then
    cr_error "the values file holds the ${what} settings but the production apply did not land; re-run this command to finish it"
    cr_unproved "the ${what}: the apply failed"
    cr_finish
  fi
  plan_tree -lock=false
  if [[ "$PLAN_RC" != 0 ]]; then
    cr_error "after the apply, production still plans changes (exit ${PLAN_RC}); re-run this command to finish the ${what}"
    cr_unproved "the ${what}: the state does not yet hold it"
    cr_finish
  fi
  [[ -z "$STAGE_AFTER_APPLY" ]] || "$STAGE_AFTER_APPLY"
  cr_proved "the ${what} in production: applied through scripts/terraform-apply.sh, and the tree plans clean"
  cr_unproved "${next}"
  cr_finish
}

# A true/false setting the stage reads; it must be set in the file, since the
# stages change only settings the file already carries.
require_set() {
  [[ -n "$(read_bool "$1" "$TFVARS_PATH")" ]] \
    || cr_die "$1 is not set in the production values file; the ${STAGE} stage changes and checks only settings the file already carries. Nothing was changed."
}
require_true() {
  [[ "$(read_bool "$1" "$TFVARS_PATH")" == true ]] \
    || cr_die "$1 is not true: $2. Nothing was changed."
}
refuse_rehearsal() {
  [[ "$(read_bool rehearse_launch_base_address "$TFVARS_PATH")" != true ]] \
    || cr_die "rehearse_launch_base_address is on: the launch rehearsal is in progress, and its return comes first. Nothing was changed."
}
refuse_launch_base_address() {
  [[ "$(read_bool launch_www_base_address "$TFVARS_PATH")" != true ]] \
    || cr_die "launch_www_base_address is on: the launch's first run has published www as the base address, and the launch's second run comes next. Nothing was changed."
}

# ── Shared by the pass-2 stages and the launch ───────────────────────────────

# The true/false settings a stage reads, into FLAG[name], each printed. A
# setting the file leaves out reads false, the default every one of them is
# declared with, as Terraform reads it; anything else that is not true or
# false is refused.
declare -A FLAG=()
load_flags() {
  local name v
  for name in "$@"; do
    v="$(read_bool "$name" "$TFVARS_PATH")"
    if [[ -z "$v" ]]; then
      FLAG[$name]=false
      echo "  ${name}: false (not set; the declared default)"
      continue
    fi
    [[ "$v" == true || "$v" == false ]] \
      || cr_die "${name} reads '${v}' in the production values file, neither true nor false. Nothing was changed."
    FLAG[$name]="$v"
    echo "  ${name}: ${v}"
  done
}

# Refuses unless every named setting reads the given value. Arguments: the
# value, the reason the stage needs it, then the settings.
require_flags() {
  local want="$1" why="$2" name; shift 2
  for name in "$@"; do
    [[ "${FLAG[$name]}" == "$want" ]] \
      || cr_die "${name} is ${FLAG[$name]}, not ${want}: ${why}. Nothing was changed."
  done
}

# The arguments as a JSON list of strings.
jlist() {
  if (( $# == 0 )); then echo '[]'; return; fi
  printf '%s\n' "$@" | jq -R . | jq -cs .
}

# The plan check the pass-2 stages share: one line per way the plan differs
# from the stage, nothing printed when it is exactly the stage. Arguments, each
# a JSON list of addresses: whether this is a fresh write (true or false),
# what it may create, what it must create (already held counts, on a resume),
# what it may destroy (every one of those the state holds must go), what a
# fresh write must update in place, and what it may update (null for anything,
# as in the launch).
set_plan_problems() {
  jq -r --argjson fresh "$1" --argjson mayc "$2" --argjson mustc "$3" \
        --argjson mayd "$4" --argjson mustu "$5" --argjson mayu "$6" "${PLAN_PRELUDE}"'
      ($cre[] | select(IN($mayc[]) | not) | "would create \(.)"),
      ($mustc[] | select(IN($cre[]) | not) | select(IN($prior[]) | not) | "does not create \(.)"),
      ($del[] | select(IN($mayd[]) | not) | "would destroy \(.)"),
      ($prior[] | select(IN($mayd[])) | select(IN($del[]) | not) | "leaves \(.) in place"),
      (if $fresh then ($mustu[] | select(IN($upd[]) | not) | "does not update \(.) in place") else empty end),
      (if $mayu == null then empty else ($upd[] | select(IN($mayu[]) | not) | "would update \(.)") end)
  '
}

# A Terraform output of the production tree into TF_OUT. Arguments: the
# output's flags and name, as terraform output takes them.
tf_out() {
  local rc=0
  TF_OUT="$("$TF_BIN" -chdir="$TF_DIR" output "$@" 2>/dev/null)" || rc=$?
  [[ "$rc" == 0 ]] \
    || cr_die "the read of terraform/${TARGET}'s ${*: -1} output failed (exit ${rc}); nothing was changed."
}

# The alarms the migration notice keeps absent, as Terraform addresses: the
# health check the site-unavailable alarm reads, that alarm, the edge 5xx
# alarm, and the zero-logins watch, which exists only once it is armed.
WINDOW_ALARMS=(
  "aws_route53_health_check.site_ready[0]"
  "aws_cloudwatch_metric_alarm.site_unavailable[0]"
  "aws_cloudwatch_metric_alarm.cloudfront_5xx[0]"
)
WINDOW_LOGIN_ALARM="aws_cloudwatch_metric_alarm.cutover_zero_logins[0]"
EDGE_FUNCTION="aws_cloudfront_function.apex_redirect[0]"
BASE_URL_PARAM="aws_ssm_parameter.app_public_base_url[0]"

# The custom domain and the SES domain both wait on certificate or identity
# validation, which reads the nameserver set resolvers cache: the registry's
# delegation lifetime (3600 seconds) plus the legacy zone's own NS lifetime
# (86400), so 90000 seconds after the delegation converged every resolver
# reads Route 53. Validated earlier, the certificate apply hangs and SES can
# abandon the domain. The convergence time is the one the cutover log's
# zone-move section records, in UTC as YYYY-MM-DDTHH:MMZ; the delegation itself
# is checked live, the way scripts/add-apex-txt-token.sh checks it.
DELEGATION_WAIT_SECONDS=90000
DELEGATION_RESOLVER="8.8.8.8"
require_delegation_converged() {
  local cell converged now age zone_ns delegated rc=0
  [[ -f "$LOG_PATH" ]] \
    || cr_die "no cutover log at ${LOG_PATH}: the ${STAGE} stage reads the delegation's convergence time there, and the private operations checkout is missing. Nothing was changed."
  cell="$(log_value "Delegation converged" 4a)" \
    || cr_die "the cutover log's zone-move section has no 'Delegation converged' row. Nothing was changed."
  [[ "$cell" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?Z$ ]] \
    || cr_die "the cutover log's 'Delegation converged' row reads '${cell:-<empty>}', not a UTC time written as YYYY-MM-DDTHH:MMZ, so how long ago the delegation converged is unknown. Nothing was changed."
  converged="$(date -u -d "$cell" +%s)" \
    || cr_die "the cutover log's 'Delegation converged' time '${cell}' is not a real time. Nothing was changed."
  now="${PRODUCTION_CUTOVER_NOW:-$(date -u +%s)}"
  age=$(( now - converged ))
  (( age >= 0 )) \
    || cr_die "the cutover log's 'Delegation converged' time ${cell} is in the future. Nothing was changed."
  if (( age < DELEGATION_WAIT_SECONDS )); then
    cr_die "the delegation converged at ${cell}, ${age} seconds ago; the ${STAGE} stage waits ${DELEGATION_WAIT_SECONDS} seconds (25 hours) for every resolver's cached nameserver set to expire, so it can run from $(date -u -d "@$(( converged + DELEGATION_WAIT_SECONDS ))" +%FT%RZ). Nothing was changed."
  fi
  echo "  delegation converged: ${cell}, ${age} seconds ago"

  tf_out -json route53_name_servers
  zone_ns="$(jq -r 'if type == "array" then .[] else empty end' <<<"$TF_OUT" \
    | tr '[:upper:]' '[:lower:]' | sed -E 's/\.$//' | LC_ALL=C sort -u)"
  [[ -n "$zone_ns" ]] || cr_die "Terraform reports no name servers for the footbag.org zone. Nothing was changed."
  delegated="$("$DIG_BIN" +short +tries=3 +time=3 "@${DELEGATION_RESOLVER}" footbag.org NS)" || rc=$?
  [[ "$rc" == 0 ]] \
    || cr_die "could not ask ${DELEGATION_RESOLVER} who serves footbag.org (dig exit ${rc}: ${delegated}). Nothing was changed."
  delegated="$(sed '/^$/d' <<<"$delegated" | tr '[:upper:]' '[:lower:]' | sed -E 's/\.$//' | LC_ALL=C sort -u)"
  if [[ "$delegated" != "$zone_ns" ]]; then
    cr_error "${DELEGATION_RESOLVER} names $(paste -sd ' ' - <<<"${delegated:-nothing}") for footbag.org; the zone's own are $(paste -sd ' ' - <<<"$zone_ns")"
    cr_die "footbag.org is not delegated to the Route 53 zone, so the ${STAGE} stage cannot validate against it. Nothing was changed."
  fi
  echo "  footbag.org is delegated to the Route 53 zone (${DELEGATION_RESOLVER} agrees)"
}

# The launch's second run lifts the notice only once the host builds against
# www. With www as its base address the platform marks itself indexable, so
# preview's robots.txt then allows crawling and names www's sitemap, which no
# other state of the host serves. Read over HTTPS, as any visitor reads it.
require_host_on_www() {
  local preview www body rc=0
  tf_out -raw preview_url
  preview="$TF_OUT"
  tf_out -raw platform_url
  www="$TF_OUT"
  [[ "$preview" =~ ^https://preview\. && "$www" =~ ^https://www\. ]] \
    || cr_die "the tree's preview_url ('${preview}') and platform_url ('${www}') are not the preview and www addresses, so the custom domain or the preview is off. Nothing was changed."
  body="$("$CURL_BIN" -sS --fail --max-time 20 "${preview}/robots.txt" 2>&1)" || rc=$?
  if [[ "$rc" != 0 ]]; then
    cr_error "could not read ${preview}/robots.txt (curl exit ${rc}: ${body})"
    cr_unproved "the launch apply: whether the host is on the www base address could not be read"
    cr_finish
  fi
  if grep -qx 'Allow: /' <<<"$body" && grep -qxF "Sitemap: ${www}/sitemap.xml" <<<"$body"; then
    cr_proved "the host is on the www base address: ${preview}/robots.txt allows crawling and names ${www}/sitemap.xml"
    return 0
  fi
  cr_error "${preview}/robots.txt does not yet allow crawling with ${www}/sitemap.xml, so the host is not on the www base address"
  cr_unproved "the launch apply: run the code-only deploy (./deploy_to_aws.sh --target production), which syncs the www base address onto the host, then run this command again"
  cr_finish
}

# Whether what the tree has pending is exactly the first run's change, the
# base address moved and nothing else: a first run whose write landed and
# whose apply did not. Read from a private saved plan, as every plan here is.
pending_is_base_address() {
  local plan_file="${LAUNCH_TMP}/pending.tfplan" json problems only_param
  only_param="$(jlist "$BASE_URL_PARAM")"
  plan_tree -lock=false -out="$plan_file"
  [[ "$PLAN_RC" == 2 ]] || return 1
  if ! json="$("$TF_BIN" -chdir="$TF_DIR" show -json "$plan_file" 2>/dev/null)"; then
    cr_error "terraform show -json of the pending plan failed, so whether it is the launch's first run is unknown"
    return 1
  fi
  if ! problems="$(set_plan_problems true '[]' '[]' '[]' "$only_param" "$only_param" <<<"$json")"; then
    cr_error "the pending plan could not be read as Terraform's JSON plan"
    return 1
  fi
  [[ -z "$problems" ]]
}

# The launch's first run: www published as the base address while the notice
# stays up, and nothing else. It stops for the code-only deploy.
launch_base_address_run() {
  local only_param
  only_param="$(jlist "$BASE_URL_PARAM")"
  if (( DRY_RUN )); then
    echo "Would set launch_www_base_address to true, then plan, check, apply. The code-only deploy and"
    echo "this command again, which lifts the notice, follow."
    cr_unproved "anything beyond the preconditions: a dry run changes and checks nothing else"
    cr_finish
  fi
  STAGE_TMP="$LAUNCH_TMP"
  run_settings_stage "launch base address" \
    "This is the launch's first run: www becomes the base address the host is given, and the
notice stays up. From the code-only deploy that follows, the host builds every link and
mail against www and preview refuses form posts, so run the deploy and then this command
again, with nothing between." \
    "the code-only deploy (./deploy_to_aws.sh --target production), then this command again, which proves the host is on www and lifts the notice" \
    set_plan_problems true '[]' '[]' '[]' "$only_param" "$only_param" -- \
    set_plan_problems false '[]' '[]' '[]' "$only_param" "$only_param" -- \
    launch_www_base_address=true
}

# ── STAGE record-switch ──────────────────────────────────────────────────────

if [[ "$STAGE" == record-switch ]]; then
  command -v jq >/dev/null || cr_die "jq is not installed; the switch plan cannot be checked without it. Nothing was changed."
  STAGE_TMP="$(mktemp -d)"
  chmod 700 "$STAGE_TMP"
  cr_cleanup rm -rf "$STAGE_TMP"
  require_capture_current
  read_capture_labels

  for f in enable_platform_custom_domain enable_preview_record enable_cutover_notice \
           enable_legacy_mirror_records enable_apex_alias_records enable_cutover_login_alarm; do
    echo "  ${f}: $(read_bool "$f" "$TFVARS_PATH")"
    require_set "$f"
  done
  CUR_URL="$(read_url "$TFVARS_PATH")"
  echo "  archive_platform_url: ${CUR_URL:-<empty or absent: www>}"
  echo ""
  require_true enable_platform_custom_domain "the custom domain is not on, so the apex would have no certificate to answer on"
  require_true enable_preview_record "preview is not published, so the operator would have no name reaching the platform behind the notice"
  require_true enable_cutover_notice "the migration notice is not up, so the switch would open the platform on www before launch"
  require_true enable_legacy_mirror_records "the legacy mirror is off, so this is not the zone the switch expects"
  refuse_rehearsal
  refuse_launch_base_address

  # The names riding the apex and www leave with the switch, and the mirror
  # carries them from the capture: a difference means the mirror is stale.
  MIRRORED="$(map_keys legacy_apex_cname_records "$TFVARS_PATH" | sort -u)"
  if [[ "$MIRRORED" != "$CAPTURE_RIDING" ]]; then
    cr_error "the capture's names riding the apex and www ($(tr '\n' ' ' <<<"$CAPTURE_RIDING")) differ from the mirrored legacy_apex_cname_records ($(tr '\n' ' ' <<<"$MIRRORED"))"
    cr_die "the mirror is stale against this capture; re-sync it with scripts/resync-zone-mirror.sh --with-removals against this capture, then re-run. Nothing was changed."
  fi
  echo "  riding the apex and www, in the capture and the mirror: $(tr '\n' ' ' <<<"$CAPTURE_RIDING")"
  RIDING_JSON="$(jq -R . <<<"$CAPTURE_RIDING" | jq -cs 'map(select(. != ""))')"

  CUR_ALIAS="$(read_bool enable_apex_alias_records "$TFVARS_PATH")"
  CUR_LOGIN="$(read_bool enable_cutover_login_alarm "$TFVARS_PATH")"
  RESUME=0
  if [[ "$CUR_ALIAS" == false ]]; then
    :
  elif [[ "$CUR_ALIAS" == true && "$CUR_LOGIN" == true && -z "$CUR_URL" ]]; then
    RESUME=1
    echo "The values file already holds the record-switch settings."
  else
    cr_die "the record-switch settings are half set (the alias is '${CUR_ALIAS}' but the login watch reads '${CUR_LOGIN}' or the archive address is still set); this is neither the window nor a finished switch write. Nothing was changed."
  fi

  if (( DRY_RUN )); then
    if (( RESUME )); then
      echo "The values file would not be changed; the switch would be planned, checked and applied if still pending."
    else
      echo "Would set enable_apex_alias_records and enable_cutover_login_alarm to true and"
      echo "clear archive_platform_url, then plan, check, apply."
    fi
    cr_unproved "anything beyond the preconditions: a dry run changes and checks nothing else"
    cr_finish
  fi

  URL_PAIR=()
  grep -qE "$URL_PATTERN" "$TFVARS_PATH" && URL_PAIR=('archive_platform_url=""')
  CHANGES_SENTENCE=""
  [[ -z "$CAPTURE_CHANGES" ]] || CHANGES_SENTENCE="
The zone capture differs from the verified capture by ${CAPTURE_CHANGES} record(s), listed
above; APPLY also accepts them as the legacy zone the switch leaves behind."
  run_settings_stage "record switch" \
    "This is the record switch: the apex and www move to the platform behind the migration
notice, and the legacy names riding them are removed. The legacy site must already be
frozen, its last crawls finished, election 191's results saved and the two final
group-message containers sealed and committed, because nothing reaches it by name after
this. APPLY attests that it is.${CHANGES_SENTENCE}" \
    "what is served: the record lookups against a Route 53 nameserver and verify-cutover-notice.sh --front-door --expect-notice follow as their own steps" \
    record_switch_plan_problems true "$RIDING_JSON" -- record_switch_plan_problems false "$RIDING_JSON" -- \
    enable_apex_alias_records=true enable_cutover_login_alarm=true "${URL_PAIR[@]}"
fi

# ── STAGE notice-raise ───────────────────────────────────────────────────────

if [[ "$STAGE" == notice-raise ]]; then
  command -v jq >/dev/null || cr_die "jq is not installed; the raise plan cannot be checked without it. Nothing was changed."
  STAGE_TMP="$(mktemp -d)"
  chmod 700 "$STAGE_TMP"
  cr_cleanup rm -rf "$STAGE_TMP"

  for f in enable_platform_custom_domain enable_apex_alias_records enable_cutover_notice enable_preview_record; do
    echo "  ${f}: $(read_bool "$f" "$TFVARS_PATH")"
    require_set "$f"
  done
  echo ""
  require_true enable_platform_custom_domain "the custom domain is not on, and the notice needs preview on it"
  [[ "$(read_bool enable_apex_alias_records "$TFVARS_PATH")" == true ]] \
    || cr_die "enable_apex_alias_records is not true: the apex has not been switched, so this is before the window, not a rollback; the window stage raises the notice there. Nothing was changed."
  refuse_rehearsal
  refuse_launch_base_address

  CUR_NOTICE="$(read_bool enable_cutover_notice "$TFVARS_PATH")"
  CUR_PREVIEW="$(read_bool enable_preview_record "$TFVARS_PATH")"
  RESUME=0
  if [[ "$CUR_NOTICE" == false && "$CUR_PREVIEW" == false ]]; then
    :
  elif [[ "$CUR_NOTICE" == true && "$CUR_PREVIEW" == true ]]; then
    RESUME=1
    echo "The values file already holds the notice-raise settings."
  else
    cr_die "the notice-raise settings are half set (the notice reads '${CUR_NOTICE}' and the preview '${CUR_PREVIEW}'); this is neither the launched site nor a finished raise. Nothing was changed."
  fi

  if (( DRY_RUN )); then
    if (( RESUME )); then
      echo "The values file would not be changed; the raise would be planned, checked and applied if still pending."
    else
      echo "Would set enable_cutover_notice and enable_preview_record to true, then plan, check, apply."
    fi
    cr_unproved "anything beyond the preconditions: a dry run changes and checks nothing else"
    cr_finish
  fi

  run_settings_stage "notice raise" \
    "This raises the migration notice again: www and the apex show the notice, preview serves
the platform to the operator, and the cutover-window alarms are removed until the notice
lifts." \
    "the preview base-address deploy (./deploy_to_aws.sh --target production), verify-host-env.sh and verify-cutover-notice.sh --front-door --expect-notice follow as their own steps" \
    notice_raise_plan_problems true -- notice_raise_plan_problems false -- \
    enable_cutover_notice=true enable_preview_record=true
fi

# ── STAGE launch ─────────────────────────────────────────────────────────────

if [[ "$STAGE" == launch ]]; then
  launch_stage
fi

# ── STAGE custom-domain ──────────────────────────────────────────────────────

# Everything the custom domain brings, by Terraform address: the platform's
# certificate (the apex, www and preview, from first issuance) with its
# validation, the preview pair, the archive's own certificate and names, and
# the two certificate-expiry alarms. The archive's cookie-domain parameter
# comes with it only while the archive requires signed cookies.
CUSTOM_DOMAIN_SET=(
  "aws_acm_certificate.main[0]"
  'aws_route53_record.cert_validation["footbag.org"]'
  'aws_route53_record.cert_validation["www.footbag.org"]'
  'aws_route53_record.cert_validation["preview.footbag.org"]'
  "aws_acm_certificate_validation.main[0]"
  "aws_route53_record.preview_a[0]"
  "aws_route53_record.preview_aaaa[0]"
  "aws_cloudwatch_metric_alarm.acm_cert_expiry[0]"
  "aws_acm_certificate.archive[0]"
  'aws_route53_record.archive_cert_validation["archive.footbag.org"]'
  "aws_acm_certificate_validation.archive[0]"
  "aws_route53_record.archive_a[0]"
  "aws_route53_record.archive_aaaa[0]"
  "aws_cloudwatch_metric_alarm.acm_archive_cert_expiry[0]"
)
CUSTOM_DOMAIN_OPTIONAL=("aws_ssm_parameter.app_archive_cookie_domain[0]")
PREVIEW_URL="https://preview.footbag.org"
CUSTOM_DOMAIN_ALIASES=(footbag.org www.footbag.org preview.footbag.org)

# After the apply: no other distribution, in this account or another, claims
# or overlaps the names the platform now answers on. CloudFront refuses an
# exact claim at the apply itself, so what this adds is the overlap, such as
# a wildcard held elsewhere, which would take the name back at the first
# change to either distribution. The distribution's own exact alias is
# expected and accepted.
custom_domain_conflicts() {
  local dist alias out rc items bad=0
  tf_out -raw cloudfront_distribution_id
  dist="$TF_OUT"
  for alias in "${CUSTOM_DOMAIN_ALIASES[@]}"; do
    rc=0
    out="$("$AWS_BIN" cloudfront list-conflicting-aliases --distribution-id "$dist" --alias "$alias" --output json 2>&1)" || rc=$?
    if [[ "$rc" != 0 ]]; then
      cr_error "aws cloudfront list-conflicting-aliases for ${alias} failed (exit ${rc}): ${out}"
      bad=1
      continue
    fi
    items="$(jq -r --arg a "$alias" '.ConflictingAliasesList.Items // [] | .[] | select(.Alias != $a) | "\(.Alias) on distribution \(.DistributionId) in account \(.AccountId)"' <<<"$out")" \
      || { cr_error "the conflicting-aliases answer for ${alias} is not the JSON CloudFront documents"; bad=1; continue; }
    if [[ -n "$items" ]]; then
      while IFS= read -r line; do cr_error "${alias} is overlapped by ${line}"; done <<<"$items"
      bad=1
      continue
    fi
    echo "  ${alias}: no other distribution claims or overlaps it"
  done
  if (( bad )); then
    cr_unproved "the custom domain: another distribution claims or overlaps one of its names, or that could not be read; reclaiming a name goes through AWS support"
    cr_finish
  fi
}

if [[ "$STAGE" == custom-domain ]]; then
  command -v jq >/dev/null || cr_die "jq is not installed; the custom-domain plan cannot be checked without it. Nothing was changed."
  STAGE_TMP="$(mktemp -d)"
  chmod 700 "$STAGE_TMP"
  cr_cleanup rm -rf "$STAGE_TMP"

  load_flags enable_archive enable_legacy_mirror_records enable_apex_alias_records enable_cutover_notice \
             enable_platform_custom_domain enable_preview_record enable_archive_custom_domain
  CUR_URL="$(read_url "$TFVARS_PATH")"
  echo "  archive_platform_url: ${CUR_URL:-<empty or absent: www>}"
  echo ""
  refuse_rehearsal
  refuse_launch_base_address
  require_flags true "the custom domain is pass 2's, with the archive stack built and the legacy mirror serving" \
    enable_archive enable_legacy_mirror_records
  require_flags false "the record switch has been made, so the custom domain is long past" enable_apex_alias_records
  require_flags false "the notice needs the custom domain; take the window down first with --stage window --undo" enable_cutover_notice

  tf_out -raw cloudfront_domain
  DISTRIBUTION_URL="https://${TF_OUT}"
  [[ "$TF_OUT" =~ ^[a-z0-9]+\.cloudfront\.net$ ]] \
    || cr_die "the tree's cloudfront_domain output ('${TF_OUT}') is not the distribution's own name. Nothing was changed."
  ON="${FLAG[enable_platform_custom_domain]}${FLAG[enable_preview_record]}${FLAG[enable_archive_custom_domain]}"
  ALL_SET="$(jlist "${CUSTOM_DOMAIN_SET[@]}" "${CUSTOM_DOMAIN_OPTIONAL[@]}")"
  MUST_SET="$(jlist "${CUSTOM_DOMAIN_SET[@]}")"
  MUST_UPDATE="$(jlist "aws_cloudfront_distribution.main[0]" "$BASE_URL_PARAM")"

  RESUME=0
  if (( ! UNDO )); then
    if [[ "$ON" == falsefalsefalse && "$CUR_URL" == "$DISTRIBUTION_URL" ]]; then
      :
    elif [[ "$ON" == truetruetrue && "$CUR_URL" == "$PREVIEW_URL" ]]; then
      RESUME=1
      echo "The values file already holds the custom-domain settings."
    else
      cr_die "the custom-domain settings are half set (the three flags read ${FLAG[enable_platform_custom_domain]}, ${FLAG[enable_preview_record]} and ${FLAG[enable_archive_custom_domain]}, and the archive address '${CUR_URL}', where pass 1 has ${DISTRIBUTION_URL}); this is neither pass 1 nor a finished custom-domain write. Nothing was changed."
    fi
    require_delegation_converged
  else
    if [[ "$ON" == truetruetrue && "$CUR_URL" == "$PREVIEW_URL" ]]; then
      :
    elif [[ "$ON" == falsefalsefalse && "$CUR_URL" == "$DISTRIBUTION_URL" ]]; then
      RESUME=1
      echo "The values file already holds pass 1's settings."
    else
      cr_die "the custom-domain settings are half set (the three flags read ${FLAG[enable_platform_custom_domain]}, ${FLAG[enable_preview_record]} and ${FLAG[enable_archive_custom_domain]}, and the archive address '${CUR_URL}'); this is neither the custom domain nor a finished undo. Nothing was changed."
    fi
  fi

  if (( DRY_RUN )); then
    if (( RESUME )); then
      echo "The values file would not be changed; the plan would be checked and applied if still pending."
    elif (( UNDO )); then
      echo "Would set the three custom-domain flags to false and archive_platform_url to ${DISTRIBUTION_URL}, then plan, check, apply."
    else
      echo "Would set the three custom-domain flags to true and archive_platform_url to ${PREVIEW_URL}, then plan, check, apply."
    fi
    cr_unproved "anything beyond the preconditions: a dry run changes and checks nothing else"
    cr_finish
  fi

  if (( UNDO )); then
    run_settings_stage "custom-domain undo" \
      "This takes the custom domain down: the certificates, preview and the archive's own name
are removed, and the platform and the archive answer on their cloudfront.net names again." \
      "the code-only deploy (./deploy_to_aws.sh --target production), which puts the cloudfront.net base address back on the host, and verify-host-env.sh follow as their own steps" \
      set_plan_problems true '[]' '[]' "$ALL_SET" '[]' null -- \
      set_plan_problems false '[]' '[]' "$ALL_SET" '[]' null -- \
      enable_platform_custom_domain=false enable_preview_record=false enable_archive_custom_domain=false \
      "archive_platform_url=\"${DISTRIBUTION_URL}\""
  fi
  STAGE_AFTER_APPLY=custom_domain_conflicts
  run_settings_stage "custom domain" \
    "This is the custom domain: the platform's certificate for the apex, www and preview, the
preview record, and the archive's own name and certificate. The apply waits on both
certificates validating. www and the apex keep serving the legacy site; the host's base
address becomes preview at the next deploy." \
    "the Turnstile hostname for preview, the code-only deploy (./deploy_to_aws.sh --target production), which syncs the preview base address onto the host, and verify-host-env.sh follow as their own steps" \
    set_plan_problems true "$ALL_SET" "$MUST_SET" '[]' "$MUST_UPDATE" null -- \
    set_plan_problems false "$ALL_SET" "$MUST_SET" '[]' '[]' null -- \
    enable_platform_custom_domain=true enable_preview_record=true enable_archive_custom_domain=true \
    "archive_platform_url=\"${PREVIEW_URL}\""
fi

# ── STAGE ses-domain ─────────────────────────────────────────────────────────

# The domain identity SES sends from once the sender moves onto it: the
# identity and its DKIM, the verification record and the wait on it, the three
# DKIM records, the domain's bounce and complaint topics, and its feedback
# setting.
SES_DOMAIN_SET=(
  "aws_ses_domain_identity.main[0]"
  "aws_ses_domain_dkim.main[0]"
  "aws_route53_record.ses_domain_verification[0]"
  "aws_ses_domain_identity_verification.main[0]"
  "aws_route53_record.ses_dkim[0]"
  "aws_route53_record.ses_dkim[1]"
  "aws_route53_record.ses_dkim[2]"
  "aws_ses_identity_notification_topic.domain_bounce[0]"
  "aws_ses_identity_notification_topic.domain_complaint[0]"
  "aws_sesv2_email_identity_feedback_attributes.domain[0]"
)

if [[ "$STAGE" == ses-domain ]]; then
  command -v jq >/dev/null || cr_die "jq is not installed; the SES domain plan cannot be checked without it. Nothing was changed."
  STAGE_TMP="$(mktemp -d)"
  chmod 700 "$STAGE_TMP"
  cr_cleanup rm -rf "$STAGE_TMP"

  load_flags ses_enable_domain_identity ses_enable_domain_auth
  echo ""
  ON="${FLAG[ses_enable_domain_identity]}${FLAG[ses_enable_domain_auth]}"
  RESUME=0
  if [[ "$ON" == falsefalse ]]; then
    :
  elif [[ "$ON" == truetrue ]]; then
    RESUME=1
    echo "The values file already holds the SES domain settings."
  else
    cr_die "the SES domain settings are half set (identity ${FLAG[ses_enable_domain_identity]}, authentication ${FLAG[ses_enable_domain_auth]}); they go on together, in one apply. Nothing was changed."
  fi
  require_delegation_converged

  if (( DRY_RUN )); then
    if (( RESUME )); then
      echo "The values file would not be changed; the plan would be checked and applied if still pending."
    else
      echo "Would set ses_enable_domain_identity and ses_enable_domain_auth to true, then plan, check, apply."
    fi
    cr_unproved "anything beyond the preconditions: a dry run changes and checks nothing else"
    cr_finish
  fi

  SES_SET="$(jlist "${SES_DOMAIN_SET[@]}")"
  run_settings_stage "SES domain" \
    "This is the SES domain identity: its verification and DKIM records are published and the
apply waits, up to 45 minutes, for SES to verify the domain. SES abandons a domain left
unverified for about 72 hours, so the sender cutover follows the same day." \
    "CRED bash scripts/ses-sender-cutover.sh --target production, then CRED bash scripts/verify-host-env.sh --target production, follow as their own steps" \
    set_plan_problems true "$SES_SET" "$SES_SET" '[]' '[]' '[]' -- \
    set_plan_problems false "$SES_SET" "$SES_SET" '[]' '[]' '[]' -- \
    ses_enable_domain_identity=true ses_enable_domain_auth=true
fi

# ── STAGE window ─────────────────────────────────────────────────────────────

if [[ "$STAGE" == window ]]; then
  command -v jq >/dev/null || cr_die "jq is not installed; the window plan cannot be checked without it. Nothing was changed."
  STAGE_TMP="$(mktemp -d)"
  chmod 700 "$STAGE_TMP"
  cr_cleanup rm -rf "$STAGE_TMP"

  load_flags enable_platform_custom_domain enable_preview_record enable_legacy_mirror_records \
             enable_apex_alias_records enable_cutover_notice rehearse_launch_base_address enable_cutover_login_alarm
  echo ""
  refuse_launch_base_address
  require_flags true "the window serves the platform on preview behind the notice, which needs the custom domain and the preview record" \
    enable_platform_custom_domain enable_preview_record
  require_flags true "the legacy mirror is off, so this is past launch; the rollback raise is --stage notice-raise" enable_legacy_mirror_records
  require_flags false "the record switch has been made; from here the notice is the launch's and the rollback's" enable_apex_alias_records

  ALARMS="$(jlist "${WINDOW_ALARMS[@]}" "$WINDOW_LOGIN_ALARM")"
  MUST_ALARMS="${WINDOW_ALARMS[*]}"
  [[ "${FLAG[enable_cutover_login_alarm]}" == true ]] && MUST_ALARMS="${MUST_ALARMS} ${WINDOW_LOGIN_ALARM}"
  # shellcheck disable=SC2086 # the addresses hold no space
  MUST_ALARMS="$(jlist $MUST_ALARMS)"
  NOTICE="${FLAG[enable_cutover_notice]}"
  REHEARSAL="${FLAG[rehearse_launch_base_address]}"
  RETURNING=0
  RESUME=0
  if (( ! UNDO )); then
    if [[ "$NOTICE" == false && "$REHEARSAL" == false ]]; then
      :
    elif [[ "$NOTICE" == false && "$REHEARSAL" == true ]]; then
      RETURNING=1
      echo "The launch rehearsal is in progress; this is its return to the window."
    elif [[ "$NOTICE" == true && "$REHEARSAL" == false ]]; then
      RESUME=1
      echo "The values file already holds the window settings."
    else
      cr_die "the notice and the rehearsal base address are both on; this is neither the window nor the rehearsal. Nothing was changed."
    fi
  else
    if [[ "$REHEARSAL" == true ]]; then
      cr_die "the launch rehearsal is in progress; its return (--stage window) comes before the window is taken down. Nothing was changed."
    elif [[ "$NOTICE" == true ]]; then
      :
    else
      RESUME=1
      echo "The values file already holds the notice off."
    fi
  fi

  if (( DRY_RUN )); then
    if (( RESUME )); then
      echo "The values file would not be changed; the plan would be checked and applied if still pending."
    elif (( UNDO )); then
      echo "Would set enable_cutover_notice to false, then plan, check, apply."
    elif (( RETURNING )); then
      echo "Would set rehearse_launch_base_address to false and enable_cutover_notice to true, then plan, check, apply."
    else
      echo "Would set enable_cutover_notice to true, then plan, check, apply."
    fi
    cr_unproved "anything beyond the preconditions: a dry run changes and checks nothing else"
    cr_finish
  fi

  NEXT="the code-only deploy (./deploy_to_aws.sh --target production), which syncs the preview base address onto the host, then CRED bash scripts/verify-host-env.sh --target production and bash scripts/verify-cutover-notice.sh --function --expect-notice, follow as their own steps"
  if (( UNDO )); then
    run_settings_stage "window undo" \
      "This takes the notice down: www and the apex, still on the legacy site, are untouched;
the edge function loses the notice and the window alarms come back." \
      "the code-only deploy (./deploy_to_aws.sh --target production) and verify-cutover-notice.sh --function --expect-live follow as their own steps" \
      set_plan_problems true "$ALARMS" "$MUST_ALARMS" '[]' "$(jlist "$EDGE_FUNCTION")" null -- \
      set_plan_problems false "$ALARMS" "$MUST_ALARMS" '[]' '[]' null -- \
      enable_cutover_notice=false
  fi
  if (( RETURNING )); then
    run_settings_stage "rehearsal return" \
      "This ends the launch rehearsal: the notice goes back up and the host's base address goes
back to preview at the deploy that follows; the window alarms are removed again." \
      "$NEXT" \
      set_plan_problems true '[]' '[]' "$ALARMS" "$(jlist "$EDGE_FUNCTION" "$BASE_URL_PARAM")" null -- \
      set_plan_problems false '[]' '[]' "$ALARMS" '[]' null -- \
      rehearse_launch_base_address=false enable_cutover_notice=true
  fi
  run_settings_stage "window state" \
    "This is the window state: the edge function carries the migration notice, which www and
the apex show once the record switch points them at the platform; until then they serve
the legacy site. Preview serves the platform, and the window alarms are removed until
launch." \
    "$NEXT" \
    set_plan_problems true '[]' '[]' "$ALARMS" "$(jlist "$EDGE_FUNCTION")" null -- \
    set_plan_problems false '[]' '[]' "$ALARMS" '[]' null -- \
    enable_cutover_notice=true
fi

# ── STAGE rehearsal ──────────────────────────────────────────────────────────

if [[ "$STAGE" == rehearsal ]]; then
  command -v jq >/dev/null || cr_die "jq is not installed; the rehearsal plan cannot be checked without it. Nothing was changed."
  STAGE_TMP="$(mktemp -d)"
  chmod 700 "$STAGE_TMP"
  cr_cleanup rm -rf "$STAGE_TMP"

  load_flags enable_platform_custom_domain enable_preview_record enable_legacy_mirror_records \
             enable_apex_alias_records enable_cutover_notice rehearse_launch_base_address enable_cutover_login_alarm
  echo ""
  refuse_launch_base_address
  require_flags true "the rehearsal starts from the window state" \
    enable_platform_custom_domain enable_preview_record enable_legacy_mirror_records
  require_flags false "the record switch has been made, and www's public records no longer reach the legacy site, so a rehearsal now would be the launch" \
    enable_apex_alias_records

  ALARMS="$(jlist "${WINDOW_ALARMS[@]}" "$WINDOW_LOGIN_ALARM")"
  MUST_ALARMS="${WINDOW_ALARMS[*]}"
  [[ "${FLAG[enable_cutover_login_alarm]}" == true ]] && MUST_ALARMS="${MUST_ALARMS} ${WINDOW_LOGIN_ALARM}"
  # shellcheck disable=SC2086 # the addresses hold no space
  MUST_ALARMS="$(jlist $MUST_ALARMS)"
  RESUME=0
  if [[ "${FLAG[enable_cutover_notice]}" == true && "${FLAG[rehearse_launch_base_address]}" == false ]]; then
    :
  elif [[ "${FLAG[enable_cutover_notice]}" == false && "${FLAG[rehearse_launch_base_address]}" == true ]]; then
    RESUME=1
    echo "The values file already holds the rehearsal settings."
  else
    cr_die "the notice reads ${FLAG[enable_cutover_notice]} and the rehearsal base address ${FLAG[rehearse_launch_base_address]}; the rehearsal starts from the window state (the notice on). Nothing was changed."
  fi

  if (( DRY_RUN )); then
    if (( RESUME )); then
      echo "The values file would not be changed; the plan would be checked and applied if still pending."
    else
      echo "Would set enable_cutover_notice to false and rehearse_launch_base_address to true, then plan, check, apply."
    fi
    cr_unproved "anything beyond the preconditions: a dry run changes and checks nothing else"
    cr_finish
  fi

  run_settings_stage "launch rehearsal" \
    "This is the launch dress rehearsal: the notice comes down and the host is given the www
base address at the deploy that follows, while www's public records still serve the legacy
site, so only testers reaching www through an edge address see the platform there. Mail
sent meanwhile links to www. APPLY also attests what this cannot read: www and the apex
are in the Turnstile widget, and the outbox has drained." \
    "the code-only deploy (./deploy_to_aws.sh --target production), the walk on www through curl --resolve, and the return (this script's --stage window) follow as their own steps" \
    set_plan_problems true "$ALARMS" "$MUST_ALARMS" '[]' "$(jlist "$EDGE_FUNCTION" "$BASE_URL_PARAM")" null -- \
    set_plan_problems false "$ALARMS" "$MUST_ALARMS" '[]' '[]' null -- \
    enable_cutover_notice=false rehearse_launch_base_address=true
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
      # A run that stopped between the write and the apply, or part way through
      # the apply. The pending plan is read rather than re-planned with the
      # archive off: once any of the archive is in the state, that plan would
      # have to destroy the protected bucket, and Terraform refuses it.
      grep -E '^Plan: ' <<<"$PLAN_OUT" || [[ $? == 1 ]]
      echo "Changes are pending; reading the plan to see whether all of them are the archive base stack."
      check_archive_resume_plan
      echo "Only the archive base stack is pending; applying it."
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
