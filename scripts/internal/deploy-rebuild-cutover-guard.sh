#!/usr/bin/env bash
# Post-cutover refusal for the destructive database-replacing deploy.
#
# At cutover the live database becomes the single source of truth for content
# (freestyle content is edited in the running application from then on), and the
# operator records that fact by appending FOOTBAG_CUTOVER_COMPLETE=1 to
# /srv/footbag/env on the host. From that point a database-replacing deploy
# would silently destroy live edits, so this guard refuses it.
#
# Invocation: prepended by scripts/deploy-rebuild.sh into the root ssh stream,
# ahead of the remote half, so it runs on the host as root BEFORE any live
# mutation (database replace, env edits, media wipe, service stop); its non-zero
# exit aborts the whole remote body. It also runs standalone for its tests,
# which point ENV_PATH at a fixture file.
#
# Rules:
#   - env file missing            -> allowed (the first-bootstrap deploy runs
#                                    before any env file exists)
#   - marker line absent          -> allowed (pre-cutover host)
#   - FOOTBAG_CUTOVER_COMPLETE=1  -> refused, no bypass flag
#
# There is deliberately no in-band override. An operator who must rebuild a
# post-cutover host (disaster reconstruction) first removes the marker line as
# root on the host: a two-step, out-of-band act.

CUTOVER_GUARD_ENV_PATH="${ENV_PATH:-/srv/footbag/env}"

if [[ -f "$CUTOVER_GUARD_ENV_PATH" ]] \
  && grep -qxF 'FOOTBAG_CUTOVER_COMPLETE=1' "$CUTOVER_GUARD_ENV_PATH"; then
  echo "ERROR: refusing the database-replacing deploy: this host is post-cutover." >&2
  echo "       $CUTOVER_GUARD_ENV_PATH carries FOOTBAG_CUTOVER_COMPLETE=1, meaning the live" >&2
  echo "       database became the source of truth at cutover and a rebuild deploy" >&2
  echo "       would destroy live content edits. Use scripts/deploy-code.sh for" >&2
  echo "       code deploys. There is no bypass flag; a disaster rebuild requires" >&2
  echo "       deliberately removing the marker line as root on the host first." >&2
  exit 1
fi
