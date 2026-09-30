#!/usr/bin/env bash
# pin-npm-package.sh
#
# Changes one npm version pin: a dependency, a devDependency or an override in
# package.json, and that package's entries in package-lock.json with it. It is
# the only way a version in package.json changes.
#
# WHY THIS EXISTS.
#
# Every version is pinned, and the lockfile pins everything the named packages
# pull in. A pin changed by hand is a pin changed without proof: `npm install`
# re-resolves whatever it likes, a hand-edited override can disagree with the
# direct dependency it shadows, and nothing shows that only the one package
# moved. A version moves here only when named, the lockfile is proven to move
# only that package, and the result is installed from scratch before either file
# in the repository is touched.
#
# WHAT IT DOES AND REFUSES TO DO.
#
#   - Refuses a version that is not exact (the version-pin gate's own rule), one
#     the registry does not publish, a downgrade unless --allow-downgrade, and a
#     Node other than the one .nvmrc pins, since npm's resolution depends on it.
#   - Refuses a package.json and lockfile that are out of step before it starts:
#     a lock-only install of the untouched pair must change nothing.
#   - Finds where the name is declared and changes it there. A direct dependency
#     and an override of the same package move together, because npm refuses an
#     override that disagrees with the dependency it shadows. A package that is
#     only pulled in by others takes --override, which adds an override for it.
#   - Works in a throwaway copy first: applies the change, lists every lockfile
#     entry that moved, and refuses when any entry other than the named package's
#     moved, unless --accept-collateral (removing an override legitimately lets
#     its dependents re-resolve). Then installs from the new lock with `npm ci`
#     and checks that only the named version is installed and every entry carries
#     an integrity hash. It prints the diff and the audit before and after.
#   - Only then writes the two files into the repository, runs the version-pin
#     gate, and restores both files byte for byte if that fails. Last, `npm ci`
#     brings node_modules in line with the new lock.
#   - A re-run of a pin already in place does no harm: it says so and refreshes
#     node_modules.
#
# Usage:
#   bash scripts/pin-npm-package.sh <name> <version>
#   bash scripts/pin-npm-package.sh --override <name> <version>
#   bash scripts/pin-npm-package.sh --remove-override <name>
#
# Flags:
#   --override            add an override for a package nothing declares directly
#   --remove-override     remove an override (its dependents re-resolve; implies
#                         --accept-collateral)
#   --allow-downgrade     permit a version lower than the one pinned now
#   --accept-collateral   permit other lockfile entries to move, listed first
#
# Test seam (announced on stderr): FOOTBAG_NPM_BIN replaces npm.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

usage() { sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'; }
die() { echo "ERROR: $*" >&2; echo "       Nothing changed." >&2; exit 1; }

ADD_OVERRIDE=0
REMOVE_OVERRIDE=0
ALLOW_DOWNGRADE=0
ACCEPT_COLLATERAL=0
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --override) ADD_OVERRIDE=1 ;;
    --remove-override) REMOVE_OVERRIDE=1; ACCEPT_COLLATERAL=1 ;;
    --allow-downgrade) ALLOW_DOWNGRADE=1 ;;
    --accept-collateral) ACCEPT_COLLATERAL=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
    *) POSITIONAL+=("$1") ;;
  esac
  shift
done

NAME="${POSITIONAL[0]:-}"
VERSION="${POSITIONAL[1]:-}"
if (( REMOVE_OVERRIDE == 1 )); then
  [[ -n "$NAME" && ${#POSITIONAL[@]} -eq 1 ]] || { echo "ERROR: --remove-override takes one package name." >&2; exit 2; }
  (( ADD_OVERRIDE == 0 )) || { echo "ERROR: --override and --remove-override contradict each other." >&2; exit 2; }
else
  [[ -n "$NAME" && -n "$VERSION" && ${#POSITIONAL[@]} -eq 2 ]] || { echo "ERROR: name a package and an exact version (--help)." >&2; exit 2; }
fi

NPM="${FOOTBAG_NPM_BIN:-npm}"
if [[ -n "${FOOTBAG_NPM_BIN:-}" ]]; then
  echo "TEST SEAM: FOOTBAG_NPM_BIN=${FOOTBAG_NPM_BIN}; nothing here proves the real registry." >&2
fi

# ── Preconditions ────────────────────────────────────────────────────────────
command -v jq >/dev/null 2>&1 || die "jq is required; bash scripts/setup-dev-workstation.sh installs it."
[[ -f package.json && -f package-lock.json ]] || die "package.json and package-lock.json must both exist here."
want_node="v$(tr -d '[:space:]' < .nvmrc 2>/dev/null || true)"
[[ "$(node -v 2>/dev/null || true)" == "$want_node" ]] \
  || die "npm resolves under the Node .nvmrc pins (${want_node}), and this shell runs $(node -v 2>/dev/null || echo 'no node')."

if (( REMOVE_OVERRIDE == 0 )); then
  [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]] \
    || die "'${VERSION}' is not an exact version; every pin is one."
  published="$("$NPM" view "${NAME}@${VERSION}" version 2>/dev/null | tail -n 1 | tr -d '[:space:]' || true)"
  [[ "$published" == "$VERSION" ]] \
    || die "the registry does not publish ${NAME}@${VERSION} (or could not be reached)."
fi

# Where the name is declared now, and at what version.
SECTIONS=()
for s in dependencies devDependencies optionalDependencies overrides; do
  kind="$(jq -r --arg s "$s" --arg n "$NAME" '(.[$s] // {})[$n] | type' package.json)"
  case "$kind" in
    null) ;;
    string) SECTIONS+=("$s") ;;
    *) die "${s}.${NAME} is not a plain version string; change a nested override by hand review, not here." ;;
  esac
done
in_lock="$(jq -r --arg n "$NAME" '[.packages // {} | keys[] | select(endswith("node_modules/" + $n))] | length' package-lock.json)"
has_override=0
for s in "${SECTIONS[@]}"; do [[ "$s" == overrides ]] && has_override=1; done
direct=$(( ${#SECTIONS[@]} - has_override ))

if (( REMOVE_OVERRIDE == 1 )); then
  (( has_override == 1 )) || die "${NAME} has no override to remove."
  (( direct == 0 )) || die "${NAME} is also a direct dependency; its override must match it, so pin the dependency instead."
elif (( ${#SECTIONS[@]} == 0 )); then
  (( ADD_OVERRIDE == 1 )) || die "${NAME} is not declared in package.json; for a package others pull in, pass --override."
  (( in_lock > 0 )) || die "${NAME} is not in the lockfile, so an override for it would pin nothing."
  SECTIONS=(overrides)
else
  (( ADD_OVERRIDE == 0 || has_override == 1 )) \
    || die "${NAME} is a direct dependency; pin it without --override (a matching override moves with it)."
fi

current=""
for s in "${SECTIONS[@]}"; do
  current="$(jq -r --arg s "$s" --arg n "$NAME" '(.[$s] // {})[$n] // empty' package.json)"
  [[ -n "$current" ]] && break
done
if (( REMOVE_OVERRIDE == 0 )) && [[ -n "$current" && "$current" != "$VERSION" && ALLOW_DOWNGRADE -eq 0 ]]; then
  lower="$(printf '%s\n%s\n' "$current" "$VERSION" | sort -V | head -n 1)"
  [[ "$lower" == "$VERSION" ]] && die "${VERSION} is lower than the pinned ${current}; pass --allow-downgrade if that is meant."
fi

# ── Throwaway copy ───────────────────────────────────────────────────────────
WORK="$(mktemp -d "${TMPDIR:-/tmp}/footbag-pin-npm.XXXXXX")"
RESTORE=0
cleanup() {
  if (( RESTORE == 1 )); then
    cp "$WORK/orig/package.json" package.json
    cp "$WORK/orig/package-lock.json" package-lock.json
    echo "Restored package.json and package-lock.json to what they were before this run." >&2
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT INT TERM
mkdir -p "$WORK/orig" "$WORK/new"
cp package.json package-lock.json "$WORK/orig/"
cp package.json package-lock.json "$WORK/new/"

lock_only() {
  "$NPM" --prefix "$1" install --package-lock-only --ignore-scripts --no-audit --no-fund >/dev/null
}

echo "→ Checking package.json and the lockfile are in step"
lock_only "$WORK/new" || die "npm could not resolve the current package.json."
cmp -s "$WORK/orig/package-lock.json" "$WORK/new/package-lock.json" \
  || die "package.json and package-lock.json are out of step before any change; resolve that first."

already=0
if (( REMOVE_OVERRIDE == 0 )) && [[ "$current" == "$VERSION" ]]; then
  already=1
fi

if (( already == 0 )); then
  echo "→ Applying the change in a throwaway copy"
  filter='.'
  if (( REMOVE_OVERRIDE == 1 )); then
    filter='del(.overrides[$n]) | if (.overrides == {}) then del(.overrides) else . end'
  else
    for s in "${SECTIONS[@]}"; do
      filter="${filter} | .[\"${s}\"] = ((.[\"${s}\"] // {}) + {(\$n): \$v})"
    done
  fi
  jq --indent 2 --arg n "$NAME" --arg v "$VERSION" "$filter" "$WORK/orig/package.json" > "$WORK/new/package.json"
  lock_only "$WORK/new" || die "npm could not resolve the changed package.json."

  moved="$(jq -rn --slurpfile a "$WORK/orig/package-lock.json" --slurpfile b "$WORK/new/package-lock.json" '
    ($a[0].packages // {}) as $o | ($b[0].packages // {}) as $n
    | ([$o, $n] | map(keys) | add | unique)[] | select($o[.] != $n[.])')"
  collateral="$(printf '%s\n' "$moved" | grep -v '^$' | grep -vxF '' | grep -vE "(^|/)node_modules/${NAME//./\\.}\$" || true)"
  echo "  lockfile entries that moved:"
  printf '%s\n' "$moved" | sed 's/^$/(the root entry)/; s/^/    /'
  if [[ -n "$collateral" && ACCEPT_COLLATERAL -eq 0 ]]; then
    echo "  entries other than ${NAME}'s:" >&2
    printf '    %s\n' "$collateral" >&2
    die "the change moves lockfile entries other than ${NAME}'s; review them and pass --accept-collateral if they are meant."
  fi

  echo "→ Installing from the new lock in the throwaway copy"
  "$NPM" --prefix "$WORK/new" ci --ignore-scripts --no-audit --no-fund >/dev/null \
    || die "npm ci from the new lock failed."
  if (( REMOVE_OVERRIDE == 0 )); then
    installed="$("$NPM" --prefix "$WORK/new" ls "$NAME" --all --json 2>/dev/null \
      | jq -r --arg n "$NAME" '[.. | objects | select(has("dependencies")) | .dependencies | to_entries[] | select(.key == $n) | .value.version] | unique | join(",")')"
    [[ "$installed" == "$VERSION" ]] || die "after the change ${NAME} installs as '${installed}', not only ${VERSION}."
  fi
  unhashed="$(jq -r '.packages // {} | to_entries[] | select(.key != "" and (.value.link | not) and ((.value.integrity // "") == "")) | .key' "$WORK/new/package-lock.json")"
  [[ -z "$unhashed" ]] || die "these lockfile entries carry no integrity hash: ${unhashed//$'\n'/, }"

  audit_total() {
    "$NPM" --prefix "$1" audit --package-lock-only --json 2>/dev/null \
      | jq -r '.metadata.vulnerabilities | "\(.total) (high \(.high), critical \(.critical))"' 2>/dev/null || echo "unreadable"
  }
  echo "  npm audit, before: $(audit_total "$WORK/orig"); after: $(audit_total "$WORK/new")"

  echo "→ The change to package.json:"
  diff -u "$WORK/orig/package.json" "$WORK/new/package.json" | sed 's/^/    /' || true

  # ── Write, then prove it passes the pin gate ────────────────────────────────
  RESTORE=1
  cp "$WORK/new/package.json" package.json
  cp "$WORK/new/package-lock.json" package-lock.json
  bash scripts/ci/check_version_pins.sh || die "the version-pin gate refused the result."
  RESTORE=0
  if (( REMOVE_OVERRIDE == 1 )); then
    echo "✓ Removed the ${NAME} override."
  else
    echo "✓ Pinned ${NAME} at ${VERSION}."
  fi
else
  echo "✓ ${NAME} is already pinned at ${VERSION}, and the lockfile is in step."
fi

echo "→ Bringing node_modules in line with the lock (npm ci)"
if ! "$NPM" ci --no-audit --no-fund; then
  echo "WARNING: package.json and the lockfile are pinned and verified, but npm ci failed here;" >&2
  echo "         re-running this same command finishes the install." >&2
  exit 1
fi
