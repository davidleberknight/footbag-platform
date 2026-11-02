#!/usr/bin/env bash
# scripts/check-vulnerabilities.sh -- which pinned versions carry a published
# flaw fixed in a newer release, ranked most urgent first.
#
# Why this exists: patching is the System Administrator's call, made on request
# and never on a schedule, and it is best effort with no deadline. To make that
# call they need one list of every published advisory that affects what the
# estate runs, ordered by how urgently each should move. This is that list. It
# changes nothing: it reads public advisory feeds, scans with the pinned Trivy,
# and, only when asked, reads one host's package advisories.
#
# What it reads:
#   - pinned Trivy (TRIVY_IMAGE), as JSON, over the dependency locks
#     (package-lock.json, scripts/requirements*.txt, legacy_data/requirements.txt),
#     over the four deployed images (web, worker and image, built as
#     scripts/check-versions.sh builds them, and the pinned nginx image from
#     docker/docker-compose.yml), over the Amazon Linux image at the hosts'
#     pinned release, and over the pinned standalone downloads, each fetched
#     and checked against its pinned digest first;
#   - OSV (api.osv.dev) for each standalone tool's own package and version,
#     where OSV has an ecosystem that names it;
#   - the Node.js security working group's core list against .nvmrc;
#   - with --target, the host's `dnf updateinfo --releasever=latest --list`;
#   - and, to rank what was found, the CISA Known Exploited Vulnerabilities
#     catalog and FIRST's EPSS scores.
#
# Ranking, most urgent first: listed in the KEV catalog, then exposure (public
# before origin-only before internal), then EPSS score, then severity. The KEV
# column also shows the catalog's forensic-triage flag and whether the flaw is
# known to be used in ransomware campaigns.
#
# What it refuses to do:
#   - Change a pin, a host or an image. It reads and reports.
#   - Leave a gap unsaid. An unreachable feed is a warning naming what was not
#     checked; a failed Trivy scan or a download that does not match its digest
#     is an error; a pinned tool no advisory database covers is listed by name;
#     and "no finding" is claimed only for what was actually scanned.
#   - Read a host unless asked: without --target it needs no credential and
#     opens no connection.
#
# Usage:
#   bash scripts/check-vulnerabilities.sh
#   < <operator credential file> bash scripts/check-vulnerabilities.sh --target <staging|production>
#
# Flags:
#   --target   also read that host's package advisories; needs the operator
#              credential on standard input, like scripts/step-amazon-linux.sh
#
# The table goes to stdout; progress and the closing report go to stderr.
# Downloads and Trivy's database are kept under
# ${XDG_CACHE_HOME:-$HOME/.cache}/footbag, so a second run fetches little.
#
# Test seams, each announced on stderr:
#   FOOTBAG_CHECK_VULNERABILITIES_CURL_BIN  replaces curl for every feed and download
#   FOOTBAG_CHECK_VULNERABILITIES_DOCKER    replaces docker for the builds and the scans
#   FOOTBAG_HOST_SSH_BIN                    replaces the ssh client (scripts/lib/host-env-remote.sh)
#   FOOTBAG_TOOL_VERSIONS                   a stand-in version list (scripts/lib/tool-versions.sh)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"
# shellcheck source=lib/tool-versions.sh
source "${SCRIPT_DIR}/lib/tool-versions.sh"
# shellcheck source=lib/fetch-pinned.sh
source "${SCRIPT_DIR}/lib/fetch-pinned.sh"
# shellcheck source=lib/compose-build.sh
source "${SCRIPT_DIR}/lib/compose-build.sh"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

REMOTE_HALF="${SCRIPT_DIR}/internal/check-vulnerabilities-remote.sh"
REPORT_LIB="${SCRIPT_DIR}/lib/closing-report-remote.sh"

usage() { sed -n '/^# Usage:/,/^# The table/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; }

TARGET=""
while (( $# )); do
  case "$1" in
    --target) [[ -n "${2:-}" ]] || { cr_error "--target needs staging or production."; exit 2; }; TARGET="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) cr_error "unknown argument: $1"; usage; exit 2 ;;
  esac
done
if [[ -n "$TARGET" && "$TARGET" != staging && "$TARGET" != production ]]; then
  cr_error "--target must be staging or production (got '${TARGET}')"
  exit 2
fi

CURL="${FOOTBAG_CHECK_VULNERABILITIES_CURL_BIN:-curl}"
if [[ -n "${FOOTBAG_CHECK_VULNERABILITIES_CURL_BIN:-}" ]]; then
  echo "SYNTHETIC: FOOTBAG_CHECK_VULNERABILITIES_CURL_BIN is set; the feeds and downloads are stand-ins." >&2
  cr_unproved "what the real advisory feeds and downloads hold: FOOTBAG_CHECK_VULNERABILITIES_CURL_BIN stood in for curl"
fi
DOCKER="${FOOTBAG_CHECK_VULNERABILITIES_DOCKER:-docker}"
if [[ -n "${FOOTBAG_CHECK_VULNERABILITIES_DOCKER:-}" ]]; then
  echo "SYNTHETIC: FOOTBAG_CHECK_VULNERABILITIES_DOCKER is set; the images and the scans are stand-ins." >&2
  cr_unproved "what the real images and the real scans hold: FOOTBAG_CHECK_VULNERABILITIES_DOCKER stood in for docker"
fi
FETCH_PINNED_CMD="$CURL -fsSL"

command -v jq > /dev/null || cr_die "jq is needed to read the feeds and the scans; install the pinned jq (scripts/setup-dev-workstation.sh)"

WORK="$(mktemp -d)"
cr_cleanup rm -rf "$WORK"
CACHE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}/footbag"
TRIVY_CACHE="${CACHE_ROOT}/trivy"
DOWNLOADS="${CACHE_ROOT}/pinned-downloads"
mkdir -p "$TRIVY_CACHE" "$DOWNLOADS"

FINDINGS="${WORK}/findings.jsonl"
: > "$FINDINGS"
CHECKED=()

# ── What each pin is, where it runs, and what checks it ──────────────────────
#
# Exposure is fixed here rather than discovered, because what decides it is how
# the estate is built, which no scan can see:
#   public       reachable from the internet: the nginx container is the only
#                one with a published port, and CloudFront sends visitors to it;
#   origin-only  runs on a host but reachable only through nginx or by the
#                operator: the web, worker and image containers, the host's own
#                packages and daemons, and the tools installed on the hosts;
#   internal     never on a host: workstation and continuous-integration tools,
#                and the lockfiles' development dependencies.
#
# How a pin is checked: osv:<ecosystem>:<package> asks OSV for the tool's own
# package (the Go module path its go.mod declares, read from each release's
# go.mod); rootfs scans the verified download with Trivy, which finds the
# libraries a binary carries but not the tool itself; node, host and image name
# the other sources below. A pin with no source for the tool itself is listed as
# not covered, for the check-vulnerabilities skill to read the vendor's page.
#
# version key                exposure     checked by
PIN_TABLE="$(cat <<'TABLE'
COMPOSE_VERSION            origin-only  osv:Go:github.com/docker/compose/v5 rootfs
CWAGENT_VERSION            origin-only  -
SQLITE_VERSION             origin-only  -
DOCKER_ENGINE_HOST         origin-only  host
AMAZON_LINUX_RELEASE       origin-only  host image
FFMPEG_VERSION             origin-only  image
NODE                       origin-only  node
TERRAFORM_VERSION          internal     osv:Go:github.com/hashicorp/terraform rootfs
GITLEAKS_VERSION           internal     osv:Go:github.com/zricethezav/gitleaks/v8 rootfs
AGE_VERSION                internal     osv:Go:filippo.io/age rootfs
TRIVY_VERSION              internal     osv:Go:github.com/aquasecurity/trivy
JQ_VERSION                 internal     -
AWS_CLI_VERSION            internal     rootfs
PYTHON_VERSION             internal     rootfs
NVM_VERSION                internal     -
DOCKER_ENGINE_WORKSTATION  internal     -
TABLE
)"

pin_exposure() { awk -v k="$1" '$1 == k { print $2 }' <<< "$PIN_TABLE"; }

# Trivy's log lines carry their level as a word between blanks; its findings are
# the JSON report on stdout, so only the levels are read as problems.
TRIVY_ERRORS='[[:space:]](FATAL|ERROR)[[:space:]]'
TRIVY_WARNINGS='[[:space:]]WARN[[:space:]]'

# fetch_feed <label> <out> <what is not checked without it> <curl args...>
# A public feed: on failure, a warning naming what went unchecked.
fetch_feed() {
  local label="$1" out="$2" missing="$3" err="${WORK}/curl.err"
  shift 3
  if "$CURL" -fsS --max-time 120 "$@" > "$out" 2> "$err" && jq -e . "$out" > /dev/null 2>> "$err"; then
    return 0
  fi
  cr_warn "${label} unreachable or not JSON: $(tail -n 1 "$err"); not checked: ${missing}"
  cr_unproved "${missing}: ${label} could not be read"
  return 1
}

# ── The ranking feeds ────────────────────────────────────────────────────────
echo "==> Reading the CISA Known Exploited Vulnerabilities catalog" >&2
KEV_OK=0
echo '{}' > "${WORK}/kev.json"
if fetch_feed "the CISA KEV catalog" "${WORK}/kev.raw" "whether any finding is known to be exploited" \
     https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json; then
  if jq -e '.vulnerabilities | type == "array"' "${WORK}/kev.raw" > /dev/null; then
    jq '[.vulnerabilities[] | {key: .cveID, value: {triage: (.forensicTriage // "unknown"), ransomware: (.knownRansomwareCampaignUse // "unknown")}}] | from_entries' \
      "${WORK}/kev.raw" > "${WORK}/kev.json"
    KEV_OK=1
  else
    cr_warn "the CISA KEV catalog has no vulnerabilities list; not checked: whether any finding is known to be exploited"
    cr_unproved "whether any finding is known to be exploited: the KEV catalog was not in its published shape"
  fi
fi

# ── Trivy ────────────────────────────────────────────────────────────────────
TRIVY=""
if tool_pins_ok TRIVY_IMAGE; then
  tool_pin TRIVY_IMAGE
  TRIVY="$TOOL_PIN_VALUE"
else
  cr_error "TRIVY_IMAGE is not a usable pin, so no Trivy scan ran"
  cr_unproved "the dependency locks, the images and the standalone downloads: no usable Trivy pin"
fi

# trivy_run <label> <json-out> <subcommand> <target> [trivy flags...]
# Runs the pinned scanner with the persistent cache and any mounts in
# TRIVY_MOUNTS, keeping its JSON report. A failure is an error: the scanner is
# pinned and local, so a failed scan is a broken run, not an outside outage.
TRIVY_MOUNTS=()
trivy_run() {
  local label="$1" json="$2" sub="$3" target="$4" err="${WORK}/trivy.err" rc=0
  shift 4
  "$DOCKER" run --rm -v "${TRIVY_CACHE}:/cache" "${TRIVY_MOUNTS[@]+"${TRIVY_MOUNTS[@]}"}" "$TRIVY" \
    "$sub" --cache-dir /cache --scanners vuln --format json --exit-code 0 "$@" "$target" \
    > "$json" 2> "$err" || rc=$?
  cat "$err" >&2
  cr_harvest --errors "$TRIVY_ERRORS" --warnings "$TRIVY_WARNINGS" "trivy (${label})" "$err"
  if (( rc )); then
    cr_error "trivy (${label}): exit ${rc}: $(tail -n 1 "$err")"
    cr_unproved "${label}: the scan failed"
    return 1
  fi
  if ! jq -e 'has("SchemaVersion")' "$json" > /dev/null 2>&1; then
    cr_error "trivy (${label}): no JSON report on its output"
    cr_unproved "${label}: the scan wrote no report"
    return 1
  fi
  return 0
}

# trivy_findings <json> <source> <exposure|lockfile|rootfs>
# One finding per line from a Trivy report. A lockfile's exposure follows the
# file (npm's production dependencies ship in the containers; the Python
# requirements are workstation tools); a standalone download's follows the pin
# whose directory it was unpacked into.
ROOTFS_EXPOSURE='{}'
trivy_findings() {
  jq -c --arg source "$2" --arg mode "$3" --argjson rootexp "$ROOTFS_EXPOSURE" '
    (.Results // [])[] | .Target as $t | (.Vulnerabilities // [])[] |
    {pkg: .PkgName, version: .InstalledVersion, advisory: .VulnerabilityID,
     cves: (if (.VulnerabilityID | startswith("CVE-")) then [.VulnerabilityID] else [] end),
     fixed: (.FixedVersion // ""), severity: ((.Severity // "UNKNOWN") | ascii_upcase),
     key: "\($t) \(.PkgID // .PkgName) \(.VulnerabilityID)"}
    + (if $mode == "lockfile" then
         {exposure: (if ($t | test("package-lock\\.json$")) then "origin-only" else "internal" end),
          source: "\($source) \($t)"}
       elif $mode == "rootfs" then
         (($t | capture("(^|/)(?<p>[A-Z_]+)/") | .p) // "") as $p
         | {exposure: ($rootexp[$p] // "internal"), source: "\($source) \($p) \($t | sub(".*/"; ""))"}
       else {exposure: $mode, source: $source} end)' "$1"
}

if [[ -n "$TRIVY" ]]; then
  # The dependency locks, copied alone so the scan reads them and nothing else in
  # the tree (the legacy data trees are large and are not dependencies).
  echo "==> Scanning the dependency locks (Trivy)" >&2
  LOCKS="${WORK}/locks"
  mkdir -p "${LOCKS}/scripts" "${LOCKS}/legacy_data"
  lock_list=(package-lock.json scripts/requirements*.txt legacy_data/requirements.txt)
  locks_ok=1
  for f in "${lock_list[@]}"; do
    if [[ -r "$f" ]]; then
      cp "$f" "${LOCKS}/${f}"
    else
      cr_error "dependency lock ${f} is missing"
      locks_ok=0
    fi
  done
  TRIVY_MOUNTS=(-v "${LOCKS}:/src:ro")
  if trivy_run "dependency locks" "${WORK}/locks.json" fs /src; then
    trivy_findings "${WORK}/locks.json" "lockfile" lockfile >> "$FINDINGS"
    # npm's development dependencies are left out of Trivy's default report; a
    # second pass includes them, and what it adds is internal.
    if trivy_run "dependency locks, development dependencies" "${WORK}/locks-dev.json" fs /src --include-dev-deps; then
      trivy_findings "${WORK}/locks.json" "lockfile" lockfile > "${WORK}/locks.jsonl"
      trivy_findings "${WORK}/locks-dev.json" "lockfile (development)" internal \
        | jq -c --slurpfile prod "${WORK}/locks.jsonl" '($prod | map(.key)) as $k | select(.key as $x | $k | index($x) | not)' \
        >> "$FINDINGS"
      (( locks_ok )) && CHECKED+=("the dependency locks")
    fi
  fi

  echo "==> Building the images to scan them" >&2
  TRIVY_MOUNTS=(-v /var/run/docker.sock:/var/run/docker.sock)
  if cr_run "image build" -- compose_build_images "$DOCKER" web worker image >&2; then
    for img in docker-web docker-worker docker-image; do
      echo "==> Scanning ${img} (Trivy)" >&2
      if trivy_run "${img}" "${WORK}/${img}.json" image "$img"; then
        trivy_findings "${WORK}/${img}.json" "image ${img}" origin-only >> "$FINDINGS"
        CHECKED+=("${img}")
      fi
    done
  else
    cr_unproved "the web, worker and image containers: the images did not build"
  fi

  nginx_ref="$(grep -oE 'image:[[:space:]]*nginx:[^[:space:]]+' docker/docker-compose.yml | head -1 | sed 's/^image:[[:space:]]*//' || true)"
  if [[ -z "$nginx_ref" ]]; then
    cr_error "docker/docker-compose.yml names no nginx image, so the public container was not scanned"
    cr_unproved "the nginx container: no pinned image found"
  else
    echo "==> Scanning ${nginx_ref} (Trivy)" >&2
    if trivy_run "nginx" "${WORK}/nginx.json" image "$nginx_ref"; then
      trivy_findings "${WORK}/nginx.json" "image nginx" public >> "$FINDINGS"
      CHECKED+=("the nginx image")
    fi
  fi

  # The hosts' release as a container image: the closest stand-in for the hosts'
  # own packages that needs no host, so a run without --target still reads the
  # release the hosts are pinned to.
  if tool_pins_ok AMAZONLINUX_IMAGE; then
    tool_pin AMAZONLINUX_IMAGE
    echo "==> Scanning the hosts' pinned release image (Trivy)" >&2
    if trivy_run "Amazon Linux release image" "${WORK}/amazonlinux.json" image "$TOOL_PIN_VALUE"; then
      trivy_findings "${WORK}/amazonlinux.json" "image amazonlinux (hosts' release)" origin-only >> "$FINDINGS"
      CHECKED+=("the hosts' pinned release image")
    fi
  else
    cr_error "AMAZONLINUX_IMAGE is not a usable pin, so the hosts' release image was not scanned"
    cr_unproved "the hosts' pinned release image: no usable pin"
  fi

  # The standalone downloads, each verified against its digest, then unpacked
  # into a directory named for its pin, which is how a finding finds its pin.
  echo "==> Fetching the pinned standalone downloads" >&2
  ROOTFS="${WORK}/rootfs"
  mkdir -p "$ROOTFS"
  rootfs_pins=()
  exp_args=()
  while read -r key exposure checks; do
    [[ " ${checks} " == *" rootfs "* ]] || continue
    prefix="${key%_VERSION}"
    exp_args+=("$prefix" "$exposure")
    if ! tool_pins_ok "${prefix}_URL" "${prefix}_SHA256"; then
      cr_error "${prefix}: no usable URL or digest pin, so it was not scanned"
      cr_unproved "${prefix}'s bundled libraries: no usable pin"
      continue
    fi
    tool_pin "${prefix}_URL"; url="$TOOL_PIN_VALUE"
    tool_pin "${prefix}_SHA256"; sha="$TOOL_PIN_VALUE"
    file="${DOWNLOADS}/${sha}"
    if [[ ! -f "$file" ]] || [[ "$(sha256sum "$file" | cut -d' ' -f1)" != "$sha" ]]; then
      if ! fetch_pinned "$prefix" "${file}.part" 2> "${WORK}/fetch.err"; then
        cat "${WORK}/fetch.err" >&2
        if [[ "$FETCH_PINNED_FAILURE" == checksum ]]; then
          cr_error "${prefix}: $(tail -n 1 "${WORK}/fetch.err")"
        else
          cr_warn "${prefix}: $(tail -n 1 "${WORK}/fetch.err"); not scanned"
        fi
        cr_unproved "${prefix}'s bundled libraries: the download was not available"
        continue
      fi
      mv "${file}.part" "$file"
    fi
    mkdir -p "${ROOTFS}/${prefix}"
    rc=0
    case "$url" in
      *.tar.gz|*.tgz) tar -xzf "$file" -C "${ROOTFS}/${prefix}" 2> "${WORK}/unpack.err" || rc=$? ;;
      *.zip) unzip -q -o "$file" -d "${ROOTFS}/${prefix}" > /dev/null 2> "${WORK}/unpack.err" || rc=$? ;;
      *) install -m 0755 "$file" "${ROOTFS}/${prefix}/${url##*/}" 2> "${WORK}/unpack.err" || rc=$? ;;
    esac
    if (( rc )); then
      cr_error "${prefix}: the verified download would not unpack: $(tail -n 1 "${WORK}/unpack.err")"
      cr_unproved "${prefix}'s bundled libraries: not unpacked"
      continue
    fi
    rootfs_pins+=("$prefix")
  done <<< "$PIN_TABLE"
  if (( ${#exp_args[@]} )); then
    ROOTFS_EXPOSURE="$(jq -n '[$ARGS.positional | _nwise(2) | {key: .[0], value: .[1]}] | from_entries' --args "${exp_args[@]}")"
  fi
  if (( ${#rootfs_pins[@]} )); then
    echo "==> Scanning the standalone downloads (Trivy)" >&2
    TRIVY_MOUNTS=(-v "${ROOTFS}:/rootfs:ro")
    if trivy_run "standalone downloads" "${WORK}/rootfs.json" rootfs /rootfs; then
      trivy_findings "${WORK}/rootfs.json" "download" rootfs >> "$FINDINGS"
      CHECKED+=("the libraries bundled in ${rootfs_pins[*]}")
    fi
  fi
fi

# ── OSV, for each standalone tool's own package ──────────────────────────────
echo "==> Asking OSV about each standalone tool" >&2
osv_keys=() osv_names=() osv_ecos=() osv_versions=()
while read -r key exposure checks; do
  for c in $checks; do
    [[ "$c" == osv:* ]] || continue
    c="${c#osv:}"
    if ! tool_pin "$key"; then
      cr_error "${key}: no such pin, so OSV was not asked about it"
      continue
    fi
    osv_keys+=("$key"); osv_ecos+=("${c%%:*}"); osv_names+=("${c#*:}"); osv_versions+=("${TOOL_PIN_VALUE#v}")
  done
done <<< "$PIN_TABLE"
if (( ${#osv_keys[@]} )); then
  jq -n --args '{queries: [$ARGS.positional | _nwise(3) | {package: {ecosystem: .[0], name: .[1]}, version: .[2]}]}' \
    $(for i in "${!osv_keys[@]}"; do printf '%s %s %s ' "${osv_ecos[$i]}" "${osv_names[$i]}" "${osv_versions[$i]}"; done) \
    > "${WORK}/osv-query.json"
  if fetch_feed "OSV" "${WORK}/osv-batch.json" "the standalone tools' own advisories (${osv_keys[*]})" \
       -H 'Content-Type: application/json' --data-binary "@${WORK}/osv-query.json" https://api.osv.dev/v1/querybatch; then
    osv_complete=1
    mkdir -p "${WORK}/osv"
    for i in "${!osv_keys[@]}"; do
      key="${osv_keys[$i]}"
      if [[ -n "$(jq -r --argjson i "$i" '.results[$i].next_page_token // empty' "${WORK}/osv-batch.json")" ]]; then
        cr_warn "OSV has more advisories for ${key} than one page; only the first page was read"
      fi
      : > "${WORK}/osv-${i}.jsonl"
      for id in $(jq -r --argjson i "$i" '.results[$i].vulns // [] | .[].id' "${WORK}/osv-batch.json"); do
        [[ "$id" =~ ^[A-Za-z0-9:_.-]+$ ]] || { cr_warn "OSV returned an advisory id that is not one: ${id}"; continue; }
        if [[ ! -s "${WORK}/osv/${id}.json" ]]; then
          if ! fetch_feed "OSV advisory ${id}" "${WORK}/osv/${id}.json" "the fixed version of ${id} for ${key}" \
               "https://api.osv.dev/v1/vulns/${id}"; then
            echo "{\"id\": \"${id}\"}" > "${WORK}/osv/${id}.json"
            osv_complete=0
          fi
        fi
        jq -c . "${WORK}/osv/${id}.json" >> "${WORK}/osv-${i}.jsonl"
      done
      # Advisories that name each other (a Go advisory and its GitHub one) are
      # one flaw: merged, keeping every CVE id and the highest severity.
      jq -s -c --arg pin "$key" --arg eco "${osv_ecos[$i]}" --arg name "${osv_names[$i]}" \
         --arg ver "${osv_versions[$i]}" --arg exposure "$(pin_exposure "$key")" '
        def vkey: [scan("[0-9]+") | tonumber];
        def sevrank: {"CRITICAL": 4, "HIGH": 3, "MODERATE": 2, "MEDIUM": 2, "LOW": 1}[.] // 0;
        reduce .[] as $v ([];
          ([$v.id] + ($v.aliases // [])) as $names
          | (map(.names as $n | any($names[]; . as $x | $n | index($x))) | index(true)) as $hit
          | if $hit == null then . + [{names: $names, vulns: [$v]}]
            else .[$hit].names += $names | .[$hit].vulns += [$v] end)
        | .[] | . as $c
        | {pkg: $pin, version: $ver, advisory: .vulns[0].id,
           cves: ([.names[] | select(startswith("CVE-"))] | unique),
           fixed: ([.vulns[].affected[]? | select(.package.name == $name and .package.ecosystem == $eco)
                    | .ranges[]?.events[]? | .fixed // empty]
                   | map(select(vkey > ($ver | vkey))) | unique | min_by(vkey) // (if ($c.vulns[0] | has("affected")) then "none listed" else "?" end)),
           severity: ([.vulns[].database_specific.severity? // empty | ascii_upcase] | max_by(sevrank) // "UNKNOWN"),
           exposure: $exposure, source: "OSV \($eco) \($name)", key: .vulns[0].id}' \
        "${WORK}/osv-${i}.jsonl" >> "$FINDINGS"
    done
    if (( osv_complete )); then
      CHECKED+=("OSV for ${osv_keys[*]}")
    else
      CHECKED+=("OSV for ${osv_keys[*]} (some fixed versions unread)")
    fi
  fi
fi

# ── Node.js core, against .nvmrc ─────────────────────────────────────────────
#
# Each entry names the releases it affects ("vulnerable") and the releases that
# carry the fix ("patched") as semver ranges; a release is affected when it is
# in the first and not the second. The ranges the list uses are x-ranges
# (22.x), caret ranges, comparators (>=, <=, <, >, with or without a blank
# before the version), bare versions and "||"; anything else is reported as
# unread rather than guessed.
NODE_SEMVER='
  def pv: reduce ([splits("\\.")][]) as $c ({p: [], stop: false};
            if .stop then . elif ($c | test("^[0-9]+$")) then .p += [($c | tonumber)] else .stop = true end) | .p;
  def pad: (. + [0, 0, 0])[:3];
  def hi: if length == 0 then [1e9, 0, 0] else (.[:-1] + [.[-1] + 1]) | pad end;
  def caret: (if any(.[]; . > 0) then (to_entries | map(select(.value > 0)) | .[0].key) else length - 1 end) as $i
             | if $i < 0 then [1e9, 0, 0] else (.[:$i] + [.[$i] + 1]) | pad end;
  def check: if test("^[0-9xX*.]*$") | not then error("unread range: \(.)") else . end;
  def sat1($v):
    if startswith(">=") then (.[2:] | check | pv) as $p | $v >= ($p | pad)
    elif startswith("<=") then (.[2:] | check | pv) as $p | if ($p | length) >= 3 then $v <= $p else $v < ($p | hi) end
    elif startswith(">") then (.[1:] | check | pv) as $p | if ($p | length) >= 3 then $v > $p else $v >= ($p | hi) end
    elif startswith("<") then (.[1:] | check | pv) as $p | $v < ($p | pad)
    elif startswith("^") then (.[1:] | check | pv) as $p | $v >= ($p | pad) and $v < ($p | caret)
    elif startswith("~") then (.[1:] | check | pv) as $p
      | $v >= ($p | pad) and $v < (if ($p | length) >= 2 then [$p[0], $p[1] + 1, 0] else ($p | hi) end)
    else (ltrimstr("=") | check | pv) as $p | if ($p | length) >= 3 then $v == $p else $v >= ($p | pad) and $v < ($p | hi) end
    end;
  def alts: [splits("\\|\\|")] | map(gsub("^\\s+|\\s+$"; "") | gsub("(?<o>[<>=~^]+)\\s+"; "\(.o)") | [splits("\\s+")] | map(select(. != "")));
  def sat($v): any(alts[]; all(.[]; sat1($v)));
  def lows: alts | map(.[0] // "0" | sub("^[<>=~^]+"; "") | check | pv | pad);
'
echo "==> Reading the Node.js core security list" >&2
node_pin="$(tr -d '[:space:]v' < .nvmrc 2>/dev/null || true)"
if [[ ! "$node_pin" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  cr_error ".nvmrc holds no exact Node version ('${node_pin}'), so Node core was not checked"
elif fetch_feed "the Node.js core security list" "${WORK}/node-index.json" "Node.js core ${node_pin} (.nvmrc)" \
       https://raw.githubusercontent.com/nodejs/security-wg/main/vuln/core/index.json; then
  jq -c --arg ver "$node_pin" --arg exposure "$(pin_exposure NODE)" "${NODE_SEMVER}"'
    ($ver | pv) as $v
    | to_entries[] | .key as $id | .value as $e
    | try (
        if ($e.vulnerable // "") | sat($v) | not then empty
        elif ($e.patched // "") != "" and (($e.patched | sat($v))) then empty
        else
          {pkg: "node (.nvmrc)", version: $ver,
           advisory: (($e.cve // [])[0] // "nodejs-security-wg-\($id)"),
           cves: ($e.cve // []),
           fixed: (if ($e.patched // "") == "" then "none listed"
                   else ($e.patched | lows | map(select(. > $v))) as $l
                     | (($l | map(select(.[0] == $v[0]))) + $l | .[0] // null)
                     | if . == null then "none listed" else map(tostring) | join(".") end end),
           severity: (($e.severity // "unknown") | ascii_upcase),
           exposure: $exposure, source: "Node.js core", key: "node-\($id)"}
        end)
      catch {unread: $id, why: .}' "${WORK}/node-index.json" > "${WORK}/node.jsonl"
  while IFS= read -r why; do
    cr_warn "Node.js core list entry ${why}; that entry was not judged"
  done < <(jq -r 'select(.unread) | "\(.unread): \(.why)"' "${WORK}/node.jsonl")
  jq -c 'select(.unread | not)' "${WORK}/node.jsonl" >> "$FINDINGS"
  CHECKED+=("Node.js core ${node_pin}")
fi

# ── One host's packages, only when asked ─────────────────────────────────────
if [[ -z "$TARGET" ]]; then
  cr_unproved "the hosts' installed packages: no --target given, so no host was read (the release image above stands in for them)"
else
  ALIAS="footbag-${TARGET}"
  [[ -r "$REMOTE_HALF" ]] || cr_die "missing ${REMOTE_HALF#"${REPO_ROOT}/"}"
  require_ssh_alias "$ALIAS" || cr_die "no usable ssh alias ${ALIAS}"
  require_operator_stdin "scripts/check-vulnerabilities.sh --target ${TARGET}" "$ALIAS" "$TARGET" \
    || cr_die "no operator credential on standard input"
  require_host_is "$ALIAS" "$TARGET" || cr_die "${ALIAS} is not the ${TARGET} host"
  echo "==> Reading ${ALIAS}'s package advisories (dnf updateinfo, latest release)" >&2
  HOST_LOG="${WORK}/host.log"
  _host_send() {
    {
      printf '%s\n' "$SUDO_PASS"
      cat "$REPORT_LIB"
      cat "$REMOTE_HALF"
    } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'
  }
  _host_read() { _host_send > "$HOST_LOG"; local rc="${PIPESTATUS[0]}"; grep -v -e '^---FOOTBAG-INSTALLED--- ' -- "$HOST_LOG" || true; return "$rc"; }
  if cr_run --sentinels-only "host ${ALIAS}" -- _host_read >&2 && grep -qx -- '---FOOTBAG-LISTED---' "$HOST_LOG"; then
    # The listing's shape, from Amazon's own example: an advisory id, its
    # severity and type, and the package build that fixes it, one per line.
    sed -n 's/^---FOOTBAG-INSTALLED--- //p' "$HOST_LOG" \
      | jq -R -n '[inputs | split(" ") | {key: .[0], value: .[1]}] | from_entries' > "${WORK}/installed.json"
    sed -n 's/^---FOOTBAG-UPDATEINFO--- //p' "$HOST_LOG" \
      | jq -R -n -c --slurpfile inst "${WORK}/installed.json" --arg alias "$ALIAS" --arg exposure "$(pin_exposure DOCKER_ENGINE_HOST)" '
        inputs | gsub("\\s+$"; "") | select(. != "")
        | if test("^Last metadata expiration check") then empty
          else (capture("^(?<id>ALAS[0-9A-Za-z-]+)\\s+(?<sev>[A-Za-z]+)/Sec\\.\\s+(?<nevra>\\S+)$")
                | (.nevra | capture("^(?<name>.+)-(?<vr>[^-]+-[^-]+)\\.(?<arch>[^.]+)$")) as $n
                | {pkg: $n.name, version: ($inst[0][$n.name] // "?"), advisory: .id, cves: [],
                   fixed: $n.vr, severity: (.sev | ascii_upcase), exposure: $exposure,
                   source: "host \($alias)", key: "\(.id) \($n.name)"})
            // {unread: .}
          end' > "${WORK}/host.jsonl"
    while IFS= read -r line; do
      cr_warn "host ${ALIAS}: a dnf updateinfo line this report cannot read, so it was not judged: ${line}"
    done < <(jq -r 'select(.unread) | .unread' "${WORK}/host.jsonl")
    jq -c 'select(.unread | not)' "${WORK}/host.jsonl" >> "$FINDINGS"
    CHECKED+=("${ALIAS}'s installed packages")
    cr_unproved "KEV and EPSS for ${ALIAS}'s advisories: dnf names Amazon Linux advisories, not CVE ids"
  else
    cr_unproved "${ALIAS}'s installed packages: the host's listing did not complete"
  fi
fi

# ── EPSS, for every CVE found ────────────────────────────────────────────────
EPSS_OK=1
: > "${WORK}/epss.jsonl"
mapfile -t cves < <(jq -r '.cves[]' "$FINDINGS" | sort -u)
if (( ${#cves[@]} )); then
  echo "==> Reading EPSS scores for ${#cves[@]} CVE(s)" >&2
  # FIRST serves at most 100 CVEs per call.
  for (( i = 0; i < ${#cves[@]}; i += 100 )); do
    batch="$(IFS=,; echo "${cves[*]:i:100}")"
    if fetch_feed "FIRST EPSS" "${WORK}/epss-${i}.json" "the exploit likelihood (EPSS) of the findings" \
         "https://api.first.org/data/v1/epss?cve=${batch}"; then
      jq -c '.data[]? | {cve, epss: (.epss | tonumber)}' "${WORK}/epss-${i}.json" >> "${WORK}/epss.jsonl"
    else
      EPSS_OK=0
      break
    fi
  done
fi
jq -s 'map({key: .cve, value: .epss}) | from_entries' "${WORK}/epss.jsonl" > "${WORK}/epss.json"

# ── The table, most urgent first ─────────────────────────────────────────────
jq -s -r --slurpfile kev "${WORK}/kev.json" --slurpfile epss "${WORK}/epss.json" \
   --argjson kev_ok "$KEV_OK" --argjson epss_ok "$EPSS_OK" '
  def exprank: {"public": 3, "origin-only": 2, "internal": 1}[.] // 0;
  def sevrank: {"CRITICAL": 4, "HIGH": 3, "IMPORTANT": 3, "MODERATE": 2, "MEDIUM": 2, "LOW": 1}[.] // 0;
  $kev[0] as $k | $epss[0] as $e
  | group_by([.pkg, .version, .advisory])
  | map(. as $g | $g[0]
        + {cves: ([$g[].cves[]] | unique),
           exposure: ($g | max_by(.exposure | exprank) | .exposure),
           severity: ($g | max_by(.severity | sevrank) | .severity),
           fixed: ([$g[].fixed | select(. != "")] | .[0] // "none listed"),
           source: ([$g[].source] | unique | join(", "))})
  | map(. + {kevrow: ([.cves[] | $k[.] // empty] | .[0]),
             score: ([.cves[] | $e[.] // empty] | max)})
  | sort_by([(if .kevrow then 0 else 1 end), -(.exposure | exprank), -(.score // -1), -(.severity | sevrank), .pkg, .advisory])
  | (["PIN OR PACKAGE", "VERSION", "ADVISORY", "FIXED", "KEV", "EPSS", "EXPOSURE", "SEVERITY", "FOUND IN"] | join("\t")),
    (.[] | [.pkg, .version, .advisory, .fixed,
            (if (.cves | length) == 0 then "-" elif $kev_ok == 0 then "?"
             elif .kevrow then "YES (triage: \(.kevrow.triage), ransomware: \(.kevrow.ransomware))" else "no" end),
            (if (.cves | length) == 0 then "-" elif $epss_ok == 0 then "?"
             elif .score == null then "n/a" else ((.score * 1000 | round) / 1000 | tostring) end),
            .exposure, .severity, .source] | join("\t"))' "$FINDINGS" > "${WORK}/table.tsv"
rows=$(( $(wc -l < "${WORK}/table.tsv") - 1 ))
echo ""
if (( rows > 0 )); then
  column -t -s $'\t' "${WORK}/table.tsv"
else
  echo "No published advisory affects what was checked."
fi

# ── What checked each pin ────────────────────────────────────────────────────
echo ""
echo "Coverage of the pinned tools:"
uncovered=()
while read -r key exposure checks; do
  tool="no"
  for c in $checks; do [[ "$c" == osv:* || "$c" == node || "$c" == host || "$c" == image ]] && tool="yes"; done
  if [[ "$tool" == yes ]]; then
    printf '  %-26s %-12s %s\n' "$key" "$exposure" "${checks//osv:/OSV }"
  elif [[ "$checks" == *rootfs* ]]; then
    printf '  %-26s %-12s %s\n' "$key" "$exposure" "only its bundled libraries are scanned; the tool itself is not covered by an advisory database; the skill reads the vendor page"
    uncovered+=("$key")
  else
    printf '  %-26s %-12s %s\n' "$key" "$exposure" "not covered by an advisory database; the skill reads the vendor page"
    uncovered+=("$key")
  fi
done <<< "$PIN_TABLE"
if (( ${#uncovered[@]} )); then
  cr_unproved "the tools no advisory database covers: ${uncovered[*]} (the vendor pages)"
fi

if (( ${#CHECKED[@]} == 0 )); then
  cr_unproved "anything at all: no scan or feed could be read"
elif (( rows == 0 )); then
  cr_proved "no published advisory affects what was checked: $(IFS=';'; echo "${CHECKED[*]}" | sed 's/;/; /g')"
else
  cr_proved "${rows} finding(s) ranked above, from what was checked: $(IFS=';'; echo "${CHECKED[*]}" | sed 's/;/; /g')"
fi
cr_finish
