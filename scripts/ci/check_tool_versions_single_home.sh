#!/usr/bin/env bash
# Convention gate (delegated from assert_conventions.sh): every tool version the
# workstations, CI, the images and the hosts install has one home,
# ops/tool-versions.env.
#
# A second copy of a pin is a pin that does not move when the list moves, so a
# bump lands on some machines and not others and nothing says which. For every
# <TOOL>_VERSION key in the list, the deploy and build surfaces (scripts/,
# .github/, docker/, terraform/, ops/, package.json and the repository-root
# runners) are refused:
#
#   a code line naming the tool and carrying the listed version, and
#   a code line assigning a version to a variable named for the tool
#   (TOOL_JQ_VERSION: "1.7", JQ_VERSION=1.6, sqlite_version = "3.45").
#
# Comments are not code and are not read. Tests are not scanned: their stand-ins
# answer at whatever version a case needs.
#
# Copies that stay where they are, each owned elsewhere, and why:
#
#   .nvmrc, .python-version     the runtime pins Node and Python tooling read by
#                               those names; workstation setup cross-checks them.
#   package.json engines        Node's exact version, owned by check_version_pins.sh.
#   terraform required_version  in each terraform/*/providers.tf, and
#   and CI terraform_version    terraform_version in the CI workflow: Terraform and
#                               its action read them there; setup cross-checks them.
#   GITLEAKS_VERSION in CI, and the gitleaks IMAGE_VERSION/IMAGE_DIGEST in
#                               scripts/ci/secret_scan.sh: the action and the
#                               container fallback read them; secret_scan.sh
#                               refuses when they disagree.
#   ffmpeg=<pin> in docker/image/Dockerfile
#                               apk reads it there; tests/unit/imageToolPins.test.ts
#                               fails when it differs from FFMPEG_VERSION.
#   the OWASP ZAP digests and snyk's npx version in scripts/pentest/
#                               not tools in the list; check_version_pins.sh owns
#                               their pinning.
set -euo pipefail
ROOT="${CHECK_TOOL_VERSIONS_ROOT:-$(git rev-parse --show-toplevel)}"
if [[ -n "${CHECK_TOOL_VERSIONS_ROOT:-}" ]]; then
  echo "[tool-versions-home] NOTE: checking a stand-in tree (CHECK_TOOL_VERSIONS_ROOT)." >&2
fi
cd "$ROOT"
LIST="ops/tool-versions.env"
[[ -r "$LIST" ]] || { echo "[tool-versions-home] FAIL: ${LIST} is missing." >&2; exit 1; }

mapfile -t FILES < <(
  { git ls-files --cached --others --exclude-standard -- scripts .github docker terraform ops package.json \
      run_dev.sh run_all_tests.sh deploy_to_aws.sh 2>/dev/null \
    || find scripts .github docker terraform ops package.json run_dev.sh run_all_tests.sh deploy_to_aws.sh \
         -type f 2>/dev/null; } | grep -vxF "$LIST" | sort -u
)

# Whether file:line is one of the copies the header lists as owned elsewhere.
allowed() {
  local file="$1" line="$2"
  case "$file" in
    .github/workflows/*)
      [[ "$line" =~ terraform_version:|GITLEAKS_VERSION: ]] && return 0 ;;
    terraform/*/providers.tf)
      [[ "$line" =~ required_version ]] && return 0 ;;
    scripts/ci/secret_scan.sh)
      [[ "$line" =~ IMAGE_VERSION=|IMAGE_DIGEST= ]] && return 0 ;;
    docker/image/Dockerfile)
      [[ "$line" =~ ffmpeg= ]] && return 0 ;;
    package.json)
      [[ "$line" =~ \"node\": ]] && return 0 ;;
  esac
  return 1
}

violations=0
while IFS= read -r entry; do
  key="${entry%%=*}"
  value="${entry#*=}"
  [[ -n "$value" && "$value" != *REPLACE_WITH_* ]] || continue
  prefix="${key%_VERSION}"
  name="$(printf '%s' "$prefix" | tr 'A-Z_' 'a-z-')"
  name_re="$(printf '%s' "$prefix" | tr 'A-Z' 'a-z')"
  for file in "${FILES[@]}"; do
    [[ -f "$file" ]] || continue
    while IFS= read -r hit; do
      [[ -n "$hit" ]] || continue
      lineno="${hit%%:*}"
      text="${hit#*:}"
      [[ "$text" =~ ^[[:space:]]*# ]] && continue
      allowed "$file" "$text" && continue
      echo "  FAIL: ${file}:${lineno} pins ${name} outside ${LIST}: ${text#"${text%%[![:space:]]*}"}" >&2
      violations=$((violations + 1))
    done < <(
      { grep -nF -- "$value" "$file" 2>/dev/null | grep -iF -- "$name" || true
        grep -niE -- "(^|[^a-z0-9])(tool_)?${name_re}_version[\"']?[[:space:]]*[:=][[:space:]]*[\"']?[0-9]" "$file" 2>/dev/null || true
      } | sort -u -t: -k1,1n
    )
  done
done < <(grep -E '^[A-Z0-9_]+_VERSION=' "$LIST")

if (( violations )); then
  echo "[tool-versions-home] FAIL (${violations}): move each into ${LIST} and read it from there" >&2
  echo "       (scripts/lib/tool-versions.sh), or, if it is owned elsewhere, record it in this" >&2
  echo "       gate's header with its owner." >&2
  exit 1
fi
echo "[tool-versions-home] pass (${#FILES[@]} files, every tool version in ${LIST})"
