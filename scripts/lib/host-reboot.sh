# shellcheck shell=bash
#
# scripts/lib/host-reboot.sh -- reboot a host and wait until it is back.
#
# Sourced, never run. Shared by scripts/bootstrap-host.sh and
# scripts/step-amazon-linux.sh, so a reboot is scheduled and proved the same way
# wherever a host needs one. The remote half,
# scripts/internal/bootstrap-host-reboot-remote.sh, schedules the reboot a few
# seconds out and prints the boot id first; a host answering with the same boot
# id has not rebooted, whatever else it says, so the new boot id is the proof.
#
# Needs from the caller: SUDO_PASS, HOST_SSH_BIN and HOST_SSH_OPTS, as
# scripts/lib/host-env-remote.sh sets them. Nothing here exits: a failure returns
# non-zero with the reason in HR_ERROR.

# host_reboot_and_wait <alias> <reboot-half> <poll-secs> <tries>
# Sets HR_OLD_BOOT_ID and HR_BOOT_ID. Returns 0 once the host answers over ssh
# with a boot id different from the one it had before.
host_reboot_and_wait() {
  local alias="$1" half="$2" poll="$3" tries="$4" stream i
  HR_OLD_BOOT_ID=""
  HR_BOOT_ID=""
  HR_ERROR=""
  stream="$(
    {
      printf '%s\n' "$SUDO_PASS"
      cat "$half"
    } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$alias" 'sudo -k -S -p "" bash -s footbag-reboot' 2>&1
  )" || {
    HR_ERROR="could not schedule the reboot of ${alias}: ${stream##*$'\n'}"
    return 1
  }
  HR_OLD_BOOT_ID="$(grep -A1 -e '^---FOOTBAG-BOOT-ID---$' <<< "$stream" | tail -1)"
  if [[ -z "$HR_OLD_BOOT_ID" || "$HR_OLD_BOOT_ID" == "---FOOTBAG-BOOT-ID---" ]]; then
    HR_ERROR="${alias} did not report its boot id before the reboot"
    return 1
  fi
  for (( i = 1; i <= tries; i++ )); do
    sleep "$poll"
    # A host mid-reboot refuses the connection; that is the expected answer until
    # it is back, so the attempt's failure is the loop's condition, not an error.
    if HR_BOOT_ID="$("$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$alias" 'cat /proc/sys/kernel/random/boot_id' </dev/null 2>/dev/null)" \
        && [[ -n "$HR_BOOT_ID" && "$HR_BOOT_ID" != "$HR_OLD_BOOT_ID" ]]; then
      return 0
    fi
  done
  HR_ERROR="${alias} has not come back with a new boot id after $(( poll * tries ))s"
  return 1
}
