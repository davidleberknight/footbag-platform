# shellcheck shell=bash
#
# The one place in the tree that calls Lightsail's GetInstanceAccessDetails.
#
# That call is the host break-glass: it returns a short-lived certificate and
# private key for the instance's default account, which has passwordless sudo.
# It is also the only Lightsail call that returns an instance's host keys, so a
# script that needs a host key from an authenticated source has to make it. The
# production break-glass alarm fires on every such call, allowed or denied, so
# each one has to be attributable to the script that made it.
#
# Three properties every mint here has, which is why no other file makes the
# call:
#
#   - It carries an application id in its user agent (AWS_SDK_UA_APP_ID, set for
#     this one call), naming the script that minted. The audit trail records the
#     user agent, which is how scripts/list-host-access-mints.sh tells a known
#     script's mint from one nothing claims.
#   - The response is written straight to a file created under umask 077, never
#     to stdout. It holds a private key that opens a root shell; stdout may be a
#     wrapper's log, a CI job or an agent session.
#   - It refuses while the AWS CLI's own history is on. That history stores the
#     request and the response, so it would keep a copy of the private key in a
#     database on disk that nothing here shreds.
#
# The ids a caller may pass are listed in HOST_ACCESS_MINT_APP_IDS. An id outside
# the list is refused, because a mint the listing cannot attribute is exactly
# the event the alarm asks a person to investigate.

HOST_ACCESS_MINT_APP_IDS=(
  footbag-host-break-glass
  footbag-install-known-hosts
  footbag-restore-host
)

# host_access_mint <aws-bin> <app-id> <instance> <out-file>
# Mints access details for <instance> in us-east-1 and writes the JSON response
# to <out-file>, which must not exist yet: it is created here under umask 077 so
# the key never sits in a file another account can read, even briefly. Returns 1
# having said why on stderr, with <out-file> removed. The caller owns shredding
# the file once it has read what it needs.
host_access_mint() {
  local aws_bin="$1" app_id="$2" instance="$3" out_file="$4"
  local known=0 id history history_rc

  if [[ -z "$aws_bin" || -z "$app_id" || -z "$instance" || -z "$out_file" ]]; then
    echo "ERROR: host_access_mint needs the AWS binary, an application id, an instance and an output file." >&2
    return 1
  fi
  for id in "${HOST_ACCESS_MINT_APP_IDS[@]}"; do
    [[ "$id" == "$app_id" ]] && known=1
  done
  if (( known != 1 )); then
    echo "ERROR: '${app_id}' is not a known host-access application id; refusing to mint a" >&2
    echo "       certificate the mint listing could not attribute." >&2
    return 1
  fi
  if [[ -e "$out_file" ]]; then
    echo "ERROR: ${out_file} already exists; the mint writes only to a file it creates itself." >&2
    return 1
  fi

  # `aws configure get` exits 1 with no output when the setting is absent, which
  # is the safe state. Any other failure is an error rather than "absent", and
  # any value but "disabled" is refused: the safe values are named, not the
  # unsafe one.
  history_rc=0
  history="$("$aws_bin" configure get cli_history 2>/dev/null)" || history_rc=$?
  if (( history_rc == 1 )) && [[ -z "$history" ]]; then
    :
  elif (( history_rc == 0 )) && [[ "$history" == "disabled" ]]; then
    :
  else
    echo "ERROR: the AWS CLI history setting reads '${history}' (exit ${history_rc}). The history" >&2
    echo "       database stores each response, so it would keep the minted private key on disk." >&2
    echo "       Turn it off first: aws configure set cli_history disabled" >&2
    return 1
  fi

  # stderr carries only the CLI's error text, never the response, so it is
  # captured and reported; the response goes to the file alone.
  local mint_err
  if ! mint_err="$( umask 077
         AWS_SDK_UA_APP_ID="$app_id" "$aws_bin" lightsail get-instance-access-details \
           --region us-east-1 --instance-name "$instance" --protocol ssh \
           --output json 2>&1 >"$out_file" )"; then
    rm -f "$out_file"
    echo "ERROR: Lightsail refused to mint access details for ${instance}: ${mint_err}" >&2
    return 1
  fi
  if [[ ! -s "$out_file" ]]; then
    rm -f "$out_file"
    echo "ERROR: Lightsail returned an empty response for ${instance}." >&2
    return 1
  fi
  return 0
}
