#!/usr/bin/env bash
# Root-side body of scripts/provision-operator-account.sh.
#
# Invoked via:
#   { printf '%s\n' "$SUDO_PASS";
#     printf 'OPACC_MODE=%q\n' "$MODE";
#     printf 'OPACC_ACCOUNT=%q\n' "$ACCOUNT";
#     printf 'OPACC_OPERATOR=%q\n' "$OPERATOR";
#     printf 'OPACC_KEY_LINE=%q\n' "$KEY_LINE";
#     printf 'OPACC_PASSWORD=%q\n' "$NEW_PASS";
#     cat scripts/internal/provision-operator-account-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash'
#
# (sudo -S consumes the password line; bash inherits the rest, binds the
# assignments, and runs this body as root. Nothing secret reaches argv.)
#
# Required shell variables (provided by the caller's prepended assignments):
#   OPACC_MODE          create | rotate | remove | offboard | inspect
#   OPACC_ACCOUNT       the Linux account name
#   OPACC_OPERATOR      who it belongs to, for the comment field
#   OPACC_KEY_LINE      their SSH public key line (create and rotate)
#   OPACC_PASSWORD      the sudo password to set (create and rotate). Empty when
#                       OPACC_SET_PASSWORD is no.
#   OPACC_SET_PASSWORD  yes | no. No is the key-only rotation: reinstall the key
#                       and leave the existing password untouched. The caller
#                       sends the decision rather than this half inferring it
#                       from an empty password, which would make an accidental
#                       empty value look like a deliberate choice.
#   OPACC_SHARED_ACCOUNT  the shared break-glass account's name (create, rotate
#                       and offboard). Sent rather than assumed, and a run that
#                       needs it and did not receive it refuses: the checks that
#                       read it are what keep a named account's key off that
#                       account, and a missing name would pass them silently.
#   OPACC_REOPEN        yes | no (rotate only). Yes reopens an account an
#                       offboard retired, for the same person under the same
#                       name: login shell and expiry restored, and a key it was
#                       retired with refused.

set -euo pipefail

: "${OPACC_MODE:?missing OPACC_MODE variable in pipe}"
: "${OPACC_ACCOUNT:?missing OPACC_ACCOUNT variable in pipe}"
OPACC_OPERATOR="${OPACC_OPERATOR:-}"
OPACC_KEY_LINE="${OPACC_KEY_LINE:-}"
OPACC_PASSWORD="${OPACC_PASSWORD:-}"
OPACC_SHARED_ACCOUNT="${OPACC_SHARED_ACCOUNT:-}"

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: this body must run as root; it is reached through sudo -S." >&2
  exit 1
fi

OPACC_TMPS=()
opacc_cleanup() {
  local t
  for t in ${OPACC_TMPS[@]+"${OPACC_TMPS[@]}"}; do
    [[ -e "$t" ]] || continue
    shred -u "$t" 2>/dev/null || rm -f "$t"
  done
  return 0
}
trap opacc_cleanup EXIT INT TERM

# Write stdin to a destination through a restricted temp file, then promote it
# with `install`. The temp file is created restricted rather than fixed up
# afterwards, and it is trapped in the same breath: one of these calls carries a
# key file, and an `install` that failed on a full filesystem, or a signal
# between the write and the promote, would otherwise leave it in /tmp.
install_via_tmp() {
  local dest="$1" mode="$2" owner="$3" group="$4" tmp
  tmp=$(umask 077 && mktemp)
  OPACC_TMPS+=("$tmp")
  cat > "$tmp"
  install -m "$mode" -o "$owner" -g "$group" "$tmp" "$dest"
  shred -u "$tmp" 2>/dev/null || rm -f "$tmp"
}

# The fingerprints the shared account authorizes, one per line, or nothing when
# it has no key file. Read from the host rather than from any list, because the
# host is where a key either admits somebody or does not.
opacc_shared_fingerprints() {
  local home
  home="$(getent passwd "$OPACC_SHARED_ACCOUNT" 2>/dev/null | cut -d: -f6 || true)"
  [[ -n "$home" && -f "${home}/.ssh/authorized_keys" ]] || return 0
  ssh-keygen -l -f "${home}/.ssh/authorized_keys" 2>/dev/null | awk '{print $2}' || true
}

# The shared account's name is what both key checks below read. Without it they
# would compare against nothing and pass, so a run that needs them refuses.
opacc_require_shared_account() {
  if [[ -z "$OPACC_SHARED_ACCOUNT" ]]; then
    echo "REFUSING: the shared account's name did not arrive with this run, so" >&2
    echo "       whether ${OPACC_ACCOUNT}'s key is also on it cannot be checked." >&2
    echo "       Nothing done." >&2
    exit 1
  fi
}

# ── remove ───────────────────────────────────────────────────────────────────
#
# Reached only from the caller's rollback path, which runs it exclusively for an
# account that same run created and that nothing outside has recorded yet.
if [[ "$OPACC_MODE" == "remove" ]]; then
  if ! id -u -- "$OPACC_ACCOUNT" >/dev/null 2>&1; then
    echo "  ${OPACC_ACCOUNT} does not exist; nothing to remove."
    exit 0
  fi
  pkill -KILL -u "$OPACC_ACCOUNT" 2>/dev/null || true
  userdel -r -- "$OPACC_ACCOUNT"
  echo "  Removed ${OPACC_ACCOUNT} and its home directory."
  exit 0
fi

# ── inspect ──────────────────────────────────────────────────────────────────
#
# Read-only. What an existing account accepts and whether it was retired, so the
# operator can see an account no key on their machine reaches before confirming
# it is their own. One line per fact, for the caller to read:
#   SHELL <login shell>
#   PASSWORD <field two of passwd -S>
#   OFFBOARDED yes|no     keys moved aside by an offboard
#   KEY <ssh-keygen -l line>, one per authorized key
if [[ "$OPACC_MODE" == "inspect" ]]; then
  if ! id -u -- "$OPACC_ACCOUNT" >/dev/null 2>&1; then
    echo "ERROR: ${OPACC_ACCOUNT} does not exist." >&2
    exit 1
  fi
  inspect_home="$(getent passwd "$OPACC_ACCOUNT" | cut -d: -f6)"
  echo "SHELL $(getent passwd "$OPACC_ACCOUNT" | cut -d: -f7)"
  echo "PASSWORD $(passwd -S -- "$OPACC_ACCOUNT" 2>/dev/null | cut -d' ' -f2 || echo '?')"
  if compgen -G "${inspect_home}/.ssh/authorized_keys.offboarded-*" >/dev/null; then
    echo "OFFBOARDED yes"
  else
    echo "OFFBOARDED no"
  fi
  if [[ -f "${inspect_home}/.ssh/authorized_keys" ]]; then
    while IFS= read -r inspect_line; do
      [[ -n "$inspect_line" ]] && echo "KEY ${inspect_line}"
    done < <(ssh-keygen -l -f "${inspect_home}/.ssh/authorized_keys" 2>/dev/null || true)
  fi
  # The keys an offboard moved aside, so the operator reopening a retired account
  # can see what it was retired with.
  for inspect_retired in "${inspect_home}"/.ssh/authorized_keys.offboarded-*; do
    [[ -f "$inspect_retired" ]] || continue
    while IFS= read -r inspect_line; do
      [[ -n "$inspect_line" ]] && echo "RETIRED ${inspect_line}"
    done < <(ssh-keygen -l -f "$inspect_retired" 2>/dev/null || true)
  done
  exit 0
fi

# ── Which group carries sudo on this host ────────────────────────────────────
#
# Detected rather than assumed. Amazon Linux uses wheel and Debian-family images
# use sudo, and adding an account to a group that does not exist fails loudly
# while adding it to the wrong existing one fails silently: the login works and
# the first sudo does not, days later, in the middle of a deploy.
#
# Hoisted above the offboard block below, which counts who else still holds sudo
# before it disables anybody.
SUDO_GROUP=""
for candidate in wheel sudo; do
  if getent group "$candidate" >/dev/null 2>&1; then
    SUDO_GROUP="$candidate"
    break
  fi
done
if [[ -z "$SUDO_GROUP" ]]; then
  echo "ERROR: neither 'wheel' nor 'sudo' exists as a group on this host, so" >&2
  echo "       there is no way to grant sudo by group membership. Nothing done." >&2
  exit 1
fi

# ── offboard ─────────────────────────────────────────────────────────────────
#
# Not `remove`. That mode deletes the account and its home, and exists only for
# the caller's rollback of an account it created seconds earlier and that nothing
# outside has recorded yet. Offboarding a real operator is a different act with a
# different correct answer: the person's access ends, and their home directory,
# their shell history and the file ownership on anything they left behind stay,
# because that is what an incident review reads and deleting it answers no
# question anybody will ask.
#
# So this disables rather than deletes, and proves the disabling rather than
# reporting that the commands ran.
if [[ "$OPACC_MODE" == "offboard" ]]; then
  if ! id -u -- "$OPACC_ACCOUNT" >/dev/null 2>&1; then
    echo "  ${OPACC_ACCOUNT} does not exist on this host; nothing to offboard."
    exit 0
  fi

  # The account the run itself arrived on. Disabling it mid-session locks the
  # operator out of the host they are holding, and the next command fails with a
  # broken pipe rather than a reason.
  if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" == "$OPACC_ACCOUNT" ]]; then
    echo "REFUSING: this run is connected as ${OPACC_ACCOUNT}." >&2
    echo "       Offboarding the account you are using locks you out part-way" >&2
    echo "       through, with the rest of the run failing for a reason nothing" >&2
    echo "       reports. Run it from another operator's account." >&2
    exit 1
  fi

  home_dir="$(getent passwd "$OPACC_ACCOUNT" | cut -d: -f6)"
  ak="${home_dir}/.ssh/authorized_keys"

  # Their fingerprints, gathered first, because both the count below and the
  # sweep further down depend on knowing which keys are theirs, and the
  # account's own key files are the only place on this host that records it.
  # The live file is read, and so is any copy an earlier run moved aside: a run
  # that stopped after moving the file and is now being resumed would otherwise
  # find nothing, sweep nothing, and report that the person holds no key
  # anywhere while their key still sits on the shared account.
  OPACC_THEIR_FPS=""
  for key_source in "$ak" "${ak}".offboarded-*; do
    [[ -f "$key_source" ]] || continue
    OPACC_THEIR_FPS+="$(ssh-keygen -l -f "$key_source" 2>/dev/null | awk '{print $2}' || true)"$'\n'
  done
  OPACC_THEIR_FPS="$(printf '%s' "$OPACC_THEIR_FPS" | sed '/^$/d' | sort -u)"

  # Every named account is created with a key, so an account with no key file
  # at all, live or moved aside, has had it removed by some other route. Which
  # keys were theirs is then unknown, the sweep cannot run, and a copy loaned
  # to another account would survive a run that reported success.
  if [[ -z "$OPACC_THEIR_FPS" ]]; then
    echo "REFUSING: no key of ${OPACC_ACCOUNT}'s can be found on this host, in" >&2
    echo "       ${ak} or in a copy of it moved aside, so which" >&2
    echo "       keys were theirs is unknown and no account can be swept of them." >&2
    echo "       List every authorized key with the host-access diagnostic and" >&2
    echo "       remove theirs by hand before recording this departure. Nothing done." >&2
    exit 1
  fi

  # The sweep below removes these fingerprints from every account, the shared
  # one included. Where one of them is also the key a footbag-operator holder
  # reaches the shared account with, the sweep would end that holder's own way
  # in, and the count further down would not notice while anybody else's key is
  # still there. So a retiring key found on the shared account stops the run
  # before anything changes, and the operator decides which case it is.
  if [[ "$OPACC_ACCOUNT" != "$OPACC_SHARED_ACCOUNT" ]]; then
    opacc_require_shared_account
    opacc_shared_fps="$(opacc_shared_fingerprints)"
    opacc_overlap=""
    while IFS= read -r their_fp; do
      [[ -z "$their_fp" ]] && continue
      if printf '%s\n' "$opacc_shared_fps" | grep -qxF -- "$their_fp"; then
        opacc_overlap+="${their_fp}"$'\n'
      fi
    done <<< "$OPACC_THEIR_FPS"
    if [[ -n "$opacc_overlap" ]]; then
      echo "REFUSING: a key on ${OPACC_ACCOUNT} is also authorized on the shared" >&2
      echo "       account ${OPACC_SHARED_ACCOUNT}:" >&2
      printf '         %s\n' $opacc_overlap >&2
      echo "       Offboarding sweeps it off every account, ${OPACC_SHARED_ACCOUNT}" >&2
      echo "       included, so whoever reaches ${OPACC_SHARED_ACCOUNT} with it would" >&2
      echo "       lose that way in too. Resolve it first, then re-run:" >&2
      echo "         - a footbag-operator holder's own key: give ${OPACC_ACCOUNT} a key" >&2
      echo "           pair of its own with provision-operator-account.sh --rotate --key-only," >&2
      echo "           run from a workstation whose alias connects as ${OPACC_SHARED_ACCOUNT}" >&2
      echo "         - a key that never belonged on ${OPACC_SHARED_ACCOUNT}: remove it from" >&2
      echo "           there deliberately with authorize-operator-key.sh --remove" >&2
      echo "       Nothing done." >&2
      exit 1
    fi
  fi

  # Somebody has to be left who can still reach this host with sudo. Counted
  # from the group's real membership, primary group included, because a member
  # whose primary group is the sudo group does not appear in the group line.
  # A shell and a sudo grant are not access, and counting them as access is how
  # this refusal passes while the danger it names is real. sshd here accepts
  # public keys only, so an account is reachable only through a key it
  # authorizes; and reaching it is no use without a password sudo will take.
  #
  # The keys are counted, not the file: an account whose only authorized key is
  # the departing person's own is about to lose it to the sweep below, so it
  # admits nobody once this run finishes. The shared account holding nothing but
  # a key loaned to the person leaving is exactly that account, and counting it
  # would sweep the last working login off the host while reporting success.
  remaining=0
  while IFS=: read -r name _ _ gid _ home shell; do
    [[ "$name" == "$OPACC_ACCOUNT" ]] && continue
    case "$shell" in */nologin|*/false|"") continue ;; esac
    id -nG "$name" 2>/dev/null | tr ' ' '\n' | grep -qx -- "$SUDO_GROUP" || continue
    [[ -n "$home" && -s "${home}/.ssh/authorized_keys" ]] || continue
    kept_key=0
    while IFS= read -r candidate_fp; do
      [[ -z "$candidate_fp" ]] && continue
      if ! printf '%s\n' "$OPACC_THEIR_FPS" | grep -qx -- "$candidate_fp"; then
        kept_key=1
        break
      fi
    done < <(ssh-keygen -l -f "${home}/.ssh/authorized_keys" 2>/dev/null | awk '{print $2}' || true)
    (( kept_key )) || continue
    # Field two of passwd -S is the status: P or PS a usable password, L or LK
    # locked, NP none at all. The two spellings are Debian's and the Red Hat
    # family's for the same three states.
    case "$(passwd -S -- "$name" 2>/dev/null | awk '{print $2}')" in
      P|PS) ;;
      *) continue ;;
    esac
    remaining=$(( remaining + 1 ))
    : "$gid"
  done < <(getent passwd)

  if (( remaining < 1 )); then
    echo "REFUSING: ${OPACC_ACCOUNT} is the last account on this host that can" >&2
    echo "       log in and use sudo. Disabling it leaves nobody able to" >&2
    echo "       administer the host over SSH, leaving only the Lightsail access" >&2
    echo "       path, which is the way back in and not a way to work. Provision" >&2
    echo "       the replacement operator first. Nothing done." >&2
    exit 1
  fi

  echo "  ${remaining} other account(s) can still reach this host and use sudo."

  # Four independent locks, because each closes a different door and any one of
  # them alone leaves a way in. The password lock does nothing against a key;
  # removing the key does nothing against a password; the shell change does
  # nothing against a forced command; and the expiry closes them all but is the
  # one an administrator most often undoes by accident.
  usermod -L -- "$OPACC_ACCOUNT" || true
  usermod -s /sbin/nologin -- "$OPACC_ACCOUNT" 2>/dev/null \
    || usermod -s /usr/sbin/nologin -- "$OPACC_ACCOUNT" 2>/dev/null \
    || true
  chage -E 0 -- "$OPACC_ACCOUNT" || true
  # The sudo grant is ended as well as the login. A locked, expired account
  # cannot use it today, but a grant left in place is one that comes back the
  # moment anybody unlocks the account, and ending every access the person held
  # is what an offboarding is.
  # The docker group is the same kind of grant by another door: creation adds
  # the account to it, and membership reaches root through the daemon.
  OPACC_PRIVILEGED_GROUPS=("$SUDO_GROUP")
  getent group docker >/dev/null 2>&1 && OPACC_PRIVILEGED_GROUPS+=(docker)
  for priv_group in "${OPACC_PRIVILEGED_GROUPS[@]}"; do
    if id -nG "$OPACC_ACCOUNT" 2>/dev/null | tr ' ' '\n' | grep -qx -- "$priv_group"; then
      gpasswd -d "$OPACC_ACCOUNT" "$priv_group" >/dev/null || true
    fi
  done

  if [[ -f "$ak" ]]; then
    # Moved aside rather than deleted: which key had access is part of the
    # record, and it is the only copy on this host.
    mv -- "$ak" "${ak}.offboarded-$(date -u +%Y%m%d)"
    chmod 600 -- "${ak}.offboarded-$(date -u +%Y%m%d)" 2>/dev/null || true
    echo "  authorized_keys moved aside, not deleted."
  else
    echo "  no authorized_keys to move."
  fi

  # ── Their keys on OTHER accounts ──────────────────────────────────────────
  #
  # Disabling the named account is not the whole of a person's access. An
  # operator who provisions their own account first borrows a shell on the
  # SHARED account, with their key loaned onto it, and a loan nobody withdrew is
  # a different file on a different account, which everything above leaves
  # untouched. A person offboarded with that key still
  # in place keeps a root-capable shell as an account whose sudo password is in
  # the shared vault.
  #
  # The identification problem that made this look hard is not one. A key on the
  # shared account carries no name, but it does not have to: the same key is in
  # the account being offboarded right now, so the host already knows which
  # fingerprints are theirs. They are collected above.
  #
  # Every account is swept rather than just the shared one. A key put somewhere
  # else, for any reason anybody had at the time, is the same standing access and
  # the sweep costs nothing extra.
  OPACC_SWEPT=0
  if [[ -n "$OPACC_THEIR_FPS" ]]; then
    while IFS=: read -r sweep_name _ _ _ _ sweep_home _; do
      [[ "$sweep_name" == "$OPACC_ACCOUNT" ]] && continue
      [[ -z "$sweep_home" || ! -d "$sweep_home" ]] && continue
      sweep_ak="${sweep_home}/.ssh/authorized_keys"
      [[ -f "$sweep_ak" ]] || continue

      sweep_tmp=$(umask 077 && mktemp)
      OPACC_TMPS+=("$sweep_tmp")
      sweep_hit=0
      # Line at a time, matching on fingerprint rather than text, so a key
      # written with a different comment or an options prefix is still found.
      # Comments and blank lines are preserved: one of them may be somebody's
      # note about whose key follows.
      while IFS= read -r sweep_line || [[ -n "$sweep_line" ]]; do
        if [[ -z "${sweep_line// /}" || "${sweep_line#\#}" != "$sweep_line" ]]; then
          printf '%s\n' "$sweep_line" >> "$sweep_tmp"
          continue
        fi
        sweep_fp="$(printf '%s\n' "$sweep_line" \
          | ssh-keygen -l -f /dev/stdin 2>/dev/null | awk '{print $2}' || true)"
        if [[ -n "$sweep_fp" ]] && printf '%s\n' "$OPACC_THEIR_FPS" | grep -qx -- "$sweep_fp"; then
          sweep_hit=1
          echo "  REMOVED their key from ${sweep_name}: ${sweep_fp}"
          continue
        fi
        printf '%s\n' "$sweep_line" >> "$sweep_tmp"
      done < "$sweep_ak"

      if (( sweep_hit )); then
        sweep_owner="$(stat -c '%U' "$sweep_ak")"
        sweep_group="$(stat -c '%G' "$sweep_ak")"
        install -m 600 -o "$sweep_owner" -g "$sweep_group" "$sweep_tmp" "$sweep_ak"
        OPACC_SWEPT=$(( OPACC_SWEPT + 1 ))
      fi
      shred -u "$sweep_tmp" 2>/dev/null || rm -f "$sweep_tmp"
    done < <(getent passwd)
  fi

  if (( OPACC_SWEPT > 0 )); then
    echo "  Swept their keys from ${OPACC_SWEPT} other account(s)."
  else
    echo "  No keys of theirs on any other account."
  fi

  # ── Prove it, rather than trusting four exit statuses ──────────────────────
  offboard_failed=0

  pw_state="$(passwd -S -- "$OPACC_ACCOUNT" 2>/dev/null | awk '{print $2}')"
  case "$pw_state" in
    L|LK) echo "  OK   password locked (${pw_state})" ;;
    *)    echo "  FAIL password state is '${pw_state}', expected locked" >&2; offboard_failed=1 ;;
  esac

  shell_now="$(getent passwd "$OPACC_ACCOUNT" | cut -d: -f7)"
  case "$shell_now" in
    */nologin|*/false) echo "  OK   login shell ${shell_now}" ;;
    *) echo "  FAIL login shell is '${shell_now}', expected a nologin shell" >&2; offboard_failed=1 ;;
  esac

  for priv_group in "${OPACC_PRIVILEGED_GROUPS[@]}"; do
    if id -nG "$OPACC_ACCOUNT" 2>/dev/null | tr ' ' '\n' | grep -qx -- "$priv_group"; then
      echo "  FAIL still a member of ${priv_group}, so that grant stands" >&2
      offboard_failed=1
    else
      echo "  OK   not a member of ${priv_group}"
    fi
  done

  if [[ -e "$ak" ]]; then
    echo "  FAIL ${ak} still exists" >&2
    offboard_failed=1
  else
    echo "  OK   no authorized_keys in place"
  fi

  # LC_ALL=C because this matches chage's English output. Debian-family ssh
  # clients send LANG by default and sudo keeps it, so without this the check
  # fails on a correctly configured account whenever the OPERATOR's locale is
  # not English -- a verification that fails for the wrong reason, on a host
  # that is fine.
  expiry="$(LC_ALL=C chage -l -- "$OPACC_ACCOUNT" 2>/dev/null | sed -n 's/^Account expires[^:]*:[[:space:]]*//p')"
  if [[ -n "$expiry" && "$expiry" != "never" ]]; then
    echo "  OK   account expired (${expiry})"
  else
    echo "  FAIL account expiry is '${expiry:-unset}'" >&2
    offboard_failed=1
  fi

  # The sweep is proved by re-reading every account, not by trusting the writes
  # above. This is the check that decides whether the person still has a shell
  # somewhere, so reporting that the removal ran is not good enough: a failed
  # install would otherwise leave their key in place under a run that said
  # "offboarded".
  if [[ -n "$OPACC_THEIR_FPS" ]]; then
    leftover=0
    while IFS=: read -r check_name _ _ _ _ check_home _; do
      [[ "$check_name" == "$OPACC_ACCOUNT" ]] && continue
      [[ -z "$check_home" || ! -d "$check_home" ]] && continue
      check_ak="${check_home}/.ssh/authorized_keys"
      [[ -f "$check_ak" ]] || continue
      while IFS= read -r check_fp; do
        [[ -z "$check_fp" ]] && continue
        if printf '%s\n' "$OPACC_THEIR_FPS" | grep -qx -- "$check_fp"; then
          echo "  FAIL ${check_name} still authorizes their key: ${check_fp}" >&2
          leftover=1
        fi
      done < <(ssh-keygen -l -f "$check_ak" 2>/dev/null | awk '{print $2}' || true)
    done < <(getent passwd)
    if (( leftover )); then
      offboard_failed=1
    else
      echo "  OK   no account on this host authorizes any key of theirs"
    fi
  fi

  if (( offboard_failed )); then
    echo "ERROR: ${OPACC_ACCOUNT} is not fully disabled. Do not record this" >&2
    echo "       offboarding as done." >&2
    exit 1
  fi

  echo "  ${OPACC_ACCOUNT} can no longer log in. Home directory and file"
  echo "  ownership are intact, deliberately: that is what a review reads."
  exit 0
fi

if [[ "$OPACC_MODE" != "create" && "$OPACC_MODE" != "rotate" ]]; then
  echo "ERROR: OPACC_MODE must be create, rotate, remove or offboard; got '${OPACC_MODE}'." >&2
  exit 2
fi
if [[ -z "$OPACC_KEY_LINE" ]]; then
  echo "ERROR: ${OPACC_MODE} needs a key line in the pipe." >&2
  exit 2
fi
# A password is required whenever one is to be set, which is every create and
# every rotation except the key-only one. The key-only rotation sends an empty
# password on purpose, with OPACC_SET_PASSWORD=no, and must not be refused for
# lacking the value it deliberately does not carry.
if [[ "${OPACC_SET_PASSWORD:-yes}" == "yes" || "$OPACC_MODE" == "create" ]] \
   && [[ -z "$OPACC_PASSWORD" ]]; then
  echo "ERROR: ${OPACC_MODE} needs a password in the pipe." >&2
  exit 2
fi
# The shared account's keys are never replaced here. Several holders' keys sit
# on it, and the install below writes authorized_keys whole with the one key it
# was given, so every other holder's way in would go with it. The caller refuses
# this first; this is the fail-closed copy for a pipe that arrives without it.
if [[ -n "${OPACC_SHARED_ACCOUNT:-}" && "$OPACC_ACCOUNT" == "$OPACC_SHARED_ACCOUNT" ]]; then
  echo "REFUSING: ${OPACC_ACCOUNT} is the shared account; its keys are added and" >&2
  echo "       removed one at a time with authorize-operator-key.sh, never replaced" >&2
  echo "       whole. Nothing done." >&2
  exit 1
fi

# A named account never takes a key the shared account already authorizes.
# Offboarding a named account sweeps its keys off every account on the host, so
# a key shared between the two would take the shared account's way in with it
# the day the named account is retired. Checked before anything is created or
# installed, so a refusal leaves the host exactly as it was.
if [[ "$OPACC_ACCOUNT" != "$OPACC_SHARED_ACCOUNT" ]]; then
  opacc_require_shared_account
  opacc_key_tmp=$(umask 077 && mktemp)
  OPACC_TMPS+=("$opacc_key_tmp")
  printf '%s\n' "$OPACC_KEY_LINE" > "$opacc_key_tmp"
  opacc_new_fp="$(ssh-keygen -l -f "$opacc_key_tmp" 2>/dev/null | awk '{print $2}' || true)"
  if [[ -n "$opacc_new_fp" ]] \
      && opacc_shared_fingerprints | grep -qxF -- "$opacc_new_fp"; then
    echo "REFUSING: the key offered for ${OPACC_ACCOUNT} (${opacc_new_fp}) is already" >&2
    echo "       authorized on the shared account ${OPACC_SHARED_ACCOUNT}. A named account" >&2
    echo "       needs a key pair of its own: retiring ${OPACC_ACCOUNT} later sweeps its" >&2
    echo "       keys off every account, so a shared key would end the way into" >&2
    echo "       ${OPACC_SHARED_ACCOUNT} too. Make a new key pair for this account and" >&2
    echo "       re-run with it. Nothing done." >&2
    exit 1
  fi
fi

# Reopening a retired account is a rehire of the same person, and it takes a
# key pair made fresh for it. A key the account was retired with is refused: the
# retirement ended that key's access, and reinstating it would undo the firing
# for whoever still holds the private half. Read from the keys the offboard
# moved aside, which is the one record of them no script-unreadable vault holds.
if [[ "${OPACC_REOPEN:-no}" == "yes" ]]; then
  if [[ "$OPACC_MODE" != "rotate" ]]; then
    echo "ERROR: reopening applies to an existing account, so it needs rotate mode." >&2
    exit 2
  fi
  reopen_home="$(getent passwd "$OPACC_ACCOUNT" | cut -d: -f6 || true)"
  for reopen_retired in "${reopen_home}"/.ssh/authorized_keys.offboarded-*; do
    [[ -f "$reopen_retired" ]] || continue
    if ssh-keygen -l -f "$reopen_retired" 2>/dev/null | awk '{print $2}' \
        | grep -qxF -- "${opacc_new_fp:-}"; then
      echo "REFUSING: ${opacc_new_fp} is a key ${OPACC_ACCOUNT} was retired with." >&2
      echo "       A rehire takes a key pair made fresh for it. Nothing done." >&2
      exit 1
    fi
  done
fi


# That the group exists is not that it carries sudo. A host whose sudoers has
# been edited can have a wheel group with no rule behind it, and the account
# would then be created looking correct and be unable to do the one thing it is
# for.
if ! grep -Rqs -- "^[[:space:]]*%${SUDO_GROUP}[[:space:]]" /etc/sudoers /etc/sudoers.d/; then
  echo "ERROR: group '${SUDO_GROUP}' exists but no sudoers rule grants it anything." >&2
  echo "       Creating the account would produce a login that cannot sudo." >&2
  echo "       Fix the sudoers rule first. Nothing done." >&2
  exit 1
fi

# ── Will sshd admit this name at all ─────────────────────────────────────────
#
# Checked before the account is created, not after the operator reports a
# failure. An AllowUsers or AllowGroups list that does not name the account
# makes sshd refuse the login while everything else on the host looks right,
# and the error it returns is indistinguishable from a bad key.
SSHD_EFFECTIVE=""
if ! SSHD_EFFECTIVE="$(sshd -T 2>/dev/null)"; then
  echo "  WARNING: could not read the effective sshd config (sshd -T failed)." >&2
  echo "  Check AllowUsers/AllowGroups by hand before reporting this account ready," >&2
  echo "  and check that password authentication is off before trusting the" >&2
  echo "  password this run is about to set." >&2
else
  allow_users="$(printf '%s\n' "$SSHD_EFFECTIVE" | sed -n 's/^allowusers //p')"
  allow_groups="$(printf '%s\n' "$SSHD_EFFECTIVE" | sed -n 's/^allowgroups //p')"
  deny_users="$(printf '%s\n' "$SSHD_EFFECTIVE" | sed -n 's/^denyusers //p')"

  if [[ -n "$deny_users" ]] && printf '%s\n' $deny_users | grep -qx -- "$OPACC_ACCOUNT"; then
    echo "ERROR: sshd's DenyUsers names ${OPACC_ACCOUNT}, so it could not log in." >&2
    echo "       Nothing done." >&2
    exit 1
  fi
  if [[ -n "$allow_users" ]] && ! printf '%s\n' $allow_users | grep -qx -- "$OPACC_ACCOUNT"; then
    echo "ERROR: sshd has an AllowUsers list and ${OPACC_ACCOUNT} is not on it:" >&2
    echo "         ${allow_users}" >&2
    echo "       The account would be created and then refused at login, which" >&2
    echo "       looks exactly like a bad key. Add the name to AllowUsers in" >&2
    echo "       /etc/ssh/sshd_config, reload sshd, then re-run. Nothing done." >&2
    exit 1
  fi
  if [[ -n "$allow_groups" ]] && ! printf '%s\n' $allow_groups | grep -qx -- "$SUDO_GROUP"; then
    echo "ERROR: sshd has an AllowGroups list that does not carry '${SUDO_GROUP}':" >&2
    echo "         ${allow_groups}" >&2
    echo "       The new account's groups would not satisfy it and the login" >&2
    echo "       would be refused. Fix sshd_config first. Nothing done." >&2
    exit 1
  fi

  # A different question from the three above, asked here because this is the
  # last place it can be asked before a password exists. This script mints a
  # real password for the account. Where sshd accepts password authentication,
  # that value stops being a local sudo secret and becomes a remote login
  # credential as well, so one guessed password is a shell rather than a failed
  # sudo. Nobody provisioning an operator account intends that, and nothing
  # afterwards reports it: the account works, the key works, and the extra way
  # in is invisible until someone finds it.
  password_auth="$(printf '%s\n' "$SSHD_EFFECTIVE" | sed -n 's/^passwordauthentication //p')"
  if [[ "$password_auth" == "yes" ]]; then
    echo "ERROR: sshd accepts password authentication on this host." >&2
    echo "       This script sets a password on ${OPACC_ACCOUNT}, which would" >&2
    echo "       then admit anyone who guesses it over SSH as well as unlocking" >&2
    echo "       sudo. Set 'PasswordAuthentication no', reload sshd, and re-run." >&2
    echo "       Nothing done." >&2
    exit 1
  fi
fi

# ── Create or rotate ─────────────────────────────────────────────────────────
if [[ "$OPACC_MODE" == "create" ]]; then
  if id -u -- "$OPACC_ACCOUNT" >/dev/null 2>&1; then
    echo "ERROR: ${OPACC_ACCOUNT} already exists; the caller should have caught this." >&2
    exit 1
  fi
  useradd -m -G "$SUDO_GROUP" -c "$OPACC_OPERATOR" -- "$OPACC_ACCOUNT"
  echo "  Created ${OPACC_ACCOUNT}, member of ${SUDO_GROUP}."
else
  if ! id -u -- "$OPACC_ACCOUNT" >/dev/null 2>&1; then
    echo "ERROR: ${OPACC_ACCOUNT} does not exist; nothing to rotate." >&2
    exit 1
  fi
  usermod -aG "$SUDO_GROUP" -- "$OPACC_ACCOUNT"
  echo "  ${OPACC_ACCOUNT} exists; reinstalling key and replacing password."
  if [[ "${OPACC_REOPEN:-no}" == "yes" ]]; then
    # What the offboard changed besides the keys and the password: the login
    # shell and the expiry. The shell is the one useradd gives a new account.
    reopen_shell="$(useradd -D 2>/dev/null | sed -n 's/^SHELL=//p')"
    usermod -s "${reopen_shell:-/bin/bash}" -- "$OPACC_ACCOUNT"
    chage -E -1 -- "$OPACC_ACCOUNT"
    echo "  Reopened the retired account: login shell ${reopen_shell:-/bin/bash}, expiry cleared."
  fi
fi

# The deploy reads the running schema by exec-ing into the web container, and
# that is the one step it takes without elevation, so it needs the container
# runtime group rather than sudo. An operator outside it gets an empty read, the
# schema-drift check takes its unreachable branch, and the deploy warns and
# proceeds: a guard that cannot fire, whose silence reads as agreement. The
# group is absent on a host that has not been brought up yet, which is not an
# error here.
if getent group docker >/dev/null 2>&1; then
  usermod -aG docker -- "$OPACC_ACCOUNT"
  echo "  ${OPACC_ACCOUNT} added to docker, which the deploy's schema-drift check reads through."
else
  echo "  NOTE: no docker group on this host; the deploy's schema-drift check will not run" >&2
  echo "        for ${OPACC_ACCOUNT} until there is one." >&2
fi

HOME_DIR="$(getent passwd "$OPACC_ACCOUNT" | cut -d: -f6)"
if [[ -z "$HOME_DIR" ]]; then
  echo "ERROR: ${OPACC_ACCOUNT} has no home directory in passwd." >&2
  exit 1
fi
PRIMARY_GROUP="$(id -gn -- "$OPACC_ACCOUNT")"

install -d -m 700 -o "$OPACC_ACCOUNT" -g "$PRIMARY_GROUP" "${HOME_DIR}/.ssh"
printf '%s\n' "$OPACC_KEY_LINE" \
  | install_via_tmp "${HOME_DIR}/.ssh/authorized_keys" 600 "$OPACC_ACCOUNT" "$PRIMARY_GROUP"
echo "  Installed authorized_keys."

# A key-only rotation replaces the authorized key and touches nothing else. It
# exists because the two credentials fail independently: a lost or compromised
# private key says nothing about the password, and making somebody take a new
# password to replace a key is a cost with no security content. It also has a
# property the ordinary rotation does not -- the operator's standing password
# survives, so there is no one-time value to hand over and no first-login
# ceremony. Their vault entry still changes, because the fingerprint in it is
# now wrong, which is why the caller still demands VAULTED.
if [[ "${OPACC_SET_PASSWORD:-yes}" != "yes" ]]; then
  echo "  Key replaced; the password was not touched."
else

# The password travels in a pipe. `chpasswd` takes it on stdin precisely so it
# never has to appear on a command line.
printf '%s:%s\n' "$OPACC_ACCOUNT" "$OPACC_PASSWORD" | chpasswd

# Expired the moment it is set, so it is a one-time value rather than the
# account's standing password. The operator changes it at first login and from
# then on is the only person who knows it, including whoever provisioned the
# account for them.
#
# This is what keeps a per-person account attributable. The governance rule is
# that the vault records who holds access and never their personal credential,
# because a personal credential in a shared vault lets any custodian act as any
# operator, and an access record that can be true of more than one person
# records nothing. A minted password that stays valid is exactly that credential
# whatever is done with the copy afterwards; expiring it is what makes the
# standing secret the operator's alone.
if [[ "${OPACC_EXPIRE_PASSWORD:-yes}" == "yes" ]]; then
  chage -d 0 -- "$OPACC_ACCOUNT"
  echo "  Set a one-time password; it must be changed at first login."
else
  # The account's own owner typed this one, so it is already the personal
  # credential the rule above is protecting. Expiring it would force them to
  # invent a second password minutes later, and would leave the account
  # depending on a change prompt appearing at the right moment -- on a host
  # where they may be the only person able to log in at all.
  echo "  Set the password the operator chose; it is theirs and does not expire."
fi
fi

# ── Verify the outcome, not the invocation ───────────────────────────────────
#
# Every check below asserts something the operator would otherwise discover as a
# failed login or a failed sudo. What none of them can prove is that the person
# holding the private key can connect: that needs their key, which is on their
# machine and nowhere else, so it stays their verification step rather than a
# claim made here.
echo
echo "  === Verification ==="
FAILED=0

if id -nG -- "$OPACC_ACCOUNT" | tr ' ' '\n' | grep -qx -- "$SUDO_GROUP"; then
  echo "  OK   member of ${SUDO_GROUP}"
else
  echo "  FAIL not a member of ${SUDO_GROUP}" >&2
  FAILED=1
fi

# Field 2 of `passwd -S` is the status, and the two families spell it
# differently: shadow-utils on Debian-family images reports P for a usable
# password, L locked, NP none, while the RHEL family, which includes the Amazon
# Linux images this project runs, reports PS, LK and NP. Accepting only the
# Debian spelling makes this check fail on every host it was written for, and
# the account it just created is then torn down as unready when it was fine.
# A locked or empty account is the real failure: it accepts the key and then
# refuses every sudo, which is what this whole script exists to prevent.
PW_STATUS="$(passwd -S -- "$OPACC_ACCOUNT" 2>/dev/null | cut -d' ' -f2 || echo '?')"
case "$PW_STATUS" in
  P|PS)
    echo "  OK   password set and usable (${PW_STATUS})"
    # Expiry is checked separately because a set password and a password the
    # operator has been forced to replace are different claims, and only the
    # second one makes the standing secret theirs alone.
    # LC_ALL=C for the same reason as the expiry read above: this compares
    # against chage's English wording, and the operator's locale travels here
    # over ssh. Without it a correct account fails verification, and in rotate
    # mode that failure used to reach a cleanup branch that deleted it.
    PW_CHANGED="$(LC_ALL=C chage -l -- "$OPACC_ACCOUNT" 2>/dev/null \
      | sed -n 's/^Last password change[^:]*: *//p')"
    if [[ "${OPACC_SET_PASSWORD:-yes}" != "yes" ]]; then
      # Nothing was set, so neither assertion below applies: whether this
      # password is expired is the operator's own business and was already
      # decided before this run. Asserting either way would fail a correct
      # key-only rotation against an account whose owner has never logged in.
      # The usable status above is still checked, because it proves the key
      # swap did not leave an account that accepts the new key and then
      # refuses every sudo.
      echo "  OK   password untouched by this run, as --key-only requires"
    elif [[ "${OPACC_EXPIRE_PASSWORD:-yes}" == "yes" ]]; then
      if [[ "$PW_CHANGED" == "password must be changed" ]]; then
        echo "  OK   password expired on set, so first login must replace it"
      else
        echo "  FAIL password is not expired, so the minted value would stand" >&2
        FAILED=1
      fi
    else
      # The opposite assertion, and it is worth making rather than skipping: an
      # expired password here would send the operator to a change prompt for a
      # password they had just chosen, and if that prompt did not appear they
      # would be unable to sudo on a host where they may be the only account.
      if [[ "$PW_CHANGED" == "password must be changed" ]]; then
        echo "  FAIL password is expired, but the operator chose it themselves" >&2
        FAILED=1
      else
        echo "  OK   password set and not expired; it is the operator's own"
      fi
    fi
    ;;
  *)
    echo "  FAIL password status is '${PW_STATUS}'; expected a set password" >&2
    echo "       (P on Debian-family, PS on RHEL-family; LK/L is locked, NP none)" >&2
    FAILED=1
    ;;
esac

LOGIN_SHELL="$(getent passwd "$OPACC_ACCOUNT" | cut -d: -f7)"
case "$LOGIN_SHELL" in
  */nologin|*/false|"")
    echo "  FAIL login shell is '${LOGIN_SHELL}'" >&2
    FAILED=1
    ;;
  *)
    echo "  OK   login shell ${LOGIN_SHELL}"
    ;;
esac

# An expired account refuses every login whatever its key and password, which
# is how an offboard leaves one. LC_ALL=C as for the password read above.
ACCOUNT_EXPIRES="$(LC_ALL=C chage -l -- "$OPACC_ACCOUNT" 2>/dev/null \
  | sed -n 's/^Account expires[^:]*: *//p')"
if [[ "$ACCOUNT_EXPIRES" == "never" ]]; then
  echo "  OK   account does not expire"
else
  echo "  FAIL account expires '${ACCOUNT_EXPIRES:-unreadable}', so it cannot log in" >&2
  FAILED=1
fi

AK="${HOME_DIR}/.ssh/authorized_keys"
AK_MODE="$(stat -c '%a' "$AK" 2>/dev/null || echo '')"
AK_OWNER="$(stat -c '%U' "$AK" 2>/dev/null || echo '')"
if [[ "$AK_MODE" == "600" && "$AK_OWNER" == "$OPACC_ACCOUNT" ]]; then
  echo "  OK   authorized_keys mode 600, owned by ${OPACC_ACCOUNT}"
else
  # sshd silently ignores an authorized_keys file it considers unsafe, and the
  # login then fails as publickey with nothing in the account's own logs.
  echo "  FAIL authorized_keys is mode '${AK_MODE}' owned by '${AK_OWNER}'" >&2
  FAILED=1
fi

if INSTALLED_FP="$(ssh-keygen -l -f "$AK" 2>/dev/null)"; then
  echo "  OK   key on the host: ${INSTALLED_FP}"
else
  echo "  FAIL sshd will not be able to parse the installed key" >&2
  FAILED=1
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo >&2
  echo "  One or more checks failed. The account is NOT ready." >&2
  exit 1
fi

echo "  All checks passed."
