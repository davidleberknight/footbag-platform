#!/usr/bin/env bash
# Remote half of install-host-credentials.sh. Never run directly: it expects
# the variable assignments its wrapper emits ahead of this body on the same
# stdin stream, and it runs as root because the wrapper pipes it into sudo.
#
# Installs the source-profile access key and the runtime profile that let the
# application reach AWS. The chain is deliberate: the long-lived key can do
# exactly one thing, assume the runtime role, and everything the application
# actually does happens under short-lived credentials from that role.
#
# The credential files stay owned by root and become readable by a dedicated
# group the containers join, rather than being handed to the service account.
# The containers run unprivileged and cannot read root's files by ownership,
# and giving them ownership would let a compromised container rewrite the
# credentials it authenticates with.
#
# The logs-publisher profile is deliberately NOT written here: the deploy owns
# that stanza and appends it itself, so two writers can never disagree.

set -euo pipefail

: "${AKID:?remote half requires AKID}"
: "${SAK:?remote half requires SAK}"
: "${ACCOUNT_ID:?remote half requires ACCOUNT_ID}"
: "${TARGET_ENV:?remote half requires TARGET_ENV}"
: "${AWS_REGION_VAL:?remote half requires AWS_REGION_VAL}"

SOURCE_PROFILE="footbag-${TARGET_ENV}-source-profile"
RUNTIME_PROFILE="footbag-${TARGET_ENV}-runtime"
RUNTIME_ROLE="arn:aws:iam::${ACCOUNT_ID}:role/footbag-${TARGET_ENV}-app-runtime"

AWSCREDS_GROUP=awscreds
AWSCREDS_GID=1500

if ! getent group "$AWSCREDS_GROUP" >/dev/null 2>&1; then
  echo "    Creating group $AWSCREDS_GROUP (gid $AWSCREDS_GID)"
  groupadd --gid "$AWSCREDS_GID" "$AWSCREDS_GROUP"
fi
# A pre-existing group of this name with a different id would leave the
# containers' supplementary group pointing at the wrong thing, and the failure
# would look like unreadable credentials rather than a numbering mismatch.
_actual_gid="$(getent group "$AWSCREDS_GROUP" | cut -d: -f3)"
if [[ "$_actual_gid" != "$AWSCREDS_GID" ]]; then
  echo "ERROR: group $AWSCREDS_GROUP has gid $_actual_gid, expected $AWSCREDS_GID." >&2
  echo "       The compose files add the containers to gid $AWSCREDS_GID; reconcile before continuing." >&2
  exit 1
fi

install -d -m 0750 -o root -g "$AWSCREDS_GROUP" /root/.aws
umask 077

# Written whole rather than appended: a partially-updated credential file
# authenticates as nothing and is harder to diagnose than a wrong one.
_cred_tmp=$(mktemp)
_conf_tmp=$(mktemp)
trap 'shred -u "$_cred_tmp" "$_conf_tmp" 2>/dev/null || rm -f "$_cred_tmp" "$_conf_tmp"' EXIT

cat > "$_cred_tmp" <<EOF
[${SOURCE_PROFILE}]
aws_access_key_id = ${AKID}
aws_secret_access_key = ${SAK}
EOF

cat > "$_conf_tmp" <<EOF
[profile ${SOURCE_PROFILE}]
region = ${AWS_REGION_VAL}

[profile ${RUNTIME_PROFILE}]
role_arn = ${RUNTIME_ROLE}
source_profile = ${SOURCE_PROFILE}
region = ${AWS_REGION_VAL}
EOF

install -m 0640 -o root -g "$AWSCREDS_GROUP" "$_cred_tmp" /root/.aws/credentials
install -m 0640 -o root -g "$AWSCREDS_GROUP" "$_conf_tmp" /root/.aws/config

echo "    Installed /root/.aws/credentials and /root/.aws/config"

# Prove the chain rather than assume it. A key that authenticates but cannot
# assume the role fails later, inside the application, as an opaque denial.
echo -n "    source profile resolves as: "
aws sts get-caller-identity --profile "$SOURCE_PROFILE" --query Arn --output text

echo -n "    runtime profile resolves as: "
aws sts get-caller-identity --profile "$RUNTIME_PROFILE" --query Arn --output text

# The deploy reads this marker to confirm the environment is pre-live before it
# will replace a database, and refuses on an unreadable one exactly as on a live
# one. Reading it here turns "the deploy mysteriously refused" into a check that
# passes or fails at the moment the credentials are installed.
echo -n "    go-live marker reads: "
AWS_PROFILE="$RUNTIME_PROFILE" aws ssm get-parameter \
  --name "/footbag/${TARGET_ENV}/app/production_live" \
  --region "$AWS_REGION_VAL" \
  --query Parameter.Value --output text 2>/dev/null || echo "(absent; expected only where the environment has no go-live marker)"
