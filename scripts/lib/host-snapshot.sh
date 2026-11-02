# shellcheck shell=bash
#
# scripts/lib/host-snapshot.sh -- the two recovery points a host change takes
# before it touches a live host: a manual Lightsail instance snapshot, which is
# the way back to the whole host as it was, and the newest database backup in the
# snapshots bucket, which is how a run proves the last write landed off the host.
#
# Sourced, never run. Shared by scripts/bootstrap-host.sh (before it replaces an
# instance) and scripts/step-amazon-linux.sh (before it steps production's
# release), so the two take and judge a snapshot the same way. Every function
# takes the AWS CLI to call as its first argument, so each caller keeps its own
# announced test seam. Nothing here exits: each function returns non-zero and
# leaves the reason in HS_ERROR, and the caller decides what a failure means.

# host_newest_backup <aws> <bucket>
# Sets HS_NEWEST_BACKUP to the LastModified time of the newest routine backup
# object written today or yesterday (UTC), empty when there is none. Returns 1
# when the bucket could not be listed, which is not the same as no backup.
host_newest_backup() {
  local aws="$1" bucket="$2" day newest
  HS_NEWEST_BACKUP=""
  HS_ERROR=""
  for day in "$(date -u +%Y/%m/%d)" "$(date -u -d '1 day ago' +%Y/%m/%d)"; do
    # Every time, sorted here: an empty prefix has no Contents, which a projection
    # reads as None where a function over it would fail the whole call. The ISO
    # timestamps the listing returns sort as text.
    newest="$("$aws" s3api list-objects-v2 --bucket "$bucket" --prefix "routine/${day}/" \
      --query 'Contents[].LastModified' --output text </dev/null 2>&1)" || {
      HS_ERROR="could not list ${bucket}: ${newest##*$'\n'}"
      return 1
    }
    newest="$(tr -s '[:space:]' '\n' <<< "$newest" | grep -v -e '^$' -e '^None$' | sort | tail -1 || true)"
    if [[ -n "$newest" ]]; then
      HS_NEWEST_BACKUP="$newest"
      return 0
    fi
  done
  return 0
}

# host_snapshot_recent <aws> <instance> <prefix> <after-epoch> <within-secs>
# Sets HS_NAME and HS_STATE to the newest snapshot of the instance whose name
# starts with the prefix, taken after the epoch (the instance's own creation, so a
# snapshot of an earlier instance under the same name is never reused) and within
# the last <within-secs>, complete or still being taken. Both empty when there is
# none. A run declined at the prompt, or re-run while a slow snapshot is still
# being taken, then waits on the one already started instead of starting another.
host_snapshot_recent() {
  local aws="$1" instance="$2" prefix="$3" after="$4" within="$5"
  local existing s_name s_created s_state s_epoch best=0 now
  HS_NAME=""
  HS_STATE=""
  HS_ERROR=""
  existing="$("$aws" lightsail get-instance-snapshots --region us-east-1 \
      --query "instanceSnapshots[?fromInstanceName=='${instance}' && starts_with(name, '${prefix}') && (state=='available' || state=='pending')].[name,createdAt,state]" \
      --output text </dev/null 2>&1)" || {
    HS_ERROR="could not list the snapshots of ${instance}: ${existing##*$'\n'}"
    return 1
  }
  now="$(date -u +%s)"
  while IFS=$'\t' read -r s_name s_created s_state; do
    [[ -n "$s_name" ]] || continue
    s_epoch="$(date -u -d "$s_created" +%s 2>/dev/null)" || continue
    if (( s_epoch > after && s_epoch > best && now - s_epoch < within )); then
      HS_NAME="$s_name"; HS_STATE="$s_state"; best="$s_epoch"
    fi
  done <<< "$existing"
  return 0
}

# host_snapshot_create <aws> <instance> <name>
host_snapshot_create() {
  local aws="$1" instance="$2" name="$3" out
  HS_ERROR=""
  out="$("$aws" lightsail create-instance-snapshot --region us-east-1 \
      --instance-name "$instance" --instance-snapshot-name "$name" </dev/null 2>&1)" || {
    HS_ERROR="Lightsail refused the snapshot ${name}: ${out##*$'\n'}"
    return 1
  }
  return 0
}

# host_snapshot_wait <aws> <name> <usable-secs> <poll-secs>
# Polls the snapshot until it is complete, failed, or older than <usable-secs>,
# whichever comes first. Sets HS_STATE and HS_AGE (seconds since it was started).
# Returns 0 only for a complete snapshot younger than <usable-secs>.
host_snapshot_wait() {
  local aws="$1" name="$2" usable="$3" poll="$4" row created created_epoch
  HS_STATE=""
  HS_AGE=0
  HS_ERROR=""
  while :; do
    row="$("$aws" lightsail get-instance-snapshot --region us-east-1 \
        --instance-snapshot-name "$name" --query 'instanceSnapshot.[state,createdAt]' --output text </dev/null 2>&1)" || {
      HS_ERROR="could not read snapshot ${name}: ${row##*$'\n'}"
      return 1
    }
    IFS=$'\t' read -r HS_STATE created <<< "$row"
    if [[ -z "${created:-}" ]] || ! created_epoch="$(date -u -d "$created" +%s 2>/dev/null)"; then
      HS_ERROR="snapshot ${name} reports no readable creation time ('${row}')"
      return 1
    fi
    HS_AGE=$(( $(date -u +%s) - created_epoch ))
    [[ "$HS_STATE" == "available" || "$HS_STATE" == "error" ]] && break
    (( HS_AGE < usable )) || break
    sleep "$poll"
  done
  if [[ "$HS_STATE" != "available" ]]; then
    HS_ERROR="snapshot ${name} is '${HS_STATE:-unknown}', not complete, after $(( HS_AGE / 60 )) minutes; it is left as it is"
    return 1
  fi
  if (( HS_AGE >= usable )); then
    HS_ERROR="snapshot ${name} is $(( HS_AGE / 60 )) minutes old, past the $(( usable / 60 ))-minute limit; a re-run takes a fresh one"
    return 1
  fi
  return 0
}
